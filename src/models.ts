// ============================================================
// AZ Tamer — procedural 3D: guardian models, textures, tweens
// ============================================================
import * as THREE from 'three';
import { SPECIES, TYPE_COLORS, type Archetype } from './data';

// ---------------- tween system ----------------
type TweenFn = (t: number) => void;
interface ActiveTween { fn: TweenFn; dur: number; t: number; done?: () => void; ease: (x: number) => number; }
const tweens: ActiveTween[] = [];

export const Ease = {
  linear: (x: number) => x,
  outQuad: (x: number) => 1 - (1 - x) * (1 - x),
  inQuad: (x: number) => x * x,
  outBack: (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2),
  inOut: (x: number) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
};

export function tween(dur: number, fn: TweenFn, ease = Ease.outQuad): Promise<void> {
  return new Promise(res => {
    tweens.push({ fn, dur, t: 0, ease, done: res });
  });
}

export function updateTweens(dt: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const x = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(x));
    if (x >= 1) { tweens.splice(i, 1); tw.done?.(); }
  }
}

export const wait = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ---------------- canvas textures ----------------
export function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// deterministic pseudo-random for texture noise
export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stoneTexture(base = '#3a3f52', crack = '#262a3a', repeat = 4): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(42);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = rnd() * 0.16 - 0.08;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5);
    }
    ctx.strokeStyle = crack; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += rnd() * 40 - 20; y += rnd() * 40 - 20; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, repeat);
}

export function groundTexture(base = '#4a6a3a', fleck = '#6a8a4a', repeat = 8): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(7);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? fleck : 'rgba(0,0,0,0.12)';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 3);
    }
  }, repeat);
}

/** Equirectangular planet texture: oceans, blobby continents, ice caps. */
export function globeTexture(): THREE.Texture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry(1337);
  // ocean with depth banding
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#1d3f6e'); sea.addColorStop(0.5, '#2a5d9e'); sea.addColorStop(1, '#1d3f6e');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  // continents: clustered blobs
  for (let land = 0; land < 9; land++) {
    const cx = rnd() * W, cy = H * (0.18 + rnd() * 0.64);
    const tone = rnd();
    for (let b = 0; b < 60; b++) {
      const a = rnd() * Math.PI * 2, d = rnd() * rnd() * 90;
      const x = cx + Math.cos(a) * d * 1.6, y = cy + Math.sin(a) * d;
      const r = 8 + rnd() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const col = tone > 0.6 ? '#b08a52' : tone > 0.3 ? '#4e8a42' : '#3e7a52';
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(60,110,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc((x + W) % W, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // speckle detail
  for (let i = 0; i < 2600; i++) {
    const v = rnd() * 0.1 - 0.05;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // polar ice caps
  for (const [y0, y1, flip] of [[0, 40, false], [H - 40, H, true]] as const) {
    for (let x = 0; x < W; x += 6) {
      const depth = 18 + rnd() * 26;
      ctx.fillStyle = 'rgba(232,240,250,0.92)';
      if (!flip) ctx.fillRect(x, y0, 6, 40 - 18 + depth * 0.4);
      else ctx.fillRect(x, y1 - (22 + depth * 0.4), 6, 22 + depth * 0.4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function plankTexture(base = '#7a5a3a', repeat = 2): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(99);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.1})`;
      ctx.fillRect(0, y, s, 3);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
        ctx.fillRect(rnd() * s, y + 4 + rnd() * 24, 10 + rnd() * 50, 1.5);
      }
    }
  }, repeat);
}

/** Polished marble floor with veins — for grand interiors. */
export function marbleTexture(base = '#cfd2dd', vein = '#9aa0b5', repeat = 6): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(2024);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    // soft cloudy shading
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(rnd() * s, rnd() * s, 4, rnd() * s, rnd() * s, 30 + rnd() * 60);
      g.addColorStop(0, `rgba(255,255,255,${rnd() * 0.10})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    // veins
    ctx.strokeStyle = vein; ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) { x += rnd() * 54 - 27; y += rnd() * 54 - 27; ctx.lineTo(x, y); }
      ctx.globalAlpha = 0.35 + rnd() * 0.3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // tile grout lines
    ctx.strokeStyle = 'rgba(40,44,60,0.55)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
  }, repeat);
}

/** Woven carpet with border pattern. */
export function carpetTexture(base = '#7a2e35', accent = '#d8b56a', repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(555);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.10})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    ctx.strokeStyle = accent; ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, s - 44, s - 44);
    // diamond medallion
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.30); ctx.lineTo(s * 0.70, s / 2); ctx.lineTo(s / 2, s * 0.70); ctx.lineTo(s * 0.30, s / 2);
    ctx.closePath(); ctx.stroke();
  }, repeat);
}

