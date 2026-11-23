import { env } from './env.js';
import { pool } from './db.js';
import { quoteDeposit } from './privy.js';
import { ASSETS, CHAINS, MIN_USD, SOURCES, familyOfChain, isDirect } from './deposit-matrix.js';

export { MIN_USD };

const BATCH = 3;
const GAP = 200;
const PROBE = '50';
const USD_PROBE = 50;
let busy = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once(asset: string, chain: string, units: string) {
  const q = await quoteDeposit(asset, chain, units);
  if (q) return q;
  await sleep(600);
  return quoteDeposit(asset, chain, units);
}

/** Last known USDC-per-unit, so a re-probe can be sized in dollars. */
async function priorRate(asset: string, chain: string): Promise<number | null> {
  const r = await pool.query<{ rate: string | null }>(
    'select rate from deposit_routes where asset = $1 and chain = $2',
    [asset, chain],
  );
  const v = Number(r.rows[0]?.rate);
  return v > 0 ? v : null;
}

export async function refreshRoutes(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const pairs: [string, string][] = [];
    for (const s of SOURCES) pairs.push([s.asset, s.chain]);

    for (let i = 0; i < pairs.length; i += BATCH) {
      await Promise.all(
        pairs.slice(i, i + BATCH).map(async ([asset, chain]) => {
          const direct = isDirect(asset, chain);
          let viable = direct;
          let rate: number | null = direct ? 1 : null;
          let fee: number | null = direct ? 0 : null;

          if (!direct) {
            const prior = await priorRate(asset, chain);
            const probe = prior ? Math.max(USD_PROBE / prior, 0.000001).toFixed(6) : PROBE;
            const q = await once(asset, chain, probe);
            if (q) {
              viable = true;
              const inp = Number(q.input);
              const out = Number(q.output);
              if (prior) {
                rate = prior;
                const inUsd = inp * prior;
                if (inUsd > 0 && out > 0) {
                  const pct = ((inUsd - out) / inUsd) * 100;
                  fee = Math.min(Math.max(pct, -9999.9999), 9999.9999);
                }
              } else if (inp > 0) {
                rate = out / inp;
              }
            }
          }

          await pool.query(
            `insert into deposit_routes (asset, chain, symbol, network, family, fee_pct, rate, viable, checked_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, now())
             on conflict (asset, chain) do update
               set viable = excluded.viable, fee_pct = excluded.fee_pct,
                   rate = excluded.rate, checked_at = now()`,
            [asset, chain, ASSETS.find(([a]) => a === asset)![1], CHAINS[chain], familyOfChain(chain), fee, rate, viable],
          );
        }),
      );
      await sleep(GAP);
    }

    const keep = new Set(SOURCES.map((s) => `${s.asset}:${s.chain}`));
    const { rows: existing } = await pool.query<{ asset: string; chain: string }>(
      'select asset, chain from deposit_routes',
    );
    for (const r of existing) {
      if (keep.has(`${r.asset}:${r.chain}`)) continue;
      await pool.query('delete from deposit_routes where asset = $1 and chain = $2', [r.asset, r.chain]);
    }
  } finally {
    busy = false;
  }
}

export type Route = {
  asset: string; chain: string; symbol: string; network: string;
  family: string; fee_pct: string | null; rate: string | null;
};

export async function viableRoutes(): Promise<Route[]> {
  const { rows } = await pool.query<Route>(
    `select asset, chain, symbol, network, family, fee_pct, rate from deposit_routes
      where viable order by family, symbol, network`,
  );
  return rows;
}

/** Viable routes on sponsored chains. Invalid pairs never reach the create. */
export async function sponsoredSources(): Promise<{ asset: string; chain: string }[]> {
  const allowed = new Set(
    env.depositChains.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  );
  const { rows } = await pool.query<{ asset: string; chain: string }>(
    'select asset, chain from deposit_routes where viable order by family, symbol, network',
  );
  return allowed.size ? rows.filter((r) => allowed.has(r.chain)) : rows;
}
