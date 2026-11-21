import 'dotenv/config';
import { pool, tx } from '../src/db.js';

const dep = process.argv[2];
const user = process.argv[3];
if (!dep || !user) throw new Error('usage: tsx scripts/unlock-deposit.ts <depositId> <userId>');

const AMOUNT = 68_790_000n;

async function show(label: string): Promise<void> {
  const b = await pool.query(
    `select code, balance from v_balance where user_id = $1 order by code`,
    [user],
  );
  console.log(`--- ${label} ---`);
  for (const r of b.rows) console.log(`  ${r.code}  ${r.balance}`);
  const d = await pool.query(`select status, released_at from deposits where id = $1`, [dep]);
  console.log(`  deposit: ${d.rows[0]?.status ?? 'missing'} released_at=${d.rows[0]?.released_at ?? 'null'}`);
}

await show('before');

await tx(async (c) => {
  const d = await c.query(
    `select user_id, usd_at_det, status from deposits
      where id = $1 and user_id = $2 and status = 'locked' and released_at is null
      for update`,
    [dep, user],
  );
  if (d.rowCount === 0) throw new Error('deposit is not a releasable lock');

  const amount = BigInt(d.rows[0].usd_at_det);
  if (amount !== AMOUNT) throw new Error(`unexpected amount ${amount}, expected ${AMOUNT}`);

  await c.query('select ensure_user_accounts($1)', [user]);
  await c.query(
    `select post('DepositUnlocked', $1, $2::jsonb)`,
    [
      `unlock:${dep}`,
      JSON.stringify([
        { code: '2070', owner: user, amount: amount.toString() },
        { code: '2000', owner: user, amount: (-amount).toString() },
      ]),
    ],
  );

  const u = await c.query(
    `update deposits set status = 'credited', released_at = now()
      where id = $1 and released_at is null returning id`,
    [dep],
  );
  if (u.rowCount === 0) throw new Error('status update matched nothing');
});

await show('after');
await pool.end();