(function () {
  var cta = document.getElementById('headCta');
  var box = document.getElementById('acct');
  var btn = document.getElementById('acctBtn');
  var pop = document.getElementById('acctPop');
  if (!cta || !box || !btn || !pop) return;

  function money(v) {
    return '$' + (Number(v || 0) / 1e6).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function paint(j) {
    var total = Number(j.balance || 0) + Number(j.locked || 0) + Number(j.pending || 0) +
      Number(j.rewards || 0) + Number(j.held || 0);
    var short = String(j.userId || '').slice(0, 8);
    pop.innerHTML =
      '<div class="acct-head">' +
        '<span class="acct-k">Account</span>' +
        '<span class="acct-row"><b>#' + esc(short) + '</b>' +
          '<button class="acct-copy" type="button" data-copy="' + esc(short) + '">Copy</button></span>' +
        '<span class="acct-mail">' + esc(j.email || '') + '</span>' +
      '</div>' +
      '<div class="acct-tot"><span class="acct-k">Total value</span>' +
        '<b>' + money(total) + '</b>' +
        '<span class="acct-avail">Available ' + money(j.balance) + '</span></div>' +
      (j.referralCode
        ? '<div class="acct-ref"><span class="acct-k">Referral code</span>' +
          '<span class="acct-row"><b>' + esc(j.referralCode) + '</b>' +
          '<button class="acct-copy" type="button" data-copy="' + esc(j.referralCode) + '">Copy</button></span></div>'
        : '') +
      '<div class="acct-links">' +
        '<a class="acct-link" href="/app.html">Launch app</a>' +
        '<a class="acct-link" href="/app.html#notifications">Settings</a>' +
        '<a class="acct-link" href="mailto:support@quvio.io">Support</a>' +
        '<button class="acct-link acct-out" type="button" id="acctOut">Sign out</button>' +
      '</div>';
  }

  function close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  function open() { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pop.hidden) open(); else close();
  });

  pop.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]');
    if (c) {
      var v = c.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject())
        .then(function () { c.textContent = 'Copied'; })
        .catch(function () { c.textContent = 'Select'; })
        .finally(function () { setTimeout(function () { c.textContent = 'Copy'; }, 1400); });
      return;
    }
    if (e.target.closest('#acctOut')) {
      fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .finally(function () { location.href = '/'; });
    }
  });

  document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  fetch('/wallet/balance', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j) return;
      paint(j);
      cta.hidden = true;
      box.hidden = false;
      document.querySelectorAll('a[data-wl]').forEach(function (a) {
        a.removeAttribute('data-wl');
        a.setAttribute('href', '/app.html');
      });
    })
    .catch(function () {});
})();