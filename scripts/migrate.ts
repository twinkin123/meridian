import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, close } from '../src/db.js';

const dir = join(process.cwd(), 'migrations');

async function main() {
  const c = await pool.connect();
  try {
    await c.query(
      `create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`,
    );
    const done = new Set(
      (await c.query('select name from _migrations')).rows.map((r: any) => r.name),
    );

    for (const f of (await readdir(dir)).sort()) {
      if (done.has(f)) { console.log(`skip ${f}`); continue; }
      console.log(`apply ${f}`);
      await c.query('begin');
      try {
        const sql = (await readFile(join(dir, f), 'utf8')).replace(/^\uFEFF/, '');
        await c.query(sql);
        await c.query('insert into _migrations (name) values ($1)', [f]);
        await c.query('commit');
      } catch (e) {
        await c.query('rollback');
        throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    c.release();
  }
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });