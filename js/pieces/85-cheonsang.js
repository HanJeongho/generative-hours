// ============================================================================
//  85 · 천상열차분야지도 (天象列次分野之圖 — 두 개의 하늘) · CHEONSANG
//
//  1395년, 조선은 고구려 탁본을 바탕으로 온 하늘의 별을 검은 돌(각석)에 새겼다.
//  이 작품은 그 각석을 절차적으로 되살린다 — 이미지 없이, 전부 그려낸다.
//    · 검은 화강암 질감(미세 노이즈 + 정질 긁힘) 위에 하늘 원(天圓)을 새기고,
//    · 밝은 별 ~40개(북두칠성·카시오페이아·북극성·여름/겨울 대삼각형·오리온·
//      전갈·목동)를 실제 적경/적위로 배치하고, 절차적 새김별 150개로 채운다.
//    · 별은 '새김눈(음각)' — 어두운 홈 + 좌상단 그림자 + 우하단 하이라이트.
//    · 28수(宿) 방사 구획선과 적도·주극원을 희미하게 새긴다.
//    · 정적 요소는 오프스크린에 한 번만 굽고(bake), 매 프레임은 blit + 오버레이.
//
//  ★손끝 = 달빛: 대표 별자리 근처에 포인터를 대면 그 새김이 달빛으로 은은히
//   깨어난다. 이름표 팝업·홀드 오버레이 없이 빛만 — 대신 화면 오른쪽에 그
//   별자리의 이야기를 적은 한지 패널이 함께 떠오른다.
//
//  좌표 의존 상수는 최상단 const로 노출(중앙에서 시각 캘리브레이션 예정).
// ============================================================================

import { Piece, TAU, clamp, lerp, map } from "../engine.js";

// ---- 튜닝 가능한 캘리브레이션 상수 -----------------------------------------
const COLAT_MAX = 150;         // 투영 최외곽 여위도(적위 -60°까지 담음)
const CIRCLE_FRAC = 0.43;      // 하늘 원 반지름 / min(W,H)
const CENTER_Y_FRAC = 0.47;    // 하늘 원 중심 y (하단 캡션 공간 확보)
const STONE_ROT = -0.35;       // 각석 새김의 고정 방위(1395의 한 순간, rad)
const N_FILLER = 150;          // 절차적 새김별 개수
const LUNAR_MANSIONS = 28;     // 28수 방사 구획

