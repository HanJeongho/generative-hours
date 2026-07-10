// ============================================================================
//  69 · The Worn Step (닳는 자리) — 발자국 하나는 힘이 없다 [Canvas2D]
//  철학: "발자국 하나로는 돌이 닳지 않는다. 그런데 오래된 계단은, 한가운데가
//  패여 있다." — 큰 변화는 늘, 느낄 수 없는 하루들의 합이다.
//  구현: 낮게 스치는 빛을 받는 회색 돌판(Float32 높이맵 192² → 유한차분 법선
//  → 램버트+스페큘러 셰이딩, 오프스크린 ImageData에 직접 기록). 한가운데는
//  수백만 번의 사전 마모로 이미 매끈하게 파여 있고(시드), 골엔 실제 시각의
//  태양 고도를 따라 미끄러지는 꿀빛 온기 띠가 고인다. 구석엔 비문처럼 새겨진
//  누적 눌림 횟수.
//  인터랙션: 누르고 문지른다 — 한 번의 누름은 먼지만 일 뿐 눈에 보이는 자국을
//  남기지 못한다(가우시안 감산 1회 = 시각 역치 아래). 그러나 그 모든 누름은
//  높이맵과 localStorage(gh69-)에 영구히 적립된다. 웅덩이는 깊어지기만 하고,
//  결코 회복되지 않는다 — 45 만다라(정시마다 전부 쓸림)의 정반대.
// ============================================================================

import { Piece, clamp, lerp, rand, TAU } from "../engine.js";

const N = 192;                       // heightmap resolution
const BASE_COUNT = 2841077;          // the millions who pressed before you

