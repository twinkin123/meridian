import 'dotenv/config';
import { pool } from '../src/db.js';
import { runSweep } from '../src/sweeps.js';
const r = await runSweep({ dryRun: false, limit: 200 });
console.log(JSON.stringify(r, null, 1));
await pool.end();