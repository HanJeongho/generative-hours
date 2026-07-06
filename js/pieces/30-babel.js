// ============================================================================
//  30 · Babel (바벨) — glyph transmutation across writing systems
//  After Babel, perfect communication is impossible; meaning is always slipping
//  through translation (Borges' Library of Babel). The visitor types a phrase;
//  each character is displayed LARGE in its own glyph cell and continuously
//  morphs through many scripts — Latin, Hangul, Greek, Cyrillic, runes, symbols.
//  THE ROSETTA DIAL: the pointer's horizontal position tunes "coherence" like a
//  radio dial. In a narrow band the glyphs RESOLVE to the original typed text
//  (bright, crisp); slide away and they scramble into foreign scripts (dim,
//  jittering, varied fonts) — your message caught for a moment, then dissolved.
//  Accent = vermilion #ff6a3d, drawn on near-black with a tower-like glow.
// ============================================================================

import { Piece, clamp, rand, lerp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const DEFAULT_TEXT = "BABEL";

// Sample glyph pools per writing system. Small, hand-picked sets — enough to
// feel like genuinely different scripts without shipping whole Unicode blocks.
const SCRIPTS = {
  latin:    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  hangul:   "가나다라마바사아자차카타파하의미름빛글말",
  greek:    "αβγδεζηθικλμνξοπρστυφχψω",
  cyrillic: "бвгджзиклмнпфцчшщъыьэюя",
  runic:    "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ",
  symbol:   "◆◇○●□■△▲▽▼☉☌⌘✦✧⟁⟐⌬⎔⏥⌖⍟⌑",
};
const SCRIPT_KEYS = Object.keys(SCRIPTS);

// Font families rotated per glyph so scrambled cells read as different "hands".
const FONTS = [
  'ui-monospace, "SF Mono", monospace',
  'Georgia, "Times New Roman", serif',
  'system-ui, -apple-system, sans-serif',
];

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export default class Babel extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // ---- tunables (slider-driven) ----
    this.flux = 1.0;          // how fast glyphs transmute (cycles/sec scale)
    this.tuneWidth = 0.16;    // half-width of the legible band (fraction of W)
    this.scramble = 1.0;      // how foreign/chaotic the untuned glyphs get
    this.forceBabel = false;  // "혼돈" button — never resolve, full scramble

    // The tuned target sits at screen centre; pointer.x near it → coherence.
    this.tuneTarget = 0.5;

    this.slots = [];          // one cell per character of the source text
    this.setText(DEFAULT_TEXT);

    this._makeInput();        // floating <input> for the phrase (default alive)

    // initial dark wash
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#060507";
    g.fillRect(0, 0, this.w, this.h);
  }

  // Build one slot per source character. Each slot carries its own little clock
  // so glyphs flicker out of phase, plus cross-fade state for shimmering.
  setText(str) {
    const text = (str || "").toUpperCase().slice(0, 16);
    this.text = text;
    this.slots = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      this.slots.push({
        target: ch,                       // the true, typed glyph
        cur: this._sub(),                 // currently-shown substitute
        prev: this._sub(),                // outgoing glyph (for cross-fade)
        mix: 1,                           // 0→1 fade prev→cur
        phase: Math.random() * 100,       // out-of-phase timer seed
        period: rand(0.18, 0.5),          // seconds between transmutations
        clk: 0,
        font: (Math.random() * FONTS.length) | 0,
        jx: 0, jy: 0,                      // smoothed position jitter
      });
    }
  }

  // A random foreign substitute glyph, weighted toward "stranger" scripts as
  // scramble rises (so high SCRAMBLE pushes toward runes/symbols/cyrillic).
  _sub() {
    const wild = this.scramble || 1;
    // bias selection: low scramble favours latin/greek, high favours exotic
    const pool = Math.random() < clamp(0.55 - wild * 0.18, 0.1, 0.55)
      ? (Math.random() < 0.5 ? SCRIPTS.latin : SCRIPTS.greek)
      : SCRIPTS[pick(SCRIPT_KEYS)];
    return pick(pool);
  }

  // ---- floating phrase input (raw DOM — cleaned up in teardown) ------------
  _makeInput() {
    const wrap = this.canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = this.text;                // default phrase alive on load
    inp.placeholder = "type a word…";
    inp.setAttribute("aria-label", "type a word or phrase to transmute");
    Object.assign(inp.style, {
      // TOP-centre: avoid the bottom-centre interaction guide bar (.actionbar at
      // bottom:20–40px) that the input used to collide with.
      position: "absolute", left: "50%", top: "16px", transform: "translateX(-50%)",
      width: "min(60%, 320px)", padding: "8px 12px", zIndex: "11",
      background: "rgba(10,7,6,0.55)", color: this.accent,
      border: "1px solid rgba(255,255,255,0.12)", borderRadius: "999px",
      font: "13px/1 ui-monospace, monospace", letterSpacing: "0.16em",
      textAlign: "center", outline: "none", caretColor: this.accent,
    });
    // Rebuild slots live as the phrase changes.
    const onInput = () => this.setText(inp.value);
    inp.addEventListener("input", onInput);
    wrap.appendChild(inp);
    this._inp = inp;
    this._inpHandlers = [["input", onInput]];
  }

  teardown() {
    // Engine auto-cleans this.on() listeners; this raw input is ours to remove.
    if (this._inp) {
      for (const [ev, fn] of this._inpHandlers) this._inp.removeEventListener(ev, fn);
      this._inp.remove();
      this._inp = null;
    }
  }

  onResize() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#060507";
    g.fillRect(0, 0, this.w, this.h);
  }

  // ---- render ---------------------------------------------------------------
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // near-black wash (slight smear so jitter leaves a ghost)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,5,7,0.42)";
    g.fillRect(0, 0, this.w, this.h);

    const n = this.slots.length;
    if (n === 0) return;

    // ---- the Rosetta dial: pointer.x → coherence in [0,1] ----
    // coherence = 1 when the cursor sits in the tuned band around tuneTarget,
    // falling off to 0 the farther it strays. No pointer → drift slowly so the
    // piece still breathes when untouched.
    const ptr = this.pointer;
    let cursorN;
    if (ptr.active) {
      cursorN = clamp(ptr.x / this.w, 0, 1);
    } else {
      // gentle autonomous sweep so an idle screen tunes itself in and out
      cursorN = 0.5 + 0.5 * Math.sin(t * 0.35);
    }
    const dist = Math.abs(cursorN - this.tuneTarget);
    const band = Math.max(0.02, this.tuneWidth);
    let coherence = 1 - clamp(dist / band, 0, 1);
    coherence = coherence * coherence * (3 - 2 * coherence);   // smoothstep
    if (this.forceBabel) coherence = 0;

    // ---- layout: one big glyph cell per character, centred ----
    const margin = Math.min(this.w, this.h) * 0.08;
    const usableW = this.w - margin * 2;
    const cellW = usableW / n;
    const cellSize = Math.min(cellW * 0.86, this.h * 0.46);
    const baseX = margin + cellW * 0.5;
    const cy = this.h * 0.5;

    // tower-like vertical glow column behind the row of glyphs
    this._drawTower(g, cy, cellSize, coherence);

    g.textAlign = "center";
    g.textBaseline = "middle";

    for (let i = 0; i < n; i++) {
      const s = this.slots[i];

      // advance this slot's transmutation clock (flux scales the rate)
      s.clk += dt;
      // when fully coherent, slow the churn so resolved text holds steady
      const rate = s.period / (0.25 + this.flux * (1 - coherence * 0.9));
      if (s.clk >= rate) {
        s.clk = 0;
        s.prev = s.cur;
        s.cur = this._sub();
        s.mix = 0;
        s.font = (s.font + 1 + ((Math.random() * (FONTS.length - 1)) | 0)) % FONTS.length;
      }
      s.mix = Math.min(1, s.mix + dt * (6 + this.flux * 8));   // cross-fade speed

      const cx = baseX + cellW * i;

      // position jitter grows with scramble & lack of coherence; resolved
      // glyphs sit dead still. Smooth it so motion reads as nervous, not noisy.
      const jAmt = (1 - coherence) * this.scramble * cellSize * 0.05;
      s.jx = lerp(s.jx, rand(-jAmt, jAmt), 0.35);
      s.jy = lerp(s.jy, rand(-jAmt, jAmt), 0.35);

      // brightness: tuned glyphs bright & crisp, scrambled ones dim
      const baseA = lerp(0.32, 1.0, coherence);

      if (coherence > 0.985) {
        // fully tuned → just the true glyph, crisp & hot
        this._glyph(g, s.target, cx, cy, cellSize,
          'ui-monospace, "SF Mono", monospace', baseA, 0, 0, true);
      } else {
        // shimmer: cross-fade outgoing→incoming substitute. As coherence rises
        // the incoming glyph biases toward the TRUE target, so the message
        // surfaces through the babble before dissolving again.
        const showTrue = Math.random() < coherence * 0.85;
        const inGlyph = showTrue ? s.target : s.cur;
        const inFont = showTrue
          ? 'ui-monospace, "SF Mono", monospace'
          : FONTS[s.font];
        const outFont = FONTS[(s.font + FONTS.length - 1) % FONTS.length];

        // outgoing (fading away), slightly offset for a translation-slip feel
        if (s.mix < 1) {
          this._glyph(g, s.prev, cx + s.jx * 1.4, cy + s.jy * 1.4, cellSize,
            outFont, baseA * (1 - s.mix) * 0.7, 0, 0, false);
        }
        // incoming
        this._glyph(g, inGlyph, cx + s.jx, cy + s.jy, cellSize,
          inFont, baseA * (0.5 + 0.5 * s.mix), 0, 0, showTrue);
      }
    }

    // ---- subtle indicator of the tuned zone (the dial) ----
    this._drawDial(g, coherence, band);

    g.globalCompositeOperation = "source-over";
    g.shadowBlur = 0;
  }

  // One glyph with vermilion glow; `hot` adds a bright near-white core pass.
  _glyph(g, ch, x, y, size, font, alpha, _dx, _dy, hot) {
    if (alpha <= 0.01) return;
    g.globalCompositeOperation = "lighter";
    g.font = `700 ${size}px ${font}`;
    g.shadowColor = this.accent;
    g.shadowBlur = hot ? 26 : 14;
    g.globalAlpha = clamp(alpha, 0, 1);
    g.fillStyle = this.accent;
    g.fillText(ch, x, y);
    if (hot) {
      g.shadowBlur = 6;
      g.fillStyle = "rgba(255,240,232,0.92)";
      g.fillText(ch, x, y);
    }
    g.globalAlpha = 1;
  }

  // A faint vertical glow column behind the glyph row — the standing tower.
  // Brightens as the message resolves, as if the structure firms into being.
  _drawTower(g, cy, cellSize, coherence) {
    g.globalCompositeOperation = "lighter";
    const halfH = cellSize * 0.95;
    const grad = g.createLinearGradient(0, cy - halfH, 0, cy + halfH);
    const a = 0.04 + coherence * 0.07;
    grad.addColorStop(0, "rgba(255,106,61,0)");
    grad.addColorStop(0.5, `rgba(255,106,61,${a})`);
    grad.addColorStop(1, "rgba(255,106,61,0)");
    g.fillStyle = grad;
    g.fillRect(0, cy - halfH, this.w, halfH * 2);
    g.globalCompositeOperation = "source-over";
  }

  // The Rosetta dial: a thin baseline with a marker at the cursor's tuning
  // position and a brighter notch over the legible band's centre (tuneTarget).
  _drawDial(g, coherence, band) {
    g.globalCompositeOperation = "source-over";
    g.shadowBlur = 0;
    const y = this.h - 46;
    const x0 = this.w * 0.18, x1 = this.w * 0.82, span = x1 - x0;

    // baseline
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();

    // tuned band (where text resolves) — a soft vermilion sweep
    const bx0 = x0 + span * clamp(this.tuneTarget - band, 0, 1);
    const bx1 = x0 + span * clamp(this.tuneTarget + band, 0, 1);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,106,61,0.10)";
    g.fillRect(bx0, y - 7, bx1 - bx0, 14);
    // centre notch
    const cx = x0 + span * this.tuneTarget;
    g.strokeStyle = "rgba(255,106,61,0.55)";
    g.beginPath(); g.moveTo(cx, y - 9); g.lineTo(cx, y + 9); g.stroke();

    // cursor tuning marker — glows hotter as it locks onto the band
    const ptr = this.pointer;
    let cN = ptr.active ? clamp(ptr.x / this.w, 0, 1)
                        : 0.5 + 0.5 * Math.sin(this.t * 0.35);
    const mx = x0 + span * cN;
    g.shadowColor = this.accent;
    g.shadowBlur = 4 + coherence * 16;
    g.fillStyle = `rgba(255,${Math.round(106 + coherence * 80)},${Math.round(61 + coherence * 60)},${0.5 + coherence * 0.5})`;
    g.beginPath(); g.arc(mx, y, 3 + coherence * 2, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.globalCompositeOperation = "source-over";
  }

  // ---- controls -------------------------------------------------------------
  controls(host) {
    host.appendChild(slider("FLUX", 0.1, 4.0, this.flux, 0.05,
      (v) => (this.flux = v)));
    host.appendChild(slider("TUNE WIDTH", 0.04, 0.45, this.tuneWidth, 0.01,
      (v) => (this.tuneWidth = v)));
    host.appendChild(slider("SCRAMBLE", 0.2, 2.0, this.scramble, 0.05,
      (v) => (this.scramble = v)));
    host.appendChild(buttonRow([
      {
        label: "혼돈 (babel — force full scramble)",
        on: (el) => {
          this.forceBabel = !this.forceBabel;
          el.classList.toggle("is-on", this.forceBabel);
          el.style.color = this.forceBabel ? this.accent : "";
        },
      },
    ]));
  }
}
