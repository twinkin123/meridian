import { Router } from 'express';
import { pool } from './db.js';

export const sqlRouter = Router();

/** Accepts the current token and, during a rotation, the previous one. */
function sqlTokenOk(token: string): boolean {
  const cur = process.env.SQL_TOKEN;
  if (!cur || !token) return false;
  if (token === cur) return true;
  const prev = process.env.SQL_TOKEN_PREV;
  return Boolean(prev) && token === prev;
}

const ALLOWED = /^\s*(select|with)\s/i;
const WRITES = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|refresh|comment)\b/i;

sqlRouter.get('/', async (req, res) => {
  const token = String(req.get('x-sql-token') ?? req.query.token ?? '');
  if (!sqlTokenOk(token)) return res.status(401).json({ error: 'bad_token' });

  const write = req.query.write === '1';
  const raw = String(req.query.q ?? '').trim();
  if (!ALLOWED.test(raw)) return res.status(400).json({ error: 'read_only' });
  if (!write && WRITES.test(raw)) return res.status(400).json({ error: 'not_read_only' });
  const q = raw.replace(/;+\s*$/, '');
  if (q.includes(';')) return res.status(400).json({ error: 'one_statement' });
  if (q.length > 4000) return res.status(400).json({ error: 'too_long' });

  const c = await pool.connect();
  try {
    await c.query(write ? 'begin' : 'begin read only');
    await c.query("set local statement_timeout = '8000'");
    const r = await c.query(q);
    await c.query('commit');
    res.json({ count: r.rowCount, rows: r.rows });
  } catch (e) {
    await c.query('rollback').catch(() => {});
    res.status(400).json({ error: e instanceof Error ? e.message : 'query_failed' });
  } finally {
    c.release();
  }
});

sqlRouter.get('/mail', async (req, res) => {
  const token = String(req.header('x-sql-token') ?? req.query.token ?? '');
  if (!sqlTokenOk(token)) return res.status(401).json({ error: 'bad_token' });
  const to = String(req.query.to ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'bad_email' });

  try {
    const { sendMail } = await import('./mail.js');
    const out = await sendMail({
      to,
      tag: 'admin_test',
      subject: 'Quvio mail test',
      text: `Sending works. from=${process.env.MAIL_FROM ?? '(default)'} at ${new Date().toISOString()}`,
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ sent: false, error: e instanceof Error ? e.message : 'send_failed' });
  }
});