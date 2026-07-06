// ============================================================================
//  53 · Aurora Meridian (수장고/vault — 비공개 보관) (오로라 자오선) — the polar sky as a clock  [raw WebGL]
//  A curtain of light over a polar night IS a timepiece. One full-screen GLSL
//  fragment shader marches ~18 depth layers of fbm-domain-warped curtain ridges;
//  each layer emits with a crisp lower edge and an exponential fade upward, and
//  the layers accumulate additively into folding, ribbon-like drapery (not
//  vertical stripes — the ridge coordinate itself is warped by a first fbm pass).
//    SECONDS — every tick a luminous ripple (uRipple envelope) sweeps the ribbon
//              left→right, its position driven by uPhase = ms/1000.
//    MINUTE  — the GRAND SURGE (uSurge): the whole sky brightens, fold amplitude
//              swells, an extra sinusoidal whip warps the curtain, and uSeed
//              slides forward so the sky settles into a newly-seeded fold
//              pattern — visibly reborn each minute.
//    HOURS   — uDay (h + m/60) drifts the palette across the night: early-evening
//              emerald/teal → midnight violet-magenta (wing accent #ff4fd8) →
//              pre-dawn crimson top edge; daytime falls back to a dim green-teal.
//  Below: a hash-grid starfield with twinkle, an fbm mountain/treeline
//  silhouette, and a dim vertically-mirrored aurora reflection on the ice.
//  Drag pans yaw/pitch (smoothed targets, 21 pattern); click bursts light where
//  the cursor meets the curtain (uBurst + uBurstPos). HH:MM:SS floats top-centre
//  as a raw DOM pill (29 pattern), with a 12/24h toggle (46 pattern).
//  Rendered at reduced internal resolution (q≈0.6); CSS upscales.
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uRot;        // camera yaw / pitch (world-space pan)
uniform float uCurtain;    // fold amplitude
uniform float uSpeed;      // drift speed
uniform float uGlow;       // emission gain
uniform float uRipple;     // per-second ripple envelope 0..1
uniform float uPhase;      // ms/1000 — pulse position runs left→right
uniform float uSurge;      // minute-rollover grand-surge envelope 0..1
uniform float uSeed;       // fold-pattern seed; slides during the surge
uniform float uBurst;      // click burst envelope 0..1
uniform vec2  uBurstPos;   // burst centre in world space
uniform float uDay;        // h + m/60 (0..24) — night palette crossing
uniform vec3  uAccent;     // wing accent #ff4fd8

#define LAYERS 18

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i),               b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// cheap 3-octave fbm — the whole curtain lives on this
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<3;i++){ v += a*vnoise(p); p = p*2.03 + vec2(19.1,7.3); a *= 0.5; }
  return v;   // ~0..0.875
}

// smooth bump around hour c (width w) on the 24h circle
float dayBump(float d, float c, float w){
  float cd = abs(mod(d - c + 12.0, 24.0) - 12.0);
  return 1.0 - smoothstep(0.0, w, cd);
}

// night palette: two-stop gradient (bottom / top of curtain), blended over uDay
void palette(out vec3 bot, out vec3 top){
  float wE = dayBump(uDay, 19.5, 3.5);   // early evening — emerald / teal
  float wM = dayBump(uDay,  0.5, 3.5);   // midnight — violet / magenta (accent)
  float wP = dayBump(uDay,  4.5, 2.5);   // pre-dawn — crimson top edge
  float wB = 0.25;                       // ever-present dim green-teal base
  float tot = wE + wM + wP + wB;
  vec3 botE = vec3(0.10,0.95,0.38),                       topE = vec3(0.00,0.48,0.55);
  vec3 botM = mix(vec3(1.0,0.31,0.85), uAccent*1.15,0.5), topM = vec3(0.40,0.16,0.95);
  vec3 botP = vec3(0.30,0.80,0.35),                       topP = vec3(0.95,0.12,0.22);
  vec3 botB = vec3(0.06,0.50,0.32),                       topB = vec3(0.02,0.24,0.30);
  bot = (botE*wE + botM*wM + botP*wP + botB*wB) / tot;
  top = (topE*wE + topM*wM + topP*wP + topB*wB) / tot;
}

