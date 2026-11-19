(function () {
  var overlay = null, timer = null, addrEl = null, statusEl = null, qrEl = null;
  var warnEl = null, quoteEl = null, selected = null;
  var routes = [], addresses = {}, min = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function close() {
    if (!overlay) return;
    clearInterval(timer);
    overlay.remove();
    overlay = null;
    document.body.classList.remove('dep-open');
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function setStatus(text, ok) {
    if (!statusEl) return;
    statusEl.textContent = '';
    var dot = el('span', 'pulse');
    statusEl.className = 'dep-status' + (ok ? ' ok' : '');
    statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode(text));
  }

  function copy() {
    var a = addrEl.textContent;
    var btn = overlay.querySelector('.dep-copy');
    var done = function () {
      btn.textContent = 'Copied';
      btn.classList.add('done');
      setTimeout(function () { btn.textContent = 'Copy address'; btn.classList.remove('done'); }, 1600);
    };
    if (navigator.clipboard) {
      if (window.isSecureContext) {
        navigator.clipboard.writeText(a).then(done).catch(fallback);
        return;
      }
    }
    fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = a;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      t.remove();
    }
  }

  function familyCopy(f) {
    if (f === 'btc') return 'Only send BTC on Bitcoin. Other assets may be lost.';
    if (f === 'tron') return 'Only send TRX or USDT on Tron to this address.';
    if (f === 'sol') return 'Only send SOL or SPL tokens on Solana to this address.';
    return 'Only send the selected token on its own network. Other networks are not recovered automatically.';
  }

  function applyAddr(fam) {
    var a = addresses[fam];
    if (!a) return;
    addrEl.textContent = a.address;
    qrEl.src = a.qr;
    warnEl.textContent = '\u26a0 ' + familyCopy(fam);
  }

  async function quote() {
    if (!selected) return;
    quoteEl.textContent = '';
    if (selected.family === 'sol') {
      if (selected.asset === 'usdc') {
        quoteEl.textContent = 'Delivered 1:1, no conversion';
        return;
      }
    }
    var usd = min[selected.family] || 15;
    var rate = Number(selected.rate);
    var units = rate > 0 ? usd / rate : usd;
    var parts = [
      'asset=' + encodeURIComponent(selected.asset),
      'chain=' + encodeURIComponent(selected.chain),
      'amount=' + Math.max(units, 0.000001).toFixed(6)
    ];
    try {
      var r = await fetch('/wallet/deposits/quote?' + parts.join('&'), { credentials: 'same-origin' });
      if (!r.ok) return;
      var j = await r.json();
      quoteEl.textContent = 'Send \u2248 ' + units.toFixed(6) + ' ' + selected.symbol +
        ', receive \u2248 ' + Number(j.output).toFixed(2) + ' USDC';
    } catch (e) {}
  }

  function pick(route, row) {
    selected = route;
    var list = overlay.querySelector('.dep-list');
    if (list) list.remove();
    var cur = row.querySelector('.dep-cur');
    if (cur) cur.textContent = route.symbol + ' on ' + route.network;
    applyAddr(route.family);
    quote();
  }

  function openList(row) {
    var list = overlay.querySelector('.dep-list');
    if (list) { list.remove(); return; }
    list = el('div', 'dep-list');
    var last = null;
    routes.forEach(function (route) {
      if (route.family !== last) {
        last = route.family;
        var name = route.family === 'sol' ? 'Solana' : route.family === 'tron' ? 'Tron' : route.family === 'btc' ? 'Bitcoin' : 'EVM networks';
        list.appendChild(el('div', 'dep-group', name));
      }
      var b = el('button', 'dep-opt');
      b.type = 'button';
      b.appendChild(el('span', 's', route.symbol));
      b.appendChild(el('span', 'n', route.network));
      b.addEventListener('click', function () { pick(route, row); });
      list.appendChild(b);
    });
    row.insertAdjacentElement('afterend', list);
    list.scrollIntoView({ block: 'nearest' });
  }

  function build() {
    overlay = el('div', 'dep-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'dep-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Deposit');

    var head = el('div', 'dep-head');
    head.appendChild(el('h2', null, 'Deposit'));
    var x = el('button', 'dep-x', '\u00d7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    var row = el('button', 'dep-row');
    row.type = 'button';
    row.appendChild(el('span', 'dep-lbl', 'Asset'));
    row.appendChild(el('span', 'dep-cur', 'Loading\u2026'));
    row.appendChild(el('span', 'dep-chev', '\u203a'));
    row.addEventListener('click', function () { openList(row); });
    sheet.appendChild(row);

    var qr = el('div', 'dep-qr');
    qrEl = el('img');
    qrEl.alt = 'Deposit address QR code';
    qr.appendChild(qrEl);
    sheet.appendChild(qr);

    var line = el('div', 'dep-addr');
    addrEl = el('code', null, 'Loading\u2026');
    var cp = el('button', 'dep-copy', 'Copy address');
    cp.type = 'button';
    cp.addEventListener('click', copy);
    line.appendChild(addrEl);
    line.appendChild(cp);
    sheet.appendChild(line);

    quoteEl = el('div', 'dep-quote');
    sheet.appendChild(quoteEl);

    statusEl = el('div', 'dep-status');
    setStatus('Waiting for your deposit\u2026');
    sheet.appendChild(statusEl);

    warnEl = el('div', 'dep-warn');
    sheet.appendChild(warnEl);

    var safe = el('div', 'dep-safe');
    safe.textContent = '\u26bf Protected by privy \u00b7 routed by Relay';
    sheet.appendChild(safe);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('dep-open');
    document.addEventListener('keydown', onKey);
  }

  async function load() {
    try {
      var r = await fetch('/wallet/deposits/address', { credentials: 'same-origin' });
      if (!r.ok) { setStatus('Could not load your deposit address.'); return; }
      var j = await r.json();
      (j.addresses || []).forEach(function (a) { addresses[a.family] = a; });
    } catch (e) { setStatus('Could not load your deposit address.'); return; }

    try {
      var r2 = await fetch('/wallet/deposits/assets', { credentials: 'same-origin' });
      if (!r2.ok) return;
      var k = await r2.json();
      routes = k.routes || [];
      min = k.min || {};
      routes = routes.filter(function (r5) { return !!addresses[r5.family]; });
      if (!routes.length) { setStatus('No deposit routes are available right now.'); return; }
      var def = null;
      routes.forEach(function (r3) {
        if (!def) {
          if (r3.family === 'sol') {
            if (r3.asset === 'usdc') def = r3;
          }
        }
      });
      if (!def) {
        routes.forEach(function (r4) { if (!def && r4.family === 'sol') def = r4; });
      }
      if (!def) def = routes[0];
      selected = def;
      var cur = overlay.querySelector('.dep-cur');
      if (cur) cur.textContent = def.symbol + ' on ' + def.network;
      applyAddr(def.family);
      quote();
    } catch (e) {}
  }

  function poll() {
    timer = setInterval(async function () {
      try {
        var r = await fetch('/wallet/deposits/address', { credentials: 'same-origin' });
        if (!r.ok) return;
        var j = await r.json();
        var l = j.latest;
        if (!l) return;
        if (l.status === 'detected' || l.status === 'pending' || l.status === 'credited') {
          setStatus('Received ' + Number(l.usd).toFixed(2) + ' USD worth of ' + l.asset + '.', true);
        }
      } catch (e) {}
    }, 8000);
  }

  async function open() {
    if (overlay) return;
    build();
    await load();
    poll();
  }

  window.openDeposit = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-deposit], [data-goto="p-deposit"], a[href="#deposit"]');
    if (t) { e.preventDefault(); open(); }
  });
})();
