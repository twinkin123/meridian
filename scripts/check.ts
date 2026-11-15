import '../src/env.js';
import { matchDeposit, LAMPORTS } from '../src/solana/match.js';

const tx = {
  meta: {
    err: null,
    preBalances: [1000, 0],
    postBalances: [1000, 50000000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
  transaction: { message: { accountKeys: ['other', 'ADDR'] } },
};

const m = matchDeposit(tx, 'ADDR');
console.log('match:', m);

if (m) {
  const usd = (m.qty * 142n * 1_000_000n) / LAMPORTS;
  console.log('qty:', m.qty.toString(), 'usd:', usd.toString());
}