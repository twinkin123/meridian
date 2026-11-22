import { Router } from 'express';
import QRCode from 'qrcode';
import { none, one, pool } from '../../db.js';
import { env } from '../../env.js';
import { requireUser } from '../mw/session.js';

const BASE = 'https://api.changenow.io/v2';

type Cur = {
  ticker: string; name: string; image: string | null; network: string;
  isExtraIdSupported: boolean; isFiat: boolean; featured: boolean;
  isStable: boolean; buy: boolean; sell: boolean;
};

type Est = {
  fromAmount: number; toAmount: number; withdrawalFee: number;
  transactionSpeedForecast: string | null; warningMessage: string | null;
};

class CnErr extends Error {
  constructor(public code: string, msg: string, public status = 400) { super(msg); }
}

const B = { n: 25, max: 25, rate: 25 / 1000, at: Date.now() };

async function throttle() {
  for (;;) {
    const now = Date.now();
    B.n = Math.min(B.max, B.n + (now - B.at) * B.rate);
    B.at = now;
    if (B.n >= 1) { B.n -= 1; return; }
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function call<T>(
  path: string,
  o: { method?: 'GET' | 'POST'; q?: Record<string, unknown>; body?: unknown; ip?: string } = {},
): Promise<T> {
  if (!env.changenowApiKey) throw new CnErr('no_key', 'CHANGENOW_API_KEY is not set', 500);
  await throttle();

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(o.q ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const h: Record<string, string> = {
    'x-changenow-api-key': env.changenowApiKey,
    accept: 'application/json',
  };
  if (o.body) h['content-type'] = 'application/json';
  if (o.ip) h['x-forwarded-for'] = o.ip;

  const r = await fetch(url, {
    method: o.method ?? 'GET',
    headers: h,
    body: o.body ? JSON.stringify(o.body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  let j: unknown = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* non-json */ }

  if (!r.ok) {
    const e = j as { error?: string; message?: string } | null;
    throw new CnErr(e?.error ?? 'changenow_error', e?.message ?? `changenow ${r.status}`, r.status >= 500 ? 502 : 400);
  }
  return j as T;
}

let cache: { at: number; list: Cur[] } | null = null;
let busy: Promise<Cur[]> | null = null;

async function all(): Promise<Cur[]> {
  if (cache && Date.now() - cache.at < 300_000) return cache.list;
  if (busy) return busy;
  busy = (async () => {
    const raw = await call<Cur[]>('/exchange/currencies', { q: { active: 'true', flow: 'standard' } });
    const list = raw.filter((c) => !c.isFiat && (c.buy || c.sell));
    cache = { at: Date.now(), list };
    return list;
  })().finally(() => { busy = null; });
  return busy;
}

async function pick(ticker: string, network: string): Promise<Cur> {
  const c = (await all()).find((x) => x.ticker === ticker && x.network === network);
  if (!c) throw new CnErr('unsupported', `${ticker} on ${network} is not tradable`);
  return c;
}

export const swap = Router();

swap.get('/currencies', async (req, res) => {
  const dir = req.query.direction === 'to' ? 'to' : 'from';
  const q = String(req.query.q ?? '').trim().toLowerCase();

  try {
  const list = (await all())
    .filter((c) => (dir === 'from' ? c.buy : c.sell))
    .filter((c) => !q || c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.network.toLowerCase().includes(q))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.isStable) - Number(a.isStable) || a.name.localeCompare(b.name))
    .slice(0, 150)
    .map((c) => ({
      t: c.ticker, n: c.name, net: c.network, x: c.isExtraIdSupported,
      i: c.image || '',
    }));

  res.set('Cache-Control', 'private, max-age=60');
  res.json({ currencies: list });
  } catch {
    res.json({ currencies: [] });
  }
});

const icons = new Map<string, { at: number; type: string; body: Buffer }>();

swap.get('/icon/:ticker/:network', async (req, res) => {
  const key = `${req.params.ticker}:${req.params.network}`;
  const hit = icons.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) {
    res.set('Cache-Control', 'public, max-age=86400').type(hit.type).send(hit.body);
    return;
  }
  try {
    const c = await pick(String(req.params.ticker), String(req.params.network));
    if (!c.image) { res.status(404).end(); return; }
    const r = await fetch(c.image);
    if (!r.ok) { res.status(404).end(); return; }
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') ?? 'image/png';
    icons.set(key, { at: Date.now(), type, body });
    res.set('Cache-Control', 'public, max-age=86400').type(type).send(body);
  } catch {
    res.status(404).end();
  }
});

swap.post('/quote', async (req, res) => {
  const b = req.body as { from?: string; fromNet?: string; to?: string; toNet?: string; amount?: string };
  if (!b?.from || !b.fromNet || !b.to || !b.toNet || !b.amount) {
    res.status(400).json({ error: 'missing_params' });
    return;
  }
  if (b.from === b.to && b.fromNet === b.toNet) {
    res.status(400).json({ error: 'same_asset', message: 'Pick two different assets.' });
    return;
  }
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'bad_amount', message: 'Enter an amount.' });
    return;
  }

  try {
    const from = await pick(b.from, b.fromNet);
    const to = await pick(b.to, b.toNet);

    const r = await call<{ minAmount: number; maxAmount: number | null }>('/exchange/range', {
      q: { fromCurrency: from.ticker, fromNetwork: from.network, toCurrency: to.ticker, toNetwork: to.network, flow: 'standard' },
    });

    if (amount < r.minAmount) {
      res.status(400).json({
        error: 'out_of_range',
        message: `Minimum is ${r.minAmount} ${from.ticker.toUpperCase()}.`,
        minAmount: r.minAmount,
      });
      return;
    }

    const e = await call<Est>('/exchange/estimated-amount', {
      q: {
        fromCurrency: from.ticker, fromNetwork: from.network,
        toCurrency: to.ticker, toNetwork: to.network,
        fromAmount: String(amount), flow: 'standard', type: 'direct',
      },
    });

    res.json({
      fromAmount: e.fromAmount,
      toAmount: e.toAmount,
      rate: e.fromAmount > 0 ? e.toAmount / e.fromAmount : 0,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
      speed: e.transactionSpeedForecast,
      warning: e.warningMessage,
    });
  } catch (err) {
    const e = err as CnErr;
    res.status(e.status ?? 400).json({ error: e.code ?? 'quote_failed', message: e.message });
  }
});

