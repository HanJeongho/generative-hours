// ============================================================================
//  87 · 겨울 두루마리 (After 김정희 — 歲寒圖 / 세한도, 1844)
//  ── XII 「Ink & Moon — 먹과 달」 (wing: hanguk)
//
//  세한도는 유배지 제주에서 그린 두루마리다. 추운 날 한 채의 집과 늙은
//  소나무·잣나무, 그리고 광대한 여백. 이 작품은 그 두루마리를 두루마리답게
//  체험시킨다 — 화면엔 긴 그림의 한 자락만 세로로 꽉 차게 보이고, 드래그로
//  밀어 감상한다(관성으로 미끄러지고 양끝에서 저항). 은은한 비네트와 한지 결.
//
//  · 그림 위로 마른 눈이 성기게 내린다. 원작의 여백이 곧 겨울 하늘이라 먹빛
//    하늘을 덧칠하지 않는다. 눈은 지붕과 솔가지(대략 v0.45~0.70 밴드)에 아주
//    얇게 쌓였다가 바람에 쓸린다. 쌓임은 그림에 붙어(월드 좌표) 함께 스크롤.
//  · 홀드(가만히 쥐고 있기) = 시간이 저녁으로 기운다. 화면이 청묵빛으로 식고
//    집 창에 아주 작은 등불 하나가 켜진다 — 원작엔 없는 단 하나의 따뜻함,
//    추위 뒤에도 지지 않는 절개의 은유. 손을 놓으면 다시 낮으로 돌아온다.
// ============================================================================

