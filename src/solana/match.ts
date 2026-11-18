export const USDC_MINT = process.env.USDC_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const LAMPORTS = 1_000_000_000n;
/** SOL deltas at or below this are float and fee noise, not a deposit. */
const NOISE = BigInt(process.env.SOL_DEPOSIT_NOISE_LAMPORTS ?? '4000000');

type TokenBal = { mint: string; owner?: string; uiTokenAmount: { amount: string } };

export type Match = { asset: 'USDC' | 'SOL'; qty: bigint };

export function matchDeposit(tx: any, depositAddr: string): Match | null {
  const meta = tx?.meta;
  if (!meta || meta.err) return null;

  const pre: TokenBal[] = meta.preTokenBalances ?? [];
  const post: TokenBal[] = meta.postTokenBalances ?? [];

  for (const p of post) {
    if (p.mint !== USDC_MINT || p.owner !== depositAddr) continue;
    const before = pre.find((q) => q.owner === depositAddr && q.mint === USDC_MINT);
    const delta = BigInt(p.uiTokenAmount.amount) - BigInt(before?.uiTokenAmount.amount ?? '0');
    if (delta > 0n) return { asset: 'USDC', qty: delta };
  }

  const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map((k: any) =>
    typeof k === 'string' ? k : k.pubkey,
  );
  const idx = keys.indexOf(depositAddr);
  if (idx >= 0) {
    const delta = BigInt(meta.postBalances[idx]) - BigInt(meta.preBalances[idx]);
    if (delta > NOISE) return { asset: 'SOL', qty: delta }; // ignore treasury float + fee noise
  }

  return null;
}

// priceMicro is dollars scaled by 1e6, so lamports * priceMicro / 1e9 is micro-dollars
export function usdMicro(asset: 'USDC' | 'SOL', qty: bigint, priceMicro: bigint): bigint {
  return asset === 'USDC' ? qty : (qty * priceMicro) / LAMPORTS;
}
