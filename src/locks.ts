import { notify, notifyUser, usdStr } from './notify.js';
import { pool, tx } from './db.js';
import { post } from './ledger/post.js';
import { freezeLevel } from './recon.js';
import { AUTO_APPROVE_MAX } from './withdrawals.js';

/** Minimum a held balance must reach before it becomes a real locked deposit. */
export const MIN_DEPOSIT = 10_000_000n;

/**
 * Value unlocked in the last 24 hours. Auto-approval is bounded by this rather
 * than by any single amount, so a user cannot free an unlimited sum by asking
 * for it in pieces.
 */
async function unlocked24h(userId: string): Promise<bigint> {
  const r = await pool.query<{ g: string }>(
    `select coalesce(sum(usd_at_det), 0)::text g from deposits
      where user_id = $1 and released_at > now() - interval '24 hours'`,
    [userId],
  );
  return BigInt(r.rows[0]?.g ?? '0');
}

/** User asks for a matured deposit to be released. */
export async function requestClaim(userId: string, depositId: string): Promise<string> {
  const r = await pool.query(
    `update deposits set claim_requested_at = now()
      where id = $1 and user_id = $2 and status = 'locked'
        and released_at is null and claim_requested_at is null
       and unlock_at <= now() returning id`,
    [depositId, userId],
  );
  if (r.rowCount === 0) return 'not_claimable';

  const d = await pool.query<{ usd_at_det: string }>('select usd_at_det from deposits where id = $1', [depositId]);
  const amount = BigInt(d.rows[0]?.usd_at_det ?? '0');

  /* Under the line it releases straight away; over it, an admin decides. */
  if ((await unlocked24h(userId)) + amount < AUTO_APPROVE_MAX) {
    if (await approveClaim(depositId)) return 'approved';
  }

  await notifyUser(userId, 'claim_requested',
    `${usdStr(amount)} USD unlock requested. An admin reviews it.`);
  return 'requested';
}

/** Admin approves a claim. Auto-approval and the matured sweep both call it. */
export async function approveClaim(depositId: string): Promise<boolean> {
  return tx(async (c) => {
    const d = await c.query<{ user_id: string; usd_at_det: string }>(
      `select user_id, usd_at_det from deposits
        where id = $1 and status = 'locked' and released_at is null
          and claim_requested_at is not null for update`,
      [depositId],
    );
    if (d.rowCount === 0) return false;

    const row = d.rows[0];
    const amount = BigInt(row.usd_at_det);
    if (amount <= 0n) return false;

    const done = await c.query(
      `update deposits set released_at = now(), status = 'credited'
        where id = $1 and released_at is null returning id`,
      [depositId],
    );
    if (done.rowCount === 0) return false;

    await c.query('select ensure_user_accounts($1)', [row.user_id]);
    await post(c, 'DepositUnlocked', `unlock:${depositId}`, [
      { code: '2070', owner: row.user_id, amount },
      { code: '2000', owner: row.user_id, amount: -amount },
    ]);
    await notify(c, row.user_id, 'claim_approved', (Number(amount) / 1e6).toFixed(2) + ' USD unlocked and available to withdraw.');
    return true;
  });
}

/** How long a claim request stands before it lapses back to claimable. */
export const CLAIM_TTL_HOURS = 72;

