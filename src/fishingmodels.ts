// ============================================================
// AZ Tamer — Fishing Expansion: procedural 3D art.
//   • 16 distinct fish silhouettes (one per body family/shape)
//   • underwater shadow silhouettes with rarity "tells"
//   • fishing rods, bobbers/baits
//   • an advanced stylized water shader (fresnel sky-reflection,
//     sun/moon glint, animated sparkle, shoreline foam, waves)
//   • splash & ripple particle systems
// by Aljay Leodones
// ============================================================
import * as THREE from 'three';
import { tween, Ease } from './models';
import { RARITY, type SpeciesDef, type FishBody, type RodDef, type BaitDef, type ShadowSize, SHADOW_SCALE } from './fishingdata';

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...opts });

// ============================================================
//  FISH MODELS
// ============================================================
/**
 * Build a fully-modeled fish, nose pointing +X, tail at -X, ~1.6 units long.
 * Named children drive the swim animation: 'tail', 'finL', 'finR', 'spine'.
 * The whole group's userData.swim(t) wags everything.
 */
export function makeFish(sp: SpeciesDef): THREE.Group {
  const g = new THREE.Group();
  const c = sp.colors;
  const glow = c.glow !== undefined;
  const bodyMat = mat(c.body, { roughness: 0.4, metalness: 0.25, emissive: glow ? c.glow! : 0x000000, emissiveIntensity: glow ? 0.35 : 0 });
  const bellyMat = mat(c.belly, { roughness: 0.5 });
  const finMat = mat(c.fin, { roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: glow ? c.glow! : 0x000000, emissiveIntensity: glow ? 0.25 : 0 });
  const accMat = mat(c.accent, { roughness: 0.35, metalness: 0.3, emissive: glow ? c.glow! : 0x000000, emissiveIntensity: glow ? 0.4 : 0 });

  const eye = () => {
    const e = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0xf4f4ff, { roughness: 0.2 }));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x101018, { roughness: 0.1 }));
    pupil.position.set(0.04, 0, 0);
    e.add(white, pupil);
    return e;
  };
  const finBlade = (w: number, h: number, m = finMat) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(w * 0.5, h * 0.7, w, h * 0.2);
    shape.quadraticCurveTo(w * 0.6, 0, 0, 0);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
  };

  const spine = new THREE.Group();
  spine.name = 'spine';
  g.add(spine);

  const addEyes = (x: number, y: number, z: number) => {
    const eL = eye(), eR = eye();
    eL.position.set(x, y, z); eR.position.set(x, y, -z);
    g.add(eL, eR);
  };

  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  g.add(tailGroup);

  switch (sp.body) {
    case 'minnow': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat);
      body.scale.set(2.0, 0.7, 0.42);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bellyMat);
      belly.scale.set(1.9, 0.42, 0.4); belly.position.y = -0.08;
      spine.add(body, belly);
      const tail = finBlade(0.5, 0.6); tail.position.set(-0.62, 0, 0); tail.rotation.y = Math.PI / 2; tail.scale.set(1, 1.1, 1);
      tailGroup.add(tail); tailGroup.position.x = -0.62;
      tail.position.set(0, 0, 0);
      addEyes(0.5, 0.08, 0.12);
      break;
    }
    case 'carp': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), bodyMat);
      body.scale.set(1.7, 0.95, 0.62);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bellyMat);
      belly.scale.set(1.55, 0.6, 0.58); belly.position.y = -0.16;
      spine.add(body, belly);
      const dorsal = finBlade(0.5, 0.45); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(0.0, 0.42, 0);
      spine.add(dorsal);
      const fL = finBlade(0.34, 0.3); fL.position.set(0.2, -0.1, 0.34); fL.rotation.set(0.6, 0, -0.4); fL.name = 'finL';
      const fR = finBlade(0.34, 0.3); fR.position.set(0.2, -0.1, -0.34); fR.rotation.set(-0.6, Math.PI, 0.4); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.6, 0.8); tail.rotation.y = Math.PI / 2; tail.position.x = -0.02;
      tailGroup.add(tail); tailGroup.position.x = -0.76;
      // barbels
      for (const z of [0.1, -0.1]) {
        const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.22, 4), accMat);
        wb.position.set(0.74, -0.04, z); wb.rotation.z = Math.PI / 2.4;
        g.add(wb);
      }
      addEyes(0.6, 0.12, 0.22);
      break;
    }
    case 'koi': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), bodyMat);
      body.scale.set(1.8, 0.85, 0.55);
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), accMat);
      patch.scale.set(1.2, 0.86, 0.57); patch.position.set(0.34, 0.05, 0);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), bellyMat);
      belly.scale.set(1.6, 0.5, 0.52); belly.position.y = -0.16;
      spine.add(body, patch, belly);
      const dorsal = finBlade(0.7, 0.5, accMat); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(-0.05, 0.4, 0);
      spine.add(dorsal);
      const fL = finBlade(0.5, 0.42); fL.position.set(0.15, -0.12, 0.32); fL.rotation.set(0.7, 0, -0.5); fL.name = 'finL';
      const fR = finBlade(0.5, 0.42); fR.position.set(0.15, -0.12, -0.32); fR.rotation.set(-0.7, Math.PI, 0.5); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.85, 1.0, accMat); tail.rotation.y = Math.PI / 2;
      const tail2 = finBlade(0.85, 1.0, accMat); tail2.rotation.y = Math.PI / 2; tail2.rotation.x = Math.PI; tail2.position.y = -0.02;
      tailGroup.add(tail, tail2); tailGroup.position.x = -0.78;
      // dragon koi: whiskers + horns + halo
      if (sp.id === 'royal_dragon_koi') {
        for (const z of [0.14, -0.14]) {
          const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.006, 0.6, 5), accMat);
          wk.position.set(0.85, 0.05, z); wk.rotation.z = Math.PI / 2.1; wk.rotation.y = z > 0 ? 0.3 : -0.3;
          g.add(wk);
        }
        for (const z of [0.1, -0.1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 6), mat(c.fin, { emissive: 0xff6a2a, emissiveIntensity: 0.4 }));
          horn.position.set(0.55, 0.4, z); horn.rotation.z = -0.4;
          g.add(horn);
        }
      }
      addEyes(0.62, 0.14, 0.2);
      break;
    }
    case 'trout': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), bodyMat);
      body.scale.set(2.2, 0.72, 0.5);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), bellyMat);
      belly.scale.set(2.0, 0.4, 0.46); belly.position.y = -0.12;
      // speckle stripe
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), accMat);
      stripe.scale.set(2.05, 0.18, 0.48); stripe.position.y = 0.02;
      spine.add(body, belly, stripe);
      const dorsal = finBlade(0.4, 0.36); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(0.0, 0.32, 0);
      spine.add(dorsal);
      const fL = finBlade(0.3, 0.26); fL.position.set(0.3, -0.12, 0.3); fL.rotation.set(0.7, 0, -0.5); fL.name = 'finL';
      const fR = finBlade(0.3, 0.26); fR.position.set(0.3, -0.12, -0.3); fR.rotation.set(-0.7, Math.PI, 0.5); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.55, 0.7); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -0.88;
      addEyes(0.72, 0.1, 0.18);
      break;
    }
    case 'salmon': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), bodyMat);
      body.scale.set(2.4, 0.82, 0.56);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 12), bellyMat);
      belly.scale.set(2.2, 0.5, 0.52); belly.position.y = -0.14;
      spine.add(body, belly);
      // hooked jaw for the emperor
      if (sp.id === 'emperor_salmon') {
        const kype = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), accMat);
        kype.position.set(1.05, -0.05, 0); kype.rotation.z = 1.9;
        spine.add(kype);
      }
      const dorsal = finBlade(0.5, 0.44, accMat); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(-0.1, 0.4, 0);
      spine.add(dorsal);
      const fL = finBlade(0.4, 0.32); fL.position.set(0.3, -0.16, 0.32); fL.rotation.set(0.7, 0, -0.5); fL.name = 'finL';
      const fR = finBlade(0.4, 0.32); fR.position.set(0.3, -0.16, -0.32); fR.rotation.set(-0.7, Math.PI, 0.5); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.7, 0.95, accMat); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -1.0;
      addEyes(0.86, 0.12, 0.2);
      break;
    }
    case 'pike': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.2, 2.4, 14), bodyMat);
      body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.78);
      const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 2.2, 10), bellyMat);
      belly.rotation.z = Math.PI / 2; belly.position.y = -0.14; belly.scale.set(1, 1, 0.7);
      // long toothy snout
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), bodyMat);
      snout.rotation.z = -Math.PI / 2; snout.position.x = 1.45; snout.scale.set(1, 1, 0.7);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), bellyMat);
      jaw.position.set(1.35, -0.12, 0);
      spine.add(body, belly, snout, jaw);
      // teeth
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), mat(0xf0f0e0));
        t.position.set(1.2 + i * 0.05, -0.06, (i % 2 ? 0.08 : -0.08)); t.rotation.x = Math.PI;
        spine.add(t);
      }
      const dorsal = finBlade(0.5, 0.4); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(-0.7, 0.34, 0);
      spine.add(dorsal);
      const fL = finBlade(0.3, 0.24); fL.position.set(0.7, -0.18, 0.28); fL.rotation.set(0.7, 0, -0.5); fL.name = 'finL';
      const fR = finBlade(0.3, 0.24); fR.position.set(0.7, -0.18, -0.28); fR.rotation.set(-0.7, Math.PI, 0.5); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.55, 0.75); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -1.25;
      addEyes(1.0, 0.1, 0.18);
      break;
    }
    case 'moon': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 22, 16), bodyMat);
      body.scale.set(0.95, 1.25, 0.22);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 28), accMat);
      ring.scale.set(0.95, 1.25, 0.4);
      spine.add(body, ring);
      const top = finBlade(0.9, 0.5, finMat); top.rotation.x = -Math.PI / 2; top.position.set(-0.1, 0.78, 0); top.rotation.z = 0.3;
      const bot = finBlade(0.9, 0.5, finMat); bot.rotation.x = Math.PI / 2; bot.position.set(-0.1, -0.78, 0); bot.rotation.z = -0.3;
      spine.add(top, bot);
      const tail = finBlade(0.4, 0.6, finMat); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -0.62;
      addEyes(0.42, 0.16, 0.1);
      break;
    }
    case 'eel': {
      const segMat = bodyMat;
      let prev = 0;
      for (let i = 0; i < 9; i++) {
        const seg = new THREE.Group(); seg.name = i === 0 ? 'spine' : `seg${i}`;
        const r = 0.26 - i * 0.018;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), segMat);
        m.scale.set(1.2, 0.9, 0.9);
        seg.add(m);
        // starfish eel: glowing studs
        if (sp.id === 'starfish_eel' && i % 2 === 0) {
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(c.accent, { emissive: c.glow ?? c.accent, emissiveIntensity: 1.2 }));
          stud.position.set(0, r * 0.7, 0); seg.add(stud);
        }
        seg.position.x = prev; prev -= r * 1.5;
        seg.userData.phase = i * 0.5;
        spine.add(seg);
        g.userData[`eelSeg${i}`] = seg;
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), bodyMat);
      head.scale.set(1.4, 1, 1); head.position.x = 0.28; spine.add(head);
      addEyes(0.46, 0.1, 0.16);
      g.userData.isEel = true;
      break;
    }
    case 'prism': {
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mat(c.body, { flatShading: true, metalness: 0.6, roughness: 0.15, emissive: c.glow ?? 0, emissiveIntensity: 0.5 }));
      body.scale.set(1.7, 1.0, 0.7);
      const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat(c.accent, { flatShading: true, metalness: 0.7, roughness: 0.1, emissive: c.glow ?? c.accent, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }));
      crystal.position.x = 0.1;
      spine.add(body, crystal);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), mat(c.accent, { flatShading: true, emissive: c.glow ?? c.accent, emissiveIntensity: 0.6 }));
      tail.rotation.z = Math.PI / 2; tail.position.x = -0.0;
      tailGroup.add(tail); tailGroup.position.x = -0.7;
      addEyes(0.5, 0.12, 0.16);
      break;
    }
    case 'aurora': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), mat(c.body, { emissive: c.glow ?? c.body, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }));
      body.scale.set(2.2, 0.7, 0.5);
      spine.add(body);
      // flowing ribbon fins
      for (let i = 0; i < 4; i++) {
        const ribbon = finBlade(1.1, 0.3, mat(c.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.6, emissive: c.glow ?? c.accent, emissiveIntensity: 0.8 }));
        ribbon.position.set(-0.2 - i * 0.1, 0.2 - i * 0.12, 0); ribbon.rotation.set(0, Math.PI / 2, 0.2 + i * 0.1);
        ribbon.name = `seg${i}`;
        spine.add(ribbon);
      }
      const tail = finBlade(0.8, 0.9, mat(c.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.7, emissive: c.glow ?? c.accent, emissiveIntensity: 0.9 }));
      tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -0.86;
      addEyes(0.7, 0.1, 0.16);
      break;
    }
    case 'ray': {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.8, 22, 6), bodyMat);
      wing.scale.set(1.1, 0.14, 1.7);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), accMat);
      top.scale.set(1.3, 0.5, 0.7); top.position.set(0.2, 0.08, 0);
      spine.add(wing, top);
      // celestial spots
      if (c.glow !== undefined) {
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.random();
          const spot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), mat(c.accent, { emissive: c.glow, emissiveIntensity: 1.5 }));
          spot.position.set(Math.cos(a) * rr * 0.6 + 0.1, 0.1, Math.sin(a) * rr * 1.3);
          spine.add(spot);
        }
      }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.005, 1.6, 6), accMat);
      tail.rotation.z = Math.PI / 2; tail.position.x = -0.9;
      g.add(tail);
      addEyes(0.5, 0.16, 0.22);
      break;
    }
    case 'fossil': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mat(c.body, { roughness: 0.85, metalness: 0.05, flatShading: true }));
      body.scale.set(2.0, 0.9, 0.7);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), bellyMat);
      belly.scale.set(1.8, 0.5, 0.6); belly.position.y = -0.18;
      spine.add(body, belly);
      // armor plates
      for (let i = 0; i < 4; i++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.6), accMat);
        plate.position.set(0.5 - i * 0.35, 0.32, 0); plate.rotation.x = 0.1;
        spine.add(plate);
      }
      // lobed fins
      const fL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), finMat); fL.scale.set(1.6, 0.4, 0.6); fL.position.set(0.1, -0.2, 0.4); fL.name = 'finL';
      const fR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), finMat); fR.scale.set(1.6, 0.4, 0.6); fR.position.set(0.1, -0.2, -0.4); fR.name = 'finR';
      g.add(fL, fR);
      const tail = finBlade(0.55, 0.85, finMat); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -0.9;
      addEyes(0.66, 0.12, 0.24);
      break;
    }
    case 'catfish': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
      body.scale.set(2.2, 0.85, 0.78);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), bellyMat);
      belly.scale.set(2.0, 0.5, 0.72); belly.position.y = -0.18;
      // broad flat head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), bodyMat);
      head.scale.set(1.1, 0.6, 1.3); head.position.set(0.78, -0.02, 0);
      spine.add(body, belly, head);
      // long whiskers
      for (const [zy, z] of [[0.04, 0.28], [0.04, -0.28], [-0.1, 0.18], [-0.1, -0.18]] as [number, number][]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.004, 0.9, 5), mat(c.accent));
        w.position.set(1.0, zy, z); w.rotation.set(0, 0, Math.PI / 2.3); w.rotation.y = z > 0 ? 0.5 : -0.5;
        spine.add(w);
      }
      const tail = finBlade(0.6, 0.9); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -1.0;
      addEyes(0.95, 0.12, 0.3);
      break;
    }
    case 'leviathan': {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), bodyMat);
      head.scale.set(1.2, 1.1, 1.1); head.position.x = 0.5;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
      body.scale.set(2.0, 0.9, 0.85);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), bellyMat);
      belly.scale.set(1.8, 0.5, 0.78); belly.position.y = -0.16;
      spine.add(head, body, belly);
      // bioluminescent lure
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), accMat);
      stalk.position.set(1.0, 0.6, 0); stalk.rotation.z = -0.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat(c.accent, { emissive: c.glow ?? c.accent, emissiveIntensity: 1.6 }));
      bulb.position.set(1.2, 0.82, 0);
      spine.add(stalk, bulb);
      const dorsal = finBlade(0.8, 0.5, finMat); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(-0.3, 0.46, 0);
      spine.add(dorsal);
      const tail = finBlade(0.8, 1.1, finMat); tail.rotation.y = Math.PI / 2;
      tailGroup.add(tail); tailGroup.position.x = -1.05;
      // teeth
      for (let i = 0; i < 8; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), mat(0xf0f0e0));
        t.position.set(0.9 + (i % 4) * 0.06, -0.18, (i < 4 ? 0.18 : -0.18)); t.rotation.x = Math.PI;
        spine.add(t);
      }
      addEyes(0.86, 0.18, 0.3);
      break;
    }
    case 'serpent': {
      let prev = 0.4;
      for (let i = 0; i < 12; i++) {
        const seg = new THREE.Group();
        const r = 0.32 - i * 0.02;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bodyMat);
        m.scale.set(1.1, 1, 1);
        seg.add(m);
        // dorsal frill
        const frill = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 1.2, 4), accMat);
        frill.position.y = r; seg.add(frill);
        seg.position.x = prev; prev -= r * 1.3;
        spine.add(seg);
        g.userData[`eelSeg${i}`] = seg;
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), bodyMat);
      head.scale.set(1.5, 1.1, 1.1); head.position.x = 0.55; spine.add(head);
      // horns
      for (const z of [0.14, -0.14]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), accMat);
        horn.position.set(0.5, 0.42, z); horn.rotation.z = -0.5;
        spine.add(horn);
      }
      addEyes(0.78, 0.16, 0.22);
      g.userData.isEel = true; g.userData.segCount = 12;
      break;
    }
    case 'dragonfish': {
      let prev = 0.7;
      for (let i = 0; i < 14; i++) {
        const seg = new THREE.Group();
        const r = 0.4 - i * 0.022;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat(c.body, { metalness: 0.4, roughness: 0.3, emissive: c.glow ?? 0, emissiveIntensity: 0.3 }));
        m.scale.set(1.1, 1, 1.05);
        seg.add(m);
        const frill = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 1.5, 4), mat(c.fin, { emissive: c.glow ?? c.fin, emissiveIntensity: 0.6 }));
        frill.position.y = r * 0.9; seg.add(frill);
        // side fins every few segments
        if (i % 3 === 1) {
          const finA = finBlade(0.5, 0.4, mat(c.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.8, emissive: c.glow ?? c.accent, emissiveIntensity: 0.7 }));
          finA.position.set(0, -r * 0.5, r); finA.rotation.set(0.6, 0, -0.4);
          const finB = finA.clone(); finB.position.z = -r; finB.rotation.set(-0.6, Math.PI, 0.4);
          seg.add(finA, finB);
        }
        seg.position.x = prev; prev -= r * 1.25;
        spine.add(seg);
        g.userData[`eelSeg${i}`] = seg;
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 14), mat(c.body, { metalness: 0.5, roughness: 0.2, emissive: c.glow ?? 0, emissiveIntensity: 0.35 }));
      head.scale.set(1.6, 1.15, 1.15); head.position.x = 0.95; spine.add(head);
      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8), mat(c.fin, { emissive: c.glow ?? c.fin, emissiveIntensity: 0.5 }));
      jaw.rotation.z = -Math.PI / 2; jaw.position.set(1.5, -0.05, 0); spine.add(jaw);
      // grand horns + whiskers
      for (const z of [0.16, -0.16]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 6), mat(c.accent, { emissive: c.glow ?? c.accent, emissiveIntensity: 0.9 }));
        horn.position.set(0.85, 0.55, z); horn.rotation.z = -0.6; horn.rotation.y = z > 0 ? 0.3 : -0.3;
        const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.005, 0.9, 5), mat(c.accent, { emissive: c.glow ?? c.accent, emissiveIntensity: 0.7 }));
        wk.position.set(1.5, 0.1, z); wk.rotation.z = Math.PI / 2.2; wk.rotation.y = z > 0 ? 0.4 : -0.4;
        spine.add(horn, wk);
      }
      addEyes(1.3, 0.18, 0.24);
      g.userData.isEel = true; g.userData.segCount = 14;
      break;
    }
  }

  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}

