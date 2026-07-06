// ============================================================================
//  34 · Ant Trails (개미의 길) — stigmergy / emergent shortest paths
//  A colony of tiny ants leaves the nest, searches for scattered food, and
//  through nothing but pheromone (no central plan) discovers the shortest
//  roads between nest and food. Two low-res scent grids drive everything:
//    • to-FOOD pheromone — dropped by ants carrying food on their way home;
//      foragers smell it to find their way OUT to a discovery.
//    • to-HOME pheromone — dropped by empty foragers wandering out; carriers
//      smell it to find their way BACK to the nest.
//  Both grids diffuse a touch and evaporate, so only routes that are walked
//  often enough survive — and short routes get walked more, so they brighten
//  into a self-organising glowing road network. The to-food field is painted
//  as the star: a soft accent haze tracing the colony's discovered highways.
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class AntTrails extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.accentRgb = hexToRgb(this.accent);

    // --- behaviour tuning (CSS-px units; sensing happens in grid cells) -----
    this.antCount = 420;        // ~400 tiny ants
    this.evap = 0.985;          // per-step pheromone survival (decay slider)
    this.senseDist = 9;         // grid cells the fan of 3 sensors looks ahead
    this.senseAngle = 0.55;     // radians between centre & side sensors
    this.wander = 0.22;         // random heading jitter per SECOND·step (keeps it alive)
    this.turnSpeed = 0.32;      // radians an ant rotates toward a gradient (per step)
    this.speed = 90;            // CSS px / second an ant walks
    this.deposit = 26;          // pheromone laid per second of walking
    this.depositCap = 60;       // ceiling per cell so a road can't run away
    this.eatRadius = 12;        // px: how close to "reach" food / nest

    this.foodMax = 6;
    this._alloc();
    this.reset();
  }

  // Pheromone grids live at ~1/6 of CSS resolution — coarse enough for 60fps
  // diffusion over hundreds of cells, fine enough to trace clean roads.
  _alloc() {
    this.cell = 6;                                   // px per grid cell
    this.gw = Math.max(24, Math.ceil(this.w / this.cell));
    this.gh = Math.max(18, Math.ceil(this.h / this.cell));
    const n = this.gw * this.gh;
    this.toFood = new Float32Array(n);   // laid by carriers → foragers follow OUT
    this.toHome = new Float32Array(n);   // laid by foragers → carriers follow BACK
    this._buf = new Float32Array(n);     // scratch for the diffusion pass

    // offscreen low-res canvases: we paint each pheromone field here, then
    // upscale (with smoothing) so the haze reads as a soft glow, not blocky cells.
    this.field = document.createElement("canvas");          // to-food (accent)
    this.field.width = this.gw; this.field.height = this.gh;
    this.fctx = this.field.getContext("2d");
    this.img = this.fctx.createImageData(this.gw, this.gh);

    this.fieldHome = document.createElement("canvas");      // to-home (teal)
    this.fieldHome.width = this.gw; this.fieldHome.height = this.gh;
    this.fhctx = this.fieldHome.getContext("2d");
    this.imgHome = this.fhctx.createImageData(this.gw, this.gh);
  }

  onResize() { this._alloc(); this.reset(); }

  reset() {
    this.toFood.fill(0);
    this.toHome.fill(0);
    // nest set in from the left, near mid-height, so its burrow can RADIATE in
    // every direction with room to spread before hitting a frame edge.
    this.nest = { x: this.w * 0.34, y: this.h * 0.54 };
    this.collected = 0;        // grains of food carried home (the colony's larder)
    this._deliverPulses = [];  // little sparkles when a carrier drops food at home
    this.foods = [];
    this._initNestBurrow();    // the growing underground maze of tunnels & chambers
    // seed 3 food sources spread across the upper-right field
    this.addFood(this.w * 0.74, this.h * 0.22);
    this.addFood(this.w * 0.58, this.h * 0.34);
    this.addFood(this.w * 0.86, this.h * 0.46);
    this._spawnAnts();
  }

  // ---- the NEST BURROW: a maze of tunnels that GROWS as food arrives ---------
  // The colony digs. Every few delivered grains, the burrow extends: a tunnel
  // segment branches off an existing node (biased downward, into the earth) and
  // occasionally swells into a round chamber. Over time an organic underground
  // labyrinth fans out beneath the nest entrance — a visible reward for hauling.
  _initNestBurrow() {
    // nodes: {x,y,r(chamber radius),depth}. edges: [i,j] tunnel between nodes.
    // node 0 is the surface entrance; growth proceeds downward from it.
    this.burrow = {
      nodes: [{ x: this.nest.x, y: this.nest.y, r: 6, depth: 0 }],
      edges: [],
      nextAt: 3,              // deliver this many grains to dig the next segment
    };
  }

  // extend the burrow by one tunnel (and maybe a chamber) from a chosen node.
  // Real ant nests RADIATE: galleries branch outward from the entrance in every
  // direction, fanning into a wide web of tunnels and chambers — not one shaft.
  // So we pick a low-degree node and dig a tunnel pointing OUTWARD from the nest
  // (radially), letting the maze spread broadly around the entrance.
  _growBurrow() {
    const b = this.burrow, N = b.nodes;
    // cap the maze so it stays elegant (and cheap). Once full, stop digging new
    // tunnels and instead let existing chambers slowly widen → a "maturing" nest.
    if (N.length >= 240) {
      const c = N[(Math.random() * N.length) | 0];
      if (c.r < 15) c.r += 0.5;
      return;
    }
    const cx = this.nest.x, cy = this.nest.y;
    // the colony's territory: a radius around the entrance the burrow stays
    // within, so it forms a DENSE radial web around home (like a real nest)
    // rather than long arms streaking to the frame edges. It KEEPS EXPANDING as
    // the nest grows (so the maze spreads wider, not just denser), capped only by
    // the frame so it can fill most of the field over a long session.
    const terr = Math.min(
      Math.min(this.w, this.h) * 0.92,
      90 + N.length * 5.5
    );
    // pick a parent: favour few-connection nodes that still have room to branch
    // INSIDE the territory (penalise nodes already near the territory edge), so
    // the web fills in densely instead of all branches racing outward.
    const deg = new Array(N.length).fill(0);
    for (const e of b.edges) { deg[e[0]]++; deg[e[1]]++; }
    let pick = 0, bestW = -1;
    for (let i = 0; i < N.length; i++) {
      const d = Math.hypot(N[i].x - cx, N[i].y - cy);
      const room = clamp(1 - d / terr, 0.05, 1);       // less room near the edge
      const w = (1 / (deg[i] + 1)) * (0.5 + Math.random()) * room;
      if (w > bestW) { bestW = w; pick = i; }
    }
    const p = N[pick];
    // tunnel bearing: mostly radial-outward (fans the web) but with enough spread
    // and occasional inward/tangential branches that it cross-links into a maze.
    const dFromNest = Math.hypot(p.x - cx, p.y - cy);
    const outAng = dFromNest > 12 ? Math.atan2(p.y - cy, p.x - cx) : rand(TAU);
    const ang = outAng + rand(-1.5, 1.5);              // wide ±86° fan
    const len = rand(16, 30);
    // keep the new node inside the territory disc (and on-screen)
    let nx = p.x + Math.cos(ang) * len, ny = p.y + Math.sin(ang) * len;
    const ndx = nx - cx, ndy = ny - cy, nd = Math.hypot(ndx, ndy);
    if (nd > terr) { nx = cx + ndx / nd * terr; ny = cy + ndy / nd * terr; }
    nx = clamp(nx, 12, this.w - 12);
    ny = clamp(ny, 12, this.h - 12);
    const makeChamber = Math.random() < 0.40;
    const node = { x: nx, y: ny, r: makeChamber ? rand(7, 12) : rand(2.5, 4), depth: p.depth + 1 };
    N.push(node);
    b.edges.push([pick, N.length - 1]);
  }

  _spawnAnts() {
    const n = this.antCount;
    this.ax = new Float32Array(n);   // position x (px)
    this.ay = new Float32Array(n);   // position y (px)
    this.aa = new Float32Array(n);   // heading (radians)
    this.carry = new Uint8Array(n);  // 1 = carrying food (homebound)
    this.aw = new Float32Array(n);   // wander phase / impatience timer
    // A few "lost" ants (the famous ant-mill / circular-milling failure): instead
    // of reading pheromone toward a goal, they blindly chase whatever ant is just
    // ahead of them. A clump of these spirals into a death-spiral circle — the
    // strange wanderers the colony can't quite steer. ~millFrac of the colony.
    this.lost = new Uint8Array(n);
    this._millFrac = this._millFrac ?? 0.10;
    this.lostT = new Float32Array(n);   // how long each ant has been lost (grace)
    // a fixed open spot, far from the nest & food, where the lost ants gather and
    // spiral into a visible mill before any of them can stumble onto a landmark.
    // an open patch in the lower-right — clear of the upper-half food sources,
    // the nest, and the bottom HUD/nav, so the mill stays visible and isolated.
    this._millSpot = { x: this.w * 0.80, y: this.h * 0.70 };
    for (let i = 0; i < n; i++) this._birth(i);
  }

  // (re)place an ant. Normal foragers SCATTER along the nest→food corridor (a
  // staggered two-way stream). LOST ants instead spawn as a tight cluster out in
  // an empty corner (this._millSpot) so they immediately feed each other's
  // follow-the-leader loop into a visible spinning ant-mill, far from any
  // landmark that would rescue them too soon.
  _birth(i) {
    let aim = rand(TAU);
    // decide up front whether this ant is one of the lost/milling strays.
    if (this.lost) this.lost[i] = Math.random() < this._millFrac ? 1 : 0;
    if (this.lost && this.lost[i]) {
      const ms = this._millSpot;
      this.ax[i] = ms.x + rand(-26, 26);
      this.ay[i] = ms.y + rand(-26, 26);
      this.aa[i] = aim;
      this.carry[i] = 0;
      this.aw[i] = rand(0, 4);
      if (this.lostT) this.lostT[i] = 0;
      return;
    }
    if (this.foods && this.foods.length) {
      const f = this.foods[i % this.foods.length];
      const k = rand(0, 0.75);                 // 0 = at nest … toward a food source
      this.ax[i] = lerp(this.nest.x, f.x, k) + rand(-18, 18);
      this.ay[i] = lerp(this.nest.y, f.y, k) + rand(-18, 18);
      aim = Math.atan2(f.y - this.ay[i], f.x - this.ax[i]) + rand(-0.7, 0.7);
    } else {
      this.ax[i] = this.nest.x + rand(-6, 6);
      this.ay[i] = this.nest.y + rand(-6, 6);
    }
    this.aa[i] = aim;
    this.carry[i] = 0;
    this.aw[i] = rand(0, 4);                    // staggered search-time head start
  }

  addFood(x, y) {
    if (this.foods.length >= this.foodMax) this.foods.shift();
    // each source holds a finite-ish reserve; eating it down shrinks it, and
    // when emptied a fresh patch refills so the roads keep living on their own.
    this.foods.push({ x, y, amount: 1, r: rand(13, 20) });
  }

  // click drops a NEW food source at the cursor
  onPointerDown() {
    if (!this.pointer.active) return;
    this.addFood(this.pointer.x, this.pointer.y);
  }

  // ---- grid helpers --------------------------------------------------------
  _gi(px, py) {
    let gx = (px / this.cell) | 0, gy = (py / this.cell) | 0;
    if (gx < 0) gx = 0; else if (gx >= this.gw) gx = this.gw - 1;
    if (gy < 0) gy = 0; else if (gy >= this.gh) gy = this.gh - 1;
    return gy * this.gw + gx;
  }
  // sample a scent grid at a point ahead of (x,y) along ang+off, in px space
  _sense(grid, x, y, ang, off, dist) {
    const sx = x + Math.cos(ang + off) * dist;
    const sy = y + Math.sin(ang + off) * dist;
    return grid[this._gi(sx, sy)];
  }

  // ---- ant spatial grid (for the lost/milling followers) -------------------
  // Bucket every ant into a coarse grid once per step so _antAhead can scan only
  // the local 3×3 neighbourhood instead of all N ants.
  _buildAntGrid() {
    const cs = 26;                       // bucket size (px) ≈ follower look range
    this._acs = cs;
    this._acols = Math.max(1, Math.ceil(this.w / cs));
    this._arows = Math.max(1, Math.ceil(this.h / cs));
    const buckets = this._aGrid || (this._aGrid = []);
    buckets.length = this._acols * this._arows;
    for (let k = 0; k < buckets.length; k++) buckets[k] = buckets[k] ? (buckets[k].length = 0, buckets[k]) : [];
    for (let i = 0; i < this.antCount; i++) {
      let gx = (this.ax[i] / cs) | 0, gy = (this.ay[i] / cs) | 0;
      if (gx < 0) gx = 0; else if (gx >= this._acols) gx = this._acols - 1;
      if (gy < 0) gy = 0; else if (gy >= this._arows) gy = this._arows - 1;
      buckets[gy * this._acols + gx].push(i);
    }
  }

  // nearest ant within the forward 120° cone of ant i (the one it'll chase).
  _antAhead(i, x, y, a) {
    const cs = this._acs, cols = this._acols, rows = this._arows;
    let gx = (x / cs) | 0, gy = (y / cs) | 0;
    if (gx < 0) gx = 0; else if (gx >= cols) gx = cols - 1;
    if (gy < 0) gy = 0; else if (gy >= rows) gy = rows - 1;
    const ca = Math.cos(a), sa2 = Math.sin(a);
    let best = -1, bd = Infinity;
    for (let ny = gy - 1; ny <= gy + 1; ny++) {
      if (ny < 0 || ny >= rows) continue;
      for (let nx = gx - 1; nx <= gx + 1; nx++) {
        if (nx < 0 || nx >= cols) continue;
        const bk = this._aGrid[ny * cols + nx];
        for (let bi = 0; bi < bk.length; bi++) {
          const j = bk[bi];
          if (j === i) continue;
          const dx = this.ax[j] - x, dy = this.ay[j] - y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 9) continue;                     // skip self-overlap
          // prefer following OTHER lost ants → the strays bunch into their own
          // self-feeding ring (a true ant-mill) instead of trailing the workers.
          const eff = this.lost[j] ? d2 : d2 * 4;
          if (eff > bd) continue;
          // forward cone: dot of heading with direction to j must be > 0.3
          const dl = Math.sqrt(d2);
          if ((dx * ca + dy * sa2) / dl < 0.3) continue;
          bd = eff; best = j;
        }
      }
    }
    return best;
  }

  frame(dt, t) {
    this._step(dt);
    this._evapDiffuse(dt);
    this._maintainMill();
    // age the delivery sparkles (short-lived rings at the nest)
    for (const p of this._deliverPulses) p.t += dt;
    this._deliverPulses = this._deliverPulses.filter((p) => p.t < 0.7);
    this._render(t);
  }

  // keep a visible ant-mill alive: as lost ants recover and rejoin the workers,
  // recruit fresh strays (sent back to the mill spot) until the lost count is
  // back near the target fraction. So there's always a spinning ring to watch.
  _maintainMill() {
    if (this._millFrac <= 0) return;
    const target = Math.round(this.antCount * this._millFrac);
    let lost = 0;
    for (let i = 0; i < this.antCount; i++) lost += this.lost[i];
    if (lost >= target) return;
    // recruit a few per frame (not all at once) for a natural drift
    let need = Math.min(target - lost, 2);
    for (let i = 0; i < this.antCount && need > 0; i++) {
      if (!this.lost[i] && !this.carry[i] && Math.random() < 0.5) {
        this.lost[i] = 1;
        this.lostT[i] = 0;
        const ms = this._millSpot;
        this.ax[i] = ms.x + rand(-26, 26);
        this.ay[i] = ms.y + rand(-26, 26);
        this.aa[i] = rand(TAU);
        need--;
      }
    }
  }

  _step(dt) {
    const { gw, gh, cell } = this;
    const sd = this.senseDist * cell, sa = this.senseAngle;
    // frame-rate independent turn / wander (scaled to ~60fps so ants don't spin
    // wildly in place at high fps — the old per-frame turn made them ball up).
    const fr = clamp(dt * 60, 0.5, 2);
    const ts = this.turnSpeed * fr, wob = this.wander * fr;
    const step = this.speed * dt;
    const dep = this.deposit * dt, cap = this.depositCap;
    const eat2 = this.eatRadius * this.eatRadius;
    const nx0 = this.nest.x, ny0 = this.nest.y;

    // build a coarse spatial grid of ant positions so "lost" followers can find
    // the nearest ant ahead cheaply (used only by the milling minority).
    this._buildAntGrid();

    for (let i = 0; i < this.antCount; i++) {
      let x = this.ax[i], y = this.ay[i], a = this.aa[i];
      const carrying = this.carry[i];
      // an ant FOLLOWS the grid that leads to its current goal, and LAYS the
      // opposite grid as a breadcrumb for ants going the other way.
      const trail = carrying ? this.toHome : this.toFood; // what to smell
      const lay = carrying ? this.toFood : this.toHome;   // what to drop

      // --- LOST ants: ignore the scent map entirely and just chase the ant
      //     directly ahead. With several together this self-reinforces into a
      //     slowly rotating ring (the real "ant mill" — a pheromone-blind loop).
      //     A lost ant isn't lost forever, but it must MILL FOR A WHILE first
      //     (a grace period) — only after that, if its wandering brings it close
      //     to a landmark (food or nest), does it snap out and rejoin the workers.
      //     This keeps a visible mill spinning instead of everyone recovering at
      //     once. When too few remain lost, a fresh stray is recruited (below).
      if (this.lost[i]) {
        this.lostT[i] += dt;
        if (this.lostT[i] > 7) {              // grace: spin in the mill first
          const rf = this._nearLandmark(x, y);
          if (rf) {
            this.lost[i] = 0;                 // recovered → becomes a normal ant
            a = Math.atan2(rf.y - y, rf.x - x);
          }
        }
      }
      if (this.lost[i]) {
        // still lost: chase the ant ahead (or mill). No sensing, no depositing.
        const j = this._antAhead(i, x, y, a);
        if (j >= 0) {
          const want = Math.atan2(this.ay[j] - y, this.ax[j] - x);
          let d = want - a;
          while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          a += d * 0.28 * fr;                 // chase pull — firmer, so the ring closes
        } else {
          // nobody ahead: drift back toward the mill cluster + a constant turn
          // bias, which is exactly what curls a follow-the-leader chain into a
          // closed rotating ring (the classic ant-mill).
          const ms = this._millSpot;
          const back = Math.atan2(ms.y - y, ms.x - x);
          let d = back - a;
          while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          a += d * 0.05 * fr + 0.06 * fr;     // gentle re-gather + clockwise curl
        }
        a += (Math.random() - 0.5) * wob * 0.4;
      } else {
      // 1) SENSE three points ahead and steer up-gradient
      const c = this._sense(trail, x, y, a, 0, sd);
      const l = this._sense(trail, x, y, a, -sa, sd);
      const r = this._sense(trail, x, y, a, sa, sd);
      if (c >= l && c >= r) { /* straight ahead is best */ }
      else if (l > r) a -= ts * (0.5 + 0.5 * Math.random());
      else if (r > l) a += ts * (0.5 + 0.5 * Math.random());
      else a += (Math.random() - 0.5) * ts;
      // 2) WANDER — keeps the search alive and stops lock-in on one road
      a += (Math.random() - 0.5) * wob;

      // 3) a gentle homing bias toward the goal so lost ants aren't lost forever.
      //    Carriers always know roughly where home is; foragers drift toward the
      //    nearest food only weakly (the real navigation is pheromonal).
      // homing bias toward the goal. Kept MODERATE so ants actually travel the
      // nest↔food route (pheromones refine it) instead of either orbiting one
      // spot or sticking to the nest. Carriers aim home, foragers aim at the
      // nearest food — round-tripping is what lays the two-way road network.
      // Carriers head FIRMLY home — the nest is a known fixed point, so even when
      // the to-home pheromone road hasn't formed yet a laden ant must still make
      // it back and DELIVER (otherwise every ant ends up carrying forever and the
      // larder never fills — the bug this strong bias fixes). The bias ramps up
      // the longer an ant has carried, guaranteeing eventual delivery.
      let gx, gy, bias;
      if (carrying) {
        gx = nx0; gy = ny0;
        this.aw[i] += dt;                          // time spent carrying
        bias = clamp(0.16 + this.aw[i] * 0.06, 0.16, 0.6) * fr;
      } else {
        // Foragers head OUT toward the nearest food. The bias must be strong
        // enough to escape the to-food pheromone that piles up around the nest
        // (where all carriers converge) — too weak and foragers get trapped
        // circling home and never forage again. Ramps up the longer they search.
        const f = this._nearestFood(x, y);
        if (f) {
          gx = f.x; gy = f.y;
          this.aw[i] += dt;
          bias = clamp(0.14 + this.aw[i] * 0.05, 0.14, 0.5) * fr;
        } else { gx = x; gy = y; bias = 0; }
      }
      if (bias) {
        const want = Math.atan2(gy - y, gx - x);
        let d = want - a;
        while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        a += d * bias;
      }
      }  // end non-lost steering branch

      // 4) MOVE, bouncing softly off the walls (the field is bounded)
      let mx = x + Math.cos(a) * step, my = y + Math.sin(a) * step;
      if (mx < 2) { mx = 2; a = Math.PI - a; }
      else if (mx > this.w - 2) { mx = this.w - 2; a = Math.PI - a; }
      if (my < 2) { my = 2; a = -a; }
      else if (my > this.h - 2) { my = this.h - 2; a = -a; }

      // 5) DEPOSIT a breadcrumb (capped so no single cell saturates). Lost ants
      //    lay nothing — their aimless loops must not corrupt the real road map.
      if (!this.lost[i]) {
        const di = this._gi(mx, my);
        const nv = lay[di] + dep;
        lay[di] = nv > cap ? cap : nv;
      }

      // 6) GOAL checks — lost ants just mill; they don't forage or deliver.
      if (this.lost[i]) {
        // nothing: keep wandering in their ring
      } else if (carrying) {
        const dx = mx - nx0, dy = my - ny0;
        if (dx * dx + dy * dy < eat2) {
          // home! DROP the food into the nest's larder (the colony's whole point),
          // flash a little delivery sparkle, then set off again as a fresh forager
          // AIMED back out at a food source — without this re-aim the ant just
          // circled the nest in the to-food haze and never foraged twice.
          this.carry[i] = 0;
          this.aw[i] = 0;                          // reset carry-time
          this.collected++;
          this._deliverPulses.push({ t: 0, a: rand(TAU) });
          if (this._deliverPulses.length > 24) this._deliverPulses.shift();
          // the colony DIGS: every Nth grain extends the underground maze.
          if (this.collected >= this.burrow.nextAt) {
            this._growBurrow();
            this.burrow.nextAt += 2;               // each new segment costs a bit more
          }
          const fOut = this.foods.length ? this.foods[i % this.foods.length] : null;
          a = fOut ? Math.atan2(fOut.y - my, fOut.x - mx) + rand(-0.6, 0.6)
                   : a + Math.PI + rand(-0.6, 0.6);
        }
      } else {
        const f = this._reachFood(mx, my);
        if (f) {
          // found food! pick it up, eat a nibble, head back
          this.carry[i] = 1;
          this.aw[i] = 0;                          // reset carry-time clock
          a += Math.PI + rand(-0.6, 0.6);
          f.amount -= 0.006;
          if (f.amount <= 0) {
            // depleted: relocate it so the colony keeps discovering new roads
            f.x = rand(this.w * 0.12, this.w * 0.92);
            f.y = rand(this.h * 0.10, this.h * 0.55);
            f.amount = 1; f.r = rand(13, 20);
          }
        }
      }

      this.ax[i] = mx; this.ay[i] = my; this.aa[i] = a;
    }
  }

  _nearestFood(x, y) {
    let best = null, bd = Infinity;
    for (const f of this.foods) {
      const dx = f.x - x, dy = f.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  _reachFood(x, y) {
    for (const f of this.foods) {
      const dx = f.x - x, dy = f.y - y, rr = f.r + 4;
      if (dx * dx + dy * dy < rr * rr) return f;
    }
    return null;
  }

  // is (x,y) within "recognition range" of a landmark a lost ant could latch
  // onto — a food source or the nest? Returns the landmark point, else null.
  // The range is generous (a wide visual halo) so strays reliably get rescued
  // once they drift near food or home, rather than milling forever.
  _nearLandmark(x, y) {
    const R = 38, R2 = R * R;
    let best = null, bd = R2;
    for (const f of this.foods) {
      const dx = f.x - x, dy = f.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    const dnx = this.nest.x - x, dny = this.nest.y - y;
    if (dnx * dnx + dny * dny < bd) best = this.nest;
    return best;
  }

  // evaporate (multiplicative) + a light 4-neighbour diffusion so roads have
  // soft shoulders rather than hard 1-cell lines. Frame-rate independent decay.
  _evapDiffuse(dt) {
    const ev = Math.pow(this.evap, dt * 60);   // normalise decay to ~60fps
    const { gw, gh } = this;
    for (const grid of [this.toFood, this.toHome]) {
      const buf = this._buf;
      for (let y = 0; y < gh; y++) {
        const yo = y * gw, ym = (y > 0 ? y - 1 : 0) * gw, yp = (y < gh - 1 ? y + 1 : gh - 1) * gw;
        for (let x = 0; x < gw; x++) {
          const xm = x > 0 ? x - 1 : 0, xp = x < gw - 1 ? x + 1 : gw - 1;
          const c = grid[yo + x];
          // 60% stay, 10% from each of 4 neighbours (mild blur), then evaporate
          const s = c * 0.6 + (grid[yo + xm] + grid[yo + xp] + grid[ym + x] + grid[yp + x]) * 0.1;
          buf[yo + x] = s * ev;
        }
      }
      grid.set(buf);
    }
  }

  // ---- render --------------------------------------------------------------
  _render(t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // dark soil
    g.fillStyle = "#0d0b08";
    g.fillRect(0, 0, this.w, this.h);

    // 1) the pheromone roads, painted as two glowing haze layers so BOTH legs of
    //    the round-trip read: warm accent = "to food" (foragers head out on it),
    //    cool teal = "to home" (carriers follow it back). Seeing both makes the
    //    two-way traffic — out empty, back laden — legible at a glance.
    this._paintField();
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = "lighter";
    g.drawImage(this.fieldHome, 0, 0, this.w, this.h);   // return route (cooler)
    g.drawImage(this.field, 0, 0, this.w, this.h);       // outbound route (accent)
    g.globalCompositeOperation = "source-over";

    // 2) food sources — little warm clusters of berries, sized by remaining amount
    for (const f of this.foods) {
      const rr = f.r * (0.55 + 0.45 * f.amount);
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr * 1.8);
      gr.addColorStop(0, "rgba(120,210,120,0.55)");
      gr.addColorStop(1, "rgba(120,210,120,0)");
      g.fillStyle = gr;
      g.beginPath(); g.arc(f.x, f.y, rr * 1.8, 0, TAU); g.fill();
      // a few berry specks
      g.fillStyle = "#7fd06a";
      const seeds = 5;
      for (let k = 0; k < seeds; k++) {
        const ang = (k / seeds) * TAU + f.r;
        const rad = rr * 0.5 * (k % 2 ? 1 : 0.55);
        g.beginPath();
        g.arc(f.x + Math.cos(ang) * rad, f.y + Math.sin(ang) * rad, 2.4, 0, TAU);
        g.fill();
      }
    }

    // 3) the NEST + its growing underground BURROW (a maze that the colony digs
    //    as food arrives). Drawn beneath the surface mound so it reads as tunnels
    //    and chambers excavated into the soil.
    const n = this.nest;
    this._drawBurrow(g, n);

    //    surface mound with a dark entrance hole
    const mr = 22;
    const mg = g.createRadialGradient(n.x, n.y - 4, 2, n.x, n.y, mr);
    mg.addColorStop(0, "#6b5236");
    mg.addColorStop(0.7, "#3c2e1d");
    mg.addColorStop(1, "rgba(60,46,29,0)");
    g.fillStyle = mg;
    g.beginPath(); g.arc(n.x, n.y, mr, 0, TAU); g.fill();
    g.fillStyle = "#120d07";
    g.beginPath(); g.arc(n.x, n.y, 5, 0, TAU); g.fill();

    // delivery sparkles — a quick expanding ring each time food is dropped home
    for (const p of this._deliverPulses) {
      const f = p.t / 0.7;
      const rr = 6 + f * 22;
      g.strokeStyle = `rgba(159,232,138,${(1 - f) * 0.7})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(n.x, n.y, rr, 0, TAU); g.stroke();
    }

    // 4) the ants — tiny dark bodies, carriers tinted bright + a food speck.
    //    LOST (milling) ants get a faint violet glow so the strange wanderers,
    //    spiralling in their own little ring, stand out from the working column.
    const ar = this.accentRgb;
    for (let i = 0; i < this.antCount; i++) {
      const x = this.ax[i], y = this.ay[i], a = this.aa[i];
      const carrying = this.carry[i];
      const ca = Math.cos(a), sa = Math.sin(a);
      if (this.lost[i]) {
        // a confused stray: dim violet with a soft halo
        g.globalCompositeOperation = "lighter";
        g.fillStyle = "rgba(150,110,220,0.22)";
        g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "#b79be6";
        g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
      } else if (carrying) {
        // brighter body for the homebound carrier
        g.fillStyle = `rgb(${ar[0]},${ar[1]},${ar[2]})`;
        g.beginPath(); g.arc(x, y, 1.7, 0, TAU); g.fill();
        // the carried food speck, riding just ahead of the head
        g.fillStyle = "#9fe88a";
        g.beginPath(); g.arc(x + ca * 2.4, y + sa * 2.4, 1.5, 0, TAU); g.fill();
      } else {
        // tiny dark forager body with a faint highlight
        g.fillStyle = "#15110b";
        g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
        g.fillStyle = "rgba(210,190,150,0.5)";
        g.beginPath(); g.arc(x - ca * 0.8, y - sa * 0.8, 0.8, 0, TAU); g.fill();
      }
    }

    // 5) HUD — food hauled home + how big the burrow has grown, and a tiny legend
    //    for the two roads + the milling strays.
    const [hr, hg, hb] = this.accentRgb;
    g.font = "600 13px system-ui, sans-serif";
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = "#9fe88a";
    const rooms = this.burrow ? this.burrow.nodes.filter((c) => c.r >= 5).length : 0;
    g.fillText(`🌾 ${this.collected} 운반   ·   🕳 굴 ${rooms}칸`, 18, this.h - 46);
    // legend dots
    g.font = "500 11px system-ui, sans-serif";
    g.fillStyle = `rgb(${hr},${hg},${hb})`;
    g.fillText("● 먹이로", 18, this.h - 28);
    g.fillStyle = "rgb(60,190,180)";
    g.fillText("● 집으로", 86, this.h - 28);
    g.fillStyle = "#b79be6";
    g.fillText("● 길 잃은 개미(맴돌이)", 154, this.h - 28);
  }

  // draw the excavated burrow: dark soil tunnels between nodes + rounded chambers,
  // with stored food grains filling the chambers as the larder grows. A subtle
  // lighter rim on each chamber gives the dug-out, hollow-in-earth look.
  _drawBurrow(g, n) {
    const b = this.burrow; if (!b) return;
    const N = b.nodes, E = b.edges;
    g.save();
    g.globalCompositeOperation = "source-over";
    g.lineCap = "round"; g.lineJoin = "round";
    // 1) soil halo around the whole burrow → reads as packed earth around tunnels
    // 2) tunnels: thick dark strokes (the hollow galleries)
    g.strokeStyle = "#0b0805";
    for (const e of E) {
      const a = N[e[0]], c = N[e[1]]; if (!a || !c) continue;
      g.lineWidth = 5.5;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke();
    }
    // faint lighter tunnel core so galleries don't read as flat black
    g.strokeStyle = "rgba(70,52,32,0.55)";
    for (const e of E) {
      const a = N[e[0]], c = N[e[1]]; if (!a || !c) continue;
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke();
    }
    // 3) chambers: dark hollow rooms with an earthy rim
    for (let i = 0; i < N.length; i++) {
      const c = N[i];
      if (c.r < 5) continue;                         // skip plain junction nodes
      const rim = g.createRadialGradient(c.x, c.y, c.r * 0.4, c.x, c.y, c.r + 2);
      rim.addColorStop(0, "#0c0905");
      rim.addColorStop(0.78, "#17110a");
      rim.addColorStop(1, "rgba(80,60,38,0.5)");
      g.fillStyle = rim;
      g.beginPath(); g.arc(c.x, c.y, c.r + 1.5, 0, TAU); g.fill();
    }
    // 4) stored grains tucked into the chambers (the larder, now living in rooms).
    //    Distribute the collected count across chambers by their capacity (~r²).
    const chambers = N.filter((c) => c.r >= 5);
    if (chambers.length) {
      let remaining = Math.min(this.collected, 260);
      const capOf = (c) => Math.max(3, Math.floor(c.r * c.r * 0.18));
      const totalCap = chambers.reduce((s, c) => s + capOf(c), 0) || 1;
      for (const c of chambers) {
        const share = Math.min(capOf(c), Math.round(remaining * capOf(c) / totalCap) + 1);
        const k = Math.min(share, remaining);
        for (let j = 0; j < k; j++) {
          // deterministic golden-angle packing inside the chamber
          const ga = j * 2.399963;
          const rad = (c.r - 2) * Math.sqrt((j + 0.5) / capOf(c));
          g.fillStyle = "#9fe88a";
          g.beginPath();
          g.arc(c.x + Math.cos(ga) * rad, c.y + Math.sin(ga) * rad, 1.3, 0, TAU);
          g.fill();
        }
        remaining -= k;
        if (remaining <= 0) break;
      }
    }
    g.restore();
  }

  // paint both pheromone fields into their low-res images with a soft gamma lift
  // so faint exploratory threads read alongside bright trunks.
  //   to-food  → warm accent glow (the outbound highways)
  //   to-home  → cool teal glow, dimmer (the laden return route back to the nest)
  _paintField() {
    const inv = 1 / this.depositCap;
    // outbound (accent)
    const gf = this.toFood, df = this.img.data;
    const [r, gg, b] = this.accentRgb;
    for (let i = 0; i < gf.length; i++) {
      const v = clamp(Math.sqrt(gf[i] * inv), 0, 1);
      const glow = v * v;
      const j = i << 2;
      df[j]     = r * v * 0.85 + glow * 90;
      df[j + 1] = gg * v * 0.85 + glow * 90;
      df[j + 2] = b * v + glow * 110;
      df[j + 3] = Math.min(255, v * 235);
    }
    this.fctx.putImageData(this.img, 0, 0);
    // return route (teal), kept dimmer so the accent road stays the star
    const gh = this.toHome, dh = this.imgHome.data;
    for (let i = 0; i < gh.length; i++) {
      const v = clamp(Math.sqrt(gh[i] * inv), 0, 1);
      const glow = v * v;
      const j = i << 2;
      dh[j]     = 40 * v + glow * 30;
      dh[j + 1] = 150 * v + glow * 70;
      dh[j + 2] = 150 * v + glow * 80;
      dh[j + 3] = Math.min(190, v * 150);
    }
    this.fhctx.putImageData(this.imgHome, 0, 0);
  }

  // dig many burrow segments at once (so the maze can be seen without waiting).
  _digMany(k) {
    for (let i = 0; i < k; i++) { this.collected += 1; this._growBurrow(); }
    this.burrow.nextAt = this.collected + 3;
  }

  controls(host) {
    host.appendChild(slider("ANTS", 80, 800, this.antCount, 20,
      (v) => { this.antCount = v | 0; this._spawnAnts(); }, (v) => String(v | 0)));
    host.appendChild(slider("EVAPORATION", 0.95, 0.999, this.evap, 0.001,
      (v) => (this.evap = v), (v) => (+v).toFixed(3)));
    host.appendChild(slider("SENSE", 4, 18, this.senseDist, 1,
      (v) => {
        this.senseDist = v;
        // wider reach also widens the sensor fan a touch, for a fuller search
        this.senseAngle = lerp(0.40, 0.75, (v - 4) / 14);
      }, (v) => String(v | 0)));
    // fraction of "lost" milling ants — the strange wanderers
    host.appendChild(slider("LOST ANTS", 0, 0.35, this._millFrac ?? 0.10, 0.01,
      (v) => { this._millFrac = v; this._spawnAnts(); }, (v) => Math.round(v * 100) + "%"));
    host.appendChild(buttonRow([
      { label: "먹이 추가 (add food)", on: () => this.addFood(rand(this.w * 0.12, this.w * 0.92), rand(this.h * 0.10, this.h * 0.60)) },
      { label: "굴 키우기 (dig)", on: () => this._digMany(12) },
      { label: "초기화 (reset)", on: () => this.reset() },
    ]));
  }
}
