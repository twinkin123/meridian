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

type Row = { usd: number; chg: number };
type Cache = { at: number; data: Record<string, Row> };

const TTL = 1_000;
let cache: Cache | null = null;
let inflight: Promise<Record<string, Row>> | null = null;

const bin = (id: string) => `${SYM[id].toUpperCase()}USDT`;

async function load(): Promise<Record<string, Row>> {
  const syms = encodeURIComponent(JSON.stringify(IDS.map(bin)));
  const r = await fetch(
    `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${syms}`,
    { headers: { accept: 'application/json' } },
  );
  if (!r.ok) throw new Error(`binance ${r.status}`);
  const rows = (await r.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
  const out: Record<string, Row> = {};
  for (const row of rows) {
    const id = IDS.find((k) => bin(k) === row.symbol);
    if (!id) continue;
    const usd = Number(row.lastPrice);
    if (!Number.isFinite(usd)) continue;
    out[id] = { usd, chg: Number(row.priceChangePercent) || 0 };
  }
  if (!Object.keys(out).length) throw new Error('binance empty');
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
    const cg = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}&per_page=1&page=1&sparkline=false`, { headers: { accept: 'application/json' } });
    if (!cg.ok) { res.status(404).end(); return; }
    const jj = (await cg.json()) as Array<{ image?: string }>;
    const url = jj[0]?.image;
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