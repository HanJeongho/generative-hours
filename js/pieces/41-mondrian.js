// ============================================================================
//  41 · 구성 (After Mondrian — Composition in Red, Blue and Yellow)
//  Neoplasticism, alive. A binary-space-partition / guillotine layout holds a
//  set of rectangles formed by recursive horizontal & vertical splits. The
//  black grid lines that separate them are thick — Mondrian's signature came —
//  and a few cells are flooded with pure red / blue / yellow while a big white
//  field dominates, keeping the asymmetric-but-balanced De Stijl feel.
//  It breathes: every split's position eases toward a slowly-shifting target,
//  so the grid gently reflows and the rectangles resize; once in a while a
//  colour block migrates to a fresh cell. CLICK a cell to split it (the divide
//  animates open); CLICK a small cell — or alt/shift-click any cell — to cycle
//  its colour (white → red → blue → yellow → white). Drag a black line to nudge.
// ============================================================================

import { Piece, clamp, lerp, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

// De Stijl palette — flat, pure, high-contrast.
const GROUND = "#f4f1e9";   // warm off-white / cream field
const LINE = "#111111";     // thick black came
const FILLS = {
  red: "#d4112a",
  blue: "#0a4fa3",
  yellow: "#f4c20d",
  white: GROUND,
};
const COLOR_CYCLE = ["white", "red", "blue", "yellow"]; // click-to-cycle order

let UID = 1; // stable node ids for animation continuity

export default class Mondrian extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.order = 1.0;        // reflow frequency / animation speed multiplier
    this.density = 11;       // target number of leaf cells
    this.colorAmt = 4;       // how many leaf cells carry a primary colour
    this.lineW = 9;          // came thickness (CSS px) — Mondrian-thick
    this._reflowAcc = 0;     // seconds until next gentle reflow
    this._migrateAcc = 0;    // seconds until next colour migration
    this.hoverLeaf = null;   // cell under pointer (faint highlight)
    this.dragSplit = null;   // BSP node whose divider is being dragged
    this._mod = false;       // alt/shift held at the last press (recolour modifier)
    this.tree = this._buildTree(this.density);
    this._assignColors(this.colorAmt);
    // capture the modifier key from the real pointer event (window.event is
    // deprecated & unreliable); the engine's pointer state doesn't carry it.
    // Use the CAPTURE phase so this runs *before* the engine's bubble-phase
    // handler that calls onPointerDown() — so _mod is fresh when we read it.
    this.on(this.canvas, "pointerdown", (e) => { this._mod = e.altKey || e.shiftKey; }, true);
  }

  // ---- BSP / guillotine tree ------------------------------------------------
  // A node is either a leaf {leaf:true, color, hover} or an internal split
  // {dir:'h'|'v', pos, posT, a, b}. pos is the *current* split fraction (0..1),
  // posT the eased target. Rectangles are derived on the fly from the tree.
  _leaf() {
    return { id: UID++, leaf: true, color: "white", colorT: "white", mix: 1, hover: 0 };
  }

  // Turn `node` (a leaf) into an internal split. Child `a` inherits this leaf's
  // colour state so the existing fill stays put when a cell divides; child `b`
  // is a fresh white cell. We build `a` as a NEW object (never alias `node`).
  _split(node, dir, pos) {
    const a = {
      id: node.id, leaf: true,
      color: node.color, colorT: node.colorT, mix: node.mix, hover: 0,
    };
    node.id = UID++;
    node.leaf = false;
    node.dir = dir;
    node.pos = pos;
    node.posT = pos;
    node.a = a;
    node.b = this._leaf();
    delete node.color; delete node.colorT; delete node.mix; delete node.hover;
    return node;
  }

  // Build a fresh, balanced composition with ~targetLeaves cells. We split the
  // largest leaf each step, alternating direction, biasing splits off-centre
  // so the big white field survives — the hallmark Mondrian imbalance.
  _buildTree(targetLeaves) {
    UID = 1;
    const root = this._leaf();
    root._w = 1; root._h = 1; // relative size bookkeeping during construction
    const leaves = [root];
    let n = 1;
    let guard = 0;
    while (n < targetLeaves && guard++ < 200) {
      // pick among the larger leaves so we keep some big areas
      leaves.sort((p, q) => q._w * q._h - p._w * p._h);
      const pickFrom = Math.max(1, Math.ceil(leaves.length * 0.5));
      const leaf = leaves[(Math.random() * pickFrom) | 0];
      const idx = leaves.indexOf(leaf);
      // alternate-ish: split along the longer side so cells stay rectangular
      const dir = leaf._w >= leaf._h ? "v" : "h";
      const pos = rand(0.32, 0.68); // off-centre, but not extreme
      this._split(leaf, dir, pos);
      if (dir === "v") {
        leaf.a._w = leaf._w * pos; leaf.a._h = leaf._h;
        leaf.b._w = leaf._w * (1 - pos); leaf.b._h = leaf._h;
      } else {
        leaf.a._w = leaf._w; leaf.a._h = leaf._h * pos;
        leaf.b._w = leaf._w; leaf.b._h = leaf._h * (1 - pos);
      }
      leaves.splice(idx, 1, leaf.a, leaf.b);
      n++;
    }
    return root;
  }

  // collect leaf nodes with their pixel rects (in CSS px, inset by margin)
  _leaves(out) {
    out.length = 0;
    const m = this.lineW; // keep a came-width margin around the whole pane
    this._walk(this.tree, m, m, this.w - 2 * m, this.h - 2 * m, out);
    return out;
  }
  _walk(node, x, y, w, h, out) {
    if (node.leaf) { out.push({ node, x, y, w, h }); return; }
    const p = clamp(node.pos, 0.08, 0.92);
    if (node.dir === "v") {
      const aw = w * p;
      this._walk(node.a, x, y, aw, h, out);
      this._walk(node.b, x + aw, y, w - aw, h, out);
    } else {
      const ah = h * p;
      this._walk(node.a, x, y, w, ah, out);
      this._walk(node.b, x, y + ah, w, h - ah, out);
    }
  }

  // ---- colour ---------------------------------------------------------------
  _allLeaves() { const a = []; this._collect(this.tree, a); return a; }
  _collect(node, a) {
    if (node.leaf) { a.push(node); return; }
    this._collect(node.a, a); this._collect(node.b, a);
  }

  // Choose `count` leaves to wear primary colours; the rest go white. Favour a
  // bold spread of red/blue/yellow without two of the same crowding together.
  _assignColors(count) {
    const leaves = this._allLeaves();
    for (const lf of leaves) this._setColor(lf, "white");
    const pool = leaves.slice();
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // round-robin the three primaries so increasing COLOR always adds visibly
    // MORE coloured cells AND keeps red/blue/yellow balanced (not all one hue).
    const colors = ["red", "blue", "yellow"];
    const start = (Math.random() * 3) | 0;
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      this._setColor(pool[i], colors[(start + i) % 3]);
    }
  }

  _setColor(leaf, color) {
    leaf.colorT = color;
    if (leaf.color === undefined) leaf.color = color;
    if (leaf.color !== color) leaf.mix = 0; // start cross-fade
    else leaf.mix = 1;
  }

  // migrate one colour block to a different (currently white) cell — the
  // composition keeps recomposing its balance over time.
  _migrateColor() {
    const leaves = this._allLeaves();
    const colored = leaves.filter((l) => l.colorT !== "white");
    const white = leaves.filter((l) => l.colorT === "white");
    if (!colored.length || !white.length) return;
    const from = colored[(Math.random() * colored.length) | 0];
    const to = white[(Math.random() * white.length) | 0];
    const c = from.colorT;
    this._setColor(from, "white");
    this._setColor(to, c);
  }

  // gently reflow: nudge every split's eased target so the grid drifts
  _reflowTargets() {
    this._walk2(this.tree);
  }
  _walk2(node) {
    if (node.leaf) return;
    node.posT = clamp(node.posT + rand(-0.12, 0.12), 0.2, 0.8);
    this._walk2(node.a); this._walk2(node.b);
  }

  onResize() { /* rects derive from tree each frame — nothing cached to fix */ }

  // ---- interaction ----------------------------------------------------------
  onPointerDown() {
    const p = this.pointer;
    // 1) if pressing near a black divider, grab it for dragging
    const hit = this._lineHit(p.x, p.y);
    if (hit) { this.dragSplit = hit; return; }
    // 2) otherwise act on the cell under the cursor
    const cell = this._cellAt(p.x, p.y);
    if (!cell) return;
    const small = Math.min(cell.w, cell.h) < Math.min(this.w, this.h) * 0.16;
    if (small || this._mod) {
      this._cycleColor(cell.node);
    } else {
      this._splitCell(cell);
    }
  }
  onPointerUp() { this.dragSplit = null; }

  _cycleColor(leaf) {
    const cur = leaf.colorT || "white";
    const i = COLOR_CYCLE.indexOf(cur);
    const next = COLOR_CYCLE[(i + 1) % COLOR_CYCLE.length];
    this._setColor(leaf, next);
  }

  // split a leaf cell, alternating direction relative to its parent split.
  _splitCell(cell) {
    const leaf = cell.node;
    // split along the longer side so the children stay nicely rectangular
    const dir = cell.w >= cell.h ? "v" : "h";
    // _split() preserves this cell's colour onto child a; b becomes white.
    this._split(leaf, dir, 0.5);
    // animate the divide opening: start near-collapsed, ease toward centre
    leaf.posT = 0.5;
    leaf.pos = 0.1;
    // colour "paints itself": the freshly-created cell sometimes takes a primary
    // (biased toward whatever keeps the composition balanced), so splitting a
    // cell naturally grows the De Stijl colour blocks without manual recolour.
    if (Math.random() < 0.55) this._setColor(leaf.b, this._balancedColor());
    else this._setColor(leaf.b, "white");
  }

  // pick a primary that's currently UNDER-represented, so repeated splits spread
  // red/blue/yellow evenly rather than flooding one hue.
  _balancedColor() {
    const counts = { red: 0, blue: 0, yellow: 0 };
    for (const lf of this._allLeaves()) if (counts[lf.colorT] !== undefined) counts[lf.colorT]++;
    let best = "red", bn = Infinity;
    for (const c of ["red", "blue", "yellow"]) {
      // tiny random tiebreak so it isn't perfectly deterministic
      const n = counts[c] + Math.random() * 0.5;
      if (n < bn) { bn = n; best = c; }
    }
    return best;
  }

  // find the leaf-cell rect containing (x,y)
  _cellAt(x, y) {
    const cells = this._leaves([]);
    for (const c of cells) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
    }
    return null;
  }

  // find a split node whose divider line passes within grabbing distance of (x,y)
  _lineHit(x, y) {
    const tol = this.lineW + 5;
    const m = this.lineW;
    let found = null;
    const rec = (node, rx, ry, rw, rh) => {
      if (node.leaf || found) return;
      const p = clamp(node.pos, 0.08, 0.92);
      if (node.dir === "v") {
        const lx = rx + rw * p;
        if (Math.abs(x - lx) < tol && y >= ry && y <= ry + rh) found = node;
        rec(node.a, rx, ry, rw * p, rh);
        rec(node.b, rx + rw * p, ry, rw * (1 - p), rh);
      } else {
        const ly = ry + rh * p;
        if (Math.abs(y - ly) < tol && x >= rx && x <= rx + rw) found = node;
        rec(node.a, rx, ry, rw, rh * p);
        rec(node.b, rx, ry + rh * p, rw, rh * (1 - p));
      }
    };
    rec(this.tree, m, m, this.w - 2 * m, this.h - 2 * m);
    return found;
  }

  // while dragging, set the grabbed divider's position from the pointer
  _dragLine() {
    const node = this.dragSplit;
    if (!node) return;
    // recompute the rect this node occupies to convert pointer → fraction
    const m = this.lineW;
    const rect = this._rectOf(node, m, m, this.w - 2 * m, this.h - 2 * m, this.tree);
    if (!rect) return;
    let f;
    if (node.dir === "v") f = (this.pointer.x - rect.x) / rect.w;
    else f = (this.pointer.y - rect.y) / rect.h;
    node.posT = node.pos = clamp(f, 0.12, 0.88);
  }
  // locate the rect a given node occupies
  _rectOf(target, x, y, w, h, node) {
    if (node === target) return { x, y, w, h };
    if (node.leaf) return null;
    const p = clamp(node.pos, 0.08, 0.92);
    if (node.dir === "v") {
      return this._rectOf(target, x, y, w * p, h, node.a) ||
             this._rectOf(target, x + w * p, y, w * (1 - p), h, node.b);
    }
    return this._rectOf(target, x, y, w, h * p, node.a) ||
           this._rectOf(target, x, y + h * p, w, h * (1 - p), node.b);
  }

  // ---- frame ----------------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const o = this.order;

    // timers: reflow grid + migrate colour on slow, order-scaled intervals
    this._reflowAcc -= dt * o;
    if (this._reflowAcc <= 0) { this._reflowAcc = rand(4.5, 8.0); this._reflowTargets(); }
    this._migrateAcc -= dt * o;
    if (this._migrateAcc <= 0) { this._migrateAcc = rand(7, 13); this._migrateColor(); }

    if (this.dragSplit && this.pointer.down) this._dragLine();

    // ease every split position toward its target, ease every colour cross-fade
    const k = clamp(dt * (1.6 + o * 1.4), 0, 1);
    this._ease(this.tree, k, dt);

    // hover detection (faint cell highlight)
    this.hoverLeaf = null;
    if (this.pointer.active) {
      const c = this._cellAt(this.pointer.x, this.pointer.y);
      if (c) this.hoverLeaf = c.node;
    }

    // --- paint --------------------------------------------------------------
    // cream ground (also covers the outer margin so the came frames the edge)
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.w, this.h);

    const cells = this._leaves([]);

    // 1) flat fills (colour cross-fade via overlaid alpha)
    for (const c of cells) {
      const lf = c.node;
      lf.hover += ((lf === this.hoverLeaf ? 1 : 0) - lf.hover) * Math.min(1, dt * 10);
      const base = FILLS[lf.color] || GROUND;
      g.fillStyle = base;
      g.fillRect(c.x, c.y, c.w, c.h);
      if (lf.mix < 1) {
        // fade the new target colour in over the old fill
        g.globalAlpha = lf.mix;
        g.fillStyle = FILLS[lf.colorT] || GROUND;
        g.fillRect(c.x, c.y, c.w, c.h);
        g.globalAlpha = 1;
      }
      // faint hover wash
      if (lf.hover > 0.001) {
        g.fillStyle = `rgba(0,0,0,${0.05 * lf.hover})`;
        g.fillRect(c.x, c.y, c.w, c.h);
      }
    }

    // 2) thick black came — drawn LAST, on top of everything.
    g.fillStyle = LINE;
    const m = this.lineW;
    const lw = this.lineW;
    // outer frame
    g.fillRect(0, 0, this.w, m);
    g.fillRect(0, this.h - m, this.w, m);
    g.fillRect(0, 0, m, this.h);
    g.fillRect(this.w - m, 0, m, this.h);
    // internal dividers, walked from the tree so they stay crisp & continuous
    this._drawLines(g, this.tree, m, m, this.w - 2 * m, this.h - 2 * m, lw);

    // 3) dragged divider gets a subtle emphasis so the grab reads
    if (this.dragSplit) {
      g.fillStyle = "rgba(212,17,42,0.0)"; // reserved hook; came already bold
    }
  }

  _ease(node, k, dt) {
    if (node.leaf) {
      if (node.mix < 1) {
        node.mix = clamp(node.mix + dt * 1.8, 0, 1);
        if (node.mix >= 1) node.color = node.colorT; // commit
      }
      return;
    }
    node.pos = lerp(node.pos, node.posT, k);
    this._ease(node.a, k, dt); this._ease(node.b, k, dt);
  }

  _drawLines(g, node, x, y, w, h, lw) {
    if (node.leaf) return;
    const p = clamp(node.pos, 0.08, 0.92);
    if (node.dir === "v") {
      const lx = x + w * p;
      g.fillRect(lx - lw / 2, y - lw / 2, lw, h + lw); // bar spans the cell height
      this._drawLines(g, node.a, x, y, w * p, h, lw);
      this._drawLines(g, node.b, x + w * p, y, w * (1 - p), h, lw);
    } else {
      const ly = y + h * p;
      g.fillRect(x - lw / 2, ly - lw / 2, w + lw, lw);
      this._drawLines(g, node.a, x, y, w, h * p, lw);
      this._drawLines(g, node.b, x, y + h * p, w, h * (1 - p), lw);
    }
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("ORDER", 0.2, 3, this.order, 0.05,
      (v) => (this.order = v), (v) => (+v).toFixed(2)));

    host.appendChild(slider("DENSITY", 4, 24, this.density, 1, (v) => {
      this.density = v | 0;
      this.tree = this._buildTree(this.density);
      this._assignColors(Math.min(this.colorAmt, this.density));
    }, (v) => String(v | 0)));

    host.appendChild(slider("COLOR", 0, 9, this.colorAmt, 1, (v) => {
      this.colorAmt = v | 0;
      this._assignColors(this.colorAmt);
    }, (v) => String(v | 0)));

    host.appendChild(buttonRow([
      {
        label: "새 구성 (recompose)", on: () => {
          this.tree = this._buildTree(this.density);
          this._assignColors(Math.min(this.colorAmt, this.density));
        }
      },
      {
        label: "흑백 (monochrome)", on: () => {
          for (const lf of this._allLeaves()) this._setColor(lf, "white");
        }
      },
    ]));
  }
}
