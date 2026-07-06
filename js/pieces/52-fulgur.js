// ============================================================================
//  52 · Fulgur (수장고/vault — 비공개 보관) (번개의 문자판) — a storm night that IS the dial  [Canvas2D]
//  Sixty slender lightning rods stand on a wide shallow arc over a dark
//  horizon; rod index = the second. Every second a bolt strikes down from the
//  roiling cloud deck onto EXACTLY the current-second rod, which stays lit as
//  a flickering ember — so the filled sweep of the arc reads as elapsed
//  seconds at a glance. At the minute rollover the GRAND DISCHARGE fires: a
//  horizontal crawler bolt tears across the cloud base while a staggered chain
//  of bolts sweeps the lit rods, the sky flashes, and every ember is
//  extinguished — a dark dial for the new minute.
//  Bolts are recursive midpoint-displacement polylines with a couple of branch
//  offshoots, drawn in three passes (wide accent glow → violet-white → thin
//  white-hot core) with a short-lived screen flash and a wet-ground
//  reflection. Rain is a pooled, wind-sheared streak field; drag = wind.
//  Click summons a bolt to the cursor. Everything is pooled — no per-frame
//  allocation churn.
// ============================================================================

import { Piece, clamp, lerp, rand, makeNoise, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const RODS = 60;
const MAX_BOLTS = 26;
const MAX_RAIN = 220;

export default class Fulgur extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    // sliders
    this.storm = 1.0;       // extra ambient bolt frequency / energy
    this.windBase = 0.25;   // base wind
    this.afterglow = 1.0;   // ember brightness
    this.h24 = false;

    this.wind = this.windBase;   // smoothed actual wind
    this.flash = 0;              // full-screen flash envelope
    this.cloudLight = [];        // transient cloud illumination spots {x,y,e}

    // ember state per rod (0..1 heat) — seed rods 0..s so the dial reads NOW
    const d = new Date();
    this.lastS = d.getSeconds(); this.lastM = d.getMinutes();
    this.embers = new Float32Array(RODS);
    for (let i = 0; i <= this.lastS; i++) this.embers[i] = 1;
    this.discharge = null;       // grand-discharge choreography state

    // pooled bolts: {on, pts[], n, life, age, energy, branch[]}
    this.bolts = [];
    for (let i = 0; i < MAX_BOLTS; i++)
      this.bolts.push({ on: false, pts: new Float32Array(64), n: 0, age: 0, life: 0.5, energy: 1, horizontal: false });

    // pooled rain streaks
    this.rain = [];
    for (let i = 0; i < MAX_RAIN; i++)
      this.rain.push({ x: rand(0, 1), y: rand(0, 1), sp: rand(0.7, 1.5), len: rand(0.5, 1) });

    this._layout();
  }

  onResize() { this._layout(); }
  _layout() {
    // rod geometry: wide shallow arc across ~84% width, amphitheater curve
    this.rodX = new Float32Array(RODS);
    this.rodBase = new Float32Array(RODS);
    this.rodTip = new Float32Array(RODS);
    const W = this.w, H = this.h;
    for (let i = 0; i < RODS; i++) {
      const fx = i / (RODS - 1);
      const x = W * 0.08 + fx * W * 0.84;
      const baseY = H * 0.80 - Math.sin(fx * Math.PI) * H * 0.085; // arc bows upward
      const tall = (i % 15 === 0) ? 1.3 : (i % 5 === 0) ? 1.12 : 1.0;
      this.rodX[i] = x;
      this.rodBase[i] = baseY;
      this.rodTip[i] = baseY - H * 0.085 * tall;
    }
    this.groundY = H * 0.88;
  }

  // ---- bolt generation: midpoint displacement, then branches ---------------
  _fireBolt(tx, ty, energy, fromX, fromY) {
    const b = this.bolts.find((q) => !q.on);
    if (!b) return;
    const sx = fromX !== undefined ? fromX : tx + rand(-this.w * 0.16, this.w * 0.16);
    const sy = fromY !== undefined ? fromY : this.h * (0.08 + rand(0, 0.10));
    // midpoint-displacement polyline (fixed 17 points → fits the 64-float buffer)
    const N = 17;
    b.n = N;
    const jag = this.w * 0.028 * (1 + Math.abs(this.wind) * 0.8);
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const ease = Math.sin(p * Math.PI);                     // pinned at both ends
      b.pts[i * 2] = lerp(sx, tx, p) + rand(-1, 1) * jag * ease + this.wind * 30 * ease;
      b.pts[i * 2 + 1] = lerp(sy, ty, p) + rand(-1, 1) * jag * 0.35 * ease;
    }
    b.on = true; b.age = 0; b.life = 0.45 + energy * 0.15; b.energy = energy; b.horizontal = false;
    this.flash = Math.min(1, this.flash + 0.16 * energy);
    this.cloudLight.push({ x: sx, y: sy, e: energy });
    if (this.cloudLight.length > 6) this.cloudLight.shift();
  }

  // horizontal crawler across the cloud base (grand discharge)
  _fireCrawler() {
    const b = this.bolts.find((q) => !q.on);
    if (!b) return;
    const N = 24;
    b.n = N;
    const y0 = this.h * 0.17;
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      b.pts[i * 2] = this.w * (0.03 + p * 0.94) + rand(-8, 8);
      b.pts[i * 2 + 1] = y0 + rand(-1, 1) * this.h * 0.045;
    }
    b.on = true; b.age = 0; b.life = 0.8; b.energy = 1.6; b.horizontal = true;
    this.flash = Math.min(1, this.flash + 0.5);
  }

  onPointerDown() {
    // summon a bolt to the cursor
    this._fireBolt(this.pointer.x, Math.min(this.pointer.y, this.groundY), 0.9);
  }

  frame(dt, t) {
    const ctx = this.ctx2d(), W = this.w, H = this.h;

    // ---- clock edges -------------------------------------------------------
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (s !== this.lastS) {
      this.lastS = s;
      if (m !== this.lastM) {
        this.lastM = m;
        // GRAND DISCHARGE: crawler + staggered chain over lit rods, then wipe
        this._fireCrawler();
        this.discharge = { t: 0, next: 0, group: 0 };
      } else {
        this._fireBolt(this.rodX[s], this.rodTip[s], 1.0);
        this.embers[s] = 1;
      }
    }

    // grand-discharge choreography: 9 chain bolts sweeping the arc over ~0.7s
    if (this.discharge) {
      const D = this.discharge;
      D.t += dt;
      while (D.group < 9 && D.t >= D.next) {
        const gi = Math.floor((D.group / 9) * RODS) + ((Math.random() * 5) | 0);
        const idx = clamp(gi, 0, RODS - 1);
        this._fireBolt(this.rodX[idx], this.rodTip[idx], 1.25);
        D.group++; D.next += 0.075;
      }
      if (D.t > 0.75) {
        this.embers.fill(0);              // extinguish — dark dial, new minute
        this.embers[0] = 1;
        this.discharge = null;
      }
    }

    // ambient extra strikes (STORM slider) — hit already-lit region so the dial stays truthful
    if (Math.random() < dt * this.storm * 0.5) {
      const idx = (Math.random() * (s + 1)) | 0;
      this._fireBolt(this.rodX[idx], this.rodTip[idx], 0.45);
    }

    // wind: drag shears it, eases back to base
    const targetWind = this.pointer.down ? clamp(this.windBase + this.pointer.vx * 0.05, -2, 2) : this.windBase;
    this.wind += (targetWind - this.wind) * (1 - Math.exp(-dt * 3));

    // ---- sky ---------------------------------------------------------------
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const fl = this.flash;
    g.addColorStop(0, `rgb(${14 + fl * 70},${15 + fl * 66},${30 + fl * 80})`);
    g.addColorStop(0.55, `rgb(${8 + fl * 46},${9 + fl * 44},${20 + fl * 60})`);
    g.addColorStop(1, `rgb(${5 + fl * 26},${6 + fl * 24},${12 + fl * 34})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // ---- cloud deck (flat elliptical noise blobs, lit from within near bolts)
    const drift = t * (6 + Math.abs(this.wind) * 26);
    for (let i = 0; i < 54; i++) {
      const fx = ((i * 71.7 + drift * (0.6 + (i % 5) * 0.14)) % (W * 1.3)) - W * 0.15;
      const n = this.noise(i * 0.7, t * 0.05);
      const cy = H * (0.03 + 0.13 * Math.abs(this.noise(i * 1.3, 7))) + n * H * 0.02;
      const cr = H * (0.05 + 0.09 * Math.abs(this.noise(i * 2.1, 3)));
      // proximity illumination from recent bolts
      let lum = 0;
      for (const L of this.cloudLight) {
        const dx = (fx - L.x) / (W * 0.2);
        lum += L.e * Math.exp(-dx * dx);
      }
      lum = Math.min(1, lum * 0.9 + fl * 0.5);
      const base = 20 + lum * 120;
      ctx.fillStyle = `rgba(${base + 10},${base + 6},${base + 38},0.20)`;
      ctx.beginPath(); ctx.ellipse(fx, cy, cr * 1.5, cr * 0.55, 0, 0, TAU); ctx.fill();
    }
    for (const L of this.cloudLight) L.e *= Math.exp(-dt * 3.2);

    // ---- rain (pooled, wind-sheared) ----------------------------------------
    ctx.strokeStyle = "rgba(150,165,210,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of this.rain) {
      r.y += r.sp * dt * 1.1;
      r.x += this.wind * dt * 0.28 * r.sp;
      if (r.y > 1) { r.y -= 1.05; r.x = Math.random(); }
      if (r.x > 1.05) r.x -= 1.1; else if (r.x < -0.05) r.x += 1.1;
      const x = r.x * W, y = r.y * this.groundY;
      const ln = r.len * 13 * r.sp;
      ctx.moveTo(x, y);
      ctx.lineTo(x - this.wind * ln * 0.9, y - ln);
    }
    ctx.stroke();

    // ---- ground ------------------------------------------------------------
    const gg = ctx.createLinearGradient(0, this.groundY - H * 0.1, 0, H);
    gg.addColorStop(0, "rgba(10,11,20,0)");
    gg.addColorStop(0.4, `rgb(${7 + fl * 20},${8 + fl * 18},${14 + fl * 26})`);
    gg.addColorStop(1, `rgb(${4 + fl * 12},${5 + fl * 10},${9 + fl * 16})`);
    ctx.fillStyle = gg;
    ctx.fillRect(0, this.groundY - H * 0.1, W, H * 0.22);

    // ---- the dial: 60 rods + tick emphasis ----------------------------------
    ctx.globalCompositeOperation = "lighter";

    // progress band: a continuous charged line linking every swept rod's base,
    // 0 → current second — the dial reads as a filling gauge, not loose dots.
    if (s > 0 || this.embers[0] > 0.02) {
      const head = s;
      for (const [wd, alpha] of [[9, 0.12], [4, 0.26], [1.8, 0.62]]) {
        ctx.strokeStyle = `rgba(255,79,216,${alpha * this.afterglow})`;
        ctx.lineWidth = wd; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.rodX[0], this.rodTip[0]);
        for (let i = 1; i <= head; i++) ctx.lineTo(this.rodX[i], this.rodTip[i]);
        ctx.stroke();
      }
      // hot head at the current second — the reading edge of the gauge
      const hx = this.rodX[head], hy = this.rodTip[head];
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
      hg.addColorStop(0, "rgba(255,240,250,0.9)");
      hg.addColorStop(0.35, "rgba(255,79,216,0.55)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hx, hy, 14, 0, TAU); ctx.fill();
    }

    // etched quarter numerals — 0 · 15 · 30 · 45 anchor the dial reading
    ctx.font = `500 ${Math.max(10, Math.round(H * 0.016))}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const q of [0, 15, 30, 45]) {
      const lit = s >= q;
      ctx.fillStyle = lit ? "rgba(255,150,230,0.75)" : "rgba(150,158,200,0.42)";
      ctx.fillText(String(q), this.rodX[q], this.rodBase[q] + 10);
    }

    for (let i = 0; i < RODS; i++) {
      const x = this.rodX[i], by = this.rodBase[i], ty = this.rodTip[i];
      const major = i % 5 === 0;
      ctx.strokeStyle = major ? "rgba(165,175,215,0.38)" : "rgba(140,150,190,0.22)";
      ctx.lineWidth = major ? 1.6 : 1.1;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, ty); ctx.stroke();

      // ember: struck rods stay lit, flickering
      const e = this.embers[i];
      if (e > 0.02) {
        const flick = 0.72 + 0.28 * Math.sin(t * 11 + i * 2.4) * this.noise(i, t * 2);
        const bright = e * flick * this.afterglow;
        const rr = 5.5 + bright * 4;
        const eg = ctx.createRadialGradient(x, ty, 0, x, ty, rr);
        eg.addColorStop(0, `rgba(255,220,235,${0.85 * bright})`);
        eg.addColorStop(0.4, `rgba(255,79,216,${0.5 * bright})`);
        eg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(x, ty, rr, 0, TAU); ctx.fill();
        // wet-ground reflection of the ember
        ctx.fillStyle = `rgba(255,79,216,${0.08 * bright})`;
        ctx.beginPath(); ctx.ellipse(x, this.groundY + 4, 6, 2, 0, 0, TAU); ctx.fill();
      }
    }

    // ---- bolts (3 passes) + reflections -------------------------------------
    for (const b of this.bolts) {
      if (!b.on) continue;
      b.age += dt;
      const p = b.age / b.life;
      if (p >= 1) { b.on = false; continue; }
      // hard flash for first ~80ms, then afterglow decay
      const hot = b.age < 0.08 ? 1 : Math.exp(-(b.age - 0.08) * 6);
      const E = b.energy * hot;
      const passes = [
        [9 * b.energy, `rgba(255,79,216,${0.16 * E})`],
        [3.2, `rgba(190,170,255,${0.5 * E})`],
        [1.2, `rgba(255,252,255,${0.95 * E})`],
      ];
      for (const [wd, col] of passes) {
        ctx.strokeStyle = col; ctx.lineWidth = wd;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 1; i < b.n; i++) ctx.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
        ctx.stroke();
      }
      // wet-ground reflection (vertical bolts only)
      if (!b.horizontal) {
        const ex = b.pts[(b.n - 1) * 2];
        const rg = ctx.createLinearGradient(0, this.groundY, 0, H);
        rg.addColorStop(0, `rgba(200,180,255,${0.20 * E})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(ex - 3, this.groundY, 6, H - this.groundY);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // ---- readout plate (bottom-center, clear of the actionbar) --------------
    const pad = (n) => String(n).padStart(2, "0");
    let str;
    if (this.h24) str = `${pad(h)}:${pad(m)}:${pad(s)}`;
    else { let hd = h % 12; if (hd === 0) hd = 12; str = `${pad(hd)}:${pad(m)}:${pad(s)} ${h < 12 ? "AM" : "PM"}`; }
    ctx.font = `600 ${Math.max(15, Math.round(H * 0.028))}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const py = H - 72;
    const tw = ctx.measureText(str).width;
    ctx.fillStyle = "rgba(6,7,14,0.55)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2 - 16, py - 15, tw + 32, 30, 15);
    ctx.fill();
    ctx.fillStyle = "rgba(235,230,255,0.92)";
    ctx.fillText(str, W / 2, py);

    // envelopes
    this.flash = Math.max(0, this.flash - dt * 3.4);
    for (let i = 0; i < RODS; i++)
      if (this.embers[i] > 0 && this.embers[i] < 1) this.embers[i] = Math.max(0, this.embers[i] - dt * 0.5);
  }

  controls(host) {
    host.appendChild(slider("STORM", 0, 3, this.storm, 0.05, (v) => (this.storm = v)));
    host.appendChild(slider("WIND", 0, 1.2, this.windBase, 0.02, (v) => (this.windBase = v)));
    host.appendChild(slider("AFTERGLOW", 0.3, 2, this.afterglow, 0.05, (v) => (this.afterglow = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
