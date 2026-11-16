import { pool, close } from '../dist/src/db.js';

const ref = await pool.query(`select id from users where referral_code='FC89E49E'`);
const referrer = ref.rows[0]?.id;
if (!referrer) throw new Error('no referrer');

const kid = await pool.query(`select id from users where referred_by=$1 limit 1`, [referrer]);
const userId = kid.rows[0]?.id;
if (!userId) throw new Error('no referred user');

await pool.query(
  `insert into deposits (user_id, sig, asset, qty, usd_at_det, status, created_at)
   values ($1,$2,'USDC',500000000,500000000,'credited', now() - interval '20 days')
   on conflict (sig) do nothing`,
  [userId, 'reftest-' + Date.now()],
);

await pool.query(`delete from referral_runs where period = to_char(now() - interval '20 days','YYYY-MM')`);
console.log('referrer', referrer, 'user', userId);
await close();