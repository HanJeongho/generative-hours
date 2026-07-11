// ============================================================================
//  80 · Snow Hands (눈을 받는 손) — 손 위에 눈이 쌓입니다 [VisionPiece · hand]
//  포근한 밤, 눈이 소복소복 내린다(멀고 가까운 3층 플레이크 + 살랑 드리프트).
//  카메라가 손을 보면(최대 4손 — 두 아이의 양손) 차가운 청백빛 손 스켈레톤이
//  뜨고, 그 손의 뼈마디 하나하나에 진짜로 눈이 쌓인다. 눈송이가 손가락 세그먼트
//  근처에 닿으면 사라지며 그 자리에 하얗고 도톰한 눈 능선이 자란다.
//  손을 빠르게 흔들면 쌓인 눈이 후두둑 떨어진다 — 눈털기의 손맛. 손바닥 한가운데로
//  크고 느린 육각 결정을 받으면 반짝 팡! 화면 바닥에도 은은한 눈 언덕이 소복이.
//  카메라가 없으면(거부/로딩) 커서가 작은 처마가 되어 눈을 받는다 — 완전한 폴백.
//  손이 하나도 없어도 눈은 계속 내리고 언덕은 쌓여 화면이 죽지 않는다.
//  numHands = 4 (MediaPipe HandLandmarker; 성능상 실효 한계 2~4손).
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

// 손 스켈레톤 뼈대(74 문법) → 뼈마디 세그먼트 목록(눈이 쌓이는 단위)
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9], [9, 10, 11, 12], [9, 13], [13, 14, 15, 16], [13, 17], [0, 17], [17, 18, 19, 20]];
const SEG = [];
for (const ch of CHAINS) for (let k = 1; k < ch.length; k++) SEG.push([ch[k - 1], ch[k]]);
const NSEG = SEG.length;            // 20 뼈마디
const SNOW_MAX = 34;                // 세그먼트당 최대 적설(px)
const SHAKE = 820;                  // 눈털기 속도 문턱(px/s)
const NF = 72;                      // 바닥 눈 언덕 컬럼 수

const MAXFLK = 1100, MAXCRY = 20, MAXDROP = 520, MAXSPK = 260;

