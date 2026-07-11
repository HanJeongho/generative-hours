// ============================================================================
//  92 · Weather Face — 표정 날씨
//  얼굴 하나가 하늘 하나가 된다. 언덕 초원 풍경 위로, 당신의 표정이 날씨를
//  바꾼다. 미소 지으면(입꼬리 61·291이 입 중심보다 올라가면) 해가 떠오르고
//  하늘이 노을빛으로 데워지며 초원에 꽃이 핀다. 무표정이면 부드러운 구름이
//  흐른다. 입을 크게 벌리면(13·14 거리) "와!" — 무지개가 걸리고 작은 새 떼가
//  하늘을 가른다. 모든 전환은 3~4초 여운의 스무스 엔벨로프. 얼굴 마커 없음.
//  카메라가 없으면 커서 높이가 날씨를 정한다(위=맑음). 아무도 없어도 하늘은
//  천천히 숨 쉰다. 뭘 해도 예쁜 일만 일어난다.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";

// rgb 배열 두 개를 t로 섞어 css 문자열로
const mixStr = (a, b, t) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

export default class WeatherFace extends VisionPiece {
  get tracker() { return "face"; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");
    // 날씨 엔벨로프 (0..1), 느리게 목표를 따라감 → 3~4초 여운
    this.sun = 0;
    this.rainbow = 0;
    this.cloud = 0.5;
    this._sunT = 0;
    this._rainT = 0;
    this.hasFace = false;
    this.build();
  }

  onResize() { this.build(); }

