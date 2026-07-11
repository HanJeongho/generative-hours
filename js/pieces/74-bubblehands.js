// ============================================================================
//  74 · Bubble Hands (비눗방울 손) — 손이 가는 곳마다 방울이 [VisionPiece · hand]
//  아이들의 방. 카메라가 손을 보면(최대 4손 — 두 아이의 양손), 손끝이 가는
//  곳마다 비눗방울이 계속 피어난다. 손을 빠르게 휘두르면 방울이 터지고,
//  천천히 스치면 밀려난다. 한 손으로 불고 다른 손으로 터뜨리는 놀이.
//  방울: 반투명 몸통 + 얇은 기름막 무지개 림(hue 회전) + 스페큘러 점 2개,
//  부력과 사인 흔들림으로 상승, 터질 땐 물방울 파편.
//  카메라가 없으면(거부/로딩) 커서가 손이 된다 — 완전한 폴백. 손이 하나도
//  없어도 바닥에서 앰비언트 방울이 드문드문 떠올라 화면이 죽지 않는다.
//  numHands = 4 (MediaPipe HandLandmarker; 성능상 실효 한계 2~4손).
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece, HAND } from "../vision.js";
import { slider } from "./01-currents.js";

const MAXB = 220;

export default class BubbleHands extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.rate = 1.0;          // BUBBLES slider — spawn rate per hand
    this.bubbles = [];
    for (let i = 0; i < MAXB; i++)
      this.bubbles.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, ph: 0, hue: 0, age: 0, wob: 0 });
    this.drops = [];
    for (let i = 0; i < 240; i++) this.drops.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    this.hands = [];          // per-hand state {x,y,px,py,acc,glow}
    for (let i = 0; i < 4; i++) this.hands.push({ on: false, x: 0, y: 0, px: 0, py: 0, acc: 0, glow: 0 });
    this._ambAcc = 0;
  }

  _spawn(x, y, vx, vy) {
    const b = this.bubbles.find((q) => !q.on);
    if (!b) return;
    b.on = true;
    b.x = x + rand(-10, 10); b.y = y + rand(-10, 10);
    b.vx = vx * 0.35 + rand(-18, 18);
    b.vy = vy * 0.35 + rand(-26, -6);
    b.r = rand(7, 26);
    b.ph = rand(0, TAU);
    b.hue = rand(0, 360);
    b.age = 0;
    b.wob = rand(0.6, 1.4);
  }

  _pop(b) {
    b.on = false;
    let n = 0;
    for (const d of this.drops) {
      if (d.on || n >= 8) continue;
      n++; d.on = true;
      const a = rand(0, TAU);
      d.x = b.x + Math.cos(a) * b.r * 0.6; d.y = b.y + Math.sin(a) * b.r * 0.6;
      d.vx = Math.cos(a) * rand(30, 90); d.vy = Math.sin(a) * rand(30, 90) - 30;
      d.life = rand(0.3, 0.7);
    }
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i][HAND.INDEX]) {
        const p = this.toCanvas(lms[i][HAND.INDEX]);
        if (!h.on) { h.px = p.x; h.py = p.y; }
        h.on = true; h.x = p.x; h.y = p.y;
      } else h.on = false;
    }
    this._scene(dt, t, true);
  }
  drawIdle(dt, t) {
    // no camera: the cursor is the hand
    const h = this.hands[0];
    if (this.pointer.active) {
      if (!h.on) { h.px = this.pointer.x; h.py = this.pointer.y; }
      h.on = true; h.x = this.pointer.x; h.y = this.pointer.y;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // ---- dusk air --------------------------------------------------------------
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#141b34"); sky.addColorStop(0.6, "#222b4e"); sky.addColorStop(1, "#3a3560");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.7);
    glow.addColorStop(0, "rgba(255,170,120,0.16)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // ---- hands: spawn streams + swat/push --------------------------------------
    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      if (!h.on) continue;
      const hvx = (h.x - h.px) / Math.max(dt, 1e-3), hvy = (h.y - h.py) / Math.max(dt, 1e-3);
      const speed = Math.hypot(hvx, hvy);

      // a steady stream wherever the hand goes
      h.acc += dt * 14 * this.rate * (1 + Math.min(1.5, speed * 0.004));
      while (h.acc >= 1) { h.acc -= 1; this._spawn(h.x, h.y, hvx, hvy); }

      // fast swipe pops nearby bubbles; slow touch nudges them
      for (const b of this.bubbles) {
        if (!b.on || b.age < 0.35) continue;
        const dx = b.x - h.x, dy = b.y - h.y;
        const dd = Math.hypot(dx, dy);
        if (dd < b.r + 30) {
          if (speed > 520) this._pop(b);
          else { b.vx += (dx / (dd + 1)) * 160 * dt * 8; b.vy += (dy / (dd + 1)) * 160 * dt * 8; }
        }
      }
      h.px = h.x; h.py = h.y;
    }

    // ambient bubbles so the room breathes even with no hands
    this._ambAcc += dt * 1.2;
    while (this._ambAcc >= 1) { this._ambAcc -= 1; this._spawn(rand(W * 0.1, W * 0.9), H + 20, 0, -20); }

    // ---- bubbles ----------------------------------------------------------------
    for (const b of this.bubbles) {
      if (!b.on) continue;
      b.age += dt;
      b.vy -= (14 + b.r * 0.5) * dt;                       // buoyancy: big rises faster
      b.vx += Math.sin(t * b.wob * 2 + b.ph) * 8 * dt;
      b.vx *= Math.exp(-dt * 0.6); b.vy *= Math.exp(-dt * 0.6);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.hue += dt * 40;
      // pop: off the top, or old age (with a little randomness)
      if (b.y < -b.r || b.age > 9 || (b.age > 5 && Math.random() < dt * 0.4)) { this._pop(b); continue; }
      if (b.x < -b.r) b.x = W + b.r; else if (b.x > W + b.r) b.x = -b.r;

      // body: near-transparent lens
      const body = g.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
      body.addColorStop(0, "rgba(255,255,255,0.05)");
      body.addColorStop(0.8, "rgba(200,220,255,0.06)");
      body.addColorStop(1, "rgba(230,240,255,0.16)");
      g.fillStyle = body;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      // oil-film rim: two hue-rotated arcs
      g.lineWidth = Math.max(1.2, b.r * 0.12);
      g.strokeStyle = `hsla(${b.hue % 360},85%,70%,0.5)`;
      g.beginPath(); g.arc(b.x, b.y, b.r * 0.94, b.ph, b.ph + Math.PI * 1.2); g.stroke();
      g.strokeStyle = `hsla(${(b.hue + 140) % 360},85%,72%,0.4)`;
      g.beginPath(); g.arc(b.x, b.y, b.r * 0.94, b.ph + Math.PI * 1.2, b.ph + TAU); g.stroke();
      // speculars
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath(); g.arc(b.x - b.r * 0.35, b.y - b.r * 0.4, Math.max(1, b.r * 0.13), 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.beginPath(); g.arc(b.x + b.r * 0.3, b.y + b.r * 0.25, Math.max(0.8, b.r * 0.07), 0, TAU); g.fill();
    }

    // droplets from pops
    g.fillStyle = "rgba(210,230,255,0.8)";
    for (const d of this.drops) {
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) { d.on = false; continue; }
      d.vy += 220 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      g.globalAlpha = clamp(d.life * 1.6, 0, 1);
      g.fillRect(d.x, d.y, 2, 2);
    }
    g.globalAlpha = 1;

    // ---- hand halos: where the camera sees you ----------------------------------
    for (const h of this.hands) {
      if (h.glow < 0.02) continue;
      const hg = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, 46);
      hg.addColorStop(0, `rgba(140,235,190,${0.22 * h.glow})`);
      hg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hg;
      g.beginPath(); g.arc(h.x, h.y, 46, 0, TAU); g.fill();
      g.strokeStyle = `rgba(160,240,200,${0.5 * h.glow})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(h.x, h.y, 14 + Math.sin(t * 4) * 2, 0, TAU); g.stroke();
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(215,222,240,0.6)";
    g.fillText(
      viaCam ? "손을 들어 보세요 — 손끝마다 방울이 피어납니다 (최대 4손) · 빠르게 휘두르면 팡!"
        : "카메라를 허용하면 손으로 놀 수 있어요 — 지금은 커서가 손입니다 · 빠르게 지나가면 팡!",
      W / 2, H - 14);

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("BUBBLES", 0.4, 2.5, this.rate, 0.05, (v) => (this.rate = v)));
  }
}
