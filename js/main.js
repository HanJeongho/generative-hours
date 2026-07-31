// ============================================================================
//  main.js — exhibition controller.
//  Owns view state (atrium · gallery · room), builds the gallery grid,
//  loads/unloads art-piece modules into the single shared stage canvas,
//  drives placard text, controls, navigation, sound, and thumbnails.
// ============================================================================

// the shell is reused by sister exhibitions: <html data-catalog="./data-errors.js">
const { WINGS, WORKS, wingOf } = await import(document.documentElement.dataset.catalog || "./data.js");
import { DETAILS } from "./details.js";
import { isEN } from "./i18n.js"; // 임포트만으로 언어 토글·선택 오버레이·크롬 스왑이 초기화된다

const body = document.body;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  view: "atrium",
  current: null,        // current work `no`
  piece: null,          // mounted Piece instance
  sound: false,
  audio: null,          // simple ambient synth (lazy)
};

// list of works that actually have an engine, for prev/next within "ready" set
const readyWorks = () => WORKS.filter((w) => w.module && !wingOf(w.wing)?.hidden);

// ---------------------------------------------------------------------------
//  View switching
// ---------------------------------------------------------------------------
function setView(v) {
  state.view = v;
  body.dataset.view = v;
  if (v !== "room") unloadPiece();
  if (v === "gallery" || v === "room") buildGalleryOnce();
  window.scrollTo({ top: 0, behavior: v === "gallery" ? "auto" : "smooth" });
}

// ---------------------------------------------------------------------------
//  Top nav (wing anchors)
// ---------------------------------------------------------------------------
function buildNav() {
  const nav = $(".topnav");
  nav.innerHTML = WINGS.filter((w) => !w.hidden).map(
    (w) => `<a href="#wing-${w.id}" data-wing="${w.id}">${w.index} · ${w.name}</a>`
  ).join("");
  $$(".topnav a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.view !== "gallery") setView("gallery");
      requestAnimationFrame(() => {
        const t = $(`#wing-${a.dataset.wing}`);
        t && t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    })
  );
}

// ---------------------------------------------------------------------------
//  Gallery grid (built once)
// ---------------------------------------------------------------------------
let galleryBuilt = false;
function buildGalleryOnce() {
  if (galleryBuilt) return;
  galleryBuilt = true;
  const gal = $("#gallery");

  for (const wing of WINGS) {
    if (wing.hidden) continue;               // vault works reachable by deep-link only
    const works = WORKS.filter((w) => w.wing === wing.id);
    const ready = works.filter((w) => w.module).length;
    const sec = document.createElement("section");
    sec.className = "wing";
    sec.id = `wing-${wing.id}`;
    sec.style.setProperty("--accent", wing.accent);
    sec.innerHTML = `
      <div class="wing__head">
        <span class="wing__index">${wing.index}</span>
        <span class="wing__titles">
          <span class="wing__name">${wing.name}</span>
          <span class="wing__sub">${wing.sub}</span>
        </span>
        <span class="wing__count">${ready} / ${works.length} OPEN</span>
      </div>
      <div class="grid"></div>`;
    const grid = $(".grid", sec);
    for (const work of works) grid.appendChild(makeCard(work, wing));
    gal.appendChild(sec);
  }
}

function makeCard(work, wing) {
  const ready = !!work.module;
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.ready = ready;
  card.dataset.no = work.no;
  card.style.setProperty("--accent", wing.accent);
  card.innerHTML = `
    <div class="card__thumb" aria-hidden="true"></div>
    <div class="card__veil"></div>
    <span class="card__no">${work.no}</span>
    <span class="card__status">${ready ? "Open" : "Soon"}</span>
    <div class="card__body">
      <h3 class="card__title">${work.title}</h3>
      <p class="card__ko">${work.ko}</p>
      <p class="card__medium">${work.medium}</p>
    </div>
    <span class="card__open" aria-hidden="true">→</span>`;
  if (ready) {
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => openRoom(work.no));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRoom(work.no); }
    });
    paintThumbnail(card, work, wing);
  }
  return card;
}

// A lightweight, static thumbnail painted with the wing accent — evocative,
// not a live engine (keeps the grid cheap). Pulled into a real piece on click.
function paintThumbnail(card, work, wing) {
  const host = $(".card__thumb", card);
  const cv = document.createElement("canvas");
  const W = 360, H = 270;
  cv.width = W; cv.height = H;
  host.appendChild(cv);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0c0c10";
  ctx.fillRect(0, 0, W, H);
  thumbPainters[work.no]?.(ctx, W, H, wing.accent);
}

