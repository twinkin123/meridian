/* app-fix.js - nav wiring, clock guard, authoritative results table. Loaded last. */
(function(){
  'use strict';

  /* nav: strip the absolute prefix so hash links work without a reload */
  document.querySelectorAll('.side a[href*="#"]').forEach(function(a){
    var h = a.getAttribute('href') || '';
    var i = h.indexOf('#');
    if (i > -1) a.setAttribute('href', h.slice(i));
  });

  /* clock: no dependency on the ring element */
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function clock(){
    var now = new Date();
    var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    var left = Math.max(0, next - now.getTime());
    var h = document.getElementById('cH'), m = document.getElementById('cM'), s = document.getElementById('cS');
    if (h) h.textContent = pad(Math.floor(left / 3600000));
    if (m) m.textContent = pad(Math.floor(left / 60000) % 60);
    if (s) s.textContent = pad(Math.floor(left / 1000) % 60);
    var rp = document.getElementById('ringProg');
    if (rp) rp.setAttribute('stroke-dashoffset', String(327 * (1 - left / 86400000)));
  }
  clock();
  setInterval(clock, 1000);

  /* results table */
  var card = document.getElementById('resCard') || (document.querySelectorAll('.grid > div')[1] || { querySelector: function(){ return null; } }).querySelector('.card') ||
    Array.prototype.find.call(document.querySelectorAll('.card'), function(c){ return /next credit/i.test(c.textContent); });
  if (!card) return;
  card.id = 'resCard';

  var COINS = [['BTC',64900],['ETH',1820],['SOL',71.79],['BNB',612],['XRP',0.951],['DOGE',0.0582],['ADA',0.412],['TRX',0.104],['AVAX',7.01],['LINK',9.14],['DOT',4.12],['MATIC',0.31],['TON',5.42],['SHIB',0.0000118],['LTC',92.4],['BCH',412],['UNI',7.8],['ATOM',4.6],['XLM',0.31],['NEAR',3.12],['APT',5.1],['ARB',0.51],['OP',1.02],['INJ',12.4],['SUI',1.18],['SEI',0.21],['TIA',2.4],['RUNE',1.9],['AAVE',103.8],['MKR',1420],['CRV',0.24],['LDO',0.92],['FET',0.71],['RNDR',4.2],['HYPE',66.3],['JUP',0.2623],['WIF',0.42],['PEPE',0.0000091],['BONK',0.0000172],['ENA',0.31]];

  function seed(s){ var h = 2166136261; for (var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return function(){ h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ t>>>15, t|1); t ^= t + Math.imul(t ^ t>>>7, t|61); return ((t ^ t>>>14) >>> 0) / 4294967296; }; }
  function pick(n, r){ var a = COINS.slice(), o = []; for (var i=0;i<n;i++){ o.push(a.splice(Math.floor(r()*a.length),1)[0]); } return o; }
  function dec(v){ var d = 3 - Math.floor(Math.log10(Math.abs(v))); return Math.max(0, Math.min(8, d)); }
  function r4(v){ return +v.toFixed(dec(v)); }
  function fmt(v){ if (v < 0.0001) return v.toExponential(2); return v.toFixed(dec(v)); }
  function step(v){ return Math.pow(10, -dec(v)); }
  function hhmm(m){ return pad(Math.floor(m/60)) + ':' + pad(m%60); }
  function sum(a){ return a.reduce(function(x, y){ return x + y; }, 0); }

  var offset = 0;

  function rateNow(){
    var el = document.getElementById('rate');
    var v = el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : NaN;
    return (isNaN(v) || v <= 0) ? 3 : v;
  }

  function build(){
    var d = new Date(); d.setDate(d.getDate() - offset);
    var r = seed(d.toISOString().slice(0, 10));
    var rate = offset === 0 ? rateNow() : +(1 + r() * 2.5).toFixed(2);
    var n = 4 + Math.floor(r() * 3);
    var picks = pick(n, r);
    var want = picks.map(function(){ return rate / n + (r() - 0.5) * 1.6; });

    var opens = [], closes = [], shorts = [], actuals = [];
    for (var i = 0; i < n; i++){
      opens[i] = r4(picks[i][1] * (0.97 + r() * 0.06));
      shorts[i] = r() < 0.45;
      closes[i] = r4(shorts[i] ? opens[i] * (1 - want[i] / 100) : opens[i] * (1 + want[i] / 100));
      actuals[i] = shorts[i] ? (1 - closes[i] / opens[i]) * 100 : (closes[i] / opens[i] - 1) * 100;
    }

    var need = rate - sum(actuals), guard = 0;
    while (Math.abs(need) > 0.005 && guard++ < 500){
      var j = n - 1, o = opens[j], t = step(o);
      var per = (t / o) * 100 * (shorts[j] ? -1 : 1);
      var steps = Math.max(1, Math.round(Math.abs(need) / Math.abs(per)));
      closes[j] = r4(closes[j] + Math.sign(need) * Math.sign(per) * t * steps);
      actuals[j] = shorts[j] ? (1 - closes[j] / o) * 100 : (closes[j] / o - 1) * 100;
      need = rate - sum(actuals);
    }

    actuals = actuals.map(function(x){ return +x.toFixed(2); });
    actuals[n - 1] = +(rate - sum(actuals.slice(0, n - 1))).toFixed(2);
    closes[n - 1] = r4(shorts[n - 1] ? opens[n - 1] * (1 - actuals[n - 1] / 100) : opens[n - 1] * (1 + actuals[n - 1] / 100));
    var tot = +sum(actuals).toFixed(2);

    var rows = picks.map(function(c, i){
      var t0 = Math.floor(r() * 1380), t1 = t0 + 10 + Math.floor(r() * 70);
      var cls = actuals[i] >= 0 ? 'pos' : 'neg';
      var sign = actuals[i] >= 0 ? '+' : '';
      return '<tr><td class="sym">' + c[0] + '<span class="lng' + (shorts[i] ? ' sht' : '') + '">' + (shorts[i] ? 'SHORT' : 'LONG') + '</span></td>' +
        '<td>' + fmt(opens[i]) + '</td><td>' + fmt(closes[i]) + '</td>' +
        '<td>' + hhmm(t0) + '</td><td>' + hhmm(t1) + '</td>' +
        '<td class="' + cls + '">' + sign + actuals[i].toFixed(2) + '%</td></tr>';
    }).join('');

    var wins = actuals.filter(function(x){ return x >= 0; }).length;
    var day = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    card.innerHTML =
      '' +
      '<div class="res-head"><div><div class="res-title">Trade results<div class="res-date">' + day + '</div></div>' +
      '</div>' +
      '<div class="res-total' + (tot < 0 ? ' dn' : '') + '">' + (tot >= 0 ? '+' : '') + tot.toFixed(2) + '%</div>' +
      '<div class="res-nav"><button type="button" data-o="1">&lt;</button><button type="button" data-o="-1">&gt;</button></div></div>' +
      '<table class="res"><thead><tr><th>Symbol</th><th>Open</th><th>Close</th><th>Opened</th><th>Closed</th><th>Return</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="'';

    card.querySelectorAll('.res-nav button').forEach(function(b){
      b.addEventListener('click', function(){
        offset += +b.getAttribute('data-o');
        if (offset < 0) offset = 0;
        build();
        clock();
      });
    });
    clock();
  }

  build();
  setTimeout(build, 2000);
})();
/* belt-and-braces nav: capture taps so a reload can never swallow them */
(function(){
  document.addEventListener('click', function(e){
    var a = e.target.closest('.side a');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var i = h.indexOf('#');
    if (i < 0) return;
    var id = 'p-' + h.slice(i + 1);
    var t = document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    document.querySelectorAll('.panel').forEach(function(p){ p.classList.toggle('on', p.id === id); });
    document.querySelectorAll('.side a').forEach(function(x){ x.classList.remove('on'); });
    a.classList.add('on');
    window.scrollTo(0, 0);
  }, true);
})();

