// ============================================================================
//  56 · Emergence (떠오름) — the aha! moment, staged  [VisionPiece · hand]
//  ~800 meaningless shards (short strokes) drift in brownian noise. Hidden in
//  the field is a WORD (시간, 빛, 봄, 꿈…): a subset of shards owns a target
//  pose sampled from a huge glyph raster. Where your HAND passes (MediaPipe
//  index fingertip; the cursor when no camera) shards ease toward their
//  targets — aligning, converging, agreeing — and the word locally surfaces
//  out of noise: proximity, similarity, common fate. Leave, and it dissolves.
//  When enough of the word is assembled (>72%), the WHOLE figure snaps
//  crisp with a pulse — the gestalt "aha!" — holds a breath, then a new word
//  hides itself. Non-member shards flee the hand slightly, so meaning
//  condenses exactly where you attend.
// ============================================================================

import { clamp, lerp, rand, TAU, hexToRgb, makeNoise } from "../engine.js";
import { VisionPiece, HAND } from "../vision.js";
import { slider } from "./01-currents.js";

const WORDS = ["시간", "빛", "봄", "꿈", "바다", "숨", "밤", "고요"];
const N = 800;

export default class Emergence extends VisionPiece {
  get tracker() { return "hand"; }
  get numHands() { return 1; }

  visionSetup() {
    this.noise = makeNoise();
    this.acc = hexToRgb(this.accent || "#bd7dff");
    this.revealR = 1.25;     // REVEAL R slider

    this.shards = [];
    for (let i = 0; i < N; i++) {
      this.shards.push({
        x: rand(0, 1), y: rand(0, 1), a: rand(0, TAU),   // pose (normalised)
        tx: 0, ty: 0, ta: 0, member: false,               // target pose
        g: 0,                                             // gathered 0..1
        seed: rand(0, 100), len: rand(7, 13),
      });
    }
    this.wordIdx = (Math.random() * WORDS.length) | 0;
    this.snap = 0;           // full-figure snap envelope
    this.snapHold = 0;
    this._assignWord();
  }

