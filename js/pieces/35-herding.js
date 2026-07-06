// ============================================================================
//  35 · Herding (양몰이) — flocking + fear + a goal, now with an AI dog pack
//  Hundreds of tiny fluffy sheep mill about a dark pasture, gentle wanderers
//  that clump into little woolly knots (separation + cohesion). The cursor is
//  a SHEPHERD DOG the flock is afraid of: get close and they bolt, sharply
//  away from it. You turn that fear into a tool — by standing on the FAR side
//  of a stray, you nudge it toward the glowing PEN in the corner.
//  CLICK to RELEASE an AUTONOMOUS shepherd dog into the field (up to a cap).
//  Each released dog is its own little AI agent: it hunts down the stray that
//  is farthest from the pen, swings around to the FAR side of it (opposite the
//  pen), and pushes — its fear-radius drives that sheep home. When its quarry
//  is penned it re-targets the next stray. More dogs = the field comes to order
//  faster, hands-free. The cursor stays as your own manual "you" dog (brighter).
//  Sheep that cross into the pen calm down and settle; a counter fills as the
//  field orders, and when most are home the pen gives a soft celebratory pulse.
//  A uniform spatial grid keeps ~300 sheep flocking at 60fps with no per-frame
//  allocation in the hot loop; the handful of dogs cost a cheap O(dogs·sheep).
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Herding extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.accentRgb = hexToRgb(this.accent);

    // --- behaviour tuning (CSS-px units) ------------------------------------
    this.flockSize = 300;       // how many sheep (rebuild on change)
    this.skittish = 1.0;        // fear multiplier — flee strength & radius
    this.penFrac = 0.16;        // pen radius as a fraction of min(w,h)
    this.R = 34;                // neighbour radius (px) = grid cell size
    this.maxSpeed = 110;        // px/sec a sheep walks when fleeing flat-out
    this.wanderSpeed = 14;      // px/sec gentle idle drift

    this._pulse = 0;            // celebratory pulse timer (sec), >0 = glowing
    this._wasMost = false;      // edge-detect for triggering the pulse
    this.penned = 0;            // live penned count (for the counter ring)

    // --- autonomous shepherd dogs (one per click, capped) -------------------
    this.dogs = [];             // {x,y,vx,vy, tx,ty, target, state, wseed, retimer}
    this.maxDogs = 12;          // sane cap (surfaced in the HUD readout)
    this.dogR = 112;            // a dog's fear / herding radius (px) — wide sweep
    this.dogSpeed = 260;        // px/sec an AI dog can run when repositioning

    this._placePen();
    this.spawn();

    // grass texture: a scatter of faint static dots, baked once into a low-res
    // offscreen canvas and tiled up — cheap, and stable so it reads as ground.
    this._bakeGrass();
  }

  // The pen sits in the lower-right corner, a comfy fixed home.
  _placePen() {
    const r = Math.min(this.w, this.h) * this.penFrac;
    this.pen = { x: this.w - r - 26, y: this.h - r - 26, r };
  }

  spawn() {
    const n = this.flockSize | 0;
    // Structure-of-arrays so the hot loop never touches object shapes.
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.ph = new Float32Array(n);   // gait phase (leg bob / wool wobble)
    this.calm = new Float32Array(n); // 0..1 settledness while inside the pen
    for (let i = 0; i < n; i++) this._birth(i);
    this.count = n;
  }

  // scatter a sheep somewhere on the pasture, away from the pen
  _birth(i) {
    let x, y;
    do {
      x = rand(this.w * 0.02, this.w * 0.74);
      y = rand(this.h * 0.04, this.h * 0.96);
    } while (this._inPen(x, y));
    this.x[i] = x; this.y[i] = y;
    const a = rand(TAU);
    this.vx[i] = Math.cos(a) * this.wanderSpeed;
    this.vy[i] = Math.sin(a) * this.wanderSpeed;
    this.ph[i] = rand(TAU);
    this.calm[i] = 0;
  }

  _inPen(x, y) {
    const p = this.pen, dx = x - p.x, dy = y - p.y;
    return dx * dx + dy * dy < p.r * p.r;
  }

  onResize() {
    this._placePen();
    this.spawn();
    this._bakeGrass();
  }

  // "release" — fling every sheep back out to random pasture spots so you can
  // start the herd over from chaos.
  scatter() {
    for (let i = 0; i < this.count; i++) this._birth(i);
    this._wasMost = false;
  }

  // CLICK → release a new autonomous dog at the cursor (capped at maxDogs).
  onPointerDown() {
    if (this.dogs.length >= this.maxDogs) return;
    const x = this.pointer.active ? this.pointer.x : this.w * 0.4;
    const y = this.pointer.active ? this.pointer.y : this.h * 0.4;
    this.dogs.push({
      x, y, vx: 0, vy: 0,
      tx: x, ty: y,            // current steering target (point to move to)
      target: -1,              // index of the sheep this dog is working
      state: "seek",           // seek → drive
      wseed: rand(TAU),        // wander phase offset so dogs don't sync
      retimer: 0,              // re-target cooldown so it commits to a sheep
      born: this.t,            // spawn time (little pop-in animation)
    });
  }

  // recall the whole pack — every released dog leaves the field.
  recallDogs() { this.dogs.length = 0; }

  // ---- uniform spatial grid (R-sized cells) for neighbour queries -----------
  _buildGrid() {
    const cell = this.R;
    const cols = Math.max(1, Math.ceil(this.w / cell));
    const rows = Math.max(1, Math.ceil(this.h / cell));
    // reuse the bucket arrays across frames; just clear their lengths
    if (!this._grid || this._grid.length !== cols * rows) {
      this._grid = new Array(cols * rows);
      for (let k = 0; k < this._grid.length; k++) this._grid[k] = [];
    } else {
      for (let k = 0; k < this._grid.length; k++) this._grid[k].length = 0;
    }
    const grid = this._grid;
    for (let i = 0; i < this.count; i++) {
      const cx = clamp((this.x[i] / cell) | 0, 0, cols - 1);
      const cy = clamp((this.y[i] / cell) | 0, 0, rows - 1);
      grid[cy * cols + cx].push(i);
    }
    this._cols = cols; this._rows = rows; this._cell = cell;
  }

  frame(dt, t) {
    this._step(dt, t);
    this._render(t);
  }

  _step(dt, t) {
    this._buildGrid();
    const grid = this._grid, cols = this._cols, rows = this._rows, cell = this._cell;
    const R = this.R, R2 = R * R;
    const ptr = this.pointer;
    // fear radius & strength grow with skittishness; a bark (down) widens both.
    const baseR = 96 * this.skittish;
    const dogR = ptr.down ? baseR * 1.55 : baseR;
    const dogR2 = dogR * dogR;
    const dogF = (ptr.down ? 230 : 120) * this.skittish;   // px/sec² push
    const maxSp = this.maxSpeed;
    const wanderSp = this.wanderSpeed;
    const pen = this.pen, penR2 = pen.r * pen.r;

    let penned = 0;

    for (let i = 0; i < this.count; i++) {
      let x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i];
      const cx = clamp((x / cell) | 0, 0, cols - 1);
      const cy = clamp((y / cell) | 0, 0, rows - 1);

      // flocking accumulators (separation + cohesion → little woolly knots)
      let sepX = 0, sepY = 0;
      let cohX = 0, cohY = 0, cohN = 0;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= rows) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (gx < 0 || gx >= cols) continue;
          const bucket = grid[gy * cols + gx];
          for (let bi = 0; bi < bucket.length; bi++) {
            const j = bucket[bi];
            if (j === i) continue;
            const dx = x - this.x[j], dy = y - this.y[j];
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 === 0) continue;
            const inv = 1 / Math.sqrt(d2);
            sepX += dx * inv * inv; sepY += dy * inv * inv;   // push from too-close
            cohX += this.x[j]; cohY += this.y[j]; cohN++;
          }
        }
      }

      let ax = 0, ay = 0;
      // --- how PANICKED is this sheep right now? (0 = calm, 1 = bolting) ----
      // We compute the nearest dog/cursor pressure first so flocking can yield
      // to flight: a frightened sheep ABANDONS the flock and runs, which is what
      // lets a dog peel a single sheep off a woolly knot and drive it home.
      let panic = 0;
      // separation → keep a little personal space (firm, so they don't merge)
      ax += sepX * 900;
      ay += sepY * 900;

      // is this sheep home? settle it.
      const pdx = x - pen.x, pdy = y - pen.y;
      const inPen = pdx * pdx + pdy * pdy < penR2;
      let fear = 1;
      if (inPen) {
        penned++;
        // ease toward calm; calmer sheep barely react and drift to a near-stop
        this.calm[i] = Math.min(1, this.calm[i] + dt * 1.2);
        fear = 1 - this.calm[i] * 0.82;
        // a firm inward bias keeps the settled flock POOLED in the pen so newly
        // herded sheep don't leak straight back out the side they came in.
        ax += -pdx * 2.2;
        ay += -pdy * 2.2;
      } else if (this.calm[i] > 0) {
        this.calm[i] = Math.max(0, this.calm[i] - dt * 1.8);
      }

      // FEAR — bolt away from the manual dog (cursor). Sharp distance-falloff.
      if (ptr.active) {
        const dx = x - ptr.x, dy = y - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < dogR2 && d2 > 0) {
          const d = Math.sqrt(d2);
          const f = (1 - d / dogR);
          const push = f * f * dogF * fear;       // squared falloff = sharper bolt
          ax += (dx / d) * push;
          ay += (dy / d) * push;
          if (f > panic) panic = f;
        }
      }

      // FEAR — the same repulsion, now also from each autonomous AI dog. They
      // herd by exactly this mechanism: a dog parked behind a sheep pushes it
      // toward the pen. Stronger, longer push so sheep visibly BOLT from a dog
      // instead of grudgingly leaning away.
      const aiR = this.dogR * this.skittish;
      const aiR2 = aiR * aiR;
      const aiF = 480 * this.skittish;
      for (let k = 0; k < this.dogs.length; k++) {
        const dog = this.dogs[k];
        const dx = x - dog.x, dy = y - dog.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < aiR2 && d2 > 0) {
          const d = Math.sqrt(d2);
          const f = (1 - d / aiR);
          const push = f * f * aiF * fear;
          ax += (dx / d) * push;
          ay += (dy / d) * push;
          if (f > panic) panic = f;
        }
      }

      // COHESION — drift toward the local cluster centre, but a PANICKED sheep
      // (a dog is near) drops the flock instinct and runs. This is the key to
      // peeling individuals off a knot: when calm they bunch, when chased they
      // scatter toward the pen.
      if (cohN > 0) {
        const cohW = 0.9 * (1 - panic * 0.92);
        ax += (cohX / cohN - x) * cohW;
        ay += (cohY / cohN - y) * cohW;
      }

      // gentle wander — a slowly turning idle drift so the field is alive idle.
      // (tiny, so flocking/fear dominate when anything is happening)
      const wn = Math.sin(t * 0.7 + this.ph[i]) + 0.5 * Math.sin(t * 1.9 + this.ph[i] * 2.3);
      const wa = wn * 1.2 + this.ph[i];
      ax += Math.cos(wa) * 12 * (1 - panic * 0.8);
      ay += Math.sin(wa) * 12 * (1 - panic * 0.8);

      // integrate
      vx += ax * dt; vy += ay * dt;

      // damping — sheep aren't momentum machines; they trot and stop.
      const damp = inPen ? Math.pow(0.04, dt) : Math.pow(0.22, dt);
      vx *= damp; vy *= damp;

      // clamp speed: relaxed sheep walk slowly, frightened ones can sprint
      const ceil = lerp(wanderSp * 2.2, maxSp, fear);
      let sp = Math.hypot(vx, vy);
      if (sp > ceil) { const k = ceil / sp; vx *= k; vy *= k; sp = ceil; }

      // move, gently bouncing off the pasture edges
      x += vx * dt; y += vy * dt;
      if (x < 6) { x = 6; vx = Math.abs(vx) * 0.5; }
      else if (x > this.w - 6) { x = this.w - 6; vx = -Math.abs(vx) * 0.5; }
      if (y < 6) { y = 6; vy = Math.abs(vy) * 0.5; }
      else if (y > this.h - 6) { y = this.h - 6; vy = -Math.abs(vy) * 0.5; }

      // advance gait phase by distance walked (faster trot = faster bob)
      this.ph[i] += sp * dt * 0.06 + dt * 0.4;

      this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    }

    this.penned = penned;

    // advance the autonomous dog pack now that sheep have moved this frame
    this._stepDogs(dt, t);

    // celebratory pulse when MOST of the flock has come home (rising edge only)
    const most = this.count > 0 && penned >= this.count * 0.85;
    if (most && !this._wasMost) this._pulse = 1.6;
    this._wasMost = most;
    if (this._pulse > 0) this._pulse = Math.max(0, this._pulse - dt);
  }

  // ---- autonomous dog AI ----------------------------------------------------
  // Each dog is a tiny sheepdog agent. Per frame it:
  //   1. (re)picks a target — the stray sheep FARTHEST from the pen.
  //   2. computes a steering point on the FAR side of that sheep relative to
  //      the pen, offset by ~half its herding radius, so when it arrives its
  //      fear-bubble pushes the sheep straight toward home.
  //   3. drives to that point (with a little wander so it never jitters in
  //      place), and re-targets once its quarry — or most sheep nearby — is in.
  _stepDogs(dt, t) {
    const dogs = this.dogs;
    if (dogs.length === 0) return;
    const pen = this.pen, penR2 = pen.r * pen.r;
    const herdR = this.dogR * this.skittish;
    const maxSp = this.dogSpeed;

    for (let k = 0; k < dogs.length; k++) {
      const dog = dogs[k];
      dog.retimer -= dt;

      // --- choose / refresh a target stray -----------------------------------
      let tgt = dog.target;
      const tgtValid = tgt >= 0 && tgt < this.count &&
        ((this.x[tgt] - pen.x) ** 2 + (this.y[tgt] - pen.y) ** 2) >= penR2;
      // re-target when: no valid target, or the commit timer has elapsed (so it
      // re-evaluates and won't chase a sheep another dog already handled).
      if (!tgtValid || dog.retimer <= 0) {
        tgt = this._pickStray(dog, k);
        dog.target = tgt;
        dog.retimer = 0.8 + Math.random() * 0.6;   // commit ~0.8–1.4s (nimble)
      }

      if (tgt < 0) {
        // nothing left to herd — patrol slowly near the pen, hands-free idle.
        dog.state = "idle";
        const ang = t * 0.5 + dog.wseed;
        dog.tx = pen.x + Math.cos(ang) * (pen.r + 70);
        dog.ty = pen.y + Math.sin(ang) * (pen.r + 70);
      } else {
        dog.state = "drive";
        const sx = this.x[tgt], sy = this.y[tgt];
        // unit vector pen→sheep; the dog wants to be BEHIND the sheep along it
        // (i.e. on the side away from the pen) so its push aims at the pen.
        let bx = sx - pen.x, by = sy - pen.y;
        const bl = Math.hypot(bx, by) || 1;
        bx /= bl; by /= bl;
        // gentle wander on the standoff point so the dog arcs/patrols a little
        const wob = Math.sin(t * 1.3 + dog.wseed) * 0.35;
        const cos = Math.cos(wob), sin = Math.sin(wob);
        const rx = bx * cos - by * sin, ry = bx * sin + by * cos;
        // standoff ≈ just inside the herding radius so the dog presses CLOSE
        // (its fear bubble fully covers the sheep) and actively shoves it home.
        const standoff = herdR * 0.42;
        // clamp the standoff point INSIDE the pasture: if a sheep hugs an edge,
        // the "behind it" spot would fall off-screen and the dog would jam into
        // the wall (pushing the sheep the wrong way). Pulling it back in keeps
        // the dog usefully positioned and still nudges the sheep toward home.
        dog.tx = clamp(sx + rx * standoff, 14, this.w - 14);
        dog.ty = clamp(sy + ry * standoff, 14, this.h - 14);
      }

      // --- drive toward the steering point -----------------------------------
      let dx = dog.tx - dog.x, dy = dog.ty - dog.y;
      const dist = Math.hypot(dx, dy) || 1;
      // arrival easing: ramp speed down inside ~45px so it settles, not orbits
      const desired = maxSp * Math.min(1, dist / 45);
      let ux = dx / dist, uy = dy / dist;

      // --- DOG–DOG SEPARATION: keep the pack spread out so they each work a
      //     different sheep instead of bunching up on top of one another. -----
      let sepx = 0, sepy = 0;
      const sepRange = herdR * 1.15;
      for (let j = 0; j < dogs.length; j++) {
        if (j === k) continue;
        const ox = dog.x - dogs[j].x, oy = dog.y - dogs[j].y;
        const od = Math.hypot(ox, oy);
        if (od > 0 && od < sepRange) {
          const w = (1 - od / sepRange);
          sepx += (ox / od) * w; sepy += (oy / od) * w;
        }
      }
      // blend separation into the heading (strong enough to break up clumps)
      ux += sepx * 1.4; uy += sepy * 1.4;
      const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;

      // steer velocity toward desired (acceleration-limited for smooth turns)
      const accel = 10;
      dog.vx += (ux * desired - dog.vx) * Math.min(1, accel * dt);
      dog.vy += (uy * desired - dog.vy) * Math.min(1, accel * dt);

      dog.x += dog.vx * dt;
      dog.y += dog.vy * dt;
      // keep dogs on the pasture
      dog.x = clamp(dog.x, 8, this.w - 8);
      dog.y = clamp(dog.y, 8, this.h - 8);
    }
  }

  // Pick a stray for dog #k to work. A real sheepdog works the NEAREST-to-home
  // strays first — driving them the short way in, building a growing penned mass
  // (sheep already inside calm down and don't bolt back out). We also pull
  // toward sheep near THIS dog and repel sheep another dog has already claimed,
  // so the pack fans out and divides the flock instead of dogpiling one sheep.
  _pickStray(dog, k) {
    const pen = this.pen, penR2 = pen.r * pen.r;
    const dogs = this.dogs;
    const claimAvoid2 = (this.dogR * 1.3) ** 2;   // "another dog's patch" radius
    const diag = Math.hypot(this.w, this.h);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const pdx = this.x[i] - pen.x, pdy = this.y[i] - pen.y;
      const penD2 = pdx * pdx + pdy * pdy;
      if (penD2 < penR2) continue;             // already home — skip
      const penD = Math.sqrt(penD2);
      const dgx = this.x[i] - dog.x, dgy = this.y[i] - dog.y;
      const dogD = Math.hypot(dgx, dgy);
      // score: mostly "nearest to ME" so each dog works its OWN patch (the pack
      // spreads via dog–dog separation + claim avoidance, covering the whole
      // field at once), with a light pen-distance tiebreak so a dog still prefers
      // the sheep on its pen-side and sweeps it the short way home.
      let score = -(dogD / diag) - (penD / diag) * 0.35;
      // penalise sheep already inside another dog's working radius
      for (let j = 0; j < dogs.length; j++) {
        if (j === k || dogs[j].target < 0) continue;
        const tj = dogs[j].target;
        const ex = this.x[i] - this.x[tj], ey = this.y[i] - this.y[tj];
        if (ex * ex + ey * ey < claimAvoid2) { score -= 1e3; break; }
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    // fallback: if every stray was claimed, take the nearest-to-pen unpenned one
    if (best < 0) {
      let bd = Infinity;
      for (let i = 0; i < this.count; i++) {
        const pdx = this.x[i] - pen.x, pdy = this.y[i] - pen.y;
        const penD2 = pdx * pdx + pdy * pdy;
        if (penD2 < penR2) continue;
        if (penD2 < bd) { bd = penD2; best = i; }
      }
    }
    return best;
  }

  // ---- render ---------------------------------------------------------------
  _render(t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // pasture: a dark green-grey ground with the baked grass dots on top
    g.fillStyle = "#0c130d";
    g.fillRect(0, 0, this.w, this.h);
    if (this._grass) {
      g.globalAlpha = 0.5;
      g.drawImage(this._grass, 0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }

    this._drawPen(g, t);

    // sheep — draw back-to-front by y so nearer ones overlap correctly
    this._order = this._order && this._order.length === this.count
      ? this._order : (this._order = new Int32Array(this.count).map((_, i) => i));
    const ord = this._order;
    // light insertion sort on y (nearly-sorted frame-to-frame → cheap)
    for (let i = 1; i < ord.length; i++) {
      const v = ord[i], yv = this.y[v];
      let j = i - 1;
      while (j >= 0 && this.y[ord[j]] > yv) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = v;
    }
    for (let k = 0; k < ord.length; k++) this._drawSheep(g, ord[k]);

    // the autonomous AI dog pack (dimmer accent, steady herding ring)
    const herdR = this.dogR * this.skittish;
    for (let k = 0; k < this.dogs.length; k++) {
      const dog = this.dogs[k];
      const m = Math.hypot(dog.vx, dog.vy);
      const fx = m > 1 ? dog.vx / m : 0, fy = m > 1 ? dog.vy / m : 1;
      const pop = clamp((t - dog.born) / 0.4, 0, 1);   // little spawn pop-in
      this._drawDog(g, t, dog.x, dog.y, fx, fy, false, herdR, 0.55 * pop, pop);
    }

    // your own manual dog at the cursor — brighter, can BARK on press
    if (this.pointer.active) {
      const mvx = this.pointer.vx, mvy = this.pointer.vy;
      const m = Math.hypot(mvx, mvy);
      const fx = m > 0.5 ? mvx / m : 0, fy = m > 0.5 ? mvy / m : 1;
      const baseR = 96 * this.skittish;
      const ring = this.pointer.down ? baseR * 1.55 : baseR;
      this._drawDog(g, t, this.pointer.x, this.pointer.y, fx, fy,
        this.pointer.down, ring, this.pointer.down ? 0.5 : 0.18, 1, true);
    }

    this._drawHud(g);
  }

  _drawPen(g, t) {
    const p = this.pen;
    const [ar, ag, ab] = this.accentRgb;
    const pulse = this._pulse > 0 ? (0.5 + 0.5 * Math.sin(t * 14)) * (this._pulse / 1.6) : 0;

    // soft glow floor inside the gate
    const glow = g.createRadialGradient(p.x, p.y, p.r * 0.1, p.x, p.y, p.r);
    const gA = 0.10 + pulse * 0.22;
    glow.addColorStop(0, `rgba(${ar},${ag},${ab},${gA})`);
    glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
    g.fillStyle = glow;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();

    // glowing fence ring (dashed posts) — brighter during the pulse
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(${ar},${ag},${ab},${0.55 + pulse * 0.45})`;
    g.lineWidth = 2;
    g.setLineDash([7, 7]);
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.restore();

    // little fence posts around the ring
    const posts = 16;
    g.fillStyle = `rgba(${ar},${ag},${ab},0.85)`;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * TAU + t * 0.05;
      const px = p.x + Math.cos(a) * p.r, py = p.y + Math.sin(a) * p.r;
      g.beginPath(); g.arc(px, py, 1.8, 0, TAU); g.fill();
    }

    // "HOME" label
    g.fillStyle = `rgba(${ar},${ag},${ab},0.85)`;
    g.font = "600 11px system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("PEN", p.x, p.y - p.r - 12);
  }

  // a fluffy little sheep: drop shadow, a few overlapping cream wool puffs,
  // tiny dark legs that bob with the gait, and a small dark head.
  _drawSheep(g, i) {
    const x = this.x[i], y = this.y[i];
    const vx = this.vx[i], vy = this.vy[i];
    const ph = this.ph[i];
    const sp = Math.hypot(vx, vy);
    // facing: use heading if moving, else a gentle idle sway
    const dir = sp > 1 ? Math.atan2(vy, vx) : Math.sin(ph * 0.5) * 0.5;
    const fx = Math.cos(dir), fy = Math.sin(dir);

    const bob = Math.sin(ph * 3) * 0.6;        // body bob
    const legSwing = Math.sin(ph * 3);         // leg phase
    const R = 4.4;                             // base wool radius

    // ground shadow (soft ellipse)
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.ellipse(x, y + R * 0.9, R * 1.15, R * 0.5, 0, 0, TAU);
    g.fill();

    // legs — two tiny dark stubs that alternate, behind the wool
    g.strokeStyle = "#2b2620";
    g.lineWidth = 1.4; g.lineCap = "round";
    const lpx = -fy, lpy = fx;                 // perpendicular to facing
    for (const s of [1, -1]) {
      const swing = legSwing * s * 1.4;
      const bx = x - fx * R * 0.4 + lpx * s * 1.6;
      const by = y - fy * R * 0.4 + lpy * s * 1.6 + R * 0.5;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + fx * swing * 0.4, by + R * 0.85);
      g.stroke();
    }

    // wool body — a cluster of overlapping soft cream circles
    const woolBack = "#dcd6c8";
    const woolFront = "#f3eee2";
    g.fillStyle = woolBack;
    g.beginPath(); g.arc(x - fx * R * 0.6, y - R * 0.2 + bob, R * 0.95, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + fx * R * 0.1, y - R * 0.55 + bob, R * 0.9, 0, TAU); g.fill();
    g.fillStyle = woolFront;
    g.beginPath(); g.arc(x, y - R * 0.15 + bob, R, 0, TAU); g.fill();
    g.beginPath(); g.arc(x - fx * R * 0.85, y + bob, R * 0.78, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + fx * R * 0.55, y - R * 0.1 + bob, R * 0.7, 0, TAU); g.fill();

    // head — a small dark muzzle poking out the front, with two dot ears
    const hx = x + fx * R * 1.15, hy = y + fy * R * 0.55 - R * 0.1 + bob;
    g.fillStyle = "#39322a";
    g.beginPath(); g.ellipse(hx, hy, R * 0.5, R * 0.42, dir, 0, TAU); g.fill();
    // ears
    g.fillStyle = "#2b2620";
    g.beginPath(); g.arc(hx - fx * R * 0.15 + lpx * R * 0.32, hy - fy * R * 0.15 + lpy * R * 0.32, R * 0.18, 0, TAU); g.fill();
    g.beginPath(); g.arc(hx - fx * R * 0.15 - lpx * R * 0.32, hy - fy * R * 0.15 - lpy * R * 0.32, R * 0.18, 0, TAU); g.fill();
    // a tiny eye highlight
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath(); g.arc(hx + fx * R * 0.18, hy + fy * R * 0.18, 0.7, 0, TAU); g.fill();
  }

  // the shepherd dog glyph: a small dark body with triangle ears, a nose dot
  // and a little tail, ringed faintly by its herding radius so the player can
  // read its reach. Shared by the cursor dog and every autonomous AI dog.
  //   (x,y)         position
  //   (fx,fy)       facing unit vector (nose points here)
  //   down          true only for the cursor dog while barking
  //   ring          herding-radius to draw
  //   ringA         ring alpha
  //   scale         0..1 body scale (for the AI dogs' spawn pop-in)
  //   isCursor      brighten the body edge so the manual dog stands out
  _drawDog(g, t, x, y, fx, fy, down, ring, ringA, scale = 1, isCursor = false) {
    const [ar, ag, ab] = this.accentRgb;
    const lpx = -fy, lpy = fx;        // perpendicular to facing (for ears/tail)
    const s = scale;

    // herding-radius ring (bigger + brighter while barking)
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(${ar},${ag},${ab},${ringA})`;
    g.lineWidth = down ? 2 : 1;
    g.beginPath(); g.arc(x, y, ring, 0, TAU); g.stroke();
    g.restore();

    // bark burst — expanding rings on press (cursor only)
    if (down) {
      const ph = (t * 2.4) % 1;
      g.strokeStyle = `rgba(${ar},${ag},${ab},${(1 - ph) * 0.6})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 14 + ph * 40, 0, TAU); g.stroke();
    }

    // shadow
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(x, y + 7 * s, 9 * s, 4 * s, 0, 0, TAU); g.fill();

    // a little wagging tail behind the dog (opposite the nose)
    g.strokeStyle = "#23201b";
    g.lineWidth = 1.6 * s; g.lineCap = "round";
    const wag = Math.sin(t * 9 + x * 0.05) * 3 * s;   // jaunty wag
    g.beginPath();
    g.moveTo(x - fx * 6 * s, y - fy * 6 * s);
    g.lineTo(x - fx * 11 * s + lpx * wag, y - fy * 11 * s + lpy * wag);
    g.stroke();
    g.lineCap = "butt";

    // body — a compact dark form, accent-edged so it pops as "the dog"
    g.fillStyle = "#23201b";
    g.beginPath(); g.ellipse(x, y, 7.5 * s, 6 * s, 0, 0, TAU); g.fill();
    // accent collar/edge — brighter for the manual cursor dog
    g.strokeStyle = `rgba(${ar},${ag},${ab},${isCursor ? 1 : 0.7})`;
    g.lineWidth = (isCursor ? 1.7 : 1.2) * s;
    g.beginPath(); g.ellipse(x, y, 7.5 * s, 6 * s, 0, 0, TAU); g.stroke();

    // triangle ears (oriented to the perpendicular so they sit up front)
    g.fillStyle = "#23201b";
    const ex = x + fx * 4 * s, ey = y + fy * 4 * s;   // ear root toward the head
    for (const sgn of [1, -1]) {
      const bx = ex + lpx * sgn * 4 * s, by = ey + lpy * sgn * 4 * s;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + lpx * sgn * 2 * s, by + lpy * sgn * 2 * s);
      g.lineTo(bx + fx * 4 * s, by + fy * 4 * s);
      g.closePath(); g.fill();
    }

    // snout/nose dot in front (oriented toward facing)
    g.fillStyle = isCursor ? `rgb(${ar},${ag},${ab})` : `rgba(${ar},${ag},${ab},0.85)`;
    g.beginPath(); g.arc(x + fx * 8 * s, y + fy * 6 * s, 2 * s, 0, TAU); g.fill();
  }

  // a small live readout: penned / total in the accent colour, plus a ring that
  // fills with progress in the bottom-left.
  _drawHud(g) {
    const [ar, ag, ab] = this.accentRgb;
    const prog = this.count > 0 ? this.penned / this.count : 0;
    const cx = 30, cy = this.h - 30, r = 13;

    // progress ring
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    g.strokeStyle = `rgb(${ar},${ag},${ab})`;
    g.lineCap = "round";
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * prog); g.stroke();
    g.lineCap = "butt";

    // count text
    g.fillStyle = `rgb(${ar},${ag},${ab})`;
    g.font = "600 13px system-ui, sans-serif";
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(`${this.penned} / ${this.count}  penned`, cx + r + 12, cy);

    // dogs readout — N / max, dim if the pack is full
    const full = this.dogs.length >= this.maxDogs;
    g.fillStyle = full ? `rgb(${ar},${ag},${ab})`
                       : "rgba(255,255,255,0.55)";
    g.font = "500 11px system-ui, sans-serif";
    g.fillText(`dogs: ${this.dogs.length} / ${this.maxDogs}${full ? "  (full)" : ""}`,
      cx + r + 12, cy + 16);
  }

  // ---- grass texture (baked once) -------------------------------------------
  _bakeGrass() {
    const gw = Math.max(64, Math.round(this.w / 2));
    const gh = Math.max(48, Math.round(this.h / 2));
    const c = document.createElement("canvas");
    c.width = gw; c.height = gh;
    const gc = c.getContext("2d");
    const dots = Math.round((gw * gh) / 240);
    for (let i = 0; i < dots; i++) {
      const x = Math.random() * gw, y = Math.random() * gh;
      const shade = 24 + (Math.random() * 26) | 0;
      gc.fillStyle = `rgba(${shade},${shade + 22},${shade},${0.35 + Math.random() * 0.3})`;
      // tiny grass blade: a short near-vertical streak
      const len = 1.5 + Math.random() * 2.5;
      gc.fillRect(x, y, 0.8, len);
    }
    this._grass = c;
  }

  controls(host) {
    host.appendChild(slider("FLOCK SIZE", 60, 500, this.flockSize, 20,
      (v) => { this.flockSize = v | 0; this.spawn(); }, (v) => String(v | 0)));
    host.appendChild(slider("SKITTISHNESS", 0.4, 2.4, this.skittish, 0.05,
      (v) => (this.skittish = v)));
    host.appendChild(slider("PEN SIZE", 0.09, 0.28, this.penFrac, 0.01,
      (v) => { this.penFrac = v; this._placePen(); }, (v) => (+v * 100).toFixed(0)));
    host.appendChild(buttonRow([
      { label: "개 모두 회수 (recall dogs)", on: () => this.recallDogs() },
      { label: "양 풀어주기 (release sheep)", on: () => this.scatter() },
    ]));
  }
}
