import { pool, tx } from './db.js';
import { post } from './ledger/post.js';

/** Releases any vested settlement credits whose due time has passed. */
export async function releaseDue(): Promise<{ released: number }> {
  const { rows } = await pool.query<{ id: string; user_id: string; amount: string }>(
    `select id, user_id, amount from vesting
      where released_at is null and due_at <= now()
      order by due_at limit 500`,
  );

  let released = 0;
  for (const r of rows) {
    const amount = BigInt(r.amount);
    if (amount <= 0n) {
      await pool.query(`update vesting set released_at = now() where id = $1`, [r.id]);
      continue;
    }
    await tx(async (c) => {
      const done = await c.query(`update vesting set released_at = now() where id = $1 and released_at is null returning id`, [r.id]);
      if (done.rowCount === 0) return;
      await c.query('select ensure_user_accounts($1)', [r.user_id]);
      await post(c, 'VestingRelease', `vest:${r.id}`, [
        { code: '2060', owner: r.user_id, amount },
        { code: '2000', owner: r.user_id, amount: -amount },
      ]);
    });
    released += 1;
  }
  return { released };
}
