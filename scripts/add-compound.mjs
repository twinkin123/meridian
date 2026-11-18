import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('public/compound.css', `.cmp{position:absolute;top:15px;right:186px;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border:1px solid var(--line-2);border-radius:99px;background:var(--panel2);color:var(--ink-3);font-family:"Space Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:color .15s ease,border-color .15s ease}
.cmp:hover{color:var(--txt)}
.cmp .dot{width:7px;height:7px;border-radius:50%;border:1px solid currentColor;background:transparent;transition:background .15s ease,box-shadow .15s ease}
.cmp.on{color:#1bff80;border-color:rgba(27,255,128,.45)}
.cmp.on .dot{background:#1bff80;border-color:#1bff80;box-shadow:0 0 8px rgba(27,255,128,.75)}
@media (max-width:620px){.cmp{position:static;margin:0 0 0 8px;vertical-align:middle;font-size:9px;padding:3px 8px}}
`);

writeFileSync('public/compound.js', `(function () {
  var btn = document.getElementById('cmpToggle');
  if (!btn) return;

  function paint(on) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    window.autoCompound = on;
  }

  var saved = null;
  try { saved = localStorage.getItem('mrd_auto_compound'); } catch (_) {}
  paint(saved !== '0');

  btn.addEventListener('click', function () {
    var on = !btn.classList.contains('on');
    paint(on);
    try { localStorage.setItem('mrd_auto_compound', on ? '1' : '0'); } catch (_) {}
    document.dispatchEvent(new CustomEvent('compound', { detail: { on: on } }));
  });
})();
`);

const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 50));
  s = s.split(a).join(b);
}
rep('<span class="lbl">Total account value</span>',
    '<span class="lbl">Total account value</span><button class="cmp on" id="cmpToggle" type="button" aria-pressed="true"><span class="dot"></span>Auto compound</button>');
rep('</head>', '<link rel="stylesheet" href="/compound.css?v=1"></head>');
rep('<script src="/search.js?v=3"></script>',
    '<script src="/search.js?v=10"></script><script src="/compound.js?v=1"></script>');
writeFileSync(f, s);
console.log('auto compound added');
