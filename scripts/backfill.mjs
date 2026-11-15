import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query("insert into accounts (code, kind, owner_type, owner_id) select x.c, 'liability', 'user', u.id from users u cross join unnest(array['2000','2010','2020','2050']) x(c) where not exists (select 1 from accounts a where a.code = x.c and a.owner_id = u.id)");
console.log('added', r.rowCount);
await c.end();
