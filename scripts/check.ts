import '../src/env.js';
import { Connection } from '@solana/web3.js';

const c = new Connection(process.env.RPC_URL!, 'confirmed');
const sig = '3Q6XqUMJgqz5TaGEDhZF89M13LYmL1s4QnsutBPkb7KB2tsvwAtDaRQm36Qn5hCx7LooBA6aNSuUqNNLwYMfmbpW';

const st = await c.getSignatureStatus(sig, { searchTransactionHistory: true });
console.log(JSON.stringify(st, null, 2));

const t = await c.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
console.log('found on chain:', t !== null);