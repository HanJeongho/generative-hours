// ============================================================================
//  25 · Living Mirror — 살아있는 거울  (Wing VII · Mirror & Presence)
//  Camera ONLY — no MediaPipe model. Pure motion energy: each frame we sample
//  the webcam at low res (mirrored), difference it against the previous frame
//  per cell to get a motion *magnitude* and a cheap optical-flow *direction*
//  (spatial gradient), then inject force + dye into a downscaled velocity/dye
//  field. The dye is advected (semi-Lagrangian) through the velocity field and
//  dissipates gently, so waving your hand sweeps glowing aqua-mint ink across a
//  near-black canvas, swirling and calming when you go still.
//
//  Performance follows the Morphogenesis pattern: simulate on a small grid,
//  write an ImageData, then nearest/smooth-upscale a tiny offscreen canvas to
//  the full device-pixel canvas. No body model, no external library.
// ============================================================================

import { VisionPiece } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";
import { hexToRgb, clamp } from "../engine.js";

export default class LivingMirror extends VisionPiece {
  // camera only — no MediaPipe model
  get tracker() { return "none"; }
  // base class fetches the camera + builds this.video; returning null means it
  // never loads a model → this.task stays null → frame() skips detection and,
  // once status==="ready", calls visionFrame() every frame.
  async _makeTask() { return null; }

  // --- allocate grids; NO camera here (base class opens it after setup) ------
  visionSetup() {
    this.ctx = this.canvas.getContext("2d");

    // tunables (exposed via controls)
    this.flow = 1.0;          // how strongly motion pushes velocity + dye
    this.dissipation = 0.985; // dye retention per frame (higher = lingers longer)
    this.intensity = 1.0;     // glow brightness multiplier
    this.showGhost = false;   // faint camera ghost underlay

    this.accentRgb = hexToRgb(this.accent); // aqua-mint #5fe6d0

    // low-res camera sample grid (motion detection)
    this.cw = 160; this.ch = 120;
    this.sample = document.createElement("canvas");
    this.sample.width = this.cw; this.sample.height = this.ch;
    // willReadFrequently: we getImageData every frame
    this.sctx = this.sample.getContext("2d", { willReadFrequently: true });
    this.prevLum = null;      // Float32 luminance of previous sample
    this.curLum = null;

    this._allocField();
  }

  // fluid/dye field on its own downscaled grid (independent of camera grid)
  _allocField() {
    this.scaleDown = 4;
    this.gw = Math.max(96, Math.floor(this.w / this.scaleDown));
    this.gh = Math.max(64, Math.floor(this.h / this.scaleDown));
    const n = this.gw * this.gh;
    // velocity field
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vx2 = new Float32Array(n);
    this.vy2 = new Float32Array(n);
    // dye (glowing ink) — single channel; tinted to accent on render
    this.dye = new Float32Array(n);
    this.dye2 = new Float32Array(n);

    this.img = this.ctx.createImageData(this.gw, this.gh);
    // offscreen for smooth upscale to the full canvas
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");

    // seed a faint drifting plume so it's alive before the camera grants
    this._seedIdle();
  }

  onResize() { this._allocField(); }
  onReady() {}

