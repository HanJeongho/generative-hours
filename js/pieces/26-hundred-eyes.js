// ============================================================================
//  26 · Hundred Eyes — 백 개의 눈
//  A wall of stylized eyes that all swivel to LOOK AT the viewer. The gaze
//  target is the midpoint between the two detected irises (nose as fallback),
//  mapped to canvas space with the selfie mirror. Pupils dilate when the face
//  fills more of the frame (closer), the whole wall blinks in a staggered wave,
//  and a detected viewer-blink is mirrored onto every eye. Aqua-mint bloom on a
//  near-black ground. While the camera/model loads, the eyes idly wander/search.
// ============================================================================

import { VisionPiece, FACE } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, hexToRgb, TAU } from "../engine.js";

export default class HundredEyes extends VisionPiece {
  get tracker() { return "face"; }   // FACE model: 478 landmarks + iris + blendshapes

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");
    const [r, g, b] = hexToRgb(this.accent || "#5fe6d0");
    this.rgb = { r, g, b };

    // tunables (driven by controls)
    this.countTarget = 0.5;   // 0..1 -> density (rebuilds grid)
    this.pupilScale = 1.0;    // multiplier on pupil radius
    this.tracking = 0.5;      // 0 lazy .. 1 snappy (gaze follow speed)
    this.layout = "scatter";  // "scatter" | "grid"

    // gaze state (canvas CSS px). Smoothly chases the detected target.
    this.gaze = { x: this.w * 0.5, y: this.h * 0.5 };
    this.hasFace = false;
    this.closeness = 0.3;     // 0 far .. 1 near (drives dilation)
    this.viewerBlink = 0;     // 0..1, mirrored from blendshapes

    // synchronized blink wave
    this.blinkClock = 0;      // counts up; a wave fires every blinkEvery sec
    this.blinkEvery = 5.5;
    this.blinkWave = -1;      // >=0 while a wave is sweeping (0..1 progress); -1 idle
    this.blinkSpeed = 1.9;    // wave progress per second

