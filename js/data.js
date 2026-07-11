// ============================================================================
//  Generative Hours — Exhibition Catalogue
//  20 works across 5 wings. Each entry is a "placard": the wall text a visitor
//  reads beside the piece. `module` points at the loadable art engine; pieces
//  without one show a "in preparation" placard but still occupy the gallery so
//  the full scale of the exhibition is visible.
// ============================================================================

export const WINGS = [
  { id: "flow",   index: "I",   name: "Forces & Flow",   sub: "힘과 흐름",     accent: "#7cc6ff" },
  { id: "life",   index: "II",  name: "Living Systems",  sub: "살아있는 계",   accent: "#8fe39a" },
  { id: "light",  index: "III", name: "Light & Optics",  sub: "빛과 광학",     accent: "#ffd27c" },
  { id: "form",   index: "IV",  name: "Form & Symmetry", sub: "형태와 대칭",   accent: "#d6a6ff" },
  { id: "signal", index: "V",   name: "Signal & Noise",  sub: "신호와 노이즈", accent: "#ff8fa3" },
  { id: "cosmos", index: "VI",  name: "Cosmos & Spacetime", sub: "우주와 시공간", accent: "#9aa8ff" },
  { id: "mirror", index: "VII", name: "Mirror & Presence", sub: "거울과 현존", accent: "#5fe6d0" },
  { id: "logos",  index: "VIII", name: "Logos & Letterform", sub: "말과 글자", accent: "#ff6a3d" },
  { id: "tiny",   index: "IX",  name: "Tiny Journeys", sub: "작은 것들의 모험", accent: "#ffd27c" },
  { id: "canvas", index: "X",   name: "Re-rendered Masters", sub: "다시 그린 명화", accent: "#e8c66a" },
  { id: "time",   index: "XI",  name: "Ways of Telling Time", sub: "시간을 세는 법", accent: "#c0c8d0" },
  // hidden vault — 비공개 보관고. 내비/갤러리에 노출되지 않고 딥링크(#work-NN)로만 접근.
  { id: "vault", index: "\u2014", name: "Storage Vault", sub: "수장고 · 비공개", accent: "#8a93a5", hidden: true },
];

