// ============================================================================
//  71 · Downstream (물살은 되돌아오지 않는다) — 보내기 전까지만, 그것은 내 것이다 [Canvas2D]
//  전송 버튼을 누르기 직전과 직후. 후회할 문자, 홧김의 한마디. 반사적으로 손을
//  뻗었지만 이미 늦은 그 1초 — 그것을 물살로 옮긴다.
//  · 한밤의 검은 강. 관람객 바로 앞 수면에 따뜻한 빛 하나가 반영을 드리우며 떠
//    있다 — 아직 보내지 않은 것. 쥐고 머뭇거리는 동안엔 점점 더 따뜻하고 밝게
//    차오른다(가열). 그것이 곧 '보내기 전, 망설이는 시간'이다.
//  · 손을 놓으면(플릭) 물살이 데려간다. 굽이치는 사행 물길을 따라 흘러 저 멀리
//    수평선의 빛 무리에 합류하고 강 끝 너머로 사라진다. 하류엔 내가 보낸 모든
//    순간이 떠 있다.
//  · 되잡으려 손을 뻗으면 — 빛은 커서에서 미끄러져 더 멀어질 뿐 결코 돌아오지
//    않는다(커서 반발력 = 물리적 거부). 손이 빛을 그냥 통과하는 그 1초가 aha.
//    할 수 있는 건 새 빛을 띄우는 일뿐.
//  구현: 아주 느린 단방향 흐름 + 컬-노이즈 사행 이류. 원근으로 좁아지는 강 스파인
//  (근경=넓고 밝음, 수평선=한 점으로 수렴). 글로우=방사형 그라디언트 스프라이트
//  가산합성, 반영=수직으로 늘인 번짐 사본 + 사인파 왜곡 글린트. 수면=수천 입자
//  풀을 흐름장으로 이류(핫루프 무할당). 붙잡기=포인터 캡처+가열, 되잡기=커서에서
//  밀려나는 반발 임펄스(하류로 편향, 절대 근경으로 복귀 안 함).
//  인터랙션: 가까운 물에 손 대기 = 새 빛이 손으로 떠오름 · 쥐고 있기 = 더 밝게
//  가열 · 놓기(플릭) = 물살이 데려감 · 떠난 빛에 손 뻗기 = 미끄러져 멀어짐 ·
//  [새 빛 띄우기] = 유일하게 할 수 있는 일.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU, makeNoise } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const LS_KEY = "gh71-sent";

export default class Downstream extends Piece {
  setup() {
    this.noise = makeNoise();
    this.current = 1.0;                 // 물살 속도 배율
    this.meanderPhase = rand(0, TAU);   // 이 입장의 강 굽이
    this.flowing = [];                  // 흘러가는 빛들
    this.cluster = [];                  // 수평선 빛 무리(보낸 순간들)
    this.held = null;                   // 아직 보내지 않은 빛(또는 null)
    this.grabbing = false;
    this.sinceRelease = 6;              // 시작 시 곧바로 첫 빛이 떠오르게
    this._tmp = { vx: 0, vy: 0 };
    this.captionA = 0;

    this._bakeGlow();
    this._layout();

    // 하류엔 내가 보낸 모든 순간이 떠 있다 — 초기 빛 무리
    let carried = 0;
    try { carried = Math.min(30, parseInt(localStorage.getItem(LS_KEY) || "0", 10) || 0); } catch (e) {}
    const seedN = 16 + carried;
    for (let i = 0; i < seedN; i++) this._seedClusterLight(rand(0.86, 0.995), rand(0.4, 1));

    this._spawnHeld(this.w * 0.5, this.bottomY - (this.bottomY - this.horizonY) * 0.12);
    this.grabbing = false;
  }

  onResize() { this._layout(); }