/** Wag a fish built by makeFish. Call every frame with elapsed seconds. */
export function swimFish(fish: THREE.Group, t: number, vigor = 1): void {
  const tail = fish.getObjectByName('tail');
  if (tail) tail.rotation.y = Math.sin(t * 6) * 0.5 * vigor;
  const fL = fish.getObjectByName('finL'), fR = fish.getObjectByName('finR');
  if (fL) fL.rotation.z = -0.4 + Math.sin(t * 5) * 0.3 * vigor;
  if (fR) fR.rotation.z = 0.4 - Math.sin(t * 5) * 0.3 * vigor;
  // serpentine bodies
  if (fish.userData.isEel) {
    const n = fish.userData.segCount ?? 9;
    for (let i = 0; i < n; i++) {
      const seg = fish.userData[`eelSeg${i}`] as THREE.Object3D | undefined;
      if (seg) seg.position.y = Math.sin(t * 4 - i * 0.6) * 0.12 * vigor;
    }
  }
}

// ============================================================
//  UNDERWATER SHADOW SILHOUETTES
// ============================================================
/**
 * A dark, flattened silhouette that drifts beneath the surface. Different
 * body shapes read differently from above; rare+ fish carry subtle "tells":
 * a colored under-glow, and Legendaries a distinct golden halo.
 */
