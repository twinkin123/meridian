import { Router } from 'express';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { one, none } from '../../db.js';
import { createDepositWallet, createPrivyUser } from '../../privy.js';
import { address } from '../../solana/derive.js';
import { issueSession, throttle } from '../../auth.js';
import { requireUser, clientMeta } from '../mw/session.js';

export const walletAuth = Router();

const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 3600 * 1000,
  path: '/',
};

const SPKI = Buffer.from('302a300506032b6570032100', 'hex');

function isAddr(a: string): boolean {
  try {
    return new PublicKey(a).toBuffer().length === 32;
  } catch {
    return false;
  }
}

function message(addr: string, nonce: string): string {
  return `Quvio wants you to sign in.\n\nAddress: ${addr}\nNonce: ${nonce}`;
}

function signatureOk(addr: string, nonce: string, sig: string): boolean {
  let pk: Buffer;
  let s: Buffer;
  try {
    pk = Buffer.from(bs58.decode(addr));
    s = Buffer.from(bs58.decode(sig));
  } catch {
    return false;
  }
  if (pk.length !== 32 || s.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI, pk]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message(addr, nonce)), key, s);
  } catch {
    return false;
  }
}

/** Issues a nonce and consumes it on success, so a signature cannot be replayed. */
async function consume(addr: string, sig: string): Promise<'ok' | 'no_nonce' | 'bad_signature'> {
  const row = await one<{ nonce: string }>(
    `select nonce from wallet_nonces where addr = $1 and created_at > now() - interval '10 minutes'`,
    [addr],
  );
  if (!row) return 'no_nonce';
  if (!signatureOk(addr, row.nonce, sig)) return 'bad_signature';
  await none(`delete from wallet_nonces where addr = $1`, [addr]);
  return 'ok';
}

walletAuth.post('/wallet/nonce', async (req, res) => {
  const addr = String(req.body?.addr ?? '').trim();
  if (!isAddr(addr)) return res.status(400).json({ error: 'bad_address' });

  try {
    await throttle(`wnonce:${req.ip}`, 40);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const nonce = randomBytes(16).toString('hex');
  await none(
    `insert into wallet_nonces (addr, nonce) values ($1, $2)
     on conflict (addr) do update set nonce = excluded.nonce, created_at = now()`,
    [addr, nonce],
  );
  res.json({ nonce, message: message(addr, nonce) });
});

walletAuth.post('/wallet', async (req, res) => {
  const addr = String(req.body?.addr ?? '').trim();
  const sig = String(req.body?.signature ?? '');
  if (!isAddr(addr) || !sig) return res.status(400).json({ error: 'bad_request' });

  try {
    await throttle(`wallet:${req.ip}`, 20);
  } catch {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const out = await consume(addr, sig);
  if (out !== 'ok') return res.status(401).json({ error: out });

  let u = await one<{ id: string }>(`select id from users where wallet_addr = $1`, [addr]);
  let created = false;

  if (!u) {
    const ref = String(req.body?.ref ?? '').trim().toUpperCase();
    const referrer = ref
      ? await one<{ id: string }>(`select id from users where referral_code = $1`, [ref])
      : null;

    const row = await one<{ id: string; deposit_index: number }>(
      `insert into users (email, pw_hash, wallet_addr, deposit_addr, referral_code, referred_by)
       values (null, null, $1, 'pending', upper(substr(md5(random()::text),1,8)), $2)
       returning id, deposit_index`,
      [addr, referrer?.id ?? null],
    );

    try {
      const pu = await createPrivyUser(row.id, addr);
      await none(`update users set privy_user_id = $1 where id = $2`, [pu, row.id]);
      const w = await createDepositWallet(row.id, pu);
      await none(
        `update users set deposit_addr = $1, privy_wallet_id = $2, privy_address = $3 where id = $4`,
        [w.address, w.id, w.address, row.id],
      );
    } catch {
      const fallback = address(row.deposit_index);
      await none(`update users set deposit_addr = $1, privy_address = $1 where id = $2`, [
        fallback,
        row.id,
      ]);
    }

    await none(
      `insert into accounts (code, kind, owner_type, owner_id)
       select c, 'liability', 'user', $1 from unnest(array['2000','2010','2020','2050','2060','2070','2080']) c`,
      [row.id],
    );

    u = { id: row.id };
    created = true;
  }

  const token = await issueSession(u.id, clientMeta(req));
  res.cookie('sid', token, COOKIE);
  res.status(created ? 201 : 200).json({ ok: true, id: u.id, created });
});

walletAuth.post('/wallet/link', requireUser, async (req, res) => {
  const addr = String(req.body?.addr ?? '').trim();
  const sig = String(req.body?.signature ?? '');
  if (!isAddr(addr) || !sig) return res.status(400).json({ error: 'bad_request' });

  const out = await consume(addr, sig);
  if (out !== 'ok') return res.status(401).json({ error: out });

  const taken = await one<{ id: string }>(`select id from users where wallet_addr = $1`, [addr]);
  if (taken && taken.id !== req.userId) return res.status(409).json({ error: 'wallet_taken' });

  await none(`update users set wallet_addr = $1 where id = $2`, [addr, req.userId]);
  res.json({ ok: true });
});