/** User withdraws their own pending claim request. */
export async function cancelClaim(userId: string, depositId: string): Promise<boolean> {
  const r = await pool.query(
    `update deposits set claim_requested_at = null
      where id = $1 and user_id = $2 and status = 'locked'
        and released_at is null and claim_requested_at is not null returning id`,
    [depositId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await notifyUser(userId, 'claim_cancelled', 'Your unlock request was withdrawn.');
  return true;
}

/** Admin rejects a pending claim, with an optional reason shown to the user. */
export async function rejectClaim(depositId: string, reason: string | null): Promise<boolean> {
  return tx(async (c) => {
    const r = await c.query<{ user_id: string; usd_at_det: string }>(
      `update deposits
          set claim_requested_at = null, claim_rejected_at = now(), claim_reject_reason = $2
        where id = $1 and status = 'locked' and released_at is null
          and claim_requested_at is not null returning user_id, usd_at_det`,
      [depositId, reason],
    );
    if (r.rowCount === 0) return false;
    const row = r.rows[0];
    await notify(c, row.user_id, 'claim_rejected',
      `Your unlock request for ${(Number(row.usd_at_det) / 1e6).toFixed(2)} USD was declined${reason ? ': ' + reason : ''}.`);
    return true;
  });
}

/** Lapsed claim requests fall back to claimable so nothing hangs forever. */
export async function expireClaims(): Promise<number> {
  const r = await pool.query<{ user_id: string }>(
    `update deposits set claim_requested_at = null
      where claim_requested_at is not null and released_at is null
        and claim_requested_at < now() - interval '72 hours'
      returning user_id`,
  );
  for (const row of r.rows) {
    await notifyUser(row.user_id, 'claim_expired', 'Your unlock request lapsed after 72 hours. You can request it again.');
  }
  return r.rowCount ?? 0;
}

export type CombineResult =
  | { state: 'nothing' }
  | { state: 'below_min'; held: bigint }
  | { state: 'combined'; amount: bigint };

/**
 * Held dust never becomes spendable directly. Once the held rows clear
 * MIN_DEPOSIT they are combined into the locked bucket with a fresh
 * 30-day clock, and only then can they be claimed and released.
 */
export async function combineHeld(userId: string): Promise<CombineResult> {
  // Level 1 means "start no new 30-day locks"; reserve simply accumulates.
  if ((await freezeLevel()) >= 1) return { state: 'nothing' };

  return tx(async (c) => {
    const rows = await c.query<{ id: string; usd_at_det: string }>(
      `select id, usd_at_det from deposits
        where user_id = $1 and status = 'held' and released_at is null
        order by created_at for update`,
      [userId],
    );
    if (rows.rowCount === 0) return { state: 'nothing' };

    let total = 0n;
    for (const r of rows.rows) total += BigInt(r.usd_at_det);
    if (total <= 0n) return { state: 'nothing' };
    if (total < MIN_DEPOSIT) return { state: 'below_min', held: total };

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0)::text b from v_balance where user_id = $1 and code = '2050'`,
      [userId],
    );
    const held = BigInt(bal.rows[0]?.b ?? '0');
    if (held <= 0n) return { state: 'nothing' };

    const amount = total < held ? total : held;

    await c.query('select ensure_user_accounts($1)', [userId]);
    await post(c, 'HeldCombined', `combine:${userId}:${Date.now()}`, [
      { code: '2050', owner: userId, amount },
      { code: '2070', owner: userId, amount: -amount },
    ]);
    await notify(c, userId, 'reserve_locked', `${usdStr(amount)} USD moved from reserve into a 30-day lock.`);

    await c.query(
      `update deposits set status = 'locked', unlock_at = now() + interval '30 days'
        where id = any($1::uuid[]) and status = 'held'`,
      [rows.rows.map((r) => r.id)],
    );

    return { state: 'combined', amount };
  });
}

/** Releases matured locks automatically. Idempotent on released_at. */
export async function releaseMatured(limit = 500): Promise<number> {
  const { rows } = await pool.query<{ id: string; user_id: string; usd_at_det: string }>(
    `select id, user_id, usd_at_det from deposits
      where status = 'locked' and released_at is null and claim_requested_at is null
        and unlock_at <= now()
      order by unlock_at limit $1`,
    [limit],
  );

  let released = 0;
  for (const r of rows) {
    const amount = BigInt(r.usd_at_det);
    if (amount <= 0n) continue;
    /* Cross the line and the row waits to be claimed, then reviewed. */
    if ((await unlocked24h(r.user_id)) + amount >= AUTO_APPROVE_MAX) continue;
    const ok = await tx(async (c) => {
      const done = await c.query(
        `update deposits set released_at = now(), status = 'credited'
          where id = $1 and released_at is null returning id`,
        [r.id],
      );
      if (done.rowCount === 0) return false;
      await c.query('select ensure_user_accounts($1)', [r.user_id]);
      await post(c, 'LockReleased', `release:${r.id}`, [
        { code: '2070', owner: r.user_id, amount },
        { code: '2000', owner: r.user_id, amount: -amount },
      ]);
      await notify(c, r.user_id, 'lock_released', `${usdStr(amount)} USD unlocked and available to withdraw.`);
      return true;
    });
    if (ok) released += 1;
  }
  return released;
}
