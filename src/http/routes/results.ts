import { Router } from 'express';
import { pool } from '../../db.js';
import { requireUser } from '../mw/session.js';

export const results = Router();

const DAYS = 30;

results.get('/', requireUser, async (_req, res) => {
  const { rows } = await pool.query(
    `select day::text as day, rate_bp, posted, total
       from credit_runs where day <= current_date
      order by day desc
      limit $1`,
    [DAYS],
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ today: new Date().toISOString().slice(0, 10), days: rows });
});