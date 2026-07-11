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
//  · 폭포: 흰 입자 폭포를 걷어내고, "원작에 그려진 폭포 그 자체"가 흐른다. 로드
//    시 두 폭포 영역(FALLS rect)을 오프스크린에 떠서, 매 프레임 그 영역을 가로
//    스트립으로 잘라 아래로 순환시켜 원작의 획·굵기·색감 그대로 미끄러져 내리게
//    한다. 순환 이음새는 반 주기 어긋난 두 겹을 크로스페이드해 감춘다. 밝은
//    물줄기 획에는 로드 시 샘플한 밝은 픽셀 자리에만 은은한 shimmer(가산)를
//    소량 얹되 원작보다 튀지 않는다. 가장자리는 페더로 정지한 그림에 녹인다.
//  · 하단 파도 띠는 은은한 사인 물결 오버레이로만 굼실댄다.
//  · 인터랙션: 드래그(누름)하면 '바람'이 아니라 폭포·파도의 흐름이 잠깐 빨라진다.
//
//  해/달/폭포 좌표는 모두 이미지 비율(0..1) 기준 상수로 최상단에 노출. 60fps:
//  오프스크린 재사용, 핫루프 무할당(스프라이트/그라디언트는 로드 시 1회 베이크).
// ============================================================================

