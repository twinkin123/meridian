import { randomUUID } from 'node:crypto';
import { tx } from './db.js';
import { post } from './ledger/post.js';
import { freezeLevel } from './recon.js';
import { notify, usdStr } from './notify.js';

/** Smallest stake a user can open, in USD micro. */
export const MIN_STAKE = 10_000_000n;

export const STAKE_DAYS = 30;

export type StakeResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Opens a 30-day lock out of the user's available balance. Deposits no longer
 * lock on their own, so this is the only way a lock starts.
 */
export async function stake(userId: string, amount: bigint): Promise<StakeResult> {
  if (amount < MIN_STAKE) return { ok: false, error: 'below_min' };
  if ((await freezeLevel()) >= 1) return { ok: false, error: 'frozen' };

  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);
    await c.query('select ensure_user_accounts($1)', [userId]);

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0)::text b from v_balance where user_id = $1 and code = '2000'`,
      [userId],
    );
    if (BigInt(bal.rows[0]?.b ?? '0') < amount) return { ok: false, error: 'insufficient' };

    const d = await c.query<{ id: string }>(
      `insert into deposits (user_id, sig, asset, qty, usd_at_det, status, unlock_at, source)
       values ($1, $2, 'USDC', $3, $3, 'locked', now() + ($4 || ' days')::interval, 'stake')
       returning id`,
      [userId, 'stake:' + randomUUID(), amount.toString(), String(STAKE_DAYS)],
    );
    const id = d.rows[0]!.id;

    await post(c, 'StakeLocked', `stake:${id}`, [
      { code: '2000', owner: userId, amount },
      { code: '2070', owner: userId, amount: -amount },
    ]);
    await notify(c, userId, 'stake_started', `${usdStr(amount)} USD locked for ${STAKE_DAYS} days.`);

    return { ok: true, id };
  });
}
