// ============================================================================
//  84 · Moon Jar (달항아리 — 서툰 손의 미학)  [three.js / WebGL 3D]
//  어두운 방, 도는 물레 위에 흙 실린더 하나. 드래그로 회전체의 옆선(높이별 반경
//  배열)을 빚는다 — 세로 위치가 손이 닿는 높이, 가로로 밀면 그 띠의 반경이 늘고
//  준다. 좌우가 완벽히 대칭인 회전체(LatheGeometry)라 물레가 돌든 말든 옆선만
//  다스리면 형태가 잡힌다. 프로파일이 바뀔 때마다 지오메트리를 다시 굽고(옛 것은
//  dispose) 흙 재질(무광 갈색)로 입힌다.
//
//  손을 3초 떼면 가마 의식이 시작된다. 방이 주황 불빛으로 차오르고(가마 라이트+
//  블룸+발열 emissive) 흙이 벌겋게 달아오른다. 이윽고 식으면서 재질이 유백의
//  백자(clearcoat 물성)로 변하고, 방은 달빛으로 은은해지며 항아리가 천천히
//  자전한다. 옆선은 내가 빚은 그대로 — 조금 이지러진 그 둥긂이 곧 달항아리의
//  미학이다. 클릭하면 다시 흙으로 돌아가 새로 빚는다.
//
//  ★양손 카메라 빚기: 카메라가 준비되면 두 손을 들어 빚는다 — 손마다 팜센터를
//  화면에 미러 매핑, 손의 높이가 빚는 행, 손을 중앙에 모으면 그 행이 좁아지고
//  벌리면 넓어진다(반경 스무딩+가우시안 전파는 마우스 커널 재사용). 양손이
//  위·아래를 나눠 잡으면 허리와 어깨를 동시에 다스린다. 두 손이 모두 화면에서
//  사라진 채 3초면 가마에 든다. 카메라 거부/미지원/CDN 실패 시 조용히 마우스
//  빚기로 폴백. 손은 아주 작은 점+얇은 링으로만 표시(스켈레톤 없음).
//
//  핫루프 무할당: 지오메트리 재생성은 오직 빚는 동안(드래그·손)에만, 프레임당 최대
//  1회. 색·거칠기·라이트는 스칼라 lerp로 매끄럽게 오간다. 손 슬롯은 미리 할당.
//  슬라이더: WHEEL(물레 속도).
// ============================================================================

import { ThreePiece, THREE } from "../three-piece.js";
import { slider } from "./01-currents.js";
import { clamp, lerp } from "../engine.js";

// ── 형태 상수(중앙에서 시각 캘리브레이션 예정 — 대략값으로 시작) ──────────────
const PROFILE_SEGMENTS = 46;   // 프로파일 세로 분해능(높이별 반경 배열 길이)
const LATHE_SEG = 96;          // 회전체 방사 분할(둥긂의 매끄러움)
const JAR_HEIGHT = 2.9;        // 항아리 전체 높이(월드 단위)
const JAR_MAX_R  = 1.34;       // 배(belly) 최대 반경 기준값
const MIN_R = 0.05, MAX_R = 1.72; // 빚기 반경 한계

// 빚기 캘리브레이션: 포인터 세로 위치(화면 높이 비율) → 항아리 높이 밴드.
const SCREEN_TOP = 0.16;       // 이 지점이 항아리 꼭대기(입)에 대응
const SCREEN_BOT = 0.90;       // 이 지점이 항아리 굽(발)에 대응
const SHAPE_GAIN = 0.0018;     // 가로 드래그 픽셀 → 반경 증감
const SHAPE_SIGMA = 3.6;       // 손자국이 번지는 밴드 폭(가우시안)

// 달항아리 근사 옆선 제어점 [높이비 t(0=굽 ~ 1=입), 반경비(배=1.0 기준)]
const MOONJAR_CTRL = [
  [0.00, 0.26], [0.05, 0.30], [0.12, 0.52], [0.24, 0.78],
  [0.38, 0.95], [0.50, 1.00], [0.62, 0.96], [0.74, 0.82],
  [0.85, 0.60], [0.92, 0.45], [0.97, 0.50], [1.00, 0.46],
];

