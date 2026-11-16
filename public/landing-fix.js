/* landing-fix.js - keep the hero robot playing on iOS and Android. */
(function(){
  'use strict';
  var v = document.querySelector('.mascot');
  if (!v || v.tagName !== 'VIDEO') return;

  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute('muted', '');
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.loop = true;
  v.preload = 'auto';

  function go(){
    if (!v.paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function(){});
  }

  go();

  ['loadeddata', 'canplay', 'canplaythrough', 'stalled', 'suspend'].forEach(function(e){
    v.addEventListener(e, go);
  });

  document.addEventListener('touchstart', go, { passive: true });
  document.addEventListener('click', go);
  document.addEventListener('scroll', go, { passive: true });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) go(); });
  v.addEventListener('pause', function(){ setTimeout(go, 300); });
  setInterval(function(){ if (v.paused && !document.hidden) go(); }, 2000);
})();