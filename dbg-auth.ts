import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
const c = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const w: any = await c.wallets().get('o39omzjhzoskocw1o2zhs2j5').catch((e: any) => ({ error: e.message }));
console.log(w.error ?? `ok ${w.id} ${w.chain_type}`);