// the whole sky (stars + aurora) at a world-space point; the ice reflection
// calls this once with a mirrored y, so every pixel pays for ONE evaluation.
vec3 sky(vec2 sp, float aspect){
  // deep polar-night gradient (darker at zenith)
  vec3 col = mix(vec3(0.014,0.022,0.048), vec3(0.002,0.004,0.012),
                 clamp(sp.y + 0.5, 0.0, 1.0));

  // --- starfield: 3 magnitude classes of gaussian point-stars ----------------
  // tiny dust (many, dim) / mid stars / rare bright ones with diffraction
  // spikes. Random in-cell offsets kill the lattice feel; slight colour
  // temperature per star; a faint milky-way haze band behind everything.
  vec2 su = vec2(sp.x + uRot.x*0.25, sp.y);
  {
    // milky way: soft fbm dust band slanting through the sky
    float band = exp(-pow((sp.y - 0.55 + su.x*0.18)*2.6, 2.0));
    float dust = fbm(su*3.1 + vec2(7.7, 2.2));
    col += vec3(0.55,0.62,0.80) * band * smoothstep(0.35, 0.85, dust) * 0.05;
  }
  for(int i=0;i<3;i++){
    float fi = float(i);
    float sc  = 90.0 - fi*30.0;                          // 90 / 60 / 30 cells
    float thr = (i==0) ? 0.90 : ((i==1) ? 0.965 : 0.990); // dust common → bright rare
    vec2 g  = su*sc + fi*13.7;
    vec2 id = floor(g);
    float h = hash(id);
    if(h > thr){
      // random offset inside the cell so stars never align to a grid
      vec2 f = fract(g) - 0.5 + (vec2(hash(id+5.1), hash(id+9.3)) - 0.5)*0.72;
      float m  = (h-thr)/(1.0-thr);
      float d2 = dot(f,f);
      float tw = 0.78 + 0.22*sin(uTime*(0.6 + h*3.0) + h*40.0);
      vec3 tint = mix(vec3(0.70,0.79,1.0), vec3(1.0,0.92,0.80), hash(id+11.7));
      float core = exp(-d2 * ((i==0) ? 220.0 : ((i==1) ? 170.0 : 120.0)));
      float amp  = (i==0) ? 0.38*m : ((i==1) ? 0.85*m : 1.20*m);
      col += tint * core * amp * tw;
      if(i==2){                                          // slim diffraction cross
        float cr = exp(-abs(f.x)*95.0)*exp(-d2*15.0) + exp(-abs(f.y)*95.0)*exp(-d2*15.0);
        col += tint * cr * m * 0.45 * tw;
      }
    }
  }

  // --- aurora: layered curtain march -----------------------------------------
  vec3 bot, top; palette(bot, top);
  float fold  = uCurtain * (1.0 + uSurge*1.4);        // surge swells the folds
  float pulseX = (uPhase - 0.5) * aspect * 1.15;      // seconds pulse sweeps L→R
  float rdx   = (sp.x - pulseX) * 2.4;                // (pow(neg,2.0) is UB in ES)
  float rip   = uRipple * exp(-rdx*rdx);
  vec2  bq    = sp - uBurstPos;
  float burst = uBurst * exp(-dot(bq,bq)*34.0);       // click burst (local)

  vec3 acc = vec3(0.0);
  for(int i=0;i<LAYERS;i++){
    float fi  = float(i)/float(LAYERS-1);             // 0 near … 1 far
    float par = 0.55 + fi*0.5;                        // yaw parallax per depth
    float wx  = (sp.x + uRot.x*par) * (1.5 + fi*0.9);
    float dr  = uTime * uSpeed * (0.06 + fi*0.10);    // per-layer drift

    // fold: first fbm warps the ridge coordinate (ribbon, not stripes);
    // the surge adds a sinusoidal whip on top.
    float w1  = fbm(vec2(wx*0.7 + uSeed, fi*3.1 + dr));
    float w2  = fbm(vec2(wx*1.6 - uSeed*1.3 + w1*2.4, fi*5.0 - dr*0.7));
    float wx2 = wx + (w1 - 0.44)*2.6*fold
              + uSurge*0.5*sin(wx*4.0 + uTime*7.0 + fi*2.5);

    // curtain ridge — bright ribbons where the warped fbm crests
    float r     = fbm(vec2(wx2*1.9 + uSeed*2.7, fi*6.0 + dr*0.5));
    float ridge = pow(smoothstep(0.34, 0.78, r + (w2-0.5)*0.5), 2.0);

    // vertical profile: crisp luminous lower edge → soft exponential fade up
    float edge = -0.16 + fi*0.40 + (w1-0.5)*0.30*fold;
    float hgt  = sp.y - edge;
    float prof = smoothstep(-0.012, 0.03, hgt)
               * exp(-max(hgt, 0.0)*(3.2 - fi*1.1));

    vec3 cc  = mix(bot, top, clamp(hgt*2.1, 0.0, 1.0));   // two-stop gradient
    float em = ridge * prof * (1.0 + rip*1.5 + burst*3.0 + uSurge*0.9);
    acc += cc * em * (1.05/float(LAYERS));
  }
  col += acc * uGlow * 1.6;
  col += bot * burst * 0.35;                    // burst's own soft flash
  col += (bot*0.6 + top*0.4) * uSurge * 0.05;   // surge: whole-sky wash
  return col;
}

