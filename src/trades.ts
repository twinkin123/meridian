import { pool, tx, one } from './db.js';

type Q = { query: (text: string, params?: any[]) => Promise<any> };

const MIN_RATE_BP = 100;
const MAX_RATE_BP = 350;

const COINS: Array<[string, number]> = [['BTC',64900],['ETH',1820],['SOL',71.79],['BNB',612],['XRP',0.951],['DOGE',0.0582],['ADA',0.412],['TRX',0.104],['AVAX',7.01],['LINK',9.14],['DOT',4.12],['MATIC',0.31],['TON',5.42],['SHIB',0.0000118],['LTC',92.4],['BCH',412],['UNI',7.8],['ATOM',4.6],['XLM',0.31],['NEAR',3.12],['APT',5.1],['ARB',0.51],['OP',1.02],['INJ',12.4],['SUI',1.18],['SEI',0.21],['TIA',2.4],['RUNE',1.9],['AAVE',103.8],['MKR',1420],['CRV',0.24],['LDO',0.92],['FET',0.71],['RNDR',4.2],['HYPE',66.3],['JUP',0.2623],['WIF',0.42],['PEPE',0.0000091],['BONK',0.0000172],['ENA',0.31]];

function seed(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dec(v: number): number {
  const d = 3 - Math.floor(Math.log10(Math.abs(v)));
  return Math.max(0, Math.min(8, d));
}

function r4(v: number): number {
  return +v.toFixed(dec(v));
}

type Row = {
  symbol: string;
  side: 'long' | 'short';
  open: number;
  close: number;
  opened: number;
  closed: number;
  ret: number;
};

/* Seeded off the day string, so a day regenerates to identical trades. */
function generate(day: string, rateBp: number): Row[] {
  const r = seed(day);
  const rate = rateBp / 100;
  const n = 4 + Math.floor(r() * 3);

  const bag = COINS.slice();
  const picks: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) picks.push(bag.splice(Math.floor(r() * bag.length), 1)[0]!);

  const raw: number[] = [];
  let rsum = 0;
  for (let i = 0; i < n; i++) {
    raw[i] = +(r() * 1.5 - 0.45).toFixed(3);
    rsum += raw[i]!;
  }
  if (rsum <= 0.05) {
    const bump = (0.4 - rsum) / n;
    for (let i = 0; i < n; i++) raw[i]! += bump;
    rsum = 0.4;
  }

  const k = rate / rsum;
  const actuals: number[] = [];
  const opens: number[] = [];
  const closes: number[] = [];
  const shorts: boolean[] = [];

  for (let i = 0; i < n; i++) {
    actuals[i] = +(raw[i]! * k).toFixed(2);
    opens[i] = r4(picks[i]![1] * (0.997 + r() * 0.006));
    shorts[i] = r() < 0.45;
    closes[i] = r4(shorts[i] ? opens[i]! * (1 - actuals[i]! / 100) : opens[i]! * (1 + actuals[i]! / 100));
  }

  const drift = +(rate - actuals.reduce((a, b) => a + b, 0)).toFixed(2);
  if (drift !== 0) {
    let bi = 0;
    for (let i = 1; i < n; i++) if (Math.abs(actuals[i]!) > Math.abs(actuals[bi]!)) bi = i;
    actuals[bi] = +(actuals[bi]! + drift).toFixed(2);
    closes[bi] = r4(shorts[bi] ? opens[bi]! * (1 - actuals[bi]! / 100) : opens[bi]! * (1 + actuals[bi]! / 100));
  }

  return picks.map((c, i) => {
    const t0 = Math.floor(r() * 1380);
    const t1 = t0 + 10 + Math.floor(r() * 70);
    return {
      symbol: c[0],
      side: shorts[i] ? 'short' : 'long',
      open: opens[i]!,
      close: closes[i]!,
      opened: t0,
      closed: t1,
      ret: actuals[i]!,
    };
  });
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function createDay(day: string, rateBp: number, source: 'recorded' | 'estimated'): Promise<void> {
  const rows = generate(day, rateBp);
  await tx(async (t) => {
    const ins = await t.query(
      `insert into trade_days (day, rate_bp, source) values ($1, $2, $3)
       on conflict (day) do nothing returning day`,
      [day, rateBp, source],
    );
    if (!ins.rowCount) return;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      await t.query(
        `insert into trade_results (day, seq, symbol, side, open_px, close_px, opened_min, closed_min, ret_bp)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [day, i, r.symbol, r.side, r.open, r.close, r.opened, r.closed, Math.round(r.ret * 100)],
      );
    }
  });
}

/* A day opened at the previous rate is rewritten once the real rate exists. */
async function promoteDay(day: string, rateBp: number): Promise<void> {
  const rows = generate(day, rateBp);
  await tx(async (t) => {
    const upd = await t.query(
      `update trade_days set rate_bp = $2, source = 'recorded'
        where day = $1 and source = 'estimated' returning day`,
      [day, rateBp],
    );
    if (!upd.rowCount) return;
    await t.query(`delete from trade_results where day = $1`, [day]);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      await t.query(
        `insert into trade_results (day, seq, symbol, side, open_px, close_px, opened_min, closed_min, ret_bp)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [day, i, r.symbol, r.side, r.open, r.close, r.opened, r.closed, Math.round(r.ret * 100)],
      );
    }
  });
}

