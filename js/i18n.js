// ============================================================================
//  Generative Hours — 언어 레이어 (KO 기본 · EN 토글)
//
//  · 언어 상태: ?lang=ko|en 쿼리 > localStorage("gh-lang") > 미정("").
//    미정이면 본전시 아트리움에서만 첫 방문 선택 오버레이를 띄운다.
//  · KO가 원문(HTML/data 원본), EN은 얹는 레이어:
//    - 페이지 크롬(히어로·버튼·aria)은 이 파일의 CHROME_EN 사전으로 스왑
//    - 카탈로그/상세 텍스트는 main.js가 data*.en.js 오버레이를 병합
//    - 작품 컨트롤 라벨은 ctrlLabel()이 labels.en.js 사전으로 치환
//  · 이 모듈은 임포트 시 스스로 초기화한다(토글 주입·크롬 스왑·선택 오버레이).
// ============================================================================

export const LANG = (() => {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "ko") { localStorage.setItem("gh-lang", q); return q; }
    return localStorage.getItem("gh-lang") || "";
  } catch { return ""; }
})();

export const isEN = LANG === "en";

export function setLang(lang) {
  try { localStorage.setItem("gh-lang", lang); } catch {}
  if (lang === LANG || (lang === "ko" && LANG === "")) {
    document.querySelector(".langchooser")?.remove();
    return;
  }
  const url = new URL(location.href);
  url.searchParams.delete("lang");
  location.replace(url.href.split("#")[0] + (location.hash || ""));
}

// ── 컨트롤 라벨 사전 (labels.en.js — EN일 때만 지연 로드) ────────────────────
let CTRL_EN = null;
if (isEN) import("./labels.en.js").then((m) => { CTRL_EN = m.CTRL_EN; }).catch(() => {});
export const ctrlLabel = (s) => (isEN && CTRL_EN && CTRL_EN[s]) || s;

// ── 페이지 크롬 사전 ─────────────────────────────────────────────────────────
const PAGE = document.documentElement.dataset.catalog === "./data-errors.js" ? "errors"
  : document.documentElement.dataset.catalog === "./data-kids.js" ? "kids" : "main";

// 각 항목: [selector, { text | html | attr:[name, value] }]
const COMMON_EN = [
  [".brand", { attr: ["aria-label", "To the atrium"] }],
  [".topnav", { attr: ["aria-label", "Wings"] }],
  [".sound-toggle", { attr: ["aria-label", "Toggle sound"] }],
  ["#gallery", { attr: ["aria-label", "Works"] }],
  ["#room", { attr: ["aria-label", "Exhibit room"] }],
  [".placard__collapse", { attr: ["aria-label", "Collapse / expand the placard"] }],
  [".placard__more-label", { text: "Read the technical notes" }],
  ['[data-action="prev"]', { attr: ["aria-label", "Previous work"] }],
  ['[data-action="next"]', { attr: ["aria-label", "Next work"] }],
  [".room__exit", { text: "✕ Exit", attr: ["aria-label", "Leave the room (Esc)"] }],
  [".hero__enter", { html: 'Enter <span aria-hidden="true">↓</span>' }],
];

const CHROME_EN = {
  main: [
    ["title", { text: "Generative Hours · A Generative Art Exhibition" }],
    ['meta[name="description"]', { attr: ["content", "Generative Hours — a media-art exhibition of 46 interactive generative works."] }],
    [".hero__eyebrow", { text: "A generative · interactive media-art exhibition" }],
    [".hero__lead", { text: "Forty-six landscapes grown from code. Flow and life, light and form, noise and spacetime, mirrors and letterforms, tiny adventures, the masters re-rendered, and ways of telling time — wander twelve wings, and touch, stir, and grow the works yourself. Every frame exists only once: a picture that will never be drawn again." }],
    ["#credit p", { html: "Generative Hours · an exhibition drawn in code · <span id=\"year\"></span>" }],
  ],
  errors: [
    ["title", { text: "Beautiful Errors · An Illusion Exhibition — the brain's honest mistakes" }],
    ['meta[name="description"]', { attr: ["content", "Beautiful Errors — ten interactive optical illusions. Every one can be proven by hand."] }],
    [".hero__eyebrow", { text: "An interactive illusion show · a Generative Hours sister exhibition" }],
    [".hero__lead", { text: "Your brain doesn't see the world — it guesses. Perfect lines bend, equal sizes differ, still things spin, steady motion limps. Touch, turn, and overlay ten illusions yourself. And in any work, press and hold: a ruler and a proof appear to show you the truth. The moment you let go, your brain is fooled again." }],
    [".hero__sister a", { text: "← Main exhibition — Generative Hours" }],
    ["#credit p", { html: "Beautiful Errors · a Generative Hours sister show · <span id=\"year\"></span>" }],
  ],
  kids: [
    ["title", { text: "Little Hands · A camera playground for kids" }],
    ['meta[name="description"]', { attr: ["content", "Little Hands — an interactive show where children play with their hands and bodies in front of the camera."] }],
    [".hero__eyebrow", { text: "Play through the camera · a Generative Hours sister exhibition" }],
    [".hero__lead", { text: "No mouse, no keyboard — stand in front of the camera and raise your hands. That's all. Bubbles bloom from your fingertips, fireworks leap from your palms, you bounce balls with your arms, and shadow puppets come alive. It sees up to four hands at once, so siblings and friends can play side by side. (Please allow the camera — the video never leaves your device.)" }],
    [".hero__sister a", { text: "← Main exhibition — Generative Hours" }],
    ["#credit p", { html: "Little Hands · a Generative Hours sister show · <span id=\"year\"></span>" }],
  ],
};

function applyChrome() {
  if (!isEN) return;
  document.documentElement.lang = "en";
  for (const [sel, op] of [...COMMON_EN, ...(CHROME_EN[PAGE] || [])]) {
    const el = sel === "title" ? document.querySelector("head title") : document.querySelector(sel);
    if (!el) continue;
    if (op.text !== undefined) el.textContent = op.text;
    if (op.html !== undefined) el.innerHTML = op.html;
    if (op.attr) el.setAttribute(op.attr[0], op.attr[1]);
  }
}

// ── 헤더 KO/EN 토글 ──────────────────────────────────────────────────────────
function injectToggle() {
  const bar = document.querySelector(".topbar");
  if (!bar || bar.querySelector(".lang-toggle")) return;
  const btn = document.createElement("button");
  btn.className = "lang-toggle";
  btn.textContent = isEN ? "한국어" : "EN";
  btn.setAttribute("aria-label", isEN ? "한국어로 보기" : "View in English");
  btn.addEventListener("click", () => setLang(isEN ? "ko" : "en"));
  bar.insertBefore(btn, bar.querySelector(".sound-toggle"));
}

// ── 첫 방문 언어 선택 (본전시 아트리움에서만) ────────────────────────────────
function injectChooser() {
  if (PAGE !== "main" || LANG !== "") return;
  const el = document.createElement("div");
  el.className = "langchooser";
  el.innerHTML = `
    <div class="langchooser__panel" role="dialog" aria-label="Choose your language">
      <p class="langchooser__brand">GENERATIVE&nbsp;HOURS</p>
      <p class="langchooser__ask">언어를 선택하세요 · Choose your language</p>
      <div class="langchooser__btns">
        <button data-lang="ko">한국어</button>
        <button data-lang="en">English</button>
      </div>
    </div>`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lang]");
    if (b) setLang(b.dataset.lang);
  });
  document.body.appendChild(el);
}

applyChrome();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { injectToggle(); injectChooser(); });
} else {
  injectToggle(); injectChooser();
}
