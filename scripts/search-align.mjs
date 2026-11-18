import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/search.js';
let s = readFileSync(f, 'utf8');
const anchor = "  window.openSearch =";
const add = [
  "  function align() {",
  "    var card = document.querySelector('.main .card');",
  "    if (!card) return;",
  "    if (window.matchMedia('(max-width:900px)').matches) {",
  "      box.style.removeProperty('left');",
  "      box.style.removeProperty('right');",
  "      return;",
  "    }",
  "    var r = card.getBoundingClientRect();",
  "    var w = document.documentElement.clientWidth;",
  "    box.style.setProperty('left', Math.round(r.left) + 'px', 'important');",
  "    box.style.setProperty('right', Math.round(w - r.right) + 'px', 'important');",
  "  }",
  "  align();",
  "  window.addEventListener('resize', align);",
  "  window.addEventListener('pageshow', align);",
  "",
].join('\n');
const n = s.split(anchor).length - 1;
if (n !== 1) throw new Error('anchor ' + n);
s = s.split(anchor).join(add + anchor);
writeFileSync(f, s);

const a = 'public/app.html';
writeFileSync(a, readFileSync(a, 'utf8').split('/search.js?v=1').join('/search.js?v=9'));
console.log('aligned to content');
