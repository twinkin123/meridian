import { pool, one } from './db.js';
import { sendMail } from './mail.js';

type Q = { query: (text: string, params?: any[]) => Promise<any> };

/** Only these reach an inbox; everything else stays in the bell. */
const MAILED: Record<string, string> = {
  withdrawal_sent: 'Quvio: withdrawal sent',
  withdrawal_failed: 'Quvio: withdrawal failed',
  withdrawal_rejected: 'Quvio: withdrawal needs attention',
};

/** Best-effort, fire-and-forget. A failed mail never fails the action. */
function mailFor(userId: string, kind: string, body: string): void {
  const subject = MAILED[kind];
  if (!subject) return;
  void (async () => {
    try {
      const u = await one<{ email: string }>('select email from users where id = $1', [userId]);
      if (!u?.email) return;
      await sendMail({ to: u.email, tag: kind, subject, replyTo: 'support@quvio.io', text: body });
    } catch { /* ignore */ }
  })();
}

/** Best-effort notification inside a transaction. A lost note never fails the action. */
export async function notify(c: Q, userId: string, kind: string, body: string): Promise<void> {
  try {
    await c.query(`insert into notifications (user_id, kind, body) values ($1, $2, $3)`, [userId, kind, body]);
  } catch { /* ignore */ }
  mailFor(userId, kind, body);
}

/** Same, outside a transaction. */
export async function notifyUser(userId: string, kind: string, body: string): Promise<void> {
  try {
    await pool.query(`insert into notifications (user_id, kind, body) values ($1, $2, $3)`, [userId, kind, body]);
  } catch { /* ignore */ }
  mailFor(userId, kind, body);
}

/** Micro-dollars to a readable string. */
export function usdStr(micro: bigint): string {
  const n = Number(micro) / 1e6;
  return n < 0.01 ? n.toFixed(4) : n.toFixed(2);
}