// 가마 의식 타이밍(초)
const IDLE_TO_FIRE = 3.0;      // 손 떼고 이만큼 지나면 가마에 든다
const BAKE_DUR = 5.6;          // 소성+냉각 전체 길이

// 물레/자전 속도(rad/s)
const THROW_RATE = 2.3;        // 빚을 때 물레 기본 회전(WHEEL 배율)
const MOON_RATE  = 0.16;       // 완성된 달항아리의 느린 자전

// 팔레트
const CLAY_COL = new THREE.Color(0x6b4a35);   // 무광 갈색 흙
const KILN_COL = new THREE.Color(0xff6a1e);   // 가마 불빛 주황
const PORC_COL = new THREE.Color(0xf1ece0);   // 유백 백자
const BG_CLAY  = new THREE.Color(0x14100d);   // 흙방(어둠)
const BG_FIRE  = new THREE.Color(0x2c1204);   // 가마 속
const BG_MOON  = new THREE.Color(0x070910);   // 달빛 밤
const KEY_COL  = new THREE.Color(0xffe9d0);   // 빚기 조명(온기)
const MOON_L   = new THREE.Color(0xaec4e6);   // 달빛(청백)

// 완성 시 시상(詩想) 캡션 / 빚는 동안 안내는 상황에 따라 갱신
const CAP_POEM = "조금 이지러진 둥긂 — 그것이 달항아리다.";

