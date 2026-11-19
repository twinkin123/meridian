import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
import { pool } from './src/db.js';
const p = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const { rows } = await pool.query(`select id, email, privy_wallet_id, privy_address, privy_user_id from users where privy_wallet_id is not null order by id`);
console.table(rows);
const ids = ['fqsgf4d9lu2gzx8w4inp1int','fynb7hazdde7zgszrzl5uyam','mmx5emix2osvb00h2q2c16q4','igekvng3syc1uxlfbi2i4ja1'];
for (const id of ids) {
  const w: any = await p.wallets().get(id).catch((e: any) => ({ error: e.message }));
  console.log(id, w.error ?? JSON.stringify({ owner: w.owner_id, address: w.address, chain: w.chain_type }));
}
await pool.end();