  // ---- 재사용 풀 구성 (핫루프 무할당) --------------------------------------
  build() {
    const W = this.w, H = this.h, m = Math.min(W, H);
    // 구름
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      this.clouds.push({
        x: rand(0, W), y: H * (0.12 + Math.random() * 0.30),
        s: 0.7 + Math.random() * 0.8, sp: 5 + Math.random() * 10, ph: rand(TAU),
      });
    }
    // 앞언덕 위 꽃 (y는 그릴 때 언덕곡선에서 계산)
    this.flowers = [];
    const nF = 22, hues = [340, 50, 275, 12, 200];
    for (let i = 0; i < nF; i++) {
      const x = W * (0.05 + (i / (nF - 1)) * 0.90) + rand(-10, 10);
      this.flowers.push({ x, hue: hues[i % 5], size: 7 + Math.random() * 6, ph: Math.random(), sway: rand(TAU) });
    }
    // 새 떼
    this.birds = [];
    for (let i = 0; i < 9; i++) {
      this.birds.push({ x: rand(0, W), y: H * (0.16 + Math.random() * 0.24), sp: 40 + Math.random() * 45, ph: rand(TAU), sc: 0.7 + Math.random() * 0.6 });
    }
    void m;
  }

  // ---- 표정 판정: 미소 = 입꼬리↑, 와! = 입 벌림 ---------------------------
  visionFrame(dt, t, results) {
    dt = clamp(dt, 0, 0.05);
    const faces = results && results.faceLandmarks;
    let sunT = 0, rainT = 0;
    if (faces && faces.length) {
      const lm = faces[0];
      const L = this.toCanvas(lm[61]), R = this.toCanvas(lm[291]);   // 입꼬리
      const U = this.toCanvas(lm[13]), D = this.toCanvas(lm[14]);    // 위·아래 입술 안쪽
      const e1 = this.toCanvas(lm[33]), e2 = this.toCanvas(lm[263]); // 눈꼬리 (얼굴 크기 기준)
      const fs = Math.hypot(e1.x - e2.x, e1.y - e2.y) || 1;
      const open = Math.hypot(U.x - D.x, U.y - D.y) / fs;            // 입 벌림 (정규화)
      const smile = ((U.y + D.y) * 0.5 - (L.y + R.y) * 0.5) / fs;    // 입꼬리가 입 중심보다 올라간 정도
      const rainAmt = clamp((open - 0.16) / (0.34 - 0.16), 0, 1);
      const smileAmt = clamp((smile - 0.02) / (0.13 - 0.02), 0, 1);
      rainT = rainAmt;
      sunT = smileAmt * (1 - rainAmt * 0.85);                        // 크게 벌리면 무지개가 해를 밀어냄
      this.hasFace = true;
    } else {
      this.hasFace = false;
    }
    this._sunT = sunT; this._rainT = rainT;
    this._tick(dt, t, sunT, rainT);
  }

  // ---- 카메라 폴백: 커서 높이가 날씨 (위=맑음), 아무도 없으면 천천히 숨쉼 ---
  drawIdle(dt, t) {
    dt = clamp(dt, 0, 0.05);
    if (!this.clouds) return;
    this.hasFace = false;
    let cy;
    if (this.pointer.active) cy = clamp(this.pointer.y / this.h, 0, 1);
    else cy = 0.5 + 0.42 * Math.sin(t * 0.09);
    const sunT = clamp(1 - cy * 1.8, 0, 1);
    const rainT = clamp((cy - 0.58) * 2.4, 0, 1);
    this._tick(dt, t, sunT, rainT);
  }

  // ---- 엔벨로프 이징 + 무버 전진 + 렌더 ------------------------------------
  _tick(dt, t, sunT, rainT) {
    const k = 1 - Math.exp(-dt / 1.1);           // ~3.3초에 안정 (여운)
    this.sun = lerp(this.sun, sunT, k);
    this.rainbow = lerp(this.rainbow, rainT, k);
    const cloudT = clamp(1 - sunT - rainT, 0.08, 1);
    this.cloud = lerp(this.cloud, cloudT, k);

    const W = this.w, H = this.h, m = Math.min(W, H);
    for (const c of this.clouds) { c.x += c.sp * dt; c.ph += dt * 0.5; if (c.x - m * 0.13 > W) c.x = -m * 0.13; }
    for (const b of this.birds) { b.x += b.sp * dt * (0.35 + this.rainbow); b.ph += dt * 8; if (b.x - 24 > W) b.x = -24; }
    this._scene(dt, t);
  }

  // ---- 언덕 곡선 -----------------------------------------------------------
  _backHillY(x) { const W = this.w, H = this.h; return H * 0.66 + Math.sin((x / W) * Math.PI * 1.2 + 2.0) * H * 0.045; }
  _frontHillY(x) { const W = this.w, H = this.h; return H * 0.74 + Math.sin((x / W) * Math.PI * 1.6 + 0.4) * H * 0.03 - Math.sin((x / W) * 7) * 4; }

  // ---- 풍경 렌더 -----------------------------------------------------------
  _scene(dt, t) {
    const g = this.ctx, W = this.w, H = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sun = this.sun, rain = this.rainbow, cloud = this.cloud;

    // 하늘: 무표정=부드러운 파랑, 미소=노을빛으로 데워짐, 와!=조금 청명하게
    const topN = [176, 210, 235], botN = [216, 234, 238];
    const topW = [255, 201, 150], botW = [255, 231, 206], fresh = [205, 230, 248];
    const top = [lerp(topN[0], topW[0], sun), lerp(topN[1], topW[1], sun), lerp(topN[2], topW[2], sun)];
    const bot = [lerp(botN[0], botW[0], sun), lerp(botN[1], botW[1], sun), lerp(botN[2], botW[2], sun)];
    for (let i = 0; i < 3; i++) top[i] = lerp(top[i], fresh[i], rain * 0.35);
    const sg = g.createLinearGradient(0, 0, 0, H * 0.82);
    sg.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
    sg.addColorStop(1, `rgb(${bot[0] | 0},${bot[1] | 0},${bot[2] | 0})`);
    g.fillStyle = sg; g.fillRect(0, 0, W, H);

    this._drawSun(g, W, H, sun);
    if (rain > 0.01) this._drawRainbow(g, W, H, rain);
    this._drawClouds(g, W, H, cloud, sun);
    if (rain > 0.02) this._drawBirds(g, W, H, rain);
    this._drawHills(g, W, H, sun);
    this._drawFlowers(g, W, H, sun, t);
    this._drawIcon(g, sun, cloud, rain);
    this._caption(g, W, H);
  }

  _drawSun(g, W, H, sun) {
    if (sun < 0.01) return;
    const cx = W * 0.72, cy = lerp(H * 1.10, H * 0.24, sun), R = Math.min(W, H) * 0.075;
    g.save();
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 5);
    glow.addColorStop(0, `rgba(255,226,160,${0.55 * sun})`);
    glow.addColorStop(0.4, `rgba(255,206,140,${0.22 * sun})`);
    glow.addColorStop(1, "rgba(255,200,140,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 5, 0, TAU); g.fill();
    g.restore();
    g.save();
    g.globalAlpha = clamp(sun * 1.3, 0, 1);
    const dg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    dg.addColorStop(0, "#fff4d6"); dg.addColorStop(1, "#ffcf7a");
    g.fillStyle = dg; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.restore();
  }

  _drawRainbow(g, W, H, rain) {
    const cx = W * 0.5, cy = H * 0.74, R = Math.min(W, H) * 0.62;
    const bands = [[255, 150, 150], [255, 200, 140], [255, 240, 150], [170, 225, 160], [150, 205, 240], [180, 175, 235], [210, 165, 225]];
    g.save();
    g.globalAlpha = rain * 0.7;
    g.lineWidth = Math.max(6, R * 0.028);
    for (let i = 0; i < bands.length; i++) {
      g.strokeStyle = `rgb(${bands[i][0]},${bands[i][1]},${bands[i][2]})`;
      g.beginPath(); g.arc(cx, cy, R - i * g.lineWidth, Math.PI, TAU); g.stroke();
    }
    g.restore();
  }

  _puff(g, x, y, s) {
    g.beginPath();
    g.arc(x - s, y, s * 0.7, 0, TAU);
    g.arc(x - s * 0.2, y - s * 0.5, s * 0.9, 0, TAU);
    g.arc(x + s, y - s * 0.1, s * 0.8, 0, TAU);
    g.arc(x + s * 0.1, y + s * 0.12, s, 0, TAU);
    g.fill();
  }

  _drawClouds(g, W, H, cloud, sun) {
    const a = clamp(cloud * 0.85 + 0.06, 0, 1);
    const m = Math.min(W, H);
    g.save();
    for (const c of this.clouds) {
      const x = c.x, y = c.y + Math.sin(c.ph) * 4, s = c.s * m * 0.06;
      g.fillStyle = `rgba(255,${248 - (10 * sun) | 0},${240 - (22 * sun) | 0},${a})`;
      this._puff(g, x, y + s * 0.2, s * 1.02);
      g.fillStyle = `rgba(255,255,255,${a})`;
      this._puff(g, x, y, s);
    }
    g.restore();
  }

  _drawBirds(g, W, H, rain) {
    g.save();
    g.strokeStyle = `rgba(92,96,116,${rain * 0.75})`;
    g.lineWidth = 2; g.lineCap = "round";
    for (const b of this.birds) {
      const flap = Math.sin(b.ph) * 0.5 + 0.5, s = 8 * b.sc, wy = b.y;
      g.beginPath();
      g.moveTo(b.x - s, wy + flap * s * 0.5);
      g.quadraticCurveTo(b.x, wy - s * 0.4, b.x, wy);
      g.quadraticCurveTo(b.x, wy - s * 0.4, b.x + s, wy + flap * s * 0.5);
      g.stroke();
    }
    g.restore();
  }

  _drawHills(g, W, H, sun) {
    const paint = (fy, color) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) g.lineTo(x, fy(x));
      g.lineTo(W, H); g.closePath(); g.fill();
    };
    paint((x) => this._backHillY(x), mixStr([152, 198, 150], [196, 208, 132], sun * 0.6));
    paint((x) => this._frontHillY(x), mixStr([120, 186, 124], [176, 200, 110], sun * 0.6));
  }

  _drawFlowers(g, W, H, sun, t) {
    for (const f of this.flowers) {
      const b = clamp((sun - f.ph * 0.5) / 0.5, 0, 1);   // 개화 스태거
      if (b <= 0.02) continue;
      const base = this._frontHillY(f.x) + 6, s = f.size * b;
      const sway = Math.sin(t * 1.2 + f.sway) * s * 0.15;
      const x = f.x + sway, y = base - s * 1.2;
      g.strokeStyle = `rgba(110,170,110,${b})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, base); g.stroke();
      g.fillStyle = `hsla(${f.hue},70%,80%,${b})`;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.42, 0, TAU); g.fill(); }
      g.fillStyle = `hsla(48,85%,72%,${b})`; g.beginPath(); g.arc(x, y, s * 0.34, 0, TAU); g.fill();
    }
  }

  // 상단 구석 아주 작은 현재 날씨 아이콘 (해 / 구름 / 무지개)
  _drawIcon(g, sun, cloud, rain) {
    const x = 28, y = 28, r = 9;
    g.save(); g.globalAlpha = 0.85;
    if (rain >= sun && rain >= cloud && rain > 0.05) {
      const cols = ["#ff9a9a", "#ffd08a", "#8fd6a0"]; g.lineWidth = 2.4;
      for (let i = 0; i < 3; i++) { g.strokeStyle = cols[i]; g.beginPath(); g.arc(x, y + 4, r - i * 2.6, Math.PI, TAU); g.stroke(); }
    } else if (sun >= cloud && sun > 0.05) {
      g.strokeStyle = "#ffcf7a"; g.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); g.lineTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25); g.stroke(); }
      g.fillStyle = "#ffcf7a"; g.beginPath(); g.arc(x, y, r * 0.6, 0, TAU); g.fill();
    } else {
      g.fillStyle = "rgba(255,255,255,0.95)"; this._puff(g, x, y, r * 0.75);
    }
    g.restore();
  }

  _caption(g, W, H) {
    g.save();
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = "12px ui-monospace, monospace";
    g.fillStyle = "rgba(70,80,95,0.7)";
    const live = this.status === "ready";
    const msg = live ? "당신의 표정이 오늘의 하늘이 돼요" : "커서를 위로 올리면 하늘이 맑아져요";
    g.fillText(msg, W / 2, H - 14);
    g.restore();
  }
}
