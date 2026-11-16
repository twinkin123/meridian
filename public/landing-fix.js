/* landing-fix.js - keep the hero robot playing on iOS and Android. */
(function(){
  'use strict';
  var stage = document.getElementById('robotStage');
  if (!stage) return;
  var vids = Array.prototype.slice.call(stage.querySelectorAll('video'));
  if (!vids.length) return;

  function active(){
    return stage.querySelector('video.is-active') || vids[0];
  }

  function prep(v){
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.loop = true;
    v.setAttribute('preload', 'auto');
  }

  function play(v){
    if (!v || !v.paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function(){});
  }

  function go(){ play(active()); }

  vids.forEach(function(v){
    prep(v);
    ['loadeddata', 'canplay', 'canplaythrough'].forEach(function(e){
      v.addEventListener(e, function(){ play(v); });
    });
    v.addEventListener('pause', function(){ setTimeout(go, 300); });
  });

  vids.forEach(function(v){
    var s = v.getAttribute('src');
    if (s){ v.setAttribute('src', s); v.load(); }
  });

  go();

  document.addEventListener('touchstart', go, { passive: true });
  document.addEventListener('click', go);
  document.addEventListener('scroll', go, { passive: true });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) go(); });
  setInterval(function(){ if (!document.hidden) go(); }, 2000);
})();