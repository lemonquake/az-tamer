// ============================================================
// AZ Tamer — THE BESTIARY
// Hand-sculpted Guardian models. Every species here gets its
// own anatomy, its own procedurally painted texture set, and
// its own idle animation rig (breathing, blinking, flame
// flicker, fin flutter, undulation...). Builders face +X and
// are wrapped/oriented by makeGuardian in models.ts.
// ============================================================
import * as THREE from 'three';

export interface BespokeBuild {
  body: THREE.Group;
  parts: { head?: THREE.Object3D; tail?: THREE.Object3D; wings?: THREE.Object3D[] };
  animate: (t: number, dt: number) => void;
}
export type BespokeBuilder = () => BespokeBuild;

// ---------------- shared utilities ----------------
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const texCache = new Map<string, THREE.Texture>();
function ctex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function orb(m: THREE.Material, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, w = 16, h = 12): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
  me.position.set(x, y, z);
  me.scale.set(sx, sy, sz);
  return me;
}

/** Tapered limb/horn segment from point a to point b (bottom radius at a). */
function bone(m: THREE.Material, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, rA: number, rB = rA, seg = 9): THREE.Mesh {
  const a = v3(ax, ay, az);
  const d = v3(bx, by, bz).sub(a);
  const len = d.length();
  const geo = new THREE.CylinderGeometry(rB, rA, len, seg);
  geo.translate(0, len / 2, 0);
  const me = new THREE.Mesh(geo, m);
  me.position.copy(a);
  me.quaternion.setFromUnitVectors(v3(0, 1, 0), d.normalize());
  return me;
}

const spike = (m: THREE.Material, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, r: number) => bone(m, ax, ay, az, bx, by, bz, r, 0.004, 7);

/** Cartoon eye: sclera, glossy iris, pupil (round or slit), catch-light. */
function makeEye(r: number, iris: number, o: { glow?: number; slit?: boolean; sclera?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  g.add(orb(std({ color: o.sclera ?? 0xffffff, roughness: 0.25 }), r, 0, 0, 0, 1, 1, 1, 12, 10));
  g.add(orb(std({ color: iris, emissive: iris, emissiveIntensity: o.glow ?? 0.3, roughness: 0.2 }),
    r * 0.62, r * 0.5, 0, 0, 0.55, 1, 1, 10, 8));
  g.add(orb(std({ color: 0x0a0a12, roughness: 0.15 }),
    r * 0.3, r * 0.74, 0, 0, 0.5, o.slit ? 1.45 : 1, o.slit ? 0.38 : 1, 8, 6));
  const glint = orb(std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0 }),
    r * 0.12, r * 0.78, r * 0.34, r * 0.24, 1, 1, 1, 6, 5);
  glint.userData.noShadow = true;
  g.add(glint);
  return g;
}

/** Layered additive flame (outer sheath + hot core). Animate via group scale. */
function makeFlame(h: number, r: number, core = 0xfff0a8, edge = 0xff8a3a): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7),
    new THREE.MeshBasicMaterial({ color: edge, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  outer.position.y = h / 2;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, h * 0.68, 6),
    new THREE.MeshBasicMaterial({ color: core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.y = h * 0.32;
  outer.userData.noShadow = true;
  inner.userData.noShadow = true;
  g.add(outer, inner);
  return g;
}

/** Translucent fin fan: a circle sector with painted membrane rays. */
function makeFin(mat: THREE.Material, radius: number, thetaStart: number, thetaLength: number): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.CircleGeometry(radius, 10, thetaStart, thetaLength), mat);
  me.userData.noShadow = true;
  return me;
}

/** Periodic spiky pulse in [0,1] — for twitches, snarls, glances. */
const gate = (t: number, period: number, sharp = 10) =>
  Math.pow(Math.max(0, Math.sin((t / period) * Math.PI * 2)), sharp);

/** Short eyelid sweep in [0,1] once per `period` seconds. */
function blinkAt(t: number, period: number, off = 0): number {
  const ph = ((t + off) % period + period) % period;
  const d = 0.13;
  return ph < d ? Math.sin((ph / d) * Math.PI) : 0;
}

interface Flick { g: THREE.Object3D; speed: number; ph: number; amp: number; }
function flickAll(list: Flick[], t: number): void {
  for (const f of list) {
    const k = 1 + Math.sin(t * f.speed + f.ph) * f.amp + Math.sin(t * f.speed * 2.63 + f.ph * 1.7) * f.amp * 0.55;
    const inv = 1 + (1 - k) * 0.7; // stretch up = thin out, like a real flame
    f.g.scale.set(inv, k, inv);
    f.g.rotation.y = Math.sin(t * f.speed * 0.6 + f.ph) * 0.3;
  }
}

function finishShadows(g: THREE.Group): void {
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.noShadow) o.castShadow = true; });
}

// ---------------- procedural texture painters ----------------

/** Soft directional fur: layered strokes over a shaded base. */
function furTex(key: string, base: string, dark: string, lite: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    const grd = ctx.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 850; i++) {
      const x = rnd() * s, y = rnd() * s, len = 6 + rnd() * 11;
      const a = Math.PI / 2 + (rnd() - 0.5) * 0.8;
      ctx.strokeStyle = rnd() < 0.5 ? dark : lite;
      ctx.globalAlpha = 0.08 + rnd() * 0.16;
      ctx.lineWidth = 1 + rnd();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/** Branching crack layout shared by a color map and its emissive twin. */
function crackData(seed: number, s: number): number[][][] {
  const rnd = rng(seed);
  const cracks: number[][][] = [];
  for (let i = 0; i < 13; i++) {
    const pts: number[][] = [];
    let x = rnd() * s, y = rnd() * s;
    pts.push([x, y]);
    const n = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) {
      x += rnd() * 44 - 22; y += rnd() * 44 - 22;
      pts.push([x, y]);
    }
    cracks.push(pts);
  }
  return cracks;
}