/** Checkered cafeteria / utility tiles. */
export function tileTexture(a = '#b8bcc8', b = '#787e92', repeat = 8): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const rnd = mulberry(31);
    ctx.fillStyle = a; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = b; ctx.fillRect(0, 0, s / 2, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, repeat);
}

/** Wainscoted interior wall: painted upper, wood lower, trim rail. */
export function wallpaperTexture(upper = '#5a6080', lower = '#4a3826', rail = '#c8b282', repeat = 3): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(808);
    ctx.fillStyle = upper; ctx.fillRect(0, 0, s, s * 0.62);
    // subtle vertical stripe pattern on the upper wall
    for (let x = 0; x < s; x += 22) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, 0, 9, s * 0.62);
    }
    ctx.fillStyle = lower; ctx.fillRect(0, s * 0.62, s, s * 0.38);
    for (let x = 0; x < s; x += 36) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, s * 0.62, 2, s * 0.38);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * s, s * 0.62 + rnd() * s * 0.38, 6, 1.5);
    }
    ctx.fillStyle = rail; ctx.fillRect(0, s * 0.60, s, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, s * 0.625, s, 2);
  }, repeat);
}

/** Library bookshelf face — rows of colorful book spines. */
export function bookshelfTexture(repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(404);
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, s, s);
    const palette = ['#a8453a', '#3a6ea8', '#4a8a4a', '#b08a3a', '#7a4a9a', '#9a9aa8', '#5a8a8a', '#c46a3a'];
    for (let row = 0; row < 4; row++) {
      const y = 8 + row * 62;
      ctx.fillStyle = '#241a0e'; ctx.fillRect(0, y + 52, s, 10); // shelf board
      let x = 6;
      while (x < s - 10) {
        const w = 9 + rnd() * 13;
        const h = 38 + rnd() * 12;
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
        ctx.fillRect(x, y + 52 - h, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 52 - h + 5, w - 4, 2);
        x += w + 2;
        if (rnd() < 0.08) x += 12; // gap of a borrowed book
      }
    }
  }, repeat);
}

// ---------------- guardian model parts ----------------
const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08, ...opts });

interface GuardianRig {
  group: THREE.Group;          // root (position this)
  body: THREE.Group;           // animatable core
  parts: { head?: THREE.Object3D; tail?: THREE.Object3D; wings?: THREE.Object3D[]; };
  baseY: number;
  phase: number;               // idle anim phase offset
}

const rigs = new Set<GuardianRig>();

export function disposeRig(r: GuardianRig): void {
  rigs.delete(r);
  r.group.removeFromParent();
}

function eye(color = 0x101018): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(color, { roughness: 0.2 }));
}

