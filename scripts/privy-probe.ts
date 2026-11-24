import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';

const id = process.env.PRIVY_APP_ID!;
const sec = process.env.PRIVY_APP_SECRET!;
console.log('using', id, sec.slice(-6));

const c = new PrivyClient({ appId: id, appSecret: sec });
try {
  const w = await (c.wallets() as any).create({ chain_type: 'solana' });
  console.log('created', w.id, w.address);
} catch (e: any) {
  console.log('failed', e?.status, e?.message);
}