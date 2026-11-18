import { readFileSync, writeFileSync } from 'node:fs';

let css = readFileSync('public/search.css', 'utf8').replace(/\r\n/g, '\n');
css = css.split('@media (max-width:620px){.hsearch{display:none}}').join([
  '@media (max-width:620px){',
  '.hsearch{width:34px;max-width:none;padding:0;justify-content:center;margin-left:auto;margin-right:0;border-color:transparent;background:transparent;cursor:pointer}',
  '.hsearch input{display:none}',
  '.hsearch.expand{position:absolute;left:10px;right:10px;top:13px;width:auto;padding:0 11px;justify-content:flex-start;border-color:var(--pur);background:var(--panel2);z-index:60}',
  '.hsearch.expand input{display:block}',
  '}',
].join('\n'));
writeFileSync('public/search.css', css);

writeFileSync('public/search.js', `(function () {
  var box = document.getElementById('hsearch');
  var input = document.getElementById('hq');
  if (!box || !input) return;

  function narrow() { return window.matchMedia('(max-width:620px)').matches; }
  function expand() { box.classList.add('expand'); input.focus(); }
  function collapse() { box.classList.remove('expand'); }

  function fire() {
    var q = input.value.trim();
    window.lastSearch = q;
    document.dispatchEvent(new CustomEvent('search', { detail: { q: q } }));
  }

  input.addEventListener('focus', function () { box.classList.add('on'); });
  input.addEventListener('blur', function () {
    box.classList.remove('on');
    if (!input.value.trim()) collapse();
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); fire(); }
    if (e.key === 'Escape') { input.value = ''; input.blur(); collapse(); }
  });

  box.addEventListener('click', function (e) {
    if (narrow() && !box.classList.contains('expand')) { e.preventDefault(); expand(); return; }
    if (e.target !== input) input.focus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    if (narrow()) expand(); else input.focus();
  });

  window.openSearch = function (q) { if (narrow()) expand(); if (q != null) input.value = q; input.focus(); fire(); };
})();
`);

console.log('mobile search done');
