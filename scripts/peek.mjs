import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log('users', (await c.query('select id, email from users order by created_at desc limit 3')).rows);
console.log('accts', (await c.query("select code, owner_id from accounts where code in ('1000','2000')")).rows);
await c.end();
