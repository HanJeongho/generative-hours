// ============================================================================
//  07 · Slime Network — Physarum agent simulation + pheromone trails
//  Thousands of agents crawl a downscaled grid, each sensing the trail map
//  ahead (left/center/right), turning toward the strongest scent, and
//  depositing pheromone as they go. Trails diffuse and decay every frame,
//  so the swarm self-organises into branching vein networks. Clicking drops
//  a persistent "food" attractor the colony flows toward.
// ============================================================================

import { Piece, TAU, clamp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class SlimeNetwork extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // Trail-map resolution = device px / scaleDown. Scale with dpr so the grid
    // (and thus agent density & perf) is the same on retina as on a 1× display —
    // otherwise a 2× screen quadruples the cells and the density/fps collapse.
    this.scaleDown = 3 * this.dpr;
    // behaviour parameters (degrees in UI, radians internally) — classic Physarum
    this.sensorAngle = 0.39;     // radians between center & side sensors (~22.5°)
    this.sensorDist = 9;         // cells ahead the sensors sample
    this.turnSpeed = 0.30;       // radians an agent can rotate per step
    this.decay = 0.96;           // trail multiplier each frame
    this.speed = 1.0;            // cells moved forward per step
    // Physarum naturally CONVERGES onto a few efficient trunks, so a closed swarm
    // slowly thins to sparse lines (coverage fell ~94%→50% over 20s). To keep a
    // lush, self-renewing web, a small fraction of agents wander off to empty
    // ground each frame and seed fresh branches there — like a real slime mould
    // always probing new territory. This holds coverage roughly steady.
    this.respawnRate = 0.004;    // fraction of agents relocated per frame
    // --- the key to a real network, not a few fat blobs ---------------------
    // Without an upper bound the busiest path's pheromone runs away (it reached
    // ~1600 in tests), so every agent piles onto a handful of trunks. Capping
    // the trail keeps strong and faint paths on the same scale, so thin branches
    // stay legible and a true vein network forms. deposit & render are scaled to
    // this cap (a single pass adds 1/5 of full strength).
    this.trailMax = 5.0;         // hard ceiling on any cell's pheromone
    this.deposit = 1.0;          // pheromone laid per agent per step
    this.accentRgb = hexToRgb(this.accent);
    // food attractors {x,y, amount}. Each click drops ONE morsel; the colony
    // eats it down (amount falls as agents arrive) until it's gone, leaving a
    // vein where the path it carved remains. Several can be active at once.
    this.foods = [];
    this.foodMax = 12;           // how many morsels can be active together
    this.foodAmount = 1.0;       // a fresh morsel's fullness (1 = full)
    this._alloc();
    this.reset();
  }

  _alloc() {
    // grid lives in DEVICE pixels (canvas.width/height already × dpr)
    this.gw = Math.max(80, Math.floor(this.canvas.width / this.scaleDown));
    this.gh = Math.max(60, Math.floor(this.canvas.height / this.scaleDown));
    const n = this.gw * this.gh;
    this.trail = new Float32Array(n);
    this.trail2 = new Float32Array(n);   // double-buffer for blur
    // Agent density (agents per grid cell) is what makes a NETWORK: too sparse
    // and agents never cross each other's trails, so no mutual reinforcement —
    // just a few stray threads. Target ~0.35/cell; the old min(20000,…) cap
    // starved big screens (720×406 grid ⇒ 0.07/cell). Cap at 80k for perf.
    this.count = Math.round(clamp(this.gw * this.gh * 0.35, 2000, 80000));
    this.img = this.ctx.createImageData(this.gw, this.gh);
    // offscreen canvas for the upscale to the full-res target
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
  }

  onResize() { this._alloc(); this.reset(); }

  // seed agents alive: scattered uniformly across the whole field with random
  // headings. Filling the plane (rather than a central disc) lets trails cross
  // everywhere from the start, so the vein network knits across the screen
  // instead of erupting from one clump.
  reset() {
    this.trail.fill(0);
    this.foods.length = 0;
    this.ax = new Float32Array(this.count);
    this.ay = new Float32Array(this.count);
    this.aa = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.ax[i] = Math.random() * this.gw;
      this.ay[i] = Math.random() * this.gh;
      this.aa[i] = rand(TAU);     // random initial heading
    }
  }

  onPointerDown() { this._dropFood(); }

  // Drop one morsel at the pointer. While dragging (held), only drop a new one
  // once the cursor has moved a few cells from the last morsel — so holding
  // still doesn't pile dozens onto one spot (the old bug), but a drag lays a
  // trail of food like a finger drawing a path.
  _dropFood() {
    if (!this.pointer.active) return;
    const gx = (this.pointer.x / this.w * this.gw) | 0;
    const gy = (this.pointer.y / this.h * this.gh) | 0;
    const last = this.foods[this.foods.length - 1];
    if (last && Math.hypot(last.x - gx, last.y - gy) < 6) return;
    this.foods.push({ x: gx, y: gy, amount: this.foodAmount });
    if (this.foods.length > this.foodMax) this.foods.shift();
  }

  // sample trail map with toroidal wrap
  _sense(x, y, ang, dist) {
    const { gw, gh, trail } = this;
    let sx = (Math.round(x + Math.cos(ang) * dist) % gw + gw) % gw;
    let sy = (Math.round(y + Math.sin(ang) * dist) % gh + gh) % gh;
    return trail[sy * gw + sx];
  }

  frame() {
    // drag-to-feed: lay a trail of morsels as the held pointer moves (the
    // distance gate in _dropFood stops a still cursor from stacking them)
    if (this.pointer.down && this.pointer.active) this._dropFood();
    this._stepAgents();
    this._diffuseDecay();
    this._render();
  }

  _stepAgents() {
    const { gw, gh, trail, ax, ay, aa } = this;
    const sa = this.sensorAngle, sd = this.sensorDist, ts = this.turnSpeed, sp = this.speed;
    const dep = this.deposit, cap = this.trailMax;
    const respawn = this.respawnRate;
    for (let i = 0; i < this.count; i++) {
      // wandering respawn: occasionally drop an agent on fresh ground with a new
      // heading, so empty regions keep sprouting branches and the web stays lush
      // instead of collapsing onto a few trunks.
      if (Math.random() < respawn) {
        ax[i] = Math.random() * gw; ay[i] = Math.random() * gh; aa[i] = Math.random() * TAU;
        continue;
      }
      const x = ax[i], y = ay[i], a = aa[i];
      // 1) SENSE three points ahead
      const c = this._sense(x, y, a, sd);
      const l = this._sense(x, y, a - sa, sd);
      const r = this._sense(x, y, a + sa, sd);
      // 2) TURN toward the strongest sensor (+ a little jitter)
      let na = a;
      if (c >= l && c >= r) na = a;                       // straight ahead wins
      else if (l > r) na = a - ts;                        // veer left
      else if (r > l) na = a + ts;                        // veer right
      else na = a + (Math.random() - 0.5) * ts;           // tie → random nudge
      na += (Math.random() - 0.5) * 0.08;                 // sensory noise
      // 3) MOVE forward, wrapping at edges
      let nx = x + Math.cos(na) * sp;
      let ny = y + Math.sin(na) * sp;
      if (nx < 0) nx += gw; else if (nx >= gw) nx -= gw;
      if (ny < 0) ny += gh; else if (ny >= gh) ny -= gh;
      // 4) DEPOSIT pheromone at the agent's cell, capped so no path runs away.
      const di = (ny | 0) * gw + (nx | 0);
      const t = trail[di] + dep;
      trail[di] = t > cap ? cap : t;
      ax[i] = nx; ay[i] = ny; aa[i] = na;
    }
    // Food attractors: each emits a scent (∝ remaining amount) the colony flows
    // toward, and gets EATEN as agents arrive — the more pheromone has built up
    // around it (i.e. the more of the colony has reached it), the faster it
    // depletes. When a morsel is used up it's removed, but the trail the swarm
    // carved to reach it persists as a vein. So feeding visibly grows new paths.
    for (let fi = this.foods.length - 1; fi >= 0; fi--) {
      const f = this.foods[fi];
      // measure how much colony has gathered on the morsel's cell (excludes the
      // food's own emission, which we add afterwards)
      let crowd = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const gx = (f.x + dx + gw) % gw, gy = (f.y + dy + gh) % gh;
        crowd += trail[gy * gw + gx];
      }
      crowd /= 25;                                  // mean trail over the 5×5 patch
      // consume: a slow baseline nibble + faster eating when the colony is thick
      f.amount -= 0.0009 + 0.004 * (crowd / cap);
      if (f.amount <= 0) { this.foods.splice(fi, 1); continue; }
      // emit scent scaled by what's left (a fading morsel pulls less strongly)
      const scent = cap * (0.4 + 0.6 * f.amount);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const gx = (f.x + dx + gw) % gw, gy = (f.y + dy + gh) % gh;
        const di = gy * gw + gx;
        if (trail[di] < scent) trail[di] = scent;   // raise toward scent, don't cap colony trails
      }
    }
  }

  // 3×3 box blur (diffuse) + multiplicative decay, written into trail2 then swap
  _diffuseDecay() {
    const { gw, gh, trail, trail2, decay } = this;
    for (let y = 0; y < gh; y++) {
      const ym = (y - 1 + gh) % gh, yp = (y + 1) % gh;
      const rowy = y * gw, rowm = ym * gw, rowp = yp * gw;
      for (let x = 0; x < gw; x++) {
        const xm = (x - 1 + gw) % gw, xp = (x + 1) % gw;
        const sum =
          trail[rowm + xm] + trail[rowm + x] + trail[rowm + xp] +
          trail[rowy + xm] + trail[rowy + x] + trail[rowy + xp] +
          trail[rowp + xm] + trail[rowp + x] + trail[rowp + xp];
        trail2[rowy + x] = (sum / 9) * decay;
      }
    }
    this.trail = trail2; this.trail2 = trail;   // double-buffer swap
  }

  _render() {
    const { trail, img, gw, gh } = this;
    const d = img.data;
    const [ar, ag, ab] = this.accentRgb;
    const invCap = 1 / this.trailMax;
    for (let i = 0; i < trail.length; i++) {
      // normalise by the trail ceiling, then a gentle sqrt gamma lifts the faint
      // branches so the whole network filigree reads (not just the bright trunks)
      const v = clamp(Math.sqrt(trail[i] * invCap), 0, 1);
      const glow = v * v * v;                  // white-hot cores
      const j = i * 4;
      d[j]     = 4  + ar * v * 0.85 + glow * 120;
      d[j + 1] = 6  + ag * v        + glow * 120;   // accent (green wing) dominant
      d[j + 2] = 9  + ab * v * 0.85 + glow * 120;
      d[j + 3] = 255;
    }
    this.bctx.putImageData(img, 0, 0);
    // upscale offscreen → canvas with identity transform (device px)
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  controls(host) {
    host.appendChild(slider("SENSOR ANGLE", 0.1, 1.2, this.sensorAngle, 0.01,
      (v) => (this.sensorAngle = v), (v) => (v * 180 / Math.PI).toFixed(0) + "°"));
    host.appendChild(slider("SENSOR DISTANCE", 3, 22, this.sensorDist, 1,
      (v) => (this.sensorDist = v), (v) => String(v | 0)));
    host.appendChild(slider("TURN SPEED", 0.1, 1.0, this.turnSpeed, 0.01,
      (v) => (this.turnSpeed = v)));
    host.appendChild(slider("DECAY", 0.80, 0.99, this.decay, 0.005,
      (v) => (this.decay = v), (v) => (+v).toFixed(3)));
    host.appendChild(buttonRow([
      { label: "재생성 (Reset)", on: () => this.reset() },
    ]));
  }
}