export default class SnowHands extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.snowAmt = 1.0;             // SNOW 슬라이더 — 강설량
    // 눈송이 풀
    this.flakes = [];
    for (let i = 0; i < MAXFLK; i++)
      this.flakes.push({ on: false, x: 0, y: 0, vy: 0, r: 0, ph: 0, dr: 0, amp: 0, a: 0, layer: 0 });
    // 특별 육각 결정 풀
    this.cry = [];
    for (let i = 0; i < MAXCRY; i++)
      this.cry.push({ on: false, x: 0, y: 0, vy: 0, r: 0, rot: 0, spin: 0, dph: 0 });
    // 털어낸 눈 파편 풀
    this.drops = [];
    for (let i = 0; i < MAXDROP; i++)
      this.drops.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 0 });
    // 팡 반짝이 풀
    this.spk = [];
    for (let i = 0; i < MAXSPK; i++)
      this.spk.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    // 손 상태
    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({ on: false, x: 0, y: 0, px: 0, py: 0, glow: 0, flash: 0, r: 46, pts: null, snow: new Float32Array(NSEG), eave: 0 });
    // 바닥 눈 언덕
    this.floor = new Float32Array(NF);
    this._flkAcc = 0;
    this._cryAcc = 0;
    this._wind = 0;
  }

  // 손 전체 다이제스트: 21랜드마크 → 화면 좌표 pts, 팜센터, 감싸는 반경 (74 패턴)
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
        if (!h.on) { h.px = d.cx; h.py = d.cy; h.snow.fill(0); }   // 새로 잡히면 적설 리셋
        h.on = true; h.x = d.cx; h.y = d.cy; h.r = d.r; h.pts = d.pts;
      } else { h.on = false; h.pts = null; }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    // 카메라 없음: 커서가 작은 처마가 되어 눈을 받는다
    const h = this.hands[0];
    if (this.pointer.active) {
      if (!h.on) { h.px = this.pointer.x; h.py = this.pointer.y; h.eave = 0; }
      h.on = true; h.x = this.pointer.x; h.y = this.pointer.y; h.r = 46; h.pts = null;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  // 점-세그먼트 최단거리 (무할당)
  _seg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let tt = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    const cx = ax + tt * dx, cy = ay + tt * dy;
    return Math.hypot(px - cx, py - cy);
  }

  _spawnDrop(x, y, vx, vy) {
    const d = this.drops.find((q) => !q.on);
    if (!d) return;
    d.on = true; d.x = x; d.y = y;
    d.vx = vx + rand(-40, 40); d.vy = vy + rand(-20, 30);
    d.life = rand(0.5, 1.1); d.r = rand(1.4, 3.2);
  }

  _pop(x, y) {
    // 손바닥에 특별 결정을 받았을 때 — 반짝 팡 (큼직하게 부서짐)
    let n = 0;
    for (const s of this.spk) {
      if (s.on || n >= 30) continue;
      n++; s.on = true;
      const a = rand(0, TAU), sp = rand(60, 280);
      s.x = x + rand(-5, 5); s.y = y + rand(-5, 5);
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
      s.life = rand(0.35, 0.85);
    }
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    this._wind = Math.sin(t * 0.13) * 14 + Math.sin(t * 0.37) * 6;

    // ---- 포근한 밤하늘 ----------------------------------------------------------
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0b1230"); sky.addColorStop(0.55, "#141c40"); sky.addColorStop(1, "#26264e");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const warm = g.createRadialGradient(W * 0.5, H * 1.08, 0, W * 0.5, H * 1.08, H * 0.8);
    warm.addColorStop(0, "rgba(255,196,140,0.16)"); warm.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = warm; g.fillRect(0, 0, W, H);

    // ---- 손 사전 갱신: 속도/글로우/눈털기 --------------------------------------
    for (const h of this.hands) {
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      h.flash = Math.max(0, h.flash - dt * 3);
      if (!h.on) { h.px = h.x; h.py = h.y; continue; }
      const hvx = (h.x - h.px) / Math.max(dt, 1e-3), hvy = (h.y - h.py) / Math.max(dt, 1e-3);
      const speed = Math.hypot(hvx, hvy);
      if (speed > SHAKE) this._shakeOff(h, hvx, hvy);
      h.px = h.x; h.py = h.y;
    }

    // ---- 바닥 눈 언덕: 은은한 relax + 그리기 ----------------------------------
    const colW = W / NF, maxH = H * 0.13;
    for (let i = 0; i < NF; i++) {
      const l = i > 0 ? this.floor[i - 1] : this.floor[i];
      const r = i < NF - 1 ? this.floor[i + 1] : this.floor[i];
      this.floor[i] += ((l + r) * 0.5 - this.floor[i]) * dt * 0.6;
    }
    this._drawFloor(g, W, H, colW);

    // ---- 특별 육각 결정: 크고 느리게, 손바닥으로 받으면 팡 (자주, 여럿) --------
    this._cryAcc += dt * 0.85 * this.snowAmt;
    while (this._cryAcc >= 1) {
      this._cryAcc -= 1;
      const c = this.cry.find((q) => !q.on);
      if (c) { c.on = true; c.x = rand(W * 0.12, W * 0.88); c.y = -20; c.vy = rand(28, 46); c.r = rand(13, 21); c.rot = rand(0, TAU); c.spin = rand(-0.5, 0.5); c.dph = rand(0, TAU); }
    }
    for (const c of this.cry) {
      if (!c.on) continue;
      c.y += c.vy * dt;
      c.x += (this._wind * 0.5 + Math.sin(t * 0.6 + c.dph) * 18) * dt;
      c.rot += c.spin * dt;
      // 손바닥 중앙 캐치
      let caught = false;
      for (const h of this.hands) {
        if (!h.on) continue;
        const catchR = h.pts ? h.r * 0.5 : 34;
        if (Math.hypot(c.x - h.x, c.y - h.y) < catchR) { this._pop(c.x, c.y); h.flash = 1; caught = true; break; }
      }
      if (caught) { c.on = false; continue; }
      const ci = clamp((c.x / colW) | 0, 0, NF - 1);
      if (c.y >= H - this.floor[ci]) { this.floor[ci] = Math.min(maxH, this.floor[ci] + 2.2); c.on = false; continue; }
      this._drawCrystal(g, c);
    }

    // ---- 눈송이: 스폰 · 낙하 · 손에 쌓임 · 바닥 퇴적 (기본 강설 3.5배) --------
    this._flkAcc += dt * 700 * this.snowAmt;
    while (this._flkAcc >= 1) { this._flkAcc -= 1; this._spawnFlake(W); }
    g.fillStyle = "#ffffff";
    for (const f of this.flakes) {
      if (!f.on) continue;
      f.y += f.vy * dt;
      f.x += (this._wind * (0.4 + f.layer * 0.25) + Math.sin(t * f.dr + f.ph) * f.amp) * dt;
      if (f.x < -8) f.x = W + 8; else if (f.x > W + 8) f.x = -8;

      // 손에 쌓임 — 가까운 층(layer>=1)만, 팜 반경 안일 때 세그먼트 검사
      let landed = false;
      if (f.layer >= 1) {
        for (const h of this.hands) {
          if (!h.on) continue;
          const dx = f.x - h.x, dy = f.y - h.y, rr = h.r + 44;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (h.pts) {
            for (let i = 0; i < NSEG; i++) {
              const a = h.pts[SEG[i][0]], b = h.pts[SEG[i][1]];
              const cr = 7 + h.snow[i] * 0.45;
              if (this._seg(f.x, f.y, a.x, a.y, b.x, b.y) < cr) { h.snow[i] = Math.min(SNOW_MAX, h.snow[i] + 4.4); landed = true; break; }
            }
          } else {
            const ew = 52, cr = 7 + h.eave * 0.4;
            if (this._seg(f.x, f.y, h.x - ew, h.y, h.x + ew, h.y) < cr) { h.eave = Math.min(34, h.eave + 2.2); landed = true; }
          }
          if (landed) break;
        }
      }
      if (landed) { f.on = false; continue; }

      // 바닥 언덕에 퇴적
      const ci = clamp((f.x / colW) | 0, 0, NF - 1);
      if (f.y >= H - this.floor[ci]) {
        const inc = 0.10 + f.layer * 0.06;
        this.floor[ci] = Math.min(maxH, this.floor[ci] + inc);
        if (ci > 0) this.floor[ci - 1] = Math.min(maxH, this.floor[ci - 1] + inc * 0.3);
        if (ci < NF - 1) this.floor[ci + 1] = Math.min(maxH, this.floor[ci + 1] + inc * 0.3);
        f.on = false; continue;
      }
      g.globalAlpha = f.a;
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // ---- 손: 청백 아우라 + 빛나는 스켈레톤 + 도톰한 눈 능선 -------------------
    for (const h of this.hands) {
      if (h.glow < 0.02) continue;
      // 팡 섬광
      if (h.flash > 0.01) {
        const fg = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r * 1.6);
        fg.addColorStop(0, `rgba(210,240,255,${0.5 * h.flash})`); fg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fg; g.beginPath(); g.arc(h.x, h.y, h.r * 1.6, 0, TAU); g.fill();
      }
      // 차가운 아우라
      const hg = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r * 1.5);
      hg.addColorStop(0, `rgba(150,200,255,${0.15 * h.glow})`); hg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(h.x, h.y, h.r * 1.5, 0, TAU); g.fill();

      if (h.pts) {
        this._drawHand(g, h);
      } else {
        this._drawEave(g, h);
      }
    }

    // ---- 털어낸 눈 파편 ---------------------------------------------------------
    g.fillStyle = "rgba(240,248,255,0.9)";
    for (const d of this.drops) {
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) { d.on = false; continue; }
      d.vy += 520 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      g.globalAlpha = clamp(d.life * 1.6, 0, 1);
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // ---- 팡 반짝이 -------------------------------------------------------------
    for (const s of this.spk) {
      if (!s.on) continue;
      s.life -= dt;
      if (s.life <= 0) { s.on = false; continue; }
      s.vx *= Math.exp(-dt * 3); s.vy *= Math.exp(-dt * 3);
      s.x += s.vx * dt; s.y += s.vy * dt;
      g.globalAlpha = clamp(s.life * 2, 0, 1);
      g.fillStyle = "rgba(225,245,255,0.95)";
      g.beginPath(); g.arc(s.x, s.y, 2.2, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // ---- 캡션 ------------------------------------------------------------------
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(220,232,255,0.62)";
    g.fillText(
      viaCam ? "손을 내밀어 눈을 받아 보세요 — 손마다 눈이 쌓여요 · 흔들면 후두둑 · 손바닥으로 큰 눈송이를 받으면 반짝!"
        : "카메라를 허용하면 손으로 눈을 받아요 — 지금은 커서가 눈 받는 처마예요 · 흔들면 후두둑",
      W / 2, H - 14);

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  _spawnFlake(W) {
    const f = this.flakes.find((q) => !q.on);
    if (!f) return;
    f.on = true; f.x = rand(-10, W + 10); f.y = rand(-30, -4);
    f.ph = rand(0, TAU); f.dr = rand(0.4, 1.1);
    const L = Math.random();
    f.layer = L < 0.45 ? 0 : L < 0.8 ? 1 : 2;
    if (f.layer === 0) { f.r = rand(1.1, 2.0); f.vy = rand(24, 40); f.a = 0.4; f.amp = 8; }
    else if (f.layer === 1) { f.r = rand(2.0, 3.4); f.vy = rand(44, 72); f.a = 0.68; f.amp = 15; }
    else { f.r = rand(3.4, 5.6); f.vy = rand(74, 112); f.a = 0.92; f.amp = 24; }
  }

  _shakeOff(h, hvx, hvy) {
    const nx = hvx / (Math.hypot(hvx, hvy) + 1), ny = hvy / (Math.hypot(hvx, hvy) + 1);
    if (h.pts) {
      for (let i = 0; i < NSEG; i++) {
        if (h.snow[i] < 0.6) continue;
        const a = h.pts[SEG[i][0]], b = h.pts[SEG[i][1]];
        const n = 8 + Math.min(22, h.snow[i] | 0);         // 폭설처럼 후두두둑
        for (let k = 0; k < n; k++) {
          const u = Math.random();
          this._spawnDrop(lerp(a.x, b.x, u), lerp(a.y, b.y, u), nx * rand(120, 300), ny * rand(120, 300) + 40);
        }
        h.snow[i] = 0;
      }
    } else if (h.eave > 0.6) {
      const n = 3 + Math.min(14, (h.eave / 2) | 0);
      for (let k = 0; k < n; k++)
        this._spawnDrop(h.x + rand(-50, 50), h.y, nx * rand(120, 260), ny * rand(120, 260) + 40);
      h.eave = 0;
    }
  }

  _drawHand(g, h) {
    const p = h.pts, gl = h.glow;
    g.lineCap = "round"; g.lineJoin = "round";
    // 귀엽고 통통한 벙어리장갑 손: 두툼한 라운드 스트로크 실루엣 + 밝은 테두리
    for (const [w, col] of [[26, `rgba(120,160,215,${0.55 * gl})`], [20, `rgba(165,200,240,${0.75 * gl})`]]) {
      g.strokeStyle = col; g.lineWidth = w;
      for (const ch of CHAINS) {
        g.beginPath(); g.moveTo(p[ch[0]].x, p[ch[0]].y);
        for (let k = 1; k < ch.length; k++) g.lineTo(p[ch[k]].x, p[ch[k]].y);
        g.stroke();
      }
    }
    // 볼록한 손바닥 + 발그레한 볼터치 느낌
    let pcx = 0, pcy = 0;
    for (const i of [0, 5, 9, 13, 17]) { pcx += p[i].x; pcy += p[i].y; }
    pcx /= 5; pcy /= 5;
    g.fillStyle = `rgba(165,200,240,${0.75 * gl})`;
    g.beginPath(); g.arc(pcx, pcy, 24, 0, TAU); g.fill();
    g.fillStyle = `rgba(255,170,180,${0.25 * gl})`;
    g.beginPath(); g.arc(pcx, pcy + 6, 10, 0, TAU); g.fill();
    // 도톰한 눈 능선 — 뼈마디마다 적설량만큼 굵게 (이게 곧 손의 형상)
    for (let i = 0; i < NSEG; i++) {
      const s = h.snow[i];
      if (s < 0.4) continue;
      const a = p[SEG[i][0]], b = p[SEG[i][1]];
      g.strokeStyle = `rgba(210,230,255,${0.7 * gl})`; g.lineWidth = s * 2.6 + 5;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.95 * gl})`; g.lineWidth = s * 2.4;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }

  _drawEave(g, h) {
    const gl = h.glow, ew = 52, y = h.y;
    // 처마 널판
    g.lineCap = "round";
    g.strokeStyle = `rgba(160,200,255,${0.6 * gl})`; g.lineWidth = 5;
    g.beginPath(); g.moveTo(h.x - ew, y); g.lineTo(h.x + ew, y); g.stroke();
    // 쌓인 눈 두둑
    if (h.eave > 0.3) {
      g.fillStyle = `rgba(255,255,255,${0.92 * gl})`;
      g.beginPath(); g.moveTo(h.x - ew, y);
      g.quadraticCurveTo(h.x, y - h.eave - 6, h.x + ew, y);
      g.closePath(); g.fill();
    }
  }

  _drawCrystal(g, c) {
    g.save();
    g.translate(c.x, c.y); g.rotate(c.rot);
    g.strokeStyle = "rgba(230,244,255,0.9)"; g.lineWidth = 1.5; g.lineCap = "round";
    for (let k = 0; k < 6; k++) {
      g.rotate(TAU / 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -c.r); g.stroke();
      const b = c.r * 0.4;
      g.beginPath(); g.moveTo(0, -c.r * 0.55); g.lineTo(-b * 0.55, -c.r * 0.55 - b * 0.4);
      g.moveTo(0, -c.r * 0.55); g.lineTo(b * 0.55, -c.r * 0.55 - b * 0.4); g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();
    g.restore();
  }

  _drawFloor(g, W, H, colW) {
    g.beginPath(); g.moveTo(0, H + 2);
    for (let i = 0; i < NF; i++) g.lineTo(i * colW + colW * 0.5, H - this.floor[i]);
    g.lineTo(W, H + 2); g.closePath();
    const fg = g.createLinearGradient(0, H * 0.82, 0, H);
    fg.addColorStop(0, "rgba(224,236,255,0.9)"); fg.addColorStop(1, "rgba(200,216,245,0.95)");
    g.fillStyle = fg; g.fill();
    // 능선 하이라이트
    g.strokeStyle = "rgba(255,255,255,0.65)"; g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < NF; i++) { const x = i * colW + colW * 0.5, y = H - this.floor[i]; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }

  controls(host) {
    host.appendChild(slider("SNOW", 0.5, 5, this.snowAmt, 0.05, (v) => (this.snowAmt = v)));
  }
}
