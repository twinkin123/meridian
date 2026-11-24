import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { pool, tx } from './db.js';
import { post } from './ledger/post.js';
import { ensure } from './ledger/accounts.js';
import { notify, notifyUser, usdStr } from './notify.js';
import { treasuryKeypair, treasuryAddress, treasuryHeadroom } from './sweeps.js';
import { solPriceMicro } from './price.js';
import { freezeLevel } from './recon.js';
import { sendUsdc, sendSol, waitForTreasuryAction, findTransferSig } from './privy.js';

export const MIN_WITHDRAW = 10_000_000n;
export const NEW_ADDR_CAP = 500_000_000n;


export const AUTO_APPROVE_MAX = 9_000_000_000n;
export const ADDRESS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const USDC_DECIMALS = 6;
export const RENT_EXEMPT = 2_039_280n;
export const FEE_HEADROOM = 100_000n;
export const PRIORITY_MICRO = 200_000;
export const MAX_ATTEMPTS = 3;

/** A single withdrawal may not exceed this share of the treasury. */
export const TREASURY_SHARE_PCT = 15n;

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

export type Asset = 'SOL' | 'USDC';

/** Per-user freeze set from the admin panel; independent of the global level. */
export async function isUserFrozen(userId: string): Promise<boolean> {
  const r = await pool.query<{ frozen_at: string | null }>(`select frozen_at from users where id = $1`, [userId]);
  return Boolean(r.rows[0]?.frozen_at);
}

/**
 * $500 on an address we have not paid before, for its first 24 hours. After
 * that the whole available balance, with no ceiling.
 */
export function computeCap(known: boolean, ageMs: number, balance: bigint): bigint {
  if (!known || ageMs < ADDRESS_COOLDOWN_MS) return NEW_ADDR_CAP;
  return balance;
}

export function qtyFor(asset: Asset, usd: bigint, priceMicro: bigint): bigint {
  return asset === 'USDC' ? usd : (usd * 1_000_000_000n) / priceMicro;
}

/**
 * Whether this caller may take the row and send.
 *
 * 'sending' is not enough on its own: another worker may hold a live action on
 * it. Only a sending row with no recorded action is stranded and retryable.
 */
export function canClaim(status: string, actionId: string | null): boolean {
  if (!['approved', 'sending'].includes(status)) return false;
  if (status === 'sending' && actionId) return false;
  return true;
}

export type RequestResult =
  | { ok: true; id: string; status: string; cap: string }
  | { ok: false; error: string; cap?: string };

