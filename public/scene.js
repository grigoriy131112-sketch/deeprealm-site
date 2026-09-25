// Animated night scene painted behind the whole site: a distant keep on a
// cliff, drifting mist, rising embers and a slow parallax reply to the mouse
// and scroll. Pure canvas 2D, no dependencies. The stylesheet keeps a plain
// gradient underneath, so a browser without 2D canvas still looks fine.
(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  let ctx = null;
  try {
    ctx = canvas.getContext('2d', { alpha: false });
  } catch (err) {
    ctx = null;
  }
  if (!ctx) return;

  const TAU = Math.PI * 2;
  const MAX_DPR = 1.5;   // 2 would triple layer memory on retina laptops
  const EXTRA = 140;     // slack under the fold so parallax never shows a gap
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const still = !!(mq && mq.matches);

  const style = getComputedStyle(document.documentElement);
  const cssColor = (name, fallback) => {
    const raw = (style.getPropertyValue(name) || '').trim();
    return /^#[0-9a-f]{3,6}$/i.test(raw) ? raw : fallback;
  };
  const C = {
    gold: cssColor('--gold', '#c9a24b'),
    goldBright: cssColor('--gold-bright', '#e6c877'),
    blood: cssColor('--blood', '#8a1f2b')
  };

  const rgba = (color, a) => {
    const h = color.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
  };

  function seeded(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let W = 1, H = 1, dpr = 1;
  let skyLayer = null, terrainLayer = null, vignette = null;
  let gateX = 0;
  const stars = [], twinklers = [], puffs = [], embers = [], lights = [];

  let shiftX = 0, shiftY = 0, wantX = 0, wantY = 0, scrollDrift = 0;
  let rafId = 0, lastFrame = 0;

  const makeLayer = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, g };
  };

  function makeVignette() {
    const v = document.createElement('canvas');
    v.width = v.height = 256;
    const g = v.getContext('2d');
    const radial = g.createRadialGradient(128, 120, 30, 128, 120, 176);
    radial.addColorStop(0, 'rgba(0,0,0,0)');
    radial.addColorStop(0.62, 'rgba(0,0,0,0.14)');
    radial.addColorStop(1, 'rgba(0,0,0,0.46)');
    g.fillStyle = radial;
    g.fillRect(0, 0, 256, 256);
    const floor = g.createLinearGradient(0, 150, 0, 256);
    floor.addColorStop(0, 'rgba(0,0,0,0)');
    floor.addColorStop(1, 'rgba(0,0,0,0.34)');
    g.fillStyle = floor;
    g.fillRect(0, 150, 256, 106);
    return v;
  }

  function makeSky() {
    const { c, g } = makeLayer(W, H);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05040a');
    sky.addColorStop(0.4, '#100b20');
    sky.addColorStop(0.68, '#241129');
    sky.addColorStop(0.86, '#3a1620');
    sky.addColorStop(1, '#0a070c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // The sunken kingdom still burns low on the horizon.
    const haze = g.createRadialGradient(W * 0.5, H * 0.96, 0, W * 0.5, H * 0.96, Math.max(W, H) * 0.55);
    haze.addColorStop(0, rgba(C.blood, 0.32));
    haze.addColorStop(0.55, rgba(C.blood, 0.1));
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);

    // A second, warmer glow behind the keep. It is what makes the dark towers
    // read as a silhouette instead of disappearing into the night.
    const back = g.createRadialGradient(W * 0.8, H * 0.8, 0, W * 0.8, H * 0.8, Math.max(W, H) * 0.42);
    back.addColorStop(0, rgba(C.gold, 0.3));
    back.addColorStop(0.4, rgba(C.gold, 0.12));
    back.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = back;
    g.fillRect(0, 0, W, H);

    const mx = W * 0.78, my = H * 0.17;
    const mr = Math.max(24, Math.min(Math.min(W, H) * 0.055, 62));
    const halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 10);
    halo.addColorStop(0, rgba(C.goldBright, 0.2));
    halo.addColorStop(0.35, rgba(C.gold, 0.08));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    const disc = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.35, mr * 0.1, mx, my, mr);
    disc.addColorStop(0, '#fdf3d6');
    disc.addColorStop(0.7, rgba(C.goldBright, 0.92));
    disc.addColorStop(1, rgba(C.gold, 0.7));
    g.beginPath();
    g.arc(mx, my, mr, 0, TAU);
    g.fillStyle = disc;
    g.fill();

    const crater = seeded(91);
    for (let i = 0; i < 6; i++) {
      const a = crater() * TAU, d = crater() * mr * 0.62;
      g.beginPath();
      g.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, mr * (0.06 + crater() * 0.14), 0, TAU);
      g.fillStyle = rgba(C.gold, 0.16);
      g.fill();
    }

    // Most stars are baked in for cheapness; a few are redrawn to twinkle.
    for (const s of stars) {
      g.beginPath();
      g.arc(s.x * W, s.y * H, s.r, 0, TAU);
      g.fillStyle = `rgba(255,252,240,${s.a})`;
      g.fill();
    }
    return c;
  }

  function ridge(g, baseY, amp, phase, color) {
    g.beginPath();
    g.moveTo(-60, baseY + 600);
    for (let x = -60; x <= W + 60; x += 8) {
      const y = baseY
        - amp * (0.5 + 0.5 * Math.sin(x * 0.0017 + phase))
        - amp * 0.24 * Math.sin(x * 0.0071 + phase * 1.7)
        - amp * 0.16 * (1 - Math.abs(((x * 0.004 + phase) % 2) - 1));
      g.lineTo(x, y);
    }
    g.lineTo(W + 60, baseY + 600);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  // A keep with five towers, lit windows and a gate. Sizes are multiples of
  // `u`, so the silhouette scales with the viewport.
  function keep(g, cx, baseY, u) {
    const towers = [
      { x: -2.55, w: 0.5, h: 4.5 },
      { x: -1.45, w: 0.5, h: 3.4 },
      { x: 0, w: 0.62, h: 5.2 },
      { x: 1.45, w: 0.5, h: 3.4 },
      { x: 2.55, w: 0.5, h: 4.5 }
    ];
    const wallTop = baseY - 2.5 * u;
    const towerTop = [];

    // Dark stone. The warm glow behind the keep is what gives it an edge.
    const STONE = '#0a0710';
    const STONE_DARK = '#07050c';

    for (const t of towers) {
      const x = cx + t.x * u;
      const w = t.w * u;
      const top = baseY - t.h * u;
      towerTop.push(top);
      g.fillStyle = STONE;
      g.fillRect(x - w / 2, top, w, baseY - top);

      const crenH = 0.34 * u, crenW = w / 3.2;
      for (let i = 0; i < 3; i++) {
        g.fillRect(x - w / 2 + i * crenW * 1.1, top - crenH, crenW, crenH);
      }

      const roofH = t.h * 0.55 * u;
      g.beginPath();
      g.moveTo(x - w * 0.92, top - crenH);
      g.lineTo(x, top - crenH - roofH);
      g.lineTo(x + w * 0.92, top - crenH);
      g.closePath();
      g.fillStyle = STONE_DARK;
      g.fill();
      g.strokeStyle = rgba(C.gold, 0.3);
      g.lineWidth = 1;
      g.stroke();
    }

    g.fillStyle = STONE_DARK;
    g.fillRect(cx - 3.0 * u, wallTop, 6.0 * u, baseY - wallTop);
    g.fillStyle = STONE;
    g.fillRect(cx - 3.0 * u, wallTop - 0.26 * u, 6.0 * u, 0.26 * u);

    // The gate is the warmest point of the whole scene.
    const gateW = 0.72 * u, gateH = 1.15 * u;
    g.beginPath();
    g.moveTo(cx - gateW / 2, baseY);
    g.lineTo(cx - gateW / 2, baseY - gateH + gateW / 2);
    g.arc(cx, baseY - gateH + gateW / 2, gateW / 2, Math.PI, 0);
    g.lineTo(cx + gateW / 2, baseY);
    g.closePath();
    g.fillStyle = rgba(C.goldBright, 0.5);
    g.fill();

    const doorGlow = g.createRadialGradient(cx, baseY - gateH * 0.5, 0, cx, baseY - gateH * 0.5, 2.4 * u);
    doorGlow.addColorStop(0, rgba(C.gold, 0.3));
    doorGlow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = doorGlow;
    g.fillRect(cx - 2.6 * u, baseY - 2.6 * u, 5.2 * u, 2.6 * u);

    lights.length = 0;
    const pick = seeded(4242);
    const spots = [
      [-2.55, 3.9], [-2.55, 2.6], [-1.45, 2.9], [-1.45, 1.7],
      [0, 4.5], [0, 3.3], [0, 2.1], [1.45, 2.9], [1.45, 1.7],
      [2.55, 3.9], [2.55, 2.6], [-2.2, 1.9], [2.2, 1.9], [-0.9, 2.2], [0.9, 2.2]
    ];
    for (const [tx, th] of spots) {
      if (pick() < 0.42) continue;
      lights.push({
        x: cx + tx * u,
        y: baseY - th * u,
        r: 0.16 * u,
        phase: pick() * TAU,
        rate: 0.5 + pick() * 1.4
      });
    }
    return { gateY: baseY - gateH * 0.5, top: Math.min(...towerTop) };
  }

  function makeTerrain() {
    const { c, g } = makeLayer(W, H + EXTRA);
    const u = Math.min(Math.max(Math.min(W, H) * 0.031, 9), 30);

    ridge(g, H * 0.84, H * 0.05, 0.6, '#150f1d');
    ridge(g, H * 0.89, H * 0.045, 2.4, '#0f0b16');

    const baseY = H * 0.95;
    const cx = W * 0.8;
    keep(g, cx, baseY, u);

    // A rock the keep stands on, then the near slope in front of it.
    g.beginPath();
    g.moveTo(cx - 4.2 * u, baseY);
    g.lineTo(cx - 3.1 * u, baseY - 0.5 * u);
    g.lineTo(cx + 3.1 * u, baseY - 0.5 * u);
    g.lineTo(cx + 4.2 * u, baseY);
    g.closePath();
    g.fillStyle = '#0b0810';
    g.fill();

    ridge(g, H * 1.0, H * 0.03, 4.1, '#08060c');
    ridge(g, H * 1.06, H * 0.032, 1.2, '#050409');
    return { c, cx, baseY, u };
  }

  function seed() {
    stars.length = 0;
    twinklers.length = 0;
    puffs.length = 0;
    embers.length = 0;

    const r = seeded(1337);
    const count = Math.round(Math.min(Math.max((W * H) / 9000, 60), 220));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: r(),
        y: r() * 0.72,
        r: 0.35 + r() * 1.05,
        a: 0.16 + r() * 0.6
      });
    }
    for (let i = 0; i < 9; i++) {
      const s = stars[Math.floor(r() * stars.length)];
      if (s) twinklers.push({ s, phase: r() * TAU, rate: 0.4 + r() * 1.1 });
    }

    const p = seeded(77);
    for (let i = 0; i < 5; i++) {
      puffs.push({
        y: H * (0.74 + p() * 0.2),
        x: p() * W,
        w: W * (0.34 + p() * 0.3),
        h: H * (0.05 + p() * 0.06),
        speed: 5 + p() * 13,
        alpha: 0.04 + p() * 0.05,
        tint: p() < 0.3 ? 'blood' : 'cold'
      });
    }
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(320, window.innerWidth);
    H = Math.max(320, window.innerHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round((H + EXTRA) * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H + EXTRA}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    seed();
    skyLayer = makeSky();
    const terrain = makeTerrain();
    terrainLayer = terrain.c;
    gateX = terrain.cx;
    vignette = makeVignette();

    // Embers drift up from the gate and along the horizon.
    const e = seeded(2024);
    for (let i = 0; i < 26; i++) {
      const nearGate = e() < 0.45;
      embers.push({
        x: nearGate ? terrain.cx + (e() - 0.5) * 5 * terrain.u : e() * W,
        y: H * (nearGate ? 0.9 : 0.82 + e() * 0.14),
        r: 0.6 + e() * 1.7,
        vy: 9 + e() * 26,
        vx: (e() - 0.5) * 16,
        phase: e() * TAU,
        rate: 1 + e() * 2,
        life: e()
      });
    }
  }

  function draw(t) {
    const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.05) : 0;
    lastFrame = t;

    if (!still) {
      shiftX += (wantX - shiftX) * 0.045;
      shiftY += (wantY - shiftY) * 0.045;
    }

    // Sky is drawn oversized so the parallax never exposes an edge.
    const skyOffX = -shiftX * 16;
    const skyOffY = -shiftY * 10 + scrollDrift * 0.04;
    const skyW = W + 32, skyH = H + EXTRA + 32;
    ctx.drawImage(skyLayer, skyOffX - 16, skyOffY - 16, skyW, skyH);

    for (const tw of twinklers) {
      const a = tw.s.a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.001 * tw.rate + tw.phase)));
      ctx.beginPath();
      ctx.arc(tw.s.x * W, tw.s.y * H, tw.s.r * 1.5, 0, TAU);
      ctx.fillStyle = `rgba(255,250,235,${a})`;
      ctx.fill();
    }

    // The keep and its cliff move least: it is the far landmark.
    ctx.drawImage(terrainLayer, -shiftX * 6, -shiftY * 4 + scrollDrift * 0.02, W, H + EXTRA);

    for (const l of lights) {
      const flick = 0.5 + 0.5 * Math.sin(t * 0.001 * l.rate + l.phase);
      const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 7);
      glow.addColorStop(0, rgba(C.goldBright, 0.5 * (0.55 + 0.45 * flick)));
      glow.addColorStop(0.4, rgba(C.gold, 0.16 * flick));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(l.x - l.r * 7, l.y - l.r * 7, l.r * 14, l.r * 14);

      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fillStyle = rgba(C.goldBright, 0.65 + 0.3 * flick);
      ctx.fill();
    }

    if (!still) {
      for (const p of puffs) {
        p.x += p.speed * dt;
        if (p.x - p.w > W) p.x = -p.w;
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w * 0.5);
        const tint = p.tint === 'blood' ? rgba(C.blood, p.alpha) : rgba('#6b6a86', p.alpha);
        g2.addColorStop(0, tint);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, p.h / (p.w * 0.5));
        ctx.translate(-p.x, -p.y);
        ctx.fillStyle = g2;
        ctx.fillRect(p.x - p.w * 0.5, p.y - p.w * 0.5, p.w, p.w);
        ctx.restore();
      }

      for (const em of embers) {
        em.y -= em.vy * dt;
        em.x += (em.vx + Math.sin(t * 0.001 + em.phase) * 6) * dt;
        if (em.y < H * 0.55 || em.x < -20 || em.x > W + 20) {
          em.y = H * 0.95;
          em.x = Math.random() < 0.5 ? gateX : Math.random() * W;
        }
        const a = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.002 * em.rate + em.phase));
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r, 0, TAU);
        ctx.fillStyle = rgba(C.goldBright, a);
        ctx.fill();
      }
    }

    ctx.drawImage(vignette, 0, 0, W, H + EXTRA);
    rafId = requestAnimationFrame(draw);
  }

  function onResize() {
    build();
    if (still) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastFrame = 0;
      draw(0);
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  build();

  if (still) {
    draw(0);
    cancelAnimationFrame(rafId);
    rafId = 0;
  } else {
    rafId = requestAnimationFrame(draw);
    window.addEventListener('pointermove', (e) => {
      wantX = (e.clientX / W - 0.5) * 2;
      wantY = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('scroll', () => {
      scrollDrift = window.scrollY || window.pageYOffset || 0;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!rafId) {
        lastFrame = 0;
        rafId = requestAnimationFrame(draw);
      }
    });
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 180);
  });
})();