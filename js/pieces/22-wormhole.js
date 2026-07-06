// ============================================================================
//  22 · Wormhole — an Ellis/Morris-Thorne bridge (WebGL)
//  The same wormhole class used to render Interstellar's. Space is parametrised
//  by a coordinate ℓ that runs from −∞ (our universe) through 0 (the throat) to
//  +∞ (the far universe); the circumferential radius is r(ℓ)=√(ρ²+ℓ²), so the
//  embedding is the classic funnel that narrows to a throat of radius ρ and
//  opens again. Each pixel's light ray is integrated through this geometry; as
//  ℓ passes the throat the ray sees the OTHER universe's sky, lensed into the
//  round "porthole" with a bright Einstein ring around its rim. Fly forward by
//  advancing the camera's ℓ; steer with the cursor.
//
//  Per-pixel lensing of two skies needs a fragment shader — Canvas2D can't do
//  it. Single full-screen GLSL program, zero dependencies (like 09 & 21).
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uEll;       // accumulated travel — scrolls the tunnel walls past us
uniform float uReach;     // 0..1 how far the corridor has EXTENDED (charges on press)
uniform float uTwist;     // how hard the corridor spirals
uniform vec2  uSteer;     // cursor — bends the corridor toward it
uniform vec3  uAccent;    // wing tint

#define PI 3.14159265
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }

// smooth value-noise + fbm — for FLOWING nebula gas on the bore wall (not a grid)
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(7.1,3.7); a*=0.5; }
  return s;
}
// 3D value-noise + fbm — sampled on a CYLINDER (angle→ring, depth→z) so the gas
// wraps the bore with NO seam at ±π (the old 2D u-mapping showed a vertical join).
float hash3(vec3 p){ p=fract(p*vec3(123.34,456.21,289.17)); p+=dot(p,p+45.32); return fract(p.x*p.y*p.z); }
float vnoise3(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float n000=hash3(i), n100=hash3(i+vec3(1,0,0)), n010=hash3(i+vec3(0,1,0)), n110=hash3(i+vec3(1,1,0));
  float n001=hash3(i+vec3(0,0,1)), n101=hash3(i+vec3(1,0,1)), n011=hash3(i+vec3(0,1,1)), n111=hash3(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
}
float fbm3(vec3 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(7.1,3.7,5.3); a*=0.5; }
  return s;
}

