// Seasonal: a rotating 3D ASCII Christmas tree next to the neofetch info on /.
// Self-contained (no dependencies). To turn it off, delete its <script> line in /index.html.
//
// A point cloud (tiered cone, garland, baubles, trunk, roots, star, gifts, snowy ground) is
// rotated, projected onto a character grid with a depth buffer, and drawn to a <canvas>.
// Runs only while on screen and the tab is visible; prefers-reduced-motion gets one still frame.
(() => {
  'use strict';
  const out = document.getElementById('out');
  if (!out || !window.HTMLCanvasElement) return;
  // nothing is built until term.js prints the neofetch block
  const wait = new MutationObserver(() => { if (out.querySelector('.fetch')) { wait.disconnect(); main(); } });
  if (out.querySelector('.fetch')) main(); else wait.observe(out, { childList: true, subtree: true });

  function main() {

  const COLS = 56, ROWS = 42;
  const CW = 0.6, CH = 1.06;               // cell size in em
  const ASPECT = CH / CW;
  const S = 40;                            // columns per world unit
  const BASE = 34;                         // screen row of the ground at the tree's foot
  const CX = COLS / 2;
  const TILT = 0.28, CT = Math.cos(TILT), ST = Math.sin(TILT);
  const DIST = 5;
  const TAU = Math.PI * 2;
  const SPIN = 0.32;                       // rad/s
  const FPS = 24;
  const LIGHT = norm([-0.55, 0.55, 0.65]); // view space: x right, y up, z toward the viewer

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  let seed = 20261225;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  // ---------------------------------------------------------------- palettes
  function ramp(stops, n) {
    const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    return Array.from({ length: n }, (_, k) => {
      const t = k / (n - 1) * (rgb.length - 1);
      const i = Math.min(Math.floor(t), rgb.length - 2), u = t - i;
      return 'rgb(' + rgb[i].map((c, j) => Math.round(c + (rgb[i + 1][j] - c) * u)).join(',') + ')';
    });
  }
  const PAL = {
    green: ramp(['#0a2a1a', '#0e4429', '#006d32', '#26a641', '#39d353', '#7ee787', '#c8f7cf'], 16),
    teal: ramp(['#08262a', '#0f4a46', '#167a63', '#2fae86', '#6fe0b4', '#c2f5e2'], 16),
    gold: ramp(['#4a3508', '#8a6512', '#e3b341', '#ffd866', '#fff3c4', '#ffffff'], 16),
    brown: ramp(['#24160b', '#4a2e16', '#6b4423', '#8f5e33', '#b9844f'], 12),
    snow: ramp(['#1d232c', '#3a4452', '#6e7a8a', '#a9b4c2', '#e6edf3'], 12),
    red: ramp(['#3d1210', '#8e2a24', '#ff7b72', '#ffc1bb'], 12),
    blue: ramp(['#0f2238', '#285a8f', '#79c0ff', '#cfe6ff'], 12),
    purple: ramp(['#2a1a3d', '#6a4a96', '#d2a8ff', '#efe0ff'], 12),
    orange: ramp(['#3d2410', '#94582a', '#ffa657', '#ffdcb8'], 12),
    cyan: ramp(['#0c2c30', '#25808a', '#56d4dd', '#c4f3f6'], 12),
  };
  const pick = (pal, b) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(b * pal.length)))];
  const GLOW = new Set([...PAL.gold.slice(8)]);

  // ---------------------------------------------------------------- the scene, in object space
  // kinds: 0 leaf, 1 bauble, 2 light, 3 trunk, 4 root, 5 ground, 6 gift, 7 ribbon, 8 star, 9 bow
  const spin = [];   // rotates with the tree
  const fixed = [];  // gifts and ground stay put
  const star = [];   // sways on its own

  const TIERS = [ // bottom, apex, base radius
    [0.27, 0.62, 0.50],
    [0.42, 0.78, 0.41],
    [0.57, 0.92, 0.32],
    [0.71, 1.04, 0.23],
    [0.84, 1.14, 0.14],
  ];
  const skirt = (ti, th) => TIERS[ti][0] - 0.022 * (0.5 + 0.5 * Math.cos(th * (16 - ti * 2) + ti));
  const tierR = (ti, y) => { const [b, t, R] = TIERS[ti]; return R * (t - y) / (t - b); };
  function envelope(y, th) {
    let r = 0;
    for (let i = 0; i < TIERS.length; i++) if (y >= skirt(i, th) && y <= TIERS[i][1]) r = Math.max(r, tierR(i, y));
    return r;
  }

  const LEAF = '.,:;=+*xX#';
  TIERS.forEach(([b, t, R], ti) => {
    const h = t - b;
    const nl = Math.hypot(h, R);
    for (let y = b - 0.024; y <= t; y += 0.016) {
      const r = R * (t - y) / h;
      const n = Math.max(6, Math.ceil(TAU * r * S * 1.7));
      for (let k = 0; k < n; k++) {
        const th = (k + rnd() * 0.6) / n * TAU;
        if (y < skirt(ti, th)) continue;
        const u = (t - y) / h; // 0 at the apex, ~1 at the skirt
        spin.push({ k: 0, x: r * Math.cos(th), y, z: r * Math.sin(th),
          nx: Math.cos(th) * h / nl, ny: R / nl, nz: Math.sin(th) * h / nl,
          v: (0.3 + 0.7 * Math.pow(u, 1.3)) * (0.75 + 0.4 * rnd()),
          p: rnd() < 0.2 ? PAL.teal : PAL.green, tip: u > 0.94 });
      }
    }
  });

  const BAUBLE = [PAL.red, PAL.blue, PAL.purple, PAL.orange, PAL.cyan, PAL.red];
  for (let i = 0; i < 30; i++) {
    const ti = Math.floor(rnd() * TIERS.length);
    const [b, t] = TIERS[ti];
    const y = b + (t - b) * (0.08 + 0.5 * rnd());
    const th = rnd() * TAU, r = tierR(ti, y) + 0.02;
    spin.push({ k: 1, x: r * Math.cos(th), y, z: r * Math.sin(th), nx: Math.cos(th), ny: 0.3, nz: Math.sin(th),
      p: BAUBLE[i % BAUBLE.length], c: 'oO@0o'[i % 5] });
  }

  // garland: a helix just outside the foliage, with a bulb every few steps
  const TURNS = 3.6, GN = 900;
  for (let i = 0; i < GN; i++) {
    const s = i / GN;
    const y = 0.28 + s * 0.84;
    const th = s * TURNS * TAU;
    const r = envelope(y, th) + 0.028;
    spin.push({ k: 2, x: r * Math.cos(th), y, z: r * Math.sin(th), nx: Math.cos(th), ny: 0.2, nz: Math.sin(th),
      s, bulb: i % 7 === 0, tx: -Math.sin(th) * r * TURNS * TAU, ty: 0.9, tz: Math.cos(th) * r * TURNS * TAU });
  }

  // trunk
  for (let y = -0.01; y <= 0.3; y += 0.01) {
    const r = 0.075 + 0.03 * Math.max(0, 0.07 - y) / 0.07;
    for (let k = 0; k < 40; k++) {
      const th = k / 40 * TAU;
      spin.push({ k: 3, x: r * Math.cos(th), y, z: r * Math.sin(th), nx: Math.cos(th), ny: 0, nz: Math.sin(th),
        c: '|!|l|[]'[Math.floor(rnd() * 7)], v: 0.8 + 0.3 * rnd() });
    }
  }
  // roots spreading over the snow
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + 0.3;
    const len = 0.16 + 0.08 * rnd();
    for (let s = 0; s <= 1; s += 0.025) {
      const bend = 0.25 * s * s * (i % 2 ? 1 : -1);
      const r = 0.08 + len * s;
      const th = a + bend;
      const y = 0.06 * (1 - s) * (1 - s);
      spin.push({ k: 4, x: r * Math.cos(th), y, z: r * Math.sin(th), nx: Math.cos(th), ny: 0.6, nz: Math.sin(th),
        tx: Math.cos(th), ty: -0.1 * (1 - s), tz: Math.sin(th), v: 1 - 0.4 * s });
    }
  }

  // snowy ground (static)
  for (let x = -0.62; x <= 0.62; x += 0.013) {
    for (let z = -0.62; z <= 0.62; z += 0.02) {
      const d = Math.hypot(x, z / 1.0);
      if (d > 0.6 || rnd() > 0.3) continue;
      fixed.push({ k: 5, x, y: -0.012, z, v: 0.2 + 0.4 * Math.min(1, Math.max(0, (d - 0.12) / 0.3)) * (0.7 + 0.3 * rnd()) * (1 - 0.6 * Math.pow(d / 0.6, 3)),
        c: '..,.\''[Math.floor(rnd() * 5)] });
    }
  }

  // gifts (static, already in view space)
  function gift(cx, cz, w, hgt, d, yaw, pal, rib) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const put = (lx, ly, lz, n, kind, ex) => {
      const p = { k: kind, x: cx + lx * c - lz * s, y: ly, z: cz + lx * s + lz * c,
        nx: n[0] * c - n[2] * s, ny: n[1], nz: n[0] * s + n[2] * c, p: pal, rib, ph: rnd() * TAU };
      if (ex) { p.tx = ex[0] * c - ex[2] * s; p.ty = ex[1]; p.tz = ex[0] * s + ex[2] * c; }
      fixed.push(p);
    };
    const hw = w / 2, hd = d / 2, rw = Math.min(w, d) * 0.11, st = 0.0075, e = st * 0.7;
    const edge = (a, A) => Math.abs(Math.abs(a) - A) < e;
    for (let lx = -hw; lx <= hw + 1e-9; lx += st) for (let lz = -hd; lz <= hd + 1e-9; lz += st) {
      const ex = edge(lx, hw) ? [0, 0, 1] : edge(lz, hd) ? [1, 0, 0] : null;
      put(lx, hgt, lz, [0, 1, 0], Math.abs(lx) < rw || Math.abs(lz) < rw ? 7 : 6, ex);
    }
    for (let ly = 0; ly <= hgt + 1e-9; ly += st) {
      for (const sz of [-1, 1]) for (let lx = -hw; lx <= hw + 1e-9; lx += st) {
        const ex = edge(ly, hgt) || ly < e ? [1, 0, 0] : edge(lx, hw) ? [0, 1, 0] : null;
        put(lx, ly, sz * hd, [0, 0, sz], Math.abs(lx) < rw ? 7 : 6, ex);
      }
      for (const sx of [-1, 1]) for (let lz = -hd; lz <= hd + 1e-9; lz += st) {
        const ex = edge(ly, hgt) || ly < e ? [0, 0, 1] : edge(lz, hd) ? [0, 1, 0] : null;
        put(sx * hw, ly, lz, [sx, 0, 0], Math.abs(lz) < rw ? 7 : 6, ex);
      }
    }
    for (const side of [-1, 1]) for (let a = 0; a < TAU; a += 0.35) { // bow: two loops on top
      const bx = side * (0.028 + 0.026 * Math.cos(a)), by = hgt + 0.022 + 0.022 * Math.sin(a);
      put(bx, by, 0, [0, 0, 1], 9, [-Math.sin(a), Math.cos(a), 0]);
    }
  }
  gift(-0.33, 0.33, 0.22, 0.17, 0.18, 0.6, PAL.red, PAL.gold);
  gift(0.34, 0.30, 0.18, 0.14, 0.16, -0.5, PAL.blue, PAL.gold);
  gift(0.03, 0.5, 0.14, 0.1, 0.12, 0.25, PAL.purple, PAL.gold);

  // star: an extruded five-point star
  const SY = 1.27, SRO = 0.17, SRI = 0.07, SD = 0.06;
  const SP = Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? SRI : SRO;
    return [r * Math.cos(a), SY + r * Math.sin(a)];
  });
  const inStar = (x, y) => {
    let inside = false;
    for (let i = 0, j = 9; i < 10; j = i++) {
      const [xi, yi] = SP[i], [xj, yj] = SP[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // front and back are beveled: ten facets rising to a ridge point in the middle
  const SH = 0.07;
  for (let x = -SRO; x <= SRO; x += 0.005) for (let y = SY - SRO; y <= SY + SRO; y += 0.005) {
    if (!inStar(x, y)) continue;
    const a = ((Math.atan2(y - SY, x) - Math.PI / 2) % TAU + TAU) % TAU;
    const f = Math.min(9, Math.floor(a / (Math.PI / 5)));
    const [ax, ay] = SP[f], [bx, by] = SP[(f + 1) % 10];
    const u = [ax, ay - SY, -SH], w = [bx, by - SY, -SH];
    let n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const h = SD / 2 + SH - (n[0] * x + n[1] * (y - SY)) / n[2];
    for (const sz of [-1, 1]) star.push({ k: 8, x, y, z: sz * Math.max(SD / 2, h), nx: n[0], ny: n[1], nz: sz * n[2], ph: rnd() * TAU });
  }
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = SP[i], [x1, y1] = SP[(i + 1) % 10];
    const len = Math.hypot(x1 - x0, y1 - y0), nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
    for (let s = 0; s <= 1; s += 0.006 / len) for (let z = -SD / 2; z <= SD / 2 + 1e-9; z += 0.008) {
      star.push({ k: 8, x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, z, nx, ny, nz: 0, v: 0.7, ph: rnd() * TAU, side: true });
    }
  }

  const flakes = Array.from({ length: 46 }, () => ({
    x: rnd() * COLS, y: rnd() * ROWS, vy: 1.2 + rnd() * 2.6, ph: rnd() * TAU, w: 0.6 + rnd(),
    c: '..**+\'`.'[Math.floor(rnd() * 8)], near: rnd() < 0.25,
  }));
  const GREETING = 'Merry Christmas';
  const STAR = '-=+*#@@';
  const SPARKS = [[-11, -3, 0], [10, -4, 2], [-13, 1, 4], [12, 1, 1], [-8, 5, 3], [9, 5, 5], [0, -6.5, 2.5], [-4, -6, 5.5], [5, -6, 0.7]];

  // ---------------------------------------------------------------- frame
  const N = COLS * ROWS;
  const depth = new Float32Array(N), chars = new Array(N), colors = new Array(N), kinds = new Int8Array(N);

  function plot(x, y, z, ch, color, kind) {
    const y2 = y * CT - z * ST, z2 = y * ST + z * CT;
    const p = DIST / (DIST - z2);
    const c = Math.round(CX + x * S * p - 0.5), r = Math.round(BASE - y2 * S / ASPECT * p);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    const i = r * COLS + c;
    if (z2 <= depth[i]) return;
    depth[i] = z2; chars[i] = ch; colors[i] = color; kinds[i] = kind;
  }
  // character for a line along view-space direction (tx, ty, tz)
  function slope(tx, ty, tz) {
    const a = Math.atan2(ty * CT - tz * ST, tx); // on screen, in pixels
    const d = ((a % Math.PI) + Math.PI) % Math.PI;
    if (d < 0.35 || d > Math.PI - 0.35) return '-';
    if (d > 1.2 && d < Math.PI - 1.2) return '|';
    return d < Math.PI / 2 ? '/' : '\\';
  }
  const lit = (nx, ny, nz) => Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);

  function render(t) {
    depth.fill(-1e9); chars.fill(null); kinds.fill(-1);
    const ang = t * SPIN, ca = Math.cos(ang), sa = Math.sin(ang);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);

    for (const q of spin) {
      const x = q.x * ca - q.z * sa, z = q.x * sa + q.z * ca;
      const nx = q.nx * ca - q.nz * sa, nz = q.nx * sa + q.nz * ca;
      const l = lit(nx, q.ny, nz);
      switch (q.k) {
        case 0: {
          const b = q.v * (0.4 + 0.65 * l);
          const ch = LEAF[Math.min(LEAF.length - 1, Math.floor(b * LEAF.length))];
          plot(x, q.y, z, ch, pick(q.p, b), 0);
          break;
        }
        case 1: plot(x, q.y, z, q.c, pick(q.p, 0.35 + 0.65 * l), 1); break;
        case 2: {
          const wave = 0.5 + 0.5 * Math.sin(t * 4 - q.s * 55);
          if (q.bulb) {
            const b = 0.55 + 0.45 * wave;
            plot(x, q.y, z, b > 0.85 ? '@' : b > 0.7 ? '*' : 'o', pick(PAL.gold, 0.25 + 0.6 * b), 2);
          } else {
            const tx = q.tx * ca - q.tz * sa, tz = q.tx * sa + q.tz * ca;
            const sc = slope(tx, q.ty, tz);
            plot(x, q.y, z, sc === '-' ? '~' : sc, pick(PAL.gold, 0.38 + 0.18 * wave + 0.12 * l), 2);
          }
          break;
        }
        case 3: plot(x, q.y, z, q.c, pick(PAL.brown, q.v * (0.25 + 0.8 * l)), 3); break;
        case 4: {
          const tx = q.tx * ca - q.tz * sa, tz = q.tx * sa + q.tz * ca;
          plot(x, q.y, z, slope(tx, q.ty, tz), pick(PAL.brown, q.v * (0.4 + 0.6 * l)), 4);
          break;
        }
      }
    }
    for (const q of fixed) {
      const l = lit(q.nx || 0, q.ny || 1, q.nz || 0);
      if (q.k === 5) { plot(q.x, q.y, q.z, q.c, pick(PAL.snow, q.v), 5); continue; }
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + q.ph);
      if (q.k === 9) { plot(q.x, q.y, q.z, slope(q.tx, q.ty, q.tz), pick(q.rib, 0.6 + 0.4 * tw), 9); continue; }
      const b = 0.3 + 0.7 * l;
      if (q.tx !== undefined && q.k === 6) { plot(q.x, q.y, q.z, slope(q.tx, q.ty, q.tz), pick(q.p, Math.min(1, b + 0.2)), 6); continue; }
      if (q.k === 7) {
        const sparkle = tw > 0.93 ? 1 : 0.45 + 0.35 * b + 0.15 * tw;
        plot(q.x, q.y, q.z, sparkle > 0.95 ? '*' : '+', pick(q.rib, sparkle), 7);
      } else plot(q.x, q.y, q.z, b > 0.75 ? '#' : b > 0.5 ? '=' : ':', pick(q.p, b * 0.85), 6);
    }
    const sy = 0.38 * Math.sin(t * 0.8), cs = Math.cos(sy), ss = Math.sin(sy);
    for (const q of star) {
      const x = q.x * cs - q.z * ss, z = q.x * ss + q.z * cs;
      const nx = q.nx * cs - q.nz * ss, nz = q.nx * ss + q.nz * cs;
      const l = lit(nx, q.ny, nz);
      const tw = 0.5 + 0.5 * Math.sin(t * 5 + q.ph);
      let b = q.side ? 0.15 + 0.25 * l : (0.3 + 0.75 * l) * (0.85 + 0.2 * pulse);
      if (!q.side && tw > 0.985) b = 1.1;
      plot(x, q.y, z, q.side ? ':' : STAR[Math.min(STAR.length - 1, Math.floor(b * STAR.length))], pick(PAL.gold, b), 8);
    }

    // sparkles around the star
    const sr = BASE - SY * CT * S / ASPECT * (DIST / (DIST - SY * ST)), sc = CX - 0.5;
    SPARKS.forEach(([dc, dr, ph]) => {
      const w = Math.sin(t * 1.7 + ph);
      if (w < 0.2) return;
      const i2 = Math.round(sr + dr) * COLS + Math.round(sc + dc);
      if (chars[i2]) return;
      chars[i2] = w > 0.8 ? '*' : w > 0.5 ? '+' : '.'; colors[i2] = pick(PAL.gold, 0.5 + 0.5 * w); kinds[i2] = 10;
    });

    for (const f of flakes) {
      const c = Math.round(f.x + Math.sin(t * f.w + f.ph) * 1.2), r = Math.floor(f.y);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS - 3) continue;
      const i = r * COLS + c;
      if (chars[i] && !(f.near && (kinds[i] === 0 || kinds[i] === 5))) continue;
      chars[i] = f.near ? '*' : f.c; colors[i] = pick(PAL.snow, f.near ? 0.95 : 0.55 + 0.25 * Math.sin(f.ph)); kinds[i] = 11;
    }

    const gr = ROWS - 2, g0 = Math.round((COLS - GREETING.length) / 2);
    const GP = [PAL.red, PAL.gold, PAL.green];
    for (let k = 0; k < GREETING.length; k++) {
      if (GREETING[k] === ' ') continue;
      const w = 0.5 + 0.5 * Math.sin(t * 2.5 - k * 0.45);
      const i = gr * COLS + g0 + k;
      chars[i] = GREETING[k]; colors[i] = pick(GP[k % 3], 0.6 + 0.4 * w); kinds[i] = 12;
    }
    const deco = [[g0 - 3, '*'], [g0 - 2, '~'], [g0 + GREETING.length + 1, '~'], [g0 + GREETING.length + 2, '*']];
    for (const [c, ch] of deco) { const i = gr * COLS + c; chars[i] = ch; colors[i] = pick(PAL.gold, 0.6 + 0.4 * pulse); kinds[i] = 12; }
  }

  // ---------------------------------------------------------------- canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'xmas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;flex:none;align-self:flex-start;max-width:100%;margin:2px 0 8px';
  const ctx = canvas.getContext('2d');
  let fs = 13, dpr = 1, family = 'monospace';

  function size() {
    const host = canvas.parentElement;
    if (!host) return;
    const cs = getComputedStyle(host);
    family = cs.fontFamily;
    const avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const base = Math.min(12, parseFloat(cs.fontSize));
    fs = Math.max(6, Math.min(base, Math.floor(avail / (COLS * CW) * 4) / 4));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = COLS * CW * fs, h = ROWS * CH * fs;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw(time);
  }

  function draw(t) {
    render(t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = fs + 'px ' + family;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      if (!chars[i]) continue;
      let b = buckets.get(colors[i]);
      if (!b) buckets.set(colors[i], (b = []));
      b.push(i);
    }
    const cw = CW * fs, ch = CH * fs;
    for (const glow of [false, true]) {
      ctx.shadowBlur = glow ? fs * 0.9 : 0;
      for (const [color, list] of buckets) {
        if (GLOW.has(color) !== glow) continue;
        ctx.fillStyle = color;
        if (glow) ctx.shadowColor = color;
        for (const i of list) ctx.fillText(chars[i], (i % COLS + 0.5) * cw, (Math.floor(i / COLS) + 0.55) * ch);
      }
    }
    ctx.shadowBlur = 0;
  }

  // ---------------------------------------------------------------- loop
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let time = 2.2, last = 0, raf = 0, onScreen = false;
  const still = () => reduce.matches;
  function frame(now) {
    raf = 0;
    if (!canvas.isConnected) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    if (!last || now - last >= 1000 / FPS - 2) {
      last = now;
      time += dt;
      for (const f of flakes) { f.y += f.vy * dt; if (f.y >= ROWS - 3) { f.y = -1; f.x = rnd() * COLS; } }
      draw(time);
    }
    schedule();
  }
  function schedule() {
    if (raf || still() || !onScreen || document.hidden || !canvas.isConnected) { if (!raf) last = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; schedule(); });
  const ro = new ResizeObserver(() => size());
  document.addEventListener('visibilitychange', schedule);
  reduce.addEventListener('change', () => { draw(time); schedule(); });
  if (document.fonts) document.fonts.ready.then(() => draw(time));

  // lives in the newest neofetch block (`neofetch` can be run again; `clear` removes it)
  function attach() {
    const all = out.querySelectorAll('.fetch');
    const host = all[all.length - 1];
    if (!host || canvas.parentElement === host) return;
    if (canvas.parentElement) ro.unobserve(canvas.parentElement);
    host.append(canvas);
    ro.observe(host);
    io.disconnect(); io.observe(canvas);
    size();
  }
  new MutationObserver(attach).observe(out, { childList: true, subtree: true });
  attach();
  }
})();
