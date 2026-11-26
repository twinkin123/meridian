// Registers every existing sol deposit address with the Helius webhook.
// Run: $env:DATABASE_URL=...; npx tsx scripts/helius-backfill.ts
import { Client } from 'pg';
import { addAddress } from '../src/helius.js';

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  "select distinct address from deposit_addresses where family = 'sol' order by address",
);
console.log('addresses found:', rows.length);
let ok = 0;
for (const r of rows) {
  try {
    await addAddress(r.address);
    ok++;
  } catch (e) {
    console.error('failed', r.address, e instanceof Error ? e.message : e);
  }
}
await c.end();
console.log('registered:', ok, 'of', rows.length);