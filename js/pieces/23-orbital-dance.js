// ============================================================================
//  23 · Orbital Dance — Newtonian N-body gravity (cosmic indigo)
//  A massive central star anchors a handful of smaller bodies, each launched
//  with the tangential speed of a circular orbit so the system is alive and
//  dancing the moment it loads. Every pair attracts via softened gravity
//  (F ~ G·m/r², with a softening term that tames close-pass singularities).
//  Integration is semi-implicit (symplectic) Euler with K sub-steps per frame
//  — energy-stable, so orbits hold instead of slowly spiralling or blowing up.
//  Press-and-hold to charge a new body's mass (à la 01-currents); release to
//  drop it, and any drag motion while held slingshots it into orbit.
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// Press-and-hold mass charging. Holding longer makes a heavier (and bigger)
// body, but mass saturates at MAX so a held press can never grow without bound.
const CHARGE_TIME = 1.6;          // seconds of holding to reach full mass
const MIN_MASS = 8;               // mass of an instant tap
const MAX_MASS = 420;             // hard cap on a charged body's mass
const MAX_BODIES = 60;            // O(n²) pairwise stays cheap below this
const SOFTENING = 14;             // softening length (px) — avoids singularities
const SUBSTEPS = 4;               // physics sub-steps per rendered frame