  _layout() {
    this.horizonY = this.h * 0.27;
    this.bottomY = this.h * 1.04;               // 화면 바로 아래(관람객 앞)
    this.range = this.bottomY - this.horizonY;
    // 원근 수면 입자 풀
    const target = clamp(Math.round(this.w * this.h / 260), 900, 3600);
    if (!this.water) this.water = [];
    if (this.water.length !== target) {
      this.water.length = 0;
      for (let i = 0; i < target; i++) this.water.push(this._newDrop(true));
    }
  }

  // ---- 소프트 글로우 스프라이트(한 번 굽고, 색은 가산 틴트로) --------------------
  _bakeGlow() {
    const S = 128;
    const mk = (stops) => {
      const c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d");
      const rad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      for (const [o, col] of stops) rad.addColorStop(o, col);
      g.fillStyle = rad; g.fillRect(0, 0, S, S);
      return c;
    };
    // 따뜻한 호박빛 헤일로
    this.gWarm = mk([
      [0, "rgba(255,238,205,1)"], [0.16, "rgba(255,205,130,0.92)"],
      [0.42, "rgba(240,150,70,0.34)"], [0.72, "rgba(150,90,50,0.09)"], [1, "rgba(0,0,0,0)"],
    ]);
    // 뜨겁게 가열된 심(쥐고 있을 때)
    this.gHot = mk([
      [0, "rgba(255,252,244,1)"], [0.2, "rgba(255,232,190,0.95)"],
      [0.5, "rgba(255,190,120,0.4)"], [1, "rgba(0,0,0,0)"],
    ]);
    // 차가운 수면 반짝임
    this.gCool = mk([
      [0, "rgba(200,222,255,0.9)"], [0.4, "rgba(120,160,220,0.3)"], [1, "rgba(0,0,0,0)"],
    ]);
    this._S = S;
  }
  _sprite(img, x, y, r, alpha) {
    const s = r * 2;
    this.g.globalAlpha = clamp(alpha, 0, 1);
    this.g.drawImage(img, x - r, y - r, s, s);
  }

  // ---- 강 스파인 / 원근 -------------------------------------------------------
  _depth(y) { return clamp((this.bottomY - y) / this.range, 0, 1); }   // 0 근경 .. 1 수평선
  _centerX(d) {
    const w = this.w;
    return w * 0.5
      + Math.sin(d * 3.1 + this.meanderPhase) * w * 0.17 * (1 - d * 0.72)
      + Math.sin(d * 6.7 + this.meanderPhase * 1.3 + 2.0) * w * 0.055 * (1 - d * 0.5);
  }
  _halfWidth(d) { return lerp(this.w * 0.46, this.w * 0.012, Math.pow(d, 0.82)); }

  _curl(x, y, t) {
    // 노이즈 기울기의 수직 성분 = 컬(무발산 소용돌이 느낌)
    const s = 0.0016, e = 1.5;
    const n1 = this.noise(x * s + t * 0.05, y * s * 1.4);
    const nx = this.noise((x + e) * s + t * 0.05, y * s * 1.4) - n1;
    const ny = this.noise(x * s + t * 0.05, (y + e) * s * 1.4) - n1;
    return [ny, -nx];  // (dn/dy, -dn/dx)
  }

  // 흐름장: (x,y) → 하류(수평선) 방향 속도(px/s), out에 기록
  _flow(x, y, d, out) {
    const cx = this._centerX(d);
    // 스파인 기울기: y가 1px 위로 갈 때 중심 x가 얼마나 움직이나
    const cxUp = this._centerX(this._depth(y - 1));
    const dcxdy = cxUp - cx;                       // per -1px(위로)
    // 근경일수록 빠르고, 수평선에 가까울수록 느려짐(아주 느린 단방향 흐름)
    const spd = this.current * lerp(46, 8, d);
    let vy = -spd;                                 // 화면 위쪽 = 하류
    let vx = dcxdy * spd + (cx - x) * 1.4;          // 굽이 따라가기 + 중심 복원
    // 수평선 빛 무리로 수렴
    const conv = Math.pow(d, 2.2);
    const hx = this._centerX(1);
    vx = lerp(vx, (hx - x) * 3.0, conv);
    vy = lerp(vy, (this.horizonY - y) * 3.0 - 4, conv);
    // 컬-노이즈 사행(근경에서 더 일렁)
    const c = this._curl(x, y, this.t);
    const cAmp = this.current * lerp(30, 6, d);
    out.vx = vx + c[0] * cAmp;
    out.vy = vy + c[1] * cAmp;
  }

