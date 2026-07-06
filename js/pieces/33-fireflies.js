// ============================================================================
//  33 · 반딧불이 (Fireflies) — a travelling tide of light over a dark meadow.
//
//  Real Photinus carolinus do NOT blink in unison like a metronome. They fire
//  in WAVES: a flash-front sweeps across the field, leaves a hush behind it,
//  re-gathers, and rolls again — light moving like wind over grass.
//
//  TECHNIQUE — pulse-coupled integrate-and-fire (Mirollo–Strogatz), not Kuramoto.
//  Each fly carries a phase φ that climbs 0→1 at its own rate; at 1 it FLASHES
//  and resets to 0, then enters a brief REFRACTORY dark. When a neighbour flashes,
//  any fly that is PAST refractory gets a forward KICK φ += ε (which can tip it
//  over threshold and cascade to ITS neighbours) — but a refractory fly ignores
//  the kick entirely. That asymmetric, refractory-GATED coupling is what turns a
//  symmetric whole-field blink into a directional travelling wave: the front can
//  only move into rested flies, never backward into the spent ones it just lit.
//  A value-noise FERTILITY field clusters the swarm into drifting patches that
//  glow denser; old flies fade and die, new ones spark in from fertile spots, so
//  the meadow is a living tide, never a loop.
//
//  PHILOSOPHY — synchrony here is a verb, not a state. Order is something the
//  field keeps DOING — breaking and re-forming — not a percentage it reaches.
//  All Canvas2D · ~500 agents · the IX-wing house style (warm amber accent).
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const REFRACTORY = 0.16;     // seconds of darkness after a flash (gates the wave)
const FLASH_FADE = 0.05;     // brightness decay base (per FLASH_FADE^dt)
const MAX_CASCADE = 4;       // kicks per fly per frame (cascade safety cap)

