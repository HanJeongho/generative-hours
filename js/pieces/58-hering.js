// ============================================================================
//  58 · Hering Rails (헤링의 곡선) — 완전한 직선이 활처럼 휜다 [Canvas2D]
//  Hering (1861). 소실점에서 뻗는 방사선 다발 위에 수직 평행선 두 개를 얹으면,
//  두 직선이 소실점 반대쪽으로 불룩하게 휘어 보인다 — 뇌가 방사선을 '원근'으로
//  읽고 교차각을 과대평가해 깊이 보정을 하기 때문. 사용자의 블로그 레퍼런스
//  ("휜 것처럼 보이는데 직선") 바로 그 착시.
//  인터랙션:
//  · 드래그 — 소실점을 옮긴다. 휘어 보이는 방향이 소실점을 따라 실시간으로 변함
//  · CURVE 슬라이더 — 빨간 선에 실제 곡률을 준다. "곧아 보일 때까지" 안쪽으로
//    휘어 보라 (조정법): 꾹 누르면 방사선이 사라지며 실제 휨이 px로 공개된다
//  · HOLD = PROOF — 방사선 페이드아웃, 직선 + 기준자만 남는다
//  · RAYS 슬라이더 — 방사선 밀도(밀할수록 강함)
//  매 프레임 같은 그림을 다시 그릴 뿐, 아무것도 움직이지 않는다.
// ============================================================================

import { Piece, clamp, lerp, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

const BG = "#f5f5f2";
const INK = "#26262b";
const RED = "#d43b2f";

export default class Hering extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.rays = 34;        // RAYS slider
    this.curve = 0;        // CURVE slider — real bow applied to the red lines (px, + = outward)
    this.proof = 0;
    this.vx = 0.5; this.vy = 0.5;      // vanishing point (normalised)
  }

  onPointerDown() { this._drag = true; }
  onPointerUp() { this._drag = false; }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // drag with sustained hold = proof; a moving drag steers the vanishing point
    const holding = this.pointer.down && this.pointer.active;
    if (holding && (Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 8 || this._moved)) {
      this._moved = true;
      this.vx = clamp(this.pointer.x / W, 0.08, 0.92);
      this.vy = clamp(this.pointer.y / H, 0.08, 0.92);
    }
    if (!holding) this._moved = false;
    const still = holding && !this._moved;
    this.proof = clamp(this.proof + (still ? dt * 5 : -dt * 4), 0, 1);

    g.fillStyle = BG; g.fillRect(0, 0, W, H);

    // ---- the ray fan (fades out in proof mode) ------------------------------
    const vpx = this.vx * W, vpy = this.vy * H;
    const rayA = (1 - this.proof) * 0.85;
    if (rayA > 0.01) {
      g.strokeStyle = `rgba(38,38,43,${rayA})`;
      g.lineWidth = 1.2;
      const RR = Math.hypot(W, H);
      g.beginPath();
      for (let i = 0; i < this.rays; i++) {
        const a = (i / this.rays) * TAU;
        g.moveTo(vpx, vpy);
        g.lineTo(vpx + Math.cos(a) * RR, vpy + Math.sin(a) * RR);
      }
      g.stroke();
    }

    // ---- the two RED lines: dead straight unless YOU bow them ---------------
    const off = Math.min(W, H) * 0.21;
    g.strokeStyle = RED;
    g.lineWidth = Math.max(3, Math.min(W, H) * 0.007);
    g.lineCap = "round";
    for (const side of [-1, 1]) {
      const x0 = vpx + side * off;
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const y = H * 0.06 + (H * 0.88) * (i / 48);
        const u = (y - vpy) / (H * 0.5);                  // 0 at VP height
        const bow = this.curve * side * Math.max(0, 1 - u * u);   // + bows outward
        const x = x0 + bow;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    // ---- PROOF: rulers + the honest number -----------------------------------
    if (this.proof > 0.02) {
      const a = this.proof;
      g.strokeStyle = `rgba(79,195,255,${0.75 * a})`;
      g.lineWidth = 1.5; g.setLineDash([6, 6]);
      for (const side of [-1, 1]) {
        const x0 = vpx + side * off;
        g.beginPath(); g.moveTo(x0, H * 0.06); g.lineTo(x0, H * 0.94); g.stroke();
      }
      g.setLineDash([]);
      g.fillStyle = `rgba(20,21,26,${0.85 * a})`;
      g.font = `700 ${Math.max(15, H * 0.026)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(
        Math.abs(this.curve) < 0.5
          ? "실제 휨 0px — 두 선은 완전한 직선입니다"
          : `실제 휨 ${this.curve > 0 ? "+" : ""}${this.curve.toFixed(0)}px — 점선 자와 비교해 보세요`,
        W / 2, H * 0.06 + 24);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(90,92,100,0.8)";
    g.fillText(
      Math.abs(this.curve) < 0.5
        ? "빨간 두 선, 휘어 보이나요? 드래그로 소실점 이동 · CURVE로 곧아 보이게 맞춘 뒤 · 꾹 눌러 정답 확인"
        : "이제 곧아 보이나요? 꾹 눌러 보세요 — 얼마나 휘게 만들었는지 나옵니다",
      W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("CURVE", -30, 30, this.curve, 1, (v) => (this.curve = v)));
    host.appendChild(slider("RAYS", 10, 64, this.rays, 2, (v) => (this.rays = v)));
  }
}
