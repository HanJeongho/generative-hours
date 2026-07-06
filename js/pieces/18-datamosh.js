// ============================================================================
//  18 · Datamosh — digital rain, decayed.
//  The source is a Matrix-style code rain: columns of glyphs falling down the
//  screen, bright at the head and fading down the tail. Then the classic glitch
//  techniques eat it — PIXEL SORTING reorders luminance spans into smeared
//  waterfalls, BYTE-SHIFT tears scanlines sideways, and dragging DATAMOSHES the
//  pixels, melting the falling code. Signal (legible glyphs) decaying into noise
//  (sorted, smeared data) — the image returning to pure information.
// ============================================================================

import { Piece, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// glyphs for the rain — katakana-ish marks + digits, the canonical "code" look
const GLYPHS = "0123456789ABCDEFｱｲｳｴｵｶｷｸｹｺｻｼｽｾﾀﾁﾂﾃﾅﾆﾇﾉﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ:.=*+<>¦|".split("");

export default class Datamosh extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.rainSpeed = 1.0;    // how fast the code falls
    this.reveal = 0.7;       // how vividly rubbing reveals the hidden face (0..1)
    this.glitch = 0.35;      // byte-shift / sort glitch intensity
    this.threshold = 0.5;    // luminance band that pixel-sorting bites into
    this.sortDir = 1;
    this.build();
  }

  onResize() { this.build(); }

  build() {
    const W = this.canvas.width, H = this.canvas.height;
    if (W < 2 || H < 2) return;
    this.W = W; this.H = H;
    this.img = this.ctx.createImageData(W, H);

    // rain columns sized to the glyph cell
    this.cell = Math.max(12, Math.round(16 * this.dpr));
    this.cols = Math.ceil(W / this.cell);
    this.rows = Math.ceil(H / this.cell);
    this.drops = [];
    for (let c = 0; c < this.cols; c++) this.drops.push(this._newDrop(true));

    // hidden face (Mr. Anderson in shades) baked as a luminance mask, plus a
    // low-res "reveal" buffer that the cursor paints into — where revealed, the
    // rain's glyph brightness is modulated by the face mask, so the portrait
    // emerges purely in green code + shadow, then slowly fades (afterimage).
    this._buildFaceMask();
    this.revW = this.cols; this.revH = this.rows;
    this.revealBuf = new Float32Array(this.revW * this.revH);

    // paint an initial dark frame
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 0; d[i + 1] = 8; d[i + 2] = 2; d[i + 3] = 255; }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.putImageData(this.img, 0, 0);
  }

  // Render a stylised "man in sunglasses" bust into a grayscale mask sampled at
  // the glyph-grid resolution. Values: ~0.5 neutral skin, bright cheeks/brow,
  // dark hair + near-black sunglasses. Stored as faceMask[row*cols+col] in 0..1.
  // Head HALF-WIDTH is deliberately narrow (≈ half the old value) so the face
  // reads as a real, slightly elongated head rather than a wide, flat icon.
  _buildFaceMask() {
    const cw = this.cols, ch = this.rows;
    const m = new Float32Array(cw * ch);
    const cx = cw * 0.5, cy = ch * 0.46;
    const hw = cw * 0.10, hh = ch * 0.30;      // head half-width / half-height (narrowed)
    for (let r = 0; r < ch; r++) {
      for (let c = 0; c < cw; c++) {
        const nx = (c - cx) / hw, ny = (r - cy) / hh;   // head-space coords
        let v = 0;
        const head = nx * nx + ny * ny;                 // <1 inside head ellipse
        if (head < 1) {
          // base face shading: brighter in the centre, darker at the jaw/edges
          v = 0.62 - 0.18 * Math.abs(nx) - 0.12 * Math.max(0, ny);
          // hair: top band of the head is dark
          if (ny < -0.45) v = 0.12 + 0.06 * Math.abs(nx);
          // sunglasses: a wide dark bar across the eyes (ny ≈ -0.15)
          const eyeY = ny + 0.12;
          if (Math.abs(eyeY) < 0.16 && Math.abs(nx) < 0.78) v = 0.04;
          // bridge highlight between the lenses
          if (Math.abs(nx) < 0.07 && Math.abs(eyeY) < 0.16) v = 0.5;
          // subtle nose/mouth shadow
          if (ny > 0.25 && ny < 0.5 && Math.abs(nx) < 0.18) v -= 0.12;
        } else {
          // shoulders/coat: a dark trapezoid below the head
          const shoulderTop = cy + hh * 0.95;
          if (r > shoulderTop) {
            const spread = (r - shoulderTop) / (ch - shoulderTop + 1);
            if (Math.abs(c - cx) < hw * (1.4 + spread * 3.0)) v = 0.16;
          }
        }
        m[r * cw + c] = clamp(v, 0, 1);
      }
    }
    this.faceMask = m;
  }

  // a falling stream: head row, speed, length, and a per-column glyph set
  _newDrop(seed) {
    return {
      head: seed ? -((Math.random() * this.rows) | 0) : -1,
      speed: (0.25 + Math.random() * 0.55) * (this.rainSpeed || 1),  // rows per frame
      len: 6 + ((Math.random() * 18) | 0),    // tail length
      acc: 0,                                  // sub-row accumulator
      glyphs: [],                              // current glyph per row (re-rolled at head)
    };
  }

  // ---- render one frame of rain into a scratch canvas, then read its pixels --
  _renderRain() {
    if (!this._scratch) {
      this._scratch = document.createElement("canvas");
      this._scratch.width = this.W; this._scratch.height = this.H;
      this._sctx = this._scratch.getContext("2d");
    }
    const g = this._sctx, s = this.cell;
    // fade the previous frame slightly (glowing trails) instead of full clear
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(0,6,2,0.30)";
    g.fillRect(0, 0, this.W, this.H);

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${Math.round(s * 0.86)}px "Courier New", monospace`;
    g.globalCompositeOperation = "lighter";
    for (let c = 0; c < this.cols; c++) {
      const drop = this.drops[c];
      drop.acc += drop.speed;
      while (drop.acc >= 1) { drop.acc -= 1; drop.head++; }
      if (drop.head - drop.len > this.rows) Object.assign(drop, this._newDrop(false));
      const cxp = c * s + s / 2;
      // draw the tail: head bright white-green, fading down to dark green
      for (let k = 0; k < drop.len; k++) {
        const row = drop.head - k;
        if (row < 0 || row > this.rows) continue;
        if (!drop.glyphs[row] || Math.random() < 0.03) drop.glyphs[row] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const f = 1 - k / drop.len;                 // 1 at head → 0 at tail
        const cyp = row * s + s / 2;
        if (k === 0) {
          g.fillStyle = "rgba(205,255,215,1)";       // hot near-white head
        } else {
          const green = (110 + 140 * f) | 0;
          g.fillStyle = `rgba(0,${green},${(green * 0.42) | 0},${f * f * 0.85 + 0.06})`;
        }
        g.fillText(drop.glyphs[row], cxp, cyp);
      }
    }

    // FACE PASS — into the SAME scratch so it ships out with the rain in one
    // putImageData. The hidden figure should EMERGE softly through the rain (a
    // ghost in the code), not a hard cut-out silhouette. So we only gently dim
    // the rain in shadowed areas and add a faint green lift where the figure is
    // lit — the form reads as a dim, hazy presence rather than a sharp portrait.
    if (this._faceGlyphs === undefined) this._faceGlyphs = [];
    for (let row = 0; row < this.revH; row++) {
      for (let c = 0; c < this.revW; c++) {
        const i = row * this.revW + c;
        const rv = clamp(this.revealBuf[i], 0, 1) * this.reveal;
        if (rv < 0.04) continue;
        const face = this.faceMask[i];
        if (face < 0.05) continue;                      // outside the bust
        const px = c * s, py = row * s;
        // 1) a SOFT dark wash (not opaque) — shadowed areas just sink a little
        //    into the rain instead of being blacked out, so the code still shows.
        g.globalCompositeOperation = "source-over";
        g.fillStyle = `rgba(0,7,3,${clamp(rv * (0.5 - face * 0.35), 0, 0.5)})`;
        g.fillRect(px, py, s, s);
        // 2) a faint green lift where the figure catches light — low alpha, no
        //    white, so it glows dimly through the rain rather than popping out.
        if (face >= 0.2) {
          if (!this._faceGlyphs[i] || Math.random() < 0.05)
            this._faceGlyphs[i] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          const lit = face * rv;
          const green = clamp(60 + face * 150, 0, 210) | 0;
          g.globalCompositeOperation = "lighter";
          g.fillStyle = `rgba(0,${green},${(green * 0.45) | 0},${clamp(0.12 + lit * 0.4, 0, 0.6)})`;
          g.fillText(this._faceGlyphs[i], px + s / 2, py + s / 2);
        }
      }
    }

    g.globalCompositeOperation = "source-over";
    return this._sctx.getImageData(0, 0, this.W, this.H);
  }

  // luminance 0..1 from the live buffer at pixel index i (i = pixel*4)
  _lumAt(d, i) { return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; }

  // ---- pixel sorting: reorder in-band luminance spans by brightness ----------
  _sortRow(y) {
    const d = this.img.data, W = this.W;
    const lo = clamp(this.threshold - 0.22, 0, 1);
    const hi = clamp(this.threshold + 0.22, 0, 1);
    const row = y * W;
    let x = 0;
    while (x < W) {
      let l = this._lumAt(d, (row + x) * 4);
      if (l < lo || l > hi) { x++; continue; }
      const start = x;
      while (x < W) { const ll = this._lumAt(d, (row + x) * 4); if (ll < lo || ll > hi) break; x++; }
      const len = x - start;
      if (len < 3) continue;
      const cells = [];
      for (let k = 0; k < len; k++) {
        const i = (row + start + k) * 4;
        cells.push([this._lumAt(d, i), d[i], d[i + 1], d[i + 2]]);
      }
      cells.sort((a, b) => (a[0] - b[0]) * this.sortDir);
      for (let k = 0; k < len; k++) {
        const i = (row + start + k) * 4;
        const c = cells[k];
        d[i] = c[1]; d[i + 1] = c[2]; d[i + 2] = c[3];
      }
    }
  }

  sortAll() {
    if (!this.img) return;
    for (let y = 0; y < this.H; y++) this._sortRow(y);
    this.ctx.putImageData(this.img, 0, 0);
  }

  // ---- datamosh smear: drag pixels along the pointer motion ------------------
  _smear() {
    const p = this.pointer;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp < 0.4) return;
    const d = this.img.data, W = this.W, H = this.H;
    const cx = (p.x * this.dpr) | 0, cy = (p.y * this.dpr) | 0;
    const R = (40 * this.dpr) | 0;
    const ox = -clamp(p.vx * this.dpr * 0.9, -R, R) | 0;
    const oy = -clamp(p.vy * this.dpr * 0.9, -R, R) | 0;
    for (let y = cy - R; y <= cy + R; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || x >= W) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > R * R) continue;
        const sx = clamp(x + ox, 0, W - 1), sy = clamp(y + oy, 0, H - 1);
        const di = (y * W + x) * 4, si = (sy * W + sx) * 4;
        d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2];
      }
    }
  }

  // ---- random horizontal byte-shift (torn scanline) --------------------------
  _byteShift() {
    const d = this.img.data, W = this.W, H = this.H;
    const y = (Math.random() * H) | 0;
    const thick = 1 + ((Math.random() * 6) | 0);
    const shift = (((Math.random() * 2 - 1) * W * 0.4) | 0);
    const tmp = new Uint8ClampedArray(W * 4);
    for (let yy = y; yy < Math.min(H, y + thick); yy++) {
      const row = yy * W;
      for (let x = 0; x < W; x++) {
        const sx = ((x + shift) % W + W) % W;
        const si = (row + sx) * 4, ti = x * 4;
        tmp[ti] = d[si]; tmp[ti + 1] = d[si + 1]; tmp[ti + 2] = d[si + 2];
      }
      for (let x = 0; x < W; x++) {
        const di = (row + x) * 4, ti = x * 4;
        d[di] = tmp[ti]; d[di + 1] = tmp[ti + 1]; d[di + 2] = tmp[ti + 2];
      }
    }
  }

  // paint reveal into the low-res buffer under the cursor: the harder/longer you
  // rub one spot, the more the hidden face shows there. Accumulates, capped at 1.
  _paintReveal() {
    const p = this.pointer;
    const gx = (p.x / this.w * this.revW), gy = (p.y / this.h * this.revH);
    const speed = Math.hypot(p.vx, p.vy);
    const add = 0.7 + Math.min(0.8, speed * 0.04);    // rubbing adds quickly
    const R = 6.0;                                     // brush radius in face-grid cells
    for (let r = Math.floor(gy - R); r <= gy + R; r++) {
      if (r < 0 || r >= this.revH) continue;
      for (let c = Math.floor(gx - R); c <= gx + R; c++) {
        if (c < 0 || c >= this.revW) continue;
        const dx = c - gx, dy = r - gy, d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const fall = 1 - Math.sqrt(d2) / R;
        const i = r * this.revW + c;
        this.revealBuf[i] = Math.min(1.4, this.revealBuf[i] + add * fall);
      }
    }
  }

  // ---- per-frame -------------------------------------------------------------
  frame(dt, t) {
    if (!this.img) return;

    // reveal afterimage: the rubbed face fades slowly so it lingers, then dies.
    // Higher REVEAL → it persists longer (decay closer to 1).
    const revDecay = 1 - (1 - this.reveal) * 0.02 - 0.004;
    const rb = this.revealBuf;
    for (let i = 0; i < rb.length; i++) if (rb[i] > 0.001) rb[i] *= revDecay; else rb[i] = 0;

    // dragging both reveals the face AND datamoshes the pixels
    const dragging = this.pointer.down && this.pointer.active;
    if (dragging) this._paintReveal();

    // 1) regenerate the living source: a fresh frame of falling code (RAIN SPEED
    //    scales how far the drops advance), now modulated by the revealed face.
    const rain = this._renderRain();
    this.img.data.set(rain.data);
    const H = this.H;

    // 2) GLITCH drives the pixel-sort streaks + torn scanlines. The flowing code
    //    keeps dissolving into noise at the edges of legibility.
    const passes = Math.max(0, (this.glitch * H * 0.10) | 0);
    this.sortDir = Math.sin(t * 0.25) > 0 ? 1 : -1;
    for (let n = 0; n < passes; n++) {
      const y = ((this._sweep = (this._sweep || 0) + 1) * 13) % H;
      this._sortRow(y);
    }
    const burst = 1 + (this.glitch * 4) | 0;
    if (Math.random() < this.glitch * 0.4) for (let i = 0; i < burst; i++) this._byteShift();

    // 3) dragging melts the code (datamosh smear)
    if (dragging) this._smear();

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.putImageData(this.img, 0, 0);

    if (dragging) this._sctx.putImageData(this.img, 0, 0);   // persist smear streaks
  }

  onPointerDown() {
    if (!this.img) return;
    this._paintReveal();   // a tap already starts uncovering the face
  }

  // ---- controls --------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("RAIN SPEED 강우", 0.3, 2.2, this.rainSpeed, 0.05,
      (v) => { this.rainSpeed = v; for (const d of this.drops) d.speed = (0.25 + Math.random() * 0.55) * v; }));
    host.appendChild(slider("REVEAL 형상", 0, 1, this.reveal, 0.02,
      (v) => (this.reveal = v)));
    host.appendChild(slider("GLITCH 글리치", 0, 1, this.glitch, 0.02,
      (v) => (this.glitch = v)));
    host.appendChild(buttonRow([
      { label: "지우기 (clear)", on: () => this.revealBuf && this.revealBuf.fill(0) },
    ]));
  }
}
