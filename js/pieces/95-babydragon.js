// ============================================================================
//  95 · Baby Dragon (아기 용) — 손끝을 졸졸 따라오는 아기 용 [VisionPiece · hand]
//  아이들의 방. 카메라가 손을 보면(최대 2손), 손마다 손바닥만 한 아기 용이
//  검지 끝(8)을 스프링 지연으로 졸졸 따라온다. 몸통은 원 체인(머리 크고 꼬리로
//  갈수록 작게), 작은 날개가 팔락이고 큰 눈망울에 볼터치가 발그레.
//  · 손을 빙글 크게 돌리면 → 용이 공중제비(루프)를 돌며 별 꼬리를 남긴다
//    (궤적 각속도 누적으로 판정).
//  · 주먹을 쥐면 → 딸기를 하나 주는 것. 용이 냠냠 먹고 하트를 트림한다.
//  · 손이 2초 가만히 → 용이 몸을 말고 잠들어 Zzz가 떠오른다(움직이면 깸).
//  배경은 노을빛 하늘 + 떠 있는 작은 섬 실루엣. 마커 없음(용이 곧 손).
//  카메라가 없으면 커서가 손이 된다 — 용 한 마리가 커서를 따라다닌다.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

const SEG = 8;          // 몸통 원 개수 (머리 포함)
const LINK = 11;        // 마디 간 거리
const HEADR = 18, TAILR = 5;
const LOOP_DUR = 0.8;   // 공중제비 시간
const BERRY_DUR = 0.6;  // 딸기 먹는 시간
const HUES = [150, 285]; // 손0=민트, 손1=라벤더

