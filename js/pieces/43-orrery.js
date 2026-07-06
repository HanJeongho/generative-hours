// ============================================================================
//  43 · Celestial Orrery (천체의 시계 — 하늘로 읽는 시간)  [three.js / WebGL 3D]
//  The oldest clock is the sky. A glowing sun sits at the centre of a brass
//  armillary sphere; three jewels orbit it like planets, and their angles ARE
//  the time — the inner jewel (closest, fastest, like Mercury) sweeps one full
//  orbit per MINUTE = the seconds; the middle jewel one orbit per HOUR = the
//  minutes; the outer jewel one orbit per 12h = the hours. Tilted brass gimbal
//  rings turn slowly around the whole mechanism. A small HH:MM:SS plate floats
//  below for exact reading.
//  Real 3D: PBR brass + a PMREM environment map give true metal reflections (no
//  fake matcap), depth, and an UnrealBloom corona — the ceiling the raw-GLSL
//  clock couldn't reach. SPECTACLE: each second the inner jewel snaps to its
//  tick with a spark of light and the sun beats once; each minute the seconds
//  orbit completes and a soft shock ripples out; on the hour all three jewels
//  swing into CONJUNCTION above the sun with a golden bloom flare + gong rings.
//  Drag orbits the camera around the sphere; click flares the sun.
// ============================================================================

import { ThreePiece, THREE } from "../three-piece.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, TAU } from "../engine.js";

const ORBITS = [
  // role,     radius, jewel,  hue(0..1) for emissive tint,  jewelSize
  { role: "sec", r: 3.0, hue: 0.52, size: 0.16 },   // cyan-white, fastest
  { role: "min", r: 4.6, hue: 0.0,  size: 0.22 },   // silver (hue unused → near white)
  { role: "hr",  r: 6.3, hue: 0.10, size: 0.30 },   // warm gold, slowest
];

