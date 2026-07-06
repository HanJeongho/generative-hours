// ============================================================================
//  61 · Lilac Chaser (라일락 체이서) — 화면에 없는 초록 점 [Canvas2D]
//  Hinton (2005). 회색 바탕 위 라일락 블롭 12개가 원형으로 놓이고, 빈자리
//  하나가 시계방향으로 돈다. 중앙 십자를 응시하면 3단계 마법이 일어난다:
//  ① 빈자리가 도는 것으로 보이다가 ② 그 자리에 초록 점이 나타나 돌기 시작하고
//  ③ 이윽고 라일락 점들이 전부 사라지고 초록 점 혼자 회전한다.
//  초록은 라일락의 보색 잔상(음성 잔상)이고, 사라짐은 트록슬러 소실 —
//  고정된 시선 주변부의 변하지 않는 자극을 망막이 '배경'으로 지워버리는 현상.
//  화면이 그리는 것은 오직 라일락 11개뿐이다. 초록 점은 당신의 망막이 그린다.
//  · 시선을 움직이면 모든 것이 리셋 — 그것이 증명이다
//  · HOLD = 빈자리 정지 + 12개 전부 표시("전부 여기 있었습니다")
//  · 클릭 = 새 색상(잔상은 언제나 그 보색으로 온다) · SPEED/SIZE 슬라이더
// ============================================================================

import { Piece, clamp, TAU, hexToRgb } from "../engine.js";
import { slider } from "./01-currents.js";

const HUES = [
  { name: "lilac", rgb: [220, 130, 255] },
  { name: "rose", rgb: [255, 120, 150] },
  { name: "sky", rgb: [110, 180, 255] },
  { name: "amber", rgb: [255, 170, 80] },
];

export default class LilacChaser extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.speed = 1.0;      // SPEED — gap steps/sec multiplier (base 8Hz)
    this.size = 1.0;       // SIZE  — blob radius
    this.hueIdx = 0;
    this.gap = 0;
    this._acc = 0;
    this.proof = 0;
    this._downT = 0;
    this._makeSprite();
  }

  _makeSprite() {
    const [r, g_, b] = HUES[this.hueIdx].rgb;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, `rgba(${r},${g_},${b},0.9)`);
    rg.addColorStop(0.45, `rgba(${r},${g_},${b},0.55)`);
    rg.addColorStop(1, `rgba(${r},${g_},${b},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    this.sprite = c;
  }

  onPointerDown() { this._downT = performance.now(); }
  onPointerUp() {
    if (performance.now() - this._downT < 260) {       // tap = next hue
      this.hueIdx = (this.hueIdx + 1) % HUES.length;
      this._makeSprite();
    }
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    const holding = this.pointer.down && this.pointer.active &&
      performance.now() - this._downT >= 260;
    this.proof = clamp(this.proof + (holding ? dt * 5 : -dt * 4), 0, 1);

    // gap advances at ~8 steps/sec (the canonical tempo), paused in proof
    if (this.proof < 0.5) {
      this._acc += dt * 8 * this.speed;
      while (this._acc >= 1) { this._acc -= 1; this.gap = (this.gap + 1) % 12; }
    }

    // the exact canonical ground: flat mid grey — afterimages need a quiet stage
    g.fillStyle = "#9b9b9f"; g.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const ringR = Math.min(W, H) * 0.30;
    const blobR = Math.min(W, H) * 0.062 * this.size;

    for (let i = 0; i < 12; i++) {
      if (i === this.gap && this.proof < 0.5) continue;    // the hole that runs
      const a = -Math.PI / 2 + (i / 12) * TAU;
      const x = cx + Math.cos(a) * ringR, y = cy + Math.sin(a) * ringR;
      g.globalAlpha = i === this.gap ? this.proof : 1;     // proof reveals the 12th
      g.drawImage(this.sprite, x - blobR, y - blobR, blobR * 2, blobR * 2);
    }
    g.globalAlpha = 1;

    // fixation cross — the whole piece hinges on it
    g.strokeStyle = "#2b2b30"; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx - 9, cy); g.lineTo(cx + 9, cy);
    g.moveTo(cx, cy - 9); g.lineTo(cx, cy + 9);
    g.stroke();

    if (this.proof > 0.02) {
      g.fillStyle = `rgba(20,21,26,${0.8 * this.proof})`;
      g.font = `700 ${Math.max(15, H * 0.026)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("12개는 늘 전부 여기 있었습니다", W / 2, H * 0.12);
      g.font = `500 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
      g.fillText("초록 점은 화면에 그려진 적 없습니다 — 당신의 망막이 그렸습니다", W / 2, H * 0.12 + 28);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(58,58,64,0.85)";
    g.fillText("가운데 십자만 응시하세요 — 초록 점이 나타나고, 이윽고 보라 점들이 사라집니다 · 시선을 움직이면 리셋 · 클릭=색 변경 · 꾹=진실", W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("SPEED", 0.4, 2, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(slider("SIZE", 0.6, 1.6, this.size, 0.05, (v) => (this.size = v)));
  }
}
