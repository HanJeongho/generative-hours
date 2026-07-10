// ============================================================================
//  67 · Gnomon (그노몬) — 도는 것은 그림자가 아니다 [Canvas2D]
//  인류 최초의 시계, 해시계 — 위에서 내려다본 돌 광장 한가운데 그노몬이 서고,
//  실제 태양 위치(위도·날짜·시각으로 계산한 고도/방위)가 그림자를 드리운다.
//  광장의 돌들도 같은 방향의 그림자를 눕히고, 새벽·정오·황혼의 빛이 광장을
//  물들인다. 밤이 되면 그림자는 사라지고 별이 천구 북극을 돈다.
//
//  ★ 반전(꾹 누르기): 기준틀이 뒤집힌다. 햇빛은 화면에 고정되고 — 광장이,
//  시간 눈금이, 지구가 돌기 시작한다. 그림자는 미동도 없는데 눈금이 그 밑을
//  지나가며 하루가 16초에 감긴다. 광장이 반 바퀴 돌면 밤 — 당신이 태양을
//  등진 시간. "그림자가 도는 것이 아니라, 당신이 돌고 있었다."
//  놓으면 지구가 스프링처럼 '지금'으로 되감긴다.
//
//  드래그 = 시간 스크럽(그림자를 끌어 하루를 미리보기, 놓으면 복귀)
//  LATITUDE = 위도 (66.5° 위로 밀면 여름의 백야 — 지지 않는 그림자)
//  SEASON = 계절 (겨울 그림자는 길다 — 지축의 기울기가 눈에 보인다)
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";
import { slider } from "./01-currents.js";

const D2R = Math.PI / 180;

