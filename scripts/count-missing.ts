import 'dotenv/config';
import { pool } from '../src/db.js';
const { rows } = await pool.query<{ n: string }>(
  "select count(*) n from users where privy_address is null and deposit_addr is not null",
);
console.log('still missing', rows[0].n);
await pool.end();