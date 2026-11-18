import { PrivyClient } from '@privy-io/node';
import { pool } from './src/db.js';
import { authPublicKey } from './src/privy.js';

const APP = process.env.PRIVY_APP_ID!;
const KEY = process.env.PRIVY_AUTH_KEY!;
const basic = 'Basic ' + Buffer.from(APP + ':' + process.env.PRIVY_APP_SECRET!).toString('base64');
const H = { 'privy-app-id': APP, Authorization: basic, 'Content-Type': 'application/json' };
const pub = authPublicKey();

const r = await fetch('https://api.privy.io/v1/key_quorums', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ public_keys: [pub], authorization_threshold: 1 }),
});
const body = await r.text();
console.log('create quorum ->', r.status);
console.log(body);
if (!r.ok) { await pool.end(); process.exit(1); }

const qid = (JSON.parse(body) as { id?: string }).id;
if (!qid) { console.log('no quorum id'); await pool.end(); process.exit(1); }
console.log('new quorum', qid);

const { rows } = await pool.query<{ privy_wallet_id: string }>(
  'select privy_wallet_id from users where privy_wallet_id is not null',
);
console.log('wallets to re-point:', rows.length);

const c = new PrivyClient({ appId: APP, appSecret: process.env.PRIVY_APP_SECRET! });
let ok = 0, bad = 0;
for (const w of rows) {
  try {
    await c.wallets().update(w.privy_wallet_id, {
      owner_id: qid,
      authorization_context: { authorization_private_keys: [KEY] },
    });
    ok++;
  } catch (e) {
    bad++;
    console.log('fail', w.privy_wallet_id, (e as Error).message);
  }
}
console.log('updated', ok, 'failed', bad);

const chk = await fetch('https://api.privy.io/v1/key_quorums/' + qid, { headers: H });
console.log('verify quorum', chk.status, await chk.text());

const one = await fetch('https://api.privy.io/v1/wallets/' + rows[0].privy_wallet_id, { headers: H });
console.log('verify wallet', one.status, await one.text());

await pool.end();
