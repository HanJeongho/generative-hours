// ============================================================================
//  66 · Café Wall (카페 월) — 완전한 수평선이 비탈로 보인다 [Canvas2D]
//  Gregory & Heard (1979)가 브리스틀의 카페 타일벽에서 발견한 고전. 검고 흰
//  타일 행들이 반 칸씩 어긋나 있고, 행 사이에 중간 밝기의 회색 모르타르 줄눈이
//  지나가면 — 모든 줄눈은 완전한 평행 수평선인데도 쐐기처럼 기울어 보인다.
//  망막의 명암 경계 처리(border locking)가 타일 모서리의 대비를 줄눈 위치로
//  잘못 끌어와 생기는 오류로, 줄눈이 검정/흰색이 되면(대비 극단) 착시가 죽고,
//  타일과 비슷한 중간 회색일 때 가장 강하다 — MORTAR 슬라이더로 직접 확인.
//  SHIFT는 행 오프셋(0 = 체스판, 반 칸 = 최강), TILE은 타일 크기.
//  이미지는 오프스크린에 1회 베이크 — 단 한 픽셀도 움직이지 않는다.
//  HOLD = PROOF: 모든 줄눈 위에 시안 직선 자를 얹어 평행함을 증명.
//  호버 = 커서가 가리키는 줄눈 하나에만 살짝 자를 대 본다.
// ============================================================================

import { Piece, clamp, lerp, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

export default class CafeWall extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.mortar = 0.5;    // MORTAR — 줄눈 밝기 0(검정)..1(흰색), 0.5가 최강
    this.shift = 0.5;     // SHIFT  — 행 오프셋 (타일 폭 대비 비율)
    this.tile = 1.0;      // TILE   — 타일 크기 배율
    this.proof = 0;
    this._render();
  }
  onResize() { this._render(); }
  onPointerDown() { this._downT = performance.now(); }

  // bake the STATIC image — every frame is byte-identical
  _render() {
    const W = Math.max(2, this.w), H = Math.max(2, this.h);
    const off = document.createElement("canvas");
    off.width = Math.round(W * this.dpr); off.height = Math.round(H * this.dpr);
    const g = off.getContext("2d");
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const ts = Math.max(20, Math.min(W, H) * 0.068) * this.tile;   // tile size
    const mth = Math.max(1.5, ts * 0.05);                          // mortar line — thin!
    const mv = Math.round(this.mortar * 255);
    const mortarCol = `rgb(${mv},${mv},${mv})`;

    // the whole wall is mortar; tiles sit on top, leaving the joints exposed
    g.fillStyle = mortarCol;
    g.fillRect(0, 0, W, H);

    const rowH = ts + mth;
    this.rowH = rowH; this.mth = mth; this.ts = ts;
    this.rows = Math.ceil(H / rowH) + 1;
    for (let r = 0; r < this.rows; r++) {
      const y = r * rowH;
      // classic café wall: alternate rows slide by SHIFT × tile width
      const off_ = (r % 2) * this.shift * ts;
      for (let x = -ts * 2 + off_; x < W + ts; x += ts * 2) {
        g.fillStyle = "#0d0d10";
        g.fillRect(x, y, ts, ts);
        g.fillStyle = "#f2f2ee";
        g.fillRect(x + ts, y, ts, ts);
      }
    }
    this.baked = off;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    if (this.baked) g.drawImage(this.baked, 0, 0, W, H);

    // hover: lay a straightedge on the joint the cursor points at
    const holding = this.pointer.down && this.pointer.active;
    this.proof = clamp(this.proof + (holding ? dt * 5 : -dt * 4), 0, 1);

    if (this.pointer.active && this.proof < 0.5 && this.rowH) {
      const r = Math.round(this.pointer.y / this.rowH);
      const y = r * this.rowH - this.mth / 2;
      if (y > 4 && y < H - 4) {
        g.strokeStyle = "rgba(79,195,255,0.85)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        g.fillStyle = "rgba(79,195,255,0.9)";
        g.font = "600 11px ui-monospace, Menlo, monospace";
        g.textAlign = "left"; g.textBaseline = "bottom";
        g.fillText("완전한 수평 · 기울기 0.000°", 14, y - 5);
      }
    }

    // hold = PROOF: a ruler on EVERY joint at once
    if (this.proof > 0.02 && this.rowH) {
      const a = this.proof;
      g.strokeStyle = `rgba(79,195,255,${0.8 * a})`; g.lineWidth = 1.5;
      g.beginPath();
      for (let r = 1; r < this.rows; r++) {
        const y = r * this.rowH - this.mth / 2;
        if (y < H) { g.moveTo(0, y); g.lineTo(W, y); }
      }
      g.stroke();
      g.fillStyle = `rgba(10,10,14,${0.55 * a})`;
      g.fillRect(0, H * 0.5 - 44, W, 88);
      g.fillStyle = `rgba(248,248,244,${0.9 * a})`;
      g.font = `700 ${Math.max(16, H * 0.03)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("모든 줄눈은 완전한 평행 수평선입니다", W / 2, H * 0.5 - 12);
      g.font = `500 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
      g.fillText("자에 대 보세요 — 놓는 순간 다시 기울어질 겁니다", W / 2, H * 0.5 + 18);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = this.mortar > 0.85 || this.mortar < 0.15
      ? "rgba(140,200,255,0.85)" : "rgba(120,126,140,0.75)";
    g.fillText(
      this.mortar > 0.85 || this.mortar < 0.15
        ? "줄눈이 타일과 한몸이 되면 착시가 죽습니다 — MORTAR를 중간으로"
        : "기울어 보이나요? 꾹 눌러 증명을 보세요",
      W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("MORTAR", 0, 1, this.mortar, 0.01, (v) => { this.mortar = v; this._render(); }));
    host.appendChild(slider("SHIFT", 0, 0.5, this.shift, 0.01, (v) => { this.shift = v; this._render(); }));
    host.appendChild(slider("TILE", 0.6, 1.8, this.tile, 0.05, (v) => { this.tile = v; this._render(); }));
  }
}
