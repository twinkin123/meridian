import { pool, tx } from './db.js';
import { post } from './ledger/post.js';

/** Minimum a held balance must reach before it becomes a real locked deposit. */
export const MIN_DEPOSIT = 10_000_000n;

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

export type CombineResult =
  | { state: 'nothing' }
  | { state: 'below_min'; held: bigint }
  | { state: 'combined'; amount: bigint };

/**
 * Held dust never becomes spendable directly. Once the held rows clear
 * MIN_DEPOSIT they are combined into the locked bucket with a fresh
 * 30-day clock, and only then can they be claimed and released.
 */
export async function combineHeld(userId: string): Promise<CombineResult> {
  return tx(async (c) => {
    const rows = await c.query<{ id: string; usd_at_det: string }>(
      `select id, usd_at_det from deposits
        where user_id = $1 and status = 'held' and released_at is null
        order by created_at for update`,
      [userId],
    );
    if (rows.rowCount === 0) return { state: 'nothing' };

    let total = 0n;
    for (const r of rows.rows) total += BigInt(r.usd_at_det);
    if (total <= 0n) return { state: 'nothing' };
    if (total < MIN_DEPOSIT) return { state: 'below_min', held: total };

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0)::text b from v_balance where user_id = $1 and code = '2050'`,
      [userId],
    );
    const held = BigInt(bal.rows[0]?.b ?? '0');
    if (held <= 0n) return { state: 'nothing' };

    const amount = total < held ? total : held;

    await c.query('select ensure_user_accounts($1)', [userId]);
    await post(c, 'HeldCombined', `combine:${userId}:${Date.now()}`, [
      { code: '2050', owner: userId, amount },
      { code: '2070', owner: userId, amount: -amount },
    ]);

    await c.query(
      `update deposits set status = 'locked', unlock_at = now() + interval '30 days'
        where id = any($1::uuid[]) and status = 'held'`,
      [rows.rows.map((r) => r.id)],
    );

    return { state: 'combined', amount };
  });
}
