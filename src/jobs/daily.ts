import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';

const MIN_BP = 100;
const MAX_BP = 350;
const MIN_BALANCE = 10_000_000n;
const SLICES = 4;
const SLICE_MS = 6 * 60 * 60 * 1000;

export type CreditResult = { skipped?: boolean; rateBp?: number; posted: number; total: string };

export async function runDailyCredit(day = new Date()): Promise<CreditResult> {
  const key = day.toISOString().slice(0, 10);
  const rateBp = MIN_BP + Math.floor(Math.random() * (MAX_BP - MIN_BP + 1));

  const claim = await pool.query(
    `insert into credit_runs (day, rate_bp) values ($1, $2) on conflict (day) do nothing returning day`,
    [key, rateBp],
  );
  if (claim.rowCount === 0) return { skipped: true, posted: 0, total: '0' };

  const { rows } = await pool.query<{ user_id: string; b: string }>(
    `select user_id, balance b from v_balance where code = '2000' and balance >= $1`,
    [MIN_BALANCE.toString()],
  );

  let posted = 0;
  let total = 0n;

  for (const r of rows) {
    const net = (BigInt(r.b) * BigInt(rateBp)) / 10000n;
    if (net <= 0n) continue;
    await tx(async (c) => {
      await c.query('select ensure_user_accounts($1)', [r.user_id]);
      await post(c, 'SettlementCredit', `${key}:${r.user_id}`, [
        { code: '1010', amount: net },
        { code: '2060', owner: r.user_id, amount: -net },
      ]);
      const base = net / BigInt(SLICES);
      let left = net;
      for (let i = 1; i <= SLICES; i++) {
        const slice = i === SLICES ? left : base;
        left -= slice;
        if (slice <= 0n) continue;
        await c.query(
          `insert into vesting (user_id, day, amount, due_at) values ($1, $2, $3, $4)`,
          [r.user_id, key, slice.toString(), new Date(day.getTime() + i * SLICE_MS)],
        );
      }
    });
    posted += 1;
    total += net;
  }

  await pool.query(`update credit_runs set posted = $2, total = $3 where day = $1`, [key, posted, total.toString()]);
  return { posted, total: total.toString() };
}
