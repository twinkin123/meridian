/* res-head.js - date under the title, drop note/sub, single countdown, mobile order. */
(function(){
  'use strict';

  function fix(){
    var t = document.querySelector('.res-title');
    if (t && !t.querySelector('.res-date')){
      var parts = t.textContent.split(/\s*[-\u2013\u2014\u00b7]\s*/);
      if (parts.length > 1){
        t.textContent = parts[0];
        var d = document.createElement('div');
        d.className = 'res-date';
        d.textContent = parts.slice(1).join(' ');
        t.appendChild(d);
      }
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
})();

/* bell: clear the unread dot on click */
(function(){ var b = document.getElementById("bell"); if (!b) return; b.addEventListener("click", function(){ var d = b.querySelector("i"); if (d) d.remove(); }); })();

/* mobile: results card above the deposit address card */
(function(){ var addr = document.getElementById("addr"); if (!addr) return; var dep = addr.closest(".card"); var home = null, next = null; function apply(){ var h = document.querySelector(".res-head"); var r = h && h.closest(".card"); if (!r || !dep) return; if (!home){ home = r.parentElement; next = r.nextElementSibling; } if (window.matchMedia("(max-width:900px)").matches){ if (r.nextElementSibling !== dep && r.previousElementSibling !== dep){ dep.parentElement.insertBefore(r, dep); } } else if (r.parentElement !== home){ home.insertBefore(r, next); } } apply(); [300, 900, 1800].forEach(function(t){ setTimeout(apply, t); }); window.addEventListener("resize", apply); })();

/* retry the mobile move until the card has rendered */
(function(){ if (!window.matchMedia("(max-width:900px)").matches) return; var n = 0; var t = setInterval(function(){ var h = document.querySelector(".res-head"); var r = h && h.closest(".card"); var a = document.getElementById("addr"); var d = a && a.closest(".card"); if (r && d && r.nextElementSibling !== d){ d.parentElement.insertBefore(r, d); } if (++n > 40) clearInterval(t); }, 250); })();/* mobile: animated robot in the nav strip */
(function(){ if (!window.matchMedia("(max-width: 900px)").matches) return; var card = document.querySelector(".robot-card"); if (!card) return; var v = card.querySelector("video"); if (!v) return; v.pause(); v.style.display = "none"; var img = document.createElement("img"); img.src = "/img/robot.webp"; img.alt = ""; img.className = "robot-still"; card.appendChild(img); })();
/* claim: disabled unless held reaches the minimum */
(function(){ var b = document.getElementById("claimBtn"); if (!b) return; function upd(){ fetch("/wallet/balance").then(function(r){ return r.json(); }).then(function(j){ var h = BigInt(j.held || "0"); b.disabled = h < 10000000n; b.title = b.disabled ? "Held deposits must reach $10 before they can be claimed" : ""; }).catch(function(){}); } upd(); setInterval(upd, 15000); })();
