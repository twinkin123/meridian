import { pool } from './db.js';

type Q = { query: (text: string, params?: any[]) => Promise<any> };

/** Best-effort notification inside a transaction. A lost note never fails the action. */
export async function notify(c: Q, userId: string, kind: string, body: string): Promise<void> {
  try {
    await c.query(`insert into notifications (user_id, kind, body) values ($1, $2, $3)`, [userId, kind, body]);
  } catch { /* ignore */ }
}

/** Same, outside a transaction. */
export async function notifyUser(userId: string, kind: string, body: string): Promise<void> {
  try {
    await pool.query(`insert into notifications (user_id, kind, body) values ($1, $2, $3)`, [userId, kind, body]);
  } catch { /* ignore */ }
}

/** Micro-dollars to a readable string. */
export function usdStr(micro: bigint): string {
  const n = Number(micro) / 1e6;
  return n < 0.01 ? n.toFixed(4) : n.toFixed(2);
}