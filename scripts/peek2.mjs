import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log('w', (await c.query('select status, error from withdrawals order by created_at desc limit 3')).rows);
console.log('p', (await c.query('select a.code, p.amount from postings p join accounts a on a.id = p.account_id order by p.id desc limit 12')).rows);
await c.end();
