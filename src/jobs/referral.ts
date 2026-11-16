import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';

const TIERS: [number, number][] = [[20, 1500], [10, 1100], [5, 800], [1, 500]];

export function tierBp(invited: number): number {
  for (const [n, bp] of TIERS) if (invited >= n) return bp;
  return 0;
}

export function periodOf(d = new Date()): string {
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  p.setUTCMonth(p.getUTCMonth() - 1);
  return p.toISOString().slice(0, 7);
}

export async function runReferral(period = periodOf()): Promise<{ skipped?: boolean; payouts: number; total: string }> {
  const runTag = Date.now().toString();
  const claim = await pool.query(
    `insert into referral_runs (period) values ($1) on conflict (period) do nothing returning period`,
    [period],
  );
  if (claim.rowCount === 0) return { skipped: true, payouts: 0, total: '0' };

  let payouts = 0;
  let total = 0n;

  try {

  const { rows } = await pool.query<{ referrer_id: string; invited: string; base: string }>(
    `select u.referred_by referrer_id,
            count(distinct u.id)::text invited,
            coalesce(sum(d.usd_at_det),0)::text base
       from users u
       join deposits d on d.user_id = u.id
      where u.referred_by is not null
        and d.status = 'credited'
        and d.created_at >= ($1 || '-01')::date
        and d.created_at <  (($1 || '-01')::date + interval '1 month')
      group by u.referred_by`,
    [period],
  );

  let payouts = 0;
  let total = 0n;

  for (const r of rows) {
    const base = BigInt(r.base);
    const bp = tierBp(Number(r.invited));
    const commission = (base * BigInt(bp)) / 10000n;
    if (commission <= 0n) continue;

    await tx(async (c) => {
      const id = await post(c, 'ReferralCommission', `ref:${period}:${r.referrer_id}:${runTag}`, [
        { code: '2000', owner: r.referrer_id, amount: -commission },
        { code: '5010', amount: commission },
      ]);
      await c.query(
        `insert into referral_ledger (period, referrer_id, invited, base_usd, rate_bp, commission_usd, tx_id)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (period, referrer_id) do nothing`,
        [period, r.referrer_id, Number(r.invited), r.base, bp, commission.toString(), id],
      );
    });

    payouts += 1;
    total += commission;
  }

  await pool.query(`update referral_runs set payouts=$2, total_usd=$3 where period=$1`, [period, payouts, total.toString()]);
  } catch (e) {
    await pool.query(`delete from referral_runs where period=$1`, [period]);
    throw e;
  }

  return { payouts, total: total.toString() };
}
