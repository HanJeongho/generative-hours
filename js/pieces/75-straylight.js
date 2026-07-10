// ============================================================================
//  75 · Stray Light (길 잃은 빛) — 여기 있어선 안 될 빛 [raw WebGL / GLSL]
//  하늘은 한낮이 아니라 깊은 우주다. 별이 흩뿌려지고 성운이 희미하게 떠 있는
//  검은 천장 — 그런데 그 우주에서, 구름 틈으로 새어들듯, 볼류메트릭 태양광
//  기둥(crepuscular rays)이 쏟아져 내린다. 빛은 어두운 벌판 전체가 아니라
//  틈 아래의 일부 구역만 적신다. 있어선 안 되는 곳의 빛 — 그래서 몽환적이다.
//  · 빛기둥은 프리즘처럼 분광한다. 기둥 중심은 따뜻한 태양색, 가장자리로
//    갈수록 스펙트럼이 갈라져 붉고 푸른 테두리를 남긴다(색수차=프리즘).
//  · 09의 풀스크린 프래그먼트 셰이더 패턴을 계승한다. 레이마칭 대신 2D
//    볼류메트릭 근사 — 각 틈이 만드는 광선 프로파일(가우시안)을 대기 노이즈로
//    변조해 누적하고, 지면에 닿는 빛 웅덩이를 따로 적분한다. 틈의 위치·폭은
//    유니폼 배열로 넘겨 프레임마다 갱신 → 무거운 루프 없이 60fps.
//  · 지면에 닿은 빛 웅덩이 속에서만 먼지 모트가 반짝인다(빛이 없는 곳은
//    어둠뿐 — 먼지는 빛을 만나야 비로소 보인다).
//  인터랙션: 드래그 = 틈을 끌어 옮기기(빛기둥과 벌판의 밝은 구역이 따라온다)
//  · 클릭 = 빈 하늘에 새 틈이 서서히 벌어짐 · RAYS = 틈의 수 · DISPERSION =
//  분광의 강도.
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider } from "./01-currents.js";

const MAXGAPS = 10;

