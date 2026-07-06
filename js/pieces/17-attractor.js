// ============================================================================
//  17 · Strange Attractor — Clifford / de Jong point clouds
//  Iterating a 2-parameter map millions of times traces a fractal dust that
//  never repeats yet never escapes. Parameters drift gently (or are dragged),
//  density accumulates as additive light, and the cloud slowly auto-explores.
// ============================================================================

import { Piece, hexToRgb, lerp, clamp, map as remap } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const TYPES = ["dejong", "clifford"];

export default class Attractor extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    // de Jong by default: it fills the screen robustly even as you drag the
    // parameters around (clifford's product term collapses to a point more often).
    this.type = "dejong";
    // parameters (a well-known de Jong attractor that fills the frame)
    this.a = 1.641; this.b = 1.902; this.c = 0.316; this.d = 1.525;
    this.target = { a: this.a, b: this.b, c: this.c, d: this.d };
    this.autoExplore = true;
    this.exploreTimer = 0;
    this.perFrame = 26000;     // iterations per frame
    this.zoom = 1;
    this.fitScale = 0.27;      // auto-fit factor (eased so any attractor fills the frame)
    this.accentRgb = hexToRgb(this.accent);
    this._resetAccum();
  }

  _resetAccum() {
    // density buffer for accumulation glow
    this.aw = this.canvas.width; this.ah = this.canvas.height;
    this.density = new Float32Array(this.aw * this.ah);
    this.maxD = 1;
    this.img = this.ctx.createImageData(this.aw, this.ah);
    this.x = 0.1; this.y = 0.1;
    // dark initial paint
    const g = this.ctx; g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#050507"; g.fillRect(0, 0, this.aw, this.ah);
  }

  onResize() { this._resetAccum(); }

  _newParams() {
    // pick parameters with |v| ≥ 1.6 so the attractor is always a spread cloud,
    // never a degenerate fixed point (same reasoning as the drag mapping).
    const r = () => (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.4);
    this.target = { a: r(), b: r(), c: r(), d: r() };
  }

  _iterate(px, py) {
    if (this.type === "clifford") {
      const nx = Math.sin(this.a * py) + this.c * Math.cos(this.a * px);
      const ny = Math.sin(this.b * px) + this.d * Math.cos(this.b * py);
      return [nx, ny];
    } else { // de Jong
      const nx = Math.sin(this.a * py) - Math.cos(this.b * px);
      const ny = Math.sin(this.c * px) - Math.cos(this.d * py);
      return [nx, ny];
    }
  }

  frame(dt) {
    // parameter easing toward target
    for (const k of ["a", "b", "c", "d"]) this[k] = lerp(this[k], this.target[k], 0.04);

    // pointer drag explores the parameter space live. Map x→(a,c) and y→(b,d)
    // so dragging sweeps all four parameters and the form changes dramatically.
    // We must NOT _resetAccum() here: doing it every frame was the bug — it wiped
    // the density buffer (and reset the orbit to its transient) each frame, so
    // only a few startup points ever showed. Instead a fast decay (below) clears
    // the old cloud smoothly while the new attractor accumulates in real time.
    if (this.pointer.down && this.pointer.active) {
      this.autoExplore = false;
      // Map the pointer into parameter space — but FORCE large magnitudes. Near
      // |a|,|b| < ~1.5 the map collapses to a single fixed point: the orbit sticks
      // on one pixel and the screen looks empty (the "only dots" bug the user hit).
      // Pushing every parameter to |v| ≥ 1.6 (sign from the pointer half) keeps the
      // orbit chaotic and spread across the screen everywhere you drag.
      const nx = remap(this.pointer.x, 0, this.w, -1, 1);
      const ny = remap(this.pointer.y, 0, this.h, -1, 1);
      const push = (u) => (u >= 0 ? 1 : -1) * (1.6 + Math.abs(u) * 1.4);  // |v| in [1.6,3.0]
      this.target.a = push(nx);
      this.target.b = push(ny);
      this.target.c = push(-nx * 0.7 - 0.3);
      this.target.d = push(-ny * 0.7 - 0.3);
    }

    // auto-exploration: pick a new attractor every few seconds
    if (this.autoExplore) {
      this.exploreTimer += dt;
      if (this.exploreTimer > 7) {
        this.exploreTimer = 0; this._newParams(); this._resetAccum();
      }
    }

    // While dragging the parameters move every frame, so the old cloud must be
    // cleared FAST (else past attractors smear together into mud). A 0.86 decay
    // empties stale density in a few frames while the new attractor fills in
    // live. At rest we barely fade (0.996) so detail builds up richly.
    const decay = this.pointer.down ? 0.86 : 0.996;
    // let maxD relax too, so the tonemap re-normalises as the cloud changes
    if (this.pointer.down) this.maxD = Math.max(1, this.maxD * 0.9);

    const scale = Math.min(this.aw, this.ah) * this.fitScale * this.zoom;
    const cx = this.aw / 2, cy = this.ah / 2;
    let x = this.x, y = this.y;
    const dens = this.density;
    let ext = 0;               // track the orbit's reach this frame for auto-fit
    for (let i = 0; i < this.perFrame; i++) {
      [x, y] = this._iterate(x, y);
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax > ext) ext = ax; if (ay > ext) ext = ay;
      const sx = (cx + x * scale) | 0;
      const sy = (cy + y * scale) | 0;
      if (sx >= 0 && sx < this.aw && sy >= 0 && sy < this.ah) {
        const idx = sy * this.aw + sx;
        const v = (dens[idx] += 1);
        if (v > this.maxD) this.maxD = v;
      }
    }
    this.x = x; this.y = y;

    // auto-fit: ease the scale so the attractor's extent fills ~82% of the half-
    // frame, whatever its natural size. Without this, compact attractors render
    // as a tiny clump in the middle and wide ones spill off-screen.
    if (ext > 0.05) {
      const targetFit = 0.41 / ext;     // 0.82 * 0.5 / ext
      // ease faster while dragging (params change fast) so the fit keeps up
      const k = this.pointer.down ? 0.18 : 0.08;
      this.fitScale += (clamp(targetFit, 0.08, 0.6) - this.fitScale) * k;
    }

    // render density → accent-tinted glow with log tonemap
    const data = this.img.data;
    const [r, g, b] = this.accentRgb;
    const inv = 1 / Math.log(this.maxD + 1);
    for (let i = 0; i < dens.length; i++) {
      if (decay !== 1) dens[i] *= decay;
      const v = dens[i] > 0 ? Math.log(dens[i] + 1) * inv : 0;
      const j = i * 4;
      const lo = Math.pow(v, 0.6);
      data[j]     = 6  + r * lo * 0.7 + v * v * 140;
      data[j + 1] = 6  + g * lo * 0.8 + v * v * 140;
      data[j + 2] = 10 + b * lo + v * v * 140;
      data[j + 3] = 255;
    }
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(this.img, 0, 0);

    this._drawHUD(ctx);
  }

  // ---- live readout: the iterated map + its current parameters --------------
  // Right-aligned, drawn in CSS px over the density. Uses a soft italic serif for
  // the equation and a light sans for the numbers — quiet and elegant, suited to
  // a chaotic-attractor piece rather than a hard monospace console.
  _drawHUD(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    const x0 = this.w - 30;
    let y = 64;
    const [r, g, b] = this.accentRgb;
    const accent = `rgba(${r},${g},${b},`;       // partial — append "alpha)"
    const dim = "rgba(228,210,222,";

    // title
    ctx.fillStyle = accent + "0.9)";
    ctx.font = "600 13px 'Inter', system-ui, sans-serif";
    ctx.fillText(this.type === "clifford" ? "CLIFFORD ATTRACTOR" : "DE JONG ATTRACTOR", x0, y);
    y += 30;

    // the iterated map, in italic serif (math feel, not console)
    ctx.fillStyle = dim + "0.78)";
    ctx.font = "italic 17px 'Georgia', 'Times New Roman', serif";
    if (this.type === "clifford") {
      ctx.fillText("xₙ₊₁ = sin(a·yₙ) + c·cos(a·xₙ)", x0, y);  y += 24;
      ctx.fillText("yₙ₊₁ = sin(b·xₙ) + d·cos(b·yₙ)", x0, y);  y += 34;
    } else {
      ctx.fillText("xₙ₊₁ = sin(a·yₙ) − cos(b·xₙ)", x0, y);  y += 24;
      ctx.fillText("yₙ₊₁ = sin(c·xₙ) − cos(d·yₙ)", x0, y);  y += 34;
    }

    // the four parameters, live (light sans, the value in accent)
    const params = [["a", this.a], ["b", this.b], ["c", this.c], ["d", this.d]];
    ctx.font = "300 15px 'Inter', system-ui, sans-serif";
    for (const [name, val] of params) {
      const txt = `${name} = ${val >= 0 ? " " : ""}${val.toFixed(3)}`;
      ctx.fillStyle = dim + "0.5)";
      ctx.fillText(txt, x0, y);
      y += 22;
    }
    ctx.textAlign = "left";
  }

  controls(host) {
    host.appendChild(buttonRow(TYPES.map((tp) => ({
      label: tp === "clifford" ? "클리포드" : "드 종",
      on: (el) => {
        this.type = tp;
        host.querySelectorAll(".ctrl__btns")[0].querySelectorAll(".ctrl__btn")
          .forEach((b) => b.classList.remove("is-active"));
        el.classList.add("is-active");
        this._resetAccum();
      },
    }))));
    host.querySelectorAll(".ctrl__btns")[0].querySelector(".ctrl__btn").classList.add("is-active");

    const mk = (label, key) => slider(label, -2.2, 2.2, this[key], 0.01, (v) => {
      this.autoExplore = false; this.target[key] = v; this._resetAccum();
    });
    host.appendChild(mk("PARAM a", "a"));
    host.appendChild(mk("PARAM b", "b"));
    host.appendChild(mk("PARAM c", "c"));
    host.appendChild(mk("PARAM d", "d"));
    host.appendChild(slider("ZOOM", 0.5, 2.2, this.zoom, 0.02, (v) => { this.zoom = v; this._resetAccum(); }));

    host.appendChild(buttonRow([
      { label: "자동 탐색", on: (el) => { this.autoExplore = !this.autoExplore; el.classList.toggle("is-active", this.autoExplore); if (this.autoExplore) this.exploreTimer = 99; } },
      { label: "무작위", on: () => { this.autoExplore = false; this._newParams(); this._resetAccum(); } },
    ]));
    const last = host.querySelectorAll(".ctrl__btns");
    if (this.autoExplore) last[last.length - 1].querySelector(".ctrl__btn").classList.add("is-active");
  }
}
