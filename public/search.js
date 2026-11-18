(function () {
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
