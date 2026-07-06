// ============================================================================
//  48 · Glyph Rain (글리프의 비) — order crystallising out of data  [Canvas2D]
//  A wall of digit-rain: every column drips random numerals (dim, cool noise).
//  Behind the rain sits an invisible mask — HH:MM:SS set huge across the wall.
//  When a stream head passes through a mask cell, that raindrop FREEZES in
//  place (keeping whatever digit it happened to carry) and glows accent-hot;
//  frost then creeps cell-to-cell so each numeral finishes crystallising in a
//  breath. The giant time is literally condensed out of the noise.
//  When a digit changes, only that slot MELTS — its crystals thaw, slide, and
//  rejoin the rain — and the new digit freezes out of the very next drops.
//  Minute rollover melts the whole wall at once (a cascade), then the full
//  time re-crystallises. Cursor parts the rain; click thaws the digit under
//  it. FROST HAND: hold the pointer down and move — raindrops passing your
//  hand freeze where they are, so you draw with frost; each frozen trace
//  holds a moment, then thaws and rejoins the rain.
//  Glyph atlases (dim / head / crystal with baked glow) keep it one
//  drawImage per cell — thousands of glyphs at 60fps, no shadowBlur per frame.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const DIGITS = "0123456789";

export default class GlyphRain extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.acc = hexToRgb(this.accent || "#ff4fd8");

    this.rain = 1.0;      // RAIN — stream density / speed
    this.glow = 1.0;      // GLOW — crystal brightness
    this.h24 = false;

    this.meltAll = 0;     // minute-rollover cascade envelope
    const d = new Date();
    this.lastStr = "";    // last time string (per-slot diffing)
    this.lastM = d.getMinutes();

    this._makeAtlases();
    this._layout();
    this._buildMask(true);
    // open already-crystallised: the wall has been freezing time long before
    // you arrived — only the live seconds churn from here on
    for (let n = 0; n < this.need.length; n++)
      if (this.need[n]) { this.crys[n] = 1; this.cch[n] = (Math.random() * 10) | 0; }
  }

  onResize() { this._layout(); this._buildMask(true); }

  // ---- glyph atlases: dim rain / bright head / crystal (glow baked once) ---
  _makeAtlases() {
    const S = 28;                       // atlas cell px (drawn scaled)
    const mk = (fill, glowCol, blur) => {
      const c = document.createElement("canvas");
      c.width = S * 10; c.height = S;
      const g = c.getContext("2d");
      g.font = `700 ${S * 0.78}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      if (blur) { g.shadowColor = glowCol; g.shadowBlur = blur; }
      g.fillStyle = fill;
      for (let i = 0; i < 10; i++) g.fillText(DIGITS[i], i * S + S / 2, S * 0.54);
      return c;
    };
    const [r, gg, b] = this.acc;
    this.atlasDim = mk("rgba(120,190,170,1)", "", 0);                      // cool data-noise
    this.atlasHead = mk("rgba(235,255,245,1)", "rgba(160,255,210,0.9)", 7); // stream head
    this.atlasCrys = mk("rgba(255,235,250,1)", `rgba(${r},${gg},${b},0.95)`, 9); // frozen time
    this.S = S;
  }

  _layout() {
    const W = this.w, H = this.h;
    this.colW = Math.max(10, Math.min(15, W / 94));
    this.rowH = this.colW * 1.22;
    this.cols = Math.ceil(W / this.colW);
    this.rows = Math.ceil(H / this.rowH);
    const N = this.cols * this.rows;

    this.crys = new Float32Array(N);    // crystal energy 0..1
    this.cch = new Uint8Array(N);       // frozen digit index
    this.melty = new Float32Array(N);   // melt drip offset (rows)
    this.slotOf = new Int16Array(N).fill(-1);
    this.need = new Uint8Array(N);      // 1 = cell belongs to the current mask
    this.userCrys = new Float32Array(N); // frost-hand crystals (yours, temporary)
    this.userCh = new Uint8Array(N);

    // streams: ~1.6 per column at rain=1
    this.streams = [];
    for (let c = 0; c < this.cols; c++)
      for (let k = 0; k < 2; k++)
        this.streams.push({
          c, y: rand(-this.rows, this.rows), sp: rand(6, 14), len: (8 + rand(0, 10)) | 0,
          on: k === 0 || Math.random() < 0.6,
        });
  }

  _timeParts() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const h = d.getHours();
    const hd = this.h24 ? h : (h % 12 === 0 ? 12 : h % 12);
    return { str: `${pad(hd)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, d };
  }

  // ---- giant time mask, sampled per rain cell; slot index per char ---------
  _buildMask(full) {
    const { str } = this._timeParts();
    // rasterise at 4× cell resolution with a heavy face, then take per-cell
    // block coverage — glyph strokes come out 3~4 cells thick, not spindly
    const SS = 4;
    const off = document.createElement("canvas");
    off.width = this.cols * SS; off.height = this.rows * SS;
    const g = off.getContext("2d");
    const fs = Math.min(this.rows * SS * 0.80, (this.cols * SS * 0.175));
    g.font = `900 ${fs}px ui-monospace, Menlo, monospace`;
    g.textBaseline = "middle";
    const widths = [...str].map((ch) => g.measureText(ch).width * (ch === ":" ? 0.72 : 1));
    const gap = fs * 0.07;
    const totW = widths.reduce((a, b) => a + b + gap, -gap);
    let x = (this.cols * SS - totW) / 2;
    const cy = this.rows * SS * 0.5;

    const changed = new Set();
    for (let i = 0; i < str.length; i++) {
      if (full || str[i] !== this.lastStr[i]) changed.add(i);
    }

    // rasterise each char separately so every cell knows its slot
    const slotAt = new Int16Array(this.cols * this.rows).fill(-1);
    for (let i = 0; i < str.length; i++) {
      g.clearRect(0, 0, off.width, off.height);
      g.fillStyle = "#fff";
      g.fillText(str[i], x, cy);
      const px = g.getImageData(0, 0, off.width, off.height).data;
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) {
          let cov = 0;
          for (let sy = 0; sy < SS; sy++)
            for (let sx = 0; sx < SS; sx++) {
              const p = ((r * SS + sy) * off.width + (c * SS + sx)) * 4 + 3;
              if (px[p] > 128) cov++;
            }
          if (cov >= 4) slotAt[r * this.cols + c] = i;   // ≥4/16 subpixels covered
        }
      x += widths[i] + gap;
    }
    // apply: cells in changed slots melt; new mask cells arm
    for (let n = 0; n < slotAt.length; n++) {
      const before = this.slotOf[n], after = slotAt[n];
      this.slotOf[n] = after;
      this.need[n] = after >= 0 ? 1 : 0;
      if (before >= 0 && changed.has(before) && this.crys[n] > 0 && (after < 0 || changed.has(after))) {
        this.melty[n] = 0.001;                       // start dripping away
      }
      if (after >= 0 && changed.has(after) && this.melty[n] === 0 && before !== after) {
        this.crys[n] = 0;                            // fresh cell, waits for rain
      }
    }
    // instant seeds: a few sparks per changed slot, so frost growth starts NOW
    // instead of waiting for a rain head to wander in (seconds must finish fast)
    for (const sIdx of changed) {
      let seeded = 0;
      for (let tries = 0; tries < 400 && seeded < 4; tries++) {
        const n = (Math.random() * slotAt.length) | 0;
        if (this.slotOf[n] === sIdx && this.need[n] && this.crys[n] <= 0 && this.melty[n] === 0) {
          this.crys[n] = 1; this.cch[n] = (Math.random() * 10) | 0; seeded++;
        }
      }
    }
    this.lastStr = str;
  }

  onPointerDown() {
    // thaw the slot under the cursor — it re-freezes from the next drops
    const c = clamp((this.pointer.x / this.colW) | 0, 0, this.cols - 1);
    const r = clamp((this.pointer.y / this.rowH) | 0, 0, this.rows - 1);
    const slot = this.slotOf[r * this.cols + c];
    if (slot < 0) return;
    for (let n = 0; n < this.slotOf.length; n++)
      if (this.slotOf[n] === slot && this.crys[n] > 0) this.melty[n] = 0.001;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const { d } = this._timeParts();

    // clock edges
    const m = d.getMinutes();
    if (m !== this.lastM) { this.lastM = m; this.meltAll = 1; }
    if (this.meltAll > 0) {
      // cascade: thaw everything once, top row first
      for (let n = 0; n < this.crys.length; n++)
        if (this.crys[n] > 0 && this.melty[n] === 0 && Math.random() < dt * 9) this.melty[n] = 0.001;
      this.meltAll = Math.max(0, this.meltAll - dt * 1.1);
    }
    // rebuild the mask only when the displayed string actually changes
    if (this._timeParts().str !== this.lastStr) this._buildMask(false);

    // ---- frost hand: held pointer freezes the rain it touches ---------------
    if (this.pointer.down && this.pointer.active) {
      const pc = (this.pointer.x / this.colW) | 0;
      const pr = (this.pointer.y / this.rowH) | 0;
      for (let orr = -1; orr <= 1; orr++)
        for (let oc = -1; oc <= 1; oc++) {
          const r2 = pr + orr, c2 = pc + oc;
          if (r2 < 0 || r2 >= this.rows || c2 < 0 || c2 >= this.cols) continue;
          const n2 = r2 * this.cols + c2;
          if (this.crys[n2] > 0.02 || this.userCrys[n2] > 0.02) continue;
          if (Math.random() < dt * (orr === 0 && oc === 0 ? 40 : 12)) {
            this.userCrys[n2] = 1;
            this.userCh[n2] = this._glyphAt(c2, r2, t);
          }
        }
    }
    // user frost holds a moment, then thaws (faster than the time's crystals)
    for (let n2 = 0; n2 < this.userCrys.length; n2++)
      if (this.userCrys[n2] > 0) this.userCrys[n2] = Math.max(0, this.userCrys[n2] - dt * 0.4);

    // ---- streams fall -------------------------------------------------------
    const spMul = 0.75 + this.rain * 0.55;
    for (const s of this.streams) {
      if (!s.on) { if (Math.random() < dt * 0.4 * this.rain) s.on = true; continue; }
      s.y += s.sp * spMul * dt;
      if (s.y - s.len > this.rows + 2) {
        s.y = rand(-this.rows * 0.5, 0); s.sp = rand(6, 14); s.len = (8 + rand(0, 10)) | 0;
        s.on = Math.random() < 0.55 + this.rain * 0.3;
        continue;
      }
      // head hits an armed mask cell → freeze the drop it carries
      const hr = Math.floor(s.y), hc = s.c;
      if (hr >= 0 && hr < this.rows) {
        const n = hr * this.cols + hc;
        if (this.need[n] && this.crys[n] <= 0 && this.melty[n] === 0) {
          this.crys[n] = 1;
          this.cch[n] = this._glyphAt(hc, hr, t) ;
        }
      }
    }

    // ---- frost growth: crystals seed their neighbours -----------------------
    // (guarantees each numeral completes in ~a second even where rain is sparse)
    for (let pass = 0; pass < 4; pass++) {
      const n0 = (Math.random() * this.crys.length) | 0;
      for (let k = 0; k < 420; k++) {
        const n = (n0 + k * 37) % this.crys.length;
        if (!this.need[n] || this.crys[n] > 0 || this.melty[n] > 0) continue;
        const r = (n / this.cols) | 0, c = n % this.cols;
        const nb = [n - 1, n + 1, n - this.cols, n + this.cols];
        for (const q of nb) {
          if (q >= 0 && q < this.crys.length && this.crys[q] >= 0.9 && Math.random() < dt * 110) {
            this.crys[n] = 1; this.cch[n] = this._glyphAt(c, r, t);
            break;
          }
        }
      }
    }

    // ---- melt drips ---------------------------------------------------------
    for (let n = 0; n < this.crys.length; n++) {
      if (this.melty[n] > 0) {
        this.melty[n] += dt * (6 + this.melty[n] * 10);
        this.crys[n] = Math.max(0, this.crys[n] - dt * 2.2);
        if (this.crys[n] <= 0) { this.melty[n] = 0; }
      }
    }

    // =========================== R E N D E R ================================
    g.fillStyle = "#05070a";
    g.fillRect(0, 0, W, H);
    const bgg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
    bgg.addColorStop(0, "rgba(20,34,32,0.5)"); bgg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bgg; g.fillRect(0, 0, W, H);

    const S = this.S, cw = this.colW, rh = this.rowH;
    const px = this.pointer.x, py = this.pointer.y, pact = this.pointer.active;

    // rain streams (dim tails + bright head), parted around the cursor
    for (const s of this.streams) {
      if (!s.on) continue;
      const headR = Math.floor(s.y);
      for (let i = 0; i < s.len; i++) {
        const r = headR - i;
        if (r < 0 || r >= this.rows) continue;
        const n = r * this.cols + s.c;
        if (this.crys[n] > 0.45 || this.userCrys[n] > 0.4) continue; // a crystal owns this cell
        let x = s.c * cw;
        const y = r * rh;
        if (pact) {                                    // the rain parts around the hand
          const dx = x + cw / 2 - px, dy = y - py;
          const d2 = dx * dx + dy * dy, R = 130;
          if (d2 < R * R) x += Math.sign(dx || 1) * (1 - Math.sqrt(d2) / R) * 26;
        }
        const gi = this._glyphAt(s.c, r, t);
        const a = i === 0 ? 0.95 : Math.max(0, 0.55 * (1 - i / s.len)) * (0.5 + this.rain * 0.3);
        g.globalAlpha = a;
        g.drawImage(i === 0 ? this.atlasHead : this.atlasDim, gi * S, 0, S, S, x, y, cw, rh);
      }
    }
    g.globalAlpha = 1;

    // frost-hand crystals — icy white-green, briefly held
    for (let n = 0; n < this.userCrys.length; n++) {
      const uv = this.userCrys[n];
      if (uv <= 0.02) continue;
      const r = (n / this.cols) | 0, c = n % this.cols;
      g.globalAlpha = clamp(uv * 0.9, 0, 1);
      g.drawImage(this.atlasHead, this.userCh[n] * S, 0, S, S, c * cw, r * rh, cw, rh);
    }
    g.globalAlpha = 1;

    // crystallised time (+ melt drips sliding off)
    for (let n = 0; n < this.crys.length; n++) {
      const cv = this.crys[n];
      if (cv <= 0.02) continue;
      const r = (n / this.cols) | 0, c = n % this.cols;
      const drip = this.melty[n];
      const y = (r + drip) * rh;
      if (y > H) continue;
      g.globalAlpha = clamp(cv * (0.88 + 0.12 * Math.sin(t * 5 + n)) * this.glow, 0, 1);
      g.drawImage(this.atlasCrys, this.cch[n] * S, 0, S, S, c * cw, y, cw, rh);
    }
    g.globalAlpha = 1;

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // deterministic-but-flickering digit for a cell (changes a few times a second)
  _glyphAt(c, r, t) {
    const e = (t * 2.2) | 0;
    let h = (c * 73856093) ^ (r * 19349663) ^ (e * 83492791);
    h = (h ^ (h >> 13)) >>> 0;
    return h % 10;
  }

  controls(host) {
    host.appendChild(slider("RAIN", 0.3, 2.2, this.rain, 0.05, (v) => (this.rain = v)));
    host.appendChild(slider("GLOW", 0.4, 1.8, this.glow, 0.05, (v) => (this.glow = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24; this._buildMask(true);
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
