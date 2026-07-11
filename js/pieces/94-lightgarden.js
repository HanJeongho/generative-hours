// ============================================================================
//  94 · Light Garden (빛의 정원) — 손바닥에서 빛방울 비가 [VisionPiece · hand]
//  아이들의 방. 카메라가 손을 보면(최대 4손), 손바닥을 활짝 펴면 팜 센터에서
//  빛방울이 후두둑 쏟아진다. 방울이 바닥 지평선에 닿은 자리에서 새싹이 돋고
//  → 봉오리 → 파스텔 꽃(꽃잎 5~6장, 색은 랜덤)으로 자란다. 정원은 약 60칸,
//  꽃밭이 화면 가득 찰 수 있고, 오래 핀 꽃은 반짝이다 씨앗으로 돌아가 자리를
//  비운다. 주먹을 쥐면 반딧불 씨앗이 사방으로 흩날려 랜덤한 자리에 새싹을
//  틔운다. 나비 세 마리가 핀 꽃들 사이를 팔랑팔랑 날아다닌다.
//  카메라가 없으면 커서가 손이 된다 — 꾹 누르면 커서에서 빛방울이 내린다.
//  아무도 없어도 씨앗이 드문드문 날아와 정원이 스스로 자란다.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";

const MAXD = 240;   // light drops (rain)
const MAXP = 60;    // garden plants (slots)
const MAXF = 160;   // fireflies / seeds

