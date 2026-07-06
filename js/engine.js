// ============================================================================
//  engine.js — shared substrate for every art piece.
//  A Piece owns one canvas, a RAF loop, pointer state, and HiDPI sizing.
//  Subclasses implement setup(), frame(dt, t), and optionally controls().
//  The gallery calls mount()/unmount(); only the active piece ever renders.
// ============================================================================

export class Piece {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;                 // { accent, sound, mono? }
    this.accent = opts.accent || "#c8b6ff";
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0; this.h = 0;           // CSS pixels
    this.t = 0;                       // seconds since mount
    this._raf = 0;
    this._last = 0;
    this._running = false;
    this.pointer = { x: 0, y: 0, px: 0, py: 0, down: false, vx: 0, vy: 0, active: false };
    this._listeners = [];
    this._onResize = this._onResize.bind(this);
    this._loop = this._loop.bind(this);
  }

  // ---- lifecycle -----------------------------------------------------------
  mount() {
    this._resize();
    this._bindPointer();
    window.addEventListener("resize", this._onResize);
    this.setup();
    this._running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
    return this;
  }

  unmount() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    for (const [el, ev, fn, o] of this._listeners) el.removeEventListener(ev, fn, o);
    this._listeners.length = 0;
    if (this.teardown) this.teardown();
  }

  on(el, ev, fn, o) { el.addEventListener(ev, fn, o); this._listeners.push([el, ev, fn, o]); }

  // ---- loop ----------------------------------------------------------------
  _loop(now) {
    if (!this._running) return;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;          // clamp after tab-switch
    this.t += dt;
    // decay pointer velocity so "wind" eases out when still
    this.pointer.vx *= 0.85; this.pointer.vy *= 0.85;
    this.frame(dt, this.t);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ---- sizing --------------------------------------------------------------
  _onResize() { this._resize(); if (this.onResize) this.onResize(); }
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  // ---- pointer -------------------------------------------------------------
  _bindPointer() {
    const c = this.canvas;
    const setPos = (e) => {
      const r = c.getBoundingClientRect();
      const p = (e.touches ? e.touches[0] : e);
      const x = p.clientX - r.left, y = p.clientY - r.top;
      this.pointer.vx = x - this.pointer.x;
      this.pointer.vy = y - this.pointer.y;
      this.pointer.px = this.pointer.x; this.pointer.py = this.pointer.y;
      this.pointer.x = x; this.pointer.y = y;
      this.pointer.active = true;
    };
    this.on(c, "pointermove", setPos);
    this.on(c, "pointerdown", (e) => { setPos(e); this.pointer.down = true; if (this.onPointerDown) this.onPointerDown(); });
    this.on(window, "pointerup", () => { this.pointer.down = false; if (this.onPointerUp) this.onPointerUp(); });
    this.on(c, "pointerleave", () => { this.pointer.active = false; });
  }

  // ---- helpers -------------------------------------------------------------
  ctx2d() {
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  // subclasses override:
  setup() {}
  frame(/* dt, t */) {}
  // controls(host) {}   // optional — build DOM controls into host
}

// ---- math / colour utils ---------------------------------------------------
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const map = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// HSL string helper
export const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Cheap 2D value-noise (smooth, seedless-enough for visuals).
export function makeNoise() {
  const p = new Uint8Array(512);
  const perm = [];
  for (let i = 0; i < 256; i++) perm[i] = i;
  // deterministic shuffle (xorshift) so each load is stable but varied enough
  let s = 1234567;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000) / 1000; };
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => { const u = h & 1 ? x : -x, v = h & 2 ? y : -y; return u + v; };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    const n = lerp(
      lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u),
      lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u),
      v
    );
    return n; // ~[-1,1]
  };
}
