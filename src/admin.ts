import { Router } from 'express';
import { runSweep, treasuryAddress, BATCH } from './sweeps.js';
import { approveClaim, rejectClaim } from './locks.js';
import { approveWithdrawal, rejectWithdrawal, payoutWithdrawal } from './withdrawals.js';
import { runRecon, latestRuns, freezeLevel, setFreeze, freezeActor } from './recon.js';
import { pool } from './db.js';
import { breakGlassOk, sessionFromToken, isAdmin, setPassword, revokeAllSessions } from './auth.js';
import { notifyUser } from './notify.js';
import { randomBytes } from 'node:crypto';

export const adminRouter = Router();

// every route below still calls authed(...); this is the single real gate
function authed(req: any): boolean {
  if (req.isAdmin === true) return true;
  return breakGlassOk(req.header('x-admin-token'));
}

adminRouter.use(async (req, res, next) => {
  if (authed(req)) return next();

  // a signed-in admin is promoted to the token header so the per-route checks pass
  const token = process.env.ADMIN_TOKEN;
  const sid = req.cookies?.sid;
  if (token && sid) {
    const s = await sessionFromToken(sid);
    if (s && (await isAdmin(s.user_id))) {
      (req as any).isAdmin = true;
      return next();
    }
  }
  return res.status(401).json({ error: 'bad_admin_token' });
});

adminRouter.get('/treasury', (_req, res) => {
  res.json({ destination: treasuryAddress() });
});

adminRouter.get('/sweep/status', async (_req, res) => {
  const { rows } = await pool.query(
    `select id, deposit_address, asset, amount_raw, status, error, attempts, created_at
       from sweeps
      order by id desc
      limit 50`,
  );
  res.json({ sweeps: rows });
});

adminRouter.post('/sweep', async (req, res) => {
  if (!authed(req)) {
    return res.status(401).json({ error: 'bad_admin_token' });
  }

  const dryRun = req.query.dryRun === '1';
  const raw = Number(req.query.limit ?? BATCH);
  const limit = Number.isFinite(raw) && raw > 0 ? raw : BATCH;

  try {
    const out = await runSweep({ dryRun, limit });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'sweep_failed' });
  }
});

adminRouter.get('/withdrawals', async (_req, res) => {
  const { rows } = await pool.query(
    `select id, user_id, asset, address, usd_amount, status, sig, error, created_at
       from withdrawals order by created_at desc limit 100`,
  );
  res.json({ withdrawals: rows });
});

adminRouter.get('/claims', async (_req, res) => {
  const { rows } = await pool.query(
    `select id, user_id, asset, usd_at_det, unlock_at, claim_requested_at
       from deposits where claim_requested_at is not null and released_at is null
       order by claim_requested_at limit 100`,
  );
  res.json({ claims: rows });
});

adminRouter.post('/claims/:id/approve', async (req, res) => {
  const ok = await approveClaim(req.params.id);
  if (!ok) return res.status(409).json({ error: 'not_pending' });
  res.json({ ok: true });
});

adminRouter.post('/claims/:id/reject', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null;
  const ok = await rejectClaim(req.params.id, reason);
  if (!ok) return res.status(409).json({ error: 'not_pending' });
  res.json({ ok: true });
});

adminRouter.get('/deposits', async (_req, res) => {
  const { rows } = await pool.query(
    `select id, user_id, asset, usd_at_det, status, unlock_at, claim_requested_at, released_at, created_at
       from deposits order by created_at desc limit 100`,
  );
  res.json({ deposits: rows });
});

adminRouter.post('/withdrawals/:id/approve', async (req, res) => {
  const out = await approveWithdrawal(req.params.id, 'admin');
  if (!out.ok) return res.status(409).json({ error: out.error });
  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/reject', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null;
  const ok = await rejectWithdrawal(req.params.id, reason);
  if (!ok) return res.status(409).json({ error: 'not_pending' });
  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/payout', async (req, res) => {
  const out = await payoutWithdrawal(req.params.id, { force: req.query.force === '1' });
  res.status(out.ok ? 200 : 409).json(out);
});

adminRouter.post('/recon/run', async (req, res) => {
  try {
    res.json(await runRecon('admin'));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'recon_failed' });
  }
});

adminRouter.get('/recon/latest', async (_req, res) => {
  res.json({ runs: await latestRuns(20), freeze: await freezeLevel(), reason: await freezeActor() });
});

