import 'dotenv/config';
import { getTx } from '../src/solana/rpc.js';
import { matchDeposit } from '../src/solana/match.js';

const sig = process.argv[2];
const addr = process.argv[3];
const t = await getTx(sig);
console.log('tx?', !!t, 'err', t?.meta?.err);
if (t) {
  const keys = (t.transaction?.message?.accountKeys ?? []).map((k: any) =>
    typeof k === 'string' ? k : k?.pubkey,
  );
  console.log('key count', keys.length, 'contains addr', keys.includes(addr));
  console.log('post', JSON.stringify(t.meta?.postTokenBalances));
  console.log('pre', JSON.stringify(t.meta?.preTokenBalances));
  console.log('match', matchDeposit(t, addr));
}