export function makeFishShadow(sp: SpeciesDef): THREE.Group {
  const g = new THREE.Group();
  const scale = SHADOW_SCALE[sp.shadow];
  const rk = RARITY[sp.rarity];
  const rare = ['Rare', 'Elite', 'Mythical', 'Legendary'].includes(sp.rarity);

  // base silhouette — a stretched dark blob shaped by body type
  const long = ['pike', 'eel', 'serpent', 'dragonfish', 'catfish', 'leviathan', 'salmon', 'trout'].includes(sp.body);
  const wide = sp.body === 'ray' || sp.body === 'moon';
  const lenX = (long ? 1.9 : wide ? 1.0 : 1.4) * scale;
  const lenZ = (wide ? 1.6 : 0.5) * scale;

  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x081018, transparent: true, opacity: 0.42, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 22), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(lenX, lenZ, 1);
  g.add(blob);
  // a tail hint
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.28, 3), shadowMat);
  tail.rotation.x = -Math.PI / 2; tail.position.x = -lenX * 0.55; tail.scale.set(scale, lenZ * 1.4, 1);
  g.add(tail);

  if (rare) {
    const glowColor = sp.rarity === 'Legendary' ? 0xffd25a : (sp.colors.glow ?? sp.colors.accent);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 24),
      new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: sp.rarity === 'Legendary' ? 0.3 : 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.02; glow.scale.set(lenX * 1.3, lenZ * 1.6, 1);
    glow.name = 'rareGlow';
    g.add(glow);
  }
  g.userData.rarity = sp.rarity;
  g.userData.color = rk.color;
  return g;
}

