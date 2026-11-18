import 'dotenv/config';
import { pool } from './src/db.js';
const r = await pool.query(
  `select family, symbol, chain from deposit_routes
    where viable and (family = 'sol' or chain = any($1::text[]))
    order by family, symbol`,
  [['base','ethereum','polygon','arbitrum','optimism','tron','bsc','robinhood']],
);
console.table(r.rows);
await pool.end();
