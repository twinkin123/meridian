import 'dotenv/config';
const id = process.env.PRIVY_APP_ID!;
const sec = process.env.PRIVY_APP_SECRET!;
const w = process.env.PRIVY_TREASURY_WALLET_ID!;
const action = process.argv[2];
const r = await fetch(`https://api.privy.io/v1/wallets/${w}/actions/${action}`, {
  headers: {
    'privy-app-id': id,
    Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'),
  },
});
console.log('status', r.status);
console.log(JSON.stringify(await r.json(), null, 1));