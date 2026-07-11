// ============================================================================
//  83 · 씨름 · "한 판 붙자" (After Kim Hong-do — 김홍도 《씨름》, 18C · public domain)
//  「먹과 달」관. 원작에서 씨름꾼 두 명을 누끼로 오려내고, 남은 자리(모래판)를
//  인페인트한 배경판 위에 그 누끼 스프라이트를 정확히 제자리에 앉혔다 — 37 가나가와
//  파도와 같은 '페이퍼 시어터' 방식. 평상시엔 원작과 한 치도 다르지 않게 보이지만,
//  씨름꾼은 아주 미세하게 숨을 쉰다.
//
//  씨름꾼을 누르고 있으면 힘 게이지가 차오르고(부르르 떨며 웅크림), 손을 놓는 순간
//  들배지기! — 게이지에 비례해 크게 기울며 들썩 떠올랐다 쿵 내려앉는다(스쿼시&스트레치
//  0.9초 스프링, 방향은 매번 교대). 착지 찰나 발밑에서 모래 먼지가 터지고 화면이 살짝
//  흔들리며 함성의 파문 링이 한 겹 번진다. 그 순간 판을 에워싼 관중 구역(상·좌·우·하
//  네 밴드)이 시차를 두고 '들썩' — 원작을 왜곡하는 게 아니라, 종이 인형극에서 뒷줄 종이
//  인형들이 순서대로 튕겨오르는 결이다.
//
//  좌측 중단의 엿장수만은 어떤 소동에도 미동이 없다. 그를 클릭하면 머리 위로 '…'가
//  떴다 사라질 뿐 — 끝까지 무심한 조선 회화의 유머.
//
//  성능 : 이미지 두 장(배경판·누끼)만 로드. 스프라이트는 매 프레임 변환-그리기 1회,
//         밴드 들썩은 기술 중에만 4스트립. 모래/링은 풀(핫루프 무할당).
// ============================================================================

