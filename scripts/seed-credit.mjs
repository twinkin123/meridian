import 'dotenv/config';
import pg from 'pg';
const [email, usd] = process.argv.slice(2);
if (!email || !usd) { console.error('usage: node scripts/seed-credit.mjs <email> <micro-usd>'); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const u = await c.query('select id from users where email = $1', [email]);
if (u.rowCount === 0) { console.error('no user', email); await c.end(); process.exit(1); }
const ref = 'manual-test-' + Date.now();
const r = await c.query(
  `select post('DepositCredited',$1::text,
     json_build_array(
       json_build_object('code','1000','owner',null,'amount',$2::text),
       json_build_object('code','2000','owner',$3::text,'amount',$4::text)
     )::jsonb) id`, [ref, usd, u.rows[0].id, '-' + usd]);
console.log('posted', r.rows[0].id);
await c.end();