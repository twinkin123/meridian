import { pool, tx } from './db.js';
import { post } from './ledger/post.js';

/** User asks for a matured deposit to be released. */
export async function requestClaim(userId: string, depositId: string): Promise<string> {
  const r = await pool.query(
    `update deposits set claim_requested_at = now()
      where id = $1 and user_id = $2 and status = 'locked'
        and released_at is null and claim_requested_at is null
        and unlock_at <= now() returning id`,
    [depositId, userId],
  );
  if (r.rowCount === 0) return 'not_claimable';
  return 'requested';
}

/** Admin approves a claim; this is the only thing that moves the money. */
export async function approveClaim(depositId: string): Promise<boolean> {
  return tx(async (c) => {
    const d = await c.query<{ user_id: string; usd_at_det: string }>(
      `select user_id, usd_at_det from deposits
        where id = $1 and status = 'locked' and released_at is null
          and claim_requested_at is not null for update`,
      [depositId],
    );
    if (d.rowCount === 0) return false;

    const row = d.rows[0];
    const amount = BigInt(row.usd_at_det);
    if (amount <= 0n) return false;

    const done = await c.query(
      `update deposits set released_at = now(), status = 'credited'
        where id = $1 and released_at is null returning id`,
      [depositId],
    );
    if (done.rowCount === 0) return false;

    await c.query('select ensure_user_accounts($1)', [row.user_id]);
    await post(c, 'DepositUnlocked', `unlock:${depositId}`, [
      { code: '2070', owner: row.user_id, amount },
      { code: '2000', owner: row.user_id, amount: -amount },
    ]);
    return true;
  });
}