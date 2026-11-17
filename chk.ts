import { pool } from "./src/db.js";
const a = await pool.query("select (now() at time zone 'utc')::date as utc_today, current_date as cur, now() as n, current_setting('TimeZone') as tz");
console.log(a.rows[0]);
const b = await pool.query("select day::text as day, rate_bp, posted from credit_runs order by day desc limit 6");
console.log(b.rows);
await pool.end();
