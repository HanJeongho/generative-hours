// ============================================================================
//  63 · Scintillating Grid (반짝이는 격자) — the uncatchable sparkle [Canvas2D]
//  The scintillating-grid illusion (Schrauf, Lingelbach & Wist 1997, evolved
//  from Hermann 1870): grey streets on black, a white disc at every crossing.
//  In your PERIPHERY the discs flash black; wherever you actually look, the
//  disc is serenely white. Retinal ganglion cells with centre-surround
//  receptive fields over-report the surround at peripheral crossings; foveal
//  receptive fields are too small to be fooled. The render is completely
//  static — the strobing is yours alone.
//  HOLD = isolation proof: everything but one crossing fades away, and that
//  lone disc never flickers. Click = invert (white streets on grey — the
//  classic Hermann variant, grey smudges instead of black flashes). SPACING /
//  LINE sliders tune the geometry: the illusion peaks around street widths
//  of ~1/5 the cell and dies when the grid gets too coarse — find the sweet
//  spot where your retina screams loudest.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class ScintGrid extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.spacing = 1.0;      // SPACING — cell size
    this.lineW = 1.0;        // LINE — street width
    this.inverted = false;
    this.iso = 0;            // hold-to-isolate envelope
    this._bake();
  }
  onResize() { this._bake(); }
  onPointerDown() { this._downT = performance.now(); }
  onPointerUp() {
    if (performance.now() - (this._downT || 0) < 260) {
      this.inverted = !this.inverted;
      this._bake();
    }
  }

  _bake() {
    const W = Math.max(2, this.w), H = Math.max(2, this.h);
    const off = document.createElement("canvas");
    off.width = Math.round(W * this.dpr); off.height = Math.round(H * this.dpr);
    const g = off.getContext("2d");
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const bgCol = this.inverted ? "#8a8d92" : "#0b0b0d";
    const stCol = this.inverted ? "#f2f3f5" : "#6f7278";
    const dotCol = this.inverted ? "#0b0b0d" : "#ffffff";

    g.fillStyle = bgCol; g.fillRect(0, 0, W, H);

    const cell = Math.min(W, H) * 0.11 * this.spacing;
    const lw = cell * 0.22 * this.lineW;
    const x0 = (W % cell) / 2 - cell, y0 = (H % cell) / 2 - cell;

    // streets
    g.fillStyle = stCol;
    for (let x = x0; x < W + cell; x += cell) g.fillRect(x - lw / 2, 0, lw, H);
    for (let y = y0; y < H + cell; y += cell) g.fillRect(0, y - lw / 2, W, lw);

    // discs at crossings
    this.crossings = [];
    g.fillStyle = dotCol;
    for (let x = x0; x < W + cell; x += cell)
      for (let y = y0; y < H + cell; y += cell) {
        g.beginPath(); g.arc(x, y, lw * 0.62, 0, TAU); g.fill();
        if (x > 0 && x < W && y > 0 && y < H) this.crossings.push({ x, y });
      }
    this.baked = off;
    this.cell = cell; this.lw = lw;
    this.bgCol = bgCol; this.dotCol = dotCol; this.stCol = stCol;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    if (this.baked) g.drawImage(this.baked, 0, 0, W, H);

    // hold = isolate one crossing: strip the context, the flicker dies
    const holding = this.pointer.down && this.pointer.active &&
      performance.now() - (this._downT || 0) >= 260;
    this.iso = clamp(this.iso + (holding ? dt * 4 : -dt * 4), 0, 1);
    if (this.iso > 0.01 && this.crossings && this.crossings.length) {
      // nearest crossing to the pointer stays; everything else fades to bg
      let best = this.crossings[0], bd = 1e9;
      for (const c of this.crossings) {
        const d = (c.x - this.pointer.x) ** 2 + (c.y - this.pointer.y) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      g.fillStyle = this.bgCol.replace(")", "");    // solid veil
      g.globalAlpha = this.iso * 0.94;
      g.fillStyle = this.bgCol;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      // redraw the lone crossing: two street stubs + its disc
      const a = Math.min(1, this.iso * 1.4);
      g.globalAlpha = a;
      g.fillStyle = this.stCol;
      g.fillRect(best.x - this.lw / 2, best.y - this.cell, this.lw, this.cell * 2);
      g.fillRect(best.x - this.cell, best.y - this.lw / 2, this.cell * 2, this.lw);
      g.fillStyle = this.dotCol;
      g.beginPath(); g.arc(best.x, best.y, this.lw * 0.62, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.font = `500 ${Math.max(12, H * 0.02)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillStyle = this.inverted ? "rgba(20,20,26,0.8)" : "rgba(230,235,245,0.8)";
      g.fillText("혼자 있는 교차점은 결코 번쩍이지 않습니다 — 맥락이 착시를 만듭니다", W / 2, H - 70);
    } else {
      g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillStyle = this.inverted ? "rgba(30,30,36,0.6)" : "rgba(220,226,238,0.55)";
      g.fillText("번쩍이는 검은 점을 시선으로 잡아 보세요 — 잡히지 않습니다 (꾹: 격리 증명 · 클릭: 반전)", W / 2, H - 70);
    }
  }

  controls(host) {
    host.appendChild(slider("SPACING", 0.6, 1.8, this.spacing, 0.05, (v) => { this.spacing = v; this._bake(); }));
    host.appendChild(slider("LINE", 0.6, 1.6, this.lineW, 0.05, (v) => { this.lineW = v; this._bake(); }));
    host.appendChild(buttonRow([{ label: "반전 (헤르만 격자)", on: () => { this.inverted = !this.inverted; this._bake(); } }]));
  }
}
