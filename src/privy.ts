import { PrivyClient } from '@privy-io/node';
import { env } from './env.js';
import { randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { one } from './db.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { ownerTokenDelta } from './solana/match.js';

let client: PrivyClient | null = null;

export function privyReady(): boolean {
  return Boolean(env.privyAppId && env.privyAppSecret && env.privyAuthKey);
}

function privy(): PrivyClient {
  if (!client) {
    if (!env.privyAppId || !env.privyAppSecret) throw new Error('privy_not_configured');
    client = new PrivyClient({ appId: env.privyAppId, appSecret: env.privyAppSecret });
  }
  return client;
}

function auth() {
  if (!env.privyAuthKey) throw new Error('privy_auth_key_missing');
  return { authorization_private_keys: [env.privyAuthKey] };
}

/** Key id published in /.well-known/jwks.json. Must match or Privy cannot verify. */
const KID = 'quvio-app-1';

/** PRIVY_AUTH_KEY as bare base64 PKCS8, tolerating PEM headers or escaped newlines. */
function authKeyB64(): string {
  const raw = env.privyAuthKey.replace(/\\n/g, '\n');
  return raw.includes('BEGIN') ? raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') : raw.trim();
}

/** Short-lived ES256 identity token, so the wallet's own user can authorize the request. */
async function mintUserJwt(privyUserId: string): Promise<string> {
  const b64 = authKeyB64();
  const pem = `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: KID })
    .setIssuer('quvio')
    .setSubject(privyUserId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(randomUUID())
    .sign(key);
}

/** App key plus the owning user's JWT; falls back to the app key alone. */
async function authFor(walletId: string) {
  const row = await one<{ id: string }>('select id from users where privy_wallet_id = $1', [walletId]);
  if (!row?.id) return auth();
  return { ...auth(), user_jwts: [await mintUserJwt(row.id)] };
}

function chain(): 'solana' | 'solana_devnet' {
  return env.privyNetwork === 'mainnet' ? 'solana' : 'solana_devnet';
}

/** Signed requests expire; always compute at call time, never at boot. */
function expiry(): number {
  return Date.now() + 600_000;
}

/** micro-USDC to the decimal string the API expects. */
export function usdc(micro: bigint): string {
  const whole = micro / 1000000n;
  const frac = (micro % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}.0`;
}

/** One deposit wallet per user, owned by that user's Privy user. */
export async function createDepositWallet(
  externalId?: string,
  privyUserId?: string,
): Promise<{ id: string; address: string }> {
  const api = privy().wallets() as unknown as {
    create: (body: unknown) => Promise<{ id?: string; address?: string }>;
  };
  const w = await api.create({
    chain_type: 'solana',
    ...(externalId ? { external_id: externalId } : {}),
    ...(privyUserId ? { owner: { user_id: privyUserId } } : {}),
  });
  if (!w.id || !w.address) throw new Error('privy_wallet_no_address');
  return { id: w.id, address: w.address };
}

/**
 * Sends USDC from the treasury wallet.
 * idempotencyKey must be stable per withdrawal (e.g. `withdraw:<id>`).
 */
export async function sendUsdc(
  to: string,
  micro: bigint,
  referenceId: string,
  idempotencyKey: string,
): Promise<string> {
  if (!env.privyTreasuryWalletId) throw new Error('privy_treasury_missing');
  const res = await privy().wallets().transfer(env.privyTreasuryWalletId, {
    amount: usdc(micro),
    amount_type: 'exact_input',
    source: { asset: 'usdc', chain: chain() },
    destination: { address: to },
    reference_id: referenceId.slice(0, 64),
    idempotency_key: idempotencyKey,
    request_expiry: expiry(),
    authorization_context: auth(),
  });
  if (!res.id) throw new Error('privy_transfer_no_id');
  return res.id;
}
const API = 'https://api.privy.io/v1';
/** Current state of a wallet action. Actions are scoped to their owning wallet. */
export async function getAction(walletId: string, actionId: string): Promise<string> {
  const r = await fetch(`${API}/wallets/${walletId}/actions/${actionId}`, {
    headers: { 'privy-app-id': env.privyAppId, Authorization: basic() },
  });
  if (!r.ok) throw new Error(`privy_action_${r.status}`);
  const j = (await r.json()) as { status?: string };
  return j.status ?? 'unknown';
}

/** Blocks until the action reaches a terminal state or the deadline passes. */
export async function waitForAction(
  walletId: string,
  actionId: string,
  timeoutMs = 120_000,
): Promise<'succeeded' | 'failed' | 'rejected' | 'timeout'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await getAction(walletId, actionId).catch(() => 'unknown');
    if (s === 'succeeded') return 'succeeded';
    if (s === 'failed' || s === 'rejected') return s;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return 'timeout';
}