function buildArchetype(arch: Archetype, p: { primary: number; secondary: number; accent: number }, glow: number): THREE.Group {
  const g = new THREE.Group();
  const prim = mat(p.primary);
  const sec = mat(p.secondary);
  const acc = mat(p.accent, { emissive: glow, emissiveIntensity: 0.55, roughness: 0.3 });

  if (arch === 'beast') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), prim);
    body.scale.set(1.25, 0.95, 0.9); body.position.y = 0.55; g.add(body);
    const head = new THREE.Group(); head.position.set(0.45, 0.85, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), sec); head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), prim);
    snout.rotation.z = -Math.PI / 2; snout.position.set(0.3, -0.05, 0); head.add(snout);
    const e1 = eye(), e2 = eye(); e1.position.set(0.2, 0.1, 0.16); e2.position.set(0.2, 0.1, -0.16); head.add(e1, e2);
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
      y += r * 1.15; x -= 0.1; r *= 0.88;
    }
    const head = new THREE.Group(); head.position.set(x + 0.12, y + 0.05, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), prim);
    skull.scale.set(1.3, 0.9, 1); head.add(skull);
    const e1 = eye(0xfff0a0), e2 = eye(0xfff0a0);
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
    const e1 = eye(), e2 = eye(); e1.position.set(0.14, 0.08, 0.14); e2.position.set(0.14, 0.08, -0.14); head.add(e1, e2);
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
    const e1 = eye(0xffd0a0), e2 = eye(0xffd0a0);
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
    const e1 = eye(0xffffff), e2 = eye(0xffffff);
    e1.scale.setScalar(1.4); e2.scale.setScalar(1.4);
    e1.position.set(0.26, 0.62, 0.13); e2.position.set(0.26, 0.62, -0.13); g.add(e1, e2);
    const p1 = eye(), p2 = eye();
    p1.scale.setScalar(0.7); p2.scale.setScalar(0.7);
    p1.position.set(0.32, 0.62, 0.13); p2.position.set(0.32, 0.62, -0.13); g.add(p1, p2);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), acc);
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.55; halo.name = 'tail'; g.add(halo);
    for (let i = 0; i < 3; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), acc);
      const a = (i / 3) * Math.PI * 2;
      orb.position.set(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42); g.add(orb);
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
    const e1 = eye(0xfff0a0), e2 = eye(0xfff0a0);
    e1.position.set(0.12, 0.05, 0.09); e2.position.set(0.12, 0.05, -0.09); head.add(e1, e2);
    head.name = 'head'; g.add(head);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), acc);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.3, 0.62, Math.sin(a) * 0.3);
      spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(spike);
    }
    for (const [x, z] of [[0.25, 0.3], [0.25, -0.3], [-0.25, 0.3], [-0.25, -0.3]]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), prim);
      foot.position.set(x, 0.1, z); g.add(foot);
    }
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

export function makeGuardian(speciesId: string): GuardianRig {
  const def = SPECIES[speciesId];
  const glow = TYPE_COLORS[def.type];
  const body = buildArchetype(def.archetype, def.palette, glow);
  body.scale.setScalar(def.scale);

  // Aether-stage beings carry a radiant double-halo and orbit motes
  if (def.stage === 'Aether') {
    const auraMat = new THREE.MeshStandardMaterial({
      color: def.palette.accent, emissive: glow, emissiveIntensity: 2.2, roughness: 0.05,
      transparent: true, opacity: 0.9,
    });
    for (const [r, y, tilt] of [[0.55, 1.5, Math.PI / 2], [0.42, 1.62, Math.PI / 2.6]] as const) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 28), auraMat);
      halo.rotation.x = tilt;
      halo.position.y = y;
      body.add(halo);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), auraMat);
      mote.position.set(Math.cos(a) * 0.85, 0.7 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.85);
      body.add(mote);
    }
    const aLight = new THREE.PointLight(glow, 8, 6);
    aLight.position.y = 1.2;
    body.add(aLight);
  }

  // Custom Legendary Enhancements!
  if (['solarex', 'leviathorn', 'yggdranox', 'raidenjin', 'chthonix', 'zephyrax'].includes(speciesId)) {
    const accMat = new THREE.MeshStandardMaterial({
      color: def.palette.accent,
      emissive: glow,
      emissiveIntensity: 1.8,
      roughness: 0.1
    });

    if (speciesId === 'solarex') {
      // Glowing halo above head
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), accMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0.45, 1.4, 0); // above head
      body.add(halo);
    } else if (speciesId === 'leviathorn') {
      // Extra back spikes
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), accMat);
        spike.position.set(-0.4 - i * 0.3, 0.8 + i * 0.2, 0.2 * (i % 2 ? 1 : -1));
        spike.rotation.z = Math.PI / 4;
        body.add(spike);
      }
    } else if (speciesId === 'yggdranox') {
      // Floating leaf orbs around shoulders
      for (const side of [1, -1]) {
        const orb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), accMat);
        orb.position.set(0, 1.6, side * 0.75);
        body.add(orb);
      }
    } else if (speciesId === 'raidenjin') {
      // Double wing layers
      const w1 = body.getObjectByName('wing1');
      const w2 = body.getObjectByName('wing-1');
      if (w1) {
        const w1Extra = w1.clone();
        w1Extra.scale.setScalar(0.7);
        w1Extra.position.y -= 0.3;
        w1.add(w1Extra);
      }
      if (w2) {
        const w2Extra = w2.clone();
        w2Extra.scale.setScalar(0.7);
        w2Extra.position.y -= 0.3;
        w2.add(w2Extra);
      }
    } else if (speciesId === 'chthonix') {
      // Glowing dark shroud orbs
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 18), accMat);
      halo.position.set(0, 0.65, 0);
      body.add(halo);
    } else if (speciesId === 'zephyrax') {
      // Feathered tail fan
      const tail = body.getObjectByName('tail');
      if (tail) {
        const fan = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), accMat);
        fan.position.set(-0.2, 0.3, 0);
        tail.add(fan);
      }
    }
  }

  const group = new THREE.Group();
  // archetypes are modeled facing +X; normalize so rotation.y = atan2(dx, dz) faces +Z
  const orient = new THREE.Group();
  orient.rotation.y = -Math.PI / 2;
  orient.add(body);
  group.add(orient);

  // type-colored ground ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5 * def.scale, 0.62 * def.scale, 28),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  const rig: GuardianRig = {
    group, body,
    parts: {
      head: body.getObjectByName('head') ?? undefined,
      tail: body.getObjectByName('tail') ?? undefined,
      wings: [body.getObjectByName('wing1'), body.getObjectByName('wing-1')].filter(Boolean) as THREE.Object3D[],
    },
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
  };
  rigs.add(rig);
  return rig;
}