// ── 카메라 양손 빚기(MediaPipe HandLandmarker, CDN-ESM) ──────────────────────
// ThreePiece라 VisionPiece를 상속할 수 없어, vision.js의 임포트·모델 경로·getUserMedia
// 패턴만 참고해 필요한 최소만 이 파일 안에 직접 구현한다.
const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
const MP_WASM = `${MP_BASE}/wasm`;
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const PALM = [0, 5, 9, 13, 17];   // 팜센터 = 이 랜드마크들의 평균
const CAM_SMOOTH = 0.15;          // 목표 반경 추종 lerp 계수
const CAM_NARROW_R = 0.14;        // 손을 중앙에 모을 때(좁은 목·굽)
const CAM_WIDE_R = 1.55;          // 손을 벌릴 때(부푼 배)
const MARK_DEPTH = 4.0;           // 손 표식이 뜨는 카메라 앞 거리(월드)

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default class MoonJar extends ThreePiece {
  build() {
    this.bloomPass.strength = 0.22;
    this.bloomPass.radius = 0.5;
    this.bloomPass.threshold = 0.82;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = BG_CLAY.clone();

    // 카메라: 물레 위 항아리를 살짝 위에서 굽어본다
    this.camera.position.set(0, 0.85, 6.7);
    this.camera.lookAt(0, 0.05, 0);

    // ── 상태 ──────────────────────────────────────────────────────────────
    this.wheelSpeed = 1.0;             // WHEEL 슬라이더
    this.phase = "clay";               // "clay" | "bake" | "moon"
    this.idle = 0;                     // 손 뗀 뒤 경과(초)
    this.bake = 0;                     // 가마 의식 진행 0..1
    this._downAt = 0; this._moved = false;
    this._dirty = false;

    // ── 프로파일(높이별 반경 배열) + 재사용 점 버퍼 ─────────────────────────
    const N = PROFILE_SEGMENTS;
    this.profile = new Float32Array(N);
    this._defaultProfile();
    this.yBottom = -JAR_HEIGHT / 2;
    this.yTop = JAR_HEIGHT / 2;
    // pts[0] = 굽 중심(바닥 캡), pts[1..N] = 옆선. 같은 Vector2를 재사용해 무할당.
    this._pts = [];
    for (let i = 0; i <= N; i++) this._pts.push(new THREE.Vector2());

    // ── 조명(환경맵은 ThreePiece가 이미 걸어둠) ────────────────────────────
    this.scene.add(new THREE.AmbientLight(0x223044, 0.22));
    this.keyLight = new THREE.DirectionalLight(KEY_COL, 0.6);
    this.keyLight.position.set(4, 6, 5);
    this.scene.add(this.keyLight);
    this.kilnLight = new THREE.PointLight(KILN_COL, 0, 12, 2);
    this.kilnLight.position.set(0, 0.1, 0.2);
    this.scene.add(this.kilnLight);
    this.moonLight = new THREE.DirectionalLight(MOON_L, 0);
    this.moonLight.position.set(-3, 7, 2.5);
    this.scene.add(this.moonLight);

    // ── 바닥(달빛/불빛을 받는 어두운 판) ───────────────────────────────────
    const floorGeo = this.track(new THREE.CircleGeometry(16, 48));
    const floorMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x0c0d10, roughness: 0.95, metalness: 0.0,
    }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = this.yBottom - 0.2;
    this.scene.add(floor);

    // ── 물레 + 항아리(같은 그룹에서 함께 돈다) ─────────────────────────────
    this.spinGroup = new THREE.Group();
    this.scene.add(this.spinGroup);

    const wheelGeo = this.track(new THREE.CylinderGeometry(1.75, 1.92, 0.2, 64));
    const wheelMat = this.track(new THREE.MeshStandardMaterial({
      color: 0x1a1712, roughness: 0.85, metalness: 0.05,
    }));
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.y = this.yBottom - 0.1;
    this.spinGroup.add(wheel);

    // 항아리 재질: 하나의 PhysicalMaterial을 흙↔백자로 lerp
    this.jarMat = this.track(new THREE.MeshPhysicalMaterial({
      color: CLAY_COL.clone(), roughness: 0.92, metalness: 0.0,
      clearcoat: 0.0, clearcoatRoughness: 0.35,
      emissive: KILN_COL.clone(), emissiveIntensity: 0.0,
      envMapIntensity: 0.4, side: THREE.DoubleSide,
    }));
    this.jarGeo = this._makeLathe();
    this.jar = new THREE.Mesh(this.jarGeo, this.jarMat);
    this.spinGroup.add(this.jar);

    // ── 하단 한국어 캡션(카메라에 핀) ──────────────────────────────────────
    this.cap = this.makeTextTexture({
      w: 1200, h: 110, fill: "#d8d2c4",
      font: '600 62px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    });
    this.cap.set(CAP_POEM);
    const capGeo = this.track(new THREE.PlaneGeometry(4.6, 0.42));
    this.capMat = this.track(new THREE.MeshBasicMaterial({
      map: this.cap.texture, transparent: true, opacity: 0.6,
      depthWrite: false, toneMapped: false,
    }));
    const capPlane = new THREE.Mesh(capGeo, this.capMat);
    capPlane.position.set(0, -2.72, -7);
    this.camera.add(capPlane);
    this.scene.add(this.camera);

    this._tmpCol = new THREE.Color();

    // ── 카메라 양손 빚기 상태(비동기 초기화) ────────────────────────────────
    this._camReady = false; this._camFailed = false; this._destroyed = false;
    this.stream = null; this.video = null; this.task = null;
    this._results = null; this._lastVideoTime = -1; this._nHands = 0;
    // 두 손 슬롯(핫루프 무할당): x,y는 미러 적용된 화면 비율(0..1), present 감지 여부
    this._hands = [
      { x: 0.5, y: 0.5, present: false },
      { x: 0.5, y: 0.5, present: false },
    ];
    this._capMsg = "마우스로 드래그해 항아리를 빚으세요.";

    // ── 손 표식(아주 작은 점 + 얇은 링 — 스켈레톤 금지) ─────────────────────
    this._marks = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const dotMat = this.track(new THREE.MeshBasicMaterial({
        color: KEY_COL, transparent: true, opacity: 0.9,
        depthTest: false, depthWrite: false, toneMapped: false,
      }));
      const dot = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.028, 20)), dotMat);
      dot.renderOrder = 999;
      const ringMat = this.track(new THREE.MeshBasicMaterial({
        color: KEY_COL, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
        depthTest: false, depthWrite: false, toneMapped: false,
      }));
      const ring = new THREE.Mesh(this.track(new THREE.RingGeometry(0.07, 0.084, 28)), ringMat);
      ring.renderOrder = 999;
      g.add(dot); g.add(ring);
      g.visible = false;
      this.camera.add(g);
      this._marks.push(g);
    }

    // 비동기로 카메라·모델 준비(실패해도 조용히 마우스 빚기 유지)
    this._initCamera();
  }

  // ── 카메라/모델 비동기 준비 ────────────────────────────────────────────────
  async _initCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        throw new Error("getUserMedia 미지원");
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (this._destroyed) { this._stopStream(); return; }

      const v = document.createElement("video");
      v.playsInline = true; v.muted = true; v.srcObject = this.stream;
      await v.play().catch(() => {});
      this.video = v;

      const vision = await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`);
      const { FilesetResolver, HandLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
      const task = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        numHands: 2, runningMode: "VIDEO",
      });
      if (this._destroyed) {
        this._stopStream();
        if (task && task.close) { try { task.close(); } catch (e) {} }
        return;
      }
      this.task = task;
      this._camReady = true;
      this._capMsg = "양손을 들어 흙을 빚으세요 — 모으면 좁게, 벌리면 넓게.";
    } catch (e) {
      // 거부/미지원/CDN 실패 — 조용히 마우스 빚기 유지, 안내 한 줄만
      this._camFailed = true;
      this._capMsg = "마우스로 드래그해 항아리를 빚으세요 (카메라 없음).";
      this._stopStream();
    }
  }

  _stopStream() {
    if (this.stream) { this.stream.getTracks().forEach((tr) => tr.stop()); this.stream = null; }
  }

  // 비디오 프레임에서 두 손 팜센터를 미러 매핑해 슬롯에 기록(무할당)
  _detectHands() {
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = v.currentTime;
      try { this._results = this.task.detectForVideo(v, performance.now()); }
      catch (e) { /* 일시 오류 — 직전 결과 유지 */ }
    }
    const hands = this._results && this._results.landmarks ? this._results.landmarks : null;
    const n = hands ? Math.min(2, hands.length) : 0;
    for (let hIdx = 0; hIdx < 2; hIdx++) {
      const slot = this._hands[hIdx];
      if (hIdx < n) {
        const lm = hands[hIdx];
        let sx = 0, sy = 0;
        for (let k = 0; k < 5; k++) { const p = lm[PALM[k]]; sx += p.x; sy += p.y; }
        slot.x = 1 - sx / 5;   // 셀피 미러(X 반전)
        slot.y = sy / 5;
        slot.present = true;
      } else {
        slot.present = false;
      }
    }
    this._nHands = n;
  }

  // 한 행을 목표 반경으로 스무딩 + 이웃 행 가우시안 전파(마우스 커널 재사용)
  _sculptRow(band, targetR) {
    const N = this.profile.length, s2 = 2 * SHAPE_SIGMA * SHAPE_SIGMA;
    const ci = clamp(Math.round(band), 0, N - 1);
    const delta = (targetR - this.profile[ci]) * CAM_SMOOTH;
    if (Math.abs(delta) < 1e-5) return false;
    const lo = Math.max(0, Math.floor(band - SHAPE_SIGMA * 3));
    const hi = Math.min(N - 1, Math.ceil(band + SHAPE_SIGMA * 3));
    for (let i = lo; i <= hi; i++) {
      const w = Math.exp(-((i - band) * (i - band)) / s2);
      this.profile[i] = clamp(this.profile[i] + delta * w, MIN_R, MAX_R);
    }
    return true;
  }

  // teardown 훅: 카메라 트랙 정지 + task 정리(ThreePiece.teardown이 먼저 호출)
  beforeTeardown() {
    this._destroyed = true;
    this._stopStream();
    if (this.video) { this.video.srcObject = null; this.video = null; }
    if (this.task && this.task.close) { try { this.task.close(); } catch (e) {} }
    this.task = null;
  }

  // 제어점 → 기본 옆선(달항아리 근사)
  _defaultProfile() {
    const N = this.profile.length, C = MOONJAR_CTRL;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < C.length - 2 && C[k + 1][0] < t) k++;
      const a = C[k], b = C[k + 1];
      const f = (t - a[0]) / (b[0] - a[0]);
      this.profile[i] = lerp(a[1], b[1], clamp(f, 0, 1)) * JAR_MAX_R;
    }
  }

  // 현재 프로파일로 LatheGeometry 생성(점 버퍼 재사용)
  _makeLathe() {
    const N = this.profile.length;
    this._pts[0].set(0.0001, this.yBottom);           // 굽 바닥 캡(중심점)
    for (let i = 0; i < N; i++) {
      const y = lerp(this.yBottom, this.yTop, i / (N - 1));
      this._pts[i + 1].set(Math.max(MIN_R, this.profile[i]), y);
    }
    return new THREE.LatheGeometry(this._pts, LATHE_SEG);
  }

  // 옛 지오메트리를 버리고 새로 굽는다(빚는 동안만 호출)
  _rebuildJar() {
    const old = this.jarGeo;
    this.jarGeo = this._makeLathe();
    this.jar.geometry = this.jarGeo;
    if (old) old.dispose();
  }

  onPointerDown() { this._downAt = performance.now(); this._moved = false; }

  onPointerUp() {
    const quick = performance.now() - this._downAt < 320;
    if (!this._moved && quick && this.phase !== "clay") {
      // 탭 = 다시 흙으로(옆선은 유지, 새로 빚기)
      this.phase = "clay"; this.idle = 0; this.bake = 0;
    }
    this._moved = false;
  }

  update(dt, t) {
    // ── 카메라 준비 여부(모델 로딩 완료 + 비디오 재생 중) ──────────────────
    const camOn = this._camReady && this.video && this.video.readyState >= 2;
    if (camOn && this.phase === "clay") this._detectHands();

    // ── 빚기: 드래그로 옆선 다스리기(흙 단계에서만) ───────────────────────
    const moving = this.pointer.down && (Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy) > 2);
    if (this.pointer.down && moving) this._moved = true;

    if (this.phase === "clay") {
      if (camOn) {
        // 카메라 양손 빚기: 손마다 독립적으로 프로파일을 빚는다.
        // 손 y → 높이 행 / |x−화면중앙| → 그 행의 목표 반경(모을수록 좁고 벌릴수록 넓게)
        if (this._nHands > 0) {
          this.idle = 0;
          const N = this.profile.length;
          for (let i = 0; i < 2; i++) {
            const hnd = this._hands[i];
            if (!hnd.present) continue;
            const fy = clamp((hnd.y - SCREEN_TOP) / (SCREEN_BOT - SCREEN_TOP), 0, 1);
            const band = (1 - fy) * (N - 1);
            const reach = clamp(Math.abs(hnd.x - 0.5) * 2, 0, 1);  // 0=중앙 … 1=가장자리
            const targetR = lerp(CAM_NARROW_R, CAM_WIDE_R, reach);
            if (this._sculptRow(band, targetR)) this._dirty = true;
          }
        } else {
          this.idle += dt;   // 두 손 모두 화면 밖 → 가마 카운트다운(기존 3초와 동일)
        }
      } else {
        // 카메라 없음/실패 → 기존 마우스 빚기 유지
        if (this.pointer.down) this.idle = 0; else this.idle += dt;

        if (this.pointer.down && moving && this.pointer.active) {
          const fy = clamp((this.pointer.y / this.h - SCREEN_TOP) / (SCREEN_BOT - SCREEN_TOP), 0, 1);
          const band = (1 - fy) * (this.profile.length - 1);   // 세로 위치 → 높이 밴드
          const d = this.pointer.vx * SHAPE_GAIN;               // 가로 드래그 → 반경 증감
          if (Math.abs(d) > 1e-5) {
            const N = this.profile.length, s2 = 2 * SHAPE_SIGMA * SHAPE_SIGMA;
            const lo = Math.max(0, Math.floor(band - SHAPE_SIGMA * 3));
            const hi = Math.min(N - 1, Math.ceil(band + SHAPE_SIGMA * 3));
            for (let i = lo; i <= hi; i++) {
              const w = Math.exp(-((i - band) * (i - band)) / s2);
              this.profile[i] = clamp(this.profile[i] + d * w, MIN_R, MAX_R);
            }
            this._dirty = true;
          }
        }
      }

      if (this.idle >= IDLE_TO_FIRE) { this.phase = "bake"; this.bake = 0; }
    } else if (this.phase === "bake") {
      this.bake += dt / BAKE_DUR;
      if (this.bake >= 1) { this.bake = 1; this.phase = "moon"; }
    }

    // 프로파일이 바뀌었으면 이 프레임에 한 번만 다시 굽는다
    if (this._dirty) { this._rebuildJar(); this._dirty = false; }

    // ── 의식 엔벨로프 ──────────────────────────────────────────────────────
    const heat = this.phase === "bake"
      ? Math.exp(-((this.bake - 0.34) * (this.bake - 0.34)) / 0.08)  // 소성 발열(0.34에 정점)
      : 0;
    const porc = this.phase === "clay" ? 0
      : this.phase === "moon" ? 1
      : smoothstep(0.4, 1.0, this.bake);                              // 냉각=백자화

    // ── 재질: 흙 ↔ 백자(부드러운 lerp), 발열은 즉시 ───────────────────────
    const k = Math.min(1, dt * 3.2);
    this._tmpCol.copy(CLAY_COL).lerp(PORC_COL, porc);
    this.jarMat.color.lerp(this._tmpCol, k);
    this.jarMat.roughness += (lerp(0.92, 0.30, porc) - this.jarMat.roughness) * k;
    this.jarMat.clearcoat += (lerp(0.0, 0.7, porc) - this.jarMat.clearcoat) * k;
    this.jarMat.envMapIntensity += ((0.4 + porc * 1.3) - this.jarMat.envMapIntensity) * k;
    this.jarMat.emissive.copy(KILN_COL);
    this.jarMat.emissiveIntensity = heat * 2.1;

    // ── 방/불빛/달빛 ───────────────────────────────────────────────────────
    this._tmpCol.copy(BG_CLAY).lerp(BG_FIRE, heat).lerp(BG_MOON, porc);
    this.scene.background.lerp(this._tmpCol, Math.min(1, dt * 2.5));
    this.kilnLight.intensity = heat * 5.5;
    this.moonLight.intensity += (porc * 0.75 - this.moonLight.intensity) * k;
    this.keyLight.intensity += (lerp(0.6, 0.28, porc) - this.keyLight.intensity) * k;
    this.bloomPass.strength = 0.22 + heat * 0.55;
    this.capMat.opacity = 0.55 + porc * 0.32;

    // ── 손 표식: 카메라 흙 단계에서 감지된 손만 점+링으로(스켈레톤 없음) ────
    if (this._marks) {
      const show = camOn && this.phase === "clay";
      const halfH = MARK_DEPTH * Math.tan((this.camera.fov * Math.PI / 180) * 0.5);
      const halfW = halfH * this.camera.aspect;
      for (let i = 0; i < 2; i++) {
        const hnd = this._hands[i], g = this._marks[i];
        const on = show && hnd.present;
        g.visible = on;
        if (on) g.position.set((hnd.x * 2 - 1) * halfW, (1 - hnd.y * 2) * halfH, -MARK_DEPTH);
      }
    }

    // ── 캡션: 빚는 동안은 안내, 완성되면 시상(詩想) ────────────────────────
    this.cap.set(this.phase === "moon" ? CAP_POEM : this._capMsg);

    // ── 물레/자전: 빚을 땐 물레 속도, 식으면 느린 달의 자전 ───────────────
    let spin;
    if (this.phase === "clay") spin = THROW_RATE * this.wheelSpeed;
    else if (this.phase === "bake") spin = lerp(THROW_RATE * this.wheelSpeed, MOON_RATE, smoothstep(0, 0.5, this.bake));
    else spin = MOON_RATE;
    this.spinGroup.rotation.y += spin * dt;
  }

  controls(host) {
    host.appendChild(slider("WHEEL", 0, 2, this.wheelSpeed, 0.05, (v) => (this.wheelSpeed = v)));
  }
}
