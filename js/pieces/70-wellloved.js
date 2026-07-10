// ============================================================================
//  70 · Well-Loved (닳도록 꺼내 본 기억) — time wing [Canvas2D]
//  철학: 자주 꺼내 볼수록 기억은 닳는다 — 가장 사랑한 기억이, 가장 많이 변해 있다.
//  기억을 떠올린다는 건 다시 읽는 게 아니라 다시 쓰는 일이다(재응고). 신비가
//  아니라 뇌가 하는 일이라 곧장 납득되고, 그래서 더 아프다.
//
//  · 칠흑 속 따뜻한 먼지 알갱이(앰버·상아색) 수천 개가 빛으로 뭉쳐 세 개의
//    '기억'을 이룬다 — 창가의 사람, 어떤 오후, 맞댄 두 사람. 코드로 그린
//    오프스크린 실루엣을 getImageData로 샘플한 점구름이다.
//  · 살짝 초점이 나간 채 숨 쉬듯 흔들린다(가산혼합·미세 브레딩).
//  · 손끝으로 짚어 떠올리면 그 기억은 선명해지고 되살아난다(보상). 그러나
//    매번 알갱이의 '안식 위치'가 미세한 무작위 걸음만큼 영구히 어긋나고
//    색조가 물든다 — 다운샘플 오프셋 격자에 누적. 자주 만진 기억일수록
//    눈부시게 밝지만, 형태는 옮겨 앉아 아름다운 낯선 것이 되어 간다.
//    손 안 댄 기억은 흐려지되 형태는 정확히 남는다.
//  · 왜곡을 localStorage로 관람객 간 누적("gh70-") — 첫 방문자도 이미 남들이
//    닳게 해 뭉개진 '가장 밝은 기억'을 처음부터 목격한다. 세션 내 왜곡 속도를
//    올려, 한 번 보는 사람도 제 손으로 부패를 확인한다.
//
//  인터랙션: 버튼은 없다. 행위는 오직 자꾸 들여다보는 것 — 커서(손끝)로 기억을
//  짚으면 짚는 동안 밝아지고, 놓아도 어긋난 자리는 돌아오지 않는다. 되돌리는
//  스위치는 일부러 두지 않았다.
// ============================================================================

import { Piece, clamp, lerp, TAU } from "../engine.js";

const KEY = "gh70-v1";
const G = 14;                 // 오프셋 격자 해상도(다운샘플 저장 단위)
const SESSION = 1.7;          // 세션 내 왜곡 가속(한 번 보는 사람도 부패 체감)
const BW = 180, BH = 224;     // 실루엣 샘플 해상도

export default class WellLoved extends Piece {
  setup() {
    this._buildMemories();
    this._layout();
    if (!this._load()) this._seed();     // 저장이 없으면: 남들이 이미 닳게 해 둔 상태
    this._motes = [];
    for (let i = 0; i < 54; i++) this._motes.push({
      x: Math.random() * this.w, y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 6,
      a: 0.04 + Math.random() * 0.10, s: 0.8 + Math.random() * 1.4,
    });
    this._saveT = 0; this._dirty = false;
  }

  onResize() { this._layout(); }
  teardown() { this._save(); }

  // ---- 기억 = 실루엣 점구름 ---------------------------------------------------
  _buildMemories() {
    const mk = (paint, n, stainDir) => {
      const p = this._sample(paint, n);
      return {
        lx: p.lx, ly: p.ly, ba: p.ba, n: p.n,
        hx: new Float32Array(p.n), hy: new Float32Array(p.n),
        grid: new Float32Array(G * G * 2),   // 안식 위치 오프셋(정규화)
        love: 0.10, wear: 0, glow: 0.12, stain: 0, stainDir,
        cx: 0, cy: 0, bw: 0, bh: 0,
      };
    };
    this.mem = [
      mk(paintWindow, 1500, -1),    // 창가의 사람
      mk(paintAfternoon, 2000, 1),  // 어떤 오후 (가운데 · 가장 사랑받는 기억)
      mk(paintTwo, 1500, -1),       // 맞댄 두 사람
    ];
  }

