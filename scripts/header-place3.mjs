import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.css';
let c = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function rep(a, b) {
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 50));
  c = c.split(a).join(b);
}
rep('width:min(48vw,780px) !important', 'width:min(49vw,948px) !important');
rep('min(48vw,780px) + 28px', 'min(49vw,948px) + 170px');
rep('@media (max-width:1000px) and (min-width:901px){', '@media (max-width:1300px) and (min-width:901px){');
writeFileSync(f, c);
const a = 'public/app.html';
writeFileSync(a, readFileSync(a, 'utf8').split('/search.css?v=5').join('/search.css?v=6'));
console.log('resized');
