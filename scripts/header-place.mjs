import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.css';
let c = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
c += [
  '',
  '@media (min-width:901px){',
  '  .top .hsearch{position:absolute !important;left:335px !important;top:50% !important;transform:translateY(-50%) !important;width:min(46vw,760px) !important;max-width:none !important;margin:0 !important}',
  '  html body .top .welcome{left:auto !important;right:196px !important}',
  '}',
  '@media (max-width:1200px) and (min-width:901px){',
  '  html body .top .welcome{display:none !important}',
  '}',
  '',
].join('\n');
writeFileSync(f, c);

const a = 'public/app.html';
let s = readFileSync(a, 'utf8');
s = s.split('/search.css?v=3').join('/search.css?v=4');
writeFileSync(a, s);
console.log('header placed');
