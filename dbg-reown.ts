import { PrivyClient } from '@privy-io/node';
import { createCryptoDepositAccount } from './src/privy.js';

const APP = process.env.PRIVY_APP_ID!;
const KEY = process.env.PRIVY_AUTH_KEY!;
const basic = 'Basic ' + Buffer.from(APP + ':' + process.env.PRIVY_APP_SECRET!).toString('base64');
const H = { 'privy-app-id': APP, Authorization: basic, 'Content-Type': 'application/json' };
const API = 'https://api.privy.io/v1';

const wid = 'igekvng3syc1uxlfbi2i4ja1';
const userOwner = 'ufugw1tx6jdx6xnum5j98mtr';

const c = new PrivyClient({ appId: APP, appSecret: process.env.PRIVY_APP_SECRET! });
try {
  await c.wallets().update(wid, {
    owner_id: userOwner,
    authorization_context: { authorization_private_keys: [KEY] },
  } as any);
  console.log('re-own -> ok');
} catch (e) {
  console.log('re-own -> FAIL', (e as Error).message);
}

const w = await fetch(API + '/wallets/' + wid, { headers: H });
console.log('shape ->', w.status, await w.text());

try {
  const out = await createCryptoDepositAccount(wid);
  console.log('DEPOSIT OK ->', JSON.stringify(out));
} catch (e) {
  console.log('DEPOSIT FAIL ->', (e as Error).message);
}
