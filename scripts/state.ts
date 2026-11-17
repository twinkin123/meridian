import 'dotenv/config';
import { pool } from '../src/db.js';
const r = await pool.query('select created_at, chain_usd, ledger_assets, liabilities, margin, drift, stuck, verdict from recon_runs order by created_at desc limit 3');
console.log(r.rows);
await pool.end();