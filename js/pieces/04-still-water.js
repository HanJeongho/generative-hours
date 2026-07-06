// ============================================================================
//  04 · Still Water — 2D wave-equation surface
//  Two height buffers march a discretized wave equation across a downscaled
//  grid: new = (Σ4 neighbours)/2 − prevSame, then damped. Drops launch
//  concentric ripples that reflect off the walls and interfere. The surface
//  is shaded from its own gradient so light catches the slopes like water.
// ============================================================================

import { Piece, clamp, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// --- tiny deterministic value-noise (for wet-road grain & light filaments) ---
// hash → [0,1), smooth-interpolated 2D value noise, then fbm for richer detail.
function _hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function _vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = _hash(xi, yi), b = _hash(xi + 1, yi);
  const c = _hash(xi, yi + 1), d = _hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function _fbm(x, y) {
  let f = 0, amp = 0.5;
  for (let o = 0; o < 4; o++) { f += amp * _vnoise(x, y); x *= 2; y *= 2; amp *= 0.5; }
  return f;
}

export default class StillWater extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.cell = 4;                 // device px per simulation cell (downscaled)
    this.damping = 0.992;          // energy retained per step (ripples linger)
    this.dropStrength = 1.4;       // height impulse for a drag-held drop
    this.steps = 2;                // wave-equation iterations per frame (speed)
    this.rain = false;             // rain mode: scatter raindrops every frame
    this.rainRate = 2.2;           // avg raindrops per frame when raining
    this._rainAcc = 0;             // fractional accumulator for sub-1 rates
    this.reflect = true;           // show the reflected scene above the water
    this.sceneGain = 1.0;          // brightness multiplier for the reflection
    this.sceneMode = "city";       // city | constellation | windows | signal | fireflies
    this._t = 0;                   // running time (for animated scenes)
    this._lights = [];             // current scene's light set
    this._lines = [];              // constellation connect-the-dots
    this.accentRgb = hexToRgb(this.accent);
    this._alloc();
    this._seedDrops();             // a couple of drops so the pool is alive
  }

  // --- allocate height buffers + offscreen upscale canvas (device px based) --
  _alloc() {
    // grid sized from DEVICE pixels so it stays sharp on HiDPI
    this.gw = Math.max(64, Math.floor(this.canvas.width / this.cell));
    this.gh = Math.max(48, Math.floor(this.canvas.height / this.cell));
    const n = this.gw * this.gh;
    this.prev = new Float32Array(n);   // height one step ago
    this.cur = new Float32Array(n);    // current height
    this.img = this.ctx.createImageData(this.gw, this.gh);
    // offscreen low-res buffer, upscaled to the canvas each frame
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
    this._buildScene();                // night-street image that the wet ground reflects
  }

  // ---- reflected scenes -----------------------------------------------------
  // Each scene is a set of point-lights {x, sy, r,g,b, w, b0, ...} that get
  // painted into this.scene (an RGB Float buffer) and then mirrored, displaced
  // by the water's slope, in _render. _defineScene() builds the geometry once
  // (on mode change); _paintScene(t) rasterizes it — re-run per frame for the
  // animated scenes (windows flicker, signals blink, fireflies breathe).
  PALETTE_CITY = [
    [255, 168, 70], [255, 120, 60], [255, 70, 120], [255, 60, 60],
    [170, 255, 120], [104, 236, 208], [90, 180, 255], [168, 208, 255],
    [180, 130, 255], [255, 220, 150], [255, 240, 90], [120, 255, 230],
  ];

  _buildScene() {
    this.scene = new Float32Array(this.gw * this.gh * 3);
    this._buildBase();          // bake the static background (grain/sky) once
    this._defineScene();        // build this mode's light geometry
    this._paintScene(this._t || 0);
  }

  // Bake the time-invariant background (dark ground + sky/horizon glow + noise
  // grain) into _sceneBase ONCE. _paintScene copies this and only adds lights,
  // so the per-frame cost is lights-only — no _fbm in the hot loop.
  _buildBase() {
    const { gw, gh } = this;
    this._sceneBase = new Float32Array(gw * gh * 3);
    const B = this._sceneBase;
    const showSky = this.sceneMode === "constellation";
    for (let y = 0; y < gh; y++) {
      const v = y / gh;
      const sky = showSky ? Math.pow(1 - v, 2.2) : Math.pow(1 - v, 1.9);
      const horizon = Math.exp(-((v - 0.10) * (v - 0.10)) / 0.010);
      for (let x = 0; x < gw; x++) {
        const u = x / gw;
        const grain = _fbm(u * 60, v * 60);
        const macro = _fbm(u * 9 + 20, v * 5 + 7);
        const i = (y * gw + x) * 3;
        B[i]     = 4 + sky * 8 + horizon * 6 + grain * 6 + macro * 4;
        B[i + 1] = 6 + sky * 11 + horizon * 8 + grain * 6 + macro * 4;
        B[i + 2] = 11 + sky * (showSky ? 30 : 22) + horizon * 14 + grain * 8 + macro * 6;
      }
    }
  }

  // Build the light set for the current mode (geometry + colour, no time yet).
  _defineScene() {
    const lights = [];
    this._lines = [];
    const mode = this.sceneMode;

    if (mode === "city") {
      // anonymous downtown: many small lights, rich palette, full screen
      for (let k = 0; k < 150; k++) {
        const c = this.PALETTE_CITY[(_hash(k, 2) * this.PALETTE_CITY.length) | 0];
        lights.push({
          x: _hash(k, 5), sy: 0.04 + _hash(k, 19) * 0.94,
          r: c[0], g: c[1], b: c[2],
          w: 0.00012 + _hash(k, 11) * 0.0004, b0: 0.45 + _hash(k, 7) * 0.7,
        });
      }
    } else if (mode === "constellation") {
      // a single soft, warm circular glow on the loved dark background — like one
      // distant streetlamp reflected in still water. Low and large, gently breathing.
      lights.push({
        x: 0.74, sy: 0.18,                           // upper-right
        r: 255, g: 210, b: 140,                      // warm amber
        w: 0.012, wy: 0.05, b0: 0.85, kind: "lamp",
      });
    } else if (mode === "windows") {
      // a wall of windows: each light is a life. all the same warm amber, on a loose grid.
      let k = 0;
      for (let gy = 0; gy < 9; gy++) {
        for (let gx = 0; gx < 18; gx++) {
          if (_hash(gx, gy) < 0.28) continue;          // ~28% of windows are dark
          lights.push({
            x: (gx + 0.5) / 18,                        // aligned columns (no horizontal jitter)
            sy: 0.05 + gy * 0.092,
            r: 255, g: 196, b: 110,                    // unified warm yellow
            w: 0.00010, wy: 0.0016, b0: 0.7, kind: "window", seed: k++,
          });
        }
      }
    } else if (mode === "fireflies") {
      // memories: soft green-gold lights that are born, glow, and fade away,
      // drifting slowly, reappearing elsewhere.
      for (let k = 0; k < 70; k++) {
        const gold = _hash(k, 2) > 0.5;
        lights.push({
          x: _hash(k, 5), sy: 0.06 + _hash(k, 19) * 0.85,
          r: gold ? 220 : 160, g: 255, b: gold ? 120 : 200,
          w: 0.0002, b0: 1.0, kind: "firefly",
          rate: 0.25 + _hash(k, 11) * 0.5, phase: _hash(k, 29) * 6.28,
          driftX: (_hash(k, 37) - 0.5) * 0.04, driftY: (_hash(k, 43) - 0.5) * 0.03,
        });
      }
    }
    this._lights = lights;
  }

  // Rasterize the current light set into this.scene at time t. Animated kinds
  // (window/signal/firefly) modulate brightness/position by t.
  _paintScene(t) {
    const { gw, gh } = this;
    const S = this.scene;
    const lights = this._lights || [];

    // resolve each light's live brightness/position for this instant
    const L = lights.map((o) => {
      let b0 = o.b0, x = o.x, sy = o.sy;
      if (o.kind === "window") {
        // occasional flicker: mostly steady, rare dips (someone passing / sleeping)
        const f = _fbm(o.seed * 0.7 + t * 0.25, o.seed * 1.3);
        b0 *= 0.55 + 0.5 * f + 0.12 * Math.sin(t * 2 + o.seed);
      } else if (o.kind === "firefly") {
        // breathe in/out; drift slowly; near-zero between breaths (born→fade)
        const br = Math.sin(t * o.rate + o.phase);
        b0 *= Math.max(0, br) ** 1.6;
        x += Math.sin(t * 0.2 + o.phase) * o.driftX;
        sy += Math.cos(t * 0.17 + o.phase) * o.driftY;
      } else if (o.kind === "lamp") {
        b0 *= 0.92 + 0.08 * Math.sin(t * 0.8);             // slow, faint breathing
      }
      return { ...o, b0, x, sy };
    });

    // start from the baked background (fast copy — no per-frame noise)
    S.set(this._sceneBase);

    // add each light only within its small bounding box (≈3σ), not the whole grid
    for (const o of L) {
      if (o.b0 < 0.01) continue;
      const wy = o.wy || 0.006;
      const rx = Math.ceil(Math.sqrt(o.w * 6) * gw);     // ~3σ in cells
      const ry = Math.ceil(Math.sqrt(wy * 6) * gh);
      const cxp = o.x * gw, cyp = o.sy * gh;
      const x0 = Math.max(0, (cxp - rx) | 0), x1 = Math.min(gw - 1, (cxp + rx) | 0);
      const y0 = Math.max(0, (cyp - ry) | 0), y1 = Math.min(gh - 1, (cyp + ry) | 0);
      const cr = o.r / 255, cg = o.g / 255, cb = o.b / 255, amp = 240 * o.b0;
      for (let y = y0; y <= y1; y++) {
        const dyl = y / gh - o.sy;
        const ey = (dyl * dyl) / wy;
        for (let x = x0; x <= x1; x++) {
          const dxl = x / gw - o.x;
          const blob = Math.exp(-(dxl * dxl) / o.w - ey);
          if (blob < 0.004) continue;
          const inten = blob * amp;
          const i = (y * gw + x) * 3;
          S[i] += inten * cr; S[i + 1] += inten * cg; S[i + 2] += inten * cb;
        }
      }
    }

    // constellation: draw faint connecting lines between the named stars
    if (this._lines && this._lines.length) {
      for (const [a, b] of this._lines) this._sceneLine(a.x, a.sy, b.x, b.sy);
    }
  }

  // draw a faint star-line into the scene buffer (additive, cool white)
  _sceneLine(x0, y0, x1, y1) {
    const { gw, gh } = this;
    const S = this.scene;
    const px0 = x0 * gw, py0 = y0 * gh, px1 = x1 * gw, py1 = y1 * gh;
    const steps = Math.ceil(Math.hypot(px1 - px0, py1 - py0));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = (px0 + (px1 - px0) * t) | 0, py = (py0 + (py1 - py0) * t) | 0;
      if (px < 0 || py < 0 || px >= gw || py >= gh) continue;
      const i = (py * gw + px) * 3;
      S[i] += 34; S[i + 1] += 40; S[i + 2] += 60;
    }
  }

  onResize() { this._alloc(); this._seedDrops(); }

  // raise (or lower) a small gaussian blot of height at a grid cell ----------
  _drop(cx, cy, amp, r = 3) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d2 = x * x + y * y;
        if (d2 > r * r) continue;
        const gx = cx + x, gy = cy + y;
        if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) continue;
        const g = Math.exp(-d2 / (r * 0.8));   // gaussian falloff
        this.cur[gy * this.gw + gx] += amp * g;
      }
    }
  }

  _seedDrops() {
    // scatter a few impulses so there is motion the moment the piece loads
    for (let i = 0; i < 3; i++) {
      const cx = (Math.random() * this.gw) | 0;
      const cy = (Math.random() * this.gh) | 0;
      this._drop(cx, cy, 2.2 + Math.random() * 1.5, 3);
    }
  }

  calm() { this.prev.fill(0); this.cur.fill(0); }

  // map the CSS-pixel pointer onto a grid cell ------------------------------
  _pointerCell() {
    const gx = (this.pointer.x / this.w * this.gw) | 0;
    const gy = (this.pointer.y / this.h * this.gh) | 0;
    return [gx, gy];
  }

  // stronger single impulse — "물수제비" (skipping stone) ---------------------
  onPointerDown() {
    if (!this.pointer.active) return;
    const [gx, gy] = this._pointerCell();
    this._drop(gx, gy, this.dropStrength * 4, 4);
  }

  // scatter small raindrops across the surface this frame ---------------------
  _rainTick() {
    this._rainAcc += this.rainRate;
    while (this._rainAcc >= 1) {
      this._rainAcc -= 1;
      const cx = (Math.random() * this.gw) | 0;
      const cy = (Math.random() * this.gh) | 0;
      // small, varied impulses — most are light, the odd one is a fat drop
      const fat = Math.random() < 0.12;
      this._drop(cx, cy, fat ? 2.4 : 0.9 + Math.random() * 0.7, fat ? 3 : 2);
    }
  }

  frame(dt) {
    this._t += dt || 0.016;
    if (this.rain) this._rainTick();
    // dragging while held = a continuous drop under the cursor
    if (this.pointer.down && this.pointer.active) {
      const [gx, gy] = this._pointerCell();
      this._drop(gx, gy, this.dropStrength, 2);
    }
    // animated scenes repaint their light set each frame (throttled to ~20fps)
    if (this.reflect && this.sceneMode !== "city") {
      if (!this._lastPaint || this._t - this._lastPaint > 0.05) {
        this._paintScene(this._t);
        this._lastPaint = this._t;
      }
    }
    const n = Math.max(1, Math.min(4, this.steps | 0));
    for (let s = 0; s < n; s++) this._step();
    this._render();
  }

  // one wave-equation iteration with reflective (zero) edges -----------------
  _step() {
    const { prev, cur, gw, gh, damping } = this;
    for (let y = 0; y < gh; y++) {
      const yUp = y > 0 ? y - 1 : 0;          // clamp at walls -> reflective
      const yDn = y < gh - 1 ? y + 1 : gh - 1;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const xL = x > 0 ? x - 1 : 0;
        const xR = x < gw - 1 ? x + 1 : gw - 1;
        // classic wave step: average of 4 neighbours minus the past height
        const sum = cur[y * gw + xL] + cur[y * gw + xR] +
                    cur[yUp * gw + x] + cur[yDn * gw + x];
        let h = sum * 0.5 - prev[i];
        h *= damping;                          // bleed energy so it settles
        prev[i] = h;                           // write into prev (becomes new)
      }
    }
    // swap: prev now holds the freshest field, cur becomes the history
    const tmp = this.prev; this.prev = this.cur; this.cur = tmp;
  }

  // shade the surface from its height gradient (slope catches the light) -----
  _render() {
    const { cur, img, gw, gh } = this;
    const d = img.data;
    const [ar, ag, ab] = this.accentRgb;
    // light direction (toward upper-left), normalized-ish
    const lx = -0.5, ly = -0.6, lz = 0.62;
    for (let y = 0; y < gh; y++) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDn = y < gh - 1 ? y + 1 : gh - 1;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const xL = x > 0 ? x - 1 : 0;
        const xR = x < gw - 1 ? x + 1 : gw - 1;
        // surface gradient -> normal (-dx, -dy, 1)
        const dx = cur[y * gw + xR] - cur[y * gw + xL];
        const dy = cur[yDn * gw + x] - cur[yUp * gw + x];
        const nx = -dx, ny = -dy, nz = 1;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        // diffuse: how much the slope faces the light
        const diff = clamp((nx * lx + ny * ly + nz * lz) * inv, 0, 1);
        // specular highlight where slope is steep & lit (sharp power)
        const spec = Math.pow(diff, 22);
        const slope = Math.min(1, Math.hypot(dx, dy) * 1.6);
        const j = i * 4;
        // Reflected night-street scene — independent of rain. The wet/dark ground
        // mirrors the scene; the surface slope displaces the sample so ripples
        // (from rain or the cursor) make the reflection shimmer.
        if (this.reflect) {
          const S = this.scene;
          const base = 9 + slope * 6;          // dark wet-ground base
          const disp = 26;                     // how far slope shifts the reflection
          let sx = x + dx * disp, sy = y + dy * disp;
          sx = sx < 0 ? 0 : sx > gw - 1 ? gw - 1 : sx;
          sy = sy < 0 ? 0 : sy > gh - 1 ? gh - 1 : sy;
          const si = ((sy | 0) * gw + (sx | 0)) * 3;
          const m = 0.85 * this.sceneGain;     // reflection strength (user-tunable)
          d[j]     = base + S[si]     * m + spec * 200;
          d[j + 1] = base + S[si + 1] * m + spec * 210;
          d[j + 2] = base + 3 + S[si + 2] * m + spec * 255;
          d[j + 3] = 255;
          continue;
        }
        // plain wet asphalt: rain on but reflection off → neutral damp grey
        if (this.rain) {
          const base = 9 + slope * 6;
          const lit = diff * diff;
          d[j]     = base + lit * 22 + spec * 200;
          d[j + 1] = base + lit * 26 + spec * 215;
          d[j + 2] = base + 4 + lit * 38 + spec * 255;
          d[j + 3] = 255;
          continue;
        }
        // dark water base -> accent-tinted diffuse -> near-white spec glints
        const lit = diff * diff;
        d[j]     = 4  + ar * lit * 0.55 + slope * ar * 0.25 + spec * 220;
        d[j + 1] = 8  + ag * lit * 0.7  + slope * ag * 0.28 + spec * 230;
        d[j + 2] = 16 + ab * lit * 0.95 + slope * ab * 0.4  + spec * 255;
        d[j + 3] = 255;
      }
    }
    // blit low-res field then upscale (smoothed) to the full canvas
    this.bctx.putImageData(img, 0, 0);
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);          // identity: work in device px
    g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  controls(host) {
    // rain toggle · reflection toggle · calm reset share one row
    const row = buttonRow([
      {
        label: "비 내리기 (Rain)",
        on: (el) => {
          this.rain = !this.rain;
          el.classList.toggle("is-active", this.rain);
        },
      },
      {
        label: "비친 풍경 (Scene)",
        on: (el) => {
          this.reflect = !this.reflect;
          el.classList.toggle("is-active", this.reflect);
        },
      },
      { label: "잔잔하게 (Calm)", on: () => this.calm() },
    ]);
    const btns = row.querySelectorAll(".ctrl__btn");
    if (this.rain) btns[0].classList.add("is-active");
    if (this.reflect) btns[1].classList.add("is-active");
    host.appendChild(row);

    // which reflected scene — each carries a different meaning
    const scenes = [
      { key: "city", label: "도시" },
      { key: "constellation", label: "가로등" },
      { key: "windows", label: "창문" },
      { key: "fireflies", label: "반딧불" },
    ];
    const sceneRow = buttonRow(scenes.map((s) => ({
      label: s.label,
      on: (el) => {
        this.sceneMode = s.key;
        this._lastPaint = 0;
        this._buildScene();
        for (const sib of el.parentElement.children) sib.classList.remove("is-active");
        el.classList.add("is-active");
      },
    })));
    const sbtns = sceneRow.querySelectorAll(".ctrl__btn");
    scenes.forEach((s, i) => { if (s.key === this.sceneMode) sbtns[i].classList.add("is-active"); });
    host.appendChild(sceneRow);

    host.appendChild(slider("RAIN INTENSITY", 0.3, 8, this.rainRate, 0.1,
      (v) => (this.rainRate = v), (v) => (+v).toFixed(1)));
    host.appendChild(slider("SCENE BRIGHTNESS", 0, 2, this.sceneGain, 0.05,
      (v) => (this.sceneGain = v), (v) => (+v).toFixed(2)));

    host.appendChild(slider("DAMPING", 0.97, 0.999, this.damping, 0.001,
      (v) => (this.damping = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("DROP STRENGTH", 0.4, 3.5, this.dropStrength, 0.1,
      (v) => (this.dropStrength = v)));
    host.appendChild(slider("RIPPLE SPEED", 1, 4, this.steps, 1,
      (v) => (this.steps = v), (v) => String(v | 0)));
  }
}
