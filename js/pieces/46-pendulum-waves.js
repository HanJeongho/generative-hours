// ============================================================================
//  46 · Pendulum Waves (진자의 파동 — 운동과 리듬으로 읽는 시간)  [three.js / WebGL 3D]
//  Tell the time by MOTION, not by digits. A row of hanging bobs, each pendulum a
//  touch longer than the last, swings with slightly different periods; their drift-
//  ing phase relationship paints a traveling wave that snakes through depth, tangles
//  into checkerboard knots, then — for one held breath — re-aligns into a perfectly
//  straight line. That alignment is the clock: pendulum i completes (BASE_CYCLES + i)
//  oscillations per MINUTE, so τ = s + ms/1000 and T = 60 make EVERY bob fall back
//  into phase exactly at the top of each minute. The minute rollover IS the spectacle
//  — the wave collapses to a line and the whole row pulses as one.
//
//  Why real 3D: the bobs swing in Z (toward/away from camera), so the wave reads as a
//  ribbon undulating in depth — flat canvas can't sell that. PBR brass pivot bar +
//  PMREM env reflections + an UnrealBloom corona on the emissive bobs give the glow
//  and metal the raw-GLSL clocks couldn't reach.
//    SECONDS — the wave's leading edge sweeps the row; each tick a faint brightness beat.
//    MINUTE  — τ≈0 realignment: synchronized glow pulse + a ripple shock + bloom bump.
//    HOUR    — bob colour cross-fades through a 24-hour palette (cool night → warm noon),
//              with a larger glow flare on the hour.
//  Drag orbits the camera; click flares a glow flare across all bobs.
// ============================================================================

import { ThreePiece, THREE } from "../three-piece.js";
import { slider, buttonRow } from "./01-currents.js";
import { clamp, lerp, TAU } from "../engine.js";

const MAX_BOBS = 24;        // build this many once; only `count` are shown
const BASE_CYCLES = 9;      // slowest pendulum's swings per minute; i-th does BASE+i
const REALIGN_T = 60;       // realignment period (s) — tied to the minute
const SPAN = 9.0;           // total width of the row along X (world units)
const ARM = 3.4;            // visual arm length: bob.z = ARM * sin(angle)

