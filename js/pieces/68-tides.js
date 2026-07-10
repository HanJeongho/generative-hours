// ============================================================================
//  68 · Tides (조수) — 밀물은 오지 않는다, 당신이 돈다 [Canvas2D]
//  달이 끄는 바다의 숨 — 실제 달 위상(합삭 기점 29.53일 주기)과 반일주조
//  (12시간 25분)로 해변의 수위가 오르내린다. 젖은 모래띠가 지나간 밀물의
//  흔적을 남기고, 하늘엔 오늘 밤의 달이 정확한 위상으로 떠 있다.
//
//  ★ 반전(꾹 누르기): 카메라가 우주로 물러난다. 지구를 감싼 바다가 달을
//  향해 부풀어 있는데 — 반대편 바다도 똑같이 부풀어 있다. 지구가 물보다
//  빠르게 달에게 끌려가며 반대쪽 바다를 '두고 가기' 때문. 그리고 지구가
//  도는 동안 당신의 해변(점)이 두 혹을 차례로 통과한다 — 하루 두 번의
//  밀물은 물이 오는 것이 아니라, 당신이 부푼 바다 속으로 회전해 들어가는
//  것이다. 우주 시점에서 시간이 수천 배 가속되어 그 회전이 눈에 보인다.
//
//  드래그(우주 시점) = 달을 끌어 조석을 실험 · MOON DIST = 달 거리(달은
//  매년 3.8cm씩 멀어진다 — 조수는 천천히 식어가는 시계다) · 클릭 = 파문
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

const SYNODIC = 29.530588 * 86400e3;                 // ms
const NEWMOON = Date.UTC(2000, 0, 6, 18, 14);        // a known new moon
const SEMIDIURNAL = (12 * 60 + 25) * 60e3;           // ms — tidal half-day

