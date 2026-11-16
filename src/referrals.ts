import type { Tx } from './db.js';
import { post } from './ledger/post.js';

/** 4% up to $10k, 8% up to $20k, 12% above. Basis points. */
export function bpFor(usd: bigint): number {
  if (usd <= 10_000_000_000n) return 400;
  if (usd <= 20_000_000_000n) return 800;
  return 1200;
}

/** Pays the referrer once, on the referred user's first credited deposit. */
export async function payReferral(t: Tx, userId: string, depositId: string, usd: bigint): Promise<bigint> {
  if (usd <= 0n) return 0n;

  const u = await t.query<{ referred_by: string | null }>('select referred_by from users where id=$1', [userId]);
  const referrer = u.rows[0]?.referred_by;
  if (!referrer) return 0n;

  const prior = await t.query(`select 1 from deposits where user_id=$1 and status='credited' and id<>$2 limit 1`, [userId, depositId]);
  if ((prior.rowCount ?? 0) > 0) return 0n;

  const bp = bpFor(usd);
  const commission = (usd * BigInt(bp)) / 10000n;
  if (commission <= 0n) return 0n;

  const inv = await t.query<{ n: string }>('select count(*)::text n from users where referred_by=$1', [referrer]);

  const txId = await post(t, 'ReferralCommission', `ref:first:${depositId}`, [
    { code: '2000', owner: referrer, amount: -commission },
    { code: '5010', amount: commission },
  ]);

  await t.query('insert into referral_ledger (period, referrer_id, invited, base_usd, rate_bp, commission_usd, tx_id) values ($1,$2,$3,$4,$5,$6,$7) on conflict (period, referrer_id) do nothing',


    [`first:${depositId}`, referrer, Number(inv.rows[0]?.n ?? 0), usd.toString(), bp, commission.toString(), txId]);

  return commission;
}