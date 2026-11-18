import 'dotenv/config';
import { pool } from './src/db.js';
const r = await pool.query('select user_id, family, address, created_at from deposit_addresses order by created_at desc limit 6');
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
