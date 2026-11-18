import 'dotenv/config';

const BASE = 'https://api.helius.xyz/v0/webhooks';
const URL = 'https://meridian-production-fbf25a20.up.railway.app/webhooks/helius';
const SQL = 'https://meridian-production-fbf25a20.up.railway.app/admin/sql';
const PER_HOOK = 25;

const SQL_TOKEN = process.env.SQL_TOKEN ?? 'a29c4f945ae42ea2d3dbce08a56e909c4893777a30133b8b69c35575702214ec';
const HELIUS = process.env.HELIUS_API_KEY ?? 'b3bc1d32-c631-48e7-ad2a-22329846ddc6';
const SECRET = process.env.WEBHOOK_SECRET ?? '4d7660f00384333878b391b02ff0902178ccb76422d2c35478d245e2c6afbf8b';

type Hook = { webhookID: string; webhookURL?: string; accountAddresses?: string[] };

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T | null> {
  const r = await fetch(`${BASE}${path}?api-key=${HELIUS}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : null;
}

async function addresses(): Promise<string[]> {
  const q = encodeURIComponent(
    'select distinct privy_address a from users where privy_address is not null order by a',
  );
  const r = await fetch(`${SQL}?token=${SQL_TOKEN}&q=${q}`);
  const j: any = await r.json();
  if (!Array.isArray(j.rows)) throw new Error(`sql: ${JSON.stringify(j).slice(0, 200)}`);
  return j.rows.map((x: any) => x.a);
}

function payload(accountAddresses: string[]) {
  return {
    webhookURL: URL,
    transactionTypes: ['ANY'],
    accountAddresses,
    webhookType: 'raw',
    authHeader: SECRET,
  };
}

function ours(hooks: Hook[]): Hook[] {
  return hooks.filter((h) => String(h.webhookURL ?? '').includes('/webhooks/helius'));
}

async function main(): Promise<void> {
  const want = await addresses();

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});