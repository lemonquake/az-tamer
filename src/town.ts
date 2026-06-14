// ============================================================
// AZ Tamer — Haven City: voxel tamer walking mode, Grand Houses
// with unique exteriors AND enterable interiors, shop, garage,
// sanctum, bounty board, dungeon gate
// ============================================================
import * as THREE from 'three';
import { HOUSES, DUNGEONS, ITEMS, SHOP_STOCK, GEM_STOCK, CRAWLER_PARTS, SPECIES, type DungeonDef, type HouseDef } from './data';
import { Player, Guardian } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, updateTamerFX, setVoxelSeated, makeGuardian, disposeRig, makeCrawler, disposeCrawler,
  makeTree, makeStreetLamp, makeCustomCreature, mulberry, tween,
  plankTexture, stoneTexture, marbleTexture, tileTexture, bookshelfTexture,
  carpetTexture, wallpaperTexture, skyGradient, barkTexture, leafTexture,
  aetherMarbleTexture, legendFriezeTexture, emberCrackTexture,
  caveRockTexture, stormPanelTexture, stormSeamEmissive, groundTexture,
  makeGuideBeacon, type BeaconRig,
  HAIRSTYLES, SKIN_TONES, HAIR_COLORS, type GuardianRig, type TreeKind, type CrawlerLook,
} from './models';
import { LEGENDS, WORLD_CIRCUIT, LEGEND_GUARDIANS, DAUGHTERS, AIRAH, ALJAY_HIDEOUTS } from './lore';
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
import { worldOrbit } from './camorbit';
import { tagNpc, crowdName, attachNpcPicker } from './npccard';
import { runCityTutorial, isTutorialOpen } from './tutorial';
import { worldClock, DayNightRig } from './daynight';
import { sfx } from './audio';
import { cDesk, cFountain, cReadingDesk, cColumnSconces, cHangingBanner, cTelescope, cPainting } from './aurelian_hall_helpers';

const minimapCanvas = () => document.getElementById('minimap') as HTMLCanvasElement;

/** A one-liner NPC who picks a random remark each time you speak to them. */
const proudHall = (name: string, lines: string[]) =>
  async () => { await say(name, lines[Math.floor(Math.random() * lines.length)]); };

interface Interactable {
  pos: THREE.Vector3; radius: number; label: string;
  handler: () => Promise<void>;
}

/**
 * A walking obstacle. `y0`/`y1` make it floor-aware: when present, the
 * collider only blocks while the player's height sits within the band
 * (used by the Mayor's Office, where a desk on one storey must not stop
 * you on the storey above it). Omit them for a full-height obstacle.
 */
interface Collider { pos: THREE.Vector3; r: number; y0?: number; y1?: number; }

/**
 * One node of the Aurelian Hall's room-graph. Each floor and each side room is
 * its own self-contained scene; the player teleports between them through
 * stairs (floors) and doors (rooms), exactly the way the University hub swaps
 * rooms. There is no physical climbing — verticality is the fiction, the
 * mechanism is an instant scene-swap.
 */
