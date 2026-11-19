import { readFileSync, writeFileSync } from 'node:fs';
const p = 'public/deposit.js';
let s = readFileSync(p, 'utf8');
const anchor = `      routes = k.routes || [];\n      min = k.min || {};`;
if (!s.includes(anchor)) { console.log('ANCHOR MISS'); process.exit(1); }
if (s.includes('return !!addresses[r5.family]')) { console.log('already patched'); process.exit(0); }
s = s.split(anchor).join(
  `      routes = k.routes || [];\n      min = k.min || {};\n      routes = routes.filter(function (r5) { return !!addresses[r5.family]; });`,
);
writeFileSync(p, s);
console.log('deposit.js patched');
