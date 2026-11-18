import { readFileSync, writeFileSync } from 'node:fs';

const p = 'public/deposit.js';
let s = readFileSync(p, 'utf8');

const start = s.indexOf('function openList(row) {');
if (start < 0) throw new Error('ANCHOR MISS openList');
const end = s.indexOf('\n  }\n', start);
if (end < 0) throw new Error('ANCHOR MISS end');

let body = s.slice(start, end);
body = body.replace(/btn/g, 'row');
body = body.replace(
  'row.parentNode.appendChild(list);',
  "row.insertAdjacentElement('afterend', list);\n    list.scrollIntoView({ block: 'nearest' });",
);
if (!body.includes('insertAdjacentElement')) throw new Error('ANCHOR MISS append');

s = s.slice(0, start) + body + s.slice(end);
writeFileSync(p, s);

const c = 'public/deposit.css';
let css = readFileSync(c, 'utf8');
if (!css.includes('max-height:90vh')) {
  css += "\n.dep-sheet{max-height:90vh;overflow-y:auto}\n.dep-row{cursor:pointer}\n";
  writeFileSync(c, css);
}
console.log('patched');