// ============================================================
//  RODS & BAIT
// ============================================================
/** A fishing rod, built lying along +Y (butt at origin, tip up). */
export function makeRod(rod: RodDef): THREE.Group {
  const g = new THREE.Group();
  const shaftMat = mat(rod.color, { roughness: 0.4, metalness: 0.5, emissive: rod.glow ?? 0x000000, emissiveIntensity: rod.glow ? 0.4 : 0 });
  const len = 1.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, len, 8), shaftMat);
  shaft.position.y = len / 2;
  g.add(shaft);
  // handle grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8), mat(0x2a1e12, { roughness: 0.9 }));
  grip.position.y = 0.12; g.add(grip);
  // reel
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), mat(0x3a3a4a, { metalness: 0.7, roughness: 0.3 }));
  reel.rotation.x = Math.PI / 2; reel.position.set(0.06, 0.3, 0); g.add(reel);
  // guides
  for (let i = 1; i <= 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 10), mat(0x9aa6b0, { metalness: 0.8 }));
    ring.position.set(0.02, 0.4 + i * 0.26, 0); ring.rotation.y = Math.PI / 2;
    g.add(ring);
  }
  // tip marker (where the line attaches)
  const tip = new THREE.Object3D(); tip.name = 'rodTip'; tip.position.set(0.02, len, 0);
  g.add(tip);

  // per-rod FX flourish
  if (rod.fx === 'storm') {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), mat(rod.glow ?? 0xffe14a, { emissive: rod.glow ?? 0xffe14a, emissiveIntensity: 1.2 }));
    coil.position.set(0, 0.55, 0); coil.rotation.x = Math.PI / 2; g.add(coil);
  } else if (rod.fx === 'dragon') {
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), mat(0xe8541e, { emissive: 0xff6a2a, emissiveIntensity: 1.0 }));
    head.position.y = 0.42; g.add(head);
  } else if (rod.fx === 'neon') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), mat(rod.glow ?? 0x5affd8, { emissive: rod.glow ?? 0x5affd8, emissiveIntensity: 1.4 }));
    band.position.y = 0.7; band.name = 'neonBand'; g.add(band);
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A bobber/float coloured by the equipped bait. */
export function makeBobber(bait: BaitDef): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat(0xe8443a, { roughness: 0.5 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat(0xf4f4f4, { roughness: 0.5 }));
  top.scale.y = 0.9; bot.scale.y = 0.9; top.position.y = 0.06; bot.position.y = -0.06;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 6), mat(0xe8443a));
  tip.position.y = 0.2;
  g.add(top, bot, tip);
  if (bait.glow !== undefined) {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshBasicMaterial({ color: bait.glow, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(halo);
  }
  return g;
}

// ============================================================
//  ADVANCED WATER
// ============================================================
export interface WaterHandle {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update(time: number, sunDir: THREE.Vector3, sunColor: THREE.Color, skyTop: THREE.Color, skyBottom: THREE.Color, daylight: number): void;
}

const WATER_VERT = /* glsl */`
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vWave;
  float wave(vec2 p){
    return sin(p.x*0.6 + uTime*1.1)*0.5
         + sin(p.y*0.8 - uTime*0.9)*0.4
         + sin((p.x+p.y)*0.45 + uTime*1.6)*0.3;
  }
  void main(){
    vUv = uv;
    vec3 pos = position;
    vec4 wp = modelMatrix * vec4(position,1.0);
    float w = wave(wp.xz);
    vWave = w;
    pos.y += w * uWaveAmp;
    vWorld = (modelMatrix * vec4(pos,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
  }
`;

const WATER_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uDaylight;
  uniform float uOpacity;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uFoam;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vWave;

  // cheap hash noise for sparkle
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }

  void main(){
    // analytic normal from the same wave field used in the vertex shader
    vec2 p = vWorld.xz;
    float e = 0.35;
    float h  = sin(p.x*0.6+uTime*1.1)*0.5 + sin(p.y*0.8-uTime*0.9)*0.4 + sin((p.x+p.y)*0.45+uTime*1.6)*0.3;
    float hx = sin((p.x+e)*0.6+uTime*1.1)*0.5 + sin(p.y*0.8-uTime*0.9)*0.4 + sin(((p.x+e)+p.y)*0.45+uTime*1.6)*0.3;
    float hz = sin(p.x*0.6+uTime*1.1)*0.5 + sin((p.y+e)*0.8-uTime*0.9)*0.4 + sin((p.x+(p.y+e))*0.45+uTime*1.6)*0.3;
    vec3 n = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    fres = clamp(fres + 0.02, 0.0, 1.0);

    // reflected sky tint by view angle
    vec3 sky = mix(uSkyBottom, uSkyTop, clamp(viewDir.y*0.5+0.5, 0.0, 1.0));
    vec3 waterCol = mix(uDeep, uShallow, clamp(h*0.5+0.5, 0.0, 1.0));
    vec3 col = mix(waterCol, sky, fres*0.85);

    // sun / moon glint — sharp specular
    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 220.0);
    col += uSunColor * spec * (0.6 + uDaylight);

    // drifting sparkle
    float sp = noise(p*3.0 + uTime*0.6) * noise(p*5.0 - uTime*0.4);
    sp = smoothstep(0.78, 1.0, sp);
    col += uSunColor * sp * (0.25 + uDaylight*0.5);

    // shoreline foam ring
    float dist = distance(vWorld.xz, uCenter);
    float shore = smoothstep(uRadius-1.6, uRadius-0.1, dist) * uFoam;
    float foamN = noise(p*4.0 + uTime*1.5);
    col = mix(col, vec3(0.92,0.96,1.0), clamp(shore*foamN,0.0,0.9));

    float alpha = mix(uOpacity, 1.0, fres*0.5 + shore*0.5);
    gl_FragColor = vec4(col, clamp(alpha,0.0,1.0));
  }
