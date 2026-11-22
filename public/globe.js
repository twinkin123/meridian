(() => {
  const cv = document.getElementById('ncGlobe');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const host = cv.parentElement;
  let W = 0, H = 0, dpr = 1, raf = 0, running = false, t0 = 0, last = 0;
  const FRAME = 1000 / 45, PI2 = Math.PI * 2;

  const N = 900, GOLD = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GOLD;
    pts.push({ px: Math.cos(th) * r, pz: Math.sin(th) * r, y, nb: null });
  }

  for (let i = 0; i < N; i++) {
    const a = pts[i], cand = [];
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const b = pts[j];
      const d = a.px * b.px + a.y * b.y + a.pz * b.pz;
      if (d < 0.955) continue;
      cand.push([d + Math.random() * 0.05, j]);
    }
    cand.sort((u, v) => v[0] - u[0]);
    a.nb = cand.slice(0, 8).map((x) => x[1]);
  }

  const POW = new Float32Array(65);
  for (let i = 0; i <= 64; i++) POW[i] = Math.pow(i / 64, 1.9);
  const DOT = new Array(32);
  for (let i = 0; i < 32; i++) DOT[i] = `rgba(214,214,216,${(i / 31).toFixed(3)})`;
  const flash = new Float32Array(N);

  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  {
    const g = glow.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.42, 'rgba(255,255,255,.4)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  }

  const CAM = 9;
  const RINGS = [
    { tilt: 0.13, roll: 0.04, rad: 1.44, speed:  0.00019, phase: 0.0, size: 0.026, a: 0.34, text: 'DAILY CREDIT · CREDITED EVERY 24 HOURS · ', cache: null },
    { tilt: 0.19, roll: -0.06, rad: 1.66, speed: -0.00014, phase: 2.4, size: 0.024, a: 0.22, text: 'USDC ON SOLANA · APPEND-ONLY LEDGER · ', cache: null },
    { tilt: 0.10, roll: 0.10, rad: 1.90, speed:  0.00011, phase: 4.7, size: 0.022, a: 0.16, text: 'WITHDRAW ANYTIME · NO LOCK-UP · ', cache: null },
  ];
  const SPAN = 5.6;

  const strikes = [];
  const NODE_MS = 40, LIFE = 1500, GAP = 640, MAX = 10;
  let nextAt = 0;

  function makeStrike() {
    const used = new Set();
    let cur = Math.floor(Math.random() * N);
    used.add(cur);
    const nodes = [cur];
    const hops = 12 + Math.floor(Math.random() * 14);
    for (let k = 0; k < hops; k++) {
      const nb = pts[cur].nb;
      if (!nb || !nb.length) break;
      let pick = -1;
      const off = Math.floor(Math.random() * nb.length);
      for (let a = 0; a < nb.length; a++) {
        const c = nb[(a + off) % nb.length];
        if (!used.has(c)) { pick = c; break; }
      }
      if (pick < 0) break;
      used.add(pick); nodes.push(pick); cur = pick;
    }
    return nodes;
  }

  let discCv = null, coreCv = null;

  function layer() {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, g];
  }

  function build() {
    const R = Math.min(W, H) * 0.285, cx = W / 2, cy = H / 2;
    const d1 = layer()[0], d = d1.getContext('2d');
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const halo = d.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.0);
    halo.addColorStop(0, 'rgba(255,255,255,0.075)');
    halo.addColorStop(0.42, 'rgba(255,255,255,0.03)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = halo;
    d.beginPath(); d.arc(cx, cy, R * 2.0, 0, PI2); d.fill();
    const body = d.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.02);
    body.addColorStop(0, '#1d1d1e');
    body.addColorStop(0.50, '#151516');
    body.addColorStop(0.85, '#0e0e0f');
    body.addColorStop(1, '#0b0b0c');
    d.fillStyle = body;
    d.beginPath(); d.arc(cx, cy, R, 0, PI2); d.fill();
    discCv = d1;

    const c2 = layer()[0], c = c2.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.beginPath(); c.arc(cx, cy, R, 0, PI2); c.clip();
    const core = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    core.addColorStop(0, 'rgba(235,235,238,0.16)');
    core.addColorStop(0.26, 'rgba(200,200,205,0.11)');
    core.addColorStop(0.56, 'rgba(165,165,170,0.08)');
    core.addColorStop(0.80, 'rgba(130,130,136,0.055)');
    core.addColorStop(1, 'rgba(100,100,106,0.03)');
    c.fillStyle = core;
    c.beginPath(); c.arc(cx, cy, R, 0, PI2); c.fill();
    coreCv = c2;
  }

  function size() {
    const b = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = b.width; H = b.height;
    if (!W || !H) return;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    for (const r of RINGS) {
      const step = (r.size * 1.3) / r.rad;
      const n = Math.floor(SPAN / step);
      let str = '';
      while (str.length < n) str += r.text;
      r.cache = { s: str.slice(0, n), step, n };
    }
  }

  const pt = (ring, th, spin) => {
    const x0 = Math.cos(th) * ring.rad, y0 = Math.sin(th) * ring.rad;
    const cr = Math.cos(ring.roll), sr = Math.sin(ring.roll);
    const x = x0 * cr - y0 * sr, y = x0 * sr + y0 * cr, z = 0;
    const ct = Math.cos(ring.tilt), st = Math.sin(ring.tilt);
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    const cs = Math.cos(spin), ss = Math.sin(spin);
    const x3 = x * cs + z2 * ss, z3 = -x * ss + z2 * cs;
    const persp = CAM / (CAM - z3);
    return { X: x3 * persp, Y: y2 * persp, Z: z3, P: persp };
  };

  function drawRing(ring, t, R, cx, cy, back) {
    if (!ring.cache) return;
    const spin = ring.phase + t * ring.speed;
    ctx.font = `700 ${ring.size * R}px "Space Mono",monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const { s, step, n } = ring.cache;
    const start = -((n - 1) / 2) * step;

    for (let i = 0; i < n; i++) {
      const ch = s[i];
      if (ch === ' ') continue;
      const th = start + i * step;
      const q = pt(ring, th, spin);
      if (back ? q.Z >= 0 : q.Z < 0) continue;

      const q2 = pt(ring, th + 0.012, spin);
      const dx = (q2.X - q.X) * R, dy = (q2.Y - q.Y) * R;
      const want = Math.abs(R * q.P * 0.012);
      const sq = Math.min(1.1, Math.max(0.15, Math.hypot(dx, dy) / (want || 1)));
      const depth = Math.min(1, Math.max(0, (q.Z + ring.rad * 0.5) / ring.rad));
      const alpha = ring.a * (back ? 0.25 + 0.3 * depth : 0.55 + 0.45 * depth);

      ctx.save();
      ctx.translate(cx + q.X * R, cy + q.Y * R);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.scale(sq, 1);
      ctx.fillStyle = `rgba(205,205,205,${alpha})`;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  }

  function drawPath(ring, t, R, cx, cy, back) {
    const spin = ring.phase + t * ring.speed;
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= 120; k++) {
      const q = pt(ring, (k / 120) * PI2, spin);
      if (back ? q.Z >= 0 : q.Z < 0) { started = false; continue; }
      const x = cx + q.X * R, y = cy + q.Y * R;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.11)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw(t) {
    if (!W || !H) size();
    if (!discCv || !coreCv) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const R = Math.min(W, H) * 0.285, cx = W / 2, cy = H / 2;
    const tilt = -0.12, ct = Math.cos(tilt), st = Math.sin(tilt);
    const spin = t * 0.00012;
    const ca = Math.cos(spin), sa = Math.sin(spin);
    const pulse = 0.82 + 0.18 * Math.sin(t * 0.0019) + 0.05 * Math.sin(t * 0.0071);

    for (const r of RINGS) drawPath(r, t, R, cx, cy, true);
    for (const r of RINGS) drawRing(r, t, R, cx, cy, true);

    ctx.drawImage(discCv, 0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, pulse);
    ctx.drawImage(coreCv, 0, 0, W, H);
    for (let k = 0; k < 3; k++) {
      const a = t * (0.00042 + k * 0.00013) + k * 2.1;
      const px = cx + Math.cos(a) * R * 0.46;
      const py = cy + Math.sin(a * 1.17) * R * 0.42;
      const pr = R * (0.50 + 0.09 * Math.sin(t * 0.002 + k)) * 2;
      ctx.globalAlpha = 0.055 * pulse;
      ctx.drawImage(glow, px - pr / 2, py - pr / 2, pr, pr);
    }
    ctx.restore();

    if (t > nextAt) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) strikes.push({ nodes: makeStrike(), born: t + k * 80 });
      nextAt = t + GAP + Math.random() * 380;
    }
    while (strikes.length > MAX) strikes.shift();

    flash.fill(0);
    const live = [];
    for (const s of strikes) {
      const age = t - s.born;
      if (age < 0 || age > LIFE) continue;
      const head = age / NODE_MS;
      const proj = s.nodes.map((idx, i) => {
        const p = pts[idx];
        const xr = p.px * ca + p.pz * sa, zr = -p.px * sa + p.pz * ca;
        const y2 = p.y * ct - zr * st, z2 = p.y * st + zr * ct;
        const persp = 3.0 / (3.0 - z2);
        const since = head - i;
        const f = since >= 0 ? Math.exp(-since / 2.4) * Math.max(0, 1 - age / LIFE) : 0;
        if (f > 0.02 && f > flash[idx]) flash[idx] = f;
        return { sx: cx + xr * R * persp, sy: cy + y2 * R * persp, z: z2 };
      });
      live.push({ proj, head });
    }

    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const xr = p.px * ca + p.pz * sa, zr = -p.px * sa + p.pz * ca;
      const y2 = p.y * ct - zr * st, z2 = p.y * st + zr * ct;
      const persp = 3.0 / (3.0 - z2);
      const sx = cx + xr * R * persp, sy = cy + y2 * R * persp;
      const f = (z2 + 1) / 2;
      const fl = flash[i];
      const lit = Math.max(.10, Math.min(1, .30 + .70 * (((cx - sx) / R) * .38 + ((cy - sy) / R) * .32 + .30)));

      if (fl > 0.03) {
        ctx.beginPath();
        ctx.arc(sx, sy, (0.6 + 1.8 * f) * persp * (1 + fl * 2), 0, PI2);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, fl * 1.5)})`;
        ctx.fill();
        const gs = (2.0 + 3.0 * f) * persp * (1 + fl) * 2;
        ctx.globalAlpha = fl * 0.18;
        ctx.drawImage(glow, sx - gs / 2, sy - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
      }

      const a = (0.05 + 0.32 * POW[(f * 64) | 0]) * lit;
      ctx.beginPath();
      ctx.arc(sx, sy, (0.26 + 0.6 * f) * persp, 0, PI2);
      ctx.fillStyle = fl > 0.03
        ? `rgba(255,255,255,${Math.min(1, 0.6 + fl)})`
        : DOT[Math.min(31, (a / 0.38 * 31) | 0)];
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of live) {
      const seg = s.proj;
      for (let i = 0; i < seg.length - 1; i++) {
        if (i > s.head) break;
        const a = seg[i], b = seg[i + 1];
        if (a.z <= 0.02 || b.z <= 0.02) continue;
        const k = Math.exp(-(s.head - i) / 3.0);
        const j = Math.sin(t * 0.08 + i * 2.7) * 1.8 * k;
        ctx.beginPath();
        ctx.moveTo(a.sx + j, a.sy - j);
        ctx.lineTo(b.sx - j, b.sy + j);
        ctx.strokeStyle = `rgba(200,200,205,${0.15 * k})`;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.sx + j, a.sy - j);
        ctx.lineTo(b.sx + j * 0.35, b.sy + j * 0.35);
        ctx.lineTo(b.sx - j, b.sy + j);
        ctx.strokeStyle = `rgba(255,255,255,${0.62 * k})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      const h = Math.min(Math.floor(s.head), seg.length - 1);
      const hp = seg[h];
      if (hp && hp.z > 0.02) {
        ctx.globalAlpha = 0.40;
        ctx.drawImage(glow, hp.sx - 15, hp.sy - 15, 30, 30);
        ctx.globalAlpha = 1;
      }
    }

    const edge = ctx.createLinearGradient(cx - R, cy - R, cx + R * .6, cy + R);
    edge.addColorStop(0, `rgba(235,235,238,${0.34 * pulse})`);
    edge.addColorStop(.36, `rgba(190,190,195,${0.17 * pulse})`);
    edge.addColorStop(.72, `rgba(150,150,155,${0.08 * pulse})`);
    edge.addColorStop(1, `rgba(120,120,126,${0.035 * pulse})`);

    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.10;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, PI2); ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R - .5, 0, PI2); ctx.stroke();

    ctx.strokeStyle = `rgba(255,255,255,${0.24 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1.5, 0, PI2); ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';

    for (const r of RINGS) drawPath(r, t, R, cx, cy, false);
    for (const r of RINGS) drawRing(r, t, R, cx, cy, false);
  }

  const loop = (ts) => {
    if (!t0) t0 = ts;
    if (ts - last >= FRAME) { last = ts; draw(ts - t0); }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  size();
  if (reduce) draw(0); else start();

  let rt = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => { size(); if (reduce) draw(0); }, 120);
  }).observe(host);

  new IntersectionObserver((es) => es.forEach((e) => {
    if (reduce) return;
    if (e.isIntersecting) start(); else stop();
  }), { threshold: 0.15 }).observe(host);
})();