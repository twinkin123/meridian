import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query('select coalesce(sum(amount),0)::text as global_sum from postings');
console.table(r.rows);
await p.end();