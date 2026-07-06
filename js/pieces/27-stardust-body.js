// ============================================================================
//  27 · Precognition (예지) — air-gesture holographic interface (camera + hands)
//  A Minority-Report homage: panels of light hang in the void and you CONDUCT
//  them with bare hands. PINCH (thumb+index) to grab the nearest panel and drag
//  it; pinch the SAME panel with BOTH hands to stretch/rotate it; release while
//  moving to FLING it — it slides on, decelerating, like glass on air. Two hands
//  tracked at once; only 21 landmarks per hand are read, on-device.
//
//  CAVEAT: needs your hand(s) visible to the camera. Cyan holographic palette to
//  match the wing accent (#5fe6d0).
// ============================================================================

import { VisionPiece, HAND } from "../vision.js";
import { slider, buttonRow } from "./01-currents.js";
import { TAU, clamp, lerp, rand, hexToRgb, makeNoise } from "../engine.js";

const WING = "95,230,208";        // aqua-mint #5fe6d0 as "r,g,b"
// finger bone chains (MediaPipe hand topology). The first index of each chain is
// the knuckle on the palm; the chain runs out to the fingertip.
const FINGERS = [
  [1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12],
  [13, 14, 15, 16], [17, 18, 19, 20],
];
// outline of the palm "membrane" — wrist around the knuckles and back. Gives the
// hand a soft glowing body instead of bare sticks (a hand of light / a glove).
const PALM_OUTLINE = [0, 1, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];
const KINDS = ["wave", "bars", "grid", "rings", "scan", "target"];

