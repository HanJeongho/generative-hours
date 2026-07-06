// ============================================================================
//  59 · Waterfall (폭포의 잔상) — motion is also a synthesis  [Canvas2D]
//  Motion-aftereffect laboratory (Aristotle's waterfall). ADAPT: a dense
//  downward-streaming texture fills the frame — bands of granular flow, a
//  fixation dot at centre, a countdown ring. Direction-selective neurons
//  tuned to "down" fatigue. TEST: the flow freezes into a genuinely static
//  frame (we stop advancing the scroll offset — same texture, zero motion)
//  and, for ~8 seconds, the still image climbs UPWARD in your visual field.
//  The stronger your fixation during adaptation, the stronger the climb.
//  Interaction: the cycle runs itself (ADAPT n seconds → TEST 8s → again);
//  HOLD to keep adapting longer (release = instant test); click during test
//  restarts adaptation. ADAPT TIME / FLOW SPEED sliders. The texture is a
//  tiled offscreen strip scrolled by integer offsets, so the "static" phase
//  is provably identical pixels, frame after frame.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Waterfall extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.adaptTime = 18;   // ADAPT TIME
    this.speed = 1.0;      // FLOW SPEED
    this.phase = "adapt";  // adapt | test
    this.phaseT = 0;
    this.offset = 0;       // scroll offset (px) — frozen during test
    this._makeStrip();
  }
  onResize() { this._makeStrip(); }

  // tall tiled strip of granular falling-water texture (drawn once)
  _makeStrip() {
    const W = Math.max(2, this.w), SH = 512;
    const c = document.createElement("canvas");
    c.width = Math.round(W * this.dpr); c.height = SH;
    const g = c.getContext("2d");
    g.scale(this.dpr, 1);
    // deep water base
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, "#0c141d"); bg.addColorStop(0.5, "#101b26"); bg.addColorStop(1, "#0c141d");
    g.fillStyle = bg; g.fillRect(0, 0, W, SH);
    // vertical streaks in lanes (wrap-friendly: draw twice at y and y-SH)
    const lanes = Math.floor(W / 9);
    for (let i = 0; i < lanes * 14; i++) {
      const x = (i % lanes) * 9 + rand(0, 6);
      const y = rand(0, SH), len = rand(14, 60);
      const a = rand(0.05, 0.3), lw = rand(0.8, 2.2);
      const bright = Math.random() < 0.16;
      g.strokeStyle = bright ? `rgba(210,235,255,${a + 0.25})` : `rgba(120,170,210,${a})`;
      g.lineWidth = lw;
      for (const yy of [y, y - SH, y + SH]) {
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x + rand(-1.5, 1.5), yy + len); g.stroke();
      }
    }
    // sparse foam dots
    for (let i = 0; i < 260; i++) {
      const y = rand(0, SH);
      g.fillStyle = `rgba(230,245,255,${rand(0.08, 0.4)})`;
      for (const yy of [y, y - SH, y + SH])
        g.fillRect(rand(0, W), yy, rand(1, 2.4), rand(1, 2.4));
    }
    this.strip = c; this.stripH = SH;
  }

  onPointerDown() {
    if (this.phase === "test") { this.phase = "adapt"; this.phaseT = 0; }
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    this.phaseT += dt;

    const holding = this.pointer.down && this.pointer.active;

    if (this.phase === "adapt") {
      this.offset += dt * 230 * this.speed;          // the fall
      if (this.phaseT >= this.adaptTime && !holding) { this.phase = "test"; this.phaseT = 0; }
    } else if (this.phaseT >= 8) { this.phase = "adapt"; this.phaseT = 0; }

    // draw the strip, scrolled (or FROZEN — same integer offset every frame)
    const off = ((this.offset % this.stripH) + this.stripH) % this.stripH;
    const oy = Math.round(off);
    for (let y = -this.stripH + oy; y < H; y += this.stripH)
      g.drawImage(this.strip, 0, 0, this.strip.width, this.stripH, 0, y, W, this.stripH);

    // rocks at the sides give the aftereffect something to climb
    g.fillStyle = "rgba(24,28,34,0.9)";
    for (const sx of [0, 1]) {
      g.save();
      g.translate(sx ? W : 0, 0); g.scale(sx ? -1 : 1, 1);
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(W * 0.085, 0);
      g.lineTo(W * 0.055, H * 0.3); g.lineTo(W * 0.10, H * 0.55);
      g.lineTo(W * 0.05, H * 0.8); g.lineTo(W * 0.075, H); g.lineTo(0, H);
      g.closePath(); g.fill();
      g.restore();
    }

    // fixation dot + countdown / status
    const cx = W / 2, cy = H * 0.46;
    g.fillStyle = this.phase === "adapt" ? "#ffd24f" : "#ff4f6e";
    g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 2;
    if (this.phase === "adapt") {
      const p = clamp(this.phaseT / this.adaptTime, 0, 1);
      g.beginPath(); g.arc(cx, cy, 15, -Math.PI / 2, -Math.PI / 2 + p * TAU); g.stroke();
    }

    g.font = `500 ${Math.max(12, H * 0.02)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    if (this.phase === "adapt") {
      g.fillStyle = "rgba(220,235,245,0.6)";
      g.fillText(holding ? "누르는 동안 더 적응합니다 — 놓으면 바로 정지 테스트"
        : "점을 응시하세요 — 폭포가 쏟아지는 동안", W / 2, H - 66);
    } else {
      g.fillStyle = "rgba(255,190,200,0.75)";
      g.fillText("지금 화면은 완전히 정지해 있습니다 — 그런데 위로 오르지 않나요?", W / 2, H - 66);
    }

    // gentle vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("ADAPT TIME", 8, 30, this.adaptTime, 1, (v) => (this.adaptTime = v)));
    host.appendChild(slider("FLOW SPEED", 0.4, 2, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(buttonRow([
      { label: "지금 테스트", on: () => { this.phase = "test"; this.phaseT = 0; } },
      { label: "다시 적응", on: () => { this.phase = "adapt"; this.phaseT = 0; } },
    ]));
  }
}
