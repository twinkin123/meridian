import { Router } from 'express';
import { pool } from './db.js';

export const sqlRouter = Router();

const ALLOWED = /^\s*(select|with)\s/i;

sqlRouter.get('/', async (req, res) => {
  const token = String(req.query.token ?? '');
  const expected = process.env.SQL_TOKEN;
  if (!expected || token !== expected) return res.status(401).json({ error: 'bad_token' });

  const q = String(req.query.q ?? '');
  if (!ALLOWED.test(q)) return res.status(400).json({ error: 'read_only' });
  if (q.length > 4000) return res.status(400).json({ error: 'too_long' });

  try {
    const r = await pool.query(q);
    res.json({ count: r.rowCount, rows: r.rows });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'query_failed' });
  }
});

sqlRouter.get('/mail', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!process.env.SQL_TOKEN || token !== process.env.SQL_TOKEN) {
    return res.status(401).json({ error: 'bad_token' });
  }
  const to = String(req.query.to ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'bad_email' });

  const { sendMail } = await import('./mail.js');
  const out = await sendMail({
    to,
    tag: 'admin_test',
    subject: 'Quvio mail test',
    text: `Sending works. from=${process.env.MAIL_FROM ?? '(default)'} at ${new Date().toISOString()}`,
  });
  res.status(out.sent ? 200 : 502).json(out);
});