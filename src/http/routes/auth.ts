import { clientIp } from '../mw/ip.js';
import { createDepositWallet, createPrivyUser } from '../../privy.js';
import { Router } from 'express';
import { ensureDepositAddress } from '../../deposits.js';
import { one, none } from '../../db.js';
import { address } from '../../solana/derive.js';
import {
  hashPw,
  checkPw,
  issueSession,
  throttle,
  revokeSession,
  revokeSessionById,
  revokeAllSessions,
  listSessions,
  createReset,
  consumeReset,
  createVerify,
  consumeVerify,
  setPassword,
  pruneAuth,
} from '../../auth.js';
import { requireUser, clientMeta } from '../mw/session.js';
import { sendResetMail, sendWelcomeMail, sendVerifyMail } from '../../mail.js';
import { env } from '../../env.js';

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
    await throttle(`ip:${clientIp(req)}`, 10);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const exists = await one<{ id: string }>(`select id from users where lower(email) = $1`, [email]);
  if (exists) return res.status(409).json({ error: 'email_taken' });

  const pwHash = await hashPw(pw);
  const ref = String(req.body?.ref ?? '').trim().toUpperCase();
  const referrer = ref
    ? await one<{ id: string }>(`select id from users where referral_code = $1`, [ref])
    : null;
  const row = await one<{ id: string; deposit_index: number }>(
    `insert into users (email, pw_hash, deposit_addr, referral_code, referred_by)
     values ($1, $2, 'pending', upper(substr(md5(random()::text),1,8)), $3) returning id, deposit_index`,
    [email, pwHash, referrer?.id ?? null],
  );

  let addr: string;
  try {
    const pu = await createPrivyUser(row.id, email);
    await none(`update users set privy_user_id = $1 where id = $2`, [pu, row.id]);
    const w = await createDepositWallet(row.id, pu);
    await none(
      `update users set deposit_addr = $1, privy_wallet_id = $2, privy_address = $3 where id = $4`,
      [w.address, w.id, w.address, row.id],
    );
    addr = w.address;
  } catch {
        /* No wallet means no sweeper, so do not invent a derived address. The ensure
       path creates a real wallet, or leaves 'pending' for the deposit page to retry. */
    const d = await ensureDepositAddress(row.id).catch(() => null);
    addr = d ?? 'pending';
  }  await none(
    `insert into accounts (code, kind, owner_type, owner_id)
     select c, 'liability', 'user', $1 from unnest(array['2000','2010','2020','2050','2060','2070','2080']) c`,
    [row.id],
  );

  const vt = await createVerify(row.id);
  void sendVerifyMail(email, `${env.publicBaseUrl || 'https://www.quvio.io'}/auth/verify?token=${vt}`);

  const token = await issueSession(row.id, clientMeta(req));
  res.cookie('sid', token, COOKIE);
  res.status(201).json({ id: row.id, email, depositAddress: addr });
});

auth.get('/verify', async (req, res) => {
  const t = String(req.query.token ?? '');
  const ok = t ? await consumeVerify(t) : null;
  if (ok) void sendWelcomeMail(ok.email);
  const head = ok ? 'Email confirmed' : 'Link expired';
  const body = ok
    ? 'Your address is confirmed. Sign in and carry on.'
    : 'This link was used already or has timed out. Sign in and request a new one.';
  res.type('html').send(
    `<!doctype html><meta charset="utf-8"><title>Quvio</title>` +
    `<body style="font:16px system-ui;background:#0d0d0f;color:#e8e8ea;display:grid;place-items:center;height:100vh;margin:0">` +
    `<div style="text-align:center;max-width:22rem"><h1 style="font-size:1.25rem">${head}</h1>` +
    `<p style="color:#9a9aa2">${body}</p><a href="/auth.html" style="color:#7cc4ff">Continue</a></div>`,
  );
});

