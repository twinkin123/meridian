import { one } from '../db.js';

export async function health(): Promise<{ ok: boolean; db: boolean }> {
  try {
    await one('select 1');
    return { ok: true, db: true };
  } catch {
    return { ok: false, db: false };
  }
}
