// ============================================================================
//  main.js — exhibition controller.
//  Owns view state (atrium · gallery · room), builds the gallery grid,
//  loads/unloads art-piece modules into the single shared stage canvas,
//  drives placard text, controls, navigation, sound, and thumbnails.
// ============================================================================

// the shell is reused by sister exhibitions: <html data-catalog="./data-errors.js">
const { WINGS, WORKS, wingOf } = await import(document.documentElement.dataset.catalog || "./data.js");
import { DETAILS } from "./details.js";

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
  "43"(ctx, W, H, a) {                       // celestial orrery — brass rings + sun + jewels
    ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.5;
    // faint starfield
    ctx.fillStyle = "rgba(159,176,208,0.6)";
    for (let i = 0; i < 30; i++) {
      const x = (Math.sin(i * 12.9) * 0.5 + 0.5) * W, y = (Math.sin(i * 78.2) * 0.5 + 0.5) * H;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    // three tilted brass orbit rings (ellipses → faux-3D plane tilt)
    const rings = [[Math.min(W, H) * 0.20, 0.0], [Math.min(W, H) * 0.32, 0.55], [Math.min(W, H) * 0.44, 1.05]];
    ctx.lineWidth = 2;
    for (let ri = 0; ri < rings.length; ri++) {
      const [R] = rings[ri];
      ctx.strokeStyle = "#b8863c";
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // glowing sun at the centre
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.2);
    sg.addColorStop(0, "rgba(255,230,160,0.95)"); sg.addColorStop(0.4, "rgba(255,179,71,0.5)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.2, 0, Math.PI * 2); ctx.fill();
    // three orbiting jewels on their rings
    const jcols = ["#bfe6ff", "#dbe6ff", "#ffd27c"];
    const jang = [0.6, 2.4, 4.1];
    for (let i = 0; i < 3; i++) {
      const R = rings[i][0];
      const x = cx + Math.cos(jang[i]) * R, y = cy + Math.sin(jang[i]) * R * 0.42;
      ctx.fillStyle = jcols[i];
      ctx.beginPath(); ctx.arc(x, y, 3.5 + i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "44"(ctx, W, H, a) {                       // 자격루 — 파수호 → 수수호+부전 → 레일 → 종(ball strike)
    ctx.fillStyle = "#0a0907"; ctx.fillRect(0, 0, W, H);
    const BR = "rgba(202,168,108,", BRH = "rgba(240,214,150,";
    // 파수호: a couple of supply jars top-left, stepping down
    const jw = W * 0.16, jh = H * 0.13;
    const jars = [[W * 0.10, H * 0.08], [W * 0.10 + jw * 0.85, H * 0.08 + jh * 0.7]];
    for (const [jx, jy] of jars) {
      ctx.fillStyle = "rgba(20,18,14,0.7)";
      ctx.beginPath(); ctx.rect(jx, jy, jw, jh); ctx.fill();
      ctx.fillStyle = "rgba(110,205,224,0.5)"; ctx.fillRect(jx, jy + jh * 0.35, jw, jh * 0.65);
      ctx.strokeStyle = BRH + "0.55)"; ctx.lineWidth = 1.4; ctx.strokeRect(jx, jy, jw, jh);
    }
    // regulated spout stream from the lower jar down to the receiver
    const spoutX = jars[1][0] + jw * 0.5, spoutY = jars[1][1] + jh;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(190,228,244,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(spoutX, spoutY); ctx.lineTo(spoutX + 6, H * 0.42); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    // 수수호: ONE receiving vessel + 부전 float + 잣대 notch plate (counting by balls)
    const rw = W * 0.11, rtop = H * 0.36, rbot = H * 0.90;
    const rcx = W * 0.30, lx = rcx - rw * 0.5, surfY = rbot - (rbot - rtop - 6) * 0.6;
    ctx.fillStyle = "rgba(16,18,22,0.6)"; ctx.fillRect(lx, rtop, rw, rbot - rtop);
    const wg = ctx.createLinearGradient(0, surfY, 0, rbot);
    wg.addColorStop(0, "rgba(150,226,240,0.8)"); wg.addColorStop(1, "rgba(24,84,116,0.85)");
    ctx.fillStyle = wg; ctx.fillRect(lx, surfY, rw, rbot - surfY);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(200,240,250,0.9)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(lx, surfY); ctx.lineTo(lx + rw, surfY); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = BRH + "0.5)"; ctx.lineWidth = 1.5; ctx.strokeRect(lx, rtop, rw, rbot - rtop);
    // 잣대 notch plate beside the vessel, with balls in the notches
    const plx = lx + rw + 12, ptop = rtop + 6, pbot = rbot - 6;
    ctx.fillStyle = "rgba(120,96,52,0.3)"; ctx.fillRect(plx - 3, ptop - 3, 14, (pbot - ptop) + 6);
    for (let i = 0; i < 9; i++) {
      const ny = pbot - (pbot - ptop) * (i + 0.5) / 9;
      ctx.strokeStyle = BRH + "0.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(plx - 1, ny); ctx.lineTo(plx + 5, ny); ctx.stroke();
      ctx.fillStyle = BRH + "0.7)"; ctx.beginPath(); ctx.arc(plx + 8, ny, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // 부전 float: disc + rod + a horizontal pointer arm touching the plate
    const tipY = surfY - (surfY - (rtop - H * 0.04)) * 0.7;
    ctx.fillStyle = "rgba(60,72,90,0.9)"; ctx.beginPath(); ctx.ellipse(rcx, surfY, rw * 0.3, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = BR + "0.85)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(rcx, surfY); ctx.lineTo(rcx, tipY); ctx.stroke();
    ctx.strokeStyle = BRH + "0.8)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(rcx, tipY); ctx.lineTo(plx + 6, tipY); ctx.stroke();
    ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(plx + 6, tipY); ctx.lineTo(plx, tipY - 3); ctx.lineTo(plx, tipY + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(180,165,130,0.6)"; ctx.font = "600 11px serif";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("受水壺", rcx, rbot + 14);
    const fcx = plx + 6;   // the released ball rolls from the plate toward the pavilion
    // ---- 시보 pavilion (right): timber body, tiled roof, zodiac window row, bell
    const pvx = W * 0.56, pvw = W * 0.40, pvtop = H * 0.18, pvbot = H * 0.92;
    ctx.fillStyle = "rgba(86,52,38,0.40)"; ctx.fillRect(pvx, pvtop + 14, pvw, pvbot - pvtop - 14);
    ctx.strokeStyle = "rgba(150,96,64,0.5)"; ctx.lineWidth = 2; ctx.strokeRect(pvx, pvtop + 14, pvw, pvbot - pvtop - 14);
    // tiled roof (hipped, upturned eaves)
    ctx.fillStyle = "rgba(60,70,88,0.85)";
    ctx.beginPath();
    ctx.moveTo(pvx - 10, pvtop + 16); ctx.lineTo(pvx + pvw * 0.5, pvtop - 8);
    ctx.lineTo(pvx + pvw + 10, pvtop + 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,160,180,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    // zodiac window row (middle tier)
    const zy = H * 0.56, zh = H * 0.22, n = 12, zw = pvw * 0.96 / n, zx = pvx + pvw * 0.02;
    for (let i = 0; i < n; i++) {
      const active = i === 10;
      ctx.fillStyle = active ? "rgba(30,28,22,0.9)" : "rgba(16,14,10,0.7)";
      ctx.fillRect(zx + i * zw, zy, zw - 2, zh);
      ctx.strokeStyle = "rgba(150,96,64,0.35)"; ctx.lineWidth = 0.8; ctx.strokeRect(zx + i * zw, zy, zw - 2, zh);
      if (active) { ctx.fillStyle = a; ctx.fillRect(zx + i * zw + zw * 0.3, zy + 4, zw * 0.4, 8); }
    }
    // 방목 rail: trip point → arcs to the bell jack on the top tier
    const bellX = pvx + pvw * 0.28, bellY = pvtop + (pvbot - pvtop) * 0.18;
    ctx.strokeStyle = "rgba(150,135,95,0.4)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fcx, tipY);
    ctx.quadraticCurveTo(fcx + 40, tipY + 26, (fcx + bellX) / 2, pvtop + 6);
    ctx.quadraticCurveTo(bellX - 20, pvtop + 2, bellX, bellY - 16); ctx.stroke();
    // a brass carry-ball partway down the rail
    const bx = (fcx + bellX) / 2 + 6, by = pvtop + 12;
    ctx.fillStyle = BRH + "0.95)"; ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,232,170,0.5)";
    ctx.beginPath(); ctx.arc(bx - 1.2, by - 1.2, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // 종·북·징 three instruments on the top tier
    const insts = [[bellX, "鐘"], [pvx + pvw * 0.55, "鼓"], [pvx + pvw * 0.80, "鉦"]];
    for (let k = 0; k < insts.length; k++) {
      const [ix, glyph] = insts[k], br = H * (0.07 + k * 0.008);
      const bg = ctx.createRadialGradient(ix - br * 0.3, bellY - br * 0.3, br * 0.1, ix, bellY, br);
      bg.addColorStop(0, BRH + "0.8)"); bg.addColorStop(1, "rgba(120,92,48,0.6)");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(ix, bellY, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = BRH + "0.55)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(ix, bellY, br, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(30,22,12,0.8)"; ctx.font = `700 ${Math.round(br)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(glyph, ix, bellY + 1);
    }
    // bell ring waves (the struck one)
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,228,170,0.4)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(bellX, bellY, H * 0.07 + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
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
  "46"(ctx, W, H, a) {                       // pendulum waves — hanging bobs, phase ribbon
    ctx.fillStyle = "#070a10"; ctx.fillRect(0, 0, W, H);
    const barY = H * 0.16, N = 14, x0 = W * 0.18, x1 = W * 0.82;
    // brass pivot bar
    ctx.strokeStyle = "#b8863c"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0 - 8, barY); ctx.lineTo(x1 + 8, barY); ctx.stroke();
    // hanging pendulums, phase-offset so the bobs trace a sine wave (the ribbon)
    for (let i = 0; i < N; i++) {
      const fx = i / (N - 1);
      const x = x0 + fx * (x1 - x0);
      const phase = fx * Math.PI * 2.2;          // staggered phase = traveling wave
      const len = H * (0.36 + 0.32 * (0.5 + 0.5 * Math.sin(phase)));
      const y = barY + len;
      // string
      ctx.strokeStyle = "rgba(133,149,176,0.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, barY); ctx.lineTo(x, y); ctx.stroke();
      // glowing bob (hue across the row)
      ctx.globalCompositeOperation = "lighter";
      const hue = 200 + fx * 40;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, 8);
      bg.addColorStop(0, `hsla(${hue},70%,72%,0.95)`); bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${hue},65%,60%)`; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  },
  "47"(ctx, W, H, a) {                       // nixie — one glowing tube
    ctx.fillStyle = "#0a0808"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.5, tw = W * 0.30, th = H * 0.72;
    const pool = ctx.createRadialGradient(cx, cy + th * 0.42, 0, cx, cy + th * 0.42, tw * 1.4);
    pool.addColorStop(0, "rgba(255,110,30,0.25)"); pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool; ctx.fillRect(0, cy, W, H / 2);
    ctx.fillStyle = "#1d130c"; ctx.fillRect(W * 0.1, cy + th * 0.46, W * 0.8, H * 0.12);
    ctx.fillStyle = "rgba(160,190,215,0.05)";
    ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th * 0.96, tw * 0.3); ctx.fill();
    ctx.strokeStyle = "rgba(190,215,235,0.16)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th * 0.96, tw * 0.3); ctx.stroke();
    ctx.shadowColor = "rgba(255,92,20,0.95)"; ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,168,70,0.95)"; ctx.lineWidth = 4;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - tw * 0.14, cy - th * 0.20); ctx.lineTo(cx + tw * 0.14, cy - th * 0.20);
    ctx.lineTo(cx - tw * 0.05, cy + th * 0.02);
    ctx.bezierCurveTo(cx + tw * 0.22, cy + th * 0.02, cx + tw * 0.22, cy + th * 0.30, cx - tw * 0.02, cy + th * 0.30);
    ctx.lineTo(cx - tw * 0.16, cy + th * 0.22);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,238,205,0.95)"; ctx.lineWidth = 1.4;
    ctx.stroke();
  },
  "48"(ctx, W, H, a) {                       // glyph rain — noise streams + frozen digit
    ctx.fillStyle = "#05070a"; ctx.fillRect(0, 0, W, H);
    ctx.font = "700 11px ui-monospace, Menlo, monospace"; ctx.textAlign = "center";
    for (let c = 0; c < 16; c++) {
      const x = (c + 0.5) * (W / 16), n = 5 + ((c * 7) % 6);
      const yh = ((c * 53) % 80) / 100 * H;
      for (let i = 0; i < n; i++) {
        const y = yh - i * 13;
        if (y < 0 || y > H) continue;
        ctx.fillStyle = i === 0 ? "rgba(220,255,240,0.9)" : `rgba(120,190,170,${0.4 * (1 - i / n)})`;
        ctx.fillText(String((c * 31 + i * 7) % 10), x, y);
      }
    }
    // a crystallised giant "4" of frozen glyphs
    ctx.fillStyle = a;
    ctx.shadowColor = a; ctx.shadowBlur = 6;
    const cells = [[3,1],[3,2],[3,3],[2,2],[1,3],[1,4],[2,4],[3,4],[4,4],[3,5],[3,6]];
    for (const [gx, gy] of cells)
      ctx.fillText(String((gx * 3 + gy) % 10), W * 0.38 + gx * 11, H * 0.18 + gy * 13);
    ctx.shadowBlur = 0;
  },
  "50"(ctx, W, H, a) {                       // deep display — wall of mini 7-segs forming a digit
    ctx.fillStyle = "#07080d"; ctx.fillRect(0, 0, W, H);
    const cw = W / 18, chh = H / 9;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 18; c++) {
        const x = c * cw + 1.5, y = r * chh + 1.5;
        ctx.fillStyle = "rgba(140,155,180,0.12)";
        ctx.fillRect(x, y, cw - 3, chh - 3);
      }
    // giant "7" segments lit accent (A + B + C)
    const lit = [];
    for (let c = 5; c < 13; c++) lit.push([c, 1]);
    for (let r = 2; r < 8; r++) lit.push([12, r]);
    for (const [c, r] of lit) {
      const x = c * cw + 1.5, y = r * chh + 1.5;
      ctx.fillStyle = a; ctx.shadowColor = a; ctx.shadowBlur = 5;
      ctx.fillRect(x, y, cw - 3, chh - 3);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(x + (cw - 3) * 0.3, y + 1.5, (cw - 3) * 0.16, chh - 6);
    }
  },
  "54"(ctx, W, H, a) {                       // observer — clouds + collapsed facts in a gaze ring
    ctx.fillStyle = "#08070d"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = (i * 73 % W), y = (i * 47 % H);
      ctx.fillStyle = "rgba(150,120,220,0.16)";
      for (let k = 0; k < 3; k++)
        { ctx.beginPath(); ctx.arc(x + Math.cos(i + k * 2) * 7, y + Math.sin(i * 2 + k) * 6, 2.4, 0, Math.PI * 2); ctx.fill(); }
    }
    const gx = W * 0.62, gy = H * 0.44, R = H * 0.34;
    ctx.strokeStyle = a; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) {
      const ang = i * 1.7, rr = (i * 37 % (R * 0.85));
      const x = gx + Math.cos(ang) * rr, y = gy + Math.sin(ang) * rr * 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(189,125,255,0.35)";
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
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
  "56"(ctx, W, H, a) {                       // emergence — noise shards + half-formed word
    ctx.fillStyle = "#07080b"; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    for (let i = 0; i < 130; i++) {
      const x = (i * 61 % W), y = (i * 37 % H), ang = i * 2.1;
      const emerging = x > W * 0.35 && x < W * 0.75 && y > H * 0.3 && y < H * 0.7;
      ctx.strokeStyle = emerging ? a : "rgba(140,145,165,0.35)";
      ctx.lineWidth = emerging ? 2 : 1.2;
      const aa = emerging ? Math.PI / 4 : ang;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(aa) * 5, y - Math.sin(aa) * 5);
      ctx.lineTo(x + Math.cos(aa) * 5, y + Math.sin(aa) * 5);
      ctx.stroke();
    }
  },
  "57"(ctx, W, H, a) {                       // biomorph — one glowing organism in a plot ring
    ctx.fillStyle = "#070a09"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.55;
    ctx.strokeStyle = "rgba(140,150,160,0.25)";
    ctx.beginPath(); ctx.arc(cx, cy, H * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    const branch = (x, y, ang, len, d) => {
      if (d <= 0) return;
      for (const f of [-0.5, 0, 0.5]) {
        const na = ang + f * 0.9;
        const nx = x + Math.cos(na) * len, ny = y + Math.sin(na) * len;
        ctx.strokeStyle = `hsla(${140 + d * 25},80%,${45 + d * 8}%,0.7)`;
        ctx.lineWidth = d * 0.7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        branch(nx, ny, na, len * 0.66, d - 1);
      }
    };
    branch(cx, cy + H * 0.28, -Math.PI / 2, H * 0.2, 4);
    ctx.globalCompositeOperation = "source-over";
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
  "67"(ctx, W, H, a) {                       // gnomon — plaza + shadow hand
    ctx.fillStyle = "#8f8878"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.52, R = Math.min(W, H) * 0.42;
    const d = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    d.addColorStop(0, "#a89f8c"); d.addColorStop(1, "#7d7666");
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    for (let h = 0; h < 24; h++) {
      const an = (h / 24) * Math.PI * 2;
      ctx.strokeStyle = "rgba(30,26,22,0.5)"; ctx.lineWidth = h % 6 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(an) * R * 0.86, cy + Math.sin(an) * R * 0.86);
      ctx.lineTo(cx + Math.cos(an) * R * 0.94, cy + Math.sin(an) * R * 0.94);
      ctx.stroke();
    }
    const sh = ctx.createLinearGradient(cx, cy, cx - R * 0.6, cy + R * 0.35);
    sh.addColorStop(0, "rgba(16,14,18,0.75)"); sh.addColorStop(1, "rgba(16,14,18,0)");
    ctx.strokeStyle = sh; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - R * 0.6, cy + R * 0.35); ctx.stroke();
    ctx.fillStyle = "#3c332a"; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d6b278"; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
  },
  "68"(ctx, W, H, a) {                       // tides — earth, double bulge, moon
    ctx.fillStyle = "#04060c"; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.42, cy = H * 0.55, eR = Math.min(W, H) * 0.20;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.5);
    ctx.fillStyle = "rgba(38,96,156,0.9)";
    ctx.beginPath(); ctx.ellipse(0, 0, eR * 1.45, eR * 1.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const eg = ctx.createRadialGradient(cx - eR * 0.3, cy - eR * 0.3, 0, cx, cy, eR);
    eg.addColorStop(0, "#7fb08a"); eg.addColorStop(1, "#1d3c50");
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx, cy, eR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#dfe4ee";
    ctx.beginPath(); ctx.arc(cx + eR * 2.6 * Math.cos(-0.5), cy + eR * 2.6 * Math.sin(-0.5), eR * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd27c";
    ctx.beginPath(); ctx.arc(cx + eR * Math.cos(0.9), cy + eR * Math.sin(0.9), 4, 0, Math.PI * 2); ctx.fill();
  },
  "69"(ctx, W, H, a) {                       // worn step — grey stone, worn hollow
    ctx.fillStyle = "#111013"; ctx.fillRect(0, 0, W, H);
    const x0 = W * 0.14, y0 = H * 0.16, sw = W * 0.72, sh = H * 0.68;
    ctx.fillStyle = "#5c5954"; ctx.fillRect(x0, y0, sw, sh);
    let s = 777; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 900; i++) {
      const x = x0 + rnd() * sw, y = y0 + rnd() * sh;
      ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    const cx = x0 + sw * 0.5, cy = y0 + sh * 0.55;
    const hollow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sw * 0.3);
    hollow.addColorStop(0, "rgba(212,178,120,0.5)");
    hollow.addColorStop(0.55, "rgba(80,74,66,0.55)");
    hollow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hollow;
    ctx.beginPath(); ctx.ellipse(cx, cy, sw * 0.3, sh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,244,220,0.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx - sw * 0.05, cy - sh * 0.06, sw * 0.16, sh * 0.12, -0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(20,18,16,0.8)"; ctx.lineWidth = 3;
    ctx.strokeRect(x0, y0, sw, sh);
  },
  "70"(ctx, W, H, a) {
    ctx.fillStyle = "#0b0a0d"; ctx.fillRect(0, 0, W, H);
    const cs = [[W * 0.24, H * 0.44, 0.30, 0.16], [W * 0.5, H * 0.5, 0.92, 0.62], [W * 0.76, H * 0.45, 0.26, 0.12]];
    let s = 1234567; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const [cx, cy, glow, wear] = cs[i];
      const R = W * (i === 1 ? 0.16 : 0.11);
      const hue = 40 - (i === 1 ? 15 : 4) * wear;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
      gr.addColorStop(0, `hsla(${hue | 0},70%,60%,${(0.05 + glow * 0.13).toFixed(3)})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = gr;
      ctx.fillRect(cx - R * 2.4, cy - R * 2.4, R * 4.8, R * 4.8);
      ctx.fillStyle = `hsl(${hue | 0},${(52 + wear * 24) | 0}%,${(60 + glow * 12) | 0}%)`;
      for (let k = 0; k < 360; k++) {
        const ang = rnd() * 6.283, rr = Math.pow(rnd(), 0.5) * R;
        const jx = (rnd() * 2 - 1) * R * wear * 0.95, jy = (rnd() * 2 - 1) * R * wear * 0.95;
        ctx.globalAlpha = 0.12 + glow * 0.7;
        ctx.fillRect(cx + Math.cos(ang) * rr + jx, cy + Math.sin(ang) * rr * 1.35 + jy, 1.6, 1.6);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
  "71"(ctx, W, H, a) {                       // downstream — a warm light on a night river
    const horizon = H * 0.30;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0d14"); bg.addColorStop(horizon / H, "#0c1119"); bg.addColorStop(1, "#050609");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const cx = (d) => W * 0.5 + Math.sin(d * 3.1 + 0.6) * W * 0.17 * (1 - d * 0.72);
    const yOf = (d) => horizon + (1 - d) * (H * 1.02 - horizon);
    const hwOf = (d) => (0.46 - 0.44 * Math.pow(d, 0.82)) * W;
    ctx.globalCompositeOperation = "lighter";
    // cool water sparkle following the meandering channel
    ctx.fillStyle = "#bcd2f2";
    for (let i = 0; i < 520; i++) {
      const d = Math.pow(Math.random(), 0.7);
      const x = cx(d) + (Math.random() - 0.5) * 2 * hwOf(d);
      ctx.globalAlpha = (0.06 + 0.3 * Math.random()) * (1 - d * 0.7);
      const s = 1.8 - 1.1 * d; ctx.fillRect(x, yOf(d), s, s);
    }
    const glow = (x, y, r, warm, alpha) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, warm ? "rgba(255,246,224,1)" : "rgba(255,210,140,0.9)");
      g.addColorStop(0.35, "rgba(255,190,110,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    // horizon cluster — the moments already sent
    for (let i = 0; i < 22; i++) {
      const d = 0.9 + Math.random() * 0.09;
      const x = cx(d) + (Math.random() - 0.5) * 2 * hwOf(d);
      glow(x, yOf(d) + Math.random() * 4, 5 + Math.random() * 5, false, 0.5 + Math.random() * 0.4);
    }
    // the held light near the viewer, with a stretched wavy reflection
    const lx = cx(0.06), ly = H * 0.80;
    for (let i = 1; i <= 8; i++) {
      const f = i / 8;
      glow(lx + Math.sin(f * 7) * 10 * f, ly + 12 + f * 70, 10 * (1 - 0.6 * f), true, 0.28 * (1 - f));
    }
    glow(lx, ly, 46, false, 0.85);
    glow(lx, ly, 18, true, 1);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
  "72"(ctx, W, H, a) {                       // alight — the now, landed on an open hand: full bloom
    ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.55, cy = H * 0.45;
    ctx.globalCompositeOperation = "lighter";
    // screen-filling warm bloom (만개)
    let bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.95);
    bg.addColorStop(0, "rgba(255,208,146,0.82)");
    bg.addColorStop(0.26, "rgba(255,168,86,0.32)");
    bg.addColorStop(0.62, "rgba(150,90,50,0.08)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // radiating petals of the blossom
    const NR = 44, R = Math.min(W, H) * 0.52;
    for (let i = 0; i < NR; i++) {
      const ang = (i / NR) * Math.PI * 2;
      const len = R * (0.42 + 0.58 * Math.abs(Math.sin(i * 2.399)));
      const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
      const gr = ctx.createLinearGradient(cx, cy, ex, ey);
      gr.addColorStop(0, "rgba(255,224,166,0.5)");
      gr.addColorStop(1, "rgba(255,150,70,0)");
      ctx.strokeStyle = gr; ctx.lineWidth = 2 + (i % 2);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    // the chase-then-arrival wisp (its flight path curving in)
    const wg = ctx.createLinearGradient(W * 0.14, H * 0.86, cx, cy);
    wg.addColorStop(0, "rgba(150,176,210,0)");
    wg.addColorStop(0.6, "rgba(210,196,168,0.16)");
    wg.addColorStop(1, "rgba(255,214,158,0.4)");
    ctx.strokeStyle = wg; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(W * 0.14, H * 0.86);
    ctx.quadraticCurveTo(W * 0.2, H * 0.42, cx, cy); ctx.stroke();
    // faint dust motes (material atmosphere)
    for (let i = 0; i < 46; i++) {
      const x = ((i * 97.13) % 1) * 0 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * W;
      const y = (Math.sin(i * 78.233) * 43758.5453 % 1) * H;
      ctx.fillStyle = "rgba(255,206,150,0.22)";
      ctx.fillRect((x + W) % W, (y + H) % H, 1.4, 1.4);
    }
    // the grain = now, alight
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.09);
    cg.addColorStop(0, "rgba(255,251,240,1)");
    cg.addColorStop(0.35, "rgba(255,224,164,0.72)");
    cg.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,253,246,1)"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
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
  "75"(ctx, W, H, a) {                       // stray light — sunbeams through cloud gaps into deep space
    // deep space sky
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#05060d"); bg.addColorStop(0.55, "#0b0b18"); bg.addColorStop(1, "#050509");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const hY = H * 0.70;
    // stars
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * W, y = Math.random() * hY;
      const r = Math.random() < 0.85 ? 0.6 : 1.3;
      ctx.fillStyle = `rgba(200,215,255,${0.3 + Math.random() * 0.6})`;
      ctx.fillRect(x, y, r, r);
    }
    // dark field
    ctx.fillStyle = "#08080c"; ctx.fillRect(0, hY, W, H - hY);
    // beams through three gaps
    const gaps = [0.30, 0.52, 0.74], spread = W * 0.10;
    ctx.globalCompositeOperation = "lighter";
    for (const gx of gaps) {
      const topX = gx * W, topY = H * 0.05, botY = hY + H * 0.06;
      // spectral fringe (blue + red offset) then warm core
      for (const [dx, col] of [[-4, "rgba(90,120,255,"], [4, "rgba(255,90,70,"], [0, "rgba(255,210,124,"]]) {
        const g = ctx.createLinearGradient(topX, topY, topX, botY);
        g.addColorStop(0, col + "0.55)"); g.addColorStop(0.5, col + "0.16)"); g.addColorStop(1, col + "0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(topX - W * 0.02 + dx, topY); ctx.lineTo(topX + W * 0.02 + dx, topY);
        ctx.lineTo(topX + spread + dx, botY); ctx.lineTo(topX - spread + dx, botY);
        ctx.closePath(); ctx.fill();
      }
      // burst at the gap
      const b = ctx.createRadialGradient(topX, topY + 6, 0, topX, topY + 6, W * 0.06);
      b.addColorStop(0, "rgba(255,225,160,0.9)"); b.addColorStop(1, "rgba(255,210,124,0)");
      ctx.fillStyle = b; ctx.fillRect(topX - W * 0.1, topY - 10, W * 0.2, H * 0.2);
      // ground pool (flattened glow)
      const p = ctx.createRadialGradient(0, 0, 0, 0, 0, spread * 1.2);
      p.addColorStop(0, "rgba(255,205,130,0.55)"); p.addColorStop(1, "rgba(255,205,130,0)");
      ctx.save(); ctx.translate(topX, hY + 6); ctx.scale(1, 0.4);
      ctx.fillStyle = p; ctx.beginPath(); ctx.arc(0, 0, spread * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
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
  "81"(ctx, W, H, a) {                       // 일월오봉도 — 살아있는 병풍
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#20325a"); sky.addColorStop(1, "#0e1730");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    let s = ctx.createRadialGradient(W * 0.77, H * 0.26, 0, W * 0.77, H * 0.26, W * 0.12);
    s.addColorStop(0, "rgba(255,224,170,0.95)"); s.addColorStop(1, "rgba(226,96,63,0)");
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#eef0ea"; ctx.beginPath(); ctx.arc(W * 0.23, H * 0.26, W * 0.028, 0, Math.PI * 2); ctx.fill();
    const pk = [0.5, 0.27, 0.73, 0.1, 0.9], base = H * 0.74;
    ctx.fillStyle = "#2c3d63";
    for (let i = 0; i < 5; i++) { const cx = W * pk[i], ph = H * (0.4 - Math.abs(i - 2) * 0.04);
      ctx.beginPath(); ctx.moveTo(cx, base - ph); ctx.lineTo(cx + W * 0.12, base); ctx.lineTo(cx - W * 0.12, base); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = "rgba(240,248,255,0.7)"; ctx.lineWidth = 2;
    for (const fx of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(W * fx, H * 0.5); ctx.lineTo(W * fx, base); ctx.stroke(); }
    ctx.fillStyle = "#1c3324";
    for (const px of [0.08, 0.92]) { ctx.beginPath(); ctx.arc(W * px, H * 0.6, W * 0.05, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = "rgba(226,240,255,0.5)"; ctx.lineWidth = 1.5;
    for (let c = 0; c < 3; c++) { ctx.beginPath();
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, base + H * 0.06 * (c + 1) + Math.sin(x * 0.05 + c) * 4);
      ctx.stroke(); }
  },
  "82"(ctx, W, H, a) {                       // 인왕제색도 — 안개를 걷는 손
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#d8d2c2"); sky.addColorStop(1, "#9d9887");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // 젖은 먹 바위 능선
    ctx.fillStyle = "#26241e";
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const peak = x < W * 0.55 ? H * 0.13 : H * 0.04;
      ctx.lineTo(x, H * 0.6 + Math.sin(x * 0.045) * H * 0.05 - peak);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // 골짜기 안개 띠 + 전면 옅은 한지빛 안개
    const band = ctx.createLinearGradient(0, H * 0.44, 0, H * 0.86);
    band.addColorStop(0, "rgba(240,238,230,0)");
    band.addColorStop(0.5, "rgba(240,238,230,0.95)");
    band.addColorStop(1, "rgba(240,238,230,0.25)");
    ctx.fillStyle = band; ctx.fillRect(0, H * 0.44, W, H * 0.42);
    ctx.fillStyle = "rgba(238,236,228,0.52)"; ctx.fillRect(0, 0, W, H);
    // 손으로 걷힌 자리 — 젖은 바위 드러남
    const cx = W * 0.62, cy = H * 0.5;
    const clr = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.3);
    clr.addColorStop(0, "rgba(24,22,18,0.72)");
    clr.addColorStop(1, "rgba(24,22,18,0)");
    ctx.fillStyle = clr;
    ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.28, H * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
  },
  "83"(ctx, W, H, a) {                       // ssireum — "한 판 붙자" (들배지기)
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#efe6d0"); bg.addColorStop(1, "#e2d4b6");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.54, cy = H * 0.52, R = Math.min(W, H);
    // 함성 파문 링
    ctx.strokeStyle = "rgba(226,96,63,0.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy + H * 0.02, R * 0.34, 0, Math.PI * 2); ctx.stroke();
    // 관중 링(뒷줄 종이 인형)
    ctx.fillStyle = "#2a2320";
    for (let i = 0; i < 15; i++) {
      const ang = (i / 15) * Math.PI * 2 - 1, rr = R * (0.31 + (i % 3) * 0.02);
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.92 - H * 0.02;
      ctx.beginPath(); ctx.arc(x, y, W * 0.026, 0, Math.PI * 2); ctx.fill();
    }
    // 들배지기 — 기울어 들린 씨름꾼 한 덩어리(발밑 피벗 회전)
    ctx.save();
    ctx.translate(cx, cy + H * 0.09);
    ctx.rotate(-0.24);
    ctx.strokeStyle = "#2a2320"; ctx.lineWidth = W * 0.055; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-W * 0.08, 0); ctx.quadraticCurveTo(0, -H * 0.15, W * 0.03, -H * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.09, 0); ctx.quadraticCurveTo(0, -H * 0.08, -W * 0.02, -H * 0.05); ctx.stroke();
    ctx.restore();
    // 발밑 모래 먼지 버스트
    ctx.fillStyle = "rgba(205,182,132,0.9)";
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI / 2 + (i / 9 - 0.5) * 2.2, d = R * (0.05 + (i % 3) * 0.02);
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + H * 0.15 + Math.sin(ang) * d * 0.5, W * 0.012, 0, Math.PI * 2); ctx.fill();
    }
    // 엿장수(홀로 무심) + '…'
    ctx.fillStyle = "#2a2320"; ctx.beginPath(); ctx.arc(W * 0.13, H * 0.66, W * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(42,35,32,0.7)";
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W * 0.13 + (i - 1) * W * 0.022, H * 0.57, W * 0.007, 0, Math.PI * 2); ctx.fill(); }
  },
  "84"(ctx, W, H, a) {
    const p = typeof a === "number" ? a : 0;
    ctx.fillStyle = "#0b0a0d"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.55, rx = W * 0.24, ry = W * 0.27;
    const halo = ctx.createRadialGradient(cx, cy, ry * 0.3, cx, cy, ry * 2.1);
    halo.addColorStop(0, "rgba(174,196,230," + (0.16 + 0.06 * Math.sin(p * 6.2832)) + ")");
    halo.addColorStop(1, "rgba(174,196,230,0)");
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    const body = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, ry * 0.2, cx, cy, ry * 1.25);
    body.addColorStop(0, "#f3eee2"); body.addColorStop(0.7, "#d9d2c4"); body.addColorStop(1, "#8f8779");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.34, cy - ry);
    ctx.bezierCurveTo(cx - rx * 1.15, cy - ry * 0.7, cx - rx * 1.12, cy + ry * 0.8, cx - rx * 0.4, cy + ry);
    ctx.lineTo(cx + rx * 0.4, cy + ry);
    ctx.bezierCurveTo(cx + rx * 1.12, cy + ry * 0.8, cx + rx * 1.15, cy - ry * 0.7, cx + rx * 0.34, cy - ry);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,80,66,0.5)"; ctx.lineWidth = Math.max(1, W * 0.006);
    ctx.beginPath(); ctx.ellipse(cx, cy - ry, rx * 0.34, ry * 0.09, 0, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = Math.max(1, W * 0.01);
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.3, cy - ry * 0.1, rx * 0.12, ry * 0.5, -0.3, 0, 3.1416); ctx.stroke();
  },
  "85"(ctx, W, H, a) {
    const cx = W / 2, cy = H * 0.5, R = Math.min(W, H) * 0.4;
    const bg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, Math.max(W, H));
    bg.addColorStop(0, "#181c24"); bg.addColorStop(1, "#080b0f");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(180,188,205,0.15)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 - 0.35;
      ctx.strokeStyle = "rgba(140,150,170,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * R * 0.16, cy + Math.sin(ang) * R * 0.16);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
    }
    let s = 12345;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000) / 1000; };
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R * 0.97;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr, r = 1 + rnd() * 2;
      ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(200,206,220,0.5)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(x + 0.3, y + 0.3, r * 0.8, 0.1, 2.4); ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 10; i++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R * 0.9;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, 7);
      gg.addColorStop(0, "rgba(255,225,140,0.7)");
      gg.addColorStop(1, "rgba(240,180,60,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "86"(ctx, W, H, a) {
    const g = ctx;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#efe4c7"); bg.addColorStop(1, "#dcc9a0");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = W * 0.44, cy = H * 0.56, R = Math.min(W, H) * 0.3;
    g.fillStyle = "#e08a3c";
    g.beginPath(); g.ellipse(cx, cy, R, R * 1.05, 0, 0, Math.PI * 2);
    g.ellipse(cx - R * 0.7, cy - R * 0.78, R * 0.28, R * 0.3, 0, 0, Math.PI * 2);
    g.ellipse(cx + R * 0.7, cy - R * 0.78, R * 0.28, R * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2a2016"; g.lineWidth = R * 0.09; g.lineCap = "round";
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * R * 0.28, cy - R * 0.95); g.lineTo(cx + i * R * 0.34, cy - R * 0.5); g.stroke(); }
    const er = R * 0.26, ox = Math.cos(a * 2) * er * 0.4, oy = Math.sin(a * 2) * er * 0.3;
    for (const s of [-1, 1]) {
      const ex = cx + s * R * 0.42, ey = cy - R * 0.12;
      g.fillStyle = "#f7f1e2"; g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2a2016"; g.beginPath(); g.arc(ex + ox, ey + oy, er * 0.62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(40,30,18,0.5)"; g.lineWidth = er * 0.12; g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = "#c8442f"; g.beginPath(); g.arc(cx, cy + R * 0.28, R * 0.1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2a2016"; g.lineWidth = R * 0.06;
    g.beginPath(); g.arc(cx, cy + R * 0.3, R * 0.34, 0.2, Math.PI - 0.2); g.stroke();
    const u = Math.min(W, H);
    g.strokeStyle = "#5a3b22"; g.lineWidth = u * 0.03; g.beginPath(); g.moveTo(W, H * 0.16); g.lineTo(W * 0.7, H * 0.24); g.stroke();
    const mx = W * 0.78, my = H * 0.2;
    g.fillStyle = "#2b3a55"; g.beginPath(); g.ellipse(mx, my, u * 0.06, u * 0.045, -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e8eef5"; g.beginPath(); g.ellipse(mx + u * 0.02, my + u * 0.01, u * 0.03, u * 0.022, -0.3, 0, Math.PI * 2); g.fill();
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
  "88"(ctx, W, H, a) {
    ctx.fillStyle = "#14181a"; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.5, top = H * 0.16, vh = H * 0.7, mr = vh * 0.255;
    const P = [[0, .3], [.05, .2], [.1, .34], [.24, 1], [.4, .88], [.55, .68], [.75, .45], [.9, .36], [1, .3]];
    const rAt = (v) => { for (let i = 1; i < P.length; i++) if (v <= P[i][0]) { const t = (v - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; } return .3; };
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const v = i / 48, x = cx + rAt(v) * mr, y = top + v * vh; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 48; i >= 0; i--) { const v = i / 48; ctx.lineTo(cx - rAt(v) * mr, top + v * vh); }
    ctx.closePath(); ctx.save(); ctx.clip();
    const gr = ctx.createLinearGradient(cx - mr, 0, cx + mr, 0);
    gr.addColorStop(0, "#3f6d75"); gr.addColorStop(.42, "#6faab4"); gr.addColorStop(.5, "#8fc4cc"); gr.addColorStop(.7, "#6faab4"); gr.addColorStop(1, "#3f6d75");
    ctx.fillStyle = gr; ctx.fillRect(cx - mr, top, mr * 2, vh);
    // 흰 상감 학 한 마리
    ctx.strokeStyle = "rgba(238,236,226,.92)"; ctx.lineWidth = Math.max(1.4, mr * 0.03); ctx.lineJoin = "round"; ctx.lineCap = "round";
    const bx = cx - mr * .1, by = top + vh * .42, s = mr * .5;
    ctx.beginPath(); ctx.moveTo(bx - .45 * s, by + .1 * s); ctx.quadraticCurveTo(bx, by, bx + .28 * s, by - .2 * s); ctx.lineTo(bx + .42 * s, by - .34 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + .05 * s, by); ctx.quadraticCurveTo(bx - .04 * s, by - .2 * s, bx - .06 * s, by - .4 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by + .05 * s); ctx.lineTo(bx - .3 * s, by + .42 * s); ctx.stroke();
    // 빙렬
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = .8;
    for (let i = 0; i < 7; i++) { const y = top + vh * (.15 + i * .11); ctx.beginPath(); ctx.moveTo(cx - mr * .6, y); ctx.lineTo(cx + mr * (.5 - i * .1), y + mr * .18); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "rgba(20,50,55,.5)"; ctx.lineWidth = 1.2; ctx.stroke();
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
  "51"(ctx, W, H, a) {                       // (vault) helios — boiling star, corona, prominence
    ctx.fillStyle = "#030204"; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.52, R = Math.min(W, H) * 0.30;
    ctx.globalCompositeOperation = "lighter";
    // corona streamers
    for (let i = 0; i < 26; i++) {
      const th = (i / 26) * Math.PI * 2, len = R * (1.35 + 0.55 * Math.abs(Math.sin(i * 7.3)));
      const g = ctx.createLinearGradient(cx + Math.cos(th) * R, cy + Math.sin(th) * R, cx + Math.cos(th) * len, cy + Math.sin(th) * len);
      g.addColorStop(0, "rgba(255,150,90,0.30)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(th) * R * 0.98, cy + Math.sin(th) * R * 0.98);
      ctx.lineTo(cx + Math.cos(th) * len, cy + Math.sin(th) * len); ctx.stroke();
    }
    // photosphere with granulation
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    sg.addColorStop(0, "#fff3d0"); sg.addColorStop(0.55, "#ffb347"); sg.addColorStop(0.9, "#e2571e"); sg.addColorStop(1, "#7a1c08");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(120,30,8,0.35)";
    for (let i = 0; i < 90; i++) {
      const th = Math.sin(i * 12.9) * Math.PI * 2, rr = Math.abs(Math.sin(i * 4.7)) * R * 0.92;
      ctx.beginPath(); ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, 2 + Math.abs(Math.sin(i * 3.1)) * 4, 0, Math.PI * 2); ctx.fill();
    }
    // one erupting prominence arc at the limb
    ctx.strokeStyle = "rgba(255,120,160,0.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + R * 0.82, cy - R * 0.5);
    ctx.bezierCurveTo(cx + R * 1.45, cy - R * 1.05, cx + R * 1.7, cy - R * 0.25, cx + R * 1.12, cy - R * 0.05);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  },
  "52"(ctx, W, H, a) {                       // (vault) fulgur — storm dial, bolt on current-second rod
    ctx.fillStyle = "#070810"; ctx.fillRect(0, 0, W, H);
    // cloud deck
    ctx.fillStyle = "rgba(40,44,70,0.8)";
    for (let i = 0; i < 22; i++) {
      const x = (i / 21) * W, y = H * 0.10 + Math.sin(i * 2.7) * H * 0.05;
      ctx.beginPath(); ctx.arc(x, y, H * (0.09 + Math.abs(Math.sin(i * 1.7)) * 0.05), 0, Math.PI * 2); ctx.fill();
    }
    // arc of rods; first ~40% lit as embers
    const rods = 30, litUpTo = 12;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < rods; i++) {
      const fx = i / (rods - 1), x = W * 0.08 + fx * W * 0.84;
      const arcY = H * 0.78 - Math.sin(fx * Math.PI) * H * 0.10, hgt = H * 0.10;
      ctx.strokeStyle = "rgba(150,160,200,0.5)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, arcY); ctx.lineTo(x, arcY - hgt); ctx.stroke();
      if (i <= litUpTo) {
        const g = ctx.createRadialGradient(x, arcY - hgt, 0, x, arcY - hgt, 7);
        g.addColorStop(0, a + "ee"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, arcY - hgt, 7, 0, Math.PI * 2); ctx.fill();
      }
    }
    // the bolt striking rod #litUpTo — jagged polyline, 2 passes
    const tx = W * 0.08 + (litUpTo / (rods - 1)) * W * 0.84;
    const ty = H * 0.78 - Math.sin((litUpTo / (rods - 1)) * Math.PI) * H * 0.10 - H * 0.10;
    for (const [wdt, col] of [[5, a + "55"], [1.6, "rgba(240,240,255,0.95)"]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wdt;
      ctx.beginPath(); ctx.moveTo(tx + W * 0.05, H * 0.12);
      let px = tx + W * 0.05, py = H * 0.12;
      for (let s = 1; s <= 6; s++) {
        const yy = H * 0.12 + (ty - H * 0.12) * (s / 6);
        const xx = tx + (px - tx) * 0.4 + Math.sin(s * 9.7) * W * 0.03;
        ctx.lineTo(xx, yy); px = xx; py = yy;
      }
      ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  "49"(ctx, W, H, a) {                       // supernova digits — dust numerals, one slot mid-burst
    ctx.fillStyle = "#040308"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const slots = ["1", "2", ":", "4", "7"], y = H * 0.52, dw = W / 7;
    // faint nebula
    const ng = ctx.createRadialGradient(W * 0.5, y, 0, W * 0.5, y, W * 0.45);
    ng.addColorStop(0, a + "14"); ng.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    ctx.font = `800 ${Math.round(H * 0.34)}px ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    slots.forEach((ch, i) => {
      const x = dw * (i + 1.5);
      if (i === 3) {                          // this slot is mid-supernova: scattered dust + ring
        for (let p = 0; p < 90; p++) {
          const th = Math.sin(p * 12.9) * Math.PI * 2, rr = Math.abs(Math.sin(p * 5.3)) * dw * 0.9;
          ctx.fillStyle = p % 3 ? a + "cc" : "rgba(255,245,230,0.9)";
          ctx.fillRect(x + Math.cos(th) * rr, y + Math.sin(th) * rr * 1.3, 1.6, 1.6);
        }
        ctx.strokeStyle = a + "66"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, dw * 0.75, 0, Math.PI * 2); ctx.stroke();
      } else {                                // crisp dust glyph
        ctx.fillStyle = "rgba(255,244,235,0.85)";
        ctx.fillText(ch, x, y);
        ctx.fillStyle = a + "33";
        ctx.fillText(ch, x, y + 1.5);
      }
    });
    ctx.globalCompositeOperation = "source-over";
  },
  "53"(ctx, W, H, a) {                       // (vault) aurora meridian — folded curtains over a ridge
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#04040c"); bg.addColorStop(1, "#0a0d18");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(200,215,255,0.7)";
    for (let i = 0; i < 40; i++) ctx.fillRect((Math.sin(i * 12.9) * 0.5 + 0.5) * W, (Math.sin(i * 78.2) * 0.5 + 0.5) * H * 0.7, 1.1, 1.1);
    ctx.globalCompositeOperation = "lighter";
    // folded curtain: vertical emission strips along a wandering ribbon
    for (let i = 0; i < 90; i++) {
      const fx = i / 89, x = fx * W;
      const fold = Math.sin(fx * 9 + 1.2) * 0.5 + Math.sin(fx * 23) * 0.22;
      const base = H * (0.52 + fold * 0.10), top = base - H * (0.34 + fold * 0.08);
      const g = ctx.createLinearGradient(0, base, 0, top);
      const hue = fold > 0.2 ? a : "#42e8a0";
      g.addColorStop(0, hue + "cc"); g.addColorStop(0.35, "#42e8a066"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x, top, W / 88 + 1, base - top);
    }
    ctx.globalCompositeOperation = "source-over";
    // mountain silhouette + faint reflection
    ctx.fillStyle = "#05060a";
    ctx.beginPath(); ctx.moveTo(0, H * 0.88);
    for (let i = 0; i <= 20; i++) ctx.lineTo((i / 20) * W, H * 0.88 - Math.abs(Math.sin(i * 2.3)) * H * 0.06);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = "rgba(66,232,160,0.08)"; ctx.fillRect(0, H * 0.9, W, H * 0.1);
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

buildNav();
wire();
handleHash();
