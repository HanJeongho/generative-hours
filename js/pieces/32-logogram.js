// ============================================================================
//  32 · Logogram — 점토의 글자 / the word as clay (camera + MediaPipe hands)
//  ONE large glyph floats at center. Two hands knead it like wet clay:
//    • horizontal distance between hands → scaleX (wide ↔ condensed)
//    • vertical span between hands       → scaleY (tall ↔ squat)
//    • angle of the line between hands   → shear / oblique slant
//    • hand openness (fingers spread)    → stroke WEIGHT (hairline ↔ black)
//  A PINCH on either hand cycles to the next glyph in a mixed-script set —
//  the signifier is arbitrary, the form is endlessly remoldable (Saussure).
//  One hand: drag + single-axis scale. No hands: the glyph breathes and
//  slowly cycles on its own so the piece lives before the camera is ready.
//  Only 21 landmarks per hand are read; the webcam feed never leaves device.
// ============================================================================

import { VisionPiece, HAND } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, hexToRgb, TAU } from "../engine.js";

// mixed-script glyph set: Latin, Hangul, Han, Greek, Kana — the same gesture
// reshapes wildly different signs, underlining the arbitrariness of form.
const GLYPHS = ["A", "母", "語", "Ω", "あ", "글", "R", "愛"];

export default class Logogram extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 2; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");

    // control-bound knobs
    this.response = 0.16;   // lerp factor — how snappily deform follows hands
    this.baseWeight = 1.0;  // base stroke heaviness multiplier
    this.glow = 1.0;        // glow intensity multiplier

    this.glyphIdx = 0;

    // deformation axes — current (smoothed) + target. Identity = neutral clay.
    this.def = this._neutral();
    this.target = this._neutral();

    // per-hand pinch debounce (one pinch = one advance), keyed by hand slot
    this._pinchLatch = [false, false];

    // grip dots drawn each frame (canvas px)
    this.grips = [];

    this.accentRgb = hexToRgb(this.accent || "#ff6a3d");
    this._dark();
  }

  // neutral (un-deformed) clay state
  _neutral() {
    return { sx: 1, sy: 1, shear: 0, weight: 0.5, tx: 0, ty: 0 };
  }

  _dark() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#06040a";
    g.fillRect(0, 0, this.w, this.h);
  }

  onReady() { /* tracking begins; nothing extra to init */ }

  onResize() { this._dark(); }

  // --- read up to two hands into simple descriptors --------------------------
  _readHands(results) {
    const hands = [];
    if (!results || !results.landmarks) return hands;
    for (const lm of results.landmarks) {
      const wrist = this.toCanvas(lm[HAND.WRIST]);
      const thumb = this.toCanvas(lm[HAND.THUMB]);
      const index = this.toCanvas(lm[HAND.INDEX]);
      const middle = this.toCanvas(lm[HAND.MIDDLE]);
      const ring = this.toCanvas(lm[HAND.RING]);
      const pinky = this.toCanvas(lm[HAND.PINKY]);
      const base = this.toCanvas(lm[9]);            // middle-finger base

      const scale = Math.hypot(base.x - wrist.x, base.y - wrist.y) + 1;

      // pinch: thumb↔index distance normalised by hand scale
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale;
      const pinch = pinchDist < 0.55;

      // openness: mean fingertip distance from wrist / scale (fist ↔ open palm)
      const spread = ([thumb, index, middle, ring, pinky]
        .reduce((s, p) => s + Math.hypot(p.x - wrist.x, p.y - wrist.y), 0) / 5) / scale;

      // the grip point: palm centre (wrist↔middle-base midpoint), stable to hold
      const grip = { x: (wrist.x + base.x) / 2, y: (wrist.y + base.y) / 2 };

      hands.push({ grip, scale, spread, pinch });
    }
    return hands;
  }

  // map hand geometry → deformation targets, then handle pinch cycling
  _updateTargets(hands) {
    const cx = this.w / 2, cy = this.h / 2;
    const minDim = Math.min(this.w, this.h);

    if (hands.length >= 2) {
      const a = hands[0].grip, b = hands[1].grip;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      // horizontal & vertical spans drive the two scale axes independently
      const hSpan = Math.abs(dx) / minDim;   // 0..~1
      const vSpan = Math.abs(dy) / minDim;
      this.target.sx = clamp(0.35 + hSpan * 2.4, 0.35, 3.0);
      this.target.sy = clamp(0.35 + vSpan * 2.4, 0.35, 3.0);

      // angle of the line between hands → oblique shear
      const ang = Math.atan2(dy, dx);
      this.target.shear = clamp(Math.sin(ang) * 0.9, -0.85, 0.85);

      // mean openness → stroke weight (fingers spread = heavier black type)
      const open = (hands[0].spread + hands[1].spread) / 2;     // ~1.4..2.6
      this.target.weight = clamp((open - 1.4) / 1.3, 0, 1);

      // both hands together gently translate the glyph from centre
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.target.tx = clamp((mx - cx) * 0.5, -this.w * 0.25, this.w * 0.25);
      this.target.ty = clamp((my - cy) * 0.5, -this.h * 0.25, this.h * 0.25);

      this.grips = [a, b];
    } else if (hands.length === 1) {
      // one hand: drag the glyph + radial distance from centre → uniform scale
      const a = hands[0].grip;
      this.target.tx = clamp((a.x - cx) * 0.6, -this.w * 0.3, this.w * 0.3);
      this.target.ty = clamp((a.y - cy) * 0.6, -this.h * 0.3, this.h * 0.3);
      const d = Math.hypot(a.x - cx, a.y - cy) / (minDim * 0.5);
      const s = clamp(0.5 + d * 1.6, 0.5, 2.4);
      this.target.sx = s;
      this.target.sy = s;
      this.target.shear = lerp(this.target.shear, 0, 0.1);
      this.target.weight = clamp((hands[0].spread - 1.4) / 1.3, 0, 1);
      this.grips = [a];
    } else {
      // no hands: ease everything back toward neutral (breathing handled in draw)
      const n = this._neutral();
      this.target.sx = n.sx; this.target.sy = n.sy;
      this.target.shear = n.shear; this.target.weight = n.weight;
      this.target.tx = n.tx; this.target.ty = n.ty;
      this.grips = [];
    }

    // pinch debounce per hand slot → advance glyph once per pinch
    for (let i = 0; i < 2; i++) {
      const pinching = hands[i] ? hands[i].pinch : false;
      if (pinching && !this._pinchLatch[i]) this._nextGlyph();
      this._pinchLatch[i] = pinching;
    }
  }

  _nextGlyph() { this.glyphIdx = (this.glyphIdx + 1) % GLYPHS.length; }

  _resetDeform() {
    this.target = this._neutral();
    this.def = this._neutral();
  }

  // smooth current state toward target — fluid clay, not jitter
  _smooth() {
    const k = clamp(this.response, 0.03, 0.6);
    const d = this.def, tg = this.target;
    d.sx += (tg.sx - d.sx) * k;
    d.sy += (tg.sy - d.sy) * k;
    d.shear += (tg.shear - d.shear) * k;
    d.weight += (tg.weight - d.weight) * k;
    d.tx += (tg.tx - d.tx) * k;
    d.ty += (tg.ty - d.ty) * k;
  }

  visionFrame(dt, t, results) {
    const hands = this._readHands(results);
    this._updateTargets(hands);
    this._smooth();
    this._draw(t, /*breathe*/ hands.length === 0);
  }

  // ambient state while camera/model load or fail: breathe + self-cycle
  drawIdle(dt, t) {
    if (!this.def) return;
    // ease toward neutral so it sits centred
    this.target = this._neutral();
    this._smooth();
    // auto-advance the glyph every few seconds so the sign keeps shifting
    const phase = Math.floor(t / 3.2);
    if (phase !== this._idlePhase) { this._idlePhase = phase; this._nextGlyph(); }
    this.grips = [];
    this._draw(t, true);
  }

  // --- the render: morphing vermilion glyph on near-black --------------------
  _draw(t, breathe) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // soft trail-fade so deformation leaves a faint molten wake
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,4,10,0.32)";
    g.fillRect(0, 0, this.w, this.h);

    const cx = this.w / 2, cy = this.h / 2;
    const minDim = Math.min(this.w, this.h);
    const d = this.def;

    // gentle breathing wobble when idle / no hands, so the clay is never inert
    const br = breathe ? 1 + Math.sin(t * 1.3) * 0.06 : 1;
    const breatheShear = breathe ? Math.sin(t * 0.7) * 0.05 : 0;

    const baseSize = minDim * 0.52;
    const [r, gg, bb] = this.accentRgb;
    const acc = (a) => `rgba(${r},${gg},${bb},${a})`;

    // effective weight: gesture weight × base-weight knob
    const weight = clamp(d.weight * this.baseWeight, 0, 1.4);

    g.save();
    // place + deform: translate to centre+grip, shear (oblique), scale axes
    g.translate(cx + d.tx, cy + d.ty);
    g.transform(1, 0, d.shear + breatheShear, 1, 0, 0);   // horizontal shear
    g.scale(d.sx * br, d.sy * br);

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${baseSize}px "Helvetica Neue", "Hiragino Sans", "Noto Sans CJK KR", "Apple SD Gothic Neo", system-ui, sans-serif`;

    const glyph = GLYPHS[this.glyphIdx];

    // 1) additive glow halo — drawn first so the body sits on top
    const glowR = baseSize * (0.5 + weight * 0.4);
    g.globalCompositeOperation = "lighter";
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, glowR);
    const ga = clamp(this.glow * 0.22, 0, 0.6);
    halo.addColorStop(0, acc(ga));
    halo.addColorStop(1, acc(0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, glowR, 0, TAU);
    g.fill();

    // 2) clay body — vertical gradient fill, lighter at top like lit clay
    g.globalCompositeOperation = "source-over";
    const grad = g.createLinearGradient(0, -baseSize * 0.55, 0, baseSize * 0.55);
    grad.addColorStop(0, `rgba(${Math.min(255, r + 60)},${gg + 40},${bb + 20},1)`);
    grad.addColorStop(0.5, acc(1));
    grad.addColorStop(1, `rgba(${Math.max(0, r - 70)},${Math.max(0, gg - 30)},${Math.max(0, bb - 10)},1)`);
    g.fillStyle = grad;

    // glow blur on the body proportional to the GLOW knob
    g.shadowColor = acc(clamp(this.glow * 0.8, 0, 1));
    g.shadowBlur = this.glow * (14 + weight * 26);

    // 3) heavier weight → re-stamp the glyph with tiny offsets to fatten strokes
    //    (fakes a variable-font weight axis without any font files)
    const reps = 1 + Math.round(weight * 5);
    const off = weight * 2.4;
    for (let i = 0; i < reps; i++) {
      const ang = (i / reps) * TAU;
      g.fillText(glyph, Math.cos(ang) * off, Math.sin(ang) * off);
    }
    g.fillText(glyph, 0, 0);

    // 4) faint contour stroke for tactile "clay edge" shading
    g.shadowBlur = 0;
    g.lineWidth = 1 + weight * 3;
    g.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, gg + 60)},${bb + 30},0.35)`;
    g.strokeText(glyph, 0, 0);

    g.restore();

    // 5) grip dots so the visitor sees exactly where the clay is being held
    g.globalCompositeOperation = "lighter";
    for (const gp of this.grips) {
      const rad = g.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, 22);
      rad.addColorStop(0, acc(0.55));
      rad.addColorStop(1, acc(0));
      g.fillStyle = rad;
      g.beginPath();
      g.arc(gp.x, gp.y, 22, 0, TAU);
      g.fill();
      g.fillStyle = acc(0.9);
      g.beginPath();
      g.arc(gp.x, gp.y, 3, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("RESPONSE", 0.03, 0.5, this.response, 0.01, (v) => (this.response = v)));
    host.appendChild(slider("WEIGHT", 0.2, 1.6, this.baseWeight, 0.05, (v) => (this.baseWeight = v)));
    host.appendChild(slider("GLOW", 0.0, 2.0, this.glow, 0.05, (v) => (this.glow = v)));
    host.appendChild(buttonRow([
      { label: "글자 바꾸기 (next glyph)", on: () => this._nextGlyph() },
      { label: "초기화 (reset deformation)", on: () => this._resetDeform() },
    ]));
  }

  visionTeardown() { /* nothing camera-specific to release here */ }
}
