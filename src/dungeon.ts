// ============================================================
// AZ Tamer — dungeon mode: procedural floors, Crawler driving,
// minimap fog-of-war, chests/traps/crystals, encounters, boss.
// Every dungeon theme has its own stone, light and life:
//   cavern  — amber torch-rock, stalagmites, drifting dust
//   mossdeep— green burrows, glow-shrooms, spore-light
//   vault   — drowned masonry, broken columns, rising bubbles
//   storm   — war-spire plating, conduit pylons, arcing current
// ============================================================
import * as THREE from 'three';
import { ITEMS, type DungeonDef } from './data';
import { Player } from './state';
import {
  makeCrawler, stoneTexture, skyGradient, tween, Ease,
  caveRockTexture, drownedBrickTexture, stormPanelTexture, stormSeamEmissive,
} from './models';
import { VFX } from './vfx';
import { sfx } from './audio';
import { say, choose, toast, updateHUD, showInteractHint, showHotkeys, isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, type PanelKind, playStorySequence, hideStory } from './ui';
import { worldOrbit } from './camorbit';
import type { BattleOptions, BattleResult } from './battle';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export type DungeonOutcome = 'cleared' | 'retreat' | 'dead';

type Tile = 'wall' | 'floor' | 'chest' | 'trap' | 'crystal' | 'stairs' | 'boss' | 'exit';

interface FloorMap {
  w: number; h: number;
  tiles: Tile[][];
  seen: boolean[][];
  start: { x: number; y: number };
}

export interface DungeonCtx {
  player: Player;
  runBattle(specs: { speciesId: string; level: number }[], opts: BattleOptions): Promise<BattleResult>;
}

const SIZE = 21;

function genFloor(rng: () => number, isLast: boolean, hasBoss: boolean): FloorMap {
  const t: Tile[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill('wall' as Tile));
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const carve = (x: number, y: number) => { if (x > 0 && y > 0 && x < SIZE - 1 && y < SIZE - 1) t[y][x] = 'floor'; };

  for (let i = 0; i < 7; i++) {
    const w = 3 + Math.floor(rng() * 4), h = 3 + Math.floor(rng() * 4);
    const x = 1 + Math.floor(rng() * (SIZE - w - 2)), y = 1 + Math.floor(rng() * (SIZE - h - 2));
    rooms.push({ x, y, w, h });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy);
  }
  // connect room centers with L corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    const ax = a.x + (a.w >> 1), ay = a.y + (a.h >> 1);
    const bx = b.x + (b.w >> 1), by = b.y + (b.h >> 1);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
  }

  const floors: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (t[y][x] === 'floor') floors.push({ x, y });
  const take = (): { x: number; y: number } => floors.splice(Math.floor(rng() * floors.length), 1)[0];

  const start = { x: rooms[0].x + (rooms[0].w >> 1), y: rooms[0].y + (rooms[0].h >> 1) };
  t[start.y][start.x] = 'exit';
  const fi = floors.findIndex(f => f.x === start.x && f.y === start.y);
  if (fi >= 0) floors.splice(fi, 1);

  // goal: farthest room center gets stairs or boss
  const last = rooms[rooms.length - 1];
  const goal = { x: last.x + (last.w >> 1), y: last.y + (last.h >> 1) };
  t[goal.y][goal.x] = isLast ? (hasBoss ? 'boss' : 'exit') : 'stairs';
  const gi = floors.findIndex(f => f.x === goal.x && f.y === goal.y);
  if (gi >= 0) floors.splice(gi, 1);

  const place = (tile: Tile, n: number) => {
    for (let i = 0; i < n && floors.length; i++) { const p = take(); t[p.y][p.x] = tile; }
  };
  place('chest', 3 + Math.floor(rng() * 2));
  place('trap', 3 + Math.floor(rng() * 3));
  place('crystal', 2);

  return {
    w: SIZE, h: SIZE, tiles: t,
    seen: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
    start,
  };
}

// ---------------- theme definitions ----------------
type DecoKind = 'stalagmite' | 'crystal' | 'mushroom' | 'fern' | 'column' | 'coins' | 'algae' | 'pylon' | 'shard' | 'rubble';

interface ThemeDef {
  wall(): THREE.MeshStandardMaterial;
  floor(): THREE.MeshStandardMaterial;
  sky: [string, string];
  fog: string; fogNear: number; fogFar: number;
  hemi: [number, number]; hemiIntensity: number;
  dir: number; dirIntensity: number;
  headlight: number;          // crawler lamp color
  accent: number;             // crystals / seams / deco glow
  mote: { color: number; count: number; mode: 'drift' | 'rise' | 'spark' };
  decos: DecoKind[];
}

