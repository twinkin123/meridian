import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const w = (await c.query("select w.id, w.user_id, w.usd_amount from withdrawals w where w.status = 'failed' and not exists (select 1 from transactions t where t.external_ref = w.id::text and t.kind = 'WithdrawalFailed') order by w.created_at limit 1")).rows[0];
const legs = JSON.stringify([{ code: "2010", owner: w.user_id, amount: w.usd_amount }, { code: "2000", owner: w.user_id, amount: "-" + w.usd_amount }]);
await c.query('select post($1,$2,$3::jsonb)', ['WithdrawalFailed', w.id, legs]);
console.log('refunded', w.id);
await c.end();
