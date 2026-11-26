/* ChangeNOW partner exchange panel. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var from = null, to = null, quote = null, timer = 0, poll = 0, order = null, side = null;

  var LABEL = {
    awaiting_deposit: 'Send your deposit',
    confirming: 'Confirming on-chain',
    exchanging: 'Exchanging',
    sending: 'Sending to your wallet',
    verifying: 'Verifying',
    done: 'Complete',
    failed: 'Failed',
    refunded: 'Refunded'
  };

  function fmt(n, dp) {
    var d = dp === undefined ? 8 : dp;
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
  }

  function paint(symEl, icEl, netEl, c) {
    symEl.textContent = c ? c.t.toUpperCase() : 'Select';
    icEl.innerHTML = c && c.i ? '<img src="' + c.i + '" alt="">' : '';
    netEl.textContent = c ? c.t.toUpperCase() + ' on ' + c.net.toUpperCase() : '';
  }

  function reset() {
    quote = null;
    $('swOut').textContent = '0.0';
    $('swRate').textContent = '';
    $('swNote').textContent = '';
    $('swMin').textContent = '';
    $('swCta').disabled = true;
    $('swCta').textContent = 'Enter an amount';
  }

  function ready() {
    return from && to && Number($('swAmt').value) > 0 && $('swAddr').value.trim();
  }

  function arm() {
    if (!ready()) { $('swCta').disabled = true; $('swCta').textContent = 'Enter an amount'; return; }
    if (to.x && !$('swMemo').value.trim()) {
      $('swCta').disabled = true;
      $('swCta').textContent = 'Add the memo / tag';
      return;
    }
    $('swCta').disabled = false;
    $('swCta').textContent = 'Start exchange';
  }

  function quoteNow() {
    clearTimeout(timer);
    var amt = Number($('swAmt').value);
    if (!from || !to || !amt) { reset(); arm(); return; }

    timer = setTimeout(function () {
      fetch('/swap/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: from.t, fromNet: from.net, to: to.t, toNet: to.net, amount: String(amt)
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) {
            quote = null;
            $('swOut').textContent = '0.0';
            $('swNote').textContent = o.j.message || 'Could not price that pair.';
            $('swCta').disabled = true;
            return;
          }
          quote = o.j;
          $('swOut').textContent = fmt(o.j.toAmount);
          $('swRate').textContent = '1 ' + from.t.toUpperCase() + ' \u2248 ' + fmt(o.j.rate, 6) + ' ' + to.t.toUpperCase();
          $('swMin').textContent = 'min ' + o.j.minAmount + ' ' + from.t.toUpperCase();
          $('swNote').textContent = o.j.warning || '';
          arm();
        })
        .catch(function () {});
    }, 400);
  }

  function load(q) {
    fetch('/swap/currencies?direction=' + side + '&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.message) {
          $('swPickList').innerHTML = '<p class="sw-pick-empty">' + j.message + '</p>';
          return;
        }
        var other = side === 'from' ? to : from;
        var list = (j.currencies || []).filter(function (c) {
          return !(other && c.t === other.t && c.net === other.net);
        });
        if (!list.length) {
          $('swPickList').innerHTML = '<p class="sw-pick-empty">No matches.</p>';
          return;
        }
        var out = '';
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          out += '<button type="button" data-t="' + c.t + '" data-net="' + c.net + '" data-x="' + (c.x ? 1 : 0) + '" data-i="' + (c.i || '') + '">' +
            (c.i ? '<img src="' + c.i + '" alt="">' : '') + '<span>' + c.n + '</span><em>' + c.net.toUpperCase() + '</em></button>';
        }
        $('swPickList').innerHTML = out;
      })
      .catch(function () {});
  }

  function openPicker(dir) {
    side = dir;
    $('swPick')._from = document.activeElement; $('swPick').hidden = false;
    $('swPickQ').value = '';
    $('swPickQ').focus({ preventScroll: true });
    load('');
  }

  function closePick() {
    var p = $('swPick');
    if (p.hidden) return;
    p.hidden = true;
    if (p._from && p._from.focus) p._from.focus({ preventScroll: true });
  }  function choose(c) {
    if (side === 'from') { from = c; paint($('swFromSym'), $('swFromIc'), $('swFromNet'), c); }
    else { to = c; paint($('swToSym'), $('swToIc'), $('swToNet'), c); }
    $('swMemo').style.display = to && to.x ? 'block' : 'none';
    closePick();
    reset();
    quoteNow();
    arm();
  }

  function tick(n) {
    clearTimeout(poll);
    if (!order) return;
    var tries = n || 0;
    poll = setTimeout(function () {
      fetch('/swap/orders/' + order.id)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) { if (tries < 30) tick(tries + 1); return; }
          var st = j.status;
          if (['done', 'failed', 'refunded'].indexOf(st) >= 0) { finish(st, j); return; }
          $('swDepStatus').textContent = LABEL[st] || 'In progress';
          tick(tries + 1);
        })
        .catch(function () { if (tries < 30) tick(tries + 1); });
    }, 10000);
  }

  function finish(st, j) {
    clearTimeout(poll);
    $('swDepQr').style.display = 'none';
    $('swDepAddr').style.display = 'none';
    var cp = $('swCopy'); if (cp) cp.hidden = true;
    if (st === 'done') {
      $('swDepStatus').textContent = 'Complete';
      $('swDepNet').textContent = 'Sent \u2248 ' + fmt(order.toAmount) + ' ' + order.toSym.toUpperCase() + ' to your wallet.';
    } else {
      $('swDepStatus').textContent = st === 'refunded' ? 'Refunded' : 'Failed';
      var why = j.reason || j.error || j.message || '';
      $('swDepNet').textContent = (j.refundAddress || j.refund_address
        ? 'Returned to ' + (j.refundAddress || j.refund_address) + '.'
        : 'No refund address was set, so the funds are held at ChangeNOW.') + (why ? ' ' + why : '');
    }
    $('swDepAgain').hidden = false;
  }
  function showOrder(o) {
    order = o;
    $('swCard').hidden = true;
    $('swDep').hidden = false;
    $('swDepStatus').textContent = LABEL[o.status] || 'In progress';
    $('swDepAmt').textContent = 'Send ' + fmt(o.fromAmount) + ' ' + o.fromSym.toUpperCase();
    $('swDepOut').textContent = 'You receive \u2248 ' + fmt(o.toAmount) + ' ' + o.toSym.toUpperCase();
    $('swDepAddr').textContent = o.payinAddress;
    $('swDepQr').src = o.qr;
    $('swDepNet').textContent = 'Send on ' + o.fromNet.toUpperCase() + ' only. A wrong amount or network gets refunded.';
    tick();
  }

  function boot() {
    $('swFromTok').addEventListener('click', function () { openPicker('from'); });
    $('swToTok').addEventListener('click', function () { openPicker('to'); });
    $('swPickX').addEventListener('click', function () { closePick(); });
    $('swPick').addEventListener('click', function (e) {
      if (e.target === $('swPick')) closePick();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePick();
    });

    var qt = 0;
    $('swPickQ').addEventListener('input', function (e) {
      clearTimeout(qt);
      var v = e.target.value;
      qt = setTimeout(function () { load(v); }, 200);
    });

    $('swPickList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]');
      if (!b) return;
      choose({ t: b.dataset.t, net: b.dataset.net, x: b.dataset.x === '1', i: b.dataset.i });
    });

    $('swAmt').addEventListener('input', function (e) {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      quoteNow();
      arm();
    });

    ['swAddr', 'swMemo'].forEach(function (id) {
      $(id).addEventListener('input', arm);
    });

    $('swFlip').addEventListener('click', function () {
      if (!from || !to) return;
      var a = from; from = to; to = a;
      paint($('swFromSym'), $('swFromIc'), $('swFromNet'), from);
      paint($('swToSym'), $('swToIc'), $('swToNet'), to);
      $('swMemo').style.display = to.x ? 'block' : 'none';
      reset();
      quoteNow();
      arm();
    });

    $('swCta').addEventListener('click', function () {
      if (!ready() || !quote) return;
      $('swCta').disabled = true;
      $('swCta').textContent = 'Creating\u2026';

      fetch('/swap/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: from.t, fromNet: from.net, to: to.t, toNet: to.net,
          amount: String(Number($('swAmt').value)),
          address: $('swAddr').value.trim(),
          memo: $('swMemo').value.trim() || undefined,
          refund: $('swRefund').value.trim() || undefined
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) {
            $('swNote').textContent = o.j.message || 'Could not create the exchange.';
            $('swCta').disabled = false;
            $('swCta').textContent = 'Start exchange';
            return;
          }
          showOrder(o.j);
        })
        .catch(function () {
          $('swCta').disabled = false;
          $('swCta').textContent = 'Start exchange';
        });
    });

    $('swCopy').addEventListener('click', function () {
  var btn = this;
  var a = order && order.payinAddress;
  if (!a) return;
  var done = function () {
    btn.textContent = 'Copied';
    setTimeout(function () { btn.textContent = 'Copy address'; }, 1600);
  };
  var fail = function () {
    btn.textContent = 'Copy failed';
    setTimeout(function () { btn.textContent = 'Copy address'; }, 1600);
  };
  var fallback = function () {
    var ta = document.createElement('textarea');
    ta.value = a;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { if (document.execCommand('copy')) done(); else fail(); } catch (e) { fail(); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(a).then(done, fallback);
    return;
  }
  fallback();
    });

    $('swDepAgain').addEventListener('click', function () {
  clearTimeout(poll);
  order = null;
  $('swDep').hidden = true;
  $('swCard').hidden = false;
  $('swDepQr').style.display = '';
  $('swDepAddr').style.display = '';
  var cp = $('swCopy'); if (cp) cp.hidden = false;
  $('swAmt').value = '';
  $('swAddr').value = '';
  $('swMemo').value = '';
  reset();
    });

    reset();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();