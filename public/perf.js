(() => {
  const coarse = matchMedia('(pointer:coarse)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. one scheduler caps every rAF loop already on the page */
  const native = window.requestAnimationFrame.bind(window);
  const capMs = coarse ? 1000 / 26 : 1000 / 55;
  let q = [], seq = 1, drive = 0, lastT = 0;
  function flush(ts) {
    drive = 0;
    if (ts - lastT >= capMs) {
      lastT = ts;
      const batch = q; q = [];
      for (let i = 0; i < batch.length; i++) {
        if (batch[i].done) continue;
        try { batch[i].cb(ts); } catch (e) {}
      }
    }
    if (q.length && !drive) drive = native(flush);
  }
  window.requestAnimationFrame = function (cb) {
    const rec = { cb, done: false, key: seq++ };
    q.push(rec);
    if (!drive) drive = native(flush);
    return rec.key;
  };
  window.cancelAnimationFrame = function (key) {
    for (let i = 0; i < q.length; i++) if (q[i].key === key) { q[i].done = true; return; }
  };

  /* 2. run the particle field at reduced resolution */
  const fx = document.getElementById('fx');
  let fxT = 0;
  function shrinkFx() {
    if (!fx || reduce) return;
    const s = coarse ? 0.55 : 0.8;
    const w = Math.max(1, Math.round(innerWidth * s));
    const h = Math.max(1, Math.round(innerHeight * s));
    if (fx.width === w && fx.height === h) return;
    fx.width = w; fx.height = h;
    fx.getContext('2d').setTransform(s, 0, 0, s, 0, 0);
  }
  if (fx) {
    shrinkFx();
    addEventListener('resize', () => { clearTimeout(fxT); fxT = setTimeout(shrinkFx, 180); }, { passive: true });
    setInterval(shrinkFx, 1500);
  }

  /* 3. only the active robot video decodes */
  const vids = Array.prototype.slice.call(document.querySelectorAll('.robot-frame video'));
  if (vids.length) {
    vids.forEach((v, i) => { if (i) v.setAttribute('preload', 'metadata'); });
    const guard = () => {
      for (const v of vids) if (!v.classList.contains('is-active') && !v.paused) v.pause();
    };
    setInterval(guard, 900);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) vids.forEach(v => v.pause());
      else {
        const a = vids.find(v => v.classList.contains('is-active'));
        if (a) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
      }
    });
  }

  /* 4. replace the feTurbulence grain with a cached bitmap tile */
  const grain = document.getElementById('grain');
  if (grain) {
    if (coarse) grain.style.display = 'none';
    else {
      try {
        const n = document.createElement('canvas');
        n.width = n.height = 100;
        const g = n.getContext('2d');
        const d = g.createImageData(100, 100);
        for (let i = 0; i < d.data.length; i += 4) {
          const v = 110 + Math.random() * 145;
          d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
          d.data[i + 3] = Math.random() * 100;
        }
        g.putImageData(d, 0, 0);
        while (grain.firstChild) grain.removeChild(grain.firstChild);
        grain.style.backgroundImage = 'url(' + n.toDataURL('image/png') + ')';
        grain.style.backgroundRepeat = 'repeat';
        grain.style.backgroundSize = '100px 100px';
      } catch (e) {}
    }
  }

  /* 5. coalesce pointermove-driven style writes to one per frame */
  const prodSections = Array.prototype.slice.call(document.querySelectorAll('.prod'));
  let px = 0, py = 0, pend = false;
  function apply() {
    pend = false;
    for (const s of prodSections) { s.style.setProperty('--mx', px + 'px'); s.style.setProperty('--my', py + 'px'); }
  }
  if (prodSections.length && !coarse) {
    addEventListener('pointermove', (e) => {
      const r = prodSections[0].getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top;
      if (!pend) { pend = true; requestAnimationFrame(apply); }
    }, { passive: true });
  }
})();