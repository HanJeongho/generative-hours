// ============================================================================
//  15 · Phyllotaxis — golden-angle spiral packing (sunflower seed head)
//  Florets are placed by the classic Vogel model: the i-th seed sits at
//  angle = i · divergence and radius = c · √i. At the golden angle (137.5°)
//  the seeds pack tightest and Fibonacci parastichies (the visible spiral
//  arms) emerge. Sweeping the divergence a fraction of a degree makes the
//  whole arrangement reorganise — the pointer lets you feel that on the fly.
// ============================================================================

import { Piece, TAU, clamp, lerp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const GOLDEN_DEG = 137.50776405; // golden angle in degrees (≈ 360 / φ²)

export default class Phyllotaxis extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.divDeg = GOLDEN_DEG;     // divergence angle (degrees) — the star param
    this.count = 1200;            // number of florets
    this.spread = 8.0;            // c — radial spacing constant
    this.rotation = 0;            // slow global spin
    this.grown = 0;               // animated growth front (florets revealed)
    this.accentHue = this._hueOf(this.accent); // base hue from gallery accent
    this._clear();
  }

  // pull a hue out of the accent hex so the palette tracks the gallery theme
  _hueOf(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 270; // grey accent → fall back to violet
    let hue;
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60; if (hue < 0) hue += 360;
    return hue;
  }

  _clear() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#060509";
    g.fillRect(0, 0, this.w, this.h);
  }

  onResize() { this._clear(); }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // gentle motion-blur wash on near-black → soft trails as things move
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,5,9,0.22)";
    g.fillRect(0, 0, this.w, this.h);

    const cx = this.w / 2, cy = this.h / 2;
    const ptr = this.pointer;

    // ---- pointer drives the structure live -----------------------------
    // x → divergence angle (narrow sweep around 137.5° = dramatic reorg)
    // y → spacing/density (drag up = looser, down = tighter)
    if (ptr.active) {
      const fx = clamp(ptr.x / this.w, 0, 1);
      const fy = clamp(ptr.y / this.h, 0, 1);
      const targetDeg = lerp(136.0, 139.0, fx);     // fine, expressive range
      const targetSpread = lerp(3.5, 14.0, 1 - fy); // top looser, bottom denser
      this.divDeg = lerp(this.divDeg, targetDeg, 0.12);
      this.spread = lerp(this.spread, targetSpread, 0.12);
      this._syncSliders();
    }

    // slow global rotation + a breathing scale so the head feels alive
    this.rotation += dt * 0.06;
    const breathe = 1 + Math.sin(t * 0.5) * 0.04;

    // growth: florets emerge from the centre and push outward, then hold full
    this.grown = Math.min(this.count, this.grown + this.count * dt * 0.35);
    const shown = this.grown | 0;

    const divRad = this.divDeg * Math.PI / 180;
    // fit the bloom to the viewport: outermost radius = spread·√count
    const maxR = this.spread * Math.sqrt(this.count);
    const fit = Math.min(cx, cy) * 0.92 / maxR;

    g.globalCompositeOperation = "lighter"; // additive glow stacks on overlap

    for (let i = 0; i < shown; i++) {
      const ang = i * divRad + this.rotation;
      const r = this.spread * Math.sqrt(i) * fit * breathe;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;

      // size grows with radius — outer florets are biggest (real sunflowers)
      const tNorm = i / this.count;           // 0 centre … 1 rim
      const size = lerp(1.1, 5.2, Math.sqrt(tNorm));

      // colour: violet/purple wing of the accent toward the rim, hot-white
      // core. A slow hue cycle keeps the spiral shimmering.
      const hue = this.accentHue + Math.sin(tNorm * 4 + t * 0.4) * 26 + tNorm * 18;
      const light = lerp(96, 56, Math.sqrt(tNorm)); // bright core → saturated rim
      const sat = lerp(35, 88, tNorm);
      const alpha = lerp(0.95, 0.42, tNorm);

      // soft additive glow via radial gradient disc
      const grd = g.createRadialGradient(x, y, 0, x, y, size * 2.4);
      grd.addColorStop(0, `hsla(${hue},${sat}%,${light}%,${alpha})`);
      grd.addColorStop(0.5, `hsla(${hue},${sat}%,${light * 0.75}%,${alpha * 0.4})`);
      grd.addColorStop(1, `hsla(${hue},${sat}%,${light * 0.5}%,0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, size * 2.4, 0, TAU);
      g.fill();

      // crisp bright kernel on top so florets read as discs, not just glow
      g.fillStyle = `hsla(${hue},${sat}%,${Math.min(100, light + 8)}%,${alpha})`;
      g.beginPath();
      g.arc(x, y, size, 0, TAU);
      g.fill();
    }

    // luminous centre bloom to anchor the spiral
    g.globalCompositeOperation = "lighter";
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, 70);
    core.addColorStop(0, `hsla(${this.accentHue},60%,90%,0.18)`);
    core.addColorStop(1, `hsla(${this.accentHue},60%,90%,0)`);
    g.fillStyle = core;
    g.fillRect(0, 0, this.w, this.h);
  }

  // keep on-screen sliders in step when the pointer is steering live
  _syncSliders() {
    if (this._divInput) {
      this._divInput.value = this.divDeg.toFixed(3);
      this._divOut.textContent = this.divDeg.toFixed(3) + "°";
    }
    if (this._spreadInput) {
      this._spreadInput.value = this.spread.toFixed(2);
      this._spreadOut.textContent = this.spread.toFixed(1);
    }
  }

  controls(host) {
    // DIVERGENCE ANGLE — wide range allowed, but the action is near 137.5°
    const divWrap = slider("DIVERGENCE ANGLE", 90, 180, this.divDeg, 0.001,
      (v) => { this.divDeg = v; this.grown = Math.min(this.grown, 80); },
      (v) => (+v).toFixed(3) + "°");
    this._divInput = divWrap.querySelector("input");
    this._divOut = divWrap.querySelector(".ctrl__val");
    host.appendChild(divWrap);

    host.appendChild(slider("COUNT", 200, 3000, this.count, 50,
      (v) => { this.count = v | 0; this.grown = 0; this._clear(); },
      (v) => String(v | 0)));

    const spWrap = slider("SPREAD", 2, 20, this.spread, 0.1,
      (v) => (this.spread = v), (v) => (+v).toFixed(1));
    this._spreadInput = spWrap.querySelector("input");
    this._spreadOut = spWrap.querySelector(".ctrl__val");
    host.appendChild(spWrap);

    host.appendChild(buttonRow([
      { label: "황금각 (137.5°)", on: () => {
        this.divDeg = GOLDEN_DEG;
        this.grown = 0;            // regrow so the reorganisation is visible
        this._clear();
        this._syncSliders();
      } },
    ]));
  }
}