let clock = 0;
/** Idle animations for all live rigs: breathing bob, tail sway, wing flaps. */
export function updateRigs(dt: number): void {
  clock += dt;
  for (const r of rigs) {
    const t = clock * 2.2 + r.phase;
    r.body.position.y = r.baseY + Math.sin(t) * 0.045;
    if (r.parts.tail) r.parts.tail.rotation.x = Math.sin(t * 1.4) * 0.25;
    if (r.parts.head) r.parts.head.rotation.y = Math.sin(t * 0.6) * 0.12;
    r.parts.wings?.forEach((w, i) => { w.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.5; });
  }
}

export type { GuardianRig };

// ---------------- crawler model ----------------
export function makeCrawler(): THREE.Group {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.y = -Math.PI / 2; // model is built facing +X; normalize front to +Z
  root.add(g);
  const bodyMat = mat(0x8a4a2a, { metalness: 0.4, roughness: 0.5 });
  const shellMat = mat(0xc4622e, { metalness: 0.3, roughness: 0.45 });
  const darkMat = mat(0x2a2a35, { metalness: 0.5 });

  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), shellMat);
  hull.scale.set(1.4, 0.75, 1); hull.position.y = 0.5; g.add(hull);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), bodyMat);
  cab.position.set(0.25, 0.85, 0); g.add(cab);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0x6ec4f2, { emissive: 0x3a9df2, emissiveIntensity: 0.7, roughness: 0.15 }));
  visor.scale.set(0.7, 0.55, 1); visor.position.set(0.45, 0.9, 0); g.add(visor);
  // cannon
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.55, 8), darkMat);
  barrel.rotation.z = -Math.PI / 2.4; barrel.position.set(0.55, 1.1, 0.25); g.add(barrel);
  // antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), darkMat);
  ant.position.set(-0.3, 1.15, 0); g.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xf2c14e, { emissive: 0xf2c14e, emissiveIntensity: 0.8 }));
  antTip.position.set(-0.3, 1.42, 0); antTip.name = 'beacon'; g.add(antTip);
  // legs (6)
  for (let i = 0; i < 3; i++) {
    for (const side of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 6), darkMat);
      leg.position.set(-0.4 + i * 0.4, 0.22, side * 0.5);
      leg.rotation.x = side * 0.5;
      leg.name = `leg${i}${side}`;
      g.add(leg);
    }
  }
  g.traverse(o => { o.castShadow = true; });
  return root;
}

// ---------------- voxel human (tamer & NPCs) ----------------
export interface VoxelHumanOpts {
  skin?: number; hair?: number; top?: number; sleeves?: number;
  bottom?: number; shoes?: number; cap?: number | null; robe?: boolean;
  topColor?: number; topTex?: THREE.Texture | null;
  bottomColor?: number; bottomTex?: THREE.Texture | null;
  sleeveColor?: number; sleeveTex?: THREE.Texture | null;
  shoeColor?: number; shoeTex?: THREE.Texture | null;
  capColor?: number; capTex?: THREE.Texture | null;
  glovesColor?: number; glovesTex?: THREE.Texture | null;
  backpackColor?: number; backpackTex?: THREE.Texture | null;
}

