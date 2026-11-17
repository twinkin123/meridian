import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';
import { freezeLevel } from '../recon.js';

const MIN_BP = 100;
const MAX_BP = 350;
const FEE_BP = 1500;
const MIN_BALANCE = 10_000_000n;
const SLICES = 4;
const SLICE_MS = 6 * 60 * 60 * 1000;

export type CreditResult = { skipped?: boolean; reason?: string; posted: number; total: string };

/**
 * Daily settlement. The gross rate is drawn from the 1-3.5% band, the platform
 * keeps FEE_BP of it, and the remaining 85% vests to the user over 24 hours.
 */
export async function runDailyCredit(day = new Date()): Promise<CreditResult> {
  if ((await freezeLevel()) >= 2) return { skipped: true, reason: 'frozen', posted: 0, total: '0' };

  const key = day.toISOString().slice(0, 10);
  const rateBp = MIN_BP + Math.floor(Math.random() * (MAX_BP - MIN_BP + 1));

  const claim = await pool.query(
    `insert into credit_runs (day, rate_bp, fee_bp) values ($1, $2, $3) on conflict (day) do nothing returning day`,
    [key, rateBp, FEE_BP],
  );
  if (claim.rowCount === 0) return { skipped: true, posted: 0, total: '0' };

  const { rows } = await pool.query<{ user_id: string; b: string }>(
    `select user_id, balance b from v_balance where code = '2000' and balance >= $1`,
    [MIN_BALANCE.toString()],
  );

  let posted = 0;
  let total = 0n;
  let grossTotal = 0n;
  let feeTotal = 0n;

  for (const r of rows) {
    const gross = (BigInt(r.b) * BigInt(rateBp)) / 10000n;
    if (gross <= 0n) continue;
    const fee = (gross * BigInt(FEE_BP)) / 10000n;
    const net = gross - fee;
    if (net <= 0n) continue;

    await tx(async (c) => {
      await c.query('select ensure_user_accounts($1)', [r.user_id]);
      const legs: { code: string; owner?: string; amount: bigint }[] = [
        { code: '1010', amount: gross },
        { code: '2060', owner: r.user_id, amount: -net },
      ];
      if (fee > 0n) legs.push({ code: '4000', amount: -fee });
      await post(c, 'SettlementCredit', `${key}:${r.user_id}`, legs);

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
    grossTotal += gross;
    feeTotal += fee;
  }

  await pool.query(
    `update credit_runs set posted = $2, total = $3, gross_total = $4, fee_total = $5 where day = $1`,
    [key, posted, total.toString(), grossTotal.toString(), feeTotal.toString()],
  );
  return { posted, total: total.toString() };
}

export async function runDailyCreditIfDue(): Promise<void> {
  const now = new Date();
  const boundary = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 15, 0, 0,
  );
  if (now.getTime() < boundary) return;
  const key = now.toISOString().slice(0, 10);
  const r = await pool.query('select 1 from credit_runs where day = $1', [key]);
  if (r.rowCount === 0) await runDailyCredit();
}
