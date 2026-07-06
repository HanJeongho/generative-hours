// ============================================================================
//  24 · Hyperspace — relativistic star travel
//  A 3D starfield projected to 2D and flown toward the viewer. As throttle
//  ramps toward "light speed", stars stretch into streaks radiating from the
//  flight direction, bunch forward (aberration), Doppler-shift blue→red, and
//  a bright tunnel of light blooms at the vanishing point.
//    pointer.down = accelerate (hold to keep throttling up, capped)
//    release      = coast / decelerate back to cruise
//    cursor       = steer the vanishing point (where you're heading)
// ============================================================================

import { Piece, TAU, clamp, lerp, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const NEAR = 0.12;          // recycle plane: stars closer than this wrap to far
const FAR = 3.2;            // depth a recycled star is reborn at
const FOV_SPREAD = 2.2;     // how wide (in x/y) stars are seeded relative to FAR

export default class Hyperspace extends Piece {
  setup() {
    this.g = this.canvas.getContext("2d");

    // ---- control-bound parameters --------------------------------------
    this.cruise = 0.55;       // THROTTLE: baseline travel speed (z per sec)
    this.density = 850;       // STAR DENSITY: target star count
    this.focal = 320;         // FIELD OF VIEW: projection focal length

    // ---- dynamic warp state --------------------------------------------
    this.throttle = this.cruise;  // current speed, eased toward target
    this.jump = 0;                // 0..1 burst-to-max-warp envelope ("점프")
    this.accent = this.opts.accent || "#9aa8ff";  // cosmic indigo
    this.acc = this._hex(this.accent);

    // vanishing point (flight direction), eased toward the cursor
    this.vx = this.w * 0.5;
    this.vy = this.h * 0.5;

    this.stars = [];
    this._fill();                 // seed the field so it's alive on load
  }

  // Parse "#rrggbb" → {r,g,b} once, so per-frame colour math stays cheap.
  _hex(h) {
    const n = parseInt(h.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // A fresh star at depth z, spread across the frustum. Spread scales with z
  // so distant stars cover the whole field when projected forward.
  _newStar(z) {
    const s = {
      x: rand(-FOV_SPREAD, FOV_SPREAD) * z,
      y: rand(-FOV_SPREAD, FOV_SPREAD) * z,
      z,
      psx: 0, psy: 0,             // previous projected screen pos (streak tail)
      seeded: false,              // skip drawing a streak on the first frame
    };
    return s;
  }

  _fill() {
    this.stars.length = 0;
    for (let i = 0; i < this.density; i++) {
      this.stars.push(this._newStar(rand(NEAR, FAR)));
    }
  }

  onResize() {
    // keep the vanishing point sensible; field is depth-based so no re-seed needed
    this.vx = clamp(this.vx, 0, this.w);
    this.vy = clamp(this.vy, 0, this.h);
  }

  // Throttle bursts upward while held; jump is a brief slam to max warp.
  onPointerDown() { this._accelerating = true; }
  onPointerUp() { this._accelerating = false; }

  frame(dt, t) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // keep star count in sync with the density slider (cheap add/remove)
    const want = this.density | 0;
    while (this.stars.length < want) this.stars.push(this._newStar(rand(NEAR, FAR)));
    if (this.stars.length > want) this.stars.length = want;

    // ---- steer: ease the vanishing point toward the cursor --------------
    if (this.pointer.active) {
      this.vx = lerp(this.vx, this.pointer.x, 1 - Math.pow(0.001, dt));
      this.vy = lerp(this.vy, this.pointer.y, 1 - Math.pow(0.001, dt));
    }
    const cx = this.vx, cy = this.vy;

    // ---- throttle dynamics ---------------------------------------------
    // Hold to ramp toward a high cap; release to coast back to cruise.
    const MAX = 4.6;                       // light-speed-ish cap
    let target = this.cruise;
    if (this._accelerating) target = lerp(target, MAX, 1);  // push to cap while held
    // jump envelope decays on its own and forces max warp while alive
    this.jump = Math.max(0, this.jump - dt * 0.65);
    if (this.jump > 0) target = MAX * (1 + this.jump * 0.4);
    // asymmetric easing: snappy to accelerate, smoother to coast down
    const k = target > this.throttle ? 2.4 : 1.1;
    this.throttle += (target - this.throttle) * clamp(k * dt, 0, 1);

    // normalized warp 0..1 used to drive all the relativistic effects
    const warp = clamp((this.throttle - this.cruise) / (MAX - this.cruise), 0, 1);
    const beam = clamp((this.throttle - this.cruise) / (MAX - this.cruise + 0.3), 0, 1);

    // ---- backdrop: near-black space, slightly cooled toward indigo ------
    // A faint motion-trail wash at high warp smears streaks into light rails.
    const trail = lerp(1, 0.34, warp);     // lower alpha = longer persistence
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(3,4,9,${trail})`;
    g.fillRect(0, 0, this.w, this.h);

    // additive blending so overlapping streaks build into glow
    g.globalCompositeOperation = "lighter";

    const focal = this.focal;
    const dz = this.throttle * dt;         // depth travelled this frame
    const acc = this.acc;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];

      s.z -= dz;                            // fly toward the viewer

      // recycle past the near plane → reborn far ahead with fresh x,y
      if (s.z <= NEAR) {
        Object.assign(s, this._newStar(FAR + rand(0, 0.6)));
        continue;
      }

      // ---- aberration / forward beaming -------------------------------
      // As warp rises, bias angular position toward the vanishing point so
      // stars bunch ahead. Achieved by scaling lateral offset inward.
      const bunch = lerp(1, 0.34, beam);
      const ax = s.x * bunch, ay = s.y * bunch;

      // ---- perspective projection -------------------------------------
      const sx = cx + (ax / s.z) * focal;
      const sy = cy + (ay / s.z) * focal;

      // off-screen cull (with margin for long streaks)
      if (sx < -200 || sx > this.w + 200 || sy < -200 || sy > this.h + 200) continue;

      // closeness 0..1 — near stars are bright and big
      const close = clamp(1 - (s.z - NEAR) / (FAR - NEAR), 0, 1);

      // ---- Doppler shift ----------------------------------------------
      // Radial distance from the flight axis: center → blue (approaching),
      // edges/trailing → red. Blend toward accent indigo, intensify with warp.
      const dx = sx - cx, dy = sy - cy;
      const radial = clamp(Math.hypot(dx, dy) / (Math.hypot(this.w, this.h) * 0.5), 0, 1);
      const doppler = lerp(-1, 1, radial) * warp;   // -1 blue (center) .. +1 red (edge)
      let r = acc.r, gC = acc.g, b = acc.b;
      if (doppler < 0) {                    // blueshift: lift blue, drop red
        const m = -doppler;
        r = lerp(r, r * 0.45, m);
        b = lerp(b, 255, m * 0.8);
        gC = lerp(gC, gC + 30, m * 0.5);
      } else {                              // redshift: lift red, drop blue
        const m = doppler;
        r = lerp(r, 255, m * 0.85);
        gC = lerp(gC, gC * 0.6, m);
        b = lerp(b, b * 0.4, m);
      }
      // pull toward white as stars get very close (hot core of a streak)
      const whiten = close * close * 0.7;
      r = lerp(r, 255, whiten); gC = lerp(gC, 255, whiten); b = lerp(b, 255, whiten);

      // ---- draw: dot at low speed, streak at high speed ---------------
      const alpha = clamp(0.18 + close * 0.7 + warp * 0.2, 0, 1);
      const width = lerp(0.8, 2.4, close) * (1 + warp * 0.6);

      if (s.seeded && (warp > 0.04 || close > 0.55)) {
        // streak from previous to current projected position
        g.strokeStyle = `rgba(${r | 0},${gC | 0},${b | 0},${alpha})`;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(s.psx, s.psy);   // last frame's screen pos → streak tail
        g.lineTo(sx, sy);
        g.stroke();
      } else {
        // distant slow star → simple point
        g.fillStyle = `rgba(${r | 0},${gC | 0},${b | 0},${alpha})`;
        g.fillRect(sx - width * 0.5, sy - width * 0.5, width, width);
      }

      s.psx = sx; s.psy = sy; s.seeded = true;
    }

    // ---- vanishing-point bloom / light tunnel at high warp -------------
    if (beam > 0.12) {
      const rad = lerp(20, Math.min(this.w, this.h) * 0.5, beam) * (1 + this.jump * 0.6);
      const core = clamp(beam * 0.9 + this.jump * 0.4, 0, 1);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(220,228,255,${core})`);
      grad.addColorStop(0.25, `rgba(${acc.r},${acc.g},${acc.b},${core * 0.55})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rad, 0, TAU);
      g.fill();
    }

    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("THROTTLE", 0.15, 2.2, this.cruise, 0.05, (v) => {
      this.cruise = v;
      if (!this._accelerating) this.throttle = Math.max(this.throttle, v);
    }));
    host.appendChild(slider("STAR DENSITY", 200, 1400, this.density, 50,
      (v) => (this.density = v), (v) => (v | 0)));
    host.appendChild(slider("FIELD OF VIEW", 150, 600, this.focal, 10,
      (v) => (this.focal = v), (v) => (v | 0)));
    host.appendChild(buttonRow([
      // burst to max warp briefly, then decay back to cruise
      { label: "점프 (jump)", on: () => { this.jump = 1; } },
    ]));
  }
}