export default class OrbitalDance extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.G = 1.0;                  // gravity strength (slider GRAVITY)
    this.trailFade = 0.10;         // bg wash alpha — lower = longer trails (TRAIL)
    this.timeScale = 1.0;          // simulation time scale (slider SPEED)
    this.bodies = [];
    this.shocks = [];              // expanding shockwave rings from merges
    this.sparks = [];              // ejected debris sparks from merges
    this.charging = null;          // active hold-to-charge body, or null
    [this.ar, this.ag, this.ab] = hexToRgb(this.accent); // cosmic indigo tint

    // faint starfield (parallax-free; just specks so black isn't dead)
    this.stars = [];
    this._seedStars();

    this.seedSystem();

    // initial dark wash so trails build on near-black space
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#04040a";
    g.fillRect(0, 0, this.w, this.h);
  }

  _seedStars() {
    this.stars.length = 0;
    const n = Math.round((this.w * this.h) / 5200);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: rand(0.3, 1.0),
        a: rand(0.05, 0.35),
        tw: rand(0, TAU),         // twinkle phase
      });
    }
  }

  // Newton's circular-orbit speed v = sqrt(G·M/r): give each satellite exactly
  // this, perpendicular to the radius, so it enters a (near) circular orbit.
  _orbitSpeed(M, r) { return Math.sqrt((this.G * M) / Math.max(r, 1)); }

  // Build a pleasing solar system: one heavy warm star + orbiting satellites.
  seedSystem() {
    this.bodies.length = 0;
    const cx = this.w / 2, cy = this.h / 2;
    const M = 1600;                               // central star mass
    this.bodies.push(this._mk(cx, cy, 0, 0, M, true, 38));

    const span = Math.min(this.w, this.h);
    const count = 6;
    for (let i = 0; i < count; i++) {
      // spread orbital radii across the available space
      const r = lerp(span * 0.10, span * 0.42, i / (count - 1)) * rand(0.92, 1.08);
      const ang = rand(0, TAU);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const m = rand(6, 26);
      const dir = i % 2 ? 1 : -1;                 // alternate orbit direction
      const v = this._orbitSpeed(M, r) * dir;
      // velocity is tangent: rotate the radial unit vector by 90°
      const tx = -Math.sin(ang), ty = Math.cos(ang);
      this.bodies.push(this._mk(x, y, tx * v, ty * v, m, false, 0));
    }
  }

  // Factory: radius scales with mass^(1/3) (volume → radius) unless pinned.
  _mk(x, y, vx, vy, mass, isStar = false, radius = 0, hueShift = null) {
    return {
      x, y, vx, vy, mass,
      radius: radius || this._radius(mass),
      isStar,
      // small hue variation around the indigo accent (warmer for the star)
      hue: hueShift == null ? rand(-26, 26) : hueShift,
      trail: [],
    };
  }
  _radius(m) { return clamp(Math.cbrt(m) * 2.4, 1.6, 46); }

  onResize() {
    this._seedStars();
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#04040a";
    g.fillRect(0, 0, this.w, this.h);
  }

  // ---- interaction (reuses the 01-currents press-and-hold charge pattern) ---
  // Begin charging a new body under the cursor. Mass grows while held (frame()).
  onPointerDown() {
    this.charging = { x: this.pointer.x, y: this.pointer.y, charge: 0 };
  }

  // Release: drop a body whose mass scales with how long it charged. If the
  // pointer moved while held, hand it the drag velocity → slingshot into orbit.
  onPointerUp() {
    const c = this.charging;
    if (!c) return;
    this.charging = null;
    const m = lerp(MIN_MASS, MAX_MASS, c.charge);
    // drag velocity: pointer.vx/vy is per-move delta; scale into sim units
    const vx = this.pointer.vx * 0.9;
    const vy = this.pointer.vy * 0.9;
    const isStar = m > MAX_MASS * 0.6;            // a heavy charge births a star
    this.bodies.push(this._mk(this.pointer.x, this.pointer.y, vx, vy, m, isStar));
    if (this.bodies.length > MAX_BODIES) this.bodies.shift();
  }

  // ---- physics -------------------------------------------------------------
  // One symplectic-Euler sub-step over all bodies (softened pairwise gravity).
  step(h) {
    const N = this.bodies.length;
    const soft2 = SOFTENING * SOFTENING;

    // accumulate accelerations from every unique pair (O(n²), N ≤ 60)
    for (let i = 0; i < N; i++) {
      const a = this.bodies[i];
      for (let j = i + 1; j < N; j++) {
        const b = this.bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const r2 = dx * dx + dy * dy + soft2;     // softening kills singularity
        const invR = 1 / Math.sqrt(r2);
        const base = (this.G / r2) * invR;        // shared G/r² then ·(d/|d|)
        // a feels pull of b's mass; b feels pull of a's mass (Newton's 3rd)
        const fa = base * b.mass;
        const fb = base * a.mass;
        a.vx += dx * fa * h; a.vy += dy * fa * h;
        b.vx -= dx * fb * h; b.vy -= dy * fb * h;
      }
    }

    // integrate position from the freshly-updated velocity (symplectic)
    for (let i = 0; i < N; i++) {
      const p = this.bodies[i];
      if (p.isStar && p.mass > 800) {             // anchor the dominant star
        // keep the seeded sun roughly centred so the dance has a stable hub
        p.vx *= 0.9; p.vy *= 0.9;
      }
      p.x += p.vx * h; p.y += p.vy * h;
    }
  }

  // Merge bodies that overlap: conserve momentum, sum mass, flash the survivor.
  _mergeOverlaps() {
    const B = this.bodies;
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < (a.radius + b.radius) * 0.55) {
          // bigger body absorbs the smaller; total momentum is preserved
          const big = a.mass >= b.mass ? a : b;
          const small = big === a ? b : a;
          const mt = big.mass + small.mass;
          big.vx = (big.vx * big.mass + small.vx * small.mass) / mt;
          big.vy = (big.vy * big.mass + small.vy * small.mass) / mt;
          big.x = (big.x * big.mass + small.x * small.mass) / mt;
          big.y = (big.y * big.mass + small.y * small.mass) / mt;
          big.mass = mt;
          big.radius = this._radius(mt);
          if (mt > 700) big.isStar = true;
          big.flash = 1.6;                        // strong collision bloom
          this._explode(small.x, small.y, small.mass, big);  // shockwave + debris
          this.bodies.splice(B.indexOf(small), 1);
          return;                                 // one merge per frame is plenty
        }
      }
    }
  }

  // Spawn a merge explosion: one expanding shockwave ring + a burst of debris
  // sparks. Scaled by the absorbed body's mass so big collisions feel bigger.
  _explode(x, y, mass, survivor) {
    const power = clamp(Math.cbrt(mass) * 0.5, 0.5, 4);
    this.shocks.push({ x, y, r: survivor.radius * 0.8, life: 1, max: 60 + power * 70 });
    const n = Math.round(6 + power * 8);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(40, 120) * (0.5 + power * 0.4);
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: rand(1.2, 2.6), warm: survivor.isStar,
      });
    }
    if (this.shocks.length > 24) this.shocks.shift();
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }

  // ---- frame ---------------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // grow the held body's charge toward full mass; it follows the cursor
    if (this.charging) {
      this.charging.charge = Math.min(1, this.charging.charge + dt / CHARGE_TIME);
      this.charging.x = this.pointer.x; this.charging.y = this.pointer.y;
    }

    // advance physics in fixed sub-steps for accuracy on fast close passes
    const total = clamp(dt, 0, 0.05) * this.timeScale * 60; // frame-rate stable
    const h = total / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.step(h);
      this._mergeOverlaps();
    }

    // record trail points + cull bodies that drift far off-screen (cap count)
    const margin = Math.max(this.w, this.h) * 1.5;
    const keep = [];
    for (const p of this.bodies) {
      p.trail.push(p.x, p.y);
      const maxLen = 64;                          // points kept per trail
      while (p.trail.length > maxLen * 2) { p.trail.shift(); p.trail.shift(); }
      if (p.flash) p.flash = Math.max(0, p.flash - dt * 2.5);
      const off = p.x < -margin || p.x > this.w + margin ||
                  p.y < -margin || p.y > this.h + margin;
      // never cull the dominant star; let it hold the system together
      if (!off || (p.isStar && p.mass > 800)) keep.push(p);
    }
    this.bodies = keep;

    // --- render -------------------------------------------------------------
    // fade-rect wash → trails (lower trailFade = longer-lasting streaks)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(4,4,10,${this.trailFade})`;
    g.fillRect(0, 0, this.w, this.h);

    // faint twinkling stars beneath everything
    g.globalCompositeOperation = "lighter";
    for (const st of this.stars) {
      const tw = st.a * (0.6 + 0.4 * Math.sin(t * 1.3 + st.tw));
      g.fillStyle = `rgba(${this.ar},${this.ag},${this.ab},${tw})`;
      g.fillRect(st.x, st.y, st.r, st.r);
    }

    // trails: a tapering indigo streak per body (additive)
    g.lineCap = "round";
    for (const p of this.bodies) {
      const tr = p.trail;
      if (tr.length < 4) continue;
      const [tr0, tg0, tb0] = this._tint(p, 0.9);
      g.beginPath();
      g.moveTo(tr[0], tr[1]);
      for (let i = 2; i < tr.length; i += 2) g.lineTo(tr[i], tr[i + 1]);
      g.strokeStyle = `rgba(${tr0},${tg0},${tb0},0.10)`;
      g.lineWidth = Math.max(0.6, p.radius * 0.35);
      g.stroke();
    }

    // merge shockwaves: expanding bright rings that fade as they grow
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.life -= dt * 1.8;
      s.r += dt * s.max * 1.4;
      if (s.life <= 0) { this.shocks.splice(i, 1); continue; }
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = `rgba(255,236,200,${clamp(s.life * 0.6, 0, 1)})`;
      g.lineWidth = clamp(s.life * 3, 0.5, 3);
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.stroke();
    }

    // debris sparks flung from a merge, drifting and fading
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt * sp.decay;
      if (sp.life <= 0) { this.sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      sp.vx *= 0.96; sp.vy *= 0.96;
      const a = clamp(sp.life, 0, 1);
      g.fillStyle = sp.warm
        ? `rgba(255,${220 * a + 30 | 0},${150 * a | 0},${a})`
        : `rgba(${this.ar},${this.ag},255,${a})`;
      g.fillRect(sp.x, sp.y, 2, 2);
    }

    // bodies: additive halo + bright core (size by mass, accent-tinted)
    for (const p of this.bodies) this._drawBody(g, p, t);

    // the body currently being charged renders as a real growing body — no ring
    if (this.charging) {
      const c = this.charging;
      const m = lerp(MIN_MASS, MAX_MASS, c.charge);
      this._drawBody(g, {
        x: c.x, y: c.y, mass: m, radius: this._radius(m),
        isStar: m > MAX_MASS * 0.6, hue: 0, flash: 0,
      }, t);
    }

    g.globalCompositeOperation = "source-over";
  }

  // Per-body indigo tint with slight hue variation; stars run warmer/brighter.
  _tint(p, k = 1) {
    // shift toward warm gold for stars, otherwise stay in the indigo family
    if (p.isStar) {
      return [clamp(255 * k, 0, 255), clamp(225 * k, 0, 255), clamp(170 * k, 0, 255)];
    }
    const hs = p.hue;                             // ±deg of perceptual nudge
    const r = clamp((this.ar + hs * 1.4) * k, 0, 255);
    const gg = clamp((this.ag + hs * 0.6) * k, 0, 255);
    const b = clamp((this.ab + hs * 0.2) * k, 0, 255);
    return [r | 0, gg | 0, b | 0];
  }

  _drawBody(g, p, t) {
    const [r, gg, b] = this._tint(p, 1);
    const flash = p.flash || 0;
    const pulse = p.isStar ? (0.9 + 0.1 * Math.sin(t * 1.6)) : 1;
    const core = p.radius;
    // halo kept tighter (was 7×) so the central star doesn't drown the whole
    // system in glow — this is what hid each merge's growth from the viewer.
    const halo = core * (p.isStar ? 3.4 : 3.2) * (1 + flash * 1.4);

    g.globalCompositeOperation = "lighter";
    // soft radial halo (additive glow)
    const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
    const ha = (p.isStar ? 0.55 : 0.42) * pulse + flash * 0.4;
    grd.addColorStop(0, `rgba(${r},${gg},${b},${clamp(ha, 0, 1)})`);
    grd.addColorStop(0.4, `rgba(${r},${gg},${b},${clamp(ha * 0.4, 0, 1)})`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(p.x, p.y, halo, 0, TAU); g.fill();

    // bright near-white core (warmer for the star)
    const cr = p.isStar ? 255 : 235, cg = p.isStar ? 244 : 238, cb = p.isStar ? 220 : 255;
    g.fillStyle = `rgba(${cr},${cg},${cb},${clamp(0.92 + flash, 0, 1)})`;
    g.beginPath(); g.arc(p.x, p.y, core * 0.62 * pulse, 0, TAU); g.fill();
  }

  // ---- controls ------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("중력 GRAVITY", 0.2, 3.0, this.G, 0.05,
      (v) => (this.G = v)));
    // TRAIL slider maps "length" 0..1 → wash alpha (longer = fainter wash)
    host.appendChild(slider("궤적 TRAIL", 0, 1, 1 - this.trailFade / 0.3, 0.02,
      (v) => (this.trailFade = lerp(0.30, 0.015, v)),
      (v) => (+v).toFixed(2)));
    host.appendChild(slider("속도 SPEED", 0.1, 2.5, this.timeScale, 0.05,
      (v) => (this.timeScale = v)));
    host.appendChild(buttonRow([
      { label: "태양계 (reset)", on: () => this.seedSystem() },
      { label: "비우기 (clear)", on: () => { this.bodies.length = 0; } },
    ]));
  }
}
