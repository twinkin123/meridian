import { env } from '../env.js';

export async function getTx(sig: string): Promise<any | null> {
  const r = await fetch(env.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [sig, { commitment: 'finalized', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }],
    }),
  });
  const j: any = await r.json();
  return j?.result ?? null;
}