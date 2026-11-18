import { pool } from '../db.js';
import { payoutWithdrawal } from '../withdrawals.js';

/** Rows younger than this are probably already being paid by the request handler. */
const SETTLE_SECONDS = 30;

export type PayResult = { found: number; ok: number; failed: number };

/**
 * Pays withdrawals left in 'approved'. Covers a restart, a Privy blip, or the
 * fire-and-forget call in the withdraw route dying with the response.
 */
export async function payApproved(limit = 10): Promise<PayResult> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from withdrawals
      where status = 'approved' and created_at < now() - make_interval(secs => $2)
      order by created_at limit $1`,
    [limit, SETTLE_SECONDS],
  );

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    const out = await payoutWithdrawal(r.id).catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : 'pay_failed',
    }));
    if (out.ok) ok += 1;
    else failed += 1;
  }
  return { found: rows.length, ok, failed };
}