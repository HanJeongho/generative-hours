// ============================================================================
//  47 · Nixie (닉시관의 시간) — 유리관 속에서 타는 숫자 [three.js / WebGL 3D]
//  진짜 3D 닉시관 시계. 각 관은:
//   · 유리 실린더+돔+배기 팁 (MeshPhysicalMaterial transmission — 진짜 굴절 유리)
//   · 0~9 와이어 음극 10장 = 폴리라인을 따라 뽑은 TubeGeometry 금속 와이어,
//     실물처럼 앞뒤로 겹쳐 쌓임(STACK 순서) — 전압 걸린 한 장만 emissive로
//     타오르고 UnrealBloom이 네온 광휘를 만든다
//   · 숫자 앞뒤를 감싸는 육각 양극 메시(알파맵 실린더 — 닉시의 시그니처)
//   · 금속 소켓, 월넛 보드, 관마다 오렌지 포인트라이트(보드에 글로우 풀)
//  숫자가 바뀌면 옛 음극의 잔광이 식으며 새 음극이 달아오른다(크로스페이드).
//  인터랙션: 관 탭 = 슬롯 스핀(음극 10장이 차르륵) · 드래그 = 카메라 궤도 ·
//  빈 곳 홀드 = 전원 새그 → 놓으면 좌→우 플리커 재점화 · GLOW/FLICKER · 12/24h
// ============================================================================

import { ThreePiece, THREE } from "../three-piece.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, TAU } from "../engine.js";

const ell = (cx, cy, rx, ry, n = 18, a0 = 0) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU;
    p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return p;
};
const GLYPH = {
  0: [ell(0.31, 0.5, 0.24, 0.44)],
  1: [[[0.17, 0.22], [0.33, 0.06], [0.33, 0.94]]],
  2: [[[0.08, 0.28], [0.13, 0.12], [0.31, 0.06], [0.49, 0.12], [0.54, 0.28], [0.48, 0.46], [0.13, 0.78], [0.08, 0.94], [0.56, 0.94]]],
  3: [[[0.09, 0.1], [0.53, 0.1], [0.29, 0.4], [0.47, 0.44], [0.56, 0.62], [0.51, 0.82], [0.33, 0.94], [0.14, 0.88], [0.08, 0.76]]],
  4: [[[0.43, 0.94], [0.43, 0.06], [0.07, 0.64], [0.59, 0.64]]],
  5: [[[0.51, 0.06], [0.13, 0.06], [0.10, 0.46], [0.31, 0.38], [0.51, 0.48], [0.54, 0.7], [0.39, 0.94], [0.15, 0.9], [0.08, 0.78]]],
  6: [[[0.47, 0.06], [0.23, 0.26], [0.10, 0.56], [0.14, 0.84], [0.34, 0.94], [0.51, 0.84], [0.54, 0.64], [0.41, 0.5], [0.22, 0.54], [0.11, 0.68]]],
  7: [[[0.08, 0.06], [0.57, 0.06], [0.27, 0.94]]],
  8: [ell(0.31, 0.27, 0.19, 0.2), ell(0.31, 0.71, 0.24, 0.23)],
  9: [[[0.19, 0.94], [0.41, 0.72], [0.53, 0.42], [0.49, 0.16], [0.29, 0.06], [0.12, 0.16], [0.10, 0.38], [0.23, 0.5], [0.41, 0.46], [0.52, 0.32]]],
};
// front-to-back stacking order of the ten cathodes (like a real IN-14)
const STACK = [6, 7, 5, 8, 4, 3, 9, 2, 0, 1];

export default class Nixie3D extends ThreePiece {
  build() {
    this.bloomPass.strength = 0.6;
    this.bloomPass.radius = 0.5;
    this.bloomPass.threshold = 0.55;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x070504);

    this.glow = 1.0; this.flicker = 1.0; this.h24 = false;

    // camera (front, slightly above; drag orbits within a window)
    this.camTheta = 0; this.camPhi = 0.10;
    this._applyCam();

