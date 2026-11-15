import { Router } from 'express';
import { env } from '../../env.js';
import { tx, one } from '../../db.js';
import { post } from '../../ledger/post.js';
import { ensure } from '../../ledger/accounts.js';
import { getTx } from '../../solana/rpc.js';
import { matchDeposit, LAMPORTS } from '../../solana/match.js';

export const webhooks = Router();

const MIN = 10_000_000n;

webhooks.post('/helius', async (req, res) => {
  if (req.header('authorization') !== env.webhookSecret) {
    return res.status(401).json({ error: 'bad_auth' });
  }

  const sigs: string[] = Array.isArray(req.body)
    ? req.body.map((t: any) => t?.signature).filter(Boolean)
    : [];

  res.json({ received: sigs.length });

  for (const sig of sigs) {
    try {
      await processSig(sig);
    } catch (e) {
      console.error('webhook', sig, e);
    }
  }
});

async function processSig(sig: string): Promise<void> {
  const seen = await one<{ id: string }>('select id from deposits where sig = $1', [sig]);
  if (seen) return;

  const t = await getTx(sig);
  if (!t) return;

  const keys: string[] = (t.transaction?.message?.accountKeys ?? [])
    .map((k: any) => (typeof k === 'string' ? k : k?.pubkey))
    .filter(Boolean);

  for (const key of keys) {
    const u = await one<{ id: string }>('select id from users where deposit_addr = $1', [key]);
    if (!u) continue;

    const m = matchDeposit(t, key);
    if (!m) continue;

    const qty = m.qty;
    const usd =
      m.asset === 'USDC'
        ? qty
        : (qty * BigInt(env.solPriceUsd) * 1_000_000n) / LAMPORTS;

    if (usd <= 0n) continue;

    await tx(async (c) => {
      const row = await c.query(
        `insert into deposits (user_id, sig, asset, qty, usd_at_det, status)
         values ($1,$2,$3,$4,$5,'detected')
         on conflict (sig) do nothing returning id`,
        [u.id, sig, m.asset, qty.toString(), usd.toString()],
      );
      if (row.rowCount === 0) return;

      await ensure(c, u.id);

      const dest = usd >= MIN ? '2000' : '2050';
      await post(c, 'DepositCredited', sig, [
        { code: '1000', amount: usd },
        { code: dest, owner: u.id, amount: -usd },
      ]);

      await c.query('update deposits set status = $1 where sig = $2', [
        dest === '2000' ? 'credited' : 'held',
        sig,
      ]);
    });
  }
}