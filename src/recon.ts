import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { pool, one } from './db.js';
import { usdMicro } from './solana/match.js';
import { sweepDestination } from './sweeps.js';
import { solPriceMicro } from './price.js';

export const DRIFT_FREEZE_USD = 1_000_000n;

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

export async function freezeLevel(): Promise<number> {
  const r = await one<{ value: string }>(
    `select value from system_state where key = 'freeze_level'`,
  );
  return Number(r?.value ?? 0);
}

export async function setFreeze(level: number, actor: string): Promise<void> {
  await pool.query(
    `update system_state set value = $1, updated_at = now() where key = 'freeze_level'`,
    [String(level)],
  );
  await pool.query(
    `insert into system_state (key, value) values ('freeze_actor', $1)
     on conflict (key) do update set value = $1, updated_at = now()`,
    [actor],
  );
}

export type Verdict = 'ok' | 'surplus' | 'drift' | 'insolvent';

export function verdictFor(margin: bigint, drift: bigint): Verdict {
  if (margin < 0n) return 'insolvent';
  if (drift < -DRIFT_FREEZE_USD) return 'drift';
  if (drift > DRIFT_FREEZE_USD) return 'surplus';
  return 'ok';
}

export async function chainTotals() {
  const c = new Connection(process.env.RPC_URL!, 'confirmed');
  const { rows } = await pool.query<{ deposit_addr: string }>(
    'select deposit_addr from users where deposit_addr is not null limit 1000',
  );

  const addrs = [...rows.map((r) => r.deposit_addr), sweepDestination().toBase58()];
  let sol = 0n;
  let usdc = 0n;

  for (const a of addrs) {
    const pk = new PublicKey(a);
    sol += BigInt(await c.getBalance(pk, 'confirmed').catch(() => 0));
    const ata = await getAssociatedTokenAddress(USDC_MINT, pk);
    try {
      usdc += BigInt((await getAccount(c, ata)).amount);
    } catch {
      // no token account
    }
  }

  return { sol, usdc };
}

export async function runRecon(actor = 'manual') {
  const price = await solPriceMicro();
  const chain = await chainTotals();
  const chainUsd = usdMicro('SOL', chain.sol, price) + chain.usdc;

  const led = await one<{ a: string; l: string; m: string }>(
    `select total_client_assets() a, total_liabilities() l, solvency_margin() m`,
  );
  const assets = BigInt(led.a);
  const liabilities = BigInt(led.l);
  const margin = BigInt(led.m);

  const stuckRow = await one<{ n: string }>(
    `select
       (select count(*) from deposits where status = 'detected') +
       (select count(*) from sweeps where status = 'failed') +
       (select count(*) from withdrawals where status = 'sending'
          and created_at < now() - interval '10 minutes') as n`,
  );
  const stuck = Number(stuckRow.n);

  const drift = chainUsd - assets;
  const verdict = verdictFor(margin, drift);

  await pool.query(
    `insert into recon_runs
       (chain_sol, chain_usdc, chain_usd, ledger_assets, liabilities, margin, drift, stuck, verdict)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      chain.sol.toString(), chain.usdc.toString(), chainUsd.toString(),
      assets.toString(), liabilities.toString(), margin.toString(),
      drift.toString(), stuck, verdict,
    ],
  );

  const current = await freezeLevel();
  if (verdict === 'insolvent' && current < 2) await setFreeze(2, `recon:${actor}`);
  else if (verdict === 'drift' && current < 1) await setFreeze(1, `recon:${actor}`);

  return {
    verdict,
    drift: drift.toString(),
    margin: margin.toString(),
    stuck,
    assets: assets.toString(),
    chainUsd: chainUsd.toString(),
  };
}

export async function latestRuns(limit = 20) {
  const { rows } = await pool.query(
    `select * from recon_runs order by id desc limit $1`,
    [limit],
  );
  return rows;
}