import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';
import { notify, usdStr } from '../notify.js';
import { recordDay } from '../trades.js';
import { freezeLevel } from '../recon.js';

const MIN_BP = 100;
const MAX_BP = 350;
const FEE_BP = 1500;
const MIN_STAKE = 10_000_000n;
const SLICES = 4;
const SLICE_MS = 6 * 60 * 60 * 1000;

export type CreditResult = { skipped?: boolean; reason?: string; posted: number; total: string };

type Stake = { id: string; asset: string; usd_at_det: string };

/**
 * Daily settlement.
 *
 * Credit is paid on locked principal only. Idle available balance earns
 * nothing, so a user with no open stake gets nothing that day. The gross rate
 * is drawn from the 1-3.5% band and the platform keeps FEE_BP of it; the
 * remainder is what the user receives.
 *
 * With auto-compound on, each stake keeps its own profit and the row simply
 * grows - the unlock date is never touched. With it off, the net vests to the
 * user in four slices over 24 hours.
 */
export async function runDailyCredit(day = new Date()): Promise<CreditResult> {
  /* Credit always posts, freeze or not: it is the product, and a skipped day
     leaves a gap in the rate history that never gets filled. */
  const key = day.toISOString().slice(0, 10);
  let rateBp = MIN_BP + Math.floor(Math.random() * (MAX_BP - MIN_BP + 1));
  /* Never hand out yesterday's rate twice running - it reads as a stuck job. */
  const prev = await pool.query<{ r: number | null }>(
    `select rate_bp r from credit_runs where day < $1::date order by day desc limit 1`, [key],
  );
  for (let i = 0; i < 3 && prev.rows[0]?.r != null && rateBp === prev.rows[0]!.r; i++) {
    rateBp = MIN_BP + Math.floor(Math.random() * (MAX_BP - MIN_BP + 1));
  }

  /* Level 1 means "start no new 30-day locks", so compounding holds off and the
     credit vests instead. The money still arrives, it just does not extend a lock. */
  const frozen = (await freezeLevel()) >= 1;

  /* The run and the trade day are written together, at the same rate, in one
     transaction - the day can never exist at a different number to the credit. */
  const claim = await tx(async (c) => {
    const ins = await c.query(
      `insert into credit_runs (day, rate_bp, fee_bp) values ($1, $2, $3) on conflict (day) do nothing returning day`,
      [key, rateBp, FEE_BP],
    );
    if (ins.rowCount === 0) return false;
    await recordDay(c, key, rateBp);
    return true;
  });
  if (!claim) return { skipped: true, posted: 0, total: '0' };

  const { rows } = await pool.query<Stake & { user_id: string; ac: boolean; fee_bp: number | null }>(
    `select d.id, d.user_id, d.asset, d.usd_at_det, coalesce(u.auto_compound, true) ac, u.fee_bp
       from deposits d
       join users u on u.id = d.user_id
      where d.status = 'locked' and d.released_at is null and d.usd_at_det > 0
      order by d.user_id, d.created_at`,
  );

  const byUser = new Map<string, { ac: boolean; feeBp: number | null; stakes: Stake[] }>();
  for (const r of rows) {
    const hit = byUser.get(r.user_id);
    const stake = { id: r.id, asset: r.asset, usd_at_det: r.usd_at_det };
    if (hit) hit.stakes.push(stake);
    else byUser.set(r.user_id, { ac: r.ac, feeBp: r.fee_bp, stakes: [stake] });
  }

  let posted = 0;
  let total = 0n;
  let grossTotal = 0n;
  let feeTotal = 0n;

  for (const [userId, { ac, feeBp, stakes }] of byUser) {
    /* A per-user fee overrides the platform default for that user only. */
    const userFeeBp = feeBp ?? FEE_BP;
    const staked = stakes.reduce((a, s) => a + BigInt(s.usd_at_det), 0n);
    if (staked < MIN_STAKE) continue;

    let gross = 0n;
    let fee = 0n;
    let net = 0n;
    const adds: { id: string; asset: string; amount: bigint }[] = [];

    for (const s of stakes) {
      const g = (BigInt(s.usd_at_det) * BigInt(rateBp)) / 10000n;
      if (g <= 0n) continue;
      const f = (g * BigInt(userFeeBp)) / 10000n;
      const n = g - f;
      /* Gross and fee always accumulate. A fee that swallows the whole slice
         is still platform revenue, so the stake cannot be dropped before it is
         counted. Only the net is conditional. */
      gross += g;
      fee += f;
      if (n > 0n) {
        net += n;
        adds.push({ id: s.id, asset: s.asset, amount: n });
      }
    }
    if (gross <= 0n) continue;
    const compound = ac && !frozen;

    await tx(async (c) => {
      await c.query('select ensure_user_accounts($1)', [userId]);

      const legs: { code: string; owner?: string; amount: bigint }[] = [
        { code: '5020', amount: gross },
      ];
      if (net > 0n) legs.push({ code: compound ? '2070' : '2060', owner: userId, amount: -net });
      if (fee > 0n) legs.push({ code: '4000', amount: -fee });
      await post(c, 'SettlementCredit', `${key}:${userId}`, legs);

      if (compound && net > 0n) {
        /* Each stake keeps what it earned; the unlock date is left alone. */
        for (const a of adds) {
          if (a.asset === 'USDC') {
            await c.query(
              'update deposits set usd_at_det = usd_at_det + $2, qty = qty + $2 where id = $1',
              [a.id, a.amount.toString()],
            );
          } else {
            await c.query(
              'update deposits set usd_at_det = usd_at_det + $2 where id = $1',
              [a.id, a.amount.toString()],
            );
          }
        }
        await notify(c, userId, 'credit_compounded',
          `Daily credit compounded: ${usdStr(net)} USD added back onto your stake at its existing unlock date.`);
      } else {
        const base = net / BigInt(SLICES);
        let left = net;
        for (let i = 1; i <= SLICES; i++) {
          const slice = i === SLICES ? left : base;
          left -= slice;
          if (slice <= 0n) continue;
          await c.query(
            `insert into vesting (user_id, day, amount, due_at) values ($1, $2, $3, $4)`,
            [userId, key, slice.toString(), new Date(day.getTime() + i * SLICE_MS)],
          );
        }
        await notify(c, userId, 'credit_posted',
          `Daily credit posted: ${usdStr(gross)} USD gross, ${usdStr(net)} USD net, vesting in four slices over 24 hours.`);
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