import { PrivyClient } from '@privy-io/node';
import { createCryptoDepositAccount } from './src/privy.js';

const APP = process.env.PRIVY_APP_ID!;
const KEY = process.env.PRIVY_AUTH_KEY!;
const basic = 'Basic ' + Buffer.from(APP + ':' + process.env.PRIVY_APP_SECRET!).toString('base64');
const H = { 'privy-app-id': APP, Authorization: basic, 'Content-Type': 'application/json' };
const API = 'https://api.privy.io/v1';

const u = await fetch(API + '/users', {
  method: 'POST', headers: H,
  body: JSON.stringify({ linked_accounts: [{ type: 'email', address: 'dep-probe-' + Date.now() + '@example.com' }] }),
});
const ub = await u.text();
console.log('create user ->', u.status, ub);
if (!u.ok) process.exit(1);
const uid = (JSON.parse(ub) as { id: string }).id;

const c = new PrivyClient({ appId: APP, appSecret: process.env.PRIVY_APP_SECRET! });
const w = await (c.wallets().create as any)({
  chain_type: 'solana',
  owner: { user_id: uid },
  authorization_context: { authorization_private_keys: [KEY] },
});
console.log('create wallet ->', w.id, w.address);

const shape = await fetch(API + '/wallets/' + w.id, { headers: H });
console.log('wallet shape ->', shape.status, await shape.text());

try {
  const out = await createCryptoDepositAccount(w.id);
  console.log('DEPOSIT OK ->', JSON.stringify(out));
} catch (e) {
  console.log('DEPOSIT FAIL ->', (e as Error).message);
}
