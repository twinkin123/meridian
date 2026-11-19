/* bye.js — shows the post-logout confirmation once, then clears the marker */
(function () {
  if (document.querySelector('.bye')) return;
  if (!/(?:^|;\s*)bye=1(?:;|$)/.test(document.cookie)) return;
  document.cookie = 'bye=1; max-age=0; path=/';

  var onAuth = /\/auth(\.html)?$/.test(location.pathname);

  var wrap = document.createElement('div');
  wrap.className = 'bye';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'byeTitle');
  wrap.innerHTML =
    '<div class="bye-card">' +
      '<span class="bye-ico" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
      '</span>' +
      '<h2 id="byeTitle">You&#39;re logged out</h2>' +
      '<p class="bye-sub">Your session has ended. Balances, stakes and rewards are untouched.</p>' +
      '<div class="bye-acts">' +
        '<button type="button" class="bye-btn primary" id="byeLogin">Log in again</button>' +
        '<a class="bye-btn ghost" href="/">Back to home</a>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);
  document.body.classList.add('bye-lock');

  function close() {
    if (!wrap.parentNode) return;
    wrap.remove();
    document.body.classList.remove('bye-lock');
  }

  document.getElementById('byeLogin').addEventListener('click', function () {
    if (onAuth) {
      close();
      var f = document.getElementById('email') || document.querySelector('input[type=email]');
      if (f) f.focus();
      return;
    }
    location.href = '/auth.html';
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();