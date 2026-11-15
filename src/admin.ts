import { Router } from 'express';
import { runSweep, treasuryAddress, BATCH } from './sweeps.js';
import { pool } from './db.js';

export const adminRouter = Router();

function authed(header: (k: string) => string | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  return header('x-admin-token') === token;
}

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