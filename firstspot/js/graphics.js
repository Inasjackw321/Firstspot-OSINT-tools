// firstspot — 3D graphics engine.
// A "graphic" is a spec { type, unit, color, items:[{label,value,lat?,lon?,sim?}] }.
// Calling graphic.setSpec(newSpec) with the same shape just retargets the values,
// and everything eases to the new numbers — that's what makes live updates feel alive.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

export const PALETTE = {
  blue: '#3b5bff',
  mint: '#10b98c',
  amber: '#ff9f1c',
  rose: '#ff4d6d',
  violet: '#8b5cf6',
};
export const TYPES = {
  bars: 'Bars',
  globe: 'Globe',
  terrain: 'Terrain',
};

const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function fmt(v, unit = '') {
  const a = Math.abs(v);
  const n = a >= 1000 ? Math.round(v).toLocaleString() : a >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  if (!unit) return `${n}`;
  return /^[%°]/.test(unit) ? `${n}${unit}` : `${n} ${unit}`;
}

/* ---------- text sprites (fixed-size canvas so textures never need re-allocating) ---------- */
class Label {
  constructor(text, { size = 0.4, color = '#888', weight = 600 } = {}) {
    this.size = size;
    this.color = color;
    this.weight = weight;
    this.c = document.createElement('canvas');
    this.c.width = 512;
    this.c.height = 96;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set((size * 512) / 96, size, 1);
    this.text = null;
    this.set(text);
  }
  set(t) {
    t = String(t);
    if (t === this.text) return;
    this.text = t;
    const ctx = this.c.getContext('2d');
    ctx.clearRect(0, 0, 512, 96);
    let fs = 54;
    ctx.font = `${this.weight} ${fs}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(t).width;
    if (w > 480) {
      fs = Math.floor((fs * 480) / w);
      ctx.font = `${this.weight} ${fs}px Inter, system-ui, sans-serif`;
    }
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 256, 50);
    this.tex.needsUpdate = true;
  }
}

/* ---------- base class ---------- */
class Graphic {
  constructor(spec) {
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const D = dark();
    this.scene.add(new THREE.HemisphereLight(0xffffff, D ? 0x2a2a3a : 0xc4c7d6, D ? 1.6 : 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, D ? 2.2 : 3);
    sun.position.set(4, 8, 6);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    this.lookAt = new THREE.Vector3();
    this.spinT = 0;
    this.paused = false;
    this.cur = [];
    this.dom = 1;
    this.labels = [];
    this.setSpec(spec);
  }

  setView(pos, look) {
    this.camera.position.set(...pos);
    this.lookAt.set(...look);
    this.camera.lookAt(this.lookAt);
  }

  setSpec(spec) {
    const old = this.spec;
    this.spec = {
      type: spec.type,
      unit: spec.unit || '',
      color: spec.color || 'blue',
      max: spec.max || 0,
      items: (spec.items || []).map((i) => ({ ...i })),
    };
    const s = this.spec;
    const same =
      old &&
      old.color === s.color &&
      old.items.length === s.items.length &&
      old.items.every((o, i) => o.label === s.items[i].label && o.lat === s.items[i].lat && o.lon === s.items[i].lon);
    if (!same) {
      this.clear();
      this.cur = s.items.map(() => 0);
      this.dom = this.wantDom();
      this.build();
    }
  }

  target(i) {
    const it = this.spec.items[i];
    let v = Number(it.value) || 0;
    if (it.sim) v += it.sim.amp * Math.sin(Math.PI * 2 * (Date.now() / 1000 / it.sim.period) + (it.sim.phase || 0));
    return Math.max(0, v);
  }
  wantDom() {
    if (this.spec.max) return this.spec.max;
    let mx = 0;
    this.spec.items.forEach((_, i) => (mx = Math.max(mx, this.target(i))));
    return Math.max(mx * 1.12, 1e-6);
  }
  /** Current (eased) value of item i — used by the legend UI too. */
  value(i) {
    return this.cur[i] ?? 0;
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 4);
    this.spec.items.forEach((_, i) => (this.cur[i] += (this.target(i) - this.cur[i]) * k));
    this.dom += (this.wantDom() - this.dom) * k;
    if (!this.paused) this.spinT += dt;
    this.group.rotation.y = this.spin(this.spinT);
    this.frame(dt, t);
  }

  label(text, opts) {
    const l = new Label(text, opts);
    this.labels.push(l);
    this.group.add(l.sprite);
    return l;
  }
  clear() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !o.isSprite) o.material.dispose();
    });
    this.labels.forEach((l) => {
      l.tex.dispose();
      l.mat.dispose();
    });
    this.labels = [];
    this.group.clear();
  }
  dispose() {
    this.clear();
  }
  accent() {
    return new THREE.Color(PALETTE[this.spec.color] || PALETTE.blue);
  }
  spin() {
    return 0;
  }
  build() {}
  frame() {}
}

/* ---------- 1. Bars ---------- */
class Bars extends Graphic {
  spin(t) {
    return Math.sin(t * 0.5) * 0.35;
  }
  build() {
    const { items } = this.spec;
    const n = items.length;
    const sp = 1.25;
    const D = dark();
    const accent = this.accent();
    this.setView([0, 3.2 + n * 0.08, 4.4 + n * 0.62], [0, 1.15, 0]);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(n * sp + 0.5, 0.08, 2.1),
      new THREE.MeshStandardMaterial({ color: D ? 0x1b1b21 : 0xe4e4ea, roughness: 0.9 })
    );
    floor.position.y = -0.04;
    this.group.add(floor);

    const geo = new THREE.BoxGeometry(0.78, 1, 0.78);
    geo.translate(0, 0.5, 0);
    this.bars = items.map((it, i) => {
      const x = (i - (n - 1) / 2) * sp;
      const col = accent.clone().offsetHSL(0, 0, ((n > 1 ? i / (n - 1) : 0.5) - 0.5) * 0.16);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.05 }));
      mesh.position.x = x;
      mesh.scale.y = 0.001;
      this.group.add(mesh);
      const name = this.label(it.label, { size: 0.34, color: D ? '#9a9aa5' : '#6c6c75', weight: 500 });
      name.sprite.position.set(x, -0.36, 0.85);
      const val = this.label('', { size: 0.4, color: D ? '#f4f4f6' : '#0d0d10', weight: 700 });
      val.sprite.position.set(x, 0.4, 0);
      return { mesh, val };
    });
  }
  frame() {
    this.bars.forEach((b, i) => {
      const h = Math.max((this.cur[i] / this.dom) * 3, 0.001);
      b.mesh.scale.y = h;
      b.val.sprite.position.y = h + 0.38;
      b.val.set(fmt(this.cur[i], this.spec.unit));
    });
  }
}

/* ---------- 2. Globe ---------- */
function latLon(lat, lon, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

class Globe extends Graphic {
  spin(t) {
    return t * 0.32 + 1.2;
  }
  build() {
    const R = 2;
    const D = dark();
    const n = this.spec.items.length;
    this.setView([0, 1.5, 9.3], [0, 0, 0]);

    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(R, 64, 48),
        new THREE.MeshStandardMaterial({ color: D ? 0x15151b : 0xd3d5df, roughness: 1 })
      )
    );
    // dotted shell (fibonacci lattice)
    const N = 1500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      pos.set([Math.cos(a) * r * R * 1.004, y * R * 1.004, Math.sin(a) * r * R * 1.004], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.group.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.034, color: D ? 0x50505e : 0xbdbdcb })));
    // graticule
    const lines = [];
    const ring = (fn) => {
      for (let i = 0; i < 96; i++) lines.push(fn(i / 96), fn((i + 1) / 96));
    };
    for (let lat = -60; lat <= 60; lat += 30) ring((t) => latLon(lat, t * 360 - 180, R * 1.002));
    for (let lon = 0; lon < 180; lon += 30)
      ring((t) => {
        const a = t * Math.PI * 2;
        return latLon(90 - (a * 180) / Math.PI, lon, R * 1.002);
      });
    this.group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(lines),
        new THREE.LineBasicMaterial({ color: D ? 0x2c2c36 : 0xdcdce5, transparent: true, opacity: 0.9 })
      )
    );

    const accent = this.accent();
    const geo = new THREE.BoxGeometry(0.11, 1, 0.11);
    geo.translate(0, 0.5, 0);
    const up = new THREE.Vector3(0, 1, 0);
    this.pillars = this.spec.items.map((it, i) => {
      const lat = Number.isFinite(+it.lat) ? +it.lat : 0;
      const lon = Number.isFinite(+it.lon) ? +it.lon : (i * 360) / Math.max(n, 1) - 180;
      const dir = latLon(lat, lon, 1);
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.35 })
      );
      m.position.copy(dir).multiplyScalar(R);
      m.quaternion.setFromUnitVectors(up, dir);
      m.scale.y = 0.001;
      this.group.add(m);
      const lab = this.label('', { size: 0.3, color: D ? '#f4f4f6' : '#0d0d10', weight: 700 });
      return { m, dir, lab, name: it.label };
    });
    this.R = R;
  }
  frame() {
    this.pillars.forEach((p, i) => {
      const h = Math.max((this.cur[i] / this.dom) * 1.15, 0.001);
      p.m.scale.y = h;
      p.lab.sprite.position.copy(p.dir).multiplyScalar(this.R + h + 0.28);
      p.lab.set(`${p.name} ${fmt(this.cur[i])}`);
    });
  }
}

/* ---------- 3. Terrain ---------- */
class Terrain extends Graphic {
  spin(t) {
    return Math.sin(t * 0.25) * 0.5;
  }
  build() {
    const D = dark();
    const { items } = this.spec;
    const n = items.length;
    this.setView([0, 4.4, 8.4], [0, 0.4, 0.3]);
    this.peaks = items.map((it, i) => ({
      x: n > 1 ? (i - (n - 1) / 2) * (5 / (n - 1)) : 0,
      z: Math.sin(i * 2.1) * 0.9,
      lab: null,
    }));
    this.sigma = Math.min(0.6, 2.8 / Math.max(n, 1) + 0.15);

    const geo = new THREE.PlaneGeometry(6.6, 4.2, 66, 42);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.geo = geo;
    this.base = this.accent();
    this.low = new THREE.Color(D ? 0x1d1d26 : 0xe9e9f0);
    this.group.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide })
      )
    );
    this.group.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: D ? 0xffffff : 0x0d0d10,
          wireframe: true,
          transparent: true,
          opacity: D ? 0.07 : 0.06,
        })
      )
    );
    items.forEach((it, i) => {
      this.peaks[i].lab = this.label('', { size: 0.3, color: D ? '#f4f4f6' : '#0d0d10', weight: 700 });
      const name = this.label(it.label, { size: 0.3, color: D ? '#9a9aa5' : '#6c6c75', weight: 500 });
      name.sprite.position.set(this.peaks[i].x, 0.05, 2.4);
    });
  }
  frame(dt, t) {
    const p = this.geo.attributes.position;
    const c = this.geo.attributes.color;
    const s2 = 2 * this.sigma * this.sigma;
    const hs = 2.3 / this.dom;
    const hts = this.cur.map((v) => v * hs);
    const tmp = new THREE.Color();
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const z = p.getZ(v);
      let y = 0.035 * Math.sin(x * 3 + t * 1.4) * Math.sin(z * 3 + t);
      for (let k = 0; k < this.peaks.length; k++) {
        const dx = x - this.peaks[k].x;
        const dz = z - this.peaks[k].z;
        y += hts[k] * Math.exp(-(dx * dx + dz * dz) / s2);
      }
      p.setY(v, y);
      tmp.copy(this.low).lerp(this.base, Math.min(Math.max(y / 2.1, 0), 1));
      c.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    p.needsUpdate = true;
    c.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.peaks.forEach((pk, i) => {
      pk.lab.sprite.position.set(pk.x, hts[i] + 0.3, pk.z);
      pk.lab.set(fmt(this.cur[i]));
    });
  }
}

const CLASSES = { bars: Bars, globe: Globe, terrain: Terrain };
export function createGraphic(spec) {
  return new (CLASSES[spec.type] || Bars)(spec);
}

function fit(cam, aspect) {
  cam.aspect = aspect;
  cam.fov = aspect < 1.4 ? Math.min(72, (38 * 1.4) / aspect) : 38;
  cam.updateProjectionMatrix();
}

/* ---------- interactive stage: one WebGL canvas, orbit controls ---------- */
export function mountStage(el, graphic, { controls = true } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    el.classList.add('nogl');
    return { dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'gl';
  el.prepend(renderer.domElement);
  const cam = graphic.camera;

  let ctl;
  let tm;
  if (controls) {
    ctl = new OrbitControls(cam, renderer.domElement);
    ctl.enableDamping = true;
    ctl.enablePan = false;
    ctl.target.copy(graphic.lookAt);
    ctl.minDistance = 3.5;
    ctl.maxDistance = 20;
    if (graphic.spec.type !== 'globe') ctl.maxPolarAngle = Math.PI * 0.49;
    ctl.addEventListener('start', () => {
      clearTimeout(tm);
      graphic.paused = true;
      el.classList.add('touched');
    });
    ctl.addEventListener('end', () => {
      tm = setTimeout(() => (graphic.paused = false), 3500);
    });
  }

  const resize = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h);
    fit(cam, w / h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let visible = true;
  const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
  io.observe(el);

  let raf;
  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!visible) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    graphic.update(dt, now / 1000);
    ctl?.update();
    renderer.render(graphic.scene, cam);
  };
  raf = requestAnimationFrame(loop);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      clearTimeout(tm);
      ro.disconnect();
      io.disconnect();
      ctl?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/* ---------- thumbnails: ONE shared WebGL context paints many 2D canvases ---------- */
class ThumbHost {
  constructor() {
    this.entries = new Set();
    this.renderer = null;
    this.failed = false;
    this.raf = 0;
    this.last = 0;
    this.io = new IntersectionObserver((list) => {
      list.forEach((e) => {
        for (const en of this.entries) if (en.canvas === e.target) en.visible = e.isIntersecting;
      });
    });
  }
  add(canvas, graphic) {
    const en = { canvas, graphic, visible: false, ctx: canvas.getContext('2d') };
    this.entries.add(en);
    this.io.observe(canvas);
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.loop(t));
    return () => {
      this.entries.delete(en);
      this.io.unobserve(canvas);
    };
  }
  ensure() {
    if (this.renderer || this.failed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      this.failed = true;
    }
  }
  loop(now) {
    this.raf = this.entries.size ? requestAnimationFrame((t) => this.loop(t)) : 0;
    if (now - this.last < 33) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.ensure();
    if (!this.renderer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    for (const en of this.entries) {
      if (!en.visible) continue;
      const w = Math.round(en.canvas.clientWidth * dpr);
      const h = Math.round(en.canvas.clientHeight * dpr);
      if (!w || !h) continue;
      if (en.canvas.width !== w || en.canvas.height !== h) {
        en.canvas.width = w;
        en.canvas.height = h;
      }
      this.renderer.setSize(w, h, false);
      fit(en.graphic.camera, w / h);
      en.graphic.update(dt, now / 1000);
      this.renderer.render(en.graphic.scene, en.graphic.camera);
      en.ctx.clearRect(0, 0, w, h);
      en.ctx.drawImage(this.renderer.domElement, 0, 0);
    }
  }
}
export const thumbs = new ThumbHost();