export default class BabyDragon extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 2; }

  visionSetup() {
    this.scale = 1.0;
    this.dragons = [];
    for (let i = 0; i < 2; i++) this.dragons.push(this._mkDragon(HUES[i]));
    // 파티클 풀 (핫루프 무할당)
    this.stars = [];
    for (let i = 0; i < 60; i++) this.stars.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 0, hue: 0, rot: 0 });
    this.hearts = [];
    for (let i = 0; i < 30; i++) this.hearts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 0 });
    this.zzz = [];
    for (let i = 0; i < 24; i++) this.zzz.push({ on: false, x: 0, y: 0, life: 0, size: 0, drift: 0 });
    // 떠 있는 섬 실루엣
    this.islands = [];
    for (let i = 0; i < 5; i++)
      this.islands.push({ x: rand(0, 1), y: rand(0.28, 0.66), s: rand(0.5, 1.3), spd: rand(0.004, 0.014), tree: Math.random() < 0.7 });
    this._bob = 0;
  }

  _mkDragon(hue) {
    const seg = [];
    for (let i = 0; i < SEG; i++) seg.push({ x: 0, y: 0 });
    return {
      on: false, glow: 0, hue,
      tx: 0, ty: 0, ptx: 0, pty: 0, seg,
      wing: rand(0, TAU), blink: rand(1, 4), blinkT: 0,
      loopAccum: 0, prevAng: 0, looping: false, loopT: 0, starT: 0,
      still: 0, sleep: 0, zt: 0,
      fist: false, pfist: false,
      berry: 0, bx0: 0, by0: 0, burped: true,
    };
  }

  // ---- 파티클 스폰 ---------------------------------------------------------
  _emitStar(x, y) {
    const s = this.stars.find((q) => !q.on); if (!s) return;
    s.on = true; s.x = x + rand(-6, 6); s.y = y + rand(-6, 6);
    s.vx = rand(-24, 24); s.vy = rand(-30, 6);
    s.life = rand(0.7, 1.1); s.size = rand(4, 9); s.hue = rand(38, 58); s.rot = rand(0, TAU);
  }
  _burpHeart(x, y) {
    let n = 0;
    for (const h of this.hearts) {
      if (h.on || n >= 3) continue; n++;
      h.on = true; h.x = x + rand(-6, 6); h.y = y;
      h.vx = rand(-14, 14); h.vy = rand(-60, -34);
      h.life = rand(0.8, 1.2); h.size = rand(7, 12);
    }
  }
  _spawnZzz(x, y) {
    const z = this.zzz.find((q) => !q.on); if (!z) return;
    z.on = true; z.x = x; z.y = y; z.life = 1.4; z.size = 9; z.drift = rand(-8, 8);
  }
  _giveStrawberry(d) {
    d.berry = BERRY_DUR; d.burped = false;
    const side = Math.random() < 0.5 ? -1 : 1;
    d.bx0 = d.seg[0].x + side * 42 + rand(-8, 8);
    d.by0 = d.seg[0].y + 48 + rand(-6, 6);
  }

  // ---- 손 다이제스트: 검지 끝(8) + 주먹 여부 -------------------------------
  _digest(lms) {
    const pts = lms.map((l) => this.toCanvas(l));
    let cx = 0, cy = 0;
    for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 5; cy /= 5;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    r = Math.max(30, r);
    let open = 0;
    for (const i of [8, 12, 16, 20]) open += Math.hypot(pts[i].x - cx, pts[i].y - cy);
    open /= 4 * r;
    const tip = open < 0.62 ? { x: cx, y: cy } : pts[8]; // 주먹이면 손바닥 중심
    return { tip, fist: open < 0.62 };
  }

  // ---- 용 한 마리 갱신 -----------------------------------------------------
  _updateDragon(d, dt, t, tx, ty, fist) {
    if (!d.on) { for (const s of d.seg) { s.x = tx; s.y = ty; } d.ptx = tx; d.pty = ty; d.on = true; }
    d.tx = tx; d.ty = ty; d.fist = fist;
    d.glow = clamp(d.glow + dt * 5, 0, 1);
    const sc = this.scale;

    const vx = d.tx - d.ptx, vy = d.ty - d.pty;
    const spd = Math.hypot(vx, vy) / Math.max(dt, 1e-3);

    // 잠들기: 2초 가만히 → 몸을 말고 잠. 움직이면 깸.
    if (spd < 42 && !d.looping) d.still += dt; else d.still = 0;
    const wantSleep = d.still > 2;
    d.sleep = clamp(d.sleep + (wantSleep ? dt * 1.4 : -dt * 4), 0, 1);
    if (d.sleep > 0.6) { d.zt -= dt; if (d.zt <= 0) { this._spawnZzz(d.seg[0].x, d.seg[0].y - 24 * sc); d.zt = rand(0.9, 1.5); } }

    // 공중제비: 궤적 각속도 누적이 한 바퀴 넘으면 발동
    const mv = Math.hypot(vx, vy);
    if (mv > 3 && !d.looping) {
      const ang = Math.atan2(vy, vx);
      let da = ang - d.prevAng;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      d.prevAng = ang; d.loopAccum += da;
    }
    d.loopAccum *= Math.exp(-dt * 1.2);
    if (!d.looping && Math.abs(d.loopAccum) > TAU * 0.85) { d.looping = true; d.loopT = 0; d.loopAccum = 0; d.still = 0; }

    // 주먹 상승엣지 → 딸기
    if (d.fist && !d.pfist && d.berry <= 0 && d.sleep < 0.4) this._giveStrawberry(d);
    d.pfist = d.fist;
    if (d.berry > 0) {
      d.berry -= dt;
      if (d.berry <= 0 && !d.burped) { this._burpHeart(d.seg[0].x, d.seg[0].y - 6 * sc); d.burped = true; }
    }

    // 날개 팔락 (잘 때는 접힘)
    d.wing += dt * (d.sleep > 0.4 ? 1.5 : 9 + Math.min(18, spd * 0.03));
    // 깜빡임
    d.blinkT -= dt; if (d.blinkT > 0) { /* blinking */ }
    else { d.blink -= dt; if (d.blink <= 0) { d.blinkT = 0.12; d.blink = rand(1.6, 4.5); } }

    // 머리를 손끝으로 스프링 추종 (+공중제비 원 오프셋)
    let hx = d.tx, hy = d.ty;
    if (d.looping) {
      d.loopT += dt / LOOP_DUR;
      const a = -Math.PI / 2 + d.loopT * TAU;
      const R = 48 * sc * Math.sin(Math.PI * d.loopT);
      hx += Math.cos(a) * R; hy += Math.sin(a) * R;
      d.starT -= dt; if (d.starT <= 0) { this._emitStar(d.seg[SEG - 1].x, d.seg[SEG - 1].y); d.starT = 0.045; }
      if (d.loopT >= 1) { d.looping = false; d.loopT = 0; }
    }
    const k = 1 - Math.exp(-dt * 9);
    const head = d.seg[0];
    head.x += (hx - head.x) * k; head.y += (hy - head.y) * k;
    // 몸통 체인: 잘 때는 마디가 뭉쳐 동그랗게 말림
    const link = lerp(LINK, LINK * 0.22, d.sleep) * sc;
    for (let i = 1; i < SEG; i++) {
      const p = d.seg[i - 1], s = d.seg[i];
      let dx = p.x - s.x, dy = p.y - s.y; const dd = Math.hypot(dx, dy) || 1;
      // 잘 때 살짝 옆으로 감아 코일 느낌
      const curl = d.sleep * 0.9;
      const nx = dx / dd, ny = dy / dd;
      const rx = nx * Math.cos(curl) - ny * Math.sin(curl);
      const ry = nx * Math.sin(curl) + ny * Math.cos(curl);
      s.x = p.x - rx * link; s.y = p.y - ry * link;
    }
    d.ptx = d.tx; d.pty = d.ty;
  }

  visionFrame(dt, t, res) {
    dt = clamp(dt, 0, 0.05);
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 2; i++) {
      const d = this.dragons[i];
      if (lms[i] && lms[i].length >= 21) {
        const g = this._digest(lms[i]);
        this._updateDragon(d, dt, t, g.tip.x, g.tip.y, g.fist);
      } else { d.on = false; d.glow = clamp(d.glow - dt * 4, 0, 1); }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    dt = clamp(dt, 0, 0.05);
    const d = this.dragons[0];
    this._bob += dt;
    let tx, ty, fist;
    if (this.pointer.active) { tx = this.pointer.x; ty = this.pointer.y; fist = this.pointer.down; }
    else { // 아무도 없어도 용은 화면에서 살랑살랑 (그러다 잠듦)
      tx = this.w * 0.5 + Math.cos(this._bob * 0.5) * this.w * 0.06;
      ty = this.h * 0.5 + Math.sin(this._bob * 0.8) * this.h * 0.05;
      fist = false;
    }
    this._updateDragon(d, dt, t, tx, ty, fist);
    this.dragons[1].on = false; this.dragons[1].glow = clamp(this.dragons[1].glow - dt * 4, 0, 1);
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    this._drawBackground(g, t);

    // 용들
    for (const d of this.dragons) if (d.glow > 0.02) this._drawDragon(g, d, t);

    // 별 꼬리
    for (const s of this.stars) {
      if (!s.on) continue;
      s.life -= dt; if (s.life <= 0) { s.on = false; continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.exp(-dt * 1.2); s.vy *= Math.exp(-dt * 1.2);
      const a = clamp(s.life, 0, 1);
      this._sparkle(g, s.x, s.y, s.size, s.rot + t * 2, `hsla(${s.hue},95%,72%,${a})`);
    }
    // 하트 트림
    for (const h of this.hearts) {
      if (!h.on) continue;
      h.life -= dt; if (h.life <= 0) { h.on = false; continue; }
      h.vy += 20 * dt; h.vx += Math.sin(t * 4 + h.y) * 10 * dt;
      h.x += h.vx * dt; h.y += h.vy * dt;
      this._heart(g, h.x, h.y, h.size, clamp(h.life, 0, 1));
    }
    // Zzz
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const z of this.zzz) {
      if (!z.on) continue;
      z.life -= dt; if (z.life <= 0) { z.on = false; continue; }
      z.y -= 22 * dt; z.x += z.drift * dt; z.size += dt * 6;
      const a = clamp(z.life * 0.8, 0, 0.85);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.font = `600 ${z.size}px ui-monospace, monospace`;
      g.fillText("z", z.x, z.y);
    }

    // 캡션
    g.font = "12px ui-monospace, Menlo, monospace";
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(60,42,58,0.6)";
    g.fillText(
      viaCam ? "손끝을 따라 아기 용이 졸졸 · 빙글 돌리면 공중제비 · 주먹 쥐면 딸기 · 가만히 있으면 새근새근"
        : "카메라를 켜면 손끝을 따라와요 — 지금은 커서가 손 · 빙글 돌리면 공중제비 · 꾹 누르면 딸기",
      W / 2, H - 14);
  }

  // ---- 작은 그림 유틸 ------------------------------------------------------
  _sparkle(g, x, y, r, rot, fill) {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a + 0.393) * r * 0.32, Math.sin(a + 0.393) * r * 0.32);
    }
    g.closePath(); g.fill(); g.restore();
  }
  _heart(g, x, y, r, a) {
    g.save(); g.translate(x, y); g.scale(r / 10, r / 10);
    g.fillStyle = `rgba(255,138,158,${a})`;
    g.beginPath(); g.moveTo(0, 3);
    g.bezierCurveTo(-6, -4, -10, 3, 0, 9);
    g.bezierCurveTo(10, 3, 6, -4, 0, 3);
    g.closePath(); g.fill(); g.restore();
  }

  _drawBackground(g, t) {
    const W = this.w, H = this.h;
    // 노을빛 하늘
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#ffd9a6");
    sky.addColorStop(0.42, "#ffb27e");
    sky.addColorStop(0.72, "#f58fa2");
    sky.addColorStop(1, "#cf8fb6");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 낮게 걸린 해무리
    const sun = g.createRadialGradient(W * 0.5, H * 0.9, 0, W * 0.5, H * 0.9, H * 0.6);
    sun.addColorStop(0, "rgba(255,242,206,0.55)");
    sun.addColorStop(1, "rgba(255,242,206,0)");
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // 떠 있는 작은 섬 실루엣
    for (const is of this.islands) {
      is.x += is.spd * 0.012; if (is.x > 1.16) is.x = -0.16;
      const cx = is.x * W, cy = is.y * H + Math.sin(t * 0.5 + is.x * 10) * 4;
      const s = is.s;
      g.fillStyle = "rgba(112,82,118,0.3)";
      g.beginPath();
      g.moveTo(cx - 40 * s, cy); g.lineTo(cx + 40 * s, cy); g.lineTo(cx, cy + 26 * s);
      g.closePath(); g.fill();
      g.beginPath(); g.ellipse(cx, cy, 42 * s, 13 * s, 0, 0, TAU); g.fill();
      if (is.tree) {
        g.fillStyle = "rgba(96,70,102,0.34)";
        g.fillRect(cx - 1.5 * s, cy - 16 * s, 3 * s, 12 * s);
        g.beginPath(); g.arc(cx, cy - 18 * s, 8 * s, 0, TAU); g.fill();
      }
    }
  }
  _strawberry(g, x, y, r) {
    g.save(); g.translate(x, y);
    g.fillStyle = "#e8506b";
    g.beginPath();
    g.moveTo(0, -r * 0.6);
    g.bezierCurveTo(r, -r * 0.7, r * 1.1, r * 0.5, 0, r * 1.3);
    g.bezierCurveTo(-r * 1.1, r * 0.5, -r, -r * 0.7, 0, -r * 0.6);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(255,242,190,0.95)";
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.beginPath(); g.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42 + r * 0.2, r * 0.09, 0, TAU); g.fill(); }
    g.fillStyle = "#5fbf6a";
    g.beginPath(); g.ellipse(0, -r * 0.55, r * 0.5, r * 0.28, 0, 0, TAU); g.fill();
    g.restore();
  }

  _drawDragon(g, d, t) {
    const sc = this.scale, seg = d.seg, hue = d.hue;
    const fold = 1 - d.sleep * 0.7;
    const flap = Math.abs(Math.sin(d.wing));
    const spread = (0.4 + 0.6 * flap) * fold;

    // 날개 (몸통 뒤) — seg[2] 기준, 몸축으로 회전
    const wseg = seg[2];
    const axis = Math.atan2(seg[1].y - seg[2].y, seg[1].x - seg[2].x);
    g.save(); g.translate(wseg.x, wseg.y); g.rotate(axis);
    g.fillStyle = `hsla(${(hue + 45) % 360},70%,88%,${0.9 * fold})`;
    g.strokeStyle = `hsla(${(hue + 20) % 360},50%,68%,${0.55 * fold})`;
    g.lineWidth = 1.2 * sc;
    for (const sgn of [1, -1]) {
      g.save(); g.scale(1, sgn);
      g.beginPath();
      g.moveTo(2 * sc, 1 * sc);
      g.quadraticCurveTo(0, 20 * sc * spread + 4 * sc, -12 * sc, 24 * sc * spread + 5 * sc);
      g.quadraticCurveTo(-8 * sc, 8 * sc, -9 * sc, 1 * sc);
      g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    g.restore();

    // 몸통 원 체인 (꼬리→머리, 머리가 위)
    for (let i = SEG - 1; i >= 0; i--) {
      const r = lerp(HEADR, TAILR, i / (SEG - 1)) * sc;
      const s = seg[i];
      const grad = g.createRadialGradient(s.x - r * 0.3, s.y - r * 0.4, r * 0.1, s.x, s.y, r);
      grad.addColorStop(0, `hsla(${hue},62%,83%,1)`);
      grad.addColorStop(1, `hsla(${hue},52%,67%,1)`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(s.x, s.y, r, 0, TAU); g.fill();
    }

    // 등 지느러미 (위쪽으로 솟은 작은 삼각)
    g.fillStyle = `hsla(${(hue + 30) % 360},58%,78%,${0.9 * fold})`;
    for (let i = 1; i < SEG - 1; i++) {
      const s = seg[i], p = seg[i - 1];
      const a = Math.atan2(s.y - p.y, s.x - p.x);
      let px = -Math.sin(a), py = Math.cos(a);
      if (py > 0) { px = -px; py = -py; }
      const r = lerp(HEADR, TAILR, i / (SEG - 1)) * sc, fin = r * 0.85;
      g.beginPath();
      g.moveTo(s.x - Math.cos(a) * r * 0.6, s.y - Math.sin(a) * r * 0.6);
      g.lineTo(s.x + px * fin, s.y + py * fin);
      g.lineTo(s.x + Math.cos(a) * r * 0.6, s.y + Math.sin(a) * r * 0.6);
      g.closePath(); g.fill();
    }

    // 머리 표정
    const head = seg[0], hr = HEADR * sc;
    const face = Math.atan2(head.y - seg[1].y, head.x - seg[1].x);
    g.save(); g.translate(head.x, head.y); g.rotate(face);
    // 뿔
    g.fillStyle = `hsla(${hue},45%,60%,1)`;
    for (const sgn of [1, -1]) {
      g.beginPath();
      g.moveTo(-hr * 0.2, sgn * hr * 0.5); g.lineTo(-hr * 0.75, sgn * hr * 0.95); g.lineTo(-hr * 0.1, sgn * hr * 0.8);
      g.closePath(); g.fill();
    }
    // 볼터치
    g.fillStyle = "rgba(255,138,150,0.5)";
    for (const sgn of [1, -1]) { g.beginPath(); g.ellipse(hr * 0.18, sgn * hr * 0.72, hr * 0.24, hr * 0.16, 0, 0, TAU); g.fill(); }
    // 입 (딸기 먹을 때 냠냠)
    if (d.berry > 0) {
      const nom = 0.5 + 0.5 * Math.sin((BERRY_DUR - d.berry) * 22);
      g.fillStyle = "#7a3b46";
      g.beginPath(); g.ellipse(hr * 0.85, 0, hr * 0.2, hr * 0.28 * nom + hr * 0.04, 0, 0, TAU); g.fill();
    }
    // 눈
    const closed = d.sleep > 0.5 || d.blinkT > 0;
    for (const sgn of [1, -1]) {
      const ex = hr * 0.32, ey = sgn * hr * 0.42;
      if (closed) {
        g.strokeStyle = "#5a4a52"; g.lineWidth = 2 * sc; g.lineCap = "round";
        g.beginPath(); g.arc(ex, ey - hr * 0.05, hr * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else {
        g.fillStyle = "#fff"; g.beginPath(); g.ellipse(ex, ey, hr * 0.28, hr * 0.32, 0, 0, TAU); g.fill();
        g.fillStyle = "#3a3040"; g.beginPath(); g.arc(ex + hr * 0.08, ey, hr * 0.16, 0, TAU); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(ex + hr * 0.04, ey - hr * 0.09, hr * 0.06, 0, TAU); g.fill();
      }
    }
    g.restore();

    // 날아드는 딸기 (월드 좌표: 시작점→입)
    if (d.berry > 0) {
      const frac = clamp(d.berry / BERRY_DUR, 0, 1);
      const mx = head.x + Math.cos(face) * hr * 0.95, my = head.y + Math.sin(face) * hr * 0.95;
      this._strawberry(g, lerp(mx, d.bx0, frac), lerp(my, d.by0, frac), 7 * sc + 2 * sc * frac);
    }
  }

  controls(host) {
    host.appendChild(slider("크기", 0.6, 1.7, this.scale, 0.05, (v) => (this.scale = v)));
  }
}