  // sample the current word into shard targets
  _assignWord() {
    const word = WORDS[this.wordIdx % WORDS.length];
    const off = document.createElement("canvas");
    const OW = 320, OH = 160;
    off.width = OW; off.height = OH;
    const g = off.getContext("2d");
    g.font = `900 ${word.length > 1 ? 108 : 132}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(word, OW / 2, OH / 2 + 6);
    const px = g.getImageData(0, 0, OW, OH).data;

    // collect edge-ish samples with local gradient direction for stroke angle
    const pts = [];
    for (let y = 2; y < OH - 2; y += 2)
      for (let x = 2; x < OW - 2; x += 2) {
        if (px[(y * OW + x) * 4 + 3] < 128) continue;
        const gx = px[(y * OW + x + 2) * 4 + 3] - px[(y * OW + x - 2) * 4 + 3];
        const gy = px[((y + 2) * OW + x) * 4 + 3] - px[((y - 2) * OW + x) * 4 + 3];
        pts.push([x / OW, y / OH, Math.atan2(gy, gx) + Math.PI / 2]);
      }
    // shuffle-select up to 62% of shards as members
    const memberN = Math.min(pts.length, Math.floor(N * 0.82));
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    for (let i = 0; i < N; i++) {
      const s = this.shards[i];
      if (i < memberN) {
        const [x, y, a] = pts[i % pts.length];
        s.member = true;
        s.tx = 0.5 + (x - 0.5) * 0.50;      // word spans ~50% width — denser, readable
        s.ty = 0.47 + (y - 0.5) * 0.50;
        s.ta = a;
      } else s.member = false;
      s.g = 0;
    }
    this.word = word;
  }

  visionFrame(dt, t, res) {
    let hx = -1e5, hy = -1e5, has = false;
    const lms = res && res.landmarks && res.landmarks[0];
    if (lms && lms[HAND.INDEX]) {
      const p = this.toCanvas(lms[HAND.INDEX]);
      hx = p.x; hy = p.y; has = true;
    }
    this._scene(dt, t, hx, hy, has, true);
  }
  drawIdle(dt, t) {
    this._scene(dt, t, this.pointer.x, this.pointer.y, this.pointer.active, false);
  }

  _scene(dt, t, hx, hy, hasHand, viaHand) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const [ar, ag, ab] = this.acc;
    const R = Math.min(W, H) * 0.24 * this.revealR;

    // snap lifecycle
    if (this.snapHold > 0) {
      this.snapHold -= dt;
      if (this.snapHold <= 0) { this.wordIdx++; this._assignWord(); this.snap = 0; }
    }

    g.fillStyle = "#07080b"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    bg.addColorStop(0, "rgba(60,50,90,0.14)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // ---- shard dynamics + draw ------------------------------------------------
    let gathered = 0, members = 0;
    g.lineCap = "round";
    for (const s of this.shards) {
      const sx = s.x * W, sy = s.y * H;
      const d = Math.hypot(sx - hx, sy - hy);
      const inReach = hasHand && d < R;

      if (s.member) {
        members++;
        // gather where the hand attends; a touched shard never fully forgets,
        // so sweeping the field ACCUMULATES the word instead of erasing it
        const floor = s.g > 0.2 ? 0.34 : 0;
        const want = this.snapHold > 0 ? 1 : (inReach ? 1 - (d / R) * 0.3 : floor);
        s.g = lerp(s.g, want, clamp(dt * (want > s.g ? 4.2 : 0.5), 0, 1));
        gathered += s.g;
      } else if (inReach) {
        // non-members drift out of the way — meaning displaces noise
        const push = (1 - d / R) * 26 * dt;
        s.x += ((sx - hx) / (d + 4)) * push / W;
        s.y += ((sy - hy) / (d + 4)) * push / H;
      }

      // brownian drift, suppressed as a shard commits to the figure
      const wander = (1 - s.g) * 0.014;
      s.x += (this.noise(s.seed, t * 0.24) - 0.5) * wander * dt * 60 / 10;
      s.y += (this.noise(s.seed + 50, t * 0.24) - 0.5) * wander * dt * 60 / 10;
      s.x = (s.x + 1) % 1; s.y = (s.y + 1) % 1;

      // pose = lerp(noise pose, target pose, g) — common fate made visible
      const gx = s.member ? lerp(s.x, s.tx, s.g) : s.x;
      const gy = s.member ? lerp(s.y, s.ty, s.g) : s.y;
      const na = s.a + t * 0.22 * (1 - s.g);
      const aa = s.member ? lerp(na, s.ta, s.g) : na;
      const X = gx * W, Y = gy * H;
      const L = s.len * (1 + s.g * 0.25);

      const lit = s.g;
      const al = 0.16 + lit * 0.7 + this.snap * 0.2;
      g.strokeStyle = lit > 0.04
        ? `rgba(${lerp(150, ar, lit) | 0},${lerp(150, ag, lit) | 0},${lerp(170, ab, lit) | 0},${al})`
        : `rgba(140,145,165,${al})`;
      g.lineWidth = 1.2 + lit * 1.3;
      g.beginPath();
      g.moveTo(X - Math.cos(aa) * L, Y - Math.sin(aa) * L);
      g.lineTo(X + Math.cos(aa) * L, Y + Math.sin(aa) * L);
      g.stroke();
    }

    // ---- the aha!: enough of the word assembled → full snap -------------------
    const ratio = members ? gathered / members : 0;
    if (ratio > 0.6 && this.snapHold <= 0) {
      this.snapHold = 3.2; this.snap = 1;
      for (const s of this.shards) if (s.member) s.g = 1;
    }
    this.snap = Math.max(0, this.snap - dt * 1.2);
    if (this.snap > 0.02) {
      g.fillStyle = `rgba(${ar},${ag},${ab},${0.10 * this.snap})`;
      g.fillRect(0, 0, W, H);
    }

    // progress whisper + hand halo
    if (hasHand) {
      const hg = g.createRadialGradient(hx, hy, 0, hx, hy, R);
      hg.addColorStop(0, `rgba(${ar},${ag},${ab},0.05)`); hg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hg;
      g.beginPath(); g.arc(hx, hy, R, 0, TAU); g.fill();
    }
    g.font = "11px ui-monospace, Menlo, monospace";
    g.textAlign = "right"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(170,165,195,0.45)";
    g.fillText(
      (viaHand ? "HAND-TRACKING" : "CURSOR = 손") + ` · ${Math.round(ratio * 100)}%`,
      W - 14, H - 12);

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  controls(host) {
    host.appendChild(slider("REVEAL R", 0.5, 1.8, this.revealR, 0.05, (v) => (this.revealR = v)));
  }
}
