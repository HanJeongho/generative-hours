// ============================================================================
//  88 · 청자 상감 (Celadon — 파내고 메우는 시간) · 전(全) 절차적, 이미지 없음
//  ─────────────────────────────────────────────────────────────────────────
//  고려청자 상감(象嵌)의 공정을 손으로 되짚는다. 어두운 전시대 위에 매병(梅甁)
//  실루엣 하나 — 세로 하이라이트/음영으로 2D에 볼륨을 준다.
//   ① 초벌(태토) 상태: 회갈색 흙. 드래그 = 상감 파기(음각 홈 = 어두운 선 + 위쪽
//      가장자리에 걸린 빛). 도구 [학][구름] = 커서 자리에 문양을 음각으로 찍음.
//   ② [백토 메움] = 파낸 홈이 흰 슬립으로 메워진다.
//   ③ [유약·번조] = 가마 빛이 표면을 한 번 훑고, 태토가 비색(翡色) 유리질로
//      변신 — 상감 문양이 희게 떠오르고 은은한 빙렬(氷裂)이 자라난다.
//   빈 곳 클릭 = 살짝 회전(하이라이트 각이 달라짐). [새 도자기] = 리셋(기본으로
//   학 두 마리 + 구름이 미리 새겨져 있어 빈 화면이 아니다).
//  60fps: 스트로크는 정규화 좌표(리사이즈 안전)로 보관, 핫루프 무할당(스크린
//  변환은 그리기 경로에 인라인), 빙렬은 번조 시 1회 생성 후 draw-length만 성장.
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// ── 시각 캘리브레이션 상수 (중앙에서 튜닝) ──────────────────────────────────
// 매병 옆선: (v: 위 0 → 아래 1, r: 최대 반폭 대비 0..1). 어깨가 부풀고 굽으로
// 좁아지는 고려 매병의 S곡선.
const PROFILE = [
  [0.00, 0.30], [0.02, 0.30], [0.035, 0.22], [0.06, 0.20], [0.10, 0.34],
  [0.15, 0.62], [0.20, 0.88], [0.24, 1.00], [0.30, 0.98], [0.40, 0.88],
  [0.52, 0.72], [0.65, 0.55], [0.78, 0.42], [0.88, 0.36], [0.93, 0.35],
  [0.965, 0.40], [0.99, 0.37], [1.00, 0.30],
];
const VASE_H_FRAC = 0.70;   // 화면 높이 대비 매병 높이
const VASE_R_FRAC = 0.255;  // 매병 높이 대비 최대 반폭
const VASE_CY_OFF = -0.03;  // 세로 중심 오프셋(캡션 공간)

const CLAY_HI = "#8d8070";  // 태토(회갈색) 밝은 면
const CLAY_LO = "#5f5647";  // 태토 어두운 면
const CELADON = "#6faab4";  // 비색(翡色) 유약
const CELADON_LO = "#3f6d75";
const SLIP = [238, 236, 226];   // 백토(상감 흰색)
const INK = [44, 34, 24];       // 음각 홈 바닥(어두운 선)

// ── 문양 원본(로컬 좌표, x→오른쪽, y→아래, 대략 [-0.5,0.5]) ─────────────────
// 선학(仙鶴): 날개 편 학 — 몇 개의 유려한 폴리라인.
const CRANE = [
  [[-0.45, 0.10], [-0.24, 0.05], [0.0, 0.02], [0.15, -0.02], [0.22, -0.05],
   [0.28, -0.18], [0.31, -0.30], [0.42, -0.34]],            // 꼬리·몸통·목·머리·부리
  [[0.05, -0.01], [0.0, -0.20], [-0.06, -0.40]],             // 위 날개
  [[0.08, 0.02], [0.18, 0.14], [0.30, 0.21]],                // 아래 날개
  [[-0.02, 0.05], [-0.18, 0.28], [-0.30, 0.41]],             // 다리
  [[-0.06, 0.05], [-0.22, 0.30], [-0.34, 0.44]],             // 다리
];
// 여의두(如意頭) 구름: 세 잎 + 아래 뾰족한 끝.
const CLOUD = [
  [[0.0, 0.42], [0.28, 0.14], [0.40, -0.08], [0.30, -0.22], [0.16, -0.11],
   [0.0, -0.30], [-0.16, -0.11], [-0.30, -0.22], [-0.40, -0.08], [-0.28, 0.14],
   [0.0, 0.42]],
];