void main(){
  float aspect = uRes.x/uRes.y;
  vec2 p = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  float ycam = p.y + uRot.y;                    // pitch tilts the whole view

  // mountain/treeline silhouette ridge + the ice line below it
  const float ICE = -0.335;
  float mx = p.x + uRot.x*1.35;                 // nearest thing → most parallax
  float ridgeY = ICE + 0.015
               + 0.105*fbm(vec2(mx*2.3, 7.7)) * (0.35 + 0.65*fbm(vec2(mx*0.7, 3.1)));

  vec3 col;
  if(ycam < ICE){
    // snow/ice: one dim, shimmer-jittered, vertically-mirrored sky sample
    float shim = (fbm(vec2(p.x*6.0, ycam*14.0 - uTime*0.3)) - 0.5)*0.05;
    col = sky(vec2(p.x + shim, 2.0*ICE - ycam), aspect) * 0.28;
    col = mix(col, vec3(0.015,0.022,0.035), 0.35);
    col *= 0.2 + 0.8*exp(-(ICE - ycam)*3.0);    // fade with distance below line
  } else if(ycam < ridgeY){
    // dark silhouette, with a faint aurora rim light along its top edge
    col = vec3(0.004,0.007,0.012);
    vec3 bot, top; palette(bot, top);
    col += bot * 0.06 * smoothstep(0.02, 0.0, ridgeY - ycam);
  } else {
    col = sky(vec2(p.x, ycam), aspect);
  }

  // tonemap + gentle vignette
  col = col/(col + vec3(0.85));
  col = pow(col, vec3(0.4545));
  vec2 vg = gl_FragCoord.xy/uRes;
  col *= 0.6 + 0.4*pow(16.0*vg.x*vg.y*(1.0-vg.x)*(1.0-vg.y), 0.2);
  gl_FragColor = vec4(col, 1.0);
}`;

export default class AuroraMeridian extends Piece {
  setup() {
    const attrs = { antialias: false, depth: false, alpha: false, powerPreference: "high-performance" };
    const gl = this.canvas.getContext("webgl", attrs) ||
               this.canvas.getContext("experimental-webgl", attrs);
    if (!gl) throw new Error("이 브라우저에서 WebGL을 사용할 수 없습니다. 다른 작품을 감상해 주세요.");
    this.gl = gl;
    this.prog = this._program(VERT, FRAG);
    gl.useProgram(this.prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const n of ["uRes", "uTime", "uRot", "uCurtain", "uSpeed", "uGlow",
                     "uRipple", "uPhase", "uSurge", "uSeed", "uBurst",
                     "uBurstPos", "uDay", "uAccent"]) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }

    // camera (smoothed targets, 21 pattern)
    this.yaw = 0; this.pitch = 0;
    this.targetYaw = 0; this.targetPitch = 0;

    // tunables (sliders)
    this.curtain = 1.0;
    this.speed = 1.0;
    this.glow = 1.0;
    this.h24 = false;

    // clock-driven envelopes — prime the edges so nothing fires on load
    const d = new Date();
    this.lastS = d.getSeconds();
    this.lastM = d.getMinutes();
    this.ripple = 0;               // per-second sweep
    this.surge = 0;                // minute grand surge
    this.burst = 0;                // click burst
    this.burstPos = [0, 0.1];
    this.seed = 13.7;              // fold-pattern seed; slides during the surge

    const [r, g, b] = hexToRgb(this.accent);
    this.accentRgb = [r / 255, g / 255, b / 255];

    this._sizeGL();
    this._makeReadout();
  }

  _program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error("shader compile: " + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }

  _sizeGL() {
    // ~120 noise taps per pixel → render at reduced resolution, CSS upscales
    const q = 0.6;
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr * q));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr * q));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  // ---- floating HH:MM:SS readout (raw DOM, 29 pattern; removed in teardown) --
  _makeReadout() {
    const wrap = this.canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute", left: "50%", top: "16px", transform: "translateX(-50%)",
      padding: "8px 18px", zIndex: "11", pointerEvents: "none",
      background: "rgba(6,10,16,0.55)", color: "#e9eef8",
      border: "1px solid rgba(255,255,255,0.10)", borderRadius: "999px",
      font: "500 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
      letterSpacing: "0.22em", textAlign: "center",
      textShadow: `0 0 12px ${this.accent}55`,
    });
    wrap.appendChild(el);
    this._readout = el;
    this._lastStr = "";
  }

  _readStr(h, m, s) {
    const pad = (n) => String(n).padStart(2, "0");
    if (this.h24) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    const ap = h < 12 ? "AM" : "PM";
    let hd = h % 12; if (hd === 0) hd = 12;
    return `${pad(hd)}:${pad(m)}:${pad(s)} ${ap}`;
  }

  // click → local burst of light where the cursor meets the curtain
  onPointerDown() {
    // pointer (CSS px, y-down) → shader world space p=(x-w/2)/h, y-up, + pitch
    this.burstPos = [
      (this.pointer.x - this.w / 2) / this.h,
      (this.h / 2 - this.pointer.y) / this.h + this.pitch,
    ];
    this.burst = 1;
  }

  frame(dt, t) {
    const gl = this.gl;

    // --- camera: drag pans yaw, tilts pitch (grab-the-sky feel) ---------------
    if (this.pointer.down && this.pointer.active) {
      this.targetYaw -= this.pointer.vx * 0.0016;
      this.targetPitch = clamp(this.targetPitch + this.pointer.vy * 0.0016, -0.22, 0.30);
    }
    this.yaw += (this.targetYaw - this.yaw) * 0.07;
    this.pitch += (this.targetPitch - this.pitch) * 0.07;

    // --- clock: edges → envelopes ---------------------------------------------
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();
    if (s !== this.lastS) {
      this.lastS = s;
      this.ripple = 1;                                  // seconds sweep
      if (m !== this.lastM) { this.lastM = m; this.surge = 1; }   // GRAND SURGE
    }
    // during the surge the seed slides → the sky settles into a NEW fold pattern
    this.seed += dt * this.surge * 2.6;
    this.ripple = Math.max(0, this.ripple - dt * 1.15);
    this.surge = Math.max(0, this.surge - dt * 0.5);
    this.burst = Math.max(0, this.burst - dt * 1.4);

    // --- readout (textContent only when the string changes) -------------------
    const str = this._readStr(h, m, s);
    if (str !== this._lastStr) { this._lastStr = str; this._readout.textContent = str; }

    // --- draw ------------------------------------------------------------------
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform2f(this.u.uRot, this.yaw, this.pitch);
    gl.uniform1f(this.u.uCurtain, this.curtain);
    gl.uniform1f(this.u.uSpeed, this.speed);
    gl.uniform1f(this.u.uGlow, this.glow);
    gl.uniform1f(this.u.uRipple, this.ripple);
    gl.uniform1f(this.u.uPhase, ms / 1000);
    gl.uniform1f(this.u.uSurge, this.surge);
    gl.uniform1f(this.u.uSeed, this.seed);
    gl.uniform1f(this.u.uBurst, this.burst);
    gl.uniform2f(this.u.uBurstPos, this.burstPos[0], this.burstPos[1]);
    gl.uniform1f(this.u.uDay, h + m / 60 + s / 3600);
    gl.uniform3f(this.u.uAccent, this.accentRgb[0], this.accentRgb[1], this.accentRgb[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() {
    if (this._readout) { this._readout.remove(); this._readout = null; }
    if (this.gl && this.prog) this.gl.deleteProgram(this.prog);
  }

  controls(host) {
    host.appendChild(slider("CURTAIN", 0.2, 2.2, this.curtain, 0.02, (v) => (this.curtain = v)));
    host.appendChild(slider("SPEED", 0.1, 3.0, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(slider("GLOW", 0.3, 2.2, this.glow, 0.02, (v) => (this.glow = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }

  _setMode(h24, el) {
    this.h24 = h24;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
