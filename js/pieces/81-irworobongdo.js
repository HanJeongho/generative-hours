// ============================================================================
//  81 · 일월오봉도 (Irworobongdo — 살아있는 병풍)
//  조선 왕의 어좌 뒤에 서던 〈일월오봉도〉 원작(assets/art/irworobongdo.jpg,
//  2400×1038: 다섯 봉우리 + 해 + 달 + 소나무 + 두 줄기 폭포 + 하단 파도)을
//  무대로 깔고, 그 위에 '살아 있는 우주'를 얹는다 — 원작을 훼손하지 않는 가산
//  셰이딩으로만.
//
//  · 실시간 하늘: 지금 이 순간의 시각(new Date)에 따라 원작의 붉은 해 자리에
//    발광하는 해가 타오르고(낮), 밤엔 달이 오늘의 실제 위상으로 은은히 빛난다.
//    새벽·황혼엔 화면 전체 색온도가 장밋빛으로 물들고, 정오·자정 부근(±2분)엔
//    해·달 교대 의식 — 빛기둥이 서고 파문이 번진다.
//  · 폭포: 원작 두 줄기 위치에 흰 입자 폭포가 흐른다(입자 풀, 이미지 정규
//    좌표계라 리사이즈에 무관). 하단 파도 띠는 사인 물결 오버레이로 굼실댄다.
//  · 바람: 드래그하면 좌우 소나무 영역이 39식 국소 워프(가로 전단)로 흔들리고
//    솔잎 입자가 바람 따라 날린다.
//
//  해/달/폭포/파도/소나무 좌표는 모두 이미지 비율(0..1) 기준 상수로 최상단에
//  노출 — 중앙에서 시각 캘리브레이션 예정(현재 대략값). 60fps: 파티클 풀 재사용,
//  핫루프 무할당. 하단 한국어 캡션 한 줄.
// ============================================================================

