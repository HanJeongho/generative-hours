// ============================================================================
//  93 · Copycat — 동물 따라쟁이
//  화면 한가운데 커다란 아기 동물 얼굴이 관람객을 흉내 낸다. 얼굴 위치를
//  스프링으로 따라오고, 고개 기울기(눈선 33-263)만큼 갸웃하고, 내가 입을
//  벌리면 동물도 입을 벌리고, 눈을 깜빡이면 동물도 깜빡인다. 입을 아주 크게
//  벌리면 까르르 웃으며 반짝이가 터지고 다음 동물로 변신 —
//  고양이→토끼→곰→여우 순환(귀·색·수염이 다름). 15초마다 자동 변신도.
//  얼굴 마커는 없다. 동물이 곧 거울. 카메라가 없으면 커서를 따라다니며
//  가끔 윙크한다. 실패 없음, 점수 없음 — 언제나 예쁜 일만 일어난다.
// ============================================================================

import { clamp, lerp, rand, TAU } from "../engine.js";
import { VisionPiece, FACE } from "../vision.js";

// 파스텔·따뜻한 톤. 귀 모양(ears)·색·수염(whisk)이 동물마다 다르다.
const ANIMALS = [
  { name: "고양이", ears: "cat",    fur: "#ffd7a8", inner: "#ffb0c4", nose: "#ff7fa0", cheek: "#ff9ec2", muzzle: "#fff2e2", whisk: true  },
  { name: "토끼",   ears: "rabbit", fur: "#fdeef2", inner: "#ffbcd2", nose: "#ff8fb0", cheek: "#ffb3cf", muzzle: "#ffffff", whisk: true  },
  { name: "곰",     ears: "bear",   fur: "#d9a878", inner: "#e9c39a", nose: "#5a4636", cheek: "#f0a98d", muzzle: "#f0dcc2", whisk: false },
  { name: "여우",   ears: "fox",    fur: "#ffb072", inner: "#fff0e2", nose: "#4a3324", cheek: "#ff9d86", muzzle: "#fff4ea", whisk: true  },
];

export default class Copycat extends VisionPiece {
  get tracker() { return "face"; }

