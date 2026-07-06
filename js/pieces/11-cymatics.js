// ============================================================================
//  11 · Cymatics — Chladni standing-wave plate
//  A vibrating square plate's nodal pattern. The Chladni superposition
//    f(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
//  is zero along NODAL LINES, where real sand collects. We render |f| on a
//  downscaled grid (bright accent where |f|≈0, dark elsewhere) and scatter
//  "sand" particles that drift DOWN the gradient of |f| toward those lines.
//  Modes (n,m) interpolate smoothly so the figure morphs; the pointer drives
//  the frequency live. Accent reads as a warm amber/gold plate.
// ============================================================================

import { Piece, TAU, clamp, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Cymatics extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // target modes vs. smoothly-interpolated live modes (n,m animate toward target)
    this.tn = 4; this.tm = 3;          // target integer modes (sliders set these)
    this.n = this.tn; this.m = this.tm; // continuous current modes
    this.sharp = 14;                    // nodal-line falloff: higher = thinner, crisper lines
    this.count = this._targetCount();   // sand particle budget (area-scaled)
    this.accentRgb = hexToRgb(this.accent);
    this._alloc();
    this._seedSand();
  }

  _targetCount() {
    return Math.round(clamp(this.w * this.h / 26, 4000, 26000));
  }

  // downscaled field grid + ImageData + offscreen canvas for the upscale
  _alloc() {
    this.scaleDown = 4;
    this.gw = Math.max(80, Math.floor(this.w / this.scaleDown));
    this.gh = Math.max(60, Math.floor(this.h / this.scaleDown));
    this.img = this.ctx.createImageData(this.gw, this.gh);
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
  }

  onResize() {
    this._alloc();
    this.count = this._targetCount();
    this._seedSand();
  }

  // sand stored in normalized [0,1] coords so it survives resize unaffected
  _seedSand() {
    this.sand = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      this.sand[i * 2]     = Math.random();
      this.sand[i * 2 + 1] = Math.random();
    }
  }

  // Chladni amplitude at normalized (x,y) for continuous modes (n,m)
  _f(x, y, n, m) {
    const a = Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y);
    const b = Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
    return a - b;
  }

  frame(dt, t) {
    // ---- live frequency: pointer drives modes when active --------------------
    if (this.pointer.active) {
      this.tn = clamp(1 + (this.pointer.x / this.w) * 11, 1, 12);
      this.tm = clamp(1 + (this.pointer.y / this.h) * 11, 1, 12);
    }
    // ease continuous modes toward target so the figure morphs, not snaps
    const ease = 1 - Math.pow(0.0015, dt);
    this.n += (this.tn - this.n) * ease;
    this.m += (this.tm - this.m) * ease;

    // slow time-varying drive amplitude → plate "breathes" (0.45..1.0)
    const amp = 0.72 + 0.28 * Math.sin(t * 0.6);
    const n = this.n, m = this.m, k = this.sharp;

    // ---- render the |f| field to the downscaled grid -------------------------
    const { img, gw, gh } = this;
    const d = img.data;
    const [ar, ag, ab] = this.accentRgb;
    for (let gy = 0; gy < gh; gy++) {
      const y = gy / (gh - 1);
      for (let gx = 0; gx < gw; gx++) {
        const x = gx / (gw - 1);
        const f = Math.abs(this._f(x, y, n, m)) * amp;
        // sharp falloff: bright only near nodal lines (|f|→0)
        let v = Math.exp(-k * f);
        v = v * v;                                  // tighten the glow
        const j = (gy * gw + gx) * 4;
        // tonemap: near-black plate → warm amber accent → hot gold cores
        const core = v * v * v;
        d[j]     = 6  + ar * v * 0.95 + core * 120; // R (amber leads)
        d[j + 1] = 5  + ag * v * 0.70 + core * 90;  // G
        d[j + 2] = 9  + ab * v * 0.45 + core * 45;  // B (kept low → warm)
        d[j + 3] = 255;
      }
    }
    this.bctx.putImageData(img, 0, 0);

    // upscale the field to fill the device-pixel canvas (identity transform)
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);

    // ---- sand: drift each grain DOWN the gradient of |f| toward nodes --------
    this._stepSand(dt, n, m, amp);
    this._drawSand(g);
  }

  // gradient descent of |f|: nudge each grain opposite ∇|f| so it settles on
  // a nodal line, plus tiny jitter so grains keep finding the trough (anneal).
  _stepSand(dt, n, m, amp) {
    const s = this.sand;
    const eps = 0.004;          // finite-difference step for the gradient
    const step = 0.020;         // grain travel per frame along −∇|f|
    const jitter = 0.0016;      // thermal noise so grains don't freeze early
    for (let i = 0; i < this.count; i++) {
      const ix = i * 2, iy = ix + 1;
      let x = s[ix], y = s[iy];
      const f0 = Math.abs(this._f(x, y, n, m));
      const fx = Math.abs(this._f(x + eps, y, n, m));
      const fy = Math.abs(this._f(x, y + eps, n, m));
      // numerical gradient of |f|
      let gx = (fx - f0) / eps, gy = (fy - f0) / eps;
      const gl = Math.hypot(gx, gy) + 1e-5;
      // move opposite the gradient; scale so far-from-node grains move faster
      const mv = step * Math.min(1, f0 * 3 + 0.05);
      x -= (gx / gl) * mv + (Math.random() - 0.5) * jitter;
      y -= (gy / gl) * mv + (Math.random() - 0.5) * jitter;
      // reflect at plate edges (clamped, walls of the square plate)
      if (x < 0) x = -x; else if (x > 1) x = 2 - x;
      if (y < 0) y = -y; else if (y > 1) y = 2 - y;
      // occasionally respawn a settled grain elsewhere → keeps lines alive
      // as modes morph and old nodal lines move away.
      if (Math.random() < 0.004) { x = Math.random(); y = Math.random(); }
      s[ix] = x; s[iy] = y;
    }
  }

  // draw sand additively as pale-gold motes over the glowing plate
  _drawSand(g) {
    const W = this.canvas.width, H = this.canvas.height;
    const r = Math.max(0.6, this.dpr * 0.6);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,232,180,0.5)";
    const s = this.sand;
    for (let i = 0; i < this.count; i++) {
      g.fillRect(s[i * 2] * W, s[i * 2 + 1] * H, r, r);
    }
    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("MODE N", 1, 12, Math.round(this.tn), 1,
      (v) => { this.tn = v | 0; }, (v) => String(v | 0)));
    host.appendChild(slider("MODE M", 1, 12, Math.round(this.tm), 1,
      (v) => { this.tm = v | 0; }, (v) => String(v | 0)));
    host.appendChild(slider("SHARPNESS", 5, 30, this.sharp, 0.5,
      (v) => { this.sharp = v; }, (v) => (+v).toFixed(1)));
    host.appendChild(slider("SAND COUNT", 2000, 26000, this.count, 500,
      (v) => { this.count = v | 0; this._seedSand(); }, (v) => String(v | 0)));
    host.appendChild(buttonRow([
      { label: "무작위 주파수 (random mode)", on: () => {
        this.tn = 1 + (Math.random() * 11 | 0);
        this.tm = 1 + (Math.random() * 11 | 0);
      } },
    ]));
  }
}
