// ============================================================================
//  12 · Prism — moiré interference + chromatic dispersion
//  Two regular gratings are superposed; where they overlap a third, large-
//  scale MOIRÉ pattern emerges. The moiré field is sampled at three slightly
//  detuned frequencies for R/G/B, so the interference fringes split into a
//  full spectral rainbow (chromatic dispersion). One grating slowly rotates
//  and drifts in phase, so the whole field flows; the pointer steers the
//  second grating's centre/angle to sweep the interference live.
//  Computed on a downscaled grid → ImageData → offscreen → upscaled.
// ============================================================================

import { Piece, TAU, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Prism extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // tunables
    this.freq = 0.085;       // grating density (radians of phase per grid cell)
    this.dispersion = 0.14;  // R/G/B frequency separation (rainbow strength)
    this.angle = 0.6;        // baseline angle between the two gratings (rad)
    this.radial = true;      // second grating type: radial vs. linear
    this.seed = Math.random() * TAU;  // phase offset, reset by "재생성"
    this.scaleDown = 3;      // grid downscale for performance
    this._alloc();
  }

  _alloc() {
    // downscaled simulation/render grid — fringes stay crisp after upscale
    this.gw = Math.max(120, Math.floor(this.w / this.scaleDown));
    this.gh = Math.max(80, Math.floor(this.h / this.scaleDown));
    this.img = this.ctx.createImageData(this.gw, this.gh);
    // mark every pixel opaque once; we only rewrite RGB each frame
    const d = this.img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    // offscreen buffer for smooth bilinear upscale to device pixels
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
  }

  onResize() { this._alloc(); }

  // grating #1 is linear and rotates slowly; #2 is steered by the pointer.
  frame(dt, t) {
    const { gw, gh, img } = this;
    const d = img.data;

    // --- grating #1: linear, slowly rotating & drifting in phase -----------
    const a1 = this.angle * 0.5 + t * 0.05;        // continuous rotation
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const f1 = this.freq;
    const ph1 = this.seed + t * 0.9;               // phase drift → flow

    // --- grating #2: centred on the pointer (or screen centre if idle) -----
    const p = this.pointer;
    const cx = (p.active ? p.x / this.w : 0.5) * gw;
    const cy = (p.active ? p.y / this.h : 0.5) * gh;
    // dragging rotates the second grating's reference angle
    const drag = p.down ? Math.atan2(p.vy, p.vx) : 0;
    const a2 = this.angle * -0.5 - t * 0.035 + drag * 0.6;
    const c2 = Math.cos(a2), s2 = Math.sin(a2);
    const f2 = this.freq * 1.03;                   // slight detune → richer beat
    const ph2 = this.seed * 1.7 - t * 0.7;
    const radial = this.radial;

    // per-channel dispersion: each channel reads the moiré at a detuned freq.
    // spread is in grid units so it scales sensibly with the grid.
    const disp = this.dispersion;
    const dR = 1 - disp, dG = 1, dB = 1 + disp;    // R short-shifted, B long

    let k = 0;  // index into ImageData (steps of 4)
    for (let y = 0; y < gh; y++) {
      // pre-compute the y contribution of grating #1 (linear ⇒ separable-ish)
      const y1 = y * s1;
      const dy2 = y - cy;
      for (let x = 0; x < gw; x++, k += 4) {
        // grating #1 coordinate (projection onto its direction)
        const u1 = x * c1 + y1;

        // grating #2 coordinate: radial distance from pointer, or a linear
        // projection rotated by a2 — the pointer steers the interference.
        let u2;
        if (radial) {
          const dx2 = x - cx;
          u2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        } else {
          u2 = x * c2 + y * s2;
        }

        // Sample the combined moiré once per colour channel at a detuned
        // frequency. The product of two gratings yields sum/difference beats;
        // detuning per channel splits those beats into spectral colour.
        const r = this._moire(u1, u2, f1 * dR, f2 * dR, ph1, ph2);
        const g = this._moire(u1, u2, f1 * dG, f2 * dG, ph1, ph2);
        const b = this._moire(u1, u2, f1 * dB, f2 * dB, ph1, ph2);

        // moiré value m ∈ [-1,1]; lift to [0,1] then gamma for punchy fringes.
        // near-black floor keeps the gallery's dark mood while still glowing.
        d[k]     = 14 + 230 * this._tone(r);
        d[k + 1] = 14 + 230 * this._tone(g);
        d[k + 2] = 16 + 230 * this._tone(b);
        // alpha already 255
      }
    }

    // blit grid → offscreen, then smooth-upscale to the full device canvas
    this.bctx.putImageData(img, 0, 0);
    const g2 = this.ctx;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.imageSmoothingEnabled = true;
    g2.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g2.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  // one moiré sample: product of two sinusoidal gratings → beat pattern.
  _moire(u1, u2, fa, fb, pa, pb) {
    const g1 = Math.sin(u1 * fa + pa);
    const g2 = Math.sin(u2 * fb + pb);
    return g1 * g2;  // ∈ [-1, 1]
  }

  // tone curve: centre the [-1,1] moiré on a luminous mid, soft-clip, gamma.
  _tone(m) {
    const v = clamp(0.5 + 0.5 * m, 0, 1);
    return v * v * (3 - 2 * v);  // smoothstep → softer fringe edges
  }

  controls(host) {
    host.appendChild(slider("FREQUENCY", 0.02, 0.2, this.freq, 0.002,
      (v) => (this.freq = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("DISPERSION", 0, 0.4, this.dispersion, 0.005,
      (v) => (this.dispersion = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("ANGLE", 0, TAU, this.angle, 0.01,
      (v) => (this.angle = v), (v) => (+v).toFixed(2)));

    // grating type toggle — keep the active one highlighted
    const typeRow = buttonRow([
      { label: "방사형 (Radial)", on: (el) => this._setType(true, el) },
      { label: "직선 (Linear)",  on: (el) => this._setType(false, el) },
    ]);
    const btns = typeRow.querySelectorAll(".ctrl__btn");
    btns[this.radial ? 0 : 1].classList.add("is-active");
    this._typeBtns = btns;
    host.appendChild(typeRow);

    host.appendChild(buttonRow([
      { label: "재생성 (Regenerate)", on: () => { this.seed = Math.random() * TAU; } },
    ]));
  }

  _setType(radial, el) {
    this.radial = radial;
    if (this._typeBtns) this._typeBtns.forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
