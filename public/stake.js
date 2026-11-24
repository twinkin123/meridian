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
    cta.disabled = false; say('Lock ' + usd(a) + ' for 30 days', false);
  }

  async function loadBalance() {
    try {
      var b = await fetch('/wallet/balance', { cache: 'no-store' }).then(function (r) { return r.json(); });
      avail = BigInt(b.balance || '0');
      rateBp = Number(b.lastRateBp || 100);
      balEl.textContent = usd(avail);
      paint();
      calc();
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
    if (el) el.textContent = d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Today';
    var v = document.getElementById('stRate');
    if (!v) return;
    if (!r) { v.textContent = '\u2013'; v.className = 'st-today-v'; return; }
    var pct = r.rate_bp / 100;
    v.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    v.className = 'st-today-v' + (pct < 0 ? ' dn' : '');
  }

  document.getElementById('stMax').addEventListener('click', function () { amt.value = (Number(avail) / 1e6).toString(); msg = ''; paint(); });
  document.getElementById('stHalf').addEventListener('click', function () { amt.value = (Number(avail) / 2e6).toString(); msg = ''; paint(); });
  var stPct = document.getElementById('stPct');
  if (stPct) stPct.addEventListener('click', function () {
    var p = Number(prompt('Percent of available', '10'));
    if (!isFinite(p) || p <= 0) return;
    amt.value = (Number(avail) * Math.min(p, 100) / 100 / 1e6).toString();
    msg = ''; paint();
  });

  panel.querySelectorAll('[data-amt]').forEach(function (b) {
    b.addEventListener('click', function () { amt.value = b.dataset.amt; msg = ''; paint(); });
  });

  amt.addEventListener('input', function () { msg = ''; paint(); });

  document.getElementById('stPrev').addEventListener('click', function () {
    var keys = Object.keys(results).sort().reverse(), i = keys.indexOf(day);
    if (i >= 0 && keys[i + 1]) { day = keys[i + 1]; show(day); }
  });
  document.getElementById('stNext').addEventListener('click', function () {
    var keys = Object.keys(results).sort().reverse(), i = keys.indexOf(day);
    if (i > 0) { day = keys[i - 1]; show(day); }
  });

  var ov = null;
  function onEsc(e) { if (e.key === 'Escape') closeConfirm(); }

  function closeConfirm() {
    if (!ov) return;
    ov.remove(); ov = null;
    document.body.classList.remove('dep-open');
    document.removeEventListener('keydown', onEsc);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function rowHtml(k, v) {
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line2);font-size:13px">'
      + '<span style="color:var(--mut)">' + k + '</span>'
      + '<b style="font-variant-numeric:tabular-nums">' + v + '</b></div>';
  }

  function openConfirm(a) {
    if (ov) return;
    var bp = BigInt(rateBp || 100);
    var gross = (a * bp * 30n) / 10000n;
    var net = (gross * 8500n) / 10000n;
    var unl = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,6,9,.72);backdrop-filter:blur(6px)';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="cfTitle" style="width:100%;max-width:380px;background:var(--panel);border:1px solid var(--line2);border-radius:18px;padding:18px;color:var(--txt);box-shadow:0 24px 70px rgba(0,0,0,.6)">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
      + '<h3 id="cfTitle" style="margin:0;font-size:16px;font-weight:600">Confirm stake</h3>'
      + '<button type="button" data-x style="margin-left:auto;background:none;border:0;color:var(--mut);font-size:19px;line-height:1;cursor:pointer">&times;</button></div>'
      + '<p style="margin:0 0 12px;color:var(--mut);font-size:12px">At the current rate of ' + (Number(rateBp || 100) / 100).toFixed(2) + '% per day.</p>'
      + rowHtml('Amount', usd(a))
      + rowHtml('Term', '30 days')
      + rowHtml('Unlocks', unl)
      + rowHtml('Projected credit', usd(gross))
      + rowHtml('After 15% fee', usd(net))
      + '<p style="margin:12px 0 14px;font-size:11.5px;color:var(--mut);line-height:1.5">Locked for the full term. Credit vests in four 6-hour slices and is withdrawable as it lands.</p>'
      + '<div style="display:flex;gap:10px">'
      + '<button type="button" data-x style="flex:1;background:none;border:1px solid var(--line2);border-radius:12px;padding:11px;color:var(--txt);font:inherit;cursor:pointer">Cancel</button>'
      + '<button type="button" data-ok style="flex:1;background:var(--pur);border:0;border-radius:12px;padding:11px;color:#fff;font:inherit;font-weight:600;cursor:pointer">Confirm lock</button>'
      + '</div></div>';

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) return closeConfirm();
      if (e.target.closest('[data-ok]')) return submit(a);
    });

    document.body.appendChild(ov);
    document.body.classList.add('dep-open');
    document.addEventListener('keydown', onEsc);
  }

  async function submit(a) {
    var btn = ov && ov.querySelector('[data-ok]');
    if (btn) { btn.disabled = true; btn.textContent = 'Locking\u2026'; }
    try {
      var r = await fetch('/wallet/stakes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usd: a.toString() }) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || 'failed');
      closeConfirm();
      amt.value = ''; msg = '';
      say('Locked for 30 days', false);
      await loadBalance();
    } catch (e) {
      closeConfirm();
      say(e.message === 'insufficient' ? 'More than your available balance' : e.message, true);
    } finally { cta.disabled = false; }
  }

  cta.addEventListener('click', function () {
    var a = micro();
    if (a < MIN || a > avail) return;
    openConfirm(a);
  });

  /* --- calculator: same maths as the dashboard --- */
  var cAmt = document.getElementById('scAmount');
  var cRng = document.getElementById('scRange');
  var scSw = document.getElementById('scSw');

  function out(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }

  function calc() {
    if (!cAmt || !cRng) return;
    var a = Math.min(250000, Math.max(10, Number(cAmt.value) || 10));
    var comp = scSw ? scSw.classList.contains('on') : true;
    var r = (rateBp || 100) / 10000;
    var rn = r * 0.85;
    cRng.style.setProperty('--p', ((a - 10) / 249990 * 100).toFixed(2) + '%');

    var bal = a, simple = a, gross = 0, net = 0, p1 = [], p2 = [];
    for (var i = 1; i <= 30; i++) {
      var g = bal * r;
      var n = g * 0.85;
      gross += g;
      net += n;
      if (comp) bal += n;
      simple += a * rn;
      var x = 8 + (i / 30) * 584;
      p1.push([x, bal]);
      p2.push([x, simple]);
    }

    var span = (Math.max(bal, simple) - a) || 1;
    function y(v) { return (92 - ((v - a) / span) * 78).toFixed(1); }
    function f(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    out('scFirst', f(a * rn));
    out('scNet', f(net));
    out('scNet2', f(net));
    out('scTotal', f(bal));
    out('scBal', f(bal));
    out('scGross', f(gross));
    out('scFee', f(gross - net));

    var lc = document.getElementById('scLineC');
    var ls = document.getElementById('scLineS');
    if (lc) lc.setAttribute('points', p1.map(function (p) { return p[0] + ',' + y(p[1]); }).join(' '));
    if (ls) ls.setAttribute('points', p2.map(function (p) { return p[0] + ',' + y(p[1]); }).join(' '));
  }

  if (scSw) scSw.addEventListener('click', function () {
    scSw.classList.toggle('on');
    scSw.setAttribute('aria-pressed', scSw.classList.contains('on') ? 'true' : 'false');
    calc();
  });

  if (cAmt && cRng) {
    cAmt.addEventListener('input', function () { cRng.value = cAmt.value; calc(); });
    cRng.addEventListener('input', function () { cAmt.value = cRng.value; calc(); });
    panel.querySelectorAll('[data-val]').forEach(function (b) {
      b.addEventListener('click', function () { cAmt.value = b.dataset.val; cRng.value = b.dataset.val; calc(); });
    });
  }

  loadBalance();
  loadResults();
  calc();
  setInterval(loadBalance, 30000);
})();

