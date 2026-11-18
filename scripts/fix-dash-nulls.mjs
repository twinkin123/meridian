import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 60));
  s = s.split(a).join(b);
}
rep("<script><script>(function(){  var gone = false;", "<script>(function(){  var gone = false;");
rep("document.getElementById('setEmail').textContent = me.email || '';",
    "var se = document.getElementById('setEmail'); if (se) se.textContent = me.email || '';");
rep("document.getElementById('logout2').onclick = logout;",
    "var lo2 = document.getElementById('logout2'); if (lo2) lo2.onclick = logout;");
writeFileSync(f, s);
console.log('fixed');
