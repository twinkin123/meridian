import 'dotenv/config';
import { pool } from '../src/db.js';
const r = await pool.query(`
  select usd_at_det, asset, status, created_at from deposits order by created_at desc limit 12
`);
console.log(r.rows);
await pool.end();