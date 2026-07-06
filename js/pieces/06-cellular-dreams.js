// ============================================================================
//  06 · Cellular Dreams — Lenia (continuous-state cellular automata)
//  A single Float32 field in [0,1] evolves under a smooth ring-shaped kernel.
//  Each step convolves the field with the ring, then applies a Gaussian
//  growth function centred on `mu` with width `sigma`. Tuned so soft
//  "orbium"-like gliders are born, drift, and persist. The pointer paints
//  fresh life. Rendered as an accent-green glow on near-black.
// ============================================================================

import { Piece, clamp, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class CellularDreams extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // Lenia growth parameters (classic orbium neighbourhood ~ mu .15 / sigma .017)
    this.mu = 0.15;       // growth centre
    this.sigma = 0.017;   // growth width
    this.dt = 0.1;        // time step per frame
    this.R = 12;          // kernel radius in cells
    this.accentRgb = hexToRgb(this.accent);
    this._alloc();
    this._buildKernel();
    this.reseed();
  }

  // ---- allocation: downscaled grid sized to aspect, capped < ~16k cells -----
  _alloc() {
    // Pick a grid that follows the canvas aspect but stays small for speed.
    const aspect = this.w / Math.max(1, this.h);
    let gw = Math.round(Math.sqrt(15000 * aspect));
    gw = clamp(gw, 60, 180);
    let gh = Math.round(gw / aspect);
    gh = clamp(gh, 50, 140);
    this.gw = gw; this.gh = gh;
    const n = gw * gh;
    this.state = new Float32Array(n);   // current field
    this.next = new Float32Array(n);    // double-buffer for the step
    this.img = this.ctx.createImageData(gw, gh);
    // offscreen low-res buffer; drawImage upscales it smoothly to the canvas
    this.buf = document.createElement("canvas");
    this.buf.width = gw; this.buf.height = gh;
    this.bctx = this.buf.getContext("2d");
  }

  // ---- precompute the smooth ring kernel ONCE -------------------------------
  // weight(d) is a bell peaked at ~0.5R; offsets stored as flat arrays for speed.
  _buildKernel() {
    const R = this.R;
    const offX = [], offY = [], w = [];
    let sum = 0;
    const kmu = 0.5, ksig = 0.15;       // ring peak & width (in units of d/R)
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / R;
        if (d > 1 || (dx === 0 && dy === 0)) continue; // inside the disc only
        // gaussian ring: peaks at d ~ 0.5, falls off toward centre & rim
        const weight = Math.exp(-((d - kmu) * (d - kmu)) / (2 * ksig * ksig));
        offX.push(dx); offY.push(dy); w.push(weight);
        sum += weight;
      }
    }
    // normalise so the convolution sums to 1 (keeps `u` in [0,1])
    for (let i = 0; i < w.length; i++) w[i] /= sum;
    this.kOffX = Int16Array.from(offX);
    this.kOffY = Int16Array.from(offY);
    this.kW = Float32Array.from(w);
    this.kN = w.length;
  }

  onResize() {
    this._alloc();
    this.reseed();
  }

  // ---- seeding --------------------------------------------------------------
  // Scatter a few soft circular patches of high state so gliders emerge fast.
  reseed() {
    this.state.fill(0);
    const patches = 5 + (Math.random() * 4 | 0);
    for (let p = 0; p < patches; p++) {
      const cx = (Math.random() * this.gw) | 0;
      const cy = (Math.random() * this.gh) | 0;
      const r = this.R * (0.7 + Math.random() * 0.6);
      this._blob(cx, cy, r, 0.6 + Math.random() * 0.4);
    }
  }
  clear() { this.state.fill(0); }

  // Add a soft (radially-faded) circular patch of life, toroidally wrapped.
  _blob(cx, cy, r, peak) {
    const { gw, gh, state } = this;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const gx = (cx + dx + gw) % gw;
        const gy = (cy + dy + gh) % gh;
        const i = gy * gw + gx;
        // soft falloff toward the rim, accumulate (clamped) so paints stack
        const v = peak * (0.5 + 0.5 * Math.cos((d / r) * Math.PI));
        state[i] = clamp(state[i] + v, 0, 1);
      }
    }
  }

  _paintAtPointer() {
    if (!this.pointer.active || !this.pointer.down) return;
    const gx = (this.pointer.x / this.w * this.gw) | 0;
    const gy = (this.pointer.y / this.h * this.gh) | 0;
    this._blob(gx, gy, this.R * 0.8, 0.5);
  }

  // ---- per-frame: paint, one Lenia step, render -----------------------------
  frame() {
    this._paintAtPointer();
    this._step();          // exactly one step per frame keeps us at ~60fps
    this._render();
  }

  // ---- one Lenia update -----------------------------------------------------
  _step() {
    const { state, next, gw, gh, kOffX, kOffY, kW, kN, mu, sigma, dt } = this;
    const inv2s2 = 1 / (2 * sigma * sigma);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        // convolve the precomputed ring kernel with the neighbourhood
        let u = 0;
        for (let k = 0; k < kN; k++) {
          const nx = (x + kOffX[k] + gw) % gw;   // toroidal wrap
          const ny = (y + kOffY[k] + gh) % gh;
          u += kW[k] * state[ny * gw + nx];
        }
        // gaussian growth in [-1,1]: peaks when neighbourhood ≈ mu
        const g = 2 * Math.exp(-((u - mu) * (u - mu)) * inv2s2) - 1;
        const i = y * gw + x;
        // integrate; clamp to keep the field bounded
        let v = state[i] + dt * g;
        next[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
    // swap buffers (no realloc)
    this.state = next; this.next = state;
  }

  // ---- render: tonemap field → green glow, upscale offscreen ---------------
  _render() {
    const { state, img, gw, gh } = this;
    const d = img.data;
    const [r, g, b] = this.accentRgb;
    for (let i = 0; i < state.length; i++) {
      const v = state[i];
      const j = i * 4;
      // dark → accent (mid) → near-white highlights at the cores
      const lo = v * v;                 // body in accent tone
      const hi = v * v * v * 130;       // hot highlight pushing toward white
      d[j]     = 6  + r * lo * 0.85 + hi;
      d[j + 1] = 8  + g * lo * 0.95 + hi;
      d[j + 2] = 10 + b * lo * 0.85 + hi;
      d[j + 3] = 255;
    }
    this.bctx.putImageData(img, 0, 0);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);   // device px, identity transform
    c.imageSmoothingEnabled = true;     // smooth bilinear upscale → soft blobs
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("GROWTH CENTER", 0.1, 0.3, this.mu, 0.005,
      (v) => (this.mu = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("GROWTH WIDTH", 0.005, 0.05, this.sigma, 0.001,
      (v) => (this.sigma = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("STEP", 0.05, 0.2, this.dt, 0.005,
      (v) => (this.dt = v), (v) => (+v).toFixed(3)));
    host.appendChild(buttonRow([
      { label: "씨앗 (Reseed)", on: () => this.reseed() },
      { label: "비우기 (Clear)", on: () => this.clear() },
    ]));
  }
}
