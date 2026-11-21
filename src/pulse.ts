import { Router } from 'express';

const BASE = 'https://frontend-api-v3.pump.fun/coins';
const TTL = 8000;

type Coin = Record<string, any>;

let cache: { at: number; data: unknown } | null = null;
let busy: Promise<unknown> | null = null;

async function get(q: Record<string, string>): Promise<Coin[]> {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  u.searchParams.set('includeNsfw', 'true');
  const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': 'meridian-pulse' } });
  if (!r.ok) throw new Error('pump ' + r.status);
  return (await r.json()) as Coin[];
}

function shape(c: Coin) {
  return {
    mint: String(c.mint ?? ''),
    name: String(c.name ?? ''),
    sym: String(c.symbol ?? ''),
    img: String(c.image_uri ?? ''),
    mc: Number(c.usd_market_cap ?? 0),
    liq: Number(c.canonical_pool_liquidity_usd ?? 0),
    at: Number(c.created_timestamp ?? 0),
    live: Boolean(c.is_currently_live),
    x: String(c.twitter ?? ''),
    tg: String(c.telegram ?? ''),
    web: String(c.website ?? ''),
    by: String(c.username ?? ''),
  };
}

async function build() {
  const [fresh, done] = await Promise.all([
    get({ offset: '0', limit: '200', sort: 'created_timestamp', order: 'DESC', complete: 'false' }),
    get({ offset: '0', limit: '12', sort: 'created_timestamp', order: 'DESC', complete: 'true' }),
  ]);
  const stretch = [...fresh]
    .sort((a, b) => Number(b.usd_market_cap ?? 0) - Number(a.usd_market_cap ?? 0))
    .slice(0, 12);
  return {
    at: Date.now(),
    fresh: fresh.slice(0, 24).map(shape),
    stretch: stretch.map(shape),
    migrating: done.map(shape),
  };
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
  } catch {
    if (cache) { res.json(cache.data); return; }
    res.status(502).json({ error: 'feed_down' });
  }
});