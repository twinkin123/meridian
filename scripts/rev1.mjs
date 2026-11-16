import { pool, close } from '../dist/src/db.js';
const t = await pool.query(`select id from transactions where kind='ReferralCommission' and external_ref like '%1794793015983'`);for (const r of t.rows) {
  const p = await pool.query(`select a.code, a.owner_id, po.amount from postings po join accounts a on a.id = po.account_id where po.tx_id = $1`, [r.id]);
  const legs = p.rows.map((x) => ({ code: x.code, owner: x.owner_id, amount: (-BigInt(x.amount)).toString() }));
  await pool.query(`select post($1,$2,$3::jsonb)`, ['ReferralCommissionReversal', 'rev:x:' + r.id, JSON.stringify(legs)]);
}
console.log('done');
await close();
