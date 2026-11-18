import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';
import { solPriceMicro } from '../price.js';

const LAMPORTS = 1_000_000_000n;
/** Only deposits this young are considered suspect. */
const WINDOW_HOURS = Number(process.env.REVALUE_WINDOW_HOURS ?? '6');
/** ...and only when the booked price is this far off market. */
const MIN_DEV_BP = BigInt(process.env.REVALUE_MIN_DEVIATION_BP ?? '2000');
const BATCH = 200;

export type RevalueResult = { scanned: number; repriced: number; moved: string };

/**
 * Deposit values are fixed at detection. A locked deposit stays at the price it
 * was booked at, so market moves are the platform's P&L, not the user's.
 *
 * This job therefore only corrects a *bad detection* - a feed blip that priced
 * the deposit absurdly. It looks at recent held/locked rows and rewrites the
 * value only when the booked price is MIN_DEV_BP away from market.
 */
export async function revalueSolDeposits(limit = BATCH): Promise<RevalueResult> {
  const price = await solPriceMicro();
  if (price <= 0n) return { scanned: 0, repriced: 0, moved: '0' };

  const { rows } = await pool.query<{
    id: string; user_id: string; qty: string; usd_at_det: string; status: string;
  }>(
    `select id, user_id, qty, usd_at_det, status from deposits
      where asset = 'SOL' and status in ('held','locked') and released_at is null
        and created_at > now() - make_interval(hours => $2)
      order by created_at limit $1`,
    [limit, WINDOW_HOURS],
  );

  let repriced = 0;
  let moved = 0n;

  for (const r of rows) {
    const qty = BigInt(r.qty);
    const old = BigInt(r.usd_at_det);
    if (old <= 0n) continue;

    const next = (qty * price) / LAMPORTS;
    if (next <= 0n) continue;

    const delta = old - next;
    if (delta === 0n) continue;

    const gap = (delta < 0n ? -delta : delta) * 10000n;
    if (gap < MIN_DEV_BP * old) continue;

    const code = r.status === 'locked' ? '2070' : '2050';

    const ok = await tx(async (c) => {
      const upd = await c.query(
        `update deposits set usd_at_det = $2 where id = $1 and usd_at_det = $3 returning id`,
        [r.id, next.toString(), old.toString()],
      );
      if (upd.rowCount === 0) return false;

      await c.query('select ensure_user_accounts($1)', [r.user_id]);
      await post(c, 'DepositRepriced', `reval:${r.id}:${Date.now()}`, [
        { code, owner: r.user_id, amount: delta },
        { code: '1000', amount: -delta },
      ]);
      return true;
    });

    if (ok) {
      repriced += 1;
      moved += delta;
    }
  }

  return { scanned: rows.length, repriced, moved: moved.toString() };
}