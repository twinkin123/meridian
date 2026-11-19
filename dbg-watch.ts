import 'dotenv/config';
import { pool } from './src/db.js';
const u = '0082a81f-1031-44ec-a2ed-544aa1c1356f';
const d = await pool.query(
  `select id, asset, usd_at_det, status, created_at from deposits
    where user_id = $1 order by created_at desc limit 3`, [u]);
console.table(d.rows);
const s = await pool.query(
  `select deposit_address, asset, amount_raw, status, submitted_at from sweeps
    order by submitted_at desc nulls last limit 3`);
console.table(s.rows);
await pool.end();
