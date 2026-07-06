// ============================================================================
//  01 · Whispering Currents — flow-field particles
//  Tens of thousands of particles advect through a slowly-rotating Perlin
//  vector field, leaving long trails. The pointer injects a local vortex.
// ============================================================================

import { Piece, makeNoise, TAU } from "../engine.js";

// Press-and-hold vortex tuning. Holding longer charges a stronger, wider swirl,
// but both saturate at full charge so it can never grow without bound.
const CHARGE_TIME = 1.4;          // seconds of holding to reach full power
const MIN_R = 90;                 // reach of an instant tap
const MIN_S = 1.4, MAX_S = 5.2;   // swirl strength at zero / full charge

export default class Currents extends Piece {
  setup() {
    this.ctx = this.canvas.getContext("2d");
    this.noise = makeNoise();
    this.scale = 0.0016;        // spatial frequency of the field
    this.speed = 1.0;
    this.count = this._targetCount();
    this.particles = [];
    this.spawn();
    // paint an initial dark wash so trails build on black
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#050507";
    g.fillRect(0, 0, this.w, this.h);
    this.vortices = [];          // released swirls {x,y,life,dir,radius,strength}
    this.charging = null;        // active hold-to-charge swirl, or null
  }

  // Upper bound on a vortex's reach — tied to screen size so it never runs away.
  _maxR() { return Math.min(this.w, this.h) * 0.42; }

  _targetCount() {
    const area = this.w * this.h;
    return Math.round(Math.min(34000, Math.max(6000, area / 38)));
  }

  spawn() {
    this.particles.length = 0;
    for (let i = 0; i < this.count; i++) this.particles.push(this._newP());
  }
  _newP() {
    return { x: Math.random() * this.w, y: Math.random() * this.h, life: Math.random() * 200 + 40 };
  }

  onResize() {
    this.count = this._targetCount();
    this.spawn();
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#050507";
    g.fillRect(0, 0, this.w, this.h);
  }

  // Begin charging a vortex under the cursor. It grows while held (see frame()).
  onPointerDown() {
    this.charging = {
      x: this.pointer.x, y: this.pointer.y,
      charge: 0, dir: Math.random() < 0.5 ? 1 : -1,
    };
  }

  // Release: emit a swirl whose radius & strength scale with how long it charged.
  onPointerUp() {
    const c = this.charging;
    if (!c) return;
    this.charging = null;
    const e = c.charge;                       // 0..1 (already clamped in frame)
    this.vortices.push({
      x: c.x, y: c.y, dir: c.dir, life: 1,
      radius: MIN_R + (this._maxR() - MIN_R) * e,
      strength: MIN_S + (MAX_S - MIN_S) * e,
    });
    if (this.vortices.length > 6) this.vortices.shift();
  }

  frame(dt, t) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // fade previous frame → trails
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(5,5,7,0.066)";
    g.fillRect(0, 0, this.w, this.h);

    g.globalCompositeOperation = "lighter";
    const sc = this.scale;
    const zo = t * 0.06;                       // field drift over time
    const ptr = this.pointer;
    const wind = (ptr.active ? Math.hypot(ptr.vx, ptr.vy) : 0);

    // grow the held swirl toward full charge (follows the cursor while held)
    if (this.charging) {
      this.charging.charge = Math.min(1, this.charging.charge + dt / CHARGE_TIME);
      this.charging.x = ptr.x; this.charging.y = ptr.y;
    }

    // age released vortices
    for (const v of this.vortices) v.life -= dt * 0.5;
    this.vortices = this.vortices.filter((v) => v.life > 0);

    // the swirl currently being charged also stirs the field, so its growth is
    // visible in real time. Build a combined list for the particle loop.
    const active = this.vortices.slice();
    if (this.charging) {
      const e = this.charging.charge;
      active.push({
        x: this.charging.x, y: this.charging.y, dir: this.charging.dir, life: 1,
        radius: MIN_R + (this._maxR() - MIN_R) * e,
        strength: MIN_S + (MAX_S - MIN_S) * e,
      });
    }

    const baseHue = (t * 4) % 360;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      // field angle from layered noise
      const n = this.noise(p.x * sc + zo, p.y * sc - zo) +
                0.5 * this.noise(p.x * sc * 2.3 - zo, p.y * sc * 2.3 + zo);
      let ang = n * TAU * 1.3;
      let vx = Math.cos(ang), vy = Math.sin(ang);

      // pointer wind: push particles along cursor motion within a radius
      if (ptr.active && wind > 0.4) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y;
        const d2 = dx * dx + dy * dy;
        const R = 150;
        if (d2 < R * R) {
          const f = (1 - Math.sqrt(d2) / R) * 0.6;
          vx += (ptr.vx / 8) * f; vy += (ptr.vy / 8) * f;
        }
      }
      // vortices: tangential swirl, sized & powered per-vortex (charge-driven)
      for (const v of active) {
        const dx = p.x - v.x, dy = p.y - v.y;
        const d = Math.hypot(dx, dy) + 0.001;
        const R = v.radius * v.life;
        if (d < R) {
          const f = (1 - d / R) * v.strength * v.life * v.dir;
          vx += (-dy / d) * f; vy += (dx / d) * f;
        }
      }

      const sp = this.speed * 1.6;
      p.x += vx * sp; p.y += vy * sp;
      p.life -= 1;

      // colour: hue follows local angle, brightness follows speed
      const sp2 = Math.min(1, Math.hypot(vx, vy));
      const hue = (baseHue + (ang / TAU) * 80 + 200) % 360;
      g.fillStyle = `hsla(${hue}, 75%, ${55 + sp2 * 18}%, 0.5)`;
      g.fillRect(p.x, p.y, 1.3, 1.3);

      // respawn if dead or off-screen
      if (p.life < 0 || p.x < -10 || p.x > this.w + 10 || p.y < -10 || p.y > this.h + 10) {
        Object.assign(p, this._newP());
        // seed many near edges so flow keeps entering
        if (Math.random() < 0.5) { p.x = Math.random() * this.w; p.y = Math.random() < 0.5 ? -5 : this.h + 5; }
      }
    }
  }

  controls(host) {
    host.appendChild(slider("FLOW SPEED", 0.3, 2.2, this.speed, 0.05, (v) => (this.speed = v)));
    host.appendChild(slider("FIELD SCALE", 0.0006, 0.004, this.scale, 0.0001,
      (v) => (this.scale = v), (v) => (v * 1000).toFixed(1)));
    host.appendChild(buttonRow([
      { label: "흩기 (Reset)", on: () => { this.spawn(); } },
    ]));
  }
}

// ---- small shared control builders (kept local to avoid coupling) ----------
export function slider(label, min, max, val, step, oninput, fmt = (v) => (+v).toFixed(2)) {
  const wrap = document.createElement("label");
  wrap.className = "ctrl";
  wrap.innerHTML = `<span class="ctrl__label">${label}<span class="ctrl__val"></span></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`;
  const out = wrap.querySelector(".ctrl__val");
  const inp = wrap.querySelector("input");
  out.textContent = fmt(val);
  inp.addEventListener("input", () => { oninput(parseFloat(inp.value)); out.textContent = fmt(inp.value); });
  return wrap;
}
export function buttonRow(btns) {
  const wrap = document.createElement("div");
  wrap.className = "ctrl";
  const row = document.createElement("div");
  row.className = "ctrl__btns";
  for (const b of btns) {
    const el = document.createElement("button");
    el.className = "ctrl__btn"; el.textContent = b.label;
    el.addEventListener("click", () => b.on(el));
    row.appendChild(el);
  }
  wrap.appendChild(row);
  return wrap;
}
