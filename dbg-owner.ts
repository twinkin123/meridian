import { PrivyClient } from '@privy-io/node';
import { pool } from './src/db.js';
import { authPublicKey } from './src/privy.js';

const c = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
console.log('signing pub:', authPublicKey());

const { rows } = await pool.query('select privy_wallet_id, privy_address from users where privy_wallet_id is not null limit 2');
for (const r of rows) {
  const w = await c.wallets().get(r.privy_wallet_id);
  console.log(JSON.stringify({
    id: w.id,
    address: w.address,
    owner_id: w.owner_id,
    owner: w.owner,
    additional_signers: w.additional_signers,
    policy_ids: w.policy_ids,
  }, null, 2));
}
await pool.end();
