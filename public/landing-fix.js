/* landing-fix.js - keep the hero robot playing on iOS and Android. */
(function(){
  'use strict';
  var stage = document.getElementById('robotStage');
  if (!stage) return;
  var vids = Array.prototype.slice.call(stage.querySelectorAll('video'));
  if (!vids.length) return;

  function active(){ return stage.querySelector('video.is-active') || vids[0]; }

  function prep(v){
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', ''); v.setAttribute('autoplay', '');
    v.setAttribute('autoplay', '');
    v.loop = true;
    v.setAttribute('preload', 'auto');
  }

  function play(v){
    if (!v) return;
    v.style.opacity = '1';
    if (!v.paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function(){});
  }

  function go(){ play(active()); }

  vids.forEach(function(v){ prep(v); });

  vids.forEach(function(v){
    var s = v.getAttribute('src');
    if (s){ v.setAttribute('src', s); v.load(); }
  });

  vids.forEach(function(v){
    ['loadeddata', 'canplay', 'canplaythrough', 'playing'].forEach(function(e){
      v.addEventListener(e, function(){ play(v); });
    });
    v.addEventListener('pause', function(){ setTimeout(go, 300); });
  });

  go(); setTimeout(go, 200); setTimeout(go, 700);
  requestAnimationFrame(go);
  setTimeout(go, 200);
  setTimeout(go, 700);

  document.addEventListener('touchstart', go, { passive: true });
  document.addEventListener('click', go);
  document.addEventListener('scroll', go, { passive: true });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) go(); setTimeout(go, 200); setTimeout(go, 700); });
  setInterval(function(){ if (!document.hidden) go(); setTimeout(go, 200); setTimeout(go, 700); }, 1500);
})();
/* mobile + refused autoplay: swap in a still, no play glyph */
(function(){ var mobile = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer: coarse)").matches; if (mobile) return; var stage = document.getElementById("robotStage"); if (!stage) return; var vids = Array.prototype.slice.call(stage.querySelectorAll("video")); function still(v){ if (v.__still) return; var img = document.createElement("img"); img.src = "/img/robot-still.jpg"; img.alt = ""; img.className = "robot-still"; img.addEventListener("click", function(){ var p = v.play(); if (p && p.catch) p.catch(function(){}); }); img.onerror = function(){ unstill(v); }; v.parentElement.insertBefore(img, v.nextSibling); v.style.visibility = "hidden"; v.__still = img; } function unstill(v){ if (!v.__still) return; v.__still.remove(); v.__still = null; v.style.visibility = ""; } vids.forEach(function(v){ v.addEventListener("playing", function(){ unstill(v); }); }); setTimeout(function(){ vids.forEach(function(v){ if (v.paused) still(v); }); }, 1200); })();
(function(){ var mobile = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer: coarse)").matches; if (mobile) return; var stage = document.getElementById("robotStage"); if (!stage) return; var vids = Array.prototype.slice.call(stage.querySelectorAll("video")); function still(v){ if (v.__still) return; var img = document.createElement("img"); img.src = "/img/robot-still.jpg"; img.alt = ""; img.className = "robot-still"; img.addEventListener("click", function(){ var p = v.play(); if (p && p.catch) p.catch(function(){}); }); img.onerror = function(){ unstill(v); }; v.parentElement.insertBefore(img, v.nextSibling); v.style.visibility = "hidden"; v.__still = img; } function unstill(v){ if (!v.__still) return; v.__still.remove(); v.__still = null; v.style.visibility = ""; } vids.forEach(function(v){ v.addEventListener("playing", function(){ unstill(v); }); }); setTimeout(function(){ vids.forEach(function(v){ if (v.paused) still(v); }); }, 1200); })();
/* mobile: animated image instead of video, animates in low power mode */
(function(){ var mobile = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer: coarse)").matches; if (mobile) return; var stage = document.getElementById("robotStage"); if (!stage) return; stage.querySelectorAll("video").forEach(function(v){ v.pause(); v.style.display = "none"; }); var frame = stage.querySelector(".robot-frame"); if (!frame) return; var img = document.createElement("img"); img.src = "/img/robot.webp"; img.alt = ""; img.className = "robot-still"; img.style.opacity = "1"; img.style.pointerEvents = "none"; frame.appendChild(img); })();
(function(){ var mobile = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer: coarse)").matches; if (mobile) return; var stage = document.getElementById("robotStage"); if (!stage) return; stage.querySelectorAll("video").forEach(function(v){ v.pause(); v.style.display = "none"; }); var frame = stage.querySelector(".robot-frame"); if (!frame) return; var img = document.createElement("img"); img.src = "/img/robot.webp"; img.alt = ""; img.className = "robot-still"; img.style.opacity = "1"; img.style.pointerEvents = "none"; frame.appendChild(img); })();

/* corner robot once the hero robot leaves the viewport */
(function(){ var stage = document.getElementById("robotStage"); if (!stage) return; var img = document.createElement("img"); img.src = "/img/robot.webp"; img.alt = ""; img.className = "robot-corner"; img.src = "/img/robot-corner.webp"; img.style.display = "none"; document.body.appendChild(img); var io = new IntersectionObserver(function(es){ es.forEach(function(e){ img.classList.toggle("on", !e.isIntersecting); }); }, { threshold: 0 }); io.observe(stage); })();
/* corner robot only while the hero robot is fully above the fold */
(function(){ var stage = document.getElementById("robotStage"); var img = document.querySelector(".robot-corner"); if (!stage || !img) return; function upd(){ var r = stage.getBoundingClientRect(); img.style.display = (r.bottom < 0 && window.scrollY > 200) ? "block" : "none"; } (function loop(){ upd(); requestAnimationFrame(loop); })(); })();
/* corner robot: per-frame check, authoritative */
/* corner robot: per-frame check, authoritative */
(function(){ var stage = document.getElementById("robotStage"); var img = document.querySelector(".robot-corner"); if (!stage || !img) return; (function loop(){ var r = stage.getBoundingClientRect(); img.style.display = (r.bottom < 0 && window.scrollY > 200) ? "block" : "none"; requestAnimationFrame(loop); })(); })();







