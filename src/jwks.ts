import { createPrivateKey, createPublicKey } from 'node:crypto';
import { env } from './env.js';

/** Stable key id; Privy stores it with the verifier, so it must never change. */
const KID = 'meridian-app-1';

/** PRIVY_AUTH_KEY as bare base64 PKCS8, tolerating PEM headers or escaped newlines. */
function authKeyB64(): string {
  const raw = env.privyAuthKey.replace(/\\n/g, '\n');
  return raw.includes('BEGIN') ? raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') : raw.trim();
}

let cached: string | null = null;

/** Public half of the app authorization key, as a JWK set for Privy to verify our JWTs. */
export function jwks(): string {
  if (cached) return cached;
  const priv = createPrivateKey({
    key: Buffer.from(authKeyB64(), 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const jwk = createPublicKey(priv).export({ format: 'jwk' }) as Record<string, unknown>;
  cached = JSON.stringify({ keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'ES256' }] });
  return cached;
}
