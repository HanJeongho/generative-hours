// ============================================================================
//  76 · Palm Fireworks (손바닥 불꽃놀이) — 손바닥에서 불티가 솟는다 [VisionPiece · hand]
//  밤하늘. 손을 활짝 펴서 들면 손바닥 한가운데서 황금 불티가 보글보글 솟아
//  분수처럼 흩날린다(주먹을 쥐면 멈춘다 — 대충 쥐어도 관대하게 판정).
//  손을 위로 휙! 빠르게 올리면 손에서 로켓이 발사돼 꼬리를 끌고 올라가
//  정점에서 폭죽으로 터진다. 폭죽은 세 종류 — 모란(방사 구형)·버드나무
//  (아래로 늘어지는 꼬리)·반짝이(지연 점멸). 색은 파스텔과 채도 높은 색이 랜덤.
//  지면엔 은은한 반사 글로우. 손이 최대 넷이라 여러 아이가 동시에 불꽃쇼.
//  손이 하나도 없어도 이따금 불꽃 한 발이 저절로 올라가 하늘이 비지 않는다.
//  카메라가 없으면 커서가 손이 된다 — 클릭=로켓, 꾹 누르면=분수. 완전한 폴백.
//  numHands = 4 (MediaPipe HandLandmarker; 실효 한계 2~4손, 두 아이 양손).
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

const MAXSPARK = 560;   // 손바닥 분수 + 로켓 꼬리
const MAXBURST = 1200;  // 폭죽 파편
const MAXROCK = 32;     // 날아오르는 로켓
const NSTAR = 74;

