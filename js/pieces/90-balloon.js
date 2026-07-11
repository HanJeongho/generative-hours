// ============================================================================
//  90 · Balloon Breath — 풍선 불기
//  얼굴을 인식(FaceLandmarker 478점)해, 입을 벌리면 입에서 파스텔 풍선이
//  부풉니다. 벌리고 있는 동안 계속 커지고 말랑하게 출렁이다가, 입을 다물면
//  풍선이 똑 떨어져 나와 실을 달고 두둥실 떠오릅니다(살랑 좌우 흔들림).
//  천장에 풍선 다발이 모이고(최대 12개), 넘치면 가장 오래된 풍선이 팡 —
//  소프트 색종이가 흩날립니다. 다섯 번째마다 별 모양 풍선이 나와 천장에서
//  반짝 터집니다. 배경은 은은한 하늘 그라데이션과 떠다니는 작은 구름.
//  얼굴 마커는 그리지 않습니다 — 풍선 자체가 대답이니까요.
//  카메라가 없으면 커서를 꾹 누르는 동안 풍선이 부풀고, 놓으면 떠오릅니다.
// ============================================================================

import { clamp, lerp, rand, TAU, hsl } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

const POOL = 30;        // 풍선 풀
const CONF = 200;       // 색종이 풀
const NCLOUD = 7;       // 구름
const MAXCEIL = 12;     // 천장 최대
const HUES = [340, 18, 46, 150, 200, 265, 320];  // 파스텔 색상환

