(function(){
  var ov = null, body = null, days = [], i = 0;
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function hhmm(m){ return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function fmt(v){ v = Number(v); return isFinite(v) ? v.toFixed(4) : '-'; }

  function build(){
    ov = document.createElement('div');
    ov.className = 'tr-overlay';
    ov.hidden = true;
    ov.innerHTML = '<div class="tr-sheet" role="dialog" aria-modal="true" aria-label="Trade results">'
      + '<div class="tr-head"><span class="tr-ico">&#8599;</span><h3>Trade results</h3>'
      + '<button class="tr-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="tr-body"></div>'
      + '<p class="tr-note">Closed positions for the selected session. Returns are net of fees.</p></div>';
    document.body.appendChild(ov);
    body = ov.querySelector('.tr-body');
    ov.querySelector('.tr-x').addEventListener('click', close);
    ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !ov.hidden) close(); });
  }

  function render(){
    var d = days[i];
    if (!d){ body.innerHTML = '<div class="res-empty">No session recorded yet.</div>'; return; }
    var day = new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    var pct = d.rate_bp == null ? null : d.rate_bp / 100;
    var tot = pct == null ? '\u2014' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    var rows = (d.rows || []).map(function(x){
      var v = Number(x.ret) / 100;
      return '<tr><td class="sym">' + x.symbol + '<span class="lng' + (x.side === 'short' ? ' sht' : '') + '">' + (x.side === 'short' ? 'SHORT' : 'LONG') + '</span></td>'
        + '<td>' + fmt(x.open) + '</td><td>' + fmt(x.close) + '</td>'
        + '<td>' + hhmm(Number(x.opened)) + '</td><td>' + hhmm(Number(x.closed)) + '</td>'
        + '<td class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</td></tr>';
    }).join('');
    body.innerHTML = '<div class="res-head"><div><div class="res-title">Trade results<div class="res-date">' + day + '</div></div></div>'
      + '<div class="res-total' + (pct != null && pct < 0 ? ' dn' : '') + '">' + tot + '</div>'
      + '<div class="res-nav"><button type="button" data-o="1"' + (i >= days.length - 1 ? ' disabled' : '') + '>&lt;</button>'
      + '<button type="button" data-o="-1"' + (i <= 0 ? ' disabled' : '') + '>&gt;</button></div></div>'
      + (rows ? '<div class="res-scroll"><table class="res"><thead><tr><th>Symbol</th><th>Open</th><th>Close</th><th>Opened</th><th>Closed</th><th>Return</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
             : '<div class="res-empty">No closed positions.</div>');
    body.querySelectorAll('.res-nav button').forEach(function(b){
      b.addEventListener('click', function(){
        i += Number(b.getAttribute('data-o'));
        if (i < 0) i = 0;
        if (i > days.length - 1) i = days.length - 1;
        render();
      });
    });
  }

  function open(){
    if (!ov) build();
    ov.hidden = false;
    document.body.classList.add('tr-open');
    if (!days.length){
      body.innerHTML = '<div class="res-empty">Loading...</div>';
      fetch('/results?limit=30', { credentials: 'same-origin' })
        .then(function(x){ return x.ok ? x.json() : null; })
        .then(function(j){ days = ((j && j.days) || []).filter(function(d){ return d && d.day; }); i = 0; render(); })
        .catch(function(){ days = []; i = 0; render(); });
    }
    var x = ov.querySelector('.tr-x');
    if (x) x.focus();
  }
  function close(){
    if (!ov) return;
    ov.hidden = true;
    document.body.classList.remove('tr-open');
  }

  document.querySelectorAll('.tr-open').forEach(function(b){ b.addEventListener('click', open); });
})();