  // ---- 빛 객체 ---------------------------------------------------------------
  _makeLight(x, y) {
    return { x, y, vx: 0, vy: 0, r: Math.min(this.w, this.h) * 0.035, heat: 0,
             emerge: 0, age: 0, shove: 0, wn: 0, wx: new Float32Array(14), wy: new Float32Array(14) };
  }
  _spawnHeld(x, y) {
    const L = this._makeLight(x, y);
    L.homeX = x; L.homeY = y;
    this.held = L; this.sinceRelease = 0;
  }
  _seedClusterLight(d, bright) {
    const hw = this._halfWidth(d);
    const cx = this._centerX(d) + rand(-hw, hw);
    const y = this.horizonY + (1 - d) * this.range * 0.18;
    this.cluster.push({ x: cx, y, d, r: lerp(2.2, 6, bright) * (1 - d * 0.5),
                        bright, ph: rand(0, TAU), fade: rand(0.35, 1), drift: rand(-3, 3) });
    if (this.cluster.length > 90) this.cluster.shift();
  }

  _release() {
    const L = this.held; if (!L) return;
    // 플릭: 마지막 포인터 이동을 초기 속도로(px/frame → px/s 근사)
    L.vx = this.pointer.vx * 42;
    L.vy = this.pointer.vy * 42 - 20;   // 살짝 하류로 밀어줌
    L.age = 0;
    this.flowing.push(L);
    this.held = null;
    this.grabbing = false;
    this.sinceRelease = 0;
    try {
      const n = (parseInt(localStorage.getItem(LS_KEY) || "0", 10) || 0) + 1;
      localStorage.setItem(LS_KEY, String(n));
    } catch (e) {}
  }

  _newDrop(anywhere) {
    const d = anywhere ? Math.pow(Math.random(), 0.7) : Math.random() * 0.12;
    const hw = this._halfWidth(d);
    return { x: this._centerX(d) + rand(-hw, hw), y: this.horizonY + (1 - d) * this.range,
             tw: rand(0, TAU), sp: rand(0.7, 1.5) };
  }
  _respawnDrop(p) {
    const d = Math.random() * 0.1;                 // 근경에서 재유입
    const hw = this._halfWidth(d);
    p.x = this._centerX(d) + rand(-hw, hw);
    p.y = this.bottomY - d * this.range * 0.2 + rand(-8, 8);
    p.tw = rand(0, TAU); p.sp = rand(0.7, 1.5);
  }

  // ---- 인터랙션 --------------------------------------------------------------
  onPointerDown() {
    const p = this.pointer;
    // 1) 떠난 빛을 되잡으려는 손? — 잡히지 않고 통과, 강하게 반발
    let near = null, nd = 1e9;
    for (const L of this.flowing) {
      const dd = Math.hypot(L.x - p.x, L.y - p.y);
      if (dd < nd) { nd = dd; near = L; }
    }
    if (near && nd < near.r * 2.4 + 30) { near.shove = 1; return; }
    // 2) 아직 보내지 않은 빛이 손 닿는 곳에 있으면 붙잡기
    if (this.held) {
      const dd = Math.hypot(this.held.x - p.x, this.held.y - p.y);
      if (dd < this.held.r * 3 + 70) { this.grabbing = true; return; }
    }
    // 3) 빈손이고 가까운 물이면 새 빛이 손으로 떠오름
    if (!this.held && p.y > this.horizonY + this.range * 0.32) {
      const d = this._depth(p.y), hw = this._halfWidth(d);
      const x = clamp(p.x, this._centerX(d) - hw, this._centerX(d) + hw);
      this._spawnHeld(x, p.y);
      this.grabbing = true;
    }
  }
  onPointerUp() {
    if (this.grabbing && this.held) this._release();
    this.grabbing = false;
  }

