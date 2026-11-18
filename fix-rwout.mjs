import fs from 'node:fs';

let bad = false;
function fail(m) { console.log('FAIL: ' + m); bad = true; }

const A = 'public/app.html';
const W = 'public/withdraw.js';

let a = fs.readFileSync(A, 'utf8').replace(/\r\n/g, '\n');
let w = fs.readFileSync(W, 'utf8').replace(/\r\n/g, '\n');

let L = a.split('\n');
let bi = L.findIndex(l => l.includes('rwOut'));
let ei = L.findIndex(l => l.includes('refEarned'));
console.log('rwOut=' + (bi + 1) + ' refEarned=' + (ei + 1) + ' lines=' + L.length);

if (bi < 0 || ei < 0) {
  fail('anchors missing');
  L.forEach((l, i) => { if (/rwOut|refEarned/.test(l)) console.log('  ' + (i + 1) + ': ' + l.slice(0, 160)); });
} else {
  const indent = (L[ei].match(/^[ \t]*/) || [''])[0];
  let btn = L[bi].trim().replace('margin-top:10px;', 'margin:12px 0 16px;');
  if (!btn.includes('margin:12px 0 16px;')) btn = btn.replace('width:100%;', 'width:100%;margin:12px 0 16px;');
  L.splice(bi, 1);
  const ei2 = L.findIndex(l => l.includes('refEarned'));
  let ci = ei2 + 1;
  while (ci < L.length && L[ci].trim() !== '</div>') ci++;
  if (ci >= L.length) fail('ref-stats close not found');
  else { L.splice(ci + 1, 0, '', indent + btn); console.log('inserted after line ' + (ci + 1)); }
}

const before = L.length;
L = L.filter(l => !l.includes('function alignBtns(') && !l.includes('function mt('));
console.log('shim lines removed: ' + (before - L.length));

a = L.join('\n');
if (a.includes('/withdraw.js?v=2')) { a = a.replace('/withdraw.js?v=2', '/withdraw.js?v=3'); console.log('withdraw.js bumped to v=3'); }
else fail('withdraw.js?v=2 tag not found');

const g1 = "    if (!addr || !addr.value.trim()) { open(); return; }";
const n1 = "    var mine = (addr && addr.value.trim()) || ((document.getElementById('addr') || {}).textContent || '').trim();\n    if (!mine) { open(); return; }";
if (!w.includes(g1)) fail('rewards guard not found'); else w = w.replace(g1, n1);

const g2 = 'address: addr.value.trim()';
if (!w.includes(g2)) fail('addr.value use not found'); else w = w.replace(g2, 'address: mine');

const g3 = "if (!(Number(rw) > 0)) { open(); return; }";
if (!w.includes(g3)) fail('rw check not found'); else w = w.replace(g3, g3 + " var b0 = document.getElementById('rwOut'); if (b0) b0.disabled = true;");

const g4 = "var note = document.getElementById('heldNote');";
if (!w.includes(g4)) fail('heldNote line not found'); else w = w.replace(g4, g4 + "\n            var btn = document.getElementById('rwOut');\n            if (btn) { btn.textContent = res.ok ? 'Queued' : 'Try again'; setTimeout(function () { btn.textContent = 'Claim Referral Rewards'; }, 2500); }");

if (bad) { console.log('--- nothing written ---'); process.exit(1); }
fs.writeFileSync(A, a);
fs.writeFileSync(W, w);
console.log('OK: wrote app.html and withdraw.js');