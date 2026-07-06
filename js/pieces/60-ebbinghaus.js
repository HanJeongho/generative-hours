// ============================================================================
//  60 · Ebbinghaus (같은 크기) — 문맥이 크기를 결정한다 [Canvas2D]
//  에빙하우스/티치너 원(1890s). 완전히 같은 두 오렌지 원 — 하나는 거대한
//  이웃들에 둘러싸여 작아 보이고, 하나는 자잘한 이웃들에 둘러싸여 커 보인다.
//  크기 지각은 절대 측정이 아니라 상대 비교라는 가장 깨끗한 증거.
//  증명은 65 셰퍼드와 같은 문법 — 손으로 직접:
//  · 왼쪽 오렌지 원을 잡아 끌면 이웃들에게서 분리되어 손을 따라오고,
//    오른쪽 원 위에 놓으면 — 소름 돋게 정확히 — 포개진다. 같은 원이었다.
//  · 다른 곳에 놓으면 제자리로 부유 귀환, 착시도 돌아온다.
//  · SURROUND 슬라이더 — 이웃들 크기 대비를 조절 (1에서 최강, 0.5에서 소멸)
//  · HOLD = 두 원 밑에 같은 눈금자 두 개가 깔린다
// ============================================================================

import { Piece, clamp, lerp, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

const BG = "#f2f3f5";
const ORANGE = "#ff7a2f";
const GREYC = "#a9adb6";

export default class Ebbinghaus extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.surround = 1.0;   // SURROUND — context-size contrast
    this.carry = { on: false, x: 0, y: 0, home: true, match: 0 };
    this.proof = 0;
    this._layout();
  }
  onResize() { this._layout(); }
  _layout() {
    const W = this.w, H = this.h;
    this.R = Math.min(W, H) * 0.058;                 // THE radius (both targets)
    this.L = { x: W * 0.40, y: H * 0.50 };           // ringed by giants → looks small
    this.Rt = { x: W * 0.73, y: H * 0.50 };          // ringed by dots  → looks big
  }

  onPointerDown() {
    const d = Math.hypot(this.pointer.x - this.L.x, this.pointer.y - this.L.y);
    if (d < this.R * 1.4) {
      this.carry.on = true; this.carry.home = false;
      this.carry.x = this.L.x; this.carry.y = this.L.y;
    } else this._still = true;
  }
  onPointerUp() {
    this._still = false;
    if (!this.carry.on) return;
    this.carry.on = false;
    const nearB = Math.hypot(this.carry.x - this.Rt.x, this.carry.y - this.Rt.y) < this.R * 1.6;
    if (nearB) this.carry.match = 1;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const R = this.R;

    const c = this.carry;
    if (c.on && this.pointer.down) { c.x = this.pointer.x; c.y = this.pointer.y; }
    else if (!c.home) {
      if (c.match > 0) {
        c.x = lerp(c.x, this.Rt.x, clamp(dt * 8, 0, 1));
        c.y = lerp(c.y, this.Rt.y, clamp(dt * 8, 0, 1));
      } else {
        c.x = lerp(c.x, this.L.x, clamp(dt * 4, 0, 1));
        c.y = lerp(c.y, this.L.y, clamp(dt * 4, 0, 1));
        if (Math.hypot(c.x - this.L.x, c.y - this.L.y) < 2) c.home = true;
      }
    }
    if (c.match > 0 && (c.on || c.home)) c.match = 0;
    this.proof = clamp(this.proof + (this._still && this.pointer.down ? dt * 5 : -dt * 4), 0, 1);

    g.fillStyle = BG; g.fillRect(0, 0, W, H);

    // ---- context rings --------------------------------------------------------
    const k = this.surround;
    g.fillStyle = GREYC;
    // giants around the LEFT target (6 × big)
    const bigR = R * lerp(1.0, 2.05, k), bigD = R + bigR + R * 0.55;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU;
      g.beginPath();
      g.arc(this.L.x + Math.cos(a) * bigD, this.L.y + Math.sin(a) * bigD, bigR, 0, TAU);
      g.fill();
    }
    // dots around the RIGHT target (10 × small)
    const smR = R * lerp(1.0, 0.38, k), smD = R + smR + R * 0.3;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      g.beginPath();
      g.arc(this.Rt.x + Math.cos(a) * smD, this.Rt.y + Math.sin(a) * smD, smR, 0, TAU);
      g.fill();
    }

    // ---- the two identical targets --------------------------------------------
    const drawTarget = (x, y, ghost) => {
      g.fillStyle = ORANGE;
      g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
      if (ghost) {
        g.strokeStyle = "rgba(40,40,46,0.5)"; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
      }
    };
    drawTarget(this.Rt.x, this.Rt.y, false);
    const carried = c.on || !c.home;
    if (!carried) drawTarget(this.L.x, this.L.y, false);
    else {
      g.strokeStyle = "rgba(120,124,134,0.6)"; g.setLineDash([4, 5]);
      g.beginPath(); g.arc(this.L.x, this.L.y, R, 0, TAU); g.stroke();
      g.setLineDash([]);
      drawTarget(c.x, c.y, true);
    }

    // match flash — perfectly coincident circles
    if (c.match > 0.02 && !c.on) {
      g.strokeStyle = `rgba(79,195,255,${0.55 + 0.35 * Math.sin(t * 6)})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(this.Rt.x, this.Rt.y, R + 4, 0, TAU); g.stroke();
      g.font = `600 ${Math.max(13, H * 0.022)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center";
      g.fillStyle = "rgba(30,110,180,0.95)";
      g.fillText("완전히 포개졌습니다 — 두 원은 같은 크기입니다", this.Rt.x, this.Rt.y - R * 2.6);
    }

    // hold = twin rulers under both targets
    if (this.proof > 0.02) {
      const a = this.proof;
      g.strokeStyle = `rgba(40,42,48,${0.8 * a})`; g.lineWidth = 1.5;
      g.fillStyle = `rgba(40,42,48,${0.85 * a})`;
      g.font = "600 11px ui-monospace, Menlo, monospace";
      g.textAlign = "center"; g.textBaseline = "top";
      for (const p of [this.L, this.Rt]) {
        const y = p.y + R * 2.9;
        g.beginPath(); g.moveTo(p.x - R, y); g.lineTo(p.x + R, y); g.stroke();
        for (const s of [-1, 0, 1]) {
          g.beginPath(); g.moveTo(p.x + s * R, y - 5); g.lineTo(p.x + s * R, y + 5); g.stroke();
        }
        g.fillText(`지름 ${Math.round(R * 2)}px`, p.x, y + 8);
      }
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(90,92,100,0.8)";
    g.fillText(
      c.match > 0 ? "다른 곳에 놓으면 원이 제자리로 — 착시도 돌아옵니다"
        : "두 오렌지 원, 어느 쪽이 큰가요? 왼쪽 원을 잡아 오른쪽 위로 끌어 보세요 · 빈 곳을 꾹 누르면 눈금자",
      W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("SURROUND", 0.4, 1.3, this.surround, 0.05, (v) => (this.surround = v)));
  }
}