  _sample(paint, target) {
    const c = document.createElement("canvas");
    c.width = BW; c.height = BH;
    const g = c.getContext("2d");
    g.clearRect(0, 0, BW, BH);
    paint(g, BW, BH);
    const data = g.getImageData(0, 0, BW, BH).data;
    // 불투명 픽셀을 모아 섞어 고르게 target 개 추출
    const idx = [];
    for (let y = 0; y < BH; y += 2) for (let x = 0; x < BW; x += 2) {
      const a = data[(y * BW + x) * 4 + 3];
      if (a > 24) idx.push(x, y, a);
    }
    const m = idx.length / 3;
    const order = new Uint32Array(m);
    for (let i = 0; i < m; i++) order[i] = i;
    let s = 0x9e3779b9;
    for (let i = m - 1; i > 0; i--) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const j = (s >>> 0) % (i + 1);
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const n = Math.min(target, m);
    const lx = new Float32Array(n), ly = new Float32Array(n), ba = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const o = order[k] * 3;
      lx[k] = idx[o] / BW; ly[k] = idx[o + 1] / BH; ba[k] = idx[o + 2] / 255;
    }
    return { lx, ly, ba, n };
  }

  _layout() {
    const W = this.w, H = this.h, S = Math.min(W, H);
    const spec = [
      [0.24, 0.42, S * 0.30],
      [0.50, 0.50, S * 0.42],   // 가운데 · 가장 큼
      [0.77, 0.43, S * 0.30],
    ];
    for (let i = 0; i < 3; i++) {
      const m = this.mem[i], [fx, fy, bw] = spec[i];
      m.cx = W * fx; m.cy = H * fy; m.bw = bw; m.bh = bw * (BH / BW);
      for (let k = 0; k < m.n; k++) {
        m.hx[k] = m.cx + (m.lx[k] - 0.5) * m.bw;
        m.hy[k] = m.cy + (m.ly[k] - 0.5) * m.bh;
      }
    }
  }

  // ---- 남들이 이미 닳게 해 둔 초기 상태(저장 없을 때) --------------------------
  _seed() {
    const m = this.mem[1];               // 가운데 = 가장 사랑받아 온 기억
    m.love = 0.82; m.wear = 0.62;
    let s = 20260710 >>> 0;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
    for (let i = 0; i < m.grid.length; i++) m.grid[i] = rnd() * 0.075;  // 이미 뭉개져 있음
    this.mem[0].wear = 0.14; this.mem[2].wear = 0.10;
  }

  // ---- 격자 오프셋(정규화) 이중선형 샘플 -------------------------------------
  _gx(m, u, v) {
    const fx = u * (G - 1), fy = v * (G - 1);
    let ix = fx | 0, iy = fy | 0; const tx = fx - ix, ty = fy - iy;
    if (ix > G - 2) ix = G - 2; if (iy > G - 2) iy = G - 2;
    const a = m.grid[(iy * G + ix) * 2], b = m.grid[(iy * G + ix + 1) * 2];
    const c = m.grid[((iy + 1) * G + ix) * 2], d = m.grid[((iy + 1) * G + ix + 1) * 2];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
  _gy(m, u, v) {
    const fx = u * (G - 1), fy = v * (G - 1);
    let ix = fx | 0, iy = fy | 0; const tx = fx - ix, ty = fy - iy;
    if (ix > G - 2) ix = G - 2; if (iy > G - 2) iy = G - 2;
    const a = m.grid[(iy * G + ix) * 2 + 1], b = m.grid[(iy * G + ix + 1) * 2 + 1];
    const c = m.grid[((iy + 1) * G + ix) * 2 + 1], d = m.grid[((iy + 1) * G + ix + 1) * 2 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  // 떠올림 = 안식 위치를 무작위 걸음만큼 영구히 어긋냄(격자에 누적)
  _distort(m, u, v, amt) {
    const gu = u * (G - 1), gv = v * (G - 1);
    const r = 2.4;
    const x0 = Math.max(0, (gu - r) | 0), x1 = Math.min(G - 1, (gu + r + 1) | 0);
    const y0 = Math.max(0, (gv - r) | 0), y1 = Math.min(G - 1, (gv + r + 1) | 0);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const dx = gx - gu, dy = gy - gv, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const w = (1 - d2 / (r * r)) * amt;
      const idx = (gy * G + gx) * 2;
      m.grid[idx] += (Math.random() * 2 - 1) * w;
      m.grid[idx + 1] += (Math.random() * 2 - 1) * w;
    }
  }

  frame(dt, t) {
    const g = this.ctx2d();
    const W = this.w, H = this.h;
    const ptr = this.pointer;

    // ---- 어느 기억을 짚고 있나 -------------------------------------------------
    let touch = -1, best = 0.36;
    if (ptr.active) {
      for (let i = 0; i < 3; i++) {
        const m = this.mem[i];
        const dx = (ptr.x - m.cx) / m.bw, dy = (ptr.y - m.cy) / m.bh;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; touch = i; }
      }
    }

    // ---- 기억 상태 갱신 --------------------------------------------------------
    for (let i = 0; i < 3; i++) {
      const m = this.mem[i];
      const on = i === touch;
      const target = on ? 1 : 0.08 + m.love * 0.42;
      m.glow += (target - m.glow) * Math.min(1, dt * (on ? 6 : 2.2));
      if (on) {
        m.love = Math.min(1, m.love + dt * 0.28);
        m.wear += dt * 0.12 * SESSION;
        const u = clamp((ptr.x - m.cx) / m.bw + 0.5, 0, 1);
        const v = clamp((ptr.y - m.cy) / m.bh + 0.5, 0, 1);
        this._distort(m, u, v, 0.010 * SESSION * clamp(dt * 60, 0.5, 2));
        this._dirty = true;
      }
      m.stain = clamp(m.wear, 0, 1.3);
    }

    // ---- 저장(간헐) -----------------------------------------------------------
    this._saveT += dt;
    if (this._dirty && this._saveT > 2.5) { this._save(); this._saveT = 0; this._dirty = false; }

    // =========================== R E N D E R ================================
    g.fillStyle = "#0b0a0d"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.7);
    bg.addColorStop(0, "rgba(40,32,24,0.30)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // 떠도는 먼지
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(230,196,150,1)";
    for (const p of this._motes) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
      g.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 0.7 + p.x));
      g.fillRect(p.x, p.y, p.s, p.s);
    }

    // 기억 헤일로(소프트 글로우)
    for (let i = 0; i < 3; i++) {
      const m = this.mem[i];
      const rad = g.createRadialGradient(m.cx, m.cy, 0, m.cx, m.cy, m.bw * 0.72);
      const hue = 40 + m.stainDir * m.stain * 24;
      rad.addColorStop(0, `hsla(${hue | 0},70%,60%,${(0.03 + m.glow * 0.14).toFixed(3)})`);
      rad.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 1; g.fillStyle = rad;
      g.fillRect(m.cx - m.bw * 0.72, m.cy - m.bw * 0.72, m.bw * 1.44, m.bw * 1.44);
    }

    // 점구름
    for (let i = 0; i < 3; i++) {
      const m = this.mem[i];
      const hue = (40 + m.stainDir * m.stain * 26) | 0;
      const sat = (52 + m.stain * 24) | 0;
      const lgt = (60 + m.glow * 12) | 0;
      g.fillStyle = `hsl(${hue},${sat}%,${lgt}%)`;
      const bw = m.bw, bh = m.bh;
      const sz = clamp(bw * 0.011, 1.2, 2.3);
      const amp = bw * 0.006 * (0.5 + m.glow);
      const gl = m.glow;
      for (let k = 0; k < m.n; k++) {
        const u = m.lx[k], v = m.ly[k];
        const ox = this._gx(m, u, v) * bw, oy = this._gy(m, u, v) * bh;
        const bx = Math.sin(t * 0.55 + k * 0.7) * amp;
        const by = Math.cos(t * 0.50 + k * 0.9) * amp;
        g.globalAlpha = m.ba[k] * (0.14 + gl * 0.86);
        g.fillRect(m.hx[k] + ox + bx, m.hy[k] + oy + by, sz, sz);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    // 캡션
    const fs = Math.max(12, H * 0.018);
    g.textAlign = "center";
    g.font = `500 ${fs}px ui-monospace, Menlo, monospace`;
    g.fillStyle = "rgba(226,206,176,0.62)";
    g.textBaseline = "bottom";
    g.fillText("가장 오래 바라본 기억이, 가장 많이 변해 있다", W / 2, H - fs * 2.0);
    g.font = `400 ${fs * 0.82}px ui-monospace, Menlo, monospace`;
    g.fillStyle = "rgba(200,182,160,0.34)";
    g.fillText("손끝으로 짚어 떠올리면 선명해지지만 · 안식하던 자리가 영영 어긋난다", W / 2, H - fs * 0.7);

    // 비네트
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.40, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.62)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---- 집단 누적 저장/복원 ---------------------------------------------------
  _save() {
    try {
      const mems = this.mem.map((m) => ({
        love: +m.love.toFixed(3), wear: +m.wear.toFixed(3),
        grid: Array.from(m.grid, (x) => +x.toFixed(4)),
      }));
      localStorage.setItem(KEY, JSON.stringify({ v: 1, mems }));
    } catch (e) { /* 저장 실패는 무해 */ }
  }
  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || !o.mems || o.mems.length !== 3) return false;
      for (let i = 0; i < 3; i++) {
        const s = o.mems[i], m = this.mem[i];
        if (!s) continue;
        m.love = clamp(+s.love || 0, 0, 1);
        m.wear = Math.max(0, +s.wear || 0);
        if (Array.isArray(s.grid) && s.grid.length === m.grid.length)
          for (let k = 0; k < m.grid.length; k++) m.grid[k] = s.grid[k] || 0;
      }
      return true;
    } catch (e) { return false; }
  }
}

