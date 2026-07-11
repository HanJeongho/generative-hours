// ============================================================================
//  45 · Sand Mandala (모래 만다라) — 매시간 완성되고, 지워진다 [Canvas2D]
//  티베트 승려들은 몇 주에 걸쳐 색모래로 만다라를 완성하고, 완성되는 순간
//  쓸어버린다 — 무상(無常)의 의례. 여기서는 시간이 그 승려다.
//  · 만다라는 60개의 부채꼴(=분). 매분 새 부채꼴에 색모래가 실제 알갱이로
//    쏟아져 들어와 문양을 채운다 — 시계 반대편에서 보면 라디얼 스윕 시계.
//  · 안쪽 고리는 초: 매초 상아색 모래 한 점이 놓인다(분마다 고리가 짙어짐).
//  · 정시가 되는 순간 — 바람. 나선 돌풍이 3초에 걸쳐 한 시간의 작업을
//    쓸어가고, 알갱이들이 날아오르고, 새 팔레트의 새 만다라가 시작된다.
//  · 바탕에는 완성될 문양의 가이드 선이 희미하게 그려져 있다(승려의 초크
//    라인) — 시간이 그것을 채운다.
//  인터랙션: 드래그 = 손가락 고랑(모래가 밀려나며 문양이 다친다 — 다음
//  시간까지 돌아오지 않는다) · 클릭 = 입김(알갱이가 흩날림) · 꾹 = 폭풍이
//  자라나 전체를 휩쓸기 시작 · 바람 버튼 = 지금 쓸고 새로 시작.
//  구현: 모래는 오프스크린 축적 캔버스(수만 알갱이 1회 드로우), 매 프레임은
//  drawImage + 신규 알갱이만. 시드 결정적 — 같은 시각 재입장 시 즉시 복원.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const PALETTES = [
  ["#d98e2b", "#b4482b", "#e8d5a8", "#7a3020", "#3f6b5e"],   // saffron
  ["#2b4a8a", "#c9a227", "#e6e2d5", "#7a2f2f", "#2f6b4f"],   // lapis
  ["#8a6db4", "#c94f7c", "#e8dcc8", "#3b3550", "#4f8a7a"],   // dusk
  ["#b8b0a4", "#7a4a2b", "#e2ddd2", "#41403c", "#8a2b2b"],   // ash
];

