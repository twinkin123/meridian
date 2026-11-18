/* app-fix.js - nav wiring, clock guard, results table read from the server. Loaded last. */
(function(){
  'use strict';

  document.querySelectorAll('.side a[href*="#"]').forEach(function(a){
    var h = a.getAttribute('href') || '';
    var i = h.indexOf('#');
    if (i > -1) a.setAttribute('href', h.slice(i));
  });

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

  var card = document.getElementById('resCard') || (document.querySelectorAll('.grid > div')[1] || { querySelector: function(){ return null; } }).querySelector('.card') ||
    Array.prototype.find.call(document.querySelectorAll('.card'), function(c){ return /next credit/i.test(c.textContent); });
  if (!card) return;
  card.id = 'resCard';

  function dec(v){ var d = 3 - Math.floor(Math.log10(Math.abs(v))); return Math.max(0, Math.min(8, d)); }
  function fmt(v){ v = Number(v); if (!isFinite(v)) return '-'; if (v < 0.0001) return v.toExponential(2); return v.toFixed(dec(v)); }
  function hhmm(m){ return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

  var days = [], offset = 0, maxOffset = 0, lastSig = null;

  function wireNav(){
    card.querySelectorAll('.res-nav button').forEach(function(b){
      var o = +b.getAttribute('data-o');
      if (o > 0 && offset >= maxOffset) b.disabled = true;
      if (o < 0 && offset <= 0) b.disabled = true;
      b.addEventListener('click', function(){
        offset += o;
        if (offset < 0) offset = 0;
        if (offset > maxOffset) offset = maxOffset;
        build();
      });
    });
  }

  function head(dateHtml, totalHtml){
    return '<div class="res-head"><div><div class="res-title">Trade results<div class="res-date">' + dateHtml + '</div></div></div>' +
      '<div class="res-total">' + totalHtml + '</div>' +
      '<div class="res-nav"><button type="button" data-o="1">&lt;</button><button type="button" data-o="-1">&gt;</button></div></div>';
  }

  function build(){
    if (offset > maxOffset) offset = maxOffset;
    if (offset < 0) offset = 0;

    var d = days[offset];
    if (!d){
      if (lastSig === 'none|' + offset) return;
      lastSig = 'none|' + offset;
      card.innerHTML = head('No session recorded', '-') +
        '<div class="res-clock">next credit in <span id="cH">--</span>:<span id="cM">--</span>:<span id="cS">--</span></div>';
      wireNav();
      clock();
      return;
    }

    var sig = d.day + '|' + (d.rows ? d.rows.length : 0) + '|' + offset;
    if (lastSig === sig) return;
    lastSig = sig;

    var recorded = d.source === 'recorded';
    var tot = d.rate_bp / 100;
    var day = new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    var chip = '<span style="display:inline-block;margin-left:8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:' +
      (recorded ? 'var(--grn)' : 'var(--mut2)') + '">' + (recorded ? 'recorded' : 'estimated') + '</span>';

    var rows = (d.rows || []).map(function(r){
      var v = Number(r.ret) / 100;
      var cls = v >= 0 ? 'pos' : 'neg';
      var short = r.side === 'short';
      return '<tr><td class="sym">' + r.symbol + '<span class="lng' + (short ? ' sht' : '') + '">' + (short ? 'SHORT' : 'LONG') + '</span></td>' +
        '<td>' + fmt(r.open) + '</td><td>' + fmt(r.close) + '</td>' +
        '<td>' + hhmm(Number(r.opened)) + '</td><td>' + hhmm(Number(r.closed)) + '</td>' +
        '<td class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</td></tr>';
    }).join('');

    card.innerHTML = head(day + chip, (tot >= 0 ? '+' : '') + tot.toFixed(2) + '%') +
      '<table class="res"><thead><tr><th>Symbol</th><th>Open</th><th>Close</th><th>Opened</th><th>Closed</th><th>Return</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="res-clock">next credit in <span id="cH">--</span>:<span id="cM">--</span>:<span id="cS">--</span></div>';

    if (window.matchMedia("(max-width:900px)").matches){
      var _a = document.getElementById("addr");
      var _d = _a && _a.closest(".card");
      if (_d && _d.parentElement) _d.parentElement.insertBefore(card, _d);
    }

    wireNav();
    clock();
  }

  function load(){
    fetch('/results', { credentials: 'same-origin' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j) return;
        days = (j.days || []).filter(function(d){ return d && d.day; });
        maxOffset = Math.max(0, days.length - 1);
        if (offset > maxOffset) offset = maxOffset;
        lastSig = null;
        build();
      })
      .catch(function(){});
  }

  load();
  document.addEventListener('rate', function(){ if (offset === 0) load(); });
  setInterval(load, 60000);
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

/* header greeting: first visit vs returning */
(function(){
  var el = document.getElementById('welcome');
  if (!el) return;
  var seen = false;
  try { seen = localStorage.getItem('mrd_seen') === '1'; } catch (_) {}
  el.textContent = seen ? 'Welcome back' : 'Welcome';
  try { localStorage.setItem('mrd_seen', '1'); } catch (_) {}
})();