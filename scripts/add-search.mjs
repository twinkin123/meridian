import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('public/search.css', `.hsearch{display:flex;align-items:center;gap:9px;flex:1;max-width:520px;margin:0 auto;height:34px;padding:0 11px;border:1px solid var(--line-2);border-radius:9px;background:var(--panel2);color:var(--ink-3);transition:border-color .15s ease}
.hsearch:focus-within{border-color:var(--pur)}
.hsearch svg{flex:none;width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
.hsearch input{flex:1;min-width:0;border:0;background:none;color:var(--txt);font:inherit;font-size:12.5px;padding:0;height:100%}
.hsearch input:focus{outline:none;border:0}
.hsearch input::-webkit-search-cancel-button{display:none}
.hsearch kbd{flex:none;font-family:"Space Mono",monospace;font-size:10px;line-height:1;padding:4px 6px;border:1px solid var(--line-2);border-radius:5px;color:var(--ink-3);background:var(--panel)}
.hsearch.on{border-color:var(--pur)}
@media (max-width:1100px){.hsearch{max-width:320px}}
@media (max-width:860px){.hsearch kbd{display:none}.hsearch{max-width:200px}}
@media (max-width:620px){.hsearch{display:none}}
`);

writeFileSync('public/search.js', `(function () {
  var box = document.getElementById('hsearch');
  var input = document.getElementById('hq');
  if (!box || !input) return;

  function fire() {
    var q = input.value.trim();
    window.lastSearch = q;
    document.dispatchEvent(new CustomEvent('search', { detail: { q: q } }));
  }

  input.addEventListener('focus', function () { box.classList.add('on'); });
  input.addEventListener('blur', function () { box.classList.remove('on'); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); fire(); }
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
  box.addEventListener('click', function (e) { if (e.target !== input) input.focus(); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });

  window.openSearch = function (q) { if (q != null) input.value = q; input.focus(); fire(); };
})();
`);

const markup = [
  '',
  '<div class="hsearch" id="hsearch">',
  '  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M16.5 16.5 21 21"></path></svg>',
  '  <input id="hq" type="search" placeholder="Search anything" spellcheck="false" autocomplete="off" aria-label="Search">',
  '  <kbd>/</kbd>',
  '</div>',
].join('\n');

const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 60));
  s = s.split(a).join(b);
}
rep('<link rel="stylesheet" href="/settings.css?v=1">', '<link rel="stylesheet" href="/settings.css?v=1"><link rel="stylesheet" href="/search.css?v=1">');
rep('<span class="welcome" id="welcome"></span>', '<span class="welcome" id="welcome"></span>' + markup);
rep('<script src="/settings.js?v=1"></script>', '<script src="/settings.js?v=1"></script><script src="/search.js?v=1"></script>');
writeFileSync(f, s);

let p = readFileSync('public/profile-chip.js', 'utf8');
const before = p;
p = p.split("var b = document.querySelector('[data-panel=\"p-settings\"]');\n    if (b) b.click();").join('if (window.openSettings) window.openSettings();');
if (p === before) throw new Error('profile-chip click not patched');
writeFileSync('public/profile-chip.js', p);

console.log('search added');