import { Piece, TAU, clamp, lerp, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const BG_SRC = "assets/art/ssireum-bg.jpg";
const SP_SRC = "assets/art/ssireum-wrestlers.png";
const BG_W = 1400, BG_H = 1666;          // 배경판 원본 픽셀
const SP_W = 546,  SP_H = 692;           // 누끼 스프라이트 픽셀

// ---- 스프라이트 원위치(배경 이미지 비율 bbox) — 중앙 캘리브레이션 상수 ----------
const SP_U0 = 0.405, SP_V0 = 0.330, SP_U1 = 0.795, SP_V1 = 0.745;

// ---- 엿장수 영역(좌측 중단, 이미지 비율 rect) — 클릭 히트 + '…' 앵커 ------------
const YEOT_U0 = 0.10, YEOT_V0 = 0.44, YEOT_U1 = 0.28, YEOT_V1 = 0.66;

// ---- 관중 네 밴드(이미지 비율 rect) — 엿장수(좌중단)를 피해 잡음 ------------------
//  [u0, v0, u1, v1, delay]  delay = 들썩 시차(초)
const BANDS = [
  [0.06, 0.030, 0.94, 0.190, 0.00],   // 상단(뒷줄)
  [0.780, 0.200, 0.980, 0.740, 0.06], // 우측 무리
  [0.06, 0.800, 0.94, 0.970, 0.12],   // 하단(앞줄)
  [0.020, 0.140, 0.240, 0.420, 0.18], // 좌측 상무리(엿장수 위)
];

// ---- 모션 튜닝(중앙 조정) --------------------------------------------------
const CHARGE_TIME = 1.3;               // 완전 충전까지(초)
const THROW_DUR   = 0.9;               // 들배지기 스프링 전체 시간(초)
const SLAM_AT     = 0.55;              // 이 진행도에서 착지(모래·셰이크·링)
const MAX_TILT    = 16 * Math.PI / 180; // 들배지기 최대 기울임(rad)
const IDLE_ROCK   = 0.4 * Math.PI / 180; // 유휴 록킹 진폭(rad)
const IDLE_BREATHE= 0.010;             // 유휴 호흡 신축(1%)
const HOVER_SCALE = 1.02;              // 커서 올리면 긴장
const CROUCH      = 0.07;              // 충전 웅크림(세로 압축 최대)
const SQUASH      = 0.14;              // 착지 스쿼시 최대
const BAND_DUR    = 0.20;              // 밴드 한 번 들썩 시간(초)

// 한지·먹 톤
const HANJI_TOP = "#efe6d0";
const HANJI_BOT = "#e4d6b8";

// 모래 먼지 색(핫루프 무할당 — 인덱스로 골라 씀)
const SAND = ["#d8c49a", "#cdb684", "#e3d3ac", "#c2a771", "#d0bd90"];

export default class Ssireum extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.accentRgb = hexToRgb(this.accent || "#e2603f");

    // 슬라이더 상태
    this.force = 1.0;      // 힘/기울임 세기 배수
    this.roar  = 1.0;      // 함성(셰이크·링·밴드 들썩) 세기

    // 인터랙션 상태
    this.charging = false; // 씨름꾼을 누르고 있는가
    this.gauge = 0;        // 힘 게이지 0..1
    this.throwing = false; // 들배지기 진행 중
    this.throwP = 0;       // 들배지기 진행도 0..1
    this.throwStr = 0;     // 이번 판 힘(릴리즈 시점 게이지)
    this.throwDir = 1;     // 넘기는 방향(매번 교대)
    this._nextDir = 1;
    this._slammed = false; // 이번 판 착지 처리 완료?
    this.hover = 0;        // 커서 긴장 이징 0..1
    this.shake = 0;        // 화면 셰이크 0..1
    this.bandT = -1;       // 밴드 들썩 경과(초), -1=비활성

    // 모래 먼지 풀
    this.parts = [];
    for (let i = 0; i < 60; i++) {
      this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, sz: 1, rot: 0, spin: 0, ci: 0 });
    }
    // 함성 파문 링 풀
    this.rings = [];
    for (let i = 0; i < 3; i++) this.rings.push({ x: 0, y: 0, r: 0, life: 0 });

    // 엿장수 머리 위 '…'
    this.yeotDot = 0;      // 0..1 수명

    // 밴드별 들썩 크기(1~3px) — 릴리즈마다 재추첨
    this.bandMag = [0, 0, 0, 0];

    // 이미지 두 장 로드
    this.bgReady = false; this.spReady = false; this.failed = false;
    this.bg = new Image();
    this.bg.onload = () => { this.bgReady = true; };
    this.bg.onerror = () => { this.failed = true; };
    this.bg.src = BG_SRC;
    this.sp = new Image();
    this.sp.onload = () => { this.spReady = true; };
    this.sp.onerror = () => { this.failed = true; };
    this.sp.src = SP_SRC;
  }

  get ready() { return this.bgReady && this.spReady; }

  // 배경판을 contain으로 배치(비율 유지) — 하단 캡션 여유
  _fit() {
    const W = this.w, H = this.h;
    const pad = Math.min(W, H) * 0.03;
    const aw = W - pad * 2, ah = H - pad * 2 - H * 0.05;
    const ar = BG_W / BG_H;
    let dw = aw, dh = aw / ar;
    if (dh > ah) { dh = ah; dw = ah * ar; }
    return { dx: (W - dw) / 2, dy: (H - dh) / 2 - H * 0.015, dw, dh };
  }

  // 스프라이트 화면 사각형(bbox)
  _spRect(r) {
    return {
      x: r.dx + SP_U0 * r.dw,
      y: r.dy + SP_V0 * r.dh,
      w: (SP_U1 - SP_U0) * r.dw,
      h: (SP_V1 - SP_V0) * r.dh,
    };
  }

  _inRect(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; }

  // ---- 포인터 -----------------------------------------------------------------
  onPointerDown() {
    if (!this.ready) return;
    const r = this._fit();
    const s = this._spRect(r);
    // 씨름꾼을 누르면 충전 시작
    if (this._inRect(this.pointer.x, this.pointer.y, s.x, s.y, s.w, s.h)) {
      if (!this.throwing) { this.charging = true; this.gauge = 0; }
      return;
    }
    // 엿장수를 클릭하면 '…'만 (끝까지 무심)
    const yx = r.dx + YEOT_U0 * r.dw, yy = r.dy + YEOT_V0 * r.dh;
    const yw = (YEOT_U1 - YEOT_U0) * r.dw, yh = (YEOT_V1 - YEOT_V0) * r.dh;
    if (this._inRect(this.pointer.x, this.pointer.y, yx, yy, yw, yh)) this.yeotDot = 1;
  }

  onPointerUp() {
    if (this.charging) { this.charging = false; this._release(); }
  }

  // 들배지기 격발
  _release() {
    if (this.throwing) return;
    this.throwStr = clamp(this.gauge, 0.12, 1);   // 짧게 눌러도 작게나마 걸림
    this.gauge = 0;
    this.throwDir = this._nextDir;
    this._nextDir = -this._nextDir;                // 방향 교대
    this.throwing = true;
    this.throwP = 0;
    this._slammed = false;
    // 관중 밴드 들썩 예약 + 크기 추첨(1~3px)
    this.bandT = 0;
    for (let i = 0; i < 4; i++) this.bandMag[i] = (1 + Math.random() * 2) * this.roar;
  }

  // 프로그램적 격발(버튼)
  _trigger(str) {
    if (this.throwing) return;
    this.gauge = str;
    this._release();
  }

  // 착지 순간: 모래 버스트 + 셰이크 + 함성 링
  _slam(feetX, feetY) {
    this.shake = Math.min(1, 0.7 * this.roar + this.throwStr * 0.4);
    // 함성 링 1개
    for (const ring of this.rings) {
      if (ring.life <= 0) { ring.x = feetX; ring.y = feetY; ring.r = 8; ring.life = 1; break; }
    }
    // 모래 먼지 버스트 — 발밑 좌우로 낮게 튀김
    const n = Math.round(18 + this.throwStr * 16);
    let spawned = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      const ang = (Math.random() - 0.5) * Math.PI * 0.9 - Math.PI / 2; // 위쪽 부채
      const sp = 60 + Math.random() * 160 * (0.5 + this.throwStr);
      p.x = feetX + (Math.random() - 0.5) * this.w * 0.02;
      p.y = feetY;
      p.vx = Math.cos(ang) * sp * (Math.random() < 0.5 ? -1 : 1) * 0.6 + (Math.random() - 0.5) * 80;
      p.vy = Math.sin(ang) * sp - 20;
      p.life = 1; p.max = 0.5 + Math.random() * 0.7;
      p.sz = 2 + Math.random() * 4;
      p.rot = Math.random() * TAU; p.spin = (Math.random() - 0.5) * 8;
      p.ci = (Math.random() * SAND.length) | 0;
      if (++spawned >= n) break;
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
      this._msg(g, W, H, this.failed ? "판을 불러올 수 없습니다" : "판이 열리는 중…");
      if (this.failed) { this._caption(g, W, H); return; }
      return;
    }

    const r = this._fit();
    const s = this._spRect(r);
    const pvx = s.x + s.w * 0.5;          // 피벗: 발 근처 하단 중앙
    const pvy = s.y + s.h * 0.98;

    // --- 상태 업데이트 --------------------------------------------------------
    if (this.charging) this.gauge = Math.min(1, this.gauge + dt / CHARGE_TIME);

    if (this.throwing) {
      this.throwP += dt / THROW_DUR;
      if (!this._slammed && this.throwP >= SLAM_AT) { this._slam(pvx, pvy); this._slammed = true; }
      if (this.throwP >= 1) { this.throwing = false; this.throwP = 0; }
    }

    // 호버 긴장(충전·기술 중이 아닐 때만)
    let wantHover = 0;
    if (this.pointer.active && !this.charging && !this.throwing &&
        this._inRect(this.pointer.x, this.pointer.y, s.x, s.y, s.w, s.h)) wantHover = 1;
    this.hover = lerp(this.hover, wantHover, clamp(dt * 10, 0, 1));

    // 셰이크 감쇠
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.2);
    const shMag = this.shake * Math.min(W, H) * 0.012;
    const shx = shMag ? (Math.random() - 0.5) * 2 * shMag : 0;
    const shy = shMag ? (Math.random() - 0.5) * 2 * shMag : 0;

    // 밴드 들썩 진행
    if (this.bandT >= 0) {
      this.bandT += dt;
      if (this.bandT > 0.18 + BAND_DUR) this.bandT = -1;
    }

    // --- 셰이크 그룹: 배경판·밴드·씨름꾼·모래·링 ------------------------------
    g.save();
    g.translate(shx, shy);

    // 1) 배경판(원작에서 씨름꾼만 지운 판)
    g.drawImage(this.bg, 0, 0, BG_W, BG_H, r.dx, r.dy, r.dw, r.dh);

    // 2) 관중 밴드 들썩(기술 중에만) — 뒷줄 종이 인형이 순서대로 튕김
    if (this.bandT >= 0) this._drawBands(g, r);

    // 3) 씨름꾼 누끼 — 변환 후 1회 그리기
    this._drawWrestlers(g, r, s, pvx, pvy, t);

    // 4) 모래 먼지
    this._drawParts(g, dt);

    // 5) 함성 파문 링
    this._drawRings(g, dt);

    g.restore();

    // 6) 엿장수 '…' (셰이크 밖 — 무심하게 안정)
    if (this.yeotDot > 0) { this.yeotDot = Math.max(0, this.yeotDot - dt / 1.6); this._drawYeotDot(g, r); }

    this._caption(g, W, H);
  }

  // ---- 씨름꾼 변환 -----------------------------------------------------------
  _drawWrestlers(g, r, s, pvx, pvy, t) {
    // 유휴 숨결
    let rot = Math.sin(t * 0.9) * IDLE_ROCK;
    const breathe = 1 + Math.sin(t * 1.1) * IDLE_BREATHE;
    let sx = breathe, sy = breathe, ox = 0, oy = 0;

    // 커서 긴장
    const hv = lerp(1, HOVER_SCALE, this.hover);
    sx *= hv; sy *= hv;

    // 충전: 웅크림 + 부르르 떨림
    if (this.charging) {
      const gv = this.gauge;
      sy *= 1 - CROUCH * gv;
      sx *= 1 + CROUCH * 0.5 * gv;
      const tr = gv * gv;
      rot += (Math.random() - 0.5) * 0.03 * tr;
      ox += (Math.random() - 0.5) * 3 * tr;
      oy += (Math.random() - 0.5) * 3 * tr;
    }

    // 들배지기: 기울임 + 들림(포물선) + 착지 스쿼시
    if (this.throwing) {
      const p = this.throwP, str = this.throwStr * this.force;
      rot += MAX_TILT * this.throwDir * str * Math.sin(p * Math.PI);
      if (p <= SLAM_AT) {
        // 체공: 위로 떴다 내려옴(포물선) + 이륙 스트레치
        const u = p / SLAM_AT;
        const hop = 4 * u * (1 - u);                 // 0→1→0
        oy -= s.h * 0.16 * str * hop;
        const st = 0.08 * str * Math.sin(u * Math.PI);
        sy *= 1 + st; sx *= 1 - st * 0.5;
      } else {
        // 착지: 감쇠 스프링 스쿼시(발은 붙박이)
        const u2 = (p - SLAM_AT) / (1 - SLAM_AT);
        const comp = SQUASH * str * Math.exp(-u2 * 5) * Math.cos(u2 * 14);
        sy *= 1 - comp;
        sx *= 1 + comp * 0.6;
      }
    }

    g.save();
    g.translate(pvx + ox, pvy + oy);
    g.rotate(rot);
    g.scale(sx, sy);
    g.translate(-pvx, -pvy);
    g.drawImage(this.sp, 0, 0, SP_W, SP_H, s.x, s.y, s.w, s.h);
    g.restore();

    // 충전 게이지 — 발밑에 옅은 힘 막대
    // (게이지 시각 표시 없음 — 떨림·웅크림이 곧 게이지)
  }

  _drawGauge(g, pvx, pvy, s, v) {
    const [rr, gg, bb] = this.accentRgb;
    const w = s.w * 0.7, x = pvx - w / 2, y = pvy + s.h * 0.03, h = Math.max(3, s.h * 0.02);
    g.save();
    g.fillStyle = "rgba(42,35,32,0.25)";
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgba(${rr},${gg},${bb},${0.55 + 0.35 * v})`;
    g.fillRect(x, y, w * v, h);
    g.restore();
  }

  // ---- 관중 밴드 들썩 --------------------------------------------------------
  _drawBands(g, r) {
    for (let i = 0; i < 4; i++) {
      const b = BANDS[i];
      const age = this.bandT - b[4];
      if (age <= 0 || age >= BAND_DUR) continue;
      const off = -this.bandMag[i] * Math.sin((age / BAND_DUR) * Math.PI); // 위로 튕겼다 내림
      const bx = r.dx + b[0] * r.dw, by = r.dy + b[1] * r.dh;
      const bw = (b[2] - b[0]) * r.dw, bh = (b[3] - b[1]) * r.dh;
      g.save();
      g.beginPath();
      g.rect(bx, by, bw, bh);
      g.clip();
      // 같은 배경판을 off만큼 올려 다시 그림(종이 스트립이 튕기는 느낌)
      g.drawImage(this.bg, 0, 0, BG_W, BG_H, r.dx, r.dy + off, r.dw, r.dh);
      g.restore();
    }
  }

  // ---- 모래 먼지 -------------------------------------------------------------
  _drawParts(g, dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.vy += 340 * dt;                 // 중력
      p.vx *= 1 - 1.6 * dt;             // 공기 저항
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt / p.max;
      const a = clamp(p.life, 0, 1);
      g.save();
      g.globalAlpha = a * 0.85;
      g.fillStyle = SAND[p.ci];
      g.beginPath();
      g.ellipse(p.x, p.y, p.sz * (1 + (1 - a) * 0.6), p.sz * 0.8, p.rot, 0, TAU);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // ---- 함성 파문 링 ----------------------------------------------------------
  _drawRings(g, dt) {
    const [rr, gg, bb] = this.accentRgb;
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.r += (this.w + this.h) * 0.34 * dt;
      ring.life -= dt * 1.1;
      const a = clamp(ring.life, 0, 1);
      g.save();
      g.strokeStyle = `rgba(${rr},${gg},${bb},${0.30 * a * this.roar})`;
      g.lineWidth = 2 + 4 * a;
      g.beginPath();
      g.arc(ring.x, ring.y, ring.r, 0, TAU);
      g.stroke();
      g.restore();
    }
  }

  // ---- 엿장수 '…' ------------------------------------------------------------
  _drawYeotDot(g, r) {
    const a = this._ease(this.yeotDot);
    const cx = r.dx + ((YEOT_U0 + YEOT_U1) * 0.5) * r.dw;
    const cy = r.dy + YEOT_V0 * r.dh - r.dh * 0.02 - (1 - this.yeotDot) * r.dh * 0.02;
    const R = Math.max(3, Math.min(this.w, this.h) * 0.006);
    g.save();
    g.globalAlpha = a;
    // 작은 말풍선
    g.fillStyle = "rgba(248,244,232,0.92)";
    g.strokeStyle = "rgba(42,35,32,0.35)";
    g.lineWidth = 1;
    const pw = R * 9, ph = R * 5;
    this._roundRect(g, cx - pw / 2, cy - ph, pw, ph, R * 1.6);
    g.fill(); g.stroke();
    // 꼬리
    g.beginPath();
    g.moveTo(cx - R, cy);
    g.lineTo(cx + R, cy);
    g.lineTo(cx, cy + R * 2);
    g.closePath();
    g.fill();
    // 세 점
    g.fillStyle = "rgba(42,35,32,0.8)";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(cx + (i - 1) * R * 2.2, cy - ph / 2, R * 0.7, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  _roundRect(g, x, y, w, h, rad) {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }

  _ease(x) { return x * x * (3 - 2 * x); }

  // ---- 한지 배경 -------------------------------------------------------------
  _paperBg(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, HANJI_TOP);
    bg.addColorStop(1, HANJI_BOT);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
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

  _caption() {}   // 설명 캡션 제거 — 판 자체가 말한다 (안내는 플래카드/힌트바)

  controls(host) {
    host.appendChild(slider("힘 (force)", 0.3, 1.8, this.force, 0.05, (v) => (this.force = v)));
    host.appendChild(slider("함성 (roar)", 0.2, 2, this.roar, 0.05, (v) => (this.roar = v)));
    host.appendChild(buttonRow([
      { label: "한 판 붙자!", on: () => { if (this.ready) this._trigger(0.9); } },
    ]));
  }

  teardown() {
    this.bg = null;
    this.sp = null;
    this.parts = null;
    this.rings = null;
  }
}
