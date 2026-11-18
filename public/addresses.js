(function () {
  var overlay = null, listEl = null, loaded = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function money(m) {
    return '\u0024' + (Number(m) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function when(iso) {
    if (!iso) return '\u2014';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function rel(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return '';
    var n = Math.round(ms / 86400000);
    if (n >= 1) return n + 'd ago';
    n = Math.round(ms / 3600000);
    if (n >= 1) return n + 'h ago';
    n = Math.round(ms / 60000);
    return (n < 1 ? 'just now' : n + 'm ago');
  }

  function short(a) {
    return a.length > 16 ? a.slice(0, 6) + '\u2026' + a.slice(-6) : a;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null; listEl = null; loaded = false;
    document.body.classList.remove('ad-open');
    document.removeEventListener('keydown', onKey);
  }

  function copy(a, btn) {
    var done = function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(a).then(done).catch(function () {});
    } else {
      var t = document.createElement('textarea');
      t.value = a;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); done(); } catch (_) {}
      t.remove();
    }
  }

  function use(a) {
    close();
    if (!window.openWithdraw) return;
    window.openWithdraw();
    setTimeout(function () {
      var f = document.getElementById('wAddr');
      if (!f) return;
      f.value = a;
      f.dispatchEvent(new Event('blur'));
    }, 140);
  }

  function setStat(id, v, sub) {
    var b = document.getElementById(id);
    if (!b) return;
    b.textContent = v;
    var i = b.parentElement.querySelector('i');
    if (i) i.textContent = sub;
  }

  function render(rows) {
    if (!loaded || !listEl) return;
    if (!rows.length) {
      listEl.innerHTML = '<li class="empty">No saved addresses yet. They appear here after your first withdrawal.</li>';
      setStat('adCount', '0', 'addresses');
      setStat('adTotal', money(0), 'withdrawn');
      setStat('adLast', '\u2014', 'last used');
      return;
    }
    var total = 0, last = null;
    var html = rows.map(function (r) {
      total += Number(r.total);
      if (!last || r.last > last) last = r.last;
      var cls = r.failed ? ' bad' : '';
      return '<li><div class="ad-main"><code>' + r.address + '</code>'
        + '<span class="ad-meta">' + r.count + (r.count === 1 ? ' withdrawal' : ' withdrawals') + ' \u00b7 ' + money(r.total) + ' sent</span>'
        + '<span class="ad-meta">first used ' + when(r.first) + '</span>'
        + '<span class="ad-meta">last used ' + when(r.last) + ' \u00b7 ' + rel(r.last) + '</span>'
        + '<span class="ad-cap' + cls + '" data-cap="' + r.address + '">cap \u2026</span>'
        + '</div><div class="ad-side">'
        + '<button class="btn line ad-act" data-copy="' + r.address + '" type="button">Copy</button>'
        + '<button class="btn line ad-act" data-use="' + r.address + '" type="button">Use</button>'
        + '</div></li>';
    }).join('');
    listEl.innerHTML = html;

    setStat('adCount', String(rows.length), rows.length === 1 ? 'address' : 'addresses');
    setStat('adTotal', money(total), 'withdrawn');
    setStat('adLast', last ? rel(last) : '\u2014', 'last used');

    rows.slice(0, 20).forEach(function (r) {
      fetch('/wallet/cap?address=' + encodeURIComponent(r.address), { credentials: 'same-origin' })
        .then(function (x) { return x.ok ? x.json() : null; })
        .then(function (j) {
          var n = listEl.querySelector('[data-cap="' + r.address + '"]');
          if (!n || !j || j.cap == null) return;
          n.textContent = 'cap ' + money(j.cap);
        })
        .catch(function () {});
    });
  }

  function load() {
    if (listEl) listEl.innerHTML = '<li class="empty">Loading\u2026</li>';
    fetch('/wallet/withdrawals', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) {
        var map = {};
        (j.withdrawals || []).forEach(function (w) {
          if (!w.address) return;
          var e = map[w.address] || (map[w.address] = { address: w.address, count: 0, total: 0, first: w.created_at, last: w.created_at, failed: false });
          e.count += 1;
          e.total += Number(w.usd_amount || 0);
          if (w.created_at < e.first) e.first = w.created_at;
          if (w.created_at > e.last) e.last = w.created_at;
          if (w.status === 'failed' || w.status === 'cancelled') e.failed = true;
        });
        var rows = Object.keys(map).map(function (k) { return map[k]; });
        rows.sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
        loaded = true;
        render(rows);
      })
      .catch(function () {
        loaded = true;
        if (listEl) listEl.innerHTML = '<li class="empty">Could not load addresses.</li>';
      });
  }

  function build() {
    overlay = el('div', 'ad-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'ad-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Saved addresses');

    var head = el('div', 'ad-head');
    head.appendChild(el('div', 'ad-ico', '\u25c9'));
    head.appendChild(el('h3', null, 'Saved addresses'));
    var x = el('button', 'ad-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    var stats = el('div', 'ad-stats');
    stats.innerHTML = '<div class="ad-stat"><span>Saved</span><b id="adCount">\u2014</b><i></i></div>'
      + '<div class="ad-stat"><span>Withdrawn</span><b id="adTotal">\u2014</b><i></i></div>'
      + '<div class="ad-stat"><span>Recent</span><b id="adLast">\u2014</b><i></i></div>';
    sheet.appendChild(stats);

    listEl = el('ul', 'ad-list');
    listEl.addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy]');
      if (c) return copy(c.dataset.copy, c);
      var u = e.target.closest('[data-use]');
      if (u) use(u.dataset.use);
    });
    sheet.appendChild(listEl);

    var foot = el('div', 'ad-foot', 'Every address you have withdrawn to. New addresses start on a lower cap until they have history \u2014 caps rise as you use them.');
    sheet.appendChild(foot);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('ad-open');
    document.addEventListener('keydown', onKey);
  }

  function open() {
    if (overlay) return;
    build();
    load();
  }

  window.openAddresses = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto="p-addresses"], a[href="#addresses"]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  if (location.hash === '#addresses') open();
})();