// ---- 밝은 별 목록: {id, ra(시), dec(도), m(등급)} --------------------------
const BRIGHT = [
  // 북두칠성 (큰곰)
  { id: "dubhe", ra: 11.062, dec: 61.75, m: 1.8 },
  { id: "merak", ra: 11.030, dec: 56.38, m: 2.4 },
  { id: "phecda", ra: 11.897, dec: 53.69, m: 2.4 },
  { id: "megrez", ra: 12.257, dec: 57.03, m: 3.3 },
  { id: "alioth", ra: 12.900, dec: 55.96, m: 1.8 },
  { id: "mizar", ra: 13.399, dec: 54.93, m: 2.0 },
  { id: "alkaid", ra: 13.792, dec: 49.31, m: 1.9 },
  // 카시오페이아
  { id: "caph", ra: 0.153, dec: 59.15, m: 2.3 },
  { id: "schedar", ra: 0.675, dec: 56.54, m: 2.2 },
  { id: "gcas", ra: 0.945, dec: 60.72, m: 2.2 },
  { id: "ruchbah", ra: 1.430, dec: 60.24, m: 2.7 },
  { id: "segin", ra: 1.907, dec: 63.67, m: 3.4 },
  // 북극성
  { id: "polaris", ra: 2.530, dec: 89.26, m: 2.0 },
  // 여름 대삼각형
  { id: "vega", ra: 18.615, dec: 38.78, m: 0.0 },
  { id: "deneb", ra: 20.690, dec: 45.28, m: 1.25 },
  { id: "altair", ra: 19.846, dec: 8.87, m: 0.77 },
  // 오리온 + 겨울 대삼각형
  { id: "betelgeuse", ra: 5.919, dec: 7.41, m: 0.5 },
  { id: "bellatrix", ra: 5.418, dec: 6.35, m: 1.6 },
  { id: "alnitak", ra: 5.679, dec: -1.94, m: 1.8 },
  { id: "alnilam", ra: 5.604, dec: -1.20, m: 1.7 },
  { id: "mintaka", ra: 5.533, dec: -0.30, m: 2.2 },
  { id: "saiph", ra: 5.796, dec: -9.67, m: 2.1 },
  { id: "rigel", ra: 5.242, dec: -8.20, m: 0.13 },
  { id: "sirius", ra: 6.752, dec: -16.72, m: -1.46 },
  { id: "procyon", ra: 7.655, dec: 5.22, m: 0.34 },
  // 전갈
  { id: "antares", ra: 16.490, dec: -26.43, m: 1.06 },
  { id: "dschubba", ra: 16.005, dec: -22.62, m: 2.3 },
  { id: "shaula", ra: 17.560, dec: -37.10, m: 1.6 },
  // 목동
  { id: "arcturus", ra: 14.261, dec: 19.18, m: -0.05 },
  // 밀도용 밝은 별 (별자리 미소속)
  { id: "capella", ra: 5.278, dec: 45.998, m: 0.08 },
  { id: "aldebaran", ra: 4.599, dec: 16.51, m: 0.85 },
  { id: "pollux", ra: 7.755, dec: 28.03, m: 1.14 },
  { id: "castor", ra: 7.577, dec: 31.89, m: 1.58 },
  { id: "spica", ra: 13.420, dec: -11.16, m: 1.04 },
  { id: "regulus", ra: 10.140, dec: 11.97, m: 1.35 },
];

// ---- 대표 별자리(터치 시 점등) ----------------------------------------------
// stars: BRIGHT id 목록, lines: 그 배열 안 인덱스 쌍, alias/desc: 오른쪽 패널 텍스트
const CONSTELLATIONS = [
  { name: "북두칠성", alias: "北斗七星 — 자미원의 국자",
    stars: ["dubhe", "merak", "phecda", "megrez", "alioth", "mizar", "alkaid"],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    desc: "일곱 별이 국자 모양으로 북쪽 하늘을 도는 길잡이. 옛사람들은 국자 자루가 가리키는 방향으로 계절을 읽었다. 각석에서도 가장 또렷하게 새겨진 별무리다." },
  { name: "카시오페이아", alias: "王良 — 임금의 마부",
    stars: ["caph", "schedar", "gcas", "ruchbah", "segin"],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
    desc: "W자로 꺾인 다섯 별. 동양 천문에서는 임금의 수레를 모는 마부 왕량으로 보았다. 북극성을 사이에 두고 북두칠성과 마주 보며 돈다." },
  { name: "오리온", alias: "參宿 — 삼형제 별",
    stars: ["betelgeuse", "bellatrix", "alnitak", "alnilam", "mintaka", "saiph", "rigel"],
    lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
    desc: "겨울 하늘의 사냥꾼. 허리띠의 세 별을 동양에서는 삼수(參宿)라 불렀다. 어깨의 붉은 베텔게우스와 발끝의 푸른 리겔이 색의 대조를 이룬다." },
  { name: "북극성", alias: "帝星 곁 — 하늘의 축",
    stars: ["polaris"], lines: [],
    desc: "온 하늘이 이 한 점을 중심으로 돈다. 동양 천문에서 북극 곁은 임금의 자리 — 천상열차분야지도의 모든 원이 여기에서 시작된다." },
  { name: "여름 대삼각형", alias: "직녀와 견우의 하늘",
    stars: ["vega", "deneb", "altair"], lines: [[0, 1], [1, 2], [2, 0]],
    desc: "직녀별 베가, 견우로 이어지는 알타이르, 백조의 꼬리 데네브. 은하수를 사이에 둔 칠석 이야기의 무대다." },
  { name: "겨울 대삼각형", alias: "가장 밝은 세 별",
    stars: ["betelgeuse", "sirius", "procyon"], lines: [[0, 1], [1, 2], [2, 0]],
    desc: "베텔게우스·시리우스·프로키온 — 밤하늘에서 가장 밝은 별들이 이루는 거의 정확한 정삼각형. 겨울 남쪽 하늘의 이정표다." },
  { name: "전갈자리", alias: "心宿 — 하늘의 붉은 심장",
    stars: ["antares", "dschubba", "shaula"], lines: [[1, 0], [0, 2]],
    desc: "여름 남쪽 하늘에 붉게 타는 안타레스. 동양에서는 하늘의 심장 심수(心宿)로 새겼고, 화성과 붉기를 겨룬다 하여 '화성의 맞수'라 불렀다." },
  { name: "목동자리", alias: "大角 — 큰 뿔",
    stars: ["arcturus"], lines: [],
    desc: "북두의 자루 곡선을 따라 미끄러져 내려오면 만나는 주황빛 아르크투루스. 동양에서는 하늘의 큰 뿔, 대각(大角)이라 불렀다." },
];

