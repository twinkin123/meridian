import 'dotenv/config';
import { pool, tx } from '../src/db.js';

const dep = process.argv[2];
const user = process.argv[3];
const AMOUNT = 22_000_000n;

async function show(l: string) {
  const b = await pool.query(`select code, balance from v_balance where user_id = $1 order by code`, [user]);
  console.log(`--- ${l} ---`);
  for (const r of b.rows) console.log(`  ${r.code}  ${r.balance}`);
}

await show('before');
await tx(async (c) => {
  const d = await c.query(`select usd_at_det from deposits where id = $1 and user_id = $2 and status = 'locked'`, [dep, user]);
  if (d.rowCount === 0) throw new Error('stake row not found');
  await c.query(`select post('StakeCorrected', $1, $2::jsonb)`, [
    `stakefix:${dep}`,
    JSON.stringify([
      { code: '2000', owner: user, amount: AMOUNT.toString() },
      { code: '2070', owner: user, amount: (-AMOUNT).toString() },
    ]),
  ]);
});
await show('after');
await pool.end();