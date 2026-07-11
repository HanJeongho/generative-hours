// ============================================================================
//  91 · Ribbon Dance (리본 체조) — 손목에 긴 비단 리본 [VisionPiece · pose]
//  어두운 무대에 은은한 스포트라이트. 카메라가 내 몸을 보면 양 손목(15·16)에
//  긴 비단 리본이 달린다. 손목이 지나온 자리(궤적 링버퍼 ~44점)가 부드러운
//  띠로 흐른다 — 폭이 손끝에서 넓고 꼬리로 갈수록 가늘어지고, 가산 글로우를
//  두 번 겹쳐 빛나는 리본이 된다. 왼손은 장미빛, 오른손은 물빛, 색은 아주
//  천천히 순환한다. 빠르게 휘두를수록 리본이 크게 물결치고 반짝이가 흩날린다.
//  두 손목이 코(0)보다 높이 올라가면 하늘에 금빛 별이 팡파레처럼 피고 짧은
//  무지개 아치가 떠오른다. 손목엔 작은 별 하나씩. 실패도 점수도 없다.
//  카메라가 없으면 커서가 리본 하나가 되어 춤춘다 — 완전한 폴백.
//  results.landmarks[0] = 33 pose landmarks. numPoses 1. visibility 낮으면 스킵.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

const BUF = 44;                 // 궤적 링버퍼 길이
const NOSE = 0, LW = 15, RW = 16;
const VIS = 0.5;                // visibility 문턱
const MAXSPK = 150;             // 반짝이 풀
const MAXSTAR = 54;             // 팡파레 별 풀
const L_HUE = 340, R_HUE = 195; // 장미빛 / 물빛 기준색

export default class RibbonDance extends VisionPiece {
  get tracker() { return "pose"; }

