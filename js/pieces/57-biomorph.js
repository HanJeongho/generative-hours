// ============================================================================
//  57 · Garden of Choice (선택의 정원) — you don't design, you choose [Canvas2D]
//  Dawkins' biomorphs, staged as a 3×3 garden. Each organism is a GENOME:
//  { depth, branches, spread, lengthDecay, curve, symmetry, petal, hue,
//    widthDecay, sway } rendered as a recursive glowing branching form.
//  Click the one you like — it becomes the parent in the centre, and eight
//  mutated children grow around it. Nothing is designed; taste is the only
//  selection pressure, yet within generations the garden holds shapes you
//  never imagined — cumulative selection (The Blind Watchmaker), playable.
//  Hovered organisms sway and breathe; a lineage strip along the bottom
//  remembers every ancestor you chose. MUTATION scales variation; RESET
//  reseeds the garden from scratch.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const GRID = 3;

const randGene = () => ({
  depth: 3 + ((Math.random() * 4) | 0),            // 3..6
  branches: 2 + ((Math.random() * 3) | 0),         // 2..4
  spread: rand(0.35, 1.3),                         // fan angle
  decay: rand(0.58, 0.8),                          // length decay per level
  curve: rand(-0.5, 0.5),                          // lean per level
  sym: 1 + ((Math.random() * 5) | 0),              // radial symmetry 1..5
  petal: Math.random() < 0.5 ? 0 : rand(2, 7),     // tip petal size
  hue: rand(0, 360),
  widthDecay: rand(0.55, 0.85),
  sway: rand(0.2, 1),
});
const mutate = (g, amt) => {
  const m = { ...g };
  const jig = (v, s, lo, hi) => clamp(v + rand(-1, 1) * s * amt, lo, hi);
  m.depth = clamp(Math.round(g.depth + (Math.random() < 0.3 * amt ? (Math.random() < 0.5 ? -1 : 1) : 0)), 2, 7);
  m.branches = clamp(Math.round(g.branches + (Math.random() < 0.25 * amt ? (Math.random() < 0.5 ? -1 : 1) : 0)), 2, 5);
  m.spread = jig(g.spread, 0.25, 0.2, 1.6);
  m.decay = jig(g.decay, 0.06, 0.5, 0.85);
  m.curve = jig(g.curve, 0.18, -0.8, 0.8);
  m.sym = clamp(Math.round(g.sym + (Math.random() < 0.25 * amt ? (Math.random() < 0.5 ? -1 : 1) : 0)), 1, 6);
  m.petal = Math.random() < 0.12 * amt ? (g.petal ? 0 : rand(2, 7)) : jig(g.petal, 1.2, 0, 8);
  m.hue = (g.hue + rand(-40, 40) * amt + 360) % 360;
  m.widthDecay = jig(g.widthDecay, 0.06, 0.5, 0.9);
  m.sway = jig(g.sway, 0.2, 0.1, 1.4);
  return m;
};

