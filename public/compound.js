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
      btn.style.removeProperty('right');
      btn.style.removeProperty('top');
    } else {
      btn.style.setProperty('right', Math.round(cr.right - kr.left + 12) + 'px', 'important');
      btn.style.setProperty('top', Math.round(kr.top - cr.top + (kr.height - btn.offsetHeight) / 2) + 'px', 'important');
    }
  }

  /* The server owns this flag - the daily run reads users.auto_compound. */
  function load() {
    fetch('/wallet/balance', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && typeof j.autoCompound === 'boolean') paint(j.autoCompound); })
      .catch(function () {});
  }

  btn.addEventListener('click', function () {
    var on = !btn.classList.contains('on');
    paint(on);
    fetch('/wallet/compound', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on: on })
    })
      .then(function (r) { if (!r.ok) throw new Error('save failed'); })
      .catch(function () { paint(!on); })
      .finally(function () {
        document.dispatchEvent(new CustomEvent('compound', { detail: { on: btn.classList.contains('on') } }));
      });
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

  load();
  window.addEventListener('pageshow', load);
})();
