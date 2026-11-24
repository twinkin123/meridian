import 'dotenv/config';
import { pool } from '../src/db.js';
import { ensureDepositAddresses } from '../src/deposits.js';

const rows = await pool.query('select id, email from users order by created_at');
for (const r of rows.rows) {
  try {
    const out = await ensureDepositAddresses(r.id);
    console.log(r.email, Object.keys(out).join(','));
  } catch (e: any) {
    console.log(r.email, 'FAIL', e?.message);
  }
}
await pool.end();