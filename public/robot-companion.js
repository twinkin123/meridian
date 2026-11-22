(function () {
  var stage = document.getElementById('robotStage');
  if (!stage) return;
  var frame = stage.querySelector('.robot-frame');
  if (!frame) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var fine = matchMedia('(pointer:fine)').matches;
  var tx = 0, ty = 0, tr = 0;
  var cx = 0, cy = 0, cr = 0;
  var px = -9999, py = -9999, movedAt = 0, bump = 0, lean = 0, lastY = 0, t = 0;

  function onMove(e) {
    px = e.clientX; py = e.clientY; movedAt = performance.now();
  }
  if (fine) addEventListener('pointermove', onMove, { passive: true });

  addEventListener('scroll', function () {
    var d = scrollY - lastY;
    lastY = scrollY;
    lean = Math.max(-14, Math.min(14, lean + d * 0.22));
  }, { passive: true });

  function nudge() { bump = Math.min(1, bump + 0.7); }
  addEventListener('pointerdown', nudge, { passive: true });
  stage.addEventListener('click', nudge);
  document.querySelectorAll('.btn').forEach(function (b) {
    b.addEventListener('pointerenter', function () { bump = Math.max(bump, 0.45); });
  });

  var raf = 0;
  function loop(now) {
    t = now;
    var docked = stage.classList.contains('is-docked');
    var k = docked ? 0.42 : 1;
    var idle = performance.now() - movedAt > 2200;

    if (fine && !idle) {
      var r = stage.getBoundingClientRect();
      var dx = px - (r.left + r.width / 2);
      var dy = py - (r.top + r.height / 2);
      tx = Math.max(-20, Math.min(20, dx * 0.045)) * k;
      ty = Math.max(-16, Math.min(16, dy * 0.045)) * k;
      tr = Math.max(-5, Math.min(5, dx * 0.012)) * k;
    } else {
      tx = Math.sin(now / 2100) * 2.4 * k;
      ty = Math.sin(now / 1600 + 1.1) * 2.6 * k;
      tr = Math.sin(now / 2600) * 1.6 * k;
    }

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
  lastY = scrollY;
  raf = requestAnimationFrame(loop);

  var vis = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { if (!raf) raf = requestAnimationFrame(loop); }
      else { cancelAnimationFrame(raf); raf = 0; }
    });
  }, { threshold: 0 });
  vis.observe(stage);
})();