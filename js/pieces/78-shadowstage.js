// ============================================================================
//  78 · Shadow Stage (그림자 인형극) — 마술사의 손 [VisionPiece · hand]
//  촛불이 일렁이는 한지 벽. 손이 보이면 그 자리엔 언제나 그림자 인형이 있다 —
//  손 실루엣은 그리지 않고, 손 모양에 따라 인형이 바뀐다:
//    (기본) 손 = 강아지 · ✊ 주먹 = 달팽이 · ☝ 검지 = 애벌레
//    ✌ 가위 = 토끼 · 🖐 활짝 = 새 · 🙌 두 손 활짝 가까이 = 커다란 나비
//  인형이 나타나면 무대도 응답한다(종이 인형극 레이어): 토끼=풀 언덕이 아래서
//  쑥, 새=구름이 양옆에서 + 무지개가 자라나고, 나비=꽃 두 송이가 피고,
//  달팽이=잎사귀가 스윽, 애벌레=사과가 톡 떨어진다. 손 모양이 풀리면 다시 손.
//  반딧불이 12마리 — 손이 1초 가만히 있으면 손끝에 내려앉는다.
//  판정은 히스테리시스(진입 0.4s/해제 0.3s)로 관대하게. 커서 폴백 = 새 인형.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";

const TIPS = [4, 8, 12, 16, 20], PIPS = [3, 6, 10, 14, 18];
const INK = "26,18,12";              // 그림자 먹색
const POSE_PUPPET = { hand: "dog", fist: "snail", point: "worm", scissors: "rabbit", open: "bird" };
const HINTS = ["✌ 가위를 내면 누가 올까요?", "✊ 주먹을 꼭 쥐면?", "🖐 손을 활짝 펴 보세요", "🙌 두 손을 활짝 펴 가까이!", "☝ 검지 하나만 세우면?"];