export default class Tides extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.moonDist = 1.0;    // MOON DIST slider (1 = today)
    this.zoom = 0;          // 0 = beach, 1 = space
    this.warpT = 0;         // accelerated time while in space view (ms)
    this._mode = null; this._downT = 0;
    this.moonDrag = 0;      // dragged moon angle offset (space view)
    this.moonDragV = 0;
    this.ripples = [];
    this.foam = [];
    for (let i = 0; i < 40; i++) this.foam.push({ x: rand(0, 1), ph: rand(0, TAU), s: rand(0.5, 1) });
  }

  _phase(tms) { return ((tms - NEWMOON) % SYNODIC) / SYNODIC; }          // 0=new 0.5=full
  _tide(tms) {
    // semidiurnal height (-1..1) with spring/neap envelope
    const ph = this._phase(tms);
    const spring = 0.55 + 0.45 * Math.abs(Math.cos(ph * TAU));           // new/full = spring
    const amp = spring / (this.moonDist * this.moonDist * this.moonDist); // tide ~ 1/d³
    return { h: Math.cos((tms % SEMIDIURNAL) / SEMIDIURNAL * TAU + this.moonDrag) * amp, amp, ph };
  }

  onPointerDown() { this._downT = performance.now(); this._mode = null; }
  onPointerUp() {
    if (this._mode === null && performance.now() - this._downT < 260) {
      this.ripples.push({ x: this.pointer.x, y: this.pointer.y, r: 4, a: 0.7 });
    }
    this._mode = null;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // ---- gestures ---------------------------------------------------------------
    if (this.pointer.down && this.pointer.active) {
      const held = performance.now() - this._downT;
      const moving = Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 4;
      if (this._mode === null) {
        if (moving && held < 280 && this.zoom > 0.5) this._mode = "moon";
        else if (held >= 280) this._mode = "hold";
        else if (moving) this._mode = "moon0";                 // beach drag = nothing (ripple trail)
      }
      if (this._mode === "moon") {
        this.moonDrag += this.pointer.vx * dt * 0.012;
        this.moonDragV = this.pointer.vx * 0.012;
      }
    } else {
      this.moonDragV += -this.moonDrag * 14 * dt; this.moonDragV *= Math.exp(-dt * 5);
      this.moonDrag += this.moonDragV * dt;
      if (Math.abs(this.moonDrag) < 0.002 && Math.abs(this.moonDragV) < 0.01) { this.moonDrag = 0; this.moonDragV = 0; }
    }
    const holding = this._mode === "hold";
    this.zoom = clamp(this.zoom + (holding ? dt * 1.6 : -dt * 1.8), 0, 1);
    const z = this.zoom * this.zoom * (3 - 2 * this.zoom);     // smoothstep
    // in space view, time races so the rotation-through-bulges is visible
    this.warpT = holding ? this.warpT + dt * 3.2e6 : this.warpT * Math.exp(-dt * 3);
    const now = Date.now() + this.warpT;
    const tide = this._tide(now);
    const ph = tide.ph;

    // ==== BEACH VIEW ==============================================================
    if (z < 0.999) {
      // sky by moonlight
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0a1020"); sky.addColorStop(0.55, "#16233c"); sky.addColorStop(1, "#1e3050");
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // stars
      for (const f of this.foam) {
        g.fillStyle = `rgba(220,230,250,${0.35 * f.s * (0.6 + 0.4 * Math.sin(t + f.ph))})`;
        g.fillRect(f.x * W, (f.ph / TAU) * H * 0.4, 1.2, 1.2);
      }
      // the moon, in its true phase
      const mx = W * 0.72, my = H * 0.20, mr = Math.min(W, H) * 0.055;
      this._drawMoon(g, mx, my, mr, ph);
      const halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 5);
      halo.addColorStop(0, "rgba(220,228,255,0.12)"); halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(mx, my, mr * 5, 0, TAU); g.fill();

      // sea level from tide
      const seaBase = H * 0.62;
      const seaY = seaBase - tide.h * H * 0.10;
      // high-water memory: wet sand band
      const hiY = seaBase - tide.amp * H * 0.10;
      const sand = g.createLinearGradient(0, seaY - 20, 0, H);
      sand.addColorStop(0, "#3a3226"); sand.addColorStop(1, "#241f18");
      g.fillStyle = sand; g.fillRect(0, hiY, W, H - hiY);
      g.fillStyle = "rgba(30,34,40,0.55)";                     // wet band
      g.fillRect(0, hiY, W, Math.max(0, seaY - hiY));

      // the sea: layered waves + moonlight lane
      for (let l = 0; l < 4; l++) {
        const y0 = seaY + l * 6;
        g.fillStyle = `rgba(${30 + l * 6},${64 + l * 8},${96 + l * 10},${0.85 - l * 0.12})`;
        g.beginPath();
        g.moveTo(0, H); g.lineTo(0, y0);
        for (let x = 0; x <= W; x += 10)
          g.lineTo(x, y0 + Math.sin(x * 0.014 + t * (1.1 + l * 0.25) + l * 2) * (3.5 + l * 1.6));
        g.lineTo(W, H); g.closePath(); g.fill();
      }
      const lane = g.createRadialGradient(mx, seaY, 0, mx, seaY, (H - seaY) * 1.15);
      lane.addColorStop(0, "rgba(210,222,255,0.22)");
      lane.addColorStop(0.5, "rgba(210,222,255,0.08)");
      lane.addColorStop(1, "rgba(210,222,255,0)");
      g.save();
      g.beginPath(); g.rect(0, seaY, W, H - seaY); g.clip();
      g.fillStyle = lane;
      g.save(); g.translate(mx, seaY); g.scale(0.34, 1); g.translate(-mx, -seaY);
      g.beginPath(); g.arc(mx, seaY, (H - seaY) * 1.15, 0, TAU); g.fill();
      g.restore(); g.restore();
      // foam line at the waterline
      g.strokeStyle = "rgba(235,242,250,0.5)"; g.lineWidth = 1.6;
      g.beginPath();
      for (let x = 0; x <= W; x += 8)
        g.lineTo(x, seaY + Math.sin(x * 0.014 + t * 1.1) * 3.5);
      g.stroke();

      // ripples (tap)
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.r += dt * 60; r.a -= dt * 0.8;
        if (r.a <= 0) { this.ripples.splice(i, 1); continue; }
        g.strokeStyle = `rgba(220,232,250,${r.a * 0.6})`; g.lineWidth = 1.4;
        g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, TAU); g.stroke();
      }

      // next high tide countdown
      const cyc = SEMIDIURNAL;
      const pos = (now % cyc) / cyc;                           // cos peaks at 0
      const toHigh = ((1 - pos) % 1) * cyc;
      const mm = Math.floor(toHigh / 60000), hhh = Math.floor(mm / 60);
      g.font = `600 ${Math.max(13, H * 0.021)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "center"; g.textBaseline = "top";
      g.fillStyle = "rgba(215,225,245,0.8)";
      g.fillText(`다음 만조까지 ${hhh}시간 ${mm % 60}분 · ${["삭","초승","상현","보름 전","보름","보름 뒤","하현","그믐"][Math.floor(ph * 8) % 8]}달`, W / 2, 16);
    }

    // ==== SPACE VIEW (the aha) ====================================================
    if (z > 0.001) {
      g.fillStyle = `rgba(4,6,12,${z})`;
      g.fillRect(0, 0, W, H);
      const cx = W * 0.40, cy = H * 0.52;
      const eR = Math.min(W, H) * 0.16 * (0.4 + 0.6 * z);
      // stars
      g.globalAlpha = z;
      for (const f of this.foam) {
        g.fillStyle = `rgba(220,230,250,${0.4 * f.s})`;
        g.fillRect((f.x * 1.7 % 1) * W, (f.ph / TAU) * H, 1.2, 1.2);
      }

      // moon direction: real phase → angle relative to sun (sun fixed to the right)
      const moonA = ph * TAU + this.moonDrag;
      const mDist = eR * (2.9 + 2.6 * this.moonDist);
      const mx = cx + Math.cos(moonA) * mDist, my = cy + Math.sin(moonA) * mDist;

      // ★ the ocean: ONE ellipse bulging along the Earth–Moon axis — BOTH sides
      const bulge = 1 + 0.34 * tide.amp;
      g.save();
      g.translate(cx, cy); g.rotate(moonA);
      const oc = g.createRadialGradient(0, 0, eR * 0.6, 0, 0, eR * bulge * 1.15);
      oc.addColorStop(0, "rgba(46,110,170,0.95)"); oc.addColorStop(1, "rgba(24,60,110,0.85)");
      g.fillStyle = oc;
      g.beginPath(); g.ellipse(0, 0, eR * bulge * 1.13, eR * 1.015, 0, 0, TAU); g.fill();
      g.restore();

      // the earth
      const eg = g.createRadialGradient(cx - eR * 0.3, cy - eR * 0.3, 0, cx, cy, eR);
      eg.addColorStop(0, "#7fb08a"); eg.addColorStop(0.5, "#3c7a58"); eg.addColorStop(1, "#1d3c50");
      g.fillStyle = eg;
      g.beginPath(); g.arc(cx, cy, eR, 0, TAU); g.fill();

      // your beach: a dot on the rim, rotating with the Earth (one turn/day)
      const dayA = ((now / 864e5) % 1) * TAU;
      const bx = cx + Math.cos(dayA) * eR * 1.0, by = cy + Math.sin(dayA) * eR * 1.0;
      // is the beach inside a bulge? angle to moon axis
      let rel = ((dayA - moonA) % TAU + TAU) % TAU;
      const inBulge = Math.min(Math.abs(rel), Math.abs(rel - Math.PI), Math.abs(rel - TAU)) < 0.5;
      g.fillStyle = inBulge ? "#ffd27c" : "#f2f4f8";
      g.beginPath(); g.arc(bx, by, 5, 0, TAU); g.fill();
      if (inBulge) {
        g.strokeStyle = "rgba(255,210,124,0.8)"; g.lineWidth = 2;
        g.beginPath(); g.arc(bx, by, 10 + Math.sin(t * 6) * 2, 0, TAU); g.stroke();
        g.font = `600 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
        g.textAlign = "center"; g.fillStyle = "rgba(255,210,124,0.95)";
        g.fillText("밀물 — 지금 혹을 통과 중", bx, by - 20);
      }

      // the moon (with phase) + tow line
      this._drawMoon(g, mx, my, eR * 0.27, ph);
      g.strokeStyle = "rgba(180,200,230,0.18)"; g.setLineDash([4, 7]);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke();
      g.setLineDash([]);
      // sun cue
      g.fillStyle = "rgba(255,214,120,0.85)";
      g.font = `600 ${Math.max(11, H * 0.016)}px ui-monospace, Menlo, monospace`;
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText("태양 →", W - 18, cy);

      // the two ahas, spelled out
      g.textAlign = "center"; g.textBaseline = "top";
      g.font = `600 ${Math.max(13, H * 0.021)}px ui-monospace, Menlo, monospace`;
      g.fillStyle = `rgba(220,230,250,${z * 0.95})`;
      g.fillText("달을 등진 바다도 부풀어 있습니다 — 지구가 물보다 빨리 끌려가기 때문", W / 2, 18);
      g.font = `500 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
      g.fillStyle = `rgba(190,205,235,${z * 0.85})`;
      g.fillText("밀물이 오는 게 아니라 — 해변(점)이 부푼 바다 속으로 회전해 들어갑니다 · 하루 두 번", W / 2, 18 + Math.max(16, H * 0.028));
      g.globalAlpha = 1;
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = z > 0.5 ? "rgba(190,205,235,0.7)" : "rgba(215,225,245,0.6)";
    g.fillText(
      z > 0.5 ? "드래그 = 달을 끌어 조석 실험 · 놓으면 제 궤도로 · MOON DIST = 멀어지는 달"
        : "꾹 누르면 우주에서 진실이 보입니다 · 클릭 = 파문 · MOON DIST = 달의 거리",
      W / 2, H - 14);
  }

  _drawMoon(g, x, y, r, ph) {
    // phase disc: lit fraction by terminator ellipse
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    g.fillStyle = "#20242e"; g.fillRect(x - r, y - r, r * 2, r * 2);
    const k = Math.cos(ph * TAU);                              // 1 new → -1 full
    g.fillStyle = "#dfe4ee";
    g.beginPath();
    if (ph < 0.5) {                                            // waxing: right lit
      g.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
      g.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0);
    } else {                                                   // waning: left lit
      g.arc(x, y, r, Math.PI / 2, -Math.PI / 2);
      g.ellipse(x, y, Math.abs(k) * r, r, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    }
    g.fill();
    g.fillStyle = "rgba(150,158,175,0.25)";
    for (const [ox, oy, or2] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.15], [0.1, -0.35, 0.11]]) {
      g.beginPath(); g.arc(x + ox * r, y + oy * r, or2 * r, 0, TAU); g.fill();
    }
    g.restore();
  }

  controls(host) {
    host.appendChild(slider("MOON DIST", 0.55, 1.6, this.moonDist, 0.01, (v) => (this.moonDist = v)));
  }
}