export async function requestWithdrawal(
  userId: string,
  asset: Asset,
  address: string,
  usd: bigint,
  source: 'available' | 'rewards' = 'available',
): Promise<RequestResult> {
  const code = source === 'rewards' ? '2080' : '2000';
  try {
    new PublicKey(address);
  } catch {
    return { ok: false, error: 'bad_address' };
  }
  if (usd <= 0n) return { ok: false, error: 'bad_amount' };
  // Referral commission is small and owed already, so a freeze does not hold it.
  if (source !== 'rewards' && (await freezeLevel()) >= 2) return { ok: false, error: 'frozen' };
  if (source !== 'rewards' && (await isUserFrozen(userId))) return { ok: false, error: 'user_frozen' };

  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);
    await ensure(c, userId);

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0) b from v_balance where user_id = $1 and code = $2`,
      [userId, code],
    );
    const balance = BigInt(bal.rows[0]?.b ?? 0);

    if (usd > balance) return { ok: false, error: 'insufficient' };
    /* The minimum is absolute. Closing a balance under $10 no longer bypasses it,
       so a daily credit has to accumulate before it can leave. Referral
       commission is still exempt, since it is small and already owed. */
    if (usd < MIN_WITHDRAW && source !== 'rewards') return { ok: false, error: 'below_min' };

    /* Referral commission is unconditional: no cap, no minimum, no gate, and it
       never blocks or counts against the available balance. */
    let needsApproval = false;
    let used24h = 0n;
    let userLimit: bigint | null = null;
    if (source !== 'rewards') {
      const open = await c.query<{ n: string }>(
        `select count(*)::text n from withdrawals
          where user_id = $1 and source = 'available'
            and status in ('requested','approved','sending')`,
        [userId],
      );
      if (Number(open.rows[0]?.n ?? 0) > 0) return { ok: false, error: 'in_flight' };

      const recent = await c.query<{ g: string }>(
        `select coalesce(sum(usd_amount + fee), 0)::text g from withdrawals
          where user_id = $1 and source = 'available'
            and created_at > now() - interval '24 hours'
            and status not in ('cancelled', 'failed')`,
        [userId],
      );
      used24h = BigInt(recent.rows[0]?.g ?? 0);
      const lim = await c.query<{ l: string | null }>(
        'select wd_limit_usd::text l from users where id = $1',
        [userId],
      );
      userLimit = lim.rows[0]?.l ? BigInt(lim.rows[0].l!) : null;
      needsApproval = used24h + usd >= AUTO_APPROVE_MAX;
    }
    const seen = await c.query<{ first_seen: string }>(
      `insert into withdrawal_addresses (user_id, address) values ($1, $2)
       on conflict (user_id, address) do nothing
       returning first_seen`,
      [userId, address],
    );

    let firstSeen: string | null = seen.rows[0]?.first_seen ?? null;
    if (!firstSeen) {
      const got = await c.query<{ first_seen: string }>(
        'select first_seen from withdrawal_addresses where user_id = $1 and address = $2',
        [userId, address],
      );
      firstSeen = got.rows[0].first_seen;
    }

    const ageMs = Date.now() - new Date(firstSeen).getTime();
    const cap = computeCap(Boolean(firstSeen), ageMs, balance);

    /* A per-user limit replaces the address-age allowance for that user and is
       enforced against the trailing 24h, so it cannot be stepped over with
       repeated requests. Users with no limit behave exactly as before. */
    if (source !== 'rewards') {
      if (userLimit !== null) {
        if (used24h + usd > userLimit) {
          return { ok: false, error: 'over_daily_limit', cap: (userLimit > used24h ? userLimit - used24h : 0n).toString() };
        }
      } else if (usd > cap) {
        return { ok: false, error: 'over_cap', cap: cap.toString() };
      }
    }

    const fee = (usd * 500n) / 10000n;
    const net = usd - fee;
    if (net <= 0n) return { ok: false, error: 'below_min' };

    /* Coverage is checked whether or not the address is new. A new address still
       needs the treasury to hold the money, and a queued row is never re-checked,
       so it would otherwise sit forever. */
    const need = asset === 'USDC' ? net : qtyFor('SOL', net, await solPriceMicro()) + FEE_HEADROOM;
    const head = await treasuryHeadroom().catch(() => null);
    if (!head) return { ok: false, error: 'treasury_unreachable' };
    const have = asset === 'USDC' ? head.usdc : head.sol;
    const covered = have >= need;
    const autoOk = !needsApproval && covered;
    const status = autoOk ? 'approved' : 'requested';

    const row = await c.query<{ id: string }>(
      `insert into withdrawals (user_id, asset, address, usd_amount, fee, status, requested_by, approved_by, source)
       values ($1, $2, $3, $4, $5, $6, $1, $7, $8)
       returning id`,
      [userId, asset, address, net.toString(), fee.toString(), status, autoOk ? 'auto' : null, source],
    );
    const id = row.rows[0].id;

    await post(c, 'WithdrawalRequested', id, [
      { code, owner: userId, amount: usd },
      { code: '2010', owner: userId, amount: -net },
      { code: '4000', amount: -fee },
    ]);

    await notify(c, userId, autoOk ? 'withdrawal_approved' : 'withdrawal_requested',
      autoOk
        ? `Withdrawal of ${usdStr(usd)} USD approved. Sending now.`
        : covered
          ? `Withdrawal of ${usdStr(usd)} USD requested. Waiting on admin approval.`
          : `Withdrawal of ${usdStr(usd)} USD requested. The payout wallet cannot cover it yet, so it will send once it is topped up.`);

    return { ok: true, id, status, cap: cap.toString() };
  });
}

export type ApproveResult = { ok: true } | { ok: false; error: string };
export async function approveWithdrawal(id: string, approver: string): Promise<ApproveResult> {
  const q = await pool.query<{ user_id: string; asset: Asset; usd_amount: string; status: string }>(`select user_id, asset, usd_amount, status from withdrawals where id = $1`, [id]);
  const row = q.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'requested') return { ok: false, error: 'not_pending' };
  const net = BigInt(row.usd_amount);
  const need = row.asset === 'USDC' ? net : qtyFor('SOL', net, await solPriceMicro()) + FEE_HEADROOM;
  const head = await treasuryHeadroom().catch(() => null);
  if (!head) return { ok: false, error: 'treasury_unreachable' };
  const have = row.asset === 'USDC' ? head.usdc : head.sol;
  if (have < need) return { ok: false, error: `treasury_short:${have}:${need}` };
  if (need * 100n >= have * TREASURY_SHARE_PCT) return { ok: false, error: `treasury_share:${have}:${need}` };
  const r = await pool.query<{ user_id: string }>(`update withdrawals set status = 'approved', approved_by = $2 where id = $1 and status = 'requested' returning user_id`, [id, approver]);
  const done = r.rows[0];
  if (!done) return { ok: false, error: 'not_pending' };
  await notifyUser(done.user_id, 'withdrawal_approved', `Withdrawal approved. ${usdStr(net)} USD is on its way.`);
  return { ok: true };
}export async function cancelWithdrawal(id: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `select id from withdrawals where id = $1 and user_id = $2 and status = 'requested'`,
    [id, userId],
  );
  if (r.rowCount === 0) return false;
  return refundWithdrawal(id, 'cancelled', null, 'withdrawal_cancelled', 'Withdrawal cancelled');
}
type Conf = 'confirmed' | 'reverted' | 'expired' | 'timeout';

async function confirmSig(
  c: Connection,
  sig: string,
  lastValidBlockHeight: number,
): Promise<Conf> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const st = await c.getSignatureStatus(sig, { searchTransactionHistory: true }).catch(() => null);
    if (st?.value) {
      const cs = st.value.confirmationStatus;
      if (cs === 'confirmed' || cs === 'finalized') return 'confirmed';
      if (st.value.err) return 'reverted';
    }
    const h = await c.getBlockHeight('confirmed').catch(() => 0);
    if (h > lastValidBlockHeight) return 'expired';
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return 'timeout';
}

/**
 * Puts a rejected, cancelled or failed withdrawal straight back where it came
 * from: referral rewards, or the available balance. Available money returns to
 * available rather than to reserve, so cancelling does not reclassify profit as
 * deposit money and does not start a fresh 30-day lock.
 * Terminal: the user re-requests rather than retrying in place.
 */
async function refundWithdrawal(
  id: string,
  final: 'failed' | 'cancelled',
  msg: string | null,
  kind: string,
  label: string,
  opts: { allowLiveSend?: boolean } = {},
): Promise<boolean> {
  const out = await tx(async (c) => {
    const r = await c.query<{
      user_id: string; usd_amount: string; fee: string; source: string; status: string;
      privy_action_id: string | null;
    }>(`select user_id, usd_amount, fee, source, status, privy_action_id from withdrawals where id = $1 for update`, [id]);

    const w = r.rows[0];
    if (!w || !['requested', 'approved', 'sending'].includes(w.status)) return null;
    /* A row mid-send is owned by the payout loop until its action resolves.
       Refunding it here would credit the user while the coins are already moving.
       The loop's own terminal failure passes allowLiveSend, because by then the
       action has been resolved or abandoned. */
    if (w.status === 'sending' && !opts.allowLiveSend) return null;

    const net = BigInt(w.usd_amount);
    const fee = BigInt(w.fee);
    const gross = net + fee;
    const back = w.source === 'rewards' ? '2080' : '2000';
    const where = w.source === 'rewards' ? 'your referral rewards' : 'your available balance';

    await ensure(c, w.user_id);
    await c.query(`update withdrawals set status = $2, error = $3 where id = $1`, [
      id, final, msg ? msg.slice(0, 400) : null,
    ]);
    await post(c, 'WithdrawalFailed', `${id}#f${Date.now()}`, [
      { code: '2010', owner: w.user_id, amount: net },
      { code: back, owner: w.user_id, amount: -gross },
      { code: '4000', amount: fee },
    ]);

    await notify(c, w.user_id, kind,
      `${label}. ${usdStr(gross)} USD returned to ${where}.` + (msg ? ` Reason: ${msg}` : ''));
    return w.user_id;
  });

  return Boolean(out);
}