const THEMES: Record<string, ThemeDef> = {
  cavern: {
    wall: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#4a4258', '#363048', '#221c30', 21, 1), roughness: 0.92 }),
    floor: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#332e44', '#262238', '#1a1626', 33, 7), roughness: 0.96 }),
    sky: ['#141022', '#05060c'],
    fog: '#08060f', fogNear: 6, fogFar: 19,
    hemi: [0x6a5a8a, 0x2a2438], hemiIntensity: 0.5,
    dir: 0xc4a86a, dirIntensity: 0.45,
    headlight: 0xffd9a0,
    accent: 0xf2b46a,
    mote: { color: 0xc4ae8a, count: 160, mode: 'drift' },
    decos: ['stalagmite', 'crystal', 'rubble', 'stalagmite'],
  },
  mossdeep: {
    wall: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#3e5a44', '#2c4232', '#1c2c20', 13, 1), roughness: 0.95 }),
    floor: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#2c4030', '#223426', '#16241a', 47, 7), roughness: 0.96 }),
    sky: ['#10241a', '#04080a'],
    fog: '#06120c', fogNear: 6, fogFar: 20,
    hemi: [0x5a8a6a, 0x1c2c20], hemiIntensity: 0.6,
    dir: 0x8ac49a, dirIntensity: 0.4,
    headlight: 0xd8ffc8,
    accent: 0x5ee4a8,
    mote: { color: 0x8ae4a0, count: 200, mode: 'rise' },
    decos: ['mushroom', 'fern', 'stalagmite', 'mushroom'],
  },
  vault: {
    wall: () => new THREE.MeshStandardMaterial({ map: drownedBrickTexture('#2e4a5a', '#16242e', 'rgba(74,164,116,1)', 77, 1), roughness: 0.6 }),
    floor: () => new THREE.MeshStandardMaterial({ map: drownedBrickTexture('#1e3242', '#101c26', 'rgba(58,138,96,1)', 91, 6), roughness: 0.5 }),
    sky: ['#0a1c2c', '#030a12'],
    fog: '#041018', fogNear: 6, fogFar: 19,
    hemi: [0x4a8ab0, 0x12202c], hemiIntensity: 0.55,
    dir: 0x6ab8c4, dirIntensity: 0.5,
    headlight: 0xa0e8ff,
    accent: 0x5ad8c4,
    mote: { color: 0x9ae4d8, count: 240, mode: 'rise' },
    decos: ['column', 'coins', 'algae', 'column'],
  },
  // Thunderfen Mire — a lightning-struck bog: black peat, dead green
  // water-light, fireflies rising off the marsh gas.
  thunderfen: {
    wall: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#3a4434', '#2a3226', '#181e14', 61, 1), roughness: 0.95 }),
    floor: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#262e22', '#1c2418', '#121810', 73, 7), roughness: 0.9 }),
    sky: ['#18241c', '#05080a'],
    fog: '#0a120c', fogNear: 6, fogFar: 18,
    hemi: [0x6a8a6a, 0x1c241c], hemiIntensity: 0.5,
    dir: 0x9ab87a, dirIntensity: 0.4,
    headlight: 0xd8ffd0,
    accent: 0x7ae4d8,
    mote: { color: 0xb8e47a, count: 220, mode: 'rise' },
    decos: ['fern', 'algae', 'crystal', 'pylon', 'fern'],
  },
  // Cradle Hollow — Aurelia's sea-cave: turquoise stone, warm
  // sun-shafts through the ceiling, the lagoon breathing below.
  cradle: {
    wall: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#2e5a58', '#224442', '#142a2a', 39, 1), roughness: 0.85 }),
    floor: () => new THREE.MeshStandardMaterial({ map: caveRockTexture('#1e4240', '#163230', '#0e2020', 53, 7), roughness: 0.85 }),
    sky: ['#0c2c2a', '#031010'],
    fog: '#06201e', fogNear: 6, fogFar: 21,
    hemi: [0x5ab8a8, 0x123230], hemiIntensity: 0.65,
    dir: 0xffd9a0, dirIntensity: 0.55,
    headlight: 0xffeac0,
    accent: 0xffc46a,
    mote: { color: 0x9af2e4, count: 260, mode: 'rise' },
    decos: ['crystal', 'coins', 'algae', 'fern', 'column'],
  },
  // The Mirrorhouse — Foretales' relay-bastion: black glass, dead-light
  // conduits, the cold flicker of a print floor that never sleeps.
  mirrorhouse: {
    wall: () => new THREE.MeshStandardMaterial({
      map: stormPanelTexture('#2a2a34', '#101018', 41, 1),
      emissiveMap: stormSeamEmissive('#c8d2ff', 41, 1),
      emissive: new THREE.Color(0xc8d2ff), emissiveIntensity: 0.5,
      roughness: 0.25, metalness: 0.6,
    }),
    floor: () => new THREE.MeshStandardMaterial({
      map: stormPanelTexture('#1c1c26', '#0c0c14', 57, 6),
      emissiveMap: stormSeamEmissive('#8a5af2', 57, 6),
      emissive: new THREE.Color(0x8a5af2), emissiveIntensity: 0.4,
      roughness: 0.3, metalness: 0.5,
    }),
    sky: ['#14141e', '#04040a'],
    fog: '#08070f', fogNear: 6, fogFar: 18,
    hemi: [0x8a8ab0, 0x14141e], hemiIntensity: 0.5,
    dir: 0xd8e0ff, dirIntensity: 0.55,
    headlight: 0xe8ecff,
    accent: 0xb18aff,
    mote: { color: 0xd8e0ff, count: 130, mode: 'spark' },
    decos: ['pylon', 'shard', 'rubble', 'shard'],
  },
  storm: {
    wall: () => new THREE.MeshStandardMaterial({
      map: stormPanelTexture('#3e3a52', '#1e1a30', 5, 1),
      emissiveMap: stormSeamEmissive('#9a7af2', 5, 1),
      emissive: new THREE.Color(0x9a7af2), emissiveIntensity: 0.55,
      roughness: 0.5, metalness: 0.4,
    }),
    floor: () => new THREE.MeshStandardMaterial({
      map: stormPanelTexture('#28243a', '#141020', 17, 6),
      emissiveMap: stormSeamEmissive('#6a5ac8', 17, 6),
      emissive: new THREE.Color(0x6a5ac8), emissiveIntensity: 0.45,
      roughness: 0.55, metalness: 0.35,
    }),
    sky: ['#1c1830', '#08060f'],
    fog: '#0a0716', fogNear: 6, fogFar: 20,
    hemi: [0x7a6ab8, 0x1c1830], hemiIntensity: 0.55,
    dir: 0xb8a8f2, dirIntensity: 0.5,
    headlight: 0xc8b8ff,
    accent: 0x9a7af2,
    mote: { color: 0x8a7ae4, count: 150, mode: 'spark' },
    decos: ['pylon', 'shard', 'rubble', 'pylon'],
  },
};

