// ============================================================================
//  55 · Afterimage (잔상) — the canvas is your retina  [Canvas2D]
//  Negative-afterimage laboratory. Two modes:
//  GALLERY — a cycle of hidden pictures (a heart, a star, the CURRENT TIME,
//  a butterfly…) shown as saturated COMPLEMENTARY-colour fields around a
//  pulsing fixation dot. Stare ~15s (a countdown ring closes), then the
//  screen snaps to neutral grey: the photoreceptors you fatigued now under-
//  report, and the picture appears in its TRUE colours — on your retina only.
//  A soft reveal follows, then the next round.
//  DRAW — you paint saturated cyan/magenta strokes yourself; press FLASH (or
//  wait) and meet the afterimage of your own drawing in complementary red/
//  green. The one image in this exhibition no screenshot can capture.
//  Design: colours pushed to full saturation for maximal cone fatigue; the
//  fixation dot never moves (afterimages smear if the eye wanders); stare
//  phase dims everything else so nothing steals fixation.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// stimulus / true-colour pairs (complements)
const INK = { cyan: "#00c8ff", red: "#ff3722", green: "#19d84f", magenta: "#ff2ad2", yellow: "#ffd400", blue: "#2a51ff" };
const COMP = { cyan: "red", red: "cyan", green: "magenta", magenta: "green", yellow: "blue", blue: "yellow" };

