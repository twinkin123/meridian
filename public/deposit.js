(function () {
  var overlay = null, timer = null, addrEl = null, statusEl = null, qrEl = null;

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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(a).then(done).catch(fallback);
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = a;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      t.remove();
    }
  }

  function build() {
    overlay = el('div', 'dep-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'dep-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Stake funds');

    var head = el('div', 'dep-head');
    head.appendChild(el('div', 'dep-ico', '\u2193'));
    head.appendChild(el('h3', null, 'Stake funds'));
    var x = el('button', 'dep-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    var row = el('div', 'dep-row');
    row.appendChild(el('span', 'dot'));
    var rt = el('div', 't');
    rt.appendChild(el('b', null, 'Stake USDC or SOL on Solana'));
    rt.appendChild(el('span', null, 'Direct \u00b7 Recommended'));
    row.appendChild(rt);
    row.appendChild(el('span', 'chev', '\u203a'));
    sheet.appendChild(row);

    var qr = el('div', 'dep-qr');
    qrEl = el('img');
    qrEl.alt = 'Deposit address QR code';
    qr.appendChild(qrEl);
    sheet.appendChild(qr);

    var line = el('div', 'dep-addr');
    addrEl = el('code', null, 'Loading\u2026');
    var cp = el('button', 'dep-copy', 'Copy address');
    cp.addEventListener('click', copy);
    line.appendChild(addrEl);
    line.appendChild(cp);
    sheet.appendChild(line);

    statusEl = el('div', 'dep-status');
    setStatus('Waiting for your stake\u2026');
    sheet.appendChild(statusEl);

    var safe = el('div', 'dep-safe');
    safe.textContent = '\u26bf Protected by privy';
    sheet.appendChild(safe);

    var alt = el('div', 'dep-alt');
    var at = el('div', 't');
    at.appendChild(el('b', null, 'Stake another token or network'));
    at.appendChild(el('span', null, 'Same address, any SPL token'));
    alt.appendChild(at);
    alt.appendChild(el('span', 'chev', '\u203a'));
    sheet.appendChild(alt);

    var more = el('details', 'dep-more');
    more.appendChild(el('summary', null, 'Fees, minimum and what to send'));
    var ol = el('ol');
    ['Send USDC or SOL on Solana only',
     'Minimum $10 \u2014 smaller amounts are held',
     'Wait for confirmation before closing'].forEach(function (t) {
      ol.appendChild(el('li', null, t));
    });
    more.appendChild(ol);
    sheet.appendChild(more);

    var warn = el('div', 'dep-warn');
    warn.textContent = '\u26a0 Only send on Solana. Other networks are not recovered automatically.';
    sheet.appendChild(warn);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('dep-open');
    document.addEventListener('keydown', onKey);
  }

  async function load() {
    try {
      var r = await fetch('/wallet/deposit', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('http ' + r.status);
      var j = await r.json();
      if (!j.address) throw new Error('no address');
      addrEl.textContent = j.address;
      qrEl.src = j.qr;
      if (j.latest && ['held','locked','credited'].indexOf(j.latest.status) !== -1) setStatus('Stake received', true);
    } catch (e) {
      addrEl.textContent = 'Unavailable';
      setStatus('Could not load address');
    }
  }

  function poll() {
    timer = setInterval(async function () {
      try {
        var r = await fetch('/wallet/deposit', { credentials: 'same-origin' });
        if (!r.ok) return;
        var j = await r.json();
      if (!j.address) throw new Error('no address');
        if (j.latest && ['held','locked','credited'].indexOf(j.latest.status) !== -1) {
          setStatus('Stake received', true);
          clearInterval(timer);
        }
      } catch (e) {}
    }, 4000);
  }

  function open() {
    if (overlay) return;
    build();
    load();
    poll();
  }

  window.openDeposit = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-deposit], [data-goto="p-deposit"], a[href="#deposit"]');
    if (t) { e.preventDefault(); open(); }
  });
})();