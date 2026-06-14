// ============================================================
// AZ Tamer — Terra City Boutique cosmetics: animated special-FX
// gear that layers living effects onto the voxel tamer rig.
//
// The base wardrobe (clothes.ts) only swaps flat textures/colors.
// Terra City's atelier sells *prestige* gear: spinning rotors,
// flame plumes, cosmic orbs, chrome sheens, flashing power-suits,
// full robo frames, thruster boots, energy wings and more. Each
// piece attaches extra meshes to the rig and returns a per-frame
// updater so the effect breathes everywhere the tamer is drawn.
//
// Pipeline (no import cycle): clothes.ts -> cosmetics.ts -> models.ts.
// updateTamerAppearance() calls attachCosmeticFx(); the returned
// updaters are stashed on the rig's userData and run by
// updateTamerFX() (models.ts) — invoked from updateVoxelHuman() in
// every scene, and from the boutique mirror loops.
// ============================================================
import * as THREE from 'three';
import { canvasTex, mulberry } from './models';

export type FxSlot = 'hat' | 'shirt' | 'pants' | 'gloves' | 'backpack' | 'shoes';

/** Compact description of a prestige effect, carried on a ClothesItem. */
export interface FxSpec {
  kind: string;       // which builder to run
  color?: number;     // primary glow / accent color
  color2?: number;    // secondary color (gradients, dual-tone flash, trails)
  speed?: number;     // animation rate multiplier
  scale?: number;     // overall size multiplier
}

export type FxUpdater = (t: number, dt: number) => void;

interface FxCtx {
  host: THREE.Group;                          // container, already parented to the right rig anchor
  rig: THREE.Group;                           // the whole tamer root (for cross-part attachments)
  spec: FxSpec;
  rng: () => number;
  /** Add an object and register its geometry/material for disposal on outfit change. */
  add: <T extends THREE.Object3D>(obj: T, parent?: THREE.Object3D) => T;
}

type FxBuilder = (ctx: FxCtx) => FxUpdater;

// =================== shared materials / textures ===================

const emis = (color: number, i = 1.4) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.35, metalness: 0.35 });

const glowM = (color: number, o = 0.5) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

const metalM = (color: number, rough = 0.28) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.92, roughness: rough });

const darkM = (color = 0x1a2030) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.5 });

// shared white radial-falloff sprite texture (tinted per-sprite via material.color)
let _glowTex: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  if (!_glowTex) {
    _glowTex = canvasTex(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    _glowTex.wrapS = _glowTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return _glowTex;
}

/** A soft additive billboard halo. Never disposed (shares the cached texture). */
function softGlow(color: number, size: number, o = 0.85): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.set(size, size, 1);
  return sp;
}

// shared sparkle dot texture for Points particles
let _dotTex: THREE.Texture | null = null;
function dotTex(): THREE.Texture {
  if (!_dotTex) {
    _dotTex = canvasTex(32, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    _dotTex.wrapS = _dotTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return _dotTex;
}

// brushed/mirror sheen gradient (silver, gold, dark) — cached & never disposed
const _sheenCache = new Map<string, THREE.Texture>();
function sheenTex(lo: string, mid: string, hi: string): THREE.Texture {
  const key = lo + mid + hi;
  let t = _sheenCache.get(key);
  if (!t) {
    t = canvasTex(128, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, lo); g.addColorStop(0.35, mid); g.addColorStop(0.5, hi);
      g.addColorStop(0.65, mid); g.addColorStop(1, lo);
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      // faint horizontal brushing
      ctx.globalAlpha = 0.10; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      for (let y = 0; y < s; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    t.wrapS = THREE.RepeatWrapping;
    _sheenCache.set(key, t);
  }
  return t.clone(); // clone so per-instance offset scroll is independent (shares image, cheap)
}

const hx = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

// a small Points cloud of drifting sparks around a center
function sparkCloud(add: FxCtx['add'], count: number, spread: number, color: number, size: number, host: THREE.Object3D) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    seed[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map: dotTex(), color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const pts = add(new THREE.Points(geo, mat), host);
  return { pts, pos, seed, geo };
}

// =================== HAT effects ===================

const buildHeli: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0x6fe0ff;
  const speed = (spec.speed ?? 1) * 11;
  const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6), metalM(0x9fb0c8)), host);
  mast.position.set(0, 0.7, 0);
  const hub = add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), emis(color, 1.0)), host);
  hub.position.set(0, 0.88, 0);
  const rotor = add(new THREE.Group(), host);
  rotor.position.set(0, 0.9, 0);
  const blades = spec.scale && spec.scale > 1 ? 5 : 4;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.075), metalM(0xcfd8e6, 0.4)), rotor);
    blade.position.set(Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31);
    blade.rotation.y = -a;
    blade.rotation.z = 0.12;
    const tip = add(softGlow(color, 0.18), blade);
    tip.position.set(0.31, 0, 0);
  }
  const wash = add(softGlow(color, 0.5, 0.35), host);
  wash.position.set(0, 0.9, 0);
  return (t) => {
    rotor.rotation.y = t * speed;
    wash.material.opacity = 0.22 + Math.abs(Math.sin(t * 6)) * 0.18;
  };
};

const buildPropeller: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xff5aa8;
  const pin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), metalM(0x8a93a8)), host);
  pin.position.set(0, 0.6, 0);
  const rotor = add(new THREE.Group(), host);
  rotor.position.set(0, 0.67, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.1), emis([color, 0xffd23a, 0x5aff9a][i % 3], 0.9)), rotor);
    blade.position.set(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13);
    blade.rotation.y = -a; blade.rotation.z = 0.5;
  }
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), metalM(color)), host);
  cap.position.set(0, 0.72, 0);
  return (t) => { rotor.rotation.y = t * (spec.speed ?? 1) * 9; };
};

const buildFlame: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xff7a1a;
  const color2 = spec.color2 ?? 0xffe23a;
  const tongues: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.06 + (i % 2) * 0.05;
    const f = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), glowM(i % 2 ? color2 : color, 0.8)), host);
    f.position.set(Math.cos(a) * r, 0.62 + (i % 3) * 0.04, Math.sin(a) * r);
    f.userData.ph = Math.random() * 6.28; f.userData.base = f.position.y;
    tongues.push(f);
  }
  const core = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowM(color2, 0.7)), host);
  core.position.set(0, 0.62, 0);
  const halo = add(softGlow(color, 0.7, 0.5), host); halo.position.set(0, 0.7, 0);
  const sparks = sparkCloud(add, 14, 0.4, color2, 0.05, host);
  sparks.pts.position.set(0, 0.78, 0);
  return (t, dt) => {
    for (const f of tongues) {
      const k = 0.7 + Math.sin(t * (spec.speed ?? 1) * 9 + f.userData.ph) * 0.45;
      f.scale.set(1, k, 1);
      f.position.y = f.userData.base + k * 0.05;
      (f.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 12 + f.userData.ph) * 0.3;
    }
    const a = sparks.pos;
    for (let i = 0; i < sparks.seed.length; i++) {
      a[i * 3 + 1] = ((a[i * 3 + 1] + dt * 0.4 + 0.3) % 0.6) - 0.3;
    }
    sparks.geo.attributes.position.needsUpdate = true;
    halo.material.opacity = 0.4 + Math.sin(t * 7) * 0.18;
  };
};

