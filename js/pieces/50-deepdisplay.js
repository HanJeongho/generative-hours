// ============================================================================
//  50 · Deep Display (디스플레이의 디스플레이) — recursive digits  [Canvas2D]
//  A wall of hundreds of live miniature seven-segment displays. Idle cells
//  murmur — dim LCD ghosts flipping random digits like a rack of instruments.
//  But the wall is also ONE display: giant seven-segment numerals (HH:MM:SS)
//  are laid over the grid, and every cell inside a giant digit's segments
//  lights accent-hot AND SHOWS THAT SAME DIGIT — the big 4 is written with
//  dozens of little 4s. Digits made of digits; the smallest pixel and the
//  largest glyph speak the same grammar.
//  When a digit changes, a re-light WAVE sweeps radially across that slot:
//  each cell flashes white for a beat, then settles on the new numeral. The
//  cursor wakes nearby idle cells (they brighten and churn faster); a click
//  launches a scramble ripple across the whole wall. DIGIT GRAFFITI: press
//  and drag — every cell your hand crosses lights accent-hot and locks the
//  next digit of the counting sequence (0,1,2,3…), so your stroke is written
//  in numerals on the wall, holding a few seconds before fading back to
//  murmur.
//  Rendering: 10-digit × 3-style glyph atlases baked once (dim ghost / lit
//  accent / flash white) → one drawImage per cell. ~900 cells at 60fps.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

//        A
//      F   B        seven segments, classic labelling
//        G
//      E   C
//        D
const SEGS = {
  0: [1, 1, 1, 1, 1, 1, 0], 1: [0, 1, 1, 0, 0, 0, 0], 2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1], 4: [0, 1, 1, 0, 0, 1, 1], 5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1], 7: [1, 1, 1, 0, 0, 0, 0], 8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};