  // ---- 프레임 ----------------------------------------------------------------
  frame(dt, t) {
    const g = this.g = this.ctx2d();
    const W = this.w, H = this.h, p = this.pointer;

    // ===== 시뮬레이션 ==========================================================
    // 수면 입자 이류
    const tmp = this._tmp;
    for (let i = 0; i < this.water.length; i++) {
      const q = this.water[i];
      const d = this._depth(q.y);
      this._flow(q.x, q.y, d, tmp);
      q.x += tmp.vx * dt; q.y += tmp.vy * dt;
      q.tw += dt * q.sp;
      const hw = this._halfWidth(d) * 1.15;
      if (q.y < this.horizonY + 2 || Math.abs(q.x - this._centerX(d)) > hw) this._respawnDrop(q);
    }

    // 붙잡은/유휴 빛
    if (this.held) {
      const L = this.held;
      L.emerge = Math.min(1, L.emerge + dt * 1.7);
      if (this.grabbing) {
        L.heat = Math.min(1, L.heat + dt * 0.4);         // 쥐고 있는 동안 가열
        const d = this._depth(p.y), hw = this._halfWidth(d);
        const tx = clamp(p.x, this._centerX(d) - hw, this._centerX(d) + hw);
        const ty = clamp(p.y, this.horizonY + this.range * 0.22, this.bottomY - 6);
        L.x += (tx - L.x) * Math.min(1, dt * 11);
        L.y += (ty - L.y) * Math.min(1, dt * 11);
      } else {
        // 손 대기 전엔 수면 위에서 나직이 흔들린다
        L.x = L.homeX + Math.sin(t * 0.7) * 9 + Math.sin(t * 1.9) * 3;
        L.y = L.homeY + Math.sin(t * 0.95 + 1) * 6;
      }
    } else {
      this.sinceRelease += dt;
    }

    // 흘러가는 빛
    for (let i = this.flowing.length - 1; i >= 0; i--) {
      const L = this.flowing[i];
      L.age += dt;
      const d = this._depth(L.y);
      this._flow(L.x, L.y, d, tmp);
      // 흐름장으로 서서히 수렴(플릭은 잠깐 살아있다 물살에 흡수)
      const k = Math.min(1, dt * 1.6);
      L.vx += (tmp.vx - L.vx) * k;
      L.vy += (tmp.vy - L.vy) * k;

      // 되잡기 반발: 커서에서 밀려남 + 하류로 편향(절대 되돌아오지 않음)
      // 놓은 직후 짧은 유예로 플릭을 살리되, 손을 뻗어 온(shove) 경우엔 즉시 거부
      if (p.active && (L.age > 0.15 || L.shove > 0)) {
        const dx = L.x - p.x, dy = L.y - p.y;
        const dist = Math.hypot(dx, dy) + 1e-3;
        const repR = L.r * 3.2 + 120;
        if (dist < repR) {
          const f = (1 - dist / repR) * (260 + L.shove * 520);
          const nx = dx / dist, ny = dy / dist;
          L.vx += nx * f * dt;
          L.vy += ny * f * dt - Math.abs(f) * dt * 0.5;   // 위(하류)로 편향
        }
      }
      L.shove = Math.max(0, L.shove - dt * 3);

      L.x += L.vx * dt; L.y += L.vy * dt;
      L.heat = Math.max(0, L.heat - dt * 0.22);           // 떠나며 식는다

      // 웨이크(궤적) 링버퍼
      const wi = L.wn % L.wx.length;
      L.wx[wi] = L.x; L.wy[wi] = L.y; L.wn++;

      // 수평선 빛 무리에 합류
      if (d > 0.93) {
        this._seedClusterLight(clamp(d, 0.9, 0.995), clamp(0.5 + L.heat, 0.4, 1));
        this.flowing.splice(i, 1);
        continue;
      }
      if (L.x < -80 || L.x > W + 80 || L.y < -40) this.flowing.splice(i, 1);
    }

    // 빛 무리: 나직이 명멸하고 아주 천천히 강 끝 너머로 사라진다
    for (let i = this.cluster.length - 1; i >= 0; i--) {
      const c = this.cluster[i];
      c.ph += dt * 1.4;
      c.y -= dt * 0.4; c.x += c.drift * dt * 0.15;
      c.fade -= dt * 0.006;
      if (c.fade <= 0 || c.y < this.horizonY - 6) this.cluster.splice(i, 1);
    }

    // 놓은 뒤 빛이 충분히 떠나면 새 빛이 나직이 떠오른다(갤러리 흐름 유지)
    if (!this.held) {
      const gone = this.flowing.length === 0 || this.flowing.every((L) => this._depth(L.y) > 0.42);
      if (this.sinceRelease > 2.4 && gone) {
        this._spawnHeld(this.w * 0.5 + rand(-30, 30), this.bottomY - (this.bottomY - this.horizonY) * 0.12);
        this.grabbing = false;
      }
    }

    // ===== 렌더 ================================================================
    // 배경: 한밤의 강 — 위(수평선) 미광, 아래(관람객) 심연
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0d14");
    bg.addColorStop(this.horizonY / H, "#0c1119");
    bg.addColorStop(clamp(this.horizonY / H + 0.02, 0, 1), "#080a10");
    bg.addColorStop(1, "#050609");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 수평선 미광 밴드
    const hb = g.createLinearGradient(0, this.horizonY - H * 0.14, 0, this.horizonY + H * 0.06);
    hb.addColorStop(0, "rgba(30,42,66,0)");
    hb.addColorStop(0.6, "rgba(48,64,96,0.16)");
    hb.addColorStop(1, "rgba(20,28,44,0)");
    g.fillStyle = hb; g.fillRect(0, this.horizonY - H * 0.14, W, H * 0.2);

    g.globalCompositeOperation = "lighter";

    // 수면 입자(차가운 반짝임) — 잔물결·번짐
    for (let i = 0; i < this.water.length; i++) {
      const q = this.water[i];
      const d = this._depth(q.y);
      const sh = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(q.tw));
      const a = sh * lerp(0.5, 0.12, d);
      const sz = lerp(1.9, 0.7, d);
      g.globalAlpha = a;
      g.fillStyle = "#bcd2f2";
      g.fillRect(q.x, q.y, sz, sz);
    }

