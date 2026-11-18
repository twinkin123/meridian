import 'dotenv/config';
import { pool } from '../src/db.js';
import { env } from '../src/env.js';

const BASE = 'https://api.helius.xyz/v0/webhooks';
const URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN ?? 'meridian-production-fbf25a20.up.railway.app'}/webhooks/helius`;

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}?api-key=${env.heliusApiKey}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const { rows } = await pool.query<{ a: string }>(
  'select distinct privy_address a from users where privy_address is not null',
);
const want = rows.map((r) => r.a);
console.log('db addresses', want.length);

const hooks: any[] = (await call('GET', '')) ?? [];
const hook = hooks.find((h) => String(h.webhookURL || '').includes('/webhooks/helius'));

if (!hook) {
  console.log('none found, creating');
  const made = await call('POST', '', {
    webhookURL: URL,
    transactionTypes: ['ANY'],
    accountAddresses: want,
    webhookType: 'raw',
    authHeader: env.webhookSecret,
  });
  console.log('created', made.webhookID, 'with', want.length);
} else {
  const have: string[] = hook.accountAddresses || [];
  const merged = [...new Set([...have, ...want])];
  console.log('existing', have.length, 'merged', merged.length);
  await call('PUT', `/${hook.webhookID}`, {
    webhookURL: URL,
    transactionTypes: ['ANY'],
    accountAddresses: merged,
    webhookType: 'raw',
    authHeader: env.webhookSecret,
  });
  console.log('patched', hook.webhookID);
}

await pool.end();