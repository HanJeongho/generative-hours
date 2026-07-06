// ============================================================================
//  36 · 작은 행렬 (Little Pilgrims) — a Lemmings/Pikmin toy
//  Hundreds of tiny pixel walkers spill out of a door on the left and trundle
//  rightward, blindly: they fall with gravity, climb little steps, turn around
//  at steep walls, and tumble off ledges. YOU sculpt the TERRAIN with the
//  cursor — drag to BUILD ground (raise a ramp/bridge) or, in dig mode, to
//  CARVE it away — guiding the parade safely to the goal door on the right.
//  Terrain is a per-column heightfield; physics reads/writes that column array.
//
//  FUN LAYER:
//   · HAZARDS — a LAVA pit (fall in → lost, with a cute poof) and a SPIKE patch
//     on the surface (cross uncovered → lost). Build ground to bridge/cover them.
//   · COINS — glowing gems on the terrain; a walker passing over grabs it → +점수.
//   · QUOTA — save N to win; reaching it fires a confetti celebration.
//   · BLOCKER — toggle the ability, click a walker → it freezes and the others
//     turn around at it (classic Lemmings). Use it to herd the parade.
//   · little hops, a flag-bearing leader, and a fresh level layout every reset.
// ============================================================================

import { Piece, TAU, clamp, lerp, rand, hexToRgb, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const COL_W = 4;          // terrain column width in CSS px (coarse, chunky)
const MAX_POP = 260;      // hard cap on live walkers
const GRAV = 900;         // px/s² gravity
const WALK = 46;          // walk speed px/s
const STEP_UP = 9;        // max ledge height a walker can climb in one go (px)
const SAFE_FALL = 140;    // fall further than this and they respawn (gentle, no gore)
const QUOTA = 30;         // save this many to WIN the level
const BLOCKER_R = 9;      // pick radius (px) when clicking to place a blocker

export default class TinyParade extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();
    this.accent = this.opts.accent || "#a8d8b0";
    [this.ar, this.ag, this.ab] = hexToRgb(this.accent);

    this.flow = 1.0;          // spawn-rate multiplier (slider)
    this.brush = 34;          // terrain edit radius px (slider)
    this.digMode = false;     // false = build (raise), true = dig (lower)
    this.blockerMode = false;  // when on, clicking a walker freezes it as a blocker

    this.walkers = [];
    this.pops = [];           // happy "saved!" pop animations {x,y,life}
    this.poofs = [];          // "lost" puffs {x,y,life}
    this.confetti = [];       // win-celebration dots
    this.saved = 0;
    this.lost = 0;
    this.score = 0;
    this.won = false;
    this.winTimer = 0;
    this.spawnAcc = 0;
    this._leaderSpawned = false;

    this._newLevel();
    this._fillBg();
  }

  // ---- level / terrain ------------------------------------------------------
  // Build a fresh terrain seed + hazard + coin layout. Called on setup & reset.
  _newLevel() {
    this._seed = rand(1000);                    // varies the noise sampling
    this._buildTerrain();
    this._placeHazards();
    this._placeCoins();
  }

  // ground[i] = ground SURFACE y (CSS px) for column i. Lower y = taller hill.
  _buildTerrain() {
    this.ncols = Math.max(2, Math.ceil(this.w / COL_W));
    this.ground = new Float32Array(this.ncols);
    const base = this.h * 0.72;                 // baseline ground level
    const amp = this.h * 0.12;
    const seed = this._seed || 0;
    for (let i = 0; i < this.ncols; i++) {
      const x = i * COL_W;
      // gentle rolling hills from layered value-noise
      const n = this.noise(x * 0.0021 + seed, 11.3) * 0.7 + this.noise(x * 0.0067 + seed, 4.1) * 0.3;
      this.ground[i] = clamp(base - n * amp, this.h * 0.30, this.h - 18);
    }
    // doors: spawn (left) and goal (right), each sits on its column's surface
    this.spawnX = Math.min(38, this.w * 0.07);
    this.goalX = this.w - Math.min(44, this.w * 0.08);
    this._minGround = this.h * 0.18;            // can't dig higher than this (open sky)
    this._floor = this.h - 6;                   // can't dig below the very bottom
  }

  // A LAVA pit: carve a low trench in the mid-field; walkers below its rim die.
  // A SPIKE patch: a surface band that's lethal until the player covers it.
  _placeHazards() {
    // lava pit — a rectangle of "danger air" in a carved trench, left-of-centre
    const px = clamp(this.w * (0.34 + rand(-0.04, 0.04)), 120, this.w - 200);
    const pw = clamp(this.w * 0.11, 56, 120);
    this.lava = { x0: px, x1: px + pw, top: 0 };
    // dig the trench so it reads as a pit, and remember the lethal surface line
    const i0 = this._colAt(px), i1 = this._colAt(px + pw);
    let rim = 0;
    for (let i = i0; i <= i1; i++) rim = Math.max(rim, this.ground[i]);
    const lavaY = clamp(rim + this.h * 0.10, 0, this._floor);
    for (let i = i0; i <= i1; i++) this.ground[i] = lavaY;
    this.lava.top = lavaY - 4;                  // lethal line sits just above floor of pit

    // spike patch — a surface band right-of-centre, lethal at ground level.
    // Record the original surface line under the patch; spikes are lethal only
    // while a walker treads at/near that line. BUILD a bridge ~one body-height
    // ABOVE it and walkers stroll over safely (the teeth hide where covered).
    const sx = clamp(this.w * (0.62 + rand(-0.03, 0.03)), px + pw + 80, this.w - 120);
    const sw = clamp(this.w * 0.08, 40, 90);
    const si0 = this._colAt(sx), si1 = this._colAt(sx + sw);
    // FLATTEN the patch to a single surface line so it reads as one hazard strip,
    // and store THAT line as baseY — walkers tread exactly here, so the lethal
    // test and the drawn teeth share one ground truth.
    let base = 0;
    for (let i = si0; i <= si1; i++) base += this.ground[i];
    base = base / (si1 - si0 + 1);
    for (let i = si0; i <= si1; i++) this.ground[i] = base;
    this.spikes = { x0: sx, x1: sx + sw, active: true, baseY: base, coverGap: 10 };
  }

  // glowing coins resting on the surface across the field
  _placeCoins() {
    this.coins = [];
    const n = 7 + (rand(4) | 0);
    for (let c = 0; c < n; c++) {
      const x = lerp(this.spawnX + 60, this.goalX - 50, (c + rand(0.2, 0.8)) / n);
      // skip coins sitting over the lava mouth (unreachable-by-default)
      if (this.lava && x > this.lava.x0 - 8 && x < this.lava.x1 + 8) continue;
      this.coins.push({ x, y: this._groundAt(x) - 9, got: 0, ph: rand(TAU) });
    }
  }

  _colAt(x) { return clamp((x / COL_W) | 0, 0, this.ncols - 1); }
  _groundAt(x) { return this.ground[this._colAt(x)]; }

  // is this surface-x currently lethal? Spikes are deadly only while the walking
  // surface sits near the original spike line. Build a bridge at least `coverGap`
  // px ABOVE that line (smaller y) and the patch is covered → safe to cross.
  _spikeLethalAt(x) {
    const s = this.spikes;
    if (!s || !s.active) return false;
    if (x < s.x0 || x > s.x1) return false;
    return this._groundAt(x) > s.baseY - s.coverGap;   // surface still down at the teeth
  }

  // ---- background -----------------------------------------------------------
  _fillBg() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#0a0c10";
    g.fillRect(0, 0, this.w, this.h);
  }

  onResize() {
    this._buildTerrain();
    this._placeHazards();
    this._placeCoins();
    this.walkers.length = 0;
    this.pops.length = 0;
    this.poofs.length = 0;
    this.confetti.length = 0;
    this._leaderSpawned = false;
  }

  // ---- walkers --------------------------------------------------------------
  _spawn() {
    if (this.walkers.length >= MAX_POP) return;
    const gy = this._groundAt(this.spawnX);
    const leader = !this._leaderSpawned;        // very first walker carries the flag
    this._leaderSpawned = true;
    this.walkers.push({
      x: this.spawnX + rand(-2, 2),
      y: gy - 5,
      vy: 0,
      dir: 1,                       // +1 right, -1 left
      grounded: true,
      ph: rand(TAU),                // walk-cycle phase (leg bob)
      fall: 0,                      // distance fallen while airborne
      hue: rand(-18, 18),           // tiny per-walker colour variety
      hop: 0,                       // >0 = mid little-hop (visual lift)
      hopCd: rand(2, 6),            // countdown to next spontaneous hop
      blocker: false,               // frozen pillar that turns others around
      leader,
    });
  }

  // edit the heightfield under the cursor: raise (build) or lower (dig)
  _editTerrain() {
    const ptr = this.pointer;
    const cx = ptr.x;
    const r = this.brush;
    const i0 = this._colAt(cx - r), i1 = this._colAt(cx + r);
    for (let i = i0; i <= i1; i++) {
      const x = i * COL_W;
      const d = Math.abs(x - cx);
      if (d > r) continue;
      const falloff = 1 - d / r;                 // 1 at centre → 0 at edge
      const targetY = ptr.y;                     // sculpt toward cursor height
      if (this.digMode) {
        // dig: pull surface DOWN toward cursor (only if cursor is below surface)
        if (targetY > this.ground[i]) {
          this.ground[i] = clamp(lerp(this.ground[i], targetY, falloff * 0.5),
                                 this._minGround, this._floor);
        } else {
          // also let dig erode toward the floor when scrubbing into a hill
          this.ground[i] = clamp(this.ground[i] + falloff * 3.2, this._minGround, this._floor);
        }
      } else {
        // build: raise surface UP toward cursor (only if cursor is above surface)
        const goal = Math.min(targetY, this.ground[i]);
        this.ground[i] = clamp(lerp(this.ground[i], goal, falloff * 0.55),
                               this._minGround, this._floor);
      }
    }
  }

  // click a walker (in blocker mode) → freeze it into a turning post
  onPointerDown() {
    if (!this.blockerMode) return;
    const ptr = this.pointer;
    let best = -1, bestD = BLOCKER_R * BLOCKER_R;
    for (let k = 0; k < this.walkers.length; k++) {
      const w = this.walkers[k];
      const dx = w.x - ptr.x, dy = w.y - ptr.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best >= 0) {
      const w = this.walkers[best];
      w.blocker = !w.blocker;                    // toggle so a mis-click is undoable
      w.grounded = true; w.vy = 0; w.fall = 0;
    }
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // terrain edit while pressed (blocker placement is a click, not a drag)
    if (this.pointer.down && this.pointer.active && !this.blockerMode) this._editTerrain();

    // spawn from the left door at FLOW rate (stop once we've already won)
    if (!this.won) {
      this.spawnAcc += dt * this.flow * 4.5;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this._spawn(); }
    }

    const step = clamp(dt, 0, 0.05);
    this._update(step, t);

    // ---- draw -----------------------------------------------------------
    this._drawBg(t);
    this._drawTerrain();
    this._drawHazards(t);
    this._drawCoins(t);
    this._drawDoors(t);
    for (let i = 0; i < this.walkers.length; i++) this._drawWalker(g, this.walkers[i], t);
    this._drawPops(g, step);
    this._drawPoofs(g, step);
    this._drawConfetti(g, step);
    this._drawHud(g);
    this._drawBrush(g);
  }

  _checkWin() {
    if (this.won || this.saved < QUOTA) return;
    this.won = true;
    this.winTimer = 4.5;
    // burst of confetti from across the top
    for (let i = 0; i < 120; i++) {
      const x = rand(this.w);
      this.confetti.push({
        x, y: rand(-20, this.h * 0.3),
        vx: rand(-40, 40), vy: rand(20, 120),
        rot: rand(TAU), vr: rand(-6, 6),
        hue: rand(360), life: 1,
      });
    }
  }

  _update(dt, t) {
    if (this.won) this.winTimer -= dt;
    const ws = this.walkers;
    for (let k = ws.length - 1; k >= 0; k--) {
      const w = ws[k];

      // a blocker stands its post bobbing — but it still OBEYS GRAVITY: if you
      // dig the ground out from under it, it drops with the terrain and keeps
      // blocking from wherever it lands (it doesn't hover in mid-air). It only
      // stays put horizontally (never walks) so it remains a reliable turn-post.
      if (w.blocker) {
        w.ph += dt * 4;
        const surfB = this._groundAt(w.x) - 5;
        if (w.y < surfB - 0.5) {
          // ground was carved away below → fall to the new surface
          w.vy += GRAV * dt;
          w.y += w.vy * dt;
          if (w.y >= surfB) { w.y = surfB; w.vy = 0; }
        } else {
          // ground rose to/under it (built up) → sit exactly on the surface
          w.y = surfB; w.vy = 0;
        }
        // fell out of the world → it's lost like anyone else
        if (w.y > this.h + 40) this._loseWalker(w, ws, k);
        continue;
      }

      // reached the goal door? happy pop + saved++
      if (Math.abs(w.x - this.goalX) < 8 && Math.abs(w.y - (this._groundAt(this.goalX) - 5)) < 26) {
        this.pops.push({ x: this.goalX, y: this._groundAt(this.goalX) - 14, life: 1 });
        this.saved++;
        ws.splice(k, 1);
        this._checkWin();
        continue;
      }

      // spike patch — exposed spikes underfoot are lethal (cute poof, lost++)
      if (w.grounded && this._spikeLethalAt(w.x)) {
        this._loseWalker(w, ws, k);
        continue;
      }

      // coin pickup — grounded walker passing over an uncollected coin
      if (w.grounded && this.coins) {
        for (let c = 0; c < this.coins.length; c++) {
          const co = this.coins[c];
          if (co.got) continue;
          if (Math.abs(co.x - w.x) < 6 && Math.abs(co.y - w.y) < 14) {
            co.got = 1; co.life = 1;            // start the collected sparkle
            this.score += 10;
          }
        }
      }

      const surf = this._groundAt(w.x);

      // little spontaneous hop while strolling
      if (w.grounded) {
        w.hopCd -= dt;
        if (w.hopCd <= 0 && w.hop <= 0) { w.hop = 0.34; w.hopCd = rand(3, 8); }
      }
      if (w.hop > 0) w.hop = Math.max(0, w.hop - dt);

      if (w.grounded) {
        // walk along the surface in facing direction
        const nx = w.x + w.dir * WALK * dt;
        const nxSurf = this._groundAt(nx);
        const rise = surf - nxSurf;              // +ve = ground ahead is higher
        const blocked = this._blockerAhead(w);   // a frozen pillar in the way?

        if (blocked || rise > STEP_UP) {
          // steep wall / blocker ahead → turn around
          w.dir *= -1;
        } else {
          w.x = nx;
          if (nxSurf > surf + 3) {
            // ledge / downslope ahead → step off into a fall
            w.grounded = false;
            w.vy = 0;
            w.fall = 0;
          } else {
            // climb small steps / follow slope, glued to surface
            w.y = nxSurf - 5;
          }
        }
        w.ph += dt * 9;                          // leg bob

        // bumped a side wall of the world → turn back inward
        if (w.x < this.spawnX - 2) { w.x = this.spawnX - 2; w.dir = 1; }
        else if (w.x > this.w - 4) { w.x = this.w - 4; w.dir = -1; }
      } else {
        // airborne: gravity, slight drift in facing dir, limbs flail (drawn)
        w.vy += GRAV * dt;
        const dy = w.vy * dt;
        w.y += dy;
        w.fall += dy;
        w.x += w.dir * (WALK * 0.45) * dt;

        // fell into the lava pit? → lost (poof), unless terrain now bridges it
        if (this.lava && w.x > this.lava.x0 && w.x < this.lava.x1 &&
            w.y >= this.lava.top && this._groundAt(w.x) >= this.lava.top - 2) {
          this._loseWalker(w, ws, k);
          continue;
        }

        const land = this._groundAt(w.x) - 5;
        if (w.y >= land) {
          w.y = land;
          if (w.fall > SAFE_FALL) {
            // a long tumble — gently teleport them back to the start, unharmed
            w.x = this.spawnX + rand(-2, 2);
            w.y = this._groundAt(this.spawnX) - 5;
            w.dir = 1;
          }
          w.grounded = true;
          w.vy = 0;
          w.fall = 0;
        }
        // fell out of the world somehow → respawn
        if (w.y > this.h + 40) {
          w.x = this.spawnX; w.y = this._groundAt(this.spawnX) - 5;
          w.grounded = true; w.vy = 0; w.fall = 0; w.dir = 1;
        }
      }
    }
  }

  // a frozen blocker just ahead of this walker (within a small gate)?
  _blockerAhead(w) {
    const ahead = w.x + w.dir * 4;
    for (let i = 0; i < this.walkers.length; i++) {
      const b = this.walkers[i];
      if (!b.blocker) continue;
      if (Math.abs(b.x - ahead) < 4 && Math.abs(b.y - w.y) < 12) return true;
    }
    return false;
  }

  _loseWalker(w, ws, k) {
    this.poofs.push({ x: w.x, y: w.y - 2, life: 1 });
    this.lost++;
    ws.splice(k, 1);
  }

  // ---- rendering ------------------------------------------------------------
  _drawBg(t) {
    const g = this.ctx;
    // sky gradient
    const sky = g.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, "#0c0f15");
    sky.addColorStop(1, "#070a0e");
    g.fillStyle = sky;
    g.fillRect(0, 0, this.w, this.h);

    // two parallax layers of distant hills (noise silhouettes, accent-tinted dark)
    const drift = t * 6;
    this._hillLayer(g, 0.45, this.h * 0.52, this.h * 0.06, drift * 0.4, `rgba(${this.ar * 0.5 | 0},${this.ag * 0.5 | 0},${this.ab * 0.5 | 0},0.10)`);
    this._hillLayer(g, 0.30, this.h * 0.60, this.h * 0.09, drift * 0.8, `rgba(${this.ar * 0.6 | 0},${this.ag * 0.6 | 0},${this.ab * 0.6 | 0},0.16)`);
  }

  _hillLayer(g, freq, baseY, amp, off, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, this.h);
    const stepX = 14;
    for (let x = 0; x <= this.w; x += stepX) {
      const n = this.noise((x + off) * 0.0016 * (1 + freq), freq * 30);
      g.lineTo(x, baseY + n * amp);
    }
    g.lineTo(this.w, this.h);
    g.closePath();
    g.fill();
  }

  _drawTerrain() {
    const g = this.ctx;
    const ar = this.ar, ag = this.ag, ab = this.ab;
    // earthy fill: warm-dark, accent-tinted body
    const bodyR = (60 + ar * 0.18) | 0, bodyG = (52 + ag * 0.16) | 0, bodyB = (44 + ab * 0.14) | 0;
    g.beginPath();
    g.moveTo(0, this.h);
    for (let i = 0; i < this.ncols; i++) {
      const x = i * COL_W;
      g.lineTo(x, this.ground[i]);
    }
    g.lineTo(this.w, this.ground[this.ncols - 1]);
    g.lineTo(this.w, this.h);
    g.closePath();
    g.fillStyle = `rgb(${bodyR},${bodyG},${bodyB})`;
    g.fill();

    // lit top edge (accent-bright rim along the surface)
    g.beginPath();
    g.moveTo(0, this.ground[0]);
    for (let i = 1; i < this.ncols; i++) g.lineTo(i * COL_W, this.ground[i]);
    g.strokeStyle = `rgba(${clamp(ar + 50, 0, 255) | 0},${clamp(ag + 50, 0, 255) | 0},${clamp(ab + 50, 0, 255) | 0},0.85)`;
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.stroke();
  }

  // lava pit (glowing molten band at the trench floor) + exposed spike patch
  _drawHazards(t) {
    const g = this.ctx;

    if (this.lava) {
      const { x0, x1, top } = this.lava;
      const w = x1 - x0;
      const grad = g.createLinearGradient(0, top, 0, this._floor);
      grad.addColorStop(0, "rgba(255,150,40,0.95)");
      grad.addColorStop(1, "rgba(150,30,10,0.95)");
      g.fillStyle = grad;
      g.fillRect(x0, top, w, this._floor - top);
      // wobbling molten surface line
      g.strokeStyle = "rgba(255,210,120,0.9)";
      g.lineWidth = 2;
      g.beginPath();
      for (let x = x0; x <= x1; x += 4) {
        const yy = top + Math.sin(x * 0.18 + t * 4) * 1.6;
        if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
      // a soft heat glow over the mouth
      g.fillStyle = `rgba(255,120,40,${0.10 + 0.05 * (0.5 + 0.5 * Math.sin(t * 3))})`;
      g.fillRect(x0 - 4, top - 18, w + 8, 18);
    }

    if (this.spikes && this.spikes.active) {
      const { x0, x1, baseY } = this.spikes;
      // teeth sit on the fixed spike line; covered ones (bridge built above) hide.
      g.fillStyle = "rgba(220,80,90,0.95)";
      g.strokeStyle = "rgba(255,160,170,0.8)";
      g.lineWidth = 1;
      const tooth = 7;
      for (let x = x0; x < x1; x += tooth) {
        if (!this._spikeLethalAt(x + tooth / 2)) continue;   // covered → hide
        g.beginPath();
        g.moveTo(x, baseY);
        g.lineTo(x + tooth / 2, baseY - 10);
        g.lineTo(x + tooth, baseY);
        g.closePath();
        g.fill();
        g.stroke();
      }
      // a faint hint marker so players know to bridge here
      if (this._spikeLethalAt((x0 + x1) / 2)) {
        g.fillStyle = "rgba(255,160,170,0.5)";
        g.font = "500 10px ui-monospace, monospace";
        g.textAlign = "center"; g.textBaseline = "bottom";
        g.fillText("⚠ 다리를 놓아 건너기", (x0 + x1) / 2, baseY - 14);
        g.textAlign = "left";
      }
    }
  }

  _drawCoins(t) {
    if (!this.coins) return;
    const g = this.ctx;
    for (let c = 0; c < this.coins.length; c++) {
      const co = this.coins[c];
      if (co.got) {
        // brief collected sparkle, then gone
        if (co.life === undefined) co.life = 0;
        co.life -= 0.03;
        if (co.life <= 0) continue;
        const a = co.life, rad = 4 + (1 - co.life) * 12;
        g.strokeStyle = `rgba(255,225,120,${a})`;
        g.lineWidth = 1.4;
        g.beginPath(); g.arc(co.x, co.y - (1 - co.life) * 10, rad, 0, TAU); g.stroke();
        continue;
      }
      const bob = Math.sin(t * 3 + co.ph) * 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + co.ph);
      // glow
      g.fillStyle = `rgba(255,220,110,${0.10 + pulse * 0.12})`;
      g.beginPath(); g.arc(co.x, co.y + bob, 7, 0, TAU); g.fill();
      // gem body (diamond)
      g.fillStyle = "rgba(255,225,120,0.95)";
      g.beginPath();
      g.moveTo(co.x, co.y - 4 + bob);
      g.lineTo(co.x + 3, co.y + bob);
      g.lineTo(co.x, co.y + 4 + bob);
      g.lineTo(co.x - 3, co.y + bob);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(255,255,210,0.9)";
      g.lineWidth = 0.8;
      g.stroke();
    }
  }

  _drawDoors(t) {
    const g = this.ctx;
    const sgy = this._groundAt(this.spawnX), ggy = this._groundAt(this.goalX);
    // spawn door (left) — neutral stone arch
    this._door(g, this.spawnX, sgy, "rgba(150,160,180,0.85)", false, t);
    // goal door (right) — glowing accent, the safe exit
    this._door(g, this.goalX, ggy, this.accent, true, t);
  }

  _door(g, x, gy, color, glow, t) {
    const dw = 16, dh = 26;
    if (glow) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      g.fillStyle = `rgba(${this.ar},${this.ag},${this.ab},${0.12 + pulse * 0.12})`;
      g.beginPath();
      g.ellipse(x, gy - dh * 0.5, dw, dh * 0.9, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = "rgba(8,10,14,0.92)";
    g.fillRect(x - dw / 2, gy - dh, dw, dh);
    g.strokeStyle = color;
    g.lineWidth = 2.4;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(x - dw / 2, gy);
    g.lineTo(x - dw / 2, gy - dh + dw / 2);
    g.arc(x, gy - dh + dw / 2, dw / 2, Math.PI, 0);
    g.lineTo(x + dw / 2, gy);
    g.stroke();
  }

  // a single cute walker: round body + head, two bobbing legs, facing its dir.
  _drawWalker(g, w, t) {
    const ar = this.ar, ag = this.ag, ab = this.ab;
    const hue = w.hue;
    const r = (clamp(ar + 70 + hue, 0, 255)) | 0;
    const gg = (clamp(ag + 70 + hue, 0, 255)) | 0;
    const b = (clamp(ab + 70 + hue, 0, 255)) | 0;
    const body = w.blocker ? "rgba(255,170,90,0.96)" : `rgb(${r},${gg},${b})`;
    const hopLift = (w.hop > 0) ? Math.sin((1 - w.hop / 0.34) * Math.PI) * 4 : 0;
    const bx = w.x, by = w.y - hopLift;
    const flail = !w.grounded;
    const bob = flail ? 0 : Math.sin(w.ph) * 0.8;     // body bob while walking

    g.lineCap = "round";
    g.lineJoin = "round";

    // blocker stands inside a faint guard ring so it reads as "placed"
    if (w.blocker) {
      g.strokeStyle = "rgba(255,170,90,0.35)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(bx, by - 1, 6, 0, TAU);
      g.stroke();
    }

    // legs (two short lines, alternating walk cycle; flail when falling)
    g.strokeStyle = body;
    g.lineWidth = 1.4;
    const legY = by + 3;
    if (flail) {
      // limbs splay out a touch — falling pose
      const a = Math.sin(t * 22 + w.ph) * 1.6;
      g.beginPath();
      g.moveTo(bx - 1.2, by + 1);
      g.lineTo(bx - 2.6 + a, legY + 1.5);
      g.moveTo(bx + 1.2, by + 1);
      g.lineTo(bx + 2.6 - a, legY + 1.5);
      g.stroke();
    } else if (w.blocker) {
      // planted stance — two straight little legs
      g.beginPath();
      g.moveTo(bx - 1.2, by + 1); g.lineTo(bx - 1.6, legY + 1);
      g.moveTo(bx + 1.2, by + 1); g.lineTo(bx + 1.6, legY + 1);
      g.stroke();
    } else {
      const s = Math.sin(w.ph) * 1.8;                 // stride
      g.beginPath();
      g.moveTo(bx - 0.8, by + 1);
      g.lineTo(bx - 0.8 + s, legY);
      g.moveTo(bx + 0.8, by + 1);
      g.lineTo(bx + 0.8 - s, legY);
      g.stroke();
    }

    // round body
    g.fillStyle = body;
    g.beginPath();
    g.arc(bx, by + bob, 2.5, 0, TAU);
    g.fill();

    // little head, nudged toward facing direction
    g.beginPath();
    g.arc(bx + w.dir * 0.6, by - 2.3 + bob, 1.7, 0, TAU);
    g.fill();

    // a tiny dark eye facing the walk direction
    g.fillStyle = "rgba(10,12,16,0.9)";
    g.beginPath();
    g.arc(bx + w.dir * 1.2, by - 2.5 + bob, 0.5, 0, TAU);
    g.fill();

    // the leader carries a tiny waving flag
    if (w.leader) {
      const fy = by - 4 + bob;
      g.strokeStyle = "rgba(235,240,245,0.9)";
      g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(bx, fy); g.lineTo(bx, fy - 6); g.stroke();
      const wave = Math.sin(t * 8) * 1.2;
      g.fillStyle = this.accent;
      g.beginPath();
      g.moveTo(bx, fy - 6);
      g.lineTo(bx + 5 + wave, fy - 4.5);
      g.lineTo(bx, fy - 3);
      g.closePath();
      g.fill();
    }
  }

  _drawPops(g, dt) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt * 1.6;
      if (p.life <= 0) { this.pops.splice(i, 1); continue; }
      const e = 1 - p.life;                            // 0→1
      const rad = 4 + e * 16;
      const a = p.life;
      g.strokeStyle = `rgba(${this.ar},${this.ag},${this.ab},${a * 0.8})`;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(p.x, p.y - e * 10, rad, 0, TAU);
      g.stroke();
      // a few sparkle ticks
      g.fillStyle = `rgba(${clamp(this.ar + 60, 0, 255) | 0},${clamp(this.ag + 60, 0, 255) | 0},${clamp(this.ab + 60, 0, 255) | 0},${a})`;
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * TAU + e * 2;
        g.fillRect(p.x + Math.cos(ang) * rad - 0.8, p.y - e * 10 + Math.sin(ang) * rad - 0.8, 1.6, 1.6);
      }
    }
  }

  // a cute soft puff when a walker is lost (no gore — a little grey cloud)
  _drawPoofs(g, dt) {
    for (let i = this.poofs.length - 1; i >= 0; i--) {
      const p = this.poofs[i];
      p.life -= dt * 2.2;
      if (p.life <= 0) { this.poofs.splice(i, 1); continue; }
      const e = 1 - p.life;
      const a = p.life * 0.7;
      g.fillStyle = `rgba(210,210,220,${a})`;
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * TAU;
        const rr = 2 + e * 9;
        g.beginPath();
        g.arc(p.x + Math.cos(ang) * rr, p.y - e * 8 + Math.sin(ang) * rr, 2.2 - e * 1.4, 0, TAU);
        g.fill();
      }
    }
  }

  _drawConfetti(g, dt) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.vy += 60 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      c.life -= dt * 0.28;
      if (c.life <= 0 || c.y > this.h + 20) { this.confetti.splice(i, 1); continue; }
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.fillStyle = `hsla(${c.hue},85%,62%,${clamp(c.life, 0, 1)})`;
      g.fillRect(-2, -3, 4, 6);
      g.restore();
    }
  }

  _drawHud(g) {
    const pad = 14;
    // compact stat line in the accent colour
    const txt = `구조됨 ${this.saved}/${QUOTA} · 잃음 ${this.lost} · 점수 ${this.score}`;
    g.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
    g.textBaseline = "top";
    g.fillStyle = "rgba(8,10,14,0.55)";
    const tw = g.measureText(txt).width;
    g.fillRect(pad - 6, pad - 4, tw + 12, 22);
    g.fillStyle = this.accent;
    g.fillText(txt, pad, pad);

    // mode hint (build/dig, or the active blocker ability)
    g.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    g.fillStyle = "rgba(220,226,232,0.55)";
    if (this.blockerMode) {
      g.fillText("클릭: 블로커 세우기 (click a walker)", pad, pad + 22);
    } else {
      const mode = this.digMode ? "파기 (dig)" : "쌓기 (build)";
      g.fillText(`드래그: ${mode}`, pad, pad + 22);
    }

    // win banner
    if (this.won && this.winTimer > 0) {
      g.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const a = clamp(this.winTimer / 1.2, 0, 1);
      g.fillStyle = `rgba(${this.ar},${this.ag},${this.ab},${a})`;
      g.fillText("행렬 완성! 🎉", this.w / 2, this.h * 0.32);
      g.font = "500 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      g.fillStyle = `rgba(220,226,232,${a * 0.8})`;
      g.fillText(`구조 ${this.saved} · 점수 ${this.score} — 지형 초기화로 새 판`, this.w / 2, this.h * 0.32 + 26);
      g.textAlign = "left";
      g.textBaseline = "top";
    }
  }

  _drawBrush(g) {
    const ptr = this.pointer;
    if (!ptr.active) return;
    if (this.blockerMode) {
      // a small pick-ring for placing blockers
      g.strokeStyle = "rgba(255,170,90,0.7)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(ptr.x, ptr.y, BLOCKER_R, 0, TAU);
      g.stroke();
      g.fillStyle = g.strokeStyle;
      g.fillRect(ptr.x - 1, ptr.y - 1, 2, 2);
      return;
    }
    g.strokeStyle = this.digMode
      ? "rgba(255,140,120,0.55)"                       // warm = dig
      : `rgba(${this.ar},${this.ag},${this.ab},0.55)`; // accent = build
    g.lineWidth = 1.4;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(ptr.x, ptr.y, this.brush, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    // crosshair centre
    g.fillStyle = g.strokeStyle;
    g.fillRect(ptr.x - 1, ptr.y - 1, 2, 2);
  }

  controls(host) {
    host.appendChild(slider("FLOW", 0.1, 3, this.flow, 0.05, (v) => (this.flow = v)));
    host.appendChild(slider("BRUSH SIZE", 12, 90, this.brush, 1,
      (v) => (this.brush = v), (v) => Math.round(v)));
    host.appendChild(buttonRow([
      {
        label: "파기 ↔ 쌓기 (dig ↔ build)",
        on: (el) => {
          this.digMode = !this.digMode;
          el.classList.toggle("is-active", this.digMode);
          el.textContent = this.digMode ? "파기 모드 ✓ (dig)" : "파기 ↔ 쌓기 (dig ↔ build)";
        },
      },
      {
        label: "능력: 블로커 (blocker)",
        on: (el) => {
          this.blockerMode = !this.blockerMode;
          el.classList.toggle("is-active", this.blockerMode);
          el.textContent = this.blockerMode ? "블로커 ✓ (클릭해서 세우기)" : "능력: 블로커 (blocker)";
        },
      },
      {
        label: "지형 초기화 (reset terrain)",
        on: () => {
          this._newLevel();
          this.walkers.length = 0;
          this.pops.length = 0;
          this.poofs.length = 0;
          this.confetti.length = 0;
          this.saved = 0;
          this.lost = 0;
          this.score = 0;
          this.won = false;
          this.winTimer = 0;
          this.spawnAcc = 0;
          this._leaderSpawned = false;
        },
      },
    ]));
  }
}
