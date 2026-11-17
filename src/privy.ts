import { PrivyClient } from '@privy-io/node';
import { env } from './env.js';

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

/** One deposit wallet per user. No auth context: create takes only params. */
export async function createDepositWallet(externalId?: string): Promise<{ id: string; address: string }> {
  const w = await privy().wallets().create({
    chain_type: 'solana',
    ...(externalId ? { external_id: externalId } : {}),
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
    authorization_context: auth(),
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
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: { id: string; address: string; external_id?: string }[] };
  const rows = j.data ?? [];
  const w = rows.find((x) => x.external_id === externalId) ?? rows[0];
  return w ? { id: w.id, address: w.address } : null;
}
