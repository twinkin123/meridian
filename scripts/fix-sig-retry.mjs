import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/privy.ts';
const T = 'test/retry.test.ts';

let p = readFileSync(P, 'utf8');

if (p.includes('withRetry')) {
  console.log('already patched');
  process.exit(0);
}

const helpers = [
  'const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));',
  '',
  '/** Bounds how many transactions one lookup parses; the transfer is always recent. */',
  'const MAX_PARSE = 10;',
  '',
  '/** RPC reads here are best-effort, and a 429 must not read as "no such transfer". */',
  'export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {',
  '  let last: unknown;',
  '  for (let i = 0; i < attempts; i++) {',
  '    try {',
  '      return await fn();',
  '    } catch (e) {',
  '      last = e;',
  '      if (i < attempts - 1) await sleep(250 * 2 ** i);',
  '    }',
  '  }',
  '  throw last;',
  '}',
  '',
  ''
].join('\n');

const docAnchor = '/**\n * Best-effort on-chain signature for a settled treasury transfer.';
if (p.split(docAnchor).length - 1 !== 1) throw new Error('doc anchor missing');
p = p.replace(docAnchor, helpers + docAnchor);

const oldBlock = [
  '  const c = new Connection(rpc, \'confirmed\');',
  '  const sigs = await c.getSignaturesForAddress(new PublicKey(from), { limit: 25 }).catch(() => []);',
  '',
  '  for (const s of sigs) {',
  '    if (!s.blockTime || s.blockTime * 1000 < sinceMs - 180_000) continue;',
  '    const tx = await c',
  '      .getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: \'confirmed\' })',
  '      .catch(() => null);',
  '    if (!tx?.meta) continue;'
].join('\n');

const newBlock = [
  '  const c = new Connection(rpc, \'confirmed\');',
  '  const sigs = await withRetry(() =>',
  '    c.getSignaturesForAddress(new PublicKey(from), { limit: 25 }),',
  '  ).catch(() => []);',
  '',
  '  let parsed = 0;',
  '  for (const s of sigs) {',
  '    if (parsed >= MAX_PARSE) break;',
  '    if (s.err) continue;',
  '    // A just-sent transfer can come back with a null blockTime; treat it as fresh.',
  '    if (s.blockTime && s.blockTime * 1000 < sinceMs - 180_000) continue;',
  '    parsed++;',
  '    const tx = await withRetry(() =>',
  '      c.getParsedTransaction(s.signature, {',
  '        maxSupportedTransactionVersion: 0,',
  '        commitment: \'confirmed\',',
  '      }),',
  '    ).catch(() => null);',
  '    if (!tx?.meta) continue;'
].join('\n');

const n = p.split(oldBlock).length - 1;
if (n !== 1) throw new Error(`expected 1 lookup block, got ${n}`);
p = p.replace(oldBlock, newBlock);

writeFileSync(P, p);

writeFileSync(T, [
  'import { test } from \'node:test\';',
  'import assert from \'node:assert/strict\';',
  'import { withRetry } from \'../src/privy.js\';',
  '',
  'test(\'retry returns the first success\', async () => {',
  '  let calls = 0;',
  '  const v = await withRetry(async () => {',
  '    calls++;',
  '    if (calls < 3) throw new Error(\'429\');',
  '    return \'ok\';',
  '  }, 4);',
  '  assert.equal(v, \'ok\');',
  '  assert.equal(calls, 3);',
  '});',
  '',
  'test(\'retry rethrows after the last attempt\', async () => {',
  '  let calls = 0;',
  '  await assert.rejects(',
  '    withRetry(async () => {',
  '      calls++;',
  '      throw new Error(\'429\');',
  '    }, 3),',
  '    /429/,',
  '  );',
  '  assert.equal(calls, 3);',
  '});',
  '',
  'test(\'retry does not retry a success\', async () => {',
  '  let calls = 0;',
  '  await withRetry(async () => {',
  '    calls++;',
  '    return 1;',
  '  });',
  '  assert.equal(calls, 1);',
  '});',
  ''
].join('\n'));

console.log('patched privy.ts, added test/retry.test.ts');