const buildCosmicOrb: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0x9a6cff;
  const color2 = spec.color2 ?? 0x6fe0ff;
  const orb = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), emis(color, 1.5)), host);
  orb.position.set(0, 0.92, 0);
  const halo = add(softGlow(color2, 0.95, 0.6), host); halo.position.copy(orb.position);
  const ringG = add(new THREE.Group(), host); ringG.position.copy(orb.position); ringG.rotation.x = 1.1;
  for (let i = 0; i < 2; i++) {
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.24 + i * 0.06, 0.012, 6, 40), emis(color2, 1.2)), ringG);
    ring.rotation.x = i * 0.5;
  }
  const moons: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const m = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), emis([0xffffff, color2, color][i], 1.4)), ringG);
    m.userData.a = (i / 3) * Math.PI * 2; m.userData.r = 0.28 + i * 0.04;
    moons.push(m);
  }
  const stars = sparkCloud(add, 18, 0.6, 0xffffff, 0.04, host); stars.pts.position.copy(orb.position);
  return (t) => {
    orb.rotation.y = t * 1.4; orb.rotation.x = t * 0.7;
    ringG.rotation.z = t * 0.8;
    const sp = (spec.speed ?? 1) * 1.6;
    moons.forEach((m, i) => {
      const a = m.userData.a + t * sp * (1 + i * 0.3);
      m.position.set(Math.cos(a) * m.userData.r, 0, Math.sin(a) * m.userData.r);
    });
    halo.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;
    stars.pts.rotation.y = -t * 0.4;
  };
};

const buildHalo: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xffe27a;
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 48), emis(color, 1.8)), host);
  ring.position.set(0, 0.78, 0); ring.rotation.x = Math.PI / 2;
  const glow = add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 48), glowM(color, 0.5)), host);
  glow.position.copy(ring.position); glow.rotation.x = Math.PI / 2;
  const beam = add(softGlow(color, 0.55, 0.4), host); beam.position.set(0, 0.78, 0);
  return (t) => {
    ring.rotation.z = t * (spec.speed ?? 1) * 1.4;
    ring.position.y = 0.78 + Math.sin(t * 1.6) * 0.03;
    glow.position.y = ring.position.y;
    (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 4) * 0.5;
    beam.material.opacity = 0.3 + Math.sin(t * 2) * 0.12;
  };
};

const buildAtom: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0x5aff9a;
  const nucleus = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), emis(color, 1.6)), host);
  nucleus.position.set(0, 0.86, 0);
  add(softGlow(color, 0.4, 0.6), host).position.copy(nucleus.position);
  const shells: { g: THREE.Group; e: THREE.Object3D; sp: number }[] = [];
  const tilts: [number, number][] = [[0, 0], [Math.PI / 2.4, 0.7], [-Math.PI / 2.4, -0.7]];
  tilts.forEach((tl, i) => {
    const g = add(new THREE.Group(), host); g.position.copy(nucleus.position);
    g.rotation.set(tl[0], tl[1], 0);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.006, 6, 40), emis(0xbfe8ff, 0.8)), g);
    ring.rotation.x = Math.PI / 2;
    const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), emis([0xffffff, color, 0x6fe0ff][i], 1.6)), g);
    shells.push({ g, e, sp: 2.4 + i * 1.1 });
  });
  return (t) => {
    nucleus.rotation.y = t * 2;
    shells.forEach((s) => {
      const a = t * s.sp * (spec.speed ?? 1);
      s.e.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
    });
  };
};

const buildAntenna: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0x6fe0ff;
  const tips: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.4, 6), metalM(0x8a93a8)), host);
    rod.position.set(sx * 0.12, 0.66, 0); rod.rotation.z = -sx * 0.25;
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), emis(color, 1.8)), host);
    ball.position.set(sx * 0.2, 0.86, 0);
    add(softGlow(color, 0.28, 0.8), ball);
    tips.push(ball);
  }
  const arc = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 6, 24, Math.PI), glowM(color, 0.0)), host);
  arc.position.set(0, 0.86, 0); arc.rotation.z = Math.PI;
  return (t) => {
    const f = (spec.speed ?? 1) * 9;
    tips.forEach((b, i) => ((b as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.abs(Math.sin(t * f + i * 1.6)) * 1.4);
    arc.material.opacity = Math.max(0, Math.sin(t * f) * 0.7); // crackle between the tips
  };
};

const buildPlasmaCrown: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xff5aa8;
  const points: THREE.Mesh[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16 + (i % 2) * 0.08, 5), emis(color, 1.6)), host);
    spike.position.set(Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2);
    spike.userData.ph = i;
    points.push(spike);
  }
  const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 40), metalM(0xf2c14e, 0.2)), host);
  band.position.set(0, 0.56, 0); band.rotation.x = Math.PI / 2;
  add(softGlow(color, 0.7, 0.4), host).position.set(0, 0.62, 0);
  return (t) => {
    points.forEach((p) => {
      const k = 1 + Math.sin(t * (spec.speed ?? 1) * 6 + p.userData.ph) * 0.4;
      p.scale.y = k;
      (p.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(t * 8 + p.userData.ph) * 0.7;
    });
  };
};

const buildSaturn: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xf2c14e;
  const color2 = spec.color2 ?? 0xff8a3a;
  const planet = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), emis(color2, 0.9)), host);
  planet.position.set(0, 0.9, 0);
  const ringG = add(new THREE.Group(), host); ringG.position.copy(planet.position); ringG.rotation.set(1.15, 0, 0.3);
  for (let i = 0; i < 3; i++) {
    const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.24 + i * 0.05, 0.018 - i * 0.003, 4, 48), emis(color, 1.1)), ringG);
    r.rotation.x = Math.PI / 2;
  }
  add(softGlow(color, 0.7, 0.4), host).position.copy(planet.position);
  return (t) => { planet.rotation.y = t * 0.8; ringG.rotation.z = 0.3 + t * (spec.speed ?? 1) * 0.5; };
};

const buildStormcloud: FxBuilder = ({ add, spec, host, rng }) => {
  const color = spec.color ?? 0xbfe8ff;
  const cloud = add(new THREE.Group(), host); cloud.position.set(0, 0.78, 0);
  for (let i = 0; i < 6; i++) {
    const puff = add(new THREE.Mesh(new THREE.SphereGeometry(0.08 + rng() * 0.05, 8, 6), darkM(0x3a4252)), cloud);
    const a = (i / 6) * Math.PI * 2;
    puff.position.set(Math.cos(a) * 0.16, rng() * 0.04, Math.sin(a) * 0.1);
  }
  const bolt = add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), glowM(color, 0)), host);
  bolt.position.set(0, 0.62, 0.04); bolt.rotation.x = Math.PI;
  const flash = add(softGlow(color, 0.6, 0), host); flash.position.set(0, 0.7, 0);
  let next = 0.6;
  return (t, dt) => {
    cloud.position.y = 0.78 + Math.sin(t * 1.2) * 0.02;
    if (t > next) {
      next = t + 0.4 + Math.random() * 1.2;
      bolt.material.opacity = 1; flash.material.opacity = 0.9;
      bolt.position.x = (Math.random() - 0.5) * 0.18;
    }
    bolt.material.opacity = Math.max(0, bolt.material.opacity - dt * 4);
    flash.material.opacity = Math.max(0, flash.material.opacity - dt * 5);
  };
};

