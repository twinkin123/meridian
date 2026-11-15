import { mnemonicToSeedSync } from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { env } from '../env.js';

let hexSeed: string | null = null;

function masterHex(): string {
  if (!hexSeed) hexSeed = Buffer.from(mnemonicToSeedSync(env.masterMnemonic)).toString('hex');
  return hexSeed;
}

export function derive(index: number): Keypair {
  const { key } = derivePath(`m/44'/501'/${index}'/0'`, masterHex());
  return Keypair.fromSeed(key);
}

export function address(index: number): string {
  return derive(index).publicKey.toBase58();
}