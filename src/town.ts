// ============================================================
// AZ Tamer — Haven City: voxel tamer walking mode, Grand Houses
// with unique exteriors AND enterable interiors, shop, garage,
// sanctum, bounty board, dungeon gate
// ============================================================
import * as THREE from 'three';
import { HOUSES, DUNGEONS, ITEMS, SHOP_STOCK, GEM_STOCK, CRAWLER_PARTS, SPECIES, type DungeonDef, type HouseDef } from './data';
import { Player, Guardian } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, makeGuardian, disposeRig, makeCrawler,
  groundTexture, plankTexture, stoneTexture, marbleTexture, tileTexture, bookshelfTexture,
  skyGradient, type GuardianRig,
} from './models';
import {
  say, conversation, choose, askName, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, openScreen, closeMenu, type PanelKind,
} from './ui';
import { mainChain, questState, acceptQuest, completeQuest } from './quests';
import { GUILD_LORE } from './guilds';
import { guildJoinCeremony } from './university';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';

const minimapCanvas = () => document.getElementById('minimap') as HTMLCanvasElement;

/** Lerp two #rrggbb colors. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// day/night sky keyframes: [top, bottom, fog]
const SKY_NIGHT: [string, string, string] = ['#0a1026', '#1c2444', '#141a30'];
const SKY_DAWN:  [string, string, string] = ['#e8945a', '#8a6aa8', '#a8809a'];
const SKY_DAY:   [string, string, string] = ['#7ab8e8', '#e8d8b8', '#d8d0c0'];
const SKY_DUSK:  [string, string, string] = ['#e8764a', '#5a4a88', '#9a6a70'];

/** Piecewise sky palette for a 0..1 day phase (0 = midnight, 0.5 = noon). */
function skyAt(t: number): [string, string, string] {
  const blend = (a: [string, string, string], b: [string, string, string], k: number): [string, string, string] =>
    [lerpHex(a[0], b[0], k), lerpHex(a[1], b[1], k), lerpHex(a[2], b[2], k)];
  if (t < 0.20) return SKY_NIGHT;
  if (t < 0.28) return blend(SKY_NIGHT, SKY_DAWN, (t - 0.20) / 0.08);
  if (t < 0.36) return blend(SKY_DAWN, SKY_DAY, (t - 0.28) / 0.08);
  if (t < 0.66) return SKY_DAY;
  if (t < 0.74) return blend(SKY_DAY, SKY_DUSK, (t - 0.66) / 0.08);
  if (t < 0.82) return blend(SKY_DUSK, SKY_NIGHT, (t - 0.74) / 0.08);
  return SKY_NIGHT;
}

interface Interactable {
  pos: THREE.Vector3; radius: number; label: string;
  handler: () => Promise<void>;
}

interface Bounty { id: string; desc: string; reward: { shards?: number; item?: string }; check: (p: Player) => boolean; }
const BOUNTIES: Bounty[] = [
  { id: 'b_win5', desc: 'Win 5 battles', reward: { shards: 200 }, check: p => p.battlesWon >= 5 },
  { id: 'b_win15', desc: 'Win 15 battles', reward: { shards: 600 }, check: p => p.battlesWon >= 15 },
  { id: 'b_cap1', desc: 'Befriend your first wild Guardian', reward: { shards: 300 }, check: p => p.capturesMade >= 1 },
  { id: 'b_cap3', desc: 'Befriend 3 wild Guardians', reward: { item: 'atk_gem' }, check: p => p.capturesMade >= 3 },
  { id: 'b_vault', desc: 'Conquer the Sunken Vault', reward: { shards: 800 }, check: p => !!p.dungeonClears['sunken'] },
  { id: 'b_storm', desc: 'Conquer the Stormspire Depths', reward: { item: 'wis_gem' }, check: p => !!p.dungeonClears['stormspire'] },
];

const ATTENDANT_TIPS: Record<string, string[]> = {
  pyrelight: [
    'Blaze techniques devastate Verdant foes, but fizzle against Tide. Check the foe before you commit!',
    'Striking with the basic attack builds SP. Open with strikes, finish with a big technique.',
  ],
  mistveil: [
    'Tide drowns Blaze and even erodes Umbra. But keep us away from Volt types — sparks and water…',
    'Our Spring Mend art can heal allies mid-battle. A healer in the back row wins long fights.',
  ],
  thornward: [
    'Verdant roots smother Tide types. Sap Drain steals the foe\'s life — patience wins.',
    'Guarding halves damage AND recovers SP. A patient tamer never runs dry.',
  ],
  stormcall: [
    'Volt strikes Gale from the sky and shocks Tide. Speed decides who acts first — train it!',
    'The Crawler\'s cannon can stun foes for a free first round. Ask Dax about upgrades.',
  ],
  duskwatch: [
    'Umbra devours Volt and singes Blaze. What the light hides, we hunt.',
    'Gift treats to wild Guardians during battle. Win their bond, and they may join you after.',
  ],
};

type Mode = 'street' | 'interior';