/** On-chain signature for a settled action, when Privy reports one. */
export async function actionSig(actionId: string): Promise<string | null> {
  if (!env.privyTreasuryWalletId) return null;
  const r = await fetch(`${API}/wallets/${env.privyTreasuryWalletId}/actions/${actionId}`, {
    headers: { 'privy-app-id': env.privyAppId, Authorization: basic() },
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as
    | { transaction_hash?: string; output?: { transaction_hash?: string } }
    | null;
  return j?.transaction_hash ?? j?.output?.transaction_hash ?? null;
}
/** Treasury-scoped convenience wrapper, for payouts. */
export function waitForTreasuryAction(
  actionId: string,
  timeoutMs?: number,
): Promise<'succeeded' | 'failed' | 'rejected' | 'timeout'> {
  if (!env.privyTreasuryWalletId) throw new Error('privy_treasury_missing');
  return waitForAction(env.privyTreasuryWalletId, actionId, timeoutMs);
}

function basic(): string {
  return 'Basic ' + Buffer.from(`${env.privyAppId}:${env.privyAppSecret}`).toString('base64');
}



/** lamports to SOL decimal string. */
export function sol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}.0`;
}

export async function sendSol(
  to: string,
  lamports: bigint,
  referenceId: string,
  idempotencyKey: string,
): Promise<string> {
  if (!env.privyTreasuryWalletId) throw new Error('privy_treasury_missing');
  const res = await privy().wallets().transfer(env.privyTreasuryWalletId, {
    amount: sol(lamports),
    amount_type: 'exact_input',
    source: { asset: 'sol', chain: chain() },
    destination: { address: to },
    reference_id: referenceId.slice(0, 64),
    idempotency_key: idempotencyKey,
    request_expiry: expiry(),
    authorization_context: auth(),
  });
  if (!res.id) throw new Error('privy_transfer_no_id');
  return res.id;
}

type TransferAsset = 'usdc' | 'sol';

/** Transfers from any Privy-held wallet. Shared by payouts and sweeps. */
export async function transferFrom(
  walletId: string,
  asset: TransferAsset,
  amount: string,
  to: string,
  referenceId: string,
  idempotencyKey: string,
): Promise<string> {
  const res = await privy().wallets().transfer(walletId, {
    amount,
    amount_type: 'exact_input',
    source: { asset, chain: chain() },
    destination: { address: to },
    reference_id: referenceId.slice(0, 64),
    idempotency_key: idempotencyKey,
    request_expiry: expiry(),
    authorization_context: await authFor(walletId),
  });
  if (!res.id) throw new Error('privy_transfer_no_id');
  return res.id;
}

/** Moves a deposit wallet's balance to the treasury. */
export async function sweepFrom(
  walletId: string,
  asset: TransferAsset,
  micro: bigint,
  to: string,
  referenceId: string,
  idempotencyKey: string,
): Promise<string> {
  const amount = asset === 'usdc' ? usdc(micro) : sol(micro);
  return transferFrom(walletId, asset, amount, to, referenceId, idempotencyKey);
}

/** Imports an existing keypair so Privy takes custody of an address we already issued. */
export async function importSolanaWallet(
  address: string,
  secretKey: Uint8Array,
): Promise<{ id: string; address: string }> {
  const w = await privy().wallets().import({
    wallet: { private_key: secretKey, address, chain_type: 'solana', entropy_type: 'private-key' },
  });
  if (!w.id || !w.address) throw new Error('privy_import_failed');
  return { id: w.id, address: w.address };
}

let treasuryAddrCache: string | null = null;

/** On-chain address of the treasury wallet, resolved once. */
export async function treasuryOnchainAddress(): Promise<string> {
  if (treasuryAddrCache) return treasuryAddrCache;
  if (!env.privyTreasuryWalletId) throw new Error('privy_treasury_missing');
  const r = await fetch(`${API}/wallets/${env.privyTreasuryWalletId}`, {
    headers: { 'privy-app-id': env.privyAppId, Authorization: basic() },
  });
  if (!r.ok) throw new Error(`privy_wallet_${r.status}`);
  const j = (await r.json()) as { address?: string };
  if (!j.address) throw new Error('privy_wallet_no_address');
  treasuryAddrCache = j.address;
  return j.address;
}

/** Finds an existing wallet by our external_id (the user id). */
export async function findWalletByExternalId(
  externalId: string,
): Promise<{ id: string; address: string } | null> {
  const url = new URL(`${API}/wallets`);
  url.searchParams.set('chain_type', 'solana');
  url.searchParams.set('external_id', externalId);
  const r = await fetch(url, {
    headers: { 'privy-app-id': env.privyAppId, Authorization: basic() },
  });
  if (!r.ok) { console.error('privy', r.status, await r.text()); return null; }
  const j = (await r.json()) as { data?: { id: string; address: string; external_id?: string }[] };
  const rows = j.data ?? [];
  const w = rows.find((x) => x.external_id === externalId) ?? rows[0];
  return w ? { id: w.id, address: w.address } : null;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bounds how many transactions one lookup parses; the transfer is always recent. */
const MAX_PARSE = 10;

/** RPC reads here are best-effort, and a 429 must not read as "no such transfer". */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(250 * 2 ** i);
    }
  }
  throw last;
}

/**
 * Best-effort on-chain signature for a settled treasury transfer.
 * Privy's action resource carries no signature, so match the chain instead:
 * newest treasury transactions, first one paying `to` exactly `qty`.
 */
export async function findTransferSig(
  to: string,
  qty: bigint,
  asset: 'USDC' | 'SOL',
  sinceMs: number,
  skip?: Set<string>,
): Promise<string | null> {
  const rpc = process.env.RPC_URL;
  if (!rpc) return null;
  const from = await treasuryOnchainAddress().catch(() => null);
  if (!from) return null;
  const mint = process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  const c = new Connection(rpc, 'confirmed');
  const sigs = await withRetry(() =>
    c.getSignaturesForAddress(new PublicKey(from), { limit: 25 }),
  ).catch(() => []);

  let parsed = 0;
  for (const s of sigs) {
    if (parsed >= MAX_PARSE) break;
    if (s.err) continue;
    if (skip?.has(s.signature)) continue;
    // A just-sent transfer can come back with a null blockTime; treat it as fresh.
    if (s.blockTime && s.blockTime * 1000 < sinceMs - 180_000) continue;
    parsed++;
    const tx = await withRetry(() =>
      c.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }),
    ).catch(() => null);
    if (!tx?.meta) continue;

    let delta: bigint;
    if (asset === 'SOL') {
      const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
      const at = keys.indexOf(to);
      if (at === -1) continue;
      delta = BigInt(tx.meta.postBalances[at] ?? 0) - BigInt(tx.meta.preBalances[at] ?? 0);
    } else {
      delta = ownerTokenDelta(tx.meta, to, mint);
      if (delta === 0n) continue;
    }
    if (delta === qty) return s.signature;
  }
  return null;
}

export type DepositChains = Record<string, string>;

const familyOf = (c: string): string =>
  c === 'bitcoin' ? 'btc' : c === 'tron' ? 'tron' : c === 'solana' ? 'sol' : 'evm';

/** Issues deposit addresses, one per chain family, converted to USDC on the destination chain. */
export async function createCryptoDepositAccount(
  walletId: string,
  sources: { asset: string; chain: string }[],
): Promise<DepositChains> {
  const api = privy().wallets() as unknown as {
    depositAccounts: {
      crypto: {
        create: (id: string, body: unknown) => Promise<{
          deposit_accounts?: { deposit_address?: string; source?: { values?: { chain?: string }[] } }[];
        }>;
      };
    };
  };
  // Pairs come from the matrix, which mirrors Privy's own supported list.
  // Dedupe per pair; every EVM chain shares one address.
  const seen = new Set<string>();
  const filtered: { asset: string; chain: string }[] = [];
  for (const s of sources) {
    const k = `${s.asset}:${s.chain}`;
    if (seen.has(k)) continue;
    seen.add(k);
    filtered.push(s);
  }
  if (filtered.length === 0) filtered.push({ asset: 'usdc', chain: 'ethereum' });
  // One address comes back per family; every EVM chain shares the same one.

  const body: Record<string, unknown> = {
    type: 'inline_route',
    deposit_address_strategy: 'prefer_destination',
    source: { mode: 'include', values: filtered },
    destination: { asset: 'usdc', chain: chain() },
  };
  if (process.env.PRIVY_DEPOSIT_AUTHCTX !== 'off') {
    body.authorization_context = await authFor(walletId);
  }
  const res = await api.depositAccounts.crypto.create(walletId, body);
  const out: DepositChains = {};
  for (const a of res.deposit_accounts ?? []) {
    if (!a.deposit_address) continue;
    const c = a.source?.values?.[0]?.chain;
    if (!c) continue;
    out[familyOf(c)] = a.deposit_address;
  }
  if (Object.keys(out).length === 0) throw new Error('privy_deposit_no_address');
  return out;
}

/** Indicative conversion output. No wallet or signature needed. */
export async function quoteDeposit(
  asset: string,
  sourceChain: string,
  amount: string,
): Promise<{ input: string; output: string } | null> {
  const r = await fetch(`${API}/deposit_accounts/crypto/quote`, {
    method: 'POST',
    headers: { 'privy-app-id': env.privyAppId, Authorization: basic(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { chain: sourceChain, asset },
      destination: { chain: chain(), asset: 'usdc' },
      input_amount: amount,
    }),
  });
  if (!r.ok) { console.error('privy', r.status, await r.text()); return null; }
  const j = (await r.json()) as { input_amount?: string; estimated_output_amount?: string };
  if (!j.estimated_output_amount) return null;
  return { input: j.input_amount ?? amount, output: j.estimated_output_amount };
}

import { createPrivateKey, createPublicKey } from 'node:crypto';

let authPub: string | null = null;

/** P-256 public key for the app authorization key, base64 uncompressed point. */
export function authPublicKey(): string {
  if (authPub) return authPub;
  if (!env.privyAuthKey) throw new Error('privy_auth_key_missing');
  const raw = env.privyAuthKey.replace(/^wallet-auth:/, '').replace(/\\n/g, '\n');
  const key = createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' });
  authPub = spki.toString('base64');
  return authPub;
}

/** Makes the app authorization key the wallet's owner. */
export async function setWalletOwner(walletId: string): Promise<void> {
  const w = privy().wallets() as unknown as {
    update: (id: string, body: unknown) => Promise<unknown>;
  };
  await w.update(walletId, { owner: { public_key: authPublicKey() }, authorization_context: auth() });
}

/**
 * Privy user backing a deposit wallet. The crypto deposit API requires the
 * destination wallet to be owned by a single user, so every app user gets one.
 */
export async function createPrivyUser(userId: string, email: string | null): Promise<string> {
  const api = privy().users() as unknown as {
    create: (body: unknown) => Promise<{ id: string }>;
  };
  try {
    const u = await api.create({ linked_accounts: [{ type: 'custom_auth', custom_user_id: userId }] });
    if (!u.id) throw new Error('privy_user_no_id');
    return u.id;
  } catch {
    if (!email) throw new Error('privy_user_create_failed');
    const u = await api.create({ linked_accounts: [{ type: 'email', address: email }] });
    if (!u.id) throw new Error('privy_user_no_id');
    return u.id;
  }
}

/** Points a wallet at its owning Privy user, keeping the same address. */
export async function ownWallet(walletId: string, privyUserId: string): Promise<void> {
  const api = privy().wallets() as unknown as {
    update: (id: string, body: unknown) => Promise<unknown>;
  };
  await api.update(walletId, {
    owner: { user_id: privyUserId },
    authorization_context: auth(),
  });
}

