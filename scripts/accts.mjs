import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(`select code, kind, owner_type from accounts where owner_id is null and code in ('1010','1020','4000','1000') order by code`);
console.table(r.rows);
await p.end();