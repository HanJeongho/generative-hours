// ============================================================================
//  89 · 초롱불을 켜는 손 (After 신윤복 — 月下情人 / 월하정인)
//  ── XII 「Ink & Moon — 먹과 달」 (wing: hanguk)
//
//  신윤복의 〈월하정인〉은 초승달이 걸린 담모퉁이에서 쓰개치마를 쓴 여인과
//  초롱불을 든 선비가 마주 선 밤의 정경이다. 원작 화제는 이렇게 적힌다 —
//  「月沈沈夜三更 兩人心事兩人知」 달은 깊어 삼경인데, 두 사람 마음은 둘만이 안다.
//
//  이 작품은 원작을 훼손하지 않고, 그 밤에 '불을 켜는 시간'을 관람객의 손에
//  맡긴다. 원작 위에 은은한 청묵(靑墨) 그레이딩이 밤을 드리우고, 초승달 자리엔
//  상시 아주 옅은 달무리가 걸려 있다. 화면을 어디든 꾹 누르고 있으면 0~2.5초에
//  걸쳐 초롱불이 서서히 차오른다 — 초롱 몸통이 주황으로 발광하며 심지가 깜빡이고,
//  그 빛 웅덩이가 두 사람과 담벼락에 번지며 밤 그레이딩이 그 반경만큼 걷힌다.
//  불이 무르익으면(warmth 후반부) 여인과 선비의 볼에 발그스레한 홍조가 수줍게
//  스민다. 손을 놓으면 불은 3초에 걸쳐 천천히 사그라들고 홍조도 잦아든다.
//  빛은 오직 초롱불 하나 — 다른 광원은 없다.
//
//  · 모든 연출은 원작 픽셀 위에 곱(multiply)·가산(lighter) 합성으로만 얹는다.
//  · 밤 그레이딩 = 초롱 중심 방사 그라데이션의 곱하기 한 장. 중심 stop을 warmth로
//    들어 올려(neutral로) '불빛 반경만 밤이 걷히는' 효과를 단일 패스로 낸다.
//  · 초롱 발광/빛 웅덩이/홍조 = 전부 가산 방사 그라데이션.
//    플리커는 value-noise 한 번 샘플.
// ============================================================================

import { Piece, clamp, lerp, makeNoise } from "../engine.js";

const IMG_SRC = "assets/art/wolha.jpg";
const IMG_W = 1400, IMG_H = 1200;         // 원본 픽셀 크기 (신윤복 〈월하정인〉)

// ── 이미지 비율(0..1) 좌표 — 시각 캘리브레이션용 상수(중앙에서 조정 가능) ──────
const LANTERN = { u: 0.865, v: 0.655, r: 0.035 };   // 초롱불 위치·몸통 반경
const CHEEK_W = { u: 0.695, v: 0.445 };             // 여인 볼
const CHEEK_M = { u: 0.855, v: 0.335 };             // 남자 볼
const MOON    = { u: 0.27,  v: 0.21 };              // 초승달

// ── 타이밍 ───────────────────────────────────────────────────────────────────
const RISE_SEC = 2.5;                     // 꾹 누름 → 완전 점등까지
const FALL_SEC = 3.0;                     // 손 놓음 → 완전 소등까지
const BLUSH_ONSET = 0.55;                 // warmth 이 지점부터 홍조가 번지기 시작

// ── 밤 그레이딩(곱하기) — 은은한 청묵 ────────────────────────────────────────
const NIGHT = [176, 187, 214];            // multiply 색(≈0.72 어둡힘, 살짝 푸르게)
const LIFT  = [252, 246, 236];            // 불빛 중심에서 밤이 걷힌 뒤의 색(따뜻한 중립)

