// ============================================================================
//  16 · Harmonograph — damped pendulum composition curves
//  A pen is driven by the sum of decaying sinusoids in x and y. Near-integer
//  frequency ratios trace classic looping rosettes; the exp() damping spirals
//  the curve inward until it settles. The path draws itself progressively onto
//  a persistent glowing layer, then fades and reseeds — endless rosettes.
//    x(s) = A1 sin(f1 s + p1) e^-d1 s + A2 sin(f2 s + p2) e^-d2 s
//    y(s) = A3 sin(f3 s + p3) e^-d3 s + A4 sin(f4 s + p4) e^-d4 s
// ============================================================================

import { Piece, TAU, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const BG = "#06050a";              // near-black, faint violet cast

export default class Harmonograph extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this._clear();

    // persistent offscreen layer the curve is etched onto (device px)
    this.layer = document.createElement("canvas");
    this._sizeLayer(this.layer);
    this.lctx = this.layer.getContext("2d");
    this._wipeLayer();

    // tunables (exposed via controls)
    this.detune = 0.0;             // FREQ RATIO — nudges f2/f4 off integers
    this.damping = 0.55;           // DAMPING — base decay rate
    this.speed = 1.0;              // SPEED — how fast s advances

    this.s = 0;                    // curve parameter (advances over time)
    this.prev = null;              // last drawn point {x,y}
    this.fade = 0;                 // post-completion fade-out [0..1]
    this.hueBase = 268;            // violet anchor for the accent wing
    this._newCurve();              // seed first rosette so it's alive on load
  }

  // ---- layer sizing / clearing ---------------------------------------------
  _sizeLayer(c) { c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr); }
  _wipeLayer() { const g = this.lctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.layer.width, this.layer.height); }
  _clear() { const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.fillStyle = BG; g.fillRect(0, 0, this.w, this.h); }

  onResize() {
    // re-fit the offscreen layer; the running curve recenters/rescales itself
    this._sizeLayer(this.layer);
    this._wipeLayer();
    this.prev = null;              // avoid a stray segment across the jump
  }

  // ---- (re)seed a rosette near the current parameters -----------------------
  _newCurve(fresh = false) {
    const R = (a, b) => a + Math.random() * (b - a);
    // four near-integer frequencies forming pleasant ratios (2:3, 3:4 family)
    const base = fresh || !this.f
      ? [2, 3, 3, 4].map((n) => n + R(-0.04, 0.04))
      : this.f.map((v) => v + R(-0.25, 0.25));     // wander from current
    this.f = base.map((v) => clamp(v, 1, 6));
    this.A = [R(0.7, 1), R(0.7, 1), R(0.7, 1), R(0.7, 1)];  // amplitudes
    this.p = [R(0, TAU), R(0, TAU), R(0, TAU), R(0, TAU)];  // phases
    this.d = [R(0.6, 1), R(0.6, 1), R(0.6, 1), R(0.6, 1)];  // per-term decay
    this.s = 0; this.prev = null; this.fade = 0;
    this.hueBase = 248 + R(0, 42);                 // stay in the violet wing
  }

  onPointerDown() { this._newCurve(true); }        // click = fresh rosette

  // ---- evaluate pen position at parameter s ---------------------------------
  // current effective frequencies of the four terms (f2 & f4 are sculpted live
  // by the pointer + detune). Cached each eval so the HUD can read them.
  _freqs() {
    const { f } = this;
    let f2 = f[1] + this.detune, f4 = f[3] + this.detune;
    if (this.pointer.active) {
      f2 += (this.pointer.x / this.w - 0.5) * 1.6;
      f4 += (this.pointer.y / this.h - 0.5) * 1.6;
    }
    return [f[0], f2, f[2], f4];
  }

  _eval(s) {
    const { A, p, d } = this;
    const dk = this.damping;
    const F = this._freqs();
    this._F = F;                       // expose for the HUD
    const x = A[0] * Math.sin(F[0] * s + p[0]) * Math.exp(-d[0] * dk * s)
            + A[1] * Math.sin(F[1] * s + p[1]) * Math.exp(-d[1] * dk * s);
    const y = A[2] * Math.sin(F[2] * s + p[2]) * Math.exp(-d[2] * dk * s)
            + A[3] * Math.sin(F[3] * s + p[3]) * Math.exp(-d[3] * dk * s);
    this._pen = { x, y };              // expose for the HUD
    return { x, y };
  }

  frame(dt, t) {
    const lw = this.layer.width, lh = this.layer.height;
    const cx = lw / 2, cy = lh / 2;
    const scale = Math.min(lw, lh) * 0.40;   // map curve [-2,2]→fit, centered

    // overall envelope: how far the curve has damped (0 fresh → ~1 settled)
    const env = Math.exp(-this.damping * 0.5 * this.s);
    const done = env < 0.05;                 // curve has effectively settled

    const g = this.lctx;
    g.setTransform(1, 0, 0, 1, 0, 0);

    if (!done && this.fade === 0) {
      // advance the parameter and stamp the new arc onto the layer
      const step = this.speed * dt * 2.6;    // how much s grows this frame
      const seg = Math.max(2, Math.ceil(step / 0.012));  // sub-steps = smooth
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      for (let i = 0; i < seg; i++) {
        this.s += step / seg;
        const pt = this._eval(this.s);
        const px = cx + pt.x * scale, py = cy + pt.y * scale;
        if (this.prev) {
          // hue drifts subtly along the curve, around the violet anchor
          const hue = this.hueBase + Math.sin(this.s * 0.6) * 22;
          const e = Math.exp(-this.damping * 0.5 * this.s);  // local energy
          g.strokeStyle = `hsla(${hue}, 85%, ${56 + e * 14}%, 0.32)`;
          g.lineWidth = (1.1 + e * 1.4) * this.dpr;
          g.shadowColor = `hsla(${hue}, 90%, 62%, 0.9)`;
          g.shadowBlur = (5 + e * 9) * this.dpr;
          g.beginPath();
          g.moveTo(this.prev.x, this.prev.y);
          g.lineTo(px, py);
          g.stroke();
        }
        this.prev = { x: px, y: py };
      }
    } else {
      // settled → fade the whole layer out, then reseed a new rosette
      this.fade += dt * 0.6;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = `rgba(6,5,10,${0.04 + this.fade * 0.05})`;
      g.fillRect(0, 0, lw, lh);
      if (this.fade >= 1) { this._wipeLayer(); this._newCurve(); }
    }
    g.shadowBlur = 0;

    // ---- composite layer to the visible stage --------------------------------
    const v = this.ctx;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.globalCompositeOperation = "source-over";
    v.fillStyle = BG;
    v.fillRect(0, 0, this.canvas.width, this.canvas.height);
    v.globalCompositeOperation = "lighter";
    v.drawImage(this.layer, 0, 0);

    // bright leading tip following the live pen position
    if (!done && this.fade === 0 && this.prev) {
      const tipHue = this.hueBase + Math.sin(this.s * 0.6) * 22;
      const tr = 9 * this.dpr;
      const rad = v.createRadialGradient(this.prev.x, this.prev.y, 0, this.prev.x, this.prev.y, tr);
      rad.addColorStop(0, `hsla(${tipHue + 10}, 100%, 86%, 0.95)`);
      rad.addColorStop(0.4, `hsla(${tipHue}, 95%, 66%, 0.55)`);
      rad.addColorStop(1, `hsla(${tipHue}, 90%, 60%, 0)`);
      v.fillStyle = rad;
      v.beginPath(); v.arc(this.prev.x, this.prev.y, tr, 0, TAU); v.fill();
    }
    v.globalCompositeOperation = "source-over";

    this._drawHUD(env);
  }

  // ---- live readout: the equation + the current pendulum parameters ---------
  // Drawn in CSS-pixel space over the finished frame. Shows exactly which
  // formula is running and the numbers feeding it right now, so the curve on
  // screen is legible as "this equation, with these values".
  _drawHUD(env) {
    const v = this.ctx;
    v.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    v.globalCompositeOperation = "source-over";
    v.textBaseline = "alphabetic";
    // RIGHT-aligned, top-right corner — the control placard lives top-left, so
    // anchoring the readout to the right edge keeps the two from overlapping.
    v.textAlign = "right";

    const x0 = this.w - 26;
    let y = 120;                                 // clear of the top-right "exit" chip
    const accent = "#c9a6ff";
    const dim = "rgba(190,180,220,0.55)";
    const mono = (size) => `${size}px "SFMono-Regular", ui-monospace, "Menlo", monospace`;

    v.fillStyle = accent;
    v.font = `600 13px ui-monospace, monospace`;
    v.fillText("HARMONOGRAPH · 감쇠 진자 합성", x0, y);
    y += 24;
    v.fillStyle = dim;
    v.font = mono(12.5);
    v.fillText("x(s) = Σ Aᵢ·sin(fᵢ·s + φᵢ)·e^(−dᵢ·k·s)", x0, y);  y += 18;
    v.fillText("y(s) = Σ Aⱼ·sin(fⱼ·s + φⱼ)·e^(−dⱼ·k·s)", x0, y);  y += 26;

    // per-term table: i | f | A | φ | d
    const F = this._F || this._freqs();
    const fmt = (n, w = 6) => n.toFixed(2).padStart(w);
    v.fillStyle = "rgba(150,140,180,0.5)";
    v.font = mono(11.5);
    v.fillText("term     f      A      φ      d", x0, y); y += 16;
    const sculpted = this.pointer.active;        // f2,f4 are being driven live?
    for (let i = 0; i < 4; i++) {
      const live = sculpted && (i === 1 || i === 3);
      v.fillStyle = live ? accent : "rgba(190,180,220,0.78)";
      const axis = i < 2 ? "x" : "y";
      const row = `${live ? "▶ " : ""}${axis}${(i % 2) + 1}  ${fmt(F[i])} ${fmt(this.A[i])} ${fmt(this.p[i])} ${fmt(this.d[i])}`;
      v.fillText(row, x0, y);
      y += 15;
    }
    y += 12;

    v.fillStyle = dim;
    v.font = mono(12);
    v.fillText(`s = ${this.s.toFixed(2)}    k = ${this.damping.toFixed(2)}    energy = ${(env * 100).toFixed(0)}%`, x0, y);
    y += 18;
    if (this._pen) {
      v.fillStyle = accent;
      v.fillText(`pen = ( ${this._pen.x.toFixed(3)} , ${this._pen.y.toFixed(3)} )`, x0, y);
    }
    v.textAlign = "left";                         // reset for other draws
  }

  controls(host) {
    host.appendChild(slider("FREQ RATIO", -0.6, 0.6, this.detune, 0.01,
      (val) => (this.detune = val)));
    host.appendChild(slider("DAMPING", 0.2, 1.4, this.damping, 0.01,
      (val) => (this.damping = val)));
    host.appendChild(slider("SPEED", 0.3, 2.5, this.speed, 0.05,
      (val) => (this.speed = val)));
    host.appendChild(buttonRow([
      { label: "새 곡선 (new curve)", on: () => this._newCurve(true) },
    ]));
  }
}
