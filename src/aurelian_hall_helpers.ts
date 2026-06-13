import * as THREE from 'three';
import { stoneTexture, plankTexture, carpetTexture, marbleTexture, wallpaperTexture, bookshelfTexture } from './models';
import { say } from './ui';

const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.28 });
const stoneTrim = new THREE.MeshStandardMaterial({ map: stoneTexture('#e2dbe8', '#b8aec8', 2), roughness: 0.7 });

const mkMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, parent: THREE.Object3D) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
};

export function cDesk(
  cx: number, cy: number, cz: number,
  r: number, sa: number, ea: number,
  h: number, d: number, wm: THREE.Material,
  parent: THREE.Object3D
) {
  const segs = 10;
  const step = (ea - sa) / segs;
  const arcLength = r * Math.abs(ea - sa);
  const wSeg = arcLength / segs + 0.05;

  for (let i = 0; i <= segs; i++) {
    const a = sa + i * step;
    const sx = cx + Math.sin(a) * r;
    const sz = cz + Math.cos(a) * r;
    
    const sd = mkMesh(new THREE.BoxGeometry(wSeg, h, d), wm, new THREE.Vector3(sx, cy + h / 2, sz), parent);
    sd.rotation.y = a;
    
    const t = mkMesh(new THREE.BoxGeometry(wSeg + 0.02, 0.08, d + 0.04), gold, new THREE.Vector3(sx, cy + h + 0.04, sz), parent);
    t.rotation.y = a;
  }
}

export function cFountain(cx: number, cy: number, cz: number, parent: THREE.Object3D, colliders: any[]) {
  const fg = new THREE.Group();
  fg.position.set(cx, cy, cz);
  parent.add(fg);

  const r = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 12, 32), stoneTrim);
  r.rotation.x = Math.PI / 2;
  r.position.y = 0.35;
  r.castShadow = r.receiveShadow = true;
  fg.add(r);

  mkMesh(new THREE.CylinderGeometry(2.3, 2.3, 0.4, 32), stoneTrim, new THREE.Vector3(0, 0.2, 0), fg);
  mkMesh(new THREE.CylinderGeometry(0.4, 0.6, 1.4, 12), stoneTrim, new THREE.Vector3(0, 0.7, 0), fg);

  const bl = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.15, 8, 16), stoneTrim);
  bl.rotation.x = Math.PI / 2;
  bl.position.y = 1.4;
  fg.add(bl);

  mkMesh(
    new THREE.CylinderGeometry(2.0, 2.0, 0.1, 32),
    new THREE.MeshStandardMaterial({
      color: 0x3a9ad9,
      emissive: 0x1d4a6a,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75
    }),
    new THREE.Vector3(0, 0.45, 0),
    fg
  );

  const jm = new THREE.MeshStandardMaterial({
    color: 0xaadaff,
    emissive: 0x5ab8e8,
    emissiveIntensity: 0.8,
    roughness: 0.05,
    transparent: true,
    opacity: 0.6
  });

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pts = [{ r: 0.6, y: 1.4 }, { r: 1.1, y: 1.7 }, { r: 1.6, y: 1.3 }, { r: 1.9, y: 0.6 }];
    for (let j = 0; j < 3; j++) {
      const x0 = Math.cos(a) * pts[j].r;
      const z0 = Math.sin(a) * pts[j].r;
      const x1 = Math.cos(a) * pts[j + 1].r;
      const z1 = Math.sin(a) * pts[j + 1].r;
      const dx = x1 - x0, dy = pts[j + 1].y - pts[j].y, dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz);
      const seg = mkMesh(new THREE.CylinderGeometry(0.05, 0.03, len, 6), jm, new THREE.Vector3((x0 + x1) / 2, (pts[j].y + pts[j + 1].y) / 2, (z0 + z1) / 2), fg);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    }
  }

  const pl = mkMesh(new THREE.ConeGeometry(0.25, 1.2, 8), jm, new THREE.Vector3(0, 2.0, 0), fg);
  pl.name = 'legendpulse';

  fg.add(new THREE.PointLight(0x5ab8e8, 12, 8));
  fg.children[fg.children.length - 1].position.set(0, 1.2, 0);

  mkMesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), gold, new THREE.Vector3(0, 0.35, 2.3), fg);
  mkMesh(new THREE.CircleGeometry(0.3, 8), new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3 }), new THREE.Vector3(0, 0.35, 2.36), fg);

  colliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 2.6, y0: 0, y1: 2.0 });
}

