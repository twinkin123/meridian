import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';
import { post } from '../dist/src/ledger/post.js';
const email = process.argv[2];
const usd = BigInt(process.argv[3]);
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const u = await p.query('select id from users where email=$1', [email]);
const uid = u.rows[0].id;
const c = await p.connect();
try {
  await c.query('begin');
  const sig = 'seed:' + crypto.randomUUID();
  const d = await c.query(
    `insert into deposits (user_id, sig, asset, qty, usd_at_det, status, unlock_at)
     values ($1,$2,'USDC',$3,$3,'locked', now() - interval '1 minute') returning id`,
    [uid, sig, usd.toString()],
  );
  await c.query('select ensure_user_accounts($1)', [uid]);
  await post(c, 'DepositCredited', sig, [
    { code: '1000', amount: usd },
    { code: '2070', owner: uid, amount: -usd },
  ]);
  await c.query('commit');
  console.log(d.rows[0].id);
} catch (e) { await c.query('rollback'); throw e; } finally { c.release(); await p.end(); }