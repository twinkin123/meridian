import { pool } from '../db.js';

const GRACE_MIN = 10;
/** Sweeps may only exceed recorded deposits by rounding, in raw units. */
const EPSILON = 5000;

/** Wallets where more has been swept out than was ever recorded as arriving.
    Compares cumulative totals per user and asset, so two same-size deposits
    cannot mask each other and a sweep that aggregates several deposits still
    matches. Logs only; never repairs. */
export async function watchDeposits(): Promise<void> {
  const { rows } = await pool.query(
    `select u.privy_address, s.asset,
            sum(s.amount_raw)::numeric as swept,
            coalesce(d.deposited, 0) as deposited
       from sweeps s
       join users u on u.privy_address = s.deposit_address
       left join lateral (
         select sum(x.qty)::numeric as deposited
           from deposits x
          where x.user_id = u.id and x.asset = s.asset
       ) d on true
      where s.status = 'confirmed'
        and s.submitted_at < now() - interval '${GRACE_MIN} minutes'
      group by u.privy_address, s.asset, d.deposited
     having sum(s.amount_raw)::numeric > coalesce(d.deposited, 0) + ${EPSILON}
      order by 1`,
  );
  if (rows.length === 0) return;
  console.error('deposit-watch: OVER-SWEPT', rows.length, 'wallet/asset pair(s)');
  for (const r of rows) {
    console.error('deposit-watch:', r.privy_address, r.asset, 'swept', r.swept, 'deposited', r.deposited);
  }
}
