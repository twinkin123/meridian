import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.css';
let c = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function rep(a, b) {
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 50));
  c = c.split(a).join(b);
}
rep('left:320px !important;right:180px !important', 'left:16.7vw !important;right:35.9vw !important');
rep('.top .hsearch{right:690px !important}', '.top .hsearch{right:35.9vw !important}');
rep('left:auto !important;right:420px !important', 'left:auto !important;right:27vw !important');
writeFileSync(f, c);
const a = 'public/app.html';
writeFileSync(a, readFileSync(a, 'utf8').split('/search.css?v=7').join('/search.css?v=8'));
console.log('proportional');