interface HallRoom {
  scene: THREE.Scene;
  w: number; d: number;                 // walkable bounds (rect, centered on origin)
  interactables: Interactable[];
  colliders: Collider[];
  npcs: THREE.Group[];
  markers: MapMarker[];
  spawn: THREE.Vector3;                 // default arrival point
  spawnRotY: number;
  camH: number; camD: number;           // third-person camera frame for this room
  title: string;                        // minimap + toast label
}
type HallId = 'f1' | 'registry' | 'f2' | 'archives' | 'mayors' | 'f3' | 'office';

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
  private streetColliders: Collider[] = [];
  private intInteractables: Interactable[] = [];
  private intColliders: Collider[] = [];
  private intNpcs: THREE.Group[] = [];
  private intRigs: GuardianRig[] = [];
  private intRoom = { w: 18, d: 13 };
  /** Walkable terrain height inside an interior (stairs, raised daises). Null = flat floor. */
  private intGroundH: ((x: number, z: number) => number) | null = null;
  // multi-storey interiors (the Mayor's Office): the camera rides up the
  // stairs with the player and the minimap tracks the current floor.
  private intCamRig: 'room' | 'tower' = 'room';
  private intFloors = 1;          // storeys stacked in y
  private intFloorH = 6;          // vertical spacing between storeys
  private intFloorMarkers: MapMarker[][] | null = null;  // per-storey minimap markers
  private intFloorNames: string[] = [];
  // storeys 1..N of a tower interior, hidden when the player is below them so
  // the upper floor plates never box in / obstruct the storey you're standing on
  private intUpperFloors: THREE.Group[] = [];
  private exitSpot = new THREE.Vector3();

  // labeled minimap markers
  private streetMarkers: MapMarker[] = [];
  private intMarkers: MapMarker[] = [];
  private intName = '';
  // overridable third-person camera frame for the flat 'room' rig — grand halls
  // sit the camera higher and further back than the little shops do.
  private intCamH = 5.6;
  private intCamD = 6.4;

  // The Aurelian Hall — a University-style room-graph. Each floor and side room
  // is its own scene; stairs and doors swap the active scene for an instant
  // floor change. Built whole on entry, torn down on exit.
  private hallRooms: Map<HallId, HallRoom> | null = null;
  private hallCurrent: HallId = 'f1';

  // day/night cycle — driven by the shared world clock (see daynight.ts)
  private sun: THREE.DirectionalLight | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private dayNight: DayNightRig | null = null;

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
  private birds: { grp: THREE.Group; angle: number; r: number; center: THREE.Vector3; speed: number; wingL: THREE.Object3D; wingR: THREE.Object3D }[] = [];
  private windmillHub: THREE.Object3D | null = null;
  private fountainJet: THREE.Mesh | null = null;

  private resolveExit: ((dest: 'expedition' | 'university' | 'terra') => void) | null = null;

  // The Aetherline Skyport — the city-side approach causeway is studded with
  // guide-lights that "run" toward the station; they pulse as a travelling wave
  // animated in the street update. `u` is each light's 0→1 position down the
  // causeway (0 = plaza end, 1 = station end), so the crest flows stationward.
  private podway: { mat: THREE.MeshStandardMaterial; u: number; amp: number }[] = [];
  private podwayT = 0;
  // The floating Pod capsule + its docking glow — animated in the per-frame
  // traverse via named hooks; kept here only so exitHouse can let them go.
  private podHover: THREE.Object3D | null = null;

  // quest guidance beacons — flashing pillars on wherever the story
  // wants the player next (shuttle, Gate, the Houses, the fountain)
  private guideBeacons: { key: string; rig: BeaconRig }[] = [];
  private guideTimer = 0;

  // light budget: the forward renderer evaluates every visible point light
  // in every material's shader, so the street's ~46 lamps/braziers/glows
  // tank the frame rate. Only the nearest few stay lit each frame.
  private static readonly MAX_POINT_LIGHTS = 10;
  private litScene: THREE.Scene | null = null;
  private scenePointLights: THREE.PointLight[] = [];

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
  private get colliders(): Collider[] { return this.mode === 'street' ? this.streetColliders : this.intColliders; }

  /** Reset the multi-storey rig to a flat single-room interior. Each interior builder calls this up front. */
  private resetInteriorRig(): void {
    this.intGroundH = null;
    this.intCamRig = 'room';
    this.intFloors = 1;
    this.intFloorH = 6;
    this.intFloorMarkers = null;
    this.intFloorNames = [];
    this.intUpperFloors = [];
    this.intCamH = 5.6;
    this.intCamD = 6.4;
  }

  /** Which storey a height sits on, clamped to the building's range. */
  private intFloorOf(y: number): number {
    return Math.max(0, Math.min(this.intFloors - 1, Math.round(y / this.intFloorH)));
  }

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
    [14, 7, 36, 17, 2.4],     // road from garage to Mayor's Office
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
    win.name = 'nightwindow'; // the miller's lamp burns brightest after dark
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

  /** The hilltop gazebo crowning the west park — the city's favorite resting spot. */
  private buildGazebo(x: number, z: number): void {
    const s = this.streetScene;
    const baseY = this.groundH(x, z);
    const g = new THREE.Group();
    const stoneM = new THREE.MeshStandardMaterial({ map: stoneTexture('#9a93a8', '#5a5468', 2), roughness: 0.9 });
    const woodM = new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 2), roughness: 0.85 });
    // two stone steps up to an octagonal dais
    for (let i = 0; i < 2; i++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(3.0 - i * 0.4, 3.2 - i * 0.4, 0.22, 8), stoneM);
      step.position.y = 0.11 + i * 0.2;
      step.receiveShadow = true;
      g.add(step);
    }
    // six carved posts and a low railing between them (south gap = the way in)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.cos(a) * 2.1, pz = Math.sin(a) * 2.1;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.3, 8), woodM);
      post.position.set(px, 1.55, pz);
      post.castShadow = true;
      g.add(post);
      const a2 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      const qx = Math.cos(a2) * 2.1, qz = Math.sin(a2) * 2.1;
      // leave the rail out on the side facing the plaza — that's the way in
      const mid = Math.atan2((pz + qz) / 2, (px + qx) / 2);
      if (!(mid > -1.0 && mid < 0.2)) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(qx - px, qz - pz), 0.08, 0.08), woodM);
        rail.position.set((px + qx) / 2, 1.05, (pz + qz) / 2);
        rail.rotation.y = -Math.atan2(qz - pz, qx - px);
        g.add(rail);
      }
    }
    // shingled cone roof with a finial
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.5, 8),
      new THREE.MeshStandardMaterial({ map: plankTexture('#8a3a2a', 3), roughness: 0.8 }));
    roof.position.y = 3.4;
    roof.castShadow = true;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0xc9a24a, emissiveIntensity: 0.5 }));
    finial.position.y = 4.3;
    g.add(roof, finial);
    // the lantern under the eaves — lit by the lamplighters at dusk
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 0.2 }));
    lantern.name = 'lampOrb';
    lantern.position.y = 2.5;
    const lLight = new THREE.PointLight(0xffc46a, 0, 9);
    lLight.name = 'streetlamp';
    lLight.position.y = 2.5;
    g.add(lantern, lLight);
    // a bench inside, facing the city
    g.position.set(x, baseY, z);
    s.add(g);
    this.addBench(x, z, Math.atan2(-x, -z));
    // post colliders (walkable interior — only the ring blocks)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      this.streetColliders.push({ pos: new THREE.Vector3(x + Math.cos(a) * 2.1, 0, z + Math.sin(a) * 2.1), r: 0.28 });
    }
    this.label3d(s, '🏞️ Hilltop Gazebo', '#c2d8a8', new THREE.Vector3(x, baseY + 5.4, z), 3.6);
    this.streetMarkers.push({ x, z, label: 'Gazebo', color: '#c2d8a8', kind: 'poi' });
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z + 2.4), radius: 2.2,
      label: 'Press <b>E</b> — take in the view',
      handler: async () => {
        const hour = worldClock.t;
        if (hour > 0.74 || hour < 0.26) {
          await say('', 'The city below is a constellation of lamplight — every road a string of warm stars, the fountain a blue heartbeat at the center. Nyla was right about this place.');
        } else if (hour > 0.6) {
          await say('', 'From up here the dusk pours honey over the rooftops. The lamplighters are already out; you can trace their progress lamp by lamp down the east road.');
        } else {
          await say('', 'The whole of Haven City spreads below — the walls, the windmill turning, the Coliseum banners, the five Grand Houses on their stone shoulder. Worth every step of the climb.');
        }
      },
    });
  }

  /** The Founders' Bell — rung once at the city's founding, and by every passing child since. */
  private buildFoundersBell(x: number, z: number): void {
    const s = this.streetScene;
    const baseY = this.groundH(x, z);
    const g = new THREE.Group();
    const stoneM = new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#4a4458', 2), roughness: 0.9 });
    for (const side of [-0.65, 0.65]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.6, 0.34), stoneM);
      pillar.position.set(side, 1.3, 0);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.26, 0.4), stoneM);
    crossbeam.position.y = 2.7;
    g.add(crossbeam);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.85, roughness: 0.35 }));
    bell.position.y = 2.25;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.7 }));
    clapper.position.y = 1.95;
    g.add(bell, clapper);
    g.position.set(x, baseY, z);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.9 });
    this.streetMarkers.push({ x, z, label: 'Founders\' Bell', color: '#c9892a', kind: 'poi' });
    this.label3d(s, '🔔 The Founders\' Bell', '#e8c47a', new THREE.Vector3(x, baseY + 4.0, z), 3.4);
    let ringing = false;
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z + 1.2), radius: 1.8,
      label: 'Press <b>E</b> — ring the Founders\' Bell',
      handler: async () => {
        if (!ringing) {
          ringing = true;
          sfx('confirm');
          tween(1400, k => { bell.rotation.z = Math.sin(k * Math.PI * 7) * (1 - k) * 0.45; }).then(() => { ringing = false; });
        }
        await say('', 'BONNNG. The note rolls down the streets and comes back off the walls a half-second later — the masons tuned the battlements to answer it, or so they claim.');
        await say('', 'A worn plaque: "Rung at the founding, rung at the Reforging, rung the morning the three came home from Ghandra. Ring it whenever the city should look up."');
      },
    });
  }

  /** Festival string lights swooping between the plaza's grand lamps. */
  private buildStringLights(): void {
    const s = this.streetScene;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 8.6, z = Math.sin(a) * 8.6;
      pts.push(new THREE.Vector3(x, this.groundH(x, z) + 3.1, z));
    }
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 0.25 });
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const linePts: THREE.Vector3[] = [];
      const STEPS = 12;
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.9; // the swoop of the wire
        linePts.push(p);
        if (k > 0 && k < STEPS && k % 2 === 0) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bulbMat);
          bulb.name = 'lampOrb';
          bulb.position.copy(p).y -= 0.1;
          s.add(bulb);
        }
      }
      const wire = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: 0x1c1c26 }));
      s.add(wire);
    }
  }

  /** Low dry-stone terraces holding the windmill hill's south face. */
  private buildHillTerraces(cx: number, cz: number): void {
    const s = this.streetScene;
    const stoneM = new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8276', '#5a544a', 1), roughness: 0.95 });
    for (const [ring, a0, a1] of [[5.2, 2.6, 4.2], [7.0, 2.4, 4.5]] as const) {
      const segs = Math.ceil((a1 - a0) / 0.28);
      for (let i = 0; i <= segs; i++) {
        const a = a0 + (a1 - a0) * (i / segs);
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.5), stoneM);
        block.position.set(x, this.groundH(x, z) + 0.12, z);
        block.rotation.y = -a + Math.PI / 2;
        block.rotation.z = (Math.random() - 0.5) * 0.06;
        block.castShadow = block.receiveShadow = true;
        s.add(block);
      }
    }
    // a few wildflowers tucked along the terrace lips
    for (let i = 0; i < 10; i++) {
      const a = 2.5 + Math.random() * 1.9;
      const ring = 5.2 + (i % 2) * 1.8;
      const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * (ring - 0.6);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
        new THREE.MeshStandardMaterial({ color: [0xe85a8a, 0xf2d23a, 0xf2f2f2][i % 3], emissive: 0x222222, roughness: 0.8 }));
      bloom.position.set(x, this.groundH(x, z) + 0.22, z);
      s.add(bloom);
    }
  }

  /** Market clutter — crates, barrels and sacks that make the plaza look worked-in. */
  private buildMarketClutter(): void {
    const s = this.streetScene;
    const crateM = new THREE.MeshStandardMaterial({ map: plankTexture('#a87848', 1), roughness: 0.9 });
    const spots: [number, number][] = [[8.1, -5.2], [-8.3, -4.4], [-12.2, 9.4], [12.4, 9.6]];
    for (const [bx, bz] of spots) {
      const y = this.groundH(bx, bz);
      for (let i = 0; i < 3; i++) {
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), crateM);
        c2.position.set(bx + (i % 2) * 0.6 - 0.3, y + 0.28 + Math.floor(i / 2) * 0.56, bz + (i % 2 ? 0.15 : -0.2));
        c2.rotation.y = i * 0.4;
        c2.castShadow = true;
        s.add(c2);
      }
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 10),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.9 }));
      barrel.position.set(bx - 0.8, y + 0.35, bz + 0.4);
      barrel.castShadow = true;
      s.add(barrel);
      this.streetColliders.push({ pos: new THREE.Vector3(bx, 0, bz), r: 1.1 });
    }
    // a picnic blanket by the pond, basket and all
    {
      const bx = -21.5, bz = 26.5;
      const y = this.groundH(bx, bz);
      const blanket = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5),
        new THREE.MeshStandardMaterial({ map: carpetTexture('#a83a3a', '#f2ead0', 1), roughness: 1 }));
      blanket.rotation.x = -Math.PI / 2;
      blanket.rotation.z = 0.4;
      blanket.position.set(bx, y + 0.02, bz);
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.26, 9),
        new THREE.MeshStandardMaterial({ map: plankTexture('#a87848', 1), roughness: 0.95 }));
      basket.position.set(bx + 0.5, y + 0.15, bz - 0.3);
      s.add(blanket, basket);
    }
  }

  /** Gulls and songbirds riding lazy circles over the plaza and pond. */
  private spawnBirds(): void {
    const centers: [number, number, number][] = [[0, 0, 11], [-26, 30, 8], [30, -16, 13], [10, 30, 9]];
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      const col = i % 2 ? 0xf2f2f2 : 0x4a4452;
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
      body.rotation.x = Math.PI / 2;
      const mkWing = (side: 1 | -1) => {
        const pivot = new THREE.Group();
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, side: THREE.DoubleSide }));
        wing.position.x = side * 0.27;
        pivot.add(wing);
        grp.add(pivot);
        return pivot;
      };
      const wingL = mkWing(1), wingR = mkWing(-1);
      grp.add(body);
      const [cx, cz, h] = centers[i];
      this.streetScene.add(grp);
      this.birds.push({
        grp, angle: Math.random() * Math.PI * 2, r: 5 + Math.random() * 6,
        center: new THREE.Vector3(cx, h + Math.random() * 3, cz),
        speed: (0.22 + Math.random() * 0.18) * (i % 2 ? 1 : -1), wingL, wingR,
      });
    }
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
   * The Aurelian Hall — Mayor Airah's civic seat, and the tallest pale-stone
   * tower in Haven outside the Coliseum. Three storeys of limestone and gold
   * behind a four-column portico, crowned by a great glass lantern that burns
   * gold all night: the Lantern of Haven, lit (the city says) so the Dawnflame
   * can always find his way home. Civic banners of gold and dawn-rose drape the
   * façade. The door glows; the people are proud; the Mayor is in.
   */
  private buildMayorOfficeExterior(x: number, z: number): void {
    const s = this.streetScene;
    const g = new THREE.Group();
    const limestone = new THREE.MeshStandardMaterial({ map: stoneTexture('#d8d1de', '#aaa0ba', 4), roughness: 0.78 });
    const trimStone = new THREE.MeshStandardMaterial({ map: stoneTexture('#ece6ee', '#bcb3c8', 2), roughness: 0.72 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 });
    const rose = 0xe85a8a;
    const FL = 4.6;             // one civic storey — the eye should count three of them rising

    // --- ceremonial stylobate: a broad plinth fronted by a wide sweep of steps ---
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(15, 1.2, 13.5), trimStone);
    plinth.position.set(0, 0.6, 0);
    plinth.receiveShadow = true;
    g.add(plinth);
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(8.6 - i * 0.7, 0.3, 0.9), trimStone);
      step.position.set(0, 0.15 + i * 0.3, 6.9 + (4 - i) * 0.8);
      step.receiveShadow = true;
      g.add(step);
    }

    // --- the main block: three clear storeys, a projecting central bay for depth ---
    const mainW = 13, mainD = 11, top = 1.2 + FL * 3;
    const body = new THREE.Mesh(new THREE.BoxGeometry(mainW, FL * 3, mainD), limestone);
    body.position.set(0, 1.2 + FL * 1.5, 0);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const bay = new THREE.Mesh(new THREE.BoxGeometry(7.4, FL * 3, 1.3), limestone);
    bay.position.set(0, 1.2 + FL * 1.5, mainD / 2 + 0.45);
    bay.castShadow = true;
    g.add(bay);

    // gold cornice band at the TOP of every storey — the floors made legible from the plaza
    for (let f = 1; f <= 3; f++) {
      const corn = new THREE.Mesh(new THREE.BoxGeometry(mainW + 0.6, 0.42, mainD + 0.6), gold);
      corn.position.set(0, 1.2 + FL * f, 0);
      g.add(corn);
    }
    // full-height gold pilasters dividing the façade into bays
    for (const px of [-5.4, -2.0, 2.0, 5.4]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.4, FL * 3, 0.3), gold);
      pil.position.set(px, 1.2 + FL * 1.5, mainD / 2 + 0.06);
      g.add(pil);
    }

    // tall ARCHED windows, one row per storey on the front + both flanks (glow after dark)
    const winMat = () => new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 0.2, roughness: 0.6 });
    for (let f = 0; f < 3; f++) {
      const cy = 1.2 + f * FL + FL * 0.52;
      for (const wx of [-3.7, 0, 3.7]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, FL * 0.46), winMat());
        win.position.set(wx, cy, mainD / 2 + 0.48);
        win.name = 'nightwindow';
        const arch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16, 0, Math.PI), winMat());
        arch.position.set(wx, cy + FL * 0.23, mainD / 2 + 0.48);
        arch.name = 'nightwindow';
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.2, FL * 0.46 + 0.3, 0.1), gold);
        fr.position.set(wx, cy, mainD / 2 + 0.45);
        g.add(win, arch, fr);
      }
      for (const sx of [-mainW / 2 - 0.04, mainW / 2 + 0.04]) {
        for (const wz of [-2.6, 2.6]) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, FL * 0.44), winMat());
          win.position.set(sx, cy, wz);
          win.rotation.y = Math.PI / 2;
          win.name = 'nightwindow';
          g.add(win);
        }
      }
    }

    // --- a grand hexastyle portico shading the entrance (front, +z) ---
    for (const px of [-5.6, -3.4, -1.2, 1.2, 3.4, 5.6]) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, FL * 1.92, 14), trimStone);
      shaft.position.set(px, 1.2 + FL * 0.96, 6.5);
      shaft.castShadow = true;
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.46, 0.4, 14), gold);
      capital.position.set(px, 1.2 + FL * 1.92, 6.5);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 0.4, 14), trimStone);
      base.position.set(px, 1.4, 6.5);
      g.add(shaft, capital, base);
    }
    // entablature + a broad triangular pediment crowning the portico
    const entab = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1.3, 2.0), trimStone);
    entab.position.set(0, 1.2 + FL * 2 + 0.2, 6.5);
    const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.6, 2.0, 3), trimStone);
    pediment.rotation.y = Math.PI / 2;
    pediment.position.set(0, 1.2 + FL * 2 + 1.85, 6.5);
    pediment.scale.z = 0.32;
    g.add(entab, pediment);
    // the civic seal roundel set in the tympanum
    const seal = new THREE.Mesh(new THREE.CircleGeometry(0.98, 28),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xc9a24a, emissiveIntensity: 0.5, roughness: 0.4 }));
    seal.position.set(0, 1.2 + FL * 2 + 1.05, 7.42);
    const sealRing = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.1, 8, 28), gold);
    sealRing.position.set(0, 1.2 + FL * 2 + 1.05, 7.45);
    seal.name = 'stormtip'; // slow glint
    g.add(seal, sealRing);

    // --- the glowing entrance portal, deep beneath the portico ---
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 0.6), gold);
    lintel.position.set(0, 5.5, 5.95);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.8),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    doorway.position.set(0, 2.8, 6.0);
    doorway.name = 'portal';
    g.add(lintel, doorway);

    // --- dawn-rose & gold civic banners hung down the façade ---
    for (const [bx, col] of [[-5.8, 0xf2c14e], [5.8, rose], [-3.4, rose], [3.4, 0xf2c14e]] as const) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5.0),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.22, roughness: 0.85, side: THREE.DoubleSide }));
      banner.position.set(bx, 5.6, mainD / 2 + 0.52);
      banner.name = 'banner';
      g.add(banner);
    }

    // --- a balustraded roof terrace ringing the top storey (the Mayor's high walk) ---
    const attic = new THREE.Mesh(new THREE.BoxGeometry(mainW - 1.2, 1.0, mainD - 1.2), trimStone);
    attic.position.set(0, top + 0.5, 0);
    g.add(attic);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), trimStone);
      bal.position.set(Math.cos(a) * 6.1, top + 1.45, Math.sin(a) * 5.1);
      g.add(bal);
    }

    // --- THE LANTERN OF HAVEN: a great octagonal glass lantern, ever-lit ---
    const lanternY = top + 3.5;
    const cupBase = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.6, 0.9, 8), trimStone);
    cupBase.position.set(0, lanternY - 1.7, 0);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 1.0, transparent: true, opacity: 0.78, roughness: 0.3 }));
    lantern.position.set(0, lanternY, 0);
    lantern.name = 'lampOrb';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), gold);
      rib.position.set(Math.cos(a) * 1.8, lanternY, Math.sin(a) * 1.8);
      g.add(rib);
    }
    const cupRoof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.8, 8), gold);
    cupRoof.position.set(0, lanternY + 2.2, 0);
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
      new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffcf7a, emissiveIntensity: 1.2 }));
    finial.position.set(0, lanternY + 3.4, 0);
    finial.name = 'stormtip';
    const lanternLight = new THREE.PointLight(0xffd98a, 24, 36);
    lanternLight.position.set(0, lanternY, 0);
    lanternLight.name = 'streetlamp'; // dims by day, blazes by night with the others
    g.add(cupBase, lantern, cupRoof, finial, lanternLight);

    // --- entrance braziers flanking the foot of the steps ---
    for (const side of [-5.6, 5.6]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a3344 }));
      stem.position.set(side, 2.1, 7.8);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.5, 10), gold);
      bowl.position.set(side, 3.3, 7.8);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0xffb45a, emissive: 0xff8a3a, emissiveIntensity: 1.4 }));
      flame.position.set(side, 4.0, 7.8);
      flame.name = 'flame';
      const fl = new THREE.PointLight(0xffa54a, 10, 9);
      fl.position.set(side, 4.2, 7.8);
      fl.name = 'streetlamp';
      g.add(stem, bowl, flame, fl);
    }

    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z); // entrance faces the plaza
    s.add(g);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 7.6 });
    this.label3d(s, '🏛️ Mayor’s Office', '#f2c14e', new THREE.Vector3(x, 25.2, z), 7.2);
    this.streetMarkers.push({ x, z, label: '🏛️ Mayor', color: '#f2c14e', kind: 'building' });
    const door = new THREE.Vector3(0, 0, 9.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetMarkers.push({ x: door.x, z: door.z, color: '#e8d9a8', kind: 'door' });
    this.streetInteractables.push({
      pos: door, radius: 3.2,
      label: 'Press <b>E</b> — enter the Mayor’s Office',
      handler: () => this.enterMayorOffice(),
    });
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
    this.dayNight = new DayNightRig(s, sun, this.ambient);

    // ---- ground: a true heightfield, displaced by groundH ----
    // Painted grass, dirt roads and pond — then every vertex is lifted onto
    // the same terrain function the player and NPCs walk on.
    const R = Town.CITY_R;
    const groundGeo = new THREE.PlaneGeometry(R * 2, R * 2, 112, 112);
    groundGeo.rotateX(-Math.PI / 2);
    {
      const pos = groundGeo.attributes.position as THREE.BufferAttribute;
      // hand-painted earth: sun-bleached hilltops, damp hollows, dusty road
      // verges and a per-vertex speckle so no two square meters read alike
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      const verge = new THREE.Color('#c9b289');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        let y = this.groundH(x, z);
        // the stone terrace box IS the visible floor of the Grand Houses' seat;
        // inside its footprint the painted ground tucks just beneath it so the
        // two coplanar surfaces never z-fight
        if (z <= -24 && z >= -42.5 && Math.abs(x) <= 27.5) y -= 0.08;
        pos.setY(i, y);
        c.setRGB(1, 1, 1);
        const dRoad = this.distToRoad(x, z);
        if (dRoad > 0 && dRoad < 1.5) c.lerp(verge, (1 - dRoad / 1.5) * 0.32); // trodden verges
        c.offsetHSL(0, 0, Math.max(-0.08, Math.min(0.07, y * 0.032)));         // hills catch light, basins hold shade
        const v = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
        c.offsetHSL(0, 0, (v - 0.5) * 0.05);                                    // speckle
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      groundGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(groundGeo,
      new THREE.MeshStandardMaterial({ map: this.cityGroundTexture(R), vertexColors: true, roughness: 1 }));
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
    HOUSES.slice(0, 5).forEach((h, i) => {
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
      // benches facing the fountain — all four of them, properly
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const bx = Math.cos(a) * 4.6, bz = Math.sin(a) * 4.6;
        this.addBench(bx, bz, Math.atan2(-bx, -bz));
      }
      // market stalls on the plaza's south rim
      this.addMarketStall(6.4, -6.6, [0xd84a3a, 0xf2ead0], 'fruit');
      this.addMarketStall(-6.8, -5.8, [0x3a9df2, 0xf2ead0], 'fish');
      // festival string lights between the grand lamps
      this.buildStringLights();
      // worked-in market clutter and the pond picnic
      this.buildMarketClutter();
    }

    // ---- the Founders' Bell, on the plaza's north-west shoulder ----
    this.buildFoundersBell(-9.5, -2.5);

    // ---- unique merchant district ----
    this.buildShopExterior(-14, 7);
    this.buildGarageExterior(14, 7);
    this.buildSanctumExterior(0, 18);
    this.buildBoutiqueExterior(-14, -7);
    this.buildBountyKiosk(8, 6);

    // ---- the Grand Coliseum, north-east — twice the arena it used to be ----
    this.buildColiseumExterior(28, -17);

    // ---- the Aurelian Hall: Mayor Airah's civic seat, east on the grand avenue ----
    this.buildMayorOfficeExterior(36, 17);

    // ---- Legends' Rest: the heroes' memorial park, north-west corner ----
    this.buildLegendsPark(-36, -28);

    // ---- the pond: water, lilies, reeds, ducks, a fishing pier ----
    this.buildPond(-26, 30);

    // ---- the windmill on its hill, held by dry-stone terraces ----
    this.buildWindmill(32, 28);
    this.buildHillTerraces(32, 28);

    // ---- the hilltop gazebo crowning the west park ----
    this.buildGazebo(-36, 16);

    // ---- street lamps: marching down every road, alternating sides ----
    // (placed after the buildings so the lamplighters route around them)
    this.placeRoadLamps();

    // ---- real trees: oaks, pines, birches and one blossom grove ----
    const TREES: [number, number, TreeKind][] = [
      [-22, 12, 'oak'], [-30, 20, 'oak'], [-33, 8, 'pine'], [-38, 22, 'pine'], [-42, 12, 'pine'],
      [22, 12, 'oak'], [27, 7, 'birch'], [44, 18, 'pine'],
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

    // ---- guardian pets strolling the lanes, birds on the wind ----
    this.spawnPets();
    this.spawnBirds();

    // ---- the Aetherline Skyport — west: a lit causeway to the floating Pod ----
    this.buildSkyport();

    // ---- townsfolk out on their errands, and the ones happily idle ----
    this.spawnWalkers();
    this.spawnIdlers();

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
      tagNpc(g, d.name);
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
      tagNpc(grp, f.name);
      // find a clear doorstep: never on the player's spawn, never inside a
      // collider, never shoulder-to-shoulder with another walker
      let x = 0, z = 14;
      for (let tries = 0; tries < 40; tries++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 22;
        const cx = Math.cos(a) * r, cz = Math.abs(Math.sin(a) * r);
        if (Math.hypot(cx, cz - 6.8) < 5.5) continue;            // the player arrives here
        if (this.streetColliders.some(c => Math.hypot(cx - c.pos.x, cz - c.pos.z) < c.r + 0.8)) continue;
        if (this.walkers.some(w => Math.hypot(cx - w.grp.position.x, cz - w.grp.position.z) < 2.6)) continue;
        x = cx; z = cz;
        break;
      }
      grp.position.set(x, this.groundH(x, z), z);
      this.streetScene.add(grp);
      // already mid-errand from the first frame — no standing-around wind-up
      this.walkers.push({
        grp, target: this.nextWanderTarget(grp.position), pause: 0,
        name: f.name, lines: f.lines, talking: false,
      });
    }
  }

  /**
   * The city's idle life: bench-sitters by the fountain, neighbors deep in
   * gossip, a kid feeding the ducks. They're living their roles from the very
   * first frame — nobody waits for a script to remember them.
   */
  private spawnIdlers(): void {
    const s = this.streetScene;
    type Palette = Parameters<typeof makeVoxelHuman>[0];

    const idler = (palette: Palette, x: number, z: number, rotY: number, name: string,
      lines: string[], seated = false, seatY = 0.5): THREE.Group => {
      const g = makeVoxelHuman(palette);
      g.position.set(x, this.groundH(x, z), z);
      g.rotation.y = rotY;
      if (seated) setVoxelSeated(g, true, seatY);
      tagNpc(g, name);
      s.add(g);
      this.staticNpcs.push(g);
      this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.5 });
      this.streetInteractables.push({
        pos: new THREE.Vector3(x, 0, z), radius: 1.7,
        label: `Press <b>E</b> — chat with ${name}`,
        handler: async () => { await say(name, lines[Math.floor(Math.random() * lines.length)]); },
      });
      return g;
    };

    const bubble = (x: number, y: number, z: number) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const ctx = cv.getContext('2d')!;
      ctx.font = '92px serif';
      ctx.textAlign = 'center';
      ctx.fillText('💬', 64, 94);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.9 }));
      sp.renderOrder = 39;
      sp.name = 'chatbubble';
      sp.userData.baseScale = 0.5;
      sp.scale.set(0.5, 0.5, 1);
      sp.position.set(x, y, z);
      s.add(sp);
    };

    /** Two neighbors locked in conversation — walk up and listen in. */
    const pair = (aP: Palette, bP: Palette, ax: number, az: number, bx: number, bz: number,
      aName: string, bName: string, scripts: [string, string][][]) => {
      const aG = idler(aP, ax, az, Math.atan2(bx - ax, bz - az), aName, ['(They glance over mid-sentence, nod, and carry on.)']);
      const bG = idler(bP, bx, bz, Math.atan2(ax - bx, az - bz), bName, ['(They wave a hand without breaking the argument.)']);
      void aG; void bG;
      bubble((ax + bx) / 2, this.groundH(ax, az) + 2.5, (az + bz) / 2);
      this.streetInteractables.push({
        pos: new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2 + 1.0), radius: 1.9,
        label: 'Press <b>E</b> — listen in',
        handler: async () => {
          const script = scripts[Math.floor(Math.random() * scripts.length)];
          await conversation(script);
        },
      });
    };

    // ---- bench-sitters by the fountain ----
    idler({ top: 0x7a8a9a, hair: 0xd8d8d8, cap: null, hairstyle: 'bald' },
      4.6, 0, Math.atan2(-4.6, 0), 'Old Maro', [
        'Sixty years I\'ve sat on this bench. The fountain\'s changed twice, the benches four times, the view never. Sit a minute — the city does the talking.',
        'See the daughters by the fountain? Aljay used to wait on this exact bench when the Houses kept him late. Some families just belong to this plaza.',
        'My knees forecast better than the stargazer. Rain in two days. The lamplighters already know; they trim the wicks short before a wet week.',
      ], true);
    idler({ top: 0xd9a14a, hair: 0xc8c8d0, cap: null, hairstyle: 'buns' },
      0, 4.6, Math.PI, 'Granny Essa', [
        'I feed the gulls at noon, the fish at one, and the gossip mill all day long. Busy retirement.',
        'That windmill ground the flour for my wedding bread, dear. And my mother\'s. Hills remember what people forget.',
        'You walk like you carry half the world. Put it on the bench a moment. The bench doesn\'t mind. Benches never do.',
      ], true);

    // ---- gossip by the market lane ----
    pair(
      { top: 0xb05a8a, hair: 0x6a3a1a, cap: null, hairstyle: 'long' },
      { top: 0x4a7a6a, hair: 0x2a2a3a, cap: 0xe8d9a8, hairstyle: 'classic' },
      -10.6, 9.2, -9.4, 10.0, 'Posy', 'Wick',
      [
        [['Posy', 'I\'m telling you, the boutique got Tharkand silk in. SILK, Wick. Madame Celeste hid a bolt under the counter the second she saw me coming.'],
         ['Wick', 'Because last time you "looked at" a bolt of silk it left the shop inside your coat with a promise to pay Thursday.'],
         ['Posy', 'And I PAID. The Thursday after the Thursday after. That\'s still a Thursday.']],
        [['Wick', 'Pina\'s raised the price of honey rolls again. Second time this season.'],
         ['Posy', 'That\'s because Tilda\'s oven cracked and every roll in the city goes through Pina\'s counter now. Supply, demand, and a baker\'s broken heart.'],
         ['Wick', '…You are frighteningly well-informed.'],
         ['Posy', 'I sit near Granny Essa. It\'s like standing under a waterfall of other people\'s business.']],
        [['Posy', 'They say the new tamer — the quiet one — walked out of the Cradle Hollow like it was a stroll to the well.'],
         ['Wick', 'Posy. They\'re standing RIGHT there.'],
         ['Posy', 'Then they can confirm it! Well? Was it a stroll?']],
      ]);

    // ---- shop talk on the coliseum road ----
    pair(
      { top: 0x8a3040, hair: 0x2a2a3a, cap: 0xc9a24a, hairstyle: 'ponytail' },
      { top: 0x8a7a5a, hair: 0x3a2a1a, cap: null, hairstyle: 'curly' },
      16.6, -9.2, 17.6, -8.2, 'Sergeant Vell', 'Mason Pott',
      [
        [['Sergeant Vell', 'The east tower lists two fingers to the south. Two fingers, Pott. I measured it against my spear.'],
         ['Mason Pott', 'Your spear is bent from the time you pried open the tournament gate with it. The tower is FINE. The tower will outlive your great-grandchildren.'],
         ['Sergeant Vell', 'It had better. I\'ve named it.']],
        [['Mason Pott', 'Doubling the Coliseum took us four years. You know what the hard part was? Not the stone. The NOISE rules. Ten thousand fans, and the Sanctum next door wants "contemplative quiet".'],
         ['Sergeant Vell', 'So what did you do?'],
         ['Mason Pott', 'Angled every seat-row to throw the roar east, over the wall, into the wild country. Some farmer out there thinks the ruins cheer on finals night.']],
      ]);

    // ---- the duck kid at the pond ----
    idler({ top: 0x5ad8e8, hair: 0x6a3a1a, cap: 0xf2d23a, hairstyle: 'spiky' },
      -22.4, 26.2, Math.atan2(-26 - -22.4, 30 - 26.2), 'Duckling Dot', [
        'The green-headed one is Admiral Bread. He outranks the other two because he found a whole roll once. That\'s how duck ranks work.',
        'Reza says the ducks own the pier. The ducks agree. I\'m the ambassador. It\'s a lot of responsibility.',
        'If you stand REALLY still, Admiral Bread does a circle around you. It means you\'re accepted. Or that you look like bread.',
      ]);
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
    this.resetInteriorRig();
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
    tagNpc(master, h.master);
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
    tagNpc(attendant, `${h.name} Attendant`);
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
    // the Sanctum earned itself a bigger hall when the research wing moved in
    this.intRoom = kind === 'sanctum' ? { w: 20, d: 15 } : { w: 18, d: 13 };
    this.resetInteriorRig();
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
      tagNpc(pina, 'Pina');
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
      tagNpc(dax, 'Dax');
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
      // ------------------------------------------------------------------
      // Where faith met instrumentation and decided they liked each other:
      // the old healing spring at the heart, recovery capsules and a vitals
      // wall along one side, the aether condenser humming on the other, and
      // a research aide who annotates miracles in triplicate.
      // ------------------------------------------------------------------

      // the healing spring, ringed by an aether-script inlay
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 20),
        new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.3 }));
      pool.position.set(0, 0.25, -2);
      const springWater = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 20),
        new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.8, roughness: 0.05, transparent: true, opacity: 0.85 }));
      springWater.position.set(0, 0.56, -2);
      springWater.name = 'springwater';
      const springLight = new THREE.PointLight(0x5ad88a, 14, 12);
      springLight.position.set(0, 2, -2);
      s.add(pool, springWater, springLight);
      this.intColliders.push({ pos: new THREE.Vector3(0, 0, -2), r: 3.0 });
      const runeRing = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.06, 8, 40),
        new THREE.MeshStandardMaterial({ color: 0x4ad8c8, emissive: 0x2aa890, emissiveIntensity: 1.0, roughness: 0.3 }));
      runeRing.rotation.x = Math.PI / 2;
      runeRing.position.set(0, 0.03, -2);
      runeRing.name = 'legendpulse';
      s.add(runeRing);
      // sensor probes leaning over the water — the spring is monitored now
      for (const a of [0.8, 2.4]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6),
          new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.3 }));
        arm.position.set(Math.cos(a) * 2.7, 1.4, -2 + Math.sin(a) * 2.7);
        arm.rotation.z = Math.cos(a) * 0.5;
        arm.rotation.x = -Math.sin(a) * 0.5;
        const probe = new THREE.Mesh(new THREE.OctahedronGeometry(0.1),
          new THREE.MeshStandardMaterial({ color: 0x5ad8e8, emissive: 0x5ad8e8, emissiveIntensity: 1.2 }));
        probe.position.set(Math.cos(a) * 2.0, 2.0, -2 + Math.sin(a) * 2.0);
        probe.name = 'stormtip';
        s.add(arm, probe);
      }

      // candle columns hold the corners — the old faith keeps its seats
      for (const [cx, cz] of [[-8, -5.5], [8, -5.5], [-8, 4.5], [8, 4.5]] as const) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.6, 10),
          new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.4 }));
        col.position.set(cx, 1.3, cz);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45a, emissiveIntensity: 1.4 }));
        flame.position.set(cx, 2.85, cz);
        flame.name = 'flame';
        s.add(col, flame);
        this.intColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 0.5 });
      }
      const candleLight = new THREE.PointLight(0xffb45a, 7, 14);
      candleLight.position.set(0, 3.4, 2);
      s.add(candleLight);

      // ---- the recovery wing: two guardian capsules + the vitals wall ----
      for (const [capZ, fluidCol, occupied] of [[-3.6, 0x4ad8c8, true], [-0.6, 0x9a6af2, false]] as const) {
        const cx = -7.2;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.4, 14),
          new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.75, roughness: 0.3 }));
        base.position.set(cx, 0.2, capZ);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.3, 14, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0xbfe8f2, transparent: true, opacity: 0.22, roughness: 0.05,
            side: THREE.DoubleSide, depthWrite: false,
          }));
        glass.position.set(cx, 1.55, capZ);
        const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.9, 12),
          new THREE.MeshStandardMaterial({
            color: fluidCol, emissive: fluidCol, emissiveIntensity: 0.4,
            transparent: true, opacity: 0.3, depthWrite: false,
          }));
        fluid.position.set(cx, 1.45, capZ);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.3, 14),
          new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.75, roughness: 0.3 }));
        cap.position.set(cx, 2.85, capZ);
        s.add(base, glass, fluid, cap);
        // a rising scan ring sweeps the tube
        const scan = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.02, 6, 20),
          new THREE.MeshBasicMaterial({ color: 0x9af2e8, transparent: true, opacity: 0.7 }));
        scan.rotation.x = Math.PI / 2;
        scan.position.set(cx, 0.6, capZ);
        scan.name = 'scanline';
        scan.userData.ph = capZ;
        s.add(scan);
        if (occupied) {
          // a small guardian dozing in the fluid, on the mend
          const patient = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0x6ab48a, roughness: 0.7 }));
          patient.scale.set(1.2, 0.85, 1);
          patient.position.set(cx, 1.2, capZ);
          patient.name = 'aetherfloat';
          patient.userData.baseY = 1.2;
          patient.userData.ph = 1.3;
          const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 6),
            new THREE.MeshStandardMaterial({ color: 0x4a946a, roughness: 0.7 }));
          fin.position.set(cx, 1.62, capZ);
          fin.name = 'aetherfloat';
          fin.userData.baseY = 1.62;
          fin.userData.ph = 1.3;
          s.add(patient, fin);
        }
        this.intColliders.push({ pos: new THREE.Vector3(cx, 0, capZ), r: 1.25 });
      }
      this.intInteractables.push({
        pos: new THREE.Vector3(-5.8, 0, -2.1), radius: 1.8,
        label: 'Press <b>E</b> — check on the recovery capsules',
        handler: async () => {
          await say('', 'A marshfin drifts in the teal capsule, fins stirring in its sleep, vitals tracing slow green hills on the readout. The chart clipped to the glass says: "Day 3. Ate well. Dreamed loudly."');
          await say('', 'The violet capsule stands empty and freshly cleaned. The Keeper insists an empty capsule is the best possible news a sanctum can have.');
        },
      });
      // the vitals wall: a bank of soft-glowing EKG monitors
      {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 192;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#081410';
        ctx.fillRect(0, 0, 512, 192);
        for (let row = 0; row < 3; row++) {
          ctx.strokeStyle = ['#4ad88a', '#5ad8e8', '#c9a24a'][row];
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let x = 0; x <= 512; x += 4) {
            const beat = (x % 170 > 140) ? Math.sin(((x % 170) - 140) / 30 * Math.PI) * 26 : Math.sin(x * 0.05 + row * 2) * 4;
            const y = 36 + row * 60 - beat;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const monitor = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.15),
          new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.4 }));
        monitor.position.set(-w / 2 + 0.45, 2.4, -2.1);
        monitor.rotation.y = Math.PI / 2;
        const mFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 3.3),
          new THREE.MeshStandardMaterial({ color: 0x2a303c, metalness: 0.6, roughness: 0.4 }));
        mFrame.position.set(-w / 2 + 0.38, 2.4, -2.1);
        s.add(mFrame, monitor);
      }

      // ---- the aether condenser: rings, crystal, contained weather ----
      {
        const cx = 7.2, cz = -2.4;
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 12),
          new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.4 }));
        plinth.position.set(cx, 0.25, cz);
        s.add(plinth);
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 - i * 0.14, 0.045, 8, 22),
            new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.85, roughness: 0.3 }));
          ring.position.set(cx, 1.0 + i * 0.5, cz);
          ring.rotation.x = Math.PI / 2 + (i - 1) * 0.3;
          ring.name = 'stormtip';
          s.add(ring);
        }
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
          new THREE.MeshStandardMaterial({ color: 0xbe9af2, emissive: 0x9a6af2, emissiveIntensity: 1.3, roughness: 0.2 }));
        crystal.position.set(cx, 2.5, cz);
        crystal.name = 'aetherfloat';
        crystal.userData.baseY = 2.5;
        crystal.userData.ph = 0.4;
        const cLight = new THREE.PointLight(0x9a6af2, 8, 9);
        cLight.position.set(cx, 2.6, cz);
        s.add(crystal, cLight);
        this.intColliders.push({ pos: new THREE.Vector3(cx, 0, cz), r: 1.3 });
        this.intInteractables.push({
          pos: new THREE.Vector3(cx - 1.4, 0, cz), radius: 1.7,
          label: 'Press <b>E</b> — study the aether condenser',
          handler: async () => {
            await say('', 'Three gimbaled rings spin around a sliver of aether crystal — the tenth element, in a jar, technically. A brass plate reads: "Distills 0.4 drams of restorative essence per day. DO NOT TAP THE GLASS. It taps back."');
          },
        });
      }

      // ---- the research bench: vials, alembic, and Aide Lumen's notes ----
      {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.0),
          new THREE.MeshStandardMaterial({ map: plankTexture('#5a4632', 2), roughness: 0.7 }));
        bench.position.set(5.6, 0.5, 4.6);
        s.add(bench);
        this.intColliders.push({ pos: new THREE.Vector3(5.6, 0, 4.6), r: 1.6 });
        for (let i = 0; i < 5; i++) {
          const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.3, 8),
            new THREE.MeshStandardMaterial({
              color: [0x4ad88a, 0x5ad8e8, 0xe85a8a, 0xf2d23a, 0x9a6af2][i],
              emissive: [0x4ad88a, 0x5ad8e8, 0xe85a8a, 0xf2d23a, 0x9a6af2][i],
              emissiveIntensity: 0.5, transparent: true, opacity: 0.85,
            }));
          vial.position.set(4.0 + i * 0.45, 1.17, 4.4);
          s.add(vial);
        }
        const alembic = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xbfe8f2, transparent: true, opacity: 0.4, roughness: 0.05 }));
        alembic.position.set(6.8, 1.3, 4.6);
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 6),
          new THREE.MeshStandardMaterial({ color: 0xbfe8f2, transparent: true, opacity: 0.4 }));
        spout.rotation.z = 1.0;
        spout.position.set(6.45, 1.5, 4.6);
        s.add(alembic, spout);
        this.intInteractables.push({
          pos: new THREE.Vector3(5.6, 0, 3.4), radius: 1.7,
          label: 'Press <b>E</b> — read the research notes',
          handler: async () => {
            await say('Lumen\'s notebook', '"Day 212: spring output up 3% during the Coliseum finals. Hypothesis: the water responds to ten thousand people hoping at once. The Keeper says \'obviously\'. I require a larger sample of hope."');
            await say('Lumen\'s notebook', '"Day 215: tonic distilled from condenser essence outperforms shelf tonic by 11%. Keeper poured it back into the spring \'as a thank-you\'. Science and the spring remain in negotiation."');
          },
        });
      }
      // Aide Lumen, mid-measurement
      const lumen = makeVoxelHuman({ top: 0x5a8ad8, hair: 0xc46a2a, cap: null, hairstyle: 'buns' });
      lumen.position.set(4.4, 0, 3.0);
      lumen.rotation.y = Math.PI * 0.8;
      tagNpc(lumen, 'Aide Lumen');
      s.add(lumen);
      this.intNpcs.push(lumen);
      this.intColliders.push({ pos: new THREE.Vector3(4.4, 0, 3.0), r: 0.55 });
      this.intInteractables.push({
        pos: new THREE.Vector3(4.4, 0, 3.0), radius: 1.7,
        label: 'Press <b>E</b> — talk to Aide Lumen',
        handler: async () => {
          const lines = [
            'The spring healed people for seven hundred years before anyone measured HOW. I\'ve measured for three. Current findings: it\'s the water, it\'s the aether, and it\'s also, infuriatingly, the kindness. All three. The math only balances with the kindness term.',
            'The capsules aren\'t a replacement for the spring — they\'re for patients who\'d drown in it. Fish guardians excepted. Fish guardians LOVE the capsules. We have a waiting list.',
            'The Keeper blesses every instrument I install. I used to find it unscientific. Then the unblessed spectrometer caught fire, twice, and I revised my methodology.',
          ];
          await say('Aide Lumen', lines[Math.floor(Math.random() * lines.length)]);
        },
      });

      // the keeper beside the spring, where the keeper has always been
      const keeper = makeVoxelHuman({ top: 0x4ec45e, robe: true, hair: 0xd8d8e8, cap: null });
      keeper.position.set(2.8, 0, -3.1);
      keeper.rotation.y = Math.PI / 1.5;
      tagNpc(keeper, 'Sanctum Keeper');
      s.add(keeper);
      this.intNpcs.push(keeper);
      this.intColliders.push({ pos: new THREE.Vector3(2.8, 0, -3.1), r: 0.6 });
      this.intInteractables.push({
        pos: new THREE.Vector3(2.8, 0, -3.1), radius: 1.9,
        label: 'Press <b>E</b> — ask for the spring\'s blessing',
        handler: () => this.visitSanctum(),
      });
      this.intMarkers = [
        { x: 2.8, z: -3.1, label: 'Keeper', color: '#5ad88a', kind: 'npc' },
        { x: 0, z: -2, label: 'Healing Spring', color: '#5ad88a', kind: 'poi' },
        { x: -7.2, z: -2.1, label: 'Recovery Wing', color: '#5ad8e8', kind: 'poi' },
        { x: 7.2, z: -2.4, label: 'Condenser', color: '#9a6af2', kind: 'poi' },
        { x: 5.6, z: 4.6, label: 'Research', color: '#5a8ad8', kind: 'poi' },
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
      tagNpc(celeste, 'Madame Celeste');
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
    // doubled again on the west side to make room for the Legends' Ascendancy
    this.intRoom = { w: 58, d: 44 };
    this.resetInteriorRig();
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
    tagNpc(guardL, 'Ring Guard');
    tagNpc(guardR, 'Ring Guard');
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
    tagNpc(attendant, 'Attendant Lyssa');
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
          await say('Attendant Lyssa', 'Registration is not yet open — the brackets, the prize vault and the broadcast crystals are still being prepared. And remember how the ladder works now: your Universal Rank moves on TOURNAMENT POINTS alone. Win brackets — here, at the Turmal Seasonal, on any sanctioned circuit — and the rank follows. Nothing else counts. When the horns sound across Haven City, come straight to me. I\'ll hold a slot for you.');
          toast('🏟️ The Grand Tournament opens soon — Tournament Points await!', 'gold');
        } else if (pick === 1) {
          await say('Attendant Lyssa', 'The Ring seats twenty thousand now and the sound of a final can be heard from the city walls. It stays sealed between tournaments — the two guards up there take their job VERY seriously.');
        } else if (pick === 2) {
          await say('Attendant Lyssa', 'The gold wall, east side. Aljay — eight championships. Greggy — nine, the longest reign in history. Onnel — five. And the Ascendancy in the north-west quarter is brand new — Aether-marble, studio crystals, all nine Guardians under spotlight. Climb the stairs and pay your respects. Everyone does.');
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
        tagNpc(npc, crowdName(`circuit-fan:${f.x},${f.z}`));
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
        tagNpc(npc, crowdName(`hall-pilgrim:${f.x},${f.z}`));
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

    // ============================================================
    // THE LEGENDS' ASCENDANCY — the whole north-west quarter of the
    // doubled hall, surrendered to one monument. A grand pedestal of
    // Aether-marble wrapped in a carved trophy frieze, climbed by six
    // marble stairs under a crimson runner. On the high ground: three
    // bespoke plinths — obsidian-and-ember, storm-steel, living root —
    // a golden legend on each, their nine Guardians arrayed before
    // them under studio spotlights hung from a rigging truss.
    // ============================================================
    const PLAT = { x1: -14.5, z0: -21.5, z1: -4.5, h: 1.9 };   // west edge is the hall wall
    const STAIR = { x0: -14.5, x1: -10.3, z0: -16, z1: -10 };
    const ascendH = (x: number, z: number): number => {
      if (x <= PLAT.x1 && z >= PLAT.z0 && z <= PLAT.z1) return PLAT.h;
      if (x > STAIR.x0 && x <= STAIR.x1 && z >= STAIR.z0 && z <= STAIR.z1)
        return PLAT.h * (STAIR.x1 - x) / (STAIR.x1 - STAIR.x0);
      return 0;
    };
    this.intGroundH = ascendH;
    const platCX = (-w / 2 + PLAT.x1) / 2, platCZ = (PLAT.z0 + PLAT.z1) / 2;
    const platW = PLAT.x1 + w / 2, platD = PLAT.z1 - PLAT.z0;
    // the grand pedestal: frieze-carved flanks, Aether-marble crown
    const platBody = new THREE.Mesh(new THREE.BoxGeometry(platW, PLAT.h, platD),
      new THREE.MeshStandardMaterial({ map: legendFriezeTexture(5), roughness: 0.65, metalness: 0.2 }));
    platBody.position.set(platCX, PLAT.h / 2, platCZ);
    platBody.castShadow = platBody.receiveShadow = true;
    const platTop = new THREE.Mesh(new THREE.PlaneGeometry(platW, platD),
      new THREE.MeshStandardMaterial({ map: aetherMarbleTexture(5), roughness: 0.25, metalness: 0.15 }));
    platTop.rotation.x = -Math.PI / 2;
    platTop.position.set(platCX, PLAT.h + 0.01, platCZ);
    platTop.receiveShadow = true;
    // gold cornice ringing the crown, a stone skirt at the foot
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(platW + 0.3, 0.14, platD + 0.3),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 }));
    cornice.position.set(platCX, PLAT.h - 0.07, platCZ);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(platW + 0.5, 0.22, platD + 0.5),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#2a3048', '#1a2034', 3), roughness: 0.8 }));
    skirt.position.set(platCX, 0.11, platCZ);
    s.add(platBody, platTop, cornice, skirt);
    // inlaid Aether sigil where pilgrims stand among the Guardians
    const sigil = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.3, 40),
      new THREE.MeshStandardMaterial({ color: 0x9a7af2, emissive: 0x9a7af2, emissiveIntensity: 0.7, side: THREE.DoubleSide }));
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.set(-19.6, PLAT.h + 0.02, platCZ);
    sigil.name = 'legendpulse';
    s.add(sigil);

    // six marble stairs under a crimson runner
    const stairMat = new THREE.MeshStandardMaterial({ map: marbleTexture('#e9e3d3', '#b9ac80', 2), roughness: 0.35 });
    const runnerMat = new THREE.MeshStandardMaterial({ map: carpetTexture('#7a1e2a', '#d8b56a', 1), roughness: 0.95 });
    const stairW = STAIR.z1 - STAIR.z0, stepRun = (STAIR.x1 - STAIR.x0) / 6;
    for (let i = 0; i < 6; i++) {
      const top = PLAT.h * (i + 1) / 6;
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepRun, top, stairW), stairMat);
      step.position.set(STAIR.x1 - stepRun / 2 - stepRun * i, top / 2, (STAIR.z0 + STAIR.z1) / 2);
      step.receiveShadow = true;
      const tread = new THREE.Mesh(new THREE.PlaneGeometry(stepRun, 3.0), runnerMat);
      tread.rotation.x = -Math.PI / 2;
      tread.position.set(step.position.x, top + 0.012, (STAIR.z0 + STAIR.z1) / 2);
      s.add(step, tread);
    }
    // the runner continues across the hall floor and onto the marble crown
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.0), runnerMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(STAIR.x1 + 3.0, 0.02, platCZ);
    const landing = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.0), runnerMat);
    landing.rotation.x = -Math.PI / 2;
    landing.position.set(PLAT.x1 - 2.3, PLAT.h + 0.02, platCZ);
    s.add(approach, landing);

    // gilded balustrade — gold posts crowned with aether orbs, glowing rail
    const postMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 });
    const railGlowMat = new THREE.MeshStandardMaterial({ color: 0x9a7af2, emissive: 0x9a7af2, emissiveIntensity: 1.0 });
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.7, roughness: 0.45 });
    const baluster = (bx: number, bz: number, baseY: number) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.95, 8), postMat);
      post.position.set(bx, baseY + 0.475, bz);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), railGlowMat);
      orb.position.set(bx, baseY + 1.0, bz);
      orb.name = 'legendpulse';
      s.add(post, orb);
    };
    const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
      const len = a.distanceTo(b);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), railGlowMat);
      bar.position.copy(a.clone().add(b).multiplyScalar(0.5));
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      s.add(bar);
    };
    // east rim (broken by the stair), then the south rim
    const rimRuns: [number, number, number, number][] = [
      [-14.4, PLAT.z0 + 0.3, -14.4, STAIR.z0 - 0.25],
      [-14.4, STAIR.z1 + 0.25, -14.4, PLAT.z1 - 0.3],
      [-w / 2 + 0.6, PLAT.z1 - 0.1, -15.0, PLAT.z1 - 0.1],
    ];
    for (const [x0, z0, x1, z1] of rimRuns) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 1.7) + 1);
      for (let pi = 0; pi < n; pi++) {
        baluster(x0 + (x1 - x0) * (pi / (n - 1)), z0 + (z1 - z0) * (pi / (n - 1)), PLAT.h);
      }
      rail(new THREE.Vector3(x0, PLAT.h + 0.93, z0), new THREE.Vector3(x1, PLAT.h + 0.93, z1));
      const nc = Math.ceil(len / 1.1);
      for (let ci = 0; ci <= nc; ci++) {
        this.intColliders.push({ pos: new THREE.Vector3(x0 + (x1 - x0) * (ci / nc), 0, z0 + (z1 - z0) * (ci / nc)), r: 0.8 });
      }
    }
    // stair cheeks: posts stepping down with the marble, sloping glow-rails
    for (const cheekZ of [STAIR.z0 - 0.2, STAIR.z1 + 0.2]) {
      for (const px of [-14.3, -12.9, -11.5, -10.2]) {
        baluster(px, cheekZ, ascendH(Math.min(px, STAIR.x1 - 0.01), platCZ));
      }
      rail(new THREE.Vector3(-14.3, PLAT.h + 0.93, cheekZ), new THREE.Vector3(-10.2, 0.93, cheekZ));
      for (const px of [-14.0, -13.0, -12.0, -11.0, -10.2]) {
        this.intColliders.push({ pos: new THREE.Vector3(px, 0, cheekZ), r: 0.65 });
      }
    }
    // queue posts flanking the approach runner
    for (const qz of [-14.9, -11.1]) {
      for (const qx of [-8.6, -6.4, -4.2]) {
        baluster(qx, qz, 0);
        this.intColliders.push({ pos: new THREE.Vector3(qx, 0, qz), r: 0.5 });
      }
      rail(new THREE.Vector3(-8.6, 0.93, qz), new THREE.Vector3(-4.2, 0.93, qz));
    }
    // braziers flanking the foot of the stairs
    const brazier = (bx: number, bz: number) => {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.26, 0.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x7a5a26, metalness: 0.8, roughness: 0.35 }));
      bowl.position.set(bx, 1.05, bz);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.85, 8), postMat);
      stem.position.set(bx, 0.42, bz);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0xff7a2a, emissiveIntensity: 1.6, transparent: true, opacity: 0.92 }));
      flame.position.set(bx, 1.7, bz);
      flame.name = 'flame';
      const fl = new THREE.PointLight(0xff9a4a, 8, 7);
      fl.position.set(bx, 2.1, bz);
      s.add(bowl, stem, flame, fl);
      this.intColliders.push({ pos: new THREE.Vector3(bx, 0, bz), r: 0.7 });
    };
    brazier(-9.4, -16.9);
    brazier(-9.4, -9.1);

    // the studio rigging truss, hung over the high ground
    const trussBeam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, platD + 1), trussMat);
    trussBeam.position.set(-16.4, 9.0, platCZ);
    s.add(trussBeam);
    for (const tz of [PLAT.z0 + 0.6, PLAT.z1 - 0.6]) {
      const trussLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 9.0 - PLAT.h, 8), trussMat);
      trussLeg.position.set(-16.4, PLAT.h + (9.0 - PLAT.h) / 2, tz);
      s.add(trussLeg);
      this.intColliders.push({ pos: new THREE.Vector3(-16.4, 0, tz), r: 0.5 });
    }
    for (let bi = 0; bi < 7; bi++) {  // running show-lights along the truss
      const blink = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: [0xf2603a, 0xf2d23a, 0x4ec45e][bi % 3], emissiveIntensity: 1.2 }));
      blink.position.set(-16.4, 9.22, PLAT.z0 + 1.5 + bi * 2.3);
      blink.name = 'legendpulse';
      s.add(blink);
    }
    // the champions' crown — a great gold ring turning slowly overhead
    const crown = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.1, 10, 56),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.set(-25.6, 8.4, platCZ);
    crown.name = 'stormtip';
    const crownGlow = new THREE.PointLight(0xf2d49a, 10, 14);
    crownGlow.position.set(-25.6, 8.0, platCZ);
    s.add(crown, crownGlow);
    // loose aether crystals, drifting where twenty-two titles were sworn
    for (const [cx2, cy2, cz2, ph] of [[-28, 5.0, -19.5, 0], [-27.6, 5.8, -6.4, 2.1], [-17.2, 4.6, -20.3, 4.2], [-16.8, 5.4, -5.6, 1.3], [-22.5, 6.6, -13, 3.4]]) {
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.22),
        new THREE.MeshStandardMaterial({ color: 0xb89aff, emissive: 0x9a7af2, emissiveIntensity: 1.1, transparent: true, opacity: 0.95 }));
      cry.position.set(cx2, cy2, cz2);
      cry.userData.baseY = cy2;
      cry.userData.ph = ph;
      cry.name = 'aetherfloat';
      s.add(cry);
    }

    // ---- the three legends on their bespoke plinths ----
    const LEGEND_SPOTS: { x: number; z: number; pedH: number }[] = [
      { x: -26.2, z: -18.6, pedH: 1.15 },
      { x: -26.7, z: -13.0, pedH: 1.45 },   // nine titles: center stage, tallest plinth
      { x: -26.2, z: -7.4, pedH: 1.15 },
    ];
    LEGENDS.forEach((leg, i) => {
      const { x: lx, z: lz, pedH } = LEGEND_SPOTS[i];
      const col = parseInt(leg.color.slice(1), 16);
      const topY = PLAT.h + pedH;
      if (i === 0) {
        // Aljay: an obsidian heart-stone set over living fire
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.3, pedH, 8),
          new THREE.MeshStandardMaterial({
            map: caveRockTexture('#241016', '#3a1c20', '#120a0c', 8, 2),
            emissiveMap: emberCrackTexture('#ff7a2a', 2), emissive: 0xff8a3a, emissiveIntensity: 0.85, roughness: 0.6,
          }));
        ped.position.set(lx, PLAT.h + pedH / 2, lz);
        s.add(ped);
        const emberRing = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 8, 32),
          new THREE.MeshStandardMaterial({ color: 0xf2603a, emissive: 0xf2603a, emissiveIntensity: 1.3 }));
        emberRing.rotation.x = Math.PI / 2;
        emberRing.position.set(lx, PLAT.h + 0.1, lz);
        emberRing.name = 'legendpulse';
        s.add(emberRing);
        for (const fz of [-0.9, 0.9]) {   // twin dawn-flames at the shoulders of the stone
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8),
            new THREE.MeshStandardMaterial({ color: 0xffb45a, emissive: 0xff7a2a, emissiveIntensity: 1.8, transparent: true, opacity: 0.9 }));
          flame.position.set(lx + 1.1, topY + 0.2, lz + fz);
          flame.name = 'flame';
          s.add(flame);
        }
      } else if (i === 1) {
        // Greggy: a storm-steel dynamo wound in golden coils
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, pedH, 12),
          new THREE.MeshStandardMaterial({
            map: stormPanelTexture('#3a4258', '#222a3a', 5, 2),
            emissiveMap: stormSeamEmissive('#f2d23a', 5, 2), emissive: 0xf2d23a, emissiveIntensity: 0.7,
            metalness: 0.6, roughness: 0.4,
          }));
        ped.position.set(lx, PLAT.h + pedH / 2, lz);
        s.add(ped);
        [0.42, 0.98].forEach((cy, ci) => {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(1.12 - ci * 0.1, 0.07, 8, 28),
            new THREE.MeshStandardMaterial({ color: 0xc9a24a, emissive: 0xf2d23a, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.25 }));
          coil.rotation.x = Math.PI / 2;
          coil.position.set(lx, PLAT.h + cy, lz);
          if (ci === 0) coil.name = 'stormtip';
          s.add(coil);
        });
      } else {
        // Onnel: a living root-bole, mossy-crowned and blooming
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, pedH, 10),
          new THREE.MeshStandardMaterial({ map: barkTexture('#4a3220', '#2c1d10', '#4a6a36', 17), roughness: 0.95 }));
        ped.position.set(lx, PLAT.h + pedH / 2, lz);
        const moss = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.0, 0.14, 10),
          new THREE.MeshStandardMaterial({ map: groundTexture('#3a6a32', '#5a8a44', 2), roughness: 1 }));
        moss.position.set(lx, topY - 0.07, lz);
        s.add(ped, moss);
        for (let bl = 0; bl < 5; bl++) {
          const ang = (bl / 5) * Math.PI * 2 + 0.6;
          const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09),
            new THREE.MeshStandardMaterial({ color: 0xb8ffd8, emissive: 0x6aff9a, emissiveIntensity: 1.3 }));
          blossom.position.set(lx + Math.cos(ang) * 1.25, PLAT.h + 0.25 + (bl % 3) * 0.45, lz + Math.sin(ang) * 1.25);
          blossom.name = 'legendpulse';
          s.add(blossom);
        }
      }
      // gold name plaque on the plinth's east face
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.95),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.2, emissive: 0x6a521a, emissiveIntensity: 0.3 }));
      plaque.position.set(lx + 1.22, PLAT.h + pedH * 0.55, lz);
      s.add(plaque);

      // the legend in gold, gazing east over the hall
      const statue = makeVoxelHuman({
        skin: 0xd8c27a, hair: 0xc9a24a, top: 0xb89a3a, bottom: 0xa8883a, shoes: 0x8a6a2a, cap: null, robe: true,
        hairstyle: i === 0 ? 'spiky' : i === 1 ? 'classic' : 'long',
      });
      statue.position.set(lx, topY, lz);
      statue.rotation.y = Math.PI / 2;
      statue.scale.setScalar(1.6);
      s.add(statue);
      this.intNpcs.push(statue);
      // a saint's aureole floating behind the head, in house color
      const aureole = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 36),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, transparent: true, opacity: 0.9 }));
      aureole.rotation.y = Math.PI / 2;
      aureole.position.set(lx - 0.55, topY + 2.3, lz);
      aureole.name = 'legendpulse';
      s.add(aureole);
      this.label3d(s, `👑 ${leg.name} — ${leg.championships}× Champion`, leg.color, new THREE.Vector3(lx, topY + 4.0, lz), 4.6);

      // studio rig: barn-door housing on the truss, hot spot, visible beam
      const from = new THREE.Vector3(-16.4, 8.85, lz);
      const to = new THREE.Vector3(lx, topY + 1.1, lz);
      const beamDir = from.clone().sub(to).normalize();
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 10), trussMat);
      housing.position.copy(from);
      housing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);
      s.add(housing);
      const spot = new THREE.SpotLight(0xfff1d0, 85, 24, 0.34, 0.5, 1.1);
      spot.position.copy(from);
      spot.target.position.copy(to);
      s.add(spot, spot.target);
      const beamLen = from.distanceTo(to);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1.9, beamLen, 18, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.09, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      cone.position.copy(from.clone().add(to).multiplyScalar(0.5));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);
      s.add(cone);
      const wash = new THREE.PointLight(col, 9, 9);
      wash.position.set(lx + 1.4, PLAT.h + 2.6, lz);
      s.add(wash);

      // their three Guardians, arrayed in front on glowing show-discs
      leg.guardians.forEach((gd, gi) => {
        const gx = gi === 1 ? -22.0 : -22.8;
        const gz = lz + (gi - 1) * 2.25;
        const rig = makeCustomCreature(gd.archetype, gd.palette, gd.glow, gd.scale * 0.62, true, gd.bespoke);
        rig.group.position.set(gx, PLAT.h, gz);
        rig.group.rotation.y = Math.PI / 2;
        s.add(rig.group);
        this.intRigs.push(rig);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.05, 18),
          new THREE.MeshStandardMaterial({ color: 0x2a3048, metalness: 0.5, roughness: 0.4 }));
        disc.position.set(gx, PLAT.h + 0.025, gz);
        const discRim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 6, 26),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.0 }));
        discRim.rotation.x = Math.PI / 2;
        discRim.position.set(gx, PLAT.h + 0.06, gz);
        discRim.name = 'legendpulse';
        s.add(disc, discRim);
        this.intColliders.push({ pos: new THREE.Vector3(gx, 0, gz), r: 0.85 });
      });
      this.intColliders.push({ pos: new THREE.Vector3(lx, 0, lz), r: 1.75 });

      // banner and gold crest on the wall behind
      const wallBanner = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 6.4),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.32, roughness: 0.85, side: THREE.DoubleSide }));
      wallBanner.rotation.y = Math.PI / 2;
      wallBanner.position.set(-w / 2 + 0.3, 5.6, lz);
      const crest = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
      crest.rotation.y = Math.PI / 2;
      crest.position.set(-w / 2 + 0.32, 9.3, lz);
      s.add(wallBanner, crest);

      // pay respects eye to eye, up on the high ground
      this.intInteractables.push({
        pos: new THREE.Vector3(-20.7, PLAT.h, lz), radius: 2.3,
        label: `Press <b>E</b> — honor ${leg.name} ${leg.title}`,
        handler: async () => {
          await say(`${leg.name} ${leg.title} — ${leg.championships}× World Champion (${leg.champYears})`, leg.story);
          for (const gd of leg.guardians) {
            await say(`${gd.name}, ${gd.epithet} (${gd.elements.join(' · ')})`, gd.desc);
          }
        },
      });
    });

    // the dedication lectern at the foot of the stairs
    const lecternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.0, 8), postMat);
    lecternPost.position.set(-4.4, 0.5, -15.4);
    const lecternTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.65),
      new THREE.MeshStandardMaterial({ map: aetherMarbleTexture(1), roughness: 0.3 }));
    lecternTop.position.set(-4.4, 1.04, -15.4);
    lecternTop.rotation.z = 0.45;
    s.add(lecternPost, lecternTop);
    this.intColliders.push({ pos: new THREE.Vector3(-4.4, 0, -15.4), r: 0.55 });
    this.intInteractables.push({
      pos: new THREE.Vector3(-4.4, 0, -15.4), radius: 2.0,
      label: 'Press <b>E</b> — read the dedication',
      handler: async () => {
        await say('The Ascendancy of Legends',
          'Raised by decree of the Coliseum and paid for with twenty-two years of sold-out finals: one pedestal broad enough for three friends. Aljay the Dawnflame. Greggy the Stormheart. Onnel the Worldroot. Climb the stairs. Stand where they stand. The marble does not mind — it has held far heavier legends.');
        toast('👑 The Ascendancy of Legends', 'gold');
      },
    });

    // the devoted, gathered at the foot of the Ascendancy
    const admirers: { x: number; z: number; y: number; top: number; face: [number, number]; line: string }[] = [
      { x: -8.0, z: -12.6, y: 0, top: 0xf2603a, face: [-26, -13], line: 'Best thing the Coliseum ever built. They gave the legends the whole north-west quarter — Aether-marble, studio crystals on a rigging truss, the lot. Now the three of them stand in DAYLIGHT at midnight. I come every market day. Twice on rest days.' },
      { x: -19.4, z: -10.6, y: PLAT.h, top: 0x4ec45e, face: [-26.2, -7.4], line: 'Watch the little Verdalune before Onnel — it opens one petal at noon. NOON. EXACTLY. I\'ve timed it for a month. Nobody believes me. You believe me, right?' },
      { x: -6.6, z: -16.6, y: 0, top: 0xf2d23a, face: [-12, -13], line: 'I proposed to my husband on the fourth stair, right under the spotlights. Three golden legends and nine Guardians for witnesses. He said "obviously". Strongest contract in Olivar.' },
      { x: -9.2, z: -10.4, y: 0, top: 0x5ab8e8, face: [-14, -12], line: 'Dad says if I train hard enough they\'ll widen the great pedestal for a fourth plinth. They WON\'T. ...unless? Write my name down somewhere so you can say you knew me.' },
    ];
    for (const a of admirers) {
      const npc = makeVoxelHuman({
        top: a.top, hair: [0x2a2a3a, 0x6a3a1a, 0x7a4a2a, 0xd8d8d8][Math.floor(Math.random() * 4)],
        cap: Math.random() < 0.3 ? 0xc9a24a : null,
        hairstyle: (['classic', 'spiky', 'long', 'buns'] as const)[Math.floor(Math.random() * 4)],
      });
      npc.position.set(a.x, a.y, a.z);
      npc.rotation.y = Math.atan2(a.face[0] - a.x, a.face[1] - a.z); // transfixed by the gold
      tagNpc(npc, crowdName(`admirer:${a.x},${a.z}`));
      s.add(npc);
      this.intNpcs.push(npc);
      this.intColliders.push({ pos: new THREE.Vector3(a.x, 0, a.z), r: 0.55 });
      this.intInteractables.push({
        pos: new THREE.Vector3(a.x, a.y, a.z), radius: 1.5,
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
    tagNpc(vesna, 'Merchant Vesna');
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
    tagNpc(korr, 'Gemcutter Korr');
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
      { x: -6, z: -8, top: 0xc4582a, line: 'I sat on the Ascendancy stairs for an hour. The little Vulfenix statue LOOKED at me. I\'m not saying it\'s alive. I\'m not saying it isn\'t.' },
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
      tagNpc(npc, crowdName(`aspirant:${a.x},${a.z}`));
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
      { x: -26.2, z: -18.6, label: 'Aljay', color: '#f2603a', kind: 'poi' },
      { x: -26.7, z: -13, label: 'Greggy', color: '#f2d23a', kind: 'poi' },
      { x: -26.2, z: -7.4, label: 'Onnel', color: '#4ec45e', kind: 'poi' },
      { x: -12.4, z: -13, label: 'Ascendancy Stairs', color: '#f2c14e', kind: 'poi' },
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

  // ================= the Aurelian Hall — Mayor Airah's civic seat =================
  /**
   * A total remake of the Aurelian Hall as a University-style ROOM-GRAPH.
   *
   * Three floors, each its own flat scene. You change floors by interacting with
   * a staircase — an instant scene-swap, no climbing — and step into side rooms
   * through doors the same way. The graph:
   *
   *        ┌─ registry (Records Office)
   *   f1 ──┤  ▲ stairs
   *   Lobby└─────────── f2 ──┬─ archives (Deep Archives)
   *                    Gallery├─ mayors  (Hall of Mayors)
   *                     ▲ stairs
   *                          └─ f3 ──── office (Mayor's Grand Suite)
   *                          Antechamber
   *
   * Every original soul keeps their place and their words; only the stone is new.
   */
  private buildHall(): void {
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.resetInteriorRig();
    // the Hall is a flat room-graph — no physical storeys, no ramps, no culling
    this.intCamRig = 'room';
    this.intGroundH = null;
    this.intFloors = 1;
    this.intFloorMarkers = null;
    this.intFloorNames = [];
    this.intUpperFloors = [];

    this.hallRooms = new Map<HallId, HallRoom>();
    this.buildHallLobby();
    this.buildHallRegistry();
    this.buildHallMezzanine();
    this.buildHallArchives();
    this.buildHallMayors();
    this.buildHallAntechamber();
    this.buildHallOffice();
  }

  /** Teleport between Hall rooms: swap the active scene, re-point the interior
   *  state at the destination room, and set the player + camera down at `spawn`. */
  private enterHallRoom(id: HallId, spawn?: THREE.Vector3, spawnRotY?: number): void {
    const r = this.hallRooms!.get(id)!;
    this.tamer.parent?.remove(this.tamer);
    this.hallCurrent = id;
    this.interiorScene = r.scene;
    this.intInteractables = r.interactables;
    this.intColliders = r.colliders;
    this.intNpcs = r.npcs;
    this.intMarkers = r.markers;
    this.intRoom = { w: r.w, d: r.d };
    this.intName = r.title;
    this.intCamH = r.camH;
    this.intCamD = r.camD;
    r.scene.add(this.tamer);
    const p = spawn ?? r.spawn;
    this.tamer.position.set(p.x, 0, p.z);
    this.tamer.rotation.y = spawnRotY ?? r.spawnRotY;
    worldOrbit.reset();
    this.camera.position.set(p.x, r.camH, p.z + r.camD);
    this.camera.lookAt(p.x, 1.2, p.z);
    toast(r.title, 'gold');
  }

  // ---------------- room-graph building blocks ----------------

  private hallRoom(id: HallId, title: string, w: number, d: number, opts: Partial<HallRoom> = {}): HallRoom {
    const r: HallRoom = {
      scene: new THREE.Scene(), w, d,
      interactables: [], colliders: [], npcs: [], markers: [],
      spawn: new THREE.Vector3(0, 0, d / 2 - 2.4), spawnRotY: Math.PI,
      camH: 7.4, camD: 9.0, title,
      ...opts,
    };
    this.hallRooms!.set(id, r);
    return r;
  }

  /** A visual wall segment + a line of colliders along it. */
  private hallWall(r: HallRoom, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: THREE.Material): void {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 0.01) return;
    const wh = y1 - y0;
    const isHoriz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(isHoriz ? dist : 0.4, wh, isHoriz ? 0.4 : dist), mat);
    wall.position.set((x0 + x1) / 2, y0 + wh / 2, (z0 + z1) / 2);
    wall.receiveShadow = true;
    r.scene.add(wall);
    const steps = Math.max(1, Math.round(dist / 0.8));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      r.colliders.push({ pos: new THREE.Vector3(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t), r: 0.6 });
    }
  }

  /** North/west/east walls full height; the south (camera-side) wall is a low
   *  parapet so the chase-cam looks over it. `southGap` leaves a centred opening. */
  private hallShell(r: HallRoom, wallMat: THREE.Material, ceilColor: number, h: number, southGap = 0): void {
    const HW = r.w / 2, HD = r.d / 2;
    this.hallWall(r, -HW, -HD, HW, -HD, 0, h, wallMat);     // north
    this.hallWall(r, -HW, -HD, -HW, HD, 0, h, wallMat);     // west
    this.hallWall(r, HW, -HD, HW, HD, 0, h, wallMat);       // east
    const sy = 1.25;
    if (southGap > 0) {
      this.hallWall(r, -HW, HD, -southGap, HD, 0, sy, wallMat);
      this.hallWall(r, southGap, HD, HW, HD, 0, sy, wallMat);
    } else {
      this.hallWall(r, -HW, HD, HW, HD, 0, sy, wallMat);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ color: ceilColor, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    r.scene.add(ceil);
  }

  /** Floor plate, optionally with a rectangular hole cut for a down-stairwell. */
  private hallFloor(r: HallRoom, mat: THREE.Material, hole?: [number, number, number, number]): void {
    const HW = r.w / 2, HD = r.d / 2;
    const slab = (x0: number, x1: number, z0: number, z1: number) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, -0.15, (z0 + z1) / 2);
      m.receiveShadow = true;
      r.scene.add(m);
    };
    if (!hole) { slab(-HW, HW, -HD, HD); return; }
    const [hx0, hx1, hz0, hz1] = hole;
    slab(-HW, HW, -HD, hz0);   // north band
    slab(-HW, HW, hz1, HD);    // south band
    slab(-HW, hx0, hz0, hz1);  // west of the hole
    slab(hx1, HW, hz0, hz1);   // east of the hole
  }

  /** A thin decorative rug/runner laid flush on a floor. */
  private hallRug(r: HallRoom, x0: number, x1: number, z0: number, z1: number, mat: THREE.Material): void {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    r.scene.add(rug);
  }

  private hallLamp(r: HallRoom, x: number, y: number, z: number, col: number, intensity: number, dist = 22): void {
    const l = new THREE.PointLight(col, intensity, dist);
    l.position.set(x, y, z);
    r.scene.add(l);
  }

  private hallNpc(
    r: HallRoom, opts: Parameters<typeof makeVoxelHuman>[0],
    x: number, z: number, rotY: number, name: string,
    label: string, handler: () => Promise<void>, seated = false,
  ): THREE.Group {
    const g = makeVoxelHuman(opts);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    if (seated) setVoxelSeated(g, true, 0.42);
    tagNpc(g, name);
    r.scene.add(g);
    r.npcs.push(g);
    r.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
    r.interactables.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.8, label, handler });
    return g;
  }

  /** The shared gold + pale-stone materials every floor of the Hall wears. */
  private hallGold(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.28 });
  }
  private hallStone(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ map: stoneTexture('#e2dbe8', '#b8aec8', 2), roughness: 0.7 });
  }

  /** A slim gold cornice that hugs the four wall-tops — a frame, never a slab over
   *  the open floor (a full-footprint slab here reads as a brown plane smeared
   *  across the view, because the overhead chase-cam looks straight down through it). */
  private hallCornice(r: HallRoom, mat: THREE.Material, y: number): void {
    const HW = r.w / 2, HD = r.d / 2, t = 0.3, h = 0.24;
    const add = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      r.scene.add(m);
    };
    add(r.w, t, 0, -HD + 0.15);   // north (full-height wall)
    add(t, r.d, -HW + 0.15, 0);   // west
    add(t, r.d, HW - 0.15, 0);    // east
    // the south wall is a low parapet (camera side) — a rail there would float
  }

  /** A grand flight rising against the north wall to a glowing arch — interact at
   *  the foot to climb instantly to the next floor. Solid (you can't walk it). */
  private hallStairUp(
    r: HallRoom, cx: number, footZ: number,
    target: HallId, spawn: THREE.Vector3, spawnRotY: number, markerLabel: string,
  ): void {
    const s = r.scene;
    const gold = this.hallGold();
    const stone = this.hallStone();
    const stepMat = new THREE.MeshStandardMaterial({ map: marbleTexture('#fbf9f6', '#bcb0cc', 1), roughness: 0.4 });
    const runnerMat = new THREE.MeshStandardMaterial({ map: carpetTexture('#5a1730', '#d8b56a', 2), roughness: 0.9 });
    const wallZ = -r.d / 2;
    const topZ = wallZ + 0.7;
    const N = 9, width = 4.2;
    const rise = 2.7;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const z = footZ + (topZ - footZ) * t;
      const y = rise * t;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(width, 0.34, (footZ - topZ) / N + 0.18), stepMat);
      tread.position.set(cx, y - 0.17, z);
      tread.receiveShadow = true;
      s.add(tread);
      const carpet = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.06, (footZ - topZ) / N + 0.18), runnerMat);
      carpet.position.set(cx, y + 0.02, z);
      s.add(carpet);
    }
    // flanking stringers + gold handrails
    const len = Math.hypot(rise, footZ - topZ);
    const ang = Math.atan2(rise, footZ - topZ);
    for (const side of [-1, 1]) {
      const railX = cx + side * width / 2;
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, len), stone);
      stringer.position.set(railX, rise / 2 + 0.1, (footZ + topZ) / 2);
      stringer.rotation.x = ang;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), gold);
      rail.position.set(railX, rise / 2 + 0.85, (footZ + topZ) / 2);
      rail.rotation.x = ang;
      s.add(stringer, rail);
    }
    // a tall arch + glow on the wall where the flight "continues up"
    const arch = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.4, 0.6), stone);
    arch.position.set(cx, rise + 2.2, wallZ + 0.3);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.2, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    glow.position.set(cx, rise + 0.7, wallZ + 0.35);
    s.add(arch, glow);
    // newel lamps either side of the foot
    for (const side of [-1, 1]) {
      const px = cx + side * (width / 2 + 0.35);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 8), stone);
      post.position.set(px, 0.55, footZ + 0.2);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.2),
        new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 1.2 }));
      orb.position.set(px, 1.32, footZ + 0.2);
      orb.name = 'legendpulse';
      s.add(post, orb);
      this.hallLamp(r, px, 1.4, footZ + 0.2, 0xffd98a, 4, 7);
    }
    // ring the flight so you can't stand on the steps; foot stays open
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const z = footZ + (topZ - footZ) * t;
      for (const side of [-1, 1]) r.colliders.push({ pos: new THREE.Vector3(cx + side * (width / 2 + 0.2), 0, z), r: 0.5 });
      if (i > 1) r.colliders.push({ pos: new THREE.Vector3(cx, 0, z), r: 0.6 });
    }
    const stand = new THREE.Vector3(cx, 0, footZ + 1.1);
    r.interactables.push({
      pos: stand, radius: 1.8,
      label: `Press <b>E</b> — ${markerLabel}`,
      handler: async () => { this.enterHallRoom(target, spawn, spawnRotY); },
    });
    r.markers.push({ x: cx, z: footZ, label: markerLabel.replace(/^climb to /i, '▲ '), color: '#d8b56a', kind: 'poi' });
  }

  /** A railed stairwell sinking through a floor hole to a warm glow below —
   *  interact at the mouth to descend instantly. Pair with a matching floor hole. */
  private hallStairDown(
    r: HallRoom, hx0: number, hx1: number, hz0: number, hz1: number,
    target: HallId, spawn: THREE.Vector3, spawnRotY: number, markerLabel: string,
  ): void {
    const s = r.scene;
    const gold = this.hallGold();
    const stone = this.hallStone();
    const stepMat = new THREE.MeshStandardMaterial({ map: marbleTexture('#fbf9f6', '#bcb0cc', 1), roughness: 0.4 });
    const runnerMat = new THREE.MeshStandardMaterial({ map: carpetTexture('#5a1730', '#d8b56a', 2), roughness: 0.9 });
    const cx = (hx0 + hx1) / 2;
    const depth = 3.0;
    const N = 8;
    // steps descend from the south mouth (hz1) down toward the north (hz0)
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const z = hz1 - (hz1 - hz0) * t;
      const y = -depth * t;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0 - 0.3, 0.3, (hz1 - hz0) / N + 0.12), stepMat);
      tread.position.set(cx, y - 0.15, z);
      s.add(tread);
      const carpet = new THREE.Mesh(new THREE.BoxGeometry((hx1 - hx0) * 0.45, 0.05, (hz1 - hz0) / N + 0.12), runnerMat);
      carpet.position.set(cx, y + 0.01, z);
      s.add(carpet);
    }
    // well shaft walls (visual enclosure — the rim is ringed with colliders below)
    const shaft = new THREE.MeshStandardMaterial({ map: stoneTexture('#3a2f48', '#241c30', 1), roughness: 0.85 });
    this.hallWall(r, hx0, hz0, hx1, hz0, -depth - 0.5, 0, shaft); // far (north) wall + its colliders
    const shaftSide = (x: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, depth + 0.5, hz1 - hz0), shaft);
      wall.position.set(x, -(depth + 0.5) / 2, (hz0 + hz1) / 2);
      s.add(wall);
    };
    shaftSide(hx0); shaftSide(hx1);
    const landing = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0, 0.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 0.5, roughness: 0.5 }));
    landing.position.set(cx, -depth - 0.1, hz0 + 0.8);
    s.add(landing);
    this.hallLamp(r, cx, -depth + 0.6, hz0 + 0.8, 0xffd98a, 6, 8);
    // top-rim railings on the three closed sides (mouth = south, left open)
    const railRun = (x0: number, z0: number, x1: number, z1: number) => {
      const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.1, 0.1, horiz ? 0.1 : len), gold);
      top.position.set((x0 + x1) / 2, 0.95, (z0 + z1) / 2);
      s.add(top);
      const n = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), stone);
        bal.position.set(x0 + (x1 - x0) * t, 0.45, z0 + (z1 - z0) * t);
        s.add(bal);
      }
    };
    railRun(hx0, hz0, hx0, hz1);  // west
    railRun(hx1, hz0, hx1, hz1);  // east
    railRun(hx0, hz0, hx1, hz0);  // north
    // ring the whole well so the player can't walk out over the void
    const ringN = 6;
    for (let i = 0; i <= ringN; i++) {
      const tx = hx0 + (hx1 - hx0) * (i / ringN);
      const tz = hz0 + (hz1 - hz0) * (i / ringN);
      r.colliders.push({ pos: new THREE.Vector3(tx, 0, hz0), r: 0.55 });
      r.colliders.push({ pos: new THREE.Vector3(tx, 0, hz1), r: 0.55 });
      r.colliders.push({ pos: new THREE.Vector3(hx0, 0, tz), r: 0.55 });
      r.colliders.push({ pos: new THREE.Vector3(hx1, 0, tz), r: 0.55 });
    }
    const stand = new THREE.Vector3(cx, 0, hz1 + 1.2);
    r.interactables.push({
      pos: stand, radius: 1.8,
      label: `Press <b>E</b> — ${markerLabel}`,
      handler: async () => { this.enterHallRoom(target, spawn, spawnRotY); },
    });
    r.markers.push({ x: cx, z: hz1, label: markerLabel.replace(/^descend to /i, '▼ '), color: '#d8b56a', kind: 'poi' });
  }

  /** A real door on a wall with a floating sign — interact to step through to
   *  another room (a side room, or back to the floor it opens off). */
  private hallDoor(
    r: HallRoom, side: 'n' | 's' | 'e' | 'w', offset: number,
    label: string, color: string, markerLabel: string,
    target: HallId, spawn: THREE.Vector3, spawnRotY: number, wide = false,
  ): void {
    const s = r.scene;
    const g = new THREE.Group();
    const w = wide ? 2.6 : 1.4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 3.1, 0.5), this.hallStone());
    frame.position.y = 1.55;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 2.7, 0.18),
      new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.8 }));
    panel.position.set(0, 1.35, 0.18);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.2 }));
    knob.position.set(w * 0.32, 1.2, 0.3);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.24, 0.56),
      new THREE.MeshStandardMaterial({ color: parseInt(color.slice(1), 16), emissive: parseInt(color.slice(1), 16), emissiveIntensity: 0.3 }));
    lintel.position.y = 3.2;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.32 }));
    glow.position.set(0, 1.35, 0.28);
    g.add(frame, panel, knob, lintel, glow);

    const HW = r.w / 2, HD = r.d / 2;
    let pos: THREE.Vector3, rotY = 0;
    if (side === 'n') { pos = new THREE.Vector3(offset, 0, -HD); rotY = 0; }
    else if (side === 's') { pos = new THREE.Vector3(offset, 0, HD); rotY = Math.PI; }
    else if (side === 'w') { pos = new THREE.Vector3(-HW, 0, offset); rotY = Math.PI / 2; }
    else { pos = new THREE.Vector3(HW, 0, offset); rotY = -Math.PI / 2; }
    g.position.copy(pos);
    g.rotation.y = rotY;
    s.add(g);
    const inward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)); // the door's front faces into the room
    this.label3d(s, label, color, pos.clone().setY(side === 's' ? 3.2 : 3.9).add(inward.clone().multiplyScalar(0.5)), side === 's' ? 2.8 : 3.4);
    const stand = pos.clone().add(inward.clone().multiplyScalar(1.3));
    r.interactables.push({
      pos: stand, radius: 1.7,
      label: `Press <b>E</b> — ${label}`,
      handler: async () => { this.enterHallRoom(target, spawn, spawnRotY); },
    });
    r.markers.push({ x: stand.x, z: stand.z, label: markerLabel, color: '#e8d9a8', kind: 'door' });
  }

  // ---------------- the seven rooms ----------------

  // ===== FLOOR 1 — the Grand Lobby =====
  private buildHallLobby(): void {
    const r = this.hallRoom('f1', 'Aurelian Hall — Grand Lobby', 30, 22, { camH: 7.8, camD: 9.6 });
    r.spawn = new THREE.Vector3(0, 0, 7.0);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#34243c', '#160d1e');
    const gold = this.hallGold();
    const stone = this.hallStone();
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#ffffff', '#eaeef5', 8), roughness: 0.25, metalness: 0.15 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#6a4a6e', '#3a2438', '#d8b56a', 3), roughness: 0.85 });

    this.hallShell(r, wallMat, 0x2a1e30, 6, 1.9);
    this.hallFloor(r, floorMat);
    // slim gold cornice hugging the wall-tops (NOT a slab over the floor)
    this.hallCornice(r, gold, 5.4);

    s.add(new THREE.AmbientLight(0xc2b6d4, 0.9));
    s.add(new THREE.HemisphereLight(0xffe8cc, 0x47384f, 0.6));
    this.hallLamp(r, -7, 4.8, -3, 0xffe1b0, 11);
    this.hallLamp(r, 7, 4.8, 3, 0xffe1b0, 10);
    this.hallLamp(r, 0, 5.2, 5, 0xffe6c0, 9);

    // the civic-seal fountain — the heart of the lobby
    cFountain(0, 0, 3.0, s, r.colliders);
    r.markers.push({ x: 0, z: 3.0, label: 'Civic Seal', color: '#f2c14e', kind: 'poi' });

    // reception desk + Deputy Clerk Pell
    const deskMat = new THREE.MeshStandardMaterial({ map: plankTexture('#5a3a22', 2), roughness: 0.6 });
    cDesk(0, 0, -3.0, 1.5, -Math.PI / 2.5, Math.PI / 2.5, 1.1, 0.8, deskMat, s);
    r.colliders.push({ pos: new THREE.Vector3(-1.4, 0, -2.2), r: 0.8 }, { pos: new THREE.Vector3(0, 0, -1.6), r: 0.8 }, { pos: new THREE.Vector3(1.4, 0, -2.2), r: 0.8 });
    this.hallNpc(r, { top: 0x3a6a8a, hair: 0x2a2018, cap: null, hairstyle: 'buns', skin: 0xd29a6a }, 0, -3.9, 0, 'Deputy Clerk Pell',
      'Press <b>E</b> — speak to the Deputy Clerk', async () => {
        const pick = await choose('Deputy Clerk Pell',
          'Welcome to the Aurelian Hall, the seat of Mayor Airah herself! Mind the marble, it’s just been polished. How can the Hall serve you?',
          ['Is the Mayor really in?', 'What is this building?', 'Where do the stairs lead?', 'Just looking, thank you']);
        if (pick === 0) await say('Deputy Clerk Pell', 'She is ALWAYS in. Top floor, under the lantern. Sixteen years and I have never once arrived before her or left after her. The whole city sleeps better knowing that window stays lit. Climb up — she sees everyone. That’s rather the point of her.');
        else if (pick === 1) await say('Deputy Clerk Pell', 'The Aurelian Hall — civic seat of Haven, named for Aurelia who made the First Bond. The Mayor had it built pale so the dust of the rebuild wouldn’t show, then kept it pale because she liked being able to see exactly how clean her city was. There’s a metaphor in there. She’d deny it.');
        else if (pick === 2) await say('Deputy Clerk Pell', 'The grand stair climbs to the Records floor — our whole history, and a wall of letters from people the Mayor’s helped. Up again to the Hall of Mayors, then the Mayor’s own Suite under the lantern. The Registry Office is just there off the lobby, if it’s papers you’re after.');
      });
    r.markers.push({ x: 0, z: -3.9, label: 'Clerk Pell', color: '#3a8ad9', kind: 'npc' });

    // waiting bench + the two petitioners
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.8),
      new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 2), roughness: 0.7 }));
    bench.position.set(-8, 0.42, 8);
    s.add(bench);
    r.colliders.push({ pos: new THREE.Vector3(-8, 0, 8), r: 1.6 });
    this.hallNpc(r, { top: 0x8a5a3a, hair: 0xd8d8d8, cap: null, hairstyle: 'classic', skin: 0xb07848 }, -8.7, 8, Math.PI, 'Old Petitioner',
      'Press <b>E</b> — chat with the waiting citizen', proudHall('Old Petitioner', [
        'Forty years I’ve brought my troubles to this Hall. Mayor Airah’s the fourth name on that door and the only one who learned mine. I’d wait all day. I have, twice. Worth it.',
        'My grandson says no continent’s had a real leader in sixteen years. I tell him: come to Haven, boy. We have one. We just don’t let the news-crystals near her.',
      ]), true);
    this.hallNpc(r, { top: 0x4a7a4a, hair: 0x35261a, cap: null, hairstyle: 'curly', skin: 0xe8b48a }, -7.3, 8, Math.PI, 'Young Petitioner',
      'Press <b>E</b> — chat with the waiting citizen', proudHall('Young Petitioner', [
        'I’m asking the Mayor to fix the pier lamps. Half of them out. Funny thing — the working ones all have this lovely little hand-folded pane in them, no maker’s mark. Nobody knows who makes those.',
        'They say if your petition’s honest she’ll have it sorted by the time you’re back down the stairs. So I practiced being honest on the way up. Harder than it sounds.',
      ]), true);
    r.markers.push({ x: -8, z: 8, label: 'Petitioners', color: '#b08a5a', kind: 'npc' });

    // Lamplighter Brenn
    this.hallNpc(r, { top: 0x3a3a4a, hair: 0x2a2018, cap: 0xc9a24a, hairstyle: 'classic', skin: 0x8a5a36 }, 7, -2.5, -Math.PI / 1.5, 'Lamplighter Brenn',
      'Press <b>E</b> — talk to the Lamplighter', async () => {
        await conversation([
          ['Lamplighter Brenn', 'Best job in Haven, lighting the Mayor’s city. You know the lantern up top — the great gold one? Never goes dark. Mayor says it’s so her husband can always find his way home.'],
          ['Lamplighter Brenn', 'And here’s the thing nobody believes me on: some of my lamps have a panel in them finer than anything the guild makes. Hand-folded. I asked the Mayor once who made them. She just smiled and said, "a hobbyist." A HOBBYIST. In MY lamps.'],
        ]);
      });
    r.markers.push({ x: 7, z: -2.5, label: 'Lamplighter', color: '#c9a24a', kind: 'npc' });

    // the Haven child, tearing about
    this.hallNpc(r, { top: 0xf2603a, hair: 0x8a3a1a, cap: null, hairstyle: 'spiky', skin: 0xe8b48a }, 4, 6, Math.PI / 2, 'Haven Child',
      'Press <b>E</b> — talk to the child', proudHall('Haven Child', [
        'I’m the DAWNFLAME! VWOOSH! …Mama works here. Real mama, the Mayor mama. The Dawnflame’s the OTHER one. He’s my—no wait that’s a secret. VWOOSH!',
        'Mayor Airah gave me a honey-roll and said heroes share. So I shared. With me. Later.',
      ]));

    // the Hall Steward, holding the door
    this.hallNpc(r, { top: 0x6a1e3a, hair: 0x2a2018, cap: 0xc9a24a, hairstyle: 'classic', skin: 0xb07848 }, 10, 7, -Math.PI / 1.4, 'Hall Steward',
      'Press <b>E</b> — ask the Hall Steward the way up', proudHall('Hall Steward', [
        'Up the grand stair to the Records floor, then on to the Hall of Mayors, and up once more to the Mayor’s Suite under the lantern. Take your time — Haven looks lovely from every landing.',
        'Proud to hold this door. My mother held it before me. The Mayor knows that. She knows everyone’s mother. It’s a little uncanny and entirely why we love her.',
      ]));
    r.markers.push({ x: 10, z: 7, label: 'Steward', color: '#c9a24a', kind: 'npc' });

    // potted palms flanking the grand stair
    for (const px of [-4.6, 4.6]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.7, 12), stone);
      pot.position.set(px, 0.35, -8.6);
      const fronds = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x4ec45e, roughness: 0.8 }));
      fronds.position.set(px, 1.5, -8.6); fronds.name = 'foliage';
      s.add(pot, fronds);
      r.colliders.push({ pos: new THREE.Vector3(px, 0, -8.6), r: 0.6 });
    }

    // the grand stair up to Records (Floor 2)
    this.hallStairUp(r, 0, -7.2, 'f2', new THREE.Vector3(6.0, 0, 8.5), Math.PI, 'climb to the Records floor');

    // the Registry Office, off the west wall
    this.hallDoor(r, 'w', 4.5, '📜 Registry Office', '#4ec45e', '📜 Registry', 'registry', new THREE.Vector3(0, 0, 4.0), Math.PI);

    // the way back out to Haven — a glowing portal on the south wall
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    portal.position.set(0, 1.9, r.d / 2 - 0.25); portal.name = 'portal';
    s.add(portal);
    const portalFrame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 0.4), gold);
    portalFrame.position.set(0, 3.75, r.d / 2 - 0.25);
    s.add(portalFrame);
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, r.d / 2 - 1.5), radius: 1.9,
      label: 'Press <b>E</b> — step back out to Haven',
      handler: async () => this.exitHouse(),
    });
    r.markers.push({ x: 0, z: r.d / 2 - 1.5, color: '#e8d9a8', kind: 'door' });
  }

  // ===== FLOOR 1 side room — the Registry Office =====
  private buildHallRegistry(): void {
    const r = this.hallRoom('registry', 'Aurelian Hall — Registry Office', 20, 15, { camH: 6.4, camD: 7.6 });
    r.spawn = new THREE.Vector3(0, 0, 4.0);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#241a14', '#0e0a08');
    const stone = this.hallStone();
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#11284a', '#ffffff', 8), roughness: 0.25, metalness: 0.1 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#3a2a44', '#241626', '#d8b56a', 3), roughness: 0.85 });
    this.hallShell(r, wallMat, 0x1c1422, 5.4, 1.3);
    this.hallFloor(r, floorMat);
    this.hallRug(r, -8, 8, -6, 6, new THREE.MeshStandardMaterial({ map: carpetTexture('#0f4c3a', '#d8b56a', 1), roughness: 0.9 }));

    s.add(new THREE.AmbientLight(0xc2b6d4, 0.85));
    s.add(new THREE.HemisphereLight(0xffe8cc, 0x47384f, 0.55));
    this.hallLamp(r, 0, 4.4, 0, 0xffe1b0, 10);
    this.hallLamp(r, -6, 3.4, -2, 0xff7a3a, 5, 9);

    // the registry desk + Records Clerk Tovi
    const deskMat = new THREE.MeshStandardMaterial({ map: plankTexture('#5a3a22', 2), roughness: 0.6 });
    cDesk(0, 0, -3.2, 1.0, -Math.PI / 3, Math.PI / 3, 1.1, 0.8, deskMat, s);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, -3.2), r: 1.2 });
    this.hallNpc(r, { top: 0x4ec45e, hair: 0x6a3a1a, cap: null, hairstyle: 'mohawk', skin: 0xe8b48a }, 0, -4.4, 0, 'Records Clerk Tovi',
      'Press <b>E</b> — talk to the Records Clerk', async () => {
        await conversation([
          ['Records Clerk Tovi', 'You want a secret the Records don’t hold? I met him. The Dawnflame. Out past the hills toward New Salmonan, where the broadcast crystals go quiet. Old man, beat-up hat, line in the water.'],
          ['Records Clerk Tovi', 'Didn’t know him till he laughed — you can’t mistake that laugh, it’s on every anniversary special. He just said, "the fish here don’t want a quote either." Then the Mayor’s carriage came for him and he was gone. Tell no one. I’ve told everyone.'],
        ]);
      });
    r.markers.push({ x: 0, z: -4.4, label: 'Clerk Tovi', color: '#4ec45e', kind: 'npc' });

    // bookshelves along the west wall
    for (const sz of [-4.5, 4.5]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 2.5), new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 }));
      shelf.position.set(-9.4, 2.0, sz);
      s.add(shelf);
      r.colliders.push({ pos: new THREE.Vector3(-9.4, 0, sz), r: 1.4 });
    }

    // registry fireplace on the west wall
    const fp = new THREE.Group();
    fp.position.set(-9.4, 0, -1.0);
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 2.0), stone);
    hearth.position.set(0, 0.9, 0); fp.add(hearth);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.0, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    hole.position.set(0.15, 0.6, 0); fp.add(hole);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff4500, emissiveIntensity: 2.0 }));
    fire.position.set(0.15, 0.35, 0); fire.name = 'flame'; fp.add(fire);
    const fl = new THREE.PointLight(0xff6600, 8, 8); fl.position.set(0.2, 0.4, 0); fp.add(fl);
    s.add(fp);
    r.colliders.push({ pos: new THREE.Vector3(-9.4, 0, -1.0), r: 1.0 });
    r.interactables.push({
      pos: new THREE.Vector3(-8.0, 0, -1.0), radius: 1.8,
      label: 'Press <b>E</b> — warm yourself by the registry fire',
      handler: async () => { await say('Registry Fireplace', 'A crackling stone hearth keeping the city records registry room warm. The wood smells of cedar and sea-salt.'); },
    });

    this.hallDoor(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', '🚪 Lobby', 'f1', new THREE.Vector3(-11.5, 0, 5.5), Math.PI / 2);
  }

  // ===== FLOOR 2 — the Mezzanine Gallery (the hub) =====
  private buildHallMezzanine(): void {
    const r = this.hallRoom('f2', 'Aurelian Hall — Records & Gallery', 28, 20, { camH: 7.6, camD: 9.2 });
    r.spawn = new THREE.Vector3(0, 0, 7.0);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#1a1230', '#0a0814');
    const gold = this.hallGold();
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#11284a', '#c9a24a', 8), roughness: 0.25, metalness: 0.18 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#3a2e5a', '#1e1838', '#d8b56a', 3), roughness: 0.85 });

    // down-stairwell to the lobby cut from the south-east floor
    const well: [number, number, number, number] = [7, 11, 3, 7];
    this.hallShell(r, wallMat, 0x14102a, 6, 0);
    this.hallFloor(r, floorMat, well);
    this.hallCornice(r, gold, 5.4);

    s.add(new THREE.AmbientLight(0xb6aed0, 0.9));
    s.add(new THREE.HemisphereLight(0xffe6c0, 0x3a2e4a, 0.6));
    this.hallLamp(r, -7, 4.8, -4, 0xffe1b0, 11);
    this.hallLamp(r, 6, 4.8, 4, 0xffe6c0, 10);
    this.hallLamp(r, 0, 5.2, -5, 0xffe6c0, 9);

    // a pair of draped civic banners frame the up-stair
    cHangingBanner(-3.2, 4.6, -9.4, 0, s);
    cHangingBanner(3.2, 4.6, -9.4, 0, s);

    // a glowing skylight oculus set into the ceiling — faces DOWN only, so the
    // overhead chase-cam (which sits above the ceiling) never sees it as a disc
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(3.0, 32),
      new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffe6c0, emissiveIntensity: 0.45, roughness: 0.5 }));
    oculus.rotation.x = Math.PI / 2;
    oculus.position.set(-3, 5.94, -1);
    s.add(oculus);

    // a reading plinth in the middle of the landing — drifting motes above it
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 12), this.hallStone());
    plinth.position.set(-3, 0.5, -1); s.add(plinth);
    r.colliders.push({ pos: new THREE.Vector3(-3, 0, -1), r: 1.1 });
    const tome = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.7), new THREE.MeshStandardMaterial({ color: 0x5a1730, roughness: 0.6 }));
    tome.position.set(-3, 1.1, -1); tome.rotation.x = -0.35; s.add(tome);
    for (let i = 0; i < 5; i++) {
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 1.0 }));
      const by = 1.6 + Math.random() * 2.4;
      mote.position.set(-3 + (Math.random() - 0.5) * 1.4, by, -1 + (Math.random() - 0.5) * 1.4);
      mote.name = 'aetherfloat'; mote.userData.baseY = by; mote.userData.ph = Math.random() * 6.28;
      s.add(mote);
    }
    r.interactables.push({
      pos: new THREE.Vector3(-3, 0, 0.4), radius: 1.7,
      label: 'Press <b>E</b> — read the open civic chronicle',
      handler: async () => { await say('The Civic Chronicle', 'A great vellum book, open to today. Every entry is a name and a kindness done: a pier lamp relit, a debt forgiven, a child found before dark. The Mayor signs none of them. The last line, in her hand, simply reads: "more tomorrow."'); },
    });

    // up to the Hall of Mayors / Mayor's Suite (Floor 3)
    this.hallStairUp(r, 0, -6.6, 'f3', new THREE.Vector3(3.5, 0, 6.8), Math.PI, 'climb to the Mayor’s floor');
    // down to the lobby
    this.hallStairDown(r, well[0], well[1], well[2], well[3], 'f1', new THREE.Vector3(3.0, 0, -5.0), 0, 'descend to the Lobby');

    // side rooms: Deep Archives (west) and Hall of Mayors (east)
    this.hallDoor(r, 'w', -2, '📚 Deep Archives', '#9ab0d8', '📚 Archives', 'archives', new THREE.Vector3(0, 0, 4.0), Math.PI);
    this.hallDoor(r, 'e', 2, '🖼 Hall of Mayors', '#c9a24a', '🖼 Mayors', 'mayors', new THREE.Vector3(0, 0, 5.0), Math.PI);
  }

  // ===== FLOOR 2 side room — the Deep Archives =====
  private buildHallArchives(): void {
    const r = this.hallRoom('archives', 'Aurelian Hall — Deep Archives', 24, 16, { camH: 6.8, camD: 8.0 });
    r.spawn = new THREE.Vector3(0, 0, 4.0);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#0e1430', '#060812');
    const gold = this.hallGold();
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#0c1838', '#1a2a52', 8), roughness: 0.3, metalness: 0.1 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#2a2450', '#161232', '#9ab0d8', 3), roughness: 0.88 });
    this.hallShell(r, wallMat, 0x10142e, 5.6, 1.4);
    this.hallFloor(r, floorMat);
    this.hallRug(r, -11, 11, -7, 7, new THREE.MeshStandardMaterial({ map: carpetTexture('#112244', '#d8b56a', 1), roughness: 0.9 }));

    s.add(new THREE.AmbientLight(0xaab0d8, 0.85));
    s.add(new THREE.HemisphereLight(0xffe6c0, 0x2a2e50, 0.5));
    this.hallLamp(r, -6, 4.4, 0, 0xffe1b0, 10);
    this.hallLamp(r, 6, 4.4, 0, 0xffe1b0, 10);

    cReadingDesk(-7, -2, 0, s, r.colliders);
    cReadingDesk(-7, 3, 0, s, r.colliders);

    // bookshelves along the west + north walls
    for (const sz of [-5.5, -2.5, 2.5, 5.5]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 2.4), new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 }));
      shelf.position.set(-11.4, 2.0, sz); s.add(shelf);
      r.colliders.push({ pos: new THREE.Vector3(-11.4, 0, sz), r: 1.4 });
    }
    for (const sx of [-4, 0, 4]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.0, 0.5), new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 }));
      shelf.position.set(sx, 2.0, -7.4); s.add(shelf);
      r.colliders.push({ pos: new THREE.Vector3(sx, 0, -7.4), r: 1.3 });
    }

    // Archivist Maelis
    this.hallNpc(r, { top: 0x2a4a6a, hair: 0xd8d8d8, cap: null, hairstyle: 'classic', skin: 0xd29a6a, robe: true }, 4, -4, -Math.PI / 4, 'Archivist Maelis',
      'Press <b>E</b> — consult the Archivist', async () => {
        const pick = await choose('Archivist Maelis',
          'The Records of Haven, friend — every brick the Mayor laid. What chapter would you like?',
          ['How did Airah become Mayor?', 'How does she keep the seat?', 'Tell me of the rebuild', 'Nothing today']);
        if (pick === 0) await say('Archivist Maelis', AIRAH.rise);
        else if (pick === 1) await say('Archivist Maelis', AIRAH.untouchable);
        else if (pick === 2) await say('Archivist Maelis', 'When the Legion War broke the walls, Haven was a frightened ring of rubble. Airah didn’t make speeches. She made LINES — chalk lines, on the ground, where the masons should build. The doubled Coliseum, the market lanes, the Sanctum by the spring, the five Grand Houses on their shoulder of stone. We followed the chalk. We’re still following it.');
      });
    r.markers.push({ x: 4, z: -4, label: 'Archivist', color: '#9ab0d8', kind: 'npc' });

    // the Gallery of Gratitude, on the east wall
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.0), new THREE.MeshStandardMaterial({ color: 0xf2ead0, emissive: 0xf2ead0, emissiveIntensity: 0.25, roughness: 0.6 }));
    board.rotation.y = -Math.PI / 2; board.position.set(11.4, 2.4, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 6.4), gold);
    frame.position.set(11.5, 2.4, 0); s.add(frame, board);
    for (let i = 0; i < 12; i++) {
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ color: [0xffffff, 0xffe6e6, 0xe6f0ff][i % 3], roughness: 0.8 }));
      note.rotation.y = -Math.PI / 2; note.position.set(11.28, 1.4 + (i % 3) * 0.7, -2.0 + Math.floor(i / 3) * 1.1); s.add(note);
    }
    r.interactables.push({
      pos: new THREE.Vector3(9.8, 0, 0), radius: 2.2,
      label: 'Press <b>E</b> — read the Gallery of Gratitude',
      handler: async () => { await say('Gallery of Gratitude', '"To Mayor Airah — you found my son work." "—you kept the pier lit." "—you held my mother’s hand in the Sanctum." "—you never once asked who my father votes for." Hundreds of them. The oldest is sixteen years old. The newest went up this morning.'); },
    });
    r.markers.push({ x: 11, z: 0, label: 'Gratitude', color: '#f2ead0', kind: 'poi' });

    this.hallDoor(r, 's', 0, '🚪 Back to the Gallery', '#f2c14e', '🚪 Gallery', 'f2', new THREE.Vector3(-10.5, 0, -2.0), Math.PI / 2);
  }

  // ===== FLOOR 2 side room — the Hall of Mayors =====
  private buildHallMayors(): void {
    const r = this.hallRoom('mayors', 'Aurelian Hall — Hall of Mayors', 28, 18, { camH: 7.0, camD: 8.4 });
    r.spawn = new THREE.Vector3(0, 0, 5.0);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#2a1020', '#12060c');
    const gold = this.hallGold();
    const stone = this.hallStone();
    const HW = r.w / 2, HD = r.d / 2;
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#5a1730', '#c9a24a', 8), roughness: 0.3, metalness: 0.15 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#4a1a2e', '#2a0e1a', '#d8b56a', 3), roughness: 0.85 });
    this.hallShell(r, wallMat, 0x1c0c14, 6, 1.4);
    this.hallFloor(r, floorMat);
    this.hallRug(r, -12.5, 12.5, -7.5, 7.5, new THREE.MeshStandardMaterial({ map: carpetTexture('#5a1730', '#d8b56a', 1), roughness: 0.9 }));

    s.add(new THREE.AmbientLight(0xd0b6c0, 0.8));
    s.add(new THREE.HemisphereLight(0xffe6c0, 0x3a1a28, 0.55));
    this.hallLamp(r, -8, 5.0, -4, 0xffe6c0, 11);
    this.hallLamp(r, 8, 5.0, 4, 0xffe6c0, 11);
    this.hallLamp(r, 0, 5.2, 0, 0xffd98a, 8);

    // a viewing bench down the middle
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 3.2), new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 2), roughness: 0.7 }));
    bench.position.set(0, 0.22, 2.5); s.add(bench);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, 2.5), r: 1.6 });

    const portrait = (title: string, desc: string, px: number, pz: number, side: 'east' | 'west' | 'north', col: number) =>
      cPainting(title, desc, px, pz, side, 0, col, HW, HD, s, r.interactables);
    // east wall
    portrait('Mayor Aurelia', 'Portrait of Mayor Aurelia (Year 1 - 18). The Founding Mayor. She signed the Pact of the Seven Springs and laid the very first chalk lines for Haven’t walls. The portrait shows her holding a silver mason’s trowel and a parchment blueprint.', HW - 0.2, 4.5, 'east', 0x8a3a2a);
    portrait('Mayor Valerius', 'Portrait of Mayor Valerius (Year 18 - 35). The Iron Mayor. He completed the outer pale-stone walls and established the first City Watch. In his painting, he wears a heavy iron breastplate under his ceremonial gold sash.', HW - 0.2, 0.5, 'east', 0x3a5a7a);
    portrait('Mayor Keith', 'Portrait of Mayor Keith (Year 35 - 52). The Ledger-Keeper. He turned Haven from a small refuge into a bustling trade hub by introducing the unified coin system. He is depicted holding a massive ledger and a gold scale.', HW - 0.2, -3.5, 'east', 0x2a6a4a);
    // north wall
    portrait('Mayor Gideon', 'Portrait of Mayor Gideon (Year 52 - 68). The Water-Bringer. He built the complex mountain aqueduct system that feeds the city’s blue central fountain. The painting shows him pointing proudly to a cascading waterfall.', -8.0, -HD + 0.2, 'north', 0x6a4a7a);
    portrait('Mayor Cassandra', 'Portrait of Mayor Cassandra (Year 68 - 84). The Scholar-Queen. She founded the University of Haven and the great library. Her portrait depicts her sitting in a high-backed velvet chair, holding a glowing magical codex.', -4.0, -HD + 0.2, 'north', 0x8a7a3a);
    portrait('Mayor Ignatius', 'Portrait of Mayor Ignatius (Year 84 - 99). The Champion Mayor. A retired gladiator who expanded the Grand Coliseum to twice its size. He is painted wearing polished champion’s plate armor, holding a flaming torch.', 4.0, -HD + 0.2, 'north', 0xa25a2a);
    portrait('Mayor Lucilla', 'Portrait of Mayor Lucilla (Year 99 - 115). The Peacemaker. She negotiated the Treaty of Agdao, resolving decades of conflict with the wild tamer clans. Her portrait shows her holding a silver treaty roll and a white flower.', 8.0, -HD + 0.2, 'north', 0x2a8a8a);
    // west wall
    portrait('Mayor Tristan', 'Portrait of Mayor Tristan (Year 115 - 130). The Harbormaster. He built the pier district and the Great Lighthouse. He is painted standing on a ship’s wooden deck, peering through a brass spyglass out at the vast sea.', -HW + 0.2, -3.5, 'west', 0x3a3a5a);
    portrait('Mayor Alistair', 'Portrait of Mayor Alistair (Year 130 - 145). The Rebuilder. He led Haven through the dark reconstruction years after the great Legion invasion. He is shown in simple woolen robes holding a hammer, with half-built arches behind him.', -HW + 0.2, 0.5, 'west', 0x5a5a5a);
    portrait('Mayor Airah', 'Portrait of Mayor Airah (Year 145 - Present). The current Mayor, the Lantern of Haven. She is painted holding a hand-folded glass lamp, with a warm, caring smile. A tiny brass plate below reads: "To lead is to carry the light for those behind."', -HW + 0.2, 4.5, 'west', 0x7a2452);

    // Historian Varris
    this.hallNpc(r, { top: 0x3a7a5a, hair: 0x8a7a5a, cap: null, hairstyle: 'classic', skin: 0xd29a6a }, -3.5, -1.0, -Math.PI / 5, 'Historian Varris',
      'Press <b>E</b> — speak to the Historian', async () => {
        await say('Historian Varris', 'Fascinating, isn’t it? Ten Mayors, two hundred years of Haven’t history on these walls. Airah is the first in fifty years who didn’t build a monument to herself. She just kept the lamps lit. True legacy, I say.');
      });
    r.markers.push({ x: -3.5, z: -1.0, label: 'Historian', color: '#3a7a5a', kind: 'npc' });

    // the Grand Archives Door on the north wall (sealed; lore only)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.3), stone);
    doorFrame.position.set(0, 1.6, -HD + 0.18); s.add(doorFrame);
    const doorWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.0, 0.12), gold);
    doorWing.position.set(0, 1.5, -HD + 0.3); s.add(doorWing);
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.8), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.5 }));
    doorGlow.position.set(0, 1.5, -HD + 0.37); s.add(doorGlow);
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, -HD + 1.6), radius: 1.8,
      label: 'Press <b>E</b> — inspect the Grand Archives Door',
      handler: async () => { await say('Grand Archives Door', 'A pair of heavy golden-inlaid oak doors, sealed with the Mayor’s civic crest. Chamberlain Ysolde holds the only key. Beyond lies the treasury and the deep historical chronicles of Haven.'); },
    });
    r.markers.push({ x: 0, z: -HD + 1.6, label: 'Archives', color: '#d8b56a', kind: 'door' });

    this.hallDoor(r, 's', 0, '🚪 Back to the Gallery', '#f2c14e', '🚪 Gallery', 'f2', new THREE.Vector3(10.0, 0, 1.5), -Math.PI / 2);
  }

  // ===== FLOOR 3 — the Suite Antechamber =====
  private buildHallAntechamber(): void {
    const r = this.hallRoom('f3', 'Aurelian Hall — Suite Antechamber', 22, 16, { camH: 6.8, camD: 8.0 });
    r.spawn = new THREE.Vector3(3.5, 0, 6.8);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    s.background = skyGradient('#241038', '#0c0618');
    const gold = this.hallGold();
    const stone = this.hallStone();
    const HD = r.d / 2;
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#16161a', '#c9a24a', 8), roughness: 0.22, metalness: 0.22 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#3a204a', '#1e1030', '#d8b56a', 3), roughness: 0.85 });

    // down-stairwell to the Gallery, cut from the south-centre floor
    const well: [number, number, number, number] = [-2, 2, 2.5, 5.5];
    this.hallShell(r, wallMat, 0x150a22, 5.8, 0);
    this.hallFloor(r, floorMat, well);
    this.hallRug(r, -9, 9, -7, 2, new THREE.MeshStandardMaterial({ map: carpetTexture('#2a143a', '#d8b56a', 2), roughness: 0.9 }));

    s.add(new THREE.AmbientLight(0xc2b0d8, 0.85));
    s.add(new THREE.HemisphereLight(0xffe6c0, 0x32204a, 0.55));
    this.hallLamp(r, -6, 4.6, -3, 0xffe6c0, 10);
    this.hallLamp(r, 6, 4.6, -3, 0xffe6c0, 10);

    // two waiting chairs + a side table
    for (const cx of [-6.5, 6.5]) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ map: carpetTexture('#5a1730', '#d8b56a', 1), roughness: 0.85 }));
      chair.position.set(cx, 0.5, 1.5); s.add(chair);
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.18), new THREE.MeshStandardMaterial({ map: carpetTexture('#5a1730', '#d8b56a', 1), roughness: 0.85 }));
      backrest.position.set(cx, 1.0, 1.9); s.add(backrest);
      r.colliders.push({ pos: new THREE.Vector3(cx, 0, 1.6), r: 0.8 });
    }

    // Chamberlain Ysolde — the gate to the Mayor
    this.hallNpc(r, { top: 0x2a4a6a, hair: 0x2a2018, cap: null, hairstyle: 'ponytail', skin: 0xd29a6a }, 3.0, -3.5, -Math.PI / 3, 'Chamberlain Ysolde',
      'Press <b>E</b> — speak to the Chamberlain', async () => {
        const pick = await choose('Chamberlain Ysolde',
          'The Mayor’s at her desk and yes, she’ll see you — she always sees people, it’s exhausting and it’s the whole job. A word before you approach?',
          ['Is she truly always working?', 'Any advice before I speak?', 'Where is the Mayor’s husband?', 'I’ll go right in']);
        if (pick === 0) await say('Chamberlain Ysolde', 'Always. The lantern over this Hall has not gone dark in sixteen years and neither, I sometimes think, has she. She’ll tell you it’s for the city. It’s also so a certain wanderer can find the window from a long way off.');
        else if (pick === 1) await say('Chamberlain Ysolde', 'Be honest and be brief — she can read a lie like a ledger and she hasn’t the time. And don’t pester her about the Dawnflame. Half this city’s visitors do. She answers anyway, because she’s kinder than I am. I would not.');
        else if (pick === 2) await say('Chamberlain Ysolde', 'Out. "Walking," she calls it. He has a dozen places and she knows every one and tells no one — not even me, and I know where the treasury keys are. Ask her yourself if you dare. She’ll give you a hint and a smile and you’ll leave knowing less than you think.');
      });
    r.markers.push({ x: 3.0, z: -3.5, label: 'Chamberlain', color: '#3a8ad9', kind: 'npc' });

    // a tall potted laurel either side of the office doors
    for (const px of [-2.6, 2.6]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.6, 10), stone);
      pot.position.set(px, 0.3, -7.0);
      const fronds = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.8 }));
      fronds.position.set(px, 1.2, -7.0); fronds.name = 'foliage';
      s.add(pot, fronds);
      r.colliders.push({ pos: new THREE.Vector3(px, 0, -7.0), r: 0.5 });
    }

    // the doors to the Mayor's Suite (north wall), and a brass plaque beside them
    this.hallDoor(r, 'n', 0, '👑 The Mayor’s Suite', '#e85a8a', '👑 Mayor’s Suite', 'office', new THREE.Vector3(0, 0, 6.5), Math.PI, true);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x14101c, emissive: 0xe85a8a, emissiveIntensity: 0.16, roughness: 0.5 }));
    plaque.position.set(3.0, 2.2, -HD + 0.06); s.add(plaque);
    r.interactables.push({
      pos: new THREE.Vector3(3.0, 0, -HD + 1.4), radius: 1.6,
      label: 'Press <b>E</b> — read the brass plaque',
      handler: async () => { await say('Brass Plaque', 'Beneath the civic crest, in the Mayor’s own neat hand: "These doors are never locked while the lantern burns. If you have climbed this far, you are already welcome. — A."'); },
    });

    // down to the Gallery floor
    this.hallStairDown(r, well[0], well[1], well[2], well[3], 'f2', new THREE.Vector3(0, 0, -3.5), 0, 'descend to the Gallery');
  }

  // ===== FLOOR 3 inner room — the Mayor's Grand Suite =====
  private buildHallOffice(): void {
    const r = this.hallRoom('office', 'Aurelian Hall — Mayor’s Grand Suite', 26, 22, { camH: 7.4, camD: 9.0 });
    r.spawn = new THREE.Vector3(0, 0, 6.5);
    r.spawnRotY = Math.PI;
    const s = r.scene;
    const p = this.player;
    s.background = skyGradient('#1a1024', '#08060e');
    const gold = this.hallGold();
    const stone = this.hallStone();
    const HW = r.w / 2, HD = r.d / 2;
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture('#16161a', '#c9a24a', 8), roughness: 0.2, metalness: 0.25 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#3a1838', '#1c0c1e', '#d8b56a', 3), roughness: 0.85 });
    this.hallShell(r, wallMat, 0x140a16, 6, 1.6);
    this.hallFloor(r, floorMat);
    this.hallRug(r, -11.5, 11.5, -10, 8, new THREE.MeshStandardMaterial({ map: carpetTexture('#3a163a', '#d8b56a', 2), roughness: 0.9 }));

    s.add(new THREE.AmbientLight(0xc2aed0, 0.85));
    s.add(new THREE.HemisphereLight(0xffe6c0, 0x32204a, 0.5));
    this.hallLamp(r, -7, 5.0, -2, 0xffe6c0, 12);
    this.hallLamp(r, 7, 5.0, -2, 0xffe6c0, 11);

    // ---- the balcony, along the north wall (all within bounds) ----
    // a great wall of glass onto Haven at night
    const cityView = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 4, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x1a2a4a, emissive: 0x2a3a6a, emissiveIntensity: 0.5, roughness: 0.5 }));
    cityView.position.set(0, 3.2, -HD + 0.12); s.add(cityView);
    // scattered warm "window" lights of the city below
    for (let i = 0; i < 40; i++) {
      const lite = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.8 }));
      lite.position.set(-10 + Math.random() * 20, 1.6 + Math.random() * 3.0, -HD + 0.16); s.add(lite);
    }
    // glass mullions + a low balcony rail in front of the glass
    for (const mx of [-7, -3.5, 0, 3.5, 7]) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.4, 0.12), gold);
      mull.position.set(mx, 3.2, -HD + 0.2); s.add(mull);
    }
    const balRailZ = -HD + 3.6;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(r.w - 5, 0.12, 0.12), gold);
    rail.position.set(0, 1.0, balRailZ); s.add(rail);
    for (let x = -(r.w - 5) / 2; x <= (r.w - 5) / 2 + 0.01; x += 0.8) {
      const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), stone);
      bal.position.set(x, 0.5, balRailZ); s.add(bal);
      r.colliders.push({ pos: new THREE.Vector3(x, 0, balRailZ), r: 0.34 });
    }
    cTelescope(-4.0, -HD + 1.8, 0, s, r.colliders);
    r.interactables.push({
      pos: new THREE.Vector3(3.5, 0, balRailZ + 0.9), radius: 2.0,
      label: 'Press <b>E</b> — look out at Haven from the balcony',
      handler: async () => { await say('Mayor’s Balcony', 'From up here, the entire city of Haven unfolds below. You can see the grand avenue, the glowing blue fount, the Coliseum rising proud, and the golden street lamps marching in straight lanes to the outer walls. The wind is cool, and the sky feels closer.'); },
    });
    r.markers.push({ x: 0, z: balRailZ, label: 'Balcony', color: '#8ad9ff', kind: 'poi' });

    // ---- the Mayor's executive desk + Airah ----
    const executiveWood = new THREE.MeshStandardMaterial({ map: plankTexture('#2a150a', 2), roughness: 0.45 });
    cDesk(0, 0, -5.0, 1.2, -Math.PI / 2.5, Math.PI / 2.5, 1.2, 0.8, executiveWood, s);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, -5.4), r: 1.4 });
    const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf7a, emissiveIntensity: 1.0, transparent: true, opacity: 0.85 }));
    lampGlow.position.set(-1.2, 1.4, -5.4); lampGlow.name = 'legendpulse';
    this.hallLamp(r, -1.2, 1.7, -5.4, 0xffd98a, 8, 7);
    s.add(lampGlow);

    // Mayor Airah herself, behind the desk
    const airah = makeVoxelHuman({ top: 0x7a2452, sleeves: 0x5a1838, bottom: 0x3a163a, hair: 0x241a14, hairstyle: 'long', skin: 0xd29a6a, robe: true });
    airah.position.set(0, 0, -6.4);
    const chainOffice = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 18), gold);
    chainOffice.position.set(0, 1.18, 0.06); chainOffice.rotation.x = Math.PI / 2.2; airah.add(chainOffice);
    const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffcf7a, emissiveIntensity: 0.8 }));
    pendant.position.set(0, 1.0, 0.12); airah.add(pendant);
    const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18), gold);
    circlet.position.set(0, 1.62, 0); circlet.rotation.x = Math.PI / 2; airah.add(circlet);
    tagNpc(airah, 'Mayor Airah');
    s.add(airah);
    r.npcs.push(airah);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, -6.4), r: 0.6 });
    r.markers.push({ x: 0, z: -6.4, label: '👑 Mayor Airah', color: '#e85a8a', kind: 'poi' });

    let hintIdx = 0;
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, -4.2), radius: 2.2,
      label: 'Press <b>E</b> — present yourself to Mayor Airah',
      handler: async () => {
        airah.rotation.y = Math.atan2(this.tamer.position.x - airah.position.x, this.tamer.position.z - airah.position.z);
        if (!p.flags['met_mayor']) {
          await conversation([
            ['Mayor Airah', `So you’re ${p.tamerName}. Yes — I keep a list of the graduates worth the ink, and you climbed onto it the hard way. Welcome to my Hall. Sit if you like; stand if you’re the standing sort. Most heroes are.`],
            ['Mayor Airah', 'I’m Airah. The city calls me Mayor, the news-crystals don’t call me at all, and a very stubborn man I married calls me "the only seat in the world he never had to fight for." He’s wrong, of course. I fight for it every single morning. I just do it before anyone’s awake to notice.'],
          ]);
          p.flags['met_mayor'] = true;
          toast('👑 You have met Mayor Airah, the Lantern of Haven', 'gold');
          p.save();
        }
        while (true) {
          const pick = await choose('Mayor Airah',
            'Haven is yours to ask after, ${name} — its lamps, its people, my impossible family. What would you know?'.replace('${name}', p.tamerName),
            ['Haven looks radiant, Mayor.', 'Where does the Dawnflame get to?', 'Your daughters — Azrin and Azrael?', 'How do you keep this seat?', 'I should let you work.']);
          if (pick === 0) {
            await say('Mayor Airah', 'It does, doesn’t it. I had it built pale and I keep it bright, and every lamp you passed on the way in is lit because someone in this Hall decided you mattered enough to see your feet in the dark. That’s the whole of government, between you and me. The rest is paperwork and pretending the paperwork is the point.');
          } else if (pick === 1) {
            const h = ALJAY_HIDEOUTS[hintIdx % ALJAY_HIDEOUTS.length];
            hintIdx++;
            const leadins = ['Ah. Everyone asks. I’ll give you ONE — and only because you earned the climb. ', 'You too? Fine. A piece of it, then. ', 'He’d hate that I told you this. Lean in. ', 'One more thread of him, and then I really must stop. '];
            await say('Mayor Airah', leadins[hintIdx % leadins.length] + h.hint + (hintIdx < ALJAY_HIDEOUTS.length ? ' …Ask me again sometime. I have more, and I dole them out like a miser.' : ' That’s most of them. The rest he can tell you himself, if he ever sits still long enough.'));
          } else if (pick === 2) {
            await conversation([
              ['Mayor Airah', 'My girls. Azrin is her father with the volume turned all the way up — laughs first, apologises never, already a World Champion at sixteen and absolutely insufferable about it, bless her. Azrael is her father with the volume turned all the way DOWN. Quiet, stubborn, three moves ahead of everyone including me. She keeps his old lantern on her belt. Unlit. "For Ghandra," she says, and won’t explain.'],
              ['Mayor Airah', 'They hunt the same corruption their father walked into fifteen years ago — Veyra, Tharkand, under the ice of Noruun. Other mothers worry their children won’t leave home. I worry mine will walk into the centre of the world. So I keep the lantern lit and the kettle on and the Hall standing, so that whatever they find out there, there is always, ALWAYS, a way back to a warm room. You’ve met them, by the fountain? Be kind to Azrael. Be quick with Azrin.'],
            ]);
          } else if (pick === 3) {
            await say('Mayor Airah', AIRAH.untouchable);
          } else {
            break;
          }
        }
        await say('Mayor Airah', `Go on, then — Haven won’t see itself looked after. And ${p.tamerName}: when the seal breaks, and it will, this Hall is a sanctuary. The lantern stays lit. You’ll always know where home is. Off you go.`);
      },
    });

    // ---- Sile, the Mayor's Wispry guardian ----
    const wisp = makeGuardian('wispry');
    wisp.group.position.set(-4.5, 0.2, -3.5);
    wisp.group.scale.setScalar(0.9);
    wisp.group.rotation.y = Math.PI / 3;
    s.add(wisp.group);
    this.intRigs.push(wisp);
    r.colliders.push({ pos: new THREE.Vector3(-4.5, 0, -3.5), r: 0.6 });
    r.interactables.push({
      pos: new THREE.Vector3(-4.5, 0, -1.8), radius: 1.7,
      label: 'Press <b>E</b> — greet the Mayor’s companion',
      handler: async () => { await say('Sile, the Mayor’s Guardian', '*A soft, airy Wispry blinks at you and drifts a slow circle, content. The Mayor says Aljay won her in a card game on Agdao years ago and "forgot to take her back." She has guarded this office ever since — the gentlest sentinel in Haven, and the only one Foretales never counted.*'); },
    });
    r.markers.push({ x: -4.5, z: -3.5, label: 'Sile', color: '#9adff2', kind: 'npc' });

    // ---- the family portrait (west wall) ----
    const portraitTex = this.mayorPortraitTexture();
    const portrait = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2),
      new THREE.MeshStandardMaterial({ map: portraitTex, emissive: 0xffffff, emissiveMap: portraitTex, emissiveIntensity: 0.25, roughness: 0.6 }));
    portrait.position.set(-HW + 0.12, 2.7, -1.0); portrait.rotation.y = Math.PI / 2;
    const portraitFrame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 3.4), gold);
    portraitFrame.position.set(-HW + 0.02, 2.7, -1.0); s.add(portraitFrame, portrait);
    r.interactables.push({
      pos: new THREE.Vector3(-HW + 1.5, 0, -1.0), radius: 2.0,
      label: 'Press <b>E</b> — look at the family portrait',
      handler: async () => { await say('Family Portrait', 'Four faces in dawn-gold paint. The Mayor, calm at the centre. Beside her a man in a battered hat with a sword of light at his back and a lantern — not the sword — in his hand. Two girls in front: one grinning like a sunrise, one watching you from the corner of the canvas as if she’s already three moves ahead. Someone has painted, very small, in the lantern’s glow: "home is the place you can always find."'); },
    });
    r.markers.push({ x: -HW + 0.5, z: -1.0, label: 'Family', color: '#ffcf7a', kind: 'poi' });

    // ---- the framed Foretales directive (east wall) ----
    const directive = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x14101c, emissive: 0xe85a8a, emissiveIntensity: 0.18, roughness: 0.5 }));
    directive.position.set(HW - 0.12, 2.7, -1.0); directive.rotation.y = -Math.PI / 2;
    const directiveFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 1.9), gold);
    directiveFrame.position.set(HW - 0.02, 2.7, -1.0); s.add(directiveFrame, directive);
    r.interactables.push({
      pos: new THREE.Vector3(HW - 1.5, 0, -1.0), radius: 2.0,
      label: 'Press <b>E</b> — read the framed directive',
      handler: async () => { await say('Framed Directive', 'Behind glass, in a hand that isn’t hers, spooled from the heart of the Mirrorhouse: "GLAZE. DO NOT TOUCH. NOT YET. SOON." Foretales’ own standing order on the only family it dares not rewrite. The Mayor hung it where every visitor can see it. A little brass plate beneath reads, in her hand: "They forgot to be afraid of the wife."'); },
    });
    r.markers.push({ x: HW - 0.5, z: -1.0, label: 'Directive', color: '#e85a8a', kind: 'poi' });

    // bookshelves + a cosy fireplace on the east wall
    for (const sz of [-6, 5]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 3.0), new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 }));
      shelf.position.set(-HW + 0.3, 2.0, sz); s.add(shelf);
      r.colliders.push({ pos: new THREE.Vector3(-HW + 0.3, 0, sz), r: 0.8 });
    }
    const fp = new THREE.Group();
    fp.position.set(HW - 0.4, 0, 4.0); fp.rotation.y = -Math.PI / 2;
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 2.0), stone); hearth.position.set(0, 0.9, 0); fp.add(hearth);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.0, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })); hole.position.set(0.15, 0.6, 0); fp.add(hole);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff4500, emissiveIntensity: 2.0 })); fire.position.set(0.15, 0.35, 0); fire.name = 'flame'; fp.add(fire);
    const fl = new THREE.PointLight(0xff6600, 8, 8); fl.position.set(0.2, 0.4, 0); fp.add(fl);
    s.add(fp);
    r.colliders.push({ pos: new THREE.Vector3(HW - 0.4, 0, 4.0), r: 1.0 });
    r.interactables.push({
      pos: new THREE.Vector3(HW - 1.8, 0, 4.0), radius: 1.8,
      label: 'Press <b>E</b> — warm yourself by the fireplace',
      handler: async () => { await say('Mayor’s Fireplace', 'A cozy, grand fireplace warming the Mayor’s office. The embers glow with a deep magical orange light, keeping the drafts of the high penthouse at bay.'); },
    });

    // back down to the antechamber
    this.hallDoor(r, 's', 0, '🚪 Back to the Antechamber', '#f2c14e', '🚪 Antechamber', 'f3', new THREE.Vector3(0, 0, -4.5), 0, true);
  }

  /** Painted family portrait for the Mayor's office — Airah, Aljay and the two daughters in dawn-gold. */
  private mayorPortraitTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 188;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 188);
    g.addColorStop(0, '#3a2418'); g.addColorStop(1, '#1a0f0a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 188);
    // a warm halo behind the family
    const halo = ctx.createRadialGradient(128, 96, 10, 128, 96, 130);
    halo.addColorStop(0, 'rgba(255,207,122,0.55)'); halo.addColorStop(1, 'rgba(255,207,122,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, 256, 188);
    const figure = (x: number, top: string, hair: string, h: number) => {
      ctx.fillStyle = '#e8c49a'; ctx.beginPath(); ctx.arc(x, 96 - h, 12, 0, Math.PI * 2); ctx.fill(); // head
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, 96 - h - 3, 13, Math.PI, 0); ctx.fill();      // hair
      ctx.fillStyle = top; ctx.fillRect(x - 14, 96 - h + 10, 28, 60 + h); // body
    };
    figure(128, '#7a2452', '#241a14', 18); // Airah, centre, tallest
    figure(86, '#8a2a1a', '#3a2418', 14);   // Aljay, beside her (battered red)
    figure(168, '#f2884e', '#8a3a1a', 2);   // Azrin (ember)
    figure(196, '#6a4a9a', '#241a2e', 0);    // Azrael (night)
    // Aljay's lantern, glowing in his hand
    ctx.fillStyle = '#ffcf7a'; ctx.fillRect(70, 150, 10, 12);
    ctx.fillStyle = 'rgba(255,207,122,0.6)'; ctx.beginPath(); ctx.arc(75, 156, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d9a8'; ctx.font = 'italic 11px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('home is the place you can always find', 128, 180);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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

  private async enterMayorOffice(): Promise<void> {
    this.busy = true;
    this.exitSpot.copy(this.tamer.position);
    this.buildHall();              // builds every floor + room scene up front
    this.streetScene.remove(this.tamer);
    this.mode = 'interior';
    this.enterHallRoom('f1');      // step into the Grand Lobby
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
    this.hallRooms = null;         // release the Hall's seven scenes
    this.podHover = null;          // release the Skyport's floating Pod
  }

  // ================= the Aetherline Skyport =================
  /**
   * The city-side approach to the Transport Pod. Where the old shuttle circle
   * once sat (west of the plaza) now runs a sleek black-glass CAUSEWAY whose
   * edge-lights chase toward a raised chrome STATION HOUSE — climb its glowing
   * stair and an arch swallows you into the platform interior (a scene-swap,
   * exactly the way every door in the city works). Built once per city build.
   */
  private buildSkyport(): void {
    const s = this.streetScene;
    const CX = -30;                 // station centre (x); the platform faces +x (plaza-ward)
    const gY = this.groundH(CX, 0);
    const chrome = () => new THREE.MeshStandardMaterial({ color: 0xc6cdda, metalness: 0.95, roughness: 0.22 });
    const darkChrome = () => new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.85, roughness: 0.35 });
    const CYAN = 0x4fe0ff;

    // ---- the causeway: a black-glass runway from the plaza edge to the stair ----
    const cwX0 = -9, cwX1 = -25, cwW = 3.8;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(cwX1 - cwX0, 0.12, cwW),
      new THREE.MeshStandardMaterial({ color: 0x10151f, metalness: 0.7, roughness: 0.3 }));
    deck.position.set((cwX0 + cwX1) / 2, gY + 0.06, 0);
    deck.receiveShadow = true;
    s.add(deck);
    // a luminous centre-seam of energy down the middle of the deck
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(cwX1 - cwX0 - 0.4, 0.28),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    seam.rotation.x = -Math.PI / 2;
    seam.position.set((cwX0 + cwX1) / 2, gY + 0.13, 0);
    s.add(seam);

    // ---- the running guide-lights: studs marching down both rails ----
    const N = 16;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);                       // 0 at plaza, 1 at station
      const x = cwX0 + (cwX1 - cwX0) * u;
      for (const side of [-1, 1]) {
        const mat = new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.4, roughness: 0.3 });
        const stud = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), mat);
        stud.position.set(x, gY + 0.14, side * (cwW / 2 - 0.2));
        s.add(stud);
        this.podway.push({ mat, u, amp: 1.7 });
      }
    }
    // chevron-light arches striding over the causeway — a processional approach
    for (const ax of [-13, -18.5, -24]) {
      const arch = new THREE.Group();
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.6, 8), darkChrome());
        leg.position.set(0, 1.8, side * (cwW / 2 + 0.35));
        arch.add(leg);
        this.streetColliders.push({ pos: new THREE.Vector3(ax, 0, side * (cwW / 2 + 0.35)), r: 0.34 });
      }
      const span = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, cwW + 1.2), darkChrome());
      span.position.y = 3.55;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, cwW + 0.4),
        new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.1, roughness: 0.3 }));
      bar.position.y = 3.4; bar.name = 'legendpulse';
      arch.add(span, bar);
      arch.position.set(ax, gY, 0);
      s.add(arch);
    }

    // ---- the station house: a raised chrome shell with a glowing portal ----
    const house = new THREE.Group();
    // podium the station stands on
    const podium = new THREE.Mesh(new THREE.BoxGeometry(11, 1.0, 13),
      new THREE.MeshStandardMaterial({ map: tileTexture('#3a4252', '#252b39', 4), roughness: 0.6, metalness: 0.4 }));
    podium.position.set(0, 0.5, 0);
    podium.castShadow = podium.receiveShadow = true;
    house.add(podium);
    // the body — a sweeping chrome hangar with dark-glass clerestory
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 7.2, 11), chrome());
    body.position.set(-1, 4.6, 0);
    body.castShadow = true;
    house.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(9.1, 2.4, 11.1),
      new THREE.MeshStandardMaterial({ color: 0x0c2230, metalness: 0.5, roughness: 0.15, transparent: true, opacity: 0.8 }));
    glass.position.set(-1, 6.4, 0);
    house.add(glass);
    // a curved luminous crown rib over the roof
    const crown = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.22, 8, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }));
    crown.rotation.y = Math.PI / 2;
    crown.position.set(-1, 8.0, 0);
    crown.name = 'legendpulse';
    house.add(crown);
    // the entrance portal facing the plaza (+x face), with a pulsing energy veil
    const portalFrame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.0, 4.2), chrome());
    portalFrame.position.set(3.5, 2.9, 0);
    house.add(portalFrame);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    veil.rotation.y = -Math.PI / 2;
    veil.position.set(3.45, 2.7, 0);
    veil.name = 'portal';
    house.add(veil);
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 9, 10), chrome());
      pylon.position.set(3.2, 4.5, side * 5.6);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.5),
        new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.2 }));
      cap.position.set(3.2, 9.3, side * 5.6);
      cap.name = 'legendpulse';
      house.add(pylon, cap);
    }
    house.position.set(CX, gY, 0);
    s.add(house);

    // the grand stair rising from the causeway up to the portal landing
    const stairTop = -26.2;
    for (let i = 0; i < 5; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.26, 5.2),
        new THREE.MeshStandardMaterial({ color: 0x3a4252, metalness: 0.6, roughness: 0.4 }));
      step.position.set(-24.6 - i * 0.7, gY + 0.13 + i * 0.22, 0);
      step.receiveShadow = true;
      s.add(step);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 5.0),
        new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.0 }));
      lip.position.set(-24.2 - i * 0.7, gY + 0.28 + i * 0.22, 0);
      lip.name = 'legendpulse';
      s.add(lip);
    }
    void stairTop;

    // block the station footprint (leave the causeway + stair foot walkable)
    for (const dz of [-5.5, -3, 0, 3, 5.5]) {
      this.streetColliders.push({ pos: new THREE.Vector3(CX + 2.5, 0, dz), r: 1.4 });
      this.streetColliders.push({ pos: new THREE.Vector3(CX - 2, 0, dz), r: 2.0 });
    }

    // floating holographic herald over the station
    this.label3d(s, '⬡ AETHERLINE SKYPORT', '#7fe6ff', new THREE.Vector3(CX, gY + 11.4, 0), 6.2);
    this.label3d(s, 'Leodones University Line — ONLINE', '#9affc6', new THREE.Vector3(CX, gY + 10.2, 0), 3.6);

    this.streetMarkers.push({ x: CX, z: 0, label: '⬡ Skyport', color: '#7fe6ff', kind: 'poi' });
    this.streetInteractables.push({
      pos: new THREE.Vector3(-23.4, 0, 0), radius: 2.6,
      label: 'Press <b>E</b> — enter the Aetherline Skyport',
      handler: async () => this.enterSkyport(),
    });
  }

  /** Step from the causeway into the elevated Skyport platform (a scene-swap). */
  private async enterSkyport(): Promise<void> {
    this.busy = true;
    sfx('open');
    this.exitSpot.copy(this.tamer.position);
    this.buildSkyportInterior();
    this.streetScene.remove(this.tamer);
    this.interiorScene!.add(this.tamer);
    this.tamer.position.set(0, 0, this.intRoom.d / 2 - 3.4); // clear of the exit + benches
    this.tamer.rotation.y = Math.PI;                 // face the Pod, up-platform
    this.camera.position.set(0, this.intCamH, this.intRoom.d / 2 + this.intCamD);
    this.mode = 'interior';
    toast('⬡ Aetherline Skyport', 'gold');
    this.busy = false;
  }

  /**
   * The Skyport platform interior — a long elevated concourse of chrome, dark
   * glass and cyan light. The floating Pod docks along the north edge; benches,
   * holograms and travellers fill the hall; the Pod console offers the lines.
   */
  private buildSkyportInterior(): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intMarkers = [];
    this.intRigs.forEach(disposeRig);
    this.intRigs = [];
    this.resetInteriorRig();
    this.intRoom = { w: 38, d: 24 };
    this.intName = 'Aetherline Skyport';
    this.intCamH = 9.0;
    this.intCamD = 13.0;
    const { w, d } = this.intRoom;
    const HW = w / 2, HD = d / 2;
    const CYAN = 0x4fe0ff, GOLD = 0xc9a24a;

    const chrome = () => new THREE.MeshStandardMaterial({ color: 0xc6cdda, metalness: 0.95, roughness: 0.2 });
    const darkChrome = () => new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.85, roughness: 0.35 });
    const emis = (c: number, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, metalness: 0.4 });
    const glow = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    // ---- atmosphere + key lighting (kept within the interior light budget) ----
    s.background = skyGradient('#16243a', '#070b14');
    s.add(new THREE.AmbientLight(0x6a86b8, 0.7));
    const keyA = new THREE.PointLight(CYAN, 22, 34); keyA.position.set(0, 7.5, -4); s.add(keyA);
    const keyB = new THREE.PointLight(0xbfe8ff, 16, 28); keyB.position.set(-10, 6, 4); s.add(keyB);
    const keyC = new THREE.PointLight(0xbfe8ff, 16, 28); keyC.position.set(10, 6, 4); s.add(keyC);
    const warm = new THREE.PointLight(GOLD, 10, 22); warm.position.set(0, 5, 9); s.add(warm);

    // ---- floor: dark tech-tile with a luminous edge-of-platform safety line ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tileTexture('#1b2230', '#10151e', 9), roughness: 0.5, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // glowing grid seams across the concourse
    for (const gx of [-12, -6, 0, 6, 12]) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.1, d - 2), emis(CYAN, 0.5));
      seam.rotation.x = -Math.PI / 2; seam.position.set(gx, 0.02, 1.5); seam.name = 'legendpulse'; s.add(seam);
    }
    // the platform-edge hazard line + chevrons (the Pod docks beyond it)
    const edgeZ = -HD + 4.2;
    const hazard = new THREE.Mesh(new THREE.PlaneGeometry(w - 3, 0.5), emis(0xffcf4a, 0.8));
    hazard.rotation.x = -Math.PI / 2; hazard.position.set(0, 0.03, edgeZ); s.add(hazard);
    for (let i = -7; i <= 7; i++) {
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), glow(0xffcf4a, 0.5));
      ch.rotation.x = -Math.PI / 2; ch.rotation.z = Math.PI / 4; ch.position.set(i * 2.2, 0.025, edgeZ + 0.7); s.add(ch);
    }

    // ---- shell: dark metal walls, a vast window over the docking edge, ceiling ribs ----
    const wallMat = darkChrome();
    const mkWall = (ww: number, hh: number, wd: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, wd), wallMat);
      m.position.set(x, y, z); m.receiveShadow = true; s.add(m);
    };
    // The shell stands taller than the chase-camera (which rides at y≈9), so the
    // roof always frames the platform and never drops between camera and player.
    // The south side — the camera's side — is only a low parapet with a central
    // exit gap, so the camera looks clean over it into the concourse.
    const H = 11;
    const sGap = 2.2, sSeg = HW - sGap, sX = sGap + sSeg / 2;
    mkWall(sSeg, 1.4, 0.5, -sX, 0.7, HD);         // south parapet — west of the exit
    mkWall(sSeg, 1.4, 0.5, sX, 0.7, HD);          // south parapet — east of the exit
    mkWall(0.5, H, d, -HW, H / 2, 0);             // west
    mkWall(0.5, H, d, HW, H / 2, 0);              // east
    // north is mostly glass: a great window onto the sky, framed in chrome
    mkWall(w, 1.4, 0.5, 0, 0.7, -HD);             // sill
    mkWall(w, 1.0, 0.5, 0, H - 0.5, -HD);         // header capping the window
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, 8.4),
      new THREE.MeshStandardMaterial({ color: 0x183048, metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.55 }));
    windowPane.position.set(0, 5.6, -HD + 0.25); s.add(windowPane);
    for (let i = -4; i <= 4; i++) {               // window mullions
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 8.4, 0.16), chrome());
      mull.position.set(i * (w / 9), 5.6, -HD + 0.3); s.add(mull);
    }
    // ceiling with luminous ribs — seated at H, above the camera, so it frames
    // the hall without ever masking the view of the player below
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; s.add(ceil);
    for (const cz of [-6, -1, 4]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 0.2, 0.4), emis(CYAN, 0.9));
      rib.position.set(0, H - 0.15, cz); rib.name = 'legendpulse'; s.add(rib);
    }

    // ---- THE POD: a floating chrome capsule docked along the north edge ----
    const podZ = -HD + 1.9, podY = 2.5;
    const pod = new THREE.Group(); pod.name = 'podhover';
    pod.userData.baseY = podY;
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 6.0, 10, 20), chrome());
    hull.rotation.z = Math.PI / 2;                 // lie the capsule along X
    hull.scale.set(1, 1, 0.82);                    // slightly flattened cross-section
    hull.castShadow = true; pod.add(hull);
    // a darker belly + a bright dorsal highlight to fake a chromed sheen
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(1.55, 6.0, 8, 18), new THREE.MeshStandardMaterial({ color: 0x8a93a6, metalness: 0.95, roughness: 0.3 }));
    belly.rotation.z = Math.PI / 2; belly.scale.set(1, 1, 0.7); belly.position.y = -0.18; pod.add(belly);
    const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 6.2, 6, 14), new THREE.MeshStandardMaterial({ color: 0xeef4ff, metalness: 0.9, roughness: 0.1 }));
    crest.rotation.z = Math.PI / 2; crest.position.y = 1.18; crest.scale.set(1, 1, 0.5); pod.add(crest);
    // the window band — glowing cyan ribbon down each flank
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, 0.08), emis(CYAN, 1.4));
      band.position.set(0, 0.35, side * 1.32); band.name = 'legendpulse'; pod.add(band);
    }
    // nose caps + running lights at each end
    for (const end of [-1, 1]) {
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), emis(end > 0 ? CYAN : 0xff7a8a, 1.1));
      nose.position.set(end * 4.1, 0.05, 0); nose.scale.set(0.7, 1, 1); nose.name = 'legendpulse'; pod.add(nose);
    }
    // boarding door on the platform-facing flank, framed and glowing
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.12), chrome());
    doorFrame.position.set(0, 0.1, 1.34); pod.add(doorFrame);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), glow(CYAN, 0.4));
    door.position.set(0, 0.1, 1.41); door.name = 'portal'; pod.add(door);
    // levitation glow + skirt beneath the hull
    const lev = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.4), glow(CYAN, 0.5));
    lev.rotation.x = -Math.PI / 2; lev.position.set(0, -1.55, 0); lev.name = 'portal'; pod.add(lev);
    pod.position.set(0, podY, podZ);
    s.add(pod);
    this.podHover = pod;
    // docking cradle: a chrome trench + three pulsing energy rings under the Pod
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 3), darkChrome());
    cradle.position.set(0, 0.25, podZ); s.add(cradle);
    for (const rx of [-2.6, 0, 2.6]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 8, 22), emis(CYAN, 1.3));
      ring.rotation.x = -Math.PI / 2; ring.position.set(rx, 0.55, podZ); ring.name = 'legendpulse'; s.add(ring);
    }
    // a short lit gangway from the concourse to the Pod door
    const gang = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 2.2), chrome());
    gang.position.set(0, 0.4, podZ + 2.0); s.add(gang);
    for (const side of [-1, 1]) {                  // stanchions + velvet-rope of light
      const stan = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), chrome());
      stan.position.set(side * 1.1, 0.9, podZ + 3.0); s.add(stan);
    }
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, podZ + 0.4), r: 3.2 });
    this.intColliders.push({ pos: new THREE.Vector3(-3.5, 0, podZ + 0.4), r: 1.6 });
    this.intColliders.push({ pos: new THREE.Vector3(3.5, 0, podZ + 0.4), r: 1.6 });

    this.label3d(s, '⬡ AETHERLINE', '#7fe6ff', new THREE.Vector3(0, 6.7, podZ + 0.6), 5.0);

    // ---- the holographic Departures board, floating above the concourse ----
    const board = this.skyportDepartures();
    board.position.set(11.5, 4.4, -HD + 1.0); board.rotation.y = -0.5; s.add(board);
    // the Aurel Transit Grid hologram — a slow-turning wire-globe on a plinth (west)
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.0, 16), darkChrome());
    plinth.position.set(-13, 0.5, -3); s.add(plinth);
    this.intColliders.push({ pos: new THREE.Vector3(-13, 0, -3), r: 1.5 });
    const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.6 }));
    globe.position.set(-13, 2.9, -3); globe.name = 'aetherfloat'; globe.userData.baseY = 2.9; globe.userData.ph = 1.2; s.add(globe);
    const globeGlow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), glow(CYAN, 0.12));
    globeGlow.position.copy(globe.position); s.add(globeGlow);
    this.label3d(s, 'AUREL TRANSIT GRID', '#7fe6ff', new THREE.Vector3(-13, 4.7, -3), 2.8);

    // ---- floating holo-motes drifting through the hall ----
    for (let i = 0; i < 8; i++) {
      const by = 2.5 + Math.random() * 3;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), glow(i % 2 ? CYAN : 0x9affc6, 0.8));
      mote.position.set(-14 + Math.random() * 28, by, -6 + Math.random() * 12);
      mote.name = 'aetherfloat'; mote.userData.baseY = by; mote.userData.ph = Math.random() * 6.28; s.add(mote);
    }

    // ---- metal waiting benches along the south wall, some travellers seated ----
    const benchMat = () => new THREE.MeshStandardMaterial({ color: 0x8e98a8, metalness: 0.8, roughness: 0.35 });
    const addBench = (bx: number, bz: number) => {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 0.9), benchMat());
      seat.position.y = 0.42;
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.14), benchMat());
      back.position.set(0, 0.78, 0.38);              // backrest on the south side; sitters face the Pod
      g.add(seat, back);
      for (const lx of [-1.3, 1.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a525f, metalness: 0.7, roughness: 0.4 }));
        leg.position.set(lx, 0.21, 0); g.add(leg);
      }
      g.position.set(bx, 0, bz); s.add(g);
      this.intColliders.push({ pos: new THREE.Vector3(bx, 0, bz), r: 1.5 });
    };
    for (const bx of [-11, -6.5, 6.5, 11]) addBench(bx, HD - 2.2);

    // ---- the souls of the Skyport ----
    const npc = (
      opts: Parameters<typeof makeVoxelHuman>[0], x: number, z: number, rotY: number,
      name: string, handler: () => Promise<void>, seated = false,
    ) => {
      const g = makeVoxelHuman(opts);
      g.position.set(x, 0, z); g.rotation.y = rotY;
      if (seated) setVoxelSeated(g, true, 0.46);
      tagNpc(g, name); s.add(g);
      this.intNpcs.push(g);
      this.intColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
      this.intInteractables.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.9, label: `Press <b>E</b> — speak with ${name}`, handler });
      this.intMarkers.push({ x, z, label: name, color: '#bfe8ff', kind: 'npc' });
    };
    const oneOf = (name: string, lines: string[]) => async () => { sfx('blip'); await say(name, lines[Math.floor(Math.random() * lines.length)]); };

    // Stationmaster Vey — runs the line, stands by the gangway, opens the console
    npc({ top: 0x1c3a5a, sleeves: 0x14283f, bottom: 0x222a3a, cap: 0x2a4a6a, hair: 0x3a2a1a, skin: 0xc98a5a }, -3.4, podZ + 3.0, 0.5,
      'Stationmaster Vey', async () => {
        await say('Stationmaster Vey', `Aetherline Skyport — fastest seat in Aurel, if I do say so. TWO lines lit today: Leodones University, and — new this season, and I still can\'t quite believe it — Terra City herself, back from fifteen years dark. Step to the Pod when you\'re ready and I\'ll cycle the gate.`);
        await this.openSkyportConsole();
      });
    this.intMarkers.push({ x: 0, z: podZ, label: '⬡ Transport Pod', color: '#7fe6ff', kind: 'poi' });

    // Old conductor on the end bench — remembers the night the line fell
    npc({ top: 0x4a4636, sleeves: 0x3a3628, bottom: 0x2e2a20, hair: 0xcfcfcf, skin: 0xb98a64, hairstyle: 'bald' }, 11, HD - 2.1, Math.PI,
      'Conductor Brannoch', oneOf('Conductor Brannoch', [
        'Forty years I called these platforms. "Now boarding — Rokon, Terra, the Mire, the Reach." Then the Sundering, fifteen years gone, and the whole grid went dark in a single night.',
        'The final battle didn\'t just take the Dawnflame from us, lad. It severed the Aetherline clean across, and Terra City\'s coordinates went silent for fifteen years. We thought her lost. Then — this season — the Terra signal ANSWERED. She stands. She SHINES, they say. I wept at my own console.',
        'TWO lines breathing again now — the University, and Terra herself. Took the engineers fifteen years. I rode the first University Pod back and wept like a babe; I fully intend to weep again on the Terra run. Don\'t tell Sool.',
      ]), true);

    // Engineer at a wall console — pod-tech talk
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 2.4), darkChrome());
    panel.position.set(HW - 0.6, 1.3, -2); s.add(panel);
    const panelGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glow(CYAN, 0.5));
    panelGlow.rotation.y = -Math.PI / 2; panelGlow.position.set(HW - 0.85, 1.5, -2); panelGlow.name = 'portal'; s.add(panelGlow);
    npc({ top: 0xc46a2a, sleeves: 0x9a5020, bottom: 0x2e2a26, cap: 0xe0a020, hair: 0x201810, skin: 0x8a5a36 }, HW - 2.0, -2, -Math.PI / 2,
      'Technician Sool', oneOf('Technician Sool', [
        'The Pod doesn\'t roll — it FLOATS. Aether-rails under the deck push against the hull and it just… lets go of the ground. First time I saw it lift I dropped my whole toolbox.',
        'People think the chrome is for looks. It\'s a containment skin — keeps the lift-field wrapped tight. Scratch it and you\'re walking to the University, friend.',
        'Brannoch swears the old Pods were faster. They weren\'t. They were just LOUDER, and he was younger. Don\'t tell him I said that.',
      ]));

    // Two commuters mid-platform, talking — about the maps / the world
    npc({ top: 0x2a7a5a, sleeves: 0x1e5a42, bottom: 0x2a2e3a, hair: 0x4a2a1a, skin: 0xe0a878 }, -5.5, 2.5, 0.6,
      'Tamer Pell', oneOf('Tamer Pell', [
        'I\'ve done the Mossdeep Burrows, the Sunken Vault, even the Stormspire Depths. But you can\'t POD to those — the Aetherline only ever linked the cities. The wild you walk to, through the east Gate.',
        'My cousin sailed all the way to Agdao Island for the Cradle Hollow. Took her a week by boat! If the Terra line were up she\'d have been there by lunch.',
      ]));
    npc({ top: 0x7a2a4a, sleeves: 0x5a1e36, bottom: 0x2a2a32, hair: 0x1a1a1a, skin: 0x9a6a44, hairstyle: 'ponytail' }, -4.0, 1.0, Math.PI + 0.6,
      'Tamer Quill', oneOf('Tamer Quill', [
        'First time on a Pod. Is it true you don\'t feel it move? Pell says you blink and you\'re at the University. I don\'t believe a word she says, but I\'m STILL nervous.',
        'They say Leodones University has a library so deep it has its own weather. Historian Veyl charts the old ruins from down there. That\'s where I\'m headed — if this thing actually flies.',
      ]));

    // A child pressed to the window, watching the Pod
    npc({ top: 0xf2c14e, sleeves: 0xd9a73a, bottom: 0x3a4a6a, hair: 0x3a2a1a, skin: 0xe8b48a }, -8.5, edgeZ + 1.6, 0,
      'Wide-eyed Kid', oneOf('Wide-eyed Kid', [
        'IT\'S FLOATING. Mister, it\'s FLOATING! Mum says when she was little there were SIX of them and they went EVERYWHERE. I\'m gonna drive one when I grow up.',
        'Do you think it goes to Terra City? Grandpa says Terra had towers made of GLASS. ...Mum says we don\'t talk about Terra. But YOU can tell me, right?',
      ]));

    // A merchant who misses the trade lines
    npc({ top: 0x3a4a8a, sleeves: 0x2a3a6a, bottom: 0x2a2620, cap: 0x6a5020, hair: 0x2a1a10, skin: 0xc98a5a }, 6.0, 2.0, Math.PI - 0.5,
      'Merchant Dorne', oneOf('Merchant Dorne', [
        'One open line. ONE. You know what Rokon spice fetches in Haven now that nothing rolls in from the west? I could retire on a single restored route. Engineers, if you\'re listening — hurry UP.',
        'When the whole grid ran, a crate left Terra at dawn and was on a Haven shelf by dusk. Fifteen years later I\'m haggling with boat captains who smell of fish. Progress!',
      ]));

    // exit back to the city causeway
    const exitArch = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.6), chrome());
    exitArch.position.set(0, 3.4, HD - 0.3); s.add(exitArch);
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.0), glow(GOLD, 0.3));
    exitGlow.position.set(0, 1.6, HD - 0.35); exitGlow.name = 'portal'; s.add(exitGlow);
    this.label3d(s, '↓ To Haven City', '#f2d98a', new THREE.Vector3(0, 3.9, HD - 0.4), 3.0);
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, HD - 1.0), radius: 1.8,
      label: 'Press <b>E</b> — back down to Haven City',
      handler: async () => this.exitHouse(),
    });

    // the Pod itself is interactable — walk up to the gangway and board
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, podZ + 3.4), radius: 2.2,
      label: 'Press <b>E</b> — board the Transport Pod',
      handler: async () => this.openSkyportConsole(),
    });

    this.intMarkers.push(
      { x: -13, z: -3, label: 'Transit Grid', color: '#7fe6ff', kind: 'poi' },
      { x: 11.5, z: -HD + 1, label: 'Departures', color: '#7fe6ff', kind: 'poi' },
      { x: 0, z: HD, label: 'Exit', color: '#f2d98a', kind: 'door' },
    );
  }

  /** A floating holographic departures board listing the three Aetherline routes. */
  private skyportDepartures(): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 640; c.height = 400;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(8,20,30,0.86)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#4fe0ff'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9af0ff'; ctx.font = 'bold 40px Trebuchet MS'; ctx.textAlign = 'center';
    ctx.fillText('⬡ AETHERLINE DEPARTURES', c.width / 2, 52);
    ctx.strokeStyle = 'rgba(79,224,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 86); ctx.lineTo(c.width - 30, 86); ctx.stroke();
    const row = (y: number, name: string, status: string, ok: boolean) => {
      ctx.textAlign = 'left'; ctx.font = 'bold 34px Trebuchet MS';
      ctx.fillStyle = ok ? '#eaf6ff' : '#6a7488';
      ctx.fillText(`${ok ? '▶' : '✖'} ${name}`, 36, y);
      ctx.textAlign = 'right'; ctx.font = 'bold 28px Trebuchet MS';
      ctx.fillStyle = ok ? '#7dffb0' : '#ff7a7a';
      ctx.fillText(status, c.width - 36, y);
    };
    row(140, 'LEODONES UNIVERSITY', 'ONLINE', true);
    row(208, 'TERRA CITY', 'RESTORED', true);
    row(276, 'ROKON TOWN', 'SEVERED', false);
    ctx.textAlign = 'center'; ctx.font = 'italic 22px Trebuchet MS'; ctx.fillStyle = '#7a93b0';
    ctx.fillText('Terra line restored after 15 yrs · western lines still dark', c.width / 2, 350);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, depthWrite: false }));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 4.5),
      new THREE.MeshBasicMaterial({ color: 0x4fe0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = -0.05;
    halo.name = 'portal';                           // gentle opacity pulse (a Mesh, so the hook has a material)
    // a slim chrome mast holding the board aloft
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc6cdda, metalness: 0.9, roughness: 0.25 }));
    mast.position.y = -4.2;
    g.add(panel, halo, mast);
    return g;
  }

  /**
   * The Pod's holographic destination console. Only the Leodones University
   * line is live; the others read OFFLINE with their in-world reason. Boarding
   * the live line plays a short departure beat, then leaves the city.
   */
  private openSkyportConsole(): Promise<void> {
    this.busy = true;
    sfx('open');
    return new Promise<void>(resolve => {
      const finish = () => { closeMenu(); this.busy = false; resolve(); };
      const dest = (id: string, name: string, sub: string, online: boolean) => `
        <button class="ui-btn ${online ? 'primary' : ''}" data-dest="${id}" ${online ? '' : 'disabled'}
          style="display:flex;justify-content:space-between;align-items:center;gap:14px;text-align:left;padding:14px 16px;${online ? 'box-shadow:0 0 18px rgba(79,224,255,0.25)' : ''}">
          <span><b style="font-size:16px;letter-spacing:0.5px">${name}</b><br><span class="sub">${sub}</span></span>
          <span style="font-weight:700;letter-spacing:1px;color:${online ? '#7dffb0' : '#ff7a7a'}">${online ? 'ONLINE ▶' : 'OFFLINE'}</span>
        </button>`;
      const el = openScreen(`
        <div style="text-align:center;margin-bottom:4px;color:#9af0ff;letter-spacing:3px;font-size:13px">⬡ AETHERLINE TRANSIT</div>
        <h2 style="text-align:center;margin:2px 0 4px;color:#eaf6ff">Select Destination</h2>
        <div class="sub" style="text-align:center;margin-bottom:14px">The Pod hums on its cradle, awaiting coordinates.</div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:420px">
          ${dest('university', '🎓 Leodones University', 'The Capital line · the old halls await', true)}
          ${dest('terra', '🌆 Terra City', 'The eastern line · the Circuit-Crown of Tharkand, restored', true)}
          ${dest('rokon', '🏘️ Rokon Town', 'Western line still severed in the Sundering', false)}
        </div>
        <div style="display:flex;justify-content:center;margin-top:16px">
          <button class="ui-btn" id="pod-cancel">Stay in Haven City</button>
        </div>`);
      el.querySelectorAll<HTMLElement>('[data-dest]').forEach(b => b.onclick = async () => {
        const id = b.dataset.dest!;
        if (id !== 'university' && id !== 'terra') return;   // disabled buttons can't fire, but guard anyway
        const label = id === 'terra' ? 'Terra City' : 'Leodones University';
        closeMenu();
        sfx('confirm');
        toast(`⬡ Pod sealed — destination: ${label}`, 'gold', 2600);
        await say('Stationmaster Vey', id === 'terra'
          ? 'The Terra line — restored at LAST! Gate cycling, mind the field-line. Fifteen years that coast lay dark; you\'ll be among the first across the strait to it. Smooth skies, tamer — and tell the Circuit-Crown Haven never forgot her.'
          : 'Gate cycling — mind the field-line. Smooth skies to the University, tamer!');
        // a short boarding beat: the Pod rises off its cradle (raising the hover
        // base so the per-frame bob keeps playing on top of the lift)
        const lift = this.podHover;
        const baseY = lift ? (lift.userData.baseY as number) : 0;
        sfx('charge');
        await tween(1.2, t => { if (lift) lift.userData.baseY = baseY + t * 1.4; });
        this.busy = false;
        this.player.save();
        this.resolveExit?.(id as 'university' | 'terra');
        resolve();
      });
      (el.querySelector('#pod-cancel') as HTMLElement).onclick = () => { sfx('cancel'); finish(); };
    });
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

  // ================= quest guidance =================
  /**
   * Where should the player walk next? Derived from quest/flag state and
   * re-checked every couple of seconds; beacons appear and vanish as the
   * story moves. Keys keep existing beacons stable between checks.
   */
  private guidanceTargets(): { key: string; x: number; z: number; color: number }[] {
    const q = this.player.quests;
    const f = this.player.flags;
    const active = (id: string) => q[id] === 'active';
    if (!this.player.houseId) {
      // unpledged: the shuttle back to the Officers' Hall, and the Houses' terrace
      return [
        { key: 'shuttle', x: -23.4, z: 0, color: 0x4fe0ff },
        { key: 'terrace', x: 0, z: -21, color: 0xf2c14e },
      ];
    }
    if (active('story_historian') && !f['met_historian']) {
      return [{ key: 'shuttle', x: -23.4, z: 0, color: 0x4fe0ff }];
    }
    if (active('story_daughters') && !f['met_daughters']) {
      return [{ key: 'fountain', x: 0, z: 2.6, color: 0xf2884e }];
    }
    if (active('story_roads') || active('story_amber') || active('story_agdao') || active('story_cradle') || active('story_echoes')) {
      return [{ key: 'gate', x: 45, z: 0, color: 0x5a7bd8 }];
    }
    return [];
  }

  private syncGuidance(): void {
    const want = this.guidanceTargets();
    const wantKeys = want.map(t => t.key).join(',');
    const haveKeys = this.guideBeacons.map(b => b.key).join(',');
    if (wantKeys === haveKeys) return;
    this.guideBeacons.forEach(b => b.rig.dispose());
    this.guideBeacons = want.map(t => {
      const rig = makeGuideBeacon(t.color);
      rig.group.position.set(t.x, this.groundH(t.x, t.z), t.z);
      this.streetScene.add(rig.group);
      return { key: t.key, rig };
    });
  }

  // ================= per-frame =================
  private update(dt: number): void {
    if (!this.resolveExit) return;
    if (!this.sun) return; // a frame can render before run() builds the street

    (window as any).debugTimer = ((window as any).debugTimer || 0) + dt;
    if ((window as any).debugTimer >= 2.0) {
      (window as any).debugTimer = 0;
      try {
        const serializeObj = (c: THREE.Object3D): any => {
          return {
            name: c.name,
            type: c.type,
            pos: { x: c.position.x, y: c.position.y, z: c.position.z },
            visible: c.visible,
            children: c.children.map(serializeObj)
          };
        };
        const info = {
          mode: this.mode,
          tamerPos: { x: this.tamer.position.x, y: this.tamer.position.y, z: this.tamer.position.z },
          intSceneChildren: this.interiorScene ? this.interiorScene.children.map(serializeObj) : null,
          intGroundH_val: this.intGroundH ? this.intGroundH(this.tamer.position.x, this.tamer.position.z) : null,
        };
        fetch('http://localhost:4899/', {
          method: 'POST',
          body: JSON.stringify(info, null, 2)
        }).catch(() => {});
      } catch (e) {}
    }

    this.guideTimer -= dt;
    if (this.guideTimer <= 0) { this.guideTimer = 2; this.syncGuidance(); }
    this.guideBeacons.forEach(b => b.rig.update(dt));
    const speed = 5.2;
    let dx = 0, dz = 0;
    if (!isDialogueOpen() && !isMenuOpen() && !this.busy && !isTutorialOpen()) {
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
      const inBounds = (x: number, z: number) => {
        if (this.mode === 'street') {
          return Math.hypot(x, z) <= Town.WALL_R - 2.5;
        } else {
          return Math.abs(x) <= w / 2 - 0.7 && Math.abs(z) <= d / 2 - 0.7;
        }
      };
      const curY = this.tamer.position.y;
      // floor-aware obstacles: a banded collider only blocks on its own storey
      const blocks = (c: Collider, x: number, z: number) =>
        Math.hypot(x - c.pos.x, z - c.pos.z) < c.r &&
        (c.y0 === undefined || (curY >= c.y0 - 0.6 && curY <= (c.y1 ?? c.y0) + 0.6));
      const free = (x: number, z: number) =>
        !this.colliders.some(c => blocks(c, x, z)) &&
        (this.mode !== 'street' || !this.walkers.some(w => Math.hypot(x - w.grp.position.x, z - w.grp.position.z) < 0.5)) &&
        // multi-storey halls: forbid any step that would jump the player's
        // height discontinuously, which confines them to continuous ramps and
        // floors (no stepping off the side of a flight into the storey beside it).
        (this.intCamRig !== 'tower' || !this.intGroundH || Math.abs(this.intGroundH(x, z) - curY) <= 0.9) &&
        inBounds(x, z);
      if (free(nx, nz)) this.tamer.position.set(nx, curY, nz);
      else if (free(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (free(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz); // voxel human faces +Z at rotation 0
    }
    // terrain height — the Grand Houses' terrace and its stairs
    if (this.mode === 'street') {
      this.tamer.position.y = this.groundH(this.tamer.position.x, this.tamer.position.z);
    } else {
      this.tamer.position.y = this.intGroundH ? this.intGroundH(this.tamer.position.x, this.tamer.position.z) : 0;
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
        // nobody traps the player: walk into a townsperson and they step aside
        {
          const pdx = wlk.grp.position.x - this.tamer.position.x;
          const pdz = wlk.grp.position.z - this.tamer.position.z;
          const pd = Math.hypot(pdx, pdz);
          if (pd < 1.0 && pd > 1e-4) {
            const sx = wlk.grp.position.x + (pdx / pd) * 2.0 * dt;
            const sz = wlk.grp.position.z + (pdz / pd) * 2.0 * dt;
            if (Math.hypot(sx, sz) < Town.WALL_R - 3 &&
                !this.streetColliders.some(c => Math.hypot(sx - c.pos.x, sz - c.pos.z) < c.r + 0.2)) {
              wlk.grp.position.set(sx, this.groundH(sx, sz), sz);
              updateVoxelHuman(wlk.grp, true, dt);
              continue;
            }
          }
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

    // camera follow — right-drag orbits, then drifts home after 10 idle seconds
    const t = this.tamer.position;
    let camGoal: THREE.Vector3;
    if (this.mode === 'street') {
      camGoal = new THREE.Vector3(t.x, t.y + 7.5, t.z + 9);
    } else if (this.intCamRig === 'tower') {
      // a genuine follow-cam for the multi-storey hall: it tracks the player
      // across the whole floor AND rides smoothly up/down the stairs with
      // them, while staying inside the footprint and just under the ceiling.
      const { w, d } = this.intRoom;
      const cx = THREE.MathUtils.clamp(t.x, -w / 2 + 2.4, w / 2 - 2.4);
      const cz = THREE.MathUtils.clamp(t.z + 6.6, -d / 2 + 2.4, d / 2 - 0.6);
      camGoal = new THREE.Vector3(cx, t.y + 4.3, cz);
      // cull the storeys above the player so their slabs never obstruct the view
      const curFloor = this.intFloorOf(t.y);
      for (let i = 0; i < this.intUpperFloors.length; i++) this.intUpperFloors[i].visible = curFloor >= i + 1;
    } else {
      camGoal = new THREE.Vector3(t.x * 0.5, this.intCamH + t.y * 0.9, t.z + this.intCamD);
    }
    worldOrbit.update(dt);
    const lookT = new THREE.Vector3(t.x, t.y + (this.intCamRig === 'tower' ? 1.5 : 1), t.z);
    this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 4));
    this.camera.lookAt(lookT);

    // ---- day/night cycle (shared world clock) ----
    let daylight = 1, night = 0;
    if (this.mode === 'street' && this.dayNight) {
      this.dayNight.update(dt);
      daylight = worldClock.daylight;
      night = worldClock.night;
      this.streetScene.traverse(o => {
        if (o.name === 'streetlamp') (o as THREE.PointLight).intensity = 11 * night;
        if (o.name === 'lampOrb') {
          ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + 1.25 * night;
        }
        if (o.name === 'nightwindow') {
          ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + 1.1 * night;
        }
      });
    }

    // ambient prop animation
    const scene = this.mode === 'interior' && this.interiorScene ? this.interiorScene : this.streetScene;

    // ---- point-light budget ----
    // Re-collect when the active scene changes (street ↔ interior).
    if (scene !== this.litScene) {
      this.litScene = scene;
      this.scenePointLights = [];
      scene.traverse(o => { if ((o as THREE.PointLight).isPointLight) this.scenePointLights.push(o as THREE.PointLight); });
    }
    if (this.scenePointLights.length > Town.MAX_POINT_LIGHTS) {
      const tp = this.tamer.position;
      const ranked = this.scenePointLights
        .map(l => {
          const e = l.matrixWorld.elements;
          // dark lights (daytime street lamps) only fill leftover slots —
          // the slot count stays constant so the shaders compile once.
          const penalty = l.intensity <= 0.05 ? 1e4 : 0;
          return { l, score: Math.hypot(e[12] - tp.x, e[14] - tp.z) + penalty };
        })
        .sort((a, b) => a.score - b.score);
      ranked.forEach((r, i) => { r.l.visible = i < Town.MAX_POINT_LIGHTS; });
    }

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
      if (o.name === 'chatbubble') {
        const base = (o.userData.baseScale as number) ?? 0.5;
        const k = base * (1 + Math.sin(now * 0.004 + o.position.x) * 0.12);
        o.scale.set(k, k, 1);
        o.position.y += Math.sin(now * 0.002 + o.position.z) * 0.0006;
      }
      if (o.name === 'legendpulse') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) m.emissiveIntensity = 0.85 + Math.sin(now * 0.0026 + o.position.x * 1.7 + o.position.z * 1.3) * 0.45;
      }
      if (o.name === 'aetherfloat') {
        o.position.y = (o.userData.baseY as number) + Math.sin(now * 0.0011 + (o.userData.ph as number)) * 0.3;
        o.rotation.y = now * 0.0009 + (o.userData.ph as number);
      }
      if (o.name === 'pondwater') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 0.3 + Math.sin(now * 0.0018) * 0.08;
        o.scale.setScalar(1 + Math.sin(now * 0.0012) * 0.01);
      }
      if (o.name === 'scanline') {
        o.position.y = 0.6 + ((now * 0.0006 + ((o.userData.ph as number) ?? 0)) % 1) * 2.1;
      }
      if (o.name === 'podhover') {
        // the Transport Pod drifts on its lift-field: a slow bob + the faintest roll
        // (the capsule's own π/2 tilt lives on its child meshes, so the group
        // oscillates gently around zero)
        o.position.y = (o.userData.baseY as number) + Math.sin(now * 0.0013) * 0.16;
        o.rotation.x = Math.sin(now * 0.0009) * 0.012;
        o.rotation.z = Math.sin(now * 0.0011 + 1.7) * 0.01;
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
      // birds circle high by day and roost after dark
      for (const bd of this.birds) {
        bd.angle += dt * bd.speed;
        const bx = bd.center.x + Math.cos(bd.angle) * bd.r;
        const bz = bd.center.z + Math.sin(bd.angle) * bd.r;
        bd.grp.position.set(bx, bd.center.y + Math.sin(tSec * 0.8 + bd.r) * 0.8, bz);
        const dir = bd.speed > 0 ? 1 : -1;
        bd.grp.rotation.y = Math.atan2(Math.cos(bd.angle) * dir, -Math.sin(bd.angle) * dir);
        const flap = Math.sin(tSec * 7 + bd.r * 3) * 0.55;
        bd.wingL.rotation.z = flap;
        bd.wingR.rotation.z = -flap;
        bd.grp.visible = daylight > 0.12;
      }
      if (this.windmillHub) this.windmillHub.rotation.z = now * 0.0006;
      if (this.fountainJet) {
        this.fountainJet.scale.y = 1 + Math.sin(now * 0.004) * 0.18;
        (this.fountainJet.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(now * 0.005) * 0.15;
      }
      // the Skyport causeway: guide-lights chase toward the station (rising u)
      this.podwayT += dt;
      for (const L of this.podway) {
        const wave = Math.sin(this.podwayT * 3.4 - L.u * 11);
        L.mat.emissiveIntensity = 0.22 + Math.max(0, wave) * L.amp;
      }
    }

    // ---- labeled minimap ----
    const cv = minimapCanvas();
    if (this.mode === 'street') {
      drawAreaMap(cv, {
        shape: 'circle', radius: Town.WALL_R + 1,
        markers: [
          ...this.streetMarkers,
          ...this.walkers.map(wk => ({ x: wk.grp.position.x, z: wk.grp.position.z, color: '#d8d8e8', kind: 'npc' as const })),
        ],
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title: `Haven City — ${worldClock.label}`,
      });
    } else {
      // multi-storey halls swap the marker set + title to the current floor
      const fi = this.intFloorMarkers ? this.intFloorOf(t.y) : 0;
      const markers = this.intFloorMarkers ? (this.intFloorMarkers[fi] ?? this.intMarkers) : this.intMarkers;
      const title = this.intFloorNames.length ? `${this.intName} · ${this.intFloorNames[fi]}` : this.intName;
      drawAreaMap(cv, {
        shape: 'rect', w: this.intRoom.w, d: this.intRoom.d,
        markers,
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title,
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
    if (isDialogueOpen() || isMenuOpen() || this.busy || isTutorialOpen()) return;
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
  /** Resolves when the player departs — through the Expedition Gate or the Aetherline Skyport. */
  async run(): Promise<'expedition' | 'university' | 'terra'> {
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

    // click any soul in the city to read their card
    const detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.mode === 'street'
        ? [...this.walkers.map(wk => wk.grp), ...this.staticNpcs]
        : this.intNpcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy || isTutorialOpen(),
    });

    if (this.firstArrival) {
      // Field Manual II — Mara's mandatory city tour, spotlight and all
      await runCityTutorial(this.player);
      const joined = HOUSES.find(h => h.id === this.player.houseId);
      if (joined) {
        await say('Guide Mara', `And I see ${joined.name} colors already — well done! Head north when you're ready: your house hall stands in the great arc, and the master keeps orders waiting for members. Check your Quest Journal with J.`);
      }
      this.player.save();
    }

    return new Promise<'expedition' | 'university' | 'terra'>(res => {
      this.resolveExit = dest => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        detachPicker();
        showInteractHint(null);
        showHotkeys(false);
        hideAreaMap(minimapCanvas());
        this.intRigs.forEach(disposeRig);
        this.resolveExit = null;
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
        previewHandle.focus(activeTab === 'hat' ? 'head' : 'full'); // close-up on the head for hats

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

        // ===== wardrobe tabs ===== (Terra City prestige gear is sold only at its own Atelier)
        const items = Object.values(CLOTHES_DATABASE).filter(item => item.slot === activeTab && !item.terra);
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
): { update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => void; focus: (part: 'full' | 'head') => void; dispose: () => void } {
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
  // smooth-zoom framing: full body, or a close-up on the head for hats
  const VIEWS = {
    full: { pos: new THREE.Vector3(0, 0.95, 2.5), look: new THREE.Vector3(0, 0.82, 0) },
    head: { pos: new THREE.Vector3(0, 1.62, 1.6), look: new THREE.Vector3(0, 1.66, 0) },
  };
  const posGoal = VIEWS.full.pos.clone();
  const lookGoal = VIEWS.full.look.clone();
  const lookNow = lookGoal.clone();

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
    updateTamerFX(tamerGroup, dt); // breathe life into any prestige cosmetics
    const k = Math.min(1, dt * 6);
    camera.position.lerp(posGoal, k);
    lookNow.lerp(lookGoal, k);
    camera.lookAt(lookNow);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  return {
    update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => {
      updateTamerAppearance(tamerGroup, eq, app ?? appearance);
    },
    focus: (part: 'full' | 'head') => { const v = VIEWS[part] ?? VIEWS.full; posGoal.copy(v.pos); lookGoal.copy(v.look); },
    dispose: () => {
      active = false;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      const prevFx = (tamerGroup.userData as { fxDispose?: () => void }).fxDispose;
      if (prevFx) prevFx(); // free any prestige-FX GPU resources before tearing down
      while (tamerGroup.children.length > 0) {
        tamerGroup.remove(tamerGroup.children[0]);
      }
      renderer.dispose();
      canvas.remove();
    }
  };
}
