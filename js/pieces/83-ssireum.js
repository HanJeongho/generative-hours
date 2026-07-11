// ============================================================================
//  83 · 씨름 (After Kim Hong-do — "Ssireum", 김홍도 《씨름》, 18C · public domain)
//  「먹과 달」 XII관. 이 그림의 주인공은 씨름꾼이 아니라 '판'이다 — 둘레를 빽빽이
//  메운 구경꾼들의 시선과 들썩임, 그리고 판에 아랑곳없이 등 돌린 엿장수의 유머.
//
//  원작 이미지(assets/art/ssireum.jpg, 1400×1666)를 훼손 없이 그대로 깔되,
//  인물이 앉은 자리(FIGURES 타원 목록)마다 그 조각을 '살짝 살아있게' 만든다:
//   · 평소 : 각 인물 영역이 아주 작은 진폭으로 숨쉰다(39식 국소 워프를 변환-패치로
//            경량화 — 타원에 clip한 뒤 그 안의 그림만 미세 회전/신축).
//   · 씨름꾼 클릭 = 기술!(들배지기) : 중앙이 크게 들리고 기울며, 그 순간 판 전체
//            구경꾼이 일제히 중앙으로 쏠린다(시선 쏠림). 함성 파문 링이 퍼지고
//            갓·부채가 들썩이는 입자가 인다. 1.5초에 걸쳐 서서히 제자리로.
//   · 구경꾼 호버 = 그 사람만 갸웃(작은 워프).
//   · 엿장수(좌하단)만은 미동도 없다 — 원작의 유머를 캡션으로 짚어준다.
//
//  미학 : 원작 존중 + 한지·먹·단청. 좌표 상수는 최상단에 노출(중앙 캘리브레이션).
//  성능 : 인물별 패치는 바운딩박스만 다시 그림(무 per-frame 할당), 입자/링은 풀.
// ============================================================================

