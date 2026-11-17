import 'dotenv/config';
import { pool } from '../src/db.js';
import { keypairForIndex } from '../src/sweeps.js';
const { rows } = await pool.query<{ id: string; deposit_addr: string; deposit_index: number }>(
  'select id, deposit_addr, deposit_index from users where deposit_addr is not null order by deposit_index',
);
let bad = 0;
for (const r of rows) {
  const derived = keypairForIndex(r.deposit_index).publicKey.toBase58();
  if (derived !== r.deposit_addr) { bad++; console.log('MISMATCH', r.deposit_index, r.deposit_addr, derived); }
}
console.log(`checked ${rows.length}, mismatched ${bad}`);
await pool.end();