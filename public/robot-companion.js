/* robot companion: idle drift only, no pointer tracking */
(function () {
  var stage = document.getElementById('robotStage');
  if (!stage) return;
  var frame = stage.querySelector('.robot-frame');
  if (!frame) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var tx = 0, ty = 0, tr = 0;
  var cx = 0, cy = 0, cr = 0;
  var bump = 0, lean = 0, lastY = scrollY;

  addEventListener('scroll', function () {
    var d = scrollY - lastY;
    lastY = scrollY;
    lean = Math.max(-14, Math.min(14, lean + d * 0.22));
  }, { passive: true });

  function nudge() { bump = Math.min(1, bump + 0.7); }
  addEventListener('pointerdown', nudge, { passive: true });
  stage.addEventListener('click', nudge);

  var raf = 0;
  function loop(now) {
    var docked = stage.classList.contains('is-docked');
    var k = docked ? 0.42 : 1;

    tx = Math.sin(now / 2100) * 2.4 * k;
    ty = Math.sin(now / 1600 + 1.1) * 2.6 * k;
    tr = Math.sin(now / 2600) * 1.6 * k;

    lean *= 0.94;
    bump *= 0.9;

    cx += (tx - cx) * 0.1;
    cy += (ty + lean * 0.5 - bump * 7 - cy) * 0.12;
    cr += (tr - cr) * 0.1;

    var s = 1 + bump * 0.035;
    frame.style.transform =
      'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0) ' +
      'rotate(' + cr.toFixed(2) + 'deg) scale(' + s.toFixed(3) + ')';

    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  var vis = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { if (!raf) raf = requestAnimationFrame(loop); }
      else { cancelAnimationFrame(raf); raf = 0; }
    });
  }, { threshold: 0 });
  vis.observe(stage);
})();