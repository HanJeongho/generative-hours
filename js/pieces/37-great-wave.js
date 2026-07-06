// ============================================================================
//  37 · 가나가와 (After Hokusai — Great Wave) · PAPER THEATER
//  神奈川沖浪裏 — 호쿠사이의 원화를 가위로 누끼 따낸 종이 조각들로 만들고,
//  그 종이들을 막대기(dowel)로 조종하는 "종이 인형극(paper theater)"으로 연출.
//
//  원화 이미지(assets/art/great-wave.jpg, 1920×1291)를 영역별 clip 마스크로
//  오려 LAYER 조각들을 만든다:
//    · 거대 파도(좌·중앙 상단을 지배, 갈고리 물보라)
//    · 오른쪽 큰 파도(우측에서 솟는 두 번째 파도)
//    · 후지산(가운데 아래, 작게)
//    · 보트들(골에 떠 있는 가늘고 긴 배)
//    · 배경 종이(하늘·먼 바다) — 무대 안쪽 막
//  각 종이 조각에는: deckle edge(거친 손오림 테두리)·드리운 그림자(층 입체감)·
//  아주 약한 종이결 노이즈가 들어간다. 조각 뒤에는 가는 나무 막대가 무대 옆에서
//  뻗어나와 그 조각을 잡고 있는 듯 그려지고, 막대 끝과 조각이 함께 흔들린다.
//
//  모션: 파도 조각은 좌우로 흔들+위아래 까딱, 보트는 골에서 흔들흔들, 후지는
//  거의 고정. 무대 위 스포트라이트와 바닥 그림자로 2.5D 페이퍼 컷아웃 깊이감.
//  드래그하면 막대기를 잡아 그 조각을 끌어 흔들 수 있고, 클릭은 전체를 한 번
//  크게 출렁이게 한다(무대 흔들기).
// ============================================================================

