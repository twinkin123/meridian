import bs58 from 'bs58';
import { treasuryKeypair } from '../src/sweeps.js';

const kp = treasuryKeypair();
console.log('address:', kp.publicKey.toBase58());
console.log('secret :', bs58.encode(kp.secretKey));