// Each work:
//   no       — catalogue number (string, zero-padded)
//   wing     — wing id
//   title    — English exhibition title
//   ko       — Korean subtitle
//   medium   — the technique, stated as a museum medium line
//   year     — invented "edition" year, for flavour
//   note     — curator / artist note (the wall text)
//   hint     — one-line interaction prompt shown on the action bar
//   module   — dynamic-import path of the art engine, or null if in preparation
export const WORKS = [
  // ---- Wing I — Forces & Flow ------------------------------------------------
  {
    no: "01", wing: "flow", title: "Whispering Currents", ko: "속삭이는 해류",
    medium: "Perlin-noise vector field · 28,000 particles · Canvas",
    year: "2026",
    note: "보이지 않는 바람이 화면 전체를 가로지른다. 수만 개의 빛 입자는 저마다 그 흐름에 순응하며 긴 잔상을 남기고, 장(場)은 시간에 따라 천천히 회전한다. 관람객의 손길은 국소적인 소용돌이가 되어 질서를 잠시 흩뜨린다 — 곧 다시 평온으로 수렴하는, 자기조직화하는 고요.",
    hint: "마우스를 움직여 해류를 휘저으세요 · 클릭으로 소용돌이 생성",
    module: "./pieces/01-currents.js",
  },
  {
    no: "02", wing: "flow", title: "Murmuration", ko: "군무",
    medium: "Boids flocking · separation·alignment·cohesion",
    year: "2026",
    note: "한 마리의 새도 전체를 지휘하지 않는다. 오직 가까운 이웃과의 세 가지 약속 — 부딪히지 않기, 같은 방향 보기, 서로 가까이 있기 — 만으로 수천 마리가 하나의 유기체처럼 출렁인다. 창발(emergence)의 가장 우아한 증거.",
    hint: "커서가 포식자가 되어 무리를 가릅니다 · 새·물고기·나비·빛입자 중 선택",
    module: "./pieces/02-murmuration.js",
  },
  {
    no: "03", wing: "flow", title: "Liquid Light", ko: "액체의 빛",
    medium: "Metaballs · marching squares iso-surface",
    year: "2026",
    note: "표면장력을 가진 빛의 방울들. 가까워지면 하나로 녹아 흐르고, 멀어지면 다시 갈라진다. 경계가 끊임없이 다시 그려지는, 액체와 빛 사이의 물질.",
    hint: "방울을 끌어 합치고 다시 가르세요",
    module: "./pieces/03-liquid-light.js",
  },
  {
    no: "04", wing: "flow", title: "Still Water", ko: "잔잔한 물",
    medium: "2D wave-equation surface simulation",
    year: "2026",
    note: "한 점의 충격은 동심원이 되어 퍼지고, 벽에 부딪혀 돌아오며, 다른 파동과 만나 간섭한다. 정적인 수면 위에서 펼쳐지는 파동 방정식의 시각적 풀이.",
    hint: "수면을 클릭해 물수제비를 던지세요",
    module: "./pieces/04-still-water.js",
  },

  // ---- Wing II — Living Systems ----------------------------------------------
  {
    no: "05", wing: "life", title: "Morphogenesis", ko: "형태발생",
    medium: "Gray–Scott reaction–diffusion · Turing patterns",
    year: "2026",
    note: "1952년 앨런 튜링은 두 화학물질의 확산 속도 차이만으로 표범의 점과 얼룩말의 줄이 생겨날 수 있음을 보였다. 여기, 그 방정식이 살아 숨 쉰다. 칠한 자리마다 무늬가 번식하고, 분열하고, 경쟁하며 스스로 생태를 이룬다.",
    hint: "화면을 문질러 씨앗을 뿌리고 무늬를 키우세요",
    module: "./pieces/05-morphogenesis.js",
  },
  {
    no: "06", wing: "life", title: "Cellular Dreams", ko: "세포의 꿈",
    medium: "Lenia · continuous cellular automata",
    year: "2026",
    note: "콘웨이의 생명게임이 흑과 백의 격자였다면, 레니아는 연속적인 농도의 세계다. 부드러운 경계를 가진 생명체(orbium)들이 헤엄치고, 번식하고, 때로는 충돌해 소멸한다. 디지털 미생물의 수족관.",
    hint: "패턴을 그려 생명체로 진화시키세요",
    module: "./pieces/06-cellular-dreams.js",
  },
  {
    no: "07", wing: "life", title: "Slime Network", ko: "점균의 지도",
    medium: "Physarum agent simulation · pheromone trails",
    year: "2026",
    note: "뇌가 없는 점균류는 먹이 사이에 도쿄 지하철망에 버금가는 효율적 네트워크를 그린다. 수만 마리의 단순한 행위자가 페로몬 흔적을 남기고 따라가며, 살아있는 인프라를 직조한다.",
    hint: "먹이를 놓아 점균 네트워크를 유도하세요",
    module: "./pieces/07-slime.js",
  },
  {
    no: "08", wing: "life", title: "Phototropism", ko: "굴광성",
    medium: "L-system recursive growth · branching",
    year: "2026",
    note: "단 몇 줄의 재귀 규칙이 한 그루의 나무가 된다. 가지는 빛을 향해 굽고, 세대를 거듭하며 잎을 틔운다. 자연의 알고리즘을 손으로 키우는 정원.",
    hint: "커서의 빛을 따라 가지가 자랍니다",
    module: "./pieces/08-phototropism.js",
  },

  // ---- Wing III — Light & Optics ---------------------------------------------
  {
    no: "09", wing: "light", title: "Volumetric", ko: "체적의 빛",
    medium: "WebGL volumetric ray-marching",
    year: "2026",
    note: "표면이 아니라 부피. GPU의 모든 픽셀이 빛의 구름 속으로 광선을 쏘아, 지나는 길마다 밝기와 흐림을 적분한다. 중심에 묻힌 빛이 안개를 통과하며 산란해 — 만질 수 없지만 분명히 거기서 빛나는, 빛에게 주어진 몸.",
    hint: "드래그로 회전 · 슬라이더로 밀도와 광채를 조절하세요",
    module: "./pieces/09-volumetric.js",
  },
  {
    no: "10", wing: "light", title: "Lumen", ko: "루멘",
    medium: "2D ray-casting · soft shadows",
    year: "2026",
    note: "빛은 직진하고, 막히면 그림자를 드리운다. 단순한 진리를 수천 개의 광선으로 그려내면, 어둠 속에서 형태가 조각된다.",
    hint: "벽을 놓고 광원을 끌어 그림자를 연출하세요",
    module: "./pieces/10-lumen.js",
  },
  {
    no: "11", wing: "light", title: "Cymatics", ko: "사이매틱스",
    medium: "Chladni standing-wave plate",
    year: "2026",
    note: "소리는 보이지 않지만, 진동하는 판 위의 모래는 소리의 형상을 드러낸다. 주파수마다 모래는 다른 기하학적 무늬로 모여든다 — 들리지 않는 것의 초상.",
    hint: "주파수를 바꿔 모래 무늬를 변형하세요",
    module: "./pieces/11-cymatics.js",
  },
  {
    no: "12", wing: "light", title: "Prism", ko: "프리즘",
    medium: "Chromatic aberration · moiré interference",
    year: "2026",
    note: "두 개의 규칙적인 격자가 겹치는 순간, 어디에도 없던 제3의 무늬가 태어난다. 무아레. 빛의 분광과 간섭이 만드는, 질서의 충돌이 낳은 무지개.",
    hint: "두 격자를 겹쳐 간섭 무늬를 만드세요",
    module: "./pieces/12-prism.js",
  },
  {
    no: "75", wing: "vault", title: "Stray Light", ko: "길 잃은 빛",
    medium: "raw WebGL · GLSL fragment shader · screen-space volumetric rays",
    year: "2026",
    note: "하늘은 한낮이 아니다. 별이 흩뿌려지고 성운이 희미하게 도는 깊은 우주 — 그 검은 천장이다. 그런데 그 우주를 가로지른 구름의 틈으로, 있을 수 없는 태양광 기둥이 쏟아져 내린다. 빛은 어두운 벌판 전체가 아니라 틈 아래의 몇 구역만 적시고, 지면에 고인 웅덩이 속에서만 먼지가 반짝인다. 기둥의 가장자리는 프리즘처럼 갈라져 붉고 푸른 테두리를 남긴다. 있어선 안 될 곳에 닿은 빛 — 그래서 더 아름답다.",
    hint: "드래그로 빛의 틈을 끌어 옮기고 · 빈 하늘을 클릭해 새 틈을 열며 · RAYS로 틈의 수, DISPERSION으로 분광을 조절하세요",
    module: "./pieces/75-straylight.js",
  },

  // ---- Wing IV — Form & Symmetry ---------------------------------------------
  {
    no: "13", wing: "form", title: "Mandala", ko: "만다라",
    medium: "Kaleidoscopic n-fold symmetry painting",
    year: "2026",
    note: "한 번의 붓질이 동시에 열두 번 반복된다. 중심을 둘러싼 완벽한 대칭 속에서, 관람객의 우연한 손짓은 의도하지 않은 질서가 된다. 그리는 이조차 결과를 예측할 수 없는, 명상으로서의 드로잉.",
    hint: "화면에 그려 대칭 만다라를 완성하세요 · 대칭 수 조절 가능",
    module: "./pieces/13-mandala.js",
  },
  {
    no: "14", wing: "form", title: "Fracture", ko: "균열",
    medium: "Voronoi · Delaunay stained glass",
    year: "2026",
    note: "공간을 가장 가까운 점에게 나눠주면, 세포의 막처럼 자연스러운 분할이 생긴다. 보로노이. 깨진 유리창의 조각들 사이로 빛이 스며든다.",
    hint: "클릭해 유리를 깨고 빛을 통과시키세요",
    module: "./pieces/14-fracture.js",
  },
  {
    no: "15", wing: "form", title: "Phyllotaxis", ko: "잎차례",
    medium: "Golden-angle spiral packing",
    year: "2026",
    note: "해바라기 씨앗은 137.5°, 황금각을 따라 배열된다. 그것이 가장 빈틈없는 포장이기 때문이다. 식물이 발견한 무리수의 아름다움.",
    hint: "각도와 밀도를 조절해 식물 배열을 생성하세요",
    module: "./pieces/15-phyllotaxis.js",
  },
  {
    no: "16", wing: "form", title: "Harmonograph", ko: "하모노그래프",
    medium: "Damped pendulum composition · Lissajous",
    year: "2026",
    note: "두 개의 진자가 그리는 곡선. 19세기 빅토리아 시대의 응접실을 매혹시킨 이 장치는, 감쇠하는 진동의 합성만으로 끝없이 다른 문양을 낳는다.",
    hint: "진자 변수를 조절해 곡선을 그리세요",
    module: "./pieces/16-harmonograph.js",
  },

  // ---- Wing V — Signal & Noise -----------------------------------------------
  {
    no: "17", wing: "signal", title: "Strange Attractor", ko: "기이한 끌개",
    medium: "Clifford / de Jong attractors · point cloud",
    year: "2026",
    note: "단 두 줄의 방정식을 수백만 번 되먹이면, 점들은 어디로도 수렴하지 않으면서 결코 같은 곳을 두 번 지나지 않는다. 무질서 속의 질서, 카오스가 그리는 초상 — 결정론적이지만 예측 불가능한.",
    hint: "파라미터를 탐색해 새로운 끌개를 발견하세요",
    module: "./pieces/17-attractor.js",
  },
  {
    no: "18", wing: "signal", title: "Datamosh", ko: "데이터모시",
    medium: "Digital rain · pixel sorting · datamoshing",
    year: "2026",
    note: "코드가 비처럼 흘러내린다. 읽히던 글자(신호)가 정렬·번짐·찢김의 글리치를 만나 노이즈로 무너진다. 화면을 문지르면 흐르는 코드가 녹아 번지며 — 신호와 노이즈의 경계가 손끝에서 무너져 내린다.",
    hint: "화면을 문질러 코드를 녹이세요",
    module: "./pieces/18-datamosh.js",
  },
  {
    no: "19", wing: "signal", title: "Words Unbound", ko: "풀려난 말",
    medium: "Kinetic typography · physics engine",
    year: "2026",
    note: "글자는 의미를 잃고 물질이 된다. 중력에 떨어지고, 서로 부딪히고, 쌓인다. 읽히기를 멈춘 텍스트가 비로소 보이기 시작한다.",
    hint: "글자를 입력하면 중력으로 흩어집니다",
    module: "./pieces/19-words.js",
  },
  {
    no: "20", wing: "signal", title: "Constellation", ko: "성좌",
    medium: "Force-directed graph · network layout",
    year: "2026",
    note: "점과 점 사이의 인력과 척력만으로 별들은 스스로 자리를 찾는다. 흩어진 노드들이 보이지 않는 힘의 균형 속에서 하나의 성좌를 이룬다.",
    hint: "노드를 당겨 성좌를 재배치하세요",
    module: "./pieces/20-constellation.js",
  },

  // ---- Wing VI — Cosmos & Spacetime ------------------------------------------
  {
    no: "21", wing: "cosmos", title: "Event Horizon", ko: "사건의 지평선",
    medium: "Gravitational lensing · accretion disk · photon ring",
    year: "2026",
    note: "빛조차 빠져나오지 못하는 경계. 블랙홀 뒤편의 별빛은 휘어진 시공간을 따라 굽이쳐, 구멍을 감싸는 빛의 고리(아인슈타인 링)가 된다. 회전하는 강착원반은 빨려드는 물질의 마지막 비명이다.",
    hint: "블랙홀을 끌어 별빛을 휘게 하세요 · 질량 조절 가능",
    module: "./pieces/21-event-horizon.js",
  },
  {
    no: "22", wing: "cosmos", title: "Wormhole", ko: "웜홀",
    medium: "Einstein–Rosen bridge · perspective tunnel",
    year: "2026",
    note: "시공간에 뚫린 지름길. 좁아졌다 다시 넓어지는 목구멍(throat)을 지나면, 우주의 한쪽 끝이 다른 쪽 끝과 이어진다. 이론으로만 존재하는 통로를, 직접 통과해 비행한다.",
    hint: "커서로 진로를 조종해 웜홀을 통과하세요",
    module: "./pieces/22-wormhole.js",
  },
  {
    no: "23", wing: "cosmos", title: "Orbital Dance", ko: "중력의 무도",
    medium: "Newtonian N-body gravity · symplectic integration",
    year: "2026",
    note: "별과 행성은 보이지 않는 끈으로 묶여 끝없이 서로를 돈다. 단 하나의 법칙 — 거리의 제곱에 반비례하는 인력 — 만으로 태양계의 우아한 질서와 혼돈의 슬링샷이 모두 태어난다.",
    hint: "누르고 있으면 더 무거운 별 · 던져서 궤도에 진입시키세요",
    module: "./pieces/23-orbital-dance.js",
  },
  {
    no: "24", wing: "cosmos", title: "Hyperspace", ko: "초공간 도약",
    medium: "Relativistic starfield · aberration · Doppler shift",
    year: "2026",
    note: "광속에 다가갈수록 별들은 진행 방향으로 쏠리고(수차), 앞은 푸르게 뒤는 붉게 물든다(도플러 편이). 점들이 빛의 강줄기로 늘어나는 순간, 우리는 공간을 접어 도약한다.",
    hint: "눌러서 광속까지 가속 · 커서로 진행 방향을 조종하세요",
    module: "./pieces/24-hyperspace.js",
  },

  // ---- Wing VII — Mirror & Presence (camera; on-device, no video leaves the browser)
  {
    no: "25", wing: "mirror", title: "Telekinesis", ko: "염력",
    medium: "Hand tracking · 21 landmarks · MediaPipe",
    year: "2026",
    note: "손이 곧 힘이 된다. 손바닥을 펼치면 빛의 입자들이 밀려나고, 엄지와 검지를 모아 쥐면(핀치) 한 줌의 빛을 거머쥐어 던질 수 있다. 주먹을 쥐면 손은 작은 블랙홀이 되어 모든 것을 빨아들인다. 카메라가 보는 것은 오직 당신의 손짓뿐 — 영상은 기기를 떠나지 않는다.",
    hint: "카메라 허용 후 · 손을 펴서 밀고, 핀치로 쥐고, 주먹으로 빨아들이세요",
    module: "./pieces/25-telekinesis.js",
  },
  {
    no: "26", wing: "mirror", title: "Hundred Eyes", ko: "백 개의 눈",
    medium: "Face & iris tracking · 478 landmarks · MediaPipe",
    year: "2026",
    note: "화면을 가득 메운 눈동자들이 일제히 당신을 바라본다. 고개를 돌리면 백 개의 시선이 함께 따라오고, 가까이 다가서면 동공이 커진다. 보는 자와 보이는 자가 뒤바뀌는, 응시에 관한 명상.",
    hint: "카메라 허용 후 · 얼굴을 움직이면 모든 눈이 당신을 좇습니다",
    module: "./pieces/26-hundred-eyes.js",
  },
  {
    no: "27", wing: "mirror", title: "Precognition", ko: "예지",
    medium: "Hand tracking · air-gesture UI · MediaPipe",
    year: "2026",
    note: "허공에 빛의 화면들이 떠 있다. 마우스도 키보드도 없이, 오직 두 손으로 그것들을 지휘한다 — 꼬집어 끌어오고, 두 손으로 잡아 펼치고, 휙 던져 흘려보낸다. 〈마이너리티 리포트〉의 예지(豫知) 인터페이스처럼, 몸짓이 곧 명령이 되는 미래의 손끝.",
    hint: "카메라 허용 후 · 손을 들어 화면을 꼬집어 잡고, 두 손으로 펼치고, 휙 던지세요",
    module: "./pieces/27-stardust-body.js",
  },
  {
    no: "28", wing: "mirror", title: "Living Mirror", ko: "살아있는 거울",
    medium: "Optical-flow motion field · camera-only (no model)",
    year: "2026",
    note: "거울 속의 당신은 형상이 아니라 움직임이다. 손짓 하나하나가 빛의 잉크를 휘젓고, 멈추면 물결은 다시 잔잔해진다. 인식하는 모델 없이 오직 움직임의 에너지만으로 그려지는, 가장 순수한 현존의 흔적.",
    hint: "카메라 허용 후 · 움직이면 빛의 잉크가 휩쓸립니다",
    module: "./pieces/28-living-mirror.js",
  },

  // ---- Wing VIII — Logos & Letterform ----------------------------------------
  {
    no: "29", wing: "logos", title: "Entropy", ko: "엔트로피",
    medium: "Particle text · diffusion · Maxwell's demon",
    year: "2026",
    note: "모든 질서는 무질서로 흩어진다 — 열역학 제2법칙. 당신이 쓴 글자는 빛의 입자가 되어 끊임없이 확산하고, 의미는 가만두면 먼지로 풀어진다. 커서는 '맥스웰의 도깨비'가 되어 스쳐가는 곳마다 입자를 다시 글자로 응결시킨다. 의미란, 끝없는 노력으로만 지켜지는 일시적 질서다.",
    hint: "글자를 입력하고 · 커서로 쓸어 흩어진 의미를 다시 응결시키세요",
    module: "./pieces/29-entropy.js",
  },
  {
    no: "30", wing: "logos", title: "Babel", ko: "바벨",
    medium: "Glyph transmutation · writing systems · the Rosetta dial",
    year: "2026",
    note: "바벨 이후, 완전한 소통은 불가능해졌다. 글자는 라틴·한글·그리스·룬·기호 사이를 끝없이 미끄러지고, 의미는 잡으려는 순간 다른 문자로 변한다. 마우스를 좌우로 움직여 '번역의 다이얼'을 맞추면, 좁은 구간에서만 잠시 원문이 또렷이 읽힌다 — 곧 다시 낯선 언어로 흩어지는.",
    hint: "글자를 입력하고 · 마우스를 좌우로 움직여 원문이 읽히는 지점을 찾으세요",
    module: "./pieces/30-babel.js",
  },
  {
    no: "31", wing: "logos", title: "Ensō", ko: "허공의 서예",
    medium: "Air calligraphy · variable-width brush · hand tracking",
    year: "2026",
    note: "禪의 일획(一劃). 검지 끝이 붓이 되어 허공에 먹을 친다. 느리게 그으면 굵게, 빠르게 그으면 가늘게 — 몸짓의 속도가 곧 필압이다. 먹은 수묵처럼 번지다 서서히 비워진다. 한 번의 거침없는 몸짓에 깃든 현존, 그리고 사라짐. 그린다는 것은 곧 지금 이 순간에 머무는 일이다.",
    hint: "카메라 허용 후 · 검지로 허공에 쓰고 · 핀치로 붓을 떼세요",
    module: "./pieces/31-enso.js",
  },
  {
    no: "32", wing: "logos", title: "Logogram", ko: "점토의 글자",
    medium: "Malleable glyph · two-hand deformation · hand tracking",
    year: "2026",
    note: "기표(記標)는 고정된 것이 아니다(소쉬르). 글자는 정해진 형상이 아니라 끝없이 주물러지는 점토다. 두 손으로 거대한 글자를 늘이고, 기울이고, 두껍게 빚는다 — 형(形)과 의(意)가 분리되는 순간, 글자는 의미를 잃고 순수한 조형이 된다. 한 손을 쥐면 다른 글자로 환생한다.",
    hint: "카메라 허용 후 · 두 손으로 글자를 점토처럼 빚고 · 핀치로 글자를 바꾸세요",
    module: "./pieces/32-logogram.js",
  },

  // ---- Wing IX — Tiny Journeys (hundreds of cute pixel critters) -------------
  {
    no: "33", wing: "tiny", title: "Fireflies", ko: "반딧불이",
    medium: "Pulse-coupled fireflies · travelling waves of light · Canvas",
    year: "2026",
    note: "여름밤 풀밭의 반딧불이는 메트로놈처럼 한꺼번에 깜빡이지 않는다. 빛의 물결로 깜빡인다 — 한 줄기 섬광의 전선이 들판을 쓸고 지나가면 그 뒤로 잠시 어둠이 깔리고, 다시 모여 또 한 번 굽이친다. 바람이 풀밭을 훑듯 빛이 번져 가는 것이다. 동기화는 도달하는 상태가 아니라, 깨지고 다시 맺히기를 멈추지 않는 '동사(動詞)'다.",
    hint: "마우스 등불에 반딧불이가 모입니다 · 짧게 클릭하면 그 자리 물결이 흩어지고 · 길게 누르면 밤이 깊어집니다",
    module: "./pieces/33-fireflies.js",
  },
  {
    no: "34", wing: "tiny", title: "Ant Trails", ko: "개미의 길",
    medium: "Stigmergy · pheromone fields · 400 ants",
    year: "2026",
    note: "개미는 지도를 그리지 않는다. 오직 페로몬 한 방울씩을 남길 뿐인데, 그 자취가 쌓이고 옅어지기를 반복하며 둥지와 먹이 사이에 가장 짧은 빛의 도로망이 떠오른다. 나른 먹이가 쌓이면 둥지 아래로 미로 같은 굴이 자라고, 길 잃은 개미들은 서로의 꽁무니만 좇아 빙빙 맴돈다. 지능 없는 개체들이 흔적만으로 함께 짓는 길과 집 — 창발하는 집단지성, 그리고 그 어두운 이면.",
    hint: "클릭으로 먹이를 놓으세요 · 운반이 쌓이면 둥지 굴이 미로처럼 자랍니다",
    module: "./pieces/34-ant-trails.js",
  },
  {
    no: "35", wing: "tiny", title: "Herding", ko: "양몰이",
    medium: "Flee-flock dynamics · 300 sheep · Canvas",
    year: "2026",
    note: "흩어져 헤매던 작은 양들. 커서는 양치기 개가 되어 그들을 겁주고, 그 두려움을 이용해 우리로 몰아간다. 혼돈을 질서로 바꾸는 것은 명령이 아니라 방향이다 — 등을 떠밀지 않고, 갈 곳을 비워두는 일.",
    hint: "커서(양치기 개)로 양을 몰아 우리에 넣으세요 · 클릭은 더 큰 '짖기'",
    module: "./pieces/35-herding.js",
  },
  {
    no: "36", wing: "tiny", title: "Little Pilgrims", ko: "작은 행렬",
    medium: "Terrain-sculpting platformer · 250 walkers",
    year: "2026",
    note: "작은 순례자들이 줄지어 무작정 앞으로 걷는다. 절벽에서 떨어지고 벽에 막히면서도 멈추지 않는다. 당신은 손끝으로 땅을 들어 다리를 놓고 길을 파, 이 무력한 행렬을 안전한 출구로 이끈다 — 창조주가 아니라, 길을 내어주는 자.",
    hint: "드래그로 지형을 쌓아 길을 만드세요 · 버튼으로 파기↔쌓기 전환",
    module: "./pieces/36-tiny-parade.js",
  },

  // ---- Wing X — Re-rendered Masters (public-domain paintings, reinterpreted) --
  {
    no: "37", wing: "canvas", title: "After Hokusai — Great Wave", ko: "가나가와",
    medium: "Particle fluid · after Hokusai (1831, public domain)",
    year: "2026",
    note: "호쿠사이의 〈가나가와 해변의 높은 파도〉를 살아 움직이는 물로 다시 그린다. 그 상징적인 갈고리 같은 물보라는 수천 개의 유체 입자로 부서지고, 후지산은 그 너머 고요하다. 손으로 물을 휘저으면 파도는 흩어졌다가 — 다시 그 불멸의 형상으로 되돌아온다.",
    hint: "물을 드래그로 휘저으세요 · 클릭으로 물보라 · 다시 파도로 모입니다",
    module: "./pieces/37-great-wave.js",
  },
  {
    no: "38", wing: "canvas", title: "After Van Gogh — Starry Night", ko: "별이 빛나는 밤",
    medium: "Living flow field · after Van Gogh (1889, public domain)",
    year: "2026",
    note: "반 고흐의 소용돌이치는 밤하늘을, 붓질 하나하나가 흐르는 살아있는 유동장으로 되살린다. 수천 개의 임파스토 획이 별의 후광을 휘감아 돌고, 사이프러스는 검은 불꽃처럼 솟는다. 휘저으면 하늘은 소용돌이치고, 곧 그 익숙한 밤으로 잦아든다.",
    hint: "하늘을 드래그로 휘저으세요 · 클릭으로 새 별을 떨어뜨리세요",
    module: "./pieces/38-starry-night.js",
  },
  {
    no: "39", wing: "canvas", title: "After Munch — The Scream", ko: "절규",
    medium: "Wave-distortion field · after Munch (1893, public domain)",
    year: "2026",
    note: "뭉크의 〈절규〉를 '보이는 소리'로 다시 빚는다. 핏빛 하늘과 검푸른 피오르는 일렁이는 파동의 띠가 되고, 입에서 터진 비명은 충격파가 되어 세계를 일그러뜨린다. 비명이 거듭될수록 그림은 회복되지 않고 점점 더 어둠과 핏빛으로 가라앉는다 — 빠져나올 수 없는 불안의 하강.",
    hint: "클릭으로 비명을 터뜨리세요 · 커서를 움직여 세계를 일그러뜨리세요",
    module: "./pieces/39-the-scream.js",
  },
  {
    no: "40", wing: "canvas", title: "After Seurat — Pointillism", ko: "점묘",
    medium: "Divisionist swarm · after Seurat (public domain)",
    year: "2026",
    note: "쇠라의 점묘법을 혼돈에서 되살린다. 수천 개의 색점이 구름처럼 떠돌다가 하나의 풍경 — 잔디밭, 나무, 양산을 든 여인 — 으로 자석처럼 모여들고, 잠시 머문 뒤 다시 흩어진다. 분할된 색이 눈 속에서 섞이는, 스스로 그려지는 그림.",
    hint: "커서로 점을 흩뜨리세요 · 클릭으로 모이기↔흩어지기 전환",
    module: "./pieces/40-pointillist.js",
  },
  {
    no: "41", wing: "canvas", title: "After Mondrian — Composition", ko: "구성",
    medium: "Generative neoplasticism · after Mondrian (public domain)",
    year: "2026",
    note: "몬드리안의 신조형주의 격자가 살아 숨 쉰다. 굵은 검은 선이 미끄러지고 사각형들이 호흡하며, 빨강·파랑·노랑이 칸을 옮겨 다니면서도 그림은 끊임없이 새로운 균형을 찾아간다. 칸을 나누고 색을 입히며 당신만의 구성을 빚어보라.",
    hint: "칸을 클릭해 분할하세요 · 작은 칸 클릭으로 색을 바꾸세요",
    module: "./pieces/41-mondrian.js",
  },
  {
    no: "42", wing: "canvas", title: "After Klimt — Golden Mosaic", ko: "황금빛",
    medium: "Gold-leaf mosaic · after Klimt (public domain)",
    year: "2026",
    note: "클림트 〈키스〉의 두 옷 무늬 — 남자의 흑백·금 직사각형 금세공과 여자의 색색 꽃·동심원·나선이 금박 바탕 위에 자잘하고 빽빽하게 깔려 비스듬히 반반 만난다. 채워주려 클릭하면 그 자리는 매끄럽게 칠해지는 대신 '반대 무늬'로 뒤집히고, 가장자리는 잉크처럼 얼기설기 번져 어디까지가 누구인지 흐려진다. 두 마음은 하나의 색으로 칠해지지 않지만, 결국 같은 금박 도화지에 함께 그려진다.",
    hint: "클릭하면 그 자리에 반대 무늬가 피어납니다 · 드래그로 번지기",
    module: "./pieces/42-klimt-kiss.js",
  },

  {
    no: "43", wing: "vault", title: "Celestial Orrery", ko: "천체의 시계",
    medium: "Brass armillary orrery · orbiting jewels · three.js / WebGL 3D",
    year: "2026",
    note: "가장 오래된 시계는 하늘이었다. 황동 혼천의 한가운데 태양이 타오르고, 세 개의 보석이 행성처럼 그 둘레를 돈다 — 가장 안쪽(가장 빠른) 보석은 1분에 한 바퀴를 돌아 초를, 가운데 보석은 한 시간에 한 바퀴를 돌아 분을, 바깥 보석은 열두 시간에 한 바퀴를 돌아 시를 가리킨다. 매초 안쪽 보석이 눈금을 짚으며 태양이 한 번 고동치고, 매 분 초의 궤도가 완성되면 잔물결이 번지며, 정시엔 세 보석이 태양 위로 합(合)을 이루며 금빛 섬광과 종소리의 동심원이 퍼진다.",
    hint: "드래그 = 카메라 궤도 · 꾹 눌렀다 좌우로 끌면 시간의 크랭크 — 하늘이 감기고, 놓으면 지금으로 되감깁니다 · 클릭 = 태양 플레어+혜성 소환 · 매분 혜성이 가로지릅니다 · SPIN/FLARE · 12/24h",
    module: "./pieces/43-orrery.js",
  },
  {
    no: "44", wing: "vault", title: "Clepsydra", ko: "물시계 (자격루)",
    medium: "Jagyeongnu — float-rod + ball-strike automaton · three.js / WebGL 3D",
    year: "2026",
    note: "1434년 장영실·이천이 세종의 명으로 만든 자격루(自擊漏)를 그 원리 그대로 옮겼다. 왼쪽 청동 파수호(播水壺)들이 용두(龍頭) 주둥이로 물을 흘려 '일정한 유량'을 빚고, 그 물은 단 하나의 수수호(受水壺)에 차오른다. 핵심은 물이 아니라 구슬이 시간을 센다는 것. 수수호에서 부전(浮箭, 살대)이 떠오르며 그 끝이 옆 잣대 동판(銅板)의 눈금을 차례로 가리키고 — 부전 끝이 어떤 눈금에 닿느냐에 따라 그 눈금에 박힌 작은 쇠구슬이 풀려 굴러간다. 매분 눈금이면 구슬이 종(鐘)을, 매시 눈금이면 북(鼓)을, 자정 눈금이면 징(鉦)을 친다. 울리는 악기가 다른 까닭은 부전이 닿은 눈금이 다르기 때문이다(물은 위에서 아래로만 흐를 뿐 통 사이를 옮겨다니지 않는다). 연속적인 물의 차오름이 임계점에서 이산적 사건(구슬 하나의 낙하)으로 번역되고, 그 작은 사건이 기와 누각의 종소리로 증폭되는 — 1434년의 아날로그-디지털 변환. 시간은 재어지는 게 아니라, 부전이 눈금에 닿아 구슬이 칠 때 스스로 알려진다.",
    hint: "종·북·징을 직접 클릭해 보세요 — 그 악기의 구슬이 실제로 굴러가 칩니다 · 물통을 클릭하면 첨벙(물결 링+물방울) · 드래그 = 카메라 궤도 · 시뮬 버튼으로 매분/매시/자정 시보 · FLOW/RIPPLE · 12/24h",
    module: "./pieces/44-clepsydra.js",
  },
  {
no: "45", wing: "time", title: "Sand Mandala", ko: "모래 만다라",
    medium: "Coloured-sand pour · impermanence rite · Canvas2D",
    year: "2026",
    note: "티베트 승려들은 몇 주에 걸쳐 색모래 만다라를 완성하고, 완성되는 순간 쓸어버린다 — 무상(無常)의 의례. 여기서는 시간이 그 승려다. 만다라는 예순 개의 부채꼴, 곧 예순 개의 분(分)이다. 매분 새 부채꼴에 색모래가 알갱이로 쏟아져 초크 가이드 위의 문양을 채우고, 안쪽 고리엔 매초 상아색 모래 한 점이 놓인다. 그리고 정시 — 바람이 분다. 나선 돌풍이 한 시간의 작업을 통째로 쓸어가고, 알갱이들이 날아오르고, 새 팔레트의 새 만다라가 비어 있는 초크 라인 위에서 다시 시작된다. 시계를 읽는 법: 채워진 부채꼴을 세면 분, 지워지는 순간이 정시다.",
    hint: "드래그 = 손가락으로 모래에 고랑을 내기(다친 문양은 다음 시간까지 돌아오지 않습니다) · 클릭 = 입김으로 흩날리기 · 꾹 누르면 폭풍이 자랍니다 · [바람] 버튼 = 지금 쓸고 새 만다라 · GRAIN 밀도",
    module: "./pieces/45-mandala.js",
  },
  {
    no: "69", wing: "vault", title: "The Worn Step", ko: "닳는 자리",
    medium: "Float32 heightmap · grazing-light shading · permanent wear · Canvas2D",
    year: "2026",
    note: "발자국 하나로는 돌이 닳지 않는다. 그런데 오래된 계단은, 한가운데가 패여 있다. 눈앞의 회색 돌판을 힘껏 눌러 보라 — 금빛 먼지만 살짝 일 뿐, 자국은 보이지 않는다. 더 세게, 여러 번 눌러도 마찬가지다. 그러다 이미 깊게 파인 웅덩이와 구석의 비문을 본다: 284만 번 눌림, 그중 당신의 몫 아홉. 저 웅덩이는 전부 그런, 보이지 않는 누름만으로 파였다. 이 돌은 결코 회복되지 않고 깊어지기만 한다 — 정시마다 전부 쓸려가는 옆방의 모래 만다라와 정반대로. 큰 변화는 늘, 느낄 수 없는 하루들의 합이다.",
    hint: "누르고 문질러 보세요 — 자국은 안 보이지만 전부 영구히 적립됩니다 · 낮게 스치는 빛이 실제 시각을 따라 돕니다 · 웅덩이는 방문자들이 다녀갈수록 깊어지기만 합니다(리셋 없음)",
    module: "./pieces/69-wornstep.js",
  },
  {
    no: "70", wing: "vault", title: "Well-Loved", ko: "닳도록 꺼내 본 기억",
    medium: "Canvas2D · 실루엣 점구름 · 집단 누적(localStorage)", year: "2026",
    note: "자주 떠올린 장면일수록, 정작 또렷이 그리려 하면 뭉개져 있고 어디까지가 진짜였는지 확신이 서지 않는다. 기억은 꺼낼 때마다 다시 쓰인다 — 재응고(reconsolidation)라 부르는, 신비가 아니라 뇌가 하는 일이라 곧장 납득되고 그래서 더 아픈 사실이다. 이 방의 세 기억은 어둠 속에서 빛으로 뭉친 따뜻한 먼지 알갱이다. 손끝으로 짚어 떠올리면 그 기억은 선명해지고 되살아나지만, 알갱이의 안식 자리는 그때마다 조금씩 영영 어긋나고 색조가 물든다. 벽에서 가장 환한(=가장 자주 떠올린) 기억이 가장 부정확한 기억이 되고 — 그것을 닳게 한 범인이 다름 아닌 나의 애정이었음을, 물러서서 알게 된다.",
    hint: "커서(손끝)로 기억을 짚어 떠올리기 · 짚는 동안 선명해짐 · 놓아도 어긋난 자리는 돌아오지 않음 · 되돌리는 버튼은 없다",
    module: "./pieces/70-wellloved.js",
  },
  {
    no: "71", wing: "vault", title: "Downstream", ko: "물살은 되돌아오지 않는다",
    medium: "One-way current · curl-noise advection · Canvas2D",
    year: "2026",
    note: "전송 버튼을 누르기 직전과 직후. 후회할 문자 한 통, 홧김의 한마디. 누구나 반사적으로 손을 뻗었지만 이미 늦은 그 1초를 압니다. 여기, 한밤의 검은 강 위에 따뜻한 빛 하나가 당신 앞에 떠 있습니다 — 아직 보내지 않은 것. 손에 쥐고 머뭇거리는 동안엔 점점 더 밝고 따뜻하게 차오르지만, 놓는 순간 물살이 그것을 데려갑니다. 되잡으려 손을 뻗어도 빛은 커서에서 미끄러져 더 멀어질 뿐, 결코 돌아오지 않습니다. 하류엔 당신이, 그리고 누군가가 이미 보낸 모든 순간이 빛 무리로 떠 있습니다. 보내기 전까지만, 그것은 내 것입니다.",
    hint: "가까운 물에 손을 대면 새 빛이 손으로 떠오릅니다 · 쥐고 있는 동안 빛은 더 밝게 가열됩니다 · 손을 놓으면(플릭) 물살이 데려갑니다 · 되잡으려 손을 뻗으면 빛은 미끄러져 멀어질 뿐입니다 · 물살 속도 조절 · [새 빛 띄우기]",
    module: "./pieces/71-downstream.js",
  },
  {
    no: "72", wing: "vault", title: "Alight", ko: "손을 펴야, 지금이 내려앉는다",
    medium: "Real-clock anchor · pursuit-repulsion field · release-to-bloom · Canvas2D",
    year: "2026",
    note: "지금은 쥐려 할수록 달아나고, 손을 펴야 내려앉는다. 화면엔 단 하나의 섬세한 빛 알갱이 — 진짜 지금이다. 그 알갱이의 쉼자리는 실제 시계가 분(分)으로 읽히는 느린 궤적을 따라 한 시간에 한 바퀴 표류한다(작동하는 시계다). 손끝의 발광으로 그것을 좇으면, 좇는 딱 그만큼 알갱이는 달아나고 화면은 서늘하게 탈색되며 파르르 떨린다. 통하는 길은 하나뿐 — 애쓰기를 그만두는 것. 가만히, 손을 펴 곁에 오게 두면 알갱이가 느려지다 발광 위로 사뿐히 내려앉고, 따뜻한 빛이 화면을 가득 채우는 큰 블룸으로 만개하며 그 광휘 안에 지금 시각이 또렷이 뜬다. 잠들려 애쓸수록 더 말똥해지던 밤처럼, 지금을 가지는 길은 지금을 붙잡으려는 걸 그만두는 것이었다.",
    hint: "손끝의 빛으로 좇을수록 지금은 꼭 그만큼 달아납니다 · 잡으려 뻗거나 클릭하면 곧바로 날아오릅니다 · 유일한 길은 애쓰기를 그만두는 것 — 가만히, 손을 펴 곁에 오게 두면 발광 위로 내려앉아 만개하고 지금 시각(HH:MM)이 뜹니다",
    module: "./pieces/72-alight.js",
  },
{
    no: "73", wing: "time", title: "Five Minutes Late", ko: "너의 5분과 나의 5분",
    medium: "Canvas2D · 전역 timeScale · 가산 발광 성운", year: "2026",
    note: "같은 5분을 기다리는 사람은 한 시간으로, 늦는 사람은 한순간으로 산다 — 둘 다 거짓이 아니다. 검은 벌판 위 두 빛점을 가느다란 빛의 실이 잇는다. 그 실이 곧 약속이고, 당신은 실 위를 걷는 한 걸음의 빛이다. 기다리는 끝으로 다가가면 세계가 기어가듯 느려지고 초가 돌처럼 무겁게 내려앉으며, 반대 끝으로 건너가면 프레임이 탁 바뀌어 당신이 내달리고 세계가 줄무늬로 흐른다. 기다림의 끝에는 벽시계의 매 초마다 창백한 시간-입자가 쌓여 발광하는 성운으로 부푸는데, 이것만은 당신의 체감과 무관하게 자라난다. 구석의 시계는 실제 시각을 무보정으로 읽어, 늦는 자로 내달렸다 돌아왔을 때 당신이 남기고 온 체감-시간의 산더미를 보여준다.",
    hint: "실 위를 드래그로 걷기 — 기다림 끝(느림)과 늦음 끝(빠름) 사이 · [약속 —지금+5분]으로 진짜 카운트다운 · 구석 시계는 무보정 실제 시각",
    module: "./pieces/73-fiveminutes.js",
  },
  {
    no: "67", wing: "vault", title: "Gnomon", ko: "도는 것은 그림자가 아니다",
    medium: "Real solar geometry · frame-flip proof · Canvas2D",
    year: "2026",
    note: "인류 최초의 시계는 땅에 꽂은 막대 하나였다. 여기, 위에서 내려다본 돌 광장의 그노몬이 실제 태양의 고도와 방위로 그림자를 눕힌다 — 그림자가 곧 시곗바늘이다. 그러나 이 작품의 심장은 꾹 눌렀을 때 온다: 기준틀이 뒤집히며 햇빛이 화면에 못박히고, 광장이 — 시간 눈금이 — 지구가 돌기 시작한다. 그림자는 미동도 없는데 눈금이 그 밑을 지나간다. 해시계는 한 번도 그림자를 움직인 적이 없다. 도는 것은 처음부터 당신이었다. 그리고 밤이란: 지구 전체가 당신 위에 드리운 그림자다.",
    hint: "그림자 = 시곗바늘 · 꾹 누르면 빛이 고정되고 지구가 돕니다(하루가 16초에) — 놓으면 지금으로 되감김 · 드래그 = 하루 스크럽 · 클릭 = 새 그림자 · LATITUDE를 66.5° 위로 = 백야, SEASON = 겨울의 긴 그림자",
    module: "./pieces/67-gnomon.js",
  },
  {
    no: "68", wing: "vault", title: "Tides", ko: "밀물은 오지 않는다",
    medium: "Real lunar phase · zoom-out proof · Canvas2D",
    year: "2026",
    note: "달이 끄는 바다의 숨 — 오늘 밤의 실제 달 위상 아래, 해변의 수위가 12시간 25분의 호흡으로 오르내리고 젖은 모래띠가 지나간 밀물을 기억한다. 그러나 꾹 눌러 우주로 물러나면 두 개의 진실이 보인다. 하나: 달을 등진 반대편 바다도 똑같이 부풀어 있다 — 지구가 물보다 빨리 달에게 끌려가며 반대쪽 바다를 두고 가기 때문이다. 둘: 지구가 도는 동안 당신의 해변이 그 두 혹을 차례로 통과한다. 하루 두 번의 밀물은 물이 밀려오는 것이 아니다 — 당신이 부푼 바다 속으로 회전해 들어가는 것이다.",
    hint: "다음 만조 카운트다운과 실제 달 위상 · 꾹 누르면 우주 시점 — 반대편 바다도 부풀어 있고, 해변(점)이 두 혹을 통과할 때마다 밀물 · 우주에서 드래그 = 달 끌기 · MOON DIST = 멀어지는 달(조수는 식어가는 시계) · 클릭 = 파문",
    module: "./pieces/68-tides.js",
  },
  {
    no: "46", wing: "vault", title: "Pendulum Waves", ko: "진자의 파동",
    medium: "Pendulum-wave kinetics · phase-drift ribbon · three.js / WebGL 3D",
    year: "2026",
    note: "시간을 운동과 리듬으로 읽는다. 한 줄로 매달린 추들, 저마다 길이가 조금씩 달라 주기도 조금씩 다르다. 어긋나는 위상이 깊이를 가르는 물결을 그리고, 격자처럼 뒤엉켰다가, 한 호흡 동안 완벽한 일직선으로 다시 정렬한다. 그 정렬이 곧 시계다 — i번째 추는 1분에 정확히 (기본+i)번 흔들리도록 맞춰져 있어, 매 분 정각마다 모든 추가 한 줄로 되돌아온다. 분이 바뀌는 순간이 곧 장관이다. 정시엔 추의 빛깔이 하루의 색(서늘한 밤 → 따뜻한 한낮)으로 건너간다.",
    hint: "드래그로 시점을 돌려보고 · 클릭하면 추들이 함께 빛납니다 · 진자 수/스윙 조절 · 12/24h",
    module: "./pieces/46-pendulum-waves.js",
  },

  // ---- Wing XII — Digital Hours (디지털 시각 표시 그 자체를 예술로) ----------
  {
    no: "47", wing: "vault", title: "Nixie", ko: "닉시관의 시간",
    medium: "Nixie tube clock · three.js / WebGL 3D",
    year: "2026",
    note: "디지털 정보가 아직 물질이었던 시절 — 닉시관. 유리 진공관 속에 0부터 9까지, 열 장의 와이어 음극이 겹겹이 서 있고, 전압이 걸린 단 한 장만 네온 오렌지로 타오른다. 숫자가 바뀌는 순간을 보라: 옛 음극의 잔광이 이온의 기억처럼 식어가는 사이 새 음극이 달아오른다. 여섯 개의 관이 시각을, 그 사이 네온 콜론이 초를 깜빡인다. 나머지 아홉 개의 숫자는 늘 그 자리에서, 어둠 속에 겹쳐 선 채 자기 차례를 기다린다 — 표시되지 않는 시간도 관 속에 실재한다.",
    hint: "관을 탭하면 음극 10장이 차르륵 넘어가는 슬롯 스핀 · 드래그 = 카메라 궤도(유리와 와이어를 옆에서도 보세요) · 빈 곳을 꾹 누르면 전원 새그, 놓으면 왼쪽부터 플리커 재점화 · GLOW/FLICKER · 12/24h",
    module: "./pieces/47-nixie3d.js",
  },
  {
    no: "48", wing: "vault", title: "Glyph Rain", ko: "글리프의 비",
    medium: "Digit rain crystallising into numerals · Canvas2D",
    year: "2026",
    note: "화면 가득 숫자의 비가 쏟아진다 — 의미 없는 데이터의 폭우. 그러나 그 비 속에서, 올바른 자리에 떨어진 글리프들만 얼어붙어 거대한 여섯 자리 시각으로 응결된다. 시간이란 무작위한 데이터의 흐름에서 잠시 결정화된 질서라는 것. 초가 바뀌면 낡은 자리는 다시 비가 되어 흘러내리고, 새 숫자가 빗속에서 응결된다. 매분 정각엔 벽 전체가 한 번 와르르 녹아내렸다가 다시 맺힌다.",
    hint: "커서를 대면 비가 갈라집니다 · 누른 채 움직이면 닿는 비가 얼어붙어 서리로 그림을 그립니다(잠시 후 녹아 비로 회귀) · 숫자 클릭은 그 자리 융해→재결정 · 매분 전면 융해 · RAIN/GLOW · 12/24h",
    module: "./pieces/48-glyphrain.js",
  },
  {
    no: "49", wing: "vault", title: "Supernova Digits", ko: "숫자의 초신성",
    medium: "Additive particle numerals · per-glyph burst & re-condense · Canvas2D",
    year: "2026",
    note: "가장 노골적인 디지털 시계를, 가장 극적인 우주의 사건으로 되돌린다. 여섯 자리 숫자는 별먼지로 씌어 있다 — 초가 바뀔 때마다 낡은 숫자는 초신성으로 폭발해 흩어지고, 그 파편들이 중력에 되감기듯 모여들어 새 숫자로 응축된다. 매분엔 여러 자리가 연쇄로 무너지고, 정시엔 문자판 전체가 한 번 죽었다 다시 태어난다. 표시가 곧 사건이다: 시간은 넘어가는 게 아니라, 폭발하고 다시 태어난다.",
    hint: "커서로 별먼지를 흩뜨리고 · 숫자를 클릭하면 그 자리만, 빈 곳을 클릭하면 전체가 초신성 · 꾹 누르면 중력 우물 — 별먼지가 소용돌이치며 빨려들고, 놓으면 터지며 제자리로 · 12/24h",
    module: "./pieces/49-supernova.js",
  },
  {
    no: "50", wing: "vault", title: "Deep Display", ko: "디스플레이의 디스플레이",
    medium: "A wall of live seven-segment cells forming giant numerals · Canvas2D",
    year: "2026",
    note: "수백 개의 작은 7세그먼트 디스플레이가 벽을 이룬다. 하나하나는 저마다의 숫자를 빠르게 깜빡이는 소음일 뿐이지만, 물러서서 보면 — 밝게 점등된 셀들이 모여 거대한 여섯 자리 시각을 이룬다. 디스플레이로 만든 디스플레이, 숫자로 쓴 숫자. 재귀하는 디지털. 초가 바뀌면 재점등의 파도가 벽을 쓸고 지나가며 새 숫자를 켠다. 가장 작은 픽셀도, 가장 큰 글리프도, 같은 문법으로 말한다.",
    hint: "커서 주변 셀이 깨어나 반짝입니다 · 누른 채 드래그하면 지나간 셀들이 0→1→2… 세며 점등 — 숫자로 낙서하세요(서서히 소등) · 클릭은 스크램블 파문 · DENSITY/FLICKER · 12/24h",
    module: "./pieces/50-deepdisplay.js",
  },

  // ---- Wing XIII — Ways of Seeing (지각 자체가 작품: 당신의 뇌를 테스트) ----
  {
    no: "54", wing: "vault", title: "The Observer", ko: "관측",
    medium: "Iris-gaze collapse field · MediaPipe face + cursor fallback · Canvas2D",
    year: "2026",
    note: "수백 개의 존재가 확률 구름으로 일렁인다 — 어디에도 있고 어디에도 없는 채로. 그러나 당신의 시선이 닿는 곳은 다르다: 응시된 구름은 그 자리에서 또렷한 실재로 결정(結晶)되고, 시선이 떠나면 천천히 다시 확률로 풀려난다. 양자역학의 관측 문제와 버클리의 '존재는 지각됨이다'를 하나의 장(場)으로 만든 작품. 카메라가 있으면 당신의 홍채가 붓이 되고, 없으면 커서가 시선을 대신한다. 눈을 깜빡이는 순간, 세계 전체가 잠시 확률로 되돌아간다.",
    hint: "화면을 응시하면 그 자리의 구름이 실재로 굳습니다 · 시선을 옮기면 이전 자리는 다시 일렁임 · 눈을 깜빡이면(또는 클릭) 전체가 확률로 리셋 · 카메라 허용 시 진짜 시선 추적, 거부 시 커서 · GAZE R/DECAY",
    module: "./pieces/54-observer.js",
  },
  {
    no: "56", wing: "vault", title: "Emergence", ko: "떠오름",
    medium: "Gestalt assembly field · MediaPipe hand + cursor fallback · Canvas2D",
    year: "2026",
    note: "화면엔 무의미한 파편 수백 개가 떠돈다. 그러나 당신의 손이 지나는 자리에서 파편들이 방향을 맞추고 간격을 좁히면 — 어느 순간, 숨어 있던 단어가 '확' 떠오른다. 게슈탈트 심리학이 말하는 근접성·유사성·공동운명의 원리: 뇌는 조각을 보지 않고 형태를 본다. 그 완성의 찰나(아하!)는 화면이 아니라 당신 안에서 일어난다. 손을 치우면 의미는 다시 소음으로 흩어진다.",
    hint: "손(카메라) 또는 커서를 화면 위에서 천천히 움직여 보세요 — 지나는 자리마다 파편이 정렬되며 숨은 단어가 떠오릅니다 · 70% 이상 완성되면 전체가 스냅 · 완성되면 다음 단어 · REVEAL R 조절",
    module: "./pieces/56-emergence.js",
  },
  {
    no: "57", wing: "vault", title: "Garden of Choice", ko: "선택의 정원",
    medium: "Interactive evolution · Dawkins biomorphs · Canvas2D",
    year: "2026",
    note: "아홉 그루의 생성 형태가 자란다 — 가지 각도, 길이 감쇠, 대칭수, 곡률, 색이 전부 유전자다. 마음에 드는 하나를 고르면 그것이 어버이가 되어 여덟 변이 자손이 태어난다. 당신은 설계하지 않는다. 고를 뿐이다. 그런데 수 세대 뒤, 당신이 한 번도 상상한 적 없는 형태가 정원에 서 있다 — 도킨스가 「눈먼 시계공」에서 보인 누적 선택의 힘. 창조는 설계가 아니라 선택의 반복일 수 있다는 것.",
    hint: "마음에 드는 형태를 클릭 → 그 자식 8종이 태어납니다 · 하단 계보에 조상이 기록됩니다 · MUTATION으로 변이 폭 조절 · RESET으로 새 씨앗 · 호버하면 살아 숨쉽니다",
    module: "./pieces/57-biomorph.js",
  },

  // ---- Wing XIV — Beautiful Errors (뇌의 정직한 오류: 착시 체험실) ----------


  // ---- Hidden vault (비공개 수장고) — 이전 XII관 자연현상 3부작 보관 ----
  {
    no: "51", wing: "vault", title: "Helios", ko: "태양의 시계",
    medium: "Procedural star · fbm plasma + corona + prominences · WebGL GLSL",
    year: "2026",
    note: "가장 오래된 시계(하늘)를 가장 폭력적인 스케일로 되돌린다. 화면 가득 끓어오르는 항성 — 표면에선 플라스마 과립이 대류하고, 가장자리에선 코로나가 검은 우주로 흩날린다. 이 별은 심장처럼 매초 한 번 고동치고, 매분 정각이면 가장자리에서 홍염(프로미넌스)이 활처럼 솟아 터진다. 그리고 시(時)가 흐르면 별 자체가 늙는다 — 새벽의 청백색 젊은 별에서 정오의 작열하는 백금, 밤의 깊은 적색거성까지. 하루가 곧 한 별의 일생이다.",
    hint: "드래그로 별을 돌리고 · 클릭하면 홍염이 터집니다 · 매분 0초의 대분출 · 12/24h",
    module: "./pieces/51-helios.js",
  },
  {
    no: "52", wing: "vault", title: "Fulgur", ko: "번개의 문자판",
    medium: "Recursive branching lightning · storm dial · Canvas2D",
    year: "2026",
    note: "폭풍의 밤이 문자판이 된다. 지평선 위로 60개의 피뢰침이 넓은 호를 그리며 늘어서 있고, 매초 구름에서 벼락이 내리꽂힌다 — 정확히 '지금 이 초'의 침 위로. 맞은 침은 불씨로 남아, 호가 채워진 만큼이 곧 흐른 초다. 분이 바뀌는 순간 하늘 전체가 갈라진다 — 대방전이 문자판을 쓸어 불씨를 지우고, 새 1분이 시작된다. 시간은 여기서 읽히지 않는다. 내리친다.",
    hint: "클릭하면 그 자리에 벼락을 소환합니다 · 드래그로 폭풍의 바람 · 매분 0초의 대방전 · 12/24h",
    module: "./pieces/52-fulgur.js",
  },
  {
    no: "53", wing: "vault", title: "Aurora Meridian", ko: "오로라 자오선",
    medium: "Ray-marched aurora curtains · night-palette drift · WebGL GLSL",
    year: "2026",
    note: "극지의 밤, 하늘에 드리운 빛의 커튼은 그 자체로 거대한 시계다. 매초 한 줄기 빛의 파문이 커튼 자락을 타고 흐르고, 매분 정각엔 하늘 전체가 출렁이는 대파동 — 커튼이 접혔다 펼쳐지며 새로 태어난다. 시(時)가 깊어질수록 오로라의 색도 밤을 따라 건넌다: 초저녁의 초록에서 자정의 보라, 새벽의 붉은 기운까지. 태양풍이 지구 자기장에 쓰는 이 편지를, 우리는 시간으로 읽는다.",
    hint: "드래그로 하늘을 둘러보고 · 클릭하면 빛의 폭발 · 매분 하늘 전체의 대파동 · 12/24h",
    module: "./pieces/53-aurora.js",
  },
];

export const wingOf = (id) => WINGS.find((w) => w.id === id);
export const workOf = (no) => WORKS.find((w) => w.no === no);