export default class PalmFireworks extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.burstSize = 1.0;   // BURST 슬라이더 — 폭죽 크기

    this.sparks = [];
    for (let i = 0; i < MAXSPARK; i++)
      this.sparks.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 46, grav: 300 });
    this.bursts = [];
    for (let i = 0; i < MAXBURST; i++)
      this.bursts.push({ on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, max: 1, type: 0, hue: 0, sat: 90, light: 70, grav: 90, tw: 8, ph: 0 });
    this.rockets = [];
    for (let i = 0; i < MAXROCK; i++)
      this.rockets.push({ on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, targetY: 0, type: 0, hue: 0, tacc: 0 });

    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({ on: false, x: 0, y: 0, px: 0, py: 0, r: 46, spread: 0, glow: 0, pts: null, facc: 0, cool: 0 });

    this.stars = [];
    for (let i = 0; i < NSTAR; i++)
      this.stars.push({ x: Math.random(), y: Math.random() * 0.62, r: rand(0.5, 1.7), ph: rand(0, TAU), sp: rand(0.6, 2.2) });

    this.ground = { glow: 0, hue: 40 };
    this._ambT = 2.4;
  }

  // ---- pools: 닫힌 슬롯 찾기(무할당 스캔) --------------------------------------
  _freeSpark() { const a = this.sparks; for (let i = 0; i < a.length; i++) if (!a[i].on) return a[i]; return null; }
  _freeBurst() { const a = this.bursts; for (let i = 0; i < a.length; i++) if (!a[i].on) return a[i]; return null; }
  _freeRocket() { const a = this.rockets; for (let i = 0; i < a.length; i++) if (!a[i].on) return a[i]; return null; }

  _emitFountain(x, y, hvx) {
    const s = this._freeSpark();
    if (!s) return;
    s.on = true;
    s.x = x + rand(-8, 8); s.y = y + rand(-6, 6);
    s.vx = hvx * 0.15 + rand(-70, 70);
    s.vy = rand(-320, -140);                 // 위로 솟았다 중력에 다시 내려앉음
    s.life = s.max = rand(0.5, 1.1);
    s.hue = 38 + rand(-6, 16);               // 황금빛
    s.grav = 560;
  }

  _emitTrail(x, y, hue) {
    const s = this._freeSpark();
    if (!s) return;
    s.on = true;
    s.x = x + rand(-2, 2); s.y = y + rand(-2, 2);
    s.vx = rand(-24, 24); s.vy = rand(-10, 40);
    s.life = s.max = rand(0.24, 0.5);
    s.hue = hue; s.grav = 120;
  }

  _launch(x, y, vx, vy, targetY, hue, type) {
    const r = this._freeRocket();
    if (!r) return;
    r.on = true;
    r.x = x; r.y = y; r.px = x; r.py = y;
    r.vx = vx; r.vy = vy;
    r.targetY = Math.max(this.h * 0.12, targetY);
    r.hue = hue; r.type = type; r.tacc = 0;
  }

  // 폭죽 8종 — 실제 불꽃축제(모란·국화·버드나무·야자·토성고리·크로세트·
  // 반짝이·브로케이드 왕관)를 참고. 크기·모양·색·2차 폭발까지 다양하게.
  _burst(x, y, hue, type, sizeMul = 1) {
    const scale = this.burstSize * sizeMul;
    const T = type % 8;
    const NS = [90, 64, 110, 22, 72, 26, 70, 84];      // 종류별 파편 수
    let n = Math.max(10, (NS[T] * scale) | 0);
    const SPD = [230, 155, 250, 260, 210, 240, 150, 200];
    const spd = SPD[T] * (0.65 + 0.55 * scale);
    const bicolor = Math.random() < 0.3;               // 2색 폭죽
    const hue2 = (hue + 140) % 360;
    for (let k = 0; k < n; k++) {
      const p = this._freeBurst();
      if (!p) break;
      let a = Math.random() * TAU, s = spd;
      p.on = true; p.x = x; p.y = y; p.px = x; p.py = y;
      p.type = 0; p.tw = 0; p.ph = rand(0, TAU); p.crosette = false;
      p.hue = ((bicolor && k % 2 ? hue2 : hue) + rand(-14, 14) + 360) % 360;
      p.sat = rand(72, 100); p.light = rand(60, 84);
      if (T === 0) {            // 모란: 촘촘한 정구형
        s *= 0.9 + Math.random() * 0.15; p.grav = 90; p.max = rand(1.0, 1.6);
      } else if (T === 1) {     // 버드나무: 길게 늘어지는 금빛 낙하
        s *= 0.5 + Math.random() * 0.6; p.vyExtra = -40; p.grav = 230; p.max = rand(1.8, 2.6);
        p.hue = (42 + rand(-10, 10) + 360) % 360; p.sat = rand(80, 100);
      } else if (T === 2) {     // 국화: 구형 + 바깥 껍질이 더 밝음
        s *= (k < n * 0.7 ? 0.95 + Math.random() * 0.1 : 0.45 + Math.random() * 0.3);
        p.grav = 85; p.max = rand(1.1, 1.7); if (k < n * 0.7) p.light = rand(75, 90);
      } else if (T === 3) {     // 야자: 굵은 가지 소수가 뻗어나감
        a = (k / n) * TAU + rand(-0.06, 0.06);
        s *= 0.95; p.grav = 150; p.max = rand(1.6, 2.2); p.type = 1;
      } else if (T === 4) {     // 토성 고리: 링 + 심
        if (k < n * 0.75) { s *= 0.98 + Math.random() * 0.04; }        // 얇은 링
        else { s *= Math.random() * 0.25; }                             // 심
        p.grav = 70; p.max = rand(1.2, 1.8);
      } else if (T === 5) {     // 크로세트: 사방 소수 가지, 끝에서 2차 폭발
        a = (k / n) * TAU; s *= 0.9; p.grav = 110; p.max = rand(0.8, 1.1);
        p.crosette = true;
      } else if (T === 6) {     // 반짝이(스트로브): 느리게 퍼지며 점멸
        s *= 0.4 + Math.random() * 0.6; p.grav = 42; p.max = rand(1.6, 2.4); p.tw = rand(8, 16);
      } else {                  // 브로케이드 왕관: 넓게 퍼진 뒤 오래 늘어짐
        s *= 0.8 + Math.random() * 0.3; p.grav = 170; p.max = rand(2.0, 3.0);
        p.light = rand(70, 88); p.tw = rand(0, 4);
      }
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s + (p.vyExtra || 0);
      p.vyExtra = 0;
      p.life = p.max;
    }
    this.ground.glow = Math.max(this.ground.glow, 0.9);
    this.ground.hue = hue;
  }

  // 손 전체 다이제스트: 21랜드마크→화면점, 팜센터, 반경, 펼침도(spread)
  _digest(lms) {
    const pts = lms.map((l) => this.toCanvas(l));
    let cx = 0, cy = 0;
    for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 5; cy /= 5;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    // 펼침도: 손끝 평균거리 / 손가락뿌리 평균거리 (주먹≈1, 활짝≈2)
    let palmR = 0, tipR = 0;
    for (const i of [5, 9, 13, 17]) palmR += Math.hypot(pts[i].x - cx, pts[i].y - cy);
    for (const i of [8, 12, 16, 20]) tipR += Math.hypot(pts[i].x - cx, pts[i].y - cy);
    palmR = Math.max(1, palmR / 4); tipR /= 4;
    const spread = clamp((tipR / palmR - 1.0) / 1.05, 0, 1);
    return { pts, cx, cy, r: Math.max(30, r), spread };
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i].length >= 21) {
        const d = this._digest(lms[i]);
        if (!h.on) { h.px = d.cx; h.py = d.cy; h.cool = 0.25; }
        h.on = true; h.x = d.cx; h.y = d.cy; h.r = d.r; h.pts = d.pts; h.spread = d.spread;
      } else { h.on = false; h.pts = null; }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    // 카메라 없음: 커서가 손. 꾹 누르면 분수, 클릭은 onPointerDown이 로켓 발사.
    const h = this.hands[0];
    if (this.pointer.active && this.pointer.down) {
      if (!h.on) { h.px = this.pointer.x; h.py = this.pointer.y; }
      h.on = true; h.x = this.pointer.x; h.y = this.pointer.y; h.r = 46; h.pts = null; h.spread = 1;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  onPointerDown() {
    // 커서 폴백: 클릭 = 로켓 한 발 (바닥에서 커서 높이로 솟아 터짐)
    if (this.status === "ready") return;   // 카메라 모드에선 손 제스처가 담당
    const x = this.pointer.x, y = this.pointer.y;
    this._launch(x, this.h + 8, rand(-20, 20), -600, y, rand(0, 360), (Math.random() * 8) | 0);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // ---- 밤하늘 + 어두운 지평선 -------------------------------------------------
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#070b1e"); sky.addColorStop(0.55, "#0d1330"); sky.addColorStop(0.82, "#141a3a");
    sky.addColorStop(1, "#1c1330");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // 별 (조금)
    g.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * s.sp + s.ph));
      g.fillStyle = `rgba(220,230,255,${0.7 * tw})`;
      const r = s.r * (0.8 + 0.4 * tw);
      g.beginPath(); g.arc(s.x * W, s.y * H, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // 지평선 언덕
    const hy = H * 0.9;
    const hill = g.createLinearGradient(0, hy - 30, 0, H);
    hill.addColorStop(0, "rgba(10,10,22,0)"); hill.addColorStop(0.4, "rgba(8,8,18,0.85)"); hill.addColorStop(1, "#05050c");
    g.fillStyle = hill; g.fillRect(0, hy - 30, W, H - hy + 30);

    // ---- 손: 분수 분출 + 로켓 발사 판정 ----------------------------------------
    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      if (h.cool > 0) h.cool -= dt;
      if (!h.on) continue;
      const hvx = (h.x - h.px) / Math.max(dt, 1e-3);
      const hvy = (h.y - h.py) / Math.max(dt, 1e-3);

      // 활짝 편 손바닥 = 분수 (주먹이면 spread≈0 → 저절로 멈춤, 관대)
      if (h.spread > 0.32) {
        h.facc += dt * (30 + 95 * h.spread);
        while (h.facc >= 1) { h.facc -= 1; this._emitFountain(h.x, h.y, hvx); }
      } else h.facc = 0;

      // 위로 휙! 빠르게 올리면 로켓 발사 (팜센터 상승속도 임계)
      if (hvy < -760 && h.cool <= 0 && h.spread > 0.28) {
        h.cool = 0.5;
        const vy = clamp(hvy * 0.62, -940, -470);
        this._launch(h.x, h.y, hvx * 0.28, vy, h.y - rand(H * 0.42, H * 0.6), rand(0, 360), (Math.random() * 8) | 0);
      }
      h.px = h.x; h.py = h.y;
    }

    // ---- 앰비언트: 손이 없으면 이따금 자동 불꽃 1발 ----------------------------
    let anyHand = false;
    for (const h of this.hands) if (h.on) { anyHand = true; break; }
    this._ambT -= dt;
    if (anyHand) this._ambT = Math.max(this._ambT, 2.4);
    else if (this._ambT <= 0) {
      this._ambT = rand(1.8, 3.4);
      this._launch(rand(W * 0.2, W * 0.8), H + 8, rand(-25, 25), -rand(540, 660),
        rand(H * 0.16, H * 0.42), rand(0, 360), (Math.random() * 8) | 0);
    }

    // ---- 로켓: 상승 → 정점에서 폭발 --------------------------------------------
    g.globalCompositeOperation = "lighter";
    for (const r of this.rockets) {
      if (!r.on) continue;
      r.px = r.x; r.py = r.y;
      r.vy += 280 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt;
      r.tacc += dt;
      while (r.tacc >= 0.018) { r.tacc -= 0.018; this._emitTrail(r.x, r.y, 40 + rand(-8, 10)); }
      if (r.y <= r.targetY || r.vy > -60) { this._burst(r.x, r.y, r.hue, r.type, rand(0.75, 1.55)); r.on = false; continue; }
      // 발광 머리 + 짧은 꼬리
      g.strokeStyle = `hsla(${r.hue},90%,72%,0.5)`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(r.px, r.py); g.lineTo(r.x, r.y); g.stroke();
      g.fillStyle = "rgba(255,244,210,0.95)";
      g.beginPath(); g.arc(r.x, r.y, 2.6, 0, TAU); g.fill();
    }

    // ---- 분수 불티 + 로켓 꼬리 --------------------------------------------------
    for (const s of this.sparks) {
      if (!s.on) continue;
      s.life -= dt;
      if (s.life <= 0) { s.on = false; continue; }
      s.vy += s.grav * dt;
      s.vx *= Math.exp(-dt * 1.1);
      s.x += s.vx * dt; s.y += s.vy * dt;
      const a = clamp(s.life / s.max, 0, 1);
      g.fillStyle = `hsla(${s.hue},95%,${62 + 18 * a}%,${a})`;
      g.beginPath(); g.arc(s.x, s.y, 1.2 + 1.6 * a, 0, TAU); g.fill();
    }

    // ---- 폭죽 파편 --------------------------------------------------------------
    for (const p of this.bursts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; if (p.crosette) { p.crosette = false; this._burst(p.x, p.y, p.hue, 0, 0.28); } continue; }
      p.px = p.x; p.py = p.y;
      const drag = p.type === 1 ? 0.9 : 1.35;
      p.vx *= Math.exp(-dt * drag);
      p.vy = p.vy * Math.exp(-dt * drag) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const lf = clamp(p.life / p.max, 0, 1);
      let a = lf;
      if (p.tw > 0) a *= 0.28 + 0.72 * Math.abs(Math.sin(t * p.tw + p.ph)); // 반짝이 점멸
      if (p.type === 1) {
        // 버드나무: 늘어지는 꼬리
        g.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
        g.lineWidth = 1.6; g.lineCap = "round";
        g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
      } else {
        g.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
        g.beginPath(); g.arc(p.x, p.y, 1.4 + 1.3 * lf, 0, TAU); g.fill();
      }
    }

    // ---- 지면 반사 글로우 (은은하게) -------------------------------------------
    if (this.ground.glow > 0.01) {
      const rg = g.createLinearGradient(0, H, 0, H * 0.66);
      rg.addColorStop(0, `hsla(${this.ground.hue},85%,62%,${0.22 * this.ground.glow})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(0, H * 0.66, W, H * 0.34);
    }
    this.ground.glow *= Math.exp(-dt * 1.7);

    // (손 표시 없음 — 손바닥의 불티 분수가 곧 손의 위치다)

    g.globalCompositeOperation = "source-over";

    // ---- 캡션 -------------------------------------------------------------------
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(230,224,244,0.62)";
    g.fillText(
      viaCam ? "손바닥을 펴서 들면 불티가 솟아요 — 위로 휙! 올리면 불꽃이 팡 (최대 4손)"
        : "카메라를 허용하면 손으로 놀 수 있어요 — 지금은 클릭=불꽃, 꾹 누르면=분수",
      W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("BURST", 0.6, 1.8, this.burstSize, 0.05, (v) => (this.burstSize = v)));
  }
}
