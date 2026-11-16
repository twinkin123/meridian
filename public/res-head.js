/* res-head.js - date under the title, drop the note and drawdown line, single countdown in the balance card. */
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
    var n = document.querySelector('.res-note');
    if (n) n.remove();
  }

  function clock(){
    var total = document.getElementById('total');
    var card = total && total.closest('.card');
    if (!card) return;
    var list = document.querySelectorAll('.res-clock');
    if (!list.length) return;

    var keep = null;
    for (var i = 0; i < list.length; i++){
      if (card.contains(list[i])) { keep = list[i]; break; }
    }
    if (!keep) keep = list[0];
    for (var j = 0; j < list.length; j++){
      if (list[j] !== keep) list[j].remove();
    }
    if (keep.parentElement !== card){
      card.classList.add('has-clock');
      card.appendChild(keep);
    }
  }

  function all(){ fix(); clock(); }

  all();
  new MutationObserver(all).observe(document.body, { childList: true, subtree: true });
})();/* bell: clear the unread dot on click */
(function(){ var b = document.getElementById("bell"); if (!b) return; b.addEventListener("click", function(){ var d = b.querySelector("i"); if (d) d.remove(); }); })();
