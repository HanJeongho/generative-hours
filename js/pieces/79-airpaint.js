// ============================================================================
//  79 · Air Paint (허공 물감) — 손끝에서 흘러나오는 빛 물감 [VisionPiece · hand]
//  어두운 캔버스 방. 카메라가 손을 보면(최대 4손 — 두 아이의 양손) 손 전체가
//  빛-스켈레톤으로 또렷이 떠오르고(74 문법), 검지 끝에서 빛나는 물감 리본이
//  흘러나온다. 손마다 고정 팔레트 4색, 시간에 따라 은은히 순환.
//  리본은 최근 궤적 포인트(링버퍼)를 두께 가변(빠르면 가늘게)·가산 글로우로
//  그린다. 그린 획은 FADE초에 걸쳐 천천히 사라지고, 사라질 때 반짝이 입자로
//  승화한다(영원한 낙서 방지 + 화면 자정). 손바닥을 쫙 펴고 문지르면 그
//  반경의 획이 빨리 지워진다 — 지우개 손.
//  ★대칭 그리기: 기본 '거울' — 한 획이 좌우 두 획으로(만화경 모드는 4방).
//   한 번 슥 그으면 나비 날개처럼 좌우가 함께 피어난다.
//  ★꼬집기 도장: 엄지+검지를 꼬집으면 그 자리에 별→하트→꽃 도장이 팡!
//   (대칭 모드면 도장도 양쪽에 찍힌다) + 그리는 동안 붓끝에서 반짝이가 흩날림.
//  카메라가 없으면 커서가 붓이 된다(드래그=그리기). 아무도 없으면 희미한
//  물감 안개가 떠다녀 화면이 죽지 않는다. numHands = 4.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";

const MAXP = 2600;                 // 물감 포인트 풀(링버퍼, 대칭 복제 포함)
const MAXS = 600;                  // 반짝이 입자 풀
const MIST = 22;                   // 앰비언트 안개
const HUES = [344, 42, 190, 268];  // 손 인덱스별 고정 색상(장미·금·청록·보라)
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9], [9, 10, 11, 12], [9, 13], [13, 14, 15, 16], [13, 17], [0, 17], [17, 18, 19, 20]];

