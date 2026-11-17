import 'dotenv/config';
const id = process.env.PRIVY_APP_ID!;
const sec = process.env.PRIVY_APP_SECRET!;
const r = await fetch('https://api.privy.io/v1/wallets?chain_type=solana&limit=20', {
  headers: {
    'privy-app-id': id,
    Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'),
  },
});
console.log('status', r.status);
const j = await r.json();
for (const w of j.data ?? []) console.log(w.id, w.address, w.created_at);