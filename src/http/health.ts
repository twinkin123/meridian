import { one } from '../db.js';
import { freezeLevel } from '../recon.js';

export type Health = {
  ok: boolean;
  db: boolean;
  freeze: number;
  liabilities: string | null;
  margin: string | null;
};

export async function health(): Promise<Health> {
  try {
    await one('select 1');
  } catch {
    return { ok: false, db: false, freeze: -1, liabilities: null, margin: null };
  }

  try {
    const freeze = await freezeLevel();
    const r = await one<{ l: string; m: string }>(
      `select total_liabilities() l, solvency_margin() m`,
    );
    const liabilities = r?.l ?? null;
    const margin = r?.m ?? null;
    const insolvent = margin !== null && BigInt(margin) < 0n;
    return {
      ok: !insolvent && freeze < 2,
      db: true,
      freeze,
      liabilities,
      margin,
    };
  } catch {
    return { ok: true, db: true, freeze: -1, liabilities: null, margin: null };
  }
}