export default class AirPaint extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 4; }

  visionSetup() {
    this.fade = 9;                 // FADE 슬라이더 — 획 잔류 시간(초)
    this.sym = 2;                  // 대칭: 1=자유, 2=거울(기본), 4=만화경
    this.pts = [];
    for (let i = 0; i < MAXP; i++)
      this.pts.push({ on: false, x: 0, y: 0, px: 0, py: 0, hue: 0, w: 0, life: 0, max: 1, cont: false });
    this._pi = 0;
    this.sp = [];
    for (let i = 0; i < MAXS; i++)
      this.sp.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0 });
    this._si = 0;
    this.mist = [];
    for (let i = 0; i < MIST; i++)
      this.mist.push({ x: Math.random(), y: Math.random(), vx: rand(-1, 1), vy: rand(-1, 1), r: rand(90, 220), hue: HUES[i % 4] + rand(-24, 24), ph: rand(0, TAU) });
    this.hands = [];
    for (let i = 0; i < 4; i++)
      this.hands.push({ on: false, draw: false, erase: false, cx: 0, cy: 0, r: 46, pts: null, tipx: 0, tipy: 0, ltx: 0, lty: 0, glow: 0, hueBase: HUES[i], hue: HUES[i], pinch: false, pinchPrev: false, stampIdx: i });
    this._empty = 1;
  }

  // 손 전체 다이제스트: 21랜드마크→화면점, 팜센터, 손 반경, 검지끝, 펼침비율
  _digest(lms) {
    const pts = lms.map((l) => this.toCanvas(l));
    let cx = 0, cy = 0;
    for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 5; cy /= 5;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    const ref = Math.max(20, Math.hypot(pts[9].x - pts[0].x, pts[9].y - pts[0].y));
    let ft = 0;
    for (const i of [4, 8, 12, 16, 20]) ft += Math.hypot(pts[i].x - cx, pts[i].y - cy);
    ft /= 5;
    const pinch = Math.hypot(pts[4].x - pts[8].x, pts[4].y - pts[8].y) / ref;
    return { pts, cx, cy, r: Math.max(30, r), tipx: pts[8].x, tipy: pts[8].y, spread: ft / ref, pinch };
  }

  _emit1(px, py, x, y, hue, w) {
    const p = this.pts[this._pi];
    this._pi = (this._pi + 1) % MAXP;
    p.on = true; p.px = px; p.py = py; p.x = x; p.y = y;
    p.hue = hue; p.w = w; p.life = this.fade; p.max = this.fade; p.cont = true;
  }

  // 대칭 방출: 거울(좌우) / 만화경(상하좌우) — 복제마다 색상 살짝 회전
  _emit(px, py, x, y, hue, w) {
    const W = this.w, H = this.h;
    this._emit1(px, py, x, y, hue, w);
    if (this.sym >= 2) this._emit1(W - px, py, W - x, y, (hue + 26) % 360, w);
    if (this.sym >= 4) {
      this._emit1(px, H - py, x, H - y, (hue + 52) % 360, w);
      this._emit1(W - px, H - py, W - x, H - y, (hue + 78) % 360, w);
    }
  }

  _emitStroke(h, dt) {
    const dx = h.tipx - h.ltx, dy = h.tipy - h.lty;
    const dist = Math.hypot(dx, dy);
    const speed = dist / Math.max(dt, 1e-3);
    const w = lerp(15, 4.5, clamp(speed / 1000, 0, 1));   // 빠를수록 가늘게
    if (dist < 1.0) { this._emit(h.ltx, h.lty, h.tipx + 0.01, h.tipy, h.hue, w * 0.7); return; }
    const n = Math.min(20, Math.max(1, (dist / 6) | 0));
    let lx = h.ltx, ly = h.lty;
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      const x = lerp(h.ltx, h.tipx, f), y = lerp(h.lty, h.tipy, f);
      this._emit(lx, ly, x, y, h.hue, w);
      lx = x; ly = y;
    }
    if (Math.random() < 0.35) this._sparkle(h.tipx, h.tipy, h.hue);   // 붓끝 반짝이
  }

  // 꼬집기 도장: 별 → 하트 → 꽃 순환 — 물감 획으로 팡 찍힘(대칭 모드면 양쪽에)
  _stamp(h) {
    const kind = h.stampIdx++ % 3;
    const s = clamp(h.r * 0.55, 34, 76);
    const cx = h.tipx, cy = h.tipy;
    const poly = this._stampPoly(kind, s);
    let lx = cx + poly[0][0], ly = cy + poly[0][1];
    for (let k = 1; k < poly.length; k++) {
      const x = cx + poly[k][0], y = cy + poly[k][1];
      this._emit(lx, ly, x, y, h.hue, 7);
      lx = x; ly = y;
    }
    for (let k = 0; k < 8; k++) this._sparkle(cx + rand(-s, s) * 0.5, cy + rand(-s, s) * 0.5, h.hue);
  }
  _stampPoly(kind, s) {
    const out = [];
    if (kind === 0) {                        // 별
      for (let k = 0; k <= 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? s * 0.42 : s;
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    } else if (kind === 1) {                 // 하트
      for (let k = 0; k <= 24; k++) {
        const u = (k / 24) * TAU;
        out.push([
          s * 0.062 * 16 * Math.sin(u) ** 3,
          -s * 0.062 * (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)),
        ]);
      }
    } else {                                 // 꽃(6잎 장미곡선)
      for (let k = 0; k <= 48; k++) {
        const u = (k / 48) * TAU;
        const r = s * Math.abs(Math.cos(3 * u));
        out.push([Math.cos(u) * r, Math.sin(u) * r]);
      }
    }
    return out;
  }

  _sparkle(x, y, hue) {
    for (let n = 0; n < 2; n++) {
      const s = this.sp[this._si];
      this._si = (this._si + 1) % MAXS;
      s.on = true; s.x = x; s.y = y;
      const a = rand(0, TAU), sp = rand(10, 60);
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - 22;
      s.life = rand(0.5, 1.3); s.max = s.life; s.hue = hue;
    }
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks) || [];
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      if (lms[i] && lms[i].length >= 21) {
        const d = this._digest(lms[i]);
        if (!h.on) { h.ltx = d.tipx; h.lty = d.tipy; }
        h.on = true; h.cx = d.cx; h.cy = d.cy; h.r = d.r; h.pts = d.pts;
        h.tipx = d.tipx; h.tipy = d.tipy;
        h.erase = d.spread > 1.55;
        h.draw = !h.erase;
        h.pinch = d.pinch < 0.45 && !h.erase;
        if (h.pinch && !h.pinchPrev) this._stamp(h);     // 꼬집는 순간 도장 팡
        h.pinchPrev = h.pinch;
      } else { h.on = false; h.pts = null; h.draw = false; h.erase = false; h.pinch = h.pinchPrev = false; }
    }
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    const h = this.hands[0];
    if (this.pointer.active) {
      if (!h.on) { h.ltx = this.pointer.x; h.lty = this.pointer.y; }
      h.on = true; h.cx = this.pointer.x; h.cy = this.pointer.y; h.r = 42; h.pts = null;
      h.tipx = this.pointer.x; h.tipy = this.pointer.y; h.erase = false;
      h.draw = this.pointer.down;
    } else h.on = false;
    for (let i = 1; i < 4; i++) this.hands[i].on = false;
    this._scene(dt, t, false);
  }

  _scene(dt, t, viaCam) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // ---- 어두운 캔버스 방 --------------------------------------------------------
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0a0a15"); sky.addColorStop(1, "#100c1c");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // ---- 앰비언트 물감 안개(아무도 없을수록 진하게) -----------------------------
    let anyHand = false;
    for (const h of this.hands) if (h.on) { anyHand = true; break; }
    this._empty = clamp(this._empty + (anyHand ? -dt * 1.5 : dt * 0.5), 0, 1);
    g.globalCompositeOperation = "lighter";
    for (const m of this.mist) {
      m.x += m.vx * dt * 0.01; m.y += m.vy * dt * 0.01;
      if (m.x < -0.1) m.x = 1.1; else if (m.x > 1.1) m.x = -0.1;
      if (m.y < -0.1) m.y = 1.1; else if (m.y > 1.1) m.y = -0.1;
      const al = 0.06 * this._empty * (0.6 + 0.4 * Math.sin(t * 0.5 + m.ph));
      if (al < 0.004) continue;
      const mx = m.x * W, my = m.y * H;
      const gr = g.createRadialGradient(mx, my, 0, mx, my, m.r);
      gr.addColorStop(0, `hsla(${m.hue | 0},80%,60%,${al})`);
      gr.addColorStop(1, "hsla(0,0%,0%,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(mx, my, m.r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // ---- 손: 물감 방출 ----------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const h = this.hands[i];
      h.glow = clamp(h.glow + (h.on ? dt * 5 : -dt * 4), 0, 1);
      h.hue = (h.hueBase + t * 12) % 360;
      if (h.on && h.draw) this._emitStroke(h, dt);
      h.ltx = h.tipx; h.lty = h.tipy;
    }

    // ---- 물감 포인트: 노화 + 지우개 + 승화 --------------------------------------
    let hasErase = false;
    for (const h of this.hands) if (h.on && h.erase) { hasErase = true; break; }
    for (const p of this.pts) {
      if (!p.on) continue;
      p.life -= dt;
      if (hasErase) {
        for (const h of this.hands) {
          if (!h.on || !h.erase) continue;
          if (Math.hypot(p.x - h.cx, p.y - h.cy) < h.r * 1.15) p.life -= dt * 6;
        }
      }
      if (p.life <= 0) { this._sparkle(p.x, p.y, p.hue); p.on = false; }
    }

    // ---- 리본 렌더(가산 글로우 2패스) ------------------------------------------
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round"; g.lineJoin = "round";
    for (const p of this.pts) {                     // 넓은 헤일로
      if (!p.on || !p.cont) continue;
      const a = p.life / p.max;
      g.strokeStyle = `hsla(${p.hue | 0},90%,62%,${0.10 * a * a})`;
      g.lineWidth = p.w * 2.4;
      g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
    }
    for (const p of this.pts) {                     // 밝은 코어
      if (!p.on || !p.cont) continue;
      const a = p.life / p.max;
      g.strokeStyle = `hsla(${p.hue | 0},95%,72%,${0.55 * a})`;
      g.lineWidth = Math.max(1, p.w * a * 0.9 + 1);
      g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
    }

    // ---- 반짝이 입자(승화) ------------------------------------------------------
    for (const s of this.sp) {
      if (!s.on) continue;
      s.life -= dt;
      if (s.life <= 0) { s.on = false; continue; }
      s.vx *= Math.exp(-dt * 1.5); s.vy *= Math.exp(-dt * 1.5);
      s.x += s.vx * dt; s.y += s.vy * dt;
      const a = clamp(s.life / s.max, 0, 1);
      const tw = 0.6 + 0.4 * Math.sin(t * 20 + s.x * 0.1);
      g.fillStyle = `hsla(${s.hue | 0},95%,82%,${a * tw})`;
      g.beginPath(); g.arc(s.x, s.y, 1.4 + 2.2 * a, 0, TAU); g.fill();
    }

    // ---- 손 표시 없음 — 붓 촉과 리본이 곧 손의 위치다 ---------------------------
    for (const h of this.hands) {
      if (h.glow < 0.02) continue;
      const hue = h.hue | 0;
      // 붓 촉(그리기) / 지우개 링(펼침)
      if (h.erase) {
        g.strokeStyle = `hsla(0,0%,96%,${0.55 * h.glow})`; g.lineWidth = 2;
        g.beginPath(); g.arc(h.cx, h.cy, h.r * 1.15, 0, TAU); g.stroke();
      } else {
        const nib = g.createRadialGradient(h.tipx, h.tipy, 0, h.tipx, h.tipy, 15);
        nib.addColorStop(0, `hsla(${hue},95%,86%,${0.9 * h.glow})`);
        nib.addColorStop(1, "hsla(0,0%,0%,0)");
        g.fillStyle = nib; g.beginPath(); g.arc(h.tipx, h.tipy, 15, 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = "source-over";

    // ---- 캡션 -------------------------------------------------------------------
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(222,216,242,0.6)";
    g.fillText(
      viaCam ? "검지로 그리면 거울처럼 양쪽에 피어나요 · 엄지+검지를 꼬집으면 별·하트·꽃 도장 팡! · 쫙 펴서 문지르면 지우개"
        : "카메라를 허용하면 손으로 그려요 — 지금은 드래그가 붓 (거울 대칭!) · 그림은 천천히 반짝이며 사라져요",
      W / 2, H - 14);

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(buttonRow([
      { label: "자유", on: () => (this.sym = 1) },
      { label: "거울", on: () => (this.sym = 2) },
      { label: "만화경", on: () => (this.sym = 4) },
    ]));
    host.appendChild(slider("FADE", 4, 14, this.fade, 0.5, (v) => (this.fade = v)));
  }
}
