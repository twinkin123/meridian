/* Perps ticket: 500x/1000x, $1-$10 stake, house book. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var market = 'sol', side = 'long', stake = 1, lev = 500, busy = false, poll = 0;
  var chart = null, line = null, candles = null, all = [], days = 0, mode = 'line';

  var META = {
    sol: { n: 'Solana', c: '#14f195', g: 'S' },
    btc: { n: 'Bitcoin', c: '#f7931a', g: 'B' },
    eth: { n: 'Ethereum', c: '#627eea', g: 'E' },
  };

  function usd(micro) { return (Number(micro) / 1e6).toFixed(2); }
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 4 : 2,
      maximumFractionDigits: n < 1 ? 6 : 2,
    });
  }

  function step() { return days === 0 ? 1 : days === 1 ? 60 : days <= 30 ? 3600 : 86400; }

  function candlesFrom(list) {
    var s = days === 0 ? 5 : days === 1 ? 300 : step(), out = [], cur = null;
    list.forEach(function (p) {
      var b = Math.floor(p.t / s) * s;
      if (!cur || cur.time !== b) {
        if (cur) out.push(cur);
        cur = { time: b, open: p.usd, high: p.usd, low: p.usd, close: p.usd };
      } else {
        cur.high = Math.max(cur.high, p.usd);
        cur.low = Math.min(cur.low, p.usd);
        cur.close = p.usd;
      }
    });
    if (cur) out.push(cur);
    return out;
  }

  function render() {
    if (!chart) return;
    if (mode === 'candles') {
      line.setData([]);
      line.setMarkers([]);
      candles.setData(candlesFrom(all));
    } else {
      candles.setData([]);
      line.setData(all.map(function (p) { return { time: p.t, value: p.usd }; }));
      var tip = all[all.length - 1];
      if (tip) {
        line.setMarkers([{ time: tip.t, position: 'inBar', shape: 'circle', color: '#28e664', size: 1 }]);
      }
    }
    chart.priceScale('right').applyOptions({ autoScale: true });
    chart.timeScale().fitContent();
    if (mode === 'candles') {
      var n = candlesFrom(all).length;
      if (n > 120) chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 2 });
    }
  }

  function initChart() {
    var el = $('ppChart');
    if (!el || typeof LightweightCharts === 'undefined') return;
    chart = LightweightCharts.createChart(el, {
      layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,.45)' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
    });
    line = chart.addLineSeries({
      color: '#28e664',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candles = chart.addCandlestickSeries({
      upColor: '#28e664',
      downColor: '#f0476a',
      borderVisible: false,
      wickUpColor: '#28e664',
      wickDownColor: '#f0476a',
      priceLineVisible: false,
      lastValueVisible: false,
    });
  }

  function loadHistory(retry) {
    if (!chart) return;
    fetch('/perps/history?market=' + market + '&days=' + days)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        all = j && j.points ? j.points : [];
        if (all.length) { render(); return; }
        if (!retry) setTimeout(function () { loadHistory(1); }, 1500);
      })
      .catch(function () { if (!retry) setTimeout(function () { loadHistory(1); }, 1500); });
  }

  function pushTick(price) {
    if (!chart) return;
    var t = Math.floor(Date.now() / 1000);
    var last = all[all.length - 1];
    if (last && t - last.t < 1) { last.usd = price; }
    else { all.push({ t: t, usd: price }); }
    if (all.length > 4000) all.shift();
    render();
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

  var DESC = {
    sol: 'Solana is a high-throughput layer 1, built for cheap, fast transactions.',
    btc: 'Bitcoin is the first and largest cryptocurrency, secured by proof-of-work.',
    eth: 'Ethereum is the largest smart-contract network, secured by proof-of-stake.',
  };

  function paintHeader(id, price, chg) {
    var meta = META[id] || { n: '', c: '#888', g: '?' };
    $('ppName').textContent = meta.n;
    $('ppAboutT').textContent = 'About ' + meta.n;
    var badge = $('ppBadge');
    if (badge) {
      var c = badge.querySelector('circle');
      if (c) c.setAttribute('fill', meta.c);
      var tx = badge.querySelector('text');
      if (tx) tx.textContent = meta.g;
    }
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
    }, 1000);
  }

  function pickMarket(id) {
    market = id;
    document.querySelectorAll('.pp-mk li').forEach(function (li) {
      li.classList.toggle('on', li.dataset.m === id);
    });
    all = [];
    if (chart) { line.setData([]); candles.setData([]); }
    loadHistory();
    quote();
  }

  function boot() {
    initChart();

    document.querySelectorAll('.pp-mk li[data-m]').forEach(function (li) {
      li.addEventListener('click', function () { pickMarket(li.dataset.m); });
    });

    var tools = document.querySelectorAll('.pp-tools button');
    if (tools[0]) tools[0].addEventListener('click', function () { mode = 'line'; render(); });
    if (tools[1]) tools[1].addEventListener('click', function () { mode = 'candles'; if (all.length < 3) loadHistory(); render(); });

    document.querySelectorAll('.pp-tf2 button').forEach(function (b, i) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.pp-tf2 button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        days = [0, 1, 7, 30, 90][i];
        all = [];
        if (chart) { line.setData([]); candles.setData([]); }
        loadHistory();
      });
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