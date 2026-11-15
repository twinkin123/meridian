import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const u = await c.query('select id from users order by created_at desc limit 1');
const id = u.rows[0].id;
for (const code of ['2000','2010','2020']) {
await c.query("insert into accounts (code, kind, owner_type, owner_id) select $1, 'liability', 'user', $2 where not exists (select 1 from accounts where code = $1 and owner_id = $2)", [code, id]);
}
console.log('ok', id);
