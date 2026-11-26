const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
(async () => {
  const dir = join(process.cwd(), 'migrations');
  const files = readdirSync(dir).sort();
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("delete from _migrations where name = 'zz_probe'");
  for (const f of files) {
    await c.query('insert into _migrations (name) values ($1) on conflict do nothing', [f]);
  }
  console.log('recorded', (await c.query('select count(*)::int n from _migrations')).rows[0].n);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
