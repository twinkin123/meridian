import type { Tx } from '../db.js';

export async function ensure(t: Tx, userId: string): Promise<void> {
  await t.query('select ensure_user_accounts($1)', [userId]);
}