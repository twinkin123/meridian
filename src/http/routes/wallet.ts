import { Router } from 'express';
import { requireUser } from '../mw/session.js';
import { one, pool, tx } from '../../db.js';
import { freezeLevel } from '../../recon.js';
import {
  requestWithdrawal, cancelWithdrawal, computeCap, MIN_WITHDRAW, NEW_ADDR_CAP,
} from '../../withdrawals.js'; import { post } from '../../ledger/post.js';

export const wallet = Router();

wallet.get('/balance', requireUser, async (req, res) => {
  const uid = req.userId!;
  const r = await one<{ b: string; h: string }>(
    `select
       coalesce((select balance from v_balance where user_id=$1 and code='2000'),0) b,
       coalesce((select balance from v_balance where user_id=$1 and code='2050'),0) h`,
    [uid],
  );
  res.json({
    balance: r.b,
    referralCode: (await one<{ c: string | null }>(`select referral_code c from users where id=$1`, [uid]))?.c ?? null,
    invited: Number((await one<{ n: string }>(`select count(*)::text n from users where referred_by=$1`, [uid]))?.n ?? 0),
    referralEarned: (await one<{ e: string }>(`select coalesce(sum(commission_usd),0)::text e from referral_ledger where referrer_id=$1`, [uid]))?.e ?? '0', lastRateBp: (await one<{ r: number | null }>(`select rate_bp r from credit_runs order by day desc limit 1`))?.r ?? null,
    held: r.h,
    minWithdraw: MIN_WITHDRAW.toString(),
    newAddressCap: NEW_ADDR_CAP.toString(),
    freeze: await freezeLevel(),
  });
});

wallet.get('/withdrawals', requireUser, async (req, res) => {
  const { rows } = await pool.query(
    `select id, asset, address, usd_amount, status, sig, error, created_at
       from withdrawals where user_id=$1 order by created_at desc limit 50`,
    [req.userId!],
  );
  res.json({ withdrawals: rows });
});

wallet.post('/claim', requireUser, async (req, res) => { const uid = req.userId!; const out = await tx(async (t) => { const r = await t.query(`select coalesce((select balance from v_balance where user_id=$1 and code='2050'),0)::text h`, [uid]); const held = BigInt(r.rows[0].h); if (held <= 0n) return { moved: 0n }; await post(t, 'claim', uid, [{ code: '2050', owner: uid, amount: -held }, { code: '2000', owner: uid, amount: held }]); return { moved: held }; }); if (out.moved === 0n) return res.status(400).json({ error: 'nothing_to_claim' }); res.json({ claimed: out.moved.toString() }); });
wallet.post('/withdraw', requireUser, async (req, res) => {
  const uid = req.userId!;
  if ((await freezeLevel()) >= 2) return res.status(503).json({ error: 'frozen' });

  const { asset, address, usd } = req.body ?? {};
  if (asset !== 'SOL' && asset !== 'USDC') return res.status(400).json({ error: 'bad_asset' });
  if (typeof address !== 'string') return res.status(400).json({ error: 'bad_address' });
  if (!/^\d+$/.test(String(usd))) return res.status(400).json({ error: 'bad_amount' });

  const out = await requestWithdrawal(uid, asset, address, BigInt(usd));
  if (!out.ok) return res.status(400).json({ error: out.error, cap: out.cap });
  res.json({ id: out.id, status: out.status, cap: out.cap });
});

wallet.post('/withdraw/:id/cancel', requireUser, async (req, res) => {
  const ok = await cancelWithdrawal(req.params.id, req.userId!);
  if (!ok) return res.status(409).json({ error: 'not_cancellable' });
  res.json({ ok: true });
});

wallet.get('/cap', requireUser, async (req, res) => {
  const uid = req.userId!;
  const r = await one<{ b: string }>(
    `select coalesce(balance,0) b from v_balance where user_id=$1 and code='2000'`,
    [uid],
  );
  const addr = req.query.address as string | undefined;
  if (!addr) return res.json({ cap: computeCap(false, 0, BigInt(r.b)).toString() });

  const seen = await one<{ first_seen: string }>(
    'select first_seen from withdrawal_addresses where user_id=$1 and address=$2',
    [uid, addr],
  );
  const known = Boolean(seen);
  const age = known ? Date.now() - new Date(seen.first_seen).getTime() : 0;
  res.json({ cap: computeCap(known, age, BigInt(r.b)).toString() });
});