  visionSetup() {
    this.ctx = this.canvas.getContext("2d");

    // 얼굴(동물) 상태 — 전부 스프링으로 부드럽게 따라간다
    this.face = { x: this.w * 0.5, y: this.h * 0.5 };
    this._faceTX = this.w * 0.5; this._faceTY = this.h * 0.5;
    this.tilt = 0; this.tiltTarget = 0;
    this.mouth = 0; this.mouthTarget = 0;
    this.eyeL = 1; this.eyeR = 1;         // 동물 눈 열림(0 감음..1 뜸)
    this.eyeLT = 1; this.eyeRT = 1;
    this.closeness = 0.4; this.scale = 1;

    this.animal = 0;
    this.morphT = 0;          // 변신 팝 애니(0 유휴..1)
    this.giggle = 0;          // 까르르 웃음 에너지
    this.autoT = 0;           // 자동 변신 타이머
    this.bigLatch = false;    // 큰 입 변신 디바운스
    this.wink = 0; this.winkT = rand(3, 6);

    // 반짝이 풀 (고정 크기, 재사용)
    this.spk = [];
    for (let i = 0; i < 120; i++) this.spk.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, r: 0, hue: 0, rot: 0, spin: 0 });

    this._seedAmbient();
  }

  _seedAmbient() {
    this.amb = [];
    for (let i = 0; i < 28; i++) this.amb.push({ x: rand(this.w), y: rand(this.h), ph: rand(TAU), sp: rand(0.2, 0.7), r: rand(1.5, 3.5) });
  }

  onResize() { this._seedAmbient(); }

  _radius() { return Math.min(this.w, this.h) * 0.30; }

  // ---- 카메라: 얼굴 랜드마크를 읽어 동물에게 흉내낼 목표값을 세운다 --------
  visionFrame(dt, t, results) {
    dt = clamp(dt, 0, 0.05);
    const faces = results && results.faceLandmarks;
    if (faces && faces.length) {
      const lm = faces[0];
      const el = this.toCanvas(lm[FACE.LEFT_EYE]);   // 33
      const er = this.toCanvas(lm[FACE.RIGHT_EYE]);  // 263
      const eyeDist = Math.hypot(el.x - er.x, el.y - er.y) || 1;

      // 위치 = 두 눈 중점
      this._faceTX = (el.x + er.x) * 0.5;
      this._faceTY = (el.y + er.y) * 0.5 + eyeDist * 0.35;

      // 고개 기울기: 눈선 각도를 작은 롤로 정규화
      let ang = Math.atan2(er.y - el.y, er.x - el.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      this.tiltTarget = clamp(ang, -0.6, 0.6);

      // 가까움(눈 사이 거리) → 살짝 커진다
      const d = eyeDist / Math.min(this.w, this.h);
      this.closeness = clamp((d - 0.05) / (0.22 - 0.05), 0, 1);

      // 입 벌림: 13(윗입술)-14(아랫입술) 간격을 눈 간격으로 정규화
      const up = this.toCanvas(lm[13]), lo = this.toCanvas(lm[14]);
      const mo = Math.hypot(up.x - lo.x, up.y - lo.y) / eyeDist;
      this.mouthTarget = clamp((mo - 0.05) / 0.55, 0, 1);

      // 눈 깜빡임: 위/아래 눈꺼풀 간격 (거울이라 좌우 스왑해 매핑)
      const lu = this.toCanvas(lm[159]), ld = this.toCanvas(lm[145]);
      const ru = this.toCanvas(lm[386]), rd = this.toCanvas(lm[374]);
      const eoR = Math.hypot(lu.x - ld.x, lu.y - ld.y) / eyeDist;  // → 동물 오른눈
      const eoL = Math.hypot(ru.x - rd.x, ru.y - rd.y) / eyeDist;  // → 동물 왼눈
      this.eyeLT = clamp((eoL - 0.03) / 0.06, 0, 1);
      this.eyeRT = clamp((eoR - 0.03) / 0.06, 0, 1);

      // 아주 크게 벌리면 까르르 변신 (한 번만)
      if (this.mouthTarget > 0.85 && !this.bigLatch) { this._transform(); this.bigLatch = true; }
      if (this.mouthTarget < 0.5) this.bigLatch = false;
    }
    this._update(dt, t);
    this._render(dt, t, true);
  }

  // ---- 커서 폴백: 동물이 커서를 따라다니고 가끔 윙크 ------------------------
  drawIdle(dt, t) {
    dt = clamp(dt, 0, 0.05);
    const p = this.pointer;
    if (p.active) { this._faceTX = p.x; this._faceTY = p.y; }
    else { this._faceTX = this.w * (0.5 + 0.07 * Math.sin(t * 0.5)); this._faceTY = this.h * (0.5 + 0.05 * Math.cos(t * 0.4)); }

    this.tiltTarget = 0.12 * Math.sin(t * 0.6);
    this.closeness = 0.4;
    this.mouthTarget = 0.04 + 0.05 * Math.max(0, Math.sin(t * 1.4));  // 살짝 숨쉬는 입

    // 가끔 한쪽 눈 윙크
    this.winkT -= dt;
    if (this.wink > 0) { this.wink -= dt * 3.2; if (this.wink < 0) this.wink = 0; }
    if (this.winkT <= 0) { this.wink = 1; this.winkT = rand(3.5, 7); }
    this.eyeLT = 1; this.eyeRT = 1 - this.wink;

    this._update(dt, t);
    this._render(dt, t, false);
  }

  _transform() {
    this.morphT = 1e-4;
    this.animal = (this.animal + 1) % ANIMALS.length;
    this.autoT = 0;
    this.giggle = 1;
    this._burst();
  }

  _burst() {
    const cx = this.face.x, cy = this.face.y;
    let n = 0;
    for (const s of this.spk) {
      if (s.life > 0) continue;
      const a = rand(TAU), sp = rand(90, 360);
      s.life = rand(0.6, 1.2); s.max = s.life;
      s.x = cx + rand(-30, 30); s.y = cy + rand(-30, 30);
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - 60;
      s.r = rand(3, 9); s.hue = rand(0, 360); s.rot = rand(TAU); s.spin = rand(-6, 6);
      if (++n >= 46) break;
    }
  }

  _update(dt, t) {
    const kPos = 1 - Math.pow(1 - 0.16, dt * 60);
    this.face.x = lerp(this.face.x, this._faceTX, kPos);
    this.face.y = lerp(this.face.y, this._faceTY, kPos);
    const R = this._radius();
    this.face.x = clamp(this.face.x, R * 0.75, this.w - R * 0.75);
    this.face.y = clamp(this.face.y, R * 1.05, this.h - R * 0.55);

    this.tilt = lerp(this.tilt, this.tiltTarget, 1 - Math.pow(1 - 0.14, dt * 60));
    this.mouth = lerp(this.mouth, this.mouthTarget, 1 - Math.pow(1 - 0.30, dt * 60));
    this.eyeL = lerp(this.eyeL, this.eyeLT, 1 - Math.pow(1 - 0.5, dt * 60));
    this.eyeR = lerp(this.eyeR, this.eyeRT, 1 - Math.pow(1 - 0.5, dt * 60));
    this.scale = lerp(this.scale, 1 + this.closeness * 0.12, 1 - Math.pow(1 - 0.08, dt * 60));

    if (this.morphT > 0) { this.morphT += dt * 2.2; if (this.morphT >= 1) this.morphT = 0; }
    if (this.giggle > 0) { this.giggle -= dt * 1.5; if (this.giggle < 0) this.giggle = 0; }

    this.autoT += dt;
    if (this.autoT >= 15) this._transform();

    for (const s of this.spk) {
      if (s.life <= 0) continue;
      s.life -= dt; s.vy += 280 * dt; s.vx *= 0.98;
      s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.spin * dt;
    }
    for (const a of this.amb) a.ph += dt * a.sp;
  }

  // ---- 렌더 ------------------------------------------------------------------
  _render(dt, t, camera) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const A = ANIMALS[this.animal];
    const fx = this.face.x, fy = this.face.y, R = this._radius();

    this._background(g, A, fx, fy, R, t);

    // 얼굴 그룹: 위치 → 웃음 들썩 → 기울기 → 스케일(가까움+변신 팝)
    let pop = 1;
    if (this.morphT > 0) pop = 1 + 0.28 * Math.sin(this.morphT * Math.PI);
    const bob = this.giggle > 0 ? Math.sin(t * 26) * this.giggle * 6 : 0;
    g.save();
    g.translate(fx, fy + bob);
    g.rotate(this.tilt);
    const s = this.scale * pop;
    g.scale(s, s);
    this._drawAnimal(g, A, R);
    g.restore();

    this._sparkles(g);
    this._caption(g, camera);
  }

  _background(g, A, fx, fy, R, t) {
    const grd = g.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, "#fff5ea"); grd.addColorStop(1, "#ffe3cf");
    g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);

    // 동물 색으로 은은히 숨쉬는 후광
    const rr = R * (2.2 + 0.12 * Math.sin(t * 1.1));
    const rg = g.createRadialGradient(fx, fy, 0, fx, fy, rr);
    rg.addColorStop(0, A.inner); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); g.globalAlpha = 0.30; g.fillStyle = rg;
    g.beginPath(); g.arc(fx, fy, rr, 0, TAU); g.fill(); g.restore();

    // 떠다니는 파스텔 반짝 점 — 아무도 없어도 배경이 살아 숨쉰다
    for (const p of this.amb) {
      const yy = p.y + Math.sin(p.ph) * 9;
      g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(p.ph * 1.3));
      g.fillStyle = "#ffcaa8";
      g.beginPath(); g.arc(p.x, yy, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  _caption(g, camera) {
    g.save();
    g.textAlign = "center";
    g.font = "12px ui-monospace, monospace";
    g.fillStyle = "rgba(120,90,70,0.72)";
    const msg = camera ? "입을 크게 벌리면 까르르 변신해요" : "커서를 따라오는 아기 동물";
    g.fillText(msg, this.w / 2, this.h - 14);
    g.restore();
  }

  // ---- 절차적 동물 얼굴 (로컬 좌표: 얼굴 중심 0,0) --------------------------
  _drawAnimal(g, A, R) {
    this._ears(g, A, R);                            // 귀 (얼굴 뒤)

    g.fillStyle = A.fur;                            // 둥근 얼굴
    g.beginPath(); g.ellipse(0, 0, R, R * 0.92, 0, 0, TAU); g.fill();

    g.fillStyle = A.muzzle;                         // 밝은 주둥이 패치
    g.beginPath(); g.ellipse(0, R * 0.30, R * 0.52, R * 0.44, 0, 0, TAU); g.fill();

    g.save(); g.globalAlpha = 0.5; g.fillStyle = A.cheek;   // 볼터치
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * R * 0.56, R * 0.14, R * 0.17, R * 0.11, 0, 0, TAU); g.fill(); }
    g.restore();

    // 웃을 땐 눈이 행복하게 감긴다
    const gl = 1 - clamp(this.giggle * 1.5, 0, 1);
    this._eye(g, -R * 0.40, -R * 0.06, R * 0.18, this.eyeL * gl, A);
    this._eye(g,  R * 0.40, -R * 0.06, R * 0.18, this.eyeR * gl, A);

    g.fillStyle = A.nose;                           // 코 (둥근 세모)
    g.beginPath();
    g.moveTo(-R * 0.10, R * 0.10);
    g.quadraticCurveTo(R * 0.10, R * 0.08, R * 0.10, R * 0.11);
    g.quadraticCurveTo(R * 0.02, R * 0.27, 0, R * 0.27);
    g.quadraticCurveTo(-R * 0.02, R * 0.27, -R * 0.10, R * 0.10);
    g.fill();

    this._mouth(g, R, Math.max(this.mouth, this.giggle * 0.9), A);

    if (A.whisk) {                                  // 수염
      g.strokeStyle = "rgba(120,90,70,0.45)";
      g.lineWidth = Math.max(1, R * 0.012); g.lineCap = "round";
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
        const yy = R * (0.18 + i * 0.08);
        g.beginPath(); g.moveTo(sx * R * 0.24, R * 0.22); g.lineTo(sx * R * 0.66, yy - R * 0.04); g.stroke();
      }
    }
  }

  _ears(g, A, R) {
    for (const sx of [-1, 1]) {
      const ex = sx * R * 0.6;
      if (A.ears === "cat" || A.ears === "fox") {
        const tall = A.ears === "fox" ? 0.74 : 0.58, wide = A.ears === "fox" ? 0.24 : 0.33;
        const ey = -R * 0.58, apx = ex + sx * R * 0.08, apy = ey - R * tall;
        g.fillStyle = A.fur;
        g.beginPath(); g.moveTo(ex - R * wide, ey + R * 0.16); g.lineTo(apx, apy); g.lineTo(ex + R * wide, ey + R * 0.16); g.closePath(); g.fill();
        const f = A.ears === "fox" ? 0.72 : 0.5;
        g.fillStyle = A.inner;
        g.beginPath(); g.moveTo(ex - R * wide * f, ey + R * 0.06); g.lineTo(apx, apy + R * 0.16); g.lineTo(ex + R * wide * f, ey + R * 0.06); g.closePath(); g.fill();
      } else if (A.ears === "rabbit") {
        g.save(); g.translate(ex, -R * 0.55); g.rotate(sx * 0.16);
        g.fillStyle = A.fur; g.beginPath(); g.ellipse(0, -R * 0.26, R * 0.19, R * 0.62, 0, 0, TAU); g.fill();
        g.fillStyle = A.inner; g.beginPath(); g.ellipse(0, -R * 0.22, R * 0.10, R * 0.48, 0, 0, TAU); g.fill();
        g.restore();
      } else { // bear
        g.fillStyle = A.fur; g.beginPath(); g.arc(ex, -R * 0.72, R * 0.30, 0, TAU); g.fill();
        g.fillStyle = A.inner; g.beginPath(); g.arc(ex, -R * 0.72, R * 0.16, 0, TAU); g.fill();
      }
    }
  }

  _eye(g, x, y, r, open, A) {
    if (open < 0.14) {                              // 감은 눈 = 행복한 ⌣
      g.strokeStyle = "#5a4636"; g.lineWidth = Math.max(2, r * 0.24); g.lineCap = "round";
      g.beginPath(); g.moveTo(x - r * 0.7, y - r * 0.15);
      g.quadraticCurveTo(x, y + r * 0.4, x + r * 0.7, y - r * 0.15); g.stroke();
      return;
    }
    const ry = r * clamp(open, 0.14, 1);
    g.fillStyle = "#2e231d";
    g.beginPath(); g.ellipse(x, y, r * 0.9, ry, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath(); g.arc(x - r * 0.30, y - ry * 0.42, r * 0.28, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.arc(x + r * 0.24, y + ry * 0.22, r * 0.12, 0, TAU); g.fill();
  }

  _mouth(g, R, m, A) {
    const my = R * 0.28;
    if (m < 0.12) {                                 // 다문 입 = 앙증맞은 ⌣⌣
      g.strokeStyle = "#5a4636"; g.lineWidth = Math.max(1.5, R * 0.014); g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, my); g.quadraticCurveTo(-R * 0.14, my + R * 0.12, -R * 0.24, my + R * 0.02);
      g.moveTo(0, my); g.quadraticCurveTo(R * 0.14, my + R * 0.12, R * 0.24, my + R * 0.02);
      g.stroke();
    } else {                                        // 벌린 입 + 혀
      const w = R * (0.14 + 0.13 * m), h = R * (0.06 + 0.34 * m);
      g.save();
      g.fillStyle = "#7a3b46";
      g.beginPath(); g.ellipse(0, my + h * 0.4, w, h, 0, 0, TAU); g.fill();
      g.clip();
      g.fillStyle = "#ff8ea6";
      g.beginPath(); g.ellipse(0, my + h * 0.9, w * 0.8, h * 0.7, 0, 0, TAU); g.fill();
      g.restore();
    }
  }

  _sparkles(g) {
    for (const s of this.spk) {
      if (s.life <= 0) continue;
      const a = clamp(s.life / s.max, 0, 1);
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot); g.globalAlpha = a;
      g.fillStyle = `hsl(${s.hue | 0},90%,72%)`;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? s.r * 0.4 : s.r; const ang = i / 8 * TAU; g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      g.closePath(); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
