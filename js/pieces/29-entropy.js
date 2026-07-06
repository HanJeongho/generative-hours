// ============================================================================
//  29 · Entropy (엔트로피) — the second law, written in light
//  The visitor types text. It is rendered to an offscreen canvas, sampled into
//  a few thousand light particles whose "home" spells the words. Every frame
//  the particles diffuse — a random walk away from home — so order perpetually
//  decays into ashen dust (entropy increases). The CURSOR is Maxwell's demon:
//  particles within its radius are pulled hard back to their home targets, so
//  sweeping it across the sentence re-condenses sharp, glowing letters; leave a
//  region and it dissolves back into drifting grey. Meaning survives only
//  through constant effort. Accent: vermilion #ff6a3d.
// ============================================================================

import { Piece, clamp, rand, lerp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const STARTER = "ENTROPY";          // alive on load
const MAX_PARTICLES = 6000;         // hard cap; actual count scales with area

export default class Entropy extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // tunables (slider-driven)
    this.diffusion = 1.0;           // how fast order decays (random-walk gain)
    this.demonR = 150;              // cursor influence radius (px)
    this.order = 1.0;               // demon re-condensing strength

    this.text = STARTER;
    this.particles = [];
    this.condenseAll = 0;           // brief global snap-home timer (seconds)

    // offscreen canvas used only for text → pixel sampling
    this._off = document.createElement("canvas");
    this._offg = this._off.getContext("2d", { willReadFrequently: true });

    this.sample();                  // build target points from default text
    this._makeInput();              // floating <input> to type the text
  }

  // ---- TEXT → TARGET POINTS -------------------------------------------------
  // Render the text big & centred to the offscreen canvas, read its pixels, and
  // seed one particle per Nth lit pixel with its home = that pixel position.
  sample() {
    const off = this._off, og = this._offg;
    // sample at device-independent CSS px; keep it modest for getImageData speed
    const W = Math.max(1, Math.round(this.w));
    const H = Math.max(1, Math.round(this.h));
    off.width = W; off.height = H;

    og.clearRect(0, 0, W, H);
    og.fillStyle = "#fff";
    og.textAlign = "center";
    og.textBaseline = "middle";

    const txt = (this.text || "").trim() || " ";
    // fit the text to ~82% of width and a comfortable height
    let fontPx = Math.min(H * 0.42, 220);
    og.font = `800 ${fontPx}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
    let m = og.measureText(txt);
    const maxW = W * 0.82;
    if (m.width > maxW) {
      fontPx *= maxW / m.width;
      og.font = `800 ${fontPx}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
    }
    og.fillText(txt, W / 2, H / 2);

    const data = og.getImageData(0, 0, W, H).data;

    // collect lit pixels, then sub-sample to hit the particle budget
    const lit = [];
    const step = 3;                 // scan stride (px) — coarse for speed
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const a = data[(y * W + x) * 4 + 3];
        if (a > 90) lit.push(x, y);
      }
    }
    const litCount = lit.length / 2;

    // budget: scale with screen area but never exceed MAX_PARTICLES
    const budget = Math.round(Math.min(MAX_PARTICLES, Math.max(800, (W * H) / 320)));
    const stride = Math.max(1, Math.floor(litCount / budget));

    const homes = [];
    for (let i = 0; i < litCount; i += stride) {
      homes.push(lit[i * 2] + rand(-1, 1), lit[i * 2 + 1] + rand(-1, 1));
    }
    const n = homes.length / 2;

    // reuse existing particles where possible so re-sampling doesn't pop:
    // keep current positions, just reassign homes; add/remove to match n.
    const ps = this.particles;
    if (ps.length > n) ps.length = n;
    for (let i = 0; i < n; i++) {
      const hx = homes[i * 2], hy = homes[i * 2 + 1];
      if (ps[i]) {
        ps[i].hx = hx; ps[i].hy = hy;
      } else {
        // newcomers enter as dust from a random spot so letters assemble
        ps[i] = {
          x: rand(0, this.w), y: rand(0, this.h),
          vx: 0, vy: 0, hx, hy,
        };
      }
    }
  }

  // ---- floating text input (raw DOM — cleaned up in teardown) --------------
  _makeInput() {
    const wrap = this.canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = this.text;
    inp.placeholder = "type a word…";
    inp.setAttribute("aria-label", "type text to crystallize");
    Object.assign(inp.style, {
      // TOP-centre: the bottom-centre interaction guide bar (.actionbar) sits at
      // bottom:20–40px, so a bottom input collided with it. Top is clear (placard
      // is left, exit is top-right).
      position: "absolute", left: "50%", top: "16px", transform: "translateX(-50%)",
      width: "min(60%, 340px)", padding: "8px 12px", zIndex: "11",
      background: "rgba(10,8,6,0.55)", color: this.accent,
      border: "1px solid rgba(255,255,255,0.12)", borderRadius: "999px",
      font: "13px/1 ui-monospace, monospace", letterSpacing: "0.18em",
      textAlign: "center", outline: "none", caretColor: this.accent,
    });
    // Each edit rebuilds the target points (text re-crystallizes).
    const onInput = () => { this.text = inp.value.toUpperCase(); this.sample(); };
    inp.addEventListener("input", onInput);
    wrap.appendChild(inp);
    this._inp = inp;
    this._inpHandlers = [["input", onInput]];
  }

  teardown() {
    // Remove the raw DOM input + its listeners (engine only auto-cleans this.on()).
    if (this._inp) {
      for (const [ev, fn] of this._inpHandlers) this._inp.removeEventListener(ev, fn);
      this._inp.remove();
      this._inp = null;
    }
  }

  onResize() { this.sample(); }     // rebuild text layout for the new size

  // pointer press = a momentary widening of the demon (handled in frame())

  // ---- buttons --------------------------------------------------------------
  scatterAll() {
    // kick every particle into chaos
    for (const p of this.particles) {
      const a = rand(0, Math.PI * 2), s = rand(120, 420);
      p.vx += Math.cos(a) * s; p.vy += Math.sin(a) * s;
    }
  }
  condenseBriefly() { this.condenseAll = 1.1; }   // snap all home for ~1s

  // ---- simulation + render --------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // near-black trail-fade: prior frame dims toward black, leaving comet wisps
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,5,7,0.22)";
    g.fillRect(0, 0, this.w, this.h);

    const ptr = this.pointer;
    // demon reach: cursor radius, widened while pressed for a stronger sweep
    const R = this.demonR * (ptr.down ? 1.55 : 1);
    const R2 = R * R;
    const haveDemon = ptr.active;
    const cax = ptr.x, cay = ptr.y;

    // global condense pulse decays over time
    const snapAll = this.condenseAll > 0;
    if (snapAll) this.condenseAll = Math.max(0, this.condenseAll - dt);

    // diffusion gain — entropy production rate
    const diff = this.diffusion;

    g.globalCompositeOperation = "lighter";
    const accent = this.accent;
    const [ar, ag, ab] = hexRgb(accent);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // ---- DIFFUSION: a random walk that drifts the particle off its home ----
      // the farther it already is, the more freely it wanders (disorder grows).
      const dxh = p.hx - p.x, dyh = p.hy - p.y;
      const dist = Math.hypot(dxh, dyh);
      const wander = 18 + Math.min(60, dist * 0.12);
      p.vx += rand(-wander, wander) * diff * dt;
      p.vy += rand(-wander, wander) * diff * dt;
      // a faint, ever-present pull keeps dust loosely tethered (never vanishes,
      // but far too weak to reassemble letters on its own — that needs the demon)
      p.vx += dxh * 0.35 * dt;
      p.vy += dyh * 0.35 * dt;

      // ---- MAXWELL'S DEMON: strong re-ordering inside the cursor radius ------
      let demonGrip = 0;            // 0..1, how hard this particle is being fixed
      if (snapAll) {
        // global condense: pull everyone home hard, briefly
        p.vx += dxh * 22 * dt;
        p.vy += dyh * 22 * dt;
        demonGrip = 1;
      } else if (haveDemon) {
        const ddx = p.x - cax, ddy = p.y - cay;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2) {
          const falloff = 1 - Math.sqrt(d2) / R;       // 1 at cursor → 0 at edge
          const k = 14 * this.order * falloff;
          p.vx += dxh * k * dt;
          p.vy += dyh * k * dt;
          // damp the wander so the letter under the cursor holds crisp
          p.vx *= 1 - 0.16 * falloff;
          p.vy *= 1 - 0.16 * falloff;
          demonGrip = falloff;
        }
      }

      // integrate + drag (drag keeps speeds bounded so dust ambles, not flies)
      p.vx *= 0.90; p.vy *= 0.90;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // wrap softly at the edges so dust roams the whole screen
      if (p.x < -4) p.x = this.w + 4; else if (p.x > this.w + 4) p.x = -4;
      if (p.y < -4) p.y = this.h + 4; else if (p.y > this.h + 4) p.y = -4;

      // ---- RENDER: colour by ORDER (closeness to home) ----------------------
      // order = 1 at home → hot vermilion/white; → 0 when far → dim cool grey.
      const newDist = Math.hypot(p.hx - p.x, p.hy - p.y);
      const order = clamp(1 - newDist / 90, 0, 1);
      const o = Math.max(order, demonGrip * 0.85);     // demon makes it glow live

      // ordered: bright vermilion shading to white-hot core; disordered: ash grey
      const r = lerp(70, lerp(ar, 255, o * 0.6), o);
      const gg = lerp(74, lerp(ag, 235, o * 0.6), o);
      const b = lerp(82, lerp(ab, 220, o * 0.6), o);
      const alpha = lerp(0.14, 0.9, o);
      const size = lerp(1.0, 2.0, o);

      g.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${alpha})`;
      g.fillRect(p.x, p.y, size, size);
    }

    g.globalCompositeOperation = "source-over";
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("DIFFUSION", 0.2, 3.0, this.diffusion, 0.05,
      (v) => (this.diffusion = v)));
    host.appendChild(slider("DEMON RADIUS", 50, 320, this.demonR, 5,
      (v) => (this.demonR = v), (v) => String(v | 0)));
    host.appendChild(slider("ORDER", 0.3, 3.0, this.order, 0.05,
      (v) => (this.order = v)));
    host.appendChild(buttonRow([
      { label: "흩기 (scatter all)", on: () => this.scatterAll() },
      { label: "응집 (condense all)", on: () => this.condenseBriefly() },
    ]));
  }
}

// hex → [r,g,b] (local; engine's hexToRgb isn't imported to keep the skeleton)
function hexRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