/** Admin rejects a pending withdrawal. The money goes back to the available balance. */
export async function rejectWithdrawal(id: string, reason: string | null): Promise<boolean> {
  return refundWithdrawal(id, 'failed', reason, 'withdrawal_rejected', 'Withdrawal rejected');
}

/**
 * Admin cancel. Same full refund as a reject, but the row reads cancelled
 * rather than failed, since nothing went wrong.
 */
export async function cancelByAdmin(id: string): Promise<boolean> {
  return refundWithdrawal(id, 'cancelled', null, 'withdrawal_cancelled', 'Your request has been rejected');
}
async function finalize(
  id: string, sig: string, actionId: string, userId: string, address: string, usd: bigint, qty: bigint,
) {
  await tx(async (conn) => {
    const done = await conn.query(
      `update withdrawals set status = 'sent', sig = $2, privy_action_id = $3, qty_raw = $4, sent_at = now()
        where id = $1 and status = 'sending'`,
      [id, sig, actionId, qty.toString()],
    );
    /* A refund can win the race while the action is still resolving. If it did,
       the ledger already carries the reversal, so do not post the send on top. */
    if ((done.rowCount ?? 0) === 0) return;
    await conn.query(
      `update withdrawal_addresses set last_used = now() where user_id = $1 and address = $2`,
      [userId, address],
    );
    await post(conn, 'WithdrawalSent', id, [
      { code: '2010', owner: userId, amount: usd },
      { code: '1000', amount: -usd },
    ]);
    await notify(conn, userId, 'withdrawal_sent',
      `${usdStr(usd)} USD sent to ${address.slice(0, 4)}...${address.slice(-4)}.`);
  });
}

