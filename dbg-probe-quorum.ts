import { PrivyClient } from '@privy-io/node';
import { pool } from './src/db.js';
import { authPublicKey, createCryptoDepositAccount } from './src/privy.js';

const APP = process.env.PRIVY_APP_ID!;
const KEY = process.env.PRIVY_AUTH_KEY!;
const basic = 'Basic ' + Buffer.from(APP + ':' + process.env.PRIVY_APP_SECRET!).toString('base64');
const H = { 'privy-app-id': APP, Authorization: basic, 'Content-Type': 'application/json' };
const API = 'https://api.privy.io/v1';
const pub = authPublicKey();

const p = await fetch(API + '/key_quorums/jnfzfnh168q9ck6cgyfbxf4k', {
  method: 'PATCH', headers: H, body: JSON.stringify({ public_keys: [pub] }),
});
console.log('patch quorum ->', p.status);
console.log(await p.text());

const q2 = await fetch(API + '/key_quorums', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    display_name: 'meridian deposit owner',
    public_keys: [pub],
    authorization_threshold: 1,
    authorization_keys: [{ public_key: pub }],
  }),
});
console.log('named quorum ->', q2.status);
console.log(await q2.text());

const { rows } = await pool.query<{ privy_wallet_id: string }>(
  'select privy_wallet_id from users where privy_wallet_id is not null limit 1',
);
const wid = rows[0].privy_wallet_id;

try {
  const out = await createCryptoDepositAccount(wid);
  console.log('deposit create OK', JSON.stringify(out));
} catch (e) {
  console.log('deposit create FAIL', (e as Error).message);
}

const w = await fetch(API + '/wallets/' + wid, { headers: H });
console.log('wallet now ->', w.status, await w.text());
await pool.end();
