// ============================================================================
//  44 · Clepsydra (자격루 自擊漏 — Jang Yeong-sil's self-striking water clock, 1434)
//  [three.js / WebGL 3D]  Now you can SEE where the ball comes from.
//
//  Real 3D so the mechanism reads as a machine, not a diagram:
//   · 수수호 (receiving vessel) — a glass cylinder; regulated water rises inside it,
//     lifting a brass 부전 (float rod). The rod's height IS the time.
//   · 잣대 동판 (release plate) — a bronze ladder of HOLES beside the vessel, each
//     holding a brass ball. When the float collar rises to a hole, it nudges that
//     ball OUT — so the ball visibly comes FROM the plate, not from nowhere.
//   · 방목 (runway) — the freed ball drops onto an inclined rail and rolls down…
//   · 시보 (the striker) — …into a lever that swings a jack's mallet against an
//     instrument: 鐘 bell (minute) · 鼓 drum (hour) · 鉦 gong (midnight). Each has
//     its own hole-row, rail, and jack — the instrument differs because a different
//     hole released the ball. Continuous water → one discrete ball → struck bell.
//
//  PBR brass/bronze + PMREM reflections + UnrealBloom (the XI wing ceiling). Drag to
//  orbit the camera around the machine; the simulation buttons trip a ball on demand.
// ============================================================================

import { ThreePiece, THREE } from "../three-piece.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, TAU } from "../engine.js";

const BRASS = 0xc9a86a, BRASS_DARK = 0x7a5e34, WATER = 0x6ec8e0;
// the three registers: minute→bell, hour→drum, midnight→gong
const REG = [
  { key: "min", label: "鐘", x: 3.4, hue: 0xffe6a0 },
  { key: "hr",  label: "鼓", x: 5.4, hue: 0xffcf88 },
  { key: "day", label: "鉦", x: 7.4, hue: 0xfff0c0 },
];

export default class Clepsydra extends ThreePiece {
  build() {
    this.bloomPass.strength = 0.5;
    this.bloomPass.radius = 0.45;
    this.bloomPass.threshold = 0.82;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x0a0b0e);

    // controls
    this.flow = 1.0; this.ripple = 1.0; this.h24 = false;

    // camera orbit — pulled back + angled so the whole pavilion (floor→roof) fits.
    this.camR = 34; this.camTheta = -0.62; this.camPhi = 0.12;
    this._applyCam();