// Distinct generative thumbnail per ready work.
const thumbPainters = {
  "01"(ctx, W, H, a) {                       // flow field streaks
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 260; i++) {
      let x = Math.random() * W, y = Math.random() * H;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 18; s++) {
        const ang = (Math.sin(x * 0.012) + Math.cos(y * 0.012)) * 2.2;
        x += Math.cos(ang) * 4; y += Math.sin(ang) * 4;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = a + "22"; ctx.lineWidth = 1; ctx.stroke();
    }
  },
  "05"(ctx, W, H, a) {                       // reaction-diffusion blobs
    const img = ctx.createImageData(W, H);
    const [r, g, b] = hex(a);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.sin(x * 0.06) * Math.cos(y * 0.05) + Math.sin((x + y) * 0.03);
      const m = (Math.sin(v * 3) * 0.5 + 0.5);
      const i = (y * W + x) * 4;
      img.data[i] = r * m * 0.5 + 10; img.data[i + 1] = g * m * 0.6 + 10;
      img.data[i + 2] = b * m + 14; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  "09"(ctx, W, H, a) {                       // volumetric sphere
    const g = ctx.createRadialGradient(W * 0.42, H * 0.4, 8, W * 0.5, H * 0.5, H * 0.62);
    g.addColorStop(0, a); g.addColorStop(0.4, a + "66"); g.addColorStop(1, "#0c0c10");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.5, 30 + i * 22, 0, Math.PI * 2);
      ctx.strokeStyle = a + "18"; ctx.lineWidth = 2; ctx.stroke();
    }
  },
  "13"(ctx, W, H, a) {                       // mandala symmetry
    ctx.translate(W / 2, H / 2);
    const N = 12;
    for (let k = 0; k < N; k++) {
      ctx.rotate((Math.PI * 2) / N);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const r = 16 + i * 22;
        ctx.lineTo(Math.cos(i) * r, Math.sin(i * 1.4) * r);
      }
      ctx.strokeStyle = a + "55"; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
  "17"(ctx, W, H, a) {                       // strange attractor
    ctx.globalCompositeOperation = "lighter";
    let x = 0.1, y = 0.1;
    const A = -1.7, B = 1.8, C = -0.9, D = -0.4;
    for (let i = 0; i < 9000; i++) {
      const nx = Math.sin(A * y) + C * Math.cos(A * x);
      const ny = Math.sin(B * x) + D * Math.cos(B * y);
      x = nx; y = ny;
      const px = W / 2 + x * (W * 0.22), py = H / 2 + y * (H * 0.22);
      ctx.fillStyle = a + "14";
      ctx.fillRect(px, py, 1, 1);
    }
  },
  "02"(ctx, W, H, a) {                       // murmuration — flock streaks
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const ang = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(ang) * 9, y - Math.sin(ang) * 9);
      ctx.strokeStyle = a + "66"; ctx.lineWidth = 1.4; ctx.lineCap = "round"; ctx.stroke();
    }
  },
  "03"(ctx, W, H, a) {                       // liquid light — metaballs
    ctx.globalCompositeOperation = "lighter";
    const blobs = [[0.35, 0.45, 70], [0.55, 0.55, 60], [0.62, 0.4, 44], [0.45, 0.62, 50]];
    for (const [bx, by, r] of blobs) {
      const g = ctx.createRadialGradient(bx * W, by * H, 2, bx * W, by * H, r);
      g.addColorStop(0, a + "cc"); g.addColorStop(0.5, a + "44"); g.addColorStop(1, "#0000");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  },
  "04"(ctx, W, H, a) {                       // still water — interfering ripples
    ctx.globalCompositeOperation = "lighter";
    for (const [cx, cy] of [[0.35, 0.4], [0.62, 0.58]]) {
      for (let r = 6; r < 120; r += 11) {
        ctx.beginPath(); ctx.arc(cx * W, cy * H, r, 0, Math.PI * 2);
        ctx.strokeStyle = a + "22"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  },
  "06"(ctx, W, H, a) {                       // Lenia — soft gliders
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 14 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, a + "dd"); g.addColorStop(0.6, a + "33"); g.addColorStop(1, "#0000");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  },
  "07"(ctx, W, H, a) {                       // slime — branching veins
    ctx.globalCompositeOperation = "lighter";
    const walk = (x, y, ang, depth) => {
      if (depth <= 0) return;
      const nx = x + Math.cos(ang) * 22, ny = y + Math.sin(ang) * 22;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny);
      ctx.strokeStyle = a + "44"; ctx.lineWidth = depth * 0.5; ctx.stroke();
      walk(nx, ny, ang + (Math.random() - 0.5), depth - 1);
      if (Math.random() < 0.5) walk(nx, ny, ang + (Math.random() - 0.5) * 1.4, depth - 1);
    };
    for (let i = 0; i < 5; i++) walk(W / 2, H / 2, Math.random() * 6.28, 6);
  },
  "08"(ctx, W, H, a) {                       // phototropism — plant
    ctx.globalCompositeOperation = "lighter";
    const grow = (x, y, ang, len, depth) => {
      if (depth <= 0) return;
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny);
      ctx.strokeStyle = a + "55"; ctx.lineWidth = depth * 0.6; ctx.stroke();
      grow(nx, ny, ang - 0.4, len * 0.78, depth - 1);
      grow(nx, ny, ang + 0.4, len * 0.78, depth - 1);
    };
    grow(W / 2, H, -Math.PI / 2, 34, 6);
  },
  "10"(ctx, W, H, a) {                       // lumen — light fan + shadow
    const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 4, W * 0.5, H * 0.42, H * 0.8);
    g.addColorStop(0, a + "cc"); g.addColorStop(0.5, a + "33"); g.addColorStop(1, "#0000");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0a0a0c";
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(W * (0.3 + i * 0.22), H * 0.6);
      ctx.fillRect(-12, -12, 24, 24); ctx.restore();
    }
  },
  "11"(ctx, W, H, a) {                       // cymatics — chladni nodes
    const img = ctx.createImageData(W, H);
    const [r, g, b] = hex(a);
    const n = 5, m = 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const f = Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) -
                Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
      const s = Math.exp(-7 * Math.abs(f));
      const i = (y * W + x) * 4;
      img.data[i] = r * s; img.data[i + 1] = g * s; img.data[i + 2] = b * s; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  "12"(ctx, W, H) {                          // prism — moiré rainbow
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d1 = Math.hypot(x - W * 0.4, y - H * 0.5);
      const d2 = Math.hypot(x - W * 0.6, y - H * 0.5);
      const i = (y * W + x) * 4;
      img.data[i]     = (Math.sin(d1 * 0.18) * Math.sin(d2 * 0.17) * 0.5 + 0.5) * 255;
      img.data[i + 1] = (Math.sin(d1 * 0.19) * Math.sin(d2 * 0.18) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (Math.sin(d1 * 0.20) * Math.sin(d2 * 0.19) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  "14"(ctx, W, H, a) {                       // fracture — stained glass cells
    const pts = Array.from({ length: 14 }, () => [Math.random() * W, Math.random() * H]);
    const [r, g, b] = hex(a);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      let best = 1e9, bi = 0;
      for (let k = 0; k < pts.length; k++) {
        const dx = x - pts[k][0], dy = y - pts[k][1], d = dx * dx + dy * dy;
        if (d < best) { best = d; bi = k; }
      }
      const t = (bi / pts.length);
      const i = (y * W + x) * 4;
      img.data[i] = r * (0.4 + t * 0.6); img.data[i + 1] = g * (0.3 + (1 - t) * 0.5);
      img.data[i + 2] = b * (0.5 + t * 0.5); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  "15"(ctx, W, H, a) {                       // phyllotaxis — golden spiral
    ctx.globalCompositeOperation = "lighter";
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 420; i++) {
      const ang = i * GA, r = 6 * Math.sqrt(i);
      const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
      ctx.beginPath(); ctx.arc(x, y, 1 + i * 0.006, 0, Math.PI * 2);
      ctx.fillStyle = a + "88"; ctx.fill();
    }
  },
  "16"(ctx, W, H, a) {                       // harmonograph — rosette
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (let s = 0; s < 40; s += 0.02) {
      const e = Math.exp(-s * 0.02);
      const x = W / 2 + (Math.sin(2 * s) * 60 + Math.sin(3.01 * s) * 50) * e;
      const y = H / 2 + (Math.sin(3 * s) * 60 + Math.sin(4.02 * s) * 40) * e;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = a + "55"; ctx.lineWidth = 1; ctx.stroke();
  },
  "18"(ctx, W, H, a) {                       // datamosh — matrix digital rain
    ctx.fillStyle = "#000402"; ctx.fillRect(0, 0, W, H);
    const cell = 9;
    const glyphs = "01ｱｲｳｴｵｶ7=*<>".split("");
    ctx.font = `${cell}px "Courier New", monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let c = 0; c * cell < W; c++) {
      const head = (Math.random() * (H / cell)) | 0;
      const len = 4 + (Math.random() * 9 | 0);
      for (let k = 0; k < len; k++) {
        const row = head - k; if (row < 0) continue;
        const f = 1 - k / len;
        ctx.fillStyle = k === 0 ? "rgba(205,255,215,1)"
          : `rgba(0,${(110 + 140 * f) | 0},${((110 + 140 * f) * 0.42) | 0},${f * 0.9 + 0.1})`;
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], c * cell + cell / 2, row * cell + cell / 2);
      }
    }
    // a couple of torn-scanline glitches for the "mosh"
    for (let i = 0; i < 3; i++) {
      const y = (Math.random() * H) | 0;
      ctx.drawImage(ctx.canvas, 0, y, W, 2, (Math.random() - 0.5) * 40, y, W, 2);
    }
  },
  "19"(ctx, W, H, a) {                       // words unbound — falling letters
    ctx.globalCompositeOperation = "lighter";
    ctx.font = "bold 26px serif"; ctx.textAlign = "center";
    const chars = "GENERATIVE";
    for (let i = 0; i < chars.length; i++) {
      const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 40);
      ctx.save(); ctx.translate(x, y); ctx.rotate((Math.random() - 0.5) * 1.4);
      ctx.fillStyle = a + "aa"; ctx.fillText(chars[i], 0, 0); ctx.restore();
    }
  },
  "20"(ctx, W, H, a) {                       // constellation — network
    ctx.globalCompositeOperation = "lighter";
    const nodes = Array.from({ length: 22 }, () => [40 + Math.random() * (W - 80), 30 + Math.random() * (H - 60)]);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]) < 80) {
          ctx.beginPath(); ctx.moveTo(...nodes[i]); ctx.lineTo(...nodes[j]);
          ctx.strokeStyle = a + "33"; ctx.lineWidth = 0.7; ctx.stroke();
        }
      }
    }
    for (const [x, y] of nodes) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fillStyle = a + "dd"; ctx.fill();
    }
  },
  "21"(ctx, W, H, a) {                       // event horizon — black hole + ring
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 200; i++) {          // lensed starfield
      const ang = Math.random() * Math.PI * 2, r = 40 + Math.random() * 160;
      const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r * 0.8;
      ctx.fillStyle = "#cdd6ff" + "55"; ctx.fillRect(x, y, 1.3, 1.3);
    }
    const cx = W / 2, cy = H / 2, Rs = 44;
    const ring = ctx.createRadialGradient(cx, cy, Rs * 0.9, cx, cy, Rs * 1.6);
    ring.addColorStop(0, "#0000"); ring.addColorStop(0.5, a + "cc"); ring.addColorStop(1, "#0000");
    ctx.fillStyle = ring; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath(); ctx.arc(cx, cy, Rs, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill();
  },
  "22"(ctx, W, H, a) {                       // wormhole — tunnel rings
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 26; i++) {
      const z = i / 26;
      const r = (8 + z * z * 180) * (0.7 + 0.3 * Math.sin(i));
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(i * 0.5) * 14 * z, cy, r, r * 0.82, i * 0.3, 0, Math.PI * 2);
      ctx.strokeStyle = a + (i < 13 ? "33" : "55"); ctx.lineWidth = 1 + z * 1.5; ctx.stroke();
    }
    const th = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    th.addColorStop(0, "#eaf0ff"); th.addColorStop(1, "#0000");
    ctx.fillStyle = th; ctx.fillRect(0, 0, W, H);
  },
  "23"(ctx, W, H, a) {                       // orbital dance — orbits + trails
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2, cy = H / 2;
    const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    sun.addColorStop(0, "#fff4d6"); sun.addColorStop(0.5, a + "aa"); sun.addColorStop(1, "#0000");
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    for (const [rad, ry, ph] of [[60, 0.5, 0], [100, 0.7, 1.5], [140, 0.4, 3]]) {
      ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * ry, ph, 0, Math.PI * 2);
      ctx.strokeStyle = a + "33"; ctx.lineWidth = 1; ctx.stroke();
      const px = cx + Math.cos(ph) * rad, py = cy + Math.sin(ph) * rad * ry;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = a + "ee"; ctx.fill();
    }
  },
  "24"(ctx, W, H, a) {                       // hyperspace — warp streaks
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 150; i++) {
      const ang = Math.random() * Math.PI * 2, r0 = 6 + Math.random() * 30, r1 = r0 + 20 + Math.random() * 130;
      const blue = r1 < 90;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.strokeStyle = (blue ? "#bcd0ff" : a) + "66"; ctx.lineWidth = 1.2; ctx.stroke();
    }
    const b = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    b.addColorStop(0, "#eaf0ff"); b.addColorStop(1, "#0000");
    ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
  },
  "25"(ctx, W, H, a) {                       // telekinesis — hand pushing particles
    ctx.globalCompositeOperation = "lighter";
    const hx = W * 0.66, hy = H * 0.5;       // "hand" center
    for (let i = 0; i < 320; i++) {
      let x = Math.random() * W, y = Math.random() * H;
      const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy) + 1;
      if (d < 130) { x = hx + (dx / d) * 130; y = hy + (dy / d) * 130; }  // pushed out
      ctx.fillStyle = a + "66"; ctx.fillRect(x, y, 1.6, 1.6);
    }
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 50);
    g.addColorStop(0, a + "cc"); g.addColorStop(1, a + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 50, 0, Math.PI * 2); ctx.fill();
  },
  "26"(ctx, W, H, a) {                       // hundred eyes — grid of eyes looking
    const gx = W * 0.7, gy = H * 0.35;       // gaze target
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = (c + 0.5) * W / 6, y = (r + 0.5) * H / 4;
      ctx.beginPath(); ctx.ellipse(x, y, 20, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#0c1418"; ctx.fill();
      ctx.strokeStyle = a + "55"; ctx.lineWidth = 1; ctx.stroke();
      const ang = Math.atan2(gy - y, gx - x);
      const px = x + Math.cos(ang) * 7, py = y + Math.sin(ang) * 4;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fillStyle = a; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fillStyle = "#04060a"; ctx.fill();
    }
  },
  "27"(ctx, W, H, a) {                       // precognition — floating holo panels + pinch
    ctx.globalCompositeOperation = "lighter";
    const panels = [
      [W * 0.30, H * 0.36, 78, 52, -0.1],
      [W * 0.62, H * 0.52, 96, 60, 0.12],
      [W * 0.44, H * 0.68, 66, 44, 0.04],
    ];
    for (const [x, y, pw, ph, ang] of panels) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = a + "14"; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.strokeStyle = a + "66"; ctx.lineWidth = 1; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.strokeStyle = a + "22"; ctx.lineWidth = 1;
      for (let yy = -ph / 2 + 5; yy < ph / 2; yy += 6) { ctx.beginPath(); ctx.moveTo(-pw / 2 + 3, yy); ctx.lineTo(pw / 2 - 3, yy); ctx.stroke(); }
      ctx.strokeStyle = a + "dd"; ctx.lineWidth = 2; const e = 9;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cxp = sx * pw / 2, cyp = sy * ph / 2;
        ctx.beginPath(); ctx.moveTo(cxp, cyp - sy * e); ctx.lineTo(cxp, cyp); ctx.lineTo(cxp - sx * e, cyp); ctx.stroke();
      }
      ctx.restore();
    }
    // a pinching hand cursor (reticle + hot core)
    const hx = W * 0.70, hy = H * 0.32;
    ctx.strokeStyle = a + "cc"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 12);
    g.addColorStop(0, a + "ff"); g.addColorStop(1, a + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, Math.PI * 2); ctx.fill();
  },
  "28"(ctx, W, H, a) {                       // living mirror — swept ink
    ctx.globalCompositeOperation = "lighter";
    for (let s = 0; s < 5; s++) {
      let x = W * (0.2 + Math.random() * 0.6), y = H * (0.2 + Math.random() * 0.6);
      let ang = Math.random() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < 24; i++) {
        ang += (Math.random() - 0.5) * 0.8;
        x += Math.cos(ang) * 10; y += Math.sin(ang) * 10;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = a + "33"; ctx.lineWidth = 3 + Math.random() * 4; ctx.lineCap = "round"; ctx.stroke();
    }
  },
  "29"(ctx, W, H, a) {                       // entropy — text dissolving into dust
    ctx.globalCompositeOperation = "lighter";
    ctx.font = "bold 90px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // sample the glyph "A" into ordered (left) → scattered (right) particles
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const o = off.getContext("2d");
    o.font = "bold 120px Inter, sans-serif"; o.textAlign = "center"; o.textBaseline = "middle";
    o.fillStyle = "#fff"; o.fillText("字", W / 2, H / 2);
    const d = o.getImageData(0, 0, W, H).data;
    for (let i = 0; i < 1400; i++) {
      const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0;
      if (d[(y * W + x) * 4 + 3] > 100) {
        const dis = (x / W);                 // right side more scattered
        const jx = x + (Math.random() - 0.5) * dis * 120;
        const jy = y + (Math.random() - 0.5) * dis * 120;
        const ord = 1 - dis;
        ctx.fillStyle = ord > 0.5 ? a + "cc" : "#8a8a8a66";
        ctx.fillRect(jx, jy, 1.6, 1.6);
      }
    }
  },
  "30"(ctx, W, H, a) {                       // babel — glyphs across scripts
    ctx.globalCompositeOperation = "lighter";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const glyphs = ["A", "가", "Ω", "ᚠ", "Д", "愛"];
    const fonts = ["bold 46px serif", "bold 46px monospace", "bold 46px sans-serif"];
    for (let i = 0; i < glyphs.length; i++) {
      const x = (i + 0.5) * W / glyphs.length;
      const tuned = Math.abs(x - W / 2) < W * 0.12;
      ctx.font = fonts[i % 3];
      ctx.fillStyle = tuned ? a : a + "44";
      const jy = tuned ? 0 : (Math.random() - 0.5) * 8;
      ctx.fillText(glyphs[i], x, H / 2 + jy);
    }
    // dial indicator
    ctx.fillStyle = a + "88"; ctx.fillRect(W / 2 - 1, H - 18, 2, 12);
  },
  "31"(ctx, W, H, a) {                       // ensō — single brush circle
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.3;
    ctx.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const ang = -0.3 + (i / 60) * Math.PI * 1.9;     // not quite closed
      const w = 14 * Math.sin((i / 60) * Math.PI) + 3; // thick middle, thin ends
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      ctx.beginPath(); ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      ctx.fillStyle = a + "55"; ctx.fill();
    }
  },
  "32"(ctx, W, H, a) {                       // logogram — deformed glyph
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.transform(1.6, 0, -0.4, 0.9, 0, 0);            // stretched + sheared (clay)
    ctx.font = "bold 150px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let k = 0; k < 5; k++) {                       // weight via repeated stamps
      ctx.fillStyle = a + (k === 0 ? "cc" : "22");
      ctx.fillText("母", k * 1.2, 0);
    }
    ctx.restore();
    // hand grip dots
    ctx.fillStyle = a + "aa";
    ctx.beginPath(); ctx.arc(W * 0.2, H * 0.6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.4, 4, 0, Math.PI * 2); ctx.fill();
  },
  "33"(ctx, W, H, a) {                       // fireflies — synchronised blinking
    // night meadow
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#05070d"); sky.addColorStop(1, "#0a1410");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // a field of fireflies; most are bright (in-sync moment), a few dim
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 12.9) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 7.7) * 0.5 + 0.5) * H;
      // cluster brightness so it reads as a synchronised pulse, with stragglers
      const b = (i % 7 === 0) ? 0.15 : 0.7 + 0.3 * Math.sin(i);
      const s = 4 + b * 16;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, s);
      gg.addColorStop(0, a + "ee"); gg.addColorStop(0.3, a + "66"); gg.addColorStop(1, a + "00");
      ctx.globalAlpha = b;
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, 0.4 + b);
      ctx.fillStyle = "#fffbe0"; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
  "34"(ctx, W, H, a) {                       // ant trails — pheromone roads
    ctx.fillStyle = "#0a0805"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const nest = [W * 0.2, H * 0.7], foods = [[W * 0.8, H * 0.3], [W * 0.7, H * 0.8]];
    for (const fd of foods) {                  // glowing roads nest↔food
      for (let s = 0; s <= 1.001; s += 0.02) {
        const x = nest[0] + (fd[0] - nest[0]) * s + Math.sin(s * 6) * 14;
        const y = nest[1] + (fd[1] - nest[1]) * s + Math.cos(s * 5) * 12;
        const r = 5 * (1 - Math.abs(s - 0.5));
        const gd = ctx.createRadialGradient(x, y, 0, x, y, r + 4);
        gd.addColorStop(0, a + "aa"); gd.addColorStop(1, a + "00");
        ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#9be39a"; ctx.beginPath(); ctx.arc(fd[0], fd[1], 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#caa46a"; ctx.beginPath(); ctx.arc(nest[0], nest[1], 9, 0, Math.PI * 2); ctx.fill();
  },
  "35"(ctx, W, H, a) {                       // herding — sheep + pen + dog
    ctx.fillStyle = "#0b1108"; ctx.fillRect(0, 0, W, H);
    // pen (lower-right)
    ctx.strokeStyle = a + "cc"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(W * 0.62, H * 0.62, W * 0.3, H * 0.3); ctx.setLineDash([]);
    for (let i = 0; i < 40; i++) {             // fluffy sheep, some penned
      const penned = i < 16;
      const x = penned ? W * (0.66 + Math.random() * 0.22) : W * (0.1 + Math.random() * 0.4);
      const y = penned ? H * (0.66 + Math.random() * 0.22) : H * (0.2 + Math.random() * 0.6);
      ctx.fillStyle = "#f3efe6";
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (k - 1) * 2.5, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    // shepherd dog (cursor)
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.3, 5, 0, Math.PI * 2); ctx.fill();
  },
  "36"(ctx, W, H, a) {                       // little pilgrims — terrain + walkers
    ctx.fillStyle = "#0a0c10"; ctx.fillRect(0, 0, W, H);
    // terrain heightline
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) { const y = H * 0.55 + Math.sin(x * 0.02) * 28 + Math.sin(x * 0.06) * 12; ctx.lineTo(x, y); }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = a + "55"; ctx.fill();
    ctx.strokeStyle = a; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = H * 0.55 + Math.sin(x * 0.02) * 28 + Math.sin(x * 0.06) * 12; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    // walkers on the ground
    for (let i = 0; i < 14; i++) {
      const x = 30 + i * (W - 60) / 14; const y = H * 0.55 + Math.sin(x * 0.02) * 28 + Math.sin(x * 0.06) * 12 - 5;
      ctx.fillStyle = "#ffe9c0"; ctx.fillRect(x - 2, y - 6, 4, 6);
      ctx.beginPath(); ctx.arc(x, y - 7, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // goal door
    ctx.fillStyle = a; ctx.fillRect(W - 22, H * 0.55 + Math.sin(W * 0.02) * 28 - 24, 10, 24);
  },
  "37"(ctx, W, H, a) {                       // great wave — Hokusai
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#e9e3d2"); sky.addColorStop(1, "#cdd6dd");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Fuji
    ctx.fillStyle = "#3a4a63"; ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.5); ctx.lineTo(W * 0.62, H * 0.72); ctx.lineTo(W * 0.38, H * 0.72); ctx.closePath(); ctx.fill();
    // big curling wave
    ctx.fillStyle = "#1b3a6b"; ctx.beginPath();
    ctx.moveTo(0, H); ctx.quadraticCurveTo(W * 0.1, H * 0.4, W * 0.4, H * 0.35);
    ctx.quadraticCurveTo(W * 0.62, H * 0.32, W * 0.55, H * 0.55);
    ctx.quadraticCurveTo(W * 0.5, H * 0.7, W * 0.3, H * 0.62);
    ctx.quadraticCurveTo(W * 0.5, H, 0, H); ctx.closePath(); ctx.fill();
    // foam crest dots
    ctx.fillStyle = "#f4f6f8"; for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.arc(W * (0.3 + Math.random() * 0.3), H * (0.3 + Math.random() * 0.15), 2 + Math.random() * 2, 0, Math.PI * 2); ctx.fill(); }
  },
  "38"(ctx, W, H, a) {                       // starry night — Van Gogh
    ctx.fillStyle = "#0c1330"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // swirl strokes
    for (let i = 0; i < 90; i++) {
      const cx = W * 0.55, cy = H * 0.4, ang = i * 0.4, rr = 8 + i * 1.1;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.7;
      ctx.strokeStyle = "#3f6fc0" + "88"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang + 1.5) * 6, y + Math.sin(ang + 1.5) * 6); ctx.stroke();
    }
    // stars + moon
    for (const [sx, sy, r] of [[W * 0.8, H * 0.25, 9], [W * 0.3, H * 0.3, 6], [W * 0.85, H * 0.6, 5]]) {
      const gd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2); gd.addColorStop(0, "#ffe07a"); gd.addColorStop(1, "#ffe07a00");
      ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(sx, sy, r * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a1f18"; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W * 0.12, H * 0.3); ctx.lineTo(W * 0.2, H); ctx.fill(); // cypress
  },
  "39"(ctx, W, H, a) {                       // the scream — Munch
    // wavy sky bands
    const bands = [["#e8881f", 0], ["#c83a1c", 0.18], ["#e8a83a", 0.34], ["#264a63", 0.52], ["#16314a", 0.72]];
    for (let bi = 0; bi < bands.length; bi++) {
      const [col, y0] = bands[bi]; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, H * y0);
      for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * y0 + Math.sin(x * 0.03 + bi) * 10);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    }
    // boardwalk
    ctx.strokeStyle = "#3a2418"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, H * 0.6); ctx.lineTo(W * 0.4, H); ctx.stroke();
    // screaming figure
    ctx.fillStyle = "#1c1410"; ctx.beginPath(); ctx.ellipse(W * 0.32, H * 0.6, 12, 26, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#caa98a"; ctx.beginPath(); ctx.ellipse(W * 0.32, H * 0.5, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1c1410"; ctx.beginPath(); ctx.ellipse(W * 0.32, H * 0.54, 3, 6, 0, 0, Math.PI * 2); ctx.fill(); // mouth
  },
  "40"(ctx, W, H, a) {                       // pointillism — Seurat dots
    ctx.fillStyle = "#efe7d4"; ctx.fillRect(0, 0, W, H);
    const cols = ["#3f7a3a", "#6fae57", "#c8b46a", "#4a78b0", "#d08a55", "#e8d27a"];
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      // weight color by region: lower green, mid river-blue, parasol cream blob
      let c; const ny = y / H;
      if (Math.hypot(x - W * 0.62, y - H * 0.45) < 28) c = "#e8d8b0";
      else if (ny > 0.55) c = Math.random() < 0.5 ? "#3f7a3a" : "#6fae57";
      else if (ny > 0.45 && ny < 0.55) c = "#4a78b0";
      else c = cols[(Math.random() * cols.length) | 0];
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill();
    }
  },
  "41"(ctx, W, H, a) {                       // mondrian — neoplastic grid
    ctx.fillStyle = "#f4f1e8"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d92b2b"; ctx.fillRect(W * 0.55, 0, W * 0.45, H * 0.55);   // red
    ctx.fillStyle = "#f3c61e"; ctx.fillRect(0, H * 0.7, W * 0.3, H * 0.3);      // yellow
    ctx.fillStyle = "#1f4fb0"; ctx.fillRect(W * 0.55, H * 0.8, W * 0.2, H * 0.2); // blue
    ctx.fillStyle = "#111"; ctx.fillRect(0, H * 0.55, W, 7);
    ctx.fillRect(W * 0.55 - 4, 0, 7, H); ctx.fillRect(W * 0.3 - 4, H * 0.55, 7, H);
    ctx.fillRect(0, H * 0.7 - 4, W * 0.55, 7); ctx.fillRect(W * 0.55, H * 0.8 - 4, W, 7);
  },
  "42"(ctx, W, H, a) {                       // klimt — gold mosaic
    ctx.fillStyle = "#1a1206"; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) {       // gold tiles
      const sh = 0.5 + 0.5 * Math.sin(x * 0.1 + y * 0.07);
      const gd = ctx.createLinearGradient(x, y, x + 14, y + 14);
      gd.addColorStop(0, `rgba(${180 + sh * 60 | 0},${140 + sh * 70 | 0},${40 + sh * 40 | 0},1)`);
      gd.addColorStop(1, "#6b4e16");
      ctx.fillStyle = gd; ctx.fillRect(x + 1, y + 1, 13, 13);
    }
    // spirals + ovals (ornaments)
    ctx.strokeStyle = "#1a1206"; ctx.lineWidth = 2;
    for (const [cx, cy] of [[W * 0.32, H * 0.4], [W * 0.7, H * 0.6]]) {
      ctx.beginPath(); for (let th = 0; th < 18; th += 0.3) { const r = th * 1.6; ctx.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); } ctx.stroke();
    }
  },
  "45"(ctx, W, H, a) {                       // sand mandala — sectors of coloured sand
    ctx.fillStyle = "#141216"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.52, R = Math.min(W, H) * 0.42, r0 = R * 0.34;
    const cols = ["#d98e2b", "#b4482b", "#e8d5a8", "#3f6b5e"];
    ctx.strokeStyle = "rgba(210,200,185,0.10)"; ctx.lineWidth = 1;
    for (const rr of [r0, R * 0.6, R * 0.82, R]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
    // ~38 of 60 sectors filled with sand speckles
    for (let m = 0; m < 38; m++) {
      const a0 = -Math.PI / 2 + (m / 60) * Math.PI * 2;
      for (let i = 0; i < 60; i++) {
        const u = Math.random(), band = u < 0.4 ? 0 : u < 0.7 ? 1 : 2;
        const rr = r0 + (band * 0.3 + Math.random() * 0.26) * (R - r0);
        const an = a0 + Math.random() * 0.1;
        ctx.fillStyle = cols[(band + m) % cols.length];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, 1.4, 1.4);
      }
    }
    ctx.globalAlpha = 1;
    // lotus core
    for (let i = 0; i < 260; i++) {
      const an = Math.random() * Math.PI * 2;
      const pet = Math.abs(Math.cos(an * 4));
      const rr = Math.random() * r0 * 0.5 * (0.35 + 0.65 * pet);
      ctx.fillStyle = cols[i % 2 ? 2 : 0];
      ctx.fillRect(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, 1.3, 1.3);
    }
  },
  "55"(ctx, W, H, a) {                       // afterimage — inverted heart + fixation dot
    ctx.fillStyle = "#101014"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.46, s = H * 0.3;
    ctx.fillStyle = "#19d84f";
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
    ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.arc(cx, cy, 11, -Math.PI / 2, Math.PI * 0.8); ctx.stroke();
  },
  "58"(ctx, W, H, a) {                       // hering — rays + straight rails
    ctx.fillStyle = "#f5f5f2"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, RR = Math.hypot(W, H);
    ctx.strokeStyle = "rgba(38,38,43,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const an = (i / 26) * Math.PI * 2;
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * RR, cy + Math.sin(an) * RR);
    }
    ctx.stroke();
    ctx.strokeStyle = "#d43b2f"; ctx.lineWidth = 4; ctx.lineCap = "round";
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sd * W * 0.2, H * 0.08); ctx.lineTo(cx + sd * W * 0.2, H * 0.92);
      ctx.stroke();
    }
  },
  "59"(ctx, W, H, a) {                       // waterfall — streaks + fixation
    ctx.fillStyle = "#0c141d"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      const x = (i * 13 % W), y = (i * 53 % H), len = 10 + (i % 4) * 8;
      ctx.strokeStyle = i % 7 === 0 ? "rgba(210,235,255,0.5)" : "rgba(120,170,210,0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    }
    ctx.fillStyle = "#ffd24f";
    ctx.beginPath(); ctx.arc(W / 2, H * 0.46, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.arc(W / 2, H * 0.46, 10, -Math.PI / 2, Math.PI); ctx.stroke();
  },
  "60"(ctx, W, H, a) {                       // ebbinghaus — context circles
    ctx.fillStyle = "#f2f3f5"; ctx.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.09;
    const L = [W * 0.32, H * 0.5], Rt = [W * 0.68, H * 0.5];
    ctx.fillStyle = "#a9adb6";
    for (let i = 0; i < 6; i++) {
      const an = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(L[0] + Math.cos(an) * R * 3.4, L[1] + Math.sin(an) * R * 3.4, R * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const an = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Rt[0] + Math.cos(an) * R * 1.7, Rt[1] + Math.sin(an) * R * 1.7, R * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ff7a2f";
    for (const p of [L, Rt]) { ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, Math.PI * 2); ctx.fill(); }
  },
  "61"(ctx, W, H, a) {                       // lilac chaser — blob ring + cross
    ctx.fillStyle = "#9b9b9f"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, ring = Math.min(W, H) * 0.32, br = Math.min(W, H) * 0.085;
    for (let i = 0; i < 12; i++) {
      if (i === 2) continue;                 // the running gap
      const an = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(an) * ring, y = cy + Math.sin(an) * ring;
      const g = ctx.createRadialGradient(x, y, 0, x, y, br);
      g.addColorStop(0, "rgba(220,130,255,0.9)"); g.addColorStop(1, "rgba(220,130,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#2b2b30"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
    ctx.stroke();
  },
  "62"(ctx, W, H, a) {                       // stepping feet — stripes + two bars
    const st = W * 0.045;
    for (let x = 0, i = 0; x < W + st; x += st, i++) {
      ctx.fillStyle = i % 2 ? "#f5f5f2" : "#0a0a0c";
      ctx.fillRect(x, 0, st, H);
    }
    ctx.fillStyle = "#16307e"; ctx.fillRect(W * 0.30, H * 0.36, st * 4, st * 1.6);
    ctx.fillStyle = "#f4d33a"; ctx.fillRect(W * 0.30 + st, H * 0.56, st * 4, st * 1.6);
  },
  "63"(ctx, W, H, a) {                       // scintillating grid
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, W, H);
    const cell = W / 6, lw = cell * 0.2;
    ctx.fillStyle = "#6f7278";
    for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - lw / 2, 0, lw, H);
    for (let y = cell / 2; y < H; y += cell) ctx.fillRect(0, y - lw / 2, W, lw);
    for (let x = cell / 2; x < W; x += cell)
      for (let y = cell / 2; y < H; y += cell) {
        ctx.fillStyle = (x === cell / 2 + cell * 2 && y === cell / 2 + cell) ? "#111" : "#fff";
        ctx.beginPath(); ctx.arc(x, y, lw * 0.6, 0, Math.PI * 2); ctx.fill();
      }
  },
  "64"(ctx, W, H, a) {                       // müller-lyer — two shafts, fins out vs in
    ctx.fillStyle = "#101318"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, len = W * 0.5, f = W * 0.06;
    ctx.lineCap = "round"; ctx.lineWidth = 3;
    for (const [y, dir, col] of [[H * 0.36, 1, "#e8ecf4"], [H * 0.62, -1, a]]) {
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(cx - len / 2, y); ctx.lineTo(cx + len / 2, y); ctx.stroke();
      for (const [x, s] of [[cx - len / 2, -1], [cx + len / 2, 1]])
        for (const vy of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + s * dir * f, y + vy * f); ctx.stroke();
        }
    }
  },
  "65"(ctx, W, H, a) {                       // shepard tables
    ctx.fillStyle = "#12100e"; ctx.fillRect(0, 0, W, H);
    const top = (x, y, rot, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-W * 0.055, -H * 0.23); ctx.lineTo(W * 0.055, -H * 0.17);
      ctx.lineTo(W * 0.055, H * 0.23); ctx.lineTo(-W * 0.055, H * 0.17);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    ctx.strokeStyle = "#6b4a2f"; ctx.lineWidth = 3;
    for (const lx of [W * 0.24, W * 0.36]) { ctx.beginPath(); ctx.moveTo(lx, H * 0.62); ctx.lineTo(lx, H * 0.82); ctx.stroke(); }
    for (const lx of [W * 0.6, W * 0.82]) { ctx.beginPath(); ctx.moveTo(lx, H * 0.6); ctx.lineTo(lx, H * 0.78); ctx.stroke(); }
    top(W * 0.3, H * 0.42, 0, "#b98a56");
    top(W * 0.71, H * 0.44, Math.PI / 2, "#4fa3d8");
  },
  "66"(ctx, W, H, a) {                       // café wall
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
    const ts = W * 0.12, mth = Math.max(2, ts * 0.08), rowH = ts + mth;
    for (let r = 0; r * rowH < H + rowH; r++) {
      const off = (r % 2) * ts * 0.5;
      for (let x = -ts * 2 + off; x < W + ts; x += ts * 2) {
        ctx.fillStyle = "#0d0d10"; ctx.fillRect(x, r * rowH, ts, ts);
        ctx.fillStyle = "#f2f2ee"; ctx.fillRect(x + ts, r * rowH, ts, ts);
      }
    }
    ctx.strokeStyle = a; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(0, rowH * 2 - mth / 2); ctx.lineTo(W, rowH * 2 - mth / 2); ctx.stroke();
    ctx.setLineDash([]);
  },
"73"(ctx, W, H, a) {
    ctx.fillStyle = "#0b0c10"; ctx.fillRect(0, 0, W, H);
    const ax = W * 0.26, ay = H * 0.46, bx = W * 0.76, by = H * 0.54;
    const bg = ctx.createRadialGradient(ax, ay, 0, ax, ay, W * 0.6);
    bg.addColorStop(0, "rgba(40,52,84,0.16)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 60; i++) {                       // 기다림 성운
      const r = Math.sqrt(Math.random()) * H * 0.22, an = Math.random() * 6.283;
      const x = ax + Math.cos(an) * r, y = ay + Math.sin(an) * r * 0.55 - i * 0.4;
      const rr = 12 + Math.random() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, "rgba(168,186,224,0.30)"); g.addColorStop(1, "rgba(120,140,190,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    const gr = ctx.createLinearGradient(ax, ay, bx, by);  // 빛의 실 = 약속
    gr.addColorStop(0, "rgba(150,180,235,0.85)"); gr.addColorStop(1, "rgba(255,190,140,0.85)");
    ctx.strokeStyle = gr; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const glow = (x, y, rr, c) => {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, c); g.addColorStop(1, c.replace(/[\d.]+\)$/, "0)"));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283); ctx.fill(); ctx.restore();
    };
    glow(ax, ay, 22, "rgba(168,190,235,0.6)");           // 기다림 끝
    glow(bx, by, 16, "rgba(255,190,140,0.7)");           // 늦음 끝
    const q = 0.34;                                       // 건너오는 상대 + 스트릭
    const rx = bx + (ax - bx) * q, ry = by + (ay - by) * q - H * 0.14 * Math.sin(q * 3.14);
    ctx.strokeStyle = "rgba(210,224,255,0.4)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx + 26, ry + 8); ctx.lineTo(rx, ry); ctx.stroke();
    glow(rx, ry, 11, "rgba(220,232,255,0.9)");
    ctx.fillStyle = "rgba(210,220,240,0.7)";
    ctx.font = "600 13px ui-monospace, monospace"; ctx.textAlign = "right";
    ctx.fillText("05:00", W - 12, 20);
  },
  "74"(ctx, W, H, a) {                       // one more time — iridescent bubbles rising at dusk
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#06080f"); sky.addColorStop(0.55, "#0a0f20"); sky.addColorStop(1, "#12182e");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const dusk = ctx.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H * 0.9);
    dusk.addColorStop(0, "rgba(150,86,96,0.18)"); dusk.addColorStop(1, "rgba(150,86,96,0)");
    ctx.fillStyle = dusk; ctx.fillRect(0, 0, W, H);
    const bubbles = [[W * 0.30, H * 0.70, 22], [W * 0.46, H * 0.52, 15], [W * 0.63, H * 0.62, 27], [W * 0.55, H * 0.36, 12], [W * 0.73, H * 0.42, 18], [W * 0.38, H * 0.46, 9]];
    const stops = ["rgba(90,225,220,0.6)", "rgba(232,120,222,0.6)", "rgba(242,208,120,0.6)", "rgba(120,182,242,0.6)"];
    for (const [x, y, r] of bubbles) {
      ctx.globalCompositeOperation = "lighter";
      const hg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
      hg.addColorStop(0, "rgba(150,200,235,0.13)"); hg.addColorStop(1, "rgba(150,200,235,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(205,222,255,0.10)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.4, r * 0.14);
      for (let s = 0; s < 4; s++) { ctx.strokeStyle = stops[s]; ctx.beginPath(); ctx.arc(x, y, r - 1, s / 4 * Math.PI * 2, (s + 1) / 4 * Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.38, Math.max(1, r * 0.13), 0, Math.PI * 2); ctx.fill();
    }
    // the just-popped bubble — the ordinary last one — scattering into fine droplets
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2, rr = 8 + Math.random() * 22; ctx.fillStyle = "rgba(200,228,248,0.7)"; ctx.beginPath(); ctx.arc(W * 0.5 + Math.cos(an) * rr, H * 0.2 + Math.sin(an) * rr * 0.8, 1.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
  },
  "76"(ctx, W, H, a) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#070b1e"); sky.addColorStop(0.8, "#141a3a"); sky.addColorStop(1, "#1c1330");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 20; i++) {
      const x = (i * 97.13) % W, y = (i * 53.7) % (H * 0.6);
      ctx.fillStyle = "rgba(220,230,255,0.5)";
      ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    const cx = W * 0.62, cy = H * 0.36;
    for (let k = 0; k < 40; k++) {
      const ang = (k / 40) * Math.PI * 2, rr = W * 0.19 * (0.7 + 0.3 * ((k * 7) % 5) / 4);
      const hue = (k * 9 + a * 40) % 360;
      ctx.strokeStyle = "hsla(" + hue + ",90%,70%,0.85)"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); ctx.stroke();
    }
    const px = W * 0.3, py = H * 0.84;
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      ctx.fillStyle = "hsla(42,95%,70%," + (1 - t) + ")";
      ctx.beginPath();
      ctx.arc(px + Math.sin(k * 1.7) * 13 * t, py - t * H * 0.42, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "77"(ctx, W, H, a) {                       // body bounce — beach balls off a glowing stick-figure
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#ffd9a0"); sky.addColorStop(0.5, "#ffb3c7"); sky.addColorStop(1, "#a6d9ff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(120,200,150,0.3)"; ctx.fillRect(0, H - H * 0.08, W, H * 0.08);
    const balls = [[W * 0.32, H * 0.30, W * 0.11, 200], [W * 0.71, H * 0.24, W * 0.085, 40], [W * 0.60, H * 0.58, W * 0.10, 330]];
    for (const [x, y, r, hue] of balls) {
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, i / 6 * Math.PI * 2, (i + 1) / 6 * Math.PI * 2); ctx.closePath();
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.94)" : `hsl(${(hue + i * 24) % 360} 85% 60%)`; ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    const cx = W * 0.5, sy = H * 0.64, sw = W * 0.12, hr = W * 0.05;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const arms = () => { ctx.beginPath();
      ctx.moveTo(cx - sw, sy); ctx.lineTo(cx + sw, sy);
      ctx.moveTo(cx - sw, sy); ctx.lineTo(cx - sw * 1.5, sy - H * 0.14); ctx.lineTo(cx - sw * 1.05, sy - H * 0.30);
      ctx.moveTo(cx + sw, sy); ctx.lineTo(cx + sw * 1.5, sy - H * 0.14); ctx.lineTo(cx + sw * 1.05, sy - H * 0.30);
      ctx.stroke(); };
    ctx.strokeStyle = "rgba(109,229,185,0.35)"; ctx.lineWidth = W * 0.05; arms();
    ctx.strokeStyle = "rgba(224,255,240,0.9)"; ctx.lineWidth = W * 0.016; arms();
    ctx.lineWidth = W * 0.014; ctx.beginPath(); ctx.arc(cx, sy - hr * 1.9, hr, 0, Math.PI * 2); ctx.stroke();
  },
  "78"(ctx, W, H, a) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#6f5230"); g.addColorStop(0.42, "#c39c60"); g.addColorStop(1, "#ead0a2");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cx = W * 0.5, cy = H * 0.99;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.9);
  cg.addColorStop(0, "rgba(255,190,110,0.30)"); cg.addColorStop(0.5, "rgba(255,160,90,0.08)"); cg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W * 0.5, H * 0.52); ctx.scale(1.15, 1.15);
  ctx.strokeStyle = "rgba(34,20,10,0.85)"; ctx.fillStyle = "rgba(34,20,10,0.85)";
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = H * 0.055;
  const fingers = [[-0.9, -1.1], [-0.4, -1.5], [0.1, -1.55], [0.55, -1.35], [0.95, -0.85]];
  for (const f of fingers) { ctx.beginPath(); ctx.moveTo(0, H * 0.12); ctx.lineTo(f[0] * H * 0.16, f[1] * H * 0.16); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, H * 0.12, H * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = "lighter";
  const dots = [[0.3, 0.28], [0.72, 0.4], [0.2, 0.62], [0.82, 0.66]];
  for (const d of dots) {
    const fx = d[0] * W, fy = d[1] * H, r = H * 0.05;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    fg.addColorStop(0, "rgba(255,228,152,0.9)"); fg.addColorStop(0.4, "rgba(255,182,92,0.5)"); fg.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
},
  "79"(ctx, W, H, a) {
    ctx.fillStyle = "#0b0b18"; ctx.fillRect(0, 0, W, H);
    const hues = [344, 42, 190, 268];
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let s = 0; s < 4; s++) {
      const hue = hues[s], x0 = W * (0.18 + 0.2 * s), y0 = H * 0.82;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? `hsla(${hue},90%,62%,0.12)` : `hsla(${hue},95%,72%,0.6)`;
        ctx.lineWidth = pass === 0 ? 12 : 3.2;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const f = i / 24;
          const x = x0 + Math.sin(f * 6 + s + a * 0.5) * W * 0.12 + f * W * 0.04;
          const y = y0 - f * H * 0.62;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    for (let k = 0; k < 22; k++) {
      const hue = hues[k % 4];
      const x = (Math.sin(k * 12.9 + a) * 0.5 + 0.5) * W;
      const y = (Math.cos(k * 7.7) * 0.5 + 0.5) * H;
      ctx.fillStyle = `hsla(${hue},95%,82%,0.7)`;
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "80"(ctx, W, H, a) {
  const g = ctx;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0b1230"); sky.addColorStop(1, "#26264e");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 46; i++) {
    const x = (i * 97.3) % W, y = (i * 53.7 + a * 40) % H;
    g.beginPath(); g.arc(x, y, (i % 3) * 0.8 + 1, 0, 6.283); g.fill();
  }
  g.fillStyle = "rgba(224,236,255,0.95)";
  g.beginPath(); g.moveTo(0, H);
  for (let i = 0; i <= 10; i++) g.lineTo(i * W / 10, H - H * 0.12 - Math.sin(i * 1.3) * H * 0.02);
  g.lineTo(W, H); g.closePath(); g.fill();
  const cx = W * 0.5, cy = H * 0.56;
  const fg = [[-0.22, 0.08], [-0.1, -0.28], [0.02, -0.34], [0.14, -0.3], [0.24, -0.16]];
  g.lineCap = "round";
  for (const [dx, dy] of fg) {
    g.strokeStyle = "rgba(150,200,255,0.5)"; g.lineWidth = 9;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * W * 0.5, cy + dy * H); g.stroke();
    g.strokeStyle = "#ffffff"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx + dx * W * 0.18, cy + dy * H * 0.3); g.lineTo(cx + dx * W * 0.5, cy + dy * H); g.stroke();
  }
  g.fillStyle = "rgba(150,200,255,0.32)";
  g.beginPath(); g.arc(cx, cy, W * 0.06, 0, 6.283); g.fill();
},
  "90"(ctx, W, H, a) {                       // 풍선 불기 — 파스텔 풍선 다발
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#12203c"); sky.addColorStop(0.6, "#22345c"); sky.addColorStop(1, "#3a4a78");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (const [cx, cy, r] of [[W * 0.2, H * 0.75, 16], [W * 0.8, H * 0.68, 20]]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.arc(cx + r, cy + 4, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    const cols = ["#f5a8c0", "#ffd98a", "#9fd8ff", "#c5a8f5", "#a8f0c8"];
    const pos = [[0.24, 0.30, 22], [0.42, 0.20, 26], [0.60, 0.32, 20], [0.76, 0.22, 24], [0.5, 0.46, 15]];
    pos.forEach(([fx, fy, r], i) => {
      const x = fx * W, y = fy * H;
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + r); ctx.quadraticCurveTo(x + 6, y + r + 18, x - 4, y + r + 34); ctx.stroke();
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.22, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "rgba(255,226,130,0.95)";
    for (let i = 0; i < 5; i++) {
      const an = -Math.PI / 2 + (i * Math.PI * 2) / 5, x = W * 0.5 + Math.cos(an) * 9, y = H * 0.72 + Math.sin(an) * 9;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  },
  "91"(ctx, W, H, a) {                       // 리본 체조 — 장미빛·물빛 리본
    ctx.fillStyle = "#0b0a14"; ctx.fillRect(0, 0, W, H);
    const spot = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, H * 0.75);
    spot.addColorStop(0, "rgba(255,240,220,0.14)"); spot.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const ribbon = (pts, col) => {
      for (const [w2, al] of [[10, 0.18], [4, 0.7]]) {
        ctx.strokeStyle = col.replace("AL", String(al)); ctx.lineWidth = w2;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
        ctx.stroke();
      }
    };
    ribbon([[W * 0.16, H * 0.72], [W * 0.36, H * 0.28], [W * 0.5, H * 0.66], [W * 0.62, H * 0.30]], "rgba(255,120,170,AL)");
    ribbon([[W * 0.84, H * 0.78], [W * 0.64, H * 0.40], [W * 0.52, H * 0.78], [W * 0.40, H * 0.44]], "rgba(110,220,235,AL)");
    ctx.fillStyle = "rgba(255,235,160,0.9)";
    for (const [x, y] of [[W * 0.62, H * 0.28], [W * 0.40, H * 0.42], [W * 0.52, H * 0.18]]) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "92"(ctx, W, H, a) {                       // 표정 날씨 — 해 뜨는 초원과 무지개
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#3a5a8c"); sky.addColorStop(0.55, "#e8a86a"); sky.addColorStop(0.75, "#f2c98a");
    sky.addColorStop(0.78, "#4a7a4c"); sky.addColorStop(1, "#2f5c38");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const sun = ctx.createRadialGradient(W * 0.3, H * 0.62, 0, W * 0.3, H * 0.62, 42);
    sun.addColorStop(0, "rgba(255,235,170,0.95)"); sun.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.62, 42, 0, Math.PI * 2); ctx.fill();
    for (let b2 = 0; b2 < 4; b2++) {
      ctx.strokeStyle = ["rgba(255,110,110,0.5)", "rgba(255,210,110,0.5)", "rgba(120,230,140,0.5)", "rgba(120,170,255,0.5)"][b2];
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W * 0.72, H * 0.86, 56 - b2 * 6, Math.PI, Math.PI * 1.98); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath(); ctx.arc(W * 0.62, H * 0.24, 10, 0, Math.PI * 2); ctx.arc(W * 0.70, H * 0.26, 8, 0, Math.PI * 2); ctx.arc(W * 0.55, H * 0.27, 7, 0, Math.PI * 2); ctx.fill();
    for (const [fx, col] of [[0.2, "#ffb0c8"], [0.45, "#ffd98a"], [0.85, "#c5a8f5"]]) {
      const x = fx * W, y = H * 0.88;
      ctx.strokeStyle = "rgba(60,110,70,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 4); ctx.stroke();
      ctx.fillStyle = col;
      for (let k = 0; k < 5; k++) {
        const an = (k * Math.PI * 2) / 5;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(an) * 5, y - 4 + Math.sin(an) * 5, 3.4, 2.2, an, 0, Math.PI * 2); ctx.fill();
      }
    }
  },
  "93"(ctx, W, H, a) {                       // 동물 따라쟁이 — 갸웃한 아기 고양이
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, H * 0.8);
    bg.addColorStop(0, "#2a2438"); bg.addColorStop(1, "#161222");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W * 0.5, H * 0.5); ctx.rotate(-0.12);
    const R = Math.min(W, H) * 0.30;
    ctx.fillStyle = "#f2c088";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * R * 0.42, -R * 0.62); ctx.lineTo(sx * R * 0.86, -R * 1.12); ctx.lineTo(sx * R * 0.92, -R * 0.44);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#241c14";
    ctx.beginPath(); ctx.arc(-R * 0.34, -R * 0.1, R * 0.13, 0, Math.PI * 2); ctx.arc(R * 0.34, -R * 0.1, R * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(-R * 0.30, -R * 0.14, R * 0.045, 0, Math.PI * 2); ctx.arc(R * 0.38, -R * 0.14, R * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e88a7a";
    ctx.beginPath(); ctx.ellipse(0, R * 0.14, R * 0.10, R * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(60,42,30,0.8)"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(-R * 0.10, R * 0.22, R * 0.10, 0.1, Math.PI - 0.4); ctx.arc(R * 0.10, R * 0.22, R * 0.10, 0.3, Math.PI - 0.1); ctx.stroke();
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.moveTo(sx * R * 0.5, R * (0.05 + k * 0.09));
      ctx.lineTo(sx * R * 0.95, R * (0.0 + k * 0.12)); ctx.stroke();
    }
    ctx.fillStyle = "rgba(240,130,140,0.5)";
    ctx.beginPath(); ctx.arc(-R * 0.52, R * 0.16, R * 0.11, 0, Math.PI * 2); ctx.arc(R * 0.52, R * 0.16, R * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,230,150,0.9)";
    for (const [x, y] of [[W * 0.2, H * 0.22], [W * 0.82, H * 0.3], [W * 0.75, H * 0.14]]) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  },
  "94"(ctx, W, H, a) {                       // 빛의 정원 — 손비와 꽃밭
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#141a30"); sky.addColorStop(0.7, "#232a48"); sky.addColorStop(1, "#1c3020");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const palm = ctx.createRadialGradient(W * 0.5, H * 0.22, 0, W * 0.5, H * 0.22, 26);
    palm.addColorStop(0, "rgba(190,240,215,0.9)"); palm.addColorStop(1, "rgba(140,220,190,0)");
    ctx.fillStyle = palm; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.22, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(180,235,255,0.75)"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const x = W * (0.38 + i * 0.05), y0 = H * (0.3 + (i % 3) * 0.1);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 12); ctx.stroke();
    }
    const gy = H * 0.86;
    const flowers = [[0.2, 1, "#ffb0c8"], [0.38, 0.6, "#ffd98a"], [0.56, 1, "#c5a8f5"], [0.74, 0.35, "#9fd8ff"], [0.88, 1, "#ffb0c8"]];
    for (const [fx, st, col] of flowers) {
      const x = fx * W;
      ctx.strokeStyle = "rgba(120,200,130,0.9)"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x, gy + 6); ctx.lineTo(x, gy - 14 * st); ctx.stroke();
      if (st < 0.5) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, gy - 14 * st - 3, 4, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.fillStyle = col;
      for (let k = 0; k < 6; k++) {
        const an = (k * Math.PI * 2) / 6;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(an) * 6.5, gy - 14 - 0 + Math.sin(an) * 6.5, 4.4, 2.8, an, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,240,190,0.95)"; ctx.beginPath(); ctx.arc(x, gy - 14, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,210,120,0.9)";
    ctx.save(); ctx.translate(W * 0.65, H * 0.6); ctx.rotate(0.4);
    ctx.beginPath(); ctx.ellipse(-4, 0, 5, 8, -0.5, 0, Math.PI * 2); ctx.ellipse(4, 0, 5, 8, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  "95"(ctx, W, H, a) {                       // 아기 용 — 노을 하늘의 반려 용
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#5a2a52"); sky.addColorStop(0.55, "#c8583a"); sky.addColorStop(1, "#f2a05a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(40,20,40,0.75)";
    for (const [fx, fy, w2] of [[0.18, 0.78, 44], [0.72, 0.85, 60]]) {
      ctx.beginPath(); ctx.ellipse(fx * W, fy * H, w2, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,240,180,0.9)";
    for (let i = 0; i < 6; i++) {
      const an = Math.PI * (0.2 + i * 0.13);
      ctx.beginPath(); ctx.arc(W * 0.5 + Math.cos(an) * 52, H * 0.42 + Math.sin(an) * 34, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    const hx = W * 0.55, hy = H * 0.42;
    const seg = [[0, 0, 16], [-14, 8, 12], [-26, 15, 9], [-36, 21, 6.5], [-44, 26, 4.5]];
    ctx.fillStyle = "#8fd8a8";
    for (let i = seg.length - 1; i >= 0; i--) {
      const [dx, dy, r] = seg[i];
      ctx.beginPath(); ctx.arc(hx + dx, hy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#bff0d0";
    ctx.beginPath(); ctx.ellipse(hx - 12, hy - 8, 9, 12, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(hx + 5, hy - 4, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#241c20";
    ctx.beginPath(); ctx.arc(hx + 6.5, hy - 4, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(240,130,140,0.6)";
    ctx.beginPath(); ctx.arc(hx + 1, hy + 4, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2b05a";
    ctx.beginPath(); ctx.moveTo(hx + 14, hy - 2); ctx.lineTo(hx + 22, hy); ctx.lineTo(hx + 14, hy + 4); ctx.closePath(); ctx.fill();
  },
  "87"(ctx, W, H, a) {
    // 겨울 두루마리 — 한지 자락 위 먹 소나무·집, 성긴 눈, 작은 등불
    ctx.fillStyle = "#e9e0cc"; ctx.fillRect(0, 0, W, H);
    const dyTop = H * 0.12, sh = H * 0.76;
    ctx.strokeStyle = "rgba(46,40,30,0.75)"; ctx.lineWidth = Math.max(1.5, W * 0.006);
    for (let k = 0; k < 2; k++) {                 // 먹 소나무 두 그루
      const bx = W * (0.62 + k * 0.16), by = dyTop + sh * 0.74;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - W * 0.02, dyTop + sh * 0.34); ctx.stroke();
      for (let b = 0; b < 3; b++) {
        const y = dyTop + sh * (0.42 + b * 0.12);
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + (b % 2 ? 1 : -1) * W * 0.05, y - sh * 0.05); ctx.stroke();
      }
    }
    const hx = W * 0.34, hy = dyTop + sh * 0.52;  // 집 + 둥근 창
    ctx.strokeStyle = "rgba(46,40,30,0.85)"; ctx.lineWidth = Math.max(1.2, W * 0.004);
    ctx.strokeRect(hx - W * 0.05, hy - H * 0.05, W * 0.1, H * 0.11);
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, W * 0.09);
    g.addColorStop(0, "rgba(255,208,150,0.9)"); g.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, W * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(252,252,255,0.9)";      // 성긴 눈
    for (let i = 0; i < 26; i++) {
      const x = ((i * 97 + a * 40) % (W + 20)) - 10, y = (i * 53 + a * 90) % H;
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H * 0.55, W * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(20,16,10,0.34)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  },
  "89"(ctx, W, H, a) {                       // 월하정인 — 초롱불을 켜는 손
    // 밤 담모퉁이
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1a1b2e"); sky.addColorStop(1, "#0c0b14");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#201f2b"; ctx.fillRect(0, H * 0.52, W, H * 0.48);   // 담벼락
    // 초승달 + 달무리 (좌상)
    const mx = W * 0.27, my = H * 0.21;
    ctx.globalCompositeOperation = "lighter";
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.22);
    mg.addColorStop(0, "rgba(196,212,248,0.22)"); mg.addColorStop(1, "rgba(180,198,240,0)");
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(228,232,246,0.92)";
    ctx.beginPath(); ctx.arc(mx, my, W * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#141525";                                          // 초승달 그믐부 컷
    ctx.beginPath(); ctx.arc(mx + W * 0.026, my - W * 0.016, W * 0.05, 0, Math.PI * 2); ctx.fill();
    // 두 인물 실루엣 (여인·선비)
    ctx.fillStyle = "rgba(210,214,222,0.85)";
    ctx.beginPath(); ctx.ellipse(W * 0.63, H * 0.62, W * 0.055, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(226,228,234,0.9)";
    ctx.beginPath(); ctx.ellipse(W * 0.8, H * 0.6, W * 0.05, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#15141c";                                          // 선비 갓
    ctx.beginPath(); ctx.ellipse(W * 0.8, H * 0.36, W * 0.06, H * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    // 초롱불 발광 (우하)
    const lx = W * 0.82, ly = H * 0.62;
    ctx.globalCompositeOperation = "lighter";
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.42);
    lg.addColorStop(0, "rgba(255,196,110,0.72)"); lg.addColorStop(0.4, "rgba(255,150,70,0.3)"); lg.addColorStop(1, "rgba(255,120,50,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    const lc = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.07);
    lc.addColorStop(0, "rgba(255,244,200,0.95)"); lc.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = lc; ctx.fillRect(0, 0, W, H);
    // 반딧불이 두 점
    for (let i = 0; i < 2; i++) {
      const fx = W * (0.4 + i * 0.12), fy = H * (0.78 - i * 0.06);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.03);
      fg.addColorStop(0, "rgba(210,255,150,0.8)"); fg.addColorStop(1, "rgba(170,230,110,0)");
      ctx.fillStyle = fg; ctx.fillRect(fx - W * 0.03, fy - W * 0.03, W * 0.06, W * 0.06);
    }
    ctx.globalCompositeOperation = "source-over";
  },
};
function hex(h) {
  h = h.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
//  Room — load a single piece
// ---------------------------------------------------------------------------
let stage = $("#stage");
const loader = $("#loader");

// A <canvas> permanently locks to the first context type it's given (2D or
// WebGL). Since pieces mix both, hand each piece a FRESH canvas so a WebGL
// piece is never blocked by a 2D context left over from a previous piece.
function freshStage() {
  const old = stage;
  const next = document.createElement("canvas");
  next.id = old.id;
  next.className = old.className;
  old.replaceWith(next);
  stage = next;
  return stage;
}

async function openRoom(no) {
  const work = WORKS.find((w) => w.no === no);
  if (!work || !work.module) return;
  state.current = no;
  setView("room");
  fillPlacard(work);
  await loadPiece(work);
  history.replaceState(null, "", `#work-${no}`);
}

function fillPlacard(work) {
  const wing = wingOf(work.wing);
  $("#room").style.setProperty("--accent", wing.accent);
  $(".placard__no").textContent = `${work.no} — ${wing.name}`;
  $(".placard__title").textContent = work.title;
  $(".placard__ko").textContent = work.ko;
  $(".placard__medium").textContent = work.medium + "  ·  " + work.year;
  $(".placard__note").textContent = work.note;
  $("#hint").textContent = work.hint;
  $("#controls").innerHTML = "";
  fillDetails(work);
}

// Extended technical note — collapsed by default, revealed by the toggle.
function fillDetails(work) {
  const d = DETAILS[work.no];
  const more = $(".placard__more");
  const panel = $("#details");
  // always reset to collapsed when switching works
  panel.hidden = true;
  more.setAttribute("aria-expanded", "false");
  if (!d) { more.style.display = "none"; return; }
  more.style.display = "flex";
  $('[data-detail="tech"]').textContent = d.tech;
  $('[data-detail="idea"]').textContent = d.idea;
  $('[data-detail="play"]').textContent = d.play;
}

function toggleDetails() {
  const more = $(".placard__more");
  const panel = $("#details");
  const open = more.getAttribute("aria-expanded") === "true";
  more.setAttribute("aria-expanded", String(!open));
  panel.hidden = open;
  $(".placard__more-label").textContent = open ? "기술 노트 자세히 보기" : "기술 노트 접기";
  if (!open) {
    // ensure newly revealed text is scrolled into view within the placard
    requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
}

function unloadPiece() {
  if (state.piece) { try { state.piece.unmount(); } catch (e) {} state.piece = null; }
  // Don't touch the canvas context here — replacing the canvas (freshStage)
  // is what resets it, so a WebGL piece can bind cleanly next.
}

async function loadPiece(work) {
  unloadPiece();
  const canvas = freshStage();           // give this piece a clean, unbound canvas
  const host = $("#controls");
  host.innerHTML = "";                    // clear controls
  loader.setAttribute("aria-hidden", "false");
  try {
    const mod = await import(work.module);
    const wing = wingOf(work.wing);
    const Cls = mod.default;
    const piece = new Cls(canvas, { accent: wing.accent, sound: state.sound });
    state.piece = piece;
    piece.mount();
    if (piece.controls) piece.controls(host);
  } catch (err) {
    console.error("piece load failed:", work.module, err);
    $(".placard__note").textContent = "이 작품을 불러오지 못했습니다. " + err.message;
  } finally {
    loader.setAttribute("aria-hidden", "true");
  }
}

function navRoom(dir) {
  const list = readyWorks();
  const i = list.findIndex((w) => w.no === state.current);
  if (i < 0) return;
  const next = list[(i + dir + list.length) % list.length];
  openRoom(next.no);
}

// ---------------------------------------------------------------------------
//  Ambient sound (optional, lazy, gentle drones tuned per wing accent)
// ---------------------------------------------------------------------------
function toggleSound() {
  state.sound = !state.sound;
  $(".sound-toggle").setAttribute("aria-pressed", String(state.sound));
  if (state.sound) startAmbient(); else stopAmbient();
}
function startAmbient() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.0; master.connect(ctx.destination);
    const voices = [110, 164.81, 220].map((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 1 ? "sine" : "triangle"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.18 / (i + 1);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 3;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(master); o.start(); lfo.start();
      return o;
    });
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    state.audio = { ctx, master, voices };
  } catch (e) { /* audio not available */ }
}
function stopAmbient() {
  const a = state.audio; if (!a) return;
  try {
    a.master.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.6);
    setTimeout(() => a.ctx.close(), 800);
  } catch (e) {}
  state.audio = null;
}

// ---------------------------------------------------------------------------
//  Global wiring
// ---------------------------------------------------------------------------
function wire() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "enter") setView("gallery");
    else if (a === "home") setView("atrium");
    else if (a === "exit") { history.replaceState(null, "", "#"); setView("gallery"); }
    else if (a === "next") navRoom(1);
    else if (a === "prev") navRoom(-1);
    else if (a === "sound") toggleSound();
    else if (a === "placard-toggle") $("#placard").classList.toggle("is-collapsed");
    else if (a === "details-toggle") toggleDetails();
  });

  document.addEventListener("keydown", (e) => {
    if (state.view !== "room") return;
    if (e.key === "Escape") { history.replaceState(null, "", "#"); setView("gallery"); }
    else if (e.key === "ArrowRight") navRoom(1);
    else if (e.key === "ArrowLeft") navRoom(-1);
  });

  $("#year").textContent = new Date().getFullYear();
}