/**
 * Guarantees a day exists. A new day opens at 00:00 carrying the previous
 * rate, so the date flips like a calendar, and is rewritten at the real rate
 * once the 00:15 run exists.
 */
export async function ensureDay(day: string): Promise<void> {
  const exists = await one<{ source: string }>(`select source from trade_days where day = $1`, [day]);
  const run = await one<{ rate_bp: number }>(`select rate_bp from credit_runs where day = $1`, [day]);

  if (exists) {
    if (exists.source === 'recorded' || !run) return;
    await promoteDay(day, run.rate_bp);
    return;
  }

  /* No run means no numbers yet. The day still opens at 00:00 so the calendar
     flips like a page, but it carries no rate and no trades until the 00:15 run
     fills it. Nullable rate_bp is what makes that blank gap expressible. */
if (!run) {
    await pool.query(
      `insert into trade_days (day, rate_bp, source) values ($1, null, 'estimated')
       on conflict (day) do nothing`,
      [day],
    );
    return;
  }

  await createDay(day, Math.max(MIN_RATE_BP, Math.min(MAX_RATE_BP, run.rate_bp)), 'recorded');
}

/** Writes a day at the real rate. Safe to call inside the credit transaction. */
export async function recordDay(c: Q, day: string, rateBp: number): Promise<void> {
  const rows = generate(day, rateBp);
  await c.query(
    `insert into trade_days (day, rate_bp, source) values ($1, $2, 'recorded')
     on conflict (day) do update set rate_bp = excluded.rate_bp, source = 'recorded'`,
    [day, rateBp],
  );
  await c.query(`delete from trade_results where day = $1`, [day]);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    await c.query(
      `insert into trade_results (day, seq, symbol, side, open_px, close_px, opened_min, closed_min, ret_bp)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [day, i, r.symbol, r.side, r.open, r.close, r.opened, r.closed, Math.round(r.ret * 100)],
    );
  }
}
export async function ensureToday(): Promise<void> {
  await ensureDay(utcToday());
}

/** Fills every day from the first credit run to today. No-ops on existing days. */
export async function backfillTrades(): Promise<number> {
  const start = await one<{ d: string | null }>(`select min(day)::text d from credit_runs`);
  const { rows } = await pool.query<{ d: string }>(
    `select g::date::text d
       from generate_series($1::date, (now() at time zone 'utc')::date, '1 day') g`,
    [start?.d ?? utcToday()],
  );
  for (const r of rows) await ensureDay(r.d);
  return rows.length;
}
