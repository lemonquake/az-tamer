// ============================================================
// AZ Tamer — Haven City: voxel tamer walking mode, Grand Houses
// with unique exteriors AND enterable interiors, shop, garage,
// sanctum, bounty board, dungeon gate
// ============================================================
import * as THREE from 'three';
import { HOUSES, DUNGEONS, ITEMS, SHOP_STOCK, GEM_STOCK, CRAWLER_PARTS, SPECIES, type DungeonDef, type HouseDef } from './data';
import { Player, Guardian } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, makeGuardian, disposeRig, makeCrawler, disposeCrawler,
  makeTree, makeStreetLamp, makeCustomCreature, mulberry,
  plankTexture, stoneTexture, marbleTexture, tileTexture, bookshelfTexture,
  carpetTexture, wallpaperTexture, skyGradient, barkTexture, leafTexture,
  HAIRSTYLES, SKIN_TONES, HAIR_COLORS, type GuardianRig, type TreeKind, type CrawlerLook,
} from './models';
import { LEGENDS, WORLD_CIRCUIT, LEGEND_GUARDIANS, DAUGHTERS } from './lore';
import { CRAWLER_SLOTS, CRAWLER_SLOT_INFO, PAINT_JOBS, ELEMENT_CSS, type CrawlerSlot } from './data';
import {
  say, conversation, choose, askName, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, openScreen, closeMenu, type PanelKind,
} from './ui';
import { mainChain, questState, acceptQuest, completeQuest, syncStoryQuests } from './quests';
import { GUILD_LORE } from './guilds';
import { guildJoinCeremony } from './university';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance, CLOTHES_DATABASE } from './clothes';

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

  // wandering guardian pets (idle rigs that stroll the lanes)
  private pets: { rig: GuardianRig; target: THREE.Vector3; pause: number; name: string; line: string }[] = [];

  // stationary street NPCs (the daughters at the fountain) — idle-animated
  private staticNpcs: THREE.Group[] = [];

  // ambient life
  private butterflies: { grp: THREE.Group; anchor: THREE.Vector3; phase: number; wingL: THREE.Object3D; wingR: THREE.Object3D }[] = [];
  private fireflies: { mesh: THREE.Mesh; anchor: THREE.Vector3; phase: number }[] = [];
  private fallingLeaves: { mesh: THREE.Mesh; anchor: THREE.Vector3; phase: number; h: number }[] = [];
  private clouds: THREE.Group[] = [];
  private ducks: { grp: THREE.Group; angle: number; r: number; center: THREE.Vector3; speed: number }[] = [];
  private windmillHub: THREE.Object3D | null = null;
  private fountainJet: THREE.Mesh | null = null;

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

  private label3d(scene: THREE.Scene, text: string, color: string, pos: THREE.Vector3, scale = 4.4): void {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 56px Trebuchet MS';
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    c.width = Math.max(512, textWidth + 64);
    c.height = 128;

    const ctx2 = c.getContext('2d')!;
    ctx2.font = 'bold 56px Trebuchet MS';
    ctx2.textAlign = 'center';
    ctx2.lineWidth = 10; ctx2.strokeStyle = '#0a0c18';
    ctx2.strokeText(text, c.width / 2, 80);
    ctx2.fillStyle = color;
    ctx2.fillText(text, c.width / 2, 80);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 40;
    const aspect = c.width / c.height;
    sp.scale.set(scale * (aspect / 4), scale / 4, 1);
    sp.position.copy(pos);
    scene.add(sp);
  }

  // ================= terrain =================
  /** City scale: painted ground reaches CITY_R, the walls stand at WALL_R. */
  static readonly CITY_R = 56;
  static readonly WALL_R = 52;

  /** Rolling hills inside the walls: [x, z, radius, height]. Negative height digs the pond basin. */
  private static readonly HILLS: [number, number, number, number][] = [
    [-36, 16, 9, 2.2],    // west park hill
    [32, 28, 10, 2.6],    // the windmill hill
    [12, 42, 8, 1.6],
    [-16, 42, 9, 1.8],
    [40, 14, 7, 1.4],
    [-40, -8, 7, 1.6],
    [-8, 26, 5, 0.7],
    [22, 16, 5, 0.6],
    [-26, 30, 5.5, -0.7], // the pond basin
  ];

  /** Roads as segments [x0, z0, x1, z1, width] — used for painting, lamps and grass placement. */
  private static readonly ROADS: [number, number, number, number, number][] = [
    [0, 0, 0, -20, 3.2],      // north — grand stairs to the terrace
    [0, 0, -14, 7, 2.4],      // provisions bazaar
    [0, 0, 14, 7, 2.4],       // crawler garage
    [0, 0, 0, 18, 2.4],       // sanctum
    [0, 0, 8, 6, 1.6],        // bounty kiosk
    [0, 0, -26, 0, 2.6],      // shuttle pad
    [0, 0, 47, 0, 2.8],       // expedition gate
    [0, 0, 28, -17, 3.0],     // the Grand Coliseum
    [0, 0, -14, -7, 2.4],     // boutique road
    [-14, 7, 0, 18, 1.4],     // market lanes
    [14, 7, 0, 18, 1.4],
    [0, 18, -24, 29, 1.6],    // park path to the pond
    [14, 7, 30, 26, 1.4],     // windmill trail
    [-14, -7, -36, -28, 1.8], // Legends' Rest — the memorial park, north-west
  ];

  /**
   * Ground height anywhere in the city. The whole town honors this —
   * the player, every NPC, every lamp post and tree obeys the same
   * gravity over the same uneven earth.
   */
  private groundH(x: number, z: number): number {
    if (z < -24 && Math.abs(x) <= 27) return 1.0; // the Grand Houses' terrace
    let h = 0;
    if (z <= -19.5 && z >= -24 && Math.abs(x) <= 5) h = (-z - 19.5) / 4.5; // the grand stairs
    for (const [hx, hz, hr, hh] of Town.HILLS) {
      const d2 = (x - hx) * (x - hx) + (z - hz) * (z - hz);
      h += hh * Math.exp(-d2 / (hr * hr));
    }
    return h;
  }

  /** Distance from a point to the nearest road centerline. */
  private distToRoad(x: number, z: number): number {
    let best = Infinity;
    for (const [x0, z0, x1, z1, w] of Town.ROADS) {
      const dx = x1 - x0, dz = z1 - z0;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2));
      const px = x0 + dx * t, pz = z0 + dz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz) - w / 2);
    }
    return best;
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

    // roads: packed dirt from the plaza to every destination — edged, worn, pebbled
    const road = (x0: number, z0: number, x1: number, z1: number, w: number) => {
      // dark edging first, then the packed body, then the worn center
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6e5638';
      ctx.lineWidth = (w + 0.5) / w2p;
      ctx.beginPath(); ctx.moveTo(px(x0), pz(z0)); ctx.lineTo(px(x1), pz(z1)); ctx.stroke();
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineWidth = w / w2p;
      ctx.beginPath(); ctx.moveTo(px(x0), pz(z0)); ctx.lineTo(px(x1), pz(z1)); ctx.stroke();
      ctx.strokeStyle = '#9a7d58';
      ctx.lineWidth = (w * 0.45) / w2p;
      ctx.beginPath(); ctx.moveTo(px(x0), pz(z0)); ctx.lineTo(px(x1), pz(z1)); ctx.stroke();
      // wheel ruts of a thousand Crawler trips
      ctx.strokeStyle = 'rgba(90,70,45,0.4)';
      ctx.lineWidth = 2;
      const nx = -(z1 - z0), nz = (x1 - x0);
      const nl = Math.hypot(nx, nz) || 1;
      for (const off of [-w * 0.22, w * 0.22]) {
        ctx.beginPath();
        ctx.moveTo(px(x0 + (nx / nl) * off), pz(z0 + (nz / nl) * off));
        ctx.lineTo(px(x1 + (nx / nl) * off), pz(z1 + (nz / nl) * off));
        ctx.stroke();
      }
    };
    for (const [x0, z0, x1, z1, w] of Town.ROADS) road(x0, z0, x1, z1, w);

    // pebbles along the roads
    ctx.fillStyle = '#aa9070';
    for (let i = 0; i < 420; i++) {
      const rte = Town.ROADS[Math.floor(Math.random() * Town.ROADS.length)];
      const t = Math.random();
      const x = rte[0] + (rte[2] - rte[0]) * t + (Math.random() - 0.5) * (rte[4] + 0.8);
      const z = rte[1] + (rte[3] - rte[1]) * t + (Math.random() - 0.5) * (rte[4] + 0.8);
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(px(x), pz(z), 1 + Math.random() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the pond — painted shore so the basin reads as water-carved earth
    {
      const cx = px(-26), cy = pz(30), r = 5.6 / w2p;
      const shore = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
      shore.addColorStop(0, '#3a6a8a'); shore.addColorStop(0.62, '#4a7a92'); shore.addColorStop(0.8, '#c2b08a'); shore.addColorStop(1, 'rgba(110,90,60,0)');
      ctx.fillStyle = shore;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }

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

  /** Plant one wrought-iron street lamp, grounded on the terrain, arm aimed at the road. */
  private addStreetLamp(x: number, z: number, faceX: number, faceZ: number, style: 'road' | 'plaza' = 'road'): void {
    const lamp = makeStreetLamp(style);
    lamp.position.set(x, this.groundH(x, z), z);
    lamp.rotation.y = Math.atan2(faceX - x, faceZ - z); // arm (+Z) reaches over the road
    this.streetScene.add(lamp);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.34 });
  }

  /**
   * March lamps down every road at a steady interval, alternating sides —
   * the lamplighters of Haven City take their craft seriously.
   */
  private placeRoadLamps(): void {
    const SPACING = 11;
    const tooClose: { x: number; z: number }[] = [];
    for (const [x0, z0, x1, z1, w] of Town.ROADS) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 7) continue;
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      const nx = -dz, nz = dx; // road normal
      const count = Math.floor(len / SPACING);
      for (let i = 1; i <= count; i++) {
        const t = (i * SPACING) / len;
        const side = i % 2 === 0 ? 1 : -1;
        const off = w / 2 + 1.1;
        const lx = x0 + (x1 - x0) * t + nx * off * side;
        const lz = z0 + (z1 - z0) * t + nz * off * side;
        if (Math.hypot(lx, lz) < 8.6) continue;                    // plaza has its own grand lamps
        if (Math.hypot(lx, lz) > Town.WALL_R - 2) continue;
        if (tooClose.some(p => Math.hypot(p.x - lx, p.z - lz) < 5)) continue;
        if (this.streetColliders.some(c => Math.hypot(lx - c.pos.x, lz - c.pos.z) < c.r + 0.8)) continue;
        tooClose.push({ x: lx, z: lz });
        // aim the arm back over the road centerline
        this.addStreetLamp(lx, lz, lx - nx * off * side, lz - nz * off * side);
      }
    }
  }

  // ================= street furniture & wildlife =================
  /** A slatted park bench, grounded on the terrain. */
  private addBench(x: number, z: number, rotY: number): void {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#7a5630'), roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.5, roughness: 0.6 });
    for (const sy of [0.42, 0.5]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.16), wood);
      slat.position.set(0, sy - 0.06, (sy - 0.42) * 4 - 0.1);
      g.add(slat);
    }
    for (const by of [0.62, 0.74]) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.04), wood);
      back.position.set(0, by, -0.3);
      g.add(back);
    }
    for (const side of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), iron);
      leg.position.set(side, 0.2, -0.05);
      const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.05), iron);
      backPost.position.set(side, 0.55, -0.3);
      backPost.rotation.x = -0.15;
      g.add(leg, backPost);
    }
    g.position.set(x, this.groundH(x, z), z);
    g.rotation.y = rotY;
    g.traverse(o => { o.castShadow = true; });
    this.streetScene.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.8 });
  }

  /** A striped market stall heaped with goods, facing the plaza. */
  private addMarketStall(x: number, z: number, stripes: [number, number], goods: 'fruit' | 'fish'): void {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.9 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), wood);
    counter.position.y = 0.45;
    g.add(counter);
    for (const side of [-1.05, 1.05]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 6), wood);
      pole.position.set(side, 1.1, 0.4);
      g.add(pole);
    }
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 1.5),
        new THREE.MeshStandardMaterial({ color: stripes[i % 2], roughness: 0.9 }));
      strip.position.set(-1.04 + i * 0.52, 2.24, 0.3);
      strip.rotation.x = 0.22;
      g.add(strip);
    }
    // heaped goods
    if (goods === 'fruit') {
      for (let i = 0; i < 8; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
          new THREE.MeshStandardMaterial({ color: [0xd84a3a, 0xf2a23a, 0xc4d23a][i % 3], roughness: 0.55 }));
        fruit.position.set(-0.8 + (i % 4) * 0.5, 0.98, 0.2 - Math.floor(i / 4) * 0.4);
        g.add(fruit);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x9ab4c8, roughness: 0.3, metalness: 0.4 }));
        fish.scale.set(2.0, 0.6, 0.7);
        fish.position.set(-0.6 + (i % 2) * 0.9, 0.96, 0.25 - Math.floor(i / 2) * 0.45);
        fish.rotation.y = (i % 2 ? 1 : -1) * 0.3;
        g.add(fish);
      }
      const ice = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.95),
        new THREE.MeshStandardMaterial({ color: 0xd8ecf8, roughness: 0.2, transparent: true, opacity: 0.85 }));
      ice.position.y = 0.92;
      g.add(ice);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.34, 9), wood);
    basket.position.set(1.4, 0.17, 0.4);
    g.add(basket);
    g.position.set(x, this.groundH(x, z), z);
    g.rotation.y = Math.atan2(-x, -z);
    g.traverse(o => { o.castShadow = true; });
    this.streetScene.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.5 });
  }

  /** The pond — still water in its terrain basin, lilies, reeds, ducks, a little pier. */
  private buildPond(cx: number, cz: number): void {
    const s = this.streetScene;
    const waterY = this.groundH(cx, cz) + 0.34;
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.0, 28),
      new THREE.MeshStandardMaterial({
        color: 0x3a8ad9, emissive: 0x1a4d88, emissiveIntensity: 0.35,
        roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88,
      }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, waterY, cz);
    water.name = 'pondwater';
    s.add(water);
    this.streetColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 4.7 });
    this.streetMarkers.push({ x: cx, z: cz, label: 'Pond', color: '#3a8ad9', kind: 'poi' });

    // lily pads
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.22 + Math.random() * 0.16, 9),
        new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx + Math.cos(a) * r, waterY + 0.015, cz + Math.sin(a) * r);
      s.add(pad);
      if (i % 2 === 0) {
        const lily = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 6),
          new THREE.MeshStandardMaterial({ color: 0xf2c8d8, emissive: 0x6a2a4a, emissiveIntensity: 0.2 }));
        lily.position.set(pad.position.x, waterY + 0.07, pad.position.z);
        s.add(lily);
      }
    }
    // reeds around the shore
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x5a7a36, roughness: 0.9 });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4.9 + Math.random() * 1.2;
      const rx = cx + Math.cos(a) * r, rz = cz + Math.sin(a) * r;
      const h = 0.5 + Math.random() * 0.55;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, h, 4), reedMat);
      reed.position.set(rx, this.groundH(rx, rz) + h / 2, rz);
      reed.rotation.z = (Math.random() - 0.5) * 0.2;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 5),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95 }));
      tip.position.set(rx, this.groundH(rx, rz) + h + 0.06, rz);
      s.add(reed, tip);
    }
    // a tiny fishing pier
    {
      const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#6a5236'), roughness: 0.9 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 2.6), wood);
      const px = cx + 4.4, pz = cz - 1.4;
      deck.position.set(px, waterY + 0.18, pz);
      deck.rotation.y = Math.atan2(cx - px, cz - pz);
      s.add(deck);
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), wood);
        const offX = (i % 2 ? 0.45 : -0.45), offZ = (i < 2 ? 0.9 : -0.9);
        post.position.set(px + offX, waterY, pz + offZ);
        s.add(post);
      }
    }
    // ducks!
    for (let i = 0; i < 3; i++) {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0x4a6a3a : 0xe8e0d0, roughness: 0.8 }));
      body.scale.set(1.4, 0.85, 1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0x2a5a4a : 0xd8c8a8, roughness: 0.8 }));
      head.position.set(0.2, 0.18, 0);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8a23a, roughness: 0.6 }));
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.32, 0.16, 0);
      duck.add(body, head, beak);
      duck.position.set(cx, waterY + 0.08, cz);
      duck.traverse(o => { o.castShadow = true; });
      s.add(duck);
      this.ducks.push({
        grp: duck, angle: Math.random() * Math.PI * 2, r: 1.2 + i * 0.9,
        center: new THREE.Vector3(cx, waterY + 0.08, cz), speed: 0.25 + Math.random() * 0.3,
      });
    }
  }

  /** The old grain windmill on its hill — sails forever turning. */
  private buildWindmill(x: number, z: number): void {
    const s = this.streetScene;
    const baseY = this.groundH(x, z);
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 5.2, 12),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#9a8e7a', '#6a5e4a', 3), roughness: 0.9 }));
    tower.position.y = 2.6;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8 }));
    roof.position.y = 6.0;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.12),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22'), roughness: 0.9 }));
    door.position.set(0, 0.65, 2.05);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xc9a24a, emissiveIntensity: 0.5 }));
    win.position.set(0, 3.4, 1.78);
    win.rotation.x = -0.08;
    g.add(tower, roof, door, win);
    // the hub and four cloth sails
    const hub = new THREE.Group();
    hub.position.set(0, 5.0, 1.95);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.8 }));
    axle.rotation.x = Math.PI / 2;
    hub.add(axle);
    for (let i = 0; i < 4; i++) {
      const sailArm = new THREE.Group();
      sailArm.rotation.z = (i / 4) * Math.PI * 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 0.08),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.9 }));
      spar.position.y = 1.5;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.3),
        new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.95, side: THREE.DoubleSide }));
      cloth.position.set(0.5, 1.6, 0.0);
      sailArm.add(spar, cloth);
      hub.add(sailArm);
    }
    g.add(hub);
    this.windmillHub = hub;
    g.position.set(x, baseY, z);
    g.rotation.y = Math.atan2(-x, -z); // door faces town
    g.traverse(o => { o.castShadow = true; });
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 2.4 });
    this.streetMarkers.push({ x, z, label: 'Windmill', color: '#c2b08a', kind: 'poi' });
    this.label3d(s, '🌾 Old Windmill', '#e8d9a8', new THREE.Vector3(x, baseY + 7.6, z), 3.8);
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z).add(new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y)).multiplyScalar(2.6)),
      radius: 2.0,
      label: 'Press <b>E</b> — listen to the windmill',
      handler: async () => {
        await say('', 'The sails creak in their endless circles. Inside, the millstones grind the valley\'s grain — the same rhythm Haven City has fallen asleep to for fifteen years.');
      },
    });
  }

  /** A butterfly: two flapping wings on a wandering lissajous path. */
  private addButterfly(x: number, z: number, color: number): void {
    const grp = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.7 });
    const mkWing = (side: 1 | -1) => {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.17), wingMat);
      wing.position.x = side * 0.07;
      pivot.add(wing);
      grp.add(pivot);
      return pivot;
    };
    const wingL = mkWing(1), wingR = mkWing(-1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.14, 4),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    const anchor = new THREE.Vector3(x, this.groundH(x, z) + 0.9, z);
    grp.position.copy(anchor);
    this.streetScene.add(grp);
    this.butterflies.push({ grp, anchor, phase: Math.random() * Math.PI * 2, wingL, wingR });
  }

  /** A firefly: invisible by day, a slow drifting ember after dark. */
  private addFirefly(x: number, z: number): void {
    const matF = new THREE.MeshStandardMaterial({
      color: 0xffe48a, emissive: 0xffd24a, emissiveIntensity: 0, transparent: true, opacity: 0,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), matF);
    const anchor = new THREE.Vector3(x, this.groundH(x, z) + 0.8 + Math.random() * 0.8, z);
    mesh.position.copy(anchor);
    this.streetScene.add(mesh);
    this.fireflies.push({ mesh, anchor, phase: Math.random() * Math.PI * 2 });
  }

  /** A leaf forever falling from its tree, caught in the wind. */
  private addFallingLeaf(x: number, z: number): void {
    const cols = [0xc4822a, 0x8a9a3a, 0xa85a2a, 0x5a8a3a];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.14),
      new THREE.MeshStandardMaterial({
        color: cols[Math.floor(Math.random() * cols.length)],
        side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 0.95,
      }));
    const anchor = new THREE.Vector3(x + (Math.random() - 0.5) * 2, this.groundH(x, z), z + (Math.random() - 0.5) * 2);
    this.streetScene.add(mesh);
    this.fallingLeaves.push({ mesh, anchor, phase: Math.random() * 9, h: 2.6 + Math.random() * 1.4 });
  }

  /** Two town guardian pets that stroll the lanes and accept pets. */
  private spawnPets(): void {
    const defs: { species: string; name: string; line: string }[] = [
      { species: 'fernfox', name: 'Moss the fernfox', line: 'Moss the fernfox rolls over and presents a leafy belly. The fur smells of rain and cut grass.' },
      { species: 'cindcub', name: 'Ember the cindcub', line: 'Ember the cindcub headbutts your shin, warm as a hearthstone. Somewhere, Tilda yells that he is NOT to be fed again.' },
    ];
    for (const d of defs) {
      const rig = makeGuardian(d.species);
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 8;
      rig.group.position.set(Math.cos(a) * r, 0, Math.abs(Math.sin(a) * r));
      this.streetScene.add(rig.group);
      this.pets.push({ rig, target: rig.group.position.clone(), pause: 1 + Math.random() * 3, name: d.name, line: d.line });
    }
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

  /**
   * The Grand Coliseum — rebuilt at TWICE its old size after Greggy's ninth
   * championship. Three tiers of stone, a crown of light, and the three
   * Legendary Tamers in gold along the processional approach.
   */
  private buildColiseumExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({
      map: stoneTexture('#9a93a8', '#5a5468', 6), roughness: 0.85, side: THREE.DoubleSide,
    });
    const ridge = new THREE.MeshStandardMaterial({ map: stoneTexture('#aaa3b8', '#6a6478', 2), roughness: 0.8 });
    // three open tiers — doubled in every dimension
    const tiers: [number, number, number, number][] = [
      [14.4, 15.6, 6.4, 3.2], [12.4, 13.4, 5.4, 9.2], [10.4, 11.2, 4.6, 14.2],
    ];
    for (const [rt, rb, h, y] of tiers) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 36, 1, true), stone);
      tier.position.y = y;
      tier.castShadow = tier.receiveShadow = true;
      g.add(tier);
      // arched window band
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const arc = new THREE.Mesh(new THREE.BoxGeometry(1.0, h * 0.52, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x14182a, roughness: 0.9 }));
        arc.position.set(Math.cos(a) * (rt + rb) / 2, y, Math.sin(a) * (rt + rb) / 2);
        arc.rotation.y = -a + Math.PI / 2;
        g.add(arc);
        // a warm window glow on the middle band
        if (y > 6 && y < 12 && i % 2 === 0) {
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, h * 0.3),
            new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xc9a24a, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
          glow.position.set(Math.cos(a) * ((rt + rb) / 2 + 0.12), y, Math.sin(a) * ((rt + rb) / 2 + 0.12));
          glow.rotation.y = -a + Math.PI / 2;
          g.add(glow);
        }
      }
      // cornice ring between tiers
      const cornice = new THREE.Mesh(new THREE.TorusGeometry((rt + rb) / 2, 0.22, 8, 44), ridge);
      cornice.rotation.x = Math.PI / 2;
      cornice.position.y = y + h / 2;
      g.add(cornice);
    }
    // crown of light above the arena mouth
    const crown = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.26, 8, 52),
      new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.3 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 17.0;
    crown.name = 'neon';
    const crownGlow = new THREE.PointLight(0x5ab8e8, 26, 30);
    crownGlow.position.y = 17.4;
    g.add(crown, crownGlow);
    // champion spire flags around the crown — one per championship era
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x2e2a36 }));
      pole.position.set(Math.cos(a) * 10.4, 18.4, Math.sin(a) * 10.4);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6),
        new THREE.MeshStandardMaterial({ color: [0xf2603a, 0xf2d23a, 0x4ec45e][i % 3], roughness: 0.85, side: THREE.DoubleSide }));
      flag.position.set(Math.cos(a) * 10.4 + 0.55, 19.3, Math.sin(a) * 10.4);
      flag.name = 'banner';
      g.add(pole, flag);
    }
    // grand banners of the three Legendary Tamers over the entrance
    LEGENDS.forEach((leg, i) => {
      const col = parseInt(leg.color.slice(1), 16);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 5.2),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.85, side: THREE.DoubleSide }));
      banner.position.set((i - 1) * 3.4, 10.0, 14.2);
      banner.name = 'banner';
      g.add(banner);
    });
    // grand entrance arch
    for (const side of [-3.8, 3.8]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 8.4, 1.7), stone);
      pillar.position.set(side, 4.2, 14.8);
      pillar.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 2.1), ridge);
      cap.position.set(side, 8.6, 14.8);
      g.add(pillar, cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.8, 1.8, 2.2), stone);
    lintel.position.set(0, 9.4, 14.8);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 6.6),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    doorway.position.set(0, 3.4, 14.85);
    doorway.name = 'portal';
    g.add(lintel, doorway);
    // entrance braziers
    for (const side of [-5.6, 5.6]) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.6, 10),
        new THREE.MeshStandardMaterial({ color: 0x2e2a36, roughness: 0.8 }));
      bowl.position.set(side, 1.6, 15.6);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2e2a36 }));
      stem.position.set(side, 0.7, 15.6);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 8),
        new THREE.MeshStandardMaterial({ color: 0xffa03a, emissive: 0xff6a1a, emissiveIntensity: 1.4 }));
      flame.position.set(side, 2.3, 15.6);
      flame.name = 'flame';
      const fl = new THREE.PointLight(0xff7a2a, 12, 9);
      fl.position.set(side, 2.6, 15.6);
      g.add(bowl, stem, flame, fl);
    }

    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 16.2 });
    this.label3d(s, '🏟️ Grand Coliseum', '#5ab8e8', new THREE.Vector3(x, 21.4, z), 8.0);
    this.streetMarkers.push({ x, z, label: '🏟️ Coliseum', color: '#5ab8e8', kind: 'building' });
    const door = new THREE.Vector3(0, 0, 18.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetMarkers.push({ x: door.x, z: door.z, color: '#e8d9a8', kind: 'door' });
    this.streetInteractables.push({
      pos: door, radius: 3.0,
      label: 'Press <b>E</b> — enter the Grand Coliseum',
      handler: () => this.enterService('coliseum'),
    });

    // (the three Legends' statues stand in their own memorial park,
    //  Legends' Rest, in the city's north-west corner — see buildLegendsPark)
  }

  /**
   * Legends' Rest — a quiet memorial mini-park in the north-west corner.
   * The three heroes in gold on a petal-strewn stone circle, ringed by
   * blossom trees, flowerbeds, benches and lamplight.
   */
  private buildLegendsPark(cx: number, cz: number): void {
    const s = this.streetScene;
    const cy = this.groundH(cx, cz);

    // the stone circle, inlaid with a gold ring
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.35, 28),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#55506a', 4), roughness: 0.85 }));
    plaza.position.set(cx, cy + 0.05, cz);
    plaza.receiveShadow = true;
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.07, 8, 44),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0x8a6a1a, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.35 }));
    inlay.rotation.x = Math.PI / 2;
    inlay.position.set(cx, cy + 0.24, cz);
    s.add(plaza, inlay);

    // the three in gold — Aljay center-back, Greggy west, Onnel east —
    // gazing south-east over the city they saved
    const spots: [number, number][] = [[0, -4.6], [-4.4, -2.0], [4.4, -2.0]];
    LEGENDS.forEach((leg, i) => {
      const px = cx + spots[i][0], pz = cz + spots[i][1];
      const py = this.groundH(px, pz);
      const yaw = Math.atan2(cx - px, cz + 2.5 - pz);        // face the circle's heart
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 10),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#55506a', 1), roughness: 0.85 }));
      pedestal.position.set(px, py + 0.6, pz);
      const statue = makeVoxelHuman({
        skin: 0xd8c27a, hair: 0xc9a24a, top: 0xb89a3a, bottom: 0xa8883a, shoes: 0x8a6a2a, cap: null, robe: true,
        hairstyle: i === 0 ? 'spiky' : i === 1 ? 'classic' : 'long',
      });
      statue.position.set(px, py + 1.2, pz);
      statue.rotation.y = yaw;
      statue.scale.setScalar(1.35);
      const col = parseInt(leg.color.slice(1), 16);
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.08),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 }));
      plaque.position.set(px + Math.sin(yaw) * 1.15, py + 0.8, pz + Math.cos(yaw) * 1.15);
      plaque.rotation.y = yaw;
      const glow = new THREE.PointLight(col, 6, 8);
      glow.position.set(px, py + 2.6, pz);
      s.add(pedestal, statue, plaque, glow);
      this.label3d(s, `${leg.name} ${leg.title}`, leg.color, new THREE.Vector3(px, py + 3.6, pz), 3.4);
      this.streetColliders.push({ pos: new THREE.Vector3(px, 0, pz), r: 1.3 });
      this.streetInteractables.push({
        pos: new THREE.Vector3(px, 0, pz), radius: 2.2,
        label: `Press <b>E</b> — read ${leg.name}'s plaque`,
        handler: async () => {
          await say(`${leg.name} ${leg.title} — ${leg.championships}× World Champion`, leg.story);
          await say('Plaque', `Bonded Guardians: ${leg.guardians.map(gd => `${gd.name} (${gd.elements.join('·')})`).join(', ')}. Immortalized in the Hall of Legends at the Grand Coliseum.`);
        },
      });
    });

    // flowerbeds in the heroes' colors dot the circle's rim
    const FLOWER_COLS = [0xf2603a, 0xf2d23a, 0x4ec45e, 0xe85a8a, 0xf2ead0];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.45;
      const fx = cx + Math.cos(a) * 6.4, fz = cz + Math.sin(a) * 6.4;
      const fy = this.groundH(fx, fz);
      const bed = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.12, 6, 14),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7288', '#4a4458', 1), roughness: 0.9 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.12;
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1 }));
      soil.position.y = 0.1;
      bed.add(rim, soil);
      for (let f = 0; f < 7; f++) {
        const fa = Math.random() * Math.PI * 2, fr = Math.random() * 0.55;
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5),
          new THREE.MeshStandardMaterial({ color: FLOWER_COLS[(i + f) % FLOWER_COLS.length], roughness: 0.6 }));
        bloom.position.set(Math.cos(fa) * fr, 0.26, Math.sin(fa) * fr);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 4),
          new THREE.MeshStandardMaterial({ color: 0x3a7a3a }));
        stem.position.set(bloom.position.x, 0.18, bloom.position.z);
        bed.add(bloom, stem);
      }
      bed.position.set(fx, fy, fz);
      s.add(bed);
      this.streetColliders.push({ pos: new THREE.Vector3(fx, 0, fz), r: 0.9 });
    }

    // benches face the heroes from the path side
    this.addBench(cx - 2.6, cz + 5.6, Math.atan2(2.6, -7.6));
    this.addBench(cx + 2.6, cz + 5.6, Math.atan2(-2.6, -7.6));
    // twin plaza lamps for the evening pilgrims
    this.addStreetLamp(cx - 6.8, cz + 3.4, cx, cz, 'plaza');
    this.addStreetLamp(cx + 6.8, cz + 3.4, cx, cz, 'plaza');
    // a blossom bower behind the heroes
    for (const [tx, tz] of [[cx - 5.5, cz - 6.5], [cx, cz - 8.2], [cx + 5.5, cz - 6.5]]) {
      const tree = makeTree('blossom');
      tree.position.set(tx, this.groundH(tx, tz), tz);
      s.add(tree);
      this.streetColliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 0.8 });
    }

    this.label3d(s, '🌸 Legends\' Rest', '#e8a8c8', new THREE.Vector3(cx, cy + 6.4, cz), 5.0);
    this.streetMarkers.push({ x: cx, z: cz, label: '🌸 Legends\' Rest', color: '#e8a8c8', kind: 'poi' });
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
    s.fog = new THREE.Fog(0xd8d0c0, 42, 175);
    this.camera.far = 220;
    this.camera.updateProjectionMatrix();
    this.ambient = new THREE.AmbientLight(0xfff4e0, 0.75);
    s.add(this.ambient);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
    this.sun = sun;
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -54;
    sun.shadow.camera.right = sun.shadow.camera.top = 54;
    s.add(sun);

    // ---- ground: a true heightfield, displaced by groundH ----
    // Painted grass, dirt roads and pond — then every vertex is lifted onto
    // the same terrain function the player and NPCs walk on.
    const R = Town.CITY_R;
    const groundGeo = new THREE.PlaneGeometry(R * 2, R * 2, 112, 112);
    groundGeo.rotateX(-Math.PI / 2);
    {
      const pos = groundGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.groundH(pos.getX(i), pos.getZ(i)));
      }
      groundGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(groundGeo,
      new THREE.MeshStandardMaterial({ map: this.cityGroundTexture(R), roughness: 1 }));
    ground.receiveShadow = true;
    s.add(ground);

    // ---- the world beyond the walls (no more floating town) ----
    const apron = new THREE.Mesh(new THREE.RingGeometry(R - 1, 150, 48),
      new THREE.MeshStandardMaterial({ color: 0x3c5a2c, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.06;
    s.add(apron);
    // rolling hills outside, with wild pines on their shoulders
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const rr = 68 + Math.random() * 32;
      const hr = 8 + Math.random() * 10;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hr, 12, 9),
        new THREE.MeshStandardMaterial({ color: i % 3 ? 0x426632 : 0x4d7038, roughness: 1 }));
      hill.position.set(Math.cos(a) * rr, -hr * 0.55, Math.sin(a) * rr);
      hill.scale.y = 0.55;
      s.add(hill);
      if (i % 2 === 0) {
        const pine = makeTree('pine');
        pine.scale.setScalar(1.6 + Math.random());
        pine.position.set(Math.cos(a) * (rr - hr * 0.6), 0.4, Math.sin(a) * (rr - hr * 0.6));
        s.add(pine);
      }
    }
    // distant mountains
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(18 + Math.random() * 11, 26 + Math.random() * 16, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 1, flatShading: true }));
      mt.position.set(Math.cos(a) * 128, 4, Math.sin(a) * 128);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(6 + Math.random() * 3, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8eef8, roughness: 0.9, flatShading: true }));
      cap.position.set(mt.position.x, mt.position.y + 13 + Math.random() * 6, mt.position.z);
      s.add(mt, cap);
    }
    // drifting clouds
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const cMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, transparent: true, opacity: 0.78, roughness: 1 });
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let pi = 0; pi < puffs; pi++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.4 + Math.random() * 2.2, 8, 6), cMat);
        puff.position.set(pi * 2.6 - puffs * 1.2, Math.random() * 1.0, (Math.random() - 0.5) * 2.4);
        puff.scale.y = 0.5;
        cloud.add(puff);
      }
      const ca = (i / 7) * Math.PI * 2;
      const cr = 34 + Math.random() * 56;
      cloud.position.set(Math.cos(ca) * cr, 30 + Math.random() * 12, Math.sin(ca) * cr);
      s.add(cloud);
      this.clouds.push(cloud);
    }

    // ---- city walls (ring of stone with battlements & towers) ----
    const WALL_R = Town.WALL_R;
    const segs = 44;
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7488', '#454052', 2), roughness: 0.9 });
    const ridgeMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8498', '#4a4458', 1), roughness: 0.9 });
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // leave the eastern gate opening
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.085) continue;
      const wx = Math.cos(a) * WALL_R, wz = Math.sin(a) * WALL_R;
      const baseY = this.groundH(wx, wz);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(7.7, 4.6, 1.4), wallMat);
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
      // banner poles flanking the gate road
      for (const side of [-2.6, 2.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6),
          new THREE.MeshStandardMaterial({ color: 0x2e2a36, roughness: 0.8 }));
        const py = this.groundH(WALL_R - 7, side);
        pole.position.set(WALL_R - 7, py + 2.1, side);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.8),
          new THREE.MeshStandardMaterial({ color: 0x5a7bd8, roughness: 0.9, side: THREE.DoubleSide }));
        cloth.position.set(WALL_R - 7, py + 3.1, side + 0.02);
        cloth.name = 'banner';
        s.add(pole, cloth);
      }
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

    // ---- plaza: grand fountain, benches, market stalls, twin-headed lamps ----
    {
      const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.7, 18),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#8a93b8', '#5a6280', 2), roughness: 0.6 }));
      fountain.position.y = 0.35;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 18),
        new THREE.MeshStandardMaterial({ color: 0x3a9df2, emissive: 0x1a4d88, emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.9 }));
      water.position.y = 0.72;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.0, 10),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#9aa3c8', '#6a7290', 1), roughness: 0.5 }));
      column.position.y = 1.2;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.22, 14),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#9aa3c8', '#6a7290', 1), roughness: 0.5 }));
      bowl.position.y = 1.75;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 10),
        new THREE.MeshStandardMaterial({ color: 0x9ad4f2, emissive: 0x5ab8e8, emissiveIntensity: 0.5, transparent: true, opacity: 0.65 }));
      jet.position.y = 2.3;
      this.fountainJet = jet;
      s.add(fountain, water, column, bowl, jet);
      this.streetColliders.push({ pos: new THREE.Vector3(0, 0, 0), r: 1.9 });
      this.streetMarkers.push({ x: 0, z: 0, label: 'Plaza', color: '#b8ae8a', kind: 'poi' });

      // grand twin-headed lamps ring the plaza
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.addStreetLamp(Math.cos(a) * 8.6, Math.sin(a) * 8.6, 0, 0, 'plaza');
      }
      // benches facing the fountain
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.addBench(Math.cos(a) * 4.6, Math.sin(a) * 4.6, a + Math.PI / 2);
      }
      // market stalls on the plaza's south rim
      this.addMarketStall(6.4, -6.6, [0xd84a3a, 0xf2ead0], 'fruit');
      this.addMarketStall(-6.8, -5.8, [0x3a9df2, 0xf2ead0], 'fish');
    }

    // ---- unique merchant district ----
    this.buildShopExterior(-14, 7);
    this.buildGarageExterior(14, 7);
    this.buildSanctumExterior(0, 18);
    this.buildBoutiqueExterior(-14, -7);
    this.buildBountyKiosk(8, 6);

    // ---- the Grand Coliseum, north-east — twice the arena it used to be ----
    this.buildColiseumExterior(28, -17);

    // ---- Legends' Rest: the heroes' memorial park, north-west corner ----
    this.buildLegendsPark(-36, -28);

    // ---- the pond: water, lilies, reeds, ducks, a fishing pier ----
    this.buildPond(-26, 30);

    // ---- the windmill on its hill ----
    this.buildWindmill(32, 28);

    // ---- street lamps: marching down every road, alternating sides ----
    // (placed after the buildings so the lamplighters route around them)
    this.placeRoadLamps();

    // ---- real trees: oaks, pines, birches and one blossom grove ----
    const TREES: [number, number, TreeKind][] = [
      [-22, 12, 'oak'], [-30, 20, 'oak'], [-33, 8, 'pine'], [-38, 22, 'pine'], [-42, 12, 'pine'],
      [22, 12, 'oak'], [27, 7, 'birch'], [38, 8, 'pine'], [44, 18, 'pine'],
      [18, 24, 'oak'], [25, 33, 'birch'], [38, 30, 'pine'], [28, 41, 'pine'],
      [-8, 32, 'birch'], [8, 32, 'oak'], [-2, 40, 'oak'], [10, 44, 'pine'], [-20, 44, 'pine'],
      [-19, -10, 'oak'], [-24, -16, 'oak'], [-33, -14, 'pine'], [-42, -4, 'pine'],
      [12, -24, 'birch'], [-12, -17, 'oak'], [44, -8, 'pine'],
      // blossom grove by the pond
      [-31, 35, 'blossom'], [-20, 36, 'blossom'], [-32, 26, 'blossom'],
    ];
    const treeSpots: [number, number][] = [];
    for (const [bx, bz, kind] of TREES) {
      const tx = bx + (Math.random() - 0.5) * 2, tz = bz + (Math.random() - 0.5) * 2;
      if (this.distToRoad(tx, tz) < 1.4) continue;
      const tree = makeTree(kind);
      const sc = 1.1 + Math.random() * 0.7;
      tree.scale.setScalar(sc);
      tree.position.set(tx, this.groundH(tx, tz), tz);
      s.add(tree);
      this.streetColliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 0.55 * sc });
      treeSpots.push([tx, tz]);
    }

    // ---- rocks, with terrain-aware footing ----
    for (const [rx, rz] of [[-32, 14], [30, 18], [-22, 25], [40, 4], [16, 38], [-38, -12]] as const) {
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        const ox = rx + (Math.random() - 0.5) * 2.6, oz = rz + (Math.random() - 0.5) * 2.6;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.55),
          new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8498', '#5a5468', 1), roughness: 0.95, flatShading: true }));
        rock.position.set(ox, this.groundH(ox, oz) + 0.22, oz);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        s.add(rock);
      }
      this.streetColliders.push({ pos: new THREE.Vector3(rx, 0, rz), r: 1.4 });
    }

    // ---- flower beds with real stems, lining the roads ----
    const flowerCols = [0xe85a8a, 0xf2d23a, 0xb18ae8, 0xf2f2f2, 0xff8a5a];
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a7a32, roughness: 0.9 });
    const flowerBeds: [number, number][] = [
      [-5, 6], [5, 7], [-3, -10], [4, -12], [-10, 11], [10, 12], [2, 22], [-18, 4], [18, 4],
      [-2, -22.5], [3, -25], [-16, 22], [-21, 27], [12, -14], [16, -4], [36, 3], [-28, 4],
    ];
    for (const [fx, fz] of flowerBeds) {
      for (let i = 0; i < 7; i++) {
        const ox = fx + (Math.random() - 0.5) * 1.8, oz = fz + (Math.random() - 0.5) * 1.8;
        const fy = this.groundH(ox, oz);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.26, 4), stemMat);
        stem.position.set(ox, fy + 0.13, oz);
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 6, 5),
          new THREE.MeshStandardMaterial({
            color: flowerCols[Math.floor(Math.random() * flowerCols.length)],
            emissive: 0x222222, roughness: 0.8,
          }));
        bloom.position.set(ox, fy + 0.3, oz);
        s.add(stem, bloom);
      }
    }

    // ---- hedgerows along the grand north road ----
    const hedgeMat = new THREE.MeshStandardMaterial({ map: leafTexture('#33682c', '#4a8a3e', '#224a1c', 9), roughness: 0.95 });
    for (const side of [-2.9, 2.9]) {
      for (let z = -6; z >= -17; z -= 1.45) {
        const hedge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.3), hedgeMat);
        hedge.position.set(side, this.groundH(side, z) + 0.35, z);
        hedge.castShadow = true;
        s.add(hedge);
      }
      this.streetColliders.push({ pos: new THREE.Vector3(side, 0, -8), r: 0.7 });
      this.streetColliders.push({ pos: new THREE.Vector3(side, 0, -11.5), r: 0.7 });
      this.streetColliders.push({ pos: new THREE.Vector3(side, 0, -15), r: 0.7 });
    }

    // ---- a living meadow: instanced grass tufts everywhere off-road ----
    {
      const COUNT = 850;
      const blade = new THREE.ConeGeometry(0.085, 0.34, 4);
      blade.translate(0, 0.17, 0);
      const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
      const inst = new THREE.InstancedMesh(blade, grassMat, COUNT);
      const dummy = new THREE.Object3D();
      const shades = [new THREE.Color('#4f7a38'), new THREE.Color('#5d8a42'), new THREE.Color('#436a30'), new THREE.Color('#6a9a4c')];
      let placed = 0, guard = 0;
      while (placed < COUNT && guard++ < COUNT * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * (Town.WALL_R - 9);
        const gx = Math.cos(a) * r, gz = Math.sin(a) * r;
        if (this.distToRoad(gx, gz) < 0.7) continue;
        if (gz < -18 && Math.abs(gx) < 28) continue; // keep the terrace formal
        if (Math.hypot(gx + 26, gz - 30) < 5.6) continue; // not in the pond
        if (this.streetColliders.some(c => Math.hypot(gx - c.pos.x, gz - c.pos.z) < c.r)) continue;
        dummy.position.set(gx, this.groundH(gx, gz), gz);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.7 + Math.random() * 0.9);
        dummy.updateMatrix();
        inst.setMatrixAt(placed, dummy.matrix);
        inst.setColorAt(placed, shades[Math.floor(Math.random() * shades.length)]);
        placed++;
      }
      inst.count = placed;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      s.add(inst);
    }

    // ---- butterflies by day, fireflies by night, leaves on the wind ----
    for (let i = 0; i < 9; i++) {
      const bed = flowerBeds[Math.floor(Math.random() * flowerBeds.length)];
      this.addButterfly(bed[0], bed[1], flowerCols[i % flowerCols.length]);
    }
    for (let i = 0; i < 16; i++) {
      const near = i < 8 ? [-26 + (Math.random() - 0.5) * 10, 30 + (Math.random() - 0.5) * 10]
        : treeSpots[Math.floor(Math.random() * treeSpots.length)];
      this.addFirefly(near[0] + (Math.random() - 0.5) * 3, near[1] + (Math.random() - 0.5) * 3);
    }
    for (let i = 0; i < 12; i++) {
      const spot = treeSpots[Math.floor(Math.random() * treeSpots.length)];
      this.addFallingLeaf(spot[0], spot[1]);
    }

    // ---- guardian pets strolling the lanes ----
    this.spawnPets();

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

    // ---- the Dawnflame's daughters, waiting by the fountain (Chronicle ch. VI+) ----
    this.placeDaughters();

    // spawn south of the plaza benches (a bench sits at (0, 4.6) r0.8 — never inside it)
    this.tamer.position.set(0, 0, 6.8);
    s.add(this.tamer);
  }

  // ================= Azrin & Azrael — the Dawnflame's daughters =================
  /** They appear by the fountain once Greggy has spoken their names (Chronicle ch. VI). */
  private placeDaughters(): void {
    const p = this.player;
    if (!p.flags['daughters_known']) return;
    const s = this.streetScene;

    const spots: [number, number][] = [[2.8, 3.6], [4.2, 2.2]];
    const sisters = DAUGHTERS.map((d, i) => {
      const [x, z] = spots[i];
      const g = makeVoxelHuman({
        skin: 0xe0a87a, hair: d.look.hair, top: d.look.top, bottom: d.look.bottom,
        shoes: 0x2a2430, cap: null, hairstyle: d.look.hairstyle,
      });
      g.position.set(x, this.groundH(x, z), z);
      g.rotation.y = Math.atan2(-x, 6.8 - z);   // watching the south approach
      s.add(g);
      this.staticNpcs.push(g);
      this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
      this.label3d(s, `${d.name} ${d.title}`, d.color, new THREE.Vector3(x, 2.7, z), 2.8);
      return g;
    });

    const meet = async () => {
      // both sisters turn to you
      sisters.forEach(g => {
        g.rotation.y = Math.atan2(this.tamer.position.x - g.position.x, this.tamer.position.z - g.position.z);
      });

      if (p.quests['story_daughters'] === 'active' && !p.flags['met_daughters']) {
        await conversation([
          ['Azrin', `There! Hah — I TOLD you that was the walk of someone uncle Greggy sent. You owe me a honey roll, Az.`],
          ['Azrael', `I owe you nothing; I said "probably". ${p.tamerName}, yes? Azrael. The loud one is my sister.`],
          ['Azrin', `Azrin! The DAWNFLAME'S daughter — the better-looking one of the three of us, dad included. So you're the graduate who scrubbed the Cradle clean. Respect. That nest-warden was a grown one and you went in with a STUDENT badge.`],
          ['Azrael', `We've been hunting the same corruption for two years — Veyra, Tharkand, one deeply unpleasant week under Noruun's ice. It moves like strategy, not rot. Father taught us what that means before he... went walking.`],
          ['Azrin', `He's FINE. He's always fine. He's Aljay. ...Anyway! Uncle Greggy's petrel says you're the quiet one the Legion never saw coming, so — welcome to the family business, graduate.`],
        ]);
        p.flags['met_daughters'] = true;
        const summary = completeQuest(p, 'story_daughters');
        toast('✅ Chapter VI complete: Daughters of the Dawnflame!', 'gold');
        if (summary) toast(`Received ${summary}`, 'gold');
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));
        await conversation([
          ['Azrael', `Now — here's what we know. The Stormspire's war-engine isn't counting down. It's ANSWERING. Call and response... and the call comes from inside Ghandra's seal.`],
          ['Azrin', `So we cut the conversation! You silence the engine — five floors, big angry Lv 26 landlord, you'll love it — and take its last word back to uncle Greggy on Agdao.`],
          ['Azrael', `We'll manage the continent's panicking in the meantime. It panics very efficiently when Azrin smiles at it. Good hunting, ${p.tamerName}.`],
        ]);
        updateHUD(p, 'Haven City');
        return;
      }
      if (p.quests['story_echoes'] === 'active') {
        if ((p.dungeonClears['stormspire'] ?? 0) >= 1) {
          await say('Azrael', 'The engine is silent — we felt it from here, like a tooth that finally stopped aching. Don\'t tell US the last word. Take it to Greggy. He needs to hear it standing on his own bluff.');
          return;
        }
        await conversation([
          ['Azrin', `Spire's east, graduate — big, rude, and full of voltage. We'd come along, but SOMEONE promised the Houses a briefing.`],
          ['Azrael', `I promised them a briefing because you volunteered me for it while pointing at the sky and shouting "she'll do it".`],
        ]);
        return;
      }
      if (p.flags['arc1_done']) {
        await conversation([
          ['Azrin', `Dad's name, in a war-engine's mouth. Every time I think about it I want to punch a continent.`],
          ['Azrael', `And every time I think about it, I check the lantern. Still unlit. Still his. When Greggy's letters land, ${p.tamerName} — we go to Ghandra together. All of us. Until then: train, rest, and eat something that isn't a tonic.`],
        ]);
        return;
      }
      await say('Azrin', 'Go on, graduate — legends don\'t keep themselves waiting. Well. Dad does. Bad example.');
    };

    for (const [i, g] of sisters.entries()) {
      this.streetInteractables.push({
        pos: g.position.clone().setY(0), radius: 2.0,
        label: `Press <b>E</b> — talk to ${DAUGHTERS[i].name}`,
        handler: meet,
      });
    }
    this.streetMarkers.push({ x: 3.4, z: 2.8, label: '🔥 Azrin & Azrael', color: '#f2884e', kind: 'npc' });
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
        palette: { top: 0x9a5af2, hair: 0x1a1a2e, cap: null, hairstyle: 'long' },
        lines: [
          'When the lamps come on at dusk, the city looks like a constellation that fell asleep.',
          'Aether. The tenth element. Nine beings carry it — three Guardians each for Aljay, Greggy and Onnel. Firgara, Onthrofa, Vulfenix… I can name all nine. Most children can.',
          'They say Noruun\'s auroras are Ghandra\'s reflection. I check them every night. Last month… they flickered.',
        ],
      },
      {
        name: 'Little Pip',
        palette: { top: 0xd84a3a, hair: 0x6a3a1a, cap: 0xf2d23a, hairstyle: 'spiky' },
        lines: [
          'I\'m Aljay and you\'re Nyxghul! Pew! Pew!! …fine, YOU can be Aljay. But I get the broom. The broom is Firgara.',
          'When I graduate I\'m getting a fire one, a lightning one AND a leaf one. Three each, just like the Legends!',
          'My gran says Aljay walked through our market once, hood up, bought an apple. Nobody believes her. I believe her.',
        ],
      },
      {
        name: 'Ferryn the Miller',
        palette: { top: 0xc2b08a, hair: 0x7a4a2a, cap: 0xe8e0cc, hairstyle: 'classic' },
        lines: [
          'Hear the windmill? Grinding since before the war. My mother ran it through the Legion years without missing a day.',
          'Flour for Tilda, feed for the stable Guardians, and a sack of the good stuff for the Coliseum concessions. Everyone eats from that hill.',
          'The hill\'s the best sunset seat in Haven City. Don\'t tell the stargazer — she\'ll claim it for science.',
        ],
      },
      {
        name: 'Reza the Angler',
        palette: { top: 0x4a7a9a, hair: 0xd8d8d8, cap: 0x2a4a5a, hairstyle: 'bald' },
        lines: [
          'The pond\'s stocked with silverfin. The ducks think the pier is theirs. We have an arrangement: they win.',
          'Caught a boot last week. The week before, a love letter in a bottle, forty years old. Delivered it myself. She cried. Good week.',
          'Onnel the Worldroot dug this pond with Gaiathorn after the war, they say — so the city would always have one quiet place.',
        ],
      },
      {
        name: 'Captain Iria',
        palette: { top: 0x8a3040, hair: 0x2a2a3a, cap: 0xc9a24a, hairstyle: 'ponytail' },
        lines: [
          'Coliseum guard, off duty. Even off duty I stand near the leaderboard. Habit. Someone tries to scratch their name onto it WEEKLY.',
          'Nine championships, Greggy holds. NINE. Serra Vayle\'s the best of the current circuit and she\'s at... well, zero. It\'s a high wall.',
          'The Hall of Legends gets more visitors than the Sanctum. The Keeper pretends not to mind. The Keeper minds.',
        ],
      },
      {
        name: 'Bram the Mason',
        palette: { top: 0x8a7a5a, hair: 0x3a2a1a, cap: null, hairstyle: 'curly' },
        lines: [
          'See those hills inside the walls? We built AROUND them. The old surveyor said flatten everything; the Worldroot\'s covenant said no. Covenant won.',
          'Re-cut every step of the grand stairs myself, eight summers past. Climb them slow — that stone came from Tharkand by sand-crawler.',
          'They doubled the Coliseum, you know. Twice the stone, twice the seats, ten times the noise on finals night.',
        ],
      },
      {
        name: 'Wisp-Keeper Yola',
        palette: { top: 0x6a4a9a, hair: 0xc9a24a, cap: null, hairstyle: 'buns' },
        lines: [
          'I tend the street lamps. Every one walks the roads with you — count them, they keep perfect spacing. Lamplighters take pride.',
          'At dusk the fireflies come up from the pond like the lamps\' little children. I refuse to hear any other explanation.',
          'Aljay\'s phoenix Vulfenix once swept down this very road at midnight, they say — pink fire hanging in the air till dawn. The lamps were jealous for a week. I believe the lamps.',
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

  /** Pick a fresh wander destination on the streets — hills welcome, water not. */
  private nextWanderTarget(from: THREE.Vector3): THREE.Vector3 {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z < -17) continue; // townsfolk keep off the Grand Houses' terrace
      if (Math.hypot(x + 26, z - 30) < 5.8) continue; // nobody wanders into the pond
      if (this.streetColliders.some(c => Math.hypot(x - c.pos.x, z - c.pos.z) < c.r + 0.6)) continue;
      return new THREE.Vector3(x, this.groundH(x, z), z);
    }
    return from.clone();
  }

  private nearbyPet(): { rig: GuardianRig; name: string; line: string } | null {
    if (this.mode !== 'street') return null;
    for (const pet of this.pets) {
      if (this.tamer.position.distanceTo(pet.rig.group.position) < 1.8) return pet;
    }
    return null;
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
  private buildServiceInterior(kind: 'shop' | 'garage' | 'sanctum' | 'boutique'): void {
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
      shop:     { floor: () => plankTexture('#7a5a36', 4), wall: () => plankTexture('#5a4226', 3), sky: ['#2a2014', '#140e08'] as [string, string], light: 0xffd9a0 },
      garage:   { floor: () => tileTexture('#5a6070', '#3a4050', 6), wall: () => stoneTexture('#4a5060', '#2a3040', 3), sky: ['#1a2028', '#0a0e14'] as [string, string], light: 0xaad4ff },
      sanctum:  { floor: () => marbleTexture(), wall: () => marbleTexture('#bcc2d2', '#8a90a5', 3), sky: ['#1a2a22', '#0a1410'] as [string, string], light: 0xb8ffd8 },
      boutique: { floor: () => carpetTexture('#4a1a35', '#d9a11a', 2), wall: () => wallpaperTexture('#4a1a35', '#2a0a1e', '#d9a11a', 2), sky: ['#2a1022', '#140510'] as [string, string], light: 0xffe6b8 }
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
      this.intColliders.push({ pos: new THREE.Vector3(0, 0, -3.4), r: 0.6 });
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
      const showCrawler = makeCrawler({ parts: this.player.crawler.parts, paint: this.player.crawler.paint });
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
    } else if (kind === 'sanctum') {
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
    } else if (kind === 'boutique') {
      this.intName = "Madame Celeste's Boutique";
      
      // Display racks
      for (const rx of [-5, 5]) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 3.4),
          new THREE.MeshStandardMaterial({ color: 0x5a4a35, roughness: 0.85 }));
        rack.position.set(rx, 0.7, 0);
        s.add(rack);
        this.intColliders.push({ pos: new THREE.Vector3(rx, 0, 0), r: 1.8 });
        
        // Hanger bars
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8),
          new THREE.MeshStandardMaterial({ color: 0xd9a11a, metalness: 0.8 }));
        bar.rotation.x = Math.PI / 2;
        bar.position.set(rx, 1.5, 0);
        s.add(bar);
        
        // Garments
        for (let i = 0; i < 4; i++) {
          const col = [0xe85a8a, 0x3a9df2, 0xf2d23a, 0xb18ae8][i % 4];
          const clothBlock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
          clothBlock.position.set(rx, 1.1, -1.2 + i * 0.8);
          s.add(clothBlock);
        }
      }

      // Changing curtains
      for (const cx of [-6, 6]) {
        const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 12, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x8a2e4a, side: THREE.DoubleSide, roughness: 0.95 }));
        curtain.position.set(cx, 1.3, -d / 2 + 1.2);
        s.add(curtain);
        this.intColliders.push({ pos: new THREE.Vector3(cx, 0, -d / 2 + 1.2), r: 1.2 });
      }

      // Counter
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 0.8),
        new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.3 }));
      counter.position.set(0, 0.52, -2.2);
      s.add(counter);
      this.intColliders.push({ pos: new THREE.Vector3(0, 0, -2.2), r: 0.9 });

      // NPC Madame Celeste
      const celeste = makeVoxelHuman({ top: 0x5a1a6a, hair: 0xd8c8f8, cap: 0xb18ae8 });
      celeste.position.set(0, 0, -3.4);
      celeste.rotation.y = 0;
      s.add(celeste);
      this.intNpcs.push(celeste);
      this.intColliders.push({ pos: new THREE.Vector3(0, 0, -3.4), r: 0.6 });

      this.intInteractables.push({
        pos: new THREE.Vector3(0, 0, -1.2), radius: 1.8,
        label: 'Press <b>E</b> — browse Madame Celeste\'s Boutique',
        handler: () => this.openBoutique(),
      });

      this.intMarkers = [
        { x: 0, z: -3.4, label: 'Madame Celeste', color: '#b18ae8', kind: 'npc' },
        { x: -5, z: 0, label: 'Clothing Rack', color: '#d9a11a', kind: 'poi' },
        { x: 5, z: 0, label: 'Clothing Rack', color: '#d9a11a', kind: 'poi' },
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
  /**
   * The doubled arena lobby: the sealed Ring, the World Circuit leaderboard,
   * the golden Hall of Legends with all nine immortal Guardians, merchants,
   * and a hall full of aspirants who grew up on the stories.
   */
  private buildColiseumInterior(): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.intRoom = { w: 46, d: 38 };
    const { w, d } = this.intRoom;
    this.intName = 'Grand Coliseum';

    s.background = skyGradient('#10182a', '#06080f');
    s.add(new THREE.AmbientLight(0xaab8e0, 0.65));
    const main = new THREE.PointLight(0xcfe0ff, 60, 60);
    main.position.set(0, 11, 0);
    main.castShadow = true;
    s.add(main);
    const fill = new THREE.PointLight(0x8aa0d8, 24, 40);
    fill.position.set(0, 8, d / 2 - 6);
    s.add(fill);

    // glossy tech floor with neon guide-strips
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tileTexture('#3a4258', '#222a40', 10), roughness: 0.4, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    for (const sx of [-5.5, 5.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.34, d - 4),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.1 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(sx, 0.02, 0);
      s.add(strip);
    }
    // a gold mosaic compass at the hall's heart
    const mosaic = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 36),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0x8a6a1a, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    mosaic.rotation.x = -Math.PI / 2;
    mosaic.position.y = 0.03;
    s.add(mosaic);
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#4a5068', '#2a3044', 5), roughness: 0.85 });
    const mkWall = (ww: number, wd: number, x: number, z: number, h = 9) => {
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
    for (const cx of [-11, 11]) for (const cz of [-7, 1, 9]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.78, 8.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x6a7288, metalness: 0.6, roughness: 0.35 }));
      col.position.set(cx, 4.2, cz);
      col.castShadow = true;
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.08, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.2 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(cx, 7.4, cz);
      s.add(col, cap);
      this.intColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 1.0 });
    }

    // grand hologram of the tournament ring, floating over the lobby
    const holo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 10, 44),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.4, transparent: true, opacity: 0.8 }));
    holo.position.set(0, 5.6, 1);
    holo.rotation.x = Math.PI / 2.6;
    holo.name = 'stormtip';
    const holoLight = new THREE.PointLight(0xf2c14e, 12, 16);
    holoLight.position.set(0, 5.8, 1);
    s.add(holo, holoLight);

    // banners of the three Legendary Tamers along the back wall
    LEGENDS.forEach((leg, i) => {
      const col = parseInt(leg.color.slice(1), 16);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.85, side: THREE.DoubleSide }));
      banner.position.set((i - 1) * 7, 5.4, -d / 2 + 0.4);
      s.add(banner);
    });

    // ---- THE RING — raised, sealed, guarded ----
    const stage = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 7),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#5a6280', '#323a54', 4), roughness: 0.7 }));
    stage.position.set(0, 0.8, -d / 2 + 4.0);
    s.add(stage);
    const ringFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.14, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a3248, roughness: 0.5, metalness: 0.4 }));
    ringFloor.position.set(0, 1.68, -d / 2 + 4.0);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.1, 8, 44),
      new THREE.MeshStandardMaterial({ color: 0xe83a5a, emissive: 0xe83a5a, emissiveIntensity: 1.5 }));
    ringGlow.rotation.x = Math.PI / 2;
    ringGlow.position.set(0, 1.78, -d / 2 + 4.0);
    ringGlow.name = 'neon';
    const ringLight = new THREE.PointLight(0xe83a5a, 16, 16);
    ringLight.position.set(0, 3.8, -d / 2 + 4.0);
    s.add(ringFloor, ringGlow, ringLight);
    // statue guardians flanking the ring
    for (const side of [-7.2, 7.2]) {
      const statue = makeGuardian(side < 0 ? 'blazemaw' : 'stormclaw');
      statue.group.position.set(side, 1.6, -d / 2 + 3.6);
      statue.group.rotation.y = 0;
      statue.group.scale.setScalar(1.3);
      statue.group.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: 0x8a90a8, roughness: 0.4, metalness: 0.5 });
      });
      s.add(statue.group);
      this.intRigs.push(statue);
    }
    // sealed gate: bars across the stage front
    for (let i = -8; i <= 8; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
      bar.position.set(i * 1.15, 1.45, -d / 2 + 7.9);
      s.add(bar);
    }
    const gateRail = new THREE.Mesh(new THREE.BoxGeometry(19, 0.24, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
    gateRail.position.set(0, 2.9, -d / 2 + 7.9);
    s.add(gateRail);
    // gate colliders — the ring cannot be reached
    for (let gx = -9; gx <= 9; gx += 2) {
      this.intColliders.push({ pos: new THREE.Vector3(gx, 0, -d / 2 + 7.9), r: 1.2 });
    }
    // the two guards
    const guardL = makeVoxelHuman({ top: 0x8a3040, hair: 0x2a2a3a, cap: 0xc9a24a });
    guardL.position.set(-2.6, 0, -d / 2 + 9.2);
    const guardR = makeVoxelHuman({ top: 0x8a3040, hair: 0x4a3a2a, cap: 0xc9a24a, hairstyle: 'ponytail' });
    guardR.position.set(2.6, 0, -d / 2 + 9.2);
    s.add(guardL, guardR);
    this.intNpcs.push(guardL, guardR);
    this.intColliders.push({ pos: guardL.position.clone().setY(0), r: 0.6 }, { pos: guardR.position.clone().setY(0), r: 0.6 });
    const guardLines = [
      'The Ring is sealed until the Grand Tournament opens. No exceptions — not even for Grand House colors.',
      'Up there is where champions are made. Down here is where they wait. You\'re down here.',
      'Twenty-two championships were decided on that ring. Eight were Aljay\'s. Nine were Greggy\'s. Five were Onnel\'s. Read the gold wall and mind your manners.',
      'When they doubled the arena they numbered every stone, moved it, and put every stone back. The Ring itself? Never touched. Nobody dared.',
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
    const attendant = makeVoxelHuman({ top: 0x5ab8e8, hair: 0x6a3a1a, cap: null, hairstyle: 'buns' });
    attendant.position.set(0, 0, -3.7);
    s.add(attendant);
    this.intNpcs.push(attendant);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, -3.7), r: 0.6 });
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, -1.6), radius: 1.9,
      label: 'Press <b>E</b> — Tournament Registration',
      handler: async () => {
        const pick = await choose('Attendant Lyssa',
          'Welcome to the Grand Coliseum of Haven City — rebuilt at twice its old size, and still not big enough on finals night! What would you like to know?',
          ['Register for the Tournament', 'Ask about the Ring', 'Ask about the Hall of Legends', 'Nothing, thanks']);
        if (pick === 0) {
          await say('Attendant Lyssa', 'Registration is not yet open — the brackets, the prize vault and the broadcast crystals are still being prepared. Keep training, tamer. When the horns sound across Haven City, come straight to me. I\'ll hold a slot for you.');
          toast('🏟️ The Grand Tournament opens soon!', 'gold');
        } else if (pick === 1) {
          await say('Attendant Lyssa', 'The Ring seats twenty thousand now and the sound of a final can be heard from the city walls. It stays sealed between tournaments — the two guards up there take their job VERY seriously.');
        } else if (pick === 2) {
          await say('Attendant Lyssa', 'The gold wall, east side. Aljay — eight championships. Greggy — nine, the longest reign in history. Onnel — five. Their names are immortalized with all nine of their Guardians. The World Circuit board on the west wall is for everyone still chasing them.');
        }
      },
    });

    // ---- WEST WALL: the World Circuit leaderboard ----
    {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 9.4), new THREE.MeshStandardMaterial({
        map: this.worldCircuitBoardTexture(), emissive: 0xffffff, emissiveMap: this.worldCircuitBoardTexture(), emissiveIntensity: 0.32, roughness: 0.4,
      }));
      board.rotation.y = Math.PI / 2;
      board.position.set(-w / 2 + 0.3, 4.9, 2);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 9.9, 7.9),
        new THREE.MeshStandardMaterial({ color: 0x2a3248, metalness: 0.6, roughness: 0.4 }));
      frame.position.set(-w / 2 + 0.18, 4.9, 2);
      const boardNeon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 7.9),
        new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.4 }));
      boardNeon.position.set(-w / 2 + 0.3, 9.9, 2);
      const boardLight = new THREE.PointLight(0x9ac8f2, 14, 13);
      boardLight.position.set(-w / 2 + 3, 5.5, 2);
      s.add(frame, board, boardNeon, boardLight);
      this.intColliders.push({ pos: new THREE.Vector3(-w / 2 + 0.6, 0, 2), r: 1.2 });
      this.intInteractables.push({
        pos: new THREE.Vector3(-w / 2 + 1.6, 0, 2), radius: 2.6,
        label: 'Press <b>E</b> — study the World Circuit standings',
        handler: () => this.openWorldCircuitBoard(),
      });
      // the crowd that never leaves the standings
      const circuitFans: { x: number; z: number; top: number; line: string }[] = [
        { x: -w / 2 + 3.4, z: 0.6, top: 0x3a8ad9, line: 'Serra Vayle, forty-one and six. FORTY-ONE. And the Gray Cur is twenty-and-THREE — if they ever fight, I\'m selling my Crawler for a front seat.' },
        { x: -w / 2 + 4.2, z: 2.4, top: 0xd99a4a, line: 'One day my name goes up there. Rank ten will do. Rank ten is FINE. …rank one would be better.' },
        { x: -w / 2 + 3.2, z: 3.9, top: 0x4ec45e, line: 'Castor Greene trains at dawn behind the windmill. Twenty-two wins and he still helps Ferryn haul flour sacks. THAT\'S a champion.' },
      ];
      for (const f of circuitFans) {
        const npc = makeVoxelHuman({ top: f.top, hair: [0x2a2a3a, 0x6a3a1a, 0xd8d8d8][Math.floor(Math.random() * 3)], cap: Math.random() < 0.4 ? 0x2a4a6a : null, hairstyle: (['classic', 'spiky', 'curly'] as const)[Math.floor(Math.random() * 3)] });
        npc.position.set(f.x, 0, f.z);
        npc.rotation.y = -Math.PI / 2; // transfixed by the board
        s.add(npc);
        this.intNpcs.push(npc);
        this.intColliders.push({ pos: npc.position.clone().setY(0), r: 0.55 });
        this.intInteractables.push({
          pos: npc.position.clone().setY(0), radius: 1.5,
          label: 'Press <b>E</b> — talk leaderboards',
          handler: async () => { await say('Circuit Devotee', f.line); },
        });
      }
    }

    // ---- EAST WALL: the HALL OF LEGENDS ----
    {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 9.4), new THREE.MeshStandardMaterial({
        map: this.hallOfLegendsTexture(), emissive: 0xffffff, emissiveMap: this.hallOfLegendsTexture(), emissiveIntensity: 0.38, roughness: 0.35,
      }));
      board.rotation.y = -Math.PI / 2;
      board.position.set(w / 2 - 0.3, 4.9, 2);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 9.9, 9.1),
        new THREE.MeshStandardMaterial({ color: 0x6a521a, metalness: 0.75, roughness: 0.3 }));
      frame.position.set(w / 2 - 0.18, 4.9, 2);
      const crownBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 9.1),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.5 }));
      crownBar.position.set(w / 2 - 0.3, 9.9, 2);
      const goldLight = new THREE.PointLight(0xf2d49a, 16, 14);
      goldLight.position.set(w / 2 - 3, 5.5, 2);
      s.add(frame, board, crownBar, goldLight);
      this.intColliders.push({ pos: new THREE.Vector3(w / 2 - 0.6, 0, 2), r: 1.2 });
      this.intInteractables.push({
        pos: new THREE.Vector3(w / 2 - 1.6, 0, 2), radius: 2.6,
        label: 'Press <b>E</b> — read the Hall of Legends',
        handler: () => this.openHallOfLegends(),
      });
      // pilgrims at the gold wall
      const pilgrims: { x: number; z: number; top: number; line: string }[] = [
        { x: w / 2 - 3.4, z: 0.4, top: 0xf2603a, line: 'Eight titles. Aljay retired UNDEFEATED in finals. My da was at the last one — says when Firgara drew its blazing sword, night turned to noon.' },
        { x: w / 2 - 4.4, z: 2.2, top: 0xf2d23a, line: 'Nine. NINE championships. Greggy\'s record will never fall. I said never! …Serra Vayle worries me, though. Don\'t write that down.' },
        { x: w / 2 - 3.2, z: 3.8, top: 0x4ec45e, line: 'Five for Onnel — and they say the Worldroot only ever entered to keep the other two honest. Imagine being that good out of POLITENESS.' },
        { x: w / 2 - 5.2, z: 1.2, top: 0x9a5af2, line: 'Nine Guardians on that wall — every one carries Aether. The tenth element. My professor says we\'ll never see a tenth being carry it. I\'m going to prove her wrong.' },
      ];
      for (const f of pilgrims) {
        const npc = makeVoxelHuman({ top: f.top, hair: [0x2a2a3a, 0x6a3a1a, 0x7a4a2a][Math.floor(Math.random() * 3)], cap: null, hairstyle: (['classic', 'long', 'buns', 'mohawk'] as const)[Math.floor(Math.random() * 4)] });
        npc.position.set(f.x, 0, f.z);
        npc.rotation.y = Math.PI / 2; // gazing at the gold wall
        s.add(npc);
        this.intNpcs.push(npc);
        this.intColliders.push({ pos: npc.position.clone().setY(0), r: 0.55 });
        this.intInteractables.push({
          pos: npc.position.clone().setY(0), radius: 1.5,
          label: 'Press <b>E</b> — talk legends',
          handler: async () => { await say('Pilgrim of the Hall', f.line); },
        });
      }
    }

    // ---- the Legend alcoves: three golden tamers, nine living statues ----
    // Gathered in the hall's north-west corner — a quiet gallery beside
    // the Ring, where the devoted can stand and simply look up.
    const ALCOVES: [number, number][] = [[-18.5, -14], [-13.5, -10], [-18.5, -6]];
    LEGENDS.forEach((leg, i) => {
      const [ax, az] = ALCOVES[i];
      const yaw = Math.atan2(0 - ax, 2 - az);   // gazing out over the hall
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const col = parseInt(leg.color.slice(1), 16);
      // alcove dais
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 20),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#6a6276', '#3a3444', 2), roughness: 0.7 }));
      dais.position.set(ax, 0.25, az);
      s.add(dais);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.07, 8, 36),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.set(ax, 0.56, az);
      halo.name = 'neon';
      const alight = new THREE.PointLight(col, 12, 11);
      alight.position.set(ax, 4, az);
      s.add(halo, alight);
      // the legend in gold
      const statue = makeVoxelHuman({
        skin: 0xd8c27a, hair: 0xc9a24a, top: 0xb89a3a, bottom: 0xa8883a, shoes: 0x8a6a2a, cap: null, robe: true,
        hairstyle: i === 0 ? 'spiky' : i === 1 ? 'classic' : 'long',
      });
      statue.position.set(ax, 0.5, az);
      statue.rotation.y = yaw;
      statue.scale.setScalar(1.5);
      s.add(statue);
      this.intNpcs.push(statue);
      // their three Guardians, alive with Aether light, arrayed behind
      leg.guardians.forEach((gd, gi) => {
        const off = fwd.clone().multiplyScalar(gi === 1 ? -1.7 : -1.3).add(side.clone().multiplyScalar((gi - 1) * 1.9));
        const rig = makeCustomCreature(gd.archetype, gd.palette, gd.glow, gd.scale * 0.6, true, gd.bespoke);
        rig.group.position.set(ax + off.x, 0.5, az + off.z);
        rig.group.rotation.y = yaw;
        s.add(rig.group);
        this.intRigs.push(rig);
      });
      this.intColliders.push({ pos: new THREE.Vector3(ax, 0, az), r: 2.7 });
      this.intInteractables.push({
        pos: new THREE.Vector3(ax + fwd.x * 3.2, 0, az + fwd.z * 3.2), radius: 2.2,
        label: `Press <b>E</b> — honor ${leg.name} ${leg.title}`,
        handler: async () => {
          await say(`${leg.name} ${leg.title} — ${leg.championships}× World Champion (${leg.champYears})`, leg.story);
          for (const gd of leg.guardians) {
            await say(`${gd.name}, ${gd.epithet} (${gd.elements.join(' · ')})`, gd.desc);
          }
        },
      });
    });

    // the devoted, drinking in the sight of the gallery
    const admirers: { x: number; z: number; top: number; face: [number, number]; line: string }[] = [
      { x: -12.5, z: -14.5, top: 0xf2603a, face: [-18.5, -14], line: 'Best thing the Coliseum ever did, gathering the three of them in this corner. You can hear yourself be awestruck now. I come every market day. Twice on rest days.' },
      { x: -10.2, z: -8.5, top: 0x4ec45e, face: [-13.5, -10], line: 'Watch the little Verdalune behind Onnel — it opens one petal at noon. NOON. EXACTLY. I\'ve timed it for a month. Nobody believes me. You believe me, right?' },
      { x: -14.8, z: -4.5, top: 0xf2d23a, face: [-18.5, -6], line: 'I proposed to my husband right here, between Aljay and Greggy. Six golden statues for witnesses. He said "obviously". Strongest contract in Olivar.' },
      { x: -15.8, z: -10.2, top: 0x5ab8e8, face: [-16, -10], line: 'Dad says if I train hard enough, my statue goes in the fourth alcove. There IS no fourth alcove. ...YET. Write my name down somewhere so you can say you knew me.' },
    ];
    for (const a of admirers) {
      const npc = makeVoxelHuman({
        top: a.top, hair: [0x2a2a3a, 0x6a3a1a, 0x7a4a2a, 0xd8d8d8][Math.floor(Math.random() * 4)],
        cap: Math.random() < 0.3 ? 0xc9a24a : null,
        hairstyle: (['classic', 'spiky', 'long', 'buns'] as const)[Math.floor(Math.random() * 4)],
      });
      npc.position.set(a.x, 0, a.z);
      npc.rotation.y = Math.atan2(a.face[0] - a.x, a.face[1] - a.z); // transfixed by the gold
      s.add(npc);
      this.intNpcs.push(npc);
      this.intColliders.push({ pos: npc.position.clone().setY(0), r: 0.55 });
      this.intInteractables.push({
        pos: npc.position.clone().setY(0), radius: 1.5,
        label: 'Press <b>E</b> — share the view',
        handler: async () => { await say('Admirer of the Legends', a.line); },
      });
    }

    // ---- merchants in the side alcoves ----
    const stall = (sx: number, color: number) => {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.8),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a'), roughness: 0.85 }));
      counter.position.set(sx, 0.5, 8.5);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.6),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      awning.position.set(sx, 2.5, 8.6);
      s.add(counter, awning);
      this.intColliders.push({ pos: new THREE.Vector3(sx, 0, 8.5), r: 1.6 });
    };
    stall(-16, 0xd84a3a);
    const vesna = makeVoxelHuman({ top: 0xd84a3a, hair: 0x7a4a2a, cap: 0xf2ead0 });
    vesna.position.set(-16, 0, 9.7);
    s.add(vesna);
    this.intNpcs.push(vesna);
    this.intColliders.push({ pos: new THREE.Vector3(-16, 0, 9.7), r: 0.6 });
    this.intInteractables.push({
      pos: new THREE.Vector3(-16, 0, 7.6), radius: 1.8,
      label: 'Press <b>E</b> — Vesna\'s Battle Provisions',
      handler: async () => {
        await say('Merchant Vesna', 'Tonics, treats and field kit — everything a tournament hopeful burns through. Stock up before the brackets open!');
        await this.runShopUI('⚔️ Vesna\'s Battle Provisions', SHOP_STOCK);
      },
    });
    stall(16, 0x9a5af2);
    const korr = makeVoxelHuman({ top: 0x9a5af2, hair: 0x1a1a2e, cap: null });
    korr.position.set(16, 0, 9.7);
    s.add(korr);
    this.intNpcs.push(korr);
    this.intColliders.push({ pos: new THREE.Vector3(16, 0, 9.7), r: 0.6 });
    this.intInteractables.push({
      pos: new THREE.Vector3(16, 0, 7.6), radius: 1.8,
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
      { x: -7, z: 4, top: 0x4ec45e, line: 'My gran watched Onnel qualify on this Ring before the war. Same Ring! I touch the gate bars for luck. The guards hate it.' },
      { x: 7, z: 3.6, top: 0xe85a8a, line: 'Registration NOT OPEN YET. I\'ve asked Lyssa eleven times. The twelfth will be the one, I can feel it.' },
      { x: -3.5, z: 11.5, top: 0x8a93a8, line: 'I came from Tharkand for this — two months by sand-crawler. They DOUBLED the Coliseum since the stories. Doubled!' },
      { x: 3.8, z: 12.4, top: 0xf2d23a, line: 'Strategy is everything. Elements, swap timing, SP economy… I have a notebook. Three notebooks.' },
      { x: -9.5, z: -3.5, top: 0x6a4a9a, line: 'Shh — I\'m visualizing my finals entrance. There\'s pyrotechnics. There\'s a slow walk. The crowd goes quiet…' },
      { x: 9.6, z: -3.2, top: 0x4a7a9a, line: 'Aljay fought HERE. Greggy fought HERE. One day someone will whisper that about us. Well. About me.' },
      { x: -6, z: -8, top: 0xc4582a, line: 'I sat in the Hall of Legends alcove for an hour. The little Vulfenix statue LOOKED at me. I\'m not saying it\'s alive. I\'m not saying it isn\'t.' },
      { x: 6.4, z: -8.4, top: 0x2a8a8e, line: 'My coach says watch the World Circuit board until you hate every name on it. Healthy? No. Effective? We\'ll see.' },
    ];
    for (const a of aspirants) {
      const npc = makeVoxelHuman({
        top: a.top, hair: [0x2a2a3a, 0x6a3a1a, 0x7a4a2a, 0xd8d8d8][Math.floor(Math.random() * 4)],
        cap: Math.random() < 0.4 ? 0xd84a3a : null,
        hairstyle: (['classic', 'spiky', 'long', 'ponytail', 'curly', 'mohawk'] as const)[Math.floor(Math.random() * 6)],
      });
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
      { x: 0, z: -d / 2 + 4.0, label: 'THE RING (sealed)', color: '#e83a5a', kind: 'poi' },
      { x: -2.6, z: -d / 2 + 9.2, label: 'Guard', color: '#c9a24a', kind: 'npc' },
      { x: 2.6, z: -d / 2 + 9.2, label: 'Guard', color: '#c9a24a', kind: 'npc' },
      { x: 0, z: -3.7, label: 'Registration', color: '#5ab8e8', kind: 'npc' },
      { x: -w / 2 + 1.2, z: 2, label: 'World Circuit', color: '#5ab8e8', kind: 'poi' },
      { x: w / 2 - 1.2, z: 2, label: 'Hall of Legends', color: '#f2c14e', kind: 'poi' },
      { x: -16, z: d / 2 - 4.6, label: 'Aljay', color: '#f2603a', kind: 'poi' },
      { x: 0, z: d / 2 - 4.6, label: 'Greggy', color: '#f2d23a', kind: 'poi' },
      { x: 16, z: d / 2 - 4.6, label: 'Onnel', color: '#4ec45e', kind: 'poi' },
      { x: -16, z: 8.5, label: 'Provisions', color: '#d84a3a', kind: 'building' },
      { x: 16, z: 8.5, label: 'Gems', color: '#9a5af2', kind: 'building' },
      { x: 0, z: d / 2, label: 'Exit', color: '#e8d9a8', kind: 'door' },
    ];

    // exit
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 0.6), radius: 1.8,
      label: 'Press <b>E</b> — leave the Coliseum',
      handler: async () => this.exitHouse(),
    });
  }

  // ================= Coliseum leaderboards =================
  private circuitTex: THREE.Texture | null = null;
  private legendsTex: THREE.Texture | null = null;

  /** The World Circuit standings, rendered as a glowing arena board. */
  private worldCircuitBoardTexture(): THREE.Texture {
    if (this.circuitTex) return this.circuitTex;
    const W = 800, H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#101a30'); bg.addColorStop(1, '#070b16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // scanlines
    ctx.fillStyle = 'rgba(90,184,232,0.05)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    // header
    ctx.fillStyle = '#5ab8e8';
    ctx.font = 'bold 52px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('WORLD CIRCUIT', W / 2, 78);
    ctx.font = 'bold 26px Trebuchet MS';
    ctx.fillStyle = '#8b93b8';
    ctx.fillText('SEASON STANDINGS — GRAND COLISEUM', W / 2, 116);
    ctx.strokeStyle = '#5ab8e8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(60, 140); ctx.lineTo(W - 60, 140); ctx.stroke();
    // rows
    const maxWins = WORLD_CIRCUIT[0].wins;
    WORLD_CIRCUIT.forEach((e, i) => {
      const y = 196 + i * 82;
      ctx.textAlign = 'left';
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(90,123,216,0.08)'; ctx.fillRect(48, y - 44, W - 96, 72); }
      ctx.fillStyle = i === 0 ? '#f2c14e' : i === 1 ? '#c8d0e8' : i === 2 ? '#c9892a' : '#6a7290';
      ctx.font = 'bold 40px Trebuchet MS';
      ctx.fillText(String(e.rank).padStart(2, '0'), 64, y);
      ctx.fillStyle = '#e8ecff';
      ctx.font = 'bold 32px Trebuchet MS';
      ctx.fillText(e.name, 140, y - 8);
      ctx.fillStyle = e.color;
      ctx.font = 'italic 22px Trebuchet MS';
      ctx.fillText(`"${e.title}" — ${e.house}`, 140, y + 22);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#5ad88a';
      ctx.font = 'bold 30px Trebuchet MS';
      ctx.fillText(`${e.wins}W`, W - 150, y - 6);
      ctx.fillStyle = '#e85a6a';
      ctx.font = 'bold 22px Trebuchet MS';
      ctx.fillText(`${e.losses}L`, W - 76, y - 8);
      // win bar
      ctx.fillStyle = 'rgba(90,216,138,0.25)';
      ctx.fillRect(140, y + 32, (W - 280) * (e.wins / maxWins), 7);
      ctx.fillStyle = e.color;
      ctx.fillRect(140, y + 32, (W - 280) * (e.wins / maxWins) * 0.25, 7);
      ctx.textAlign = 'left';
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b93b8';
    ctx.font = '22px Trebuchet MS';
    ctx.fillText('— the records of the Three stand apart: see the HALL OF LEGENDS —', W / 2, H - 30);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.circuitTex = tex;
    return tex;
  }

  /** The Hall of Legends — gold on midnight, the three immortalized champions. */
  private hallOfLegendsTexture(): THREE.Texture {
    if (this.legendsTex) return this.legendsTex;
    const W = 920, H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1c1408'); bg.addColorStop(0.5, '#120d06'); bg.addColorStop(1, '#1c1408');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // filigree border
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, W - 68, H - 68);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2c14e';
    ctx.font = 'bold 56px Georgia';
    ctx.fillText('HALL OF LEGENDS', W / 2, 104);
    ctx.fillStyle = '#b8a26a';
    ctx.font = 'italic 24px Georgia';
    ctx.fillText('Their names outlast the stone they are carved in', W / 2, 142);
    LEGENDS.forEach((leg, i) => {
      const y0 = 190 + i * 272;
      ctx.strokeStyle = leg.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(70, y0); ctx.lineTo(W - 70, y0); ctx.stroke();
      ctx.fillStyle = leg.color;
      ctx.font = 'bold 44px Georgia';
      ctx.textAlign = 'left';
      ctx.fillText(`${leg.name}  ·  ${leg.title}`, 76, y0 + 56);
      // championship laurels
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f2c14e';
      ctx.font = 'bold 40px Georgia';
      ctx.fillText(`${leg.championships}×`, W - 80, y0 + 54);
      ctx.font = 'bold 17px Trebuchet MS';
      ctx.fillStyle = '#b8a26a';
      ctx.fillText('WORLD CHAMPION', W - 80, y0 + 78);
      ctx.fillText(leg.champYears, W - 80, y0 + 100);
      // championship pips
      ctx.textAlign = 'left';
      for (let p = 0; p < leg.championships; p++) {
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath();
        ctx.arc(86 + p * 30, y0 + 88, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5a14';
        ctx.beginPath();
        ctx.arc(86 + p * 30, y0 + 88, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // their three guardians
      leg.guardians.forEach((gd, gi) => {
        const gy = y0 + 138 + gi * 38;
        ctx.fillStyle = '#e8ecff';
        ctx.font = 'bold 26px Trebuchet MS';
        ctx.fillText(`✦ ${gd.name}`, 96, gy);
        ctx.fillStyle = '#8b93b8';
        ctx.font = 'italic 20px Trebuchet MS';
        ctx.fillText(gd.epithet, 320, gy);
        // element pips
        gd.elements.forEach((el, ei) => {
          ctx.fillStyle = ELEMENT_CSS[el];
          ctx.beginPath();
          ctx.arc(640 + ei * 86 + 10, gy - 8, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#b8a26a';
          ctx.font = '16px Trebuchet MS';
          ctx.fillText(el, 640 + ei * 86 + 24, gy - 1);
        });
      });
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.legendsTex = tex;
    return tex;
  }

  /** Full-screen World Circuit standings. */
  private async openWorldCircuitBoard(): Promise<void> {
    this.busy = true;
    await new Promise<void>(resolve => {
      const rows = WORLD_CIRCUIT.map(e => `
        <div class="list-row" style="cursor:default">
          <div style="display:flex;align-items:center;gap:12px;flex:1">
            <span style="font-size:22px;font-weight:800;color:${e.rank === 1 ? 'var(--ui-gold)' : e.rank <= 3 ? '#c8d0e8' : 'var(--ui-dim)'};min-width:34px">${e.rank}</span>
            <div style="flex:1">
              <b>${e.name}</b> <span style="color:${e.color};font-size:13px">"${e.title}"</span>
              <div class="sub">House ${e.house}</div>
            </div>
            <div style="text-align:right">
              <span class="hpcol" style="font-weight:700">${e.wins}W</span> · <span style="color:var(--ui-red)">${e.losses}L</span>
              <div class="bar" style="width:130px;margin-top:3px"><div style="width:${Math.round(e.wins / WORLD_CIRCUIT[0].wins * 100)}%;background:${e.color}"></div></div>
            </div>
          </div>
        </div>`).join('');
      const el = openScreen(`
        <h3>🏟️ World Circuit — Season Standings</h3>
        <div class="sub" style="margin-bottom:8px">Every sanctioned arena victory across the four continents feeds this board. The Three are beyond it — their wall is gold.</div>
        <div style="max-height:430px;overflow-y:auto">${rows}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <span class="sub">Your record: ${this.player.battlesWon} wins — keep climbing, ${this.player.tamerName}.</span>
          <button class="ui-btn primary" id="board-close">Step back</button>
        </div>`);
      (el.querySelector('#board-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
    });
    this.busy = false;
  }

  /** Full-screen Hall of Legends, with all nine Guardians. */
  private async openHallOfLegends(): Promise<void> {
    this.busy = true;
    await new Promise<void>(resolve => {
      const sections = LEGENDS.map(leg => `
        <div style="border:1px solid ${leg.color};border-radius:10px;padding:10px 14px;margin-bottom:10px;background:linear-gradient(160deg, rgba(26,32,64,0.6), rgba(12,10,24,0.7))">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
            <span style="font-size:19px;font-weight:800;color:${leg.color}">${leg.name} · ${leg.title}</span>
            <span class="goldcol" style="font-weight:800">${'🏆'.repeat(Math.min(leg.championships, 9))} ${leg.championships}× World Champion <span class="sub">(${leg.champYears})</span></span>
          </div>
          <div class="sub" style="margin:6px 0 8px">${leg.story}</div>
          ${leg.guardians.map(gd => `
            <div class="list-row" style="cursor:default;margin-bottom:4px">
              <div style="flex:1">
                <b>✦ ${gd.name}</b> <span class="sub">— ${gd.epithet}</span>
                <div class="sub">${gd.desc}</div>
              </div>
              <div style="white-space:nowrap">${gd.elements.map(e2 => `<span class="el-chip" style="border-color:${ELEMENT_CSS[e2]};color:${ELEMENT_CSS[e2]};font-size:11px">${e2}</span>`).join('')}</div>
            </div>`).join('')}
        </div>`).join('');
      const el = openScreen(`
        <h3>👑 The Hall of Legends</h3>
        <div class="sub" style="margin-bottom:8px">Twenty-two championships. Nine Aether Guardians. Three friends who walked into Ghandra so the rest of the world never had to.</div>
        <div style="max-height:450px;overflow-y:auto;padding-right:4px">${sections}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="ui-btn primary" id="hall-close">Step back</button></div>`);
      (el.querySelector('#hall-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
    });
    this.busy = false;
  }

  private async enterService(kind: 'shop' | 'garage' | 'sanctum' | 'coliseum' | 'boutique'): Promise<void> {
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
    const show = this.interiorScene?.getObjectByName('showcrawler') as THREE.Group | null;
    if (show) disposeCrawler(show);
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

  // ================= garage: the Crawler Workshop =================
  /**
   * Dax's full customization bay: every part slot is a real 3D module on
   * the machine. Try parts on the live turntable, buy them, repaint each
   * one — the Crawler in the preview is exactly what rides into the field.
   */
  private async openGarage(): Promise<void> {
    await say('Engineer Dax', 'Ah, a Crawler! Beautiful machine. Hop on the turntable rig — try any part you like, slap some paint on her. You break it, you bought it. Actually no — you buy it BEFORE you break it.');
    this.busy = true;
    await new Promise<void>(resolve => {
      const p = this.player;
      const c = p.crawler;
      let activeSlot: CrawlerSlot = 'hull';
      // try-on state — committed only when you Equip / Apply
      const previewParts: Record<CrawlerSlot, string> = { ...c.parts };
      const previewPaint: Partial<Record<CrawlerSlot, string>> = { ...c.paint };

      const el = openScreen(`
        <h3>🔧 Dax's Crawler Workshop — <span id="garage-shards" class="goldcol">◆${p.shards} Shards</span></h3>
        <div class="grid2">
          <div>
            <div id="garage-tabs" class="panel-tabs" style="margin-bottom:8px"></div>
            <div id="garage-blurb" class="sub" style="margin-bottom:6px"></div>
            <div id="garage-list" style="max-height:300px;overflow-y:auto;padding-right:4px"></div>
            <h3 style="margin-top:10px">🎨 Paint Bay</h3>
            <div id="garage-paint" class="swatch-row"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.35);border:1px solid var(--ui-border);border-radius:8px;padding:12px;">
            <h4 style="color:var(--ui-gold);text-transform:uppercase;font-size:14px;letter-spacing:1px;margin-bottom:8px">Turntable Rig</h4>
            <div id="crawler-preview" style="width:300px;height:260px;position:relative;overflow:hidden;background:rgba(6,8,16,0.55);border-radius:6px;border:1px solid #2c3666"></div>
            <div class="sub" style="margin-top:6px;font-size:11px;color:var(--ui-dim)">LIVE 3D PREVIEW · DRAG TO ROTATE</div>
            <div id="garage-stats" style="width:100%;margin-top:10px;font-size:13px"></div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
          <button class="ui-btn" id="garage-repair">Full service ◆50</button>
          <button class="ui-btn primary" id="garage-close">Leave Workshop</button>
        </div>`);

      const previewBox = el.querySelector('#crawler-preview') as HTMLElement;
      const preview = initCrawlerPreview3D(previewBox, { parts: previewParts, paint: previewPaint });

      const refreshPreview = () => preview.update({ parts: previewParts, paint: previewPaint });

      const updateUI = () => {
        (el.querySelector('#garage-shards') as HTMLElement).textContent = `◆${p.shards} Shards`;

        // slot tabs
        const tabs = el.querySelector('#garage-tabs') as HTMLElement;
        tabs.innerHTML = CRAWLER_SLOTS.map(slot => {
          const info = CRAWLER_SLOT_INFO[slot];
          return `<button class="ui-btn tab ${slot === activeSlot ? 'primary' : ''}" data-slot="${slot}">${info.icon} ${info.label}</button>`;
        }).join('');
        tabs.querySelectorAll<HTMLElement>('[data-slot]').forEach(b => b.onclick = () => {
          activeSlot = b.dataset.slot as CrawlerSlot;
          updateUI();
        });
        (el.querySelector('#garage-blurb') as HTMLElement).textContent = CRAWLER_SLOT_INFO[activeSlot].blurb;

        // parts list for the active slot
        const parts = Object.values(CRAWLER_PARTS).filter(x => x.slot === activeSlot).sort((a, b) => a.tier - b.tier);
        const list = el.querySelector('#garage-list') as HTMLElement;
        list.innerHTML = parts.map(part => {
          const owned = c.owned.includes(part.id);
          const equipped = c.parts[activeSlot] === part.id;
          const trying = previewParts[activeSlot] === part.id;
          let btn: string;
          if (equipped && trying) btn = '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>';
          else if (owned && trying) btn = `<button class="ui-btn primary" data-fit="${part.id}">Install</button>`;
          else if (owned) btn = `<button class="ui-btn" data-try="${part.id}">Try On</button>`;
          else if (trying) btn = `<button class="ui-btn gold" data-buyfit="${part.id}" ${p.shards < part.price ? 'disabled' : ''}>Buy & Install ◆${part.price}</button>`;
          else btn = `<div style="display:flex;gap:4px"><button class="ui-btn" data-try="${part.id}">Try</button><button class="ui-btn" data-buyfit="${part.id}" ${p.shards < part.price ? 'disabled' : ''}>◆${part.price}</button></div>`;
          const tierStars = '★'.repeat(part.tier) + '☆'.repeat(4 - part.tier);
          const tryBadge = trying && !equipped ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022;margin-left:5px">ON RIG</span>' : '';
          return `<div class="list-row" style="${trying ? 'border-color:var(--ui-gold);background:rgba(217,161,26,0.08);' : ''}">
            <div style="flex:1" data-try="${part.id}">
              <b>${part.name}</b> <span class="goldcol" style="font-size:11px;letter-spacing:1px">${tierStars}</span>${tryBadge}
              <div class="sub">${part.desc}</div>
            </div>${btn}</div>`;
        }).join('');
        list.querySelectorAll<HTMLElement>('[data-try]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          previewParts[activeSlot] = b.dataset.try!;
          refreshPreview(); updateUI();
        });
        list.querySelectorAll<HTMLElement>('[data-fit]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          c.equip(b.dataset.fit!);
          toast(`${CRAWLER_PARTS[b.dataset.fit!].name} installed.`, 'gold');
          updateUI();
        });
        list.querySelectorAll<HTMLElement>('[data-buyfit]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          const part = CRAWLER_PARTS[b.dataset.buyfit!];
          if (p.shards < part.price) return;
          p.shards -= part.price;
          c.owned.push(part.id);
          c.equip(part.id);
          previewParts[activeSlot] = part.id;
          toast(`${part.name} bought and installed!`, 'gold');
          refreshPreview(); updateUI();
        });

        // paint bay for the active slot
        const paintBox = el.querySelector('#garage-paint') as HTMLElement;
        const curPaint = previewPaint[activeSlot];
        const stockSel = !curPaint ? 'sel' : '';
        let paintHtml = `<div class="swatch ${stockSel}" data-paint="" title="Stock finish"><span class="swatch-dot" style="background:linear-gradient(135deg,#7a7a88,#3a3a44)"></span><span class="swatch-name">Stock</span></div>`;
        paintHtml += Object.values(PAINT_JOBS).map(pj => {
          const owned = c.ownedPaints.includes(pj.id);
          const sel = curPaint === pj.id ? 'sel' : '';
          return `<div class="swatch ${sel}" data-paint="${pj.id}" title="${pj.desc}">
            <span class="swatch-dot" style="background:${pj.swatch};${pj.emissive ? 'box-shadow:0 0 8px ' + pj.swatch : ''}"></span>
            <span class="swatch-name">${pj.name}</span>
            ${owned ? '<span class="swatch-owned">✔</span>' : `<span class="swatch-price">◆${pj.price}</span>`}
          </div>`;
        }).join('');
        // commit row: apply the previewed paint if it differs from what's saved
        const savedPaint = c.paint[activeSlot];
        let commitHtml = '';
        if (curPaint !== savedPaint) {
          const pj = curPaint ? PAINT_JOBS[curPaint] : null;
          if (pj && !c.ownedPaints.includes(pj.id)) {
            commitHtml = `<button class="ui-btn gold" id="paint-buy" ${p.shards < pj.price ? 'disabled' : ''} style="margin-top:6px">Buy "${pj.name}" ◆${pj.price} — unlocks for every part</button>`;
          } else {
            commitHtml = `<button class="ui-btn primary" id="paint-apply" style="margin-top:6px">Apply ${pj ? `"${pj.name}"` : 'stock finish'} to the ${CRAWLER_SLOT_INFO[activeSlot].label}</button>`;
          }
        }
        paintBox.innerHTML = paintHtml + commitHtml;
        paintBox.querySelectorAll<HTMLElement>('[data-paint]').forEach(sw => sw.onclick = () => {
          const id = sw.dataset.paint!;
          if (id === '') delete previewPaint[activeSlot];
          else previewPaint[activeSlot] = id;
          refreshPreview(); updateUI();
        });
        const buyBtn = paintBox.querySelector<HTMLElement>('#paint-buy');
        if (buyBtn) buyBtn.onclick = () => {
          const pj = PAINT_JOBS[curPaint!];
          if (p.shards < pj.price) return;
          p.shards -= pj.price;
          c.ownedPaints.push(pj.id);
          c.applyPaint(activeSlot, pj.id);
          toast(`"${pj.name}" is yours — sprayed on the ${CRAWLER_SLOT_INFO[activeSlot].label}.`, 'gold');
          updateUI();
        };
        const applyBtn = paintBox.querySelector<HTMLElement>('#paint-apply');
        if (applyBtn) applyBtn.onclick = () => {
          c.applyPaint(activeSlot, curPaint ?? null);
          toast(curPaint ? 'Paint applied.' : 'Back to the stock finish.');
          updateUI();
        };

        // stats readout
        (el.querySelector('#garage-stats') as HTMLElement).innerHTML = `
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Hull</span><b>${c.hull}/${c.hullMax}</b></div>
          <div class="bar hull"><div style="width:${(c.hull / c.hullMax) * 100}%"></div></div>
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Energy</span><b>${c.energy}/${c.energyMax}</b></div>
          <div class="bar energy"><div style="width:${(c.energy / c.energyMax) * 100}%"></div></div>
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Cargo</span><b>${p.inventory.size}/${c.cargoMax}</b></div>
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">First strike</span><b>${Math.round(c.firstStrikeChance * 100)}%</b></div>
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Scanner</span><b>T${c.scannerTier}</b></div>
          <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Stride</span><b>${Math.round(c.strideEfficiency * 100)}% free steps</b></div>`;

        const repairBtn = el.querySelector('#garage-repair') as HTMLButtonElement;
        repairBtn.disabled = c.hull >= c.hullMax && c.energy >= c.energyMax;
      };

      updateUI();
      (el.querySelector('#garage-repair') as HTMLButtonElement).onclick = () => {
        if (this.player.shards >= 50) { this.player.shards -= 50; c.restock(); toast('Crawler fully serviced!', 'gold'); updateUI(); }
        else toast('Not enough Shards.', 'red');
      };
      (el.querySelector('#garage-close') as HTMLElement).onclick = () => {
        preview.dispose();
        closeMenu();
        resolve();
      };
    });
    this.busy = false;
    updateHUD(this.player, 'Haven City');
    this.player.save();
    // rebuild the showcase machine so the lift shows your latest build
    this.refreshShowcaseCrawler();
  }

  /** Swap the garage lift's showcase crawler for the player's current build. */
  private refreshShowcaseCrawler(): void {
    if (!this.interiorScene) return;
    const old = this.interiorScene.getObjectByName('showcrawler') as THREE.Group | null;
    if (old) disposeCrawler(old);
    const fresh = makeCrawler({ parts: this.player.crawler.parts, paint: this.player.crawler.paint });
    fresh.position.set(-4, 0.4, -1.5);
    fresh.scale.setScalar(1.15);
    fresh.name = 'showcrawler';
    this.interiorScene.add(fresh);
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
        ? Math.hypot(x, z) <= Town.WALL_R - 2.5
        : Math.abs(x) <= w / 2 - 0.7 && Math.abs(z) <= d / 2 - 0.7;
      const free = (x: number, z: number) =>
        !this.colliders.some(c => Math.hypot(x - c.pos.x, z - c.pos.z) < c.r) &&
        (this.mode !== 'street' || !this.walkers.some(w => Math.hypot(x - w.grp.position.x, z - w.grp.position.z) < 0.85)) &&
        inBounds(x, z);
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
    this.staticNpcs.forEach(npc => updateVoxelHuman(npc, false, dt));

    // wandering townsfolk — they go about their errands and only stop
    // for you while actually talking (no crowding around the player).
    // Everyone walks the same uneven earth: y always comes from groundH.
    if (this.mode === 'street') {
      for (const wlk of this.walkers) {
        wlk.grp.position.y = this.groundH(wlk.grp.position.x, wlk.grp.position.z);
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
          const nextX = wlk.grp.position.x + dir.x * 1.7 * dt;
          const nextZ = wlk.grp.position.z + dir.z * 1.7 * dt;
          const blocked = this.streetColliders.some(c => Math.hypot(nextX - c.pos.x, nextZ - c.pos.z) < c.r + 0.25) ||
                          Math.hypot(nextX - this.tamer.position.x, nextZ - this.tamer.position.z) < 0.85;
          if (blocked) {
            wlk.pause = 0.8;
          } else {
            wlk.grp.position.set(nextX, this.groundH(nextX, nextZ), nextZ);
            wlk.grp.rotation.y = Math.atan2(dir.x, dir.z);
          }
        }
        updateVoxelHuman(wlk.grp, wlk.pause <= 0, dt);
      }

      // guardian pets stroll too, hugging the same terrain
      for (const pet of this.pets) {
        const p = pet.rig.group.position;
        p.y = this.groundH(p.x, p.z);
        if (pet.pause > 0) { pet.pause -= dt; continue; }
        const dir = pet.target.clone().sub(p);
        dir.y = 0;
        if (dir.length() < 0.5) {
          pet.pause = 2 + Math.random() * 5;
          pet.target = this.nextWanderTarget(p);
        } else {
          dir.normalize();
          const nx = p.x + dir.x * 2.1 * dt, nz = p.z + dir.z * 2.1 * dt;
          if (this.streetColliders.some(c => Math.hypot(nx - c.pos.x, nz - c.pos.z) < c.r + 0.2)) {
            pet.pause = 1.2;
          } else {
            p.set(nx, this.groundH(nx, nz), nz);
            pet.rig.group.rotation.y = Math.atan2(dir.x, dir.z);
          }
        }
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
    let daylight = 1, night = 0;
    if (this.mode === 'street') {
      this.dayTime = (this.dayTime + dt / 240) % 1;
      daylight = Math.max(0, Math.sin((this.dayTime - 0.25) * Math.PI * 2));
      night = 1 - Math.min(1, daylight * 1.6);
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
      if (o.name === 'foliage') {
        const ph = (o.parent?.userData.swayPhase as number) ?? 0;
        o.rotation.z = Math.sin(now * 0.0009 + ph) * 0.035;
        o.rotation.x = Math.cos(now * 0.0007 + ph) * 0.025;
      }
      if (o.name === 'banner') { o.rotation.y = Math.sin(now * 0.0016 + o.position.x) * 0.18; }
      if (o.name === 'pondwater') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 0.3 + Math.sin(now * 0.0018) * 0.08;
        o.scale.setScalar(1 + Math.sin(now * 0.0012) * 0.01);
      }
    });

    // ---- the living town: wings, embers, sails, spray ----
    if (this.mode === 'street') {
      const tSec = now / 1000;
      for (const b of this.butterflies) {
        const ph = b.phase + tSec * 0.9;
        b.grp.position.set(
          b.anchor.x + Math.sin(ph * 0.7) * 2.0,
          b.anchor.y + Math.sin(ph * 1.7) * 0.4 + 0.2,
          b.anchor.z + Math.cos(ph * 0.5) * 2.0,
        );
        b.grp.rotation.y = Math.atan2(Math.cos(ph * 0.7) * 1.4, -Math.sin(ph * 0.5));
        const flap = Math.sin(tSec * 18 + b.phase) * 0.9;
        b.wingL.rotation.y = flap;
        b.wingR.rotation.y = -flap;
        b.grp.visible = daylight > 0.18; // butterflies sleep at night
      }
      for (const f of this.fireflies) {
        const ph = f.phase + tSec * 0.5;
        f.mesh.position.set(
          f.anchor.x + Math.sin(ph * 1.1) * 1.4,
          f.anchor.y + Math.sin(ph * 1.9) * 0.5,
          f.anchor.z + Math.cos(ph * 0.8) * 1.4,
        );
        const m = f.mesh.material as THREE.MeshStandardMaterial;
        const blink = 0.5 + Math.sin(tSec * 3.2 + f.phase * 5) * 0.5;
        m.opacity = night * 0.95;
        m.emissiveIntensity = night * (0.6 + blink * 1.8);
        f.mesh.visible = night > 0.1;
      }
      for (const lf of this.fallingLeaves) {
        const cycle = 7;
        const t01 = ((tSec * 0.7 + lf.phase) % cycle) / cycle;
        lf.mesh.position.set(
          lf.anchor.x + Math.sin((tSec + lf.phase) * 1.6) * 0.6,
          lf.anchor.y + lf.h * (1 - t01),
          lf.anchor.z + Math.cos((tSec + lf.phase) * 1.2) * 0.5,
        );
        lf.mesh.rotation.set(tSec * 1.4 + lf.phase, tSec * 1.1, lf.phase);
        (lf.mesh.material as THREE.MeshStandardMaterial).opacity = t01 > 0.92 ? (1 - t01) * 12 : 0.95;
      }
      for (const c of this.clouds) {
        const a = Math.atan2(c.position.z, c.position.x) + dt * 0.006;
        const r = Math.hypot(c.position.x, c.position.z);
        c.position.set(Math.cos(a) * r, c.position.y, Math.sin(a) * r);
      }
      for (const d of this.ducks) {
        d.angle += dt * d.speed;
        const dx = d.center.x + Math.cos(d.angle) * d.r;
        const dz = d.center.z + Math.sin(d.angle) * d.r;
        d.grp.position.set(dx, d.center.y + Math.sin(tSec * 2 + d.r) * 0.025, dz);
        d.grp.rotation.y = Math.atan2(-Math.sin(d.angle), -Math.cos(d.angle)) + Math.PI / 2;
      }
      if (this.windmillHub) this.windmillHub.rotation.z = now * 0.0006;
      if (this.fountainJet) {
        this.fountainJet.scale.y = 1 + Math.sin(now * 0.004) * 0.18;
        (this.fountainJet.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(now * 0.005) * 0.15;
      }
    }

    // ---- labeled minimap ----
    const cv = minimapCanvas();
    if (this.mode === 'street') {
      const hh = Math.floor(this.dayTime * 24), mm = Math.floor((this.dayTime * 24 % 1) * 60);
      drawAreaMap(cv, {
        shape: 'circle', radius: Town.WALL_R + 1,
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
    if (wlk) { showInteractHint(`Press <b>E</b> — chat with ${wlk.name}`); return; }
    const pet = this.nearbyPet();
    showInteractHint(pet ? `Press <b>E</b> — pet ${pet.name}` : null);
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
        return;
      }
      const pet = this.nearbyPet();
      if (pet) {
        const pxx = pet.rig.group.position.x - this.tamer.position.x;
        const pzz = pet.rig.group.position.z - this.tamer.position.z;
        this.tamer.rotation.y = Math.atan2(pxx, pzz);
        pet.rig.group.rotation.y = Math.atan2(-pxx, -pzz);
        say('', pet.line);
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
    updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
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

  /** Madame Celeste's Boutique — a stylish fashion shop with a purple/gold theme. */
  private buildBoutiqueExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 3.6),
      new THREE.MeshStandardMaterial({ map: wallpaperTexture('#5a1a45', '#2e0b22', '#d9a11a', 1), roughness: 0.75 }));
    body.position.y = 1.4;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    
    for (let i = 0; i < 6; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 1.8),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd9a11a : 0x4a1a35, roughness: 0.8 }));
      strip.position.set(-2.15 + i * 0.86, 2.82 - 0.18, 2.55);
      strip.rotation.x = 0.28;
      g.add(strip);
    }
    for (const ax of [-2.3, 2.3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0xd9a11a, metalness: 0.8 }));
      pole.position.set(ax, 1.2, 3.25);
      g.add(pole);
    }
    
    for (const sx of [-1.5, 1.5]) {
      const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xd9a11a, metalness: 0.8 }));
      windowFrame.position.set(sx, 1.3, 1.82);
      const windowGlass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xb8ffd8, transparent: true, opacity: 0.45 }));
      windowGlass.position.set(sx, 1.3, 1.82);
      g.add(windowFrame, windowGlass);
    }
    
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x4a1a35, roughness: 0.8 }));
    sign.position.set(0, 2.2, 1.88);
    const signGoldBorder = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xd9a11a, metalness: 0.9 }));
    signGoldBorder.position.set(0, 2.2, 1.85);
    g.add(sign, signGoldBorder);
    
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.3, 4.1),
      new THREE.MeshStandardMaterial({ color: 0x2e0b22, roughness: 0.8 }));
    roof.position.y = 2.95;
    roof.castShadow = true;
    g.add(roof);
    
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    s.add(g);
    
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.1 });
    this.label3d(s, '🛍️ Boutique', '#b18ae8', new THREE.Vector3(x, 4.5, z));
    this.streetMarkers.push({ x, z, label: '🛍️ Boutique', color: '#b18ae8', kind: 'building' });
    
    const door = new THREE.Vector3(0, 0, 3.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.0,
      label: 'Press <b>E</b> — enter the Boutique',
      handler: () => this.enterService('boutique'),
    });
  }

  /**
   * Madame Celeste's Atelier — wardrobe AND identity. Six wearable slots
   * with live try-on, plus the Style Studio: skin tone, hairstyle and
   * hair color, all mirrored instantly on the fitting-room mannequin.
   */
  private async openBoutique(): Promise<void> {
    await say('Madame Celeste', 'Welcome to the Aurel Atelier, darling! Wardrobe on the left, mirror on the right — and if you want a whole new YOU, ask for the Style Studio. Try on absolutely everything.');
    this.busy = true;

    await new Promise<void>(resolve => {
      const p = this.player;
      const SLOT_ICONS: Record<string, string> = { hat: '🎩', shirt: '👕', pants: '👖', gloves: '🧤', backpack: '🎒', shoes: '👟' };
      type Tab = 'hat' | 'shirt' | 'pants' | 'gloves' | 'backpack' | 'shoes' | 'style';
      let activeTab: Tab = 'shirt';

      // try-on state — committed only on Wear / Adopt
      const previewState = { ...p.equippedClothes };
      const previewApp = { ...p.appearance };

      const el = openScreen(`
        <h3>🛍️ Madame Celeste's Atelier — <span id="boutique-shards" class="goldcol">◆${p.shards} Shards</span></h3>
        <div class="grid2">
          <div>
            <div id="boutique-tabs-container" class="panel-tabs" style="margin-bottom:8px"></div>
            <div id="boutique-list-container" style="max-height:380px;overflow-y:auto;padding-right:4px;"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;background:rgba(0,0,0,0.35);border:1px solid var(--ui-border);border-radius:8px;padding:12px;">
            <h4 style="margin-bottom:8px;color:var(--ui-gold);text-transform:uppercase;font-size:14px;letter-spacing:1px;">Fitting Room</h4>
            <div id="tamer-preview-container" style="width:260px;height:250px;position:relative;overflow:hidden;background:rgba(6,8,16,0.55);border-radius:6px;border:1px solid #2c3666"></div>
            <div class="sub" style="margin-top:6px;font-size:11px;color:var(--ui-dim)">LIVE 3D MIRROR · DRAG TO ROTATE</div>
            <div id="boutique-outfit" style="width:100%;margin-top:10px;font-size:12px"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="ui-btn primary" id="boutique-close">Leave the Atelier</button>
        </div>`);

      const container = el.querySelector('#tamer-preview-container') as HTMLElement;
      const previewHandle = initTamerPreview3D(container, previewState, previewApp);

      const refreshPreview = () => previewHandle.update(previewState, previewApp);

      const updateUI = () => {
        (el.querySelector('#boutique-shards') as HTMLElement).textContent = `◆${p.shards} Shards`;

        // tabs: six wearable slots + the Style Studio
        const slots: Tab[] = ['hat', 'shirt', 'pants', 'gloves', 'backpack', 'shoes'];
        const tabsEl = el.querySelector('#boutique-tabs-container') as HTMLElement;
        tabsEl.innerHTML = slots.map(slot =>
          `<button class="ui-btn tab ${slot === activeTab ? 'primary' : ''}" data-tab-select="${slot}">${SLOT_ICONS[slot]} ${slot.toUpperCase()}</button>`
        ).join('') + `<button class="ui-btn tab ${activeTab === 'style' ? 'primary' : ''}" data-tab-select="style" style="border-color:var(--ui-purple)">✨ STYLE</button>`;
        tabsEl.querySelectorAll<HTMLElement>('[data-tab-select]').forEach(b => b.onclick = () => {
          activeTab = b.dataset.tabSelect as Tab;
          updateUI();
        });

        // mannequin readout
        const outfitEl = el.querySelector('#boutique-outfit') as HTMLElement;
        outfitEl.innerHTML = slots.map(slot => {
          const id = previewState[slot];
          const item = id && id !== 'none' ? CLOTHES_DATABASE[id] : null;
          const changed = previewState[slot] !== p.equippedClothes[slot];
          return `<div class="row" style="display:flex;justify-content:space-between">
            <span class="sub">${SLOT_ICONS[slot]} ${slot}</span>
            <b style="${changed ? 'color:var(--ui-gold)' : ''}">${item ? item.name : '—'}</b></div>`;
        }).join('');

        const listContainer = el.querySelector('#boutique-list-container') as HTMLElement;

        // ===== the Style Studio =====
        if (activeTab === 'style') {
          const skinSw = SKIN_TONES.map(t => `
            <div class="swatch ${previewApp.skin === t.id ? 'sel' : ''}" data-skin="${t.id}" title="${t.name}">
              <span class="swatch-dot" style="background:#${t.id.toString(16).padStart(6, '0')}"></span>
              <span class="swatch-name">${t.name}</span>
            </div>`).join('');
          const hairSw = HAIR_COLORS.map(t => `
            <div class="swatch ${previewApp.hair === t.id ? 'sel' : ''}" data-haircol="${t.id}" title="${t.name}">
              <span class="swatch-dot" style="background:#${t.id.toString(16).padStart(6, '0')}"></span>
              <span class="swatch-name">${t.name}</span>
            </div>`).join('');
          const styles = HAIRSTYLES.map(h => `
            <div class="list-row" style="${previewApp.hairstyle === h.id ? 'border-color:var(--ui-gold);background:rgba(217,161,26,0.08);' : ''}" data-hairstyle="${h.id}">
              <div style="flex:1"><b>${h.name}</b><div class="sub">${h.desc}</div></div>
              ${previewApp.hairstyle === h.id ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022">IN MIRROR</span>' : ''}
            </div>`).join('');
          const changed = previewApp.skin !== p.appearance.skin || previewApp.hair !== p.appearance.hair || previewApp.hairstyle !== p.appearance.hairstyle;
          listContainer.innerHTML = `
            <div class="sub" style="margin-bottom:6px">Celeste circles you once, hums, and opens the studio drawers. All styling is on the house, darling.</div>
            <h3>Skin tone</h3><div class="swatch-row" style="margin-bottom:10px">${skinSw}</div>
            <h3>Hair color</h3><div class="swatch-row" style="margin-bottom:10px">${hairSw}</div>
            <h3>Hairstyle</h3>${styles}
            ${changed ? '<button class="ui-btn gold" id="style-adopt" style="width:100%;margin-top:8px">✨ Adopt this look</button>' : '<div class="sub" style="margin-top:8px">This is your current look.</div>'}`;
          listContainer.querySelectorAll<HTMLElement>('[data-skin]').forEach(b => b.onclick = () => {
            previewApp.skin = parseInt(b.dataset.skin!);
            refreshPreview(); updateUI();
          });
          listContainer.querySelectorAll<HTMLElement>('[data-haircol]').forEach(b => b.onclick = () => {
            previewApp.hair = parseInt(b.dataset.haircol!);
            refreshPreview(); updateUI();
          });
          listContainer.querySelectorAll<HTMLElement>('[data-hairstyle]').forEach(b => b.onclick = () => {
            previewApp.hairstyle = b.dataset.hairstyle as typeof previewApp.hairstyle;
            refreshPreview(); updateUI();
          });
          const adopt = listContainer.querySelector<HTMLElement>('#style-adopt');
          if (adopt) adopt.onclick = () => {
            p.appearance = { ...previewApp };
            updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance);
            toast('A whole new you!', 'gold');
            updateUI();
          };
          return;
        }

        // ===== wardrobe tabs =====
        const items = Object.values(CLOTHES_DATABASE).filter(item => item.slot === activeTab);
        const canBeNone = ['hat', 'gloves', 'backpack'].includes(activeTab);
        let rowsHtml = '';

        if (canBeNone) {
          const nonePreviewed = previewState[activeTab] === 'none' || !previewState[activeTab];
          const noneEquipped = p.equippedClothes[activeTab] === 'none' || !p.equippedClothes[activeTab];
          let actionBtn = '';
          if (noneEquipped) actionBtn = '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>';
          else if (nonePreviewed) actionBtn = '<button class="ui-btn primary" data-wear-none="true">Confirm Remove</button>';
          else actionBtn = '<button class="ui-btn" data-preview-none="true">Try Remove</button>';
          rowsHtml += `
            <div class="list-row" style="${nonePreviewed ? 'border:1px solid var(--ui-green);background:rgba(78,196,94,0.1);' : ''}">
              <div style="flex:1;cursor:pointer" data-preview-none="true">
                <b>None</b>
                <div class="sub">Bare ${activeTab === 'hat' ? 'head' : activeTab === 'gloves' ? 'hands' : 'back'} — let the look breathe.</div>
              </div>
              <div>${actionBtn}</div>
            </div>`;
        }

        rowsHtml += items.map(item => {
          const owned = p.ownedClothes.includes(item.id);
          const equipped = p.equippedClothes[activeTab] === item.id;
          const tryingOn = previewState[activeTab] === item.id;
          let actionBtn = '';
          if (equipped) {
            actionBtn = `<button class="ui-btn danger" data-unequip="${item.id}">Remove</button>`;
          } else if (owned) {
            actionBtn = tryingOn
              ? `<button class="ui-btn primary" data-equip="${item.id}">Wear</button>`
              : `<button class="ui-btn" data-try="${item.id}">Try On</button>`;
          } else {
            const canBuy = p.shards >= item.price;
            actionBtn = tryingOn
              ? `<button class="ui-btn gold" data-buy="${item.id}" ${canBuy ? '' : 'disabled'}>Buy ◆${item.price}</button>`
              : `<div style="display:flex;gap:4px;">
                  <button class="ui-btn" data-try="${item.id}">Try</button>
                  <button class="ui-btn" data-buy="${item.id}" ${canBuy ? '' : 'disabled'}>◆${item.price}</button>
                </div>`;
          }
          const dotColor = item.textureColor ?? (item.color !== undefined ? `#${item.color.toString(16).padStart(6, '0')}` : '#6a7290');
          const styleBadge = item.textureType ? `<span class="tag" style="background:var(--ui-border);color:var(--ui-text);margin-left:5px">${item.textureType.toUpperCase()}</span>` : '';
          const previewBadge = (tryingOn && !equipped) ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022;margin-left:5px">IN MIRROR</span>' : '';
          const equippedBadge = equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022;margin-left:5px">EQUIPPED</span>' : '';
          return `<div class="list-row" style="${tryingOn ? 'border:1px solid var(--ui-gold);background:rgba(217,161,26,0.1);' : ''}">
            <span class="swatch-dot sq" style="background:${dotColor};flex-shrink:0"></span>
            <div style="flex:1;cursor:pointer" data-row-select="${item.id}">
              <b>${item.name}</b> ${styleBadge} ${previewBadge} ${equippedBadge}
              <div class="sub">${item.desc}</div>
            </div>
            <div style="margin-left:10px">${actionBtn}</div>
          </div>`;
        }).join('');

        listContainer.innerHTML = rowsHtml;

        const tryOn = (id: string) => {
          previewState[activeTab] = id;
          refreshPreview(); updateUI();
        };
        listContainer.querySelectorAll<HTMLElement>('[data-try]').forEach(b => b.onclick = e => { e.stopPropagation(); tryOn(b.dataset.try!); });
        listContainer.querySelectorAll<HTMLElement>('[data-row-select]').forEach(r => r.onclick = () => tryOn(r.dataset.rowSelect!));
        listContainer.querySelectorAll<HTMLElement>('[data-preview-none]').forEach(b => b.onclick = e => { e.stopPropagation(); tryOn('none'); });
        listContainer.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          const item = CLOTHES_DATABASE[b.dataset.buy!];
          if (p.shards >= item.price) {
            p.shards -= item.price;
            p.ownedClothes.push(item.id);
            toast(`Bought ${item.name}!`, 'gold');
            tryOn(item.id);
          }
        });
        listContainer.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          p.equippedClothes[activeTab] = b.dataset.equip!;
          toast('Equipped.');
          updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance);
          updateUI();
        });
        listContainer.querySelectorAll<HTMLElement>('[data-wear-none]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          p.equippedClothes[activeTab] = 'none';
          toast('Unequipped.');
          updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance);
          updateUI();
        });
        listContainer.querySelectorAll<HTMLElement>('[data-unequip]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          p.equippedClothes[activeTab] = 'none';
          if (previewState[activeTab] === b.dataset.unequip) previewState[activeTab] = 'none';
          toast('Unequipped.');
          refreshPreview();
          updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance);
          updateUI();
        });
      };

      updateUI();

      (el.querySelector('#boutique-close') as HTMLElement).onclick = () => {
        previewHandle.dispose();
        closeMenu();
        resolve();
      };
    });
    this.busy = false;
    updateHUD(this.player, 'Haven City');
    this.player.save();
  }
}

