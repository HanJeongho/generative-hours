// ============================================================================
//  74 · One More Time (한 번 더 — 마지막인 줄 몰랐던) — wing "time" [Canvas2D]
//  '한 번 더'가 마지막이 되는 날을, 우리는 알아채지 못한다.
//  · 아이를 번쩍 안아 올린 마지막 날, 할머니 집에서 잔 마지막 밤. 그 놀이에도
//    분명 마지막 한 번이 있었지만 아무도 그날을 알아채지 못했다.
//  · 관람객은 손짓으로 몇 번이고 방울을 불 수 있어 무한해 보인다. 그러나 오늘
//    허락된 방울 수는 오늘 날짜로 시드되어 유한하고(하루 100~200개), 마지막
//    방울은 아무 예고도 없이 여느 것처럼 평범하게 톡 터진다. 그 뒤론 빈 공기뿐.
//  · 남은 개수는 절대 표시하지 않는다. 자정에 리셋. 소진량은 localStorage 기억.
//  구현: 방울=반투명 원 + 얇은 무지개 림(청록·자홍·금 회전 그라디언트) +
//    스페큘러 점 + 소프트 글로우. 상승=부력+사인 흔들림 → 정점서 감속·정지 →
//    소리 없이 파열 → 미세 물방울 파티클. 마지막 방울에 어떤 특별한 연출도 없다.
//  인터랙션: 클릭·드래그 = 입김(손짓 따라 방울 무리 피어오름). 오늘 방울을 다
//    불면 아무리 불어도 빈 공기뿐 — 하단에 아주 작게 안내가 뜬다. 슬라이더 없음.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";

export default class OneMoreTime extends Piece {
  setup() {
    this.bubbles = [];
    for (let i = 0; i < 260; i++) this.bubbles.push({ on: false });
    this.drops = [];
    for (let i = 0; i < 1100; i++) this.drops.push({ on: false });
    // 짙은 남색 공기 속 먼지 모트 (물질감)
    this.motes = [];
    for (let i = 0; i < 30; i++) this.motes.push({
      x: Math.random() * this.w, y: Math.random() * this.h,
      r: rand(0.4, 1.6), sp: rand(3, 11), ph: rand(0, TAU),
    });
    this.emitT = 0;
    this.checkT = 0;
    this._loadDay();
  }

  // ---- 오늘의 유한한 방울 수 (날짜 해시 시드) + 소진량 기억 --------------------
  _todayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  _hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  _loadDay() {
    const key = this._todayKey();
    this.budget = 100 + (this._hash(key) % 101);   // 오늘만의 100~200개
    this.used = 0;
    this.dayKey = key;
    try {
      if (localStorage.getItem("gh74-date") === key) {
        this.used = parseInt(localStorage.getItem("gh74-used") || "0", 10) || 0;
      } else {
        localStorage.setItem("gh74-date", key);
        localStorage.setItem("gh74-used", "0");
      }
    } catch (e) { /* localStorage 실패는 무해화 — 그날 안에서만 유한 */ }
  }
  _save() { try { localStorage.setItem("gh74-date", this.dayKey); localStorage.setItem("gh74-used", String(this.used)); } catch (e) { } }

  _free(pool) { for (let i = 0; i < pool.length; i++) if (!pool[i].on) return pool[i]; return null; }