export default class DeepDisplay extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.acc = hexToRgb(this.accent || "#ff4fd8");

    this.density = 1.0;    // DENSITY — cell size
    this.flicker = 1.0;    // FLICKER — idle churn rate
    this.h24 = false;

    this.slots = [];       // per giant char: {digit, prev, changeT, cx, cy}
    this.ripple = null;    // click scramble ripple {x,y,r}
    this.lastStr = "";

    this._makeAtlases();
    this._layout();
  }

  onResize() { this._layout(); }

  // ---- mini seven-seg atlases (dim ghost / lit / flash), baked once --------
  _drawMini(g, x0, y0, w, h, on, colOn, colOff, glow) {
    const th = h * 0.14, L = w - th * 2;
    // [x, y, horizontal?, length]
    const geo = [
      [th, 0, 1], [w - th, th, 0], [w - th, h / 2 + th * 0.5, 0],
      [th, h - th, 1], [0, h / 2 + th * 0.5, 0], [0, th, 0], [th, h / 2 - th * 0.5, 1],
    ];
    for (let i = 0; i < 7; i++) {
      const [sx, sy, hor] = geo[i];
      g.fillStyle = on[i] ? colOn : colOff;
      if (on[i] && glow) { g.shadowColor = glow; g.shadowBlur = 6; } else g.shadowBlur = 0;
      if (hor) g.fillRect(x0 + sx, y0 + sy - th * 0.5 + (sy === 0 ? th * 0.5 : 0) - (sy === 0 ? 0 : 0), L, th);
      else g.fillRect(x0 + sx - th * 0.5, y0 + sy, th, (h - th * 3) / 2);
    }
    g.shadowBlur = 0;
  }
  _makeAtlases() {
    const CW = 26, CH = 40;
    const [r, g_, b] = this.acc;
    const mk = (colOn, colOff, glow) => {
      const c = document.createElement("canvas");
      c.width = CW * 11; c.height = CH;            // 10 digits + all-on block
      const g = c.getContext("2d");
      for (let d = 0; d < 10; d++)
        this._drawMini(g, d * CW + 3, 3, CW - 6, CH - 6, SEGS[d], colOn, colOff, glow);
      this._drawMini(g, 10 * CW + 3, 3, CW - 6, CH - 6, [1, 1, 1, 1, 1, 1, 1], colOn, colOff, glow);
      return c;
    };
    this.atDim = mk("rgba(140,155,180,0.34)", "rgba(120,130,155,0.07)", "");
    this.atLit = mk(`rgba(${Math.min(255, r + 60)},${Math.min(255, g_ + 60)},${Math.min(255, b + 60)},0.98)`,
      `rgba(${r},${g_},${b},0.10)`, `rgba(${r},${g_},${b},0.9)`);
    this.atHot = mk("rgba(255,255,255,0.98)", "rgba(255,255,255,0.12)", "rgba(255,240,252,0.95)");
    this.CW = CW; this.CH = CH;
  }

  // ---- grid + giant seven-seg layout ----------------------------------------
  _layout() {
    const W = this.w, H = this.h;
    const base = Math.max(13, Math.min(24, W / 58));
    this.cw = base / this.density;
    this.ch = this.cw * 1.55;
    this.cols = Math.ceil(W / this.cw);
    this.rows = Math.ceil(H / this.ch);
    const N = this.cols * this.rows;

    this.idleD = new Uint8Array(N);
    this.flipAt = new Float32Array(N);
    this.userLit = new Float32Array(N);   // digit-graffiti energy per cell
    this.userD = new Uint8Array(N);
    this._paintCount = 0;
    for (let n = 0; n < N; n++) { this.idleD[n] = (Math.random() * 10) | 0; this.flipAt[n] = rand(0, 6); }
    this.cellSlot = new Int16Array(N).fill(-1);

    this._giant();
    this._applyTime(true);
  }

  // giant seven-seg geometry: which grid cell belongs to which char slot
  _giant() {
    const W = this.w, H = this.h;
    // total width in gH units: 6 digits + 7 gaps + 2 colons — keep it on screen
    const gH = Math.min(H * 0.52, (W * 0.94) / 4.6);
    const gW = gH * 0.54, thick = gH * 0.17, gap = gW * 0.26, colonW = gW * 0.34;
    const totW = 6 * gW + 5 * gap + 2 * colonW + 2 * gap;
    const x0 = (W - totW) / 2, cy = H / 2;
    this.slotBox = [];                    // per slot: rects[] in canvas px
    let x = x0;
    const digitRects = (dx) => {
      const t = thick, w = gW, h = gH, y = cy - gH / 2;
      return [
        [dx + t, y, w - 2 * t, t],                       // A
        [dx + w - t, y + t * 0.6, t, h / 2 - t],         // B
        [dx + w - t, y + h / 2 + t * 0.4, t, h / 2 - t], // C
        [dx + t, y + h - t, w - 2 * t, t],               // D
        [dx, y + h / 2 + t * 0.4, t, h / 2 - t],         // E
        [dx, y + t * 0.6, t, h / 2 - t],                 // F
        [dx + t, y + h / 2 - t / 2, w - 2 * t, t],       // G
      ];
    };
    for (let i = 0; i < 8; i++) {         // H H : M M : S S
      if (i === 2 || i === 5) {
        const t = thick;
        this.slotBox.push({ colon: true, rects: [
          [x + colonW / 2 - t / 2, cy - gH * 0.24 - t / 2, t, t],
          [x + colonW / 2 - t / 2, cy + gH * 0.24 - t / 2, t, t],
        ], cx: x + colonW / 2, cy });
        x += colonW + gap;
      } else {
        this.slotBox.push({ colon: false, rects: digitRects(x), cx: x + gW / 2, cy });
        x += gW + gap;
      }
    }
    this.slots = this.slotBox.map((b) => ({ digit: -1, prev: -1, changeT: -1, cx: b.cx, cy: b.cy }));
  }

  _timeStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const h = d.getHours();
    const hd = this.h24 ? h : (h % 12 === 0 ? 12 : h % 12);
    return `${pad(hd)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // map cells → slots for the CURRENT digits (segment-accurate recursion)
  _applyTime(hard) {
    const str = this._timeStr();
    if (str === this.lastStr && !hard) return;
    const now = this.t || 0;
    for (let i = 0; i < 8; i++) {
      const ch = str[i];
      const s = this.slots[i];
      const dnew = ch === ":" ? 10 : +ch;
      if (s.digit !== dnew) { s.prev = s.digit; s.digit = dnew; s.changeT = hard ? -9 : now; }
    }
    // rebuild the cell→slot map from lit segment rects of every slot
    this.cellSlot.fill(-1);
    for (let i = 0; i < 8; i++) {
      const box = this.slotBox[i], s = this.slots[i];
      const on = box.colon ? [1, 1] : SEGS[s.digit];
      for (let ri = 0; ri < box.rects.length; ri++) {
        if (!box.colon && !on[ri]) continue;
        const [rx, ry, rw, rh] = box.rects[ri];
        const c0 = clamp(Math.floor(rx / this.cw), 0, this.cols - 1);
        const c1 = clamp(Math.ceil((rx + rw) / this.cw) - 1, 0, this.cols - 1);
        const r0 = clamp(Math.floor(ry / this.ch), 0, this.rows - 1);
        const r1 = clamp(Math.ceil((ry + rh) / this.ch) - 1, 0, this.rows - 1);
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const cx = (c + 0.5) * this.cw, cyy = (r + 0.5) * this.ch;
            if (cx >= rx - 1 && cx <= rx + rw + 1 && cyy >= ry - 1 && cyy <= ry + rh + 1)
              this.cellSlot[r * this.cols + c] = i;
          }
      }
    }
    this.lastStr = str;
    this._bakeGlow();
  }

  // accent light-bed behind lit giant segments — baked small, upscaled = soft
  _bakeGlow() {
    const W = Math.max(2, this.w), H = Math.max(2, this.h);
    const K = 12;                     // 1/12 scale → upscale = free blur
    if (!this._glow) this._glow = document.createElement("canvas");
    const c = this._glow;
    c.width = Math.max(2, Math.round(W / K)); c.height = Math.max(2, Math.round(H / K));
    const gg = c.getContext("2d");
    gg.clearRect(0, 0, c.width, c.height);
    const [r, g_, b] = this.acc;
    gg.fillStyle = `rgba(${r},${g_},${b},0.5)`;
    for (let i = 0; i < 8; i++) {
      const box = this.slotBox[i], s = this.slots[i];
      const on = box.colon ? [1, 1] : SEGS[s.digit];
      for (let ri = 0; ri < box.rects.length; ri++) {
        if (!box.colon && !on[ri]) continue;
        const [rx, ry, rw, rh] = box.rects[ri];
        const pad = 10;               // inflate → wider light spill
        gg.fillRect((rx - pad) / K, (ry - pad) / K, (rw + pad * 2) / K, (rh + pad * 2) / K);
      }
    }
  }

  onPointerDown() {
    this.ripple = { x: this.pointer.x, y: this.pointer.y, r: 0 };
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    this._applyTime(false);
    if (this.ripple) {
      this.ripple.r += dt * Math.max(W, H) * 1.4;
      if (this.ripple.r > Math.hypot(W, H)) this.ripple = null;
    }

    // digit graffiti: dragging writes the counting sequence along your stroke
    if (this.pointer.down && this.pointer.active) {
      const c = clamp((this.pointer.x / this.cw) | 0, 0, this.cols - 1);
      const r = clamp((this.pointer.y / this.ch) | 0, 0, this.rows - 1);
      const n = r * this.cols + c;
      if (this.userLit[n] < 0.6 && this.cellSlot[n] < 0) {
        this.userLit[n] = 1;
        this.userD[n] = this._paintCount % 10;
        this._paintCount++;
      }
    }
    for (let n = 0; n < this.userLit.length; n++)
      if (this.userLit[n] > 0) this.userLit[n] = Math.max(0, this.userLit[n] - dt * 0.28);

    // ---- backdrop: dark instrument wall ------------------------------------
    g.fillStyle = "#07080d"; g.fillRect(0, 0, W, H);
    const bgg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    bgg.addColorStop(0, "rgba(26,26,40,0.55)"); bgg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bgg; g.fillRect(0, 0, W, H);

    // accent light-bed behind the lit giant segments (baked, upscaled soft)
    if (this._glow) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.55 + 0.08 * Math.sin(t * 2.1);
      g.drawImage(this._glow, 0, 0, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }

    // slow refresh band drifting down the wall
    const bandY = ((t * 26) % (H + 240)) - 120;

    const px = this.pointer.x, py = this.pointer.y, pact = this.pointer.active;
    const CW = this.CW, CH = this.CH;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const n = r * this.cols + c;
        const x = c * this.cw, y = r * this.ch;
        const cx = x + this.cw / 2, cyy = y + this.ch / 2;
        const slot = this.cellSlot[n];

        // idle churn
        if (t >= this.flipAt[n]) {
          this.idleD[n] = (Math.random() * 10) | 0;
          this.flipAt[n] = t + rand(0.4, 5) / this.flicker;
        }

        // instrument-module backplate: every cell sits in its own dark bezel
        g.globalAlpha = 1;
        g.fillStyle = "rgba(16,18,27,0.78)";
        g.fillRect(x + 0.5, y + 0.5, this.cw - 1, this.ch - 1);

        let atlas = this.atDim, digit = this.idleD[n], alpha = 0.4;

        // cursor wakes idle cells nearby
        if (pact && slot < 0) {
          const dx = cx - px, dy = cyy - py, d2 = dx * dx + dy * dy, R = 150;
          if (d2 < R * R) {
            const k = 1 - Math.sqrt(d2) / R;
            alpha = 0.4 + k * 1.1;
            if (Math.random() < dt * 20 * k) { this.idleD[n] = (Math.random() * 10) | 0; }
          }
        }

        if (slot >= 0) {
          const s = this.slots[slot];
          // radial re-light wave from the slot centre on digit change
          const delay = Math.hypot(cx - s.cx, cyy - s.cy) / (Math.max(W, H) * 0.9);
          const k = t - s.changeT - delay;
          if (k < 0 && s.prev >= 0) {
            // still showing the ghost of the previous digit, dimming
            atlas = this.atDim; digit = s.prev === 10 ? 10 : s.prev; alpha = 0.9;
          } else if (k < 0.14) {
            atlas = this.atHot; digit = 10; alpha = 1;           // white flash, all-on
          } else {
            atlas = this.atLit; digit = s.digit; alpha = 0.94 + 0.06 * Math.sin(t * 7 + n);
          }
        }

        // digit graffiti — your stroke, written in numerals, fading back
        if (slot < 0 && this.userLit[n] > 0.03) {
          atlas = this.atLit; digit = this.userD[n];
          alpha = 0.35 + this.userLit[n] * 0.85;
        }

        // click scramble ripple overrides briefly
        if (this.ripple) {
          const d = Math.abs(Math.hypot(cx - this.ripple.x, cyy - this.ripple.y) - this.ripple.r);
          if (d < 34) { atlas = this.atHot; digit = (Math.random() * 10) | 0; alpha = 1; }
        }

        // refresh band shimmer
        if (Math.abs(cyy - bandY) < 60) alpha = Math.min(1.25, alpha + 0.14 * (1 - Math.abs(cyy - bandY) / 60));

        g.globalAlpha = clamp(alpha, 0, 1);
        g.drawImage(atlas, digit * CW, 0, CW, CH, x + 1, y + 1, this.cw - 2, this.ch - 2);
      }
    }
    g.globalAlpha = 1;

    // module seams — one pass of hairline grid over the wall
    g.strokeStyle = "rgba(255,255,255,0.030)"; g.lineWidth = 1;
    g.beginPath();
    for (let c = 1; c < this.cols; c++) { const x = c * this.cw; g.moveTo(x, 0); g.lineTo(x, H); }
    for (let r = 1; r < this.rows; r++) { const y = r * this.ch; g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("DENSITY", 0.7, 1.6, this.density, 0.05, (v) => { this.density = v; this._layout(); }));
    host.appendChild(slider("FLICKER", 0.3, 3, this.flicker, 0.05, (v) => (this.flicker = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24; this._applyTime(true);
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
