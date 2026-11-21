import { one, tx } from './db.js';
import { available } from './ledger/balances.js';
import { post, type Leg } from './ledger/post.js';

export const MARKETS: Record<string, { id: string; name: string }> = {
  sol: { id: 'solana', name: 'Solana' },
  btc: { id: 'bitcoin', name: 'Bitcoin' },
  eth: { id: 'ethereum', name: 'Ethereum' },
};

export const MIN_STAKE = 1_000_000n;
export const MAX_STAKE = 10_000_000n;

/** Fee per side, as a divisor of stake: 10%, i.e. 2bp of notional at 500x and 1bp at 1000x. */
export const FEE_DIV = 10n;

type Mark = { usd: number; chg: number };

let cache: { at: number; data: Record<string, Mark> } | null = null;
let busy: Promise<Record<string, Mark>> | null = null;

const HIST: Record<string, { t: number; usd: number }[]> = {};
const MAXH = 180;

function record(data: Record<string, Mark>): void {
  for (const [mkt, def] of Object.entries(MARKETS)) {
    const m = data[def.id];
    if (!m) continue;
    const arr = (HIST[mkt] ??= []);
    arr.push({ t: Date.now(), usd: m.usd });
    if (arr.length > MAXH) arr.shift();
  }
}

export function series(market: string): { t: number; usd: number }[] {
  return HIST[market] ?? [];
}
const PAIRS: Record<string, string> = { sol: 'SOLUSDT', btc: 'BTCUSDT', eth: 'ETHUSDT' };

async function loadBinance(): Promise<Record<string, Mark>> {
  const syms = encodeURIComponent(JSON.stringify(Object.values(PAIRS)));
  const r = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + syms, {
    headers: { accept: 'application/json' },
  });
  if (!r.ok) throw new Error('binance ' + r.status);
  const rows = (await r.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
  const out: Record<string, Mark> = {};
  for (const [k, sym] of Object.entries(PAIRS)) {
    const row = rows.find((x) => x.symbol === sym);
    if (!row) continue;
    out[MARKETS[k].id] = { usd: Number(row.lastPrice), chg: Number(row.priceChangePercent) };
  }
  if (!Object.keys(out).length) throw new Error('binance empty');
  return out;
}

async function loadGecko(): Promise<Record<string, Mark>> {
  const ids = Object.values(MARKETS).map((m) => m.id).join(',');
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { headers: { accept: 'application/json' } },
  );
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
  const out: Record<string, Mark> = {};
  for (const [k, v] of Object.entries(j)) {
    if (typeof v.usd !== 'number') continue;
    out[k] = { usd: v.usd, chg: v.usd_24h_change ?? 0 };
  }
  return out;
}

/** Four-second marks. Short enough that a 1000x position can be watched. */
export async function marks(): Promise<Record<string, Mark>> {
  if (cache && Date.now() - cache.at < 300) return cache.data;
  if (!busy) {
    busy = loadBinance().catch(() => loadGecko())
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => { busy = null; });
  }
  try {
    return await busy;
  } catch (e) {
    if (cache) return cache.data;
    throw e;
  }
}

export async function markOf(market: string): Promise<number> {
  const m = MARKETS[market];
  if (!m) throw new Error('unknown market');
  const all = await marksNow();
  const p = all[m.id];
  if (!p) throw new Error('no price');
  return p.usd;
}

/** Fresh marks, Binance only, no cache read. Throws if the feed is down. */
export async function marksNow(): Promise<Record<string, Mark>> {
  if (!busy) {
    busy = loadBinance()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => { busy = null; });
  }
  return await busy;
}

export async function markOfNow(market: string): Promise<number> {
  const m = MARKETS[market];
  if (!m) throw new Error('unknown market');
  const all = await marksNow();
  const p = all[m.id];
  if (!p) throw new Error('no price');
  return p.usd;
}

export function liqPrice(entry: number, side: 'long' | 'short', lev: number): number {
  const move = 1 / lev;
  return side === 'long' ? entry * (1 - move) : entry * (1 + move);
}

export function pnlOf(p: { side: string; qty: string; entry: string }, mark: number): bigint {
  const qty = Number(p.qty);
  const entry = Number(p.entry);
  const diff = p.side === 'long' ? mark - entry : entry - mark;
  return BigInt(Math.round(diff * qty * 1e6));
}

export type OpenResult = { ok: true; id: string } | { ok: false; error: string };

