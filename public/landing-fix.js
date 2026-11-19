/* landing-fix.js — keep the hero robot playing. One loop, no dead blocks. */
(function () {
  'use strict';
  var stage = document.getElementById('robotStage');
  if (!stage) return;
  var vids = Array.prototype.slice.call(stage.querySelectorAll('video'));
  if (!vids.length) return;

  function current() { return stage.querySelector('video.is-active') || vids[0]; }

  function play(v) {
    if (!v || !v.paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  vids.forEach(function (v) {
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.loop = true;
    v.setAttribute('preload', 'auto');
    ['loadeddata', 'canplay', 'canplaythrough', 'playing'].forEach(function (e) {
      v.addEventListener(e, function () { play(v); });
    });
    v.addEventListener('pause', function () { setTimeout(function () { play(v); }, 300); });
  });

  play(current());
  document.addEventListener('touchstart', function () { play(current()); }, { passive: true });

  /* refused autoplay on mobile: retry while the tab is visible */
  setInterval(function () { if (!document.hidden) play(current()); }, 1500);

  /* single frame loop drives the dock state */
  var docked = false;
  (function loop() {
    var on = window.scrollY > 220;
    if (on !== docked) { docked = on; stage.classList.toggle('is-docked', on); }
    requestAnimationFrame(loop);
  })();
})();