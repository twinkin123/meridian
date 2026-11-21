import { Router } from 'express';

const PROFILES = 'https://api.dexscreener.com/token-profiles/latest/v1';
const TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';
const TTL = 20000;
const TAKE = 12;

type Any = Record<string, any>;

let cache: { at: number; data: unknown } | null = null;
let busy: Promise<unknown> | null = null;

const H: Record<string, string> = { accept: 'application/json' };

async function json(url: string): Promise<any> {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(r.status + ' @ ' + new URL(url).host);
  return await r.json();
}

function social(p: Any, type: string): string {
  const links = (p.info?.socials ?? []) as Any[];
  const hit = links.find((l) => l.type === type);
  return typeof hit?.url === 'string' ? hit.url : '';
}

function shape(p: Any) {
  return {
    mint: String(p.baseToken?.address ?? ''),
    name: String(p.baseToken?.name ?? ''),
    sym: String(p.baseToken?.symbol ?? ''),
    img: String(p.info?.imageUrl ?? ''),
    mc: Number(p.marketCap ?? p.fdv ?? 0),
    liq: Number(p.liquidity?.usd ?? 0),
    at: Number(p.pairCreatedAt ?? 0),
    dex: String(p.dexId ?? ''),
    x: social(p, 'twitter'),
    tg: social(p, 'telegram'),
    web: String(p.info?.websites?.[0]?.url ?? ''),
  };
}

async function build() {
  const prof = (await json(PROFILES)) as Any[];
  const mints = prof
    .filter((p) => p.chainId === 'solana' && typeof p.tokenAddress === 'string')
    .map((p) => p.tokenAddress as string)
    .slice(0, 30);

  if (!mints.length) throw new Error('no_profiles');

  const body = (await json(TOKENS + mints.join(','))) as { pairs?: Any[] };
  const want = new Set(mints);

  /* One row per token: the deepest pool wins, so a token is not listed twice. */
  const best = new Map<string, Any>();
  for (const p of body.pairs ?? []) {
    if (p.chainId !== 'solana') continue;
    const addr = p.baseToken?.address;
    if (!want.has(addr)) continue;
    const prev = best.get(addr);
    if (!prev || Number(p.liquidity?.usd ?? 0) > Number(prev.liquidity?.usd ?? 0)) best.set(addr, p);
  }

  const rows = [...best.values()];
  const by = (a: Any, b: Any) => Number(b.pairCreatedAt ?? 0) - Number(a.pairCreatedAt ?? 0);

  const fresh = [...rows].sort(by).slice(0, TAKE);
  const migrating = rows.filter((p) => p.dexId && p.dexId !== 'pumpfun').sort(by).slice(0, TAKE);
  const stretch = rows
    .filter((p) => p.dexId === 'pumpfun')
    .sort((a, b) => Number(b.marketCap ?? 0) - Number(a.marketCap ?? 0))
    .slice(0, TAKE);

  return { at: Date.now(), fresh: fresh.map(shape), stretch: stretch.map(shape), migrating: migrating.map(shape) };
}

export const pulse = Router();

pulse.get('/', async (_req, res) => {
  try {
    if (cache && Date.now() - cache.at < TTL) { res.json(cache.data); return; }
    if (!busy) {
      busy = build()
        .then((d) => { cache = { at: Date.now(), data: d }; return d; })
        .finally(() => { busy = null; });
    }
    res.json(await busy);
  } catch (e) {
    if (cache) { res.json(cache.data); return; }
    res.status(502).json({ error: 'feed_down', detail: e instanceof Error ? e.message : String(e) });
  }
});