export default class Biomorph extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.mutation = 1.0;
    this.gen = 0;
    this.lineage = [];        // chosen ancestors' genes
    this.hovered = -1;
    this.bornT = 0;           // birth animation clock
    this._reseed();
    this._layout();
  }
  onResize() { this._layout(); }
  _layout() {
    const W = this.w, H = this.h;
    const gridH = H * 0.78;
    this.cell = Math.min(W * 0.30, gridH / GRID);
    this.gx0 = W / 2 - (this.cell * GRID) / 2;
    this.gy0 = H * 0.04;
    this.stripY = this.gy0 + this.cell * GRID + H * 0.045;
  }
  _reseed() {
    this.pop = [];
    for (let i = 0; i < GRID * GRID; i++) this.pop.push(randGene());
    this.gen = 0; this.lineage = []; this.bornT = 0;
  }
  _cellAt(px, py) {
    const c = Math.floor((px - this.gx0) / this.cell);
    const r = Math.floor((py - this.gy0) / this.cell);
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return -1;
    return r * GRID + c;
  }
  onPointerDown() {
    const i = this._cellAt(this.pointer.x, this.pointer.y);
    if (i < 0) return;
    // chosen one becomes the centre parent; 8 mutated children around it
    const parent = this.pop[i];
    this.lineage.push(parent);
    if (this.lineage.length > 14) this.lineage.shift();
    const next = [];
    for (let k = 0; k < GRID * GRID; k++)
      next.push(k === 4 ? { ...parent } : mutate(parent, this.mutation));
    this.pop = next;
    this.gen++;
    this.bornT = 0;
  }

  // ---- recursive organism -----------------------------------------------------
  _branch(g, x, y, ang, len, wid, depth, gene, t, swayAmt) {
    if (depth <= 0 || len < 1.5) {
      if (gene.petal > 0.5) {
        g.fillStyle = `hsla(${(gene.hue + 40) % 360},90%,72%,0.8)`;
        g.beginPath(); g.arc(x, y, gene.petal, 0, TAU); g.fill();
      }
      return;
    }
    const sway = Math.sin(t * 1.4 + depth * 1.7) * 0.05 * gene.sway * swayAmt;
    const n = gene.branches;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5;
      const a = ang + f * gene.spread + gene.curve * 0.4 + sway;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      g.strokeStyle = `hsla(${(gene.hue + depth * 12) % 360},80%,${52 + depth * 5}%,${0.5 + depth * 0.07})`;
      g.lineWidth = Math.max(0.6, wid);
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      this._branch(g, nx, ny, a, len * gene.decay, wid * gene.widthDecay, depth - 1, gene, t, swayAmt);
    }
  }
  _organism(g, cx, cy, size, gene, t, swayAmt, scale = 1) {
    g.save();
    g.translate(cx, cy);
    g.scale(scale, scale);
    g.globalCompositeOperation = "lighter";
    const L = size * 0.23;
    for (let s = 0; s < gene.sym; s++) {
      g.save();
      g.rotate((s / gene.sym) * TAU);
      this._branch(g, 0, size * 0.18, -Math.PI / 2, L, 2.6, gene.depth, gene, t, swayAmt);
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
    g.restore();
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    this.bornT += dt;

    g.fillStyle = "#070a09"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.65);
    bg.addColorStop(0, "rgba(30,60,45,0.25)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    this.hovered = this.pointer.active ? this._cellAt(this.pointer.x, this.pointer.y) : -1;

    // the garden
    for (let i = 0; i < GRID * GRID; i++) {
      const c = i % GRID, r = (i / GRID) | 0;
      const cx = this.gx0 + (c + 0.5) * this.cell;
      const cy = this.gy0 + (r + 0.5) * this.cell;
      const hov = i === this.hovered;
      const isParent = this.gen > 0 && i === 4;

      // birth: children scale in staggered; parent steady
      const born = clamp((this.bornT - (isParent ? 0 : 0.05 * i)) * 2.2, 0, 1);
      const scale = (isParent ? 1 : 0.4 + 0.6 * born) * (hov ? 1.06 : 1);

      // plot ring
      g.strokeStyle = hov ? "rgba(189,125,255,0.55)" : "rgba(140,150,160,0.14)";
      g.lineWidth = hov ? 1.6 : 1;
      g.beginPath(); g.arc(cx, cy, this.cell * 0.46, 0, TAU); g.stroke();
      if (isParent) {
        g.strokeStyle = "rgba(189,125,255,0.35)";
        g.setLineDash([4, 5]);
        g.beginPath(); g.arc(cx, cy, this.cell * 0.5, 0, TAU); g.stroke();
        g.setLineDash([]);
      }

      this._organism(g, cx, cy, this.cell, this.pop[i], t + i * 3.7, hov ? 1.6 : 0.6, scale);
    }

    // lineage strip — every ancestor you chose
    if (this.lineage.length) {
      const s = Math.min(44, (W * 0.8) / Math.max(8, this.lineage.length));
      const x0 = W / 2 - (s * this.lineage.length) / 2;
      g.font = "10px ui-monospace, Menlo, monospace";
      g.textAlign = "left"; g.textBaseline = "middle";
      g.fillStyle = "rgba(170,180,175,0.5)";
      g.fillText("LINEAGE", x0 - 64, this.stripY + s * 0.5);
      for (let i = 0; i < this.lineage.length; i++) {
        this._organism(g, x0 + s * (i + 0.5), this.stripY + s * 0.5, s * 1.6, this.lineage[i], 0, 0, 1);
        if (i < this.lineage.length - 1) {
          g.fillStyle = "rgba(150,160,155,0.4)";
          g.fillText("→", x0 + s * (i + 1) - 4, this.stripY + s * 0.5);
        }
      }
    }

    // generation counter
    g.font = `600 ${Math.max(12, H * 0.02)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "right"; g.textBaseline = "top";
    g.fillStyle = "rgba(190,200,195,0.6)";
    g.fillText(`GEN ${this.gen}`, W - 18, 14);
  }

  controls(host) {
    host.appendChild(slider("MUTATION", 0.3, 2.2, this.mutation, 0.05, (v) => (this.mutation = v)));
    host.appendChild(buttonRow([{ label: "RESET — 새 씨앗", on: () => this._reseed() }]));
  }
}
