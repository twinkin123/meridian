import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query("select u.email, count(*) filter (where s.revoked_at is null) as live, count(*) as total from sessions s join users u on u.id = s.user_id group by u.email");
console.table(r.rows);
await p.end();