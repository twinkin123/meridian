import 'dotenv/config';
import pg from 'pg';
const id = process.argv[2];
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const w = await p.query('select id, status, usd_amount, fee, source, error from withdrawals where id = $1', [id]);
console.table(w.rows);
const t = await p.query('select kind, external_ref, created_at from transactions where external_ref like $1 order by created_at', [id + '%']);
console.table(t.rows);
await p.end();