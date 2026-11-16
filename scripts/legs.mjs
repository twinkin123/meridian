import 'dotenv/config';
import pg from 'pg';
const id = process.argv[2];
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(
  `select t.kind, a.code, a.owner_id, po.amount
     from transactions t join postings po on po.tx_id = t.id
     join accounts a on a.id = po.account_id
    where t.external_ref like $1 order by t.created_at, a.code`,
  [id + '%'],
);
console.table(r.rows);
await p.end();