const buildSparkler: FxBuilder = ({ add, spec, host }) => {
  const color = spec.color ?? 0xffd23a;
  const core = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), emis(color, 1.6)), host);
  core.position.set(0, 0.74, 0);
  const burst = sparkCloud(add, 30, 0.02, color, 0.05, host); burst.pts.position.set(0, 0.74, 0);
  const vel = new Float32Array(burst.seed.length * 3);
  const reseed = () => {
    for (let i = 0; i < burst.seed.length; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
      const sp = 0.4 + Math.random() * 0.5;
      vel[i * 3] = Math.sin(e) * Math.cos(a) * sp;
      vel[i * 3 + 1] = Math.cos(e) * sp;
      vel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * sp;
      burst.pos[i * 3] = burst.pos[i * 3 + 1] = burst.pos[i * 3 + 2] = 0;
    }
  };
  reseed();
  let next = 0.9, age = 0;
  return (t, dt) => {
    age += dt;
    const a = burst.pos;
    for (let i = 0; i < burst.seed.length; i++) {
      a[i * 3] += vel[i * 3] * dt; a[i * 3 + 1] += (vel[i * 3 + 1] - age * 0.6) * dt; a[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    burst.geo.attributes.position.needsUpdate = true;
    (burst.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age * 1.1);
    if (t > next) { next = t + 1.3; age = 0; reseed(); }
    (core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 20) * 0.6;
  };
};

const buildPrism: FxBuilder = ({ add, spec, host }) => {
  const crystal = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 })), host);
  crystal.position.set(0, 0.86, 0);
  const facets: THREE.Sprite[] = [];
  const cols = [0xff4a4a, 0xffd23a, 0x5aff9a, 0x4fa8ff, 0xb15aff, 0xff5aa8];
  cols.forEach((c, i) => {
    const s = add(softGlow(c, 0.3, 0.7), host);
    s.userData.a = (i / cols.length) * Math.PI * 2;
    facets.push(s);
  });
  return (t) => {
    crystal.rotation.y = t * (spec.speed ?? 1) * 1.6; crystal.rotation.x = t * 0.8;
    const mat = crystal.material as THREE.MeshStandardMaterial;
    mat.emissive.setHSL((t * 0.2) % 1, 1, 0.6);
    facets.forEach((s, i) => {
      const a = s.userData.a + t * 1.2;
      s.position.set(Math.cos(a) * 0.22, 0.86 + Math.sin(a * 1.3) * 0.08, Math.sin(a) * 0.22);
      s.material.opacity = 0.4 + Math.sin(t * 4 + i) * 0.3;
    });
  };
};

// =================== SHIRT / BODY effects ===================

// helper: drop an overlay shell onto a named rig limb so it moves with it
function shellOn(ctx: FxCtx, partName: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]): THREE.Mesh | null {
  const part = ctx.rig.getObjectByName(partName);
  if (!part) return null;
  const m = ctx.add(new THREE.Mesh(geo, mat), part);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

const buildChrome: FxBuilder = (ctx) => {
  const { spec } = ctx;
  const lo = spec.color !== undefined ? hx(spec.color) : '#5a6478';
  const hi = spec.color2 !== undefined ? hx(spec.color2) : '#ffffff';
  const mid = spec.color !== undefined ? hx(spec.color) : '#c8d2e2';
  const tex = sheenTex(lo, mid, hi);
  const mk = () => new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, metalness: 0.85, roughness: 0.18, emissive: 0x202833, emissiveIntensity: 0.25 });
  const mats: THREE.MeshStandardMaterial[] = [];
  const torso = mk(); mats.push(torso);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.45, spec.scale ? 0.58 : 0.58, 0.27), torso, [0, 0, 0]);
  for (const arm of ['armL', 'armR']) { const m = mk(); mats.push(m); shellOn(ctx, arm, new THREE.BoxGeometry(0.16, 0.44, 0.18), m, [0, -0.18, 0]); }
  // a moving highlight band that sweeps across the chrome
  return (t) => { const off = (t * 0.25) % 1; mats.forEach(m => { if (m.map) m.map.offset.x = off; }); };
};

const buildFlashSuit: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const strips: THREE.MeshStandardMaterial[] = [];
  // base dark bodysuit shells
  const base = darkM(0x0c1018);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.45, 0.58, 0.27), base, [0, 0, 0]);
  for (const arm of ['armL', 'armR']) shellOn(ctx, arm, new THREE.BoxGeometry(0.155, 0.44, 0.175), darkM(0x0c1018), [0, -0.18, 0]);
  for (const leg of ['legL', 'legR']) shellOn(ctx, leg, new THREE.BoxGeometry(0.17, 0.5, 0.18), darkM(0x0c1018), [0, -0.25, 0]);
  // glowing light-strips
  const stripGeoV = new THREE.BoxGeometry(0.03, 0.5, 0.03);
  const addStrip = (part: string, pos: [number, number, number], geo: THREE.BufferGeometry) => {
    const m = emis(0xffffff, 1.6); strips.push(m);
    shellOn(ctx, part, geo, m, pos);
  };
  for (const sx of [-0.18, 0.18]) addStrip('torso', [sx, 0, 0.135], stripGeoV);
  addStrip('torso', [0, 0.16, 0.135], new THREE.BoxGeometry(0.34, 0.03, 0.03));
  for (const arm of ['armL', 'armR']) addStrip(arm, [0, -0.18, 0.09], new THREE.BoxGeometry(0.03, 0.42, 0.03));
  for (const leg of ['legL', 'legR']) addStrip(leg, [0, -0.25, 0.1], new THREE.BoxGeometry(0.03, 0.46, 0.03));
  const chestGlow = add(softGlow(0xffffff, 0.6, 0.5), ctx.rig.getObjectByName('torso') ?? add(new THREE.Group())); chestGlow.position.set(0, 0.05, 0.2);
  const c1 = new THREE.Color(spec.color ?? 0x4fa8ff), c2 = new THREE.Color(spec.color2 ?? 0xff5aa8);
  return (t) => {
    const k = (Math.sin(t * (spec.speed ?? 1) * 5) + 1) / 2;
    const col = c1.clone().lerp(c2, k);
    strips.forEach(m => { m.color.copy(col); m.emissive.copy(col); m.emissiveIntensity = 1.2 + k * 1.2; });
    chestGlow.material.color.copy(col);
    chestGlow.material.opacity = 0.35 + k * 0.4;
  };
};

