import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import argon2 from '@node-rs/argon2';
import { one, none } from './db.js';

const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPw = (pw: string) => argon2.hash(pw, OPTS);
export const checkPw = (pw: string, h: string) => argon2.verify(h, pw);

const sha = (t: string) => createHash('sha256').update(t).digest();

export async function issueSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await none(
    `insert into sessions (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [userId, sha(token)],
  );
  return token;
}

export async function userFromToken(token: string): Promise<string | null> {
  const r = await one<{ user_id: string }>(
    `select user_id from sessions
     where token_hash = $1 and expires_at > now()`,
    [sha(token)],
  );
  return r?.user_id ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  await none(`delete from sessions where token_hash = $1`, [sha(token)]);
}

export function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function throttle(ident: string, max = 5, windowSec = 60): Promise<void> {
  const r = await one<{ n: string }>(
    `select count(*)::text n from login_attempts
     where ident = $1 and created_at > now() - ($2 || ' seconds')::interval`,
    [ident, windowSec],
  );
  if (Number(r.n) >= max) throw new Error('too_many_attempts');
  await none(`insert into login_attempts (ident) values ($1)`, [ident]);
}