    // lights (env map does most; a key + warm fill add crisp brass speculars)
    const key = new THREE.DirectionalLight(0xfff2dc, 1.2); key.position.set(7, 12, 9);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88a0c0, 0.4); fill.position.set(-8, 4, -6);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x202832, 0.6));

    const brass = (extra = {}) => this.track(new THREE.MeshStandardMaterial({
      color: BRASS, metalness: 1.0, roughness: 0.32, envMap: this.envMap, ...extra,
    }));
    const bronzeDark = this.track(new THREE.MeshStandardMaterial({
      color: BRASS_DARK, metalness: 0.95, roughness: 0.5, envMap: this.envMap,
    }));
    this._brass = brass;
    const wood = this.track(new THREE.MeshStandardMaterial({ color: 0x5a3a28, metalness: 0.1, roughness: 0.8, envMap: this.envMap }));
    const woodHi = this.track(new THREE.MeshStandardMaterial({ color: 0x8a5a3c, metalness: 0.15, roughness: 0.7, envMap: this.envMap }));
    const tile = this.track(new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.3, roughness: 0.6, envMap: this.envMap }));

    // ===== 누각 (the pavilion that HOUSES the whole mechanism) =================
    // a timber-framed, tiled-roof tower; every part below lives inside it so the
    // machine reads as one architectural object, not scattered floating pieces.
    const PAV = { x: 0, w: 18, d: 7, baseY: -0.6, postH: 13 };
    this._pav = PAV;
    const pgrp = new THREE.Group(); this.scene.add(pgrp);
    // floor platform
    const floor = new THREE.Mesh(this.track(new THREE.BoxGeometry(PAV.w + 1.5, 0.6, PAV.d + 1.2)), wood);
    floor.position.set(PAV.x, PAV.baseY - 0.3, 0); pgrp.add(floor);
    const floor2 = new THREE.Mesh(this.track(new THREE.BoxGeometry(PAV.w + 2.6, 0.4, PAV.d + 2.2)), woodHi);
    floor2.position.set(PAV.x, PAV.baseY - 0.7, 0); pgrp.add(floor2);
    // four corner posts
    const postGeo = this.track(new THREE.BoxGeometry(0.4, PAV.postH, 0.4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, wood);
      p.position.set(PAV.x + sx * PAV.w / 2, PAV.baseY + PAV.postH / 2, sz * PAV.d / 2); pgrp.add(p);
    }
    // top beams (front+back) the bells will hang from
    const beamGeo = this.track(new THREE.BoxGeometry(PAV.w + 0.6, 0.5, 0.5));
    this.beamY = PAV.baseY + PAV.postH;
    for (const sz of [-1, 1]) {
      const bm = new THREE.Mesh(beamGeo, woodHi);
      bm.position.set(PAV.x, this.beamY, sz * PAV.d / 2); pgrp.add(bm);
    }
    const crossBeam = new THREE.Mesh(this.track(new THREE.BoxGeometry(PAV.w + 0.6, 0.4, PAV.d)), wood);
    crossBeam.position.set(PAV.x, this.beamY + 0.05, 0); crossBeam.scale.y = 0.6; pgrp.add(crossBeam);
    // hipped tiled roof: a low pyramid (4-sided cone) sitting on the beams
    const roof = new THREE.Mesh(this.track(new THREE.ConeGeometry((PAV.w + 4) * 0.62, 3.2, 4)), tile);
    roof.position.set(PAV.x, this.beamY + 1.7, 0); roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, (PAV.d + 3) / ((PAV.w + 4) * 0.62) * 0.9); pgrp.add(roof);
    // a ridge cap + eave trim
    const ridge = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.5, 12, 10)), brass({ roughness: 0.4 }));
    ridge.position.set(PAV.x, this.beamY + 3.3, 0); pgrp.add(ridge);
    const eave = new THREE.Mesh(this.track(new THREE.BoxGeometry(PAV.w + 4.2, 0.3, PAV.d + 3.4)), tile);
    eave.position.set(PAV.x, this.beamY + 0.4, 0); pgrp.add(eave);

    // ===== 수수호: the receiving vessel (glass cylinder + rising water) =========
    this.vesselH = 9;            // full height of the water column
    this.vesselR = 1.5;
    this.vesselX = -7;           // left of the plate
    const grp = new THREE.Group(); grp.position.set(this.vesselX, 0, 0); this.scene.add(grp);
    this.vesselGroup = grp;
    // glass shell
    const glass = this.track(new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ef, metalness: 0, roughness: 0.05, transmission: 0.9, transparent: true,
      opacity: 0.32, thickness: 0.6, envMap: this.envMap, ior: 1.33,
    }));
    const shell = new THREE.Mesh(this.track(new THREE.CylinderGeometry(this.vesselR, this.vesselR, this.vesselH, 40, 1, true)), glass);
    shell.position.y = this.vesselH / 2; grp.add(shell);
    // brass base + rim rings
    const ring = this.track(new THREE.TorusGeometry(this.vesselR, 0.08, 12, 40));
    for (const yy of [0, this.vesselH]) { const m = new THREE.Mesh(ring, brass()); m.rotation.x = Math.PI / 2; m.position.y = yy; grp.add(m); }
    const base = new THREE.Mesh(this.track(new THREE.CylinderGeometry(this.vesselR * 1.2, this.vesselR * 1.3, 0.4, 40)), bronzeDark);
    base.position.y = -0.2; grp.add(base);
    // the water column — a cylinder we scale in Y as it fills
    this.waterMat = this.track(new THREE.MeshPhysicalMaterial({
      color: WATER, metalness: 0, roughness: 0.15, transmission: 0.6, transparent: true,
      opacity: 0.72, envMap: this.envMap, ior: 1.33,
      emissive: new THREE.Color(WATER), emissiveIntensity: 0.12,
    }));
    this.water = new THREE.Mesh(this.track(new THREE.CylinderGeometry(this.vesselR * 0.92, this.vesselR * 0.92, 1, 36)), this.waterMat);
    grp.add(this.water);
    // 부전: a float disc + tall brass rod with a collar that touches the plate holes
    this.floatGroup = new THREE.Group(); grp.add(this.floatGroup);
    const disc = new THREE.Mesh(this.track(new THREE.CylinderGeometry(this.vesselR * 0.8, this.vesselR * 0.8, 0.18, 32)), brass({ roughness: 0.25 }));
    this.floatGroup.add(disc);
    const rod = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 12)), brass());
    rod.position.y = 2.1; this.floatGroup.add(rod);
    // a collar near the rod tip — this is what nudges a ball out of a hole
    this.collar = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.14, 16, 12)), brass({ emissive: this.accentColor, emissiveIntensity: 0.3 }));
    this.collar.position.y = 4.1; this.floatGroup.add(this.collar);

    // ===== touch: raycaster + splash pools ====================================
    this.ray = new THREE.Raycaster();
    this.slosh = 0;
    this._downAt = 0; this._moved = false;
    this._splashRings = [];
    const srGeo = this.track(new THREE.TorusGeometry(1, 0.035, 8, 44));
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: WATER, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(srGeo, mat);
      mesh.rotation.x = Math.PI / 2; mesh.visible = false;
      grp.add(mesh);
      this._splashRings.push({ mesh, s: 0, op: 0, on: false });
    }
    this._drops = [];
    const dropGeo = this.track(new THREE.SphereGeometry(0.07, 8, 8));
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xaee6f5, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(dropGeo, mat);
      mesh.visible = false; grp.add(mesh);
      this._drops.push({ mesh, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }

    // ===== 잣대 동판: the graduated plate. The float rises over a WHOLE HOUR, so its
    // height = minutes elapsed this hour. The plate carries 60 minute-notches up its
    // face; whichever notch the float collar reaches releases a ball (→ 鐘). The TOP
    // notch (minute 60) is the hour mark (→ 鼓). So one vessel reads minutes by HEIGHT.
    this.plateX = -4.6;
    const plate = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.3, this.vesselH + 1, 1.6)), bronzeDark);
    plate.position.set(this.plateX, this.vesselH / 2, 0); this.scene.add(plate);
    this.ballGeo = this.track(new THREE.SphereGeometry(0.2, 20, 16));
    this.ballMat = this.track(new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: 0.25, envMap: this.envMap, emissive: 0x000000 }));
    // y for a given minute (0..60) up the plate; minute 0 near the base, 60 at the top
    this.notchY = (m) => lerp(this.vesselH * 0.06, this.vesselH * 0.98, m / 60);
    this.NMIN = 60;
    // engrave the 60 minute ticks (every 5th longer) on the plate face
    const tickGeo = this.track(new THREE.BoxGeometry(0.34, 0.025, 0.5));
    const tickGeoL = this.track(new THREE.BoxGeometry(0.42, 0.04, 0.9));
    const tickMat = brass({ roughness: 0.4, emissive: this.accentColor, emissiveIntensity: 0.06 });
    this.ticks = [];
    for (let m = 0; m <= 60; m++) {
      const big = m % 5 === 0;
      const tk = new THREE.Mesh(big ? tickGeoL : tickGeo, tickMat);
      tk.position.set(this.plateX + 0.04, this.notchY(m), 0);
      this.scene.add(tk); this.ticks.push(tk);
    }
    // the strike-trip rows sit at the front edge of the plate; the minute ball is born
    // at the float collar's current height, the hour/day balls at the top notch.
    this.holeZ = [0, 0, 0];               // (kept for rail z; all near plate centre)
    this.holeY = this.notchY(60);         // hour/day release height = top of the plate

    // ===== 시보: three instruments hung from the top beam, on a shelf inside the
    // pavilion. A railed TROUGH (U-channel with support struts) carries the ball
    // from the plate down to each instrument's jack. =========================
    this.instruments = [];
    this.rails = [];
    const shelfY = this.beamY - 2.2;            // the jack shelf height
    const shelf = new THREE.Mesh(this.track(new THREE.BoxGeometry(7, 0.3, PAV.d - 1.5)), woodHi);
    shelf.position.set(5.4, shelfY - 1.4, 0); this.scene.add(shelf);
    for (let i = 0; i < 3; i++) {
      const R = REG[i];
      const iz = (i - 1) * 1.6;                 // spread instruments across the depth
      const instR = 0.95 + i * 0.16;
      const jackX = R.x - instR - 0.6;
      // rail trough: LOW and DESCENDING — each hole-row has its own z-lane catch
      // mouth at the plate's base; the trough runs gently downhill to a pedal
      // beneath the instrument's jack. A released ball only ever falls/rolls DOWN;
      // it's the STRIKE that climbs, up the pedal rod (like the real lever train).
      const from = new THREE.Vector3(this.plateX + 0.55, 0.45, (i - 1) * 0.55);
      const to = new THREE.Vector3(jackX, -0.15, iz);
      this.rails.push({ from, to });
      const railLen = from.distanceTo(to);
      this.rails[i].len = railLen;
      const trough = new THREE.Group();
      const channel = new THREE.Mesh(this.track(new THREE.BoxGeometry(railLen, 0.16, 0.5)), brass({ roughness: 0.45 }));
      const lipL = new THREE.Mesh(this.track(new THREE.BoxGeometry(railLen, 0.18, 0.06)), brass({ roughness: 0.5 }));
      const lipR = lipL.clone(); lipL.position.z = -0.24; lipR.position.z = 0.24;
      trough.add(channel, lipL, lipR);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      trough.position.copy(mid);
      trough.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
      trough.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
      this.scene.add(trough);
      // two support struts down to the floor
      for (const fr of [0.35, 0.7]) {
        const sp = from.clone().lerp(to, fr);
        const strut = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.06, 0.06, sp.y - PAV.baseY, 8)), wood);
        strut.position.set(sp.x, (sp.y + PAV.baseY) / 2, sp.z); this.scene.add(strut);
      }
      // catch mouth: a small flared collar where the dropped ball lands in the trough
      const mouth = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.3, 0.05, 10, 24)), brass({ roughness: 0.4 }));
      mouth.rotation.x = Math.PI / 2; mouth.position.copy(from); mouth.position.y += 0.12;
      this.scene.add(mouth);

      // the bell/drum/gong HANGS from the top beam on a cord
      const inst = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(instR, 32, 24)),
        this.track(new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: 0.3, envMap: this.envMap, emissive: new THREE.Color(R.hue), emissiveIntensity: 0 }))
      );
      const instY = shelfY + 0.4;
      inst.position.set(R.x, instY, iz); inst.scale.set(1, 0.82, 1); this.scene.add(inst);
      const cord = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.03, 0.03, this.beamY - (instY + instR), 6)), bronzeDark);
      cord.position.set(R.x, (this.beamY + instY + instR) / 2, iz); this.scene.add(cord);
      // pedal + lever rod: the ball lands on a small pan at the trough's end and its
      // weight pushes the rod, which runs UP to the jack — that's how a falling ball
      // ends up swinging a mallet high above (the real lever/spoon train, simplified).
      const pan = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.34, 0.28, 0.1, 20)), brass({ roughness: 0.35 }));
      pan.position.set(jackX, -0.1, iz); this.scene.add(pan);
      const leverH = (shelfY - 1.1) - (-0.1);
      const lever = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.05, 0.05, leverH, 8)), bronzeDark);
      lever.position.set(jackX, -0.1 + leverH / 2, iz); this.scene.add(lever);

      // jack with a mallet, standing on the shelf beside the instrument
      const jack = new THREE.Group(); jack.position.set(jackX, shelfY - 1.1, iz); this.scene.add(jack);
      const jbody = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.13, 0.17, 1.3, 10)), brass({ roughness: 0.5 }));
      jbody.position.y = 0.65; jack.add(jbody);
      const jhead = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.24, 16, 12)), brass({ roughness: 0.5 }));
      jhead.position.y = 1.5; jack.add(jhead);
      const arm = new THREE.Group(); arm.position.set(0, 1.05, 0); jack.add(arm);
      const mallet = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 8)), brass());
      mallet.rotation.z = Math.PI / 2; mallet.position.x = 0.5; arm.add(mallet);
      const head = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.15, 12, 10)), brass({ roughness: 0.4 }));
      head.position.x = 1.0; arm.add(head);

      // 鐘/鼓/鉦 label hung above the instrument
      const lab = this.makeTextTexture({ w: 256, h: 256, fill: "#f0e0b0", font: "700 180px serif" });
      lab.set(R.label);
      const lm = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1.0, 1.0)),
        this.track(new THREE.MeshBasicMaterial({ map: lab.texture, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })));
      lm.position.set(R.x, instY + instR + 0.7, iz); this.scene.add(lm);

      this.instruments.push({ inst, arm, ring: 0, mallet: 0, instR, baseEmissive: new THREE.Color(R.hue) });
    }

    // ===== flying balls pool (released → rolling → strike) =====================
    this.flyBalls = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(this.ballGeo, this.ballMat.clone());
      b.visible = false; this.scene.add(b);
      this.flyBalls.push({ mesh: b, on: false, s: 0, kind: 0 });
      this.track(b.material);
    }

    // ===== readout plate pinned to the camera ==================================
    this.readout = this.makeTextTexture({ w: 1024, h: 256, fill: "#dfe7f2" });
    const plateMesh = new THREE.Mesh(this.track(new THREE.PlaneGeometry(4.4, 1.1)),
      this.track(new THREE.MeshBasicMaterial({ map: this.readout.texture, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })));
    plateMesh.position.set(0, -4.0, -11); this.camera.add(plateMesh); this.scene.add(this.camera);

    // ===== state ===============================================================
    // level = fraction of the HOUR elapsed (0 at :00 … 1 at the next :00). So the
    // float's height directly reads minutes: floatHeight ∝ (min + sec/60).
    this.level = 0;
    this.drain = 0;
    const tm = this.timeNow();
    this.level = (tm.m + (tm.s + tm.ms / 1000) / 60) / 60;
    this.pMin = tm.m; this.pHour = tm.h;
  }

  _applyCam() {
    const cp = clamp(this.camPhi, -0.5, 1.0);
    // orbit around the pavilion's centre (floor y≈-0.6 … roof ≈15 → mid ≈ 6)
    const cx = 0, cy = 6;
    this.camera.position.set(
      cx + this.camR * Math.cos(cp) * Math.sin(this.camTheta),
      cy + this.camR * Math.sin(cp),
      this.camR * Math.cos(cp) * Math.cos(this.camTheta)
    );
    this.camera.lookAt(cx, cy, 0);
  }

  // release a ball of `kind` — it is born at the plate notch the float just reached
  // (minute ball at the float collar's height; hour/day at the top notch), then rolls
  // its rail to the instrument. startY makes the minute ball literally come from the
  // height the float climbed to, so the source is visible.
  onPointerDown() { this._downAt = performance.now(); this._moved = false; }
  onPointerUp() {
    if (!this._moved && performance.now() - this._downAt < 300) this._tap();
  }
  // tap the machine itself: an instrument releases its ball · the vessel splashes
  _tap() {
    const ndc = new THREE.Vector2((this.pointer.x / this.w) * 2 - 1, -(this.pointer.y / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    for (let i = 0; i < this.instruments.length; i++) {
      const o = this.instruments[i];
      if (this.ray.intersectObject(o.inst, true).length) {
        o.ring = Math.max(o.ring, 0.35);           // it hums at the touch…
        this._simStrike(i);                         // …and the machine answers properly
        return;
      }
    }
    if (this.ray.intersectObject(this.vesselGroup, true).length) this._splash();
  }
  _splash() {
    this.slosh = 1;
    const topY = this.water.scale.y;               // water column height
    const ring = this._splashRings.find((r) => !r.on);
    if (ring) {
      ring.on = true; ring.s = this.vesselR * 0.4; ring.op = 0.85;
      ring.mesh.position.y = topY + 0.05;
    }
    let n = 0;
    for (const d of this._drops) {
      if (d.on || n >= 10) continue;
      n++; d.on = true;
      const a = Math.random() * TAU;
      d.x = Math.cos(a) * this.vesselR * 0.5; d.z = Math.sin(a) * this.vesselR * 0.5;
      d.y = topY + 0.1;
      d.vx = Math.cos(a) * (0.8 + Math.random() * 1.6);
      d.vz = Math.sin(a) * (0.8 + Math.random() * 1.6);
      d.vy = 2.5 + Math.random() * 2.5;
    }
  }

  _release(kind, startY) {
    const f = this.flyBalls.find((b) => !b.on);
    if (!f) { this._strike(kind); return; }
    f.on = true; f.s = 0; f.t = 0; f.phase = 0; f.kind = kind;
    f.startY = startY != null ? startY : this.holeY;   // where on the plate it dropped from
    f.mesh.visible = true;
    f.mesh.position.set(this.rails[kind].from.x, f.startY, this.rails[kind].from.z);
    // a quick spark on the plate at the release height
    this._lastReleaseY = f.startY;
  }
  _strike(kind) {
    const o = this.instruments[kind];
    o.ring = 1; o.mallet = 1;
  }
  // plate-face Y of the minute notch the float is currently lined up with
  _floatTipY() {
    const m = clamp(Math.round(clamp(this.level, 0, 1) * 60), 0, 60);
    return this.notchY(m);
  }

  update(dt, t) {
    const tm = this.timeNow();
    const sec = tm.s, min = tm.m, hr = tm.h;
    const secFrac = (sec + tm.ms / 1000) / 60;

    // level = fraction of the hour (float height = minutes). It does NOT reset each
    // minute — it climbs all hour, so the float's height genuinely encodes the minute.
    const hourFrac = (min + secFrac) / 60;

    // edges → release balls. The minute notch the float just passed releases a 鐘
    // ball FROM THE FLOAT'S HEIGHT; at the top (min rolls to 0) the hour ball → 鼓.
    if (min !== this.pMin) {
      const collarY = this._floatTipY();               // where the float collar sits now
      if (min === 0) {                                 // crossed the top notch → a new hour
        this._release(1, this.notchY(60));             // 鼓 at the top notch
        if (hr === 0) this._release(2, this.notchY(60)); // 鉦
        this.drain = 1;                                // the vessel empties to restart the hour
      } else {
        this._release(0, collarY);                     // 鐘 at the minute the float reached
      }
      this.pMin = min;
    }
    this.pHour = hr;

    // fill toward the hour fraction; after the top it briefly drains to ~0 and climbs anew
    if (this.drain > 0.02) this.drain = Math.max(0, this.drain - dt * 2.0);
    this.level = lerp(this.level, hourFrac, clamp(dt * 5, 0, 1));
    const wl = clamp(this.level, 0.01, 1);
    this.water.scale.y = wl * this.vesselH;
    this.water.position.y = (wl * this.vesselH) / 2;
    this.waterMat.emissiveIntensity = 0.1 + this.ripple * 0.05 * (0.6 + 0.4 * Math.sin(t * 3));
    // float rides the surface; its collar sits a touch above the waterline
    this.floatGroup.position.y = wl * this.vesselH;
    // light the minute tick the float is currently at
    const litMin = clamp(Math.round(wl * 60), 0, 60);
    for (let m = 0; m <= 60; m++) {
      const on = m === litMin;
      this.ticks[m].material === this.ticks[m].material; // (shared mat; highlight via scale)
      this.ticks[m].scale.x = on ? 1.5 : 1;
    }

    // advance flying balls — two phases, both strictly DOWNHILL (gravity only):
    //  1) DROP: free-fall from the notch it released at (f.startY on the plate face)
    //     straight down into the rail's catch mouth,
    //  2) ROLL: along the descending trough to the pedal under the jack → strike.
    for (const f of this.flyBalls) {
      if (!f.on) continue;
      const rail = this.rails[f.kind];
      const y0 = f.startY != null ? f.startY : this.holeY;
      if (f.phase === 0) {
        // free fall: v = g·t, y = y0 - ½g·t² (scene units; g tuned to read naturally)
        f.t = (f.t || 0) + dt;
        const g = 14;
        const y = y0 - 0.5 * g * f.t * f.t;
        f.mesh.position.set(rail.from.x, Math.max(y, rail.from.y), rail.from.z);
        f.mesh.rotation.x += dt * 4;
        if (y <= rail.from.y) { f.phase = 1; f.s = 0; }
      } else {
        // roll down the trough at constant speed (units/s → same pace on every rail)
        f.s += (dt * 5.5) / (rail.len || 8);
        const p = Math.min(1, f.s);
        f.mesh.position.lerpVectors(rail.from, rail.to, p);
        f.mesh.rotation.x += dt * 10;
        if (f.s >= 1) { f.on = false; f.mesh.visible = false; this._strike(f.kind); }
      }
    }

    // instrument ring + jack mallet swing
    for (const o of this.instruments) {
      o.ring = Math.max(0, o.ring - dt * 1.6);
      o.mallet = Math.max(0, o.mallet - dt * 3);
      o.inst.material.emissiveIntensity = o.ring * 0.9;
      o.inst.scale.setScalar(1 + o.ring * 0.05); o.inst.scale.y = (1 + o.ring * 0.05) * 0.85;
      o.arm.rotation.z = -0.3 - o.mallet * 1.2;   // swing toward the instrument
    }
    this.bloomPass.strength = 0.5 + Math.max(...this.instruments.map((o) => o.ring)) * 0.5;

    // splash physics: slosh wobble, expanding surface ring, leaping droplets
    this.slosh = Math.max(0, this.slosh - dt * 1.5);
    const wob = 1 + 0.05 * Math.sin(t * 16) * this.slosh;
    this.water.scale.x = wob; this.water.scale.z = 2 - wob;
    this.waterMat.emissiveIntensity = 0.1 + this.ripple * 0.05 * (0.6 + 0.4 * Math.sin(t * 3)) + this.slosh * 0.5;
    for (const r of this._splashRings) {
      if (!r.on) continue;
      r.s += dt * 3.2; r.op -= dt * 1.4;
      if (r.op <= 0) { r.on = false; r.mesh.visible = false; continue; }
      r.mesh.visible = true;
      r.mesh.scale.setScalar(r.s);
      r.mesh.material.opacity = r.op;
    }
    for (const d of this._drops) {
      if (!d.on) continue;
      d.vy -= 9 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < 0) { d.on = false; d.mesh.visible = false; continue; }
      d.mesh.visible = true;
      d.mesh.position.set(d.x, d.y, d.z);
    }

    // camera drag
    if (this.pointer.down && this.pointer.active) {
      if (Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 4) this._moved = true;
      this.camTheta -= this.pointer.vx * 0.006;
      this.camPhi += this.pointer.vy * 0.006;
    }
    this._applyCam();

    // readout
    this.readout.set(this._readStr(hr, min, sec));
  }

  _readStr(h, m, s) {
    const pad = (n) => String(n).padStart(2, "0");
    if (this.h24) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    const ap = h < 12 ? "AM" : "PM"; let hh = h % 12; if (hh === 0) hh = 12;
    return `${pad(hh)}:${pad(m)}:${pad(s)} ${ap}`;
  }

  // sim: release a ball of `kind` on demand from the right plate height (minute = the
  // float's current notch; hour/day = the top notch), without disturbing the clock.
  _simStrike(kind) {
    const y = kind === 0 ? this._floatTipY() : this.notchY(60);
    this._release(kind, y);
  }

  controls(host) {
    host.appendChild(slider("FLOW", 0.3, 2, this.flow, 0.05, (v) => (this.flow = v)));
    host.appendChild(slider("RIPPLE", 0, 2, this.ripple, 0.05, (v) => (this.ripple = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    const btns = row.querySelectorAll(".ctrl__btn");
    btns[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
    const labelEl = document.createElement("span");
    labelEl.className = "ctrl__label"; labelEl.textContent = "시보 시뮬레이션";
    labelEl.style.cssText = "display:block;margin-top:6px;";
    host.appendChild(labelEl);
    host.appendChild(buttonRow([
      { label: "매분 鐘", on: () => this._simStrike(0) },
      { label: "매시 鼓", on: () => this._simStrike(1) },
      { label: "자정 鉦", on: () => this._simStrike(2) },
    ]));
  }
  _setMode(h24, el) {
    this.h24 = h24;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }

  beforeTeardown() {
    for (const r of this._splashRings || []) r.mesh.material.dispose();
    for (const d of this._drops || []) d.mesh.material.dispose();
  }
}
