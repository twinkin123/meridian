/* ticker.js - extra assets, seamless scroll, one price fetch for the whole strip. Loaded last. */
(function(){
  'use strict';
  var box = document.querySelector('.tickers');
  if (!box) return;

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

  var map = {
    solana: 'SOL', 'usd-coin': 'USDC', bitcoin: 'BTC',
    ethereum: 'ETH', 'jupiter-exchange-solana': 'JUP'
  };

  EXTRA.forEach(function(e){
    map[e[2]] = e[0];
    var d = document.createElement('div');
    d.className = 'tk';
    d.innerHTML =
      '<span class="ic" style="background:' + e[3] + '1a;color:' + e[3] + '">' +
        '<img alt="" src="https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/' + e[0].toLowerCase() + '.svg">' +
      '</span>' +
      '<div><b>' + e[0] + '</b><small>' + e[1] + '</small></div>' +
      '<span class="px">--<em>--</em></span>';
    box.appendChild(d);
  });

  var track = document.createElement('div');
  track.className = 'tickers-track';
  while (box.firstChild) track.appendChild(box.firstChild);
  box.appendChild(track);

  track.querySelectorAll('.tk').forEach(function(c){
    track.appendChild(c.cloneNode(true));
  });

  track.querySelectorAll('.ic img').forEach(function(img){
    img.addEventListener('error', function(){
      var ic = img.parentElement;
      var sym = ic.parentElement.querySelector('b').textContent;
      img.remove();
      ic.textContent = sym.charAt(0);
    });
  });

  function fmt(n){
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function paint(){
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=' +
      Object.keys(map).join(',') + '&vs_currencies=usd&include_24hr_change=true')
      .then(function(r){ return r.json(); })
      .then(function(d){
        Object.keys(map).forEach(function(id){
          var p = d[id], sym = map[id];
          if (!p || typeof p.usd !== 'number') return;
          track.querySelectorAll('.tk').forEach(function(card){
            var b = card.querySelector('b');
            if (!b || b.textContent.trim() !== sym) return;
            var px = card.querySelector('.px');
            if (!px) return;
            px.childNodes[0].nodeValue = fmt(p.usd);
            var em = px.querySelector('em');
            if (!em) return;
            var c = p.usd_24h_change || 0;
            em.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
            em.className = c >= 0 ? 'up' : 'dn';
          });
        });
      })
      .catch(function(){});
  }

  paint();
  setInterval(paint, 60000);
})();