export default class ShadowStage extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({
        on: false, pts: null, cx: 0, cy: 0, r: 60, px: 0, py: 0,
        pose: "hand", prev: "hand", cand: "hand", candT: 0, morph: 1,
        still: 0, glow: 0, flip: 1, _cls: "hand",
      });
    this.butter = 0;                 // 두 손 나비 엔벨로프
    this.bg = { rabbit: 0, bird: 0, butterfly: 0, snail: 0, worm: 0 };
    this.appleBounce = 0;
    this.flies = [];
    for (let i = 0; i < 12; i++)
      this.flies.push({ x: rand(0.1, 0.9), y: rand(0.15, 0.8), vx: 0, vy: 0, ph: rand(0, TAU), perch: null });
    this.spk = [];
    for (let i = 0; i < 90; i++) this.spk.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    this._capT = 0; this._capI = 0;
  }

  _digest(lms) {
    const pts = lms.map((l) => this.toCanvas(l));
    let cx = 0, cy = 0;
    for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 5; cy /= 5;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    r = Math.max(36, r);
    // 손가락 폄 판정(검지~새끼): 손끝이 PIP보다 팜 중심에서 충분히 멀면 폄
    const ext = [];
    for (let f = 1; f < 5; f++) {
      const tip = pts[TIPS[f]], pip = pts[PIPS[f]];
      const dTip = Math.hypot(tip.x - cx, tip.y - cy), dPip = Math.hypot(pip.x - cx, pip.y - cy);
      ext.push(dTip > dPip * 1.18);
    }
    return { pts, cx, cy, r, ext };
  }
  _classify(d) {
    const n = d.ext.filter(Boolean).length;
    if (n === 0) return "fist";
    if (n === 1 && d.ext[0]) return "point";                 // 검지만
    if (n === 2 && d.ext[0] && d.ext[1]) return "scissors";  // 검지+중지
    if (n >= 3) return "open";
    return "hand";
  }

  _spark(x, y, n) {
    for (let i = 0; i < n; i++) {
      const p = this.spk.find((q) => !q.on);
      if (!p) return;
      p.on = true; p.x = x + rand(-10, 10); p.y = y + rand(-10, 10);
      const a = rand(0, TAU);
      p.vx = Math.cos(a) * rand(20, 90); p.vy = Math.sin(a) * rand(20, 90) - 30;
      p.life = rand(0.4, 0.9);
    }
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i].length >= 21) {
        const d = this._digest(lms[i]);
        if (!h.on) { h.px = d.cx; h.py = d.cy; }
        h.on = true; h.pts = d.pts; h.cx = d.cx; h.cy = d.cy; h.r = d.r;
        h._cls = this._classify(d);
      } else { h.on = false; h.pts = null; h._cls = "hand"; }
    }
    this._scene(dt, t, true);
  }
  drawIdle(dt, t) {
    const h = this.hands[0];
    if (this.pointer.active) {
      if (!h.on) { h.px = this.pointer.x; h.py = this.pointer.y; }
      h.on = true; h.pts = null; h.cx = this.pointer.x; h.cy = this.pointer.y; h.r = 56;
      h._cls = "open";                                  // 커서 = 새 인형
    } else { h.on = false; h._cls = "hand"; }
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // ---- 제스처 히스테리시스 + 두 손 나비 ------------------------------------
    const opens = this.hands.filter((h) => h.on && h._cls === "open");
    let butterPair = null;
    if (opens.length >= 2) {
      const [a, b] = opens;
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.r + b.r) * 1.6) butterPair = [a, b];
    }
    this.butter = clamp(this.butter + (butterPair ? dt * 4 : -dt * 3.3), 0, 1);
    this._butterPair = butterPair || this._butterPair;

    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      if (!h.on) continue;
      const cls = h._cls;
      if (cls !== h.pose) {                              // 인형 → 인형 전환(히스테리시스 0.3s)
        if (cls === h.cand) h.candT += dt; else { h.cand = cls; h.candT = 0; }
        if (h.candT >= 0.3) {
          h.prev = h.pose; h.pose = cls; h.candT = 0; h.morph = 0;
          this._spark(h.cx, h.cy, 16);
        }
      } else h.candT = 0;
      h.morph = Math.min(1, h.morph + dt * 4);           // 0.25s 크로스페이드
      // 정지 판정(반딧불이 착지) + 이동 방향 플립
      const sp = Math.hypot(h.cx - h.px, h.cy - h.py) / Math.max(dt, 1e-3);
      h.still = sp < 40 ? h.still + dt : 0;
      if (Math.abs(h.cx - h.px) > 2) h.flip = h.cx - h.px > 0 ? 1 : -1;
      h.px = h.cx; h.py = h.cy;
    }

    // 배경 엔벨로프: 그 인형이 무대에 있는가 (강아지는 기본 무대 그대로)
    const want = { rabbit: 0, bird: 0, butterfly: this.butter > 0.5 ? 1 : 0, snail: 0, worm: 0 };
    for (const h of this.hands) {
      if (!h.on || h.morph < 0.5) continue;
      if (this.butter > 0.5 && h._cls === "open") continue;   // 나비가 우선
      const pup = POSE_PUPPET[h.pose];
      if (pup && want[pup] !== undefined) want[pup] = 1;
    }
    for (const k in this.bg) this.bg[k] = clamp(this.bg[k] + (want[k] ? dt * 2.2 : -dt * 1.8), 0, 1);
    this.appleBounce = want.worm ? Math.min(1, this.appleBounce + dt * 1.1) : 0;

    // ---- 한지 벽 + 촛불 --------------------------------------------------------
    const flick = 0.92 + 0.08 * Math.sin(t * 9 + Math.sin(t * 23) * 1.7);
    const wall = g.createRadialGradient(W * 0.5, H * 0.62, 0, W * 0.5, H * 0.62, Math.max(W, H) * 0.85);
    wall.addColorStop(0, `rgba(${232 * flick | 0},${196 * flick | 0},${142 * flick | 0},1)`);
    wall.addColorStop(0.6, "#b98d55"); wall.addColorStop(1, "#6f5230");
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.05;                                   // 종이 결
    for (let y = 0; y < H; y += 7) { g.fillStyle = y % 14 ? "#fff" : "#000"; g.fillRect(0, y, W, 1); }
    g.globalAlpha = 1;

    // ---- 종이 인형극 배경 레이어(그림자보다 뒤) -------------------------------
    this._bgLayers(g, W, H, t);

    // ---- 그림자들 --------------------------------------------------------------
    const drew = new Set();
    if (this.butter > 0.03 && this._butterPair) {
      const [pa, pb] = this._butterPair;
      this._pButterfly(g, pa, pb, t, this.butter);
      if (this.butter > 0.5) { drew.add(pa); drew.add(pb); }
    }
    for (const h of this.hands) {
      if ((!h.on && h.glow < 0.03) || drew.has(h)) continue;
      // 손 실루엣은 그리지 않는다 — 언제나 인형이 손을 대신한다.
      const pup = POSE_PUPPET[h.pose] || "dog";
      const prevPup = POSE_PUPPET[h.prev] || "dog";
      const s = h.r * 1.35;
      if (h.morph < 0.98 && prevPup !== pup)
        this._puppet(g, prevPup, h.cx, h.cy, s, h.flip, t, (1 - h.morph) * h.glow);
      const pop = 1 + 0.12 * Math.sin(h.morph * Math.PI);
      this._puppet(g, pup, h.cx, h.cy, s * pop, h.flip, t, h.morph * h.glow);
    }

    // ---- 반딧불이 --------------------------------------------------------------
    for (const f of this.flies) {
      let px = f.x * W, py = f.y * H;
      if (f.perch && (!f.perch.h.on || !f.perch.h.pts || f.perch.h.still < 0.2)) {
        f.perch = null; f.vx = rand(-60, 60); f.vy = rand(-60, 10);
      }
      if (!f.perch) {
        const cand = this.hands.find((h) => h.on && h.still > 1 && h.pts);
        if (cand && Math.random() < dt * 1.6) f.perch = { h: cand, tip: TIPS[(Math.random() * 5) | 0] };
        f.vx += rand(-40, 40) * dt * 60 * 0.5; f.vy += rand(-40, 40) * dt * 60 * 0.5;
        f.vx *= Math.exp(-dt * 1.2); f.vy *= Math.exp(-dt * 1.2);
        f.x = (f.x + (f.vx * dt) / W + 1) % 1; f.y = clamp(f.y + (f.vy * dt) / H, 0.05, 0.92);
        px = f.x * W; py = f.y * H;
      } else {
        const p = f.perch.h.pts[f.perch.tip];
        px = lerp(px, p.x, 0.2); py = lerp(py, p.y - 6, 0.2);
        f.x = px / W; f.y = py / H;
      }
      const tw = 0.5 + 0.5 * Math.sin(t * 3.2 + f.ph);
      const fg = g.createRadialGradient(px, py, 0, px, py, 14);
      fg.addColorStop(0, `rgba(255,236,150,${0.55 * tw})`); fg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fg; g.beginPath(); g.arc(px, py, 14, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,246,190,${0.8 * tw + 0.2})`;
      g.beginPath(); g.arc(px, py, 2, 0, TAU); g.fill();
    }

    // 변신 마법가루
    g.fillStyle = "rgba(255,236,170,0.9)";
    for (const p of this.spk) {
      if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = clamp(p.life * 1.6, 0, 1);
      g.fillRect(p.x, p.y, 2, 2);
    }
    g.globalAlpha = 1;

    // ---- 캡션(제스처 힌트 순환) -------------------------------------------------
    this._capT += dt;
    if (this._capT > 4) { this._capT = 0; this._capI = (this._capI + 1) % HINTS.length; }
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(58,40,24,0.7)";
    g.fillText(
      (viaCam ? "손 모양을 지으면 그림자가 변신해요 — " : "카메라를 켜면 손이 인형이 돼요 (지금은 커서가 새) — ") + HINTS[this._capI],
      W / 2, H - 14);

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(40,24,10,0.35)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---- 인형 실루엣(반그림자 1회 + 본그림자 1회) --------------------------------
  _puppet(g, kind, x, y, s, flip, t, alpha) {
    this._puppetPass(g, kind, x, y + 4, s * 1.05, flip, t, 0.2 * alpha);
    this._puppetPass(g, kind, x, y, s, flip, t, 0.82 * alpha);
  }
  _puppetPass(g, kind, x, y, s, flip, t, a) {
    g.save(); g.translate(x, y); g.scale(flip, 1);
    g.fillStyle = `rgba(${INK},${a})`;
    if (kind === "rabbit") {
      const hop = Math.sin(t * 5) * s * 0.02;
      g.beginPath(); g.ellipse(0, s * 0.18 + hop, s * 0.34, s * 0.26, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(s * 0.26, -s * 0.02 + hop, s * 0.17, s * 0.15, 0, 0, TAU); g.fill();
      for (const [ox, rot] of [[-0.02, -0.28], [0.1, -0.06]]) {
        g.save(); g.translate(s * (0.24 + ox), -s * 0.12 + hop); g.rotate(rot + Math.sin(t * 3) * 0.05);
        g.beginPath(); g.ellipse(0, -s * 0.24, s * 0.06, s * 0.27, 0, 0, TAU); g.fill(); g.restore();
      }
      g.beginPath(); g.arc(-s * 0.32, s * 0.16 + hop, s * 0.09, 0, TAU); g.fill();
    } else if (kind === "bird") {
      const flap = Math.sin(t * 7) * 0.5;
      g.beginPath(); g.ellipse(0, 0, s * 0.3, s * 0.16, -0.1, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(s * 0.28, -s * 0.03); g.lineTo(s * 0.44, 0); g.lineTo(s * 0.28, s * 0.05); g.closePath(); g.fill();
      for (const dir of [-1, 1]) {
        g.save(); g.translate(-s * 0.03, -s * 0.04); g.rotate(dir * (0.5 + flap) * 0.9);
        g.beginPath(); g.ellipse(-s * 0.05, -s * 0.22, s * 0.13, s * 0.3, 0.25, 0, TAU); g.fill(); g.restore();
      }
      g.beginPath(); g.moveTo(-s * 0.28, 0); g.lineTo(-s * 0.46, -s * 0.07); g.lineTo(-s * 0.42, s * 0.08); g.closePath(); g.fill();
    } else if (kind === "snail") {
      g.beginPath(); g.ellipse(0, s * 0.2, s * 0.36, s * 0.1, 0, 0, TAU); g.fill();
      g.save(); g.translate(-s * 0.05, 0);
      g.lineWidth = s * 0.09; g.strokeStyle = `rgba(${INK},${a})`;
      g.beginPath();
      for (let k = 0; k < 40; k++) {
        const an = k * 0.42, rr = s * 0.02 + an * s * 0.023;
        g.lineTo(Math.cos(an) * rr, -s * 0.05 + Math.sin(an) * rr * 0.85);
      }
      g.stroke(); g.restore();
      g.lineWidth = s * 0.035; g.strokeStyle = `rgba(${INK},${a})`;
      for (const o of [-0.04, 0.06]) {
        g.beginPath(); g.moveTo(s * 0.3, s * 0.1);
        g.quadraticCurveTo(s * (0.4 + o), -s * 0.08, s * (0.44 + o), -s * (0.14 - o)); g.stroke();
        g.beginPath(); g.arc(s * (0.44 + o), -s * (0.14 - o), s * 0.03, 0, TAU); g.fill();
      }
    } else if (kind === "dog") {
      const wag = Math.sin(t * 9) * 0.35;
      g.beginPath(); g.ellipse(0, s * 0.16, s * 0.34, s * 0.2, 0, 0, TAU); g.fill();            // 몸
      g.beginPath(); g.ellipse(s * 0.28, -s * 0.05, s * 0.15, s * 0.13, 0.1, 0, TAU); g.fill(); // 머리
      g.beginPath(); g.ellipse(s * 0.42, -s * 0.01, s * 0.1, s * 0.055, 0.08, 0, TAU); g.fill(); // 주둥이
      g.save(); g.translate(s * 0.22, -s * 0.15); g.rotate(-0.3 + Math.sin(t * 3) * 0.08);       // 귀 펄럭
      g.beginPath(); g.ellipse(0, s * 0.06, s * 0.05, s * 0.12, 0, 0, TAU); g.fill(); g.restore();
      g.save(); g.translate(-s * 0.3, s * 0.02); g.rotate(-0.6 + wag);                           // 꼬리 살랑
      g.beginPath(); g.ellipse(-s * 0.1, -s * 0.06, s * 0.12, s * 0.04, -0.5, 0, TAU); g.fill(); g.restore();
      for (const lx of [-0.24, -0.11, 0.08, 0.19]) g.fillRect(s * lx, s * 0.26, s * 0.055, s * 0.17); // 다리
    } else if (kind === "worm") {
      for (let k = 0; k < 5; k++) {
        const wx = (k - 2) * s * 0.15, wy = Math.sin(t * 6 + k * 1.1) * s * 0.05;
        g.beginPath(); g.arc(wx, wy, s * (0.11 - k * 0.006), 0, TAU); g.fill();
      }
      g.beginPath(); g.arc(s * 0.34, Math.sin(t * 6 + 3.3) * s * 0.05 - s * 0.02, s * 0.12, 0, TAU); g.fill();
    }
    g.restore();
  }
  _pButterfly(g, ha, hb, t, alpha) {
    const a = 0.8 * alpha;
    const cx = (ha.cx + hb.cx) / 2, cy = (ha.cy + hb.cy) / 2;
    const s = (ha.r + hb.r) * 0.9;
    g.fillStyle = `rgba(${INK},${a})`;
    g.beginPath(); g.ellipse(cx, cy, s * 0.06, s * 0.3, 0, 0, TAU); g.fill();
    g.lineWidth = s * 0.02; g.strokeStyle = `rgba(${INK},${a})`;
    for (const d of [-1, 1]) {
      g.beginPath(); g.moveTo(cx, cy - s * 0.26);
      g.quadraticCurveTo(cx + d * s * 0.1, cy - s * 0.42, cx + d * s * 0.16, cy - s * 0.44); g.stroke();
    }
    const fl = Math.sin(t * 4) * 0.12;
    for (const [h2, dir] of [[ha, ha.cx < hb.cx ? -1 : 1], [hb, ha.cx < hb.cx ? 1 : -1]]) {
      g.save(); g.translate(cx, cy); g.rotate(dir * fl);
      g.beginPath(); g.ellipse((h2.cx - cx) * 0.85, (h2.cy - cy) * 0.85 - s * 0.08, h2.r * 0.85, h2.r * 0.62, dir * 0.35, 0, TAU); g.fill();
      g.beginPath(); g.ellipse((h2.cx - cx) * 0.7, (h2.cy - cy) * 0.7 + s * 0.14, h2.r * 0.55, h2.r * 0.4, dir * 0.2, 0, TAU); g.fill();
      g.restore();
    }
  }

  // ---- 종이극 배경 레이어 --------------------------------------------------------
  _bgLayers(g, W, H, t) {
    const paper = (a) => `rgba(58,38,20,${a})`;
    const ease = (v) => v * v * (3 - 2 * v);
    // 토끼: 풀 언덕 + 민들레 (아래에서 쑥)
    if (this.bg.rabbit > 0.01) {
      const e = ease(this.bg.rabbit), oy = (1 - e) * H * 0.3;
      g.fillStyle = paper(0.5 * e);
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 24) g.lineTo(x, H - H * 0.16 + Math.sin(x * 0.008) * H * 0.05 + oy);
      g.lineTo(W, H); g.closePath(); g.fill();
      for (const fx of [0.2, 0.55, 0.85]) {
        const bx = W * fx, by = H - H * 0.16 + Math.sin(bx * 0.008) * H * 0.05 + oy;
        g.strokeStyle = paper(0.6 * e); g.lineWidth = 3;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - H * 0.07); g.stroke();
        g.fillStyle = paper(0.5 * e);
        g.beginPath(); g.arc(bx, by - H * 0.085, H * 0.018, 0, TAU); g.fill();
      }
    }
    // 새: 구름(양옆 슬라이드) + 무지개(자라나는 호)
    if (this.bg.bird > 0.01) {
      const e = ease(this.bg.bird);
      const sweep = e * Math.PI;                             // 무지개가 왼쪽부터 자란다
      for (let b = 0; b < 4; b++) {
        g.strokeStyle = `hsla(${[0, 42, 125, 225][b]},60%,58%,${0.3 * e})`;
        g.lineWidth = H * 0.016;
        g.beginPath(); g.arc(W * 0.5, H * 0.98, H * (0.62 - b * 0.028), Math.PI, Math.PI + sweep); g.stroke();
      }
      const cloud = (cx2, cy2, s2) => {
        g.beginPath();
        g.arc(cx2, cy2, s2, 0, TAU); g.arc(cx2 + s2 * 0.9, cy2 + s2 * 0.2, s2 * 0.7, 0, TAU); g.arc(cx2 - s2 * 0.9, cy2 + s2 * 0.25, s2 * 0.65, 0, TAU);
        g.fill();
      };
      g.fillStyle = paper(0.35 * e);
      cloud(-W * 0.12 + e * W * 0.24, H * 0.2, W * 0.05);
      cloud(W * 1.12 - e * W * 0.26, H * 0.14, W * 0.06);
    }
    // 나비: 꽃 두 송이 제자리 팝
    if (this.bg.butterfly > 0.01) {
      const e = ease(this.bg.butterfly);
      for (const [fx, ph] of [[0.18, 0], [0.82, 1.3]]) {
        const s2 = H * 0.07 * e, bx = W * fx, by = H * 0.88;
        g.strokeStyle = paper(0.6 * e); g.lineWidth = 4;
        g.beginPath(); g.moveTo(bx, by + s2); g.lineTo(bx, by - s2 * 0.6); g.stroke();
        g.fillStyle = paper(0.55 * e);
        for (let k = 0; k < 6; k++) {
          const an = ph + (k / 6) * TAU + Math.sin(t * 0.8) * 0.05;
          g.beginPath(); g.ellipse(bx + Math.cos(an) * s2 * 0.5, by - s2 * 0.6 + Math.sin(an) * s2 * 0.5, s2 * 0.28, s2 * 0.16, an, 0, TAU); g.fill();
        }
      }
    }
    // 달팽이: 잎사귀 옆에서 스윽
    if (this.bg.snail > 0.01) {
      const e = ease(this.bg.snail), ox = (1 - e) * -W * 0.3;
      g.save(); g.translate(W * 0.16 + ox, H * 0.82); g.rotate(-0.5);
      g.fillStyle = paper(0.45 * e);
      g.beginPath(); g.ellipse(0, 0, W * 0.13, W * 0.05, 0, 0, TAU); g.fill();
      g.strokeStyle = paper(0.65 * e); g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W * 0.11, 0); g.lineTo(W * 0.11, 0); g.stroke();
      g.restore();
    }
    // 애벌레: 사과가 톡 (위에서 낙하+바운스)
    if (this.bg.worm > 0.01) {
      const e = ease(this.bg.worm);
      const u = this.appleBounce;
      const drop = u < 0.7 ? (u / 0.7) * (u / 0.7)
        : 1 - Math.abs(Math.sin((u - 0.7) * 12)) * 0.08 * (1 - u);
      const ay = H * (-0.1 + drop * 0.42);
      g.fillStyle = paper(0.55 * e);
      g.beginPath(); g.arc(W * 0.78, ay, H * 0.045, 0, TAU); g.fill();
      g.strokeStyle = paper(0.65 * e); g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.78, ay - H * 0.045); g.lineTo(W * 0.785, ay - H * 0.075); g.stroke();
    }
  }
}
