import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/compound.js';
let s = readFileSync(f, 'utf8');
const a = "    btn.style.setProperty('right', Math.round(cr.right - kr.right) + 'px', 'important');\n    btn.style.setProperty('top', Math.round(kr.bottom - cr.top + 8) + 'px', 'important');";
const b = [
  "    if (window.matchMedia('(max-width:900px)').matches) {",
  "      btn.style.setProperty('right', Math.round(cr.right - kr.right) + 'px', 'important');",
  "      btn.style.setProperty('top', Math.round(kr.bottom - cr.top + 8) + 'px', 'important');",
  "    } else {",
  "      btn.style.setProperty('right', Math.round(cr.right - kr.left + 12) + 'px', 'important');",
  "      btn.style.setProperty('top', Math.round(kr.top - cr.top + (kr.height - btn.offsetHeight) / 2) + 'px', 'important');",
  "    }",
].join('\n');
const n = s.split(a).length - 1;
if (n !== 1) throw new Error('anchor ' + n);
writeFileSync(f, s.split(a).join(b));
const h = 'public/app.html';
writeFileSync(h, readFileSync(h, 'utf8').split('/compound.js?v=4').join('/compound.js?v=5'));
console.log('desktop beside the chip');
