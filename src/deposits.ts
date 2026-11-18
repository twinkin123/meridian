import { pool, tx } from './db.js';
import { createDepositWallet, findWalletByExternalId } from './privy.js';

/**
 * Returns the user's deposit address, creating the wallet on first call.
 * Serialised on the user row so two concurrent callers cannot both create.
 */
export async function ensureDepositAddress(userId: string): Promise<string> {
  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);

    const r = await c.query<{ privy_address: string | null }>(
      'select privy_address from users where id = $1',
      [userId],
    );
    const existing = r.rows[0]?.privy_address;
    if (existing) return existing;

    let w: { id: string; address: string };
    try {
      w = await createDepositWallet(userId);
    } catch {
      const found = await findWalletByExternalId(userId);
      if (!found) throw new Error('privy_wallet_create_failed');
      w = found;
    }

    const upd = await c.query<{ privy_address: string }>(
      `update users set privy_wallet_id = $2, privy_address = $3
        where id = $1 returning privy_address`,
      [userId, w.id, w.address],
    );
    return upd.rows[0].privy_address;
  });
}

/** Wallet id backing a user's deposit address. */
export async function depositWalletId(userId: string): Promise<string | null> {
  const r = await pool.query<{ privy_wallet_id: string | null }>(
    'select privy_wallet_id from users where id = $1',
    [userId],
  );
  return r.rows[0]?.privy_wallet_id ?? null;
}
