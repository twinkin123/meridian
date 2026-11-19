(function () {
  var overlay = null, listEl = null, tabsEl = null, loaded = false, tab = 'deposits';
  var data = { deposits: [], settlements: [], withdrawals: [] };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function money(m) {
    return '\u0024' + (Number(m) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function when(iso) {
    if (!iso) return '\u2014';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function rel(iso) {
    if (!iso) return '';
    var ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms)) return '';
    var abs = Math.abs(ms), n = Math.round(abs / 60000), u = 'm';
    if (n >= 1440) { n = Math.round(abs / 86400000); u = 'd'; }
    else if (n >= 60) { n = Math.round(abs / 3600000); u = 'h'; }
    if (!n) return ms >= 0 ? 'moments' : 'just now';
    return (ms >= 0 ? 'in ' : '') + n + u + (ms < 0 ? ' ago' : '');
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null; listEl = null; tabsEl = null; loaded = false;
    document.body.classList.remove('hs-open');
    document.removeEventListener('keydown', onKey);
    window.dispatchEvent(new Event('pageshow'));
  }

  function setStat(id, v, sub) {
    var b = document.getElementById(id);
    if (!b) return;
    b.textContent = v;
    var i = b.parentElement.querySelector('i');
    if (i) i.textContent = sub;
  }

  function totals() {
    function sum(rows, k) { return rows.reduce(function (a, r) { return a + Number(r[k] || 0); }, 0); }
    setStat('hsDep', money(sum(data.deposits, 'usd_at_det')), data.deposits.length + ' total');
    setStat('hsSet', money(sum(data.settlements, 'amount')), data.settlements.length + ' slices');
    setStat('hsWd', money(data.withdrawals.reduce(function (a, x) { return a + Number(x.usd_amount || 0) + Number(x.fee || 0); }, 0)), data.withdrawals.length + ' requests');
  }

  function depRow(d) {
    var side, cls = '';
    var held = d.status === 'held';
    if (d.released_at) { side = '<span class="pill ok">released</span>'; cls = 'hs-done'; }
    else if (held) side = '<span class="pill">in reserve</span>';
    else if (d.claim_requested_at) side = '<span class="pill">awaiting approval</span><button class="btn line hs-act" data-claim-cancel="' + esc(d.id) + '" type="button">Cancel</button>';
    else if (d.unlock_at && new Date(d.unlock_at) <= new Date()) side = '<button class="btn line hs-act" data-claim="' + esc(d.id) + '" type="button">Request release</button>';
    else side = '<span class="pill">staked</span>';
    return '<li class="' + cls + '"><div class="hs-main">'
      + '<b>' + money(d.usd_at_det) + '</b><span class="hs-asset">' + esc(d.asset) + '</span>'
      + '<span class="hs-meta">detected ' + when(d.created_at || d.detected_at) + '</span>'
      + (held ? '<span class="hs-meta">in reserve \u00b7 stakes for 30 days once reserve reaches $10</span>' : '<span class="hs-meta">unlocks ' + when(d.unlock_at) + ' \u00b7 ' + rel(d.unlock_at) + '</span>')
      + (d.claim_requested_at ? '<span class="hs-meta">release requested ' + when(d.claim_requested_at) + '</span>' : '')
      + (d.released_at ? '<span class="hs-meta">released ' + when(d.released_at) + '</span>' : '')
      + '</div><div class="hs-side">' + side + '</div></li>';
  }

  function setRow(s) {
    var done = !!s.released_at;
    return '<li class="' + (done ? 'hs-done' : '') + '"><div class="hs-main">'
      + '<b>' + money(s.amount) + '</b>'
      + '<span class="hs-meta">' + (done ? 'released ' + when(s.released_at) : 'due ' + when(s.due_at) + ' \u00b7 ' + rel(s.due_at)) + '</span>'
      + '</div><div class="hs-side"><span class="pill ' + (done ? 'ok' : '') + '">' + (done ? 'released' : 'pending') + '</span></div></li>';
  }

  function wdRow(w) {
    var cls = w.status === 'paid' ? 'ok' : (w.status === 'failed' || w.status === 'cancelled') ? 'bad' : '';
    var fee = Number(w.fee || 0);
    var net = Number(w.usd_amount || 0);
    var gross = net + fee;
    return '<li><div class="hs-main">'
      + '<b>' + money(gross) + '</b><span class="hs-asset">' + esc(w.asset) + '</span>'
      + (fee > 0 ? '<span class="hs-meta">fee ' + money(fee) + ' \u00b7 net ' + money(net) + '</span>' : '')
      + '<span class="hs-meta hs-addr">' + esc(w.address) + '</span>'
      + '<span class="hs-meta">requested ' + when(w.created_at) + ' \u00b7 ' + rel(w.created_at) + '</span>'
      + (w.sent_at ? '<span class="hs-meta">sent ' + when(w.sent_at) + '</span>' : '')
      + (w.tx_sig ? '<span class="hs-meta hs-sig">' + esc(w.tx_sig) + '</span>' : '')
      + '</div><div class="hs-side"><span class="pill ' + cls + '">' + esc(w.status) + '</span></div></li>';
  }

  function render() {
    if (tabsEl) tabsEl.querySelectorAll('.hs-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    if (!loaded || !listEl) return;
    var rows = data[tab] || [];
    if (!rows.length) {
      listEl.innerHTML = '<li class="empty">' + (tab === 'deposits' ? 'No stakes yet.' : tab === 'settlements' ? 'No credits yet.' : 'No withdrawals yet.') + '</li>';
      return;
    }
    var fn = tab === 'deposits' ? depRow : tab === 'settlements' ? setRow : wdRow;
    listEl.innerHTML = rows.map(fn).join('');
  }

  function load() {
    if (listEl) listEl.innerHTML = '<li class="empty">Loading\u2026</li>';
    function grab(u, k) {
      return fetch(u, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { return j[k] || []; })
        .catch(function () { return []; });
    }
    Promise.all([
      grab('/wallet/deposits', 'deposits'),
      grab('/wallet/settlements', 'settlements'),
      grab('/wallet/withdrawals', 'withdrawals')
    ]).then(function (res) {
      data.deposits = res[0];
      data.settlements = res[1];
      data.withdrawals = res[2];
      loaded = true;
      totals();
      render();
    });
  }

  function act(url, btn, label) {
    btn.disabled = true;
    btn.textContent = label;
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { btn.textContent = res.j.error || 'failed'; btn.disabled = false; return; }
        load();
      })
      .catch(function () { btn.textContent = 'failed'; btn.disabled = false; });
  }

  function build() {
    overlay = el('div', 'hs-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'hs-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'History');

    var head = el('div', 'hs-head');
    head.appendChild(el('div', 'hs-ico', '\u2261'));
    head.appendChild(el('h3', null, 'History'));
    var x = el('button', 'hs-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    var stats = el('div', 'hs-stats');
    stats.innerHTML = '<div class="hs-stat"><span>Staked</span><b id="hsDep">\u2014</b><i></i></div>'
      + '<div class="hs-stat"><span>Credited</span><b id="hsSet">\u2014</b><i></i></div>'
      + '<div class="hs-stat"><span>Withdrawn</span><b id="hsWd">\u2014</b><i></i></div>';
    sheet.appendChild(stats);

    tabsEl = el('div', 'hs-tabs');
    [['deposits', 'Stakes'], ['settlements', 'Credited'], ['withdrawals', 'Withdrawals']].forEach(function (t) {
      var b = el('button', 'hs-tab', t[1]);
      b.type = 'button';
      b.dataset.tab = t[0];
      b.addEventListener('click', function () { tab = t[0]; render(); });
      tabsEl.appendChild(b);
    });
    sheet.appendChild(tabsEl);

    listEl = el('ul', 'hs-list');
    listEl.addEventListener('click', function (e) {
      var c = e.target.closest('[data-claim-cancel]');
      if (c) return act('/wallet/deposits/' + c.dataset.claimCancel + '/claim/cancel', c, 'Cancelling\u2026');
      var b = e.target.closest('[data-claim]');
      if (b) act('/wallet/deposits/' + b.dataset.claim + '/claim', b, 'Requesting\u2026');
    });
    sheet.appendChild(listEl);

    var foot = el('div', 'hs-foot', 'Stakes lock for 30 days. A release request is approved by hand, then the balance becomes withdrawable.');
    sheet.appendChild(foot);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('hs-open');
    document.addEventListener('keydown', onKey);
    render();
  }

  function open() {
    if (overlay) return;
    build();
    load();
  }

  window.openHistory = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto="p-history"], a[href="#history"]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  if (location.hash === '#history') open();
})();