export async function open(
  userId: string,
  market: string,
  side: 'long' | 'short',
  stake: bigint,
  leverage: number,
): Promise<OpenResult> {
  if (!MARKETS[market]) return { ok: false, error: 'unknown_market' };
  if (stake < MIN_STAKE) return { ok: false, error: 'below_min' };
  if (stake > MAX_STAKE) return { ok: false, error: 'above_max' };
  if (!Number.isFinite(leverage) || leverage < 500 || leverage > 1000) return { ok: false, error: 'bad_leverage' };

  const fee = stake / FEE_DIV;

  const entry = await markOfNow(market);
  const notional = Number(stake) / 1e6 * leverage;
  const qty = notional / entry;
  const liq = liqPrice(entry, side, leverage);

  return tx(async (c) => {
    await c.query('select id from users where id = $1 for update', [userId]);
    await c.query('select ensure_user_accounts($1)', [userId]);

    const bal = await c.query<{ b: string }>(
      `select coalesce(balance,0)::text b from v_balance where user_id = $1 and code = '2000'`,
      [userId],
    );
    if (BigInt(bal.rows[0]?.b ?? '0') < stake + fee) return { ok: false as const, error: 'insufficient' };

    const row = await c.query<{ id: string }>(
      `insert into perp_positions (user_id, market, side, stake, leverage, entry, qty, liq_price)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [userId, market, side, stake.toString(), leverage, entry, qty, liq],
    );
    const id = row.rows[0].id;

    await post(c, 'PerpOpen', id, [
      { code: '2000', owner: userId, amount: stake },
      { code: '2100', amount: -stake },
    ]);
    await post(c, 'PerpFee', id, [
      { code: '2000', owner: userId, amount: fee },
      { code: '2100', amount: -fee },
    ]);

    return { ok: true as const, id };
  });
}

async function settle(
  c: any,
  p: { id: string; user_id: string; stake: string; side: string; qty: string; entry: string; liq_price: string },
  mark: number,
  status: 'closed' | 'liquidated',
): Promise<void> {
  /* A liquidation fills at the liq price, never past it: the mark only decides whether to liquidate, so this needs no side. */
  let exit = mark;
  if (status === 'liquidated') {
    const liq = Number(p.liq_price);
    if (Number.isFinite(liq) && liq > 0) exit = liq;
  }
  let pnl = pnlOf(p, exit);
  const stake = BigInt(p.stake);
  /* A liquidation can gap past zero; the stake is the floor of the loss. */
  if (pnl < -stake) pnl = -stake;
  /* Read the fee actually posted, so a position opened under an older rate still settles at the rate it paid. */
  const feeRow = await c.query(
    `select coalesce(sum(p.amount),0)::text s
       from postings p
       join transactions t on t.id = p.tx_id
       join accounts a on a.id = p.account_id
      where t.kind = 'PerpFee' and t.external_ref = $1 and a.code = '2000'`,
    [p.id],
  );
  const openFee = BigInt(String(feeRow.rows[0]?.s ?? '0'));
  let back = stake + pnl;
  /* Close fee: 10% of stake, capped at the proceeds. A liquidation pays none. */
  if (status === 'closed') {
    const cf = stake / FEE_DIV;
    back -= cf < back ? cf : back;
  }

  await c.query(
    `update perp_positions
        set status = $2, exit_price = $3, pnl = $4, closed_at = now()
      where id = $1`,
    [p.id, status, exit, pnl.toString()],
  );

  /* Release the whole house obligation (stake + fee) and book the result:
     whatever the user does not get back is revenue, anything above is expense. */
  const obligation = stake + openFee;
  const legs: Leg[] = [{ code: '2100', amount: obligation }];
  if (back > 0n) legs.push({ code: '2000', owner: p.user_id, amount: -back });
  const result = obligation - back;
  if (result > 0n) legs.push({ code: '4000', amount: -result });
  else if (result < 0n) legs.push({ code: '5020', amount: -result });
  await post(c, status === 'liquidated' ? 'PerpLiquidated' : 'PerpClose', p.id, legs);
}

export type CloseResult = { ok: true; pnl: bigint } | { ok: false; error: string };

export async function close(userId: string, id: string): Promise<CloseResult> {
  const row = await one<{
    id: string; user_id: string; market: string; stake: string;
    side: string; qty: string; entry: string; liq_price: string; status: string;
  }>(`select id, user_id, market, stake, side, qty, entry, liq_price, status from perp_positions where id = $1 and user_id = $2`, [id, userId]);

  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'open') return { ok: false, error: 'not_open' };

  const mark = await markOf(row.market);

  return tx(async (c) => {
    await c.query('select ensure_user_accounts($1)', [row.user_id]);
    await settle(c, row, mark, 'closed');
    const pnl = pnlOf(row, mark);
    const stake = BigInt(row.stake);
    return { ok: true as const, pnl: pnl < -stake ? -stake : pnl };
  });
}

/** Liquidates every open position whose equity has reached zero. */
export async function tick(): Promise<number> {
  const { rows } = await (await import('./db.js')).pool.query<{
    id: string; user_id: string; market: string; stake: string;
    side: string; qty: string; entry: string; liq_price: string;
  }>(`select id, user_id, market, stake, side, qty, entry, liq_price from perp_positions where status = 'open' limit 500`);

  if (!rows.length) return 0;

  let all: Record<string, Mark>;
  try {
    all = await marksNow();
  } catch {
    return 0;
  }

  let n = 0;
  for (const p of rows) {
    const m = MARKETS[p.market];
    const price = m ? all[m.id]?.usd : undefined;
    if (!price) continue;

    const pnl = pnlOf(p, price);
    if (pnl > -BigInt(p.stake)) continue;

    const did = await tx(async (c) => {
      const lock = await c.query<{ status: string }>(
        'select status from perp_positions where id = $1 for update',
        [p.id],
      );
      if (lock.rows[0]?.status !== 'open') return false;
      await c.query('select ensure_user_accounts($1)', [p.user_id]);
      await settle(c, p, price, 'liquidated');
      return true;
    });

    if (did) n++;
  }
  return n;
}

export type View = {
  id: string; market: string; side: string; stake: string; leverage: number;
  entry: string; mark: string; liq: string; pnl: string; equity: string;
};

export async function positions(userId: string): Promise<View[]> {
  const { rows } = await (await import('./db.js')).pool.query<any>(
    `select id, market, side, stake, leverage, entry, qty, liq_price
       from perp_positions where user_id = $1 and status = 'open' order by opened_at desc`,
    [userId],
  );
  const all = await marksNow().catch(() => ({}) as Record<string, Mark>);

  return rows.map((r) => {
    const price = all[MARKETS[r.market]?.id]?.usd ?? Number(r.entry);
    const pnl = pnlOf(r, price);
    const stake = BigInt(r.stake);
    return {
      id: r.id,
      market: r.market,
      side: r.side,
      stake: r.stake,
      leverage: r.leverage,
      entry: String(r.entry),
      mark: price.toFixed(price < 1 ? 6 : 2),
      liq: String(r.liq_price),
      pnl: pnl.toString(),
      equity: (stake + pnl).toString(),
    };
  });
}

export async function history(userId: string): Promise<any[]> {
  const { rows } = await (await import('./db.js')).pool.query(
    `select id, market, side, stake, leverage, entry, exit_price, pnl, status, closed_at
       from perp_positions where user_id = $1 and status <> 'open'
      order by closed_at desc limit 25`,
    [userId],
  );
  return rows;
}

export { available };
const HCACHE: Record<string, { at: number; pts: { t: number; usd: number }[] }> = {};

/** 24h of 5-minute closes, so the chart has a past the moment it opens. */
export async function historySeries(market: string, days = 1): Promise<{ t: number; usd: number }[]> {
  const def = MARKETS[market];
  if (!def) return [];
  const key = market + ':' + days;
  try {
    const hit = HCACHE[key];
    if (hit && Date.now() - hit.at < 5000) return hit.pts;
    const bi = days === 0 ? '1s' : days === 1 ? '1m' : days <= 7 ? '15m' : days <= 30 ? '1h' : '4h';
    const b = await fetch(
      'https://data-api.binance.vision/api/v3/klines?symbol=' + PAIRS[market] + '&interval=' + bi + '&limit=' + (bi === '1s' ? 1000 : 500),
      { headers: { accept: 'application/json' } },
    );
    if (b.ok) {
      const rows = (await b.json()) as [number, string, string, string, string][];
      const pts = rows.map((r) => ({ t: Math.floor(r[0] / 1000), usd: Number(r[4]) }));
      HCACHE[key] = { at: Date.now(), pts };
      return pts;
    }
  } catch { /* fall through */ }

  const hit = HCACHE[key];
  if (hit && Date.now() - hit.at < 300_000) return hit.pts;
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${def.id}/market_chart?vs_currency=usd&days=${days}`,
    { headers: { accept: 'application/json' } },
  );
  if (!r.ok) return hit?.pts ?? [];
  const j = (await r.json()) as { prices?: [number, number][] };
  const pts = (j.prices ?? []).map(([ms, usd]) => ({ t: Math.floor(ms / 1000), usd }));
  HCACHE[key] = { at: Date.now(), pts };
  return pts;
}