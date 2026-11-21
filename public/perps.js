/* Perps ticket: 500x/1000x, $1-$10 stake, house book. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var market = 'sol', side = 'long', stake = 1, lev = 500, busy = false, poll = 0;
  var chart = null, line = null, candles = null, all = [], days = 0, mode = 'line', lastMarks = null;

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

  /* One point per 5s bucket, last value wins, so tick jitter does not draw. */
  function smooth(list) {
    var b = 5, out = [], cur = -1;
    for (var i = 0; i < list.length; i++) {
      var k = Math.floor(list[i].t / b);
      if (k !== cur) { out.push({ t: k * b, usd: list[i].usd }); cur = k; }
      else { out[out.length - 1].usd = list[i].usd; }
    }
    return out;
  }

  /* autoSize drifts after the card resizes, leaving the plot on a stale
     canvas. Size the chart to the box explicitly instead. */
  var lastW = 0, lastH = 0;
  function fitChart() {
    var el = $('ppChart');
    if (!chart || !el) return;
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    chart.resize(w, h);
  }

  function candlesFrom(list) {
    var s = days === 0 ? 5 : days === 1 ? 300 : days <= 7 ? 3600 : days <= 30 ? 14400 : 86400, out = [], cur = null;
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
    fitChart();
    var pts = smooth(all);
    if (mode === 'candles') {
      line.setData([]);
      line.setMarkers([]);
      candles.setData(candlesFrom(all));
    } else {
      candles.setData([]);
      line.setData(pts.map(function (p) { return { time: p.t, value: p.usd }; }));
      var tip = pts[pts.length - 1];
      if (tip) {
        line.setMarkers([{ time: tip.t, position: 'inBar', shape: 'circle', color: '#28e664', size: 2 }]);
      }
    }
    chart.priceScale('right').applyOptions({ autoScale: true, scaleMargins: { top: 0.06, bottom: 0.06 } });
    paintLiq();
    chart.timeScale().fitContent();
    paintLiq();
    var m = pts.length;
    if (m > 1) chart.timeScale().setVisibleLogicalRange({ from: 0, to: m + 5 });
    if (mode === 'candles') {
      var n = candlesFrom(all).length;
      if (n > 1) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 2 });
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
      autoSize: false,
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

    liqSeries = chart.addLineSeries({ color: '#f0476a', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
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
    var dp = $('ppAboutP');
    if (dp) dp.textContent = DESC[id] || '';
    var bd = $('ppBadge') && $('ppBadge').querySelector('img');
    if (bd) bd.src = '/market/logo/' + id;
    $('ppSym').textContent = id.toUpperCase();
    $('ppPrice').textContent = money(price);
    $('ppChg').textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    $('ppChg').className = chg >= 0 ? 'up' : 'dn';
    $('ppExpo').textContent = (stake * lev).toLocaleString('en-US');
    $('ppAmt').textContent = stake.toFixed(2);
    $('ppMult').textContent = lev + 'x';
  }

  function arm() {
    $('ppPlace').disabled = busy || !stake || stake < 1 || stake > 10;
    $('ppPlace').textContent = busy ? 'Placing...' : 'Place Trade';
  }

  var liqSeries = null, openLiqs = [], liqLines = [], liqAnchors = [];
  var tab = 'pos', lastPos = [], lastHist = [];
  var openCount = 0;

  /* One price line per open position in this market. Each gets its own series
     anchor so auto-scale keeps every one of them on screen; price lines alone
     do not participate in auto-scale. */
  function paintLiq() {
    var i;
    for (i = 0; i < liqLines.length; i++) {
      if (liqLines[i]) { try { liqLines[i].owner.removePriceLine(liqLines[i].line); } catch (_) {} }
    }
    liqLines = [];

    var n = openLiqs.length;
    for (i = 0; i < n; i++) {
      if (!liqAnchors[i] && chart) {
        liqAnchors[i] = chart.addLineSeries({
          color: '#ff2f4f',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      }
    }
    for (i = 0; i < liqAnchors.length; i++) {
      if (i >= n || all.length < 2) { try { liqAnchors[i].setData([]); } catch (_) {} continue; }
      try {
        liqAnchors[i].setData([
          { time: all[0].t, value: openLiqs[i] },
          { time: all[all.length - 1].t, value: openLiqs[i] },
        ]);
      } catch (_) {}
    }

    var target = mode === 'candles' ? candles : line;
    if (!n || !target) return;
    for (i = 0; i < n; i++) {
      try {
        liqLines.push({
          owner: target,
          line: target.createPriceLine({
            price: openLiqs[i],
            color: '#ff2f4f',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: i === 0 ? 'Liq' : '',
          }),
        });
      } catch (_) {}
    }
  }

  /* One line per open position in this market, lowest first. */
  function setLiq(rows) {
    openLiqs = (rows || [])
      .filter(function (p) { return p.market === market && p.liq; })
      .map(function (p) { return Number(p.liq); })
      .sort(function (a, b) { return a - b; });
    paintLiq();
  }

  function quote() {
    fetch('/perps/quote?market=' + market + '&side=' + side + '&leverage=' + lev)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (q) {
        if (!q) {
          $('ppLiq').textContent = 'Liq. --';
          $('ppLiq').style.color = '';
          return;
        }
        $('ppLiq').textContent = 'Liq. ' + money(q.liq);
        $('ppLiq').style.color = '#f0476a';
      })
      .catch(function () {});
  }

  function loadState() {
    fetch('/perps/state')
      .then(function (r) {
        return r.text().then(function (t) {
          var j = {};
          try { j = JSON.parse(t); } catch (_) { j = { raw: t.slice(0, 200) }; }
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .then(function (o) {
        if (!o.ok) {
          $('ppAvail').textContent = '--';
          $('ppEmpty').hidden = false;
          $('ppEmpty').textContent = o.j.error || o.j.message || o.j.raw || ('state ' + o.status);
          return;
        }
        if (o.j.error) { $('ppEmpty').hidden = false; $('ppEmpty').textContent = o.j.error; }
        $('ppAvail').textContent = usd(o.j.available);
        lastPos = o.j.positions || []; lastHist = o.j.history || [];
        openCount = (o.j.positions || []).length; setLiq(o.j.positions); paintRows(); quote();
      })
      .catch(function (e) {
        $('ppAvail').textContent = '--';
        $('ppEmpty').hidden = false;
        $('ppEmpty').textContent = 'net: ' + e.message;
      });
  }

  function renderRows(rows) {
    $('ppEmpty').hidden = rows.length > 0;
    $('ppEmpty').textContent = 'No open positions yet.';
    $('ppRows').innerHTML = rows.map(function (p) {
      var pnl = Number(p.pnl) / 1e6;
      return '<tr><td><b>' + p.market.toUpperCase() + '-PERP</b></td>' +
        '<td><span class="pp-side ' + (p.side === 'long' ? 'l' : 's') + '">' +
        (p.side === 'long' ? 'Long' : 'Short') + '</span></td>' +
        '<td>' + p.leverage + 'x</td>' +
        '<td>' + money(Number(p.entry)) + '</td>' +
        '<td>' + money(Number(p.mark)) + '</td>' +
        '<td class="pp-liqcell">' + (p.liq ? money(Number(p.liq)) : '--') + '</td>' +
        '<td class="' + (pnl >= 0 ? 'g' : 'dn') + '">' +
        (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2) + '</td>' +
        '<td><button class="sx" data-close="' + p.id + '" type="button">Close</button></td></tr>';
    }).join('');
  }

  function headers() {
    $('ppHead').innerHTML = tab === 'pos'
      ? '<tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Liq</th><th>PnL</th><th></th></tr>'
      : '<tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Result</th></tr>';
  }

  function renderHist(rows) {
    $('ppEmpty').hidden = rows.length > 0;
    $('ppEmpty').textContent = 'No closed trades yet.';
    $('ppRows').innerHTML = rows.map(function (p) {
      var pnl = Number(p.pnl) / 1e6;
      var liq = p.status === 'liquidated';
      return '<tr><td><b>' + p.market.toUpperCase() + '-PERP</b></td>' +
        '<td><span class="pp-side ' + (p.side === 'long' ? 'l' : 's') + '">' +
        (p.side === 'long' ? 'Long' : 'Short') + '</span></td>' +
        '<td>' + p.leverage + 'x</td>' +
        '<td>' + money(Number(p.entry)) + '</td>' +
        '<td>' + money(Number(p.exit_price)) + '</td>' +
        '<td class="' + (pnl >= 0 ? 'g' : 'dn') + '">' +
        (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2) + '</td>' +
        '<td>' + (liq ? '<span class="pp-side s">Liq</span>' : 'Closed') + '</td></tr>';
    }).join('');
  }

  function paintRows() {
    if (tab === 'hist') { renderHist(lastHist); return; }
    renderRows(lastPos);
  }

  function tick() {
    clearTimeout(poll);
    poll = setTimeout(function () {
      fetch('/perps/markets')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j) {
            lastMarks = j.markets;
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
    var mm = lastMarks && lastMarks.find(function (m) { return m.id === id; });
    if (mm) paintHeader(id, mm.usd, mm.chg);
    else { $('ppSym').textContent = id.toUpperCase(); $('ppPrice').textContent = '--'; }
    var bdp = $('ppBadge') && $('ppBadge').querySelector('img');
    if (bdp) bdp.src = '/market/logo/' + id;
    document.querySelectorAll('.pp-mk li').forEach(function (li) {
      li.classList.toggle('on', li.dataset.m === id);
    });
    all = [];
    openLiqs = [];
    if (chart) { line.setData([]); candles.setData([]); paintLiq(); }
    loadHistory();
    quote();
  }

  function boot() {
    initChart();
    ['sol', 'btc', 'eth'].forEach(function (k) { var im = new Image(); im.src = '/market/logo/' + k; });

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
      lev = Math.round(Number(e.target.value));
      $('ppMult').textContent = lev + 'x';
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
        .then(function (r) { return r.text().then(function (t) { var j = {}; try { j = JSON.parse(t); } catch (_) {} return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (o) {
          if (!o.ok) { $('ppEmpty').hidden = false; $('ppEmpty').textContent = o.j.message || 'Could not place (' + o.status + ').'; }
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

    function setTab(t) {
      tab = t;
      $('ppTabPos').classList.toggle('on', t === 'pos');
      $('ppTabHist').classList.toggle('on', t === 'hist');
      headers();
      paintRows();
      loadState();
    }
    $('ppTabPos').addEventListener('click', function () { setTab('pos'); });
    $('ppTabHist').addEventListener('click', function () { setTab('hist'); });
    });

    $('ppAmt').textContent = stake.toFixed(2);
    loadHistory();
    quote();
    loadState();
    tick();
    arm();
    window.addEventListener('resize', function () { fitChart(); paintLiq(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();