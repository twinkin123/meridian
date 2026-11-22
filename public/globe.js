(() => {
  const cv = document.getElementById('ncGlobe');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const host = cv.parentElement;
  let W = 0, H = 0, dpr = 1, raf = 0, running = false, t0 = 0;

  const N = 1350, GOLD = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GOLD;
    pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
  }

  const CAM = 9;
  const RINGS = [
    { tilt: 0.13, roll: 0.04, rad: 1.44, speed:  0.000062, phase: 0.0, size: 0.026, a: 0.34, text: 'DAILY CREDIT · CREDITED EVERY 24 HOURS · ' },
    { tilt: 0.19, roll: -0.06, rad: 1.66, speed: -0.000044, phase: 2.4, size: 0.024, a: 0.22, text: 'USDC ON SOLANA · APPEND-ONLY LEDGER · ' },
    { tilt: 0.10, roll: 0.10, rad: 1.90, speed:  0.000032, phase: 4.7, size: 0.022, a: 0.16, text: 'WITHDRAW ANYTIME · NO LOCK-UP · ' },
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
      const a = pts[cur];
      let best = -1, bestScore = -2;
      for (let i = 0; i < N; i++) {
        if (used.has(i)) continue;
        const b = pts[i];
        const d = a.x * b.x + a.y * b.y + a.z * b.z;
        if (d < 0.955) continue;
        const s = d + Math.random() * 0.05;
        if (s > bestScore) { bestScore = s; best = i; }
      }
      if (best < 0) break;
      used.add(best);
      nodes.push(best);
      cur = best;
    }
    return nodes;
  }

  function size() {
    const b = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = b.width; H = b.height;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function ringChars(ring) {
    const step = (ring.size * 1.3) / ring.rad;
    const n = Math.floor(SPAN / step);
    let s = '';
    while (s.length < n) s += ring.text;
    return { s: s.slice(0, n), step, n };
  }

  function drawRing(ring, t, R, cx, cy, back) {
    const spin = ring.phase + t * ring.speed;
    ctx.font = `700 ${ring.size * R}px "Space Mono",monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const { s, step, n } = ringChars(ring);
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
      ctx.fillStyle = `rgba(180,196,228,${alpha})`;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  }

  function drawPath(ring, t, R, cx, cy, back) {
    const spin = ring.phase + t * ring.speed;
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= 160; k++) {
      const q = pt(ring, (k / 160) * Math.PI * 2, spin);
      if (back ? q.Z >= 0 : q.Z < 0) { started = false; continue; }
      const x = cx + q.X * R, y = cy + q.Y * R;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(110,135,195,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw(t) {
    if (!W || !H) size();
    ctx.clearRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.285, cx = W / 2, cy = H / 2;
    const tilt = -0.12, ct = Math.cos(tilt), st = Math.sin(tilt);
    const spin = t * 0.00012;
    const ca = Math.cos(spin), sa = Math.sin(spin);
    const pulse = 0.82 + 0.18 * Math.sin(t * 0.0019) + 0.05 * Math.sin(t * 0.0071);

    for (const r of RINGS) drawPath(r, t, R, cx, cy, true);
    for (const r of RINGS) drawRing(r, t, R, cx, cy, true);

    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.0);
    halo.addColorStop(0, `rgba(70,100,190,${0.10 * pulse})`);
    halo.addColorStop(0.42, `rgba(70,55,175,${0.04 * pulse})`);
    halo.addColorStop(1, 'rgba(70,55,175,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2.0, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(cx, cy, R * .05, cx, cy, R * 1.02);
    body.addColorStop(0, '#141a2a');
    body.addColorStop(.50, '#0e1220');
    body.addColorStop(.85, '#090c15');
    body.addColorStop(1, '#070910');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    const coreR = R * (0.97 + 0.03 * pulse);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, `rgba(120,155,235,${0.22 * pulse})`);
    core.addColorStop(0.26, `rgba(78,105,200,${0.15 * pulse})`);
    core.addColorStop(0.56, `rgba(58,68,160,${0.11 * pulse})`);
    core.addColorStop(0.80, `rgba(45,42,120,${0.075 * pulse})`);
    core.addColorStop(1, `rgba(34,30,85,${0.04 * pulse})`);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

    for (let k = 0; k < 3; k++) {
      const a = t * (0.00042 + k * 0.00013) + k * 2.1;
      const px = cx + Math.cos(a) * R * 0.46;
      const py = cy + Math.sin(a * 1.17) * R * 0.42;
      const pr = R * (0.50 + 0.09 * Math.sin(t * 0.002 + k));
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      const tint = k === 0 ? '60,150,205' : k === 1 ? '90,80,205' : '60,185,170';
      g.addColorStop(0, `rgba(${tint},${0.085 * pulse})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (t > nextAt) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) strikes.push({ nodes: makeStrike(), born: t + k * 80 });
      nextAt = t + GAP + Math.random() * 380;
    }
    while (strikes.length > MAX) strikes.shift();

    const flash = new Map();
    const live = [];
    for (const s of strikes) {
      const age = t - s.born;
      if (age < 0) continue;
      if (age > LIFE) continue;
      const head = age / NODE_MS;
      const proj = s.nodes.map((idx, i) => {
        const p = pts[idx];
        const cp = Math.cos(Math.asin(p.y));
        const x = cp * Math.sin(Math.atan2(p.x, p.z)), z0 = cp * Math.cos(Math.atan2(p.x, p.z));
        const xr = x * ca + z0 * sa, zr = -x * sa + z0 * ca;
        const y2 = p.y * ct - zr * st, z2 = p.y * st + zr * ct;
        const persp = 3.0 / (3.0 - z2);
        const sx = cx + xr * R * persp, sy = cy + y2 * R * persp;
        const since = head - i;
        const f = since >= 0 ? Math.exp(-since / 2.4) * Math.max(0, 1 - age / LIFE) : 0;
        if (f > 0.02) flash.set(idx, Math.max(flash.get(idx) || 0, f));
        return { sx, sy, z: z2, f, i };
      });
      live.push({ proj, head });
    }

    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const cp = Math.cos(Math.asin(p.y)), sp = p.y;
      const x = cp * Math.sin(Math.atan2(p.x, p.z)), z0 = cp * Math.cos(Math.atan2(p.x, p.z));
      const xr = x * ca + z0 * sa, zr = -x * sa + z0 * ca;
      const y2 = sp * ct - zr * st, z2 = sp * st + zr * ct;
      const persp = 3.0 / (3.0 - z2);
      const sx = cx + xr * R * persp, sy = cy + y2 * R * persp;
      const f = (z2 + 1) / 2;
      const fl = flash.get(i) || 0;
      const lit = Math.max(.10, Math.min(1, .30 + .70 * (((cx - sx) / R) * .38 + ((cy - sy) / R) * .32 + .30)));

      if (fl > 0.03) {
        ctx.beginPath();
        ctx.arc(sx, sy, (0.6 + 1.8 * f) * persp * (1 + fl * 2), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(222,248,255,${Math.min(1, fl * 1.5)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, (2.0 + 3.0 * f) * persp * (1 + fl), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(105,195,240,${fl * 0.20})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, (0.26 + 0.6 * f) * persp, 0, Math.PI * 2);
      ctx.fillStyle = fl > 0.03
        ? `hsla(188,100%,${78 + 18 * fl}%,${Math.min(1, 0.6 + fl)})`
        : `hsla(${202 + 52 * f},90%,${52 + 17 * f}%,${(0.05 + 0.34 * Math.pow(f, 1.9)) * lit})`;
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
        ctx.strokeStyle = `rgba(85,175,225,${0.17 * k})`;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.sx + j, a.sy - j);
        ctx.lineTo(b.sx + j * 0.35, b.sy + j * 0.35);
        ctx.lineTo(b.sx - j, b.sy + j);
        ctx.strokeStyle = `rgba(228,250,255,${0.66 * k})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }

      const h = Math.min(Math.floor(s.head), seg.length - 1);
      const hp = seg[h];
      if (hp && hp.z > 0.02) {
        const g = ctx.createRadialGradient(hp.sx, hp.sy, 0, hp.sx, hp.sy, 30);
        g.addColorStop(0, 'rgba(200,244,255,.45)');
        g.addColorStop(1, 'rgba(105,195,240,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hp.sx, hp.sy, 30, 0, Math.PI * 2); ctx.fill();
      }
    }

    const edge = ctx.createLinearGradient(cx - R, cy - R, cx + R * .6, cy + R);
    edge.addColorStop(0, `rgba(160,190,240,${0.38 * pulse})`);
    edge.addColorStop(.36, `rgba(95,130,205,${0.19 * pulse})`);
    edge.addColorStop(.72, `rgba(68,85,170,${0.09 * pulse})`);
    edge.addColorStop(1, `rgba(52,40,125,${0.04 * pulse})`);

    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.11;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R - .5, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = `rgba(220,240,255,${0.26 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';

    for (const r of RINGS) drawPath(r, t, R, cx, cy, false);
    for (const r of RINGS) drawRing(r, t, R, cx, cy, false);
  }

  const loop = (ts) => { if (!t0) t0 = ts; draw(ts - t0); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  size();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) draw(0); else start();

  new ResizeObserver(() => { size(); if (reduce) draw(0); }).observe(host);
  new IntersectionObserver((es) => es.forEach((e) => {
    if (reduce) return;
    e.isIntersecting ? start() : stop();
  }), { threshold: 0.15 }).observe(host);
})();