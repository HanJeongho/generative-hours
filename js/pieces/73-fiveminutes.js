// ============================================================================
//  73 · Five Minutes Late (너의 5분과 나의 5분) — 시간관 [Canvas2D]
//  같은 5분을 기다리는 사람은 한 시간으로, 늦는 사람은 한순간으로 산다 —
//  둘 다 거짓이 아니다. 이 방에서 유일하게 '다른 사람'이 들어오는 작품.
//  · 검은 벌판 위 두 빛점을 가느다란 빛의 실이 잇는다 — 그 실이 곧 약속.
//    한 끝은 기다림, 다른 끝은 늦음. 관람객은 실 위의 한 걸음(빛의 발)이다.
//  · 전역 timeScale = 실 위 내 위치의 함수. 기다리는 끝으로 다가가면 세계가
//    기어가듯 느려지고(0.15×) 초가 돌처럼 무겁게 내려앉는다. 반대 끝으로
//    건너가면 프레임이 탁 바뀌어 내가 내달리고 세계가 줄무늬로 흐른다(3×).
//  · 기다림 끝 둘레엔 '실초(real second)마다' 창백한 시간-입자가 오프스크린에
//    무겁게 누적된다 — 벽시계 기준이라 내 체감과 무관하게 산더미로 부푼다.
//  · 구석 시계만은 실제 벽시계 시각을 무보정으로 읽는다 — 발산이 눈에 보이게.
//  인터랙션: 실 위를 드래그로 걷는다 · [약속 —지금+5분]으로 진짜 카운트다운 ·
//  아하 — 늦는 자로 내달려 '난 최대한 서둘렀어'를 느낀 직후, 실을 건너
//  기다리는 자로 돌아오면 내가 남기고 온 체감-시간의 산더미가 보인다.
//  구현: 누적은 오프스크린 캔버스 가산 발광(성운), 스트릭·모트·낙하 초는
//  풀 재사용으로 핫루프 무할당. 시드성 없음 — wait 카운트만 localStorage 복원.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { buttonRow } from "./01-currents.js";

const KEY = "gh73-wait";
const STAMP_CAP = 640;              // 성운 스탬프 상한 (그 뒤엔 반짝임만)

export default class FiveMinutes extends Piece {
  setup() {
    this.u = 0.5;                   // 실 위 내 위치 (0=기다림, 1=늦음)
    this.uT = 0.5;                  // 목표 위치 (드래그)
    this.st = 0;                    // scaled sim-time (배속 반영)
    this.q = 0.0;                   // 건너오는 상대의 진행 (0=늦음끝 → 1=기다림끝)
    this.arrive = 0;                // 도착 섬광 엔벨로프
    this.wait = 0;                  // 누적된 기다림 실초
    this.pile = 0;                  // 실제 스탬프 개수
    this.felt = 0;                  // 체감 누적(발산 표시용)
    this._lastSec = Math.floor(Date.now() / 1000);
    this._saveT = 0;
    this.promiseAt = 0;             // 약속 시각(ms), 0=없음
    this._fired = false;

    // 낙하하는 '초' 풀 (돌처럼 내려앉음)
    this.stones = [];
    for (let i = 0; i < 150; i++) this.stones.push({ on: false, x: 0, y: 0, vy: 0, ly: 0, life: 0 });
    // 벌판 먼지 모트 풀 (느리면 점 · 빠르면 줄무늬)
    this.motes = [];
    for (let i = 0; i < 150; i++) this.motes.push({ x: 0, y: 0, z: 0, vx: 0 });
    // 상대의 잔상 링버퍼
    this.tn = 46; this.tx = new Float32Array(this.tn); this.ty = new Float32Array(this.tn); this.th = 0; this._tf = false;

    this._layout();
    this._makeNeb();
    this._seedMotes();
    this._restore();
  }
  teardown() { this._save(true); }
  onResize() { this._layout(); this._makeNeb(); this._seedMotes(); this._restore(); }