/** Live turntable preview of a Crawler build — the gait rig keeps it breathing. */
function initCrawlerPreview3D(container: HTMLElement, look: CrawlerLook): { update: (lk: CrawlerLook) => void; dispose: () => void } {
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 260;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 20);
  camera.position.set(0, 1.5, 3.4);
  camera.lookAt(0, 0.6, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff0d0, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5ab8e8, 0.8);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  // service-lift platform
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.16, 22),
    new THREE.MeshStandardMaterial({ color: 0x3a4050, metalness: 0.7, roughness: 0.4 }));
  lift.position.y = -0.08;
  scene.add(lift);
  const liftGlow = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0xe8843a, emissive: 0xe8843a, emissiveIntensity: 1.2 }));
  liftGlow.rotation.x = Math.PI / 2;
  liftGlow.position.y = 0.02;
  scene.add(liftGlow);

  let crawler = makeCrawler(look);
  scene.add(crawler);

  let active = true;
  let lastTime = performance.now();
  let isDragging = false;
  let prevX = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    prevX = e.clientX;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    prevX = e.clientX;
    crawler.rotation.y += dx * 0.015;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(e.pointerId);
    }
  };
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function animate() {
    if (!active) return;
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isDragging) crawler.rotation.y += dt * 0.5; // slow turntable; the rig reads this as a turn and steps along
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  return {
    update: (lk: CrawlerLook) => {
      const rotY = crawler.rotation.y;
      disposeCrawler(crawler);
      crawler = makeCrawler({ parts: { ...(lk.parts ?? {}) }, paint: { ...(lk.paint ?? {}) } });
      crawler.rotation.y = rotY;
      scene.add(crawler);
    },
    dispose: () => {
      active = false;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      disposeCrawler(crawler);
      renderer.dispose();
      canvas.remove();
    },
  };
}

function initTamerPreview3D(
  container: HTMLElement,
  equipped: Record<string, string>,
  appearance?: Parameters<typeof updateTamerAppearance>[2],
): { update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => void; dispose: () => void } {
  const width = container.clientWidth || 260;
  const height = container.clientHeight || 240;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 10);
  camera.position.set(0, 0.95, 2.5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  const tamerGroup = new THREE.Group();
  tamerGroup.position.set(0, 0.1, 0);
  updateTamerAppearance(tamerGroup, equipped, appearance);
  scene.add(tamerGroup);

  let active = true;
  let lastTime = performance.now();
  let isDragging = false;
  let previousPointerX = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    previousPointerX = e.clientX;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousPointerX;
    previousPointerX = e.clientX;
    tamerGroup.rotation.y += deltaX * 0.015;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function animate() {
    if (!active) return;
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (!isDragging) {
      tamerGroup.rotation.y += dt * 0.4;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  return {
    update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => {
      updateTamerAppearance(tamerGroup, eq, app ?? appearance);
    },
    dispose: () => {
      active = false;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      while (tamerGroup.children.length > 0) {
        tamerGroup.remove(tamerGroup.children[0]);
      }
      renderer.dispose();
      canvas.remove();
    }
  };
}
