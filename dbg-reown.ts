import 'dotenv/config';
import { PrivyClient } from '@privy-io/node';
import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import { pool } from './src/db.js';

const APP = process.env.PRIVY_APP_ID!;
const SECRET = process.env.PRIVY_APP_SECRET!;
const AUTHKEY = process.env.PRIVY_AUTH_KEY!;
const KID = 'meridian-app-1';
const c = new PrivyClient({ appId: APP, appSecret: SECRET });

async function jwtFor(userId: string) {
  const raw = AUTHKEY.replace(/\\n/g, '\n');
  const b64 = raw.includes('BEGIN') ? raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') : raw.trim();
  const pem = `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: KID })
    .setIssuer('meridian')
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(randomUUID())
    .sign(key);
}

const { rows } = await pool.query<{ id: string; privy_wallet_id: string; privy_user_id: string }>(
  'select id, privy_wallet_id, privy_user_id from users where privy_wallet_id is not null and privy_user_id is not null',
);
console.log('wallets to re-own:', rows.length);

let ok = 0, bad = 0;
for (const r of rows) {
  try {
    const q: any = await (c as any).keyQuorums().create({
      user_ids: [r.privy_user_id],
      authorization_threshold: 1,
    });
    const qid = q.id;
    if (!qid) throw new Error('no_quorum_id');
    const jwt = await jwtFor(r.id);
    await (c as any).wallets().update(r.privy_wallet_id, {
      owner_id: qid,
      authorization_context: { user_jwts: [jwt] },
    });
    const chk: any = await (c as any).keyQuorums().get(qid);
    console.log('ok', r.privy_wallet_id, '->', qid, `${chk.user_ids?.length ?? 0}u/${chk.authorization_keys?.length ?? 0}k`);
    ok++;
  } catch (e: any) {
    bad++;
    console.log('FAIL', r.privy_wallet_id, e.message?.slice(0, 180));
  }
}
console.log('done ok=' + ok + ' fail=' + bad);
await pool.end();