// The destination universe glimpsed through the far mouth of the corridor:
// a warm, glowing star-field so the end of the tunnel reads as somewhere to go.
vec3 dest(vec2 p){
  vec3 base = vec3(0.9,0.62,0.32);
  float neb = 0.0, a = 0.5; vec2 q = p*2.6 + 11.0;
  for(int i=0;i<4;i++){ neb += a*hash(floor(q)); q*=2.0; a*=0.5; }
  neb = pow(neb, 2.0);
  vec3 col = mix(vec3(0.01,0.015,0.03), base*0.5, neb);
  for(int i=0;i<3;i++){
    float sc = 80.0 + float(i)*140.0;
    vec2 g = p*sc; vec2 id = floor(g);
    float h = hash(id + float(i)*13.7);
    if(h > 0.975){
      vec2 f = fract(g)-0.5;
      float tw = 0.6 + 0.4*sin(uTime*2.0 + h*40.0);
      col += vec3(1.0,0.9,0.7) * smoothstep(0.45,0.0,length(f)) * tw * 1.4;
    }
  }
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;

  // --- bend the corridor toward the cursor --------------------------------
  // The deep end (screen centre) is displaced toward uSteer the most, while the
  // near walls (screen edge) barely move — so the pipe appears to curve away in
  // the steered direction, like banking down a 3D tube.
  float r0 = length(uv);
  float bendW = 1.0/(1.0 + 6.0*r0*r0);          // 1 at centre → ~0 at edges
  vec2 p = uv - uSteer*bendW;
  float r = max(length(p), 1e-3);
  float a = atan(p.y, p.x);

  // --- map the screen to cylindrical tube coordinates ---------------------
  // v runs DOWN the bore: v = depthScale/r, so equal steps in v are concentric
  // circles that BUNCH UP toward the centre — the textbook cue for looking down
  // a long pipe. uEll scrolls v so the rings rush toward us (flying forward). As
  // uReach grows, depthScale shrinks → the vanishing point pulls far away and the
  // corridor visibly stretches out. u runs around the wall (+ optional spiral).
  float depthScale = 0.30 - 0.23*uReach;        // smaller ⇒ deeper / longer tunnel
  float v = depthScale / r + uEll;              // depth coordinate
  float u = a/PI + uTwist * v * 0.12;           // around the wall

  // The wall of the bore is no longer a metal grid — it's a SLEEVE OF SPACE:
  // luminous nebula gas swirling down the throat, dark dust lanes, and stars
  // streaming past as we fall in. All mapped in (u around, v down) tube coords so
  // it rushes toward the vanishing point with the flight.
  // soft concentric depth ribs (kept, but gentle — light folding in the gas)
  float ring = smoothstep(0.55, 1.0, 0.5 + 0.5*cos(v*PI*2.0));
  float pulse = 0.5 + 0.5*sin(v*6.2831 - uTime*4.0 - uReach*6.0);   // light racing inward

  // FOG/DEPTH: centre (small r → far) sinks to near-black; the near wall (screen
  // edge) is lit. This dark vanishing point is what sells the 3D tube.
  float near = smoothstep(0.0, 0.95, r);                   // 0 far(centre) → 1 near(edge)

  // --- DIMENSIONAL ZONES: depth v split into bands; each band is a distinct
  //     REALM with not just its own COLOUR but its own PHYSICS — turbulence,
  //     gas density, and the kind/amount of stars. So crossing a gateway feels
  //     like entering a genuinely different cosmos, not a recoloured pipe.
  float aw = a + uTwist * v * 0.38;                 // spiral coordinate around wall
  float zoneF = v * 0.5;                             // realms cycle this fast w/ depth
  float zone = floor(zoneF);
  float zfrac = fract(zoneF);
  float xf = smoothstep(0.80, 1.0, zfrac);           // crossfade ONLY near the gateway

  // palette + traits per realm. trait = (turbulence, gasGain, starThresh, streak)
  //   0 blue  : calm smooth nebula, ordinary round stars
  //   1 green : violently turbulent ion field, sparse LONG star streaks
  //   2 magenta: thin sparse gas, a DENSE crowded starfield (a star cluster)
  vec3 palDeep[3]; vec3 palMid[3]; vec4 trait[3];
  palDeep[0]=vec3(0.10,0.10,0.42); palMid[0]=uAccent*1.15;         trait[0]=vec4(1.0, 1.0, 0.93, 1.0);
  palDeep[1]=vec3(0.04,0.26,0.20); palMid[1]=vec3(0.30,0.95,0.70); trait[1]=vec4(2.7, 1.2, 0.965, 7.0);
  palDeep[2]=vec3(0.30,0.06,0.30); palMid[2]=vec3(1.0,0.55,0.85);  trait[2]=vec4(0.5, 0.5, 0.86, 1.0);
  int zi  = int(mod(zone, 3.0));
  int zi2 = int(mod(zone + 1.0, 3.0));
  vec3 deepA=palDeep[0], midA=palMid[0], deepB=palDeep[0], midB=palMid[0];
  vec4 trA=trait[0], trB=trait[0];
  for(int k=0;k<3;k++){
    if(k==zi ){ deepA=palDeep[k]; midA=palMid[k]; trA=trait[k]; }
    if(k==zi2){ deepB=palDeep[k]; midB=palMid[k]; trB=trait[k]; }
  }
  vec3 deep = mix(deepA, deepB, xf);
  vec3 mid  = mix(midA,  midB,  xf);
  vec4 tr   = mix(trA,   trB,   xf);
  float turb = tr.x, gasGain = tr.y, starThresh = tr.z, streak = tr.w;

  // 1) NEBULA GAS — sampled on a CYLINDER (seamless at ±π). The realm's TURB
  //    domain-warps the sample point, so high-turb realms churn violently while
  //    the calm realm stays smooth; gasGain sets how thick the gas is.
  vec3 ring3 = vec3(cos(aw), sin(aw), 0.0);
  vec3 gp = ring3 * 2.2 + vec3(0.0, 0.0, v*1.7 - uTime*0.55);
  gp.xy += (turb - 1.0) * 0.7 * vec2(fbm3(gp*1.6 + 5.0) - 0.5, fbm3(gp*1.6 + 19.0) - 0.5);
  float g1 = fbm3(gp);
  float g2 = fbm3(gp*2.05 + vec3(0.0,0.0,-uTime*0.95) + 3.3);
  float gas = clamp((g1*0.72 + g2*0.46) * gasGain, 0.0, 1.0);
  float dust = smoothstep(0.35, 0.72, fbm3(gp*1.35 + 9.0));
  gas *= mix(0.32, 1.0, dust);

  // colour the gas: void → this realm's deep shadow → realm mid → hot white core.
  vec3 voidc = vec3(0.015,0.02,0.06);
  vec3 hot   = vec3(0.85,0.92,1.0);             // hot filament (shared)
  vec3 gasCol = mix(voidc, deep, smoothstep(0.0,0.4,gas));
  gasCol = mix(gasCol, mid, smoothstep(0.35,0.72,gas));
  gasCol = mix(gasCol, hot, smoothstep(0.80,1.0,gas));

  // GATEWAY RING — a bright concentric portal flares at each realm boundary as we
  // punch through to the next dimension (the "2단·3단" stage transition).
  float gate = smoothstep(0.86, 1.0, zfrac) * smoothstep(1.0, 0.86, zfrac) * 4.0;
  gasCol += (midA + midB) * 0.5 * gate * 1.3;
  float dens = gas*gas;
  vec3 col = gasCol * (0.04 + 0.9*near) * (0.25 + 1.1*dens);
  col += mid * ring * (0.14 + 0.4*pulse) * near * dens;     // light caught in folds

  // 2) STARS — the realm's starThresh sets how MANY (magenta realm is crowded),
  //    and streak elongates them into long ion trails (the emerald realm).
  for(int s=0; s<2; s++){
    float ac = 36.0 + float(s)*24.0;               // integer angular divisions
    float ucell = (aw/(2.0*PI) + 0.5) * ac;        // 0..ac around the ring, wraps
    float vc = v * (3.0 + float(s)*2.0);
    vec2 cellU = vec2(ucell, vc);
    vec2 sid = floor(cellU);
    sid.x = mod(sid.x, ac);                         // wrap the angular index
    float sh = hash(sid + float(s)*7.3);
    if(sh > starThresh){
      vec2 sf = fract(cellU) - 0.5;
      sf.y /= streak;                               // elongate into streaks
      float tw = 0.5 + 0.5*sin(uTime*3.0 + sh*50.0);
      col += vec3(0.9,0.95,1.0) * smoothstep(0.5,0.0,length(sf)) * tw * near * 0.9;
    }
  }

  // --- the far mouth: the DESTINATION dimension glimpsed at the vanishing point.
  // It GROWS with uReach (charging the flight pulls the new world closer/bigger),
  // so there's a real "somewhere we're arriving" — not just an endless pipe. Its
  // sky is tinted by the realm we're currently flying through.
  float mouthR = (0.055 + 0.02*sin(uTime*0.8)) * (1.0 + 1.6*uReach);
  float core = smoothstep(mouthR*1.7, mouthR*0.2, r);
  vec3 destSky = dest(p * (6.0 - 3.0*uReach));             // zoom into it as we approach
  destSky *= 0.6 + 0.8*mid / max(max(mid.r,mid.g),mid.b);  // tint by the current realm
  vec3 exit = destSky * 1.6 + vec3(0.85,0.9,1.0)*core;
  col = mix(col, exit, core);
  // bright Einstein-ring lip around the opening, brighter as the world nears
  col += (vec3(0.9,0.9,1.0)+mid*0.5) * exp(-pow((r - mouthR)/(mouthR*0.55), 2.0)) * (0.6+0.5*uReach);

  // tonemap + deep vignette
  col = col/(col + vec3(1.0));
  col = pow(col, vec3(0.74));
  vec2 vg = gl_FragCoord.xy/uRes;
  col *= 0.08 + 0.92*pow(16.0*vg.x*vg.y*(1.0-vg.x)*(1.0-vg.y), 0.4);
  gl_FragColor = vec4(col,1.0);
}`;

export default class Wormhole extends Piece {
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

    this.u = {
      res: gl.getUniformLocation(this.prog, "uRes"),
      time: gl.getUniformLocation(this.prog, "uTime"),
      ell: gl.getUniformLocation(this.prog, "uEll"),
      reach: gl.getUniformLocation(this.prog, "uReach"),
      twist: gl.getUniformLocation(this.prog, "uTwist"),
      steer: gl.getUniformLocation(this.prog, "uSteer"),
      accent: gl.getUniformLocation(this.prog, "uAccent"),
    };

    this.ell = 0;               // accumulated travel down the corridor
    this.speed = 1.0;           // base forward drift
    this.reach = 0;             // 0..1 how far the corridor has stretched out
    this.charging = false;      // press-and-hold extends the corridor
    this.twist = 0.6;
    this.steerX = 0; this.steerY = 0;
    const [r, g, b] = hexToRgb(this.accent);
    this.accentRgb = [r / 255, g / 255, b / 255];
    this._sizeGL();
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
    // render at full CSS resolution (was 0.62 → visibly blocky gas). Cap the
    // device-pixel-ratio at 2 so 3× retina panels don't tank the fbm3 cost.
    const q = Math.min(this.dpr, 2);
    this.canvas.width = Math.max(1, Math.round(this.w * q));
    this.canvas.height = Math.max(1, Math.round(this.h * q));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  onPointerDown() { this.charging = true; }
  onPointerUp() { this.charging = false; }

  frame(dt, t) {
    const gl = this.gl;

    // PRESS-AND-HOLD extends the corridor: reach charges toward 1 while held (the
    // tunnel stretches away into the distance) and eases back when released. We
    // also fly forward faster the more it's reaching, so holding = diving in.
    const pressing = this.charging || this.pointer.down;
    const target = pressing ? 1 : 0;
    const k = pressing ? 0.9 : 0.6;             // charge fast, relax a little slower
    this.reach += (target - this.reach) * Math.min(1, k * dt * 3);

    const v = this.speed * (0.6 + 2.6 * this.reach);   // forward drift, faster as it reaches
    this.ell += v * dt * 0.5;

    if (this.pointer.active) {
      // bend toward the cursor (clamped so the corridor leans, never folds back)
      const tx = (this.pointer.x / this.w - 0.5) * 0.9;
      const ty = (this.pointer.y / this.h - 0.5) * 0.9;
      this.steerX += (tx - this.steerX) * 0.07;
      this.steerY += (ty - this.steerY) * 0.07;
    } else {
      this.steerX *= 0.95; this.steerY *= 0.95;
    }

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform1f(this.u.ell, this.ell);
    gl.uniform1f(this.u.reach, this.reach);
    gl.uniform1f(this.u.twist, this.twist);
    gl.uniform2f(this.u.steer, this.steerX, this.steerY);
    gl.uniform3f(this.u.accent, this.accentRgb[0], this.accentRgb[1], this.accentRgb[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() { if (this.gl && this.prog) this.gl.deleteProgram(this.prog); }

  controls(host) {
    host.appendChild(slider("SPEED", 0.2, 3.0, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(slider("TWIST", 0, 2.0, this.twist, 0.05, (v) => (this.twist = v)));
    host.appendChild(buttonRow([
      { label: "진입 (dive in)", on: () => { this.reach = 1; } },
    ]));
  }
}
