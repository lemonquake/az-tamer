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

// ============================================================
// THE AETHER THREE — Aljay's personal Guardians. They exist
// nowhere in the wild; the Hall of Legends keeps living statues
// of them (see makeCustomCreature + LEGENDS in lore.ts).
// ============================================================

/** Violet cosmos: nebula swirls, spiral arms and pin-prick stars (map + emissive). */
function nebulaPair(key: string, seed: number): { map: THREE.Texture; glow: THREE.Texture } {
  const data = (s: number) => {
    const rnd = rng(seed);
    const stars: number[][] = [];
    for (let i = 0; i < 130; i++) stars.push([rnd() * s, rnd() * s, 0.6 + rnd() * 1.6, rnd()]);
    const arms: number[][] = [];
    for (let i = 0; i < 7; i++) arms.push([rnd() * s, rnd() * s, 30 + rnd() * 60, rnd() * Math.PI * 2, rnd()]);
    return { stars, arms };
  };
  const spiral = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => {
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) {
      const th = a + k * 0.28;
      const rr = r * 0.12 + k * (r * 0.035);
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  const draw = (mode: 'map' | 'glow') => (ctx: CanvasRenderingContext2D, s: number) => {
    const { stars, arms } = data(s);
    if (mode === 'map') {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#2e1856'); g.addColorStop(0.5, '#1c0e38'); g.addColorStop(1, '#0e0620');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      for (const [x, y, r, , hue] of arms) {
        const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
        grad.addColorStop(0, hue! < 0.5 ? 'rgba(154,90,242,0.30)' : 'rgba(255,154,210,0.22)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(216,200,255,0.20)';
      for (const [x, y, r, a] of arms) spiral(ctx, x, y, r, a);
      ctx.fillStyle = 'rgba(255,250,255,0.9)';
      for (const [x, y, r] of stars) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(154,106,242,0.35)';
      for (const [x, y, r, a] of arms) spiral(ctx, x, y, r, a);
      for (const [x, y, r, b] of stars) {
        const grad = ctx.createRadialGradient(x, y, 0.2, x, y, r * 3);
        grad.addColorStop(0, b! < 0.3 ? '#ffd8ec' : '#d8c8ff'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  };
  return { map: ctex(`${key}:m`, 256, draw('map')), glow: ctex(`${key}:g`, 256, draw('glow')) };
}

/** Layered plume rows: soft pointed feathers with a lit spine. */
function featherTex(key: string, base: string, dark: string, lite: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    const fw = 26, fh = 38;
    for (let row = 0; row * fh * 0.55 < s + fh; row++) {
      const y = row * fh * 0.55 - fh * 0.4;
      const off = row % 2 ? fw / 2 : 0;
      for (let x = -fw; x < s + fw; x += fw) {
        const cx = x + off + (rnd() - 0.5) * 4;
        const tone = rnd();
        ctx.beginPath();
        ctx.moveTo(cx - fw * 0.42, y);
        ctx.quadraticCurveTo(cx - fw * 0.46, y + fh * 0.5, cx, y + fh);
        ctx.quadraticCurveTo(cx + fw * 0.46, y + fh * 0.5, cx + fw * 0.42, y);
        ctx.closePath();
        ctx.fillStyle = base; ctx.fill();
        ctx.fillStyle = tone > 0.5 ? `rgba(255,255,255,${0.05 + tone * 0.08})` : `rgba(60,0,40,${0.08 + tone * 0.1})`;
        ctx.fill();
        ctx.strokeStyle = dark; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.strokeStyle = lite; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx, y + 4); ctx.lineTo(cx, y + fh - 3); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  });
}

// ============================================================
// FIRGARA — The Dawn Unbroken. A crimson dragonoid knight in
// mirror-bright scale: polished cuirass, brass trim, swept-back
// wings, and Daybreak — a greatsword sheathed in living flame
// that it raises in a slow flourish as it idles.
// ============================================================
function buildFirgara(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);
  const flick: Flick[] = [];

  const hideM = std({ map: scaleTex('firg-hide', '#b81e28', '#ff7a5a', '#520410', 71), roughness: 0.24, metalness: 0.55 });
  const armorM = std({ color: 0xd42832, metalness: 0.8, roughness: 0.18 });
  const goldM = std({ color: 0xe8b84a, metalness: 0.95, roughness: 0.22 });
  const hornM = std({ color: 0xf2e4c4, roughness: 0.45, metalness: 0.15 });
  const darkM = std({ color: 0x2a1014, roughness: 0.6 });
  const membM = std({ color: 0x8a0e1a, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });

  // digitigrade legs + clawed feet
  for (const side of [1, -1] as const) {
    const z = side * 0.17;
    core.add(bone(hideM, 0.02, 0.62, z, 0.1, 0.36, z * 1.2, 0.105, 0.075));
    core.add(bone(hideM, 0.1, 0.36, z * 1.2, -0.02, 0.12, z * 1.15, 0.07, 0.055));
    core.add(orb(armorM, 0.085, 0.06, 0.07, z * 1.15, 1.5, 0.7, 1.05, 10, 8));
    for (let c = 0; c < 3; c++)
      core.add(spike(hornM, 0.14, 0.06, z * 1.15 + (c - 1) * 0.05, 0.24, 0.02, z * 1.15 + (c - 1) * 0.07, 0.028));
  }

  // pelvis, torso, polished cuirass with brass collar + belt
  core.add(orb(hideM, 0.21, 0, 0.66, 0, 1, 0.85, 0.95));
  const torso = orb(hideM, 0.3, 0.02, 1.0, 0, 1.0, 1.18, 0.88);
  core.add(torso);
  core.add(orb(armorM, 0.26, 0.15, 1.04, 0, 0.72, 1.05, 0.92));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), goldM);
  collar.position.set(0.05, 1.32, 0);
  collar.rotation.x = Math.PI / 2;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 8, 20), goldM);
  belt.position.y = 0.78;
  belt.rotation.x = Math.PI / 2;
  core.add(collar, belt);

  // dorsal spikes down the spine
  for (let i = 0; i < 4; i++)
    core.add(spike(hornM, -0.2, 1.24 - i * 0.15, 0, -0.36, 1.34 - i * 0.15, 0, 0.038));

  // pauldrons
  for (const side of [1, -1] as const) {
    core.add(orb(armorM, 0.13, 0.02, 1.28, side * 0.3, 1.15, 0.85, 1.1));
    core.add(spike(goldM, 0, 1.34, side * 0.36, -0.06, 1.5, side * 0.48, 0.035));
  }

  // off hand — relaxed at its side, claws half-curled
  core.add(bone(hideM, 0.02, 1.24, -0.3, 0.05, 0.98, -0.38, 0.075, 0.06));
  core.add(bone(hideM, 0.05, 0.98, -0.38, 0.12, 0.76, -0.36, 0.058, 0.05));
  core.add(orb(hideM, 0.065, 0.13, 0.72, -0.36, 1.1, 0.85, 1));
  for (let c = 0; c < 3; c++)
    core.add(spike(hornM, 0.15, 0.7, -0.36 + (c - 1) * 0.035, 0.21, 0.6, -0.36 + (c - 1) * 0.05, 0.02));

  // sword arm — a group so the whole arm can flourish
  const armR = new THREE.Group();
  armR.position.set(0.02, 1.24, 0.3);
  core.add(armR);
  armR.add(bone(hideM, 0, 0, 0, 0.2, -0.14, 0.1, 0.075, 0.06));
  armR.add(bone(hideM, 0.2, -0.14, 0.1, 0.34, 0.04, 0.06, 0.058, 0.05));
  armR.add(orb(hideM, 0.07, 0.36, 0.08, 0.05, 1.1, 0.95, 1));

  // DAYBREAK — the blazing greatsword
  const sword = new THREE.Group();
  sword.position.set(0.38, 0.1, 0.05);
  sword.rotation.z = -0.55;
  sword.rotation.x = 0.18;
  armR.add(sword);
  sword.add(bone(darkM, 0, -0.12, 0, 0, 0.06, 0, 0.028, 0.024));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.24), goldM);
  guard.position.y = 0.07;
  sword.add(guard, orb(goldM, 0.035, 0, -0.14, 0));
  const bladeM = std({ color: 0xfff2d0, emissive: 0xff9a2a, emissiveIntensity: 2.0, roughness: 0.12, metalness: 0.4 });
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.92, 4), bladeM);
  blade.position.y = 0.55;
  blade.scale.z = 0.4;
  sword.add(blade);
  const swordFlame = makeFlame(0.95, 0.085, 0xfff0b8, 0xff7a2a);
  swordFlame.position.y = 0.12;
  sword.add(swordFlame);
  flick.push({ g: swordFlame, speed: 7.5, ph: 2, amp: 0.1 });
  for (const [fy, fh] of [[0.35, 0.16], [0.62, 0.13], [0.86, 0.1]] as const) {
    const f = makeFlame(fh, fh * 0.34, 0xfff0b8, 0xffb44a);
    f.position.set(0.045, fy, 0);
    f.rotation.z = -0.5;
    sword.add(f);
    flick.push({ g: f, speed: 10 + fy * 4, ph: fy * 7, amp: 0.2 });
  }

  // swept-back wings
  const mkWing = (side: 1 | -1) => {
    const w = new THREE.Group();
    w.position.set(-0.2, 1.22, side * 0.14);
    core.add(w);
    w.add(bone(hideM, 0, 0, 0, -0.34, 0.28, 0, 0.045, 0.028));
    w.add(bone(hideM, -0.34, 0.28, 0, -0.66, 0.2, 0, 0.026, 0.01));
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(-0.34, 0.28);
    sh.lineTo(-0.66, 0.2);
    sh.quadraticCurveTo(-0.52, 0.0, -0.56, -0.08);
    sh.quadraticCurveTo(-0.34, -0.1, -0.26, -0.14);
    sh.closePath();
    const memb = new THREE.Mesh(new THREE.ShapeGeometry(sh), membM);
    memb.userData.noShadow = true;
    w.add(memb);
    w.add(spike(hornM, -0.34, 0.28, 0, -0.42, 0.4, 0, 0.02));
    return w;
  };
  const wingL = mkWing(1), wingR = mkWing(-1);

  // tail — three chained segments + brass spade tip
  const tail = new THREE.Group();
  tail.position.set(-0.18, 0.6, 0);
  tail.name = 'tail';
  core.add(tail);
  const t1 = new THREE.Group(); tail.add(t1);
  t1.add(bone(hideM, 0, 0, 0, -0.3, -0.1, 0, 0.085, 0.06));
  const t2 = new THREE.Group(); t2.position.set(-0.3, -0.1, 0); t1.add(t2);
  t2.add(bone(hideM, 0, 0, 0, -0.3, -0.04, 0, 0.06, 0.04));
  const t3 = new THREE.Group(); t3.position.set(-0.3, -0.04, 0); t2.add(t3);
  t3.add(bone(hideM, 0, 0, 0, -0.24, 0.04, 0, 0.04, 0.02));
  const spade = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), goldM);
  spade.position.set(-0.28, 0.06, 0);
  spade.scale.set(1.4, 0.9, 0.35);
  t3.add(spade);

  // neck + horned head
  core.add(bone(hideM, 0.1, 1.3, 0, 0.2, 1.46, 0, 0.1, 0.085));
  const head = new THREE.Group();
  head.position.set(0.22, 1.52, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(hideM, 0.16, 0, 0, 0, 1.05, 0.92, 0.9));
  head.add(orb(hideM, 0.1, 0.15, -0.04, 0, 1.5, 0.62, 0.78));
  head.add(orb(darkM, 0.018, 0.29, -0.005, 0.035, 1, 1, 1, 6, 5));
  head.add(orb(darkM, 0.018, 0.29, -0.005, -0.035, 1, 1, 1, 6, 5));
  head.add(orb(hideM, 0.07, 0.12, -0.11, 0, 1.5, 0.5, 0.7));
  head.add(orb(goldM, 0.05, 0.1, 0.1, 0.075, 1.4, 0.5, 0.8));
  head.add(orb(goldM, 0.05, 0.1, 0.1, -0.075, 1.4, 0.5, 0.8));
  const eyeL = makeEye(0.045, 0xffc23a, { slit: true, glow: 0.9 });
  const eyeR = makeEye(0.045, 0xffc23a, { slit: true, glow: 0.9 });
  eyeL.position.set(0.12, 0.045, 0.085); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.12, 0.045, -0.085); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  for (const side of [1, -1] as const) {
    head.add(bone(hornM, -0.02, 0.1, side * 0.09, -0.2, 0.22, side * 0.13, 0.035, 0.02));
    head.add(spike(hornM, -0.2, 0.22, side * 0.13, -0.38, 0.26, side * 0.16, 0.02));
    head.add(spike(hornM, 0, -0.04, side * 0.15, -0.08, -0.12, side * 0.24, 0.022));
  }

  finishShadows(g);

  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.7) * 0.025;
    torso.scale.set(1.0, 1.18 + Math.sin(t * 1.7) * 0.025, 0.88);
    head.rotation.y = Math.sin(t * 0.6) * 0.16;
    head.rotation.z = Math.sin(t * 0.45 + 2) * 0.05;
    const bl = blinkAt(t, 5.1);
    eyeL.scale.y = eyeR.scale.y = 1 - bl * 0.92;
    // low guard sway, then a proud flourish every few breaths
    const fl = gate(t, 8.4, 7);
    armR.rotation.z = Math.sin(t * 1.7 + 1) * 0.05 + fl * 0.55;
    armR.rotation.x = Math.sin(t * 1.2) * 0.04;
    sword.rotation.x = Math.sin(t * 1.4) * 0.05;
    bladeM.emissiveIntensity = 1.8 + Math.sin(t * 6.2) * 0.35 + fl * 1.6;
    flickAll(flick, t);
    wingL.rotation.y = 0.55 + Math.sin(t * 1.1) * 0.07 + fl * 0.3;
    wingL.rotation.x = -0.12;
    wingR.rotation.y = -0.55 - Math.sin(t * 1.1 + 0.6) * 0.07 - fl * 0.3;
    wingR.rotation.x = 0.12;
    t1.rotation.y = Math.sin(t * 1.3) * 0.16;
    t2.rotation.y = Math.sin(t * 1.3 - 0.7) * 0.2;
    t3.rotation.y = Math.sin(t * 1.3 - 1.4) * 0.24;
  };
  return { body: g, parts: { head, tail, wings: [wingL, wingR] }, animate };
}

// ============================================================
// ONTHROFA — The Folded Sky. A violet entity of Space and Time:
// a nebula-skinned core in a spectral mantle, three counter-
// rotating orbit rings, a slow golden hour-dial with sweeping
// hands, a drifting hourglass, and the occasional space-fold.
// ============================================================
function buildOnthrofa(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.85;
  g.add(core);

  const neb = nebulaPair('onth-neb', 909);
  const bodyM = std({ map: neb.map, emissiveMap: neb.glow, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.45, metalness: 0.1 });
  const orbBody = orb(bodyM, 0.34, 0, 0.1, 0, 1, 1.08, 1, 20, 16);
  core.add(orbBody);
  // the void face — two slanted light-eyes and a time-gem
  core.add(orb(std({ color: 0x07030e, roughness: 0.3 }), 0.21, 0.17, 0.16, 0, 1.05, 0.95, 1.05));
  const eyeM = std({ color: 0xd8c8ff, emissive: 0xd8c8ff, emissiveIntensity: 2.6, roughness: 0.1 });
  const eyeL = orb(eyeM, 0.05, 0.33, 0.2, 0.085, 0.55, 1.5, 0.9, 8, 6);
  const eyeR = orb(eyeM, 0.05, 0.33, 0.2, -0.085, 0.55, 1.5, 0.9, 8, 6);
  eyeL.rotation.x = -0.3; eyeR.rotation.x = 0.3;
  core.add(eyeL, eyeR);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05),
    std({ color: 0xff9ad2, emissive: 0xff9ad2, emissiveIntensity: 1.8, roughness: 0.15 }));
  gem.position.set(0.3, 0.38, 0);
  gem.scale.set(0.7, 1.3, 0.7);
  core.add(gem);

  // spectral mantle draping below
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    pts.push(new THREE.Vector2(0.12 + Math.sin(k * Math.PI * 0.62) * 0.34 + k * k * 0.1, 0.1 - k * 0.62));
  }
  const mantle = new THREE.Mesh(new THREE.LatheGeometry(pts, 18),
    std({ color: 0x3a2070, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.65, emissive: 0x1c0a3e, emissiveIntensity: 0.6 }));
  mantle.userData.noShadow = true;
  core.add(mantle);

  // gyroscope of Space — three counter-tilted orbit rings
  const ringMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const mkRing = (r: number, tube: number, c: number, o: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 40), ringMat(c, o));
    m.userData.noShadow = true;
    core.add(m);
    return m;
  };
  const ring1 = mkRing(0.5, 0.02, 0x9a6af2, 0.8);
  const ring2 = mkRing(0.6, 0.016, 0xff9ad2, 0.65);
  const ring3 = mkRing(0.7, 0.013, 0x6a8aff, 0.5);
  ring1.rotation.set(1.1, 0.3, 0);
  ring2.rotation.set(-0.7, 0.9, 0.4);
  ring3.rotation.set(0.4, -0.5, 1.2);

  // the Hour-Dial of Time — a golden clock turning about its waist
  const dialG = new THREE.Group();
  dialG.position.y = -0.1;
  dialG.rotation.x = 0.12;
  core.add(dialG);
  const dial = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.018, 6, 48), ringMat(0xd8b86a, 0.75));
  dial.rotation.x = Math.PI / 2;
  dial.userData.noShadow = true;
  dialG.add(dial);
  const markM = std({ color: 0xffd88a, emissive: 0xd8a84a, emissiveIntensity: 1.6, roughness: 0.2 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(i % 3 === 0 ? 0.038 : 0.024), markM);
    mk.position.set(Math.cos(a) * 0.88, 0, Math.sin(a) * 0.88);
    mk.userData.noShadow = true;
    dialG.add(mk);
  }
  const handHour = new THREE.Group();
  const handMin = new THREE.Group();
  handHour.add(spike(markM, 0.18, 0, 0, 0.62, 0, 0, 0.022));
  handMin.add(spike(markM, 0.18, 0, 0, 0.8, 0, 0, 0.016));
  dialG.add(handHour, handMin);

  // a lone hourglass, drifting the dial's edge, lazily tumbling
  const hg = new THREE.Group();
  core.add(hg);
  const glassM = std({ color: 0xc8d8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
  const sandM = std({ color: 0xffd88a, emissive: 0xffb84a, emissiveIntensity: 1.5, roughness: 0.3 });
  const cTop = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 8), glassM);
  cTop.rotation.z = Math.PI;
  cTop.position.y = 0.058;
  const cBot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 8), glassM);
  cBot.position.y = -0.058;
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 8), markM);
  capT.position.y = 0.118;
  const capB = capT.clone();
  capB.position.y = -0.118;
  hg.add(cTop, cBot, capT, capB,
    orb(sandM, 0.034, 0, 0.052, 0, 1, 0.55, 1, 8, 6),
    bone(sandM, 0, 0.03, 0, 0, -0.07, 0, 0.006, 0.006, 5),
    orb(sandM, 0.03, 0, -0.095, 0, 1, 0.6, 1, 8, 6));
  hg.traverse(o => { o.userData.noShadow = true; });

  // orbiting space-shards
  const shardM = std({ color: 0x9a6af2, emissive: 0x7a4ae2, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.9 });
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.045 + (i % 3) * 0.012), shardM);
    sh.userData.noShadow = true;
    shards.push(sh);
    core.add(sh);
  }
  const light = new THREE.PointLight(0x9a6af2, 6, 6);
  light.position.y = 0.2;
  core.add(light);

  finishShadows(g);

  const animate = (t: number, dt: number) => {
    core.position.y = 0.85 + Math.sin(t * 1.25) * 0.07;
    orbBody.rotation.y += dt * 0.22;
    mantle.rotation.y -= dt * 0.12;
    mantle.scale.x = mantle.scale.z = 1 + Math.sin(t * 1.6) * 0.045;
    ring1.rotation.x += dt * 0.6; ring1.rotation.y += dt * 0.23;
    ring2.rotation.y -= dt * 0.45; ring2.rotation.z += dt * 0.3;
    ring3.rotation.x -= dt * 0.34; ring3.rotation.z -= dt * 0.5;
    dialG.rotation.y += dt * 0.06;
    handHour.rotation.y -= dt * 0.22;
    handMin.rotation.y -= dt * 1.35;
    const ha = t * 0.4;
    hg.position.set(Math.cos(ha) * 0.62, 0.34 + Math.sin(t * 1.7) * 0.05, Math.sin(ha) * 0.62);
    hg.rotation.y = -ha;
    hg.rotation.z = Math.sin(t * 0.8) * 0.2;
    for (let i = 0; i < shards.length; i++) {
      const a = t * (0.5 + (i % 3) * 0.21) + (i / shards.length) * Math.PI * 2;
      const rr = 0.46 + (i % 2) * 0.1;
      shards[i].position.set(Math.cos(a) * rr, Math.sin(a * 0.7 + i) * 0.35 + 0.05, Math.sin(a) * rr);
      shards[i].rotation.x += dt * 1.3;
      shards[i].rotation.y += dt * 0.9;
    }
    // the Fold — space hiccups, and the world agrees to look away
    const k = gate(t, 7.6, 16);
    orbBody.scale.set(1 - k * 0.22, 1.08 + k * 0.12, 1 + k * 0.22);
    light.intensity = 6 + k * 9 + Math.sin(t * 3.1) * 1.2;
    gem.rotation.y += dt * (1 + k * 14);
    const bl = blinkAt(t, 6.3);
    eyeL.scale.y = eyeR.scale.y = 1.5 * (1 - Math.max(bl, k * 0.55) * 0.85);
  };
  return { body: g, parts: { head: orbBody }, animate };
}

// ============================================================
// VULFENIX — The Midnight Ember. A rose-fire phoenix that never
// lands: spread plume wings, three rippling tail ribbons, a
// crest of pink flame — and a wake of ember motes shed from its
// wingtips and tail that hang in the air behind it.
// ============================================================
function buildVulfenix(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.72;
  g.add(core);
  const flick: Flick[] = [];

  const plumeM = std({ map: featherTex('vulf-plume', '#ff4f9e', '#b81d68', '#ffd0e8', 313), roughness: 0.6, metalness: 0.05 });
  const breastM = std({ map: featherTex('vulf-breast', '#ff9ec9', '#d6539b', '#ffd8ec', 314), roughness: 0.65 });
  const beakM = std({ color: 0xf2b84a, metalness: 0.6, roughness: 0.3 });
  const addFlame = (parent: THREE.Object3D, x: number, y: number, z: number, h: number, r: number, speed = 9, rz = 0) => {
    const f = makeFlame(h, r, 0xfff0d8, 0xff5aa8);
    f.position.set(x, y, z);
    f.rotation.z = rz;
    parent.add(f);
    flick.push({ g: f, speed, ph: Math.random() * 9, amp: 0.18 });
    return f;
  };

  // body
  const chest = orb(plumeM, 0.27, 0, 0, 0, 1.25, 1.02, 0.92);
  core.add(chest);
  core.add(orb(breastM, 0.2, 0.14, -0.08, 0, 1.05, 0.92, 0.8));

  // head: golden beak, fire-crest
  const head = new THREE.Group();
  head.position.set(0.32, 0.22, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(plumeM, 0.135, 0, 0, 0, 1.05, 1, 0.95));
  head.add(orb(breastM, 0.085, 0.08, -0.04, 0, 1.1, 0.8, 0.85));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 7), beakM);
  beak.rotation.z = -Math.PI / 2 - 0.12;
  beak.position.set(0.19, -0.01, 0);
  head.add(beak);
  const eyeL = makeEye(0.045, 0xffd84a, { glow: 0.7 });
  const eyeR = makeEye(0.045, 0xffd84a, { glow: 0.7 });
  eyeL.position.set(0.09, 0.04, 0.08); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.09, 0.04, -0.08); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  addFlame(head, -0.02, 0.12, 0, 0.2, 0.05, 8, 0.75);
  addFlame(head, 0.03, 0.13, 0.05, 0.14, 0.04, 10, 0.6);
  addFlame(head, 0.03, 0.13, -0.05, 0.14, 0.04, 11, 0.6);

  // wings — spread wide in a glide, plume membrane + fire fringe
  const mkWing = (side: 1 | -1) => {
    const w = new THREE.Group();
    w.position.set(0.02, 0.12, side * 0.16);
    core.add(w);
    w.add(bone(plumeM, 0, 0, 0, -0.04, 0.16, side * 0.42, 0.05, 0.032));
    w.add(bone(plumeM, -0.04, 0.16, side * 0.42, -0.1, 0.18, side * 0.78, 0.032, 0.014));
    const sh = new THREE.Shape();
    sh.moveTo(0.06, 0);
    sh.lineTo(0.02, 0.45);
    sh.lineTo(-0.1, 0.8);
    sh.quadraticCurveTo(-0.22, 0.7, -0.3, 0.6);
    sh.quadraticCurveTo(-0.24, 0.46, -0.32, 0.34);
    sh.quadraticCurveTo(-0.26, 0.22, -0.34, 0.1);
    sh.quadraticCurveTo(-0.2, 0, -0.12, -0.02);
    sh.closePath();
    const memb = new THREE.Mesh(new THREE.ShapeGeometry(sh, 4),
      std({ map: featherTex('vulf-plume', '#ff4f9e', '#b81d68', '#ffd0e8', 313), side: THREE.DoubleSide, roughness: 0.6, transparent: true, opacity: 0.96 }));
    memb.rotation.x = side * Math.PI / 2;
    memb.position.y = 0.08;
    memb.userData.noShadow = true;
    w.add(memb);
    const memb2 = new THREE.Mesh(new THREE.ShapeGeometry(sh, 4),
      std({ map: featherTex('vulf-breast', '#ff9ec9', '#d6539b', '#ffd8ec', 314), side: THREE.DoubleSide, roughness: 0.65, transparent: true, opacity: 0.9 }));
    memb2.rotation.x = side * Math.PI / 2;
    memb2.position.y = 0.045;
    memb2.scale.setScalar(0.72);
    memb2.userData.noShadow = true;
    w.add(memb2);
    addFlame(w, -0.14, 0.18, side * 0.78, 0.16, 0.045, 9, 1.0);
    addFlame(w, -0.3, 0.1, side * 0.5, 0.12, 0.04, 11, 1.05);
    const tip = new THREE.Object3D();
    tip.position.set(-0.12, 0.18, side * 0.76);
    w.add(tip);
    return { w, tip };
  };
  const { w: wingL, tip: tipL } = mkWing(1);
  const { w: wingR, tip: tipR } = mkWing(-1);

  // three rippling tail ribbons, fire at every tip
  const ribbons: THREE.Group[][] = [];
  let tailTip: THREE.Object3D = core;
  for (let rIdx = 0; rIdx < 3; rIdx++) {
    const segs: THREE.Group[] = [];
    let parent: THREE.Object3D = core;
    for (let d = 0; d < 4; d++) {
      const seg = new THREE.Group();
      seg.position.set(d === 0 ? -0.26 : -0.21, d === 0 ? -0.02 : -0.05, d === 0 ? (rIdx - 1) * 0.09 : 0);
      parent.add(seg);
      const piece = orb(plumeM, 0.05 - d * 0.008, -0.11, -0.02, 0, 2.4, 0.55, 0.8, 8, 6);
      if (d > 1) piece.userData.noShadow = true;
      seg.add(piece);
      segs.push(seg);
      parent = seg;
    }
    ribbons.push(segs);
    const f = addFlame(segs[3], -0.26, -0.05, 0, 0.12, 0.035, 8 + rIdx, 1.1);
    void f;
    if (rIdx === 1) {
      tailTip = new THREE.Object3D();
      tailTip.position.set(-0.28, -0.06, 0);
      segs[3].add(tailTip);
    }
  }

  // tucked talons — it has not landed in fifteen years
  for (const side of [1, -1] as const) {
    core.add(bone(plumeM, 0.06, -0.2, side * 0.1, 0.12, -0.32, side * 0.1, 0.045, 0.03));
    core.add(orb(beakM, 0.035, 0.14, -0.34, side * 0.1, 1.3, 0.7, 0.9, 7, 6));
  }

  const light = new THREE.PointLight(0xff7ac8, 5, 5);
  light.position.y = 0.1;
  core.add(light);

  // the ember wake — pooled additive motes shed in flight
  interface Mote { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; vel: THREE.Vector3; life: number; max: number; }
  const motes: Mote[] = [];
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff5aa8 : 0xffc23a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), mat);
    m.visible = false;
    m.userData.noShadow = true;
    g.add(m);
    motes.push({ m, mat, vel: new THREE.Vector3(), life: 0, max: 1 });
  }
  const emitters = [tipL, tipR, tailTip];
  let emitClock = 0, emitIdx = 0, nextMote = 0;
  const tmpV = new THREE.Vector3();

  finishShadows(g);

  const animate = (t: number, dt: number) => {
    const d = Math.min(dt, 0.05);
    const flap = Math.sin(t * 2.3);
    wingL.rotation.x = -0.12 - flap * 0.4;
    wingR.rotation.x = 0.12 + flap * 0.4;
    core.position.y = 0.72 + Math.sin(t * 2.3 - 1.3) * 0.05 + Math.sin(t * 0.6) * 0.04;
    core.rotation.z = Math.sin(t * 0.9) * 0.05;
    chest.scale.set(1.25, 1.02 + Math.sin(t * 2.3) * 0.025, 0.92);
    head.rotation.y = Math.sin(t * 0.55) * 0.22;
    head.rotation.z = gate(t, 7.7, 12) * 0.18;
    const bl = blinkAt(t, 4.3);
    eyeL.scale.y = eyeR.scale.y = 1 - bl * 0.9;
    ribbons.forEach((segs, i) => segs.forEach((seg, dd) => {
      seg.rotation.y = Math.sin(t * 1.9 - dd * 0.75 + i * 1.8) * 0.16;
      seg.rotation.z = 0.08 + Math.sin(t * 1.5 - dd * 0.6 + i) * 0.1;
    }));
    flickAll(flick, t);
    light.intensity = 4.5 + Math.sin(t * 3.4) * 1.2 + flap * 0.6;
    // shed embers from wingtips and tail; let them hang and fade
    emitClock += d;
    while (emitClock > 0.07) {
      emitClock -= 0.07;
      const em = emitters[emitIdx++ % emitters.length];
      const mo = motes[nextMote++ % motes.length];
      em.getWorldPosition(tmpV);
      mo.m.position.copy(g.worldToLocal(tmpV));
      mo.vel.set(-0.32 - Math.random() * 0.15, -0.1 - Math.random() * 0.12, (Math.random() - 0.5) * 0.16);
      mo.life = mo.max = 0.85 + Math.random() * 0.35;
      mo.m.visible = true;
    }
    for (const mo of motes) {
      if (!mo.m.visible) continue;
      mo.life -= d;
      if (mo.life <= 0) { mo.m.visible = false; mo.mat.opacity = 0; continue; }
      mo.m.position.addScaledVector(mo.vel, d);
      const k = mo.life / mo.max;
      mo.mat.opacity = 0.85 * k;
      mo.m.scale.setScalar(0.4 + k * 0.8);
      mo.m.rotation.y += d * 3;
    }
  };
  return { body: g, parts: { head, wings: [wingL, wingR] }, animate };
}

// ============================================================
// ASHWISP — a will-o-wisp born where a campfire was loved.
// A soft ball of warm ash cradling an ember heart, crowned with
// little flames, trailing smoke puffs and three embers that
// drift in a lazy orbit. It bobs along like a balloon on a string.
// ============================================================
function buildAshwisp(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const ashM = std({ map: furTex('ash-coat', '#c8c4bc', '#86817a', '#ece9e1', 7), roughness: 0.96 });
  const emberM = std({ color: 0xf2803a, emissive: 0xff7a2a, emissiveIntensity: 1.0, roughness: 0.5 });

  // ashen teardrop body with a glowing heart showing through a belly vent
  const bodyOrb = orb(ashM, 0.26, 0, 0, 0, 1, 1.16, 1);
  core.add(bodyOrb);
  core.add(orb(emberM, 0.12, 0.06, -0.06, 0, 1.1, 0.9, 1, 12, 10)); // heart glow
  const vent = orb(emberM, 0.07, 0.2, -0.04, 0, 1, 1.3, 0.7, 10, 8); // belly vent
  core.add(vent);

  // crown of baby flames
  const flick: Flick[] = [];
  for (const [x, y, z, h, r] of [[0, 0.25, 0, 0.26, 0.08], [0.1, 0.21, 0.06, 0.18, 0.055],
    [-0.1, 0.21, -0.06, 0.18, 0.055], [0.06, 0.19, -0.13, 0.14, 0.045], [-0.06, 0.19, 0.13, 0.14, 0.045]] as const) {
    const f = makeFlame(h, r, 0xfff0c8, 0xf2803a);
    f.position.set(x, y, z);
    core.add(f);
    flick.push({ g: f, speed: 7 + Math.random() * 3, ph: Math.random() * 9, amp: 0.22 });
  }

  // shy little face
  const eyeL = makeEye(0.046, 0xfff0c8, { glow: 1.1 });
  const eyeR = makeEye(0.046, 0xfff0c8, { glow: 1.1 });
  eyeL.position.set(0.23, 0.05, 0.085); eyeL.rotation.y = -0.45;
  eyeR.position.set(0.23, 0.05, -0.085); eyeR.rotation.y = 0.45;
  core.add(eyeL, eyeR);

  // trailing smoke puffs
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const p = orb(std({ color: 0x9a948c, transparent: true, opacity: 0.5 - i * 0.1, roughness: 1 }),
      0.1 - i * 0.017, -0.05 - i * 0.12, -0.18 - i * 0.09, 0, 1, 1, 1, 8, 6);
    p.userData.noShadow = true;
    core.add(p); puffs.push(p);
  }

  // orbiting embers
  const motes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = orb(std({ color: 0xffcaa0, emissive: 0xff8a3a, emissiveIntensity: 1.5, roughness: 0.3 }),
      0.026, 0, 0, 0, 1, 1, 1, 6, 5);
    m.userData.noShadow = true;
    core.add(m); motes.push(m);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.62 + Math.sin(t * 1.6) * 0.07;
    core.rotation.z = Math.sin(t * 1.15) * 0.07;
    core.rotation.y = Math.sin(t * 0.6) * 0.18;
    bodyOrb.scale.set(1, 1.16 + Math.sin(t * 2.4) * 0.045, 1);
    emberM.emissiveIntensity = 0.85 + Math.sin(t * 3.1) * 0.3 + gate(t, 6.2, 4) * 0.4;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.4, 0.6);
    for (let i = 0; i < motes.length; i++) {
      const a = t * 1.4 + i * (Math.PI * 2 / 3);
      motes[i].position.set(Math.cos(a) * 0.34, 0.02 + Math.sin(a * 1.6) * 0.12, Math.sin(a) * 0.34);
    }
    for (let i = 0; i < puffs.length; i++) puffs[i].position.x = Math.sin(t * 1.3 + i) * 0.04;
    flickAll(flick, t);
  };
  return { body: g, parts: { head: core }, animate };
}

// ============================================================
// FLAREKIN — a small imp of living flame that juggles its own
// sparks to show off. Teardrop ember body, cheeky horned face,
// stubby arms, and three spark-orbs whirling between its hands.
// ============================================================
function buildFlarekin(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const skin = stripePair('flare-skin', '#e06a2a', '#a8401a', '#ffca80', 14);
  const bodyM = std({ map: skin.map, emissiveMap: skin.glow, emissive: 0xff7a2a, emissiveIntensity: 0.7, roughness: 0.7 });
  const hotM = std({ color: 0xf2b03a, emissive: 0xffaa2a, emissiveIntensity: 1.0, roughness: 0.5 });
  const hornM = std({ color: 0x3a1e10, roughness: 0.7 });

  // teardrop flame body
  const torso = orb(bodyM, 0.24, 0, 0.5, 0, 0.92, 1.25, 0.92);
  core.add(torso);
  core.add(orb(hotM, 0.13, 0.04, 0.36, 0, 1, 1.1, 1, 10, 8)); // hot belly

  // head
  const head = new THREE.Group();
  head.position.set(0.04, 0.82, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.17, 0, 0, 0, 1.05, 0.95, 1));
  // mischief horns
  head.add(spike(hornM, -0.04, 0.12, 0.08, -0.14, 0.34, 0.1, 0.035));
  head.add(spike(hornM, -0.04, 0.12, -0.08, -0.14, 0.34, -0.1, 0.035));
  // grin + eyes
  const eyeL = makeEye(0.052, 0xfff8d8, { glow: 1.0, slit: true });
  const eyeR = makeEye(0.052, 0xfff8d8, { glow: 1.0, slit: true });
  eyeL.position.set(0.13, 0.04, 0.085); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.04, -0.085); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), std({ color: 0x2a1208, roughness: 0.6 }));
  grin.position.set(0.15, -0.06, 0); grin.rotation.set(Math.PI / 2, 0, Math.PI);
  head.add(grin);
  // flame crest
  const flick: Flick[] = [];
  for (const [z, h] of [[0, 0.2], [0.06, 0.14], [-0.06, 0.14]] as const) {
    const f = makeFlame(h, 0.05, 0xfff8d8, 0xf2803a);
    f.position.set(-0.02, 0.16, z);
    head.add(f);
    flick.push({ g: f, speed: 9 + Math.random() * 2, ph: Math.random() * 9, amp: 0.2 });
  }

  // stubby arms (animated to juggle)
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(0.06, 0.58, 0.22); armR.position.set(0.06, 0.58, -0.22);
  armL.add(bone(bodyM, 0, 0, 0, 0.12, -0.18, 0.04, 0.05, 0.035));
  armR.add(bone(bodyM, 0, 0, 0, 0.12, -0.18, -0.04, 0.05, 0.035));
  const handL = orb(hotM, 0.055, 0.12, -0.18, 0.04, 1, 1, 1, 8, 6);
  const handR = orb(hotM, 0.055, 0.12, -0.18, -0.04, 1, 1, 1, 8, 6);
  armL.add(handL); armR.add(handR);
  core.add(armL, armR);

  // stubby legs
  for (const sgn of [1, -1]) {
    core.add(bone(bodyM, 0.02, 0.3, sgn * 0.1, 0.06, 0.06, sgn * 0.12, 0.06, 0.04));
    core.add(orb(hornM, 0.05, 0.1, 0.04, sgn * 0.12, 1.3, 0.7, 1, 8, 6));
  }

  // three juggled spark orbs
  const sparks: THREE.Mesh[] = [];
  const sparkM = std({ color: 0xfff8d8, emissive: 0xffce5a, emissiveIntensity: 1.8, roughness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const sp = orb(sparkM, 0.045, 0, 0, 0, 1, 1, 1, 8, 6);
    sp.userData.noShadow = true;
    core.add(sp); sparks.push(sp);
  }

  finishShadows(g);
  const animate = (t: number) => {
    const bounce = Math.abs(Math.sin(t * 3.2)) * 0.05;
    core.position.y = bounce;
    core.rotation.z = Math.sin(t * 3.2) * 0.02;
    torso.scale.set(0.92, 1.25 + Math.sin(t * 4) * 0.04, 0.92);
    head.rotation.y = Math.sin(t * 1.1) * 0.2;
    head.rotation.z = Math.sin(t * 2.6) * 0.05;
    bodyM.emissiveIntensity = 0.6 + Math.sin(t * 3.4) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.8 * blinkAt(t, 3.8, 0.4);
    armL.rotation.z = -0.3 + Math.sin(t * 5) * 0.25;
    armR.rotation.z = -0.3 - Math.sin(t * 5) * 0.25;
    // juggle: three sparks on a vertical figure path between the hands
    for (let i = 0; i < 3; i++) {
      const ph = t * 4 + i * (Math.PI * 2 / 3);
      sparks[i].position.set(0.18 + Math.cos(ph) * 0.02, 0.5 + 0.22 + Math.sin(ph) * 0.16, Math.sin(ph) * 0.22);
    }
    flickAll(flick, t);
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// PYRELISK — a magma serpent that swims through stone as if it
// were water. Eight basalt-plated segments over a molten belly,
// a horned fanged head, a dorsal sail of cooling spines and a
// burning tail. It undulates in a slow lava-stroke.
// ============================================================
function buildPyrelisk(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const hide = crackPair('pyrelisk-hide', '#b84a1a', '#6a2408', '#ffb03a', 31);
  const bodyM = std({ map: hide.map, emissiveMap: hide.glow, emissive: 0xff7a2a, emissiveIntensity: 0.55, roughness: 0.82 });
  const bellyM = std({ color: 0xffb84a, emissive: 0xff8a2a, emissiveIntensity: 0.95, roughness: 0.5 });
  const hornM = std({ color: 0x2a1810, roughness: 0.7 });
  const fangM = std({ color: 0xfff4e0, roughness: 0.35 });

  // chained segments running back along -X
  const N = 8;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.28 - i * 0.24, 0, 0);
    const r = 0.21 * (1 - i / (N + 3));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.92, 1.06));
    sgrp.add(orb(bellyM, r * 0.62, 0, -r * 0.55, 0, 1.25, 0.5, 0.9, 10, 8));
    if (i < N - 1) sgrp.add(spike(hornM, 0, r * 0.72, 0, -0.05, r * 1.6, 0, 0.032)); // dorsal spine
    core.add(sgrp);
    segs.push(sgrp);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0.52, 0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.22, 0, 0, 0, 1.2, 0.95, 1));
  head.add(bone(bellyM, 0.12, -0.04, 0, 0.36, -0.09, 0, 0.1, 0.07)); // snout
  head.add(spike(hornM, -0.02, 0.15, 0.1, -0.18, 0.42, 0.14, 0.045));
  head.add(spike(hornM, -0.02, 0.15, -0.1, -0.18, 0.42, -0.14, 0.045));
  const eyeL = makeEye(0.062, 0xffd23a, { glow: 0.9, slit: true });
  const eyeR = makeEye(0.062, 0xffd23a, { glow: 0.9, slit: true });
  eyeL.position.set(0.13, 0.08, 0.13); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.08, -0.13); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  const jaw = new THREE.Group();
  jaw.position.set(0.13, -0.11, 0);
  head.add(jaw);
  jaw.add(bone(bellyM, 0, 0, 0, 0.26, -0.02, 0, 0.065, 0.04));
  for (const sgn of [1, -1]) {
    head.add(spike(fangM, 0.32, -0.06, sgn * 0.06, 0.33, -0.15, sgn * 0.06, 0.02));
    jaw.add(spike(fangM, 0.2, 0, sgn * 0.05, 0.21, 0.07, sgn * 0.05, 0.014));
  }

  // burning tail tip
  const flick: Flick[] = [];
  const tf = makeFlame(0.3, 0.07);
  tf.position.set(0.28 - (N - 1) * 0.24 - 0.06, 0, 0);
  tf.rotation.z = Math.PI / 2;
  core.add(tf);
  flick.push({ g: tf, speed: 8.5, ph: 2, amp: 0.22 });

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 3 - i * 0.7) * 0.13;
      segs[i].position.y = Math.sin(t * 3 - i * 0.7 + 1.1) * 0.045;
      segs[i].rotation.x = Math.sin(t * 3 - i * 0.7) * 0.15;
    }
    head.position.z = Math.sin(t * 3 + 0.7) * 0.13;
    head.rotation.y = Math.sin(t * 1.5) * 0.18 + Math.sin(t * 3 + 0.7) * 0.1;
    jaw.rotation.z = -(0.05 + gate(t, 6.5, 6) * 0.3);
    bodyM.emissiveIntensity = 0.5 + Math.sin(t * 2.6) * 0.2 + gate(t, 7, 4) * 0.4;
    bellyM.emissiveIntensity = 0.9 + Math.sin(t * 2.6 + 1) * 0.25;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.4, 1.0);
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// VULKRAGON — a dragon with a caldera for a heart. A mountainous
// basalt-plated brute, knuckle-walking on lava-cracked arms, with
// an open caldera crater smoldering on its back that breathes
// white-hot and spits drifting embers. Mountains learn to flinch.
// ============================================================
function buildVulkragon(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const plates = platePair('vulk-plate', '#6a2a12', '#ff7a1e', 41);
  const bodyM = std({ map: plates.map, emissiveMap: plates.glow, emissive: 0xff6a1a, emissiveIntensity: 0.6, roughness: 0.9 });
  const cracks = crackPair('vulk-limb', '#7a2e12', '#3a1408', '#ff8a2a', 42);
  const limbM = std({ map: cracks.map, emissiveMap: cracks.glow, emissive: 0xff7a2a, emissiveIntensity: 0.5, roughness: 0.85 });
  const calderaM = std({ color: 0xffd24e, emissive: 0xffb23a, emissiveIntensity: 1.4, roughness: 0.4 });
  const hornM = std({ color: 0x1c100a, roughness: 0.6 });
  const tuskM = std({ color: 0xf2e6ca, roughness: 0.4 });

  // hulking torso, hunched forward
  const torso = orb(bodyM, 0.46, 0, 1.0, 0, 1.05, 1.0, 1.1);
  core.add(torso);
  core.add(orb(bodyM, 0.36, 0.18, 0.74, 0, 1.1, 0.95, 1.0)); // lower gut
  core.add(orb(limbM, 0.3, 0.22, 0.62, 0, 1.2, 0.7, 0.95)); // belly

  // back caldera crater
  const caldera = new THREE.Group();
  caldera.position.set(-0.3, 1.32, 0);
  caldera.rotation.z = 0.5;
  core.add(caldera);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 18), bodyM);
  rim.rotation.x = Math.PI / 2;
  caldera.add(rim);
  const lava = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), calderaM);
  lava.rotation.x = -Math.PI / 2; lava.position.y = 0.02;
  lava.userData.noShadow = true;
  caldera.add(lava);
  const smoke: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = orb(std({ color: 0x4a4038, transparent: true, opacity: 0.4, roughness: 1 }), 0.08, 0, 0, 0, 1, 1, 1, 7, 6);
    s.userData.noShadow = true;
    caldera.add(s); smoke.push(s);
  }

  // head, low and forward
  const head = new THREE.Group();
  head.position.set(0.46, 1.0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.27, 0, 0, 0, 1.2, 0.95, 1));
  head.add(bone(limbM, 0.18, -0.05, 0, 0.46, -0.12, 0, 0.15, 0.1)); // muzzle
  // back-swept horns
  for (const sgn of [1, -1]) {
    head.add(spike(hornM, -0.06, 0.18, sgn * 0.12, -0.34, 0.5, sgn * 0.2, 0.07));
    head.add(spike(hornM, 0.08, 0.16, sgn * 0.16, 0.0, 0.36, sgn * 0.24, 0.04)); // brow horns
    head.add(spike(tuskM, 0.4, -0.16, sgn * 0.09, 0.42, -0.34, sgn * 0.1, 0.03)); // tusks
  }
  const eyeL = makeEye(0.072, 0xffd23a, { glow: 1.0, slit: true });
  const eyeR = makeEye(0.072, 0xffd23a, { glow: 1.0, slit: true });
  eyeL.position.set(0.16, 0.1, 0.16); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.16, 0.1, -0.16); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), hornM);
    brow.position.set(0.17, 0.2, sgn * 0.15); brow.rotation.z = -0.2;
    head.add(brow);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0.2, -0.16, 0);
  head.add(jaw);
  jaw.add(bone(limbM, 0, 0, 0, 0.3, -0.03, 0, 0.1, 0.07));

  // massive knuckle arms
  const armGroups: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.18, 1.18, sgn * 0.5);
    arm.add(bone(bodyM, 0, 0, 0, 0.08, -0.5, sgn * 0.08, 0.16, 0.12)); // upper
    arm.add(bone(limbM, 0.08, -0.5, sgn * 0.08, 0.26, -0.92, sgn * 0.06, 0.12, 0.1)); // fore
    const fist = orb(bodyM, 0.16, 0.26, -0.96, sgn * 0.06, 1, 0.9, 1);
    arm.add(fist);
    for (const cz of [-0.07, 0, 0.07]) arm.add(spike(tuskM, 0.34, -1.0, sgn * 0.06 + cz, 0.44, -1.04, sgn * 0.06 + cz, 0.022));
    core.add(arm); armGroups.push(arm);
  }

  // stout hind legs
  for (const sgn of [1, -1]) {
    core.add(bone(bodyM, -0.06, 0.74, sgn * 0.34, -0.1, 0.34, sgn * 0.42, 0.16, 0.12));
    core.add(bone(limbM, -0.1, 0.34, sgn * 0.42, 0.06, 0.06, sgn * 0.4, 0.12, 0.09));
    const foot = orb(hornM, 0.13, 0.1, 0.06, sgn * 0.4, 1.2, 0.6, 1.1);
    core.add(foot);
    for (const cz of [-0.08, 0, 0.08]) core.add(spike(tuskM, 0.2, 0.05, sgn * 0.4 + cz, 0.3, 0.02, sgn * 0.4 + cz, 0.024));
  }

  // thick tail
  const tail = new THREE.Group();
  tail.position.set(-0.4, 0.78, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(bodyM, 0, 0, 0, -0.5, 0.08, 0, 0.16, 0.06));
  const tailTip = new THREE.Group();
  tailTip.position.set(-0.5, 0.08, 0);
  tail.add(tailTip);
  tailTip.add(bone(limbM, 0, 0, 0, -0.34, 0.18, 0, 0.06, 0.03));
  for (const sgn of [1, -1]) tailTip.add(spike(hornM, -0.3, 0.16, 0, -0.4, 0.3, sgn * 0.08, 0.03));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.7) * 0.025;
    torso.scale.set(1.05 + Math.sin(t * 1.7) * 0.02, 1.0, 1.1);
    head.rotation.x = 0.1 + Math.sin(t * 1.7 + 0.4) * 0.04;
    head.rotation.y = Math.sin(t * 0.5) * 0.14;
    jaw.rotation.z = -(0.08 + gate(t, 5.5, 5) * 0.28);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.5);
    armGroups[0].rotation.x = Math.sin(t * 1.3) * 0.08;
    armGroups[1].rotation.x = -Math.sin(t * 1.3 + 0.5) * 0.08;
    tail.rotation.y = Math.sin(t * 1.1) * 0.18;
    tailTip.rotation.y = Math.sin(t * 1.1 - 0.6) * 0.2;
    // caldera breathes and belches embers
    const heat = 1.2 + Math.sin(t * 2.4) * 0.4 + gate(t, 4.5, 3) * 0.8;
    calderaM.emissiveIntensity = heat;
    bodyM.emissiveIntensity = 0.5 + heat * 0.1;
    for (let i = 0; i < smoke.length; i++) {
      const ph = (t * 0.5 + i / smoke.length) % 1;
      smoke[i].position.set((i - 2) * 0.04, ph * 0.5, Math.sin(ph * 6 + i) * 0.05);
      smoke[i].scale.setScalar(0.6 + ph * 1.2);
      (smoke[i].material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - ph);
    }
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// IGNISAR — a fire seraph in beast form. A regal lion of molten
// gold whose pelt is sown with stars, a living-flame mane, a ring
// of fire haloed over its brow, and great feathered seraph wings
// that breathe as it idles. Old hymns say it carried the morning.
// ============================================================
function buildIgnisar(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const pelt = starPair('ignisar-pelt', 51);
  const bodyM = std({ map: pelt.map, emissiveMap: pelt.glow, emissive: 0xffae3a, emissiveIntensity: 0.7, roughness: 0.6, metalness: 0.15 });
  const goldM = std({ color: 0xffd86a, emissive: 0xffb23a, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
  const clawM = std({ color: 0xfff4d8, roughness: 0.35 });

  // leonine frame
  const chest = orb(bodyM, 0.34, 0.24, 0.9, 0, 1.15, 1.05, 0.96);
  core.add(chest);
  core.add(orb(bodyM, 0.3, -0.12, 0.86, 0, 1.2, 0.95, 0.9));
  core.add(orb(bodyM, 0.32, -0.42, 0.82, 0, 1.1, 1.0, 0.92)); // haunch
  core.add(bone(bodyM, 0.36, 1.0, 0, 0.56, 1.16, 0, 0.16, 0.12)); // neck

  // head
  const head = new THREE.Group();
  head.position.set(0.6, 1.2, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.22, 0, 0, 0, 1.1, 0.95, 1));
  head.add(bone(goldM, 0.14, -0.04, 0, 0.36, -0.07, 0, 0.1, 0.075)); // muzzle
  head.add(orb(std({ color: 0x2a1408, roughness: 0.6 }), 0.05, 0.37, -0.04, 0, 1, 0.8, 1, 8, 7));
  const eyeL = makeEye(0.062, 0xfff0a0, { glow: 1.2 });
  const eyeR = makeEye(0.062, 0xfff0a0, { glow: 1.2 });
  eyeL.position.set(0.15, 0.08, 0.12); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.15, 0.08, -0.12); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  const jaw = new THREE.Group();
  jaw.position.set(0.12, -0.12, 0);
  head.add(jaw);
  jaw.add(bone(goldM, 0, 0, 0, 0.24, -0.02, 0, 0.07, 0.045));
  for (const sgn of [1, -1]) head.add(spike(clawM, 0.32, -0.1, sgn * 0.05, 0.33, -0.18, sgn * 0.05, 0.016));

  // living-flame mane ringing the head
  const flick: Flick[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const f = makeFlame(0.26 + Math.random() * 0.08, 0.06, 0xfff4d8, 0xff9a2a);
    f.position.set(-0.08 + Math.cos(a) * 0.04, Math.sin(a) * 0.28, Math.cos(a + 1) * 0.28);
    f.rotation.z = -a * 0.2;
    head.add(f);
    flick.push({ g: f, speed: 7 + Math.random() * 3, ph: Math.random() * 9, amp: 0.2 });
  }

  // fire halo over the brow
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 24), goldM);
  halo.position.set(-0.05, 0.34, 0);
  halo.rotation.x = Math.PI / 2.3;
  head.add(halo);

  // feathered seraph wings
  const wingTex = std({ map: starPair('ignisar-wing', 52).map, emissive: 0xffb23a, emissiveIntensity: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(-0.05, 1.1, sgn * 0.3);
    for (let i = 0; i < 5; i++) {
      const len = 0.6 - i * 0.06;
      const feather = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), wingTex);
      feather.position.set(-0.05 - i * 0.02, 0.08 + i * 0.1, 0);
      feather.rotation.set(Math.PI / 2, 0, sgn * (0.4 + i * 0.18));
      feather.scale.set(0.35, 1, 1);
      feather.userData.noShadow = true;
      w.add(feather);
    }
    core.add(w); wings.push(w);
  }

  // legs
  const leonLeg = (hx: number, hz: number, rear: boolean) => {
    const kx = rear ? hx - 0.08 : hx + 0.04;
    core.add(bone(bodyM, hx, rear ? 0.78 : 0.8, hz, kx, 0.36, hz, rear ? 0.12 : 0.1, 0.07));
    core.add(bone(goldM, kx, 0.36, hz, hx + (rear ? 0.06 : 0.02), 0.08, hz, 0.06, 0.05));
    const px = hx + (rear ? 0.08 : 0.02);
    core.add(orb(goldM, 0.08, px, 0.06, hz, 1.3, 0.7, 1, 9, 7));
    for (const cz of [-0.035, 0, 0.035]) core.add(spike(clawM, px + 0.05, 0.05, hz + cz, px + 0.12, 0.02, hz + cz, 0.015));
  };
  leonLeg(0.32, 0.2, false); leonLeg(0.32, -0.2, false);
  leonLeg(-0.4, 0.22, true); leonLeg(-0.4, -0.22, true);

  // tufted flame tail
  const tail = new THREE.Group();
  tail.position.set(-0.66, 0.86, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(bodyM, 0, 0, 0, -0.3, 0.14, 0, 0.06, 0.035));
  const tailTip = new THREE.Group();
  tailTip.position.set(-0.3, 0.14, 0);
  tail.add(tailTip);
  const ttf = makeFlame(0.34, 0.09, 0xfff4d8, 0xff9a2a);
  ttf.position.set(-0.16, 0.1, 0); ttf.rotation.z = 0.5;
  tailTip.add(ttf);
  flick.push({ g: ttf, speed: 8, ph: 1, amp: 0.22 });

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.8) * 0.025;
    chest.scale.set(1.15, 1.05 + Math.sin(t * 1.8) * 0.03, 0.96);
    head.rotation.y = Math.sin(t * 0.5) * 0.18;
    head.rotation.x = -gate(t, 9, 6) * 0.08;
    jaw.rotation.z = -(0.05 + gate(t + 1, 7, 6) * 0.2);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.8, 1.2);
    halo.rotation.z = t * 0.6;
    bodyM.emissiveIntensity = 0.6 + Math.sin(t * 2.4) * 0.2;
    goldM.emissiveIntensity = 0.8 + Math.sin(t * 2.4 + 1) * 0.2;
    wings[0].rotation.x = Math.sin(t * 1.4) * 0.16;
    wings[1].rotation.x = -Math.sin(t * 1.4) * 0.16;
    tail.rotation.y = Math.sin(t * 1.5) * 0.3;
    tailTip.rotation.y = Math.sin(t * 1.5 - 0.6) * 0.25;
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// SOLPHYRA — the Phoenix of the First Dawn, an Aether being older
// than fire. A radiant bird of pale-gold flame with immense
// layered wings of feather-fire, a sweeping tail of burning
// plumes, and a dawn-blue crest. Night politely ends in its wake.
// (Aether stage — makeGuardian wraps it in the legend's halo.)
// ============================================================
function buildSolphyra(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.7;
  g.add(core);

  const plume = featherTex('solphyra-plume', '#ffce6a', '#e87a1a', '#fff4d0', 61);
  const bodyM = std({ map: plume, emissive: 0xffae3a, emissiveIntensity: 1.0, roughness: 0.5 });
  const dawnM = std({ color: 0x9ad8ff, emissive: 0x7ac0ff, emissiveIntensity: 1.1, roughness: 0.3 });
  const beakM = std({ color: 0xffd86a, emissive: 0xffb23a, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.3 });

  // upright phoenix body
  const torso = orb(bodyM, 0.3, 0.04, 0.5, 0, 0.95, 1.3, 0.95);
  core.add(torso);
  core.add(orb(bodyM, 0.22, 0.1, 0.78, 0, 0.9, 0.95, 0.9)); // breast

  // neck + head
  const head = new THREE.Group();
  head.position.set(0.16, 1.04, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(bodyM, 0.1, 0.84, 0, 0.16, 1.0, 0, 0.1, 0.08));
  head.add(orb(bodyM, 0.15, 0, 0, 0, 1.05, 1.0, 1));
  // hooked beak
  head.add(bone(beakM, 0.1, -0.02, 0, 0.3, -0.06, 0, 0.06, 0.012));
  head.add(bone(beakM, 0.1, -0.06, 0, 0.24, -0.1, 0, 0.045, 0.01));
  const eyeL = makeEye(0.05, 0xfff0a0, { glow: 1.3 });
  const eyeR = makeEye(0.05, 0xfff0a0, { glow: 1.3 });
  eyeL.position.set(0.1, 0.04, 0.1); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.04, -0.1); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);
  // dawn-blue crest plumes
  const flick: Flick[] = [];
  for (const [z, h] of [[0, 0.28], [0.05, 0.2], [-0.05, 0.2]] as const) {
    const f = makeFlame(h, 0.05, 0xd8f4ff, 0x7ac0ff);
    f.position.set(-0.04, 0.13, z);
    f.rotation.z = -0.3;
    head.add(f);
    flick.push({ g: f, speed: 6 + Math.random() * 2, ph: Math.random() * 9, amp: 0.18 });
  }

  // immense layered feather-fire wings
  const wingMap = featherTex('solphyra-wing', '#ffb84a', '#d9601a', '#fff0c0', 62);
  const wingMat = std({ map: wingMap, emissive: 0xffae3a, emissiveIntensity: 0.9, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(-0.02, 0.66, sgn * 0.22);
    for (let i = 0; i < 6; i++) {
      const len = 0.9 - i * 0.09;
      const feather = new THREE.Mesh(new THREE.CircleGeometry(len, 9, 0, Math.PI), wingMat);
      feather.position.set(-0.04 - i * 0.03, 0.05 + i * 0.13, 0);
      feather.rotation.set(Math.PI / 2, 0, sgn * (0.3 + i * 0.16));
      feather.scale.set(0.3, 1, 1);
      feather.userData.noShadow = true;
      w.add(feather);
    }
    core.add(w); wings.push(w);
  }

  // sweeping tail of burning plumes
  const tail = new THREE.Group();
  tail.position.set(-0.2, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  const tailFeathers: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const len = 0.7 - Math.abs(i - 2) * 0.08;
    const tf = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), wingMat);
    tf.position.set(-0.1, -0.1, (i - 2) * 0.1);
    tf.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    tf.scale.set(0.18, 1, 1);
    tf.userData.noShadow = true;
    tail.add(tf); tailFeathers.push(tf);
  }

  // talon legs
  for (const sgn of [1, -1]) {
    core.add(bone(beakM, 0.08, 0.3, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03));
    for (const cz of [-0.05, 0, 0.05]) core.add(spike(beakM, 0.12, 0.06, sgn * 0.13 + cz, 0.22, 0.02, sgn * 0.13 + cz, 0.014));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.7 + Math.sin(t * 1.5) * 0.06;
    torso.scale.set(0.95, 1.3 + Math.sin(t * 2.2) * 0.04, 0.95);
    head.rotation.y = Math.sin(t * 0.6) * 0.22;
    head.rotation.z = Math.sin(t * 1.3) * 0.05;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.8, 0.8);
    bodyM.emissiveIntensity = 0.9 + Math.sin(t * 2.3) * 0.25;
    // grand slow wingbeat
    const beat = Math.sin(t * 1.6);
    wings[0].rotation.x = beat * 0.5;
    wings[1].rotation.x = -beat * 0.5;
    wings[0].rotation.z = 0.1 + Math.abs(beat) * 0.1;
    wings[1].rotation.z = -0.1 - Math.abs(beat) * 0.1;
    for (let i = 0; i < tailFeathers.length; i++) tailFeathers[i].rotation.x = Math.PI / 2 + Math.sin(t * 1.4 + i * 0.4) * 0.12;
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// SMOLDERHOG — a hedgehog whose quills are banked coals. A round
// ball of soot-brown fur bristling with glowing ember spines that
// pulse like a dying campfire, a twitchy sniffing snout and stubby
// little feet. Campers love it; tents do not.
// ============================================================
function buildSmolderhog(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.28;
  g.add(core);

  const furM = std({ map: furTex('smolder-fur', '#5a4a42', '#33271f', '#7e6a5c', 71), roughness: 0.95 });
  const bellyM = std({ map: furTex('smolder-belly', '#8a7058', '#5a4636', '#a88a6c', 72), roughness: 0.9 });
  const coalM = std({ color: 0xe8682a, emissive: 0xff6a1a, emissiveIntensity: 1.1, roughness: 0.6 });
  const noseM = std({ color: 0x2a1a14, roughness: 0.4 });

  // round body
  const body = orb(furM, 0.32, 0, 0, 0, 1.15, 1.0, 1.05);
  core.add(body);
  core.add(orb(bellyM, 0.2, 0.16, -0.1, 0, 1.1, 0.7, 0.9)); // tummy

  // coal quills bristling over the back
  const quills: THREE.Mesh[] = [];
  const rq = rng(73);
  for (let i = 0; i < 36; i++) {
    const a = rq() * Math.PI * 2;
    const b = rq() * Math.PI - Math.PI / 2;
    const dir = v3(Math.cos(b) * Math.cos(a) * 0.3 - 0.1, Math.sin(b) * 0.34 + 0.12, Math.cos(b) * Math.sin(a) * 0.34);
    if (dir.x > 0.12) continue; // keep the face clear
    const base = dir.clone().multiplyScalar(0.85);
    const tip = dir.clone().multiplyScalar(1.7);
    const q = spike(coalM, base.x, base.y, base.z, tip.x, tip.y, tip.z, 0.018);
    core.add(q); quills.push(q);
  }

  // snout
  const head = new THREE.Group();
  head.position.set(0.26, 0.02, 0);
  head.name = 'head';
  core.add(head);
  head.add(bone(bellyM, 0, 0, 0, 0.2, -0.04, 0, 0.13, 0.06)); // tapered face
  const nose = orb(noseM, 0.04, 0.22, -0.04, 0, 1, 0.9, 1, 8, 7);
  head.add(nose);
  const eyeL = makeEye(0.04, 0x1a0f0a, { glow: 0.2, sclera: 0x3a2a20 });
  const eyeR = makeEye(0.04, 0x1a0f0a, { glow: 0.2, sclera: 0x3a2a20 });
  eyeL.position.set(0.08, 0.06, 0.09); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.08, 0.06, -0.09); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // round ears
  for (const sgn of [1, -1]) head.add(orb(furM, 0.05, -0.02, 0.13, sgn * 0.1, 1, 1, 0.5, 8, 6));

  // stubby feet
  for (const sgn of [1, -1]) {
    core.add(orb(bellyM, 0.06, 0.12, -0.28, sgn * 0.14, 1, 0.7, 1.2, 8, 6));
    core.add(orb(bellyM, 0.06, -0.16, -0.28, sgn * 0.14, 1, 0.7, 1.2, 8, 6));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.28 + Math.sin(t * 2.6) * 0.012;
    body.scale.set(1.15, 1.0 + Math.sin(t * 2.6) * 0.03, 1.05);
    head.rotation.z = -0.05 + gate(t, 3.5, 4) * 0.12; // sniffing
    head.rotation.y = Math.sin(t * 3 + 1) * gate(t, 3.5, 2) * 0.2;
    nose.scale.setScalar(1 + gate(t, 3.5, 6) * 0.3);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.2, 0.5);
    // banked coals breathe, and bristle on a slow gate
    const bristle = 1 + gate(t, 7, 3) * 0.5;
    coalM.emissiveIntensity = 0.85 + Math.sin(t * 3.2) * 0.35 + gate(t, 7, 3) * 0.6;
    for (let i = 0; i < quills.length; i++) quills[i].scale.set(1, bristle, 1);
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// MAGMABOAR — a boar armored in cooling lava plates. A stocky
// brute with a basalt-plated back leaking molten seams, a bristled
// glowing mane, upswept ivory tusks and a snout that snorts little
// puffs of ember. It charges first and never apologizes.
// ============================================================
function buildMagmaboar(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const hideM = std({ map: furTex('boar-hide', '#4a342c', '#2a1c16', '#6a4c3c', 81), roughness: 0.95 });
  const plates = platePair('boar-plate', '#5a3020', '#ff6a1e', 82);
  const plateM = std({ map: plates.map, emissiveMap: plates.glow, emissive: 0xff6a1a, emissiveIntensity: 0.55, roughness: 0.88 });
  const maneM = std({ color: 0xd9542e, emissive: 0xff6a2a, emissiveIntensity: 0.9, roughness: 0.6 });
  const tuskM = std({ color: 0xf2e6ca, roughness: 0.4 });
  const snoutM = std({ color: 0x3a241c, roughness: 0.7 });

  // barrel body
  const body = orb(hideM, 0.4, -0.05, 0.66, 0, 1.25, 0.98, 1.0);
  core.add(body);
  core.add(orb(hideM, 0.32, 0.26, 0.62, 0, 1.0, 0.95, 0.95)); // shoulders

  // plated back shell
  const backShell = orb(plateM, 0.38, -0.05, 0.78, 0, 1.2, 0.8, 0.95);
  core.add(backShell);
  // glowing bristle mane along the spine
  const flick: Flick[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 0.2 - i * 0.1;
    const f = makeFlame(0.16 - Math.abs(i - 3) * 0.012, 0.04, 0xffce8a, 0xff6a2a);
    f.position.set(x, 1.0, 0);
    f.rotation.z = -0.4;
    core.add(f);
    flick.push({ g: f, speed: 7 + Math.random() * 2, ph: Math.random() * 9, amp: 0.18 });
  }

  // head, low and forward
  const head = new THREE.Group();
  head.position.set(0.46, 0.62, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(hideM, 0.24, 0, 0, 0, 1.15, 0.95, 1));
  head.add(bone(snoutM, 0.16, -0.06, 0, 0.42, -0.1, 0, 0.13, 0.11)); // snout
  const snoutDisc = orb(snoutM, 0.11, 0.42, -0.1, 0, 1, 1, 0.6, 10, 8);
  head.add(snoutDisc);
  for (const sgn of [1, -1]) head.add(orb(noseHole(), 0.022, 0.44, -0.1, sgn * 0.04, 1, 1, 0.6, 6, 5));
  // upswept tusks
  for (const sgn of [1, -1]) {
    const tusk = bone(tuskM, 0.36, -0.14, sgn * 0.12, 0.5, 0.12, sgn * 0.16, 0.03, 0.008);
    head.add(tusk);
  }
  // angry eyes + brows
  const eyeL = makeEye(0.05, 0xffb13a, { glow: 0.9 });
  const eyeR = makeEye(0.05, 0xffb13a, { glow: 0.9 });
  eyeL.position.set(0.14, 0.1, 0.13); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.1, -0.13); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.07), snoutM);
    brow.position.set(0.15, 0.16, sgn * 0.12); brow.rotation.z = -0.2;
    head.add(brow);
    head.add(spike(hideM, -0.02, 0.18, sgn * 0.1, -0.1, 0.32, sgn * 0.12, 0.04)); // ears
  }

  // ember snort puffs
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const p = orb(std({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 1.2, transparent: true, opacity: 0.6, roughness: 0.5 }),
      0.03, 0, 0, 0, 1, 1, 1, 6, 5);
    p.userData.noShadow = true;
    head.add(p); puffs.push(p);
  }

  // stocky legs with hooves
  for (const [hx, hz, rear] of [[0.3, 0.22, false], [0.3, -0.22, false], [-0.28, 0.24, true], [-0.28, -0.24, true]] as const) {
    core.add(bone(hideM, hx, rear ? 0.42 : 0.46, hz, hx + 0.02, 0.16, hz, 0.1, 0.07));
    core.add(orb(snoutM, 0.07, hx + 0.02, 0.08, hz, 1, 0.9, 1.1, 8, 6)); // hoof
  }

  // little curly tail
  const tail = new THREE.Group();
  tail.position.set(-0.42, 0.74, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(hideM, 0, 0, 0, -0.16, 0.1, 0.06, 0.03, 0.018));
  tail.add(orb(maneM, 0.04, -0.18, 0.12, 0.1, 1, 1, 1, 7, 6));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2) * 0.018;
    body.scale.set(1.25 + Math.sin(t * 2) * 0.02, 0.98, 1.0);
    // head paws/snorts: dips down then jerks, charge-ready
    const snort = gate(t, 4.2, 5);
    head.rotation.x = 0.05 + snort * 0.12;
    head.rotation.y = Math.sin(t * 0.6) * 0.1;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.3);
    plateM.emissiveIntensity = 0.45 + Math.sin(t * 2.4) * 0.18 + snort * 0.3;
    tail.rotation.y = Math.sin(t * 3) * 0.3;
    for (let i = 0; i < puffs.length; i++) {
      const ph = (t * 1.5 + i / puffs.length) % 1;
      puffs[i].position.set(0.46 + ph * 0.22, -0.1 + ph * 0.04, (i % 2 ? 0.04 : -0.04));
      puffs[i].scale.setScalar((0.5 + ph) * (snort > 0.1 ? 1.4 : 0.6));
      (puffs[i].material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - ph) * (0.3 + snort);
    }
    flickAll(flick, t);
  };
  return { body: g, parts: { head, tail }, animate };
}
// little soot-rimmed nostril material (shared helper kept local to magmaboar)
function noseHole(): THREE.MeshStandardMaterial { return std({ color: 0x140a06, roughness: 0.8 }); }

// ============================================================
// CINDERBAT — a little ember bat that roosts in chimneys and
// dreams of bonfires. Fuzzy coal-red body, huge sooty wing
// membranes shot with ember veins, oversized ears and a tiny
// glowing coal of a heart. It flutters in place, never still.
// ============================================================
function buildCinderbat(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const furM = std({ map: furTex('cinder-fur', '#b0402a', '#6e2414', '#e0664a', 91), roughness: 0.92 });
  const emberM = std({ color: 0xe87a3a, emissive: 0xff6a2a, emissiveIntensity: 1.2, roughness: 0.5 });
  const earM = std({ color: 0x4a2a3a, roughness: 0.8 });
  const fangM = std({ color: 0xfff4e0, roughness: 0.35 });
  const membrane = finMat('cinder-wing', [74, 42, 58], [255, 122, 58], 0.82);

  // fuzzy round body
  const body = orb(furM, 0.2, 0, 0, 0, 1, 1.1, 0.95);
  core.add(body);
  core.add(orb(emberM, 0.08, 0.04, -0.04, 0.14, 1, 1, 0.6, 8, 7)); // coal heart glow
  core.add(orb(emberM, 0.08, 0.04, -0.04, -0.14, 1, 1, 0.6, 8, 7));

  // head with big ears
  const head = new THREE.Group();
  head.position.set(0.1, 0.18, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.14, 0, 0, 0, 1.05, 0.95, 1));
  // oversized ears
  const ears: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.02, 0.1, sgn * 0.08);
    const eMesh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), furM);
    eMesh.position.y = 0.12;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 6), earM);
    inner.position.set(0.02, 0.1, 0);
    ear.add(eMesh, inner);
    head.add(ear); ears.push(ear);
  }
  const eyeL = makeEye(0.05, 0xffce5a, { glow: 1.2 });
  const eyeR = makeEye(0.05, 0xffce5a, { glow: 1.2 });
  eyeL.position.set(0.1, 0.02, 0.07); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.1, 0.02, -0.07); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // snub snout + fangs
  head.add(orb(earM, 0.03, 0.13, -0.03, 0, 1, 0.9, 1, 7, 6));
  for (const sgn of [1, -1]) head.add(spike(fangM, 0.12, -0.06, sgn * 0.03, 0.12, -0.11, sgn * 0.03, 0.01));

  // membrane wings (multi-finger)
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(-0.02, 0.02, sgn * 0.15);
    // arm + finger bones
    w.add(bone(furM, 0, 0, 0, 0.0, 0.06, sgn * 0.4, 0.025, 0.012));
    for (let i = 0; i < 3; i++) {
      const fx = -0.12 + i * 0.12;
      w.add(spike(furM, 0.0, 0.06, sgn * 0.4, fx, -0.04, sgn * 0.62, 0.01));
    }
    // membrane panels
    const panel = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10, Math.PI * 0.1, Math.PI * 0.95), membrane);
    panel.position.set(0, 0.02, sgn * 0.32);
    panel.rotation.set(-Math.PI / 2, 0, sgn > 0 ? 0.2 : Math.PI - 0.2);
    panel.scale.set(1, sgn, 1);
    panel.userData.noShadow = true;
    w.add(panel);
    core.add(w); wings.push(w);
  }

  // little hanging feet
  for (const sgn of [1, -1]) core.add(spike(earM, 0, -0.18, sgn * 0.06, 0.04, -0.3, sgn * 0.06, 0.015));

  finishShadows(g);
  const animate = (t: number) => {
    const flap = Math.sin(t * 7);
    core.position.y = 0.62 + flap * 0.05;
    core.rotation.z = Math.sin(t * 1.4) * 0.05;
    body.scale.set(1, 1.1 + Math.sin(t * 7) * 0.04, 0.95);
    head.rotation.y = Math.sin(t * 1.1) * 0.2;
    head.rotation.z = Math.sin(t * 2.4) * 0.06;
    ears[0].rotation.x = Math.sin(t * 3) * 0.18;
    ears[1].rotation.x = -Math.sin(t * 3 + 0.6) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.4, 0.4);
    emberM.emissiveIntensity = 1.0 + Math.sin(t * 4) * 0.4;
    wings[0].rotation.x = flap * 0.7;
    wings[1].rotation.x = -flap * 0.7;
    wings[0].rotation.y = 0.2 + Math.abs(flap) * 0.2;
    wings[1].rotation.y = -0.2 - Math.abs(flap) * 0.2;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// ABYSSARCH — sovereign of the drowned dark. A long anglerfish
// eel of midnight scale, bioluminescent belly-stars, a dangling
// lure that breathes cold light over a jaw of glass needles, and
// ghostly fins that trail like torn banners. Its silence is mercy.
// ============================================================
function buildAbyssarch(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const scales = scaleTex('abyss-scale', '#102e7a', '#2a5db8', '#06173f', 101);
  const bodyM = std({ map: scales, emissive: 0x1a4da8, emissiveIntensity: 0.28, roughness: 0.55, metalness: 0.2 });
  const bellyM = std({ color: 0x081538, roughness: 0.5 });
  const glowM = std({ color: 0x8ad4ff, emissive: 0x8ad4ff, emissiveIntensity: 1.7, roughness: 0.2 });
  const fangM = std({ color: 0xe8f4ff, roughness: 0.3 });
  const finMatA = finMat('abyss-fin', [40, 90, 180], [138, 212, 255], 0.6);

  const N = 9;
  const segs: THREE.Group[] = [];
  const spots: THREE.Mesh[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.3 - i * 0.22, 0, 0);
    const r = 0.2 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.85, 1.1));
    sgrp.add(orb(bellyM, r * 0.6, 0, -r * 0.5, 0, 1.2, 0.5, 0.9, 10, 8));
    if (i % 2 === 0 && i < N - 1) { // belly star
      const sp = orb(glowM, 0.022, 0, -r * 0.55, 0, 1, 1, 1, 6, 5);
      sp.userData.noShadow = true;
      sgrp.add(sp); spots.push(sp);
    }
    if (i < N - 2) { // trailing dorsal fin
      const fin = makeFin(finMatA, r * 1.5, Math.PI * 0.15, Math.PI * 0.7);
      fin.position.set(0, r * 0.6, 0); fin.rotation.set(0, Math.PI / 2, Math.PI / 2);
      sgrp.add(fin);
    }
    core.add(sgrp);
    segs.push(sgrp);
  }

  // head + lure
  const head = new THREE.Group();
  head.position.set(0.52, 0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.24, 0, 0, 0, 1.15, 0.95, 1.05));
  const eyeL = makeEye(0.07, 0x8ad4ff, { glow: 1.4 });
  const eyeR = makeEye(0.07, 0x8ad4ff, { glow: 1.4 });
  eyeL.position.set(0.1, 0.1, 0.15); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.1, 0.1, -0.15); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // gaping jaw of needles
  const jaw = new THREE.Group();
  jaw.position.set(0.14, -0.12, 0);
  head.add(jaw);
  jaw.add(bone(bellyM, 0, 0, 0, 0.28, -0.02, 0, 0.09, 0.05));
  for (let k = 0; k < 6; k++) {
    const z = (k - 2.5) * 0.05;
    head.add(spike(fangM, 0.3, -0.08, z, 0.31, -0.18, z, 0.013));
    jaw.add(spike(fangM, 0.06 + k * 0.04, 0, z * 0.8, 0.06 + k * 0.04, 0.08, z * 0.8, 0.011));
  }
  // dangling lure on an arched stalk
  const stalk = new THREE.Group();
  stalk.position.set(0.05, 0.2, 0);
  head.add(stalk);
  stalk.add(bone(std({ color: 0x06112e, roughness: 0.6 }), 0, 0, 0, 0.34, 0.18, 0, 0.018, 0.01));
  const lure = orb(glowM, 0.05, 0.36, 0.16, 0, 1, 1, 1, 10, 8);
  lure.userData.noShadow = true;
  stalk.add(lure);
  const lureLight = new THREE.PointLight(0x8ad4ff, 3, 3);
  lureLight.position.set(0.36, 0.16, 0);
  stalk.add(lureLight);

  // tail fin
  const tailFin = makeFin(finMatA, 0.3, Math.PI * 0.2, Math.PI * 0.6);
  tailFin.position.set(0.3 - (N - 1) * 0.22 - 0.05, 0, 0);
  tailFin.rotation.set(0, 0, Math.PI / 2);
  core.add(tailFin);

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 2.4 - i * 0.6) * 0.14;
      segs[i].position.y = Math.sin(t * 2.4 - i * 0.6 + 1) * 0.04;
      segs[i].rotation.x = Math.sin(t * 2.4 - i * 0.6) * 0.12;
    }
    head.position.z = Math.sin(t * 2.4 + 0.6) * 0.14;
    head.rotation.y = Math.sin(t * 1.2) * 0.14 + Math.sin(t * 2.4 + 0.6) * 0.08;
    stalk.rotation.z = Math.sin(t * 1.6) * 0.2;
    jaw.rotation.z = -(0.1 + gate(t, 7, 5) * 0.3);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6.5, 1.4);
    const pulse = 1.4 + Math.sin(t * 2.5) * 0.5;
    glowM.emissiveIntensity = pulse;
    lureLight.intensity = 2 + Math.sin(t * 2.5) * 1.2;
    for (let i = 0; i < spots.length; i++) spots[i].scale.setScalar(1 + Math.sin(t * 3 + i) * 0.2);
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// LEVIATHORN — a mythical ocean dragon that raises tidal waves
// with a flick of its tail. A vast sinuous serpent in midnight-
// blue scale lit by cyan storm-veins, a crowned head with sweeping
// horns, a translucent dorsal sail and a great fluked tail.
// ============================================================
function buildLeviathorn(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.66;
  g.add(core);

  const scales = scaleTex('levi-scale', '#0a1a6a', '#2a7de8', '#04093a', 111);
  const bodyM = std({ map: scales, emissive: 0x00bcd4, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.3 });
  const bellyM = std({ color: 0x9ad8ff, emissive: 0x2a9de8, emissiveIntensity: 0.4, roughness: 0.4 });
  const crystM = std({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.4, flatShading: true });
  const hornM = std({ color: 0xe8f8ff, emissive: 0x6ad8ff, emissiveIntensity: 0.5, roughness: 0.3 });
  const sailMat = finMat('levi-sail', [20, 110, 220], [180, 250, 255], 0.55);

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.34 - i * 0.26, 0, 0);
    const r = 0.24 * (1 - i / (N + 5));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    sgrp.add(orb(bellyM, r * 0.6, 0, -r * 0.55, 0, 1.2, 0.5, 0.9, 10, 8));
    if (i < N - 1) { // dorsal sail webbing
      const sail = makeFin(sailMat, r * 1.7, Math.PI * 0.1, Math.PI * 0.8);
      sail.position.set(0, r * 0.7, 0); sail.rotation.set(0, Math.PI / 2, Math.PI / 2);
      sgrp.add(sail);
      sgrp.add(spike(crystM, 0, r * 0.7, 0, -0.04, r * 1.7, 0, 0.028)); // sail spine
    }
    core.add(sgrp);
    segs.push(sgrp);
  }

  // crowned head
  const head = new THREE.Group();
  head.position.set(0.56, 0.04, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.26, 0, 0, 0, 1.2, 0.95, 1));
  head.add(bone(bellyM, 0.14, -0.05, 0, 0.42, -0.1, 0, 0.12, 0.08)); // snout
  // sweeping crown horns
  for (const sgn of [1, -1]) {
    head.add(spike(hornM, -0.04, 0.18, sgn * 0.12, -0.34, 0.54, sgn * 0.22, 0.05));
    head.add(spike(hornM, 0.04, 0.18, sgn * 0.06, -0.18, 0.46, sgn * 0.08, 0.035));
    head.add(spike(crystM, 0.06, 0.04, sgn * 0.22, 0.0, -0.04, sgn * 0.3, 0.03)); // cheek frills
  }
  const eyeL = makeEye(0.07, 0x00ffff, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.07, 0x00ffff, { glow: 1.3, slit: true });
  eyeL.position.set(0.16, 0.1, 0.15); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.16, 0.1, -0.15); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  const jaw = new THREE.Group();
  jaw.position.set(0.16, -0.13, 0);
  head.add(jaw);
  jaw.add(bone(bellyM, 0, 0, 0, 0.3, -0.02, 0, 0.08, 0.05));
  for (const sgn of [1, -1]) head.add(spike(hornM, 0.36, -0.08, sgn * 0.06, 0.37, -0.18, sgn * 0.06, 0.018));

  // great fluked tail
  const tail = new THREE.Group();
  tail.position.set(0.34 - (N - 1) * 0.26 - 0.04, 0, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, -1]) {
    const fluke = makeFin(sailMat, 0.34, Math.PI * 0.05, Math.PI * 0.5);
    fluke.position.set(-0.05, 0, 0); fluke.rotation.set(sgn * 0.5, 0, Math.PI / 2);
    tail.add(fluke);
  }
  tail.add(spike(crystM, 0, 0, 0, -0.34, 0.06, 0, 0.03));

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 2.1 - i * 0.55) * 0.16;
      segs[i].position.y = Math.sin(t * 2.1 - i * 0.55 + 1) * 0.05;
      segs[i].rotation.x = Math.sin(t * 2.1 - i * 0.55) * 0.13;
    }
    head.position.z = Math.sin(t * 2.1 + 0.55) * 0.16;
    head.rotation.y = Math.sin(t * 0.9) * 0.16 + Math.sin(t * 2.1 + 0.55) * 0.08;
    head.rotation.z = Math.sin(t * 1.4) * 0.04;
    jaw.rotation.z = -(0.08 + gate(t, 6, 5) * 0.28);
    tail.position.z = Math.sin(t * 2.1 - (N - 1) * 0.55) * 0.16;
    tail.rotation.x = Math.sin(t * 2.1) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.2);
    const surge = 1.0 + Math.sin(t * 1.8) * 0.4 + gate(t, 8, 3) * 0.7;
    crystM.emissiveIntensity = surge;
    bodyM.emissiveIntensity = 0.3 + Math.sin(t * 1.8) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// CORALKIT — a hermit kitten wearing a living coral shell that it
// redecorates constantly. A spiral nacre shell sprouting little
// coral branches and anemones, a wide-eyed kitten face and soft
// paws peeking out the front, tail flicking behind.
// ============================================================
function buildCoralkit(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.24;
  g.add(core);

  const shellM = std({ map: scaleTex('coral-shell', '#e8838a', '#ffb4b8', '#b85a66', 121), roughness: 0.6, metalness: 0.15 });
  const furM = std({ map: furTex('coral-fur', '#f2d8c8', '#d8a890', '#fff0e8', 122), roughness: 0.9 });
  const coralM = std({ color: 0xff8a9a, emissive: 0xff6a8a, emissiveIntensity: 0.4, roughness: 0.6 });
  const seaM = std({ color: 0x6ec4f2, emissive: 0x3a9df2, emissiveIntensity: 0.5, roughness: 0.4 });
  const noseM = std({ color: 0xc25a6a, roughness: 0.4 });

  // spiral shell on the back — stacked shrinking orbs
  const shell = new THREE.Group();
  shell.position.set(-0.1, 0.12, 0);
  core.add(shell);
  for (let i = 0; i < 6; i++) {
    const a = i * 0.9;
    const rr = 0.22 - i * 0.028;
    const px = -Math.cos(a) * 0.12 * (1 - i * 0.1);
    const py = 0.06 + i * 0.05;
    const pz = Math.sin(a) * 0.1;
    shell.add(orb(shellM, rr, px, py, pz, 1, 1, 1, 12, 10));
  }
  // coral & anemone decorations sprouting from the shell
  const decos: THREE.Mesh[] = [];
  for (const [x, y, z, c] of [[-0.1, 0.4, 0.06, coralM], [-0.16, 0.34, -0.08, seaM], [-0.02, 0.42, -0.04, seaM], [-0.2, 0.26, 0.1, coralM]] as const) {
    const br = new THREE.Group();
    br.position.set(x, y, z);
    br.add(bone(c as THREE.Material, 0, 0, 0, 0.02, 0.1, 0, 0.02, 0.012));
    for (const sgn of [1, -1]) br.add(spike(c as THREE.Material, 0.02, 0.08, 0, 0.02 + sgn * 0.05, 0.16, sgn * 0.03, 0.012));
    shell.add(br);
    decos.push(br as unknown as THREE.Mesh);
  }

  // kitten head poking out front
  const head = new THREE.Group();
  head.position.set(0.2, 0.06, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.17, 0, 0, 0, 1.05, 0.95, 1));
  // ears
  for (const sgn of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 5), furM);
    ear.position.set(-0.02, 0.16, sgn * 0.09); ear.rotation.x = -sgn * 0.2;
    head.add(ear);
    head.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), coralM).translateX(0).translateY(0.16).translateZ(sgn * 0.09));
  }
  const eyeL = makeEye(0.065, 0x6ec4f2, { glow: 0.5 });
  const eyeR = makeEye(0.065, 0x6ec4f2, { glow: 0.5 });
  eyeL.position.set(0.12, 0.03, 0.08); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.12, 0.03, -0.08); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);
  head.add(orb(noseM, 0.022, 0.17, -0.03, 0, 1, 0.8, 1, 7, 6));
  // whiskers
  const whiskM = std({ color: 0xfff0e8, roughness: 0.5 });
  for (const sgn of [1, -1]) for (const wy of [-0.01, -0.04]) head.add(spike(whiskM, 0.15, wy, sgn * 0.04, 0.28, wy + 0.02, sgn * 0.16, 0.005));

  // front paws
  for (const sgn of [1, -1]) core.add(orb(furM, 0.06, 0.16, -0.18, sgn * 0.1, 0.9, 0.8, 1.1, 8, 6));

  // tail flicking out the back
  const tail = new THREE.Group();
  tail.position.set(-0.28, 0.1, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(furM, 0, 0, 0, -0.14, 0.14, 0.04, 0.04, 0.02));
  const tailTip = new THREE.Group();
  tailTip.position.set(-0.14, 0.14, 0.04);
  tail.add(tailTip);
  tailTip.add(bone(furM, 0, 0, 0, -0.04, 0.14, 0.08, 0.025, 0.012));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.24 + Math.sin(t * 2.4) * 0.012;
    head.rotation.y = Math.sin(t * 0.8) * 0.22;
    head.rotation.z = Math.sin(t * 1.6) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3, 0.4);
    tail.rotation.y = Math.sin(t * 2.2) * 0.4;
    tailTip.rotation.y = Math.sin(t * 2.2 - 0.7) * 0.4;
    coralM.emissiveIntensity = 0.35 + Math.sin(t * 2) * 0.2;
    seaM.emissiveIntensity = 0.45 + Math.sin(t * 2 + 1) * 0.2;
    for (let i = 0; i < decos.length; i++) decos[i].rotation.z = Math.sin(t * 1.5 + i) * 0.18;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// REEFRIDER — a sea-otter shepherd that herds reef-fish like
// sheep. Sleek wet pelt, a finned crest mane, broad flipper-paws,
// a paddle tail and a kindly, watchful face. It will face down
// anything, regardless of size, for its little flock.
// ============================================================
function buildReefrider(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const peltM = std({ map: furTex('reef-pelt', '#d96a78', '#a8404e', '#f2949e', 131), roughness: 0.7 });
  const bellyM = std({ map: furTex('reef-belly', '#f2c8cc', '#d89098', '#fff0f2', 132), roughness: 0.8 });
  const finM = finMat('reef-fin', [58, 157, 242], [200, 236, 255], 0.8);
  const noseM = std({ color: 0x6a2a34, roughness: 0.4 });
  const clawM = std({ color: 0xe8f0ff, roughness: 0.4 });

  // sleek otter body, slightly upright
  const chest = orb(peltM, 0.3, 0.16, 0.66, 0, 1.0, 1.15, 0.92);
  core.add(chest);
  core.add(orb(peltM, 0.26, -0.12, 0.6, 0, 1.05, 1.0, 0.9));
  core.add(orb(bellyM, 0.2, 0.18, 0.56, 0, 0.9, 1.0, 0.85)); // belly
  core.add(bone(peltM, 0.26, 0.84, 0, 0.4, 0.98, 0, 0.13, 0.1)); // neck

  // head
  const head = new THREE.Group();
  head.position.set(0.44, 1.02, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(peltM, 0.2, 0, 0, 0, 1.1, 0.92, 1));
  head.add(bone(bellyM, 0.12, -0.05, 0, 0.3, -0.07, 0, 0.1, 0.08)); // muzzle
  head.add(orb(noseM, 0.035, 0.31, -0.05, 0, 1.1, 0.8, 1, 8, 6));
  for (const sgn of [1, -1]) head.add(orb(peltM, 0.05, -0.04, 0.14, sgn * 0.13, 1, 1, 0.6, 8, 6)); // round ears
  const eyeL = makeEye(0.055, 0x2a4a6a, { glow: 0.3, sclera: 0xf2f6ff });
  const eyeR = makeEye(0.055, 0x2a4a6a, { glow: 0.3, sclera: 0xf2f6ff });
  eyeL.position.set(0.13, 0.06, 0.1); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.06, -0.1); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // whiskers
  for (const sgn of [1, -1]) for (const wy of [-0.02, -0.05]) head.add(spike(clawM, 0.26, wy, sgn * 0.05, 0.4, wy, sgn * 0.16, 0.005));

  // finned crest mane down the neck/back
  const crest: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const fin = makeFin(finM, 0.16 - i * 0.015, Math.PI * 0.2, Math.PI * 0.6);
    fin.position.set(0.28 - i * 0.14, 1.0 - i * 0.04, 0);
    fin.rotation.set(0, Math.PI / 2, Math.PI / 2);
    core.add(fin); crest.push(fin);
  }

  // flipper forelimbs
  const flippers: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const fl = new THREE.Group();
    fl.position.set(0.24, 0.62, sgn * 0.26);
    fl.add(bone(peltM, 0, 0, 0, 0.04, -0.34, sgn * 0.02, 0.06, 0.05));
    const web = makeFin(finM, 0.14, Math.PI * 0.1, Math.PI * 0.8);
    web.position.set(0.04, -0.34, sgn * 0.02); web.rotation.set(Math.PI / 2, 0, sgn * 0.4);
    fl.add(web);
    core.add(fl); flippers.push(fl);
  }

  // hind feet
  for (const sgn of [1, -1]) core.add(orb(bellyM, 0.08, -0.04, 0.1, sgn * 0.2, 1.0, 0.6, 1.3, 8, 6));

  // paddle tail
  const tail = new THREE.Group();
  tail.position.set(-0.34, 0.5, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(peltM, 0, 0, 0, -0.3, -0.1, 0, 0.09, 0.04));
  const paddle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), peltM);
  paddle.position.set(-0.36, -0.12, 0); paddle.scale.set(1.3, 0.4, 0.8);
  tail.add(paddle);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2) * 0.02;
    chest.scale.set(1.0, 1.15 + Math.sin(t * 2.2) * 0.035, 0.92);
    head.rotation.y = Math.sin(t * 0.7) * 0.28; // watchful scanning
    head.rotation.z = Math.sin(t * 1.5) * 0.05;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.6, 0.5);
    flippers[0].rotation.x = Math.sin(t * 2.4) * 0.25;
    flippers[1].rotation.x = -Math.sin(t * 2.4 + 0.5) * 0.25;
    tail.rotation.y = Math.sin(t * 1.8) * 0.3;
    for (let i = 0; i < crest.length; i++) crest[i].rotation.z = Math.PI / 2 + Math.sin(t * 3 - i * 0.5) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// PEARLANCE — a sea-unicorn duelist whose horn is a single pearl
// honed to a lance. A graceful seahorse-dragon of rose scale, a
// long iridescent lance horn, sweeping pectoral fins and a curled
// prehensile tail. Duelists weep at the perfection of its form.
// ============================================================
function buildPearlance(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.46;
  g.add(core);

  const scales = scaleTex('pearl-scale', '#c25a88', '#e890b4', '#8a3a60', 141);
  const bodyM = std({ map: scales, emissive: 0x2a7dd9, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.25 });
  const bellyM = std({ color: 0xf2e8ff, emissive: 0xc8b4ff, emissiveIntensity: 0.3, roughness: 0.4 });
  const pearlM = std({ color: 0xfff4ff, emissive: 0xe8d8ff, emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.5 });
  const finM = finMat('pearl-fin', [120, 90, 210], [242, 232, 255], 0.7);

  // arched seahorse spine — segments curving up then forward
  const N = 7;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    const a = i / (N - 1);
    sgrp.position.set(-0.2 + a * 0.5, a * 0.5, 0);
    const r = 0.18 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 1.05, 0.95));
    sgrp.add(orb(bellyM, r * 0.55, 0, 0, r * 0.5, 0.7, 1.1, 0.6, 8, 7));
    if (i < N - 1) sgrp.add(spike(bodyM, 0, r * 0.8, 0, -0.04, r * 1.5, 0, 0.02)); // back ridge
    core.add(sgrp);
    segs.push(sgrp);
  }

  // head with the pearl lance
  const head = new THREE.Group();
  head.position.set(0.32, 0.56, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.16, 0, 0, 0, 1.1, 1.0, 0.95));
  head.add(bone(bellyM, 0.06, -0.04, 0, 0.22, -0.08, 0, 0.07, 0.05)); // snout
  // the lance — long honed pearl
  const lance = bone(pearlM, 0.18, 0.02, 0, 0.78, 0.16, 0, 0.035, 0.004, 12);
  head.add(lance);
  // little spiral groove rings
  for (let k = 0; k < 4; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 - k * 0.005, 0.006, 5, 10), pearlM);
    ring.position.set(0.28 + k * 0.13, 0.05 + k * 0.03, 0);
    ring.rotation.y = Math.PI / 2; ring.rotation.z = 0.2;
    head.add(ring);
  }
  const eyeL = makeEye(0.05, 0x2a7dd9, { glow: 0.6 });
  const eyeR = makeEye(0.05, 0x2a7dd9, { glow: 0.6 });
  eyeL.position.set(0.06, 0.06, 0.11); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.06, 0.06, -0.11); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // crown fin
  const crown = makeFin(finM, 0.2, Math.PI * 0.1, Math.PI * 0.8);
  crown.position.set(-0.08, 0.12, 0); crown.rotation.set(0, Math.PI / 2, Math.PI / 2);
  head.add(crown);

  // sweeping pectoral fins
  const pecs: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) {
    const pec = makeFin(finM, 0.26, Math.PI * 0.05, Math.PI * 0.55);
    pec.position.set(0.0, 0.36, sgn * 0.14); pec.rotation.set(sgn * 0.6, 0.3, Math.PI / 2);
    core.add(pec); pecs.push(pec);
  }

  // curled prehensile tail
  const tail = new THREE.Group();
  tail.position.set(-0.2, 0.0, 0);
  tail.name = 'tail';
  core.add(tail);
  let tx = 0, ty = 0;
  for (let i = 0; i < 5; i++) {
    const seg = orb(bodyM, 0.07 - i * 0.01, tx, ty, 0, 1, 1, 1, 8, 7);
    tail.add(seg);
    const a = i * 0.7;
    tx -= Math.cos(a) * 0.1; ty -= Math.sin(a) * 0.06 + 0.02;
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.46 + Math.sin(t * 1.8) * 0.04;
    core.rotation.z = Math.sin(t * 1.4) * 0.04;
    for (let i = 0; i < segs.length; i++) segs[i].rotation.z = Math.sin(t * 2 - i * 0.4) * 0.04;
    head.rotation.z = Math.sin(t * 1.2) * 0.08; // slow lance flourish
    head.rotation.y = Math.sin(t * 0.6) * 0.12;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 0.9);
    pearlM.emissiveIntensity = 0.5 + Math.sin(t * 2.5) * 0.3 + gate(t, 7, 5) * 0.5;
    pecs[0].rotation.x = 0.6 + Math.sin(t * 2.6) * 0.3;
    pecs[1].rotation.x = -0.6 - Math.sin(t * 2.6 + 0.4) * 0.3;
    crown.rotation.z = Math.PI / 2 + Math.sin(t * 3) * 0.08;
    tail.rotation.z = Math.sin(t * 1.6) * 0.18;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// NACRELORD — the Pearlcrown sovereign, a great nautilus whose
// iridescent spiral shell holds a tide that answers to no moon.
// A crowned cephalopod head emerges from a mother-of-pearl shell,
// trailing regal tendrils over a glowing tide-pool aperture.
// ============================================================
function buildNacrelord(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.4;
  g.add(core);

  const nacre = scaleTex('nacre-shell', '#8a3a68', '#d86aa8', '#4a1a3a', 151);
  const shellM = std({ map: nacre, emissive: 0x1a4da8, emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.5 });
  const mantleM = std({ color: 0x8a3a68, emissive: 0x6a2a58, emissiveIntensity: 0.3, roughness: 0.55 });
  const tideM = std({ color: 0x4a9de8, emissive: 0x2a7dd9, emissiveIntensity: 1.2, roughness: 0.3 });
  const crownM = std({ color: 0xfff4ff, emissive: 0xc8b4ff, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.5 });

  // grand spiral nautilus shell
  const shell = new THREE.Group();
  shell.position.set(-0.24, 0.4, 0);
  core.add(shell);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.62;
    const rr = 0.34 - i * 0.03;
    const px = -Math.cos(a) * 0.16 * (1 - i * 0.06);
    const py = -Math.sin(a) * 0.16 * (1 - i * 0.06);
    const ring = orb(shellM, rr, px, py, 0, 1, 1, 0.55, 14, 12);
    shell.add(ring);
    // ridge ribs
    if (i < 7) shell.add(spike(crownM, px, py + rr * 0.9, 0, px - 0.02, py + rr * 1.25, 0, 0.022));
  }
  // glowing tide-pool aperture
  const aperture = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), tideM);
  aperture.position.set(0.0, 0.4, 0.02); aperture.rotation.y = -0.1;
  aperture.userData.noShadow = true;
  core.add(aperture);
  const apLight = new THREE.PointLight(0x2a7dd9, 4, 4);
  apLight.position.set(0.1, 0.4, 0.3);
  core.add(apLight);

  // crowned head emerging from the aperture
  const head = new THREE.Group();
  head.position.set(0.24, 0.42, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(mantleM, 0.2, 0, 0, 0, 1.05, 1.1, 0.95));
  // pearl crown points
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.4;
    head.add(spike(crownM, Math.cos(a) * 0.04, 0.16, Math.sin(a) * 0.16, Math.cos(a) * 0.04, 0.34, Math.sin(a) * 0.2, 0.025));
  }
  const eyeL = makeEye(0.07, 0x2a7dd9, { glow: 1.0, slit: true });
  const eyeR = makeEye(0.07, 0x2a7dd9, { glow: 1.0, slit: true });
  eyeL.position.set(0.13, 0.02, 0.12); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.13, 0.02, -0.12); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);

  // regal trailing tendrils
  const tendrils: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const tn = new THREE.Group();
    const sgn = i < 3 ? 1 : -1;
    const k = i % 3;
    tn.position.set(0.18, 0.34 - k * 0.12, sgn * (0.05 + k * 0.05));
    let lx = 0, ly = 0, lz = 0;
    for (let j = 0; j < 4; j++) {
      const nx = lx + 0.12, ny = ly - 0.05 - j * 0.02, nz = lz + sgn * 0.03;
      tn.add(bone(mantleM, lx, ly, lz, nx, ny, nz, 0.03 - j * 0.005, 0.022 - j * 0.005));
      lx = nx; ly = ny; lz = nz;
    }
    tn.add(orb(tideM, 0.025, lx, ly, lz, 1, 1, 1, 6, 5));
    core.add(tn); tendrils.push(tn);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.4 + Math.sin(t * 1.4) * 0.025;
    head.rotation.y = Math.sin(t * 0.6) * 0.16;
    head.rotation.z = Math.sin(t * 1.1) * 0.04;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.5, 1.0);
    const tide = 1.0 + Math.sin(t * 2) * 0.4 + gate(t, 7, 3) * 0.6;
    tideM.emissiveIntensity = tide;
    apLight.intensity = 3 + Math.sin(t * 2) * 1.5;
    (aperture.material as THREE.MeshStandardMaterial).emissiveIntensity = tide;
    aperture.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
    for (let i = 0; i < tendrils.length; i++) {
      tendrils[i].rotation.z = Math.sin(t * 1.6 + i * 0.6) * 0.18;
      tendrils[i].rotation.x = Math.sin(t * 1.3 + i) * 0.12;
    }
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// FROSTFIN — a sliver of winter sea that swims through the air,
// leaving frost-ferns on windows. A translucent koi of pale ice
// with crystalline fins, a frosted crest and a trail of drifting
// snow-motes. It hangs in the air and sculls gently in place.
// ============================================================
function buildFrostfin(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.6;
  g.add(core);

  const iceM = std({ color: 0x9ad4f2, emissive: 0x6ac0f2, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.86, flatShading: true });
  const coreM = std({ color: 0xd8f2ff, emissive: 0xa8e4ff, emissiveIntensity: 0.7, roughness: 0.2 });
  const finM = finMat('frost-fin', [120, 200, 245], [230, 248, 255], 0.7);

  // faceted ice koi body
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), iceM);
  body.scale.set(1.4, 0.95, 0.85);
  core.add(body);
  core.add(orb(coreM, 0.08, 0.04, 0, 0, 1, 1, 1, 8, 7)); // bright core
  // gill frills
  const finBits: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) {
    const pec = makeFin(finM, 0.16, Math.PI * 0.1, Math.PI * 0.6);
    pec.position.set(0.04, -0.02, sgn * 0.14); pec.rotation.set(sgn * 0.5, 0.3, Math.PI / 2);
    core.add(pec); finBits.push(pec);
  }
  // dorsal crest
  const crest = makeFin(finM, 0.18, Math.PI * 0.1, Math.PI * 0.7);
  crest.position.set(-0.02, 0.18, 0); crest.rotation.set(0, Math.PI / 2, Math.PI / 2);
  core.add(crest); finBits.push(crest);

  // flowing tail fins
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, 0, -1]) {
    const tf = makeFin(finM, 0.24, Math.PI * 0.1, Math.PI * 0.5);
    tf.position.set(-0.02, 0, 0); tf.rotation.set(sgn * 0.5, 0, Math.PI / 2);
    tail.add(tf);
  }

  // tiny eyes
  const eyeL = makeEye(0.045, 0x2a8dd9, { glow: 0.8 });
  const eyeR = makeEye(0.045, 0x2a8dd9, { glow: 0.8 });
  eyeL.position.set(0.2, 0.03, 0.09); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.2, 0.03, -0.09); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);

  // drifting snow-motes
  const motes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), coreM);
    m.userData.noShadow = true;
    core.add(m); motes.push(m);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.6 + Math.sin(t * 1.8) * 0.06;
    core.rotation.y = Math.sin(t * 0.8) * 0.2;
    core.rotation.z = Math.sin(t * 1.5) * 0.06;
    body.rotation.y = t * 0.3;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4, 0.5);
    coreM.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.2;
    for (let i = 0; i < finBits.length; i++) finBits[i].rotation.z = Math.PI / 2 + Math.sin(t * 3 + i) * 0.12;
    tail.rotation.y = Math.sin(t * 2.4) * 0.3;
    for (let i = 0; i < motes.length; i++) {
      const ph = (t * 0.4 + i / motes.length) % 1;
      motes[i].position.set(-0.2 - ph * 0.3, 0.1 - ph * 0.2, Math.sin(ph * 6 + i) * 0.08);
      motes[i].scale.setScalar(1 - ph * 0.6);
    }
  };
  return { body: g, parts: { tail }, animate };
}

// ============================================================
// GLACIMAW — a glacier that learned to bite. A hulking brute of
// fractured blue ice, a cavernous maw fringed with icicle fangs,
// jagged shards erupting from its back and a freezing breath-fog
// that pours from its jaws. Its roar silences waterfalls mid-fall.
// ============================================================
function buildGlacimaw(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const iceM = std({ color: 0x6ab0d9, emissive: 0x3a8dd9, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.1, flatShading: true });
  const deepM = std({ color: 0x2a6dc4, emissive: 0x1a4da8, emissiveIntensity: 0.4, roughness: 0.25, flatShading: true });
  const clearM = std({ color: 0xe8f8ff, emissive: 0xa8e0ff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 });

  // craggy ice torso (faceted)
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), iceM);
  torso.position.set(-0.02, 0.72, 0); torso.scale.set(1.1, 1.0, 1.05);
  core.add(torso);
  core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), deepM).translateX(0.16).translateY(0.6).translateZ(0));

  // jagged shards bursting from the back
  const shards: THREE.Mesh[] = [];
  for (const [x, y, z, h] of [[-0.34, 1.0, 0, 0.5], [-0.2, 1.1, 0.18, 0.4], [-0.2, 1.05, -0.18, 0.4], [-0.42, 0.84, 0.12, 0.34], [-0.42, 0.84, -0.12, 0.34]] as const) {
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.08, h, 5), clearM);
    sh.position.set(x, y + h / 2, z); sh.rotation.z = 0.3; sh.rotation.x = (z) * 1.2;
    core.add(sh); shards.push(sh);
  }

  // head — a giant fanged maw
  const head = new THREE.Group();
  head.position.set(0.42, 0.74, 0);
  head.name = 'head';
  core.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), iceM);
  skull.scale.set(1.2, 0.95, 1); head.add(skull);
  // upper fang fringe
  for (let k = 0; k < 7; k++) {
    const z = (k - 3) * 0.06;
    head.add(new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 5), clearM).translateX(0.22).translateY(-0.16).translateZ(z));
  }
  const jaw = new THREE.Group();
  jaw.position.set(0.12, -0.22, 0);
  head.add(jaw);
  const lowJaw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), deepM);
  lowJaw.scale.set(1.3, 0.5, 1); jaw.add(lowJaw);
  for (let k = 0; k < 6; k++) {
    const z = (k - 2.5) * 0.06;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.14, 5), clearM);
    f.position.set(0.1, 0.08, z); jaw.add(f);
  }
  // glacial eyes + brow ridge
  const eyeL = makeEye(0.06, 0x9ae0ff, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.06, 0x9ae0ff, { glow: 1.2, slit: true });
  eyeL.position.set(0.16, 0.12, 0.14); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.16, 0.12, -0.14); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  // small horns
  for (const sgn of [1, -1]) head.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), clearM).translateX(-0.06).translateY(0.28).translateZ(sgn * 0.12));

  // breath fog from the maw
  const fog: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const p = orb(std({ color: 0xd8f0ff, transparent: true, opacity: 0.4, roughness: 1 }), 0.06, 0, 0, 0, 1, 1, 1, 7, 6);
    p.userData.noShadow = true;
    head.add(p); fog.push(p);
  }

  // stubby ice legs
  for (const [x, z] of [[0.2, 0.26], [0.2, -0.26], [-0.22, 0.28], [-0.22, -0.28]] as const) {
    const leg = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), deepM);
    leg.position.set(x, 0.18, z); leg.scale.set(1, 1.2, 1);
    core.add(leg);
    core.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), clearM).translateX(x).translateY(0.04).translateZ(z));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.6) * 0.02;
    torso.scale.set(1.1 + Math.sin(t * 1.6) * 0.02, 1.0, 1.05);
    head.rotation.x = 0.05 + Math.sin(t * 1.6 + 0.4) * 0.04;
    head.rotation.y = Math.sin(t * 0.5) * 0.12;
    jaw.rotation.z = -(0.15 + gate(t, 5, 4) * 0.35); // slow icy chew/roar
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6.5, 1.5);
    const chill = 0.35 + Math.sin(t * 2) * 0.15 + gate(t, 5, 3) * 0.4;
    iceM.emissiveIntensity = chill; clearM.emissiveIntensity = 0.5 + chill;
    for (let i = 0; i < shards.length; i++) shards[i].scale.y = 1 + Math.sin(t * 2 + i) * 0.05;
    for (let i = 0; i < fog.length; i++) {
      const ph = (t * 0.7 + i / fog.length) % 1;
      fog[i].position.set(0.26 + ph * 0.3, -0.18 - ph * 0.04, Math.sin(ph * 5 + i) * 0.06);
      fog[i].scale.setScalar(0.5 + ph * 1.4);
      (fog[i].material as THREE.MeshStandardMaterial).opacity = 0.4 * (1 - ph) * (gate(t, 5, 3) > 0.1 ? 1.2 : 0.5);
    }
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// MISTLING — morning fog that lingered too long and woke up
// curious. A soft drift of pale vapor orbs cradling a shy face,
// trailing wisps and condensation droplets. It bobs and peers
// about, endlessly inquisitive about everything it floats past.
// ============================================================
function buildMistling(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const mist = (op: number) => std({ color: 0xbcd6ea, emissive: 0x9ac0e0, emissiveIntensity: 0.3, roughness: 1, transparent: true, opacity: op });
  const dropM = std({ color: 0xe8f4ff, emissive: 0xa8d0e8, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.8 });

  // cloudy clustered body
  const lobes: THREE.Mesh[] = [];
  for (const [x, y, z, r, op] of [[0, 0, 0, 0.24, 0.78], [0.12, 0.06, 0.08, 0.16, 0.7], [-0.12, 0.04, -0.06, 0.17, 0.7], [0.04, -0.1, -0.1, 0.15, 0.62], [-0.06, -0.08, 0.12, 0.14, 0.62]] as const) {
    const l = orb(mist(op), r, x, y, z, 1, 0.95, 1, 12, 10);
    l.userData.noShadow = true;
    core.add(l); lobes.push(l);
  }

  // shy face
  const head = core;
  const eyeL = makeEye(0.05, 0x6a9ac4, { glow: 0.6 });
  const eyeR = makeEye(0.05, 0x6a9ac4, { glow: 0.6 });
  eyeL.position.set(0.2, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.2, 0.04, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  // little curious mouth
  const mouth = orb(std({ color: 0x5a7a96, roughness: 0.6 }), 0.02, 0.23, -0.05, 0, 1, 1.2, 0.8, 6, 6);
  core.add(mouth);

  // trailing wisps
  const wisps: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group();
    const sgn = i % 2 ? 1 : -1;
    w.position.set(-0.16, -0.04 - (i >> 1) * 0.1, sgn * 0.08);
    let lx = 0, ly = 0;
    for (let j = 0; j < 3; j++) {
      const nx = lx - 0.1, ny = ly - 0.04;
      w.add(bone(mist(0.45 - j * 0.12), lx, ly, 0, nx, ny, 0, 0.05 - j * 0.012, 0.04 - j * 0.012));
      lx = nx; ly = ny;
    }
    core.add(w); wisps.push(w);
  }

  // condensation droplets
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const d = orb(dropM, 0.022, 0, 0, 0, 1, 1.3, 1, 7, 6);
    d.userData.noShadow = true;
    core.add(d); drops.push(d);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 1.5) * 0.06;
    core.rotation.y = Math.sin(t * 0.7) * 0.25; // peering about
    core.rotation.z = Math.sin(t * 1.2) * 0.05;
    for (let i = 0; i < lobes.length; i++) lobes[i].scale.set(1 + Math.sin(t * 2 + i) * 0.05, 0.95, 1);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.8, 0.3);
    mouth.scale.setScalar(1 + gate(t, 4, 5) * 0.6);
    for (let i = 0; i < wisps.length; i++) {
      wisps[i].rotation.z = Math.sin(t * 1.4 + i * 0.7) * 0.25;
      wisps[i].position.x = -0.16 + Math.sin(t * 1.1 + i) * 0.02;
    }
    for (let i = 0; i < drops.length; i++) {
      const ph = (t * 0.5 + i / drops.length) % 1;
      drops[i].position.set(-0.1 + i * 0.06, 0.1 - ph * 0.4, (i % 2 ? 0.1 : -0.1));
      (drops[i].material as THREE.MeshStandardMaterial).opacity = 0.8 * (1 - ph);
    }
  };
  return { body: g, parts: { head }, animate };
}

// ---------------- nature texture painters ----------------
/** Vertical-ridged bark with wandering cracks, knots and lichen flecks. */
function barkTex(key: string, base: string, dark: string, lite: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 4) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.05 + v * 0.18})` : `rgba(255,255,255,${(v - 0.5) * 0.16})`;
      ctx.fillRect(x + Math.sin(x * 0.3) * 2, 0, 2 + rnd() * 2, s);
    }
    ctx.strokeStyle = dark; ctx.lineWidth = 2.2;
    for (let i = 0; i < 14; i++) {
      let x = rnd() * s; ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) { x += (rnd() - 0.5) * 8; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const kx = rnd() * s, ky = rnd() * s, kr = 6 + rnd() * 10;
      const grd = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
      grd.addColorStop(0, dark); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 120; i++) { ctx.fillStyle = lite; ctx.globalAlpha = 0.1 + rnd() * 0.2; ctx.fillRect(rnd() * s, rnd() * s, 2, 2); }
    ctx.globalAlpha = 1;
  });
}
/** Mottled foliage: blotchy leaf tones with scattered veins. */
function leafMottle(key: string, base: string, dark: string, lite: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rnd() < 0.5 ? dark : lite; ctx.globalAlpha = 0.08 + rnd() * 0.16;
      ctx.beginPath(); ctx.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.3; ctx.strokeStyle = dark; ctx.lineWidth = 1.4;
    for (let i = 0; i < 22; i++) { const x = rnd() * s, y = rnd() * s, a = rnd() * Math.PI; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
}
/** A small leaf blade — flattened teardrop mesh for foliage tufts. */
function leafBlade(mat: THREE.Material, len: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(len, 8, 6), mat);
  m.scale.set(0.32, 1, 0.7);
  m.geometry.translate(0, len, 0);
  return m;
}

// ============================================================
// SPROUTLE — a walking seedling that naps in sunbeams and grows a
// little each time. A plump cream seed-bulb cradled in a husk,
// two sprout-leaves unfurling from its crown, stubby root-feet and
// a wide drowsy face forever halfway into a yawn.
// ============================================================
function buildSproutle(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.2;
  g.add(core);

  const seedM = std({ map: furTex('sprout-seed', '#e8dca8', '#c4b07a', '#fff0c8', 201), roughness: 0.85 });
  const huskM = std({ map: leafMottle('sprout-husk', '#4ea84e', '#2e7a2e', '#8ad95a', 202), roughness: 0.7 });
  const leafM = std({ map: leafMottle('sprout-leaf', '#6ec45e', '#3a8a3a', '#bdf09a', 203), roughness: 0.6, side: THREE.DoubleSide });
  const rootM = std({ color: 0xc4b07a, roughness: 0.9 });

  const body = orb(seedM, 0.24, 0, 0, 0, 1, 1.1, 0.95);
  core.add(body);
  // husk cradle around the lower half
  core.add(orb(huskM, 0.2, 0, -0.06, 0, 1.15, 0.8, 1.05));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; core.add(spike(huskM, Math.cos(a) * 0.16, -0.02, Math.sin(a) * 0.16, Math.cos(a) * 0.22, 0.14, Math.sin(a) * 0.22, 0.04)); }

  // sprout leaves on top
  const sprout = new THREE.Group();
  sprout.position.set(0, 0.22, 0);
  core.add(sprout);
  sprout.add(bone(huskM, 0, 0, 0, 0, 0.14, 0, 0.02, 0.015));
  const leafL = leafBlade(leafM, 0.18), leafR = leafBlade(leafM, 0.16);
  leafL.position.set(0, 0.12, 0); leafL.rotation.set(0.2, 0, -0.5);
  leafR.position.set(0, 0.12, 0); leafR.rotation.set(-0.2, 0, 0.6);
  sprout.add(leafL, leafR);

  // drowsy face
  const head = core;
  const eyeL = makeEye(0.05, 0x3a6a2a, { glow: 0.2 });
  const eyeR = makeEye(0.05, 0x3a6a2a, { glow: 0.2 });
  eyeL.position.set(0.16, 0.05, 0.09); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.16, 0.05, -0.09); eyeR.rotation.y = 0.35;
  core.add(eyeL, eyeR);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), std({ color: 0x6a4a2a, roughness: 0.6 }));
  mouth.position.set(0.21, -0.04, 0); mouth.rotation.set(Math.PI / 2, 0, 0);
  core.add(mouth);

  // root feet
  for (const sgn of [1, -1]) {
    core.add(orb(rootM, 0.05, 0.06, -0.2, sgn * 0.1, 1.1, 0.7, 1.2, 8, 6));
    core.add(spike(rootM, 0.06, -0.18, sgn * 0.1, 0.16, -0.22, sgn * 0.13, 0.02));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.2 + Math.sin(t * 1.6) * 0.02;
    body.scale.set(1, 1.1 + Math.sin(t * 1.6) * 0.04, 0.95);
    sprout.rotation.z = Math.sin(t * 1.2) * 0.14; // sway toward the sun
    sprout.rotation.x = Math.sin(t * 0.9) * 0.08;
    leafL.rotation.z = -0.5 + Math.sin(t * 2) * 0.1;
    leafR.rotation.z = 0.6 - Math.sin(t * 2 + 0.5) * 0.1;
    head.rotation.z = Math.sin(t * 0.7) * 0.05;
    // long drowsy blinks
    eyeL.scale.y = eyeR.scale.y = 1 - 0.9 * blinkAt(t, 3.2, 0.4) - 0.4 * (0.5 + 0.5 * Math.sin(t * 0.5));
    mouth.scale.setScalar(1 + gate(t, 6, 4) * 0.8); // yawn
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// THORNBEX — a sturdy grazer whose back bristles with living
// thorns that regrow overnight. A mossy four-legged beast with a
// ridge of dark briar spines, a blunt leafy snout and a temper
// it keeps politely sheathed until you reach for the thorns.
// ============================================================
function buildThornbex(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const hideM = std({ map: leafMottle('thorn-hide', '#3a8a3a', '#236023', '#6ec45e', 211), roughness: 0.8 });
  const bellyM = std({ map: furTex('thorn-belly', '#7a9a4a', '#566e34', '#a8c46a', 212), roughness: 0.85 });
  const thornM = std({ color: 0x2e4a1e, roughness: 0.6 });
  const budM = std({ color: 0xd9b85a, emissive: 0xc4a13a, emissiveIntensity: 0.4, roughness: 0.5 });

  const chest = orb(hideM, 0.32, 0.18, 0.58, 0, 1.1, 1.0, 0.95);
  core.add(chest);
  core.add(orb(hideM, 0.3, -0.16, 0.56, 0, 1.15, 0.95, 0.92));
  core.add(orb(bellyM, 0.22, 0.04, 0.46, 0, 1.4, 0.6, 0.85));

  // briar ridge along the back
  const thorns: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 0.26 - i * 0.1;
    const th = spike(thornM, x, 0.82, 0, x - 0.03, 1.0 + Math.sin(i) * 0.05, 0, 0.04);
    core.add(th); thorns.push(th);
    if (i % 2 === 0) core.add(orb(budM, 0.022, x - 0.03, 1.0, 0, 1, 1, 1, 6, 5));
  }

  // head
  const head = new THREE.Group();
  head.position.set(0.42, 0.62, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(hideM, 0.2, 0, 0, 0, 1.15, 0.92, 1));
  head.add(bone(bellyM, 0.14, -0.05, 0, 0.32, -0.08, 0, 0.11, 0.08)); // snout
  head.add(orb(std({ color: 0x2e4a1e, roughness: 0.5 }), 0.04, 0.33, -0.07, 0, 1, 0.8, 1, 8, 6));
  // leafy ears
  const leafM = std({ map: leafMottle('thorn-ear', '#4e9a3a', '#2e6e22', '#8ad95a', 213), roughness: 0.6, side: THREE.DoubleSide });
  for (const sgn of [1, -1]) { const ear = leafBlade(leafM, 0.12); ear.position.set(-0.04, 0.14, sgn * 0.12); ear.rotation.set(sgn * 0.3, 0, sgn * 0.4); head.add(ear); }
  const eyeL = makeEye(0.052, 0xd9b85a, { glow: 0.5 });
  const eyeR = makeEye(0.052, 0xd9b85a, { glow: 0.5 });
  eyeL.position.set(0.14, 0.07, 0.11); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.07, -0.11); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);

  // legs
  for (const [hx, hz, rear] of [[0.28, 0.2, false], [0.28, -0.2, false], [-0.24, 0.22, true], [-0.24, -0.22, true]] as const) {
    core.add(bone(hideM, hx, rear ? 0.4 : 0.44, hz, hx + 0.02, 0.14, hz, 0.09, 0.06));
    core.add(orb(thornM, 0.06, hx + 0.02, 0.06, hz, 1, 0.9, 1.1, 8, 6));
  }

  // stubby leafy tail
  const tail = new THREE.Group();
  tail.position.set(-0.42, 0.66, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(hideM, 0, 0, 0, -0.16, 0.06, 0, 0.04, 0.025));
  const tuft = leafBlade(leafM, 0.13); tuft.position.set(-0.16, 0.04, 0); tuft.rotation.z = -1.4; tail.add(tuft);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2) * 0.018;
    chest.scale.set(1.1, 1.0 + Math.sin(t * 2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.6) * 0.16;
    head.rotation.x = 0.04 + gate(t, 5, 4) * 0.1; // grazing dip
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4, 0.6);
    const bristle = 1 + gate(t, 6, 3) * 0.4;
    for (let i = 0; i < thorns.length; i++) thorns[i].scale.set(1, bristle, 1);
    tail.rotation.y = Math.sin(t * 2.4) * 0.3;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// SYLVIGOR — a guardian of old groves so peaceable that birds nest
// in its mossy shoulders mid-battle. A broad bark-skinned colossus
// with a leaf-crowned head, mossy pauldrons sprouting tiny nests,
// and slow, patient fists like fallen logs.
// ============================================================
function buildSylvigor(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const barkM = std({ map: barkTex('sylv-bark', '#5a4a2e', '#332813', '#7a6a44', 221), roughness: 0.9 });
  const mossM = std({ map: furTex('sylv-moss', '#3a7a2e', '#236018', '#6ec45e', 222), roughness: 0.85 });
  const leafM = std({ map: leafMottle('sylv-leaf', '#4e9a3a', '#2a6e1e', '#8ad95a', 223), roughness: 0.6, side: THREE.DoubleSide });
  const woodM = std({ color: 0x6a5436, roughness: 0.85 });
  const nestM = std({ color: 0xc4a13a, roughness: 0.8 });

  const torso = orb(barkM, 0.4, 0.02, 1.0, 0, 1.0, 1.1, 0.95);
  core.add(torso);
  core.add(orb(barkM, 0.34, 0.1, 0.7, 0, 1.05, 0.9, 0.9));
  // mossy chest patch
  core.add(orb(mossM, 0.26, 0.24, 1.0, 0, 0.6, 1.0, 0.8));

  // mossy pauldrons with nests
  const nests: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const sh = orb(mossM, 0.18, 0.0, 1.34, sgn * 0.38, 1, 0.8, 1);
    core.add(sh);
    const nest = new THREE.Group();
    nest.position.set(0.0, 1.48, sgn * 0.38);
    nest.add(orb(nestM, 0.07, 0, 0, 0, 1, 0.5, 1, 8, 6));
    for (const ez of [0.03, -0.03]) nest.add(orb(std({ color: 0x6ec4f2, roughness: 0.5 }), 0.02, 0.01, 0.02, ez, 1, 1, 1, 6, 5)); // eggs
    core.add(nest); nests.push(nest);
  }

  // leaf-crowned head
  const head = new THREE.Group();
  head.position.set(0.3, 1.42, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(barkM, 0.22, 0, 0, 0, 1.05, 0.95, 1));
  // antler-branch crown
  for (const sgn of [1, -1]) {
    head.add(bone(woodM, -0.04, 0.16, sgn * 0.06, -0.18, 0.42, sgn * 0.14, 0.03, 0.015));
    head.add(spike(woodM, -0.12, 0.3, sgn * 0.1, -0.24, 0.46, sgn * 0.04, 0.018));
    for (let k = 0; k < 4; k++) { const lf = leafBlade(leafM, 0.08); lf.position.set(-0.1 - k * 0.03, 0.28 + k * 0.04, sgn * (0.1 + k * 0.01)); lf.rotation.set(sgn * 0.5, 0, sgn * 0.6); head.add(lf); }
  }
  const eyeL = makeEye(0.055, 0xc4f29a, { glow: 0.8 });
  const eyeR = makeEye(0.055, 0xc4f29a, { glow: 0.8 });
  eyeL.position.set(0.15, 0.04, 0.11); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.15, 0.04, -0.11); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);

  // log-like arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.06, 1.2, sgn * 0.42);
    arm.add(bone(barkM, 0, 0, 0, 0.06, -0.5, sgn * 0.08, 0.13, 0.11));
    arm.add(bone(woodM, 0.06, -0.5, sgn * 0.08, 0.18, -0.9, sgn * 0.04, 0.11, 0.1));
    arm.add(orb(woodM, 0.15, 0.18, -0.94, sgn * 0.04, 1, 0.95, 1));
    for (const cz of [-0.06, 0, 0.06]) arm.add(spike(woodM, 0.26, -0.98, sgn * 0.04 + cz, 0.34, -1.04, sgn * 0.04 + cz, 0.02));
    core.add(arm); arms.push(arm);
  }

  // root legs
  for (const sgn of [1, -1]) {
    core.add(bone(barkM, -0.02, 0.72, sgn * 0.26, -0.04, 0.34, sgn * 0.3, 0.14, 0.12));
    core.add(orb(woodM, 0.14, 0.06, 0.08, sgn * 0.3, 1.3, 0.55, 1.2));
    for (const cz of [-0.08, 0, 0.08]) core.add(spike(woodM, 0.16, 0.05, sgn * 0.3 + cz, 0.26, 0.02, sgn * 0.3 + cz, 0.022));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.2) * 0.02;
    torso.scale.set(1.0, 1.1 + Math.sin(t * 1.2) * 0.025, 0.95);
    head.rotation.y = Math.sin(t * 0.4) * 0.16;
    head.rotation.z = Math.sin(t * 0.6) * 0.04;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.5, 1.2);
    mossM.emissiveIntensity = 0; // moss stays matte
    arms[0].rotation.x = Math.sin(t * 0.9) * 0.08;
    arms[1].rotation.x = -Math.sin(t * 0.9 + 0.4) * 0.08;
    for (let i = 0; i < nests.length; i++) nests[i].position.y = 1.48 + Math.sin(t * 1.2) * 0.02; // ride the shoulders
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// ELDERGROVE — old as the first forest; its rings record every age
// of the world. A walking elder oak: a vast trunk torso showing a
// glowing growth-ring heartwood, gnarled branch arms, deep root
// feet and a slow-turning canopy crown alive with leaves.
// ============================================================
function buildEldergrove(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const barkM = std({ map: barkTex('elder-bark', '#3a2e18', '#1c1408', '#5a4a2a', 231), roughness: 0.92 });
  const ringM = std({ color: 0xf2c14e, emissive: 0xf2a83a, emissiveIntensity: 0.9, roughness: 0.5 });
  const leafM = std({ map: leafMottle('elder-leaf', '#2e7a22', '#1a4e12', '#5aa83a', 232), roughness: 0.6 });
  const woodM = std({ color: 0x4a3a22, roughness: 0.88 });

  // trunk torso
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 1.3, 12), barkM);
  trunk.position.set(0, 0.95, 0); core.add(trunk);
  // glowing heartwood rings on the chest
  const rings = new THREE.Group();
  rings.position.set(0.46, 1.05, 0); rings.rotation.y = Math.PI / 2;
  core.add(rings);
  for (let k = 0; k < 4; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06 + k * 0.06, 0.012, 6, 20), ringM);
    rings.add(ring);
  }
  rings.add(orb(ringM, 0.04, 0, 0, 0, 1, 1, 1, 8, 7));

  // canopy crown
  const canopy = new THREE.Group();
  canopy.position.set(0, 1.7, 0);
  core.add(canopy);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i < 6 ? 0.34 : 0.2;
    canopy.add(orb(leafM, 0.22, Math.cos(a) * r, 0.1 + (i % 3) * 0.08, Math.sin(a) * r, 1, 0.9, 1));
  }
  canopy.add(orb(leafM, 0.3, 0, 0.2, 0, 1, 0.9, 1));

  // head nestled at the trunk top
  const head = new THREE.Group();
  head.position.set(0.34, 1.5, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(barkM, 0.2, 0, 0, 0, 1.05, 0.95, 1));
  const eyeL = makeEye(0.06, 0xf2c14e, { glow: 1.0 });
  const eyeR = makeEye(0.06, 0xf2c14e, { glow: 1.0 });
  eyeL.position.set(0.13, 0.02, 0.1); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.02, -0.1); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // craggy brow + bark beard
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), woodM); brow.position.set(0.13, 0.1, sgn * 0.1); brow.rotation.z = -0.2; head.add(brow); }
  for (let i = 0; i < 4; i++) head.add(spike(woodM, 0.12, -0.14, (i - 1.5) * 0.05, 0.16, -0.3, (i - 1.5) * 0.05, 0.016));

  // gnarled branch arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.0, 1.28, sgn * 0.46);
    arm.add(bone(barkM, 0, 0, 0, 0.04, -0.2, sgn * 0.24, 0.1, 0.07));
    arm.add(bone(woodM, 0.04, -0.2, sgn * 0.24, 0.12, -0.5, sgn * 0.42, 0.07, 0.05));
    for (let k = 0; k < 3; k++) arm.add(spike(woodM, 0.12, -0.5, sgn * 0.42, 0.2 + k * 0.04, -0.56 - k * 0.04, sgn * (0.42 + (k - 1) * 0.04), 0.018));
    // little leaf sprigs on the branches
    for (let k = 0; k < 2; k++) arm.add(orb(leafM, 0.07, 0.04, -0.24 + k * 0.1, sgn * (0.28 + k * 0.06), 1, 0.8, 1, 8, 6));
    core.add(arm); arms.push(arm);
  }

  // root feet
  for (const sgn of [1, -1]) {
    core.add(bone(barkM, 0, 0.4, sgn * 0.18, -0.02, 0.16, sgn * 0.26, 0.16, 0.13));
    for (const cz of [-0.1, 0, 0.1]) core.add(spike(woodM, 0.0, 0.14, sgn * 0.26 + cz, 0.18, 0.02, sgn * 0.3 + cz, 0.03));
    for (const cz of [-0.08, 0.08]) core.add(spike(woodM, -0.06, 0.14, sgn * 0.26 + cz, -0.24, 0.02, sgn * 0.3 + cz, 0.026));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 0.9) * 0.02;
    core.rotation.z = Math.sin(t * 0.6) * 0.015;
    canopy.rotation.y = t * 0.15; // the canopy turns toward the light
    for (let i = 0; i < canopy.children.length; i++) canopy.children[i].position.y += Math.sin(t * 1.4 + i) * 0.0008;
    head.rotation.y = Math.sin(t * 0.35) * 0.12;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 7, 2.0);
    ringM.emissiveIntensity = 0.8 + Math.sin(t * 1.6) * 0.3; // sap pulse
    arms[0].rotation.x = Math.sin(t * 0.7) * 0.06;
    arms[1].rotation.x = -Math.sin(t * 0.7 + 0.5) * 0.06;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// YGGDRANOX — the world tree's wrath made flesh: an immovable
// titan of black heartwood and golden vine. A towering trunk
// banded with glowing gold seams, a crown of golden leaves, vast
// vine-knotted arms and roots that grip the earth like a verdict.
// ============================================================
function buildYggdranox(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const barkM = std({ map: barkTex('ygg-bark', '#1c3010', '#0c1806', '#2e4a1a', 241), roughness: 0.92 });
  const goldM = std({ color: 0xffd700, emissive: 0xf2c14e, emissiveIntensity: 1.0, roughness: 0.35, metalness: 0.3 });
  const vineM = std({ color: 0x2e6e2a, emissive: 0x1a4e12, emissiveIntensity: 0.3, roughness: 0.7 });
  const leafM = std({ map: leafMottle('ygg-leaf', '#8fbc8f', '#4e7a4e', '#ffe98a', 242), roughness: 0.55 });
  const woodM = std({ color: 0x14240c, roughness: 0.9 });

  // colossal trunk torso with glowing gold seams
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.66, 1.5, 12), barkM);
  trunk.position.set(0, 1.05, 0); core.add(trunk);
  const seams: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const seam = bone(goldM, Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5, Math.cos(a + 0.3) * 0.56, 1.6, Math.sin(a + 0.3) * 0.56, 0.025, 0.012);
    core.add(seam); seams.push(seam);
  }
  // golden heart core peeking through
  const heart = orb(goldM, 0.12, 0.5, 1.1, 0, 1, 1.3, 0.6, 10, 8);
  core.add(heart);

  // golden-leaf crown
  const canopy = new THREE.Group();
  canopy.position.set(0, 1.95, 0);
  core.add(canopy);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i < 7 ? 0.4 : 0.22;
    canopy.add(orb(leafM, 0.24, Math.cos(a) * r, (i % 3) * 0.08, Math.sin(a) * r, 1, 0.9, 1));
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; canopy.add(spike(goldM, Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3, Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.42, 0.02)); }

  // head
  const head = new THREE.Group();
  head.position.set(0.38, 1.62, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(barkM, 0.24, 0, 0, 0, 1.05, 0.95, 1));
  for (const sgn of [1, -1]) { head.add(bone(goldM, -0.04, 0.18, sgn * 0.08, -0.22, 0.5, sgn * 0.18, 0.035, 0.015)); }
  const eyeL = makeEye(0.07, 0xffe98a, { glow: 1.4 });
  const eyeR = makeEye(0.07, 0xffe98a, { glow: 1.4 });
  eyeL.position.set(0.15, 0.04, 0.12); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.15, 0.04, -0.12); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.1), woodM); brow.position.set(0.16, 0.14, sgn * 0.12); brow.rotation.z = -0.25; head.add(brow); }

  // vast vine-knotted arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.02, 1.4, sgn * 0.54);
    arm.add(bone(barkM, 0, 0, 0, 0.06, -0.56, sgn * 0.1, 0.16, 0.13));
    arm.add(bone(woodM, 0.06, -0.56, sgn * 0.1, 0.2, -1.0, sgn * 0.04, 0.13, 0.11));
    // vine wrap
    for (let k = 0; k < 4; k++) arm.add(orb(vineM, 0.04, 0.02 + k * 0.04, -0.12 - k * 0.2, sgn * (0.08 - k * 0.015), 1, 1, 1, 7, 6));
    const fist = orb(woodM, 0.17, 0.2, -1.05, sgn * 0.04, 1, 0.95, 1);
    arm.add(fist);
    for (const cz of [-0.07, 0, 0.07]) arm.add(spike(goldM, 0.3, -1.08, sgn * 0.04 + cz, 0.4, -1.14, sgn * 0.04 + cz, 0.022));
    core.add(arm); arms.push(arm);
  }

  // gripping roots
  for (const sgn of [1, -1]) {
    core.add(bone(barkM, 0, 0.46, sgn * 0.22, -0.02, 0.18, sgn * 0.3, 0.18, 0.15));
    for (const cz of [-0.12, 0, 0.12]) core.add(spike(woodM, 0.0, 0.16, sgn * 0.3 + cz, 0.22, 0.02, sgn * 0.34 + cz, 0.034));
    for (const cz of [-0.1, 0.1]) core.add(spike(woodM, -0.06, 0.16, sgn * 0.3 + cz, -0.28, 0.02, sgn * 0.34 + cz, 0.03));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 0.8) * 0.018;
    canopy.rotation.y = t * 0.1;
    head.rotation.y = Math.sin(t * 0.3) * 0.1;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 8, 2.5);
    const wrath = 0.9 + Math.sin(t * 1.4) * 0.3 + gate(t, 6, 3) * 0.6;
    goldM.emissiveIntensity = wrath;
    heart.scale.set(1, 1.3 + Math.sin(t * 1.4) * 0.06, 0.6);
    arms[0].rotation.x = Math.sin(t * 0.6) * 0.05;
    arms[1].rotation.x = -Math.sin(t * 0.6 + 0.4) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// PEBBLIT — a mossy stone that decided to wander. Slow, but
// stubborn as bedrock. A rounded mottled boulder capped with a
// soft moss toupee and a sprouting sapling, blinking out from two
// deep-set pebble eyes on four squat little rock feet.
// ============================================================
function buildPebblit(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.24;
  g.add(core);

  const rockM = std({ map: furTex('pebblit-rock', '#8a7a5a', '#5e5038', '#b0a080', 251), roughness: 0.95 });
  const mossM = std({ map: furTex('pebblit-moss', '#5aa83e', '#357024', '#8ad95a', 252), roughness: 0.85 });
  const stemM = std({ color: 0x6a8a3a, roughness: 0.7 });
  const leafM = std({ map: leafMottle('pebblit-leaf', '#6ec45e', '#3a8a3a', '#bdf09a', 253), roughness: 0.6, side: THREE.DoubleSide });

  // boulder body (faceted-ish via flattened sphere)
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), rockM);
  body.scale.set(1.15, 0.95, 1.05); core.add(body);
  // moss cap
  const mossCap = orb(mossM, 0.26, -0.02, 0.12, 0, 1.1, 0.55, 1.05);
  core.add(mossCap);

  // sprouting sapling
  const sprout = new THREE.Group();
  sprout.position.set(0.0, 0.24, 0.04);
  core.add(sprout);
  sprout.add(bone(stemM, 0, 0, 0, -0.02, 0.16, 0, 0.018, 0.012));
  for (const sgn of [1, -1]) { const lf = leafBlade(leafM, 0.09); lf.position.set(-0.02, 0.12, 0); lf.rotation.set(0, 0, sgn * 0.6); sprout.add(lf); }

  // deep-set eyes
  const eyeL = makeEye(0.05, 0x3a5a2a, { glow: 0.2 });
  const eyeR = makeEye(0.05, 0x3a5a2a, { glow: 0.2 });
  eyeL.position.set(0.22, 0.0, 0.1); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.22, 0.0, -0.1); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.07), rockM); brow.position.set(0.23, 0.07, sgn * 0.1); brow.rotation.z = -0.2; core.add(brow); }

  // squat rock feet
  for (const [x, z] of [[0.16, 0.18], [0.16, -0.18], [-0.16, 0.18], [-0.16, -0.18]] as const) {
    core.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), rockM).translateX(x).translateY(-0.2).translateZ(z));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.24 + Math.abs(Math.sin(t * 1.4)) * 0.02; // slow trundle
    core.rotation.z = Math.sin(t * 1.4) * 0.04;
    body.rotation.z = Math.sin(t * 1.4) * 0.02;
    sprout.rotation.z = Math.sin(t * 1.1) * 0.12;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.9 * blinkAt(t, 4.5, 0.8);
  };
  return { body: g, parts: {}, animate };
}

// ============================================================
// FERNFOX — a little fox whose tail is a single fern frond. It
// naps curled into a perfect green spiral. Soft leaf-green fur, a
// frond-plume tail, tall leaf-edged ears and a bright, gentle face
// that watches the wind for somewhere warm to curl up.
// ============================================================
function buildFernfox(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: furTex('fern-fur', '#6a9a3a', '#456a24', '#a8d95a', 261), roughness: 0.85 });
  const bellyM = std({ map: furTex('fern-belly', '#cfe89a', '#9ac46a', '#f2f0c8', 262), roughness: 0.85 });
  const frondM = std({ map: leafMottle('fern-frond', '#5aa83a', '#357022', '#a8d95a', 263), roughness: 0.55, side: THREE.DoubleSide });
  const noseM = std({ color: 0x2e3a1a, roughness: 0.4 });

  const chest = orb(furM, 0.2, 0.16, 0.44, 0, 1.0, 1.05, 0.92);
  core.add(chest);
  core.add(orb(furM, 0.18, -0.08, 0.42, 0, 1.1, 0.95, 0.88));
  core.add(orb(bellyM, 0.13, 0.16, 0.36, 0, 0.9, 0.9, 0.8));

  // head
  const head = new THREE.Group();
  head.position.set(0.34, 0.62, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.15, 0, 0, 0, 1.1, 0.92, 1));
  head.add(bone(bellyM, 0.1, -0.03, 0, 0.26, -0.06, 0, 0.06, 0.035)); // snout
  head.add(orb(noseM, 0.025, 0.27, -0.05, 0, 1.1, 0.8, 1, 7, 6));
  // tall leaf-edged ears
  for (const sgn of [1, -1]) { const ear = leafBlade(frondM, 0.16); ear.position.set(-0.02, 0.1, sgn * 0.08); ear.rotation.set(sgn * 0.2, 0, sgn * 0.25); head.add(ear); }
  const eyeL = makeEye(0.05, 0x3a8a2a, { glow: 0.4 });
  const eyeR = makeEye(0.05, 0x3a8a2a, { glow: 0.4 });
  eyeL.position.set(0.11, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.11, 0.04, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);

  // legs
  for (const [hx, hz, rear] of [[0.24, 0.13, false], [0.24, -0.13, false], [-0.16, 0.14, true], [-0.16, -0.14, true]] as const) {
    core.add(bone(furM, hx, rear ? 0.3 : 0.34, hz, hx + 0.01, 0.08, hz, 0.05, 0.035));
    core.add(orb(bellyM, 0.04, hx + 0.01, 0.04, hz, 1, 0.8, 1.1, 7, 6));
  }

  // fern-frond tail
  const tail = new THREE.Group();
  tail.position.set(-0.28, 0.5, 0);
  tail.name = 'tail';
  core.add(tail);
  const spine = bone(frondM, 0, 0, 0, -0.34, 0.3, 0, 0.02, 0.008);
  tail.add(spine);
  const fronds: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 5;
    for (const sgn of [1, -1]) {
      const lf = leafBlade(frondM, 0.1 - a * 0.04);
      lf.position.set(-a * 0.34, a * 0.3, 0);
      lf.rotation.set(0, 0, sgn * (1.0 + a * 0.3));
      tail.add(lf); fronds.push(lf);
    }
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.2) * 0.018;
    chest.scale.set(1.0, 1.05 + Math.sin(t * 2.4) * 0.04, 0.92);
    head.rotation.y = Math.sin(t * 0.8) * 0.3; // watching the wind
    head.rotation.z = Math.sin(t * 1.4) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.2, 0.4);
    tail.rotation.y = Math.sin(t * 1.6) * 0.35;
    tail.rotation.z = 0.2 + Math.sin(t * 1.2) * 0.12;
    for (let i = 0; i < fronds.length; i++) fronds[i].rotation.z += Math.sin(t * 3 + i) * 0.01;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// BRAMBLELYNX — a lithe wildcat whose ear-tufts are living briars
// it grooms into fashionable menace. Dappled moss-green fur, long
// thorned ear-plumes, a barbed whip-tail and the cool, appraising
// stare of something that has never once been caught.
// ============================================================
function buildBramblelynx(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: stripePair('lynx-fur', '#4a7a2e', '#2e4e1a', '#8ac45a', 271).map, roughness: 0.85 });
  const bellyM = std({ map: furTex('lynx-belly', '#c8e09a', '#94b86a', '#eef2c8', 272), roughness: 0.85 });
  const briarM = std({ color: 0x2e4a1e, roughness: 0.6 });
  const budM = std({ color: 0xd9b85a, emissive: 0xc4a13a, emissiveIntensity: 0.4, roughness: 0.5 });
  const noseM = std({ color: 0x3a2a1a, roughness: 0.4 });

  const chest = orb(furM, 0.24, 0.18, 0.6, 0, 1.05, 1.0, 0.9);
  core.add(chest);
  core.add(orb(furM, 0.22, -0.12, 0.58, 0, 1.15, 0.95, 0.88));
  core.add(orb(bellyM, 0.15, 0.18, 0.5, 0, 0.95, 0.95, 0.82));
  core.add(bone(furM, 0.24, 0.74, 0, 0.36, 0.86, 0, 0.1, 0.08)); // neck

  // head
  const head = new THREE.Group();
  head.position.set(0.4, 0.9, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.16, 0, 0, 0, 1.1, 0.9, 1));
  head.add(bone(bellyM, 0.1, -0.04, 0, 0.24, -0.06, 0, 0.07, 0.045));
  head.add(orb(noseM, 0.025, 0.25, -0.05, 0, 1.1, 0.8, 1, 7, 6));
  const eyeL = makeEye(0.05, 0xd9d820, { glow: 0.7, slit: true });
  const eyeR = makeEye(0.05, 0xd9d820, { glow: 0.7, slit: true });
  eyeL.position.set(0.12, 0.05, 0.09); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.12, 0.05, -0.09); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);
  // briar ear-tufts
  const ears: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.02, 0.13, sgn * 0.09);
    ear.add(spike(furM, 0, 0, 0, -0.02, 0.14, sgn * 0.02, 0.04));
    for (let k = 0; k < 3; k++) ear.add(spike(briarM, -0.02, 0.1, sgn * 0.02, -0.04 + (k - 1) * 0.04, 0.22 + k * 0.02, sgn * (0.02 + (k - 1) * 0.03), 0.012));
    ear.add(orb(budM, 0.018, -0.03, 0.2, sgn * 0.02, 1, 1, 1, 6, 5));
    head.add(ear); ears.push(ear);
  }
  // whiskers
  for (const sgn of [1, -1]) for (const wy of [-0.02, -0.05]) head.add(spike(std({ color: 0xeef2c8, roughness: 0.5 }), 0.2, wy, sgn * 0.04, 0.32, wy, sgn * 0.14, 0.005));

  // legs
  for (const [hx, hz, rear] of [[0.28, 0.16, false], [0.28, -0.16, false], [-0.2, 0.17, true], [-0.2, -0.17, true]] as const) {
    core.add(bone(furM, hx, rear ? 0.46 : 0.5, hz, hx + 0.01, 0.1, hz, 0.06, 0.04));
    core.add(orb(bellyM, 0.05, hx + 0.01, 0.06, hz, 1, 0.8, 1.1, 7, 6));
  }

  // barbed whip-tail
  const tail = new THREE.Group();
  tail.position.set(-0.34, 0.64, 0);
  tail.name = 'tail';
  core.add(tail);
  const seg2 = new THREE.Group(); seg2.position.set(-0.26, 0.08, 0);
  tail.add(bone(furM, 0, 0, 0, -0.26, 0.08, 0, 0.045, 0.03));
  tail.add(seg2);
  seg2.add(bone(furM, 0, 0, 0, -0.22, 0.14, 0, 0.03, 0.015));
  for (let k = 0; k < 3; k++) seg2.add(spike(briarM, -0.1 - k * 0.06, 0.06 + k * 0.04, 0, -0.12 - k * 0.06, 0.02 + k * 0.04, 0, 0.012));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.2) * 0.018;
    chest.scale.set(1.05, 1.0 + Math.sin(t * 2.4) * 0.035, 0.9);
    head.rotation.y = Math.sin(t * 0.6) * 0.26;
    head.rotation.x = -gate(t, 7, 6) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.5, 0.7);
    ears[0].rotation.x = Math.sin(t * 2) * 0.12;
    ears[1].rotation.x = -Math.sin(t * 2 + 0.5) * 0.12;
    tail.rotation.y = Math.sin(t * 1.8) * 0.4;
    seg2.rotation.y = Math.sin(t * 1.8 - 0.8) * 0.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// THICKETCLAW — a walking hedge of muscle and thorn. Poachers tell
// stories about it. Short ones. A hulking bramble brute, its body a
// dense snarl of woody vines over slabs of muscle, with great
// hooked claws and two cold green lights for eyes deep in the briar.
// ============================================================
function buildThicketclaw(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const hideM = std({ map: leafMottle('thicket-hide', '#3a5e22', '#1e3a12', '#6aa84a', 281), roughness: 0.85 });
  const vineM = std({ color: 0x2a4418, roughness: 0.7 });
  const thornM = std({ color: 0x1a2e10, roughness: 0.6 });
  const clawM = std({ color: 0xc4a13a, emissive: 0x8a6a1a, emissiveIntensity: 0.3, roughness: 0.5 });

  const torso = orb(hideM, 0.4, 0.04, 1.0, 0, 1.05, 1.05, 0.98);
  core.add(torso);
  core.add(orb(hideM, 0.34, 0.16, 0.72, 0, 1.1, 0.9, 0.92));
  // bramble snarl wrapping the body
  const briars: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rng(282 + i)() * Math.PI * 2;
    const yy = 0.7 + rng(300 + i)() * 0.6;
    const rr = 0.36 + rng(320 + i)() * 0.08;
    const v = bone(vineM, Math.cos(a) * rr, yy, Math.sin(a) * rr, Math.cos(a + 0.6) * (rr + 0.06), yy + 0.1, Math.sin(a + 0.6) * (rr + 0.06), 0.03, 0.02);
    core.add(v); briars.push(v);
    core.add(spike(thornM, Math.cos(a) * rr, yy + 0.05, Math.sin(a) * rr, Math.cos(a) * (rr + 0.12), yy + 0.12, Math.sin(a) * (rr + 0.12), 0.02));
  }

  // brutish head sunk into the shoulders
  const head = new THREE.Group();
  head.position.set(0.4, 1.06, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(hideM, 0.22, 0, 0, 0, 1.1, 0.9, 1));
  head.add(bone(vineM, 0.14, -0.06, 0, 0.32, -0.1, 0, 0.12, 0.09));
  const eyeL = makeEye(0.055, 0x7af26a, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.055, 0x7af26a, { glow: 1.3, slit: true });
  eyeL.position.set(0.13, 0.06, 0.12); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.06, -0.12); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.09), thornM); brow.position.set(0.14, 0.13, sgn * 0.11); brow.rotation.z = -0.25; head.add(brow); }
  const jaw = new THREE.Group(); jaw.position.set(0.16, -0.12, 0); head.add(jaw);
  jaw.add(bone(vineM, 0, 0, 0, 0.26, -0.02, 0, 0.09, 0.06));
  for (const sgn of [1, -1]) head.add(spike(clawM, 0.3, -0.08, sgn * 0.06, 0.31, -0.16, sgn * 0.06, 0.018));

  // huge clawed arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.1, 1.18, sgn * 0.44);
    arm.add(bone(hideM, 0, 0, 0, 0.06, -0.48, sgn * 0.08, 0.14, 0.11));
    arm.add(bone(vineM, 0.06, -0.48, sgn * 0.08, 0.22, -0.86, sgn * 0.04, 0.11, 0.09));
    const fist = orb(hideM, 0.15, 0.22, -0.9, sgn * 0.04, 1, 0.95, 1);
    arm.add(fist);
    for (const cz of [-0.07, 0, 0.07]) arm.add(bone(clawM, 0.3, -0.92, sgn * 0.04 + cz, 0.42, -0.84, sgn * 0.04 + cz, 0.022, 0.004)); // hooked claws
    core.add(arm); arms.push(arm);
  }

  // stout legs
  for (const sgn of [1, -1]) {
    core.add(bone(hideM, 0.0, 0.72, sgn * 0.26, 0.0, 0.32, sgn * 0.3, 0.13, 0.1));
    core.add(orb(thornM, 0.12, 0.06, 0.08, sgn * 0.3, 1.2, 0.6, 1.1));
    for (const cz of [-0.08, 0, 0.08]) core.add(spike(clawM, 0.16, 0.05, sgn * 0.3 + cz, 0.26, 0.02, sgn * 0.3 + cz, 0.02));
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.5) * 0.022;
    torso.scale.set(1.05 + Math.sin(t * 1.5) * 0.02, 1.05, 0.98);
    head.rotation.y = Math.sin(t * 0.5) * 0.14;
    head.rotation.x = 0.06 + Math.sin(t * 1.5 + 0.4) * 0.03;
    jaw.rotation.z = -(0.08 + gate(t, 5, 5) * 0.28);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.4);
    clawM.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.15;
    arms[0].rotation.x = Math.sin(t * 1.2) * 0.1;
    arms[1].rotation.x = -Math.sin(t * 1.2 + 0.5) * 0.1;
    for (let i = 0; i < briars.length; i++) briars[i].rotation.y = Math.sin(t * 1.4 + i) * 0.04;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// GROVETYRANT — it rules a forest the way a heart rules a body:
// unseen, unarguable. A dark antlered sovereign-beast in living
// bark armor, wreathed in glowing vines, crowned with a great
// branching rack and lit from within by a slow amber heartwood.
// ============================================================
function buildGrovetyrant(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const barkM = std({ map: barkTex('tyrant-bark', '#2a4416', '#14240a', '#456a2a', 291), roughness: 0.88 });
  const mossM = std({ map: furTex('tyrant-moss', '#244010', '#142808', '#4a7a2a', 292), roughness: 0.85 });
  const antlerM = std({ color: 0x6a5436, roughness: 0.8 });
  const glowM = std({ color: 0xf2c14e, emissive: 0xf2a83a, emissiveIntensity: 0.9, roughness: 0.5 });
  const vineM = std({ color: 0x3a7a2a, emissive: 0x1a4e12, emissiveIntensity: 0.4, roughness: 0.6 });

  // powerful stag-bear frame, semi-upright
  const chest = orb(barkM, 0.36, 0.16, 0.96, 0, 1.05, 1.05, 0.95);
  core.add(chest);
  core.add(orb(barkM, 0.32, -0.14, 0.78, 0, 1.1, 0.95, 0.9));
  core.add(orb(mossM, 0.26, 0.26, 0.94, 0, 0.6, 1.0, 0.85)); // mossy mantle
  core.add(bone(barkM, 0.34, 1.1, 0, 0.5, 1.24, 0, 0.13, 0.1));
  // glowing heartwood through the chest
  const heart = orb(glowM, 0.08, 0.4, 0.96, 0, 1, 1.2, 0.6, 8, 7);
  core.add(heart);

  // antlered head
  const head = new THREE.Group();
  head.position.set(0.54, 1.28, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(barkM, 0.21, 0, 0, 0, 1.1, 0.92, 1));
  head.add(bone(mossM, 0.14, -0.05, 0, 0.34, -0.09, 0, 0.1, 0.07));
  // great branching antler rack
  for (const sgn of [1, -1]) {
    head.add(bone(antlerM, -0.02, 0.16, sgn * 0.08, -0.2, 0.5, sgn * 0.22, 0.04, 0.02));
    head.add(bone(antlerM, -0.12, 0.34, sgn * 0.14, -0.32, 0.58, sgn * 0.1, 0.022, 0.01));
    head.add(spike(antlerM, -0.16, 0.42, sgn * 0.18, -0.28, 0.66, sgn * 0.28, 0.016));
    head.add(spike(antlerM, -0.1, 0.46, sgn * 0.12, -0.06, 0.66, sgn * 0.16, 0.014));
    for (let k = 0; k < 3; k++) head.add(orb(glowM, 0.012, -0.14 - k * 0.04, 0.4 + k * 0.06, sgn * (0.18 + k * 0.02), 1, 1, 1, 5, 4));
  }
  const eyeL = makeEye(0.058, 0xf2c14e, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.058, 0xf2c14e, { glow: 1.3, slit: true });
  eyeL.position.set(0.14, 0.06, 0.11); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.06, -0.11); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);

  // vine-wrapped arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.08, 1.14, sgn * 0.42);
    arm.add(bone(barkM, 0, 0, 0, 0.06, -0.46, sgn * 0.06, 0.12, 0.09));
    arm.add(bone(mossM, 0.06, -0.46, sgn * 0.06, 0.2, -0.82, sgn * 0.02, 0.09, 0.07));
    for (let k = 0; k < 3; k++) arm.add(orb(vineM, 0.03, 0.03 + k * 0.05, -0.14 - k * 0.18, sgn * (0.05 - k * 0.01), 1, 1, 1, 6, 5));
    arm.add(orb(barkM, 0.12, 0.2, -0.86, sgn * 0.02, 1, 0.95, 1));
    for (const cz of [-0.06, 0, 0.06]) arm.add(spike(antlerM, 0.28, -0.88, sgn * 0.02 + cz, 0.36, -0.94, sgn * 0.02 + cz, 0.018));
    core.add(arm); arms.push(arm);
  }

  // hind legs
  for (const sgn of [1, -1]) {
    core.add(bone(barkM, -0.06, 0.72, sgn * 0.26, -0.08, 0.34, sgn * 0.3, 0.13, 0.1));
    core.add(bone(mossM, -0.08, 0.34, sgn * 0.3, 0.06, 0.08, sgn * 0.28, 0.09, 0.07));
    core.add(orb(antlerM, 0.07, 0.1, 0.05, sgn * 0.28, 1.1, 0.7, 1.1, 8, 6));
  }

  // tail
  const tail = new THREE.Group();
  tail.position.set(-0.4, 0.86, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(barkM, 0, 0, 0, -0.26, 0.06, 0, 0.05, 0.025));
  tail.add(orb(mossM, 0.08, -0.3, 0.06, 0, 1, 1.2, 1, 8, 6));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.4) * 0.02;
    chest.scale.set(1.05, 1.05 + Math.sin(t * 1.4) * 0.025, 0.95);
    head.rotation.y = Math.sin(t * 0.45) * 0.18;
    head.rotation.x = -0.04 + Math.sin(t * 1.4 + 0.3) * 0.03;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6.5, 1.6);
    const pulse = 0.8 + Math.sin(t * 1.6) * 0.3 + gate(t, 7, 4) * 0.5;
    glowM.emissiveIntensity = pulse; heart.scale.set(1, 1.2 + Math.sin(t * 1.6) * 0.08, 0.6);
    arms[0].rotation.x = Math.sin(t * 0.9) * 0.06;
    arms[1].rotation.x = -Math.sin(t * 0.9 + 0.4) * 0.06;
    tail.rotation.y = Math.sin(t * 1.6) * 0.2;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// SYLVAEON — the Wildwarden itself, a great spirit-fox of nine
// seasons in whose pawprints forests grow. A luminous nine-tailed
// fox of pale jade fur, each tail tipped in a different season's
// leaf, a flower-circlet brow and a serene, ancient gaze.
// ============================================================
function buildSylvaeon(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: furTex('sylvaeon-fur', '#3a8a4a', '#246030', '#c8f2a8', 301), emissive: 0x2a6e2a, emissiveIntensity: 0.25, roughness: 0.7 });
  const bellyM = std({ map: furTex('sylvaeon-belly', '#dff2c0', '#a8d088', '#f6ffe0', 302), roughness: 0.8 });
  const noseM = std({ color: 0x2e4a2a, roughness: 0.4 });
  const seasonCols = [0x6ec45e, 0xffe9a8, 0xf2a83a, 0xe8f4ff]; // spring/summer/autumn/winter tints

  const chest = orb(furM, 0.26, 0.2, 0.82, 0, 1.0, 1.05, 0.9);
  core.add(chest);
  core.add(orb(furM, 0.24, -0.12, 0.8, 0, 1.1, 0.95, 0.88));
  core.add(orb(bellyM, 0.17, 0.2, 0.74, 0, 0.9, 0.95, 0.82));
  core.add(bone(furM, 0.28, 0.94, 0, 0.42, 1.08, 0, 0.1, 0.08));

  // head
  const head = new THREE.Group();
  head.position.set(0.46, 1.12, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.16, 0, 0, 0, 1.1, 0.92, 1));
  head.add(bone(bellyM, 0.1, -0.04, 0, 0.28, -0.07, 0, 0.07, 0.04));
  head.add(orb(noseM, 0.025, 0.29, -0.06, 0, 1.1, 0.8, 1, 7, 6));
  // tall ears
  const leafM = std({ map: leafMottle('sylvaeon-ear', '#4e9a3a', '#2a6e1e', '#bdf09a', 303), roughness: 0.55, side: THREE.DoubleSide });
  for (const sgn of [1, -1]) { const ear = leafBlade(leafM, 0.18); ear.position.set(-0.02, 0.12, sgn * 0.09); ear.rotation.set(sgn * 0.2, 0, sgn * 0.22); head.add(ear); }
  // flower-circlet brow
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.4;
    const fl = orb(std({ color: 0xffe9a8, emissive: 0xffd86a, emissiveIntensity: 0.6, roughness: 0.4 }), 0.018, Math.cos(a) * 0.04 + 0.04, 0.16, Math.sin(a) * 0.13, 1, 1, 1, 6, 5);
    head.add(fl);
  }
  const eyeL = makeEye(0.05, 0xb8f29a, { glow: 1.0 });
  const eyeR = makeEye(0.05, 0xb8f29a, { glow: 1.0 });
  eyeL.position.set(0.12, 0.05, 0.09); eyeL.rotation.y = -0.38;
  eyeR.position.set(0.12, 0.05, -0.09); eyeR.rotation.y = 0.38;
  head.add(eyeL, eyeR);

  // legs
  for (const [hx, hz, rear] of [[0.3, 0.16, false], [0.3, -0.16, false], [-0.2, 0.18, true], [-0.2, -0.18, true]] as const) {
    core.add(bone(furM, hx, rear ? 0.56 : 0.6, hz, hx + 0.01, 0.1, hz, 0.06, 0.04));
    core.add(orb(bellyM, 0.05, hx + 0.01, 0.06, hz, 1, 0.8, 1.1, 7, 6));
  }

  // nine seasonal tails fanned out
  const tails: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const tn = new THREE.Group();
    const spread = (i - 4) / 4; // -1..1
    tn.position.set(-0.34, 0.92, 0);
    tn.rotation.y = spread * 0.9;
    tn.rotation.z = 0.3 + Math.abs(spread) * 0.3;
    tn.add(bone(furM, 0, 0, 0, -0.34, 0.18, 0, 0.05, 0.025));
    const tip = orb(std({ color: seasonCols[i % 4], emissive: seasonCols[i % 4], emissiveIntensity: 0.6, roughness: 0.5 }), 0.06, -0.36, 0.2, 0, 1, 1.3, 1, 8, 7);
    tn.add(tip);
    core.add(tn); tails.push(tn);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.8) * 0.025;
    chest.scale.set(1.0, 1.05 + Math.sin(t * 2) * 0.035, 0.9);
    head.rotation.y = Math.sin(t * 0.5) * 0.2;
    head.rotation.z = Math.sin(t * 1.0) * 0.04;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    furM.emissiveIntensity = 0.2 + Math.sin(t * 1.6) * 0.1;
    for (let i = 0; i < tails.length; i++) {
      const spread = (i - 4) / 4;
      tails[i].rotation.y = spread * 0.9 + Math.sin(t * 1.4 + i * 0.5) * 0.12;
      tails[i].rotation.x = Math.sin(t * 1.2 + i * 0.6) * 0.1;
    }
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// SHROOMPLE — a cheerful toadstool that hums when it rains; its
// spores smell of fresh bread. A round cream stem-body under a
// rosy spotted cap, with stubby arms, a sunny face and a slow
// drift of harmless spores rising from beneath the cap.
// ============================================================
function buildShroomple(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.22;
  g.add(core);

  const stemM = std({ map: furTex('shroom-stem', '#e8d0a8', '#c4a878', '#fff4e0', 311), roughness: 0.8 });
  const capM = std({ color: 0xc46a8a, roughness: 0.55 });
  const spotM = std({ color: 0xffe8d8, roughness: 0.5 });
  const gillM = std({ color: 0xe8b0c0, emissive: 0xc46a8a, emissiveIntensity: 0.3, roughness: 0.6 });

  // stem body
  const body = orb(stemM, 0.2, 0, 0, 0, 1, 1.2, 1);
  core.add(body);

  // cap
  const cap = new THREE.Group();
  cap.position.set(0, 0.24, 0);
  core.add(cap);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  dome.scale.set(1, 0.7, 1); cap.add(dome);
  // gills underneath
  const gills = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), gillM);
  gills.rotation.x = Math.PI / 2; gills.position.y = 0.005; gills.userData.noShadow = true;
  cap.add(gills);
  // spots
  for (let i = 0; i < 7; i++) { const a = rng(312 + i)() * Math.PI * 2, rr = 0.08 + rng(330 + i)() * 0.16; cap.add(orb(spotM, 0.03 + rng(340 + i)() * 0.02, Math.cos(a) * rr, 0.12 + (0.3 - rr) * 0.4, Math.sin(a) * rr, 1, 0.5, 1, 8, 6)); }

  // sunny face
  const eyeL = makeEye(0.045, 0x6a3a4a, { glow: 0.1, sclera: 0xfff4e8 });
  const eyeR = makeEye(0.045, 0x6a3a4a, { glow: 0.1, sclera: 0xfff4e8 });
  eyeL.position.set(0.15, 0.02, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.15, 0.02, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), std({ color: 0x8a4a5a, roughness: 0.6 }));
  mouth.position.set(0.18, -0.06, 0); mouth.rotation.set(Math.PI / 2, 0, Math.PI);
  core.add(mouth);
  // pink cheeks
  for (const sgn of [1, -1]) core.add(orb(std({ color: 0xf2a8b8, roughness: 0.6 }), 0.025, 0.16, -0.04, sgn * 0.12, 1, 0.7, 0.5, 7, 6));

  // stubby arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(-0.02, 0.04, sgn * 0.18);
    arm.add(bone(stemM, 0, 0, 0, 0.06, -0.04, sgn * 0.12, 0.04, 0.025));
    core.add(arm); arms.push(arm);
  }
  // little feet
  for (const sgn of [1, -1]) core.add(orb(stemM, 0.05, 0.04, -0.2, sgn * 0.08, 1.1, 0.6, 1.2, 8, 6));

  // drifting spores
  const spores: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const sp = orb(std({ color: 0xe8d0a8, emissive: 0xc4a878, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, roughness: 0.5 }), 0.012, 0, 0, 0, 1, 1, 1, 5, 4); sp.userData.noShadow = true; core.add(sp); spores.push(sp); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.22 + Math.abs(Math.sin(t * 3)) * 0.03; // happy bounce
    body.scale.set(1, 1.2 + Math.sin(t * 3) * 0.05, 1);
    cap.rotation.z = Math.sin(t * 2) * 0.05;
    cap.position.y = 0.24 + Math.sin(t * 3) * 0.01;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.8, 0.3);
    mouth.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    gillM.emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.15;
    arms[0].rotation.z = Math.sin(t * 4) * 0.3;
    arms[1].rotation.z = -Math.sin(t * 4) * 0.3;
    for (let i = 0; i < spores.length; i++) {
      const ph = (t * 0.4 + i / spores.length) % 1;
      spores[i].position.set(Math.cos(i * 2 + t) * 0.2, 0.2 + ph * 0.4, Math.sin(i * 2 + t) * 0.2);
      (spores[i].material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - ph);
    }
  };
  return { body: g, parts: {}, animate };
}

// ============================================================
// MYCELORD — a duke of the underground mycelium court; everything
// that rots, it knows about. A robed fungal brute crowned with a
// great bracket-fungus cowl, glowing spore-gills banding its body,
// bracket shelves on its shoulders and slow root-tendril fingers.
// ============================================================
function buildMycelord(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const robeM = std({ map: furTex('myce-robe', '#a84a6a', '#6e2c44', '#d9889e', 321), roughness: 0.8 });
  const fleshM = std({ map: furTex('myce-flesh', '#d9b88a', '#a8865c', '#f2e0c0', 322), roughness: 0.75 });
  const gillM = std({ color: 0x6ec45e, emissive: 0x5aa83e, emissiveIntensity: 0.8, roughness: 0.5 });
  const bracketM = std({ color: 0xc49a6a, roughness: 0.7 });
  const capM = std({ color: 0x8a3a58, roughness: 0.6 });

  // bulbous robed body
  const torso = orb(robeM, 0.4, 0.0, 0.9, 0, 1.0, 1.15, 0.98);
  core.add(torso);
  core.add(orb(robeM, 0.36, 0.06, 0.6, 0, 1.1, 0.9, 0.95));
  // glowing spore-gill bands
  const bands: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34 - i * 0.02, 0.025, 6, 24), gillM);
    band.position.set(0.06, 0.66 + i * 0.18, 0); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 0.6);
    core.add(band); bands.push(band);
  }

  // bracket-fungus cowl/crown over the head
  const head = new THREE.Group();
  head.position.set(0.32, 1.3, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(fleshM, 0.2, 0, 0, 0, 1.05, 0.95, 1));
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  cowl.scale.set(1.1, 0.55, 1.1); cowl.position.set(-0.04, 0.16, 0); head.add(cowl);
  const cowlGills = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), gillM);
  cowlGills.rotation.x = Math.PI / 2; cowlGills.position.set(-0.04, 0.155, 0); cowlGills.userData.noShadow = true; head.add(cowlGills);
  const eyeL = makeEye(0.055, 0x6ec45e, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.055, 0x6ec45e, { glow: 1.2, slit: true });
  eyeL.position.set(0.14, 0.0, 0.1); eyeL.rotation.y = -0.32;
  eyeR.position.set(0.14, 0.0, -0.1); eyeR.rotation.y = 0.32;
  head.add(eyeL, eyeR);
  // wispy beard of hyphae
  for (let i = 0; i < 5; i++) head.add(spike(fleshM, 0.12, -0.14, (i - 2) * 0.04, 0.14, -0.32, (i - 2) * 0.05, 0.012));

  // bracket shelves on the shoulders
  for (const sgn of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const br = new THREE.Mesh(new THREE.SphereGeometry(0.14 - k * 0.03, 10, 6, 0, Math.PI, 0, Math.PI / 2), bracketM);
      br.scale.set(1.2, 0.4, 0.8); br.position.set(-0.02, 1.18 + k * 0.12, sgn * (0.36 - k * 0.04)); br.rotation.y = sgn * Math.PI / 2;
      core.add(br);
    }
  }

  // root-tendril arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.04, 1.04, sgn * 0.4);
    arm.add(bone(robeM, 0, 0, 0, 0.06, -0.4, sgn * 0.08, 0.1, 0.07));
    for (let k = 0; k < 3; k++) arm.add(bone(fleshM, 0.06, -0.4, sgn * 0.08, 0.12 + (k - 1) * 0.05, -0.66, sgn * (0.06 + (k - 1) * 0.04), 0.03, 0.008));
    core.add(arm); arms.push(arm);
  }

  // squat base
  for (const sgn of [1, -1]) core.add(orb(robeM, 0.14, 0.02, 0.24, sgn * 0.22, 1, 0.8, 1.1));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.4) * 0.02;
    torso.scale.set(1.0, 1.15 + Math.sin(t * 1.6) * 0.03, 0.98);
    head.rotation.y = Math.sin(t * 0.5) * 0.16;
    head.rotation.z = Math.sin(t * 0.9) * 0.04;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.5, 1.1);
    const spore = 0.7 + Math.sin(t * 2) * 0.3 + gate(t, 6, 4) * 0.5;
    gillM.emissiveIntensity = spore;
    for (let i = 0; i < bands.length; i++) (bands[i].material as THREE.MeshStandardMaterial).emissiveIntensity = spore;
    arms[0].rotation.x = Math.sin(t * 1.0) * 0.12;
    arms[1].rotation.x = -Math.sin(t * 1.0 + 0.5) * 0.12;
  };
  return { body: g, parts: { head }, animate };
}

// ---------------- tech / storm helpers ----------------
/** Brushed riveted metal panelling with seams and corner rivets. */
function metalTex(key: string, base: string, dark: string, lite: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    const grd = ctx.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, lite); grd.addColorStop(0.5, base); grd.addColorStop(1, dark);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) { ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); const y = rnd() * s; ctx.moveTo(0, y); ctx.lineTo(s, y + (rnd() - 0.5) * 4); ctx.stroke(); }
    ctx.strokeStyle = dark; ctx.lineWidth = 3;
    for (let x = 0; x <= s; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); }
    for (let y = 0; y <= s; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    for (let gx = 0; gx <= s; gx += 64) for (let gy = 0; gy <= s; gy += 64) {
      ctx.fillStyle = lite; ctx.beginPath(); ctx.arc(gx + 8, gy + 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(gx + 8, gy + 8, 1.4, 0, Math.PI * 2); ctx.fill();
    }
  });
}
/** A jagged lightning bolt as a chain of thin glowing segments. */
function boltGroup(mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, jags = 3, r = 0.012): THREE.Group {
  const grp = new THREE.Group();
  const a = v3(ax, ay, az), b = v3(bx, by, bz);
  let prev = a.clone();
  for (let i = 1; i <= jags; i++) {
    const p = a.clone().lerp(b, i / jags);
    if (i < jags) { p.x += (Math.random() - 0.5) * 0.12; p.y += (Math.random() - 0.5) * 0.08; p.z += (Math.random() - 0.5) * 0.12; }
    grp.add(bone(mat, prev.x, prev.y, prev.z, p.x, p.y, p.z, r, r * 0.7));
    prev = p;
  }
  grp.children.forEach(c => (c.userData.noShadow = true));
  return grp;
}

// ============================================================
// ZAPLET — a spark that refused to fade; it crackles when excited.
// A round buzzing knot of yellow lightning with a hot white core,
// jagged spark-spines, two bright eyes and little arcs that leap
// off its body whenever it gets the slightest bit happy.
// ============================================================
function buildZaplet(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const sparkM = std({ color: 0xf2e06e, emissive: 0xf2d23a, emissiveIntensity: 1.2, roughness: 0.35 });
  const hotM = std({ color: 0xfff8d8, emissive: 0xfff0a8, emissiveIntensity: 1.6, roughness: 0.2 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.8, roughness: 0.2 });

  const body = orb(sparkM, 0.22, 0, 0, 0, 1.05, 1, 1);
  core.add(body);
  core.add(orb(hotM, 0.1, 0.03, 0, 0, 1, 1, 1, 10, 8));
  // jagged spark spines
  const spines: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = (i % 2 ? 0.4 : -0.4);
    const sp = spike(sparkM, Math.cos(a) * 0.18, Math.sin(a) * 0.2 + b * 0.05, Math.cos(a + 1) * 0.18, Math.cos(a) * 0.34, Math.sin(a) * 0.36, Math.cos(a + 1) * 0.34, 0.03);
    core.add(sp); spines.push(sp);
  }
  // face
  const eyeL = makeEye(0.05, 0x3a3a1a, { glow: 0.4, sclera: 0xfff8d8 });
  const eyeR = makeEye(0.05, 0x3a3a1a, { glow: 0.4, sclera: 0xfff8d8 });
  eyeL.position.set(0.16, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.16, 0.04, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  // arcs
  const arcs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const arc = boltGroup(boltM, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0, 3, 0.012);
    core.add(arc); arcs.push(arc);
  }
  const light = new THREE.PointLight(0xf2e06e, 3, 3); core.add(light);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 3) * 0.05;
    core.rotation.z = Math.sin(t * 2) * 0.1;
    body.scale.setScalar(1 + Math.sin(t * 8) * 0.04);
    const buzz = gate(t, 2.5, 3);
    hotM.emissiveIntensity = 1.4 + Math.sin(t * 12) * 0.4 + buzz * 1.0;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.6, 0.3);
    for (let i = 0; i < spines.length; i++) spines[i].scale.set(1, 1 + Math.sin(t * 10 + i) * 0.2, 1);
    for (let i = 0; i < arcs.length; i++) arcs[i].visible = gate(t + i * 0.3, 1.2, 6) > 0.25;
    light.intensity = 2 + buzz * 3 + Math.sin(t * 10) * 0.5;
  };
  return { body: g, parts: { head: core }, animate };
}

// ============================================================
// VOLTYX — it outruns its own thunder; catching one is considered
// impossible. A lean lightning-jackal in gold-streaked fur, bolt-
// fork tail, blade ears swept back by perpetual speed and a cocky
// grin that has never once been on the losing end of a chase.
// ============================================================
function buildVoltyx(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: stripePair('voltyx-fur', '#c4ae2a', '#7a6810', '#fff0a8', 401).map, emissive: 0xf2d23a, emissiveIntensity: 0.25, roughness: 0.7 });
  const bellyM = std({ map: furTex('voltyx-belly', '#f2e6a8', '#c4b06a', '#fffadf', 402), roughness: 0.8 });
  const boltM = std({ color: 0x6ec4f2, emissive: 0x5ab8e8, emissiveIntensity: 1.4, roughness: 0.2 });
  const noseM = std({ color: 0x2a2410, roughness: 0.4 });

  const chest = orb(furM, 0.22, 0.2, 0.56, 0, 1.0, 1.0, 0.88);
  core.add(chest);
  core.add(orb(furM, 0.2, -0.1, 0.54, 0, 1.15, 0.92, 0.85));
  core.add(orb(bellyM, 0.13, 0.2, 0.48, 0, 0.95, 0.9, 0.8));
  core.add(bone(furM, 0.24, 0.66, 0, 0.36, 0.78, 0, 0.09, 0.07));

  // head
  const head = new THREE.Group();
  head.position.set(0.4, 0.82, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.15, 0, 0, 0, 1.1, 0.9, 1));
  head.add(bone(bellyM, 0.1, -0.03, 0, 0.26, -0.06, 0, 0.06, 0.04));
  head.add(orb(noseM, 0.025, 0.27, -0.05, 0, 1.1, 0.8, 1, 7, 6));
  // swept blade ears
  const ears: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const ear = new THREE.Group(); ear.position.set(-0.02, 0.12, sgn * 0.08);
    ear.add(spike(furM, 0, 0, 0, -0.16, 0.12, sgn * 0.04, 0.05));
    ear.add(spike(boltM, -0.06, 0.06, sgn * 0.02, -0.16, 0.12, sgn * 0.04, 0.015));
    head.add(ear); ears.push(ear);
  }
  const eyeL = makeEye(0.05, 0x5ab8e8, { glow: 0.9, slit: true });
  const eyeR = makeEye(0.05, 0x5ab8e8, { glow: 0.9, slit: true });
  eyeL.position.set(0.12, 0.05, 0.09); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.12, 0.05, -0.09); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);

  // legs (poised to bolt)
  for (const [hx, hz, rear] of [[0.28, 0.14, false], [0.28, -0.14, false], [-0.18, 0.15, true], [-0.18, -0.15, true]] as const) {
    core.add(bone(furM, hx, rear ? 0.42 : 0.46, hz, hx + 0.02, 0.08, hz, 0.055, 0.035));
    core.add(orb(noseM, 0.04, hx + 0.02, 0.04, hz, 1, 0.8, 1.1, 7, 6));
  }

  // bolt-fork tail
  const tail = new THREE.Group();
  tail.position.set(-0.3, 0.58, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(furM, 0, 0, 0, -0.18, 0.12, 0, 0.04, 0.02));
  const fork = new THREE.Group(); fork.position.set(-0.18, 0.12, 0); tail.add(fork);
  fork.add(spike(boltM, 0, 0, 0, -0.16, 0.16, 0.06, 0.025));
  fork.add(spike(boltM, 0, 0, 0, -0.16, 0.02, -0.06, 0.025));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.6) * 0.02;
    chest.scale.set(1.0, 1.0 + Math.sin(t * 2.8) * 0.04, 0.88);
    head.rotation.y = Math.sin(t * 0.9) * 0.28;
    head.rotation.z = Math.sin(t * 1.6) * 0.05;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.8, 0.5);
    ears[0].rotation.z = Math.sin(t * 3) * 0.1; ears[1].rotation.z = -Math.sin(t * 3 + 0.4) * 0.1;
    furM.emissiveIntensity = 0.2 + gate(t, 3, 4) * 0.6;
    boltM.emissiveIntensity = 1.2 + Math.sin(t * 8) * 0.4;
    tail.rotation.y = Math.sin(t * 2.2) * 0.4;
    fork.rotation.x = Math.sin(t * 4) * 0.2;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// STORMCLAW — each claw stores a separate storm; it sharpens them
// on lightning rods. A heavyset thunder-wolverine, shaggy charged
// mane standing on end, and four oversized claws sheathed in
// crackling storm-light that flares brighter when it flexes.
// ============================================================
function buildStormclaw(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: stripePair('storm-fur', '#a8921e', '#5e500c', '#f2c43a', 411).map, emissive: 0xf2c43a, emissiveIntensity: 0.2, roughness: 0.8 });
  const maneM = std({ color: 0xc4a82a, emissive: 0xf2d23a, emissiveIntensity: 0.5, roughness: 0.7 });
  const stormM = std({ color: 0x9ad8ff, emissive: 0x3a9df2, emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.85 });
  const clawM = std({ color: 0xe8f4ff, emissive: 0x6ec4f2, emissiveIntensity: 0.8, roughness: 0.3 });
  const noseM = std({ color: 0x2a2410, roughness: 0.4 });

  const chest = orb(furM, 0.32, 0.18, 0.66, 0, 1.05, 1.0, 0.95);
  core.add(chest);
  core.add(orb(furM, 0.3, -0.14, 0.62, 0, 1.1, 0.95, 0.9));
  // charged mane standing on end
  const maneSpikes: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9 - 0.5) * Math.PI;
    const sp = spike(maneM, 0.1 + Math.cos(a) * 0.1, 0.86, Math.sin(a) * 0.26, 0.06 + Math.cos(a) * 0.16, 1.08, Math.sin(a) * 0.32, 0.04);
    core.add(sp); maneSpikes.push(sp);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0.42, 0.72, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.2, 0, 0, 0, 1.15, 0.9, 1));
  head.add(bone(std({ color: 0x4a4020, roughness: 0.6 }), 0.12, -0.05, 0, 0.3, -0.08, 0, 0.1, 0.07));
  head.add(orb(noseM, 0.035, 0.31, -0.07, 0, 1.1, 0.8, 1, 8, 6));
  const eyeL = makeEye(0.05, 0x6ec4f2, { glow: 1.1, slit: true });
  const eyeR = makeEye(0.05, 0x6ec4f2, { glow: 1.1, slit: true });
  eyeL.position.set(0.14, 0.07, 0.11); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.07, -0.11); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.07), std({ color: 0x4a4020, roughness: 0.6 })); brow.position.set(0.15, 0.13, sgn * 0.1); brow.rotation.z = -0.25; head.add(brow); head.add(spike(maneM, -0.02, 0.16, sgn * 0.1, -0.12, 0.32, sgn * 0.14, 0.04)); }

  // four storm-clawed limbs
  const storms: THREE.Mesh[] = [];
  const legCfg = [[0.26, 0.2, false], [0.26, -0.2, false], [-0.24, 0.22, true], [-0.24, -0.22, true]] as const;
  for (const [hx, hz, rear] of legCfg) {
    core.add(bone(furM, hx, rear ? 0.56 : 0.6, hz, hx + 0.02, 0.16, hz, 0.1, 0.07));
    const paw = orb(furM, 0.09, hx + 0.02, 0.1, hz, 1, 0.9, 1.1, 8, 6); core.add(paw);
    const stormBall = orb(stormM, 0.08, hx + 0.06, 0.05, hz, 1, 1, 1, 10, 8); stormBall.userData.noShadow = true; core.add(stormBall); storms.push(stormBall);
    for (const cz of [-0.05, 0, 0.05]) core.add(bone(clawM, hx + 0.08, 0.05, hz + cz, hx + 0.2, 0.02, hz + cz, 0.018, 0.004));
  }

  // tail
  const tail = new THREE.Group();
  tail.position.set(-0.4, 0.66, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(furM, 0, 0, 0, -0.26, 0.06, 0, 0.07, 0.04));
  tail.add(orb(maneM, 0.08, -0.3, 0.06, 0, 1, 1.3, 1, 8, 6));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.8) * 0.022;
    chest.scale.set(1.05, 1.0 + Math.sin(t * 1.8) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.6) * 0.18;
    head.rotation.x = -gate(t, 6, 5) * 0.08; // snarl
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    const flex = 1.4 + Math.sin(t * 3) * 0.4 + gate(t, 4, 3) * 1.0;
    stormM.emissiveIntensity = flex;
    for (let i = 0; i < storms.length; i++) storms[i].scale.setScalar(1 + Math.sin(t * 5 + i) * 0.15 + gate(t, 4, 3) * 0.3);
    for (let i = 0; i < maneSpikes.length; i++) maneSpikes[i].scale.set(1, 1 + Math.sin(t * 6 + i) * 0.12, 1);
    tail.rotation.y = Math.sin(t * 1.6) * 0.25;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// FULGUREX — the first thunderclap, given wings; skies clear where
// it passes. A great storm-raptor of charged gold plumage, a
// forked-bolt tail, blade pinions that crackle on the downstroke
// and a fierce beak that has shouted weather into silence.
// ============================================================
function buildFulgurex(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const plumeM = std({ map: featherTex('fulgur-plume', '#d9be2a', '#8a7510', '#fff0a8', 421), emissive: 0xf2d23a, emissiveIntensity: 0.35, roughness: 0.6 });
  const wingMat = std({ map: featherTex('fulgur-wing', '#c4a820', '#7a6510', '#fff0a8', 422), emissive: 0xf2d23a, emissiveIntensity: 0.4, roughness: 0.55, side: THREE.DoubleSide });
  const beakM = std({ color: 0x2a7dd9, emissive: 0x2a7dd9, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.3 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.6, roughness: 0.2 });

  const torso = orb(plumeM, 0.3, 0.06, 0.5, 0, 0.95, 1.2, 0.95);
  core.add(torso);
  core.add(orb(plumeM, 0.22, 0.12, 0.78, 0, 0.9, 0.95, 0.9));

  // head
  const head = new THREE.Group();
  head.position.set(0.2, 1.04, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.12, 0.84, 0, 0.18, 1.0, 0, 0.1, 0.08));
  head.add(orb(plumeM, 0.16, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.1, -0.02, 0, 0.32, -0.05, 0, 0.06, 0.012));
  head.add(bone(beakM, 0.1, -0.05, 0, 0.24, -0.09, 0, 0.045, 0.01));
  const eyeL = makeEye(0.05, 0x6ec4f2, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.05, 0x6ec4f2, { glow: 1.2, slit: true });
  eyeL.position.set(0.1, 0.05, 0.1); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.05, -0.1); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);
  // bolt crest
  for (const [z, h] of [[0, 0.24], [0.05, 0.16], [-0.05, 0.16]] as const) head.add(spike(boltM, -0.04, 0.12, z, -0.12, 0.12 + h, z, 0.02));

  // crackling pinion wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(0.0, 0.66, sgn * 0.22);
    for (let i = 0; i < 5; i++) {
      const len = 0.78 - i * 0.09;
      const f = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), wingMat);
      f.position.set(-0.04 - i * 0.04, 0.04 + i * 0.12, 0);
      f.rotation.set(Math.PI / 2, 0, sgn * (0.3 + i * 0.17));
      f.scale.set(0.28, 1, 1); f.userData.noShadow = true;
      w.add(f);
    }
    const arc = boltGroup(boltM, 0, 0.1, 0, -0.3, 0.5, 0, 4, 0.012); w.add(arc);
    core.add(w); wings.push(w);
  }

  // forked-bolt tail
  const tail = new THREE.Group();
  tail.position.set(-0.24, 0.4, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, -1]) tail.add(spike(boltM, 0, 0, 0, -0.34, -0.12, sgn * 0.1, 0.03));
  tail.add(spike(boltM, 0, 0, 0, -0.4, -0.06, 0, 0.034));

  // talons
  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.08, 0.3, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.04, 0.025)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(beakM, 0.12, 0.06, sgn * 0.13 + cz, 0.22, 0.02, sgn * 0.13 + cz, 0.013)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.5 + Math.sin(t * 1.8) * 0.05;
    torso.scale.set(0.95, 1.2 + Math.sin(t * 2.4) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.7) * 0.22;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.5, 0.7);
    const beat = Math.sin(t * 2.2);
    wings[0].rotation.x = beat * 0.5; wings[1].rotation.x = -beat * 0.5;
    wings[0].rotation.z = 0.1 + Math.abs(beat) * 0.12; wings[1].rotation.z = -0.1 - Math.abs(beat) * 0.12;
    plumeM.emissiveIntensity = 0.3 + Math.abs(beat) * 0.5;
    boltM.emissiveIntensity = 1.4 + Math.sin(t * 9) * 0.5;
    for (const w of wings) { const arc = w.children[w.children.length - 1]; arc.visible = Math.abs(beat) > 0.7; }
    tail.rotation.z = Math.sin(t * 1.6) * 0.1;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// RAIDENJIN — sovereign of thunderstorms, hurling divine bolts
// from the high clouds and moving faster than wind. A gold-armored
// thunder-oni raptor ringed by floating taiko storm-drums, royal-
// blue stormcloak plumage and an indigo halo of caged lightning.
// ============================================================
function buildRaidenjin(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const goldM = std({ color: 0xffd700, emissive: 0xf2c14e, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5 });
  const cloakM = std({ map: featherTex('raiden-cloak', '#2a48b8', '#16285e', '#6a8ae8', 431), emissive: 0x4169e1, emissiveIntensity: 0.4, roughness: 0.55, side: THREE.DoubleSide });
  const indigoM = std({ color: 0x6a3ad9, emissive: 0x4b0082, emissiveIntensity: 0.9, roughness: 0.3 });
  const boltM = std({ color: 0xc8e0ff, emissive: 0x9ad8ff, emissiveIntensity: 1.8, roughness: 0.2 });
  const drumM = std({ map: metalTex('raiden-drum', '#b03a3a', '#6a1c1c', '#e87a5a', 432), roughness: 0.6 });

  // armored torso
  const torso = orb(cloakM, 0.32, 0.06, 0.54, 0, 0.95, 1.2, 0.95);
  core.add(torso);
  core.add(orb(goldM, 0.24, 0.16, 0.62, 0, 1.0, 0.95, 0.9)); // gold cuirass
  for (const sgn of [1, -1]) core.add(orb(goldM, 0.14, 0.04, 0.82, sgn * 0.24, 1, 0.8, 1)); // pauldrons

  // head with thunder-oni mask
  const head = new THREE.Group();
  head.position.set(0.22, 1.06, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(cloakM, 0.14, 0.86, 0, 0.2, 1.0, 0, 0.1, 0.08));
  head.add(orb(goldM, 0.17, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(goldM, 0.1, -0.02, 0, 0.3, -0.04, 0, 0.06, 0.02)); // beak
  // oni horns
  for (const sgn of [1, -1]) head.add(spike(boltM, -0.04, 0.16, sgn * 0.08, -0.18, 0.42, sgn * 0.14, 0.035));
  const eyeL = makeEye(0.05, 0x9ad8ff, { glow: 1.5, slit: true });
  const eyeR = makeEye(0.05, 0x9ad8ff, { glow: 1.5, slit: true });
  eyeL.position.set(0.12, 0.05, 0.1); eyeL.rotation.y = -0.32;
  eyeR.position.set(0.12, 0.05, -0.1); eyeR.rotation.y = 0.32;
  head.add(eyeL, eyeR);

  // indigo halo of caged lightning
  const halo = new THREE.Group();
  halo.position.set(0.05, 1.3, 0);
  core.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 8, 28), indigoM);
  ring.rotation.x = Math.PI / 2.2; halo.add(ring);
  const haloArcs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const arc = boltGroup(boltM, Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26, Math.cos(a + 1) * 0.26, 0, Math.sin(a + 1) * 0.26, 3, 0.01); halo.add(arc); haloArcs.push(arc); }

  // ring of floating taiko storm-drums
  const drums: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const drum = new THREE.Group();
    const a = (i / 5) * Math.PI * 2;
    drum.position.set(Math.cos(a) * 0.7, 0.7 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.7);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), drumM);
    barrel.rotation.z = Math.PI / 2; drum.add(barrel);
    for (const ex of [0.07, -0.07]) { const face = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), std({ color: 0xf2e0c0, roughness: 0.6 })); face.position.x = ex; face.rotation.y = ex > 0 ? Math.PI / 2 : -Math.PI / 2; drum.add(face); }
    core.add(drum); drums.push(drum);
  }

  // stormcloak wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(-0.04, 0.66, sgn * 0.24);
    for (let i = 0; i < 5; i++) { const len = 0.82 - i * 0.1; const f = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), cloakM); f.position.set(-0.04 - i * 0.04, 0.04 + i * 0.13, 0); f.rotation.set(Math.PI / 2, 0, sgn * (0.3 + i * 0.17)); f.scale.set(0.3, 1, 1); f.userData.noShadow = true; w.add(f); }
    core.add(w); wings.push(w);
  }

  // talons
  for (const sgn of [1, -1]) { core.add(bone(goldM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(goldM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.014)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.6) * 0.05;
    torso.scale.set(0.95, 1.2 + Math.sin(t * 2.2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.5) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    halo.rotation.y = t * 0.8;
    indigoM.emissiveIntensity = 0.8 + Math.sin(t * 2.5) * 0.3;
    boltM.emissiveIntensity = 1.5 + Math.sin(t * 10) * 0.5;
    for (let i = 0; i < haloArcs.length; i++) haloArcs[i].visible = gate(t + i * 0.2, 0.9, 6) > 0.2;
    for (let i = 0; i < drums.length; i++) { const a = (i / 5) * Math.PI * 2 + t * 0.5; drums[i].position.set(Math.cos(a) * 0.72, 0.7 + Math.sin(a * 2 + t) * 0.15, Math.sin(a) * 0.72); drums[i].rotation.x = t * 2 + i; }
    const beat = Math.sin(t * 1.8);
    wings[0].rotation.x = beat * 0.4; wings[1].rotation.x = -beat * 0.4;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// SPARKMOTE — a dust mote that drifted through a storm and came
// out giggling. A tiny pale glimmer of static with an enormous
// happy face, a fuzz of micro-sparks and a perpetual case of the
// giggles that makes it bob and spin in delighted little loops.
// ============================================================
function buildSparkmote(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.6;
  g.add(core);

  const glowM = std({ color: 0xfff0a8, emissive: 0xfff0a8, emissiveIntensity: 1.4, roughness: 0.25, transparent: true, opacity: 0.92 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.8, roughness: 0.2 });

  const body = orb(glowM, 0.16, 0, 0, 0, 1, 1, 1, 12, 10);
  body.userData.noShadow = true;
  core.add(body);
  // micro spark fuzz
  const fuzz: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = spike(glowM, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0, Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0, 0.015); sp.userData.noShadow = true; core.add(sp); fuzz.push(sp); }
  // big happy eyes
  const eyeL = makeEye(0.05, 0x3a3a2a, { glow: 0.2, sclera: 0xffffff });
  const eyeR = makeEye(0.05, 0x3a3a2a, { glow: 0.2, sclera: 0xffffff });
  eyeL.position.set(0.12, 0.04, 0.06); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.12, 0.04, -0.06); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12, Math.PI), std({ color: 0x6a5a2a, roughness: 0.6 }));
  mouth.position.set(0.15, -0.04, 0); mouth.rotation.set(Math.PI / 2, 0, Math.PI); core.add(mouth);
  // tiny arcs
  const arcs: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) { const a = i * Math.PI; const arc = boltGroup(boltM, Math.cos(a) * 0.14, 0.12, 0, Math.cos(a) * 0.3, 0.2, 0, 3, 0.008); core.add(arc); arcs.push(arc); }
  const light = new THREE.PointLight(0xfff0a8, 2, 2.5); core.add(light);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.6 + Math.sin(t * 4) * 0.06;
    core.position.x = Math.sin(t * 2) * 0.04;
    core.rotation.z = t * 1.2;
    body.scale.setScalar(1 + Math.sin(t * 10) * 0.06);
    glowM.emissiveIntensity = 1.2 + Math.sin(t * 12) * 0.4;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.2, 0.3);
    mouth.scale.setScalar(1 + Math.sin(t * 6) * 0.2);
    for (let i = 0; i < fuzz.length; i++) fuzz[i].scale.set(1, 1 + Math.sin(t * 14 + i) * 0.3, 1);
    for (let i = 0; i < arcs.length; i++) arcs[i].visible = gate(t + i * 0.3, 0.8, 5) > 0.2;
    light.intensity = 1.5 + Math.sin(t * 12) * 0.6;
  };
  return { body: g, parts: { head: core }, animate };
}

// ============================================================
// JOLTUFT — a static-charged puffball; petting it is a popular
// dare among cadets. A round ball of frizzed lemon fluff standing
// fully on end, tiny startled eyes, little feet and a permanent
// halo of static that lifts every hair it owns.
// ============================================================
function buildJoltuft(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.26;
  g.add(core);

  const fluffM = std({ map: furTex('jolt-fluff', '#f2e06e', '#c4b03a', '#fffadf', 441), emissive: 0xf2e06e, emissiveIntensity: 0.2, roughness: 0.85 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.6, roughness: 0.2 });
  const noseM = std({ color: 0x4a4020, roughness: 0.4 });

  const body = orb(fluffM, 0.24, 0, 0, 0, 1.05, 0.95, 1.0);
  core.add(body);
  // frizzed static fur standing on end
  const hairs: THREE.Mesh[] = [];
  const rh = rng(442);
  for (let i = 0; i < 40; i++) {
    const a = rh() * Math.PI * 2, b = rh() * Math.PI - Math.PI / 2;
    const dir = v3(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
    if (dir.x > 0.5 && Math.abs(dir.y) < 0.3) continue; // keep the face open
    const base = dir.clone().multiplyScalar(0.22), tip = dir.clone().multiplyScalar(0.36);
    const h = spike(fluffM, base.x, base.y, base.z, tip.x, tip.y, tip.z, 0.02);
    core.add(h); hairs.push(h);
  }
  // startled face
  const eyeL = makeEye(0.05, 0x3a3a1a, { glow: 0.3, sclera: 0xffffff });
  const eyeR = makeEye(0.05, 0x3a3a1a, { glow: 0.3, sclera: 0xffffff });
  eyeL.position.set(0.2, 0.05, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.2, 0.05, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  core.add(orb(noseM, 0.02, 0.24, -0.02, 0, 1, 0.8, 1, 6, 5));
  // little feet
  for (const sgn of [1, -1]) core.add(orb(noseM, 0.04, 0.06, -0.22, sgn * 0.1, 1, 0.7, 1.2, 7, 6));
  // static arcs
  const arcs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const arc = boltGroup(boltM, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0, 3, 0.009); core.add(arc); arcs.push(arc); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.26 + Math.abs(Math.sin(t * 3.4)) * 0.018;
    body.scale.set(1.05 + Math.sin(t * 6) * 0.03, 0.95, 1.0);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.6, 0.3);
    fluffM.emissiveIntensity = 0.15 + gate(t, 2.5, 4) * 0.4;
    for (let i = 0; i < hairs.length; i++) hairs[i].scale.set(1, 1 + Math.sin(t * 9 + i) * 0.15, 1);
    for (let i = 0; i < arcs.length; i++) arcs[i].visible = gate(t + i * 0.25, 1.0, 6) > 0.3;
  };
  return { body: g, parts: { head: core }, animate };
}

// ============================================================
// AMPYRE — it drinks lightning the way others drink water, and is
// always slightly overcaffeinated. A jittery charge-ferret in dark
// fur lit by lemon circuitry, wired whiskers, a coiled spring of a
// tail and two enormous wired-awake eyes that never quite settle.
// ============================================================
function buildAmpyre(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const furM = std({ map: stripePair('ampyre-fur', '#3a3a44', '#1c1c24', '#d9c43a', 451).map, emissive: 0xf2d23a, emissiveIntensity: 0.4, roughness: 0.75 });
  const bellyM = std({ map: furTex('ampyre-belly', '#5a5a64', '#3a3a44', '#8a8a94', 452), roughness: 0.8 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.4, roughness: 0.2 });
  const noseM = std({ color: 0x14141a, roughness: 0.4 });

  // lithe ferret body, slightly reared
  const chest = orb(furM, 0.2, 0.16, 0.62, 0, 0.95, 1.1, 0.85);
  core.add(chest);
  core.add(orb(furM, 0.18, -0.06, 0.5, 0, 1.1, 1.0, 0.82));
  core.add(orb(bellyM, 0.12, 0.18, 0.56, 0, 0.9, 1.0, 0.78));

  // head
  const head = new THREE.Group();
  head.position.set(0.32, 0.86, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(furM, 0.14, 0, 0, 0, 1.1, 0.92, 1));
  head.add(bone(bellyM, 0.1, -0.03, 0, 0.24, -0.06, 0, 0.055, 0.035));
  head.add(orb(noseM, 0.022, 0.25, -0.05, 0, 1.1, 0.8, 1, 7, 6));
  for (const sgn of [1, -1]) head.add(orb(furM, 0.05, -0.02, 0.12, sgn * 0.1, 1, 1, 0.6, 8, 6)); // round ears
  const eyeL = makeEye(0.06, 0xf2e06e, { glow: 1.0 });
  const eyeR = makeEye(0.06, 0xf2e06e, { glow: 1.0 });
  eyeL.position.set(0.11, 0.05, 0.08); eyeL.rotation.y = -0.38;
  eyeR.position.set(0.11, 0.05, -0.08); eyeR.rotation.y = 0.38;
  head.add(eyeL, eyeR);
  // wired whiskers
  for (const sgn of [1, -1]) for (const wy of [-0.01, -0.04]) head.add(spike(boltM, 0.2, wy, sgn * 0.04, 0.32, wy + 0.02, sgn * 0.14, 0.006));

  // little arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const arm = new THREE.Group(); arm.position.set(0.16, 0.6, sgn * 0.16); arm.add(bone(furM, 0, 0, 0, 0.08, -0.18, sgn * 0.02, 0.04, 0.025)); core.add(arm); arms.push(arm); }
  // legs
  for (const sgn of [1, -1]) core.add(orb(noseM, 0.045, 0.06, 0.12, sgn * 0.12, 1, 0.7, 1.2, 7, 6));

  // coiled spring tail
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.5, 0);
  tail.name = 'tail';
  core.add(tail);
  let tx = 0, ty = 0, tz = 0;
  for (let i = 0; i < 8; i++) { const a = i * 1.1; const nx = -i * 0.05, ny = 0.06 + Math.sin(a) * 0.1, nz = Math.cos(a) * 0.1; tail.add(bone(furM, tx, ty, tz, nx, ny, nz, 0.035 - i * 0.002, 0.03 - i * 0.002)); tx = nx; ty = ny; tz = nz; }

  finishShadows(g);
  const animate = (t: number) => {
    const jitter = Math.sin(t * 18) * 0.01 + Math.sin(t * 7) * 0.01;
    core.position.y = Math.abs(Math.sin(t * 4)) * 0.03 + jitter;
    core.rotation.z = Math.sin(t * 9) * 0.02;
    head.rotation.y = Math.sin(t * 3.5) * 0.3 + Math.sin(t * 11) * 0.05; // darting glances
    head.rotation.x = Math.sin(t * 5) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 1.8, 0.2); // rapid blinks
    furM.emissiveIntensity = 0.35 + gate(t, 1.6, 4) * 0.5;
    arms[0].rotation.x = Math.sin(t * 12) * 0.3; arms[1].rotation.x = -Math.sin(t * 12 + 1) * 0.3;
    tail.rotation.z = Math.sin(t * 6) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// TESLARCH — a crowned storm-falcon before whom signal towers bow
// their antennae, or melt. A regal raptor in brass-gold plumage
// with an antenna-crown crackling between its prongs, conductive
// wing-rods and a tail like a transmission mast.
// ============================================================
function buildTeslarch(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const plumeM = std({ map: featherTex('tesla-plume', '#b09a22', '#6a5a10', '#f2e06e', 461), emissive: 0xf2d23a, emissiveIntensity: 0.3, roughness: 0.55 });
  const brassM = std({ map: metalTex('tesla-brass', '#b8922a', '#6a5210', '#f2d27a', 462), roughness: 0.4, metalness: 0.6 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.7, roughness: 0.2 });
  const wingMat = std({ map: featherTex('tesla-wing', '#a8901e', '#6a5810', '#f2e06e', 463), emissive: 0xf2d23a, emissiveIntensity: 0.35, roughness: 0.55, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.26, 0.06, 0.52, 0, 0.95, 1.15, 0.92);
  core.add(torso);
  core.add(orb(plumeM, 0.2, 0.12, 0.76, 0, 0.9, 0.95, 0.88));

  // head + antenna crown
  const head = new THREE.Group();
  head.position.set(0.2, 1.0, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.12, 0.82, 0, 0.18, 0.96, 0, 0.09, 0.07));
  head.add(orb(plumeM, 0.15, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(brassM, 0.1, -0.02, 0, 0.3, -0.05, 0, 0.05, 0.012));
  const eyeL = makeEye(0.048, 0x6ec4f2, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.048, 0x6ec4f2, { glow: 1.2, slit: true });
  eyeL.position.set(0.1, 0.04, 0.09); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.04, -0.09); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);
  // antenna crown prongs
  const prongs: THREE.Vector3[] = [];
  for (const [z, h] of [[0, 0.3], [0.07, 0.24], [-0.07, 0.24]] as const) { head.add(bone(brassM, -0.02, 0.12, z, -0.06, 0.12 + h, z, 0.012, 0.008)); head.add(orb(boltM, 0.02, -0.06, 0.12 + h, z, 1, 1, 1, 6, 5)); prongs.push(v3(-0.06, 0.12 + h, z)); }
  const crownArc = boltGroup(boltM, prongs[1].x, prongs[1].y, prongs[1].z, prongs[2].x, prongs[2].y, prongs[2].z, 3, 0.008); head.add(crownArc);

  // conductive rod wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.0, 0.64, sgn * 0.2);
    for (let i = 0; i < 4; i++) { const len = 0.66 - i * 0.1; const f = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), wingMat); f.position.set(-0.04 - i * 0.04, 0.04 + i * 0.12, 0); f.rotation.set(Math.PI / 2, 0, sgn * (0.3 + i * 0.18)); f.scale.set(0.28, 1, 1); f.userData.noShadow = true; w.add(f); }
    w.add(spike(brassM, 0, 0.1, 0, -0.36, 0.5, 0, 0.014)); // leading rod
    core.add(w); wings.push(w);
  }

  // transmission-mast tail
  const tail = new THREE.Group();
  tail.position.set(-0.24, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(brassM, 0, 0, 0, -0.4, -0.06, 0, 0.018, 0.006));
  for (let k = 0; k < 3; k++) { const cx = -0.12 - k * 0.1; tail.add(bone(brassM, cx, -0.02 - k * 0.01, 0.1, cx, -0.02 - k * 0.01, -0.1, 0.008, 0.008)); }
  tail.add(orb(boltM, 0.025, -0.4, -0.06, 0, 1, 1, 1, 6, 5));

  for (const sgn of [1, -1]) { core.add(bone(brassM, 0.08, 0.3, sgn * 0.11, 0.12, 0.06, sgn * 0.12, 0.04, 0.025)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(brassM, 0.12, 0.06, sgn * 0.12 + cz, 0.22, 0.02, sgn * 0.12 + cz, 0.012)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.5 + Math.sin(t * 1.9) * 0.04;
    torso.scale.set(0.95, 1.15 + Math.sin(t * 2.4) * 0.03, 0.92);
    head.rotation.y = Math.sin(t * 0.7) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.5, 0.8);
    boltM.emissiveIntensity = 1.4 + Math.sin(t * 11) * 0.5;
    crownArc.visible = gate(t, 0.7, 6) > 0.2;
    const beat = Math.sin(t * 2.0);
    wings[0].rotation.x = beat * 0.4; wings[1].rotation.x = -beat * 0.4;
    tail.rotation.z = Math.sin(t * 1.5) * 0.06;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// GEARMITE — a beetle that nests in old machines and purrs in
// perfect clockwork rhythm. A riveted steel carapace over brass
// gear-works that turn with its breathing, six clicking clockwork
// legs and a pair of warm amber lamp-eyes.
// ============================================================
function buildGearmite(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.22;
  g.add(core);

  const steelM = std({ map: metalTex('gear-steel', '#8a8e9a', '#4a4e58', '#c4c8d2', 471), roughness: 0.4, metalness: 0.7 });
  const brassM = std({ color: 0xc9a24a, emissive: 0xc9a24a, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.7 });
  const lampM = std({ color: 0xf2d23a, emissive: 0xf2d23a, emissiveIntensity: 1.4, roughness: 0.2 });

  // carapace
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), steelM);
  shell.scale.set(1.2, 0.9, 1.0); shell.position.y = 0.06; core.add(shell);
  // wing-case seam
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.01), std({ color: 0x2a2e38, roughness: 0.5 })); seam.position.set(0, 0.28, 0); core.add(seam);
  // exposed gears on the back
  const gears: THREE.Mesh[] = [];
  for (const [x, z, r] of [[-0.08, 0.06, 0.07], [0.04, -0.06, 0.05], [-0.12, -0.06, 0.045]] as const) {
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 8), brassM);
    gear.rotation.x = Math.PI / 2; gear.position.set(x, 0.16, z);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), brassM); tooth.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); gear.add(tooth); }
    core.add(gear); gears.push(gear);
  }

  // head with lamp eyes
  const head = new THREE.Group();
  head.position.set(0.24, 0.08, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(steelM, 0.13, 0, 0, 0, 1.0, 0.9, 1));
  const eyeL = orb(lampM, 0.05, 0.08, 0.04, 0.07, 1, 1, 1, 8, 7);
  const eyeR = orb(lampM, 0.05, 0.08, 0.04, -0.07, 1, 1, 1, 8, 7);
  head.add(eyeL, eyeR);
  // mandibles
  for (const sgn of [1, -1]) head.add(bone(brassM, 0.1, -0.04, sgn * 0.04, 0.2, -0.02, sgn * 0.02, 0.018, 0.006));
  // antennae
  for (const sgn of [1, -1]) { head.add(bone(steelM, 0.04, 0.1, sgn * 0.05, 0.14, 0.24, sgn * 0.1, 0.01, 0.006)); head.add(orb(lampM, 0.018, 0.14, 0.24, sgn * 0.1, 1, 1, 1, 6, 5)); }

  // six clockwork legs
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) for (const sgn of [1, -1]) {
    const leg = new THREE.Group();
    const lx = 0.12 - i * 0.14;
    leg.position.set(lx, 0.06, sgn * 0.18);
    leg.add(bone(brassM, 0, 0, 0, sgn * 0.1, -0.02, sgn * 0.06, 0.018, 0.012));
    leg.add(bone(steelM, sgn * 0.1, -0.02, sgn * 0.06, sgn * 0.14, -0.18, sgn * 0.08, 0.014, 0.008));
    core.add(leg); legs.push(leg);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.22 + Math.sin(t * 2.4) * 0.01;
    shell.scale.set(1.2, 0.9 + Math.sin(t * 2.4) * 0.02, 1.0); // clockwork breathing
    for (let i = 0; i < gears.length; i++) gears[i].rotation.z += (i % 2 ? -1 : 1) * 0.04 * (1 + Math.sin(t * 2.4) * 0.3);
    lampM.emissiveIntensity = 1.2 + Math.sin(t * 4.8) * 0.3; // purr pulse
    head.rotation.y = Math.sin(t * 1.2) * 0.12;
    for (let i = 0; i < legs.length; i++) { const ph = i + (i % 2) * 3; legs[i].rotation.x = Math.sin(t * 4 + ph) * 0.18; }
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// DYNAMAUL — a walking dynamo with hammer-fists; the Legion offered
// it a job, it wanted weekends. A boxy riveted-iron brute with a
// glowing copper dynamo-coil for a heart, vented shoulders and two
// enormous percussive hammer hands it grounds with a happy spark.
// ============================================================
function buildDynamaul(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const ironM = std({ map: metalTex('dyna-iron', '#6a6e7a', '#33363e', '#9aa0ac', 481), roughness: 0.45, metalness: 0.7 });
  const darkM = std({ color: 0x3a3e48, roughness: 0.5, metalness: 0.6 });
  const coilM = std({ color: 0xe8c42a, emissive: 0xf2d23a, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 });
  const sparkM = std({ color: 0x9ad8ff, emissive: 0x3a9df2, emissiveIntensity: 1.6, roughness: 0.2 });

  // boxy torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.42), ironM);
  torso.position.set(0, 1.0, 0); core.add(torso);
  // dynamo coil heart
  const coilHub = new THREE.Group(); coilHub.position.set(0.27, 1.0, 0); coilHub.rotation.y = Math.PI / 2; core.add(coilHub);
  for (let k = 0; k < 5; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 - k * 0.005, 0.018, 6, 16), coilM); ring.position.z = (k - 2) * 0.02; coilHub.add(ring); }
  coilHub.add(orb(coilM, 0.05, 0, 0, 0, 1, 1, 1, 8, 7));
  // vented shoulders
  for (const sgn of [1, -1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.26), darkM); sh.position.set(0, 1.28, sgn * 0.34); core.add(sh); for (const vy of [0.04, -0.02]) { const vent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), sparkM); vent.position.set(0, 1.3 + vy, sgn * 0.34); core.add(vent); } }

  // head
  const head = new THREE.Group();
  head.position.set(0.2, 1.4, 0);
  head.name = 'head';
  core.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.3), ironM); head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), sparkM); visor.position.set(0.14, 0.02, 0); head.add(visor);
  // grille mouth
  for (let k = 0; k < 4; k++) head.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.2), darkM).translateX(0.14).translateY(-0.08).translateZ(0).translateY(-k * 0.01));

  // hammer arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.0, 1.2, sgn * 0.4);
    arm.add(bone(ironM, 0, 0, 0, 0.04, -0.42, sgn * 0.06, 0.08, 0.06));
    // hammer head
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.24), ironM); hammer.position.set(0.06, -0.56, sgn * 0.04); arm.add(hammer);
    for (const bz of [0.12, -0.12]) arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), coilM).translateX(0.06).translateY(-0.56).translateZ(sgn * 0.04 + bz * 0.0));
    arm.add(orb(sparkM, 0.04, 0.06, -0.7, sgn * 0.04, 1, 1, 1, 7, 6));
    core.add(arm); arms.push(arm);
  }

  // boxy legs
  for (const sgn of [1, -1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), ironM); leg.position.set(0, 0.4, sgn * 0.16); core.add(leg); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.24), darkM); foot.position.set(0.04, 0.06, sgn * 0.16); core.add(foot); }

  const sparkArc = boltGroup(sparkM, 0.06, 0.2, 0.4, 0.06, 0.05, 0.4, 3, 0.012); core.add(sparkArc);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.6) * 0.02;
    torso.scale.set(1, 1 + Math.sin(t * 1.6) * 0.02, 1);
    coilHub.rotation.z = t * 1.5;
    coilM.emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.4 + gate(t, 3, 4) * 0.6;
    head.rotation.y = Math.sin(t * 0.6) * 0.12;
    (visor.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 4) * 0.4;
    // hammers thump down on a slow beat
    const thump = gate(t, 3, 4);
    arms[0].rotation.x = 0.1 + thump * 0.4; arms[1].rotation.x = -0.1 - gate(t + 1.5, 3, 4) * 0.4;
    sparkArc.visible = thump > 0.4;
  };
  return { body: g, parts: { head }, animate };
}

// ---------------- shared avian wing builder ----------------
/** A layered feather wing of `n` swept pinions. Returns the wing group. */
function featherWing(mat: THREE.Material, sgn: number, n: number, baseLen: number, taper: number, spread: number): THREE.Group {
  const w = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const len = baseLen - i * taper;
    const f = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), mat);
    f.position.set(-0.04 - i * 0.04, 0.04 + i * (baseLen * 0.18), 0);
    f.rotation.set(Math.PI / 2, 0, sgn * (spread + i * 0.16));
    f.scale.set(0.3, 1, 1);
    f.userData.noShadow = true;
    w.add(f);
  }
  return w;
}

// ============================================================
// WISPRY — a fledgling of the high winds that tumbles more than it
// flies. A round teal chick swallowed by its own oversized downy
// wings, a sprig of crest-fluff, enormous hopeful eyes and a habit
// of pinwheeling sideways on every gust it misjudges.
// ============================================================
function buildWispry(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const downM = std({ map: furTex('wispry-down', '#5ac4b8', '#3a8a82', '#a8e8e0', 501), roughness: 0.85 });
  const bellyM = std({ map: furTex('wispry-belly', '#cdf2ec', '#9ad8d0', '#fff8e8', 502), roughness: 0.85 });
  const beakM = std({ color: 0xf2c14e, roughness: 0.4 });
  const wingMat = std({ map: featherTex('wispry-wing', '#5ac4b8', '#3a8a82', '#cdf2ec', 503), roughness: 0.6, side: THREE.DoubleSide });

  const body = orb(downM, 0.22, 0, 0, 0, 1.0, 1.1, 1.0);
  core.add(body);
  core.add(orb(bellyM, 0.15, 0.12, -0.04, 0, 0.9, 1.0, 0.9));

  // head fused into the body
  const head = new THREE.Group();
  head.position.set(0.08, 0.2, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(downM, 0.15, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.1, -0.02, 0, 0.24, -0.03, 0, 0.04, 0.01));
  // crest sprig
  for (const z of [0, 0.04, -0.04]) head.add(spike(downM, -0.02, 0.13, z, -0.06, 0.28, z, 0.025));
  const eyeL = makeEye(0.06, 0x2a6a62, { glow: 0.4 });
  const eyeR = makeEye(0.06, 0x2a6a62, { glow: 0.4 });
  eyeL.position.set(0.09, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.09, 0.04, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);

  // oversized downy wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const w = featherWing(wingMat, sgn, 3, 0.34, 0.05, 0.3); w.position.set(-0.02, 0.0, sgn * 0.18); core.add(w); wings.push(w); }
  // tiny feet
  for (const sgn of [1, -1]) core.add(spike(beakM, 0, -0.2, sgn * 0.06, 0.06, -0.3, sgn * 0.06, 0.012));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 2) * 0.05;
    core.rotation.z = Math.sin(t * 1.3) * 0.18; // tumbling tilt
    body.scale.set(1, 1.1 + Math.sin(t * 3) * 0.04, 1);
    head.rotation.y = Math.sin(t * 1.1) * 0.25;
    head.rotation.z = Math.sin(t * 0.9) * 0.1;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3, 0.4);
    const flap = Math.sin(t * 6);
    wings[0].rotation.x = flap * 0.6; wings[1].rotation.x = -flap * 0.6;
    wings[0].rotation.z = 0.1 + Math.abs(flap) * 0.2; wings[1].rotation.z = -0.1 - Math.abs(flap) * 0.2;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// GALEWING — its wingbeats can be heard a valley away, if it wants
// them to be. A sleek teal stormswallow built like a thrown knife:
// long swept pinions, a forked streamer tail and a calm hunter's
// face that watches the wind for the one current worth riding.
// ============================================================
function buildGalewing(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const plumeM = std({ map: featherTex('gale-plume', '#3aa89a', '#236860', '#a8e0d8', 511), roughness: 0.6 });
  const bellyM = std({ map: furTex('gale-belly', '#cfeee8', '#9ad0c8', '#fff8e0', 512), roughness: 0.8 });
  const beakM = std({ color: 0xf2e0a8, roughness: 0.4 });
  const wingMat = std({ map: featherTex('gale-wing', '#3aa89a', '#1c5e56', '#7adfd0', 513), roughness: 0.55, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.26, 0.06, 0.42, 0, 0.92, 1.25, 0.9);
  core.add(torso);
  core.add(orb(bellyM, 0.17, 0.14, 0.36, 0, 0.85, 1.0, 0.82));

  const head = new THREE.Group();
  head.position.set(0.2, 0.86, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.12, 0.7, 0, 0.18, 0.82, 0, 0.09, 0.07));
  head.add(orb(plumeM, 0.14, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.1, -0.02, 0, 0.3, -0.04, 0, 0.05, 0.012));
  // swept crest
  for (const z of [0, 0.04, -0.04]) head.add(spike(plumeM, -0.04, 0.1, z, -0.22, 0.18, z, 0.02));
  const eyeL = makeEye(0.046, 0xf2c14e, { glow: 0.7, slit: true });
  const eyeR = makeEye(0.046, 0xf2c14e, { glow: 0.7, slit: true });
  eyeL.position.set(0.1, 0.04, 0.09); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.04, -0.09); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);

  // long swept wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const w = featherWing(wingMat, sgn, 5, 0.7, 0.1, 0.25); w.position.set(0.0, 0.5, sgn * 0.2); core.add(w); wings.push(w); }

  // forked streamer tail
  const tail = new THREE.Group();
  tail.position.set(-0.22, 0.36, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8, 0, Math.PI * 0.3), wingMat); f.position.set(-0.1, -0.04, 0); f.rotation.set(Math.PI / 2, sgn * 0.5, Math.PI / 2); f.scale.set(0.16, 1, 1); f.userData.noShadow = true; tail.add(f); }

  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.08, 0.26, sgn * 0.1, 0.1, 0.06, sgn * 0.11, 0.035, 0.022)); for (const cz of [-0.03, 0.03]) core.add(spike(beakM, 0.1, 0.06, sgn * 0.11 + cz, 0.18, 0.02, sgn * 0.11 + cz, 0.011)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.5 + Math.sin(t * 2) * 0.05;
    torso.scale.set(0.92, 1.25 + Math.sin(t * 2.6) * 0.03, 0.9);
    head.rotation.y = Math.sin(t * 0.8) * 0.24;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4, 0.6);
    const beat = Math.sin(t * 2.6);
    wings[0].rotation.x = beat * 0.55; wings[1].rotation.x = -beat * 0.55;
    wings[0].rotation.z = 0.1 + Math.abs(beat) * 0.14; wings[1].rotation.z = -0.1 - Math.abs(beat) * 0.14;
    tail.rotation.z = Math.sin(t * 1.6) * 0.12;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// CYCLONIX — it nests in the eye of standing storms it builds
// itself. A teal stormhawk wrapped in two slow-turning rings of
// wind, a spiral-vortex tail and a serene eye at the center of its
// own perpetual cyclone.
// ============================================================
function buildCyclonix(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const plumeM = std({ map: featherTex('cyc-plume', '#2a8a7a', '#175048', '#5acfc0', 521), roughness: 0.6 });
  const bellyM = std({ map: furTex('cyc-belly', '#b8ece4', '#88c4ba', '#f2fbf8', 522), roughness: 0.8 });
  const beakM = std({ color: 0xf2c14e, roughness: 0.4 });
  const windMat = finMat('cyc-wind', [90, 207, 192], [230, 250, 246], 0.4);
  const wingMat = std({ map: featherTex('cyc-wing', '#2a8a7a', '#143e38', '#5acfc0', 523), roughness: 0.55, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.27, 0.06, 0.46, 0, 0.95, 1.2, 0.92);
  core.add(torso);
  core.add(orb(bellyM, 0.18, 0.14, 0.4, 0, 0.85, 1.0, 0.84));

  const head = new THREE.Group();
  head.position.set(0.2, 0.94, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.12, 0.74, 0, 0.18, 0.9, 0, 0.1, 0.08));
  head.add(orb(plumeM, 0.15, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.1, -0.02, 0, 0.3, -0.04, 0, 0.05, 0.012));
  for (const z of [0, 0.05, -0.05]) head.add(spike(plumeM, -0.04, 0.12, z, -0.24, 0.24, z, 0.022));
  const eyeL = makeEye(0.05, 0xf2c14e, { glow: 0.9, slit: true });
  const eyeR = makeEye(0.05, 0xf2c14e, { glow: 0.9, slit: true });
  eyeL.position.set(0.1, 0.05, 0.1); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.05, -0.1); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);

  // swept wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const w = featherWing(wingMat, sgn, 5, 0.66, 0.09, 0.28); w.position.set(0.0, 0.6, sgn * 0.22); core.add(w); wings.push(w); }

  // two slow wind rings
  const rings: THREE.Mesh[] = [];
  for (const [r, y, tilt] of [[0.6, 0.6, Math.PI / 2.1], [0.46, 0.85, Math.PI / 2.6]] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 32), windMat);
    ring.rotation.x = tilt; ring.position.set(0.06, y, 0); ring.userData.noShadow = true;
    core.add(ring); rings.push(ring);
  }

  // spiral vortex tail
  const tail = new THREE.Group();
  tail.position.set(-0.24, 0.4, 0);
  tail.name = 'tail';
  core.add(tail);
  const vanes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const v = new THREE.Mesh(new THREE.CircleGeometry(0.34, 8, 0, Math.PI * 0.4), wingMat); v.position.set(-0.06, 0, 0); v.rotation.set(Math.PI / 2, a, Math.PI / 2); v.scale.set(0.16, 1, 1); v.userData.noShadow = true; tail.add(v); vanes.push(v); }

  for (const sgn of [1, -1]) core.add(bone(beakM, 0.08, 0.3, sgn * 0.1, 0.12, 0.06, sgn * 0.11, 0.04, 0.025));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.8) * 0.04;
    torso.scale.set(0.95, 1.2 + Math.sin(t * 2.4) * 0.03, 0.92);
    head.rotation.y = Math.sin(t * 0.6) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    const beat = Math.sin(t * 2.2);
    wings[0].rotation.x = beat * 0.4; wings[1].rotation.x = -beat * 0.4;
    rings[0].rotation.z = t * 1.2; rings[1].rotation.z = -t * 1.6;
    tail.rotation.x = t * 2; // spinning vortex
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// TEMPESTRIX — monarch of the upper sky; maps mark its roosts as
// "no-fly". A grand storm-eagle of deep teal whose pinions are
// tipped in everlasting frost, a crown of ice-quills and a slow,
// imperial wingbeat that drags the cold down with it.
// ============================================================
function buildTempestrix(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const plumeM = std({ map: featherTex('temp-plume', '#1a6e60', '#0e413a', '#4ec4b0', 531), roughness: 0.6 });
  const bellyM = std({ map: furTex('temp-belly', '#bfeae2', '#8ac4ba', '#f2fbf8', 532), roughness: 0.8 });
  const beakM = std({ color: 0xffd24e, roughness: 0.35, metalness: 0.3 });
  const iceM = std({ color: 0xc8f0ff, emissive: 0x9adfff, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1, flatShading: true });
  const wingMat = std({ map: featherTex('temp-wing', '#1a6e60', '#0a342e', '#4ec4b0', 533), roughness: 0.55, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.3, 0.06, 0.5, 0, 0.95, 1.25, 0.95);
  core.add(torso);
  core.add(orb(bellyM, 0.2, 0.14, 0.44, 0, 0.85, 1.05, 0.85));

  const head = new THREE.Group();
  head.position.set(0.2, 1.04, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.14, 0.8, 0, 0.18, 0.98, 0, 0.11, 0.08));
  head.add(orb(plumeM, 0.17, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.1, -0.02, 0, 0.34, -0.05, 0, 0.06, 0.012));
  head.add(bone(beakM, 0.1, -0.06, 0, 0.26, -0.1, 0, 0.045, 0.01));
  // ice-quill crown
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.3; head.add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.24, 5), iceM).translateX(-0.04).translateY(0.16).translateZ(Math.sin(a) * 0.12).translateX(Math.cos(a) * 0.02)); }
  const eyeL = makeEye(0.052, 0xffe07a, { glow: 1.0, slit: true });
  const eyeR = makeEye(0.052, 0xffe07a, { glow: 1.0, slit: true });
  eyeL.position.set(0.12, 0.05, 0.11); eyeL.rotation.y = -0.32;
  eyeR.position.set(0.12, 0.05, -0.11); eyeR.rotation.y = 0.32;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.07), plumeM); brow.position.set(0.13, 0.12, sgn * 0.1); brow.rotation.z = -0.25; head.add(brow); }

  // grand frost-tipped wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(wingMat, sgn, 6, 0.82, 0.1, 0.26);
    // frost tips
    w.children.forEach((f, i) => { if (i % 2 === 0) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), iceM); tip.position.copy(f.position).add(new THREE.Vector3(-(0.82 - i * 0.1) * 0.28, 0, 0)); tip.userData.noShadow = true; w.add(tip); } });
    w.position.set(0.0, 0.64, sgn * 0.24); core.add(w); wings.push(w);
  }

  // fan tail
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, 0, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8, 0, Math.PI * 0.35), wingMat); f.position.set(-0.08, 0, 0); f.rotation.set(Math.PI / 2, sgn * 0.4, Math.PI / 2); f.scale.set(0.18, 1, 1); f.userData.noShadow = true; tail.add(f); }

  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.08, 0.32, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(beakM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.014)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.6) * 0.05;
    torso.scale.set(0.95, 1.25 + Math.sin(t * 2.2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.5) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.5, 1.2);
    iceM.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.2;
    const beat = Math.sin(t * 1.7);
    wings[0].rotation.x = beat * 0.5; wings[1].rotation.x = -beat * 0.5;
    wings[0].rotation.z = 0.1 + Math.abs(beat) * 0.12; wings[1].rotation.z = -0.1 - Math.abs(beat) * 0.12;
    tail.rotation.z = Math.sin(t * 1.4) * 0.08;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// ZEPHYRAX — a magnificent storm-bird that rules the high tropo-
// sphere, commanding hurricanes and slicing the air into ribbons.
// A sky-blue and turquoise titan with gold storm-regalia, a nebula
// mantle, frost pinions and crackling stormlight between its quills.
// ============================================================
function buildZephyrax(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.6;
  g.add(core);

  const neb = nebulaPair('zephyrax-mantle', 541);
  const plumeM = std({ map: neb.map, emissiveMap: neb.glow, emissive: 0x40e0d0, emissiveIntensity: 0.6, roughness: 0.5 });
  const skyM = std({ map: featherTex('zephyrax-sky', '#87ceeb', '#3a8ad0', '#e8f8ff', 542), emissive: 0x40e0d0, emissiveIntensity: 0.3, roughness: 0.5, side: THREE.DoubleSide });
  const goldM = std({ color: 0xffd700, emissive: 0xf2c14e, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.5 });
  const iceM = std({ color: 0xc8f0ff, emissive: 0x9adfff, emissiveIntensity: 0.8, roughness: 0.15, flatShading: true });
  const boltM = std({ color: 0xc8e0ff, emissive: 0x9ad8ff, emissiveIntensity: 1.7, roughness: 0.2 });

  const torso = orb(plumeM, 0.3, 0.06, 0.52, 0, 0.95, 1.25, 0.95);
  core.add(torso);
  core.add(orb(skyM, 0.2, 0.16, 0.6, 0, 0.85, 1.0, 0.86)); // sky breast
  for (const sgn of [1, -1]) core.add(orb(goldM, 0.1, 0.04, 0.82, sgn * 0.22, 1, 0.7, 1)); // gold gorget

  const head = new THREE.Group();
  head.position.set(0.22, 1.08, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.14, 0.84, 0, 0.2, 1.0, 0, 0.11, 0.08));
  head.add(orb(skyM, 0.17, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(goldM, 0.1, -0.02, 0, 0.34, -0.05, 0, 0.055, 0.012));
  // gold crown + ice quills
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.32; head.add(spike(goldM, -0.02, 0.14, Math.sin(a) * 0.13, -0.06, 0.42, Math.sin(a) * 0.2, 0.02)); }
  for (const sgn of [1, -1]) head.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 5), iceM).translateX(0.0).translateY(0.18).translateZ(sgn * 0.1));
  const eyeL = makeEye(0.052, 0xffe07a, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.052, 0xffe07a, { glow: 1.3, slit: true });
  eyeL.position.set(0.12, 0.05, 0.11); eyeL.rotation.y = -0.32;
  eyeR.position.set(0.12, 0.05, -0.11); eyeR.rotation.y = 0.32;
  head.add(eyeL, eyeR);

  // immense storm wings with stormlight
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(skyM, sgn, 7, 0.9, 0.1, 0.24);
    w.position.set(0.0, 0.66, sgn * 0.24);
    const arc = boltGroup(boltM, 0, 0.1, 0, -0.34, 0.6, 0, 4, 0.012); w.add(arc);
    core.add(w); wings.push(w);
  }

  // hurricane swirl tail
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.44, 0);
  tail.name = 'tail';
  core.add(tail);
  const vanes: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const v = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8, 0, Math.PI * 0.35), skyM); v.position.set(-0.06, 0, 0); v.rotation.set(Math.PI / 2, a, Math.PI / 2); v.scale.set(0.16, 1, 1); v.userData.noShadow = true; tail.add(v); vanes.push(v); }

  for (const sgn of [1, -1]) { core.add(bone(goldM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(goldM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.014)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.6 + Math.sin(t * 1.5) * 0.05;
    torso.scale.set(0.95, 1.25 + Math.sin(t * 2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.5) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.1);
    plumeM.emissiveIntensity = 0.5 + Math.sin(t * 1.6) * 0.2;
    boltM.emissiveIntensity = 1.4 + Math.sin(t * 9) * 0.5;
    const beat = Math.sin(t * 1.6);
    wings[0].rotation.x = beat * 0.5; wings[1].rotation.x = -beat * 0.5;
    for (const w of wings) { const arc = w.children[w.children.length - 1]; arc.visible = Math.abs(beat) > 0.7; }
    tail.rotation.x = t * 1.6;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// ZEPHLET — a pocket of playful air that steals hats, then returns
// them, mostly. A cheeky comma-swirl of translucent breeze with a
// grinning face, ribboned slipstream tails and a souvenir leaf or
// two it forgot to give back.
// ============================================================
function buildZephlet(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const airM = (op: number) => std({ color: 0x8ad0c8, emissive: 0x7adfd0, emissiveIntensity: 0.4, roughness: 1, transparent: true, opacity: op });
  const leafM = std({ map: leafMottle('zephlet-leaf', '#6ec45e', '#3a8a3a', '#bdf09a', 552), roughness: 0.6, side: THREE.DoubleSide });

  // swirl body — a comma of stacked shrinking orbs
  const swirl: THREE.Mesh[] = [];
  let sx = 0, sy = 0;
  for (let i = 0; i < 6; i++) { const a = i * 0.8; const l = orb(airM(0.78 - i * 0.08), 0.18 - i * 0.022, sx, sy, 0, 1, 1, 1, 10, 8); l.userData.noShadow = true; core.add(l); swirl.push(l); sx -= Math.cos(a) * 0.1; sy += Math.sin(a) * 0.06; }

  // cheeky face on the head orb
  const eyeL = makeEye(0.045, 0x2a7a72, { glow: 0.5 });
  const eyeR = makeEye(0.045, 0x2a7a72, { glow: 0.5 });
  eyeL.position.set(0.14, 0.04, 0.07); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.14, 0.04, -0.07); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), std({ color: 0x2a5a52, roughness: 0.6 }));
  grin.position.set(0.16, -0.04, 0); grin.rotation.set(Math.PI / 2, 0, Math.PI);
  core.add(grin);

  // slipstream ribbon tails
  const ribbons: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8, 0, Math.PI * 0.3), airM(0.4)); r.position.set(-0.2 - i * 0.05, -0.02 + (i - 1) * 0.08, 0); r.rotation.set(Math.PI / 2, 0, Math.PI / 2); r.scale.set(0.1, 1, 1); r.userData.noShadow = true; core.add(r); ribbons.push(r); }

  // stolen leaf souvenirs
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) { const lf = leafBlade(leafM, 0.07); core.add(lf); leaves.push(lf); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 2.4) * 0.06;
    core.position.x = Math.sin(t * 1.6) * 0.05;
    core.rotation.z = Math.sin(t * 1.2) * 0.12;
    for (let i = 0; i < swirl.length; i++) swirl[i].scale.setScalar(1 + Math.sin(t * 3 + i) * 0.06);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 2.6, 0.3);
    for (let i = 0; i < ribbons.length; i++) ribbons[i].rotation.x = Math.PI / 2 + Math.sin(t * 4 + i) * 0.3;
    for (let i = 0; i < leaves.length; i++) { const a = t * 2 + i * Math.PI; leaves[i].position.set(Math.cos(a) * 0.3, 0.05 + Math.sin(a * 1.4) * 0.1, Math.sin(a) * 0.3); leaves[i].rotation.set(a, a * 0.7, 0); }
  };
  return { body: g, parts: { head: core }, animate };
}

// ============================================================
// PLUMELET — a single downy feather's worth of bird; the wind
// carries it out of pure affection. One oversized cream plume with
// a button face, two stick legs and a contented, weightless drift.
// ============================================================
function buildPlumelet(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const downM = std({ map: furTex('plume-down', '#f2f2e8', '#cfcfc0', '#ffffff', 561), roughness: 0.9 });
  const featM = std({ map: featherTex('plume-feather', '#f2f2e8', '#c4c4b4', '#ffffff', 562), roughness: 0.7, side: THREE.DoubleSide });
  const beakM = std({ color: 0xf2c14e, roughness: 0.4 });

  // the feather body — a big upright plume
  const plume = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), featM);
  plume.scale.set(0.4, 1.3, 0.7); plume.position.y = 0.1; core.add(plume);
  // central quill
  core.add(bone(downM, 0, -0.16, 0, 0, 0.34, 0, 0.02, 0.008));
  // little down tuft head bump
  const head = new THREE.Group();
  head.position.set(0.04, 0.04, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(downM, 0.12, 0, 0, 0, 1.1, 0.95, 1));
  head.add(bone(beakM, 0.08, -0.02, 0, 0.18, -0.03, 0, 0.03, 0.008));
  const eyeL = makeEye(0.05, 0x6a8a82, { glow: 0.4 });
  const eyeR = makeEye(0.05, 0x6a8a82, { glow: 0.4 });
  eyeL.position.set(0.08, 0.03, 0.06); eyeL.rotation.y = -0.45;
  eyeR.position.set(0.08, 0.03, -0.06); eyeR.rotation.y = 0.45;
  head.add(eyeL, eyeR);
  // wisp accent at top
  const accent = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), std({ color: 0x7adfd0, emissive: 0x5acfc0, emissiveIntensity: 0.6, roughness: 0.4 }));
  accent.position.set(-0.02, 0.4, 0); core.add(accent);
  // stick legs
  for (const sgn of [1, -1]) core.add(spike(beakM, 0, -0.16, sgn * 0.04, 0.02, -0.3, sgn * 0.04, 0.01));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.5 + Math.sin(t * 1.8) * 0.08;
    core.rotation.z = Math.sin(t * 1.2) * 0.2; // drifts on the breeze
    core.rotation.y = Math.sin(t * 0.7) * 0.3;
    plume.scale.set(0.4, 1.3 + Math.sin(t * 2.4) * 0.05, 0.7);
    head.rotation.z = Math.sin(t * 1.1) * 0.1;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3, 0.4);
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// SKYDANCER — it performs aerial figures for no audience but the
// clouds, who applaud slowly. A graceful cream crane with long
// ribbon tail-streamers, poised wings held mid-flourish and the
// serene focus of a soloist who knows exactly where the wind is.
// ============================================================
function buildSkydancer(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.5;
  g.add(core);

  const plumeM = std({ map: featherTex('dancer-plume', '#e8e0d0', '#b8b0a0', '#fffaf0', 571), roughness: 0.6 });
  const accentM = std({ color: 0xe8843a, emissive: 0xe8843a, emissiveIntensity: 0.3, roughness: 0.5 });
  const beakM = std({ color: 0xe8843a, roughness: 0.4 });
  const wingMat = std({ map: featherTex('dancer-wing', '#e8e0d0', '#4ec4b0', '#fffaf0', 572), roughness: 0.55, side: THREE.DoubleSide });
  const ribbonMat = finMat('dancer-ribbon', [78, 196, 176], [255, 250, 240], 0.7);

  const torso = orb(plumeM, 0.24, 0.06, 0.5, 0, 0.9, 1.25, 0.9);
  core.add(torso);

  // long graceful neck + head
  const head = new THREE.Group();
  head.position.set(0.24, 1.1, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.1, 0.72, 0, 0.22, 1.04, 0, 0.07, 0.06));
  head.add(orb(plumeM, 0.12, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.08, -0.01, 0, 0.34, -0.02, 0, 0.03, 0.008));
  // crest plume
  for (const z of [0, 0.03, -0.03]) head.add(spike(accentM, -0.04, 0.1, z, -0.18, 0.22, z, 0.014));
  const eyeL = makeEye(0.04, 0x3a2a1a, { glow: 0.3, sclera: 0xfff4e8 });
  const eyeR = makeEye(0.04, 0x3a2a1a, { glow: 0.3, sclera: 0xfff4e8 });
  eyeL.position.set(0.08, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.08, 0.04, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);

  // poised wings, held in a flourish
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const w = featherWing(wingMat, sgn, 5, 0.66, 0.09, 0.5); w.position.set(0.0, 0.6, sgn * 0.18); core.add(w); wings.push(w); }

  // long ribbon streamers
  const tail = new THREE.Group();
  tail.position.set(-0.2, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  const ribbons: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) { const r = new THREE.Mesh(new THREE.CircleGeometry(0.7, 8, 0, Math.PI * 0.18), ribbonMat); r.position.set(-0.1, 0, 0); r.rotation.set(Math.PI / 2, sgn * 0.3, Math.PI / 2); r.scale.set(0.08, 1, 1); r.userData.noShadow = true; tail.add(r); ribbons.push(r); }

  // long legs
  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.06, 0.3, sgn * 0.1, 0.08, 0.04, sgn * 0.1, 0.02, 0.012)); core.add(spike(beakM, 0.08, 0.04, sgn * 0.1, 0.18, 0.0, sgn * 0.1, 0.01)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.5 + Math.sin(t * 1.5) * 0.06;
    core.rotation.z = Math.sin(t * 1.0) * 0.08; // dancing sway
    torso.scale.set(0.9, 1.25 + Math.sin(t * 2) * 0.03, 0.9);
    head.rotation.y = Math.sin(t * 0.7) * 0.3;
    head.rotation.z = Math.sin(t * 1.2) * 0.15;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4, 0.6);
    const flourish = Math.sin(t * 1.6);
    wings[0].rotation.x = flourish * 0.35; wings[1].rotation.x = -flourish * 0.35;
    wings[0].rotation.z = 0.2 + flourish * 0.2; wings[1].rotation.z = -0.2 - flourish * 0.2;
    for (let i = 0; i < ribbons.length; i++) ribbons[i].rotation.x = Math.PI / 2 + Math.sin(t * 2 + i) * 0.4;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// STRATOROC — a roc of the stratosphere whose shadow has its own
// weather report. A vast broad-winged colossus in cloud-tan
// plumage, a great hooked beak, and slow oceanic wingbeats that
// trail wisps of condensation off every pinion.
// ============================================================
function buildStratoroc(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const plumeM = std({ map: featherTex('strato-plume', '#c8c0a8', '#8a8268', '#f2ecd8', 581), roughness: 0.65 });
  const bellyM = std({ map: furTex('strato-belly', '#e8e2cf', '#bcb49a', '#fffaf0', 582), roughness: 0.8 });
  const beakM = std({ color: 0xf2c14e, roughness: 0.35, metalness: 0.2 });
  const wingMat = std({ map: featherTex('strato-wing', '#c8c0a8', '#7a7258', '#2a8a7a', 583), roughness: 0.6, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.32, 0.06, 0.52, 0, 0.95, 1.2, 0.98);
  core.add(torso);
  core.add(orb(bellyM, 0.22, 0.14, 0.46, 0, 0.88, 1.05, 0.88));

  const head = new THREE.Group();
  head.position.set(0.22, 1.06, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.14, 0.82, 0, 0.2, 1.0, 0, 0.12, 0.09));
  head.add(orb(plumeM, 0.18, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(beakM, 0.12, -0.02, 0, 0.4, -0.06, 0, 0.07, 0.014));
  head.add(bone(beakM, 0.12, -0.07, 0, 0.3, -0.13, 0, 0.05, 0.01)); // hook
  const eyeL = makeEye(0.05, 0xf2c14e, { glow: 0.9, slit: true });
  const eyeR = makeEye(0.05, 0xf2c14e, { glow: 0.9, slit: true });
  eyeL.position.set(0.13, 0.06, 0.12); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.06, -0.12); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.08), plumeM); brow.position.set(0.14, 0.13, sgn * 0.11); brow.rotation.z = -0.28; head.add(brow); }

  // vast broad wings
  const wings: THREE.Group[] = [];
  const wisps: THREE.Mesh[][] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(wingMat, sgn, 7, 0.95, 0.11, 0.22);
    w.position.set(0.0, 0.62, sgn * 0.26); core.add(w); wings.push(w);
    const ws: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { const p = orb(std({ color: 0xf2f2ec, transparent: true, opacity: 0.35, roughness: 1 }), 0.08, 0, 0, 0, 1, 0.6, 1, 7, 6); p.userData.noShadow = true; w.add(p); ws.push(p); }
    wisps.push(ws);
  }

  const tail = new THREE.Group();
  tail.position.set(-0.28, 0.44, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, 0, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8, 0, Math.PI * 0.32), wingMat); f.position.set(-0.1, 0, 0); f.rotation.set(Math.PI / 2, sgn * 0.35, Math.PI / 2); f.scale.set(0.2, 1, 1); f.userData.noShadow = true; tail.add(f); }

  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.05, 0.03)); for (const cz of [-0.05, 0, 0.05]) core.add(spike(beakM, 0.12, 0.06, sgn * 0.13 + cz, 0.26, 0.02, sgn * 0.13 + cz, 0.016)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.3) * 0.06;
    torso.scale.set(0.95, 1.2 + Math.sin(t * 1.8) * 0.03, 0.98);
    head.rotation.y = Math.sin(t * 0.45) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.4);
    const beat = Math.sin(t * 1.3);
    wings[0].rotation.x = beat * 0.55; wings[1].rotation.x = -beat * 0.55;
    wings[0].rotation.z = 0.08 + Math.abs(beat) * 0.12; wings[1].rotation.z = -0.08 - Math.abs(beat) * 0.12;
    for (let s = 0; s < wisps.length; s++) for (let i = 0; i < wisps[s].length; i++) { const ph = (t * 0.6 + i / 3 + s * 0.3) % 1; wisps[s][i].position.set(-(0.3 + ph * 0.6), 0.2 + i * 0.2, 0); (wisps[s][i].material as THREE.MeshStandardMaterial).opacity = 0.35 * (1 - ph) * Math.abs(beat); }
    tail.rotation.z = Math.sin(t * 1.1) * 0.06;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// EMPYRHAWK — it hunts above the sky's ceiling, where the blue
// runs out; few have seen it land, none twice. A lean cream-and-
// teal high-altitude hawk with sun-gold flight feathers, blade-
// swept wings and the still, total focus of an apex predator.
// ============================================================
function buildEmpyrhawk(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const plumeM = std({ map: featherTex('empyr-plume', '#f2ead0', '#c4bc9c', '#fffbf0', 591), roughness: 0.6 });
  const tealM = std({ map: featherTex('empyr-teal', '#1a6e60', '#0e413a', '#4ec4b0', 592), roughness: 0.55, side: THREE.DoubleSide });
  const goldM = std({ color: 0xffd24e, emissive: 0xf2c14e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.3 });

  const torso = orb(plumeM, 0.28, 0.06, 0.5, 0, 0.92, 1.22, 0.92);
  core.add(torso);
  core.add(orb(std({ map: featherTex('empyr-mantle', '#1a6e60', '#0e413a', '#4ec4b0', 593), roughness: 0.6 }), 0.22, -0.06, 0.62, 0, 0.9, 0.95, 0.9)); // teal mantle

  const head = new THREE.Group();
  head.position.set(0.22, 1.04, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.13, 0.8, 0, 0.19, 0.98, 0, 0.1, 0.08));
  head.add(orb(plumeM, 0.16, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(goldM, 0.1, -0.02, 0, 0.34, -0.06, 0, 0.055, 0.012));
  head.add(bone(goldM, 0.1, -0.07, 0, 0.26, -0.12, 0, 0.04, 0.01)); // hook
  // sun-gold brow streak
  for (const sgn of [1, -1]) head.add(spike(goldM, -0.02, 0.1, sgn * 0.08, -0.14, 0.18, sgn * 0.14, 0.016));
  const eyeL = makeEye(0.05, 0xffe07a, { glow: 1.1, slit: true });
  const eyeR = makeEye(0.05, 0xffe07a, { glow: 1.1, slit: true });
  eyeL.position.set(0.12, 0.05, 0.11); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.12, 0.05, -0.11); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.07), tealM); brow.position.set(0.13, 0.12, sgn * 0.1); brow.rotation.z = -0.3; head.add(brow); }

  // blade-swept wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(tealM, sgn, 6, 0.84, 0.11, 0.2);
    // gold leading tips
    w.children.forEach((f, i) => { if (i >= 4) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), goldM); tip.position.copy(f.position).add(new THREE.Vector3(-(0.84 - i * 0.11) * 0.28, 0, 0)); tip.userData.noShadow = true; w.add(tip); } });
    w.position.set(0.0, 0.62, sgn * 0.24); core.add(w); wings.push(w);
  }

  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, 0, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.46, 8, 0, Math.PI * 0.28), tealM); f.position.set(-0.08, 0, 0); f.rotation.set(Math.PI / 2, sgn * 0.3, Math.PI / 2); f.scale.set(0.16, 1, 1); f.userData.noShadow = true; tail.add(f); }

  for (const sgn of [1, -1]) { core.add(bone(goldM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(goldM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.015)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.7) * 0.05;
    torso.scale.set(0.92, 1.22 + Math.sin(t * 2.2) * 0.025, 0.92);
    head.rotation.y = Math.sin(t * 0.4) * 0.16; // still, focused
    head.rotation.x = -gate(t, 8, 8) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.9 * blinkAt(t, 7, 2.0);
    goldM.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.15;
    const beat = Math.sin(t * 1.8);
    wings[0].rotation.x = beat * 0.45; wings[1].rotation.x = -beat * 0.45;
    wings[0].rotation.z = 0.06 + Math.abs(beat) * 0.1; wings[1].rotation.z = -0.06 - Math.abs(beat) * 0.1;
    tail.rotation.z = Math.sin(t * 1.4) * 0.06;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// DRIFTLING — a scrap of cloud that fell asleep below the mountains
// and never found its way home. A soft white puff with heavy-lidded
// drowsy eyes, slow trailing wisps and the gentle list of something
// dozing on a current it has stopped trying to understand.
// ============================================================
function buildDriftling(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const cloudM = (op: number) => std({ color: 0xeef4fa, emissive: 0xd8e8f2, emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: op });

  const lobes: THREE.Mesh[] = [];
  for (const [x, y, z, r, op] of [[0, 0, 0, 0.24, 0.85], [0.13, 0.05, 0.07, 0.17, 0.78], [-0.13, 0.04, -0.06, 0.18, 0.78], [0.03, -0.08, -0.11, 0.15, 0.7], [-0.05, -0.06, 0.13, 0.15, 0.7], [0.0, 0.12, 0, 0.14, 0.72]] as const) {
    const l = orb(cloudM(op), r, x, y, z, 1, 0.92, 1, 12, 10); l.userData.noShadow = true; core.add(l); lobes.push(l);
  }

  const head = core;
  const eyeL = makeEye(0.05, 0x7adfd0, { glow: 0.4 });
  const eyeR = makeEye(0.05, 0x7adfd0, { glow: 0.4 });
  eyeL.position.set(0.2, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.2, 0.04, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  // heavy lids
  for (const sgn of [1, -1]) { const lid = orb(cloudM(0.9), 0.055, 0.21, 0.06, sgn * 0.08, 1, 0.6, 1, 8, 6); core.add(lid); }

  // trailing sleepy wisps
  const wisps: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) { const w = new THREE.Group(); w.position.set(-0.16, -0.02 - i * 0.06, (i - 1) * 0.08); let lx = 0, ly = 0; for (let j = 0; j < 3; j++) { const nx = lx - 0.1, ny = ly - 0.03; w.add(bone(cloudM(0.5 - j * 0.12), lx, ly, 0, nx, ny, 0, 0.05 - j * 0.012, 0.04 - j * 0.012)); lx = nx; ly = ny; } core.add(w); wisps.push(w); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 1.1) * 0.05;
    core.rotation.z = Math.sin(t * 0.7) * 0.06; // dozing list
    for (let i = 0; i < lobes.length; i++) lobes[i].scale.set(1 + Math.sin(t * 1.6 + i) * 0.04, 0.92, 1);
    // slow, heavy blinks — mostly closed
    eyeL.scale.y = eyeR.scale.y = (1 - 0.95 * blinkAt(t, 3.5, 0.6)) * (0.5 + 0.5 * Math.max(0, Math.sin(t * 0.5)));
    for (let i = 0; i < wisps.length; i++) wisps[i].rotation.z = Math.sin(t * 1.0 + i * 0.7) * 0.18;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// NIMBUSYL — a pocket thunderhead with opinions; it rains only on
// the deserving. A grumpy little storm-cloud, dark-bottomed and
// scowling, grumbling a fork of lightning and a curtain of rain
// from its underside at anyone it has decided has earned it.
// ============================================================
function buildNimbusyl(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const topM = (op: number) => std({ color: 0xdce8f4, emissive: 0xb8d0e8, emissiveIntensity: 0.2, roughness: 1, transparent: true, opacity: op });
  const darkM = std({ color: 0x6a7a90, roughness: 1, transparent: true, opacity: 0.9 });
  const boltM = std({ color: 0x9ad8ff, emissive: 0x6ec4f2, emissiveIntensity: 1.8, roughness: 0.2 });
  const rainM = std({ color: 0x8ac0e8, emissive: 0x5ab8e8, emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0.7 });

  // billowing cloud top
  const lobes: THREE.Mesh[] = [];
  for (const [x, y, z, r, op] of [[0, 0.1, 0, 0.3, 0.85], [0.18, 0.14, 0.08, 0.2, 0.8], [-0.18, 0.12, -0.07, 0.22, 0.8], [0.06, 0.24, -0.1, 0.18, 0.78], [-0.08, 0.22, 0.12, 0.17, 0.78]] as const) {
    const l = orb(topM(op), r, x, y, z, 1, 0.85, 1, 12, 10); l.userData.noShadow = true; core.add(l); lobes.push(l);
  }
  // dark rainy underside
  const base = orb(darkM, 0.32, 0, -0.04, 0, 1.1, 0.45, 1.0);
  base.userData.noShadow = true; core.add(base);

  // grumpy face
  const eyeL = makeEye(0.05, 0x3a4a5a, { glow: 0.3, sclera: 0xe8f0f8 });
  const eyeR = makeEye(0.05, 0x3a4a5a, { glow: 0.3, sclera: 0xe8f0f8 });
  eyeL.position.set(0.22, 0.06, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.22, 0.06, -0.08); eyeR.rotation.y = 0.4;
  core.add(eyeL, eyeR);
  // scowl brows
  for (const sgn of [1, -1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.06), darkM); brow.position.set(0.24, 0.13, sgn * 0.08); brow.rotation.z = sgn * 0.4; core.add(brow); }
  const frown = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), darkM);
  frown.position.set(0.25, -0.06, 0); frown.rotation.set(Math.PI / 2, 0, 0);
  core.add(frown);

  // grumbling lightning fork + rain curtain underneath
  const bolt = boltGroup(boltM, 0.0, -0.2, 0, 0.04, -0.5, 0, 4, 0.018);
  core.add(bolt);
  const rains: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), rainM); const a = (i / 6) * Math.PI * 2; r.position.set(Math.cos(a) * 0.16, -0.3, Math.sin(a) * 0.14); r.userData.noShadow = true; core.add(r); rains.push(r); }
  const light = new THREE.PointLight(0x6ec4f2, 0, 2.5); light.position.y = -0.3; core.add(light);

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.62 + Math.sin(t * 1.3) * 0.04;
    core.rotation.z = Math.sin(t * 0.9) * 0.04;
    for (let i = 0; i < lobes.length; i++) lobes[i].scale.set(1 + Math.sin(t * 1.8 + i) * 0.04, 0.85, 1);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.4, 0.5);
    const storm = gate(t, 3, 4);
    bolt.visible = storm > 0.4;
    boltM.emissiveIntensity = 1.4 + Math.sin(t * 12) * 0.5;
    light.intensity = storm * 4;
    for (let i = 0; i < rains.length; i++) { const ph = (t * 1.8 + i / rains.length) % 1; rains[i].position.y = -0.22 - ph * 0.3; (rains[i].material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - ph) * (0.4 + storm); }
  };
  return { body: g, parts: { head: core }, animate };
}

// ---------------- umbral texture painters ----------------
/** Dusty moth wing: shaded membrane with wavy bands and glowing eyespots. */
function mothWing(key: string, base: string, dark: string, lite: string, eye: string, seed: number): THREE.Texture {
  return ctex(key, 256, (ctx, s) => {
    const rnd = rng(seed);
    const grd = ctx.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, lite); grd.addColorStop(0.5, base); grd.addColorStop(1, dark);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = rnd() < 0.5 ? dark : lite; ctx.globalAlpha = 0.05 + rnd() * 0.12; ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = dark; ctx.lineWidth = 4;
    for (let b = 0; b < 4; b++) { const y = s * (0.2 + b * 0.2); ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= s; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.04 + b) * 10); ctx.stroke(); }
    for (const [ex, ey, er] of [[s * 0.5, s * 0.4, s * 0.16], [s * 0.3, s * 0.72, s * 0.1]] as const) {
      const g2 = ctx.createRadialGradient(ex, ey, 1, ex, ey, er);
      g2.addColorStop(0, '#000'); g2.addColorStop(0.5, eye); g2.addColorStop(0.72, '#000'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    }
  });
}
/** An oval moth wing mesh from a flattened disc. */
function mothWingMesh(mat: THREE.Material, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 18), mat);
  m.scale.set(w, h, 1); m.userData.noShadow = true;
  return m;
}

// ============================================================
// SHADEKIT — a kitten-shaped piece of dusk that hides in your
// shadow when shy. A small wisp of violet half-dark with glowing
// rose eyes, ears tipped in dissolving smoke and a tail that frays
// away into shadow the longer you look at it.
// ============================================================
function buildShadekit(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const shadeM = std({ color: 0x5a3a8a, emissive: 0x3a1a6a, emissiveIntensity: 0.4, roughness: 0.7, transparent: true, opacity: 0.92 });
  const deepM = std({ color: 0x3a2060, emissive: 0x2a1050, emissiveIntensity: 0.3, roughness: 0.75, transparent: true, opacity: 0.9 });
  const glowM = std({ color: 0xf25aa8, emissive: 0xf25aa8, emissiveIntensity: 1.2, roughness: 0.3 });

  const chest = orb(shadeM, 0.2, 0.16, 0.42, 0, 1.0, 1.05, 0.88);
  core.add(chest);
  core.add(orb(shadeM, 0.18, -0.08, 0.4, 0, 1.1, 0.95, 0.85));
  core.add(orb(deepM, 0.12, 0.16, 0.34, 0, 0.9, 0.9, 0.78));

  const head = new THREE.Group();
  head.position.set(0.32, 0.6, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(shadeM, 0.15, 0, 0, 0, 1.1, 0.92, 1));
  // smoke-tipped ears
  for (const sgn of [1, -1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), shadeM); ear.position.set(-0.02, 0.16, sgn * 0.08); ear.rotation.x = -sgn * 0.2; head.add(ear); head.add(orb(deepM, 0.03, -0.02, 0.24, sgn * 0.08, 1, 1.4, 1, 6, 5)); }
  const eyeL = makeEye(0.06, 0xf25aa8, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.06, 0xf25aa8, { glow: 1.3, slit: true });
  eyeL.position.set(0.11, 0.04, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.11, 0.04, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // wispy whiskers
  for (const sgn of [1, -1]) head.add(spike(glowM, 0.13, -0.02, sgn * 0.04, 0.26, 0.0, sgn * 0.12, 0.005));

  // legs
  for (const [hx, hz, rear] of [[0.26, 0.13, false], [0.26, -0.13, false], [-0.16, 0.14, true], [-0.16, -0.14, true]] as const) {
    core.add(bone(shadeM, hx, rear ? 0.3 : 0.34, hz, hx + 0.01, 0.06, hz, 0.05, 0.03));
  }

  // tail that frays into shadow
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.46, 0);
  tail.name = 'tail';
  core.add(tail);
  const tailSegs: THREE.Mesh[] = [];
  let tx = 0, ty = 0;
  for (let i = 0; i < 5; i++) { const seg = orb(i < 3 ? shadeM : deepM, 0.05 - i * 0.008, tx, ty, 0, 1, 1, 1, 8, 6); seg.userData.noShadow = i >= 3; tail.add(seg); tailSegs.push(seg); tx -= 0.08; ty += 0.05 - i * 0.005; }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2.2) * 0.018;
    chest.scale.set(1.0, 1.05 + Math.sin(t * 2.4) * 0.04, 0.88);
    head.rotation.y = Math.sin(t * 0.7) * 0.26;
    head.rotation.z = Math.sin(t * 1.3) * 0.06;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.6, 0.5);
    glowM.emissiveIntensity = 1.0 + Math.sin(t * 2.6) * 0.3;
    tail.rotation.y = Math.sin(t * 1.8) * 0.4;
    for (let i = 0; i < tailSegs.length; i++) { tailSegs[i].position.y = (0.05 - i * 0.005) * 0 + Math.sin(t * 2 - i * 0.5) * 0.02 + i * 0.04; if (i >= 3) (tailSegs[i].material as THREE.MeshStandardMaterial).opacity = 0.6 + Math.sin(t * 3 + i) * 0.3; }
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// DUSKFANG — it walks between lamplights without ever touching the
// bright. A lithe violet shadow-panther edged in dissolving murk,
// magenta war-paint glowing along its flanks and a pair of long
// luminous fangs that are the only thing the dark gives away.
// ============================================================
function buildDuskfang(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const coatM = std({ map: stripePair('dusk-coat', '#4a2a7a', '#2a1450', '#8a4ae0', 611).map, emissive: 0x4a2a7a, emissiveIntensity: 0.35, roughness: 0.7 });
  const deepM = std({ color: 0x2a1450, emissive: 0x1a0a3a, emissiveIntensity: 0.3, roughness: 0.75 });
  const glowM = std({ color: 0xe85a9a, emissive: 0xe85a9a, emissiveIntensity: 1.1, roughness: 0.3 });
  const fangM = std({ color: 0xf2c8e8, emissive: 0xe85a9a, emissiveIntensity: 0.6, roughness: 0.3 });

  const chest = orb(coatM, 0.26, 0.2, 0.6, 0, 1.05, 1.0, 0.9);
  core.add(chest);
  core.add(orb(coatM, 0.24, -0.12, 0.58, 0, 1.15, 0.95, 0.88));
  core.add(orb(deepM, 0.16, 0.2, 0.5, 0, 0.95, 0.95, 0.82));
  core.add(bone(coatM, 0.26, 0.74, 0, 0.4, 0.86, 0, 0.1, 0.08));
  // glowing flank markings
  const marks: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) for (let i = 0; i < 3; i++) { const mk = spike(glowM, 0.1 - i * 0.14, 0.66, sgn * 0.22, 0.06 - i * 0.14, 0.74, sgn * 0.26, 0.012); core.add(mk); marks.push(mk); }

  const head = new THREE.Group();
  head.position.set(0.42, 0.92, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(coatM, 0.17, 0, 0, 0, 1.1, 0.9, 1));
  head.add(bone(deepM, 0.1, -0.05, 0, 0.26, -0.07, 0, 0.08, 0.05));
  for (const sgn of [1, -1]) head.add(spike(coatM, -0.02, 0.13, sgn * 0.09, -0.1, 0.28, sgn * 0.12, 0.04)); // ears
  const eyeL = makeEye(0.05, 0xe85a9a, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.05, 0xe85a9a, { glow: 1.2, slit: true });
  eyeL.position.set(0.13, 0.06, 0.1); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.06, -0.1); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // long luminous fangs
  for (const sgn of [1, -1]) head.add(spike(fangM, 0.26, -0.08, sgn * 0.05, 0.27, -0.22, sgn * 0.05, 0.018));

  for (const [hx, hz, rear] of [[0.3, 0.16, false], [0.3, -0.16, false], [-0.22, 0.17, true], [-0.22, -0.17, true]] as const) {
    core.add(bone(coatM, hx, rear ? 0.5 : 0.54, hz, hx + 0.01, 0.1, hz, 0.06, 0.04));
    core.add(orb(deepM, 0.05, hx + 0.01, 0.06, hz, 1, 0.8, 1.1, 7, 6));
  }

  const tail = new THREE.Group();
  tail.position.set(-0.34, 0.62, 0);
  tail.name = 'tail';
  core.add(tail);
  tail.add(bone(coatM, 0, 0, 0, -0.3, 0.1, 0, 0.045, 0.02));
  tail.add(orb(glowM, 0.04, -0.32, 0.1, 0, 1, 1.3, 1, 7, 6));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 2) * 0.02;
    chest.scale.set(1.05, 1.0 + Math.sin(t * 2.2) * 0.035, 0.9);
    head.rotation.y = Math.sin(t * 0.6) * 0.22;
    head.rotation.x = -gate(t, 6, 6) * 0.07;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.5, 0.8);
    glowM.emissiveIntensity = 0.9 + Math.sin(t * 2.4) * 0.4;
    for (let i = 0; i < marks.length; i++) (marks[i].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.sin(t * 3 + i) * 0.4;
    tail.rotation.y = Math.sin(t * 1.8) * 0.35;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ============================================================
// NOCTHOWL — its hoot is heard only by those it has chosen to
// watch. A great violet owl with an enormous facial disc, two huge
// lantern eyes, swept ear-tufts and silent feathered wings folded
// like a held secret.
// ============================================================
function buildNocthowl(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const plumeM = std({ map: featherTex('noct-plume', '#3a1a6a', '#22104a', '#7a3ad0', 621), roughness: 0.7 });
  const discM = std({ map: furTex('noct-disc', '#5a3a8a', '#3a1a6a', '#9a6ad0', 622), roughness: 0.8 });
  const beakM = std({ color: 0xd94a8a, roughness: 0.4 });
  const wingMat = std({ map: featherTex('noct-wing', '#3a1a6a', '#1a0a3a', '#7a3ad0', 623), roughness: 0.65, side: THREE.DoubleSide });

  const torso = orb(plumeM, 0.3, 0.04, 0.5, 0, 0.98, 1.15, 0.98);
  core.add(torso);

  const head = new THREE.Group();
  head.position.set(0.16, 0.96, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(plumeM, 0.24, 0, 0, 0, 1.0, 1.0, 0.95));
  // facial disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18), discM);
  disc.position.set(0.2, 0, 0); disc.rotation.y = Math.PI / 2; disc.userData.noShadow = true; head.add(disc);
  // huge lantern eyes
  const eyeL = makeEye(0.09, 0xf2c14e, { glow: 1.3 });
  const eyeR = makeEye(0.09, 0xf2c14e, { glow: 1.3 });
  eyeL.position.set(0.21, 0.05, 0.1); eyeL.rotation.y = -0.2;
  eyeR.position.set(0.21, 0.05, -0.1); eyeR.rotation.y = 0.2;
  head.add(eyeL, eyeR);
  head.add(bone(beakM, 0.21, -0.02, 0, 0.28, -0.08, 0, 0.035, 0.01));
  // ear tufts
  for (const sgn of [1, -1]) for (let k = 0; k < 2; k++) head.add(spike(plumeM, -0.06, 0.18, sgn * (0.08 + k * 0.04), -0.16, 0.42 - k * 0.06, sgn * (0.16 + k * 0.04), 0.03));

  // folded silent wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const w = featherWing(wingMat, sgn, 5, 0.5, 0.07, 0.8); w.position.set(-0.02, 0.5, sgn * 0.24); core.add(w); wings.push(w); }

  // talons
  for (const sgn of [1, -1]) { core.add(bone(beakM, 0.06, 0.24, sgn * 0.12, 0.1, 0.04, sgn * 0.12, 0.04, 0.025)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(beakM, 0.1, 0.04, sgn * 0.12 + cz, 0.2, 0.0, sgn * 0.12 + cz, 0.012)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.6) * 0.03;
    torso.scale.set(0.98, 1.15 + Math.sin(t * 1.8) * 0.025, 0.98);
    head.rotation.y = Math.sin(t * 0.4) * 0.5; // slow owl head-turn
    head.rotation.z = Math.sin(t * 0.6) * 0.08;
    // deliberate, rare blinks
    eyeL.scale.y = eyeR.scale.y = 1 - 0.95 * blinkAt(t, 5, 1.5);
    const breathe = Math.sin(t * 2);
    wings[0].rotation.z = 0.8 + breathe * 0.05; wings[1].rotation.z = -0.8 - breathe * 0.05;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// UMBRELISK — the shadow cast by nothing; scholars argue whether
// it exists at all. A near-weightless void-serpent of smooth black
// scaled in faint starlight, a featureless head save two cold
// magenta eyes, undulating half-out of reality.
// ============================================================
function buildUmbrelisk(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.6;
  g.add(core);

  const star = starPair('umbrelisk-void', 631);
  const bodyM = std({ color: 0x1a0e36, emissive: 0x2a1050, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.94 });
  const voidM = std({ map: star.map, emissiveMap: star.glow, color: 0x140828, emissive: 0x6a2ac0, emissiveIntensity: 0.5, roughness: 0.5 });
  const glowM = std({ color: 0xc43a7a, emissive: 0xc43a7a, emissiveIntensity: 1.3, roughness: 0.3 });

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.3 - i * 0.22, 0, 0);
    const r = 0.2 * (1 - i / (N + 4));
    sgrp.add(orb(i % 2 ? voidM : bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.52, 0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.22, 0, 0, 0, 1.2, 0.9, 1));
  const eyeL = orb(glowM, 0.04, 0.14, 0.06, 0.1, 1, 1.6, 0.8, 8, 7);
  const eyeR = orb(glowM, 0.04, 0.14, 0.06, -0.1, 1, 1.6, 0.8, 8, 7);
  head.add(eyeL, eyeR);
  // faint horns of nothing
  for (const sgn of [1, -1]) head.add(spike(voidM, -0.02, 0.14, sgn * 0.1, -0.18, 0.4, sgn * 0.14, 0.035));

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 2.2 - i * 0.6) * 0.16;
      segs[i].position.y = Math.sin(t * 2.2 - i * 0.6 + 1) * 0.05;
      (segs[i].children[0] as THREE.Mesh && (segs[i].children[0] as THREE.Mesh));
      const m = (segs[i].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m.transparent) m.opacity = 0.7 + Math.sin(t * 1.6 + i) * 0.24;
    }
    head.position.z = Math.sin(t * 2.2 + 0.6) * 0.16;
    head.rotation.y = Math.sin(t * 1.1) * 0.16;
    (eyeL.material as THREE.MeshStandardMaterial).emissiveIntensity = (eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(t * 2.4) * 0.4;
    bodyM.opacity = 0.85 + Math.sin(t * 1.4) * 0.12;
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// CHTHONIX — a dark beast from the deepest abyss that swallows
// light and shadow alike, wrapping the field in absolute void. A
// colossal void-serpent of fractured black, magenta abyss-cracks
// glowing along its coils and a gaping starless maw at its heart.
// ============================================================
function buildChthonix(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const cracks = crackPair('chthonix-void', '#160a2e', '#0a0418', '#ff00ff', 641);
  const bodyM = std({ map: cracks.map, emissiveMap: cracks.glow, emissive: 0xff00ff, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.2 });
  const voidM = std({ color: 0x0a0418, roughness: 0.6 });
  const glowM = std({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.4, roughness: 0.3 });
  const fangM = std({ color: 0x6a2ac0, emissive: 0x4b0082, emissiveIntensity: 0.6, roughness: 0.3 });

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.32 - i * 0.24, 0, 0);
    const r = 0.24 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.92, 1.08));
    if (i < N - 1) { for (const sgn of [1, -1]) sgrp.add(spike(fangM, 0, r * 0.7, 0, -0.04, r * 1.7, sgn * 0.04, 0.03)); }
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.56, 0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.27, 0, 0, 0, 1.2, 0.95, 1));
  // gaping starless maw
  const maw = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), voidM);
  maw.position.set(0.26, -0.04, 0); maw.rotation.y = Math.PI / 2; maw.userData.noShadow = true; head.add(maw);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; head.add(spike(glowM, 0.26 + Math.cos(a) * 0.0, -0.04 + Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.3 + Math.sin(a) * 0.08, -0.04 + Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0.012)); }
  // abyss horns
  for (const sgn of [1, -1]) { head.add(spike(fangM, -0.04, 0.16, sgn * 0.1, -0.3, 0.5, sgn * 0.18, 0.05)); head.add(spike(fangM, 0.04, 0.14, sgn * 0.16, -0.06, 0.36, sgn * 0.24, 0.035)); }
  const eyeL = makeEye(0.06, 0xff00ff, { glow: 1.6, slit: true });
  const eyeR = makeEye(0.06, 0xff00ff, { glow: 1.6, slit: true });
  eyeL.position.set(0.16, 0.12, 0.15); eyeL.rotation.y = -0.28;
  eyeR.position.set(0.16, 0.12, -0.15); eyeR.rotation.y = 0.28;
  head.add(eyeL, eyeR);
  const mawLight = new THREE.PointLight(0xff00ff, 3, 3); mawLight.position.set(0.3, -0.04, 0); head.add(mawLight);

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 1.9 - i * 0.55) * 0.18;
      segs[i].position.y = Math.sin(t * 1.9 - i * 0.55 + 1) * 0.06;
      segs[i].rotation.x = Math.sin(t * 1.9 - i * 0.55) * 0.14;
    }
    head.position.z = Math.sin(t * 1.9 + 0.55) * 0.18;
    head.rotation.y = Math.sin(t * 0.9) * 0.16 + Math.sin(t * 1.9 + 0.55) * 0.08;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.4);
    const abyss = 0.6 + Math.sin(t * 1.6) * 0.3 + gate(t, 5, 3) * 0.7;
    bodyM.emissiveIntensity = abyss; glowM.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5;
    maw.scale.setScalar(1 + Math.sin(t * 2) * 0.1);
    mawLight.intensity = 2 + Math.sin(t * 2) * 1.2;
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// GLOOMITE — a burrowing shadow with a pebble shell that collects
// shiny regrets. A round dusk-stone carapace studded with little
// salvaged gleams, two shy violet eyes peeking from the shell-gap
// and stubby digging paws it never quite stops fidgeting.
// ============================================================
function buildGloomite(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.24;
  g.add(core);

  const shellM = std({ map: furTex('gloom-shell', '#3a2a5a', '#221842', '#6a4a9a', 651), roughness: 0.85 });
  const bodyM = std({ color: 0x1a1030, emissive: 0x2a1050, emissiveIntensity: 0.3, roughness: 0.7 });
  const eyeGlow = 0xa85ad0;
  const gemCols = [0xf25aa8, 0x5ab8e8, 0xf2c14e, 0x6ec45e];

  // pebble shell dome
  const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), shellM);
  shell.scale.set(1.15, 0.9, 1.05); shell.position.y = 0.1; core.add(shell);
  // shiny regrets embedded in the shell
  const gems: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const a = rng(652 + i)() * Math.PI * 2, b = rng(670 + i)() * 0.8; const gx = Math.cos(b) * Math.cos(a) * 0.26, gy = 0.12 + Math.sin(b) * 0.2, gz = Math.cos(b) * Math.sin(a) * 0.28; const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), std({ color: gemCols[i % 4], emissive: gemCols[i % 4], emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 })); gem.position.set(gx, gy, gz); core.add(gem); gems.push(gem); }

  // shadow body peeking out front
  const head = new THREE.Group();
  head.position.set(0.2, 0.02, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.14, 0, 0, 0, 1.0, 0.85, 1));
  const eyeL = makeEye(0.045, eyeGlow, { glow: 1.0 });
  const eyeR = makeEye(0.045, eyeGlow, { glow: 1.0 });
  eyeL.position.set(0.08, 0.04, 0.07); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.08, 0.04, -0.07); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // digging paws
  const paws: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) { const paw = orb(bodyM, 0.05, 0.14, -0.16, sgn * 0.12, 1.1, 0.7, 1.1, 7, 6); core.add(paw); paws.push(paw); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.24 + Math.sin(t * 2) * 0.012;
    shell.scale.set(1.15, 0.9 + Math.sin(t * 2) * 0.02, 1.05);
    head.rotation.y = Math.sin(t * 0.9) * 0.2;
    head.position.x = 0.2 + gate(t, 4, 4) * 0.04; // peeks in and out
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3, 0.4);
    for (let i = 0; i < gems.length; i++) { gems[i].rotation.y += 0.03; (gems[i].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 3 + i) * 0.4; }
    for (let i = 0; i < paws.length; i++) paws[i].position.y = -0.16 + Math.abs(Math.sin(t * 5 + i)) * 0.03;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// MOURNMOTH — a moth drawn to darkness instead of light; it sips
// shadows like nectar. A small dusk-furred moth with patterned
// banner wings, plumed antennae and a soft proboscis it dips into
// pools of dark, drifting on velvet wingbeats.
// ============================================================
function buildMournmoth(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const fuzzM = std({ map: furTex('mourn-fuzz', '#4a3a6a', '#2a1a4a', '#8a7ab0', 661), roughness: 0.9 });
  const wingMat = std({ map: mothWing('mourn-wing', '#5a4a7a', '#2a1a4a', '#9a8ac0', '#e8d8f8', 662), roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const glowM = std({ color: 0xe8d8f8, emissive: 0xc4a8e8, emissiveIntensity: 0.8, roughness: 0.3 });

  // fuzzy segmented body
  const body = orb(fuzzM, 0.14, 0, 0, 0, 0.95, 1.2, 0.95);
  core.add(body);
  core.add(orb(fuzzM, 0.1, 0, -0.16, 0, 0.9, 1.0, 0.9));

  const head = new THREE.Group();
  head.position.set(0.0, 0.18, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(fuzzM, 0.1, 0, 0, 0, 1.05, 0.95, 1));
  const eyeL = makeEye(0.05, 0xa85ad0, { glow: 1.0 });
  const eyeR = makeEye(0.05, 0xa85ad0, { glow: 1.0 });
  eyeL.position.set(0.07, 0.0, 0.06); eyeL.rotation.y = -0.45;
  eyeR.position.set(0.07, 0.0, -0.06); eyeR.rotation.y = 0.45;
  head.add(eyeL, eyeR);
  // plumed antennae
  const ants: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const ant = new THREE.Group(); ant.position.set(0.02, 0.08, sgn * 0.04); ant.add(bone(fuzzM, 0, 0, 0, 0.04, 0.14, sgn * 0.06, 0.012, 0.006)); for (let k = 0; k < 4; k++) ant.add(spike(fuzzM, 0.02 + k * 0.01, 0.04 + k * 0.025, sgn * (0.02 + k * 0.015), 0.05 + k * 0.01, 0.06 + k * 0.025, sgn * (0.06 + k * 0.015), 0.005)); head.add(ant); ants.push(ant); }
  // proboscis
  head.add(bone(glowM, 0.06, -0.04, 0, 0.1, -0.14, 0, 0.008, 0.004));

  // banner wings (fore + hind per side)
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(-0.02, 0.02, sgn * 0.1);
    const fore = mothWingMesh(wingMat, 0.26, 0.2); fore.position.set(0.0, 0.08, sgn * 0.16); fore.rotation.set(Math.PI / 2, 0, 0); fore.scale.set(0.26, 0.2, 1);
    const hind = mothWingMesh(wingMat, 0.18, 0.16); hind.position.set(-0.08, -0.06, sgn * 0.14); hind.rotation.set(Math.PI / 2, 0, 0); hind.scale.set(0.18, 0.16, 1);
    w.add(fore, hind);
    core.add(w); wings.push(w);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 2.4) * 0.05;
    core.rotation.z = Math.sin(t * 1.4) * 0.06;
    body.scale.set(0.95, 1.2 + Math.sin(t * 3) * 0.04, 0.95);
    head.rotation.y = Math.sin(t * 0.9) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3, 0.4);
    const flutter = Math.sin(t * 5);
    wings[0].rotation.z = 0.2 + flutter * 0.5; wings[1].rotation.z = -0.2 - flutter * 0.5;
    for (let i = 0; i < ants.length; i++) ants[i].rotation.x = Math.sin(t * 2 + i) * 0.15;
    glowM.emissiveIntensity = 0.7 + Math.sin(t * 2.6) * 0.3;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// DUSKWEAVER — it spins thread from twilight; Duskwatch cloaks are
// woven from its gifts, never taken. A larger weaver-moth with a
// glowing spinneret, trailing strands of luminous silk and broad
// patterned wings it folds like a tailor measuring cloth.
// ============================================================
function buildDuskweaver(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.56;
  g.add(core);

  const fuzzM = std({ map: furTex('weave-fuzz', '#3a2a5a', '#22153a', '#7a5aa8', 671), roughness: 0.9 });
  const wingMat = std({ map: mothWing('weave-wing', '#4a3a6a', '#22153a', '#8a6ac0', '#d8b8f8', 672), roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const silkM = std({ color: 0xd8b8f8, emissive: 0xb88ae0, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.8 });

  const body = orb(fuzzM, 0.18, 0, 0, 0, 0.95, 1.25, 0.95);
  core.add(body);
  core.add(orb(fuzzM, 0.13, 0, -0.2, 0, 0.9, 1.0, 0.9));
  // glowing spinneret
  const spinner = orb(silkM, 0.05, 0, -0.34, 0, 1, 1.2, 1, 8, 7);
  core.add(spinner);

  const head = new THREE.Group();
  head.position.set(0.0, 0.22, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(fuzzM, 0.13, 0, 0, 0, 1.05, 0.95, 1));
  const eyeL = makeEye(0.055, 0xc49ae8, { glow: 1.0 });
  const eyeR = makeEye(0.055, 0xc49ae8, { glow: 1.0 });
  eyeL.position.set(0.09, 0.0, 0.07); eyeL.rotation.y = -0.45;
  eyeR.position.set(0.09, 0.0, -0.07); eyeR.rotation.y = 0.45;
  head.add(eyeL, eyeR);
  const ants: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const ant = new THREE.Group(); ant.position.set(0.02, 0.1, sgn * 0.05); ant.add(bone(fuzzM, 0, 0, 0, 0.06, 0.18, sgn * 0.08, 0.014, 0.006)); for (let k = 0; k < 5; k++) ant.add(spike(fuzzM, 0.03 + k * 0.012, 0.05 + k * 0.026, sgn * (0.03 + k * 0.016), 0.06 + k * 0.012, 0.07 + k * 0.026, sgn * (0.08 + k * 0.016), 0.006)); head.add(ant); ants.push(ant); }

  // broad patterned wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(-0.02, 0.04, sgn * 0.12);
    const fore = mothWingMesh(wingMat, 1, 1); fore.position.set(0.02, 0.1, sgn * 0.2); fore.rotation.set(Math.PI / 2, 0, 0); fore.scale.set(0.34, 0.26, 1);
    const hind = mothWingMesh(wingMat, 1, 1); hind.position.set(-0.1, -0.08, sgn * 0.18); hind.rotation.set(Math.PI / 2, 0, 0); hind.scale.set(0.24, 0.22, 1);
    w.add(fore, hind);
    core.add(w); wings.push(w);
  }

  // trailing silk strands
  const strands: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 4), silkM); st.position.set((i - 1.5) * 0.04, -0.5, 0); st.userData.noShadow = true; core.add(st); strands.push(st); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.56 + Math.sin(t * 2) * 0.05;
    body.scale.set(0.95, 1.25 + Math.sin(t * 2.6) * 0.04, 0.95);
    head.rotation.y = Math.sin(t * 0.8) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 3.4, 0.4);
    const flutter = Math.sin(t * 4);
    wings[0].rotation.z = 0.15 + flutter * 0.4; wings[1].rotation.z = -0.15 - flutter * 0.4;
    for (let i = 0; i < ants.length; i++) ants[i].rotation.x = Math.sin(t * 1.8 + i) * 0.14;
    silkM.emissiveIntensity = 0.8 + Math.sin(t * 2.4) * 0.3;
    for (let i = 0; i < strands.length; i++) { strands[i].rotation.z = Math.sin(t * 1.6 + i) * 0.1; strands[i].position.y = -0.5 + Math.sin(t * 1.2 + i) * 0.03; }
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// NIGHTLOOM — its wing patterns show each watcher a different
// forgotten memory; most say thank you. A grand moth with vast
// ornate eyespot wings that shimmer through shifting hues, a regal
// plumed crown and a calm, knowing gaze.
// ============================================================
function buildNightloom(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  g.add(core);

  const fuzzM = std({ map: furTex('loom-fuzz', '#2c1e4a', '#180e30', '#6a4a9a', 681), roughness: 0.88 });
  const wingMat = std({ map: mothWing('loom-wing', '#3a2a5e', '#180e30', '#8a6ac0', '#c49ae8', 682), emissive: 0x6a4a9a, emissiveIntensity: 0.3, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  const glowM = std({ color: 0xc49ae8, emissive: 0xb88ae0, emissiveIntensity: 0.9, roughness: 0.3 });

  const body = orb(fuzzM, 0.2, 0, 0.42, 0, 0.95, 1.3, 0.95);
  core.add(body);
  core.add(orb(fuzzM, 0.14, 0, 0.14, 0, 0.9, 1.0, 0.9));

  const head = new THREE.Group();
  head.position.set(0.04, 0.78, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(fuzzM, 0.15, 0, 0, 0, 1.05, 0.95, 1));
  const eyeL = makeEye(0.06, 0xd8b8f8, { glow: 1.1 });
  const eyeR = makeEye(0.06, 0xd8b8f8, { glow: 1.1 });
  eyeL.position.set(0.1, 0.0, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.1, 0.0, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  // plumed crown antennae
  const ants: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const ant = new THREE.Group(); ant.position.set(-0.02, 0.12, sgn * 0.05); ant.add(bone(fuzzM, 0, 0, 0, -0.04, 0.2, sgn * 0.06, 0.016, 0.006)); for (let k = 0; k < 6; k++) ant.add(spike(glowM, -0.01 - k * 0.005, 0.05 + k * 0.026, sgn * (0.03 + k * 0.01), -0.03 - k * 0.005, 0.07 + k * 0.026, sgn * (0.08 + k * 0.012), 0.006)); head.add(ant); ants.push(ant); }

  // vast ornate wings
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.0, 0.5, sgn * 0.12);
    const fore = mothWingMesh(wingMat, 1, 1); fore.position.set(0.04, 0.18, sgn * 0.28); fore.rotation.set(Math.PI / 2, 0, 0.1); fore.scale.set(0.42, 0.36, 1);
    const hind = mothWingMesh(wingMat, 1, 1); hind.position.set(-0.14, -0.1, sgn * 0.26); hind.rotation.set(Math.PI / 2, 0, -0.1); hind.scale.set(0.32, 0.3, 1);
    // long hindwing tail
    const tailW = mothWingMesh(wingMat, 1, 1); tailW.position.set(-0.3, -0.3, sgn * 0.2); tailW.rotation.set(Math.PI / 2, 0, -0.3); tailW.scale.set(0.1, 0.3, 1);
    w.add(fore, hind, tailW);
    core.add(w); wings.push(w);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.55 + Math.sin(t * 1.7) * 0.05;
    body.scale.set(0.95, 1.3 + Math.sin(t * 2.2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.6) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4, 0.8);
    const flutter = Math.sin(t * 2.6);
    wings[0].rotation.z = 0.1 + flutter * 0.35; wings[1].rotation.z = -0.1 - flutter * 0.35;
    // shifting memory hues
    wingMat.emissiveIntensity = 0.3 + (0.5 + 0.5 * Math.sin(t * 0.8)) * 0.4;
    for (let i = 0; i < ants.length; i++) ants[i].rotation.x = Math.sin(t * 1.6 + i) * 0.12;
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// PHANTASMOTH — half here, half elsewhere; its cocoon stage lasted
// a century and a half. A spectral moth fading in and out of being,
// translucent ghost-wings trailing afterimages, a pale luminous
// body and a gaze that seems to look from somewhere just behind you.
// ============================================================
function buildPhantasmoth(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const ghostM = std({ color: 0x5a3a8a, emissive: 0x8a5ac0, emissiveIntensity: 0.7, roughness: 0.4, transparent: true, opacity: 0.6 });
  const wingMat = std({ map: mothWing('phantom-wing', '#5a3a8a', '#221442', '#e85a9a', '#ffb8e0', 691), emissive: 0xe85a9a, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
  const glowM = std({ color: 0xe85a9a, emissive: 0xe85a9a, emissiveIntensity: 1.2, roughness: 0.3 });

  const body = orb(ghostM, 0.2, 0, 0.42, 0, 0.95, 1.3, 0.95);
  core.add(body);
  core.add(orb(ghostM, 0.14, 0, 0.14, 0, 0.9, 1.0, 0.9));

  const head = new THREE.Group();
  head.position.set(0.04, 0.78, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(ghostM, 0.15, 0, 0, 0, 1.05, 0.95, 1));
  const eyeL = makeEye(0.06, 0xe85a9a, { glow: 1.4 });
  const eyeR = makeEye(0.06, 0xe85a9a, { glow: 1.4 });
  eyeL.position.set(0.1, 0.0, 0.08); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.1, 0.0, -0.08); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);
  for (const sgn of [1, -1]) { const ant = new THREE.Group(); ant.position.set(-0.02, 0.12, sgn * 0.05); ant.add(bone(glowM, 0, 0, 0, -0.04, 0.2, sgn * 0.08, 0.012, 0.005)); head.add(ant); }

  // ghost wings + afterimage copies
  const wings: THREE.Group[] = [];
  const afterimages: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.0, 0.5, sgn * 0.12);
    const fore = mothWingMesh(wingMat, 1, 1); fore.position.set(0.04, 0.18, sgn * 0.28); fore.rotation.set(Math.PI / 2, 0, 0.1); fore.scale.set(0.4, 0.34, 1);
    const hind = mothWingMesh(wingMat, 1, 1); hind.position.set(-0.14, -0.1, sgn * 0.26); hind.rotation.set(Math.PI / 2, 0, -0.1); hind.scale.set(0.3, 0.28, 1);
    w.add(fore, hind);
    // faint afterimage of the forewing
    const ghost = mothWingMesh(std({ map: wingMat.map, color: 0xe85a9a, emissive: 0xe85a9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.2, side: THREE.DoubleSide }), 1, 1);
    ghost.position.set(0.04, 0.18, sgn * 0.28); ghost.rotation.set(Math.PI / 2, 0, 0.1); ghost.scale.set(0.4, 0.34, 1);
    w.add(ghost); afterimages.push(ghost);
    core.add(w); wings.push(w);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 1.7) * 0.06;
    body.scale.set(0.95, 1.3 + Math.sin(t * 2.2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.6) * 0.2;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 4.5, 0.9);
    // phasing in and out of reality
    const phase = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9));
    ghostM.opacity = phase; glowM.emissiveIntensity = 1.0 + Math.sin(t * 2) * 0.4;
    const flutter = Math.sin(t * 2.4);
    wings[0].rotation.z = 0.1 + flutter * 0.35; wings[1].rotation.z = -0.1 - flutter * 0.35;
    for (let i = 0; i < afterimages.length; i++) { afterimages[i].rotation.z = (i % 2 ? 0.1 : 0.1) + Math.sin(t * 2.4 - 0.6) * 0.35 * (i % 2 ? -1 : 1); (afterimages[i].material as THREE.MeshStandardMaterial).opacity = 0.2 * (1 - phase + 0.3); }
  };
  return { body: g, parts: { head, wings }, animate };
}

// ============================================================
// EREBUSILK — the great silk-serpent that wove the first night sky
// and left the stars as loose threads. A cosmic serpent of woven
// indigo nightsilk shimmering with constellations, trailing star-
// tipped threads from a many-eyed weaver's head.
// ============================================================
function buildErebusilk(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.62;
  g.add(core);

  const neb = nebulaPair('erebusilk-sky', 701);
  const bodyM = std({ map: neb.map, emissiveMap: neb.glow, emissive: 0x6a3ac0, emissiveIntensity: 0.6, roughness: 0.5 });
  const silkM = std({ color: 0xff7ad0, emissive: 0xff7ad0, emissiveIntensity: 1.2, roughness: 0.3 });
  const deepM = std({ color: 0x140a2e, roughness: 0.6 });

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.32 - i * 0.24, 0, 0);
    const r = 0.22 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    sgrp.add(orb(silkM, 0.012, 0, r * 0.7, 0, 1, 1, 1, 5, 4)); // star bead on the spine
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.56, 0, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.24, 0, 0, 0, 1.2, 0.95, 1));
  head.add(bone(deepM, 0.14, -0.04, 0, 0.34, -0.08, 0, 0.1, 0.06)); // snout
  // many weaver eyes
  const eyes: THREE.Group[] = [];
  for (const [ex, ey, ez] of [[0.14, 0.1, 0.13], [0.14, 0.1, -0.13], [0.06, 0.18, 0.06], [0.06, 0.18, -0.06]] as const) { const e = makeEye(0.04, 0xff7ad0, { glow: 1.3 }); e.position.set(ex, ey, ez); e.rotation.y = ez > 0 ? -0.3 : 0.3; head.add(e); eyes.push(e); }
  // mandible silk-spinners
  for (const sgn of [1, -1]) head.add(spike(silkM, 0.28, -0.06, sgn * 0.06, 0.36, -0.02, sgn * 0.1, 0.012));

  // trailing star-threads
  const threads: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) { const th = new THREE.Group(); const sgn = i % 2 ? 1 : -1; th.position.set(0.3, 0.0, sgn * (0.04 + (i >> 1) * 0.05)); let lx = 0, ly = 0; for (let j = 0; j < 3; j++) { const nx = lx + 0.14, ny = ly - 0.04 - j * 0.02; th.add(bone(silkM, lx, ly, 0, nx, ny, 0, 0.006, 0.004)); lx = nx; ly = ny; } th.add(orb(silkM, 0.018, lx, ly, 0, 1, 1, 1, 6, 5)); core.add(th); threads.push(th); }

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = Math.sin(t * 2 - i * 0.55) * 0.16;
      segs[i].position.y = Math.sin(t * 2 - i * 0.55 + 1) * 0.05;
      segs[i].rotation.x = Math.sin(t * 2 - i * 0.55) * 0.12;
    }
    head.position.z = Math.sin(t * 2 + 0.55) * 0.16;
    head.rotation.y = Math.sin(t * 0.9) * 0.16;
    for (let i = 0; i < eyes.length; i++) eyes[i].scale.y = 1 - 0.85 * blinkAt(t, 5, 0.6 + i * 0.4);
    bodyM.emissiveIntensity = 0.5 + Math.sin(t * 1.6) * 0.2;
    silkM.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.4;
    for (let i = 0; i < threads.length; i++) { threads[i].rotation.z = Math.sin(t * 1.5 + i * 0.6) * 0.2; threads[i].rotation.x = Math.sin(t * 1.2 + i) * 0.14; }
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// CRYPTLING — a tiny tomb-guardian that lost its tomb; it now
// guards whatever you ask with terrifying sincerity. A little stone
// sarcophagus-shell carved with gilt runes, two earnest amber eyes
// glowing from the lid-gap and stubby stone arms held at attention.
// ============================================================
function buildCryptling(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.22;
  g.add(core);

  const stoneM = std({ map: furTex('crypt-stone', '#44405a', '#2a2640', '#6a648a', 711), roughness: 0.9 });
  const goldM = std({ color: 0xc4b46a, emissive: 0x8a7a3a, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.5 });
  const eyeGlow = 0xf2d23a;
  const shadowM = std({ color: 0x140e22, roughness: 0.7 });

  // little sarcophagus shell
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.26), stoneM);
  shell.position.y = 0.1; core.add(shell);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.28), stoneM); lid.position.set(0.02, 0.34, 0); lid.rotation.z = -0.15; core.add(lid);
  // gilt runes
  for (let i = 0; i < 3; i++) { const rune = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 4, 8), goldM); rune.position.set(0.17, 0.06 + i * 0.1, 0); rune.rotation.y = Math.PI / 2; core.add(rune); }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.28), goldM); band.position.set(0, 0.22, 0); core.add(band);

  // earnest eyes peeking from the lid gap
  const head = new THREE.Group();
  head.position.set(0.16, 0.28, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(shadowM, 0.1, 0, 0, 0, 1.1, 0.6, 1));
  const eyeL = makeEye(0.045, eyeGlow, { glow: 1.1 });
  const eyeR = makeEye(0.045, eyeGlow, { glow: 1.1 });
  eyeL.position.set(0.05, 0.0, 0.06); eyeL.rotation.y = -0.4;
  eyeR.position.set(0.05, 0.0, -0.06); eyeR.rotation.y = 0.4;
  head.add(eyeL, eyeR);

  // stubby stone arms at attention
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const arm = new THREE.Group(); arm.position.set(0.0, 0.16, sgn * 0.16); arm.add(bone(stoneM, 0, 0, 0, 0.04, -0.12, sgn * 0.02, 0.04, 0.03)); arm.add(orb(stoneM, 0.04, 0.04, -0.14, sgn * 0.02, 1, 1, 1, 6, 5)); core.add(arm); arms.push(arm); }
  // little feet
  for (const sgn of [1, -1]) core.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), stoneM).translateX(0.02).translateY(-0.12).translateZ(sgn * 0.08));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.22 + Math.sin(t * 2) * 0.01;
    head.position.x = 0.16 + gate(t, 5, 4) * 0.03;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.9 * blinkAt(t, 3.5, 0.5);
    goldM.emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.15;
    // arms snap to attention on a slow gate
    const salute = gate(t, 6, 5);
    arms[0].rotation.z = salute * 0.6; arms[1].rotation.z = -salute * 0.6;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// SARCOPHANG — a sarcophagus that promoted itself to sentinel; the
// gilt fangs are decorative, mostly. A towering stone coffin-brute
// with a carved death-mask face, gold-banded seams, slab arms and a
// grin of golden teeth lit by a furnace of soul-light within.
// ============================================================
function buildSarcophang(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const stoneM = std({ map: furTex('sarco-stone', '#36324a', '#221f30', '#5a547a', 721), roughness: 0.9 });
  const goldM = std({ color: 0xd9c46a, emissive: 0xa8923a, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.55 });
  const soulM = std({ color: 0x8a6ad0, emissive: 0x6a3ac0, emissiveIntensity: 1.0, roughness: 0.3 });
  const maskM = std({ map: furTex('sarco-mask', '#46425e', '#2e2a42', '#6a648a', 722), roughness: 0.85 });

  // coffin torso (tapered slab)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 1.2, 6), stoneM);
  torso.position.set(0, 0.92, 0); torso.rotation.y = Math.PI / 6; core.add(torso);
  // gold seam bands
  for (const gy of [0.55, 1.1]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 6), goldM); band.position.set(0, gy, 0); band.rotation.y = Math.PI / 6; core.add(band); }
  // soul-light seam glowing down the front
  const seam = orb(soulM, 0.06, 0.4, 0.9, 0, 1, 2.2, 0.5, 8, 8); core.add(seam);

  // carved death-mask head
  const head = new THREE.Group();
  head.position.set(0.28, 1.42, 0);
  head.name = 'head';
  core.add(head);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.3), maskM); head.add(mask);
  // gold death-mask brow + headdress
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.16, 6), goldM); crown.position.set(-0.02, 0.26, 0); head.add(crown);
  for (const sgn of [1, -1]) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.06), goldM); stripe.position.set(0.16, -0.02, sgn * 0.1); head.add(stripe); }
  const eyeL = makeEye(0.05, 0x8a6ad0, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.05, 0x8a6ad0, { glow: 1.3, slit: true });
  eyeL.position.set(0.18, 0.06, 0.09); eyeL.rotation.y = -0.2;
  eyeR.position.set(0.18, 0.06, -0.09); eyeR.rotation.y = 0.2;
  head.add(eyeL, eyeR);
  // grin of golden fangs
  for (let k = 0; k < 5; k++) { const z = (k - 2) * 0.06; head.add(spike(goldM, 0.17, -0.1, z, 0.18, -0.22, z, 0.016)); }

  // slab arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.0, 1.18, sgn * 0.42);
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), stoneM).translateX(0.04).translateY(-0.24).translateZ(sgn * 0.04));
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.22), stoneM).translateX(0.08).translateY(-0.52).translateZ(sgn * 0.04));
    arm.add(orb(goldM, 0.04, 0.12, -0.6, sgn * 0.04, 1, 1, 1, 6, 5));
    core.add(arm); arms.push(arm);
  }

  // base / plinth feet
  for (const sgn of [1, -1]) core.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.24), stoneM).translateX(0).translateY(0.2).translateZ(sgn * 0.16));
  for (const sgn of [1, -1]) core.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.3), goldM).translateX(0.02).translateY(0.04).translateZ(sgn * 0.16));

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.3) * 0.02;
    torso.scale.set(1, 1 + Math.sin(t * 1.3) * 0.02, 1);
    head.rotation.y = Math.sin(t * 0.5) * 0.14;
    head.rotation.z = Math.sin(t * 0.8) * 0.03;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.5);
    const soul = 0.9 + Math.sin(t * 1.8) * 0.3 + gate(t, 6, 4) * 0.6;
    soulM.emissiveIntensity = soul; (seam.material as THREE.MeshStandardMaterial).emissiveIntensity = soul;
    goldM.emissiveIntensity = 0.3 + Math.sin(t * 1.8) * 0.1;
    arms[0].rotation.x = Math.sin(t * 0.9) * 0.06; arms[1].rotation.x = -Math.sin(t * 0.9 + 0.4) * 0.06;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// IRONHUSK — a corrupted sentinel husk haunting the Trial Caverns.
// A broken iron golem half-eaten by rust and corruption, plating
// sprung at every seam, a single furious red optic burning in a
// cracked skull and dark-red blight weeping from its joints.
// ============================================================
function buildIronhusk(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const ironM = std({ map: metalTex('husk-iron', '#4a4a5a', '#26262e', '#7a7a90', 801), roughness: 0.6, metalness: 0.6 });
  const rustM = std({ map: furTex('husk-rust', '#5a3a32', '#3a221c', '#8a5a48', 802), roughness: 0.9 });
  const coreM = std({ color: 0xc44a4a, emissive: 0xe83a3a, emissiveIntensity: 1.3, roughness: 0.3 });
  const darkM = std({ color: 0x1a1a22, roughness: 0.7 });

  // hunched broken torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.44), ironM);
  torso.position.set(0, 0.98, 0); torso.rotation.z = 0.06; core.add(torso);
  core.add(orb(rustM, 0.26, 0.06, 0.66, 0, 1.1, 0.9, 0.95));
  // exposed corrupt core in the chest
  const chestCore = orb(coreM, 0.1, 0.28, 1.0, 0, 1, 1, 1, 10, 8); core.add(chestCore);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; core.add(spike(ironM, 0.26, 1.0, 0, 0.24 + Math.cos(a) * 0.16, 1.0 + Math.sin(a) * 0.16, 0, 0.02)); } // broken cage bars

  // sprung shoulder plates
  for (const sgn of [1, -1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.26), ironM); sh.position.set(-0.04, 1.24, sgn * 0.34); sh.rotation.x = sgn * 0.2; core.add(sh); core.add(spike(rustM, -0.04, 1.34, sgn * 0.34, -0.14, 1.5, sgn * 0.4, 0.04)); }

  // cracked skull with single optic
  const head = new THREE.Group();
  head.position.set(0.22, 1.36, 0);
  head.name = 'head';
  core.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), ironM); skull.rotation.z = -0.1; head.add(skull);
  const optic = orb(coreM, 0.06, 0.13, 0.02, 0, 1, 1.2, 1, 8, 7); head.add(optic);
  const opticLight = new THREE.PointLight(0xe83a3a, 2, 2.5); opticLight.position.set(0.2, 0.02, 0); head.add(opticLight);
  // jagged jaw
  for (let k = 0; k < 4; k++) head.add(spike(darkM, 0.13, -0.1, (k - 1.5) * 0.06, 0.16, -0.2, (k - 1.5) * 0.06, 0.014));
  head.add(spike(ironM, -0.06, 0.14, 0.06, -0.18, 0.36, 0.1, 0.03)); // broken antenna

  // heavy arms (one cannon-like, one clawed)
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.0, 1.2, sgn * 0.4);
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.16), ironM).translateX(0.04).translateY(-0.22).translateZ(sgn * 0.04));
    arm.add(orb(rustM, 0.1, 0.06, -0.46, sgn * 0.04, 1, 0.9, 1));
    for (const cz of [-0.06, 0, 0.06]) arm.add(spike(darkM, 0.1, -0.5, sgn * 0.04 + cz, 0.18, -0.56, sgn * 0.04 + cz, 0.018));
    core.add(arm); arms.push(arm);
  }

  // stumpy legs
  for (const sgn of [1, -1]) { core.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), ironM).translateX(0).translateY(0.4).translateZ(sgn * 0.16)); core.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.24), darkM).translateX(0.04).translateY(0.06).translateZ(sgn * 0.16)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.2) * 0.015; // labored idle
    torso.rotation.z = 0.06 + Math.sin(t * 1.2) * 0.01;
    head.rotation.y = Math.sin(t * 0.4) * 0.2 + gate(t, 5, 8) * 0.3; // twitchy scan
    const flicker = 1.1 + Math.sin(t * 3) * 0.3 + gate(t, 4, 6) * 0.8;
    coreM.emissiveIntensity = flicker; opticLight.intensity = 1.5 + flicker * 0.5;
    chestCore.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
    arms[0].rotation.x = Math.sin(t * 0.9) * 0.05; arms[1].rotation.x = -Math.sin(t * 0.9 + 0.5) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// GRAVEMAW — the hunger beneath the Sunken Vault; it remembers
// being worshipped. A colossal idol-brute whose torso is one vast
// fanged maw of red soul-light, draped in offering-chains, crowned
// with a ring of supplicant skulls and lit from within by greed.
// ============================================================
function buildGravemaw(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const stoneM = std({ map: furTex('grave-stone', '#2a2a3a', '#16161f', '#4a4a5e', 811), roughness: 0.9 });
  const fleshM = std({ color: 0x3a1a2a, roughness: 0.7 });
  const soulM = std({ color: 0xe83a5a, emissive: 0xe83a5a, emissiveIntensity: 1.2, roughness: 0.3 });
  const fangM = std({ color: 0xe8d8c0, roughness: 0.4 });
  const goldM = std({ color: 0x8a6a3a, emissive: 0x5a4a2a, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.4 });

  // hulking idol torso with a maw-chest
  const torso = orb(stoneM, 0.46, 0, 1.0, 0, 1.05, 1.1, 0.98);
  core.add(torso);
  // the great maw
  const mawRim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 8, 18), fleshM);
  mawRim.position.set(0.4, 1.0, 0); mawRim.rotation.y = Math.PI / 2; core.add(mawRim);
  const mawInner = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), soulM);
  mawInner.position.set(0.42, 1.0, 0); mawInner.rotation.y = -Math.PI / 2; mawInner.userData.noShadow = true; core.add(mawInner);
  const upperJaw = new THREE.Group(); upperJaw.position.set(0.42, 1.0, 0); core.add(upperJaw);
  const lowerJaw = new THREE.Group(); lowerJaw.position.set(0.42, 1.0, 0); core.add(lowerJaw);
  for (let k = 0; k < 7; k++) { const a = (k / 6 - 0.5) * Math.PI; upperJaw.add(spike(fangM, Math.cos(a) * 0.22, 0.04 + Math.abs(Math.sin(a)) * 0.16, Math.sin(a) * 0.22, Math.cos(a) * 0.22, -0.04, Math.sin(a) * 0.22, 0.02)); lowerJaw.add(spike(fangM, Math.cos(a) * 0.22, -0.04 - Math.abs(Math.sin(a)) * 0.14, Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.22, 0.018)); }
  const mawLight = new THREE.PointLight(0xe83a5a, 4, 4); mawLight.position.set(0.5, 1.0, 0); core.add(mawLight);

  // crown of supplicant skulls
  const head = new THREE.Group();
  head.position.set(0.1, 1.5, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(stoneM, 0.2, 0, 0, 0, 1.05, 0.9, 1));
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.5; head.add(orb(fangM, 0.05, Math.cos(a) * 0.04, 0.16, Math.sin(a) * 0.18, 1, 1.1, 1, 8, 6)); }
  const eyeL = makeEye(0.05, 0xe83a5a, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.05, 0xe83a5a, { glow: 1.3, slit: true });
  eyeL.position.set(0.15, 0.04, 0.1); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.15, 0.04, -0.1); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);

  // offering-chains draped on the shoulders
  for (const sgn of [1, -1]) { for (let k = 0; k < 4; k++) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 4, 8), goldM); ch.position.set(-0.1, 1.3 - k * 0.1, sgn * 0.4); ch.rotation.x = k % 2 ? 0 : Math.PI / 2; core.add(ch); } }

  // squat idol legs
  for (const sgn of [1, -1]) { core.add(bone(stoneM, 0, 0.66, sgn * 0.26, 0, 0.3, sgn * 0.3, 0.16, 0.14)); core.add(orb(stoneM, 0.16, 0.06, 0.1, sgn * 0.3, 1.2, 0.6, 1.2)); }
  // arms clutching the maw
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) { const arm = new THREE.Group(); arm.position.set(0.18, 1.2, sgn * 0.38); arm.add(bone(stoneM, 0, 0, 0, 0.16, -0.4, sgn * -0.1, 0.12, 0.09)); arm.add(orb(fleshM, 0.1, 0.16, -0.42, sgn * -0.1, 1, 0.9, 1)); for (const cz of [-0.05, 0, 0.05]) arm.add(spike(fangM, 0.22, -0.46, sgn * -0.1 + cz, 0.3, -0.4, sgn * -0.1 + cz, 0.016)); core.add(arm); arms.push(arm); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.1) * 0.02;
    torso.scale.set(1.05 + Math.sin(t * 1.1) * 0.02, 1.1, 0.98); // slow hungry breathing
    upperJaw.rotation.z = gate(t, 5, 4) * 0.3; lowerJaw.rotation.z = -gate(t, 5, 4) * 0.3;
    head.rotation.y = Math.sin(t * 0.5) * 0.16;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.2);
    const hunger = 1.0 + Math.sin(t * 1.8) * 0.4 + gate(t, 5, 4) * 0.8;
    soulM.emissiveIntensity = hunger; mawLight.intensity = 3 + hunger * 1.5;
    mawInner.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
    arms[0].rotation.x = Math.sin(t * 0.8) * 0.05; arms[1].rotation.x = -Math.sin(t * 0.8 + 0.4) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// VOLTIGARCH — a war-engine of the old empire still executing its
// last order. A monumental iron siege-mech bristling with imperial
// brass, twin tesla-coil shoulders arcing live current and a
// shattered crest still flying the colors of a fallen throne.
// ============================================================
function buildVoltigarch(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const ironM = std({ map: metalTex('volt-iron', '#5a5012', '#2e2808', '#9a8a2a', 821), roughness: 0.5, metalness: 0.7 });
  const brassM = std({ color: 0xe8c42a, emissive: 0xc4a020, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.7 });
  const arcM = std({ color: 0x9ad8ff, emissive: 0x3a9df2, emissiveIntensity: 1.7, roughness: 0.2 });
  const darkM = std({ color: 0x2a2410, roughness: 0.6, metalness: 0.5 });

  // monumental boxy torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.5), ironM);
  torso.position.set(0, 1.05, 0); core.add(torso);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.04), brassM); crest.position.set(0.32, 1.2, 0); core.add(crest);
  const coreReactor = orb(arcM, 0.1, 0.3, 1.0, 0, 1, 1, 1, 10, 8); core.add(coreReactor);

  // twin tesla-coil shoulders
  const coils: THREE.Group[] = [];
  const arcs: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const coil = new THREE.Group(); coil.position.set(-0.06, 1.4, sgn * 0.42);
    for (let k = 0; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 - k * 0.012, 0.018, 6, 14), brassM); ring.position.y = k * 0.06; ring.rotation.x = Math.PI / 2; coil.add(ring); }
    const orbTip = orb(arcM, 0.06, 0, 0.26, 0, 1, 1, 1, 8, 7); coil.add(orbTip);
    core.add(coil); coils.push(coil);
  }
  // arc between the coils
  const topArc = boltGroup(arcM, -0.06, 1.66, 0.42, -0.06, 1.66, -0.42, 5, 0.014); core.add(topArc); arcs.push(topArc);

  // helm head
  const head = new THREE.Group();
  head.position.set(0.24, 1.5, 0);
  head.name = 'head';
  core.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.32), ironM); head.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), arcM); visor.position.set(0.15, 0.02, 0); head.add(visor);
  // imperial plume
  for (const z of [0, 0.05, -0.05]) head.add(spike(brassM, -0.06, 0.16, z, -0.18, 0.4, z, 0.025));

  // siege arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.0, 1.2, sgn * 0.46);
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.2), ironM).translateX(0.04).translateY(-0.25).translateZ(sgn * 0.04));
    // one cannon fist, one piston fist
    if (sgn > 0) { arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), darkM).translateX(0.1).translateY(-0.6).translateZ(sgn * 0.04)); arm.add(orb(arcM, 0.05, 0.1, -0.74, sgn * 0.04, 1, 1, 1, 8, 6)); }
    else { arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.24), ironM).translateX(0.06).translateY(-0.6).translateZ(sgn * 0.04)); }
    core.add(arm); arms.push(arm);
  }

  // heavy treaded legs
  for (const sgn of [1, -1]) { core.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), ironM).translateX(0).translateY(0.42).translateZ(sgn * 0.18)); core.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.34), darkM).translateX(0.04).translateY(0.08).translateZ(sgn * 0.18)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.4) * 0.018;
    coreReactor.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    arcM.emissiveIntensity = 1.4 + Math.sin(t * 10) * 0.5;
    (visor.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 4) * 0.4;
    for (let i = 0; i < coils.length; i++) coils[i].rotation.y = t * (i ? -1.5 : 1.5);
    topArc.visible = gate(t, 1.2, 5) > 0.2;
    head.rotation.y = Math.sin(t * 0.4) * 0.12;
    arms[0].rotation.x = 0.05 + gate(t, 4, 4) * 0.2; // cannon recoil
    arms[1].rotation.x = -Math.sin(t * 1) * 0.06;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// ASHKARATH — General of Cinders; its army burned a corridor
// through Ghandra. A towering demon-brute of charred basalt veined
// in magma, wreathed in black void-flame, crowned with a rack of
// obsidian horns and a corona of dark fire that drinks the light.
// ============================================================
function buildAshkarath(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const plates = platePair('ash-plate', '#2a0e08', '#ff5a1a', 831);
  const bodyM = std({ map: plates.map, emissiveMap: plates.glow, emissive: 0xff4a1a, emissiveIntensity: 0.7, roughness: 0.9 });
  const voidFlame = std({ color: 0x2a0a2a, emissive: 0x9a5af2, emissiveIntensity: 0.8, roughness: 0.4, transparent: true, opacity: 0.85 });
  const hornM = std({ color: 0x100808, roughness: 0.6 });
  const magmaM = std({ color: 0xff7a2a, emissive: 0xff5a1a, emissiveIntensity: 1.3, roughness: 0.4 });

  const torso = orb(bodyM, 0.46, 0.02, 1.05, 0, 1.05, 1.1, 1.0);
  core.add(torso);
  core.add(orb(bodyM, 0.36, 0.16, 0.76, 0, 1.1, 0.95, 0.95));
  core.add(orb(magmaM, 0.16, 0.28, 1.0, 0, 1, 1.3, 0.5, 10, 8)); // magma chest crack

  // corona of dark void-flame
  const flames: Flick[] = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const f = makeFlame(0.4 + Math.random() * 0.1, 0.08, 0x9a5af2, 0xff5a1a); f.position.set(-0.1 + Math.cos(a) * 0.1, 1.4 + Math.sin(a) * 0.1, Math.cos(a + 1) * 0.3); core.add(f); flames.push({ g: f, speed: 6 + Math.random() * 3, ph: Math.random() * 9, amp: 0.2 }); }

  // horned demon head
  const head = new THREE.Group();
  head.position.set(0.46, 1.3, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.26, 0, 0, 0, 1.15, 0.95, 1));
  head.add(bone(magmaM, 0.16, -0.05, 0, 0.44, -0.12, 0, 0.14, 0.09));
  // obsidian horn rack
  for (const sgn of [1, -1]) { head.add(spike(hornM, -0.04, 0.18, sgn * 0.12, -0.36, 0.56, sgn * 0.24, 0.07)); head.add(spike(hornM, 0.06, 0.16, sgn * 0.18, -0.04, 0.4, sgn * 0.3, 0.045)); head.add(spike(hornM, 0.16, 0.12, sgn * 0.14, 0.34, 0.34, sgn * 0.2, 0.035)); }
  const eyeL = makeEye(0.07, 0xff8a2a, { glow: 1.4, slit: true });
  const eyeR = makeEye(0.07, 0xff8a2a, { glow: 1.4, slit: true });
  eyeL.position.set(0.16, 0.1, 0.16); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.16, 0.1, -0.16); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  const jaw = new THREE.Group(); jaw.position.set(0.2, -0.16, 0); head.add(jaw);
  jaw.add(bone(magmaM, 0, 0, 0, 0.3, -0.03, 0, 0.1, 0.07));

  // massive arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group(); arm.position.set(0.16, 1.24, sgn * 0.5);
    arm.add(bone(bodyM, 0, 0, 0, 0.08, -0.52, sgn * 0.08, 0.16, 0.12));
    arm.add(bone(bodyM, 0.08, -0.52, sgn * 0.08, 0.26, -0.96, sgn * 0.06, 0.12, 0.1));
    arm.add(orb(bodyM, 0.16, 0.26, -1.0, sgn * 0.06, 1, 0.9, 1));
    for (const cz of [-0.07, 0, 0.07]) arm.add(spike(hornM, 0.34, -1.04, sgn * 0.06 + cz, 0.44, -1.1, sgn * 0.06 + cz, 0.024));
    core.add(arm); arms.push(arm);
  }
  // legs
  for (const sgn of [1, -1]) { core.add(bone(bodyM, -0.06, 0.78, sgn * 0.34, -0.1, 0.36, sgn * 0.42, 0.16, 0.12)); core.add(orb(hornM, 0.14, 0.1, 0.08, sgn * 0.4, 1.2, 0.6, 1.1)); for (const cz of [-0.08, 0, 0.08]) core.add(spike(hornM, 0.2, 0.05, sgn * 0.4 + cz, 0.3, 0.02, sgn * 0.4 + cz, 0.026)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.4) * 0.025;
    torso.scale.set(1.05 + Math.sin(t * 1.4) * 0.02, 1.1, 1.0);
    head.rotation.y = Math.sin(t * 0.5) * 0.16;
    jaw.rotation.z = -(0.08 + gate(t, 5, 4) * 0.3);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.5);
    const burn = 0.6 + Math.sin(t * 2) * 0.25 + gate(t, 4.5, 3) * 0.7;
    bodyM.emissiveIntensity = burn; magmaM.emissiveIntensity = 1.1 + Math.sin(t * 2.4) * 0.4;
    arms[0].rotation.x = Math.sin(t * 1) * 0.06; arms[1].rotation.x = -Math.sin(t * 1 + 0.4) * 0.06;
    flickAll(flames, t);
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// VORMAELA — the Tide-Empress of the Drowned Choir; her tides
// answer only her bottomless grief. A regal navy sea-serpent hung
// with veils of glowing brine, a mournful ice crown, ghostly choir-
// wisps trailing her coils and a face carved from sorrow itself.
// ============================================================
function buildVormaela(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.66;
  g.add(core);

  const scales = scaleTex('vorm-scale', '#0a1a3a', '#2a5db8', '#050e26', 841);
  const bodyM = std({ map: scales, emissive: 0x2a7dd9, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.2 });
  const bellyM = std({ color: 0x6a3ac0, emissive: 0xb05ae8, emissiveIntensity: 0.5, roughness: 0.45 });
  const iceM = std({ color: 0xc8e8ff, emissive: 0x8ac0ff, emissiveIntensity: 0.8, roughness: 0.15, flatShading: true });
  const choirM = std({ color: 0xb05ae8, emissive: 0xb05ae8, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.5 });
  const veilMat = finMat('vorm-veil', [42, 125, 217], [176, 90, 232], 0.45);

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.32 - i * 0.24, 0, 0);
    const r = 0.23 * (1 - i / (N + 5));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    sgrp.add(orb(bellyM, r * 0.55, 0, -r * 0.5, 0, 1.2, 0.5, 0.9, 10, 8));
    if (i < N - 1) { const veil = makeFin(veilMat, r * 1.8, Math.PI * 0.1, Math.PI * 0.8); veil.position.set(0, r * 0.7, 0); veil.rotation.set(0, Math.PI / 2, Math.PI / 2); sgrp.add(veil); }
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.56, 0.04, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.24, 0, 0, 0, 1.15, 0.95, 1));
  head.add(bone(bellyM, 0.14, -0.05, 0, 0.4, -0.1, 0, 0.11, 0.07));
  // mournful ice crown
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.34; head.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.34 - Math.abs(k - 2) * 0.05, 5), iceM).translateX(-0.02).translateY(0.18).translateZ(Math.sin(a) * 0.14).translateX(Math.cos(a) * 0.02)); }
  const eyeL = makeEye(0.06, 0xb05ae8, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.06, 0xb05ae8, { glow: 1.2, slit: true });
  eyeL.position.set(0.14, 0.06, 0.13); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.06, -0.13); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  // grief tear-streaks
  for (const sgn of [1, -1]) head.add(spike(iceM, 0.16, 0.0, sgn * 0.12, 0.18, -0.16, sgn * 0.13, 0.008));

  // drowned-choir wisps orbiting her
  const choir: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const w = orb(choirM, 0.05, 0, 0, 0, 1, 1.6, 1, 8, 6); w.userData.noShadow = true; core.add(w); choir.push(w); }

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) { segs[i].position.z = Math.sin(t * 1.8 - i * 0.5) * 0.16; segs[i].position.y = Math.sin(t * 1.8 - i * 0.5 + 1) * 0.05; segs[i].rotation.x = Math.sin(t * 1.8 - i * 0.5) * 0.12; }
    head.position.z = Math.sin(t * 1.8 + 0.5) * 0.16;
    head.rotation.y = Math.sin(t * 0.7) * 0.16; head.rotation.z = -0.05;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    bellyM.emissiveIntensity = 0.4 + Math.sin(t * 1.6) * 0.2;
    iceM.emissiveIntensity = 0.7 + Math.sin(t * 2) * 0.2;
    for (let i = 0; i < choir.length; i++) { const a = t * 0.6 + i * (Math.PI * 2 / 5); choir[i].position.set(0.1 + Math.cos(a) * 0.7, 0.3 + Math.sin(a * 1.5) * 0.4, Math.sin(a) * 0.7); (choir[i].material as THREE.MeshStandardMaterial).opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + i)); }
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// BRAMBLEHEX — the Rotwarden; everything it touches grows wrong. A
// blighted forest-titan of black-rotted bark and sickly fungal
// light, twisted antlers dripping spore-hexes, a chest split by a
// rot-glowing wound and vines that writhe of their own accord.
// ============================================================
function buildBramblehex(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  g.add(core);

  const barkM = std({ map: barkTex('hex-bark', '#1a2a10', '#0a1206', '#3a4a1a', 851), roughness: 0.92 });
  const rotM = std({ color: 0xc44a7a, emissive: 0xe85a9a, emissiveIntensity: 0.9, roughness: 0.5 });
  const fungM = std({ color: 0x6a8a3a, emissive: 0x8aca4a, emissiveIntensity: 0.7, roughness: 0.5 });
  const woodM = std({ color: 0x14200c, roughness: 0.9 });

  const torso = orb(barkM, 0.44, 0.02, 1.04, 0, 1.05, 1.12, 0.98);
  core.add(torso);
  core.add(orb(barkM, 0.36, 0.14, 0.74, 0, 1.1, 0.95, 0.94));
  // rot-glowing chest wound
  const wound = orb(rotM, 0.14, 0.3, 1.02, 0, 1, 1.4, 0.5, 10, 8); core.add(wound);
  // fungal shelves
  for (const sgn of [1, -1]) for (let k = 0; k < 2; k++) { const br = new THREE.Mesh(new THREE.SphereGeometry(0.14 - k * 0.03, 10, 6, 0, Math.PI, 0, Math.PI / 2), fungM); br.scale.set(1.2, 0.4, 0.8); br.position.set(-0.06, 1.1 + k * 0.16, sgn * (0.4 - k * 0.04)); br.rotation.y = sgn * Math.PI / 2; core.add(br); }

  // twisted antlered head
  const head = new THREE.Group();
  head.position.set(0.44, 1.32, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(barkM, 0.24, 0, 0, 0, 1.1, 0.95, 1));
  head.add(bone(woodM, 0.14, -0.05, 0, 0.4, -0.1, 0, 0.13, 0.08));
  // dripping antlers with spore-hex buds
  for (const sgn of [1, -1]) { head.add(bone(woodM, -0.04, 0.18, sgn * 0.1, -0.26, 0.56, sgn * 0.24, 0.05, 0.025)); head.add(spike(woodM, -0.16, 0.42, sgn * 0.2, -0.34, 0.64, sgn * 0.3, 0.025)); head.add(spike(woodM, -0.1, 0.46, sgn * 0.14, -0.06, 0.66, sgn * 0.2, 0.02)); for (let k = 0; k < 3; k++) head.add(orb(rotM, 0.022, -0.12 - k * 0.05, 0.42 + k * 0.06, sgn * (0.2 + k * 0.02), 1, 1, 1, 6, 5)); }
  const eyeL = makeEye(0.06, 0xe85a9a, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.06, 0xe85a9a, { glow: 1.3, slit: true });
  eyeL.position.set(0.16, 0.08, 0.13); eyeL.rotation.y = -0.28;
  eyeR.position.set(0.16, 0.08, -0.13); eyeR.rotation.y = 0.28;
  head.add(eyeL, eyeR);

  // writhing vine arms
  const arms: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const arm = new THREE.Group(); arm.position.set(0.1, 1.22, sgn * 0.46);
    arm.add(bone(barkM, 0, 0, 0, 0.06, -0.5, sgn * 0.08, 0.13, 0.1));
    arm.add(bone(woodM, 0.06, -0.5, sgn * 0.08, 0.2, -0.9, sgn * 0.04, 0.1, 0.08));
    for (let k = 0; k < 3; k++) arm.add(spike(woodM, 0.2, -0.9, sgn * 0.04, 0.3 + k * 0.04, -0.84 - k * 0.05, sgn * (0.04 + (k - 1) * 0.05), 0.018));
    for (let k = 0; k < 3; k++) arm.add(orb(fungM, 0.03, 0.04 + k * 0.04, -0.16 - k * 0.2, sgn * (0.06 - k * 0.01), 1, 1, 1, 6, 5));
    core.add(arm); arms.push(arm);
  }
  // root legs
  for (const sgn of [1, -1]) { core.add(bone(barkM, -0.04, 0.78, sgn * 0.3, -0.06, 0.34, sgn * 0.34, 0.15, 0.12)); for (const cz of [-0.1, 0, 0.1]) core.add(spike(woodM, 0.0, 0.14, sgn * 0.34 + cz, 0.2, 0.02, sgn * 0.36 + cz, 0.03)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = Math.sin(t * 1.2) * 0.022;
    torso.scale.set(1.05, 1.12 + Math.sin(t * 1.2) * 0.025, 0.98);
    head.rotation.y = Math.sin(t * 0.45) * 0.16; head.rotation.z = Math.sin(t * 0.7) * 0.03;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 6, 1.4);
    const rot = 0.7 + Math.sin(t * 1.8) * 0.3 + gate(t, 6, 4) * 0.6;
    rotM.emissiveIntensity = rot; wound.scale.set(1, 1.4 + Math.sin(t * 1.8) * 0.1, 0.5);
    fungM.emissiveIntensity = 0.6 + Math.sin(t * 2.2 + 1) * 0.25;
    arms[0].rotation.x = Math.sin(t * 1.4) * 0.12; arms[1].rotation.x = -Math.sin(t * 1.4 + 0.5) * 0.12; // writhing
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// VOLTRAZAR — the Storm-Tyrant of the Iron Tempest, grounded once
// and never forgiving it. A monstrous corrupted thunderbird in
// blackened storm-plumage shot with tyrant-gold lightning, dragging
// broken iron grounding-coils and a crown of forked bolts.
// ============================================================
function buildVoltrazar(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.58;
  g.add(core);

  const plumeM = std({ map: featherTex('razar-plume', '#2a240a', '#16120a', '#6a5a18', 861), emissive: 0xf2d23a, emissiveIntensity: 0.3, roughness: 0.6 });
  const wingMat = std({ map: featherTex('razar-wing', '#221c08', '#100c06', '#5a4a14', 862), emissive: 0xf2d23a, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide });
  const goldM = std({ color: 0xf2d23a, emissive: 0xf2d23a, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
  const boltM = std({ color: 0xfff0a8, emissive: 0xf2e06e, emissiveIntensity: 1.8, roughness: 0.2 });
  const voidM = std({ color: 0x3a2a5a, emissive: 0x9a5af2, emissiveIntensity: 0.6, roughness: 0.4 });
  const ironM = std({ map: metalTex('razar-iron', '#3a3a44', '#1a1a22', '#6a6a78', 863), roughness: 0.5, metalness: 0.6 });

  const torso = orb(plumeM, 0.32, 0.06, 0.54, 0, 0.95, 1.25, 0.95);
  core.add(torso);
  core.add(orb(voidM, 0.2, 0.16, 0.64, 0, 0.85, 1.0, 0.86));

  const head = new THREE.Group();
  head.position.set(0.22, 1.1, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.14, 0.86, 0, 0.2, 1.02, 0, 0.11, 0.08));
  head.add(orb(plumeM, 0.18, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(goldM, 0.1, -0.02, 0, 0.36, -0.06, 0, 0.06, 0.014));
  // crown of forked bolts
  for (const [z, h] of [[0, 0.36], [0.08, 0.28], [-0.08, 0.28], [0.14, 0.2], [-0.14, 0.2]] as const) head.add(spike(boltM, -0.04, 0.14, z, -0.12, 0.14 + h, z, 0.022));
  const eyeL = makeEye(0.06, 0xf2e06e, { glow: 1.4, slit: true });
  const eyeR = makeEye(0.06, 0xf2e06e, { glow: 1.4, slit: true });
  eyeL.position.set(0.13, 0.06, 0.12); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.13, 0.06, -0.12); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);

  // storm wings with lightning
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(wingMat, sgn, 7, 0.92, 0.1, 0.24);
    w.position.set(0.0, 0.68, sgn * 0.26);
    const arc = boltGroup(boltM, 0, 0.1, 0, -0.34, 0.6, 0, 4, 0.014); w.add(arc);
    core.add(w); wings.push(w);
  }

  // broken iron grounding-coils dragging behind
  const tail = new THREE.Group();
  tail.position.set(-0.26, 0.42, 0);
  tail.name = 'tail';
  core.add(tail);
  for (const sgn of [1, -1]) { tail.add(bone(ironM, 0, 0, 0, -0.3, -0.16, sgn * 0.08, 0.04, 0.02)); for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 10), ironM); ring.position.set(-0.12 - k * 0.08, -0.06 - k * 0.05, sgn * 0.05); ring.rotation.x = Math.PI / 2; tail.add(ring); } }
  for (const sgn of [1, -1]) tail.add(spike(boltM, 0, 0, 0, -0.38, -0.1, sgn * 0.1, 0.026));

  for (const sgn of [1, -1]) { core.add(bone(goldM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.05, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(goldM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.016)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.58 + Math.sin(t * 1.6) * 0.05;
    torso.scale.set(0.95, 1.25 + Math.sin(t * 2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.5) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    boltM.emissiveIntensity = 1.5 + Math.sin(t * 11) * 0.5;
    goldM.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.3;
    const beat = Math.sin(t * 1.7);
    wings[0].rotation.x = beat * 0.5; wings[1].rotation.x = -beat * 0.5;
    for (const w of wings) { const arc = w.children[w.children.length - 1]; arc.visible = Math.abs(beat) > 0.6; }
    tail.rotation.z = Math.sin(t * 1.2) * 0.06;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// GORRUNDAX — the Mountain-Eater; whole ranges in Tharkand are its
// cast-off shells. A continental tunnelling colossus armored in a
// mountainous rock carapace, a grinding magma maw ringed with
// boulder-teeth and stubby digging limbs that move the earth.
// ============================================================
function buildGorrundax(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.1;
  g.add(core);

  const rockM = std({ map: furTex('gorr-rock', '#2e2a26', '#16120e', '#5a4e3e', 871), roughness: 0.95 });
  const plateM = std({ map: platePair('gorr-plate', '#3a2a1a', '#ff5a1a', 872).map, emissiveMap: platePair('gorr-plate', '#3a2a1a', '#ff5a1a', 872).glow, emissive: 0xff5a1a, emissiveIntensity: 0.55, roughness: 0.92 });
  const magmaM = std({ color: 0xff7a2a, emissive: 0xe84a1a, emissiveIntensity: 1.3, roughness: 0.4 });
  const boulderM = std({ color: 0x4a4038, roughness: 0.9 });
  const iceM = std({ color: 0xb8e0f0, emissive: 0x8ac0e0, emissiveIntensity: 0.5, roughness: 0.2, flatShading: true });

  // mountainous carapace
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 0), plateM);
  shell.scale.set(1.3, 0.95, 1.15); shell.position.set(-0.1, 0.7, 0); core.add(shell);
  // jagged peaks on the back
  for (const [x, z, h] of [[-0.4, 0, 0.6], [-0.2, 0.24, 0.45], [-0.2, -0.24, 0.45], [-0.5, 0.18, 0.36], [-0.5, -0.18, 0.36]] as const) { const peak = new THREE.Mesh(new THREE.ConeGeometry(0.14, h, 6), rockM); peak.position.set(x, 0.9 + h / 2, z); peak.rotation.z = 0.2; core.add(peak); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.06, h * 0.3, 6), iceM); cap.position.set(x - h * 0.1, 0.9 + h * 0.85, z); core.add(cap); }

  // grinding magma maw head
  const head = new THREE.Group();
  head.position.set(0.5, 0.56, 0);
  head.name = 'head';
  core.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), rockM); skull.scale.set(1.1, 0.9, 1.1); head.add(skull);
  const maw = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), magmaM); maw.position.set(0.24, -0.04, 0); maw.rotation.y = Math.PI / 2; maw.userData.noShadow = true; head.add(maw);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; head.add(orb(boulderM, 0.04, 0.24, -0.04 + Math.sin(a) * 0.18, Math.cos(a) * 0.18, 1, 1, 1, 6, 5)); } // boulder teeth
  const eyeL = makeEye(0.05, 0xff8a2a, { glow: 1.3, slit: true });
  const eyeR = makeEye(0.05, 0xff8a2a, { glow: 1.3, slit: true });
  eyeL.position.set(0.18, 0.14, 0.14); eyeL.rotation.y = -0.25;
  eyeR.position.set(0.18, 0.14, -0.14); eyeR.rotation.y = 0.25;
  head.add(eyeL, eyeR);
  // horns
  for (const sgn of [1, -1]) head.add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), rockM).translateX(-0.04).translateY(0.24).translateZ(sgn * 0.16));
  const mawLight = new THREE.PointLight(0xff5a1a, 4, 4); mawLight.position.set(0.3, -0.04, 0); head.add(mawLight);

  // stubby digging limbs
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.28, 0.34], [0.28, -0.34], [-0.3, 0.36], [-0.3, -0.36]] as const) {
    const leg = new THREE.Group(); leg.position.set(x, 0.4, z);
    leg.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), rockM).translateY(-0.1));
    for (const cz of [-0.08, 0, 0.08]) leg.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), boulderM).translateX(0.1).translateY(-0.28).translateZ(cz).rotateZ(-1.2)); // digging claws
    core.add(leg); legs.push(leg);
  }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.1 + Math.sin(t * 1.0) * 0.02;
    shell.scale.set(1.3 + Math.sin(t * 1.0) * 0.015, 0.95, 1.15);
    head.rotation.x = Math.sin(t * 1.0 + 0.4) * 0.04;
    head.rotation.y = Math.sin(t * 0.4) * 0.1;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 7, 2.0);
    const grind = 1.0 + Math.sin(t * 2) * 0.4 + gate(t, 5, 3) * 0.7;
    magmaM.emissiveIntensity = grind; plateM.emissiveIntensity = 0.45 + grind * 0.1; mawLight.intensity = 3 + grind;
    maw.rotation.z = t * 2; // grinding
    for (let i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(t * 2.4 + i * 1.6) * 0.12;
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// CRYOMARA — Queen of the Still; where her glacier marched, nothing
// moved again, not water, not wind, not time. A serene crystalline
// ice-queen suspended in frozen poise, veiled in slow aurora light,
// crowned in frost and haloed by motes that hang utterly still.
// ============================================================
function buildCryomara(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.7;
  g.add(core);

  const iceM = std({ color: 0xc8e8f2, emissive: 0x8ac0e8, emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
  const deepM = std({ color: 0x5a8ab8, emissive: 0x3a6a9a, emissiveIntensity: 0.4, roughness: 0.2, flatShading: true });
  const auroraMat = finMat('cryo-aurora', [154, 90, 242], [180, 240, 255], 0.4);
  const coreM = std({ color: 0xe8f8ff, emissive: 0xc8e8ff, emissiveIntensity: 1.0, roughness: 0.15 });

  // crystalline regal body (a faceted gown shape)
  const gown = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 7), iceM);
  gown.position.set(0, 0.1, 0); core.add(gown);
  const bust = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), iceM); bust.position.set(0.02, 0.52, 0); bust.scale.set(0.9, 1, 0.8); core.add(bust);
  core.add(orb(coreM, 0.07, 0.1, 0.5, 0, 1, 1.3, 0.6, 8, 7)); // frozen heart

  // head
  const head = new THREE.Group();
  head.position.set(0.06, 0.78, 0);
  head.name = 'head';
  core.add(head);
  head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), iceM));
  // frost crown
  for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.34; head.add(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2 - Math.abs(k - 3) * 0.02, 5), coreM).translateX(-0.02).translateY(0.14).translateZ(Math.sin(a) * 0.13).translateX(Math.cos(a) * 0.02)); }
  const eyeL = makeEye(0.05, 0x9a5af2, { glow: 1.2, slit: true });
  const eyeR = makeEye(0.05, 0x9a5af2, { glow: 1.2, slit: true });
  eyeL.position.set(0.1, 0.0, 0.08); eyeL.rotation.y = -0.35;
  eyeR.position.set(0.1, 0.0, -0.08); eyeR.rotation.y = 0.35;
  head.add(eyeL, eyeR);

  // slow aurora veils
  const veils: THREE.Mesh[] = [];
  for (const sgn of [1, -1]) { const v = makeFin(auroraMat, 0.6, Math.PI * 0.05, Math.PI * 0.5); v.position.set(-0.04, 0.4, sgn * 0.1); v.rotation.set(sgn * 0.4, 0.2, Math.PI / 2); v.scale.set(1, sgn, 1); core.add(v); veils.push(v); }

  // crystalline arms held in poise
  for (const sgn of [1, -1]) { core.add(bone(deepM, 0.04, 0.5, sgn * 0.2, 0.12, 0.2, sgn * 0.26, 0.05, 0.03)); core.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.05), coreM).translateX(0.14).translateY(0.16).translateZ(sgn * 0.27)); }

  // perfectly-still halo motes (they do NOT drift — that is the point)
  const motes: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), coreM); m.position.set(0.06 + Math.cos(a) * 0.5, 0.6 + Math.sin(a) * 0.4, Math.sin(a + 1) * 0.2); m.userData.noShadow = true; core.add(m); motes.push(m); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.7 + Math.sin(t * 0.8) * 0.02; // barely moves
    iceM.emissiveIntensity = 0.5 + Math.sin(t * 1.2) * 0.15;
    coreM.emissiveIntensity = 0.9 + Math.sin(t * 1.6) * 0.2;
    head.rotation.y = Math.sin(t * 0.3) * 0.08;
    // rare, slow blinks; time itself drags
    eyeL.scale.y = eyeR.scale.y = 1 - 0.95 * blinkAt(t, 8, 3.0);
    for (let i = 0; i < veils.length; i++) veils[i].rotation.z = Math.PI / 2 + Math.sin(t * 0.6 + i) * 0.1; // aurora ripples slowly
    for (let i = 0; i < motes.length; i++) motes[i].rotation.y += 0.003; // motes spin in place, never travel
  };
  return { body: g, parts: { head }, animate };
}

// ============================================================
// LUXAVOR — the False Dawn; whole armies knelt to its counterfeit
// sunrise before realizing their mistake. A radiant phoenix of
// blinding gold-white plumage hiding a void-dark heart, haloed by a
// false-sun corona with a creeping shadow-violet beneath the light.
// ============================================================
function buildLuxavor(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.6;
  g.add(core);

  const plumeM = std({ map: featherTex('lux-plume', '#f2ead0', '#d9a93a', '#fffbf0', 881), emissive: 0xffd86a, emissiveIntensity: 0.6, roughness: 0.5 });
  const wingMat = std({ map: featherTex('lux-wing', '#f2ead0', '#d9a93a', '#fffbf0', 882), emissive: 0xffd86a, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  const goldM = std({ color: 0xffe07a, emissive: 0xffd24e, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.4 });
  const voidM = std({ color: 0x2a1448, emissive: 0x6a2ac0, emissiveIntensity: 0.7, roughness: 0.4 });
  const coronaM = std({ color: 0xfff4d8, emissive: 0xffe8a8, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.7 });

  const torso = orb(plumeM, 0.3, 0.06, 0.52, 0, 0.95, 1.25, 0.95);
  core.add(torso);
  // the void heart hidden in the light
  core.add(orb(voidM, 0.12, 0.18, 0.58, 0, 1, 1.2, 0.6, 10, 8));

  // false-sun corona behind
  const corona = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 32), coronaM);
  corona.position.set(-0.1, 0.9, 0); corona.userData.noShadow = true; core.add(corona);
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const ray = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), coronaM); ray.position.set(-0.1 + Math.cos(a) * 0.6, 0.9 + Math.sin(a) * 0.6, 0); ray.rotation.z = a - Math.PI / 2; ray.userData.noShadow = true; core.add(ray); rays.push(ray); }

  const head = new THREE.Group();
  head.position.set(0.2, 1.06, 0);
  head.name = 'head';
  core.add(head);
  core.add(bone(plumeM, 0.13, 0.84, 0, 0.18, 1.0, 0, 0.1, 0.08));
  head.add(orb(plumeM, 0.16, 0, 0, 0, 1.05, 1.0, 1));
  head.add(bone(goldM, 0.1, -0.02, 0, 0.32, -0.05, 0, 0.055, 0.012));
  // radiant crest
  for (const [z, h] of [[0, 0.3], [0.06, 0.22], [-0.06, 0.22]] as const) head.add(spike(goldM, -0.04, 0.12, z, -0.12, 0.12 + h, z, 0.02));
  const eyeL = makeEye(0.05, 0x6a2ac0, { glow: 1.2, slit: true }); // the lie shows in the eyes
  const eyeR = makeEye(0.05, 0x6a2ac0, { glow: 1.2, slit: true });
  eyeL.position.set(0.11, 0.05, 0.1); eyeL.rotation.y = -0.32;
  eyeR.position.set(0.11, 0.05, -0.1); eyeR.rotation.y = 0.32;
  head.add(eyeL, eyeR);

  // radiant wings, shadow-violet underside
  const wings: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const w = featherWing(wingMat, sgn, 7, 0.9, 0.1, 0.26);
    w.children.forEach((f, i) => { if (i % 2) { const under = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), voidM); under.position.copy(f.position).add(new THREE.Vector3(-(0.9 - i * 0.1) * 0.26, -0.02, 0)); under.userData.noShadow = true; w.add(under); } });
    w.position.set(0.0, 0.66, sgn * 0.24); core.add(w); wings.push(w);
  }

  // plume tail
  const tail = new THREE.Group();
  tail.position.set(-0.24, 0.44, 0);
  tail.name = 'tail';
  core.add(tail);
  for (let i = 0; i < 5; i++) { const len = 0.6 - Math.abs(i - 2) * 0.06; const tf = new THREE.Mesh(new THREE.CircleGeometry(len, 8, 0, Math.PI), wingMat); tf.position.set(-0.06, 0, (i - 2) * 0.08); tf.rotation.set(Math.PI / 2, Math.PI / 2, 0); tf.scale.set(0.16, 1, 1); tf.userData.noShadow = true; tail.add(tf); }

  for (const sgn of [1, -1]) { core.add(bone(goldM, 0.08, 0.34, sgn * 0.12, 0.12, 0.06, sgn * 0.13, 0.045, 0.03)); for (const cz of [-0.04, 0, 0.04]) core.add(spike(goldM, 0.12, 0.06, sgn * 0.13 + cz, 0.24, 0.02, sgn * 0.13 + cz, 0.014)); }

  finishShadows(g);
  const animate = (t: number) => {
    core.position.y = 0.6 + Math.sin(t * 1.5) * 0.05;
    torso.scale.set(0.95, 1.25 + Math.sin(t * 2) * 0.03, 0.95);
    head.rotation.y = Math.sin(t * 0.5) * 0.18;
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5, 1.0);
    corona.rotation.z = t * 0.3;
    const glow = 1.2 + Math.sin(t * 1.8) * 0.4;
    coronaM.emissiveIntensity = glow; plumeM.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.2;
    voidM.emissiveIntensity = 0.5 + Math.sin(t * 1.4) * 0.3; // the dark pulses beneath
    for (let i = 0; i < rays.length; i++) rays[i].scale.y = 1 + Math.sin(t * 3 + i) * 0.2;
    const beat = Math.sin(t * 1.6);
    wings[0].rotation.x = beat * 0.45; wings[1].rotation.x = -beat * 0.45;
  };
  return { body: g, parts: { head, tail, wings }, animate };
}

// ============================================================
// NYXGHUL — the Hollow Crown, first and worst of the nine. A
// terrible void-king serpent of starless black, a floating hollow
// crown of pale bone-gold suspended over a faceless head, robes of
// shadow and a cold sourceless light where its sovereignty sits.
// ============================================================
function buildNyxghul(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.64;
  g.add(core);

  const star = starPair('nyx-void', 891);
  const bodyM = std({ map: star.map, emissiveMap: star.glow, color: 0x0a0614, emissive: 0x4a2a8a, emissiveIntensity: 0.4, roughness: 0.5 });
  const robeM = std({ color: 0x0e081a, roughness: 0.7 });
  const crownM = std({ color: 0xe8d9a8, emissive: 0xc4b46a, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5 });
  const glowM = std({ color: 0xe8d9a8, emissive: 0xe8d9a8, emissiveIntensity: 1.2, roughness: 0.3 });

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.32 - i * 0.24, 0, 0);
    const r = 0.24 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    // tattered shadow-robe drapes
    if (i < N - 2) for (const sgn of [1, -1]) sgrp.add(spike(robeM, 0, -r * 0.4, sgn * r * 0.6, 0.04, -r * 1.6, sgn * r * 0.9, 0.03));
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.56, 0.04, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(robeM, 0.24, 0, 0, 0, 1.1, 1.0, 0.95));
  // faceless — only a cold light and two hollow eyes
  const eyeL = orb(glowM, 0.035, 0.16, 0.04, 0.1, 1, 1.5, 0.7, 8, 7);
  const eyeR = orb(glowM, 0.035, 0.16, 0.04, -0.1, 1, 1.5, 0.7, 8, 7);
  head.add(eyeL, eyeR);

  // floating hollow crown above the head
  const crown = new THREE.Group();
  crown.position.set(0.5, 0.4, 0);
  core.add(crown);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 20), crownM); band.rotation.x = Math.PI / 2; crown.add(band);
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; crown.add(spike(crownM, Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, Math.cos(a) * 0.2, 0.16 + (k % 2) * 0.08, Math.sin(a) * 0.2, 0.018)); }
  const crownLight = new THREE.PointLight(0xe8d9a8, 2.5, 3); crown.add(crownLight);

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) { segs[i].position.z = Math.sin(t * 1.7 - i * 0.5) * 0.16; segs[i].position.y = Math.sin(t * 1.7 - i * 0.5 + 1) * 0.05; segs[i].rotation.x = Math.sin(t * 1.7 - i * 0.5) * 0.1; }
    head.position.z = Math.sin(t * 1.7 + 0.5) * 0.16;
    head.rotation.y = Math.sin(t * 0.8) * 0.14;
    crown.position.x = 0.5 + Math.sin(t * 1.7 + 0.5) * 0.04; crown.position.z = Math.sin(t * 1.7 + 0.5) * 0.16;
    crown.position.y = 0.4 + Math.sin(t * 1.2) * 0.03; crown.rotation.y = t * 0.4;
    (eyeL.material as THREE.MeshStandardMaterial).emissiveIntensity = (eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(t * 2) * 0.4;
    crownM.emissiveIntensity = 0.7 + Math.sin(t * 1.6) * 0.3; crownLight.intensity = 2 + Math.sin(t * 1.6) * 1;
    bodyM.emissiveIntensity = 0.35 + Math.sin(t * 1.4) * 0.15;
  };
  return { body: g, parts: { head, tail: segs[segs.length - 1] }, animate };
}

// ============================================================
// ZERATHUUL — the Rift-Herald; it drags the door to Ghandra behind
// it like a torn hem. A cosmic serpent of deep nebula-flesh trailing
// a glowing tear in reality, pink rift-light bleeding from its seams
// and stray bolts of star-electricity arcing across the wound.
// ============================================================
function buildZerathuul(): BespokeBuild {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.64;
  g.add(core);

  const neb = nebulaPair('zera-sky', 901);
  const bodyM = std({ map: neb.map, emissiveMap: neb.glow, emissive: 0x7a8af2, emissiveIntensity: 0.6, roughness: 0.5 });
  const riftM = std({ color: 0xff7ad0, emissive: 0xf25aa8, emissiveIntensity: 1.3, roughness: 0.3, transparent: true, opacity: 0.85 });
  const boltM = std({ color: 0xc8d8ff, emissive: 0x9aaaff, emissiveIntensity: 1.7, roughness: 0.2 });
  const iceM = std({ color: 0xc8e0ff, emissive: 0x9ac0ff, emissiveIntensity: 0.6, roughness: 0.2, flatShading: true });

  const N = 9;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const sgrp = new THREE.Group();
    sgrp.position.set(0.32 - i * 0.24, 0, 0);
    const r = 0.23 * (1 - i / (N + 4));
    sgrp.add(orb(bodyM, r, 0, 0, 0, 1, 0.9, 1.08));
    sgrp.add(orb(riftM, r * 0.4, 0, -r * 0.5, 0, 1.4, 0.4, 0.9, 8, 7)); // rift seam
    core.add(sgrp); segs.push(sgrp);
  }

  const head = new THREE.Group();
  head.position.set(0.56, 0.02, 0);
  head.name = 'head';
  core.add(head);
  head.add(orb(bodyM, 0.24, 0, 0, 0, 1.2, 0.95, 1));
  head.add(bone(bodyM, 0.14, -0.04, 0, 0.36, -0.09, 0, 0.1, 0.06));
  // ice + rift crest horns
  for (const sgn of [1, -1]) { head.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 5), iceM).translateX(-0.04).translateY(0.2).translateZ(sgn * 0.12)); head.add(spike(riftM, 0.02, 0.16, sgn * 0.06, -0.1, 0.36, sgn * 0.1, 0.02)); }
  const eyeL = makeEye(0.06, 0xff7ad0, { glow: 1.4, slit: true });
  const eyeR = makeEye(0.06, 0xff7ad0, { glow: 1.4, slit: true });
  eyeL.position.set(0.14, 0.08, 0.13); eyeL.rotation.y = -0.3;
  eyeR.position.set(0.14, 0.08, -0.13); eyeR.rotation.y = 0.3;
  head.add(eyeL, eyeR);
  const jaw = new THREE.Group(); jaw.position.set(0.16, -0.12, 0); head.add(jaw);
  jaw.add(bone(bodyM, 0, 0, 0, 0.26, -0.02, 0, 0.07, 0.04));

  // the dragged rift behind the tail
  const rift = new THREE.Group();
  rift.position.set(0.32 - (N - 1) * 0.24 - 0.1, 0, 0);
  rift.name = 'tail';
  core.add(rift);
  const tear = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), riftM);
  tear.rotation.y = Math.PI / 2; tear.scale.set(0.5, 1.2, 1); tear.userData.noShadow = true; rift.add(tear);
  const tearRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20), boltM); tearRim.rotation.y = Math.PI / 2; tearRim.scale.set(0.5, 1.2, 1); rift.add(tearRim);
  const riftLight = new THREE.PointLight(0xf25aa8, 3, 3.5); rift.add(riftLight);
  const riftArcs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const arc = boltGroup(boltM, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.15, 0, Math.cos(a + 2) * 0.3, Math.sin(a + 2) * 0.15, 3, 0.01); rift.add(arc); riftArcs.push(arc); }

  finishShadows(g);
  const animate = (t: number) => {
    for (let i = 0; i < segs.length; i++) { segs[i].position.z = Math.sin(t * 1.9 - i * 0.55) * 0.17; segs[i].position.y = Math.sin(t * 1.9 - i * 0.55 + 1) * 0.05; segs[i].rotation.x = Math.sin(t * 1.9 - i * 0.55) * 0.13; }
    head.position.z = Math.sin(t * 1.9 + 0.55) * 0.17;
    head.rotation.y = Math.sin(t * 0.9) * 0.16 + Math.sin(t * 1.9 + 0.55) * 0.08;
    jaw.rotation.z = -(0.06 + gate(t, 6, 5) * 0.28);
    eyeL.scale.y = eyeR.scale.y = 1 - 0.85 * blinkAt(t, 5.5, 1.2);
    rift.position.z = Math.sin(t * 1.9 - (N - 1) * 0.55) * 0.17;
    bodyM.emissiveIntensity = 0.5 + Math.sin(t * 1.6) * 0.2;
    riftM.emissiveIntensity = 1.1 + Math.sin(t * 2.4) * 0.4; riftLight.intensity = 2.5 + Math.sin(t * 2.4) * 1;
    tear.scale.set(0.5 + Math.sin(t * 2) * 0.05, 1.2, 1); tear.rotation.z = t * 0.5;
    for (let i = 0; i < riftArcs.length; i++) riftArcs[i].visible = gate(t + i * 0.3, 1.0, 5) > 0.2;
  };
  return { body: g, parts: { head, tail: rift }, animate };
}

// ===== NEW BLAZE BUILDERS =====
function buildPyropup(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x221111, secondary: 0xc83232, accent: 0xff8a3a }, 0xff8a3a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const flame = makeFlame(0.22, 0.07);
  flame.position.set(0, 0.45, 0);
  tail.add(flame);
  const lt = new THREE.PointLight(0xff8a3a, 1.2, 2.5);
  flame.add(lt);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.02;
    head.rotation.y = Math.sin(t * 0.8) * 0.1;
    tail.rotation.z = Math.sin(t * 3.5) * 0.15;
    flame.scale.setScalar(1.0 + Math.sin(t * 10) * 0.12);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildPyrohound(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x110808, secondary: 0xa82222, accent: 0xff6a1e }, 0xff6a1e);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const flame1 = makeFlame(0.3, 0.08); flame1.position.set(0, 0.45, 0.08);
  const flame2 = makeFlame(0.3, 0.08); flame2.position.set(0, 0.45, -0.08);
  tail.add(flame1, flame2);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0xff6a1e, emissive: 0xff3a00, emissiveIntensity: 1.2 }));
  collar.position.set(0.2, 0.75, 0); collar.rotation.y = Math.PI / 2;
  g.add(collar);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.02;
    head.rotation.y = Math.sin(t * 0.7) * 0.08;
    tail.rotation.z = Math.sin(t * 3.0) * 0.18;
    flame1.scale.setScalar(1.0 + Math.sin(t * 11) * 0.15);
    flame2.scale.setScalar(1.0 + Math.sin(t * 9 + 1) * 0.15);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCindawing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xd9542e, secondary: 0xf2a13a, accent: 0xfff0c8 }, 0xffa05a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 20), new THREE.MeshBasicMaterial({ color: 0xfff0c8, blending: THREE.AdditiveBlending }));
  halo.position.set(0, 0.35, 0); halo.rotation.x = Math.PI / 2;
  head.add(halo);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 3) * 0.03;
    tail.rotation.z = Math.sin(t * 2.5) * 0.12;
    const w1 = g.getObjectByName('wing1'), w2 = g.getObjectByName('wing-1');
    if (w1) w1.rotation.x = Math.sin(t * 6) * 0.4;
    if (w2) w2.rotation.x = -Math.sin(t * 6) * 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCindafalcon(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xc4401e, secondary: 0xf2803a, accent: 0xffd28a }, 0xffa05a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const flare = makeFlame(0.4, 0.12, 0xffd28a, 0xf2803a);
  flare.position.set(-0.25, 0.3, 0); flare.rotation.z = Math.PI / 3;
  tail.add(flare);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.8) * 0.035;
    tail.rotation.z = Math.sin(t * 2.2) * 0.15;
    const w1 = g.getObjectByName('wing1'), w2 = g.getObjectByName('wing-1');
    if (w1) w1.rotation.x = Math.sin(t * 5) * 0.5;
    if (w2) w2.rotation.x = -Math.sin(t * 5) * 0.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildMagmatot(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x3a241c, secondary: 0xb0865a, accent: 0xffb44e }, 0xff7a2a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const glowNode = orb(new THREE.MeshStandardMaterial({ color: 0xffb44e, emissive: 0xff5a1e, emissiveIntensity: 1.5 }), 0.08, 0, 0.48, 0);
  g.add(glowNode);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.8) * 0.012;
    glowNode.scale.setScalar(1.0 + Math.sin(t * 4) * 0.08);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildMagmatort(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x2e1a14, secondary: 0x8a6442, accent: 0xff7a2a }, 0xff5a1e);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const volc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x2e1a14, roughness: 0.9 }));
  volc.position.set(-0.1, 0.55, 0);
  const lava = makeFlame(0.2, 0.08);
  lava.position.set(0, 0.16, 0); volc.add(lava);
  g.add(volc);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.5) * 0.015;
    lava.scale.setScalar(1.0 + Math.sin(t * 12) * 0.2);
  };
  return { body: g, parts: { head, tail }, animate };
}

// ===== NEW TIDE BUILDERS =====
function buildBubbledrag(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x3a8dd9, secondary: 0x6ec4f2, accent: 0xd8f2ff }, 0x3a8dd9);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const bubble = orb(new THREE.MeshStandardMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.5, roughness: 0.1 }), 0.12, 0.1, 0.35, 0);
  head.add(bubble);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.025;
    tail.rotation.z = Math.sin(t * 3.0) * 0.15;
    bubble.position.y = 0.35 + Math.sin(t * 5) * 0.06;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildPearlwyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x2a6dc4, secondary: 0x5ab8e8, accent: 0xc8ecff }, 0x5ab8e8);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9 });
  const p1 = orb(pearlMat, 0.05, 0.05, 0.32, 0.06);
  const p2 = orb(pearlMat, 0.05, 0.05, 0.32, -0.06);
  head.add(p1, p2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.1) * 0.03;
    tail.rotation.z = Math.sin(t * 2.8) * 0.18;
    p1.position.y = 0.32 + Math.sin(t * 4) * 0.02;
    p2.position.y = 0.32 + Math.sin(t * 4 + 1.5) * 0.02;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildMistpaw(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x6a9ac4, secondary: 0xa8d0e8, accent: 0xe8f4ff }, 0x9adff2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0x9adff2, transparent: true, opacity: 0.8 }));
  crystal.position.set(-0.15, 0.28, 0); crystal.rotation.z = -Math.PI / 4;
  head.add(crystal);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.02;
    tail.rotation.z = Math.sin(t * 3.3) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildFrostlynx(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x4a7aa8, secondary: 0x8ac0e8, accent: 0xc0e0ff }, 0xaccfe2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const crys1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xaccfe2, emissive: 0xaccfe2, emissiveIntensity: 0.3 }));
  crys1.position.set(-0.2, 0.85, 0.2); crys1.rotation.x = Math.PI / 6;
  const crys2 = crys1.clone(); crys2.position.z = -0.2; crys2.rotation.x = -Math.PI / 6;
  g.add(crys1, crys2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.3) * 0.022;
    tail.rotation.z = Math.sin(t * 2.9) * 0.15;
    crys1.rotation.y = crys2.rotation.y = t * 0.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCoralbud(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xe8838a, secondary: 0x6ec4f2, accent: 0xfff0e0 }, 0xe8838a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const coral = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xe8838a, roughness: 0.9 }));
  coral.position.set(0, 0.55, 0);
  g.add(coral);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.7) * 0.012;
    coral.rotation.y = Math.sin(t * 2.5) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildReefguard(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xc86a78, secondary: 0x3a9df2, accent: 0xc8ecff }, 0xc86a78);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spike1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 5), new THREE.MeshStandardMaterial({ color: 0xc86a78, emissive: 0xc86a78, emissiveIntensity: 0.4 }));
  spike1.position.set(0.18, 0.58, 0.18);
  const spike2 = spike1.clone(); spike2.position.z = -0.18;
  g.add(spike1, spike2);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.4) * 0.016;
    spike1.position.y = 0.58 + Math.sin(t * 3.2) * 0.02;
    spike2.position.y = 0.58 + Math.cos(t * 3.2) * 0.02;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ===== NEW VERDANT BUILDERS =====
function buildSeedsqrl(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x6a9a3a, secondary: 0xa8d95a, accent: 0xf2d23a }, 0xa8d95a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.42), new THREE.MeshStandardMaterial({ color: 0x6a9a3a, side: THREE.DoubleSide }));
  leaf.position.set(0, 0.42, 0); leaf.rotation.y = Math.PI / 2;
  tail.add(leaf);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.02;
    tail.rotation.z = Math.sin(t * 3.5) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildVoltcanopy(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x4a7a2e, secondary: 0x8ac45a, accent: 0xd9c42a }, 0xd9c42a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const bolt = boltGroup(new THREE.MeshBasicMaterial({ color: 0xd9c42a }), 0, 0.72, 0.1, 0, 0.95, 0.22, 3, 0.01);
  g.add(bolt);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.3) * 0.022;
    tail.rotation.z = Math.sin(t * 3.1) * 0.15;
    bolt.visible = gate(t, 1.2, 4) > 0.35;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSporepix(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xc46a8a, secondary: 0xe8d0a8, accent: 0x8ad95a }, 0x8ad95a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spore = orb(new THREE.MeshStandardMaterial({ color: 0x8ad95a, emissive: 0x8ad95a, emissiveIntensity: 1.2 }), 0.05, 0, 0.95, 0);
  g.add(spore);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.0) * 0.03;
    spore.position.y = 0.95 + Math.sin(t * 4.5) * 0.06;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildFungoking(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xa84a6a, secondary: 0xd9b88a, accent: 0x5aa84e }, 0x5aa84e);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xa84a6a, roughness: 0.85 }));
  cap.position.set(0, 0.95, 0);
  g.add(cap);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 1.8) * 0.035;
    cap.rotation.y = t * 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildRootlet(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x8a7a5a, secondary: 0xb0a080, accent: 0x6ec45e }, 0x6ec45e);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0xb0a080, roughness: 0.9 }));
  shield.position.set(0.18, 0.9, 0.62); shield.rotation.z = Math.PI / 2;
  g.add(shield);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 2.2) * 0.025;
    shield.rotation.y = Math.sin(t * 1.5) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildGrovewarden(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x6a5a3a, secondary: 0x908060, accent: 0x4ec45e }, 0x4ec45e);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const stone1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x908060, roughness: 0.95 }));
  stone1.position.set(0.08, 1.35, 0.55);
  const stone2 = stone1.clone(); stone2.position.z = -0.55;
  g.add(stone1, stone2);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 2.0) * 0.03;
    stone1.rotation.y = t * 0.6;
    stone2.rotation.y = -t * 0.6;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ===== NEW VOLT BUILDERS =====
function buildJoltmous(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xf2e06e, secondary: 0xffffff, accent: 0x6ec4f2 }, 0x6ec4f2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const bolt = boltGroup(new THREE.MeshBasicMaterial({ color: 0x6ec4f2 }), -0.15, 0.45, 0, -0.4, 0.65, 0, 2, 0.008);
  tail.add(bolt);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.8) * 0.02;
    tail.rotation.z = Math.sin(t * 3.8) * 0.15;
    bolt.visible = gate(t, 0.9, 4) > 0.35;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildGalvanix(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xd9c43a, secondary: 0x4a4a5a, accent: 0x5ab8e8 }, 0x5ab8e8);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x3a9df2, emissiveIntensity: 1.4 }));
  ring.position.set(0, 0.58, 0); ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.022;
    tail.rotation.z = Math.sin(t * 3.2) * 0.18;
    ring.scale.setScalar(1.0 + Math.sin(t * 9) * 0.1);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSparkeef(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0xe8d05a, secondary: 0xfff0a8, accent: 0x3a9df2 }, 0x3a9df2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spark = boltGroup(new THREE.MeshBasicMaterial({ color: 0x3a9df2 }), 0, 0.42, 0, 0.15, 0.65, 0.1, 2, 0.008);
  g.add(spark);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.025;
    tail.rotation.z = Math.sin(t * 3.4) * 0.15;
    spark.visible = gate(t, 1.1, 3) > 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildTesladrag(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0xc4ae2a, secondary: 0xe8cc3a, accent: 0x2a7dd9 }, 0x2a7dd9);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a7dd9, emissive: 0x2a7dd9, emissiveIntensity: 1.2 }));
  const ring2 = ring1.clone();
  ring1.position.set(-0.1, 0.55, 0); ring2.position.set(-0.25, 0.85, 0);
  ring1.rotation.y = ring2.rotation.y = Math.PI / 2;
  g.add(ring1, ring2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.03;
    tail.rotation.z = Math.sin(t * 2.9) * 0.18;
    ring1.scale.setScalar(1.0 + Math.sin(t * 8) * 0.12);
    ring2.scale.setScalar(1.0 + Math.cos(t * 8) * 0.12);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildStormchick(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xffd700, secondary: 0xffffff, accent: 0x4b0082 }, 0xffd700);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spike1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.6 }));
  spike1.position.set(0, 0.32, 0);
  head.add(spike1);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 3.1) * 0.03;
    tail.rotation.z = Math.sin(t * 2.6) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildVoltwing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xe8c42a, secondary: 0xe8ecff, accent: 0x4169e1 }, 0x4169e1);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const b1 = boltGroup(new THREE.MeshBasicMaterial({ color: 0x4169e1 }), 0, 0.85, 0.3, 0.2, 1.2, 0.6, 3, 0.012);
  const b2 = boltGroup(new THREE.MeshBasicMaterial({ color: 0x4169e1 }), 0, 0.85, -0.3, 0.2, 1.2, -0.6, 3, 0.012);
  g.add(b1, b2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.8) * 0.035;
    tail.rotation.z = Math.sin(t * 2.3) * 0.15;
    b1.visible = b2.visible = gate(t, 1.3, 4) > 0.3;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ===== NEW GALE BUILDERS =====
function buildNebulet(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x5ac4b8, secondary: 0xa8e8e0, accent: 0xff9ad2 }, 0xff9ad2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const dust = orb(new THREE.MeshBasicMaterial({ color: 0xff9ad2, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }), 0.28, 0, 0.55, 0);
  g.add(dust);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.02;
    tail.rotation.z = Math.sin(t * 3.3) * 0.12;
    dust.scale.setScalar(1.0 + Math.sin(t * 3) * 0.15);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildAstralpaw(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x3aa89a, secondary: 0x7adfd0, accent: 0xff9ad2 }, 0xff9ad2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const star = orb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff9ad2, emissiveIntensity: 1.5 }), 0.06, 0, 1.35, 0);
  g.add(star);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.022;
    tail.rotation.z = Math.sin(t * 3.0) * 0.15;
    star.position.y = 1.35 + Math.sin(t * 6) * 0.08;
    star.rotation.y = t * 1.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildGalewyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x8ad0c8, secondary: 0xc8f0e8, accent: 0x9adff2 }, 0x9adff2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), new THREE.MeshStandardMaterial({ color: 0x9adff2, transparent: true, opacity: 0.85 }));
  crystal.position.set(-0.15, 0.32, 0); crystal.rotation.z = Math.PI / 4;
  head.add(crystal);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.025;
    tail.rotation.z = Math.sin(t * 3.2) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildTempestwyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x5acfc0, secondary: 0xaccfe2, accent: 0x3a8dd9 }, 0x3a8dd9);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const crys = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 5), new THREE.MeshStandardMaterial({ color: 0x3a8dd9, emissive: 0x3a8dd9, emissiveIntensity: 0.8 }));
  crys.position.set(0, 0.72, 0);
  g.add(crys);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.1) * 0.03;
    tail.rotation.z = Math.sin(t * 2.7) * 0.18;
    crys.position.set(Math.cos(t * 4.5) * 0.42, 0.72 + Math.sin(t * 2) * 0.05, Math.sin(t * 4.5) * 0.42);
    crys.rotation.y = t * 1.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCosmolet(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xd8e8f2, secondary: 0xf2f8ff, accent: 0xff9ad2 }, 0xff9ad2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: 0xff9ad2 }));
  ring.position.set(0, 0.55, 0); ring.rotation.x = Math.PI / 2.3;
  g.add(ring);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 1.9) * 0.03;
    ring.rotation.z = t * 0.8;
  };
  return { body: g, parts: { head, tail }, animate };
}

// stargaze builder definition
function buildStargazer(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xb8d0e8, secondary: 0xffffff, accent: 0xff9ad2 }, 0xff9ad2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: 0xff9ad2 }));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 24), new THREE.MeshStandardMaterial({ color: 0xff9ad2 }));
  ring1.position.set(0, 0.55, 0); ring1.rotation.x = Math.PI / 2.2;
  ring2.position.set(0, 0.55, 0); ring2.rotation.x = Math.PI / 1.85;
  g.add(ring1, ring2);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 1.7) * 0.035;
    ring1.rotation.z = t * 0.6;
    ring2.rotation.z = -t * 0.9;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ===== NEW UMBRA BUILDERS =====
function buildVoidkit(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x5a3a8a, secondary: 0x9a5af2, accent: 0xf25aa8 }, 0x9a5af2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.02;
    tail.rotation.z = Math.sin(t * 3.4) * 0.12;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildNebularix(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x3a1a6a, secondary: 0x7a3ad0, accent: 0xd94a8a }, 0xd94a8a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const rift = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16), new THREE.MeshStandardMaterial({ color: 0xd94a8a, emissive: 0x9a5af2, emissiveIntensity: 1.5 }));
  rift.position.set(0, 0.45, 0); rift.rotation.y = Math.PI / 2;
  tail.add(rift);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.3) * 0.022;
    tail.rotation.z = Math.sin(t * 3.1) * 0.15;
    rift.scale.set(0.8 + Math.sin(t * 5) * 0.15, 1.2, 1);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildVampbat(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x3a2a5a, secondary: 0x6a4a9a, accent: 0xe85a9a }, 0xe85a9a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.9) * 0.03;
    tail.rotation.z = Math.sin(t * 2.4) * 0.12;
    const w1 = g.getObjectByName('wing1'), w2 = g.getObjectByName('wing-1');
    if (w1) w1.rotation.x = Math.sin(t * 5.5) * 0.45;
    if (w2) w2.rotation.x = -Math.sin(t * 5.5) * 0.45;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildNosferatus(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x221442, secondary: 0x5a3a8a, accent: 0xff00ff }, 0xff00ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const bolt = boltGroup(new THREE.MeshBasicMaterial({ color: 0xff00ff }), 0, 0.85, 0.35, 0.1, 1.2, 0.65, 2, 0.01);
  g.add(bolt);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.6) * 0.035;
    tail.rotation.z = Math.sin(t * 2.1) * 0.15;
    const w1 = g.getObjectByName('wing1'), w2 = g.getObjectByName('wing-1');
    if (w1) w1.rotation.x = Math.sin(t * 4.8) * 0.55;
    if (w2) w2.rotation.x = -Math.sin(t * 4.8) * 0.55;
    bolt.visible = gate(t, 1.5, 3) > 0.45;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildGravemini(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x44405a, secondary: 0x6a648a, accent: 0xc4b46a }, 0xc4b46a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const mark = orb(new THREE.MeshStandardMaterial({ color: 0xc4b46a, emissive: 0xc4b46a, emissiveIntensity: 1.0 }), 0.05, 0.1, 1.35, 0);
  head.add(mark);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 2.1) * 0.025;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildGravemonolith(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x2e2a3a, secondary: 0x565070, accent: 0x9a5af2 }, 0x9a5af2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.22), new THREE.MeshStandardMaterial({ color: 0x2e2a3a, roughness: 0.95 }));
  slab.position.set(-0.28, 0.85, 0); slab.rotation.y = Math.PI / 4;
  g.add(slab);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 1.9) * 0.03;
    slab.position.y = 0.85 + Math.sin(t * 2.2) * 0.04;
  };
  return { body: g, parts: { head, tail }, animate };
}

// ================= NEW BLAZE BUILDERS =================
function buildFlamesal(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0xe65c00, secondary: 0xffcc00, accent: 0x333333 }, 0xffaa00);
  const head = g.getObjectByName('head')!;
  const f = makeFlame(0.24, 0.08, 0xffea88, 0xff5500);
  f.position.set(0.1, 0.25, 0);
  head.add(f);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.02;
    f.scale.setScalar(1.0 + Math.sin(t * 8) * 0.15);
  };
  return { body: g, parts: { head }, animate };
}

function buildEmberskink(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0xff3300, secondary: 0xff9900, accent: 0x555555 }, 0xffaa00);
  const head = g.getObjectByName('head')!;
  const f = makeFlame(0.35, 0.12, 0xffea88, 0xff5500);
  f.position.set(0.12, 0.3, 0);
  head.add(f);
  const ember = orb(new THREE.MeshBasicMaterial({ color: 0xffaa00 }), 0.05, -0.4, 0.8, 0);
  g.add(ember);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.3) * 0.025;
    f.scale.setScalar(1.0 + Math.sin(t * 9) * 0.15);
    ember.position.y = 0.8 + Math.sin(t * 4.5) * 0.08;
  };
  return { body: g, parts: { head }, animate };
}

function buildLavaserpent(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0xcc2200, secondary: 0xff6600, accent: 0x222222 }, 0xff5500);
  const head = g.getObjectByName('head')!;
  const spikes: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const s = spike(std({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 1.0 }), -0.2 * i, 0.4 + i * 0.3, 0, -0.2 * i, 0.6 + i * 0.3, 0, 0.06);
    g.add(s);
    spikes.push(s);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.1) * 0.028;
    spikes.forEach((s, idx) => {
      s.position.y = Math.sin(t * 3 + idx) * 0.03;
    });
  };
  return { body: g, parts: { head }, animate };
}

function buildMagmadrak(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x880000, secondary: 0xff3300, accent: 0x111111 }, 0xff2200);
  const head = g.getObjectByName('head')!;
  const f = makeFlame(0.55, 0.18, 0xffea88, 0xff2200);
  f.position.set(0.15, 0.45, 0);
  head.add(f);
  const wing1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 5), std({ color: 0x111111 }));
  wing1.position.set(-0.2, 0.8, 0.25); wing1.rotation.set(Math.PI / 4, 0, Math.PI / 6);
  const wing2 = wing1.clone();
  wing2.position.set(-0.2, 0.8, -0.25); wing2.rotation.set(-Math.PI / 4, 0, Math.PI / 6);
  g.add(wing1, wing2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 1.9) * 0.03;
    f.scale.setScalar(1.0 + Math.sin(t * 10) * 0.2);
    wing1.rotation.z = Math.PI / 6 + Math.sin(t * 2.5) * 0.1;
    wing2.rotation.z = Math.PI / 6 + Math.sin(t * 2.5) * 0.1;
  };
  return { body: g, parts: { head, wings: [wing1, wing2] }, animate };
}

function buildCoalbug(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x111111, secondary: 0x333333, accent: 0xff3300 }, 0xff3300);
  const head = g.getObjectByName('head')!;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), std({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.2 }));
  horn.position.set(0.15, 0.15, 0); horn.rotation.z = -Math.PI / 3;
  head.add(horn);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.8) * 0.015;
  };
  return { body: g, parts: { head }, animate };
}

function buildCinderscarab(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x1a1a1a, secondary: 0x444444, accent: 0xff5500 }, 0xff5500);
  const head = g.getObjectByName('head')!;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), std({ color: 0xff5500, emissive: 0xff5500, emissiveIntensity: 1.4 }));
  horn.position.set(0.18, 0.18, 0); horn.rotation.z = -Math.PI / 3;
  head.add(horn);
  const f = makeFlame(0.18, 0.06, 0xffea88, 0xff5500);
  f.position.set(-0.2, 0.45, 0);
  g.add(f);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.6) * 0.02;
    f.scale.setScalar(1.0 + Math.sin(t * 8) * 0.15);
  };
  return { body: g, parts: { head }, animate };
}

function buildPyroshell(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x222222, secondary: 0x555555, accent: 0xff7700 }, 0xff7700);
  const head = g.getObjectByName('head')!;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.36, 6), std({ color: 0xff7700, emissive: 0xff7700, emissiveIntensity: 1.5 }));
  horn.position.set(0.2, 0.2, 0); horn.rotation.z = -Math.PI / 3;
  head.add(horn);
  const embers: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const emb = orb(new THREE.MeshBasicMaterial({ color: 0xff7700 }), 0.04, 0, 0.6, 0);
    g.add(emb);
    embers.push(emb);
  }
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.4) * 0.022;
    embers.forEach((emb, i) => {
      const a = t * 2.0 + (i * Math.PI * 2 / 3);
      emb.position.set(Math.cos(a) * 0.5, 0.6 + Math.sin(t * 4 + i) * 0.05, Math.sin(a) * 0.5);
    });
  };
  return { body: g, parts: { head }, animate };
}

function buildCoalossus(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x1a1515, secondary: 0x3d3030, accent: 0xff2200 }, 0xff2200);
  const head = g.getObjectByName('head')!;
  const furnace = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), std({ color: 0x3d3030, emissive: 0xff2200, emissiveIntensity: 1.8 }));
  furnace.position.set(-0.1, 1.1, 0);
  g.add(furnace);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 1.8) * 0.025;
    furnace.position.y = 1.1 + Math.sin(t * 2.2) * 0.03;
    furnace.rotation.y = t * 0.5;
  };
  return { body: g, parts: { head }, animate };
}

function buildFlarefly(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xffaa00, secondary: 0xffdd44, accent: 0xffffff }, 0xffeedd);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail') ?? undefined;
  const w1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 4), std({ color: 0xffaa00, transparent: true, opacity: 0.8 }));
  const w2 = w1.clone();
  w1.position.set(-0.15, 0.65, 0.15); w1.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  w2.position.set(-0.15, 0.65, -0.15); w2.rotation.set(-Math.PI / 4, 0, Math.PI / 4);
  g.add(w1, w2);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 3.2) * 0.03;
    if (tail) tail.rotation.z = t * 3;
    w1.rotation.z = Math.PI / 4 + Math.sin(t * 20) * 0.25;
    w2.rotation.z = Math.PI / 4 + Math.sin(t * 20) * 0.25;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildSparkwing(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xff8800, secondary: 0xffcc33, accent: 0xffea88 }, 0xffea88);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail') ?? undefined;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 6, 18), std({ color: 0xffea88, emissive: 0xffea88, emissiveIntensity: 1.4 }));
  halo.position.set(0, 0.95, 0); halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const w1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 4), std({ color: 0xff8800, transparent: true, opacity: 0.85 }));
  const w2 = w1.clone(), w3 = w1.clone(), w4 = w1.clone();
  w1.position.set(-0.2, 0.68, 0.18); w1.rotation.set(Math.PI / 4, 0, Math.PI / 3);
  w2.position.set(-0.2, 0.68, -0.18); w2.rotation.set(-Math.PI / 4, 0, Math.PI / 3);
  w3.position.set(-0.25, 0.48, 0.12); w3.rotation.set(Math.PI / 4, 0, Math.PI / 2);
  w4.position.set(-0.25, 0.48, -0.12); w4.rotation.set(-Math.PI / 4, 0, Math.PI / 2);
  g.add(w1, w2, w3, w4);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 3.0) * 0.035;
    if (tail) tail.rotation.z = t * 2.5;
    halo.position.y = 0.95 + Math.sin(t * 4) * 0.04;
    w1.rotation.z = Math.PI / 3 + Math.sin(t * 22) * 0.22;
    w2.rotation.z = Math.PI / 3 + Math.sin(t * 22) * 0.22;
    w3.rotation.z = Math.PI / 2 + Math.sin(t * 22 + 1) * 0.2;
    w4.rotation.z = Math.PI / 2 + Math.sin(t * 22 + 1) * 0.2;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2, w3, w4] }, animate };
}

function buildLumiprix(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xffaa44, secondary: 0xffe088, accent: 0xffffff }, 0xffffff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail') ?? undefined;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 }));
  halo.position.set(0, 1.05, 0); halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const fireflies: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = orb(new THREE.MeshBasicMaterial({ color: 0xffe088 }), 0.035, 0, 0.6, 0);
    g.add(f);
    fireflies.push(f);
  }
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.8) * 0.04;
    if (tail) tail.rotation.z = t * 2;
    halo.position.y = 1.05 + Math.sin(t * 3.5) * 0.05;
    fireflies.forEach((f, idx) => {
      const a = t * 2.5 + (idx * Math.PI * 2 / 3);
      f.position.set(Math.cos(a) * 0.45, 0.6 + Math.sin(t * 5 + idx) * 0.08, Math.sin(a) * 0.45);
    });
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildAurorafire(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0xff3366, secondary: 0xffaa33, accent: 0xffffff }, 0xffffff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail') ?? undefined;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 24), std({ color: 0xffffff, emissive: 0xffeedd, emissiveIntensity: 1.6 }));
  halo.position.set(0, 1.15, 0); halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3366, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8 }));
  wing1.position.set(-0.25, 0.75, 0.2); wing1.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  const wing2 = wing1.clone();
  wing2.position.set(-0.25, 0.75, -0.2); wing2.rotation.set(-Math.PI / 4, 0, Math.PI / 4);
  const wing3 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xffaa33, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8 }));
  wing3.position.set(-0.3, 0.55, 0.15); wing3.rotation.set(Math.PI / 4, 0, Math.PI / 3);
  const wing4 = wing3.clone();
  wing4.position.set(-0.3, 0.55, -0.15); wing4.rotation.set(-Math.PI / 4, 0, Math.PI / 3);
  g.add(wing1, wing2, wing3, wing4);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.5) * 0.045;
    if (tail) tail.rotation.z = t * 1.8;
    halo.position.y = 1.15 + Math.sin(t * 3) * 0.06;
    const wingSweep = Math.sin(t * 4) * 0.15;
    wing1.rotation.z = Math.PI / 4 + wingSweep;
    wing2.rotation.z = Math.PI / 4 + wingSweep;
    wing3.rotation.z = Math.PI / 3 + wingSweep * 0.8;
    wing4.rotation.z = Math.PI / 3 + wingSweep * 0.8;
  };
  return { body: g, parts: { head, tail, wings: [wing1, wing2, wing3, wing4] }, animate };
}

// ================= NEW TIDE BUILDERS =================
function buildWavepup(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x4a90e2, secondary: 0xffffff, accent: 0xb8e986 }, 0x4a90e2);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ear1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), std({ color: 0x4a90e2 }));
  ear1.position.set(0.1, 0.12, 0.18); ear1.rotation.set(Math.PI / 4, 0, -Math.PI / 4);
  const ear2 = ear1.clone();
  ear2.position.set(0.1, 0.12, -0.18); ear2.rotation.set(-Math.PI / 4, 0, -Math.PI / 4);
  head.add(ear1, ear2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.02;
    tail.rotation.z = Math.sin(t * 4) * 0.2;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildTidehound(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x357ebd, secondary: 0xe0f7fa, accent: 0x80deea }, 0x80deea);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const bubble1 = orb(new THREE.MeshStandardMaterial({ color: 0x80deea, transparent: true, opacity: 0.6 }), 0.05, -0.2, 0.7, 0.2);
  const bubble2 = orb(new THREE.MeshStandardMaterial({ color: 0x80deea, transparent: true, opacity: 0.6 }), 0.04, -0.4, 0.8, -0.2);
  g.add(bubble1, bubble2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.022;
    tail.rotation.z = Math.sin(t * 3.6) * 0.22;
    bubble1.position.y = 0.7 + Math.sin(t * 5) * 0.1;
    bubble2.position.y = 0.8 + Math.sin(t * 4.2 + 1) * 0.1;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildOceanclysm(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x1d5a91, secondary: 0xb2ebf2, accent: 0x00acc1 }, 0x00acc1);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ridge1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), std({ color: 0x00acc1 }));
  ridge1.position.set(-0.1, 0.95, 0); ridge1.rotation.z = Math.PI / 6;
  const ridge2 = ridge1.clone(); ridge2.position.set(-0.35, 0.85, 0);
  g.add(ridge1, ridge2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.025;
    tail.rotation.z = Math.sin(t * 3.2) * 0.25;
    ridge1.rotation.z = Math.PI / 6 + Math.sin(t * 2) * 0.08;
    ridge2.rotation.z = Math.PI / 6 + Math.sin(t * 2 + 0.5) * 0.08;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildAbysshound(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x0b1d33, secondary: 0x006064, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), std({ color: 0x006064 }));
  pole.position.set(0.15, 0.35, 0); pole.rotation.z = -Math.PI / 4;
  const light = orb(new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.8 }), 0.06, 0.15, 0.52, 0);
  head.add(pole, light);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.0) * 0.03;
    tail.rotation.z = Math.sin(t * 2.8) * 0.28;
    light.scale.setScalar(1.0 + Math.sin(t * 8) * 0.2);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildJellymote(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0x00bcd4, secondary: 0x80deea, accent: 0xffffff }, 0x00bcd4);
  const head = g.getObjectByName('head')!;
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), std({ color: 0x80deea, transparent: true, opacity: 0.7 }));
  t1.position.set(-0.1, 0.2, 0.1);
  const t2 = t1.clone(); t2.position.set(-0.1, 0.2, -0.1);
  const t3 = t1.clone(); t3.position.set(0.1, 0.2, 0);
  g.add(t1, t2, t3);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.8) * 0.03;
    t1.rotation.z = Math.sin(t * 4 + 0) * 0.15;
    t2.rotation.z = Math.sin(t * 4 + 1) * 0.15;
    t3.rotation.x = Math.sin(t * 4 + 2) * 0.15;
  };
  return { body: g, parts: { head }, animate };
}

function buildAquajelly(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0x00acc1, secondary: 0xb2ebf2, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), std({ color: 0xb2ebf2, transparent: true, opacity: 0.75 }));
  t1.position.set(-0.15, 0.15, 0.15);
  const t2 = t1.clone(); t2.position.set(-0.15, 0.15, -0.15);
  const t3 = t1.clone(); t3.position.set(0.15, 0.15, 0.15);
  const t4 = t1.clone(); t4.position.set(0.15, 0.15, -0.15);
  g.add(t1, t2, t3, t4);
  const arc = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), 0, 0.45, 0, 0, 0.1, 0, 2, 0.006);
  g.add(arc);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.6) * 0.035;
    t1.rotation.z = Math.sin(t * 3.8) * 0.18;
    t2.rotation.z = Math.sin(t * 3.8 + 1) * 0.18;
    t3.rotation.x = Math.sin(t * 3.8 + 2) * 0.18;
    t4.rotation.x = Math.sin(t * 3.8 + 3) * 0.18;
    arc.visible = gate(t, 1.0, 3) > 0.4;
  };
  return { body: g, parts: { head }, animate };
}

function buildVoltmedusa(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0x00838f, secondary: 0xe0f7fa, accent: 0xffeb3b }, 0xffeb3b);
  const head = g.getObjectByName('head')!;
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), std({ color: 0xe0f7fa, transparent: true, opacity: 0.8 }));
  t1.position.set(-0.2, 0.05, 0.2);
  const t2 = t1.clone(); t2.position.set(-0.2, 0.05, -0.2);
  const t3 = t1.clone(); t3.position.set(0.2, 0.05, 0.2);
  const t4 = t1.clone(); t4.position.set(0.2, 0.05, -0.2);
  g.add(t1, t2, t3, t4);
  const arc1 = boltGroup(new THREE.MeshBasicMaterial({ color: 0xffeb3b }), -0.15, 0.5, 0, -0.3, 0.0, 0, 2, 0.008);
  const arc2 = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), 0.15, 0.5, 0, 0.3, 0.0, 0, 2, 0.008);
  g.add(arc1, arc2);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.4) * 0.04;
    t1.rotation.z = Math.sin(t * 3.5) * 0.2;
    t2.rotation.z = Math.sin(t * 3.5 + 1) * 0.2;
    t3.rotation.x = Math.sin(t * 3.5 + 2) * 0.2;
    t4.rotation.x = Math.sin(t * 3.5 + 3) * 0.2;
    arc1.visible = gate(t, 1.2, 4) > 0.45;
    arc2.visible = gate(t + 0.6, 1.2, 4) > 0.45;
  };
  return { body: g, parts: { head }, animate };
}

function buildAbysssiren(): BespokeBuild {
  const g = buildProceduralArchetype('sprite', { primary: 0x1a237e, secondary: 0x00bcd4, accent: 0xe040fb }, 0xe040fb);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail') ?? undefined;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 8, 24), std({ color: 0xe040fb, emissive: 0xe040fb, emissiveIntensity: 1.5 }));
  halo.position.set(0, 1.05, 0); halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), std({ color: 0x00bcd4, transparent: true, opacity: 0.85 }));
  t1.position.set(-0.25, -0.1, 0.25);
  const t2 = t1.clone(); t2.position.set(-0.25, -0.1, -0.25);
  const t3 = t1.clone(); t3.position.set(0.25, -0.1, 0.25);
  const t4 = t1.clone(); t4.position.set(0.25, -0.1, -0.25);
  g.add(t1, t2, t3, t4);
  const arc = boltGroup(new THREE.MeshBasicMaterial({ color: 0xe040fb }), 0, 0.6, 0, 0, -0.2, 0, 3, 0.01);
  g.add(arc);
  const animate = (t: number) => {
    head.position.y = 0.55 + Math.sin(t * 2.2) * 0.045;
    if (tail) tail.rotation.z = t * 1.5;
    halo.position.y = 1.05 + Math.sin(t * 3) * 0.05;
    t1.rotation.z = Math.sin(t * 3.2) * 0.22;
    t2.rotation.z = Math.sin(t * 3.2 + 1) * 0.22;
    t3.rotation.x = Math.sin(t * 3.2 + 2) * 0.22;
    t4.rotation.x = Math.sin(t * 3.2 + 3) * 0.22;
    arc.visible = gate(t, 1.0, 4) > 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSeaturt(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x4caf50, secondary: 0x8d6e63, accent: 0xa5d6a7 }, 0xa5d6a7);
  const head = g.getObjectByName('head')!;
  const spike1 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), std({ color: 0x8d6e63 }));
  spike1.position.set(-0.15, 0.6, 0.15); spike1.rotation.set(0.2, 0, -0.2);
  const spike2 = spike1.clone();
  spike2.position.set(-0.15, 0.6, -0.15); spike2.rotation.set(-0.2, 0, -0.2);
  const spike3 = spike1.clone();
  spike3.position.set(-0.35, 0.5, 0); spike3.rotation.set(0, 0, -0.4);
  g.add(spike1, spike2, spike3);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.2) * 0.015;
  };
  return { body: g, parts: { head }, animate };
}

function buildReefscale(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x2e7d32, secondary: 0xd7ccc8, accent: 0xff4081 }, 0xff4081);
  const head = g.getObjectByName('head')!;
  const coral1 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 5), std({ color: 0xff4081, emissive: 0xff4081, emissiveIntensity: 0.6 }));
  coral1.position.set(-0.15, 0.65, 0.15); coral1.rotation.set(0.3, 0, -0.2);
  const coral2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), std({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.6 }));
  coral2.position.set(-0.15, 0.65, -0.15); coral2.rotation.set(-0.3, 0, -0.2);
  const coral3 = coral1.clone();
  coral3.position.set(-0.38, 0.55, 0); coral3.rotation.set(0, 0, -0.4);
  g.add(coral1, coral2, coral3);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.0) * 0.018;
    coral1.rotation.z = -0.2 + Math.sin(t * 2) * 0.05;
    coral2.rotation.z = -0.2 + Math.cos(t * 2) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

function buildPearlshield(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x1b5e20, secondary: 0xe0f2f1, accent: 0xffffff }, 0xffffff);
  const head = g.getObjectByName('head')!;
  const pearl = orb(std({ color: 0xffffff, emissive: 0xe0f2f1, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.1 }), 0.16, -0.12, 0.72, 0);
  g.add(pearl);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.8) * 0.02;
    pearl.position.y = 0.72 + Math.sin(t * 3) * 0.02;
  };
  return { body: g, parts: { head }, animate };
}

function buildOceantitan(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0x0d5330, secondary: 0x4e342e, accent: 0x80cb99 }, 0x80cb99);
  const head = g.getObjectByName('head')!;
  const reef1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), std({ color: 0x2e7d32 }));
  reef1.position.set(-0.1, 0.72, 0.2); reef1.rotation.set(0.2, 0.1, -0.1);
  const reef2 = reef1.clone();
  reef2.position.set(-0.1, 0.72, -0.2); reef2.rotation.set(-0.2, -0.1, -0.1);
  const reef3 = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 5), std({ color: 0x00acc1, emissive: 0x00acc1, emissiveIntensity: 0.4 }));
  reef3.position.set(-0.4, 0.65, 0); reef3.rotation.set(0, 0, -0.3);
  g.add(reef1, reef2, reef3);
  g.scale.setScalar(1.28);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.5) * 0.025;
    reef1.rotation.z = -0.1 + Math.sin(t * 1.6) * 0.04;
    reef2.rotation.z = -0.1 + Math.cos(t * 1.6) * 0.04;
  };
  return { body: g, parts: { head }, animate };
}

// ================= NEW VERDANT BUILDERS =================
function buildLeaffawn(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x8d6e63, secondary: 0xa5d6a7, accent: 0xffffff }, 0xa5d6a7);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const leaf1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.08), std({ color: 0xa5d6a7 }));
  leaf1.position.set(-0.05, 0.32, 0.16); leaf1.rotation.set(Math.PI / 4, 0, -Math.PI / 6);
  const leaf2 = leaf1.clone();
  leaf2.position.set(-0.05, 0.32, -0.16); leaf2.rotation.set(-Math.PI / 4, 0, -Math.PI / 6);
  head.add(leaf1, leaf2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.02;
    tail.rotation.z = Math.sin(t * 3.5) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

// Helper to avoid duplicate name conflicts
function buildSylvadeer(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x6d4c41, secondary: 0x81c784, accent: 0xffecb3 }, 0xffecb3);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const horn1 = bone(std({ color: 0x6d4c41 }), -0.05, 0.3, 0.14, -0.15, 0.58, 0.25, 0.035, 0.02, 6);
  const horn2 = bone(std({ color: 0x6d4c41 }), -0.05, 0.3, -0.14, -0.15, 0.58, -0.25, 0.035, 0.02, 6);
  head.add(horn1, horn2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.3) * 0.022;
    tail.rotation.z = Math.sin(t * 3.2) * 0.18;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildThornstag(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x4e342e, secondary: 0x4caf50, accent: 0xe8f5e9 }, 0xe8f5e9);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const horn1 = bone(std({ color: 0x4e342e }), -0.05, 0.3, 0.14, -0.2, 0.72, 0.32, 0.045, 0.02, 6);
  const horn2 = bone(std({ color: 0x4e342e }), -0.05, 0.3, -0.14, -0.2, 0.72, -0.32, 0.045, 0.02, 6);
  const sp1 = spike(std({ color: 0x4caf50 }), -0.1, 0.5, 0.22, -0.05, 0.65, 0.35, 0.02);
  const sp2 = spike(std({ color: 0x4caf50 }), -0.1, 0.5, -0.22, -0.05, 0.65, -0.35, 0.02);
  head.add(horn1, horn2, sp1, sp2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.1) * 0.025;
    tail.rotation.z = Math.sin(t * 2.8) * 0.22;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSolarstag(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x3e2723, secondary: 0x2e7d32, accent: 0xffd54f }, 0xffd54f);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const horn1 = bone(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.6 }), -0.05, 0.3, 0.14, -0.25, 0.85, 0.42, 0.05, 0.025, 6);
  const horn2 = bone(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.6 }), -0.05, 0.3, -0.14, -0.25, 0.85, -0.42, 0.05, 0.025, 6);
  const sp1 = spike(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.8 }), -0.12, 0.55, 0.28, -0.02, 0.78, 0.48, 0.025);
  const sp2 = spike(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.8 }), -0.12, 0.55, -0.28, -0.02, 0.78, -0.48, 0.025);
  head.add(horn1, horn2, sp1, sp2);
  const sun = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 18), std({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 1.4 }));
  sun.position.set(-0.15, 0.78, 0); sun.rotation.y = Math.PI / 2;
  head.add(sun);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 1.9) * 0.028;
    tail.rotation.z = Math.sin(t * 2.5) * 0.25;
    sun.rotation.x = t * 1.5;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSnapsprout(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x4caf50, secondary: 0x81c784, accent: 0xe91e63 }, 0xe91e63);
  const head = g.getObjectByName('head')!;
  const bud = orb(std({ color: 0xe91e63, emissive: 0xe91e63, emissiveIntensity: 0.7 }), 0.12, 0, 0.45, 0);
  head.add(bud);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.022;
    bud.scale.setScalar(1.0 + Math.sin(t * 6) * 0.12);
  };
  return { body: g, parts: { head }, animate };
}

function buildSnaporchid(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x388e3c, secondary: 0xc8e6c9, accent: 0xab47bc }, 0xab47bc);
  const head = g.getObjectByName('head')!;
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const pet = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), std({ color: 0xab47bc, emissive: 0xab47bc, emissiveIntensity: 0.4 }));
    const a = (i / 4) * Math.PI * 2;
    pet.position.set(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
    pet.rotation.set(Math.sin(a) * 0.8, a, -Math.cos(a) * 0.8);
    head.add(pet);
    petals.push(pet);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.025;
    petals.forEach((pet, i) => {
      pet.scale.setScalar(1.0 + Math.sin(t * 4 + i) * 0.08);
    });
  };
  return { body: g, parts: { head }, animate };
}

function buildBrambleviper(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x1b5e20, secondary: 0xa5d6a7, accent: 0xab47bc }, 0xab47bc);
  const head = g.getObjectByName('head')!;
  const spikes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), std({ color: 0x1b5e20 }));
    sp.position.set(-0.35, 0.4 + i * 0.35, 0.12); sp.rotation.z = Math.PI / 3;
    const spCl = sp.clone(); spCl.position.z = -0.12;
    g.add(sp, spCl);
    spikes.push(sp, spCl);
  }
  const fang1 = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), std({ color: 0xab47bc, emissive: 0xab47bc, emissiveIntensity: 0.8 }));
  fang1.position.set(0.18, -0.12, 0.08); fang1.rotation.z = -Math.PI / 6;
  const fang2 = fang1.clone(); fang2.position.z = -0.08;
  head.add(fang1, fang2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.0) * 0.028;
    spikes.forEach((sp, idx) => {
      sp.rotation.z = Math.PI / 3 + Math.sin(t * 2.5 + idx) * 0.06;
    });
  };
  return { body: g, parts: { head }, animate };
}

function buildRotwyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x3e2723, secondary: 0x2e7d32, accent: 0x4a148c }, 0x4a148c);
  const head = g.getObjectByName('head')!;
  const fungus1 = orb(std({ color: 0x4a148c, emissive: 0x4a148c, emissiveIntensity: 0.5 }), 0.08, -0.2, 0.6, 0);
  const fungus2 = orb(std({ color: 0x4a148c, emissive: 0x4a148c, emissiveIntensity: 0.5 }), 0.06, -0.4, 0.9, 0);
  g.add(fungus1, fungus2);
  const spores: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const sp = orb(new THREE.MeshBasicMaterial({ color: 0xab47bc, transparent: true, opacity: 0.8 }), 0.035, 0, 0.5, 0);
    g.add(sp);
    spores.push(sp);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 1.8) * 0.03;
    spores.forEach((sp, idx) => {
      const a = t * 1.8 + idx;
      sp.position.set(-0.3 + Math.cos(a) * 0.35, 0.7 + Math.sin(t * 3 + idx) * 0.12, Math.sin(a) * 0.35);
    });
  };
  return { body: g, parts: { head }, animate };
}

function buildBarkchick(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x8d6e63, secondary: 0xc8e6c9, accent: 0x81c784 }, 0x81c784);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const plate1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.05), std({ color: 0x8d6e63 }));
  plate1.position.set(-0.1, 0.75, 0.35); plate1.rotation.y = Math.PI / 12;
  const plate2 = plate1.clone();
  plate2.position.set(-0.1, 0.75, -0.35); plate2.rotation.y = -Math.PI / 12;
  g.add(plate1, plate2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.8) * 0.025;
    if (tail) tail.rotation.z = Math.sin(t * 3.8) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSylvawing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x6d4c41, secondary: 0x4caf50, accent: 0xa5d6a7 }, 0xa5d6a7);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const leaf1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.15), std({ color: 0xa5d6a7 }));
  leaf1.position.set(0.1, 0, 0.4); leaf1.rotation.y = Math.PI / 6;
  const leaf2 = leaf1.clone();
  leaf2.position.set(0.1, 0, -0.4); leaf2.rotation.y = -Math.PI / 6;
  w1.add(leaf1);
  w2.add(leaf2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.5) * 0.028;
    if (tail) tail.rotation.z = Math.sin(t * 3.4) * 0.18;
    w1.rotation.z = Math.sin(t * 6) * 0.25;
    w2.rotation.z = -Math.sin(t * 6) * 0.25;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildForestglide(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x5d4037, secondary: 0xe67e22, accent: 0xf1c40f }, 0xf1c40f);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const leafSp = orb(new THREE.MeshBasicMaterial({ color: 0xe67e22, transparent: true, opacity: 0.8 }), 0.04, -0.3, 0.8, 0.2);
  const leafSp2 = orb(new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.8 }), 0.045, -0.3, 0.8, -0.2);
  g.add(leafSp, leafSp2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.3) * 0.03;
    if (tail) tail.rotation.z = Math.sin(t * 3.0) * 0.22;
    w1.rotation.z = Math.sin(t * 7) * 0.28;
    w2.rotation.z = -Math.sin(t * 7) * 0.28;
    leafSp.position.y = 0.8 + Math.sin(t * 4) * 0.12;
    leafSp2.position.y = 0.85 + Math.cos(t * 4.5) * 0.12;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildCanopyhawk(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x3e2723, secondary: 0x1b5e20, accent: 0x81c784 }, 0x81c784);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const leaves1: THREE.Mesh[] = [];
  const leaves2: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.25), std({ color: 0x1b5e20 }));
    l1.position.set(-0.1 * i, 0, 0.4 + i * 0.2);
    w1.add(l1);
    leaves1.push(l1);
    const l2 = l1.clone();
    l2.position.set(-0.1 * i, 0, -0.4 - i * 0.2);
    w2.add(l2);
    leaves2.push(l2);
  }
  g.scale.setScalar(1.25);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.0) * 0.035;
    if (tail) tail.rotation.z = Math.sin(t * 2.6) * 0.28;
    w1.rotation.z = Math.sin(t * 5) * 0.32;
    w2.rotation.z = -Math.sin(t * 5) * 0.32;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

// ================= NEW VOLT BUILDERS =================
function buildShocklamb(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xffffff, secondary: 0xffeb3b, accent: 0xe0f7fa }, 0xffeb3b);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const puff1 = orb(std({ color: 0xffffff, roughness: 0.9 }), 0.18, -0.2, 0.8, 0.25);
  const puff2 = orb(std({ color: 0xffffff, roughness: 0.9 }), 0.18, -0.2, 0.8, -0.25);
  g.add(puff1, puff2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.8) * 0.02;
    tail.rotation.z = Math.sin(t * 4) * 0.15;
    puff1.scale.setScalar(1.0 + Math.sin(t * 5) * 0.05);
    puff2.scale.setScalar(1.0 + Math.sin(t * 5 + 1) * 0.05);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildVoltram(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xeeeeee, secondary: 0xd7ccc8, accent: 0xffb300 }, 0xffb300);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const horn1 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 12, Math.PI * 1.5), std({ color: 0xd7ccc8, metalness: 0.8, roughness: 0.2 }));
  horn1.position.set(-0.02, 0.28, 0.18); horn1.rotation.set(0, 0, Math.PI / 4);
  const horn2 = horn1.clone();
  horn2.position.set(-0.02, 0.28, -0.18); horn2.rotation.set(0, 0, Math.PI / 4);
  head.add(horn1, horn2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.022;
    tail.rotation.z = Math.sin(t * 3.6) * 0.18;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildStormhorn(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xdddddd, secondary: 0x8d6e63, accent: 0xffd54f }, 0xffd54f);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const horn1 = bone(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.8 }), -0.05, 0.3, 0.14, -0.18, 0.62, 0.28, 0.04, 0.02, 6);
  const horn2 = bone(std({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.8 }), -0.05, 0.3, -0.14, -0.18, 0.62, -0.28, 0.04, 0.02, 6);
  head.add(horn1, horn2);
  const arc = boltGroup(new THREE.MeshBasicMaterial({ color: 0xffd54f }), -0.15, 0.58, 0.2, -0.2, 0.8, 0, 3, 0.008);
  head.add(arc);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.025;
    tail.rotation.z = Math.sin(t * 3.2) * 0.22;
    arc.visible = gate(t, 0.8, 4) > 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildFulguram(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0xaaaaaa, secondary: 0xffd54f, accent: 0x00bcd4 }, 0x00bcd4);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const cloud1 = orb(std({ color: 0xaaaaaa, transparent: true, opacity: 0.75, roughness: 0.9 }), 0.22, -0.25, 0.9, 0.32);
  const cloud2 = orb(std({ color: 0xaaaaaa, transparent: true, opacity: 0.75, roughness: 0.9 }), 0.22, -0.25, 0.9, -0.32);
  g.add(cloud1, cloud2);
  const arc = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), -0.25, 0.9, 0.32, -0.25, 0.6, 0.32, 2, 0.008);
  const arc2 = boltGroup(new THREE.MeshBasicMaterial({ color: 0xffeb3b }), -0.25, 0.9, -0.32, -0.25, 0.6, -0.32, 2, 0.008);
  g.add(arc, arc2);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.028;
    tail.rotation.z = Math.sin(t * 2.8) * 0.25;
    cloud1.position.y = 0.9 + Math.sin(t * 3) * 0.06;
    cloud2.position.y = 0.9 + Math.cos(t * 3) * 0.06;
    arc.visible = gate(t, 1.0, 3) > 0.4;
    arc2.visible = gate(t + 0.5, 1.0, 3) > 0.4;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildSparksparrow(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xffeb3b, secondary: 0xfff59d, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spark = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.15, 4), std({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2 }));
  spark.position.set(-0.05, 0.26, 0); spark.rotation.z = -Math.PI / 4;
  head.add(spark);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.8) * 0.022;
    if (tail) tail.rotation.z = Math.sin(t * 3.8) * 0.15;
    spark.scale.setScalar(1.0 + Math.sin(t * 12) * 0.15);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildTeslafacon(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xf57f17, secondary: 0xfff59d, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const ant1 = bone(std({ color: 0xf57f17, metalness: 0.8 }), 0.0, 0.24, 0.08, 0.05, 0.45, 0.14, 0.015, 0.01, 5);
  const ant2 = bone(std({ color: 0xf57f17, metalness: 0.8 }), 0.0, 0.24, -0.08, 0.05, 0.45, -0.14, 0.015, 0.01, 5);
  head.add(ant1, ant2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.6) * 0.025;
    if (tail) tail.rotation.z = Math.sin(t * 3.4) * 0.18;
    w1.rotation.z = Math.sin(t * 6.5) * 0.26;
    w2.rotation.z = -Math.sin(t * 6.5) * 0.26;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildGalvanicstrike(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xe65100, secondary: 0xffeb3b, accent: 0x00bcd4 }, 0x00bcd4);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const arc1 = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), 0, 0, 0.3, 0, 0, 0.7, 2, 0.008);
  const arc2 = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), 0, 0, -0.3, 0, 0, -0.7, 2, 0.008);
  w1.add(arc1);
  w2.add(arc2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.4) * 0.028;
    if (tail) tail.rotation.z = Math.sin(t * 3.0) * 0.22;
    w1.rotation.z = Math.sin(t * 7.5) * 0.3;
    w2.rotation.z = -Math.sin(t * 7.5) * 0.3;
    arc1.visible = gate(t, 0.8, 3) > 0.4;
    arc2.visible = gate(t, 0.8, 3) > 0.4;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildStormapex(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0xffeb3b, secondary: 0x00e5ff, accent: 0xffffff }, 0xffffff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const lWing1 = new THREE.Group();
  const seg1 = bone(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, 0.2, 0.1, 0.15, 0.5, 0.025, 0.02, 5);
  const seg2 = bone(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.1, 0.15, 0.5, 0.05, 0.05, 0.85, 0.02, 0.015, 5);
  lWing1.add(seg1, seg2);
  const lWing2 = new THREE.Group();
  const seg3 = bone(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, -0.2, 0.1, 0.15, -0.5, 0.025, 0.02, 5);
  const seg4 = bone(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.1, 0.15, -0.5, 0.05, 0.05, -0.85, 0.02, 0.015, 5);
  lWing2.add(seg3, seg4);
  w1.add(lWing1);
  w2.add(lWing2);
  g.scale.setScalar(1.22);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.2) * 0.03;
    if (tail) tail.rotation.z = Math.sin(t * 2.6) * 0.25;
    w1.rotation.z = Math.sin(t * 8.5) * 0.35;
    w2.rotation.z = -Math.sin(t * 8.5) * 0.35;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildVoltcrab(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xfff59d, secondary: 0x8d6e63, accent: 0xffd54f }, 0xffd54f);
  const head = g.getObjectByName('head')!;
  const claw1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6), std({ color: 0xffd54f }));
  claw1.position.set(0.35, 0.25, 0.28); claw1.rotation.set(0.3, 0.2, Math.PI / 4);
  const claw2 = claw1.clone();
  claw2.position.set(0.35, 0.25, -0.28); claw2.rotation.set(-0.3, -0.2, Math.PI / 4);
  g.add(claw1, claw2);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.5) * 0.015;
    claw1.rotation.y = 0.2 + Math.sin(t * 3.5) * 0.08;
    claw2.rotation.y = -0.2 - Math.sin(t * 3.5) * 0.08;
  };
  return { body: g, parts: { head }, animate };
}

function buildStaticclaw(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xffeb3b, secondary: 0x795548, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const claw1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.24, 6), std({ color: 0xffeb3b, emissive: 0x00e5ff, emissiveIntensity: 0.5 }));
  claw1.position.set(0.38, 0.25, 0.32); claw1.rotation.set(0.3, 0.2, Math.PI / 4);
  const claw2 = claw1.clone();
  claw2.position.set(0.38, 0.25, -0.32); claw2.rotation.set(-0.3, -0.2, Math.PI / 4);
  g.add(claw1, claw2);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.3) * 0.018;
    claw1.rotation.y = 0.2 + Math.sin(t * 3.2) * 0.1;
    claw2.rotation.y = -0.2 - Math.sin(t * 3.2) * 0.1;
  };
  return { body: g, parts: { head }, animate };
}

function buildTeslashell(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xffd54f, secondary: 0x5d4037, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const claw1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 6), std({ color: 0xffd54f, emissive: 0x00e5ff, emissiveIntensity: 0.6 }));
  claw1.position.set(0.42, 0.25, 0.36); claw1.rotation.set(0.3, 0.2, Math.PI / 4);
  const claw2 = claw1.clone();
  claw2.position.set(0.42, 0.25, -0.36); claw2.rotation.set(-0.3, -0.2, Math.PI / 4);
  g.add(claw1, claw2);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), std({ color: 0x00e5ff, metalness: 0.8, emissive: 0x00e5ff, emissiveIntensity: 1.0 }));
  coil.position.set(-0.15, 0.68, 0); coil.rotation.y = Math.PI / 2;
  g.add(coil);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 2.1) * 0.02;
    claw1.rotation.y = 0.2 + Math.sin(t * 3.0) * 0.12;
    claw2.rotation.y = -0.2 - Math.sin(t * 3.0) * 0.12;
    coil.rotation.x = t * 2;
  };
  return { body: g, parts: { head }, animate };
}

function buildStormgoliath(): BespokeBuild {
  const g = buildProceduralArchetype('shell', { primary: 0xffc107, secondary: 0x3e2723, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const claw1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.36, 8), std({ color: 0xffc107, emissive: 0x00e5ff, emissiveIntensity: 0.8 }));
  claw1.position.set(0.48, 0.3, 0.42); claw1.rotation.set(0.3, 0.2, Math.PI / 4);
  const claw2 = claw1.clone();
  claw2.position.set(0.48, 0.3, -0.42); claw2.rotation.set(-0.3, -0.2, Math.PI / 4);
  g.add(claw1, claw2);
  const arc = boltGroup(new THREE.MeshBasicMaterial({ color: 0x00e5ff }), -0.1, 0.72, 0, 0.4, 0.4, 0.4, 3, 0.012);
  g.add(arc);
  g.scale.setScalar(1.26);
  const animate = (t: number) => {
    head.position.y = 0.42 + Math.sin(t * 1.8) * 0.025;
    claw1.rotation.y = 0.2 + Math.sin(t * 2.5) * 0.15;
    claw2.rotation.y = -0.2 - Math.sin(t * 2.5) * 0.15;
    arc.visible = gate(t, 0.9, 4) > 0.45;
  };
  return { body: g, parts: { head }, animate };
}

// ================= NEW GALE BUILDERS =================
function buildSpacepup(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x5c6bc0, secondary: 0x9fa8da, accent: 0xff80ab }, 0xff80ab);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const star = orb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff80ab, emissiveIntensity: 1.5 }), 0.05, -0.85, 0.82, 0);
  g.add(star);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.6) * 0.02;
    tail.rotation.z = Math.sin(t * 3.6) * 0.18;
    star.position.y = 0.82 + Math.sin(t * 6) * 0.05;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCosmichound(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x3f51b5, secondary: 0xc5cae9, accent: 0xff4081 }, 0xff4081);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const starPaws: THREE.Mesh[] = [];
  for (const [x, z] of [[0.28, 0.22], [0.28, -0.22], [-0.28, 0.22], [-0.28, -0.22]]) {
    const paw = orb(new THREE.MeshBasicMaterial({ color: 0xff4081, transparent: true, opacity: 0.6 }), 0.08, x, 0.06, z);
    g.add(paw);
    starPaws.push(paw);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.022;
    tail.rotation.z = Math.sin(t * 3.2) * 0.22;
    starPaws.forEach((paw, idx) => {
      paw.scale.setScalar(1.0 + Math.sin(t * 5 + idx) * 0.12);
    });
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildStellarwolf(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x283593, secondary: 0xffffff, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 6, 20), std({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2 }));
  ring.position.set(0, 0.55, 0); ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.025;
    tail.rotation.z = Math.sin(t * 2.8) * 0.25;
    ring.rotation.z = t * 1.2;
    ring.position.y = 0.55 + Math.sin(t * 2.5) * 0.06;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildNebulamort(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x1a237e, secondary: 0x9c27b0, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const cloud1 = orb(new THREE.MeshBasicMaterial({ color: 0x9c27b0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }), 0.28, -0.2, 0.8, 0.22);
  const cloud2 = orb(new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }), 0.28, -0.2, 0.8, -0.22);
  g.add(cloud1, cloud2);
  g.scale.setScalar(1.24);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.0) * 0.03;
    tail.rotation.z = Math.sin(t * 2.4) * 0.3;
    cloud1.scale.setScalar(1.0 + Math.sin(t * 2.8) * 0.15);
    cloud2.scale.setScalar(1.0 + Math.cos(t * 2.8) * 0.15);
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildStarowlet(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x7986cb, secondary: 0xe8eaf6, accent: 0xffeb3b }, 0xffeb3b);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const crown = orb(std({ color: 0xffeb3b, emissive: 0xffeb3b, emissiveIntensity: 1.2 }), 0.04, 0, 0.28, 0);
  head.add(crown);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.6) * 0.02;
    if (tail) tail.rotation.z = Math.sin(t * 3.6) * 0.15;
    crown.position.y = 0.28 + Math.sin(t * 5) * 0.03;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildAstralowl(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x3f51b5, secondary: 0xc5cae9, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const star1 = orb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 1.5 }), 0.04, 0.1, 0, 0.5);
  const star2 = orb(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 1.5 }), 0.04, 0.1, 0, -0.5);
  w1.add(star1);
  w2.add(star2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.4) * 0.025;
    if (tail) tail.rotation.z = Math.sin(t * 3.2) * 0.18;
    w1.rotation.z = Math.sin(t * 6) * 0.24;
    w2.rotation.z = -Math.sin(t * 6) * 0.24;
    star1.scale.setScalar(1.0 + Math.sin(t * 8) * 0.2);
    star2.scale.setScalar(1.0 + Math.sin(t * 8 + 1) * 0.2);
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildCosmoswing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x1a237e, secondary: 0xe8eaf6, accent: 0xffffff }, 0xffffff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const tip1 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 1.8 }));
  tip1.rotation.x = Math.PI / 2; tip1.position.set(0, 0, 0.8);
  const tip2 = tip1.clone(); tip2.rotation.x = -Math.PI / 2; tip2.position.z = -0.8;
  w1.add(tip1);
  w2.add(tip2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.2) * 0.028;
    if (tail) tail.rotation.z = Math.sin(t * 2.8) * 0.22;
    w1.rotation.z = Math.sin(t * 6.5) * 0.28;
    w2.rotation.z = -Math.sin(t * 6.5) * 0.28;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildGalaxia(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x0d1b2a, secondary: 0x9c27b0, accent: 0x00f5ff }, 0x00f5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const gal1 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 16), std({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.5 }));
  gal1.position.set(0, 0, 0.65); gal1.rotation.x = Math.PI / 2;
  const gal2 = gal1.clone(); gal2.position.z = -0.65;
  w1.add(gal1);
  w2.add(gal2);
  g.scale.setScalar(1.25);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 1.9) * 0.032;
    if (tail) tail.rotation.z = Math.sin(t * 2.4) * 0.26;
    w1.rotation.z = Math.sin(t * 5) * 0.32;
    w2.rotation.z = -Math.sin(t * 5) * 0.32;
    gal1.rotation.z = t * 2.5;
    gal2.rotation.z = -t * 2.5;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildNebwyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x4a148c, secondary: 0x7c4dff, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const sphere = orb(new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.6 }), 0.05, -0.4, 0.5, 0.1);
  g.add(sphere);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.4) * 0.02;
    sphere.position.y = 0.5 + Math.sin(t * 4) * 0.08;
  };
  return { body: g, parts: { head }, animate };
}

function buildVoidwyrm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x311b92, secondary: 0xb388ff, accent: 0xe040fb }, 0xe040fb);
  const head = g.getObjectByName('head')!;
  const rift = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 14), std({ color: 0xe040fb, emissive: 0xe040fb, emissiveIntensity: 1.0 }));
  rift.position.set(-0.2, 0.6, 0); rift.rotation.y = Math.PI / 2;
  g.add(rift);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.022;
    rift.rotation.x = t * 1.5;
    rift.position.y = 0.6 + Math.sin(t * 3) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

function buildRiftserpent(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x1a0c42, secondary: 0x7c4dff, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), std({ color: 0x1a0c42, emissive: 0x00e5ff, emissiveIntensity: 1.2 }));
  box.position.set(-0.3, 0.8, 0);
  g.add(box);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.0) * 0.025;
    box.rotation.set(t * 1.2, t * 0.8, 0);
    box.position.y = 0.8 + Math.sin(t * 3.5) * 0.08;
  };
  return { body: g, parts: { head }, animate };
}

function buildCosmoclysm(): BespokeBuild {
  const g = buildProceduralArchetype('serpent', { primary: 0x0a0026, secondary: 0x9c27b0, accent: 0xffeb3b }, 0xffeb3b);
  const head = g.getObjectByName('head')!;
  const planets: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const colors = [0xff4081, 0x00e5ff, 0xffeb3b];
    const p = orb(std({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.8 }), 0.045, 0, 0.8, 0);
    g.add(p);
    planets.push(p);
  }
  g.scale.setScalar(1.22);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 1.8) * 0.03;
    planets.forEach((p, idx) => {
      const a = t * 1.8 + (idx * Math.PI * 2 / 3);
      p.position.set(-0.25 + Math.cos(a) * 0.42, 0.8 + Math.sin(t * 3.2 + idx) * 0.08, Math.sin(a) * 0.42);
    });
  };
  return { body: g, parts: { head }, animate };
}

// ================= NEW UMBRA BUILDERS =================
function buildGloomwing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x212121, secondary: 0x424242, accent: 0xba68c8 }, 0xba68c8);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.8) * 0.022;
    if (tail) tail.rotation.z = Math.sin(t * 3.8) * 0.15;
    w1.rotation.z = Math.sin(t * 8) * 0.25;
    w2.rotation.z = -Math.sin(t * 8) * 0.25;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildShadowwing(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x111111, secondary: 0x303030, accent: 0x8e24aa }, 0x8e24aa);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const spark1 = orb(new THREE.MeshBasicMaterial({ color: 0x8e24aa }), 0.035, 0, 0, 0.6);
  const spark2 = orb(new THREE.MeshBasicMaterial({ color: 0x8e24aa }), 0.035, 0, 0, -0.6);
  w1.add(spark1);
  w2.add(spark2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.6) * 0.025;
    if (tail) tail.rotation.z = Math.sin(t * 3.4) * 0.18;
    w1.rotation.z = Math.sin(t * 7.5) * 0.28;
    w2.rotation.z = -Math.sin(t * 7.5) * 0.28;
    spark1.scale.setScalar(1.0 + Math.sin(t * 14) * 0.2);
    spark2.scale.setScalar(1.0 + Math.sin(t * 14) * 0.2);
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildVoidgoyle(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x0d0d0d, secondary: 0x222222, accent: 0xe040fb }, 0xe040fb);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), std({ color: 0x0d0d0d }));
  horn1.position.set(-0.05, 0.22, 0.1); horn1.rotation.set(0.2, 0, Math.PI / 4);
  const horn2 = horn1.clone();
  horn2.position.set(-0.05, 0.22, -0.1); horn2.rotation.set(-0.2, 0, Math.PI / 4);
  head.add(horn1, horn2);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.3) * 0.028;
    if (tail) tail.rotation.z = Math.sin(t * 3.0) * 0.22;
    w1.rotation.z = Math.sin(t * 6.5) * 0.3;
    w2.rotation.z = -Math.sin(t * 6.5) * 0.3;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildApocalypsebat(): BespokeBuild {
  const g = buildProceduralArchetype('avian', { primary: 0x050505, secondary: 0x111111, accent: 0x6a1b9a }, 0x6a1b9a);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const w1 = g.getObjectByName('wing1')!;
  const w2 = g.getObjectByName('wing-1')!;
  const border1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.35), new THREE.MeshBasicMaterial({ color: 0x6a1b9a }));
  border1.position.set(0, 0, 0.45);
  const border2 = border1.clone(); border2.position.z = -0.45;
  w1.add(border1);
  w2.add(border2);
  g.scale.setScalar(1.24);
  const animate = (t: number) => {
    head.position.y = 1.25 + Math.sin(t * 2.0) * 0.032;
    if (tail) tail.rotation.z = Math.sin(t * 2.5) * 0.28;
    w1.rotation.z = Math.sin(t * 5.5) * 0.35;
    w2.rotation.z = -Math.sin(t * 5.5) * 0.35;
  };
  return { body: g, parts: { head, tail, wings: [w1, w2] }, animate };
}

function buildDuskkitty(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x212121, secondary: 0x616161, accent: 0xe040fb }, 0xe040fb);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.8) * 0.018;
    tail.rotation.z = Math.sin(t * 3.8) * 0.15;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildUmbraknell(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x111111, secondary: 0x424242, accent: 0x80deea }, 0x80deea);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const icyFeets: THREE.Mesh[] = [];
  for (const [x, z] of [[0.28, 0.22], [0.28, -0.22], [-0.28, 0.22], [-0.28, -0.22]]) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), std({ color: 0x80deea, emissive: 0x80deea, emissiveIntensity: 0.6 }));
    claw.position.set(x, 0.05, z); claw.rotation.z = Math.PI;
    g.add(claw);
    icyFeets.push(claw);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.5) * 0.02;
    tail.rotation.z = Math.sin(t * 3.2) * 0.18;
    icyFeets.forEach((c, idx) => {
      c.scale.setScalar(1.0 + Math.sin(t * 6 + idx) * 0.1);
    });
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildShadowstalker(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x0d0d0d, secondary: 0x212121, accent: 0x00e5ff }, 0x00e5ff);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const spikes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), std({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8 }));
    sp.position.set(-0.15 - i * 0.15, 0.8, 0); sp.rotation.z = Math.PI / 6;
    g.add(sp);
    spikes.push(sp);
  }
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 2.2) * 0.022;
    tail.rotation.z = Math.sin(t * 2.8) * 0.22;
    spikes.forEach((sp, idx) => {
      sp.position.y = 0.8 + Math.sin(t * 3 + idx) * 0.02;
    });
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildVoidreaper(): BespokeBuild {
  const g = buildProceduralArchetype('beast', { primary: 0x050505, secondary: 0x0d0d0d, accent: 0xe040fb }, 0xe040fb);
  const head = g.getObjectByName('head')!;
  const tail = g.getObjectByName('tail')!;
  const claw1 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), std({ color: 0xe040fb, emissive: 0xe040fb, emissiveIntensity: 1.0 }));
  claw1.position.set(0.48, 0.2, 0.28); claw1.rotation.set(0.2, 0, -Math.PI / 4);
  const claw2 = claw1.clone();
  claw2.position.set(0.48, 0.2, -0.28); claw2.rotation.set(-0.2, 0, -Math.PI / 4);
  g.add(claw1, claw2);
  g.scale.setScalar(1.25);
  const animate = (t: number) => {
    head.position.y = 0.85 + Math.sin(t * 1.8) * 0.028;
    tail.rotation.z = Math.sin(t * 2.4) * 0.26;
    claw1.position.y = 0.2 + Math.sin(t * 4.5) * 0.04;
    claw2.position.y = 0.2 + Math.cos(t * 4.5) * 0.04;
  };
  return { body: g, parts: { head, tail }, animate };
}

function buildCrypttot(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x616161, secondary: 0x757575, accent: 0x9e9e9e }, 0x9e9e9e);
  const head = g.getObjectByName('head')!;
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 2.0) * 0.015;
  };
  return { body: g, parts: { head }, animate };
}

function buildTombgolem(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x424242, secondary: 0x616161, accent: 0xba68c8 }, 0xba68c8);
  const head = g.getObjectByName('head')!;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.25), std({ color: 0x424242, roughness: 0.95 }));
  slab.position.set(-0.25, 0.95, 0); slab.rotation.y = Math.PI / 4;
  g.add(slab);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 1.8) * 0.02;
    slab.position.y = 0.95 + Math.sin(t * 2.2) * 0.03;
  };
  return { body: g, parts: { head }, animate };
}

function buildCairnwarden(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x212121, secondary: 0x424242, accent: 0x9c27b0 }, 0x9c27b0);
  const head = g.getObjectByName('head')!;
  const slab1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.18), std({ color: 0x212121, roughness: 0.95 }));
  const slab2 = slab1.clone();
  slab1.position.set(-0.35, 1.05, 0.25); slab1.rotation.set(0.1, 0.2, 0.1);
  slab2.position.set(-0.35, 1.05, -0.25); slab2.rotation.set(-0.1, -0.2, 0.1);
  g.add(slab1, slab2);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 1.6) * 0.024;
    slab1.position.y = 1.05 + Math.sin(t * 2.6) * 0.05;
    slab2.position.y = 1.05 + Math.cos(t * 2.6) * 0.05;
  };
  return { body: g, parts: { head }, animate };
}

function buildObeliskarch(): BespokeBuild {
  const g = buildProceduralArchetype('brute', { primary: 0x0d0d0d, secondary: 0x212121, accent: 0xd500f9 }, 0xd500f9);
  const head = g.getObjectByName('head')!;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.72, 0.25), std({ color: 0x0d0d0d, emissive: 0xd500f9, emissiveIntensity: 0.6 }));
  pillar.position.set(0, 0.95, 0);
  g.add(pillar);
  g.scale.setScalar(1.24);
  const animate = (t: number) => {
    head.position.y = 1.5 + Math.sin(t * 1.4) * 0.028;
    pillar.position.y = 0.95 + Math.sin(t * 2) * 0.02;
  };
  return { body: g, parts: { head }, animate };
}

// ---------------- registry ----------------
export const BESPOKE: Record<string, BespokeBuilder> = {
  // Blaze
  pyropup: buildPyropup,
  pyrohound: buildPyrohound,
  cindawing: buildCindawing,
  cindafalcon: buildCindafalcon,
  magmatot: buildMagmatot,
  magmatort: buildMagmatort,
  flamesal: buildFlamesal,
  emberskink: buildEmberskink,
  lavaserpent: buildLavaserpent,
  magmadrak: buildMagmadrak,
  coalbug: buildCoalbug,
  cinderscarab: buildCinderscarab,
  pyroshell: buildPyroshell,
  coalossus: buildCoalossus,
  flarefly: buildFlarefly,
  sparkwing: buildSparkwing,
  lumiprix: buildLumiprix,
  aurorafire: buildAurorafire,

  // Tide
  bubbledrag: buildBubbledrag,
  pearlwyrm: buildPearlwyrm,
  mistpaw: buildMistpaw,
  frostlynx: buildFrostlynx,
  coralbud: buildCoralbud,
  reefguard: buildReefguard,
  wavepup: buildWavepup,
  tidehound: buildTidehound,
  oceanclysm: buildOceanclysm,
  abysshound: buildAbysshound,
  jellymote: buildJellymote,
  aquajelly: buildAquajelly,
  voltmedusa: buildVoltmedusa,
  abysssiren: buildAbysssiren,
  seaturt: buildSeaturt,
  reefscale: buildReefscale,
  pearlshield: buildPearlshield,
  oceantitan: buildOceantitan,

  // Verdant
  seedsqrl: buildSeedsqrl,
  voltcanopy: buildVoltcanopy,
  sporepix: buildSporepix,
  fungoking: buildFungoking,
  rootlet: buildRootlet,
  grovewarden: buildGrovewarden,
  leaffawn: buildLeaffawn,
  sylvadeer: buildSylvadeer,
  thornstag: buildThornstag,
  solarstag: buildSolarstag,
  snapsprout: buildSnapsprout,
  snaporchid: buildSnaporchid,
  brambleviper: buildBrambleviper,
  rotwyrm: buildRotwyrm,
  barkchick: buildBarkchick,
  sylvawing: buildSylvawing,
  forestglide: buildForestglide,
  canopyhawk: buildCanopyhawk,

  // Volt
  joltmous: buildJoltmous,
  galvanix: buildGalvanix,
  sparkeef: buildSparkeef,
  tesladrag: buildTesladrag,
  stormchick: buildStormchick,
  voltwing: buildVoltwing,
  shocklamb: buildShocklamb,
  voltram: buildVoltram,
  stormhorn: buildStormhorn,
  fulguram: buildFulguram,
  sparksparrow: buildSparksparrow,
  teslafacon: buildTeslafacon,
  galvanicstrike: buildGalvanicstrike,
  stormapex: buildStormapex,
  voltcrab: buildVoltcrab,
  staticclaw: buildStaticclaw,
  teslashell: buildTeslashell,
  stormgoliath: buildStormgoliath,

  // Gale
  nebulet: buildNebulet,
  astralpaw: buildAstralpaw,
  galewyrm: buildGalewyrm,
  tempestwyrm: buildTempestwyrm,
  cosmolet: buildCosmolet,
  stargazer: buildStargazer,
  spacepup: buildSpacepup,
  cosmichound: buildCosmichound,
  stellarwolf: buildStellarwolf,
  nebulamort: buildNebulamort,
  starowlet: buildStarowlet,
  astralowl: buildAstralowl,
  cosmoswing: buildCosmoswing,
  galaxia: buildGalaxia,
  nebwyrm: buildNebwyrm,
  voidwyrm: buildVoidwyrm,
  riftserpent: buildRiftserpent,
  cosmoclysm: buildCosmoclysm,

  // Umbra
  voidkit: buildVoidkit,
  nebularix: buildNebularix,
  vampbat: buildVampbat,
  nosferatus: buildNosferatus,
  gravemini: buildGravemini,
  gravemonolith: buildGravemonolith,
  gloomwing: buildGloomwing,
  shadowwing: buildShadowwing,
  voidgoyle: buildVoidgoyle,
  apocalypsebat: buildApocalypsebat,
  duskkitty: buildDuskkitty,
  umbraknell: buildUmbraknell,
  shadowstalker: buildShadowstalker,
  voidreaper: buildVoidreaper,
  crypttot: buildCrypttot,
  tombgolem: buildTombgolem,
  cairnwarden: buildCairnwarden,
  obeliskarch: buildObeliskarch,


  cindcub: buildCindcub,
  pyrofang: buildPyrofang,
  blazemaw: buildBlazemaw,
  infernyx: buildInfernyx,
  solarex: buildSolarex,
  // Blaze — Dawnfire & Coalback lines + cinderbat
  ashwisp: buildAshwisp,
  flarekin: buildFlarekin,
  pyrelisk: buildPyrelisk,
  vulkragon: buildVulkragon,
  ignisar: buildIgnisar,
  solphyra: buildSolphyra,
  smolderhog: buildSmolderhog,
  magmaboar: buildMagmaboar,
  cinderbat: buildCinderbat,
  puddla: buildPuddla,
  tidefin: buildTidefin,
  maelstrike: buildMaelstrike,
  // Tide — abyssal, pearlcrown, coldcurrent lines + mistling
  abyssarch: buildAbyssarch,
  leviathorn: buildLeviathorn,
  coralkit: buildCoralkit,
  reefrider: buildReefrider,
  pearlance: buildPearlance,
  nacrelord: buildNacrelord,
  frostfin: buildFrostfin,
  glacimaw: buildGlacimaw,
  mistling: buildMistling,
  // Verdant — wildwarden, sporesong, ancient-grove lines + pebblit
  sproutle: buildSproutle,
  thornbex: buildThornbex,
  sylvigor: buildSylvigor,
  eldergrove: buildEldergrove,
  yggdranox: buildYggdranox,
  pebblit: buildPebblit,
  fernfox: buildFernfox,
  bramblelynx: buildBramblelynx,
  thicketclaw: buildThicketclaw,
  grovetyrant: buildGrovetyrant,
  sylvaeon: buildSylvaeon,
  shroomple: buildShroomple,
  mycelord: buildMycelord,
  // Volt — stormcrown, cogspark lines + spark wilds
  zaplet: buildZaplet,
  voltyx: buildVoltyx,
  stormclaw: buildStormclaw,
  fulgurex: buildFulgurex,
  raidenjin: buildRaidenjin,
  sparkmote: buildSparkmote,
  joltuft: buildJoltuft,
  ampyre: buildAmpyre,
  teslarch: buildTeslarch,
  gearmite: buildGearmite,
  dynamaul: buildDynamaul,
  // Gale — skyriver, lullwind lines + wind wilds
  wispry: buildWispry,
  galewing: buildGalewing,
  cyclonix: buildCyclonix,
  tempestrix: buildTempestrix,
  zephyrax: buildZephyrax,
  zephlet: buildZephlet,
  plumelet: buildPlumelet,
  skydancer: buildSkydancer,
  stratoroc: buildStratoroc,
  empyrhawk: buildEmpyrhawk,
  driftling: buildDriftling,
  nimbusyl: buildNimbusyl,
  // Umbra — nightloom, tombward, shadow lines + void serpents
  shadekit: buildShadekit,
  duskfang: buildDuskfang,
  nocthowl: buildNocthowl,
  umbrelisk: buildUmbrelisk,
  chthonix: buildChthonix,
  gloomite: buildGloomite,
  mournmoth: buildMournmoth,
  duskweaver: buildDuskweaver,
  nightloom: buildNightloom,
  phantasmoth: buildPhantasmoth,
  erebusilk: buildErebusilk,
  cryptling: buildCryptling,
  sarcophang: buildSarcophang,
  // Corrupted sentinels
  ironhusk: buildIronhusk,
  gravemaw: buildGravemaw,
  voltigarch: buildVoltigarch,
  // The Corrupted Legion — nine four-element generals
  ashkarath: buildAshkarath,
  vormaela: buildVormaela,
  bramblehex: buildBramblehex,
  voltrazar: buildVoltrazar,
  gorrundax: buildGorrundax,
  cryomara: buildCryomara,
  luxavor: buildLuxavor,
  nyxghul: buildNyxghul,
  zerathuul: buildZerathuul,
  // Aljay's Aether three (Hall of Legends living statues)
  firgara: buildFirgara,
  onthrofa: buildOnthrofa,
  vulfenix: buildVulfenix,
  // 15 ready-made fusions
  pyrostrike: buildPyrostrike,
  aquafrost: buildAquafrost,
  terragrow: buildTerragrow,
  voltclysm: buildVoltclysm,
  umbrashade: buildUmbrashade,
  solgaleo: buildSolgaleo,
  tidedeep: buildTidedeep,
  thornspark: buildThornspark,
  duskbloom: buildDuskbloom,
  aethergale: buildAethergale,
  lavachain: buildLavachain,
  stormwave: buildStormwave,
  glaciervine: buildGlaciervine,
  shadowlight: buildShadowlight,
  aetherion: buildAetherion,
  // 6 extra-evolutions
  pyromount: buildPyromount,
  puddlecrest: buildPuddlecrest,
  sproutshell: buildSproutshell,
  zapwing: buildZapwing,
  wispserpent: buildWispserpent,
  shadeclaw: buildShadeclaw,
};

// ---------------- procedural bespoke helpers for fusions & extra-evolutions ----------------
function buildProceduralArchetype(arch: string, p: { primary: number; secondary: number; accent: number }, glow: number): THREE.Group {
  const g = new THREE.Group();
  const prim = std({ color: p.primary });
  const sec = std({ color: p.secondary });
  const acc = std({ color: p.accent, emissive: glow, emissiveIntensity: 0.55, roughness: 0.3 });

  const makeLocalEye = () => {
    return new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), std({ color: 0x101018, roughness: 0.2 }));
  };

  if (arch === 'beast') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), prim);
    body.scale.set(1.25, 0.95, 0.9); body.position.y = 0.55; g.add(body);
    const head = new THREE.Group(); head.position.set(0.45, 0.85, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), sec); head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), prim);
    snout.rotation.z = -Math.PI / 2; snout.position.set(0.3, -0.05, 0); head.add(snout);
    const e1 = makeLocalEye(), e2 = makeLocalEye(); e1.position.set(0.2, 0.1, 0.16); e2.position.set(0.2, 0.1, -0.16); head.add(e1, e2);
    const ear1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), acc);
    const ear2 = ear1.clone(); ear1.position.set(-0.05, 0.3, 0.14); ear2.position.set(-0.05, 0.3, -0.14); head.add(ear1, ear2);
    head.name = 'head'; g.add(head);
    for (const [x, z] of [[0.28, 0.22], [0.28, -0.22], [-0.28, 0.22], [-0.28, -0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), sec);
      leg.position.set(x, 0.2, z); g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), acc);
    tail.position.set(-0.6, 0.7, 0); tail.rotation.z = Math.PI / 3.4; tail.name = 'tail'; g.add(tail);
  } else if (arch === 'serpent') {
    let y = 0.25, x = 0, r = 0.34;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), i % 2 ? sec : prim);
      seg.position.set(x, y, 0); g.add(seg);
      if (i === 0) seg.name = 'tail';
      y += r * 1.15; x -= 0.1; r *= 0.88;
    }
    const head = new THREE.Group(); head.position.set(x + 0.12, y + 0.05, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), prim);
    skull.scale.set(1.3, 0.9, 1); head.add(skull);
    const e1 = makeLocalEye(), e2 = makeLocalEye();
    e1.position.set(0.18, 0.06, 0.14); e2.position.set(0.18, 0.06, -0.14); head.add(e1, e2);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), acc);
    crest.position.set(-0.1, 0.25, 0); crest.rotation.z = Math.PI / 7; head.add(crest);
    head.name = 'head'; g.add(head);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), acc);
      fin.position.set(-0.35, 0.4 + i * 0.35, 0); fin.rotation.z = Math.PI / 2.4; g.add(fin);
    }
  } else if (arch === 'avian') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), prim);
    body.scale.set(1, 1.15, 0.85); body.position.y = 0.75; g.add(body);
    const head = new THREE.Group(); head.position.set(0.18, 1.25, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), sec); head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), acc);
    beak.rotation.z = -Math.PI / 2; beak.position.set(0.26, -0.02, 0); head.add(beak);
    const e1 = makeLocalEye(), e2 = makeLocalEye(); e1.position.set(0.14, 0.08, 0.14); e2.position.set(0.14, 0.08, -0.14); head.add(e1, e2);
    head.name = 'head'; g.add(head);
    const mkWing = (side: 1 | -1) => {
      const w = new THREE.Group();
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.26), sec);
      feather.position.set(0, 0, side * 0.3);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), acc);
      tip.rotation.x = side * Math.PI / 2; tip.position.set(0, 0, side * 0.6);
      w.add(feather, tip);
      w.position.set(-0.05, 0.85, side * 0.3); w.name = `wing${side}`;
      return w;
    };
    g.add(mkWing(1), mkWing(-1));
    for (const z of [0.12, -0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 6), acc);
      leg.position.set(0, 0.25, z); g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), prim);
    tail.position.set(-0.45, 0.7, 0); tail.rotation.z = Math.PI / 2.6; tail.name = 'tail'; g.add(tail);
  } else if (arch === 'brute') {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), prim);
    torso.scale.set(1, 1.2, 0.85); torso.position.y = 0.85; g.add(torso);
    const head = new THREE.Group(); head.position.set(0.1, 1.5, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), sec); head.add(skull);
    const e1 = makeLocalEye(), e2 = makeLocalEye();
    e1.position.set(0.18, 0.04, 0.12); e2.position.set(0.18, 0.04, -0.12); head.add(e1, e2);
    const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), acc);
    const horn2 = horn1.clone();
    horn1.position.set(-0.02, 0.26, 0.12); horn2.position.set(-0.02, 0.26, -0.12); head.add(horn1, horn2);
    head.name = 'head'; g.add(head);
    for (const side of [1, -1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), acc);
      shoulder.position.set(0, 1.25, side * 0.5); g.add(shoulder);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.6, 8), sec);
      arm.position.set(0.05, 0.9, side * 0.58); arm.rotation.x = side * 0.18; g.add(arm);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), prim);
      fist.position.set(0.08, 0.55, side * 0.62); g.add(fist);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), sec);
      leg.position.set(0, 0.25, side * 0.22); g.add(leg);
    }
  } else if (arch === 'sprite') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), prim);
    body.position.y = 0.55; body.name = 'head'; g.add(body);
    const e1 = makeLocalEye(), e2 = makeLocalEye();
    e1.scale.setScalar(1.4); e2.scale.setScalar(1.4);
    e1.position.set(0.26, 0.62, 0.13); e2.position.set(0.26, 0.62, -0.13); g.add(e1, e2);
    const p1 = makeLocalEye(), p2 = makeLocalEye();
    p1.scale.setScalar(0.7); p2.scale.setScalar(0.7);
    p1.position.set(0.32, 0.62, 0.13); p2.position.set(0.32, 0.62, -0.13); g.add(p1, p2);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), acc);
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.55; halo.name = 'tail'; g.add(halo);
    for (let i = 0; i < 3; i++) {
      const orbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), acc);
      const a = (i / 3) * Math.PI * 2;
      orbMesh.position.set(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42); g.add(orbMesh);
    }
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), sec);
    tuft.position.set(0, 0.92, 0); g.add(tuft);
  } else { // shell
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), sec);
    dome.position.y = 0.35; g.add(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.12, 16), prim);
    rim.position.y = 0.32; g.add(rim);
    const head = new THREE.Group(); head.position.set(0.42, 0.42, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), prim); head.add(skull);
    const e1 = makeLocalEye(), e2 = makeLocalEye();
    e1.position.set(0.12, 0.05, 0.09); e2.position.set(0.12, 0.05, -0.09); head.add(e1, e2);
    head.name = 'head'; g.add(head);
    for (let i = 0; i < 5; i++) {
      const spikeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), acc);
      const a = (i / 5) * Math.PI * 2;
      spikeMesh.position.set(Math.cos(a) * 0.3, 0.62, Math.sin(a) * 0.3);
      spikeMesh.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(spikeMesh);
    }
    for (const [x, z] of [[0.25, 0.3], [0.25, -0.3], [-0.25, 0.3], [-0.25, -0.3]]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), prim);
      foot.position.set(x, 0.1, z); g.add(foot);
    }
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

function makeProceduralBespoke(arch: string, palette: { primary: number; secondary: number; accent: number }, glowColor: number): BespokeBuild {
  const g = buildProceduralArchetype(arch, palette, glowColor);
  const animate = (t: number, dt: number) => {
    const head = g.getObjectByName('head');
    const tail = g.getObjectByName('tail');
    if (head) {
      head.position.y = 0.85 + Math.sin(t * 2) * 0.015;
    }
    if (tail) {
      tail.rotation.z = Math.sin(t * 3.2) * 0.08;
    }
  };
  return {
    body: g,
    parts: {
      head: g.getObjectByName('head') ?? undefined,
      tail: g.getObjectByName('tail') ?? undefined,
      wings: [g.getObjectByName('wing1'), g.getObjectByName('wing-1')].filter(Boolean) as THREE.Object3D[],
    },
    animate
  };
}

// 15 fusions
function buildPyrostrike(): BespokeBuild { return makeProceduralBespoke('beast', { primary: 0xe84a2a, secondary: 0xf2d23a, accent: 0xffffff }, 0xf2d23a); }
function buildAquafrost(): BespokeBuild { return makeProceduralBespoke('serpent', { primary: 0x3a9df2, secondary: 0x9adff2, accent: 0xffffff }, 0x9adff2); }
function buildTerragrow(): BespokeBuild { return makeProceduralBespoke('brute', { primary: 0x4ec45e, secondary: 0xb0865a, accent: 0xffffff }, 0xb0865a); }
function buildVoltclysm(): BespokeBuild { return makeProceduralBespoke('avian', { primary: 0xf2d23a, secondary: 0x7adfd0, accent: 0xffffff }, 0x7adfd0); }
function buildUmbrashade(): BespokeBuild { return makeProceduralBespoke('brute', { primary: 0x9a5af2, secondary: 0x7a8af2, accent: 0x101018 }, 0x7a8af2); }
function buildSolgaleo(): BespokeBuild { return makeProceduralBespoke('beast', { primary: 0xff8c00, secondary: 0x7a8af2, accent: 0xffffff }, 0x7a8af2); }
function buildTidedeep(): BespokeBuild { return makeProceduralBespoke('serpent', { primary: 0x2a5d9e, secondary: 0x9a5af2, accent: 0x101018 }, 0x9a5af2); }
function buildThornspark(): BespokeBuild { return makeProceduralBespoke('sprite', { primary: 0x4ec45e, secondary: 0xf2d23a, accent: 0xffffff }, 0xf2d23a); }
function buildDuskbloom(): BespokeBuild { return makeProceduralBespoke('sprite', { primary: 0x9a5af2, secondary: 0x4ec45e, accent: 0x101018 }, 0x4ec45e); }
function buildAethergale(): BespokeBuild { return makeProceduralBespoke('avian', { primary: 0x7a8af2, secondary: 0xff9ad2, accent: 0xffffff }, 0xff9ad2); }
function buildLavachain(): BespokeBuild { return makeProceduralBespoke('brute', { primary: 0xf2603a, secondary: 0xb0865a, accent: 0xffffff }, 0xb0865a); }
function buildStormwave(): BespokeBuild { return makeProceduralBespoke('serpent', { primary: 0xf2d23a, secondary: 0x3a9df2, accent: 0xffffff }, 0x3a9df2); }
function buildGlaciervine(): BespokeBuild { return makeProceduralBespoke('brute', { primary: 0x9adff2, secondary: 0x4ec45e, accent: 0xffffff }, 0x4ec45e); }
function buildShadowlight(): BespokeBuild { return makeProceduralBespoke('beast', { primary: 0x9a5af2, secondary: 0xf2e8b8, accent: 0xffffff }, 0xf2e8b8); }
function buildAetherion(): BespokeBuild { return makeProceduralBespoke('beast', { primary: 0x7a8af2, secondary: 0xff9ad2, accent: 0xffffff }, 0xff9ad2); }

// 6 extra-evolutions
function buildPyromount(): BespokeBuild { return makeProceduralBespoke('beast', { primary: 0xd9542e, secondary: 0xb0865a, accent: 0xfff0c8 }, 0xb0865a); }
function buildPuddlecrest(): BespokeBuild { return makeProceduralBespoke('sprite', { primary: 0x3a8dd9, secondary: 0xf2e8b8, accent: 0xd8f2ff }, 0xf2e8b8); }
function buildSproutshell(): BespokeBuild { return makeProceduralBespoke('shell', { primary: 0x4ea84e, secondary: 0xb0865a, accent: 0xffffff }, 0xb0865a); }
function buildZapwing(): BespokeBuild { return makeProceduralBespoke('avian', { primary: 0xf2d23a, secondary: 0x7adfd0, accent: 0xffffff }, 0x7adfd0); }
function buildWispserpent(): BespokeBuild { return makeProceduralBespoke('serpent', { primary: 0x7adfd0, secondary: 0x9a5af2, accent: 0xffffff }, 0x9a5af2); }
function buildShadeclaw(): BespokeBuild { return makeProceduralBespoke('brute', { primary: 0x9a5af2, secondary: 0xf2d23a, accent: 0x101018 }, 0xf2d23a); }