function faceTexture(skin: number, smile = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${skin.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 64, 64);
  // eyes
  ctx.fillStyle = '#ffffff'; ctx.fillRect(14, 26, 12, 10); ctx.fillRect(38, 26, 12, 10);
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(18, 28, 6, 8); ctx.fillRect(42, 28, 6, 8);
  // brows
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(14, 22, 12, 3); ctx.fillRect(38, 22, 12, 3);
  // mouth
  ctx.fillStyle = '#a05a4a';
  if (smile) { ctx.fillRect(24, 46, 16, 4); ctx.fillRect(22, 44, 4, 4); ctx.fillRect(38, 44, 4, 4); }
  else ctx.fillRect(26, 46, 12, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const vmat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });

const customMat = (color?: number, tex?: THREE.Texture | null, fallbackColor = 0x888888) => {
  const opts: THREE.MeshStandardMaterialParameters = {
    roughness: 0.8,
    metalness: 0.05
  };
  if (tex) {
    opts.map = tex;
    opts.color = color !== undefined ? color : 0xffffff;
  } else {
    opts.color = color !== undefined ? color : fallbackColor;
  }
  return new THREE.MeshStandardMaterial(opts);
};

/** Blocky voxel-style human, built facing +Z, with pivoted limbs for animation. */
export function makeVoxelHuman(opts: VoxelHumanOpts = {}): THREE.Group {
  const skin = opts.skin ?? 0xe8b48a;
  const hairC = opts.hair ?? 0x35261a;
  const topC = opts.top ?? 0x2a5ad8;
  const sleeveC = opts.sleeves ?? topC;
  const bottomC = opts.bottom ?? 0x32384e;
  const shoeC = opts.shoes ?? 0x23262e;

  const root = new THREE.Group();
  const pelvis = new THREE.Group(); // bobs up/down while walking
  pelvis.name = 'pelvis';
  pelvis.position.y = 0.62;
  root.add(pelvis);

  // legs (pivot at hip)
  for (const [name, x] of [['legL', 0.09], ['legR', -0.09]] as const) {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.16), customMat(opts.bottomColor, opts.bottomTex, bottomC));
    leg.position.y = -0.25;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), customMat(opts.shoeColor, opts.shoeTex, shoeC));
    shoe.position.set(0, -0.53, 0.03);
    hip.add(leg, shoe);
    pelvis.add(hip);
  }

  // torso
  const torsoH = opts.robe ? 0.78 : 0.55;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, torsoH, 0.24), customMat(opts.topColor, opts.topTex, topC));
  torso.position.y = opts.robe ? 0.18 : 0.28;
  torso.name = 'torso';
  pelvis.add(torso);
  if (!opts.robe) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.07, 0.25), vmat(0x1a1d28));
    belt.position.y = 0.02;
    pelvis.add(belt);
  }
  // backpack
  const hasBackpack = opts.backpackTex !== null && opts.backpackTex !== undefined;
  if (hasBackpack) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.14), customMat(opts.backpackColor, opts.backpackTex, 0x8a5a2a));
    pack.position.set(0, 0.3, -0.2);
    pelvis.add(pack);
  }

  // arms (pivot at shoulder)
  for (const [name, x] of [['armL', 0.28], ['armR', -0.28]] as const) {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.5, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.15), customMat(opts.sleeveColor, opts.sleeveTex, sleeveC));
    arm.position.y = -0.18;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.13), customMat(opts.glovesColor, opts.glovesTex, skin));
    hand.position.y = -0.43;
    shoulder.add(arm, hand);
    pelvis.add(shoulder);
  }

  // head with voxel face on the +Z side
  const headG = new THREE.Group();
  headG.name = 'head';
  headG.position.y = 0.62;
  const side = vmat(skin);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(skin), roughness: 0.75 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.34),
    [side, side, side, side, faceMat, side]); // +z face gets the face texture
  head.position.y = 0.17;
  headG.add(head);
  // hair: top slab + back panel + fringe
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), vmat(hairC));
  hairTop.position.y = 0.37;
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), vmat(hairC));
  hairBack.position.set(0, 0.2, -0.16);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.06), vmat(hairC));
  fringe.position.set(0, 0.3, 0.16);
  headG.add(hairTop, hairBack, fringe);
  const hasCap = (opts.cap !== null && opts.cap !== undefined) || (opts.capTex !== null && opts.capTex !== undefined);
  if (hasCap) {
    const capC = opts.cap ?? 0xd84a3a;
    const capMat = customMat(opts.capColor, opts.capTex, capC);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.4), capMat);
    cap.position.y = 0.4;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.18), capMat);
    brim.position.set(0, 0.38, 0.27);
    headG.add(cap, brim);
  }
  pelvis.add(headG);

  root.userData = { t: Math.random() * 6, walk: 0 };
  root.traverse(o => { o.castShadow = true; });
  return root;
}

