import { pool } from '../db.js';

/* Crons must not double-run: Railway can have a second instance alive during a
   rolling deploy. A session advisory lock makes each job exclusive fleet-wide,
   and a dropped connection releases it for free. */

const NS = 1835434498;

function keyOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** Runs fn only if no other process holds the lock for name. */
export async function singleFlight<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const c = await pool.connect();
  const k = keyOf(name);
  let held = false;
  try {
    const r = await c.query<{ ok: boolean }>('select pg_try_advisory_lock($1, $2) as ok', [NS, k]);
    held = r.rows[0]?.ok === true;
    if (!held) return undefined;
    return await fn();
  } finally {
    if (held) {
      try { await c.query('select pg_advisory_unlock($1, $2)', [NS, k]); } catch { /* ignore */ }
    }
    c.release();
  }
}