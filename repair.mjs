import './dist/src/env.js';
import { tx, one, close } from './dist/src/db.js';
import { post } from './dist/src/ledger/post.js';

const ref = (await one('select id from users where email=$1', ['second@test.com'])).id;
const bad = await one("select id from referral_ledger where referrer_id=$1 and base_usd='50000000'", [ref]);
if (bad) {
  await tx(async (c) => {
    await post(c, 'ReferralReversal', 'ref:rev:' + bad.id, [
      { code: '2080', owner: ref, amount: 2000000n },
      { code: '5010', amount: -2000000n },
    ]);
    await c.query('delete from referral_ledger where id=$1', [bad.id]);
  });
  console.log('reversed and removed', bad.id);
} else console.log('no bad row');
for (const e of ['qwwqqw@gmail.com', 'weweewwew@gmail.com']) {
  await one('update users set referral_paid_at = now() where email=$1', [e]);
}
console.log('backfilled');
await close();
