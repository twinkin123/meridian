import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
import { pool } from './src/db.js';
const c = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const r = await pool.query(`select privy_wallet_id from users where id = 'd0feabc0-4c96-464d-a4ca-42cbf920418f'`);
const w: any = await (c as any).wallets().get(r.rows[0].privy_wallet_id);
const q: any = await (c as any).keyQuorums().get(w.owner_id);
console.log('wallet', w.id, 'owner', w.owner_id, `${q.user_ids?.length ?? 0}u/${q.authorization_keys?.length ?? 0}k`);
await pool.end();
