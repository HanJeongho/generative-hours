// ============================================================================
//  51 · Helios (수장고/vault — 비공개 보관) (태양의 시계) — a boiling star that IS the clock  [raw WebGL GLSL]
//  One fullscreen fragment shader (the 09/21 zero-dependency path — no three.js).
//  The photosphere is domain-warped fbm plasma: convecting granulation cells
//  churn across the disk, limb-darkened at the edge. Outside the limb a corona
//  of fbm streamers flickers into black space over a faint starfield.
//  THE CLOCK: every second the star pulses once like a heartbeat (uBeat drives
//  a soft systole of brightness + a ~1.5% radius swell). At every minute
//  rollover a prominence erupts at the limb — an arcing filament that blooms,
//  arcs over, and rains back (uFlare envelope; uFlareAng picks the limb angle).
//  Click erupts a medium prominence at the limb angle nearest the cursor.
//  And the star AGES with the day (uDay = (h+m/60)/24): a cool blue-white
//  young star at dawn → blazing white-gold noon → deep orange dusk → a dim,
//  swollen red giant through the night. One day = one stellar lifetime.
//  Drag rotates the sampling domain (yaw/pitch, smoothed like 21). HH:MM:SS is
//  a DOM pill pinned top-center (removed in teardown). Internal render scale
//  q=0.6 (CSS upscales) keeps the fbm affordable on integrated GPUs.
// ============================================================================

import { Piece, hexToRgb, clamp } from "../engine.js";
import { slider, buttonRow } from "./01-currents.js";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uRot;        // domain yaw / pitch (drag)
uniform float uBeat;       // per-second heartbeat envelope 0..1
uniform float uFlare;      // prominence envelope 0..1
uniform float uFlareAng;   // limb angle of the current prominence
uniform float uFlareGain;  // FLARE slider
uniform float uTurb;       // TURBULENCE slider (granulation churn speed)
uniform float uCorona;     // CORONA slider (reach)
uniform float uDay;        // (h + m/60)/24 — the star's age through the day

#define PI 3.14159265

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.1,9.7); a*=0.5; }
  return v;
}

