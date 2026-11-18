import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
s = s.split('/search.css?v=1').join('/search.css?v=3');
s = s.split('/search.js?v=1').join('/search.js?v=3');
writeFileSync(f, s);
console.log('busted');
