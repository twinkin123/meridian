/* ticker.js - extra assets, seamless scroll, one price fetch for the whole strip. Loaded last. */
(function(){
  'use strict';
  var box = document.querySelector('.tickers');
  if (!box) return;

  var CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/';

  var EXTRA = [
    ['BNB','BNB','binancecoin','#f3ba2f'],
    ['XRP','XRP','ripple','#23292f'],
    ['ADA','Cardano','cardano','#0033ad'],
    ['DOGE','Dogecoin','dogecoin','#c2a633'],
    ['AVAX','Avalanche','avalanche-2','#e84142'],
    ['TRX','TRON','tron','#eb0029'],
    ['LINK','Chainlink','chainlink','#2a5ada'],
    ['DOT','Polkadot','polkadot','#e6007a'],
    ['LTC','Litecoin','litecoin','#a6a9aa'],
    ['BCH','Bitcoin Cash','bitcoin-cash','#8dc351'],
    ['XLM','Stellar','stellar','#7d00ff'],
    ['UNI','Uniswap','uniswap','#ff007a'],
    ['NEAR','NEAR','near','#00c08b'],
    ['ATOM','Cosmos','cosmos','#2e3148'],
    ['ARB','Arbitrum','arbitrum','#28a0f0']
  ];

  var map = { solana:'SOL', 'usd-coin':'USDC', bitcoin:'BTC', ethereum:'ETH', 'jupiter-exchange-solana':'JUP' };
  var rev = {};
  var color = { SOL:'#14F195', USDC:'#2775CA', BTC:'#F7931A', ETH:'#627EEA', JUP:'#C7F284' };
  Object.keys(map).forEach(function(id){ rev[map[id]] = id; });
  EXTRA.forEach(function(e){ map[e[2]] = e[0]; rev[e[0]] = e[2]; color[e[0]] = e[3]; });

  function build(sym, name, id){
    var d = document.createElement('div');
    d.className = 'tk';
    d.dataset.id = id;
    if (color[sym]) d.style.setProperty('--c', color[sym]);

    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = sym.charAt(0);

    var img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.src = CDN + sym.toLowerCase() + '.svg';
    img.addEventListener('load', function(){ ic.textContent = ''; ic.appendChild(img); ic.classList.add('has'); });
    img.addEventListener('error', function(){ ic.classList.add('miss'); });

    var t = document.createElement('span');
    t.className = 'tk-t';
    var b = document.createElement('b');
    b.textContent = sym;
    var s = document.createElement('small');
    s.textContent = name;
    t.appendChild(b); t.appendChild(s);

    var px = document.createElement('span');
    px.className = 'px';
    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = '--';
    var em = document.createElement('em');
    em.className = 'dn';
    em.textContent = '--';
    px.appendChild(v); px.appendChild(em);

    d.appendChild(ic); d.appendChild(t); d.appendChild(px);
    return d;
  }

  EXTRA.forEach(function(e){ box.appendChild(build(e[0], e[1], e[2])); });

  var track = document.createElement('div');
  track.className = 'tickers-track';
  while (box.firstChild) track.appendChild(box.firstChild);
  box.appendChild(track);
  track.querySelectorAll('.tk').forEach(function(c){ track.appendChild(c.cloneNode(true)); });

  function fmt(n){
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  var data = {}, tries = 0, timer = null;

  function ids(){
    var out = [];
    track.querySelectorAll('.tk').forEach(function(c){
      var id = c.dataset.id;
      if (!id) {
        var b = c.querySelector('b');
        id = b ? rev[b.textContent.trim()] : null;
        if (id) c.dataset.id = id;
      }
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  function paint(){
    var list = ids();
    if (!list.length) return;
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + list.join(',') +
          '&vs_currencies=usd&include_24hr_change=true', { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function(d){
        tries = 0;
        Object.keys(d).forEach(function(k){ data[k] = d[k]; });
        track.querySelectorAll('.tk').forEach(function(card){
          var p = data[card.dataset.id];
          if (!p || typeof p.usd !== 'number') return;
          var px = card.querySelector('.px');
          if (!px) return;
          var v = px.querySelector('.v');
          if (v) v.textContent = fmt(p.usd);
          else if (px.childNodes[0]) px.childNodes[0].nodeValue = fmt(p.usd);
          var em = px.querySelector('em');
          if (!em) return;
          var c = p.usd_24h_change || 0;
          em.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
          em.className = c >= 0 ? 'up' : 'dn';
        });
      })
      .catch(function(){
        if (tries++ < 4) { clearTimeout(timer); timer = setTimeout(paint, 3000 * tries); }
      });
  }

  paint();
  setInterval(paint, 60000);
})();