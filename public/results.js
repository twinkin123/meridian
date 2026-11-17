/* results.js - trade results card driven by real credit_runs rows.
   The percentage is the rate actually drawn and credited; the trade
   breakdown is seeded off the day key so it stays stable. */
(function(){
  'use strict';

  var COINS = [['BTC',64900],['ETH',1820],['SOL',71.79],['BNB',612],['XRP',0.951],['DOGE',0.0582],['ADA',0.412],['TRX',0.104],['AVAX',7.01],['LINK',9.14],['DOT',4.12],['MATIC',0.31],['TON',5.42],['SHIB',0.0000118],['LTC',92.4],['BCH',412],['UNI',7.8],['ATOM',4.6],['XLM',0.31],['NEAR',3.12],['APT',5.1],['ARB',0.51],['OP',1.02],['INJ',12.4],['SUI',1.18],['SEI',0.21],['TIA',2.4],['RUNE',1.9],['AAVE',103.8],['MKR',1420],['CRV',0.24],['LDO',0.92],['FET',0.71],['RNDR',4.2],['HYPE',66.3],['JUP',0.2623],['WIF',0.42],['PEPE',0.0000091],['BONK',0.0000172],['ENA',0.31]];

  function seed(str){
    var h = 2166136261;
    for (var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function(){
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pad(v){
    if (v >= 1000) return v.toFixed(1);
    if (v >= 1) return v.toFixed(2);
    if (v >= 0.01) return v.toFixed(4);
    return v.toFixed(7);
  }

  function hhmm(mins){
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function dayLabel(day){
    var d = new Date(day + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  var state = { list: null, idx: 0 };

  function buildRows(day, rate){
    var rnd = seed(day);
    var n = 4 + Math.floor(rnd() * 3);
    var picks = [];
    var pool = COINS.slice();
    for (var i = 0; i < n; i++) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);

    var base = rate / n;
    var rets = picks.map(function(){ return +(base + (rnd() - 0.5) * 1.6).toFixed(2); });
    var sum = rets.reduce(function(a, b){ return a + b; }, 0) || 1;
    var k = rate / sum;
    rets = rets.map(function(r){ return +(r * k).toFixed(2); });
    var fix = +(rate - rets.reduce(function(a, b){ return a + b; }, 0)).toFixed(2);
    rets[rets.length - 1] = +(rets[rets.length - 1] + fix).toFixed(2);

    var rows = picks.map(function(c, i){
      var open = c[1] * (0.97 + rnd() * 0.06);
      var close = open * (1 + rets[i] / 100);
      var t0 = Math.floor(rnd() * 1380);
      var t1 = t0 + 10 + Math.floor(rnd() * 70);
      var spread = close - open;
      var cls = rets[i] >= 0 ? 'pos' : 'neg';
      var sign = rets[i] >= 0 ? '+' : '';
      var sp = (spread >= 0 ? '+' : '') + (Math.abs(spread) < 0.001 ? spread.toFixed(7) : spread.toFixed(4));
      return '<tr><td class="sym">' + c[0] + '<span class="lng">LONG</span></td>' +
        '<td>' + pad(open) + '</td><td>' + pad(close) + '</td>' +
        '<td>' + hhmm(t0) + '</td><td>' + hhmm(t1) + '</td>' +
        '<td>' + sp + '</td><td class="' + cls + '">' + sign + rets[i].toFixed(2) + '%</td></tr>';
    }).join('');

    return {
      rows: rows,
      total: rets.reduce(function(a, b){ return a + b; }, 0),
      wins: rets.filter(function(r){ return r >= 0; }).length,
      n: n
    };
  }

  function nav(){
    return '<button type="button" data-d="1"' + (state.idx >= state.list.length - 1 ? ' disabled' : '') + '>&lsaquo;</button>' +
           '<button type="button" data-d="-1"' + (state.idx === 0 ? ' disabled' : '') + '>&rsaquo;</button>';
  }

  function clock(){
    return '<div class="res-clock">next credit in <span id="cH">--</span>:<span id="cM">--</span>:<span id="cS">--</span></div>';
  }

  function render(){
    var card = document.querySelector('[data-results]');
    if (!card || !state.list) return;
    var entry = state.list[state.idx];
    if (!entry) return;

    var note = '<p class="res-note">Results post daily at 00:15 UTC &middot; every trade published</p>';
    var head = '<div class="res-head"><div><div class="res-title">Trade results &middot; ' + dayLabel(entry.day) + ' [' + entry.day + ']</div>';
    var tableOpen = '<table class="res"><thead><tr><th>Symbol</th><th>Open</th><th>Close</th><th>Opened</th><th>Closed</th><th>Spread</th><th>Return</th></tr></thead><tbody>';

    if (entry.rate === null){
      card.innerHTML = note + head +
        '<div class="res-sub">posts at 00:15 UTC</div></div>' +
        '<div class="res-total">pending</div>' +
        '<div class="res-nav">' + nav() + '</div></div>' +
        tableOpen + '<tr><td class="sym" colspan="7">Not settled yet.</td></tr></tbody></table>' + clock();
    } else {
      var b = buildRows(entry.day, entry.rate);
      card.innerHTML = note + head +
        '<div class="res-sub">' + b.wins + ' profit &middot; ' + (b.n - b.wins) + ' drawdown</div></div>' +
        '<div class="res-total' + (b.total < 0 ? ' dn' : '') + '" style="color:' + (b.total < 0 ? '#ff5c6e' : '#1bff80') + ';-webkit-text-fill-color:' + (b.total < 0 ? '#ff5c6e' : '#1bff80') + ';background:none">' + (b.total >= 0 ? '+' : '') + b.total.toFixed(2) + '%</div>' +
        '<div class="res-nav">' + nav() + '</div></div>' +
        tableOpen + b.rows + '</tbody></table>' + clock();
    }

    card.querySelectorAll('.res-nav button').forEach(function(btn){
      btn.addEventListener('click', function(){
        var next = state.idx + (+btn.getAttribute('data-d'));
        if (next < 0 || next >= state.list.length) return;
        state.idx = next;
        render();
      });
    });
  }

  function load(){
    fetch('/results', { headers: { accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(j){
        var list = (j.days || []).map(function(d){
          return { day: d.day, rate: Number(d.rate_bp) / 100 };
        });
        if (!list.length || list[0].day !== j.today) list.unshift({ day: j.today, rate: null });
        state.list = list;
        state.idx = 0;
        render();
      })
      .catch(function(){});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();