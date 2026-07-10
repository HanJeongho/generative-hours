// ============================================================================
//  72 · Alight (손을 펴야, 지금이 내려앉는다) — wing "time" [Canvas2D]
//  지금은 쥐려 할수록 달아나고, 손을 펴야 내려앉는다.
//  · 화면엔 단 하나의 섬세한 빛 알갱이 = '진짜 지금'. 그 쉼자리(anchor)는
//    실제 시계가 분(分)으로 읽히는 느린 궤적을 따라 한 시간에 한 바퀴 표류한다
//    — 좇지 않는 한, 지금은 제 시계의 길 위에 조용히 있다(=작동하는 시계).
//  · 당신은 손끝의 부드러운 발광(포인터). 좇으면(빠르게·가까이) 알갱이는 딱
//    그만큼 달아난다 — 반발력 ∝ 포인터 속도 × 근접. 좇는 내내 화면은 서늘하게
//    탈색되고 파르르 떨리며(셰이크·고주파 지터), 결은 어둑해진다.
//  · 유일하게 통하는 건 애쓰기를 그만두는 것. 가만히, 손을 펴 오게 두면
//    (포인터 속도≈0 & 근접) 알갱이가 느려지다 발광 위로 스프링 안착하고 —
//    그 순간 따뜻한 빛이 화면을 가득 채우는 큰 블룸으로 만개하며, 그 광휘 안에
//    지금 시각(HH:MM)이 또렷이 뜬다. 다시 잡으려 손을 뻗으면 곧바로 날아오른다.
//  구현: 알갱이=임계감쇠 스프링(타깃은 평소 anchor, 안착할수록 포인터로 lerp).
//  반발·탈색·셰이크는 전부 하나의 chase 강도에서 파생(속도×근접)이라, 손이
//  멈추면 저절로 0이 된다 — 그만두는 순간 스프링이 이긴다. 먼지 결은 프리베이크
//  스프라이트 풀(무할당 핫루프), 텍스트·벌칙 없이 몸으로 깨닫는 구조.
// ============================================================================

import { Piece, clamp, lerp, makeNoise, TAU } from "../engine.js";

const TRAIL = 26;
const REPEL_K = 165;     // 반발 계수 (chase = 속도×근접 에 곱)
const SETTLE_UP = 0.95;  // 가만히 있을 때 안착까지(초)
const SETTLE_DN = 0.20;  // 손을 뻗으면 풀리는 시간(초) — 곧바로 날아오름
const STILL = 1.7;       // '멈춤' 판정 (px/frame, 엔진이 매 프레임 0.85 감쇠)

export default class Alight extends Piece {
  setup() {
    this.noise = makeNoise();
    this.settle = 0;      // 0..1 안착 진행
    this.bloom = 0;       // 만개 광휘 (settle 추종, 부드럽게)
    this.agit = 0;        // 좇음 격동 (셰이크·탈색·지터)
    this.grab = 0;        // 움켜쥠 순간의 놀람 (0으로 감쇠)
    this.grain = { x: 0, y: 0, vx: 0, vy: 0 };
    this.anchor = { x: 0, y: 0 };
    this.trail = new Float32Array(TRAIL * 2);
    this.trailHead = 0; this.trailN = 0;

    // 프리베이크 소프트 스프라이트 (핫루프 무할당)
    this.spWarm = this._soft(64, [[0, "rgba(255,201,120,0.95)"], [0.4, "rgba(255,160,72,0.5)"], [1, "rgba(255,140,60,0)"]]);
    this.spCold = this._soft(64, [[0, "rgba(184,208,236,0.82)"], [0.5, "rgba(150,176,210,0.34)"], [1, "rgba(150,176,210,0)"]]);
    this.spCore = this._soft(48, [[0, "rgba(255,246,228,1)"], [0.35, "rgba(255,222,162,0.72)"], [1, "rgba(255,200,120,0)"]]);
    this.spBloom = this._soft(256, [[0, "rgba(255,206,142,0.92)"], [0.3, "rgba(255,176,96,0.5)"], [0.7, "rgba(255,150,70,0.16)"], [1, "rgba(255,150,70,0)"]]);

    this._layout();
    this._seedMotes();
    // 알갱이를 제 시계 자리에서 시작
    this.grain.x = this.anchor.x; this.grain.y = this.anchor.y;
  }
  onResize() { this._layout(); this._seedMotes(); }

