import { pool, close } from '../dist/src/db.js';
const q = await pool.query(`select u.referred_by, count(*) c, coalesce(sum(d.usd_at_det),0)::text s from users u join deposits d on d.user_id = u.id where u.referred_by is not null and d.status = 'credited' and d.created_at >= '2026-10-01' and d.created_at < '2026-11-01' group by u.referred_by`);
console.log(JSON.stringify(q.rows));
const r = await pool.query(`select * from referral_runs`);
console.log('runs', JSON.stringify(r.rows));
await close();