    this.eyes = [];
    this.build();
  }

  // ---- grid / scatter construction -----------------------------------------
  _eyeCount() {
    const area = this.w * this.h;
    // density slider scales a base count tied to screen area, clamped 40..160
    const base = area / 16000;             // ~ one eye per 125px square
    const n = base * (0.45 + this.countTarget * 1.1);
    return Math.round(clamp(n, 40, 160));
  }

  build() {
    const n = this._eyeCount();
    this.eyes.length = 0;
    // resolve to a near-square grid covering the canvas
    const aspect = this.w / Math.max(1, this.h);
    let cols = Math.max(2, Math.round(Math.sqrt(n * aspect)));
    let rows = Math.max(2, Math.ceil(n / cols));
    this.cols = cols; this.rows = rows;
    const cw = this.w / cols, ch = this.h / rows;
    const cell = Math.min(cw, ch);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // centre of the cell, plus a per-eye jitter for the scatter layout
        const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
        const jx = (Math.random() - 0.5) * cw * 0.55;
        const jy = (Math.random() - 0.5) * ch * 0.55;
        this.eyes.push({
          row: r, col: c,
          gx: cx, gy: cy,                       // grid home
          sx: cx + jx, sy: cy + jy,             // scattered home
          rx: cell * (0.30 + Math.random() * 0.12), // eye half-width (radius x)
          ry: 0,                                 // set below from rx
          hueJit: (Math.random() - 0.5) * 36,    // per-eye iris hue jitter (deg)
          litJit: (Math.random() - 0.5) * 12,    // per-eye lightness jitter
          phase: Math.random() * TAU,            // idle-wander phase
          wspeed: 0.4 + Math.random() * 0.7,     // idle-wander speed
          // smoothed pupil offset (within iris), eased toward gaze each frame
          px: 0, py: 0,
          lid: 0,                                // 0 open .. 1 fully shut
        });
      }
    }
    for (const e of this.eyes) e.ry = e.rx * 0.62;  // almond proportion
  }

  onResize() { this.build(); this.gaze.x = this.w * 0.5; this.gaze.y = this.h * 0.5; }

  // ---- vision per-frame ------------------------------------------------------
  visionFrame(dt, t, results) {
    const faces = results && results.faceLandmarks;
    if (faces && faces.length) {
      const lm = faces[0];
      const li = lm[FACE.LEFT_IRIS], ri = lm[FACE.RIGHT_IRIS];
      let tx, ty;
      if (li && ri) {
        const a = this.toCanvas(li), b = this.toCanvas(ri);
        tx = (a.x + b.x) * 0.5; ty = (a.y + b.y) * 0.5;
        // closeness from inter-iris distance, normalized to screen size
        const d = Math.hypot(a.x - b.x, a.y - b.y) / Math.min(this.w, this.h);
        // typical d ~0.05 (far) .. 0.20 (near); map to 0..1
        this.closeness = clamp((d - 0.045) / (0.17 - 0.045), 0, 1);
      } else if (lm[FACE.NOSE]) {
        const p = this.toCanvas(lm[FACE.NOSE]);
        tx = p.x; ty = p.y;
      }
      if (tx !== undefined) {
        this.hasFace = true;
        // chase target; snappiness from tracking slider
        const k = 1 - Math.pow(1 - (0.08 + this.tracking * 0.42), dt * 60);
        this.gaze.x = lerp(this.gaze.x, tx, k);
        this.gaze.y = lerp(this.gaze.y, ty, k);
      }
      this._readBlink(results);
    } else {
      this.hasFace = false;
      this.viewerBlink = lerp(this.viewerBlink, 0, dt * 6);
    }
    this._render(dt, t, true);
  }

  // mirror the viewer's blink onto the wall, if a blendshape exposes it
  _readBlink(results) {
    const bs = results.faceBlendshapes;
    if (!bs || !bs.length || !bs[0].categories) return;
    let lo = 0;
    for (const c of bs[0].categories) {
      if (c.categoryName && c.categoryName.indexOf("eyeBlink") !== -1) {
        lo = Math.max(lo, c.score || 0);
      }
    }
    // smooth so it isn't jittery; 0.5+ counts as a clear blink
    this.viewerBlink = lerp(this.viewerBlink, clamp((lo - 0.2) / 0.6, 0, 1), 0.5);
  }

  // ---- idle: no camera yet / failed — eyes wander and search ----------------
  drawIdle(dt, t) {
    if (!this.eyes.length) return;        // setup not run yet
    this.hasFace = false;
    // a slow lissajous target so the whole wall drifts its gaze around
    this.gaze.x = this.w * (0.5 + 0.32 * Math.sin(t * 0.34));
    this.gaze.y = this.h * (0.5 + 0.28 * Math.cos(t * 0.27 + 1.1));
    this.closeness = lerp(this.closeness, 0.28, dt * 2);
    this._render(dt, t, false);
  }

  // ---- the wall --------------------------------------------------------------
  _render(dt, t, tracking) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // near-black ground with a faint accent vignette
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#04070a";
    g.fillRect(0, 0, this.w, this.h);

    // advance the synchronized blink wave
    this._advanceBlink(dt);

    const { r, g: gg, b } = this.rgb;
    const pupilDilate = 0.34 + this.closeness * 0.34;  // pupil radius fraction of iris
    const irisFrac = 0.66;                              // iris radius fraction of sclera

    // when the viewer's eyes close, the wall closes too (on top of the wave)
    const viewerLid = this.viewerBlink;

    for (const e of this.eyes) {
      const hx = this.layout === "grid" ? e.gx : e.sx;
      const hy = this.layout === "grid" ? e.gy : e.sy;

      // --- where this eye looks ---
      let dirx, diry;
      if (tracking && this.hasFace) {
        dirx = this.gaze.x - hx; diry = this.gaze.y - hy;
      } else {
        // idle wander toward the drifting gaze, with a per-eye organic wobble
        const wob = e.phase + t * e.wspeed;
        dirx = (this.gaze.x - hx) + Math.cos(wob) * 40;
        diry = (this.gaze.y - hy) + Math.sin(wob * 1.3) * 40;
      }
      const dlen = Math.hypot(dirx, diry) || 1;
      // pupil rides within the iris; offset clamped so it stays inside
      const reach = e.rx * irisFrac * (1 - pupilDilate) * 0.92;
      const tpx = (dirx / dlen) * reach;
      const tpy = (diry / dlen) * reach * 0.78;   // squash vertical (almond)
      const ek = 1 - Math.pow(1 - (0.12 + this.tracking * 0.5), dt * 60);
      e.px = lerp(e.px, tpx, ek);
      e.py = lerp(e.py, tpy, ek);

      // --- lid: max of the wave (staggered per row) and the viewer's blink ---
      let waveLid = 0;
      if (this.blinkWave >= 0) {
        // each row fires slightly later -> downward wave
        const rowDelay = (e.row / Math.max(1, this.rows - 1)) * 0.4;
        const local = (this.blinkWave - rowDelay) / 0.6;   // 0..1 window
        if (local > 0 && local < 1) {
          // open->shut->open over the window
          waveLid = Math.sin(local * Math.PI);
        }
      }
      e.lid = Math.max(waveLid, viewerLid);

      this._drawEye(g, hx, hy, e, r, gg, b, pupilDilate, irisFrac);
    }

    // additive bloom pass: redraw irises as soft accent glows
    g.globalCompositeOperation = "lighter";
    for (const e of this.eyes) {
      if (e.lid > 0.85) continue;
      const hx = this.layout === "grid" ? e.gx : e.sx;
      const hy = this.layout === "grid" ? e.gy : e.sy;
      const ir = e.rx * irisFrac;
      const open = 1 - e.lid;
      const grd = g.createRadialGradient(hx + e.px, hy + e.py, 0, hx + e.px, hy + e.py, ir * 2.4);
      grd.addColorStop(0, `rgba(${r},${gg},${b},${0.10 * open})`);
      grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(hx + e.px, hy + e.py, ir * 2.4, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  _advanceBlink(dt) {
    if (this.blinkWave >= 0) {
      this.blinkWave += dt * this.blinkSpeed;
      if (this.blinkWave > 1.2) this.blinkWave = -1;   // wave (incl. row delay+window) done
    } else {
      this.blinkClock += dt;
      if (this.blinkClock >= this.blinkEvery) {
        this.blinkClock = 0;
        this.blinkEvery = 4.5 + Math.random() * 3.5;   // vary the cadence
        this.blinkWave = 0;
      }
    }
  }

  triggerBlink() { if (this.blinkWave < 0) { this.blinkWave = 0; this.blinkClock = 0; } }

  // ---- one eye ---------------------------------------------------------------
  _drawEye(g, cx, cy, e, r, gg, b, pupilDilate, irisFrac) {
    const open = 1 - e.lid;                 // 0 shut .. 1 open
    if (open <= 0.02) {
      // closed: a thin accent lash-line
      g.strokeStyle = `rgba(${r},${gg},${b},0.5)`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - e.rx, cy);
      g.lineTo(cx + e.rx, cy);
      g.stroke();
      return;
    }
    const ry = e.ry * open;                 // lid squashes the sclera vertically

    g.save();
    // --- sclera: pale almond ellipse ---
    g.fillStyle = "rgba(232,244,246,0.92)";
    g.beginPath();
    g.ellipse(cx, cy, e.rx, ry, 0, 0, TAU);
    g.fill();

    // clip subsequent fills to the (squashed) sclera so iris/pupil never bleed out
    g.beginPath();
    g.ellipse(cx, cy, e.rx, ry, 0, 0, TAU);
    g.clip();

    // --- iris: accent-tinted, per-eye hue/lightness variation ---
    const ir = e.rx * irisFrac;
    const ix = cx + e.px, iy = cy + e.py;
    const grd = g.createRadialGradient(ix, iy, ir * 0.2, ix, iy, ir);
    const l1 = clamp(58 + e.litJit, 30, 80);
    const hueBase = this._accentHue();
    grd.addColorStop(0, `hsl(${hueBase + e.hueJit}, 62%, ${l1}%)`);
    grd.addColorStop(0.7, `hsl(${hueBase + e.hueJit}, 70%, ${clamp(l1 - 22, 14, 70)}%)`);
    grd.addColorStop(1, `hsl(${hueBase + e.hueJit}, 55%, ${clamp(l1 - 34, 8, 60)}%)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(ix, iy, ir, 0, TAU);
    g.fill();

    // --- pupil: dark, dilates with closeness ---
    const pr = ir * pupilDilate * this.pupilScale;
    g.fillStyle = "#05080a";
    g.beginPath();
    g.arc(ix, iy, pr, 0, TAU);
    g.fill();

    // --- specular highlight: fixed (top-left), sells the "looking" feel ---
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.arc(ix - pr * 0.4, iy - pr * 0.45, pr * 0.32, 0, TAU);
    g.fill();

    g.restore();

    // --- upper-lid shadow when partly closed (eyelid sweeping over) ---
    if (e.lid > 0.02) {
      g.save();
      g.fillStyle = "rgba(4,7,10,0.92)";
      g.beginPath();
      // top cap of the almond, height = how much the lid has come down
      g.ellipse(cx, cy - ry, e.rx, e.ry * e.lid, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  // approximate hue of the accent for HSL iris variation (aqua-mint ~166°)
  _accentHue() {
    if (this._hue !== undefined) return this._hue;
    const { r, g, b } = this.rgb;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === rn) h = ((gn - bn) / d) % 6;
      else if (mx === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    this._hue = h;
    return h;
  }

  // ---- controls --------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("EYE COUNT", 0, 1, this.countTarget, 0.02,
      (v) => { this.countTarget = v; this.build(); },
      () => `${this._eyeCount()}개`));
    host.appendChild(slider("PUPIL SIZE", 0.5, 2.0, this.pupilScale, 0.05,
      (v) => (this.pupilScale = v)));
    host.appendChild(slider("TRACKING", 0, 1, this.tracking, 0.02,
      (v) => (this.tracking = v),
      (v) => (+v < 0.34 ? "lazy" : +v > 0.66 ? "snappy" : "mid")));
    host.appendChild(buttonRow([
      { label: "정렬 (grid)", on: (el) => {
        this.layout = this.layout === "grid" ? "scatter" : "grid";
        el.textContent = this.layout === "grid" ? "흩기 (scatter)" : "정렬 (grid)";
      } },
      { label: "깜빡임 (blink)", on: () => this.triggerBlink() },
    ]));
  }
}
