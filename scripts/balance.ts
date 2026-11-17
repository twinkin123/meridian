const ADDR = process.argv[2];
if (!ADDR) { console.error('usage: npx tsx scripts\balance.ts <address>'); process.exit(1); }
const nets = [
  ['mainnet', 'https://api.mainnet-beta.solana.com', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
  ['devnet', 'https://api.devnet.solana.com', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'],
] as const;
for (const [label, url, mint] of nets) {
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return r.json() as Promise<any>;
  };
  const sol = await rpc('getBalance', [ADDR]);
  const tok = await rpc('getTokenAccountsByOwner', [ADDR, { mint }, { encoding: 'jsonParsed' }]);
  const accounts = tok.result?.value ?? [];
  const usdc = accounts.map((a: any) => a.account.data.parsed.info.tokenAmount.uiAmountString).join(',') || '0';
  console.log(`${label}: SOL lamports=${sol.result?.value ?? '?'} USDC=${usdc}`);
}