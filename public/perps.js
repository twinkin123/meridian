/* Perps ticket: 500x/1000x, $1-$10 stake, house book. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var market = 'sol', side = 'long', stake = 1, lev = 500, busy = false, poll = 0, chart = null, series = null, mark = 0, days = 1, bucket = 0;

  function usd(micro) { return (Number(micro) / 1e6).toFixed(2); }
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 4 : 2,
      maximumFractionDigits: n < 1 ? 6 : 2,
    });
  }

  function initChart() {
    var el = $('ppChart');
    if (!el || typeof LightweightCharts === 'undefined') return;
    chart = LightweightCharts.createChart(el, {
      layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,.5)' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,.05)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      autoSize: true,
    });
    series = chart.addAreaSeries({
      lineColor: '#2fd48a',
      lineWidth: 2,
      topColor: 'rgba(47,212,138,.30)',
      bottomColor: 'rgba(47,212,138,0)',
      priceLineVisible: false,
    });
  }

  function loadHistory() {
    if (!series) return;
    fetch('/perps/history?market=' + market + '&days=' + days)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !series) return;
        series.setData(j.points.map(function (p) { return { time: p.t, value: p.usd }; }));
        chart.timeScale().fitContent();
      })
      .catch(function () {});
  }

  function pushTick(price) {
    mark = price;
    if (!series) return;
    var b = Math.floor(Date.now() / 5000) * 5;
    if (b !== bucket) {
      bucket = b;
      series.update({ time: b, value: price });
      chart.timeScale().scrollToRealTime();
    } else {
      series.update({ time: b, value: price });
    }
  }

  function paintMarkets(list) {
    list.forEach(function (m) {
      var row = document.querySelector('[data-m="' + m.id + '"]');
      if (!row) return;
      row.querySelector('.pp-mk-r span').textContent = money(m.usd).replace('$', '');
      var em = row.querySelector('em');
      em.textContent = (m.chg >= 0 ? '+' : '') + m.chg.toFixed(2) + '%';
      em.className = m.chg >= 0 ? 'up' : 'dn';
    });
  }

  function paintHeader(id, price, chg) {
    $('ppSym').textContent = id.toUpperCase();
    $('ppPrice').textContent = money(price);
    $('ppChg').textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    $('ppChg').className = chg >= 0 ? 'up' : 'dn';
    $('ppExpo').textContent = (stake * lev).toLocaleString('en-US');
    $('ppAmt').textContent = stake.toFixed(2);
    $('ppMult').textContent = 'x' + lev;
  }

  function arm() {
    $('ppPlace').disabled = busy || !stake || stake < 1 || stake > 10;
    $('ppPlace').textContent = busy ? 'Placing...' : 'Place Trade';
  }

  function quote() {
    fetch('/perps/quote?market=' + market + '&side=' + side + '&leverage=' + lev)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (q) {
        if (!q) { $('ppLiq').textContent = 'Liq. --'; return; }
        $('ppLiq').textContent = 'Liq. ' + money(q.liq);
      })
      .catch(function () {});
  }

  function loadState() {
    fetch('/perps/state')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        $('ppAvail').textContent = usd(s.available);
        renderRows(s.positions || []);
      })
      .catch(function () {});
  }

  function renderRows(rows) {
    $('ppEmpty').hidden = rows.length > 0;
    $('ppRows').innerHTML = rows.map(function (p) {
      var pnl = Number(p.pnl) / 1e6;
      return '<tr><td><b>' + p.market.toUpperCase() + '-PERP</b></td>' +
        '<td><span class="pp-side ' + (p.side === 'long' ? 'l' : 's') + '">' +
        (p.side === 'long' ? 'Long' : 'Short') + '</span></td>' +
        '<td>' + p.leverage + 'x</td>' +
        '<td>' + money(Number(p.entry)) + '</td>' +
        '<td>' + money(Number(p.mark)) + '</td>' +
        '<td class="' + (pnl >= 0 ? 'g' : 'dn') + '">' +
        (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2) + '</td>' +
        '<td><button class="sx" data-close="' + p.id + '" type="button">Close</button></td></tr>';
    }).join('');
  }

  function tick() {
    clearTimeout(poll);
    poll = setTimeout(function () {
      fetch('/perps/markets')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j) {
            paintMarkets(j.markets);
            var cur = j.markets.find(function (m) { return m.id === market; });
            if (cur) { paintHeader(market, cur.usd, cur.chg); pushTick(cur.usd); }
          }
          loadState();
          tick();
        })
        .catch(function () { tick(); });
    }, 4000);
  }

  function pickMarket(id) {
    market = id;
    document.querySelectorAll('.pp-mk li').forEach(function (li) {
      li.classList.toggle('on', li.dataset.m === id);
    });
    if (series) series.setData([]);
    loadHistory();
    quote();
  }

  function boot() {
    initChart();

    document.querySelectorAll('.pp-mk li[data-m]').forEach(function (li) {
      li.addEventListener('click', function () { pickMarket(li.dataset.m); });
    });

    $('ppUp').addEventListener('click', function () {
      side = 'long';
      $('ppUp').classList.add('on');
      $('ppDown').classList.remove('on');
      quote();
    });

    $('ppDown').addEventListener('click', function () {
      side = 'short';
      $('ppDown').classList.add('on');
      $('ppUp').classList.remove('on');
      quote();
    });

    $('ppAmtSlider').addEventListener('input', function (e) {
      stake = Number(e.target.value);
      $('ppAmt').textContent = stake.toFixed(2);
      $('ppExpo').textContent = (stake * lev).toLocaleString('en-US');
      quote();
      arm();
    });

    $('ppLevSlider').addEventListener('input', function (e) {
      lev = Number(e.target.value) >= 750 ? 1000 : 500;
      $('ppMult').textContent = 'x' + lev;
      $('ppExpo').textContent = (stake * lev).toLocaleString('en-US');
      quote();
    });

    $('ppPlace').addEventListener('click', function () {
      if (busy) return;
      busy = true;
      arm();
      fetch('/perps/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market: market, side: side, stake: String(stake * 1e6), leverage: lev }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) $('ppEmpty').textContent = o.j.message || 'Could not place.';
          loadState();
        })
        .catch(function () {})
        .finally(function () { busy = false; arm(); });
    });

    $('ppRows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-close]');
      if (!b) return;
      fetch('/perps/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: b.dataset.close }),
      }).then(loadState).catch(function () {});
    });

    $('ppAmt').textContent = stake.toFixed(2);
    loadHistory();
    quote();
    loadState();
    tick();
    arm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();