const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export default class Wolha extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();

    this.warmth = 0;      // 초롱불 게이지 [0..1] — 꾹 누름에 따라 차오르고 사그라듦

    this.ready = false;
    this.failed = false;
    this.img = new Image();
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.failed = true; };
    this.img.src = IMG_SRC;
  }

  // 원작을 화면 안에 contain(여백 포함)으로 배치 — 그림 전체가 액자처럼 보이게.
  _coverRect() {
    const s = Math.min(this.w / IMG_W, this.h / IMG_H) * 0.92;
    const dw = IMG_W * s, dh = IMG_H * s;
    return { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw, dh };
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

    // 꾹 누름 게이지: 누르는 동안 차오르고, 놓으면 사그라듦
    if (this.pointer.down) this.warmth = Math.min(1, this.warmth + dts / RISE_SEC);
    else this.warmth = Math.max(0, this.warmth - dts / FALL_SEC);
    const w = this.warmth;

    // 초롱·달·볼의 화면 좌표(cover 반영)
    const lx = rect.dx + LANTERN.u * rect.dw, ly = rect.dy + LANTERN.v * rect.dh;
    const mx = rect.dx + MOON.u * rect.dw,    my = rect.dy + MOON.v * rect.dh;
    const maxD = Math.max(W, H);
    const bodyR = rect.dw * LANTERN.r;                 // 초롱 몸통 반경
    const poolR = maxD * (0.05 + w * 0.42);            // 빛 웅덩이 반경(warmth로 성장)

    // 1) 원작(또는 폴백)
    g.fillStyle = "#0a0910";
    g.fillRect(0, 0, W, H);
    if (this.ready) g.drawImage(this.img, 0, 0, IMG_W, IMG_H, rect.dx, rect.dy, rect.dw, rect.dh);
    else this._drawFallback(g, t);

    // 2) 밤의 청묵 그레이딩(곱하기) — 초롱 반경만 걷힘.
    //    중심 stop을 warmth로 NIGHT→LIFT 들어 올려, 불빛 웅덩이 안에서만 밤이 옅어진다.
    g.globalCompositeOperation = "multiply";
    const cr = lerp(NIGHT[0], LIFT[0], w), cg = lerp(NIGHT[1], LIFT[1], w), cb = lerp(NIGHT[2], LIFT[2], w);
    const grad = g.createRadialGradient(lx, ly, 0, lx, ly, poolR);
    grad.addColorStop(0, `rgb(${cr | 0},${cg | 0},${cb | 0})`);
    grad.addColorStop(1, `rgb(${NIGHT[0]},${NIGHT[1]},${NIGHT[2]})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    // ── 이하 전부 가산 합성(lighter) ─────────────────────────────────────────
    g.globalCompositeOperation = "lighter";

    // 3) 상시 달무리 — 초승달 자리에 아주 은은하게(밤에도 옅게 걸려 있음)
    const moonR = maxD * 0.16;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, moonR);
    mg.addColorStop(0, "rgba(196,212,248,0.12)");
    mg.addColorStop(0.5, "rgba(180,198,240,0.05)");
    mg.addColorStop(1, "rgba(180,198,240,0)");
    g.fillStyle = mg;
    g.fillRect(0, 0, W, H);

    if (w > 0.001) {
      // 심지 깜빡임 — value-noise 한 번 샘플(핫루프 무할당)
      const flick = 0.86 + 0.14 * this.noise(t * 7.3, 4.2);

      // 4) 빛 웅덩이 — 초롱 중심에서 두 사람·담벼락으로 번지며 거리 감쇠
      const pg = g.createRadialGradient(lx, ly, bodyR * 0.5, lx, ly, poolR);
      pg.addColorStop(0, `rgba(255,183,96,${0.42 * w * flick})`);
      pg.addColorStop(0.35, `rgba(255,152,74,${0.22 * w})`);
      pg.addColorStop(1, "rgba(255,120,50,0)");
      g.fillStyle = pg;
      g.fillRect(0, 0, W, H);

      // 5) 초롱 몸통 발광 — 작고 뜨거운 코어 + 심지 플리커
      const glowR = bodyR * (2.6 + 0.5 * w) * flick;
      const lg = g.createRadialGradient(lx, ly, 0, lx, ly, glowR);
      lg.addColorStop(0, `rgba(255,240,196,${(0.55 + 0.35 * w) * w * flick})`);
      lg.addColorStop(0.45, `rgba(255,176,86,${0.5 * w * flick})`);
      lg.addColorStop(1, "rgba(255,140,60,0)");
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);

      // 6) 볼 홍조 — warmth 후반부에 수줍게 등장(작은 장미빛 라디얼 2개)
      const blush = smooth01((w - BLUSH_ONSET) / (1 - BLUSH_ONSET));
      if (blush > 0.001) {
        const br = rect.dw * 0.05;
        this._blush(g, rect.dx + CHEEK_W.u * rect.dw, rect.dy + CHEEK_W.v * rect.dh, br, blush * flick);
        this._blush(g, rect.dx + CHEEK_M.u * rect.dw, rect.dy + CHEEK_M.v * rect.dh, br, blush * flick);
      }
    }

    g.globalCompositeOperation = "source-over";

    // 8) 은은한 비네팅 + 하단 화제/안내
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.34, W * 0.5, H * 0.55, maxD * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(6,6,14,0.42)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    this._caption(g, W, H);

    if (!this.ready) {
      g.fillStyle = "rgba(250,246,236,0.9)";
      g.font = `600 ${Math.max(13, Math.min(W, H) * 0.026)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(this.failed ? "원작 이미지를 불러오지 못했습니다 — 먹 그림으로 대체" : "월하정인을 불러오는 중…", W * 0.5, H * 0.5);
      g.textAlign = "start"; g.textBaseline = "alphabetic";
    }
  }

  // ── 볼 홍조: 작은 장미빛 가산 라디얼(은은히) ─────────────────────────────────
  _blush(g, x, y, r, a) {
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, `rgba(255,138,132,${0.28 * a})`);
    bg.addColorStop(0.6, `rgba(240,110,110,${0.12 * a})`);
    bg.addColorStop(1, "rgba(230,100,100,0)");
    g.fillStyle = bg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ── 하단 화제 + 꾹 누르기 안내 ──────────────────────────────────────────────
  _caption(g, W, H) {
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    const base = H - Math.max(30, H * 0.06);
    g.fillStyle = "rgba(236,232,224,0.82)";
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.02)}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText("月沈沈夜三更 兩人心事兩人知 — 달은 깊어 삼경인데, 두 사람 마음은 둘만이 안다.", W * 0.5, base);
    g.fillStyle = "rgba(255,196,120,0.7)";
    g.font = `500 ${Math.max(11, Math.min(W, H) * 0.017)}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText("화면을 꾹 누르고 있으면 초롱불이 서서히 켜집니다.", W * 0.5, base + Math.max(18, H * 0.032));
    g.textAlign = "start";
  }

  // ── 폴백: 원작 로드 전/실패 시 절차적 밤(인터랙션 유지) ──────────────────────
  _drawFallback(g, t) {
    const W = this.w, H = this.h;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#151626"); sky.addColorStop(0.6, "#1b1a24"); sky.addColorStop(1, "#0c0b12");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 담벼락
    g.fillStyle = "#24222a";
    g.fillRect(0, H * 0.55, W, H * 0.45);
    // 초승달
    const mx = MOON.u * W, my = MOON.v * H, mr = Math.min(W, H) * 0.05;
    g.fillStyle = "rgba(228,232,246,0.85)";
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1b1a24";
    g.beginPath(); g.arc(mx + mr * 0.5, my - mr * 0.3, mr, 0, Math.PI * 2); g.fill();
  }

  teardown() {
    this.img = null;
  }
}
