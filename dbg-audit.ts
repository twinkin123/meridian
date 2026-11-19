import { pool } from './src/db.js';
import { readFileSync } from 'node:fs';
const SIG = '0xaa764cc6c9c2abffa2c9a21ce4ba72edc238063ee49b1d8422d0d116f136b067';
const UID = '0082a81f-1031-44ec-a2ed-544aa1c1356f';
async function q(label: string, sql: string, params: any[] = []) {
  try {
    const r = await pool.query(sql, params);
    console.log(`\n=== ${label} :: ${r.rowCount} rows ===`);
    console.table(r.rows);
  } catch (e: any) {
    console.log(`\n=== ${label} :: ERR ${e.message} ===`);
  }
}
console.log('\n--- dbg-watch.ts ---\n' + readFileSync('dbg-watch.ts', 'utf8'));
await q('tables', `select table_name from information_schema.tables where table_schema='public' order by 1`);
await q('deposit by sig', 'select * from deposits where sig=$1', [SIG]);
await q('deposits for user', 'select * from deposits where user_id=$1', [UID]);
await q('user', 'select id, email, privy_address from users where id=$1', [UID]);
await q('sweeps recent', 'select * from sweeps order by submitted_at desc limit 3');
await q('sweeps by addr', 'select * from sweeps where deposit_address=$1', ['J5yLbecbweV2ESfKhZnGYsmWKvWSnpeDdndX6YZviJYw']);
await q('deposit_addresses for user', 'select * from deposit_addresses where user_id=$1', [UID]);
await pool.end();
