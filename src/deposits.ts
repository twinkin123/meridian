import { addAddress } from './helius.js';
import { pool, tx } from './db.js';
import { sponsoredSources } from './deposit-routes.js';
import { createCryptoDepositAccount, createDepositWallet, createPrivyUser, findWalletByExternalId } from './privy.js';

export type DepositAddresses = Record<string, string>;

export async function ensureDepositAddresses(userId: string): Promise<DepositAddresses> {
  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);

    const u = await c.query<{ privy_address: string | null; privy_wallet_id: string | null }>(
      'select privy_address, privy_wallet_id from users where id = $1',
      [userId],
    );
    const row = u.rows[0];
    if (!row) throw new Error('user_missing');

    let walletId = row.privy_wallet_id;
    let solana = row.privy_address;

    if (!solana) {
      const own = await c.query<{ privy_user_id: string | null; email: string | null }>(
        'select privy_user_id, email from users where id = $1',
        [userId],
      );
      let privyUserId = own.rows[0]?.privy_user_id ?? null;
      if (!privyUserId) {
        privyUserId = await createPrivyUser(userId, own.rows[0]?.email ?? null);
        await c.query('update users set privy_user_id = $2 where id = $1', [userId, privyUserId]);
      }

      let w: { id: string; address: string };
      try {
        w = await createDepositWallet(userId, privyUserId);
      } catch {
        const found = await findWalletByExternalId(userId);
        if (!found) throw new Error('privy_wallet_create_failed');
        w = found;
      }
      const upd = await c.query<{ privy_address: string }>(
        'update users set privy_wallet_id = $2, privy_address = $3 where id = $1 returning privy_address',
        [userId, w.id, w.address],
      );
      solana = upd.rows[0].privy_address;
      walletId = w.id;
    }

    const have = await c.query<{ family: string; address: string }>(
      'select family, address from deposit_addresses where user_id = $1',
      [userId],
    );
    const out: DepositAddresses = {};
    for (const r of have.rows) out[r.family] = r.address;

    if (!out.sol) {
      await c.query(
        `insert into deposit_addresses (user_id, family, address) values ($1, 'sol', $2)
         on conflict (user_id, family) do update set address = excluded.address`,
        [userId, solana],
      );
      out.sol = solana;
      void addAddress(solana).catch((e) => console.error('helius: add address failed', e));
    }

    if (walletId && !out.evm) {
      try {
        const chains = await createCryptoDepositAccount(walletId, await sponsoredSources());
        for (const [family, address] of Object.entries(chains)) {
          if (family === 'sol' || out[family]) continue;
          await c.query(
            `insert into deposit_addresses (user_id, family, address) values ($1, $2, $3)
             on conflict (user_id, family) do update set address = excluded.address`,
            [userId, family, address],
          );
          out[family] = address;
        }
      } catch (err) {
        console.error('deposit: chains failed', walletId, err);
      }
    }

    return out;
  });
}

export async function ensureDepositAddress(userId: string): Promise<string> {
  return (await ensureDepositAddresses(userId)).sol;
}

export async function depositWalletId(userId: string): Promise<string | null> {
  const r = await pool.query<{ privy_wallet_id: string | null }>(
    'select privy_wallet_id from users where id = $1',
    [userId],
  );
  return r.rows[0]?.privy_wallet_id ?? null;
}