export default class Fireflies extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.accentRgb = hexToRgb(this.accent);
    this.noise = makeNoise();

    // tunables (slider-driven)
    this.count = 460;          // swarm size (cap ~500)
    this.epsilon = 0.085;      // phase KICK a flash gives a rested neighbour (ε)
    this.tempo = 1.0;          // base phase rate multiplier (how fast clocks climb)
    this.senseR = 78;          // px: how far a flash is "seen"

    this.cap = 520;            // hard allocation ceiling
    this.night = 0;            // 0..1 extra darkness from press-hold (deepens night)
    this._birthAcc = 0;        // fractional birth accumulator (mortality balance)
    this.fertSeed = rand(1000);
    this._clickGust = null;    // {x,y,t} a tap that scatters a local wave

    this._alloc();
    this._spawn();
    this._buildGlow();
    this._buildScratch();
  }

  // ---- allocation: SoA typed arrays sized to the hard cap --------------------
  _alloc() {
    const N = this.cap;
    this.fx = new Float32Array(N);     // position
    this.fy = new Float32Array(N);
    this.vx = new Float32Array(N);     // drift velocity
    this.vy = new Float32Array(N);
    this.ph = new Float32Array(N);     // phase 0..1 (integrate-and-fire clock)
    this.rate = new Float32Array(N);   // natural climb rate (per sec)
    this.refr = new Float32Array(N);   // refractory timer (>0 = dark, ignores kicks)
    this.fl = new Float32Array(N);     // flash brightness 0..1 (decays)
    this.kicks = new Uint8Array(N);    // cascade counter this frame
    this.age = new Float32Array(N);    // seconds alive
    this.life = new Float32Array(N);   // lifespan before fading out
    this.fade = new Float32Array(N);   // 0..1 birth/death envelope (drawn alpha mult)
  }

  _spawn() {
    for (let i = 0; i < this.count; i++) this._birth(i, true);
  }

  // birth a fly — seeded from the fertility field (denser where noise is high).
  // `scatter`=true on first spawn (uniform-ish), else weighted toward fertile spots.
  _birth(i, scatter) {
    let x, y;
    if (scatter) {
      x = rand(this.w); y = rand(this.h);
    } else {
      // rejection-sample a fertile location, then bias to edges so the tide
      // keeps entering from the dark borders of the meadow.
      let best = 0; x = rand(this.w); y = rand(this.h);
      for (let k = 0; k < 4; k++) {
        const tx = rand(this.w), ty = rand(this.h);
        const f = this._fert(tx, ty, this._fertT || 0);
        if (f > best) { best = f; x = tx; y = ty; }
      }
      if (Math.random() < 0.35) {           // a third spark in from an edge
        const edge = Math.random();
        if (edge < 0.25) x = rand(-6, 30);
        else if (edge < 0.5) x = this.w - rand(-6, 30);
        else if (edge < 0.75) y = rand(-6, 30);
        else y = this.h - rand(-6, 30);
      }
    }
    this.fx[i] = x; this.fy[i] = y;
    this.vx[i] = rand(-4, 4); this.vy[i] = rand(-4, 4);
    this.ph[i] = Math.random();             // random phase → no global lockstep
    this.rate[i] = 0.62 + rand(-0.12, 0.12); // ~0.6 Hz mean, mild spread
    this.refr[i] = rand(0, REFRACTORY);
    this.fl[i] = 0;
    this.age[i] = 0;
    this.life[i] = rand(14, 30);            // seconds before old age
    this.fade[i] = 0;                       // fade IN from birth
  }

  // value-noise fertility field, slowly drifting → clustered, moving patches.
  _fert(x, y, t) {
    const s = 0.0022;
    const n = this.noise(x * s + this.fertSeed + t * 0.03, y * s - t * 0.024) +
              0.5 * this.noise(x * s * 2.1 - t * 0.02, y * s * 2.1 + this.fertSeed);
    return clamp(n * 0.5 + 0.55, 0, 1);     // ~0..1 mask
  }

  // pre-render a soft radial firefly glow sprite (cheap additive blits).
  _buildGlow() {
    const s = 40; const c = document.createElement("canvas");
    c.width = c.height = s; const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    const [r, gg, b] = this.accentRgb;
    grd.addColorStop(0.0, `rgba(255,255,${Math.min(255, b + 110)},0.95)`);
    grd.addColorStop(0.18, `rgba(${r},${gg},${Math.max(70, b - 30)},0.62)`);
    grd.addColorStop(0.5, `rgba(${r},${Math.round(gg * 0.7)},80,0.22)`);
    grd.addColorStop(1.0, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    this.glow = c;
  }

  // offscreen layer the swarm is painted into, so we can blit a flipped, dimmed
  // copy beneath the horizon as a water/dew REFLECTION.
  _buildScratch() {
    this.scratch = document.createElement("canvas");
    this.sctx = this.scratch.getContext("2d");
    this._sizeScratch();
  }
  _sizeScratch() {
    if (!this.scratch) return;
    this.scratch.width = Math.max(1, Math.round(this.w * this.dpr));
    this.scratch.height = Math.max(1, Math.round(this.h * this.dpr));
  }

  onResize() { this._sizeScratch(); }

  // a quick CLICK = a gust that scatters the local wave (it re-forms after).
  onPointerDown() {
    if (!this.pointer.active) return;
    this._gustStart = this.t;
    this._clickGust = { x: this.pointer.x, y: this.pointer.y, fired: false };
  }
  onPointerUp() {
    // a SHORT press (<0.22s) is a gust; a long press was "deepen nightfall".
    const held = this.t - (this._gustStart || 0);
    if (this._clickGust && held < 0.22 && !this._clickGust.fired) {
      this._applyGust(this._clickGust.x, this._clickGust.y);
    }
    this._clickGust = null;
  }

  // scatter phases + positions in a radius → break a local front; it heals.
  _applyGust(gx, gy) {
    const R = 150, R2 = R * R;
    for (let i = 0; i < this.count; i++) {
      const dx = this.fx[i] - gx, dy = this.fy[i] - gy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const f = 1 - Math.sqrt(d2) / R;
      this.ph[i] = Math.random();              // throw the clock out of step
      this.refr[i] = rand(0, REFRACTORY);
      const a = Math.atan2(dy, dx);
      this.vx[i] += Math.cos(a) * 90 * f;      // blow outward
      this.vy[i] += Math.sin(a) * 90 * f;
    }
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const step = clamp(dt, 0, 0.05);
    const W = this.w, H = this.h, n = this.count;
    this._fertT = t;

    // press-hold in EMPTY space deepens nightfall + births more flies.
    const holding = this.pointer.down && this.pointer.active &&
                    (t - (this._gustStart || 0)) > 0.22;
    const target = holding ? 1 : 0;
    this.night = lerp(this.night, target, 1 - Math.pow(0.06, step));

    // --- night meadow: deep blue-green, darker when nightfall deepens --------
    const dk = 1 - this.night * 0.55;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${(4 * dk) | 0},${(7 * dk) | 0},${(13 * dk) | 0})`);
    sky.addColorStop(0.55, `rgb(${(5 * dk) | 0},${(10 * dk) | 0},${(13 * dk) | 0})`);
    sky.addColorStop(1, `rgb(${(7 * dk) | 0},${(19 * dk) | 0},${(15 * dk) | 0})`);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // ground MIST band low across the meadow (soft, drifting glow)
    const horizon = H * 0.62;
    const mist = g.createLinearGradient(0, horizon, 0, H);
    mist.addColorStop(0, "rgba(40,90,80,0)");
    mist.addColorStop(0.5, `rgba(34,86,76,${0.05 + this.night * 0.03})`);
    mist.addColorStop(1, `rgba(20,52,46,${0.10 + this.night * 0.05})`);
    g.fillStyle = mist;
    g.fillRect(0, horizon, W, H - horizon);

    // --- build the spatial grid for O(N) neighbour flashes -------------------
    const cell = this.senseR;
    const cols = Math.max(1, Math.ceil(W / cell));
    const rows = Math.max(1, Math.ceil(H / cell));
    const grid = this._grid || (this._grid = []);
    grid.length = cols * rows;
    for (let k = 0; k < grid.length; k++) grid[k] = null;
    for (let i = 0; i < n; i++) {
      const cgx = clamp((this.fx[i] / cell) | 0, 0, cols - 1);
      const cgy = clamp((this.fy[i] / cell) | 0, 0, rows - 1);
      const k = cgy * cols + cgx;
      (grid[k] || (grid[k] = [])).push(i);
    }

    const r2 = this.senseR * this.senseR;
    const eps = this.epsilon;
    const mouseOn = this.pointer.active && this.pointer.down;
    const mx = this.pointer.x, my = this.pointer.y;

    // breeze: slow whole-field drift so the meadow itself sways
    const windA = Math.sin(t * 0.13 + this.fertSeed) * 4 + Math.sin(t * 0.07) * 3;
    const windB = Math.cos(t * 0.11 + this.fertSeed * 1.3) * 4;

    // reset per-frame cascade counters & a flash queue (flies that fire now)
    const fired = (this._fired || (this._fired = []));
    fired.length = 0;
    for (let i = 0; i < n; i++) this.kicks[i] = 0;

    // ===== PASS 1: integrate clocks, detect natural flashes ==================
    for (let i = 0; i < n; i++) {
      // age / mortality envelope (fade in on birth, fade out near death)
      this.age[i] += step;
      const a = this.age[i], L = this.life[i];
      this.fade[i] = clamp(Math.min(a / 1.2, (L - a) / 1.6), 0, 1);

      // refractory countdown
      if (this.refr[i] > 0) this.refr[i] -= step;

      // climb the phase at its natural rate × tempo (a touch faster near a
      // dense fertile patch → patches lead the wave)
      this.ph[i] += this.rate[i] * this.tempo * step;

      // natural fire
      if (this.ph[i] >= 1) {
        this.ph[i] -= 1;
        this.fl[i] = 1;
        this.refr[i] = REFRACTORY;
        fired.push(i);
      }
      // flash decays quickly (a short pulse of light)
      this.fl[i] *= Math.pow(FLASH_FADE, step);
    }

    // ===== PASS 2: pulse-coupling. Each fired fly KICKS rested neighbours.
    // We process the queue, appending newly-tipped flies so the front CASCADES
    // within the frame — but a refractory fly is skipped (gates direction). ====
    for (let q = 0; q < fired.length; q++) {
      const i = fired[q];
      const x = this.fx[i], y = this.fy[i];
      const cgx = clamp((x / cell) | 0, 0, cols - 1);
      const cgy = clamp((y / cell) | 0, 0, rows - 1);
      for (let ny = cgy - 1; ny <= cgy + 1; ny++) {
        if (ny < 0 || ny >= rows) continue;
        for (let nx = cgx - 1; nx <= cgx + 1; nx++) {
          if (nx < 0 || nx >= cols) continue;
          const bucket = grid[ny * cols + nx];
          if (!bucket) continue;
          for (let bi = 0; bi < bucket.length; bi++) {
            const j = bucket[bi];
            if (j === i) continue;
            if (this.refr[j] > 0) continue;          // REFRACTORY → ignores kick
            if (this.kicks[j] >= MAX_CASCADE) continue;
            const dx = this.fx[j] - x, dy = this.fy[j] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            // closer neighbours feel a stronger kick (smooth falloff)
            const w = 1 - d2 / r2;
            this.ph[j] += eps * w;
            this.kicks[j]++;
            // tipped over threshold → it fires too, joining the front
            if (this.ph[j] >= 1) {
              this.ph[j] -= 1;
              this.fl[j] = 1;
              this.refr[j] = REFRACTORY;
              fired.push(j);
            }
          }
        }
      }
    }

    // ===== PASS 3: move + draw into the scratch layer (for reflection) =======
    const sg = this.sctx;
    sg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    sg.globalCompositeOperation = "source-over";
    sg.clearRect(0, 0, W, H);
    sg.globalCompositeOperation = "lighter";

    for (let i = 0; i < n; i++) {
      let x = this.fx[i], y = this.fy[i];

      // wander + fertility pull: drift toward fertile (dense) spots so the swarm
      // clusters into patches; lantern overrides when the pointer is held.
      const fertHere = this._fert(x, y, t);
      const fgx = this._fertGrad(x, y, t, 0) * 18;
      const fgy = this._fertGrad(x, y, t, 1) * 18;
      this.vx[i] += windA * step + fgx * step;
      this.vy[i] += windB * step + fgy * step;
      if (mouseOn) {                              // LANTERN: gather toward cursor
        this.vx[i] += (mx - x) * 0.55 * step;
        this.vy[i] += (my - y) * 0.55 * step;
      }
      this.vx[i] = this.vx[i] * 0.93 + rand(-0.8, 0.8);
      this.vy[i] = this.vy[i] * 0.93 + rand(-0.8, 0.8);
      x += this.vx[i] * step * 6;
      y += this.vy[i] * step * 6;
      // soft toroidal wrap
      if (x < -6) x = W + 6; else if (x > W + 6) x = -6;
      if (y < -6) y = H + 6; else if (y > H + 6) y = -6;
      this.fx[i] = x; this.fy[i] = y;

      // brightness: a dim breathing ember always present, bright on flash.
      // patches in fertile ground rest a touch brighter (denser glow).
      const rest = (0.05 + 0.05 * fertHere) * (0.7 + 0.3 * Math.sin(this.ph[i] * TAU));
      const b = Math.max(rest, this.fl[i]) * this.fade[i];
      this._drawFly(sg, x, y, b, this.fl[i]);

      // LANTERN seeds flashes: a fly gathered near the cursor that's rested gets
      // a small kick → the congregation becomes a wave-emitter.
      if (mouseOn && this.refr[i] <= 0) {
        const dx = x - mx, dy = y - my;
        if (dx * dx + dy * dy < 9000) this.ph[i] += eps * 0.5 * step * 60;
      }
    }

    // --- composite: reflection (flipped, dim) then the real swarm ------------
    g.globalCompositeOperation = "lighter";
    // mirrored reflection below the horizon, faint and vertically squashed.
    // work in device px: translate to the horizon, flip Y, scale 0.7, blit.
    g.save();
    g.globalAlpha = 0.2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(0, horizon * this.dpr * 2);
    g.scale(1, -0.7);
    g.drawImage(this.scratch, 0, 0);
    g.restore();

    // the real swarm on top
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.drawImage(this.scratch, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;

    // ===== mortality + births: keep the tide alive (recycle dead flies) =====
    this._birthAcc += step * (3 + this.night * 4);   // birth rate (more at night)
    for (let i = 0; i < n; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this._birthAcc >= 1) { this._birthAcc -= 1; this._birth(i, false); }
      }
    }
  }

  // central-difference of the fertility field → a gradient component (0:x,1:y)
  _fertGrad(x, y, t, axis) {
    const e = 22;
    if (axis === 0) return (this._fert(x + e, y, t) - this._fert(x - e, y, t)) / (2 * e) * 1000;
    return (this._fert(x, y + e, t) - this._fert(x, y - e, t)) / (2 * e) * 1000;
  }

  // a firefly: a soft glow (additive) + a crisp warm pixel body.
  // `b`=overall brightness, `flash`=the sharp flash component (drives glow size).
  _drawFly(g, x, y, b, flash) {
    if (b <= 0.012) return;
    const px = Math.round(x), py = Math.round(y);
    const [r, gg, bl] = this.accentRgb;
    // comet-trail glow: scales with the flash so fronts read as moving light
    if (b > 0.06) {
      const s = 8 + flash * 30 + b * 6;
      g.globalAlpha = clamp(b * 1.1, 0, 1);
      g.drawImage(this.glow, px - s / 2, py - s / 2, s, s);
    }
    // crisp body — warmer/whiter at peak flash
    g.globalAlpha = clamp(0.3 + b, 0, 1);
    const fr = Math.min(255, r + flash * 90);
    const fgc = Math.min(255, gg + flash * 70);
    const fbc = Math.round(bl * 0.55 + flash * 120);
    g.fillStyle = `rgb(${fr | 0},${fgc | 0},${fbc})`;
    g.fillRect(px - 1, py - 1, 2, 2);
    g.globalAlpha = 1;
  }

  controls(host) {
    host.appendChild(slider("FIREFLIES", 80, this.cap, this.count, 20,
      (v) => {
        const nv = clamp(v | 0, 1, this.cap);
        if (nv > this.count) for (let i = this.count; i < nv; i++) this._birth(i, false);
        this.count = nv;
      }, (v) => String(v | 0)));
    host.appendChild(slider("COUPLING", 0.0, 0.2, this.epsilon, 0.005,
      (v) => (this.epsilon = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("TEMPO", 0.4, 1.8, this.tempo, 0.05,
      (v) => (this.tempo = v), (v) => (+v).toFixed(2)));
    host.appendChild(buttonRow([
      { label: "돌풍 (Gust)", on: () => this._applyGust(rand(this.w), rand(this.h * 0.7)) },
    ]));
  }
}
