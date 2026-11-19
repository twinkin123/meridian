import 'dotenv/config';
import { pool } from './src/db.js';
const U = 'd0feabc0-4c96-464d-a4ca-42cbf920418f';
await pool.query('update users set privy_address = null, privy_wallet_id = null, privy_user_id = null where id = $1', [U]);
await pool.query('delete from deposit_addresses where user_id = $1', [U]);
console.log('cleared');
await pool.end();
