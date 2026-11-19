/** Chains Privy accepts for crypto deposits (from its own supported list). */
export const CHAINS: Record<string, string> = {
  ethereum: 'Ethereum', base: 'Base', polygon: 'Polygon', arbitrum: 'Arbitrum',
  optimism: 'Optimism', avalanche: 'Avalanche', bsc: 'BNB Chain', linea: 'Linea',
  zksync_era: 'zkSync', unichain: 'Unichain', worldchain: 'World Chain', ink: 'Ink',
  soneium: 'Soneium', arc: 'Arc', monad: 'Monad', megaeth: 'MegaETH',
  robinhood: 'Robinhood Chain', hyperevm: 'HyperEVM', tempo: 'Tempo',
  solana: 'Solana', tron: 'Tron',
};

export const ASSETS: [asset: string, symbol: string][] = [
  ['eth', 'ETH'], ['sol', 'SOL'], ['pol', 'POL'], ['trx', 'TRX'], ['avax', 'AVAX'],
  ['usdc', 'USDC'], ['usdt', 'USDT'], ['usdc_e', 'USDC.e'], ['usdt0', 'USDT0'],
  ['usdb', 'USDB'], ['usdg', 'USDG'], ['pathusd', 'pathUSD'], ['eurc', 'EURC'],
  ['ousd', 'OUSD'],
  ['0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'WBTC'],
  ['0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', 'WBTC'],
];

export function familyOfChain(chain: string): string {
  if (chain === 'tron') return 'tron';
  if (chain === 'solana') return 'sol';
  return 'evm';
}

export const MIN_USD: Record<string, number> = { tron: 15, evm: 15, sol: 10 };

/** Same-chain pairs cannot be quoted; they deliver 1:1. */
export const isDirect = (asset: string, chain: string): boolean =>
  asset === 'usdc' && chain === 'solana';

/** Source values for create, built from the matrix so the two never drift. */
export const SOURCES = ASSETS.flatMap(([asset]) =>
  Object.keys(CHAINS).map((chain) => ({ asset, chain })),
);
