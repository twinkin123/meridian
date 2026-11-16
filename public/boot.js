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

  function reveal(){
    document.documentElement.classList.remove('boot');
  }
  requestAnimationFrame(function(){ requestAnimationFrame(reveal); });
})();/* no stale poster: reveal the video only once it has a frame */
(function(){ var v = document.querySelector(".robot-card video"); if (!v) return; v.removeAttribute("poster"); var live = function(){ v.classList.add("live"); }; if (v.readyState >= 2) live(); v.addEventListener("loadeddata", live); v.addEventListener("playing", live); setTimeout(live, 1200); })();
