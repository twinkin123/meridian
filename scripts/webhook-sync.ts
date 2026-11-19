import 'dotenv/config';

const BASE = 'https://api.helius.xyz/v0/webhooks';
const URL = 'https://meridian-production-fbf25a20.up.railway.app/webhooks/helius';
const SQL = 'https://meridian-production-fbf25a20.up.railway.app/admin/sql';

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
    transactionTypes: ['TRANSFER'],
    accountAddresses,
    webhookType: 'enhanced',
    authHeader: SECRET,
  };
}

function ours(hooks: Hook[]): Hook[] {
  return hooks.filter((h) => String(h.webhookURL ?? '').includes('/webhooks/helius'));
}

/** Helius caps addresses per hook, so the pool is spread across several. */
const MAX = Number(process.env.HELIUS_MAX_ADDRESSES ?? '25');

async function main(): Promise<void> {
  const want = await addresses();
  console.log(`addresses ${want.length}`);

  const chunks: string[][] = [];
  for (let i = 0; i < want.length; i += MAX) chunks.push(want.slice(i, i + MAX));
  if (chunks.length === 0) chunks.push([]);
  console.log(`chunks ${chunks.length} of up to ${MAX}`);

  const hooks = ours((await call<Hook[]>('GET', '')) ?? []);
  console.log(`existing hooks ${hooks.length}`);

  for (let i = 0; i < chunks.length; i++) {
    const hook = hooks[i];
    if (hook) {
      await call('PUT', `/${hook.webhookID}`, payload(chunks[i]));
      console.log(`patched ${hook.webhookID} with ${chunks[i].length}`);
    } else {
      const made = (await call<Hook>('POST', '', payload(chunks[i])))!;
      console.log(`created ${made.webhookID} with ${chunks[i].length}`);
    }
  }

  for (const extra of hooks.slice(chunks.length)) {
    await call('DELETE', `/${extra.webhookID}`);
    console.log(`deleted surplus ${extra.webhookID}`);
  }

  const after = ours((await call<Hook[]>('GET', '')) ?? []);
  const total = after.reduce((n, h) => n + (h.accountAddresses?.length ?? 0), 0);
  console.log(`verify: ${after.length} hooks, ${total} addresses`);
  if (after.length !== chunks.length) throw new Error('hook count mismatch');
  if (total !== want.length) throw new Error('address count mismatch');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});