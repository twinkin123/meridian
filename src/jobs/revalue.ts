import { pool, tx } from '../db.js';
import { post } from '../ledger/post.js';
import { solPriceMicro } from '../price.js';

const LAMPORTS = 1_000_000_000n;
/** Skip reprices smaller than this, in micro-USD. */
const MIN_DELTA = BigInt(process.env.REVALUE_MIN_DELTA_USD ?? '10000');
const BATCH = 200;

export type RevalueResult = { scanned: number; repriced: number; moved: string };

/**
 * Marks outstanding SOL deposits to the current price. Only held and locked
 * rows are touched: their value still sits in 2050/2070 and has not been
 * spent, so a reprice cannot retroactively move a user's spendable balance.
 */
export async function revalueSolDeposits(limit = BATCH): Promise<RevalueResult> {
  const price = await solPriceMicro();
  if (price <= 0n) return { scanned: 0, repriced: 0, moved: '0' };

  const { rows } = await pool.query<{
    id: string; user_id: string; qty: string; usd_at_det: string; status: string;
  }>(
    `select id, user_id, qty, usd_at_det, status from deposits
      where asset = 'SOL' and status in ('held','locked') and released_at is null
      order by created_at limit $1`,
    [limit],
  );

  let repriced = 0;
  let moved = 0n;

  for (const r of rows) {
    const qty = BigInt(r.qty);
    const old = BigInt(r.usd_at_det);
    const next = (qty * price) / LAMPORTS;
    if (next <= 0n) continue;

    const delta = old - next;
    if (delta === 0n) continue;
    if ((delta < 0n ? -delta : delta) < MIN_DELTA) continue;

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