// deep link (#work-NN opens a room, #gallery opens the grid)
function handleHash() {
  const m = location.hash.match(/work-(\d{2})/);
  if (m) { setView("gallery"); openRoom(m[1]); }
  else if (location.hash === "#gallery") { setView("gallery"); }
}

// 수장고(비공개 보관고) — 로컬 전용 js/data-vault.js가 있으면 여기서 합류한다.
// 공개 익스포트에는 그 파일이 없으므로 임포트가 실패하고(404), 본전시만으로
// 조용히 열린다. errors/kids 카탈로그(data-catalog 지정)에는 합류하지 않는다.
if (!document.documentElement.dataset.catalog) {
  try {
    const v = await import("./data-vault.js");
    WINGS.push(v.VAULT_WING);
    WORKS.push(...v.VAULT_WORKS);
    Object.assign(DETAILS, v.VAULT_DETAILS);
    Object.assign(thumbPainters, v.VAULT_THUMBS);
  } catch { /* vault stays home */ }
}

// EN 레이어 — 같은 이름의 .en.js 카탈로그 오버레이가 있으면 자막·해설·힌트를 교체한다.
// (data.js → data.en.js, data-errors.js → data-errors.en.js …) 수장고처럼 없으면 조용히 원문 유지.
if (isEN) {
  try {
    const path = (document.documentElement.dataset.catalog || "./data.js").replace(/\.js$/, ".en.js");
    const en = await import(path);
    for (const w of WORKS) {
      const o = en.WORKS_EN?.[w.no];
      if (!o) continue;
      if (o.sub) w.ko = o.sub;
      if (o.medium) w.medium = o.medium;
      if (o.note) w.note = o.note;
      if (o.hint) w.hint = o.hint;
    }
    for (const g of WINGS) {
      const s = en.WINGS_EN?.[g.id];
      if (s !== undefined) g.sub = s;
    }
    for (const [no, d] of Object.entries(en.DETAILS_EN || {})) {
      if (DETAILS[no]) Object.assign(DETAILS[no], d);
    }
  } catch { /* overlay missing — stay Korean */ }
}

buildNav();
wire();
handleHash();
