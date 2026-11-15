import '../src/env.js';
import { Connection, PublicKey } from '@solana/web3.js';

const c = new Connection(process.env.RPC_URL!, 'confirmed');
const dest = new PublicKey('3Qy9BecyiTrL1Bz9dofGvgvpRs6qPaZ9RnPvME5qLfB7');
console.log('destination balance:', await c.getBalance(dest));