swap.post('/orders', requireUser, async (req, res) => {
  const b = req.body as {
    from?: string; fromNet?: string; to?: string; toNet?: string;
    amount?: string; address?: string; memo?: string; refund?: string;
  };
  if (!b?.from || !b.fromNet || !b.to || !b.toNet || !b.amount || !b.address) {
    res.status(400).json({ error: 'missing_params' });
    return;
  }

  try {
    const from = await pick(b.from, b.fromNet);
    const to = await pick(b.to, b.toNet);

    if (to.isExtraIdSupported && !b.memo?.trim()) {
      res.status(400).json({ error: 'missing_memo', message: `${to.ticker.toUpperCase()} needs a memo or tag.` });
      return;
    }

    const address = b.address.trim();
    try {
      const v = await call<{ isValid: boolean }>('/validate/address', {
        q: { currency: to.ticker, network: to.network, address },
      });
      if (!v.isValid) {
        res.status(400).json({ error: 'bad_address', message: 'That address is not valid for the selected network.' });
        return;
      }
    } catch { /* create validates again */ }

    const o = await call<{
      id: string; payinAddress: string; payoutAddress: string;
      fromAmount: number; toAmount: number; status: string;
    }>('/exchange', {
      method: 'POST',
      ip: req.ip,
      body: {
        fromCurrency: from.ticker, fromNetwork: from.network,
        toCurrency: to.ticker, toNetwork: to.network,
        fromAmount: String(b.amount), address,
        extraId: b.memo?.trim() || undefined,
        refundAddress: b.refund?.trim() || undefined,
        flow: 'standard', type: 'direct',
      },
    });

    await none(
      `insert into changenow_orders
         (user_id, wallet_id, changenow_id, from_currency, from_network, to_currency, to_network,
          from_amount, to_amount, payout_address, payout_extra_id, refund_address, payin_address,
          status, changenow_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'awaiting_deposit',$14)`,
      [
        req.userId, req.sessionId ?? '', o.id, from.ticker, from.network, to.ticker, to.network,
        o.fromAmount, o.toAmount, o.payoutAddress, b.memo?.trim() || null,
        b.refund?.trim() || null, o.payinAddress, o.status,
      ],
    );

    const qr = await QRCode.toDataURL(o.payinAddress, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } });

    res.json({
      id: o.id, payinAddress: o.payinAddress, qr,
      fromAmount: o.fromAmount, toAmount: o.toAmount,
      fromSym: from.ticker, fromNet: from.network,
      toSym: to.ticker, toNet: to.network,
      status: 'awaiting_deposit',
    });
  } catch (err) {
    const e = err as CnErr;
    res.status(e.status ?? 400).json({ error: e.code ?? 'create_failed', message: e.message });
  }
});

const MAP: Record<string, string> = {
  new: 'awaiting_deposit', waiting: 'awaiting_deposit', confirming: 'confirming',
  exchanging: 'exchanging', sending: 'sending', finished: 'done',
  failed: 'failed', refunded: 'refunded', verifying: 'verifying',
};

swap.get('/orders/:id', requireUser, async (req, res) => {
  const row = await one<{ changenow_id: string; status: string; to_amount: string; to_currency: string }>(
    `select changenow_id, status, to_amount, to_currency
       from changenow_orders where changenow_id = $1 and user_id = $2`,
    [req.params.id, req.userId],
  );
  if (!row) { res.status(404).json({ error: 'not_found' }); return; }

  let status = row.status;
  if (!['done', 'failed', 'refunded'].includes(row.status)) {
    try {
      const live = await call<{ status: string }>('/exchange/by-id', { q: { id: row.changenow_id } });
      status = MAP[live.status] ?? row.status;
      const end = ['done', 'failed', 'refunded'].includes(status);
      await none(
        `update changenow_orders
            set status = $2, changenow_status = $3, updated_at = now(),
                finished_at = case when $4 then now() else finished_at end
          where changenow_id = $1`,
        [row.changenow_id, status, live.status, end],
      );
    } catch { /* keep stored */ }
  }

  res.json({ status, toAmount: row.to_amount, toCurrency: row.to_currency });
});

swap.get('/orders', requireUser, async (req, res) => {
  const { rows } = await pool.query(
    `select changenow_id as id, from_currency, from_network, to_currency, to_network,
            from_amount, to_amount, status, created_at
       from changenow_orders where user_id = $1 order by created_at desc limit 25`,
    [req.userId],
  );
  res.json({ orders: rows });
});