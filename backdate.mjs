import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const r = await p.query(`update deposits set unlock_at = now() - interval '1 minute' where id = 'ec63e2eb-3942-45c5-a269-324553f16ccd' returning id, usd_at_det`);
console.log('backdated', r.rows[0]);
await p.end();