/* --- manage sheet --- */
(function () {
  var rows = [];

  function usd(v) { return '$' + (Number(v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function dur(ms) {
    if (!isFinite(ms)) return '-';
    if (ms <= 0) return 'now';
    var h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
    if (d > 0) return d + 'd ' + (h % 24) + 'h';
    var m = Math.max(1, Math.floor(ms / 60000));
    return m >= 60 ? h + 'h ' + (m % 60) + 'm' : m + 'm';
  }

  function paintBar() {
    var h = document.getElementById('stHave'), n = document.getElementById('stNextUnlock');
    var locked = rows.filter(function (d) { return d.status === 'locked'; });
    if (h) h.textContent = usd(locked.reduce(function (a, d) { return a + Number(d.usd_at_det || 0); }, 0));
    if (n) {
      var soonest = null;
      locked.forEach(function (d) {
        var t = new Date(d.unlock_at).getTime();
        if (isFinite(t) && t > Date.now() && (!soonest || t < soonest)) soonest = t;
      });
      n.textContent = soonest ? 'Next unlock in ' + dur(soonest - Date.now()) : 'No active stakes';
    }
  }

  function row(d) {
    var now = Date.now();
    var unl = d.unlock_at ? new Date(d.unlock_at).getTime() : 0;
    var cls = 'st', label, btn = '';
    if (d.status === 'held') { label = 'In reserve'; }
    else if (d.claim_requested_at) { cls += ' pend'; label = 'Awaiting review'; btn = '<button class="sx" type="button" data-cancel="' + d.id + '">Cancel</button>'; }
    else if (d.claim_rejected_at && unl <= now) { cls += ' rej'; label = 'Declined' + (d.claim_reject_reason ? ': ' + esc(d.claim_reject_reason) : ''); btn = '<button class="sx" type="button" data-claim="' + d.id + '">Request again</button>'; }
    else if (unl <= now) { cls += ' ready'; label = 'Ready to unlock'; btn = '<button class="sx" type="button" data-claim="' + d.id + '">Request unlock</button>'; }
    else { label = 'Locked'; }
    return '<tr><td><span class="as">' + esc(d.asset) + '</span></td>'
      + '<td class="amt">' + usd(d.usd_at_det) + '</td>'
      + '<td><span class="' + cls + '">' + label + '</span></td>'
      + '<td class="unl">' + (d.status === 'held' ? '-' : dur(unl - now)) + '</td>'
      + '<td>' + btn + '</td></tr>';
  }

  function paintSheet() {
    var b = document.querySelector('.sm-body');
    if (!b) return;
    b.innerHTML = rows.length ? rows.map(row).join('')
      : '<tr><td colspan="5" class="empty">No active stakes.</td></tr>';
  }

  function loadStaked() {
    fetch('/wallet/deposits', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (d) {
        var all = Array.isArray(d) ? d : (d.deposits || d.rows || []);
        rows = all.filter(function (x) { return x && (x.status === 'held' || x.status === 'locked'); });
      })
      .catch(function () {})
      .then(function () { paintBar(); paintSheet(); });
  }

  var body = document.querySelector('.sm-body');
  if (body) body.addEventListener('click', function (e) {
    var x = e.target.closest('[data-claim]'), n = e.target.closest('[data-cancel]');
    var id = x ? x.dataset.claim : (n ? n.dataset.cancel : null);
    if (!id) return;
    var b = x || n;
    b.disabled = true;
    fetch('/wallet/deposits/' + id + (x ? '/claim' : '/claim/cancel'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .catch(function () {})
      .then(loadStaked);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.body.classList.remove('sm-open');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadStaked);
  else loadStaked();
  setInterval(loadStaked, 60000);
})();