auth.post('/verify/resend', requireUser, async (req, res) => {
  const u = await one<{ id: string; email: string; email_verified_at: string | null }>(
    `select id, email, email_verified_at from users where id = $1`, [req.userId]);
  if (!u) return res.status(401).json({ error: 'no_session' });
  if (u.email_verified_at) return res.json({ ok: true, already: true });
  try { await throttle(`verify:${u.id}`, 3); } catch { return res.status(429).json({ error: 'too_many_attempts' }); }
  await none(`update email_verifications set used_at = now() where user_id = $1 and used_at is null`, [u.id]);
  const vt = await createVerify(u.id);
  const out = await sendVerifyMail(u.email, `${env.publicBaseUrl || 'https://www.quvio.io'}/auth/verify?token=${vt}`);
  res.json({ ok: out.sent });
});

auth.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pw = String(req.body?.password ?? '');

  try {
    await throttle(`email:${email}`, 5);
    await throttle(`ip:${clientIp(req)}`, 20);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const u = await one<{ id: string; pw_hash: string; must_change_pw: boolean }>(
    `select id, pw_hash, must_change_pw from users where lower(email) = $1`,
    [email],
  );
  if (!u) return res.status(401).json({ error: 'bad_credentials' });

  const ok = await checkPw(pw, u.pw_hash);
  if (!ok) return res.status(401).json({ error: 'bad_credentials' });

  const token = await issueSession(u.id, clientMeta(req));
  res.cookie('sid', token, COOKIE);
  void pruneAuth().catch(() => {});
  res.json({ ok: true, mustChange: u.must_change_pw === true });
});

auth.post('/logout', async (req, res) => {
  const token = req.cookies?.sid;
  if (token) await revokeSession(token);
  res.clearCookie('sid', { path: '/' });
  res.cookie('bye', '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 120_000,
    path: '/',
  });
  res.json({ ok: true });
});

auth.get('/sessions', requireUser, async (req, res) => {
  const rows = await listSessions(req.userId!);
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      ua: s.ua,
      ip: s.ip,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      revoked: Boolean(s.revoked_at),
      current: s.id === req.sessionId,
    })),
  });
});

auth.delete('/sessions', requireUser, async (req, res) => {
  const n = await revokeAllSessions(req.userId!, req.sessionId);
  res.json({ ok: true, revoked: n });
});

auth.delete('/sessions/:id', requireUser, async (req, res) => {
  const gone = await revokeSessionById(req.userId!, String(req.params.id));
  if (!gone) return res.status(404).json({ error: 'not_found' });
  if (String(req.params.id) === req.sessionId) res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

auth.post('/password', requireUser, async (req, res) => {
  const cur = String(req.body?.current ?? '');
  const pw = String(req.body?.password ?? '');
  if (pw.length < 8) return res.status(400).json({ error: 'weak_password' });

  const u = await one<{ pw_hash: string }>(`select pw_hash from users where id = $1`, [req.userId]);
  if (!u || !(await checkPw(cur, u.pw_hash))) return res.status(401).json({ error: 'bad_credentials' });

  await setPassword(req.userId!, pw, false);
  await revokeAllSessions(req.userId!, req.sessionId);
  res.json({ ok: true });
});

auth.post('/forgot', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();

  try {
    await throttle(`reset:${clientIp(req)}`, 10);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const u = await one<{ id: string }>(`select id from users where lower(email) = $1`, [email]);

  let link: string | undefined;
  if (u) {
    const token = await createReset(u.id);
    const base = process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
    link = `${base}/auth.html?reset=${token}`;
    const out = await sendResetMail(email, link);
    if (out.sent) link = undefined;
  }

  // always 200 so the response cannot enumerate accounts
  res.json({ ok: true, ...(link ? { link } : {}) });
});

auth.post('/reset', async (req, res) => {
  const token = String(req.body?.token ?? '').trim();
  const pw = String(req.body?.password ?? '');
  if (pw.length < 8) return res.status(400).json({ error: 'weak_password' });

  try {
    await throttle(`reset-use:${clientIp(req)}`, 20);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const userId = await consumeReset(token);
  if (!userId) return res.status(400).json({ error: 'bad_token' });

  await setPassword(userId, pw, false);
  await revokeAllSessions(userId);
  const fresh = await issueSession(userId, clientMeta(req));
  res.cookie('sid', fresh, COOKIE);
  res.json({ ok: true });
});