export default class PendulumWaves extends ThreePiece {
  build() {
    // --- bloom / exposure: conservative (SwiftShader whites out fast; a whole
    //     row of bobs lighting up at minute-realign is the over-bloom danger) ---
    // bloom: TIGHT + WEAK. SwiftShader's bloom triples mean luminance if fed a
    // big bright area, so keep strength low, radius small, threshold high so only
    // the brightest cores glow rather than the whole row washing to white.
    this.bloomPass.strength = 0.28;
    this.bloomPass.radius = 0.2;
    this.bloomPass.threshold = 1.0;
    this.renderer.toneMappingExposure = 0.8;
    this.scene.background = new THREE.Color(0x070a10);

    // --- controls state ---
    this.count = 15;        // active pendulums (hour can nudge; slider overrides)
    this.swing = 0.5;       // swing amplitude A in radians
    this.bloomBase = 0.28;  // bloom base (slider)
    this.h24 = false;       // affects readout only

    // --- camera orbit state — elevated 3/4 view shows the depth-snake best ----
    this.camR = 15.0;
    this.camTheta = -0.55;  // azimuth: look down the row at an angle
    this.camPhi = 0.38;     // elevation
    this._applyCam();

    // --- lights (env map carries most; a key light adds crisp metal speculars) -
    const key = new THREE.DirectionalLight(0xfff0d8, 1.1);
    key.position.set(5, 10, 8);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x1a2436, 0.5));

    // --- starfield backdrop (depth cue behind the row) ----------------------
    this.scene.add(this._starfield(900, 70));

    // --- brass top pivot bar: a horizontal cylinder the env map reflects -----
    const pivotGeo = this.track(new THREE.CylinderGeometry(0.16, 0.16, SPAN + 1.2, 24));
    const brassMat = this.track(new THREE.MeshStandardMaterial({
      color: 0xb8863c, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.5,
    }));
    this.pivotBar = new THREE.Mesh(pivotGeo, brassMat);
    this.pivotBar.rotation.z = Math.PI / 2;   // cylinder default is Y-axis → lay along X
    this.pivotBar.position.set(0, 4.2, 0);    // hang the bobs below it
    this.scene.add(this.pivotBar);
    // little end caps so the bar reads as a machined rail
    const capGeo = this.track(new THREE.SphereGeometry(0.22, 18, 18));
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, brassMat);
      cap.position.set(sx * (SPAN / 2 + 0.6), 4.2, 0);
      this.scene.add(cap);
    }

    // --- a faint reflective dark ground plane to catch the glow --------------
    const groundGeo = this.track(new THREE.PlaneGeometry(40, 40));
    const groundMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x0a0f18, metalness: 0.6, roughness: 0.45, envMapIntensity: 0.7,
    }));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4.6;
    this.scene.add(ground);

    // --- ONE shared bob geometry + ONE shared string geometry, cloned across --
    this.bobGeo = this.track(new THREE.SphereGeometry(0.24, 24, 24));
    this.haloGeo = this.track(new THREE.SphereGeometry(0.24 * 1.7, 16, 16));
    // string: unit-length cylinder pivoting from the top; we scale.y to reach each bob
    this.stringGeo = this.track(new THREE.CylinderGeometry(0.012, 0.012, 1, 6));
    this.stringMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x8595b0, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.8,
    }));

    // each bob group hangs from a pivot point on the bar; we rotate the group
    // about X so the bob (offset -Y) swings in the Z direction.
    this.bobs = [];
    for (let i = 0; i < MAX_BOBS; i++) {
      const pivot = new THREE.Group();
      // spread pivots evenly along X across the span
      const fx = MAX_BOBS > 1 ? i / (MAX_BOBS - 1) : 0.5;
      pivot.position.set((fx - 0.5) * SPAN, 4.2, 0);

      // slightly longer arm down the row for depth realism (visual only) ------
      const armLen = ARM * (1 + fx * 0.22);

      // string hangs straight down from the pivot (-Y), unit geo scaled to armLen
      const str = new THREE.Mesh(this.stringGeo, this.stringMat);
      str.scale.y = armLen;
      str.position.y = -armLen / 2;
      pivot.add(str);

      // the glowing bob at the end of the string (tinted, not pure white →
      // a coloured emitter blooms its own hue instead of clipping to white)
      const col = new THREE.Color().setHSL(0.58, 0.65, 0.5);
      const bobMat = new THREE.MeshStandardMaterial({
        color: col.clone(), emissive: col.clone(), emissiveIntensity: 0.7,
        roughness: 0.25, metalness: 0.1,
      });
      const bob = new THREE.Mesh(this.bobGeo, bobMat);
      bob.position.y = -armLen;
      // faint additive halo child. Kept very low-opacity: 15 overlapping additive
      // halos otherwise stack toward white and bloom blows the screen out.
      const haloMat = new THREE.MeshBasicMaterial({
        color: col.clone(), transparent: true, opacity: 0.08,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      bob.add(new THREE.Mesh(this.haloGeo, haloMat));
      pivot.add(bob);

      this.scene.add(pivot);
      this.bobs.push({
        i, pivot, str, bob, bobMat, haloMat, armLen,
        color: col,                       // current displayed colour
        cyc: BASE_CYCLES + i,             // oscillations this bob does per minute
      });
    }

    // --- ripple shock-ring pool (fires on minute realign) -------------------
    this.ripples = [];
    this.rippleGeo = this.track(new THREE.RingGeometry(1, 1.03, 96));
    this.rippleMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xc0c8d0, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    }));
    this._rippleMeshes = [];

    // --- floating HH:MM:SS readout plate, pinned to the camera (43 pattern) --
    this.readout = this.makeTextTexture({ w: 1024, h: 256, fill: "#dfe7f2" });
    const pgeo = this.track(new THREE.PlaneGeometry(3.6, 0.9));
    const pmat = this.track(new THREE.MeshBasicMaterial({
      map: this.readout.texture, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.plate = new THREE.Mesh(pgeo, pmat);
    this.plate.position.set(0, -3.15, -9);
    this.camera.add(this.plate);
    this.scene.add(this.camera);

    // --- spectacle envelopes ---
    this.beat = 0;       // per-second brightness beat
    this.align = 0;      // minute realignment glow pulse
    this.bigFlash = 0;   // hour glow flare
    const tm = this.timeNow();
    this.lastS = tm.s; this.lastM = tm.m; this.lastH = tm.h;
    this._primed = false;
    this._curHue = this._hourHue(tm.h);   // colour we're lerping from/toward
  }

  // hour → hue: cool indigo at midnight, warm amber near noon, back to cool.
  // Triangle wave over 24h so 00:00 and 24:00 share the coolest tone.
  _hourHue(h) {
    const day = (h % 24) / 24;            // 0..1 across the day
    const noonness = 1 - Math.abs(day - 0.5) * 2;   // 0 at midnight, 1 at noon
    // hue 0.62 (indigo) → 0.08 (amber) as noonness rises
    return lerp(0.62, 0.08, noonness);
  }

  _starfield(n, R) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random();
      const th = u * TAU, ph = Math.acos(2 * v - 1);
      const rr = R * (0.7 + Math.random() * 0.3);
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(rr * Math.sin(ph) * Math.sin(th)) * 0.6 + 3; // bias up/behind
      pos[i * 3 + 2] = rr * Math.cos(ph) - 18;
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = this.track(new THREE.PointsMaterial({
      color: 0x8aa0c8, size: 0.34, sizeAttenuation: true,
      transparent: true, opacity: 0.75, depthWrite: false,
    }));
    return new THREE.Points(geo, mat);
  }

  _applyCam() {
    const cp = clamp(this.camPhi, -0.5, 1.1);
    this.camera.position.set(
      this.camR * Math.cos(cp) * Math.sin(this.camTheta),
      this.camR * Math.sin(cp),
      this.camR * Math.cos(cp) * Math.cos(this.camTheta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  // click → a glow flare swept across all bobs (reuses the align envelope)
  onPointerDown() { this.align = Math.max(this.align, 0.6); this.beat = 1; }

  _readStr(h, m, s) {
    const pad = (n) => String(n).padStart(2, "0");
    if (this.h24) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    const ap = h < 12 ? "AM" : "PM";
    let hd = h % 12; if (hd === 0) hd = 12;
    return `${pad(hd)}:${pad(m)}:${pad(s)} ${ap}`;
  }

  update(dt, t) {
    const { h, m, s, ms } = this.timeNow();
    if (!this._primed) { this.lastS = s; this.lastM = m; this.lastH = h; this._primed = true; }

    // --- tick detection → spectacle ---
    if (s !== this.lastS) {
      this.lastS = s; this.beat = 1;
      if (m !== this.lastM) {                 // minute rollover = realignment
        this.lastM = m; this.align = 1;
        this.ripples.push({ scale: 0.6, op: 0.85 });   // one shock-ring
      }
      if (h !== this.lastH) { this.lastH = h; this.bigFlash = 1; }
    }

    // --- THE PHYSICS = THE CLOCK -------------------------------------------
    // τ = seconds-into-minute (sub-second smooth). At τ=0 (and τ=60) the argument
    // 2π·cyc·τ/T is an integer multiple of 2π for every bob → cos = 1 → all bobs
    // line up. Through the 60s they drift into a traveling wave.
    const tau = s + ms / 1000;               // 0..60
    const A = this.swing;
    // colour cross-fade target for this hour (lerp continuously so it's smooth)
    const targetHue = this._hourHue(h);
    this._curHue = lerp(this._curHue, targetHue, clamp(dt * 0.8, 0, 1));

    const half = (this.count - 1) / 2;
    for (let k = 0; k < this.bobs.length; k++) {
      const p = this.bobs[k];
      const visible = k < this.count;
      p.pivot.visible = visible;
      if (!visible) continue;

      // classic pendulum-wave angle: cyc oscillations across the realign period
      const angle = A * Math.cos(TAU * p.cyc * tau / REALIGN_T);
      p.pivot.rotation.x = angle;            // swing about the bar → bob moves in +Z/-Z

      // re-centre the active row about X so it stays framed as count changes
      p.pivot.position.x = ((k - half) / Math.max(1, this.count - 1)) * SPAN;

      // colour: hue from the hour; bob k slightly varied so the row reads as a
      // gradient ribbon, not one flat colour.
      const hue = (this._curHue + (k / Math.max(1, this.count)) * 0.06) % 1;
      p.color.setHSL(hue, 0.62, 0.6);
      p.bobMat.color.copy(p.color);
      p.bobMat.emissive.copy(p.color);
      p.haloMat.color.copy(p.color);

      // brightness: base + per-second beat (leading edge of the wave is the
      // seconds hand) + minute realign pulse (capped) + hour flare.
      // a small phase offset by k makes the beat sweep down the row like a wave.
      const sweep = 0.5 + 0.5 * Math.cos((tau / REALIGN_T) * TAU * p.cyc);
      p.bobMat.emissiveIntensity =
        0.7
        + this.beat * 0.15 * sweep                       // subtle per-second beat
        + this.align * 0.3                               // minute glow pulse
        + this.bigFlash * 0.25;                          // hour flare
      p.haloMat.opacity = 0.08 + this.align * 0.1 + this.bigFlash * 0.1;
      // a touch of swell on realign / hour so the line "snaps" with body
      const swell = 1 + this.align * 0.18 + this.bigFlash * 0.12;
      p.bob.scale.setScalar(swell);
    }

    // --- ripple shock-rings (camera-facing, expand + fade) ------------------
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.scale += dt * 9;
      r.op -= dt * 0.8;
      if (r.op <= 0) this.ripples.splice(i, 1);
    }
    this._renderRipples();

    // --- bloom responds to the moment (capped — never let it white out) -----
    this.bloomPass.strength = clamp(
      this.bloomBase + this.beat * 0.04 + this.align * 0.15 + this.bigFlash * 0.12,
      0, 0.6
    );

    // --- decay envelopes (frame-rate independent) ---
    this.beat = Math.max(0, this.beat - dt * 4.0);
    this.align = Math.max(0, this.align - dt * 1.6);
    this.bigFlash = Math.max(0, this.bigFlash - dt * 0.7);

    // --- camera drag-orbit ---
    if (this.pointer.down && this.pointer.active) {
      this.camTheta -= this.pointer.vx * 0.006;
      this.camPhi += this.pointer.vy * 0.006;
    }
    this._applyCam();

    // --- readout plate is pinned to the camera; refresh its text ---
    this.readout.set(this._readStr(h, m, s));
  }

  // pooled camera-facing ripple rings, sitting at the row's centre
  _renderRipples() {
    while (this._rippleMeshes.length < this.ripples.length) {
      const mat = this.rippleMat.clone();
      const mesh = new THREE.Mesh(this.rippleGeo, mat);
      this.scene.add(mesh);
      this._rippleMeshes.push(mesh);
    }
    for (let i = 0; i < this._rippleMeshes.length; i++) {
      const mesh = this._rippleMeshes[i];
      const r = this.ripples[i];
      if (!r) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      mesh.scale.setScalar(r.scale);
      mesh.material.opacity = Math.max(0, r.op);
      mesh.quaternion.copy(this.camera.quaternion);
    }
  }

  beforeTeardown() {
    for (const mesh of this._rippleMeshes || []) {
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    // bob materials are per-instance (not in _disposables); scene.traverse in
    // teardown disposes them, but the bobs/halos are added to pivots under the
    // scene so traverse reaches them — nothing extra needed here for those.
  }

  controls(host) {
    host.appendChild(slider(
      "PENDULUMS", 6, MAX_BOBS, this.count, 1,
      (v) => (this.count = Math.round(v)),
      (v) => String(Math.round(v))            // integer display
    ));
    host.appendChild(slider("SWING", 0.2, 1.2, this.swing, 0.02, (v) => (this.swing = v)));
    host.appendChild(slider(
      "BLOOM", 0.3, 2, this.bloomBase, 0.02,
      (v) => (this.bloomBase = clamp(v, 0.1, 0.55))   // hard-cap base under the white-out line
    ));
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
