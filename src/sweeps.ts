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

function keypairForIndex(index: number): Keypair {
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

async function inFlight(address: string, c: Connection): Promise<boolean> {
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
    const st = await c.getSignatureStatus(row.signature, { searchTransactionHistory: true });
    const cs = st?.value?.confirmationStatus;
    if (cs === 'confirmed' || cs === 'finalized') {
      await mark(row.id, 'confirmed');
      return true;
    }
  }

  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > STALE_MS) {
    await mark(row.id, 'failed', 'stale_unconfirmed');
    return false;
  }
  return true;
}

async function submit(
  address: string,
  asset: string,
  amountRaw: bigint,
  destination: PublicKey,
  tx: Transaction,
  kp: Keypair,
  c: Connection,
  blockhash: string,
  lastValidBlockHeight: number,
): Promise<Result> {
  tx.sign(kp);

  let sent: string;
  try {
    sent = await c.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { address, asset, status: 'failed', reason: msg.slice(0, 200) };
  }

  const { rows } = await pool.query(
    `insert into sweeps (deposit_address, asset, amount_raw, destination, signature, status, submitted_at)
     values ($1, $2, $3, $4, $5, 'submitted', now())
     on conflict do nothing
     returning id`,
    [address, asset, amountRaw.toString(), destination.toBase58(), sent],
  );
  const id: number | null = rows[0]?.id ?? null;

  try {
    await c.confirmTransaction({ signature: sent, blockhash, lastValidBlockHeight }, 'confirmed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'confirm_failed';
    if (id) await mark(id, 'failed', msg.slice(0, 400));
    return { address, asset, status: 'failed', reason: 'confirm_failed', signature: sent };
  }

  if (id) await mark(id, 'confirmed');
  return { address, asset, status: 'confirmed', amountRaw: amountRaw.toString(), signature: sent };
}

async function sweepUsdc(
  address: string,
  kp: Keypair,
  destination: PublicKey,
  c: Connection,
  dryRun: boolean,
): Promise<Result> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, kp.publicKey);

  let amount = 0n;
  try {
    amount = BigInt((await getAccount(c, ata)).amount);
  } catch {
    return { address, asset: 'USDC', status: 'skipped', reason: 'no_ata' };
  }
  if (amount === 0n) return { address, asset: 'USDC', status: 'skipped', reason: 'zero' };

  const destAta = await getOrCreateAssociatedTokenAccount(c, kp, USDC_MINT, destination);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    createTransferCheckedInstruction(
      ata,
      USDC_MINT,
      destAta.address,
      kp.publicKey,
      amount,
      USDC_DECIMALS,
    ),
  );
  tx.feePayer = kp.publicKey;

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  const sim = await c.simulateTransaction(tx);
  if (sim.value.err) {
    return {
      address, asset: 'USDC', status: 'failed',
      reason: `sim:${JSON.stringify(sim.value.err)}`.slice(0, 200),
    };
  }

  if (dryRun) return { address, asset: 'USDC', status: 'dry_run', amountRaw: amount.toString() };

  return submit(address, 'USDC', amount, destination, tx, kp, c, blockhash, lastValidBlockHeight);
}

async function sweepSol(
  address: string,
  kp: Keypair,
  destination: PublicKey,
  c: Connection,
  dryRun: boolean,
  reserveExtra: bigint,
): Promise<Result> {
  const bal = BigInt(await c.getBalance(kp.publicKey, 'confirmed'));
  const sweepable = bal - RENT_EXEMPT - FEE_HEADROOM - reserveExtra;

  if (sweepable < MIN_SWEEP_LAMPORTS) {
    return { address, asset: 'SOL', status: 'skipped', reason: `below_min:${sweepable}` };
  }

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: destination,
      lamports: sweepable,
    }),
  );
  tx.feePayer = kp.publicKey;

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  const sim = await c.simulateTransaction(tx);
  if (sim.value.err) {
    return {
      address, asset: 'SOL', status: 'failed',
      reason: `sim:${JSON.stringify(sim.value.err)}`.slice(0, 200),
    };
  }

  if (dryRun) return { address, asset: 'SOL', status: 'dry_run', amountRaw: sweepable.toString() };

  return submit(address, 'SOL', sweepable, destination, tx, kp, c, blockhash, lastValidBlockHeight);
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
  index: number,
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

    if (await inFlight(address, c)) {
      return [{ address, asset: '-', status: 'already_in_flight' }];
    }

    const kp = keypairForIndex(index);
    if (kp.publicKey.toBase58() !== address) {
      return [{ address, asset: '-', status: 'derive_mismatch' }];
    }

    const out: Result[] = [];
    out.push(await sweepUsdc(address, kp, destination, c, dryRun));
    out.push(await sweepSol(address, kp, destination, c, dryRun, reserveExtra));
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
    `select privy_address as deposit_address, deposit_index
       from users
      where privy_address is not null
      order by deposit_index
      limit $1`,
    [Math.min(opts.limit, 200)],
  );

  const results: Result[] = [];
  for (const r of rows) {
    const batch = await sweepAddress(
      r.deposit_address, r.deposit_index, destination, c, opts.dryRun, reserveExtra,
    );
    results.push(...batch);
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