const buildArcReactor: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x6fe0ff;
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  // dark plated vest
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.46, 0.58, 0.27), metalM(0x232c3c, 0.45), [0, 0, 0]);
  const housing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 16), metalM(0x9fb0c8, 0.3)), torso);
  housing.position.set(0, 0.06, 0.16); housing.rotation.x = Math.PI / 2;
  const core = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 16), emis(color, 2)), torso);
  core.position.set(0, 0.06, 0.17); core.rotation.x = Math.PI / 2;
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), emis(color, 1.4)), torso);
  ring.position.set(0, 0.06, 0.18);
  const glow = add(softGlow(color, 0.45, 0.7), torso); glow.position.set(0, 0.06, 0.2);
  // shoulder lights
  const sh: THREE.Mesh[] = [];
  for (const arm of ['armL', 'armR']) { const m = shellOn(ctx, arm, new THREE.SphereGeometry(0.05, 8, 6), emis(color, 1.2), [0, 0.02, 0]); if (m) sh.push(m); }
  return (t) => {
    const p = 1.4 + Math.sin(t * (spec.speed ?? 1) * 3.5) * 0.6;
    (core.material as THREE.MeshStandardMaterial).emissiveIntensity = p + 0.6;
    (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = p;
    ring.rotation.z = t * 1.5;
    glow.material.opacity = 0.5 + Math.sin(t * 3.5) * 0.2;
    sh.forEach((m, i) => (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.sin(t * 4 + i * 2) * 0.5);
  };
};

const buildCircuitJersey: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x5aff9a;
  const tex = circuitFlowTex(hx(color));
  // each material scrolls its OWN texture clone — never mutate the shared cache
  const mat = new THREE.MeshStandardMaterial({ map: tex.clone(), color: 0x223040, emissive: color, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.5 });
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.45, 0.58, 0.27), mat, [0, 0, 0]);
  const am: THREE.MeshStandardMaterial[] = [mat];
  for (const arm of ['armL', 'armR']) { const m = mat.clone(); m.map = tex.clone(); am.push(m); shellOn(ctx, arm, new THREE.BoxGeometry(0.155, 0.44, 0.175), m, [0, -0.18, 0]); }
  const node = add(softGlow(color, 0.4, 0.5), ctx.rig.getObjectByName('torso') ?? add(new THREE.Group())); node.position.set(0, 0.08, 0.2);
  return (t) => {
    am.forEach(m => { if (m.map) m.map.offset.y = (t * 0.2) % 1; m.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.25; });
    node.material.opacity = 0.35 + Math.sin(t * 6) * 0.2;
  };
};

const buildHoloShimmer: FxBuilder = (ctx) => {
  const { spec } = ctx;
  const color = spec.color ?? 0x6fe0ff;
  const mk = () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.45, metalness: 0.3, roughness: 0.2, side: THREE.DoubleSide });
  const mats: THREE.MeshStandardMaterial[] = [];
  const t1 = mk(); mats.push(t1); shellOn(ctx, 'torso', new THREE.BoxGeometry(0.47, 0.6, 0.29), t1, [0, 0, 0]);
  for (const arm of ['armL', 'armR']) { const m = mk(); mats.push(m); shellOn(ctx, arm, new THREE.BoxGeometry(0.17, 0.46, 0.19), m, [0, -0.18, 0]); }
  for (const leg of ['legL', 'legR']) { const m = mk(); mats.push(m); shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.52, 0.19), m, [0, -0.25, 0]); }
  return (t) => {
    mats.forEach((m, i) => {
      m.opacity = 0.3 + (Math.sin(t * (spec.speed ?? 1) * 3 + i * 0.6) + 1) / 2 * 0.4;
      m.emissive.setHSL((0.5 + Math.sin(t * 0.5 + i) * 0.1) % 1, 0.8, 0.6);
    });
  };
};

const buildAuroraMantle: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.45, 0.58, 0.27), darkM(0x0a0e1c), [0, 0, 0]);
  const ribbons: { m: THREE.Mesh; ph: number; mat: THREE.MeshBasicMaterial }[] = [];
  const cols = [spec.color ?? 0x5affc8, spec.color2 ?? 0x9a6cff, 0x4fa8ff];
  for (let i = 0; i < 5; i++) {
    const mat = glowM(cols[i % cols.length], 0.5);
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16, 8, 1), mat), torso);
    m.position.set(0, 0.08, -0.18 - i * 0.015);
    m.userData.ph = i * 1.1;
    ribbons.push({ m, ph: i * 1.1, mat });
  }
  return (t) => {
    ribbons.forEach((r, i) => {
      const g = r.m.geometry as THREE.PlaneGeometry;
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setZ(v, Math.sin(x * 6 + t * (spec.speed ?? 1) * 2 + r.ph) * 0.08);
      }
      pos.needsUpdate = true;
      r.mat.opacity = 0.3 + Math.sin(t * 2 + i) * 0.2;
      r.m.position.y = 0.08 + Math.sin(t * 1.2 + i) * 0.05;
    });
  };
};

const buildMagmaPlate: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff5a1a;
  const tex = crackTex(hx(color));
  const mk = () => new THREE.MeshStandardMaterial({ map: tex.clone(), color: 0x2a1410, emissive: color, emissiveIntensity: 0.8, roughness: 0.7, metalness: 0.2 });
  const mats: THREE.MeshStandardMaterial[] = [];
  const m1 = mk(); mats.push(m1); shellOn(ctx, 'torso', new THREE.BoxGeometry(0.46, 0.58, 0.28), m1, [0, 0, 0]);
  for (const arm of ['armL', 'armR']) { const m = mk(); mats.push(m); shellOn(ctx, arm, new THREE.BoxGeometry(0.16, 0.44, 0.18), m, [0, -0.18, 0]); }
  const emb = sparkCloud(add, 16, 0.5, 0xffb04a, 0.045, ctx.rig.getObjectByName('torso') ?? add(new THREE.Group()));
  emb.pts.position.set(0, 0.0, 0.1);
  return (t, dt) => {
    mats.forEach((m, i) => m.emissiveIntensity = 0.6 + Math.sin(t * (spec.speed ?? 1) * 2.4 + i) * 0.4);
    const a = emb.pos;
    for (let i = 0; i < emb.seed.length; i++) { a[i * 3 + 1] = ((a[i * 3 + 1] + dt * 0.35 + 0.25) % 0.5) - 0.25; }
    emb.geo.attributes.position.needsUpdate = true;
  };
};

const buildNebulaSuit: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const tex = starfieldTex();
  const mk = () => new THREE.MeshStandardMaterial({ map: tex.clone(), color: 0x141026, emissive: spec.color ?? 0x9a6cff, emissiveIntensity: 0.4, roughness: 0.6, metalness: 0.3 });
  const mats: THREE.MeshStandardMaterial[] = [];
  const m1 = mk(); mats.push(m1); shellOn(ctx, 'torso', new THREE.BoxGeometry(0.46, 0.58, 0.28), m1, [0, 0, 0]);
  for (const arm of ['armL', 'armR']) { const m = mk(); mats.push(m); shellOn(ctx, arm, new THREE.BoxGeometry(0.16, 0.45, 0.18), m, [0, -0.18, 0]); }
  for (const leg of ['legL', 'legR']) { const m = mk(); mats.push(m); shellOn(ctx, leg, new THREE.BoxGeometry(0.17, 0.51, 0.18), m, [0, -0.25, 0]); }
  const twinkle = sparkCloud(add, 22, 0.55, 0xffffff, 0.03, ctx.rig.getObjectByName('torso') ?? add(new THREE.Group()));
  twinkle.pts.position.set(0, 0.0, 0.05);
  return (t) => {
    mats.forEach(m => { if (m.map) { m.map.offset.x = (t * 0.02) % 1; } });
    (twinkle.pts.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 5) * 0.4;
  };
};

// =================== full COSTUMES ===================

