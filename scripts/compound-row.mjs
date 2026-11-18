import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync('public/compound.css', `.cmp{position:absolute;top:46px;right:18px;display:inline-flex;align-items:center;gap:8px;padding:0;border:0;background:none;color:var(--ink-3);font-family:"Space Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.cmp-lbl{white-space:nowrap}
.cmp-track{position:relative;flex:none;width:36px;height:20px;border-radius:99px;background:rgba(255,255,255,.1);border:1px solid var(--line-2);transition:background .18s ease,border-color .18s ease}
.cmp-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#cfcfda;transition:transform .18s ease,background .18s ease}
.cmp.on .cmp-track{background:#3b82f6;border-color:#3b82f6}
.cmp.on .cmp-knob{transform:translateX(16px);background:#fff}
.cmp.on .cmp-lbl{color:var(--txt)}
@media (max-width:620px){.cmp{top:44px;right:14px;font-size:9px}}
`);

writeFileSync('public/compound.js', `(function () {
  var btn = document.getElementById('cmpToggle');
  if (!btn) return;

  function paint(on) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    window.autoCompound = on;
  }

  function place() {
    var card = btn.closest('.card');
    var clock = document.querySelector('.card.has-clock .res-clock') || document.querySelector('.res-clock');
    if (!card || !clock) return;
    var cr = card.getBoundingClientRect();
    var kr = clock.getBoundingClientRect();
    if (!kr.width) return;
    btn.style.setProperty('right', Math.round(cr.right - kr.right) + 'px', 'important');
    btn.style.setProperty('top', Math.round(kr.bottom - cr.top + 8) + 'px', 'important');
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

  place();
  window.addEventListener('resize', place);
  window.addEventListener('pageshow', place);
  document.addEventListener('rate', place);
  var tries = 0;
  var timer = setInterval(function () {
    place();
    if (++tries > 20) clearInterval(timer);
  }, 500);
})();
`);

const f = 'public/app.html';
let h = readFileSync(f, 'utf8');
h = h.split('/compound.css?v=3').join('/compound.css?v=4').split('/compound.js?v=3').join('/compound.js?v=4');
writeFileSync(f, h);
console.log('row under the chip');
