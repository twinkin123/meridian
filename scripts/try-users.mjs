import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const where = `where ($1 = '' or u.email ilike '%' || $1 || '%' or u.deposit_addr = $1 or u.referral_code = upper($1) or u.id::text = $1)`;
const base = `from users u
 left join (select user_id,
   coalesce(sum(balance) filter (where code = '2000'), 0) available,
   coalesce(sum(balance) filter (where code = '2050'), 0) reserve
   from v_balance group by user_id) b on b.user_id = u.id
 left join (select user_id, count(*)::int dep_n from deposits group by user_id) d on d.user_id = u.id
 left join (select user_id, count(*)::int wd_n from withdrawals group by user_id) w on w.user_id = u.id
 ${where}`;
const r = await c.query(`select u.id, u.email, u.frozen_at, u.is_admin,
   coalesce(b.available, 0) available, coalesce(b.reserve, 0) reserve,
   coalesce(d.dep_n, 0) dep_n, coalesce(w.wd_n, 0) wd_n,
   (select count(*)::int from sessions s where s.user_id = u.id) live_sessions
   ${base} order by u.created_at desc nulls last limit 3`, ['']);
const t = await c.query(`select count(*)::text n, coalesce(sum(coalesce(b.available,0)),0)::text available ${base}`, ['']);
console.log(JSON.stringify(r.rows, null, 2));
console.log(JSON.stringify(t.rows[0]));
await c.end();
