import type { Tx } from '../db.js';

export type Leg = { code: string; owner?: string | null; amount: bigint };

export async function post(t: Tx, kind: string, ref: string | null, legs: Leg[]) {
  const sum = legs.reduce((a, l) => a + l.amount, 0n);
  if (sum !== 0n) throw new Error(`unbalanced ${kind}: ${sum}`);

  const json = legs.map((l) => ({
    code: l.code, owner: l.owner ?? null, amount: l.amount.toString(),
  }));

  const r = await t.query('select post($1,$2,$3) id', [kind, ref, JSON.stringify(json)]);
  return r.rows[0].id as string;
}
