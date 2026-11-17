import 'dotenv/config';
import { pool } from '../src/db.js';
const { rows } = await pool.query<{ privy_address: string }>(
  'select privy_address from users where privy_address is not null order by deposit_index',
);
console.log(rows.map((r) => r.privy_address).join('\n'));
await pool.end();