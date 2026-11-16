import 'dotenv/config';
import pg from 'pg';
const email = process.argv[2];
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(
  `select d.id, d.status, d.usd_at_det, d.unlock_at, d.released_at, d.claim_requested_at
     from deposits d join users u on u.id = d.user_id
    where u.email = $1 order by d.created_at desc limit 5`,
  [email],
);
console.table(r.rows);
await p.end();