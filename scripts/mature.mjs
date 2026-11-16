import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(`update deposits set unlock_at = now() - interval '1 minute' where status = 'locked' returning id`);
console.table(r.rows);
await p.end();