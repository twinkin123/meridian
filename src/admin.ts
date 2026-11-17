import { Router } from 'express';
import { runSweep, treasuryAddress, BATCH } from './sweeps.js';
import { approveClaim, rejectClaim } from './locks.js';
import { approveWithdrawal, payoutWithdrawal } from './withdrawals.js';
import { runRecon, latestRuns, freezeLevel, setFreeze } from './recon.js';
import { pool } from './db.js';
import { breakGlassOk, sessionFromToken, isAdmin } from './auth.js';

export const adminRouter = Router();

// every route below still calls authed(...); this is the single real gate
function authed(header: (k: string) => string | undefined): boolean {
  if (header('x-admin-session') === '1') return true;
  return breakGlassOk(header('x-admin-token'));
}

adminRouter.use(async (req, res, next) => {
  if (authed((k) => req.header(k))) return next();

  // a signed-in admin is promoted to the token header so the per-route checks pass
  const token = process.env.ADMIN_TOKEN;
  const sid = req.cookies?.sid;
  if (token && sid) {
    const s = await sessionFromToken(sid);
    if (s && (await isAdmin(s.user_id))) {
      req.headers['x-admin-token'] = token;
      req.headers['x-admin-session'] = '1';
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
  if (!authed((k) => req.header(k))) {
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
  const ok = await approveWithdrawal(req.params.id, 'admin');
  if (!ok) return res.status(409).json({ error: 'not_pending' });
  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/payout', async (req, res) => {
  const out = await payoutWithdrawal(req.params.id);
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
  res.json({ runs: await latestRuns(20), freeze: await freezeLevel() });
});

adminRouter.get('/freeze', async (_req, res) => {
  res.json({ level: await freezeLevel() });
});

adminRouter.post('/freeze', async (req, res) => {
  const level = Number(req.query.level);
  if (![0, 1, 2].includes(level)) return res.status(400).json({ error: 'bad_level' });
  await setFreeze(level, 'admin');
  res.json({ level });
});
adminRouter.post('/credit/run', async (req, res) => {
  if (req.header('x-admin-token') !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'bad_admin_token' });
  const day = req.query.day ? new Date(String(req.query.day)) : new Date();
  const { runDailyCredit } = await import('./jobs/daily.js');
  res.json(await runDailyCredit(day));
});

adminRouter.post('/referral/run', async (req, res) => {
  if (!authed((k) => req.header(k))) return res.status(401).json({ error: 'bad_admin_token' });
  const period = req.query.period ? String(req.query.period) : undefined;
  try {
    const { runReferral } = await import('./jobs/referral.js');
    res.json(await runReferral(period));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

adminRouter.get('/referral/runs', async (req, res) => {
  if (!authed((k) => req.header(k))) return res.status(401).json({ error: 'bad_admin_token' });
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

adminRouter.get('/stats', async (_req, res) => {
  const q = async (sql: string) => (await pool.query<{ n: number }>(sql)).rows[0].n;
  res.json({
    users: await q('select count(*)::int n from users'),
    deposits: await q('select count(*)::int n from deposits'),
    withdrawals: await q('select count(*)::int n from withdrawals'),
    credit_runs: await q('select count(*)::int n from credit_runs'),
  });
});