  _seedIdle() {
    const { gw, gh } = this;
    for (let s = 0; s < 5; s++) {
      const cx = (0.2 + 0.6 * Math.random()) * gw;
      const cy = (0.2 + 0.6 * Math.random()) * gh;
      const r = 6 + Math.random() * 8;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d2 = x * x + y * y; if (d2 > r * r) continue;
        const gx = (cx + x) | 0, gy = (cy + y) | 0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        this.dye[gy * gw + gx] += (1 - Math.sqrt(d2) / r) * 0.5;
      }
    }
  }

  clear() {
    this.vx.fill(0); this.vy.fill(0); this.dye.fill(0);
    if (this.prevLum) this.prevLum.fill(0);
  }

  // ---- motion detection: mirror-sample the video, diff luminance per cell ---
  // Returns true if a fresh frame was processed (so we only inject on new data).
  _readMotion() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return false;

    const s = this.sctx, cw = this.cw, ch = this.ch;
    s.save();
    s.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mirror) { s.translate(cw, 0); s.scale(-1, 1); } // selfie flip
    // cover-fit the video into the sample canvas (preserve aspect, center-crop)
    const va = v.videoWidth / v.videoHeight, ca = cw / ch;
    let dw = cw, dh = ch, dx = 0, dy = 0;
    if (va > ca) { dw = ch * va; dx = (cw - dw) / 2; }
    else { dh = cw / va; dy = (ch - dh) / 2; }
    s.drawImage(v, dx, dy, dw, dh);
    s.restore();

    const data = s.getImageData(0, 0, cw, ch).data;
    const n = cw * ch;
    if (!this.curLum) { this.curLum = new Float32Array(n); this.prevLum = new Float32Array(n); }
    const lum = this.curLum;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      // Rec.601 luma, normalised 0..1
      lum[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
    }
    return true;
  }

  // map camera cell (cw×ch) → field cell, injecting force + dye where motion is
  _injectFromMotion() {
    const { cw, ch, gw, gh } = this;
    const cur = this.curLum, prev = this.prevLum;
    const THRESH = 0.06;            // ignore sensor noise
    const flow = this.flow;
    // scale from camera grid to field grid
    const sx = gw / cw, sy = gh / ch;

    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        const m = Math.abs(cur[i] - prev[i]);     // temporal motion magnitude
        if (m < THRESH) continue;
        // cheap optical-flow direction estimate: where motion is strongest in
        // the neighbourhood tells us roughly which way the edge moved. Use the
        // spatial luminance gradient of the *difference* as a push direction.
        const dxm = Math.abs(cur[i + 1] - prev[i + 1]) - Math.abs(cur[i - 1] - prev[i - 1]);
        const dym = Math.abs(cur[i + cw] - prev[i + cw]) - Math.abs(cur[i - cw] - prev[i - cw]);
        // push *down-gradient* (away from where change concentrates) so the ink
        // gets shoved outward by a moving limb, creating plumes.
        let fx = -dxm, fy = -dym;
        const fl = Math.hypot(fx, fy) || 1;
        fx /= fl; fy /= fl;

        // a little curl bias so pushes spiral instead of going perfectly radial
        const curl = ((x * 0.21 + y * 0.17) % 1 - 0.5);
        const tx = fx - fy * curl, ty = fy + fx * curl;

        const mag = clamp(m * 4, 0, 1);
        const gx = (x * sx) | 0, gy = (y * sy) | 0;
        const gi = gy * gw + gx;
        const force = mag * flow;
        this.vx[gi] += tx * force * 2.4;
        this.vy[gi] += ty * force * 2.4;
        this.dye[gi] += mag * flow * 0.55;
      }
    }
    // swap luminance buffers
    const t = this.prevLum; this.prevLum = this.curLum; this.curLum = t;
  }

  // ---- fluid step: advect dye + velocity, diffuse, dissipate ----------------
  _step(dt) {
    const { gw, gh, vx, vy, vx2, vy2, dye, dye2 } = this;
    const diss = this.dissipation;
    const visc = 0.94;             // velocity damping (smoke loses momentum)
    const idt = Math.min(dt, 0.033) * 60; // normalise to ~60fps step

    // semi-Lagrangian advection: trace each cell back along velocity, sample.
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        let px = x - vx[i] * idt;
        let py = y - vy[i] * idt;
        // clamp into grid
        if (px < 0) px = 0; else if (px > gw - 1.001) px = gw - 1.001;
        if (py < 0) py = 0; else if (py > gh - 1.001) py = gh - 1.001;
        const x0 = px | 0, y0 = py | 0;
        const x1 = x0 + 1, y1 = y0 + 1;
        const fx = px - x0, fy = py - y0;
        const i00 = y0 * gw + x0, i10 = y0 * gw + x1;
        const i01 = y1 * gw + x0, i11 = y1 * gw + x1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy, w11 = fx * fy;
        // advect dye
        dye2[i] = (dye[i00] * w00 + dye[i10] * w10 + dye[i01] * w01 + dye[i11] * w11) * diss;
        // advect velocity (self-advection) + viscosity damping
        vx2[i] = (vx[i00] * w00 + vx[i10] * w10 + vx[i01] * w01 + vx[i11] * w11) * visc;
        vy2[i] = (vy[i00] * w00 + vy[i10] * w10 + vy[i01] * w01 + vy[i11] * w11) * visc;
      }
    }

    // light diffusion blur on dye (3x3 box, in place from dye2 → dye)
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        const v =
          dye2[i] * 0.4 +
          (dye2[i - 1] + dye2[i + 1] + dye2[i - gw] + dye2[i + gw]) * 0.13 +
          (dye2[i - gw - 1] + dye2[i - gw + 1] + dye2[i + gw - 1] + dye2[i + gw + 1]) * 0.02;
        dye[i] = v;
      }
    }
    // edges: copy through without blur
    for (let x = 0; x < gw; x++) { dye[x] = dye2[x]; dye[(gh - 1) * gw + x] = dye2[(gh - 1) * gw + x]; }
    for (let y = 0; y < gh; y++) { dye[y * gw] = dye2[y * gw]; dye[y * gw + gw - 1] = dye2[y * gw + gw - 1]; }

    // swap velocity
    this.vx = vx2; this.vy = vy2; this.vx2 = vx; this.vy2 = vy;
  }

  // ---- render: tonemap dye → glowing accent ink, upscale to full canvas -----
  _render() {
    const { dye, img, gw, gh } = this;
    const d = img.data;
    const [r, g, b] = this.accentRgb;
    const I = this.intensity;
    for (let i = 0; i < dye.length; i++) {
      const v = clamp(dye[i] * 1.4 * I, 0, 1.6);
      const lo = Math.min(1, v);          // body of the ink
      const hi = Math.max(0, v - 0.55);   // hot core → toward white
      const hot = hi * hi * 220;
      const j = i * 4;
      d[j]     = 4  + r * lo * 0.85 + hot;
      d[j + 1] = 6  + g * lo * 0.95 + hot;
      d[j + 2] = 9  + b * lo * 0.90 + hot;
      d[j + 3] = 255;
    }
    this.bctx.putImageData(img, 0, 0);

    const g2 = this.ctx;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width, H = this.canvas.height;

    // optional faint camera ghost underlay (<=8% opacity) — never a selfie
    if (this.showGhost && this.video && this.video.readyState >= 2) {
      g2.globalCompositeOperation = "source-over";
      g2.fillStyle = "#04060a"; g2.fillRect(0, 0, W, H);
      g2.save();
      g2.globalAlpha = 0.07;
      if (this.mirror) { g2.translate(W, 0); g2.scale(-1, 1); }
      // cover-fit ghost
      const v = this.video, va = v.videoWidth / v.videoHeight, ca = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (va > ca) { dw = H * va; dx = (W - dw) / 2; } else { dh = W / va; dy = (H - dh) / 2; }
      g2.drawImage(v, dx, dy, dw, dh);
      g2.restore();
      // ink glows additively over the ghost
      g2.globalCompositeOperation = "lighter";
      g2.imageSmoothingEnabled = true;
      g2.drawImage(this.buf, 0, 0, W, H);
      g2.globalCompositeOperation = "source-over";
    } else {
      g2.globalCompositeOperation = "source-over";
      g2.imageSmoothingEnabled = true;
      g2.drawImage(this.buf, 0, 0, W, H);
    }
  }

  // ---- per-frame when camera is ready ---------------------------------------
  visionFrame(dt /*, t */) {
    if (this._readMotion()) this._injectFromMotion();
    this._step(dt);
    this._render();
  }

  // ---- ambient idle while waiting for permission / on failure ---------------
  drawIdle(dt, t) {
    // gentle drifting field so the work breathes before the camera grants.
    const { gw, gh } = this;
    // inject a slow wandering plume
    const cx = (0.5 + 0.32 * Math.sin(t * 0.31)) * gw;
    const cy = (0.5 + 0.26 * Math.cos(t * 0.23)) * gh;
    const ang = t * 0.7;
    const gi = ((cy | 0) * gw + (cx | 0));
    if (gi >= 0 && gi < this.vx.length) {
      this.vx[gi] += Math.cos(ang) * 0.5;
      this.vy[gi] += Math.sin(ang) * 0.5;
      this.dye[gi] += 0.25;
    }
    this._step(dt);
    this._render();
  }

  visionTeardown() {
    // grids are plain typed arrays / detached canvases → GC handles them.
    this.prevLum = this.curLum = null;
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("FLOW", 0.2, 2.5, this.flow, 0.05, (v) => (this.flow = v)));
    // DISSIPATION shown as "how fast it calms" — invert the retention value so
    // higher slider = faster calm (more intuitive label).
    host.appendChild(slider("DISSIPATION", 0.005, 0.06, 1 - this.dissipation, 0.001,
      (v) => (this.dissipation = 1 - v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("INTENSITY", 0.4, 2.2, this.intensity, 0.05, (v) => (this.intensity = v)));
    host.appendChild(buttonRow([
      { label: "잔잔하게 (Calm)", on: () => this.clear() },
      { label: "고스트 (Ghost)", on: (el) => { this.showGhost = !this.showGhost; el.classList.toggle("is-active", this.showGhost); } },
    ]));
  }
}