`;

export function makeWater(opts: { radius: number; center?: THREE.Vector2; segments?: number; river?: boolean; deep?: number; shallow?: number; waveAmp?: number; foam?: number }): WaterHandle {
  const seg = opts.segments ?? 96;
  const geo = opts.river
    ? new THREE.PlaneGeometry(opts.radius * 2.4, opts.radius * 2.4, seg, seg)
    : new THREE.CircleGeometry(opts.radius, seg);
  // CircleGeometry default uv center 0.5,0.5 fine; PlaneGeometry too.
  const material = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    transparent: true, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWaveAmp: { value: opts.waveAmp ?? 0.12 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uSkyTop: { value: new THREE.Color(0x7ab8e8) },
      uSkyBottom: { value: new THREE.Color(0xe8d8b8) },
      uDeep: { value: new THREE.Color(opts.deep ?? 0x123a52) },
      uShallow: { value: new THREE.Color(opts.shallow ?? 0x2f7a9a) },
      uDaylight: { value: 1 },
      uOpacity: { value: 0.82 },
      uCenter: { value: opts.center ?? new THREE.Vector2(0, 0) },
      uRadius: { value: opts.radius },
      uFoam: { value: opts.foam ?? 1.0 },
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  return {
    mesh, material,
    update(time, sunDir, sunColor, skyTop, skyBottom, daylight) {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uSunDir.value.copy(sunDir);
      u.uSunColor.value.copy(sunColor);
      u.uSkyTop.value.copy(skyTop);
      u.uSkyBottom.value.copy(skyBottom);
      u.uDaylight.value = daylight;
    },
  };
}

// ============================================================
//  SPLASH & RIPPLE FX
// ============================================================
/** An expanding ripple ring on the water surface. Auto-removes. */
export function makeRipple(scene: THREE.Scene, x: number, y: number, z: number, color = 0xcfe8ff, maxR = 1.4): void {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.12, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.02, z);
  scene.add(ring);
  tween(1.1, t => {
    const r = 0.1 + t * maxR;
    ring.scale.set(r, r, r);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
  }, Ease.outQuad).then(() => { scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); });
}

/** A burst of water droplets. intensity scales count & height (1 = small, 3 = legendary cinematic). */
export function makeSplash(scene: THREE.Scene, x: number, y: number, z: number, intensity = 1, color = 0xdaf0ff): void {
  const count = Math.floor(10 + intensity * 14);
  const dropMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.05 * intensity, 6, 5), dropMat);
    d.position.set(x, y, z);
    scene.add(d); drops.push(d);
    const a = Math.random() * Math.PI * 2;
    const spd = (0.5 + Math.random() * 1.2) * intensity;
    const vx = Math.cos(a) * spd, vz = Math.sin(a) * spd;
    const vy = (1.2 + Math.random() * 1.8) * intensity;
    const t0 = { v: 0 };
    tween(0.7 + Math.random() * 0.3, t => {
      const tt = t * (0.9 + intensity * 0.3);
      d.position.x = x + vx * tt;
      d.position.z = z + vz * tt;
      d.position.y = y + vy * tt - 9.8 * tt * tt * 0.5;
      (d.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }).then(() => { scene.remove(d); d.geometry.dispose(); });
    void t0;
  }
  makeRipple(scene, x, y, z, color, 0.8 + intensity);
}

/** Dispose a fish/rod group cleanly. */
export function disposeFish(g: THREE.Object3D): void {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mm = m.material;
      if (Array.isArray(mm)) mm.forEach(x => x.dispose()); else mm?.dispose();
    }
  });
  g.parent?.remove(g);
}

/** Create a 3D aiming reticle to project on the water surface */
export function makeCastingReticle(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.8, 32),
    new THREE.MeshBasicMaterial({ color: 0x5ad88a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 16),
    new THREE.MeshBasicMaterial({ color: 0x5ad88a, transparent: true, opacity: 0.4 })
  );
  center.rotation.x = -Math.PI / 2;
  g.add(ring, center);
  g.name = 'castingReticle';
  return g;
}
