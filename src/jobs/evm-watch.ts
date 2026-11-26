import { pool } from '../db.js';

/**
 * EVM deposits convert to USDC on Solana through Privy's inline route, and
 * poll.ts only ever looks at Solana addresses. When a route stalls the funds sit
 * on the EVM side and nothing notices. This reads those balances and logs them.
 * Logs only; never repairs.
 */
const GRACE_MIN = 30;
const LIMIT = 25;
const CONCURRENCY = 6;
const RELOG_MS = 6 * 60 * 60 * 1000;
const SELECTOR = '0x70a08231';

type Chain = { rpc: string; native: string; usdc?: string; decimals?: number };

export const CHAINS: Record<string, Chain> = {
  ethereum: { rpc: process.env.EVM_RPC_ETHEREUM ?? 'https://eth.llamarpc.com', native: 'ETH', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  base: { rpc: process.env.EVM_RPC_BASE ?? 'https://mainnet.base.org', native: 'ETH', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  arbitrum: { rpc: process.env.EVM_RPC_ARBITRUM ?? 'https://arb1.arbitrum.io/rpc', native: 'ETH', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  optimism: { rpc: process.env.EVM_RPC_OPTIMISM ?? 'https://mainnet.optimism.io', native: 'ETH', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
  polygon: { rpc: process.env.EVM_RPC_POLYGON ?? 'https://polygon-rpc.com', native: 'POL', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  bsc: { rpc: process.env.EVM_RPC_BSC ?? 'https://bsc-dataseed.binance.org', native: 'BNB', usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
};
if (process.env.EVM_RPC_ROBINHOOD) CHAINS.robinhood = { rpc: process.env.EVM_RPC_ROBINHOOD, native: 'ETH' };

/** address -> last time it was logged, so one stuck address does not spam every pass. */
const LOGGED = new Map<string, number>();

export const pad = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export async function call(rpc: string, method: string, params: unknown[]): Promise<string | null> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: string };
    return typeof j.result === 'string' ? j.result : null;
  } catch {
    return null;
  }
}

export function hex(v: string | null): bigint | null {
  if (!v || v === '0x') return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

async function balances(address: string, c: Chain): Promise<{ asset: string; raw: bigint }[]> {
  const out: { asset: string; raw: bigint }[] = [];
  const native = hex(await call(c.rpc, 'eth_getBalance', [address, 'latest']));
  if (native && native > 0n) out.push({ asset: c.native, raw: native });
  if (c.usdc) {
    const data = SELECTOR + pad(address);
    const token = hex(await call(c.rpc, 'eth_call', [{ to: c.usdc, data }, 'latest']));
    if (token && token > 0n) out.push({ asset: 'USDC', raw: token });
  }
  return out;
}

export async function watchEvmDeposits(): Promise<void> {
  const { rows } = await pool.query<{ user_id: string; address: string }>(
    `select user_id, address from deposit_addresses where family = 'evm' order by random() limit $1`,
    [LIMIT],
  );
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(
      rows.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          const credited = await pool.query(
            `select 1 from deposits where user_id = $1 and created_at > now() - interval '${GRACE_MIN} minutes' limit 1`,
            [row.user_id],
          );
          if ((credited.rowCount ?? 0) > 0) return;

          const stuck: string[] = [];
          for (const [name, c] of Object.entries(CHAINS)) {
            for (const b of await balances(row.address, c)) stuck.push(`${name} ${b.asset} raw=${b.raw}`);
          }
          if (stuck.length === 0) return;

          if (Date.now() - (LOGGED.get(row.address) ?? 0) > RELOG_MS) {
            LOGGED.set(row.address, Date.now());
            console.error('evm-watch: STALLED', row.user_id, row.address, stuck.join(' | '));
          }
        } catch (e) {
          console.error('evm-watch', row.address, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
}