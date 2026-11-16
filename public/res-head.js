/* res-head.js - date under the title, drop the drawdown line, countdown in the balance card. Loaded last. */
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

  function clock(){
    var c = document.querySelector('.res-clock');
    var total = document.getElementById('total');
    var card = total && total.closest('.card');
    if (!c || !card || c.parentElement === card) return;
    card.classList.add('has-clock');
    card.appendChild(c);
  }

  function all(){ fix(); clock(); }

  all();
  new MutationObserver(all).observe(document.body, { childList: true, subtree: true });
})();