const buildRobo: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const eye = spec.color ?? 0x6fe0ff;
  const plate = metalM(0xb9c2d2, 0.32);
  const dark = metalM(0x2a3142, 0.45);
  // chest + abdomen plates
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.47, 0.6, 0.29), dark, [0, 0, 0]);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.36, 0.26, 0.31), plate, [0, 0.16, 0]);
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  const core = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), emis(eye, 2)), torso); core.position.set(0, 0.08, 0.17);
  add(softGlow(eye, 0.4, 0.7), torso).position.set(0, 0.08, 0.2);
  // shoulder pauldrons
  for (const arm of ['armL', 'armR']) {
    shellOn(ctx, arm, new THREE.BoxGeometry(0.2, 0.14, 0.2), plate, [0, 0.04, 0]);
    shellOn(ctx, arm, new THREE.BoxGeometry(0.16, 0.34, 0.17), dark, [0, -0.2, 0]);
  }
  for (const leg of ['legL', 'legR']) shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.5, 0.18), dark, [0, -0.25, 0]);
  // helmet on the head
  const helm = shellOn(ctx, 'head', new THREE.BoxGeometry(0.4, 0.34, 0.36), plate, [0, 0.17, 0]);
  const visor = shellOn(ctx, 'head', new THREE.BoxGeometry(0.34, 0.08, 0.02), emis(eye, 1.6), [0, 0.16, 0.18]);
  shellOn(ctx, 'head', new THREE.BoxGeometry(0.05, 0.18, 0.05), plate, [0.16, 0.42, 0]); // antenna base
  const antTip = shellOn(ctx, 'head', new THREE.SphereGeometry(0.035, 8, 6), emis(eye, 1.8), [0.16, 0.53, 0]);
  return (t) => {
    const p = 1.4 + Math.sin(t * (spec.speed ?? 1) * 3) * 0.6;
    (core.material as THREE.MeshStandardMaterial).emissiveIntensity = p + 0.6;
    if (visor) (visor.material as THREE.MeshStandardMaterial).emissiveIntensity = p;
    if (antTip) (antTip.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.abs(Math.sin(t * 6)) * 1.4;
    if (helm) helm.rotation.z = Math.sin(t * 0.6) * 0.01;
  };
};

const buildMecha: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const accent = spec.color ?? 0xff8a1a;
  const hullMat = metalM(0x3a4252, 0.4);
  const trim = emis(accent, 1.2);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.52, 0.62, 0.34), hullMat, [0, 0.02, 0]);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.4, 0.04, 0.36), trim, [0, 0.28, 0]);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.4, 0.04, 0.36), trim, [0, -0.24, 0]);
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  // chest screen — clone so this instance scrolls its own copy (not the shared cache)
  const screenTex = screenFaceTex(hx(accent)).clone();
  const screen = add(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true })), torso);
  screen.position.set(0, 0.06, 0.18);
  // big shoulder blocks + back thruster vents
  for (const arm of ['armL', 'armR']) {
    shellOn(ctx, arm, new THREE.BoxGeometry(0.26, 0.2, 0.26), hullMat, [0, 0.06, 0]);
    shellOn(ctx, arm, new THREE.BoxGeometry(0.04, 0.12, 0.18), trim, [0, 0.06, -0.08]);
    shellOn(ctx, arm, new THREE.BoxGeometry(0.18, 0.36, 0.19), hullMat, [0, -0.22, 0]);
  }
  for (const leg of ['legL', 'legR']) shellOn(ctx, leg, new THREE.BoxGeometry(0.22, 0.52, 0.22), hullMat, [0, -0.25, 0]);
  // head crest
  shellOn(ctx, 'head', new THREE.BoxGeometry(0.42, 0.36, 0.38), hullMat, [0, 0.17, 0]);
  const v = shellOn(ctx, 'head', new THREE.BoxGeometry(0.3, 0.06, 0.02), trim, [0, 0.14, 0.2]);
  shellOn(ctx, 'head', new THREE.BoxGeometry(0.06, 0.2, 0.06), trim, [0, 0.45, 0]);
  return (t) => {
    if (screenTex) screenTex.offset.x = (t * 0.3) % 1;
    if (v) (v.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * (spec.speed ?? 1) * 4) * 0.6;
  };
};

const buildStarPaladin: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const gold = 0xf2c14e;
  const color = spec.color ?? 0x9ad8ff;
  const plate = metalM(0xe8d28a, 0.25);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.48, 0.6, 0.3), plate, [0, 0, 0]);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.2, 0.2, 0.32), emis(gold, 0.8), [0, 0.18, 0]); // breastplate emblem
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  const star = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), emis(color, 1.6)), torso); star.position.set(0, 0.18, 0.18);
  for (const arm of ['armL', 'armR']) shellOn(ctx, arm, new THREE.BoxGeometry(0.2, 0.16, 0.2), plate, [0, 0.04, 0]);
  // star cape on the back
  const cape = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7, 6, 8), new THREE.MeshStandardMaterial({ map: starfieldTex(), color: 0x10142e, emissive: color, emissiveIntensity: 0.4, side: THREE.DoubleSide })), torso);
  cape.position.set(0, 0.05, -0.18);
  // orbiting shards above the shoulders
  const shards: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) { const s = add(new THREE.Mesh(new THREE.TetrahedronGeometry(0.04), emis(color, 1.5)), torso); s.userData.a = (i / 4) * Math.PI * 2; shards.push(s); }
  // helm crest
  shellOn(ctx, 'head', new THREE.BoxGeometry(0.4, 0.2, 0.36), plate, [0, 0.26, 0]);
  shellOn(ctx, 'head', new THREE.ConeGeometry(0.03, 0.16, 4), emis(gold, 1), [0, 0.5, 0]);
  const capeGeo = cape.geometry as THREE.PlaneGeometry;
  return (t) => {
    star.rotation.y = t * 1.5;
    shards.forEach((s, i) => { const a = s.userData.a + t * (spec.speed ?? 1); s.position.set(Math.cos(a) * 0.34, 0.42 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.2); s.rotation.x = t * 2; });
    const pos = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); pos.setZ(v, Math.sin(y * 5 + t * 2) * 0.04 * (0.5 - y)); }
    pos.needsUpdate = true;
    capeGeo.computeVertexNormals(); // keep lit shading correct as the cape waves
  };
};

const buildGridrunner: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x00e5ff;
  // sleek dark suit + glowing grid edges
  const base = new THREE.MeshStandardMaterial({ color: 0x05070e, metalness: 0.6, roughness: 0.4 });
  const edges: THREE.MeshStandardMaterial[] = [];
  const addPart = (part: string, body: [number, number, number, number, number, number]) => {
    shellOn(ctx, part, new THREE.BoxGeometry(body[0], body[1], body[2]), base, [body[3], body[4], body[5]]);
  };
  addPart('torso', [0.45, 0.58, 0.27, 0, 0, 0]);
  for (const arm of ['armL', 'armR']) addPart(arm, [0.155, 0.44, 0.175, 0, -0.18, 0]);
  for (const leg of ['legL', 'legR']) addPart(leg, [0.17, 0.5, 0.18, 0, -0.25, 0]);
  const addEdge = (part: string, geo: THREE.BufferGeometry, pos: [number, number, number]) => { const m = emis(color, 1.6); edges.push(m); shellOn(ctx, part, geo, m, pos); };
  // torso grid
  for (const sx of [-0.225, 0.225]) addEdge('torso', new THREE.BoxGeometry(0.02, 0.58, 0.02), [sx, 0, 0.135]);
  for (const sy of [-0.28, 0, 0.28]) addEdge('torso', new THREE.BoxGeometry(0.45, 0.02, 0.02), [0, sy, 0.135]);
  for (const arm of ['armL', 'armR']) addEdge(arm, new THREE.BoxGeometry(0.02, 0.44, 0.02), [0.08, -0.18, 0.09]);
  for (const leg of ['legL', 'legR']) addEdge(leg, new THREE.BoxGeometry(0.02, 0.5, 0.02), [0.085, -0.25, 0.095]);
  shellOn(ctx, 'head', new THREE.BoxGeometry(0.38, 0.32, 0.34), base, [0, 0.17, 0]);
  const visor = shellOn(ctx, 'head', new THREE.BoxGeometry(0.34, 0.1, 0.02), emis(color, 1.6), [0, 0.16, 0.18]);
  return (t) => {
    const pulse = 1.2 + Math.sin(t * (spec.speed ?? 1) * 4) * 0.7;
    edges.forEach((m, i) => m.emissiveIntensity = pulse + Math.sin(t * 3 + i * 0.4) * 0.3);
    if (visor) (visor.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
  };
};

