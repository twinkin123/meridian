import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/privy.ts';
let s = readFileSync(p, 'utf8');
const a = `  if (!seenChain.has('solana')) filtered.push({ asset: 'usdc', chain: 'solana' });\n`;
if (!s.includes(a)) { console.log('ANCHOR MISS'); process.exit(1); }
s = s.split(a).join(`  // Solana source needs app-pays gas sponsorship, still pending; the user's own\n  // Solana wallet address covers that family instead.\n`);
s = s.split(`new Set(['ethereum', 'solana'])`).join(`new Set(['ethereum'])`);
writeFileSync(p, s);
console.log('ethereum-only sources');
