import { one } from '../db.js';
import { freezeLevel } from '../recon.js';

export type Health = {
  ok: boolean;
  db: boolean;
  recon: boolean;
  freeze: number;
  solvent: boolean;
  frozen: boolean;
  liabilities: string | null;
  margin: string | null;
};

/**
 * ok is process health only. Solvency and freeze are reported, not enforced:
 * a frozen or insolvent platform is still a running process, so the healthcheck
 * should not cycle the container over either. A failed db or a thrown recon read
 * still fails, because nothing was measured.
 */
export async function health(): Promise<Health> {
  try {
    await one('select 1');
  } catch {
    return { ok: false, db: false, recon: false, freeze: -1, solvent: false, frozen: false, liabilities: null, margin: null };
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
      ok: true,
      db: true,
      recon: true,
      freeze,
      solvent: !insolvent,
      frozen: freeze >= 2,
      liabilities,
      margin,
    };
  } catch {
    return { ok: false, db: true, recon: false, freeze: -1, solvent: false, frozen: false, liabilities: null, margin: null };
  }
}