  _layout() {
    this.ax = this.w * 0.24; this.ay = this.h * 0.46;   // 기다림 끝 A
    this.bx = this.w * 0.76; this.by = this.h * 0.54;   // 늦음 끝 B
    this.cx = (this.ax + this.bx) / 2;                  // 상대 아치 제어점
    this.cyc = Math.min(this.ay, this.by) - this.h * 0.20;
    this.spread = this.h * 0.11;
  }
  _makeNeb() {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(this.w * this.dpr));
    c.height = Math.max(1, Math.round(this.h * this.dpr));
    this.neb = c; this.ng = c.getContext("2d");
    this.ng.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.pile = 0;
  }
  _seedMotes() {
    for (const m of this.motes) {
      m.x = Math.random() * this.w; m.y = Math.random() * this.h;
      m.z = 0.3 + Math.random() * 0.7; m.vx = -(0.4 + Math.random() * 1.6);
    }
  }

  // ---- 누적 성운 스탬프 -------------------------------------------------------
  _stampAt(x, y) {
    if (this.pile >= STAMP_CAP) return;
    this.pile++;
    const g = this.ng;
    const r = 14 + Math.random() * 16;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, "rgba(168,186,224,0.42)");
    rad.addColorStop(0.5, "rgba(132,150,196,0.14)");
    rad.addColorStop(1, "rgba(120,140,190,0)");
    g.save(); g.globalCompositeOperation = "lighter";
    g.fillStyle = rad; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.restore();
  }
  _moundPoint() {
    // A 주변 봉긋한 무더기 좌표 (개수 따라 완만히 부풂)
    const s = this.spread * (0.65 + Math.sqrt(this.pile) / 24);
    const r = Math.sqrt(Math.random()) * s;
    const a = Math.random() * TAU;
    return [this.ax + Math.cos(a) * r, this.ay + Math.sin(a) * r * 0.55 - Math.sqrt(this.pile) * 0.5];
  }
  _restore() {
    try {
      const v = parseInt(localStorage.getItem(KEY) || "0", 10);
      if (v > 0) this.wait = v;
    } catch (e) { /* noop */ }
    const n = Math.min(this.wait, STAMP_CAP);
    for (let i = 0; i < n; i++) { const [x, y] = this._moundPoint(); this._stampAt(x, y); }
  }
  _save(force) {
    try { localStorage.setItem(KEY, String(this.wait | 0)); } catch (e) { /* noop */ }
    void force;
  }

  _spawnStone() {
    const p = this.stones.find((q) => !q.on);
    if (!p) return;
    p.on = true;
    p.x = this.ax + rand(-this.spread, this.spread);
    p.y = this.ay - this.h * 0.44;
    p.vy = 0; p.life = 1;
    const [lx, ly] = this._moundPoint();
    p.x = lerp(p.x, lx, 0.35); p.ly = ly;
  }

  // ---- 전역 배속: 실 위 위치의 함수 (크로스오버는 급하게) --------------------
  _timeScale() {
    const t = 1 / (1 + Math.exp(-(this.u - 0.5) * 13));   // 급한 시그모이드
    return Math.exp(lerp(Math.log(0.15), Math.log(3.0), t));  // 로그 보간
  }

  onPointerDown() { this._walk(); }
  frame(dt, t) {
    const g = this.ctx2d();
    const W = this.w, H = this.h;

    // 드래그로 실 위를 걷기
    if (this.pointer.down) this._walk();
    this.u += (this.uT - this.u) * clamp(dt * 9, 0, 1);
    const ts = this._timeScale();
    this.st += dt * ts;
    this.felt += dt * ts;

    // 실초 누적 (벽시계, 무보정) — 최대 3초 캐치업
    const now = Date.now();
    const cur = Math.floor(now / 1000);
    if (cur > this._lastSec) {
      let n = Math.min(3, cur - this._lastSec);
      this._lastSec = cur;
      while (n-- > 0) { this.wait++; this._spawnStone(); }
    }
    this._saveT += dt; if (this._saveT > 4) { this._saveT = 0; this._save(); }

    // 약속 카운트다운 도착
    if (this.promiseAt && !this._fired && now >= this.promiseAt) { this._fired = true; this.arrive = 1; }

    // 상대: 늦음끝 → 기다림끝, 속도 ∝ ts
    this.q += ts * dt * (1 / 20);
    if (this.q >= 1) { this.q -= 1; this.arrive = Math.max(this.arrive, 1); }
    this.arrive = Math.max(0, this.arrive - dt * 1.6);
    // 상대 좌표 (2차 베지어) + 잔상 기록
    const q = this.q, iq = 1 - q;
    const rx = iq * iq * this.bx + 2 * iq * q * this.cx + q * q * this.ax;
    const ry = iq * iq * this.by + 2 * iq * q * this.cyc + q * q * this.ay;
    this.tx[this.th] = rx; this.ty[this.th] = ry;
    this.th = (this.th + 1) % this.tn; if (this.th === 0) this._tf = true;

    // 모트 이동 (핫루프 무할당)
    const drift = ts * 40;
    for (const m of this.motes) {
      m.x += m.vx * drift * dt;
      if (m.x < -20) { m.x = W + 20; m.y = Math.random() * H; }
    }

    // ============================ R E N D E R ============================
    g.fillStyle = "#0b0c10"; g.fillRect(0, 0, W, H);
    const pulse = 0.5 + 0.5 * Math.sin(this.st * 1.1);
    const bg = g.createRadialGradient(this.ax, this.ay, 0, this.ax, this.ay, Math.max(W, H) * 0.7);
    bg.addColorStop(0, `rgba(40,52,84,${0.10 + pulse * 0.05})`); bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // 모트: 느리면 점, 빠르면 줄무늬
    const streak = clamp((ts - 0.5) * 22, 0, 120);
    g.strokeStyle = "rgba(150,168,205,0.5)"; g.lineWidth = 1;
    for (const m of this.motes) {
      const a = 0.12 + m.z * 0.22;
      if (streak > 2) {
        g.globalAlpha = a; g.beginPath();
        g.moveTo(m.x, m.y); g.lineTo(m.x + streak * m.z, m.y); g.stroke();
      } else {
        g.globalAlpha = a; g.fillStyle = "rgba(150,168,205,0.6)";
        g.fillRect(m.x, m.y, 1.4, 1.4);
      }
    }
    g.globalAlpha = 1;

    // 성운(기다림 산더미) — 오프스크린 가산 누적
    g.save(); g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.85 + pulse * 0.15;
    g.drawImage(this.neb, 0, 0, W, H);
    g.restore();

    // 낙하하는 초(돌) — ts로 무겁게 내려앉음
    for (const p of this.stones) {
      if (!p.on) continue;
      p.vy += 260 * ts * dt; p.y += p.vy * dt;
      if (p.y >= p.ly) { this._stampAt(p.x, p.ly); p.on = false; continue; }
      const a = clamp(p.life, 0, 1) * 0.8;
      g.fillStyle = `rgba(190,205,235,${a})`;
      g.beginPath(); g.arc(p.x, p.y, 2.6, 0, TAU); g.fill();
      g.strokeStyle = `rgba(150,170,210,${a * 0.4})`;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - Math.min(30, p.vy * 0.05)); g.stroke();
    }

    // 빛의 실 = 약속
    const grad = g.createLinearGradient(this.ax, this.ay, this.bx, this.by);
    grad.addColorStop(0, "rgba(150,180,235,0.85)");
    grad.addColorStop(0.5, `rgba(${lerp(150, 255, this._side()) | 0},180,${lerp(235, 150, this._side()) | 0},0.5)`);
    grad.addColorStop(1, "rgba(255,190,140,0.85)");
    g.strokeStyle = grad; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(this.ax, this.ay); g.lineTo(this.bx, this.by); g.stroke();

    // 두 빛점(끝)
    this._glow(g, this.ax, this.ay, 26, "168,190,235", 0.5 + pulse * 0.2);
    this._glow(g, this.bx, this.by, 20, "255,190,140", 0.6);

    // 상대의 잔상 + 몸통
    g.save(); g.globalCompositeOperation = "lighter";
    let px = rx, py = ry, k = 1;
    for (let i = 1; i < this.tn; i++) {
      const idx = (this.th - 1 - i + this.tn * 2) % this.tn;
      if (!this._tf && idx > this.th) break;
      const x = this.tx[idx], y = this.ty[idx];
      k = 1 - i / this.tn;
      g.strokeStyle = `rgba(210,224,255,${k * 0.35})`; g.lineWidth = 1 + k * 2.2;
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      px = x; py = y;
    }
    g.restore();
    this._glow(g, rx, ry, 12, "220,232,255", 0.9);

    // 도착 섬광
    if (this.arrive > 0) this._glow(g, this.ax, this.ay, 40 + (1 - this.arrive) * 60, "230,240,255", this.arrive * 0.7);

    // 내 위치(빛의 발) — 아우라 색·크기가 배속을 말한다
    const mx = lerp(this.ax, this.bx, this.u), my = lerp(this.ay, this.by, this.u);
    const warm = this._side();
    const cr = lerp(150, 255, warm) | 0, cg = 180, cb = lerp(240, 130, warm) | 0;
    const aur = 18 + ts * 6;
    this._glow(g, mx, my, aur, `${cr},${cg},${cb}`, 0.9);
    g.fillStyle = "#fff"; g.beginPath(); g.arc(mx, my, 3.2, 0, TAU); g.fill();

    // 구석 시계 — 실제 벽시계(무보정)
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    g.font = `600 ${Math.max(13, H * 0.02)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "right"; g.textBaseline = "top";
    g.fillStyle = "rgba(210,220,240,0.7)";
    g.fillText(`${hh}:${mm}:${ss}`, W - 18, 16);
    g.font = `500 ${Math.max(10, H * 0.014)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = "rgba(160,175,210,0.55)";
    g.fillText(`실제 시각 · 무보정 · 체감 ${ts.toFixed(2)}×`, W - 18, 16 + H * 0.026);
    if (this.promiseAt) {
      const left = Math.max(0, this.promiseAt - now);
      const cs = Math.ceil(left / 1000);
      g.fillStyle = left > 0 ? "rgba(255,200,150,0.8)" : "rgba(230,240,255,0.85)";
      g.fillText(left > 0 ? `약속까지 ${String((cs / 60) | 0).padStart(2, "0")}:${String(cs % 60).padStart(2, "0")}` : "약속 시각 — 도착", W - 18, 16 + H * 0.052);
    }

    // 캡션 — 인터랙션이 곧 철학 (지금 서 있는 프레임을 말한다)
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(205,215,238,0.6)";
    let cap;
    if (this.u < 0.4) cap = "기다리는 사람은 5분을 한 시간으로 산다";
    else if (this.u > 0.6) cap = "늦는 사람은 5분을 한순간으로 산다";
    else cap = "같은 5분 — 어느 쪽도 거짓이 아니다";
    g.fillText(cap, W / 2, H - 14);

    // 비네트
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  _side() { return 1 / (1 + Math.exp(-(this.u - 0.5) * 13)); }
  _walk() {
    const dx = this.bx - this.ax, dy = this.by - this.ay;
    const tt = ((this.pointer.x - this.ax) * dx + (this.pointer.y - this.ay) * dy) / (dx * dx + dy * dy);
    this.uT = clamp(tt, 0, 1);
  }
  _glow(g, x, y, r, rgb, a) {
    g.save(); g.globalCompositeOperation = "lighter";
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(${rgb},${a})`);
    rad.addColorStop(0.4, `rgba(${rgb},${a * 0.4})`);
    rad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rad; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.restore();
  }

  controls(host) {
    host.appendChild(buttonRow([
      { label: "약속 — 지금 + 5분", on: () => { this.promiseAt = Date.now() + 300000; this._fired = false; } },
      { label: "기다림 비우기", on: () => { this.wait = 0; this._makeNeb(); this._save(); } },
    ]));
  }
}