const buildPhoenixGarb: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff6a1a;
  const color2 = spec.color2 ?? 0xffd23a;
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.46, 0.58, 0.28), metalM(0x6a1a0a, 0.4), [0, 0, 0]);
  shellOn(ctx, 'torso', new THREE.BoxGeometry(0.2, 0.24, 0.3), emis(color, 1), [0, 0.16, 0]);
  const torso = ctx.rig.getObjectByName('torso') ?? add(new THREE.Group());
  // flame wings on the back
  const wings: { m: THREE.Mesh; sx: number }[] = [];
  for (const sx of [-1, 1]) {
    const wing = add(new THREE.Group(), torso); wing.position.set(sx * 0.18, 0.18, -0.16);
    for (let i = 0; i < 4; i++) {
      const feather = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34 - i * 0.04, 5), glowM(i % 2 ? color2 : color, 0.7)), wing);
      const a = sx * (0.4 + i * 0.32);
      feather.position.set(sx * (0.1 + i * 0.12), 0.05 + i * 0.08, 0);
      feather.rotation.z = -a; feather.rotation.x = -0.3;
      (feather as any).userData.ph = i;
    }
    wings.push({ m: wing as any, sx });
  }
  const aura = sparkCloud(add, 18, 0.45, color2, 0.05, torso); aura.pts.position.set(0, 0.28, 0);
  return (t, dt) => {
    wings.forEach(w => { w.m.rotation.z = Math.sin(t * (spec.speed ?? 1) * 3) * 0.12 * w.sx; w.m.children.forEach((f, i) => { (f as THREE.Mesh).scale.y = 0.85 + Math.sin(t * 8 + i) * 0.2; }); });
    const a = aura.pos;
    for (let i = 0; i < aura.seed.length; i++) a[i * 3 + 1] = ((a[i * 3 + 1] + dt * 0.3 + 0.25) % 0.5) - 0.25;
    aura.geo.attributes.position.needsUpdate = true;
  };
};

// =================== PANTS effects ===================

const buildVoltGreaves: FxBuilder = (ctx) => {
  const { spec } = ctx;
  const color = spec.color ?? 0x5aff9a;
  const trims: THREE.MeshStandardMaterial[] = [];
  for (const leg of ['legL', 'legR']) {
    shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.5, 0.19), metalM(0x232c3c, 0.4), [0, -0.25, 0]);
    const m = emis(color, 1.4); trims.push(m);
    shellOn(ctx, leg, new THREE.BoxGeometry(0.04, 0.46, 0.04), m, [0.085, -0.25, 0.07]);
    const m2 = emis(color, 1.4); trims.push(m2);
    shellOn(ctx, leg, new THREE.BoxGeometry(0.04, 0.46, 0.04), m2, [-0.085, -0.25, 0.07]);
  }
  return (t) => { const p = 1 + Math.sin(t * (spec.speed ?? 1) * 4) * 0.7; trims.forEach((m, i) => m.emissiveIntensity = p + Math.sin(t * 3 + i) * 0.2); };
};

const buildEmberLegs: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff5a1a;
  const clouds: ReturnType<typeof sparkCloud>[] = [];
  for (const leg of ['legL', 'legR']) {
    shellOn(ctx, leg, new THREE.BoxGeometry(0.17, 0.5, 0.18), metalM(0x2a1410, 0.5), [0, -0.25, 0]);
    const part = ctx.rig.getObjectByName(leg) ?? add(new THREE.Group());
    const c = sparkCloud(add, 10, 0.18, color, 0.05, part); c.pts.position.set(0, -0.4, 0);
    clouds.push(c);
  }
  return (t, dt) => {
    clouds.forEach(c => { const a = c.pos; for (let i = 0; i < c.seed.length; i++) a[i * 3 + 1] = ((a[i * 3 + 1] + dt * 0.5 + 0.2) % 0.4) - 0.2; c.geo.attributes.position.needsUpdate = true; });
  };
};

// =================== SHOE / BOOT effects ===================

function bootHosts(ctx: FxCtx): { L: THREE.Object3D; R: THREE.Object3D } {
  const L = ctx.rig.getObjectByName('legL') ?? ctx.host;
  const R = ctx.rig.getObjectByName('legR') ?? ctx.host;
  return { L, R };
}

const buildThruster: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x4fa8ff;
  const color2 = spec.color2 ?? 0xffffff;
  const { L, R } = bootHosts(ctx);
  const flames: THREE.Mesh[] = [];
  for (const [host, sx] of [[L, 0], [R, 0]] as const) {
    shellOn(ctx, host === L ? 'legL' : 'legR', new THREE.BoxGeometry(0.18, 0.16, 0.26), metalM(0x2a3242, 0.4), [0, -0.55, 0.03]);
    const nozzle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.06, 10), metalM(0x8a93a8)), host); nozzle.position.set(0, -0.62, 0);
    const flame = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 10), glowM(color, 0.85)), host); flame.position.set(0, -0.78, 0); flame.rotation.x = Math.PI;
    const inner = add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 8), glowM(color2, 0.9)), host); inner.position.set(0, -0.74, 0); inner.rotation.x = Math.PI;
    const ring = add(softGlow(color, 0.35, 0.6), host); ring.position.set(0, -0.62, 0);
    flames.push(flame, inner);
  }
  return (t) => {
    flames.forEach((f, i) => { const k = 0.8 + Math.sin(t * 18 + i * 1.7) * 0.3; f.scale.set(1, k, 1); (f.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 22 + i) * 0.25; });
  };
};

const buildGlowSole: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x5aff9a;
  const discs: THREE.Mesh[] = [];
  for (const leg of ['legL', 'legR']) {
    shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.06, 0.26), emis(color, 1.4), [0, -0.56, 0.03]);
    const part = ctx.rig.getObjectByName(leg) ?? add(new THREE.Group());
    const disc = add(new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), glowM(color, 0.4)), part);
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, -0.61, 0.03);
    discs.push(disc);
  }
  return (t) => { discs.forEach((d, i) => { (d.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.abs(Math.sin(t * (spec.speed ?? 1) * 3 + i * 1.5)) * 0.3; const s = 1 + Math.sin(t * 3 + i) * 0.15; d.scale.set(s, s, 1); }); };
};

const buildHoverDisc: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x6fe0ff;
  const discs: THREE.Group[] = [];
  for (const leg of ['legL', 'legR']) {
    const part = ctx.rig.getObjectByName(leg) ?? add(new THREE.Group());
    shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.1, 0.24), metalM(0x2a3242, 0.4), [0, -0.54, 0.02]);
    const g = add(new THREE.Group(), part); g.position.set(0, -0.66, 0.02);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 24), emis(color, 1.4)), g).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), glowM(color, 0.5)), g).rotation.x = -Math.PI / 2;
    discs.push(g);
  }
  return (t) => { discs.forEach((d, i) => { d.rotation.y = t * (spec.speed ?? 1) * 4 * (i ? -1 : 1); d.position.y = -0.66 + Math.sin(t * 3 + i) * 0.02; }); };
};