export default class LightGarden extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.drops = [];
    for (let i = 0; i < MAXD; i++)
      this.drops.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, hue: 0 });
    this.plants = [];
    for (let i = 0; i < MAXP; i++)
      this.plants.push({ on: false, x: 0, g: 0, state: "grow", age: 0, life: 0,
        fade: 0, hue: 0, petals: 5, stemH: 50, ph: 0, leaf: 0 });
    this.fireflies = [];
    for (let i = 0; i < MAXF; i++)
      this.fireflies.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        hue: 0, life: 0, seed: false });
    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({ on: false, x: 0, y: 0, glow: 0, open: 0, fist: false,
        fistPrev: false, acc: 0 });
    this.bfly = [];
    for (let i = 0; i < 3; i++)
      this.bfly.push({ x: rand(0.2, 0.8), y: rand(0.3, 0.6), vx: 0, vy: 0,
        tx: 0, ty: 0, hue: rand(0, 360), wing: rand(0, TAU), rt: 0 });
    this._ambAcc = 0;
  }

  _groundY() { return this.h * 0.84; }

  _spawnDrop(x, y, vx, vy) {
    const d = this.drops.find((q) => !q.on);
    if (!d) return;
    d.on = true;
    d.x = x + rand(-6, 6); d.y = y + rand(-4, 4);
    d.vx = vx * 0.2 + rand(-20, 20);
    d.vy = vy * 0.2 + rand(40, 120);
    d.r = rand(2.5, 5.5);
    d.hue = rand(38, 60);   // warm gold light
  }

  _spawnPlant(x) {
    const p = this.plants.find((q) => !q.on);
    if (!p) return false;
    const m = 24;
    p.on = true;
    p.x = clamp(x, m, this.w - m);
    p.g = 0; p.state = "grow"; p.age = 0; p.life = rand(7, 15); p.fade = 0;
    p.hue = rand(0, 360);
    p.petals = Math.random() < 0.5 ? 5 : 6;
    p.stemH = rand(34, 78);
    p.ph = rand(0, TAU);
    p.leaf = rand(0.35, 0.6);
    return true;
  }

  _spawnFirefly(x, y, seed) {
    const f = this.fireflies.find((q) => !q.on);
    if (!f) return;
    f.on = true;
    f.x = x; f.y = y;
    f.hue = rand(60, 130);   // greeny-gold spark
    f.seed = !!seed;
    f.life = rand(1.6, 3.2);
    if (seed) {
      f.tx = rand(this.w * 0.06, this.w * 0.94);
      f.ty = this._groundY() - rand(0, 6);
    } else {
      f.tx = x + rand(-40, 40); f.ty = y - rand(60, 160);
    }
    f.vx = 0; f.vy = 0;
  }

  // openness 다이제스트(74 문법): 손바닥 중심·펴짐 정도·주먹 여부
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
    return { cx, cy, r, open };
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i].length >= 21) {
        const d = this._digest(lms[i]);
        h.on = true; h.x = d.cx; h.y = d.cy; h.open = d.open; h.fist = d.open < 0.62;
      } else { h.on = false; }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    const h = this.hands[0];
    if (this.pointer.active) {
      h.on = true; h.x = this.pointer.x; h.y = this.pointer.y;
      h.open = this.pointer.down ? 1 : 0.4;   // 꾹 누르면 활짝(비), 아니면 다문 손
      h.fist = false;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    dt = clamp(dt, 0, 0.05);
    const g = this.ctx, W = this.w, H = this.h, gy = this._groundY();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // ---- garden air: soft dawn -----------------------------------------------
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#20223f"); sky.addColorStop(0.55, "#3a3560"); sky.addColorStop(1, "#5a4d6e");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(W * 0.5, gy, 0, W * 0.5, gy, H * 0.7);
    sun.addColorStop(0, "rgba(255,210,150,0.18)"); sun.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    const gnd = g.createLinearGradient(0, gy - 4, 0, H);
    gnd.addColorStop(0, "rgba(52,46,72,0.0)");
    gnd.addColorStop(0.2, "rgba(52,46,72,0.85)");
    gnd.addColorStop(1, "#2a2440");
    g.fillStyle = gnd; g.fillRect(0, gy - 4, W, H - gy + 4);

    // ---- hands: open palm rains light, fist scatters seeds -------------------
    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      if (!h.on) { h.fistPrev = false; continue; }
      if (h.open > 0.85) {
        h.acc += dt * (26 + (h.open - 0.85) * 60);
        while (h.acc >= 1) { h.acc -= 1; this._spawnDrop(h.x, h.y, 0, 40); }
      } else h.acc = 0;
      if (h.fist && !h.fistPrev)                 // 주먹 쥔 순간: 씨앗 흩뿌리기
        for (let k = 0; k < 10; k++) this._spawnFirefly(h.x, h.y, true);
      h.fistPrev = h.fist;
    }

    // 아무도 없어도 씨앗이 드문드문 날아와 정원이 스스로 자란다
    this._ambAcc += dt * 0.5;
    while (this._ambAcc >= 1) {
      this._ambAcc -= 1;
      this._spawnFirefly(rand(W * 0.1, W * 0.9), -10, true);
    }

    // ---- drops: fall, splash into sprouts ------------------------------------
    for (const d of this.drops) {
      if (!d.on) continue;
      d.vy += 220 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y >= gy) { this._spawnPlant(d.x); d.on = false; continue; }
      if (d.x < -10 || d.x > W + 10) { d.on = false; continue; }
      g.fillStyle = `hsla(${d.hue},95%,80%,0.9)`;
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill();
      g.fillStyle = `hsla(${d.hue},95%,72%,0.16)`;
      g.beginPath(); g.arc(d.x, d.y, d.r * 2.6, 0, TAU); g.fill();
    }

    // ---- plants: grow → bud → bloom → sparkle → seed -------------------------
    for (const p of this.plants) {
      if (!p.on) continue;
      if (p.state === "grow") {
        p.g += dt * 0.4;
        if (p.g >= 1) { p.g = 1; p.state = "live"; p.age = 0; }
      } else if (p.state === "live") {
        p.age += dt;
        if (p.age > p.life) { p.state = "fade"; p.fade = 0; }
      } else {
        p.fade += dt;
        if (p.fade >= 1.4) { this._spawnFirefly(p.x, gy - p.stemH, false); p.on = false; continue; }
      }
      this._drawPlant(g, p, t, gy);
    }

    // ---- fireflies / seeds ---------------------------------------------------
    for (const f of this.fireflies) {
      if (!f.on) continue;
      f.life -= dt;
      const dx = f.tx - f.x, dy = f.ty - f.y, dd = Math.hypot(dx, dy) + 1e-3;
      f.vx = lerp(f.vx, (dx / dd) * 140, dt * 3) + Math.sin(t * 6 + f.x) * 6 * dt;
      f.vy = lerp(f.vy, (dy / dd) * 140, dt * 3);
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.seed && dd < 14) { this._spawnPlant(f.tx); f.on = false; continue; }
      if (f.life <= 0) { f.on = false; continue; }
      const tw = 0.6 + 0.4 * Math.sin(t * 12 + f.x), la = clamp(f.life, 0, 1);
      g.fillStyle = `hsla(${f.hue},90%,82%,${la * tw})`;
      g.beginPath(); g.arc(f.x, f.y, 2.4, 0, TAU); g.fill();
      g.fillStyle = `hsla(${f.hue},90%,78%,${la * 0.2})`;
      g.beginPath(); g.arc(f.x, f.y, 7, 0, TAU); g.fill();
    }

    // ---- butterflies over the blooms -----------------------------------------
    this._butterflies(g, dt, t, gy);

    // ---- hand markers: small circle + aura (74 문법) -------------------------
    for (const h of this.hands) {
      if (h.glow < 0.02) continue;
      const mr = 13, warm = h.fist ? 1 : 0, lush = h.open > 0.85 ? 40 : 0;
      const hg = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, mr * 2.6);
      hg.addColorStop(0, `rgba(${180 + warm * 60 | 0},${230 - warm * 60 | 0},${170 + lush | 0},${0.26 * h.glow})`);
      hg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hg;
      g.beginPath(); g.arc(h.x, h.y, mr * 2.6, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,240,210,${0.6 * h.glow})`;
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(h.x, h.y, mr + Math.sin(t * 3) * 1.2, 0, TAU); g.stroke();
    }

    // caption
    g.font = "12px ui-monospace, Menlo, monospace";
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(240,232,220,0.62)";
    g.fillText(
      viaCam ? "손바닥을 활짝 펴면 빛방울이 쏟아져 꽃이 피어요 · 주먹을 쥐면 반딧불 씨앗이 흩날려요"
        : "카메라를 허용하면 손으로 정원을 키워요 — 지금은 커서를 꾹 누르면 빛방울이 내려요",
      W / 2, H - 14);
  }

  // 한 그루: 줄기 → 봉오리 → 파스텔 꽃 → 반짝이며 씨앗으로
  _drawPlant(g, p, t, gy) {
    const sc = p.state === "fade" ? clamp(1 - p.fade / 1.4, 0, 1) : 1;
    if (sc <= 0.001) return;
    const stemGrow = clamp(p.g / 0.6, 0, 1);
    const bloom = clamp((p.g - 0.6) / 0.4, 0, 1);
    const sway = Math.sin(t * 1.2 + p.ph) * (6 + p.stemH * 0.06) * stemGrow;
    const topX = p.x + sway, topY = gy - p.stemH * stemGrow * sc;
    // stem
    g.strokeStyle = "rgba(150,200,150,0.75)";
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(p.x, gy);
    g.quadraticCurveTo(p.x + sway * 0.4, (gy + topY) / 2, topX, topY);
    g.stroke();
    // leaves
    if (stemGrow > 0.4) {
      const ly = lerp(gy, topY, 0.5), lx = lerp(p.x, topX, 0.5);
      g.fillStyle = "rgba(150,205,150,0.7)";
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(lx + s * 8, ly, 10 * p.leaf * stemGrow, 5 * p.leaf, s * 0.6, 0, TAU);
        g.fill();
      }
    }
    if (bloom <= 0) {                                  // 봉오리
      if (p.g > 0.3) {
        g.fillStyle = `hsla(${p.hue},70%,78%,0.9)`;
        g.beginPath(); g.ellipse(topX, topY, 5 * sc, 8 * sc, 0, 0, TAU); g.fill();
      }
      return;
    }
    // 꽃: 꽃잎 고리
    const pr = (10 + p.stemH * 0.18) * bloom * sc;
    const spin = p.state === "fade" ? t * 0.4 : 0;
    for (let i = 0; i < p.petals; i++) {
      const a = (i / p.petals) * TAU + spin;
      const px = topX + Math.cos(a) * pr, py = topY + Math.sin(a) * pr;
      const pg = g.createRadialGradient(px, py, 0, px, py, pr * 0.95);
      pg.addColorStop(0, `hsla(${p.hue},80%,85%,0.95)`);
      pg.addColorStop(1, `hsla(${(p.hue + 20) % 360},75%,72%,0.35)`);
      g.fillStyle = pg;
      g.beginPath(); g.ellipse(px, py, pr * 0.7, pr * 0.95, a + Math.PI / 2, 0, TAU); g.fill();
    }
    g.fillStyle = `hsla(${(p.hue + 40) % 360},85%,88%,0.95)`;   // 꽃술
    g.beginPath(); g.arc(topX, topY, pr * 0.5, 0, TAU); g.fill();
    // 씨앗으로 돌아갈 때 반짝임
    if (p.state === "fade") {
      const n = 6, a0 = 0.7 * (1 - sc);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 4;
        const rr = pr * (1.4 + Math.sin(t * 8 + i) * 0.4);
        g.fillStyle = `rgba(255,250,220,${a0})`;
        g.beginPath(); g.arc(topX + Math.cos(a) * rr, topY + Math.sin(a) * rr, 1.8, 0, TAU); g.fill();
      }
    }
  }

  // 나비: 핀 꽃을 목표로 팔랑팔랑, 없으면 허공을 배회
  _butterflies(g, dt, t, gy) {
    const W = this.w, H = this.h;
    for (const b of this.bfly) {
      b.rt -= dt;
      const bx = b.x * W, by = b.y * H;
      if (b.rt <= 0 || Math.hypot(b.tx - bx, b.ty - by) < 24) {
        let picked = null, seen = 0;
        for (const p of this.plants) {                 // 핀 꽃 하나 랜덤 선택
          if (!p.on || p.state === "grow") continue;
          seen++; if (Math.random() < 1 / seen) picked = p;
        }
        if (picked) { b.tx = picked.x; b.ty = gy - picked.stemH - 14; }
        else { b.tx = rand(W * 0.15, W * 0.85); b.ty = rand(H * 0.25, gy - 40); }
        b.rt = rand(1.4, 3.2);
      }
      const dx = b.tx - bx, dy = b.ty - by, dd = Math.hypot(dx, dy) + 1e-3;
      b.vx = lerp(b.vx, (dx / dd) * 70, dt * 2) + Math.sin(t * 3 + b.hue) * 10 * dt;
      b.vy = lerp(b.vy, (dy / dd) * 70, dt * 2) + Math.cos(t * 2.4 + b.hue) * 8 * dt;
      b.x += (b.vx * dt) / W; b.y += (b.vy * dt) / H;
      b.wing += dt * 16;
      const nx = b.x * W, ny = b.y * H;
      const flap = 0.4 + Math.abs(Math.sin(b.wing)) * 0.9;
      const dir = Math.atan2(b.vy, b.vx);
      g.save();
      g.translate(nx, ny); g.rotate(dir + Math.PI / 2);
      for (const s of [-1, 1]) {
        g.fillStyle = `hsla(${b.hue},75%,80%,0.9)`;
        g.beginPath(); g.ellipse(s * 7 * flap, -3, 7 * flap, 9, s * 0.5, 0, TAU); g.fill();
        g.fillStyle = `hsla(${b.hue},70%,72%,0.85)`;
        g.beginPath(); g.ellipse(s * 6 * flap, 6, 6 * flap, 7, s * 0.4, 0, TAU); g.fill();
      }
      g.strokeStyle = "rgba(60,50,70,0.8)"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 9); g.stroke();
      g.restore();
    }
  }
}