import { Piece, TAU, clamp, lerp, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const IMG_SRC = "assets/art/irworobongdo.jpg";
const IMG_W = 2400, IMG_H = 1038;

// ---- 이미지 비율(0..1) 기준 좌표 상수 (중앙 캘리브레이션 대상) -----------------
const SUN  = { x: 0.77, y: 0.27, r: 0.052 };   // 원작의 붉은 해
const MOON = { x: 0.23, y: 0.27, r: 0.048 };   // 원작의 흰 달
// 폭포 두 줄기: 원작에 그려진 흰 물줄기를 감싸는 rect(이미지 비율). 이 영역만
// 잘라 아래로 흐르게 한다. (원작 계측으로 보정한 값 — 필요시 조정)
const FALLS = [
  { x0: 0.185, x1: 0.238, y0: 0.42, y1: 0.75 },   // 좌측 폭포
  { x0: 0.758, x1: 0.812, y0: 0.42, y1: 0.75 },   // 우측 폭포
];
const WAVE = { y0: 0.78, y1: 1.0 };            // 하단 파도 띠
const CAPTION = "왕의 병풍에는 해와 달이 함께 떠 있다 — 지금 이 순간의 하늘로.";

const FLOW_STRIP = 4;      // 흐름 스트립 높이(소스 px)
const FLOW_JIT   = 1.3;    // 스트립 가로 지터(소스 px)
const FLOW_SPEED = 0.14;   // 기본 순환 속도(주기/초, water=1 기준)
const N_SPARK    = 34;     // 폭포당 shimmer 점 최대치

export default class Irworobongdo extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    // 컨트롤 상태
    this.water = 1.0;      // 흐름 속도 + 파도 세기 master
    this.shimmer = 1.0;    // 물빛 반짝임 세기
    this.timeMode = null;  // null=실시간, 아니면 미리보기 시각(시)
    this.previewH = 12;

    // 흐름 위상(누적) + 드래그 부스트
    this.flowPhase = 0;
    this.flowBoost = 0;

    // 폭포 오프스크린(로드 후 채워짐)
    this.falls = null;
    this._sprite = null;

    // 이미지 로드 — great-wave / the-scream 하우스 패턴
    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this._buildFalls(); this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  // ---- 로드 시 1회: 폭포 영역 오프스크린 + shimmer 샘플 + 페더 마스크 ----------
  _buildFalls() {
    // 공용 shimmer 스프라이트(가산 흰 글로우) — 1회 베이크
    const S = 64;
    const spr = document.createElement("canvas");
    spr.width = S; spr.height = S;
    const sg = spr.getContext("2d");
    const rg = sg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, "rgba(255,255,255,0.95)");
    rg.addColorStop(0.4, "rgba(240,248,255,0.35)");
    rg.addColorStop(1, "rgba(210,230,255,0)");
    sg.fillStyle = rg; sg.fillRect(0, 0, S, S);
    this._sprite = spr;

    this.falls = FALLS.map((F) => {
      const rw = Math.max(1, Math.round((F.x1 - F.x0) * IMG_W));
      const rh = Math.max(1, Math.round((F.y1 - F.y0) * IMG_H));
      const sx = F.x0 * IMG_W, sy = F.y0 * IMG_H;
      const sw = (F.x1 - F.x0) * IMG_W, sh = (F.y1 - F.y0) * IMG_H;

      // 원작 영역 텍스처
      const tex = document.createElement("canvas");
      tex.width = rw; tex.height = rh;
      tex.getContext("2d").drawImage(this.img, sx, sy, sw, sh, 0, 0, rw, rh);

      // 매 프레임 흐름을 합성할 스크래치
      const scratch = document.createElement("canvas");
      scratch.width = rw; scratch.height = rh;
      const sctx = scratch.getContext("2d");

      // 가장자리 페더 마스크(정지한 그림에 녹이기)
      const mask = document.createElement("canvas");
      mask.width = rw; mask.height = rh;
      const mctx = mask.getContext("2d");
      mctx.fillStyle = "#fff"; mctx.fillRect(0, 0, rw, rh);
      const hgm = mctx.createLinearGradient(0, 0, rw, 0);
      hgm.addColorStop(0, "rgba(255,255,255,0)");
      hgm.addColorStop(0.30, "#fff");
      hgm.addColorStop(0.70, "#fff");
      hgm.addColorStop(1, "rgba(255,255,255,0)");
      mctx.globalCompositeOperation = "destination-in";
      mctx.fillStyle = hgm; mctx.fillRect(0, 0, rw, rh);
      const vgm = mctx.createLinearGradient(0, 0, 0, rh);
      vgm.addColorStop(0, "rgba(255,255,255,0)");
      vgm.addColorStop(0.10, "#fff");
      vgm.addColorStop(0.80, "#fff");
      vgm.addColorStop(1, "rgba(255,255,255,0)");
      mctx.fillStyle = vgm; mctx.fillRect(0, 0, rw, rh);
      mctx.globalCompositeOperation = "source-over";

      // 밝은 물줄기 픽셀 샘플 → shimmer 점(정규 좌표 u,v,밝기,seed)
      const spark = [];
      try {
        const data = tex.getContext("2d").getImageData(0, 0, rw, rh).data;
        const step = Math.max(2, Math.round(rw / 24));
        for (let y = 0; y < rh && spark.length < N_SPARK * 4; y += step) {
          for (let x = 0; x < rw; x += step) {
            const o = (y * rw + x) * 4;
            const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
            if (lum > 205 && Math.random() < 0.5) {
              spark.push(x / rw, y / rh, clamp((lum - 205) / 50, 0, 1), Math.random());
              if (spark.length >= N_SPARK * 4) break;
            }
          }
        }
      } catch (e) { /* 동일 출처라 정상적으로는 도달 안 함 */ }

      return {
        tex, rw, rh, scratch, sctx, mask,
        spark: new Float32Array(spark),
        sparkR: Math.max(3, rw * 0.09),
      };
    });
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

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // 로딩/실패 폴백 — 화면이 비지 않게
    if (!this.ready) { this._drawFallback(g, W, H, t); return; }

    const r = this._stageRect();
    const sky = this._clock();

    // 드래그 = 흐름 부스트(바람 아님)
    const drag = (this.pointer.down && this.pointer.active) ? 1 : 0;
    this.flowBoost = lerp(this.flowBoost, drag, dt * 3);
    const flowMul = (0.4 + this.water * 0.6) * (1 + this.flowBoost * 1.4);
    this.flowPhase += dt * FLOW_SPEED * flowMul;
    if (this.flowPhase > 1e6) this.flowPhase -= 1e6;   // 장시간 방지

    // 어두운 무대 여백
    g.fillStyle = "#0b0a12";
    g.fillRect(0, 0, W, H);

    // 1) 원작 이미지 무대
    g.drawImage(this.img, 0, 0, IMG_W, IMG_H, r.dx, r.dy, r.dw, r.dh);

    // 2) 폭포: 원작 물줄기 영역이 아래로 흐른다(원작 획·색 그대로)
    this._drawFalls(g, r, t);

    // 3) 색온도 그레이딩 (밤 냉각 / 여명 온화) — 그림·폭포 위에 곱/소프트라이트
    this._grade(g, W, H, sky);

    // 4) 해·달 (가산광 — 밤에도 광원으로 관통)
    this._drawSun(g, r, sky, t);
    this._drawMoon(g, r, sky, t);

    // 5) 하단 파도 (은은한 가산 오버레이)
    this._drawWaves(g, r, t);

    // 6) 교대 의식 빛기둥 + 파문
    if (sky.ritual > 0.001) this._drawRitual(g, r, sky, t);

    // 7) 비네트 + 캡션
    this._vignette(g, W, H);
    this._caption(g, W, H);
  }

  // ---- 폭포: 원작 영역을 가로 스트립으로 잘라 아래로 순환 + 크로스페이드 ------
  _drawFalls(g, r, t) {
    if (!this.falls) return;
    const fr = this.flowPhase - Math.floor(this.flowPhase);   // 0..1
    for (let i = 0; i < this.falls.length; i++) {
      const F = FALLS[i], fx = this.falls[i];
      if (!fx) continue;
      const rw = fx.rw, rh = fx.rh, sg = fx.sctx, tex = fx.tex;

      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.clearRect(0, 0, rw, rh);
      sg.globalCompositeOperation = "source-over";

      const scrollA = fr * rh;
      const scrollB = ((fr + 0.5) % 1) * rh;
      for (let sy = 0; sy < rh; sy += FLOW_STRIP) {
        const h = Math.min(FLOW_STRIP, rh - sy);
        const jit = this.noise(i * 9.3 + sy * 0.05, t * 0.6) * FLOW_JIT;

        // A겹(전량) — 아래로 순환
        const ay = ((sy - scrollA) % rh + rh) % rh;
        const ah = Math.min(h, rh - ay);
        sg.globalAlpha = 1;
        sg.drawImage(tex, 0, ay, rw, ah, jit, sy, rw, ah);
        if (ah < h) sg.drawImage(tex, 0, 0, rw, h - ah, jit, sy + ah, rw, h - ah);

        // B겹(반 주기 어긋남) — 이음새를 덮는 크로스페이드
        const by = ((sy - scrollB) % rh + rh) % rh;
        const wB = 0.5 - 0.5 * Math.cos((by / rh) * TAU);   // seam=0, 중앙=1
        const bh = Math.min(h, rh - by);
        sg.globalAlpha = wB;
        sg.drawImage(tex, 0, by, rw, bh, -jit, sy, rw, bh);
        if (bh < h) sg.drawImage(tex, 0, 0, rw, h - bh, -jit, sy + bh, rw, h - bh);
      }
      sg.globalAlpha = 1;

      // 물빛 shimmer(원작 밝은 픽셀 자리, 물과 함께 아래로 흐름) — 가산
      const sp = fx.spark;
      if (this.shimmer > 0.01 && sp && sp.length) {
        sg.globalCompositeOperation = "lighter";
        for (let k = 0; k < sp.length; k += 4) {
          const u0 = sp[k], v0 = sp[k + 1], b = sp[k + 2], seed = sp[k + 3];
          const vy = ((v0 + fr) % 1) * rh;
          const tw = 0.45 + 0.55 * Math.sin(t * 2.2 + seed * TAU);
          const a = clamp(b * tw * 0.45 * this.shimmer, 0, 0.55);
          if (a <= 0.001) continue;
          const rr = fx.sparkR * (0.7 + b * 0.6);
          sg.globalAlpha = a;
          sg.drawImage(this._sprite, u0 * rw - rr, vy - rr, rr * 2, rr * 2);
        }
        sg.globalAlpha = 1;
        sg.globalCompositeOperation = "source-over";
      }

      // 가장자리 페더(정지한 원작에 녹이기)
      sg.globalCompositeOperation = "destination-in";
      sg.drawImage(fx.mask, 0, 0);
      sg.globalCompositeOperation = "source-over";

      // 무대의 원작 폭포 자리에 흐르는 폭포를 겹쳐 그린다
      const X0 = this._sx(F.x0, r), Y0 = this._sy(F.y0, r);
      const SW = (F.x1 - F.x0) * r.dw, SH = (F.y1 - F.y0) * r.dh;
      g.drawImage(fx.scratch, 0, 0, rw, rh, X0, Y0, SW, SH);
    }
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

  // ---- 하단 파도 띠 (은은한 사인 물결 오버레이, 가산) -----------------------
  _drawWaves(g, r, t) {
    const wf = this.water;
    const y0 = this._sy(WAVE.y0, r), y1 = this._sy(WAVE.y1, r);
    const band = y1 - y0;
    g.save();
    g.globalCompositeOperation = "lighter";
    const CRESTS = 5;
    for (let c = 0; c < CRESTS; c++) {
      const cy = y0 + band * (c + 0.5) / CRESTS;
      const amp = band * 0.04 * (0.5 + c / CRESTS);
      const freq = 0.008 + c * 0.0016;
      const spd = t * (0.5 + c * 0.12);
      g.beginPath();
      for (let x = r.dx; x <= r.dx + r.dw; x += 12) {
        const yy = cy + Math.sin(x * freq + spd + c) * amp
                      + this.noise(x * 0.003, c + t * 0.2) * amp * 0.6;
        if (x === r.dx) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.strokeStyle = `rgba(226,240,255,${(0.028 + 0.028 * (c / CRESTS)) * wf})`;
      g.lineWidth = 1.3;
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
    host.appendChild(slider("물살 (flow)", 0, 2, this.water, 0.05, (v) => (this.water = v)));
    host.appendChild(slider("물빛 (shimmer)", 0, 2, this.shimmer, 0.05, (v) => (this.shimmer = v)));
    host.appendChild(buttonRow([
      { label: "지금 (now)", on: () => { this.timeMode = null; } },
      { label: "정오 (noon)", on: () => { this.timeMode = "p"; this.previewH = 12; } },
      { label: "황혼 (dusk)", on: () => { this.timeMode = "p"; this.previewH = 17.9; } },
      { label: "밤 (night)", on: () => { this.timeMode = "p"; this.previewH = 0.02; } },
    ]));
  }

  teardown() {
    this.img = null;
    this.falls = null;
    this._sprite = null;
  }
}
