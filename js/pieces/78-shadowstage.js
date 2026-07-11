// ============================================================================
//  78 · Shadow Stage (그림자 인형극) — 촛불 켜진 한지 벽 [VisionPiece · hand]
//  아이들의 방. 따뜻한 촛불이 일렁이는 한지 벽 앞에 손을 들면, 손 전체가
//  벽에 짙은 그림자 인형이 된다(74의 CHAINS 스켈레톤을 손가락 두께로 여러 겹
//  칠해 실루엣을 채우고, 큰+투명한 반그림자로 가장자리를 부드럽게). 촛불에서
//  멀수록 그림자는 커지고 흐려진다. 반딧불이 12마리가 벽을 떠다니다, 손을
//  1초쯤 가만히 두면 손끝마다 한 마리씩 내려앉아 따뜻한 점광이 되고, 손을
//  휙 움직이면 놀라 흩어진다. 두 손이 가까워지면 그림자가 합쳐져 새·나비
//  인형극이 된다. 카메라가 없으면 커서가 작은 새 그림자가 되어 날아다닌다.
//  numHands = 4 (두 아이의 양손).
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";

const NUM_FF = 12;
const TIPS = [4, 8, 12, 16, 20];
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9], [9, 10, 11, 12], [9, 13], [13, 14, 15, 16], [13, 17], [0, 17], [17, 18, 19, 20]];