  // ---- 입김: 손짓 따라 방울이 피어오른다 (유한하지만 무한해 보인다) -----------
  onPointerDown() { this.emitT = 0; this._blow(this.pointer.x, this.pointer.y, 2 + (Math.random() * 2 | 0)); }
  _blow(x, y, n) {
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (this.used >= this.budget) break;           // 오늘 몫이 끝나면 빈 공기
      const b = this._free(this.bubbles);
      if (!b) break;
      this.used++; spawned++;
      const r = rand(9, 26);
      b.on = true;
      b.x0 = x + rand(-15, 15);
      b.x = b.x0; b.y = y + rand(-6, 12);
      b.r = r;
      b.vy = -rand(14, 26);
      b.accel = rand(18, 30);
      b.vmax = rand(46, 70) * (20 / (r + 8));         // 큰 방울은 더 느리게
      b.peakY = Math.max(this.h * 0.06, b.y - rand(this.h * 0.22, this.h * 0.6));
      b.wobF = rand(0.8, 1.8); b.wobPh = rand(0, TAU); b.wobA = rand(6, 16);
      b.drift = rand(-9, 9);
      b.age = 0; b.hover = 0;
      b.spin = rand(0, TAU);
    }
    if (spawned) this._save();
  }

  _pop(b) {
    const n = clamp(Math.round(b.r * 0.95), 8, 22);
    for (let i = 0; i < n; i++) {
      const d = this._free(this.drops);
      if (!d) break;
      const a = rand(0, TAU), sp = rand(18, 92);
      d.on = true;
      d.x = b.x + Math.cos(a) * b.r * 0.5;
      d.y = b.y + Math.sin(a) * b.r * 0.5;
      d.vx = Math.cos(a) * sp;
      d.vy = Math.sin(a) * sp - rand(0, 34);
      d.life = rand(0.35, 0.85); d.max = d.life;
      d.r = rand(0.8, 1.9);
    }
    b.on = false;
  }

  frame(dt, t) {
    const g = this.ctx2d();
    const W = this.w, H = this.h;

    // 자정 리셋
    this.checkT += dt;
    if (this.checkT > 1) { this.checkT = 0; if (this._todayKey() !== this.dayKey) this._loadDay(); }

    // 드래그하는 동안 방울 무리가 이어서 피어오른다
    if (this.pointer.down && this.pointer.active) {
      this.emitT -= dt;
      if (this.emitT <= 0) { this.emitT = 0.11; this._blow(this.pointer.x, this.pointer.y, 1); }
    }

    const exhausted = this.used >= this.budget;

    // =========================== 배경: 해질 무렵 공기 =========================
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#06080f");
    sky.addColorStop(0.55, "#0a0f20");
    sky.addColorStop(1, "#12182e");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const dusk = g.createRadialGradient(W * 0.5, H * 1.08, 0, W * 0.5, H * 1.08, H * 0.9);
    dusk.addColorStop(0, "rgba(150,86,96,0.16)");
    dusk.addColorStop(1, "rgba(150,86,96,0)");
    g.fillStyle = dusk; g.fillRect(0, 0, W, H);

    // 떠도는 먼지 모트
    g.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      m.y -= m.sp * dt;
      m.x += Math.sin(t * 0.3 + m.ph) * 4 * dt;
      if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      g.fillStyle = `rgba(150,175,210,${0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t + m.ph))})`;
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // =============================== 방울 =====================================
    for (const b of this.bubbles) {
      if (!b.on) continue;
      b.age += dt;
      if (b.y > b.peakY) {                            // 정점까지 상승 (부력)
        b.vy -= b.accel * dt;
        if (b.vy < -b.vmax) b.vy = -b.vmax;
      } else {                                        // 정점: 감속하며 멈칫
        b.vy *= Math.exp(-dt * 2.4);
        b.hover += dt;
        if (Math.random() < (0.75 + b.hover * 1.6) * dt) { this._pop(b); continue; }
      }
      b.y += b.vy * dt;
      b.x0 += b.drift * dt;
      b.x = b.x0 + Math.sin(b.age * b.wobF + b.wobPh) * b.wobA;
      b.spin += dt * 0.5;
      if (b.y < -b.r) { this._pop(b); continue; }

      const fade = clamp(b.age / 0.3, 0, 1);
      const x = b.x, y = b.y, r = b.r;

      // 소프트 글로우 헤일로
      g.globalCompositeOperation = "lighter";
      const hg = g.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
      hg.addColorStop(0, `rgba(150,200,235,${0.11 * fade})`);
      hg.addColorStop(1, "rgba(150,200,235,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
      g.globalCompositeOperation = "source-over";

      // 얇은 막 (반투명 유리)
      const bg = g.createRadialGradient(x - r * 0.32, y - r * 0.36, r * 0.08, x, y, r);
      bg.addColorStop(0, `rgba(222,236,255,${0.10 * fade})`);
      bg.addColorStop(0.72, `rgba(150,180,220,${0.05 * fade})`);
      bg.addColorStop(1, `rgba(205,222,255,${0.16 * fade})`);
      g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();

      // 기름막 무지개 림 (청록·자홍·금 회전 그라디언트)
      const A = 0.55 * fade;
      g.lineWidth = Math.max(1.3, r * 0.14);
      if (g.createConicGradient) {
        const cg = g.createConicGradient(b.spin, x, y);
        cg.addColorStop(0.00, `rgba(90,225,220,${A})`);
        cg.addColorStop(0.28, `rgba(232,120,222,${A})`);
        cg.addColorStop(0.52, `rgba(242,208,120,${A})`);
        cg.addColorStop(0.76, `rgba(120,182,242,${A})`);
        cg.addColorStop(1.00, `rgba(90,225,220,${A})`);
        g.strokeStyle = cg;
      } else {
        g.strokeStyle = `rgba(190,220,240,${A})`;
      }
      g.beginPath(); g.arc(x, y, r - g.lineWidth * 0.4, 0, TAU); g.stroke();

      // 스페큘러 점 (빛 반사)
      g.fillStyle = `rgba(255,255,255,${0.85 * fade})`;
      g.beginPath(); g.arc(x - r * 0.34, y - r * 0.38, Math.max(1, r * 0.13), 0, TAU); g.fill();
    }

    // ============================ 흩어진 물방울 ================================
    g.globalCompositeOperation = "lighter";
    for (const d of this.drops) {
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) { d.on = false; continue; }
      d.vy += 140 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const k = d.life / d.max;
      g.fillStyle = `rgba(200,228,248,${0.75 * k})`;
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // 입김 자리의 은은한 빛
    if (this.pointer.down && this.pointer.active && !exhausted) {
      const pg = g.createRadialGradient(this.pointer.x, this.pointer.y, 0, this.pointer.x, this.pointer.y, 46);
      pg.addColorStop(0, "rgba(160,205,235,0.10)");
      pg.addColorStop(1, "rgba(160,205,235,0)");
      g.fillStyle = pg; g.beginPath(); g.arc(this.pointer.x, this.pointer.y, 46, 0, TAU); g.fill();
    }

    // =============================== 캡션 =====================================
    g.font = `500 ${Math.max(11, H * 0.017)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    if (exhausted) {
      g.fillStyle = "rgba(150,165,195,0.42)";
      g.fillText("오늘의 방울을 모두 불었습니다. 내일 다시.", W / 2, H - 15);
    } else {
      g.fillStyle = "rgba(175,190,220,0.34)";
      g.fillText("한 번 더 — 그 마지막을, 우리는 알아채지 못한다", W / 2, H - 15);
    }

    // 비네트
    const vg = g.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.34, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
