// ============================================================================
//  42 · 황금빛 (After Klimt — The Kiss: Two Robes)
//  Klimt's "The Kiss" dresses the lovers in two contrasting patterns, drawn here
//  in fine gilded detail over a single field of gold leaf:
//    · THE MAN'S ROBE  — rounded black / ivory / gold RECTANGLE blocks, some
//      double-framed or split into stripes: severe, architectural, monochrome-
//      and-gold.
//    · THE WOMAN'S ROBE — a meadow of colour: jewel CIRCLES, concentric TARGETS,
//      SPIRALS, OVALS and FLOWERS strewn over the gold, with tiny filler dots.
//  The field opens split on a slanted diagonal — one robe each side. CLICK and a
//  ROUNDEL of the OPPOSITE pattern blooms where you tapped (man-into-woman, or
//  woman-into-man); drag to paint a trail of them. The roundels accumulate, the
//  two robes interlocking like a mosaic, each bloom rimmed by a ragged GOLD
//  border that glints under a travelling sweep of light. Gold flecks drift down
//  like falling leaf. All procedural — metallic gradients, dark joinery: Klimt.
// ============================================================================

import { Piece, TAU, clamp, lerp, map, rand, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// --- Klimt's golden palette -------------------------------------------------
const GROUND = "#0d0a05";                       // near-black warm ground
const GOLD_BASE = [212, 175, 64];               // leaf gold (rgb)
const GOLD_HI   = [255, 240, 175];              // hot highlight
const GOLD_LO   = [120, 84, 22];                // bronze shadow
const IVORY     = "#efe6cf";                     // the robe's warm whites
const INK       = "#0a0703";                     // the robe's blacks
// The woman's robe is built from these jewel blossoms (Klimt's meadow colours).
const FLOWER = ["#b3202f", "#234a8f", "#6a2c7a", "#4f8f3a", "#c8772a", "#9c3d6b"];

export default class KlimtKiss extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.shimmer = 1.0;        // light-sweep speed / glint intensity
    this.cellMul = 1.0;        // pattern cell size multiplier (density)
    this.gold = 1.0;           // warmth / saturation of the gold

    // --- the opening diagonal split -----------------------------------------
    // The field starts halved on a slanted diagonal: a point (x,y) is on the
    // MAN's side when signed(x,y) < boundary, else the WOMAN's side. This is the
    // fixed BASE territory; clicks then stamp circular PATCHES of the opposite
    // pattern on top (see this.patches), so the two robes interlock as a mosaic.
    this.seamAngle = -0.62;    // tilt of the opening diagonal (radians)
    this.boundary = 0;         // seam offset (set in _resetSeam → screen centre)

    // patches: each is { x, y, r, grow, man }  where `man` = which pattern it
    // PAINTS (true → man's robe, false → woman's). A point inside an even number
    // of overlapping patches keeps its base side; each covering patch flips it,
    // but we simply take the TOP-MOST (last, largest-grown) patch that contains
    // the point — clicks bloom the opposite of whatever was there.
    this.patches = [];
    this.maxPatches = 80;      // cap (oldest retire into nothing, cheap)

    this.flecks = [];          // falling gold leaf
    this._lastTrail = 0;
    this._lastStamp = -1;

    this._buildPatterns();
    this._resetSeam();
    this._seedFlecks();
    this._buildPatina();        // mottled canvas/leaf texture for a painterly haze

    // initial warm ground so the first frame is never bare
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.w, this.h);
  }

  // ---- gold colour helper: blend lo→base→hi by `lv` (0..1), warmed by GOLD --
  _goldStr(lv, a = 1) {
    lv = clamp(lv, 0, 1);
    let r, gg, b;
    if (lv < 0.5) {
      const f = lv / 0.5;
      r = lerp(GOLD_LO[0], GOLD_BASE[0], f);
      gg = lerp(GOLD_LO[1], GOLD_BASE[1], f);
      b = lerp(GOLD_LO[2], GOLD_BASE[2], f);
    } else {
      const f = (lv - 0.5) / 0.5;
      r = lerp(GOLD_BASE[0], GOLD_HI[0], f);
      gg = lerp(GOLD_BASE[1], GOLD_HI[1], f);
      b = lerp(GOLD_BASE[2], GOLD_HI[2], f);
    }
    const warm = this.gold;
    r = clamp(r * lerp(0.92, 1.06, warm), 0, 255);
    gg = clamp(gg * lerp(0.96, 1.02, warm), 0, 255);
    b = clamp(b * lerp(1.18, 0.74, warm), 0, 255);
    return `rgba(${r | 0},${gg | 0},${b | 0},${a})`;
  }

  // ===========================================================================
  //  SEAM GEOMETRY
  //  signed(x,y) = nx*x + ny*y  (projection onto the seam normal).
  //  The seam line is the locus  signed == boundary.  We precompute the min/max
  //  projection across the canvas so `boundary` can travel from "all woman" to
  //  "all man" with a known span.
  // ===========================================================================
  _seamGeom() {
    this.nx = Math.cos(this.seamAngle);
    this.ny = Math.sin(this.seamAngle);
    // project the four corners → range of signed values over the canvas
    const W = this.w, H = this.h;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]];
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of corners) {
      const s = this.nx * x + this.ny * y;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    // pad so the seam can fully clear the canvas at either extreme
    const pad = (hi - lo) * 0.06 + 1;
    this.sLo = lo - pad;
    this.sHi = hi + pad;
    this.seamSpan = this.sHi - this.sLo;
  }

  _signed(x, y) { return this.nx * x + this.ny * y; }

  // a little wobble added to the seam threshold per row → ragged mosaic join,
  // not a clean razor line. Deterministic in y so it doesn't shimmer wildly.
  _seamWobble(y) {
    return (this.noise(y * 0.012, this._seamSeed) - 0.5) * this.cell * 2.2;
  }

  // the BASE (opening-diagonal) side, ignoring patches
  _baseMan(x, y) {
    return this._signed(x, y) < this.boundary + this._seamWobble(y);
  }

  // does (x,y) fall inside patch p? NOT a clean circle — the radius wavers with
  // angle (value-noise) so the edge frays and seeps like spreading ink/paint,
  // not a hard disc. Two octaves: a few big lobes + finer ragged chatter.
  _inPatch(p, x, y) {
    const rr = p.r * p.grow;
    if (rr < 1) return false;
    const dx = x - p.x, dy = y - p.y;
    const d2 = dx * dx + dy * dy;
    // quick reject well outside the wobble envelope
    const maxR = rr * 1.18;
    if (d2 > maxR * maxR) return false;
    const d = Math.sqrt(d2);
    const a = Math.atan2(dy, dx);
    // angle-driven noise wobble (seeded per patch). map angle→noise coords on a
    // circle so it's seamless at ±π.
    const nx = Math.cos(a), ny = Math.sin(a);
    const big = this.noise(nx * 1.6 + p.seed, ny * 1.6 - p.seed) - 0.5;     // broad lobes
    const fine = this.noise(nx * 5.0 - p.seed, ny * 5.0 + p.seed) - 0.5;    // ragged chatter
    const wob = 1 + big * 0.30 + fine * 0.16;     // ±~0.23 of the radius
    return d <= rr * wob;
  }

  // is (x,y) drawn in the MAN's robe right now? Start from the base diagonal,
  // then let the TOP-MOST patch covering this point override it. Patches are
  // appended in click order, so scanning back→front gives the latest on top.
  _isMan(x, y) {
    const ps = this.patches;
    for (let i = ps.length - 1; i >= 0; i--) {
      if (this._inPatch(ps[i], x, y)) return ps[i].man;
    }
    return this._baseMan(x, y);
  }

  // reset to the half-and-half opening position (seam through the centre) and
  // clear every stamped patch.
  _resetSeam() {
    this._seamGeom();
    this.boundary = (this.sLo + this.sHi) / 2;
    if (this.patches) this.patches.length = 0;
  }

  // ===========================================================================
  //  BUILD PATTERNS
  //  Both robes are laid out once as cell lists covering the whole canvas; each
  //  frame we draw a cell only if its centre falls on that robe's side of the
  //  seam. This keeps the patterns rock-steady as the seam slides over them.
  // ===========================================================================
  _buildPatterns() {
    const W = this.w, H = this.h;
    const minDim = Math.min(W, H);
    this._seamSeed = rand(0, 100);

    // base cell unit drives both patterns' scale — smaller now, so the motifs
    // pack denser like the real robe (was /22, min 16).
    const cell = clamp(minDim / (34 * this.cellMul), 10, 44);
    this.cell = cell;

    // ---- MAN'S ROBE: tall rectangle columns -------------------------------
    // Columns are `cell` wide; each column is a stack of rectangles of varying
    // height (1–3 cell units) coloured black / ivory / gold in Klimt's rhythm.
    this.manCells = [];
    const colW = cell;
    const cols = Math.ceil(W / colW) + 1;
    for (let c = 0; c < cols; c++) {
      const cx = c * colW;
      let y = -cell * rand(0, 1.5);            // stagger column starts
      // a per-column phase so the colour rhythm is offset between columns
      let phase = (c * 2 + ((Math.random() * 3) | 0)) % 3;
      // some columns are "gold seam" columns (slimmer rhythm of gold) — they
      // separate the broad black/ivory blocks the way Klimt's robe does.
      const goldCol = Math.random() < 0.22;
      while (y < H + cell) {
        const hUnits = 1 + ((Math.random() * 2.4) | 0);   // 1..3 units tall
        const hgt = hUnits * cell * rand(0.9, 1.12);
        // colour rhythm: predominantly INK & IVORY blocks (the robe is black &
        // white at heart), with GOLD reserved for seam columns / occasional
        // accents — matching "The Kiss".
        let kind;
        if (goldCol) {
          kind = Math.random() < 0.7 ? 2 : (phase % 2 ? 0 : 1);
        } else {
          const roll = (phase + (Math.random() * 1.0)) % 2;
          kind = roll < 1 ? 0 : 1;          // alternate ink / ivory
          if (Math.random() < 0.10) kind = 2;   // sparse gold accent
        }
        // detail variant: plain, double-framed, or split into stripes — the
        // small architectural variety that makes Klimt's robe read as worked
        // metalwork rather than a flat grid.
        const vr = Math.random();
        const variant = vr < 0.62 ? 0 : (vr < 0.84 ? 1 : 2);   // 0 plain·1 frame·2 stripe
        this.manCells.push({
          x: cx, y, w: colW, h: hgt, kind, variant,
          // a few ink blocks carry a tiny gold square inset (Klimt detail)
          dot: kind === 0 && Math.random() < 0.30,
          stripes: 2 + ((Math.random() * 3) | 0),   // for variant 2
          tone: rand(0.4, 0.72),
        });
        y += hgt;
        phase = (phase + 1) % 3;
      }
    }

    // ---- WOMAN'S ROBE: scattered jewel circles / flowers ------------------
    // A jittered grid of bloom slots; each slot holds a circle, ringed dot,
    // oval, or a little flower. Colours from the meadow palette over gold.
    this.womanCells = [];
    const gap = cell * 0.82;          // tighter slots → blooms pack densely
    const wc = Math.ceil(W / gap) + 2;
    const wr = Math.ceil(H / gap) + 2;
    for (let j = 0; j < wr; j++) {
      for (let i = 0; i < wc; i++) {
        const jit = gap * 0.34;
        const x = i * gap + (j % 2) * gap * 0.5 + rand(-jit, jit);
        const y = j * gap + rand(-jit, jit);
        const typ = Math.random();
        let shape;
        if (typ < 0.26) shape = 0;        // filled jewel circle
        else if (typ < 0.46) shape = 1;   // ringed dot (eye)
        else if (typ < 0.60) shape = 2;   // oval
        else if (typ < 0.76) shape = 3;   // flower
        else if (typ < 0.90) shape = 4;   // concentric target (Klimt roundel)
        else shape = 5;                    // spiral
        this.womanCells.push({
          x, y,
          r: gap * rand(0.22, 0.46),
          shape,
          rings: 2 + ((Math.random() * 3) | 0),    // for target
          col: FLOWER[(Math.random() * FLOWER.length) | 0],
          col2: FLOWER[(Math.random() * FLOWER.length) | 0],
          rot: rand(0, TAU),
          ph: rand(0, TAU),
          tone: rand(0.45, 0.75),
        });
      }
    }
    // sort small→large so big blooms sit atop the chatter
    this.womanCells.sort((a, b) => a.r - b.r);
  }

  _seedFlecks() {
    this.flecks.length = 0;
    const n = Math.round(map(Math.min(this.w, this.h), 400, 1400, 26, 70));
    for (let i = 0; i < n; i++) this.flecks.push(this._newFleck(true));
  }
  _newFleck(initial = false) {
    return {
      x: rand(0, this.w),
      y: initial ? rand(0, this.h) : rand(-40, -4),
      vy: rand(14, 42),
      sway: rand(8, 26),
      ph: rand(0, TAU),
      s: rand(2.2, 6.5),
      spin: rand(-2, 2),
      rot: rand(0, TAU),
      lv: rand(0.6, 1),
    };
  }

  onResize() {
    this._buildPatterns();
    this._resetSeam();
    this._seedFlecks();
    this._buildPatina();
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.w, this.h);
  }

  // ---- interaction ----------------------------------------------------------
  // CLICK → bloom a roundel of the OPPOSITE pattern at the cursor. Whatever the
  // tapped point currently shows (man or woman) we stamp the other, so a tap in
  // the man's robe blossoms a circle of the woman's flowers, and vice-versa.
  // Dragging paints a trail of roundels. Only this.patches is mutated, and only
  // by appending — never during iteration — so it can't corrupt the draw loop.
  onPointerDown() {
    this._holding = true;
    if (this.pointer.active) this._stamp(this.pointer.x, this.pointer.y);
  }
  onPointerUp() { this._holding = false; }

  _stamp(x, y) {
    const minDim = Math.min(this.w, this.h);
    const here = this._isMan(x, y);            // what's there now
    this.patches.push({
      x, y,
      r: minDim * rand(0.065, 0.115),          // smaller bloom (was .10–.17)
      grow: 0.04,                               // eases up to 1 in frame()
      man: !here,                               // paint the OPPOSITE pattern
      seed: rand(0, 100),                       // per-patch wobble phase
    });
    if (this.patches.length > this.maxPatches) {
      this.patches.splice(0, this.patches.length - this.maxPatches);
    }
  }

  // grow patches in + drop a stamp trail while dragging
  _advancePatches(dt, t) {
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      if (p.grow < 1) p.grow = Math.min(1, p.grow + dt * 4.5);
    }
    const ptr = this.pointer;
    if (this._holding && ptr.active) {
      const moved = Math.hypot(ptr.vx, ptr.vy);
      // stamp along a drag, throttled by distance so a trail forms (not a blob)
      if (moved > 2 && t - this._lastStamp > 0.10) {
        this._lastStamp = t;
        this._stamp(ptr.x, ptr.y);
      }
    }
  }

  // ===========================================================================
  //  FRAME
  // ===========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h, ptr = this.pointer;

    // grow stamped roundels in; drop a trail of new ones while dragging
    this._advancePatches(dt, t);

    // warm ground each frame (fully opaque — patterns are repainted)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = GROUND;
    g.fillRect(0, 0, W, H);

    // moving light sweep across the leaf
    const sweepSpeed = 0.10 + this.shimmer * 0.12;
    const sweepDir = { x: Math.cos(0.7), y: Math.sin(0.7) };
    const diag = W * sweepDir.x + H * sweepDir.y;
    const sweepPos = ((t * sweepSpeed) % 1.4 - 0.2) * diag;
    const sweepW = diag * 0.34;

    // cursor specular hotspot
    const lightOn = ptr.active;
    const lx = ptr.x, ly = ptr.y;
    const lightR = Math.min(W, H) * 0.26;

    // --- gilded ground beneath both robes (a soft tile shimmer) -------------
    this._paintGround(g, t, sweepPos, sweepW, sweepDir);

    // --- the two robes, clipped to their side of the seam -------------------
    this._paintManRobe(g, t, sweepPos, sweepW, sweepDir, lightOn, lx, ly, lightR);
    this._paintWomanRobe(g, t, lightOn, lx, ly, lightR);

    // --- the ragged gold seam where the patterns interlock ------------------
    this._paintSeam(g, t, sweepPos, sweepW, sweepDir);

    // --- drag awakens a trail of shimmer (glinting flecks behind cursor) ----
    if (this._holding && ptr.active) {
      const moved = Math.hypot(ptr.vx, ptr.vy);
      if (moved > 1.2 && t - this._lastTrail > 0.016) {
        this._lastTrail = t;
        for (let k = 0; k < 2; k++) {
          this.flecks.push({
            x: lx + rand(-10, 10), y: ly + rand(-10, 10),
            vy: rand(-6, 24), sway: rand(6, 18), ph: rand(0, TAU),
            s: rand(2.5, 6), spin: rand(-3, 3), rot: rand(0, TAU),
            lv: 1, trail: 1,
          });
        }
        if (this.flecks.length > 240) this.flecks.splice(0, this.flecks.length - 240);
      }
    }

    // --- falling gold flecks ------------------------------------------------
    this._paintFlecks(g, dt, t, sweepPos, sweepW, sweepDir);

    // --- cursor light bloom -------------------------------------------------
    if (lightOn) {
      g.globalCompositeOperation = "lighter";
      const R = lightR * 0.9;
      const grad = g.createRadialGradient(lx, ly, 0, lx, ly, R);
      const i = (0.10 + this.shimmer * 0.10);
      grad.addColorStop(0, `rgba(255,238,180,${i})`);
      grad.addColorStop(0.4, `rgba(230,190,90,${i * 0.4})`);
      grad.addColorStop(1, "rgba(200,150,40,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(lx, ly, R, 0, TAU); g.fill();
      g.globalCompositeOperation = "source-over";
    }

    // soften the crisp vector edges: blend a slightly BLURRED copy of the frame
    // back over itself → motifs read like painted dabs, not clean stickers.
    this._paintSoftBloom(g);
    // painterly haze (mottled gold-leaf patina) over it all, then the vignette
    this._paintPatina(g);
    this._vignette(g);
  }

  // copy the current canvas, blur it, and lay it back at low alpha → a gentle
  // out-of-focus bloom that blurs every hard edge into a painterly softness.
  _paintSoftBloom(g) {
    const W = this.w, H = this.h;
    if (!this._bloom) this._bloom = document.createElement("canvas");
    const bw = Math.max(2, Math.round(W * 0.5)), bh = Math.max(2, Math.round(H * 0.5));
    if (this._bloom.width !== bw || this._bloom.height !== bh) {
      this._bloom.width = bw; this._bloom.height = bh;
    }
    const bg = this._bloom.getContext("2d");
    bg.clearRect(0, 0, bw, bh);
    // downscale the live frame (this.canvas is dpr-scaled) into the half-res buf
    bg.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, bw, bh);
    g.save();
    g.globalAlpha = 0.34;                 // how much haze
    g.filter = "blur(2px)";               // the softness
    g.imageSmoothingEnabled = true;
    g.drawImage(this._bloom, 0, 0, bw, bh, 0, 0, W, H);
    g.restore();
  }

  // distance of point to the moving sweep line → 0..1 brightness contribution
  _sweepGlint(x, y, sweepPos, sweepW, dir) {
    const proj = x * dir.x + y * dir.y;
    const d = Math.abs(proj - sweepPos);
    if (d > sweepW) return 0;
    const f = 1 - d / sweepW;
    return f * f;
  }
  _cursorGlint(x, y, on, lx, ly, R) {
    if (!on) return 0;
    const d = Math.hypot(x - lx, y - ly);
    if (d > R) return 0;
    const f = 1 - d / R;
    return f * f * f;
  }

  // ---- gilded ground (a faint gold tile shimmer beneath both robes) -------
  _paintGround(g, t, sweepPos, sweepW, dir) {
    g.globalCompositeOperation = "source-over";
    const cell = this.cell * 1.5;
    const cols = Math.ceil(this.w / cell) + 1;
    const rows = Math.ceil(this.h / cell) + 1;
    const sh = this.shimmer;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cell, y = j * cell;
        const sweep = this._sweepGlint(x, y, sweepPos, sweepW, dir) * (0.4 + sh * 0.5);
        const tw = 0.5 + 0.5 * Math.sin(t * 0.6 + (i * 7 + j * 13));
        const lv = clamp(0.3 + tw * 0.07 * sh + sweep * 0.5, 0, 1);
        g.fillStyle = this._goldStr(lv * 0.5);
        g.fillRect(x, y, cell + 1, cell + 1);
      }
    }
  }

  // ===========================================================================
  //  MAN'S ROBE — tall black / ivory / gold rectangle columns
  // ===========================================================================
  // rounded-rectangle path helper
  _roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // fill style for a man-robe block of a given kind at brightness `lit`
  _manFill(g, kind, x, y, w, h, lit, sweep, cur) {
    if (kind === 2) {
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, this._goldStr(lit * 0.6));
      grad.addColorStop(0.5, this._goldStr(lit));
      grad.addColorStop(1, this._goldStr(lit * 0.7));
      return grad;
    } else if (kind === 1) {
      const b = clamp(0.86 + sweep * 0.12 + cur * 0.1, 0, 1);
      return `rgb(${(239 * b) | 0},${(230 * b) | 0},${(207 * b) | 0})`;
    }
    return INK;
  }

  _paintManRobe(g, t, sweepPos, sweepW, dir, lightOn, lx, ly, R) {
    g.globalCompositeOperation = "source-over";
    const cells = this.manCells;
    const inset = Math.max(1.2, this.cell * 0.10);    // gap between blocks (joinery)
    const round = this.cell * 0.22;
    for (let i = 0; i < cells.length; i++) {
      const m = cells[i];
      const cyx = m.x + m.w * 0.5, cyy = m.y + m.h * 0.5;
      if (!this._isMan(cyx, cyy)) continue;     // only this robe's territory
      const sweep = this._sweepGlint(cyx, cyy, sweepPos, sweepW, dir) * (0.5 + this.shimmer * 0.6);
      const cur = this._cursorGlint(cyx, cyy, lightOn, lx, ly, R);
      const lit = clamp(m.tone + sweep * 0.5 + cur * 0.9, 0, 1);

      const x = m.x + inset * 0.5, y = m.y + inset * 0.5;
      const w = m.w - inset, h = m.h - inset;
      if (w <= 0 || h <= 0) continue;

      // block body (rounded)
      this._roundRect(g, x, y, w, h, round);
      g.fillStyle = this._manFill(g, m.kind, x, y, w, h, lit, sweep, cur);
      g.fill();
      // dark joinery contour
      g.strokeStyle = "rgba(18,11,2,0.7)";
      g.lineWidth = 1.2;
      g.stroke();

      if (m.variant === 1) {
        // DOUBLE FRAME: an inner rounded outline in a contrasting tone
        const fx = x + w * 0.16, fy = y + h * 0.12;
        this._roundRect(g, fx, fy, w - w * 0.32, h - h * 0.24, round * 0.7);
        g.strokeStyle = m.kind === 0
          ? this._goldStr(0.5 + sweep * 0.4 + cur * 0.5)   // gold line inside ink
          : "rgba(18,11,2,0.55)";                           // ink line inside light
        g.lineWidth = Math.max(1, this.cell * 0.07);
        g.stroke();
      } else if (m.variant === 2) {
        // STRIPES: thin alternating bands across the block (woven look)
        const n = m.stripes, bh = h / n;
        for (let s = 0; s < n; s++) {
          if (s % 2 === 0) continue;
          g.save();
          this._roundRect(g, x, y, w, h, round); g.clip();
          const alt = (m.kind === 0) ? this._goldStr(0.5 + sweep * 0.4) : INK;
          g.fillStyle = alt;
          g.globalAlpha = 0.85;
          g.fillRect(x, y + s * bh, w, bh);
          g.restore();
        }
      }

      // tiny gold square inset on some ink blocks (Klimt's punctuation)
      if (m.dot && m.variant === 0) {
        const ds = Math.min(w, h) * 0.26;
        g.fillStyle = this._goldStr(0.55 + sweep * 0.4 + cur * 0.6);
        this._roundRect(g, cyx - ds / 2, cyy - ds / 2, ds, ds, ds * 0.28);
        g.fill();
      }
      // hot specular catch on lit gold/ivory
      if (lit > 0.8 && m.kind !== 0) {
        g.fillStyle = `rgba(255,248,210,${(lit - 0.8) * 1.3})`;
        g.fillRect(x + w * 0.1, y + h * 0.08, w * 0.34, h * 0.14);
      }
    }
  }

  // ===========================================================================
  //  WOMAN'S ROBE — scattered jewel circles, ringed dots, ovals & flowers
  // ===========================================================================
  _paintWomanRobe(g, t, lightOn, lx, ly, R) {
    g.globalCompositeOperation = "source-over";
    const cells = this.womanCells;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (this._isMan(c.x, c.y)) continue;      // only this robe's territory
      const cur = this._cursorGlint(c.x, c.y, lightOn, lx, ly, R);
      const tw = 0.5 + 0.5 * Math.sin(t * 0.9 + c.ph);
      const lv = clamp(c.tone + tw * 0.1 * this.shimmer + cur * 0.5, 0, 1);
      const r = c.r;

      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      switch (c.shape) {
        case 0: this._wCircle(g, r, lv, c); break;
        case 1: this._wRing(g, r, lv, c); break;
        case 2: this._wOval(g, r, lv, c); break;
        case 3: this._wFlower(g, r, lv, c); break;
        case 4: this._wTarget(g, r, lv, c); break;
        default: this._wSpiral(g, r, lv, c);
      }
      g.restore();
    }
  }

  // a filled jewel circle with a thin gold rim and a bright catch
  _wCircle(g, r, lv, c) {
    g.fillStyle = this._goldStr(0.55 + lv * 0.3);
    g.beginPath(); g.arc(0, 0, r * 1.12, 0, TAU); g.fill();
    g.fillStyle = c.col;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = `rgba(255,255,255,${0.18 + lv * 0.3})`;
    g.beginPath(); g.arc(-r * 0.3, -r * 0.32, r * 0.26, 0, TAU); g.fill();
  }

  // a ringed dot ("eye"): jewel ring around an ivory/ink centre on gold
  _wRing(g, r, lv, c) {
    g.fillStyle = this._goldStr(0.5 + lv * 0.3);
    g.beginPath(); g.arc(0, 0, r * 1.1, 0, TAU); g.fill();
    g.fillStyle = c.col;
    g.beginPath(); g.arc(0, 0, r * 0.85, 0, TAU); g.fill();
    g.fillStyle = IVORY;
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
    g.fillStyle = c.col2;
    g.beginPath(); g.arc(0, 0, r * 0.22, 0, TAU); g.fill();
  }

  // an elongated oval (the robe's leaf-like spots)
  _wOval(g, r, lv, c) {
    g.fillStyle = this._goldStr(0.5 + lv * 0.3);
    g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 1.45, 0, 0, TAU); g.fill();
    g.fillStyle = c.col;
    g.beginPath(); g.ellipse(0, 0, r * 0.55, r * 1.18, 0, 0, TAU); g.fill();
    g.fillStyle = `rgba(255,255,255,${0.2 + lv * 0.25})`;
    g.beginPath(); g.ellipse(-r * 0.15, -r * 0.4, r * 0.16, r * 0.34, 0, 0, TAU); g.fill();
  }

  // a little flower: petals around a contrasting heart
  _wFlower(g, r, lv, c) {
    const petals = 6;
    const pr = r * 0.62;
    g.fillStyle = c.col;
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * TAU;
      const px = Math.cos(a) * pr, py = Math.sin(a) * pr;
      g.beginPath(); g.arc(px, py, r * 0.42, 0, TAU); g.fill();
    }
    g.fillStyle = this._goldStr(0.6 + lv * 0.35);
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
    g.fillStyle = c.col2;
    g.beginPath(); g.arc(0, 0, r * 0.26, 0, TAU); g.fill();
  }

  // a concentric TARGET roundel — gold/jewel rings (the robe's signature discs)
  _wTarget(g, r, lv, c) {
    const n = c.rings + 2;
    g.fillStyle = this._goldStr(0.5 + lv * 0.3);
    g.beginPath(); g.arc(0, 0, r * 1.12, 0, TAU); g.fill();
    for (let k = n; k >= 1; k--) {
      const rr = r * (k / n);
      // alternate jewel colour and gold for crisp concentric bands
      g.fillStyle = (k % 2 === 0) ? c.col : this._goldStr(0.62 + lv * 0.3);
      g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
    }
    g.fillStyle = c.col2;
    g.beginPath(); g.arc(0, 0, r * 0.16, 0, TAU); g.fill();
  }

  // a gold SPIRAL whorl on a jewel disc (Klimt's curling tendrils)
  _wSpiral(g, r, lv, c) {
    g.fillStyle = this._goldStr(0.5 + lv * 0.3);
    g.beginPath(); g.arc(0, 0, r * 1.08, 0, TAU); g.fill();
    g.fillStyle = c.col;
    g.beginPath(); g.arc(0, 0, r * 0.92, 0, TAU); g.fill();
    g.strokeStyle = this._goldStr(0.7 + lv * 0.3);
    g.lineWidth = Math.max(1.2, r * 0.16);
    g.lineCap = "round";
    g.beginPath();
    const turns = 2.4, steps = 40;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const a = f * turns * TAU;
      const rad = f * r * 0.82;
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    g.fillStyle = this._goldStr(0.85);
    g.beginPath(); g.arc(0, 0, r * 0.12, 0, TAU); g.fill();
  }

  // ===========================================================================
  //  SEAMS — ragged gold mosaic joins where the two robes meet:
  //   (1) the opening DIAGONAL (base territory border), and
  //   (2) a glinting gold RING around every stamped patch.
  //  Gold lozenge chips laid along each join make the patterns interlock with a
  //  golden border rather than a clean cut.
  // ===========================================================================
  _paintSeam(g, t, sweepPos, sweepW, dir) {
    g.globalCompositeOperation = "source-over";
    const chip = this.cell * 0.42;

    // a single gold chip centred at (x,y), oriented `ang`, brightness from sweep
    const drawChip = (x, y, ang) => {
      const sweep = this._sweepGlint(x, y, sweepPos, sweepW, dir);
      const lv = clamp(0.6 + sweep * 0.45 + 0.12 * Math.sin(t * 2 + x * 0.05 + y * 0.05), 0, 1);
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = "rgba(20,12,2,0.6)";
      g.fillRect(-chip * 0.62, -chip * 0.62, chip * 1.24, chip * 1.24);
      const grad = g.createLinearGradient(-chip, -chip, chip, chip);
      grad.addColorStop(0, this._goldStr(lv * 0.6));
      grad.addColorStop(0.5, this._goldStr(Math.min(1, lv + 0.15)));
      grad.addColorStop(1, this._goldStr(lv * 0.7));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -chip); g.lineTo(chip * 0.7, 0); g.lineTo(0, chip); g.lineTo(-chip * 0.7, 0);
      g.closePath(); g.fill();
      if (lv > 0.85) {
        g.fillStyle = `rgba(255,250,220,${(lv - 0.85) * 2})`;
        g.beginPath(); g.arc(0, 0, chip * 0.22, 0, TAU); g.fill();
      }
      g.restore();
    };

    // (1) opening diagonal — only the stretches NOT yet covered by a patch
    if (Math.abs(this.nx) > 1e-4) {
      const H = this.h, W = this.w;
      const step = Math.max(8, this.cell * 0.5);
      const seamAng = this.seamAngle + Math.PI / 2;
      for (let y = -step; y <= H + step; y += step) {
        const thr = this.boundary + this._seamWobble(y);
        let x = (thr - this.ny * y) / this.nx;
        if (x < -chip || x > W + chip) continue;
        x += (this.noise(y * 0.05, this._seamSeed + 9) - 0.5) * chip * 1.3;
        if (this._coveredByPatch(x, y)) continue;     // a roundel owns this spot
        drawChip(x, y, seamAng);
      }
    }

    // (NOTE) patches have NO border ring — the opposite pattern simply fills the
    // circular region and interlocks with the surrounding pattern directly, no
    // outline of any kind around the bloom.
  }

  // is (x,y) inside any grown patch? (used to skip the diagonal under roundels)
  _coveredByPatch(x, y) {
    for (let i = 0; i < this.patches.length; i++) {
      if (this._inPatch(this.patches[i], x, y)) return true;
    }
    return false;
  }

  // ---- falling gold flecks ----------------------------------------------
  _paintFlecks(g, dt, t, sweepPos, sweepW, dir) {
    g.globalCompositeOperation = "lighter";
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const fk = this.flecks[i];
      fk.y += fk.vy * dt;
      fk.rot += fk.spin * dt;
      fk.x += Math.sin(t * 1.2 + fk.ph) * fk.sway * dt;

      if (fk.trail) {
        fk.lv -= dt * 0.9;
        if (fk.lv <= 0) { this.flecks.splice(i, 1); continue; }
      } else if (fk.y > this.h + 12) {
        Object.assign(fk, this._newFleck(false));
        continue;
      }

      const sweep = this._sweepGlint(fk.x, fk.y, sweepPos, sweepW, dir);
      const lv = clamp((fk.lv ?? 1) * (0.6 + sweep * 0.7 + 0.2 * Math.sin(t * 4 + fk.ph)), 0, 1);

      g.save();
      g.translate(fk.x, fk.y);
      g.rotate(fk.rot);
      const s = fk.s;
      g.fillStyle = this._goldStr(0.5 + lv * 0.5, 0.5 + lv * 0.45);
      g.beginPath();
      g.moveTo(0, -s); g.lineTo(s * 0.5, 0); g.lineTo(0, s); g.lineTo(-s * 0.5, 0);
      g.closePath(); g.fill();
      if (lv > 0.75) {
        g.fillStyle = `rgba(255,250,220,${(lv - 0.75) * 2})`;
        g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fill();
      }
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
  }

  // ---- PATINA: a static, mottled canvas/leaf texture baked once. Blended over
  //  the crisp vector motifs each frame, it gives the whole field the uneven,
  //  slightly hazy, aged-gold-leaf feel of the real painting (instead of clean,
  //  flat shapes). Two layers: soft dark blotches (multiply) + fine grain.
  _buildPatina() {
    const W = Math.max(2, Math.round(this.w));
    const H = Math.max(2, Math.round(this.h));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");

    // 1) large soft blotches of light/dark — uneven leaf & worn patches
    const blobs = Math.round((W * H) / 14000);
    for (let i = 0; i < blobs; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = rand(this.cell * 1.5, this.cell * 6);
      const dark = Math.random() < 0.6;
      const a = rand(0.04, 0.13);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      if (dark) {
        grd.addColorStop(0, `rgba(30,18,4,${a})`);
        grd.addColorStop(1, "rgba(30,18,4,0)");
      } else {
        grd.addColorStop(0, `rgba(255,238,180,${a * 0.9})`);
        grd.addColorStop(1, "rgba(255,238,180,0)");
      }
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }

    // 2) fine speckle grain (canvas tooth) via a small ImageData tile, tiled
    const tile = document.createElement("canvas");
    const TS = 128; tile.width = TS; tile.height = TS;
    const tg = tile.getContext("2d");
    const img = tg.createImageData(TS, TS);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = (Math.random() * 26) | 0;       // very faint
    }
    tg.putImageData(img, 0, 0);
    for (let y = 0; y < H; y += TS) for (let x = 0; x < W; x += TS) g.drawImage(tile, x, y);

    this._patina = c;
  }

  // blend the patina over the finished frame for a painterly, hazy surface
  _paintPatina(g) {
    if (!this._patina) return;
    g.save();
    // mottled tone → multiply darkens the blotches into the gold unevenly
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 0.55;
    g.drawImage(this._patina, 0, 0, this.w, this.h);
    // a touch of soft-light lifts the bright blotches → glow/haze
    g.globalCompositeOperation = "soft-light";
    g.globalAlpha = 0.5;
    g.drawImage(this._patina, 0, 0, this.w, this.h);
    g.restore();
  }

  _vignette(g) {
    const W = this.w, H = this.h;
    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35,
                                        W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  // fill the whole field with one robe (clear patches, push the base diagonal
  // fully to one extreme so every point reads as that side)
  _fillMan()   { this.patches.length = 0; this.boundary = this.sHi; }
  _fillWoman() { this.patches.length = 0; this.boundary = this.sLo; }

  controls(host) {
    host.appendChild(slider("SHIMMER", 0.2, 2.2, this.shimmer, 0.05,
      (v) => (this.shimmer = v)));
    host.appendChild(slider("PATTERN", 0.6, 1.8, this.cellMul, 0.05,
      (v) => { this.cellMul = v; this._buildPatterns(); this._resetSeam(); },
      (v) => `${Math.round(v * 100)}%`));
    host.appendChild(slider("GOLD", 0, 1, this.gold, 0.02,
      (v) => (this.gold = v), (v) => `${Math.round(v * 100)}%`));
    host.appendChild(buttonRow([
      { label: "반반 (reset)", on: () => this._resetSeam() },
      { label: "전부 남자 옷", on: () => this._fillMan() },
      { label: "전부 여자 옷", on: () => this._fillWoman() },
    ]));
  }
}
