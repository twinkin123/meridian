import { readFileSync, writeFileSync } from 'node:fs';

/* ---------- 1. reserve now lands in available, never a lock ---------- */
const L = 'src/locks.ts';
let l = readFileSync(L, 'utf8');

const oldGuard = `  // Level 1 means "start no new 30-day locks"; reserve simply accumulates.
  if ((await freezeLevel()) >= 1) return { state: 'nothing' };`;
if (!l.includes(oldGuard)) throw new Error('guard not found');
l = l.replace(oldGuard, `  // No new locks are created here any more, so a level-1 freeze does not stop it.
  if ((await freezeLevel()) >= 2) return { state: 'nothing' };`);

const oldPost = `    await c.query('select ensure_user_accounts($1)', [userId]);
    await post(c, 'HeldCombined', \`combine:\${userId}:\${Date.now()}\`, [
      { code: '2050', owner: userId, amount },
      { code: '2070', owner: userId, amount: -amount },
    ]);
    await notify(c, userId, 'reserve_locked', \`\${usdStr(amount)} USD moved from reserve into a 30-day lock.\`);

    await c.query(
      \`update deposits set status = 'locked', unlock_at = now() + interval '30 days'
        where id = any($1::uuid[]) and status = 'held'\`,
      [rows.rows.map((r) => r.id)],
    );`;
if (!l.includes(oldPost)) throw new Error('combine post not found');

l = l.replace(oldPost, `    await c.query('select ensure_user_accounts($1)', [userId]);
    await post(c, 'HeldCredited', \`combine:\${userId}:\${Date.now()}\`, [
      { code: '2050', owner: userId, amount },
      { code: '2000', owner: userId, amount: -amount },
    ]);
    await notify(c, userId, 'reserve_available',
      \`\${usdStr(amount)} USD moved from reserve to your available balance.\`);

    await c.query(
      \`update deposits set status = 'credited', released_at = now()
        where id = any($1::uuid[]) and status = 'held'\`,
      [rows.rows.map((r) => r.id)],
    );`);

l = l.replace(
  ` * Held dust never becomes spendable directly. Once the held rows clear
 * MIN_DEPOSIT they are combined into the locked bucket with a fresh
 * 30-day clock, and only then can they be claimed and released.`,
  ` * Held dust never becomes spendable directly. Once the held rows clear
 * MIN_DEPOSIT they are combined and paid straight into available. Starting a
 * 30-day lock is a separate, deliberate action on the stake page.`);

writeFileSync(L, l);

/* ---------- 2. new stake module ---------- */
writeFileSync('src/stakes.ts', `import { randomUUID } from 'node:crypto';
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
      \`select coalesce(balance, 0)::text b from v_balance where user_id = $1 and code = '2000'\`,
      [userId],
    );
    if (BigInt(bal.rows[0]?.b ?? '0') < amount) return { ok: false, error: 'insufficient' };

    const d = await c.query<{ id: string }>(
      \`insert into deposits (user_id, sig, asset, qty, usd_at_det, status, unlock_at)
       values ($1, $2, 'USDC', $3, $3, 'locked', now() + (\$4 || ' days')::interval)
       returning id\`,
      [userId, 'stake:' + randomUUID(), amount.toString(), String(STAKE_DAYS)],
    );
    const id = d.rows[0]!.id;

    await post(c, 'StakeLocked', \`stake:\${id}\`, [
      { code: '2000', owner: userId, amount: -amount },
      { code: '2070', owner: userId, amount },
    ]);
    await notify(c, userId, 'stake_started', \`\${usdStr(amount)} USD locked for \${STAKE_DAYS} days.\`);

    return { ok: true, id };
  });
}
`);

/* ---------- 3. route ---------- */
const W = 'src/http/routes/wallet.ts';
let w = readFileSync(W, 'utf8');

if (!w.includes("from '../../stakes.js'")) {
  w = w.replace(
    "import { requestClaim, cancelClaim } from '../../locks.js';",
    "import { requestClaim, cancelClaim } from '../../locks.js';\nimport { stake, MIN_STAKE } from '../../stakes.js';",
  );
}

const anchor = `wallet.post('/deposits/:id/claim', requireUser`;
if (!w.includes(anchor)) throw new Error('claim route not found');

w = w.replace(anchor, `wallet.post('/stakes', requireUser, async (req, res) => {
  const { usd } = req.body ?? {};
  if (!/^\\d+$/.test(String(usd))) return res.status(400).json({ error: 'bad_amount' });

  const out = await stake(req.userId!, BigInt(usd));
  if (!out.ok) return res.status(400).json({ error: out.error, min: MIN_STAKE.toString() });
  res.json({ id: out.id });
});

wallet.post('/deposits/:id/claim', requireUser`);

writeFileSync(W, w);
console.log('backend done');
