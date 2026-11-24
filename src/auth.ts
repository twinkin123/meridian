import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import argon2 from '@node-rs/argon2';
import { one, none, pool } from './db.js';

const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/* Argon2 is ~19MB of memory per hash. Without a cap, a login burst pins the box. */
const MAX_AUTH = 6;
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_AUTH) { active++; return Promise.resolve(); }
  return new Promise((res) => waiting.push(() => { active++; res(); }));
}

function release(): void {
  active--;
  const next = waiting.shift();
  if (next) next();
}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try { return await fn(); } finally { release(); }
}

export const hashPw = (pw: string) => slot(() => argon2.hash(pw, OPTS));
export const checkPw = (pw: string, h: string) => slot(() => argon2.verify(h, pw));

const sha = (t: string) => createHash('sha256').update(t).digest();

export function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type SessionMeta = { ua?: string | null; ip?: string | null };

const clip = (v: string | null | undefined, n: number): string | null =>
  v ? v.slice(0, n) : null;

const asIp = (v: string | null | undefined): string | null =>
  v && /^[0-9a-fA-F:.]+$/.test(v) ? v : null;

export async function issueSession(userId: string, meta: SessionMeta = {}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await none(
    `insert into sessions (user_id, token_hash, expires_at, ua, ip)
     values ($1, $2, now() + interval '30 days', $3, $4::inet)`,
    [userId, sha(token), clip(meta.ua, 300), asIp(meta.ip)],
  );
  return token;
}

export type SessionHit = { id: string; user_id: string };

export async function sessionFromToken(token: string): Promise<SessionHit | null> {
  const r = await one<SessionHit>(
    `select id, user_id from sessions
      where token_hash = $1 and expires_at > now() and revoked_at is null`,
    [sha(token)],
  );
  return r ?? null;
}

export async function userFromToken(token: string): Promise<string | null> {
  const r = await sessionFromToken(token);
  return r?.user_id ?? null;
}

// writes at most once per five minutes per session, so it is not a write per request
export async function touchSession(id: string): Promise<void> {
  await none(
    `update sessions set last_seen_at = now()
      where id = $1 and last_seen_at < now() - interval '5 minutes'`,
    [id],
  );
}

export async function revokeSession(token: string): Promise<void> {
  await none(
    `update sessions set revoked_at = now()
      where token_hash = $1 and revoked_at is null`,
    [sha(token)],
  );
}

export async function revokeSessionById(userId: string, id: string): Promise<boolean> {
  const r = await one<{ id: string }>(
    `update sessions set revoked_at = now()
      where id = $1 and user_id = $2 and revoked_at is null
      returning id`,
    [id, userId],
  );
  return Boolean(r);
}

export async function revokeAllSessions(userId: string, exceptId?: string): Promise<number> {
  const r = await one<{ n: string }>(
    `with gone as (
       update sessions set revoked_at = now()
        where user_id = $1
          and revoked_at is null
          and ($2::uuid is null or id <> $2::uuid)
        returning 1)
     select count(*)::text n from gone`,
    [userId, exceptId ?? null],
  );
  return Number(r?.n ?? 0);
}

export type SessionRow = {
  id: string;
  ua: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export async function listSessions(userId: string): Promise<SessionRow[]> {
  const { rows } = await pool.query<SessionRow>(
    `select id, ua, host(ip) as ip, created_at, last_seen_at, revoked_at
       from sessions
      where user_id = $1
        and created_at > now() - interval '30 days'
      order by last_seen_at desc
      limit 50`,
    [userId],
  );
  return rows;
}

export async function createReset(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await none(
    `insert into password_resets (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '30 minutes')`,
    [userId, sha(token)],
  );
  return token;
}

// single-use is enforced inside the update, so two concurrent uses cannot both win
export async function consumeReset(token: string): Promise<string | null> {
  const r = await one<{ user_id: string }>(
    `update password_resets set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning user_id`,
    [sha(token)],
  );
  return r?.user_id ?? null;
}

export async function setPassword(userId: string, pw: string, mustChange = false): Promise<void> {
  const h = await hashPw(pw);
  await none(`update users set pw_hash = $1, must_change_pw = $2 where id = $3`, [
    h,
    mustChange,
    userId,
  ]);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const r = await one<{ is_admin: boolean }>(`select is_admin from users where id = $1`, [userId]);
  return r?.is_admin === true;
}

// break-glass header stays usable until ADMIN_TOKEN_EXPIRES_AT passes
export function breakGlassOk(header: string | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token || !header) return false;
  if (!safeEq(header, token)) return false;
  const until = process.env.ADMIN_TOKEN_EXPIRES_AT;
  if (!until) return true;
  const t = Date.parse(until);
  return Number.isFinite(t) && Date.now() < t;
}

export async function pruneAuth(): Promise<void> {
  await none(
    `delete from sessions
      where expires_at < now() - interval '7 days'
         or (revoked_at is not null and revoked_at < now() - interval '7 days')`,
  );
  await none(`delete from password_resets where expires_at < now() - interval '1 day'`);
  await none(`delete from login_attempts where created_at < now() - interval '1 day'`);
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