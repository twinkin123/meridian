import '../src/env.js';
import { pool } from '../src/db.js';
import { isValidAddress } from '../src/recon.js';

const r = await pool.query('select email, deposit_addr from users');
console.table(r.rows);

for (const row of r.rows) {
  if (!isValidAddress(row.deposit_addr)) {
    console.log('INVALID:', row.email, JSON.stringify(row.deposit_addr));
  }
}

await pool.end();