// ============================================================================
//  40 · 점묘 (After Seurat — A Sunday Pointillist)
//  Thousands of coloured dots drift as a loose cloud, then MAGNETIZE into a
//  recognisable divisionist scene after Georges Seurat's "A Sunday Afternoon
//  on the Island of La Grande Jatte" (1884–86): a cream-green sky, the blue
//  Seine with tiny sailboats, a bright sunlit lawn slashed by cool diagonal
//  tree-shadows, tall dark trees, and — the unmistakable focal point — the
//  PARASOL LADY on the right in her bell-shaped bustle gown, parasol tilted
//  over her head, a small top-hatted gentleman at her side. Holds with a
//  gentle shimmer, then dissolves and reforms. No images are loaded: every
//  dot's HOME (x, y, colour) is sampled from procedural regions, and its
//  colour is split into adjacent complementary hues so optic mixing happens
//  in the eye, the way La Grande Jatte reads warm at a distance.
//
//  Cycle:  SCATTER (noise-drift cloud) → CONVERGE (ease to home, picture forms)
//          → HOLD (shimmer in place) → SCATTER … loops every ~12 s.
//  Pointer REPELS nearby dots (smudge the picture; it heals). Click toggles an
//  instant CONVERGE/SCATTER snap. Dragging through the held picture shoves dots
//  aside, leaving a temporary hole that fills back in.
// ============================================================================

