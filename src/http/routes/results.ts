import { Router } from 'express';
import { pool, one } from '../../db.js';
import { ensureDay, utcToday } from '../../trades.js';

export const results = Router();

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 120;

results.get('/', async (req, res) => {
  const today = utcToday();

  const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  const before = typeof req.query.before === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.before)
    ? req.query.before
    : null;

  const start = (await one<{ d: string }>(
    `select coalesce((select min(day) from credit_runs), (now() at time zone 'utc')::date)::text d`,
  ))!.d;

  await ensureDay(today);

  const page = await pool.query<{ d: string }>(
    `select g::date::text d
       from generate_series($1::date, $2::date, '1 day') g
      where g::date < coalesce($3::date, $2::date + 1)
      order by g desc
      limit $4`,
    [start, today, before, limit],
  );

  for (const r of page.rows) await ensureDay(r.d);

  const want = page.rows.map((r) => r.d);
  const { rows: days } = want.length
    ? await pool.query(
        `select d.day::text as day, d.rate_bp, d.source,
                coalesce(
                  json_agg(json_build_object(
                    'symbol', r.symbol,
                    'side', r.side,
                    'open', r.open_px,
                    'close', r.close_px,
                    'opened', r.opened_min,
                    'closed', r.closed_min,
                    'ret', r.ret_bp
                  ) order by r.seq) filter (where r.symbol is not null),
                  '[]'::json
                ) as rows
           from trade_days d
           left join trade_results r on r.day = d.day
          where d.day = any($1::date[])
          group by d.day, d.rate_bp, d.source
          order by d.day desc`,
        [want],
      )
    : { rows: [] };

  res.setHeader('Cache-Control', 'no-store');
  res.json({ today, days, hasMore: page.rows.length === limit });
});
