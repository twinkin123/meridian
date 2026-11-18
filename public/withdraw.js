(function () {
  var overlay = null, card = null, host = null, balEl = null, bal = '0';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function money(m) {
    return '\u0024' + (Number(m) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!overlay) return;
    if (card) {
      var panel = document.getElementById('p-withdraw');
      if (panel && !panel.contains(card)) panel.appendChild(card);
    }
    overlay.remove();
    overlay = null; card = null; host = null; balEl = null;
    document.body.classList.remove('wd-open');
    document.removeEventListener('keydown', onKey);
  }

  function loadBal() {
    fetch('/wallet/balance', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        bal = j.balance || '0';
        var n = Number(bal) / 1e6;
        if (balEl) balEl.textContent = n > 0 ? money(bal) + ' available to withdraw' : 'No available balance right now';
        var all = document.getElementById('wAll');
        if (all) all.disabled = !(n > 0);
      })
      .catch(function () {});
  }

  function build() {
    var panel = document.getElementById('p-withdraw');
    card = panel ? panel.querySelector('.card') : null;

    overlay = el('div', 'wd-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'wd-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Withdraw funds');

    var head = el('div', 'wd-head');
    head.appendChild(el('div', 'wd-ico', '\u2191'));
    head.appendChild(el('h3', null, 'Withdraw funds'));
    var x = el('button', 'wd-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    balEl = el('div', 'wd-bal', 'Loading balance\u2026');
    sheet.appendChild(balEl);

    host = el('div', 'wd-host');
    if (card) host.appendChild(card);
    sheet.appendChild(host);

    var foot = el('div', 'wd-foot');
    foot.textContent = '\u26a0 Payouts leave on Solana. Double-check the destination address \u2014 sends are final.';
    sheet.appendChild(foot);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('wd-open');
    document.addEventListener('keydown', onKey);
  }

  function open() {
    if (overlay) return;
    build();
    loadBal();
    var m = document.getElementById('wMsg');
    if (m) { m.textContent = ''; m.className = 'msg'; }
    var a = document.getElementById('wAddr');
    if (a) setTimeout(function () { a.focus(); }, 60);
  }

  window.openWithdraw = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-withdraw], [data-goto="p-withdraw"], a[href="#withdraw"], #rwOut');
    if (!t) return;
    e.preventDefault();
    open();
  });

  if (location.hash === '#withdraw') open();
})();