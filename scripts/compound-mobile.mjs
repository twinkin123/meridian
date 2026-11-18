import { readFileSync, writeFileSync } from 'node:fs';
const c = 'public/compound.css';
let s = readFileSync(c, 'utf8').replace(/\r\n/g, '\n');
const a = '@media (max-width:620px){.cmp{position:static;margin:0 0 0 8px;vertical-align:middle;font-size:9px}}';
const b = [
  '@media (max-width:620px){',
  '  .cmp{position:absolute;top:14px;right:14px}',
  '  .cmp-lbl{display:none}',
  '  html body .card.has-clock .res-clock{top:44px !important;right:14px !important}',
  '}',
].join('\n');
const n = s.split(a).length - 1;
if (n !== 1) throw new Error('anchor ' + n);
writeFileSync(c, s.split(a).join(b));

const f = 'public/app.html';
let h = readFileSync(f, 'utf8');
const m = 'id="cmpToggle" type="button" aria-pressed="true"';
const m2 = 'id="cmpToggle" type="button" aria-label="Auto compound" aria-pressed="true"';
if (h.split(m).length - 1 !== 1) throw new Error('label anchor');
h = h.split(m).join(m2).split('/compound.css?v=2').join('/compound.css?v=3');
writeFileSync(f, h);
console.log('mobile sorted');
