import 'dotenv/config';
import { pool } from './src/db.js';
const u = '0082a81f-1031-44ec-a2ed-544aa1c1356f';
const q = await pool.query('select privy_wallet_id from users where id = $1', [u]);
const w = q.rows[0]?.privy_wallet_id;
const basic = 'Basic ' + Buffer.from(
  `${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
const after = new Date(Date.now() - 6 * 3600_000).toISOString();
const r = await fetch(
  `https://api.privy.io/v1/wallets/${w}/deposit_accounts/crypto/next_order?after=${encodeURIComponent(after)}`,
  { headers: { 'privy-app-id': process.env.PRIVY_APP_ID!, Authorization: basic } },
);
console.log(r.status, (await r.text()).slice(0, 1200));
await pool.end();
