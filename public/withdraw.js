(function () {
  var overlay = null, balEl = null, bal = '0', lockY = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function money(m) {
    return '\u0024' + (Number(m) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Exact decimal for a micro balance, trailing zeros trimmed. */
  function exact(m) {
    var s = String(m).padStart(7, '0');
    var f = s.slice(-6).replace(/0+$/, '');
    return f ? s.slice(0, -6) + '.' + f : s.slice(0, -6);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function wmsg(t, k) {
    var m = document.getElementById('wMsg');
    if (!m) return;
    m.textContent = t;
    m.className = 'msg ' + k;
  }

  var errors = {
    below_min: 'Below the $10 minimum.',
    over_cap: 'Above your cap for this address.',
    frozen: 'Withdrawals are frozen while recon runs.',
    bad_address: 'That destination address is not valid.',
    bad_asset: 'Unsupported asset.',
    bad_amount: 'Amount must be whole cents.',
    cooldown: 'That address was just used. Try again shortly.',
    in_flight: 'You already have a withdrawal in progress. Wait for it to settle.'
  };

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null; balEl = null;
    document.body.classList.remove('wd-open');
    setTimeout(function(){ document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 0);
    setTimeout(function(){ document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 80);
    document.removeEventListener('keydown', onKey);
    window.dispatchEvent(new Event('pageshow'));
  }

  function loadBal() {
    return fetch('/wallet/balance', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        bal = j.balance || '0';
        var n = Number(bal) / 1e6;
        if (balEl) balEl.textContent = n > 0 ? money(bal) + ' available to withdraw' : 'No available balance right now';
        var all = document.getElementById('wAll');
        if (all) all.disabled = !(n >= 10);
        return j;
      })
      .catch(function () { return null; });
  }

  function submit(btn) {
    var address = document.getElementById('wAddr').value.trim();
    var asset = document.getElementById('wAsset').value;
    var usd = document.getElementById('wUsd').value;
    if (!address) return wmsg('Enter a destination address.', 'err');
    if (!usd) return wmsg('Enter an amount.', 'err');
    btn.disabled = true;
    wmsg('', '');
    fetch('/wallet/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ asset: asset, address: address, usd: String(Math.round(Number(usd) * 1e6)) })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { wmsg(errors[res.j.error] || res.j.error || 'Withdrawal failed.', 'err'); return; }
        wmsg(res.j.status === 'approved' ? 'Approved. Sending now.' : 'Requested. Awaiting approval.', 'ok');
        document.getElementById('wUsd').value = '';
        document.getElementById('feeLine').textContent = '5% withdrawal fee';
        window.dispatchEvent(new Event('pageshow'));
        loadBal();
      })
      .catch(function () { wmsg('Network error. Try again.', 'err') })
      .finally(function () { btn.disabled = false; });
  }

  function wire() {
    var usd = document.getElementById('wUsd');
    var addr = document.getElementById('wAddr');
    var all = document.getElementById('wAll');
    var sub = document.getElementById('wSubmit');

    if (usd) usd.addEventListener('input', function () {
      var v = Math.round(Number(this.value) * 1e6);
      var line = document.getElementById('feeLine');
      if (!v || v <= 0) { line.textContent = '5% withdrawal fee'; return; }
      var f = Math.floor(v * 500 / 10000);
      line.textContent = '5% fee (' + money(f) + ') - you receive ' + money(v - f);
    });

    if (addr) addr.addEventListener('blur', function () {
      var a = this.value.trim();
      var cap = document.getElementById('capLine');
      if (!a) { cap.textContent = ''; return; }
      fetch('/wallet/cap?address=' + encodeURIComponent(a), { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.cap != null) cap.textContent = 'Cap for this address: ' + money(j.cap); })
        .catch(function () {});
    });

    if (all) all.addEventListener('click', function () {
      if (Number(bal) > 0 && usd) { usd.value = exact(bal); usd.dispatchEvent(new Event('input')); }
    });

    if (sub) sub.addEventListener('click', function () { submit(sub); });
  }

  function build() {
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

    var card = el('div', 'wd-card');
    card.innerHTML = '<p class="hint">$10 minimum. Anything under $10 stays until it reaches $10. New addresses are capped.</p>'
      + '<div class="msg" id="wMsg"></div>'
      + '<div class="field"><label for="wAddr">Destination address</label><input id="wAddr" type="text" placeholder="Solana address" spellcheck="false" autocomplete="off"></div>'
      + '<div class="field"><label for="wAsset">Asset</label><select id="wAsset"><option value="SOL">SOL</option><option value="USDC">USDC</option></select></div>'
      + '<div class="field"><label for="wUsd">Amount (USD)</label><input id="wUsd" type="number" min="10" step="0.01" placeholder="10.00"></div>'
      + '<div class="row"><button class="btn p" id="wSubmit" type="button">Request withdrawal</button><button class="btn" id="wAll" type="button">Withdraw all</button></div>'
      + '<p class="hint" id="capLine"></p>'
      + '<p class="hint" id="feeLine">5% withdrawal fee</p>';
    sheet.appendChild(card);

    var foot = el('div', 'wd-foot');
    foot.textContent = '\u26a0 Payouts leave on Solana. Double-check the destination address \u2014 sends are final.';
    sheet.appendChild(foot);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.body.classList.add('wd-open');
    document.addEventListener('keydown', onKey);

    wire();
  }

  function rewards() {
    var addr = document.getElementById('wAddr');
    var mine = (addr && addr.value.trim()) || ((document.getElementById('addr') || {}).textContent || '').trim();
    if (!mine) { open(); return; }
    fetch('/wallet/balance', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var rw = (j && j.rewards) || '0';
        if (!(Number(rw) > 0)) { open(); return; } var b0 = document.getElementById('rwOut'); if (b0) b0.disabled = true;
        return fetch('/wallet/withdraw', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ asset: 'USDC', address: mine, usd: rw, source: 'rewards' })
        })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (x) { return { ok: r.ok, j: x }; }); })
          .then(function (res) {
            var note = document.getElementById('heldNote');
            var btn = document.getElementById('rwOut');
            if (btn) { btn.textContent = res.ok ? 'Queued' : 'Try again'; setTimeout(function () { btn.textContent = 'Claim Referral Rewards'; }, 2500); }
            if (note) note.textContent = res.ok ? 'Referral rewards withdrawal queued, awaiting payout.' : (res.j.error || 'failed');
            window.dispatchEvent(new Event('pageshow'));
          });
      })
      .catch(function () {});
  }

  function open() {
    if (overlay) return;
    build();
    loadBal();
    setTimeout(function () { var a = document.getElementById('wAddr'); if (a) { a.focus({ preventScroll: true }); } var s = document.querySelector('.wd-sheet'); if (s) s.scrollTop = 0; }, 60);
  }

  window.openWithdraw = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-withdraw], [data-goto="p-withdraw"], a[href="#withdraw"], #rwOut');
    if (!t) return;
    e.preventDefault();
    if (t.id === 'rwOut') rewards();
    else open();
  });

  if (location.hash === '#withdraw') open();
})();