export default class Afterimage extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.gazeTime = 15;      // GAZE TIME slider (seconds)
    this.mode = "gallery";   // gallery | draw

    this.phase = "stare";    // stare → blank → reveal
    this.phaseT = 0;
    this.figIdx = 0;

    // draw mode state
    this.strokes = [];       // {pts:[[x,y]..], ink}
    this._curStroke = null;
    this.drawInk = "cyan";

    this._buildFigure();
  }

  // ---- gallery figures: drawn INVERTED (complement), revealed true ----------
  _figures() {
    return [
      { name: "심장", draw: (g, W, H, col) => {          // a heart
          g.fillStyle = col;
          const cx = W / 2, cy = H * 0.46, s = Math.min(W, H) * 0.23;
          g.beginPath();
          g.moveTo(cx, cy + s * 0.9);
          g.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.35);
          g.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
          g.fill();
        }, ink: "green" },                                // shows RED in your eye
      { name: "지금 이 시각", draw: (g, W, H, col) => {   // the current time
          const d = new Date();
          const pad = (n) => String(n).padStart(2, "0");
          g.fillStyle = col;
          g.font = `900 ${Math.min(W * 0.16, H * 0.3)}px ui-monospace, Menlo, monospace`;
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}`, W / 2, H * 0.46);
        }, ink: "blue" },                                 // shows YELLOW
      { name: "별", draw: (g, W, H, col) => {             // a star
          g.fillStyle = col;
          const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.26, r = R * 0.42;
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i / 10) * TAU;
            const rr = i % 2 === 0 ? R : r;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.closePath(); g.fill();
        }, ink: "magenta" },                              // shows GREEN
      { name: "나비", draw: (g, W, H, col) => {           // a butterfly
          g.fillStyle = col;
          const cx = W / 2, cy = H * 0.46, s = Math.min(W, H) * 0.20;
          for (const sx of [-1, 1]) {
            g.beginPath();
            g.ellipse(cx + sx * s * 0.75, cy - s * 0.42, s * 0.72, s * 0.55, sx * 0.5, 0, TAU);
            g.fill();
            g.beginPath();
            g.ellipse(cx + sx * s * 0.6, cy + s * 0.45, s * 0.5, s * 0.42, sx * -0.4, 0, TAU);
            g.fill();
          }
          g.fillRect(cx - s * 0.06, cy - s * 0.75, s * 0.12, s * 1.5);
        }, ink: "red" },                                  // shows CYAN
    ];
  }
  _buildFigure() { this.fig = this._figures()[this.figIdx % 4]; }

  onPointerDown() {
    if (this.mode === "draw") {
      if (this.phase !== "stare") { this._setPhase("stare"); return; }
      this._curStroke = { pts: [[this.pointer.x, this.pointer.y]], ink: this.drawInk };
      this.strokes.push(this._curStroke);
    } else {
      // click advances the phase
      if (this.phase === "stare") this._setPhase("blank");
      else if (this.phase === "blank") this._setPhase("reveal");
      else { this.figIdx++; this._buildFigure(); this._setPhase("stare"); }
    }
  }
  onPointerUp() { this._curStroke = null; }

  _setPhase(p) { this.phase = p; this.phaseT = 0; }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    this.phaseT += dt;

    // draw-mode stroke capture
    if (this.mode === "draw" && this._curStroke && this.pointer.down) {
      const pts = this._curStroke.pts, last = pts[pts.length - 1];
      if (Math.hypot(this.pointer.x - last[0], this.pointer.y - last[1]) > 4)
        pts.push([this.pointer.x, this.pointer.y]);
    }

    // phase auto-advance
    const stareDur = this.mode === "draw" ? 999 : this.gazeTime;  // draw: manual flash
    if (this.phase === "stare" && this.phaseT >= stareDur) this._setPhase("blank");
    if (this.phase === "blank" && this.phaseT >= 6) this._setPhase(this.mode === "draw" ? "stare" : "reveal");
    if (this.phase === "reveal" && this.phaseT >= 4) { this.figIdx++; this._buildFigure(); this._setPhase("stare"); }

    // ---- render by phase -----------------------------------------------------
    if (this.phase === "stare") {
      g.fillStyle = "#101014"; g.fillRect(0, 0, W, H);
      if (this.mode === "gallery") {
        this.fig.draw(g, W, H, INK[this.fig.ink]);
      } else {
        for (const st of this.strokes) this._stroke(g, st, INK[st.ink], 26);
      }
      // countdown ring around the fixation dot
      if (this.mode === "gallery") {
        const p = clamp(this.phaseT / stareDur, 0, 1);
        g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 2;
        g.beginPath(); g.arc(W / 2, H * 0.46, 17, -Math.PI / 2, -Math.PI / 2 + p * TAU); g.stroke();
      }
      this._fixation(g, W, H, t, "#ffffff");
      this._caption(g, W, H, this.mode === "gallery"
        ? "점만 응시하세요 — 눈을 움직이면 잔상이 번집니다"
        : "그린 다음, 점을 15초 응시하고 클릭(FLASH)하세요");
    } else if (this.phase === "blank") {
      // neutral grey: the afterimage lives HERE, on your retina
      g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, W, H);
      this._fixation(g, W, H, t, "#3a3a3a");
      this._caption(g, W, H, "지금 보이는 색은 화면에 없습니다 — 깜빡이면 더 선명해집니다", "#3c3c3c");
    } else {
      // reveal: what it was, in its true colour (what your retina just showed you)
      g.fillStyle = "#101014"; g.fillRect(0, 0, W, H);
      const a = clamp(this.phaseT / 0.8, 0, 1);
      g.globalAlpha = a * 0.9;
      this.fig.draw(g, W, H, INK[COMP[this.fig.ink]]);
      g.globalAlpha = 1;
      this._caption(g, W, H, `방금 당신의 눈이 만든 색 — ${this.fig.name}`);
    }
  }

  _stroke(g, st, col, w) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    const p = st.pts;
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    g.stroke();
  }
  _fixation(g, W, H, t, col) {
    const r = 4.5 + Math.sin(t * 2.4) * 0.8;
    g.fillStyle = col;
    g.beginPath(); g.arc(W / 2, H * 0.46, r, 0, TAU); g.fill();
  }
  _caption(g, W, H, txt, col = "rgba(200,195,220,0.55)") {
    g.font = `500 ${Math.max(12, H * 0.02)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = col;
    g.fillText(txt, W / 2, H - 66);
  }

  controls(host) {
    host.appendChild(slider("GAZE TIME", 8, 25, this.gazeTime, 1, (v) => (this.gazeTime = v)));
    const modeRow = buttonRow([
      { label: "갤러리", on: (el) => this._setMode("gallery", el) },
      { label: "드로우", on: (el) => this._setMode("draw", el) },
    ]);
    modeRow.querySelectorAll(".ctrl__btn")[this.mode === "draw" ? 1 : 0].classList.add("is-active");
    host.appendChild(modeRow);
    const inkRow = buttonRow([
      { label: "CYAN", on: (el) => this._setInk("cyan", el) },
      { label: "MAGENTA", on: (el) => this._setInk("magenta", el) },
      { label: "FLASH", on: () => { if (this.mode === "draw") this._setPhase("blank"); } },
      { label: "CLEAR", on: () => { this.strokes = []; } },
    ]);
    inkRow.querySelectorAll(".ctrl__btn")[0].classList.add("is-active");
    this._inkRow = inkRow;
    host.appendChild(inkRow);
  }
  _setMode(m, el) {
    this.mode = m; this._setPhase("stare"); this.strokes = [];
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
  _setInk(ink, el) {
    this.drawInk = ink;
    const btns = this._inkRow.querySelectorAll(".ctrl__btn");
    btns[0].classList.remove("is-active"); btns[1].classList.remove("is-active");
    el.classList.add("is-active");
  }
}
