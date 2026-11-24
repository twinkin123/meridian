import 'dotenv/config';
import { pool, tx } from '../src/db.js';
import { post } from '../src/ledger/post.js';

const { rows } = await pool.query(`select user_id, balance::text b from v_balance where code = '2050' and balance > 0`);
for (const r of rows) {
  const amt = BigInt(r.b);
  await tx(async (c) => {
    await post(c, 'ReserveToAvailable', `reserve:${r.user_id}:${Date.now()}`, [
      { code: '2050', owner: r.user_id, amount: amt },
      { code: '2000', owner: r.user_id, amount: -amt },
    ]);
  });
  console.log('moved', r.user_id, amt.toString());
}
const d = await pool.query(`update deposits set status = 'credited', unlock_at = null where status = 'held'`);
console.log('deposits updated', d.rowCount);
await pool.end();