import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(
  `select post('DepositCredited','manual-test',
     json_build_array(
       json_build_object('code','1000','owner',null,'amount','25000000'),
       json_build_object('code','2000','owner',(select id from users order by created_at desc limit 1),'amount','-25000000')
     )::jsonb) id`,
  
);

console.log('posted', r.rows[0].id);
await c.end();