  // 움켜쥐려는 손짓 그 자체가 밀어낸다 — 잡으려 뻗으면 곧바로 날아오른다
  onPointerDown() {
    const p = this.pointer, gr = this.grain;
    const dx = gr.x - p.x, dy = gr.y - p.y;
    const dist = Math.hypot(dx, dy) + 1e-4;
    const prox = clamp(1 - dist / this.nearR, 0, 1);
    if (prox <= 0) return;
    const imp = 520 * prox;
    gr.vx += (dx / dist) * imp;
    gr.vy += (dy / dist) * imp;
    this.settle = 0;
    this.grab = 1;
  }

  _layout() {
    const m = Math.min(this.w, this.h);
    this.nearR = m * 0.26;      // '곁' 반경 — 여기서 가만히 있으면 온다
    this.repelR = m * 0.31;     // 반발 사정거리
    this.cx = this.w / 2; this.cy = this.h * 0.5;
    this.rx = this.w * 0.32; this.ry = this.h * 0.24;
    this._updateAnchor(new Date());
  }

  // 시계의 쉼자리: 한 시간에 한 바퀴 도는 느린 표류 궤적 (위치 = 분)
  _updateAnchor(d) {
    const tmin = (d.getMinutes() + (d.getSeconds() + d.getMilliseconds() / 1000) / 60) / 60; // 0..1
    const a = tmin * TAU;
    this.anchor.x = this.cx + Math.cos(a) * this.rx * (0.62 + 0.38 * Math.sin(a * 2));
    this.anchor.y = this.cy + Math.sin(a) * this.ry * (0.62 + 0.38 * Math.cos(a * 3));
  }

  _seedMotes() {
    const n = Math.round(clamp(this.w * this.h / 9000, 70, 170));
    this.motes = this.motes || [];
    this.motes.length = 0;
    for (let i = 0; i < n; i++) {
      const bx = Math.random() * this.w, by = Math.random() * this.h;
      this.motes.push({
        bx, by, x: bx, y: by,
        phase: Math.random() * TAU, spd: 0.05 + Math.random() * 0.14,
        amp: 6 + Math.random() * 22, r: 4 + Math.random() * 9, a: 0.25 + Math.random() * 0.6,
      });
    }
  }