export type PayoutResult = { ok: boolean; error?: string; sig?: string };

export async function payoutWithdrawal(
  id: string,
  opts: { force?: boolean } = {},
): Promise<PayoutResult> {
  const w = await pool.query<{
    id: string; user_id: string; asset: Asset; address: string;
    usd_amount: string; status: string; sig: string | null; privy_action_id: string | null;
    source: string;
    created_at: string;
  }>(`select * from withdrawals where id = $1`, [id]);

  const row = w.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'sent') return { ok: true, sig: row.sig ?? undefined };
  if (!['approved', 'sending'].includes(row.status)) {
    return { ok: false, error: `status_${row.status}` };
  }
  if (!opts.force && row.source !== 'rewards' && (await freezeLevel()) >= 2) {
    return { ok: false, error: 'frozen' };
  }

  const usd = BigInt(row.usd_amount);
  const price = await solPriceMicro();
  const qty = qtyFor(row.asset, usd, price);

  // An action is already in flight: resolve it before sending anything new.
  if (row.privy_action_id) {
    const settled = await waitForTreasuryAction(row.privy_action_id, 20_000);
    if (settled === 'succeeded') {
      const onchain = (await findTransferSig(row.address, qty, row.asset, new Date(row.created_at).getTime())) ?? row.privy_action_id;
      await finalize(id, onchain, row.privy_action_id, row.user_id, row.address, usd, qty);
      return { ok: true, sig: onchain };
    }
    if (settled === 'timeout') return { ok: false, error: 'pending', sig: row.privy_action_id };

    /* The action is dead. Clear it, guarded on this exact id, so the claim below
       can take the row and retry. Without this the row keeps a dead action id
       forever and every later claim stands down. */
    await pool.query(
      `update withdrawals set privy_action_id = null, sig = null where id = $1 and privy_action_id = $2`,
      [id, row.privy_action_id],
    );
  }

  /* Solvency is re-checked at send time: an approved row can outlive the
     balance it was approved against. The row stays approved, so it pays once
     the treasury is topped up. */
  const need = row.asset === 'USDC' ? usd : qty + FEE_HEADROOM;
  const head = await treasuryHeadroom().catch(() => null);
  if (!head) return { ok: false, error: 'treasury_unreachable' };
  const have = row.asset === 'USDC' ? head.usdc : head.sol;
  if (have < need) return { ok: false, error: `treasury_short:${have}:${need}` };

  const claimed = await tx(async (c) => {
    const w = await c.query<{
      user_id: string; usd_amount: string; fee: string; source: string; status: string;
      privy_action_id: string | null;
    }>(`select user_id, usd_amount, fee, source, status, privy_action_id from withdrawals where id = $1 for update`, [id]);

    const cur = w.rows[0];
    /* 'sending' alone is not a claim: another worker may be mid-send on this row.
       Only take it when no action is recorded against it. */
    if (!cur || !canClaim(cur.status, cur.privy_action_id)) return false;

    await c.query(`update withdrawals set status = 'sending', error = null where id = $1`, [id]);
    return true;
  });
  if (!claimed) return { ok: false, error: 'race' };

  let lastAction: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const key = `withdraw:${id}:${attempt}`;
    try {
      const action: string = row.asset === 'USDC'
        ? await sendUsdc(row.address, qty, `withdraw:${id}`, key)
        : await sendSol(row.address, qty, `withdraw:${id}`, key);
      lastAction = action;
      await pool.query(`update withdrawals set privy_action_id = $2, sig = $2 where id = $1`, [id, action]);

      const settled = await waitForTreasuryAction(action);
      if (settled === 'succeeded') {
        const onchain = (await findTransferSig(row.address, qty, row.asset, new Date(row.created_at).getTime())) ?? action;
        await finalize(id, onchain, action, row.user_id, row.address, usd, qty);
        return { ok: true, sig: onchain };
      }
      if (settled === 'timeout') {
        // leave it 'sending'; a resume resolves it from privy_action_id
        return { ok: false, error: 'pending', sig: action };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'payout_failed';
      if (attempt === MAX_ATTEMPTS) {
        await refundWithdrawal(id, 'failed', msg, 'withdrawal_failed', 'Withdrawal could not be sent', { allowLiveSend: true });
        return { ok: false, error: msg, sig: lastAction ?? undefined };
      }
    }
  }

  await refundWithdrawal(id, 'failed', 'not_confirmed_after_attempts', 'withdrawal_failed', 'Withdrawal could not be sent', { allowLiveSend: true });
  return { ok: false, error: 'not_confirmed', sig: lastAction ?? undefined };
}

export function treasury(): string {
  return treasuryAddress();
}











