// ============================================================================
//  14 · Fracture — Voronoi stained glass
//  Seed points scatter across the pane; each seed owns the region of space
//  nearest to it (its Voronoi cell). We build those cells geometrically by
//  starting from the bounding rectangle and clipping it against the
//  perpendicular bisector between this seed and every other seed
//  (Sutherland–Hodgman half-plane clipping). Each surviving polygon is filled
//  as a translucent jewel pane, edged with dark "lead" and a glassy highlight,
//  with an additive bloom behind so light seems to pass through the glass.
//  Seeds drift slowly so the panes breathe. Click to drive in a new shard.
// ============================================================================

import { Piece, TAU, clamp, rand, lerp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Fracture extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.baseHue = this._accentHue();   // violet/purple anchor from accent
    this.drift = 0.5;                   // seed drift speed multiplier
    this.lead = 2.4;                    // lead-line (border) thickness, CSS px
    this.target = this._defaultCount(); // desired seed count
    this.seeds = [];
    this.cells = [];                    // cached polygons (recomputed periodically)
    this.flashes = [];                  // click "crack" flashes {x,y,life}
    this._acc = 0;                      // recompute throttle accumulator
    this.scatter();
    this._compute();                    // alive on load
  }

  // pull a hue out of the accent hex so the palette tracks the gallery accent
  _accentHue() {
    const h = (this.accent || "#c8b6ff").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-4) return 270;           // fall back to violet
    let hue;
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60; if (hue < 0) hue += 360;
    return hue;
  }

  _defaultCount() {
    // scale seeds with area but keep N in the fast 30–80 clipping range
    return Math.round(clamp(this.w * this.h / 14000, 34, 72));
  }

  // ---- seeds ---------------------------------------------------------------
  scatter() {
    this.seeds.length = 0;
    for (let i = 0; i < this.target; i++) this.seeds.push(this._newSeed());
  }
  _newSeed(x, y) {
    const a = rand(TAU), sp = rand(6, 18);   // slow random heading
    return {
      x: x ?? rand(this.w), y: y ?? rand(this.h),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      // each pane gets a stable jewel tone spread around the accent hue
      hue: (this.baseHue + rand(-70, 70) + 360) % 360,
      light: rand(40, 64),                    // jewel lightness
      sat: rand(58, 86),
    };
  }

  onResize() {
    // keep seeds in-bounds and rebuild the diagram for the new viewport
    for (const s of this.seeds) { s.x = clamp(s.x, 4, this.w - 4); s.y = clamp(s.y, 4, this.h - 4); }
    this._compute();
  }

  // click = "깨뜨리기": drive a fresh shard into the glass + crack flash
  onPointerDown() {
    const p = this.pointer;
    this.seeds.push(this._newSeed(p.x, p.y));
    this.target = this.seeds.length;
    this.flashes.push({ x: p.x, y: p.y, life: 1 });
    if (this.flashes.length > 8) this.flashes.shift();
    this._compute();
  }

  // ---- Voronoi via Sutherland–Hodgman bisector clipping --------------------
  _compute() {
    const W = this.w, H = this.h, seeds = this.seeds;
    this.cells.length = 0;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      // start from the full pane rectangle
      let poly = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
      for (let j = 0; j < seeds.length && poly.length; j++) {
        if (j === i) continue;
        const o = seeds[j];
        // perpendicular bisector of s↔o: keep the half-plane nearer to s.
        // half-plane test: 2((o-s)·p) <= |o|²-|s|²  (points closer to s pass)
        const nx = o.x - s.x, ny = o.y - s.y;
        const c = (o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y) / 2;
        poly = this._clipHalf(poly, nx, ny, c);
      }
      if (poly.length >= 3) this.cells.push({ seed: s, poly });
    }
  }

  // clip polygon to the half-plane  nx*x + ny*y <= c  (inside = nearer seed)
  _clipHalf(poly, nx, ny, c) {
    const out = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const da = nx * a.x + ny * a.y - c;     // <=0 means inside
      const db = nx * b.x + ny * b.y - c;
      const ain = da <= 0, bin = db <= 0;
      if (ain) out.push(a);
      if (ain !== bin) {                       // edge crosses the boundary
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  // ---- render --------------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // drift seeds, bouncing inside the pane
    const sp = this.drift;
    if (sp > 0.001) {
      for (const s of this.seeds) {
        s.x += s.vx * dt * sp; s.y += s.vy * dt * sp;
        if (s.x < 4) { s.x = 4; s.vx = Math.abs(s.vx); }
        if (s.x > this.w - 4) { s.x = this.w - 4; s.vx = -Math.abs(s.vx); }
        if (s.y < 4) { s.y = 4; s.vy = Math.abs(s.vy); }
        if (s.y > this.h - 4) { s.y = this.h - 4; s.vy = -Math.abs(s.vy); }
      }
      // recompute the diagram a few times a second (cheap, smooth enough)
      this._acc += dt;
      if (this._acc > 0.05) { this._acc = 0; this._compute(); }
    }

    // near-black backing wash
    g.fillStyle = "#050407";
    g.fillRect(0, 0, this.w, this.h);

    // 1) additive glow behind the glass — light bleeding through the panes
    g.globalCompositeOperation = "lighter";
    for (const cell of this.cells) {
      const s = cell.seed;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.6 + s.hue);
      const rad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 120);
      rad.addColorStop(0, `hsla(${s.hue}, ${s.sat}%, ${s.light}%, ${0.10 + pulse * 0.06})`);
      rad.addColorStop(1, "hsla(0,0%,0%,0)");
      g.fillStyle = rad;
      this._tracePoly(g, cell.poly);
      g.fill();
    }

    // 2) translucent jewel fills (multiply keeps them deep & glassy)
    g.globalCompositeOperation = "source-over";
    for (const cell of this.cells) {
      const s = cell.seed;
      this._tracePoly(g, cell.poly);
      // subtle directional sheen across each pane
      const sheen = 0.7 + 0.3 * Math.sin(t * 0.4 + s.x * 0.01 + s.y * 0.01);
      g.fillStyle = `hsla(${s.hue}, ${s.sat}%, ${s.light * sheen}%, 0.5)`;
      g.fill();
    }

    // 3) glassy highlight (inner bright edge) then dark lead lines on top
    g.lineJoin = "round";
    for (const cell of this.cells) {
      const s = cell.seed;
      this._tracePoly(g, cell.poly);
      g.lineWidth = this.lead * 0.45;
      g.strokeStyle = `hsla(${s.hue}, 90%, 86%, 0.28)`;  // glassy catch-light
      g.stroke();
    }
    for (const cell of this.cells) {
      this._tracePoly(g, cell.poly);
      g.lineWidth = this.lead;
      g.strokeStyle = "rgba(4,3,7,0.92)";                 // dark lead came
      g.stroke();
    }

    // 4) crack flashes from clicks — quick bright radiating glints
    g.globalCompositeOperation = "lighter";
    for (const f of this.flashes) f.life -= dt * 2.2;
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const f of this.flashes) {
      const r = (1 - f.life) * 90 + 8;
      const a = f.life * 0.6;
      g.strokeStyle = `hsla(${this.baseHue}, 90%, 90%, ${a})`;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * TAU + f.life * 0.6;
        g.moveTo(f.x, f.y);
        g.lineTo(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r);
      }
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }

  _tracePoly(g, poly) {
    g.beginPath();
    g.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
    g.closePath();
  }

  // ---- controls ------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("SHARD COUNT", 12, 90, this.target, 1, (v) => {
      const n = v | 0;
      if (n > this.seeds.length) {        // grow: add fresh shards
        for (let i = this.seeds.length; i < n; i++) this.seeds.push(this._newSeed());
      } else if (n < this.seeds.length) { // shrink: drop extras
        this.seeds.length = n;
      }
      this.target = n; this._compute();
    }, (v) => String(v | 0)));

    host.appendChild(slider("DRIFT", 0, 3, this.drift, 0.05, (v) => (this.drift = v)));

    host.appendChild(slider("LEAD WIDTH", 0.5, 6, this.lead, 0.1, (v) => (this.lead = v),
      (v) => (+v).toFixed(1)));

    host.appendChild(buttonRow([
      { label: "다시 깨기 (Reshatter)", on: () => { this.scatter(); this._compute(); } },
    ]));
  }
}
