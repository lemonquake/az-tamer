// ============================================================
// AZ Tamer — Agdao Island, the Cradle of Tamers.
// A medium tropical island in the western sea: turquoise lagoon,
// golden-hour light, palm groves, a hut village around the
// Circle of the First Fire, a waterfall under the northern
// ridge, and — up on the north-east bluff, exactly where the
// islanders say — Greggy the Stormheart.
//
// Route to Greggy: ask the villagers → Elder Toto's word opens
// the LEFT GATE (west) → follow the cliff path north, then east
// along the ridge top to the bluff. The Cradle Hollow sea-cave
// waits on the eastern shore below.
// ============================================================
import * as THREE from 'three';
import { DUNGEONS, ITEMS, type DungeonDef } from './data';
import { Player } from './state';
import {
  makeTamer, updateVoxelHuman, makeVoxelHuman, makeCustomCreature, disposeRig,
  skyGradient, canvasTex, mulberry, plankTexture, leafTexture, stoneTexture, groundTexture,
  type GuardianRig, type VoxelHumanOpts,
} from './models';
import { LEGENDS, AGDAO_LORE } from './lore';
import { questState, completeQuest, syncStoryQuests } from './quests';
import { VFX } from './vfx';
import { sfx } from './audio';
import {
  say, conversation, choose, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, type PanelKind,
} from './ui';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance } from './clothes';
import { worldClock, DayNightRig } from './daynight';
import { worldOrbit } from './camorbit';
import { tagNpc, attachNpcPicker } from './npccard';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export type AgdaoResult = { kind: 'leave' } | { kind: 'dungeon'; def: DungeonDef };

interface Interactable { pos: THREE.Vector3; radius: number; label: string; handler: () => Promise<void> | void; }

const WALK_R = 41;          // walkable radius — the surf line

/** Animated turquoise sea — streaked wave crests on deep lagoon blue. */
function seaTexture(): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(404);
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#2aa8c4'); grad.addColorStop(0.5, '#1e8ab8'); grad.addColorStop(1, '#2ab4c4');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 38; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += 14 + rnd() * 22; y += rnd() * 8 - 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.1})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, 20);
}