    // lights
    const key = new THREE.DirectionalLight(0xffe2c0, 0.55);
    key.position.set(4, 8, 6); this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x201612, 0.7));
    this.lampL = new THREE.PointLight(0xff7a22, 1.6, 9, 1.8);
    this.lampL.position.set(-2.7, -0.6, 1.2); this.scene.add(this.lampL);
    this.lampR = new THREE.PointLight(0xff7a22, 1.6, 9, 1.8);
    this.lampR.position.set(2.7, -0.6, 1.2); this.scene.add(this.lampR);

    // ---- board ---------------------------------------------------------------
    const boardY = -1.95;
    this.boardY = boardY;
    const wood = this.track(new THREE.MeshStandardMaterial({
      color: 0x3a2410, metalness: 0.25, roughness: 0.45,
    }));
    const board = new THREE.Mesh(this.track(new THREE.BoxGeometry(12.4, 0.55, 3.4)), wood);
    board.position.set(0, boardY - 0.28, 0);
    this.scene.add(board);

    // ---- tube layout: HH MM SS with colon gaps -------------------------------
    const pitch = 1.78, cgap = 0.62;
    const xs = [];
    let x = 0;
    for (let i = 0; i < 6; i++) {
      xs.push(x);
      x += pitch + ((i === 1 || i === 3) ? cgap : 0);
    }
    const off = (xs[0] + xs[5]) / 2;
    this.xs = xs.map((v) => v - off);
    this.colX = [
      (this.xs[1] + this.xs[2]) / 2,
      (this.xs[3] + this.xs[4]) / 2,
    ];

    // shared geometries/materials
    const TUBE_R = 0.66, GLASS_H = 2.55;
    this.tubeR = TUBE_R;
    const glassMat = this.track(new THREE.MeshPhysicalMaterial({
      color: 0xcfe0e8, metalness: 0, roughness: 0.06,
      transmission: 0.92, transparent: true, opacity: 0.22,
      thickness: 0.25, ior: 1.5, envMapIntensity: 1.2,
    }));
    const cylGeo = this.track(new THREE.CylinderGeometry(TUBE_R, TUBE_R, GLASS_H, 36, 1, true));
    const domeGeo = this.track(new THREE.SphereGeometry(TUBE_R, 36, 18, 0, TAU, 0, Math.PI / 2));
    const tipGeo = this.track(new THREE.CylinderGeometry(0.055, 0.075, 0.16, 12));
    const sockGeo = this.track(new THREE.CylinderGeometry(TUBE_R * 0.98, TUBE_R * 1.08, 0.3, 32));
    const sockMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x8a8378, metalness: 1.0, roughness: 0.35, envMapIntensity: 1.4,
    }));
    const baseGeo = this.track(new THREE.CylinderGeometry(TUBE_R * 0.92, TUBE_R * 0.92, 0.10, 32));
    const baseMat = this.track(new THREE.MeshStandardMaterial({ color: 0x14100c, metalness: 0.6, roughness: 0.6 }));

    // hex anode mesh (alpha-mapped cylinder around the cathode stack)
    const hexTex = this._hexTexture();
    const meshMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x090604, alphaMap: hexTex, transparent: true,
      opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    }));
    const meshGeo = this.track(new THREE.CylinderGeometry(TUBE_R * 0.74, TUBE_R * 0.74, 1.9, 30, 1, true));

    // ---- build the six tubes --------------------------------------------------
    this.tubes = [];
    for (let i = 0; i < 6; i++) {
      const grp = new THREE.Group();
      grp.position.set(this.xs[i], boardY, 0);
      this.scene.add(grp);

      const sock = new THREE.Mesh(sockGeo, sockMat); sock.position.y = 0.15; grp.add(sock);
      const bplate = new THREE.Mesh(baseGeo, baseMat); bplate.position.y = 0.33; grp.add(bplate);

      // cathode stack: ten wire digits, front-to-back
      const mats = [];
      const S = 1.62;                       // digit height scale
      for (let d = 0; d < 10; d++) {
        const z = (4.5 - STACK.indexOf(d)) * 0.036;
        const mat = this.track(new THREE.MeshStandardMaterial({
          color: 0x241610, emissive: new THREE.Color(0xff7a22),
          emissiveIntensity: 0, metalness: 0.7, roughness: 0.35,
        }));
        mats.push(mat);
        for (const line of GLYPH[d]) {
          const pts = line.map(([gx, gy]) =>
            new THREE.Vector3(((gx / 0.62) - 0.5) * S * 0.66, (0.5 - gy) * S + 1.55, z));
          const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-4;
          if (closed) pts.pop();
          const curve = new THREE.CatmullRomCurve3(pts, closed, "centripetal");
          const geo = this.track(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 4), 0.028, 6, closed));
          grp.add(new THREE.Mesh(geo, mat));
        }
      }

      const anode = new THREE.Mesh(meshGeo, meshMat);
      anode.position.y = 1.55; grp.add(anode);

      const glass = new THREE.Mesh(cylGeo, glassMat);
      glass.position.y = 0.38 + GLASS_H / 2; grp.add(glass);
      const dome = new THREE.Mesh(domeGeo, glassMat);
      dome.position.y = 0.38 + GLASS_H; grp.add(dome);
      const tip = new THREE.Mesh(tipGeo, glassMat);
      tip.position.y = 0.38 + GLASS_H + TUBE_R + 0.06; grp.add(tip);

      this.tubes.push({
        grp, mats, glass,
        digit: -1, prev: -1, fade: 0,
        spin: 0, spinPos: Math.random() * 10,
        strike: 1, strikeAt: -1,
        seed: Math.random() * 100,
      });
    }

    // ---- colons: neon dot pairs ------------------------------------------------
    this.colDots = [];
    const dotGeo = this.track(new THREE.SphereGeometry(0.085, 14, 12));
    for (const cx of this.colX) {
      for (const oy of [1.15, 1.95]) {
        const mat = this.track(new THREE.MeshStandardMaterial({
          color: 0x2a1a10, emissive: new THREE.Color(0xffb24a), emissiveIntensity: 0,
          metalness: 0.4, roughness: 0.4,
        }));
        const mesh = new THREE.Mesh(dotGeo, mat);
        mesh.position.set(cx, boardY + oy, 0.15);
        this.scene.add(mesh);
        this.colDots.push(mat);
      }
    }

    // AM/PM lamp plate
    this.ampm = this.makeTextTexture({ w: 256, h: 128, fill: "#ff9a3c" });
    const pmMat = this.track(new THREE.MeshBasicMaterial({
      map: this.ampm.texture, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.pmPlate = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.9, 0.45)), pmMat);
    this.pmPlate.position.set(this.xs[5] + 1.35, boardY + 0.75, 0.2);
    this.scene.add(this.pmPlate);

    // interaction state
    this.ray = new THREE.Raycaster();
    this.sag = 0; this._sagging = false;
    this._downAt = 0; this._moved = false;
  }

  _hexTexture() {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#fff"; g.lineWidth = 2.4;
    const hs = 9, hw = hs * Math.sqrt(3), hh = hs * 1.5;
    const hex = (cx, cy) => {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI / 6 + (i / 6) * TAU;
        const X = cx + Math.cos(a) * hs, Y = cy + Math.sin(a) * hs;
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
    };
    for (let r = -1; r < 128 / hh + 1; r++)
      for (let q = -1; q < 128 / hw + 1; q++)
        hex(q * hw + (r % 2 ? hw / 2 : 0), r * hh);
    const tex = this.track(new THREE.CanvasTexture(c));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    return tex;
  }

  _applyCam() {
    const cp = clamp(this.camPhi, -0.12, 0.62);
    const th = clamp(this.camTheta, -0.85, 0.85);
    const R = 10.6;
    this.camera.position.set(
      R * Math.cos(cp) * Math.sin(th),
      0.35 + R * Math.sin(cp),
      R * Math.cos(cp) * Math.cos(th));
    this.camera.lookAt(0, -0.35, 0);
  }

  _timeDigits() {
    const d = new Date();
    const h = d.getHours();
    const hd = this.h24 ? h : (h % 12 === 0 ? 12 : h % 12);
    const pad = (n) => String(n).padStart(2, "0");
    const s = pad(hd) + pad(d.getMinutes()) + pad(d.getSeconds());
    return { digits: [...s].map(Number), pm: h >= 12 };
  }

  onPointerDown() {
    this._downAt = performance.now(); this._moved = false;
    // decide sag vs tube at press time
    const ndc = new THREE.Vector2((this.pointer.x / this.w) * 2 - 1, -(this.pointer.y / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this._downTube = -1;
    for (let i = 0; i < 6; i++)
      if (this.ray.intersectObject(this.tubes[i].glass, false).length) { this._downTube = i; break; }
    this._sagging = this._downTube < 0;
  }
  onPointerUp() {
    if (!this._moved && performance.now() - this._downAt < 300 && this._downTube >= 0) {
      const tb = this.tubes[this._downTube];
      tb.spin = Math.max(tb.spin, 1.0);              // slot-machine spin
    }
    if (this._sagging && this.sag > 0.25) {
      const now = this.t || 0;
      this.tubes.forEach((tb, i) => { tb.strike = 0; tb.strikeAt = now + 0.15 + i * 0.14; });
    }
    this._sagging = false;
  }

  update(dt, t) {
    // camera drag
    if (this.pointer.down && this.pointer.active) {
      if (Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 4) this._moved = true;
      if (this._moved) {
        this.camTheta -= this.pointer.vx * 0.005;
        this.camPhi += this.pointer.vy * 0.005;
        this._sagging = false;
      }
    }
    this._applyCam();

    const sagging = this._sagging && this.pointer.down && this.pointer.active &&
      performance.now() - this._downAt > 300;
    this.sag = clamp(this.sag + (sagging ? dt * 2.2 : -dt * 3.5), 0, 1);

    // ---- clock → cathode states ------------------------------------------------
    const { digits, pm } = this._timeDigits();
    for (let i = 0; i < 6; i++) {
      const tb = this.tubes[i];
      if (tb.digit !== digits[i]) {
        tb.prev = tb.digit; tb.digit = digits[i];
        tb.fade = tb.prev >= 0 ? 1 : 0;
      }
      tb.fade = Math.max(0, tb.fade - dt * 2.4);
      if (tb.spin > 0) {
        tb.spin = Math.max(0, tb.spin - dt);
        tb.spinPos += dt * (8 + 30 * tb.spin);
      }
      if (tb.strikeAt >= 0 && t >= tb.strikeAt) {
        tb.strike = Math.min(1, tb.strike + dt * 6);
        if (tb.strike < 1 && Math.random() < 0.12) tb.strike *= 0.35;
        if (tb.strike >= 1) tb.strikeAt = -1;
      }

      const fl = 1 - this.flicker * (0.05 + 0.05 * Math.sin(t * 31 + tb.seed) * Math.sin(t * 7.3 + tb.seed * 2)) * (Math.sin(t * 53 + tb.seed) > 0.86 ? 2.2 : 1);
      const bright = tb.strike * (1 - this.sag * 0.95) * clamp(fl, 0.5, 1) * this.glow;

      const shown = tb.spin > 0 && tb.spin >= 0.05 ? Math.floor(tb.spinPos) % 10 : tb.digit;
      const ghost = tb.spin > 0 ? (shown + 9) % 10 : -1;
      for (let d = 0; d < 10; d++) {
        let target = 0;
        if (d === shown) target = 3.4 * bright;
        else if (d === ghost) target = 1.0 * bright;
        else if (d === tb.prev && tb.fade > 0.02 && tb.spin <= 0) target = tb.fade * 1.2 * bright;
        const m = tb.mats[d];
        m.emissiveIntensity = lerp(m.emissiveIntensity, target, clamp(dt * 14, 0, 1));
      }
    }

    // colons blink each second
    const on = new Date().getMilliseconds() < 500;
    const colI = (on ? 2.6 : 0.12) * (1 - this.sag * 0.95) * this.glow;
    for (const m of this.colDots) m.emissiveIntensity = lerp(m.emissiveIntensity, colI, clamp(dt * 16, 0, 1));

    // lamps + bloom follow the power state
    const power = (1 - this.sag * 0.92) * this.glow;
    this.lampL.intensity = this.lampR.intensity = 1.7 * power;
    this.bloomPass.strength = 0.6 * (0.35 + 0.65 * power);

    // AM/PM
    this.pmPlate.visible = !this.h24;
    if (!this.h24) this.ampm.set(pm ? "PM" : "AM");
  }

  controls(host) {
    host.appendChild(slider("GLOW", 0.5, 1.4, this.glow, 0.05, (v) => (this.glow = v)));
    host.appendChild(slider("FLICKER", 0, 2.5, this.flicker, 0.05, (v) => (this.flicker = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
