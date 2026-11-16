import './dist/src/env.js';
import { tx, one, close } from './dist/src/db.js';
import { post } from './dist/src/ledger/post.js';
import { ensure } from './dist/src/ledger/accounts.js';
import { payReferral } from './dist/src/referrals.js';

const u = await one('select id from users where email=$1', ['weweewwew@gmail.com']);
if (!u) { console.error('no user'); process.exit(1); }
const sig = 'seed-' + Date.now();
const usd = 100000000n;
await tx(async (c) => {
  const row = await c.query("insert into deposits (user_id, sig, asset, qty, usd_at_det, status) values ($1,$2,'USDC',$3,$3,'detected') returning id", [u.id, sig, usd.toString()]);
  const depId = row.rows[0].id;
  await ensure(c, u.id);
  await post(c, 'DepositCredited', sig, [
    { code: '1000', amount: usd },
    { code: '2070', owner: u.id, amount: -usd },
  ]);
  await c.query("update deposits set status='locked', unlock_at=now()+interval '30 days' where sig=$1", [sig]);
  console.log('commission', (await payReferral(c, u.id, depId, usd)).toString());
});
await close();