const buildCryoStep: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xa8e8ff;
  const mists: ReturnType<typeof sparkCloud>[] = [];
  for (const leg of ['legL', 'legR']) {
    shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: 0xdff2ff, metalness: 0.3, roughness: 0.15, emissive: color, emissiveIntensity: 0.4 }), [0, -0.55, 0.03]);
    for (let i = 0; i < 3; i++) { const sh = shellOn(ctx, leg, new THREE.ConeGeometry(0.03, 0.1, 5), glowM(color, 0.7), [(i - 1) * 0.06, -0.5, 0.12]); if (sh) sh.rotation.x = -0.3; }
    const part = ctx.rig.getObjectByName(leg) ?? add(new THREE.Group());
    const m = sparkCloud(add, 8, 0.2, color, 0.06, part); m.pts.position.set(0, -0.58, 0.05); mists.push(m);
  }
  return (t, dt) => { mists.forEach(c => { const a = c.pos; for (let i = 0; i < c.seed.length; i++) { a[i * 3 + 1] = ((a[i * 3 + 1] + dt * 0.12 + 0.15) % 0.3) - 0.15; } c.geo.attributes.position.needsUpdate = true; (c.pts.material as THREE.PointsMaterial).opacity = 0.4 + Math.sin(t * 2) * 0.2; }); };
};

const buildSparkHeel: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xffd23a;
  const bolts: THREE.Mesh[] = [];
  for (const leg of ['legL', 'legR']) {
    shellOn(ctx, leg, new THREE.BoxGeometry(0.18, 0.14, 0.26), metalM(0x1a1d28, 0.4), [0, -0.55, 0.03]);
    const part = ctx.rig.getObjectByName(leg) ?? add(new THREE.Group());
    const b = add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), glowM(color, 0)), part); b.position.set(0, -0.58, -0.12); b.rotation.x = 0.6;
    bolts.push(b);
  }
  return (t) => { bolts.forEach((b, i) => { const f = Math.max(0, Math.sin(t * (spec.speed ?? 1) * 14 + i * 2.1)); (b.material as THREE.MeshBasicMaterial).opacity = f * f; }); };
};

// =================== BACKPACK effects ===================

const buildEnergyWings: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x6fe0ff;
  const color2 = spec.color2 ?? 0xb15aff;
  const pelvis = ctx.host; // backpack host parented to pelvis
  const wings: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const w = add(new THREE.Group(), pelvis); w.position.set(sx * 0.12, 0.34, -0.18);
    for (let i = 0; i < 4; i++) {
      const feather = add(new THREE.Mesh(new THREE.PlaneGeometry(0.34 - i * 0.03, 0.07, 4, 1), glowM(i % 2 ? color2 : color, 0.55)), w);
      const a = sx * (0.2 + i * 0.28);
      feather.position.set(sx * (0.16 + i * 0.04), 0.16 - i * 0.1, 0);
      feather.rotation.z = a; feather.rotation.y = sx * 0.3;
    }
    wings.push(w);
  }
  return (t) => { wings.forEach((w, k) => { const sx = k ? 1 : -1; w.rotation.z = Math.sin(t * (spec.speed ?? 1) * 2.5) * 0.18 * sx; w.children.forEach((f, i) => (f as THREE.Mesh).position.z = Math.sin(t * 3 + i) * 0.02); }); };
};

const buildFusionPack: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x5aff9a;
  const pelvis = ctx.host;
  const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.16), metalM(0x2a3242, 0.4)), pelvis); body.position.set(0, 0.32, -0.24);
  const core = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 14), emis(color, 1.6)), pelvis); core.position.set(0, 0.32, -0.26);
  add(softGlow(color, 0.45, 0.6), pelvis).position.set(0, 0.32, -0.32);
  const vents: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) { const v = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), emis(color, 1.2)), pelvis); v.position.set(sx * 0.13, 0.32, -0.3); vents.push(v); }
  return (t) => { const p = 1.2 + Math.sin(t * (spec.speed ?? 1) * 4) * 0.6; (core.material as THREE.MeshStandardMaterial).emissiveIntensity = p; core.rotation.y = t; vents.forEach((v, i) => (v.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(t * 6 + i * 3) * 0.5); };
};

const buildJetpack: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff8a1a;
  const pelvis = ctx.host;
  const tanks: THREE.Mesh[] = [];
  const flames: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const tank = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 12), metalM(0xc23a2a, 0.35)), pelvis);
    tank.position.set(sx * 0.14, 0.34, -0.24); tanks.push(tank);
    const noz = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.06, 8), metalM(0x8a93a8)), pelvis); noz.position.set(sx * 0.14, 0.12, -0.24);
    const flame = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), glowM(color, 0.8)), pelvis); flame.position.set(sx * 0.14, 0.0, -0.24); flame.rotation.x = Math.PI;
    flames.push(flame);
  }
  return (t) => { flames.forEach((f, i) => { const k = 0.7 + Math.abs(Math.sin(t * 16 + i * 2)) * 0.5; f.scale.set(1, k, 1); (f.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 20 + i) * 0.25; }); };
};

const buildOrbCompanion: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x6fe0ff;
  const pelvis = ctx.host;
  const orb = add(new THREE.Group(), pelvis); orb.position.set(0, 0.5, -0.3);
  const body = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), emis(color, 1.4)), orb);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), emis(0xffffff, 1)), orb).rotation.x = Math.PI / 2;
  add(softGlow(color, 0.35, 0.7), orb);
  const trail = sparkCloud(add, 10, 0.05, color, 0.04, pelvis); trail.pts.position.copy(orb.position);
  return (t) => {
    const a = t * (spec.speed ?? 1) * 1.2;
    orb.position.set(Math.cos(a) * 0.22, 0.5 + Math.sin(a * 1.5) * 0.08, -0.3 + Math.sin(a) * 0.06);
    body.rotation.y = t * 2;
    trail.pts.position.lerp(orb.position, 0.1);
  };
};

const buildCometCape: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x4fa8ff;
  const pelvis = ctx.host;
  const cape = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a1430, emissive: color, emissiveIntensity: 0.5, side: THREE.DoubleSide, metalness: 0.3, roughness: 0.4 })), pelvis);
  cape.position.set(0, 0.18, -0.2);
  const stars = sparkCloud(add, 16, 0.4, 0xffffff, 0.03, pelvis); stars.pts.position.set(0, 0.1, -0.25);
  const geo = cape.geometry as THREE.PlaneGeometry;
  return (t) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) { const x = pos.getX(v), y = pos.getY(v); pos.setZ(v, Math.sin(x * 5 + t * (spec.speed ?? 1) * 3) * 0.05 * (0.5 - y)); }
    pos.needsUpdate = true;
    geo.computeVertexNormals(); // keep lit shading correct as the cape ripples
    (cape.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(t * 2) * 0.2;
  };
};

// =================== GLOVE effects ===================

