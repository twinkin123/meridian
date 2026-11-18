(function () {
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
