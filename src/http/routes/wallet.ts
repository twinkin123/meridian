import { Router } from 'express';
import { requireUser } from '../mw/session.js';
import { one, pool, tx } from '../../db.js';
import { freezeLevel } from '../../recon.js';
import { requestClaim, cancelClaim } from '../../locks.js';
import {
  requestWithdrawal, cancelWithdrawal, payoutWithdrawal, computeCap, MIN_WITHDRAW, NEW_ADDR_CAP,
} from '../../withdrawals.js'; import { post } from '../../ledger/post.js';

export const wallet = Router();

wallet.get('/balance', requireUser, async (req, res) => {
  const uid = req.userId!;
  const r = await one<{ b: string; h: string; p: string; nx: string | null; l: string; rw: string }>(
    `select
       coalesce((select balance from v_balance where user_id=$1 and code='2000'),0) b,
       coalesce((select balance from v_balance where user_id=$1 and code='2050'),0) h, coalesce((select balance from v_balance where user_id=$1 and code='2070'),0) l, coalesce((select balance from v_balance where user_id=$1 and code='2080'),0) rw, coalesce((select sum(amount) from vesting where user_id=$1 and released_at is null),0) p, (select min(due_at) from vesting where user_id=$1 and released_at is null) nx`,
    [uid],
  );
  res.json({
    balance: r.b,
    referralCode: (await one<{ c: string | null }>(`select referral_code c from users where id=$1`, [uid]))?.c ?? null,
    invited: Number((await one<{ n: string }>(`select count(*)::text n from users where referred_by=$1`, [uid]))?.n ?? 0),
    referralEarned: (await one<{ e: string }>(`select coalesce(sum(commission_usd),0)::text e from referral_ledger where referrer_id=$1`, [uid]))?.e ?? '0', lastRateBp: (await one<{ r: number | null }>(`select rate_bp r from credit_runs where day <= (now() at time zone 'utc')::date order by day desc limit 1`))?.r ?? null,
    referrals: (await pool.query<{ id: string; email: string; created_at: string; invested: string; same_ip: boolean }>(
      `select u.id, u.email, u.created_at,
              coalesce(sum(case when d.status='credited' then d.usd_at_det else 0 end),0)::text invested,
              exists(select 1 from referral_ledger rl join deposits dd on rl.period = 'first:' || dd.id::text where dd.user_id = u.id and rl.same_ip) same_ip
         from users u
         left join deposits d on d.user_id = u.id
        where u.referred_by = $1
        group by u.id, u.email, u.created_at
        order by u.created_at desc
        limit 50`,
      [uid],
    )).rows,
    pending: r.p, locked: r.l, rewards: r.rw,
    nextRelease: r.nx,
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

wallet.get('/settlements', requireUser, async (req, res) => {
  const { rows } = await pool.query(
    `select id, day, amount, due_at, released_at from vesting where user_id=$1 order by (released_at is null) desc, case when released_at is null then due_at end asc, released_at desc limit 50`,
    [req.userId!],
  );
  res.json({ settlements: rows });
});

wallet.get('/deposits', requireUser, async (req, res) => {
  const { rows } = await pool.query(
    `select id, asset, usd_at_det, status, unlock_at, claim_requested_at, released_at
       from deposits where user_id=$1 order by created_at desc limit 50`,
    [req.userId!],
  );
  res.json({ deposits: rows });
});

wallet.post('/deposits/:id/claim', requireUser, async (req, res) => {
  const out = await requestClaim(req.userId!, req.params.id);
  if (out !== 'requested') return res.status(409).json({ error: out });
  res.json({ ok: true });
});

  wallet.post('/deposits/:id/claim/cancel', requireUser, async (req, res) => {
    const ok = await cancelClaim(req.userId!, req.params.id);
    if (!ok) return res.status(409).json({ error: 'not_pending' });
    res.json({ ok: true });
  });

  wallet.get('/notifications', requireUser, async (req, res) => {
    const { rows } = await pool.query(
      `select id, kind, body, created_at, read_at from notifications
        where user_id = $1 order by created_at desc limit 20`,
      [req.userId!],
    );
    res.json({ notifications: rows });
  });

  wallet.post('/notifications/read', requireUser, async (req, res) => {
    await pool.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [req.userId!]);
    res.json({ ok: true });
  });


wallet.post('/withdraw', requireUser, async (req, res) => {
  const uid = req.userId!;
  if ((await freezeLevel()) >= 2) return res.status(503).json({ error: 'frozen' });

  const { asset, address, usd } = req.body ?? {};
  if (asset !== 'SOL' && asset !== 'USDC') return res.status(400).json({ error: 'bad_asset' });
  if (typeof address !== 'string') return res.status(400).json({ error: 'bad_address' });
  if (!/^\d+$/.test(String(usd))) return res.status(400).json({ error: 'bad_amount' });

  const out = await requestWithdrawal(uid, asset, address, BigInt(usd), req.body?.source === 'rewards' ? 'rewards' : 'available');
  if (!out.ok) return res.status(400).json({ error: out.error, cap: out.cap });
  res.json({ id: out.id, status: out.status, cap: out.cap });

  /* approved goes out immediately; payApproved retries if this drops */
  if (out.status === 'approved') {
    void payoutWithdrawal(out.id).catch((e) => console.error('payout', e instanceof Error ? e.message : e));
  }
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














