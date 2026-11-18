import { transferFrom, getAction, waitForAction, usdc, sol, treasuryOnchainAddress } from './privy.js';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import { mnemonicToSeedSync } from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import { pool } from './db.js';

const RENT_EXEMPT = 2_039_280n;        // system account + room for a USDC ATA
const FEE_HEADROOM = 50_000n;          // one tx with a priority fee
const MIN_SWEEP_LAMPORTS = 1_000_000n; // ignore dust under 0.001 SOL
const USDC_DECIMALS = 6;
const TREASURY_INDEX = 999_999;        // reserved, never issued as a deposit index
const STALE_MS = 10 * 60 * 1000;

export const BATCH = 20;

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

type Result = {
  address: string;
  asset: string;
  status: string;
  reason?: string;
  signature?: string;
  amountRaw?: string;
};

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}

function conn(): Connection {
  return new Connection(need('RPC_URL'), 'confirmed');
}

export function keypairForIndex(index: number): Keypair {
  const seed = Buffer.from(mnemonicToSeedSync(need('MASTER_MNEMONIC'))).toString('hex');
  const { key } = derivePath(`m/44'/501'/${index}'/0'`, seed);
  return Keypair.fromSeed(new Uint8Array(key));
}

export function treasuryKeypair(): Keypair {
  return keypairForIndex(TREASURY_INDEX);
}

export function sweepDestination(): PublicKey {
  const override = process.env.SWEEP_DESTINATION;
  if (override) return new PublicKey(override);
  return treasuryKeypair().publicKey;
}

export function treasuryAddress(): string {
  return sweepDestination().toBase58();
}

async function mark(id: number, status: string, error?: string): Promise<void> {
  await pool.query(
    `update sweeps
        set status = $2,
            error = $3,
            attempts = attempts + 1,
            confirmed_at = case when $2 = 'confirmed' then now() else confirmed_at end
      where id = $1`,
    [id, status, error ?? null],
  );
}

async function inFlight(address: string, walletId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select id, signature, created_at
       from sweeps
      where deposit_address = $1 and status in ('pending','submitted')
      order by id desc limit 1`,
    [address],
  );
  const row = rows[0];
  if (!row) return false;

  if (row.signature) {
    const st = await getAction(walletId, row.signature).catch(() => 'unknown');
    if (st === 'succeeded') {
      await mark(row.id, 'confirmed');
      return true;
    }
    if (st === 'failed' || st === 'rejected') {
      await mark(row.id, 'failed', `action_${st}`);
      return false;
    }
  }

  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > STALE_MS) {
    await mark(row.id, 'failed', 'stale_unconfirmed');
    return false;
  }
  return true;
}

async function submitPrivy(
  address: string,
  walletId: string,
  asset: 'USDC' | 'SOL',
  amountRaw: bigint,
  destination: string,
  dryRun: boolean,
): Promise<Result> {
  if (dryRun) return { address, asset, status: 'dry_run', amountRaw: amountRaw.toString() };

  let action: string;
  try {
    action = await transferFrom(
      walletId,
      asset === 'USDC' ? 'usdc' : 'sol',
      asset === 'USDC' ? usdc(amountRaw) : sol(amountRaw),
      destination,
      `sweep:${address}:${Date.now()}`,
      `sweep:${address}:${Date.now()}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { address, asset, status: 'failed', reason: msg.slice(0, 200) };
  }

  const { rows } = await pool.query(
    `insert into sweeps (deposit_address, asset, amount_raw, destination, signature, status, submitted_at)
     values ($1, $2, $3, $4, $5, 'submitted', now())
     on conflict do nothing
     returning id`,
    [address, asset, amountRaw.toString(), destination, action],
  );
  const id: number | null = rows[0]?.id ?? null;

  const settled = await waitForAction(walletId, action);
  if (settled === 'succeeded') {
    if (id) await mark(id, 'confirmed');
    return { address, asset, status: 'confirmed', amountRaw: amountRaw.toString(), signature: action };
  }
  if (settled === 'timeout') {
    return { address, asset, status: 'submitted', reason: 'pending', signature: action };
  }

  if (id) await mark(id, 'failed', `action_${settled}`);
  return { address, asset, status: 'failed', reason: `action_${settled}`, signature: action };
}

async function sweepUsdc(
  address: string,
  walletId: string,
  owner: PublicKey,
  destination: string,
  c: Connection,
  dryRun: boolean,
): Promise<Result> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);

  let amount = 0n;
  try {
    amount = BigInt((await getAccount(c, ata)).amount);
  } catch {
    return { address, asset: 'USDC', status: 'skipped', reason: 'no_ata' };
  }
  if (amount === 0n) return { address, asset: 'USDC', status: 'skipped', reason: 'zero' };

  if (!dryRun) await ensureFloat(owner, c, walletId);
  return submitPrivy(address, walletId, 'USDC', amount, destination, dryRun);
}

async function sweepSol(
  address: string,
  walletId: string,
  owner: PublicKey,
  destination: string,
  c: Connection,
  dryRun: boolean,
  reserveExtra: bigint,
): Promise<Result> {
  const bal = BigInt(await c.getBalance(owner, 'confirmed'));
  const sweepable = bal - RENT_EXEMPT - FEE_HEADROOM - reserveExtra;

  if (sweepable < MIN_SWEEP_LAMPORTS) {
    return { address, asset: 'SOL', status: 'skipped', reason: `below_min:${sweepable}` };
  }

  return submitPrivy(address, walletId, 'SOL', sweepable, destination, dryRun);
}