export default class BalloonBreath extends VisionPiece {
  get tracker() { return "face"; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");
    this.sizeScale = 1;
    this.spawnCount = 0;
    this.active = null;
    this._ambT = 1.4;

    // 고정 크기 풀 (핫루프 무할당)
    this.balloons = [];
    for (let i = 0; i < POOL; i++) this.balloons.push(this._blank());
    this.conf = [];
    for (let i = 0; i < CONF; i++) this.conf.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0, sat: 70, lig: 82, sz: 4, rot: 0, vr: 0 });
    this.ceiling = [];

    this.clouds = [];
    for (let i = 0; i < NCLOUD; i++)
      this.clouds.push({ fx: rand(0, 1.2), fy: rand(0.06, 0.5), sc: rand(0.6, 1.5), sp: rand(0.006, 0.02), a: rand(0.28, 0.6) });
  }

  _blank() {
    return { alive: false, state: 0, x: 0, y: 0, r: 6, tr: 6, hue: 200, sat: 70, lig: 84,
      wphase: 0, swayPhase: 0, swayAmp: 0, homeX: 0, ceilY: 0, vy: 0, star: false, age: 0 };
  }

  _maxR() { return Math.min(this.w, this.h) * 0.16 * this.sizeScale; }
  _free() { for (const b of this.balloons) if (!b.alive) return b; return null; }

  // ---- 새 풍선(입/커서에서 부풀기 시작) ------------------------------------
  _spawnActive(x, y) {
    const b = this._free(); if (!b) return null;
    this.spawnCount++;
    b.alive = true; b.state = 0; b.x = x; b.y = y; b.r = 7; b.tr = 7;
    b.star = (this.spawnCount % 5 === 0);
    const h = b.star ? 46 : HUES[(Math.random() * HUES.length) | 0];
    b.hue = h; b.sat = b.star ? 88 : 66; b.lig = b.star ? 84 : 83;
    b.wphase = rand(TAU); b.swayPhase = rand(TAU); b.swayAmp = 0; b.vy = 0; b.age = 0;
    this.active = b;
    return b;
  }

  // ---- 놓기(떠오름) --------------------------------------------------------
  _release(b) {
    if (!b || b.state !== 0) { this.active = null; return; }
    b.state = 1;
    b.homeX = clamp(b.x + rand(-0.28, 0.28) * this.w, this.w * 0.08, this.w * 0.92);
    b.vy = -rand(34, 60);
    b.swayAmp = rand(10, 26);
    this.active = null;
  }

  // ---- 공용 구동: 열림/위치 → 부풀리기 or 놓기 -----------------------------
  _drive(dt, isOpen, x, y, amt) {
    if (isOpen) {
      if (!this.active || !this.active.alive) this._spawnActive(x, y);
      const b = this.active;
      if (b) {
        b.x = x; b.y = y;
        b.tr = Math.min(this._maxR(), b.tr + (0.35 + amt) * this._maxR() * 1.05 * dt);
      }
    } else if (this.active) {
      this._release(this.active);
    }
  }

  // ---- 유휴: 배경이 살아 숨쉬도록 이따금 풍선이 스스로 떠오름 --------------
  _ambient(dt) {
    this._ambT -= dt;
    if (this._ambT > 0) return;
    this._ambT = rand(2.6, 4.4);
    const b = this._free(); if (!b) return;
    b.alive = true; b.state = 1; b.star = false;
    b.x = rand(this.w * 0.12, this.w * 0.88); b.y = this.h + 30;
    b.r = rand(16, 34); b.tr = b.r;
    b.hue = HUES[(Math.random() * HUES.length) | 0]; b.sat = 60; b.lig = 84;
    b.wphase = rand(TAU); b.swayPhase = rand(TAU); b.swayAmp = rand(10, 22);
    b.homeX = clamp(b.x + rand(-0.2, 0.2) * this.w, this.w * 0.08, this.w * 0.92);
    b.vy = -rand(30, 48); b.age = 0;
  }

  // ---- 카메라 프레임 -------------------------------------------------------
  visionFrame(dt, t, results) {
    const faces = results && results.faceLandmarks;
    let handled = false;
    if (faces && faces.length) {
      const lm = faces[0];
      const up = lm[13], lo = lm[14], top = lm[10], chin = lm[152];
      if (up && lo && top && chin) {
        const gap = Math.hypot(up.x - lo.x, up.y - lo.y);
        const fl = Math.hypot(top.x - chin.x, top.y - chin.y) || 1;
        const ratio = gap / fl;                       // 입벌림 정규화
        const amt = clamp((ratio - 0.12) / (0.40 - 0.12), 0, 1);
        const open = ratio > 0.13;
        const mid = this.toCanvas({ x: (up.x + lo.x) * 0.5, y: (up.y + lo.y) * 0.5 });
        this._drive(dt, open, mid.x, mid.y, amt);
        handled = true;
      }
    }
    if (!handled && this.active) this._release(this.active);
    this._sim(dt, t);
    this._render(dt, t, true);
  }

  // ---- 커서 폴백 -----------------------------------------------------------
  drawIdle(dt, t) {
    if (!this.balloons) return;
    const p = this.pointer;
    const isOpen = p.down && p.active;
    if (isOpen) this._drive(dt, 1, p.x, p.y, 1);
    else if (this.active) this._release(this.active);
    this._ambient(dt);
    this._sim(dt, t);
    this._render(dt, t, false);
  }

  onResize() {}

  // ---- 시뮬레이션 ----------------------------------------------------------
  _sim(dt, t) {
    // 구름 흐름
    for (const c of this.clouds) {
      c.fx += c.sp * dt * 6;
      if (c.fx > 1.3) { c.fx = -0.3; c.fy = rand(0.06, 0.5); c.sc = rand(0.6, 1.5); }
    }
    const ceilBand = this.h * 0.12;
    for (const b of this.balloons) {
      if (!b.alive) continue;
      if (b.state === 0) {                 // 부푸는 중
        b.r = lerp(b.r, b.tr, 1 - Math.pow(0.001, dt));
      } else if (b.state === 1) {          // 떠오름
        b.vy = lerp(b.vy, -46, 1 - Math.pow(0.4, dt));
        b.y += b.vy * dt;
        b.x = lerp(b.x, b.homeX, 1 - Math.pow(0.5, dt * 2));
        const cy = ceilBand + b.r * 1.14;
        if (b.y <= cy) {
          if (b.star) { this._pop(b, true); }
          else {
            b.state = 2; b.y = cy; b.ceilY = cy;
            this.ceiling.push(b);
            while (this.ceiling.length > MAXCEIL) this._pop(this.ceiling.shift(), false);
          }
        }
      } else if (b.state === 2) {          // 천장에서 통통
        b.age += dt;
        b.y = b.ceilY + Math.sin(t * 1.5 + b.wphase) * 5;
      }
    }
    // 색종이
    for (const c of this.conf) {
      if (!c.alive) continue;
      c.vy += 220 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      c.rot += c.vr * dt; c.life -= dt;
      if (c.life <= 0 || c.y > this.h + 30) c.alive = false;
    }
  }

  _pop(b, sparkle) {
    if (!b || !b.alive) return;
    const idx = this.ceiling.indexOf(b);
    if (idx >= 0) this.ceiling.splice(idx, 1);
    const n = sparkle ? 24 : 16;
    for (let i = 0; i < n; i++) {
      const c = this._freeConf(); if (!c) break;
      const a = rand(TAU), sp = rand(40, sparkle ? 260 : 170);
      c.alive = true; c.x = b.x; c.y = b.y;
      c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp - 60;
      c.life = rand(0.8, 1.6); c.max = c.life;
      c.hue = sparkle ? (Math.random() < 0.5 ? 46 : b.hue) : b.hue + rand(-18, 18);
      c.sat = sparkle ? 90 : 70; c.lig = sparkle ? 88 : 82;
      c.sz = rand(3, 7); c.rot = rand(TAU); c.vr = rand(-8, 8);
    }
    b.alive = false;
    if (this.active === b) this.active = null;
  }

  _freeConf() { for (const c of this.conf) if (!c.alive) return c; return null; }

  // ---- 렌더 ----------------------------------------------------------------
  _render(dt, t, camera) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._drawSky(g);
    this._drawClouds(g, t);
    for (const b of this.balloons) if (b.alive) this._drawBalloon(g, b, t);
    this._drawConf(g);
    this._caption(g, camera);
  }

  _drawSky(g) {
    const grd = g.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, "#bfe6f5");
    grd.addColorStop(0.55, "#e7f2f6");
    grd.addColorStop(1, "#fdf1ec");
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);
  }

  _drawClouds(g, t) {
    for (const c of this.clouds) {
      const x = c.fx * this.w, y = c.fy * this.h, s = c.sc * Math.min(this.w, this.h) * 0.06;
      g.fillStyle = `rgba(255,255,255,${c.a})`;
      g.beginPath();
      g.ellipse(x, y, s * 1.7, s, 0, 0, TAU);
      g.ellipse(x - s * 1.1, y + s * 0.3, s, s * 0.7, 0, 0, TAU);
      g.ellipse(x + s * 1.2, y + s * 0.35, s * 1.1, s * 0.7, 0, 0, TAU);
      g.fill();
    }
  }

  _drawBalloon(g, b, t) {
    const sway = b.state === 0 ? 0 : Math.sin(t * 1.6 + b.swayPhase) * b.swayAmp;
    const x = b.x + sway, y = b.y;
    const wob = Math.sin(t * 7 + b.wphase) * (b.state === 0 ? 1.4 : 1);
    const rx = b.r * (1 + 0.05 * wob), ry = b.r * 1.13 * (1 - 0.05 * wob);

    // 실
    g.strokeStyle = "rgba(120,124,140,0.4)"; g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(x, y + ry);
    const sl = b.r * 2.1;
    g.quadraticCurveTo(x + Math.sin(t * 1.3 + b.wphase) * b.r * 0.5, y + ry + sl * 0.5,
      x + Math.sin(t * 0.9 + b.wphase) * b.r * 0.3, y + ry + sl);
    g.stroke();

    if (b.star) { this._drawStar(g, x, y, b, Math.max(rx, ry), t); return; }

    const grd = g.createRadialGradient(x - rx * 0.35, y - ry * 0.4, rx * 0.1, x, y, rx * 1.15);
    grd.addColorStop(0, hsl(b.hue, b.sat, Math.min(95, b.lig + 11)));
    grd.addColorStop(0.55, hsl(b.hue, b.sat, b.lig));
    grd.addColorStop(1, hsl(b.hue, b.sat - 8, b.lig - 15));
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();

    // 매듭
    g.fillStyle = hsl(b.hue, b.sat - 8, b.lig - 17);
    g.beginPath();
    g.moveTo(x - rx * 0.13, y + ry); g.lineTo(x + rx * 0.13, y + ry);
    g.lineTo(x, y + ry + rx * 0.17); g.closePath(); g.fill();

    // 하이라이트
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath(); g.ellipse(x - rx * 0.34, y - ry * 0.36, rx * 0.16, ry * 0.22, -0.5, 0, TAU); g.fill();
  }

  _drawStar(g, x, y, b, R, t) {
    const tw = 1 + 0.08 * Math.sin(t * 6 + b.wphase);
    const RR = R * 1.08 * tw, r2 = RR * 0.46, n = 5;
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 0.8 + b.wphase) * 0.12);
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 ? r2 : RR, a = -Math.PI / 2 + i * Math.PI / n;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    const grd = g.createRadialGradient(-RR * 0.2, -RR * 0.2, RR * 0.1, 0, 0, RR);
    grd.addColorStop(0, hsl(48, 92, 92));
    grd.addColorStop(1, hsl(42, 82, 72));
    g.fillStyle = grd; g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.beginPath(); g.ellipse(-RR * 0.22, -RR * 0.24, RR * 0.14, RR * 0.18, -0.5, 0, TAU); g.fill();
    g.restore();
  }

  _drawConf(g) {
    for (const c of this.conf) {
      if (!c.alive) continue;
      const a = clamp(c.life / c.max, 0, 1);
      g.save();
      g.translate(c.x, c.y); g.rotate(c.rot);
      g.fillStyle = hsl(c.hue, c.sat, c.lig, a);
      g.fillRect(-c.sz * 0.5, -c.sz * 0.5, c.sz, c.sz * 1.5);
      g.restore();
    }
  }

  _caption(g, camera) {
    g.save();
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.font = "12px ui-monospace, monospace";
    g.fillStyle = "rgba(70,90,110,0.72)";
    const msg = camera
      ? "입을 벌리면 풍선이 부풀어요 — 다물면 두둥실"
      : "꾹 누르면 풍선이 부풀어요 — 놓으면 두둥실";
    g.fillText(msg, this.w / 2, this.h - 14);
    g.restore();
  }

  controls(host) {
    host.appendChild(slider("풍선 크기", 0.6, 1.8, this.sizeScale, 0.05,
      (v) => (this.sizeScale = v)));
  }
}
