import { Router } from 'express';

const HOSTS = ['https://frontend-api-v3.pump.fun/coins', 'https://frontend-api-v2.pump.fun/coins'];
const TTL = 8000;

type Coin = Record<string, any>;

let cache: { at: number; data: unknown } | null = null;
let busy: Promise<unknown> | null = null;

const H: Record<string, string> = {
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://pump.fun/',
  origin: 'https://pump.fun',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
};

async function fetchAt(base: string, q: Record<string, string>): Promise<Coin[]> {
  const u = new URL(base);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  u.searchParams.set('includeNsfw', 'true');
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(r.status + ' @ ' + new URL(base).host);
  return (await r.json()) as Coin[];
}

async function get(q: Record<string, string>): Promise<Coin[]> {
  let last = '';
  for (const h of HOSTS) {
    try { return await fetchAt(h, q); } catch (e) { last = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(last || 'no_host');
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
  } catch (e) {
    if (cache) { res.json(cache.data); return; }
    res.status(502).json({ error: 'feed_down', detail: e instanceof Error ? e.message : String(e) });
  }
});