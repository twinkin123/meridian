/* ticker.js - uniform cards, prices and logos proxied through our own origin. */
(function(){
  'use strict';
  var box = document.querySelector('.tickers');
  if (!box) return;

  var ASSETS = [
    ['SOL','Solana','solana','#14F195'],
    ['USDC','USD Coin','usd-coin','#2775CA'],
    ['BTC','Bitcoin','bitcoin','#F7931A'],
    ['ETH','Ethereum','ethereum','#627EEA'],
    ['JUP','Jupiter','jupiter-exchange-solana','#C7F284'],
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

  var rev = {};
  ASSETS.forEach(function(a){ rev[a[0]] = a[2]; });

  function build(sym, name, id, color, price, chg, chgCls){
    var d = document.createElement('div');
    d.className = 'tk';
    d.dataset.id = id;
    d.dataset.sym = sym;
    d.style.setProperty('--c', color);

    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = sym.charAt(0);

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
    v.textContent = price || '--';
    var em = document.createElement('em');
    em.className = chgCls || 'dn';
    em.textContent = chg || '--';
    px.appendChild(v); px.appendChild(em);

    d.appendChild(ic); d.appendChild(t); d.appendChild(px);
    return d;
  }

  Array.prototype.slice.call(box.querySelectorAll('.tk')).forEach(function(card){
    var b = card.querySelector('b');
    var sym = b ? b.textContent.trim() : '';
    var id = rev[sym];
    if (!id) { card.remove(); return; }
    var a = ASSETS.filter(function(x){ return x[0] === sym; })[0];
    var small = card.querySelector('small');
    var px = card.querySelector('.px');
    var em = px ? px.querySelector('em') : null;
    var price = px && px.childNodes[0] ? px.childNodes[0].nodeValue.trim() : '';
    var chg = em ? em.textContent.trim() : '';
    var cls = em ? em.className : 'dn';
    card.parentNode.replaceChild(build(sym, small ? small.textContent : a[1], id, a[3], price, chg, cls), card);
  });

  ASSETS.forEach(function(a){
    if (box.querySelector('.tk[data-sym="' + a[0] + '"]')) return;
    box.appendChild(build(a[0], a[1], a[2], a[3], '', '', 'dn'));
  });

  var track = document.createElement('div');
  track.className = 'tickers-track';
  while (box.firstChild) track.appendChild(box.firstChild);
  box.appendChild(track);
  track.querySelectorAll('.tk').forEach(function(c){ track.appendChild(c.cloneNode(true)); });

  track.querySelectorAll('.tk').forEach(function(card){
    var ic = card.querySelector('.ic');
    var sym = card.dataset.sym;
    if (!ic || !sym) return;
    var img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('load', function(){ ic.textContent = ''; ic.appendChild(img); ic.classList.add('has'); });
    img.addEventListener('error', function(){ ic.classList.add('miss'); });
    img.src = '/market/logo/' + sym.toLowerCase();
  });

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
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  function paint(){
    var list = ids();
    if (!list.length) return;
    fetch('/market/prices?ids=' + list.join(','), { cache: 'no-store' })
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
          var c = p.chg || 0;
          em.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
          em.className = c >= 0 ? 'up' : 'dn';
        });
      })
      .catch(function(){
        if (tries++ < 5) { clearTimeout(timer); timer = setTimeout(paint, 10000 * tries); }
      });
  }

  paint();
  setInterval(paint, 60000);
})();