import { Piece, clamp, lerp, makeNoise, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

const IMG_SRC = "assets/art/sehando.jpg";
const IMG_W = 4200, IMG_H = 1124;         // 원본 픽셀 크기 (김정희 1844)

// ── 이미지 좌표 의존 상수 (중앙에서 시각 캘리브레이션 예정 — 대략값) ──────────
const HOUSE_U = 0.415;                     // 집(둥근 창)의 가로 위치 (이미지 u)
const HOUSE_V = 0.520;                     // 창의 세로 위치 (이미지 v) — 등불 자리
const SNOW_V0 = 0.45;                      // 눈이 쌓이는 밴드 시작 (지붕·솔가지)
const SNOW_V1 = 0.70;                      // 밴드 끝

// ── 두루마리 스크롤 ──────────────────────────────────────────────────────────
const FIT_PAD    = 0.90;                   // 세로 맞춤 여백 비율 (1이면 꽉 참)
const FRICTION   = 2.7;                    // 놓은 뒤 관성 감쇠 (지수 1/s)
const EDGE_SPRING = 10;                    // 양끝 넘어갔을 때 되돌리는 스프링
const EDGE_RESIST = 0.42;                  // 경계 밖으로 끄는 드래그 저항
const STILL_V    = 3.2;                    // 이 속도(px/이동) 이하면 '홀드'로 간주

// ── 눈 ──────────────────────────────────────────────────────────────────────
const FLAKE_MAX  = 320;                    // 낙하 플레이크 풀 크기
const NCOL       = 260;                    // 쌓임 컬럼 수 (이미지 가로 분할)
const ACC_GROW   = 0.11;                   // 착지 한 알이 더하는 쌓임
const ACC_MAX    = 1.0;                    // 컬럼 최대 쌓임
const ACC_DECAY  = 0.015;                  // 기본적으로 바람에 서서히 쓸림 (1/s)
const WIND_BASE  = 0.045;                  // 기본 바람(가로 드리프트, 화면폭/s)

// ── 저녁 / 등불 ──────────────────────────────────────────────────────────────
const EVENING_RISE = 0.55;                 // 홀드 시 저녁으로 (1/s)
const EVENING_FALL = 0.85;                 // 놓으면 낮으로 (1/s)
const INK_R = 26, INK_G = 34, INK_B = 54;  // 청묵빛 저녁 색
const LAMP_R = 255, LAMP_G = 208, LAMP_B = 150; // 등불 색

export default class Sehando extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    // 슬라이더 상태
    this.snowAmt = 1.0;      // 눈의 양(생성률 배수)
    this.duskMax = 1.0;      // 저녁 상한(슬라이더) — 홀드 시 도달하는 저녁 진행도

    // 스크롤 물리
    this.scrollX = 0;        // 두루마리 가로 오프셋 (스크린 px)
    this._openOnPainting = true;   // 첫 프레임에 그림(집·소나무) 구간으로 이동
    this.vel = 0;            // 관성 속도 (px/s)
    this.dragging = false;
    this.lastX = 0;
    this.evening = 0;        // 실제 저녁 밝기(이징된 값)
    this.stillT = 0;         // 가만히 쥐고 있은 시간

    // 눈 쌓임(이미지 가로 컬럼) + 정적 표면 마스크/높이 (한 번 계산)
    this.acc = new Float32Array(NCOL);
    this.surf = new Float32Array(NCOL);    // 이 컬럼에 눈이 앉을 표면 확률(솔가지·지붕)
    this.capV = new Float32Array(NCOL);    // 이 컬럼 눈의 밴드 내 세로 위치(이미지 v)
    for (let c = 0; c < NCOL; c++) {
      const n = this.noise(c * 0.11, 3.7);          // 뭉친 가지 느낌
      const n2 = this.noise(c * 0.037, 11.3);
      this.surf[c] = clamp((n * 0.5 + 0.5) * 0.7 + (n2 * 0.5 + 0.5) * 0.5 - 0.32, 0, 1);
      this.capV[c] = SNOW_V0 + (this.noise(c * 0.19, 20.5) * 0.5 + 0.5) * (SNOW_V1 - SNOW_V0);
    }

    // 낙하 플레이크 풀 (고정 크기, 무할당 재사용)
    this.flakes = new Array(FLAKE_MAX);
    for (let i = 0; i < FLAKE_MAX; i++)
      this.flakes[i] = { x: 0, y: 0, vy: 0, ph: 0, r: 1, a: 0, on: false, passed: false };
    this._spawnAcc = 0;      // 생성 누적 카운터

    // 바람
    this.wind = WIND_BASE;
    this.gust = 0;
    this.gustT = 2 + Math.random() * 4;

    // 한지 결(작은 오프스크린, 곱하기 합성)
    this._grain = this._makeGrain();

    // 이미지 비동기 로드
    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  // 세로 맞춤(contain by height) 두루마리 레이아웃
  _layout() {
    const scale = (this.h * FIT_PAD) / IMG_H;
    const sw = IMG_W * scale, sh = IMG_H * scale;
    const dyTop = (this.h - sh) * 0.5;
    const maxScroll = Math.max(0, sw - this.w);
    return { scale, sw, sh, dyTop, maxScroll };
  }

  onResize() { /* 레이아웃은 매 프레임 계산 */ }

  onPointerDown() {
    this.dragging = true;
    this.lastX = this.pointer.x;
    this.vel = 0;
    this.stillT = 0;
  }
  onPointerUp() { this.dragging = false; }

  // 약한 한지 결 텍스처
  _makeGrain() {
    const s = 150;
    const cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    const g = cv.getContext("2d");
    const img = g.createImageData(s, s);
    const d = img.data;
    for (let i = 0; i < s * s; i++) {
      const n = 236 + ((Math.random() * 18) | 0);
      d[i * 4] = n; d[i * 4 + 1] = n - 3; d[i * 4 + 2] = n - 10; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const dts = clamp(dt, 0, 0.05);
    const L = this._layout();

    // 1) 스크롤 물리 + 저녁 진행 -------------------------------------------------
    this._updateScroll(dts, L);
    this._updateEvening(dts);

    // 2) 한지 바탕 + 두루마리(원작 또는 폴백) -----------------------------------
    g.fillStyle = "#efe7d4";                 // 한지빛 매트
    g.fillRect(0, 0, W, H);
    const x0 = -this.scrollX;
    if (this.ready) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.img, 0, 0, IMG_W, IMG_H, x0, L.dyTop, L.sw, L.sh);
    } else {
      this._drawFallback(g, L, x0);
    }

    // 3) 한지 결(그림 위 아주 약하게 곱하기) ------------------------------------
    g.save();
    g.globalAlpha = 0.08;
    g.globalCompositeOperation = "multiply";
    const gp = g.createPattern(this._grain, "repeat");
    g.fillStyle = gp;
    g.fillRect(0, L.dyTop, W, L.sh);
    g.restore();

    // 4) 쌓인 눈(월드 좌표 — 그림에 붙어 스크롤) + 바람 --------------------------
    this._updateWind(dts);
    this._drawAccum(g, L, x0);

    // 5) 내리는 눈(스크린 좌표 — 유리 앞) ---------------------------------------
    this._updateFlakes(g, dts, L, x0);

    // 6) 저녁으로 식음 + 집 창의 등불 -------------------------------------------
    if (this.evening > 0.002) this._drawEvening(g, L, x0);

    // 7) 비네트 + 하단 캡션 -----------------------------------------------------
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.32,
      W * 0.5, H * 0.55, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(16,14,10,${0.30 + this.evening * 0.14})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    g.fillStyle = `rgba(${30 + this.evening * 120},${26 + this.evening * 120},${20 + this.evening * 130},0.82)`;
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.019)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText("날이 차가워진 뒤에야, 소나무가 늦게 시듦을 안다 — 歲寒然後知松柏.",
      W * 0.5, H - Math.max(16, H * 0.035));
    g.textAlign = "start";

    if (!this.ready) {
      g.fillStyle = "rgba(40,34,24,0.9)";
      g.font = `600 ${Math.max(13, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(this.failed ? "원작 이미지를 불러오지 못했습니다 — 먹 그림으로 대체" : "세한도를 펼치는 중…",
        W * 0.5, H * 0.5);
      g.textAlign = "start";
    }
  }

  // ── 스크롤: 드래그(관성) + 양끝 저항 ────────────────────────────────────────
  _updateScroll(dts, L) {
    const max = L.maxScroll;
    if (this._openOnPainting && max > 0) {
      this.scrollX = max * 0.72;                 // 세한도 그림 구간(우측)에서 시작
      this._openOnPainting = false;
    }
    if (this.dragging) {
      const dx = this.pointer.x - this.lastX;
      this.lastX = this.pointer.x;
      // 경계 밖에서는 저항 — 넘어간 만큼 끌림이 둔해진다
      let applied = dx;
      const over = this.scrollX < 0 ? -this.scrollX : this.scrollX > max ? this.scrollX - max : 0;
      if (over > 0) applied *= EDGE_RESIST;
      this.scrollX -= applied;
      // 방출 관성(부드럽게 갱신)
      if (dts > 0) this.vel = lerp(this.vel, -dx / dts, 0.4);
      // 홀드 판정(가만히 쥐고 있으면 저녁)
      if (Math.abs(dx) < STILL_V) this.stillT += dts; else this.stillT = 0;
    } else {
      this.scrollX += this.vel * dts;
      this.vel *= Math.exp(-FRICTION * dts);
      this.stillT = 0;
    }
    // 양끝 스프링 되돌림
    if (this.scrollX < 0) {
      this.scrollX += (0 - this.scrollX) * clamp(EDGE_SPRING * dts, 0, 1);
      this.vel *= 0.6;
    } else if (this.scrollX > max) {
      this.scrollX += (max - this.scrollX) * clamp(EDGE_SPRING * dts, 0, 1);
      this.vel *= 0.6;
    }
    if (Math.abs(this.vel) < 0.5) this.vel = 0;
  }

  // ── 저녁: 홀드(가만히 쥠) 동안 차오르고, 놓으면 낮으로 ──────────────────────
  _updateEvening(dts) {
    const holding = this.dragging && this.stillT > 0.12;
    const target = holding ? this.duskMax : 0;
    const rate = holding ? EVENING_RISE : EVENING_FALL;
    this.evening += (target - this.evening) * clamp(rate * dts, 0, 1);
    if (this.evening < 0.001) this.evening = 0;
  }

  // ── 바람: 기본 드리프트 + 이따금 돌풍(쌓인 눈을 쓸어감) ─────────────────────
  _updateWind(dts) {
    this.gustT -= dts;
    if (this.gustT <= 0) { this.gust = 1; this.gustT = 3 + Math.random() * 5; }
    this.gust = Math.max(0, this.gust - dts * 0.6);
    this.wind = WIND_BASE + this.gust * 0.16;
    // 쌓인 눈은 늘 조금씩, 돌풍엔 더 많이 쓸린다
    const decay = (ACC_DECAY + this.gust * 0.5) * dts;
    const acc = this.acc;
    for (let c = 0; c < NCOL; c++) {
      acc[c] -= decay * (0.5 + acc[c]);
      if (acc[c] < 0) acc[c] = 0;
    }
  }

  // ── 쌓인 눈(월드): 컬럼별 밴드 위 얇은 흰 캡, 그림과 함께 스크롤 ─────────────
  _drawAccum(g, L, x0) {
    const colW = L.sw / NCOL;
    if (colW <= 0) return;
    const c0 = Math.max(0, Math.floor((-x0) / colW) - 1);
    const c1 = Math.min(NCOL - 1, Math.ceil((this.w - x0) / colW) + 1);
    const tint = this.evening;
    // 저녁이면 눈도 청묵빛으로
    const rr = Math.round(lerp(250, 176, tint)), gg = Math.round(lerp(250, 190, tint)), bb = Math.round(lerp(252, 214, tint));
    g.save();
    for (let c = c0; c <= c1; c++) {
      const d = this.acc[c] * this.surf[c];
      if (d < 0.02) continue;
      const sx = x0 + (c + 0.5) * colW;
      const sy = L.dyTop + this.capV[c] * L.sh;
      const capH = d * L.sh * 0.028;             // 아주 얇게
      const capW = colW * 1.5;
      g.fillStyle = `rgba(${rr},${gg},${bb},${clamp(d * 0.9, 0, 0.85)})`;
      g.beginPath();
      g.ellipse(sx, sy, capW, capH + 0.6, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // ── 내리는 눈(스크린): 풀 재사용, 표면 위에서 확률적으로 착지 ────────────────
  _updateFlakes(g, dts, L, x0) {
    const W = this.w, H = this.h;
    const colW = L.sw / NCOL;
    // 생성 (양 = 화면 넓이 비례 × 슬라이더)
    this._spawnAcc += this.snowAmt * (W * 0.09) * dts;
    while (this._spawnAcc >= 1) {
      this._spawnAcc -= 1;
      this._spawn(W, H);
    }
    const windPx = this.wind * W;
    g.save();
    for (let i = 0; i < FLAKE_MAX; i++) {
      const f = this.flakes[i];
      if (!f.on) continue;
      f.ph += dts;
      f.y += f.vy * dts;
      f.x += (windPx + Math.sin(f.ph * 1.7) * W * 0.02) * dts;
      // 밴드 위 표면에 닿으면 확률적으로 착지(월드 컬럼에 쌓임)
      if (!f.passed && colW > 0) {
        const c = Math.floor((f.x - x0) / colW);
        if (c >= 0 && c < NCOL) {
          const landY = L.dyTop + this.capV[c] * L.sh;
          if (f.y >= landY) {
            if (Math.random() < this.surf[c] * 0.55) {
              this.acc[c] = Math.min(ACC_MAX, this.acc[c] + ACC_GROW);
              f.on = false; continue;
            }
            f.passed = true;                     // 표면 없으면 계속 낙하
          }
        }
      }
      if (f.y - f.r > H || f.x < -20 || f.x > W + 20) { f.on = false; continue; }
      g.fillStyle = `rgba(250,250,252,${f.a})`;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  _spawn(W, H) {
    // 비활성 슬롯 하나 찾기(선형, 풀이 다 차면 스킵)
    for (let k = 0; k < 6; k++) {
      const i = (Math.random() * FLAKE_MAX) | 0;
      const f = this.flakes[i];
      if (f.on) continue;
      f.on = true; f.passed = false;
      f.x = Math.random() * (W + 40) - 20;
      f.y = -Math.random() * H * 0.3 - 4;
      f.vy = H * (0.10 + Math.random() * 0.10);  // 마른 눈 — 느리게
      f.ph = Math.random() * TAU;
      f.r = 0.8 + Math.random() * 1.6;
      f.a = 0.35 + Math.random() * 0.4;
      return;
    }
  }

  // ── 저녁으로 식음 + 집 창의 작은 등불 ───────────────────────────────────────
  _drawEvening(g, L, x0) {
    const W = this.w, H = this.h, e = this.evening;
    // 청묵빛 워시(곱하기로 식힘) — 원작은 비추되 차게
    g.save();
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = e * 0.55;
    const cool = g.createLinearGradient(0, 0, 0, H);
    cool.addColorStop(0, `rgb(${INK_R + 30},${INK_G + 34},${INK_B + 40})`);
    cool.addColorStop(1, `rgb(${INK_R},${INK_G},${INK_B})`);
    g.fillStyle = cool;
    g.fillRect(0, 0, W, H);
    g.restore();

    // 등불 — 집 창(월드 좌표). 화면 안에 있을 때만.
    const lx = x0 + HOUSE_U * L.sw;
    const ly = L.dyTop + HOUSE_V * L.sh;
    if (lx > -60 && lx < W + 60) {
      const lit = e * (0.85 + 0.15 * Math.sin(this.t * 3.1));  // 아주 미세한 흔들림
      g.save();
      g.globalCompositeOperation = "lighter";
      const R = Math.min(W, H) * 0.09;
      const glow = g.createRadialGradient(lx, ly, 0, lx, ly, R);
      glow.addColorStop(0, `rgba(${LAMP_R},${LAMP_G},${LAMP_B},${0.55 * lit})`);
      glow.addColorStop(0.4, `rgba(${LAMP_R},${LAMP_G - 30},${LAMP_B - 60},${0.22 * lit})`);
      glow.addColorStop(1, "rgba(255,180,90,0)");
      g.fillStyle = glow;
      g.beginPath(); g.arc(lx, ly, R, 0, TAU); g.fill();
      // 창의 심지 — 아주 작은 따뜻한 점 하나
      g.fillStyle = `rgba(255,236,200,${0.9 * lit})`;
      g.beginPath(); g.arc(lx, ly, Math.max(1.4, R * 0.05), 0, TAU); g.fill();
      g.restore();
    }
  }

  // ── 폴백: 원작 로드 전/실패 시 절차적 먹 두루마리 (스크롤 유지) ──────────────
  _drawFallback(g, L, x0) {
    const W = this.w, H = this.h;
    g.fillStyle = "#e7ddc8";
    g.fillRect(x0, L.dyTop, L.sw, L.sh);
    // 여백 위 먹 소나무 실루엣 몇 그루 + 집 한 채
    g.strokeStyle = "rgba(40,36,28,0.7)";
    g.lineWidth = Math.max(1.5, L.sh * 0.006);
    for (let k = 0; k < 5; k++) {
      const u = 0.2 + k * 0.15;
      const bx = x0 + u * L.sw, by = L.dyTop + L.sh * 0.72;
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + (this.noise(k, 1) * 0.5) * L.sw * 0.02, L.dyTop + L.sh * 0.4);
      g.stroke();
    }
    // 집(등불 자리 표시)
    const hx = x0 + HOUSE_U * L.sw, hy = L.dyTop + HOUSE_V * L.sh;
    g.strokeStyle = "rgba(40,36,28,0.8)";
    g.strokeRect(hx - L.sw * 0.02, hy - L.sh * 0.05, L.sw * 0.04, L.sh * 0.1);
  }

  controls(host) {
    host.appendChild(slider("눈 (snow)", 0, 2, this.snowAmt, 0.05, (v) => (this.snowAmt = v)));
    host.appendChild(slider("저녁 (dusk)", 0, 1, this.duskMax, 0.05, (v) => (this.duskMax = v),
      (v) => `${Math.round(v * 100)}%`));
  }

  teardown() {
    this.img = null;
    this.flakes = null;
    this.acc = null; this.surf = null; this.capV = null;
    this._grain = null;
  }
}
