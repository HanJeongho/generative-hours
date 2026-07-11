// ============================================================================
//  82 · 안개를 걷는 손 (After 정선 — 仁王霽色圖 / 인왕제색도, 1751)
//  ── XII 「Ink & Moon — 먹과 달」 (wing: hanguk)
//
//  정선은 비가 막 갠 인왕산을 그렸다. 젖은 바위는 먹으로 검게 번들거리고,
//  골짜기에서는 안개가 피어오른다. 이 작품은 그 '비 갠 직후'의 한 순간을
//  관람객의 손에 맡긴다 — 원작 위에 한지빛 먹안개가 화면 가득 드리워 있고,
//  손으로 문지르면 그 자리 안개가 밀려나며(문지른 방향으로 흘러가며) 젖은
//  바위가 드러난다. 손을 떼면 골짜기(원작의 안개 띠, y≈0.55~0.75)에서 안개가
//  다시 스며 위로 차오른다. 걷히는 것은 잠깐, 산은 다시 안개에 잠긴다.
//
//  · 안개 = 저해상 밀도장(격자)을 다층 value-noise로 채우고 느리게 이류시켜
//    오프스크린에 한 번 그린 뒤 스무딩 업스케일 → 공짜 블러(핫루프 무할당).
//  · 문지르기 = 브러시 반경 안 밀도를 깎고, 포인터 속도 방향 앞쪽 칸에 살짝
//    쌓아 '밀려나 흐르는' 느낌. 회복 = 골짜기 가중 + 아래칸 밀도로 상승(창발).
//  · 클릭 = 소나기 한 줄기(먹비 입자 풀) + 안개가 짙어지고 바위가 잠깐 더
//    젖어(어두워져) 번들거림.
//  안개는 순백이 아니라 한지빛(240,238,230)에 먹기가 살짝 섞인 색.
// ============================================================================

import { Piece, clamp, lerp, makeNoise } from "../engine.js";
import { slider } from "./01-currents.js";

const IMG_SRC = "assets/art/inwang.jpg";
const IMG_W = 2200, IMG_H = 1277;      // 원본 픽셀 크기 (정선 1751)

// ── 이미지 좌표 의존 상수 (중앙에서 시각 캘리브레이션 예정 — 대략값) ────────
const VALLEY_Y0 = 0.55;                // 안개 발원 골짜기 띠 시작 (이미지 v)
const VALLEY_Y1 = 0.75;                // 골짜기 띠 끝
const VALLEY_LIFT = 0.12;              // 골짜기에서 안개가 더 두터운 정도
const REC_VALLEY = 0.95;              // 골짜기 회복(발원) 가산
const REC_RISE = 0.60;                 // 아래칸 밀도로 위로 차오르는(창발) 가산

// ── 안개 색/질감 ────────────────────────────────────────────────────────────
const MIST_R = 240, MIST_G = 238, MIST_B = 230;   // 한지빛
const MIST_INK = 14;                   // 먹기(칸마다 살짝 어둡게)
const MIST_ALPHA = 0.965;              // 밀도 1일 때 최대 불투명도
const MIST_BASE = 0.86;                // 기본 안개 밀도(가만두면 이 정도로 덮임)
const MIST_VAR = 0.16;                 // 노이즈 billow 진폭
const REC_BASE = 0.24;                 // 기본 회복 속도(MIST 슬라이더가 곱함)

// ── 브러시(문지르기) / 소나기 ───────────────────────────────────────────────
const CELL = 9;                        // 밀도장 격자 한 칸(스크린 px 목표)
const BRUSH_STRENGTH = 3.4;            // 초당 안개 깎는 세기
const PUSH_FRAC = 0.45;                // 밀려난 안개가 앞쪽에 쌓이는 비율
const RAIN_MAX = 260;                  // 먹비 입자 풀 크기
const RAIN_BURST = 96;                 // 클릭 한 줄기당 입자 수
const NSCALE = 0.0055;                 // 노이즈 공간 스케일(해상도 독립)
const DRIFTX = 0.028, DRIFTY = -0.016; // 안개 이류 방향(느리게 위로)

