import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { pool, one } from './db.js';
import { usdMicro } from './solana/match.js';
import { sweepDestination } from './sweeps.js';
import { solPriceMicro } from './price.js';
import { CHAINS as EVM_CHAINS, call as evmCall, hex as evmHex, pad as evmPad } from './jobs/evm-watch.js';

/** Drift alarm as a share of liabilities, in basis points. */
export const DRIFT_FREEZE_BP = BigInt(process.env.DRIFT_FREEZE_BP ?? '1000');
/** ...but never tighter than this, in micro-USD. */
export const DRIFT_FLOOR_USD = 25_000_000n;
/** Below this margin the platform is inside its warning band, in micro-USD. */

export const MARGIN_WARN_USD = BigInt(process.env.MARGIN_WARN_USD ?? '10000000');
/** Minimum gap between automatic recon runs. */
export const RECON_INTERVAL_MS = Number(process.env.RECON_INTERVAL_MS ?? 55 * 60 * 1000);

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

export async function freezeLevel(): Promise<number> {
  const r = await one<{ value: string }>(`select value from system_state where key = 'freeze_level'`);
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

export async function freezeActor(): Promise<string | null> {
  const r = await one<{ value: string }>(`select value from system_state where key = 'freeze_actor'`);
  return r?.value ?? null;
}

export type Verdict = 'ok' | 'surplus' | 'drift' | 'underbooked' | 'insolvent';

export function driftThreshold(liabilities: bigint): bigint {
  const scaled = (liabilities * DRIFT_FREEZE_BP) / 10000n;
  return scaled < DRIFT_FLOOR_USD ? DRIFT_FLOOR_USD : scaled;
}

export function verdictFor(margin: bigint, drift: bigint, liabilities = 0n, cover = margin): Verdict {
  if (cover < 0n) return 'insolvent';
  if (margin < 0n) return 'underbooked';
  const limit = driftThreshold(liabilities);
  if (drift < -limit) return 'drift';
  if (drift > limit) return 'surplus';
  return 'ok';
}

const EVM_SELECTOR = '0x70a08231';

/** USDC sitting on EVM deposit addresses, in micro-dollars. Native gas dust is ignored. */
export async function evmUsdcMicro(): Promise<bigint> {
  const { rows } = await pool.query<{ address: string }>(
    'select address from deposit_addresses where family = ' + "'evm'" + ' limit 2000',
  );
  if (rows.length === 0) return 0n;
  let total = 0n;
  for (const c of Object.values(EVM_CHAINS)) {
    if (!c.usdc) continue;
    const shift = 10n ** BigInt(Math.max((c.decimals ?? 6) - 6, 0));
    const parts = await Promise.all(
      rows.map(async (r) => {
        const raw = evmHex(
          await evmCall(c.rpc, 'eth_call', [{ to: c.usdc, data: EVM_SELECTOR + evmPad(r.address) }, 'latest']),
        );
        return raw && raw > 0n ? raw / shift : 0n;
      }),
    );
    for (const p of parts) total += p;
  }
  return total;
}

export function isValidAddress(a: string): boolean {
  try {
    new PublicKey(a);
    return true;
  } catch {
    return false;
  }
}

/** True when the last run is old enough, so a restart cannot skip or double a run. */
export async function reconDue(intervalMs = RECON_INTERVAL_MS): Promise<boolean> {
  const r = await one<{ last: string | null }>(`select max(created_at)::text last from recon_runs`);
  if (!r?.last) return true;
  return Date.now() - new Date(r.last).getTime() >= intervalMs;
}

export async function chainTotals() {
  const c = new Connection(process.env.RPC_URL!, 'confirmed');
  const { rows } = await pool.query<{ privy_address: string }>(
    'select privy_address from users where privy_address is not null limit 1000',
  );

  const addrs = [...rows.map((r) => r.privy_address), sweepDestination().toBase58()]
    .filter((a) => {
      const ok = isValidAddress(a);
      if (!ok) console.warn('recon: skipping invalid address', a);
      return ok;
    });

  let sol = 0n;
  const evm = await evmUsdcMicro();
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

  return { sol, usdc, evm };
}

export async function runRecon(actor = 'manual') {
  const price = await solPriceMicro();
  const chain = await chainTotals();
  const chainUsd = usdMicro('SOL', chain.sol, price) + chain.usdc + chain.evm;

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
  const cover = chainUsd - liabilities;
  const verdict = verdictFor(margin, drift, liabilities, cover);

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

  /* Levels are operator-set only. Recon records the level it would suggest and
     leaves system_state alone. */
  const limit = driftThreshold(liabilities);

  let next = 0;
  if (verdict === 'insolvent') next = 2;
  else if (verdict === 'drift' || cover < MARGIN_WARN_USD) next = 1;

  return {
    verdict,
    drift: drift.toString(),
    margin: margin.toString(),
    cover: cover.toString(),
    limit: limit.toString(),
    frozen: String(next),
    stuck,
    assets: assets.toString(),
    chainUsd: chainUsd.toString(),
  };
}

export async function latestRuns(limit = 20) {
  const { rows } = await pool.query(`select * from recon_runs order by id desc limit $1`, [limit]);
  return rows;
}