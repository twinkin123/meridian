import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/index.ts';
let s = readFileSync(p, 'utf8');
const pairs = [
  [`      "style-src 'self' 'unsafe-inline'",`, `      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",`],
  [`      "font-src 'self' data:",`, `      "font-src 'self' data: https://fonts.gstatic.com",`],
  [`      "img-src 'self' data: blob:",`, `      "img-src 'self' data: blob: https://cdn.jsdelivr.net",`],
  [`      "connect-src 'self' https://auth.privy.io https://*.privy.io",`, `      "connect-src 'self' https://auth.privy.io https://*.privy.io https://cdn.jsdelivr.net https://api.coingecko.com",`],
];
for (const [from, to] of pairs) {
  if (!s.includes(from)) { console.log('ANCHOR MISS', from.trim()); process.exit(1); }
  s = s.split(from).join(to);
}
writeFileSync(p, s);
console.log('csp widened');
