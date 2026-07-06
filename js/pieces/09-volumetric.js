// ============================================================================
//  09 · Volumetric — "체적의 빛" · WebGL volumetric ray-marching.
//  Not a solid surface: a full-screen shader marches each ray THROUGH a cloud
//  of animated 3D noise, accumulating emission and absorption sample by sample
//  (the classic front-to-back volume integral). A light buried at the core
//  scatters out through the density, so the nebula glows from within and fades
//  to transparency at its edges — light given a body. Drag to orbit; sliders
//  set the cloud's density and inner radiance.
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const VERT = `
attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uRot;       // orbit yaw/pitch
uniform float uDensity;   // overall cloud density
uniform float uGlow;      // inner-light radiance
uniform vec3  uAccent;    // wing accent colour

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// --- value-noise FBM (cheap 3D) ---------------------------------------------
float hash(vec3 p){
  p = fract(p*0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float v = 0.0, a = 0.5;
  // slow drift so the cloud roils
  p += vec3(0.0, uTime*0.06, uTime*0.03);
  for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

// density at a point: a soft spherical falloff carved by turbulent fbm. The
// high threshold leaves wispy filaments and hollows (a nebula) rather than a
// solid ball, so light can thread through it.
float density(vec3 p){
  float r = length(p);
  float shell = smoothstep(1.5, 0.12, r);          // 1 at centre → 0 at edge
  float n = fbm(p*1.9);
  float d = shell * (n*2.6 - 1.25);                // hard carve → only dense filaments
  return clamp(d, 0.0, 1.0) * uDensity;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  // camera orbit
  float yaw = uRot.x, pitch = uRot.y;
  vec3 ro = vec3(0.0, 0.0, 3.6);
  ro.yz *= rot(pitch);
  ro.xz *= rot(yaw);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(vec3(0.0,1.0,0.0), ww));
  vec3 vv = cross(ww, uu);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*ww);

  // the inner light source (slightly off-centre, drifting) the cloud scatters
  vec3 lpos = vec3(sin(uTime*0.3)*0.25, cos(uTime*0.23)*0.2, 0.0);

  // --- volumetric front-to-back integration -------------------------------
  vec3 col = vec3(0.0);
  float trans = 1.0;                      // remaining transparency
  float t = 1.6;                          // start near the bounding sphere
  // dithered start to break up banding
  t += 0.05 * hash(vec3(gl_FragCoord.xy, uTime));
  // a cool counter-colour for the cloud's shadowed depths (nebula-like duotone)
  vec3 deep = vec3(0.18, 0.30, 0.85);     // cool blue-violet
  for(int i=0;i<72;i++){
    if(trans < 0.02) break;               // fully opaque → stop
    vec3 pos = ro + rd*t;
    if(length(pos) < 1.7){
      float dens = density(pos);
      if(dens > 0.001){
        // light scattered from the core. Use distance directly for the colour
        // ramp (not the glow-scaled value) so hue doesn't wash to white:
        //  far/shadowed → cool blue, mid body → warm gold, only the very core white.
        float dl = length(pos - lpos);
        float lit = exp(-dl*1.9);                       // 0..1 by proximity to light
        vec3 emit = mix(deep, uAccent, smoothstep(0.04, 0.45, lit));
        emit = mix(emit, vec3(1.0), smoothstep(0.88, 1.0, lit));  // white only at the very core
        emit *= (0.3 + lit*lit*uGlow);                  // brightness (glow scales intensity, not hue)
        float a = dens * 0.2;                           // per-step opacity
        col += trans * a * emit;
        trans *= 1.0 - a;
      }
    }
    t += 0.045;
    if(t > 5.4) break;
  }

  // faint outer halo so the body reads as luminous, not cut out
  float halo = exp(-length(uv)*2.2) * 0.08;
  col += uAccent * halo;

  // tonemap + gamma
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.4545));
  // subtle vignette
  vec2 q = gl_FragCoord.xy / uRes;
  col *= 0.55 + 0.45*pow(16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.2);
  gl_FragColor = vec4(col, 1.0);
}`;

export default class Volumetric extends Piece {
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

    // fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      rot: gl.getUniformLocation(prog, "uRot"),
      density: gl.getUniformLocation(prog, "uDensity"),
      glow: gl.getUniformLocation(prog, "uGlow"),
      accent: gl.getUniformLocation(prog, "uAccent"),
    };

    this.yaw = 0.6; this.pitch = -0.2;
    this.targetYaw = this.yaw; this.targetPitch = this.pitch;
    this.density = 1.1; this.glow = 2.0;
    this.autoRotate = true;
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
    // render at reduced resolution for the heavy shader, CSS scales it up
    const q = 0.75;
    this.canvas.width = Math.round(this.w * this.dpr * q);
    this.canvas.height = Math.round(this.h * this.dpr * q);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  onPointerDown() { this.autoRotate = false; this._dragX = this.pointer.x; this._dragY = this.pointer.y; }

  frame(dt, t) {
    const gl = this.gl;
    // orbit control
    if (this.pointer.down) {
      this.targetYaw += this.pointer.vx * 0.006;
      this.targetPitch = clamp(this.targetPitch + this.pointer.vy * 0.006, -1.3, 1.3);
    } else if (this.autoRotate) {
      this.targetYaw += dt * 0.18;
    }
    this.yaw += (this.targetYaw - this.yaw) * 0.08;
    this.pitch += (this.targetPitch - this.pitch) * 0.08;

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform2f(this.u.rot, this.yaw, this.pitch);
    gl.uniform1f(this.u.density, this.density);
    gl.uniform1f(this.u.glow, this.glow);
    gl.uniform3f(this.u.accent, ...this.accentRgb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() {
    const gl = this.gl;
    if (gl && this.prog) gl.deleteProgram(this.prog);
  }

  controls(host) {
    host.appendChild(slider("DENSITY 밀도", 0.3, 2.0, this.density, 0.02, (v) => (this.density = v)));
    host.appendChild(slider("RADIANCE 광채", 0.4, 3.0, this.glow, 0.05, (v) => (this.glow = v)));
    host.appendChild(buttonRow([
      { label: "자동 회전", on: (el) => { this.autoRotate = !this.autoRotate; el.classList.toggle("is-active", this.autoRotate); } },
    ]));
    host.querySelector(".ctrl__btn")?.classList.add("is-active");
  }
}
