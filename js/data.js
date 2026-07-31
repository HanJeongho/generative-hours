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
  { id: "hanguk", index: "XII", name: "Ink & Moon", sub: "먹과 달 — 한국 전통의 재발견", accent: "#e2603f" },
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
    hint: "해류를 휘저어 보세요 — 클릭하면 소용돌이가 태어납니다",
    module: "./pieces/01-currents.js",
  },
  {
    no: "02", wing: "flow", title: "Murmuration", ko: "군무",
    medium: "Boids flocking · separation·alignment·cohesion",
    year: "2026",
    note: "한 마리의 새도 전체를 지휘하지 않는다. 오직 가까운 이웃과의 세 가지 약속 — 부딪히지 않기, 같은 방향 보기, 서로 가까이 있기 — 만으로 수천 마리가 하나의 유기체처럼 출렁인다. 창발(emergence)의 가장 우아한 증거.",
    hint: "커서가 포식자가 되어 무리를 가릅니다 — 새도, 물고기도, 나비도 됩니다",
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
    hint: "먹이를 놓으면 점균이 길을 찾아 잇습니다",
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
    hint: "드래그로 빛의 안개를 천천히 돌려 보세요",
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
    hint: "주파수를 바꾸면 모래가 새 무늬로 춤춥니다",
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

  // ---- Wing IV — Form & Symmetry ---------------------------------------------
  {
    no: "13", wing: "form", title: "Mandala", ko: "만다라",
    medium: "Kaleidoscopic n-fold symmetry painting",
    year: "2026",
    note: "한 번의 붓질이 동시에 열두 번 반복된다. 중심을 둘러싼 완벽한 대칭 속에서, 관람객의 우연한 손짓은 의도하지 않은 질서가 된다. 그리는 이조차 결과를 예측할 수 없는, 명상으로서의 드로잉.",
    hint: "한 획을 그으면 대칭이 만다라를 완성해 줍니다",
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
    hint: "황금각을 돌려 식물의 질서를 피워 보세요",
    module: "./pieces/15-phyllotaxis.js",
  },
  {
    no: "16", wing: "form", title: "Harmonograph", ko: "하모노그래프",
    medium: "Damped pendulum composition · Lissajous",
    year: "2026",
    note: "두 개의 진자가 그리는 곡선. 19세기 빅토리아 시대의 응접실을 매혹시킨 이 장치는, 감쇠하는 진동의 합성만으로 끝없이 다른 문양을 낳는다.",
    hint: "진자의 흔들림이 스스로 곡선을 그립니다",
    module: "./pieces/16-harmonograph.js",
  },

  // ---- Wing V — Signal & Noise -----------------------------------------------
  {
    no: "17", wing: "signal", title: "Strange Attractor", ko: "기이한 끌개",
    medium: "Clifford / de Jong attractors · point cloud",
    year: "2026",
    note: "단 두 줄의 방정식을 수백만 번 되먹이면, 점들은 어디로도 수렴하지 않으면서 결코 같은 곳을 두 번 지나지 않는다. 무질서 속의 질서, 카오스가 그리는 초상 — 결정론적이지만 예측 불가능한.",
    hint: "변수를 더듬으며 아무도 본 적 없는 곡선을 찾아보세요",
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
    hint: "별을 당겨 성좌를 다시 그려 보세요",
    module: "./pieces/20-constellation.js",
  },

  // ---- Wing VI — Cosmos & Spacetime ------------------------------------------
  {
    no: "21", wing: "cosmos", title: "Event Horizon", ko: "사건의 지평선",
    medium: "Gravitational lensing · accretion disk · photon ring",
    year: "2026",
    note: "빛조차 빠져나오지 못하는 경계. 블랙홀 뒤편의 별빛은 휘어진 시공간을 따라 굽이쳐, 구멍을 감싸는 빛의 고리(아인슈타인 링)가 된다. 회전하는 강착원반은 빨려드는 물질의 마지막 비명이다.",
    hint: "블랙홀을 끌고 다니며 별빛이 휘는 것을 지켜보세요",
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
    hint: "별을 빚어 던져 보세요 — 오래 누를수록 무거워집니다",
    module: "./pieces/23-orbital-dance.js",
  },
  {
    no: "24", wing: "cosmos", title: "Hyperspace", ko: "초공간 도약",
    medium: "Relativistic starfield · aberration · Doppler shift",
    year: "2026",
    note: "광속에 다가갈수록 별들은 진행 방향으로 쏠리고(수차), 앞은 푸르게 뒤는 붉게 물든다(도플러 편이). 점들이 빛의 강줄기로 늘어나는 순간, 우리는 공간을 접어 도약한다.",
    hint: "지그시 눌러 광속까지 — 커서가 항로를 이끕니다",
    module: "./pieces/24-hyperspace.js",
  },

  // ---- Wing VII — Mirror & Presence (camera; on-device, no video leaves the browser)
  {
    no: "25", wing: "mirror", title: "Telekinesis", ko: "염력",
    medium: "Hand tracking · 21 landmarks · MediaPipe",
    year: "2026",
    note: "손이 곧 힘이 된다. 손바닥을 펼치면 빛의 입자들이 밀려나고, 엄지와 검지를 모아 쥐면(핀치) 한 줌의 빛을 거머쥐어 던질 수 있다. 주먹을 쥐면 손은 작은 블랙홀이 되어 모든 것을 빨아들인다. 카메라가 보는 것은 오직 당신의 손짓뿐 — 영상은 기기를 떠나지 않는다.",
    hint: "카메라 앞에서 손을 펴서 밀어내고, 꼬집어 쥐고, 주먹으로 빨아들여 보세요",
    module: "./pieces/25-telekinesis.js",
  },
  {
    no: "26", wing: "mirror", title: "Hundred Eyes", ko: "백 개의 눈",
    medium: "Face & iris tracking · 478 landmarks · MediaPipe",
    year: "2026",
    note: "화면을 가득 메운 눈동자들이 일제히 당신을 바라본다. 고개를 돌리면 백 개의 시선이 함께 따라오고, 가까이 다가서면 동공이 커진다. 보는 자와 보이는 자가 뒤바뀌는, 응시에 관한 명상.",
    hint: "카메라 앞에서 움직여 보세요 — 백 개의 눈이 당신을 좇습니다",
    module: "./pieces/26-hundred-eyes.js",
  },
  {
    no: "27", wing: "mirror", title: "Precognition", ko: "예지",
    medium: "Hand tracking · air-gesture UI · MediaPipe",
    year: "2026",
    note: "허공에 빛의 화면들이 떠 있다. 마우스도 키보드도 없이, 오직 두 손으로 그것들을 지휘한다 — 꼬집어 끌어오고, 두 손으로 잡아 펼치고, 휙 던져 흘려보낸다. 〈마이너리티 리포트〉의 예지(豫知) 인터페이스처럼, 몸짓이 곧 명령이 되는 미래의 손끝.",
    hint: "카메라 앞에 손을 들면, 허공의 화면을 꼬집어 잡고 펼치고 던질 수 있습니다",
    module: "./pieces/27-stardust-body.js",
  },
  {
    no: "28", wing: "mirror", title: "Living Mirror", ko: "살아있는 거울",
    medium: "Optical-flow motion field · camera-only (no model)",
    year: "2026",
    note: "거울 속의 당신은 형상이 아니라 움직임이다. 손짓 하나하나가 빛의 잉크를 휘젓고, 멈추면 물결은 다시 잔잔해진다. 인식하는 모델 없이 오직 움직임의 에너지만으로 그려지는, 가장 순수한 현존의 흔적.",
    hint: "카메라 앞에서 움직이면, 빛의 잉크가 당신을 따라 휩쓸립니다",
    module: "./pieces/28-living-mirror.js",
  },

  // ---- Wing VIII — Logos & Letterform ----------------------------------------
  {
    no: "29", wing: "logos", title: "Entropy", ko: "엔트로피",
    medium: "Particle text · diffusion · Maxwell's demon",
    year: "2026",
    note: "모든 질서는 무질서로 흩어진다 — 열역학 제2법칙. 당신이 쓴 글자는 빛의 입자가 되어 끊임없이 확산하고, 의미는 가만두면 먼지로 풀어진다. 커서는 '맥스웰의 도깨비'가 되어 스쳐가는 곳마다 입자를 다시 글자로 응결시킨다. 의미란, 끝없는 노력으로만 지켜지는 일시적 질서다.",
    hint: "글자를 흩어 놓고, 커서로 쓸어 의미를 다시 모아 보세요",
    module: "./pieces/29-entropy.js",
  },
  {
    no: "30", wing: "logos", title: "Babel", ko: "바벨",
    medium: "Glyph transmutation · writing systems · the Rosetta dial",
    year: "2026",
    note: "바벨 이후, 완전한 소통은 불가능해졌다. 글자는 라틴·한글·그리스·룬·기호 사이를 끝없이 미끄러지고, 의미는 잡으려는 순간 다른 문자로 변한다. 마우스를 좌우로 움직여 '번역의 다이얼'을 맞추면, 좁은 구간에서만 잠시 원문이 또렷이 읽힌다 — 곧 다시 낯선 언어로 흩어지는.",
    hint: "글자를 적어 넣고, 마우스로 좌우를 거닐며 원문이 읽히는 자리를 찾아보세요",
    module: "./pieces/30-babel.js",
  },
  {
    no: "31", wing: "logos", title: "Ensō", ko: "허공의 서예",
    medium: "Air calligraphy · variable-width brush · hand tracking",
    year: "2026",
    note: "禪의 일획(一劃). 검지 끝이 붓이 되어 허공에 먹을 친다. 느리게 그으면 굵게, 빠르게 그으면 가늘게 — 몸짓의 속도가 곧 필압이다. 먹은 수묵처럼 번지다 서서히 비워진다. 한 번의 거침없는 몸짓에 깃든 현존, 그리고 사라짐. 그린다는 것은 곧 지금 이 순간에 머무는 일이다.",
    hint: "검지로 허공에 먹을 긋고, 꼬집어 붓을 들어 보세요",
    module: "./pieces/31-enso.js",
  },
  {
    no: "32", wing: "logos", title: "Logogram", ko: "점토의 글자",
    medium: "Malleable glyph · two-hand deformation · hand tracking",
    year: "2026",
    note: "기표(記標)는 고정된 것이 아니다(소쉬르). 글자는 정해진 형상이 아니라 끝없이 주물러지는 점토다. 두 손으로 거대한 글자를 늘이고, 기울이고, 두껍게 빚는다 — 형(形)과 의(意)가 분리되는 순간, 글자는 의미를 잃고 순수한 조형이 된다. 한 손을 쥐면 다른 글자로 환생한다.",
    hint: "두 손으로 글자를 점토처럼 주무르고, 꼬집어 다음 글자로 넘겨 보세요",
    module: "./pieces/32-logogram.js",
  },

  // ---- Wing IX — Tiny Journeys (hundreds of cute pixel critters) -------------
  {
    no: "33", wing: "tiny", title: "Fireflies", ko: "반딧불이",
    medium: "Pulse-coupled fireflies · travelling waves of light · Canvas",
    year: "2026",
    note: "여름밤 풀밭의 반딧불이는 메트로놈처럼 한꺼번에 깜빡이지 않는다. 빛의 물결로 깜빡인다 — 한 줄기 섬광의 전선이 들판을 쓸고 지나가면 그 뒤로 잠시 어둠이 깔리고, 다시 모여 또 한 번 굽이친다. 바람이 풀밭을 훑듯 빛이 번져 가는 것이다. 동기화는 도달하는 상태가 아니라, 깨지고 다시 맺히기를 멈추지 않는 '동사(動詞)'다.",
    hint: "등불에 반딧불이가 모입니다 — 클릭하면 흩어지고, 오래 누르면 밤이 깊어집니다",
    module: "./pieces/33-fireflies.js",
  },
  {
    no: "34", wing: "tiny", title: "Ant Trails", ko: "개미의 길",
    medium: "Stigmergy · pheromone fields · 400 ants",
    year: "2026",
    note: "개미는 지도를 그리지 않는다. 오직 페로몬 한 방울씩을 남길 뿐인데, 그 자취가 쌓이고 옅어지기를 반복하며 둥지와 먹이 사이에 가장 짧은 빛의 도로망이 떠오른다. 나른 먹이가 쌓이면 둥지 아래로 미로 같은 굴이 자라고, 길 잃은 개미들은 서로의 꽁무니만 좇아 빙빙 맴돈다. 지능 없는 개체들이 흔적만으로 함께 짓는 길과 집 — 창발하는 집단지성, 그리고 그 어두운 이면.",
    hint: "먹이를 놓아 보세요 — 개미들이 길을 내고, 둥지에는 굴이 자랍니다",
    module: "./pieces/34-ant-trails.js",
  },
  {
    no: "35", wing: "tiny", title: "Herding", ko: "양몰이",
    medium: "Flee-flock dynamics · 300 sheep · Canvas",
    year: "2026",
    note: "흩어져 헤매던 작은 양들. 커서는 양치기 개가 되어 그들을 겁주고, 그 두려움을 이용해 우리로 몰아간다. 혼돈을 질서로 바꾸는 것은 명령이 아니라 방향이다 — 등을 떠밀지 않고, 갈 곳을 비워두는 일.",
    hint: "양치기 개가 되어 양 떼를 우리로 몰아 보세요 — 클릭하면 크게 짖습니다",
    module: "./pieces/35-herding.js",
  },
  {
    no: "36", wing: "tiny", title: "Little Pilgrims", ko: "작은 행렬",
    medium: "Terrain-sculpting platformer · 250 walkers",
    year: "2026",
    note: "작은 순례자들이 줄지어 무작정 앞으로 걷는다. 절벽에서 떨어지고 벽에 막히면서도 멈추지 않는다. 당신은 손끝으로 땅을 들어 다리를 놓고 길을 파, 이 무력한 행렬을 안전한 출구로 이끈다 — 창조주가 아니라, 길을 내어주는 자.",
    hint: "지형을 쌓고 파서 작은 순례자들의 길을 열어 주세요",
    module: "./pieces/36-tiny-parade.js",
  },

  // ---- Wing X — Re-rendered Masters (public-domain paintings, reinterpreted) --
  {
    no: "37", wing: "canvas", title: "After Hokusai — Great Wave", ko: "가나가와",
    medium: "Particle fluid · after Hokusai (1831, public domain)",
    year: "2026",
    note: "호쿠사이의 〈가나가와 해변의 높은 파도〉를 살아 움직이는 물로 다시 그린다. 그 상징적인 갈고리 같은 물보라는 수천 개의 유체 입자로 부서지고, 후지산은 그 너머 고요하다. 손으로 물을 휘저으면 파도는 흩어졌다가 — 다시 그 불멸의 형상으로 되돌아온다.",
    hint: "파도를 휘저어 보세요 — 흩어진 물은 다시 큰 파도로 모입니다",
    module: "./pieces/37-great-wave.js",
  },
  {
    no: "38", wing: "canvas", title: "After Van Gogh — Starry Night", ko: "별이 빛나는 밤",
    medium: "Living flow field · after Van Gogh (1889, public domain)",
    year: "2026",
    note: "반 고흐의 소용돌이치는 밤하늘을, 붓질 하나하나가 흐르는 살아있는 유동장으로 되살린다. 수천 개의 임파스토 획이 별의 후광을 휘감아 돌고, 사이프러스는 검은 불꽃처럼 솟는다. 휘저으면 하늘은 소용돌이치고, 곧 그 익숙한 밤으로 잦아든다.",
    hint: "밤하늘을 휘저어 보세요 — 클릭하면 새 별이 태어납니다",
    module: "./pieces/38-starry-night.js",
  },
  {
    no: "39", wing: "canvas", title: "After Munch — The Scream", ko: "절규",
    medium: "Wave-distortion field · after Munch (1893, public domain)",
    year: "2026",
    note: "뭉크의 〈절규〉를 '보이는 소리'로 다시 빚는다. 핏빛 하늘과 검푸른 피오르는 일렁이는 파동의 띠가 되고, 입에서 터진 비명은 충격파가 되어 세계를 일그러뜨린다. 비명이 거듭될수록 그림은 회복되지 않고 점점 더 어둠과 핏빛으로 가라앉는다 — 빠져나올 수 없는 불안의 하강.",
    hint: "커서로 세계를 일그러뜨리고, 클릭해 비명을 터뜨려 보세요",
    module: "./pieces/39-the-scream.js",
  },
  {
    no: "40", wing: "canvas", title: "After Seurat — Pointillism", ko: "점묘",
    medium: "Divisionist swarm · after Seurat (public domain)",
    year: "2026",
    note: "쇠라의 점묘법을 혼돈에서 되살린다. 수천 개의 색점이 구름처럼 떠돌다가 하나의 풍경 — 잔디밭, 나무, 양산을 든 여인 — 으로 자석처럼 모여들고, 잠시 머문 뒤 다시 흩어진다. 분할된 색이 눈 속에서 섞이는, 스스로 그려지는 그림.",
    hint: "손길에 점들이 흩어집니다 — 클릭하면 다시 모여듭니다",
    module: "./pieces/40-pointillist.js",
  },
  {
    no: "41", wing: "canvas", title: "After Mondrian — Composition", ko: "구성",
    medium: "Generative neoplasticism · after Mondrian (public domain)",
    year: "2026",
    note: "몬드리안의 신조형주의 격자가 살아 숨 쉰다. 굵은 검은 선이 미끄러지고 사각형들이 호흡하며, 빨강·파랑·노랑이 칸을 옮겨 다니면서도 그림은 끊임없이 새로운 균형을 찾아간다. 칸을 나누고 색을 입히며 당신만의 구성을 빚어보라.",
    hint: "칸을 두드려 나누고, 작은 칸에 색을 채워 보세요",
    module: "./pieces/41-mondrian.js",
  },
  {
    no: "42", wing: "canvas", title: "After Klimt — Golden Mosaic", ko: "황금빛",
    medium: "Gold-leaf mosaic · after Klimt (public domain)",
    year: "2026",
    note: "클림트 〈키스〉의 두 옷 무늬 — 남자의 흑백·금 직사각형 금세공과 여자의 색색 꽃·동심원·나선이 금박 바탕 위에 자잘하고 빽빽하게 깔려 비스듬히 반반 만난다. 채워주려 클릭하면 그 자리는 매끄럽게 칠해지는 대신 '반대 무늬'로 뒤집히고, 가장자리는 잉크처럼 얼기설기 번져 어디까지가 누구인지 흐려진다. 두 마음은 하나의 색으로 칠해지지 않지만, 결국 같은 금박 도화지에 함께 그려진다.",
    hint: "어루만지면 금빛이 번지고, 클릭하면 반대 무늬가 피어납니다",
    module: "./pieces/42-klimt-kiss.js",
  },

  {
no: "45", wing: "time", title: "Sand Mandala", ko: "모래 만다라",
    medium: "Coloured-sand pour · impermanence rite · Canvas2D",
    year: "2026",
    note: "티베트 승려들은 몇 주에 걸쳐 색모래 만다라를 완성하고, 완성되는 순간 쓸어버린다 — 무상(無常)의 의례. 여기서는 시간이 그 승려다. 만다라는 예순 개의 부채꼴, 곧 예순 개의 분(分)이다. 매분 새 부채꼴에 색모래가 알갱이로 쏟아져 초크 가이드 위의 문양을 채우고, 안쪽 고리엔 매초 상아색 모래 한 점이 놓인다. 그리고 정시 — 바람이 분다. 나선 돌풍이 한 시간의 작업을 통째로 쓸어가고, 알갱이들이 날아오르고, 새 팔레트의 새 만다라가 비어 있는 초크 라인 위에서 다시 시작된다. 시계를 읽는 법: 채워진 부채꼴을 세면 분, 지워지는 순간이 정시다.",
    hint: "긋고, 불고, 오래 눌러 폭풍을 부르세요 — 정시가 되면 바람이 모두 쓸어갑니다",
    module: "./pieces/45-mandala.js",
  },
{
    no: "73", wing: "time", title: "Five Minutes Late", ko: "너의 5분과 나의 5분",
    medium: "Canvas2D · 전역 timeScale · 가산 발광 성운", year: "2026",
    note: "같은 5분을 기다리는 사람은 한 시간으로, 늦는 사람은 한순간으로 산다 — 둘 다 거짓이 아니다. 검은 벌판 위 두 빛점을 가느다란 빛의 실이 잇는다. 그 실이 곧 약속이고, 당신은 실 위를 걷는 한 걸음의 빛이다. 기다리는 끝으로 다가가면 세계가 기어가듯 느려지고 초가 돌처럼 무겁게 내려앉으며, 반대 끝으로 건너가면 프레임이 탁 바뀌어 당신이 내달리고 세계가 줄무늬로 흐른다. 기다림의 끝에는 벽시계의 매 초마다 창백한 시간-입자가 쌓여 발광하는 성운으로 부푸는데, 이것만은 당신의 체감과 무관하게 자라난다. 구석의 시계는 실제 시각을 무보정으로 읽어, 늦는 자로 내달렸다 돌아왔을 때 당신이 남기고 온 체감-시간의 산더미를 보여준다.",
    hint: "실 위를 거닐어 보세요 — 한쪽 끝은 기다리는 5분, 반대쪽은 늦은 사람의 5분",
    module: "./pieces/73-fiveminutes.js",
  },
  { no: "87", wing: "hanguk", title: "Winter Scroll", ko: "겨울 두루마리", medium: "Canvas2D · 원작 이미지(김정희 세한도, public-domain scan) 두루마리 재해석", year: "2026", note: "김정희가 유배지 제주에서 그린 세한도는 집 한 채와 늙은 소나무·잣나무, 그리고 광대한 여백이 전부다. 이 작품은 그 그림을 두루마리답게 되돌려 준다 — 화면엔 긴 그림의 한 자락만 세로로 꽉 차게 보이고, 밀어서 감상한다. 여백은 덧칠하지 않는다. 그 비어 있음이 곧 추운 겨울 하늘이기 때문이다. 마른 눈이 성기게 내려 지붕과 솔가지에 얇게 앉았다가 바람에 쓸리고, 화면을 가만히 쥐고 있으면 시간이 저녁으로 기운다. 그때 집 창에 아주 작은 등불 하나가 켜진다 — 원작엔 없는 단 하나의 따뜻함, 추위 뒤에도 지지 않는 절개의 온도다.", hint: "천천히 밀며 읽는 두루마리 — 가만히 쥐면 저녁이 오고, 창에 등불이 켜집니다", module: "./pieces/87-sehando.js" },
  { no: "89", wing: "hanguk", title: "Lighting the Lantern", ko: "월하정인 — 초롱불을 켜는 손", medium: "Canvas2D · 원작 이미지(신윤복 월하정인, public-domain scan) · 밤 청묵 그레이딩 + 초롱 발광", year: "2026", note: "신윤복의 〈월하정인〉은 초승달이 걸린 담모퉁이에서 쓰개치마를 쓴 여인과 초롱불 든 선비가 마주 선 밤의 정경이다. 이 화면에는 원작 위로 은은한 청묵(靑墨)이 밤을 드리우고, 초승달 자리엔 상시 아주 옅은 달무리가 걸려 있다. 화면을 어디든 꾹 누르고 있으면 이삼 초에 걸쳐 초롱불이 서서히 차오른다 — 초롱 몸통이 주황으로 발광하며 심지가 깜빡이고, 그 빛 웅덩이가 두 사람과 담벼락으로 번지며 밤이 그 반경만큼 걷힌다. 불이 무르익으면 여인과 선비의 볼에 발그스레한 홍조가 수줍게 스민다. 손을 놓으면 불은 천천히 사그라들고 홍조도 잦아든다. 빛은 오직 초롱불 하나 — 다른 광원은 없다. 그림은 조금도 훼손하지 않고, 오직 빛으로만 그 밤에 불을 켠다.", hint: "가만히 눌러 초롱에 불을 밝히면, 두 사람의 볼이 붉어집니다", module: "./pieces/89-wolha.js" },

  // ---- Wing XII — Digital Hours (디지털 시각 표시 그 자체를 예술로) ----------

  // ---- Wing XIII — Ways of Seeing (지각 자체가 작품: 당신의 뇌를 테스트) ----

  // ---- Wing XIV — Beautiful Errors (뇌의 정직한 오류: 착시 체험실) ----------

];

export const wingOf = (id) => WINGS.find((w) => w.id === id);
export const workOf = (no) => WORKS.find((w) => w.no === no);