export default class Inwang extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.mist = 1.0;        // MIST 슬라이더 — 안개 회복 속도 배수
    this.wet = 0;           // 소나기 직후 바위 젖음(어두움) 정도
    this.mistBoost = 0;     // 소나기 시 안개가 짙어지는 가산

    // 먹비 입자 풀 (고정 크기, 무할당 재사용)
    this.rain = new Array(RAIN_MAX);
    for (let i = 0; i < RAIN_MAX; i++) this.rain[i] = { x: 0, y: 0, vx: 0, vy: 0, len: 0, a: 0, on: false };
    this.rainHead = 0;

    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;

    this._buildGrid();
  }

  onResize() { this._buildGrid(); }

  // 원작을 화면에 cover(가득 채움)로 배치 — 안개가 화면을 꽉 덮게.
  _coverRect() {
    const s = Math.max(this.w / IMG_W, this.h / IMG_H);
    const dw = IMG_W * s, dh = IMG_H * s;
    return { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw, dh };
  }

  // 밀도장 격자 + 오프스크린 안개 캔버스 + 행별 골짜기 가중치 프리컴퓨트
  _buildGrid() {
    const GW = this.GW = Math.max(2, Math.ceil(this.w / CELL));
    const GH = this.GH = Math.max(2, Math.ceil(this.h / CELL));
    this.cw = this.w / GW;              // 실제 칸 스크린 크기
    this.ch = this.h / GH;

    this.d = new Float32Array(GW * GH);      // 안개 밀도장 [0..~1.2]
    this.ink = new Float32Array(GW * GH);    // 칸별 먹기(정적 텍스처)
    this.d.fill(MIST_BASE);                  // 시작은 안개에 잠긴 상태

    // 골짜기 가중치(행별) + 이미지 v(행별) — cover 변환 반영
    const rect = this._coverRect();
    this.valleyW = new Float32Array(GH);
    const c = (VALLEY_Y0 + VALLEY_Y1) * 0.5, half = (VALLEY_Y1 - VALLEY_Y0) * 0.5;
    for (let gy = 0; gy < GH; gy++) {
      const sy = (gy + 0.5) * this.ch;
      const v = (sy - rect.dy) / rect.dh;
      const z = (v - c) / (half * 1.5);
      this.valleyW[gy] = Math.exp(-z * z);
    }
    // 정적 먹기 텍스처(노이즈 → 칸마다 살짝 어둡게)
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++)
        this.ink[gy * GW + gx] = (this.noise(gx * 0.8, gy * 0.8) * 0.5 + 0.5) * MIST_INK;

    this.mistCv = document.createElement("canvas");
    this.mistCv.width = GW; this.mistCv.height = GH;
    this.mistG = this.mistCv.getContext("2d");
    this.mistImg = this.mistG.createImageData(GW, GH);
  }

  // 클릭 = 소나기 한 줄기 (먹비 쏟아짐 + 안개 짙어짐 + 바위 젖음)
  onPointerDown() {
    if (!this.pointer.active) return;
    this.wet = 1;
    this.mistBoost = Math.min(0.45, this.mistBoost + 0.34);
    const px = this.pointer.x;
    const W = this.w, H = this.h;
    const spread = W * 0.055;
    for (let k = 0; k < RAIN_BURST; k++) {
      const d = this.rain[this.rainHead];
      this.rainHead = (this.rainHead + 1) % RAIN_MAX;
      d.on = true;
      d.x = px + (Math.random() - 0.5) * 2 * spread;
      d.y = -Math.random() * H * 0.5;
      d.vy = H * (1.5 + Math.random() * 0.8);
      d.vx = H * 0.10;                 // 살짝 비스듬히
      d.len = H * (0.05 + Math.random() * 0.06);
      d.a = 0.35 + Math.random() * 0.35;
    }
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const dts = clamp(dt, 0, 0.05);

    const rect = this._coverRect();

    // 1) 원작(또는 폴백) — 젖은 바위 바탕
    g.fillStyle = "#161310";
    g.fillRect(0, 0, W, H);
    if (this.ready) g.drawImage(this.img, 0, 0, IMG_W, IMG_H, rect.dx, rect.dy, rect.dw, rect.dh);
    else this._drawFallback(g, t);

    // 2) 소나기 직후 바위 젖음(어두워져 번들거림)
    if (this.wet > 0.002) {
      g.fillStyle = `rgba(22,26,34,${this.wet * 0.30})`;
      g.fillRect(rect.dx, rect.dy, rect.dw, rect.dh);
      this.wet = Math.max(0, this.wet - dts * 0.42);
    }
    this.mistBoost = Math.max(0, this.mistBoost - dts * 0.16);

    // 3) 먹비 입자 (안개 아래 — 대기 속 비로 읽힘)
    this._drawRain(g, dts, H);

    // 4) 문지르기 — 안개를 깎아 밀어낸다
    if (this.pointer.active) this._wipe(dts);

    // 5) 안개장 갱신 + 오프스크린 렌더 + 업스케일 블러
    this._updateAndRenderMist(t, dts);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mistCv, 0, 0, this.GW, this.GH, 0, 0, W, H);

    // 6) 은은한 비네팅 + 하단 캡션
    const vg = g.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.34, W * 0.5, H * 0.54, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(18,16,12,0.34)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    g.fillStyle = "rgba(28,24,18,0.82)";
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.02)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText("비는 방금 그쳤다 — 걷히는 것은 당신의 손이 한다.", W * 0.5, H - Math.max(16, H * 0.035));
    g.textAlign = "start";

    if (!this.ready) {
      g.fillStyle = "rgba(250,246,236,0.9)";
      g.font = `600 ${Math.max(13, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(this.failed ? "원작 이미지를 불러오지 못했습니다 — 먹 그림으로 대체" : "인왕산을 불러오는 중…", W * 0.5, H * 0.5);
      g.textAlign = "start";
    }
  }

  // ── 문지르기: 브러시 반경 안 밀도 깎기 + 속도 방향 앞쪽에 쌓기 ─────────────
  _wipe(dts) {
    const R = Math.min(this.w, this.h) * 0.11;      // 브러시 반경(스크린 px)
    const gcx = this.pointer.x / this.cw, gcy = this.pointer.y / this.ch;
    const rcx = R / this.cw, rcy = R / this.ch;
    const vx = this.pointer.vx, vy = this.pointer.vy;
    const sp = Math.hypot(vx, vy);
    const nx = sp > 0.1 ? vx / sp : 0, ny = sp > 0.1 ? vy / sp : 0;
    const pushLead = Math.max(1, Math.round((R * 0.8) / this.cw));
    const GW = this.GW, GH = this.GH, d = this.d;
    const gy0 = Math.max(0, Math.floor(gcy - rcy)), gy1 = Math.min(GH - 1, Math.ceil(gcy + rcy));
    const gx0 = Math.max(0, Math.floor(gcx - rcx)), gx1 = Math.min(GW - 1, Math.ceil(gcx + rcx));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = ((gx + 0.5) - gcx) * this.cw, dy = ((gy + 0.5) - gcy) * this.ch;
        const dist = Math.hypot(dx, dy);
        if (dist >= R) continue;
        const f = 1 - dist / R;
        const removed = BRUSH_STRENGTH * f * f * dts;
        const i = gy * GW + gx;
        d[i] -= removed;
        if (d[i] < 0) d[i] = 0;
        if (sp > 0.1) {                            // 앞쪽 칸에 쌓아 '밀려나 흐름'
          const lx = gx + Math.round(nx * pushLead), ly = gy + Math.round(ny * pushLead);
          if (lx >= 0 && lx < GW && ly >= 0 && ly < GH) d[ly * GW + lx] += removed * PUSH_FRAC;
        }
      }
    }
  }

  // ── 안개장 갱신(회복·이류) + 오프스크린 픽셀 write (단일 패스, 무할당) ──────
  _updateAndRenderMist(t, dts) {
    const GW = this.GW, GH = this.GH, d = this.d, ink = this.ink, vW = this.valleyW;
    const data = this.mistImg.data;
    const tdx = t * DRIFTX, tdy = t * DRIFTY;
    const rate0 = this.mist * REC_BASE;
    let p = 0;
    for (let gy = 0; gy < GH; gy++) {
      const sy = (gy + 0.5) * this.ch;
      const vw = vW[gy];
      const rowRate = rate0 + this.mist * REC_VALLEY * vw;
      const below = gy < GH - 1 ? (gy + 1) * GW : -1;
      for (let gx = 0; gx < GW; gx++) {
        const i = gy * GW + gx;
        const sx = (gx + 0.5) * this.cw;
        // 다층 value-noise billow + 느린 이류
        const n1 = this.noise(sx * NSCALE + tdx, sy * NSCALE + tdy);
        const n2 = this.noise(sx * NSCALE * 2.3 - tdx * 0.7, sy * NSCALE * 2.3 + tdy * 1.3);
        const billow = n1 * 0.62 + n2 * 0.38;
        let target = MIST_BASE + billow * MIST_VAR + vw * VALLEY_LIFT + this.mistBoost;
        if (target > 1.18) target = 1.18;
        // 아래칸이 짙으면 위로 차오름(창발) — 골짜기에서 스며 오르는 안개
        let rate = rowRate;
        if (below >= 0) rate += this.mist * REC_RISE * d[below + gx];
        let v = d[i] + (target - d[i]) * (rate * dts > 1 ? 1 : rate * dts);
        if (v < 0) v = 0;
        d[i] = v;
        let a = v > 1 ? 1 : v;
        const ik = ink[i];
        data[p] = MIST_R - ik; data[p + 1] = MIST_G - ik; data[p + 2] = MIST_B - ik;
        data[p + 3] = a * 255 * MIST_ALPHA;
        p += 4;
      }
    }
    this.mistG.putImageData(this.mistImg, 0, 0);
  }

  // ── 먹비 입자 (풀 재사용) ───────────────────────────────────────────────────
  _drawRain(g, dts, H) {
    g.save();
    g.lineCap = "round";
    for (let i = 0; i < RAIN_MAX; i++) {
      const r = this.rain[i];
      if (!r.on) continue;
      r.y += r.vy * dts; r.x += r.vx * dts;
      if (r.y - r.len > H) { r.on = false; continue; }
      g.strokeStyle = `rgba(34,40,52,${r.a})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(r.x, r.y);
      g.lineTo(r.x - r.vx * 0.06, r.y - r.len);
      g.stroke();
    }
    g.restore();
  }

  // ── 폴백: 원작 로드 전/실패 시 절차적 먹 산 (인터랙션 유지) ─────────────────
  _drawFallback(g, t) {
    const W = this.w, H = this.h;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#c9c2b2"); sky.addColorStop(0.6, "#8f8a7c"); sky.addColorStop(1, "#3b382f");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 3; r++) {
      const base = H * (0.5 + r * 0.16);
      g.fillStyle = `rgba(30,28,24,${0.55 - r * 0.14})`;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 24) {
        const y = base - (this.noise(x * 0.003 + r * 5, r * 3) * 0.5 + 0.5) * H * 0.22 * (1 - r * 0.2);
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
  }

  controls(host) {
    host.appendChild(slider("MIST (안개 회복)", 0, 2, this.mist, 0.05, (v) => (this.mist = v)));
  }

  teardown() {
    this.img = null;
    this.rain = null;
    this.d = null; this.ink = null;
    this.mistCv = null; this.mistImg = null;
  }
}
