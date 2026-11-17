import { pool } from './db.js';
import { createDepositWallet } from './privy.js';

/**
 * Returns the user's deposit address, creating the wallet on first call.
 * The address is stable for the life of the account.
 */
export async function ensureDepositAddress(userId: string): Promise<string> {
  const r = await pool.query<{ privy_address: string | null }>(
    'select privy_address from users where id = $1',
    [userId],
  );
  const existing = r.rows[0]?.privy_address;
  if (existing) return existing;

  const w = await createDepositWallet(userId);
  const upd = await pool.query<{ privy_address: string }>(
    `update users set privy_wallet_id = $2, privy_address = $3
      where id = $1 and privy_address is null
      returning privy_address`,
    [userId, w.id, w.address],
  );
  if (upd.rowCount) return upd.rows[0].privy_address;

  const again = await pool.query<{ privy_address: string }>(
    'select privy_address from users where id = $1',
    [userId],
  );
  return again.rows[0].privy_address;
}

/** Wallet id backing a user's deposit address. */
export async function depositWalletId(userId: string): Promise<string | null> {
  const r = await pool.query<{ privy_wallet_id: string | null }>(
    'select privy_wallet_id from users where id = $1',
    [userId],
  );
  return r.rows[0]?.privy_wallet_id ?? null;
}