adminRouter.get('/freeze', async (_req, res) => {
  res.json({ level: await freezeLevel(), reason: await freezeActor() });
});

adminRouter.post('/freeze', async (req, res) => {
  const level = Number(req.query.level);
  if (![0, 1, 2].includes(level)) return res.status(400).json({ error: 'bad_level' });
  await setFreeze(level, (req as any).isAdmin ? 'admin:session' : 'admin:token');
  res.json({ level });
});
adminRouter.post('/resume/run', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'bad_admin_token' });
  const { resumeStuckWithdrawals } = await import('./jobs/resume.js');
  try {
    res.json(await resumeStuckWithdrawals());
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

adminRouter.post('/revalue/run', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'bad_admin_token' });
  const { revalueSolDeposits } = await import('./jobs/revalue.js');
  try {
    res.json(await revalueSolDeposits());
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});
adminRouter.post('/credit/run', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'bad_admin_token' });
  const day = req.query.day ? new Date(String(req.query.day)) : new Date();
  const { runDailyCredit } = await import('./jobs/daily.js');
  res.json(await runDailyCredit(day));
});

adminRouter.post('/referral/run', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'bad_admin_token' });
  const period = req.query.period ? String(req.query.period) : undefined;
  try {
    const { runReferral } = await import('./jobs/referral.js');
    res.json(await runReferral(period));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

adminRouter.get('/referral/runs', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'bad_admin_token' });
  const { rows } = await pool.query(
    `select period, payouts, total_usd, ran_at from referral_runs order by period desc limit 24`,
  );
  res.json({ runs: rows });
});
adminRouter.get('/credit/runs', async (_req, res) => {
  const { rows } = await pool.query(
    `select day::text as day, rate_bp, posted, total, gross_total, fee_total
       from credit_runs order by day desc limit 20`,
  );
  res.json({ today: new Date().toISOString().slice(0, 10), rows });
});

const USER_SORTS: Record<string, string> = {
  created_at: 'u.created_at', email: 'u.email', available: 'available',
  reserve: 'reserve', locked: 'locked', deposited: 'dep_usd',
  withdrawn: 'wd_usd', lifetime: 'life_usd', referred: 'ref_usd', last_polled_at: 'u.last_polled_at',
};

function tempPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 14);
}

