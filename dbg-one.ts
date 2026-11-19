import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import { pool } from './src/db.js';
const A = process.env.PRIVY_APP_ID!, S = process.env.PRIVY_APP_SECRET!, K = process.env.PRIVY_AUTH_KEY!;
const W = 'igekvng3syc1uxlfbi2i4ja1', OLD = 'ufugw1tx6jdx6xnum5j98mtr';
const c = new PrivyClient({ appId: A, appSecret: S });
const b = K.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
const pem = `-----BEGIN PRIVATE KEY-----\n${(b.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----`;
const k = await importPKCS8(pem, 'ES256');
const q = await pool.query('select id, privy_user_id from users where privy_wallet_id = $1', [W]);
const r: any = q.rows[0];
const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'meridian-app-1' }).setIssuer('meridian').setSubject(r.id).setIssuedAt().setExpirationTime('5m').setJti(randomUUID()).sign(k);
const ac = { authorization_private_keys: [K], user_jwts: [jwt] };
const nq: any = await (c as any).keyQuorums().create({ user_ids: [r.privy_user_id], authorization_threshold: 1 });
console.log('new', nq.id);
try {
  await (c as any).keyQuorums().update(OLD, { user_ids: [r.privy_user_id], authorization_context: ac });
  console.log('old quorum now has the user');
} catch (e: any) { console.log('update old FAIL', e.message.slice(0, 120)); }
await (c as any).wallets().update(W, { owner_id: nq.id, authorization_context: ac });
console.log('wallet repointed to', nq.id);
await pool.end();
