import 'dotenv/config';
import { pool } from './src/db.js';
import { getTx } from './src/solana/rpc.js';
const t: any = await getTx('62M96zD25GQWS9BTu2w9bEgjtbq5tksTD1LBYHMQ4wYwWXrnM6VTJhBWaygsWaGfezkQGPMNFxGDhBPwNnkiFWtD');
console.log(JSON.stringify(t?.transaction?.message?.instructions, null, 2));
console.log('logMessages:', JSON.stringify(t?.meta?.logMessages, null, 2));
await pool.end();
