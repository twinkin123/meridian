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

  const claim = await t.query('update users set referral_paid_at = now() where id = $1 and referral_paid_at is null returning id', [userId]);
  if ((claim.rowCount ?? 0) === 0) return 0n;

  const bp = bpFor(usd);
  const commission = (usd * BigInt(bp)) / 10000n;
  if (commission <= 0n) return 0n;

  const inv = await t.query<{ n: string }>('select count(*)::text n from users where referred_by=$1', [referrer]);

  const ipq = await t.query<{ same: boolean }>(
    `select exists(select 1 from sessions s1 join sessions s2 on s1.ip = s2.ip where s1.user_id = $1 and s2.user_id = $2 and s1.ip is not null) same`,
    [referrer, userId],
  );
  const sameIp = ipq.rows[0]?.same === true;

  const txId = await post(t, 'ReferralCommission', `ref:first:${depositId}`, [
    { code: '2080', owner: referrer, amount: -commission },
    { code: '5010', amount: commission },
  ]);

  await t.query('insert into referral_ledger (period, referrer_id, invited, base_usd, rate_bp, commission_usd, tx_id, same_ip) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (period, referrer_id) do nothing',


    [`first:${depositId}`, referrer, Number(inv.rows[0]?.n ?? 0), usd.toString(), bp, commission.toString(), txId, sameIp]);


  return commission;
}
