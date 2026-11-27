import { pool } from '../db.js';
import { payoutWithdrawal } from '../withdrawals.js';

/** A sending row older than this is presumed orphaned. */
const STALE_MINUTES = 10;

export type ResumeResult = { found: number; ok: number; failed: number };

/**
 * Resumes withdrawals stranded in 'sending' after a Privy action timed out.
 * payoutWithdrawal resolves the in-flight action from privy_action_id, and
 * falls back to a refund once its attempt budget is spent, except when the treasury
 * is short, where it leaves the row for the next tick.
 */
export async function resumeStuckWithdrawals(limit = 20): Promise<ResumeResult> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from withdrawals
      where status = 'sending' and created_at < now() - make_interval(mins => $2)
      order by created_at limit $1`,
    [limit, STALE_MINUTES],
  );

  let ok = 0;
  let failed = 0;

  for (const r of rows) {
    const out = await payoutWithdrawal(r.id).catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : 'resume_failed',
    }));
    if (out.ok) ok += 1;
    else failed += 1;
  }

  return { found: rows.length, ok, failed };
}