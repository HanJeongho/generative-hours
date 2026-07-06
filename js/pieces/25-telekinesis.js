// ============================================================================
//  25 · Telekinesis — move particles with your bare hands (camera + MediaPipe)
//  Open palm pushes a cloud of light away; PINCH (thumb+index) to grab the
//  swarm and fling it; a closed FIST becomes a tiny black hole that sucks
//  everything in. Two hands work at once. The webcam feed never leaves the
//  device — only 21 hand landmarks per hand are used.
// ============================================================================

import { VisionPiece, HAND } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Telekinesis extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 2; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");
    this.force = 1.0;          // overall interaction strength
    this.push = 1.0;           // open-palm repulsion scale
    this.count = this._target();
    this.particles = [];
    this._spawn();
    this.hands = [];           // processed per-hand state for this frame
    this._dark("#04060a");
  }

  _target() {
    // fewer than before because each mote is now a soft 2-arc sprite (costlier
    // than a 1px rect); 4500 keeps a dense cloud at 60fps.
    return Math.round(Math.min(4800, Math.max(1800, (this.w * this.h) / 320)));
  }
  _spawn() {
    this.particles.length = 0;
    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        vx: 0, vy: 0, hue: Math.random(),
      });
    }
  }
  _dark(c) {
    const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = c; g.fillRect(0, 0, this.w, this.h);
  }
  onResize() { this.count = this._target(); this._spawn(); this._dark("#04060a"); }

  // --- read each detected hand into a simple interaction descriptor ----------
  _readHands(results) {
    this.hands.length = 0;
    if (!results || !results.landmarks) return;
    for (const lm of results.landmarks) {
      const wrist = this.toCanvas(lm[HAND.WRIST]);
      const thumb = this.toCanvas(lm[HAND.THUMB]);
      const index = this.toCanvas(lm[HAND.INDEX]);
      const middle = this.toCanvas(lm[HAND.MIDDLE]);
      const ring = this.toCanvas(lm[HAND.RING]);
      const pinky = this.toCanvas(lm[HAND.PINKY]);

      // hand scale = wrist→middle-base distance, for resolution independence
      const base = this.toCanvas(lm[9]);
      const scale = Math.hypot(base.x - wrist.x, base.y - wrist.y) + 1;

      // pinch: thumb tip ↔ index tip distance, normalised by hand scale
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale;
      const pinch = pinchDist < 0.6;
      const pinchPt = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };

      // openness: mean fingertip distance from wrist / scale → fist vs open palm
      const spread = ([thumb, index, middle, ring, pinky]
        .reduce((s, p) => s + Math.hypot(p.x - wrist.x, p.y - wrist.y), 0) / 5) / scale;
      const fist = spread < 1.7;            // tips pulled in toward palm
      const palm = { x: (wrist.x + middle.x) / 2, y: (wrist.y + middle.y) / 2 };

      this.hands.push({ wrist, index, palm, pinch, pinchPt, fist, scale, spread, prev: null });
    }
  }

  visionFrame(dt, t, results) {
    this._readHands(results);
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // trail fade — stronger than before so fast-moving particles read as a spray
    // of discrete points rather than long smeared LINES (the user's complaint).
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(4,6,10,0.42)";
    g.fillRect(0, 0, this.w, this.h);

    this._simulate(dt);
    this._render(g, t);
    this._drawHands(g);
  }

  _simulate(dt) {
    const F = this.force;
    for (const p of this.particles) {
      let acting = false;
      for (const h of this.hands) {
        const R = 240 * (h.scale / 90);          // reach scales with hand size
        if (h.fist) {
          // FIST → black-hole attraction with a swirl
          const dx = h.palm.x - p.x, dy = h.palm.y - p.y;
          const d = Math.hypot(dx, dy) + 1;
          if (d < R * 1.6) {
            acting = true;
            const f = (1 - d / (R * 1.6)) * 9 * F;
            p.vx += (dx / d) * f; p.vy += (dy / d) * f;
            p.vx += (-dy / d) * f * 0.5; p.vy += (dx / d) * f * 0.5;  // swirl
          }
        } else if (h.pinch) {
          // PINCH → grab toward a loose cloud (each particle keeps a small fixed
          // offset from the pinch point, so the swarm balls up like a fistful of
          // sand instead of collapsing to a single line-forming point).
          const ox = (p.hue - 0.5) * R * 0.5;
          const oy = ((p.x * 0.013 % 1) - 0.5) * R * 0.5;
          const dx = (h.pinchPt.x + ox) - p.x, dy = (h.pinchPt.y + oy) - p.y;
          const d = Math.hypot(dx, dy) + 1;
          if (d < R) {
            acting = true;
            const f = (1 - d / R) * 6 * F;
            p.vx += (dx / d) * f; p.vy += (dy / d) * f;
          }
        } else {
          // OPEN PALM → push particles away
          const dx = p.x - h.palm.x, dy = p.y - h.palm.y;
          const d = Math.hypot(dx, dy) + 1;
          if (d < R) {
            acting = true;
            const f = (1 - d / R) * 7 * F * this.push;
            p.vx += (dx / d) * f; p.vy += (dy / d) * f;
          }
        }
      }
      // granular scatter: while a hand acts on it, add a little random kick so the
      // motion sprays apart instead of every particle tracing the same clean arc.
      if (acting) {
        const speed = Math.hypot(p.vx, p.vy);
        const jit = Math.min(2.2, 0.4 + speed * 0.18);
        p.vx += (Math.random() - 0.5) * jit;
        p.vy += (Math.random() - 0.5) * jit;
      }
      // integrate + gentle return to rest so the cloud re-gathers
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.9; p.vy *= 0.9;
      // soft drift back toward a calm wandering so it never fully dies
      if (this.hands.length === 0) {
        p.vx += (Math.sin((p.y + this.t * 30) * 0.01)) * 0.04;
        p.vy += (Math.cos((p.x + this.t * 30) * 0.01)) * 0.04;
      }
      // wrap at edges
      if (p.x < 0) p.x += this.w; else if (p.x > this.w) p.x -= this.w;
      if (p.y < 0) p.y += this.h; else if (p.y > this.h) p.y -= this.h;
    }
  }

  _render(g, t) {
    g.globalCompositeOperation = "lighter";
    const baseHue = (t * 12) % 360;
    for (const p of this.particles) {
      const sp = Math.min(1, Math.hypot(p.vx, p.vy) * 0.12);
      const hue = (baseHue + 150 + p.hue * 60 + sp * 60) % 360;  // teal→aqua range
      // round, soft motes (a faint halo + a brighter core) so the swarm reads as
      // sprinkled dust, not pixels — fast ones flare a touch bigger & whiter.
      const r = 1.1 + sp * 2.0;
      g.fillStyle = `hsla(${hue}, 88%, ${50 + sp * 32}%, ${0.22 + sp * 0.18})`;
      g.beginPath(); g.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = `hsla(${hue}, 90%, ${66 + sp * 28}%, 0.9)`;
      g.beginPath(); g.arc(p.x, p.y, r * 0.75, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  // hand glyph: a soft accent glow at the palm + state label
  _drawHands(g) {
    g.globalCompositeOperation = "lighter";
    for (const h of this.hands) {
      const c = h.fist ? "#7cffe0" : h.pinch ? "#aef7ff" : "#5fe6d0";
      const r = h.fist ? 26 : h.pinch ? 14 : 40;
      const rad = g.createRadialGradient(
        (h.fist || !h.pinch) ? h.palm.x : h.pinchPt.x,
        (h.fist || !h.pinch) ? h.palm.y : h.pinchPt.y, 0,
        (h.fist || !h.pinch) ? h.palm.x : h.pinchPt.x,
        (h.fist || !h.pinch) ? h.palm.y : h.pinchPt.y, r);
      rad.addColorStop(0, c + "aa"); rad.addColorStop(1, c + "00");
      g.fillStyle = rad;
      const px = (h.fist || !h.pinch) ? h.palm.x : h.pinchPt.x;
      const py = (h.fist || !h.pinch) ? h.palm.y : h.pinchPt.y;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  // ambient cloud while the camera/model is still loading
  drawIdle(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "rgba(4,6,10,0.2)";
    g.fillRect(0, 0, this.w, this.h);
    if (!this.particles) return;
    g.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      p.vx += Math.sin((p.y + t * 30) * 0.01) * 0.05;
      p.vy += Math.cos((p.x + t * 30) * 0.01) * 0.05;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94;
      if (p.x < 0) p.x += this.w; else if (p.x > this.w) p.x -= this.w;
      if (p.y < 0) p.y += this.h; else if (p.y > this.h) p.y -= this.h;
      g.fillStyle = `hsla(${(165 + p.hue * 50)}, 82%, 58%, 0.5)`;
      g.beginPath(); g.arc(p.x, p.y, 1.5, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("FORCE", 0.3, 2.2, this.force, 0.05, (v) => (this.force = v)));
    host.appendChild(slider("PUSH", 0.3, 2.5, this.push, 0.05, (v) => (this.push = v)));
    host.appendChild(buttonRow([
      { label: "흩기 (Reset)", on: () => this._spawn() },
    ]));
  }
}