export default class WornStep extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");

    // ---- heightmap: 0 = intact surface, positive = worn depth ---------------
    this.hm = new Float32Array(N * N);
    this.myPresses = 0;
    this.count = BASE_COUNT;

    // stone micro-grain (albedo speckle), fixed per session
    this.grain = new Float32Array(N * N);
    let sd = 4242;
    const prand = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < N * N; i++) this.grain[i] = 0.86 + prand() * 0.28;
    // a few darker mottles
    for (let m = 0; m < 26; m++) {
      const mx = prand() * N, my = prand() * N, mr = 6 + prand() * 22, mk = 0.06 + prand() * 0.10;
      for (let y = Math.max(0, my - mr | 0); y < Math.min(N, my + mr); y++)
        for (let x = Math.max(0, mx - mr | 0); x < Math.min(N, mx + mr); x++) {
          const d = Math.hypot(x - mx, y - my) / mr;
          if (d < 1) this.grain[y * N + x] *= 1 - mk * (1 - d * d);
        }
    }

    // ---- historical wear: the hollow the unseen millions made ---------------
    // (loaded from storage when present, else seeded — then only ever deepens)
    let restored = false;
    try {
      const raw = localStorage.getItem("gh69-wear");
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.hm && o.hm.length === 48 * 48) {
          // upsample the stored 48² wear back into the working map (bilinear)
          for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
              const u = (x / (N - 1)) * 47, v = (y / (N - 1)) * 47;
              const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
              const x1 = Math.min(47, x0 + 1), y1 = Math.min(47, y0 + 1);
              const h =
                o.hm[y0 * 48 + x0] * (1 - fx) * (1 - fy) + o.hm[y0 * 48 + x1] * fx * (1 - fy) +
                o.hm[y1 * 48 + x0] * (1 - fx) * fy + o.hm[y1 * 48 + x1] * fx * fy;
              this.hm[y * N + x] = h;
            }
          this.count = o.count || BASE_COUNT;
          restored = true;
        }
      }
    } catch (e) { /* storage unavailable — the stone still stands */ }
    if (!restored) {
      // seed the ancient hollow: a broad, slightly off-centre basin with
      // asymmetric lobes — the shape real steps wear into
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const dx = (x - N * 0.5) / (N * 0.30), dy = (y - N * 0.54) / (N * 0.22);
          let h = Math.exp(-(dx * dx + dy * dy)) * 1.0;
          const dx2 = (x - N * 0.38) / (N * 0.16), dy2 = (y - N * 0.5) / (N * 0.14);
          h += Math.exp(-(dx2 * dx2 + dy2 * dy2)) * 0.35;
          const dx3 = (x - N * 0.63) / (N * 0.17), dy3 = (y - N * 0.58) / (N * 0.15);
          h += Math.exp(-(dx3 * dx3 + dy3 * dy3)) * 0.3;
          this.hm[y * N + x] = h;
        }
    }

    this._makeBuf();
    this.dust = [];
    for (let i = 0; i < 90; i++) this.dust.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    this._saveT = 0;
    this._pressGlow = 0;
    this._sessionAdds = 0;   // presses this visit, shown beside the epitaph
  }

  onResize() { this._makeBuf(); }
  _makeBuf() {
    // the stone is rendered into a fixed-size buffer, scaled to the screen
    this.img = this.ctx.createImageData(N, N);
    this.off = document.createElement("canvas");
    this.off.width = N; this.off.height = N;
    this.og = this.off.getContext("2d");
  }

  // press: an imperceptible gaussian subtraction — one touch is below the
  // threshold of sight; only the sum of thousands ever shows
  _press(px, py, strength) {
    const sx = ((px - this.x0) / this.sw) * N;
    const sy = ((py - this.y0) / this.sh) * N;
    if (sx < 2 || sx > N - 2 || sy < 2 || sy > N - 2) return;
    const r = 7;
    for (let y = Math.max(0, sy - r | 0); y < Math.min(N, sy + r); y++)
      for (let x = Math.max(0, sx - r | 0); x < Math.min(N, sx + r); x++) {
        const d2 = ((x - sx) ** 2 + (y - sy) ** 2) / (r * r * 0.4);
        this.hm[y * N + x] += Math.exp(-d2) * 0.00012 * strength;   // ~1/8000 of the hollow
      }
    this.count++; this.myPresses++; this._sessionAdds++;
    this._pressGlow = 1;
    // a whisper of golden dust — the only immediate acknowledgement
    for (let i = 0; i < 3; i++) {
      const p = this.dust.find((q) => !q.on);
      if (!p) break;
      p.on = true; p.x = px + rand(-6, 6); p.y = py + rand(-4, 2);
      p.vx = rand(-14, 14); p.vy = rand(-30, -8); p.life = rand(0.4, 0.9);
    }
    this._saveT = 1.5;   // debounce persistence
  }

  _save() {
    try {
      const small = new Array(48 * 48);
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 48; x++) {
          const sx = Math.round((x / 47) * (N - 1)), sy = Math.round((y / 47) * (N - 1));
          small[y * 48 + x] = Math.round(this.hm[sy * N + sx] * 10000) / 10000;
        }
      localStorage.setItem("gh69-wear", JSON.stringify({ hm: small, count: this.count }));
    } catch (e) { /* quota/unavailable — this visit simply won't outlive the page */ }
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;

    // stone plate geometry on screen
    const S = Math.min(W * 0.72, H * 0.8);
    this.sw = S * 1.18; this.sh = S;
    this.x0 = (W - this.sw) / 2; this.y0 = (H - this.sh) / 2;

    // pressing / rubbing
    if (this.pointer.down && this.pointer.active) {
      const speed = Math.abs(this.pointer.vx) + Math.abs(this.pointer.vy);
      this._press(this.pointer.x, this.pointer.y, 1 + Math.min(2, speed * 0.02));
    }
    this._pressGlow = Math.max(0, this._pressGlow - dt * 3);
    if (this._saveT > 0) { this._saveT -= dt; if (this._saveT <= 0) this._save(); }

    // ---- light: a low grazing sun that follows the real hour -----------------
    const d = new Date();
    const hFrac = (d.getHours() + d.getMinutes() / 60) / 24;
    const sunA = hFrac * TAU - Math.PI * 0.5;          // sweeps once a day
    const lx = Math.cos(sunA), ly = Math.sin(sunA) * 0.6, lz = 0.5;
    const ln = Math.hypot(lx, ly, lz);

    // ---- shade the stone into the ImageData ----------------------------------
    const px = this.img.data, hm = this.hm, gr = this.grain;
    const depthK = 26;                                  // height→normal scale
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        const ddx = (hm[i + 1] - hm[i - 1]) * depthK;
        const ddy = (hm[i + N] - hm[i - N]) * depthK;
        const inv = 1 / Math.hypot(ddx, ddy, 1);
        const nx = ddx * inv, ny = ddy * inv, nz = inv;
        let lam = (nx * lx + ny * ly + nz * lz) / ln;
        lam = lam < 0 ? 0 : lam;
        // worn stone is smoother → tighter, brighter specular
        const depth = hm[i];
        const gloss = clamp(depth * 0.9, 0, 1);
        const spec = Math.pow(lam, 6 + gloss * 26) * (0.12 + gloss * 0.55);
        // base albedo: grey stone, honey-warmed in the hollow
        const g0 = gr[i];
        let r = (92 * g0 + depth * 26) * (0.45 + lam * 0.75) + spec * 235;
        let gg = (90 * g0 + depth * 18) * (0.45 + lam * 0.75) + spec * 225;
        let b = (86 * g0 + depth * 6) * (0.45 + lam * 0.75) + spec * 200;
        const o = i * 4;
        px[o] = r > 255 ? 255 : r;
        px[o + 1] = gg > 255 ? 255 : gg;
        px[o + 2] = b > 255 ? 255 : b;
        px[o + 3] = 255;
      }
    }
    this.og.putImageData(this.img, 0, 0);

    // ---- room ------------------------------------------------------------------
    g.fillStyle = "#111013"; g.fillRect(0, 0, W, H);
    const amb = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
    amb.addColorStop(0, "rgba(70,64,58,0.30)"); amb.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = amb; g.fillRect(0, 0, W, H);

    // plate shadow + the stone
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    g.ellipse(W / 2, this.y0 + this.sh + 12, this.sw * 0.52, 18, 0, 0, TAU);
    g.fill();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.off, this.x0, this.y0, this.sw, this.sh);
    // chiselled edge
    g.strokeStyle = "rgba(20,18,16,0.8)"; g.lineWidth = 3;
    g.strokeRect(this.x0, this.y0, this.sw, this.sh);
    g.strokeStyle = "rgba(255,244,220,0.08)"; g.lineWidth = 1;
    g.strokeRect(this.x0 + 2, this.y0 + 2, this.sw - 4, this.sh - 4);

    // golden dust (the only trace of a single touch — and it, too, settles)
    g.globalCompositeOperation = "lighter";
    for (const p of this.dust) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
      g.fillStyle = `rgba(255,214,140,${clamp(p.life, 0, 1) * 0.55})`;
      g.fillRect(p.x, p.y, 1.6, 1.6);
    }
    g.globalCompositeOperation = "source-over";

    // ---- the epitaph -------------------------------------------------------------
    g.font = `600 ${Math.max(13, H * 0.021)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "rgba(214,206,190,0.72)";
    g.fillText(`${this.count.toLocaleString("ko-KR")}번 눌림`, this.x0 + 4, this.y0 - Math.max(24, H * 0.038));
    g.font = `500 ${Math.max(11, H * 0.016)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = `rgba(255,214,140,${0.35 + this._pressGlow * 0.6})`;
    g.fillText(this._sessionAdds > 0 ? `— 그중 당신의 몫: ${this._sessionAdds}` : "— 아직 당신의 몫은 없다", this.x0 + 4, this.y0 - Math.max(24, H * 0.038) + Math.max(16, H * 0.026));

    // caption
    g.font = `500 ${Math.max(12, H * 0.018)}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillStyle = "rgba(200,192,178,0.55)";
    g.fillText("힘껏 눌러 보세요 — 자국은 보이지 않습니다. 저 웅덩이는 전부 그런 누름으로 파였습니다", W / 2, H - 14);

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
