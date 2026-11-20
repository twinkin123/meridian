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
    netEl.textContent = c ? c.net.toUpperCase() : '';
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
    $('swPick').hidden = false;
    $('swPickQ').value = '';
    $('swPickQ').focus();
    load('');
  }

  function choose(c) {
    if (side === 'from') { from = c; paint($('swFromSym'), $('swFromIc'), $('swFromNet'), c); }
    else { to = c; paint($('swToSym'), $('swToIc'), $('swToNet'), c); }
    $('swMemo').style.display = to && to.x ? 'block' : 'none';
    $('swPick').hidden = true;
    reset();
    quoteNow();
    arm();
  }

  function tick() {
    clearTimeout(poll);
    if (!order) return;
    poll = setTimeout(function () {
      fetch('/swap/orders/' + order.id)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) { tick(); return; }
          $('swDepStatus').textContent = LABEL[j.status] || 'In progress';
          if (['done', 'failed', 'refunded'].indexOf(j.status) >= 0) {
            $('swDepAgain').hidden = false;
            return;
          }
          tick();
        })
        .catch(function () { tick(); });
    }, 10000);
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
    $('swPickX').addEventListener('click', function () { $('swPick').hidden = true; });
    $('swPick').addEventListener('click', function (e) {
      if (e.target === $('swPick')) $('swPick').hidden = true;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $('swPick').hidden = true;
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
      if (order) navigator.clipboard.writeText(order.payinAddress);
    });

    $('swDepAgain').addEventListener('click', function () {
      clearTimeout(poll);
      order = null;
      $('swDep').hidden = true;
      $('swCard').hidden = false;
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