(function () {
  var panel = document.getElementById('p-stake');
  if (!panel) return;

  var MIN = 10n * 1000000n;
  var amt = document.getElementById('stAmt');
  var cta = document.getElementById('stCta');
  var proj = document.getElementById('stProj');
  var note = document.getElementById('stProjNote');
  var balEl = document.getElementById('stBal');

  var avail = 0n, rateBp = 100, day = null, results = {}, msg = '';

  function usd(v) { return '$' + (Number(v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function micro() {
    var n = Number(String(amt.value).replace(/[^0-9.]/g, ''));
    return isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) : 0n;
  }
  function say(t, bad) { msg = t; cta.textContent = t; cta.dataset.bad = bad ? '1' : ''; }

  function paint() {
    var a = micro();
    if (rateBp) {
      var lo = (a * BigInt(rateBp)) / 10000n;
      var hi = (a * BigInt(rateBp) * 4n) / 10000n;
      proj.textContent = a ? usd(lo) + ' \u2013 ' + usd(hi) : '\u2013';
      note.textContent = 'before the 15% fee';
    }
    if (msg) { cta.textContent = msg; return; }
    if (a === 0n) return say('Enter an amount', true);
    if (a < MIN) return say('Minimum ' + usd(MIN), true);
    if (a > avail) return say('More than your available balance', true);
    say('Lock ' + usd(a) + ' for 30 days', false);
  }

  async function loadBalance() {
    try {
      var b = await fetch('/wallet/balance', { cache: 'no-store' }).then(function (r) { return r.json(); });
      avail = BigInt(b.balance || '0');
      rateBp = Number(b.lastRateBp || 100);
      balEl.textContent = usd(avail);
      paint();
    } catch (_) {}
  }

  async function loadResults(before) {
    try {
      var q = before ? '?limit=1&before=' + before : '?limit=30';
      var j = await fetch('/results' + q, { cache: 'no-store' }).then(function (r) { return r.json(); });
      results = {};
      (j.days || []).forEach(function (d) { results[d.day] = d; });
      if (!day) day = j.today;
      show(day);
    } catch (_) {}
  }

  function show(d) {
    var r = results[d];
    var el = document.getElementById('stDate');
    el.textContent = d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Today';
    var v = document.getElementById('stRate');
    if (!r) { v.textContent = '\u2013'; v.className = 'st-today-v'; return; }
    var pct = r.rate_bp / 100;
    v.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    v.className = 'st-today-v' + (pct < 0 ? ' dn' : '');
  }

  document.getElementById('stMax').addEventListener('click', function () { amt.value = (Number(avail) / 1e6).toString(); paint(); });
  document.getElementById('stHalf').addEventListener('click', function () { amt.value = (Number(avail) / 2e6).toString(); paint(); });
  document.getElementById('stPct').addEventListener('click', function () {
    var p = Number(prompt('Percent of available', '10'));
    if (!isFinite(p) || p <= 0) return;
    amt.value = (Number(avail) * Math.min(p, 100) / 100 / 1e6).toString();
    paint();
  });

  panel.querySelectorAll('[data-amt]').forEach(function (b) {
    b.addEventListener('click', function () { amt.value = b.dataset.amt; paint(); });
  });

  amt.addEventListener('input', function () { msg = ''; paint(); });

  document.getElementById('stPrev').addEventListener('click', function () {
    var keys = Object.keys(results).sort().reverse();
    var i = keys.indexOf(day);
    if (i >= 0 && keys[i + 1]) { day = keys[i + 1]; show(day); }
  });
  document.getElementById('stNext').addEventListener('click', function () {
    var keys = Object.keys(results).sort().reverse();
    var i = keys.indexOf(day);
    if (i > 0) { day = keys[i - 1]; show(day); }
  });

  cta.addEventListener('click', async function () {
    var a = micro();
    if (a < MIN || a > avail) return;
    cta.disabled = true;
    try {
      var r = await fetch('/wallet/stakes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usd: a.toString() }) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || 'failed');
      amt.value = ''; msg = '';
      say('Locked for 30 days', false);
      await loadBalance();
    } catch (e) {
      say(e.message === 'insufficient' ? 'More than your available balance' : e.message, true);
    } finally { cta.disabled = false; }
  });

  /* --- calculator --- */
  var cAmt = document.getElementById('scAmount');
  var cRng = document.getElementById('scRange');
  function calc() {
    var a = Math.min(250000, Math.max(10, Number(cAmt.value) || 10));
    var r = rateBp / 10000, rn = r * 0.85, bal = a, net = 0;
    cRng.style.setProperty('--p', ((a - 10) / 249990 * 100).toFixed(2) + '%');
    for (var i = 1; i <= 30; i++) { var n = bal * rn; net += n; bal += n; }
    var f = function (v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    document.getElementById('scFirst').textContent = f(a * rn);
    document.getElementById('scNet').textContent = f(net);
    document.getElementById('scTotal').textContent = f(bal);
    document.getElementById('scBal').textContent = f(bal);
    document.getElementById('scGross').textContent = f(net / 0.85);
    document.getElementById('scFee').textContent = f(net / 0.85 - net);
  }
  if (cAmt && cRng) {
    cAmt.addEventListener('input', function () { cRng.value = cAmt.value; calc(); });
    cRng.addEventListener('input', function () { cAmt.value = cRng.value; calc(); });
    panel.querySelectorAll('[data-val]').forEach(function (b) {
      b.addEventListener('click', function () { cAmt.value = b.dataset.val; cRng.value = b.dataset.val; calc(); });
    });
  }

  loadBalance();
  loadResults();
  if (cAmt) calc();
  setInterval(loadBalance, 30000);
})();

/* --- manage sheet v2 --- */
(function () {
  var rows = [], ov = null, loaded = false;

  function el(id) { return document.getElementById(id); }
  function usd(v) { return '$' + (Number(v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function sum() { return rows.reduce(function (n, d) { return n + Number(d.usd_at_det || 0); }, 0); }

  function gap(iso) {
    var ms = new Date(iso).getTime() - Date.now();
    if (!isFinite(ms) || ms <= 0) return 'any moment';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d) return d + 'd ' + (h % 24) + 'h';
    if (h) return h + 'h ' + (m % 60) + 'm';
    return m + 'm';
  }

  function paintBar() {
    var h = el('stHave'), n = el('stNextUnlock');
    if (h) h.textContent = usd(sum());
    if (n) {
      var soonest = null;
      rows.forEach(function (d) {
        var t = new Date(d.unlock_at).getTime();
        if (isFinite(t) && (!soonest || t < soonest)) soonest = t;
      });
      n.textContent = soonest ? 'Next unlock in ' + gap(new Date(soonest).toISOString()) : 'No active stakes';
    }
  }

  function paintSheet() {
    if (!ov) return;
    var body = ov.querySelector('.sm-body');
    if (!body) return;
    body.innerHTML = '<div class="sm-tot"><span>Total staked</span><b>' + usd(sum()) + '</b></div>';
    if (!rows.length) {
      body.insertAdjacentHTML('beforeend', '<div class="sm-empty">'
        + (loaded ? 'Nothing is locked right now. Lock $10 or more to start a stake.' : 'Loading stakes...')
        + '</div>');
      return;
    }
    rows.forEach(function (d) {
      body.insertAdjacentHTML('beforeend',
        '<div class="sm-item"><i class="sm-dot"></i><div><b>' + usd(d.usd_at_det) + '</b>'
        + '<span>' + String(d.asset || 'USDC') + ' \u00b7 locked 30 days</span></div>'
        + '<i>Unlocks in ' + gap(d.unlock_at) + '</i></div>');
    });
  }

  function loadStaked() {
    fetch('/wallet/deposits', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (d) {
        var all = Array.isArray(d) ? d : (d.deposits || d.rows || []);
        rows = all.filter(function (x) { return x && x.status === 'locked'; });
        loaded = true;
      })
      .catch(function () {})
      .then(function () { paintBar(); if (ov) paintSheet(); });
  }

  function close() {
    if (!ov) return;
    ov.remove();
    ov = null;
  }

  function openSheet() {
    ov = document.createElement('div');
    ov.className = 'sm-overlay';
    ov.innerHTML = '<div class="sm-sheet" role="dialog" aria-modal="true" aria-label="Active stakes">'
      + '<div class="sm-head"><div class="sm-ico">&#9679;</div><h3>Active stakes</h3>'
      + '<button class="sm-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="sm-body"></div>'
      + '<p class="sm-foot">Each stake is locked for 30 days. Credit lands in Available as it vests.</p></div>';
    document.body.appendChild(ov);
    ov.querySelector('.sm-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    paintSheet();
    loadStaked();
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#stManage') : null;
    if (!t) return;
    e.preventDefault();
    if (ov) close(); else openSheet();
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadStaked);
  else loadStaked();
  setInterval(loadStaked, 60000);
})();
