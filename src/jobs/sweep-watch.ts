import { pool } from '../db.js';
import { getSolLamports, getSplAmount } from '../solana/rpc.js';

/**
 * A sweep can stall on one address while the job itself keeps running: a rejected
 * transfer only ever becomes a return value, and runSweep refreshes last_swept_at
 * before it even tries, so the failing address also drops to the back of the queue.
 * Nothing notices. This reads the live balance of addresses with no confirmed
 * sweep for a while and shouts if coins are still sitting there.
 * Logs only; never moves funds.
 */
const STALL_MIN = 360;
const USDC_MINT = process.env.USDC_MINT ?? '';
const RENT_EXEMPT = 2_039_280n;
const FEE_HEADROOM = 50_000n;
const MIN_SOL = 1_000_000n;
const LIMIT = 40;
const CONCURRENCY = 4;
const RELOG_MS = 6 * 60 * 60 * 1000;

const LOGGED = new Map<string, number>();

export async function watchSweepStalls(): Promise<void> {
  const { rows } = await pool.query<{ id: string; a: string }>(
    `select id, privy_address a from users
      where privy_address is not null
        and not exists (
          select 1 from sweeps s
           where s.deposit_address = users.privy_address
             and s.status = 'confirmed'
             and s.confirmed_at > now() - ($1 || ' minutes')::interval)
      order by last_swept_at nulls first
      limit $2`,
    [STALL_MIN, LIMIT],
  );
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(
      rows.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          const usdc = await getSplAmount(row.a, USDC_MINT);
          const lamports = await getSolLamports(row.a);
          const sweepableSol = lamports - RENT_EXEMPT - FEE_HEADROOM;
          if (usdc <= 0n && sweepableSol < MIN_SOL) return;
          if (Date.now() - (LOGGED.get(row.a) ?? 0) < RELOG_MS) return;
          LOGGED.set(row.a, Date.now());
          console.error('sweep-watch: STALLED', row.id, row.a,
            'usdc', usdc.toString(), 'sol', sweepableSol.toString());
        } catch (e) {
          console.error('sweep-watch', row.a, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
}