import { Piece, TAU, clamp, lerp, map, rand, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const IMG_W = 1920, IMG_H = 1291;     // 원본 이미지 픽셀 크기

// 무대(판지) 톤 — 따뜻한 베이지
const STAGE_TOP = "#d8c7a4";
const STAGE_BOT = "#b59a6e";
const FLOOR     = "#9c7e54";
const PAPER     = "#efe6d2";          // 종이 조각 바탕(테두리·뒷면)
const PAPER_HI  = "#fbf6ea";
const DOWEL     = "#7a5a34";          // 나무 막대
const DOWEL_HI  = "#a87f4c";

// 원본 이미지의 영역(누끼) 정의. src* 는 IMG_W×IMG_H 정규화(0..1) 다각형이고,
// 손으로 대충 오린 종이 느낌을 위해 베지에가 아니라 거친 다각형으로 둔다.
// 각 레이어는 무대 위 배치(앵커)와 흔들림 성질을 함께 가진다.
// poly: [[u,v], ...]  (u,v ∈ 0..1, 이미지 기준)
const LAYERS = [
  // ----- 배경 종이: 하늘 + 먼 바다 (무대 안쪽 막, 가장 뒤) ------------------
  // backdrop=true → 원화를 흐릿·탈색해 "뒷막 종이"로. 앞 조각들이 도드라지게.
  {
    id: "bg", depth: 0.0, swayX: 5, swayY: 3, swayPhase: 0.0, swaySpeed: 0.22,
    backdrop: true,
    dowel: null,                       // 배경은 막대 없음(무대 뒷막)
    poly: [
      [0, 0], [1, 0], [1, 1], [0, 1],
    ],
  },
  // ----- 후지산: 가운데 아래, 작게. 거의 고정 ------------------------------
  {
    id: "fuji", depth: 0.18, swayX: 3, swayY: 2, swayPhase: 1.1, swaySpeed: 0.4,
    dowel: { side: "bottom", at: 0.58, len: 0.16 },
    poly: [
      [0.50, 0.66], [0.545, 0.585], [0.575, 0.555], [0.60, 0.585],
      [0.655, 0.66], [0.62, 0.665], [0.58, 0.655], [0.545, 0.665],
    ],
  },
  // ----- 오른쪽 큰 파도: 우측에서 솟아 갈고리 물보라 -----------------------
  {
    id: "rightwave", depth: 0.42, swayX: 14, swayY: 9, swayPhase: 2.3, swaySpeed: 0.62,
    dowel: { side: "right", at: 0.62, len: 0.22 },
    poly: [
      [0.62, 0.74], [0.68, 0.62], [0.74, 0.55], [0.80, 0.53],
      [0.86, 0.56], [0.90, 0.50], [0.95, 0.54], [1.0, 0.62],
      [1.0, 1.0], [0.62, 1.0],
    ],
  },
  // ----- 보트들 (골에 떠있는 가늘고 긴 배 3척) -----------------------------
  // 보트는 작은 누끼 + 골에서의 부드러운 흔들. 막대는 아래에서.
  {
    id: "boatL", depth: 0.5, swayX: 10, swayY: 14, swayPhase: 0.5, swaySpeed: 1.1,
    dowel: { side: "bottom", at: 0.30, len: 0.20 },
    poly: [
      [0.21, 0.555], [0.30, 0.515], [0.40, 0.535], [0.40, 0.575],
      [0.30, 0.575], [0.21, 0.58],
    ],
  },
  {
    id: "boatR", depth: 0.55, swayX: 12, swayY: 16, swayPhase: 2.0, swaySpeed: 1.25,
    dowel: { side: "bottom", at: 0.80, len: 0.18 },
    poly: [
      [0.74, 0.70], [0.83, 0.665], [0.94, 0.69], [0.94, 0.73],
      [0.83, 0.73], [0.74, 0.725],
    ],
  },
  // ----- 거대 파도: 좌·중앙 상단을 지배, 갈고리 물보라 (가장 앞) ----------
  {
    id: "greatwave", depth: 0.78, swayX: 22, swayY: 13, swayPhase: 0.0, swaySpeed: 0.5,
    dowel: { side: "left", at: 0.30, len: 0.26 },
    poly: [
      [0.0, 0.78], [0.02, 0.58], [0.08, 0.40], [0.13, 0.26],
      [0.17, 0.15], [0.22, 0.085], [0.27, 0.05], [0.31, 0.075],
      [0.35, 0.045], [0.385, 0.08], [0.345, 0.135], [0.40, 0.165],
      [0.36, 0.20], [0.43, 0.22], [0.40, 0.30], [0.47, 0.34],
      [0.43, 0.43], [0.49, 0.52], [0.44, 0.62], [0.50, 0.74],
      [0.42, 0.86], [0.30, 0.96], [0.16, 1.0], [0.0, 1.0],
    ],
  },
];

const mix = (a, b, t) => a + (b - a) * t;

export default class GreatWavePaper extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.ready = false;
    this.failed = false;

    // 컨트롤 상태
    this.swayAmt = 1.0;     // 흔들림 세기
    this.dowelVis = 1.0;    // 막대기 보이기 정도(0=숨김)
    this.depthAmt = 1.0;    // 깊이감/조명 세기
    this.calm = 1;          // calm 버튼이면 잠깐 0 근처로
    this.surge = 0;         // 클릭/surge 시 일시적 큰 출렁임

    // 드래그로 잡은 조각
    this.grabbed = null;    // {layer, dx, dy}
    this.dragOff = { x: 0, y: 0 };   // 조각별 추가 변위 (잡아끌기)

    // 종이결 패턴(한 번 만들어 곱하기 합성으로 살짝 얹음)
    this._grain = this._makeGrain();

    // 레이어 인스턴스(매 프레임 갱신되는 변위 포함)
    this.layers = LAYERS.map((L) => ({ ...L, ox: 0, oy: 0, rot: 0, pullX: 0, pullY: 0 }));

    // 이미지 비동기 로드
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = "assets/art/great-wave.jpg";
  }

  // ---- 이미지 → 화면 매핑 ---------------------------------------------------
  // 원화 비율(1920×1291 ≈ 1.487)을 유지하며 화면을 "contain"으로 채우되,
  // 무대 프레임 안쪽(여백)에 배치. 반환: {dx,dy,dw,dh} 스테이지 그림 영역.
  _stageRect() {
    const W = this.w, H = this.h;
    const pad = Math.min(W, H) * 0.04;
    const aw = W - pad * 2, ah = H - pad * 2;
    const ar = IMG_W / IMG_H;
    let dw = aw, dh = aw / ar;
    if (dh > ah) { dh = ah; dw = ah * ar; }
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2 - H * 0.01;   // 살짝 위로(바닥 그림자 공간)
    return { dx, dy, dw, dh };
  }

  // 이미지 정규화 좌표(u,v) → 화면 픽셀
  _toScreen(u, v, rect) {
    return { x: rect.dx + u * rect.dw, y: rect.dy + v * rect.dh };
  }

  // 약한 종이결 노이즈 텍스처 (작은 오프스크린, 곱하기 합성용)
  _makeGrain() {
    const s = 160;
    const cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    const g = cv.getContext("2d");
    const img = g.createImageData(s, s);
    const d = img.data;
    for (let i = 0; i < s * s; i++) {
      // 잔잔한 베이지 결 — 밝기 미세 변동
      const n = 235 + ((Math.random() * 20) | 0);
      d[i * 4] = n; d[i * 4 + 1] = n - 4; d[i * 4 + 2] = n - 12; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  onResize() { /* _stageRect는 매 프레임 계산하므로 별도 처리 불필요 */ }

  // ---- 드래그: 막대기를 잡아 그 조각을 끌어 흔든다 -------------------------
  onPointerDown() {
    if (!this.ready) return;
    const rect = this._stageRect();
    const px = this.pointer.x, py = this.pointer.y;
    // 앞쪽(depth 큰) 조각부터 히트테스트
    const ordered = [...this.layers].sort((a, b) => b.depth - a.depth);
    for (const L of ordered) {
      if (L.id === "bg") continue;
      if (this._hit(L, px, py, rect)) {
        this.grabbed = L;
        this.dragOff = { x: 0, y: 0 };
        this._grabStartX = px; this._grabStartY = py;
        return;
      }
    }
    // 빈 무대를 클릭 → 전체 출렁
    this.surge = 1.0;
  }
  onPointerUp() { this.grabbed = null; }

  // 점이 레이어 다각형(현재 변위 반영) 안에 있는지
  _hit(L, px, py, rect) {
    const poly = L.poly;
    let inside = false;
    const ox = L.ox + (L === this.grabbed ? this.dragOff.x : 0);
    const oy = L.oy + (L === this.grabbed ? this.dragOff.y : 0);
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = this._toScreen(poly[i][0], poly[i][1], rect);
      const b = this._toScreen(poly[j][0], poly[j][1], rect);
      const ax = a.x + ox, ay = a.y + oy, bx = b.x + ox, by = b.y + oy;
      if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // 무대 배경(항상 그림 — 로딩/실패시에도 보이게)
    this._drawStage(g, W, H, t);

    if (!this.ready) {
      this._drawCurtainMsg(g, W, H, this.failed
        ? "무대 준비 실패 — 그림을 불러올 수 없습니다"
        : "무대 준비 중…");
      if (this.failed) return;   // 이미지 없으면 무대만
      return;
    }

    const rect = this._stageRect();

    // calm/surge 이징
    this.calm = lerp(this.calm, 1, dt * 0.6);
    this.surge = Math.max(0, this.surge - dt * 1.1);
    const gain = this.swayAmt * this.calm * (1 + this.surge * 1.6);

    // 드래그 끌기 변위
    if (this.grabbed) {
      this.dragOff.x = lerp(this.dragOff.x, this.pointer.x - this._grabStartX, 0.4);
      this.dragOff.y = lerp(this.dragOff.y, this.pointer.y - this._grabStartY, 0.4);
    }

    // 각 레이어 변위 업데이트(인형극 모션) — 막대가 조종하는 느낌
    for (const L of this.layers) {
      const ph = t * L.swaySpeed + L.swayPhase;
      // 자연스러운 합성 흔들림
      let tx = (Math.sin(ph) * 0.7 + Math.sin(ph * 2.3 + 1.0) * 0.3) * L.swayX * gain;
      let ty = (Math.sin(ph * 0.8 + 0.5) * 0.6 + Math.sin(ph * 1.7) * 0.4) * L.swayY * gain;
      let rot = Math.sin(ph * 0.9 + 0.3) * 0.012 * gain * (L.depth + 0.4);
      // 잡힌 조각은 추가로 끌려옴
      if (L === this.grabbed) {
        L.pullX = this.dragOff.x; L.pullY = this.dragOff.y;
      } else {
        L.pullX = lerp(L.pullX, 0, dt * 3.2);   // 놓으면 스르륵 제자리
        L.pullY = lerp(L.pullY, 0, dt * 3.2);
      }
      L.ox = tx + L.pullX;
      L.oy = ty + L.pullY;
      L.rot = rot + L.pullX * 0.0006;
    }

    // 깊이 순서대로(뒤→앞) 그림. 배경은 막대 없음.
    const ordered = [...this.layers].sort((a, b) => a.depth - b.depth);
    for (const L of ordered) {
      this._drawDowel(g, L, rect, "back");      // 막대(조각 뒤)
      this._drawLayer(g, L, rect, t);           // 종이 조각
    }

    // 무대 위에서 내려오는 스포트라이트 + 비네팅
    this._drawLight(g, W, H);
  }

  // ==========================================================================
  //  STAGE — 따뜻한 판지 무대(상단 막 + 바닥) + 측면 프로시니엄
  // ==========================================================================
  _drawStage(g, W, H, t) {
    // 뒷막 그라데이션
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, STAGE_TOP);
    bg.addColorStop(0.72, STAGE_BOT);
    bg.addColorStop(1, FLOOR);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 바닥(무대 마루) — 아래 1/4, 살짝 어둡게 + 원근 결
    const floorY = H * 0.80;
    const fl = g.createLinearGradient(0, floorY, 0, H);
    fl.addColorStop(0, "rgba(120,92,54,0.0)");
    fl.addColorStop(1, "rgba(70,52,30,0.55)");
    g.fillStyle = fl;
    g.fillRect(0, floorY, W, H - floorY);
    // 마루 판자 결
    g.strokeStyle = "rgba(60,44,26,0.10)";
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = lerp(floorY, H, i / 8);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    // 좌우 무대 커튼(프로시니엄) — 어두운 판지, 조각이 옆에서 나오는 느낌
    const cw = W * 0.05;
    for (const sx of [0, W - cw]) {
      const cg = g.createLinearGradient(sx, 0, sx + cw, 0);
      const dark = sx === 0 ? [cw, 0] : [0, cw];
      cg.addColorStop(0, sx === 0 ? "rgba(60,42,24,0.55)" : "rgba(60,42,24,0.0)");
      cg.addColorStop(1, sx === 0 ? "rgba(60,42,24,0.0)" : "rgba(60,42,24,0.55)");
      g.fillStyle = cg;
      g.fillRect(sx, 0, cw, H);
    }
  }

  _drawCurtainMsg(g, W, H, msg) {
    g.fillStyle = "rgba(40,28,16,0.85)";
    g.font = `600 ${Math.max(14, Math.min(W, H) * 0.028)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(msg, W * 0.5, H * 0.5);
    g.textAlign = "start"; g.textBaseline = "alphabetic";
  }

  // 무대 조명: 위에서 내려오는 따뜻한 스포트 + 가장자리 비네팅
  _drawLight(g, W, H) {
    const d = this.depthAmt;
    // 스포트라이트(상단 중앙)
    const sx = W * 0.5, sy = -H * 0.1, R = Math.max(W, H) * 0.95;
    const sg = g.createRadialGradient(sx, sy, R * 0.1, sx, sy, R);
    sg.addColorStop(0, `rgba(255,244,214,${0.16 * d})`);
    sg.addColorStop(0.5, `rgba(255,236,196,${0.05 * d})`);
    sg.addColorStop(1, "rgba(255,236,196,0)");
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    // 비네팅
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.3, W * 0.5, H * 0.55, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(20,12,4,${0.34 * d})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  // ==========================================================================
  //  PAPER LAYER — clip된 이미지 누끼 + deckle edge + 그림자 + 종이결
  // ==========================================================================
  _drawLayer(g, L, rect, t) {
    const poly = L.poly;
    // 변위된 화면 다각형 + deckle(거친 손오림) 흔들림
    const pts = [];
    const jig = Math.min(this.w, this.h) * 0.006;   // 테두리 거칠기
    for (let i = 0; i < poly.length; i++) {
      const s = this._toScreen(poly[i][0], poly[i][1], rect);
      const nx = this.noise(poly[i][0] * 9 + i, poly[i][1] * 9 - i + L.depth * 5);
      const ny = this.noise(poly[i][0] * 9 + 50 + i, poly[i][1] * 9 + 30 - i);
      pts.push({
        x: s.x + L.ox + nx * jig,
        y: s.y + L.oy + ny * jig,
      });
    }

    // 회전 중심(다각형 무게중심)
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;

    g.save();
    g.translate(cx, cy);
    g.rotate(L.rot);
    g.translate(-cx, -cy);

    // --- 1) 드리운 그림자(층 입체감) — depth 클수록 멀리/진하게 ---------------
    if (L.id !== "bg") {
      const off = (4 + L.depth * 16) * this.depthAmt;
      g.save();
      g.translate(off, off * 1.25);
      this._tracePath(g, pts);
      g.fillStyle = `rgba(30,18,6,${(0.16 + L.depth * 0.22) * this.depthAmt})`;
      g.shadowColor = `rgba(20,12,4,${0.4 * this.depthAmt})`;
      g.shadowBlur = (6 + L.depth * 22) * this.depthAmt;
      g.fill();
      g.restore();
    }

    // --- 2) 종이 바탕(테두리로 살짝 삐져나오는 흰 deckle) ----------------------
    // 조각보다 약간 키운 외곽을 종이색으로 먼저 칠해 "오린 종이 가장자리"를 만든다.
    const grown = this._growPoly(pts, cx, cy, L.id === "bg" ? 0 : (2.5 + L.depth * 2));
    this._tracePath(g, grown);
    g.fillStyle = PAPER;
    g.fill();
    // 위쪽 가장자리 하이라이트
    this._tracePath(g, grown);
    g.strokeStyle = "rgba(255,250,238,0.6)";
    g.lineWidth = 1.2;
    g.stroke();

    // --- 3) 이미지 누끼(clip해서 해당 영역만) ---------------------------------
    g.save();
    this._tracePath(g, pts);
    g.clip();
    // 이미지 소스 좌표는 전체 이미지를 stage rect에 그대로 매핑(같은 변환계).
    // 변위/회전은 위 translate/rotate에 이미 반영됨. 단, ox/oy로 떠 있으므로
    // drawImage도 같은 offset만큼 이동시켜 그린다.
    const dx0 = rect.dx + L.ox, dy0 = rect.dy + L.oy;
    g.drawImage(this.img, 0, 0, IMG_W, IMG_H, dx0, dy0, rect.dw, rect.dh);

    if (L.backdrop) {
      // 뒷막: 종이톤 워시 + 약한 블러 느낌(밝기↑·채도↓)으로 탈색해
      // 앞쪽 누끼 조각들이 또렷하게 도드라지게 한다.
      g.fillStyle = "rgba(231,222,202,0.52)";
      g.fillRect(dx0 - 20, dy0 - 20, rect.dw + 40, rect.dh + 40);
      g.fillStyle = "rgba(255,250,238,0.18)";
      g.fillRect(dx0 - 20, dy0 - 20, rect.dw + 40, rect.dh + 40);
    } else {
      // 앞 조각: 위쪽에서 들어오는 빛으로 윗면 살짝 밝게(종이 입체)
      const sh = g.createLinearGradient(0, dy0, 0, dy0 + rect.dh);
      sh.addColorStop(0, "rgba(255,250,235,0.10)");
      sh.addColorStop(0.5, "rgba(255,250,235,0)");
      sh.addColorStop(1, "rgba(40,28,12,0.10)");
      g.fillStyle = sh;
      g.fillRect(dx0 - 20, dy0 - 20, rect.dw + 40, rect.dh + 40);
    }

    // 종이결 노이즈(곱하기로 아주 약하게)
    g.globalAlpha = 0.10;
    g.globalCompositeOperation = "multiply";
    const gp = g.createPattern(this._grain, "repeat");
    g.fillStyle = gp;
    g.fillRect(dx0 - 20, dy0 - 20, rect.dw + 40, rect.dh + 40);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    g.restore();

    // --- 4) 잉크 키라인(woodblock 윤곽) ---------------------------------------
    if (L.id !== "bg") {
      this._tracePath(g, pts);
      g.strokeStyle = "rgba(18,14,30,0.28)";
      g.lineWidth = 1.4;
      g.lineJoin = "round";
      g.stroke();
    }

    g.restore();
  }

  // 다각형을 무게중심 기준으로 px만큼 바깥으로 키운다(deckle 테두리용)
  _growPoly(pts, cx, cy, px) {
    if (px <= 0) return pts;
    return pts.map((p) => {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * px, y: p.y + (dy / d) * px };
    });
  }

  _tracePath(g, pts) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    // 살짝 부드러운 모서리(quadratic) — 그래도 다각형 손오림 느낌 유지
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      g.quadraticCurveTo(a.x, a.y, mx, my);
    }
    g.closePath();
  }

  // ==========================================================================
  //  DOWEL — 무대 옆/아래에서 뻗어나와 조각을 잡고 있는 가는 나무 막대
  // ==========================================================================
  _drawDowel(g, L, rect, when) {
    if (!L.dowel || this.dowelVis <= 0.01) return;
    const d = L.dowel;
    const W = this.w, H = this.h;

    // 조각의 무게중심(변위 반영)
    let cx = 0, cy = 0;
    for (const p of L.poly) { const s = this._toScreen(p[0], p[1], rect); cx += s.x; cy += s.y; }
    cx = cx / L.poly.length + L.ox;
    cy = cy / L.poly.length + L.oy;

    // 막대 시작점(무대 가장자리)
    let sx, sy;
    if (d.side === "left")   { sx = -W * 0.02; sy = lerp(rect.dy, rect.dy + rect.dh, d.at); }
    else if (d.side === "right") { sx = W * 1.02; sy = lerp(rect.dy, rect.dy + rect.dh, d.at); }
    else { sx = lerp(rect.dx, rect.dx + rect.dw, d.at); sy = H * 1.02; }  // bottom

    // 부착점: 무게중심에서 무대 진입 방향(시작점) 쪽으로 당겨, 막대가 조각의
    // "가장자리/뒷면"을 잡고 있는 듯이. (중앙 관통 느낌 방지)
    const tx0 = sx - cx, ty0 = sy - cy;
    const tm = Math.hypot(tx0, ty0) || 1;
    cx += (tx0 / tm) * Math.min(this.w, this.h) * 0.05 * L.depth;
    cy += (ty0 / tm) * Math.min(this.w, this.h) * 0.05 * L.depth;

    // 막대 끝(부착점) — 조각과 함께 움직임
    const ex = cx, ey = cy;

    const a = this.dowelVis;
    g.save();
    g.lineCap = "round";

    // 막대 그림자
    g.strokeStyle = `rgba(30,18,6,${0.22 * a * this.depthAmt})`;
    g.lineWidth = Math.max(3, Math.min(W, H) * 0.012);
    g.beginPath(); g.moveTo(sx + 4, sy + 5); g.lineTo(ex + 4, ey + 5); g.stroke();

    // 막대 본체
    const grad = g.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, DOWEL);
    grad.addColorStop(0.5, DOWEL_HI);
    grad.addColorStop(1, DOWEL);
    g.strokeStyle = grad;
    g.globalAlpha = a;
    g.lineWidth = Math.max(2.4, Math.min(W, H) * 0.0095);
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();

    // 막대 하이라이트(가는 결)
    g.strokeStyle = "rgba(255,228,180,0.5)";
    g.lineWidth = Math.max(0.8, Math.min(W, H) * 0.0028);
    g.beginPath(); g.moveTo(sx, sy - 1.5); g.lineTo(ex, ey - 1.5); g.stroke();

    // 부착 핀(조각과 막대가 만나는 못/접착점)
    g.fillStyle = "rgba(60,40,18,0.9)";
    g.beginPath(); g.arc(ex, ey, Math.max(2.5, Math.min(W, H) * 0.006), 0, TAU); g.fill();
    g.fillStyle = "rgba(255,230,180,0.7)";
    g.beginPath(); g.arc(ex - 1, ey - 1, Math.max(1, Math.min(W, H) * 0.0022), 0, TAU); g.fill();

    g.restore();
  }

  // ==========================================================================
  //  CONTROLS
  // ==========================================================================
  controls(host) {
    host.appendChild(slider("흔들림 (sway)", 0, 2.2, this.swayAmt, 0.05, (v) => (this.swayAmt = v)));
    host.appendChild(slider("막대기 (rod)", 0, 1, this.dowelVis, 0.05, (v) => (this.dowelVis = v),
      (v) => `${Math.round(v * 100)}%`));
    host.appendChild(slider("깊이/조명 (depth)", 0.2, 1.6, this.depthAmt, 0.05, (v) => (this.depthAmt = v)));
    host.appendChild(buttonRow([
      { label: "잔잔하게 (calm)", on: () => { this.calm = 0.1; this.surge = 0; } },
      { label: "크게 출렁 (surge)", on: () => { this.surge = 1.2; this.calm = 1; } },
    ]));
  }

  teardown() {
    this.img = null;
    this.layers = null;
    this._grain = null;
  }
}
