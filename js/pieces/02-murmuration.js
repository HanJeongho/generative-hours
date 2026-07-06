// ============================================================================
//  02 · Murmuration — boids flocking
//  A starling-like swarm governed by three local steering rules: separation,
//  alignment, cohesion. Neighbours are found via a uniform spatial grid so the
//  swarm scales to ~900 boids at 60fps. The pointer is a predator the flock
//  flees from. Each boid is a short accent-blue streak left on a fading trail.
// ============================================================================

import { Piece, TAU, clamp, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Murmuration extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // steering weights (driven by sliders)
    this.cohesion = 0.9;
    this.alignment = 1.0;
    this.separation = 1.4;
    this.speed = 1.0;             // global speed multiplier
    this.R = 42;                  // neighbour radius (px) — also the grid cell size
    this.maxSpeed = 2.6;          // base px/step at speed=1
    this.creature = "spark";      // which organism shape to draw: spark|bird|fish|butterfly
    this.boids = [];
    this.spawn();
    // paint an initial dark wash so trails build on near-black
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#04060a";
    g.fillRect(0, 0, this.w, this.h);
  }

  _targetCount() {
    return Math.round(Math.min(900, (this.w * this.h) / 1600));
  }

  // seed the whole flock at random positions/headings so it's alive immediately
  spawn() {
    this.count = this._targetCount();
    this.boids.length = 0;
    for (let i = 0; i < this.count; i++) {
      const a = rand(TAU);
      this.boids.push({
        x: rand(this.w), y: rand(this.h),
        vx: Math.cos(a) * this.maxSpeed, vy: Math.sin(a) * this.maxSpeed,
        ph: rand(TAU),               // per-boid phase (wing flap / tail wag)
      });
    }
  }

  onResize() {
    this.spawn();
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#04060a";
    g.fillRect(0, 0, this.w, this.h);
  }

  // ---- uniform spatial grid: bucket boids into R-sized cells -----------------
  _buildGrid() {
    const cell = this.R;
    const cols = Math.max(1, Math.ceil(this.w / cell));
    const rows = Math.max(1, Math.ceil(this.h / cell));
    const grid = new Array(cols * rows);
    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];
      const cx = clamp((b.x / cell) | 0, 0, cols - 1);
      const cy = clamp((b.y / cell) | 0, 0, rows - 1);
      const k = cy * cols + cx;
      (grid[k] || (grid[k] = [])).push(i);
    }
    this._grid = grid; this._cols = cols; this._rows = rows; this._cell = cell;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // fade previous frame → motion trails (source-over, near-black, low alpha)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(4,6,10,0.16)";
    g.fillRect(0, 0, this.w, this.h);

    this._buildGrid();
    const { _grid: grid, _cols: cols, _rows: rows, _cell: cell } = this;
    const R = this.R, R2 = R * R;
    const ptr = this.pointer;
    const predR = 120, predR2 = predR * predR;
    const maxSp = this.maxSpeed * this.speed;

    // normalise dt to a ~60fps step so motion is framerate-independent
    const step = clamp(dt * 60, 0.5, 2);

    g.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];
      const cx = clamp((b.x / cell) | 0, 0, cols - 1);
      const cy = clamp((b.y / cell) | 0, 0, rows - 1);

      // accumulators for the three rules
      let sepX = 0, sepY = 0;            // separation: push from too-close
      let aliX = 0, aliY = 0, aliN = 0;  // alignment: average neighbour velocity
      let cohX = 0, cohY = 0, cohN = 0;  // cohesion: average neighbour position

      // visit only the 3x3 block of cells around this boid
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= rows) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (gx < 0 || gx >= cols) continue;
          const bucket = grid[gy * cols + gx];
          if (!bucket) continue;
          for (let bi = 0; bi < bucket.length; bi++) {
            const j = bucket[bi];
            if (j === i) continue;
            const o = this.boids[j];
            const dx = b.x - o.x, dy = b.y - o.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 === 0) continue;
            // separation falls off with closeness (1/d weighting)
            const inv = 1 / Math.sqrt(d2);
            sepX += dx * inv * inv; sepY += dy * inv * inv;
            aliX += o.vx; aliY += o.vy; aliN++;
            cohX += o.x; cohY += o.y; cohN++;
          }
        }
      }

      // accelerations from each weighted rule
      let ax = 0, ay = 0;
      if (cohN > 0) {                              // cohesion → local centre
        const tx = cohX / cohN - b.x, ty = cohY / cohN - b.y;
        ax += tx * 0.0016 * this.cohesion;
        ay += ty * 0.0016 * this.cohesion;
      }
      if (aliN > 0) {                              // alignment → match heading
        ax += (aliX / aliN - b.vx) * 0.05 * this.alignment;
        ay += (aliY / aliN - b.vy) * 0.05 * this.alignment;
      }
      ax += sepX * 0.9 * this.separation;          // separation → spread out
      ay += sepY * 0.9 * this.separation;

      // predator: flee the active pointer (stronger when pressed)
      if (ptr.active) {
        const dx = b.x - ptr.x, dy = b.y - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < predR2 && d2 > 0) {
          const d = Math.sqrt(d2);
          const force = (1 - d / predR) * (ptr.down ? 2.4 : 1.1);
          ax += (dx / d) * force; ay += (dy / d) * force;
        }
      }

      // integrate velocity, then clamp to max speed
      b.vx += ax * step; b.vy += ay * step;
      let sp = Math.hypot(b.vx, b.vy);
      if (sp > maxSp) { const k = maxSp / sp; b.vx *= k; b.vy *= k; sp = maxSp; }
      else if (sp < 0.35 * maxSp && sp > 0) { const k = (0.35 * maxSp) / sp; b.vx *= k; b.vy *= k; }

      // advance + wrap around edges
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.x < 0) b.x += this.w; else if (b.x >= this.w) b.x -= this.w;
      if (b.y < 0) b.y += this.h; else if (b.y >= this.h) b.y -= this.h;

      // render: shape depends on selected creature; faster → brighter
      const f = clamp(sp / maxSp, 0, 1);
      const nx = b.vx / (sp || 1), ny = b.vy / (sp || 1);
      this._draw(g, b, nx, ny, f, t);
    }
    g.globalAlpha = 1;
  }

  // ---- per-creature rendering ------------------------------------------------
  // All shapes are oriented by heading (nx,ny). f = speed fraction (0..1).
  _draw(g, b, nx, ny, f, t) {
    const px = -ny, py = nx;          // perpendicular (left wing direction)
    switch (this.creature) {
      case "bird": {
        // A swift/gull: slim body (head→tail) with two swept-back curved wings
        // that hinge at the shoulders and beat over time. Curves (not straight
        // lines) keep it from reading as a boomerang.
        g.globalCompositeOperation = "source-over";
        const flap = Math.sin(t * 6 + b.ph);                 // -1..1 wing beat
        const span = 8 + f * 4;                              // wing reach (out)
        const sweep = 5 + f * 2.5;                           // wingtip trails back this far
        const lift = flap * 3.5;                             // beat raises/lowers tips
        // body axis
        const headX = b.x + nx * 5, headY = b.y + ny * 5;    // beak
        const tailX = b.x - nx * 6, tailY = b.y - ny * 6;    // tail tip
        const shX = b.x + nx * 1, shY = b.y + ny * 1;        // shoulder (wing root)
        // wingtips: out + back, beating fore/aft with flap
        const tipLx = shX - nx * (sweep - lift) + px * span, tipLy = shY - ny * (sweep - lift) + py * span;
        const tipRx = shX - nx * (sweep - lift) - px * span, tipRy = shY - ny * (sweep - lift) - py * span;
        g.globalAlpha = 0.6 + f * 0.4;
        g.strokeStyle = this.accent;
        g.lineWidth = 1.4;
        g.lineCap = "round"; g.lineJoin = "round";
        // body
        g.beginPath();
        g.moveTo(headX, headY); g.lineTo(tailX, tailY);
        g.stroke();
        // wings: curve from shoulder out to tip, bowing back (control point behind shoulder)
        const cbx = shX - nx * sweep, cby = shY - ny * sweep;
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(shX, shY);
        g.quadraticCurveTo(cbx + px * span * 0.5, cby + py * span * 0.5, tipLx, tipLy);
        g.moveTo(shX, shY);
        g.quadraticCurveTo(cbx - px * span * 0.5, cby - py * span * 0.5, tipRx, tipRy);
        g.stroke();
        break;
      }
      case "fish": {
        // teardrop body + forked tail that wags
        g.globalCompositeOperation = "source-over";
        const wag = Math.sin(t * 9 + b.ph) * 2.2;
        const bodyL = 7 + f * 3, bodyW = 2.4 + f * 0.8;
        const hx = b.x + nx * bodyL, hy = b.y + ny * bodyL;          // nose
        const tx = b.x - nx * bodyL * 0.7, ty = b.y - ny * bodyL * 0.7; // tail base
        g.globalAlpha = 0.55 + f * 0.4;
        g.fillStyle = this.accent;
        // body: ellipse-ish via quad curves through side points
        const sx = px * bodyW, sy = py * bodyW;
        g.beginPath();
        g.moveTo(hx, hy);
        g.quadraticCurveTo(b.x + sx, b.y + sy, tx, ty);
        g.quadraticCurveTo(b.x - sx, b.y - sy, hx, hy);
        g.fill();
        // forked tail, wagging perpendicular
        g.strokeStyle = this.accent; g.lineWidth = 1.3; g.lineCap = "round";
        const fork = 3.2;
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(tx - nx * fork + px * (fork * 0.7 + wag), ty - ny * fork + py * (fork * 0.7 + wag));
        g.moveTo(tx, ty);
        g.lineTo(tx - nx * fork - px * (fork * 0.7 - wag), ty - ny * fork - py * (fork * 0.7 - wag));
        g.stroke();
        break;
      }
      case "butterfly": {
        // top-down butterfly: two rounded wings flapping open/shut on either
        // side of a slim central body that joins them. Kept simple — at this
        // size a clean two-wing silhouette reads better than fore/hind detail.
        g.globalCompositeOperation = "source-over";
        const flap = 0.28 + 0.72 * Math.abs(Math.sin(t * 8 + b.ph)); // wing openness
        const wing = 5 + f * 2;
        // wings: a pair of ellipses pushed out from the body by the flap amount
        g.globalAlpha = 0.48 + f * 0.4;
        g.fillStyle = this.accent;
        for (const s of [1, -1]) {       // left & right wing
          const wx = b.x + px * s * wing * flap, wy = b.y + py * s * wing * flap;
          g.save();
          g.translate(wx, wy);
          g.rotate(Math.atan2(ny, nx));
          g.beginPath();
          g.ellipse(0, 0, wing, wing * 0.62, 0, 0, TAU);
          g.fill();
          g.restore();
        }
        // central body joining the two wings (bright slim capsule along heading)
        g.globalAlpha = 0.85 + f * 0.15;
        g.strokeStyle = `rgba(${205 + f * 50},${228 + f * 27},255,1)`;
        g.lineWidth = 1.8; g.lineCap = "round";
        g.beginPath();
        g.moveTo(b.x + nx * 3.2, b.y + ny * 3.2);
        g.lineTo(b.x - nx * 3.2, b.y - ny * 3.2);
        g.stroke();
        break;
      }
      default: {
        // spark (original): short oriented streak + bright head, additive glow
        g.globalCompositeOperation = "lighter";
        const len = 4 + f * 5;
        g.strokeStyle = this.accent;
        g.globalAlpha = 0.35 + f * 0.4;
        g.lineWidth = 1.4;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(b.x - nx * len, b.y - ny * len);
        g.lineTo(b.x + nx * len * 0.6, b.y + ny * len * 0.6);
        g.stroke();
        g.globalAlpha = 0.5 + f * 0.5;
        g.fillStyle = `rgba(${190 + f * 65},${220 + f * 35},255,1)`;
        g.fillRect(b.x + nx * len * 0.6 - 0.8, b.y + ny * len * 0.6 - 0.8, 1.6, 1.6);
      }
    }
  }

  controls(host) {
    // creature picker — boids motion is unchanged; only the drawn shape switches
    const creatures = [
      { key: "spark", label: "빛입자" },
      { key: "bird", label: "새" },
      { key: "fish", label: "물고기" },
      { key: "butterfly", label: "나비" },
    ];
    const row = buttonRow(creatures.map((c) => ({
      label: c.label,
      on: (el) => {
        this.creature = c.key;
        // mark the chosen button active, clear siblings
        for (const sib of el.parentElement.children) sib.classList.remove("is-active");
        el.classList.add("is-active");
      },
    })));
    // reflect the initial selection on first render
    const btns = row.querySelectorAll(".ctrl__btn");
    creatures.forEach((c, i) => { if (c.key === this.creature) btns[i].classList.add("is-active"); });
    host.appendChild(row);

    host.appendChild(slider("COHESION", 0, 2.5, this.cohesion, 0.05, (v) => (this.cohesion = v)));
    host.appendChild(slider("ALIGNMENT", 0, 2.5, this.alignment, 0.05, (v) => (this.alignment = v)));
    host.appendChild(slider("SEPARATION", 0, 3, this.separation, 0.05, (v) => (this.separation = v)));
    host.appendChild(slider("SPEED", 0.3, 2.2, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(buttonRow([
      { label: "재생성 (Reset)", on: () => this.spawn() },
    ]));
  }
}