export function makeTamer(): THREE.Group {
  return makeVoxelHuman({ top: 0x2a5ad8, bottom: 0x32384e, cap: 0xd84a3a });
}

/** Pose a voxel human sitting on a seat of the given height. Set seated=false to stand back up. */
export function setVoxelSeated(g: THREE.Group, seated: boolean, seatY = 0.42): void {
  (g.userData as Record<string, unknown>).seated = seated;
  (g.userData as Record<string, unknown>).seatY = seatY;
}

/** Smoothly blended idle/walk animation for a voxel human. Call every frame. */
export function updateVoxelHuman(g: THREE.Group, walking: boolean, dt: number): void {
  const u = g.userData as { t: number; walk: number; seated?: boolean; seatY?: number };
  u.walk += ((walking ? 1 : 0) - u.walk) * Math.min(1, dt * 9);
  u.t += dt * (2.2 + u.walk * 8.5);
  const s = Math.sin(u.t);
  const w = u.walk, idle = 1 - u.walk;
  const get = (n: string) => g.getObjectByName(n);
  const armL = get('armL'), armR = get('armR'), legL = get('legL'), legR = get('legR');
  const head = get('head'), pelvis = get('pelvis');
  if (u.seated) {
    // thighs forward, hands resting on lap, gentle breathing
    if (legL) legL.rotation.x = -1.45;
    if (legR) legR.rotation.x = -1.45;
    if (armL) { armL.rotation.x = -0.55 + Math.sin(u.t * 0.7) * 0.03; armL.rotation.z = 0.1; }
    if (armR) { armR.rotation.x = -0.55 + Math.sin(u.t * 0.7 + 0.8) * 0.03; armR.rotation.z = -0.1; }
    if (head) { head.rotation.y = Math.sin(u.t * 0.4) * 0.16; head.rotation.x = Math.sin(u.t * 0.8) * 0.03; }
    if (pelvis) pelvis.position.y = (u.seatY ?? 0.42) + Math.sin(u.t * 1.1) * 0.006;
    return;
  }
  if (armL) { armL.rotation.x = -s * 0.85 * w + Math.sin(u.t * 0.9) * 0.05 * idle; armL.rotation.z = 0.06 + Math.sin(u.t * 0.7) * 0.03 * idle; }
  if (armR) { armR.rotation.x = s * 0.85 * w + Math.sin(u.t * 0.9 + 1.4) * 0.05 * idle; armR.rotation.z = -0.06 - Math.sin(u.t * 0.7 + 0.5) * 0.03 * idle; }
  if (legL) legL.rotation.x = s * 0.95 * w;
  if (legR) legR.rotation.x = -s * 0.95 * w;
  if (head) { head.rotation.y = Math.sin(u.t * 0.45) * 0.1 * idle; head.rotation.x = Math.sin(u.t * 0.8) * 0.02; }
  if (pelvis) pelvis.position.y = 0.62 + Math.abs(Math.cos(u.t)) * 0.055 * w + Math.sin(u.t * 1.1) * 0.008 * idle;
}

// ---------------- shared scene helpers ----------------
export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function skyGradient(top: string, bottom: string): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const grd = ctx.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, top); grd.addColorStop(1, bottom);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, s, s);
  });
}

export function makeFloatingDamageText(scene: THREE.Scene, pos: THREE.Vector3, text: string, color: string): void {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 64px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8; ctx.strokeStyle = '#000';
  ctx.strokeText(text, 128, 80);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.8, 1);
  sprite.position.copy(pos);
  scene.add(sprite);
  const startY = pos.y;
  tween(0.9, t => {
    sprite.position.y = startY + t * 1.1;
    sprite.material.opacity = 1 - t * t;
  }).then(() => {
    scene.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
}
