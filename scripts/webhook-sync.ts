import 'dotenv/config';
import { pool } from '../src/db.js';
import { env } from '../env.js';

const BASE = 'https://api.helius.xyz/v0/webhooks';
const URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN ?? 'meridian-production-fbf25a20.up.railway.app'}/webhooks/helius`;
const PER_HOOK = 25;

type Hook = { webhookID: string; webhookURL?: string; accountAddresses?: string[] };

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T | null> {
  const r = await fetch(`${BASE}${path}?api-key=${env.heliusApiKey}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : null;
}

function payload(accountAddresses: string[]) {
  return {
    webhookURL: URL,
    transactionTypes: ['ANY'],
    accountAddresses,
    webhookType: 'raw',
    authHeader: env.webhookSecret,
  };
}

function ours(hooks: Hook[]): Hook[] {
  return hooks.filter((h) => String(h.webhookURL ?? '').includes('/webhooks/helius'));
}

async function main(): Promise<void> {
  const { rows } = await pool.query<{ a: string }>(
    'select distinct privy_address a from users where privy_address is not null order by a',
  );
  const want = rows.map((r) => r.a);

  const chunks: string[][] = [];
  for (let i = 0; i < want.length; i += PER_HOOK) chunks.push(want.slice(i, i + PER_HOOK));

  console.log(`addresses ${want.length}, shards ${chunks.length}`);

  const hooks = ours((await call<Hook[]>('GET', '')) ?? []);
  console.log(`existing shards ${hooks.length}`);

  while (hooks.length < chunks.length) {
    const made = await call<Hook>('POST', '', payload([]));
    if (!made?.webhookID) throw new Error('create returned no webhookID');
    console.log('created', made.webhookID);
    hooks.push(made);
  }

  while (hooks.length > chunks.length) {
    const extra = hooks.pop()!;
    await call('DELETE', `/${extra.webhookID}`);
    console.log('deleted', extra.webhookID);
  }

  for (let i = 0; i < chunks.length; i++) {
    const id = hooks[i].webhookID;
    await call('PUT', `/${id}`, payload(chunks[i]));
    console.log(`patched ${id} with ${chunks[i].length}`);
  }

  const live = ours((await call<Hook[]>('GET', '')) ?? []);
  if (live.length !== chunks.length) throw new Error(`expected ${chunks.length} shards, found ${live.length}`);

  let covered = 0;
  for (const h of live) {
    const d = await call<Hook>('GET', `/${h.webhookID}`);
    covered += (d?.accountAddresses ?? []).length;
  }
  console.log(`verify: ${live.length} shards, ${covered} addresses`);
  if (covered !== want.length) throw new Error(`expected ${want.length} covered, found ${covered}`);
}

try {
  await main();
} finally {
  await pool.end();
}