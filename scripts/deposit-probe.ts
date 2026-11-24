import 'dotenv/config';
import { pool } from '../src/db.js';
import { createCryptoDepositAccount } from '../src/privy.js';
import { sponsoredSources } from '../src/deposit-routes.js';

const email = process.argv[2];
if (!email) { console.error('usage: tsx scripts/deposit-probe.ts <email>'); process.exit(1); }

const u = await pool.query('select id, privy_wallet_id from users where lower(email) = lower($1)', [email]);
const row = u.rows[0];
if (!row) { console.error('no such user'); process.exit(1); }
console.log('user', row.id, 'wallet', row.privy_wallet_id);

const sources = await sponsoredSources();
console.log('sources', sources.length, JSON.stringify(sources.slice(0, 3)));

try {
  const out = await createCryptoDepositAccount(row.privy_wallet_id, sources);
  console.log('OK', JSON.stringify(out));
} catch (e: any) {
  console.log('FAIL status=', e?.status, 'code=', e?.code);
  console.log('message=', e?.message);
  console.log('body=', JSON.stringify(e?.body ?? e?.response ?? e?.error ?? null));
}
await pool.end();