// ============================================================
// AZ Tamer — New Salmonan, the Valley of Loud Kitchens.
// A lively rural river-town folded into green hills where
// broadcast crystals lose their signal: terraced paddies on the
// west slope, a working river with flat-barge piers, a dawn
// market, the mural of the Big Three by the river gate
// (repainted every spring), Ivan Lawrence's house on the north
// hill — and, up the north-east ridge, the black glass of the
// Foretales Mirrorhouse, humming day and night.
//
// Act V plays out here: Chapter XXII's three proofs (Esta's
// relay logs, Dalisay's festival crystal, the stringer Quill's
// assignment ledger) and Chapter XXIII's ridge stair into the
// Mirrorhouse. Paper lanterns from the gratitude festival are
// still strung across the plaza.
// ============================================================
import * as THREE from 'three';
import { DUNGEONS, ITEMS, type DungeonDef } from './data';
import { Player } from './state';
import {
  makeTamer, updateVoxelHuman, makeVoxelHuman, disposeRig,
  skyGradient, canvasTex, mulberry, plankTexture, leafTexture, stoneTexture, groundTexture,
  type GuardianRig, type VoxelHumanOpts,
} from './models';
import { SALMONAN_LORE, FORETALES_LORE } from './lore';
import { questState, completeQuest, syncStoryQuests } from './quests';
import type { BattleOptions, BattleResult } from './battle';
import { VFX } from './vfx';
import { sfx } from './audio';
import {
  say, conversation, choose, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, type PanelKind,
} from './ui';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance } from './clothes';
import { runCinematicScene } from './main';
import { worldOrbit } from './camorbit';
import { worldClock, DayNightRig } from './daynight';
import { tagNpc, attachNpcPicker } from './npccard';
import { perf } from './perf';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export type SalmonanResult = { kind: 'leave' } | { kind: 'dungeon'; def: DungeonDef };

export interface SalmonanCtx {
  player: Player;
  runBattle(specs: { speciesId: string; level: number }[], opts: BattleOptions): Promise<BattleResult>;
}

interface Interactable { pos: THREE.Vector3; radius: number; label: string; handler: () => Promise<void> | void; }

const WALK_R = 42;            // walkable radius — the valley rim
const RIVER_X = 24;           // river centerline
const RIVER_HALF = 3.6;       // river half-width
const BRIDGE_Z = 5;           // the plank bridge crossing

/** Slow green-brown river water, streaked with current lines. */
function riverTexture(): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(727);
    const grad = ctx.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, '#2a7a8a'); grad.addColorStop(0.5, '#256a74'); grad.addColorStop(1, '#2a8a7e');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(220,240,230,0.14)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { y += 12 + rnd() * 20; x += rnd() * 6 - 3; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, 18);
}

/** The mural of the Big Three — painted fresh every spring. */
function muralTexture(): THREE.Texture {
  return canvasTex(512, (ctx, s) => {
    // warm plaster ground
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#f2e4c4'); grad.addColorStop(1, '#e0cc9e');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    // sky band behind the heroes
    ctx.fillStyle = '#8ac4e8'; ctx.fillRect(s * 0.06, s * 0.10, s * 0.88, s * 0.52);
    ctx.fillStyle = '#6aaa5e'; ctx.fillRect(s * 0.06, s * 0.54, s * 0.88, s * 0.18);
    // three painted figures: dawn-red, storm-gold, root-green
    const figure = (cx: number, col: string, glow: string) => {
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, s * 0.34, s * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(cx - s * 0.045, s * 0.30, s * 0.09, s * 0.30);  // body
      ctx.beginPath(); ctx.arc(cx, s * 0.26, s * 0.045, 0, Math.PI * 2); ctx.fill(); // head
    };
    figure(s * 0.30, '#c8402a', 'rgba(255,178,90,0.55)');
    figure(s * 0.50, '#c8a42a', 'rgba(255,242,160,0.55)');
    figure(s * 0.70, '#3a8a3e', 'rgba(160,255,180,0.45)');
    // the famous grin (argued about every spring)
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s * 0.50, s * 0.265, s * 0.022, 0.2, Math.PI - 0.2); ctx.stroke();
    // dedication ribbon
    ctx.fillStyle = '#b03a2a'; ctx.fillRect(s * 0.10, s * 0.78, s * 0.80, s * 0.10);
    ctx.fillStyle = '#f2ead0'; ctx.font = `bold ${Math.floor(s * 0.052)}px Trebuchet MS`; ctx.textAlign = 'center';
    ctx.fillText('THEY CAME EVERY TIME', s * 0.50, s * 0.855);
    // weathering specks
    const rnd = mulberry(33);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(120,100,70,${rnd() * 0.12})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, 0);
}

export class NewSalmonan {
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
  private npcs: THREE.Group[] = [];
  private rigs: GuardianRig[] = [];
  private markers: MapMarker[] = [];
  private riverTex: THREE.Texture | null = null;
  private dayNight: DayNightRig | null = null;
  // light budget: the forward renderer pays for every visible point light in
  // every shader — only the nearest perf.lightBudget stay lit (see town.ts)
  private scenePointLights: THREE.PointLight[] = [];
  private lightRankTimer = 0;
  private lastRankX = Infinity;
  private lastRankZ = Infinity;
  private clouds: THREE.Group[] = [];
  private dragonflies: { grp: THREE.Group; anchor: THREE.Vector3; phase: number; wingL: THREE.Object3D; wingR: THREE.Object3D }[] = [];
  private envTick: ((dt: number) => void)[] = [];
  private quillGroup: THREE.Group | null = null;
  private resolveExit: ((r: SalmonanResult) => void) | null = null;
  private player: Player;

  constructor(private ctx: SalmonanCtx, private spawnAt: 'pier' | 'ridge' = 'pier') {
    this.player = ctx.player;
  }

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ================= terrain =================
  /** Valley height: a green bowl, hills north and west, the river carved east. */
  private groundH(x: number, z: number): number {
    const r = Math.hypot(x, z);
    let h = Math.max(0, 1.2 * ((r / 46) ** 2));            // bowl rim rises gently
    const bump = (x0: number, z0: number, rad: number, ht: number) => {
      const d2 = (x - x0) ** 2 + (z - z0) ** 2;
      return ht * Math.exp(-d2 / (rad * rad));
    };
    h += bump(-14, -24, 12, 3.0);   // Ivan's hill
    h += bump(12, -25, 9, 2.2);     // the relay knoll
    h += bump(33, -21, 10, 3.4);    // the NE ridge — the Mirrorhouse stair
    h += bump(-30, -2, 16, 2.6);    // west terrace slope
    // the river channel
    const dr = Math.abs(x - RIVER_X);
    if (dr < RIVER_HALF + 1.6) {
      const carve = Math.max(0, 1 - (dr / (RIVER_HALF + 1.6)) ** 2) * (1.5 + h);
      h = Math.max(-0.7, h - carve);
    }
    return h;
  }

  private onBridge(x: number, z: number): boolean {
    return Math.abs(z - BRIDGE_Z) < 1.6 && Math.abs(x - RIVER_X) < RIVER_HALF + 2.2;
  }
  private inRiver(x: number, _z: number): boolean {
    return Math.abs(x - RIVER_X) < RIVER_HALF;
  }

