/* boot.js - reveal after the deferred passes finish, and keep the robot playing. */
(function(){
  'use strict';
  var v = document.querySelector('.robot-card video');
  if (v){
    v.muted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    var go = function(){ var p = v.play(); if (p) p.catch(function(){}); };
    go();
    v.addEventListener('pause', function(){ setTimeout(go, 250); });
    document.addEventListener('click', go, { once: true });
    document.addEventListener('touchstart', go, { once: true });
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) go(); });
    setInterval(function(){ if (v.paused) go(); }, 1500);
  }
  function reveal(){ document.documentElement.classList.remove('boot'); }
  (function w(){ if (document.querySelector('.res-head') || performance.now() > 1600){ document.documentElement.classList.remove('boot'); return; } setTimeout(w, 60); })();
})();
(function(){ var v = document.querySelector(".robot-card video"); if (!v) return; v.removeAttribute("poster"); var live = function(){ v.classList.add("live"); }; if (v.readyState >= 2) live(); v.addEventListener("loadeddata", live); v.addEventListener("playing", live); setTimeout(live, 1200); })();
(function(){function mk(){var d=document.createElement("div");d.id="boot";d.setAttribute("aria-hidden","true");d.innerHTML="<b>Quvio</b><i></i>";document.body.appendChild(d);return d;}window.boot=function(ms){var o=document.getElementById("boot");if(o)o.remove();var d=mk();setTimeout(function(){d.classList.add("out");setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},700);},ms||450);};if(document.body){window.boot(700);}else{document.addEventListener("DOMContentLoaded",function(){window.boot(700);});}})();