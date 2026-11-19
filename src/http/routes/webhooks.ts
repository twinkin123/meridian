import { Router } from 'express';
import { env } from '../../env.js';
import { tx, one } from '../../db.js';
import { post } from '../../ledger/post.js';
import { payReferral } from '../../referrals.js';
import { ensure } from '../../ledger/accounts.js';
import { getTx } from '../../solana/rpc.js';
import { matchDeposit, usdMicro } from '../../solana/match.js';
import { freezeLevel } from '../../recon.js';
import { solPriceMicro } from '../../price.js';
import { safeEq } from '../../auth.js';

export const webhooks = Router();

import { MIN_DEPOSIT as MIN, combineHeld } from '../../locks.js';
import { notify, usdStr } from '../../notify.js';

/** Relay attaches order and fill ids as memo instructions. */
function memosFrom(t: any): string[] {
  const out: string[] = [];
  for (const ix of t?.transaction?.message?.instructions ?? []) {
    if (ix?.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' && typeof ix?.parsed === 'string') out.push(ix.parsed);
  }
  return out;
}

/** Helius puts the signature at the top level for raw payloads and at
    transaction.signatures[0] for enhanced ones. Accept both, and any wrapper. */
function sigsFrom(body: any): string[] {
  const items = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
      ? body.data
      : body
        ? [body]
        : [];

  const out: string[] = [];
  for (const t of items) {
    const s =
      t?.signature ??
      t?.transaction?.signature ??
      (Array.isArray(t?.transaction?.signatures) ? t.transaction.signatures[0] : undefined) ??
      (Array.isArray(t?.signatures) ? t.signatures[0] : undefined);
    if (typeof s === 'string' && s.length > 0) out.push(s);
  }
  return out;
}

webhooks.post('/helius', async (req, res) => {
  if (!safeEq((req.header('authorization') ?? '').trim(), env.webhookSecret.trim())) {
    console.log('webhook bad_auth', (req.header('authorization') ?? '').length);
    return res.status(401).json({ error: 'bad_auth' });
  }

  const sigs = sigsFrom(req.body);
  console.log('webhook arrival', sigs.length, sigs[0] ?? '-');

  res.json({ received: sigs.length });

  for (const sig of sigs) {
    try {
      await processSig(sig);
    } catch (e) {
      console.error('webhook', sig, e);
    }
  }
});

export async function processSig(sig: string): Promise<void> {

  const t = await getTx(sig);
  if (!t) throw new Error(`tx_not_found:` + sig);

  const memos = memosFrom(t);

  const frozen = (await freezeLevel()) >= 1;
  const price = await solPriceMicro();

  const keys: string[] = [
    ...(t.transaction?.message?.accountKeys ?? []).map((k: any) =>
      typeof k === 'string' ? k : k?.pubkey,
    ),
    ...(t.meta?.postTokenBalances ?? []).map((p: any) => p.owner),
    ...(t.meta?.preTokenBalances ?? []).map((p: any) => p.owner),
  ].filter(Boolean);

  for (const key of keys) {
    const u = await one<{ id: string }>('select id from users where privy_address = $1', [key]);
    if (!u) continue;
    const seen = await one<{ id: string }>('select id from deposits where sig = $1 and user_id = $2', [sig, u.id]);
    if (seen) continue;

    const m = matchDeposit(t, key, price);
    if (!m) continue;

    const qty = m.qty;
    const usd = usdMicro(m.asset, qty, price);

    if (usd <= 0n) continue;

    const dest = frozen || usd < MIN ? '2050' : '2070';
    await tx(async (c) => {
      const row = await c.query(
        `insert into deposits (user_id, sig, asset, qty, usd_at_det, status, relay_order, relay_fill)
         values ($1,$2,$3,$4,$5,'detected',$6,$7)
         on conflict do nothing returning id`,
        [u.id, sig, m.asset, qty.toString(), usd.toString(), memos[0] ?? null, memos[1] ?? null],
      );
      if (row.rowCount === 0) return;
      const depId = row.rows[0]?.id as string | undefined;

      await ensure(c, u.id);

      await post(c, 'DepositCredited', `${sig}:${u.id}`, [
        { code: '1000', amount: usd },
        { code: dest, owner: u.id, amount: -usd },
      ]);

      await c.query(
        `update deposits set status = $1, unlock_at = now() + interval '30 days' where sig = $2 and user_id = $3`,
        [dest === '2070' ? 'locked' : 'held',
        sig, u.id],
      );

      if (frozen) {
        await notify(c, u.id, 'deposit_held', `${usdStr(usd)} USD received. Withdrawals are frozen, so it waits in reserve.`);
      } else if (dest === '2050') {
        await notify(c, u.id, 'deposit_held', `${usdStr(usd)} USD received and held in reserve. It locks for 30 days once reserve reaches $10.`);
      } else {
        await notify(c, u.id, 'deposit_locked', `${usdStr(usd)} USD received and locked for 30 days.`);
      }
      if (depId) await payReferral(c, u.id, depId, usd);
    });

    if (dest === '2050') await combineHeld(u.id);
  }
}