import { Piece, TAU, clamp, lerp, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const IMG_SRC = "assets/art/ssireum.jpg";
const IMG_W = 1400, IMG_H = 1666;          // 원본 픽셀

// ---- 인물 영역(이미지 비율 0..1 타원) — 중앙에서 시각 캘리브레이션 예정 ---------
// kind: "wrestler"(중앙 씨름꾼 2명) · "spectator"(둘레 구경꾼) · "yeot"(엿장수)
// u,v = 중심, rx,ry = 반경(이미지 폭/높이 대비 비율). 대략값으로 시작.
const FIGURES = [
  { u: 0.50, v: 0.50, rx: 0.165, ry: 0.185, kind: "wrestler" },   // [0] 판의 중심
  // 위쪽(뒷줄) 구경꾼 — 작게
  { u: 0.33, v: 0.22, rx: 0.055, ry: 0.070, kind: "spectator" },
  { u: 0.43, v: 0.17, rx: 0.055, ry: 0.070, kind: "spectator" },
  { u: 0.53, v: 0.16, rx: 0.055, ry: 0.070, kind: "spectator" },
  { u: 0.63, v: 0.18, rx: 0.055, ry: 0.070, kind: "spectator" },
  { u: 0.72, v: 0.24, rx: 0.055, ry: 0.070, kind: "spectator" },
  // 오른쪽 무리
  { u: 0.81, v: 0.35, rx: 0.058, ry: 0.075, kind: "spectator" },
  { u: 0.84, v: 0.47, rx: 0.058, ry: 0.078, kind: "spectator" },
  { u: 0.82, v: 0.59, rx: 0.060, ry: 0.080, kind: "spectator" },
  // 왼쪽 무리
  { u: 0.20, v: 0.30, rx: 0.056, ry: 0.072, kind: "spectator" },
  { u: 0.17, v: 0.42, rx: 0.056, ry: 0.075, kind: "spectator" },
  { u: 0.21, v: 0.54, rx: 0.058, ry: 0.078, kind: "spectator" },
  // 앞줄(아래) 구경꾼 — 화면 가까워 크게
  { u: 0.29, v: 0.79, rx: 0.075, ry: 0.095, kind: "spectator" },
  { u: 0.42, v: 0.86, rx: 0.078, ry: 0.098, kind: "spectator" },
  { u: 0.59, v: 0.85, rx: 0.078, ry: 0.098, kind: "spectator" },
  { u: 0.72, v: 0.79, rx: 0.075, ry: 0.095, kind: "spectator" },
  // 중앙 좌우 채움
  { u: 0.35, v: 0.66, rx: 0.060, ry: 0.080, kind: "spectator" },
  { u: 0.66, v: 0.68, rx: 0.060, ry: 0.080, kind: "spectator" },
  // 엿장수 — 판을 등지고 앉아 미동도 없다
  { u: 0.13, v: 0.78, rx: 0.062, ry: 0.088, kind: "yeot" },
];
const CENTER_U = 0.50, CENTER_V = 0.52;    // 시선이 쏠리는 판의 중심

// ---- 모션 튜닝(중앙 조정) --------------------------------------------------
const BREATHE_ROT   = 0.009;   // 평소 숨결 회전 진폭(rad) — 아주 작게
const BREATHE_SCALE = 0.006;   // 평소 숨결 신축 진폭
const HOVER_TILT    = 0.065;   // 구경꾼 호버 갸웃(rad)
const LEAN_ROT      = 0.11;    // 기술 시 구경꾼이 중앙으로 기우는 각(rad)
const LEAN_PUSH     = 0.06;    // 기술 시 중앙으로 당겨지는 정도(반경 비율)
const LIFT_ROT      = 0.15;    // 씨름꾼 들배지기 기울임(rad)
const LIFT_SCALE    = 0.16;    // 씨름꾼 수직 들림(신축)
const TECH_DUR      = 1.5;     // 기술 → 복귀 시간(초)
const CLIP_OVER     = 1.06;    // 패치 clip 여유(솔기 완화)

// 한지·먹·단청 톤
const HANJI_TOP = "#efe6d0";
const HANJI_BOT = "#e4d6b8";
const INK       = "#2a2320";

export default class Ssireum extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.accentRgb = hexToRgb(this.accent || "#e2603f");

    // 슬라이더 상태
    this.breath = 1.0;     // 숨결 세기
    this.roar = 1.0;       // 함성/쏠림 세기

    // 기술(들배지기) 에너지: 클릭 시 1 → TECH_DUR 동안 0으로
    this.tech = 0;
    this.hovered = -1;     // 현재 호버된 구경꾼 인덱스

    // 인물 런타임 상태(위상만 미리 배정 — 핫루프 무할당)
    this.fig = FIGURES.map((f, i) => ({
      phase: (i * 1.7) % TAU,
      sp: 0.5 + (i % 5) * 0.13,      // 개인차 있는 숨결 속도
      wob: (i * 0.37) % TAU,
      hov: 0,                        // 호버 이징값
    }));

    // 함성 파문 링 풀
    this.rings = [];
    for (let i = 0; i < 5; i++) this.rings.push({ r: 0, life: 0 });

    // 갓/부채 들썩임 입자 풀
    this.parts = [];
    for (let i = 0; i < 140; i++) {
      this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, rot: 0, spin: 0, fan: false });
    }

    // 이미지 로드
    this.ready = false; this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  // 원작을 contain으로 배치(비율 유지) — 상하 캡션 공간 살짝 남김
  _fit() {
    const W = this.w, H = this.h;
    const pad = Math.min(W, H) * 0.03;
    const aw = W - pad * 2, ah = H - pad * 2 - H * 0.05;   // 하단 캡션 여유
    const ar = IMG_W / IMG_H;
    let dw = aw, dh = aw / ar;
    if (dh > ah) { dh = ah; dw = ah * ar; }
    return { dx: (W - dw) / 2, dy: (H - dh) / 2 - H * 0.015, dw, dh };
  }

  // 화면상 인물 타원 기하
  _geo(f, r) {
    return {
      cx: r.dx + f.u * r.dw,
      cy: r.dy + f.v * r.dh,
      rx: f.rx * r.dw,
      ry: f.ry * r.dh,
    };
  }

  _inside(g, px, py) {
    const nx = (px - g.cx) / g.rx, ny = (py - g.cy) / g.ry;
    return nx * nx + ny * ny <= 1;
  }

  // 씨름꾼을 클릭하면 기술! (판 전체 쏠림)
  onPointerDown() {
    if (!this.ready) return;
    const r = this._fit();
    const g0 = this._geo(FIGURES[0], r);
    if (this._inside(g0, this.pointer.x, this.pointer.y)) this._technique(r);
  }

  _technique(r) {
    this.tech = 1;
    // 함성 파문 링 — 중앙에서
    const cx = r.dx + CENTER_U * r.dw, cy = r.dy + CENTER_V * r.dh;
    let launched = 0;
    for (const ring of this.rings) {
      if (ring.life <= 0) { ring.r = Math.min(r.dw, r.dh) * 0.08; ring.life = 1; launched++; }
      if (launched >= 2) break;
    }
    this._ringCx = cx; this._ringCy = cy;
    // 갓·부채 들썩임 — 구경꾼 머리 위에서 튀어오름(엿장수/씨름꾼 제외)
    for (let i = 1; i < FIGURES.length; i++) {
      if (FIGURES[i].kind !== "spectator") continue;
      const gm = this._geo(FIGURES[i], r);
      this._spawnPart(gm.cx + (Math.random() - 0.5) * gm.rx, gm.cy - gm.ry * 0.85, i % 3 === 0);
    }
  }

  _spawnPart(x, y, fan) {
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.x = x; p.y = y;
      p.vx = (Math.random() - 0.5) * 40;
      p.vy = -60 - Math.random() * 70;
      p.life = 1; p.max = 0.7 + Math.random() * 0.6;
      p.rot = Math.random() * TAU; p.spin = (Math.random() - 0.5) * 6;
      p.fan = fan;
      return;
    }
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    this._paperBg(g, W, H);

    if (!this.ready) {
      this._msg(g, W, H, this.failed ? "그림을 불러올 수 없습니다" : "판이 열리는 중…");
      if (this.failed) this._caption(g, W, H);
      return;
    }

    const r = this._fit();

    // 기술 에너지 감쇠(1.5초 복귀)
    if (this.tech > 0) this.tech = Math.max(0, this.tech - dt / TECH_DUR);
    const techE = this._ease(this.tech) * this.roar;    // 0..~1

    // 호버 판정(구경꾼만)
    this.hovered = -1;
    if (this.pointer.active) {
      for (let i = 1; i < FIGURES.length; i++) {
        if (FIGURES[i].kind !== "spectator") continue;
        if (this._inside(this._geo(FIGURES[i], r), this.pointer.x, this.pointer.y)) { this.hovered = i; break; }
      }
    }

    // 1) 원작을 있는 그대로 (훼손 없음)
    g.drawImage(this.img, 0, 0, IMG_W, IMG_H, r.dx, r.dy, r.dw, r.dh);

    // 2) 인물 자리마다 '살아있는' 패치 덧그리기
    const cx0 = r.dx + CENTER_U * r.dw, cy0 = r.dy + CENTER_V * r.dh;
    for (let i = 0; i < FIGURES.length; i++) {
      const f = FIGURES[i], s = this.fig[i];
      s.hov = lerp(s.hov, this.hovered === i ? 1 : 0, clamp(dt * 8, 0, 1));
      this._drawPatch(g, f, s, i, r, t, techE, cx0, cy0);
    }

    // 3) 함성 파문 링
    this._drawRings(g, dt);

    // 4) 갓·부채 입자
    this._drawParts(g, dt);

    // 5) 판이 달아오르면 중앙에 아주 옅은 단청빛 열기
    if (techE > 0.02) this._heat(g, cx0, cy0, r, techE);

    this._caption(g, W, H);
  }

  _ease(x) { return x * x * (3 - 2 * x); }   // smoothstep

  // ---- 인물 패치: 타원에 clip → 그 안의 원작만 미세 변환 --------------------
  _drawPatch(g, f, s, i, r, t, techE, cx0, cy0) {
    const gm = this._geo(f, r);
    const yeot = f.kind === "yeot";
    const wrestler = f.kind === "wrestler";

    // --- 이 인물의 변환량 산출 ---
    let rot = 0, sx = 1, sy = 1, tx = 0, ty = 0, pvx = gm.cx, pvy = gm.cy;

    if (!yeot) {
      // 평소 숨결(엿장수 제외: 미동도 없다)
      const br = this.breath;
      const ph = t * s.sp + s.phase;
      rot += Math.sin(ph) * BREATHE_ROT * br;
      const bs = 1 + Math.sin(ph * 1.3 + s.wob) * BREATHE_SCALE * br;
      sx *= bs; sy *= bs;
    }

    if (wrestler && techE > 0.001) {
      // 들배지기: 발밑을 축으로 들어올리며 기울인다
      pvy = gm.cy + gm.ry * 0.85;
      const dir = Math.sin(this.fig[i].wob) >= 0 ? 1 : -1;   // 넘기는 방향(고정)
      rot += LIFT_ROT * techE * dir;
      sy *= 1 + LIFT_SCALE * techE;
      ty -= gm.ry * 0.10 * techE;
    } else if (f.kind === "spectator" && techE > 0.001) {
      // 시선 쏠림: 중앙으로 상체를 기울이고 살짝 당겨진다
      const dx = cx0 - gm.cx;
      const sign = dx >= 0 ? 1 : -1;                  // 위쪽이 중앙으로 향하도록
      rot += LEAN_ROT * techE * sign;
      const d = Math.hypot(dx, cy0 - gm.cy) || 1;
      tx += (dx / d) * gm.rx * LEAN_PUSH * techE;
      ty += ((cy0 - gm.cy) / d) * gm.ry * LEAN_PUSH * techE;
    }

    if (!yeot && s.hov > 0.001) {
      // 호버 갸웃 — 그 사람만
      rot += Math.sin(t * 5 + s.phase) * HOVER_TILT * s.hov;
    }

    // 변환이 거의 없으면 패치 생략(원작 그대로면 다시 안 그림)
    if (Math.abs(rot) < 1e-4 && Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4 &&
        Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05) return;

    // 바운딩박스(패딩 포함) — 이 영역의 원작만 다시 그림
    const RX = gm.rx * CLIP_OVER, RY = gm.ry * CLIP_OVER;
    const padX = RX * 0.35 + Math.abs(tx), padY = RY * 0.35 + Math.abs(ty);
    const bx = gm.cx - RX - padX, by = gm.cy - RY - padY;
    const bw = (RX + padX) * 2, bh = (RY + padY) * 2;
    const sImgX = ((bx - r.dx) / r.dw) * IMG_W;
    const sImgY = ((by - r.dy) / r.dh) * IMG_H;
    const sImgW = (bw / r.dw) * IMG_W;
    const sImgH = (bh / r.dh) * IMG_H;

    g.save();
    // 고정된 화면 타원에 clip(구멍은 그대로, 안의 그림만 움직임)
    g.beginPath();
    g.ellipse(gm.cx, gm.cy, RX, RY, 0, 0, TAU);
    g.clip();
    // 피벗 기준 변환
    g.translate(pvx + tx, pvy + ty);
    g.rotate(rot);
    g.scale(sx, sy);
    g.translate(-pvx, -pvy);
    g.drawImage(this.img, sImgX, sImgY, sImgW, sImgH, bx, by, bw, bh);
    g.restore();
  }

  // ---- 함성 파문 링 ---------------------------------------------------------
  _drawRings(g, dt) {
    const [rr, gg, bb] = this.accentRgb;
    g.save();
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.r += (this.w + this.h) * 0.35 * dt;
      ring.life -= dt * 0.9;
      const a = clamp(ring.life, 0, 1);
      g.strokeStyle = `rgba(${rr},${gg},${bb},${0.28 * a})`;
      g.lineWidth = 2 + 4 * a;
      g.beginPath();
      g.arc(this._ringCx, this._ringCy, ring.r, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  // ---- 갓·부채 입자 ---------------------------------------------------------
  _drawParts(g, dt) {
    const [rr, gg, bb] = this.accentRgb;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.vy += 240 * dt;                 // 중력
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt / p.max;
      const a = clamp(p.life, 0, 1);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.globalAlpha = a;
      const sz = 5 + 4 * a;
      if (p.fan) {
        // 부채 — 단청빛 쐐기
        g.fillStyle = `rgba(${rr},${gg},${bb},0.9)`;
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, sz * 1.6, -0.5, 0.5);
        g.closePath();
        g.fill();
      } else {
        // 갓 — 먹빛 챙
        g.fillStyle = "rgba(30,26,22,0.9)";
        g.beginPath();
        g.ellipse(0, 0, sz * 1.4, sz * 0.5, 0, 0, TAU);
        g.fill();
        g.fillStyle = "rgba(30,26,22,0.9)";
        g.beginPath();
        g.arc(0, -sz * 0.2, sz * 0.6, Math.PI, 0);
        g.fill();
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }

  _heat(g, cx, cy, r, e) {
    const [rr, gg, bb] = this.accentRgb;
    const R = Math.min(r.dw, r.dh) * 0.5;
    const rad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    rad.addColorStop(0, `rgba(${rr},${gg},${bb},${0.10 * e})`);
    rad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    g.save();
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = rad;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();
    g.restore();
  }

  // ---- 한지 배경 ------------------------------------------------------------
  _paperBg(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, HANJI_TOP);
    bg.addColorStop(1, HANJI_BOT);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 가장자리 옅은 먹 비네팅
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(60,48,34,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  _msg(g, W, H, msg) {
    g.fillStyle = "rgba(42,35,32,0.8)";
    g.font = `600 ${Math.max(13, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(msg, W / 2, H / 2);
    g.textAlign = "start"; g.textBaseline = "alphabetic";
  }

  // 하단 한국어 캡션 한 줄
  _caption(g, W, H) {
    g.save();
    g.fillStyle = "rgba(42,35,32,0.72)";
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.02)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText("기술이 터지면 판 전체가 쏠린다 — 엿장수만 빼고.", W / 2, H - Math.max(16, H * 0.03));
    g.restore();
  }

  controls(host) {
    host.appendChild(slider("숨결 (breath)", 0, 2, this.breath, 0.05, (v) => (this.breath = v)));
    host.appendChild(slider("함성 (roar)", 0.2, 2, this.roar, 0.05, (v) => (this.roar = v)));
    host.appendChild(buttonRow([
      { label: "기술! (들배지기)", on: () => { if (this.ready) this._technique(this._fit()); } },
    ]));
  }

  teardown() {
    this.img = null;
    this.parts = null;
    this.rings = null;
    this.fig = null;
  }
}
