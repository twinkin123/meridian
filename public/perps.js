/* Perps ticket: 500x/1000x, $1-$10 stake, house book. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var market = 'sol', side = 'long', stake = 1, lev = 500, busy = false, poll = 0;

  function usd(micro) { return (Number(micro) / 1e6).toFixed(2); }

  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 4 : 2,
      maximumFractionDigits: n < 1 ? 6 : 2,
    });
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

  function paintHeader(id, usd, chg) {
    $('ppSym').textContent = id.toUpperCase();
    $('ppPrice').textContent = money(usd);
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

  function draw(list) {
    if (!list.length) return;
    var svg = document.getElementById('ppLine').ownerSVGElement;
    var dot = svg.querySelector('.pp-dot-c');
    if (!dot) {
      dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', '#2fd48a');
      dot.setAttribute('class', 'pp-dot-c');
      svg.appendChild(dot);
    }
    var vals = list.map(function (s) { return s.usd; });
    var lo = Math.min.apply(null, vals);
    var hi = Math.max.apply(null, vals);
    var span = hi - lo || hi * 0.0001;
    var n = list.length;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var x = 20 + (i / Math.max(1, n - 1)) * 1072;
      var y = 280 - ((list[i].usd - lo) / span) * 250;
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    document.getElementById('ppLine').setAttribute('points', pts.join(' '));
    var last = pts[pts.length - 1].split(',');
    dot.setAttribute('cx', last[0]);
    dot.setAttribute('cy', last[1]);
  }

  function fetchSeries() {
    fetch('/perps/series?market=' + market)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) draw(j.series); })
      .catch(function () {});
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
            if (cur) paintHeader(market, cur.usd, cur.chg);
          }
          fetchSeries();
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
    quote();
  }

  function boot() {
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
    quote();
    loadState();
    tick();
    arm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
