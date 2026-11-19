import { readFileSync, writeFileSync } from 'node:fs';
function sub(s, from, to, label) {
  if (!s.includes(from)) { console.log('ANCHOR MISS', label); process.exit(1); }
  return s.split(from).join(to);
}

{
  const p = 'src/privy.ts';
  let s = readFileSync(p, 'utf8');
  s = sub(
    s,
    `  const res = await api.depositAccounts.crypto.create(walletId, {
    type: 'inline_route',`,
    `  // Privy supports only ethereum and solana as source chains. An EVM address
  // accepts transfers on every EVM chain, so one ethereum source covers base,
  // polygon, arbitrum, optimism, bsc and robinhood alike.
  const SUPPORTED = new Set(['ethereum', 'solana']);
  const seenChain = new Set<string>();
  const filtered: { asset: string; chain: string }[] = [];
  for (const s of sources) {
    if (!SUPPORTED.has(s.chain) || seenChain.has(s.chain)) continue;
    seenChain.add(s.chain);
    filtered.push(s);
  }
  if (!seenChain.has('ethereum')) filtered.push({ asset: 'usdc', chain: 'ethereum' });
  if (!seenChain.has('solana')) filtered.push({ asset: 'usdc', chain: 'solana' });

  const res = await api.depositAccounts.crypto.create(walletId, {
    type: 'inline_route',`,
    'allowlist',
  );
  s = sub(s, `    source: { mode: 'include', values: sources },`, `    source: { mode: 'include', values: filtered },`, 'values');
  writeFileSync(p, s);
  console.log('privy.ts patched');
}

{
  const p = 'src/deposits.ts';
  let s = readFileSync(p, 'utf8');
  s = sub(s, `if (walletId && (!out.evm || !out.tron)) {`, `if (walletId && !out.evm) {`, 'guard');
  writeFileSync(p, s);
  console.log('deposits.ts patched');
}