// stellar age palette: 0=midnight red giant … dawn blue-white … noon white-gold …
// dusk orange … back to red giant. Returns core / mid / rim colors + size factor.
void starAge(float day, out vec3 core, out vec3 mid, out vec3 rim, out float size, out float slow){
  // phase weights via smooth circular bumps
  float night = max( smoothstep(0.17,0.02,abs(day-0.0)) , smoothstep(0.17,0.02,abs(day-1.0)) ); // ~22h-04h
  night = max(night, smoothstep(0.96,1.0,day) + smoothstep(0.04,0.0,day));
  float dawn  = smoothstep(0.10,0.02,abs(day-0.25));   // ~06h
  float noon  = smoothstep(0.14,0.03,abs(day-0.5));    // ~12h
  float dusk  = smoothstep(0.10,0.02,abs(day-0.79));   // ~19h
  float wsum = night+dawn+noon+dusk+1e-4;
  // base (between phases): warm orange star
  vec3 bc = vec3(1.00,0.92,0.72), bm = vec3(1.00,0.62,0.25), br = vec3(0.75,0.20,0.05);
  vec3 dc = vec3(0.85,0.93,1.05), dm = vec3(0.55,0.72,1.00), dr = vec3(0.18,0.30,0.75); // dawn blue-white
  vec3 nc = vec3(1.05,1.02,0.92), nm = vec3(1.00,0.86,0.50), nr = vec3(0.95,0.55,0.12); // noon white-gold
  vec3 kc = vec3(1.00,0.80,0.55), km = vec3(0.95,0.45,0.15), kr = vec3(0.60,0.12,0.03); // dusk deep orange
  vec3 rc = vec3(0.95,0.55,0.35), rm = vec3(0.72,0.22,0.08), rr = vec3(0.30,0.04,0.02); // night red giant
  float wb = max(0.0, 1.0-(night+dawn+noon+dusk));
  core = (bc*wb + rc*night + dc*dawn + nc*noon + kc*dusk)/(wb+wsum);
  mid  = (bm*wb + rm*night + dm*dawn + nm*noon + km*dusk)/(wb+wsum);
  rim  = (br*wb + rr*night + dr*dawn + nr*noon + kr*dusk)/(wb+wsum);
  size = 1.0 + night*0.13;            // the red giant is swollen
  slow = 1.0 - night*0.45;            // …and its convection is lazy
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  uv.y -= 0.03;                                   // star sits slightly above centre

  vec3 core, midc, rim; float size, slow;
  starAge(uDay, core, midc, rim, size, slow);

  float R = 0.315 * size * (1.0 + uBeat*0.015);   // heartbeat radius swell
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float t = uTime * uTurb * slow;

  vec3 col = vec3(0.0);

  // ---- starfield background --------------------------------------------
  // stars live BEHIND the star: masked out over the disk and faded through
  // the inner corona so no stray bright dots sit on the sun itself.
  {
    float skyMask = smoothstep(R*1.06, R*1.55, r);      // 0 on disk → 1 in deep sky
    if(skyMask > 0.001){
      vec3 stars = vec3(0.0);
      // two scales: a dust of faint stars + a few brighter ones
      for(int i=0;i<2;i++){
        float sc = 44.0 + float(i)*36.0;
        vec2 g = uv*sc + uRot*8.0 + float(i)*23.7;
        vec2 id = floor(g);
        float h = hash(id);
        float thr = (i==0) ? 0.985 : 0.965;             // bright layer is rarer
        if(h > thr){
          vec2 f = fract(g)-0.5 + (vec2(hash(id+7.1), hash(id+3.3))-0.5)*0.6;
          float m = (h-thr)/(1.0-thr);
          float tw = 0.75 + 0.25*sin(uTime*(0.8+h*2.5)+h*40.0);
          // tight gaussian core → point, not blob
          float d2 = dot(f,f);
          float core = exp(-d2*90.0);
          // subtle temperature variation: blue-white ↔ warm
          vec3 tint = mix(vec3(0.72,0.80,1.0), vec3(1.0,0.90,0.78), hash(id+11.2));
          float amp = (i==0) ? 0.55*m : (0.9*m + 0.5*m*m);
          stars += tint * core * amp * tw;
          // faint diffraction cross only on the brightest few
          if(i==0 && m > 0.72){
            float cr = exp(-abs(f.x)*46.0)*exp(-d2*16.0) + exp(-abs(f.y)*46.0)*exp(-d2*16.0);
            stars += tint * cr * (m-0.72)*1.1 * tw;
          }
        }
      }
      col += stars * skyMask;
    }
  }

  // ---- photosphere -------------------------------------------------------
  if(r < R){
    // rotate the sampling domain with the drag (fake sphere spin)
    vec2 sp = uv / R;                                  // -1..1 across the disk
    float z = sqrt(max(0.0, 1.0 - dot(sp,sp)));        // sphere depth
    vec2 dom = vec2(atan(sp.x, z) + uRot.x, asin(clamp(sp.y,-1.0,1.0)) + uRot.y);

    // domain-warped fbm plasma: granulation cells that churn
    vec2 q = dom*4.2;
    vec2 warp = vec2(fbm(q + vec2(0.0, t*0.35)), fbm(q + vec2(5.2, -t*0.3)));
    float g1 = fbm(q + warp*1.8 + vec2(t*0.22, 0.0));
    float g2 = fbm(q*2.7 - warp*1.2 + vec2(0.0, t*0.5));
    float gran = g1*0.68 + g2*0.32;

    // hot cell cores vs dark lanes
    float cells = smoothstep(0.35, 0.75, gran);
    vec3 surf = mix(rim, midc, cells);
    surf = mix(surf, core, smoothstep(0.62, 0.95, gran));

    // limb darkening + heartbeat brightness systole
    float limb = pow(z, 0.55);
    surf *= (0.42 + 0.58*limb) * (1.0 + uBeat*0.22);

    // bright faculae near the limb
    surf += rim * (1.0-limb) * smoothstep(0.6,0.9,g2) * 0.5;
    col += surf;
  }

  // ---- corona -------------------------------------------------------------
  {
    float d = max(0.0, r - R);
    float reach = 0.45 * uCorona;
    // fbm streamers: angular noise stretched radially, flickering
    float st = fbm(vec2(ang*3.2 + uRot.x, d*6.0 - t*0.8));
    float st2 = fbm(vec2(ang*7.0 - t*0.15, d*3.0));
    float streamer = pow(max(0.0, st*0.7+st2*0.5-0.25), 2.0);
    float fall = exp(-d/(reach*0.5+1e-3)) * smoothstep(0.0, 0.02, d);
    vec3 cor = (midc*0.55 + core*0.45) * fall * (0.55 + streamer*1.6);
    cor *= 1.0 + uBeat*0.35;
    col += cor * 0.5;
    // thin hot rim right at the limb
    col += core * exp(-abs(r-R)*90.0) * 0.7;
  }

  // ---- prominence (the minute eruption / click flare) ---------------------
  // A magnetic loop: an arch of plasma anchored at TWO footpoints on the limb.
  // Local frame around the anchor: q.x = outward (radial), q.y = along the limb.
  // The loop is a half-circle of radius L in that frame — three nested filament
  // shells with fbm turbulence, plasma streaming along the arc, hot footpoints,
  // and a rain of cooling droplets sliding back down as the envelope decays.
  if(uFlare > 0.003){
    float f = uFlare;                                   // 1 at eruption → 0
    float ca = cos(uFlareAng), sa = sin(uFlareAng);
    vec2 q = vec2( uv.x*ca + uv.y*sa - R,               // outward from anchor
                  -uv.x*sa + uv.y*ca );                 // along the limb
    // loop radius: leaps out fast, sags back as it decays
    float L = R * (0.20 + 0.62*uFlareGain) * (0.30 + 0.70*f);
    float d = length(q);
    if(d < L*1.55 && q.x > -R*0.10){
      float phi = atan(q.x, q.y);                       // 0..PI across the arch
      float outside = smoothstep(-0.015, 0.03, q.x);    // clip below the limb
      vec3 fc = mix(core, vec3(1.0,0.55,0.78), 0.4);    // hot pink-white plasma

      // three nested filament shells (a braided loop, not one line)
      float fil = 0.0;
      for(int i=0;i<3;i++){
        float fi = float(i);
        float Li = L * (0.74 + 0.13*fi);
        float wob = (fbm(vec2(phi*3.5 + fi*7.3, uTime*1.3 + fi*2.1)) - 0.5) * L*0.14;
        float thick = L * (0.020 + 0.014*fi) + L*0.02*f;
        // plasma streaming along the arc — bright knots crawling the field line
        float stream = 0.45 + 1.1*fbm(vec2(phi*6.0 - uTime*(1.6+fi*0.5), fi*5.0));
        fil += exp(-abs(d - (Li + wob))/thick) * stream * (1.0 - 0.22*fi);
      }
      // footpoints glow hottest (chromospheric anchors)
      float feet = 1.0 + 1.2*pow(abs(cos(phi)), 6.0);
      col += fc * fil * outside * feet * (1.35*f*uFlareGain);

      // eruption glow bed hugging the limb between the two feet
      float bed = exp(-max(q.x, 0.0)/(L*0.30)) * smoothstep(L*1.35, L*0.45, abs(q.y));
      col += midc * bed * outside * f * 0.5;
    }
  }

  // gentle tone shaping + vignette
  col = col / (col + vec3(0.9));
  col = pow(col, vec3(0.85));
  vec2 vg = gl_FragCoord.xy/uRes;
  col *= 0.6 + 0.4*pow(16.0*vg.x*vg.y*(1.0-vg.x)*(1.0-vg.y), 0.18);

  gl_FragColor = vec4(col, 1.0);
}`;

export default class Helios extends Piece {
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

    const U = (n) => gl.getUniformLocation(this.prog, n);
    this.u = {
      res: U("uRes"), time: U("uTime"), rot: U("uRot"),
      beat: U("uBeat"), flare: U("uFlare"), flareAng: U("uFlareAng"),
      flareGain: U("uFlareGain"), turb: U("uTurb"), corona: U("uCorona"), day: U("uDay"),
    };

    // drag domain rotation (smoothed like 21)
    this.yaw = 0; this.pitch = 0;
    this.targetYaw = 0; this.targetPitch = 0;

    // clock envelopes — primed so nothing erupts on load
    const d = new Date();
    this.lastS = d.getSeconds(); this.lastM = d.getMinutes();
    this.beat = 0; this.flare = 0; this.flareAng = 1.1;

    // sliders
    this.flareGain = 1.0; this.turb = 1.0; this.corona = 1.0;
    this.h24 = false;

    this._makeReadout();
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
    const q = 0.6;                 // heavy fbm shader → reduced internal res
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr * q));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr * q));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  onResize() { this._sizeGL(); }

  // ---- HH:MM:SS pill (raw DOM — removed in teardown) -----------------------
  _makeReadout() {
    const wrap = this.canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute", left: "50%", top: "16px", transform: "translateX(-50%)",
      padding: "7px 18px", zIndex: "11", pointerEvents: "none",
      background: "rgba(8,5,4,0.5)", color: "#ffe9d2",
      border: "1px solid rgba(255,255,255,0.10)", borderRadius: "999px",
      font: "600 15px/1 ui-monospace, 'SF Mono', Menlo, monospace",
      letterSpacing: "0.22em", textShadow: "0 0 12px rgba(255,140,60,0.55)",
    });
    wrap.appendChild(el);
    this._readout = el; this._readStrLast = null;
  }
  _updateReadout(h, m, s) {
    const pad = (n) => String(n).padStart(2, "0");
    let str;
    if (this.h24) str = `${pad(h)}:${pad(m)}:${pad(s)}`;
    else {
      const ap = h < 12 ? "AM" : "PM";
      let hd = h % 12; if (hd === 0) hd = 12;
      str = `${pad(hd)}:${pad(m)}:${pad(s)} ${ap}`;
    }
    if (str !== this._readStrLast) { this._readout.textContent = str; this._readStrLast = str; }
  }

  onPointerDown() {
    // click → medium prominence at the limb angle nearest the cursor
    const cx = this.w / 2, cy = this.h * 0.53;
    this.flareAng = Math.atan2(-(this.pointer.y - cy), this.pointer.x - cx);
    this.flare = Math.max(this.flare, 0.62);
  }

  frame(dt, t) {
    const gl = this.gl;

    // drag → smoothed domain rotation
    if (this.pointer.down) {
      this.targetYaw += this.pointer.vx * 0.005;
      this.targetPitch = clamp(this.targetPitch + this.pointer.vy * 0.003, -0.9, 0.9);
    }
    this.yaw += (this.targetYaw - this.yaw) * 0.07;
    this.pitch += (this.targetPitch - this.pitch) * 0.07;

    // clock: heartbeat each second, prominence each minute
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (s !== this.lastS) {
      this.lastS = s; this.beat = 1;
      if (m !== this.lastM) {
        this.lastM = m;
        this.flareAng = Math.random() * Math.PI * 2;
        this.flare = 1;                       // the grand minute eruption
      }
    }
    this.beat = Math.max(0, this.beat - dt * 2.6);
    this.flare = Math.max(0, this.flare - dt * 0.55);
    this._updateReadout(h, m, s);

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, t);
    gl.uniform2f(this.u.rot, this.yaw, this.pitch);
    gl.uniform1f(this.u.beat, this.beat);
    gl.uniform1f(this.u.flare, this.flare);
    gl.uniform1f(this.u.flareAng, this.flareAng);
    gl.uniform1f(this.u.flareGain, this.flareGain);
    gl.uniform1f(this.u.turb, this.turb);
    gl.uniform1f(this.u.corona, this.corona);
    gl.uniform1f(this.u.day, (h + m / 60 + s / 3600) / 24);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  teardown() {
    if (this.gl && this.prog) this.gl.deleteProgram(this.prog);
    if (this._readout) { this._readout.remove(); this._readout = null; }
  }

  controls(host) {
    host.appendChild(slider("FLARE", 0.3, 2.0, this.flareGain, 0.05, (v) => (this.flareGain = v)));
    host.appendChild(slider("TURBULENCE", 0.3, 2.5, this.turb, 0.05, (v) => (this.turb = v)));
    host.appendChild(slider("CORONA", 0.3, 2.0, this.corona, 0.05, (v) => (this.corona = v)));
    const row = buttonRow([
      { label: "12h", on: (el) => this._setMode(false, el) },
      { label: "24h", on: (el) => this._setMode(true, el) },
    ]);
    row.querySelectorAll(".ctrl__btn")[this.h24 ? 1 : 0].classList.add("is-active");
    host.appendChild(row);
  }
  _setMode(h24, el) {
    this.h24 = h24; this._readStrLast = null;
    el.parentElement.querySelectorAll(".ctrl__btn").forEach((b) => b.classList.remove("is-active"));
    el.classList.add("is-active");
  }
}
