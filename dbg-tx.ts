import 'dotenv/config';
import { pool } from './src/db.js';
import { getTx } from './src/solana/rpc.js';
const SIG = '62M96zD25GQWS9BTu2w9bEgjtbq5tksTD1LBYHMQ4wYwWXrnM6VTJhBWaygsWaGfezkQGPMNFxGDhBPwNnkiFWtD';
const t: any = await getTx(SIG);
console.log('keys:', (t?.transaction?.message?.accountKeys ?? []).map((k: any) => typeof k === 'string' ? k : k?.pubkey));
console.log('pre:', JSON.stringify(t?.meta?.preTokenBalances));
console.log('post:', JSON.stringify(t?.meta?.postTokenBalances));
await pool.end();
