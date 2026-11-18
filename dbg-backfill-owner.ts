import { pool } from './src/db.js';
import { createPrivyUser, ownWallet } from './src/privy.js';

const { rows } = await pool.query<{
  id: string; email: string | null; privy_wallet_id: string | null; privy_user_id: string | null;
}>('select id, email, privy_wallet_id, privy_user_id from users order by created_at');

let users = 0, wallets = 0, bad = 0;
for (const u of rows) {
  let pu = u.privy_user_id;
  if (!pu) {
    try {
      pu = await createPrivyUser(u.id, u.email);
      await pool.query('update users set privy_user_id = $2 where id = $1', [u.id, pu]);
      users++;
      console.log('user', u.id, '->', pu);
    } catch (e) {
      bad++;
      console.log('USER FAIL', u.id, (e as Error).message);
      continue;
    }
  }
  if (!u.privy_wallet_id) continue;
  try {
    await ownWallet(u.privy_wallet_id, pu);
    wallets++;
    console.log('  wallet re-owned', u.privy_wallet_id);
  } catch (e) {
    bad++;
    console.log('  WALLET FAIL', u.privy_wallet_id, (e as Error).message);
  }
}
console.log('users created', users, 'wallets re-owned', wallets, 'failures', bad);
await pool.end();
