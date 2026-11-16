import 'dotenv/config';
import pg from 'pg';
import { expireClaims } from '../dist/src/locks.js';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await p.query(`update deposits set claim_requested_at = now() - interval '73 hours' where id = $1`, [process.argv[2]]);
console.log('lapsed', await expireClaims());
await p.end();