  // ================= scene =================
  private buildScene(): void {
    const s = this.scene;
    // late-afternoon valley gold — the valley keeps the same hours as the world
    s.background = skyGradient('#6ab4e0', '#ffe8be');
    s.fog = new THREE.Fog(0xcfe8da, 60, 170);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a7a4a, 0.6);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.45);
    sun.position.set(-26, 38, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    s.add(sun);
    this.dayNight = new DayNightRig(s, sun, hemi, {
      // the valley keeps a slightly kinder night than the open sea — moonlight
      // off the river and a hundred kitchen fires see to that
      sunMax: 1.45, sunMin: 0.22, ambientMax: 0.6, ambientMin: 0.32, sunDay: '#ffe2b0',
    });

    // ---- the valley floor: displaced plane, meadow→hill vertex paint ----
    const geo = new THREE.PlaneGeometry(96, 96, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const meadow = new THREE.Color('#6cb45e'), hill = new THREE.Color('#4a9a52'),
      mud = new THREE.Color('#9a8a5e'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const dr = Math.abs(x - RIVER_X);
      if (dr < RIVER_HALF + 2.4) c.copy(mud);                  // riverbanks
      else c.copy(meadow).lerp(hill, Math.min(1, h / 3.2));
      const v = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      c.offsetHSL(0, 0, (v - 0.5) * 0.05);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: groundTexture('#c4c8b8', '#dde0d0', 16), vertexColors: true, roughness: 0.95,
    }));
    ground.receiveShadow = true;
    s.add(ground);

    // ---- the river, working its way south ----
    this.riverTex = riverTexture();
    const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2 + 1.2, 110),
      new THREE.MeshStandardMaterial({ map: this.riverTex, roughness: 0.18, metalness: 0.05 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(RIVER_X, -0.28, 0);
    s.add(river);
    this.envTick.push(() => {
      if (this.riverTex) { this.riverTex.offset.y = -this.t * 0.02; this.riverTex.offset.x = Math.sin(this.t * 0.2) * 0.01; }
    });

    // ---- set dressing ----
    this.buildBridge();
    this.buildPier();
    this.buildRiverGateAndMural();
    this.buildMarket();
    this.buildInn();
    this.buildHouses();
    this.buildPaddies();
    this.buildIvansHill();
    this.buildRelayTower();
    this.buildRidgeStair();
    this.buildFestivalLanterns();
    this.buildVillageLamps();
    this.scatterFlora();
    this.spawnDragonflies();
    this.driftClouds();

    // ---- the cast ----
    this.placeTownsfolk();
    this.placeLawrences();
    this.placeQuill();

    // player
    const spawn = this.spawnAt === 'ridge' ? new THREE.Vector3(29, 0, -17) : new THREE.Vector3(20, 0, 17);
    this.tamer.position.copy(spawn);
    this.tamer.position.y = this.groundH(spawn.x, spawn.z);
    this.tamer.rotation.y = this.spawnAt === 'ridge' ? Math.PI * 0.7 : -Math.PI / 2; // face into the town
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

  // ---------------- shared builders ----------------
  private tree(x: number, z: number, h = 3.6): void {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, h * 0.5, 6),
      new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a36', 1), roughness: 0.95 }));
    trunk.position.y = h * 0.25;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(h * 0.34, 9, 7),
      new THREE.MeshStandardMaterial({ map: leafTexture('#3a8a44', '#5cb45e', '#26602e', Math.floor(x * 7 + z)), roughness: 0.9 }));
    crown.position.y = h * 0.62;
    crown.scale.y = 0.85;
    crown.castShadow = true;
    g.add(trunk, crown);
    const y = this.groundH(x, z);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
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

  /** A bahay-kubo style stilt house with a hipped thatch roof. */
  private stiltHouse(x: number, z: number, rotY: number, size = 1, wallCol = '#b8915e'): void {
    const g = new THREE.Group();
    const y = this.groundH(x, z);
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture(wallCol, 2), roughness: 0.95 });
    for (const [sx, sz] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * size, 0.13 * size, 0.9 * size, 6), wood);
      stilt.position.set(sx * size, 0.45 * size, sz * size);
      g.add(stilt);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.1 * size, 1.7 * size, 2.5 * size), wood);
    body.position.y = 1.75 * size;
    body.castShadow = true;
    const thatch = new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 3), roughness: 1 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6 * size, 1.2 * size, 4), thatch);
    roof.position.y = 3.2 * size;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7 * size, 1.1 * size, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 1 }));
    door.position.set(0, 1.45 * size, 1.28 * size);
    // window with warm light
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * size, 0.4 * size),
      new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xc48a2a, emissiveIntensity: 0.8 }));
    win.position.set(0.9 * size, 1.9 * size, 1.27 * size);
    g.add(body, roof, door, win);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 2.1 * size });
  }

  // ---------------- the bridge & pier ----------------
  private buildBridge(): void {
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 3), roughness: 0.95 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(RIVER_HALF * 2 + 4.4, 0.2, 2.4), wood);
    deck.position.set(RIVER_X, 0.42, BRIDGE_Z);
    deck.castShadow = true;
    this.scene.add(deck);
    for (const side of [-1.3, 1.3]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RIVER_HALF * 2 + 4.4, 0.08, 0.08), wood);
      rail.position.set(RIVER_X, 1.0, BRIDGE_Z + side);
      this.scene.add(rail);
      for (let bx = -RIVER_HALF - 1.6; bx <= RIVER_HALF + 1.6; bx += 1.6) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 5), wood);
        post.position.set(RIVER_X + bx, 0.72, BRIDGE_Z + side);
        this.scene.add(post);
      }
    }
    this.markers.push({ x: RIVER_X, z: BRIDGE_Z, label: 'Bridge', color: '#c9a24a', kind: 'poi' });
  }

  private buildPier(): void {
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 3), roughness: 0.95 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.22, 2.4), wood);
    deck.position.set(RIVER_X - RIVER_HALF + 1.4, 0.32, 17);
    deck.castShadow = true;
    this.scene.add(deck);
    for (let dx = -2.5; dx <= 2.5; dx += 1.6) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.2, 6), wood);
        post.position.set(RIVER_X - RIVER_HALF + 1.4 + dx, -0.2, 17 + side);
        this.scene.add(post);
      }
    }
    // Tono's flat-barge, tied and drifting on its rope
    const barge = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 1.7),
      new THREE.MeshStandardMaterial({ map: plankTexture('#7a5636', 2), roughness: 0.9 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
    pole.position.set(1.2, 1.5, 0);
    pole.rotation.z = 0.35;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7),
      new THREE.MeshStandardMaterial({ map: plankTexture('#9a7a4e', 1), roughness: 1 }));
    crate.position.set(-0.9, 0.5, 0.2);
    barge.add(hull, pole, crate);
    barge.position.set(RIVER_X + 0.6, -0.1, 18.6);
    this.scene.add(barge);
    this.envTick.push(() => {
      barge.position.y = -0.1 + Math.sin(this.t * 1.2) * 0.06;
      barge.rotation.z = Math.sin(this.t * 0.8) * 0.025;
    });
    this.markers.push({ x: RIVER_X - 2, z: 17, label: 'River Pier', color: '#c9a24a', kind: 'door' });
    this.interactables.push({
      pos: new THREE.Vector3(RIVER_X - RIVER_HALF + 1.4, 0, 17), radius: 2.6,
      label: 'Press <b>E</b> — take the ferry back to the mainland roads',
      handler: async () => {
        const pick = await choose('', 'Tono\'s barge runs downriver to the coach roads on the hour. Leave New Salmonan?', ['Take the ferry', 'Stay a while']);
        if (pick === 0) {
          this.player.save();
          this.finish({ kind: 'leave' });
        }
      },
    });
  }

  // ---------------- the river gate & the mural ----------------
  private buildRiverGateAndMural(): void {
    const x = 14, z = 13;
    const y = this.groundH(x, z);
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture('#9a9282', '#6a6254', 2), roughness: 0.9 });
    for (const side of [-2.6, 2.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.4, 0.8), stone);
      post.position.set(side, 1.7, 0);
      post.castShadow = true;
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 1), stone);
    lintel.position.y = 3.6;
    lintel.castShadow = true;
    g.add(lintel);
    // the mural wall, just south of the gate, facing the plaza
    const wall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.0, 0.5), stone);
    wall.position.set(-6.4, 1.5, 0.4);
    wall.castShadow = true;
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.6),
      new THREE.MeshStandardMaterial({ map: muralTexture(), roughness: 0.85 }));
    mural.position.set(-6.4, 1.55, 0.66);
    g.add(wall, mural);
    g.position.set(x, y, z);
    g.rotation.y = 0.25;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.2 });
    this.colliders.push({ pos: new THREE.Vector3(x - 6.2, 0, z + 2), r: 3.4 });
    this.label3d('🎨 The Mural of the Big Three', '#f2c14e', new THREE.Vector3(x - 6.4, y + 4.6, z + 2), 4.2);
    this.markers.push({ x: x - 6, z: z + 2, label: 'The Mural', color: '#f2c14e', kind: 'poi' });

    this.interactables.push({
      pos: new THREE.Vector3(x - 6.4, 0, z + 4), radius: 3.0,
      label: 'Press <b>E</b> — look at the mural',
      handler: async () => {
        await say('The Mural of the Big Three', SALMONAN_LORE.mural);
        await say('The Mural of the Big Three', 'Three painted figures over the river gate: dawn-red, storm-gold, root-green. Beneath them, in letters refreshed every spring: THEY CAME EVERY TIME.');
        if (this.player.flags['veil_fallen']) {
          await say('', 'You look at the mural differently now. Four continents of glaze and soft-lit documentaries — and one valley that paints what it actually remembers, with its own hands, every spring. This wall might be the most honest broadcast in the world.');
        }
      },
    });
  }

  // ---------------- market, inn, houses ----------------
  private buildMarket(): void {
    // the dawn-market square: stalls under cloth canopies
    const stall = (x: number, z: number, rotY: number, cloth: number) => {
      const g = new THREE.Group();
      const y = this.groundH(x, z);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1),
        new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 2), roughness: 0.9 }));
      counter.position.y = 0.45;
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.7),
        new THREE.MeshStandardMaterial({ color: cloth, roughness: 1, side: THREE.DoubleSide }));
      canopy.position.set(0, 2.0, 0);
      canopy.rotation.x = -0.4;
      for (const px of [-1.05, 1.05]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6),
          new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
        pole.position.set(px, 1.05, 0);
        g.add(pole);
      }
      for (let i = 0; i < 5; i++) {
        const goods = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6),
          new THREE.MeshStandardMaterial({ color: [0xf2a63a, 0xe8d44e, 0xd84a3a, 0x6cb45e][i % 4], roughness: 0.6 }));
        goods.position.set(-0.7 + (i % 3) * 0.7, 1.0, i < 3 ? -0.2 : 0.22);
        g.add(goods);
      }
      g.add(counter, canopy);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      this.scene.add(g);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.4 });
    };
    stall(-2, 8, 0.4, 0xd84a3a);
    stall(2.5, 9.5, -0.5, 0x4aa84e);
    stall(0.5, 5, 0.1, 0xe8c44e);
    stall(-4.5, 5.5, 0.9, 0x5a8ad8);
    this.markers.push({ x: 0, z: 7, label: 'Market', color: '#e8c47a', kind: 'poi' });
  }

  private buildInn(): void {
    const x = -11, z = 12;
    const y = this.groundH(x, z);
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#9a7a4e', 3), roughness: 0.95 });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 4), wood);
    hall.position.y = 1.3;
    hall.castShadow = true;
    const thatch = new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 4), roughness: 1 });
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 3, 1), thatch);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI;
    roof.position.y = 3.1;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2c2018 }));
    door.position.set(0, 0.8, 2.05);
    // chimney with cooking smoke — the loud kitchen at work
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8276', '#5a544a', 1), roughness: 0.95 }));
    chimney.position.set(2.2, 4.2, -0.6);
    g.add(hall, roof, door, chimney);
    g.position.set(x, y, z);
    g.rotation.y = 0.3;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.8 });
    this.label3d('🍲 The Loud Kitchen Inn', '#e8a45a', new THREE.Vector3(x, y + 5.6, z), 4.0);
    this.markers.push({ x, z, label: 'Inn', color: '#e8a45a', kind: 'building' });
    let smokeT = 0;
    this.envTick.push(dt => {
      smokeT += dt;
      if (smokeT > 0.6) {
        smokeT = 0;
        this.vfx.burst(new THREE.Vector3(x + 2.2, y + 5.2, z - 0.6), 0xd8d8d0,
          { count: 2, speed: 0.3, up: 1.2, gravity: -0.4, life: 1.6, size: 0.16 });
      }
    });
  }

  private buildHouses(): void {
    this.stiltHouse(-7, -2, 0.5);
    this.stiltHouse(7, -4, -0.7, 0.9, '#a8855a');
    this.stiltHouse(-15, 3, 1.0, 0.85, '#c49a66');
    this.stiltHouse(9, 16, -0.3, 0.9);
    this.stiltHouse(-3, 18, 0.15, 0.8, '#b08a52');
    this.stiltHouse(13, -10, -1.1, 0.85);
    this.stiltHouse(-20, 16, 0.7, 0.8, '#a8855a');
  }

  // ---------------- the paddies ----------------
  private buildPaddies(): void {
    // terraced paddies stepping up the west slope: ringed mud walls,
    // mirror-water tops, rows of young rice
    const terrace = (x: number, z: number, rad: number) => {
      const y = this.groundH(x, z);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad + 0.3, 0.55, 18),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#8a7a56', '#6a5a3e', 2), roughness: 1 }));
      wall.position.set(x, y + 0.27, z);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(rad - 0.25, rad - 0.25, 0.1, 18),
        new THREE.MeshStandardMaterial({ color: 0x7ab8a8, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.1 }));
    water.position.set(x, y + 0.52, z);
      this.scene.add(wall, water);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: rad + 0.2 });
      // rice rows
      const riceMat = new THREE.MeshStandardMaterial({ color: 0x6cc45e, roughness: 0.9 });
      for (let i = 0; i < Math.floor(rad * 5); i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * (rad - 0.7);
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 4), riceMat);
        tuft.position.set(x + Math.cos(a) * rr, y + 0.74, z + Math.sin(a) * rr);
        this.scene.add(tuft);
      }
      this.envTick.push(() => {
        (water.material as THREE.MeshStandardMaterial).opacity = 0.8 + Math.sin(this.t * 0.8 + x) * 0.06;
      });
    };
    terrace(-27, -4, 4.2);
    terrace(-31, 3, 3.6);
    terrace(-24, 5, 3.2);
    terrace(-30, -12, 3.4);
    this.markers.push({ x: -28, z: -2, label: 'Paddies', color: '#7ad8a8', kind: 'poi' });
    this.interactables.push({
      pos: new THREE.Vector3(-23, 0, 0), radius: 2.6,
      label: 'Press <b>E</b> — the terraced paddies',
      handler: async () => {
        await say('', 'Mirror-water terraces step up the west slope, each one holding a piece of the afternoon sky. The valley has fed itself from these since before anyone\'s grandmother — and during the war years, fed three very hungry legends too.');
        await say('', 'A hand-painted sign leans by the path: "STEP IN THE PADDY AND YOU PLANT THE NEXT ROW. House rules. —the whole valley"');
      },
    });
  }

  // ---------------- Ivan's hill ----------------
  private buildIvansHill(): void {
    const x = -14, z = -24;
    const y = this.groundH(x, z);
    // the hill house: wider, lower, a porch that has fed half the valley
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a3a', 3), roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.0, 3.4), wood);
    body.position.y = 1.5;
    body.castShadow = true;
    const thatch = new THREE.MeshStandardMaterial({ map: plankTexture('#c8a45a', 4), roughness: 1 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.5, 4), thatch);
    roof.position.y = 3.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    // the porch
    const porch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 1.8), wood);
    porch.position.set(0, 0.55, 2.5);
    for (const px of [-2, 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), wood);
      post.position.set(px, 1.4, 3.2);
      g.add(post);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 2.0), thatch);
    awning.position.set(0, 2.3, 2.6);
    // the long porch table
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.8), wood);
    table.position.set(0.4, 1.0, 2.5);
    g.add(body, roof, porch, awning, table);
    g.position.set(x, y, z);
    g.rotation.y = 0.5;
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.2 });
    this.label3d('🏡 The Hill House', '#e8c47a', new THREE.Vector3(x, y + 5.4, z), 4.0);
    this.markers.push({ x, z, label: 'Ivan\'s House', color: '#c4822a', kind: 'building' });
  }

  // ---------------- the relay tower ----------------
  private buildRelayTower(): void {
    const x = 12, z = -25;
    const y = this.groundH(x, z);
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a96, metalness: 0.7, roughness: 0.45 });
    // four splayed legs, cross-braced — a battered valley lattice tower
    const H = 9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, H, 5), metal);
      leg.position.set(sx * 0.7, H / 2, sz * 0.7);
      leg.rotation.x = sz * -0.06;
      leg.rotation.z = sx * 0.06;
      g.add(leg);
    }
    for (let i = 1; i <= 3; i++) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1.7 - i * 0.3, 0.07, 1.7 - i * 0.3), metal);
      brace.position.y = i * 2.4;
      g.add(brace);
    }
    // the dish, patched with un-matching plates, and the beacon
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), metal);
    dish.position.y = H + 0.2;
    dish.rotation.x = -0.7;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe85a4a, emissive: 0xe83a2a, emissiveIntensity: 1.6 }));
    beacon.position.y = H + 1;
    g.add(dish, beacon);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.3 });
    this.label3d('📡 The Valley Relay', '#5ab8e8', new THREE.Vector3(x, y + H + 2.4, z), 4.0);
    this.markers.push({ x, z, label: 'Relay Tower', color: '#5ab8e8', kind: 'building' });
    this.envTick.push(() => {
      const blink = (Math.sin(this.t * 2.4) + 1) / 2;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + blink * 1.6;
    });
    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z + 1.4), radius: 2.4,
      label: 'Press <b>E</b> — the battered relay tower',
      handler: async () => {
        await say('', 'The tower that told the truth. Nineteen years of patches, three colors of un-matching plate, and one famous night when the whole valley crowded around its base while Ivan\'s real record went out to four continents.');
        await say('', 'Someone has hung a small wreath of rice stalks on the lowest brace. Nobody takes credit for it. Somebody re-freshens it weekly.');
      },
    });
  }

  // ---------------- the ridge stair → the Mirrorhouse ----------------
  private buildRidgeStair(): void {
    const x = 33, z = -19;
    const y = this.groundH(x, z);
    // black-glass gate set into the ridge rock
    this.rock(x - 2.6, z - 1, 2.2, 2.2);
    this.rock(x + 2.4, z - 1.6, 2.0, 2.4);
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0x16161e, metalness: 0.8, roughness: 0.15 });
    for (const side of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.8, 0.5), glass);
      post.position.set(side, 1.9, 0);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.6), glass);
    lintel.position.y = 3.9;
    // the FT sigil — a cold white seam-light eye
    const sigil = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xc8d2ff, side: THREE.DoubleSide }));
    sigil.position.set(0, 4.5, 0);
    g.add(lintel, sigil);
    // stair steps climbing into the ridge
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture('#5a5a64', '#3a3a44', 2), roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.8), stone);
      step.position.set(0, 0.2 + i * 0.24, -0.6 - i * 0.7);
      g.add(step);
    }
    g.position.set(x, y, z);
    g.rotation.y = Math.PI; // facing the valley
    this.scene.add(g);
    const glow = new THREE.PointLight(0xc8d2ff, 6, 9);
    glow.position.set(x, y + 3, z);
    this.scene.add(glow);
    this.envTick.push(() => { glow.intensity = 4.5 + Math.sin(this.t * 1.1) * 1.8; });
    this.label3d('🪞 The Mirrorhouse Stair', '#c8d2ff', new THREE.Vector3(x, y + 6, z), 4.0);
    this.markers.push({ x, z, label: 'Mirrorhouse', color: '#c8d2ff', kind: 'poi' });

    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z + 1.6), radius: 2.8,
      label: 'Press <b>E</b> — the Mirrorhouse stair',
      handler: async () => {
        const p = this.player;
        if (!p.flags['mirrorhouse_unlocked']) {
          await say('', 'A gate of black glass, sealed with a cold white seam of light. No handle, no knocker, no keyhole — buildings like this are not entered, they are ADMITTED INTO. From somewhere far up the ridge comes a hum, very steady, like a press that has never once stopped.');
          if (questState(p, 'story_veilfall') === 'active') {
            await say('', 'Ivan\'s words come back to you: the gears first. Esta\'s logs, Dalisay\'s crystal, and that "sketch artist" by the mural. Bring the proofs, and the way up will follow.');
          }
          return;
        }
        const pick = await choose('', 'The seam of light gutters where the Override Ledger touches it — Esta\'s copied stamp confuses the gate long enough for it to open. Cold, paper-dry air drifts down the stair. Climb to the Mirrorhouse?', ['Climb (Lv 46–52, warden Lv 54)', 'Not yet']);
        if (pick === 0) {
          this.player.save();
          this.finish({ kind: 'dungeon', def: DUNGEONS.find(d => d.id === 'mirrorhouse')! });
        }
      },
    });
  }

  // ---------------- festival lanterns ----------------
  private buildFestivalLanterns(): void {
    // the gratitude festival's paper lanterns, still strung across the
    // plaza — nobody has had the heart to take them down
    const strings: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-4.5, 0, 5.5), new THREE.Vector3(2.5, 0, 9.5)],
      [new THREE.Vector3(-2, 0, 8), new THREE.Vector3(7, 0, 16)],
      [new THREE.Vector3(-11, 0, 12), new THREE.Vector3(-2, 0, 8)],
    ];
    const cols = [0xf2a63a, 0xe85a8a, 0x5ad8e8, 0xf2d23a, 0x9a6af2];
    for (const [a, b] of strings) {
      a.y = this.groundH(a.x, a.z) + 3.4;
      b.y = this.groundH(b.x, b.z) + 3.4;
      const lanterns: THREE.Mesh[] = [];
      for (let i = 1; i <= 4; i++) {
        const f = i / 5;
        const pos = a.clone().lerp(b, f);
        pos.y -= Math.sin(f * Math.PI) * 0.5; // the string sags
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7),
          new THREE.MeshStandardMaterial({
            color: cols[(i + Math.floor(a.x)) % cols.length],
            emissive: cols[(i + Math.floor(a.x)) % cols.length], emissiveIntensity: 0.65, roughness: 0.8,
          }));
        lan.scale.y = 1.3;
        lan.position.copy(pos);
        this.scene.add(lan);
        lanterns.push(lan);
      }
      // each string casts real light on the plaza below it after sundown
      const mid = a.clone().lerp(b, 0.5);
      const stringLight = new THREE.PointLight(0xffb86a, 0, 11);
      stringLight.position.set(mid.x, mid.y - 0.4, mid.z);
      this.scene.add(stringLight);
      const ph = Math.random() * Math.PI * 2;
      this.envTick.push(() => {
        lanterns.forEach((lan, i) => {
          lan.rotation.z = Math.sin(this.t * 1.3 + ph + i) * 0.12;
          // paper lanterns come into their own after sundown
          (lan.material as THREE.MeshStandardMaterial).emissiveIntensity =
            0.4 + worldClock.night * 0.9 + Math.sin(this.t * 2 + i * 1.7) * 0.15;
        });
        stringLight.intensity = (1.2 + worldClock.night * 7.5) * (1 + Math.sin(this.t * 2.1 + ph) * 0.06);
      });
    }
  }

  // ---------------- village lamps: real light after dark ----------------
  /**
   * The valley's working light: oil lamps on carved posts at every place
   * people actually go after supper — the market, the inn porch, the pier,
   * the bridgehead, the mural and Ivan's hill path. Wicks are trimmed low
   * by day and bloom warm at night, each with its own slow flicker.
   */
  private buildVillageLamps(): void {
    const lamp = (x: number, z: number, color = 0xffc46a) => {
      const y = this.groundH(x, z);
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.0, 6),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a4228', 1), roughness: 0.9 }));
      post.position.y = 1.0;
      post.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.85 }));
      cap.position.y = 2.18;
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7),
        new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: color, emissiveIntensity: 0.3 }));
      glass.position.y = 2.0;
      g.add(post, cap, glass);
      g.position.set(x, y, z);
      this.scene.add(g);
      this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.28 });
      const light = new THREE.PointLight(color, 0, 10);
      light.position.set(x, y + 2.1, z);
      this.scene.add(light);
      const ph = Math.random() * Math.PI * 2;
      this.envTick.push(() => {
        const flicker = 1 + Math.sin(this.t * 8.7 + ph) * 0.07 + Math.sin(this.t * 19 + ph * 2) * 0.04;
        light.intensity = (1.4 + worldClock.night * 8.5) * flicker;
        (glass.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + worldClock.night * 1.3;
      });
    };
    lamp(1.5, 6.6);            // the market square
    lamp(-9.2, 14.6);          // the inn porch
    lamp(19.2, 15.6);          // the river pier
    lamp(20.2, 6.6);           // the bridgehead
    lamp(7.6, 16.4);           // the mural, lit for evening admirers
    lamp(-13.2, -19.8);        // the foot of Ivan's hill

    // the inn's windows glow with kitchen-light after dark
    {
      const winMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xc9892a, emissiveIntensity: 0.15 });
      const innY = this.groundH(-11, 12);
      for (const wx of [-12.8, -9.2]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.08), winMat);
        win.position.set(wx, innY + 1.5, 14.06);
        this.scene.add(win);
      }
      this.envTick.push(() => { winMat.emissiveIntensity = 0.12 + worldClock.night * 1.2; });
    }
  }

  // ---------------- flora & fauna ----------------
  private scatterFlora(): void {
    const trees: [number, number][] = [
      [-8, -12], [4, -14], [-19, -8], [18, 0], [16, 20], [6, 22], [-7, 22],
      [-17, 22], [-24, 12], [8, -20], [-2, -22], [-22, -18], [-9, -30],
      [3, -30], [18, -16], [30, 8], [31, 16], [34, -2], [-35, 10], [-36, -6],
      [20, -28], [26, -32], [-28, -24], [-18, -34], [0, 30], [-12, 30], [10, 30],
    ];
    for (const [x, z] of trees) {
      if (this.inRiver(x, z)) continue;
      this.tree(x, z, 3.0 + Math.random() * 1.8);
    }
    // reeds along the riverbanks
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x8aa85e, roughness: 0.95 });
    for (let i = 0; i < 40; i++) {
      const z = -40 + Math.random() * 80;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = RIVER_X + side * (RIVER_HALF + 0.5 + Math.random() * 1.2);
      if (Math.abs(z - BRIDGE_Z) < 2.5 || Math.abs(z - 17) < 3) continue;
      const reed = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9 + Math.random() * 0.7, 4), reedMat);
      reed.position.set(x, this.groundH(x, z) + 0.4, z);
      reed.rotation.z = (Math.random() - 0.5) * 0.3;
      this.scene.add(reed);
    }
    // wildflowers in the meadow
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 28;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.inRiver(x, z)) continue;
      if (this.colliders.some(cl => Math.hypot(x - cl.pos.x, z - cl.pos.z) < cl.r + 0.5)) continue;
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5),
        new THREE.MeshStandardMaterial({ color: [0xf2e85a, 0xf25a8a, 0xe8e8f2, 0xf2a63a][i % 4], roughness: 0.6 }));
      bloom.position.set(x, this.groundH(x, z) + 0.16, z);
      this.scene.add(bloom);
    }
  }

  private spawnDragonflies(): void {
    for (let i = 0; i < 7; i++) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: [0x5ad8e8, 0x8af2a0, 0xf2d23a, 0xb18ae8][i % 4], side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), mat);
      const wingR = wingL.clone();
      wingL.position.x = -0.12; wingR.position.x = 0.12;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.3, 4), mat);
      body.rotation.x = Math.PI / 2;
      grp.add(wingL, wingR, body);
      // they hover near water — river or paddies
      const nearRiver = i % 2 === 0;
      const anchor = nearRiver
        ? new THREE.Vector3(RIVER_X + (Math.random() - 0.5) * 5, 0, -30 + Math.random() * 55)
        : new THREE.Vector3(-27 + (Math.random() - 0.5) * 8, 0, -4 + (Math.random() - 0.5) * 10);
      anchor.y = this.groundH(anchor.x, anchor.z) + 1 + Math.random() * 0.8;
      grp.position.copy(anchor);
      this.scene.add(grp);
      this.dragonflies.push({ grp, anchor, phase: Math.random() * Math.PI * 2, wingL, wingR });
    }
  }

  private driftClouds(): void {
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 1, depthWrite: false });
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

  // ================= the valley folk =================
  private villager(opts: VoxelHumanOpts, x: number, z: number, faceTo: [number, number],
    name: string, label: string, handler: () => Promise<void>): THREE.Group {
    const g = makeVoxelHuman(opts);
    const y = this.groundH(x, z);
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(faceTo[0] - x, faceTo[1] - z);
    tagNpc(g, name);
    this.scene.add(g);
    this.npcs.push(g);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
    this.interactables.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.8, label: `Press <b>E</b> — ${label}`, handler });
    this.label3d(name, '#e8d9a8', new THREE.Vector3(x, y + 2.5, z), 2.4);
    return g;
  }

  private placeTownsfolk(): void {
    const p = this.player;

    // —— Ferryman Tono, by the pier ——
    this.villager({ top: 0x4ec45e, hair: 0x2a2a3a, cap: 0xc9a24a, hairstyle: 'classic' }, RIVER_X - 3.4, 16, [RIVER_X, 17],
      'Ferryman Tono', 'talk to Ferryman Tono', async () => {
        if (questState(p, 'story_veilfall') === 'active') {
          await say('Ferryman Tono', 'The river told me trouble was coming a day before that "FORGERY" broadcast — went all quiet under the pole, like it didn\'t want to be quoted. You watch: the river\'s never once printed a correction.');
        } else if (p.flags['veil_fallen']) {
          await say('Ferryman Tono', 'Sixteen years they wrote tomorrow\'s news, eh? Not for this valley. Down here tomorrow\'s news is whatever Auntie Dalisay says it is, and she has NEVER been scooped.');
        } else {
          await say('Ferryman Tono', 'Welcome to New Salmonan, friend. Mind the geese on the far bank — they unionized during the war and they\'ve never forgotten it.');
        }
      });

    // —— Auntie Dalisay, queen of the market — proof two of three ——
    this.villager({ top: 0xd84a3a, hair: 0xd8d8d8, cap: 0xf2ead0, hairstyle: 'buns' }, 0.5, 7, [0, 8],
      'Auntie Dalisay', 'talk to Auntie Dalisay', async () => {
        if (questState(p, 'story_veilfall') === 'active' && !p.flags['salm_proof_crystal']) {
          await conversation([
            ['Auntie Dalisay', `You're the tamer from the broadcast night! Sit, eat — no arguments, market rules. Now. Ivan sent you about the LIE, didn't he. Good. GOOD. Auntie has been WAITING.`],
            ['Auntie Dalisay', `My nephew Bino recorded the whole festival on his crystal — the broadcast going out, the valley cheering, Ivan's Liwa on her papa's shoulders. LIVE. Unedited. The crystal doesn't lie; it's too cheap to know how.`],
            ['Auntie Dalisay', `Then Foretales airs their "coverage". Same shots — SAME SHOTS, from a crew nobody here saw — except in theirs the crowd is thin, the cheering is "scattered applause", and the banner over the gate reads CAUTION URGED. Our banner said WELCOME HOME, IVAN. I sewed it. I have the receipts for the thread.`],
            ['Auntie Dalisay', `Take Bino's crystal to Ivan. Side by side with their version, it proves the picture was rewritten before it ever left the valley. And tell him Auntie says: this time, we keep the receipts.`],
          ]);
          p.flags['salm_proof_crystal'] = true;
          p.save();
          sfx('confirm');
          toast('📀 Proof secured: the unedited festival crystal!', 'gold');
          syncStoryQuests(p).forEach(n => toast(n, 'gold'));
        } else if (p.flags['salm_proof_crystal'] && questState(p, 'story_veilfall') === 'active') {
          await say('Auntie Dalisay', 'Crystal\'s with you, receipts are with me, and my eyes are on every stranger who buys vegetables wrong. Go on — Esta next, or that "sketch artist" by the mural. Auntie does not trust a man who draws the same wall fourteen times.');
        } else if (p.flags['veil_fallen']) {
          await say('Auntie Dalisay', 'Sixteen years of fake polls! SIXTEEN! And they never once polled THIS market, because Auntie\'s exit poll is a ladle and it has a one hundred percent response rate.');
        } else {
          while (true) {
            const stock: [string, number][] = [['berry', 20], ['honey_roll', 60], ['tonic', 50]];
            const pick = await choose('Auntie Dalisay',
              `Fresh off the morning boats and the noon ovens! You hold ◆${p.shards}.`,
              [...stock.map(([id, cost]) => `${ITEMS[id].name} — ◆${cost}`), 'Just browsing']);
            if (pick >= stock.length) return;
            const [id, cost] = stock[pick];
            if (p.shards < cost) { await say('Auntie Dalisay', 'Light pockets! Take a smell for free — the smell is forty percent of the roll.'); continue; }
            if (!p.addItem(id)) { await say('Auntie Dalisay', 'Your bags are FULL, child. Eat something. You\'re making Auntie nervous.'); continue; }
            p.shards -= cost;
            sfx('confirm');
            toast(`Bought ${ITEMS[id].name}!`, 'gold');
            updateHUD(p, 'New Salmonan');
          }
        }
      });

    // —— Relay-Keeper Esta, at the tower — proof one of three ——
    this.villager({ top: 0x5ab8e8, hair: 0x7a4a2a, cap: null, hairstyle: 'ponytail' }, 13.8, -23, [12, -25],
      'Relay-Keeper Esta', 'talk to Relay-Keeper Esta', async () => {
        if (questState(p, 'story_veilfall') === 'active' && !p.flags['salm_proof_relay']) {
          await conversation([
            ['Relay-Keeper Esta', `Nineteen years I've climbed this tower at dawn to log what the signal did overnight. The night of Ivan's broadcast, I wrote the proudest entry of my life. Thirty-six hours later I climbed up and found my tower had been TALKED OVER.`],
            ['Relay-Keeper Esta', `Look at the log. Every relay packet carries a routing stamp — it's how keepers trace a signal home. The "FORGERY" broadcast didn't come from the network spine like normal programming. It came down from the RIDGE. Stamped FT-PRIME, priority absolute, override-all.`],
            ['Relay-Keeper Esta', `Here's the part that keeps me up. The Relay-Keepers' Round circulates old anomaly reports, keeper to keeper, the slow way — paper, so nothing can be wiped. FT-PRIME appears exactly twice in forty years of circulars. Once is my log. The other is the night the gate-records hall burned in Hyujon.`],
            ['Relay-Keeper Esta', `I made copies. Of course I made copies — I made copies of the COPIES. Take the log scroll to Ivan, and tell him a keeper's stamp doesn't lie: whoever erased him is broadcasting from our ridge.`],
          ]);
          p.flags['salm_proof_relay'] = true;
          p.save();
          sfx('confirm');
          toast('📜 Proof secured: the FT-PRIME relay log!', 'gold');
          syncStoryQuests(p).forEach(n => toast(n, 'gold'));
        } else if (p.flags['salm_proof_relay'] && questState(p, 'story_veilfall') === 'active') {
          await say('Relay-Keeper Esta', 'The log\'s with you and three more copies are where even I can\'t find them without a rhyme I memorized. Keeper rules. The signal is sacred — and somebody on that ridge is going to learn what we do to people who talk over it.');
        } else if (p.flags['veil_fallen']) {
          await say('Relay-Keeper Esta', 'The ridge went quiet. NINETEEN YEARS that hum sat under my logs like a wasp in the rafters, and I\'d stopped hearing it — until you made it stop. First silent dawn of my career. I logged it twice, just for the joy.');
        } else {
          await say('Relay-Keeper Esta', 'Keeper of the valley relay, at your service. If you ever wonder whether anyone checks what the broadcast crystals say at three in the morning — yes. Me. With tea.');
        }
      });

    // —— Innkeeper Bo, at the Loud Kitchen — free Sanctum-grade rest ——
    this.villager({ top: 0xc4822a, hair: 0x4a3a2a, cap: 0xf2ead0, hairstyle: 'classic' }, -9, 14.5, [-11, 12],
      'Innkeeper Bo', 'rest at the Loud Kitchen Inn', async () => {
        await say('Innkeeper Bo', 'Tamers sleep free here since the broadcast night — paid in full, in advance, forever, by one evening of the truth. Kitchen\'s loud, beds are soft, stew\'s on. In you go.');
        p.healAll();
        p.save();
        sfx('heal');
        toast('💤 Your team is fully rested — on the house, forever.', 'gold');
        updateHUD(p, 'New Salmonan');
      });

    // —— Maris Lawrence, by the hill house garden ——
    this.villager({ top: 0xd87a9a, hair: 0x2a2a3a, cap: null, hairstyle: 'long' }, -11.5, -21.5, [-14, -24],
      'Maris Lawrence', 'talk to Maris Lawrence', async () => {
        if (questState(p, 'story_mirrorhouse') === 'ready' || p.flags['veil_fallen']) {
          await say('Maris Lawrence', 'Nine years I watched him not look at that ridge. This morning he stood on the porch with his coffee and looked at it for one whole hour. Then he asked Liwa about her mock-bracket like nothing happened. That\'s how I know you brought something back worth bringing.');
        } else if (questState(p, 'story_veilfall') === 'active') {
          await say('Maris Lawrence', 'When the "FORGERY" broadcast aired, the whole valley came up this hill with food. Not comfort food — SIEGE food. Auntie Dalisay organized shifts. Whatever Foretales thinks it does to people\'s minds, it has never once met a valley like this one.');
        } else {
          await say('Maris Lawrence', 'Welcome to the hill, tamer. Mind the porch step — half the valley has tripped on it, and Ivan refuses to fix it because, quote, "it\'s an honesty test".');
        }
      });

    // —— Liwa, in the yard ——
    this.villager({ top: 0xf2d23a, hair: 0x1a1a2e, cap: null, hairstyle: 'buns' }, -16.5, -20.5, [-14, -24],
      'Liwa', 'talk to Liwa', async () => {
        if (p.flags['veil_fallen']) {
          await say('Liwa', 'Dad says the people in the glass house wrote the news before it happened. So I checked EVERY broadsheet from my last mock-bracket. They spelled my alias wrong. BEFORE the bracket. I\'m keeping that page forever — it\'s my first ever erasure!');
        } else {
          await say('Liwa', 'I knew it was Dad on the mural the WHOLE nine years. The mural has his NOSE. Adults kept saying "what mural, Liwa" — adults are the worst at noses.');
        }
      });
  }

  // ================= IVAN =================
  private placeLawrences(): void {
    const p = this.player;
    const x = -13, z = -21; // on the porch end
    const y = this.groundH(x, z);
    const ivan = makeVoxelHuman({
      skin: 0xc8956a, hair: 0x3a2a1a, top: 0xc4822a, bottom: 0x3a3a4e, shoes: 0x2a2a36,
      cap: null, hairstyle: 'classic',
    });
    ivan.position.set(x, y, z);
    ivan.rotation.y = Math.PI * 0.9; // facing his valley
    ivan.scale.setScalar(1.06);
    tagNpc(ivan, 'Ivan Lawrence');
    this.scene.add(ivan);
    this.npcs.push(ivan);
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.6 });
    this.label3d('🏆 Ivan Lawrence', '#c4822a', new THREE.Vector3(x, y + 2.8, z), 3.4);

    this.interactables.push({
      pos: new THREE.Vector3(x, 0, z), radius: 2.4,
      label: 'Press <b>E</b> — speak with Ivan Lawrence',
      handler: async () => this.ivanTalk(p, ivan),
    });
  }

  private async ivanTalk(p: Player, ivan: THREE.Group): Promise<void> {
    // face the player
    const d = this.tamer.position.clone().sub(ivan.position);
    ivan.rotation.y = Math.atan2(d.x, d.z);

    // ---- first meeting: the veil starts to fall ----
    if (!p.flags['met_ivan']) {
      await runCinematicScene('porch', async cine => {
        cine.shot('wide');
        await say('Ivan Lawrence', `There you are. The tamer who walked a stolen ledger up a stranger's hill and gave him his name back. Maris! Put another plate out — no, the GOOD plates, we discussed this!`);
        cine.shot('ivan');
        await say('Ivan Lawrence', `I'd offer you a quiet dinner and a week of fishing, friend. I'd have LOVED to offer you that. But you've seen the crystals, or you're about to. Sit down. This is going to be ugly.`);
        await say('Ivan Lawrence', `Thirty-six hours. That's how long my name stayed clean. Then every crystal on four continents, same hour, same calm faces: "THE LAWRENCE TAPES — A FORGERY?" Question mark doing all the work, the way it always does. The valley watched the truth go out from its own tower… and then watched the world get told it never happened.`);
        await say('Ivan Lawrence', `Here's what nine years of being erased teaches you: the Sponsors were never the whole animal. They were a FINGER. The hand is Foretales — the network itself. The news you grew up inside, friend. The polls. The serials. The morning headlines four continents read at the same hour and call the weather.`);
        
        sfx('blip');
        cine.shot('wide');
        await say('Greggy (relay)', `—krzzt— Ivan, you old fraud, is the kid there? Good. Listen, both of you. I did some arithmetic last night and I want somebody to tell me I'm wrong.`);
        await say('Greggy (relay)', `SIXTEEN YEARS since any continent seated a proper leader. Sixteen! Every cycle the same story: front-runner withdraws, or drowns in scandal, or just… stops being MENTIONED. And every poll that "discovered the public never wanted them anyway" — run through a Foretales subsidiary. I checked. Veyl double-checked. Veyl is currently lying down.`);
        await say('Greggy (relay)', `It runs deep, kid. It runs wide. And from what they did to Ivan here — it runs VIOLENT. One more thing and then I need to shout at an ocean: have you ever ONCE seen Aljay sit for them? Real interviews from the three of us — you can count them on one hand. Everything else is fabricated. And I'm starting to think… something more. Greggy out. —krzzt—`);
        
        cine.shot('ivan');
        await say('Ivan Lawrence', `…He does that. No goodbye for nine years, now he won't get off my relay. ANYWAY.`);
        await say('Ivan Lawrence', `They rewrote the valley's own broadcast from somewhere CLOSE — overrides don't travel far, that's relay physics, Esta will explain it until you beg her to stop. So we show the world the gears while they're still turning. Three proofs, friend. Esta's tower logs. Auntie Dalisay's unedited festival crystal. And that "traveling sketch artist" who's been drawing our mural for three days and asking the children very soft questions. NOBODY sketches a wall fourteen times.`);
        
        p.flags['met_ivan'] = true;
        p.save();
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));
        
        cine.shot('hero');
        await say('Ivan Lawrence', 'Esta at the tower. Dalisay in the market. The stranger by the mural — and watch that one, friend. Foretales stringers travel with company. The ugly kind.');
      });
      updateHUD(p, 'New Salmonan');
      return;
    }

    // ---- Chapter XXII turn-in: three proofs → the Mirrorhouse names itself ----
    if (questState(p, 'story_veilfall') === 'ready') {
      await runCinematicScene('porch', async cine => {
        cine.shot('wide');
        await say('Ivan Lawrence', `Esta's log. Bino's crystal. And the stringer's own assignment book — he had a LEDGER? Of course he had a ledger. The machine writes everything down; that was always going to be how the machine dies.`);
        cine.shot('ivan');
        await say('Ivan Lawrence', `Look at the routing stamp, friend. FT-PRIME, priority absolute — and the ledger's drop point is "RELAY BASTION 9, EAST VALLEYS." We've poled rice past that building my whole life. The locals have a better name for it: the MIRRORHOUSE. Because whatever you carry up that road, the world is shown something else.`);
        await say('Ivan Lawrence', `Sixteen years of headlines for every valley east of the capital — written THERE. Edited THERE. My erasure, stamped THERE. It was never some distant tower in some glittering city. It was on our ridge, humming over our paddies, the whole time.`);
        await say('Ivan Lawrence', `…You know what's funny? Nine years I thought the machine that broke me was too big to see. Turns out I could see it from my porch.`);

        const summary = completeQuest(p, 'story_veilfall');
        toast('✅ Chapter XXII complete: The Veil, Falling!', 'gold');
        if (summary) toast(`Received ${summary}`, 'gold');
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));

        cine.shot('hero');
        await say('Ivan Lawrence', `The ledger and Esta's stamp-copies will fool that gate long enough to admit you — keepers and stringers carry the same keys, they just file different reports.`);
        await say('Ivan Lawrence', `Find the master spool, friend. The Continuity Reel — the one they print TOMORROW from. And do one thing for me, personally. Check the date on the directive about my match-fixing. I want to know how long before my fall they wrote it.`);
      });
      updateHUD(p, 'New Salmonan');
      return;
    }
    if (questState(p, 'story_veilfall') === 'active') {
      const got = (p.flags['salm_proof_relay'] ? 1 : 0) + (p.flags['salm_proof_crystal'] ? 1 : 0) + (p.flags['salm_proof_stringer'] ? 1 : 0);
      await say('Ivan Lawrence', `${3 - got} proof${got === 2 ? '' : 's'} to go, friend. Esta at the tower, Dalisay in the market, the sketch artist by the mural. The valley's rooting for you — quietly, which for this valley is a sacrifice.`);
      return;
    }

    // ---- Chapter XXIII turn-in: the Continuity Reel ----
    if (questState(p, 'story_mirrorhouse') === 'ready') {
      await runCinematicScene('porch', async cine => {
        cine.shot('wide');
        sfx('boom');
        await say('Ivan Lawrence', `The ridge stopped humming an hour ago. Esta says it's the first silent dawn in nineteen years of logs. The whole valley keeps looking up like the sky changed color. Show me, friend. Show me what was up there.`);
        cine.shot('hero');
        await say(p.tamerName, `Sixteen years of front pages… filed before the events they report. Election withdrawals dated weeks before the candidates withdrew. Disasters with the coverage pre-written. And Ivan — your match-fixing scandal. The directive is dated TWO YEARS before your fall.`);
        cine.shot('ivan');
        await say('Ivan Lawrence', `Two years. They had me drafted two years before they spent me. I wasn't even news, friend. I was INVENTORY.`);
        await say('Ivan Lawrence', `…Give me a moment.`);
        await say('Ivan Lawrence', `…All right. All right. The last frame — Maris said there was a last frame. Read it to me. I want to hear it out loud, on my own porch, in daylight.`);
        cine.shot('hero');
        await say(p.tamerName, `"Standing directive, all desks, regarding the Dawnflame, the Stormheart and the Worldroot: GLAZE. DO NOT TOUCH. NOT YET. SOON."`);
        cine.shot('ivan');
        await say('Ivan Lawrence', `Not yet. SOON. Four continents of anniversary specials and soft-lit documentaries — and underneath, a loaded gun with my best friend's name on it, waiting for a date. THAT'S why Aljay never sat for them. He counted the true interviews same as Greggy: one hand. He KNEW the glaze was a leash they hadn't pulled yet.`);
        
        sfx('blip');
        cine.shot('wide');
        await say('Greggy (relay)', `—krzzt— I heard "soon". Define "soon". No — don't. I've grounded storms with better manners than whatever wrote that sentence.`);
        await say('Greggy (relay)', `Kid. You just took the eastern valleys' tomorrow out of their hands — the first piece of the machine anyone has EVER taken. They'll notice. The veil is falling now, one valley at a time, and what's behind it was already looking at the three of us. Rest tonight. Eat whatever Dalisay forces on you. The next move is mine to arrange and yours to make. Greggy out. —krzzt—`);
        
        cine.shot('ivan');
        await say('Ivan Lawrence', `You heard the thunderhead. Tonight the valley eats by lantern light and tomorrow the broadsheets won't know what happened to their tomorrow — because for once, NOBODY wrote it yet. First unwritten morning in sixteen years, friend. You did that.`);

        const summary = completeQuest(p, 'story_mirrorhouse');
        toast('✅ Chapter XXIII complete: The Mirrorhouse!', 'gold');
        if (summary) toast(`Received ${summary}`, 'gold');
        toast('📖 The Chronicle — the veil is falling. Foretales knows your name now…', 'gold');
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));
      });
      updateHUD(p, 'New Salmonan');
      return;
    }
    if (questState(p, 'story_mirrorhouse') === 'active') {
      await say('Ivan Lawrence', 'The ridge stair, friend — north-east wall of the valley, the black gate with the cold white eye. Five floors of dead glass and a print floor that never stops. Esta\'s copies will get you through the gate. Tonics. ALL the tonics.');
      return;
    }

    // ---- post-arc / fallback ----
    if (p.flags['veil_fallen']) {
      await say('Ivan Lawrence', 'First unwritten week in sixteen years and the broadsheets are visibly PANICKING about having to report things that occurred. Stay for dinner, friend. We\'re teaching Liwa to fish and she\'s teaching us humility.');
    } else {
      await say('Ivan Lawrence', 'Good air today. The valley does that — it gives you back the days they took. Most of them, anyway.');
    }
  }

  // ================= QUILL — the Foretales stringer =================
  private placeQuill(): void {
    const p = this.player;
    // only present during Chapter XXII, until his ledger is taken
    if (questState(p, 'story_veilfall') !== 'active' || p.flags['salm_proof_stringer']) return;
    // a respectable sketching distance from the mural — outside its viewing
    // collider (the crowd-rope at (7.8, 15) r3.4), approachable from any side
    const x = 10.8, z = 18.6;
    const y = this.groundH(x, z);
    const quill = makeVoxelHuman({
      skin: 0xc8b49a, hair: 0x1a1a26, top: 0x5a5a6a, bottom: 0x2a2a36, shoes: 0x1a1a22,
      cap: 0x3a3a46, hairstyle: 'classic',
    });
    quill.position.set(x, y, z);
    quill.rotation.y = Math.atan2(7.9 - x, 15 - z); // "sketching" the mural
    tagNpc(quill, 'Quill');
    // his name tag and field lantern ride along in the group, so everything
    // about him leaves together when Dalisay's porters collect him
    {
      const cv = document.createElement('canvas');
      let ctx = cv.getContext('2d')!;
      ctx.font = 'bold 56px Trebuchet MS';
      cv.width = Math.max(512, Math.ceil(ctx.measureText('Quill').width) + 64);
      cv.height = 128;
      ctx = cv.getContext('2d')!;
      ctx.font = 'bold 56px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.lineWidth = 10; ctx.strokeStyle = '#0a0c18';
      ctx.strokeText('Quill', cv.width / 2, 80);
      ctx.fillStyle = '#d8d8e8';
      ctx.fillText('Quill', cv.width / 2, 80);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sp.renderOrder = 40;
      const scale = 2.6;
      sp.scale.set(scale * (cv.width / cv.height / 4), scale / 4, 1);
      sp.position.set(0, 2.5, 0);
      quill.add(sp);
      // a stringer works at all hours — his lantern keeps him findable after dark
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.8 }));
      post.position.set(0.6, 0.4, 0.4);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7),
        new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc46a, emissiveIntensity: 1.2 }));
      glass.position.set(0.6, 0.86, 0.4);
      const lampLight = new THREE.PointLight(0xffc46a, 7, 8);
      lampLight.position.set(0.6, 1.0, 0.4);
      quill.add(post, glass, lampLight);
      this.envTick.push(() => {
        if (!this.quillGroup) return;
        lampLight.intensity = 7 * (0.85 + Math.sin(this.t * 9.3) * 0.1 + Math.sin(this.t * 21) * 0.05);
      });
    }
    this.scene.add(quill);
    this.npcs.push(quill);
    this.quillGroup = quill;
    this.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
    const quillMarker: MapMarker = { x, z, label: 'Quill', color: '#d8d8e8', kind: 'npc' };
    this.markers.push(quillMarker);

    const quillTalk: Interactable = {
      pos: new THREE.Vector3(x, 0, z), radius: 2.2,
      label: 'Press <b>E</b> — talk to the "sketch artist"',
      handler: async () => {
        if (p.flags['salm_proof_stringer']) {
          await say('Quill', '…I have nothing further to sketch here.');
          return;
        }
        await conversation([
          ['Quill', `Beautiful mural, isn't it? Such… local color. I'm an artist — traveling, sketching, asking a few friendly questions. For instance: the broadcast the other night. Did you happen to see who operated the tower? Faces? Names? Purely for the composition.`],
          [p.tamerName, `Fourteen sketches of one wall. Soft questions for children. And a courier ledger in your satchel with a Foretales drop-stamp on the spine.`],
          ['Quill', `…Hm. You know, in nine years of fieldwork, nobody has ever read the SPINE.`],
          ['Quill', `Let's be professional about this. I'm what the network calls a continuity verifier. The valley's story drifted from the printed version — I verify which one persists. The ledger stays with me, friend-of-the-subject. Company policy. And company TRAVELS WITH ME.`],
        ]);
        const pick = await choose('', 'Quill\'s hand moves to a whistle of black glass. Two lean shadows detach themselves from the gate\'s shade — his "company".', ['Stand your ground', 'Back away (for now)']);
        if (pick !== 0) {
          await say('Quill', 'Wise. The version of today where you walked away tests very well. It\'s already written, in fact.');
          return;
        }
        this.busy = true;
        const result = await this.ctx.runBattle(
          [{ speciesId: 'nightloom', level: 42 }, { speciesId: 'duskweaver', level: 40 }],
          { intro: 'Quill\'s escort steps out of the shade — Anomaly-trained, Foretales-paid!', theme: 'storm', arena: 'mirrorhouse' });
        this.busy = false;
        if (result === 'win') {
          p.flags['salm_proof_stringer'] = true;
          p.save();
          sfx('confirm');
          await conversation([
            ['Quill', `…The escort tested very well too. Marvelous. Fine — FINE. The ledger. Take it. I'll file this under "local color".`],
            ['Quill', `One professional courtesy, tamer, free of charge: the Mirrorhouse prints TOMORROW. Whatever you think you're walking into up that ridge — they've already written how it ends. The fun part, the part that keeps me up at night?` ],
            ['Quill', `Lately… the drafts keep being WRONG about you people. Do give the editors my regards.`],
          ]);
          toast('📓 Proof secured: the stringer\'s assignment ledger!', 'gold');
          syncStoryQuests(p).forEach(n => toast(n, 'gold'));
          // Quill packs his sketches — and his label, lantern, collider and
          // talk prompt all leave with him; nothing ghostly stays behind
          if (this.quillGroup) {
            this.scene.remove(this.quillGroup);
            const i = this.npcs.indexOf(this.quillGroup);
            if (i >= 0) this.npcs.splice(i, 1);
            this.quillGroup = null;
          }
          const ti = this.interactables.indexOf(quillTalk);
          if (ti >= 0) this.interactables.splice(ti, 1);
          const ci = this.colliders.findIndex(c => c.pos.x === x && c.pos.z === z && c.r === 0.55);
          if (ci >= 0) this.colliders.splice(ci, 1);
          const mi = this.markers.indexOf(quillMarker);
          if (mi >= 0) this.markers.splice(mi, 1);
          await say('', 'Auntie Dalisay materializes with two market porters and personally escorts Quill to the inn\'s windowless "guest room" — for his protection, she announces, from her ladle.');
          updateHUD(p, 'New Salmonan');
        } else {
          p.healAll();
          await say('Quill', 'As written, I\'m afraid. Your team has been… patched. By the locals. Who are glaring at me. I would try again before my next filing deadline, if I were you.');
        }
      },
    };
    this.interactables.push(quillTalk);
  }

  // ================= per-frame =================
  private update(dt: number): void {
    if (!this.resolveExit) return;
    this.t += dt;
    this.vfx.update(dt);
    this.dayNight?.update(dt);
    for (const f of this.envTick) f(dt);

    // ---- point-light budget: nearest lamps win ----
    if (this.scenePointLights.length === 0) {
      this.scene.traverse(o => { if ((o as THREE.PointLight).isPointLight) this.scenePointLights.push(o as THREE.PointLight); });
    }
    const budget = perf.lightBudget;
    if (this.scenePointLights.length > budget) {
      const tp = this.tamer.position;
      this.lightRankTimer -= dt;
      const moved = Math.hypot(tp.x - this.lastRankX, tp.z - this.lastRankZ) > 1.5;
      if (moved || this.lightRankTimer <= 0) {
        this.lightRankTimer = 0.4;
        this.lastRankX = tp.x; this.lastRankZ = tp.z;
        this.scenePointLights
          .map(l => {
            const e = l.matrixWorld.elements;
            return { l, score: Math.hypot(e[12] - tp.x, e[14] - tp.z) };
          })
          .sort((a2, b2) => a2.score - b2.score)
          .forEach((r, i) => { r.l.visible = i < budget; });
      }
    }

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
        (!this.inRiver(x, z) || this.onBridge(x, z)) &&
        !this.colliders.some(cl => Math.hypot(x - cl.pos.x, z - cl.pos.z) < cl.r);
      if (free(nx, nz)) { this.tamer.position.x = nx; this.tamer.position.z = nz; }
      else if (free(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (free(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz);
    }
    const t = this.tamer.position;
    this.tamer.position.y = this.onBridge(t.x, t.z)
      ? Math.max(this.groundH(t.x, t.z), 0.52)
      : this.groundH(t.x, t.z);
    updateVoxelHuman(this.tamer, this.walking, dt);
    this.npcs.forEach(npc => updateVoxelHuman(npc, false, dt));

    // dragonflies skim, clouds drift
    for (const b of this.dragonflies) {
      b.phase += dt;
      b.grp.position.set(
        b.anchor.x + Math.sin(b.phase * 0.8) * 1.8,
        b.anchor.y + Math.sin(b.phase * 1.6) * 0.3,
        b.anchor.z + Math.cos(b.phase * 0.6) * 1.8,
      );
      b.grp.rotation.y = b.phase * 0.8;
      b.wingL.rotation.z = Math.sin(b.phase * 18) * 0.7;
      b.wingR.rotation.z = -Math.sin(b.phase * 18) * 0.7;
      b.grp.visible = worldClock.daylight > 0.15; // dragonflies roost at night
    }
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.7;
      if (cl.position.x > 110) cl.position.x = -110;
    }

    // camera
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
      markers: this.markers.filter(m => m.kind !== 'npc'),
      player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
      title: `🏞️ New Salmonan — ${worldClock.label}`,
      playerState: this.player,
    });
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, 'New Salmonan');
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
    else if (k === 'escape' || k === 'esc') {
      this.busy = true;
      openPauseMenu(this.player, { canSave: true }).then(() => {
        updateHUD(this.player, 'New Salmonan');
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  private detachPicker: (() => void) | null = null;

  private finish(result: SalmonanResult): void {
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

  run(): Promise<SalmonanResult> {
    this.buildScene();
    this.player.savedLocation = { type: 'salmonan', spawnAt: this.spawnAt };
    updateTamerAppearance(this.tamer, this.player.equippedClothes);
    syncStoryQuests(this.player).forEach(n => toast(n, 'gold'));
    updateHUD(this.player, 'New Salmonan');
    showHotkeys(true);
    // debug handle for automated testing
    (window as unknown as Record<string, unknown>).__valley = { valley: this, tamer: this.tamer };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.npcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy,
    });
    if (!this.player.flags['salm_arrived']) {
      this.player.flags['salm_arrived'] = true;
      this.player.save();
      say('', `🏞️ ${SALMONAN_LORE.name} — ${SALMONAN_LORE.epithet}. Woodsmoke, river-mud and rice on the wind. The gratitude festival's paper lanterns are still strung across the plaza — nobody has had the heart to take them down. ${FORETALES_LORE.face.split('.')[0]}… but the signal doesn't reach down here. It never did.`);
    }
    return new Promise<SalmonanResult>(res => { this.resolveExit = res; });
  }
}