// ---- 실루엣 페인터(오프스크린, 흰색 채움 → 알파 샘플) ------------------------
function ellipse(g, x, y, rx, ry, a = 1) {
  g.globalAlpha = a; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
}

// 창가의 사람 — 밝은 창(낮은 알파) + 그 앞의 사람(높은 알파)
function paintWindow(g, W, H) {
  g.fillStyle = "#fff";
  ellipse(g, W * 0.50, H * 0.40, W * 0.30, H * 0.30, 0.5);      // 창의 빛
  // 창살(빛을 가르는 틈)
  g.globalAlpha = 1; g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  g.fillRect(W * 0.485, H * 0.10, W * 0.03, H * 0.60);
  g.fillRect(W * 0.20, H * 0.385, W * 0.60, H * 0.03);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#fff";
  ellipse(g, W * 0.46, H * 0.34, W * 0.055, W * 0.055, 1);      // 머리
  ellipse(g, W * 0.46, H * 0.60, W * 0.12, H * 0.20, 1);        // 몸
}

// 어떤 오후 — 오후의 빛무리 + 앉은 두 사람의 한때
function paintAfternoon(g, W, H) {
  g.fillStyle = "#fff";
  ellipse(g, W * 0.52, H * 0.34, W * 0.26, H * 0.20, 0.34);     // 오후의 빛
  ellipse(g, W * 0.38, H * 0.44, W * 0.06, W * 0.06, 1);        // 머리 A
  ellipse(g, W * 0.38, H * 0.66, W * 0.11, H * 0.17, 1);        // 몸 A
  ellipse(g, W * 0.62, H * 0.47, W * 0.055, W * 0.055, 0.95);   // 머리 B
  ellipse(g, W * 0.62, H * 0.68, W * 0.10, H * 0.15, 0.95);     // 몸 B
  g.globalAlpha = 0.7;                                          // 맞잡은 손 언저리
  ellipse(g, W * 0.50, H * 0.62, W * 0.05, H * 0.05, 0.7);
}

// 맞댄 두 사람 — 가까이 기운 두 실루엣
function paintTwo(g, W, H) {
  g.fillStyle = "#fff";
  ellipse(g, W * 0.42, H * 0.32, W * 0.075, W * 0.075, 1);      // 머리 1
  ellipse(g, W * 0.40, H * 0.62, W * 0.14, H * 0.24, 1);        // 몸 1
  ellipse(g, W * 0.60, H * 0.34, W * 0.070, W * 0.070, 0.92);   // 머리 2
  ellipse(g, W * 0.62, H * 0.63, W * 0.13, H * 0.23, 0.92);     // 몸 2
}
