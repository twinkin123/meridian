import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const day = process.argv[2];
const r = await p.query(
  `select a.code, a.owner_id, po.amount from transactions t
     join postings po on po.tx_id = t.id join accounts a on a.id = po.account_id
    where t.kind = 'SettlementCredit' and t.external_ref like $1 order by a.code`,
  [day + '%'],
);
console.table(r.rows);
const c = await p.query('select day, rate_bp, fee_bp, posted, total, gross_total, fee_total from credit_runs where day = $1', [day]);
console.table(c.rows);
await p.end();