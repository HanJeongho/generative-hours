// ============================================================================
//  three-piece.js — shared base for Wing XI (Ways of Telling Time).
//  These four works left the "rasterise digits → texture → filter" trick behind
//  and became real 3D: actual geometry & depth, PBR metal/glass with a true
//  environment-map reflection (not a fake matcap), and an EffectComposer post
//  chain (UnrealBloom + ACES tonemap). That ceiling — genuine reflection, depth,
//  glow — is exactly what the raw-GLSL clocks couldn't reach.
//
//  ThreePiece owns a THREE.WebGLRenderer bound to the Piece's canvas, a scene,
//  a perspective camera, a PMREM environment map (RoomEnvironment, for crisp
//  metal/glass reflections), and a post chain. Subclasses implement build()
//  (populate the scene) and update(dt, t) (animate). Same zero-build CDN-ESM
//  path as the camera wing's MediaPipe; resolved via the index.html import map.
// ============================================================================

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { Piece, hexToRgb } from "./engine.js";

export { THREE };

export class ThreePiece extends Piece {
  // subclasses may override these before super behaviour by setting in build()
  setup() {
    let gl;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      gl = this.renderer.getContext();
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      throw new Error("이 브라우저에서 WebGL을 사용할 수 없습니다. 다른 작품을 감상해 주세요.");
    }

    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // accent as a normalised THREE.Color (wing tint = silver #c0c8d0 here)
    const [ar, ag, ab] = hexToRgb(this.accent);
    this.accentColor = new THREE.Color(ar / 255, ag / 255, ab / 255);

    // --- scene + camera -----------------------------------------------------
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.w / this.h, 0.1, 200);
    this.camera.position.set(0, 0, 12);

    // --- environment map for real metal/glass reflections (PMREM) -----------
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    const envScene = new RoomEnvironment();
    this.envRT = this.pmrem.fromScene(envScene, 0.04);
    this.envMap = this.envRT.texture;
    this.scene.environment = this.envMap;
    // dispose the throwaway room scene meshes
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });

    // --- post chain: render → bloom → tonemap/output ------------------------
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.w * this.dpr, this.h * this.dpr);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.w * this.dpr, this.h * this.dpr),
      0.7,   // strength  (subclasses tune via this.bloomPass.strength)
      0.5,   // radius
      0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // track disposables the subclass doesn't manage itself
    this._disposables = [];

    this.build();
  }

  // ---- helpers ------------------------------------------------------------
  // Track a geometry/material/texture so teardown frees it.
  track(obj) { if (obj) this._disposables.push(obj); return obj; }

  // pointer (CSS px, y-down) → normalised device coords (-1..1, y-up)
  pointerNDC(out = new THREE.Vector2()) {
    out.x = (this.pointer.x / this.w) * 2 - 1;
    out.y = -((this.pointer.y / this.h) * 2 - 1);
    return out;
  }

  // A reusable HH:MM:SS readout drawn on an offscreen 2D canvas → CanvasTexture.
  // Returns { texture, set(str), canvas }. Map onto a plane for a legible time.
  makeTextTexture({ w = 1024, h = 256, font, fill = "#eef", align = "center" } = {}) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    let last = null;
    const set = (str) => {
      if (str === last) return;
      last = str;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = fill;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.font = font || `600 ${Math.round(h * 0.6)}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.fillText(str, align === "center" ? w / 2 : 0, h * 0.52);
      tex.needsUpdate = true;
    };
    this.track(tex);
    return { texture: tex, set, canvas: cv, ctx };
  }

  timeNow() {
    const d = new Date();
    return { d, h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() };
  }

  // ---- loop / resize / teardown ------------------------------------------
  frame(dt, t) {
    // Guard against a bad first dt: the heavy WebGL setup (PMREM compile, shader
    // link) can land between the engine's _last stamp and the first frame, and on
    // some clocks that first delta comes back negative/huge. A negative dt fed to
    // exp()-based springs explodes to NaN/Inf. Clamp to a sane positive range.
    if (!(dt > 0) || dt > 0.1) dt = 1 / 60;
    this.update(dt, t);
    this.composer.render();
  }

  onResize() {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setSize(this.w * this.dpr, this.h * this.dpr);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    if (this.onLayout) this.onLayout();
  }

  teardown() {
    if (this.beforeTeardown) { try { this.beforeTeardown(); } catch (e) {} }
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
            m.dispose();
          }
        }
      });
    }
    for (const d of this._disposables || []) { try { d.dispose(); } catch (e) {} }
    if (this.envRT) this.envRT.dispose();
    if (this.pmrem) this.pmrem.dispose();
    if (this.bloomPass) this.bloomPass.dispose?.();
    if (this.composer) {
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.renderer = this.composer = this.scene = null;
  }

  // subclasses override:
  build() {}
  update(/* dt, t */) {}
}
