import 'dotenv/config';
const API = 'https://api.privy.io/v1';
const auth = 'Basic ' + Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
for (const [c, a] of [['base','usdt'], ['polygon','usdc'], ['bsc','usdc'], ['tron','usdt'], ['base','usdc_e']]) {
  const r = await fetch(`${API}/deposit_accounts/crypto/quote`, {
    method: 'POST',
    headers: { 'privy-app-id': process.env.PRIVY_APP_ID, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { chain: c, asset: a }, destination: { chain: 'solana', asset: 'usdc' }, input_amount: '50' }),
  });
  console.log(c, a, r.status, (await r.text()).slice(0, 160));
}
process.exit(0);
