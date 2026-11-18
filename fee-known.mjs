import 'dotenv/config';
import { pool } from './src/db.ts';
import { quoteDeposit } from './src/privy.ts';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r = await pool.query('select asset, chain, rate from deposit_routes where viable and rate > 0');
for (const row of r.rows) {
  const rate = Number(row.rate);
  const units = (50 / rate).toFixed(8);
  let q = await quoteDeposit(row.asset, row.chain, units);
  if (!q) { await sleep(700); q = await quoteDeposit(row.asset, row.chain, units); }
  if (!q) { console.log('miss', row.asset.slice(0, 10), row.chain); await sleep(300); continue; }
  const inUsd = Number(q.input) * rate;
  const out = Number(q.output);
  const fee = inUsd > 0 && out > 0
    ? Math.max(Math.min(((inUsd - out) / inUsd) * 100, 9999.9999), 0)
    : null;
  await pool.query(
    'update deposit_routes set fee_pct = $3, checked_at = now() where asset = $1 and chain = $2',
    [row.asset, row.chain, fee],
  );
  console.log(row.asset.slice(0, 10), row.chain, fee === null ? 'null' : fee.toFixed(4));
  await sleep(300);
}
process.exit(0);
