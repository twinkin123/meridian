import 'dotenv/config';
import pg from 'pg';
const email = process.argv[2];
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(
  `select a.code, sum(po.amount)::text as bal from postings po
     join accounts a on a.id = po.account_id
     join users u on u.id = a.owner_id
    where u.email = $1 group by a.code order by a.code`,
  [email],
);
console.table(r.rows);
await p.end();