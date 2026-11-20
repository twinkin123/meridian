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

const LOGO: Record<string, string> = {
  solana: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  'usd-coin': 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  bitcoin: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ethereum: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  'jupiter-exchange-solana': 'https://assets.coingecko.com/coins/images/34188/large/jup.png',
  binancecoin: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  ripple: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  cardano: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png',
  dogecoin: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png',
  'avalanche-2': 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  tron: 'https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png',
  chainlink: 'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png',
  polkadot: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg',
  litecoin: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png',
  'bitcoin-cash': 'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png',
  stellar: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg',
  uniswap: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png',
  near: 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg',
  cosmos: 'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  arbitrum: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg',
};

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
    const url = LOGO[id];
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