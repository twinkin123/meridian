const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TTL_MS = 60_000;
const FALLBACK_MICRO = 71_500_000n;

let cache = { micro: 0n, at: 0 };

async function jupiter(): Promise<bigint | null> {
  const r = await fetch(`https://lite-api.jup.ag/price/v2?ids=${SOL_MINT}`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  const p = j?.data?.[SOL_MINT]?.price;
  if (!p) return null;
  const v = BigInt(Math.round(Number(p) * 1_000_000));
  return v > 0n ? v : null;
}

async function coingecko(): Promise<bigint | null> {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!r.ok) return null;
  const j: any = await r.json();
  const p = j?.solana?.usd;
  if (!p) return null;
  const v = BigInt(Math.round(Number(p) * 1_000_000));
  return v > 0n ? v : null;
}

export async function solPriceMicro(): Promise<bigint> {
  if (cache.micro > 0n && Date.now() - cache.at < TTL_MS) return cache.micro;

  for (const source of [jupiter, coingecko]) {
    try {
      const v = await source();
      if (v) {
        cache = { micro: v, at: Date.now() };
        return v;
      }
    } catch {
      // try the next source
    }
  }

  const env = process.env.SOL_PRICE_USD;
  if (env && /^\d+(\.\d+)?$/.test(env)) {
    const v = BigInt(Math.round(Number(env) * 1_000_000));
    if (v > 0n) {
      cache = { micro: v, at: Date.now() };
      return v;
    }
  }

  return cache.micro > 0n ? cache.micro : FALLBACK_MICRO;
}

export function clearPriceCache(): void {
  cache = { micro: 0n, at: 0 };
}