// ============================================================================
//  31 · Ensō (허공의 서예 / air calligraphy) — camera + MediaPipe (hand)
//
//  Zen typography of the gesture. The index fingertip becomes a sumi-e brush
//  painting luminous vermilion ink in the air — 一劃, the single uninhibited
//  stroke. SLOW motion lays thick ink, FAST motion thins to a dry whisper, so
//  the line breathes like real brushwork. Ink is laid onto a persistent scroll
//  layer that fades very slowly: fresh ink glows, old ink dissipates into the
//  void (impermanence, 道). Before the camera is ready a ghost ensō circle
//  paints and unpaints itself — a living meditation.
//
//  CONVENTION (also shown as the on-screen hint):
//    Hand OPEN  → ink flows (the brush is down, painting).
//    PINCH (thumb + index together) → the brush LIFTS; you move with no mark.
//    Releasing the pinch begins a fresh stroke on the next down.
//  Only 21 hand landmarks per hand are read; the webcam feed never leaves the
//  device. Needs the hand visible to the camera.
// ============================================================================

import { VisionPiece, HAND } from "../vision.js";
import { clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const INK = "#1a0e08";            // near-black sumi core
const PAPER = "#0a0705";          // dark ink-wash paper

export default class Enso extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 1; }

  // NO camera here — just buffers + the persistent scroll layer.
  visionSetup() {
    this.ctx = this.canvas.getContext("2d");

    this.flow = 1.0;              // INK slider: overall opacity / flow
    this.baseWidth = 1.0;         // BRUSH slider: base width multiplier
    this.fade = 1.0;              // FADE slider: how fast old ink dissipates

    // smoothed fingertip + brush dynamics
    this.tip = null;              // {x,y} lerped fingertip
    this.width = 0;               // smoothed current brush width (px)
    this.down = false;            // brush currently touching the scroll
    this.lastTime = 0;            // for speed (fingertip px/sec)

    // the CURRENT, in-progress stroke as a polyline of {x,y,w,a} points. It is
    // re-rendered WHOLE onto a wet layer each frame (so it's one continuous line,
    // never a chain of additively-stacked dabs), then baked into the scroll when
    // the stroke ends. THIS is what kills the "beads on a string" look.
    this.points = [];
    this._idleGap = false;        // idle: have we already baked at the rest gap?

    // EMBERS: the ink trail should read like a line of FIRE that just passed —
    // sparks flicking off it, embers drifting up and winking out (타닥타닥). These
    // are transient particles drawn on the visible canvas (never baked into the
    // scroll), emitted along the stroke as it's laid.
    this.embers = [];
    this.maxEmbers = 1400;

    this._makeScroll();
  }

  // The persistent "hanging scroll" PLUS a "wet" layer for the live stroke, both
  // offscreen at device resolution. Scroll holds finished/fading ink; wet holds
  // only the stroke currently being drawn (redrawn fresh every frame).
  _makeScroll() {
    const W = Math.max(1, Math.round(this.w * this.dpr));
    const H = Math.max(1, Math.round(this.h * this.dpr));
    this.scroll = document.createElement("canvas");
    this.scroll.width = W; this.scroll.height = H;
    this.sctx = this.scroll.getContext("2d");
    this.sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.wet = document.createElement("canvas");
    this.wet.width = W; this.wet.height = H;
    this.wctx = this.wet.getContext("2d");
    this.wctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._clearScroll();
  }

  _clearScroll() {
    for (const s of [this.sctx, this.wctx]) {
      s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      s.globalCompositeOperation = "source-over";
      s.clearRect(0, 0, this.w, this.h);
    }
    this.points = [];
  }

  // On resize the canvas backing store changes; rebuild the layers to match.
  onResize() { this._makeScroll(); }

  onReady() {}

  // --- per-frame fade of the scroll, then composite to the visible canvas ----
  // Called by both visionFrame and drawIdle so the meditation is continuous.
  _fadeScroll(dt) {
    const s = this.sctx;
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Very slow dissipation: clear a faint slice each frame. FADE slider scales
    // how aggressively old ink lifts away. Tiny alpha → ink lingers like a stain.
    s.globalCompositeOperation = "destination-out";
    // much gentler than before so the stroke lingers like ink soaked into a
    // hanging scroll (the FADE slider still lets you speed it up). At fade=1 the
    // ink now takes many seconds to dissipate instead of a second or two.
    const a = (0.0012 + this.fade * 0.006) * (dt * 60);
    s.fillStyle = `rgba(0,0,0,${Math.min(0.4, a)})`;
    s.fillRect(0, 0, this.w, this.h);
    s.globalCompositeOperation = "source-over";
  }

  _composite(g) {
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // dark ink-wash paper
    g.globalCompositeOperation = "source-over";
    g.fillStyle = PAPER;
    g.fillRect(0, 0, this.w, this.h);
    // the scroll's ink, glowing additively so vermilion blooms into the void
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 1;
    g.drawImage(this.scroll, 0, 0, this.w, this.h);
    // the live (not-yet-baked) wet stroke on top, same additive bloom
    if (this.down && this.points.length) g.drawImage(this.wet, 0, 0, this.w, this.h);
    g.globalCompositeOperation = "source-over";
  }

  // Render the WHOLE current stroke (this.points) as ONE continuous, variable-
  // width sumi ribbon onto the freshly-cleared wet layer. Because it's redrawn
  // from scratch each frame with source-over (not additive accumulation), there
  // is never any per-segment hot-spot buildup — the line is smooth and unbroken,
  // sharp like a real brush, with a soft bleed and a dark inky spine.
  _renderWet() {
    const s = this.wctx;
    const pts = this.points;
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, this.w, this.h);
    if (!pts.length) return;
    const accent = this.accent || "#ff6a3d";
    const alpha = pts.alpha != null ? pts.alpha : this.flow;

    // Build the variable-width ribbon as ONE filled polygon: walk the centreline
    // offsetting ±w/2 along the local normal (left edge forward, right edge back),
    // with rounded end-caps. Filling a single closed path means there is NO
    // per-segment alpha compounding — the layer is perfectly smooth, no beading,
    // no dashed spine. Each ink layer just re-fills the same ribbon scaled wider
    // or narrower (bleed → body → hot centre → dark sumi spine).
    const fillRibbon = (wScale) => {
      const n = pts.length;
      if (n === 1) {
        const p = pts[0];
        s.beginPath(); s.arc(p.x, p.y, Math.max(0.5, p.w * wScale * 0.5), 0, Math.PI * 2); s.fill();
        return;
      }
      // precompute per-point unit normals from the average of adjacent tangents
      const nx = new Array(n), ny = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
        nx[i] = -ty; ny[i] = tx;           // left normal
      }
      s.beginPath();
      // left edge, start → end
      for (let i = 0; i < n; i++) {
        const r = Math.max(0.3, pts[i].w * wScale * 0.5);
        const x = pts[i].x + nx[i] * r, y = pts[i].y + ny[i] * r;
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      // round cap at the end
      const e = pts[n - 1], re = Math.max(0.3, e.w * wScale * 0.5);
      const eAng = Math.atan2(ny[n - 1], nx[n - 1]);
      s.arc(e.x, e.y, re, eAng, eAng - Math.PI, true);
      // right edge, end → start
      for (let i = n - 1; i >= 0; i--) {
        const r = Math.max(0.3, pts[i].w * wScale * 0.5);
        s.lineTo(pts[i].x - nx[i] * r, pts[i].y - ny[i] * r);
      }
      // round cap at the start
      const st = pts[0], rs = Math.max(0.3, st.w * wScale * 0.5);
      const sAng = Math.atan2(-ny[0], -nx[0]);
      s.arc(st.x, st.y, rs, sAng, sAng - Math.PI, true);
      s.closePath(); s.fill();
    };

    // 1) soft outer bleed (the ink wicking into the paper) — wide & faint
    s.fillStyle = this._rgba(accent, 0.18 * alpha);
    fillRibbon(2.9);
    // 2) luminous vermilion body
    s.fillStyle = this._rgba(accent, Math.min(1, 0.5 * alpha));
    fillRibbon(1.7);
    // 3) bright hot centre so fresh ink glows
    s.fillStyle = this._rgba(accent, Math.min(1, 0.85 * alpha));
    fillRibbon(0.95);
    // 4) dark sumi spine for weight (kept thin so it reads as ink, not outline)
    s.fillStyle = this._rgba(INK, Math.min(1, 0.5 * alpha));
    fillRibbon(0.4);
  }

  // Bake the finished wet stroke into the persistent scroll, then clear wet and
  // the point list so the next stroke starts clean. Drawn additively so ink
  // blooms into the void like the rest of the scroll.
  _bake() {
    if (!this.points.length) return;
    this._renderWet();                 // ensure wet holds the final stroke
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "lighter";
    s.globalAlpha = 1;
    s.drawImage(this.wet, 0, 0);
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    s.globalCompositeOperation = "source-over";
    const w = this.wctx;
    w.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    w.clearRect(0, 0, this.w, this.h);
    this.points = [];
  }

  // append a point to the current stroke (with its local brush width)
  _addPoint(x, y, w, alpha) {
    this.points.push({ x, y, w });
    this.points.alpha = alpha;
  }

  _rgba(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // --- embers / sparks: the "fire just passed" trail ------------------------
  // Spit a few embers from a point on the stroke. Some are fast bright SPARKS
  // that fly off (타닥! the crackle), most are slow embers that drift upward as
  // they cool from white→gold→deep red and wink out — like a line of fire.
  _spark(x, y, vx, vy, intensity) {
    if (this.embers.length >= this.maxEmbers) return;
    const spark = Math.random() < 0.28;               // a quick bright crackle
    const ang = Math.random() * Math.PI * 2;
    const sp = spark ? (2 + Math.random() * 5) : (0.2 + Math.random() * 1.2);
    this.embers.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: vx * 0.1 + Math.cos(ang) * sp,
      vy: vy * 0.1 + Math.sin(ang) * sp - (spark ? 0.3 : 0.8), // bias upward (rising heat)
      age: 0,
      max: (spark ? 0.35 + Math.random() * 0.4 : 0.7 + Math.random() * 1.4),
      r: spark ? 0.6 + Math.random() * 0.8 : 1.0 + Math.random() * 1.8,
      flick: 6 + Math.random() * 14,                   // flicker speed
      ph: Math.random() * Math.PI * 2,
      spark, heat: intensity,
    });
  }

  // emit embers along the most recent segment of the live stroke
  _emitEmbers(intensity) {
    const pts = this.points;
    if (pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.min(10, 1 + Math.round(d * 0.5 + intensity * 3));
    const mvx = b.x - a.x, mvy = b.y - a.y;
    for (let i = 0; i < n; i++) {
      const f = Math.random();
      this._spark(a.x + mvx * f, a.y + mvy * f, mvx, mvy, intensity);
    }
  }

  // advance + draw all embers onto the VISIBLE canvas (additive, warm fire tints)
  _drawEmbers(g, dt, t) {
    if (!this.embers.length) return;
    g.globalCompositeOperation = "lighter";
    const alive = [];
    for (const e of this.embers) {
      e.age += dt;
      const life = 1 - e.age / e.max;
      if (life <= 0) continue;
      // motion: drift + slight buoyancy + air drag
      e.vy -= 1.6 * dt;                 // hot air rises
      e.vx *= 0.96; e.vy *= 0.97;
      e.x += e.vx; e.y += e.vy;
      alive.push(e);
      // flicker (타닥) + cooling color: white → gold → ember-red as it dies
      const flick = 0.6 + 0.4 * Math.sin(t * e.flick + e.ph);
      const a = life * life * flick * (e.spark ? 1.0 : 0.85);
      // cooling: hot core when young, redder as life→0
      const rC = 255;
      const gC = (120 + 135 * life) | 0;
      const bC = (40 * life * life) | 0;
      const r = e.r * (e.spark ? 1 : (0.5 + life));
      const grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 3);
      grd.addColorStop(0, `rgba(255,${Math.min(255, gC + 60)},${Math.min(255, bC + 80)},${clamp(a, 0, 1)})`);
      grd.addColorStop(0.4, `rgba(${rC},${gC},${bC},${clamp(a * 0.7, 0, 1)})`);
      grd.addColorStop(1, `rgba(${rC},${(gC * 0.4) | 0},0,0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(e.x, e.y, r * 3, 0, Math.PI * 2); g.fill();
      // bright hot pinpoint for sparks
      if (e.spark) {
        g.fillStyle = `rgba(255,250,230,${clamp(a, 0, 1)})`;
        g.beginPath(); g.arc(e.x, e.y, r * 0.6, 0, Math.PI * 2); g.fill();
      }
    }
    this.embers = alive;
    g.globalCompositeOperation = "source-over";
  }

  // --- live brush from the hand ---------------------------------------------
  visionFrame(dt, t, results) {
    this._fadeScroll(dt);

    const lm = results && results.landmarks && results.landmarks[0];
    if (lm) {
      const wrist = this.toCanvas(lm[HAND.WRIST]);
      const base = this.toCanvas(lm[9]);            // middle-finger base
      const thumb = this.toCanvas(lm[HAND.THUMB]);
      const index = this.toCanvas(lm[HAND.INDEX]);  // the brush tip

      // hand scale → resolution independence (same trick as 25-telekinesis)
      const scale = Math.hypot(base.x - wrist.x, base.y - wrist.y) + 1;
      // pinch = thumb tip ↔ index tip distance, normalised by hand scale
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale;
      const pinch = pinchDist < 0.55;               // brush LIFTS while pinched

      // smooth the fingertip so strokes are graceful, not jittery
      const target = { x: index.x, y: index.y };
      if (!this.tip) this.tip = { x: target.x, y: target.y };
      const prevX = this.tip.x, prevY = this.tip.y;
      this.tip.x += (target.x - this.tip.x) * 0.45;
      this.tip.y += (target.y - this.tip.y) * 0.45;

      // PRESSURE from speed: slow → thick, fast → thin. Normalise speed by hand
      // scale so it works at any distance from the camera, then smooth it.
      const moved = Math.hypot(this.tip.x - prevX, this.tip.y - prevY);
      const speedN = (moved / Math.max(1, dt)) / scale;          // ~scale-free
      const maxW = (14 + scale * 0.10) * this.baseWidth;
      const minW = 1.5 * this.baseWidth;
      const targetW = maxW - Math.min(1, speedN * 0.05) * (maxW - minW);
      this.width += (targetW - this.width) * 0.35;

      const inkOn = !pinch;
      const alpha = this.flow;
      const wNow = Math.max(minW, this.width);
      if (inkOn) {
        if (!this.down) this.points = [];          // begin a fresh stroke
        this._addPoint(this.tip.x, this.tip.y, wNow, alpha);
        this._emitEmbers(alpha);                   // fire crackles along the trail
        this.down = true;
      } else {
        if (this.down) this._bake();               // pinch lifts → commit stroke
        this.down = false;
      }
    } else {
      if (this.down) this._bake();                 // hand gone → commit stroke
      this.down = false;
    }

    // the in-progress stroke is re-rendered fresh each frame (continuous line)
    if (this.down) this._renderWet();

    const g = this.ctx;
    this._composite(g);
    this._drawEmbers(g, dt, t);                    // embers over everything
    if (lm) this._brushTip(g);
    this._hint(g);
  }

  // a faint reticle at the live brush tip so the visitor sees where ink lands
  _brushTip(g) {
    if (!this.tip) return;
    g.globalCompositeOperation = "lighter";
    const accent = this.accent || "#ff6a3d";
    const r = this.down ? Math.max(3, this.width) : 6;
    const rad = g.createRadialGradient(this.tip.x, this.tip.y, 0, this.tip.x, this.tip.y, r * 2);
    rad.addColorStop(0, this._rgba(accent, this.down ? 0.9 : 0.5));
    rad.addColorStop(1, this._rgba(accent, 0));
    g.fillStyle = rad;
    g.beginPath(); g.arc(this.tip.x, this.tip.y, r * 2, 0, Math.PI * 2); g.fill();
    if (!this.down) {
      // lifted: hollow ring to signal "no ink"
      g.globalCompositeOperation = "source-over";
      g.strokeStyle = this._rgba(accent, 0.7);
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(this.tip.x, this.tip.y, 9, 0, Math.PI * 2); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }

  _hint(g) {
    g.globalCompositeOperation = "source-over";
    g.save();
    g.textAlign = "center";
    g.fillStyle = "rgba(255,180,150,0.45)";
    g.font = "12px ui-monospace, monospace";
    g.fillText("손을 펴면 먹이 흐르고, 꼬집으면 붓을 든다  ·  OPEN = ink, PINCH = lift",
      this.w / 2, this.h - 22);
    g.restore();
  }

  // --- ambient meditation while the camera/model loads or fails -------------
  //  A ghost ensō paints itself slowly, then rests, then fades into the void.
  //  Uses the same continuous point-list / wet-layer model as the live brush so
  //  it draws as ONE unbroken line, not a chain of dabs.
  drawIdle(dt, t) {
    this._fadeScroll(dt);

    // sweep an auto-brush around a circle; pause at the gap (a breath).
    // Drive the phase off absolute time t (not accumulated dt) so it can never
    // stall — ~11s per full cycle.
    const cycle = (t * 0.09) % 1;
    const cx = this.w / 2, cy = this.h / 2;
    const R = Math.min(this.w, this.h) * 0.26;

    if (cycle < 0.8) {
      // mark the start of a new ring: clear any leftover points
      if (this._idleGap) { this.points = []; this._idleGap = false; }
      const a = (cycle / 0.8);                         // 0..1 along the arc
      const ang = -Math.PI * 0.5 + a * Math.PI * 1.92; // not quite closed
      const wobble = Math.sin(a * Math.PI);            // 0→1→0
      const x = cx + Math.cos(ang) * R + Math.sin(t * 0.7) * 4;
      const y = cy + Math.sin(ang) * R + Math.cos(t * 0.6) * 4;
      const r = (3 + (1 - wobble) * 9);                // thick at the ends
      this._addPoint(x, y, r, 0.9);
      this._emitEmbers(0.9);                           // the ghost ensō burns too
      this._renderWet();
      this._idleDown = true;
    } else if (this._idleDown) {
      this._bake();                                    // commit the finished ring
      this._idleDown = false;
      this._idleGap = true;
    }

    const g = this.ctx;
    this._composite(g);
    // the live idle stroke (wet) over the scroll
    if (this._idleDown && this.points.length) {
      g.globalCompositeOperation = "lighter";
      g.drawImage(this.wet, 0, 0, this.w, this.h);
      g.globalCompositeOperation = "source-over";
    }
    this._drawEmbers(g, dt, t);
  }

  controls(host) {
    host.appendChild(slider("INK", 0.2, 1.0, this.flow, 0.02, (v) => (this.flow = v)));
    host.appendChild(slider("BRUSH", 0.4, 2.5, this.baseWidth, 0.05, (v) => (this.baseWidth = v)));
    host.appendChild(slider("FADE", 0.0, 3.0, this.fade, 0.05, (v) => (this.fade = v)));
    host.appendChild(buttonRow([
      { label: "비움 (clear — empty the scroll)", on: () => this._clearScroll() },
    ]));
  }

  visionTeardown() {
    this.scroll = null; this.sctx = null;
    this.wet = null; this.wctx = null;
    this.embers = [];
  }
}
