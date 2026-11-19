import { pool } from './src/db.js';
const TX = 'fe535011-c62d-4bf8-ae4a-bd70bfc634e8';
console.table((await pool.query(
  `select p.id, a.code, a.owner_type, a.owner_id, p.amount
     from postings p join accounts a on a.id = p.account_id
    where p.tx_id = $1 order by p.id`, [TX])).rows);
const s = await pool.query('select coalesce(sum(amount),0) total from postings where tx_id = $1', [TX]);
console.log('tx sum (must be 0):', s.rows[0].total);
console.table((await pool.query('select * from transactions where id = $1', [TX])).rows);
await pool.end();
