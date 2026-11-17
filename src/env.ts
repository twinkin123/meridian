import 'dotenv/config';

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
}

export const env = {
  isTest: process.env.NODE_ENV === 'test',
  databaseUrl:
    process.env.NODE_ENV === 'test' ? need('TEST_DATABASE_URL') : need('DATABASE_URL'),
  masterMnemonic: need('MASTER_MNEMONIC'),
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret',
  rpcUrl: process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'dev-webhook',
  heliusApiKey: process.env.HELIUS_API_KEY ?? '',
  solPriceUsd: process.env.SOL_PRICE_USD ?? '142',
  privyAppId: process.env.PRIVY_APP_ID ?? '',
  privyAppSecret: process.env.PRIVY_APP_SECRET ?? '',
  privyAuthKey: process.env.PRIVY_AUTH_KEY ?? '',
  privyTreasuryWalletId: process.env.PRIVY_TREASURY_WALLET_ID ?? '',
  privyNetwork: process.env.PRIVY_NETWORK === 'mainnet' ? 'mainnet' : 'devnet',
};