export class DungeonRun {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 60);
  private vfx = new VFX(this.scene);
  private map!: FloorMap;
  private floorNum = 1;
  private crawler!: THREE.Group; // built in the constructor from the player's customized parts
  private crawlerLight = new THREE.PointLight(0xffd9a0, 26, 11);
  private pos = { x: 0, y: 0 };
  private moving = false;
  private facing = 0;
  private stepsToEncounter = 0;
  private keys = new Set<string>();
  private tileGroup = new THREE.Group();
  private decoGroup = new THREE.Group();
  private decoMeshes = new Map<string, THREE.Object3D>();
  private finished: ((o: DungeonOutcome) => void) | null = null;
  private busy = false;
  private trialSteps = 0;
  private bigMapOpen = false;
  private anim: ((dt: number) => void)[] = [];
  private envT = 0;
  private theme: ThemeDef;

  constructor(private ctx: DungeonCtx, private def: DungeonDef) {
    // your Crawler, exactly as Dax built and painted it
    this.crawler = makeCrawler({ parts: ctx.player.crawler.parts, paint: ctx.player.crawler.paint });
    this.theme = THEMES[this.def.id] ?? THEMES[this.def.theme];
  }

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ---------------- setup ----------------
  private buildScene(): void {
    const th = this.theme;
    this.scene.background = skyGradient(th.sky[0], th.sky[1]);
    this.scene.fog = new THREE.Fog(new THREE.Color(th.fog).getHex(), th.fogNear, th.fogFar);
    const hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemiIntensity);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(th.dir, th.dirIntensity);
    dir.position.set(3, 10, 2);
    this.scene.add(dir);
    this.crawlerLight.color.setHex(th.headlight);
    this.crawlerLight.castShadow = true;
    this.scene.add(this.crawler, this.crawlerLight, this.tileGroup, this.decoGroup);

    // storm floors crackle: sheet lightning rolls across the dark
    if (this.def.theme === 'storm') {
      let flashT = 3 + Math.random() * 4, boost = 0;
      const base = hemi.intensity;
      this.anim.push(dt => {
        flashT -= dt;
        if (flashT <= 0) {
          flashT = 3.5 + Math.random() * 5;
          boost = 0.7;
          const fx = this.pos.x + (Math.random() - 0.5) * 8;
          const fy = this.pos.y + (Math.random() - 0.5) * 8;
          this.vfx.bolt(new THREE.Vector3(fx, 7, fy), new THREE.Vector3(fx + 1, 1.5, fy + 1), 0xc8b0ff, { life: 0.3, jitter: 0.8 });
        }
        boost = Math.max(0, boost - dt * 1.6);
        hemi.intensity = base + boost;
      });
    }
  }

  /** Free GPU resources from the previous floor before building the next. */
  private disposeFloorMeshes(): void {
    for (const grp of [this.tileGroup, this.decoGroup]) {
      grp.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh && !(o as THREE.Points).isPoints) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          std.emissiveMap?.dispose();
          m?.dispose();
        }
      });
      grp.clear();
    }
  }

  private buildFloorMeshes(): void {
    this.disposeFloorMeshes();
    this.decoMeshes.clear();
    this.anim.length = this.def.theme === 'storm' ? 1 : 0; // keep the storm-flash ticker
    const th = this.theme;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), th.floor());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(SIZE / 2 - 0.5, 0, SIZE / 2 - 0.5);
    ground.receiveShadow = true;
    this.tileGroup.add(ground);

    // instanced walls with organic height + tone jitter
    let wallCount = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (this.map.tiles[y][x] === 'wall') wallCount++;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const walls = new THREE.InstancedMesh(wallGeo, th.wall(), wallCount);
    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    let i = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (this.map.tiles[y][x] === 'wall') {
        const h = 1.45 + Math.random() * 0.75;
        m.makeScale(1, h, 1);
        m.setPosition(x, h / 2, y);
        walls.setMatrixAt(i, m);
        const v = 0.82 + Math.random() * 0.26;
        walls.setColorAt(i, tint.setRGB(v, v, v));
        i++;
      }
    }
    walls.castShadow = walls.receiveShadow = true;
    this.tileGroup.add(walls);

    // special-tile set pieces
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const mesh = this.buildTileProp(this.map.tiles[y][x]);
      if (mesh) {
        mesh.position.x += x; mesh.position.z += y;
        this.decoGroup.add(mesh);
        this.decoMeshes.set(`${x},${y}`, mesh);
      }
    }

    this.placeDecorations();
    this.addMotes();
  }

  /** The landmark props: chests, crystals, stairs, boss seals, exits. */
  private buildTileProp(tile: Tile): THREE.Object3D | null {
    const accent = this.theme.accent;
    if (tile === 'chest') {
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e24, roughness: 0.7 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.6, roughness: 0.35, emissive: 0x6a4a10, emissiveIntensity: 0.4 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.4), wood);
      box.position.y = 0.17;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.42), wood);
      lid.position.y = 0.42;
      for (const bz of [-0.12, 0.12]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.07), gold);
        band.position.set(0, 0.26, bz);
        g.add(band);
      }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.06), gold);
      lock.position.set(0, 0.3, 0.22);
      g.add(box, lid, lock);
      const ph = Math.random() * Math.PI * 2;
      this.anim.push(dt => { void dt; gold.emissiveIntensity = 0.35 + Math.max(0, Math.sin(this.envT * 1.6 + ph)) * 0.5; });
      g.traverse(o => { o.castShadow = true; });
      return g;
    }
    if (tile === 'crystal') {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 1.0, roughness: 0.15 });
      const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat);
      main.position.y = 0.55;
      g.add(main);
      for (const [sx, sz, ss] of [[0.22, 0.1, 0.14], [-0.18, -0.14, 0.11]]) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(ss), mat);
        shard.position.set(sx, ss + 0.05, sz);
        shard.rotation.z = sx;
        g.add(shard);
      }
      const glow = new THREE.PointLight(0x5ad88a, 5, 3.5);
      glow.position.y = 0.7;
      g.add(glow);
      const ph = Math.random() * Math.PI * 2;
      this.anim.push(dt => {
        void dt;
        main.position.y = 0.55 + Math.sin(this.envT * 1.8 + ph) * 0.06;
        main.rotation.y = this.envT * 0.8 + ph;
        const p = 0.8 + Math.sin(this.envT * 2.4 + ph) * 0.35;
        mat.emissiveIntensity = p;
        glow.intensity = 5 * p;
      });
      return g;
    }
    if (tile === 'stairs') {
      const g = new THREE.Group();
      for (let s = 0; s < 3; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8 - s * 0.22),
          new THREE.MeshStandardMaterial({ color: 0x9aa3c8, roughness: 0.6 }));
        step.position.set(0, 0.06 + s * 0.14, -s * 0.12);
        g.add(step);
      }
      const portal = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0x5ab8e8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      portal.position.y = 0.75;
      g.add(portal);
      const glow = new THREE.PointLight(0x5ab8e8, 8, 4);
      glow.position.y = 1;
      g.add(glow);
      this.anim.push(dt => {
        void dt;
        portal.rotation.y = this.envT * 1.4;
        portal.rotation.x = Math.sin(this.envT * 0.9) * 0.4;
        glow.intensity = 8 + Math.sin(this.envT * 3) * 2;
      });
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      return g;
    }
    if (tile === 'boss') {
      const g = new THREE.Group();
      const obelisk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a1c34, emissive: 0xe83a5a, emissiveIntensity: 0.55, roughness: 0.4 }));
      obelisk.position.y = 0.75;
      const glow = new THREE.PointLight(0xe83a5a, 12, 5.5);
      glow.position.y = 1.3;
      g.add(obelisk, glow);
      // captive runes orbit the seal
      const runeMat = new THREE.MeshBasicMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const runes: THREE.Mesh[] = [];
      for (let r = 0; r < 3; r++) {
        const rune = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09), runeMat);
        g.add(rune);
        runes.push(rune);
      }
      this.anim.push(dt => {
        void dt;
        obelisk.rotation.y = this.envT * 0.5;
        const p = 0.45 + Math.max(0, Math.sin(this.envT * 1.5)) * 0.5;
        (obelisk.material as THREE.MeshStandardMaterial).emissiveIntensity = p;
        glow.intensity = 9 + p * 8;
        runes.forEach((rune, ri) => {
          const a = this.envT * 1.1 + (ri / 3) * Math.PI * 2;
          rune.position.set(Math.cos(a) * 0.65, 0.9 + Math.sin(this.envT * 2 + ri) * 0.18, Math.sin(a) * 0.65);
          rune.rotation.y = a * 2;
        });
      });
      obelisk.castShadow = true;
      return g;
    }
    if (tile === 'exit') {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 5, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xf2d88a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2.5;
      g.add(ring, beam);
      this.anim.push(dt => {
        void dt;
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.07 + (Math.sin(this.envT * 1.1) * 0.5 + 0.5) * 0.07;
        ring.rotation.z = this.envT * 0.6;
      });
      return g;
    }
    void accent;
    // traps stay hidden (scanner tier 3 reveals them on the minimap only)
    return null;
  }

  /** Scatter theme-true set dressing on floor tiles that hug the walls. */
  private placeDecorations(): void {
    const th = this.theme;
    const candidates: { x: number; y: number }[] = [];
    for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
      if (this.map.tiles[y][x] !== 'floor') continue;
      if (x === this.map.start.x && y === this.map.start.y) continue;
      const nearWall = this.map.tiles[y - 1][x] === 'wall' || this.map.tiles[y + 1][x] === 'wall'
        || this.map.tiles[y][x - 1] === 'wall' || this.map.tiles[y][x + 1] === 'wall';
      if (nearWall) candidates.push({ x, y });
    }
    // shuffle, take a couple dozen
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    let glowBudget = 7;
    const count = Math.min(24, candidates.length);
    for (let i = 0; i < count; i++) {
      const { x, y } = candidates[i];
      const kind = th.decos[Math.floor(Math.random() * th.decos.length)];
      const { mesh, glows } = this.buildDeco(kind);
      // nudge toward the wall edge so the corridor stays drivable
      const ox = (this.map.tiles[y][x - 1] === 'wall' ? -0.32 : this.map.tiles[y][x + 1] === 'wall' ? 0.32 : 0);
      const oz = (this.map.tiles[y - 1][x] === 'wall' ? -0.32 : this.map.tiles[y + 1][x] === 'wall' ? 0.32 : 0);
      mesh.position.set(x + ox, 0, y + oz);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      if (glows && glowBudget > 0) {
        glowBudget--;
        const light = new THREE.PointLight(th.accent, 4, 4);
        light.position.y = 0.7;
        mesh.add(light);
        const ph = Math.random() * Math.PI * 2;
        this.anim.push(dt => { void dt; light.intensity = 3.4 + Math.sin(this.envT * 2 + ph) * 1.2; });
      }
      this.decoGroup.add(mesh);
    }
  }

  private buildDeco(kind: DecoKind): { mesh: THREE.Object3D; glows: boolean } {
    const th = this.theme;
    const g = new THREE.Group();
    if (kind === 'stalagmite') {
      const mat = new THREE.MeshStandardMaterial({ map: caveRockTexture('#4a4456', '#363044', '#221e30', 55, 1), roughness: 0.95 });
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const h = 0.35 + Math.random() * 0.7;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.1, h, 6), mat);
        cone.position.set((Math.random() - 0.5) * 0.4, h / 2, (Math.random() - 0.5) * 0.4);
        cone.castShadow = true;
        g.add(cone);
      }
      return { mesh: g, glows: false };
    }
    if (kind === 'crystal') {
      const mat = new THREE.MeshStandardMaterial({ color: th.accent, emissive: th.accent, emissiveIntensity: 0.9, roughness: 0.2 });
      for (let i = 0; i < 2; i++) {
        const s = 0.1 + Math.random() * 0.12;
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(s), mat);
        shard.position.set((Math.random() - 0.5) * 0.3, s + 0.04, (Math.random() - 0.5) * 0.3);
        shard.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
        g.add(shard);
      }
      return { mesh: g, glows: true };
    }
    if (kind === 'mushroom') {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const h = 0.18 + Math.random() * 0.3;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 6),
          new THREE.MeshStandardMaterial({ color: 0xc8d8b8, roughness: 0.9 }));
        stem.position.set((Math.random() - 0.5) * 0.45, h / 2, (Math.random() - 0.5) * 0.45);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x5ee4a8, emissive: 0x2a9a5e, emissiveIntensity: 1.0, roughness: 0.4 }));
        cap.position.set(stem.position.x, h, stem.position.z);
        g.add(stem, cap);
      }
      return { mesh: g, glows: true };
    }
    if (kind === 'fern') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a7a4a, roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5 + Math.random() * 0.25, 4), mat);
        blade.position.y = 0.25;
        blade.rotation.z = (Math.random() - 0.5) * 0.9;
        blade.rotation.y = (i / 4) * Math.PI * 2;
        blade.scale.z = 0.3;
        g.add(blade);
      }
      return { mesh: g, glows: false };
    }
    if (kind === 'column') {
      const mat = new THREE.MeshStandardMaterial({ map: drownedBrickTexture('#3e5a6a', '#1e2e3a', 'rgba(74,164,116,1)', 19, 1), roughness: 0.6 });
      const h = 0.7 + Math.random() * 1.1;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 10), mat);
      col.position.y = h / 2;
      col.rotation.z = (Math.random() - 0.5) * 0.14;
      col.castShadow = true;
      g.add(col);
      if (Math.random() < 0.5) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.22, 10), mat);
        cap.position.set(0.3, 0.11, 0.18);
        cap.rotation.x = Math.PI / 2.4;
        g.add(cap);
      }
      return { mesh: g, glows: false };
    }
    if (kind === 'coins') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.85, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.35 });
      const pile = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.12, 10, 8), mat);
      pile.scale.y = 0.3;
      pile.position.y = 0.04;
      g.add(pile);
      return { mesh: g, glows: false };
    }
    if (kind === 'algae') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a5a3a, roughness: 0.95 });
      for (let i = 0; i < 3; i++) {
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 8, 6), mat);
        tuft.scale.y = 1.6;
        tuft.position.set((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4);
        g.add(tuft);
      }
      return { mesh: g, glows: false };
    }
    if (kind === 'pylon') {
      const mat = new THREE.MeshStandardMaterial({
        map: stormPanelTexture('#2e2a44', '#161226', 23, 1),
        emissiveMap: stormSeamEmissive('#9a7af2', 23, 1),
        emissive: new THREE.Color(0x9a7af2), emissiveIntensity: 0.8,
        roughness: 0.45, metalness: 0.5,
      });
      const h = 0.7 + Math.random() * 0.7;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), mat);
      pylon.position.y = h / 2;
      pylon.castShadow = true;
      g.add(pylon);
      // occasional arc of stray current
      let arcT = 2 + Math.random() * 5;
      const tip = () => g.position.clone().add(new THREE.Vector3(0, h, 0));
      this.anim.push(dt => {
        arcT -= dt;
        if (arcT <= 0) {
          arcT = 3 + Math.random() * 6;
          const t0 = tip();
          this.vfx.bolt(t0, t0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.4, (Math.random() - 0.5) * 1.4)), 0xc8b0ff, { life: 0.2, jitter: 0.3, segments: 5 });
        }
      });
      return { mesh: g, glows: true };
    }
    if (kind === 'shard') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a4266, emissive: 0x6a5ac8, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.4 });
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + Math.random() * 0.08), mat);
      const baseY = 0.5 + Math.random() * 0.4;
      const ph = Math.random() * Math.PI * 2;
      g.add(shard);
      this.anim.push(dt => {
        void dt;
        shard.position.y = baseY + Math.sin(this.envT * 1.3 + ph) * 0.1;
        shard.rotation.y = this.envT * 0.9 + ph;
        shard.rotation.x = this.envT * 0.5;
      });
      return { mesh: g, glows: false };
    }
    // rubble
    const mat = new THREE.MeshStandardMaterial({ map: stoneTexture('#3e3a4c', '#262234', 1), roughness: 0.95 });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const s = 0.06 + Math.random() * 0.1;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s), mat);
      rock.position.set((Math.random() - 0.5) * 0.5, s * 0.7, (Math.random() - 0.5) * 0.5);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(rock);
    }
    return { mesh: g, glows: false };
  }

  /** Ambient airborne particles, themed: dust drifts, bubbles rise, sparks jitter. */
  private addMotes(): void {
    const { color, count, mode } = this.theme.mote;
    const positions = new Float32Array(count * 3);
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() * SIZE;
      positions[i * 3 + 1] = 0.2 + Math.random() * 3;
      positions[i * 3 + 2] = Math.random() * SIZE;
      seed.push(Math.random() * Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.tileGroup.add(pts);
    this.anim.push(dt => {
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        if (mode === 'drift') {
          arr[i * 3] += Math.sin(this.envT * 0.5 + seed[i]) * dt * 0.1;
          arr[i * 3 + 1] += Math.cos(this.envT * 0.4 + seed[i] * 2) * dt * 0.06;
        } else if (mode === 'rise') {
          arr[i * 3 + 1] += dt * (0.15 + (seed[i] % 1) * 0.25);
          arr[i * 3] += Math.sin(this.envT * 0.7 + seed[i]) * dt * 0.08;
          if (arr[i * 3 + 1] > 3.4) arr[i * 3 + 1] = 0.1;
        } else { // spark
          arr[i * 3] += Math.sin(this.envT * 6 + seed[i] * 9) * dt * 0.5;
          arr[i * 3 + 1] += Math.cos(this.envT * 7 + seed[i] * 7) * dt * 0.4;
          if (arr[i * 3 + 1] < 0.1) arr[i * 3 + 1] = 0.6;
          if (arr[i * 3 + 1] > 3.4) arr[i * 3 + 1] = 1;
        }
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  private newFloor(): void {
    const rng = Math.random;
    const isLast = this.floorNum >= this.def.floors;
    this.map = genFloor(rng, isLast, !!this.def.boss);
    this.buildFloorMeshes();
    this.pos = { ...this.map.start };
    this.crawler.position.set(this.pos.x, 0, this.pos.y);
    this.stepsToEncounter = 8 + Math.floor(Math.random() * 9);
    this.reveal();
    this.drawMinimap();
    updateHUD(this.ctx.player, this.def.name, { floor: this.floorNum });
    toast(`${this.def.name} — B${this.floorNum}F`, 'gold');
  }

  // ---------------- minimap ----------------
  private reveal(): void {
    const r = 1 + this.ctx.player.crawler.scannerTier;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = this.pos.x + dx, y = this.pos.y + dy;
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE && dx * dx + dy * dy <= r * r + 1) {
        this.map.seen[y][x] = true;
      }
    }
  }

  private drawMinimap(): void {
    const cv = $('minimap') as unknown as HTMLCanvasElement;
    cv.style.display = 'block';
    const c = cv.getContext('2d')!;
    const cell = cv.width / SIZE;
    c.fillStyle = '#06080f';
    c.fillRect(0, 0, cv.width, cv.height);
    const tier = this.ctx.player.crawler.scannerTier;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const tile = this.map.tiles[y][x];
      const seen = this.map.seen[y][x];
      const pinged = tier >= 2 && (tile === 'chest' || (tier >= 3 && (tile === 'stairs' || tile === 'boss' || tile === 'trap')));
      if (!seen && !pinged) continue;
      let col = '#2a3050';
      if (tile === 'wall') col = '#0e1020';
      else if (tile === 'chest') col = '#f2c14e';
      else if (tile === 'crystal') col = '#5ad88a';
      else if (tile === 'stairs') col = '#5ab8e8';
      else if (tile === 'boss') col = '#e83a5a';
      else if (tile === 'exit') col = '#f2f2f2';
      else if (tile === 'trap' && tier >= 3) col = '#a85a2a';
      c.fillStyle = col;
      c.fillRect(x * cell, y * cell, cell, cell);
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc((this.pos.x + 0.5) * cell, (this.pos.y + 0.5) * cell, cell * 0.6, 0, Math.PI * 2);
    c.fill();

    if (this.bigMapOpen) this.drawBigMap();
  }

  // ---------------- large transparent map (M) ----------------
  private toggleBigMap(): void {
    this.bigMapOpen = !this.bigMapOpen;
    $('bigmap').style.display = this.bigMapOpen ? 'block' : 'none';
    if (this.bigMapOpen) this.drawBigMap();
  }

  private drawBigMap(): void {
    const cv = $('bigmap-canvas') as unknown as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const W = cv.width;
    const pad = 26, headH = 40, legendH = 34;
    const cell = (W - pad * 2 - headH - legendH) / SIZE;
    const ox = pad, oy = pad + headH;

    c.clearRect(0, 0, W, W);
    // translucent backdrop — the dungeon stays visible behind the map
    c.fillStyle = 'rgba(6, 9, 20, 0.62)';
    c.fillRect(0, 0, W, W);

    // header
    c.textAlign = 'center';
    c.font = 'bold 22px Trebuchet MS';
    c.fillStyle = '#f2c14e';
    c.fillText(`${this.def.name} — B${this.floorNum}F / ${this.def.floors}F`, W / 2, pad + 16);

    const tier = this.ctx.player.crawler.scannerTier;
    const colors: Record<string, string> = {
      floor: 'rgba(64,72,110,0.65)', wall: 'rgba(14,16,32,0.8)', chest: '#f2c14e', crystal: '#5ad88a',
      stairs: '#5ab8e8', boss: '#e83a5a', exit: '#f2f2f2', trap: '#a85a2a',
    };
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const tile = this.map.tiles[y][x];
      const seen = this.map.seen[y][x];
      const pinged = tier >= 2 && (tile === 'chest' || (tier >= 3 && (tile === 'stairs' || tile === 'boss' || tile === 'trap')));
      if (!seen && !pinged) continue;
      if (tile === 'trap' && tier < 3) { c.fillStyle = colors.floor; }
      else c.fillStyle = colors[tile] ?? colors.floor;
      c.fillRect(ox + x * cell + 0.5, oy + y * cell + 0.5, cell - 1, cell - 1);
    }

    // player pulse
    const px = ox + (this.pos.x + 0.5) * cell, py = oy + (this.pos.y + 0.5) * cell;
    const pulse = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
    c.beginPath(); c.arc(px, py, cell * 0.9 * pulse, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(px, py, cell * 0.45, 0, Math.PI * 2);
    c.fillStyle = '#ffffff'; c.fill();

    // legend
    const legend: [string, string][] = [
      ['#f2c14e', 'Chest'], ['#5ad88a', 'Crystal'], ['#5ab8e8', 'Stairs'],
      ['#e83a5a', 'Boss'], ['#f2f2f2', 'Exit'], ...(tier >= 3 ? [['#a85a2a', 'Trap'] as [string, string]] : []),
      ['#ffffff', 'You'],
    ];
    const ly = W - pad - 8;
    let lx = W / 2 - legend.length * 46;
    c.font = '12px Trebuchet MS';
    c.textAlign = 'left';
    for (const [col, name] of legend) {
      c.fillStyle = col; c.fillRect(lx, ly - 9, 10, 10);
      c.fillStyle = '#aab0c8'; c.fillText(name, lx + 14, ly);
      lx += 92;
    }
  }

  // ---------------- movement & tiles ----------------
  private async tryMove(dx: number, dy: number): Promise<void> {
    if (this.moving || this.busy) return;
    const nx = this.pos.x + dx, ny = this.pos.y + dy;
    this.facing = Math.atan2(dx, dy);
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || this.map.tiles[ny][nx] === 'wall') {
      this.crawler.rotation.y = this.facing;
      return;
    }
    this.moving = true;
    const p = this.ctx.player;
    const from = new THREE.Vector3(this.pos.x, 0, this.pos.y);
    const to = new THREE.Vector3(nx, 0, ny);
    await tween(0.17, t => {
      this.crawler.position.lerpVectors(from, to, t);
      this.crawler.rotation.y = this.facing;
    }, Ease.linear);
    this.pos = { x: nx, y: ny };
    this.moving = false;

    // Trigger story step count in Trial
    if (this.def.id === 'trial' && !p.flags['exam_done']) {
      this.trialSteps++;
      this.checkTrialStory(this.trialSteps);
    }

    // energy drain — efficient legs sometimes make the step for free
    if (Math.random() < p.crawler.strideEfficiency) { /* perfect stride */ }
    else if (p.crawler.energy > 0) p.crawler.energy--;
    else {
      p.crawler.hull = Math.max(0, p.crawler.hull - 3);
      if (p.crawler.hull % 9 === 0) toast('⚠️ Energy depleted — hull is taking strain!', 'red');
    }
    if (p.crawler.hull <= 0) { await this.crawlerDestroyed(); return; }

    this.reveal();
    this.drawMinimap();
    updateHUD(p, this.def.name, { floor: this.floorNum });
    await this.onTile();
  }

  private async onTile(): Promise<void> {
    const p = this.ctx.player;
    const tile = this.map.tiles[this.pos.y][this.pos.x];
    const key = `${this.pos.x},${this.pos.y}`;
    const here = new THREE.Vector3(this.pos.x, 0, this.pos.y);

    if (tile === 'chest') {
      this.busy = true;
      this.map.tiles[this.pos.y][this.pos.x] = 'floor';
      const mesh = this.decoMeshes.get(key);
      if (mesh) { this.decoGroup.remove(mesh); this.decoMeshes.delete(key); }
      this.vfx.burst(here.clone().setY(0.5), 0xf2c14e, { count: 26, speed: 2.2, gravity: -3, life: 0.8, size: 0.12 });
      this.vfx.glow(here.clone().setY(0.6), 0xf2d88a, { scale: 1.6, life: 0.5 });
      sfx('toast');
      const roll = Math.random();
      if (roll < 0.3) {
        const amt = 40 + Math.floor(Math.random() * 80) + this.floorNum * 20;
        p.shards += amt;
        await say('', `📦 The chest held ◆${amt} Shards!`);
      } else {
        const lootPool = ['tonic', 'berry', 'cell', 'soda', 'honey_roll', 'plating', 'tonic_plus', 'revive_leaf'];
        const id = lootPool[Math.floor(Math.random() * lootPool.length)];
        if (p.addItem(id)) await say('', `📦 Found a ${ITEMS[id].name}!`);
        else await say('', `📦 Found a ${ITEMS[id].name}… but the cargo hold is full!`);
      }
      this.busy = false;
    } else if (tile === 'trap') {
      this.busy = true;
      this.map.tiles[this.pos.y][this.pos.x] = 'floor';
      if (Math.random() < 0.5) {
        const dmg = 10 + this.floorNum * 5;
        p.crawler.hull = Math.max(0, p.crawler.hull - dmg);
        toast(`💥 Spike trap! Hull -${dmg}`, 'red');
        sfx('boom');
        this.vfx.spikes(here, 0xa85a2a, { count: 7, height: 1.0 });
        this.vfx.burst(here.clone().setY(0.5), 0xff8a3a, { count: 24, speed: 3, gravity: -4, life: 0.6 });
        this.vfx.shake(0.3, 0.45);
        const orig = this.crawler.position.clone();
        await tween(0.3, t => { this.crawler.position.y = Math.sin(t * Math.PI) * 0.25; });
        this.crawler.position.copy(orig);
        if (p.crawler.hull <= 0) { await this.crawlerDestroyed(); return; }
      } else {
        const drain = 12 + this.floorNum * 4;
        p.crawler.energy = Math.max(0, p.crawler.energy - drain);
        toast(`🌀 Static snare! Energy -${drain}`, 'red');
        sfx('zap');
        this.vfx.ring(here, 0x5ab8e8, { maxR: 1.6, life: 0.5 });
        this.vfx.bolt(here.clone().setY(2.4), here.clone().setY(0.4), 0x9ad4f2, { jitter: 0.4 });
        this.vfx.shake(0.15, 0.3);
      }
      updateHUD(p, this.def.name, { floor: this.floorNum });
      this.busy = false;
    } else if (tile === 'crystal') {
      this.map.tiles[this.pos.y][this.pos.x] = 'floor';
      const mesh = this.decoMeshes.get(key);
      if (mesh) { this.decoGroup.remove(mesh); this.decoMeshes.delete(key); }
      p.crawler.energy = Math.min(p.crawler.energyMax, p.crawler.energy + 50);
      sfx('heal');
      this.vfx.implode(here.clone().setY(0.8), 0x5ad88a, { count: 22, radius: 1.4, life: 0.4 })
        .then(() => this.vfx.glow(here.clone().setY(0.8), 0x8af2b0, { scale: 1.4, life: 0.4 }));
      toast('💚 Energy crystal absorbed! +50 Energy', 'gold');
      updateHUD(p, this.def.name, { floor: this.floorNum });
    } else if (tile === 'floor') {
      // random encounters
      if (--this.stepsToEncounter <= 0) {
        this.stepsToEncounter = 8 + Math.floor(Math.random() * 9);
        await this.wildBattle();
      }
    }
    this.drawMinimap();
  }

  private hintForTile(): string | null {
    const tile = this.map.tiles[this.pos.y][this.pos.x];
    if (tile === 'stairs') return 'Press <b>E</b> to descend';
    if (tile === 'boss') return '⚠️ Press <b>E</b> to face the guardian of this place';
    if (tile === 'exit') return 'Press <b>E</b> to leave the dungeon';
    return null;
  }

  private async interact(): Promise<void> {
    if (this.busy || this.moving) return;
    const tile = this.map.tiles[this.pos.y][this.pos.x];
    const p = this.ctx.player;
    try {
      if (tile === 'stairs') {
        this.busy = true;
        this.floorNum++;
        this.vfx.pillar(new THREE.Vector3(this.pos.x, 0, this.pos.y), 0x5ab8e8, { height: 4, radius: 0.7, life: 0.8 });
        sfx('open');
        await say('', `Descending to B${this.floorNum}F…`);
        this.newFloor();
      } else if (tile === 'exit') {
        this.busy = true;
        // a dungeon with no warden is conquered by charting it to the deepest floor
        const deepest = this.floorNum >= this.def.floors && !this.def.boss;
        const pick = await choose('', deepest
          ? 'You have charted this place to its deepest floor. Return to the surface in triumph?'
          : 'Leave the dungeon and return to the surface?', ['Leave', 'Stay']);
        if (pick === 0) {
          if (deepest) {
            p.shards += this.def.rewardShards;
            p.dungeonClears[this.def.id] = (p.dungeonClears[this.def.id] ?? 0) + 1;
            toast(`🏆 ${this.def.name} fully charted! Bonus: ◆${this.def.rewardShards}`, 'gold');
            this.finish('cleared');
          } else {
            this.finish('retreat');
          }
        }
      } else if (tile === 'boss' && this.def.boss) {
        this.busy = true;
        const pick = await choose('', 'A monstrous presence stirs beyond this seal. Challenge it?', ['Challenge!', 'Not yet']);
        if (pick === 0) {
          sfx('boom');
          this.vfx.shake(0.3, 0.7);
          this.vfx.pillar(new THREE.Vector3(this.pos.x, 0, this.pos.y), 0xe83a5a, { height: 6, radius: 0.8, life: 1 });
          const result = await this.ctx.runBattle(
            [{ speciesId: this.def.boss, level: this.def.bossLevel ?? 10 }],
            { boss: true, theme: this.def.theme, arena: this.def.id, intro: '⚠️ The dungeon\'s master awakens!' }
          );
          if (result === 'win') {
            p.shards += this.def.rewardShards;
            p.dungeonClears[this.def.id] = (p.dungeonClears[this.def.id] ?? 0) + 1;
            if (this.def.id === 'trial') {
              await say('Alex', `Holy shards, you actually did it! Ironhusk is defeated! I was half-expecting to call the recovery team, haha.`);
              await say('Alex', `Outstanding battle sense, recruit. You've officially finished your final exam. Head back to the surface and report to Instructor Hale!`);
            } else {
              await say('', `🏆 ${this.def.name} conquered! Bonus reward: ◆${this.def.rewardShards} Shards!`);
            }
            this.finish('cleared');
            return;
          }
          if (result === 'lose') { this.finish('dead'); return; }
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private async wildBattle(): Promise<void> {
    this.busy = true;
    try {
      const p = this.ctx.player;
      const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.floorNum));
      const [lo, hi] = this.def.levelRange;
      const specs = Array.from({ length: n }, () => ({
        speciesId: this.def.pool[Math.floor(Math.random() * this.def.pool.length)],
        level: lo + Math.floor(Math.random() * (hi - lo + 1)) + (this.floorNum - 1),
      }));
      const firstStrike = Math.random() < p.crawler.firstStrikeChance;
      this.vfx.shake(0.12, 0.3);
      const result = await this.ctx.runBattle(specs, { wild: true, theme: this.def.theme, arena: this.def.id, firstStrike });
      if (result === 'lose') { this.finish('dead'); return; }
      if (result === 'win' && this.def.drop) {
        const d = this.def.drop;
        if (p.itemCount(d.item) < (d.max ?? 1) && Math.random() < d.chance) {
          if (p.addItem(d.item)) {
            sfx('toast');
            await say('', `✨ One of the fallen wild Guardians shed something rare: <b>${ITEMS[d.item].name}</b>!`);
          } else {
            await say('', `✨ One of the fallen wild Guardians tried to shed a rare item: <b>${ITEMS[d.item].name}</b>… but your inventory is full!`);
          }
        }
      }
      updateHUD(p, this.def.name, { floor: this.floorNum });
      this.drawMinimap();
    } finally {
      this.busy = false;
    }
  }

  private async crawlerDestroyed(): Promise<void> {
    this.busy = true;
    sfx('boom');
    this.vfx.burst(this.crawler.position.clone().setY(0.6), 0xff8a3a, { count: 40, speed: 4, gravity: -4, life: 0.9 });
    this.vfx.shake(0.4, 0.8);
    await say('', '💥 The Crawler\'s hull gave out! An academy recovery team hauls you back to the surface…');
    this.finish('dead');
  }

  private finish(o: DungeonOutcome): void {
    hideStory();
    this.bigMapOpen = false;
    $('bigmap').style.display = 'none';
    $('minimap').style.display = 'none';
    showInteractHint(null);
    this.vfx.dispose();
    this.disposeFloorMeshes();
    this.finished?.(o);
    this.finished = null;
  }

  // ---------------- per-frame ----------------
  private update(dt: number): void {
    if (!this.finished) return;
    if (!this.map) return; // view can render a frame before run() generates the floor
    this.envT += dt;
    this.vfx.update(dt);
    for (const f of this.anim) f(dt);

    // camera follow (angled top-down, DW2 style) + impact shake
    // right-drag orbits the Crawler; idle 10s and it glides back home
    const target = new THREE.Vector3(this.crawler.position.x, 0, this.crawler.position.z);
    const camGoal = target.clone().add(new THREE.Vector3(0, 6.4, 4.6));
    worldOrbit.update(dt);
    const lookT = new THREE.Vector3(target.x, 0.4, target.z);
    this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 5));
    this.camera.position.add(this.vfx.shakeOffset);
    this.camera.lookAt(lookT);
    this.crawlerLight.position.set(target.x, 2.6, target.z);

    // gait, glow pulses and scanner spin are driven by the shared crawler rig

    if (this.bigMapOpen) this.drawBigMap(); // live pulse + position while the map is up

    if (isDialogueOpen() || isMenuOpen() || this.busy) { showInteractHint(null); return; }
    showInteractHint(this.hintForTile());

    if (this.keys.has('w') || this.keys.has('arrowup')) this.tryMove(0, -1);
    else if (this.keys.has('s') || this.keys.has('arrowdown')) this.tryMove(0, 1);
    else if (this.keys.has('a') || this.keys.has('arrowleft')) this.tryMove(-1, 0);
    else if (this.keys.has('d') || this.keys.has('arrowright')) this.tryMove(1, 0);
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.ctx.player, { canSave: false })
      .finally(() => {
        updateHUD(this.ctx.player, this.def.name, { floor: this.floorNum });
        this.busy = false;
      });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;
    if (k === 'e' || k === 'enter') this.interact();
    else if (k === 'm') this.toggleBigMap();
    else if (k === 'p') this.openPanelGuarded('player');
    else if (k === 'i') this.openPanelGuarded('inventory');
    else if (k === 'g') this.openPanelGuarded('guardians');
    else if (k === 'c') this.openPanelGuarded('crawler');
    else if (k === 'j') this.openPanelGuarded('quests');
    else if (k === 'v') this.openPanelGuarded('evotree');
    else if ((k === 'escape' || k === 'esc') && this.bigMapOpen) this.toggleBigMap();
    else if (k === 'escape' || k === 'esc') {
      this.busy = true;
      openPauseMenu(this.ctx.player, {
        canSave: false,
        inDungeon: true,
        floorNum: this.floorNum,
        onRetreat: async () => {
          const pick = await choose('', 'Teleport back to the surface? You will lose current floor progress, but keep all items and experience.', ['Teleport', 'Stay']);
          if (pick === 0) {
            this.finish('retreat');
          }
        }
      }).finally(() => {
        if (this.finished === null) {
          return;
        }
        updateHUD(this.ctx.player, this.def.name, { floor: this.floorNum });
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  // ---------------- entry ----------------
  run(): Promise<DungeonOutcome> {
    this.buildScene();
    this.newFloor();
    showHotkeys(true, true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    if (this.def.id === 'trial' && !this.ctx.player.flags['exam_done']) {
      if (this.trialSteps === 0) {
        this.checkTrialStory(0);
      }
    }

    return new Promise<DungeonOutcome>(res => {
      this.finished = (o) => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        res(o);
      };
    });
  }

  private checkTrialStory(step: number): void {
    const p = this.ctx.player;
    let lines: [string, string][] = [];
    if (step === 0) {
      lines = [
        ['Alex', `Hey ${p.tamerName}! Can you hear me? It's Alex, your senior examiner. I've patched into your Crawler's radio. Good luck on your final exam!`],
        ['Alex', `Your mission is to reach the 2nd floor and defeat the corrupted sentinel, "Ironhusk". Let's see if you can make me proud!`]
      ];
    } else if (step === 4) {
      lines = [
        ['Alex', `You're piloting a standard Academy Crawler. See those Hull and Energy bars in the HUD? Every step you take drains 1 Energy. Keep a close eye on it!`],
        ['Alex', `If Energy hits 0, you'll take structural damage to the Hull. If the Hull breaks, you faint! Use Charge Cells to refuel, or find green Crystals in the caves.`]
      ];
    } else if (step === 8) {
      lines = [
        ['Alex', `Your loaner team consists of Pyrofang, Tidefin, and Galewing. They are Blaze, Tide, and Gale types respectively. Remember, type matchups are key to survival!`],
        ['Alex', `Blaze is super effective against Verdant, Tide douses Blaze, and Verdant roots Tide. It's a classic triangle. Check your combat options!`]
      ];
    } else if (step === 13) {
      lines = [
        ['Alex', `There are three other types: Volt, Gale, and Umbra. Volt shocks Gale, Gale cuts Verdant, and Umbra devours Volt. Learning this chart will save your life!`],
        ['Alex', `Press Esc to open the Field Menu anytime to check stats, items, and your Crawler parts.`]
      ];
    } else if (step === 18) {
      lines = [
        ['Alex', `Want to expand your team? If you meet wild Guardians, throw them Sweet Berries or Honey Rolls. If you win their bond, they'll join you after the fight!`],
        ['Alex', `A diverse team means you can swap members to counter different enemy types. Try to catch a few wild partners!`]
      ];
    } else if (step === 23) {
      lines = [
        ['Alex', `Keep an eye on your team's levels. Gaining EXP lets them level up, and when they hit the right level, they can Evolve to Adept, Elite, and Apex stages!`],
        ['Alex', `Evolving doesn't just change their look; they carry over 20% of their old stats as a permanent bonus. Never skip an evolution!`]
      ];
    } else if (step === 28) {
      lines = [
        ['Alex', `Ironhusk on B2F is an Umbra type. It's tough and corrupted. Umbra is strong against Volt and Blaze, but weak to Tide. Use Tidefin to wear it down!`],
        ['Alex', `Make sure you heal up at green Crystals or use Tonics from your inventory before challenging it.`]
      ];
    }

    if (lines.length > 0) {
      playStorySequence(lines);
    }
  }
}