  visionSetup() {
    this.wScale = 1;                        // WIDTH 슬라이더
    this.fanfareCd = 0;                     // 팡파레 재발동 쿨다운
    this.bothUp = false;                    // 두 손 올림 상태(상승엣지 감지)
    this.arch = { life: 0, seed: 0 };       // 무지개 아치

    // 두 개의 리본(0=왼손 장미, 1=오른손 물빛)
    this.ribbons = [this._mkRibbon(L_HUE), this._mkRibbon(R_HUE)];
    // 리본 그릴 때 쓰는 스크래치(핫루프 무할당)
    this._sx = new Float32Array(BUF);
    this._sy = new Float32Array(BUF);

    this.nose = { on: false, x: 0, y: 0 };

    // 반짝이 풀
    this.spk = [];
    for (let i = 0; i < MAXSPK; i++)
      this.spk.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, hue: 0, r: 0 });
    // 금빛 별 풀
    this.stars = [];
    for (let i = 0; i < MAXSTAR; i++)
      this.stars.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, rot: 0, vr: 0, r: 0 });

    // 배경 먼지 티끌(아무도 없어도 무대가 숨쉬게)
    this.motes = [];
    for (let i = 0; i < 34; i++)
      this.motes.push({ x: Math.random(), y: Math.random(), ph: rand(0, TAU),
        sp: rand(0.05, 0.22), r: rand(0.6, 2.2) });
  }

  _mkRibbon(hue) {
    return { on: false, hue, baseHue: hue, x: 0, y: 0, speed: 0, n: 0, head: 0,
      xs: new Float32Array(BUF), ys: new Float32Array(BUF) };
  }

  // ---- ring-buffer helpers ---------------------------------------------------
  _seed(r, x, y) {
    r.n = 1; r.head = 0; r.xs[0] = x; r.ys[0] = y; r.x = x; r.y = y; r.speed = 0;
  }

  _pushPoint(r, x, y, dt) {
    const inst = dt > 1e-3 ? Math.hypot(x - r.x, y - r.y) / dt : 0;
    r.speed = lerp(r.speed, inst, 0.35);
    r.x = x; r.y = y;
    r.head = (r.head + 1) % BUF;
    r.xs[r.head] = x; r.ys[r.head] = y;
    if (r.n < BUF) r.n++;
  }

  // ---- pose digest -----------------------------------------------------------
  _feed(r, l, dt) {
    if (l && (l.visibility === undefined || l.visibility >= VIS)) {
      const c = this.toCanvas(l);
      if (!r.on) { r.on = true; this._seed(r, c.x, c.y); }
      else this._pushPoint(r, c.x, c.y, dt);
    } else { r.on = false; r.speed *= 0.9; }
  }

  _digest(lms, dt) {
    this._feed(this.ribbons[0], lms && lms[LW], dt);
    this._feed(this.ribbons[1], lms && lms[RW], dt);
    const nl = lms && lms[NOSE];
    if (nl && (nl.visibility === undefined || nl.visibility >= VIS)) {
      const c = this.toCanvas(nl); this.nose.on = true; this.nose.x = c.x; this.nose.y = c.y;
    } else this.nose.on = false;
    // 두 손목이 코보다 높이(=y가 작게) → 상승엣지에 팡파레
    const up = this.nose.on && this.ribbons[0].on && this.ribbons[1].on &&
      this.ribbons[0].y < this.nose.y && this.ribbons[1].y < this.nose.y;
    if (up && !this.bothUp && this.fanfareCd <= 0) { this._fanfare(); this.fanfareCd = 1.4; }
    this.bothUp = up;
  }

  visionFrame(dt, t, res) {
    dt = clamp(dt, 0, 0.05);
    const lms = (res && res.landmarks && res.landmarks[0]) || null;
    this._digest(lms, dt);
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    dt = clamp(dt, 0, 0.05);
    const r = this.ribbons[0];
    if (this.pointer.active) {
      if (!r.on) { r.on = true; this._seed(r, this.pointer.x, this.pointer.y); }
      else this._pushPoint(r, this.pointer.x, this.pointer.y, dt);
    } else { r.on = false; r.speed *= 0.9; }
    this.ribbons[1].on = false;
    this.nose.on = false; this.bothUp = false;
    this._scene(dt, t, false);
  }

  // ---- effects ---------------------------------------------------------------
  _spawnSparkle(x, y, hue) {
    for (const p of this.spk) {
      if (p.on) continue;
      p.on = true;
      const a = rand(0, TAU), s = rand(30, 150);
      p.x = x + rand(-6, 6); p.y = y + rand(-6, 6);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 30;
      p.life = rand(0.4, 1.0); p.hue = hue + rand(-16, 16); p.r = rand(1.2, 3.2);
      return;
    }
  }

  _fanfare() {
    this.arch.life = 1; this.arch.seed = rand(0, TAU);
    const W = this.w, cx = W / 2;
    let c = 0;
    for (const s of this.stars) {
      if (s.on || c >= 26) continue;
      c++; s.on = true;
      s.x = cx + rand(-W * 0.34, W * 0.34);
      s.y = rand(this.h * 0.06, this.h * 0.3);
      s.vx = rand(-40, 40); s.vy = rand(-20, 40);
      s.life = rand(1.4, 2.6); s.rot = rand(0, TAU); s.vr = rand(-3, 3);
      s.r = rand(7, 16);
    }
  }

  // ---- whole scene -----------------------------------------------------------
  _scene(dt, t, viaCam) {
    const g = this.ctx, W = this.w, H = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.fanfareCd > 0) this.fanfareCd -= dt;

    this._drawBackground(g, W, H, t);

    // 색은 아주 천천히 순환
    for (let i = 0; i < 2; i++) {
      const r = this.ribbons[i];
      r.hue = r.baseHue + Math.sin(t * 0.08 + i * 1.7) * 18;
    }

    // 빠른 리본에서 반짝이가 흩날림
    for (const r of this.ribbons) {
      if (!r.on || r.speed < 380) continue;
      const pr = clamp((r.speed - 380) / 900, 0, 0.85);
      if (Math.random() < pr) this._spawnSparkle(r.x, r.y, r.hue);
      if (Math.random() < pr * 0.5) this._spawnSparkle(r.x, r.y, r.hue);
    }

    // 리본 본체
    for (const r of this.ribbons) if (r.n > 1) this._drawRibbon(g, r, t);
    // 손목 마커(작은 별)
    for (const r of this.ribbons) if (r.on) this._drawMarker(g, r, t);

    // 반짝이
    this._drawSparkles(g, dt);
    // 무지개 아치 + 금빛 별
    this._drawArch(g, W, H);
    this._drawStars(g, dt);
    this.arch.life = Math.max(0, this.arch.life - dt * 0.42);

    // 캡션
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.font = "12px ui-monospace, Menlo, monospace";
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(220,225,240,0.62)";
    g.fillText(viaCam
      ? "손을 크게 휘두르면 비단 리본이 물결쳐요 — 두 손을 높이 들면 하늘에 무지개가 떠요"
      : "커서를 움직이면 비단 리본이 따라와요 — 카메라를 켜면 두 손으로 춤출 수 있어요",
      W / 2, H - 14);
  }

  // ---- background: dark stage + soft spotlight + dust ------------------------
  _drawBackground(g, W, H, t) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0c16"); bg.addColorStop(0.6, "#070810"); bg.addColorStop(1, "#04050a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 은은한 스포트라이트(살랑 흔들림)
    const sx = W * 0.5 + Math.sin(t * 0.13) * W * 0.06;
    const sp = g.createRadialGradient(sx, -H * 0.12, 0, sx, -H * 0.12, H * 1.05);
    sp.addColorStop(0, "rgba(150,160,210,0.20)");
    sp.addColorStop(0.45, "rgba(90,100,150,0.07)");
    sp.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sp; g.fillRect(0, 0, W, H);
    // 바닥 무대 반사光
    const fl = g.createLinearGradient(0, H, 0, H * 0.7);
    fl.addColorStop(0, "rgba(120,130,180,0.10)"); fl.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fl; g.fillRect(0, H * 0.7, W, H * 0.3);
    // 떠다니는 티끌
    g.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      const x = m.x * W + Math.sin(t * m.sp + m.ph) * 22;
      const y = (m.y * H - t * 6) % H; const yy = y < 0 ? y + H : y;
      const a = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(t * 0.8 + m.ph));
      g.fillStyle = `rgba(200,210,240,${a})`;
      g.beginPath(); g.arc(x, yy, m.r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  // ---- one silk ribbon: taper + 2-pass additive glow -------------------------
  _drawRibbon(g, r, t) {
    const n = r.n, head = r.head, sx = this._sx, sy = this._sy;
    // 최신→오래된 순서로 궤적 수집
    for (let i = 0; i < n; i++) {
      const idx = (head - i + BUF) % BUF;
      sx[i] = r.xs[idx]; sy[i] = r.ys[idx];
    }
    // 속도가 빠를수록 크게 물결치도록 수직 사인 오프셋
    const amp = clamp(r.speed * 0.018, 0, 22);
    for (let i = 1; i < n - 1; i++) {
      const dx = sx[i + 1] - sx[i - 1], dy = sy[i + 1] - sy[i - 1];
      const L = Math.hypot(dx, dy) || 1;
      const w = Math.sin(t * 7 - i * 0.55) * amp * (i / n);
      sx[i] += (-dy / L) * w; sy[i] += (dx / L) * w;
    }
    const ws = this.wScale;
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round"; g.lineJoin = "round";
    // pass 1 — 넓고 부드러운 글로우
    g.strokeStyle = `hsla(${r.hue},85%,66%,1)`;
    for (let i = 0; i < n - 1; i++) {
      const f = 1 - i / n;
      g.globalAlpha = 0.11 * f + 0.02;
      g.lineWidth = (4 + f * f * 32) * ws;
      g.beginPath(); g.moveTo(sx[i], sy[i]); g.lineTo(sx[i + 1], sy[i + 1]); g.stroke();
    }
    // pass 2 — 밝은 심지
    g.strokeStyle = `hsla(${r.hue},92%,78%,1)`;
    for (let i = 0; i < n - 1; i++) {
      const f = 1 - i / n;
      g.globalAlpha = 0.28 + 0.55 * f;
      g.lineWidth = (1.4 + f * f * 12) * ws;
      g.beginPath(); g.moveTo(sx[i], sy[i]); g.lineTo(sx[i + 1], sy[i + 1]); g.stroke();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  // ---- small star at the wrist ----------------------------------------------
  _drawMarker(g, r, t) {
    const x = r.x, y = r.y;
    g.globalCompositeOperation = "lighter";
    const gl = g.createRadialGradient(x, y, 0, x, y, 16);
    gl.addColorStop(0, `hsla(${r.hue},90%,80%,0.9)`); gl.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
    this._star(g, x, y, 6.5, 3, t * 1.5, "rgba(255,255,255,0.95)");
    g.globalCompositeOperation = "source-over";
  }

  _star(g, x, y, ro, ri, rot, fill) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = (i % 2 === 0) ? ro : ri, a = (i / 10) * TAU - Math.PI / 2;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fillStyle = fill; g.fill(); g.restore();
  }

  // ---- sparkles --------------------------------------------------------------
  _drawSparkles(g, dt) {
    g.globalCompositeOperation = "lighter";
    for (const p of this.spk) {
      if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += 120 * dt; p.vx *= Math.exp(-dt * 1.2);
      p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = clamp(p.life * 1.6, 0, 1);
      g.fillStyle = `hsl(${p.hue} 95% 78%)`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  // ---- rainbow arch in the sky ----------------------------------------------
  _drawArch(g, W, H) {
    const a = this.arch.life; if (a <= 0.01) return;
    const cx = W / 2, cy = H * 0.46, R0 = Math.min(W, H) * 0.34;
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const hue = i * 48;
      g.strokeStyle = `hsla(${hue},90%,64%,${0.5 * a})`;
      g.lineWidth = 9;
      g.beginPath(); g.arc(cx, cy, R0 + i * 11, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }

  // ---- golden fanfare stars --------------------------------------------------
  _drawStars(g, dt) {
    g.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      if (!s.on) continue;
      s.life -= dt; if (s.life <= 0) { s.on = false; continue; }
      s.vy += 60 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      const a = clamp(s.life, 0, 1);
      const gl = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.4);
      gl.addColorStop(0, `rgba(255,230,140,${0.55 * a})`); gl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gl; g.beginPath(); g.arc(s.x, s.y, s.r * 2.4, 0, TAU); g.fill();
      g.globalAlpha = a;
      this._star(g, s.x, s.y, s.r, s.r * 0.42, s.rot, "rgba(255,244,190,0.98)");
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("WIDTH", 0.5, 2, this.wScale, 0.1,
      (v) => (this.wScale = v), (v) => `${v.toFixed(1)}×`));
  }
}
