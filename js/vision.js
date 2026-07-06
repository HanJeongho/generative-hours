// ============================================================================
//  vision.js — shared camera + MediaPipe substrate for Wing VII (Mirror &
//  Presence). A VisionPiece extends Piece: it opens the webcam, loads a
//  MediaPipe Tasks-Vision model from CDN (hand / face / pose), and on every
//  frame hands the subclass the latest landmarks. Everything runs ON-DEVICE —
//  the video stream never leaves the browser.
//
//  Robustness is the whole point here, since this is the only wing that needs a
//  camera + an external library + a network fetch:
//    • shows a live status overlay (요청중 / 거부됨 / 모델 로딩 / 감지중)
//    • graceful failure: if the camera is denied or the CDN is unreachable, the
//      piece still renders an ambient idle state and tells the visitor why.
//    • full cleanup of stream + model in teardown (no leaked camera light).
// ============================================================================

import { Piece } from "./engine.js";

const MP_VERSION = "0.10.18";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const WASM_BASE = `${MP_BASE}/wasm`;
// model bundles (Google-hosted, CORS-enabled)
const MODELS = {
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};

// cache the dynamically-imported vision module + created tasks across pieces so
// switching artworks in the wing doesn't re-download the WASM runtime.
let _visionMod = null;
const _taskCache = {};       // key: tracker type -> task instance

