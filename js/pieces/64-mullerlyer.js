// ============================================================================
//  64 · Müller-Lyer Lab (뮐러-라이어 실험실) — your bias, in numbers [Canvas2D]
//  Not a demo — an EXPERIMENT (method of adjustment, 1889 stimulus). The
//  reference line wears outward fins (>—<); yours wears inward fins (<—>).
//  Drag the handle until the two SHAFTS look equal, press 판정 — the true
//  lengths flash, your signed error lands on a strip chart, and the running
//  mean of your bias updates. Each trial randomises the reference length so
//  you can't muscle-memorise. PONZO mode swaps the stimulus for converging
//  rails with two horizontal bars — same task, different lie. Typical adult
//  bias on Müller-Lyer: 15–25% overshoot. The point isn't that you're wrong;
//  it's that you're consistently, measurably, incorrigibly wrong.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class MullerLyer extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.mode = "muller";     // muller | ponzo
    this.trials = [];         // signed % errors
    this.reveal = 0;          // post-judgement reveal envelope
    this._newTrial();
  }
  onResize() {}

  _newTrial() {
    this.refLen = Math.min(this.w, this.h) * rand(0.26, 0.40);
    this.myLen = this.refLen * rand(0.62, 0.8);   // start clearly short
    this.judged = false;
    this.reveal = 0;
    this._drag = false;
  }

  _geom() {
    const W = this.w, H = this.h;
    if (this.mode === "muller") {
      return {
        refY: H * 0.34, myY: H * 0.58,
        cx: W * 0.5, fin: Math.min(W, H) * 0.045,
      };
    }
    return { refY: H * 0.30, myY: H * 0.56, cx: W * 0.5, fin: 0 };
  }

  onPointerDown() {
    const gme = this._geom();
    const hx = gme.cx + this.myLen / 2;
    if (Math.hypot(this.pointer.x - hx, this.pointer.y - gme.myY) < 40) this._drag = true;
  }
  onPointerUp() { this._drag = false; }

  _judge() {
    if (this.judged) return;
    this.judged = true;
    this.reveal = 1;
    const err = ((this.myLen - this.refLen) / this.refLen) * 100;
    this.trials.push(err);
    if (this.trials.length > 12) this.trials.shift();
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const gme = this._geom();

    if (this._drag && this.pointer.down && !this.judged) {
      this.myLen = clamp((this.pointer.x - gme.cx) * 2, W * 0.08, W * 0.8);
    }
    this.reveal = Math.max(0, this.reveal - dt * 0.35);

    // stage
    g.fillStyle = "#101318"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.65);
    bg.addColorStop(0, "rgba(70,90,120,0.12)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const shaft = (y, len, finDir, col, lw) => {
      const x0 = gme.cx - len / 2, x1 = gme.cx + len / 2;
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      if (this.mode === "muller") {
        const f = gme.fin;
        for (const [x, s] of [[x0, -1], [x1, 1]]) {
          for (const vy of [-1, 1]) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + s * finDir * f, y + vy * f);
            g.stroke();
          }
        }
      }
    };

    if (this.mode === "ponzo") {
      // converging rails + sleepers
      g.strokeStyle = "rgba(160,170,190,0.5)"; g.lineWidth = 3;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(gme.cx + s * W * 0.30, H * 0.78);
        g.lineTo(gme.cx + s * W * 0.055, H * 0.16);
        g.stroke();
      }
      g.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const yy = lerp(H * 0.76, H * 0.2, i / 6);
        const half = lerp(W * 0.28, W * 0.06, i / 6);
        g.beginPath(); g.moveTo(gme.cx - half, yy); g.lineTo(gme.cx + half, yy); g.stroke();
      }
    }

    // reference (top) & adjustable (bottom)
    shaft(gme.refY, this.refLen, 1, "#e8ecf4", 4);              // fins OUT (looks long)
    shaft(gme.myY, this.myLen, -1, "#4fc3ff", 4);               // fins IN  (looks short)

    // drag handle
    const hx = gme.cx + this.myLen / 2;
    g.fillStyle = this._drag ? "#ffffff" : "rgba(79,195,255,0.9)";
    g.beginPath(); g.arc(hx, gme.myY, 9, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 2;
    g.beginPath(); g.arc(hx, gme.myY, 14, 0, TAU); g.stroke();

    // reveal: true extents drop as plumb lines
    if (this.reveal > 0.02) {
      const a = Math.min(1, this.reveal * 2);
      g.strokeStyle = `rgba(255,210,90,${0.85 * a})`; g.lineWidth = 1.5;
      g.setLineDash([4, 4]);
      for (const s of [-1, 1]) {
        const x = gme.cx + s * this.refLen / 2;
        g.beginPath(); g.moveTo(x, gme.refY - 30); g.lineTo(x, gme.myY + 30); g.stroke();
      }
      g.setLineDash([]);
      const err = ((this.myLen - this.refLen) / this.refLen) * 100;
      g.font = `700 ${Math.max(18, H * 0.035)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = `rgba(255,210,90,${a})`;
      g.fillText(`${err > 0 ? "+" : ""}${err.toFixed(1)}%`, gme.cx, (gme.refY + gme.myY) / 2);
    }

    // strip chart of trials + mean
    if (this.trials.length) {
      const cw = Math.min(340, W * 0.34), x0 = W - cw - 24, y0 = 26, chH = 74;
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.fillRect(x0, y0, cw, chH);
      g.strokeStyle = "rgba(200,210,225,0.3)";
      g.beginPath(); g.moveTo(x0, y0 + chH / 2); g.lineTo(x0 + cw, y0 + chH / 2); g.stroke();
      const mean = this.trials.reduce((a, b) => a + b, 0) / this.trials.length;
      g.fillStyle = "rgba(79,195,255,0.9)";
      this.trials.forEach((e, i) => {
        const x = x0 + ((i + 0.5) / this.trials.length) * cw;
        const y = y0 + chH / 2 - clamp(e, -40, 40) / 40 * (chH / 2 - 4);
        g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
      });
      g.strokeStyle = "rgba(255,210,90,0.8)";
      const my = y0 + chH / 2 - clamp(mean, -40, 40) / 40 * (chH / 2 - 4);
      g.beginPath(); g.moveTo(x0, my); g.lineTo(x0 + cw, my); g.stroke();
      g.font = "11px ui-monospace, Menlo, monospace";
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = "rgba(220,226,238,0.7)";
      g.fillText(`시행 ${this.trials.length} · 평균 편향 ${mean > 0 ? "+" : ""}${mean.toFixed(1)}%  (0이 정답)`, x0, y0 + chH + 6);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(200,206,220,0.55)";
    g.fillText(this.judged
      ? "다음 시행으로 — 참조 길이는 매번 바뀝니다"
      : "핸들을 끌어 두 선의 몸통 길이를 같게 맞춘 뒤 [판정]을 누르세요", W / 2, H - 66);
  }

  controls(host) {
    host.appendChild(buttonRow([
      { label: "판정", on: () => this._judge() },
      { label: "다음 시행", on: () => this._newTrial() },
      { label: "기록 초기화", on: () => { this.trials = []; this._newTrial(); } },
    ]));
    const modeRow = buttonRow([
      { label: "뮐러-라이어", on: (el) => this._setMode("muller", el) },
      { label: "폰조 (기찻길)", on: (el) => this._setMode("ponzo", el) },
    ]);
    modeRow.querySelectorAll(".ctrl__btn")[0].classList.add("is-active");
    host.appendChild(modeRow);
  }
  _setMode(m, el) {
    this.mode = m; this._newTrial();
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
