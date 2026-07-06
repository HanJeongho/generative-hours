// ============================================================================
//  65 · Shepard Tables (셰퍼드의 탁자) — congruent, incorrigibly [Canvas2D]
//  Shepard's "Turning the Tables" (1990). Two tables: one reads long and
//  narrow, the other short and wide — yet the two tabletop parallelograms
//  are CONGRUENT (identical shape, rotated 90°). Depth cues (legs, occlusion)
//  make the brain interpret the "depth" axis as foreshortened and silently
//  stretch it; the correction cannot be switched off.
//  PROOF BY HAND: grab the left tabletop — it lifts off its legs (drop
//  shadow grows), follows your hand, and eases its rotation toward the right
//  table's orientation; release near the right top and it settles EXACTLY
//  onto it, edge for edge, with a soft "match" flash. Release anywhere else
//  and it floats home, and the lie reasserts itself. OUTLINE mode strips the
//  scene to two naked parallelograms (the illusion dies without the 3D
//  story). The tabletop geometry is one array, drawn twice — congruence is
//  structural, not asserted.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Shepard extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.outline = false;
    this.carry = { on: false, x: 0, y: 0, rot: 0, home: true, match: 0 };
    this._layout();
  }
  onResize() { this._layout(); }
  _layout() {
    const W = this.w, H = this.h;
    const s = Math.min(W, H) * 0.155;
    // THE tabletop: one parallelogram (long axis "into depth"), reused for both
    // (unit shape ~ 1 × 2.3, skewed for the classic drawing)
    this.top = [[-0.5, -1.15], [0.5, -0.85], [0.5, 1.15], [-0.5, 0.85]].map(([x, y]) => [x * s, y * s]);
    this.tA = { x: W * 0.32, y: H * 0.47, rot: 0 };            // "long" table
    this.tB = { x: W * 0.67, y: H * 0.50, rot: Math.PI / 2 };  // "wide" table (same top, +90°)
    this.legH = s * 0.9; this.s = s;
  }

  _poly(cx, cy, rot, scale = 1) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return this.top.map(([x, y]) => [cx + (x * c - y * s) * scale, cy + (x * s + y * c) * scale]);
  }
  _inPoly(px, py, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  onPointerDown() {
    if (this._inPoly(this.pointer.x, this.pointer.y, this._poly(this.tA.x, this.tA.y, this.tA.rot))) {
      this.carry.on = true; this.carry.home = false;
      this.carry.x = this.tA.x; this.carry.y = this.tA.y; this.carry.rot = this.tA.rot;
    }
  }
  onPointerUp() {
    if (!this.carry.on) return;
    this.carry.on = false;
    const nearB = Math.hypot(this.carry.x - this.tB.x, this.carry.y - this.tB.y) < this.s * 1.1;
    if (nearB) this.carry.match = 1;          // settled onto B — congruence shown
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // carried top follows the hand; rotation eases toward B's orientation as
    // it approaches (so the overlay lands aligned), back to A's when homing
    const c = this.carry;
    if (c.on && this.pointer.down) {
      c.x = this.pointer.x; c.y = this.pointer.y;
      const dB = Math.hypot(c.x - this.tB.x, c.y - this.tB.y);
      const k = clamp(1 - dB / (this.s * 3.2), 0, 1);
      c.rot = lerp(this.tA.rot, this.tB.rot, k);
    } else if (!c.home) {
      if (c.match > 0) {                       // resting on B
        c.x = lerp(c.x, this.tB.x, clamp(dt * 8, 0, 1));
        c.y = lerp(c.y, this.tB.y, clamp(dt * 8, 0, 1));
        c.rot = lerp(c.rot, this.tB.rot, clamp(dt * 8, 0, 1));
      } else {                                 // float home
        c.x = lerp(c.x, this.tA.x, clamp(dt * 4, 0, 1));
        c.y = lerp(c.y, this.tA.y, clamp(dt * 4, 0, 1));
        c.rot = lerp(c.rot, this.tA.rot, clamp(dt * 4, 0, 1));
        if (Math.hypot(c.x - this.tA.x, c.y - this.tA.y) < 2) c.home = true;
      }
    }
    if (c.match > 0 && (c.on || c.home)) c.match = 0;

    // room
    g.fillStyle = "#12100e"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7);
    bg.addColorStop(0, "rgba(120,90,60,0.14)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const drawLegsAndFrame = (tb) => {
      if (this.outline) return;
      const poly = this._poly(tb.x, tb.y, tb.rot);
      // simple legs from the two lowest corners + frame edge
      const sorted = [...poly].sort((a, b) => b[1] - a[1]);
      g.strokeStyle = "#6b4a2f"; g.lineWidth = 5; g.lineCap = "round";
      for (const [lx, ly] of sorted.slice(0, 3)) {
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx, ly + this.legH); g.stroke();
      }
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (const [lx, ly] of sorted.slice(0, 3)) {   // one soft pool per foot
        g.beginPath();
        g.ellipse(lx, ly + this.legH + 4, 10, 3.6, 0, 0, TAU);
        g.fill();
      }
    };
    const drawTop = (x, y, rot, lifted, ghost) => {
      const poly = this._poly(x, y, rot, lifted ? 1.04 : 1);
      if (lifted && !this.outline) {           // hover shadow
        g.fillStyle = "rgba(0,0,0,0.4)";
        g.beginPath();
        const sh = this._poly(x + 10, y + 22, rot, 1.02);
        g.moveTo(sh[0][0], sh[0][1]);
        for (const [px, py] of sh.slice(1)) g.lineTo(px, py);
        g.closePath(); g.fill();
      }
      g.beginPath();
      g.moveTo(poly[0][0], poly[0][1]);
      for (const [px, py] of poly.slice(1)) g.lineTo(px, py);
      g.closePath();
      if (this.outline) {
        g.strokeStyle = ghost ? "rgba(79,195,255,0.9)" : "rgba(235,225,210,0.9)";
        g.lineWidth = 2; g.stroke();
      } else {
        const wood = g.createLinearGradient(x - this.s, y - this.s, x + this.s, y + this.s);
        if (ghost) { wood.addColorStop(0, "#4fa3d8"); wood.addColorStop(1, "#2c6a96"); }
        else { wood.addColorStop(0, "#c89a62"); wood.addColorStop(1, "#8a5f34"); }
        g.fillStyle = wood; g.fill();
        g.strokeStyle = "rgba(30,20,12,0.6)"; g.lineWidth = 2; g.stroke();
      }
    };

    // table B (right) always in place
    drawLegsAndFrame(this.tB);
    drawTop(this.tB.x, this.tB.y, this.tB.rot, false, false);

    // table A: legs stay; the top may be carried
    drawLegsAndFrame(this.tA);
    const carried = c.on || !c.home;
    if (!carried) drawTop(this.tA.x, this.tA.y, this.tA.rot, false, true);
    else {
      if (!this.outline) {                      // legs left bare
        g.font = "11px ui-monospace, Menlo, monospace";
        g.textAlign = "center";
        g.fillStyle = "rgba(220,215,200,0.4)";
        g.fillText("(상판 이동 중)", this.tA.x, this.tA.y);
      }
      drawTop(c.x, c.y, c.rot, true, true);
    }

    // match flash + label
    if (c.match > 0.02 && !c.on) {
      const poly = this._poly(this.tB.x, this.tB.y, this.tB.rot, 1.02);
      g.strokeStyle = `rgba(79,195,255,${0.5 + 0.4 * Math.sin(t * 6)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(poly[0][0], poly[0][1]);
      for (const [px, py] of poly.slice(1)) g.lineTo(px, py);
      g.closePath(); g.stroke();
      g.font = `600 ${Math.max(13, H * 0.022)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center";
      g.fillStyle = "rgba(140,220,255,0.9)";
      g.fillText("완전히 포개졌습니다 — 두 상판은 합동입니다", this.tB.x, this.tB.y - this.s * 1.5);
    }

    // labels + caption
    g.font = `700 ${Math.max(13, this.s * 0.22)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center";
    g.fillStyle = "rgba(235,228,215,0.75)";
    g.fillText("A", this.tA.x, this.tA.y - this.s * 1.45);
    g.fillText("B", this.tB.x, this.tB.y - this.s * 1.45);
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textBaseline = "bottom";
    g.fillStyle = "rgba(210,205,190,0.55)";
    g.fillText(c.match > 0 ? "다른 곳에 놓으면 상판이 제자리로 — 착시도 돌아옵니다"
      : "A 상판을 잡아 B 위로 끌어 보세요 — 같은 모양이라는 걸 손으로 확인하게 됩니다", W / 2, H - 66);
  }

  controls(host) {
    host.appendChild(buttonRow([
      { label: "OUTLINE — 다리 없이", on: (el) => { this.outline = !this.outline; el.classList.toggle("is-active", this.outline); } },
      { label: "제자리로", on: () => { this.carry.home = true; this.carry.on = false; this.carry.match = 0; this._layout(); } },
    ]));
  }
}
