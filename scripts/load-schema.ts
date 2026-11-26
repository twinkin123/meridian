/*
 Test database bootstrap. Never point this at production — ledger.test.ts
 truncates postings and transactions.

   1. create the DB from template0 (template1 here carries a stale schema copy)
   2. set TEST_DATABASE_URL to it and NODE_ENV=test
   3. npx tsx scripts/load-schema.ts
   4. node scripts/_seed.cjs   (chart of accounts; a schema-only dump carries no rows)
   5. set MASTER_MNEMONIC to any valid phrase, then npm test
*/
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, close } from '../src/db.js';

async function main() {
  const dir = join(process.cwd(), 'migrations');
  const c = await pool.connect();
  try {
    const raw = await readFile(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    const schema = raw
      .replace(/^\uFEFF/, '')
      .replace(/SELECT pg_catalog\.set_config\('search_path', '', false\);/g, 'SET search_path = public;');
    await c.query(schema);
    await c.query('set search_path = public');
    await c.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
    const files = (await readdir(dir)).sort();
    for (const f of files) {
      if (f.slice(0, 4) > '0051') continue;
      await c.query('insert into _migrations (name) values ($1) on conflict do nothing', [f]);
    }
    for (const f of files) {
      if (f.slice(0, 4) <= '0051') continue;
      console.log('apply ' + f);
      const sql = (await readFile(join(dir, f), 'utf8')).replace(/^\uFEFF/, '');
      await c.query('begin');
      try {
        await c.query(sql);
        await c.query('insert into _migrations (name) values ($1)', [f]);
        await c.query('commit');
      } catch (e) {
        await c.query('rollback');
        throw new Error(f + ': ' + (e instanceof Error ? e.message : e));
      }
    }
    console.log('done');
  } finally { c.release(); }
  await close();
}
main().catch((e) => { console.error(e); process.exit(1); });