const lerp3 = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

export default class Celadon extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // 공정 상태(전부 이징)
    this.slip = 0; this.slipT = 0;        // 백토 메움 0..1
    this.glaze = 0; this.glazeT = 0;      // 번조(비색화) 0..1
    this.crackleGrow = 0;                 // 빙렬 성장 0..1
    this.crackle = [];                    // 번조 시 1회 생성

    // 하이라이트 각(클릭 회전)
    this.rot = 0; this.rotT = 0;

    // 슬라이더
    this.grooveW = 1.0;   // 새김 굵기
    this.crackAmt = 1.0;  // 빙렬 밀도

    // 스트로크(정규화 좌표) — {pts:[{x,y}...]}
    this.strokes = [];
    this._active = null;
    this._moved = false;
    this._lastPt = { x: 0, y: 0 };
    this.lastVasePt = { x: 0.0, y: 0.42 };   // 도구 버튼 스탬프 위치

    this.tool = null;   // 활성 도구(없으면 null)

    this._rgbClayHi = hexToRgb(CLAY_HI);
    this._rgbClayLo = hexToRgb(CLAY_LO);
    this._rgbCel = hexToRgb(CELADON);
    this._rgbCelLo = hexToRgb(CELADON_LO);

    this._computeGeo();
    this._seedDefaults();
  }

  onResize() { this._computeGeo(); }

  _computeGeo() {
    const W = this.w, H = this.h;
    const vaseH = Math.min(H * VASE_H_FRAC, W * 1.05);
    const maxR = vaseH * VASE_R_FRAC;
    const cx = W * 0.5;
    const topY = (H - vaseH) * 0.5 + H * VASE_CY_OFF;
    this.geo = { cx, topY, vaseH, maxR };
  }

  // v(0..1)에서의 반폭 비율(0..1) — PROFILE 선형 보간
  _radiusAt(v) {
    const P = PROFILE;
    if (v <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (v <= P[i][0]) {
        const t = (v - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
        return lerp(P[i - 1][1], P[i][1], t);
      }
    }
    return P[P.length - 1][1];
  }

  // 기본 문양 미리 새김(빈 화면 방지)
  _seedDefaults() {
    this._pushShape(CLOUD, 0.02, 0.20, 0.52);
    this._pushShape(CRANE, -0.20, 0.44, 0.44);
    this._pushShape(CRANE, 0.26, 0.60, 0.36);
  }

  // 로컬 문양 → 정규화 스트로크(실루엣 안으로 클램프)로 push
  _pushShape(shape, cx0, cy0, scale) {
    for (const poly of shape) {
      const pts = [];
      for (const [lx, ly] of poly) {
        let y = clamp(cy0 + ly * scale, 0.05, 0.95);
        const lim = this._radiusAt(y) * 0.94;
        const x = clamp(cx0 + lx * scale, -lim, lim);
        pts.push({ x, y });
      }
      this.strokes.push({ pts });
    }
  }

  // 화면 픽셀 → 정규화(vase 로컬) 좌표
  _toNorm(px, py) {
    const g = this.geo;
    return { x: (px - g.cx) / g.maxR, y: (py - g.topY) / g.vaseH };
  }
  _inside(nx, ny) {
    if (ny < 0.02 || ny > 0.99) return false;
    return Math.abs(nx) <= this._radiusAt(ny);
  }

  // ── 포인터 ────────────────────────────────────────────────────────────────
  onPointerDown() {
    this._moved = false;
    if (this.glaze < 0.45) {
      this._active = { pts: [] };
      this.strokes.push(this._active);   // 라이브 미리보기
      const n = this._toNorm(this.pointer.x, this.pointer.y);
      if (this._inside(n.x, n.y)) { this._addPt(n.x, n.y); }
    } else {
      this._active = null;
    }
  }

  onPointerUp() {
    if (!this._moved) {
      // 클릭 = 회전(하이라이트 각 변경)
      this.rotT += rand(-1, 1) * 0.9;
      // 도구가 켜져 있으면 커서 자리에 스탬프
      if (this.tool && this.glaze < 0.45) {
        const n = this._toNorm(this.pointer.x, this.pointer.y);
        if (this._inside(n.x, n.y)) this.lastVasePt = { x: n.x, y: n.y };
        this._stamp(this.tool);
      }
    }
    // 너무 짧은 스트로크는 버림
    if (this._active && this._active.pts.length < 2) {
      const i = this.strokes.indexOf(this._active);
      if (i >= 0) this.strokes.splice(i, 1);
    }
    this._active = null;
  }

  _addPt(nx, ny) {
    const lim = this._radiusAt(ny) * 0.92;
    const x = clamp(nx, -lim, lim);
    this._active.pts.push({ x, y: clamp(ny, 0.03, 0.97) });
    this._lastPt.x = x; this._lastPt.y = ny;
  }

  _stamp(kind) {
    const p = this.lastVasePt;
    const s = 0.42;
    this._pushShape(kind === "crane" ? CRANE : CLOUD, p.x, p.y, s);
  }

  // ── 공정 버튼 ───────────────────────────────────────────────────────────
  _fill() { this.slipT = 1; }
  _fire() {
    this.slipT = 1;           // 메우지 않았다면 자동으로 메워지며 구워짐
    this.glazeT = 1;
    if (!this.crackle.length) this._genCrackle();
  }
  _reset() {
    this.strokes.length = 0;
    this.crackle.length = 0;
    this.slip = this.slipT = 0;
    this.glaze = this.glazeT = 0;
    this.crackleGrow = 0;
    this.rot = this.rotT = 0;
    this.tool = null;
    this._seedDefaults();
  }

  // 빙렬(氷裂): 실루엣 안에서 짧은 다각 균열선 다발 — 1회 생성, draw-length 성장
  _genCrackle() {
    const n = Math.round(46 * this.crackAmt);
    for (let i = 0; i < n; i++) {
      let y = rand(0.06, 0.94);
      let lim = this._radiusAt(y) * 0.9;
      let x = rand(-lim, lim);
      const segs = 2 + (rand() * 3 | 0);
      const pts = [{ x, y }];
      let ang = rand(0, TAU);
      for (let s = 0; s < segs; s++) {
        ang += rand(-0.9, 0.9);
        const step = rand(0.03, 0.09);
        y = clamp(y + Math.sin(ang) * step, 0.05, 0.95);
        lim = this._radiusAt(y) * 0.9;
        x = clamp(x + Math.cos(ang) * step, -lim, lim);
        pts.push({ x, y });
      }
      this.crackle.push({ pts, born: rand(0, 0.5) });
    }
  }

  // ── FRAME ─────────────────────────────────────────────────────────────────
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // 이징
    this.slip = lerp(this.slip, this.slipT, clamp(dt * 3, 0, 1));
    this.glaze = lerp(this.glaze, this.glazeT, clamp(dt * 1.4, 0, 1));
    this.rot = lerp(this.rot, this.rotT, clamp(dt * 4, 0, 1));
    const crackTarget = this.glaze > 0.55 ? 1 : 0;
    this.crackleGrow = lerp(this.crackleGrow, crackTarget, clamp(dt * 0.5, 0, 1));

    // 라이브 카빙(드래그)
    if (this._active && this.pointer.down && this.pointer.active) {
      const n = this._toNorm(this.pointer.x, this.pointer.y);
      if (this._inside(n.x, n.y)) {
        const dx = n.x - this._lastPt.x, dy = n.y - this._lastPt.y;
        if (this._active.pts.length === 0 || dx * dx + dy * dy > 0.0006) {
          this._addPt(n.x, n.y);
          this._moved = true;
        }
      }
    }
    if (this.pointer.active && this.pointer.down) {
      const n = this._toNorm(this.pointer.x, this.pointer.y);
      if (this._inside(n.x, n.y)) this.lastVasePt = n;
    }

    this._drawStand(g, W, H);
    this._drawVase(g);
    this._drawStrokes(g);
    if (this.glaze > 0.02 && this.glaze < 0.985) this._drawKilnSweep(g);
    if (this.crackleGrow > 0.01) this._drawCrackle(g);
    this._drawGloss(g);
    this._drawCaption(g, W, H);
  }

  // 어두운 전시대 + 스포트 + 받침 그림자
  _drawStand(g, W, H) {
    const bg = g.createRadialGradient(W * 0.5, H * 0.42, H * 0.1, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    bg.addColorStop(0, "#1b1f22");
    bg.addColorStop(1, "#0a0c0d");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 받침 타원 그림자
    const gy = this.geo.topY + this.geo.vaseH * 0.995;
    const rw = this.geo.maxR * 0.9, rh = this.geo.maxR * 0.22;
    const sg = g.createRadialGradient(this.geo.cx, gy, 0, this.geo.cx, gy, rw);
    sg.addColorStop(0, "rgba(0,0,0,0.55)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(this.geo.cx, gy); g.scale(1, rh / rw);
    g.fillStyle = sg; g.beginPath(); g.arc(0, 0, rw, 0, TAU); g.fill();
    g.restore();
  }

  // 실루엣 경로(재사용) — 오른쪽 아래로, 왼쪽 위로
  _traceSil(g) {
    const { cx, topY, vaseH, maxR } = this.geo;
    const S = 64;
    g.beginPath();
    for (let i = 0; i <= S; i++) {
      const v = i / S; const r = this._radiusAt(v) * maxR;
      const x = cx + r, y = topY + v * vaseH;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let i = S; i >= 0; i--) {
      const v = i / S; const r = this._radiusAt(v) * maxR;
      g.lineTo(cx - r, topY + v * vaseH);
    }
    g.closePath();
  }

  _drawVase(g) {
    const { cx, maxR } = this.geo;
    const glaze = this.glaze;
    const hi = lerp3(this._rgbClayHi, this._rgbCel, glaze);
    const lo = lerp3(this._rgbClayLo, this._rgbCelLo, glaze);
    // 하이라이트 세로 띠 위치(회전에 따라 이동)
    const hf = clamp(0.5 + 0.22 * Math.sin(this.rot), 0.16, 0.84);

    g.save();
    this._traceSil(g);
    g.clip();
    // 원통 볼륨: 가로 그라데이션
    const grad = g.createLinearGradient(cx - maxR, 0, cx + maxR, 0);
    const loC = `rgb(${lo[0]},${lo[1]},${lo[2]})`;
    const hiC = `rgb(${hi[0]},${hi[1]},${hi[2]})`;
    grad.addColorStop(0, loC);
    grad.addColorStop(clamp(hf - 0.28, 0.02, 0.9), hiC);
    grad.addColorStop(hf, `rgb(${Math.min(255, hi[0] + 26)},${Math.min(255, hi[1] + 26)},${Math.min(255, hi[2] + 26)})`);
    grad.addColorStop(clamp(hf + 0.3, 0.1, 0.98), hiC);
    grad.addColorStop(1, loC);
    g.fillStyle = grad;
    g.fillRect(cx - maxR - 4, this.geo.topY - 4, maxR * 2 + 8, this.geo.vaseH + 8);
    // 세로 형태 음영(어깨 밝고 굽 어둡게)
    const vg = g.createLinearGradient(0, this.geo.topY, 0, this.geo.topY + this.geo.vaseH);
    vg.addColorStop(0, "rgba(255,255,255,0.05)");
    vg.addColorStop(0.24, `rgba(255,255,255,${0.10 + glaze * 0.06})`);
    vg.addColorStop(0.7, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.30)");
    g.fillStyle = vg;
    g.fillRect(cx - maxR - 4, this.geo.topY - 4, maxR * 2 + 8, this.geo.vaseH + 8);
    g.restore();

    // 윤곽선
    this._traceSil(g);
    g.lineJoin = "round";
    g.strokeStyle = glaze > 0.5 ? "rgba(20,50,55,0.5)" : "rgba(30,22,14,0.55)";
    g.lineWidth = 1.4;
    g.stroke();
  }

  // 스트로크(음각 → 상감) 그리기
  _drawStrokes(g) {
    if (!this.strokes.length) return;
    const { cx, topY, vaseH, maxR } = this.geo;
    const fill = Math.max(this.slip, this.glaze);
    const col = lerp3(INK, SLIP, fill);
    const mainC = `rgb(${col[0]},${col[1]},${col[2]})`;
    const w = Math.max(1.2, maxR * 0.02 * this.grooveW);

    g.save();
    this._traceSil(g); g.clip();
    g.lineJoin = "round"; g.lineCap = "round";

    for (const st of this.strokes) {
      const pts = st.pts;
      if (pts.length < 2) {
        if (pts.length === 1) {   // 단일 점 스탬프/시작점
          g.fillStyle = mainC;
          g.beginPath();
          g.arc(cx + pts[0].x * maxR, topY + pts[0].y * vaseH, w * 0.6, 0, TAU);
          g.fill();
        }
        continue;
      }
      // 아래쪽 그림자(음각 깊이)
      g.strokeStyle = fill < 0.5 ? "rgba(20,14,8,0.5)" : "rgba(30,70,74,0.35)";
      g.lineWidth = w * 1.15;
      this._path(g, pts, cx, topY, maxR, vaseH, 0.9, 0.9);
      g.stroke();
      // 본선(홈 바닥 → 백토)
      g.strokeStyle = mainC;
      g.lineWidth = w;
      this._path(g, pts, cx, topY, maxR, vaseH, 0, 0);
      g.stroke();
      // 위쪽 가장자리에 걸린 빛(카빙 베벨)
      g.strokeStyle = `rgba(255,255,255,${0.28 - this.glaze * 0.12})`;
      g.lineWidth = Math.max(0.7, w * 0.4);
      this._path(g, pts, cx, topY, maxR, vaseH, -0.7, -0.7);
      g.stroke();
    }
    g.restore();
  }

  // 정규화 pts → 부드러운 화면 경로(px 오프셋 ox,oy)
  _path(g, pts, cx, topY, maxR, vaseH, ox, oy) {
    g.beginPath();
    let x0 = cx + pts[0].x * maxR + ox, y0 = topY + pts[0].y * vaseH + oy;
    g.moveTo(x0, y0);
    for (let i = 1; i < pts.length - 1; i++) {
      const ax = cx + pts[i].x * maxR + ox, ay = topY + pts[i].y * vaseH + oy;
      const bx = cx + pts[i + 1].x * maxR + ox, by = topY + pts[i + 1].y * vaseH + oy;
      g.quadraticCurveTo(ax, ay, (ax + bx) * 0.5, (ay + by) * 0.5);
    }
    const last = pts[pts.length - 1];
    g.lineTo(cx + last.x * maxR + ox, topY + last.y * vaseH + oy);
  }

  // 가마 빛: 세로 밝은 띠가 번조 진행에 따라 표면을 훑음
  _drawKilnSweep(g) {
    const { cx, maxR, topY, vaseH } = this.geo;
    const sx = cx + lerp(-maxR * 1.3, maxR * 1.3, this.glaze);
    g.save();
    this._traceSil(g); g.clip();
    g.globalCompositeOperation = "lighter";
    const bw = maxR * 0.7;
    const band = g.createLinearGradient(sx - bw, 0, sx + bw, 0);
    band.addColorStop(0, "rgba(255,214,150,0)");
    band.addColorStop(0.5, "rgba(255,226,176,0.4)");
    band.addColorStop(1, "rgba(255,214,150,0)");
    g.fillStyle = band;
    g.fillRect(cx - maxR - 4, topY - 4, maxR * 2 + 8, vaseH + 8);
    g.restore();
  }

  _drawCrackle(g) {
    const { cx, topY, vaseH, maxR } = this.geo;
    g.save();
    this._traceSil(g); g.clip();
    g.lineWidth = 0.8; g.lineJoin = "round";
    for (const c of this.crackle) {
      const grow = clamp((this.crackleGrow - c.born) / (1 - c.born), 0, 1);
      if (grow <= 0.01) continue;
      const n = Math.max(2, Math.ceil(c.pts.length * grow));
      const sub = c.pts.slice(0, n);
      g.strokeStyle = "rgba(255,255,255,0.10)";
      this._path(g, sub, cx, topY, maxR, vaseH, 0, 0); g.stroke();
      g.strokeStyle = "rgba(28,54,58,0.16)";
      this._path(g, sub, cx, topY, maxR, vaseH, 0.5, 0.5); g.stroke();
    }
    g.restore();
  }

  // 유리질 광택(번조 후 강해지는 스페큘러)
  _drawGloss(g) {
    if (this.glaze < 0.05) return;
    const { cx, maxR, topY, vaseH } = this.geo;
    const hf = clamp(0.5 + 0.22 * Math.sin(this.rot), 0.2, 0.8);
    const gx = cx + (hf - 0.5) * maxR * 1.4 - maxR * 0.28;
    g.save();
    this._traceSil(g); g.clip();
    g.globalCompositeOperation = "lighter";
    const gl = g.createLinearGradient(gx - maxR * 0.16, 0, gx + maxR * 0.16, 0);
    gl.addColorStop(0, "rgba(255,255,255,0)");
    gl.addColorStop(0.5, `rgba(255,255,255,${0.18 * this.glaze})`);
    gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.fillRect(cx - maxR, topY, maxR * 2, vaseH * 0.6);
    g.restore();
  }

  _drawCaption(g, W, H) {
    g.fillStyle = "rgba(226,96,63,0.85)";
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.020)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText("파낸 자리에 다른 흙을 메워 구우면 — 천 년 가는 그림이 된다.", W * 0.5, H - Math.max(18, H * 0.04));
    g.textAlign = "start";
  }

  // ── CONTROLS ────────────────────────────────────────────────────────────
  controls(host) {
    host.appendChild(slider("새김 굵기 (line)", 0.4, 2.2, this.grooveW, 0.05, (v) => (this.grooveW = v)));
    host.appendChild(slider("빙렬 밀도 (crackle)", 0, 2, this.crackAmt, 0.05, (v) => (this.crackAmt = v)));
    host.appendChild(buttonRow([
      { label: "학 (crane)", on: () => { this.tool = this.tool === "crane" ? null : "crane"; this._stamp("crane"); } },
      { label: "구름 (cloud)", on: () => { this.tool = this.tool === "cloud" ? null : "cloud"; this._stamp("cloud"); } },
    ]));
    host.appendChild(buttonRow([
      { label: "백토 메움 (inlay)", on: () => this._fill() },
      { label: "유약·번조 (fire)", on: () => this._fire() },
      { label: "새 도자기 (new)", on: () => this._reset() },
    ]));
  }

  teardown() {
    this.strokes = null;
    this.crackle = null;
  }
}
