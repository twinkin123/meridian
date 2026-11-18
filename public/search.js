(function () {
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

  function align() {
    var card = document.querySelector('.main .card');
    if (!card) return;
    if (window.matchMedia('(max-width:900px)').matches) {
      box.style.removeProperty('left');
      box.style.removeProperty('right');
      return;
    }
    var r = card.getBoundingClientRect();
    var w = document.documentElement.clientWidth;
    box.style.setProperty('left', Math.round(r.left) + 'px', 'important');
    box.style.setProperty('right', Math.round(w - r.right) + 'px', 'important');
  }
  align();
  window.addEventListener('resize', align);
  window.addEventListener('pageshow', align);
  window.openSearch = function (q) { if (narrow()) expand(); if (q != null) input.value = q; input.focus(); fire(); };
})();
