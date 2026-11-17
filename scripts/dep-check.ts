import 'dotenv/config';
import { pool } from '../src/db.js';
const { rows } = await pool.query(
  'select id, user_id, status, usd_at_det, asset, sig, created_at from deposits order by created_at desc limit 5',
);
console.log(rows);
await pool.end();