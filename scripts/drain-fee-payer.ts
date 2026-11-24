import 'dotenv/config';
import { pbkdf2Sync } from 'node:crypto';
import { derivePath } from 'ed25519-hd-key';
import { Keypair, Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

const TO = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!TO) { console.error('usage: tsx scripts/drain-fee-payer.ts <destination> [--dry]'); process.exit(1); }

const mnemonic = (process.env.MASTER_MNEMONIC ?? '').trim();
if (!mnemonic) throw new Error('MASTER_MNEMONIC missing');
const rpc = process.env.RPC_URL;
if (!rpc) throw new Error('RPC_URL missing');

const seed = pbkdf2Sync(mnemonic.normalize('NFKD'), 'mnemonic', 2048, 64, 'sha512');
const { key } = derivePath("m/44'/501'/999999'/0'", seed.toString('hex'));
const kp = Keypair.fromSeed(key);

const c = new Connection(rpc, 'confirmed');
const lamports = await c.getBalance(kp.publicKey);
const send = lamports > 5_000n ? BigInt(lamports) - 5_000n : 0n;

console.log(JSON.stringify({ fee_payer: kp.publicKey.toBase58(), to: TO, lamports: lamports.toString(), sending: send.toString(), dry: DRY }, null, 1));
if (DRY || send === 0n) process.exit(0);

const tx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(TO), lamports: Number(send) }),
);
tx.feePayer = kp.publicKey;
const sig = await c.sendTransaction(tx, [kp]);
console.log('sent', sig);