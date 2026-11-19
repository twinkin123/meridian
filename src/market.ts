import { Router } from 'express';

/** CoinGecko ids the ticker needs, and the path-safe symbol each maps to. */
const SYM: Record<string, string> = {
  solana: 'sol', 'usd-coin': 'usdc', bitcoin: 'btc', ethereum: 'eth',
  'jupiter-exchange-solana': 'jup', binancecoin: 'bnb', ripple: 'xrp', cardano: 'ada',
  dogecoin: 'doge', 'avalanche-2': 'avax', tron: 'trx', chainlink: 'link',
  polkadot: 'dot', litecoin: 'ltc', 'bitcoin-cash': 'bch', stellar: 'xlm',
  uniswap: 'uni', near: 'near', cosmos: 'atom', arbitrum: 'arb',
};
const IDS = Object.keys(SYM);
/** Deposit symbols with no CoinGecko id of their own, borrowing a sibling logo. */
const ALIAS: Record<string, string> = { 'usdc-e': 'usdc' };

type Row = { usd: number; chg: number; logo: string };
type Cache = { at: number; data: Record<string, Row> };

const TTL = 60_000;
let cache: Cache | null = null;
let inflight: Promise<Record<string, Row>> | null = null;

async function load(): Promise<Record<string, Row>> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${IDS.join(',')}` +
      `&price_change_percentage=24h&per_page=50&page=1&sparkline=false`,
    { headers: { accept: 'application/json' } },
  );
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const rows = (await r.json()) as Array<{
    id: string; current_price: number; price_change_percentage_24h: number | null; image: string;
  }>;
  const out: Record<string, Row> = {};
  for (const row of rows) {
    if (typeof row.current_price !== 'number') continue;
    out[row.id] = { usd: row.current_price, chg: row.price_change_percentage_24h ?? 0, logo: row.image };
  }
  return out;
}

export async function prices(): Promise<Record<string, Row>> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) {
    inflight = load()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => { inflight = null; });
  }
  try {
    return await inflight;
  } catch (err) {
    if (cache) return cache.data;
    throw err;
  }
}

export const market = Router();

market.get('/prices', async (_req, res) => {
  try {
    const data = await prices();
    const out: Record<string, { usd: number; chg: number }> = {};
    for (const [id, row] of Object.entries(data)) out[id] = { usd: row.usd, chg: row.chg };
    res.set('Cache-Control', 'public, max-age=30');
    res.json(out);
  } catch {
    res.status(502).json({ error: 'no_prices' });
  }
});

const logos = new Map<string, { at: number; type: string; body: Buffer }>();

market.get('/logo/:sym', async (req, res) => {
  const sym = String(req.params.sym).toLowerCase();
  const key = ALIAS[sym] ?? sym;
  const id = IDS.find((k) => SYM[k] === key);
  if (!id) { res.status(404).end(); return; }

  const hit = logos.get(sym);
  if (hit && Date.now() - hit.at < 86_400_000) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(hit.type).send(hit.body);
    return;
  }
  try {
    const data = await prices();
    const url = data[id]?.logo;
    if (!url) { res.status(404).end(); return; }
    const r = await fetch(url);
    if (!r.ok) { res.status(404).end(); return; }
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') ?? 'image/png';
    logos.set(sym, { at: Date.now(), type, body });
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(type).send(body);
  } catch {
    res.status(502).end();
  }
});