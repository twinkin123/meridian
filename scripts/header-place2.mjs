import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.css';
let c = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function rep(a, b) {
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 50));
  c = c.split(a).join(b);
}
rep('left:335px !important', 'left:320px !important');
rep('width:min(46vw,760px) !important', 'width:min(48vw,780px) !important');
rep('html body .top .welcome{left:auto !important;right:196px !important}',
    'html body .top .welcome{left:calc(320px + min(48vw,780px) + 28px) !important;right:auto !important}');
rep('@media (max-width:1200px) and (min-width:901px){', '@media (max-width:1000px) and (min-width:901px){');
writeFileSync(f, c);

const a = 'public/app.html';
let s = readFileSync(a, 'utf8').split('/search.css?v=4').join('/search.css?v=5');
writeFileSync(a, s);
console.log('repositioned');
