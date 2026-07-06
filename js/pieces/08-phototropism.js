// ============================================================================
//  08 · Phototropism — a plant that actually GROWS toward the light.
//  Not a pre-baked L-system: living tips crawl forward a little each step,
//  bending toward the light source (the pointer). Tips branch as they age and
//  die when their energy runs out, so the canopy reaches wherever you hold the
//  light — move it and new growth curves to follow. The woody trail each tip
//  leaves is stamped ONCE into an offscreen buffer (so thousands of past
//  segments cost nothing to redraw); only the handful of live tips glow.
// ============================================================================

import { Piece, TAU, lerp, clamp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Phototropism extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.phototropism = 0.18;   // how hard tips steer toward the light (0..0.5)
    this.branchRate = 0.032;    // chance per step a tip splits into two
    this.growthSpeed = 3.4;     // forward cells per growth step
    this.maxTips = 200;         // hard ceiling on simultaneous living tips
    this.wander = 0.20;         // random heading wobble (organic, not ruler-straight)
    this.seedEnergy = 18.4;     // a seedling tip's energy budget — large, so the plant keeps growing for a long time (~2× the previous lifespan)
    this.accentRgb = hexToRgb("#8cffaa");
    this._buildTrunkBuffer();
    this.plant();
  }

  // offscreen buffer that accumulates every woody segment ever drawn. Drawn to
  // ONCE per new segment, blitted whole each frame — so the cost per frame is
  // O(live tips), not O(all segments). This is what keeps it fast as it fills.
  _buildTrunkBuffer() {
    this.trunk = document.createElement("canvas");
    this.trunk.width = this.canvas.width;
    this.trunk.height = this.canvas.height;
    this.tctx = this.trunk.getContext("2d");
  }

  onResize() {
    this._buildTrunkBuffer();
    this.plant();
  }

  // (re)start the plant: clear the trunk buffer, sprout a few seedling tips from
  // the soil line, each pointing roughly up.
  plant() {
    this.tctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.tctx.clearRect(0, 0, this.w, this.h);
    this.tips = [];
    // every woody segment ever stamped, kept so older wood can keep THICKENING
    // over time (secondary growth) — this is what turns thin strokes into a tree
    // with a swelling trunk and chunky lower limbs instead of uniform wire.
    this.segments = [];
    this.age = 0;
    this.doneTimer = 0;
    const sprouts = 3;
    for (let i = 0; i < sprouts; i++) {
      const x = this.w * (0.5 + (i - (sprouts - 1) / 2) * 0.06);
      this.tips.push(this._makeTip(x, this.h - 12, -Math.PI / 2 + rand(-0.2, 0.2), 0, this.seedEnergy));
    }
  }

  // bias = this tip's own preferred lean away from straight-up (radians). It's
  // what makes the canopy SPREAD into a dome instead of all shooting straight up;
  // branches inherit bias ± a divergence, so the tree fans out as it deepens.
  _makeTip(x, y, ang, depth, energy, bias = 0) {
    return { x, y, ang, depth, energy, bias, width: lerp(7, 2.5, clamp(depth / 6, 0, 1)) };
  }

  // light source = pointer when present, else a slow overhead sun that drifts so
  // an idle gallery plant still leans and reaches.
  _light(t) {
    if (this.pointer.active) return { x: this.pointer.x, y: this.pointer.y };
    return { x: this.w * (0.5 + Math.sin(t * 0.25) * 0.3), y: this.h * 0.14 };
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // background: soil → sky gradient
    const bg = g.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, "#06080b");
    bg.addColorStop(1, "#090703");
    g.fillStyle = bg;
    g.fillRect(0, 0, this.w, this.h);

    const light = this._light(t);

    // --- grow: step every tip a few times per frame (frame-rate independent) --
    const steps = clamp(Math.round(dt / 0.016), 1, 3);
    for (let s = 0; s < steps; s++) this._grow(light);

    // --- secondary growth: keep thickening already-laid wood over time --------
    this._thicken(dt);

    // blit the accumulated woody structure
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.trunk, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // glowing buds at the living tips (few of them, so glow is cheap)
    g.globalCompositeOperation = "lighter";
    for (const tp of this.tips) {
      const r = clamp(tp.width * 0.9, 1.2, 6);
      const rad = g.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r * 3.2);
      rad.addColorStop(0, "rgba(190,255,210,0.95)");
      rad.addColorStop(0.4, "rgba(120,255,170,0.4)");
      rad.addColorStop(1, "rgba(120,255,170,0)");
      g.fillStyle = rad;
      g.beginPath(); g.arc(tp.x, tp.y, r * 3.2, 0, TAU); g.fill();
      g.fillStyle = "rgba(225,255,235,0.95)";
      g.beginPath(); g.arc(tp.x, tp.y, r * 0.55, 0, TAU); g.fill();
    }

    // halo on the light so the source reads
    const lr = g.createRadialGradient(light.x, light.y, 0, light.x, light.y, 100);
    lr.addColorStop(0, "rgba(180,255,200,0.12)");
    lr.addColorStop(1, "rgba(180,255,200,0)");
    g.fillStyle = lr;
    g.beginPath(); g.arc(light.x, light.y, 100, 0, TAU); g.fill();
    g.globalCompositeOperation = "source-over";

    // when growth has stopped (all tips spent), hold a beat then regrow
    if (this.tips.length === 0) {
      this.doneTimer += dt;
      if (this.doneTimer > 3.5) this.plant();
    }
    this.age += dt;
  }

  // one growth step: each tip bends toward the light, advances, stamps a woody
  // segment into the trunk buffer, maybe branches, and ages/dies.
  _grow(light) {
    if (!this.tips.length) return;
    const tg = this.tctx;
    tg.lineCap = "round";
    const next = [];

    // A real tree grows generally UPWARD and SPREADS, while the sun only TILTS
    // the whole canopy toward it. So the heading each tip wants is:
    //   straight up  +  a global lean toward the sun  +  this tip's own bias
    // The bias (carried per tip, diverging at each branch) is what fans the
    // crown into a dome; the sun-lean is a gentle global tilt, not a funnel.
    const UP = -Math.PI / 2;
    // how far the sun pulls the canopy over: based on the sun's horizontal offset
    // from centre, capped so the tree leans but never grows sideways/down.
    const sunLean = clamp((light.x - this.w * 0.5) / (this.w * 0.5), -1, 1)
                    * (0.5 + 0.5 * this.phototropism) * 1.15;

    for (const tp of this.tips) {
      const desired = UP + sunLean + tp.bias;     // this tip's target heading
      let d = desired - tp.ang;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      // steer a fraction of the way there each step (springy, not instant)
      const sensitivity = 0.12 + 0.10 * clamp(tp.energy, 0, 1);
      tp.ang += clamp(d, -0.5, 0.5) * sensitivity;
      // organic wobble so growth isn't ruler-straight
      tp.ang += (Math.random() - 0.5) * this.wander;

      const nx = tp.x + Math.cos(tp.ang) * this.growthSpeed;
      const ny = tp.y + Math.sin(tp.ang) * this.growthSpeed;

      // stamp the segment into the trunk buffer: a deeper green at the base
      // shifting to a luminous accent-green out toward the young growth. Stays
      // GREEN throughout (no brown) — thickness, not colour, conveys the trunk.
      const depthN = clamp(tp.depth / 6, 0, 1);
      const r = lerp(36, 120, depthN) | 0;
      const gr = lerp(120, 230, depthN) | 0;
      const b = lerp(72, 150, depthN) | 0;
      const w0 = Math.max(0.8, tp.width);
      tg.strokeStyle = `rgba(${r},${gr},${b},0.95)`;
      tg.lineWidth = w0;
      tg.beginPath();
      tg.moveTo(tp.x, tp.y);
      tg.lineTo(nx, ny);
      tg.stroke();

      // remember this segment so it can keep THICKENING over the plant's life
      // (secondary growth). Trunk-ward (low-depth) wood gets a much larger width
      // cap and thickens faster, so the base swells into a real trunk while the
      // young tips stay slender — and each segment grows at a slightly random
      // rate, so the bark isn't uniform.
      if (this.segments.length < 9000) {
        this.segments.push({
          x0: tp.x, y0: tp.y, x1: nx, y1: ny, depth: tp.depth, w: w0,
          wMax: lerp(15, 2.4, depthN) * rand(0.72, 1.12),
          rate: rand(0.35, 1.1) * lerp(1.0, 0.12, depthN),
        });
      }

      tp.x = nx; tp.y = ny;
      // energy cost — but tips near the light spend less (photosynthesis), so a
      // plant reaching toward the light climbs further and fills the frame.
      const distToLight = Math.hypot(light.x - nx, light.y - ny);
      const near = clamp(1 - distToLight / (this.h * 0.9), 0, 1);   // 1 at light → 0 far
      tp.energy -= 0.011 * (1 - near * 0.6);
      tp.width *= 0.994;           // taper as it grows out

      // off-screen or spent → this tip dies
      if (tp.energy <= 0 || ny < -20 || nx < -20 || nx > this.w + 20) continue;

      // branch: split into two tips whose BIAS diverges outward, so the canopy
      // opens into a spreading dome (and the new limb keeps growing on its own
      // lean). Divergence shrinks a little with depth so twigs don't splay wildly.
      if (Math.random() < this.branchRate && next.length + this.tips.length < this.maxTips) {
        const spread = rand(0.3, 0.6) * lerp(1.0, 0.55, clamp(tp.depth / 6, 0, 1));
        const childEnergy = tp.energy * 0.72;   // branches keep more energy → taller, fuller tree
        const child = this._childTip(tp, +spread, childEnergy);
        child.bias = tp.bias + spread;          // new limb leans further out
        next.push(child);
        tp.bias -= spread * 0.5;                // parent leans the other way
        tp.ang -= spread * 0.5;
        tp.energy = childEnergy;
        tp.depth++;
        tp.width *= 0.82;
      }
      next.push(tp);
    }

    // enforce the ceiling (keep the most energetic tips if we somehow overflow)
    if (next.length > this.maxTips) {
      next.sort((a, b) => b.energy - a.energy);
      next.length = this.maxTips;
    }
    this.tips = next;
  }

  // Secondary growth: each frame, advance the width of a rotating slice of the
  // stored segments toward their (randomised) cap and re-stamp them. Older /
  // lower segments swell most, so over the plant's life the base thickens into a
  // gnarled trunk while the canopy stays fine — and because each segment has its
  // own rate, the bark gains uneven, organic girth instead of a uniform stroke.
  _thicken(dt) {
    const segs = this.segments;
    if (!segs.length) return;
    const tg = this.tctx;
    tg.lineCap = "round";
    // spread the cost: re-stamp ~1/6 of the segments per frame on a rotating cursor
    const n = segs.length;
    const batch = Math.min(n, Math.max(120, Math.ceil(n / 6)));
    let cur = (this._thickCursor || 0) % n;   // mod n: cursor can be stale after a replant
    const k = dt * 60;
    for (let b = 0; b < batch; b++) {
      const sg = segs[cur];
      cur = (cur + 1) % n;
      if (!sg) continue;
      if (sg.w < sg.wMax) {
        sg.w = Math.min(sg.wMax, sg.w + sg.rate * 0.06 * k);
      } else continue;   // already at full girth — no need to redraw
      const depthN = clamp(sg.depth / 6, 0, 1);
      // thickened wood stays GREEN (a deeper, richer green at the trunk, lighter
      // accent-green in the canopy) — girth alone reads as the trunk, no brown.
      const r = lerp(36, 120, depthN) | 0;
      const gr = lerp(130, 215, depthN) | 0;
      const bl = lerp(78, 140, depthN) | 0;
      tg.strokeStyle = `rgba(${r},${gr},${bl},0.9)`;
      tg.lineWidth = sg.w;
      tg.beginPath();
      tg.moveTo(sg.x0, sg.y0);
      tg.lineTo(sg.x1, sg.y1);
      tg.stroke();
    }
    this._thickCursor = cur;
  }

  _childTip(parent, dAng, energy) {
    const c = this._makeTip(parent.x, parent.y, parent.ang + dAng, parent.depth + 1, energy, parent.bias);
    c.width = parent.width * 0.82;
    return c;
  }

  controls(host) {
    host.appendChild(slider("PHOTOTROPISM", 0, 0.45, this.phototropism, 0.01,
      (v) => (this.phototropism = v), (v) => `${(v * 100) | 0}%`));
    host.appendChild(slider("BRANCHING", 0.005, 0.06, this.branchRate, 0.001,
      (v) => (this.branchRate = v), (v) => `${(v * 1000) | 0}`));
    host.appendChild(slider("GROWTH SPEED", 1, 5, this.growthSpeed, 0.2,
      (v) => (this.growthSpeed = v), (v) => v.toFixed(1)));
    host.appendChild(buttonRow([
      { label: "다시 심기 (Replant)", on: () => this.plant() },
    ]));
  }
}
