import './dist/src/env.js';
import { tx, one, close } from './dist/src/db.js';
import { post } from './dist/src/ledger/post.js';
import { ensure } from './dist/src/ledger/accounts.js';
import { payReferral } from './dist/src/referrals.js';

const u = await one('select id from users where email=$1', ['weweewwew@gmail.com']);
const sig = 'seed2-' + Date.now();
const usd = 50000000n;
let comm = 0n;
await tx(async (c) => {
  const row = await c.query("insert into deposits (user_id, sig, asset, qty, usd_at_det, status) values ($1,$2,'USDC',$3,$3,'detected') returning id", [u.id, sig, usd.toString()]);
  const depId = row.rows[0].id;
  await ensure(c, u.id);
  await post(c, 'DepositCredited', sig, [{ code: '1000', amount: usd }, { code: '2070', owner: u.id, amount: -usd }]);
  await c.query("update deposits set status='locked', unlock_at=now()+interval '30 days' where sig=$1", [sig]);
  comm = await payReferral(c, u.id, depId, usd);
});
console.log('second_deposit_commission', comm.toString());
for (const name of ['postings','ledger_entries','ledger','entries']) {
  try { const r = await one("select coalesce(sum(amount),0)::text s from " + name); console.log(name, 'sum', r.s); } catch (e) {}
}
await close();