async function ensureTreasuryAta(c: Connection, destination: PublicKey): Promise<boolean> {
  try {
    await getOrCreateAssociatedTokenAccount(c, treasuryKeypair(), USDC_MINT, destination);
    return true;
  } catch {
    return false;
  }
}

async function sweepAddress(
  address: string,
  walletId: string,
  destination: PublicKey,
  c: Connection,
  dryRun: boolean,
  reserveExtra: bigint,
): Promise<Result[]> {
  const client = await pool.connect();
  try {
    const { rows: lock } = await client.query(
      'select pg_try_advisory_lock(hashtext($1)) as ok',
      [address],
    );
    if (!lock[0].ok) return [{ address, asset: '-', status: 'locked' }];

    if (await inFlight(address, walletId)) {
      return [{ address, asset: '-', status: 'already_in_flight' }];
    }

    if (!walletId) return [{ address, asset: '-', status: 'no_wallet' }];

    const owner = new PublicKey(address);
    const dest = destination.toBase58();

    const out: Result[] = [];
    for (const asset of ['USDC', 'SOL'] as const) {
      try {
        const r = asset === 'USDC'
          ? await sweepUsdc(address, walletId, owner, dest, c, dryRun)
          : await sweepSol(address, walletId, owner, dest, c, dryRun, reserveExtra);
        out.push(r);
      } catch (e) {
        const reason = e instanceof Error ? e.message.slice(0, 200) : String(e);
        out.push({ address, asset, status: 'failed', reason });
        if (!dryRun) {
          await pool.query(
            `insert into sweeps (deposit_address, asset, amount_raw, destination, status, error, submitted_at)
             values ($1, $2, '0', $3, 'failed', $4, now())`,
            [address, asset, dest, `address-level: ${reason}`],
          ).catch(() => {});
        }
      }
    }
    return out;
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [address]).catch(() => {});
    client.release();
  }
}

export async function runSweep(opts: { dryRun: boolean; limit: number }) {
  const c = conn();
  const destination = sweepDestination();
  const treasuryAtaReady = await ensureTreasuryAta(c, destination);
  const reserveExtra = treasuryAtaReady ? 0n : RENT_EXEMPT;

  const { rows } = await pool.query(
    `select privy_address as deposit_address, privy_wallet_id, id
       from users
      where privy_address is not null and privy_wallet_id is not null
      order by last_swept_at nulls first
      limit $1`,
    [Math.min(opts.limit, 200)],
  );

  const results: Result[] = [];
  for (const r of rows) {
    await pool.query('update users set last_swept_at = now() where id = $1', [r.id]).catch(() => {});
    try {
      const batch = await sweepAddress(
        r.deposit_address, r.privy_wallet_id, destination, c, opts.dryRun, reserveExtra,
      );
      results.push(...batch);
    } catch (e) {
      results.push({
        address: r.deposit_address,
        asset: '-',
        status: 'failed',
        reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  const confirmed = results.filter((r) => r.status === 'confirmed');
  const sum = (asset: string) =>
    confirmed
      .filter((r) => r.asset === asset)
      .reduce((a, r) => a + BigInt(r.amountRaw ?? 0), 0n)
      .toString();

  return {
    destination: destination.toBase58(),
    dryRun: opts.dryRun,
    scanned: rows.length,
    sweptCount: confirmed.length,
    sweptLamports: sum('SOL'),
    sweptUsdcRaw: sum('USDC'),
    results,
  };
}

/** Deposit wallets need SOL for the sweep fee; Privy takes it from the source. */
const SWEEP_FLOAT_LAMPORTS = 3_000_000n;
const SWEEP_FLOAT_TRIGGER = 1_000_000n;

async function ensureFloat(owner: PublicKey, c: Connection, walletId: string): Promise<void> {
  const bal = BigInt(await c.getBalance(owner, 'confirmed'));
  if (bal >= SWEEP_FLOAT_TRIGGER) return;

  const treasury = process.env.PRIVY_TREASURY_WALLET_ID;
  if (!treasury) throw new Error('privy_treasury_missing');

  const tbal = BigInt(await c.getBalance(new PublicKey(await treasuryOnchainAddress()), 'confirmed'));
  if (tbal < SWEEP_FLOAT_LAMPORTS) throw new Error('treasury_float_exhausted');

  await transferFrom(
    treasury,
    'sol',
    sol(SWEEP_FLOAT_LAMPORTS),
    owner.toBase58(),
    `float:${owner.toBase58()}:${Date.now()}`,
    `float:${owner.toBase58()}:${Date.now()}`,
  );

  // let it land before the fee is taken from the same wallet
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1_500));
    if (BigInt(await c.getBalance(owner, 'confirmed')) >= SWEEP_FLOAT_TRIGGER) return;
  }
}

/** Spendable balance on the wallet that actually pays withdrawals. */
export async function treasuryHeadroom(): Promise<{ usdc: bigint; sol: bigint }> {
  const c = conn();
  const owner = new PublicKey(await treasuryOnchainAddress());
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);
  const usdc = await getAccount(c, ata).then((x) => BigInt(x.amount)).catch(() => 0n);
  const sol = BigInt(await c.getBalance(owner, 'confirmed'));
  return { usdc, sol };
}

/** SWEEP_DESTINATION must always be the treasury wallet's own address. */
export async function assertSweepDestination(): Promise<void> {
  const onchain = await treasuryOnchainAddress();
  const dest = sweepDestination().toBase58();
  if (dest !== onchain) {
    throw new Error(`SWEEP_DESTINATION ${dest} is not the treasury ${onchain}`);
  }
}
