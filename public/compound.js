(function () {
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
    if (window.matchMedia('(max-width:900px)').matches) {
      btn.style.setProperty('right', Math.round(cr.right - kr.right) + 'px', 'important');
      btn.style.setProperty('top', Math.round(kr.bottom - cr.top + 8) + 'px', 'important');
    } else {
      btn.style.setProperty('right', Math.round(cr.right - kr.left + 12) + 'px', 'important');
      btn.style.setProperty('top', Math.round(kr.top - cr.top + (kr.height - btn.offsetHeight) / 2) + 'px', 'important');
    }
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
