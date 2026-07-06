// ============================================================================
//  13 · Mandala — kaleidoscopic n-fold symmetry painting
//  Every stroke from the centre is mirrored across N rotational sectors (and
//  optionally reflected), so a single gesture blooms into a symmetric mandala.
//  Strokes glow and the whole composition breathes with a slow rotation.
// ============================================================================

import { Piece, TAU, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const PALETTES = {
  aurora:  ["#7cffd2", "#7cc6ff", "#d6a6ff", "#ffffff"],
  ember:   ["#ffb27c", "#ff8fa3", "#ffd27c", "#fff2d6"],
  bloom:   ["#d6a6ff", "#ff8fcf", "#8fe39a", "#ffffff"],
  ice:     ["#bfe9ff", "#7cc6ff", "#c8b6ff", "#eaf6ff"],
};

export default class Mandala extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.symmetry = 12;
    this.mirror = true;
    this.rotate = true;
    this.rotation = 0;
    this.palette = "aurora";
    this.hue = 0;
    this.lastDraw = null;
    this._clearStage("#070709");

    // a gently spinning layer we draw the persistent art onto
    this.layer = document.createElement("canvas");
    this._sizeLayer();
    this.lctx = this.layer.getContext("2d");
    this.lctx.fillStyle = "#070709";
    this.lctx.fillRect(0, 0, this.layer.width, this.layer.height);

    // auto-demo: draw a seed flourish so the piece is never empty
    this._seedFlourish();
  }

  _sizeLayer() {
    this.layer.width = Math.round(this.w * this.dpr);
    this.layer.height = Math.round(this.h * this.dpr);
  }
  _clearStage(c) {
    const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = c; g.fillRect(0, 0, this.w, this.h);
  }

  onResize() {
    const old = this.layer;
    const nl = document.createElement("canvas");
    nl.width = Math.round(this.w * this.dpr); nl.height = Math.round(this.h * this.dpr);
    const nc = nl.getContext("2d");
    nc.fillStyle = "#070709"; nc.fillRect(0, 0, nl.width, nl.height);
    nc.drawImage(old, (nl.width - old.width) / 2, (nl.height - old.height) / 2);
    this.layer = nl; this.lctx = nc;
  }

  clear() {
    this.lctx.fillStyle = "#070709";
    this.lctx.fillRect(0, 0, this.layer.width, this.layer.height);
  }

  _seedFlourish() {
    // a procedural opening gesture (so the canvas greets the visitor)
    const cx = this.w / 2, cy = this.h / 2;
    let a = 0;
    for (let i = 0; i < 60; i++) {
      a += 0.18;
      const r1 = 30 + i * 2.6 + Math.sin(i * 0.3) * 20;
      const r2 = 30 + (i + 1) * 2.6 + Math.sin((i + 1) * 0.3) * 20;
      this._stamp(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
                  cx + Math.cos(a + 0.18) * r2, cy + Math.sin(a + 0.18) * r2, i);
    }
  }

  onPointerUp() { this.lastDraw = null; }

  _stamp(x0, y0, x1, y1, seed = 0) {
    const g = this.lctx;
    const cx = this.layer.width / 2, cy = this.layer.height / 2;
    const d = this.dpr;
    const cols = PALETTES[this.palette];
    const col = cols[(Math.abs(Math.round(seed)) + (this.hue | 0)) % cols.length];
    g.save();
    g.translate(cx, cy);
    g.globalCompositeOperation = "lighter";
    const lw = (2 + Math.hypot(x1 - x0, y1 - y0) * 0.12) * d;
    for (let s = 0; s < this.symmetry; s++) {
      const ang = (s / this.symmetry) * TAU;
      for (let m = 0; m < (this.mirror ? 2 : 1); m++) {
        g.save();
        g.rotate(ang);
        if (m === 1) g.scale(1, -1);
        g.beginPath();
        g.moveTo((x0 - this.w / 2) * d, (y0 - this.h / 2) * d);
        g.lineTo((x1 - this.w / 2) * d, (y1 - this.h / 2) * d);
        g.strokeStyle = col + "cc";
        g.lineWidth = lw; g.lineCap = "round";
        g.shadowColor = col; g.shadowBlur = 14 * d;
        g.stroke();
        g.restore();
      }
    }
    g.restore();
  }

  frame(dt) {
    // draw from pointer
    if (this.pointer.down && this.pointer.active) {
      const p = this.pointer;
      if (this.lastDraw) {
        this._stamp(this.lastDraw.x, this.lastDraw.y, p.x, p.y, this.hue + this.t * 6);
        this.hue += 1;
      }
      this.lastDraw = { x: p.x, y: p.y };
    }
    if (this.rotate) this.rotation += dt * 0.05;

    // composite the spinning layer to the visible stage
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#070709";
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.save();
    g.translate(this.canvas.width / 2, this.canvas.height / 2);
    g.rotate(this.rotation);
    g.drawImage(this.layer, -this.layer.width / 2, -this.layer.height / 2);
    g.restore();

    // soft central bloom
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
    const rad = g.createRadialGradient(cx, cy, 0, cx, cy, 60 * this.dpr);
    rad.addColorStop(0, "rgba(255,255,255,0.10)");
    rad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rad; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  controls(host) {
    host.appendChild(slider("SYMMETRY", 3, 24, this.symmetry, 1,
      (v) => (this.symmetry = v | 0), (v) => String(v | 0)));

    // palette swatches
    const wrap = document.createElement("div");
    wrap.className = "ctrl";
    wrap.innerHTML = `<span class="ctrl__label">PALETTE</span>`;
    const sw = document.createElement("div");
    sw.className = "ctrl__swatches";
    Object.entries(PALETTES).forEach(([name, cols], i) => {
      const b = document.createElement("button");
      b.className = "ctrl__swatch" + (name === this.palette ? " is-active" : "");
      b.style.background = `linear-gradient(135deg, ${cols[0]}, ${cols[2]})`;
      b.title = name;
      b.addEventListener("click", () => {
        this.palette = name;
        sw.querySelectorAll(".ctrl__swatch").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
      });
      sw.appendChild(b);
    });
    wrap.appendChild(sw);
    host.appendChild(wrap);

    host.appendChild(buttonRow([
      { label: "거울 대칭", on: (el) => { this.mirror = !this.mirror; el.classList.toggle("is-active", this.mirror); } },
      { label: "회전", on: (el) => { this.rotate = !this.rotate; el.classList.toggle("is-active", this.rotate); } },
      { label: "비우기", on: () => this.clear() },
    ]));
    // reflect initial active states
    const btns = host.querySelectorAll(".ctrl__btns")[0]?.querySelectorAll(".ctrl__btn");
    if (btns) { if (this.mirror) btns[0].classList.add("is-active"); if (this.rotate) btns[1].classList.add("is-active"); }
  }
}