const VERT = `
attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
#define MAXGAPS 10
#define SHEAR 0.09
uniform vec2  uRes;
uniform float uTime;
uniform int   uGapCount;
uniform float uGapX[MAXGAPS];
uniform float uGapW[MAXGAPS];
uniform float uDispersion;
uniform vec3  uAccent;

float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm2(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*noise2(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 p = gl_FragCoord.xy / uRes;      // 0..1, y up
  float aspect = uRes.x / uRes.y;
  vec2 ap = vec2(p.x*aspect, p.y);
  float hY = 0.30;                      // horizon: ground occupies lower 30%

  // ---------------- deep space sky + dark field ----------------
  vec3 top = vec3(0.02, 0.03, 0.06);
  vec3 mid = vec3(0.05, 0.05, 0.11);
  vec3 skyCol = mix(mid, top, smoothstep(hY, 1.0, p.y));
  // faint nebula
  float neb = pow(fbm2(vec2(p.x*2.2, p.y*2.2) + vec2(uTime*0.010, 0.0)), 2.0);
  vec3 nebCol = mix(vec3(0.11,0.06,0.17), vec3(0.04,0.10,0.17), fbm2(p*3.0 + 7.0));
  skyCol += nebCol * neb * 0.55 * smoothstep(hY, 1.0, p.y);
  // stars — two layers, twinkling
  float st = 0.0;
  {
    vec2 sp = ap*26.0; vec2 c = floor(sp), f = fract(sp);
    if(hash21(c+1.7) > 0.86){
      vec2 pos = vec2(hash21(c+2.1), hash21(c+3.7));
      float dd = length(f-pos);
      st += smoothstep(0.13,0.0,dd) * (0.6+0.4*sin(uTime*2.5 + hash21(c)*40.0));
    }
    vec2 sp2 = ap*52.0; vec2 c2 = floor(sp2), f2 = fract(sp2);
    if(hash21(c2+5.3) > 0.93){
      vec2 pos = vec2(hash21(c2+2.9), hash21(c2+4.2));
      st += smoothstep(0.09,0.0,length(f2-pos)) * 0.7;
    }
  }
  skyCol += vec3(0.90,0.93,1.0) * st * smoothstep(hY-0.02, hY+0.06, p.y);

  // ground base — dark rocky field
  float grn = fbm2(vec2(p.x*8.0, p.y*24.0));
  vec3 groundCol = mix(vec3(0.010,0.010,0.016), vec3(0.032,0.032,0.038), grn);

  vec3 col = mix(groundCol, skyCol, smoothstep(hY-0.01, hY+0.01, p.y));
  // cloud lid at the very top — the ceiling the light should not pass
  col *= 1.0 - 0.5*smoothstep(0.88, 1.0, p.y);

  // ---------------- stray light ----------------
  float vol   = 0.55 + 0.45*fbm2(vec2(p.x*6.0 + uTime*0.05, p.y*3.0 - uTime*0.08));
  float above = smoothstep(hY-0.02, hY+0.12, p.y);
  float below = 1.0 - smoothstep(hY-0.03, hY+0.01, p.y);
  float vpTop = 0.30 + 0.70*exp(-(1.0-p.y)*1.25);

  // dust-mote field (only revealed where a pool lights it)
  float mote = 0.0;
  {
    vec2 mp = vec2(p.x*aspect*90.0, p.y*90.0) + vec2(sin(uTime*0.3)*0.5, uTime*0.6);
    vec2 c = floor(mp), f = fract(mp);
    float h = hash21(c);
    if(h > 0.82) mote = smoothstep(0.4,0.0,length(f-0.5)) * (0.5+0.5*sin(uTime*6.0 + h*50.0));
  }

  vec3 lightAir = vec3(0.0);
  vec3 lightGround = vec3(0.0);
  float poolTotal = 0.0;
  float d = uDispersion;
  vec3 warm = mix(vec3(1.0), uAccent, 0.55);

  for(int i=0;i<MAXGAPS;i++){
    if(i >= uGapCount) break;
    float gw = uGapW[i];
    if(gw <= 0.0001) continue;
    float gx = uGapX[i];

    // volumetric shaft in the air (widens as it descends)
    float bx = gx + SHEAR*(1.0 - p.y);
    float sw = gw*(0.55 + 1.4*(1.0 - p.y));
    float sc = (p.x - bx)/sw;
    float dd = d*0.6;
    vec3 sI = vec3(exp(-(sc-dd)*(sc-dd)*3.0), exp(-sc*sc*3.0), exp(-(sc+dd)*(sc+dd)*3.0));
    lightAir += warm * sI * (vol*vpTop*above);

    // bright burst where light bursts through the gap
    float ob = exp(-(p.x-gx)*(p.x-gx)/(2.0*gw*gw)) * exp(-(1.0-p.y)*9.0);
    lightAir += warm * ob * 1.2;

    // pool where the shaft strikes the ground
    float gh = gx + SHEAR*(1.0 - hY);
    float pw = gw*1.3;
    float pc = (p.x - gh)/pw;
    float pdd = d*0.9;
    vec3 pI = vec3(exp(-(pc-pdd)*(pc-pdd)*2.2), exp(-pc*pc*2.2), exp(-(pc+pdd)*(pc+pdd)*2.2));
    float pAtt = exp(-(hY - p.y)*2.4) * below;
    lightGround += warm * pI * pAtt;
    poolTotal  += pI.g * pAtt;
  }

  col += lightAir * 0.9;
  col += lightGround * 1.1;
  col += warm * mote * clamp(poolTotal, 0.0, 1.0) * 1.4;

  // tonemap + gamma
  col = col/(col+vec3(1.0));
  col = pow(col, vec3(0.4545));
  // vignette
  col *= 0.55 + 0.45*pow(16.0*p.x*p.y*(1.0-p.x)*(1.0-p.y), 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

export default class StrayLight extends Piece {
  setup() {
    const attrs = { antialias: false, depth: false, alpha: false, powerPreference: "high-performance" };
    const gl =
      this.canvas.getContext("webgl", attrs) ||
      this.canvas.getContext("experimental-webgl", attrs);
    if (!gl) throw new Error("이 브라우저에서 WebGL을 사용할 수 없습니다. 다른 작품을 감상해 주세요.");
    this.gl = gl;

    const prog = this._program(VERT, FRAG);
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      count: gl.getUniformLocation(prog, "uGapCount"),
      gapX: gl.getUniformLocation(prog, "uGapX[0]"),
      gapW: gl.getUniformLocation(prog, "uGapW[0]"),
      disp: gl.getUniformLocation(prog, "uDispersion"),
      accent: gl.getUniformLocation(prog, "uAccent"),
    };

    // state
    this._baseW = 0.06;
    this.rays = 3;                 // last RAYS-slider target
    this.dispersion = 0.5;
    this.gaps = [];
    for (const x of [0.28, 0.5, 0.72]) this._openGap(x, true);
    this._drag = null;

    this._gxArr = new Float32Array(MAXGAPS);
    this._gwArr = new Float32Array(MAXGAPS);

    const [r, g, b] = hexToRgb(this.accent);
    this.accentRgb = [r / 255, g / 255, b / 255];

    this._sizeGL();
    this._addCaption();
  }

  // 하단 시적 캡션 — WebGL 캔버스라 DOM 오버레이로 얹고 teardown에서 정리
  _addCaption() {
    const el = document.createElement("div");
    el.textContent = "이 빛은 여기 올 수 없다 — 그래서 아름답다";
    el.style.cssText =
      "position:absolute;left:0;right:0;bottom:20px;text-align:center;" +
      "font:500 13px ui-monospace,Menlo,monospace;letter-spacing:.14em;" +
      "color:rgba(255,210,124,0.55);pointer-events:none;z-index:5;" +
      "text-shadow:0 0 18px rgba(255,180,90,0.35);";
    (this.canvas.parentNode || document.body).appendChild(el);
    this._caption = el;
  }

  _program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error("shader: " + gl.getShaderInfoLog(s));
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
    const q = 0.85;              // reduced resolution; CSS scales up
    this.canvas.width = Math.round(this.w * this.dpr * q);
    this.canvas.height = Math.round(this.h * this.dpr * q);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  // ---- gaps ------------------------------------------------------------------
  _activeGaps() { return this.gaps.filter((g) => !g.closing); }
  _openGap(nx, instant) {
    if (this._activeGaps().length >= MAXGAPS) return;
    this.gaps.push({ x: clamp(nx, 0.02, 0.98), w: instant ? this._baseW : 0.004, tw: this._baseW, closing: false });
  }
  _nearestGap(nx) {
    let best = null, bd = 0.075;
    for (const g of this.gaps) {
      if (g.closing) continue;
      const dd = Math.abs(g.x - nx);
      if (dd < bd) { bd = dd; best = g; }
    }
    return best;
  }
  _setRays(v) {
    this.rays = v;
    const target = Math.round(v);
    const active = this._activeGaps();
    if (active.length < target) {
      for (let i = active.length; i < target; i++) this._openGap(0.12 + Math.random() * 0.76);
    } else if (active.length > target) {
      for (let i = 0; i < active.length - target; i++) {
        const g = active[active.length - 1 - i];   // close newest first
        g.closing = true; g.tw = 0;
      }
    }
  }

  // ---- interaction -----------------------------------------------------------
  onPointerDown() {
    this._drag = this._nearestGap(this.pointer.x / this.w);
  }
  onPointerUp() {
    if (!this._drag) this._openGap(this.pointer.x / this.w);   // click empty sky → new gap
    this._drag = null;
  }

  frame(dt, t) {
    const gl = this.gl;

    // drag a gap
    if (this.pointer.down && this._drag) {
      this._drag.x = clamp(this.pointer.x / this.w, 0.02, 0.98);
    }
    // ease widths; retire fully-closed gaps
    for (let i = this.gaps.length - 1; i >= 0; i--) {
      const g = this.gaps[i];
      g.w += (g.tw - g.w) * Math.min(1, dt * 3.5);
      if (g.closing && g.w < 0.002) this.gaps.splice(i, 1);
    }

    // pack uniform arrays
    const n = Math.min(this.gaps.length, MAXGAPS);
    for (let i = 0; i < n; i++) { this._gxArr[i] = this.gaps[i].x; this._gwArr[i] = this.gaps[i].w; }

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform1i(this.u.count, n);
    gl.uniform1fv(this.u.gapX, this._gxArr);
    gl.uniform1fv(this.u.gapW, this._gwArr);
    gl.uniform1f(this.u.disp, this.dispersion);
    gl.uniform3f(this.u.accent, ...this.accentRgb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() {
    if (this._caption) { this._caption.remove(); this._caption = null; }
    const gl = this.gl;
    if (gl && this.prog) gl.deleteProgram(this.prog);
  }

  controls(host) {
    host.appendChild(slider("RAYS 틈", 1, 8, this.rays, 1, (v) => this._setRays(v), (v) => String(Math.round(v))));
    host.appendChild(slider("DISPERSION 분광", 0, 1, this.dispersion, 0.02, (v) => (this.dispersion = v)));
  }
}
