// ============================================================================
//  21 · Event Horizon — a Gargantua-style black hole (WebGL)
//  Per-pixel light rays are integrated backwards through curved spacetime: each
//  ray bends toward the singularity every step via the Schwarzschild deflection
//  term  a = -1.5·h²·p̂ / r⁴  (h = |p×v|, the conserved photon angular momentum).
//  Rays that cross the equatorial plane pick up the glowing accretion disk;
//  rays that fall inside the horizon are captured (black shadow); survivors
//  sample a procedural starfield. Because rays bend, the disk's FAR side is
//  lensed up and over the shadow into the halo above and below — the iconic
//  Interstellar look — and background stars smear into an Einstein ring.
//
//  Canvas2D cannot bend the background per-pixel, so this is one full-screen
//  GLSL fragment shader (same zero-dependency WebGL path as 09 Volumetric).
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uRot;       // camera yaw / pitch
uniform float uMass;      // lensing strength
uniform float uDisk;      // accretion-disk brightness
uniform float uSpin;      // disk rotation speed
uniform vec3  uAccent;    // wing tint (cosmic indigo)

#define PI 3.14159265

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }

// Deep-space background, sampled by a direction so it lenses with bent rays.
vec3 starField(vec3 dir){
  float u = atan(dir.z, dir.x)/(2.0*PI)+0.5;
  float v = acos(clamp(dir.y,-1.0,1.0))/PI;
  vec2 uv = vec2(u,v);

  // faint nebula wash
  vec2 q = uv*vec2(7.0,3.5);
  float neb = 0.55*hash(floor(q)) + 0.3*hash(floor(q*2.03)) + 0.18*hash(floor(q*4.1));
  vec3 col = mix(vec3(0.008,0.01,0.022), uAccent*0.05, neb)*0.7;

  // multi-layer stars
  for(int i=0;i<3;i++){
    float sc = 240.0 + float(i)*380.0;
    vec2 g = uv*sc;
    vec2 id = floor(g);
    float h = hash(id + float(i)*23.7);
    float thr = 0.975;
    if(h > thr){
      vec2 f = fract(g) - 0.5;
      float d = length(f);
      float bri = (h-thr)/(1.0-thr);
      float star = smoothstep(0.5, 0.0, d) * bri;
      vec3 tint = mix(vec3(1.0), vec3(0.72,0.82,1.0), hash(id+5.3));
      col += tint * star * 1.5;
    }
  }
  return col;
}

