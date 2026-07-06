// ============================================================================
//  54 · The Observer (관측) — looking collapses the wave  [VisionPiece · face]
//  A field of ~420 "existences", each a probability cloud: a fuzzy multi-ghost
//  smear orbiting its home, nowhere in particular. Wherever your GAZE lands
//  (MediaPipe iris → coarse gaze point, heavily smoothed; cursor when the
//  camera is unavailable) the clouds COLLAPSE: ghosts converge to one crisp,
//  bright body with a thin orbit ring — a definite fact. Look away and the
//  fact decoheres, softening back into probability. A BLINK (both eyes shut,
//  or click) un-collapses the whole field at once — the world returns to
//  maybe. Berkeley's esse est percipi staged with the measurement problem.
//  Gaze estimation without calibration is coarse by nature, so the collapse
//  radius is generous and the mapping is smoothed & clamped; the cursor path
//  behaves identically, so the piece is complete without a camera.
// ============================================================================

import { clamp, lerp, rand, TAU, hexToRgb, makeNoise } from "../engine.js";
import { VisionPiece, FACE } from "../vision.js";
import { slider } from "./01-currents.js";

const N = 420;

export default class Observer extends VisionPiece {
  get tracker() { return "face"; }

  visionSetup() {
    this.noise = makeNoise();
    this.acc = hexToRgb(this.accent || "#bd7dff");

    this.gazeR = 1.0;      // GAZE R — collapse radius multiplier
    this.decay = 1.0;      // DECAY  — how fast facts dissolve

    // the field
    this.ents = [];
    for (let i = 0; i < N; i++) {
      this.ents.push({
        hx: rand(0.04, 0.96), hy: rand(0.06, 0.94),   // home (normalised)
        ph: rand(0, TAU), sp: rand(0.3, 1.1),          // cloud drift phase/speed
        rad: rand(10, 30),                             // cloud radius (px)
        c: 0,                                          // collapse 0=cloud … 1=fact
        seed: rand(0, 100),
      });
    }

    // gaze state (normalised screen coords), heavily smoothed
    this.gx = 0.5; this.gy = 0.5;
    this.hasGaze = false;
    this.blinkEnv = 0;
    this._blinkArmed = true;
    this._resetWave = 0;   // radial un-collapse wave (blink / click)
    this._makeSprites();
  }

