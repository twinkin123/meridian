import 'dotenv/config';
import { pool } from '../src/db.js';
import { processSig } from '../src/http/routes/webhooks.js';
await processSig(process.argv[2]);
console.log('done');
await pool.end();