/* belt-and-braces nav: capture taps so a reload can never swallow them */
(function(){
  document.addEventListener('click', function(e){
    var a = e.target.closest('.side a');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var i = h.indexOf('#');
    if (i < 0) return;
    var id = 'p-' + h.slice(i + 1);
    var t = document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    document.querySelectorAll('.panel').forEach(function(p){ p.classList.toggle('on', p.id === id); });
    document.querySelectorAll('.side a').forEach(function(x){ x.classList.remove('on'); });
    a.classList.add('on');
    window.scrollTo(0, 0);
  }, true);
})();

/* claim button */
(function(){
  var b = document.getElementById('claimBtn');
  if (!b) return;
  var note = document.getElementById('heldNote');
  b.addEventListener('click', function(){
    var label = b.textContent;
    b.disabled = true;
    b.textContent = 'Claiming...';
    fetch('/wallet/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(res){
        if (note) note.textContent = res.ok ? 'Claimed to your balance.' : 'Nothing to claim yet.';
        if (res.ok) setTimeout(function(){ location.reload(); }, 800);
      })
      .catch(function(){ if (note) note.textContent = 'Network error. Try again.'; })
      .finally(function(){ b.disabled = false; b.textContent = label; });
  });
})();

/* header greeting: first visit vs returning */
(function(){
  var el = document.getElementById('welcome');
  if (!el) return;
  var seen = false;
  try { seen = localStorage.getItem('mrd_seen') === '1'; } catch (_) {}
  el.textContent = seen ? 'Welcome back' : 'Welcome';
  try { localStorage.setItem('mrd_seen', '1'); } catch (_) {}
})();

/* header greeting: first visit vs returning */
(function(){
  var el = document.getElementById('welcome');
  if (!el) return;
  var seen = false;
  try { seen = localStorage.getItem('mrd_seen') === '1'; } catch (_) {}
  el.textContent = seen ? 'Welcome back' : 'Welcome';
  try { localStorage.setItem('mrd_seen', '1'); } catch (_) {}
})();









