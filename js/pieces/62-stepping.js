// ============================================================================
//  62 · Stepping Feet (발맞추지 못하는 발) — 같은 속도가 번갈아 걷는다 [Canvas2D]
//  Anstis (2003). 흑백 세로 줄무늬 위를 파란 막대와 노란 막대가 정확히 같은
//  등속으로 미끄러진다. 그런데 번갈아 '걷는' 것처럼 보인다 — 한쪽이 멈칫할 때
//  다른 쪽이 성큼. 이유는 대비(contrast)가 지각 속도를 결정하기 때문:
//  어두운 파랑은 검은 줄 위에서 모서리 대비가 죽어 느려 '보이고', 밝은 노랑은
//  흰 줄 위에서 느려 '보인다'. 두 막대는 반 주기 어긋난 위상에 있어 정확히
//  교대로 멈칫한다. 물리 속도는 단 한 순간도 변하지 않는다.
//  · HOLD = PROOF — 줄무늬가 회색으로 녹아 사라지면 두 막대는 자로 잰 듯
//    나란히 함께 미끄러진다(연결봉 표시). 착시가 눈앞에서 죽는다
//  · SPEED / STRIPE 슬라이더 · 클릭 = 막대 색 반전
// ============================================================================

import { Piece, clamp, lerp, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

export default class SteppingFeet extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.speed = 1.0;      // SPEED  — bar velocity
    this.stripeK = 1.0;    // STRIPE — stripe width
    this.pos = 0;          // bar position (px, wraps)
    this.proof = 0;
    this.flip = false;     // click swaps bar colours
    this._downT = 0;
  }

  onPointerDown() { this._downT = performance.now(); }
  onPointerUp() {
    if (performance.now() - this._downT < 260) this.flip = !this.flip;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    const holding = this.pointer.down && this.pointer.active &&
      performance.now() - this._downT >= 260;
    this.proof = clamp(this.proof + (holding ? dt * 5 : -dt * 4), 0, 1);

    const st = Math.max(10, Math.min(W, H) * 0.030 * this.stripeK);   // stripe width
    const period = st * 2;
    // CONSTANT velocity — the whole point. Never eased, never modulated.
    this.pos = (this.pos + dt * Math.min(W, H) * 0.22 * this.speed) % (W + period * 4);

    // ---- ground: stripes ↔ flat grey (proof melts the context away) ---------
    const stripeA = 1 - this.proof;
    g.fillStyle = "#8f8f93"; g.fillRect(0, 0, W, H);
    if (stripeA > 0.01) {
      for (let x = -period; x < W + period; x += period) {
        g.fillStyle = `rgba(10,10,12,${stripeA})`;
        g.fillRect(x, 0, st, H);
        g.fillStyle = `rgba(245,245,242,${stripeA})`;
        g.fillRect(x + st, 0, st, H);
      }
    }

    // ---- the two feet: same x-velocity, antiphase against the stripes -------
    const barW = st * 4, barH = st * 1.5;
    const y1 = H * 0.40 - barH / 2, y2 = H * 0.60 - barH / 2;
    const x1 = ((this.pos) % (W + barW * 2)) - barW;
    const x2 = x1 + st;                      // half a period out of phase
    const cBlue = "#16307e", cYellow = "#f4d33a";
    const [top, bot] = this.flip ? [cYellow, cBlue] : [cBlue, cYellow];
    g.fillStyle = top; g.fillRect(x1, y1, barW, barH);
    g.fillStyle = bot; g.fillRect(x2, y2, barW, barH);

    // ---- PROOF: rigid connecting rod + tick trail ----------------------------
    if (this.proof > 0.02) {
      const a = this.proof;
      g.strokeStyle = `rgba(79,195,255,${0.9 * a})`; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x1 + barW / 2, y1 + barH);
      g.lineTo(x2 + barW / 2, y2);
      g.stroke();
      g.fillStyle = `rgba(20,21,26,${0.85 * a})`;
      g.font = `700 ${Math.max(15, H * 0.026)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("두 막대는 처음부터 완전한 등속·동행이었습니다", W / 2, H * 0.14);
      g.font = `500 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
      g.fillText("줄무늬(문맥)가 사라지면 걸음도 사라집니다 — 놓으면 다시 걷기 시작합니다", W / 2, H * 0.14 + 28);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = this.proof > 0.5 ? "rgba(40,42,48,0.8)" : "rgba(235,235,238,0.85)";
    g.fillText("번갈아 걷는 것처럼 보이나요? 속도는 단 한 순간도 변하지 않습니다 · 꾹 누르면 줄무늬가 사라지며 증명 · 클릭=색 교대 · SPEED/STRIPE", W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("SPEED", 0.3, 2, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(slider("STRIPE", 0.6, 1.8, this.stripeK, 0.05, (v) => (this.stripeK = v)));
  }
}