/** Volcanic hide: dark mottled base with glowing magma cracks (map + emissive). */
function crackPair(key: string, base: string, mottle: string, glow: string, seed: number): { map: THREE.Texture; glow: THREE.Texture } {
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    const rnd = rng(seed + 500);
    const cracks = crackData(seed, s);
    if (mode === 'map') {
      ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = rnd() < 0.5 ? mottle : 'rgba(0,0,0,0.18)';
        ctx.globalAlpha = 0.1 + rnd() * 0.2;
        ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(10,4,2,0.8)'; ctx.lineWidth = 3.4;
      for (const c of cracks) {
        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
        for (const p of c) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
      for (const c of cracks) {
        for (const [w, a] of [[4.5, 0.45], [2, 1]] as const) {
          ctx.strokeStyle = glow; ctx.globalAlpha = a; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
          for (const p of c) ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
        // hot nodes where cracks kink
        for (const p of c) {
          if (rnd() < 0.4) continue;
          const g = ctx.createRadialGradient(p[0], p[1], 0.5, p[0], p[1], 7);
          g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.85; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Wavy flame stripes (map darkens them, glow ignites them). */
function stripePair(key: string, base: string, stripeDark: string, glow: string, seed: number): { map: THREE.Texture; glow: THREE.Texture } {
  const layout = (s: number) => {
    const rnd = rng(seed);
    const bands: { x: number; w: number; wob: number; amp: number }[] = [];
    for (let i = 0; i < 8; i++) bands.push({ x: (i + rnd() * 0.6) * (s / 8), w: 10 + rnd() * 14, wob: rnd() * 6, amp: 8 + rnd() * 12 });
    return bands;
  };
  const drawBand = (ctx: CanvasRenderingContext2D, s: number, b: { x: number; w: number; wob: number; amp: number }) => {
    ctx.beginPath();
    ctx.moveTo(b.x + Math.sin(b.wob) * b.amp, 0);
    for (let y = 0; y <= s; y += 12) ctx.lineTo(b.x + Math.sin(y * 0.035 + b.wob) * b.amp, y);
    for (let y = s; y >= 0; y -= 12) ctx.lineTo(b.x + b.w + Math.sin(y * 0.035 + b.wob + 0.5) * b.amp, y);
    ctx.closePath(); ctx.fill();
  };
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    const bands = layout(s);
    if (mode === 'map') {
      const rnd = rng(seed + 9);
      ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 600; i++) {
        ctx.globalAlpha = 0.06 + rnd() * 0.12;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';
        ctx.fillRect(rnd() * s, rnd() * s, 2, 3 + rnd() * 5);
      }
      ctx.globalAlpha = 0.8; ctx.fillStyle = stripeDark;
      for (const b of bands) drawBand(ctx, s, b);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = glow; ctx.globalAlpha = 0.9;
      for (const b of bands) drawBand(ctx, s, b);
      ctx.globalAlpha = 1;
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Cracked basalt plates with molten seams between them. */
function platePair(key: string, plate: string, gapGlow: string, seed: number): { map: THREE.Texture; glow: THREE.Texture } {
  const layout = (s: number) => {
    const rnd = rng(seed);
    const plates: { x: number; y: number; w: number; h: number; rot: number; tone: number }[] = [];
    const n = 4;
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      plates.push({
        x: (gx + 0.5) * s / n + (rnd() - 0.5) * 10, y: (gy + 0.5) * s / n + (rnd() - 0.5) * 10,
        w: s / n - 7 - rnd() * 6, h: s / n - 7 - rnd() * 6, rot: (rnd() - 0.5) * 0.22, tone: rnd(),
      });
    }
    return plates;
  };
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    const plates = layout(s);
    if (mode === 'map') {
      ctx.fillStyle = '#160a06'; ctx.fillRect(0, 0, s, s);
      for (const p of plates) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = plate;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = p.tone > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.16)';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, 4);
        ctx.restore();
      }
    } else {
      // molten light leaks through every gap: paint glow, then mask plates black
      ctx.fillStyle = gapGlow; ctx.fillRect(0, 0, s, s);
      for (const p of plates) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = '#000';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Furnace grate: iron slats over a white-hot interior. */
function furnacePair(key: string): { map: THREE.Texture; glow: THREE.Texture } {
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    if (mode === 'map') {
      ctx.fillStyle = '#1c1410'; ctx.fillRect(0, 0, s, s);
      for (let y = 10; y < s; y += 34) {
        ctx.fillStyle = '#2e241c'; ctx.fillRect(6, y, s - 12, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(6, y, s - 12, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(6, y + 13, s - 12, 3);
      }
      ctx.strokeStyle = '#0c0805'; ctx.lineWidth = 10; ctx.strokeRect(2, 2, s - 4, s - 4);
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
      const g = ctx.createRadialGradient(s / 2, s / 2, 8, s / 2, s / 2, s * 0.62);
      g.addColorStop(0, '#fff4c8'); g.addColorStop(0.45, '#ff9a3a'); g.addColorStop(1, '#a82a08');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#000';
      for (let y = 10; y < s; y += 34) ctx.fillRect(6, y, s - 12, 16);
      ctx.fillRect(0, 0, s, 8); ctx.fillRect(0, s - 8, s, 8); ctx.fillRect(0, 0, 8, s); ctx.fillRect(s - 8, 0, 8, s);
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Overlapping fish scales with a lit top edge. */
function scaleTex(key: string, base: string, lite: string, dark: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    const rad = 16;
    for (let row = 0; row * rad * 1.35 < s + rad; row++) {
      const y = row * rad * 1.35;
      const off = row % 2 ? rad : 0;
      for (let x = -rad; x < s + rad; x += rad * 2) {
        const cx = x + off;
        const v = rnd() * 0.18 - 0.09;
        ctx.fillStyle = base;
        ctx.beginPath(); ctx.arc(cx, y, rad, 0, Math.PI); ctx.fill();
        ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
        ctx.beginPath(); ctx.arc(cx, y, rad, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(cx, y, rad, 0.08 * Math.PI, 0.92 * Math.PI); ctx.stroke();
        ctx.strokeStyle = lite; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(cx, y - 3, rad - 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // wet sheen specks
    for (let i = 0; i < 110; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  });
}

/** Watery gel body: vertical depth gradient, caustic rings, sparkle. */
function gelTex(key: string, deep: string, mid: string, lite: string): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(404);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, lite); g.addColorStop(0.45, mid); g.addColorStop(1, deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    for (let i = 0; i < 16; i++) {
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 8 + rnd() * 26, rnd() * Math.PI, rnd() * Math.PI + 1.5 + rnd() * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.25})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 2, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/** Celestial pelt: molten gold with flame licks and pin-prick stars. */
function starPair(key: string, seed: number): { map: THREE.Texture; glow: THREE.Texture } {
  const starData = (s: number) => {
    const rnd = rng(seed);
    const stars: number[][] = [];
    for (let i = 0; i < 90; i++) stars.push([rnd() * s, rnd() * s, 0.8 + rnd() * 1.8]);
    const licks: number[][] = [];
    for (let i = 0; i < 26; i++) licks.push([rnd() * s, rnd() * s, 20 + rnd() * 40, rnd() * Math.PI * 2]);
    return { stars, licks };
  };
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    const { stars, licks } = starData(s);
    if (mode === 'map') {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#ffb83a'); g.addColorStop(0.55, '#e8920e'); g.addColorStop(1, '#b8650a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (const [x, y, len, a] of licks) {
        ctx.strokeStyle = 'rgba(255,210,120,0.22)';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 12,
          x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,250,230,0.9)';
      for (const [x, y, r] of stars) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const [x, y, len, a] of licks) {
        ctx.strokeStyle = 'rgba(255,140,40,0.30)';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 12,
          x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      for (const [x, y, r] of stars) {
        const g = ctx.createRadialGradient(x, y, 0.2, x, y, r * 3.2);
        g.addColorStop(0, '#fffbe8'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Translucent fin membrane with radiating rays (alpha-mapped). */
function finTex(key: string, base: [number, number, number], ray: [number, number, number]): THREE.Texture {
  const t = ctex(key, 128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},0.9)`);
    g.addColorStop(0.75, `rgba(${base[0]},${base[1]},${base[2]},0.55)`);
    g.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},0.12)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${ray[0]},${ray[1]},${ray[2]},0.6)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s / 2, s / 2);
      ctx.lineTo(s / 2 + Math.cos(a) * s * 0.5, s / 2 + Math.sin(a) * s * 0.5);
      ctx.stroke();
    }
  });
  return t;
}

// reusable fin material factory (textures cached, materials fresh per rig)
function finMat(key: string, base: [number, number, number], ray: [number, number, number], opacity = 0.75): THREE.MeshStandardMaterial {
  return std({
    map: finTex(key, base, ray), transparent: true, opacity,
    side: THREE.DoubleSide, roughness: 0.3, metalness: 0.05, depthWrite: false,
  });
}

// ============================================================
// CINDCUB — a roly-poly ember bear cub. Soot-orange fur, cream
// belly, glowing inner ears, a crown of baby flames and a
// candle-flame tail it is visibly proud of.
// ============================================================
function buildCindcub(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const bodyM = std({ map: furTex('cind-fur', '#c84b28', '#8a2f16', '#e8753a', 11), roughness: 0.9 });
  const bellyM = std({ map: furTex('cind-belly', '#f2b66a', '#d99440', '#ffd9a0', 12), roughness: 0.9 });
  const sootM = std({ color: 0x3a241c, roughness: 0.85 });
  const emberM = std({ color: 0xffb44e, emissive: 0xff7a2a, emissiveIntensity: 1.3, roughness: 0.4 });

  const torso = orb(bodyM, 0.34, 0, 0.48, 0, 1.12, 1, 0.98);
  core.add(torso);
  core.add(orb(bellyM, 0.27, 0.13, 0.42, 0, 0.9, 0.85, 0.8));

  // head
  const head = new THREE.Group();
  head.position.set(0.26, 0.8, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.29, 0, 0, 0, 1, 0.95, 1.02));
  head.add(orb(bellyM, 0.15, 0.2, -0.08, 0, 1.05, 0.75, 0.95));
  head.add(orb(sootM, 0.055, 0.33, -0.03, 0, 1, 0.8, 1, 8, 7));
  const eyeL = makeEye(0.075, 0x8a4416);
  const eyeR = makeEye(0.075, 0x8a4416);
  eyeL.position.set(0.2, 0.06, 0.13); eyeL.rotation.y = -0.18;
  eyeR.position.set(0.2, 0.06, -0.13); eyeR.rotation.y = 0.18;
  head.add(eyeL, eyeR);
  // cheek fluff
  for (const side of [1, -1]) {
    head.add(spike(bodyM, 0.08, -0.06, side * 0.24, 0.02, -0.12, side * 0.34, 0.05));
    head.add(spike(bodyM, 0.05, -0.01, side * 0.26, -0.04, -0.04, side * 0.37, 0.045));
  }
  // ears with glowing inner cones
  const mkEar = (side: 1 | -1) => {
    const ear = new THREE.Group();
    ear.position.set(0.02, 0.24, side * 0.16);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 7), bodyM);
    outer.position.y = 0.08;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.12, 6), emberM);
    inner.position.set(0.02, 0.06, 0);
    ear.add(outer, inner);
    ear.rotation.x = side * 0.4;
    head.add(ear);
    return ear;
  };
  const earL = mkEar(1), earR = mkEar(-1);

  // crown of baby flames
  const flick: Flick[] = [];
  const addFlame = (parent: THREE.Object3D, x: number, y: number, z: number, h: number, r: number, speed = 9, tiltZ = 0) => {
    const f = makeFlame(h, r);
    f.position.set(x, y, z);
    f.rotation.z = tiltZ;
    parent.add(f);
    flick.push({ g: f, speed, ph: Math.random() * 9, amp: 0.16 });
    return f;
  };
  addFlame(head, 0, 0.3, 0, 0.17, 0.055);
  addFlame(head, -0.08, 0.27, 0.06, 0.12, 0.04, 11);
  addFlame(head, -0.07, 0.27, -0.07, 0.1, 0.035, 12);

  // ember scales down the spine
  for (let i = 0; i < 4; i++) {
    const sc = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), emberM);
    sc.position.set(-0.02 - i * 0.09, 0.78 - i * 0.045, (i % 2 ? 0.05 : -0.05));
    core.add(sc);
  }

  // stubby legs + soot paws
  for (const [hx, hz] of [[0.18, 0.18], [0.18, -0.18], [-0.17, 0.18], [-0.17, -0.18]] as const) {
    core.add(bone(bodyM, hx, 0.4, hz, hx + 0.015, 0.1, hz, 0.085, 0.075));
    core.add(orb(sootM, 0.085, hx + 0.02, 0.085, hz, 1.1, 0.7, 1.1, 10, 8));
  }

  // flame-tipped tail
  const tail = new THREE.Group();
  tail.position.set(-0.33, 0.58, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(bodyM, 0, 0, 0, -0.17, 0.12, 0, 0.07, 0.045));
  addFlame(tail, -0.19, 0.13, 0, 0.27, 0.078, 8, -0.5);

  finishShadows(g);

  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.6) * 0.03;
    torso.scale.set(1.12, 1 + Math.sin(t * 2.6) * 0.03, 0.98);
    head.rotation.y = Math.sin(t * 0.7) * 0.18;
    head.rotation.z = Math.sin(t * 0.5 + 1) * 0.06 + gate(t, 9.3) * 0.16;
    const tw = gate(t + 1.7, 6.1, 14);
    earL.rotation.x = 0.4 + Math.sin(t * 22) * 0.16 * tw;
    earR.rotation.x = -0.4 - Math.sin(t * 22 + 1) * 0.16 * tw;
    const bl = blinkAt(t, 4.7);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * bl;
    tail.rotation.y = Math.sin(t * 2.1) * 0.24;
    tail.rotation.x = Math.sin(t * 1.6 + 0.5) * 0.08;
    emberM.emissiveIntensity = 1.1 + Math.sin(t * 3.4) * 0.35 + Math.sin(t * 7.1) * 0.2;
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// PYROFANG — a lean ember wolf. Dark red hide cut by wavy
// flame stripes that surge with its pulse, a burning mane down
// the spine, a panting jaw and a lashing twin-flame tail.
// ============================================================
function buildPyrofang(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const stripes = stripePair('pyro-hide', '#a8341a', '#5e1a0c', '#ff5a1e', 21);
  const bodyM = std({ map: stripes.map, emissiveMap: stripes.glow, emissive: 0xff6a2a, emissiveIntensity: 0.45, roughness: 0.85 });
  const underM = std({ map: furTex('pyro-under', '#d97b3a', '#b35a24', '#f2a45e', 22), roughness: 0.9 });
  const sootM = std({ color: 0x2e1a14, roughness: 0.8 });
  const fangM = std({ color: 0xfff4e0, roughness: 0.35 });

  // frame
  const chest = orb(bodyM, 0.3, 0.2, 0.66, 0, 1.15, 1.02, 0.92);
  core.add(chest);
  core.add(orb(bodyM, 0.24, -0.07, 0.64, 0, 1.25, 0.85, 0.85));
  core.add(orb(bodyM, 0.28, -0.34, 0.62, 0, 1.05, 1, 0.9));
  core.add(orb(underM, 0.2, 0.05, 0.52, 0, 1.5, 0.7, 0.8)); // underbelly
  core.add(bone(bodyM, 0.34, 0.78, 0, 0.52, 0.92, 0, 0.14, 0.11));

  // neck ruff
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    core.add(spike(underM, 0.32, 0.78 + Math.cos(a) * 0.13, Math.sin(a) * 0.16,
      0.16, 0.78 + Math.cos(a) * 0.24, Math.sin(a) * 0.28, 0.05));
  }

  // head
  const head = new THREE.Group();
  head.position.set(0.56, 0.96, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.2, 0, 0, 0, 1.15, 0.9, 0.95));
  head.add(bone(underM, 0.12, -0.02, 0, 0.34, -0.07, 0, 0.095, 0.07));
  head.add(orb(sootM, 0.05, 0.36, -0.05, 0, 1, 0.8, 1, 8, 7));
  // brows + fierce eyes
  const eyeL = makeEye(0.06, 0xffb13a, { glow: 0.8 });
  const eyeR = makeEye(0.06, 0xffb13a, { glow: 0.8 });
  eyeL.position.set(0.15, 0.07, 0.12); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.15, 0.07, -0.12); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  for (const side of [1, -1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.06), sootM);
    brow.position.set(0.17, 0.135, side * 0.11);
    brow.rotation.z = -0.15;
    brow.rotation.x = -side * 0.25;
    head.add(brow);
    head.add(spike(fangM, 0.3, -0.1, side * 0.055, 0.31, -0.17, side * 0.06, 0.018)); // upper fangs
  }
  // panting jaw
  const jaw = new THREE.Group();
  jaw.position.set(0.1, -0.12, 0);
  head.add(jaw);
  jaw.add(bone(underM, 0, 0, 0, 0.22, -0.025, 0, 0.06, 0.042));
  jaw.add(spike(fangM, 0.19, -0.01, 0.035, 0.2, 0.045, 0.035, 0.013));
  jaw.add(spike(fangM, 0.19, -0.01, -0.035, 0.2, 0.045, -0.035, 0.013));
  const tongueM = std({ color: 0xd9543a, roughness: 0.6 });
  jaw.add(orb(tongueM, 0.035, 0.12, 0.005, 0, 1.8, 0.4, 0.8, 8, 6));
  // swept-back ears (grouped so the twitch doesn't undo their sweep)
  const earL = new THREE.Group(), earR = new THREE.Group();
  earL.position.set(-0.02, 0.16, 0.1);
  earR.position.set(-0.02, 0.16, -0.1);
  earL.add(spike(bodyM, 0, 0, 0, -0.12, 0.16, 0.03, 0.055));
  earR.add(spike(bodyM, 0, 0, 0, -0.12, 0.16, -0.03, 0.055));
  head.add(earL, earR);

  // burning mane along the spine
  const flick: Flick[] = [];
  const mane = (x: number, y: number, h: number, r: number) => {
    const f = makeFlame(h, r);
    f.position.set(x, y, 0);
    f.rotation.z = -0.55;
    core.add(f);
    flick.push({ g: f, speed: 8 + Math.random() * 3, ph: Math.random() * 9, amp: 0.18 });
  };
  mane(0.42, 1.0, 0.22, 0.06);
  mane(0.27, 1.0, 0.26, 0.07);
  mane(0.1, 0.94, 0.22, 0.06);
  mane(-0.07, 0.88, 0.18, 0.05);
  mane(-0.23, 0.8, 0.14, 0.045);

  // legs (digitigrade, claws)
  const leg = (hx: number, hz: number, rear: boolean) => {
    const kx = rear ? hx - 0.09 : hx + 0.04;
    core.add(bone(bodyM, hx, rear ? 0.58 : 0.6, hz, kx, 0.32, hz, rear ? 0.11 : 0.09, 0.06));
    core.add(bone(underM, kx, 0.32, hz, hx + (rear ? 0.07 : 0.015), 0.08, hz, 0.055, 0.045));
    const px = hx + (rear ? 0.09 : 0.03);
    core.add(orb(sootM, 0.07, px, 0.06, hz, 1.3, 0.7, 1, 9, 7));
    for (const cz of [-0.03, 0, 0.03]) core.add(spike(fangM, px + 0.05, 0.05, hz + cz, px + 0.11, 0.02, hz + cz, 0.014));
  };
  leg(0.26, 0.18, false); leg(0.26, -0.18, false);
  leg(-0.33, 0.19, true); leg(-0.33, -0.19, true);

  // two-segment tail ending in flame
  const tail = new THREE.Group();
  tail.position.set(-0.58, 0.7, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(bodyM, 0, 0, 0, -0.26, 0.1, 0, 0.06, 0.04));
  const tailTip = new THREE.Group();
  tailTip.position.set(-0.26, 0.1, 0);
  tail.add(tailTip);
  tailTip.add(bone(bodyM, 0, 0, 0, -0.16, 0.12, 0, 0.04, 0.025));
  const tf = makeFlame(0.3, 0.08);
  tf.position.set(-0.18, 0.13, 0);
  tf.rotation.z = 0.45;
  tailTip.add(tf);
  flick.push({ g: tf, speed: 8.5, ph: 2, amp: 0.2 });

  finishShadows(g);

  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.2) * 0.025;
    core.rotation.z = Math.sin(t * 2.2) * 0.012;
    chest.scale.set(1.15, 1.02 + Math.sin(t * 2.2) * 0.03, 0.92);
    head.rotation.y = Math.sin(t * 0.5) * 0.22;
    head.rotation.x = -gate(t, 8.2) * 0.1;
    jaw.rotation.z = -(0.05 + gate(t + 2, 7.4, 6) * 0.22 + Math.max(0, Math.sin(t * 2.2)) * 0.03);
    earL.rotation.x = Math.sin(t * 1.3) * 0.1;
    earR.rotation.x = -Math.sin(t * 1.3 + 0.7) * 0.1;
    tail.rotation.y = Math.sin(t * 1.8) * 0.35;
    tailTip.rotation.y = Math.sin(t * 1.8 - 0.7) * 0.3;
    bodyM.emissiveIntensity = 0.4 + Math.sin(t * 2.7) * 0.18 + gate(t, 5.3, 4) * 0.4;
    const bl = blinkAt(t, 5.6, 1.3);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * bl;
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// BLAZEMAW — a knuckle-walking furnace ape. Basalt plate hide
// leaking magma light at every seam, a riveted furnace grate
// for a chest that breathes white-hot, obsidian pauldrons with
// smoking vents, and an underbit jaw full of tusks.
// ============================================================
function buildBlazemaw(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const hide = platePair('bmaw-hide', '#6e2414', '#ff6a22', 31);
  const bodyM = std({ map: hide.map, emissiveMap: hide.glow, emissive: 0xff7a2a, emissiveIntensity: 0.55, roughness: 0.7 });
  const obsM = std({ color: 0x231a1e, roughness: 0.35, metalness: 0.25, flatShading: true });
  const furnace = furnacePair('bmaw-furnace');
  const chestM = std({ map: furnace.map, emissiveMap: furnace.glow, emissive: 0xffa24e, emissiveIntensity: 1.4, roughness: 0.6 });
  const jawM = std({ color: 0x8a4030, roughness: 0.8 });
  const fangM = std({ color: 0xfff0d8, roughness: 0.35 });
  const emberM = std({ color: 0xffb44e, emissive: 0xff7a2a, emissiveIntensity: 1.2, roughness: 0.4 });
  const mouthM = new THREE.MeshBasicMaterial({ color: 0xff5a1e });

  core.add(orb(bodyM, 0.3, 0, 0.6, 0, 1.05, 0.85, 0.95)); // hips

  // torso group (breathes — pauldrons, head and vents ride along)
  const torso = new THREE.Group();
  torso.position.set(0, 1.02, 0);
  core.add(torso);
  const barrel = orb(bodyM, 0.48, 0, 0.04, 0, 1.05, 1.08, 0.92);
  torso.add(barrel);
  torso.add(orb(bodyM, 0.2, 0.34, 0.26, 0.2, 0.9, 0.6, 1)); // pecs
  torso.add(orb(bodyM, 0.2, 0.34, 0.26, -0.2, 0.9, 0.6, 1));
  // furnace chest grate
  const grate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.34), chestM);
  grate.position.set(0.44, 0.0, 0);
  grate.rotation.z = -0.1;
  torso.add(grate);

  // pauldrons + smoke vents with ember-hot tips
  for (const side of [1, -1]) {
    const pad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 0), obsM);
    pad.position.set(0.02, 0.34, side * 0.52);
    pad.scale.set(1.1, 0.85, 1);
    torso.add(pad);
    for (let i = 0; i < 3; i++) {
      const vx = -0.08 + i * 0.1;
      torso.add(bone(obsM, vx, 0.5, side * (0.5 + i * 0.02), vx - 0.04, 0.64, side * (0.52 + i * 0.02), 0.04, 0.032));
      torso.add(orb(emberM, 0.026, vx - 0.045, 0.655, side * (0.52 + i * 0.02), 1, 1, 1, 7, 6));
    }
  }

  // back armor ridge
  for (const [bx, by, bz, h] of [[-0.46, 0.3, 0, 0.24], [-0.5, 0.1, 0.13, 0.18], [-0.5, 0.1, -0.13, 0.18], [-0.44, -0.12, 0, 0.16]] as const) {
    torso.add(spike(obsM, bx, by, bz, bx - h, by + h * 0.7, bz, 0.07));
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), emberM);
    o.position.set(bx + 0.02, by - 0.07, bz);
    torso.add(o);
  }

  // head — sunk between the shoulders
  const head = new THREE.Group();
  head.position.set(0.3, 0.46, 0);
  head.name = 'head';
  torso.add(head);
  head.add(orb(bodyM, 0.2, 0, 0, 0, 1.05, 0.9, 0.95));
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.3), obsM);
  brow.position.set(0.1, 0.1, 0);
  brow.rotation.z = -0.12;
  head.add(brow);
  const eyeL = makeEye(0.05, 0xffc44e, { glow: 1.2 });
  const eyeR = makeEye(0.05, 0xffc44e, { glow: 1.2 });
  eyeL.position.set(0.16, 0.04, 0.1); eyeL.rotation.y = -0.2;
  eyeR.position.set(0.16, 0.04, -0.1); eyeR.rotation.y = 0.2;
  head.add(eyeL, eyeR);
  for (const side of [1, -1]) {
    head.add(bone(obsM, 0.04, 0.2, side * 0.12, -0.14, 0.36, side * 0.2, 0.05, 0.012));
  }
  // underbite jaw with tusks
  const jaw = new THREE.Group();
  jaw.position.set(0.04, -0.07, 0);
  head.add(jaw);
  jaw.add(orb(jawM, 0.13, 0.1, -0.02, 0, 1.35, 0.55, 1.05));
  jaw.add(spike(fangM, 0.22, 0.0, 0.09, 0.25, 0.12, 0.1, 0.026));
  jaw.add(spike(fangM, 0.22, 0.0, -0.09, 0.25, 0.12, -0.1, 0.026));
  jaw.add(spike(fangM, 0.25, 0.0, 0.03, 0.27, 0.08, 0.03, 0.018));
  jaw.add(spike(fangM, 0.25, 0.0, -0.03, 0.27, 0.08, -0.03, 0.018));
  const mouthGlow = orb(mouthM, 0.07, 0.1, 0.03, 0, 1.4, 0.5, 1, 8, 6);
  mouthGlow.userData.noShadow = true;
  jaw.add(mouthGlow);

  // arms — massive, knuckles planted
  const arms: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.04, 1.32, side * 0.52);
    core.add(arm);
    arm.add(bone(bodyM, 0, 0, 0, 0.16, -0.38, side * 0.1, 0.13, 0.12));
    arm.add(orb(bodyM, 0.14, 0.16, -0.38, side * 0.1, 1, 1, 1, 12, 9));
    arm.add(bone(bodyM, 0.16, -0.38, side * 0.1, 0.3, -0.85, side * 0.08, 0.17, 0.14));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.1), obsM);
    plate.position.set(0.27, -0.62, side * (0.08 + 0.13));
    plate.rotation.z = -0.25;
    arm.add(plate);
    const fist = orb(bodyM, 0.2, 0.33, -0.97, side * 0.08, 1.05, 0.95, 1.1, 14, 10);
    arm.add(fist);
    for (let k = 0; k < 3; k++) {
      arm.add(orb(obsM, 0.05, 0.46, -0.9, side * 0.08 + (k - 1) * 0.09, 1, 1, 1, 7, 6));
    }
    arms.push(arm);
  }

  // stout legs + flat feet
  for (const side of [1, -1]) {
    core.add(bone(bodyM, 0, 0.55, side * 0.24, 0.06, 0.3, side * 0.27, 0.15, 0.12));
    core.add(bone(bodyM, 0.06, 0.3, side * 0.27, 0.02, 0.12, side * 0.27, 0.12, 0.1));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), bodyM);
    foot.position.set(0.1, 0.06, side * 0.27);
    core.add(foot);
    for (const cz of [-0.07, 0, 0.07]) core.add(spike(obsM, 0.24, 0.06, side * 0.27 + cz, 0.34, 0.03, side * 0.27 + cz, 0.03));
  }

  finishShadows(g);

  const animate = (t: number) => {
    const br = Math.sin(t * 1.4);
    torso.scale.set(1, 1 + br * 0.035, 1);
    torso.position.y = 1.02 + br * 0.02;
    arms[0].rotation.x = br * 0.025;
    arms[1].rotation.x = -br * 0.025;
    arms[0].rotation.z = 0.02 * Math.sin(t * 1.4 + 1);
    arms[1].rotation.z = -0.02 * Math.sin(t * 1.4 + 1.4);
    // furnace heart: deep double-thump
    const thump = Math.pow(Math.max(0, Math.sin(t * 2.4)), 3);
    chestM.emissiveIntensity = 1.1 + thump * 1.2 + 0.3 * Math.sin(t * 4.8);
    bodyM.emissiveIntensity = 0.45 + thump * 0.35 + Math.sin(t * 2.4 - 0.6) * 0.12;
    const bellow = gate(t, 6.5, 5);
    jaw.rotation.z = -(0.04 + bellow * 0.3);
    (mouthGlow.material as THREE.MeshBasicMaterial).color.setHSL(0.06, 1, 0.5 + bellow * 0.3);
    emberM.emissiveIntensity = 1 + Math.sin(t * 6.2) * 0.4 + bellow * 0.6;
    head.rotation.y = Math.sin(t * 0.45) * 0.12;
    core.rotation.z = Math.sin(t * 0.9) * 0.014;
    core.position.x = Math.sin(t * 0.9) * 0.012;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// INFERNYX — the volcano tyrant. A wingless dragon with
// lava-vein hide, obsidian horns and dorsal blades, armored
// belly scutes, a mace-tipped tail, and a jaw that leaks
// firelight whenever it breathes.
// ============================================================
function buildInfernyx(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const hide = crackPair('inf-hide', '#5e1a0e', '#8a2a14', '#ff8a2a', 41);
  const bodyM = std({ map: hide.map, emissiveMap: hide.glow, emissive: 0xff8a2a, emissiveIntensity: 0.55, roughness: 0.75 });
  const scuteM = std({ color: 0xd9824a, roughness: 0.8 });
  const obsM = std({ color: 0x1f161a, roughness: 0.3, metalness: 0.3, flatShading: true });
  const fangM = std({ color: 0xfff0d8, roughness: 0.35 });
  const mouthM = new THREE.MeshBasicMaterial({ color: 0xff4a16 });

  core.add(orb(bodyM, 0.34, -0.05, 0.92, 0, 1.1, 0.95, 1)); // hips
  const chest = orb(bodyM, 0.36, 0.3, 1.1, 0, 1.15, 1, 0.9);
  core.add(chest);
  // belly scutes
  for (const [sx, sy, w] of [[0.52, 0.98, 0.4], [0.47, 0.84, 0.42], [0.4, 0.7, 0.4], [0.32, 0.57, 0.36]] as const) {
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, w), scuteM);
    sc.position.set(sx, sy, 0);
    sc.rotation.z = -0.45;
    core.add(sc);
  }
  // neck
  core.add(bone(bodyM, 0.42, 1.22, 0, 0.62, 1.4, 0, 0.17, 0.13));

  // head
  const head = new THREE.Group();
  head.position.set(0.72, 1.5, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.22, 0, 0, 0, 1.2, 0.85, 0.9));
  head.add(bone(bodyM, 0.14, 0, 0, 0.46, -0.05, 0, 0.11, 0.075));
  head.add(orb(bodyM, 0.03, 0.43, 0.045, 0.045, 1, 1, 1, 6, 5));
  head.add(orb(bodyM, 0.03, 0.43, 0.045, -0.045, 1, 1, 1, 6, 5));
  // teeth
  for (const side of [1, -1]) {
    head.add(spike(fangM, 0.32, -0.085, side * 0.065, 0.33, -0.15, side * 0.067, 0.018));
    head.add(spike(fangM, 0.22, -0.09, side * 0.075, 0.23, -0.16, side * 0.077, 0.02));
  }
  const eyeL = makeEye(0.055, 0xffa22e, { glow: 1.4, slit: true });
  const eyeR = makeEye(0.055, 0xffa22e, { glow: 1.4, slit: true });
  eyeL.position.set(0.18, 0.05, 0.115); eyeL.rotation.y = -0.2;
  eyeR.position.set(0.18, 0.05, -0.115); eyeR.rotation.y = 0.2;
  head.add(eyeL, eyeR);
  // horns + cheek spikes
  for (const side of [1, -1]) {
    head.add(bone(obsM, 0.02, 0.12, side * 0.12, -0.3, 0.34, side * 0.22, 0.06, 0.012));
    head.add(spike(obsM, 0.04, -0.02, side * 0.16, -0.1, -0.06, side * 0.32, 0.035));
  }
  // jaw
  const jaw = new THREE.Group();
  jaw.position.set(0.08, -0.1, 0);
  head.add(jaw);
  jaw.add(bone(scuteM, 0, 0, 0, 0.36, -0.05, 0, 0.075, 0.05));
  for (const side of [1, -1]) {
    jaw.add(spike(fangM, 0.3, -0.03, side * 0.045, 0.31, 0.045, side * 0.047, 0.016));
    jaw.add(spike(fangM, 0.2, -0.03, side * 0.055, 0.21, 0.04, side * 0.057, 0.016));
  }
  const mouthGlow = orb(mouthM, 0.07, 0.14, 0.015, 0, 1.7, 0.45, 0.9, 8, 6);
  mouthGlow.userData.noShadow = true;
  jaw.add(mouthGlow);

  // small clawed arms
  for (const side of [1, -1]) {
    core.add(bone(bodyM, 0.44, 1.16, side * 0.3, 0.56, 0.98, side * 0.36, 0.07, 0.055));
    core.add(bone(bodyM, 0.56, 0.98, side * 0.36, 0.66, 0.86, side * 0.38, 0.055, 0.04));
    core.add(orb(bodyM, 0.055, 0.67, 0.85, side * 0.38, 1, 1, 1, 8, 6));
    for (const cz of [-0.03, 0, 0.03]) {
      core.add(spike(obsM, 0.7, 0.84, side * 0.38 + cz, 0.78, 0.79, side * 0.38 + cz, 0.018));
    }
  }

  // massive digitigrade legs
  for (const side of [1, -1]) {
    core.add(bone(bodyM, -0.02, 0.88, side * 0.3, 0.12, 0.5, side * 0.34, 0.17, 0.13));
    core.add(bone(bodyM, 0.12, 0.5, side * 0.34, -0.02, 0.28, side * 0.34, 0.11, 0.09));
    core.add(bone(bodyM, -0.02, 0.28, side * 0.34, 0.08, 0.12, side * 0.34, 0.1, 0.09));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.22), bodyM);
    foot.position.set(0.14, 0.06, side * 0.34);
    core.add(foot);
    for (const cz of [-0.07, 0, 0.07]) core.add(spike(obsM, 0.28, 0.07, side * 0.34 + cz, 0.42, 0.02, side * 0.34 + cz, 0.035));
  }

  // dorsal blades with magma embers between them
  const emberMats: THREE.MeshStandardMaterial[] = [];
  const ridge: [number, number, number][] = [[0.42, 1.46, 0.2], [0.22, 1.4, 0.24], [0.0, 1.3, 0.26], [-0.18, 1.18, 0.22], [-0.32, 1.06, 0.18]];
  ridge.forEach(([rx, ry, h], i) => {
    core.add(spike(obsM, rx, ry, 0, rx - h * 0.7, ry + h, 0, 0.07));
    const em = std({ color: 0xffb44e, emissive: 0xff7a2a, emissiveIntensity: 1, roughness: 0.4 });
    emberMats.push(em);
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), em);
    o.position.set(rx - 0.06, ry - 0.05, i % 2 ? 0.07 : -0.07);
    core.add(o);
  });

  // heavy tail → obsidian mace
  const tail = new THREE.Group();
  tail.position.set(-0.36, 0.95, 0);
  tail.name = 'tail';
  core.add(tail);
  const tailSegs: THREE.Group[] = [tail];
  let parent: THREE.Group = tail;
  const trs = [0.2, 0.16, 0.12, 0.09];
  for (let i = 0; i < 4; i++) {
    const sg = new THREE.Group();
    sg.position.set(i === 0 ? 0 : -0.3, i === 0 ? 0 : -0.05, 0);
    parent.add(sg);
    sg.add(orb(bodyM, trs[i], -0.14, -0.02, 0, 1.5, 0.85, 0.85));
    tailSegs.push(sg);
    parent = sg;
  }
  const mace = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), obsM);
  mace.position.set(-0.36, -0.06, 0);
  parent.add(mace);
  parent.add(spike(obsM, -0.36, 0.02, 0, -0.36, 0.22, 0, 0.045));
  parent.add(spike(obsM, -0.42, -0.06, 0, -0.58, -0.06, 0, 0.045));

  finishShadows(g);

  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.0) * 0.025;
    core.rotation.z = Math.sin(t * 1.1) * 0.018;
    chest.scale.set(1.15, 1 + Math.sin(t * 2.0) * 0.03, 0.9);
    for (let i = 1; i < tailSegs.length; i++) {
      tailSegs[i].rotation.y = Math.sin(t * 1.5 - i * 0.8) * 0.14;
      tailSegs[i].rotation.z = Math.sin(t * 1.1 - i * 0.6) * 0.05;
    }
    const roar = gate(t, 7.8, 4);
    jaw.rotation.z = -(0.06 + roar * 0.34);
    mouthGlow.scale.set(1.7 * (1 + roar * 0.4), 0.45 * (1 + roar * 1.2), 0.9);
    bodyM.emissiveIntensity = 0.5 + roar * 0.8 + Math.sin(t * 3.1) * 0.14;
    emberMats.forEach((em, i) => {
      em.emissiveIntensity = 0.9 + Math.pow(Math.max(0, Math.sin(t * 2.6 - i * 0.9)), 3) * 1.1;
    });
    head.rotation.y = Math.sin(t * 0.42) * 0.16;
    head.rotation.z = roar * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// SOLAREX — the celestial sun lion. Star-flecked molten-gold
// pelt, a triple corona of counter-rotating flame petals for a
// mane, a burning sun-disc halo, orbiting light motes and a
// tail that ends in a solar flare.
// ============================================================
function buildSolarex(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const pelt = starPair('sol-pelt', 51);
  const bodyM = std({ map: pelt.map, emissiveMap: pelt.glow, emissive: 0xffd27a, emissiveIntensity: 0.7, roughness: 0.6 });
  const underM = std({ map: furTex('sol-under', '#ffd98a', '#e8b45e', '#fff2cc', 52), roughness: 0.8 });
  const goldM = std({ color: 0xffe9b0, emissive: 0xffc23a, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.4 });
  const petal = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  // feline frame
  const chest = orb(bodyM, 0.33, 0.22, 0.92, 0, 1.15, 1.05, 0.9);
  core.add(chest);
  core.add(orb(bodyM, 0.27, -0.06, 0.86, 0, 1.25, 0.9, 0.85));
  core.add(orb(bodyM, 0.3, -0.34, 0.84, 0, 1.1, 1, 0.9));
  core.add(orb(underM, 0.24, 0.0, 0.74, 0, 1.35, 0.75, 0.78));
  // chest emblem
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), goldM);
  emblem.position.set(0.52, 0.94, 0);
  core.add(emblem);

  // elegant legs with glowing claws
  const leg = (hx: number, hz: number, rear: boolean) => {
    const mx = rear ? hx - 0.12 : hx + 0.03;
    core.add(bone(bodyM, hx, rear ? 0.8 : 0.85, hz, mx, 0.45, hz, rear ? 0.12 : 0.095, 0.06));
    core.add(bone(underM, mx, 0.45, hz, hx + (rear ? 0.02 : 0.02), 0.1, hz, 0.06, 0.05));
    const px = hx + (rear ? 0.05 : 0.05);
    core.add(orb(underM, 0.08, px, 0.07, hz, 1.25, 0.65, 1, 9, 7));
    for (const cz of [-0.035, 0, 0.035]) core.add(spike(goldM, px + 0.06, 0.06, hz + cz, px + 0.13, 0.02, hz + cz, 0.014));
  };
  leg(0.3, 0.18, false); leg(0.3, -0.18, false);
  leg(-0.36, 0.19, true); leg(-0.36, -0.19, true);

  // regal head
  const head = new THREE.Group();
  head.position.set(0.58, 1.32, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(bodyM, 0.4, 1.05, 0, 0.54, 1.26, 0, 0.16, 0.13));
  head.add(orb(bodyM, 0.22, 0, 0, 0, 1.02, 0.95, 0.98));
  head.add(orb(underM, 0.12, 0.17, -0.06, 0, 1.1, 0.8, 0.95));
  head.add(orb(std({ color: 0x4a2a1a, roughness: 0.5 }), 0.04, 0.28, -0.01, 0, 1, 0.8, 1, 7, 6));
  head.add(spike(underM, 0.12, -0.16, 0, 0.1, -0.26, 0, 0.045)); // chin tuft
  const eyeL = makeEye(0.06, 0xfff0c0, { glow: 1.6 });
  const eyeR = makeEye(0.06, 0xfff0c0, { glow: 1.6 });
  eyeL.position.set(0.16, 0.06, 0.11); eyeL.rotation.y = -0.2;
  eyeR.position.set(0.16, 0.06, -0.11); eyeR.rotation.y = 0.2;
  head.add(eyeL, eyeR);
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), bodyM);
    ear.position.set(-0.02, 0.21, side * 0.12);
    ear.rotation.x = side * 0.3;
    head.add(ear);
  }

  // THE CORONA — three counter-rotating rings of flame petals + sun disc
  const mane = new THREE.Group();
  mane.position.set(-0.06, 0, 0);
  head.add(mane);
  const mkRing = (n: number, R: number, h: number, r: number, x: number, m: THREE.Material) => {
    const ring = new THREE.Group();
    ring.position.x = x;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), m);
      p.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
      p.rotation.x = a;
      p.scale.z = 0.45;
      p.userData.noShadow = true;
      ring.add(p);
    }
    mane.add(ring);
    return ring;
  };
  const ring1 = mkRing(8, 0.28, 0.3, 0.07, -0.02, petal(0xfff2b8, 0.9));
  const ring2 = mkRing(11, 0.4, 0.42, 0.09, -0.09, petal(0xffc23a, 0.7));
  const ring3 = mkRing(14, 0.53, 0.55, 0.11, -0.16, petal(0xff7a1e, 0.5));
  const discM = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 26), discM);
  disc.rotation.y = Math.PI / 2;
  disc.position.x = -0.2;
  disc.userData.noShadow = true;
  mane.add(disc);

  // tail → solar flare
  const tail = new THREE.Group();
  tail.position.set(-0.56, 0.95, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(bodyM, 0, 0, 0, -0.3, 0.18, 0, 0.05, 0.035));
  const tailTip = new THREE.Group();
  tailTip.position.set(-0.3, 0.18, 0);
  tail.add(tailTip);
  tailTip.add(bone(bodyM, 0, 0, 0, -0.2, 0.22, 0, 0.035, 0.02));
  const flareM = petal(0xffc23a, 0.85);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), flareM);
    p.position.set(-0.2 + Math.cos(a) * 0.02, 0.26, Math.sin(a) * 0.06);
    p.rotation.z = -0.6 + Math.cos(a) * 0.55;
    p.rotation.x = Math.sin(a) * 0.55;
    p.userData.noShadow = true;
    tailTip.add(p);
  }

  // orbiting light motes
  const motes: THREE.Mesh[] = [];
  const moteM = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const mo = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), moteM);
    mo.userData.noShadow = true;
    motes.push(mo);
    core.add(mo);
  }
  const sun = new THREE.PointLight(0xffc46a, 2.5, 5.5);
  sun.position.set(0.2, 1.3, 0);
  core.add(sun);

  finishShadows(g);

  const animate = (t: number, dt: number) => {
    core.position.y = Math.sin(t * 1.8) * 0.02;
    chest.scale.set(1.15, 1.05 + Math.sin(t * 1.8) * 0.025, 0.9);
    head.rotation.y = Math.sin(t * 0.38) * 0.2;
    head.rotation.z = gate(t, 11, 4) * 0.08 - 0.02;
    ring1.rotation.x += dt * 0.55;
    ring2.rotation.x -= dt * 0.4;
    ring3.rotation.x += dt * 0.26;
    ring1.scale.setScalar(1 + Math.sin(t * 2.3) * 0.04);
    ring2.scale.setScalar(1 + Math.sin(t * 1.9 + 1) * 0.04);
    ring3.scale.setScalar(1 + Math.sin(t * 1.6 + 2) * 0.05);
    discM.opacity = 0.4 + Math.sin(t * 2.2) * 0.12;
    disc.scale.setScalar(1 + Math.sin(t * 1.7) * 0.05);
    for (let i = 0; i < motes.length; i++) {
      const a = t * 0.9 + (i / motes.length) * Math.PI * 2;
      motes[i].position.set(Math.cos(a) * 0.78, 1.05 + Math.sin(a * 2 + i) * 0.2, Math.sin(a) * 0.78);
      motes[i].rotation.y = t * 2 + i;
    }
    tail.rotation.y = Math.sin(t * 1.1) * 0.18;
    tail.rotation.x = Math.sin(t * 0.8) * 0.1;
    tailTip.rotation.y = Math.sin(t * 1.1 - 0.6) * 0.16;
    goldM.emissiveIntensity = 1.1 + Math.sin(t * 2.6) * 0.45;
    bodyM.emissiveIntensity = 0.6 + 0.22 * Math.sin(t * 1.3) + 0.12 * Math.sin(t * 3.7);
    sun.intensity = 2.3 + Math.sin(t * 2.2) * 0.5;
    const bl = blinkAt(t, 7.2);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.8 * bl;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// PUDDLA — a living droplet. Translucent teardrop gel with a
// glowing heart inside, huge happy eyes, a bobbing crown
// droplet, ripple rings in its puddle and a permanent wobble.
// ============================================================
function buildPuddla(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const gelM = std({
    map: gelTex('pud-gel', '#1f5fae', '#3a8dd9', '#9fd4f2'),
    transparent: true, opacity: 0.88, roughness: 0.12, metalness: 0.05,
  });
  const deepM = std({ color: 0x2a6dc4, transparent: true, opacity: 0.92, roughness: 0.15 });
  const heartM = std({ color: 0xaef4ff, emissive: 0x6ad8ff, emissiveIntensity: 1.6, roughness: 0.1 });
  const faceM = std({ color: 0x123a6e, roughness: 0.3 });

  // wobbling teardrop body
  const gel = new THREE.Group();
  core.add(gel);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const r = 0.34 * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * u)), 0.8);
    pts.push(new THREE.Vector2(Math.max(0.001, r), 0.03 + u * 0.68));
  }
  pts.push(new THREE.Vector2(0.001, 0.72));
  const drop = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), gelM);
  gel.add(drop);
  // curled tip
  gel.add(bone(gelM, 0, 0.68, 0, 0.07, 0.8, 0, 0.045, 0.008));

  // glowing heart core
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), heartM);
  heart.position.set(0, 0.34, 0);
  heart.userData.noShadow = true;
  gel.add(heart);

  // face — big happy slime eyes + smile + blush
  const eyeL = new THREE.Group(), eyeR = new THREE.Group();
  for (const [eg, side] of [[eyeL, 1], [eyeR, -1]] as const) {
    eg.position.set(0.28, 0.42, side * 0.115);
    eg.rotation.y = -side * 0.12;
    eg.add(orb(faceM, 0.06, 0, 0, 0, 0.7, 1.25, 0.55, 10, 8));
    const glint = orb(std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0 }),
      0.02, 0.035, 0.03, side * 0.012, 1, 1, 1, 6, 5);
    glint.userData.noShadow = true;
    eg.add(glint);
    gel.add(eg);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 6, 14, Math.PI * 0.75), faceM);
  smile.position.set(0.345, 0.31, 0);
  smile.rotation.set(0, Math.PI / 2, Math.PI * 1.13);
  gel.add(smile);
  const blushM = std({ color: 0x9fd4f2, transparent: true, opacity: 0.6, roughness: 0.4 });
  gel.add(orb(blushM, 0.045, 0.29, 0.33, 0.17, 1, 0.65, 1.3, 8, 6));
  gel.add(orb(blushM, 0.045, 0.29, 0.33, -0.17, 1, 0.65, 1.3, 8, 6));

  // nub arms
  const armL = orb(deepM, 0.07, 0.04, 0.3, 0.36, 1, 1.15, 1, 10, 8);
  const armR = orb(deepM, 0.07, 0.04, 0.3, -0.36, 1, 1.15, 1, 10, 8);
  gel.add(armL, armR);

  // crown droplet
  const crown = new THREE.Group();
  crown.position.set(0, 0.95, 0);
  core.add(crown);
  crown.add(orb(deepM, 0.05, 0, 0, 0, 1, 1.3, 1, 10, 8));

  // puddle + ripple rings
  const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.025, 20),
    std({ color: 0x3a8dd9, transparent: true, opacity: 0.45, roughness: 0.1 }));
  puddle.position.y = 0.013;
  puddle.userData.noShadow = true;
  core.add(puddle);
  const ripples: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; off: number }[] = [];
  for (const off of [0, 0.5]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd4f2, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 6, 24), mat);
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.02;
    m.userData.noShadow = true;
    core.add(m);
    ripples.push({ m, mat, off });
  }

  // drifting sparkles
  const sparkM = new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), sparkM);
    sp.userData.noShadow = true;
    sparks.push(sp);
    core.add(sp);
  }

  finishShadows(g);

  const animate = (t: number) => {
    // the signature wobble — volume-ish preserving jelly
    const wx = Math.sin(t * 3.0), wz = Math.sin(t * 3.0 + Math.PI * 0.5);
    gel.scale.set(1 + wx * 0.05, 1 - (wx + wz) * 0.022, 1 + wz * 0.05);
    gel.rotation.z = Math.sin(t * 1.7) * 0.05;
    gel.rotation.x = Math.sin(t * 1.3 + 1) * 0.04;
    // heartbeat: double-thump
    const hb = Math.pow(Math.max(0, Math.sin(t * 2.4)), 8) + 0.55 * Math.pow(Math.max(0, Math.sin(t * 2.4 - 0.45)), 8);
    heartM.emissiveIntensity = 1.2 + hb * 1.6;
    heart.scale.setScalar(1 + hb * 0.25);
    heart.position.y = 0.34 + Math.sin(t * 1.2) * 0.02;
    heart.rotation.y = t * 0.8;
    // blink (sometimes a double)
    const bl = Math.max(blinkAt(t, 4.3), blinkAt(t, 9.1, 0.35));
    eyeL.scale.y = eyeR.scale.y = 1 - 0.9 * bl;
    // crown droplet bounce
    crown.position.y = 0.95 + Math.sin(t * 2.8) * 0.04 + gate(t, 6.4) * 0.14;
    crown.rotation.z = Math.sin(t * 2.8) * 0.12;
    // ripples roll outward forever
    for (const r of ripples) {
      const s = ((t * 0.35 + r.off) % 1 + 1) % 1;
      r.m.scale.setScalar(0.55 + s * 1.25);
      r.mat.opacity = (1 - s) * 0.38;
    }
    // arms wiggle
    armL.position.y = 0.3 + Math.sin(t * 3) * 0.022;
    armR.position.y = 0.3 + Math.sin(t * 3 + 1.2) * 0.022;
    // sparkles drift
    for (let i = 0; i < sparks.length; i++) {
      const a = t * 0.7 + (i / sparks.length) * Math.PI * 2;
      sparks[i].position.set(Math.cos(a) * 0.42, 0.35 + Math.sin(a * 1.7 + i) * 0.22, Math.sin(a) * 0.42);
      sparks[i].rotation.y = t * 3 + i;
    }
  };
  return { body: g, parts: { head: gel }, animate };
}

// ============================================================
// TIDEFIN — a graceful air-swimming sea serpent. Glossy scaled
// coils rearing into an S-curve, translucent rayed fins that
// flutter, trailing barbels, and wisps of sea-mist orbiting
// its base. It undulates constantly, swimming in place.
// ============================================================
function buildTidefin(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const scaleM = std({ map: scaleTex('tid-scale', '#2a6dc4', '#5ab8e8', '#173f7a', 61), roughness: 0.35, metalness: 0.15 });
  const bellyM = std({ map: gelTex('tid-belly', '#7ec2ea', '#a9d9f2', '#e8f6ff'), roughness: 0.4 });
  const fM = finMat('tid-fin', [200, 236, 255], [110, 185, 235], 0.72);
  const crestM = finMat('tid-crest', [170, 225, 255], [80, 165, 225], 0.8);

  // rearing spine chain — each segment is parented to the last
  const root = new THREE.Group();
  root.position.set(-0.12, 0.3, 0);
  core.add(root);
  const segs: THREE.Group[] = [];
  const path = [
    { dx: 0, dy: 0, r: 0.26 }, { dx: 0.03, dy: 0.24, r: 0.24 }, { dx: 0.07, dy: 0.24, r: 0.22 },
    { dx: 0.11, dy: 0.23, r: 0.19 }, { dx: 0.14, dy: 0.21, r: 0.16 }, { dx: 0.16, dy: 0.19, r: 0.14 },
  ];
  let parent: THREE.Object3D = root;
  for (const p of path) {
    const sg = new THREE.Group();
    sg.position.set(p.dx, p.dy, 0);
    parent.add(sg);
    sg.add(orb(scaleM, p.r, 0, 0, 0, 1, 1.08, 0.95));
    sg.add(orb(bellyM, p.r * 0.78, p.r * 0.5, 0, 0, 0.6, 0.95, 0.8));
    const dorsal = makeFin(crestM, p.r * 1.5, Math.PI * 0.22, Math.PI * 0.55);
    dorsal.position.set(-p.r * 0.32, p.r * 0.72, 0);
    dorsal.rotation.z = 0.35;
    sg.add(dorsal);
    segs.push(sg);
    parent = sg;
  }

  // tail trailing back along the ground → translucent fan
  const tail = new THREE.Group();
  tail.name = 'tail';
  root.add(tail);
  tail.add(bone(scaleM, 0, -0.04, 0, -0.34, -0.1, 0, 0.2, 0.12));
  tail.add(bone(scaleM, -0.34, -0.1, 0, -0.56, -0.04, 0, 0.12, 0.06));
  const tailFan = makeFin(fM, 0.34, Math.PI * 0.62, Math.PI * 0.76);
  tailFan.position.set(-0.6, 0.0, 0);
  tail.add(tailFan);

  // head atop the last segment
  const head = new THREE.Group();
  head.position.set(0.1, 0.2, 0);
  head.name = 'head';
  segs[segs.length - 1].add(head);
  head.add(orb(scaleM, 0.16, 0, 0, 0, 1.25, 0.9, 0.95));
  head.add(orb(bellyM, 0.09, 0.16, -0.035, 0, 1.2, 0.75, 0.9));
  const eyeL = makeEye(0.055, 0x1f7ac4);
  const eyeR = makeEye(0.055, 0x1f7ac4);
  eyeL.position.set(0.1, 0.05, 0.105); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.1, 0.05, -0.105); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // head crest + cheek fins
  const crest = makeFin(crestM, 0.3, Math.PI * 0.18, Math.PI * 0.6);
  crest.position.set(-0.1, 0.1, 0);
  crest.rotation.z = 0.6;
  head.add(crest);
  const cheekL = makeFin(fM, 0.18, -Math.PI * 0.35, Math.PI * 0.7);
  const cheekR = makeFin(fM, 0.18, -Math.PI * 0.35, Math.PI * 0.7);
  cheekL.position.set(0.0, -0.02, 0.13); cheekL.rotation.y = -1.0; cheekL.rotation.z = -0.3;
  cheekR.position.set(0.0, -0.02, -0.13); cheekR.rotation.y = 1.0; cheekR.rotation.z = -0.3;
  head.add(cheekL, cheekR);
  // barbels
  head.add(spike(bellyM, 0.2, -0.05, 0.05, 0.3, -0.2, 0.13, 0.012));
  head.add(spike(bellyM, 0.2, -0.05, -0.05, 0.3, -0.2, -0.13, 0.012));

  // pectoral fins on the second segment
  const pecL = makeFin(fM, 0.27, -Math.PI * 0.4, Math.PI * 0.8);
  const pecR = makeFin(fM, 0.27, -Math.PI * 0.4, Math.PI * 0.8);
  pecL.position.set(0.05, 0, 0.2); pecL.rotation.y = -1.1; pecL.rotation.z = -0.35;
  pecR.position.set(0.05, 0, -0.2); pecR.rotation.y = 1.1; pecR.rotation.z = -0.35;
  segs[1].add(pecL, pecR);

  // sea-mist wisps
  const mistM = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.13, depthWrite: false });
  const mists: THREE.Mesh[] = [];
  for (const r of [0.15, 0.11, 0.13]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mistM);
    m.userData.noShadow = true;
    mists.push(m);
    core.add(m);
  }

  finishShadows(g);

  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.6) * 0.045;
    for (let i = 0; i < segs.length; i++) {
      segs[i].rotation.z = Math.sin(t * 1.9 - i * 0.55) * 0.07;
      segs[i].rotation.x = Math.sin(t * 1.4 - i * 0.5) * 0.09;
    }
    head.rotation.y = Math.sin(t * 0.6) * 0.22;
    head.rotation.z = Math.sin(t * 1.9 - segs.length * 0.55) * 0.06;
    cheekL.rotation.z = -0.3 + Math.sin(t * 3.8) * 0.18;
    cheekR.rotation.z = -0.3 + Math.sin(t * 3.8 + 1) * 0.18;
    pecL.rotation.z = -0.35 + Math.sin(t * 3.2) * 0.16;
    pecR.rotation.z = -0.35 + Math.sin(t * 3.2 + 0.8) * 0.16;
    crest.rotation.z = 0.6 + Math.sin(t * 2.4) * 0.07;
    tail.rotation.y = Math.sin(t * 1.3) * 0.12;
    tailFan.rotation.x = Math.sin(t * 1.2) * 0.12;
    fM.opacity = 0.66 + Math.sin(t * 2.1) * 0.08;
    for (let i = 0; i < mists.length; i++) {
      const a = t * 0.5 + (i / mists.length) * Math.PI * 2;
      mists[i].position.set(Math.cos(a) * 0.5, 0.3 + Math.sin(a * 1.6 + i) * 0.18, Math.sin(a) * 0.5);
    }
    mistM.opacity = 0.1 + Math.sin(t * 1.1) * 0.04;
    const bl = blinkAt(t, 5.1, 2.2);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * bl;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// MAELSTRIKE — the storm-tide leviathan. Armored cobalt coils
// rising out of a spinning whirlpool, jagged glowing dorsal
// blades, swept horn-blades, trailing storm barbels and an
// anchor fluke. The glow pulses travel down its fins like
// lightning under water.
// ============================================================
function buildMaelstrike(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const scaleM = std({ map: scaleTex('mael-scale', '#1a4da8', '#3a9df2', '#0e2a66', 71), roughness: 0.3, metalness: 0.25 });
  const bellyM = std({ map: gelTex('mael-belly', '#5a93c8', '#85b8de', '#cfe8fa'), roughness: 0.4 });
  const armorM = std({ color: 0x14305e, roughness: 0.25, metalness: 0.5, flatShading: true });
  const glowM = std({ color: 0x9fe8ff, emissive: 0x4ad8ff, emissiveIntensity: 1.4, roughness: 0.2 });
  const fM = finMat('mael-fin', [168, 224, 255], [60, 150, 220], 0.68);
  const mouthM = new THREE.MeshBasicMaterial({ color: 0x36d8ff });
  const fangM = std({ color: 0xeefaff, roughness: 0.3 });

  // armored spine chain
  const root = new THREE.Group();
  root.position.set(-0.1, 0.36, 0);
  core.add(root);
  const segs: THREE.Group[] = [];
  const edgeMats: THREE.MeshStandardMaterial[] = [];
  const path = [
    { dx: 0, dy: 0, r: 0.3 }, { dx: 0.02, dy: 0.27, r: 0.28 }, { dx: 0.06, dy: 0.27, r: 0.26 },
    { dx: 0.1, dy: 0.26, r: 0.23 }, { dx: 0.14, dy: 0.25, r: 0.2 }, { dx: 0.17, dy: 0.23, r: 0.17 },
    { dx: 0.18, dy: 0.2, r: 0.15 },
  ];
  let parent: THREE.Object3D = root;
  path.forEach((p, i) => {
    const sg = new THREE.Group();
    sg.position.set(p.dx, p.dy, 0);
    parent.add(sg);
    sg.add(orb(scaleM, p.r, 0, 0, 0, 1, 1.05, 0.92));
    sg.add(orb(bellyM, p.r * 0.76, p.r * 0.52, 0, 0, 0.58, 0.92, 0.78));
    // armored ridge plate
    const plate = new THREE.Mesh(new THREE.OctahedronGeometry(p.r * 0.5), armorM);
    plate.position.set(-p.r * 0.25, p.r * 0.8, 0);
    plate.scale.set(1.2, 0.55, 0.8);
    sg.add(plate);
    // jagged dorsal blade with a glowing leading edge
    if (i > 0) {
      const blade = makeFin(fM, p.r * 1.9, Math.PI * 0.3, Math.PI * 0.36);
      blade.position.set(-p.r * 0.4, p.r * 0.75, 0);
      blade.rotation.z = 0.25;
      sg.add(blade);
      const em = std({ color: 0x9fe8ff, emissive: 0x4ad8ff, emissiveIntensity: 0.9, roughness: 0.2 });
      edgeMats.push(em);
      sg.add(spike(em, -p.r * 0.35, p.r * 0.8, 0, -p.r * 0.4 + Math.cos(Math.PI * 0.62) * p.r * 1.9, p.r * 0.75 + Math.sin(Math.PI * 0.62) * p.r * 1.9, 0, 0.025));
    }
    segs.push(sg);
    parent = sg;
  });

  // head
  const head = new THREE.Group();
  head.position.set(0.12, 0.18, 0);
  head.name = 'head';
  segs[segs.length - 1].add(head);
  head.add(orb(scaleM, 0.2, 0, 0, 0, 1.3, 0.85, 0.9));
  const browPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.26), armorM);
  browPlate.position.set(0.08, 0.12, 0);
  browPlate.rotation.z = -0.15;
  head.add(browPlate);
  head.add(bone(bellyM, 0.16, -0.02, 0, 0.4, -0.06, 0, 0.1, 0.065));
  for (const side of [1, -1]) {
    head.add(spike(fangM, 0.34, -0.08, side * 0.055, 0.35, -0.15, side * 0.057, 0.016));
    head.add(spike(fangM, 0.24, -0.085, side * 0.07, 0.25, -0.15, side * 0.072, 0.018));
  }
  const eyeL = makeEye(0.055, 0x4ad8ff, { glow: 1.8, slit: true });
  const eyeR = makeEye(0.055, 0x4ad8ff, { glow: 1.8, slit: true });
  eyeL.position.set(0.13, 0.05, 0.115); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.13, 0.05, -0.115); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  // swept horn blades
  for (const side of [1, -1]) {
    const horn = bone(armorM, 0, 0.13, side * 0.1, -0.36, 0.36, side * 0.17, 0.05, 0.01);
    horn.scale.z = 0.55;
    head.add(horn);
    head.add(spike(glowM, -0.02, 0.17, side * 0.1, -0.34, 0.38, side * 0.17, 0.016));
  }
  // jaw with storm-lit gullet
  const jaw = new THREE.Group();
  jaw.position.set(0.1, -0.09, 0);
  head.add(jaw);
  jaw.add(bone(bellyM, 0, 0, 0, 0.3, -0.045, 0, 0.07, 0.045));
  for (const side of [1, -1]) {
    jaw.add(spike(fangM, 0.25, -0.02, side * 0.04, 0.26, 0.045, side * 0.042, 0.015));
  }
  jaw.add(spike(fangM, 0.16, -0.025, 0, 0.17, 0.04, 0, 0.015));
  const mouthGlow = orb(mouthM, 0.06, 0.12, 0.01, 0, 1.6, 0.42, 0.85, 8, 6);
  mouthGlow.userData.noShadow = true;
  jaw.add(mouthGlow);
  // trailing storm barbels — chained for a whip-wave
  const whiskers: THREE.Group[][] = [];
  for (const side of [1, -1]) {
    const chain: THREE.Group[] = [];
    let wp: THREE.Object3D = head;
    let px = 0.36, py = -0.04, pz = side * 0.07;
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      w.position.set(px, py, pz);
      wp.add(w);
      w.add(bone(bellyM, 0, 0, 0, -0.02, -0.1, side * 0.08, 0.013 - i * 0.003, 0.01 - i * 0.003));
      chain.push(w);
      wp = w; px = -0.02; py = -0.1; pz = side * 0.08;
    }
    whiskers.push(chain);
  }

  // pectoral blade fins
  const pecL = makeFin(fM, 0.32, -Math.PI * 0.32, Math.PI * 0.55);
  const pecR = makeFin(fM, 0.32, -Math.PI * 0.32, Math.PI * 0.55);
  pecL.position.set(0.06, 0.02, 0.24); pecL.rotation.y = -1.15; pecL.rotation.z = -0.45;
  pecR.position.set(0.06, 0.02, -0.24); pecR.rotation.y = 1.15; pecR.rotation.z = -0.45;
  segs[2].add(pecL, pecR);

  // tail → anchor fluke
  const tail = new THREE.Group();
  tail.name = 'tail';
  root.add(tail);
  tail.add(bone(scaleM, 0, -0.05, 0, -0.38, -0.08, 0, 0.24, 0.14));
  tail.add(bone(scaleM, -0.38, -0.08, 0, -0.64, 0.02, 0, 0.14, 0.07));
  const flukeA = makeFin(fM, 0.38, Math.PI * 0.45, Math.PI * 0.5);
  const flukeB = makeFin(fM, 0.38, -Math.PI * 0.95, Math.PI * 0.5);
  flukeA.position.set(-0.68, 0.04, 0);
  flukeB.position.set(-0.68, 0.04, 0);
  tail.add(flukeA, flukeB);
  tail.add(spike(glowM, -0.62, 0.02, 0, -0.96, 0.3, 0, 0.02));
  tail.add(spike(glowM, -0.62, 0.0, 0, -0.94, -0.26, 0, 0.02));

  // the whirlpool — elliptical foam rings + orbiting wave crests
  const foamM = new THREE.MeshBasicMaterial({ color: 0xdaf2ff, transparent: true, opacity: 0.32, depthWrite: false });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 7, 26), foamM);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.032, 7, 28), foamM);
  for (const [r, sx] of [[ringA, 1.18], [ringB, 1.12]] as const) {
    r.rotation.x = Math.PI / 2;
    r.scale.x = sx;
    r.position.y = 0.07;
    r.userData.noShadow = true;
    core.add(r);
  }
  const crests: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), foamM);
    c.userData.noShadow = true;
    crests.push(c);
    core.add(c);
  }
  // storm sparks
  const sparkM = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), sparkM);
    sp.userData.noShadow = true;
    sparks.push(sp);
    core.add(sp);
  }

  finishShadows(g);

  const animate = (t: number, dt: number) => {
    core.position.y = Math.sin(t * 1.9) * 0.05;
    for (let i = 0; i < segs.length; i++) {
      segs[i].rotation.z = Math.sin(t * 2.6 - i * 0.6) * 0.075;
      segs[i].rotation.x = Math.sin(t * 1.9 - i * 0.55) * 0.095;
    }
    head.rotation.y = Math.sin(t * 0.55) * 0.18;
    head.position.x = 0.12 + gate(t, 9, 20) * 0.06;
    jaw.rotation.z = -(0.05 + gate(t, 5.6, 6) * 0.3);
    // whisker whip-wave
    for (let w = 0; w < whiskers.length; w++) {
      whiskers[w].forEach((seg, d) => {
        seg.rotation.y = Math.sin(t * 2.2 - d * 0.9 + w * 2) * 0.25;
        seg.rotation.z = Math.sin(t * 1.7 - d * 0.7 + w) * 0.15;
      });
    }
    // lightning pulse traveling down the dorsal blades
    edgeMats.forEach((em, i) => {
      em.emissiveIntensity = 0.8 + Math.pow(Math.max(0, Math.sin(t * 3 - i * 0.7)), 2) * 1.5;
    });
    glowM.emissiveIntensity = 1.2 + Math.sin(t * 4.2) * 0.5;
    pecL.rotation.z = -0.45 + Math.sin(t * 3.1) * 0.14;
    pecR.rotation.z = -0.45 + Math.sin(t * 3.1 + 0.9) * 0.14;
    tail.rotation.y = Math.sin(t * 1.6) * 0.1;
    // whirlpool spin
    ringA.rotation.z += dt * 1.9;
    ringB.rotation.z -= dt * 1.3;
    foamM.opacity = 0.28 + Math.sin(t * 2.8) * 0.07;
    for (let i = 0; i < crests.length; i++) {
      const a = -t * 1.8 + (i / crests.length) * Math.PI * 2;
      crests[i].position.set(Math.cos(a) * 0.64, 0.12 + Math.sin(t * 3 + i) * 0.03, Math.sin(a) * 0.56);
      crests[i].rotation.z = Math.cos(a) * 0.4;
    }
    for (let i = 0; i < sparks.length; i++) {
      const a = t * 2.6 + (i / sparks.length) * Math.PI * 2;
      sparks[i].position.set(Math.cos(a) * 0.45, 1.1 + Math.sin(a * 1.4 + i) * 0.35, Math.sin(a) * 0.45);
    }
  };
  return { body: g, parts: { head, tail }, animate };
}

// ---------------- registry ----------------
export const BESPOKE: Record<string, BespokeBuilder> = {
  cindcub: buildCindcub,
  pyrofang: buildPyrofang,
  blazemaw: buildBlazemaw,
  infernyx: buildInfernyx,
  solarex: buildSolarex,
  puddla: buildPuddla,
  tidefin: buildTidefin,
  maelstrike: buildMaelstrike,
};
