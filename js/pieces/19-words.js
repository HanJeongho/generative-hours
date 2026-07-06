// ============================================================================
//  19 · Words Unbound — kinetic typography meets soft-body physics
//  Letters are physical bodies that fall under gravity, tumble, bounce off the
//  floor & walls, and pile up. The visitor TYPES to drop new letters from the
//  top; the pointer stirs the pile (press = repel, drag = blow letters around).
//  Accent (pink/rose) glows on near-black; the page greets you mid-fall.
// ============================================================================

import { Piece, TAU, clamp, rand } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const MAX_LETTERS = 240;                 // hard cap so the pile stays ~60fps
const STARTER = "GENERATIVE HOURS";      // alive on load

export default class WordsUnbound extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.g = 1600;                       // gravity (px/s^2), slider-driven
    this.bounce = 0.45;                  // restitution on floor/wall impacts
    this.sizeMul = 1.0;                  // global letter-size multiplier
    this.letters = [];

    // Drop the starter phrase spread across the top, already in motion.
    let i = 0;
    for (const ch of STARTER) {
      if (ch !== " ") {
        this.spawn(ch, (this.w * (0.18 + 0.64 * (i / STARTER.length))), rand(-this.h * 0.5, 0));
      }
      i++;
    }

    this._makeInput();                   // floating <input> for typed letters
  }

  // ---- a physical letter body ----------------------------------------------
  spawn(char, x, y) {
    if (this.letters.length >= MAX_LETTERS) this.letters.shift();   // recycle oldest
    const size = (28 + rand(0, 34)) * this.sizeMul;
    this.letters.push({
      char,
      x: clamp(x, size, this.w - size),
      y,
      vx: rand(-60, 60),
      vy: rand(-40, 80),
      angle: rand(0, TAU),
      vAngle: rand(-4, 4),
      size,
      r: size * 0.42,                    // collision radius (~half the glyph)
    });
  }

  // dump a fresh burst of random letters from across the top
  dump(word) {
    const src = word || "WORDSUNBOUNDxyz●◆✦";
    const n = 14;
    for (let k = 0; k < n; k++) {
      const ch = src[(Math.random() * src.length) | 0];
      this.spawn(ch, rand(this.w * 0.1, this.w * 0.9), rand(-this.h * 0.4, -10));
    }
  }

  clear() { this.letters.length = 0; }

  // ---- floating text input (raw DOM — cleaned up in teardown) --------------
  _makeInput() {
    const wrap = this.canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "type letters…";
    inp.setAttribute("aria-label", "type letters to drop");
    Object.assign(inp.style, {
      position: "absolute", left: "50%", bottom: "16px", transform: "translateX(-50%)",
      width: "min(60%, 320px)", padding: "8px 12px", zIndex: "5",
      background: "rgba(10,8,12,0.55)", color: this.accent,
      border: "1px solid rgba(255,255,255,0.12)", borderRadius: "999px",
      font: "13px/1 ui-monospace, monospace", letterSpacing: "0.08em",
      textAlign: "center", outline: "none", caretColor: this.accent,
    });
    // Each keystroke drops the typed glyph from the top near the input centre.
    const onInput = (e) => {
      const data = e.data;
      if (data) for (const ch of data) this.spawn(ch.toUpperCase(), this.w / 2 + rand(-60, 60), rand(-60, -10));
      inp.value = "";                    // keep it a launcher, not a buffer
    };
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.dump(); }   // Enter = burst
      else if (e.key === " ") { e.preventDefault(); }               // swallow space
    };
    inp.addEventListener("input", onInput);
    inp.addEventListener("keydown", onKey);
    wrap.appendChild(inp);
    this._inp = inp;                     // stash refs for teardown
    this._inpHandlers = [["input", onInput], ["keydown", onKey]];
  }

  teardown() {
    // Remove the raw DOM input + its listeners (engine only auto-cleans this.on()).
    if (this._inp) {
      for (const [ev, fn] of this._inpHandlers) this._inp.removeEventListener(ev, fn);
      this._inp.remove();
      this._inp = null;
    }
  }

  onResize() {
    // keep everything inside the new bounds
    for (const L of this.letters) {
      L.x = clamp(L.x, L.r, this.w - L.r);
      L.y = Math.min(L.y, this.h - L.r);
    }
  }

  // pointer press = an outward "stir" shove on nearby letters
  onPointerDown() { this._stir(220, 900); }

  _stir(R, power) {
    const px = this.pointer.x, py = this.pointer.y;
    for (const L of this.letters) {
      const dx = L.x - px, dy = L.y - py, d = Math.hypot(dx, dy) + 0.001;
      if (d < R) {
        const f = (1 - d / R) * power;
        L.vx += (dx / d) * f; L.vy += (dy / d) * f;
        L.vAngle += rand(-6, 6) * (1 - d / R);
      }
    }
  }

  // ---- simulation + render --------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // near-black trail wash (faint motion smear)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(7,6,9,0.32)";
    g.fillRect(0, 0, this.w, this.h);

    const ptr = this.pointer;
    const wind = ptr.active ? Math.hypot(ptr.vx, ptr.vy) : 0;
    const floor = this.h, restF = 0.78;  // floor friction tangential damping

    // --- integrate physics ---
    for (const L of this.letters) {
      L.vy += this.g * dt;               // gravity

      // pointer motion "blows" letters around within a radius
      if (ptr.active && wind > 0.6) {
        const dx = L.x - ptr.x, dy = L.y - ptr.y, d2 = dx * dx + dy * dy, R = 160;
        if (d2 < R * R) {
          const f = (1 - Math.sqrt(d2) / R) * 1.4;
          L.vx += ptr.vx * f * 6; L.vy += ptr.vy * f * 6;
          L.vAngle += ptr.vx * f * 0.3;
        }
      }
      // held press keeps stirring so dragging scatters the pile
      if (ptr.down) this._stir(150, 60);

      L.x += L.vx * dt;
      L.y += L.vy * dt;
      L.angle += L.vAngle * dt;
      L.vx *= 0.992; L.vAngle *= 0.97;   // air drag

      // walls
      if (L.x < L.r) { L.x = L.r; L.vx = -L.vx * this.bounce; L.vAngle *= 0.6; }
      else if (L.x > this.w - L.r) { L.x = this.w - L.r; L.vx = -L.vx * this.bounce; L.vAngle *= 0.6; }
      // floor — bounce + settle
      if (L.y > floor - L.r) {
        L.y = floor - L.r;
        if (Math.abs(L.vy) > 30) L.vy = -L.vy * this.bounce; else L.vy = 0;
        L.vx *= restF; L.vAngle *= restF; // friction lets the glyph lie flat
      }
    }

    // --- cheap letter-letter repulsion (keeps the pile from overlapping) ---
    const n = this.letters.length;
    for (let i = 0; i < n; i++) {
      const a = this.letters[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.letters[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;   // AABB reject
        const d = Math.hypot(dx, dy) + 0.001;
        if (d < min) {
          const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;        // separate positions
          b.x += nx * push; b.y += ny * push;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; // exchange normal vel
          if (rel > 0) {
            const imp = rel * (0.5 + this.bounce * 0.5);
            a.vx -= nx * imp; a.vy -= ny * imp;
            b.vx += nx * imp; b.vy += ny * imp;
          }
        }
      }
    }

    // --- render glyphs with accent glow ---
    g.globalCompositeOperation = "lighter";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const L of this.letters) {
      g.save();
      g.translate(L.x, L.y);
      g.rotate(L.angle);
      g.font = `700 ${L.size}px ui-monospace, "SF Mono", monospace`;
      g.shadowColor = this.accent;
      g.shadowBlur = 16;
      g.fillStyle = this.accent;
      g.fillText(L.char, 0, 0);
      // brighter core pass for a hot rose center
      g.shadowBlur = 4;
      g.fillStyle = "rgba(255,235,245,0.85)";
      g.fillText(L.char, 0, 0);
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
    g.shadowBlur = 0;
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("GRAVITY", 300, 3200, this.g, 50,
      (v) => (this.g = v), (v) => String(v | 0)));
    host.appendChild(slider("BOUNCE", 0, 0.85, this.bounce, 0.01,
      (v) => (this.bounce = v)));
    host.appendChild(slider("LETTER SIZE", 0.5, 2.2, this.sizeMul, 0.05,
      (v) => (this.sizeMul = v)));
    host.appendChild(buttonRow([
      { label: "비우기 (clear)", on: () => this.clear() },
      { label: "쏟기 (dump)", on: () => this.dump() },
    ]));
  }
}
