import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, close } from '../src/db.js';

const dir = join(process.cwd(), 'migrations');

async function main() {
  await pool.query(
    `create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  const done = new Set(
    (await pool.query('select name from _migrations')).rows.map((r) => r.name),
  );

  for (const f of (await readdir(dir)).sort()) {
    if (done.has(f)) { console.log(`skip ${f}`); continue; }
    console.log(`apply ${f}`);
    await pool.query('begin');
    await pool.query(await readFile(join(dir, f), 'utf8'));
    await pool.query('insert into _migrations (name) values ($1)', [f]);
    await pool.query('commit');
  }
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