    // 빛 무리(하류의 보낸 순간들)
    for (const c of this.cluster) {
      const fl = 0.6 + 0.4 * Math.sin(c.ph);
      const a = c.bright * c.fade * fl;
      this._reflection(c.x, c.y, c.r, a * 0.5, c.d);
      this._sprite(this.gWarm, c.x, c.y, c.r * 3.4, a * 0.85);
      this._sprite(this.gHot, c.x, c.y, c.r * 1.1, a);
    }

    // 흘러가는 빛 + 웨이크
    for (const L of this.flowing) {
      const d = this._depth(L.y);
      const persp = lerp(1, 0.16, d);
      const dispR = L.r * persp;
      const bright = clamp(0.55 + L.heat * 0.6, 0, 1.2) * lerp(1, 0.55, d);
      // 웨이크: 지나온 자리에 옅은 잔광
      const N = L.wx.length, have = Math.min(L.wn, N);
      for (let j = 1; j < have; j++) {
        const idx = (L.wn - 1 - j + N * 2) % N;
        const f = 1 - j / have;
        this._sprite(this.gWarm, L.wx[idx], L.wy[idx], dispR * 1.6 * f, bright * 0.14 * f);
      }
      this._reflection(L.x, L.y, dispR, bright * 0.7, d);
      this._sprite(this.gWarm, L.x, L.y, dispR * 3.6, bright * 0.8);
      this._sprite(this.gHot, L.x, L.y, dispR * 1.3, bright);
    }

