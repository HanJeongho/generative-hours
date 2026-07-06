// ============================================================================
//  20 · Constellation — force-directed network laid out by physics
//  A random graph of nodes + edges settles into equilibrium via a
//  Fruchterman-Reingold style simulation: every pair of nodes REPELS
//  (Coulomb, ~k²/d), connected nodes ATTRACT along their springs (~d²/k).
//  Velocities cool with damping so the layout balances into a star-map, then
//  keeps a gentle jiggle alive. Grab a node to drag the whole web behind it.
// ============================================================================

import { Piece, TAU, clamp, rand, lerp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

export default class Constellation extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.charge = 1.0;          // repulsion multiplier (k scaling)
    this.spring = 1.0;          // attraction / link strength multiplier
    this.count = 56;            // node count
    this.grabbed = -1;          // index of dragged node, -1 = none
    this.hover = -1;            // index of hovered node (highlight neighbours)
    this.buildGraph(this.count);
  }

  // ---- graph construction --------------------------------------------------
  buildGraph(n) {
    this.count = n;
    this.nodes = [];
    this.edges = [];
    const cx = this.w / 2, cy = this.h / 2;
    // scatter nodes near centre so the simulation has room to expand outward
    for (let i = 0; i < n; i++) {
      this.nodes.push({
        x: cx + rand(-1, 1) * this.w * 0.18,
        y: cy + rand(-1, 1) * this.h * 0.18,
        vx: 0, vy: 0,
        deg: 0,
        tw: rand(0, TAU),        // twinkle phase
      });
    }
    // chain backbone guarantees the graph is fully connected (no orphans)
    for (let i = 1; i < n; i++) this._link(i, (Math.random() * i) | 0);
    // a few cluster seeds: extra short-range links create denser knots
    const extra = Math.round(n * 0.6);
    for (let k = 0; k < extra; k++) {
      const a = (Math.random() * n) | 0;
      const b = (Math.random() * n) | 0;
      if (a !== b) this._link(a, b);
    }
    // ideal edge length k ~ sqrt(area / n): the FR equilibrium spacing
    this.k = Math.sqrt((this.w * this.h) / Math.max(1, n)) * 0.55;
    this.temp = this.k * 0.9;    // cooling "temperature" — large at first
  }

  _link(a, b) {
    // avoid duplicate undirected edges
    for (const e of this.edges) if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return;
    this.edges.push({ a, b, len: 0 });
    this.nodes[a].deg++; this.nodes[b].deg++;
  }

  reseed() {
    // randomize positions but keep the same graph topology
    const cx = this.w / 2, cy = this.h / 2;
    for (const p of this.nodes) {
      p.x = cx + rand(-1, 1) * this.w * 0.18;
      p.y = cy + rand(-1, 1) * this.h * 0.18;
      p.vx = p.vy = 0;
    }
    this.temp = this.k * 0.9;
  }

  onResize() {
    // keep current layout but recompute spacing for the new canvas size
    this.k = Math.sqrt((this.w * this.h) / Math.max(1, this.count)) * 0.55;
  }

  // ---- interaction ---------------------------------------------------------
  onPointerDown() {
    // grab the node nearest the pointer (within a generous radius)
    let best = -1, bd = 60 * 60;
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i];
      const dx = p.x - this.pointer.x, dy = p.y - this.pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    this.grabbed = best;
    this.temp = Math.max(this.temp, this.k * 0.35); // re-energize so web reflows
  }
  onPointerUp() { this.grabbed = -1; }

  // ---- simulation ----------------------------------------------------------
  step(dt) {
    const N = this.nodes.length;
    const k = this.k;
    const krep = k * k * this.charge;      // repulsive constant k²
    const cx = this.w / 2, cy = this.h / 2;

    // pairwise repulsion — O(n²), fine for N ≤ 80
    for (let i = 0; i < N; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = rand(-1, 1); dy = rand(-1, 1); d2 = 1; }
        const d = Math.sqrt(d2);
        const f = krep / d2;               // Coulomb-like falloff
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    // spring attraction along edges (force ~ d²/k)
    const ks = (1 / k) * this.spring;
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) + 0.001;
      e.len = d;
      const f = (d * d) * ks * 0.5;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // gravity toward centre keeps disconnected clusters from drifting away
    for (const p of this.nodes) {
      p.vx += (cx - p.x) * 0.0015;
      p.vy += (cy - p.y) * 0.0015;
    }

    // integrate with damping + temperature-limited displacement (cooling)
    const damp = 0.86;
    const maxStep = this.temp;
    for (let i = 0; i < N; i++) {
      const p = this.nodes[i];
      if (i === this.grabbed) {
        // dragged node is pinned to the pointer; the rest follows via springs
        p.x = this.pointer.x; p.y = this.pointer.y;
        p.vx = p.vy = 0;
        continue;
      }
      p.vx *= damp; p.vy *= damp;
      // clamp velocity magnitude to the current temperature
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > maxStep) { p.vx = (p.vx / sp) * maxStep; p.vy = (p.vy / sp) * maxStep; }
      p.x += p.vx; p.y += p.vy;
      // soft bounds — nudge stray nodes back into frame
      const m = 24;
      if (p.x < m) p.vx += (m - p.x) * 0.04;
      if (p.x > this.w - m) p.vx -= (p.x - (this.w - m)) * 0.04;
      if (p.y < m) p.vy += (m - p.y) * 0.04;
      if (p.y > this.h - m) p.vy -= (p.y - (this.h - m)) * 0.04;
    }

    // cool toward a small floor so the constellation keeps a faint life
    this.temp = lerp(this.temp, this.k * 0.06, 0.02);
  }

  // ---- render --------------------------------------------------------------
  frame(dt, t) {
    this.step(dt);

    // hover detection (highlight node + neighbours)
    this.hover = -1;
    if (this.pointer.active && this.grabbed < 0) {
      let bd = 26 * 26;
      for (let i = 0; i < this.nodes.length; i++) {
        const p = this.nodes[i];
        const dx = p.x - this.pointer.x, dy = p.y - this.pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; this.hover = i; }
      }
    }
    const hot = this.hover >= 0 ? this.hover : this.grabbed;
    const neigh = new Set();
    if (hot >= 0) for (const e of this.edges) {
      if (e.a === hot) neigh.add(e.b);
      if (e.b === hot) neigh.add(e.a);
    }

    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // near-black background wash
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#06050a";
    g.fillRect(0, 0, this.w, this.h);

    // accent: pink/rose family regardless of incoming accent hex
    const A = "255,120,170";       // base rose
    const B = "255,180,210";       // lighter pink for hot links

    // edges — additive glow, brighter when shorter/tauter
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const taut = clamp(this.k / (e.len + 1), 0, 1.4);   // <1 stretched, >1 compressed
      const isHot = hot >= 0 && (e.a === hot || e.b === hot);
      const alpha = (isHot ? 0.55 : 0.10) + taut * 0.16;
      g.strokeStyle = `rgba(${isHot ? B : A},${clamp(alpha, 0, 0.85)})`;
      g.lineWidth = isHot ? 1.6 : 0.5 + taut * 0.6;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    // nodes — glowing stars, radius by degree, with twinkle
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i];
      const tw = 0.75 + 0.25 * Math.sin(t * 2.2 + p.tw);   // subtle pulse
      const r = (2.0 + Math.sqrt(p.deg) * 1.5) * tw;
      const isHot = i === hot;
      const near = neigh.has(i);
      const col = isHot ? B : (near ? B : A);
      // soft radial halo
      const hr = r * (isHot ? 6 : 4);
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, hr);
      grd.addColorStop(0, `rgba(${col},${(isHot ? 0.9 : 0.5) * tw})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(p.x, p.y, hr, 0, TAU); g.fill();
      // bright core
      g.fillStyle = `rgba(255,235,245,${isHot ? 1 : 0.85})`;
      g.beginPath(); g.arc(p.x, p.y, r * 0.6, 0, TAU); g.fill();
    }
  }

  // ---- controls ------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("REPULSION", 0.3, 3.0, this.charge, 0.05,
      (v) => (this.charge = v)));
    host.appendChild(slider("LINK STRENGTH", 0.2, 2.5, this.spring, 0.05,
      (v) => (this.spring = v)));
    host.appendChild(slider("NODE COUNT", 24, 80, this.count, 1,
      (v) => this.buildGraph(v | 0), (v) => String(v | 0)));
    host.appendChild(buttonRow([
      { label: "재배치 (re-seed)", on: () => this.reseed() },
      { label: "새 성좌 (new graph)", on: () => this.buildGraph(this.count) },
    ]));
  }
}
