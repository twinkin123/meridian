import { notify, usdStr } from './notify.js';
import { tx } from './db.js';
import { post } from './ledger/post.js';

/**
 * Moves a user's unswept deposits out of reserve and into available balance.
 * Called once their address has actually been swept to the treasury, so nothing
 * becomes spendable before the coins are ours.
 */
export async function releaseUnswept(userId: string): Promise<bigint> {
  return tx(async (c) => {
    const rows = await c.query<{ id: string; usd_at_det: string }>(
      `select id, usd_at_det from deposits
        where user_id = $1 and status = 'unswept' and released_at is null
        order by created_at for update`,
      [userId],
    );
    if (rows.rowCount === 0) return 0n;

    let total = 0n;
    for (const r of rows.rows) total += BigInt(r.usd_at_det);

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0)::text b from v_balance where user_id = $1 and code = '2050'`,
      [userId],
    );
    const held = BigInt(bal.rows[0]?.b ?? '0');
    if (held <= 0n) return 0n;

    const amount = total < held ? total : held;
    await c.query('select ensure_user_accounts($1)', [userId]);
    await post(c, 'HeldCredited', `swept:${userId}:${Date.now()}`, [
      { code: '2050', owner: userId, amount },
      { code: '2000', owner: userId, amount: -amount },
    ]);
    await notify(c, userId, 'reserve_available',
      `${usdStr(amount)} USD cleared and added to your available balance.`);

    await c.query(
      `update deposits set status = 'credited', released_at = now()
        where id = any($1::uuid[]) and status = 'unswept'`,
      [rows.rows.map((r) => r.id)],
    );
    return amount;
  });
}