// ============================================================================
//  05 · Morphogenesis — Gray–Scott reaction–diffusion (Turing patterns)
//  Two virtual chemicals A and B diffuse and react on a downscaled grid.
//  Painting raises B, seeding patterns that grow, split, and compete.
//  Presets shift feed/kill rates to traverse the Gray–Scott "zoo".
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const PRESETS = {
  "산호 (Coral)":   { f: 0.0545, k: 0.062 },
  "미로 (Maze)":    { f: 0.029,  k: 0.057 },
  "세포 (Mitosis)": { f: 0.0367, k: 0.0649 },
  "지문 (Spirals)": { f: 0.018,  k: 0.051 },
};

export default class Morphogenesis extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // simulation grid (downscaled for performance)
    this.scaleDown = 3;
    this._alloc();
    this.dA = 1.0; this.dB = 0.5;
    const p = PRESETS["산호 (Coral)"];
    this.f = p.f; this.k = p.k;
    this.brush = 7;
    this.seedNoise();
    this.accentRgb = hexToRgb(this.accent);
  }

  _alloc() {
    this.gw = Math.max(80, Math.floor(this.w / this.scaleDown));
    this.gh = Math.max(60, Math.floor(this.h / this.scaleDown));
    const n = this.gw * this.gh;
    this.A = new Float32Array(n).fill(1);
    this.B = new Float32Array(n).fill(0);
    this.A2 = new Float32Array(n);
    this.B2 = new Float32Array(n);
    this.img = this.ctx.createImageData(this.gw, this.gh);
    // offscreen for nearest-neighbour upscale
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
  }

  onResize() { this._alloc(); this.seedNoise(); }

  seedNoise() {
    // scatter a few random seeds to start life
    for (let s = 0; s < 14; s++) {
      const cx = (Math.random() * this.gw) | 0, cy = (Math.random() * this.gh) | 0;
      this._blot(cx, cy, 5);
    }
  }
  clear() { this.A.fill(1); this.B.fill(0); }

  // Add B in a soft gaussian blot (a "seed"), capped at 1. Crucially we DON'T
  // zero out A — saturating a wide area with B while starving A makes Gray–Scott
  // collapse (the reaction dies and the whole field goes black). A gentle add
  // seeds new growth instead of wiping the pattern.
  _blot(cx, cy, r, strength = 0.85) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d2 = x * x + y * y;
      if (d2 > r2) continue;
      const gx = cx + x, gy = cy + y;
      if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) continue;
      const fall = Math.exp(-d2 / (r2 * 0.5));     // gaussian: strong centre, soft edge
      const i = gy * this.gw + gx;
      this.B[i] = Math.min(1, this.B[i] + strength * fall);
    }
  }

  _paintAtPointer() {
    if (!this.pointer.active || !this.pointer.down) return;
    const gx = (this.pointer.x / this.w * this.gw) | 0;
    const gy = (this.pointer.y / this.h * this.gh) | 0;
    // paint a small soft seed under the cursor (not a hard saturated disc)
    this._blot(gx, gy, Math.min(this.brush, 6), 0.6);
  }

  frame() {
    this._paintAtPointer();
    // multiple sim steps per frame for faster evolution
    const steps = 6;
    for (let s = 0; s < steps; s++) this._step();
    this._render();
  }

  _step() {
    const { A, B, A2, B2, gw, gh, dA, dB, f, k } = this;
    for (let y = 0; y < gh; y++) {
      const ym = (y - 1 + gh) % gh, yp = (y + 1) % gh;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const xm = (x - 1 + gw) % gw, xp = (x + 1) % gw;
        // 9-point Laplacian
        const lapA =
          A[ym * gw + xm] * 0.05 + A[ym * gw + x] * 0.2 + A[ym * gw + xp] * 0.05 +
          A[y * gw + xm] * 0.2 + A[i] * -1 + A[y * gw + xp] * 0.2 +
          A[yp * gw + xm] * 0.05 + A[yp * gw + x] * 0.2 + A[yp * gw + xp] * 0.05;
        const lapB =
          B[ym * gw + xm] * 0.05 + B[ym * gw + x] * 0.2 + B[ym * gw + xp] * 0.05 +
          B[y * gw + xm] * 0.2 + B[i] * -1 + B[y * gw + xp] * 0.2 +
          B[yp * gw + xm] * 0.05 + B[yp * gw + x] * 0.2 + B[yp * gw + xp] * 0.05;
        const a = A[i], b = B[i];
        const abb = a * b * b;
        // Clamp to [0,1] every step. With 6 sub-steps/frame, a freshly painted
        // blob can push the explicit-Euler integration past its stability limit
        // and blow up to Infinity/NaN — which then spreads and turns the whole
        // field permanently black. Clamping keeps the reaction bounded and lets
        // painted seeds grow instead of detonating.
        A2[i] = a + (dA * lapA - abb + f * (1 - a));
        B2[i] = b + (dB * lapB + abb - (k + f) * b);
        A2[i] = A2[i] < 0 ? 0 : A2[i] > 1 ? 1 : A2[i];
        B2[i] = B2[i] < 0 ? 0 : B2[i] > 1 ? 1 : B2[i];
      }
    }
    this.A = A2; this.B = B2; this.A2 = A; this.B2 = B;
  }

  _render() {
    const { B, img, gw, gh } = this;
    const d = img.data;
    const [r, g, bl] = this.accentRgb;
    for (let i = 0; i < B.length; i++) {
      let v = clamp(B[i] * 1.6, 0, 1);
      // tonemap: dark wall → accent → near-white highlights
      const j = i * 4;
      const lo = v * v;
      d[j]     = 8  + r * lo * 0.9 + v * v * v * 90;
      d[j + 1] = 8  + g * lo * 0.95 + v * v * v * 90;
      d[j + 2] = 12 + bl * lo + v * v * v * 90;
      d[j + 3] = 255;
    }
    this.bctx.putImageData(img, 0, 0);
    const g2 = this.ctx;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.imageSmoothingEnabled = true;
    g2.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g2.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  controls(host) {
    // preset buttons
    const presetBtns = Object.entries(PRESETS).map(([label, p]) => ({
      label, on: (el) => {
        this.f = p.f; this.k = p.k;
        host.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
        el.classList.add("is-active");
      },
    }));
    const row = buttonRow(presetBtns);
    row.querySelector(".ctrl__label")?.remove();
    // label the preset group
    const lbl = document.createElement("span");
    lbl.className = "ctrl__label"; lbl.style.marginBottom = "-6px";
    lbl.innerHTML = "PATTERN PRESET";
    host.appendChild(lbl);
    host.appendChild(row);
    row.querySelector(".ctrl__btn")?.classList.add("is-active");

    host.appendChild(slider("FEED RATE", 0.01, 0.08, this.f, 0.0005, (v) => (this.f = v),
      (v) => (+v).toFixed(4)));
    host.appendChild(slider("KILL RATE", 0.045, 0.07, this.k, 0.0005, (v) => (this.k = v),
      (v) => (+v).toFixed(4)));
    host.appendChild(slider("BRUSH", 3, 16, this.brush, 1, (v) => (this.brush = v), (v) => String(v | 0)));
    host.appendChild(buttonRow([
      { label: "씨앗 뿌리기", on: () => this.seedNoise() },
      { label: "비우기 (Clear)", on: () => this.clear() },
    ]));
  }
}
