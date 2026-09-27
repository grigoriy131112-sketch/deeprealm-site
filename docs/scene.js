// Animated night scene painted behind the whole site.
//
// The courtyard is the original painting: a keep on a cliff, drifting mist,
// rising embers and a slow parallax reply to the mouse and scroll. On top of it
// there are three rooms inside the keep - a library, a guild hall and a throne
// room - and the page picks the room by the section a visitor is reading, so the
// background changes as they walk through the castle.
//
// Pure canvas 2D, no dependencies. Every room is baked into layers once per
// size and then reused, so switching rooms is a draw, not a repaint; rooms are
// built lazily on first visit and the rest are made while the page is idle. The
// stylesheet keeps a plain gradient underneath, so a browser without 2D canvas
// still looks fine.
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
    blood: cssColor('--blood', '#8a1f2b'),
    bloodBright: cssColor('--blood-bright', '#b8333f')
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
  let vignette = null;

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

  // A unit for the outdoor keep and a slightly denser one for interiors, where
  // the architecture is nearer and should not dwarf the cards over it.
  const unit = () => Math.min(Math.max(Math.min(W, H) * 0.031, 9), 30);
  const iunit = () => Math.min(Math.max(Math.min(W, H) * 0.03, 9), 32);

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

  // ---- shapes shared by the rooms ------------------------------------------

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

  // A leafless tree, drawn from a seeded recursion. Every branch is a stroke, so
  // it costs nothing per frame: the whole terrain layer is baked once.
  function deadTree(g, x, baseY, size, lean, color) {
    const r = seeded(Math.round(x * 13 + size * 7 + 1) || 1);
    const tr = (bx, by, ang, len, w, depth) => {
      if (depth > 4 || len < 1.2) return;
      const ex = bx + Math.cos(ang) * len;
      const ey = by + Math.sin(ang) * len;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(ex, ey);
      g.strokeStyle = color;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.stroke();
      const kids = depth >= 3 ? 1 : 2;
      for (let i = 0; i < kids; i++) {
        const spread = (i === 0 ? -1 : 1) * (0.32 + r() * 0.5);
        tr(ex, ey, ang + spread, len * (0.6 + r() * 0.16), Math.max(0.5, w * 0.68), depth + 1);
      }
    };
    tr(x, baseY, -Math.PI / 2 + lean, size, Math.max(1, size * 0.11), 0);
  }

  // A distant winged silhouette. One shape per frame, so it stays cheap.
  function dragon(g, x, y, s, flap, color) {
    const h = s * (0.45 + 0.55 * flap);
    g.fillStyle = color;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(x, y - s * 0.05);
      g.quadraticCurveTo(x + dir * s * 0.75, y - h, x + dir * s * 1.6, y - h * 0.15);
      g.quadraticCurveTo(x + dir * s * 0.85, y + h * 0.2, x + dir * s * 0.15, y + s * 0.1);
      g.closePath();
      g.fill();
    }
    g.beginPath();
    g.ellipse(x, y, s * 0.52, s * 0.16, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(x + s * 0.45, y - s * 0.04);
    g.lineTo(x + s * 0.98, y - s * 0.2);
    g.lineTo(x + s * 0.4, y + s * 0.1);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.quadraticCurveTo(x - s * 1.1, y + s * 0.16, x - s * 1.5, y - s * 0.02);
    g.lineTo(x - s * 1.5, y + s * 0.06);
    g.quadraticCurveTo(x - s * 1.05, y + s * 0.28, x - s * 0.5, y + s * 0.12);
    g.closePath();
    g.fill();
  }

  // A pointed gothic arch. `y` is the apex, `h` runs from the apex to the floor.
  function archPath(g, x, y, w, h) {
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + h * 0.44);
    g.quadraticCurveTo(x, y + h * 0.08, x + w * 0.5, y);
    g.quadraticCurveTo(x + w, y + h * 0.08, x + w, y + h * 0.44);
    g.lineTo(x + w, y + h);
    g.closePath();
  }

  function column(g, x, top, bottom, w, color) {
    g.fillStyle = color;
    g.fillRect(x - w / 2, top, w, bottom - top);
    g.fillRect(x - w * 0.74, top, w * 1.48, w * 0.5);
    g.fillRect(x - w * 0.74, bottom - w * 0.5, w * 1.48, w * 0.5);
  }

  // A night view through a window, with mullions and an optional moon.
  function nightWindow(g, x, y, w, h, seedNo, withMoon) {
    g.save();
    archPath(g, x, y, w, h);
    g.clip();
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#070611');
    sky.addColorStop(0.62, '#0b0a1a');
    sky.addColorStop(1, '#120d1c');
    g.fillStyle = sky;
    g.fillRect(x, y, w, h);
    const r = seeded(seedNo);
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      g.arc(x + r() * w, y + r() * h * 0.8, 0.35 + r() * 1.0, 0, TAU);
      g.fillStyle = `rgba(255,250,235,${0.12 + r() * 0.5})`;
      g.fill();
    }
    if (withMoon) {
      const mx = x + w * 0.5, my = y + h * 0.32, mr = Math.min(w, h) * 0.15;
      const halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 6);
      halo.addColorStop(0, rgba(C.goldBright, 0.2));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo;
      g.fillRect(x, y, w, h);
      g.beginPath();
      g.arc(mx, my, mr, 0, TAU);
      g.fillStyle = rgba(C.goldBright, 0.82);
      g.fill();
    }
    g.restore();
    archPath(g, x, y, w, h);
    g.strokeStyle = rgba(C.gold, 0.28);
    g.lineWidth = 1.4;
    g.stroke();
    g.strokeStyle = 'rgba(10,7,14,0.92)';
    g.lineWidth = Math.max(1.4, w * 0.05);
    g.beginPath(); g.moveTo(x + w / 2, y + h * 0.05); g.lineTo(x + w / 2, y + h); g.stroke();
    g.beginPath(); g.moveTo(x, y + h * 0.5); g.lineTo(x + w, y + h * 0.5); g.stroke();
  }

  // Rows of book spines. Cheap to bake and it reads as a library instantly.
  function bookshelf(g, x, y, w, h, seedNo) {
    const r = seeded(seedNo);
    g.fillStyle = '#130d09';
    g.fillRect(x, y, w, h);
    const rows = Math.max(3, Math.round(h / (iunit() * 0.95)));
    const rowH = h / rows;
    for (let i = 0; i < rows; i++) {
      const ry = y + i * rowH;
      const plank = Math.max(1, rowH * 0.14);
      let bx = x + w * 0.05;
      while (bx < x + w * 0.95) {
        const bw = Math.max(1.5, w * (0.018 + r() * 0.032));
        const bh = rowH * (0.48 + r() * 0.32);
        const pick = r();
        g.fillStyle = pick < 0.32 ? '#2a1a12' : pick < 0.58 ? '#241016' : pick < 0.78 ? '#191a28' : '#2c2412';
        g.fillRect(bx, ry + rowH - bh - plank, bw, bh);
        bx += bw + Math.max(1, w * 0.006);
      }
      g.fillStyle = '#1d130c';
      g.fillRect(x, ry + rowH - plank, w, plank);
    }
    g.strokeStyle = 'rgba(201,162,75,0.1)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function banner(g, x, y, w, h, color) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h * 0.82);
    g.lineTo(x + w * 0.5, y + h);
    g.lineTo(x, y + h * 0.82);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.26);
    g.lineWidth = 1;
    g.stroke();
    g.beginPath();
    g.moveTo(x + w * 0.5, y + h * 0.14);
    g.lineTo(x + w * 0.5, y + h * 0.8);
    g.strokeStyle = rgba(C.goldBright, 0.18);
    g.stroke();
  }

  // A candle: a small warm point on a stick of wax. The flicker on top of it is
  // the per-frame light, so the baked shape only has to read as a flame.
  function candle(g, x, baseY, u) {
    g.fillStyle = '#c9bfae';
    g.fillRect(x - u * 0.05, baseY - u * 0.34, u * 0.1, u * 0.34);
    const fy = baseY - u * 0.44;
    const halo = g.createRadialGradient(x, fy, 0, x, fy, u * 0.5);
    halo.addColorStop(0, rgba(C.goldBright, 0.55));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo;
    g.fillRect(x - u * 0.5, fy - u * 0.5, u, u);
    g.beginPath();
    g.moveTo(x, fy - u * 0.13);
    g.quadraticCurveTo(x + u * 0.07, fy, x, fy + u * 0.05);
    g.quadraticCurveTo(x - u * 0.07, fy, x, fy - u * 0.13);
    g.fillStyle = rgba(C.goldBright, 0.85);
    g.fill();
  }

  function brazier(g, x, baseY, u) {
    g.fillStyle = '#0c0911';
    g.beginPath();
    g.moveTo(x - u * 0.5, baseY - u * 0.72);
    g.lineTo(x + u * 0.5, baseY - u * 0.72);
    g.lineTo(x + u * 0.3, baseY - u * 0.4);
    g.lineTo(x - u * 0.3, baseY - u * 0.4);
    g.closePath();
    g.fill();
    g.fillRect(x - u * 0.1, baseY - u * 0.4, u * 0.2, u * 0.5);
    g.fillRect(x - u * 0.34, baseY + u * 0.1, u * 0.68, u * 0.13);
    // A baked flame shape; the per-frame light laid over it does the flicker.
    const fx = x, fy = baseY - u * 0.72, fr = u * 0.34;
    const fire = g.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.6);
    fire.addColorStop(0, rgba(C.goldBright, 0.5));
    fire.addColorStop(0.35, rgba(C.bloodBright, 0.24));
    fire.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fire;
    g.fillRect(fx - fr * 2.6, fy - fr * 2.6, fr * 5.2, fr * 5.2);
    g.beginPath();
    g.moveTo(fx, fy - fr * 1.5);
    g.quadraticCurveTo(fx + fr * 0.7, fy, fx, fy + fr * 0.5);
    g.quadraticCurveTo(fx - fr * 0.7, fy, fx, fy - fr * 1.5);
    g.fillStyle = rgba(C.goldBright, 0.55);
    g.fill();
  }

  // ---- courtyard -----------------------------------------------------------

  function courtyardSky(stars) {
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

    // Faint violet nebula streaks high in the sky: depth without a per-frame
    // cost, since the whole sky is baked once per resize.
    const neb = seeded(555);
    for (let i = 0; i < 7; i++) {
      const nx = neb() * W;
      const ny = H * (0.04 + neb() * 0.34);
      const nr = Math.min(W, H) * (0.18 + neb() * 0.3);
      const ng = g.createRadialGradient(nx, ny, 0, nx, ny, nr);
      const purple = neb() < 0.5 ? '#4a2a6b' : '#6b2a4a';
      ng.addColorStop(0, rgba(purple, 0.1));
      ng.addColorStop(0.6, rgba(purple, 0.04));
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng;
      g.save();
      g.translate(nx, ny);
      g.scale(1.6, 0.5);
      g.translate(-nx, -ny);
      g.fillRect(nx - nr * 1.7, ny - nr, nr * 3.4, nr * 2);
      g.restore();
    }

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

  // A keep with five towers, lit windows and a gate. Sizes are multiples of
  // `u`, so the silhouette scales with the viewport.
  function keep(g, cx, baseY, u) {
    const lights = [];
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

    // A dim rear wall and two far turrets: depth behind the keep without a
    // single extra per-frame draw. They read as the castle proper, not the gate.
    g.fillStyle = '#060409';
    g.fillRect(cx - 3.7 * u, baseY - 3.5 * u, 7.4 * u, 3.5 * u);
    for (const bx of [-3.2, 3.2]) {
      const bw = 0.42 * u;
      g.fillRect(cx + bx * u - bw / 2, baseY - 4.2 * u, bw, 4.2 * u);
      g.beginPath();
      g.moveTo(cx + bx * u - bw, baseY - 4.2 * u);
      g.lineTo(cx + bx * u, baseY - 4.8 * u);
      g.lineTo(cx + bx * u + bw, baseY - 4.2 * u);
      g.closePath();
      g.fill();
    }

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

      // A warm edge along the moonlit side, so the black tower keeps an outline
      // even where it is far from the gate glow.
      g.beginPath();
      g.moveTo(x + w * 0.92, top - crenH);
      g.lineTo(x, top - crenH - roofH);
      g.strokeStyle = rgba(C.goldBright, 0.22);
      g.lineWidth = 1;
      g.stroke();

      // A spire and a hanging banner: the classic dark-fantasy silhouette.
      const poleTop = top - crenH - roofH - 0.5 * u;
      g.strokeStyle = rgba(C.gold, 0.5);
      g.beginPath();
      g.moveTo(x, top - crenH - roofH);
      g.lineTo(x, poleTop);
      g.stroke();
      g.beginPath();
      g.arc(x, poleTop, 0.08 * u, 0, TAU);
      g.fillStyle = rgba(C.goldBright, 0.7);
      g.fill();

      const flagW = w * 0.52, flagH = 0.62 * u;
      const flagFx = x < cx ? 1 : -1;
      g.beginPath();
      g.moveTo(x, poleTop + 0.06 * u);
      g.lineTo(x + flagFx * flagW * 0.16, poleTop + 0.06 * u + flagH * 0.5);
      g.lineTo(x + flagFx * flagW, poleTop + 0.06 * u + flagH);
      g.lineTo(x + flagFx * flagW, poleTop + 0.06 * u);
      g.closePath();
      g.fillStyle = rgba(t.x === 0 ? C.blood : C.gold, 0.5);
      g.fill();
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

    // A torch-lit bridge leaves the gate and crosses the drop, with a lit post
    // at the far end. It is what makes the castle feel inhabited at night.
    const span = 4.4 * u, deck = 0.2 * u;
    g.beginPath();
    g.moveTo(cx - gateW * 0.55, baseY);
    g.lineTo(cx + gateW * 0.55, baseY);
    g.lineTo(cx + span * 0.55, baseY + deck);
    g.lineTo(cx - span * 0.55, baseY + deck);
    g.closePath();
    g.fillStyle = '#0b0810';
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.28);
    g.lineWidth = 1;
    g.stroke();

    for (const px of [-span * 0.5, -span * 0.18, span * 0.18, span * 0.5]) {
      g.beginPath();
      g.moveTo(cx + px, baseY - 0.5 * u);
      g.lineTo(cx + px, baseY + deck);
      g.strokeStyle = rgba(C.gold, 0.24);
      g.lineWidth = u * 0.06;
      g.stroke();
    }

    const torchX = cx - span * 0.5;
    const torchGlow = g.createRadialGradient(torchX, baseY - 0.5 * u, 0, torchX, baseY - 0.5 * u, 1.5 * u);
    torchGlow.addColorStop(0, rgba(C.goldBright, 0.42));
    torchGlow.addColorStop(0.5, rgba(C.gold, 0.16));
    torchGlow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = torchGlow;
    g.fillRect(torchX - 1.5 * u, baseY - 2.0 * u, 3.0 * u, 2.6 * u);
    g.beginPath();
    g.arc(torchX, baseY - 0.5 * u, 0.1 * u, 0, TAU);
    g.fillStyle = rgba(C.goldBright, 0.8);
    g.fill();

    // Parapets along the wall top, so the front wall is not a plain slab.
    for (let i = -2; i <= 2; i++) {
      const mx = cx + i * 1.0 * u;
      g.fillStyle = STONE_DARK;
      g.fillRect(mx - 0.2 * u, wallTop - 0.5 * u, 0.4 * u, 0.5 * u);
    }

    const pick = seeded(4242);
    const spots = [
      [-2.55, 3.9], [-2.55, 2.6], [-1.45, 2.9], [-1.45, 1.7],
      [0, 4.5], [0, 3.3], [0, 2.1], [1.45, 2.9], [1.45, 1.7],
      [2.55, 3.9], [2.55, 2.6], [-2.2, 1.9], [2.2, 1.9], [-0.9, 2.2], [0.9, 2.2],
      [-3.2, 3.6], [3.2, 3.6], [-3.2, 2.5], [3.2, 2.5], [-1.05, 3.4], [1.05, 3.4]
    ];
    // The bridge torch flickers with the rest, so the light moves and not just
    // the baked glow under it.
    lights.push({ x: torchX, y: baseY - 0.5 * u, r: 0.12 * u, phase: 1.7, rate: 1.6 });
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
    return lights;
  }

  function courtyardTerrain() {
    const { c, g } = makeLayer(W, H + EXTRA);
    const u = unit();

    ridge(g, H * 0.84, H * 0.05, 0.6, '#150f1d');
    ridge(g, H * 0.89, H * 0.045, 2.4, '#0f0b16');

    const baseY = H * 0.95;
    const cx = W * 0.8;
    const lights = keep(g, cx, baseY, u);

    // A rock the keep stands on, then the near slope in front of it.
    g.beginPath();
    g.moveTo(cx - 4.2 * u, baseY);
    g.lineTo(cx - 3.1 * u, baseY - 0.5 * u);
    g.lineTo(cx + 3.1 * u, baseY - 0.5 * u);
    g.lineTo(cx + 4.2 * u, baseY);
    g.closePath();
    g.fillStyle = '#0b0810';
    g.fill();

    // Bare wind-bent trees on the near slope. They are thin, but they are what
    // gives the empty cliff a scale and an edge.
    deadTree(g, cx - 5.1 * u, baseY + 0.35 * u, u * 1.7, -0.22, '#07050b');
    deadTree(g, cx - 4.5 * u, baseY + 0.75 * u, u * 1.15, -0.3, '#08060d');
    deadTree(g, W * 0.07, H * 1.16, u * 2.1, 0.28, '#040308');
    deadTree(g, W * 0.015, H * 1.2, u * 1.5, 0.34, '#030206');

    ridge(g, H * 1.0, H * 0.03, 4.1, '#08060c');
    ridge(g, H * 1.06, H * 0.032, 1.2, '#050409');
    return { c, cx, lights };
  }

  function courtyard() {
    const stars = [];
    const twinklers = [];
    const r = seeded(1337);
    const count = Math.round(Math.min(Math.max((W * H) / 9000, 60), 220));
    for (let i = 0; i < count; i++) {
      stars.push({ x: r(), y: r() * 0.72, r: 0.35 + r() * 1.05, a: 0.16 + r() * 0.6 });
    }
    for (let i = 0; i < 9; i++) {
      const s = stars[Math.floor(r() * stars.length)];
      if (s) twinklers.push({ s, phase: r() * TAU, rate: 0.4 + r() * 1.1 });
    }

    const sky = courtyardSky(stars);
    const terrain = courtyardTerrain();

    const puffs = [];
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

    // Embers drift up from the gate and along the horizon.
    const embers = [];
    const e = seeded(2024);
    for (let i = 0; i < 26; i++) {
      const nearGate = e() < 0.45;
      embers.push({
        x: nearGate ? terrain.cx + (e() - 0.5) * 5 * unit() : e() * W,
        y: H * (nearGate ? 0.9 : 0.82 + e() * 0.14),
        r: 0.6 + e() * 1.7,
        vy: 9 + e() * 26,
        vx: (e() - 0.5) * 16,
        phase: e() * TAU,
        rate: 1 + e() * 2,
        a: 1
      });
    }

    return {
      sky, terrain: terrain.c, lights: terrain.lights, puffs, embers, twinklers,
      gateX: terrain.cx, skyF: 16, terrF: 6, dragon: true
    };
  }

  // ---- interiors -----------------------------------------------------------

  // Backlight behind every interior: dark stone with one warm pool, kept low so
  // the text on the cards stays the brightest thing on the page.
  function interiorSky(glow) {
    const { c, g } = makeLayer(W, H);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#050409');
    sky.addColorStop(0.45, '#0a0812');
    sky.addColorStop(1, '#080610');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const gx = glow && glow.x != null ? glow.x : W * 0.5;
    const gy = glow && glow.y != null ? glow.y : H * 0.8;
    const gr = glow && glow.r ? glow.r : Math.max(W, H) * 0.5;
    const warm = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    warm.addColorStop(0, rgba(glow && glow.blood ? C.blood : C.gold, 0.14));
    warm.addColorStop(0.5, rgba(C.gold, 0.04));
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, W, H);
    return c;
  }

  function stoneFloor(g, floorY, tint) {
    const fl = g.createLinearGradient(0, floorY, 0, H + EXTRA);
    fl.addColorStop(0, tint || '#0b0810');
    fl.addColorStop(1, '#050409');
    g.fillStyle = fl;
    g.fillRect(0, floorY, W, H + EXTRA - floorY);
    // A few flagstone seams, drawn in perspective so the floor recedes.
    const vanishX = W * 0.5;
    for (let i = -6; i <= 6; i++) {
      g.beginPath();
      g.moveTo(vanishX + i * W * 0.16, floorY);
      g.lineTo(vanishX + i * W * 0.46, H + EXTRA);
      g.strokeStyle = 'rgba(201,162,75,0.05)';
      g.lineWidth = 1;
      g.stroke();
    }
    for (let i = 1; i <= 4; i++) {
      const y = floorY + (H + EXTRA - floorY) * Math.pow(i / 5, 2);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.strokeStyle = 'rgba(201,162,75,0.035)';
      g.stroke();
    }
  }

  function mist(seedNo, alpha, count) {
    const puffs = [];
    const p = seeded(seedNo);
    for (let i = 0; i < (count || 4); i++) {
      puffs.push({
        y: H * (0.5 + p() * 0.42),
        x: p() * W,
        w: W * (0.3 + p() * 0.34),
        h: H * (0.05 + p() * 0.07),
        speed: 3 + p() * 9,
        alpha: (alpha || 0.03) * (0.6 + p() * 0.7),
        tint: p() < 0.4 ? 'blood' : 'cold'
      });
    }
    return puffs;
  }

  // Slow specks in the air: dust in the lamplight rather than sparks.
  function motes(seedNo, alpha, count) {
    const out = [];
    const e = seeded(seedNo);
    for (let i = 0; i < (count || 18); i++) {
      out.push({
        x: e() * W,
        y: H * (0.3 + e() * 0.64),
        r: 0.5 + e() * 1.1,
        vy: 3 + e() * 9,
        vx: (e() - 0.5) * 7,
        phase: e() * TAU,
        rate: 0.5 + e() * 1.1,
        a: alpha == null ? 0.5 : alpha
      });
    }
    return out;
  }

  // The library: a colonnade of pointed arches with shelves between them, a
  // moon through the middle window and candles on the columns.
  function library() {
    const { c, g } = makeLayer(W, H + EXTRA);
    const u = iunit();
    const floorY = H * 0.88;
    const lights = [];

    stoneFloor(g, floorY);

    const bays = 3;
    const bayW = W / bays;
    const ay = H * 0.14;
    for (let i = 0; i < bays; i++) {
      const x = i * bayW + bayW * 0.5;
      const aw = Math.min(bayW * 0.5, u * 7.5);
      const ax = x - aw / 2;
      const ah = floorY - ay - u * 0.4;

      if (i === 1) {
        nightWindow(g, ax + aw * 0.2, ay + ah * 0.12, aw * 0.6, ah * 0.82, 909, true);
      } else {
        bookshelf(g, ax + aw * 0.1, ay + ah * 0.2, aw * 0.8, ah * 0.78, 700 + i);
      }

      archPath(g, ax, ay, aw, ah);
      g.strokeStyle = rgba(C.gold, 0.16);
      g.lineWidth = 2;
      g.stroke();

      column(g, i * bayW, ay - u * 0.2, floorY, u * 0.95, '#0a0713');
      if (i === 0) lights.push({ x: u * 0.4, y: H * 0.5, r: u * 0.15, phase: 0.6, rate: 1.1 });
      // A reading candle on each arch pier, plus the light that flickers over it.
      candle(g, i * bayW + u * 0.62, floorY - u * 0.2, u);
      lights.push({ x: i * bayW + u * 0.62, y: floorY - u * 0.64, r: u * 0.1, phase: i * 2.1, rate: 0.7 + i * 0.2 });
    }
    column(g, W, ay - u * 0.2, floorY, u * 0.95, '#0a0713');

    // Side cases, so the room reads as a place lined with books.
    bookshelf(g, -u * 0.6, H * 0.36, u * 3.4, floorY - H * 0.36, 611);
    bookshelf(g, W - u * 2.8, H * 0.36, u * 3.4, floorY - H * 0.36, 613);
    lights.push({ x: u * 1.1, y: H * 0.4, r: u * 0.13, phase: 2.2, rate: 0.9 });
    lights.push({ x: W - u * 1.1, y: H * 0.4, r: u * 0.13, phase: 4.4, rate: 1.0 });

    return {
      sky: interiorSky({ x: W * 0.5, y: H * 0.55, r: Math.max(W, H) * 0.55 }),
      terrain: c,
      lights,
      puffs: mist(431, 0.028, 3),
      embers: motes(517, 0.42, 16),
      twinklers: [],
      skyF: 5, terrF: 2, dragon: false
    };
  }

  // The guild hall: a great hearth, hanging banners, shields and long tables.
  function guild() {
    const { c, g } = makeLayer(W, H + EXTRA);
    const u = iunit();
    const floorY = H * 0.9;
    const lights = [];

    stoneFloor(g, floorY, '#0c0809');

    // Banners along the top, in the house colours.
    const banners = 4;
    for (let i = 0; i < banners; i++) {
      const bw = Math.min(W * 0.07, u * 2.6);
      const bx = (i + 0.5) * (W / banners) - bw / 2;
      const bh = H * (0.16 + (i % 2) * 0.05);
      banner(g, bx, -bh * 0.12, bw, bh, i % 2 ? rgba(C.gold, 0.28) : rgba(C.blood, 0.42));
    }

    // The hearth is the heart of the hall and the warmest thing in it.
    const hw = Math.min(W * 0.3, u * 9);
    const hx = W * 0.5;
    const hTop = H * 0.3;
    const hh = floorY - hTop - u * 0.3;
    archPath(g, hx - hw / 2, hTop, hw, hh);
    g.fillStyle = '#0a0710';
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.2);
    g.lineWidth = 2;
    g.stroke();
    archPath(g, hx - hw * 0.3, hTop + hh * 0.34, hw * 0.6, hh * 0.66);
    g.fillStyle = '#07050a';
    g.fill();
    const fire = g.createRadialGradient(hx, hTop + hh * 0.72, 0, hx, hTop + hh * 0.72, hw * 0.9);
    fire.addColorStop(0, rgba(C.goldBright, 0.72));
    fire.addColorStop(0.3, rgba(C.gold, 0.34));
    fire.addColorStop(0.65, rgba(C.bloodBright, 0.2));
    fire.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fire;
    g.fillRect(hx - hw * 0.9, hTop + hh * 0.05, hw * 1.8, hh * 1.15);
    // Flames licking up inside the hearth, baked so the per-frame cost is nil.
    const fr = seeded(1201);
    for (let i = 0; i < 6; i++) {
      const fx = hx + (fr() - 0.5) * hw * 0.42;
      const fh = hh * (0.1 + fr() * 0.3);
      g.beginPath();
      g.moveTo(fx, hTop + hh * 0.86 - fh);
      g.quadraticCurveTo(fx + hw * 0.05, hTop + hh * 0.86 - fh * 0.4, fx, hTop + hh * 0.88);
      g.quadraticCurveTo(fx - hw * 0.05, hTop + hh * 0.86 - fh * 0.4, fx, hTop + hh * 0.86 - fh);
      g.fillStyle = rgba(C.goldBright, 0.32 + fr() * 0.24);
      g.fill();
    }
    lights.push({ x: hx, y: hTop + hh * 0.68, r: u * 0.5, phase: 0.4, rate: 1.5 });

    // Shields on the walls: a ring of iron with a boss, one per side.
    const shield = (sx, sy, sr) => {
      g.beginPath();
      g.arc(sx, sy, sr, 0, TAU);
      g.fillStyle = '#0d0a13';
      g.fill();
      g.strokeStyle = rgba(C.gold, 0.22);
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath();
      g.arc(sx, sy, sr * 0.32, 0, TAU);
      g.fillStyle = rgba(C.gold, 0.24);
      g.fill();
    };
    shield(u * 1.0, H * 0.42, u * 0.6);
    shield(W - u * 1.0, H * 0.42, u * 0.6);
    shield(u * 1.0, H * 0.58, u * 0.48);
    shield(W - u * 1.0, H * 0.58, u * 0.48);

    // Long tables with candles, low in the frame so they stay out of the text.
    const tableTops = [0.68, 0.8];
    for (let ti = 0; ti < tableTops.length; ti++) {
      const ty = H * tableTops[ti];
      const tw = W * (0.42 + ti * 0.08);
      const tx = ti === 0 ? u * 0.6 : W - tw - u * 0.6;
      g.fillStyle = '#100c10';
      g.fillRect(tx, ty, tw, u * 0.5);
      g.fillStyle = rgba(C.gold, 0.12);
      g.fillRect(tx, ty, tw, u * 0.08);
      const n = ti === 0 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const cxp = tx + (i + 1) * (tw / (n + 1));
        lights.push({ x: cxp, y: ty - u * 0.2, r: u * 0.11, phase: i * 1.3 + ti, rate: 0.8 + i * 0.3 });
      }
    }

    return {
      sky: interiorSky({ x: W * 0.5, y: H * 0.7, r: Math.max(W, H) * 0.5, blood: true }),
      terrain: c,
      lights,
      puffs: mist(733, 0.05, 4),
      embers: motes(829, 0.6, 22),
      twinklers: [],
      skyF: 5, terrF: 2, dragon: false
    };
  }

  // The throne room: a dais with a throne, columns, banners and braziers.
  function throne() {
    const { c, g } = makeLayer(W, H + EXTRA);
    const u = iunit();
    const floorY = H * 0.9;
    const lights = [];

    stoneFloor(g, floorY, '#0b070c');

    // A carpet from the doors to the dais, bordered in gold.
    const cw = Math.min(W * 0.4, u * 11);
    const cxp = W * 0.5;
    g.beginPath();
    g.moveTo(cxp - cw * 0.22, floorY);
    g.lineTo(cxp + cw * 0.22, floorY);
    g.lineTo(cxp + cw * 0.6, H + EXTRA);
    g.lineTo(cxp - cw * 0.6, H + EXTRA);
    g.closePath();
    g.fillStyle = rgba(C.blood, 0.3);
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.22);
    g.lineWidth = 1.5;
    g.stroke();

    // The dais, then the throne on it.
    const dTop = H * 0.42;
    const dW = Math.min(W * 0.44, u * 12);
    const dais = g.createLinearGradient(0, dTop, 0, floorY);
    dais.addColorStop(0, '#1a1424');
    dais.addColorStop(1, '#0d0a13');
    g.fillStyle = dais;
    g.beginPath();
    g.moveTo(cxp - dW / 2, floorY);
    g.lineTo(cxp - dW / 2 + dW * 0.06, dTop);
    g.lineTo(cxp + dW / 2 - dW * 0.06, dTop);
    g.lineTo(cxp + dW / 2, floorY);
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.22);
    g.lineWidth = 1.5;
    g.stroke();
    g.beginPath();
    g.moveTo(cxp - dW / 2 + dW * 0.06, dTop);
    g.lineTo(cxp + dW / 2 - dW * 0.06, dTop);
    g.strokeStyle = rgba(C.goldBright, 0.4);
    g.stroke();
    for (let i = 0; i < 3; i++) {
      const y = dTop + (floorY - dTop) * ((i + 1) / 3);
      g.beginPath();
      g.moveTo(cxp - dW / 2, y);
      g.lineTo(cxp + dW / 2, y);
      g.strokeStyle = 'rgba(201,162,75,0.12)';
      g.stroke();
    }

    // A tall window behind the throne, so the back of the room is not a void.
    const winW = Math.min(W * 0.16, u * 4.4);
    nightWindow(g, cxp - winW / 2, H * 0.1, winW, dTop - H * 0.14, 1313, true);

    const tw = Math.min(W * 0.13, u * 3.6);
    const tTop = dTop - u * 3.4;
    g.beginPath();
    g.moveTo(cxp - tw / 2, dTop);
    g.lineTo(cxp - tw / 2, tTop + tw * 0.4);
    g.quadraticCurveTo(cxp - tw / 2, tTop, cxp, tTop);
    g.quadraticCurveTo(cxp + tw / 2, tTop, cxp + tw / 2, tTop + tw * 0.4);
    g.lineTo(cxp + tw / 2, dTop);
    g.closePath();
    g.fillStyle = '#07050b';
    g.fill();
    g.strokeStyle = rgba(C.gold, 0.3);
    g.lineWidth = 1.5;
    g.stroke();

    // Columns down both sides, with a brazier between each pair.
    for (let i = 1; i <= 3; i++) {
      const x = (i / 4) * W * 0.16 + u * 0.4;
      column(g, x, H * 0.1, floorY, u * 1.0, '#0a0713');
      column(g, W - x, H * 0.1, floorY, u * 1.0, '#0a0713');
    }
    for (const bx of [W * 0.22, W * 0.78]) {
      brazier(g, bx, floorY - u * 0.2, u);
      lights.push({ x: bx, y: floorY - u * 1.1, r: u * 0.22, phase: bx * 0.01, rate: 1.4, color: 'blood' });
    }

    // Banners behind the throne.
    const bw = Math.min(W * 0.07, u * 2.6);
    for (const bx of [cxp - dW * 0.42 - bw / 2, cxp + dW * 0.42 - bw / 2]) {
      banner(g, bx, H * 0.08, bw, H * 0.3, rgba(C.blood, 0.42));
    }

    lights.push({ x: cxp, y: dTop - u * 0.6, r: u * 0.16, phase: 3.1, rate: 0.7 });

    return {
      sky: interiorSky({ x: W * 0.5, y: H * 0.5, r: Math.max(W, H) * 0.55, blood: true }),
      terrain: c,
      lights,
      puffs: mist(911, 0.04, 4),
      embers: motes(1009, 0.55, 20),
      twinklers: [],
      skyF: 5, terrF: 2, dragon: false
    };
  }

  // ---- room registry -------------------------------------------------------

  const ROOMS = ['courtyard', 'library', 'guild', 'throne'];
  const BUILDERS = { courtyard, library, guild, throne };
  // Each room holds two full-size layers, so keeping all four would cost four
  // times the memory of the old single scene. Three is enough that walking back
  // and forth never rebuilds, and the least recently used one is dropped.
  const MAX_CACHED = 3;
  const cache = new Map();
  let currentName = 'courtyard';
  let active = null;

  function buildRoom(name) {
    return (BUILDERS[name] || courtyard)();
  }

  function remember(name) {
    if (cache.has(name)) cache.delete(name);   // re-insert so oldest is first
    cache.set(name, buildRoom(name));
    while (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest === currentName) break;       // never drop the room in view
      cache.delete(oldest);
    }
  }

  function setRoom(name) {
    if (!ROOMS.includes(name)) name = 'courtyard';
    if (active && name === currentName) return;
    if (!cache.has(name)) remember(name);
    currentName = name;
    active = cache.get(name);
    if (still) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastFrame = 0;
      draw(0);
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      lastFrame = 0;
      rafId = requestAnimationFrame(draw);
    }
  }

  // ---- frame ---------------------------------------------------------------

  function draw(t) {
    const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.05) : 0;
    lastFrame = t;

    if (!still) {
      shiftX += (wantX - shiftX) * 0.045;
      shiftY += (wantY - shiftY) * 0.045;
    }

    const room = active || cachedCourtyard();

    // Sky is drawn oversized so the parallax never exposes an edge.
    const skyOffX = -shiftX * room.skyF;
    const skyOffY = -shiftY * room.skyF * 0.62 + scrollDrift * 0.04;
    ctx.drawImage(room.sky, skyOffX - 16, skyOffY - 16, W + 32, H + EXTRA + 32);

    for (const tw of room.twinklers) {
      const a = tw.s.a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.001 * tw.rate + tw.phase)));
      ctx.beginPath();
      ctx.arc(tw.s.x * W, tw.s.y * H, tw.s.r * 1.5, 0, TAU);
      ctx.fillStyle = `rgba(255,250,235,${a})`;
      ctx.fill();
    }

    // A slow silhouette crossing the high sky, behind the keep's skyline so it
    // reads as distance. One shape per frame, drawn after the stars.
    if (room.dragon) {
      const dragonX = ((t * 0.0055 + W * 0.35) % (W + 260)) - 130;
      const dragonY = H * 0.14 + Math.sin(t * 0.0004) * H * 0.02;
      dragon(ctx, dragonX, dragonY, Math.max(7, Math.min(W, H) * 0.019),
        Math.sin(t * 0.0016), 'rgba(6,5,10,0.8)');
    }

    // The architecture moves least: it is the far landmark.
    ctx.drawImage(room.terrain, -shiftX * room.terrF, -shiftY * room.terrF * 0.62 + scrollDrift * 0.02, W, H + EXTRA);

    for (const l of room.lights) {
      const flick = 0.5 + 0.5 * Math.sin(t * 0.001 * l.rate + l.phase);
      const hot = l.color === 'blood' ? C.bloodBright : C.goldBright;
      const warm = l.color === 'blood' ? C.blood : C.gold;
      const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 7);
      glow.addColorStop(0, rgba(hot, 0.5 * (0.55 + 0.45 * flick)));
      glow.addColorStop(0.4, rgba(warm, 0.16 * flick));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(l.x - l.r * 7, l.y - l.r * 7, l.r * 14, l.r * 14);

      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fillStyle = rgba(hot, 0.6 + 0.3 * flick);
      ctx.fill();
    }

    if (!still) {
      for (const p of room.puffs) {
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

      for (const em of room.embers) {
        em.y -= em.vy * dt;
        em.x += (em.vx + Math.sin(t * 0.001 + em.phase) * 6) * dt;
        if (em.y < H * 0.55 || em.x < -20 || em.x > W + 20) {
          em.y = H * 0.95;
          em.x = (room.gateX && Math.random() < 0.5) ? room.gateX : Math.random() * W;
        }
        const a = (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.002 * em.rate + em.phase))) * (em.a == null ? 1 : em.a);
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r, 0, TAU);
        ctx.fillStyle = rgba(C.goldBright, a);
        ctx.fill();
      }
    }

    ctx.drawImage(vignette, 0, 0, W, H + EXTRA);
    rafId = requestAnimationFrame(draw);
  }

  function cachedCourtyard() {
    if (!cache.has('courtyard')) cache.set('courtyard', courtyard());
    return cache.get('courtyard');
  }

  // ---- lifecycle -----------------------------------------------------------

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(320, window.innerWidth);
    H = Math.max(320, window.innerHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round((H + EXTRA) * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H + EXTRA}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    vignette = makeVignette();

    // The room the visitor is in is rebuilt eagerly; the rest wait for idle, so
    // the first paint is as cheap as it was when there was only one scene.
    cache.clear();
    active = null;
    if (!cache.has(currentName)) cache.set(currentName, buildRoom(currentName));
    active = cache.get(currentName);
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

  function idlePrebake() {
    const run = () => {
      for (const name of ROOMS) {
        if (cache.size >= MAX_CACHED) break;
        if (!cache.has(name) && name !== currentName) remember(name);
      }
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 500);
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
    idlePrebake();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 180);
  });

  // The page tells the scene which room it is in. Unknown names fall back to the
  // courtyard, so a typo can never blank the background.
  window.DeeprealmScene = {
    setRoom,
    getRoom: () => currentName,
    rooms: ROOMS.slice()
  };
})();