    // 붙잡은/유휴 빛 — 이 벽에서 가장 밝은 것
    if (this.held) {
      const L = this.held;
      const heat = L.heat, em = L.emerge;
      const dispR = L.r * (1 + heat * 1.15);
      const bright = (0.7 + heat * 0.55) * em;
      // 손에서 차오르는 온기
      this._reflection(L.x, L.y, dispR, bright * 0.85, 0.02);
      this._sprite(this.gWarm, L.x, L.y, dispR * (3.8 + heat * 1.6), bright * 0.9);
      this._sprite(this.gHot, L.x, L.y, dispR * (1.3 + heat * 0.7), bright);
      this._sprite(this.gHot, L.x, L.y, dispR * (0.5 + heat * 0.3), Math.min(1, bright * 1.1));
      if (this.grabbing) {
        // 쥐고 있음을 알리는 미세한 파문
        const rr = dispR * (2 + Math.sin(this.t * 3) * 0.2);
        g.globalAlpha = 0.12 * em;
        g.strokeStyle = "#ffe6bf"; g.lineWidth = 1.4;
        g.beginPath(); g.ellipse(L.x, L.y, rr, rr * 0.42, 0, 0, TAU); g.stroke();
      }
    }

    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    // 비네트(갤러리 다크톤)
    const vg = g.createRadialGradient(W / 2, H * 0.58, Math.min(W, H) * 0.32, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.62)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    // 캡션
    this._caption(g, W, H, dt);
  }

  // 수직으로 늘인 번짐 반영 + 사인파 글린트
  _reflection(x, y, r, a, d) {
    const g = this.g;
    const len = r * lerp(7, 2.4, d);
    // 늘인 헤일로 사본(아래로)
    g.save();
    g.globalAlpha = clamp(a * 0.6, 0, 1);
    g.translate(x, y + r * 0.3);
    g.scale(1, len / (r * 2));
    g.drawImage(this.gWarm, -r, 0, r * 2, r * 2);
    g.restore();
    // 일렁이는 글린트: 아래로 내려가며 좌우로 흔들리는 밝은 점들
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const yy = y + r * 0.4 + f * len;
      const wob = Math.sin(yy * 0.06 + this.t * 2.2) * r * 0.5 * f;
      const rr = r * (0.5 - 0.32 * f);
      this._sprite(this.gWarm, x + wob, yy, Math.max(0.6, rr), a * (1 - f) * 0.7);
    }
  }

  _caption(g, W, H, dt) {
    let text;
    if (this.held && this.grabbing) text = "쥐고 있는 동안 빛은 더 밝아진다 — 보내기 전, 머뭇거리는 시간";
    else if (this.held) text = "빛 하나가 물 위에 떠 있다 — 보내기 전까지만, 그것은 내 것이다";
    else if (this.flowing.length && this.flowing.some((L) => this._depth(L.y) < 0.55))
      text = "물살은 되돌아오지 않는다 — 되잡으려는 손을 빛은 그냥 통과한다";
    else text = "물살이 데려갔다 — 할 수 있는 건 새 빛을 띄우는 일뿐";
    this.captionA = lerp(this.captionA, 1, Math.min(1, dt * 4));
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = `rgba(206,214,226,${0.5 * this.captionA})`;
    g.fillText(text, W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("물살", 0.5, 1.8, this.current, 0.05, (v) => (this.current = v)));
    host.appendChild(buttonRow([
      {
        label: "새 빛 띄우기", on: () => {
          if (!this.held) {
            this._spawnHeld(this.w * 0.5 + rand(-24, 24), this.bottomY - (this.bottomY - this.horizonY) * 0.12);
            this.grabbing = false;
          }
        },
      },
    ]));
  }
}
