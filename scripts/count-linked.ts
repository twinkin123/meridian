import 'dotenv/config';
import { pool } from '../src/db.js';
const { rows } = await pool.query<{ n: string }>('select count(*) n from users where privy_address is not null');
console.log('with privy address', rows[0].n);
await pool.end();