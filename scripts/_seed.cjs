const { Client } = require('pg');
const rows = [['1000','asset'],['1010','asset'],['1020','asset'],['2000','liability'],['2010','liability'],['2020','liability'],['2030','liability'],['2040','liability'],['2050','liability'],['2060','liability'],['2070','liability'],['2080','liability'],['2100','liability'],['3000','equity'],['4000','revenue'],['5000','expense'],['5010','expense'],['5020','expense']];
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const [code, kind] of rows) await c.query("insert into accounts (code, kind, owner_type) values ($1, $2, 'platform')", [code, kind]);
  console.log('seeded', rows.length);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