import { Piece, TAU, clamp, lerp, map, rand, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const IMG_SRC = "assets/art/irworobongdo.jpg";
const IMG_W = 2400, IMG_H = 1038;

// ---- 이미지 비율(0..1) 기준 좌표 상수 (중앙 캘리브레이션 대상, 대략값) --------
const SUN   = { x: 0.77, y: 0.27, r: 0.052 };   // 원작의 붉은 해
const MOON  = { x: 0.23, y: 0.27, r: 0.048 };   // 원작의 흰 달
const FALLS = [                                  // 폭포 두 줄기 (x, 위→아래 v)
  { x: 0.345, y0: 0.46, y1: 0.85, w: 0.020 },
  { x: 0.775, y0: 0.46, y1: 0.85, w: 0.020 },
];
const WAVE   = { y0: 0.78, y1: 1.0 };            // 하단 파도 띠
const PINE_L = { u0: 0.00, u1: 0.18 };           // 좌측 소나무 영역
const PINE_R = { u0: 0.82, u1: 1.00 };           // 우측 소나무 영역
const CAPTION = "왕의 병풍에는 해와 달이 함께 떠 있다 — 지금 이 순간의 하늘로.";

const N_DROPS   = 260;    // 폭포 입자 풀
const N_NEEDLES = 160;    // 솔잎 입자 풀

export default class Irworobongdo extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    // 컨트롤 상태
    this.water = 1.0;      // 폭포·파도 세기
    this.windGain = 1.0;   // 바람 감도
    this.timeMode = null;  // null=실시간, 아니면 미리보기 시각(시)
    this.previewH = 12;

    // 바람 (드래그) — eased 정규화 속도
    this.windX = 0;

    // 폭포 입자 풀 (이미지 정규 좌표 u,v)
    this.drops = new Array(N_DROPS);
    for (let i = 0; i < N_DROPS; i++) this.drops[i] = this._newDrop(true);

    // 솔잎 입자 풀 (정규 좌표 + 속도)
    this.needles = new Array(N_NEEDLES);
    for (let i = 0; i < N_NEEDLES; i++) {
      this.needles[i] = { u: 0, v: 0, du: 0, dv: 0, life: 0, rot: 0, seed: Math.random() };
    }
    this._needleCursor = 0;

    // 이미지 로드 — great-wave / the-scream 하우스 패턴
    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  // ---- 폭포 입자 하나 (재사용) ---------------------------------------------
  _newDrop(spread) {
    const f = FALLS[(Math.random() * FALLS.length) | 0];
    return {
      f,
      u: f.x + rand(-0.5, 0.5) * f.w,
      v: spread ? rand(f.y0, f.y1) : f.y0 - rand(0, 0.02),
      vv: rand(0.55, 1.05),                 // v-units/sec
      len: rand(0.02, 0.06),
      seed: Math.random(),
    };
  }

  // ---- 이미지 → 화면 매핑 (contain, 약간의 여백) ----------------------------
  _stageRect() {
    const W = this.w, H = this.h;
    const pad = Math.min(W, H) * 0.03;
    const aw = W - pad * 2, ah = H - pad * 2;
    const ar = IMG_W / IMG_H;
    let dw = aw, dh = aw / ar;
    if (dh > ah) { dh = ah; dw = ah * ar; }
    return { dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh };
  }
  _sx(u, r) { return r.dx + u * r.dw; }
  _sy(v, r) { return r.dy + v * r.dh; }

  // ---- 지금(또는 미리보기)의 하늘 상태 -------------------------------------
  _clock() {
    const d = new Date();
    const liveH = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const h = this.timeMode == null ? liveH : this.previewH;

    // 달 위상 (삭망월) — 항상 오늘의 실제 위상
    const synodic = 29.530588853;
    const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14, 0)) / 86400000;
    const phase = ((days / synodic) % 1 + 1) % 1;       // 0=삭 .5=망
    const illum = (1 - Math.cos(phase * TAU)) / 2;       // 조도 0..1

    const sun = clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1);  // 낮 강도
    const moon = clamp((1 - sun - 0.12) / 0.88, 0, 1) * (0.25 + 0.75 * illum);
    // 새벽·황혼 색온도 범프
    const bump = (c, w) => clamp(1 - Math.abs(h - c) / w, 0, 1);
    const twilight = Math.max(bump(6.2, 1.7), bump(17.8, 1.7));
    const nightness = clamp(1 - sun, 0, 1) * (1 - twilight * 0.6);

    // 정오/자정 교대 의식 (±2분)
    const toNoon = Math.abs(h - 12) * 60;
    const toMid = Math.min(h, 24 - h) * 60;
    const ritual = clamp(1 - Math.min(toNoon, toMid) / 2, 0, 1);
    const ritualSun = toNoon <= toMid;

    return { h, sun, moon, phase, twilight, nightness, ritual, ritualSun,
             sec: d.getSeconds() + d.getMilliseconds() / 1000 };
  }

  // ---- 드래그 = 바람 --------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // 로딩/실패 폴백 — 화면이 비지 않게
    if (!this.ready) { this._drawFallback(g, W, H, t); return; }

    const r = this._stageRect();
    const sky = this._clock();

    // 바람 easing: 포인터 수평 속도 → 정규화, 감쇠
    const targetWind = (this.pointer.down && this.pointer.active)
      ? clamp((this.pointer.vx / Math.max(1, r.dw)) * 14 * this.windGain, -1.4, 1.4) : 0;
    this.windX = lerp(this.windX, targetWind, dt * 6);
    const breeze = Math.sin(t * 0.5) * 0.18 + this.noise(t * 0.12, 3.1) * 0.22;
    const windAmp = this.windX * 3.2 + breeze;

    // 어두운 무대 여백
    g.fillStyle = "#0b0a12";
    g.fillRect(0, 0, W, H);

    // 1) 원작 이미지 무대
    g.drawImage(this.img, 0, 0, IMG_W, IMG_H, r.dx, r.dy, r.dw, r.dh);

    // 2) 소나무 바람 워프 (원작 위 국소 전단) + 솔잎 방출
    this._drawPine(g, PINE_L, r, t, windAmp);
    this._drawPine(g, PINE_R, r, t, windAmp);
    this._updateNeedles(g, r, dt, t);

    // 3) 색온도 그레이딩 (밤 냉각 / 여명 온화) — 그림 위에 곱/소프트라이트
    this._grade(g, W, H, sky);

    // 4) 해·달 (가산광 — 밤에도 광원으로 관통)
    this._drawSun(g, r, sky, t);
    this._drawMoon(g, r, sky, t);

    // 5) 폭포 + 파도 (가산)
    this._drawFalls(g, r, dt, t);
    this._drawWaves(g, r, t);

    // 6) 교대 의식 빛기둥 + 파문
    if (sky.ritual > 0.001) this._drawRitual(g, r, sky, t);

    // 7) 비네트 + 캡션
    this._vignette(g, W, H);
    this._caption(g, W, H);
  }

  // ---- 소나무 가로 전단 워프 (39식 소스 변위, 원작 위 덮어그림) -------------
  _drawPine(g, reg, r, t, windAmp) {
    const x0 = this._sx(reg.u0, r), w = (reg.u1 - reg.u0) * r.dw;
    const sx = reg.u0 * IMG_W, sw = (reg.u1 - reg.u0) * IMG_W;
    const rows = 24, rh = r.dh / rows, srh = IMG_H / rows;
    const phase = reg.u0 * 9.0;
    g.save();
    g.beginPath(); g.rect(x0, r.dy, w, r.dh); g.clip();
    for (let i = 0; i < rows; i++) {
      const v = i / rows;
      const anchor = v;                       // 아래(뿌리)일수록 덜 흔들림
      const n = this.noise(v * 3.2 + phase, t * 0.35);
      const sway = (Math.sin(t * 1.7 + v * 6 + phase) * 0.6 + n * 0.4) * (0.3 + anchor);
      const off = (sway * 0.35 + windAmp * anchor) * r.dw * 0.03;
      g.drawImage(this.img, sx, i * srh, sw, srh, x0 + off, r.dy + i * rh, w, rh + 1);
    }
    g.restore();

    // 강풍이면 솔잎 방출 (풀에서 죽은 것 재사용)
    if (Math.abs(windAmp) > 0.7) {
      const n = 1 + (Math.abs(windAmp) * 2) | 0;
      for (let k = 0; k < n; k++) {
        const p = this.needles[this._needleCursor];
        this._needleCursor = (this._needleCursor + 1) % N_NEEDLES;
        p.u = reg.u0 + Math.random() * (reg.u1 - reg.u0);
        p.v = rand(0.15, 0.7);
        p.du = windAmp * 0.10 + rand(-0.02, 0.02);
        p.dv = rand(0.02, 0.10);
        p.life = rand(1.2, 2.6);
        p.rot = Math.random() * TAU;
        p.seed = Math.random();
      }
    }
  }

  _updateNeedles(g, r, dt, t) {
    g.save();
    g.strokeStyle = "rgba(60,84,52,0.7)";
    g.lineWidth = 1.4;
    g.lineCap = "round";
    for (let i = 0; i < N_NEEDLES; i++) {
      const p = this.needles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.dv += dt * 0.05;                       // 미세 중력
      p.du += this.noise(p.u * 5 + t, p.v * 5) * dt * 0.04;
      p.u += p.du * dt; p.v += p.dv * dt;
      p.rot += (p.du + 0.01) * dt * 6;
      if (p.v > 1.02 || p.u < -0.05 || p.u > 1.05) { p.life = 0; continue; }
      const x = this._sx(p.u, r), y = this._sy(p.v, r);
      const len = 5 + p.seed * 4;
      const a = clamp(p.life * 0.5, 0, 0.72);
      g.globalAlpha = a;
      g.beginPath();
      g.moveTo(x - Math.cos(p.rot) * len, y - Math.sin(p.rot) * len);
      g.lineTo(x + Math.cos(p.rot) * len, y + Math.sin(p.rot) * len);
      g.stroke();
    }
    g.restore();
  }

  // ---- 색온도 그레이딩 ------------------------------------------------------
  _grade(g, W, H, sky) {
    if (sky.nightness > 0.01) {
      g.save();
      g.globalCompositeOperation = "multiply";
      g.globalAlpha = clamp(sky.nightness * 0.6, 0, 0.62);
      const ng = g.createLinearGradient(0, 0, 0, H);
      ng.addColorStop(0, "#1a2b4d");           // 상단 남빛
      ng.addColorStop(1, "#0c1226");           // 하단 짙은 감청
      g.fillStyle = ng; g.fillRect(0, 0, W, H);
      g.restore();
    }
    if (sky.twilight > 0.01) {
      g.save();
      g.globalCompositeOperation = "soft-light";
      g.globalAlpha = clamp(sky.twilight * 0.55, 0, 0.6);
      const tg = g.createLinearGradient(0, 0, 0, H);
      tg.addColorStop(0, "#ffb27a");           // 장밋빛 여명
      tg.addColorStop(1, "#e2603f");           // 단청 주홍(관 accent)
      g.fillStyle = tg; g.fillRect(0, 0, W, H);
      g.restore();
    }
  }

  // ---- 해 (가산 발광) -------------------------------------------------------
  _drawSun(g, r, sky, t) {
    const x = this._sx(SUN.x, r), y = this._sy(SUN.y, r);
    const R = SUN.r * r.dw;
    const pulse = 1 + Math.sin(t * 1.2) * 0.03;
    const intensity = 0.28 + sky.sun * 0.72;   // 밤엔 잔불로
    g.save();
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(x, y, 0, x, y, R * 3.4 * pulse);
    glow.addColorStop(0, `rgba(255,232,180,${0.55 * intensity})`);
    glow.addColorStop(0.28, `rgba(255,150,70,${0.34 * intensity})`);
    glow.addColorStop(1, "rgba(226,96,63,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, R * 3.4 * pulse, 0, TAU); g.fill();
    // 핵
    const core = g.createRadialGradient(x, y, 0, x, y, R);
    core.addColorStop(0, `rgba(255,244,214,${0.9 * intensity})`);
    core.addColorStop(1, `rgba(255,168,86,${0.15 * intensity})`);
    g.fillStyle = core;
    g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    g.restore();
  }

  // ---- 달 (오늘의 실제 위상, 가산 은빛) -------------------------------------
  _drawMoon(g, r, sky, t) {
    const x = this._sx(MOON.x, r), y = this._sy(MOON.y, r);
    const R = MOON.r * r.dw;
    const intensity = 0.12 + sky.moon * 0.9;
    g.save();
    g.globalCompositeOperation = "lighter";
    // 헤일로
    const glow = g.createRadialGradient(x, y, 0, x, y, R * 3.0);
    glow.addColorStop(0, `rgba(214,226,255,${0.34 * intensity})`);
    glow.addColorStop(1, "rgba(150,170,220,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, R * 3.0, 0, TAU); g.fill();

    // 위상 조명 폴리곤 (limb + terminator, 부호로 삭↔망 통일)
    const p = sky.phase;
    const side = p <= 0.5 ? 1 : -1;
    const k = Math.cos(p * TAU);
    g.beginPath();
    const STEP = 34;
    for (let i = 0; i <= STEP; i++) {          // 밝은 가장자리(limb)
      const a = -Math.PI / 2 + (i / STEP) * Math.PI;
      g.lineTo(x + side * R * Math.cos(a), y + R * Math.sin(a));
    }
    for (let i = STEP; i >= 0; i--) {           // 명암 경계(terminator)
      const a = -Math.PI / 2 + (i / STEP) * Math.PI;
      g.lineTo(x + side * R * k * Math.cos(a), y + R * Math.sin(a));
    }
    g.closePath();
    const mg = g.createRadialGradient(x, y, 0, x, y, R);
    mg.addColorStop(0, `rgba(240,246,255,${0.92 * intensity})`);
    mg.addColorStop(1, `rgba(196,212,246,${0.4 * intensity})`);
    g.fillStyle = mg;
    g.fill();
    g.restore();
  }

  // ---- 폭포 (흰 입자 두 줄기 + 안개 베일) -----------------------------------
  _drawFalls(g, r, dt, t) {
    const wf = this.water;
    g.save();
    g.globalCompositeOperation = "lighter";
    // 베일
    for (let fi = 0; fi < FALLS.length; fi++) {
      const f = FALLS[fi];
      const cx = this._sx(f.x, r), top = this._sy(f.y0, r), bot = this._sy(f.y1, r);
      const halfW = f.w * r.dw;
      const veil = g.createLinearGradient(0, top, 0, bot);
      veil.addColorStop(0, `rgba(240,248,255,${0.14 * wf})`);
      veil.addColorStop(1, "rgba(210,230,255,0)");
      g.fillStyle = veil;
      g.fillRect(cx - halfW, top, halfW * 2, bot - top);
    }
    // 입자
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 1.3;
    for (let i = 0; i < N_DROPS; i++) {
      const d = this.drops[i];
      d.v += d.vv * dt * (0.6 + wf * 0.6);
      const jitter = Math.sin(t * 3 + d.seed * 9) * d.f.w * 0.35;
      if (d.v > d.f.y1) { const nu = this._newDrop(false); Object.assign(d, nu); continue; }
      const narrow = map(d.v, d.f.y0, d.f.y1, 1, 0.4);
      const x = this._sx(d.f.x + (d.u - d.f.x) * narrow + jitter, r);
      const y1 = this._sy(d.v, r), y0 = this._sy(d.v - d.len, r);
      g.globalAlpha = clamp(0.35 + d.seed * 0.5, 0, 0.85) * (0.4 + wf * 0.6);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    }
    g.restore();
  }

  // ---- 하단 파도 띠 (사인 물결 오버레이, 가산) ------------------------------
  _drawWaves(g, r, t) {
    const wf = this.water;
    const y0 = this._sy(WAVE.y0, r), y1 = this._sy(WAVE.y1, r);
    const band = y1 - y0;
    g.save();
    g.globalCompositeOperation = "lighter";
    const CRESTS = 6;
    for (let c = 0; c < CRESTS; c++) {
      const cy = y0 + band * (c + 0.5) / CRESTS;
      const amp = band * 0.05 * (0.5 + c / CRESTS);
      const freq = 0.008 + c * 0.0016;
      const spd = t * (0.5 + c * 0.12);
      g.beginPath();
      for (let x = r.dx; x <= r.dx + r.dw; x += 10) {
        const yy = cy + Math.sin(x * freq + spd + c) * amp
                      + this.noise(x * 0.003, c + t * 0.2) * amp * 0.6;
        if (x === r.dx) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.strokeStyle = `rgba(226,240,255,${(0.05 + 0.05 * (c / CRESTS)) * wf})`;
      g.lineWidth = 1.6;
      g.stroke();
    }
    g.restore();
  }

  // ---- 해·달 교대 의식: 빛기둥 + 파문 ---------------------------------------
  _drawRitual(g, r, sky, t) {
    const body = sky.ritualSun ? SUN : MOON;
    const x = this._sx(body.x, r), y = this._sy(body.y, r);
    const a = sky.ritual;
    const col = sky.ritualSun ? "255,220,150" : "210,224,255";
    g.save();
    g.globalCompositeOperation = "lighter";
    // 빛기둥
    const pillar = g.createLinearGradient(x, r.dy, x, r.dy + r.dh);
    pillar.addColorStop(0, `rgba(${col},0)`);
    pillar.addColorStop(clamp(body.y, 0, 1), `rgba(${col},${0.5 * a})`);
    pillar.addColorStop(1, `rgba(${col},0)`);
    const pw = r.dw * 0.05;
    g.fillStyle = pillar;
    g.fillRect(x - pw, r.dy, pw * 2, r.dh);
    // 파문 (무할당: 위상만 t)
    const maxR = r.dw * 0.22;
    for (let i = 0; i < 3; i++) {
      const rr = ((t * 0.4 + i / 3) % 1);
      g.globalAlpha = (1 - rr) * a * 0.5;
      g.strokeStyle = `rgba(${col},1)`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, rr * maxR, 0, TAU); g.stroke();
    }
    g.restore();
  }

  // ---- 비네트 --------------------------------------------------------------
  _vignette(g, W, H) {
    const vg = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.34,
                                      W / 2, H * 0.55, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(6,6,12,0.42)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  // ---- 하단 캡션 한 줄 ------------------------------------------------------
  _caption(g, W, H) {
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = "rgba(240,232,214,0.92)";
    g.font = `500 ${Math.max(11, Math.min(W, H) * 0.020)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText(CAPTION, W / 2, H - Math.max(14, H * 0.035));
    g.restore();
  }

  // ---- 폴백 (로딩/실패) — 오봉 실루엣으로 화면을 채운다 ---------------------
  _drawFallback(g, W, H, t) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#e9ddc4"); bg.addColorStop(1, "#c9b48c");   // 한지 톤
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 다섯 봉우리
    g.fillStyle = "#2c3d63";
    const base = H * 0.72, pk = [0.5, 0.28, 0.72, 0.12, 0.88];
    for (let i = 0; i < 5; i++) {
      const cx = W * pk[i], ph = H * (0.34 - Math.abs(i - 2) * 0.03);
      g.beginPath(); g.moveTo(cx, base - ph);
      g.lineTo(cx + W * 0.11, base); g.lineTo(cx - W * 0.11, base); g.closePath(); g.fill();
    }
    // 해 / 달
    g.fillStyle = "#e2603f"; g.beginPath(); g.arc(W * 0.77, H * 0.24, W * 0.03, 0, TAU); g.fill();
    g.fillStyle = "#f2f0ea"; g.beginPath(); g.arc(W * 0.23, H * 0.24, W * 0.026, 0, TAU); g.fill();
    g.fillStyle = "rgba(40,30,18,0.8)";
    g.font = `600 ${Math.max(13, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText(this.failed ? "병풍을 펼치지 못했습니다 — 그림을 불러올 수 없습니다"
                           : "병풍을 펼치는 중…", W / 2, base + H * 0.12);
    g.textAlign = "left";
  }

  // ---- 컨트롤 (슬라이더 2 + 시각 미리보기 버튼) -----------------------------
  controls(host) {
    host.appendChild(slider("물살 (water)", 0, 2, this.water, 0.05, (v) => (this.water = v)));
    host.appendChild(slider("바람 (wind)", 0, 2, this.windGain, 0.05, (v) => (this.windGain = v)));
    host.appendChild(buttonRow([
      { label: "지금 (now)", on: () => { this.timeMode = null; } },
      { label: "정오 (noon)", on: () => { this.timeMode = "p"; this.previewH = 12; } },
      { label: "황혼 (dusk)", on: () => { this.timeMode = "p"; this.previewH = 17.9; } },
      { label: "밤 (night)", on: () => { this.timeMode = "p"; this.previewH = 0.02; } },
    ]));
  }

  teardown() {
    this.img = null;
    this.drops = null;
    this.needles = null;
  }
}
