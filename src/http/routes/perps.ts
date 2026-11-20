import { Router } from 'express';
import { available } from '../../ledger/balances.js';
import {
  history, historySeries, liqPrice, marks, markOf, open, positions, close, MAX_STAKE, MIN_STAKE, MARKETS,
} from '../../perp.js';

export const perps = Router();

perps.get('/markets', async (_req, res) => {
  try {
    const all = await marks();
    const byId: Record<string, string> = {};
    for (const [k, v] of Object.entries(MARKETS)) byId[v.id] = k;
    res.json({ markets: Object.entries(all).map(([id, m]) => ({ id: byId[id] ?? id, usd: m.usd, chg: m.chg })) });
  } catch {
    res.status(502).json({ error: 'no_prices' });
  }
});

perps.get('/history', async (req, res) => {
  const m = String(req.query.market ?? '');
  if (!MARKETS[m]) { res.status(400).json({ error: 'bad_market' }); return; }
  const d = Number(req.query.days ?? 1);
  res.json({ points: await historySeries(m, [0, 1, 7, 30, 90].includes(d) ? d : 0) });
});

perps.get('/state', async (req, res) => {
  res.json({
    available: (await available(req.userId!)).toString(),
    min: MIN_STAKE.toString(),
    max: MAX_STAKE.toString(),
    positions: await positions(req.userId!),
    history: await history(req.userId!),
  });
});

perps.get('/quote', async (req, res) => {
  const market = String(req.query.market ?? '');
  const side = req.query.side === 'short' ? 'short' : 'long';
  const lev = Math.round(Number(req.query.leverage ?? 500));
  if (!MARKETS[market]) { res.status(400).json({ error: 'bad_market' }); return; }
  if (!Number.isFinite(lev) || lev < 500 || lev > 1000) { res.status(400).json({ error: 'bad_leverage' }); return; }
  try {
    const entry = await markOf(market);
    res.json({ entry, liq: liqPrice(entry, side, lev), leverage: lev });
  } catch {
    res.status(502).json({ error: 'no_price' });
  }
});

perps.post('/open', async (req, res) => {
  const b = req.body as { market?: string; side?: string; stake?: string; leverage?: number };
  const stake = BigInt(Math.round(Number(b.stake ?? 0)));
  const side = b.side === 'short' ? 'short' : 'long';
  const lev = Math.round(Number(b.leverage ?? 500));

  const r = await open(req.userId!, String(b.market ?? ''), side, stake, lev);
  if (!r.ok) {
    const msg: Record<string, string> = {
      below_min: 'Minimum stake is $1.',
      above_max: 'Maximum stake is $10.',
      insufficient: 'Not enough available balance.',
      bad_leverage: 'Leverage must be 500x-1000x.',
      unknown_market: 'Unknown market.',
    };
    res.status(400).json({ error: r.error, message: msg[r.error] ?? 'Could not open.' });
    return;
  }
  res.json({ id: r.id });
});

perps.post('/close', async (req, res) => {
  const r = await close(req.userId!, String((req.body as { id?: string }).id ?? ''));
  if (!r.ok) { res.status(400).json({ error: r.error }); return; }
  res.json({ pnl: r.pnl.toString() });
});