export default class Precognition extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 2; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.gain = 1.0;          // GESTURE GAIN — grab/throw responsiveness
    this.density = 1.0;       // PANELS — how many panels float
    this.glow = 1.0;          // GLOW — hologram brightness

    this._nextId = 1;
    this.hands = [];
    this._prevHands = [];
    this.streaks = {};        // hand id -> array of recent points (light trails)

    this._makeHandLayer();
    this._buildPanels();
  }

  // offscreen layer to composite each hand as ONE solid silhouette (palm + fat
  // fingers unioned) — drawing the parts opaque here, then blitting the whole
  // shape translucently, avoids the additive double-bright seams that made the
  // hand read as separate sticks.
  _makeHandLayer() {
    this.hl = document.createElement("canvas");
    this.hl.width = Math.max(1, Math.round(this.w * this.dpr));
    this.hl.height = Math.max(1, Math.round(this.h * this.dpr));
    this.hlx = this.hl.getContext("2d");
  }

  onResize() { this._makeHandLayer(); }

  _buildPanels() {
    const n = Math.round(6 * this.density);
    this.panels = [];
    for (let i = 0; i < n; i++) {
      const w = rand(150, 320), h = w * rand(0.55, 0.8);
      this.panels.push({
        x: rand(w * 0.6, this.w - w * 0.6) || this.w * (0.2 + 0.6 * Math.random()),
        y: rand(h * 0.6, this.h - h * 0.6) || this.h * (0.2 + 0.6 * Math.random()),
        w, h, angle: rand(-0.18, 0.18),
        vx: 0, vy: 0, va: 0,
        kind: KINDS[i % KINDS.length],
        seed: Math.random() * 1000,
        bright: 0.5,                 // eases up when active/grabbed
        grab: null,                  // { ids:[...], ref:{...} }
      });
    }
  }

  // ---- read hands into persistent descriptors (stable id frame-to-frame) ----
  _readHands(results) {
    const cur = [];
    const lms = (results && results.landmarks) || [];
    for (const lm of lms) {
      const wrist = this.toCanvas(lm[HAND.WRIST]);
      const thumb = this.toCanvas(lm[HAND.THUMB]);
      const index = this.toCanvas(lm[HAND.INDEX]);
      const base = this.toCanvas(lm[9]);
      const scale = Math.hypot(base.x - wrist.x, base.y - wrist.y) + 1;
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale;
      const pinch = pinchDist < 0.55;
      const pinchPt = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
      cur.push({
        pts: lm.map((p) => this.toCanvas(p)),
        wrist, index, pinchPt, pinch, scale,
        id: 0, prevPinch: { x: pinchPt.x, y: pinchPt.y }, justPinched: false, justReleased: false,
      });
    }
    // match to previous hands by nearest wrist so ids (and grabs) persist
    const used = new Set();
    const thresh = Math.min(this.w, this.h) * 0.35;
    for (const h of cur) {
      let best = null, bestD = thresh;
      for (const p of this._prevHands) {
        if (used.has(p.id)) continue;
        const d = Math.hypot(p.wrist.x - h.wrist.x, p.wrist.y - h.wrist.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) {
        used.add(best.id);
        h.id = best.id;
        h.prevPinch = { x: best.pinchPt.x, y: best.pinchPt.y };
        h.justPinched = h.pinch && !best.pinch;
        h.justReleased = !h.pinch && best.pinch;
      } else {
        h.id = this._nextId++;
        h.justPinched = h.pinch;
      }
    }
    this.hands = cur;
    this._prevHands = cur.map((h) => ({ id: h.id, wrist: h.wrist, pinchPt: h.pinchPt, pinch: h.pinch }));
  }

  _handById(id) { return this.hands.find((h) => h.id === id) || null; }

  // is a world point inside a panel's (rotated) rectangle, with padding?
  _inPanel(panel, x, y, pad = 18) {
    const dx = x - panel.x, dy = y - panel.y;
    const c = Math.cos(-panel.angle), s = Math.sin(-panel.angle);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) < panel.w / 2 + pad && Math.abs(ly) < panel.h / 2 + pad;
  }

  // ---- gesture → grab/scale/throw logic -------------------------------------
  _updateGrabs() {
    // 1) pinch-starts: each newly-pinching hand grabs the nearest panel under it
    for (const h of this.hands) {
      if (!h.justPinched) continue;
      let target = null, bestD = 1e9;
      for (const p of this.panels) {
        if (!this._inPanel(p, h.pinchPt.x, h.pinchPt.y)) continue;
        const d = Math.hypot(p.x - h.pinchPt.x, p.y - h.pinchPt.y);
        if (d < bestD) { bestD = d; target = p; }
      }
      if (target) {
        if (!target.grab) target.grab = { ids: [], ref: null };
        if (target.grab.ids.length < 2 && !target.grab.ids.includes(h.id)) {
          target.grab.ids.push(h.id);
          target.grab.ref = null;         // force re-capture for the new hand set
        }
      }
    }
    // 2) drop hands that released or vanished
    for (const p of this.panels) {
      if (!p.grab) continue;
      const before = p.grab.ids.length;
      p.grab.ids = p.grab.ids.filter((id) => {
        const h = this._handById(id);
        return h && h.pinch;
      });
      if (p.grab.ids.length !== before) p.grab.ref = null;   // set changed → re-capture
      if (p.grab.ids.length === 0) {
        // released entirely: keep whatever inertia the panel already has
        p.grab = null;
      }
    }
    // 3) apply active grabs
    for (const p of this.panels) {
      if (!p.grab || !p.grab.ids.length) continue;
      const hs = p.grab.ids.map((id) => this._handById(id)).filter(Boolean);
      if (!hs.length) continue;
      p.bright = Math.min(1.4, p.bright + 0.12);

      if (hs.length === 1) {
        const h = hs[0];
        if (!p.grab.ref) p.grab.ref = { off: { x: p.x - h.pinchPt.x, y: p.y - h.pinchPt.y } };
        const tx = h.pinchPt.x + p.grab.ref.off.x;
        const ty = h.pinchPt.y + p.grab.ref.off.y;
        // velocity = how fast we're dragging (for the throw on release)
        p.vx = (tx - p.x); p.vy = (ty - p.y); p.va *= 0.6;
        p.x = tx; p.y = ty;
      } else {
        // two hands on one panel → stretch + rotate about their midpoint
        const a = hs[0].pinchPt, b = hs[1].pinchPt;
        const dist = Math.hypot(a.x - b.x, a.y - b.y) + 1;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!p.grab.ref || p.grab.ref.dist0 == null) {
          p.grab.ref = { dist0: dist, ang0: ang, w0: p.w, h0: p.h, angle0: p.angle };
        }
        const r = p.grab.ref;
        const sc = clamp(dist / r.dist0, 0.4, 3.2);
        p.w = clamp(r.w0 * sc, 110, 620);
        p.h = clamp(r.h0 * sc, 70, 460);
        p.angle = r.angle0 + (ang - r.ang0);
        p.vx = mid.x - p.x; p.vy = mid.y - p.y;
        p.x = mid.x; p.y = mid.y;
      }
    }
  }

  _simulate(dt) {
    const k = clamp(dt * 60, 0.5, 2);
    const margin = 40;
    for (const p of this.panels) {
      if (!p.grab) {
        // glass-on-air inertia: drift, slowly decelerate, gently bob
        p.x += p.vx * k; p.y += p.vy * k; p.angle += p.va * k;
        p.vx *= 0.94; p.vy *= 0.94; p.va *= 0.93;
        p.bright = Math.max(0.45, p.bright - 0.02 * k);
        // soft spring back when drifting off-screen (never lose a panel)
        if (p.x < margin) p.vx += (margin - p.x) * 0.01;
        if (p.x > this.w - margin) p.vx += (this.w - margin - p.x) * 0.01;
        if (p.y < margin) p.vy += (margin - p.y) * 0.01;
        if (p.y > this.h - margin) p.vy += (this.h - margin - p.y) * 0.01;
        // a barely-there ambient drift so the field feels alive
        const n = this.noise(p.seed, p.y * 0.001 + p.x * 0.001);
        p.vx += Math.cos(n * TAU) * 0.04; p.vy += Math.sin(n * TAU) * 0.04;
      }
    }
  }

  // ---- drawing --------------------------------------------------------------
  _drawBg(t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    const bg = g.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, "#03070b");
    bg.addColorStop(1, "#04111a");
    g.fillStyle = bg;
    g.fillRect(0, 0, this.w, this.h);

    // faint receding perspective grid → "operator's deck" depth
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(${WING},0.05)`;
    g.lineWidth = 1;
    const cx = this.w / 2, hz = this.h * 0.5;
    for (let i = -10; i <= 10; i++) {
      g.beginPath();
      g.moveTo(cx + i * 30, hz);
      g.lineTo(cx + i * this.w * 0.13, this.h);
      g.stroke();
    }
    for (let j = 1; j <= 6; j++) {
      const y = hz + (this.h - hz) * (j / 6) * (j / 6);
      g.beginPath(); g.moveTo(0, y); g.lineTo(this.w, y); g.stroke();
    }
  }

  _panelPalette(p) {
    const a = (v) => clamp(v * (0.5 + this.glow * 0.6) * p.bright, 0, 1);
    return {
      faint: `rgba(${WING},${a(0.05)})`,
      line: `rgba(${WING},${a(0.5)})`,
      bright: `rgba(${WING},${a(0.85)})`,
      hot: `rgba(220,255,250,${a(0.95)})`,
    };
  }

  _drawPanel(g, p, t) {
    const grabbed = !!(p.grab && p.grab.ids.length);
    const col = this._panelPalette(p);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.angle);
    const hw = p.w / 2, hh = p.h / 2;

    // glass fill
    g.fillStyle = col.faint;
    g.fillRect(-hw, -hh, p.w, p.h);

    // scanlines
    g.strokeStyle = `rgba(${WING},${clamp(0.06 * p.bright, 0, 0.2)})`;
    g.lineWidth = 1;
    for (let y = -hh + 4; y < hh; y += 6) {
      g.beginPath(); g.moveTo(-hw + 4, y); g.lineTo(hw - 4, y); g.stroke();
    }

    // title bar
    g.fillStyle = col.line;
    g.fillRect(-hw, -hh, p.w, 3);
    g.fillStyle = col.bright;
    for (let i = 0; i < 4; i++) g.fillRect(-hw + 8 + i * 9, -hh + 7, 5, 2);

    // content by kind
    this._drawContent(g, p, t, col, hw, hh);

    // border
    g.strokeStyle = grabbed ? col.hot : col.line;
    g.lineWidth = grabbed ? 2 : 1.2;
    g.strokeRect(-hw, -hh, p.w, p.h);

    // corner brackets (extend outward when grabbed → "locked on")
    const e = grabbed ? 22 : 14, off = grabbed ? 5 : 0;
    g.strokeStyle = col.hot; g.lineWidth = 2;
    const corner = (sx, sy) => {
      const x = sx * (hw + off), y = sy * (hh + off);
      g.beginPath();
      g.moveTo(x, y - sy * e); g.lineTo(x, y); g.lineTo(x - sx * e, y);
      g.stroke();
    };
    corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1);

    g.restore();
  }

  _drawContent(g, p, t, col, hw, hh) {
    const seed = p.seed;
    g.strokeStyle = col.bright;
    g.fillStyle = col.bright;
    g.lineWidth = 1.4;
    const pad = 14, top = -hh + 16;
    const iw = p.w - pad * 2, ih = p.h - 26 - pad;
    if (p.kind === "wave") {
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const x = -hw + pad + (iw * i) / 48;
        const y = top + ih * 0.5 +
          Math.sin(i * 0.5 + t * 2 + seed) * ih * 0.22 *
          Math.sin(i * 0.13 + seed);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    } else if (p.kind === "bars") {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const bh = (0.2 + 0.8 * Math.abs(Math.sin(i * 1.3 + t * 1.5 + seed))) * ih;
        const x = -hw + pad + (iw * i) / n;
        g.fillRect(x, top + ih - bh, iw / n - 3, bh);
      }
    } else if (p.kind === "grid") {
      const c = 6, r = 4;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
        const on = (Math.sin(i * 2.1 + j * 1.7 + t * 2 + seed) > 0.2);
        g.globalAlpha = on ? 1 : 0.25;
        g.beginPath();
        g.arc(-hw + pad + iw * (i + 0.5) / c, top + ih * (j + 0.5) / r, 3, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (p.kind === "rings") {
      const cx = 0, cy = top + ih * 0.5;
      for (let i = 1; i <= 4; i++) {
        g.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 - i + seed));
        g.beginPath(); g.arc(cx, cy, (Math.min(iw, ih) * 0.5) * i / 4, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    } else if (p.kind === "scan") {
      const y = top + ih * (0.5 + 0.45 * Math.sin(t * 1.5 + seed));
      g.beginPath(); g.moveTo(-hw + pad, y); g.lineTo(-hw + pad + iw, y); g.stroke();
      g.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) {
        const ry = top + ih * Math.abs(Math.sin(i * 1.9 + seed));
        g.fillRect(-hw + pad, ry, iw * (0.3 + 0.6 * Math.abs(Math.sin(i + seed))), 2);
      }
      g.globalAlpha = 1;
    } else { // target
      const cx = 0, cy = top + ih * 0.5, rr = Math.min(iw, ih) * 0.42;
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(cx - rr - 6, cy); g.lineTo(cx + rr + 6, cy);
      g.moveTo(cx, cy - rr - 6); g.lineTo(cx, cy + rr + 6); g.stroke();
      g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
    }
  }

  // Trace a hand as ONE solid filled silhouette into context `c`: the palm
  // polygon plus each finger as a chain of round-capped segments that taper from
  // a fat knuckle to a slim tip. Drawn opaque + source-over so all parts UNION
  // into a single shape (no internal seams). `scaleW` scales finger thickness.
  _traceHandSolid(c, pts, S, fillStyle) {
    c.globalCompositeOperation = "source-over";
    c.lineCap = "round"; c.lineJoin = "round";
    c.fillStyle = c.strokeStyle = fillStyle;
    // palm body
    c.beginPath();
    PALM_OUTLINE.forEach((idx, k) => {
      const p = pts[idx]; k === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y);
    });
    c.closePath(); c.fill();
    // fingers — fat near the palm, tapering to the tip
    for (const chain of FINGERS) {
      for (let k = 1; k < chain.length; k++) {
        const a = pts[chain[k - 1]], b = pts[chain[k]];
        const taper = 1 - (k - 1) / (chain.length - 1);   // 1 at base → ~0 at tip
        c.lineWidth = Math.max(2, (4.5 + 7 * taper) * S);
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
    // round the fingertips off
    for (const idx of TIPS) {
      const p = pts[idx];
      c.beginPath(); c.arc(p.x, p.y, Math.max(1.5, 3 * S), 0, TAU); c.fill();
    }
  }

  // Draw a HAND OF LIGHT as a SOLID shape, not sticks. The full silhouette (palm
  // + fat fingers unioned) is rendered on an offscreen layer, then blitted in two
  // passes — a wide soft bloom and a crisp body — so it reads as one glowing
  // glove of light with luminous fingertips, never a skeleton.
  _drawHand(g, h, t) {
    const gl = 0.5 + this.glow * 0.5;
    const pts = h.pts;
    const S = h.scale / 90;                       // size factor (resolution-free)

    // light streak trail behind the hand
    g.globalCompositeOperation = "lighter";
    const tr = this.streaks[h.id];
    if (tr && tr.length > 1) {
      for (let i = 1; i < tr.length; i++) {
        const a = (i / tr.length) * 0.45 * gl;
        g.strokeStyle = `rgba(${WING},${clamp(a, 0, 1)})`;
        g.lineWidth = (i / tr.length) * 4;
        g.beginPath(); g.moveTo(tr[i - 1].x, tr[i - 1].y); g.lineTo(tr[i].x, tr[i].y); g.stroke();
      }
    }

    // render the solid silhouette to the offscreen layer. A cyan-white fill so
    // that blitting it additively glows aqua (on-palette) while staying bright.
    const c = this.hlx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    this._traceHandSolid(c, pts, S, "rgb(150,240,225)");

    // blit twice with the wing tint: a wide blurred bloom + a crisp body. Using a
    // blur filter on the body gives soft glassy edges (a glove, not a wireframe).
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp(0.14 * gl, 0, 1);
    g.filter = `blur(${Math.round(10 * this.dpr)}px)`;
    g.drawImage(this.hl, 0, 0);
    g.globalAlpha = clamp(0.5 * gl, 0, 1);
    g.filter = `blur(${Math.round(2 * this.dpr)}px)`;
    g.drawImage(this.hl, 0, 0);
    g.filter = "none";
    g.globalAlpha = 1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // crisp bright edge around the silhouette so the form stays defined
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = `rgba(${WING},${clamp(0.5 * gl, 0, 1)})`;
    g.lineWidth = 1.4 * S;
    g.beginPath();
    PALM_OUTLINE.forEach((idx, k) => {
      const p = pts[idx]; k === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
    });
    g.closePath(); g.stroke();

    // luminous fingertips
    for (const idx of TIPS) {
      const p = pts[idx];
      const r = 3.2 * S;
      const tg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      tg.addColorStop(0, `rgba(230,255,250,${clamp(0.9 * gl, 0, 1)})`);
      tg.addColorStop(0.4, `rgba(${WING},${clamp(0.5 * gl, 0, 1)})`);
      tg.addColorStop(1, `rgba(${WING},0)`);
      g.fillStyle = tg;
      g.beginPath(); g.arc(p.x, p.y, r * 3, 0, TAU); g.fill();
      g.fillStyle = `rgba(235,255,252,${clamp(0.9 * gl, 0, 1)})`;
      g.beginPath(); g.arc(p.x, p.y, r * 0.5, 0, TAU); g.fill();
    }

    // pinch reticle at the thumb/index midpoint (tight ring when pinching)
    const pp = h.pinchPt, r = h.pinch ? 9 : 16;
    const grd = g.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, r * 2);
    grd.addColorStop(0, `rgba(220,255,250,${h.pinch ? 0.95 : 0.5})`);
    grd.addColorStop(1, `rgba(${WING},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(pp.x, pp.y, r * 2, 0, TAU); g.fill();
    g.strokeStyle = `rgba(220,255,250,${h.pinch ? 0.95 : 0.6})`;
    g.lineWidth = h.pinch ? 2.5 : 1.5;
    g.beginPath(); g.arc(pp.x, pp.y, r, 0, TAU); g.stroke();
  }

  _trackStreaks() {
    // keep a short trail of each live hand's pinch point; drop dead hands
    const live = new Set(this.hands.map((h) => h.id));
    for (const id of Object.keys(this.streaks)) if (!live.has(+id)) delete this.streaks[id];
    for (const h of this.hands) {
      const arr = this.streaks[h.id] || (this.streaks[h.id] = []);
      arr.push({ x: h.pinchPt.x, y: h.pinchPt.y });
      if (arr.length > 14) arr.shift();
    }
  }

  // ---- per-frame (tracking ready) ------------------------------------------
  visionFrame(dt, t, results) {
    this._readHands(results);
    this._updateGrabs();
    this._simulate(dt);
    this._trackStreaks();

    const g = this.ctx;
    this._drawBg(t);
    g.globalCompositeOperation = "lighter";
    for (const p of this.panels) this._drawPanel(g, p, t);
    for (const h of this.hands) this._drawHand(g, h, t);

    if (!this.hands.length) this._hint(t);
  }

  _hint(t) {
    const g = this.ctx;
    g.globalCompositeOperation = "source-over";
    g.save();
    g.textAlign = "center";
    g.fillStyle = `rgba(${WING},${0.5 + 0.15 * Math.sin(t * 1.5)})`;
    g.font = "14px Inter, system-ui, sans-serif";
    g.fillText("손을 들어 허공의 화면을 잡으세요  ·  꼬집어 잡고, 두 손으로 펼치고, 휙 던지세요",
      this.w / 2, this.h * 0.5);
    g.restore();
  }

  // ---- idle (loading / failed): panels drift on their own ------------------
  drawIdle(dt, t) {
    this.hands = [];
    this._simulate(dt);
    const g = this.ctx;
    this._drawBg(t);
    g.globalCompositeOperation = "lighter";
    for (const p of this.panels) this._drawPanel(g, p, t);
    this._hint(t);
  }

  controls(host) {
    host.appendChild(slider("GESTURE GAIN", 0.4, 2.0, this.gain, 0.05, (v) => (this.gain = v)));
    host.appendChild(slider("PANELS", 0.4, 2.0, this.density, 0.05, (v) => { this.density = v; this._buildPanels(); }));
    host.appendChild(slider("GLOW", 0.3, 2.0, this.glow, 0.05, (v) => (this.glow = v)));
    host.appendChild(buttonRow([
      { label: "정렬 (re-arrange)", on: () => this._buildPanels() },
    ]));
  }

  visionTeardown() {
    this.panels = [];
    this.hands = [];
    this._prevHands = [];
    this.streaks = {};
    this.hl = null; this.hlx = null;
  }
}
