import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import { PrivyClient } from '@privy-io/node';
import { setWalletOwner } from '../src/privy.js';

const b58 = process.argv[2];
if (!b58) {
  console.error('usage: tsx scripts/import-treasury.ts <base58 secret key>');
  process.exit(1);
}

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    let carry = A.indexOf(ch);
    if (carry < 0) throw new Error('bad base58 char: ' + ch);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

const authKey = process.env.PRIVY_AUTH_KEY;
if (!authKey) throw new Error('PRIVY_AUTH_KEY missing');

const kp = Keypair.fromSecretKey(decode(b58));
console.log('address', kp.publicKey.toBase58());

const c = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

const w = await (c.wallets() as any).import({
  wallet: {
    private_key: kp.secretKey,
    address: kp.publicKey.toBase58(),
    chain_type: 'solana',
    entropy_type: 'private-key',
  },
});

console.log('wallet_id', w.id);
console.log('wallet_address', w.address);

await setWalletOwner(w.id);
console.log('owner set to the app authorization key');