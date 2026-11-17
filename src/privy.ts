import { PrivyClient } from '@privy-io/node';
import { env } from './env.js';

let client: PrivyClient | null = null;

export function privyReady(): boolean {
  return Boolean(env.privyAppId && env.privyAppSecret && env.privyAuthKey);
}

function privy(): PrivyClient {
  if (!client) {
    if (!env.privyAppId || !env.privyAppSecret) throw new Error('privy_not_configured');
    client = new PrivyClient({ appId: env.privyAppId, appSecret: env.privyAppSecret });
  }
  return client;
}

function auth() {
  if (!env.privyAuthKey) throw new Error('privy_auth_key_missing');
  return { authorization_private_keys: [env.privyAuthKey] };
}

function chain(): 'solana' | 'solana_devnet' {
  return env.privyNetwork === 'mainnet' ? 'solana' : 'solana_devnet';
}

/** Signed requests expire; always compute at call time, never at boot. */
function expiry(): number {
  return Date.now() + 600_000;
}

/** micro-USDC to the decimal string the API expects. */
export function usdc(micro: bigint): string {
  const whole = micro / 1000000n;
  const frac = (micro % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}.0`;
}

/** One deposit wallet per user. No auth context: create takes only params. */
export async function createDepositWallet(externalId?: string): Promise<{ id: string; address: string }> {
  const w = await privy().wallets().create({
    chain_type: 'solana',
    ...(externalId ? { external_id: externalId } : {}),
  });
  if (!w.id || !w.address) throw new Error('privy_wallet_no_address');
  return { id: w.id, address: w.address };
}

/**
 * Sends USDC from the treasury wallet.
 * idempotencyKey must be stable per withdrawal (e.g. `withdraw:<id>`).
 */
export async function sendUsdc(
  to: string,
  micro: bigint,
  referenceId: string,
  idempotencyKey: string,
): Promise<string> {
  if (!env.privyTreasuryWalletId) throw new Error('privy_treasury_missing');
  const res = await privy().wallets().transfer(env.privyTreasuryWalletId, {
    amount: usdc(micro),
    amount_type: 'exact_input',
    source: { asset: 'usdc', chain: chain() },
    destination: { address: to },
    reference_id: referenceId.slice(0, 64),
    idempotency_key: idempotencyKey,
    request_expiry: expiry(),
    authorization_context: auth(),
  });
  if (!res.id) throw new Error('privy_transfer_no_id');
  return res.id;
}