// Disk emission at equatorial radius r (units of Rs); hot inner -> indigo outer.
vec3 diskColor(float r, float ang, float t){
  float inner = 2.6, outer = 13.0;
  if(r < inner || r > outer) return vec3(0.0);
  float x = (r-inner)/(outer-inner);
  float temp = pow(1.0 - x, 1.4);
  vec3 hot  = vec3(1.0, 0.86, 0.58);
  vec3 mid  = mix(vec3(1.0,0.72,0.42), uAccent*1.5+vec3(0.15), 0.5);
  vec3 cool = uAccent*1.05 + vec3(0.02);
  vec3 c = mix(cool, mix(mid, hot, smoothstep(0.45,1.0,temp)), temp);

  float vel = uSpin * (1.7 / pow(r,0.5));      // Keplerian: inner spins faster
  float bands = 0.62 + 0.4*sin(ang*3.0 - t*vel*2.0 + r*1.2)
                     + 0.22*sin(ang*8.0 + t*vel + r*3.3);
  float radial = 0.72 + 0.28*sin(r*3.5 - t*vel);
  float bright = temp * bands * radial;
  bright += smoothstep(inner+1.3, inner, r) * 1.3;   // bright inner rim
  bright *= smoothstep(outer, outer-2.5, r);          // soft outer fade
  return c * max(bright, 0.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  // camera
  float yaw = uRot.x, pitch = uRot.y;
  float camDist = 24.0;
  vec3 ro = vec3(0.0, 0.0, -camDist);
  vec3 rd = normalize(vec3(uv, 1.5));
  ro.yz *= rot(pitch); rd.yz *= rot(pitch);
  ro.xz *= rot(yaw);   rd.xz *= rot(yaw);

  // integrate the bent ray
  vec3 pos = ro;
  vec3 vel = rd;
  float Rs  = 1.0;
  float lens = 0.6 + uMass*1.6;

  vec3 col = vec3(0.0);
  float transmit = 1.0;       // remaining background visibility through the disk
  bool captured = false;

  const int STEPS = 256;
  for(int i=0;i<STEPS;i++){
    float r = length(pos);
    vec3 prev = pos;

    // Schwarzschild-limit deflection: bend velocity toward the hole.
    vec3 L = cross(pos, vel);
    float h2 = dot(L, L);
    vec3 acc = -1.5 * h2 * lens * pos / pow(r, 5.0);

    float step = 0.45 * (0.5 + 0.08*r);    // smaller steps near the hole
    vel += acc * step;
    vel = normalize(vel);
    pos += vel * step;

    r = length(pos);
    if(r < Rs*1.01){ captured = true; break; }

    // equatorial-plane (y=0) crossing -> accumulate disk
    if(prev.y * pos.y < 0.0){
      float f = abs(prev.y) / (abs(prev.y) + abs(pos.y) + 1e-5);
      vec3 hit = mix(prev, pos, f);
      float rr = length(hit.xz);
      vec3 d = diskColor(rr, atan(hit.z, hit.x), uTime);
      if(dot(d,d) > 0.0){
        // Doppler beaming along the disk's orbital direction
        vec3 tang = normalize(vec3(-hit.z, 0.0, hit.x));
        float dop = dot(tang, normalize(vel));
        float beam = 1.0 + 0.85*dop;
        d *= max(beam, 0.0);
        d = mix(d, d*vec3(0.65,0.82,1.35), clamp(dop*0.5+0.2, 0.0, 1.0));
        col += d * uDisk * transmit * 0.55;
        transmit *= 0.5;                    // disk is semi-opaque
      }
    }

    if(r > 70.0) break;                     // escaped
  }

  if(!captured) col += starField(normalize(vel)) * transmit;

  // tonemap + gentle bloom
  col = col / (col + vec3(0.8));
  col = pow(col, vec3(0.45));
  vec2 vg = gl_FragCoord.xy/uRes;
  col *= 0.55 + 0.45*pow(16.0*vg.x*vg.y*(1.0-vg.x)*(1.0-vg.y), 0.22);

  gl_FragColor = vec4(col, 1.0);
}`;

export default class EventHorizon extends Piece {
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
      rot: gl.getUniformLocation(this.prog, "uRot"),
      mass: gl.getUniformLocation(this.prog, "uMass"),
      disk: gl.getUniformLocation(this.prog, "uDisk"),
      spin: gl.getUniformLocation(this.prog, "uSpin"),
      accent: gl.getUniformLocation(this.prog, "uAccent"),
    };

    this.yaw = 0.0; this.pitch = 0.18;     // slight tilt reveals the disk wrap
    this.targetYaw = this.yaw; this.targetPitch = this.pitch;
    this.autoRotate = true;
    this.mass = 0.5; this.disk = 1.0; this.spin = 1.0;
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
    // heavy geodesic shader → render at reduced resolution, CSS upscales
    const q = 0.6;
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr * q));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr * q));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  onPointerDown() { this.autoRotate = false; }

  frame(dt, t) {
    const gl = this.gl;
    if (this.pointer.down) {
      this.targetYaw += this.pointer.vx * 0.006;
      this.targetPitch = clamp(this.targetPitch + this.pointer.vy * 0.004, -1.45, 1.45);
    } else if (this.autoRotate) {
      this.targetYaw += dt * 0.1;
    }
    this.yaw += (this.targetYaw - this.yaw) * 0.07;
    this.pitch += (this.targetPitch - this.pitch) * 0.07;

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform2f(this.u.rot, this.yaw, this.pitch);
    gl.uniform1f(this.u.mass, this.mass);
    gl.uniform1f(this.u.disk, this.disk);
    gl.uniform1f(this.u.spin, this.spin);
    gl.uniform3f(this.u.accent, this.accentRgb[0], this.accentRgb[1], this.accentRgb[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() { if (this.gl && this.prog) this.gl.deleteProgram(this.prog); }

  controls(host) {
    host.appendChild(slider("MASS", 0.1, 1.2, this.mass, 0.02, (v) => (this.mass = v)));
    host.appendChild(slider("DISK BRIGHTNESS", 0.2, 2.0, this.disk, 0.05, (v) => (this.disk = v)));
    host.appendChild(slider("SPIN", 0, 2.5, this.spin, 0.05, (v) => (this.spin = v)));
    host.appendChild(buttonRow([
      { label: "자동 회전", on: (el) => { this.autoRotate = !this.autoRotate; el.classList.toggle("is-active", this.autoRotate); } },
    ]));
    host.querySelector(".ctrl__btn")?.classList.add("is-active");
  }
}
