import { pool } from '../db.js';

const GRACE_MIN = 10;

/** Confirmed sweeps with no deposit row for that user and amount. Money left the
    deposit wallet and nothing was credited. Logs only; never repairs. */
export async function watchDeposits(): Promise<void> {
  const { rows } = await pool.query(
    `select s.id, s.deposit_address, s.asset, s.amount_raw, s.submitted_at
       from sweeps s
       join users u on u.privy_address = s.deposit_address
      where s.status = 'confirmed'
        and s.submitted_at < now() - interval '${GRACE_MIN} minutes'
        and not exists (
          select 1 from deposits d
           where d.user_id = u.id
             and d.qty = s.amount_raw::numeric
             and d.created_at between s.submitted_at - interval '30 minutes'
                                  and s.submitted_at + interval '30 minutes')
      order by s.submitted_at
      limit 50`,
  );
  if (rows.length === 0) return;
  console.error('deposit-watch: UNCREDITED', rows.length, 'sweep(s); oldest', rows[0].submitted_at);
  for (const r of rows) {
    console.error('deposit-watch:', r.id, r.deposit_address, r.asset, r.amount_raw, r.submitted_at);
  }
}