  // pre-rendered additive sprites: a soft probability blob + a crystalline fact
  _makeSprites() {
    const blob = document.createElement("canvas");
    blob.width = blob.height = 48;
    let g = blob.getContext("2d");
    let rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    rg.addColorStop(0, "rgba(190,160,255,0.55)");
    rg.addColorStop(0.4, "rgba(140,110,220,0.22)");
    rg.addColorStop(1, "rgba(120,90,200,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 48, 48);
    this.sprBlob = blob;

    const fact = document.createElement("canvas");
    fact.width = fact.height = 64;
    g = fact.getContext("2d");
    rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    rg.addColorStop(0, "rgba(255,255,255,0.95)");
    rg.addColorStop(0.18, "rgba(230,210,255,0.6)");
    rg.addColorStop(0.5, "rgba(189,125,255,0.16)");
    rg.addColorStop(1, "rgba(189,125,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(32, 8); g.lineTo(32, 56); g.stroke();      // diffraction
    g.beginPath(); g.moveTo(8, 32); g.lineTo(56, 32); g.stroke();
    this.sprFact = fact;
  }

  onPointerDown() { this._blink(); }
  _blink() {
    this.blinkEnv = 1;
    this._resetWave = 0.0001;
    for (const e of this.ents) e.c *= 0.15;   // the world lets go
  }

  // ---- gaze from iris: offset of iris centres inside the eye corners --------
  _gazeFromFace(res) {
    const lms = res && res.faceLandmarks && res.faceLandmarks[0];
    if (!lms) { this.hasGaze = false; return; }
    const L = lms[FACE.LEFT_IRIS], R = lms[FACE.RIGHT_IRIS];
    const lc = lms[FACE.LEFT_EYE], rc = lms[FACE.RIGHT_EYE];
    if (!L || !R || !lc || !rc) { this.hasGaze = false; return; }
    // head position drives the coarse gaze; iris offset inside the eyes steers it
    const headX = (L.x + R.x) / 2, headY = (L.y + R.y) / 2;
    const eyeSpan = Math.max(0.02, Math.hypot(rc.x - lc.x, rc.y - lc.y));
    const irisOffX = ((L.x + R.x) / 2 - (lc.x + rc.x) / 2) / eyeSpan;
    const irisOffY = ((L.y + R.y) / 2 - (lc.y + rc.y) / 2) / eyeSpan;
    // mirror X (selfie), amplify iris steer, clamp into frame
    const tx = clamp((1 - headX) + (-irisOffX) * 2.4, 0.02, 0.98);
    const ty = clamp(headY + irisOffY * 3.0 - 0.06, 0.02, 0.98);
    const k = 0.06;                                  // heavy smoothing
    this.gx = lerp(this.gx, tx, k);
    this.gy = lerp(this.gy, ty, k);
    this.hasGaze = true;

    // blink: iris landmarks squeeze toward the eye line when lids close —
    // use eye aspect (upper 159 / lower 145 for left eye) when available
    const up = lms[159], lo = lms[145];
    if (up && lo) {
      const openness = Math.abs(lo.y - up.y) / eyeSpan;
      if (openness < 0.045 && this._blinkArmed) { this._blinkArmed = false; this._blink(); }
      if (openness > 0.09) this._blinkArmed = true;
    }
  }

  visionFrame(dt, t, res) {
    this._gazeFromFace(res);
    this._scene(dt, t, this.gx * this.w, this.gy * this.h, this.hasGaze, true);
  }
  drawIdle(dt, t) {
    // no camera (denied / loading): the cursor IS the gaze — fully playable
    this._scene(dt, t, this.pointer.x, this.pointer.y, this.pointer.active, false);
  }

  // ---- the field ------------------------------------------------------------
  _scene(dt, t, gx, gy, hasGaze, viaEye) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const [ar, ag, ab] = this.acc;

    this.blinkEnv = Math.max(0, this.blinkEnv - dt * 2.2);
    if (this._resetWave > 0) {
      this._resetWave += dt * Math.max(W, H) * 1.6;
      if (this._resetWave > Math.hypot(W, H)) this._resetWave = 0;
    }

    // backdrop: deep violet vacuum + two slow nebulae
    g.fillStyle = "#08070d";
    g.fillRect(0, 0, W, H);
    for (const [px2, py2, hue, sp] of [[0.25, 0.3, "60,40,120", 0.05], [0.75, 0.7, "40,60,120", 0.04]]) {
      const nx = (px2 + Math.sin(t * sp) * 0.05) * W, ny = (py2 + Math.cos(t * sp * 1.3) * 0.05) * H;
      const nb = g.createRadialGradient(nx, ny, 0, nx, ny, Math.max(W, H) * 0.42);
      nb.addColorStop(0, `rgba(${hue},0.10)`); nb.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = nb; g.fillRect(0, 0, W, H);
    }
    const bg = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.5);
    bg.addColorStop(0, "rgba(110,80,170,0.10)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";

    const R = Math.min(W, H) * 0.20 * this.gazeR;

    for (const e of this.ents) {
      const ex = e.hx * W, ey = e.hy * H;
      // collapse dynamics: observed → 1 fast; unobserved → 0 slowly
      const d = Math.hypot(ex - gx, ey - gy);
      const observed = hasGaze && d < R;
      if (observed) e.c = Math.min(1, e.c + dt * (3.2 - 2.0 * (d / R)));
      else e.c = Math.max(0, e.c - dt * 0.35 * this.decay);

      const c = e.c;
      const cloud = 1 - c;

      if (cloud > 0.02) {
        // probability cloud: 3 soft sprite echoes on noise orbits (additive)
        for (let k = 0; k < 3; k++) {
          const a = t * e.sp + e.ph + k * (TAU / 3);
          const nx = (this.noise(e.seed + k * 7, t * 0.3) - 0.5) * 2;
          const ny = (this.noise(e.seed + 40 + k * 7, t * 0.3) - 0.5) * 2;
          const ox = ex + Math.cos(a) * e.rad * cloud + nx * e.rad * 0.7 * cloud;
          const oy = ey + Math.sin(a) * e.rad * cloud * 0.8 + ny * e.rad * 0.7 * cloud;
          const sz = (10 + e.rad * 0.8) * cloud;
          g.globalAlpha = cloud * (0.35 + 0.15 * Math.sin(t * 2 + e.seed + k));
          g.drawImage(this.sprBlob, ox - sz / 2, oy - sz / 2, sz, sz);
        }
        g.globalAlpha = 1;
      }

      if (c > 0.03) {
        // the fact: crystalline star sprite + thin orbit ring
        const sz = 14 + c * 12;
        g.globalAlpha = c;
        g.drawImage(this.sprFact, ex - sz / 2, ey - sz / 2, sz, sz);
        g.globalAlpha = 1;
        g.strokeStyle = `rgba(${ar},${ag},${ab},${0.22 * c})`;
        g.lineWidth = 1;
        g.beginPath(); g.arc(ex, ey, e.rad * 0.9, 0, TAU); g.stroke();
      }

      // un-collapse wave flash
      if (this._resetWave > 0) {
        const dw = Math.abs(Math.hypot(ex - W / 2, ey - H / 2) - this._resetWave);
        if (dw < 40) {
          g.fillStyle = `rgba(255,255,255,${0.25 * (1 - dw / 40)})`;
          g.beginPath(); g.arc(ex, ey, 2.5, 0, TAU); g.fill();
        }
      }
    }

    // constellations: observed facts link into figures — knowledge has edges
    const facts = this.ents.filter((e) => e.c > 0.55);
    g.lineWidth = 1;
    for (let i = 0; i < facts.length; i++) {
      const a = facts[i];
      for (let j = i + 1; j < facts.length; j++) {
        const b = facts[j];
        const dx = (a.hx - b.hx) * W, dy = (a.hy - b.hy) * H;
        const d2 = dx * dx + dy * dy;
        if (d2 < 120 * 120) {
          g.strokeStyle = `rgba(${ar},${ag},${ab},${0.20 * a.c * b.c * (1 - Math.sqrt(d2) / 120)})`;
          g.beginPath();
          g.moveTo(a.hx * W, a.hy * H); g.lineTo(b.hx * W, b.hy * H);
          g.stroke();
        }
      }
    }
    g.globalCompositeOperation = "source-over";

    // the gaze itself: a soft iris-ring where you are looking
    if (hasGaze) {
      g.strokeStyle = `rgba(${ar},${ag},${ab},0.35)`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(gx, gy, R, 0, TAU); g.stroke();
      const gg = g.createRadialGradient(gx, gy, 0, gx, gy, R);
      gg.addColorStop(0, `rgba(${ar},${ag},${ab},0.06)`); gg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gg;
      g.beginPath(); g.arc(gx, gy, R, 0, TAU); g.fill();
    }

    // blink white-mist
    if (this.blinkEnv > 0.02) {
      g.fillStyle = `rgba(230,220,255,${0.16 * this.blinkEnv})`;
      g.fillRect(0, 0, W, H);
    }

    // caption: which sense is steering
    g.font = "11px ui-monospace, Menlo, monospace";
    g.textAlign = "right"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(170,160,200,0.45)";
    g.fillText(viaEye ? "EYE-TRACKING · 깜빡이면 세계가 풀립니다" : "CURSOR = 시선 · 클릭이 깜빡임", W - 14, H - 12);

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("GAZE R", 0.5, 1.8, this.gazeR, 0.05, (v) => (this.gazeR = v)));
    host.appendChild(slider("DECAY", 0.3, 3, this.decay, 0.05, (v) => (this.decay = v)));
  }
}
