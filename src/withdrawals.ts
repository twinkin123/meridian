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
import { treasuryKeypair, treasuryAddress } from './sweeps.js';
import { solPriceMicro } from './price.js';

export const MIN_WITHDRAW = 10_000_000n;
export const NEW_ADDR_CAP = 500_000_000n;
export const CAP_FLOOR = 500_000_000n;
export const CAP_CEIL = 25_000_000_000n;
export const AUTO_APPROVE_MAX = 1_000_000_000n;
export const ADDRESS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const USDC_DECIMALS = 6;
export const RENT_EXEMPT = 2_039_280n;
export const FEE_HEADROOM = 100_000n;
export const PRIORITY_MICRO = 200_000;
export const MAX_ATTEMPTS = 3;

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

export type Asset = 'SOL' | 'USDC';

export function computeCap(known: boolean, ageMs: number, balance: bigint): bigint {
  if (!known || ageMs < ADDRESS_COOLDOWN_MS) return NEW_ADDR_CAP;
  const scaled = balance / 2n;
  const floored = scaled < CAP_FLOOR ? CAP_FLOOR : scaled;
  return floored > CAP_CEIL ? CAP_CEIL : floored;
}

export function qtyFor(asset: Asset, usd: bigint, priceMicro: bigint): bigint {
  return asset === 'USDC' ? usd : (usd * 1_000_000_000n) / priceMicro;
}

export type RequestResult =
  | { ok: true; id: string; status: string; cap: string }
  | { ok: false; error: string; cap?: string };

