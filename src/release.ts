import { notify, usdStr } from './notify.js';
import { pool, tx } from './db.js';
import { post } from './ledger/post.js';

/**
 * Moves a user's unswept deposits out of reserve and into available balance.
 * Called once their address has actually been swept to the treasury, so nothing
 * becomes spendable before the coins are ours.
 *
 * A row only clears when the confirmed sweep volume on the address covers every
 * deposit recorded against it. That comparison is cumulative, so it no longer
 * matters whether the sweep or the deposit row is written first - a sweep that
 * confirmed before the webhook landed used to strand the row in reserve for good.
 */
export async function releaseUnswept(userId: string): Promise<bigint> {
  return tx(async (c) => {
    const rows = await c.query<{ id: string; usd_at_det: string }>(
      `select d.id, d.usd_at_det
         from deposits d
         join users u on u.id = d.user_id
        where d.user_id = $1 and d.status = 'unswept' and d.released_at is null
          and coalesce((select sum(s.amount_raw) from sweeps s
                         where s.deposit_address = u.privy_address
                           and s.asset = d.asset and s.status = 'confirmed'), 0)
              >= (select coalesce(sum(x.qty), 0) from deposits x
                   where x.user_id = d.user_id and x.asset = d.asset)
        order by d.created_at
        for update of d`,
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

/** Backstop for the ordering case. The sweep can confirm before the deposit row
    is written, and then nothing calls release for that user at all. Runs on a
    timer and clears anyone whose confirmed sweep volume already covers what was
    recorded against the address. */
export async function releaseSwept(): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    `select distinct d.user_id
       from deposits d
       join users u on u.id = d.user_id
      where d.status = 'unswept' and d.released_at is null
        and d.created_at > now() - interval '7 days'
        and coalesce((select sum(s.amount_raw) from sweeps s
                       where s.deposit_address = u.privy_address
                         and s.asset = d.asset and s.status = 'confirmed'), 0)
            >= (select coalesce(sum(x.qty), 0) from deposits x
                 where x.user_id = d.user_id and x.asset = d.asset)
      limit 100`,
  );
  for (const r of rows) {
    await releaseUnswept(r.user_id).catch((e) =>
      console.error('release-swept', r.user_id, e instanceof Error ? e.message : e),
    );
  }
}
