// ============================================================================
//  77 · Body Bounce (공 튀어!) — 온몸으로 비치볼을 [VisionPiece · pose]
//  아이들의 방. 하늘에서 알록달록 큰 비치볼이 통통 내려온다(중력 + 살랑바람).
//  카메라가 내 몸을 보면 머리·어깨·양팔로 공을 받아 튕겨 올린다! 팔을 휘두른
//  속도가 그대로 공에 실려 더 높이 날아간다. 공이 몸에 닿으면 찌그러졌다
//  펴지는 스쿼시 + 팡 파티클, 이어치기 수가 커질수록 공 둘레가 반짝,
//  10번마다 색종이가 쏟아진다. 바닥에 떨어져도 실패 없음 — 통통 구르다
//  사라지고 위에서 새 공이 내려온다.
//  몸은 또렷한 빛-스틱맨으로: 머리(원)·어깨(11-12)·양팔(11-13-15, 12-14-16)을
//  글로우 스트로크로 그린다(74 스켈레톤의 포즈 버전). visibility 낮은 점은 무시.
//  카메라가 없으면 커서가 '뜰채'(원 콜라이더)가 되어 공을 받는다 — 완전한 폴백.
//  results.landmarks[0] = 33 pose landmarks. numPoses 1.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece } from "../vision.js";
import { slider } from "./01-currents.js";

const MAXBALLS = 16;
const BIDX = [0, 11, 12, 13, 14, 15, 16];      // nose·shoulders·elbows·wrists
const VIS = 0.5;                                // visibility 문턱
const GRAV = 780;                               // px/s²
const PALETTE = [4, 32, 50, 150, 200, 285, 330];

export default class BodyBounce extends VisionPiece {
  get tracker() { return "pose"; }