export class AgdaoIsland {
  private scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 240);
  private vfx = new VFX(this.scene);
  private tamer = makeTamer();
  private keys = new Set<string>();
  private busy = false;
  private walking = false;
  private t = 0;
  private interactables: Interactable[] = [];
  private colliders: { pos: THREE.Vector3; r: number }[] = [];
  private gateCollider: { pos: THREE.Vector3; r: number } | null = null;
  private gateDoors: THREE.Object3D[] = [];
  private npcs: THREE.Group[] = [];
  private rigs: GuardianRig[] = [];
  private markers: MapMarker[] = [];
  private seaTex: THREE.Texture | null = null;
  private dayNight: DayNightRig | null = null;
  private clouds: THREE.Group[] = [];
  private butterflies: { grp: THREE.Group; anchor: THREE.Vector3; phase: number; wingL: THREE.Object3D; wingR: THREE.Object3D }[] = [];
  private fireflies: { mesh: THREE.Mesh; anchor: THREE.Vector3; phase: number }[] = [];
  private envTick: ((dt: number) => void)[] = [];
  private resolveExit: ((r: AgdaoResult) => void) | null = null;

  constructor(private player: Player, private spawnAt: 'pier' | 'cave' = 'pier') {}

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ================= terrain =================
  /** Island height: a gentle dome, the northern highlands, and Greggy's bluff. */
  private groundH(x: number, z: number): number {
    const r = Math.hypot(x, z);
    let h = Math.max(0, 1.6 * (1 - (r / 46) ** 2));
    const bump = (x0: number, z0: number, rad: number, ht: number) => {
      const d2 = (x - x0) ** 2 + (z - z0) ** 2;
      return ht * Math.exp(-d2 / (rad * rad));
    };
    h += bump(28, -30, 13, 3.4);    // the Stormheart's bluff
    h += bump(-8, -30, 16, 2.0);    // northern highland
    h += bump(12, -33, 15, 2.2);
    if (r > 36) h *= Math.max(0, (44 - r) / 8);   // melt into the beach
    return Math.max(0, h);
  }

  // ================= scene =================
  private buildScene(): void {
    const s = this.scene;
    // golden-hour tropics — the island lives on the same clock as the mainland
    s.background = skyGradient('#4aa8e0', '#ffe2b0');
    s.fog = new THREE.Fog(0xbfe4ee, 60, 170);
    const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x8a7a52, 0.65);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe8c0, 1.5);
    sun.position.set(-30, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    s.add(sun);
    this.dayNight = new DayNightRig(s, sun, hemi, {
      sunMax: 1.5, sunMin: 0.14, ambientMax: 0.65, ambientMin: 0.24, sunDay: '#ffe8c0',
    });

    // ---- the island: displaced plane, sand→grass vertex paint ----
    const geo = new THREE.PlaneGeometry(96, 96, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color('#ecd8a4'), grass = new THREE.Color('#56a85e'), lush = new THREE.Color('#3a8a4e');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      if (r > 37 || h < 0.22) c.copy(sand);
      else c.copy(grass).lerp(lush, Math.min(1, h / 4));
      // speckle variance
      const v = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      c.offsetHSL(0, 0, (v - 0.5) * 0.05);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: groundTexture('#c8c8c0', '#e0e0d8', 16), vertexColors: true, roughness: 0.95,
    }));
    ground.receiveShadow = true;
    s.add(ground);

    // ---- the sea, alive and breathing ----
    this.seaTex = seaTexture();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ map: this.seaTex, roughness: 0.2, metalness: 0.05 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.32;
    s.add(sea);
    // surf foam ring hugging the island
    const foam = new THREE.Mesh(new THREE.TorusGeometry(44.5, 1.4, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    foam.rotation.x = Math.PI / 2;
    foam.position.y = -0.18;
    s.add(foam);
    this.envTick.push(() => {
      if (this.seaTex) { this.seaTex.offset.x = this.t * 0.008; this.seaTex.offset.y = Math.sin(this.t * 0.18) * 0.02; }
      (foam.material as THREE.MeshBasicMaterial).opacity = 0.26 + (Math.sin(this.t * 0.9) * 0.5 + 0.5) * 0.18;
      foam.scale.setScalar(1 + Math.sin(this.t * 0.9) * 0.008);
    });

    // ---- set dressing ----
    this.buildVillage();
    this.buildRidgeAndGate();
    this.buildWaterfall();
    this.buildBluff();
    this.buildCaveMouth();
    this.buildPier();
    this.scatterFlora();
    this.buildShrine();
    this.spawnButterflies();
    this.spawnFireflies();
    this.driftClouds();

    // ---- the cast ----
    this.placeVillagers();
    this.placeGreggy();

    // player
    const spawn = this.spawnAt === 'cave' ? new THREE.Vector3(34, 0, -3) : new THREE.Vector3(0, 0, 33);
    this.tamer.position.copy(spawn);
    this.tamer.position.y = this.groundH(spawn.x, spawn.z);
    this.tamer.rotation.y = Math.PI; // face north, into the island
    s.add(this.tamer);
    this.camera.position.set(spawn.x, 8, spawn.z + 9);
    this.camera.lookAt(spawn.x, 1, spawn.z);
  }

  /** A 3D floating name label. */
  private label3d(text: string, color: string, pos: THREE.Vector3, scale = 3.6): void {
    const cv = document.createElement('canvas');
    let ctx = cv.getContext('2d')!;
    ctx.font = 'bold 56px Trebuchet MS';
    cv.width = Math.max(512, Math.ceil(ctx.measureText(text).width) + 64);
    cv.height = 128;
    ctx = cv.getContext('2d')!;
    ctx.font = 'bold 56px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.lineWidth = 10; ctx.strokeStyle = '#0a0c18';
    ctx.strokeText(text, cv.width / 2, 80);
    ctx.fillStyle = color;
    ctx.fillText(text, cv.width / 2, 80);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 40;
    sp.scale.set(scale * (cv.width / cv.height / 4), scale / 4, 1);
    sp.position.copy(pos);
    this.scene.add(sp);
  }

  // ---------------- builders ----------------
  private palm(x: number, z: number, lean = 0.25, h = 4.2): void {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 1), roughness: 0.9 });
    const segs = 4;
    let px = 0, py = 0;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 - i * 0.012, 0.13 - i * 0.012, h / segs, 6), trunkMat);
      seg.position.set(px, py + h / segs / 2, 0);
      seg.rotation.z = lean * (i / segs);
      seg.castShadow = true;
      g.add(seg);
      px -= Math.sin(lean * (i / segs)) * (h / segs);
      py += Math.cos(lean * (i / segs)) * (h / segs);
    }
    const frondMat = new THREE.MeshStandardMaterial({ map: leafTexture('#3aa84e', '#5ec46a', '#26743a', 3), roughness: 0.85, side: THREE.DoubleSide });
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.3, 4), frondMat);
      frond.position.set(px + Math.cos(a) * 0.95, py + 0.15, Math.sin(a) * 0.95);
      frond.rotation.set(Math.sin(a) * 1.32, 0, -Math.cos(a) * 1.32);
      frond.scale.z = 0.28;
      frond.castShadow = true;
      frond.name = 'frond';
      g.add(frond);
    }
    for (let n = 0; n < 3; n++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x6a4a26, roughness: 0.9 }));
      const a = n * 2.1;
      nut.position.set(px + Math.cos(a) * 0.25, py - 0.18, Math.sin(a) * 0.25);
      g.add(nut);
    }
    const y = this.groundH(x, z);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.5 });
  }

  private hut(x: number, z: number, rotY: number, size = 1, wallCol = '#b8915e'): void {
    const g = new THREE.Group();
    const y = this.groundH(x, z);
    const wallMat = new THREE.MeshStandardMaterial({ map: plankTexture(wallCol, 2), roughness: 0.95 });
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * size, 1.75 * size, 1.9 * size, 8), wallMat);
    walls.position.y = 0.95 * size;
    walls.castShadow = true;
    // layered thatch roof
    const thatch = new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 3), roughness: 1 });
    for (let layer = 0; layer < 3; layer++) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry((2.4 - layer * 0.55) * size, 0.75 * size, 8), thatch);
      roof.position.y = (2.15 + layer * 0.5) * size;
      roof.castShadow = true;
      g.add(roof);
    }
    // doorway
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.8 * size, 1.25 * size, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 1 }));
    doorway.position.set(0, 0.65 * size, 1.62 * size);
    g.add(walls, doorway);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.9 * size });
  }

  private torch(x: number, z: number, withLight: boolean): void {
    const g = new THREE.Group();
    const y = this.groundH(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6),
      new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.95 }));
    pole.position.y = 0.85;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.9 }));
    bowl.position.y = 1.78;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 7),
      new THREE.MeshBasicMaterial({ color: 0xffa54e, transparent: true, opacity: 0.9 }));
    flame.position.y = 2.05;
    g.add(pole, bowl, flame);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.3 });
    let light: THREE.PointLight | null = null;
    if (withLight) {
      light = new THREE.PointLight(0xff9a4e, 6, 7);
      light.position.set(x, y + 2.1, z);
      this.scene.add(light);
    }
    const ph = Math.random() * Math.PI * 2;
    this.envTick.push(() => {
      const f = 0.85 + Math.sin(this.t * 11 + ph) * 0.12 + Math.sin(this.t * 23 + ph * 2) * 0.06;
      flame.scale.set(f, 0.8 + f * 0.35, f);
      // torchlight carries further once the sun is down
      if (light) light.intensity = 6 * f * (0.55 + worldClock.night * 0.95);
    });
  }

  private rock(x: number, z: number, r = 1, tall = 1): void {
    const y = this.groundH(x, z);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8276', '#5a544a', 2), roughness: 0.95 }));
    m.position.set(x, y + r * 0.3 * tall, z);
    m.scale.y = tall;
    m.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.4);
    m.castShadow = true;
    this.scene.add(m);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: r * 0.95 });
  }

  // ---------------- the village ----------------
  private buildVillage(): void {
    // fire pit of the Circle — the flame that has never gone out
    const y0 = this.groundH(0, 8);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5, 12),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7268', '#4a443a', 2), roughness: 0.9 }));
    pit.position.set(0, y0 + 0.25, 8);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb24e, transparent: true, opacity: 0.9 }));
    flame.position.set(0, y0 + 1.1, 8);
    const fireLight = new THREE.PointLight(0xff9a4e, 14, 12);
    fireLight.position.set(0, y0 + 1.6, 8);
    this.scene.add(pit, flame, fireLight);
    this.colliders.push({ pos: new THREE.Vector3(0, 0, 8), r: 1.7 });
    this.markers.push({ x: 0, z: 8, label: 'First Fire', color: '#ffa54e', kind: 'poi' });
    let emberT = 0;
    this.envTick.push(dt => {
      const f = 0.85 + Math.sin(this.t * 9) * 0.12 + Math.sin(this.t * 21) * 0.07;
      flame.scale.set(f, 0.85 + f * 0.3, f);
      fireLight.intensity = 14 * f * (0.6 + worldClock.night * 0.8);
      emberT += dt;
      if (emberT > 0.5) {
        emberT = 0;
        this.vfx.burst(new THREE.Vector3(0, y0 + 1.4, 8), 0xffb86a, { count: 3, speed: 0.4, up: 1.8, gravity: 0.6, life: 1.2, size: 0.09 });
      }
    });
    this.label3d('🔥 The First Fire', '#ffa54e', new THREE.Vector3(0, y0 + 3.6, 8), 3.2);
    this.interactables.push({
      pos: new THREE.Vector3(0, 0, 8), radius: 2.6,
      label: 'Press <b>E</b> — warm your hands at the First Fire',
      handler: async () => {
        await say('', 'The fire pit of the Circle of the First Fire. The islanders say it has burned without pause for seven hundred years — lit from the driftwood fire Aurelia built the night she pulled Cero from the surf.');
        await say('', 'The flame leans toward you, very slightly. Probably the wind.');
      },
    });

    // hut ring
    this.hut(-8, 13, 0.5);
    this.hut(8.5, 11, -0.6);
    this.hut(-11, 5, 1.1, 0.9, '#a8855a');
    this.hut(-6, 20, 0.2, 0.85);
    this.hut(7, 21, -0.3, 0.9, '#c49a66');
    this.hut(13, 16, -0.9, 0.8);

    // the Circle's long hut — oldest guildhall in the world
    {
      const x = 13, z = -1;
      const y = this.groundH(x, z);
      const g = new THREE.Group();
      const wallMat = new THREE.MeshStandardMaterial({ map: plankTexture('#9a7a4e', 3), roughness: 0.95 });
      const hall = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.4, 3.6), wallMat);
      hall.position.y = 1.2;
      hall.castShadow = true;
      const thatch = new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 4), roughness: 1 });
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 7.9, 3, 1), thatch);
      roof.rotation.z = Math.PI / 2;
      roof.rotation.x = Math.PI;
      roof.position.y = 2.6;
      roof.scale.y = 1;
      roof.castShadow = true;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2c2018 }));
      door.position.set(0, 0.8, 1.85);
      // guild banner: an orange flame on woven cloth
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7),
        new THREE.MeshStandardMaterial({ color: 0xf2a64e, roughness: 0.9, side: THREE.DoubleSide }));
      banner.position.set(2.2, 1.7, 1.86);
      g.add(hall, roof, door, banner);
      g.position.set(x, y, z);
      this.scene.add(g);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 4.2 });
      this.label3d('🔥 Circle of the First Fire', '#f2a64e', new THREE.Vector3(x, y + 5.2, z), 4.2);
      this.markers.push({ x, z, label: 'Guild Hall', color: '#f2a64e', kind: 'building' });
    }

    // fruit stall
    {
      const x = 6, z = 15.5;
      const y = this.groundH(x, z);
      const g = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1),
        new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 2), roughness: 0.9 }));
      counter.position.y = 0.45;
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6),
        new THREE.MeshStandardMaterial({ map: leafTexture('#4aa84e', '#6ec46a', '#2a743a', 9), roughness: 1, side: THREE.DoubleSide }));
      canopy.position.set(0, 2.05, 0);
      canopy.rotation.x = -0.4;
      for (let i = 0; i < 6; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
          new THREE.MeshStandardMaterial({ color: [0xf2a63a, 0xe8d44e, 0xd84a3a][i % 3], roughness: 0.6 }));
        fruit.position.set(-0.7 + (i % 3) * 0.7, 1.02, (i < 3 ? -0.2 : 0.22));
        g.add(fruit);
      }
      const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
      pole1.position.set(-1, 1.05, 0);
      const pole2 = pole1.clone(); pole2.position.x = 1;
      g.add(counter, canopy, pole1, pole2);
      g.position.set(x, y, z);
      g.rotation.y = -0.5;
      this.scene.add(g);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.4 });
    }

    // torches around the village + along the pier path
    const torchSpots: [number, number][] = [
      [-3, 12], [3.5, 5], [-3.5, 4.5], [3, 12.5],          // plaza ring (lit)
      [-1.8, 22], [1.8, 28], [-1.8, 33],                   // pier path (lit)
      [10, 5], [-13, 9],                                   // outskirts (unlit flames only)
      [-19, -2], [-24, -14], [-13, -22],                   // gate & cliff path
    ];
    torchSpots.forEach(([x, z], i) => this.torch(x, z, i < 8));

    this.markers.push({ x: 0, z: 14, label: 'Village', color: '#e8c47a', kind: 'poi' });
  }

  // ---------------- ridge, gate, paths ----------------
  private buildRidgeAndGate(): void {
    // the northern ridge — a rock wall from the west pass to the eastern sea.
    // Everything north of it is reached ONLY through the Left Gate.
    for (let x = -14; x <= 42; x += 3.2) {
      const z = -12 - Math.sin((x + 14) * 0.06) * 2;
      this.rock(x + (Math.random() - 0.5) * 1.2, z, 1.6 + Math.random() * 0.9, 1.6 + Math.random() * 0.8);
    }
    // ridge bends north at its eastern end and walks into the sea
    for (const [x, z] of [[42.5, -15], [43.5, -18], [44, -22]] as const) {
      this.rock(x, z, 1.8, 1.6);
    }
    // seal the corner where the jungle wall meets the ridge — the Left
    // Gate is the only honest way north
    this.rock(-16, -10.5, 1.7, 1.5);
    this.rock(-14.4, -11.6, 1.6, 1.5);
    // jungle wall down the west side of the village — the fence the gate breaks
    for (let z = -9; z <= 36; z += 2.6) {
      if (z > -0.5 && z < 4.5) continue;  // the gate gap
      const x = -16.5 + Math.sin(z * 0.4) * 0.8;
      if (Math.random() < 0.55) this.palm(x, z, 0.15 + Math.random() * 0.2, 3.4 + Math.random() * 1.2);
      else this.rock(x, z, 1.1 + Math.random() * 0.5, 1.1);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.5 });
    }

    // THE LEFT GATE — carved driftwood arch, the Elder's word its only key
    const gx = -16.5, gz = 2;
    const gy = this.groundH(gx, gz);
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a36', 2), roughness: 0.9 });
    for (const side of [-2.1, 2.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 8), wood);
      post.position.set(0, 1.8, side);
      post.castShadow = true;
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 5.2), wood);
    lintel.position.y = 3.7;
    lintel.castShadow = true;
    g.add(lintel);
    // carved flame sigil
    const sigil = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0xf2a64e, emissive: 0xc46a1a, emissiveIntensity: 0.7 }));
    sigil.position.y = 4.2;
    g.add(sigil);
    // gate doors (woven panels) — they swing open with the Elder's blessing
    const opened = !!this.player.flags['agdao_gate_open'];
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 1.9),
        new THREE.MeshStandardMaterial({ map: plankTexture('#9a7a4e', 2), roughness: 1 }));
      door.position.set(0, 1.3, side * 1.05);
      if (opened) { door.position.z = side * 1.7; door.rotation.y = side * 1.2; }
      g.add(door);
      this.gateDoors.push(door);
    }
    g.position.set(gx, gy, gz);
    g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    this.label3d('⛩️ The Left Gate', '#e8c47a', new THREE.Vector3(gx, gy + 5.4, gz), 3.4);
    this.markers.push({ x: gx, z: gz, label: 'Left Gate', color: '#e8c47a', kind: 'door' });
    if (!opened) {
      this.gateCollider = { pos: new THREE.Vector3(gx, 0, gz), r: 2.2 };
      this.colliders.push(this.gateCollider);
    }
  }

  private openGateDoors(): void {
    if (this.gateCollider) {
      const i = this.colliders.indexOf(this.gateCollider);
      if (i >= 0) this.colliders.splice(i, 1);
      this.gateCollider = null;
    }
    this.gateDoors.forEach((door, di) => {
      const side = di === 0 ? -1 : 1;
      door.position.z = side * 1.7;
      door.rotation.y = side * 1.2;
    });
    sfx('open');
    toast('⛩️ The Left Gate stands open!', 'gold');
  }

  // ---------------- waterfall ----------------
  private buildWaterfall(): void {
    const x = 4, z = -11;
    const baseY = this.groundH(x, z - 1);
    // cliff face the fall pours over
    this.rock(x - 2.2, z - 0.5, 2.2, 2.1);
    this.rock(x + 2.2, z - 0.5, 2.1, 2.2);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.2),
      new THREE.MeshStandardMaterial({ color: 0xbfe8f2, transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide }));
    fall.position.set(x, baseY + 2.6, z + 0.4);
    this.scene.add(fall);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.3, 18),
      new THREE.MeshStandardMaterial({ color: 0x3ab8c8, transparent: true, opacity: 0.85, roughness: 0.1 }));
    pool.position.set(x, baseY + 0.08, z + 2.4);
    this.scene.add(pool);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z + 2.4), r: 2.8 });
    this.markers.push({ x, z: z + 2, label: 'Falls', color: '#7ad8e8', kind: 'poi' });
    let mistT = 0;
    this.envTick.push(dt => {
      fall.position.y = baseY + 2.6 + Math.sin(this.t * 7) * 0.04;
      (fall.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(this.t * 9) * 0.07;
      mistT += dt;
      if (mistT > 0.45) {
        mistT = 0;
        this.vfx.burst(new THREE.Vector3(x, baseY + 0.4, z + 1.4), 0xd8f4ff,
          { count: 5, speed: 0.8, up: 1.2, gravity: -0.6, life: 0.9, size: 0.12 });
      }
    });
  }

  // ---------------- Greggy's bluff ----------------
  private buildBluff(): void {
    const x = 28, z = -30;
    const y = this.groundH(x, z);
    // the hermitage: a stilt hut with a lightning rod
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#6a4e2e', 2), roughness: 0.9 });
    for (const [sx, sz] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), wood);
      stilt.position.set(sx, 0.55, sz);
      g.add(stilt);
    }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.9, 2.8), wood);
    cabin.position.y = 2.05;
    cabin.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.3, 4),
      new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 3), roughness: 1 }));
    roof.position.y = 3.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    // the rod — a copper spear into the sky, faintly humming
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xc88a4a, metalness: 0.85, roughness: 0.3 }));
    rod.position.y = 6.2;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xf2d23a, emissive: 0xf2d23a, emissiveIntensity: 1.4 }));
    tip.position.y = 8.4;
    g.add(cabin, roof, rod, tip);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 2.6 });
    this.label3d('⚡ The Stormheart\'s Rest', '#f2d23a', new THREE.Vector3(x, y + 10, z), 4.6);
    this.markers.push({ x, z, label: 'The Bluff', color: '#f2d23a', kind: 'building' });
    // stray current crawls the rod every few seconds
    let arcT = 2;
    this.envTick.push(dt => {
      arcT -= dt;
      if (arcT <= 0) {
        arcT = 3 + Math.random() * 4;
        const top = new THREE.Vector3(x, y + 8.4, z);
        this.vfx.bolt(top, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3)), 0xfff2a0, { life: 0.25, jitter: 0.5 });
      }
      tip.scale.setScalar(1 + Math.sin(this.t * 3) * 0.15);
    });
  }

  // ---------------- the Cradle Hollow mouth ----------------
  private buildCaveMouth(): void {
    const x = 37, z = -7;
    const y = this.groundH(x, z);
    this.rock(x - 2.2, z - 1.5, 2.4, 2.0);
    this.rock(x + 1.8, z - 2, 2.2, 2.4);
    this.rock(x - 0.2, z - 3, 2.6, 2.6);
    // the dark arch between the rocks
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 12, 1, false, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x031414, side: THREE.DoubleSide }));
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = -Math.PI / 2.4;
    arch.position.set(x - 0.2, y + 0.7, z - 1.4);
    this.scene.add(arch);
    const glow = new THREE.PointLight(0x4ee4c8, 7, 9);
    glow.position.set(x, y + 1, z);
    this.scene.add(glow);
    this.envTick.push(() => { glow.intensity = 6 + Math.sin(this.t * 1.4) * 2.5; });
    this.label3d('🌀 Cradle Hollow', '#4ee4c8', new THREE.Vector3(x, y + 4.6, z), 3.8);
    this.markers.push({ x, z, label: 'Cradle Hollow', color: '#4ee4c8', kind: 'poi' });

    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z + 1), radius: 2.8,
      label: 'Press <b>E</b> — the Cradle Hollow',
      handler: async () => {
        const p = this.player;
        if (!p.flags['met_greggy']) {
          await say('', 'A skin of impossibly calm water seals the cave mouth — calm the way held breath is calm. Whatever sleeps in the world\'s gentlest place does not want visitors yet.');
          await say('', 'The islanders say only the Stormheart knows how to part it. Perhaps you should find him first.');
          return;
        }
        const pick = await choose('', 'The seal parts before you like a curtain remembering its manners. Cold, old air drifts out — and under it, something wrong. Enter the Cradle Hollow?', ['Enter (Lv 18–24, boss Lv 27)', 'Not yet']);
        if (pick === 0) {
          this.player.save();
          this.finish({ kind: 'dungeon', def: DUNGEONS.find(d => d.id === 'cradle')! });
        }
      },
    });
  }

  // ---------------- pier ----------------
  private buildPier(): void {
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 3), roughness: 0.95 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 12), wood);
    deck.position.set(0, 0.35, 40);
    deck.castShadow = true;
    this.scene.add(deck);
    for (let z = 35; z <= 45; z += 2.4) {
      for (const side of [-1.1, 1.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), wood);
        post.position.set(side, -0.2, z);
        this.scene.add(post);
      }
    }
    // your boat, tied and bobbing
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 3.4, 8, 1),
      new THREE.MeshStandardMaterial({ map: plankTexture('#7a5636', 2), roughness: 0.9 }));
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.scale.y = 0.55;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
    mast.position.y = 1.3;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xf2ead0, roughness: 1, side: THREE.DoubleSide }));
    sail.position.set(0.05, 1.5, 0);
    sail.rotation.y = Math.PI / 2;
    boat.add(hull, mast, sail);
    boat.position.set(2.6, -0.05, 43);
    this.scene.add(boat);
    this.envTick.push(() => {
      boat.position.y = -0.05 + Math.sin(this.t * 1.1) * 0.08;
      boat.rotation.z = Math.sin(this.t * 0.9) * 0.03;
    });
    // a beached canoe for color
    const canoe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 2.6, 7),
      new THREE.MeshStandardMaterial({ map: plankTexture('#9a6a3a', 2), roughness: 0.95 }));
    canoe.rotation.z = Math.PI / 2;
    canoe.scale.y = 0.5;
    canoe.position.set(-7, this.groundH(-7, 35) + 0.25, 35);
    canoe.rotation.y = 0.6;
    this.scene.add(canoe);
    this.colliders.push({ pos: new THREE.Vector3(-7, 0, 35), r: 1.3 });

    this.markers.push({ x: 0, z: 38, label: 'Pier', color: '#c9a24a', kind: 'door' });
    this.interactables.push({
      pos: new THREE.Vector3(0, 0, 37), radius: 2.6,
      label: 'Press <b>E</b> — sail back to the mainland',
      handler: async () => {
        const pick = await choose('', 'The tide is fair and the mainland waits. Sail home?', ['Set sail', 'Stay a while']);
        if (pick === 0) {
          this.player.save();
          this.finish({ kind: 'leave' });
        }
      },
    });
  }

  // ---------------- flora & fauna ----------------
  private scatterFlora(): void {
    // palm groves — beach ring and highland clusters
    const palms: [number, number][] = [
      [9, 28], [-10, 27], [14, 24], [-14, 19], [18, 12], [20, 4], [-12, -3],
      [22, 18], [-4, 27], [12, 7], [-20, 14], [-23, 6], [19, -4], [25, 8],
      [-26, -4], [-30, 6], [-28, 18], [-32, -14], [-27, -22], [-18, -28],
      [-8, -22], [2, -26], [10, -24], [20, -22], [34, -22], [36, -14],
      [8, -34], [-2, -36], [18, -36], [30, -38], [-16, -34],
      [30, 14], [33, 4], [28, 24], [-33, 22],
    ];
    for (const [x, z] of palms) this.palm(x, z, 0.12 + Math.random() * 0.3, 3.6 + Math.random() * 1.6);

    // hibiscus and fern clumps
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.colliders.some(cl => Math.hypot(x - cl.pos.x, z - cl.pos.z) < cl.r + 0.6)) continue;
      const y = this.groundH(x, z);
      const g = new THREE.Group();
      if (Math.random() < 0.5) {
        // hibiscus bush
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.45 + Math.random() * 0.25, 8, 6),
          new THREE.MeshStandardMaterial({ map: leafTexture('#3a8a44', '#56b45e', '#26602e', i), roughness: 1 }));
        bush.position.y = 0.35;
        bush.scale.y = 0.8;
        g.add(bush);
        for (let f = 0; f < 3; f++) {
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5),
            new THREE.MeshStandardMaterial({ color: [0xf25a8a, 0xf2a63a, 0xe84a5a][f % 3], roughness: 0.6 }));
          const ba = Math.random() * Math.PI * 2;
          bloom.position.set(Math.cos(ba) * 0.4, 0.5 + Math.random() * 0.2, Math.sin(ba) * 0.4);
          g.add(bloom);
        }
      } else {
        // banana plant
        const frondMat = new THREE.MeshStandardMaterial({ map: leafTexture('#4aa84e', '#72c46a', '#2a743a', i * 3), roughness: 1, side: THREE.DoubleSide });
        for (let f = 0; f < 5; f++) {
          const fa = (f / 5) * Math.PI * 2;
          const frond = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.4 + Math.random() * 0.5, 4), frondMat);
          frond.position.set(Math.cos(fa) * 0.3, 0.7, Math.sin(fa) * 0.3);
          frond.rotation.set(Math.sin(fa) * 0.9, 0, -Math.cos(fa) * 0.9);
          frond.scale.z = 0.25;
          g.add(frond);
        }
      }
      g.position.set(x, y, z);
      this.scene.add(g);
    }

    // shells on the beach
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 37 + Math.random() * 4;
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 5),
        new THREE.MeshStandardMaterial({ color: [0xf2e8d8, 0xf2c4b8, 0xe8d8f2][i % 3], roughness: 0.5 }));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      shell.position.set(x, this.groundH(x, z) + 0.06, z);
      shell.rotation.x = Math.PI / 2.3;
      this.scene.add(shell);
    }

    // a hammock strung between two beach palms
    this.palm(-13, 30, 0.3);
    this.palm(-17, 32, -0.25);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1, 8, 2),
      new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 1, side: THREE.DoubleSide }));
    const arr = net.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) arr[i + 2] = -Math.cos((arr[i] / 3.2) * Math.PI) * 0.3 + 0.3;
    net.position.set(-15, this.groundH(-15, 31) + 1.1, 31);
    net.rotation.x = -Math.PI / 2;
    net.rotation.z = 0.45;
    this.scene.add(net);
  }

  /** The shrine of the First Bond — Aurelia and Cero, remembered in stone. */
  private buildShrine(): void {
    const x = -6, z = 2;
    const y = this.groundH(x, z);
    const g = new THREE.Group();
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 12),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#9a9282', '#6a6254', 2), roughness: 0.9 }));
    dais.position.y = 0.2;
    // Aurelia — a worn stone figure facing the sea
    const aurelia = makeVoxelHuman({ skin: 0xb8ae9a, hair: 0xa8a08a, top: 0x9a9282, bottom: 0x8a8272, shoes: 0x7a7262, cap: null, hairstyle: 'long' });
    aurelia.position.set(-0.4, 0.4, 0);
    aurelia.rotation.y = Math.PI; // facing the southern sea
    aurelia.scale.setScalar(1.1);
    // Cero — a wave-worn guardian shape curled beside her
    const cero = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a96a0', '#5a646e', 2), roughness: 0.8 }));
    cero.scale.set(1.3, 0.8, 1);
    cero.position.set(0.7, 0.7, 0.1);
    const ceroFin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a96a0', '#5a646e', 2), roughness: 0.8 }));
    ceroFin.position.set(0.7, 1.15, 0.1);
    g.add(dais, aurelia, cero, ceroFin);
    // offering: a fresh fish on the stones (the islanders still bring them)
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x9ab8c8, roughness: 0.4 }));
    fish.scale.set(1.8, 0.7, 0.7);
    fish.position.set(0, 0.46, 0.9);
    g.add(fish);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.9 });
    this.label3d('🗿 Shrine of the First Bond', '#d8cfa8', new THREE.Vector3(x, y + 3.4, z), 3.6);
    this.markers.push({ x, z, label: 'Shrine', color: '#d8cfa8', kind: 'poi' });
    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z + 1.2), radius: 2.2,
      label: 'Press <b>E</b> — read the shrine',
      handler: async () => {
        await say('Shrine of the First Bond', 'Seven hundred years ago, on this beach, the fisher-girl Aurelia pulled a storm-wounded Guardian from the surf and nursed it through the monsoon. She asked for nothing. It stayed anyway.');
        await say('Shrine of the First Bond', `${AGDAO_LORE.firstGuardian}`);
        await say('Shrine of the First Bond', 'Every tamer who ever lived — every guild, every bond, every nickname whispered to a Guardian at night — began here, with a girl, a fish basket, and a kindness.');
      },
    });
  }

  private spawnButterflies(): void {
    for (let i = 0; i < 7; i++) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: [0xf2a64e, 0x5ad8e8, 0xf25a8a, 0xfff2a0][i % 4], side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.14), mat);
      const wingR = wingL.clone();
      wingL.position.x = -0.08; wingR.position.x = 0.08;
      grp.add(wingL, wingR);
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 22;
      const anchor = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      anchor.y = this.groundH(anchor.x, anchor.z) + 1 + Math.random();
      grp.position.copy(anchor);
      this.scene.add(grp);
      this.butterflies.push({ grp, anchor, phase: Math.random() * Math.PI * 2, wingL, wingR });
    }
  }

  /** Jungle fireflies — invisible under the sun, drifting embers after dark. */
  private spawnFireflies(): void {
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd8ffa8, emissive: 0xbef27a, emissiveIntensity: 0, transparent: true, opacity: 0,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat);
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 26;
      const anchor = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      anchor.y = this.groundH(anchor.x, anchor.z) + 0.7 + Math.random() * 0.9;
      mesh.position.copy(anchor);
      this.scene.add(mesh);
      this.fireflies.push({ mesh, anchor, phase: Math.random() * Math.PI * 2 });
    }
  }

  private driftClouds(): void {
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, depthWrite: false });
      for (let pIdx = 0; pIdx < 3 + Math.floor(Math.random() * 3); pIdx++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2.4, 10, 8), mat);
        puff.position.set((Math.random() - 0.5) * 7, Math.random(), (Math.random() - 0.5) * 4);
        puff.scale.y = 0.5;
        cl.add(puff);
      }
      cl.position.set((Math.random() - 0.5) * 140, 26 + Math.random() * 10, (Math.random() - 0.5) * 140);
      this.scene.add(cl);
      this.clouds.push(cl);
    }
  }

  // ================= the islanders =================
  private villager(opts: VoxelHumanOpts, x: number, z: number, faceTo: [number, number],
    name: string, label: string, handler: () => Promise<void>): THREE.Group {
    const g = makeVoxelHuman(opts);
    const y = this.groundH(x, z);
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(faceTo[0] - x, faceTo[1] - z);
    tagNpc(g, name === 'Bayan' ? 'Fisher Bayan' : name);
    this.scene.add(g);
    this.npcs.push(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
    this.interactables.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.8, label: `Press <b>E</b> — ${label}`, handler });
    this.label3d(name, '#e8d9a8', new THREE.Vector3(x, y + 2.5, z), 2.4);
    return g;
  }

  private placeVillagers(): void {
    const p = this.player;

    // 1 — Fisher Bayan, on the pier. The first link in the chain.
    this.villager({ top: 0x3a8ad9, hair: 0x1a1a2e, cap: 0xe8d9a8, hairstyle: 'classic' }, 1.8, 32, [0, 38],
      'Bayan', 'talk to Fisher Bayan', async () => {
        if (!p.flags['met_greggy']) {
          await conversation([
            ['Fisher Bayan', `New face! Off the mainland boat, are you? Welcome to Agdao — mind the gulls, they've learned to open bags.`],
            ['Fisher Bayan', `Looking for someone? Hah, everyone who comes here is looking for someone. If it's the old thunder-fellow you mean — the one who buys ALL my hooks and bends them into little coils — talk to Mama Imee by the First Fire. She feeds him. She feeds everyone.`],
          ]);
          p.flags['agdao_hint1'] = true;
          p.save();
        } else {
          await say('Fisher Bayan', 'The hermit bought my whole hook basket again this morning. Bent every one into a coil before he reached the gate. Some folk whittle. He... coils.');
        }
      });

    // 2 — Mama Imee, by the fire pit.
    this.villager({ top: 0xd87a4e, hair: 0x4a3a2a, cap: null, hairstyle: 'buns' }, 2.2, 9, [0, 8],
      'Mama Imee', 'talk to Mama Imee', async () => {
        if (!p.flags['met_greggy']) {
          await conversation([
            ['Mama Imee', `Sit, sit! You look like you walked off a chart. Stew's not ready, but questions are free.`],
            ['Mama Imee', `The storm man? Aye, I feed him — he eats like a thundercloud, just as the stories say. But where he ROOSTS is not mine to give away. That's the Elder's call. Elder Toto, in the long hut — the Circle of the First Fire. Oldest guild in all the world, and don't let him catch you doubting it.`],
          ]);
          p.flags['agdao_hint2'] = true;
          p.save();
        } else {
          await say('Mama Imee', 'You found him then! Tell him his bowl is still here. He KNOWS we don\'t wash a guest\'s bowl until they\'ve eaten from it again. Island rules.');
        }
      });

    // 3 — Elder Toto, before the long hut. He opens the way.
    this.villager({ top: 0xf2a64e, hair: 0xd8d8d8, cap: null, hairstyle: 'bald', robe: true }, 11.5, 1.6, [0, 8],
      'Elder Toto', 'speak with Elder Toto of the First Fire', async () => {
        if (!p.flags['agdao_elder']) {
          await conversation([
            ['Elder Toto', `Mmm. Mainland boots, guild colors, and that particular lean of someone carrying a question too big for their pockets. Veyl sent you, or I'm a mackerel.`],
            ['Elder Toto', `Seven hundred years ago, on this very sand, Aurelia made the First Bond. Our Circle has kept her fire since — while the world built its grand houses and its grander wars. We are forty members. We have never needed forty-one. Perspective, young tamer.`],
            ['Elder Toto', `The one you seek came to us nine years ago, asking to be NOT found. We respect that. But he told me once: "If a young one ever comes asking, with storm-amber on their hands and Veyl's ink on their map — that one, let through."`],
            ['Elder Toto', `So. Through the LEFT GATE, west of the village — tell Liko I sent you. Follow the cliff path north, then east along the ridge top. The bluff with the copper spear. Go and meet your legend, child. They're heavier in person.`],
          ]);
          p.flags['agdao_elder'] = true;
          p.save();
          toast('🗺️ Elder Toto\'s word opens the Left Gate — speak to Liko!', 'gold');
        } else if (!p.flags['met_greggy']) {
          await say('Elder Toto', 'The Left Gate, west side. Liko has my word. North up the cliff path, then east along the top. And child — knock. Even legends startle.');
        } else if (p.flags['arc1_done']) {
          await say('Elder Toto', 'The fire leaned all night, the night you silenced that spire. Aurelia\'s flame remembers its kin. Whatever door opens next, tamer — the Circle\'s fire will be lit behind you.');
        } else {
          await say('Elder Toto', 'He talks about you, you know. The hermit. Two words at a time, which from him is a eulogy.');
        }
      });

    // 4 — Gatekeeper Liko, at the Left Gate.
    this.villager({ top: 0x4aa84e, hair: 0x2a2a3a, cap: 0xc4822a, hairstyle: 'spiky' }, -14.8, 2.1, [-18, 2],
      'Liko', 'talk to Gatekeeper Liko', async () => {
        if (this.gateCollider && !p.flags['agdao_gate_open']) {
          if (p.flags['agdao_elder']) {
            await conversation([
              ['Gatekeeper Liko', `Elder's word? Elder's word! That's the first time in four years I get to do the ceremonial gate-opening. I PRACTICED for this.`],
              ['Gatekeeper Liko', `Ahem. "By flame first lit and bond first made — pass, friend of the Circle." ...Was that good? I added the pause myself.`],
            ]);
            p.flags['agdao_gate_open'] = true;
            p.save();
            this.openGateDoors();
            await say('Gatekeeper Liko', 'Cliff path north, then east along the ridge. If you hear humming, that\'s the rod. If you hear GRUMBLING, that\'s him. Good luck!');
          } else {
            await say('Gatekeeper Liko', 'Sorry, friend — the north paths open on the Elder\'s word only. Old rule, older than me. Elder Toto keeps the long hut by the fire pit.');
          }
        } else {
          await say('Gatekeeper Liko', 'Gate\'s open, path\'s clear, weather\'s holding. Best day of gatekeeping I\'ve had in years, honestly.');
        }
      });

    // 5 — Weaver Nita, among the huts. Lore of Aurelia.
    this.villager({ top: 0xe85a8a, hair: 0x6a3a1a, cap: null, hairstyle: 'long' }, -8.5, 10.5, [0, 8],
      'Weaver Nita', 'talk to Weaver Nita', async () => {
        await say('Weaver Nita', 'Every sail on this island carries one orange thread — for Aurelia. Mainlanders think taming was invented in a university. We let them think it. The sea knows where kindness started.');
        if (p.flags['daughters_known']) {
          await say('Weaver Nita', 'The Dawnflame\'s girls used to summer here when they were small, did you know? Azrin broke her arm jumping off OUR waterfall. Azrael calculated the safe angle first and jumped anyway. Family.');
        }
      });

    // 6 — Pol's fruit stall: island prices, island kindness.
    this.villager({ top: 0xe8d44e, hair: 0x2a2a3a, cap: 0x4aa84e, hairstyle: 'curly' }, 5, 14, [6, 15.5],
      'Pol', 'browse Pol\'s fruit stall', async () => {
        while (true) {
          const stock: [string, number][] = [['berry', 22], ['honey_roll', 65], ['cell', 42]];
          const pick = await choose('Fruit-Seller Pol',
            `Island-grown, sun-sweet, half what the mainland gouges you! You hold ◆${p.shards}.`,
            [...stock.map(([id, cost]) => `${ITEMS[id].name} — ◆${cost}`), 'Just looking']);
          if (pick >= stock.length) return;
          const [id, cost] = stock[pick];
          if (p.shards < cost) { await say('Fruit-Seller Pol', 'Ah — light pockets. Take a sniff for free, the smell\'s the best part.'); continue; }
          if (!p.addItem(id)) { await say('Fruit-Seller Pol', 'Your hold\'s full, friend! Eat something first.'); continue; }
          p.shards -= cost;
          sfx('confirm');
          toast(`Bought ${ITEMS[id].name}!`, 'gold');
          updateHUD(p, 'Agdao Island');
        }
      });

    // 7 — the twins by the waterfall pool.
    this.villager({ top: 0x5ad8e8, hair: 0x1a1a2e, cap: null, hairstyle: 'spiky' }, 2, -5.5, [4, -8],
      'Kiko', 'talk to Kiko', async () => {
        await say('Kiko', 'Me and Mai dared each other to touch the cave on the east beach. The water there is TOO flat. Flat like it\'s pretending. We ran away and we\'re not sorry.');
      });
    this.villager({ top: 0xf2a63a, hair: 0x1a1a2e, cap: null, hairstyle: 'buns' }, 3.4, -4.8, [4, -8],
      'Mai', 'talk to Mai', async () => {
        await say('Mai', 'The thunder man caught me sneaking up his cliff once. He didn\'t shout. He just pointed at the sky, and the sky went BOOM, and I decided I had chores. He\'s nice though. He waves at boats.');
      });

    // 8 — Old Sela on the high path, halfway to the bluff.
    this.villager({ top: 0x8a93a8, hair: 0xd8d8d8, cap: null, hairstyle: 'long' }, -24, -22, [-22, -26],
      'Old Sela', 'talk to Old Sela', async () => {
        await say('Old Sela', 'Up here for the view, or for HIM? Either way: east, along the ridge top, past the three crooked palms. I watch the storms come in. He watches something further away than storms.');
      });

    // 9 — Dario of the Circle, near the guild hall.
    this.villager({ top: 0xc4822a, hair: 0x6a3a1a, cap: null, hairstyle: 'ponytail' }, 15.5, 3, [13, -1],
      'Dario', 'talk to Dario of the Circle', async () => {
        await say('Dario of the Circle', 'Mainlanders always ask: "only forty members?" Friend, the Pearlwake Compact has nine thousand and their guildhall is a FLEET. The Duneward Assembly disarms war-engines with their bare hands. Guilds come in every size the Compact allows.');
        await say('Dario of the Circle', 'Ours is just the oldest. When your five Grand Houses were foundation stones, our fire was already six hundred years warm. We don\'t brag. The fire brags for us.');
      });
  }

  // ================= GREGGY =================
  private placeGreggy(): void {
    const p = this.player;
    const x = 26, z = -27.5;
    const y = this.groundH(x, z);
    const greggy = makeVoxelHuman({
      skin: 0xc8956a, hair: 0xb8b8c0, top: 0xc4a32a, bottom: 0x3a3a4e, shoes: 0x2a2a36,
      cap: null, hairstyle: 'spiky', robe: true,
    });
    greggy.position.set(x, y, z);
    greggy.rotation.y = Math.PI * 0.85; // gazing south-west, over his island
    greggy.scale.setScalar(1.08);
    tagNpc(greggy, 'Greggy the Stormheart');
    this.scene.add(greggy);
    this.npcs.push(greggy);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.6 });
    this.label3d('⚡ Greggy the Stormheart', '#f2d23a', new THREE.Vector3(x, y + 2.9, z), 3.6);

    // Fulgrath coils in the grass beside him; Raijura rides the roof ridge
    const fulDef = LEGENDS[1].guardians[2];
    const ful = makeCustomCreature(fulDef.archetype, fulDef.palette, fulDef.glow, fulDef.scale * 0.55, true);
    ful.group.position.set(x - 2.2, this.groundH(x - 2.2, z + 1), z + 1);
    ful.group.rotation.y = Math.PI / 2;
    this.scene.add(ful.group);
    this.rigs.push(ful);
    const raiDef = LEGENDS[1].guardians[0];
    const rai = makeCustomCreature(raiDef.archetype, raiDef.palette, raiDef.glow, raiDef.scale * 0.55, true);
    rai.group.position.set(28, this.groundH(28, -30) + 4.3, -30);
    rai.group.rotation.y = Math.PI;
    this.scene.add(rai.group);
    this.rigs.push(rai);

    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z), radius: 2.4,
      label: 'Press <b>E</b> — speak with the Stormheart',
      handler: async () => this.greggyTalk(p, greggy),
    });
  }

  private async greggyTalk(p: Player, greggy: THREE.Group): Promise<void> {
    // face the player
    const d = this.tamer.position.clone().sub(greggy.position);
    greggy.rotation.y = Math.atan2(d.x, d.z);

    // ---- first meeting: Chapter IV turn-in, Chapter V hook ----
    if (!p.flags['met_greggy']) {
      sfx('zap');
      this.vfx.bolt(greggy.position.clone().add(new THREE.Vector3(0, 9, 0)), greggy.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 0xfff2a0, { life: 0.3, jitter: 0.4 });
      await conversation([
        ['???', `Took you long enough. The amber lit up on Veyl's desk nine days ago — I felt it from here. Yes, I can do that. No, I won't explain it.`],
        ['Greggy the Stormheart', `So. ${p.tamerName}, isn't it? Hale radios me about every graduate worth radioing about, and Veyl doesn't hand his sea-chart to people he expects to drown. I was expecting you. Sit. Mind the serpent — Fulgrath pretends to sleep, badly.`],
        ['Greggy the Stormheart', `Nine years I've roosted on this rock. Closest land in the world to where Ghandra's seal sits folded, did you know that? I listen to it the way Bayan listens to his fishing line. And lately, tamer... lately something is nibbling.`],
        ['Greggy the Stormheart', `You'll want stories about the war. Everyone does. Here's the only one that matters today: a seal woven from trust frays wherever trust was FIRST woven. The Cradle Hollow — Aurelia's own sea-cave, down under my bluff — has something Legion-touched nested in it. In the gentlest place in the world. That's not chance. That's strategy.`],
      ]);
      p.flags['met_greggy'] = true;
      const summary = completeQuest(p, 'story_agdao');
      toast('✅ Chapter IV complete: The Cradle of Tamers!', 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      const notes = syncStoryQuests(p);
      notes.forEach(n => toast(n, 'gold'));
      await conversation([
        ['Greggy the Stormheart', `I'm too loud to go down there — the corruption would hear my static an island away and burrow deeper. You're new. You're quiet. The seal on the cave mouth will part for you now; I've asked it nicely.`],
        ['Greggy the Stormheart', `Cleanse the Hollow, and when you come back I'll tell you something Veyl's charts don't know. About Aljay. About his FAMILY. Fair trade? Fair trade. Off you go — east beach, below the bluff. And tamer... pack tonics. The nest-warden is a grown one.`],
      ]);
      updateHUD(p, 'Agdao Island');
      return;
    }

    // ---- Chapter V turn-in: the Hollow cleansed → the daughters revealed ----
    if (questState(p, 'story_cradle') === 'ready') {
      await conversation([
        ['Greggy the Stormheart', `The water below changed color an hour ago — back to the blue it's supposed to be. The whole island felt it. Mama Imee is making you a stew with your name carved into the bowl, I'm told. Island rules.`],
        ['Greggy the Stormheart', `You did well, tamer. Better than well. So — payment. The thing I know that the charts don't.`],
        ['Greggy the Stormheart', `Aljay has two daughters. Azrin and Azrael. Tamers, both — real ones, sharper at their age than their father was at his, and if you ever tell them I said that, Fulgrath will find you.`],
        ['Greggy the Stormheart', `They've been chasing the same wrongness you just scrubbed out of the Cradle — across three continents, two oceans, and one extremely confused customs office in Tharkand. I sent them a storm-petrel the day Veyl's amber lit. They're already in Haven City. By the fountain. Waiting for YOU, specifically.`],
        ['Greggy the Stormheart', `Take this — I wound it myself. When you stand before something that hums, it will hum back. You'll know what that means when it matters.`],
      ]);
      const summary = completeQuest(p, 'story_cradle');
      p.flags['daughters_known'] = true;
      toast('✅ Chapter V complete: The First Hollow!', 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      syncStoryQuests(p).forEach(n => toast(n, 'gold'));
      await say('Greggy the Stormheart', 'Go and meet the Dawnflame\'s fire — both colors of it. And mind Azrin\'s handshake. She doesn\'t know her own grip.');
      updateHUD(p, 'Agdao Island');
      return;
    }
    if (questState(p, 'story_cradle') === 'active') {
      await say('Greggy the Stormheart', 'The Hollow still tastes wrong from up here — like a held breath. East beach, below the bluff. The mouth will open for you. Tonics, tamer. TONICS.');
      return;
    }

    // ---- Chapter VII turn-in: the Stormspire silenced ----
    if (questState(p, 'story_echoes') === 'ready') {
      sfx('boom');
      this.vfx.shake(0.18, 0.6);
      await conversation([
        ['Greggy the Stormheart', `I heard it stop. Twenty years that engine has been counting in the back of my skull like a dripping tap — and last night, for the first time, the world went QUIET. You magnificent, terrifying graduate.`],
        ['Greggy the Stormheart', `Now tell me the engine's last word. The girls said you'd know it. Say it slowly.`],
        [p.tamerName, `...It wasn't a word. It was a name. The engine was answering to "ALJAY".`],
        ['Greggy the Stormheart', `...Fulgrath. Wake up. Properly.`],
        ['Greggy the Stormheart', `Fifteen years ago, nine of us walked out of Ghandra and one stayed at the door — that's the part the songs get wrong, tamer. Aljay walks BACK to the seal, every few years, alone, to feed it. Trust must be renewed. He never let us share the cost. Stubborn, glorious idiot.`],
        ['Greggy the Stormheart', `If the Legion's engines are answering to his name, then either my best friend is standing at the seal right now, holding it shut with his bare hands... or something inside has learned to wear his voice. Either way — EITHER way — the next door we open is Ghandra's.`],
        ['Greggy the Stormheart', `Not today. Today you rest, and eat Imee's stew, and let an old man write three letters. But soon, ${p.tamerName}. The coil I gave you, Azrael's lantern, Azrin's fire and one quiet graduate the Legion never saw coming. When the petrel finds you — come. We go together. All of us.`],
      ]);
      const summary = completeQuest(p, 'story_echoes');
      toast('✅ Chapter VII complete: Echoes of Ghandra!', 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      toast('📖 The Chronicle — Arc One complete. Ghandra waits…', 'gold');
      syncStoryQuests(p).forEach(n => toast(n, 'gold'));
      updateHUD(p, 'Agdao Island');
      return;
    }
    if (questState(p, 'story_echoes') === 'active') {
      await say('Greggy the Stormheart', 'The spire, tamer. Far east on the overworld, five floors down, a war-engine with very bad manners. Silence it, hear its last word, and bring that word to me. The girls will mind the continent.');
      return;
    }
    if (questState(p, 'story_daughters') === 'active') {
      await say('Greggy the Stormheart', 'Haven City. The fountain. Two tamers who look like sunrise and midnight respectively. They\'re waiting for you — and Azrin gets IDEAS when she waits. Hurry along.');
      return;
    }

    // ---- post-arc / fallback ----
    if (p.flags['arc1_done']) {
      await say('Greggy the Stormheart', 'Three letters written. Two petrels sent. One stew eaten — yours is still warm at Imee\'s, island rules. Rest while the resting\'s good, tamer. The next chapter knocks when it knocks.');
    } else {
      await say('Greggy the Stormheart', 'The sea\'s in a good mood today. Enjoy it. Moods change.');
    }
  }

  // ================= per-frame =================
  private update(dt: number): void {
    if (!this.resolveExit) return;
    this.t += dt;
    this.vfx.update(dt);
    this.dayNight?.update(dt);
    for (const f of this.envTick) f(dt);

    const speed = 5.2;
    let dx = 0, dz = 0;
    if (!isDialogueOpen() && !isMenuOpen() && !this.busy) {
      if (this.keys.has('w') || this.keys.has('arrowup')) dz -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dz += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    }
    this.walking = !!(dx || dz);
    if (this.walking) {
      const len = Math.hypot(dx, dz);
      const nx = this.tamer.position.x + (dx / len) * speed * dt;
      const nz = this.tamer.position.z + (dz / len) * speed * dt;
      const free = (x: number, z: number) =>
        Math.hypot(x, z) <= WALK_R &&
        !this.colliders.some(cl => Math.hypot(x - cl.pos.x, z - cl.pos.z) < cl.r);
      // the pier extends past the surf line
      const onPier = (x: number, z: number) => Math.abs(x) < 1.2 && z > 30 && z < 45.5;
      const ok = (x: number, z: number) => free(x, z) || onPier(x, z);
      if (ok(nx, nz)) { this.tamer.position.x = nx; this.tamer.position.z = nz; }
      else if (ok(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (ok(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz);
    }
    const onPierNow = Math.abs(this.tamer.position.x) < 1.3 && this.tamer.position.z > 30;
    this.tamer.position.y = onPierNow
      ? Math.max(this.groundH(this.tamer.position.x, this.tamer.position.z), 0.46)
      : this.groundH(this.tamer.position.x, this.tamer.position.z);
    updateVoxelHuman(this.tamer, this.walking, dt);
    this.npcs.forEach(npc => updateVoxelHuman(npc, false, dt));

    // butterflies flutter by day, fireflies rise at night, clouds drift
    const daylight = worldClock.daylight, night = worldClock.night;
    for (const b of this.butterflies) {
      b.phase += dt;
      b.grp.position.set(
        b.anchor.x + Math.sin(b.phase * 0.7) * 1.6,
        b.anchor.y + Math.sin(b.phase * 1.3) * 0.5,
        b.anchor.z + Math.cos(b.phase * 0.9) * 1.6,
      );
      b.grp.rotation.y = b.phase * 0.7;
      b.wingL.rotation.z = Math.sin(b.phase * 14) * 0.9;
      b.wingR.rotation.z = -Math.sin(b.phase * 14) * 0.9;
      b.grp.visible = daylight > 0.15; // butterflies sleep at night
    }
    for (const f of this.fireflies) {
      const ph = f.phase + this.t * 0.5;
      f.mesh.position.set(
        f.anchor.x + Math.sin(ph * 1.1) * 1.5,
        f.anchor.y + Math.sin(ph * 1.9) * 0.5,
        f.anchor.z + Math.cos(ph * 0.8) * 1.5,
      );
      const m = f.mesh.material as THREE.MeshStandardMaterial;
      const blink = 0.5 + Math.sin(this.t * 3.1 + f.phase * 5) * 0.5;
      m.opacity = night * 0.95;
      m.emissiveIntensity = night * (0.6 + blink * 1.8);
      f.mesh.visible = night > 0.1;
    }
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.7;
      if (cl.position.x > 110) cl.position.x = -110;
    }

    // camera
    const t = this.tamer.position;
    const camGoal = new THREE.Vector3(t.x, t.y + 7.5, t.z + 9);
    worldOrbit.update(dt);
    const lookT = new THREE.Vector3(t.x, t.y + 1, t.z);
    this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 4));
    this.camera.position.add(this.vfx.shakeOffset);
    this.camera.lookAt(lookT);

    // interact hint
    if (isDialogueOpen() || isMenuOpen() || this.busy) { showInteractHint(null); }
    else {
      const near = this.interactables.find(i => Math.hypot(t.x - i.pos.x, t.z - i.pos.z) < i.radius);
      showInteractHint(near ? near.label : null);
    }

    // minimap
    drawAreaMap($('minimap') as unknown as HTMLCanvasElement, {
      shape: 'circle', radius: 46,
      markers: this.markers,
      player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
      title: `🏝️ Agdao Island — ${worldClock.label}`,
      playerState: this.player,
    });
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, 'Agdao Island');
      this.busy = false;
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;
    if (k === 'e' || k === 'enter') {
      const t = this.tamer.position;
      const near = this.interactables.find(i => Math.hypot(t.x - i.pos.x, t.z - i.pos.z) < i.radius);
      if (near) {
        this.busy = true;
        Promise.resolve(near.handler()).finally(() => { this.busy = false; });
      }
    }
    else if (k === 'p') this.openPanelGuarded('player');
    else if (k === 'i') this.openPanelGuarded('inventory');
    else if (k === 'g') this.openPanelGuarded('guardians');
    else if (k === 'c') this.openPanelGuarded('crawler');
    else if (k === 'j') this.openPanelGuarded('quests');
    else if (k === 'v') this.openPanelGuarded('evotree');
    else if (k === 'escape') {
      this.busy = true;
      openPauseMenu(this.player, { canSave: true }).then(() => {
        updateHUD(this.player, 'Agdao Island');
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  private detachPicker: (() => void) | null = null;

  private finish(result: AgdaoResult): void {
    hideAreaMap($('minimap') as unknown as HTMLCanvasElement);
    showInteractHint(null);
    showHotkeys(false);
    this.detachPicker?.();
    this.detachPicker = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.rigs.forEach(disposeRig);
    this.vfx.dispose();
    this.dayNight?.dispose();
    this.resolveExit?.(result);
    this.resolveExit = null;
  }

  run(): Promise<AgdaoResult> {
    this.buildScene();
    this.player.savedLocation = { type: 'agdao', spawnAt: this.spawnAt };
    updateTamerAppearance(this.tamer, this.player.equippedClothes);
    syncStoryQuests(this.player).forEach(n => toast(n, 'gold'));
    updateHUD(this.player, 'Agdao Island');
    showHotkeys(true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.npcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy,
    });
    if (!this.player.flags['agdao_arrived']) {
      this.player.flags['agdao_arrived'] = true;
      this.player.save();
      say('', '🏝️ Agdao Island — the Cradle of Tamers. Salt, woodsmoke and seven hundred years of kept promises. The villagers are already waving.');
    }
    return new Promise<AgdaoResult>(res => { this.resolveExit = res; });
  }
}