export default class Gnomon extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.lat = 37.5;        // LATITUDE slider
    this.season = 0;        // SEASON slider — day-of-year offset
    this.holdH = 0;         // truth-frame extra hour-angle (radians)
    this.scrubH = 0;        // drag-scrub hour-angle offset
    this.scrubV = 0;
    this._mode = null;      // "hold" | "drag"
    this._downT = 0;
    this.birds = [];
    // plaza props: pebbles & a bench, each casting the same sun's shadow
    this.props = [];
    let sd = 7;
    const prand = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 9; i++) {
      const a = prand() * TAU, r = 0.52 + prand() * 0.38;
      this.props.push({ a, r, s: 4 + prand() * 7, tall: 0.3 + prand() * 1.2 });
    }
    this.stars = [];
    for (let i = 0; i < 160; i++) this.stars.push({ a: rand(0, TAU), r: rand(0.05, 1.35), b: rand(0.2, 1) });
  }

  // ---- solar position --------------------------------------------------------
  _sun(hourAngleExtra = 0) {
    const d = new Date();
    const N = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5 + this.season;
    const decl = -23.44 * D2R * Math.cos((TAU * (N + 10)) / 365);
    const hFrac = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const H = (hFrac - 12) * 15 * D2R + hourAngleExtra;      // hour angle
    const phi = this.lat * D2R;
    const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(clamp(sinEl, -1, 1));
    // azimuth from north, clockwise
    let az = Math.acos(clamp((Math.sin(decl) - Math.sin(phi) * sinEl) / Math.max(1e-6, Math.cos(phi) * Math.cos(el)), -1, 1));
    if (Math.sin(H) > 0) az = TAU - az;
    return { el, az, H, decl, hFrac };
  }

  onPointerDown() { this._downT = performance.now(); this._mode = null; }
  onPointerUp() {
    if (this._mode === null && performance.now() - this._downT < 260) {
      // tap: a bird crosses the plaza, dragging its shadow with it
      this.birds.push({ u: 0, y: rand(0.25, 0.75), dir: Math.random() < 0.5 ? 1 : -1 });
    }
    this._mode = null;
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const cx = W / 2, cy = H * 0.5;
    const R = Math.min(W, H) * 0.40;

    // ---- gestures --------------------------------------------------------------
    if (this.pointer.down && this.pointer.active) {
      const held = performance.now() - this._downT;
      const moving = Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 4;
      if (this._mode === null) {
        if (moving && held < 280) this._mode = "drag";
        else if (held >= 280) this._mode = "hold";
      }
      if (this._mode === "drag") {
        this.scrubH += this.pointer.vx * dt * 0.02;          // drag the shadow through the day
        this.scrubV = this.pointer.vx * 0.02;
      } else if (this._mode === "hold") {
        this.holdH += dt * (TAU / 16);                       // one Earth-turn per 16s
      }
    } else {
      // both offsets spring home: the Earth rewinds to NOW
      this.scrubV += -this.scrubH * 18 * dt; this.scrubV *= Math.exp(-dt * 5.5);
      this.scrubH += this.scrubV * dt;
      this.holdH = Math.abs(this.holdH) < 0.002 ? 0 : this.holdH * Math.exp(-dt * 4);
      if (Math.abs(this.scrubH) < 0.001 && Math.abs(this.scrubV) < 0.005) { this.scrubH = 0; this.scrubV = 0; }
    }
    const truth = this._mode === "hold" || this.holdH !== 0;
    const extraH = this.holdH + this.scrubH;
    const sun = this._sun(extraH);

    // in the TRUTH frame the light is nailed to the screen and the GROUND turns
    // by exactly the hour angle — ground rotation IS Earth's rotation
    const nowAz = this._sun(this.scrubH).az;                 // scrub stays naive
    const rotG = truth ? -(extraH - this.scrubH) : 0;
    const lightAz = truth ? nowAz : sun.az;

    // day factor from real elevation
    const day = clamp(Math.sin(sun.el) * 4 + 0.25, 0, 1);
    const dusk = clamp(1 - Math.abs(sun.el) / (14 * D2R), 0, 1) * (sun.el > -8 * D2R ? 1 : 0);

    // ---- sky-light ground wash --------------------------------------------------
    const skyTop = [lerp(10, 118, day) + dusk * 60, lerp(12, 140, day) + dusk * 20, lerp(26, 165, day)];
    g.fillStyle = `rgb(${skyTop.map((v) => v | 0).join(",")})`;
    g.fillRect(0, 0, W, H);
    const amb = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.72);
    amb.addColorStop(0, `rgba(255,${200 + day * 40 | 0},${150 + day * 90 | 0},${0.10 + day * 0.10})`);
    amb.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = amb; g.fillRect(0, 0, W, H);

    // ---- night sky: stars wheel about the celestial pole ------------------------
    if (day < 0.45) {
      const na = (1 - day / 0.45);
      const px = cx, py = cy - R * 1.15;                     // pole, up-north of plaza
      for (const st of this.stars) {
        const a = st.a + t * 0.01 + rotG;                    // truth-frame spins them too
        const x = px + Math.cos(a) * st.r * R * 1.6, y = py + Math.sin(a) * st.r * R * 1.6;
        if (x < 0 || x > W || y < 0 || y > H) continue;
        g.fillStyle = `rgba(225,232,255,${st.b * na * 0.8})`;
        g.fillRect(x, y, 1.3, 1.3);
      }
    }

    // ---- the plaza (rotates in truth frame) --------------------------------------
    g.save();
    g.translate(cx, cy); g.rotate(rotG); g.translate(-cx, -cy);

    // stone disc + rim
    const disc = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    const stone = 118 * (0.35 + day * 0.65);
    disc.addColorStop(0, `rgb(${stone + 26 | 0},${stone + 22 | 0},${stone + 14 | 0})`);
    disc.addColorStop(1, `rgb(${stone | 0},${stone - 2 | 0},${stone - 8 | 0})`);
    g.fillStyle = disc;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.10 + day * 0.08})`; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();

    // 24 hour graduations (XII at north)
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let hh = 0; hh < 24; hh++) {
      const a = -Math.PI / 2 + ((hh - 12) / 24) * TAU;       // 정오=북(위) — 정오 그림자가 북을 가리키므로
      const r0 = R * 0.9, r1 = hh % 6 === 0 ? R * 0.80 : R * 0.86;
      g.strokeStyle = `rgba(30,26,22,${0.35 + day * 0.25})`;
      g.lineWidth = hh % 6 === 0 ? 2.5 : 1.2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
      if (hh % 6 === 0) {
        g.fillStyle = `rgba(30,26,22,${0.45 + day * 0.3})`;
        g.font = `600 ${Math.max(11, R * 0.06)}px ui-monospace, Menlo, monospace`;
        g.fillText(String(hh).padStart(2, "0"), cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72);
      }
    }
    g.restore();

    // ---- shadows: cast in SCREEN space from rotated positions --------------------
    // screen direction of a shadow: away from the light's azimuth (north = up)
    const sd = lightAz + Math.PI;
    const dirX = Math.sin(sd), dirY = -Math.cos(sd);
    const elEff = Math.max(sun.el, 0.001);
    const shLen = clamp(1 / Math.tan(Math.max(elEff, 6 * D2R * 0.4)), 0.2, 6);
    const shA = clamp(Math.sin(sun.el) * 3, 0, 1) * (0.42 + 0.2 * day);

    const castShadow = (x, y, size, tall) => {
      if (sun.el <= 0 || shA <= 0.01) return;
      const L = size * 2.2 * tall * shLen * (R / 90);
      const grad = g.createLinearGradient(x, y, x + dirX * L, y + dirY * L);
      grad.addColorStop(0, `rgba(18,16,20,${shA})`);
      grad.addColorStop(1, "rgba(18,16,20,0)");
      g.strokeStyle = grad;
      g.lineWidth = size * 1.5;
      g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dirX * L, y + dirY * L); g.stroke();
    };

    // props (positions rotate with the ground)
    for (const p of this.props) {
      const a = p.a + rotG;
      const x = cx + Math.cos(a) * p.r * R, y = cy + Math.sin(a) * p.r * R;
      castShadow(x, y, p.s, p.tall);
      g.fillStyle = `rgb(${stone - 26 | 0},${stone - 30 | 0},${stone - 34 | 0})`;
      g.beginPath(); g.arc(x, y, p.s, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,255,255,${0.10 + day * 0.14})`;
      g.beginPath(); g.arc(x - p.s * 0.25, y - p.s * 0.25, p.s * 0.45, 0, TAU); g.fill();
    }

    // the gnomon: its shadow is THE clock hand
    if (sun.el > 0) {
      const L = R * 0.62 * clamp(shLen, 0.25, 2.2);
      const tipX = cx + dirX * L, tipY = cy + dirY * L;
      const grad = g.createLinearGradient(cx, cy, tipX, tipY);
      grad.addColorStop(0, `rgba(14,12,16,${shA * 1.5})`);
      grad.addColorStop(0.8, `rgba(14,12,16,${shA * 0.8})`);
      grad.addColorStop(1, "rgba(14,12,16,0)");
      g.strokeStyle = grad; g.lineWidth = Math.max(5, R * 0.035); g.lineCap = "round";
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(tipX, tipY); g.stroke();
      g.fillStyle = `rgba(20,18,24,${shA})`;
      g.beginPath(); g.arc(tipX, tipY, Math.max(3, R * 0.02), 0, TAU); g.fill();
    }
    // gnomon body (a bronze disc + needle seen from above)
    g.fillStyle = "#3c332a";
    g.beginPath(); g.arc(cx, cy, R * 0.055, 0, TAU); g.fill();
    g.fillStyle = `rgba(214,178,120,${0.5 + day * 0.5})`;
    g.beginPath(); g.arc(cx, cy, R * 0.032, 0, TAU); g.fill();

    // birds (tap): a shadow slides across the plaza
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.u += dt * 0.45;
      if (b.u > 1) { this.birds.splice(i, 1); continue; }
      const bx = lerp(b.dir > 0 ? -40 : W + 40, b.dir > 0 ? W + 40 : -40, b.u);
      const by = b.y * H + Math.sin(b.u * 9) * 12;
      if (sun.el > 0) {
        g.fillStyle = `rgba(16,14,18,${shA * 0.9})`;
        g.save(); g.translate(bx, by); g.rotate(Math.sin(b.u * 18) * 0.2);
        g.beginPath(); g.ellipse(0, 0, 11, 3.4, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(-8, -2, 6, 2.2, 0.5, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(8, -2, 6, 2.2, -0.5, 0, TAU); g.fill();
        g.restore();
      }
    }

    // ---- captions ---------------------------------------------------------------
    const d2 = new Date(Date.now() + (this.scrubH + this.holdH) / (15 * D2R) * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    g.font = `600 ${Math.max(13, H * 0.021)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "top";
    g.fillStyle = day > 0.4 ? "rgba(30,26,22,0.7)" : "rgba(220,226,240,0.75)";
    g.fillText(`${pad(d2.getHours())}:${pad(d2.getMinutes())}:${pad(d2.getSeconds())} · 태양 고도 ${(sun.el / D2R).toFixed(1)}°`, W / 2, 16);

    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textBaseline = "bottom";
    g.fillStyle = day > 0.4 ? "rgba(30,26,22,0.65)" : "rgba(220,226,240,0.7)";
    let cap;
    if (truth) cap = "빛은 고정되어 있습니다 — 도는 것은 바닥, 지구, 당신입니다";
    else if (sun.el <= 0) cap = "밤 — 지구 전체가 드리운 그림자 속입니다 · 꾹 누르면 지구가 돕니다";
    else cap = "그림자가 곧 시곗바늘 · 드래그 = 하루 감기 · 꾹 = 진실의 프레임 · 클릭 = 새";
    g.fillText(cap, W / 2, H - 14);
  }

  controls(host) {
    host.appendChild(slider("LATITUDE", -60, 78, this.lat, 0.5, (v) => (this.lat = v)));
    host.appendChild(slider("SEASON", -182, 182, this.season, 1, (v) => (this.season = v)));
  }
}
