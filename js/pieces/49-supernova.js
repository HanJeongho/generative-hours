// ============================================================================
//  49 · Supernova Digits (숫자의 초신성) — the display IS the event  [Canvas2D]
//  Six particle-glyphs spell HH:MM:SS in stardust. Each digit slot owns its own
//  particle set whose homes are sampled from an offscreen fillText render (the
//  29-Entropy technique, but per-glyph). When a digit changes, that slot goes
//  SUPERNOVA: its particles blast radially outward from the glyph centroid
//  with tangential swirl while a thin shockwave ring rides out — then gravity
//  rewinds and the same particles ease back (critically-damped spring) into
//  the NEW digit's homes. Mass feels conserved: the old number's dust becomes
//  the new number. Every second the seconds-ones detonates; tens joins in
//  staggered; minute rollover chains four slots left-to-right; the hour kills
//  and rebirths the whole face with a giant blast + brief white-out. On load,
//  the current time simply condenses in from scattered dust (a birth, not an
//  explosion). Cursor scatters dust; click detonates the whole face.
//  Additive rendering: hot-white cores + accent-pink halos over a faint
//  drifting nebula. Pooled per-slot particle arrays; no hot-loop allocation.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const SLOTS = 6;                    // H H M M S S
const MAX_PER_SLOT = 1300;

