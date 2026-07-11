// ============================================================================
//  86 · 호작도 (Tiger & Magpie — 민화 까치호랑이) · 해학(諧謔)
//  원작: assets/art/hojakdo.jpg (838×1009, 조선 민화). 무서우라고 그린 호랑이가
//  실은 어수룩하고 귀엽다 — 이 관(館)의 정신은 '무서운 것의 우스꽝화'다.
//
//  원작을 훼손하지 않고(원본 스캔을 그대로 화면에 앉히고) 그 위에 '살아있는' 층을
//  얹어 그림의 해학을 체험시킨다:
//   · 눈: 호랑이 두 눈 자리(EYE_L / EYE_R)에 흰자+큰 검은 동공의 '데굴데굴 눈알'을
//     오버레이. 커서를 따라 동공이 굴러다닌다(민화풍 과장 — 동공이 크다).
//   · 으르렁: 커서가 몸(BODY)에 가까워지면 몸통이 국소적으로 부풀고(흐름장 워프),
//     눈이 커지며 콧구멍(NOSE)에서 콧김 입자 두 줄이 뿜어진다.
//   · 까치: 소나무 위 까치(MAGPIE)를 클릭하면 포르르 들썩이며(국소 흔들림) 짹짹
//     음표·깃털이 흩날리고 → 호랑이가 화들짝 펄쩍(전체 점프 워프 + 눈 땡그랗게).
//   · 하품: 30초 방치하면 호랑이가 스르르 눈을 감고(눈꺼풀) 입 부근이 늘어난다.
//
//  워프는 39(절규)의 국소 흐름장 기법을 차용 — 원본을 세로 슬라이스로 다시 그리되
//  변위장(_disp)이 활성 효과 근처에서만 0이 아니고 가장자리에서 매끄럽게 0으로
//  수렴하므로, 주변 원본과 이음매 없이 자연스럽게 부풀거나 늘어난다.
//  한지·먹·단청 색감. 파티클은 고정 풀(핫루프 무할당). 하단 한국어 캡션 한 줄.
// ============================================================================

import { Piece, TAU, clamp, lerp } from "../engine.js";
import { slider } from "./01-currents.js";

const IMG_W = 838, IMG_H = 1009;         // 원본 픽셀 크기

// ---- 이미지 좌표 의존 상수 (0..1 이미지 기준, 중앙에서 시각 캘리브레이션 예정) ----
const EYE_L = [0.245, 0.330];              // 좌안(화면상 왼쪽) 중심
const EYE_R = [0.330, 0.308];              // 우안 중심
const EYE_R_FRAC = 0.038;                // 눈/동공 반경 (이미지폭 대비)
const NOSE = [0.51, 0.44];               // 콧구멍 기준(콧김 발원)
const NOSE_SPREAD = 0.035;               // 두 콧구멍 좌우 간격
const MOUTH = [0.51, 0.50];              // 입 영역 중심(하품 워프)
const MOUTH_R_FRAC = 0.16;               // 입 워프 반경
const BODY = [0.50, 0.60];               // 몸통 중심(으르렁 근접 판정)
const BODY_R_FRAC = 0.42;                // 몸통 근접 반경(이미지폭 대비)
const MAGPIE = [0.59, 0.29];             // 소나무 위 까치 위치
const MAGPIE_R_FRAC = 0.11;              // 까치 클릭/들썩 반경

const YAWN_IDLE = 30;                    // 방치 하품까지(초)
const IMG_SRC = "assets/art/hojakdo.jpg";

// 한지·먹·단청 팔레트
const PAPER_TOP = "#efe4c7";
const PAPER_BOT = "#dcc9a0";
const INK       = "#2a2016";
const DANCHEONG = ["#c8442f", "#2f6f4f", "#2b5b8c", "#e0b13a", "#8a3b6b"];

const N_PARTS = 150;
const smooth = (w) => { w = clamp(w, 0, 1); return w * w * (3 - 2 * w); };

