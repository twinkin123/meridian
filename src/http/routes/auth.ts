import { Router } from 'express';
import { one, none } from '../../db.js';
import { address } from '../../solana/derive.js';
import { hashPw, checkPw, issueSession, throttle, revokeSession } from '../../auth.js';
import { requireUser } from '../mw/session.js';

export const auth = Router();

const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 3600 * 1000,
  path: '/',
};

auth.post('/signup', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pw = String(req.body?.password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'bad_email' });
  if (pw.length < 8) return res.status(400).json({ error: 'weak_password' });

  try {
    await throttle(`ip:${req.ip}`, 10);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const exists = await one<{ id: string }>(`select id from users where lower(email) = $1`, [email]);
  if (exists) return res.status(409).json({ error: 'email_taken' });

  const pwHash = await hashPw(pw);
  const row = await one<{ id: string; deposit_index: number }>(
    `insert into users (email, pw_hash, deposit_addr)
     values ($1, $2, 'pending') returning id, deposit_index`,
    [email, pwHash],
  );

  const addr = address(row.deposit_index);
  await none(`update users set deposit_addr = $1 where id = $2`, [addr, row.id]);
  await none(`insert into accounts (code, kind, owner_type, owner_id) select c, 'liability', 'user', $1 from unnest(array['2000','2010','2020','2050']) c`, [row.id]);

  const token = await issueSession(row.id);
  res.cookie('sid', token, COOKIE);
  res.status(201).json({ id: row.id, email, depositAddress: addr });
});

auth.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pw = String(req.body?.password ?? '');

  try {
    await throttle(`email:${email}`, 5);
    await throttle(`ip:${req.ip}`, 20);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const u = await one<{ id: string; pw_hash: string }>(
    `select id, pw_hash from users where lower(email) = $1`,
    [email],
  );
  if (!u) return res.status(401).json({ error: 'bad_credentials' });

  const ok = await checkPw(pw, u.pw_hash);
  if (!ok) return res.status(401).json({ error: 'bad_credentials' });

  const token = await issueSession(u.id);
  res.cookie('sid', token, COOKIE);
  res.json({ ok: true });
});

auth.post('/logout', requireUser, async (req, res) => {
  const token = req.cookies?.sid;
  if (token) await revokeSession(token);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});
