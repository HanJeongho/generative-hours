// ============================================================================
//  10 · Lumen — 2D ray-casting light & shadows
//  A warm amber light source casts visibility into a scene of polygon walls.
//  We build a "visibility polygon" by casting rays at every wall endpoint
//  (plus a sliver to each side, to wrap around corners), find the nearest
//  intersection of each ray, sort the hits by angle, and connect them into a
//  light fan. Filling that fan with a radial gradient = the lit region; the
//  black background = shadow. Stacking a few jittered light samples softens
//  the shadow edges into penumbra. The light follows the cursor; drag in
//  empty space to drop new wall blocks.
// ============================================================================

import { Piece, TAU, clamp, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const BG = "#070608";              // near-black, faintly warm
const EPS = 0.0001;                // angular sliver for corner-wrapping rays

export default class Lumen extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.radius = 520;             // light reach (px)
    this.softness = 3;             // penumbra samples (1–4)
    this.wallCount = 7;            // number of polygon obstacles
    this.light = { x: this.w * 0.5, y: this.h * 0.5 };
    this.regenWalls();
    this._dragWall = null;         // wall being placed via drag
  }

  onResize() {
    // keep the light on-screen; walls are stored in absolute px so we just
    // rebuild the border segments to the new size.
    this.light.x = clamp(this.light.x, 0, this.w);
    this.light.y = clamp(this.light.y, 0, this.h);
    this._rebuildSegments();
  }

  // ---- scene ---------------------------------------------------------------
  regenWalls() {
    // Random convex blocks / triangles scattered across the canvas, avoiding
    // the centre so the opening view always has something to cast against.
    this.walls = [];
    for (let i = 0; i < this.wallCount; i++) {
      const cx = rand(this.w * 0.12, this.w * 0.88);
      const cy = rand(this.h * 0.12, this.h * 0.88);
      const r = rand(28, 80);
      const sides = (Math.random() < 0.4 ? 3 : 4 + (Math.random() * 3 | 0));
      this.walls.push(this._polyAt(cx, cy, r, sides));
    }
    this._rebuildSegments();
  }

  // build one convex polygon (array of {x,y}) around a centre
  _polyAt(cx, cy, r, sides) {
    const rot = rand(TAU);
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * TAU;
      const rr = r * rand(0.7, 1.1);       // jitter for irregular shapes
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    return pts;
  }

  // flatten polygons + the 4 screen borders into line segments + endpoints
  _rebuildSegments() {
    this.segments = [];
    const W = this.w, H = this.h;
    // screen border (so light is contained by the frame)
    const border = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    this._addPoly(border);
    for (const poly of this.walls) this._addPoly(poly);
    // unique endpoints for ray targeting
    this.points = [];
    for (const s of this.segments) { this.points.push(s.a); this.points.push(s.b); }
  }

  _addPoly(poly) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      this.segments.push({ a, b });
    }
  }

  // ---- ray casting ---------------------------------------------------------
  // Intersect a ray (origin o, angle ang) with a segment; return distance t1
  // along the ray, or null. Standard parametric line-line solve.
  _castSegment(ox, oy, dx, dy, s) {
    const ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
    const sdx = bx - ax, sdy = by - ay;
    const denom = dx * sdy - dy * sdx;
    if (Math.abs(denom) < 1e-9) return null;        // parallel
    const t2 = (dx * (ay - oy) - dy * (ax - ox)) / -denom;
    const t1 = (sdx * (oy - ay) - sdy * (ox - ax)) / denom;
    if (t1 > 0 && t2 >= 0 && t2 <= 1) return t1;    // hit on segment, ahead
    return null;
  }

  // cast one ray, return nearest hit point {x,y,ang}
  _cast(ox, oy, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = this.radius;                          // clamp reach to radius
    for (const s of this.segments) {
      const t = this._castSegment(ox, oy, dx, dy, s);
      if (t !== null && t < best) best = t;
    }
    return { x: ox + dx * best, y: oy + dy * best, ang };
  }

  // build the full visibility polygon from a light position
  _visibility(ox, oy) {
    const hits = [];
    for (const p of this.points) {
      const base = Math.atan2(p.y - oy, p.x - ox);
      // three rays: at the endpoint and a sliver to each side, so the ray
      // can slip past a corner to whatever lies behind it.
      hits.push(this._cast(ox, oy, base - EPS));
      hits.push(this._cast(ox, oy, base));
      hits.push(this._cast(ox, oy, base + EPS));
    }
    hits.sort((a, b) => a.ang - b.ang);
    return hits;
  }

  // ---- interaction ---------------------------------------------------------
  onPointerDown() {
    // begin dropping a wall at the cursor (anchor); grows while dragging
    this._dragWall = { ox: this.pointer.x, oy: this.pointer.y, poly: null };
  }
  onPointerUp() {
    // commit the dragged wall (a small block if it was just a click)
    if (this._dragWall && this._dragWall.poly) {
      this.walls.push(this._dragWall.poly);
      this._rebuildSegments();
    }
    this._dragWall = null;
  }

  // ---- render --------------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // light tracks the pointer (gentle ease toward it for a fluid feel)
    if (this.pointer.active) {
      this.light.x += (this.pointer.x - this.light.x) * 0.35;
      this.light.y += (this.pointer.y - this.light.y) * 0.35;
    } else {
      // idle drift in a slow lissajous so the piece is alive on load
      this.light.x = this.w * (0.5 + 0.32 * Math.sin(t * 0.41));
      this.light.y = this.h * (0.5 + 0.27 * Math.cos(t * 0.53));
    }
    const lx = clamp(this.light.x, 1, this.w - 1);
    const ly = clamp(this.light.y, 1, this.h - 1);

    // grow the wall being dragged (rubber-band block from anchor to cursor)
    if (this.pointer.down && this._dragWall) {
      const d = this._dragWall;
      const w = Math.abs(this.pointer.x - d.ox), h = Math.abs(this.pointer.y - d.oy);
      const cx = (d.ox + this.pointer.x) / 2, cy = (d.oy + this.pointer.y) / 2;
      const hw = Math.max(10, w / 2), hh = Math.max(10, h / 2);
      d.poly = [
        { x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh },
      ];
    }
    // include the in-progress wall in the cast set so its shadow is live
    if (this._dragWall && this._dragWall.poly) {
      this._addPoly(this._dragWall.poly);
      for (const p of this._dragWall.poly) this.points.push(p);
    }

    // 1) wipe to near-black = total shadow
    g.globalCompositeOperation = "source-over";
    g.fillStyle = BG;
    g.fillRect(0, 0, this.w, this.h);

    // 2) stack jittered light samples for soft penumbra; additive blending
    const samples = clamp(this.softness | 0, 1, 4);
    g.globalCompositeOperation = "lighter";
    const [r, gg, bb] = warmAmber(this.accent);
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.7);   // subtle flicker
    for (let i = 0; i < samples; i++) {
      // offset each sample slightly so shadow edges blur instead of being hard
      const jit = samples > 1 ? 9 : 0;
      const a = (i / samples) * TAU;
      const jx = clamp(lx + Math.cos(a) * jit, 1, this.w - 1);
      const jy = clamp(ly + Math.sin(a) * jit, 1, this.h - 1);
      const poly = this._visibility(jx, jy);
      // radial gradient: bright warm core fading to transparent at the reach
      const grad = g.createRadialGradient(jx, jy, 0, jx, jy, this.radius);
      const aMul = (breathe / samples);
      grad.addColorStop(0,    `rgba(255,248,228,${0.95 * aMul})`);   // hot white core
      grad.addColorStop(0.12, `rgba(${r},${gg},${bb},${0.85 * aMul})`);
      grad.addColorStop(0.45, `rgba(${r},${gg},${bb},${0.30 * aMul})`);
      grad.addColorStop(1,    `rgba(${r},${gg},${bb},0)`);
      g.fillStyle = grad;
      g.beginPath();
      if (poly.length) {
        g.moveTo(poly[0].x, poly[0].y);
        for (let k = 1; k < poly.length; k++) g.lineTo(poly[k].x, poly[k].y);
        g.closePath();
      }
      g.fill();
    }

    // 3) draw obstacles: dark fill so they read as solid, faint amber rim
    g.globalCompositeOperation = "source-over";
    const drawing = this._dragWall && this._dragWall.poly
      ? this.walls.concat([this._dragWall.poly]) : this.walls;
    for (const poly of drawing) {
      g.beginPath();
      g.moveTo(poly[0].x, poly[0].y);
      for (let k = 1; k < poly.length; k++) g.lineTo(poly[k].x, poly[k].y);
      g.closePath();
      g.fillStyle = "rgba(10,9,12,0.92)";
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = `rgba(${r},${gg},${bb},0.35)`;   // faint accent edge
      g.stroke();
    }

    // 4) the lamp itself: a small additive bloom at the light position
    g.globalCompositeOperation = "lighter";
    const lamp = g.createRadialGradient(lx, ly, 0, lx, ly, 26);
    lamp.addColorStop(0, "rgba(255,250,235,0.95)");
    lamp.addColorStop(1, "rgba(255,250,235,0)");
    g.fillStyle = lamp;
    g.fillRect(lx - 26, ly - 26, 52, 52);

    // restore default for safety
    g.globalCompositeOperation = "source-over";
  }

  // ---- controls ------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("LIGHT RADIUS", 200, 900, this.radius, 10,
      (v) => (this.radius = v), (v) => String(v | 0)));
    host.appendChild(slider("SOFTNESS", 1, 4, this.softness, 1,
      (v) => (this.softness = v | 0), (v) => String(v | 0)));
    host.appendChild(slider("WALL COUNT", 2, 14, this.wallCount, 1,
      (v) => { this.wallCount = v | 0; this.regenWalls(); }, (v) => String(v | 0)));
    host.appendChild(buttonRow([
      { label: "벽 재배치 (reset walls)", on: () => this.regenWalls() },
    ]));
  }
}

// Nudge the accent toward a warm amber/gold even if the gallery passes a
// cooler hue, so Lumen always glows golden.
function warmAmber(hex) {
  const h = (hex || "#ffb347").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // bias toward amber: lift red, keep green mid, suppress blue
  r = clamp(Math.round(r * 0.35 + 255 * 0.65), 0, 255);
  g = clamp(Math.round(g * 0.35 + 178 * 0.65), 0, 255);
  b = clamp(Math.round(b * 0.30 + 71 * 0.30), 0, 255);
  return [r, g, b];
}
