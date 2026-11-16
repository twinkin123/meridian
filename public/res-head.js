/* res-head.js - date under the title, drop the profit/drawdown line. Loaded last. */
(function(){
  'use strict';

  function fix(){
    var t = document.querySelector('.res-title');
    if (t && !t.querySelector('.res-date') && t.textContent.indexOf(' - ') > -1){
      var parts = t.textContent.split(' - ');
      t.textContent = parts[0];
      var d = document.createElement('div');
      d.className = 'res-date';
      d.textContent = parts.slice(1).join(' - ');
      t.appendChild(d);
    }
    var s = document.querySelector('.res-sub');
    if (s) s.style.display = 'none';
  }

  fix();
  new MutationObserver(fix).observe(document.body, { childList: true, subtree: true });
})();