const CAPTION = "별자리 가까이 손을 대면, 새겨진 별이 달빛으로 깨어난다.";

export default class Cheonsang extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // id → BRIGHT 인덱스
    this.gid = Object.create(null);
    for (let i = 0; i < BRIGHT.length; i++) this.gid[BRIGHT[i].id] = i;

    // 별 화면좌표 버퍼(무할당 재사용): stone(각석)
    this.stone = BRIGHT.map(() => ({ x: 0, y: 0, r: 0, vis: true }));

    // 별자리 점등 강도(이징)
    this.lit = new Float32Array(CONSTELLATIONS.length);

    // 절차적 새김별(결정적) — 여위도/방위 파라미터
    this._rng = this._mkRng(0x51ce2026);
    this.filler = [];
    for (let i = 0; i < N_FILLER; i++) {
      const ang = this._rng() * TAU;
      const cr = Math.sqrt(this._rng()) * 0.98;   // 원판 균일 분포 근사
      this.filler.push({ ang, cr, m: 3.2 + this._rng() * 1.8 });
    }

    // 스프라이트(발광점) — 프레임 무할당 blit용
    this._moonSprite = this._mkGlow(["#eaf2ff", "#a8c4ee", "#5f7bb0"]);

    this._grain = this._mkGrain(150);
    this._baked = false;
    this._need = true;
  }

  onResize() { this._need = true; }

  // ---- 결정적 난수(xorshift) -------------------------------------------------
  _mkRng(seed) {
    let s = seed >>> 0;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  // ---- 발광 스프라이트(방사 그라데이션 1회 베이크) ---------------------------
  _mkGlow(stops, soft) {
    const s = 64, cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    // soft: 더 크고 부드러운 헤일로(금빛 별용)
    grd.addColorStop(soft ? 0.12 : 0.18, stops[0]);
    grd.addColorStop(soft ? 0.36 : 0.45, stops[1]);
    if (soft) grd.addColorStop(0.72, stops[2]);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    // 중앙 흰 코어를 위해 알파는 gco로 처리; 색만 지정
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return cv;
  }

  // ---- 둥근 사각(명패용) --------------------------------------------------
  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---- 화강암 미세 노이즈 타일 ----------------------------------------------
  _mkGrain(s) {
    const cv = document.createElement("canvas");
    cv.width = s; cv.height = s;
    const g = cv.getContext("2d");
    const img = g.createImageData(s, s);
    const d = img.data;
    for (let i = 0; i < s * s; i++) {
      const n = (Math.random() * 255) | 0;
      // 회청색 화강암 알갱이
      d[i * 4] = n; d[i * 4 + 1] = n; d[i * 4 + 2] = n + 6; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // ---- 투영: (적경시, 적위도) → 화면 (out에 기록, 무할당) --------------------
  _project(ra, dec, rot, out) {
    const colat = 90 - dec;
    const rr = (colat / COLAT_MAX) * this._R;
    const ang = (ra / 24) * TAU + rot - Math.PI / 2;
    out.x = this._cx + rr * Math.cos(ang);
    out.y = this._cy + rr * Math.sin(ang);
    out.vis = colat <= COLAT_MAX + 4;
    return out;
  }

  _mag2r(m, S) { return clamp(map(m, -1.5, 3.6, 3.4, 1.0), 0.8, 3.6) * S; }

  // ==========================================================================
  //  BAKE — 각석(정적 요소)을 오프스크린에 한 번 새긴다
  // ==========================================================================
  _bake() {
    const dpr = this.dpr, W = this.w, H = this.h;
    const off = this._off || (this._off = document.createElement("canvas"));
    off.width = Math.max(1, Math.round(W * dpr));
    off.height = Math.max(1, Math.round(H * dpr));
    const g = off.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    this._cx = W / 2;
    this._cy = H * CENTER_Y_FRAC;
    this._R = Math.min(W, H) * CIRCLE_FRAC;
    const S = Math.min(W, H) / 720;
    const cx = this._cx, cy = this._cy, R = this._R;

    // 1) 검은 각석 바탕 — 더 깊은 명암
    const bg = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, Math.max(W, H) * 0.85);
    bg.addColorStop(0, "#1b212b");
    bg.addColorStop(0.55, "#0f131a");
    bg.addColorStop(1, "#05070a");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 상단좌측에서 비껴드는 은은한 박물관 조명(라디얼)
    const lx = cx - R * 0.55, ly = cy - R * 0.62;
    g.save();
    g.globalCompositeOperation = "lighter";
    const lit = g.createRadialGradient(lx, ly, R * 0.05, lx, ly, R * 1.7);
    lit.addColorStop(0, "rgba(150,166,196,0.20)");
    lit.addColorStop(0.4, "rgba(96,108,132,0.09)");
    lit.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lit;
    g.fillRect(0, 0, W, H);
    g.restore();

    // 미세 노이즈(오버레이) — 돌 입자를 조금 더 또렷하게
    g.save();
    g.globalAlpha = 0.10;
    g.globalCompositeOperation = "overlay";
    const gp = g.createPattern(this._grain, "repeat");
    g.fillStyle = gp;
    g.fillRect(0, 0, W, H);
    g.restore();

    // 2) 정질 긁힘(결정적) — 조금 더 또렷하게
    const rng = this._mkRng(0x9e3779b1);
    g.save();
    g.lineCap = "round";
    for (let i = 0; i < 64; i++) {
      const x = rng() * W, y = rng() * H;
      const a = rng() * TAU, len = 18 + rng() * 140;
      g.strokeStyle = rng() > 0.5
        ? `rgba(200,210,228,${0.018 + rng() * 0.045})`
        : `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      g.lineWidth = 0.35 + rng() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    g.restore();

    // 2b) 돌 자체의 깊은 비네트(입체감) — 조명 반대쪽이 더 어둡게, 베이크에 한 번
    g.save();
    const bvg = g.createRadialGradient(lx, ly, R * 0.4, cx, cy, Math.max(W, H) * 0.92);
    bvg.addColorStop(0, "rgba(0,0,0,0)");
    bvg.addColorStop(0.7, "rgba(0,0,0,0.12)");
    bvg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = bvg;
    g.fillRect(0, 0, W, H);
    g.restore();

    // 3) 28수 방사 구획선(희미)
    g.save();
    g.strokeStyle = "rgba(150,162,186,0.05)";
    g.lineWidth = 0.5;
    const rInner = R * 0.16;
    for (let i = 0; i < LUNAR_MANSIONS; i++) {
      const a = (i / LUNAR_MANSIONS) * TAU + STONE_ROT;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke();
    }
    g.restore();

    // 4) 적도원·주극원·바깥 하늘원(음각 이중선)
    this._engraveCircle(g, cx, cy, (90 / COLAT_MAX) * R, 0.14);  // 적도(赤道)
    this._engraveCircle(g, cx, cy, R * 0.30, 0.10);              // 주극원(週極)
    this._engraveCircle(g, cx, cy, R, 0.22, true);               // 바깥 하늘원(天圓)

    // 5) 별 새김 — 밝은 별
    for (let i = 0; i < BRIGHT.length; i++) {
      const s = BRIGHT[i];
      const p = this._project(s.ra, s.dec, STONE_ROT, this.stone[i]);
      const bright = s.m <= 2.0;                       // 1~2등급: 홈 키우고 금박 흔적
      p.r = this._mag2r(s.m, S) * (bright ? 1.18 : 1);
      if (p.vis) this._engrave(g, p.x, p.y, p.r, bright);
    }
    // 절차적 새김별
    for (let i = 0; i < this.filler.length; i++) {
      const f = this.filler[i];
      const rr = f.cr * R;
      const a = f.ang + STONE_ROT;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      this._engrave(g, x, y, this._mag2r(f.m, S) * 0.85);
    }

    // 5b) 대표 별자리 상시 연결선(원본 천문도가 새긴 별자리 획) — 아주 옅은 음각
    g.save();
    g.lineCap = "round";
    for (let c = 0; c < CONSTELLATIONS.length; c++) {
      const con = CONSTELLATIONS[c];
      for (let l = 0; l < con.lines.length; l++) {
        const p = this.stone[this.gid[con.stars[con.lines[l][0]]]];
        const q = this.stone[this.gid[con.stars[con.lines[l][1]]]];
        if (!p.vis || !q.vis) continue;
        g.strokeStyle = "rgba(0,0,0,0.38)";           // 홈 그늘
        g.lineWidth = 1.0;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
        g.strokeStyle = "rgba(180,190,208,0.08)";     // 빛 받는 가는 하이라이트
        g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(p.x + 0.4, p.y + 0.5); g.lineTo(q.x + 0.4, q.y + 0.5); g.stroke();
      }
    }
    g.restore();

    // 중심 표식(북극 근방 작은 홈)
    this._engrave(g, cx, cy, 1.4 * S);

    this._baked = true;
    this._need = false;
    this._S = S;
  }

  // 음각 원(둘레) — 어두운 홈 + 좌상단 그림자 + 우하단 하이라이트
  _engraveCircle(g, cx, cy, r, strength, doubled) {
    if (r <= 1) return;
    g.save();
    // 바깥 굵은 홈(음각)
    g.lineWidth = doubled ? 2.6 : 1.4;
    g.strokeStyle = `rgba(0,0,0,${0.4 + strength})`;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    // 음각 하이라이트(빛 받는 우하 벽)
    g.lineWidth = doubled ? 1.1 : 0.8;
    g.strokeStyle = `rgba(190,198,216,${0.12 + strength})`;
    g.beginPath(); g.arc(cx + 0.7, cy + 0.9, r, 0.08 * TAU, 0.46 * TAU); g.stroke();
    if (doubled) {
      // 안쪽 가는 새김선 + 그 하이라이트(이중 새김)
      g.lineWidth = 1.0;
      g.strokeStyle = `rgba(0,0,0,${0.26 + strength})`;
      g.beginPath(); g.arc(cx, cy, r * 0.955, 0, TAU); g.stroke();
      g.lineWidth = 0.6;
      g.strokeStyle = "rgba(172,182,202,0.13)";
      g.beginPath(); g.arc(cx + 0.5, cy + 0.6, r * 0.955, 0.08 * TAU, 0.46 * TAU); g.stroke();
    }
    g.restore();
  }

  // 음각 점(새김눈): 홈 + 좌상단 그림자 + 우하단 광택
  _engrave(g, x, y, r, gold) {
    // 좌상단 그림자(파인 홈의 그늘)
    g.beginPath();
    g.arc(x - r * 0.26, y - r * 0.26, r * 1.18, 0, TAU);
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fill();
    // 어두운 홈(더 또렷하게)
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.08, x, y, r);
    grd.addColorStop(0, "rgba(0,0,0,0.95)");
    grd.addColorStop(0.7, "rgba(0,0,0,0.6)");
    grd.addColorStop(1, "rgba(26,30,38,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    // 아래쪽 미세 하이라이트(빛 받는 안쪽 벽)
    g.strokeStyle = "rgba(206,212,226,0.6)";
    g.lineWidth = Math.max(0.5, r * 0.3);
    g.beginPath(); g.arc(x + 0.2, y + 0.25, r * 0.8, 0.06 * TAU, 0.4 * TAU); g.stroke();
    // 밝은 별: 아주 옅은 금박 흔적
    if (gold) {
      g.beginPath();
      g.arc(x + r * 0.12, y + r * 0.16, r * 0.5, 0, TAU);
      g.fillStyle = "rgba(214,176,96,0.16)";
      g.fill();
    }
  }

  // ---- 발광점 blit(무할당) ---------------------------------------------------
  _blitGlow(g, sprite, x, y, rad, alpha) {
    if (alpha <= 0.004) return;
    const d = rad * 2;
    g.globalAlpha = alpha;
    g.drawImage(sprite, x - rad, y - rad, d, d);
  }

  // ==========================================================================
  //  FRAME
  // ==========================================================================
  frame(dt, t) {
    const g = this.ctx;
    const W = this.w, H = this.h;
    if (this._need || !this._baked) this._bake();

    // 배경(각석) blit — 디바이스 픽셀 1:1
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this._off, 0, 0);

    // 이후 오버레이는 CSS 좌표계
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 별자리 점등(터치 근접) — 빛 + 오른쪽 이야기 패널
    this._updateConstellations(dt);
    this._drawConstellations(g);
    this._drawPanel(g);

    // 비네팅 + 캡션
    this._drawVignette(g, W, H);
    this._drawCaption(g, W, H);
  }

  // 포인터 근접으로 별자리 강도 목표 설정 후 이징
  _updateConstellations(dt) {
    const px = this.pointer.x, py = this.pointer.y;
    const near = Math.min(this.w, this.h) * 0.085;
    const active = this.pointer.active;
    for (let c = 0; c < CONSTELLATIONS.length; c++) {
      let hit = 0;
      if (active) {
        const st = CONSTELLATIONS[c].stars;
        for (let k = 0; k < st.length; k++) {
          const p = this.stone[this.gid[st[k]]];
          const dx = p.x - px, dy = p.y - py;
          if (dx * dx + dy * dy < near * near) { hit = 1; break; }
        }
      }
      const tv = hit ? 1 : 0;
      this.lit[c] += (tv - this.lit[c]) * Math.min(1, dt * (hit ? 6 : 3));
    }
  }

  _drawConstellations(g) {
    const S = this._S || 1;
    g.save();
    for (let c = 0; c < CONSTELLATIONS.length; c++) {
      const a = this.lit[c];
      if (a < 0.02) continue;
      const con = CONSTELLATIONS[c];
      // 선(달빛)
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = `rgba(170,196,240,${0.32 * a})`;
      g.lineWidth = 1.1;
      for (let l = 0; l < con.lines.length; l++) {
        const p = this.stone[this.gid[con.stars[con.lines[l][0]]]];
        const q = this.stone[this.gid[con.stars[con.lines[l][1]]]];
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
      // 별(달빛 발광)
      for (let k = 0; k < con.stars.length; k++) {
        const p = this.stone[this.gid[con.stars[k]]];
        this._blitGlow(g, this._moonSprite, p.x, p.y, (p.r + 5) * 1.9, 0.85 * a);
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // 오른쪽 이야기 패널 — 가장 밝게 점등된 별자리 하나를 한지 명패로
  _drawPanel(g) {
    let best = -1, a = 0.04;
    for (let c = 0; c < CONSTELLATIONS.length; c++)
      if (this.lit[c] > a) { a = this.lit[c]; best = c; }
    if (best < 0) return;
    const con = CONSTELLATIONS[best];
    const W = this.w;
    const S = Math.max(1, this._S || 1);
    const pw = Math.min(300 * S, W * 0.3);
    const pad = 16 * S;
    const titleFs = 17 * S, aliasFs = 11.5 * S, bodyFs = 12.5 * S, lh = bodyFs * 1.62;

    g.save();
    g.font = `400 ${bodyFs}px ui-sans-serif, system-ui, sans-serif`;
    // 줄바꿈 캐시 — 별자리·폭이 바뀔 때만 재계산
    const key = best + "|" + (pw | 0);
    if (this._panelKey !== key) {
      this._panelKey = key;
      this._panelLines = this._wrap(g, con.desc, pw - pad * 2);
    }
    const lines = this._panelLines;
    const ph = pad * 2 + titleFs + aliasFs + 20 * S + lh * 0.9 + lines.length * lh;
    const px = W - pw - 20 * S + (1 - a) * 24;   // 오른쪽에서 살짝 밀려 들어오는 등장
    const py = this._cy - ph / 2;

    g.globalAlpha = a;
    this._roundRect(g, px, py, pw, ph, 6 * S);
    g.fillStyle = "rgba(230,222,199,0.93)";      // 한지 바탕
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(60,52,40,0.4)";        // 옅은 먹선 테두리
    g.stroke();

    g.textAlign = "left"; g.textBaseline = "alphabetic";
    let ty = py + pad + titleFs * 0.82;
    g.fillStyle = "rgba(38,32,26,0.95)";
    g.font = `700 ${titleFs}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText(con.name, px + pad, ty);
    ty += aliasFs + 8 * S;
    g.fillStyle = "rgba(122,86,40,0.9)";         // 주사(朱砂) 톤 부제
    g.font = `600 ${aliasFs}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText(con.alias, px + pad, ty);
    ty += 12 * S;
    g.strokeStyle = "rgba(60,52,40,0.28)";       // 먹선 구분선
    g.beginPath(); g.moveTo(px + pad, ty); g.lineTo(px + pw - pad, ty); g.stroke();
    ty += lh * 0.9;
    g.fillStyle = "rgba(50,44,36,0.92)";
    g.font = `400 ${bodyFs}px ui-sans-serif, system-ui, sans-serif`;
    for (let i = 0; i < lines.length; i++) { g.fillText(lines[i], px + pad, ty); ty += lh; }
    g.globalAlpha = 1;
    g.textAlign = "start";
    g.restore();
  }

  // CJK 문자 단위 줄바꿈(공백 뒤 끊기 선호)
  _wrap(g, text, maxW) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      const test = line + ch;
      if (g.measureText(test).width > maxW && line) {
        lines.push(line);
        line = ch === " " ? "" : ch;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  _drawVignette(g, W, H) {
    const vg = g.createRadialGradient(W / 2, this._cy, this._R * 0.7, W / 2, this._cy, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  _drawCaption(g, W, H) {
    g.save();
    g.font = `500 ${Math.max(12, Math.min(W, H) * 0.02)}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(224,230,240,0.62)";
    g.fillText(CAPTION, W / 2, H - Math.max(20, H * 0.045));
    g.textAlign = "start";
    g.restore();
  }

  teardown() {
    this._off = null;
    this._grain = null;
    this._moonSprite = null;
    this.stone = null;
  }
}