export default class CelestialOrrery extends ThreePiece {
  build() {
    this.bloomPass.strength = 0.42;
    this.bloomPass.radius = 0.4;
    this.bloomPass.threshold = 0.9;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.background = new THREE.Color(0x05070d);

    // --- controls state ---
    this.spin = 0.6;       // armillary idle rotation speed
    this.flareAmt = 1.0;   // sun corona / spark strength
    this.h24 = false;      // affects readout only (orbits are 12h)

    // --- camera orbit state ---
    this.camR = 14.5;
    this.camTheta = 0.0;   // azimuth
    this.camPhi = 0.30;    // elevation
    this._applyCam();

    // --- lights (env map does most; a key light adds crisp speculars) -------
    const key = new THREE.DirectionalLight(0xfff0d8, 1.1);
    key.position.set(6, 9, 7);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));

    // --- starfield ----------------------------------------------------------
    this.scene.add(this._starfield(1400, 80));

    // --- the sun (emissive core + soft corona shell) ------------------------
    this.sunGroup = new THREE.Group();
    const sunGeo = this.track(new THREE.SphereGeometry(1.05, 48, 48));
    this.sunMat = this.track(new THREE.MeshStandardMaterial({
      color: 0xffaa44, emissive: 0xffb347, emissiveIntensity: 1.5,
      roughness: 0.4, metalness: 0.0,
    }));
    this.sun = new THREE.Mesh(sunGeo, this.sunMat);
    this.sunGroup.add(this.sun);
    // corona: additive backlit shell that bloom turns into a glow
    const coronaGeo = this.track(new THREE.SphereGeometry(1.7, 32, 32));
    this.coronaMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffc46a, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    }));
    this.corona = new THREE.Mesh(coronaGeo, this.coronaMat);
    this.sunGroup.add(this.corona);
    this.scene.add(this.sunGroup);

    // --- the ecliptic system: orbits + jewels (tilted toward the camera) ----
    this.system = new THREE.Group();
    this.system.rotation.x = -0.42;   // tilt the orbital plane so we see depth
    this.scene.add(this.system);

    const brass = (rough = 0.3) => this.track(new THREE.MeshStandardMaterial({
      color: 0xb8863c, metalness: 1.0, roughness: rough, envMapIntensity: 1.5,
    }));

    this.jewels = [];
    for (const o of ORBITS) {
      // thin glowing orbit guide-ring (lies in the system's plane = XZ)
      const ogeo = this.track(new THREE.TorusGeometry(o.r, 0.012, 8, 160));
      const omat = this.track(new THREE.MeshBasicMaterial({
        color: 0x4a5a78, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const oring = new THREE.Mesh(ogeo, omat);
      oring.rotation.x = Math.PI / 2;   // torus default is XY → lay flat into XZ
      this.system.add(oring);

      // brass armillary band hugging each orbit (a wider machined ring)
      const bgeo = this.track(new THREE.TorusGeometry(o.r, 0.05, 16, 200));
      const band = new THREE.Mesh(bgeo, brass(0.25));
      band.rotation.x = Math.PI / 2;
      this.system.add(band);

      // the jewel — emissive orb that bloom lights up
      const col = new THREE.Color();
      if (o.role === "min") col.setRGB(0.85, 0.9, 1.0);            // silver
      else col.setHSL(o.hue, 0.7, 0.62);
      const jgeo = this.track(new THREE.SphereGeometry(o.size, 28, 28));
      const jmat = this.track(new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 1.6,
        roughness: 0.2, metalness: 0.1,
      }));
      const jewel = new THREE.Mesh(jgeo, jmat);
      // a tiny halo so each jewel reads as a little star
      const hgeo = this.track(new THREE.SphereGeometry(o.size * 2.1, 18, 18));
      const hmat = this.track(new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      jewel.add(new THREE.Mesh(hgeo, hmat));
      this.system.add(jewel);
      this.jewels.push({ ...o, mesh: jewel, mat: jmat, color: col });
    }

    // --- decorative armillary gimbal rings (slowly rotating, around it all) -
    this.gimbals = new THREE.Group();
    const gdefs = [
      { r: 7.4, tube: 0.07, rot: [0, 0, 0] },
      { r: 7.4, tube: 0.06, rot: [Math.PI / 2, 0, 0] },
      { r: 7.4, tube: 0.06, rot: [0, 0, Math.PI / 2] },
      { r: 7.7, tube: 0.045, rot: [0.6, 0.4, 0] },
    ];
    for (const g of gdefs) {
      const geo = this.track(new THREE.TorusGeometry(g.r, g.tube, 16, 220));
      const m = new THREE.Mesh(geo, brass(0.32));
      m.rotation.set(g.rot[0], g.rot[1], g.rot[2]);
      this.gimbals.add(m);
    }
    this.scene.add(this.gimbals);

    // --- gong light-rings pool (hour) ---------------------------------------
    this.gongs = [];
    this.gongGeo = this.track(new THREE.RingGeometry(1, 1.04, 96));
    this.gongMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffd27c, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    }));

    // --- floating HH:MM:SS readout plate ------------------------------------
    this.readout = this.makeTextTexture({ w: 1024, h: 256, fill: "#dfe7f2" });
    const pgeo = this.track(new THREE.PlaneGeometry(3.6, 0.9));
    const pmat = this.track(new THREE.MeshBasicMaterial({
      map: this.readout.texture, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.plate = new THREE.Mesh(pgeo, pmat);
    // parent to the camera so the time stays pinned to the bottom-centre of the
    // view no matter how the camera orbits (9 units ahead, dropped + sized to
    // clear the bottom action bar).
    this.plate.position.set(0, -3.15, -9);
    this.camera.add(this.plate);
    this.scene.add(this.camera);

    // --- jewel trails: fading ghost orbs along each orbit -------------------
    this._trailMeshes = [];
    const mkTrail = (jewel, n, baseOp) => {
      const ghosts = [];
      const ggeo = this.track(new THREE.SphereGeometry(jewel.size * 0.55, 10, 10));
      for (let i = 0; i < n; i++) {
        const gm = new THREE.MeshBasicMaterial({
          color: jewel.color, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(ggeo, gm);
        mesh.visible = false;
        this.system.add(mesh);
        ghosts.push(mesh); this._trailMeshes.push(mesh);
      }
      return { ghosts, hist: [], n, baseOp };
    };
    this.trails = {
      sec: mkTrail(this.jewels[0], 20, 0.5),
      min: mkTrail(this.jewels[1], 10, 0.3),
    };

    // --- comets: pooled streakers (minute mark + click summon) --------------
    this.comets = [];
    this._cometMeshes = [];
    const cheadGeo = this.track(new THREE.SphereGeometry(0.13, 12, 12));
    const cghostGeo = this.track(new THREE.SphereGeometry(0.075, 8, 8));
    for (let c = 0; c < 2; c++) {
      const hm = new THREE.MeshBasicMaterial({
        color: 0xcfe4ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const head = new THREE.Mesh(cheadGeo, hm);
      head.visible = false; this.scene.add(head); this._cometMeshes.push(head);
      const ghosts = [];
      for (let i = 0; i < 26; i++) {
        const gm = new THREE.MeshBasicMaterial({
          color: 0x9fc4ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(cghostGeo, gm);
        mesh.visible = false; this.scene.add(mesh);
        ghosts.push(mesh); this._cometMeshes.push(mesh);
      }
      this.comets.push({ on: false, u: 0, P0: new THREE.Vector3(), P1: new THREE.Vector3(), P2: new THREE.Vector3(), head, ghosts, hist: [] });
    }

    // --- TIME CRANK: hold, then drag — you wind time itself -----------------
    this.crankT = 0;       // seconds of display offset
    this.crankV = 0;
    this._mode = null;     // "cam" | "crank"
    this._downAt = 0;

    // --- spectacle envelopes ---
    this.beat = 0; this.flash = 0; this.bigFlash = 0;
    const tm = this.timeNow();
    this.lastS = tm.s; this.lastM = tm.m; this.lastH = tm.h;
    this._primed = false;
  }

  _launchComet() {
    const c = this.comets.find((q) => !q.on);
    if (!c) return;
    const side = Math.random() < 0.5 ? 1 : -1;
    c.P0.set(-17 * side, 2 + Math.random() * 6, (Math.random() - 0.5) * 12);
    c.P1.set((Math.random() - 0.5) * 5, 3.5 + Math.random() * 3, (Math.random() - 0.5) * 5);
    c.P2.set(17 * side, -2 - Math.random() * 5, (Math.random() - 0.5) * 12);
    c.u = 0; c.hist.length = 0; c.on = true;
  }

  _starfield(n, R) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // shell, biased so stars sit well behind the mechanism
      const u = Math.random(), v = Math.random();
      const th = u * TAU, ph = Math.acos(2 * v - 1);
      const rr = R * (0.7 + Math.random() * 0.3);
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = rr * Math.cos(ph);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = this.track(new THREE.PointsMaterial({
      color: 0x9fb0d0, size: 0.42, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    return new THREE.Points(geo, mat);
  }

  _applyCam() {
    const cp = clamp(this.camPhi, -0.65, 1.15);
    this.camera.position.set(
      this.camR * Math.cos(cp) * Math.sin(this.camTheta),
      this.camR * Math.sin(cp),
      this.camR * Math.cos(cp) * Math.cos(this.camTheta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  onPointerDown() { this._downAt = performance.now(); this._mode = null; }
  onPointerUp() {
    if (this._mode === null && performance.now() - this._downAt < 260) {
      // tap: solar flare + a summoned comet
      this.flash = Math.max(this.flash, 0.7); this.beat = 1;
      this._launchComet();
    }
    this._mode = null;
  }

  _readStr(h, m, s) {
    const pad = (n) => String(n).padStart(2, "0");
    if (this.h24) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    const ap = h < 12 ? "AM" : "PM";
    let hd = h % 12; if (hd === 0) hd = 12;
    return `${pad(hd)}:${pad(m)}:${pad(s)} ${ap}`;
  }

  update(dt, t) {
    // ---- gestures: quick drag = camera orbit · hold-then-drag = TIME CRANK --
    if (this.pointer.down && this.pointer.active) {
      const held = performance.now() - this._downAt;
      const moving = Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 4;
      if (this._mode === null) {
        if (moving && held < 260) this._mode = "cam";
        else if (held >= 260) this._mode = "crank";
      }
      if (this._mode === "cam") {
        this.camTheta -= this.pointer.vx * 0.006;
        this.camPhi += this.pointer.vy * 0.006;
      } else if (this._mode === "crank") {
        this.crankT += this.pointer.vx * dt * 55;      // wind the sky
        this.crankV = this.pointer.vx * 55;
      }
    } else if (Math.abs(this.crankT) > 0.001 || Math.abs(this.crankV) > 0.001) {
      // let go: the mechanism whirls back to NOW (critically-damped spring)
      this.crankV += -this.crankT * 22 * dt;
      this.crankV *= Math.exp(-dt * 6);
      this.crankT += this.crankV * dt;
      if (Math.abs(this.crankT) < 0.002 && Math.abs(this.crankV) < 0.01) { this.crankT = 0; this.crankV = 0; }
    }

    // display time = wall clock + crank offset
    const dd = new Date(Date.now() + this.crankT * 1000);
    const h = dd.getHours(), m = dd.getMinutes(), s = dd.getSeconds(), ms = dd.getMilliseconds();
    if (!this._primed) { this.lastS = s; this.lastM = m; this.lastH = h; this._primed = true; }

    // --- tick detection → spectacle ---
    if (s !== this.lastS) {
      this.lastS = s; this.beat = 1;
      if (m !== this.lastM) { this.lastM = m; this.flash = 1; this._launchComet(); }
      if (h !== this.lastH) {
        this.lastH = h; this.bigFlash = 1;
        if (this.gongs.length < 6)
          for (let i = 0; i < 2; i++) this.gongs.push({ scale: 1.2, op: 0.9, delay: i * 0.16 });
      }
    }

    // --- orbital angles (sub-second smooth) — clockwise from top ---
    const subS = s + ms / 1000;
    const secA = (subS / 60) * TAU;
    const minA = ((m + subS / 60) / 60) * TAU;
    const hrA = (((h % 12) + m / 60) / 12) * TAU;
    const angles = { sec: secA, min: minA, hr: hrA };

    // conjunction pull: on the hour, ease all jewels toward straight-up together
    const conj = this.bigFlash;     // 1 right at the hour, decays
    for (const j of this.jewels) {
      let a = angles[j.role];
      // angle 0 → place at "top" of the plane (-Z), increasing clockwise
      a = -Math.PI / 2 - a;         // so all line up pointing up at a=0 phases
      const x = Math.cos(a) * j.r;
      const z = Math.sin(a) * j.r;
      j.mesh.position.set(x, 0, z);
      // emissive lift on its own tick + global flashes
      const base = 1.5;
      j.mat.emissiveIntensity = base + (j.role === "sec" ? this.beat * 1.8 : 0) +
        this.flash * 0.8 + this.bigFlash * 2.0;
      j.mesh.scale.setScalar(1 + (j.role === "sec" ? this.beat * 0.25 : 0) + this.bigFlash * 0.3);
    }

    // --- sun: steady glow (NO per-second beat — only the hour flare moves it) ---
    const beatPulse = 1 + this.bigFlash * 0.15;
    this.sun.scale.setScalar(beatPulse);
    this.sunMat.emissiveIntensity = (1.4 + this.bigFlash * 1.6) * this.flareAmt;
    this.corona.scale.setScalar(beatPulse * (1 + this.flash * 0.1 + this.bigFlash * 0.3));
    this.coronaMat.opacity = (0.18 + this.bigFlash * 0.3) * this.flareAmt;

    // --- armillary slow spin (the crank makes the whole machine whir) ---
    const whir = 1 + Math.min(6, Math.abs(this.crankV) * 0.06 + Math.abs(this.crankT) * 0.04);
    this.gimbals.rotation.y += dt * 0.12 * this.spin * whir;
    this.gimbals.rotation.x += dt * 0.05 * this.spin * whir;
    this.system.rotation.y += dt * 0.03 * this.spin;

    // --- jewel trails: ghost orbs along the recent arc ---
    for (const role of ["sec", "min"]) {
      const tr = this.trails[role];
      const jewel = this.jewels.find((j) => j.role === role);
      tr.hist.unshift(jewel.mesh.position.clone());
      if (tr.hist.length > tr.n * 2) tr.hist.length = tr.n * 2;
      for (let i = 0; i < tr.n; i++) {
        const p = tr.hist[i * 2];
        const mesh = tr.ghosts[i];
        if (!p) { mesh.visible = false; continue; }
        mesh.visible = true;
        mesh.position.copy(p);
        mesh.material.opacity = tr.baseOp * (1 - i / tr.n) * (0.5 + this.beat * 0.5);
        mesh.scale.setScalar(1 - (i / tr.n) * 0.6);
      }
    }

    // --- comets ---
    for (const c of this.comets) {
      if (!c.on) continue;
      c.u += dt / 2.3;
      if (c.u <= 1) {
        const u = c.u, v = 1 - u;
        const p = new THREE.Vector3(
          v * v * c.P0.x + 2 * v * u * c.P1.x + u * u * c.P2.x,
          v * v * c.P0.y + 2 * v * u * c.P1.y + u * u * c.P2.y,
          v * v * c.P0.z + 2 * v * u * c.P1.z + u * u * c.P2.z);
        c.head.visible = true;
        c.head.position.copy(p);
        c.hist.unshift(p);
        if (c.hist.length > c.ghosts.length) c.hist.length = c.ghosts.length;
      } else c.head.visible = false;
      for (let i = 0; i < c.ghosts.length; i++) {
        const p = c.hist[i], mesh = c.ghosts[i];
        if (!p || c.u > 1.6) { mesh.visible = false; continue; }
        mesh.visible = true;
        mesh.position.copy(p);
        mesh.material.opacity = 0.55 * (1 - i / c.ghosts.length) * clamp(1.6 - c.u, 0, 1);
        mesh.scale.setScalar(1 - (i / c.ghosts.length) * 0.7);
      }
      if (c.u > 1.6) { c.on = false; c.hist.length = 0; }
    }

    // --- gong rings ---
    for (let i = this.gongs.length - 1; i >= 0; i--) {
      const g = this.gongs[i];
      if (g.delay > 0) { g.delay -= dt; continue; }
      g.scale += dt * 11;
      g.op -= dt * 0.7;
      if (g.op <= 0) this.gongs.splice(i, 1);
    }
    this._renderGongs();

    // --- bloom responds to the moment (steady base; only minute/hour move it) ---
    this.bloomPass.strength = 0.42 + this.flash * 0.12 + this.bigFlash * 0.28;

    // --- decay envelopes (frame-rate independent) ---
    this.beat = Math.max(0, this.beat - dt * 4.0);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.bigFlash = Math.max(0, this.bigFlash - dt * 0.7);

    this._applyCam();

    // --- readout plate is pinned to the camera; just refresh its text ---
    this.readout.set(this._readStr(h, m, s));
  }

  // draw/scale the pooled gong rings (camera-facing)
  _renderGongs() {
    // ensure enough meshes exist
    while (this._gongMeshes === undefined) this._gongMeshes = [];
    while (this._gongMeshes.length < this.gongs.length) {
      const mat = this.gongMat.clone();
      const mesh = new THREE.Mesh(this.gongGeo, mat);
      this.scene.add(mesh);
      this._gongMeshes.push(mesh);
    }
    for (let i = 0; i < this._gongMeshes.length; i++) {
      const mesh = this._gongMeshes[i];
      const g = this.gongs[i];
      if (!g || g.delay > 0) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.scale.setScalar(g.scale);
      mesh.material.opacity = Math.max(0, g.op);
      mesh.quaternion.copy(this.camera.quaternion);
    }
  }

  beforeTeardown() {
    for (const mesh of this._gongMeshes || []) {
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    for (const mesh of [...(this._trailMeshes || []), ...(this._cometMeshes || [])]) {
      mesh.material.dispose();
      mesh.parent && mesh.parent.remove(mesh);
    }
  }

  controls(host) {
    host.appendChild(slider("SPIN", 0, 2, this.spin, 0.05, (v) => (this.spin = v)));
    host.appendChild(slider("FLARE", 0.3, 2, this.flareAmt, 0.05, (v) => (this.flareAmt = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    const btns = row.querySelectorAll(".ctrl__btn");
    btns[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }

  _setMode(h24, el) {
    this.h24 = h24;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
