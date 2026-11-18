import { PrivyClient, generateAuthorizationSignature } from '@privy-io/node';
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { env } from '../src/env.js';

const appId = env.privyAppId!;
const walletId = env.privyTreasuryWalletId!;
const client = new PrivyClient({ appId, appSecret: env.privyAppSecret! });

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

const kp = await suite.kem.generateKeyPair();
const spki = await globalThis.crypto.subtle.exportKey('spki', kp.publicKey);
const recipient_public_key = Buffer.from(new Uint8Array(spki)).toString('base64');

const body = { encryption_type: 'HPKE', recipient_public_key };
const url = `https://api.privy.io/v1/wallets/${walletId}/export`;
const expiry = String(Date.now() + 600_000);

const signature = generateAuthorizationSignature({
  authorizationPrivateKey: env.privyAuthKey!,
  input: {
    version: 1,
    method: 'POST',
    url,
    body,
    headers: { 'privy-app-id': appId, 'privy-request-expiry': expiry },
  },
});

const r = await fetch(url, {
  method: 'POST',
  headers: {
    'privy-app-id': appId,
    Authorization: 'Basic ' + Buffer.from(`${appId}:${env.privyAppSecret}`).toString('base64'),
    'content-type': 'application/json',
    'privy-authorization-signature': signature,
    'privy-request-expiry': expiry,
  },
  body: JSON.stringify(body),
});

const j: any = await r.json();
if (!r.ok) {
  console.log('status', r.status, JSON.stringify(j));
  process.exit(1);
}

const ctx = await suite.createRecipientContext({
  recipientKey: kp.privateKey,
  enc: Buffer.from(j.encapsulated_key, 'base64'),
});
const plain = await ctx.open(Buffer.from(j.ciphertext, 'base64'));

console.log('TREASURY PRIVATE KEY:', new TextDecoder().decode(plain));