adminRouter.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const sort = USER_SORTS[String(req.query.sort ?? '')] ?? USER_SORTS.created_at;
  const dir = String(req.query.dir ?? '') === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

  const where = `where ($1 = '' or u.email ilike '%' || $1 || '%'
      or u.deposit_addr = $1 or u.referral_code = upper($1) or u.id::text = $1)`;

  const base = `
    from users u
    left join (
      select user_id,
             coalesce(sum(balance) filter (where code = '2000'), 0) available,
             coalesce(sum(balance) filter (where code = '2050'), 0) reserve,
             coalesce(sum(balance) filter (where code = '2070'), 0) locked,
             coalesce(sum(balance) filter (where code = '2060'), 0) vesting,
             coalesce(sum(balance) filter (where code = '2080'), 0) rewards,
             coalesce(sum(balance) filter (where code = '2010'), 0) in_flight
        from v_balance group by user_id
    ) b on b.user_id = u.id
    left join (
      select user_id, count(*)::int dep_n, coalesce(sum(usd_at_det), 0) dep_usd
        from deposits group by user_id
    ) d on d.user_id = u.id
    left join (
      select user_id, count(*)::int wd_n, coalesce(sum(usd_amount), 0) wd_usd
        from withdrawals group by user_id
    ) w on w.user_id = u.id
    left join (
      select v.user_id, sum(v.amt) life_usd
      from (
        select user_id, amount amt from vesting
        union all
        select referrer_id user_id, commission_usd amt from referral_ledger
      ) v group by v.user_id
    ) lf on lf.user_id = u.id
    left join (
      select u2.referred_by, count(*)::int ref_n,
             coalesce(sum(case when d2.status = 'credited' then d2.usd_at_det else 0 end), 0) ref_usd
        from users u2
        left join deposits d2 on d2.user_id = u2.id
       where u2.referred_by is not null
       group by u2.referred_by
    ) rf on rf.referred_by = u.id
    ${where}`;

  const { rows } = await pool.query(
    `select u.id, u.email, u.tier, u.is_admin, u.must_change_pw, u.created_at,
            u.deposit_addr, u.privy_address, u.referral_code,
            u.last_polled_at, u.frozen_at, u.frozen_reason,
            coalesce(b.available, 0) available, coalesce(b.reserve, 0) reserve,
            coalesce(b.locked, 0) locked, coalesce(b.vesting, 0) vesting,
            coalesce(b.rewards, 0) rewards, coalesce(b.in_flight, 0) in_flight,
            coalesce(d.dep_n, 0) dep_n, coalesce(d.dep_usd, 0) dep_usd,
            coalesce(w.wd_n, 0) wd_n, coalesce(w.wd_usd, 0) wd_usd, coalesce(lf.life_usd, 0) life_usd, coalesce(rf.ref_n, 0) ref_n, coalesce(rf.ref_usd, 0) ref_usd,
            (select count(*)::int from sessions s where s.user_id = u.id
              and s.revoked_at is null and s.expires_at > now()) live_sessions
       ${base}
      order by ${sort} ${dir} nulls last, u.created_at desc
      limit $2 offset $3`,
    [q, limit, offset],
  );

  const t = await pool.query<{ n: string; available: string; reserve: string; locked: string; dep: string; wd: string; life: string; ref: string }>(
    `select count(*)::text n,
            coalesce(sum(coalesce(b.available, 0)), 0)::text available,
            coalesce(sum(coalesce(b.reserve, 0)), 0)::text reserve,
            coalesce(sum(coalesce(b.locked, 0)), 0)::text locked,
            coalesce(sum(coalesce(d.dep_usd, 0)), 0)::text dep,
            coalesce(sum(coalesce(w.wd_usd, 0)), 0)::text wd,
            coalesce(sum(coalesce(lf.life_usd, 0)), 0)::text life,
            coalesce(sum(coalesce(rf.ref_usd, 0)), 0)::text ref
       ${base}`,
    [q],
  );
  const tt = t.rows[0];
  res.json({ users: rows, total: Number(tt.n), totals: {
    available: tt.available, reserve: tt.reserve, locked: tt.locked,
    dep: tt.dep, wd: tt.wd, life: tt.life, ref: tt.ref } });
});

adminRouter.post('/users/:id/admin', async (req, res) => {
  const want = req.body?.is_admin === true || req.body?.is_admin === 'true';
  const r = await pool.query<{ is_admin: boolean }>(
    `update users set is_admin = $2 where id = $1 returning is_admin`,
    [req.params.id, want],
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, is_admin: r.rows[0].is_admin });
});

adminRouter.post('/users/:id/tier', async (req, res) => {
  const tier = Number(req.body?.tier);
  if (!Number.isInteger(tier) || tier < 0 || tier > 4) return res.status(400).json({ error: 'bad_tier' });
  const r = await pool.query(`update users set tier = $2 where id = $1`, [req.params.id, tier]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, tier });
});

adminRouter.post('/users/:id/freeze', async (req, res) => {
  const frozen = req.body?.frozen === true || req.body?.frozen === 'true';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null;
  const r = await pool.query(
    `update users
        set frozen_at = case when $2 then now() else null end,
            frozen_reason = case when $2 then $3 else null end
      where id = $1 returning id`,
    [req.params.id, frozen, reason],
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
  await notifyUser(req.params.id, frozen ? 'account_frozen' : 'account_unfrozen',
    frozen ? 'Your account is frozen, so withdrawals are paused until an admin lifts it.'
      : 'Your account is unfrozen. Withdrawals work again.');
  res.json({ ok: true, frozen });
});

adminRouter.post('/users/:id/password', async (req, res) => {
  const given = typeof req.body?.password === 'string' ? req.body.password : '';
  const pw = given.length >= 8 ? given : tempPassword();
  await setPassword(req.params.id, pw, true);
  await revokeAllSessions(req.params.id);
  await notifyUser(req.params.id, 'password_reset',
    'An admin set a temporary password. You must change it on next sign-in.');
  res.json({ ok: true, password: pw });
});
adminRouter.get('/stats', async (_req, res) => {
  const q = async (sql: string) => (await pool.query<{ n: number }>(sql)).rows[0].n;
  res.json({
    users: await q('select count(*)::int n from users'),
    deposits: await q('select count(*)::int n from deposits'),
    withdrawals: await q('select count(*)::int n from withdrawals'),
    credit_runs: await q('select count(*)::int n from credit_runs'),
  });
});
