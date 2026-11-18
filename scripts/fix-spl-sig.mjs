import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/privy.ts';
const M = 'src/solana/match.ts';
const T = 'test/match.test.ts';

let p = readFileSync(P, 'utf8');
let m = readFileSync(M, 'utf8');
let t = readFileSync(T, 'utf8');

if (m.includes('ownerTokenDelta')) {
  console.log('already patched');
  process.exit(0);
}

const helper = [
  '',
  '/** Net change in every token account `owner` holds for `mint`. An SPL transfer',
  '    moves the token account, so the owner itself never appears in the keys. */',
  'export function ownerTokenDelta(meta: any, owner: string, mint: string): bigint {',
  '  const sum = (list: any[]): bigint =>',
  '    list',
  '      .filter((b) => b.owner === owner && b.mint === mint)',
  '      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount?.amount ?? \'0\'), 0n);',
  '  return sum(meta?.postTokenBalances ?? []) - sum(meta?.preTokenBalances ?? []);',
  '}',
  ''
].join('\n');

const oldBlock = [
  '    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());',
  '    const at = keys.indexOf(to);',
  '    if (at === -1) continue;',
  '',
  '    let delta: bigint;',
  '    if (asset === \'SOL\') {',
  '      delta = BigInt(tx.meta.postBalances[at] ?? 0) - BigInt(tx.meta.preBalances[at] ?? 0);',
  '    } else {',
  '      const pre: any[] = tx.meta.preTokenBalances ?? [];',
  '      const post: any[] = tx.meta.postTokenBalances ?? [];',
  '      const bal = (list: any[]): bigint => {',
  '        const hit = list.find((b) => b.owner === to && b.mint === mint);',
  '        return BigInt(hit?.uiTokenAmount?.amount ?? \'0\');',
  '      };',
  '      delta = bal(post) - bal(pre);',
  '    }',
  '    if (delta === qty) return s.signature;'
].join('\n');

const newBlock = [
  '    let delta: bigint;',
  '    if (asset === \'SOL\') {',
  '      const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());',
  '      const at = keys.indexOf(to);',
  '      if (at === -1) continue;',
  '      delta = BigInt(tx.meta.postBalances[at] ?? 0) - BigInt(tx.meta.preBalances[at] ?? 0);',
  '    } else {',
  '      delta = ownerTokenDelta(tx.meta, to, mint);',
  '      if (delta === 0n) continue;',
  '    }',
  '    if (delta === qty) return s.signature;'
].join('\n');

const n = p.split(oldBlock).length - 1;
if (n !== 1) throw new Error(`expected 1 match block, got ${n}`);
p = p.replace(oldBlock, newBlock);

const anchor = 'import { Connection, PublicKey } from \'@solana/web3.js\';';
if (p.split(anchor).length - 1 !== 1) throw new Error('import anchor missing');
p = p.replace(anchor, anchor + '\nimport { ownerTokenDelta } from \'./solana/match.js\';');

m = m + helper;

const testAnchor = 'import { matchDeposit, usdMicro, USDC_MINT }';
if (t.split(testAnchor).length - 1 !== 1) throw new Error('test import anchor missing');
t = t.replace(testAnchor, 'import { matchDeposit, usdMicro, USDC_MINT, ownerTokenDelta }');

t = t + [
  '',
  'test(\'spl delta sums every token account of the owner\', () => {',
  '  const meta = {',
  '    preTokenBalances: [',
  '      { mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: \'100\' } },',
  '      { mint: USDC_MINT, owner: \'Other\', uiTokenAmount: { amount: \'999\' } },',
  '    ],',
  '    postTokenBalances: [',
  '      { mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: \'600\' } },',
  '      { mint: USDC_MINT, owner: \'Other\', uiTokenAmount: { amount: \'999\' } },',
  '    ],',
  '  };',
  '  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 500n);',
  '});',
  '',
  'test(\'spl delta counts a freshly created token account\', () => {',
  '  const meta = {',
  '    preTokenBalances: [],',
  '    postTokenBalances: [{ mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: \'38000000\' } }],',
  '  };',
  '  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 38000000n);',
  '});',
  '',
  'test(\'spl delta is zero when the owner is untouched\', () => {',
  '  assert.equal(ownerTokenDelta({}, addr, USDC_MINT), 0n);',
  '  assert.equal(ownerTokenDelta(null, addr, USDC_MINT), 0n);',
  '});',
  '',
  'test(\'spl delta ignores a different mint\', () => {',
  '  const meta = { postTokenBalances: [{ mint: \'OtherMint\', owner: addr, uiTokenAmount: { amount: \'5\' } }] };',
  '  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 0n);',
  '});',
  ''
].join('\n');

writeFileSync(P, p);
writeFileSync(M, m);
writeFileSync(T, t);
console.log('patched 3 files');