  _soft(size, stops) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d"); const r = size / 2;
    const gr = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
    return c;
  }
  _blit(g, sp, x, y, size, alpha) {
    if (alpha <= 0.003) return;
    g.globalAlpha = alpha;
    g.drawImage(sp, x - size / 2, y - size / 2, size, size);
  }

  frame(dt, t) {
    const g = this.ctx2d();
    const W = this.w, H = this.h;
    const d = new Date();
    this._updateAnchor(d);

    const p = this.pointer;
    const gr = this.grain, an = this.anchor;
    const dx = gr.x - p.x, dy = gr.y - p.y;
    const dist = Math.hypot(dx, dy) + 1e-4;
    const spd = p.active ? Math.hypot(p.vx, p.vy) : 0;          // px/frame (엔진 감쇠)
    const prox = clamp(1 - dist / this.repelR, 0, 1);
    const near = dist < this.nearR;

    // ---- 안착 엔벨로프: 가만히 & 곁에 있을 때만 자란다 --------------------
    if (p.active && near && spd < STILL) this.settle += dt / SETTLE_UP;
    else this.settle -= dt / SETTLE_DN;
    this.settle = clamp(this.settle, 0, 1);
    this.grab = Math.max(0, this.grab - dt * 3.2);
    const s = this.settle;
    const ease = s * s * (3 - 2 * s);

    // 블룸은 settle을 부드럽게 추종(피어날 땐 조금 느긋하게)
    const bTarget = ease;
    this.bloom += (bTarget - this.bloom) * Math.min(1, dt * (bTarget > this.bloom ? 5.5 : 3));

    // ---- 알갱이 물리: 스프링(타깃=anchor→포인터) + 반발 -------------------
    const tx = lerp(an.x, p.x, ease * 0.96);
    const ty = lerp(an.y, p.y, ease * 0.96);
    const spring = 40 + ease * 95;
    const damp = 8 + ease * 7;
    let ax = (tx - gr.x) * spring - gr.vx * damp;
    let ay = (ty - gr.y) * spring - gr.vy * damp;

    // 좇음: 속도×근접 만큼 딱 그만큼 달아난다 (안착 중엔 사라짐)
    const chase = spd * prox * (1 - ease);
    if (p.active) {
      const f = chase * REPEL_K;
      ax += (dx / dist) * f;
      ay += (dy / dist) * f;
    }
    // 유휴 숨결 — 좇지 않을 때 알갱이가 살아 표류
    if (ease < 0.6) {
      const nz = this.noise(gr.x * 0.0028, gr.y * 0.0028 + t * 0.05);
      ax += Math.cos(nz * TAU) * 46 * (1 - ease);
      ay += Math.sin(nz * TAU) * 46 * (1 - ease);
    }
    gr.vx += ax * dt; gr.vy += ay * dt;
    gr.x += gr.vx * dt; gr.y += gr.vy * dt;
    // 부드러운 화면 가둠
    const mg = 24;
    if (gr.x < mg) { gr.x = mg; if (gr.vx < 0) gr.vx *= -0.4; }
    if (gr.x > W - mg) { gr.x = W - mg; if (gr.vx > 0) gr.vx *= -0.4; }
    if (gr.y < mg) { gr.y = mg; if (gr.vy < 0) gr.vy *= -0.4; }
    if (gr.y > H - mg) { gr.y = H - mg; if (gr.vy > 0) gr.vy *= -0.4; }

    // 격동(셰이크·탈색·지터) — 좇음에서 파생, 손 멈추면 저절로 0
    const chaseInst = clamp((spd * prox) / 24, 0, 1) * (1 - ease);
    this.agit += (chaseInst - this.agit) * Math.min(1, dt * 7);
    const agit = clamp(this.agit + this.grab * 0.55, 0, 1), bloom = this.bloom;

    // 궤적 기록
    this.trail[this.trailHead * 2] = gr.x; this.trail[this.trailHead * 2 + 1] = gr.y;
    this.trailHead = (this.trailHead + 1) % TRAIL;
    if (this.trailN < TRAIL) this.trailN++;

    // 먼지 결 표류
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x = m.bx + Math.cos(t * m.spd + m.phase) * m.amp;
      m.y = m.by + Math.sin(t * m.spd * 0.8 + m.phase) * m.amp;
    }

    // =========================== R E N D E R ================================
    // 갤러리 다크톤 바탕
    g.fillStyle = "#0b0d12"; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(W, H) * 0.72);
    bg.addColorStop(0, `rgba(${28 + bloom * 40},${26 + bloom * 26},${34},${0.5})`);
    bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 좇을 때 서늘한 탈색 결
    if (agit > 0.01) { g.fillStyle = `rgba(150,166,192,${agit * 0.055})`; g.fillRect(0, 0, W, H); }

    // 셰이크 — 세계 레이어에만
    const shk = agit * 7;
    const shx = Math.sin(t * 53) * shk + (Math.random() - 0.5) * shk * 0.7;
    const shy = Math.cos(t * 61) * shk * 0.85 + (Math.random() - 0.5) * shk * 0.7;
    g.save();
    g.translate(shx, shy);
    g.globalCompositeOperation = "lighter";

    // 먼지 결 (프리베이크, 차가운 반짝임 + 따뜻한 만개)
    const warmth = clamp(bloom + 0.14, 0, 1);
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const jx = (Math.random() - 0.5) * agit * 3, jy = (Math.random() - 0.5) * agit * 3;
      const sz = m.r * (1 + bloom * 0.7);
      this._blit(g, this.spWarm, m.x + jx, m.y + jy, sz, m.a * (0.16 + bloom * 0.92) * warmth);
      this._blit(g, this.spCold, m.x + jx, m.y + jy, sz * 0.9, m.a * agit * 0.5);
    }

    // 만개 블룸 — 알갱이가 내려앉은 자리에서 화면을 채움
    if (bloom > 0.01) {
      const bs = Math.max(W, H) * (0.8 + bloom * 1.7);
      this._blit(g, this.spBloom, gr.x, gr.y, bs, bloom * 0.92);
      g.globalAlpha = 1;
      g.fillStyle = `rgba(255,192,120,${bloom * 0.10})`; g.fillRect(-shx, -shy, W, H);
    }

    // 궤적 (따뜻한 잔상)
    for (let i = 0; i < this.trailN; i++) {
      const idx = (this.trailHead - 1 - i + TRAIL) % TRAIL;
      const age = i / TRAIL;
      this._blit(g, this.spWarm, this.trail[idx * 2], this.trail[idx * 2 + 1],
        (5 + bloom * 6) * (1 - age), (1 - age) * 0.4 * (0.4 + bloom * 0.9));
    }

    // 가만히 있을 때의 모임 고리 — 텍스트 없는 발견의 실마리
    if (s > 0.02 && s < 0.999) {
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.strokeStyle = `rgba(255,206,150,${0.12 * (0.3 + 0.7 * ease)})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(gr.x, gr.y, lerp(this.nearR * 0.5, 10, ease), 0, TAU);
      g.stroke();
      g.globalCompositeOperation = "lighter";
    }

    // 알갱이 = 지금 (지터는 격동에서)
    const jgx = (Math.random() - 0.5) * agit * 4, jgy = (Math.random() - 0.5) * agit * 4;
    const gx = gr.x + jgx, gy = gr.y + jgy;
    this._blit(g, this.spWarm, gx, gy, 20 + bloom * 34, 0.7 + bloom * 0.3);
    this._blit(g, this.spCore, gx, gy, 12 + bloom * 16, 0.9);
    g.globalAlpha = 1;
    g.fillStyle = "rgba(255,250,238,0.98)";
    g.beginPath(); g.arc(gx, gy, 2 + bloom * 2.4, 0, TAU); g.fill();

    // 손끝 발광 — 차가움→안착할수록 따뜻함
    if (p.active) {
      this._blit(g, this.spCold, p.x, p.y, 30, 0.42 * (1 - ease));
      this._blit(g, this.spWarm, p.x, p.y, 26 + ease * 10, 0.28 + ease * 0.45);
    }

    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.restore();

    // ---- 지금 시각: 광휘 안에 또렷이 ---------------------------------------
    if (bloom > 0.02) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `300 ${Math.max(40, H * 0.135)}px ui-monospace, "SF Mono", Menlo, monospace`;
      g.save();
      g.shadowColor = `rgba(255,180,110,${bloom * 0.9})`; g.shadowBlur = 32 * bloom;
      g.fillStyle = `rgba(255,244,228,${bloom})`;
      g.fillText(`${hh}:${mm}`, this.cx, this.cy - H * 0.02);
      g.restore();
    }

    // ---- 캡션 (철학을 짧게, 상태에 따라) -----------------------------------
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(206,200,188,0.6)";
    const cap = bloom > 0.55 ? "지금이 내려앉았다 — 놓아둔 손 위로"
      : agit > 0.32 ? "좇을수록, 꼭 그만큼 달아난다"
        : "쥐려 하지 말고 — 손을 펴, 오게 두면 내려앉는다";
    g.fillText(cap, W / 2, H - 14);

    // 비네트
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${0.5 + agit * 0.16})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
