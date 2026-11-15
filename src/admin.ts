import { Router } from 'express';
import { runSweep, treasuryAddress, BATCH } from './sweeps.js';
import { approveWithdrawal, payoutWithdrawal } from './withdrawals.js';
import { pool } from './db.js';

export const adminRouter = Router();

function authed(header: (k: string) => string | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  return header('x-admin-token') === token;
}

adminRouter.use((req, res, next) => {
  if (!authed((k) => req.header(k))) return res.status(401).json({ error: 'bad_admin_token' });
  next();
});

adminRouter.get('/treasury', (_req, res) => {
  res.json({ destination: treasuryAddress() });
});

adminRouter.get('/sweep/status', async (_req, res) => {
  const { rows } = await pool.query(
    `select id, deposit_address, asset, amount_raw, status, error, attempts, created_at
       from sweeps order by id desc limit 50`,
  );
  res.json({ sweeps: rows });
});

adminRouter.post('/sweep', async (req, res) => {
  const dryRun = req.query.dryRun === '1';
  const raw = Number(req.query.limit ?? BATCH);
  const limit = Number.isFinite(raw) && raw > 0 ? raw : BATCH;
  try {
    res.json(await runSweep({ dryRun, limit }));
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

adminRouter.post('/withdrawals/:id/approve', async (req, res) => {
  const ok = await approveWithdrawal(req.params.id, 'admin');
  if (!ok) return res.status(409).json({ error: 'not_pending' });
  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/payout', async (req, res) => {
  const out = await payoutWithdrawal(req.params.id);
  res.status(out.ok ? 200 : 409).json(out);
});