export async function requestWithdrawal(
  userId: string,
  asset: Asset,
  address: string,
  usd: bigint,
): Promise<RequestResult> {
  try {
    new PublicKey(address);
  } catch {
    return { ok: false, error: 'bad_address' };
  }
  if (usd <= 0n) return { ok: false, error: 'bad_amount' };

  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);
    await ensure(c, userId);

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance, 0) b from v_balance where user_id = $1 and code = '2000'`,
      [userId],
    );
    const balance = BigInt(bal.rows[0]?.b ?? 0);

    const closing = usd === balance;
    if (usd > balance) return { ok: false, error: 'insufficient' };
    if (usd < MIN_WITHDRAW && !closing) return { ok: false, error: 'below_min' };

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
    const cap = computeCap(Boolean(seen.rows[0]), ageMs, balance);

    if (usd > cap) return { ok: false, error: 'over_cap', cap: cap.toString() };

    const status = usd <= AUTO_APPROVE_MAX ? 'approved' : 'requested';

    const row = await c.query<{ id: string }>(
      `insert into withdrawals (user_id, asset, address, usd_amount, status, requested_by, approved_by)
       values ($1, $2, $3, $4, $5, $1, $6)
       returning id`,
      [userId, asset, address, usd.toString(), status, status === 'approved' ? 'auto' : null],
    );
    const id = row.rows[0].id;

    await post(c, 'WithdrawalRequested', id, [
      { code: '2000', owner: userId, amount: usd },
      { code: '2010', owner: userId, amount: -usd },
    ]);

    return { ok: true, id, status, cap: cap.toString() };
  });
}

export async function approveWithdrawal(id: string, approver: string): Promise<boolean> {
  const r = await pool.query(
    `update withdrawals set status = 'approved', approved_by = $2
      where id = $1 and status in ('requested','failed')`,
    [id, approver],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function cancelWithdrawal(id: string, userId: string): Promise<boolean> {
  return tx(async (c) => {
    const w = await c.query<{ usd_amount: string }>(
      `select usd_amount from withdrawals
        where id = $1 and user_id = $2 and status in ('requested','approved','failed')
        for update`,
      [id, userId],
    );
    if (w.rowCount === 0) return false;

    const usd = BigInt(w.rows[0].usd_amount);
    await c.query(`update withdrawals set status = 'cancelled' where id = $1`, [id]);
    await post(c, 'WithdrawalCancelled', id, [
      { code: '2010', owner: userId, amount: usd },
      { code: '2000', owner: userId, amount: -usd },
    ]);
    return true;
  });
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

async function markFailed(id: string, msg: string): Promise<void> {
  const dup = await pool.query(`select 1 from transactions where kind = 'WithdrawalFailed' and external_ref = $1`, [id]);
  if (dup.rowCount) return;
  const r = await pool.query(`select user_id, usd_amount from withdrawals where id = $1`, [id]);
  const w = r.rows[0];
  if (!w) return;
  const usd = BigInt(w.usd_amount);
  await tx(async (c) => {
    await c.query(`update withdrawals set status = 'failed', error = $2 where id = $1`, [id, msg.slice(0, 400)]);
    await post(c, 'WithdrawalFailed', id, [
      { code: '2010', owner: w.user_id, amount: usd },
      { code: '2000', owner: w.user_id, amount: -usd },
    ]);
  });
}

async function finalize(
  id: string, sig: string, userId: string, address: string, usd: bigint, qty: bigint,
) {
  await tx(async (conn) => {
    await conn.query(
      `update withdrawals set status = 'sent', sig = $2, qty_raw = $3, sent_at = now()
        where id = $1 and status = 'sending'`,
      [id, sig, qty.toString()],
    );
    await conn.query(
      `update withdrawal_addresses set last_used = now() where user_id = $1 and address = $2`,
      [userId, address],
    );
    await post(conn, 'WithdrawalSent', id, [
      { code: '2010', owner: userId, amount: usd },
      { code: '1000', amount: -usd },
    ]);
  });
}

export type PayoutResult = { ok: boolean; error?: string; sig?: string };

export async function payoutWithdrawal(id: string): Promise<PayoutResult> {
  const w = await pool.query<{
    id: string; user_id: string; asset: Asset; address: string;
    usd_amount: string; status: string; sig: string | null;
  }>(`select * from withdrawals where id = $1`, [id]);

  const row = w.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'sent') return { ok: true, sig: row.sig ?? undefined };
  if (row.status !== 'approved' && row.status !== 'failed' && row.status !== 'sending') {
    return { ok: false, error: `status_${row.status}` };
  }

  const c = new Connection(process.env.RPC_URL!, 'confirmed');
  const usd = BigInt(row.usd_amount);

  if (row.sig) {
    const st = await c.getSignatureStatus(row.sig, { searchTransactionHistory: true }).catch(() => null);
    const cs = st?.value?.confirmationStatus;
    if (cs === 'confirmed' || cs === 'finalized') {
      await pool.query(`update withdrawals set status = 'sending' where id = $1`, [id]);
      await finalize(id, row.sig, row.user_id, row.address, usd, 0n);
      return { ok: true, sig: row.sig };
    }
  }

  const claim = await pool.query(
    `update withdrawals set status = 'sending', error = null
      where id = $1 and status in ('approved','failed','sending')`,
    [id],
  );
  if (claim.rowCount === 0) return { ok: false, error: 'race' };

  const price = await solPriceMicro();
  const qty = qtyFor(row.asset, usd, price);
  const kp: Keypair = treasuryKeypair();
  const dest = new PublicKey(row.address);

  let lastSig: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const txn = new Transaction();
      txn.feePayer = kp.publicKey;

      if (row.asset === 'SOL') {
        const bal = BigInt(await c.getBalance(kp.publicKey, 'confirmed'));
        if (bal - qty - FEE_HEADROOM - RENT_EXEMPT < 0n) {
          await markFailed(id, 'treasury_short_sol');
          return { ok: false, error: 'treasury_short' };
        }
        txn.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICRO }),
          SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: dest, lamports: qty }),
        );
      } else {
        const from = await getAssociatedTokenAddress(USDC_MINT, kp.publicKey);
        const to = await getOrCreateAssociatedTokenAccount(c, kp, USDC_MINT, dest);
        txn.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICRO }),
          createTransferCheckedInstruction(from, USDC_MINT, to.address, kp.publicKey, qty, USDC_DECIMALS),
        );
      }

      const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
      txn.recentBlockhash = blockhash;

      const sim = await c.simulateTransaction(txn);
      if (sim.value.err) {
        await markFailed(id, `sim:${JSON.stringify(sim.value.err)}`);
        return { ok: false, error: 'sim_failed' };
      }

      txn.sign(kp);
      lastSig = await c.sendRawTransaction(txn.serialize(), { skipPreflight: true, maxRetries: 3 });
      await pool.query(`update withdrawals set sig = $2 where id = $1`, [id, lastSig]);

      const conf = await confirmSig(c, lastSig, lastValidBlockHeight);
      if (conf === 'confirmed') {
        await finalize(id, lastSig, row.user_id, row.address, usd, qty);
        return { ok: true, sig: lastSig };
      }
      if (conf === 'reverted') {
        await markFailed(id, `reverted:${lastSig}`);
        return { ok: false, error: 'reverted', sig: lastSig };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'payout_failed';
      if (attempt === MAX_ATTEMPTS) {
        await markFailed(id, msg);
        return { ok: false, error: msg, sig: lastSig ?? undefined };
      }
    }
  }

  if (lastSig) {
    const st = await c.getSignatureStatus(lastSig, { searchTransactionHistory: true }).catch(() => null);
    const cs = st?.value?.confirmationStatus;
    if (cs === 'confirmed' || cs === 'finalized') {
      await finalize(id, lastSig, row.user_id, row.address, usd, qty);
      return { ok: true, sig: lastSig };
    }
  }

  await markFailed(id, 'not_confirmed_after_attempts');
  return { ok: false, error: 'not_confirmed', sig: lastSig ?? undefined };
}

export function treasury(): string {
  return treasuryAddress();
}