export default class SandMandala extends Piece {
  setup() {
    this.grain = 1.0;          // GRAIN slider — pour density
    this.wind = 0;             // hour-sweep envelope (1 → 0)
    this.storm = 0;            // hold-to-storm envelope
    this.fly = [];             // flying grain pool
    for (let i = 0; i < 900; i++) this.fly.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, col: "" });
    this._downT = 0; this._moved = false;
    this._lastSec = -1;
    this._newHour(new Date().getHours(), true);
    this._makeSand();
    this._reconcile(true);
  }
  onResize() { this._makeSand(); this._layoutOnly(); this._reconcile(true); }

  _makeSand() {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(this.w * this.dpr));
    c.height = Math.max(1, Math.round(this.h * this.dpr));
    this.sand = c;
    this.sg = c.getContext("2d");
    this.sg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  _layoutOnly() {
    this.cx = this.w / 2; this.cy = this.h * 0.52;
    this.R = Math.min(this.w, this.h) * 0.40;
    this.r0 = this.R * 0.34;
    this.rs = this.r0 * 0.72;                        // seconds ring radius
  }

  // ---- deterministic design for this hour -----------------------------------
  _newHour(h, first) {
    this.hour = h;
    this.seed = (h * 2654435761 >>> 0) % 100000 + (this._extraSeed || 0);
    const rnd = this._rng(this.seed);
    this.pal = PALETTES[(this.seed + (this._extraSeed || 0)) % PALETTES.length].map(hexToRgb);
    // radial bands between r0..R: [u0,u1,colorIdx,style] style: 0 solid,1 sparse,2 dotline
    this.bands = [];
    let u = 0;
    while (u < 0.97) {
      const w = 0.10 + rnd() * 0.16;
      this.bands.push([u, Math.min(1, u + w), (rnd() * this.pal.length) | 0, (rnd() * 3) | 0]);
      u += w + 0.02;
    }
    this.poured = new Float32Array(60);              // per-minute pour progress
    this.corePoured = 0;
    this._layoutOnly();
  }
  _rng(s) { let x = s || 1; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); }

  // ---- pouring: draw grains of sector m from progress a→b --------------------
  _grainCount(m) { return Math.round(620 * this.grain * (this.R / 420 + 0.6)); }
  _pourSector(m, to) {
    const from = this.poured[m];
    if (to <= from) return;
    this.poured[m] = to;
    const total = this._grainCount(m);
    const i0 = Math.floor(from * total), i1 = Math.floor(to * total);
    if (i1 <= i0) return;
    const rnd = this._rng(this.seed + m * 977 + 13);
    for (let i = 0; i < i0; i++) { rnd(); rnd(); rnd(); rnd(); }   // skip consumed
    const g = this.sg;
    const a0 = -Math.PI / 2 + (m / 60) * TAU;
    for (let i = i0; i < i1; i++) {
      const uu = rnd(), va = rnd(), jc = rnd(), js = rnd();
      // pick a band weighted by width; grain radial pos inside it
      const band = this.bands[(Math.floor(uu * 997) % this.bands.length)];
      const [b0, b1, ci, style] = band;
      let ur = b0 + (uu * 7919 % 1) * (b1 - b0);
      if (style === 1 && js > 0.45) continue;                       // sparse band
      if (style === 2) ur = (b0 + b1) / 2 + ((uu * 7919 % 1) - 0.5) * (b1 - b0) * 0.22; // dot line
      const rr = this.r0 + ur * (this.R - this.r0);
      const an = a0 + va * (TAU / 60) * 0.92 + 0.002;
      const [cr, cg2, cb] = this.pal[ci];
      const j = (jc - 0.5) * 42;
      g.fillStyle = `rgba(${clamp(cr + j, 0, 255) | 0},${clamp(cg2 + j, 0, 255) | 0},${clamp(cb + j, 0, 255) | 0},${0.85 + js * 0.15})`;
      const s = 1.1 + js * 0.9;
      g.fillRect(this.cx + Math.cos(an) * rr - s / 2, this.cy + Math.sin(an) * rr - s / 2, s, s);
    }
  }
  _pourCore(to) {
    const from = this.corePoured;
    if (to <= from) return;
    this.corePoured = to;
    const total = 1500 * this.grain;
    const i0 = Math.floor(from * total), i1 = Math.floor(to * total);
    const rnd = this._rng(this.seed + 555);
    for (let i = 0; i < i0; i++) { rnd(); rnd(); rnd(); }
    const g = this.sg;
    for (let i = i0; i < i1; i++) {
      const a = rnd() * TAU, u = rnd(), jc = rnd();
      // lotus core: 8-petal rose curve
      const pet = Math.abs(Math.cos(a * 4));
      const rr = u * this.r0 * 0.52 * (0.35 + 0.65 * pet);
      const [cr, cg2, cb] = this.pal[(i % 2) ? 2 : 0];
      const j = (jc - 0.5) * 40;
      g.fillStyle = `rgba(${clamp(cr + j, 0, 255) | 0},${clamp(cg2 + j, 0, 255) | 0},${clamp(cb + j, 0, 255) | 0},0.9)`;
      g.fillRect(this.cx + Math.cos(a) * rr - 0.7, this.cy + Math.sin(a) * rr - 0.7, 1.5, 1.5);
    }
  }
  _pourSecondDot(s) {
    const g = this.sg;
    const an = -Math.PI / 2 + (s / 60) * TAU;
    const bx = this.cx + Math.cos(an) * this.rs, by = this.cy + Math.sin(an) * this.rs;
    const [cr, cg2, cb] = this.pal[2];
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), r = Math.pow(Math.random(), 0.6) * this.R * 0.016;
      const j = rand(-30, 30);
      g.fillStyle = `rgba(${clamp(cr + j, 0, 255) | 0},${clamp(cg2 + j, 0, 255) | 0},${clamp(cb + j, 0, 255) | 0},0.9)`;
      g.fillRect(bx + Math.cos(a) * r, by + Math.sin(a) * r, 1.3, 1.3);
    }
  }

  // rebuild state to match the wall clock (load / resize / tab-return)
  _reconcile(hard) {
    const d = new Date();
    if (hard) {
      this.sg.clearRect(0, 0, this.w, this.h);
      this._newHour(d.getHours(), true);
      this._pourCore(1);
      const m = d.getMinutes();
      for (let i = 0; i < m; i++) this._pourSector(i, 1);
      this._pourSector(m, d.getSeconds() / 60);
      const s = d.getSeconds();
      for (let i = 0; i <= s; i++) this._pourSecondDot(i);
      this._lastSec = s;
    }
  }

  // ---- interactions -----------------------------------------------------------
  onPointerDown() { this._downT = performance.now(); this._moved = false; }
  onPointerUp() {
    if (!this._moved && performance.now() - this._downT < 260) this._breath(this.pointer.x, this.pointer.y);
  }
  _breath(x, y) {
    // a puff: loose grains lift off in a small circle
    const g = this.sg;
    g.save(); g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU), r = Math.pow(Math.random(), 0.5) * 52;
      g.fillStyle = "rgba(0,0,0,0.85)";
      g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.2, 2.2);
    }
    g.restore();
    for (let i = 0; i < 70; i++) this._spawnFly(x + rand(-40, 40), y + rand(-40, 40), 1.6);
  }
  _spawnFly(x, y, sp) {
    const p = this.fly.find((q) => !q.on);
    if (!p) return;
    const [cr, cg2, cb] = this.pal[(Math.random() * this.pal.length) | 0];
    p.on = true; p.x = x; p.y = y;
    const a = rand(0, TAU);
    p.vx = Math.cos(a) * rand(20, 90) * sp + rand(-10, 10);
    p.vy = Math.sin(a) * rand(20, 90) * sp - rand(10, 50) * sp;
    p.life = rand(0.5, 1.1);
    p.col = `${cr},${cg2},${cb}`;
  }

  frame(dt, t) {
    const g = this.ctx2d();
    const W = this.w, H = this.h;
    const d = new Date();

    // ---- clock: pour / seconds / hour wind ---------------------------------
    if (this.wind <= 0) {
      if (d.getHours() !== this.hour) {
        this.wind = 1; this._nextHour = d.getHours();      // the sweeping
      } else {
        const m = d.getMinutes(), s = d.getSeconds();
        // catch-up (throttled tabs): finish any earlier sectors instantly
        for (let i = 0; i < m; i++) if (this.poured[i] < 1) this._pourSector(i, 1);
        this._pourCore(1);
        this._pourSector(m, clamp((s + d.getMilliseconds() / 1000) / 60 * 1.06, 0, 1));
        if (s !== this._lastSec) { this._lastSec = s; this._pourSecondDot(s); }
      }
    } else {
      // WIND: spiral gust erases the hour's work
      this.wind = Math.max(0, this.wind - dt / 3.2);
      const sg = this.sg;
      sg.save(); sg.globalCompositeOperation = "destination-out";
      const sweepA = (1 - this.wind) * TAU * 2.2;
      for (let i = 0; i < 16; i++) {
        const rr = Math.pow(Math.random(), 0.7) * this.R * 1.05;
        const an = sweepA + rand(-0.9, 0.9) + rr * 0.004;
        const x = this.cx + Math.cos(an) * rr, y = this.cy + Math.sin(an) * rr;
        const er = rand(8, 26);
        const rad = sg.createRadialGradient(x, y, 0, x, y, er);
        rad.addColorStop(0, "rgba(0,0,0,0.5)"); rad.addColorStop(1, "rgba(0,0,0,0)");
        sg.fillStyle = rad;
        sg.beginPath(); sg.arc(x, y, er, 0, TAU); sg.fill();
        if (Math.random() < 0.7) this._spawnFly(x, y, 2.2);
      }
      // global thinning toward the end
      if (this.wind < 0.45) {
        sg.fillStyle = `rgba(0,0,0,${dt * 2.4})`;
        sg.fillRect(0, 0, W, H);
      }
      sg.restore();
      if (this.wind <= 0) {                                // fresh mandala
        this.sg.clearRect(0, 0, W, H);
        this._extraSeed = (this._extraSeed || 0);
        this._newHour(this._nextHour ?? d.getHours(), false);
        this._lastSec = -1;
      }
    }

    // ---- hand: furrow / storm ------------------------------------------------
    const holding = this.pointer.down && this.pointer.active;
    if (holding && (Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 6)) this._moved = true;
    if (holding && this._moved) {
      // finger through sand: a furrow + grains kicked to the sides
      const sg = this.sg;
      sg.save(); sg.globalCompositeOperation = "destination-out";
      const fr = sg.createRadialGradient(this.pointer.x, this.pointer.y, 0, this.pointer.x, this.pointer.y, 15);
      fr.addColorStop(0, "rgba(0,0,0,0.9)"); fr.addColorStop(0.7, "rgba(0,0,0,0.5)"); fr.addColorStop(1, "rgba(0,0,0,0)");
      sg.fillStyle = fr;
      sg.beginPath(); sg.arc(this.pointer.x, this.pointer.y, 15, 0, TAU); sg.fill();
      sg.restore();
      // ridge: displaced grains land at the furrow's flanks
      const vx = this.pointer.vx, vy = this.pointer.vy;
      const vl = Math.hypot(vx, vy) + 1e-4;
      const nx = -vy / vl, ny = vx / vl;
      for (let i = 0; i < 8; i++) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const ox = nx * side * rand(15, 24), oy = ny * side * rand(15, 24);
        const [cr, cg2, cb] = this.pal[(Math.random() * this.pal.length) | 0];
        this.sg.fillStyle = `rgba(${cr},${cg2},${cb},0.75)`;
        this.sg.fillRect(this.pointer.x + ox + rand(-4, 4), this.pointer.y + oy + rand(-4, 4), 1.4, 1.4);
      }
      if (Math.random() < 0.5) this._spawnFly(this.pointer.x, this.pointer.y, 0.8);
    }
    const stormHold = holding && !this._moved && performance.now() - this._downT > 350;
    this.storm = clamp(this.storm + (stormHold ? dt * 0.7 : -dt * 1.6), 0, 1);
    if (this.storm > 0.03 && this.wind <= 0) {
      const sg = this.sg;
      sg.save(); sg.globalCompositeOperation = "destination-out";
      const n = Math.round(this.storm * 26);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), rr = Math.pow(Math.random(), 0.6) * this.R * 1.05;
        const x = this.cx + Math.cos(a) * rr, y = this.cy + Math.sin(a) * rr;
        sg.fillStyle = "rgba(0,0,0,0.6)";
        sg.fillRect(x, y, 2.4, 2.4);
        if (Math.random() < 0.25) this._spawnFly(x, y, 1.2 + this.storm);
      }
      sg.restore();
    }

    // =========================== R E N D E R ================================
    // stone ground
    g.fillStyle = "#141216"; g.fillRect(0, 0, W, H);
    const bgg = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(W, H) * 0.72);
    bgg.addColorStop(0, "rgba(66,58,52,0.22)"); bgg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bgg; g.fillRect(0, 0, W, H);

    // the monk's chalk guides — the design time will fill
    g.strokeStyle = "rgba(210,200,185,0.07)"; g.lineWidth = 1;
    g.beginPath();
    for (const [b0, b1] of [[0, 0]].concat(this.bands.map((b) => [b[0], b[1]]))) {
      for (const u of [b0, b1]) {
        const rr = this.r0 + u * (this.R - this.r0);
        g.moveTo(this.cx + rr, this.cy);
        g.arc(this.cx, this.cy, rr, 0, TAU);
      }
    }
    g.moveTo(this.cx + this.rs, this.cy); g.arc(this.cx, this.cy, this.rs, 0, TAU);
    g.stroke();
    g.strokeStyle = "rgba(210,200,185,0.045)";
    g.beginPath();
    for (let i = 0; i < 60; i += 5) {
      const an = -Math.PI / 2 + (i / 60) * TAU;
      g.moveTo(this.cx + Math.cos(an) * this.r0, this.cy + Math.sin(an) * this.r0);
      g.lineTo(this.cx + Math.cos(an) * this.R, this.cy + Math.sin(an) * this.R);
    }
    g.stroke();

    // THE SAND
    g.drawImage(this.sand, 0, 0, W, H);

    // flying grains
    for (const p of this.fly) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 30 * dt;
      p.vx *= Math.exp(-dt * 0.8);
      g.fillStyle = `rgba(${p.col},${clamp(p.life, 0, 1) * 0.9})`;
      g.fillRect(p.x, p.y, 1.5, 1.5);
    }

    // the pouring spout: a falling thread of grains above the active sector
    if (this.wind <= 0) {
      const m = d.getMinutes(), sfrac = (d.getSeconds() + d.getMilliseconds() / 1000) / 60;
      if (this.poured[m] < 1) {
        const an = -Math.PI / 2 + ((m + 0.5) / 60) * TAU;
        const rr = this.r0 + clamp(sfrac * 1.06, 0, 1) * 0 + (this.R + this.r0) / 2;
        const bx = this.cx + Math.cos(an) * rr, by = this.cy + Math.sin(an) * rr;
        for (let i = 0; i < 5; i++) {
          const [cr, cg2, cb] = this.pal[(Math.random() * this.pal.length) | 0];
          g.fillStyle = `rgba(${cr},${cg2},${cb},${rand(0.4, 0.9)})`;
          g.fillRect(bx + rand(-2.5, 2.5), by - rand(0, 46), 1.4, 1.4);
        }
      }
    }

    // storm haze
    if (this.storm > 0.03 || this.wind > 0) {
      const a = Math.max(this.storm * 0.15, this.wind > 0 ? Math.sin((1 - this.wind) * Math.PI) * 0.2 : 0);
      g.fillStyle = `rgba(190,175,155,${a * 0.4})`;
      g.fillRect(0, 0, W, H);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(200,192,178,0.55)";
    const mm = String(d.getMinutes()).padStart(2, "0");
    g.fillText(
      this.wind > 0 ? "무상(無常) — 바람이 쓸어간다"
        : `${d.getHours()}시의 만다라 · ${mm}번째 꽃잎`,
      W / 2, H - 10);

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("GRAIN", 0.5, 1.8, this.grain, 0.05, (v) => (this.grain = v)));
    host.appendChild(buttonRow([
      {
        label: "바람 — 지금 쓸기", on: () => {
          if (this.wind <= 0) {
            this._extraSeed = ((this._extraSeed || 0) + 1) % PALETTES.length;
            this.wind = 1; this._nextHour = new Date().getHours();
          }
        },
      },
    ]));
  }
}
