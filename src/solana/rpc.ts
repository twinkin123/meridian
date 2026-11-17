import { env } from '../env.js';

// One shared serialized queue: poll, recon and sweeps all go through it, so they
// cannot burst past the provider rate limit at the same instant.
const MIN_GAP_MS = 220;
let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

async function call(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await throttled(() =>
      fetch(env.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    );

    const text = await r.text();

    // Helius answers 429 with a plain-text body, which is not JSON.
    if (r.status === 429 || text.trimStart().startsWith('Too Many Requests')) {
      lastErr = new Error(`rpc ${method}: 429`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (!r.ok) {
      lastErr = new Error(`rpc ${method}: ${r.status} ${text.slice(0, 120)}`);
      await sleep(300 * 2 ** attempt);
      continue;
    }
    try {
      const j: any = JSON.parse(text);
      if (j?.error) {
        lastErr = new Error(`rpc ${method}: ${j.error?.message ?? 'error'}`);
        await sleep(300 * 2 ** attempt);
        continue;
      }
      return j?.result ?? null;
    } catch {
      lastErr = new Error(`rpc ${method}: unparseable body`);
      await sleep(300 * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error(`rpc ${method}: failed`);
}

export async function getTx(sig: string): Promise<any | null> {
  return call('getTransaction', [
    sig,
    { commitment: 'finalized', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
  ]);
}

export async function getSigs(address: string, limit = 5): Promise<string[]> {
  const r = await call('getSignaturesForAddress', [address, { limit }]);
  return (r ?? []).map((x: any) => x.signature).filter(Boolean);
}