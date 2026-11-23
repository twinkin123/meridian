/** Exact asset/network pairs Privy accepts for crypto deposits. Nothing else is offered. */
export const PAIRS: [asset: string, symbol: string, chain: string, network: string][] = [
  ['eth', 'ETH', 'arbitrum', 'Arbitrum'],
  ['eth', 'ETH', 'base', 'Base'],
  ['eth', 'ETH', 'ethereum', 'Ethereum'],
  ['eth', 'ETH', 'optimism', 'Optimism'],
  ['eth', 'ETH', 'robinhood', 'Robinhood Chain'],
  ['eurc', 'EURC', 'base', 'Base'],
  ['eurc', 'EURC', 'ethereum', 'Ethereum'],
  ['ousd', 'OUSD', 'base', 'Base'],
  ['ousd', 'OUSD', 'ethereum', 'Ethereum'],
  ['pol', 'POL', 'polygon', 'Polygon'],
  ['usdb', 'USDB', 'ethereum', 'Ethereum'],
  ['usdc', 'USDC', 'arbitrum', 'Arbitrum'],
  ['usdc', 'USDC', 'base', 'Base'],
  ['usdc', 'USDC', 'bsc', 'BNB Chain'],
  ['usdc', 'USDC', 'ethereum', 'Ethereum'],
  ['usdc', 'USDC', 'optimism', 'Optimism'],
  ['usdc', 'USDC', 'polygon', 'Polygon'],
  ['usdc_e', 'USDC.e', 'polygon', 'Polygon'],
  ['usdg', 'USDG', 'ethereum', 'Ethereum'],
  ['usdg', 'USDG', 'robinhood', 'Robinhood Chain'],
  ['usdt', 'USDT', 'arbitrum', 'Arbitrum'],
  ['usdt', 'USDT', 'base', 'Base'],
  ['usdt', 'USDT', 'bsc', 'BNB Chain'],
  ['usdt', 'USDT', 'ethereum', 'Ethereum'],
  ['usdt', 'USDT', 'optimism', 'Optimism'],
  ['usdt', 'USDT', 'polygon', 'Polygon'],
  ['eurc', 'EURC', 'solana', 'Solana'],
  ['ousd', 'OUSD', 'solana', 'Solana'],
  ['sol', 'SOL', 'solana', 'Solana'],
  ['usdc', 'USDC', 'solana', 'Solana'],
  ['usdg', 'USDG', 'solana', 'Solana'],
  ['usdt', 'USDT', 'solana', 'Solana'],
];

/** Chain key -> display name, in first-seen order. */
export const CHAINS: Record<string, string> = Object.fromEntries(
  PAIRS.map(([, , chain, network]) => [chain, network]),
);

/** Asset key -> symbol, in first-seen order. */
export const ASSETS: [asset: string, symbol: string][] = [
  ...new Map(PAIRS.map(([asset, symbol]) => [asset, symbol] as [string, string])).entries(),
];

/** Source values for create, built from the matrix so the two never drift. */
export const SOURCES: { asset: string; chain: string }[] = PAIRS.map(([asset, , chain]) => ({ asset, chain }));

export function familyOfChain(chain: string): string {
  if (chain === 'solana') return 'sol';
  return 'evm';
}

export const MIN_USD: Record<string, number> = { evm: 15, sol: 10 };

/** Same-chain pairs cannot be quoted; they deliver 1:1. */
export const isDirect = (asset: string, chain: string): boolean =>
  asset === 'usdc' && chain === 'solana';