export default class SupernovaDigits extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    this.density = 1.0;             // DUST slider (resample)
    this.blast = 1.0;               // BLAST slider
    this.glow = 1.0;                // GLOW slider
    this.h24 = false;

    this._off = document.createElement("canvas");
    this._offg = this._off.getContext("2d", { willReadFrequently: true });

    // per-slot state
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      this.slots.push({
        digit: -1,                  // current shown digit
        ps: [],                     // particles {x,y,vx,vy,hx,hy,tw,heat}
        boom: 0,                    // explosion envelope 0..1 (decays)
        delay: 0,                   // pending detonation delay (s)
        pending: -1,                // digit to re-condense into after delay
        cx: 0, cy: 0,               // slot centroid
      });
    }
    this.whiteout = 0;

    // static background stars + nebula blobs
    this.stars = [];
    for (let i = 0; i < 90; i++) this.stars.push({ x: Math.random(), y: Math.random(), b: rand(0.2, 1), ph: rand(0, TAU) });
    this.nebs = [];
    for (let i = 0; i < 4; i++) this.nebs.push({ x: rand(0.3, 0.7), y: rand(0.35, 0.65), r: rand(0.2, 0.4), dx: rand(-1, 1) * 0.004, dy: rand(-1, 1) * 0.003 });

    const d = new Date();
    this.lastS = d.getSeconds(); this.lastM = d.getMinutes(); this.lastH = d.getHours();

    this._layout();
    // birth: condense the current time in from scattered dust (no explosion)
    const digs = this._digits(d);
    for (let i = 0; i < SLOTS; i++) this._setDigit(i, digs[i], true);
  }

  onResize() {
    this._layout();
    for (let i = 0; i < SLOTS; i++) {
      const sl = this.slots[i];
      if (sl.digit >= 0) this._resample(i, sl.digit, true);
    }
  }

  // fixed monospace slot layout: HH:MM:SS filling ~75% width
  _layout() {
    const W = this.w, H = this.h;
    const total = W * 0.78;
    const dw = total / 7.0;                 // 6 digits + 2 half-width colons
    const x0 = (W - total) / 2;
    this.dw = dw;
    this.cy = H * 0.5;
    this.fontPx = Math.min(dw * 1.55, H * 0.42);
    // slot x-centers: HH [colon] MM [colon] SS
    this.slotX = [
      x0 + dw * 0.5, x0 + dw * 1.5,
      x0 + dw * 3.0, x0 + dw * 4.0,
      x0 + dw * 5.5, x0 + dw * 6.5,
    ];
    this.colonX = [x0 + dw * 2.25, x0 + dw * 4.75];
    for (let i = 0; i < SLOTS; i++) { this.slots[i].cx = this.slotX[i]; this.slots[i].cy = this.cy; }
  }

  _digits(d) {
    let h = d.getHours();
    if (!this.h24) { h = h % 12; if (h === 0) h = 12; }
    const m = d.getMinutes(), s = d.getSeconds();
    return [(h / 10) | 0, h % 10, (m / 10) | 0, m % 10, (s / 10) | 0, s % 10];
  }

  // ---- glyph → homes (29-entropy technique, per-slot) ----------------------
  _resample(slot, digit, keepPositions) {
    const off = this._off, og = this._offg;
    const S = Math.ceil(this.fontPx * 1.3);
    off.width = S; off.height = S;
    og.clearRect(0, 0, S, S);
    og.fillStyle = "#fff";
    og.textAlign = "center"; og.textBaseline = "middle";
    og.font = `800 ${Math.round(this.fontPx)}px ui-monospace, 'SF Mono', Menlo, monospace`;
    og.fillText(String(digit), S / 2, S * 0.54);
    const data = og.getImageData(0, 0, S, S).data;

    const lit = [];
    const step = 2;
    for (let y = 0; y < S; y += step)
      for (let x = 0; x < S; x += step)
        if (data[(y * S + x) * 4 + 3] > 90) lit.push(x, y);
    const litCount = lit.length / 2;

    const budget = Math.round(clamp(litCount * 0.55 * this.density, 150, MAX_PER_SLOT));
    const stride = Math.max(1, Math.floor(litCount / budget));

    const sl = this.slots[slot];
    const ox = sl.cx - S / 2, oy = sl.cy - S / 2;
    const homes = [];
    for (let i = 0; i < litCount; i += stride)
      homes.push(ox + lit[i * 2] + rand(-0.8, 0.8), oy + lit[i * 2 + 1] + rand(-0.8, 0.8));
    const n = homes.length / 2;

    const ps = sl.ps;
    if (ps.length > n) ps.length = n;
    for (let i = 0; i < n; i++) {
      const hx = homes[i * 2], hy = homes[i * 2 + 1];
      if (ps[i]) { ps[i].hx = hx; ps[i].hy = hy; }
      else ps[i] = {
        x: keepPositions ? sl.cx + rand(-1, 1) * this.w * 0.4 : hx,
        y: keepPositions ? sl.cy + rand(-1, 1) * this.h * 0.4 : hy,
        vx: 0, vy: 0, hx, hy, tw: rand(0, TAU), heat: 0,
      };
    }
    sl.digit = digit;
  }

  _setDigit(slot, digit, birth) {
    if (birth) { this._resample(slot, digit, true); return; }
    const sl = this.slots[slot];
    if (sl.digit === digit) return;
    sl.pending = digit;             // resample happens at detonation time
  }

  // detonate slot now: blast particles outward, ring, then homes become new digit
  _detonate(slot, energy) {
    const sl = this.slots[slot];
    if (sl.pending >= 0) { this._resample(slot, sl.pending, false); sl.pending = -1; }
    sl.boom = 1;
    const E = energy * this.blast;
    for (const p of sl.ps) {
      const dx = p.x - sl.cx, dy = p.y - sl.cy;
      const dd = Math.hypot(dx, dy) + 4;
      const sp = rand(140, 420) * E;
      // radial + tangential swirl
      p.vx += (dx / dd) * sp + (-dy / dd) * sp * 0.35 * (Math.random() < 0.5 ? 1 : -1);
      p.vy += (dy / dd) * sp + (dx / dd) * sp * 0.3;
      p.heat = 1;
    }
  }

  onPointerDown() {
    this._holdT = 0;
    // clicked ON a digit → only that slot goes supernova; empty space → all
    const px = this.pointer.x, py = this.pointer.y;
    let hit = -1, best = 1e9;
    for (let i = 0; i < SLOTS; i++) {
      const sl = this.slots[i];
      if (sl.digit < 0) continue;
      const dx = px - sl.cx, dy = py - sl.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; hit = i; }
    }
    const reach = (this.fontPx || 120) * 0.72;
    if (hit >= 0 && best < reach * reach) {
      this.slots[hit].delay = 0; this.slots[hit]._deferredE = 1.35;
    } else {
      for (let i = 0; i < SLOTS; i++) { this.slots[i].delay = i * 0.06; this.slots[i]._deferredE = 1.2; }
    }
  }
  onPointerUp() {
    // the collapsed star lets go: everything caught in the well pops outward
    if ((this._holdT || 0) < 0.25) return;
    const px = this.pointer.x, py = this.pointer.y;
    // the longer the collapse, the bigger the bang: range AND kick grow with
    // hold time, so a long hold flings the whole sky — the home spring then
    // reels every particle back into its digit
    const hold = Math.min(3.5, this._holdT);
    const R = 220 + hold * Math.max(this.w, this.h) * 0.26;
    const pop = 320 + hold * 520;
    // total disintegration: the home spring lets go for a while, so the dust
    // truly disperses to the edges before gravity reels it back in
    this.freeT = 0.35 + hold * 0.5;
    for (const sl of this.slots)
      for (const p of sl.ps) {
        const dx = p.x - px, dy = p.y - py;
        const dd = dx * dx + dy * dy;
        if (dd < R * R) {
          const dl = Math.sqrt(dd) + 4;
          p.vx += (dx / dl) * pop * (0.25 + 0.75 * (1 - dl / R));
          p.vy += (dy / dl) * pop * (0.25 + 0.75 * (1 - dl / R));
          p.heat = Math.max(p.heat, 0.9);
        }
      }
    this._holdT = 0;
  }

  frame(dt, t) {
    const ctx = this.ctx2d(), W = this.w, H = this.h;

    // ---- clock edges → choreography ---------------------------------------
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (s !== this.lastS) {
      const digs = this._digits(d);
      const hourChanged = h !== this.lastH;
      const minuteChanged = m !== this.lastM;
      this.lastS = s; this.lastM = m; this.lastH = h;
      // mark pending digits
      for (let i = 0; i < SLOTS; i++) this._setDigit(i, digs[i], false);
      if (hourChanged) {
        // whole face dies and is reborn, chained fast, plus white-out
        this.whiteout = 1;
        for (let i = 0; i < SLOTS; i++) { this.slots[i].delay = 0.02 + i * 0.07; this.slots[i]._deferredE = 1.5; }
      } else if (minuteChanged) {
        // chain left→right across the four slots that (may) change
        let k = 0;
        for (const i of [2, 3, 4, 5]) {
          if (this.slots[i].pending >= 0) { this.slots[i].delay = 0.02 + k * 0.12; this.slots[i]._deferredE = 1.15; k++; }
        }
      } else {
        // seconds: ones always; tens staggered if it changed too
        if (this.slots[5].pending >= 0) { this.slots[5].delay = 0.001; this.slots[5]._deferredE = 1.0; }
        if (this.slots[4].pending >= 0) { this.slots[4].delay = 0.08; this.slots[4]._deferredE = 1.05; }
      }
    }
    // fire delayed detonations
    for (let i = 0; i < SLOTS; i++) {
      const sl = this.slots[i];
      if (sl.delay > 0) {
        sl.delay -= dt;
        if (sl.delay <= 0) { sl.delay = 0; this._detonate(i, sl._deferredE || 1); }
      }
    }

    // ---- background ---------------------------------------------------------
    ctx.fillStyle = "#040309";
    ctx.fillRect(0, 0, W, H);
    // explosion light level (illuminates the nebula)
    let boomSum = 0;
    for (const sl of this.slots) boomSum += sl.boom;
    ctx.globalCompositeOperation = "lighter";
    for (const nb of this.nebs) {
      nb.x += nb.dx * dt; nb.y += nb.dy * dt;
      if (nb.x < 0.25 || nb.x > 0.75) nb.dx *= -1;
      if (nb.y < 0.3 || nb.y > 0.7) nb.dy *= -1;
      const rr = nb.r * Math.min(W, H);
      const gN = ctx.createRadialGradient(nb.x * W, nb.y * H, 0, nb.x * W, nb.y * H, rr);
      const aN = 0.05 + boomSum * 0.05;
      gN.addColorStop(0, `rgba(255,79,216,${aN})`);
      gN.addColorStop(0.6, `rgba(120,60,200,${aN * 0.4})`);
      gN.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gN;
      ctx.beginPath(); ctx.arc(nb.x * W, nb.y * H, rr, 0, TAU); ctx.fill();
    }
    // static twinkle stars
    for (const st of this.stars) {
      const b = st.b * (0.55 + 0.45 * Math.sin(t * 1.7 + st.ph));
      ctx.fillStyle = `rgba(210,220,255,${0.5 * b})`;
      ctx.fillRect(st.x * W, st.y * H, 1.2, 1.2);
    }

    // ---- particles -----------------------------------------------------------
    const px = this.pointer.x, py = this.pointer.y, pact = this.pointer.active;
    if (pact && this.pointer.down) this._holdT = (this._holdT || 0) + dt;
    // the well deepens as you hold: wider reach, harder pull, faster swirl —
    // a few seconds in, the entire sky is falling into your hand
    const hold = Math.min(3.5, this._holdT || 0);
    const wellR = 220 + hold * Math.max(W, H) * 0.26;
    const wellG = 620 * (1 + hold * 1.1);
    const wellS = 420 * (1 + hold * 0.8);
    this.freeT = Math.max(0, (this.freeT || 0) - dt);
    // during free flight the spring is nearly off and drag is light — coast far
    const freeK = this.freeT > 0 ? 0.03 : 1;
    const spring = 26 * freeK;
    const damp = this.freeT > 0 ? Math.exp(-dt * 0.9) : Math.exp(-dt * 8.5);
    for (const sl of this.slots) {
      sl.boom = Math.max(0, sl.boom - dt * 1.4);
      for (const p of sl.ps) {
        if (pact && this.pointer.down) {
          // GRAVITY WELL: held hand pulls the stardust into an accretion swirl
          const dx = p.x - px, dy = p.y - py;
          const dd = dx * dx + dy * dy;
          if (dd < wellR * wellR) {
            const dl = Math.sqrt(dd) + 4;
            const q = 0.18 + 0.82 * (1 - dl / wellR);
            p.vx += (-(dx / dl) * wellG + (-dy / dl) * wellS) * q * dt;
            p.vy += (-(dy / dl) * wellG + (dx / dl) * wellS) * q * dt;
            p.heat = Math.max(p.heat, 0.35 + q * 0.5);
          }
        } else if (pact) {
          // hover scatter (drifts back naturally via the home spring)
          const dx = p.x - px, dy = p.y - py;
          const dd = dx * dx + dy * dy;
          if (dd < 8100) {
            const q = (1 - dd / 8100) * 900;
            const dl = Math.sqrt(dd) + 2;
            p.vx += (dx / dl) * q * dt * 60 * 0.3 + this.pointer.vx * 2 * dt * 30;
            p.vy += (dy / dl) * q * dt * 60 * 0.3 + this.pointer.vy * 2 * dt * 30;
            p.heat = Math.max(p.heat, 0.4);
          }
        }
        // critically-damped spring toward home = gravity rewind
        p.vx += (p.hx - p.x) * spring * dt * 60 * 0.016;
        p.vy += (p.hy - p.y) * spring * dt * 60 * 0.016;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (this.freeT > 0) {                        // soft bounce at the walls
          if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.5; }
          else if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx) * 0.5; }
          if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.5; }
          else if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy) * 0.5; }
        }
        p.heat = Math.max(0, p.heat - dt * 1.3);
      }
    }

    // draw in two brightness buckets to batch fills
    const gA = 0.75 * this.glow, sz = 1.5;
    // pass 1: accent halo (heated particles draw bigger/brighter)
    ctx.fillStyle = `rgba(255,79,216,${0.30 * gA})`;
    for (const sl of this.slots)
      for (const p of sl.ps)
        if (p.heat > 0.25) ctx.fillRect(p.x - 2.2, p.y - 2.2, 4.4, 4.4);
    // pass 2: white-hot cores + twinkling dust
    for (const sl of this.slots) {
      const boom = sl.boom;
      for (const p of sl.ps) {
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + p.tw);
        const a = (0.5 * tw + p.heat * 0.5 + boom * 0.25) * gA;
        const gold = p.heat > 0.6;
        ctx.fillStyle = gold
          ? `rgba(255,225,170,${Math.min(1, a + 0.25)})`
          : `rgba(245,240,255,${Math.min(1, a)})`;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }

    // colon separators: dim particle clusters pulsing each second
    const colPulse = 0.4 + 0.6 * Math.max(0, 1 - (d.getMilliseconds() / 1000) * 2.2);
    ctx.fillStyle = `rgba(255,79,216,${0.5 * colPulse * gA})`;
    for (const cx of this.colonX)
      for (const dy of [-this.fontPx * 0.18, this.fontPx * 0.18]) {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const rr = 2.5 + 1.5 * Math.sin(i * 3.7 + t);
          ctx.fillRect(cx + Math.cos(a) * rr, this.cy + dy + Math.sin(a) * rr, 1.4, 1.4);
        }
      }


    // hour white-out (brief, tasteful)
    if (this.whiteout > 0) {
      ctx.fillStyle = `rgba(255,250,252,${this.whiteout * 0.55})`;
      ctx.fillRect(0, 0, W, H);
      this.whiteout = Math.max(0, this.whiteout - dt * 8);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  controls(host) {
    host.appendChild(slider("DUST", 0.4, 1.6, this.density, 0.05, (v) => {
      this.density = v;
      for (let i = 0; i < SLOTS; i++) if (this.slots[i].digit >= 0) this._resample(i, this.slots[i].digit, true);
    }));
    host.appendChild(slider("BLAST", 0.4, 2.0, this.blast, 0.05, (v) => (this.blast = v)));
    host.appendChild(slider("GLOW", 0.4, 1.8, this.glow, 0.05, (v) => (this.glow = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24;
    // re-target the HH pair to the new representation (they'll detonate into it)
    const digs = this._digits(new Date());
    for (const i of [0, 1]) {
      if (this.slots[i].digit !== digs[i]) {
        this.slots[i].pending = digs[i];
        this.slots[i].delay = 0.02 + i * 0.08;
        this.slots[i]._deferredE = 1.0;
      }
    }
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