export class Town {
  private streetScene = new THREE.Scene();
  private interiorScene: THREE.Scene | null = null;
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120);
  private tamer = makeTamer();
  private keys = new Set<string>();
  private busy = false;
  private mode: Mode = 'street';
  private walking = false;

  private streetInteractables: Interactable[] = [];
  private streetColliders: { pos: THREE.Vector3; r: number }[] = [];
  private intInteractables: Interactable[] = [];
  private intColliders: { pos: THREE.Vector3; r: number }[] = [];
  private intNpcs: THREE.Group[] = [];
  private intRigs: GuardianRig[] = [];
  private intRoom = { w: 18, d: 13 };
  private exitSpot = new THREE.Vector3();

  // labeled minimap markers
  private streetMarkers: MapMarker[] = [];
  private intMarkers: MapMarker[] = [];
  private intName = '';

  // day/night cycle (0 = midnight, 0.5 = noon); a full day lasts 4 minutes
  private dayTime = 0.34;
  private skyTimer = 99;
  private sun: THREE.DirectionalLight | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private skyTex: THREE.Texture | null = null;

  // wandering townsfolk
  private walkers: {
    grp: THREE.Group; target: THREE.Vector3; pause: number;
    name: string; lines: string[]; talking: boolean;
  }[] = [];

  private resolveExit: ((dest: 'expedition' | 'university') => void) | null = null;

  constructor(private player: Player, private firstArrival: boolean) {}

  get view() {
    const self = this;
    return {
      get scene() { return self.mode === 'interior' && self.interiorScene ? self.interiorScene : self.streetScene; },
      camera: this.camera,
      update: (dt: number) => this.update(dt),
    };
  }

  private get interactables(): Interactable[] { return this.mode === 'street' ? this.streetInteractables : this.intInteractables; }
  private get colliders() { return this.mode === 'street' ? this.streetColliders : this.intColliders; }

  // ================= street scene =================
  private label3d(scene: THREE.Scene, text: string, color: string, pos: THREE.Vector3, scale = 4.4): void {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 56px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.lineWidth = 10; ctx.strokeStyle = '#0a0c18';
    ctx.strokeText(text, 256, 80);
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 80);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(scale, scale / 4, 1);
    sp.position.copy(pos);
    scene.add(sp);
  }

  // ================= terrain =================
  /** Ground height: the Grand Houses sit on a raised northern terrace. */
  private groundH(x: number, z: number): number {
    if (z < -24 && Math.abs(x) <= 27) return 1.0;
    if (z <= -19.5 && z >= -24 && Math.abs(x) <= 5) return (-z - 19.5) / 4.5; // the grand stairs
    return 0;
  }

  /**
   * Paint the whole city floor — grass with dirt mottling, a stone plaza,
   * and packed-dirt roads leading from the plaza to every destination.
   */
  private cityGroundTexture(R: number): THREE.Texture {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const px = (x: number) => ((x / R) + 1) / 2 * S;
    const pz = (z: number) => ((z / R) + 1) / 2 * S;
    const w2p = R * 2 / S; // world units per pixel — inverse for road widths

    // grass base with two-tone mottle
    ctx.fillStyle = '#4a6a36';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 7;
      ctx.fillStyle = Math.random() < 0.5 ? '#54763e' : '#41602e';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // dry dirt patches
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, rr = 10 + Math.random() * (R - 14);
      const x = px(Math.cos(a) * rr), y = pz(Math.sin(a) * rr);
      ctx.fillStyle = '#6e5a3c';
      ctx.beginPath(); ctx.ellipse(x, y, 8 + Math.random() * 22, 6 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // roads: packed dirt from the plaza to every destination
    const road = (x0: number, z0: number, x1: number, z1: number, w: number) => {
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineCap = 'round';
      ctx.lineWidth = w / w2p;
      ctx.beginPath(); ctx.moveTo(px(x0), pz(z0)); ctx.lineTo(px(x1), pz(z1)); ctx.stroke();
      // worn center line
      ctx.strokeStyle = '#9a7d58';
      ctx.lineWidth = (w * 0.45) / w2p;
      ctx.beginPath(); ctx.moveTo(px(x0), pz(z0)); ctx.lineTo(px(x1), pz(z1)); ctx.stroke();
    };
    road(0, 0, 0, -20, 3.2);      // north — grand stairs to the terrace
    road(0, 0, -14, 7, 2.4);      // provisions bazaar
    road(0, 0, 14, 7, 2.4);       // crawler garage
    road(0, 0, 0, 18, 2.4);       // sanctum
    road(0, 0, 8, 6, 1.6);        // bounty kiosk
    road(0, 0, -26, 0, 2.6);      // shuttle pad
    road(0, 0, 37, 0, 2.8);       // expedition gate
    road(0, 0, 21, -11.5, 2.8);   // the Grand Coliseum
    road(-14, 7, 0, 18, 1.4);     // market lane
    road(14, 7, 0, 18, 1.4);

    // pebbles along the roads
    ctx.fillStyle = '#aa9070';
    for (let i = 0; i < 300; i++) {
      const t = Math.random();
      const routes: [number, number, number, number][] = [[0, 0, 0, -20], [0, 0, -14, 7], [0, 0, 14, 7], [0, 0, 0, 18], [0, 0, 37, 0], [0, 0, -26, 0]];
      const rte = routes[Math.floor(Math.random() * routes.length)];
      const x = rte[0] + (rte[2] - rte[0]) * t + (Math.random() - 0.5) * 2.2;
      const z = rte[1] + (rte[3] - rte[1]) * t + (Math.random() - 0.5) * 2.2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(px(x), pz(z), 1 + Math.random() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the central stone plaza
    const pg = ctx.createRadialGradient(px(0), pz(0), 2 / w2p, px(0), pz(0), 7.4 / w2p);
    pg.addColorStop(0, '#9a8e7a'); pg.addColorStop(0.85, '#8a7e6a'); pg.addColorStop(1, '#6e5a3c');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px(0), pz(0), 7.4 / w2p, 0, Math.PI * 2); ctx.fill();
    // flagstone joints
    ctx.strokeStyle = 'rgba(60,52,40,0.5)'; ctx.lineWidth = 1.4;
    for (let ring = 2; ring <= 7; ring += 1.6) {
      ctx.beginPath(); ctx.arc(px(0), pz(0), ring / w2p, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(px(Math.cos(a) * 2), pz(Math.sin(a) * 2));
      ctx.lineTo(px(Math.cos(a) * 7.4), pz(Math.sin(a) * 7.4));
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /** A road lantern that wakes up after sundown (handled by the day/night cycle). */
  private addLantern(x: number, z: number): void {
    const s = this.streetScene;
    const y0 = this.groundH(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x2e2a36, roughness: 0.8 }));
    post.position.set(x, y0 + 1.3, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2e2a36 }));
    arm.position.set(x + 0.2, y0 + 2.55, z);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45a, emissiveIntensity: 0.15 }));
    orb.position.set(x + 0.42, y0 + 2.45, z);
    orb.name = 'lampOrb';
    const glow = new THREE.PointLight(0xffb45a, 0, 11);
    glow.position.set(x + 0.42, y0 + 2.35, z);
    glow.name = 'streetlamp';
    post.castShadow = true;
    s.add(post, arm, orb, glow);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.32 });
  }

  // ================= unique merchant exteriors =================
  /** Pina's Provisions — a striped market bazaar stacked with goods. */
  private buildShopExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 3.4),
      new THREE.MeshStandardMaterial({ map: plankTexture('#8a6038'), roughness: 0.85 }));
    body.position.y = 1.3;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // big striped awning over the front
    for (let i = 0; i < 6; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 1.7),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e0d0 : 0xd84a3a, roughness: 0.9 }));
      strip.position.set(-2.05 + i * 0.82, 2.62 - 0.18, 2.45);
      strip.rotation.x = 0.32;
      g.add(strip);
    }
    for (const ax of [-2.2, 2.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a4028 }));
      pole.position.set(ax, 1.1, 3.1);
      g.add(pole);
    }
    // produce crates & barrels in front
    const crate = (cx: number, cz: number, cy = 0.26, sc = 1) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.52 * sc, 0.52 * sc, 0.52 * sc),
        new THREE.MeshStandardMaterial({ map: plankTexture('#a87848'), roughness: 0.9 }));
      box.position.set(cx, cy, cz);
      box.rotation.y = Math.random() * 0.6;
      box.castShadow = true;
      g.add(box);
    };
    crate(-1.7, 2.6); crate(-1.1, 2.7); crate(-1.4, 2.55, 0.78);
    for (const [bx, bz] of [[1.5, 2.7], [2.05, 2.5]] as const) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.72, 10),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.9 }));
      barrel.position.set(bx, 0.36, bz);
      barrel.castShadow = true;
      g.add(barrel);
    }
    // hanging shingle sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6a1a, emissiveIntensity: 0.35 }));
    sign.position.set(0, 2.0, 1.78);
    g.add(sign);
    // chimney with a soft smoke puff
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7268', '#4a4438', 1), roughness: 0.95 }));
    chimney.position.set(1.6, 3.1, -0.8);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc8c4bc, transparent: true, opacity: 0.5 }));
    puff.position.set(1.6, 3.9, -0.8);
    puff.name = 'smoke';
    g.add(chimney, puff);
    // roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.3, 3.9),
      new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8 }));
    roof.position.y = 2.75;
    roof.castShadow = true;
    g.add(roof);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z); // storefront faces the plaza
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.0 });
    this.label3d(s, '🛒 Pina\'s Provisions', '#f2c14e', new THREE.Vector3(x, 4.3, z));
    this.streetMarkers.push({ x, z, label: '🛒 Shop', color: '#f2c14e', kind: 'building' });
    const door = new THREE.Vector3(0, 0, 3.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.0,
      label: 'Press <b>E</b> — enter Pina\'s Provisions',
      handler: () => this.enterService('shop'),
    });
  }

  /** Dax's Crawler Garage — a high-tech service bay humming with power. */
  private buildGarageExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x6a7282, metalness: 0.65, roughness: 0.35 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a4050, metalness: 0.7, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.9, 4.0), metal);
    body.position.y = 1.45;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // rolling shutter door (striped)
    for (let i = 0; i < 7; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.06),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8a93a8 : 0x4a5468, metalness: 0.6, roughness: 0.45 }));
      slat.position.set(-0.9, 0.25 + i * 0.27, 2.04);
      g.add(slat);
    }
    // neon sign bar
    const neon = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xe8843a, emissive: 0xe8843a, emissiveIntensity: 1.4 }));
    neon.position.set(0, 2.6, 2.06);
    neon.name = 'neon';
    const neonGlow = new THREE.PointLight(0xe8843a, 7, 8);
    neonGlow.position.set(0, 2.6, 2.6);
    g.add(neon, neonGlow);
    // roof tech: antenna + spinning scanner orb + vents
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.1, 6), darkMetal);
    mast.position.set(1.9, 3.95, -1.0);
    const dish = new THREE.Mesh(new THREE.OctahedronGeometry(0.26),
      new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 0.9 }));
    dish.position.set(1.9, 5.1, -1.0);
    dish.name = 'stormtip';
    for (const vx of [-1.6, -0.4, 0.8]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 0.7), darkMetal);
      vent.position.set(vx, 3.07, -0.8);
      g.add(vent);
    }
    g.add(mast, dish);
    // oil drums + spare tire stack
    for (const [dx2, dz2, col] of [[2.4, 2.6, 0xc4582a], [2.95, 2.4, 0x4a7a9a]] as const) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10),
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.5, roughness: 0.5 }));
      drum.position.set(dx2, 0.4, dz2);
      drum.castShadow = true;
      g.add(drum);
    }
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x22242e, roughness: 0.9 }));
      tire.rotation.x = Math.PI / 2;
      tire.position.set(-2.5, 0.14 + i * 0.27, 2.6);
      g.add(tire);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.3 });
    this.label3d(s, '🔧 Dax\'s Garage', '#e8843a', new THREE.Vector3(x, 4.6, z));
    this.streetMarkers.push({ x, z, label: '🔧 Garage', color: '#e8843a', kind: 'building' });
    const door = new THREE.Vector3(1.2, 0, 3.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.0,
      label: 'Press <b>E</b> — enter Dax\'s Garage',
      handler: () => this.enterService('garage'),
    });
  }

  /** The Sanctum — a marble healing spring under an open dome. */
  private buildSanctumExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.35, metalness: 0.05 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 2.4, 18), marble);
    drum.position.y = 1.2;
    drum.castShadow = drum.receiveShadow = true;
    g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9af2c4, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3 }));
    dome.position.y = 2.4;
    g.add(dome);
    // column ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.8, 10), marble);
      col.position.set(Math.cos(a) * 3.3, 1.4, Math.sin(a) * 3.3);
      col.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.6), marble);
      cap.position.set(Math.cos(a) * 3.3, 2.85, Math.sin(a) * 3.3);
      g.add(col, cap);
    }
    // glowing spring ring at the base
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.2, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.7, roughness: 0.2 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const springGlow = new THREE.PointLight(0x5ad88a, 8, 10);
    springGlow.position.y = 1.6;
    g.add(ring, springGlow);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.2 });
    this.label3d(s, '⛲ Sanctum', '#5ad88a', new THREE.Vector3(x, 4.8, z));
    this.streetMarkers.push({ x, z, label: '⛲ Sanctum', color: '#5ad88a', kind: 'building' });
    const door = new THREE.Vector3(0, 0, 3.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.2,
      label: 'Press <b>E</b> — enter the Sanctum',
      handler: () => this.enterService('sanctum'),
    });
  }

  /** The bounty kiosk — a paper-covered noticeboard by the plaza. */
  private buildBountyKiosk(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.9 });
    for (const side of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 0.18), wood);
      post.position.set(side, 1.15, 0);
      g.add(post);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.1), wood);
    board.position.y = 1.55;
    g.add(board);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8 }));
    roof.position.y = 2.42;
    roof.rotation.x = 0.12;
    g.add(roof);
    // pinned notices
    for (let i = 0; i < 7; i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3 + Math.random() * 0.16, 0.34 + Math.random() * 0.2),
        new THREE.MeshStandardMaterial({ color: [0xf2ead0, 0xe8d8b8, 0xd8e8f2][i % 3], roughness: 0.95 }));
      paper.position.set(-0.9 + (i % 4) * 0.58, 1.36 + Math.floor(i / 4) * 0.5, 0.06);
      paper.rotation.z = (Math.random() - 0.5) * 0.22;
      g.add(paper);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z) + Math.PI;
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.3 });
    this.label3d(s, '📜 Bounty Board', '#b18ae8', new THREE.Vector3(x, 3.4, z), 3.6);
    this.streetMarkers.push({ x, z, label: '📜 Bounties', color: '#b18ae8', kind: 'poi' });
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z), radius: 2.0,
      label: 'Press <b>E</b> — read the Bounty Board',
      handler: () => this.openBounties(),
    });
  }

  /** The Grand Coliseum — a massive tiered arena honoring the three Legendary Tamers. */
  private buildColiseumExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({
      map: stoneTexture('#9a93a8', '#5a5468', 4), roughness: 0.85, side: THREE.DoubleSide,
    });
    // three open tiers
    const tiers: [number, number, number, number][] = [
      [7.2, 7.8, 3.2, 1.6], [6.2, 6.7, 2.7, 4.6], [5.2, 5.6, 2.3, 7.0],
    ];
    for (const [rt, rb, h, y] of tiers) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28, 1, true), stone);
      tier.position.y = y;
      tier.castShadow = tier.receiveShadow = true;
      g.add(tier);
      // arched window band
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const arc = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.5, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x14182a, roughness: 0.9 }));
        arc.position.set(Math.cos(a) * (rt + rb) / 2, y, Math.sin(a) * (rt + rb) / 2);
        arc.rotation.y = -a + Math.PI / 2;
        g.add(arc);
      }
    }
    // crown of light above the arena mouth
    const crown = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.14, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.3 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 8.4;
    crown.name = 'neon';
    const crownGlow = new THREE.PointLight(0x5ab8e8, 16, 18);
    crownGlow.position.y = 8.6;
    g.add(crown, crownGlow);
    // banners of the three Legendary Tamers over the entrance
    const legendCols = [0xf2603a, 0xf2d23a, 0x4ec45e];
    legendCols.forEach((col, i) => {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.85, side: THREE.DoubleSide }));
      banner.position.set((i - 1) * 1.6, 4.6, 7.0);
      g.add(banner);
    });
    // grand entrance arch
    for (const side of [-1.9, 1.9]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), stone);
      pillar.position.set(side, 2.1, 7.4);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.9, 1.1), stone);
    lintel.position.set(0, 4.6, 7.4);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    doorway.position.set(0, 1.8, 7.42);
    doorway.name = 'portal';
    g.add(lintel, doorway);

    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 8.2 });
    this.label3d(s, '🏟️ Grand Coliseum', '#5ab8e8', new THREE.Vector3(x, 10.6, z), 6.0);
    this.streetMarkers.push({ x, z, label: '🏟️ Coliseum', color: '#5ab8e8', kind: 'building' });
    const door = new THREE.Vector3(0, 0, 9.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.4,
      label: 'Press <b>E</b> — enter the Grand Coliseum',
      handler: () => this.enterService('coliseum'),
    });
  }

  /** Unique landmark exterior per Grand House. Built facing +Z, then rotated toward the plaza. */
  private buildHouseExterior(h: HouseDef, x: number, z: number, y = 0): void {
    const g = new THREE.Group();
    const col = parseInt(h.color.slice(1), 16);
    const accent = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 });
    const stoneM = new THREE.MeshStandardMaterial({ map: stoneTexture('#5a5468', '#2e2a3a', 2), roughness: 0.85 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x2e2a36, roughness: 0.8 });

    const banner = (bx: number, bz: number) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6), darkM);
      pole.position.set(bx, 1.8, bz);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.6),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide }));
      cloth.position.set(bx, 2.6, bz + 0.02);
      g.add(pole, cloth);
    };
    const lamp = (lx: number, lz: number, ly: number, intensity = 7) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), accent);
      orb.position.set(lx, ly, lz);
      const light = new THREE.PointLight(col, intensity, 7);
      light.position.set(lx, ly, lz);
      g.add(orb, light);
    };

    if (h.id === 'pyrelight') {
      // obsidian ziggurat with twin braziers
      for (let i = 0; i < 3; i++) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(6 - i * 1.4, 1.3, 5 - i * 1.2), stoneM);
        tier.position.y = 0.65 + i * 1.3;
        tier.castShadow = true;
        g.add(tier);
      }
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 4), accent);
      crown.position.y = 4.7; crown.rotation.y = Math.PI / 4;
      g.add(crown);
      for (const side of [-2.4, 2.4]) {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.5, 10), darkM);
        bowl.position.set(side, 1.1, 2.6);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffa03a, emissive: 0xff6a1a, emissiveIntensity: 1.4 }));
        flame.position.set(side, 1.7, 2.6);
        flame.name = 'flame';
        const fl = new THREE.PointLight(0xff7a2a, 14, 8);
        fl.position.set(side, 1.9, 2.6);
        g.add(bowl, flame, fl);
      }
      banner(-1.4, 2.7); banner(1.4, 2.7);
    } else if (h.id === 'mistveil') {
      // round hall under a glass dome, water ring
      const hall = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3, 2.6, 18), stoneM);
      hall.position.y = 1.3; hall.castShadow = true;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x9ad4f2, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.3 }));
      dome.position.y = 2.6;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.25, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x3a9df2, emissive: 0x1a4d88, emissiveIntensity: 0.5, roughness: 0.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
      g.add(hall, dome, ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), accent);
        fin.position.set(Math.cos(a) * 3.1, 2.7, Math.sin(a) * 3.1);
        g.add(fin);
      }
      lamp(-2, 3.2, 1.4); lamp(2, 3.2, 1.4);
    } else if (h.id === 'thornward') {
      // living great-tree hall
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 4.5, 12),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22'), roughness: 0.95 }));
      trunk.position.y = 2.25; trunk.castShadow = true;
      g.add(trunk);
      for (const [cx, cy, cz, r] of [[0, 5.4, 0, 2.4], [-1.8, 4.6, 0.6, 1.4], [1.7, 4.8, -0.5, 1.5], [0.4, 4.4, 1.6, 1.2]] as const) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9),
          new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.95 }));
        crown.position.set(cx, cy, cz);
        crown.castShadow = true;
        g.add(crown);
      }
      const vine = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 6, 20), accent);
      vine.rotation.x = Math.PI / 2.4; vine.position.y = 2.6;
      g.add(vine);
      for (const side of [-2.2, 2.2]) {
        const mush = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xd9b85a, emissive: 0x8a6a1a, emissiveIntensity: 0.6 }));
        mush.position.set(side, 0.35, 2.4);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 8),
          new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
        stem.position.set(side, 0.2, 2.4);
        g.add(mush, stem);
      }
      lamp(0, 2.9, 3.6, 9);
    } else if (h.id === 'stormcall') {
      // storm spire with coil and rod
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.7 - i * 0.3, 2 - i * 0.3, 1.5, 8), stoneM);
        seg.position.y = 0.75 + i * 1.5;
        seg.castShadow = true;
        g.add(seg);
      }
      for (let i = 0; i < 3; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.25, 0.1, 8, 20),
          new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 }));
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 2 + i * 1.4;
        g.add(coil);
      }
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), darkM);
      rod.position.y = 7;
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), accent);
      tip.position.y = 8.1; tip.name = 'stormtip';
      const tl = new THREE.PointLight(col, 18, 12);
      tl.position.y = 8;
      g.add(rod, tip, tl);
      banner(-1.6, 2.2); banner(1.6, 2.2);
    } else {
      // duskwatch — triple-roof pagoda with violet lanterns
      for (let i = 0; i < 3; i++) {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(4.6 - i * 1.1, 1.2, 4 - i * 1), darkM);
        floor.position.y = 0.6 + i * 1.7;
        floor.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4 - i * 0.8, 0.9, 4),
          new THREE.MeshStandardMaterial({ color: 0x4a2a7a, roughness: 0.6 }));
        roof.position.y = 1.55 + i * 1.7;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        g.add(floor, roof);
      }
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), accent);
      finial.position.y = 5.6;
      g.add(finial);
      for (const side of [-1.9, 1.9]) lamp(side, 2.3, 1.5, 10);
    }

    // shared: door + step
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.8 }));
    door.position.set(0, 0.85, h.id === 'mistveil' ? 2.95 : 2.45);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#4a4458', 1), roughness: 0.9 }));
    step.position.set(0, 0.09, door.position.z + 0.6);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.18), accent);
    trim.position.set(0, 1.85, door.position.z);
    g.add(door, step, trim);

    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-x, -z + 33); // door faces the terrace edge / plaza axis
    this.streetScene.add(g);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.4 });
    this.label3d(this.streetScene, h.name, h.color, new THREE.Vector3(x, y + 6.6, z), 5.2);
    this.streetMarkers.push({ x, z, label: h.name.replace('House ', ''), color: h.color, kind: 'building' });

    // door interactable sits in front of the rotated door
    const doorWorld = new THREE.Vector3(0, 0, 4.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    doorWorld.y = y;
    this.streetMarkers.push({ x: doorWorld.x, z: doorWorld.z, color: '#e8d9a8', kind: 'door' });
    this.streetInteractables.push({
      pos: doorWorld, radius: 2.2,
      label: `Press <b>E</b> — enter ${h.name}`,
      handler: () => this.enterHouse(h),
    });
  }

  private buildStreet(): void {
    const s = this.streetScene;
    s.background = skyGradient('#7ab8e8', '#e8d8b8');
    s.fog = new THREE.Fog(0xd8d0c0, 36, 130);
    this.ambient = new THREE.AmbientLight(0xfff4e0, 0.75);
    s.add(this.ambient);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
    this.sun = sun;
    sun.position.set(12, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -42;
    sun.shadow.camera.right = sun.shadow.camera.top = 42;
    s.add(sun);

    // ---- ground: painted grass, dirt and roads ----
    const R = 46;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 64),
      new THREE.MeshStandardMaterial({ map: this.cityGroundTexture(R), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // ---- the world beyond the walls (no more floating town) ----
    const apron = new THREE.Mesh(new THREE.RingGeometry(R - 1, 120, 48),
      new THREE.MeshStandardMaterial({ color: 0x3c5a2c, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.06;
    s.add(apron);
    // rolling hills outside
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const rr = 58 + Math.random() * 26;
      const hr = 7 + Math.random() * 9;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hr, 12, 9),
        new THREE.MeshStandardMaterial({ color: i % 3 ? 0x426632 : 0x4d7038, roughness: 1 }));
      hill.position.set(Math.cos(a) * rr, -hr * 0.55, Math.sin(a) * rr);
      hill.scale.y = 0.55;
      s.add(hill);
    }
    // distant mountains
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(16 + Math.random() * 10, 22 + Math.random() * 14, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 1, flatShading: true }));
      mt.position.set(Math.cos(a) * 105, 4, Math.sin(a) * 105);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(5 + Math.random() * 3, 7, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8eef8, roughness: 0.9, flatShading: true }));
      cap.position.set(mt.position.x, mt.position.y + 11 + Math.random() * 5, mt.position.z);
      s.add(mt, cap);
    }

    // ---- city walls (ring of stone with battlements & towers) ----
    const WALL_R = 42;
    const segs = 40;
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7488', '#454052', 2), roughness: 0.9 });
    const ridgeMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8498', '#4a4458', 1), roughness: 0.9 });
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // leave the eastern gate opening
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.085) continue;
      const wx = Math.cos(a) * WALL_R, wz = Math.sin(a) * WALL_R;
      const baseY = this.groundH(wx, wz);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(6.9, 4.6, 1.4), wallMat);
      seg.position.set(wx, baseY + 2.3, wz);
      seg.rotation.y = -a - Math.PI / 2;
      seg.castShadow = seg.receiveShadow = true;
      s.add(seg);
      // battlement merlons
      for (const off of [-2.3, 0, 2.3]) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.5), ridgeMat);
        const ox = Math.cos(-seg.rotation.y) * off, oz = -Math.sin(-seg.rotation.y) * off;
        merlon.position.set(wx + ox, baseY + 4.9, wz + oz);
        merlon.rotation.y = seg.rotation.y;
        s.add(merlon);
      }
      // watchtower every fifth segment
      if (i % 5 === 0) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 7, 10), wallMat);
        tower.position.set(wx, baseY + 3.5, wz);
        tower.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 10),
          new THREE.MeshStandardMaterial({ color: 0x3a4a8a, roughness: 0.7 }));
        roof.position.set(wx, baseY + 8.1, wz);
        roof.castShadow = true;
        s.add(tower, roof);
        this.streetColliders.push({ pos: new THREE.Vector3(wx, 0, wz), r: 2.4 });
      }
    }

    // ---- the great eastern gatehouse (expedition gate in the wall) ----
    {
      const gh = new THREE.Group();
      for (const side of [-3.6, 3.6]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 8, 10), wallMat);
        tower.position.set(0, 4, side);
        tower.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2, 10),
          new THREE.MeshStandardMaterial({ color: 0x3a4a8a, roughness: 0.7 }));
        roof.position.set(0, 9, side);
        gh.add(tower, roof);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 8.6), wallMat);
      lintel.position.y = 5.6;
      gh.add(lintel);
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.6),
        new THREE.MeshBasicMaterial({ color: 0x5a7bd8, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      portal.rotation.y = Math.PI / 2;
      portal.position.y = 2.4;
      portal.name = 'portal';
      gh.add(portal);
      gh.position.set(WALL_R, 0, 0);
      s.add(gh);
      this.streetColliders.push({ pos: new THREE.Vector3(WALL_R, 0, -3.6), r: 2.0 });
      this.streetColliders.push({ pos: new THREE.Vector3(WALL_R, 0, 3.6), r: 2.0 });
      this.label3d(s, '⚔️ Expedition Gate', '#5a7bd8', new THREE.Vector3(WALL_R - 3, 7.4, 0), 5.4);
      this.streetMarkers.push({ x: WALL_R - 4, z: 0, label: '⚔️ Gate', color: '#5a7bd8', kind: 'poi' });
      this.streetInteractables.push({
        pos: new THREE.Vector3(WALL_R - 4, 0, 0), radius: 2.8,
        label: 'Press <b>E</b> — depart on an expedition',
        handler: () => this.openGate(),
      });
    }

    // ---- northern terrace: the seat of the five Grand Houses ----
    {
      const terr = new THREE.Mesh(new THREE.BoxGeometry(54, 1.0, 18),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#55506a', 6), roughness: 0.9 }));
      terr.position.set(0, 0.5, -33);
      terr.receiveShadow = true;
      s.add(terr);
      // grand stairs
      for (let i = 0; i < 5; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(10.5 - i * 0.6, 0.22, 1.0),
          new THREE.MeshStandardMaterial({ map: stoneTexture('#9a93a8', '#5a5468', 1), roughness: 0.85 }));
        step.position.set(0, 0.11 + i * 0.2, -19.9 - i * 0.92);
        step.receiveShadow = true;
        s.add(step);
      }
      // balustrade orbs flanking the stairs
      for (const side of [-5.6, 5.6]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), wallMat);
        post.position.set(side, 0.8, -21.8);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0xc9a24a, emissiveIntensity: 0.6 }));
        orb.position.set(side, 1.85, -21.8);
        s.add(post, orb);
      }
      // edge colliders: the terrace can only be climbed by the stairs
      for (let x = 6.5; x <= 26; x += 2) {
        this.streetColliders.push({ pos: new THREE.Vector3(x, 0, -23.6), r: 1.4 });
        this.streetColliders.push({ pos: new THREE.Vector3(-x, 0, -23.6), r: 1.4 });
      }
      this.streetMarkers.push({ x: 0, z: -21.5, label: 'Grand Stairs', color: '#c9a24a', kind: 'door' });
    }

    // the 5 Grand Houses crown the terrace
    HOUSES.forEach((h, i) => {
      const x = -20 + i * 10;
      const z = -31 - Math.abs(x) * 0.10;
      this.buildHouseExterior(h, x, z, 1.0);
    });

    // ---- plaza fountain ----
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.7, 18),
      new THREE.MeshStandardMaterial({ color: 0x8a93b8, roughness: 0.6 }));
    fountain.position.y = 0.35;
    s.add(fountain);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 18),
      new THREE.MeshStandardMaterial({ color: 0x3a9df2, emissive: 0x1a4d88, emissiveIntensity: 0.4, roughness: 0.1 }));
    water.position.y = 0.72;
    s.add(water);
    this.streetColliders.push({ pos: new THREE.Vector3(0, 0, 0), r: 1.9 });
    this.streetMarkers.push({ x: 0, z: 0, label: 'Plaza', color: '#b8ae8a', kind: 'poi' });

    // ---- lanterns: plaza ring + along the roads ----
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      this.addLantern(Math.cos(a) * 9, Math.sin(a) * 9);
    }
    for (const [lx, lz] of [[-7, 4], [7, 4], [0, 12], [-2, -14], [2.5, -19], [-15, -1], [15, -1], [24, 1.5], [-21, 2]] as const) {
      this.addLantern(lx, lz);
    }

    // ---- unique merchant district ----
    this.buildShopExterior(-14, 7);
    this.buildGarageExterior(14, 7);
    this.buildSanctumExterior(0, 18);
    this.buildBountyKiosk(8, 6);

    // ---- the Grand Coliseum, north-east of the plaza ----
    this.buildColiseumExterior(26, -14);
    this.addLantern(15, -8);
    this.addLantern(20.5, -11);

    // ---- greenery, hills & rocks inside the walls ----
    const mound = (mx: number, mz: number, mr: number, mh: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(mr, 12, 9),
        new THREE.MeshStandardMaterial({ color: 0x4d7038, roughness: 1 }));
      m.position.set(mx, -mr + mh, mz);
      m.scale.y = 0.9;
      m.receiveShadow = true;
      s.add(m);
      this.streetColliders.push({ pos: new THREE.Vector3(mx, 0, mz), r: mr * 0.8 });
    };
    mound(-28, -12, 5, 1.6);
    mound(-13, 24, 3.6, 1.1);
    mound(24, 20, 4.0, 1.3);
    const treeAt = (tx: number, tz: number) => {
      const ty = this.groundH(tx, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
      trunk.position.set(tx, ty + 0.8, tz);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1 + Math.random() * 0.5, 10, 8),
        new THREE.MeshStandardMaterial({ color: Math.random() < 0.3 ? 0x4d9a44 : 0x3a8a3a, roughness: 0.9 }));
      crown.position.set(tx, ty + 2.2, tz);
      trunk.castShadow = crown.castShadow = true;
      s.add(trunk, crown);
      this.streetColliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 0.5 });
    };
    for (const [tx, tz] of [[-22, 12], [-26, 18], [-32, 6], [22, 14], [28, 8], [34, -2], [-34, -6], [18, 24], [-8, 30], [8, 30], [-19, -10], [12, -18], [-12, -17]] as const) {
      treeAt(tx + (Math.random() - 0.5) * 2, tz + (Math.random() - 0.5) * 2);
    }
    // rock clusters
    for (const [rx, rz] of [[-30, 14], [30, 16], [-25, 25], [34, 6]] as const) {
      for (let i = 0; i < 3; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5),
          new THREE.MeshStandardMaterial({ color: 0x8a8498, roughness: 0.95, flatShading: true }));
        rock.position.set(rx + (Math.random() - 0.5) * 2.4, 0.3, rz + (Math.random() - 0.5) * 2.4);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        s.add(rock);
      }
      this.streetColliders.push({ pos: new THREE.Vector3(rx, 0, rz), r: 1.4 });
    }
    // flower patches along the roads
    const flowerCols = [0xe85a8a, 0xf2d23a, 0xb18ae8, 0xf2f2f2];
    for (const [fx, fz] of [[-5, 6], [5, 7], [-3, -10], [4, -12], [-10, 11], [10, 12], [2, 22], [-18, 4], [18, 4], [-2, -22.5], [3, -25]] as const) {
      for (let i = 0; i < 5; i++) {
        const fy = this.groundH(fx, fz);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 6, 5),
          new THREE.MeshStandardMaterial({
            color: flowerCols[Math.floor(Math.random() * flowerCols.length)],
            emissive: 0x222222, roughness: 0.8,
          }));
        fl.position.set(fx + (Math.random() - 0.5) * 1.6, fy + 0.1, fz + (Math.random() - 0.5) * 1.6);
        s.add(fl);
      }
    }

    // ---- university shuttle pad — west ----
    const pad = new THREE.Group();
    const padBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 0.3, 18),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#4a4458', 2), roughness: 0.8 }));
    padBase.position.y = 0.15;
    const padGlow = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 18),
      new THREE.MeshBasicMaterial({ color: 0xc9a24a, transparent: true, opacity: 0.4 }));
    padGlow.position.y = 0.34;
    padGlow.name = 'portal';
    pad.add(padBase, padGlow);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a6e8a, roughness: 0.7 }));
      post.position.set(Math.cos(a) * 2.1, 0.8, Math.sin(a) * 2.1);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0xc9a24a, emissiveIntensity: 0.8 }));
      orb.position.set(Math.cos(a) * 2.1, 1.7, Math.sin(a) * 2.1);
      pad.add(post, orb);
    }
    pad.position.set(-26, 0, 0);
    s.add(pad);
    this.label3d(s, '🎓 University Shuttle', '#c9a24a', new THREE.Vector3(-26, 3.6, 0));
    this.streetMarkers.push({ x: -26, z: 0, label: '🎓 Shuttle', color: '#c9a24a', kind: 'poi' });
    this.streetInteractables.push({
      pos: new THREE.Vector3(-23.6, 0, 0), radius: 2.4,
      label: 'Press <b>E</b> — ride to the Tamer University',
      handler: async () => {
        const pick = await choose('Shuttle Conductor', 'The transport circle to the Tamer University is charged. All aboard?', ['To the University!', 'Not now']);
        if (pick === 0) { this.player.save(); this.resolveExit?.('university'); }
      },
    });

    // ---- townsfolk out on their errands ----
    this.spawnWalkers();

    this.tamer.position.set(0, 0, 5);
    s.add(this.tamer);
  }

  // ================= wandering townsfolk =================
  private spawnWalkers(): void {
    const folk: { name: string; palette: Parameters<typeof makeVoxelHuman>[0]; lines: string[] }[] = [
      {
        name: 'Tilda the Baker',
        palette: { top: 0xd99a4a, hair: 0x7a4a2a, cap: 0xf2ead0 },
        lines: [
          'Fresh honey rolls at Pina\'s every morning! Wild Guardians go mad for them — tame ones too, honestly.',
          'Aljay the Dawnflame once bought a honey roll from my mother\'s stall. We have the coin he paid with framed over the oven.',
          'You smell that? Cinnamon and woodsmoke. That\'s Haven City, that is. Capital of Olivar, finest air on any of the four continents.',
        ],
      },
      {
        name: 'Old Benn',
        palette: { top: 0x5a6a4a, hair: 0xd8d8d8, cap: null },
        lines: [
          'I served in the Legion War, fifteen years back. Saw the sky over Ghandra tear open like wet paper. Then I saw three kids walk INTO it.',
          'Greggy the Stormheart grounded Voltrazar with a coil he built overnight. I held the ladder. Best ladder-holding of my life.',
          'Element matchups win battles. Fire melts Ice, Water drowns Fire — the trio beat nine four-element monsters with that table. Learn it.',
        ],
      },
      {
        name: 'Joss the Courier',
        palette: { top: 0x3a8ad9, hair: 0x2a2a3a, cap: 0xd84a3a },
        lines: [
          'Can\'t talk long — packages for three Grand Houses! The terrace stairs are murder on busy days.',
          'They say the Stormspire hums again at night, like in the war. I deliver up the north road, I HEAR it.',
          'Fastest courier in Olivar, me. Greggy once outran his own thunder — I\'m basically training for that.',
        ],
      },
      {
        name: 'Sera Plum',
        palette: { top: 0x4ec45e, hair: 0xa85a3a, cap: 0xe8d8a8 },
        lines: [
          'I planted every flowerbed along these roads. Onnel the Worldroot blessed the original seeds — forests still bloom a day early each spring in thanks.',
          'Verdant Guardians purr if you water them. Don\'t tell the scholars; they\'ll write a paper about it.',
          'The Thornward folk keep an empty chair at every feast, in case Onnel wanders home. I leave a flower on it sometimes.',
        ],
      },
      {
        name: 'Marek the Wallguard',
        palette: { top: 0x6a6e8a, hair: 0x3a2a1a, cap: 0x8a93a8 },
        lines: [
          'These walls went up right after the Legion War. If Ghandra\'s seal ever fails, Haven City will be ready. That\'s the whole point of us.',
          'Beyond the east gate it\'s ruins and wild country. Take a full team and a stocked Crawler.',
          'Nine generals, four elements each, whole armies waiting in a folded dimension. And people ask why the wall needs ANOTHER tower.',
        ],
      },
      {
        name: 'Nyla the Stargazer',
        palette: { top: 0x9a5af2, hair: 0x1a1a2e, cap: null },
        lines: [
          'When the lamps come on at dusk, the city looks like a constellation that fell asleep.',
          'Aether. The tenth element. Only Aljay\'s phoenix has ever carried it. Imagine being the second.',
          'They say Noruun\'s auroras are Ghandra\'s reflection. I check them every night. Last month… they flickered.',
        ],
      },
      {
        name: 'Little Pip',
        palette: { top: 0xd84a3a, hair: 0x6a3a1a, cap: 0xf2d23a },
        lines: [
          'I\'m Aljay and you\'re Nyxghul! Pew! Pew!! …fine, YOU can be Aljay. But I get the broom.',
          'When I graduate I\'m getting a fire one, a lightning one AND a leaf one. Just like the Three!',
          'My gran says Aljay walked through our market once, hood up, bought an apple. Nobody believes her. I believe her.',
        ],
      },
    ];
    for (const f of folk) {
      const grp = makeVoxelHuman(f.palette);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
      grp.position.set(Math.cos(a) * r, 0, Math.abs(Math.sin(a) * r));
      this.streetScene.add(grp);
      this.walkers.push({
        grp, target: grp.position.clone(), pause: Math.random() * 3,
        name: f.name, lines: f.lines, talking: false,
      });
    }
  }

  /** Pick a fresh wander destination on the streets (flat ground only). */
  private nextWanderTarget(from: THREE.Vector3): THREE.Vector3 {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z < -17) continue; // townsfolk keep off the Grand Houses' terrace
      if (this.streetColliders.some(c => Math.hypot(x - c.pos.x, z - c.pos.z) < c.r + 0.6)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return from.clone();
  }

  private nearbyWalker(): { grp: THREE.Group; name: string; lines: string[]; talking: boolean } | null {
    if (this.mode !== 'street') return null;
    let best: typeof this.walkers[number] | null = null;
    let bd = 2.0;
    for (const w of this.walkers) {
      const d = this.tamer.position.distanceTo(w.grp.position);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  // ================= house interiors =================
  private buildInterior(h: HouseDef): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.intRoom = { w: 18, d: 13 };
    const { w, d } = this.intRoom;
    // labeled interior minimap
    this.intName = h.name;
    this.intMarkers = [
      { x: 0, z: -d / 2 + 2.2, label: h.master, color: h.color, kind: 'npc' },
      { x: -3.4, z: 1.4, label: 'Attendant', color: '#aab0c8', kind: 'npc' },
      { x: 3.4, z: 0.6, label: SPECIES[h.starter].name, color: '#5ad88a', kind: 'npc' },
      { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
      { x: 0, z: -d / 2 + 0.4, label: 'Hall Banner', color: h.color, kind: 'poi' },
    ];
    const col = parseInt(h.color.slice(1), 16);

    const themes: Record<string, { floor: string; wall: string; sky: [string, string] }> = {
      pyrelight: { floor: '#4a322a', wall: '#3a2620', sky: ['#2a1812', '#120a08'] },
      mistveil: { floor: '#2a4258', wall: '#1e3142', sky: ['#16283a', '#0a141e'] },
      thornward: { floor: '#3e4a2e', wall: '#2c361e', sky: ['#1e2a14', '#0e140a'] },
      stormcall: { floor: '#3e3a2a', wall: '#2e2a1e', sky: ['#26221a', '#12100a'] },
      duskwatch: { floor: '#322a44', wall: '#241e32', sky: ['#1a1428', '#0c0a14'] },
    };
    const th = themes[h.id];
    s.background = skyGradient(th.sky[0], th.sky[1]);
    s.add(new THREE.AmbientLight(0xaab0d0, 0.55));
    const main = new THREE.PointLight(0xffe8c0, 30, 26);
    main.position.set(0, 5, 0);
    main.castShadow = true;
    s.add(main);
    const accentLight = new THREE.PointLight(col, 14, 14);
    accentLight.position.set(0, 3, -d / 2 + 2);
    s.add(accentLight);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: plankTexture(th.floor, 4), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // carpet to the master's dais
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, d - 3),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, transparent: true, opacity: 0.55 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    s.add(carpet);

    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture(th.wall, '#0e0a14', 3), roughness: 0.9 });
    const mkWall = (ww: number, wd: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 4.2, wd), wallMat);
      wall.position.set(x, 2.1, z);
      wall.receiveShadow = true;
      s.add(wall);
    };
    mkWall(w, 0.4, 0, -d / 2);            // back
    mkWall(0.4, d, -w / 2, 0);            // left
    mkWall(0.4, d, w / 2, 0);             // right
    mkWall(w / 2 - 1.4, 0.4, -(w / 4 + 0.7), d / 2);  // front, left of the door
    mkWall(w / 2 - 1.4, 0.4, w / 4 + 0.7, d / 2);     // front, right of the door

    // master's dais
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.3, 16),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#6a6276', '#3a3444', 2), roughness: 0.8 }));
    dais.position.set(0, 0.15, -d / 2 + 2.2);
    s.add(dais);

    // emblem banner behind the dais
    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.8, side: THREE.DoubleSide }));
    emblem.position.set(0, 2.2, -d / 2 + 0.25);
    s.add(emblem);

    // per-house props
    const prop = (mesh: THREE.Object3D, x: number, z: number, colliderR = 0.8) => {
      mesh.position.x += x; mesh.position.z += z;
      s.add(mesh);
      if (colliderR > 0) this.intColliders.push({ pos: new THREE.Vector3(x, 0, z), r: colliderR });
    };
    if (h.id === 'pyrelight') {
      for (const [x, z] of [[-5, -2], [5, -2], [-5, 2.5], [5, 2.5]]) {
        const brazier = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.22, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x2e2a36 }));
        bowl.position.y = 0.9;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x2e2a36 }));
        pole.position.y = 0.45;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0xffa03a, emissive: 0xff6a1a, emissiveIntensity: 1.4 }));
        flame.position.y = 1.5; flame.name = 'flame';
        const fl = new THREE.PointLight(0xff7a2a, 9, 7);
        fl.position.y = 1.6;
        brazier.add(bowl, pole, flame, fl);
        prop(brazier, x, z);
      }
    } else if (h.id === 'mistveil') {
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0x3a9df2, emissive: 0x1a4d88, emissiveIntensity: 0.5, roughness: 0.1 }));
      pool.position.y = 0.15;
      prop(pool, -4.5, 1, 2.4);
      for (const [x, z] of [[4.5, -1], [4.5, 2.5]]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 3.6, 10),
          new THREE.MeshStandardMaterial({ color: 0x9ad4f2, transparent: true, opacity: 0.5, roughness: 0.1 }));
        pillar.position.y = 1.8;
        prop(pillar, x, z, 0.6);
      }
    } else if (h.id === 'thornward') {
      for (const [x, z] of [[-5.5, -1.5], [5.5, -1.5], [-5.5, 2.5], [5.5, 2.5]]) {
        const planter = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
        pot.position.y = 0.25;
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.95 }));
        bush.position.y = 0.85;
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xd9b85a, emissive: 0x8a6a1a, emissiveIntensity: 0.7 }));
        bloom.position.set(0.25, 1.05, 0.25);
        planter.add(pot, bush, bloom);
        prop(planter, x, z);
      }
      const roots = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.16, 6, 22), new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.95 }));
      roots.rotation.x = Math.PI / 2;
      roots.position.y = 0.08;
      prop(roots, 0, -d / 2 + 2.2, 0);
    } else if (h.id === 'stormcall') {
      for (const [x, z] of [[-5, 0], [5, 0]]) {
        const coilG = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.07, 0.06, 6, 16),
            new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 }));
          coil.rotation.x = Math.PI / 2;
          coil.position.y = 0.4 + i * 0.5;
          coilG.add(coil);
        }
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.28),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 }));
        orb.position.y = 2.5; orb.name = 'stormtip';
        const ol = new THREE.PointLight(col, 9, 7);
        ol.position.y = 2.5;
        coilG.add(orb, ol);
        prop(coilG, x, z);
      }
    } else {
      for (const [x, z] of [[-5, -2], [5, -2], [-5, 2.5], [5, 2.5]]) {
        const lant = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x241e32 }));
        pole.position.y = 0.9;
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
        globe.position.y = 1.9;
        const gl = new THREE.PointLight(col, 8, 6);
        gl.position.y = 1.9;
        lant.add(pole, globe, gl);
        prop(lant, x, z, 0.5);
      }
    }

    // ----- NPCs -----
    const masterPalettes: Record<string, Parameters<typeof makeVoxelHuman>[0]> = {
      pyrelight: { top: 0xb03a22, robe: true, hair: 0x55301a, cap: null },
      mistveil: { top: 0x2a6dc4, robe: true, hair: 0xd8d8e8, cap: null },
      thornward: { top: 0x3a7a2e, robe: true, hair: 0x6a4a2a, cap: null },
      stormcall: { top: 0xb09a22, robe: true, hair: 0x2a2a3a, cap: null },
      duskwatch: { top: 0x5a3a9a, robe: true, hair: 0x1a1a26, cap: null },
    };
    const master = makeVoxelHuman(masterPalettes[h.id]);
    master.position.set(0, 0.3, -d / 2 + 2.2);
    master.rotation.y = 0; // faces the door (+Z)
    s.add(master);
    this.intNpcs.push(master);
    this.intColliders.push({ pos: master.position.clone().setY(0), r: 0.7 });
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, -d / 2 + 3.4), radius: 1.6,
      label: `Press <b>E</b> — speak with ${h.master}`,
      handler: () => this.talkToMaster(h),
    });

    const attendant = makeVoxelHuman({ top: col, hair: 0x4a3a2a, cap: null });
    attendant.position.set(-3.4, 0, 1.4);
    attendant.rotation.y = Math.PI / 3;
    s.add(attendant);
    this.intNpcs.push(attendant);
    this.intColliders.push({ pos: attendant.position.clone().setY(0), r: 0.6 });
    this.intInteractables.push({
      pos: attendant.position.clone().setY(0), radius: 1.5,
      label: 'Press <b>E</b> — talk to the attendant',
      handler: async () => {
        const tips = ATTENDANT_TIPS[h.id];
        await say(`${h.name} Attendant`, tips[Math.floor(Math.random() * tips.length)]);
      },
    });

    // the house's signature Guardian, lounging inside
    const rig = makeGuardian(h.starter);
    rig.group.position.set(3.4, 0, 0.6);
    rig.group.rotation.y = -Math.PI / 4;
    s.add(rig.group);
    this.intRigs.push(rig);
    this.intInteractables.push({
      pos: rig.group.position.clone().setY(0), radius: 1.6,
      label: `Press <b>E</b> — pet the ${SPECIES[h.starter].name}`,
      handler: async () => {
        await say('', `The ${SPECIES[h.starter].name} chirps happily and nuzzles your hand. ${SPECIES[h.starter].desc}`);
      },
    });

    // exit
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 0.6), radius: 1.6,
      label: 'Press <b>E</b> — leave the hall',
      handler: async () => this.exitHouse(),
    });
  }

  // ================= merchant interiors =================
  /** Walkable interiors for the shop, garage and sanctum — each with its keeper. */
  private buildServiceInterior(kind: 'shop' | 'garage' | 'sanctum'): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.intRoom = { w: 18, d: 13 };
    const { w, d } = this.intRoom;

    const themes = {
      shop:    { floor: () => plankTexture('#7a5a36', 4), wall: () => plankTexture('#5a4226', 3), sky: ['#2a2014', '#140e08'] as [string, string], light: 0xffd9a0 },
      garage:  { floor: () => tileTexture('#5a6070', '#3a4050', 6), wall: () => stoneTexture('#4a5060', '#2a3040', 3), sky: ['#1a2028', '#0a0e14'] as [string, string], light: 0xaad4ff },
      sanctum: { floor: () => marbleTexture(), wall: () => marbleTexture('#bcc2d2', '#8a90a5', 3), sky: ['#1a2a22', '#0a1410'] as [string, string], light: 0xb8ffd8 },
    } as const;
    const th = themes[kind];
    s.background = skyGradient(th.sky[0], th.sky[1]);
    s.add(new THREE.AmbientLight(0xaab0d0, 0.6));
    const main = new THREE.PointLight(th.light, 26, 26);
    main.position.set(0, 5, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: th.floor(), roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: th.wall(), roughness: 0.9 });
    const mkWall = (ww: number, wd: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 4.2, wd), wallMat);
      wall.position.set(x, 2.1, z);
      wall.receiveShadow = true;
      s.add(wall);
    };
    mkWall(w, 0.4, 0, -d / 2);
    mkWall(0.4, d, -w / 2, 0);
    mkWall(0.4, d, w / 2, 0);
    mkWall(w / 2 - 1.4, 0.4, -(w / 4 + 0.7), d / 2);
    mkWall(w / 2 - 1.4, 0.4, w / 4 + 0.7, d / 2);

    if (kind === 'shop') {
      this.intName = "Pina's Provisions";
      // stocked shelves along the back wall
      for (const sx of [-6, -2, 2, 6]) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 0.5),
          new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 }));
        shelf.position.set(sx, 1.4, -d / 2 + 0.55);
        s.add(shelf);
      }
      // sales counter
      const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.05, 0.8),
        new THREE.MeshStandardMaterial({ map: plankTexture('#8a6038'), roughness: 0.8 }));
      counter.position.set(0, 0.52, -2.2);
      s.add(counter);
      this.intColliders.push({ pos: new THREE.Vector3(-2, 0, -2.2), r: 1.0 }, { pos: new THREE.Vector3(0, 0, -2.2), r: 1.0 }, { pos: new THREE.Vector3(2, 0, -2.2), r: 1.0 });
      // goods: crates, barrels, gem case
      for (const [cx, cz] of [[-6.5, 2.2], [-5.8, 2.6], [-6.2, 1.4]] as const) {
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
          new THREE.MeshStandardMaterial({ map: plankTexture('#a87848'), roughness: 0.9 }));
        c2.position.set(cx, 0.3, cz);
        c2.rotation.y = Math.random();
        s.add(c2);
      }
      this.intColliders.push({ pos: new THREE.Vector3(-6.2, 0, 2.1), r: 1.1 });
      const gemCase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x9ad4f2, transparent: true, opacity: 0.45, roughness: 0.1 }));
      gemCase.position.set(6, 0.55, 1.5);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22),
        new THREE.MeshStandardMaterial({ color: 0xe85a8a, emissive: 0xe85a8a, emissiveIntensity: 0.8 }));
      gem.position.set(6, 0.7, 1.5);
      gem.name = 'stormtip';
      s.add(gemCase, gem);
      this.intColliders.push({ pos: new THREE.Vector3(6, 0, 1.5), r: 1.0 });
      // Pina behind the counter
      const pina = makeVoxelHuman({ top: 0xd95a8a, hair: 0x6a3a1a, cap: 0xf2ead0 });
      pina.position.set(0, 0, -3.4);
      s.add(pina);
      this.intNpcs.push(pina);
      this.intInteractables.push({
        pos: new THREE.Vector3(0, 0, -1.4), radius: 1.8,
        label: 'Press <b>E</b> — browse Pina\'s wares',
        handler: () => this.openShop(),
      });
      this.intMarkers = [
        { x: 0, z: -3.4, label: 'Pina', color: '#d95a8a', kind: 'npc' },
        { x: 0, z: -2.2, label: 'Counter', color: '#f2c14e', kind: 'poi' },
        { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
      ];
    } else if (kind === 'garage') {
      this.intName = "Dax's Garage";
      // showcase crawler on a service lift
      const lift = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a4050, metalness: 0.7, roughness: 0.4 }));
      lift.position.set(-4, 0.2, -1.5);
      const showCrawler = makeCrawler();
      showCrawler.position.set(-4, 0.4, -1.5);
      showCrawler.scale.setScalar(1.15);
      showCrawler.name = 'showcrawler';
      s.add(lift, showCrawler);
      this.intColliders.push({ pos: new THREE.Vector3(-4, 0, -1.5), r: 2.6 });
      // tool wall + workbench
      const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x6a7282, metalness: 0.6, roughness: 0.4 }));
      bench.position.set(4.5, 0.5, -d / 2 + 0.9);
      s.add(bench);
      this.intColliders.push({ pos: new THREE.Vector3(4.5, 0, -d / 2 + 0.9), r: 1.6 });
      for (let i = 0; i < 5; i++) {
        const tool = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7 - (i % 2) * 0.2, 0.06),
          new THREE.MeshStandardMaterial({ color: [0xc4582a, 0x8a93a8, 0xf2d23a][i % 3], metalness: 0.5 }));
        tool.position.set(3 + i * 0.6, 2.2, -d / 2 + 0.45);
        s.add(tool);
      }
      // tesla coil hum
      const coilG = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.45 - i * 0.07, 0.05, 6, 16),
          new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 }));
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.35 + i * 0.42;
        coilG.add(coil);
      }
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1 }));
      orb.position.y = 2.1;
      orb.name = 'stormtip';
      const ol = new THREE.PointLight(0x5ab8e8, 8, 8);
      ol.position.y = 2.1;
      coilG.add(orb, ol);
      coilG.position.set(6.8, 0, 2.5);
      s.add(coilG);
      this.intColliders.push({ pos: new THREE.Vector3(6.8, 0, 2.5), r: 0.9 });
      // Dax by the lift
      const dax = makeVoxelHuman({ top: 0xe8843a, hair: 0x2a2a3a, cap: 0x4a5468 });
      dax.position.set(-1.2, 0, -1.2);
      dax.rotation.y = -Math.PI / 3;
      s.add(dax);
      this.intNpcs.push(dax);
      this.intColliders.push({ pos: new THREE.Vector3(-1.2, 0, -1.2), r: 0.6 });
      this.intInteractables.push({
        pos: new THREE.Vector3(-1.2, 0, -1.2), radius: 1.8,
        label: 'Press <b>E</b> — talk to Engineer Dax',
        handler: () => this.openGarage(),
      });
      this.intMarkers = [
        { x: -1.2, z: -1.2, label: 'Dax', color: '#e8843a', kind: 'npc' },
        { x: -4, z: -1.5, label: 'Service Lift', color: '#8a93a8', kind: 'poi' },
        { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
      ];
    } else {
      this.intName = 'The Sanctum';
      // the healing spring
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 20),
        new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.3 }));
      pool.position.set(0, 0.25, -1.5);
      const springWater = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 20),
        new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.8, roughness: 0.05, transparent: true, opacity: 0.85 }));
      springWater.position.set(0, 0.56, -1.5);
      springWater.name = 'springwater';
      const springLight = new THREE.PointLight(0x5ad88a, 14, 12);
      springLight.position.set(0, 2, -1.5);
      s.add(pool, springWater, springLight);
      this.intColliders.push({ pos: new THREE.Vector3(0, 0, -1.5), r: 3.0 });
      // candle columns
      for (const [cx, cz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]] as const) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.6, 10),
          new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.4 }));
        col.position.set(cx, 1.3, cz);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45a, emissiveIntensity: 1.4 }));
        flame.position.set(cx, 2.85, cz);
        flame.name = 'flame';
        const fl = new THREE.PointLight(0xffb45a, 5, 6);
        fl.position.set(cx, 2.9, cz);
        s.add(col, flame, fl);
        this.intColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 0.5 });
      }
      // the keeper beside the spring
      const keeper = makeVoxelHuman({ top: 0x4ec45e, robe: true, hair: 0xd8d8e8, cap: null });
      keeper.position.set(2.8, 0, -2.6);
      keeper.rotation.y = Math.PI / 1.5;
      s.add(keeper);
      this.intNpcs.push(keeper);
      this.intColliders.push({ pos: new THREE.Vector3(2.8, 0, -2.6), r: 0.6 });
      this.intInteractables.push({
        pos: new THREE.Vector3(2.8, 0, -2.6), radius: 1.9,
        label: 'Press <b>E</b> — ask for the spring\'s blessing',
        handler: () => this.visitSanctum(),
      });
      this.intMarkers = [
        { x: 2.8, z: -2.6, label: 'Keeper', color: '#5ad88a', kind: 'npc' },
        { x: 0, z: -1.5, label: 'Healing Spring', color: '#5ad88a', kind: 'poi' },
        { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
      ];
    }

    // exit back to the street
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 0.6), radius: 1.6,
      label: 'Press <b>E</b> — step outside',
      handler: async () => this.exitHouse(),
    });
  }

  // ================= the Grand Coliseum interior =================
  /** A vast high-tech arena lobby: aspirants, merchants, the sealed Ring. */
  private buildColiseumInterior(): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.intRoom = { w: 32, d: 26 };
    const { w, d } = this.intRoom;
    this.intName = 'Grand Coliseum';

    s.background = skyGradient('#10182a', '#06080f');
    s.add(new THREE.AmbientLight(0xaab8e0, 0.65));
    const main = new THREE.PointLight(0xcfe0ff, 40, 40);
    main.position.set(0, 9, 0);
    main.castShadow = true;
    s.add(main);

    // glossy tech floor with neon guide-strips
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tileTexture('#3a4258', '#222a40', 8), roughness: 0.4, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    for (const sx of [-4.5, 4.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.3, d - 4),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.1 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(sx, 0.02, 0);
      s.add(strip);
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#4a5068', '#2a3044', 4), roughness: 0.85 });
    const mkWall = (ww: number, wd: number, x: number, z: number, h = 7) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, h, wd), wallMat);
      wall.position.set(x, h / 2, z);
      wall.receiveShadow = true;
      s.add(wall);
    };
    mkWall(w, 0.5, 0, -d / 2);
    mkWall(0.5, d, -w / 2, 0);
    mkWall(0.5, d, w / 2, 0);
    mkWall(w / 2 - 2, 0.5, -(w / 4 + 1), d / 2);
    mkWall(w / 2 - 2, 0.5, w / 4 + 1, d / 2);

    // column rows with neon caps
    for (const cx of [-9, 9]) for (const cz of [-4, 2, 8]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x6a7288, metalness: 0.6, roughness: 0.35 }));
      col.position.set(cx, 3.25, cz);
      col.castShadow = true;
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.2 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(cx, 5.6, cz);
      s.add(col, cap);
      this.intColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 0.95 });
    }

    // grand hologram of the tournament ring, floating over the lobby
    const holo = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.4, transparent: true, opacity: 0.8 }));
    holo.position.set(0, 4.2, 1);
    holo.rotation.x = Math.PI / 2.6;
    holo.name = 'stormtip';
    const holoLight = new THREE.PointLight(0xf2c14e, 10, 12);
    holoLight.position.set(0, 4.4, 1);
    s.add(holo, holoLight);

    // banners of the three Legendary Tamers along the back wall
    [0xf2603a, 0xf2d23a, 0x4ec45e].forEach((col, i) => {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.85, side: THREE.DoubleSide }));
      banner.position.set((i - 1) * 5.5, 4.2, -d / 2 + 0.4);
      s.add(banner);
    });

    // ---- THE RING — raised, sealed, guarded ----
    const stage = new THREE.Mesh(new THREE.BoxGeometry(15, 1.4, 5.5),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#5a6280', '#323a54', 3), roughness: 0.7 }));
    stage.position.set(0, 0.7, -d / 2 + 3.2);
    s.add(stage);
    const ringFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.12, 28),
      new THREE.MeshStandardMaterial({ color: 0x2a3248, roughness: 0.5, metalness: 0.4 }));
    ringFloor.position.set(0, 1.46, -d / 2 + 3.2);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xe83a5a, emissive: 0xe83a5a, emissiveIntensity: 1.5 }));
    ringGlow.rotation.x = Math.PI / 2;
    ringGlow.position.set(0, 1.55, -d / 2 + 3.2);
    ringGlow.name = 'neon';
    const ringLight = new THREE.PointLight(0xe83a5a, 14, 14);
    ringLight.position.set(0, 3.4, -d / 2 + 3.2);
    s.add(ringFloor, ringGlow, ringLight);
    // statue guardians flanking the ring
    for (const side of [-5.5, 5.5]) {
      const statue = makeGuardian(side < 0 ? 'blazemaw' : 'stormclaw');
      statue.group.position.set(side, 1.4, -d / 2 + 3.0);
      statue.group.rotation.y = 0;
      statue.group.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: 0x8a90a8, roughness: 0.4, metalness: 0.5 });
      });
      s.add(statue.group);
      this.intRigs.push(statue);
    }
    // sealed gate: bars across the stage front
    for (let i = -6; i <= 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
      bar.position.set(i * 1.15, 1.3, -d / 2 + 6.2);
      s.add(bar);
    }
    const gateRail = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.22, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
    gateRail.position.set(0, 2.6, -d / 2 + 6.2);
    s.add(gateRail);
    // gate colliders — the ring cannot be reached
    for (let gx = -7; gx <= 7; gx += 2) {
      this.intColliders.push({ pos: new THREE.Vector3(gx, 0, -d / 2 + 6.2), r: 1.2 });
    }
    // the two guards
    const guardL = makeVoxelHuman({ top: 0x8a3040, hair: 0x2a2a3a, cap: 0xc9a24a });
    guardL.position.set(-2.4, 0, -d / 2 + 7.4);
    const guardR = makeVoxelHuman({ top: 0x8a3040, hair: 0x4a3a2a, cap: 0xc9a24a });
    guardR.position.set(2.4, 0, -d / 2 + 7.4);
    s.add(guardL, guardR);
    this.intNpcs.push(guardL, guardR);
    this.intColliders.push({ pos: guardL.position.clone().setY(0), r: 0.6 }, { pos: guardR.position.clone().setY(0), r: 0.6 });
    const guardLines = [
      'The Ring is sealed until the Grand Tournament opens. No exceptions — not even for Grand House colors.',
      'Up there is where champions are made. Down here is where they wait. You\'re down here.',
      'They say Aljay, Greggy and Onnel fought their qualification matches on that very ring, before the war. Show some respect.',
    ];
    for (const gpos of [guardL.position, guardR.position]) {
      this.intInteractables.push({
        pos: gpos.clone().setY(0), radius: 1.7,
        label: 'Press <b>E</b> — speak with the Ring Guard',
        handler: async () => { await say('Ring Guard', guardLines[Math.floor(Math.random() * guardLines.length)]); },
      });
    }

    // ---- tournament attendant ----
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 1.05, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x3a4258, metalness: 0.5, roughness: 0.4 }));
    desk.position.set(0, 0.52, -2.5);
    const deskNeon = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.3 }));
    deskNeon.position.set(0, 1.06, -2.06);
    s.add(desk, deskNeon);
    this.intColliders.push({ pos: new THREE.Vector3(-1.6, 0, -2.5), r: 1.0 }, { pos: new THREE.Vector3(0, 0, -2.5), r: 1.0 }, { pos: new THREE.Vector3(1.6, 0, -2.5), r: 1.0 });
    const attendant = makeVoxelHuman({ top: 0x5ab8e8, hair: 0x6a3a1a, cap: null });
    attendant.position.set(0, 0, -3.7);
    s.add(attendant);
    this.intNpcs.push(attendant);
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, -1.6), radius: 1.9,
      label: 'Press <b>E</b> — Tournament Registration',
      handler: async () => {
        const pick = await choose('Attendant Lyssa',
          'Welcome to the Grand Coliseum of Haven City! The Grand Tournament — fought in the very Ring where the three Legendary Tamers once qualified — is being prepared. What would you like to know?',
          ['Register for the Tournament', 'Ask about the Ring', 'Ask about the Legendary Tamers', 'Nothing, thanks']);
        if (pick === 0) {
          await say('Attendant Lyssa', 'Registration is not yet open — the brackets, the prize vault and the broadcast crystals are still being prepared. Keep training, tamer. When the horns sound across Haven City, come straight to me. I\'ll hold a slot for you.');
          toast('🏟️ The Grand Tournament opens soon!', 'gold');
        } else if (pick === 1) {
          await say('Attendant Lyssa', 'The Ring seats ten thousand and the sound of a final can be heard from the city walls. It stays sealed between tournaments — the two guards up there take their job VERY seriously.');
        } else if (pick === 2) {
          await say('Attendant Lyssa', 'Aljay the Dawnflame, Greggy the Stormheart, Onnel the Worldroot — they qualified on our Ring before the Legion War. The three banners hang in their honor. Half the aspirants in this hall grew up on those stories. The other half won\'t admit it.');
        }
      },
    });

    // ---- merchants in the side alcoves ----
    const stall = (sx: number, color: number) => {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.8),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.85 }));
      counter.position.set(sx, 0.5, 5.5);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.6),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      awning.position.set(sx, 2.5, 5.6);
      s.add(counter, awning);
      this.intColliders.push({ pos: new THREE.Vector3(sx, 0, 5.5), r: 1.6 });
    };
    stall(-11, 0xd84a3a);
    const vesna = makeVoxelHuman({ top: 0xd84a3a, hair: 0x7a4a2a, cap: 0xf2ead0 });
    vesna.position.set(-11, 0, 6.7);
    s.add(vesna);
    this.intNpcs.push(vesna);
    this.intInteractables.push({
      pos: new THREE.Vector3(-11, 0, 4.6), radius: 1.8,
      label: 'Press <b>E</b> — Vesna\'s Battle Provisions',
      handler: async () => {
        await say('Merchant Vesna', 'Tonics, treats and field kit — everything a tournament hopeful burns through. Stock up before the brackets open!');
        await this.runShopUI('⚔️ Vesna\'s Battle Provisions', SHOP_STOCK);
      },
    });
    stall(11, 0x9a5af2);
    const korr = makeVoxelHuman({ top: 0x9a5af2, hair: 0x1a1a2e, cap: null });
    korr.position.set(11, 0, 6.7);
    s.add(korr);
    this.intNpcs.push(korr);
    this.intInteractables.push({
      pos: new THREE.Vector3(11, 0, 4.6), radius: 1.8,
      label: 'Press <b>E</b> — Korr\'s Gem Exchange',
      handler: async () => {
        await say('Gemcutter Korr', 'Stat gems, cut from crystallized Guardian essence. Champions are built one facet at a time.');
        await this.runShopUI('💎 Korr\'s Gem Exchange', GEM_STOCK);
      },
    });

    // ---- aspiring tamers around the hall ----
    const aspirants: { x: number; z: number; top: number; line: string }[] = [
      { x: -3, z: 0.5, top: 0xd99a4a, line: 'I\'ve drilled my Voltyx every dawn for a year. When that Ring opens, we\'re ready. We were BORN ready.' },
      { x: 3.4, z: 0.2, top: 0x3a8ad9, line: 'They say the prize vault holds a gem cut by Greggy himself. Probably a rumor. I\'m still going to win it.' },
      { x: -6, z: 3, top: 0x4ec45e, line: 'My gran watched Onnel qualify on this Ring before the war. Same Ring! I touch the gate bars for luck. The guards hate it.' },
      { x: 6, z: 2.6, top: 0xe85a8a, line: 'Registration NOT OPEN YET. I\'ve asked Lyssa eleven times. The twelfth will be the one, I can feel it.' },
      { x: -2.5, z: 7.5, top: 0x8a93a8, line: 'I came from Tharkand for this — two months by sand-crawler. The Coliseum is even bigger than the stories.' },
      { x: 2.8, z: 8.4, top: 0xf2d23a, line: 'Strategy is everything. Elements, swap timing, SP economy… I have a notebook. Three notebooks.' },
      { x: -8.5, z: -1.5, top: 0x6a4a9a, line: 'Shh — I\'m visualizing my finals entrance. There\'s pyrotechnics. There\'s a slow walk. The crowd goes quiet…' },
      { x: 8.6, z: -1.2, top: 0x4a7a9a, line: 'Aljay fought HERE. Greggy fought HERE. One day someone will whisper that about us. Well. About me.' },
    ];
    for (const a of aspirants) {
      const npc = makeVoxelHuman({ top: a.top, hair: [0x2a2a3a, 0x6a3a1a, 0x7a4a2a, 0xd8d8d8][Math.floor(Math.random() * 4)], cap: Math.random() < 0.4 ? 0xd84a3a : null });
      npc.position.set(a.x, 0, a.z);
      npc.rotation.y = Math.random() * Math.PI * 2;
      s.add(npc);
      this.intNpcs.push(npc);
      this.intColliders.push({ pos: npc.position.clone().setY(0), r: 0.55 });
      this.intInteractables.push({
        pos: npc.position.clone().setY(0), radius: 1.5,
        label: 'Press <b>E</b> — chat with an aspiring tamer',
        handler: async () => { await say('Aspiring Tamer', a.line); },
      });
    }

    // minimap
    this.intMarkers = [
      { x: 0, z: -d / 2 + 3.2, label: 'THE RING (sealed)', color: '#e83a5a', kind: 'poi' },
      { x: -2.4, z: -d / 2 + 7.4, label: 'Guard', color: '#c9a24a', kind: 'npc' },
      { x: 2.4, z: -d / 2 + 7.4, label: 'Guard', color: '#c9a24a', kind: 'npc' },
      { x: 0, z: -3.7, label: 'Registration', color: '#5ab8e8', kind: 'npc' },
      { x: -11, z: 5.5, label: 'Provisions', color: '#d84a3a', kind: 'building' },
      { x: 11, z: 5.5, label: 'Gems', color: '#9a5af2', kind: 'building' },
      { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
    ];

    // exit
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 0.6), radius: 1.8,
      label: 'Press <b>E</b> — leave the Coliseum',
      handler: async () => this.exitHouse(),
    });
  }

  private async enterService(kind: 'shop' | 'garage' | 'sanctum' | 'coliseum'): Promise<void> {
    this.busy = true;
    this.exitSpot.copy(this.tamer.position);
    if (kind === 'coliseum') this.buildColiseumInterior();
    else this.buildServiceInterior(kind);
    this.streetScene.remove(this.tamer);
    this.interiorScene!.add(this.tamer);
    this.tamer.position.set(0, 0, this.intRoom.d / 2 - 1.4);
    this.tamer.rotation.y = Math.PI;
    this.camera.position.set(0, 6, this.intRoom.d / 2 + 4);
    this.mode = 'interior';
    toast(this.intName, 'gold');
    this.busy = false;
  }

  private async enterHouse(h: HouseDef): Promise<void> {
    this.busy = true;
    this.exitSpot.copy(this.tamer.position);
    this.buildInterior(h);
    this.streetScene.remove(this.tamer);
    this.interiorScene!.add(this.tamer);
    this.tamer.position.set(0, 0, this.intRoom.d / 2 - 1.4);
    this.tamer.rotation.y = Math.PI; // face into the hall
    this.camera.position.set(0, 6, this.intRoom.d / 2 + 4);
    this.mode = 'interior';
    toast(`${h.name}`, 'gold');
    this.busy = false;
  }

  private exitHouse(): void {
    this.mode = 'street';
    this.interiorScene?.remove(this.tamer);
    this.streetScene.add(this.tamer);
    this.tamer.position.copy(this.exitSpot);
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.interiorScene = null;
  }

  // ================= dialogue flows =================
  private async talkToMaster(h: HouseDef): Promise<void> {
    const p = this.player;
    const starter = SPECIES[h.starter];
    const lore = GUILD_LORE[h.id];
    if (!p.houseId) {
      await conversation([
        [h.master, `Welcome to ${h.name}, young graduate — ${lore.epithet}, founded by ${lore.founder}. Our creed: "${h.motto}"`],
        [h.master, `We raise ${h.type}-type Guardians. Pledge to us, and I will entrust you with a newborn ${starter.name} — along with your ${lore.cardName}, the effigy-card that records a tamer's whole legend.`],
      ]);
      const joined = await guildJoinCeremony(p, h, h.master);
      if (joined) updateHUD(p, 'Haven City');
    } else if (p.houseId === h.id) {
      await this.masterQuestFlow(h);
    } else {
      await say(h.master, `You wear another house's colors, tamer. We respect oaths here — but our hall is open to all guests. Warm yourself by our hearth.`);
    }
  }

  /** The master drives the guild's main quest chain: turn-ins, new orders, reminders. */
  private async masterQuestFlow(h: HouseDef): Promise<void> {
    const p = this.player;
    const lore = GUILD_LORE[h.id];
    const chain = mainChain(h.id);
    const next = chain.find(q => p.quests[q.id] !== 'done');

    if (!next) {
      await conversation([
        [h.master, `${p.tamerName}. Every order this house had for you is complete — the Vault quiet, the Stormspire silent, your family grown.`],
        [h.master, `Your ${lore.cardName} bears a record most members never approach in a lifetime. When historians write of ${lore.epithet}, your page is already inked. Walk tall — and keep your Guardians fed.`],
      ]);
      return;
    }

    const st = questState(p, next.id);
    if (st === 'ready') {
      const done = Object.values(p.quests).filter(v => v === 'done').length;
      await conversation([
        [h.master, `Word reached me before you did, ${p.tamerName}. "${next.title}" — done, and done well.`],
        [h.master, `${lore.creedLong}`],
      ]);
      const summary = completeQuest(p, next.id);
      toast(`Main quest complete: ${next.title}!`, 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      updateHUD(p, 'Haven City');
      // the chain continues immediately
      const after = chain.find(q => p.quests[q.id] !== 'done');
      if (after) {
        await conversation([
          [h.master, `And the house is not done with you yet. Listen well — your next orders:`],
          [h.master, after.brief],
        ]);
        acceptQuest(p, after.id);
        toast(`Main quest started: ${after.title}`, 'gold');
        p.save();
      } else if (done + 1 >= chain.length) {
        await say(h.master, `That was the last order on the books. ${lore.epithet} salutes you — go look at your ${lore.cardName}; it has something new to say about your rank.`);
      }
    } else if (st === 'available' || st === 'locked') {
      await conversation([
        [h.master, `${p.tamerName}, good — I have orders for you. Your next chapter with ${h.name}:`],
        [h.master, next.brief],
      ]);
      acceptQuest(p, next.id);
      toast(`Main quest started: ${next.title}`, 'gold');
      p.save();
    } else {
      await conversation([
        [h.master, `Your standing orders, ${p.tamerName}: "${next.title}" — ${next.objective}. ${next.location} awaits.`],
        [h.master, `Tip: gift wild Guardians treats in battle to win their hearts. A bigger family means more strategies — and types matter. ${h.motto}`],
      ]);
    }
  }

  private async visitSanctum(): Promise<void> {
    const p = this.player;
    await say('Sanctum Keeper', 'Rest, weary travelers. The spring restores all.');
    p.healAll();
    toast('Party fully healed. Crawler restocked.', 'gold');
    p.save();
    updateHUD(p, 'Haven City');
  }

  // ================= shop =================
  private async openShop(): Promise<void> {
    await say('Merchant Pina', 'Welcome, welcome! Finest provisions in Haven City — and gems for serious tamers!');
    await this.runShopUI('🛒 Pina\'s Provisions', [...SHOP_STOCK, ...GEM_STOCK]);
  }

  /** Generic buy/sell screen used by Pina and the Coliseum merchants. */
  private async runShopUI(title: string, stock: string[]): Promise<void> {
    this.busy = true;
    await new Promise<void>(resolve => {
      const render = () => {
        const p = this.player;
        const rows = stock.map(id => {
          const it = ITEMS[id];
          return `<div class="list-row"><div style="flex:1"><b>${it.name}</b> <span class="goldcol">◆${it.price}</span>
            <div class="sub">${it.desc} (owned: ${p.itemCount(id)})</div></div>
            <button class="ui-btn" data-buy="${id}" ${p.shards < it.price ? 'disabled' : ''}>Buy</button></div>`;
        }).join('');
        const sellables = [...p.inventory.entries()].map(([id, qty]) => {
          const it = ITEMS[id];
          const sellPrice = Math.floor(it.price * 0.5);
          return `<div class="list-row"><div style="flex:1"><b>${it.name}</b> ×${qty}<div class="sub">Sells for ◆${sellPrice}</div></div>
            <button class="ui-btn" data-sell="${id}" ${sellPrice <= 0 ? 'disabled' : ''}>Sell</button></div>`;
        }).join('') || '<div class="sub">Nothing to sell.</div>';
        const el = openScreen(`
          <h3>${title} — <span class="goldcol">◆${p.shards} Shards</span></h3>
          <div class="grid2">
            <div><h3>Buy</h3><div style="max-height:380px;overflow-y:auto">${rows}</div></div>
            <div><h3>Sell (half price)</h3><div style="max-height:380px;overflow-y:auto">${sellables}</div></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="ui-btn primary" id="shop-close">Leave Shop</button></div>`);
        el.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
          const it = ITEMS[b.dataset.buy!];
          if (p.shards >= it.price && p.addItem(it.id)) { p.shards -= it.price; toast(`Bought ${it.name}.`); }
          else if (p.shards >= it.price) toast('Cargo hold is full!', 'red');
          render();
        });
        el.querySelectorAll<HTMLElement>('[data-sell]').forEach(b => b.onclick = () => {
          const it = ITEMS[b.dataset.sell!];
          p.removeItem(it.id);
          p.shards += Math.floor(it.price * 0.5);
          toast(`Sold ${it.name}.`);
          render();
        });
        (el.querySelector('#shop-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
      };
      render();
    });
    this.busy = false;
    updateHUD(this.player, 'Haven City');
    this.player.save();
  }

  // ================= garage =================
  private async openGarage(): Promise<void> {
    await say('Engineer Dax', 'Ah, a Crawler! Beautiful machine. Let\'s tune her up — new parts, repairs, the works.');
    this.busy = true;
    await new Promise<void>(resolve => {
      const render = () => {
        const p = this.player;
        const c = p.crawler;
        const slots: ('hull' | 'engine' | 'cargo' | 'cannon' | 'scanner')[] = ['hull', 'engine', 'cargo', 'cannon', 'scanner'];
        const sections = slots.map(slot => {
          const parts = Object.values(CRAWLER_PARTS).filter(x => x.slot === slot).sort((a, b) => a.tier - b.tier);
          const rows = parts.map(part => {
            const owned = c.owned.includes(part.id);
            const equipped = c.parts[slot] === part.id;
            const btn = equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>'
              : owned ? `<button class="ui-btn" data-equip="${part.id}">Equip</button>`
              : `<button class="ui-btn" data-buypart="${part.id}" ${p.shards < part.price ? 'disabled' : ''}>Buy ◆${part.price}</button>`;
            return `<div class="list-row"><div style="flex:1"><b>${part.name}</b> <span class="sub">T${part.tier}</span><div class="sub">${part.desc}</div></div>${btn}</div>`;
          }).join('');
          return `<h3 style="margin-top:8px">${slot.toUpperCase()}</h3>${rows}`;
        }).join('');
        const el = openScreen(`
          <h3>🔧 Dax's Garage — <span class="goldcol">◆${p.shards} Shards</span></h3>
          <div class="sub">Hull ${c.hull}/${c.hullMax} · Energy ${c.energy}/${c.energyMax} · Cargo ${p.inventory.size}/${c.cargoMax} · Cannon T${c.cannonTier} · Scanner T${c.scannerTier}</div>
          <div style="max-height:420px;overflow-y:auto">${sections}</div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">
            <button class="ui-btn" id="garage-repair" ${c.hull >= c.hullMax && c.energy >= c.energyMax ? 'disabled' : ''}>Full service ◆50</button>
            <button class="ui-btn primary" id="garage-close">Leave Garage</button>
          </div>`);
        el.querySelectorAll<HTMLElement>('[data-buypart]').forEach(b => b.onclick = () => {
          const part = CRAWLER_PARTS[b.dataset.buypart!];
          if (p.shards >= part.price) {
            p.shards -= part.price;
            p.crawler.owned.push(part.id);
            p.crawler.equip(part.id);
            toast(`${part.name} installed!`, 'gold');
          }
          render();
        });
        el.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = () => {
          p.crawler.equip(b.dataset.equip!);
          toast('Part equipped.');
          render();
        });
        (el.querySelector('#garage-repair') as HTMLButtonElement).onclick = () => {
          if (p.shards >= 50) { p.shards -= 50; p.crawler.restock(); toast('Crawler fully serviced!', 'gold'); render(); }
          else toast('Not enough Shards.', 'red');
        };
        (el.querySelector('#garage-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
      };
      render();
    });
    this.busy = false;
    updateHUD(this.player, 'Haven City');
    this.player.save();
  }

  // ================= bounty board =================
  private async openBounties(): Promise<void> {
    this.busy = true;
    await new Promise<void>(resolve => {
      const render = () => {
        const p = this.player;
        const rows = BOUNTIES.map(b => {
          const claimed = !!p.flags[`claimed_${b.id}`];
          const done = b.check(p);
          const rw = b.reward.shards ? `◆${b.reward.shards}` : ITEMS[b.reward.item!].name;
          const btn = claimed ? '<span class="tag" style="background:var(--ui-dim);color:#0c1022">CLAIMED</span>'
            : done ? `<button class="ui-btn primary" data-claim="${b.id}">Claim ${rw}</button>`
            : `<span class="sub">Reward: ${rw}</span>`;
          return `<div class="list-row"><div style="flex:1"><b>${done || claimed ? '✅' : '⬜'} ${b.desc}</b></div>${btn}</div>`;
        }).join('');
        const el = openScreen(`
          <h3>📜 Haven City Bounty Board</h3>
          <div class="sub" style="margin-bottom:8px">The city rewards brave tamers. Complete deeds, claim the spoils.</div>
          ${rows}
          <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="ui-btn primary" id="bounty-close">Close</button></div>`);
        el.querySelectorAll<HTMLElement>('[data-claim]').forEach(btn => btn.onclick = () => {
          const b = BOUNTIES.find(x => x.id === btn.dataset.claim)!;
          p.flags[`claimed_${b.id}`] = true;
          if (b.reward.shards) p.shards += b.reward.shards;
          if (b.reward.item) p.addItem(b.reward.item);
          toast('Bounty claimed!', 'gold');
          p.save();
          render();
        });
        (el.querySelector('#bounty-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
      };
      render();
    });
    this.busy = false;
    updateHUD(this.player, 'Haven City');
  }

  // ================= gate =================
  private async openGate(): Promise<void> {
    const p = this.player;
    if (!p.houseId) {
      await say('Gatekeeper', 'Expeditions are for guild members only. Pledge to one of the five Grand Houses first — their halls stand to the north.');
      return;
    }
    const pick = await choose('Gatekeeper', 'Beyond this gate lies the wide world of Aurel. Depart on expedition?', ['Depart!', 'Stay in the city']);
    if (pick === 0) {
      p.save();
      this.resolveExit?.('expedition');
    }
  }

  // ================= per-frame =================
  private update(dt: number): void {
    if (!this.sun) return; // a frame can render before run() builds the street
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
      const { w, d } = this.intRoom;
      const inBounds = (x: number, z: number) => this.mode === 'street'
        ? Math.hypot(x, z) <= 39.5
        : Math.abs(x) <= w / 2 - 0.7 && Math.abs(z) <= d / 2 - 0.7;
      const free = (x: number, z: number) =>
        !this.colliders.some(c => Math.hypot(x - c.pos.x, z - c.pos.z) < c.r) && inBounds(x, z);
      const curY = this.tamer.position.y;
      if (free(nx, nz)) this.tamer.position.set(nx, curY, nz);
      else if (free(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (free(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz); // voxel human faces +Z at rotation 0
    }
    // terrain height — the Grand Houses' terrace and its stairs
    if (this.mode === 'street') {
      this.tamer.position.y = this.groundH(this.tamer.position.x, this.tamer.position.z);
    } else {
      this.tamer.position.y = 0;
    }
    updateVoxelHuman(this.tamer, this.walking, dt);
    this.intNpcs.forEach(npc => updateVoxelHuman(npc, false, dt));

    // wandering townsfolk — they go about their errands and only stop
    // for you while actually talking (no crowding around the player)
    if (this.mode === 'street') {
      for (const wlk of this.walkers) {
        if (wlk.talking) {
          const dxx = this.tamer.position.x - wlk.grp.position.x;
          const dzz = this.tamer.position.z - wlk.grp.position.z;
          wlk.grp.rotation.y = Math.atan2(dxx, dzz);
          updateVoxelHuman(wlk.grp, false, dt);
          continue;
        }
        if (wlk.pause > 0) {
          wlk.pause -= dt;
          updateVoxelHuman(wlk.grp, false, dt);
          continue;
        }
        const dir = wlk.target.clone().sub(wlk.grp.position);
        dir.y = 0;
        if (dir.length() < 0.4) {
          wlk.pause = 1.5 + Math.random() * 4;
          wlk.target = this.nextWanderTarget(wlk.grp.position);
        } else {
          dir.normalize();
          wlk.grp.position.addScaledVector(dir, 1.7 * dt);
          wlk.grp.rotation.y = Math.atan2(dir.x, dir.z);
        }
        updateVoxelHuman(wlk.grp, wlk.pause <= 0, dt);
      }
    }

    // camera follow
    const t = this.tamer.position;
    const camGoal = this.mode === 'street'
      ? new THREE.Vector3(t.x, t.y + 7.5, t.z + 9)
      : new THREE.Vector3(t.x * 0.5, 5.6, t.z + 6.4);
    this.camera.position.lerp(camGoal, Math.min(1, dt * 4));
    this.camera.lookAt(t.x, t.y + 1, t.z);

    // ---- day/night cycle ----
    if (this.mode === 'street') {
      this.dayTime = (this.dayTime + dt / 240) % 1;
      const daylight = Math.max(0, Math.sin((this.dayTime - 0.25) * Math.PI * 2));
      const night = 1 - Math.min(1, daylight * 1.6);
      this.skyTimer += dt;
      if (this.skyTimer > 0.8) {
        this.skyTimer = 0;
        const [top, bottom, fogCol] = skyAt(this.dayTime);
        this.skyTex?.dispose();
        this.skyTex = skyGradient(top, bottom);
        this.streetScene.background = this.skyTex;
        (this.streetScene.fog as THREE.Fog).color.set(fogCol);
      }
      if (this.sun) {
        const dusk = daylight > 0 && daylight < 0.35 ? 1 - daylight / 0.35 : 0;
        this.sun.intensity = 0.12 + 1.5 * daylight;
        this.sun.color.set(lerpHex('#fff0d0', '#ff9a5a', dusk * 0.85));
      }
      if (this.ambient) this.ambient.intensity = 0.28 + 0.5 * daylight;
      this.streetScene.traverse(o => {
        if (o.name === 'streetlamp') (o as THREE.PointLight).intensity = 11 * night;
        if (o.name === 'lampOrb') {
          ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + 1.25 * night;
        }
      });
    }

    // ambient prop animation
    const scene = this.mode === 'interior' && this.interiorScene ? this.interiorScene : this.streetScene;
    const now = performance.now();
    scene.traverse(o => {
      if (o.name === 'flame') { o.scale.y = 1 + Math.sin(now * 0.008 + o.position.x) * 0.18; }
      if (o.name === 'stormtip') { o.rotation.y = now * 0.002; }
      if (o.name === 'showcrawler') { o.rotation.y = now * 0.0006; }
      if (o.name === 'smoke') { o.position.y = 3.9 + Math.sin(now * 0.0014) * 0.2; o.scale.setScalar(1 + Math.sin(now * 0.0017) * 0.2); }
      if (o.name === 'springwater') { o.scale.setScalar(1 + Math.sin(now * 0.0022) * 0.03); }
      if (o.name === 'portal') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(now * 0.003) * 0.18;
    });

    // ---- labeled minimap ----
    const cv = minimapCanvas();
    if (this.mode === 'street') {
      const hh = Math.floor(this.dayTime * 24), mm = Math.floor((this.dayTime * 24 % 1) * 60);
      drawAreaMap(cv, {
        shape: 'circle', radius: 43,
        markers: [
          ...this.streetMarkers,
          ...this.walkers.map(wk => ({ x: wk.grp.position.x, z: wk.grp.position.z, color: '#d8d8e8', kind: 'npc' as const })),
        ],
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title: `Haven City — ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      });
    } else {
      drawAreaMap(cv, {
        shape: 'rect', w: this.intRoom.w, d: this.intRoom.d,
        markers: this.intMarkers,
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title: this.intName,
      });
    }

    if (isDialogueOpen() || isMenuOpen() || this.busy) { showInteractHint(null); return; }
    const near = this.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
    if (near) { showInteractHint(near.label); return; }
    const wlk = this.nearbyWalker();
    showInteractHint(wlk ? `Press <b>E</b> — chat with ${wlk.name}` : null);
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, 'Haven City');
      this.busy = false;
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;
    if (k === 'e' || k === 'enter') {
      const near = this.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
      if (near) {
        const npc = this.intNpcs.find(n => n.position.distanceTo(near.pos) < 2.6);
        if (npc) {
          const origRot = npc.rotation.y;
          // NPC faces player
          const dxx = this.tamer.position.x - npc.position.x;
          const dzz = this.tamer.position.z - npc.position.z;
          npc.rotation.y = Math.atan2(dxx, dzz);

          // Player faces NPC
          const pxx = npc.position.x - this.tamer.position.x;
          const pzz = npc.position.z - this.tamer.position.z;
          this.tamer.rotation.y = Math.atan2(pxx, pzz);

          Promise.resolve(near.handler()).then(() => {
            npc.rotation.y = origRot;
          });
        } else {
          near.handler();
        }
        return;
      }
      const wlk = this.nearbyWalker();
      if (wlk) {
        // Player faces the walker
        const pxx = wlk.grp.position.x - this.tamer.position.x;
        const pzz = wlk.grp.position.z - this.tamer.position.z;
        this.tamer.rotation.y = Math.atan2(pxx, pzz);

        const origRot = wlk.grp.rotation.y;
        wlk.talking = true;
        say(wlk.name, wlk.lines[Math.floor(Math.random() * wlk.lines.length)])
          .then(() => {
            wlk.talking = false;
            wlk.grp.rotation.y = origRot;
          });
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
        updateHUD(this.player, 'Haven City');
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  // ================= entry =================
  /** Resolves when the player departs — through the Expedition Gate or the University Shuttle. */
  async run(): Promise<'expedition' | 'university'> {
    this.buildStreet();
    updateHUD(this.player, 'Haven City');
    showHotkeys(true);
    // debug handle for automated testing
    (window as unknown as Record<string, unknown>).__town = {
      tamer: this.tamer,
      town: this,
      interactables: this.streetInteractables.map(i => ({ x: i.pos.x, z: i.pos.z, label: i.label })),
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    if (this.firstArrival) {
      const joined = HOUSES.find(h => h.id === this.player.houseId);
      await conversation([
        ['???', 'Hold, graduate! Welcome to Haven City — heart of the Tamer Guilds.'],
        joined
          ? ['Guide Mara', `I'm Mara, guild guide — and I see ${joined.name} colors already! Then head north: your house hall stands in the great arc, and the master has orders waiting for members. Check your Quest Journal with J.`]
          : ['Guide Mara', `I'm Mara, guild guide. Haven't pledged to a Grand House yet? Their five halls stand to the north — speak with any master, or ride the shuttle back to the University's Officers' Hall. A house grants your first true partner and your guild Sigil.`],
        ['Guide Mara', 'South side has Pina\'s shop, Dax\'s garage for your Crawler, the healing Sanctum, and the Bounty Board. The Expedition Gate is east — and the University Shuttle pad is west, whenever you wish to visit the old halls.'],
        ['Guide Mara', 'Move with WASD, interact with E. Check your gear anytime: P — tamer data, I — inventory, G — Guardians, C — Crawler, J — quest journal, Esc — menu. Good luck!'],
      ]);
      this.player.save();
    }

    return new Promise<'expedition' | 'university'>(res => {
      this.resolveExit = dest => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        showInteractHint(null);
        showHotkeys(false);
        hideAreaMap(minimapCanvas());
        this.intRigs.forEach(disposeRig);
        res(dest);
      };
    });
  }
}
