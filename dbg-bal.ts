import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { USDC_MINT } from './src/solana/match.js';
const A = '9pNrssxoK52GaUEWX5ik2Yp8BhtMj6P7BEqBEn4iYkW4';
const c = new Connection(process.env.RPC_URL!, 'confirmed');
console.log('lamports', await c.getBalance(new PublicKey(A)));
const ata = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(A));
console.log('usdc', await c.getTokenAccountBalance(ata).then((x) => x.value.amount).catch(() => 'no_ata'));