  visionSetup() {
    this.ballTarget = 4;                        // BALLS 슬라이더
    this.combo = 0;                             // 연속 몸-튕기기
    this.lastConfetti = 0;
    this._spawnAcc = 0.4;

    this.balls = [];
    for (let i = 0; i < MAXBALLS; i++)
      this.balls.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, hue: 0, spin: 0,
        sq: 0, sqAng: 0, alpha: 1, rolling: false, cool: 0, floor: 0 });

    this.pops = [];
    for (let i = 0; i < 180; i++) this.pops.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, hue: 0, r: 0 });
    this.conf = [];
    for (let i = 0; i < 160; i++) this.conf.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, hue: 0, life: 0 });

    // body: current pts (map by index), previous, velocity
    this.body = { on: false, glow: 0, headR: 40, shoulderW: 120,
      pts: {}, ppts: {}, vel: {} };
    for (const i of BIDX) { this.body.pts[i] = null; this.body.ppts[i] = null; this.body.vel[i] = [0, 0]; }

    // net (cursor fallback collider)
    this.net = { on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 52, glow: 0 };
  }

  // ---- spawning --------------------------------------------------------------
  _spawn() {
    const b = this.balls.find((q) => !q.on);
    if (!b) return;
    const W = this.w;
    b.on = true; b.rolling = false; b.alpha = 1; b.floor = 0; b.cool = 0;
    b.r = rand(32, 54);
    b.x = rand(W * 0.16, W * 0.84);
    b.y = -b.r - 10;
    b.vx = rand(-50, 50);
    b.vy = rand(50, 130);
    b.hue = PALETTE[(Math.random() * PALETTE.length) | 0];
    b.spin = rand(0, TAU);
    b.sq = 0; b.sqAng = 0;
  }

  _pop(x, y, hue, n) {
    let c = 0;
    for (const p of this.pops) {
      if (p.on || c >= n) continue;
      c++; p.on = true;
      const a = rand(0, TAU), s = rand(90, 300);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 60;
      p.life = rand(0.3, 0.7); p.hue = hue + rand(-20, 20); p.r = rand(2, 5);
    }
  }

  _confetti() {
    const W = this.w;
    let c = 0;
    for (const p of this.conf) {
      if (p.on || c >= 70) continue;
      c++; p.on = true;
      p.x = rand(W * 0.2, W * 0.8); p.y = rand(-40, -10);
      p.vx = rand(-80, 80); p.vy = rand(40, 160);
      p.rot = rand(0, TAU); p.vr = rand(-8, 8);
      p.hue = rand(0, 360); p.life = rand(1.6, 2.8);
    }
  }

  // ---- collision: a bouncy capsule (a==b → a circle, e.g. the head) ----------
  _hitCapsule(b, ax, ay, bx, by, capR, avx, avy, bvx, bvy) {
    if (b.cool > 0) return false;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((b.x - ax) * dx + (b.y - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cy = ay + dy * t;
    let ox = b.x - cx, oy = b.y - cy;
    let d = Math.hypot(ox, oy);
    const minD = b.r + capR;
    if (d >= minD) return false;
    d = d || 0.001;
    const nx = ox / d, ny = oy / d;
    const svx = lerp(avx, bvx, t), svy = lerp(avy, bvy, t);
    // push out
    b.x = cx + nx * minD; b.y = cy + ny * minD;
    // reflect the velocity relative to the moving limb
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) { const rest = 1.12; b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
    // carry the swing + a gentle upward pop so it's easy for little ones
    b.vx += svx * 0.55; b.vy += svy * 0.55 - 70;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 1500) { b.vx *= 1500 / sp; b.vy *= 1500 / sp; }
    // squash toward the impact normal
    b.sq = clamp(0.22 + Math.abs(vn) * 0.0008, 0, 0.55);
    b.sqAng = Math.atan2(ny, nx);
    b.cool = 0.14;
    this.combo++;
    this._pop(cx, cy, b.hue, 12);
    if (this.combo % 10 === 0 && this.combo !== this.lastConfetti) { this.lastConfetti = this.combo; this._confetti(); }
    return true;
  }

  _collideBody(b) {
    const p = this.body.pts, v = this.body.vel, aR = clamp(this.body.shoulderW * 0.1, 13, 34);
    // head (point collider)
    if (p[0]) this._hitCapsule(b, p[0].x, p[0].y, p[0].x, p[0].y, this.body.headR, v[0][0], v[0][1], v[0][0], v[0][1]);
    // shoulders + both arms
    const segs = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
    for (const s of segs) {
      const a = p[s[0]], c = p[s[1]];
      if (a && c) this._hitCapsule(b, a.x, a.y, c.x, c.y, aR, v[s[0]][0], v[s[0]][1], v[s[1]][0], v[s[1]][1]);
    }
  }

  _collideNet(b) {
    const n = this.net;
    if (n.on) this._hitCapsule(b, n.x, n.y, n.x, n.y, n.r, n.vx, n.vy, n.vx, n.vy);
  }

  // ---- physics for one ball --------------------------------------------------
  _step(b, dt, wind) {
    b.cool -= dt;
    b.sq *= Math.exp(-dt * 6);
    if (b.rolling) {
      b.vx *= Math.exp(-dt * 2.4); b.vy = 0;
      b.x += b.vx * dt; b.spin += b.vx * dt * 0.02;
      b.alpha -= dt * 0.7;
      if (b.alpha <= 0 || b.x < -b.r * 2 || b.x > this.w + b.r * 2) b.on = false;
      return;
    }
    b.vy += GRAV * dt; b.vx += wind * dt;
    b.vx *= Math.exp(-dt * 0.25);
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.spin += b.vx * dt * 0.012;
    // side walls
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
    else if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
    // floor — never a failure, just a soft bounce then roll away
    const fy = this.h - b.r;
    if (b.y > fy) {
      b.y = fy;
      b.floor++;
      if (this.combo > 0) { this.combo = 0; this.lastConfetti = 0; }   // missed → combo resets
      b.vy = -Math.abs(b.vy) * 0.52;
      b.sq = 0.4; b.sqAng = Math.PI / 2;
      this._pop(b.x, fy, b.hue, 6);
      if (Math.abs(b.vy) < 170 || b.floor > 3) { b.rolling = true; b.vy = 0; b.vx += rand(-40, 40); }
    }
    if (b.y < -b.r * 3) b.on = false;
  }

  // ---- pose tracking ---------------------------------------------------------
  _digest(lm, dt) {
    const p = this.body.pts, pp = this.body.ppts, v = this.body.vel;
    let any = false;
    for (const i of BIDX) {
      const l = lm[i];
      if (l && (l.visibility === undefined || l.visibility >= VIS)) {
        const c = this.toCanvas(l);
        if (pp[i] && dt > 1e-3) { v[i][0] = (c.x - pp[i].x) / dt; v[i][1] = (c.y - pp[i].y) / dt; }
        else { v[i][0] = 0; v[i][1] = 0; }
        p[i] = c;
        if (!pp[i]) pp[i] = { x: c.x, y: c.y }; else { pp[i].x = c.x; pp[i].y = c.y; }
        any = true;
      } else { p[i] = null; pp[i] = null; v[i][0] = 0; v[i][1] = 0; }
    }
    if (p[11] && p[12]) {
      this.body.shoulderW = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
      this.body.headR = clamp(this.body.shoulderW * 0.34, 28, 100);
    }
    this.body.on = any;
  }

  visionFrame(dt, t, res) {
    const lms = (res && res.landmarks && res.landmarks[0]) || null;
    if (lms && lms.length >= 17) this._digest(lms, dt);
    else { this.body.on = false; for (const i of BIDX) { this.body.pts[i] = null; this.body.ppts[i] = null; } }
    this.net.on = false;
    this._scene(dt, t, true);
  }

  drawIdle(dt, t) {
    this.body.on = false; for (const i of BIDX) this.body.pts[i] = null;
    const n = this.net;
    if (this.pointer.active) {
      if (!n.on) { n.px = this.pointer.x; n.py = this.pointer.y; }
      n.on = true; n.x = this.pointer.x; n.y = this.pointer.y;
      if (dt > 1e-3) { n.vx = (n.x - n.px) / dt; n.vy = (n.y - n.py) / dt; }
      n.px = n.x; n.py = n.y;
    } else { n.on = false; n.vx = 0; n.vy = 0; }
    this._scene(dt, t, false);
  }

  // ---- the whole scene -------------------------------------------------------
  _scene(dt, t, viaCam) {
    const g = this.ctx, W = this.w, H = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // warm bright sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#ffd9a0"); sky.addColorStop(0.5, "#ffb3c7"); sky.addColorStop(1, "#a6d9ff");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, H * 0.75);
    sun.addColorStop(0, "rgba(255,255,255,0.35)"); sun.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // soft ground band
    g.fillStyle = "rgba(120,200,150,0.28)"; g.fillRect(0, H - 26, W, 26);

    const glow = this.body.glow = clamp(this.body.glow + ((this.body.on || this.net.on) ? dt * 5 : -dt * 4), 0, 1);

    // keep the sky full of balls (never a losing state)
    this._spawnAcc += dt;
    const target = Math.round(this.ballTarget);
    let live = 0; for (const b of this.balls) if (b.on && !b.rolling) live++;
    if (live < target && this._spawnAcc > 0.55) { this._spawnAcc = 0; this._spawn(); }

    const wind = Math.sin(t * 0.3) * 55 + Math.sin(t * 0.11) * 30;

    // update + collide + draw balls
    for (const b of this.balls) {
      if (!b.on) continue;
      this._step(b, dt, wind);
      if (!b.on) continue;
      if (!b.rolling) { if (viaCam) this._collideBody(b); else this._collideNet(b); }
      this._drawBall(g, b, t);
    }

    // pop particles
    for (const p of this.pops) {
      if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = clamp(p.life * 2, 0, 1);
      g.fillStyle = `hsl(${p.hue} 90% 62%)`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // confetti
    for (const p of this.conf) {
      if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += 260 * dt; p.vx *= Math.exp(-dt * 0.6);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.globalAlpha = clamp(p.life, 0, 1);
      g.fillStyle = `hsl(${p.hue} 90% 62%)`;
      g.fillRect(-5, -3, 10, 6);
      g.restore();
    }
    g.globalAlpha = 1;

    // the body / net, unmistakable and glowing
    if (viaCam) this._drawBody(g, t, glow);
    else this._drawNet(g, t, glow);

    // friendly combo cheer
    if (this.combo >= 2) {
      g.font = `700 ${Math.max(20, H * 0.05)}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "top";
      g.fillStyle = `hsla(${(t * 60) % 360},90%,60%,0.92)`;
      g.fillText(`${this.combo}번 연속!`, W / 2, H * 0.06);
    }

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(60,60,80,0.7)";
    g.fillText(viaCam
      ? "온몸으로 공을 통통 튕겨요 — 팔로 머리로 받아 올려요 · 10번 이어치면 색종이가 팡!"
      : "카메라를 켜면 온몸으로 놀 수 있어요 — 지금은 커서가 뜰채예요 · 공을 받아 올려요!",
      W / 2, H - 12);
  }

  // ---- a bouncy beach ball ---------------------------------------------------
  _drawBall(g, b, t) {
    const spark = clamp(this.combo / 12, 0, 1);
    g.globalAlpha = b.alpha;
    // sparkle aura grows with the streak
    if (spark > 0.05 && !b.rolling) {
      const ag = g.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r * 1.9);
      ag.addColorStop(0, `hsla(${b.hue},95%,75%,${0.3 * spark})`);
      ag.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = ag; g.beginPath(); g.arc(b.x, b.y, b.r * 1.9, 0, TAU); g.fill();
    }
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.sqAng);
    g.scale(1 - b.sq * 0.4, 1 + b.sq * 0.4);
    g.rotate(b.spin - b.sqAng);
    const r = b.r;
    // 6 alternating panels (classic beach ball)
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(0, 0);
      g.arc(0, 0, r, (i / 6) * TAU, ((i + 1) / 6) * TAU); g.closePath();
      g.fillStyle = (i % 2 === 0) ? `hsl(${(b.hue + i * 24) % 360} 85% 60%)` : "rgba(255,255,255,0.94)";
      g.fill();
    }
    // shading + rim
    const sh = g.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
    sh.addColorStop(0, "rgba(255,255,255,0.35)"); sh.addColorStop(0.6, "rgba(255,255,255,0)");
    sh.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = sh; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.lineWidth = Math.max(1.5, r * 0.05); g.strokeStyle = "rgba(255,255,255,0.5)";
    g.beginPath(); g.arc(0, 0, r * 0.97, 0, TAU); g.stroke();
    // specular
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath(); g.arc(-r * 0.32, -r * 0.36, r * 0.16, 0, TAU); g.fill();
    g.restore();
    // twinkles around a hot streak
    if (spark > 0.2 && !b.rolling) {
      const n = Math.min(6, (this.combo / 2) | 0);
      g.fillStyle = "rgba(255,255,255,0.95)";
      for (let i = 0; i < n; i++) {
        const a = t * 2 + (i / n) * TAU, rr = b.r * 1.35;
        const x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        const s = 2 + Math.abs(Math.sin(t * 4 + i)) * 2.5;
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ---- the light stick-man (pose skeleton, 74 문법의 포즈 버전) ----------------
  _stroke(g, p, chain) {
    let started = false;
    for (const i of chain) {
      const q = p[i];
      if (!q) { started = false; continue; }
      if (!started) { g.beginPath(); g.moveTo(q.x, q.y); started = true; }
      else g.lineTo(q.x, q.y);
    }
    if (started) g.stroke();
  }

  _drawBody(g, t, glow) {
    if (glow < 0.02) return;
    const p = this.body.pts;
    g.lineCap = "round"; g.lineJoin = "round";
    const chains = [[0, 11], [0, 12], [11, 12], [11, 13, 15], [12, 14, 16]];
    // wide soft glow
    g.strokeStyle = `rgba(109,229,185,${0.3 * glow})`; g.lineWidth = 20;
    for (const ch of chains) this._stroke(g, p, ch);
    // bright core
    g.strokeStyle = `rgba(224,255,240,${0.85 * glow})`; g.lineWidth = 6;
    for (const ch of chains) this._stroke(g, p, ch);
    // head
    if (p[0]) {
      const hg = g.createRadialGradient(p[0].x, p[0].y, 0, p[0].x, p[0].y, this.body.headR * 1.3);
      hg.addColorStop(0, `rgba(140,235,190,${0.4 * glow})`); hg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(p[0].x, p[0].y, this.body.headR * 1.3, 0, TAU); g.fill();
      g.strokeStyle = `rgba(224,255,240,${0.9 * glow})`; g.lineWidth = 5;
      g.beginPath(); g.arc(p[0].x, p[0].y, this.body.headR, 0, TAU); g.stroke();
    }
    // joint sparks (hands / elbows / shoulders)
    g.fillStyle = `rgba(255,255,255,${0.9 * glow})`;
    for (const i of [11, 12, 13, 14, 15, 16]) {
      if (p[i]) { g.beginPath(); g.arc(p[i].x, p[i].y, i >= 15 ? 8 : 5, 0, TAU); g.fill(); }
    }
  }

  _drawNet(g, t, glow) {
    if (glow < 0.02) return;
    const n = this.net; if (!n.on) return;
    const ng = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 1.4);
    ng.addColorStop(0, `rgba(109,229,185,${0.32 * glow})`); ng.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = ng; g.beginPath(); g.arc(n.x, n.y, n.r * 1.4, 0, TAU); g.fill();
    g.strokeStyle = `rgba(224,255,240,${0.9 * glow})`; g.lineWidth = 5;
    g.beginPath(); g.arc(n.x, n.y, n.r, 0, TAU); g.stroke();
    // little net weave
    g.strokeStyle = `rgba(224,255,240,${0.35 * glow})`; g.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(n.x + i * n.r * 0.5, n.y - n.r * 0.86); g.lineTo(n.x + i * n.r * 0.5, n.y + n.r * 0.86); g.stroke();
      g.beginPath(); g.moveTo(n.x - n.r * 0.86, n.y + i * n.r * 0.5); g.lineTo(n.x + n.r * 0.86, n.y + i * n.r * 0.5); g.stroke();
    }
  }

  controls(host) {
    host.appendChild(slider("BALLS", 1, 6, this.ballTarget, 1, (v) => (this.ballTarget = v), (v) => `${v | 0}`));
  }
}