async function loadVisionModule() {
  if (_visionMod) return _visionMod;
  // dynamic import of the ESM build from CDN
  _visionMod = await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`);
  return _visionMod;
}

export class VisionPiece extends Piece {
  // subclass sets this.tracker = "hand" | "face" | "pose" before super.setup,
  // or overrides `tracker` getter. Default: hand.
  get tracker() { return "hand"; }
  // hand: how many hands to detect
  get numHands() { return 2; }

  // --- VisionPiece lifecycle: we hook setup/teardown, subclass uses onReady/
  //     visionFrame/drawIdle instead of overriding setup/frame directly. -------
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.status = "init";          // init|requesting|denied|loading|ready|error|nocam
    this.statusMsg = "카메라를 준비하는 중…";
    this.video = null;
    this.stream = null;
    this.task = null;
    this.results = null;
    this.mirror = true;            // selfie view: flip X so it feels like a mirror
    this._lastVideoTime = -1;
    this._destroyed = false;

    if (this.visionSetup) this.visionSetup();   // subclass init (no camera yet)
    this._startCamera();
  }

  async _startCamera() {
    // 1) camera permission
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._fail("nocam", "이 브라우저는 카메라를 지원하지 않습니다.");
      return;
    }
    this._setStatus("requesting", "카메라 권한을 요청하는 중…");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      this._fail("denied", "카메라 접근이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용한 뒤 새로고침하세요.");
      return;
    }
    if (this._destroyed) { this._stopStream(); return; }

    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});

    // 2) MediaPipe model
    this._setStatus("loading", "인식 모델을 불러오는 중… (최초 1회)");
    try {
      const vision = await loadVisionModule();
      this.task = await this._makeTask(vision);
    } catch (e) {
      console.error("MediaPipe load failed:", e);
      // camera still works — fall back to motion-only if the subclass supports it
      this._fail("error", "인식 모델을 불러오지 못했습니다(네트워크). 카메라 영상만 표시합니다.");
      return;
    }
    if (this._destroyed) { this._stopStream(); return; }

    this._setStatus("ready", "");
    if (this.onReady) this.onReady();
  }

  async _makeTask(vision) {
    const { FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const type = this.tracker;
    if (type === "hand") {
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.hand, delegate: "GPU" },
        numHands: this.numHands, runningMode: "VIDEO",
      });
    } else if (type === "face") {
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.face, delegate: "GPU" },
        outputFaceBlendshapes: true, numFaces: 1, runningMode: "VIDEO",
      });
    } else { // pose
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.pose, delegate: "GPU" },
        numPoses: 1, runningMode: "VIDEO",
      });
    }
  }

  _setStatus(s, msg) { this.status = s; this.statusMsg = msg; }
  _fail(s, msg) { this._setStatus(s, msg); if (this.onVisionFail) this.onVisionFail(s); }

  // --- per-frame: run inference, then let subclass render -------------------
  frame(dt, t) {
    // run detection when we have a fresh video frame + a ready model
    if (this.task && this.video && this.video.readyState >= 2) {
      if (this.video.currentTime !== this._lastVideoTime) {
        this._lastVideoTime = this.video.currentTime;
        try {
          this.results = this.task.detectForVideo(this.video, performance.now());
        } catch (e) { /* transient; keep last results */ }
      }
    }
    if (this.status === "ready" && this.visionFrame) {
      this.visionFrame(dt, t, this.results);
    } else if (this.drawIdle) {
      this.drawIdle(dt, t);          // ambient state while waiting / on failure
    } else {
      this._drawStatusBackdrop();
    }
    this._drawStatusOverlay();
  }

  // --- coordinate helpers ----------------------------------------------------
  // MediaPipe landmarks are normalised [0,1] with origin top-left of the video.
  // Map to canvas CSS px, applying the selfie mirror so motion matches the user.
  toCanvas(lm) {
    const x = this.mirror ? (1 - lm.x) : lm.x;
    return { x: x * this.w, y: lm.y * this.h, z: lm.z || 0 };
  }

  // --- minimal built-in status UI (subclasses may ignore / restyle) ----------
  _drawStatusBackdrop() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#05070a";
    g.fillRect(0, 0, this.w, this.h);
  }
  _drawStatusOverlay() {
    if (this.status === "ready") return;       // nothing to say once tracking
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = this.w / 2, cy = this.h / 2;
    g.save();
    g.textAlign = "center";
    g.fillStyle = "rgba(180,200,210,0.5)";
    g.font = "12px ui-monospace, monospace";
    const dots = (this.status === "requesting" || this.status === "loading")
      ? ".".repeat(1 + (Math.floor(this.t * 2) % 3)) : "";
    g.fillText("◉ CAMERA", cx, cy - 18);
    g.fillStyle = "rgba(150,170,180,0.85)";
    g.font = "14px Inter, system-ui, sans-serif";
    wrapText(g, this.statusMsg + dots, cx, cy + 12, this.w * 0.7, 22);
    g.restore();
  }

  // --- teardown: stop everything, release camera ----------------------------
  teardown() {
    this._destroyed = true;
    if (this.visionTeardown) this.visionTeardown();
    this._stopStream();
    if (this.video) { this.video.srcObject = null; this.video = null; }
    // close the model task (frees WASM memory). Cached module stays for reuse.
    if (this.task && this.task.close) { try { this.task.close(); } catch (e) {} }
    this.task = null;
  }
  _stopStream() {
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
  }
}

// tiny word-wrap helper for the status message
function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text).split(" ");
  let line = "", yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) g.fillText(line, x, yy);
}

// ---- landmark index reference (for subclasses) -----------------------------
// Hand (21): 0 wrist · 4 thumb-tip · 8 index-tip · 12 middle-tip · 16 ring-tip
//            · 20 pinky-tip · 5/9/13/17 finger bases
export const HAND = { WRIST: 0, THUMB: 4, INDEX: 8, MIDDLE: 12, RING: 16, PINKY: 20 };
// Pose (33): 0 nose · 11/12 shoulders · 13/14 elbows · 15/16 wrists ·
//            23/24 hips · 25/26 knees · 27/28 ankles
export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [0, 11], [0, 12],
];
// Face: iris centers (with refineLandmarks/face model) — left 468..472,
// right 473..477; nose tip 1; useful for gaze direction.
export const FACE = { NOSE: 1, LEFT_IRIS: 468, RIGHT_IRIS: 473, LEFT_EYE: 33, RIGHT_EYE: 263 };
