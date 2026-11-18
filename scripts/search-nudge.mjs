import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.css';
let c = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function rep(a, b) {
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 50));
  c = c.split(a).join(b);
}
rep('.hsearch{display:flex;', '.hsearch{position:relative;left:56px;display:flex;');
rep('  .top .hsearch{flex:1 1 auto', '  .top .hsearch{left:0;flex:1 1 auto');
writeFileSync(f, c);
console.log('nudged right');
