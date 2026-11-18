import { pool } from '../db.js';
import { ensureDay } from '../trades.js';
import { runDailyCredit } from './daily.js';

/**
 * The 24-hour settlement. The day row is guaranteed first so a frozen or
 * failed run still leaves a day, then the run rewrites it at the real rate.
 */
export async function runSettlement(): Promise<void> {
  const day = new Date();
  await ensureDay(day.toISOString().slice(0, 10));
  await runDailyCredit(day);
}

/** Catch-up for a restart that straddled 00:15 UTC. */
export async function runSettlementIfDue(): Promise<void> {
  const now = new Date();
  const boundary = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 15, 0, 0,
  );
  if (now.getTime() < boundary) return;
  const key = now.toISOString().slice(0, 10);
  const r = await pool.query('select 1 from credit_runs where day = $1', [key]);
  if (r.rowCount === 0) await runSettlement();
}