import { Piece, TAU, clamp, lerp, map, rand, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// --- Seurat-ish palette --------------------------------------------------
// Warm Sunday-afternoon divisionism. Each region carries a few base hues; per
// dot we jitter toward a complementary "broken colour" so dense neighbours mix.
const CREAM = "#efe6cf";          // gallery wall / canvas ground

// region colour banks (HSL triples). The renderer splits each toward a
// complement with a small per-dot probability — that's the divisionist trick.
const PALETTE = {
  sky:      [[52, 26, 86], [44, 22, 82], [70, 20, 84], [40, 24, 88]],   // pale warm cream-green
  water:    [[205, 50, 56], [198, 44, 64], [215, 54, 48], [188, 34, 70]], // Seine blue + teal sparkle
  sail:     [[44, 18, 92], [30, 24, 86], [210, 16, 88]],                // pale sailboat canvas
  lawn:     [[78, 58, 54], [88, 54, 50], [64, 52, 60], [98, 48, 46]],   // bright sunlit yellow-green
  shadow:   [[168, 38, 34], [186, 34, 30], [150, 32, 38], [120, 28, 30]], // cool blue-green shade
  trunk:    [[26, 46, 30], [20, 40, 24], [36, 32, 38]],                 // bark browns + ochre
  foliage:  [[128, 46, 26], [110, 50, 32], [142, 42, 22], [88, 44, 40]], // dark tree-canopy greens
  lady:     [[265, 24, 24], [300, 22, 28], [230, 28, 20], [20, 26, 30]], // dark dress dusk-violet/rose
  parasol:  [[42, 58, 80], [22, 64, 72], [50, 60, 86]],                 // warm cream/coral parasol (light)
  gent:     [[230, 16, 16], [0, 0, 14], [30, 14, 22]],                  // dark gentleman + top hat
  figure:   [[24, 28, 40], [200, 22, 44], [330, 22, 42], [60, 20, 50]], // small lawn strollers
  dog:      [[28, 36, 30], [20, 30, 24]],                               // tiny dog
};
const REGIONS = Object.keys(PALETTE);

// complementary partner hue (≈ +180°) for broken colour
const comp = (h) => (h + 180) % 360;

export default class Pointillist extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.count = this._targetCount();
    this.dotSize = 1.5;           // base dot radius (CSS px) — fine divisionist points
    this.cycleSpeed = 1.0;        // multiplies phase advance + converge rate

    // animation phase machine
    this.PHASES = { scatter: 0, converge: 1, hold: 2 };
    this.phase = this.PHASES.scatter;
    this.phaseT = 0;              // seconds in current phase
    this.assemble = 0;            // 0 = full cloud … 1 = full picture (eased)
    this.forced = null;           // null | "converge" | "scatter" (overrides cycle)

    this.dots = [];
    this._build();
    this._wash();
  }

  // dot budget scales with viewport but stays performant for 60fps.
  // Finer, denser points → the assembled portrait reads at higher resolution.
  _targetCount() {
    const area = this.w * this.h;
    return Math.round(clamp(area / 70, 12000, 24000));
  }

  // paint the cream ground once (we redraw it each frame anyway)
  _wash() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = CREAM;
    g.fillRect(0, 0, this.w, this.h);
  }

  onResize() {
    this.count = this._targetCount();
    this._build();
    this._wash();
  }

  // ---- build the picture: assign every dot a procedural HOME + colour -----
  _build() {
    const W = this.w, H = this.h;
    this.dots.length = 0;

    // Weighted region budget. The lawn gets the bulk as a textured field; the
    // figure and tree silhouettes get enough mass to read SOLID, not sparse.
    const weights = {
      sky: 0.13, water: 0.08, sail: 0.004,
      lawn: 0.30, shadow: 0.12,
      foliage: 0.135, trunk: 0.016,
      lady: 0.075, parasol: 0.030, gent: 0.028,
      figure: 0.046, dog: 0.006,
    };
    const wEntries = REGIONS.map((r) => [r, weights[r] || 0.04]);
    const wTotal = wEntries.reduce((s, e) => s + e[1], 0);

    for (let i = 0; i < this.count; i++) {
      // pick a region by weighted random
      let pick = Math.random() * wTotal, region = "lawn";
      for (const [r, wv] of wEntries) { pick -= wv; if (pick <= 0) { region = r; break; } }

      const home = this._sampleRegion(region, W, H);
      // some regions can fail to place (rejection-sampled silhouettes) → retry
      if (!home) { i--; continue; }

      const col = this._dotColor(region);

      // cloud "rest" position the dot drifts around while scattered
      const cx = rand(W), cy = rand(H);
      this.dots.push({
        hx: home.x, hy: home.y,           // HOME (picture)
        x: cx, y: cy,                     // current
        ax: cx, ay: cy,                   // scatter anchor (drifts via noise)
        r: col.r, gg: col.g, b: col.b,    // base RGB
        cr: col.cr, cg: col.cg, cb: col.cb, // complement RGB (broken colour)
        split: col.split,                 // 0..1 fraction painted as complement
        sz: rand(0.80, 1.24),             // per-dot size multiplier
        ph: rand(TAU),                    // shimmer / drift phase
        seed: rand(1000),                 // noise offset
      });
    }
  }

  // ---- sample a HOME position inside a named procedural region ------------
  // Layout (normalised, left→right): sky top band; the Seine occupies the
  // upper-LEFT; sunlit lawn fills the lower ~2/3 with cool diagonal shadows;
  // two trees on the left; the PARASOL LADY + gentleman stand RIGHT of centre;
  // a few small strollers and a dog dot the lawn.
  _sampleRegion(region, W, H) {
    const horizon = H * 0.26;     // bottom of sky / top of distant ground
    let x, y;

    switch (region) {
      case "sky":
        return { x: rand(W), y: rand(0, horizon) };

      case "water": {
        // calm blue band of the Seine hugging the upper-LEFT / left edge.
        // Wedge: full-width near the horizon on the left, tapering right & down.
        const wy = rand(horizon * 0.55, H * 0.40);
        const reach = map(wy, horizon * 0.55, H * 0.40, 0.62, 0.30); // shrinks downstream
        x = rand(0, W * reach);
        return { x, y: wy };
      }

      case "sail": {
        // a couple of tiny pale sailboat triangles on the water
        const which = Math.random() < 0.5 ? 0 : 1;
        const bx = which ? W * 0.30 : W * 0.13;
        const by = which ? H * 0.20 : H * 0.30;
        const sh = H * 0.06;
        const fy = Math.random();                // 0 peak … 1 base
        const halfW = lerp(0, W * 0.018, fy);    // triangle widens downward
        return { x: bx + rand(-halfW, halfW), y: by - sh + sh * fy };
      }

      case "lawn":
        // bright sunlit sward filling the lower 2/3
        return { x: rand(W), y: rand(horizon, H) };

      case "shadow": {
        // Seurat's famous COOL DIAGONAL tree-shadows slanting across the lawn.
        // Three slanted bands; sample a point inside one (rejection on width).
        const bands = [
          { x0: 0.06, w: 0.16 },   // from the big left tree
          { x0: 0.30, w: 0.13 },   // from the second tree
          { x0: 0.50, w: 0.10 },   // a faint third
        ];
        const band = bands[(Math.random() * bands.length) | 0];
        const fy = Math.random();                       // depth down the lawn
        const y = lerp(horizon + H * 0.06, H * 0.98, fy);
        // each band slides RIGHT as it goes down → diagonal
        const slant = 0.34;
        const cx = (band.x0 + slant * fy) * W;
        const halfW = (band.w * 0.5) * W;
        // soft edges: cluster toward the band centre
        const off = (Math.random() + Math.random() - 1) * halfW;
        return { x: cx + off, y };
      }

      case "trunk": {
        // two thin trunks under the two left canopies
        const trees = [{ x: 0.14, top: 0.34, bot: 0.92 }, { x: 0.345, top: 0.30, bot: 0.78 }];
        const tr = trees[(Math.random() * trees.length) | 0];
        const tx = tr.x * W;
        y = rand(tr.top * H, tr.bot * H);
        const taper = map(y, tr.top * H, tr.bot * H, 0.4, 1.0); // narrow at top
        x = tx + rand(-W * 0.011, W * 0.011) * taper;
        return { x, y };
      }

      case "foliage": {
        // two tall dark-green rounded canopies on the LEFT
        const trees = [
          { cx: 0.14, cy: 0.20, rx: 0.135, ry: 0.20 },  // big left tree
          { cx: 0.345, cy: 0.17, rx: 0.10, ry: 0.155 }, // second tree
        ];
        const tr = trees[Math.random() < 0.62 ? 0 : 1];
        const cx = tr.cx * W, cy = tr.cy * H, rx = tr.rx * W, ry = tr.ry * H;
        for (let k = 0; k < 8; k++) {
          const a = rand(TAU), rr = Math.sqrt(Math.random());
          const lobe = 1 + 0.18 * Math.sin(a * 5);   // lumpy outline
          x = cx + Math.cos(a) * rx * rr * lobe;
          y = cy + Math.sin(a) * ry * rr * lobe;
          if (y < horizon + H * 0.10 && x > -W * 0.05) return { x, y };
        }
        return { x: cx, y: cy };
      }

      case "lady":    return this._sampleLady(W, H, "dress");
      case "parasol": return this._sampleLady(W, H, "parasol");
      case "gent":    return this._sampleGent(W, H);

      case "figure": {
        // a couple of small simple strollers on the lawn, well separated from
        // the lady so they don't muddy the read.
        const people = [
          { x: 0.40, base: 0.74, h: 0.13, w: 0.022 }, // mid-lawn standing pair
          { x: 0.45, base: 0.70, h: 0.11, w: 0.018 },
          { x: 0.07, base: 0.96, h: 0.10, w: 0.020 }, // seated near front-left
        ];
        const p = people[(Math.random() * people.length) | 0];
        const fy = Math.random();                       // 0 head … 1 feet
        const baseY = p.base * H;
        const yy = baseY - p.h * H + p.h * H * fy;
        const halfW = lerp(p.w * 0.5, p.w, fy) * W;     // slightly wider at base
        return { x: p.x * W + rand(-halfW, halfW), y: yy };
      }

      case "dog": {
        // tiny dog low-left on the lawn (the famous little monkey/dog area)
        const cx = W * 0.30, cy = H * 0.93;
        return { x: cx + rand(-W * 0.022, W * 0.022), y: cy + rand(-H * 0.014, H * 0.014) };
      }
    }
    return null;
  }

  // ----------------------------------------------------------------------
  //  THE PARASOL LADY — the unmistakable focal point, RIGHT of centre.
  //  A woman seen from behind in a long BELL-SHAPED bustle gown (narrow
  //  waist, very wide flaring hem) under a domed PARASOL on a thin pole,
  //  tilted slightly over her head. Built from primitives so the silhouette
  //  reads at a glance: head disc → torso → flared skirt → bustle bump.
  // ----------------------------------------------------------------------
  _sampleLady(W, H, part) {
    const cx = W * 0.72;          // figure centre x (RIGHT of centre)
    const hemY = H * 0.90;        // hem touches the lawn
    const headR = Math.min(W, H) * 0.024;
    const headY = H * 0.40;       // head sits high → she's a sizable figure
    const waistY = H * 0.56;
    const shoulderY = headY + headR * 1.8;

    if (part === "parasol") {
      // domed canopy tilted over the head + thin pole.
      const tilt = -0.18;                          // lean left a touch
      const domeCx = cx + Math.sin(tilt) * H * 0.10 - W * 0.012;
      const domeCy = headY - headR * 1.4 - H * 0.085;
      const domeRx = W * 0.085, domeRy = H * 0.052;
      if (Math.random() < 0.16) {
        // thin pole from dome down past the hand
        const fy = Math.random();
        return { x: lerp(domeCx, cx - W * 0.01, fy) + rand(-1.4, 1.4),
                 y: lerp(domeCy, waistY, fy) };
      }
      // canopy: upper-half ellipse, hug the rim so the dome reads solid
      const a = rand(Math.PI);                     // 0..π → top arc
      const rr = lerp(0.78, 1.0, Math.random());
      const x = domeCx + Math.cos(a) * domeRx * rr;
      const y = domeCy - Math.sin(a) * domeRy * rr;
      return { x, y };
    }

    // ---- the dress silhouette (dark) ----
    const roll = Math.random();
    // head (small disc)
    if (roll < 0.10) {
      const a = rand(TAU), rr = Math.sqrt(Math.random());
      return { x: cx + Math.cos(a) * headR * rr, y: headY + Math.sin(a) * headR * rr };
    }
    // torso/bodice: narrow taper from shoulders to waist
    if (roll < 0.30) {
      const fy = Math.random();
      const y = lerp(shoulderY, waistY, fy);
      const halfW = lerp(W * 0.030, W * 0.022, fy); // narrow waist
      return { x: cx + rand(-halfW, halfW), y };
    }
    // skirt: BELL flare from narrow waist to very wide hem
    const fy = Math.random();
    const y = lerp(waistY, hemY, fy);
    // quadratic flare → bell shape; extra width on the right = bustle/train
    const flare = fy * fy;
    const halfW = lerp(W * 0.026, W * 0.085, flare);
    const bustle = (fy > 0.35 ? (fy - 0.35) * W * 0.05 : 0); // train sweeps right
    return { x: cx + rand(-halfW, halfW) + bustle * Math.random(), y };
  }

  // small TOP-HATTED gentleman just left of the lady (her companion)
  _sampleGent(W, H) {
    const cx = W * 0.645;
    const baseY = H * 0.90;
    const headY = H * 0.44;
    const r = Math.random();
    // top hat: a tall narrow rectangle + brim above the head
    if (r < 0.22) {
      const hatTop = headY - H * 0.075;
      const fy = Math.random();
      const y = lerp(hatTop, headY - H * 0.018, fy);
      const halfW = W * 0.016;
      // wider brim at the very bottom
      const brim = fy > 0.86 ? W * 0.012 : 0;
      return { x: cx + rand(-halfW - brim, halfW + brim), y };
    }
    // head
    if (r < 0.34) {
      const hr = Math.min(W, H) * 0.018;
      const a = rand(TAU), rr = Math.sqrt(Math.random());
      return { x: cx + Math.cos(a) * hr * rr, y: headY + Math.sin(a) * hr * rr };
    }
    // narrow tailcoat body (dark column, slight widen at the coat tails)
    const fy = Math.random();
    const y = lerp(headY + H * 0.03, baseY, fy);
    const halfW = lerp(W * 0.020, W * 0.030, fy);
    return { x: cx + rand(-halfW, halfW), y };
  }

  // ---- choose a divisionist colour for a region ---------------------------
  _dotColor(region) {
    const bank = PALETTE[region];
    const [h, s, l] = bank[(Math.random() * bank.length) | 0];
    // jitter each channel a touch so no two dots are identical
    const hh = (h + rand(-8, 8) + 360) % 360;
    const ss = clamp(s + rand(-8, 8), 0, 100);
    const ll = clamp(l + rand(-7, 7), 0, 100);
    const base = hslToRgb(hh, ss, ll);
    // broken colour: a paired complement, slightly darker/duller.
    // Silhouette regions split LESS so they stay solid & readable.
    const solid = (region === "lady" || region === "gent" || region === "foliage" ||
                   region === "trunk" || region === "dog");
    const ch = comp(hh) + rand(-12, 12);
    const compRgb = hslToRgb((ch + 360) % 360, clamp(ss * 0.85, 0, 100), clamp(ll * 0.92, 0, 100));
    return {
      r: base[0], g: base[1], b: base[2],
      cr: compRgb[0], cg: compRgb[1], cb: compRgb[2],
      split: solid ? rand(0.04, 0.14) : rand(0.12, 0.34),
    };
  }

  // ---- phase / cycle machine ---------------------------------------------
  _advancePhase(dt) {
    this.phaseT += dt * this.cycleSpeed;

    // forced overrides (from click / buttons) bypass timed transitions
    if (this.forced === "converge") { this.phase = this.PHASES.converge; }
    else if (this.forced === "scatter") { this.phase = this.PHASES.scatter; }

    const P = this.PHASES;
    if (this.forced) {
      // when forced, still let hold settle in after convergence completes
      if (this.forced === "converge" && this.assemble > 0.985) { this.phase = P.hold; }
    } else {
      // timed loop: scatter 3s → converge ~3.5s → hold 4s → repeat
      if (this.phase === P.scatter && this.phaseT > 3.0) { this.phase = P.converge; this.phaseT = 0; }
      else if (this.phase === P.converge && this.assemble > 0.985) { this.phase = P.hold; this.phaseT = 0; }
      else if (this.phase === P.hold && this.phaseT > 4.0) { this.phase = P.scatter; this.phaseT = 0; }
    }

    // drive the eased assemble factor toward the phase's goal
    const goal = (this.phase === P.scatter) ? 0 : 1;
    const rate = (this.phase === P.converge ? 1.15 : this.phase === P.scatter ? 0.9 : 1.0)
               * this.cycleSpeed;
    this.assemble = lerp(this.assemble, goal, clamp(dt * rate * 2.2, 0, 1));
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // luminous cream wall with a soft warm vignette — keeps it painterly
    g.globalCompositeOperation = "source-over";
    g.fillStyle = CREAM;
    g.fillRect(0, 0, this.w, this.h);

    this._advancePhase(dt);

    const W = this.w, H = this.h, ptr = this.pointer;
    const asm = clamp(this.assemble, 0, 1);
    const easeAsm = asm * asm * (3 - 2 * asm);     // smoothstep for placement
    const held = (this.phase === this.PHASES.hold) || (asm > 0.97);

    const repelR = 92;                              // cursor repel radius
    const repelR2 = repelR * repelR;
    const drag = (ptr.active && (ptr.down || Math.hypot(ptr.vx, ptr.vy) > 1.2));

    g.globalCompositeOperation = "source-over";

    // slightly reduce dot radius at very high counts so dense fills stay crisp
    const countScale = this.count > 14000 ? lerp(1.0, 0.82, clamp((this.count - 14000) / 10000, 0, 1)) : 1.0;
    const base = this.dotSize * countScale;
    const driftAmp = lerp(46, 8, easeAsm);          // cloud loosens when scattered

    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];

      // --- scatter anchor wanders on a slow noise field (the drifting cloud)
      const ns = 0.0016;
      const nx = this.noise(d.ax * ns + d.seed, d.ay * ns - t * 0.05);
      const ny = this.noise(d.ay * ns - d.seed, d.ax * ns + t * 0.05);
      d.ax += nx * driftAmp * dt;
      d.ay += ny * driftAmp * dt;
      // keep the cloud loosely on-screen
      if (d.ax < -20) d.ax = W + 10; else if (d.ax > W + 20) d.ax = -10;
      if (d.ay < -20) d.ay = H + 10; else if (d.ay > H + 20) d.ay = -10;

      // scatter target = drifting anchor + a little personal swirl
      const sx = d.ax + Math.cos(d.ph + t * 0.6) * 6;
      const sy = d.ay + Math.sin(d.ph + t * 0.6) * 6;

      // home target with a gentle in-place shimmer while held.
      // SHARPENED: small, slow shimmer so the held picture firms up and reads.
      const sh = held ? 0.55 : 0.4;
      const hx = d.hx + Math.sin(t * 1.1 + d.ph) * sh;
      const hy = d.hy + Math.cos(t * 0.95 + d.ph * 1.3) * sh;

      // blend scatter ↔ home by the eased assemble factor
      let tx = lerp(sx, hx, easeAsm);
      let ty = lerp(sy, hy, easeAsm);

      // ease the dot toward its target (springy follow).
      // Firmer follow while assembled → less drift jitter, crisper image.
      const follow = lerp(0.06, 0.24, easeAsm) * (0.6 + this.cycleSpeed * 0.4);
      d.x += (tx - d.x) * follow;
      d.y += (ty - d.y) * follow;

      // --- cursor repulsion: smudge / drag a hole that heals afterwards
      if (ptr.active) {
        const dx = d.x - ptr.x, dy = d.y - ptr.y;
        const dd2 = dx * dx + dy * dy;
        if (dd2 < repelR2) {
          const dist = Math.sqrt(dd2) + 0.001;
          const f = (1 - dist / repelR);
          const push = (drag ? 26 : 14) * f * f;
          d.x += (dx / dist) * push;
          d.y += (dy / dist) * push;
          // dragging flings them along the cursor motion too
          if (drag) { d.x += ptr.vx * 0.18 * f; d.y += ptr.vy * 0.18 * f; }
        }
      }

      // --- paint as a soft divisionist dot. Optic mixing comes from density.
      const sz = base * d.sz * lerp(0.9, 1.06, easeAsm);
      // most of the dot in its base hue, a slice in the complement → vibrato
      const useComp = (((d.seed * 131 + i) % 100) / 100) < d.split;
      let r, gc, b;
      if (useComp) { r = d.cr; gc = d.cg; b = d.cb; } else { r = d.r; gc = d.gg; b = d.b; }

      // alpha rises as the picture firms up so the cloud reads as a haze, then
      // a crisp dense image (higher converged alpha → the scene reads clearly)
      const a = lerp(0.42, 1.0, easeAsm);

      g.fillStyle = `rgba(${r|0},${gc|0},${b|0},${a})`;
      g.beginPath();
      g.arc(d.x, d.y, sz, 0, TAU);
      g.fill();
    }

    // a faint warm glaze unifies the field (Seurat's luminous haze)
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = "rgba(255,238,200,0.10)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    this._syncReadout();
  }

  // click toggles instant CONVERGE ↔ SCATTER snap
  onPointerDown() {
    // only treat a clean tap (not a drag-smudge) as a toggle — but a quick
    // down still flips state; dragging additionally smudges via frame()
    const goingHome = !(this.assemble > 0.5);
    this.forced = goingHome ? "converge" : "scatter";
    this.phase = goingHome ? this.PHASES.converge : this.PHASES.scatter;
    this.phaseT = 0;
    if (this._stateOut) this._stateOut.textContent = goingHome ? "모이기" : "흩어지기";
  }

  _syncReadout() {
    if (!this._stateOut) return;
    const names = ["흩어지기", "모이기", "정지(shimmer)"];
    this._stateOut.textContent = names[this.phase] || "";
  }

  controls(host) {
    host.appendChild(slider("DOTS", 6000, 28000, this.count, 500,
      (v) => { this.count = v | 0; this._build(); },
      (v) => String(v | 0)));

    host.appendChild(slider("DOT SIZE", 0.8, 3.4, this.dotSize, 0.1,
      (v) => (this.dotSize = v), (v) => (+v).toFixed(1) + "px"));

    host.appendChild(slider("CYCLE", 0.35, 2.4, this.cycleSpeed, 0.05,
      (v) => (this.cycleSpeed = v), (v) => (+v).toFixed(2) + "×"));

    const row = buttonRow([
      { label: "모이기 (assemble)", on: () => {
        this.forced = "converge"; this.phase = this.PHASES.converge; this.phaseT = 0;
      } },
      { label: "흩어지기 (scatter)", on: () => {
        this.forced = "scatter"; this.phase = this.PHASES.scatter; this.phaseT = 0;
      } },
      { label: "자동 (auto)", on: () => { this.forced = null; this.phaseT = 0; } },
    ]);
    host.appendChild(row);

    // tiny live readout of the current phase
    const tag = document.createElement("label");
    tag.className = "ctrl";
    tag.innerHTML = `<span class="ctrl__label">PHASE<span class="ctrl__val"></span></span>`;
    this._stateOut = tag.querySelector(".ctrl__val");
    this._syncReadout();
    host.appendChild(tag);
  }
}

// ---- HSL → RGB (0..255) — local, allocation-light --------------------------
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (tc) => {
    if (tc < 0) tc += 1; if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return [hk(h + 1 / 3) * 255, hk(h) * 255, hk(h - 1 / 3) * 255];
}