function handHosts(ctx: FxCtx): THREE.Object3D[] {
  return ['armL', 'armR'].map(n => ctx.rig.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
}

const buildPlasmaGauntlet: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff5aa8;
  const palms: THREE.Sprite[] = [];
  for (const arm of ['armL', 'armR']) {
    shellOn(ctx, arm, new THREE.BoxGeometry(0.16, 0.16, 0.17), metalM(0x2a3242, 0.4), [0, -0.43, 0]);
    const part = ctx.rig.getObjectByName(arm) ?? add(new THREE.Group());
    const p = add(softGlow(color, 0.26, 0.8), part); p.position.set(0, -0.46, 0.08); palms.push(p);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 6, 18), emis(color, 1.4)), part).position.set(0, -0.36, 0);
  }
  return (t) => palms.forEach((p, i) => { p.material.opacity = 0.5 + Math.sin(t * (spec.speed ?? 1) * 5 + i * 2) * 0.4; const s = 0.24 + Math.sin(t * 4 + i) * 0.05; p.scale.set(s, s, 1); });
};

const buildIonClaw: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0x5aff9a;
  const claws: THREE.Mesh[] = [];
  for (const arm of ['armL', 'armR']) {
    const part = ctx.rig.getObjectByName(arm) ?? add(new THREE.Group());
    shellOn(ctx, arm, new THREE.BoxGeometry(0.15, 0.14, 0.16), metalM(0x1a1d28, 0.4), [0, -0.43, 0]);
    for (let i = 0; i < 3; i++) { const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.18, 4), glowM(color, 0.85)), part); c.position.set((i - 1) * 0.05, -0.56, 0.06); c.rotation.x = -0.2; claws.push(c); }
  }
  return (t) => claws.forEach((c, i) => { (c.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * (spec.speed ?? 1) * 6 + i) * 0.35; });
};

const buildPowercellFist: FxBuilder = (ctx) => {
  const { add, spec } = ctx;
  const color = spec.color ?? 0xff8a1a;
  const cells: THREE.Mesh[] = [];
  for (const arm of ['armL', 'armR']) {
    shellOn(ctx, arm, new THREE.BoxGeometry(0.22, 0.2, 0.22), metalM(0x3a4252, 0.4), [0, -0.45, 0]);
    const part = ctx.rig.getObjectByName(arm) ?? add(new THREE.Group());
    for (const sy of [-0.42, -0.48]) { const k = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.18), emis(color, 1.4)), part); k.position.set(0, sy, 0.02); cells.push(k); }
  }
  return (t) => { const p = 1 + Math.sin(t * (spec.speed ?? 1) * 5) * 0.7; cells.forEach((c, i) => (c.material as THREE.MeshStandardMaterial).emissiveIntensity = p + Math.sin(t * 7 + i) * 0.3); };
};

// =================== effect textures ===================

const _texCache = new Map<string, THREE.Texture>();
function cachedTex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = _texCache.get(key); if (!t) { t = make(); _texCache.set(key, t); } return t;
}
function circuitFlowTex(glow: string): THREE.Texture {
  return cachedTex('circuit' + glow, () => canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#0a141f'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    const r = mulberry(7);
    for (let i = 0; i < 6; i++) { const x = (i + 0.5) * s / 6; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); for (let j = 0; j < 3; j++) { const y = r() * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() > 0.5 ? 1 : -1) * s / 6, y); ctx.stroke(); } }
    ctx.globalAlpha = 1;
  }, 1));
}
function crackTex(glow: string): THREE.Texture {
  return cachedTex('crack' + glow, () => canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#1a0d0a'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = glow; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const r = mulberry(13);
    for (let i = 0; i < 14; i++) { let x = r() * s, y = r() * s; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
  }, 1));
}
function starfieldTex(): THREE.Texture {
  return cachedTex('starfield', () => canvasTex(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 5, s / 2, s / 2, s * 0.7); g.addColorStop(0, '#241046'); g.addColorStop(1, '#06040f'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const r = mulberry(31); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) { const x = r() * s, y = r() * s, sz = r() * 2; ctx.globalAlpha = 0.4 + r() * 0.6; ctx.fillRect(x, y, sz, sz); }
    ctx.globalAlpha = 1;
  }, 1));
}
function screenFaceTex(glow: string): THREE.Texture {
  return cachedTex('screen' + glow, () => { const t = canvasTex(64, (ctx, s) => { ctx.fillStyle = '#04100a'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = glow; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.fillText('>_<', s / 2, s / 2 + 8); for (let y = 0; y < s; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, s, 1); } }, 1); t.wrapS = THREE.RepeatWrapping; return t; });
}

// =================== registry ===================

const BUILDERS: Record<string, FxBuilder> = {
  heli: buildHeli, propeller: buildPropeller, flame: buildFlame, cosmic_orb: buildCosmicOrb,
  halo: buildHalo, atom: buildAtom, antenna: buildAntenna, plasma_crown: buildPlasmaCrown,
  saturn: buildSaturn, stormcloud: buildStormcloud, sparkler: buildSparkler, prism: buildPrism,
  chrome: buildChrome, flash_suit: buildFlashSuit, arc_reactor: buildArcReactor, circuit_jersey: buildCircuitJersey,
  holo_shimmer: buildHoloShimmer, aurora_mantle: buildAuroraMantle, magma_plate: buildMagmaPlate, nebula_suit: buildNebulaSuit,
  robo: buildRobo, mecha: buildMecha, star_paladin: buildStarPaladin, gridrunner: buildGridrunner, phoenix: buildPhoenixGarb,
  volt_greaves: buildVoltGreaves, ember_legs: buildEmberLegs,
  thruster: buildThruster, glow_sole: buildGlowSole, hover_disc: buildHoverDisc, cryo_step: buildCryoStep, spark_heel: buildSparkHeel,
  energy_wings: buildEnergyWings, fusion_pack: buildFusionPack, jetpack: buildJetpack, orb_companion: buildOrbCompanion, comet_cape: buildCometCape,
  plasma_gauntlet: buildPlasmaGauntlet, ion_claw: buildIonClaw, powercell_fist: buildPowercellFist,
};

/** True if a kind is renderable — used to validate the catalog at boot. */
export function hasFxBuilder(kind: string): boolean { return kind in BUILDERS; }

export interface FxAttachResult { updaters: FxUpdater[]; dispose: () => void; }

/** Attach all equipped prestige effects to the rig. Returns updaters + a disposer. */
export function attachCosmeticFx(rig: THREE.Group, items: Array<{ slot: FxSlot; spec: FxSpec }>): FxAttachResult {
  const updaters: FxUpdater[] = [];
  const tracked: THREE.Object3D[] = [];
  const head = rig.getObjectByName('head');
  const pelvis = rig.getObjectByName('pelvis') ?? rig;

  for (const { slot, spec } of items) {
    const builder = BUILDERS[spec.kind];
    if (!builder) continue;
    const anchor = slot === 'hat' ? (head ?? pelvis) : pelvis;
    const host = new THREE.Group();
    anchor.add(host);
    tracked.push(host);
    const add = <T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = host): T => { parent.add(obj); tracked.push(obj); return obj; };
    const rng = mulberry((spec.kind.length * 131 + (spec.color ?? 0)) | 0);
    try {
      updaters.push(builder({ host, rig, spec, rng, add }));
    } catch (e) {
      console.warn('[cosmetics] fx build failed for', spec.kind, e);
    }
  }

  const dispose = () => {
    for (const o of tracked) {
      o.traverse(c => {
        const mesh = c as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
      });
      o.parent?.remove(o);
    }
  };

  return { updaters, dispose };
}