export default class ShadowStage extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({ on: false, bird: false, x: 0, y: 0, px: 0, py: 0, r: 60, pts: null,
        glow: 0, still: 0, speed: 0, sc: 1, soft: 1, ocx: 0, ocy: 0, tip: [-1, -1, -1, -1, -1] });
    this.ff = [];
    for (let i = 0; i < NUM_FF; i++)
      this.ff.push({ x: rand(0, this.w), y: rand(0, this.h), vx: 0, vy: 0,
        glow: 0.4, ph: rand(0, TAU), wa: rand(0, TAU), hand: -1, tip: -1 });
    this._paperPat = null;
  }

  // 손 전체 다이제스트: 21랜드마크 → 화면 점 / 팜 중심 / 감싸는 반경 (74와 동일)
  _digest(lms) {
    const pts = lms.map((l) => this.toCanvas(l));
    let cx = 0, cy = 0;
    for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 5; cy /= 5;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    return { pts, cx, cy, r: Math.max(30, r) };
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i].length >= 21) {
        const d = this._digest(lms[i]);
        if (!h.on) { h.px = d.cx; h.py = d.cy; }
        h.on = true; h.bird = false; h.x = d.cx; h.y = d.cy; h.r = d.r; h.pts = d.pts;
      } else { h.on = false; h.pts = null; }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    // 카메라 없음: 커서가 작은 새 그림자 인형이 된다
    const h = this.hands[0];
    if (this.pointer.active) {
      if (!h.on) { h.px = this.pointer.x; h.py = this.pointer.y; }
      h.on = true; h.bird = true; h.x = this.pointer.x; h.y = this.pointer.y; h.r = 58; h.pts = null;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const candX = W * 0.5, candY = H * 0.985;
    const maxd = Math.hypot(W, H);

    // ---- 한지 벽 (따뜻한 그라디언트 + 섬유 질감) --------------------------------
    const paper = g.createLinearGradient(0, 0, 0, H);
    paper.addColorStop(0, "#6f5230"); paper.addColorStop(0.42, "#c39c60"); paper.addColorStop(1, "#ead0a2");
    g.fillStyle = paper; g.fillRect(0, 0, W, H);
    if (!this._paperPat) this._paperPat = g.createPattern(this._bakePaper(), "repeat");
    if (this._paperPat) { g.fillStyle = this._paperPat; g.fillRect(0, 0, W, H); }

    // ---- 촛불: 일렁이는 플리커 글로우 + 불꽃 ----------------------------------
    const fl = 0.84 + 0.09 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23.3) + 0.03 * Math.sin(t * 3.1);
    const cg = g.createRadialGradient(candX, candY, 0, candX, candY, maxd * 0.62);
    cg.addColorStop(0, `rgba(255,192,112,${0.24 * fl})`);
    cg.addColorStop(0.5, `rgba(255,158,88,${0.08 * fl})`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cg; g.fillRect(0, 0, W, H);
    const fy = candY - 8;
    g.globalCompositeOperation = "lighter";
    const fg = g.createRadialGradient(candX, fy, 0, candX, fy, 28 * fl);
    fg.addColorStop(0, `rgba(255,242,196,${0.9 * fl})`);
    fg.addColorStop(0.5, `rgba(255,172,72,${0.6 * fl})`);
    fg.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = fg; g.beginPath(); g.ellipse(candX, fy, 10 * fl, 21 * fl, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = "source-over";

    // ---- 손 물리: 글로우 / 속도 / 정지시간 / 촛불거리→그림자 크기·부드러움 -----
    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      if (!h.on) { h.still = 0; h.speed = 0; continue; }
      const vx = (h.x - h.px) / Math.max(dt, 1e-3), vy = (h.y - h.py) / Math.max(dt, 1e-3);
      h.speed = Math.hypot(vx, vy);
      h.still = h.speed < 120 ? h.still + dt : 0;
      const dN = clamp(Math.hypot(h.x - candX, h.y - candY) / (maxd * 0.75), 0, 1);
      h.sc = 1.05 + dN * 0.85;             // 멀수록 그림자가 커진다
      h.soft = 0.6 + dN * 1.6;             // 멀수록 반그림자가 넓어진다(흐려짐)
      h.ocx = h.x + (h.x - candX) * 0.06 * dN;
      h.ocy = h.y + (h.y - candY) * 0.06 * dN;
      h.px = h.x; h.py = h.y;
    }

    // ---- 반딧불이: 정지한 손끝에 내려앉고, 휙 움직이면 흩어진다 ----------------
    this._fireflies(dt, t);

    // ---- 그림자 인형 (반그림자 → 병합 다리 → 짙은 실루엣) ---------------------
    this._drawShadows(g, t);

    // ---- 반딧불이 점광 (가산 합성) --------------------------------------------
    g.globalCompositeOperation = "lighter";
    for (const f of this.ff) {
      const gl = f.glow; if (gl < 0.03) continue;
      const rad = 8 + gl * 12;
      const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      grd.addColorStop(0, `rgba(255,228,152,${0.9 * gl})`);
      grd.addColorStop(0.4, `rgba(255,182,92,${0.5 * gl})`);
      grd.addColorStop(1, "rgba(255,150,60,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(f.x, f.y, rad, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,248,222,${0.95 * gl})`;
      g.beginPath(); g.arc(f.x, f.y, 1.6 + gl * 1.4, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // ---- 캡션 + 따뜻한 비네트 --------------------------------------------------
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(60,38,18,0.7)";
    g.fillText(
      viaCam ? "손을 비춰 보세요 — 벽에 그림자 인형이 생겨요 · 가만히 있으면 반딧불이가 손끝에 앉아요"
        : "카메라를 켜면 손 그림자로 놀 수 있어요 — 지금은 커서가 작은 새가 되어 날아요",
      W / 2, H - 14);
    const vg = g.createRadialGradient(W / 2, H * 0.58, Math.min(W, H) * 0.32, W / 2, H * 0.58, maxd * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(24,12,4,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---- 반딧불이 배정 + 이동 -------------------------------------------------
  _fireflies(dt, t) {
    const ff = this.ff, hands = this.hands, W = this.w, H = this.h;
    // 손끝 슬롯 배정/해제 (핫루프 무할당)
    for (let hi = 0; hi < 4; hi++) {
      const h = hands[hi];
      for (let k = 0; k < 5; k++) {
        const fi = h.tip[k];
        const release = !h.on || !h.pts || h.speed > 260;
        const canGrab = h.on && h.pts && h.still > 0.9 && h.speed < 120;
        if (fi >= 0 && release) {
          const f = ff[fi]; f.hand = -1; f.tip = -1; h.tip[k] = -1;
          if (h.speed > 650) { f.vx += rand(-1, 1) * 300; f.vy += rand(-1, 1) * 300 - 140; }
        } else if (fi < 0 && canGrab) {
          const tp = h.pts[TIPS[k]];
          let best = -1, bd = 1e9;
          for (let j = 0; j < NUM_FF; j++) {
            if (ff[j].hand >= 0) continue;
            const d = Math.hypot(ff[j].x - tp.x, ff[j].y - tp.y);
            if (d < bd) { bd = d; best = j; }
          }
          if (best >= 0) { ff[best].hand = hi; ff[best].tip = k; h.tip[k] = best; }
        }
      }
    }
    // 이동
    for (const f of ff) {
      if (f.hand >= 0) {
        const h = hands[f.hand];
        if (!h.on || !h.pts) { f.hand = -1; f.tip = -1; }
        else {
          const tp = h.pts[TIPS[f.tip]];
          const e = 1 - Math.exp(-dt * 12);
          f.x = lerp(f.x, tp.x + Math.sin(t * 3 + f.ph) * 2, e);
          f.y = lerp(f.y, tp.y + Math.cos(t * 3.4 + f.ph) * 2, e);
          f.vx = 0; f.vy = 0;
          f.glow = clamp(f.glow + dt * 2.4, 0, 1);
          continue;
        }
      }
      // 앰비언트: 벽을 하늘하늘 떠다니며 반짝인다
      f.wa += rand(-1, 1) * dt * 2.2;
      f.vx += Math.cos(f.wa) * 42 * dt;
      f.vy += Math.sin(f.wa) * 42 * dt - 4 * dt;
      if (f.x < 40) f.vx += 70 * dt; else if (f.x > W - 40) f.vx -= 70 * dt;
      if (f.y < 40) f.vy += 70 * dt; else if (f.y > H - 40) f.vy -= 70 * dt;
      f.vx *= Math.exp(-dt * 1.3); f.vy *= Math.exp(-dt * 1.3);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.glow = 0.32 + 0.26 * Math.sin(t * 2.5 + f.ph);
    }
  }

  // ---- 그림자 렌더 ----------------------------------------------------------
  _drawShadows(g, t) {
    const hands = this.hands;
    g.lineCap = "round"; g.lineJoin = "round";
    // 반그림자(부드러운 가장자리): 넓고 투명하게 두 겹
    for (const h of hands) {
      if (h.glow < 0.02 || !(h.pts || h.bird)) continue;
      const s = h.soft;
      if (h.pts) { this._handShadow(g, h, 2.4 * s, 0.09 * h.glow); this._handShadow(g, h, 1.5 * s, 0.16 * h.glow); }
      else { this._birdShadow(g, h, t, 2.2 * s, 0.10 * h.glow); this._birdShadow(g, h, t, 1.4 * s, 0.18 * h.glow); }
    }
    // 두 손이 가까우면 그림자를 잇는 다리 → 새·나비로 합쳐진다
    for (let i = 0; i < 4; i++) {
      const a = hands[i]; if (!a.on || !a.pts) continue;
      for (let j = i + 1; j < 4; j++) {
        const b = hands[j]; if (!b.on || !b.pts) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const near = (a.r + b.r) * 1.15;
        if (d < near) {
          const al = 0.82 * Math.min(a.glow, b.glow) * (1 - d / near);
          g.strokeStyle = `rgba(34,20,10,${al})`;
          g.lineWidth = Math.min(a.r, b.r) * 0.7;
          g.beginPath(); g.moveTo(a.ocx, a.ocy); g.lineTo(b.ocx, b.ocy); g.stroke();
        }
      }
    }
    // 짙은 실루엣(움브라)
    for (const h of hands) {
      if (h.glow < 0.02 || !(h.pts || h.bird)) continue;
      if (h.pts) this._handShadow(g, h, 1.0, 0.82 * h.glow);
      else this._birdShadow(g, h, t, 1.0, 0.85 * h.glow);
    }
  }

  _handShadow(g, h, wmul, a) {
    const pts = h.pts, sc = h.sc, ox = h.ocx, oy = h.ocy, hx = h.x, hy = h.y;
    const fw = Math.max(2, h.r * 0.22 * sc * wmul);
    g.strokeStyle = `rgba(34,20,10,${a})`;
    g.fillStyle = `rgba(34,20,10,${a})`;
    g.lineWidth = fw;
    for (const ch of CHAINS) {
      g.beginPath();
      g.moveTo(ox + (pts[ch[0]].x - hx) * sc, oy + (pts[ch[0]].y - hy) * sc);
      for (let k = 1; k < ch.length; k++) g.lineTo(ox + (pts[ch[k]].x - hx) * sc, oy + (pts[ch[k]].y - hy) * sc);
      g.stroke();
    }
    const jr = fw * 0.5;                       // 관절을 채워 빈틈 없는 실루엣으로
    for (let i = 0; i < 21; i++) { g.beginPath(); g.arc(ox + (pts[i].x - hx) * sc, oy + (pts[i].y - hy) * sc, jr, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(ox, oy, h.r * 0.5 * sc, 0, TAU); g.fill();   // 손바닥 덩어리
  }

  _birdShadow(g, h, t, wmul, a) {
    const sc = h.sc, x = h.ocx, y = h.ocy, r = h.r;
    const flap = Math.sin(t * 7);
    const ws = r * 1.7 * sc;
    g.strokeStyle = `rgba(34,20,10,${a})`;
    g.fillStyle = `rgba(34,20,10,${a})`;
    g.lineWidth = Math.max(2, r * 0.5 * sc * wmul);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x - ws * 0.5, y - ws * 0.34 + flap * ws * 0.42, x - ws, y - flap * ws * 0.5); g.stroke();
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + ws * 0.5, y - ws * 0.34 + flap * ws * 0.42, x + ws, y - flap * ws * 0.5); g.stroke();
    g.beginPath(); g.ellipse(x, y + r * 0.12 * sc, r * 0.28 * sc, r * 0.5 * sc, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(x, y - r * 0.5 * sc, r * 0.22 * sc, 0, TAU); g.fill();
  }

  // 한지 섬유 질감 타일 (1회 베이크)
  _bakePaper() {
    const c = document.createElement("canvas");
    c.width = 220; c.height = 220;
    const p = c.getContext("2d");
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 220, y = Math.random() * 220, len = rand(4, 26);
      const dark = Math.random() < 0.5;
      p.strokeStyle = dark ? `rgba(70,48,24,${rand(0.02, 0.06)})` : `rgba(255,238,200,${rand(0.02, 0.07)})`;
      p.lineWidth = rand(0.5, 1.4);
      p.beginPath(); p.moveTo(x, y); p.lineTo(x + rand(-3, 3), y + len); p.stroke();
    }
    for (let i = 0; i < 260; i++) {
      p.fillStyle = `rgba(80,56,28,${rand(0.02, 0.05)})`;
      p.beginPath(); p.arc(Math.random() * 220, Math.random() * 220, rand(0.5, 1.6), 0, TAU); p.fill();
    }
    return c;
  }
}