export default class Hojakdo extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // 슬라이더 상태
    this.exag = 1.0;          // 익살(과장) — 눈·워프·동공 크기
    this.growlR = 1.0;        // 으르렁 반경 배율

    // 감정 엔벨로프
    this.growl = 0;           // 몸 근접 → 으르렁 (0..1)
    this.yawn = 0;            // 방치 → 하품 (0..1)
    this.startle = 0;         // 까치에 놀람 → 펄쩍 (0..1)
    this.flutter = 0;         // 까치 들썩임 (0..1)
    this._flutPh = 0;
    this.idleT = 0;
    this._lx = -1e4; this._ly = -1e4;
    this._breath = 0;
    this._puffAcc = 0;
    this._nostrilTog = 0;
    this._out = { dx: 0, dy: 0 };

    // 파티클 고정 풀 (kind 0=콧김, 1=깃털, 2=음표)
    this.parts = new Array(N_PARTS);
    for (let i = 0; i < N_PARTS; i++) {
      this.parts[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, kind: 0, size: 1, rot: 0, vr: 0, col: "#fff" };
    }
    this._pi = 0;

    // 부드러운 콧김 스프라이트(오프스크린) — 핫루프에서 그라디언트 재생성 방지
    this._puff = this._makePuff();

    // 원작 이미지 로드
    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  _makePuff() {
    const s = 64, cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,252,244,0.9)");
    gr.addColorStop(0.5, "rgba(250,244,230,0.35)");
    gr.addColorStop(1, "rgba(250,244,230,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return cv;
  }

  // 원작을 한지 여백(mount) 안쪽에 contain 배치
  _layout() {
    const W = this.w, H = this.h;
    const pad = Math.min(W, H) * 0.055;
    const aw = W - pad * 2, ah = H - pad * 2;
    const ar = IMG_W / IMG_H;
    let dw = aw, dh = aw / ar;
    if (dh > ah) { dh = ah; dw = ah * ar; }
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    return { dx, dy, dw, dh };
  }

  _px(p, r) { return { x: r.dx + p[0] * r.dw, y: r.dy + p[1] * r.dh }; }

  onPointerDown() {
    this.idleT = 0;
    if (!this.ready) return;
    const r = this._layout();
    const m = this._px(MAGPIE, r);
    const gR = MAGPIE_R_FRAC * r.dw * 1.4;
    const d = Math.hypot(this.pointer.x - m.x, this.pointer.y - m.y);
    if (d < gR) {
      // 까치가 포르르 → 짹짹 음표·깃털 → 호랑이 화들짝
      this.flutter = 1;
      this.startle = 1;
      for (let i = 0; i < 9; i++) this._spawn(1, m.x, m.y);   // 깃털
      for (let i = 0; i < 4; i++) this._spawn(2, m.x, m.y);   // 음표
    }
  }

  _spawn(kind, x, y) {
    // 죽은 입자 하나 찾기(회전 커서)
    let p = null;
    for (let n = 0; n < N_PARTS; n++) {
      const q = this.parts[(this._pi + n) % N_PARTS];
      if (q.life <= 0) { p = q; this._pi = (this._pi + n + 1) % N_PARTS; break; }
    }
    if (!p) return;
    p.kind = kind; p.x = x; p.y = y;
    if (kind === 0) {                    // 콧김
      p.vx = (Math.random() - 0.5) * 34;
      p.vy = 34 + Math.random() * 46;
      p.max = 0.7 + Math.random() * 0.5; p.life = p.max;
      p.size = 6 + Math.random() * 6;
      p.col = "#fff";
    } else if (kind === 1) {             // 깃털
      p.vx = (Math.random() - 0.5) * 190;
      p.vy = -60 - Math.random() * 120;
      p.max = 1.3 + Math.random() * 0.8; p.life = p.max;
      p.size = 5 + Math.random() * 4;
      p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 8;
      p.col = DANCHEONG[(Math.random() * DANCHEONG.length) | 0];
    } else {                             // 음표
      p.vx = (Math.random() - 0.5) * 40;
      p.vy = -52 - Math.random() * 46;
      p.max = 1.1 + Math.random() * 0.6; p.life = p.max;
      p.size = 8 + Math.random() * 4;
      p.rot = 0; p.vr = 0;
      p.col = INK;
    }
  }

  // ---- 국소 흐름장(변위장) — 화면 px 소스 오프셋 (39 기법) --------------------
  // 활성 효과 근처에서만 0이 아니며 가장자리에서 매끄럽게 0으로 수렴 →
  // 주변 원본과 이음매 없이 부풀거나 늘어난다.
  _disp(x, y, out) {
    let ox = 0, oy = 0;
    const ex = this.exag;
    // 미세 호흡
    oy += Math.sin(this.t * 0.9 + x * 0.012) * this._breath;
    ox += Math.sin(this.t * 0.7 + y * 0.010) * this._breath * 0.6;
    // 으르렁: 몸통 부풀림(중심으로 소스 당김 = 확대)
    if (this.growl > 0.01) {
      const dx = x - this._bcx, dy = y - this._bcy;
      const ww = smooth(1 - Math.hypot(dx, dy) / this._bR);
      const mag = this.growl * 0.16 * ex;
      ox -= dx * mag * ww; oy -= dy * mag * ww;
    }
    // 하품: 입 부근 세로 늘림(입 벌어짐)
    if (this.yawn > 0.01) {
      const dx = x - this._mcx, dy = y - this._mcy;
      const ww = smooth(1 - Math.hypot(dx * 0.8, dy) / this._mR);
      oy -= dy * this.yawn * 0.30 * ex * ww;
    }
    // 까치 들썩임: 국소 흔들림
    if (this.flutter > 0.01) {
      const dx = x - this._gcx, dy = y - this._gcy;
      const ww = smooth(1 - Math.hypot(dx, dy) / this._gR);
      oy += Math.sin(this._flutPh) * 6 * this.flutter * ww;
      ox += Math.sin(this._flutPh * 1.3) * 3 * this.flutter * ww;
    }
    out.dx = ox; out.dy = oy;
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    this._drawPaper(g, W, H);

    if (!this.ready) {
      g.fillStyle = "rgba(42,32,22,0.85)";
      g.font = `600 ${Math.max(14, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(this.failed ? "그림을 불러올 수 없습니다" : "호랑이를 부르는 중…", W / 2, H / 2);
      g.textAlign = "start"; g.textBaseline = "alphabetic";
      return;
    }

    const r = this._layout();
    // 이미지 좌표 앵커(리사이즈 안전 — 매 프레임 갱신)
    const b = this._px(BODY, r); this._bcx = b.x; this._bcy = b.y; this._bR = BODY_R_FRAC * r.dw * this.growlR;
    const mo = this._px(MOUTH, r); this._mcx = mo.x; this._mcy = mo.y; this._mR = MOUTH_R_FRAC * r.dw;
    const ma = this._px(MAGPIE, r); this._gcx = ma.x; this._gcy = ma.y; this._gR = MAGPIE_R_FRAC * r.dw;

    // ---- 상호작용/타이머 갱신 ----
    if (this.pointer.active && (Math.abs(this.pointer.x - this._lx) + Math.abs(this.pointer.y - this._ly) > 0.7)) this.idleT = 0;
    this._lx = this.pointer.x; this._ly = this.pointer.y;
    this.idleT += dt;

    // 으르렁: 몸 근접
    let gt = 0;
    if (this.pointer.active) gt = smooth(1 - Math.hypot(this.pointer.x - this._bcx, this.pointer.y - this._bcy) / this._bR);
    this.growl = lerp(this.growl, gt, clamp(dt * 4, 0, 1));
    // 하품: 방치
    this.yawn = lerp(this.yawn, this.idleT > YAWN_IDLE ? 1 : 0, clamp(dt * 1.6, 0, 1));
    // 놀람/들썩 감쇠
    this.startle = Math.max(0, this.startle - dt * 3.2);
    this.flutter = Math.max(0, this.flutter - dt * 2.4);
    if (this.flutter > 0.01) this._flutPh += dt * 26;
    this._breath = (0.8 + this.growl * 2.2) * this.exag;

    // 콧김 방출(으르렁 중, 두 콧구멍 번갈아)
    if (this.growl > 0.35) {
      this._puffAcc += dt * this.growl * 26;
      while (this._puffAcc >= 1) {
        this._puffAcc -= 1;
        const side = (this._nostrilTog ^= 1) ? 1 : -1;
        const nx = r.dx + (NOSE[0] + side * NOSE_SPREAD) * r.dw;
        const ny = r.dy + NOSE[1] * r.dh;
        this._spawn(0, nx, ny);
      }
    }

    // 펄쩍 점프 오프셋
    const jumpY = -this.startle * Math.min(W, H) * 0.05 * (0.82 + 0.18 * Math.sin(t * 22));

    // ---- 원작 워프 + 눈 (점프에 함께 들썩) ----
    g.save();
    g.translate(0, jumpY);
    this._drawWarped(g, r);
    this._drawEyes(g, r, jumpY);
    g.restore();

    // ---- 파티클(공중 절대좌표) + 캡션 ----
    this._updateParts(dt);
    this._drawParts(g);
    this._drawCaption(g, W, H);
  }

  // ---- 한지 배경 + 표구 여백 -----------------------------------------------
  _drawPaper(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, PAPER_TOP); bg.addColorStop(1, PAPER_BOT);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 은은한 비네팅
    const vg = g.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(60,44,20,0.20)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---- 원작을 세로 슬라이스로 다시 그리며 국소 워프 --------------------------
  _drawWarped(g, r) {
    const N = clamp((r.dw / 10) | 0, 40, 100);
    const colW = r.dw / N;
    const sxScale = IMG_W / r.dw, syScale = IMG_H / r.dh;
    const out = this._out;
    // 표구 틀(원작 둘레 얇은 먹 테)
    g.save();
    g.strokeStyle = "rgba(40,30,18,0.35)"; g.lineWidth = 2;
    g.strokeRect(r.dx - 3, r.dy - 3, r.dw + 6, r.dh + 6);
    g.restore();
    g.imageSmoothingEnabled = true;
    for (let i = 0; i < N; i++) {
      const dX = r.dx + i * colW;
      const cx = dX + colW * 0.5;
      const yT = r.dy + r.dh * 0.22, yM = r.dy + r.dh * 0.55, yL = r.dy + r.dh * 0.85;
      this._disp(cx, yT, out); const oxT = out.dx, oyT = out.dy;
      this._disp(cx, yM, out); const oxM = out.dx, oyM = out.dy;
      this._disp(cx, yL, out); const oxB = out.dx, oyB = out.dy;
      const oxTop = (oxT + oxM) * 0.5, oyTop = (oyT + oyM) * 0.5;
      const oxBot = (oxM + oxB) * 0.5, oyBot = (oyM + oyB) * 0.5;
      const seam = Math.abs(oyTop - oyBot) + 3;
      this._slice(g, r, dX, colW, r.dy + r.dh * 0.5 - seam, r.dh * 0.5 + seam, oxBot, oyBot, sxScale, syScale);
      this._slice(g, r, dX, colW, r.dy, r.dh * 0.5 + seam, oxTop, oyTop, sxScale, syScale);
    }
  }

  _slice(g, r, dX, colW, dyS, dhS, ox, oy, sxScale, syScale) {
    let sx = (dX - r.dx) * sxScale + ox * sxScale;
    let sy = (dyS - r.dy) * syScale + oy * syScale;
    const sw = colW * sxScale, sh = dhS * syScale;
    if (sx < 0) sx = 0; if (sy < 0) sy = 0;
    if (sx + sw > IMG_W) sx = IMG_W - sw;
    if (sy + sh > IMG_H) sy = IMG_H - sh;
    if (sx < 0) sx = 0; if (sy < 0) sy = 0;
    g.drawImage(this.img, sx, sy, sw, sh, dX, dyS + oy, colW, dhS);
  }

  // ---- 살아있는 눈알 오버레이 ------------------------------------------------
  _drawEyes(g, r, jumpY) {
    const base = EYE_R_FRAC * r.dw;
    const R = base * (1 + this.growl * 0.28 + this.startle * 0.55) * (0.8 + this.exag * 0.2);
    const open = Math.max(1 - this.yawn * 0.92, this.startle);   // 하품=감김, 놀람=번쩍
    for (const E of [EYE_L, EYE_R]) {
      const c = this._px(E, r);
      this._drawEye(g, c.x, c.y, R, open, jumpY);
    }
  }

  _drawEye(g, cx, cy, R, open, jumpY) {
    g.save();
    // 흰자
    g.beginPath();
    g.ellipse(cx, cy, R, R * Math.max(open, 0.04), 0, 0, TAU);
    if (open > 0.16) {
      g.fillStyle = "#f7f1e2"; g.fill();
      g.clip();   // 동공이 흰자 밖으로 안 나가게
      // 시선 목표(포인터 → 시각 위치 보정, 없으면 슬슬 배회)
      let tx, ty;
      if (this.pointer.active) { tx = this.pointer.x; ty = this.pointer.y - jumpY; }
      else { tx = cx + Math.sin(this.t * 0.6) * R * 2; ty = cy + Math.cos(this.t * 0.47) * R * 1.4; }
      let dx = tx - cx, dy = ty - cy;
      const len = Math.hypot(dx, dy) || 1;
      const pr = R * (0.6 + this.exag * 0.06) * (1 - this.startle * 0.25); // 큰 동공(민화 과장)
      const maxOff = R - pr;
      const wob = Math.sin(this.t * 5 + cx) * R * 0.06;                    // 데굴데굴
      const off = Math.min(len, maxOff) + wob;
      const px = cx + (dx / len) * off;
      const py = cy + (dy / len) * Math.min(off, R * open - pr * 0.6);
      g.fillStyle = INK;
      g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      // 눈동자 하이라이트
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath(); g.arc(px - pr * 0.32, py - pr * 0.34, pr * 0.28, 0, TAU); g.fill();
    } else {
      // 감긴 눈 — 먹선 한 획
      g.strokeStyle = INK; g.lineWidth = Math.max(1.5, R * 0.16); g.lineCap = "round";
      g.beginPath(); g.moveTo(cx - R, cy); g.quadraticCurveTo(cx, cy + R * 0.35, cx + R, cy); g.stroke();
    }
    g.restore();
    // 눈테(먹)
    g.save();
    g.strokeStyle = "rgba(40,30,18,0.55)"; g.lineWidth = Math.max(1, R * 0.09);
    g.beginPath(); g.ellipse(cx, cy, R, R * Math.max(open, 0.04), 0, 0, TAU); g.stroke();
    g.restore();
  }

  // ---- 파티클 ---------------------------------------------------------------
  _updateParts(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.kind === 0) {                 // 콧김: 아래로 퍼지며 커짐
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= (1 - dt * 1.2); p.size += dt * 26;
      } else if (p.kind === 1) {          // 깃털: 팔랑팔랑 낙하
        p.vy += 150 * dt; p.vx *= (1 - dt * 0.8);
        p.x += p.vx * dt + Math.sin((p.max - p.life) * 6 + p.rot) * 22 * dt;
        p.y += p.vy * dt; p.rot += p.vr * dt;
      } else {                            // 음표: 위로 떠오름
        p.vy *= (1 - dt * 0.3); p.y += p.vy * dt;
        p.x += Math.sin((p.max - p.life) * 7 + p.size) * 16 * dt;
      }
    }
  }

  _drawParts(g) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 0) {
        g.globalAlpha = a * 0.55;
        g.drawImage(this._puff, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.kind === 1) {
        g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.col;
        g.beginPath();
        g.moveTo(0, -p.size);
        g.quadraticCurveTo(p.size * 0.7, 0, 0, p.size);
        g.quadraticCurveTo(-p.size * 0.7, 0, 0, -p.size);
        g.fill();
        g.strokeStyle = "rgba(30,22,14,0.4)"; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(0, -p.size); g.lineTo(0, p.size); g.stroke();
        g.restore();
      } else {
        g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.fillStyle = p.col;
        const s = p.size;
        g.beginPath(); g.ellipse(-s * 0.28, s * 0.22, s * 0.34, s * 0.26, -0.4, 0, TAU); g.fill();
        g.strokeStyle = p.col; g.lineWidth = Math.max(1.2, s * 0.14);
        g.beginPath(); g.moveTo(s * 0.02, s * 0.2); g.lineTo(s * 0.02, -s * 0.7); g.stroke();
        g.beginPath(); g.moveTo(s * 0.02, -s * 0.7); g.quadraticCurveTo(s * 0.5, -s * 0.55, s * 0.42, -s * 0.2); g.stroke();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  _drawCaption(g, W, H) {
    g.save();
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.02)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(42,32,22,0.72)";
    g.fillText("무서우라고 그린 호랑이가, 이렇게 귀엽습니다.", W / 2, H - Math.max(16, H * 0.035));
    g.restore();
    g.textAlign = "start";
  }

  controls(host) {
    host.appendChild(slider("익살 (exaggeration)", 0.4, 2.0, this.exag, 0.05, (v) => (this.exag = v)));
    host.appendChild(slider("으르렁 반경 (growl)", 0.5, 1.8, this.growlR, 0.05, (v) => (this.growlR = v)));
  }

  teardown() {
    this.img = null;
    this.parts = null;
    this._puff = null;
  }
}