export function cReadingDesk(rx: number, rz: number, FH: number, parent: THREE.Object3D, colliders: any[]) {
  const dg = new THREE.Group();
  dg.position.set(rx, FH, rz);
  parent.add(dg);

  const wm = new THREE.MeshStandardMaterial({ map: plankTexture('#5a3a22', 1), roughness: 0.6 });
  const gg = new THREE.MeshStandardMaterial({ color: 0x1a5a2a, roughness: 0.2, transparent: true, opacity: 0.9 });
  const br = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.3 });

  mkMesh(new THREE.BoxGeometry(2.4, 0.1, 1.4), wm, new THREE.Vector3(0, 0.95, 0), dg);

  for (const lx of [-1.1, 1.1]) {
    for (const lz of [-0.6, 0.6]) {
      mkMesh(new THREE.CylinderGeometry(0.06, 0.04, 0.9, 6), wm, new THREE.Vector3(lx, 0.45, lz), dg);
    }
  }

  const pl = mkMesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshStandardMaterial({ color: 0xf2ead0, roughness: 0.8, side: THREE.DoubleSide }), new THREE.Vector3(-0.16, 1.04, 0), dg);
  pl.rotation.set(-Math.PI / 2 + 0.15, 0, 0.08);

  const pr = mkMesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshStandardMaterial({ color: 0xf2ead0, roughness: 0.8, side: THREE.DoubleSide }), new THREE.Vector3(0.16, 1.04, 0), dg);
  pr.rotation.set(-Math.PI / 2 + 0.15, 0, -0.08);

  mkMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), br, new THREE.Vector3(-0.6, 1.0, 0.3), dg);
  mkMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), br, new THREE.Vector3(-0.6, 1.18, 0.3), dg);
  mkMesh(new THREE.BoxGeometry(0.35, 0.12, 0.2), gg, new THREE.Vector3(-0.6, 1.35, 0.3), dg);
  mkMesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff0aa }), new THREE.Vector3(-0.6, 1.29, 0.3), dg);

  const l = new THREE.PointLight(0xffe6a0, 4, 3);
  l.position.set(-0.6, 1.25, 0.3);
  dg.add(l);

  const cg = new THREE.Group();
  cg.position.set(0, 0, 0.95);
  dg.add(cg);

  mkMesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), wm, new THREE.Vector3(0, 0.55, 0), cg);
  mkMesh(new THREE.BoxGeometry(0.7, 0.6, 0.08), wm, new THREE.Vector3(0, 0.85, 0.31), cg);

  for (const cx of [-0.3, 0.3]) {
    for (const cz of [-0.3, 0.3]) {
      mkMesh(new THREE.CylinderGeometry(0.04, 0.03, 0.5, 6), wm, new THREE.Vector3(cx, 0.25, cz), cg);
    }
  }

  colliders.push({ pos: new THREE.Vector3(rx, 0, rz), r: 1.4, y0: FH, y1: FH });
}

export function cColumnSconces(cx: number, cz: number, FH: number, parent: THREE.Object3D) {
  const sh = [2.5, FH + 2.5, 2 * FH + 2.5, 3 * FH + 2.5];
  const bm = new THREE.MeshBasicMaterial({ color: 0xffeed0 });

  for (const sy of sh) {
    const dx = cx < 0 ? 0.35 : -0.35;
    const dz = cz < 0 ? 0.35 : -0.35;

    const b = mkMesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), gold, new THREE.Vector3(cx + dx / 2, sy, cz + dz / 2), parent);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx, 0, dz).normalize());

    mkMesh(new THREE.SphereGeometry(0.18, 8, 8), bm, new THREE.Vector3(cx + dx, sy + 0.15, cz + dz), parent);

    const l = new THREE.PointLight(0xffe2ad, 5, 8);
    l.position.set(cx + dx, sy + 0.15, cz + dz);
    parent.add(l);
  }
}

export function cHangingBanner(bx: number, by: number, bz: number, ry: number, parent: THREE.Object3D) {
  const bg = new THREE.Group();
  bg.position.set(bx, by, bz);
  bg.rotation.y = ry;
  parent.add(bg);

  const r = mkMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), gold, new THREE.Vector3(0, 0.9, 0), bg);
  r.rotation.z = Math.PI / 2;

  for (const rx of [-0.6, 0.6]) {
    mkMesh(new THREE.SphereGeometry(0.08, 6, 6), gold, new THREE.Vector3(rx, 0.9, 0), bg);
  }

  mkMesh(new THREE.BoxGeometry(0.9, 2.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a1730, roughness: 0.95 }), new THREE.Vector3(0, -0.4, 0), bg);
  mkMesh(new THREE.BoxGeometry(0.94, 0.12, 0.08), gold, new THREE.Vector3(0, -1.75, 0), bg);
  mkMesh(new THREE.CircleGeometry(0.2, 8), gold, new THREE.Vector3(0, -0.4, 0.04), bg);
}

