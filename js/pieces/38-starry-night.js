// ============================================================================
//  38 · 별이 빛나는 밤 (After Van Gogh's Starry Night)
//  Van Gogh's swirling sky reimagined as a LIVING FLOW FIELD of impasto
//  brush-stroke particles. Two-three big rotating vortices echo the famous
//  double-swirl; thousands of short, fat, comet-like strokes flow along the
//  field in bands of cobalt / cerulean / pale blue, leaving painterly trails.
//  Chrome-yellow stars + a crescent moon ring the upper sky, their halos
//  pulling the strokes into orbiting swirls. A dark cypress flame rises on the
//  left, a sleeping village with a church spire sits along the bottom.
//  Drag stirs the paint (a temporary vortex follows the cursor, then eases
//  back to the composition); click drops a new swirling star that fades.
// ============================================================================

import { Piece, makeNoise, TAU, clamp, lerp, map, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// Van Gogh palette — deep cobalt/indigo night, swirling blues, chrome yellow.
// Brushstroke colour bands (HSL h,s,l) drawn from the painting's directional dabs.
const BANDS = [
  [222, 70, 26],  // deep cobalt / indigo shadow
  [216, 74, 38],  // cobalt
  [205, 72, 52],  // cerulean
  [196, 66, 66],  // pale sky blue
  [186, 48, 80],  // near-white moonlit blue
];
const NIGHT = "#0b1530";          // base wash (deep indigo night)
const STAR_HUE = 48, STAR_SAT = 92; // chrome yellow

export default class StarryNight extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();
    this.scale = 0.0019;            // spatial frequency of the underlying field
    this.turb = 1.0;                // TURBULENCE — overall field strength
    this.flow = 1.0;                // FLOW — particle speed
    this.count = this._targetCount();
    this.particles = [];

    this._layout();                 // place vortices, stars, moon, scenery
    this.spawn();

    // initial dark wash so impasto trails build on indigo night
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, this.w, this.h);

    this.stirring = null;           // temporary cursor vortex while dragging
    this.dropped = [];              // clicked stars that slowly fade
  }

  _targetCount() {
    const area = this.w * this.h;
    // BRUSHES slider scales this; fat strokes so fewer than 01-currents.
    const base = Math.round(clamp(area / 220, 1200, 7000));
    // final cap keeps the per-frame stroke count sane even at BRUSHES 500%.
    return Math.round(clamp(base * (this.brushMul || 1), 600, 24000));
  }

  // Composition: vortices echo the double-swirl in the upper sky; stars + moon
  // at canonical-ish positions; cypress + village as dark silhouettes.
  _layout() {
    const W = this.w, H = this.h;
    // The painting's twin central swirls + a smaller satellite eddy.
    this.baseVortices = [
      { fx: 0.46, fy: 0.30, dir: -1, fr: 0.30, fs: 2.4 }, // main great swirl
      { fx: 0.62, fy: 0.34, dir: 1, fr: 0.22, fs: 2.0 },  // counter swirl
      { fx: 0.24, fy: 0.22, dir: -1, fr: 0.16, fs: 1.5 }, // upper-left eddy
    ];
    // Chrome-yellow stars (fractional positions) + crescent moon top-right.
    this.stars = [
      { fx: 0.18, fy: 0.18, r: 12, dir: -1 },
      { fx: 0.30, fy: 0.40, r: 8, dir: 1 },
      { fx: 0.40, fy: 0.16, r: 7, dir: -1 },
      { fx: 0.55, fy: 0.46, r: 9, dir: 1 },
      { fx: 0.66, fy: 0.22, r: 7, dir: -1 },
      { fx: 0.78, fy: 0.40, r: 8, dir: 1 },
      { fx: 0.50, fy: 0.62, r: 6, dir: -1 },
      { fx: 0.86, fy: 0.55, r: 6, dir: 1 },
    ];
    this.moon = { fx: 0.86, fy: 0.17, r: 26, dir: 1 };

    // --- village: a varied little cluster of houses, generated once so the
    //  shapes are stable across frames. Each house has its own width, height,
    //  roof style, lean and a couple of windows — no two identical (the old
    //  version drew six clones, all floating off the rolling hill).
    const styles = ["gable", "gable", "hip", "flat", "gable"]; // weighted to gabled
    this.houses = [];
    let cursor = 0.46;                         // cluster starts right of the church
    const nHouses = 6;
    for (let i = 0; i < nHouses; i++) {
      const bw = rand(0.032, 0.06);           // body width (fraction of W)
      const bh = rand(0.04, 0.075);           // body height (fraction of H)
      const style = styles[(Math.random() * styles.length) | 0];
      this.houses.push({
        fx: cursor + bw * 0.5,
        bw, bh, style,
        roofH: rand(0.02, 0.045),             // gable/hip roof height (frac H)
        lean: rand(-0.04, 0.04),              // slight Van-Gogh wonkiness
        lit: Math.random() < 0.7,             // most windows glow warm
        win: 1 + ((Math.random() * 2) | 0),   // 1–2 windows
        tone: (Math.random() * 3) | 0,        // body shade variant
      });
      cursor += bw + rand(0.004, 0.02);       // gap to next house
    }
    // the church: a taller body + tall pointed steeple, set INSIDE the cluster
    // (clear of the gallery placard on the left) so its iconic spire reads.
    this.church = { fx: 0.40, bw: 0.052, bh: 0.105, spire: 0.18 };

    this._place();
  }

  // The continuous hill SURFACE y at a given pixel x. Houses & church plant
  // their feet exactly on this so nothing floats above or sinks below the hill.
  _hillY(x) {
    const W = this.w, H = this.h;
    const ground = H * 0.84;
    const u = x / W;
    return ground
      + Math.sin(u * 6.3 + 0.6) * H * 0.018
      + Math.sin(u * 13.0 + 1.9) * H * 0.008
      + Math.sin(u * 2.4 - 0.5) * H * 0.012;
  }

  // Resolve fractional layout to pixels (also on resize).
  _place() {
    const W = this.w, H = this.h;
    const minDim = Math.min(W, H);
    this.vortices = this.baseVortices.map((v) => ({
      x: v.fx * W, y: v.fy * H, dir: v.dir,
      radius: v.fr * minDim, strength: v.fs,
    }));
    for (const s of this.stars) { s.x = s.fx * W; s.y = s.fy * H; }
    this.moon.x = this.moon.fx * W; this.moon.y = this.moon.fy * H;
  }

  spawn() {
    this.count = this._targetCount();
    this.particles.length = 0;
    for (let i = 0; i < this.count; i++) this.particles.push(this._newP());
  }

  // Adjust the brush COUNT without a full reset. Moving the slider used to call
  // spawn(), which re-randomised every stroke's position → a jarring full-frame
  // flash each tick. Instead we add/trim particles incrementally so the sky just
  // gets denser or sparser smoothly (no "spike then settle").
  _retarget() {
    const want = this._targetCount();
    const have = this.particles.length;
    if (want > have) {
      for (let i = have; i < want; i++) this.particles.push(this._newP());
    } else if (want < have) {
      this.particles.length = want;
    }
    this.count = want;
  }
  _newP() {
    const band = (Math.random() * BANDS.length) | 0;
    return {
      x: Math.random() * this.w, y: Math.random() * this.h,
      px: 0, py: 0,
      life: rand(60, 240),
      band,
      len: rand(2.0, 5.0),         // stroke length (comet tail factor)
      wid: rand(1.4, 3.2),         // impasto thickness
    };
  }

  onResize() {
    this._place();
    this.spawn();
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, this.w, this.h);
  }

  // Drag stirs the sky: a temporary vortex follows the cursor.
  onPointerDown() {
    this.stirring = {
      x: this.pointer.x, y: this.pointer.y,
      dir: Math.random() < 0.5 ? 1 : -1,
      strength: 0,                 // ramps up while dragging
    };
    this._downX = this.pointer.x; this._downY = this.pointer.y;
    this._moved = 0;
  }

  // Release: if it was basically a click (little movement) drop a fading star;
  // otherwise the stir just eases away.
  onPointerUp() {
    if (this.stirring && this._moved < 10) {
      this.dropped.push({
        x: this._downX, y: this._downY,
        r: rand(6, 11), dir: Math.random() < 0.5 ? 1 : -1, life: 1,
      });
      if (this.dropped.length > 8) this.dropped.shift();
    }
    this.stirring = null;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // per-frame fade → living impasto trails (gentler than 01 so paint reads thick)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(11,21,48,0.052)";
    g.fillRect(0, 0, W, H);

    const sc = this.scale;
    const zo = t * 0.05;                 // slow breathing drift of the field
    const ptr = this.pointer;

    // --- update interactive stir vortex (follows cursor, ramps up) ----------
    if (this.stirring) {
      const dx = ptr.x - this.stirring.x, dy = ptr.y - this.stirring.y;
      this._moved += Math.hypot(ptr.x - (this._lastPx ?? ptr.x), ptr.y - (this._lastPy ?? ptr.y));
      this.stirring.x = ptr.x; this.stirring.y = ptr.y;
      this.stirring.strength = Math.min(3.4, this.stirring.strength + dt * 6);
    }
    this._lastPx = ptr.x; this._lastPy = ptr.y;

    // --- age dropped stars; their swirl & glow fade -------------------------
    for (const d of this.dropped) d.life -= dt * 0.16;
    this.dropped = this.dropped.filter((d) => d.life > 0);

    // ease vortex strengths back toward composition (swirl burst relaxes)
    for (let i = 0; i < this.vortices.length; i++) {
      const v = this.vortices[i], b = this.baseVortices[i];
      v.strength = lerp(v.strength, b.fs, 1 - Math.pow(0.5, dt * 1.6));
    }

    const moonPulse = 1 + 0.18 * Math.sin(t * 0.9);

    // ============= brushstroke particles ===================================
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    const tw = this.turb;
    const sp = this.flow * 2.2;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // base flow angle from layered value-noise (the painting's directional weave)
      const n = this.noise(p.x * sc + zo, p.y * sc - zo) +
                0.55 * this.noise(p.x * sc * 2.4 - zo * 1.3, p.y * sc * 2.4 + zo);
      let ang = n * TAU * 1.25;
      let vx = Math.cos(ang), vy = Math.sin(ang);

      // composition vortices — tangential swirl, strength peaks near centre
      for (let k = 0; k < this.vortices.length; k++) {
        const v = this.vortices[k];
        const dx = p.x - v.x, dy = p.y - v.y;
        const d = Math.hypot(dx, dy) + 0.001;
        if (d < v.radius) {
          const f = (1 - d / v.radius) * v.strength * v.dir * tw;
          vx += (-dy / d) * f; vy += (dx / d) * f;
        }
      }

      // stars + moon: field strength peaks near each → strokes orbit the halos
      const halo = this._haloPull(p, tw);
      vx += halo.vx; vy += halo.vy;

      // dropped (clicked) swirling stars
      for (const dd of this.dropped) {
        const dx = p.x - dd.x, dy = p.y - dd.y;
        const d = Math.hypot(dx, dy) + 0.001;
        const R = 90 * dd.life + 30;
        if (d < R) {
          const f = (1 - d / R) * 2.2 * dd.life * dd.dir * tw;
          vx += (-dy / d) * f; vy += (dx / d) * f;
        }
      }

      // dragging stir vortex
      if (this.stirring) {
        const s = this.stirring;
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = Math.hypot(dx, dy) + 0.001;
        const R = 170;
        if (d < R) {
          const f = (1 - d / R) * s.strength * s.dir;
          vx += (-dy / d) * f; vy += (dx / d) * f;
          // a little outward drag along cursor motion for "stirring paint"
          vx += (ptr.vx / 14) * (1 - d / R);
          vy += (ptr.vy / 14) * (1 - d / R);
        }
      }

      // advance — store previous point so we can stroke a fat comet streak
      p.px = p.x; p.py = p.y;
      const mag = Math.hypot(vx, vy) || 1;
      const step = sp;
      p.x += (vx / mag) * step * (0.8 + 0.5 * Math.min(mag, 2));
      p.y += (vy / mag) * step * (0.8 + 0.5 * Math.min(mag, 2));
      p.life -= 1;

      // colour: band lightness brightens with local flow speed (impasto highlight)
      const speed = clamp(mag / 3, 0, 1);
      const [bh, bs, bl] = BANDS[p.band];
      const l = clamp(bl + speed * 16, 12, 88);
      const a = 0.16 + speed * 0.10;        // additive → keep per-stroke alpha low

      // fat directional comet stroke (short tail behind the head)
      g.strokeStyle = `hsla(${bh},${bs}%,${l}%,${a})`;
      g.lineWidth = p.wid;
      g.beginPath();
      const tx = p.px - (p.x - p.px) * (p.len - 1);
      const ty = p.py - (p.y - p.py) * (p.len - 1);
      g.moveTo(tx, ty);
      g.lineTo(p.x, p.y);
      g.stroke();

      // respawn dead / off-screen; reseed mostly at edges so flow keeps entering
      if (p.life < 0 || p.x < -12 || p.x > W + 12 || p.y < -12 || p.y > H + 12) {
        Object.assign(p, this._newP());
        if (Math.random() < 0.5) {
          if (Math.random() < 0.5) { p.x = Math.random() * W; p.y = Math.random() < 0.5 ? -6 : H + 6; }
          else { p.y = Math.random() * H; p.x = Math.random() < 0.5 ? -6 : W + 6; }
        }
      }
    }

    // ============= luminous bodies (additive) ==============================
    g.globalCompositeOperation = "lighter";
    for (const s of this.stars) this._drawStar(g, s.x, s.y, s.r, 1, t);
    this._drawMoon(g, this.moon, moonPulse, t);
    for (const dd of this.dropped) this._drawStar(g, dd.x, dd.y, dd.r, dd.life, t);

    // ============= dark scenery silhouettes (over the sky) =================
    g.globalCompositeOperation = "source-over";
    this._drawCypress(g, t);
    this._drawVillage(g);
  }

  // Combined pull of every star + moon halo. Strokes spiral inward & orbit.
  // Writes into a reusable result object to keep per-particle allocation low.
  _haloPull(p, tw) {
    const out = this._haloOut || (this._haloOut = { vx: 0, vy: 0 });
    out.vx = 0; out.vy = 0;
    const px = p.x, py = p.y;
    const accum = (cx, cy, r) => {
      const dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy) + 0.001;
      const R = r * 6.5;                 // halo reach
      if (d < R) {
        const f = (1 - d / R);
        // tangential orbit + slight inward draw → strokes wind into the halo
        out.vx += (-dy / d) * f * 2.6 * tw + (-dx / d) * f * 0.5 * tw;
        out.vy += (dx / d) * f * 2.6 * tw + (-dy / d) * f * 0.5 * tw;
      }
    };
    for (const s of this.stars) accum(s.x, s.y, s.r);
    accum(this.moon.x, this.moon.y, this.moon.r);
    return out;
  }

  // Chrome-yellow star with a soft swirling halo.
  _drawStar(g, x, y, r, alpha, t) {
    const flick = 0.85 + 0.15 * Math.sin(t * 3 + x * 0.05);
    const R = r * 4.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, `hsla(${STAR_HUE},${STAR_SAT}%,86%,${0.95 * alpha})`);
    grad.addColorStop(0.18, `hsla(${STAR_HUE},${STAR_SAT}%,68%,${0.55 * alpha * flick})`);
    grad.addColorStop(0.5, `hsla(44,86%,56%,${0.20 * alpha * flick})`);
    grad.addColorStop(1, `hsla(40,80%,50%,0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, R, 0, TAU);
    g.fill();
    // hot core
    g.fillStyle = `hsla(54,100%,94%,${alpha})`;
    g.beginPath();
    g.arc(x, y, r * 0.5, 0, TAU);
    g.fill();
  }

  // Crescent moon: a glowing yellow disc with an indigo bite, big warm halo.
  _drawMoon(g, m, pulse, t) {
    const r = m.r * pulse;
    const R = r * 3.4;
    const grad = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, R);
    grad.addColorStop(0, `hsla(${STAR_HUE},${STAR_SAT}%,88%,0.9)`);
    grad.addColorStop(0.22, `hsla(46,88%,66%,0.5)`);
    grad.addColorStop(0.55, `hsla(42,82%,54%,0.16)`);
    grad.addColorStop(1, `hsla(40,80%,50%,0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(m.x, m.y, R, 0, TAU);
    g.fill();
    // bright disc
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "hsla(50,96%,82%,1)";
    g.beginPath();
    g.arc(m.x, m.y, r, 0, TAU);
    g.fill();
    // indigo bite → crescent
    g.fillStyle = NIGHT;
    g.beginPath();
    g.arc(m.x + r * 0.55, m.y - r * 0.18, r * 0.95, 0, TAU);
    g.fill();
    g.globalCompositeOperation = "lighter";
  }

  // Dark cypress flame on the left edge — twisting upward tongues.
  _drawCypress(g, t) {
    const W = this.w, H = this.h;
    const bx = W * 0.13;
    const baseY = H + 4;
    const topY = H * 0.10;
    const sway = Math.sin(t * 0.5) * 6;
    g.fillStyle = "#06101f";
    g.beginPath();
    g.moveTo(bx - W * 0.085, baseY);
    // left contour rising with flame-like wobble
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const y = lerp(baseY, topY, f);
      const width = lerp(W * 0.085, W * 0.004, f);
      const wob = Math.sin(f * 9 + t * 0.6) * width * 0.5 + sway * f;
      g.lineTo(bx - width + wob, y);
    }
    // right contour coming back down
    for (let i = steps; i >= 0; i--) {
      const f = i / steps;
      const y = lerp(baseY, topY, f);
      const width = lerp(W * 0.085, W * 0.004, f);
      const wob = Math.sin(f * 9 + 1.7 + t * 0.6) * width * 0.5 + sway * f;
      g.lineTo(bx + width + wob, y);
    }
    g.closePath();
    g.fill();
  }

  // Sleeping village along the bottom: the rolling hill is one continuous curve
  // (_hillY), and every building plants its feet ON that curve so nothing floats.
  _drawVillage(g) {
    const W = this.w, H = this.h;

    // rolling hill silhouette traced from the SAME _hillY used to seat buildings
    g.fillStyle = "#050b18";
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, this._hillY(0));
    const segs = 28;
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * W;
      g.lineTo(x, this._hillY(x));
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();

    // --- church: tall body + steeple, seated on the hill --------------------
    this._drawChurch(g);

    // --- varied houses, each foot on the hill curve -------------------------
    const bodyTones = ["#04101c", "#061523", "#030c16"];
    for (const ho of this.houses) {
      const cx = ho.fx * W;
      const w = ho.bw * W, h = ho.bh * H;
      const footY = this._hillY(cx);            // base sits on the hill
      const x = cx - w / 2 + ho.lean * W;       // slight lean
      const topY = footY - h;

      // body
      g.fillStyle = bodyTones[ho.tone];
      g.beginPath();
      g.moveTo(x, footY);
      g.lineTo(x, topY);
      g.lineTo(x + w, topY);
      g.lineTo(x + w, footY);
      g.closePath();
      g.fill();

      // roof by style
      g.fillStyle = "#02080f";
      if (ho.style === "gable") {
        const rh = ho.roofH * H;
        g.beginPath();
        g.moveTo(x - w * 0.08, topY);
        g.lineTo(x + w / 2 + ho.lean * W * 0.3, topY - rh);
        g.lineTo(x + w + w * 0.08, topY);
        g.closePath();
        g.fill();
      } else if (ho.style === "hip") {
        const rh = ho.roofH * H * 0.8;
        g.beginPath();
        g.moveTo(x, topY);
        g.lineTo(x + w * 0.28, topY - rh);
        g.lineTo(x + w * 0.72, topY - rh);
        g.lineTo(x + w, topY);
        g.closePath();
        g.fill();
      } // flat: no roof shape

      // warm windows (most houses glow — a sleeping village with lamps lit)
      if (ho.lit) {
        for (let k = 0; k < ho.win; k++) {
          const wx = x + w * (0.26 + 0.42 * (ho.win === 1 ? 0.5 : k));
          const wy = topY + h * 0.34;
          const ww = w * 0.16, wh = h * 0.24;
          g.fillStyle = "hsla(46,85%,58%,0.55)";
          g.fillRect(wx, wy, ww, wh);
        }
      }
    }
  }

  // Church: a stout nave + a tall pointed steeple, both seated on the hill.
  _drawChurch(g) {
    const W = this.w, H = this.h;
    const c = this.church;
    const cx = c.fx * W;
    const w = c.bw * W, h = c.bh * H;
    const footY = this._hillY(cx);
    const x = cx - w / 2;
    const topY = footY - h;

    g.fillStyle = "#03101a";
    g.fillRect(x, topY, w, h);                       // nave body
    // low gable over the nave
    g.fillStyle = "#02080f";
    g.beginPath();
    g.moveTo(x - w * 0.06, topY);
    g.lineTo(cx, topY - H * 0.022);
    g.lineTo(x + w + w * 0.06, topY);
    g.closePath();
    g.fill();

    // steeple tower rising from the left of the nave
    const tw = w * 0.42;
    const tx = x + w * 0.1;
    const towerTop = footY - c.spire * H * 0.6;
    g.fillStyle = "#03101a";
    g.fillRect(tx, towerTop, tw, footY - towerTop);
    // pointed spire
    const spireTop = footY - c.spire * H;
    g.fillStyle = "#02080f";
    g.beginPath();
    g.moveTo(tx - tw * 0.12, towerTop);
    g.lineTo(tx + tw / 2, spireTop);
    g.lineTo(tx + tw + tw * 0.12, towerTop);
    g.closePath();
    g.fill();
    // tiny lit belfry window
    g.fillStyle = "hsla(46,80%,55%,0.5)";
    g.fillRect(tx + tw * 0.32, towerTop + (footY - towerTop) * 0.3, tw * 0.36, h * 0.18);
  }

  controls(host) {
    host.appendChild(slider("TURBULENCE", 0.2, 2.2, this.turb, 0.05, (v) => (this.turb = v)));
    host.appendChild(slider("BRUSHES", 0.4, 5.0, this.brushMul || 1, 0.1, (v) => {
      this.brushMul = v; this._retarget();          // incremental → no flash
    }, (v) => `${Math.round((v) * 100)}%`));
    host.appendChild(slider("FLOW", 0.3, 2.4, this.flow, 0.05, (v) => (this.flow = v)));
    host.appendChild(buttonRow([
      {
        label: "고요한 밤 (still)", on: () => {
          // calm the field: damp turbulence and relax vortices toward gentle
          this.turb = 0.35;
          for (let i = 0; i < this.vortices.length; i++) this.vortices[i].strength = this.baseVortices[i].fs * 0.4;
        }
      },
      {
        label: "소용돌이 (swirl)", on: () => {
          // dramatic burst: boost every composition vortex
          this.turb = Math.min(2.2, this.turb + 0.6);
          for (let i = 0; i < this.vortices.length; i++) this.vortices[i].strength = this.baseVortices[i].fs * 2.6;
        }
      },
    ]));
  }
}
