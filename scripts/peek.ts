import '../src/env.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { pool } from '../src/db.js';
import { sweepDestination } from '../src/sweeps.js';

const c = new Connection(process.env.RPC_URL!, 'confirmed');
const addr = new PublicKey('7ST12tUdaa9bgwBukDuXSa4JTY7aepfaE3Z8bJcDbFHs');
const dest = sweepDestination();

console.log('deposit balance :', await c.getBalance(addr));
console.log('treasury        :', dest.toBase58(), await c.getBalance(dest));

const ata = await getAssociatedTokenAddress(
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  dest,
);
console.log('treasury ATA    :', ata.toBase58(), 'exists:', (await c.getAccountInfo(ata)) !== null);

const d = await pool.query('select id, asset, qty, usd_at_det, status, created_at from deposits order by id');
console.table(d.rows);
await pool.end();