import 'dotenv/config';
import { pool } from '../src/db.js';
import { runSweep } from '../src/sweeps.js';

const dryRun = process.argv[2] !== 'live';
try {
  const out = await runSweep({ dryRun, limit: 5 });
  console.log(JSON.stringify(out, null, 1));
} catch (e: any) {
  console.log('THROWN', e?.message);
}
await pool.end();