export function cTelescope(tx: number, tz: number, F3: number, parent: THREE.Object3D, colliders: any[]) {
  const tg = new THREE.Group();
  tg.position.set(tx, F3, tz);
  parent.add(tg);

  const bm = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.28 });
  const wm = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.7 });
  const ll = 1.35;

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const sx = Math.cos(a) * 0.35;
    const sz = Math.sin(a) * 0.35;
    const lg = mkMesh(new THREE.CylinderGeometry(0.025, 0.015, ll, 6), wm, new THREE.Vector3(sx, ll / 2 - 0.05, sz), tg);
    lg.rotation.set(0, -a, 0.22);
    
    const tp = mkMesh(new THREE.CylinderGeometry(0.028, 0.02, 0.15, 6), bm, new THREE.Vector3(Math.cos(a) * 0.43, 0.05, Math.sin(a) * 0.43), tg);
    tp.rotation.set(0, -a, 0.22);
  }

  mkMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8), bm, new THREE.Vector3(0, 1.25, 0), tg);

  const tb = new THREE.Group();
  tb.position.set(0, 1.38, 0);
  tb.rotation.set(0.35, -Math.PI / 4, 0);
  tg.add(tb);

  const mt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.4, 10), bm);
  mt.rotation.x = Math.PI / 2;

  const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.25, 10), bm);
  hd.position.z = -0.7;
  hd.rotation.x = Math.PI / 2;

  const ey = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8), bm);
  ey.position.z = 0.8;
  ey.rotation.x = Math.PI / 2;

  tb.add(mt, hd, ey);

  colliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 0.65, y0: F3, y1: F3 });
}

export function cPainting(
  title: string, desc: string,
  px: number, pz: number,
  side: 'east' | 'west' | 'north',
  F2: number, canvasColor: number,
  HW: number, HD: number,
  g2: THREE.Object3D,
  interactables: any[]
) {
  const rotY = (side === 'north') ? Math.PI / 2 : 0;
  const isNorth = side === 'north';

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 1.4), gold);
  frame.position.set(px, F2 + 2.4, pz);
  frame.rotation.y = rotY;
  frame.castShadow = true;
  g2.add(frame);

  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.6),
    new THREE.MeshStandardMaterial({ color: canvasColor, emissive: canvasColor, emissiveIntensity: 0.15, roughness: 0.8 })
  );

  let canvasX = px;
  let canvasZ = pz;
  let canvasRot = 0;

  if (side === 'east') {
    canvasX = px - 0.09;
    canvasRot = -Math.PI / 2;
  } else if (side === 'west') {
    canvasX = px + 0.09;
    canvasRot = Math.PI / 2;
  } else { 
    canvasZ = pz + 0.09;
    canvasRot = 0;
  }

  canvas.position.set(canvasX, F2 + 2.4, canvasZ);
  canvas.rotation.y = canvasRot;
  g2.add(canvas);

  const pillarOffset = 0.85;
  const px0 = isNorth ? px - pillarOffset : px;
  const pz0 = isNorth ? pz : pz - pillarOffset;
  const px1 = isNorth ? px + pillarOffset : px;
  const pz1 = isNorth ? pz : pz + pillarOffset;

  const alcovePillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), stoneTrim);
  alcovePillar1.position.set(px0, F2 + 2.2, pz0);
  alcovePillar1.castShadow = true;

  const alcovePillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), stoneTrim);
  alcovePillar2.position.set(px1, F2 + 2.2, pz1);
  alcovePillar2.castShadow = true;
  g2.add(alcovePillar1, alcovePillar2);

  const arch = new THREE.Mesh(new THREE.BoxGeometry(isNorth ? 1.8 : 0.2, 0.15, isNorth ? 0.2 : 1.8), stoneTrim);
  arch.position.set(px, F2 + 3.4, pz);
  g2.add(arch);

  const spotlight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffecc0 }));
  let spotX = px;
  let spotZ = pz;
  if (side === 'east') spotX = px - 0.3;
  else if (side === 'west') spotX = px + 0.3;
  else spotZ = pz + 0.3;
  spotlight.position.set(spotX, F2 + 3.2, spotZ);
  
  const spotLight = new THREE.PointLight(0xffdf9d, 3, 3);
  spotLight.position.set(spotX, F2 + 3.1, spotZ);
  g2.add(spotlight, spotLight);

  const plateGeo = new THREE.Mesh(new THREE.BoxGeometry(isNorth ? 0.6 : 0.08, 0.12, isNorth ? 0.08 : 0.6), gold);
  plateGeo.position.set(canvasX + (side === 'east' ? -0.02 : side === 'west' ? 0.02 : 0), F2 + 1.38, pz + (side === 'north' ? 0.02 : 0));
  g2.add(plateGeo);

  let intX = px;
  let intZ = pz;
  if (side === 'east') intX = px - 1.5;
  else if (side === 'west') intX = px + 1.5;
  else intZ = pz + 1.5;

  interactables.push({
    pos: new THREE.Vector3(intX, F2, intZ), radius: 1.8,
    label: `Press <b>E</b> — inspect Portrait of ${title}`,
    handler: async () => { await say(`Portrait of ${title}`, desc); }
  });
}
