// ============================================================================
//  03 · Liquid Light — metaballs + iso-surface glow
//  A handful of soft "blobs" drift and bounce inside the frame. We sum an
//  inverse-square field f(x,y)=Σ r²/dist² on a coarse grid; wherever two
//  blobs overlap their fields ADD, so they swell, fuse into one liquid mass,
//  then split as they part. A smooth tonemap turns the field into a glowing
//  sky-blue body with a near-white core and a thin bright iso-edge.
//  Field is simulated on a downscaled buffer, then upscaled (smoothing on).
// ============================================================================

import { Piece, clamp, lerp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class LiquidLight extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.cell = 7;             // device px per field sample (lower = sharper, slower)
    this.threshold = 1.0;      // iso level: field value that counts as "surface"
    this.count = 8;            // number of blobs
    this.flow = 1.0;           // global speed multiplier
    this.accentRgb = hexToRgb(this.accent || "#4fb8ff");
    this._alloc();
    this.spawn();
  }

  // (re)build the coarse field grid + offscreen upscale buffer in DEVICE px
  _alloc() {
    const W = this.canvas.width, H = this.canvas.height;
    this.gw = Math.max(2, Math.ceil(W / this.cell));
    this.gh = Math.max(2, Math.ceil(H / this.cell));
    this.field = new Float32Array(this.gw * this.gh);
    this.img = this.ctx.createImageData(this.gw, this.gh);
    // offscreen low-res canvas; we let drawImage do the smooth upscale
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
  }

  onResize() {
    this._alloc();
    // keep blobs inside the new bounds (positions are in CSS px)
    for (const b of this.blobs) {
      b.x = clamp(b.x, b.r, this.w - b.r);
      b.y = clamp(b.y, b.r, this.h - b.r);
    }
  }

  // seed N blobs with random position, radius and gentle velocity
  spawn() {
    this.blobs = [];
    const minR = Math.min(this.w, this.h);
    for (let i = 0; i < this.count; i++) {
      const r = rand(minR * 0.07, minR * 0.15);
      this.blobs.push({
        x: rand(r, this.w - r),
        y: rand(r, this.h - r),
        r,
        vx: rand(-22, 22),
        vy: rand(-22, 22),
      });
    }
    this.dragged = null;
  }

  // grab the blob nearest the pointer so the user can sling it around
  onPointerDown() {
    let best = null, bd = Infinity;
    for (const b of this.blobs) {
      const d = (b.x - this.pointer.x) ** 2 + (b.y - this.pointer.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    this.dragged = best;
  }
  onPointerUp() { this.dragged = null; }

  // advance blob physics (CSS px), then rebuild + paint the field
  frame(dt, t) {
    const sp = this.flow;
    for (const b of this.blobs) {
      if (b === this.dragged && this.pointer.down) {
        // ease the dragged blob toward the cursor and inherit its velocity
        b.x = lerp(b.x, this.pointer.x, 0.35);
        b.y = lerp(b.y, this.pointer.y, 0.35);
        b.vx = this.pointer.vx * 6; b.vy = this.pointer.vy * 6;
        continue;
      }
      b.x += b.vx * dt * sp;
      b.y += b.vy * dt * sp;
      // soft bounce off the walls
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      else if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      else if (b.y > this.h - b.r) { b.y = this.h - b.r; b.vy = -Math.abs(b.vy); }
    }
    // keep the blob count in sync with the slider (cheap add/remove)
    while (this.blobs.length < this.count) {
      const r = rand(Math.min(this.w, this.h) * 0.07, Math.min(this.w, this.h) * 0.15);
      this.blobs.push({ x: rand(r, this.w - r), y: rand(r, this.h - r), r, vx: rand(-22, 22), vy: rand(-22, 22) });
    }
    while (this.blobs.length > this.count) this.blobs.pop();

    this._computeField();
    this._render(t);
  }

  // sum the inverse-square field of every blob (plus a faint cursor blob)
  // into the coarse grid. Working in device px keeps grid<->canvas aligned.
  _computeField() {
    const { field, gw, gh, cell, dpr } = this;
    field.fill(0);
    // precompute blob centres/radii in DEVICE px once per frame
    const bs = this.blobs;
    const cx = new Float32Array(bs.length), cy = new Float32Array(bs.length), r2 = new Float32Array(bs.length);
    for (let i = 0; i < bs.length; i++) {
      cx[i] = bs[i].x * dpr; cy[i] = bs[i].y * dpr;
      r2[i] = (bs[i].r * dpr) ** 2;
    }
    // optional hover blob: a soft cursor presence while not dragging
    const hover = this.pointer.active && !this.pointer.down;
    const hx = this.pointer.x * dpr, hy = this.pointer.y * dpr;
    const hr2 = (Math.min(this.w, this.h) * 0.06 * dpr) ** 2;

    for (let gy = 0; gy < gh; gy++) {
      const py = (gy + 0.5) * cell;
      for (let gx = 0; gx < gw; gx++) {
        const px = (gx + 0.5) * cell;
        let f = 0;
        for (let i = 0; i < bs.length; i++) {
          const dx = px - cx[i], dy = py - cy[i];
          f += r2[i] / (dx * dx + dy * dy + 1);   // +1 avoids /0 at centre
        }
        if (hover) {
          const dx = px - hx, dy = py - hy;
          f += hr2 / (dx * dx + dy * dy + 1) * 0.6;
        }
        field[gy * gw + gx] = f;
      }
    }
  }

  // tonemap the field into glowing pixels, then upscale the small buffer.
  _render(t) {
    const { field, img, gw, gh, threshold } = this;
    const d = img.data;
    const [ar, ag, ab] = this.accentRgb;
    // animate the edge band slightly so the surface shimmers like liquid
    const edgeW = 0.16;
    for (let i = 0; i < field.length; i++) {
      const f = field[i];
      const j = i * 4;
      // normalise around the iso threshold → t01 in [0,1] inside the mass
      const t01 = clamp(f / threshold, 0, 2);
      // smooth "inside" mask: 0 outside, ramps up across the surface
      const inside = clamp((t01 - 0.55) / 0.85, 0, 1);
      const glow = inside * inside;            // body falloff
      const core = clamp((t01 - 1.25), 0, 1);  // bright near-white core
      // thin bright iso-edge: a spike where the field crosses ~threshold
      const edge = Math.exp(-((t01 - 1.0) ** 2) / (edgeW * edgeW));
      // compose: near-black bg → accent body → white core → edge highlight
      const cr = core * core * 255, cg = core * core * 245, cb = core * core * 200;
      d[j]     = 4  + ar * glow * 0.85 + cr + edge * 180;
      d[j + 1] = 8  + ag * glow * 0.95 + cg + edge * 200;
      d[j + 2] = 14 + ab * glow + cb + edge * 220;
      d[j + 3] = 255;
    }
    this.bctx.putImageData(img, 0, 0);

    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);          // identity: draw in device px
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#030308";                    // near-black wash
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // smooth upscale gives the soft liquid gradient between coarse samples
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.globalCompositeOperation = "lighter";     // additive glow over the wash
    g.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
    g.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("THRESHOLD", 0.5, 2.2, this.threshold, 0.05,
      (v) => (this.threshold = v)));
    host.appendChild(slider("BLOB COUNT", 3, 14, this.count, 1,
      (v) => (this.count = v | 0), (v) => String(v | 0)));
    host.appendChild(slider("FLOW", 0.0, 2.5, this.flow, 0.05,
      (v) => (this.flow = v)));
    host.appendChild(buttonRow([
      { label: "재생성", on: () => this.spawn() },
    ]));
  }
}
