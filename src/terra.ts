// ============================================================
// AZ Tamer — Terra City, the Circuit-Crown of Tharkand.
// A neon metropolis raised over the fifteen years the Aetherline
// lay severed: glass towers veined in glowing copper, plazas
// stitched with running light, data-conduits humming between
// spires, and the Grand Coliseum — the Worldring — waiting in the
// north for the World Championships to come home.
//
// Reached through the restored Pod line from Haven City's Skyport.
// A peer area like New Salmonan / Agdao: its own scene, camera and
// loop, with Town-style interior-swap for the restaurants and
// convenience stores. The Coliseum is exterior-only (for now).
// ============================================================
import * as THREE from 'three';
import { Player } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, updateTamerFX, setVoxelSeated, disposeRig, tween,
  canvasTex, mulberry, skyGradient, tileTexture, type GuardianRig, type VoxelHumanOpts,
} from './models';
import { TERRA_LORE } from './lore';
import { ITEMS } from './data';
import {
  say, conversation, choose, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, openScreen, closeMenu, type PanelKind,
} from './ui';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance, CLOTHES_DATABASE } from './clothes';
import { worldOrbit } from './camorbit';
import { tagNpc, attachNpcPicker } from './npccard';
import { sfx } from './audio';

const minimapCanvas = () => document.getElementById('minimap') as HTMLCanvasElement;

interface Interactable { pos: THREE.Vector3; radius: number; label: string; handler: () => Promise<void> | void; }
interface Collider { pos: THREE.Vector3; r: number; }

type Mode = 'street' | 'interior';
type VenueId = 'lumen' | 'sizzle' | 'voltmart' | 'pulse';

// ---- the palette of the Circuit-Crown ----
const CYAN = 0x4fe0ff;          // the city's signature filament glow
const MAGENTA = 0xff5aa8;       // the Lumenwrights' neon
const GOLD = 0xf2c14e;          // the Worldring / championship gold
const ACID = 0x5aff9a;          // Voltwake green
const COPPER = 0xb9772f;        // bare circuit traces

// =================== circuit-board textures ===================

/** A printed-circuit floor: dark solder-mask, copper routing, vias and pads. */
function circuitFloorTexture(): THREE.Texture {
  return canvasTex(512, (ctx, s) => {
    const rnd = mulberry(404);
    // dark green-black solder mask with a faint sheen
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#0a1f1a'); g.addColorStop(0.5, '#0c2620'); g.addColorStop(1, '#08160f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(120,200,160,${rnd() * 0.05})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    // copper traces — Manhattan routing with rounded elbows
    const trace = (col: string, w: number, n: number, seed: number) => {
      const r2 = mulberry(seed);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        let x = Math.floor(r2() * 8) * (s / 8) + 8;
        let y = Math.floor(r2() * 8) * (s / 8) + 8;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          if (r2() > 0.5) x += (r2() > 0.5 ? 1 : -1) * (s / 8);
          else y += (r2() > 0.5 ? 1 : -1) * (s / 8);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        // a via pad at the end
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, w * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    };
    trace('#7a4a1e', 5, 26, 11);                  // shadowed copper underlay
    trace('#c9863a', 3, 26, 11);                  // bright copper
    trace('rgba(79,224,255,0.55)', 2, 14, 73);    // a few signal traces glow cyan
    // scattered solder pads / vias
    for (let i = 0; i < 70; i++) {
      const x = rnd() * s, y = rnd() * s, r = 2 + rnd() * 3;
      ctx.fillStyle = '#caa45a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1810'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }, 5);
}

/** A glowing panel for tower / building skins: dark glass + neon circuit veins. */
function circuitPanelTexture(base: string, glow: number, seed = 5): THREE.Texture {
  const gh = '#' + glow.toString(16).padStart(6, '0');
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, base); g.addColorStop(1, '#05080e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    // vertical bus-bars
    ctx.strokeStyle = gh; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.5) * (s / 5) + (rnd() - 0.5) * 8;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
      // branch taps
      for (let j = 0; j < 4; j++) {
        const y = rnd() * s;
        const len = (rnd() > 0.5 ? 1 : -1) * (s / 6);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
        ctx.fillStyle = gh; ctx.beginPath(); ctx.arc(x + len, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, 1);
}

/** A grid of lit windows for a glass tower — bright cells on dark glass. */
function towerWindowTexture(glow: number, seed = 9): THREE.Texture {
  const gh = '#' + glow.toString(16).padStart(6, '0');
  return canvasTex(128, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, s, s);
    const cell = s / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const on = rnd();
      ctx.fillStyle = on > 0.55 ? gh : on > 0.3 ? 'rgba(120,160,200,0.22)' : '#0a1018';
      ctx.globalAlpha = on > 0.55 ? 0.55 + rnd() * 0.4 : 1;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
    ctx.globalAlpha = 1;
  }, 1);
}

export class TerraCity {
  private streetScene = new THREE.Scene();
  private interiorScene: THREE.Scene | null = null;
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  private tamer = makeTamer();
  private keys = new Set<string>();
  private busy = false;
  private mode: Mode = 'street';
  private walking = false;

  private streetInteractables: Interactable[] = [];
  private streetColliders: Collider[] = [];
  private intInteractables: Interactable[] = [];
  private intColliders: Collider[] = [];
  private staticNpcs: THREE.Group[] = [];
  private intNpcs: THREE.Group[] = [];
  private intRigs: GuardianRig[] = [];
  private intRoom = { w: 18, d: 14 };
  private intName = '';
  private intCamH = 5.6;
  private intCamD = 6.6;
  private exitSpot = new THREE.Vector3();
  private currentVenueId: VenueId | null = null;

  private streetMarkers: MapMarker[] = [];
  private intMarkers: MapMarker[] = [];

  // ambient life
  private patrollers: { grp: THREE.Group; angle: number; r: number; cx: number; cz: number; speed: number }[] = [];
  private drones: { grp: THREE.Group; angle: number; r: number; cx: number; cz: number; y: number; speed: number }[] = [];
  private podHover: THREE.Object3D | null = null;
  // slowly-turning storefront mannequins modelling the Atelier's prestige FX gear
  private displayRigs: { rig: THREE.Group; spin: number }[] = [];

  // forward-renderer light budget — only the nearest few point lights stay lit
  private static readonly MAX_POINT_LIGHTS = 10;
  private static readonly WALL_R = 44;
  private litScene: THREE.Scene | null = null;
  private scenePointLights: THREE.PointLight[] = [];

  private resolveExit: (() => void) | null = null;

  constructor(private player: Player, private firstArrival = false) {}

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

  // ---- small materials helpers ----
  private static chrome() { return new THREE.MeshStandardMaterial({ color: 0xc6cdda, metalness: 0.95, roughness: 0.22 }); }
  private static darkChrome() { return new THREE.MeshStandardMaterial({ color: 0x232a3a, metalness: 0.85, roughness: 0.4 }); }
  private static emis(c: number, i = 1) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, metalness: 0.4 }); }
  private static glow(c: number, o: number) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }

  /** A floating world-space text label, the same dialect Haven City uses. */
  private label3d(scene: THREE.Scene, text: string, color: string, pos: THREE.Vector3, scale = 4.4): void {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 56px Trebuchet MS';
    const tw = Math.ceil(ctx.measureText(text).width);
    c.width = Math.max(512, tw + 64); c.height = 128;
    const ctx2 = c.getContext('2d')!;
    ctx2.font = 'bold 56px Trebuchet MS'; ctx2.textAlign = 'center';
    ctx2.lineWidth = 10; ctx2.strokeStyle = '#06121c'; ctx2.strokeText(text, c.width / 2, 80);
    ctx2.fillStyle = color; ctx2.fillText(text, c.width / 2, 80);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 40;
    const aspect = c.width / c.height;
    sp.scale.set(scale * (aspect / 4), scale / 4, 1);
    sp.position.copy(pos);
    scene.add(sp);
  }

  /** A drooping glowing conduit-cable between two points. */
  private wire(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, sag: number, color: number, rad = 0.1): void {
    const mid = from.clone().lerp(to, 0.5); mid.y -= sag;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, rad, 6, false), TerraCity.emis(color, 1.1));
    tube.name = 'legendpulse';
    scene.add(tube);
  }

  // =================== the street: the Circuit-Crown ===================
  private buildStreet(): void {
    const s = this.streetScene;
    const R = TerraCity.WALL_R;

    // ---- sky: a perpetual electric twilight ----
    s.background = skyGradient('#0a1430', '#04060d');
    s.fog = new THREE.Fog(0x06101f, 50, 155);
    s.add(new THREE.AmbientLight(0x42507a, 0.62));
    // a cool key from high above for gentle shape + shadow
    const key = new THREE.DirectionalLight(0xbfe0ff, 0.55);
    key.position.set(18, 40, 26); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -50; key.shadow.camera.right = 50;
    key.shadow.camera.top = 50; key.shadow.camera.bottom = -50;
    s.add(key);
    // warm + cool fill pools over the plaza
    const pCyan = new THREE.PointLight(CYAN, 18, 40); pCyan.position.set(0, 9, 6); s.add(pCyan);
    const pGold = new THREE.PointLight(GOLD, 14, 44); pGold.position.set(0, 12, -26); s.add(pGold);
    const pMag = new THREE.PointLight(MAGENTA, 12, 30); pMag.position.set(-22, 7, 6); s.add(pMag);
    const pAcid = new THREE.PointLight(ACID, 12, 30); pAcid.position.set(22, 7, 6); s.add(pAcid);

    // ---- the circuit-board plaza floor ----
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2, 64),
      new THREE.MeshStandardMaterial({ map: circuitFloorTexture(), roughness: 0.55, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);

    // glowing concentric ring-traces around the core
    for (const rr of [7, 13, 20, 28]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.08, 6, 80), TerraCity.emis(CYAN, 0.7));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.name = 'legendpulse'; s.add(ring);
    }
    // radial bus-traces spoking out from the core to the rim
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const col = [CYAN, MAGENTA, ACID, GOLD][i % 4];
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(R - 6, 0.16), TerraCity.emis(col, 0.6));
      seam.rotation.x = -Math.PI / 2; seam.rotation.z = a;
      seam.position.set(Math.cos(a) * (R / 2 + 1), 0.03, Math.sin(a) * (R / 2 + 1));
      seam.name = 'legendpulse'; s.add(seam);
    }

    // ---- the perimeter wall: a low ring of dark glass + a glowing data-rail ----
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 2, R + 2, 3.4, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0a1020, metalness: 0.6, roughness: 0.5, side: THREE.BackSide }));
    wall.position.y = 1.7; s.add(wall);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 1.6, 0.12, 6, 80), TerraCity.emis(CYAN, 0.9));
    rail.rotation.x = -Math.PI / 2; rail.position.y = 3.0; rail.name = 'legendpulse'; s.add(rail);

    // ---- the Core Spire: the city's central data-tower ----
    const spireTop = this.buildCoreSpire(s, 0, 0);

    // ---- the Grand Coliseum (the Worldring) — hero landmark to the north ----
    this.buildColiseum(s, 0, -37);

    // ---- skyline towers around the rim, each wired to the spire ----
    const towerSpec: [number, number, number, number][] = [
      // angle, radius, height, glow
      [-2.3, 36, 22, CYAN], [-1.5, 38, 28, MAGENTA], [-0.7, 35, 18, ACID],
      [2.3, 36, 24, ACID], [1.6, 38, 30, CYAN], [0.8, 34, 16, GOLD],
      [Math.PI + 0.5, 40, 20, MAGENTA], [Math.PI - 0.5, 40, 20, CYAN],
    ];
    for (const [a, rad, h, glow] of towerSpec) {
      const tx = Math.cos(a) * rad, tz = Math.sin(a) * rad;
      const top = this.buildTower(s, tx, tz, h, glow);
      this.wire(s, top, spireTop.clone().add(new THREE.Vector3(0, -2, 0)), 3 + Math.random() * 2, glow, 0.09);
      this.streetColliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 4.0 });
    }

    // ---- the four venues: 2 restaurants + 2 convenience stores ----
    this.buildVenueExterior(s, 'lumen', -22, -6, 'restaurant', MAGENTA, '🍷 The Lumen Table');
    this.buildVenueExterior(s, 'sizzle', -19, 16, 'restaurant', ACID, '🍜 Spark & Sizzle');
    this.buildVenueExterior(s, 'voltmart', 22, -6, 'store', ACID, '🛒 Volt-Mart');
    this.buildVenueExterior(s, 'pulse', 19, 16, 'store', CYAN, '🏪 Pulse Pantry');

    // ---- the Aetherline Atelier: Terra City's prestige fashion boutique ----
    // West of the central axis, set back from the entrance, facing south so the
    // player sees the storefront straight on as they arrive.
    this.buildTerraBoutique(s, -7, 17);

    // ---- the return Pod platform (south — where you arrived) ----
    this.buildReturnPod(s, 0, 33);

    // ---- floating holo-motes drifting through the plaza ----
    for (let i = 0; i < 12; i++) {
      const by = 2 + Math.random() * 5;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.12),
        TerraCity.glow([CYAN, MAGENTA, ACID][i % 3], 0.85));
      mote.position.set((Math.random() - 0.5) * 50, by, (Math.random() - 0.5) * 50);
      mote.name = 'aetherfloat'; mote.userData.baseY = by; mote.userData.ph = Math.random() * 6.28; s.add(mote);
    }

    // ---- the souls of Terra City ----
    this.populateStreet(s);

    // ---- holo-drones on slow circuits overhead ----
    for (let i = 0; i < 4; i++) {
      const d = this.makeDrone([CYAN, MAGENTA, ACID, GOLD][i]);
      const r = 14 + i * 5, y = 8 + i * 1.6;
      d.position.set(r, y, 0); s.add(d);
      this.drones.push({ grp: d, angle: i * 1.6, r, cx: 0, cz: -4, y, speed: 0.22 + i * 0.05 });
    }

    this.streetMarkers.push(
      { x: 0, z: -28, label: '🏟️ Worldring', color: '#f2c14e', kind: 'building' },
      { x: 0, z: 0, label: 'Core Spire', color: '#7fe6ff', kind: 'poi' },
      { x: 0, z: 33, label: '⬡ To Haven City', color: '#7fe6ff', kind: 'door' },
    );
  }

  /** The central data-tower: a tapered spire crowned with a pulsing orb. Returns the orb position. */
  private buildCoreSpire(s: THREE.Scene, x: number, z: number): THREE.Vector3 {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.8, 16, 8),
      new THREE.MeshStandardMaterial({ map: circuitPanelTexture('#0c1828', CYAN, 3), metalness: 0.7, roughness: 0.4 }));
    shaft.position.y = 8; shaft.castShadow = true; g.add(shaft);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 - i * 0.18, 0.07, 6, 24), TerraCity.emis(CYAN, 1.1));
      ring.rotation.x = Math.PI / 2; ring.position.y = 3 + i * 2.8; ring.name = 'legendpulse'; g.add(ring);
    }
    const orbY = 17.4;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), TerraCity.emis(CYAN, 1.4));
    orb.position.y = orbY; orb.name = 'aetherfloat'; orb.userData.baseY = orbY; orb.userData.ph = 0; g.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), TerraCity.glow(CYAN, 0.16));
    halo.position.y = orbY; g.add(halo);
    const light = new THREE.PointLight(CYAN, 16, 30); light.position.y = orbY; g.add(light);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 2.6 });
    this.label3d(s, '◈ THE CORE', '#7fe6ff', new THREE.Vector3(x, 20.4, z), 4.2);
    return new THREE.Vector3(x, orbY, z);
  }

  /** A glass skyline tower with neon edge-lighting and lit windows. Returns its top. */
  private buildTower(s: THREE.Scene, x: number, z: number, h: number, glow: number): THREE.Vector3 {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const w = 4 + Math.random() * 2, dp = 4 + Math.random() * 2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp),
      new THREE.MeshStandardMaterial({ map: towerWindowTexture(glow, (x * 13 + z) | 0), metalness: 0.5, roughness: 0.25, color: 0x223044 }));
    body.position.y = h / 2; body.castShadow = true; g.add(body);
    // glowing vertical edge-strips
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), TerraCity.emis(glow, 0.9));
      edge.position.set(sx * w / 2, h / 2, sz * dp / 2); edge.name = 'legendpulse'; g.add(edge);
    }
    // a beacon crown
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), TerraCity.emis(glow, 1.2));
    crown.position.y = h + 0.6; crown.name = 'legendpulse'; g.add(crown);
    s.add(g);
    return new THREE.Vector3(x, h + 0.6, z);
  }

  /** The Grand Coliseum — the Worldring — exterior only (no interior yet). */
  private buildColiseum(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, metalness: 0.6, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3, emissive: GOLD, emissiveIntensity: 0.18 });
    // three stacked tiers (open rings)
    const tiers: [number, number, number][] = [[18, 6, 0], [15.5, 5, 6], [13, 4, 11]];
    for (const [rad, hh, yy] of tiers) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad + 0.6, hh, 48, 1, true), stoneMat);
      tier.position.y = yy + hh / 2; tier.castShadow = tier.receiveShadow = true; g.add(tier);
      // arched openings: a ring of pillars hint
      const pillars = 24;
      for (let i = 0; i < pillars; i++) {
        const a = (i / pillars) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, hh * 0.8, 0.5), goldMat);
        p.position.set(Math.cos(a) * (rad + 0.2), yy + hh / 2, Math.sin(a) * (rad + 0.2));
        g.add(p);
      }
      // a glowing cornice band
      const band = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.5, 0.18, 6, 56), TerraCity.emis(GOLD, 0.9));
      band.rotation.x = Math.PI / 2; band.position.y = yy + hh; band.name = 'legendpulse'; g.add(band);
    }
    // the crown of light: a tall ring of beams over the bowl
    const beams = 16;
    for (let i = 0; i < beams; i++) {
      const a = (i / beams) * Math.PI * 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), TerraCity.glow(GOLD, 0.4));
      beam.position.set(Math.cos(a) * 11, 19, Math.sin(a) * 11);
      beam.rotation.z = Math.cos(a) * 0.2; beam.rotation.x = Math.sin(a) * 0.2; g.add(beam);
    }
    // a vast holographic championship banner over the gates (facing the plaza, +z)
    const banner = this.coliseumBanner();
    banner.position.set(0, 9, 18.3); g.add(banner);
    // the sealed gate
    const gate = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 1.2), TerraCity.darkChrome());
    gate.position.set(0, 4, 18); g.add(gate);
    const gateGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), TerraCity.glow(GOLD, 0.22));
    gateGlow.position.set(0, 4, 18.65); gateGlow.name = 'portal'; g.add(gateGlow);
    // floodlights
    const fl = new THREE.PointLight(GOLD, 14, 50); fl.position.set(0, 16, 12); g.add(fl);
    s.add(g);

    this.label3d(s, '🏟️ THE WORLDRING', '#ffe08a', new THREE.Vector3(x, 26, z), 7.0);
    // a big footprint collider so the player stops at the gates
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 17 });

    // the gate sign — the championship is coming home (no entry yet)
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z + 19.5), radius: 3.0,
      label: 'Press <b>E</b> — read the Worldring gates',
      handler: async () => {
        sfx('blip');
        await conversation([
          ['', 'THE GRAND COLISEUM OF TERRA — THE WORLDRING. Capacity: ten thousand voices. Engraved above the sealed gate, in gold the size of a tamer:'],
          ['The Worldring Gates', '"HERE THE WORLD DECIDES ITS BEST. The annual World Championships return home. Crews at work — the bowl reopens for the coming season."'],
          ['', `A holo-marquee scrolls the honor roll: twenty-two titles, three names. Aljay. Greggy. Onnel. Below it, smaller: "next champion: ______". The blank is, somehow, the loudest thing on the gate.`],
        ]);
      },
    });
  }

  /** A glowing holo-banner of the World Championships for the Coliseum gate. */
  private coliseumBanner(): THREE.Mesh {
    const c = document.createElement('canvas'); c.width = 640; c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(10,14,24,0.85)'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe49a'; ctx.font = 'bold 52px Trebuchet MS';
    ctx.fillText('WORLD CHAMPIONSHIPS', c.width / 2, 64);
    ctx.fillStyle = '#9af0ff'; ctx.font = 'italic 30px Trebuchet MS';
    ctx.fillText('— THE WORLDRING, TERRA CITY —', c.width / 2, 120);
    ctx.fillStyle = '#f4e8c8'; ctx.font = 'bold 30px Trebuchet MS';
    ctx.fillText('20 YEARS · 22 TITLES · 3 LEGENDS', c.width / 2, 176);
    ctx.fillStyle = '#7dffb0'; ctx.font = 'bold 26px Trebuchet MS';
    ctx.fillText('THE CROWN COMES HOME', c.width / 2, 218);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false }));
    m.name = 'portal';
    return m;
  }

  /** A small hovering holo-drone (a courier of the Voltwake / Concord). */
  private makeDrone(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), TerraCity.chrome());
    g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 18), TerraCity.emis(color, 1.2));
    ring.name = 'legendpulse'; g.add(ring);
    const under = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), TerraCity.glow(color, 0.7));
    under.position.y = -0.5; g.add(under);
    return g;
  }

  /** A venue exterior: a glowing shopfront with a neon sign and an enterable door. */
  private buildVenueExterior(
    s: THREE.Scene, id: VenueId, x: number, z: number,
    kind: 'restaurant' | 'store', glow: number, label: string,
  ): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);            // face the plaza centre
    const W = 9, H = kind === 'store' ? 4.6 : 5.6, D = 8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
      new THREE.MeshStandardMaterial({ map: circuitPanelTexture('#101a2a', glow, (x * 7 + z) | 0), metalness: 0.55, roughness: 0.4, color: 0x33425a }));
    body.position.y = H / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    // glowing roofline + edge strips
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.4, D + 0.6), TerraCity.darkChrome());
    roof.position.y = H + 0.1; g.add(roof);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 0.16, D + 0.7), TerraCity.emis(glow, 1.0));
    cornice.position.y = H + 0.32; cornice.name = 'legendpulse'; g.add(cornice);
    // big neon shop window facing the plaza (+z local)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(W - 2.2, H - 1.8),
      new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.5, transparent: true, opacity: 0.4, roughness: 0.1 }));
    win.position.set(0, H / 2, D / 2 + 0.06); g.add(win);
    // door frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.2), TerraCity.chrome());
    frame.position.set(0, 1.3, D / 2 + 0.05); g.add(frame);
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), TerraCity.glow(glow, 0.4));
    doorGlow.position.set(0, 1.2, D / 2 + 0.16); doorGlow.name = 'portal'; g.add(doorGlow);
    // a neon sign blade jutting out over the door
    const blade = this.neonSign(label.replace(/^\S+\s/, ''), glow);
    blade.position.set(0, H - 0.6, D / 2 + 0.7); g.add(blade);
    // a wire from the roofline up toward the core spire
    s.add(g);
    this.wire(s, new THREE.Vector3(x, H + 1, z), new THREE.Vector3(0, 12, 0), 2.5, glow, 0.07);

    // a soft interior-glow lamp at the storefront
    const lamp = new THREE.PointLight(glow, 9, 16); lamp.position.set(x, 3, z + (z > 0 ? -3 : 3)); s.add(lamp);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 5.8 });
    this.label3d(s, label, '#' + glow.toString(16).padStart(6, '0'), new THREE.Vector3(x, H + 2.2, z), 4.4);
    this.streetMarkers.push({ x, z, label, color: '#' + glow.toString(16).padStart(6, '0'), kind: 'building' });

    // the door — in world space, in front of the (rotated) facade, just clear of the collider
    const door = new THREE.Vector3(0, 0, D / 2 + 2.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: door, radius: 2.2,
      label: `Press <b>E</b> — enter ${label.replace(/^\S+\s/, '')}`,
      handler: () => this.enterVenue(id),
    });
  }

  /** A jutting neon sign blade with painted glowing text. */
  private neonSign(text: string, glow: number): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 384; c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(8,12,20,0.9)'; ctx.fillRect(0, 0, c.width, c.height);
    const gh = '#' + glow.toString(16).padStart(6, '0');
    ctx.strokeStyle = gh; ctx.lineWidth = 4; ctx.strokeRect(5, 5, c.width - 10, c.height - 10);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = gh; ctx.shadowBlur = 16;
    ctx.fillStyle = '#fdfdff'; ctx.font = 'bold 44px Trebuchet MS';
    ctx.fillText(text, c.width / 2, c.height / 2 + 4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false }));
    panel.name = 'portal'; g.add(panel);
    return g;
  }

  /** The Pod platform you arrived on — and the way home to Haven City. */
  private buildReturnPod(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    // a raised chrome dais
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.5, 24), TerraCity.darkChrome());
    dais.position.y = 0.25; dais.receiveShadow = true; g.add(dais);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 8, 40), TerraCity.emis(CYAN, 1.1));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.55; ring.name = 'legendpulse'; g.add(ring);
    // docking cradle rings
    for (const rr of [1.4, 2.4]) {
      const c2 = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 8, 28), TerraCity.emis(CYAN, 1.0));
      c2.rotation.x = -Math.PI / 2; c2.position.y = 0.6; c2.name = 'legendpulse'; g.add(c2);
    }
    // the floating Pod capsule
    const podY = 2.6;
    const pod = new THREE.Group(); pod.name = 'podhover'; pod.userData.baseY = podY;
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 4.4, 8, 18), TerraCity.chrome());
    hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.82); hull.castShadow = true; pod.add(hull);
    const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 4.6, 6, 12), new THREE.MeshStandardMaterial({ color: 0xeef4ff, metalness: 0.9, roughness: 0.1 }));
    crest.rotation.z = Math.PI / 2; crest.position.y = 1.0; crest.scale.set(1, 1, 0.5); pod.add(crest);
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.45, 0.08), TerraCity.emis(CYAN, 1.4));
      band.position.set(0, 0.3, side * 1.12); band.name = 'legendpulse'; pod.add(band);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), TerraCity.glow(CYAN, 0.4));
    door.position.set(0, 0.05, 1.18); door.name = 'portal'; pod.add(door);
    const lev = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), TerraCity.glow(CYAN, 0.45));
    lev.rotation.x = -Math.PI / 2; lev.position.y = -1.4; pod.add(lev);
    pod.position.set(0, podY, z > 0 ? -1.2 : 1.2); g.add(pod);
    this.podHover = pod;
    const light = new THREE.PointLight(CYAN, 12, 20); light.position.set(0, 3, 0); g.add(light);
    s.add(g);

    this.label3d(s, '⬡ AETHERLINE — HOME', '#7fe6ff', new THREE.Vector3(x, 5.4, z), 4.6);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z - (z > 0 ? 1.2 : -1.2)), r: 2.4 });
    // The boarding prompt sits on the plaza-facing (north) approach — the only
    // side the player can actually reach, since the pod capsule's collider walls
    // off the far side. A generous radius so it triggers anywhere on the dais.
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z - 5), radius: 4.6,
      label: 'Press <b>E</b> — board the Pod home to Haven City',
      handler: () => this.openReturnConsole(),
    });
  }

  /** Place Terra City's named souls around the plaza, all clickable for their cards. */
  private populateStreet(s: THREE.Scene): void {
    const npc = (
      opts: VoxelHumanOpts, x: number, z: number, rotY: number,
      name: string, handler: () => Promise<void>, seated = false,
    ) => {
      const grp = makeVoxelHuman(opts);
      grp.position.set(x, 0, z); grp.rotation.y = rotY;
      if (seated) setVoxelSeated(grp, true, 0.46);
      tagNpc(grp, name); s.add(grp);
      this.staticNpcs.push(grp);
      this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
      this.streetInteractables.push({ pos: new THREE.Vector3(x, 0, z), radius: 2.0, label: `Press <b>E</b> — speak with ${name}`, handler });
      this.streetMarkers.push({ x, z, label: name, color: '#bfe8ff', kind: 'npc' });
    };
    const oneOf = (name: string, lines: string[]) => async () => { sfx('blip'); await say(name, lines[Math.floor(Math.random() * lines.length)]); };

    // Stationmaster Kel — by the Pod, keeper of the restored line
    npc({ top: 0x1c5a6a, sleeves: 0x14424f, bottom: 0x1a2230, cap: 0x2a6a7a, hair: 0x2a2a3a, skin: 0xc98a5a }, 4.5, 30, -2.4,
      'Stationmaster Kel', oneOf('Stationmaster Kel', [
        'Welcome to Terra City — the Circuit-Crown of Tharkand! You came through the POD? Then the Olivar line truly is back. Fifteen years I kept this platform swept for a Pod that never came. Worth every dawn.',
        'They mourned us across the strait, you know. "Poor lost Terra." We weren\'t lost. We were busy — rebuilding, trace by trace. Take a look at what fifteen dark years can BUILD.',
        'Step to the Pod when you\'re ready and I\'ll cycle the gate for home. The line runs both ways now. That\'s the whole point of a line.',
      ]));

    // Engineer Vire — circuit-craft, the rebuilding
    npc({ top: 0x2a8aa8, sleeves: 0x1e6a82, bottom: 0x202a38, hair: 0x3a2a1a, skin: 0xe0a878, hairstyle: 'ponytail' }, -8, 4, 1.0,
      'Engineer Vire', oneOf('Engineer Vire', [
        'See the copper in the streets? Every trace is alive — power, signal, water, word, all running as light. The old empire built engines to TAKE cities. We build circuits to KEEP one.',
        'Terra was the engine-empire\'s capital, once. The Grand War left it dead iron under the dunes. We woke the iron up, gently, and asked it to be a city instead. Fifteen years of asking nicely.',
        'A healthy block hums a certain blue. When a trace goes gold-hot, something\'s wrong and I\'m already running. Tonight everything\'s blue. Good night to be a visitor.',
      ]));

    // Circuit-Marshal Tace — the World Championships + the Big Three
    npc({ top: 0xc89a2a, sleeves: 0x9a7420, bottom: 0x2a2a32, cap: 0xf2c14e, hair: 0x2a2a3a, skin: 0xb98a64 }, -2.5, -18, 0.2,
      'Circuit-Marshal Tace', oneOf('Circuit-Marshal Tace', [
        'The World Championships were BORN in that ring behind me. When the lines fell we ran the title in exile, over in Haven — "away games," fifteen years of them. Now the Pod hums and the crown comes HOME. You picked quite a year to visit.',
        'Twenty years it\'s been the Big Three. Aljay, Greggy, Onnel — twenty-two titles between them. Is it fair? It is NOT fair. They\'re not even ours — Olivar folk, across the strait! And gods help me, I\'d cross that strait on my knees to officiate one more of their finals.',
        'You want to understand Terra? On finals night, ten thousand of us pack the Worldring and scream for three foreigners we\'ll never beat. That\'s not defeat, tamer. That\'s the World Cup. That\'s the deepest love there is — the kind with a SCOREBOARD.',
      ]));

    // Big Bolt Ovan — Voltwake fan, the rivalry/hype
    npc({ top: 0x2a9a5a, sleeves: 0x1e7a44, bottom: 0x202a30, cap: 0x5aff9a, hair: 0x1a1a2e, skin: 0x8a5a36 }, 7, -8, -0.8,
      'Big Bolt Ovan', oneOf('Big Bolt Ovan', [
        'VOLTWAKE GREEN, baby! You feel that hum under your boots? That\'s the conduit-rails AND ten thousand of us warming up our throats. Finals season\'s coming home and this city is going to LOSE ITS MIND.',
        'Twenty years of Big Three winning. TWENTY. It\'s robbery! It\'s a crime against fairness! ...I\'ve also seen Aljay\'s rose-fire phoenix live four times and I would sell a kidney — A KIDNEY — for a fifth. Both things are true. That\'s being a fan.',
        'Olivar versus Tharkand. Dawnflame versus the whole Worldring screaming for him to LOSE for once. It runs deeper than the strait between us, friend. You don\'t cheer that loud for someone you don\'t love.',
      ]));

    // Elder Sema — built after the war, the old Terra
    npc({ top: 0x3a6a7a, sleeves: 0x2a4a5a, bottom: 0x222a32, hair: 0xd8d8d8, skin: 0xb08a5a, hairstyle: 'bald' }, 9, 9, Math.PI - 0.6,
      'Elder Sema', oneOf('Elder Sema', [
        'I remember the OLD Terra — glass and trade, Pods leaving six ways at dawn. Then the Sundering, fifteen years gone, and one night it all went dark: the lights, the roads, the answer to "is anyone coming." Nobody was. So we built our own light.',
        'After the Grand War they said Terra was finished. We let them say it. We were too busy laying circuit to argue. Every glowing street you see, child — that\'s fifteen years of refusing to be a ruin.',
        'The young ones never knew the dark. Good. That\'s what we built it for — so the children would think a city made of light was the most ordinary thing in the world.',
      ]));

    // Paxi — the kid, idolizes the Big Three even though foreign
    npc({ top: 0xf2c14e, sleeves: 0xd9a73a, bottom: 0x2a3a5a, hair: 0x1a1a2e, skin: 0xe8b48a }, 2.5, 6, -0.3,
      'Paxi', oneOf('Paxi', [
        'I\'m gonna win the Worldring someday! I KNOW the Big Three are from across the strait. So what? Good is good and I\'m gonna be GOODER. Watch — this is the Dawnflame\'s finishing stance. ...Mostly.',
        'My gran says nobody\'s beaten the Big Three in twenty years. Twenty years is FOREVER. But somebody has to be first, right? Why not me? Why not Terra?',
        'When the championship comes home, I\'m gonna be in the front row of the green end screaming until I can\'t. And then ONE day I\'ll be down on the sand. You\'ll see.',
      ]));

    // Pilgrim Dass — the amazed Olivar visitor
    npc({ top: 0x3a6aa8, sleeves: 0x2a4a82, bottom: 0x2a2a30, hair: 0x6a3a1a, skin: 0xc08552 }, -6, 22, 0.4,
      'Pilgrim Dass', oneOf('Pilgrim Dass', [
        'They TOLD me Terra was a ruin. I rode the first Pod east expecting rubble and ghosts. I walked out into… this. A whole city made of light. I haven\'t closed my mouth in an hour.',
        'Back in Haven, the kids aren\'t even allowed to talk about Terra. "The lost city." Lost! It\'s the brightest place I\'ve ever stood. Somebody owes this city an apology and a very long letter.',
        'A stranger just handed me a hot bowl for no reason. Second one today. Is everyone here like this? …I might not go home.',
      ]));

    // street crowd — named so their cards read true to the Circuit-Crown
    npc({ top: 0x2a7a8a, sleeves: 0x1e5a6a, bottom: 0x222a32, hair: 0x1a1a2e, skin: 0x9a6a44 }, -12, 11, 0.8,
      'Solder Jin', oneOf('Solder Jin', [
        'Mind the live traces by the core — they\'re grounded, mostly, but I say "mostly" for a reason. You can hear a healthy one sing if the street ever goes quiet. It never does.',
        'Welded copper twelve years. Every glowing line you walk on, somebody knelt in the cold and laid it by hand. Pretty, isn\'t it? Pretty\'s the whole job.',
      ]));
    npc({ top: 0xe85a9a, sleeves: 0xc24a82, bottom: 0x2a2230, hair: 0x6a3a1a, skin: 0xe0a878 }, 12, 12, Math.PI + 0.5,
      'Neon Vey', oneOf('Neon Vey', [
        'I bend cold light into hot colors for every shopfront on this strip. One rule: no sign I make is allowed to be SAD. A city of machines has to be warm or what\'s the point?',
        'You want directions? Follow the pink. I lit the whole restaurant row. The Lumen Table\'s the violet glow west; Spark & Sizzle\'s the green one, smells incredible, go.',
      ]));
    npc({ top: 0x5a8ad8, sleeves: 0x3a6ab8, bottom: 0x222a38, hair: 0x2a2a3a, skin: 0xc98a5a }, 5, 16, -1.4,
      'Pixel Tam', oneOf('Pixel Tam', [
        'Coin and I\'ll sculpt you a little light-creature, right out of the air. Are they real? I will neither confirm nor deny. Artistic principle.',
        'The kids by the spire think my holo-pets are alive. I\'ve decided not to ruin it. Some illusions are load-bearing, friend.',
      ]), true);

    // a couple of slow patrollers for life (open central ring, no buildings to clip)
    const patrol = (opts: VoxelHumanOpts, name: string, r: number, speed: number, angle: number) => {
      const grp = makeVoxelHuman(opts);
      grp.position.set(Math.cos(angle) * r, 0, -4 + Math.sin(angle) * r);
      tagNpc(grp, name); s.add(grp);
      this.patrollers.push({ grp, angle, r, cx: 0, cz: -4, speed });
    };
    patrol({ top: 0x2a9a5a, bottom: 0x202a30, hair: 0x1a1a2e, skin: 0x8a5a36, cap: 0x5aff9a }, 'Cabla Ross', 9, 0.32, 0);
    patrol({ top: 0x3a6a7a, bottom: 0x222a32, hair: 0xd8d8d8, skin: 0xb08a5a }, 'Relay Bo', 11, -0.24, 2.2);
  }

  // =================== interiors: restaurants & stores ===================
  private async enterVenue(id: VenueId): Promise<void> {
    this.busy = true;
    this.exitSpot.copy(this.tamer.position);
    this.buildVenue(id);
    this.streetScene.remove(this.tamer);
    this.interiorScene!.add(this.tamer);
    this.tamer.position.set(0, 0, this.intRoom.d / 2 - 1.4);
    this.tamer.rotation.y = Math.PI;
    this.camera.position.set(0, 6, this.intRoom.d / 2 + 4);
    this.mode = 'interior';
    toast(this.intName, 'gold');
    this.currentVenueId = id;
    this.player.savedLocation = { type: 'terra', room: id };
    this.busy = false;
  }

  private exitVenue(): void {
    this.mode = 'street';
    this.interiorScene?.remove(this.tamer);
    this.streetScene.add(this.tamer);
    this.tamer.position.copy(this.exitSpot);
    this.intRigs.forEach(disposeRig); this.intRigs = [];
    this.interiorScene = null;
    this.litScene = null;   // force the point-light budget to re-collect for the street
    this.currentVenueId = null;
    this.player.savedLocation = { type: 'terra' };
  }

  private buildVenue(id: VenueId): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];
    this.intRigs.forEach(disposeRig); this.intRigs = [];
    this.intCamH = 5.6; this.intCamD = 6.6;

    const cfg = {
      lumen:    { name: 'The Lumen Table', glow: MAGENTA, room: { w: 18, d: 14 }, sky: ['#1a0a1e', '#08040c'] as [string, string], floor: ['#2a1426', '#d99ad0'] as [string, string], warm: 0xffb8e6 },
      sizzle:   { name: 'Spark & Sizzle', glow: ACID, room: { w: 17, d: 13 }, sky: ['#0a1a12', '#040c08'] as [string, string], floor: ['#14281c', '#5aff9a'] as [string, string], warm: 0xc8ffd8 },
      voltmart: { name: 'Volt-Mart', glow: ACID, room: { w: 17, d: 13 }, sky: ['#0a1612', '#04100a'] as [string, string], floor: ['#16221c', '#9af0c8'] as [string, string], warm: 0xd8ffe8 },
      pulse:    { name: 'Pulse Pantry', glow: CYAN, room: { w: 16, d: 12 }, sky: ['#08141f', '#040a12'] as [string, string], floor: ['#142230', '#9adfff'] as [string, string], warm: 0xbfe8ff },
    }[id];
    this.intRoom = cfg.room; this.intName = cfg.name;
    const { w, d } = cfg.room; const glow = cfg.glow;

    // atmosphere + lighting
    s.background = skyGradient(cfg.sky[0], cfg.sky[1]);
    s.add(new THREE.AmbientLight(0x4a5578, 0.62));
    const main = new THREE.PointLight(cfg.warm, 22, 26); main.position.set(0, 5, 0); main.castShadow = true; s.add(main);
    const accent = new THREE.PointLight(glow, 12, 20); accent.position.set(0, 3.4, -d / 2 + 2); s.add(accent);

    // floor — checker tech-tile, faintly glowing grout
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tileTexture(cfg.floor[0], '#0a1018', 6), roughness: 0.5, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // a glowing floor border trace
    const border = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) / 2 - 1.5, 0.06, 6, 4), TerraCity.emis(glow, 0.7));
    border.rotation.x = -Math.PI / 2; border.position.y = 0.03; border.rotation.z = Math.PI / 4; border.name = 'legendpulse'; s.add(border);

    // shell: dark panel walls; the interior is roofless to the dark sky so the
    // chase-cam (which rides above the room and looks down over the low south
    // parapet) is never boxed in. Glowing light-bars hang in the rafters for warmth.
    const wallMat = new THREE.MeshStandardMaterial({ map: circuitPanelTexture('#0e1626', glow, 4), metalness: 0.5, roughness: 0.5 });
    const H = 5.5;
    // back + sides (full height), south = low parapet split by the door gap
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.4), wallMat); back.position.set(0, H / 2, -d / 2); s.add(back);
    const west = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, d), wallMat); west.position.set(-w / 2, H / 2, 0); s.add(west);
    const east = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, d), wallMat); east.position.set(w / 2, H / 2, 0); s.add(east);
    const gap = 2.4, seg = (w - gap) / 2;
    const southW = new THREE.Mesh(new THREE.BoxGeometry(seg, 1.3, 0.4), wallMat); southW.position.set(-(gap / 2 + seg / 2), 0.65, d / 2); s.add(southW);
    const southE = new THREE.Mesh(new THREE.BoxGeometry(seg, 1.3, 0.4), wallMat); southE.position.set(gap / 2 + seg / 2, 0.65, d / 2); s.add(southE);
    // hanging light-bars deep in the room (behind the player, never between cam and player)
    for (const cz of [-3, -1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 0.16, 0.3), TerraCity.emis(glow, 0.9));
      rib.position.set(0, 4.6, cz); rib.name = 'legendpulse'; s.add(rib);
    }

    // per-venue dressing
    if (id === 'lumen' || id === 'sizzle') this.dressRestaurant(s, id, glow);
    else this.dressStore(s, id, glow);

    // exit back to the street
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), TerraCity.glow(glow, 0.3));
    exitGlow.position.set(0, 1.3, d / 2 - 0.25); exitGlow.name = 'portal'; s.add(exitGlow);
    this.label3d(s, '↓ Back to Terra City', '#bfe8ff', new THREE.Vector3(0, 3.2, d / 2 - 0.3), 3.0);
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 1.0), radius: 1.8,
      label: 'Press <b>E</b> — step back out to the plaza',
      handler: async () => this.exitVenue(),
    });
    this.intMarkers.push({ x: 0, z: d / 2, label: 'Exit', color: '#bfe8ff', kind: 'door' });
  }

  /** Booths, tables, a holo-plating counter and a chef. */
  private dressRestaurant(s: THREE.Scene, id: 'lumen' | 'sizzle', glow: number): void {
    const { w, d } = this.intRoom;
    const upscale = id === 'lumen';
    const tableMat = new THREE.MeshStandardMaterial({ color: upscale ? 0x2a1a2e : 0x1e2a22, metalness: 0.6, roughness: 0.35 });
    const seatMat = new THREE.MeshStandardMaterial({ color: upscale ? 0x5a2a4a : 0x2a4a36, roughness: 0.6 });

    // the counter / pass along the back wall
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 5, 1.05, 1.0), TerraCity.darkChrome());
    counter.position.set(0, 0.52, -d / 2 + 1.2); s.add(counter);
    const counterEdge = new THREE.Mesh(new THREE.BoxGeometry(w - 5, 0.08, 1.05), TerraCity.emis(glow, 1.0));
    counterEdge.position.set(0, 1.08, -d / 2 + 1.2); counterEdge.name = 'legendpulse'; s.add(counterEdge);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, -d / 2 + 1.2), r: 1.4 });
    this.intColliders.push({ pos: new THREE.Vector3(-w / 4, 0, -d / 2 + 1.2), r: 1.4 });
    this.intColliders.push({ pos: new THREE.Vector3(w / 4, 0, -d / 2 + 1.2), r: 1.4 });

    // hovering holo-dishes above the pass (little auroras of plated light)
    for (let i = -2; i <= 2; i++) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), TerraCity.glow([glow, GOLD, CYAN][(i + 2) % 3], 0.85));
      dish.position.set(i * 1.5, 1.9, -d / 2 + 1.2); dish.name = 'aetherfloat';
      dish.userData.baseY = 1.9; dish.userData.ph = i; s.add(dish);
    }

    // dining tables with stools/booths
    const spots: [number, number][] = upscale
      ? [[-w / 2 + 2.6, 1.5], [w / 2 - 2.6, 1.5], [-w / 2 + 2.6, -2], [w / 2 - 2.6, -2], [0, 3]]
      : [[-w / 2 + 2.4, 1.8], [w / 2 - 2.4, 1.8], [0, 2.4], [-w / 2 + 2.4, -2.2], [w / 2 - 2.4, -2.2]];
    for (const [tx, tz] of spots) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16), tableMat);
      top.position.set(tx, 0.92, tz);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 8), TerraCity.chrome());
      stem.position.set(tx, 0.46, tz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 18), TerraCity.emis(glow, 0.8));
      ring.rotation.x = -Math.PI / 2; ring.position.set(tx, 0.99, tz); ring.name = 'legendpulse';
      s.add(top, stem, ring);
      this.intColliders.push({ pos: new THREE.Vector3(tx, 0, tz), r: 1.0 });
      for (const off of [[0, 1.1], [0, -1.1]] as const) {
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 12), seatMat);
        seat.position.set(tx + off[0], 0.36, tz + off[1]); s.add(seat);
      }
    }

    // a little potted light-tree for warmth
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 10), TerraCity.darkChrome());
    planter.position.set(-w / 2 + 1.2, 0.3, d / 2 - 2); s.add(planter);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), TerraCity.glow(glow, 0.6));
    bloom.position.set(-w / 2 + 1.2, 1.3, d / 2 - 2); bloom.name = 'aetherfloat'; bloom.userData.baseY = 1.3; bloom.userData.ph = 2; s.add(bloom);
    this.intColliders.push({ pos: new THREE.Vector3(-w / 2 + 1.2, 0, d / 2 - 2), r: 0.8 });

    // the chef behind the pass
    const chefName = upscale ? 'Chef Lumen Doss' : 'Noodle-Master Tok';
    const chefOpts: VoxelHumanOpts = upscale
      ? { top: 0xd84a8a, sleeves: 0xb23a72, bottom: 0x2a2230, cap: 0xf2ead0, hair: 0x2a2a3a, skin: 0xc08552 }
      : { top: 0xe85a9a, sleeves: 0xc24a82, bottom: 0x222028, cap: 0xffd8ec, hair: 0x1a1a26, skin: 0x8a5a36 };
    const chef = makeVoxelHuman(chefOpts);
    chef.position.set(0, 0, -d / 2 + 2.2); chef.rotation.y = 0;
    tagNpc(chef, chefName); s.add(chef); this.intNpcs.push(chef);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, -d / 2 + 2.2), r: 0.6 });

    const lines = upscale ? [
      'Welcome to the Lumen Table! Sit anywhere the light is warm. Every plate comes under its own little aurora — keyed to the flavor. Eat with your eyes first; that\'s the whole art.',
      'A city of machines owes its travelers the warmest table they\'ll ever sit at. I cook like I\'m apologizing for fifteen cold years. Because I am.',
      'You\'re from across the strait? Then you\'ve never tasted Tharkand light-cuisine. Sit. SIT. The first dish is on the house — it always is, for someone who looks that far from home.',
    ] : [
      'SPARK AND SIZZLE! Loudest bowl in the Circuit-Crown! Broth\'s been on since the night the lights came back — fifteen years, never once cold. Pull up a stool, mind the steam.',
      'Secret ingredient? It\'s the neon. ...It is NOT the neon. I know it is not the neon. I\'m still going to tell you it\'s the neon.',
      'Voltwake runners eat here free, mid-race, no charge — they keep the city moving, I keep them fed. On finals night this counter is a WAR. Best night of the year.',
    ];
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, -d / 2 + 3.0), radius: 1.9,
      label: `Press <b>E</b> — talk to ${chefName}`,
      handler: async () => { sfx('blip'); await say(chefName, lines[Math.floor(Math.random() * lines.length)]); },
    });

    this.intMarkers.push(
      { x: 0, z: -this.intRoom.d / 2 + 2.2, label: chefName, color: '#ff9ad2', kind: 'npc' },
      { x: 0, z: -this.intRoom.d / 2 + 1.2, label: 'The Pass', color: '#f2c14e', kind: 'poi' },
    );
  }

  /** Glowing shelves, a chiller, a counter and a clerk who actually sells a few snacks. */
  private dressStore(s: THREE.Scene, id: 'voltmart' | 'pulse', glow: number): void {
    const { w, d } = this.intRoom;
    // stocked, self-lit shelves along the back + west
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.5, roughness: 0.5 });
    const addShelf = (x: number, z: number, rotY: number) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.6), shelfMat);
      frame.position.y = 1.3; g.add(frame);
      for (let r = 0; r < 3; r++) {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.62), TerraCity.emis(glow, 0.8));
        lip.position.set(0, 0.7 + r * 0.7, 0.32); lip.name = 'legendpulse'; g.add(lip);
        for (let cI = 0; cI < 5; cI++) {
          const prod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3),
            new THREE.MeshStandardMaterial({ color: [0xff5aa8, 0x4fe0ff, 0x5aff9a, 0xf2c14e, 0xff7a4a][cI], emissive: [0xff5aa8, 0x4fe0ff, 0x5aff9a, 0xf2c14e, 0xff7a4a][cI], emissiveIntensity: 0.35, roughness: 0.5 }));
          prod.position.set(-1.3 + cI * 0.65, 0.95 + r * 0.7, 0.34); g.add(prod);
        }
      }
      s.add(g);
      this.intColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 1.5 });
    };
    addShelf(-3, -d / 2 + 0.8, 0);
    addShelf(3, -d / 2 + 0.8, 0);
    addShelf(-w / 2 + 0.8, -1, Math.PI / 2);

    // the glowing chiller / slushie machine (east wall)
    const chiller = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x123040, emissive: glow, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3, transparent: true, opacity: 0.85 }));
    chiller.position.set(w / 2 - 1.2, 1.2, -1.5); s.add(chiller);
    const slush = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12), TerraCity.glow(MAGENTA, 0.7));
    slush.position.set(w / 2 - 1.2, 1.6, -1.5); slush.name = 'aetherfloat'; slush.userData.baseY = 1.6; slush.userData.ph = 1; s.add(slush);
    this.intColliders.push({ pos: new THREE.Vector3(w / 2 - 1.2, 0, -1.5), r: 1.1 });

    // sales counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.05, 0.9), TerraCity.darkChrome());
    counter.position.set(0, 0.52, 1.6); s.add(counter);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.95), TerraCity.emis(glow, 1.0));
    edge.position.set(0, 1.08, 1.6); edge.name = 'legendpulse'; s.add(edge);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, 1.6), r: 1.3 });

    // the clerk
    const clerkName = id === 'voltmart' ? 'Clerk Bizzy' : 'Clerk Onla';
    const clerkOpts: VoxelHumanOpts = id === 'voltmart'
      ? { top: 0x3aaa6a, sleeves: 0x2a8a52, bottom: 0x222028, cap: 0x5aff9a, hair: 0x2a2a3a, skin: 0x8a5a36 }
      : { top: 0x2a8aa8, sleeves: 0x1e6a82, bottom: 0x202a30, cap: 0x4fe0ff, hair: 0x6a3a1a, skin: 0xc98a5a };
    const clerk = makeVoxelHuman(clerkOpts);
    clerk.position.set(0, 0, 0.6); clerk.rotation.y = Math.PI;
    tagNpc(clerk, clerkName); s.add(clerk); this.intNpcs.push(clerk);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, 0.6), r: 0.6 });

    const greet = id === 'voltmart'
      ? 'Volt-Mart never closes — neither do I, apparently. Slushie? Snack? Scores? I\'ve got all three and I know your order before you do. What\'ll it be?'
      : 'Welcome to the Pulse Pantry. Yes, the shelves restock themselves — no, it\'s not magic, it\'s a conduit I wired up myself, and yes I will absolutely tell you about it. Browsing or buying?';

    const stock = ['tonic', 'soda', 'berry', 'honey_roll', 'cell', 'revive_leaf'];
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, 2.4), radius: 1.9,
      label: `Press <b>E</b> — ${clerkName}'s counter`,
      handler: async () => {
        await say(clerkName, greet);
        await this.openStore(`🏪 ${this.intName}`, stock, clerkName);
      },
    });

    this.intMarkers.push(
      { x: 0, z: 0.6, label: clerkName, color: '#9af0ff', kind: 'npc' },
      { x: 0, z: 1.6, label: 'Counter', color: '#f2c14e', kind: 'poi' },
    );
  }

  /** A neon buy-menu for the convenience stores. */
  private openStore(title: string, stock: string[], clerk: string): Promise<void> {
    this.busy = true; sfx('open');
    return new Promise<void>(resolve => {
      const render = () => {
        const rows = stock.map(id => {
          const it = ITEMS[id]; if (!it) return '';
          const afford = this.player.shards >= it.price;
          return `<button class="ui-btn ${afford ? '' : ''}" data-buy="${id}" ${afford ? '' : 'disabled'}
            style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;padding:11px 14px">
            <span><b>${it.name}</b><br><span class="sub">${it.desc}</span></span>
            <span style="white-space:nowrap;color:${afford ? '#7dffb0' : '#ff7a7a'};font-weight:700">◆ ${it.price}</span>
          </button>`;
        }).join('');
        const el = openScreen(`
          <div style="text-align:center;color:#9af0ff;letter-spacing:2px;font-size:12px">⚡ CIRCUIT-CROWN PROVISIONS</div>
          <h2 style="text-align:center;margin:2px 0 2px;color:#eaf6ff">${title}</h2>
          <div class="sub" style="text-align:center;margin-bottom:12px">Your Shards: ◆ ${this.player.shards}</div>
          <div style="display:flex;flex-direction:column;gap:8px;min-width:380px;max-height:340px;overflow-y:auto">${rows}</div>
          <div style="display:flex;justify-content:center;margin-top:14px"><button class="ui-btn primary" id="store-done">Done</button></div>`);
        el.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
          const id = b.dataset.buy!; const it = ITEMS[id];
          if (this.player.shards < it.price) return;
          if (!this.player.addItem(id)) { sfx('cancel'); toast('Crawler cargo is full!', 'red'); return; }
          this.player.shards -= it.price; sfx('confirm');
          toast(`Bought ${it.name} — ◆${it.price}`, 'gold');
          this.player.save(); render();
        });
        (el.querySelector('#store-done') as HTMLElement).onclick = async () => {
          closeMenu(); sfx('cancel'); this.busy = false;
          await say(clerk, 'Lights stay on — come back any time.');
          resolve();
        };
      };
      render();
    });
  }

  /** The Pod console home to Haven City. */
  private openReturnConsole(): Promise<void> {
    this.busy = true; sfx('open');
    return new Promise<void>(resolve => {
      const el = openScreen(`
        <div style="text-align:center;margin-bottom:4px;color:#9af0ff;letter-spacing:3px;font-size:13px">⬡ AETHERLINE TRANSIT</div>
        <h2 style="text-align:center;margin:2px 0 4px;color:#eaf6ff">Depart Terra City</h2>
        <div class="sub" style="text-align:center;margin-bottom:14px">The Pod hums on its cradle. The Olivar line is open again — both ways.</div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:420px">
          <button class="ui-btn primary" id="pod-haven" style="display:flex;justify-content:space-between;align-items:center;gap:14px;text-align:left;padding:14px 16px;box-shadow:0 0 18px rgba(79,224,255,0.25)">
            <span><b style="font-size:16px;letter-spacing:0.5px">🏙️ Haven City</b><br><span class="sub">The Capital line · across the strait, home</span></span>
            <span style="font-weight:700;letter-spacing:1px;color:#7dffb0">ONLINE ▶</span>
          </button>
          <button class="ui-btn" disabled style="display:flex;justify-content:space-between;align-items:center;gap:14px;text-align:left;padding:14px 16px">
            <span><b style="font-size:16px;letter-spacing:0.5px">🏟️ The Worldring</b><br><span class="sub">Sealed until the championship returns</span></span>
            <span style="font-weight:700;letter-spacing:1px;color:#ff7a7a">SOON</span>
          </button>
        </div>
        <div style="display:flex;justify-content:center;margin-top:16px"><button class="ui-btn" id="pod-stay">Stay in Terra City</button></div>`);
      (el.querySelector('#pod-haven') as HTMLElement).onclick = async () => {
        closeMenu(); sfx('confirm');
        toast('⬡ Pod sealed — destination: Haven City', 'gold', 2600);
        await say('Stationmaster Kel', 'Gate cycling — mind the field-line. Smooth skies across the strait, tamer. The line\'s yours now, both ways. Come back and watch us win one, eh?');
        const lift = this.podHover;
        const baseY = lift ? (lift.userData.baseY as number) : 0;
        sfx('charge');
        await tween(1.2, t => { if (lift) lift.userData.baseY = baseY + t * 1.4; });
        this.busy = false;
        this.player.save();
        this.resolveExit?.();
        resolve();
      };
      (el.querySelector('#pod-stay') as HTMLElement).onclick = () => { sfx('cancel'); closeMenu(); this.busy = false; resolve(); };
    });
  }

  // =================== the Aetherline Atelier (prestige boutique) ===================

  /** The boutique storefront: a magenta-and-gold atelier with live FX mannequins out front. */
  private buildTerraBoutique(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    // Terra's chase-cam always looks NORTH (from south of the player), so the
    // storefront must face SOUTH (+z) to greet the player head-on rather than
    // showing its back. Its front + mannequins + door all sit on the +z side.
    g.rotation.y = 0;
    const W = 9.5, H = 6.4, D = 8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
      new THREE.MeshStandardMaterial({ map: circuitPanelTexture('#1a0e22', MAGENTA, (x * 5 + z) | 0), metalness: 0.55, roughness: 0.4, color: 0x3a2240 }));
    body.position.y = H / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    // gold roofline + glowing magenta cornice
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), TerraCity.darkChrome());
    roof.position.y = H + 0.15; g.add(roof);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.18, D + 0.8), TerraCity.emis(GOLD, 1.0));
    cornice.position.y = H + 0.42; cornice.name = 'legendpulse'; g.add(cornice);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.85, 0.1, D + 0.85), TerraCity.emis(MAGENTA, 0.9));
    trim.position.y = H + 0.05; trim.name = 'legendpulse'; g.add(trim);
    // a tall holographic shop window facing the plaza (+z local)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(W - 2.6, H - 2.0),
      new THREE.MeshStandardMaterial({ color: MAGENTA, emissive: MAGENTA, emissiveIntensity: 0.55, transparent: true, opacity: 0.42, roughness: 0.1 }));
    win.position.set(0, H / 2, D / 2 + 0.06); win.name = 'portal'; g.add(win);
    // gold door frame + glowing portal
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.22), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3 }));
    frame.position.set(0, 1.4, D / 2 + 0.05); g.add(frame);
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), TerraCity.glow(MAGENTA, 0.42));
    doorGlow.position.set(0, 1.3, D / 2 + 0.17); doorGlow.name = 'portal'; g.add(doorGlow);
    // jutting neon sign blade
    const blade = this.neonSign('BOUTIQUE', MAGENTA);
    blade.position.set(0, H - 0.4, D / 2 + 0.8); g.add(blade);
    // a gilded mannequin-emblem floating in the window
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), TerraCity.emis(GOLD, 1.4));
    star.position.set(0, H / 2 + 0.6, D / 2 + 0.3); star.name = 'aetherfloat'; star.userData.baseY = star.position.y; star.userData.ph = 1.2; g.add(star);
    s.add(g);
    this.wire(s, new THREE.Vector3(x, H + 1, z), new THREE.Vector3(0, 12, 0), 2.5, MAGENTA, 0.07);

    const lamp = new THREE.PointLight(MAGENTA, 11, 18); lamp.position.set(x, 3.4, z + (z > 0 ? -3 : 3)); s.add(lamp);
    const lamp2 = new THREE.PointLight(GOLD, 8, 16); lamp2.position.set(x, 2.2, z + (z > 0 ? 4 : -4)); s.add(lamp2);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 5.6 });
    this.label3d(s, '✦ Aetherline Atelier', '#ff9ad6', new THREE.Vector3(x, H + 2.3, z), 4.6);
    this.streetMarkers.push({ x, z, label: '✦ Boutique', color: '#ff9ad6', kind: 'building' });

    // ---- two display pedestals out front, modelling hero FX outfits ----
    const display = (dx: number, dz: number, rotY: number, outfit: Record<string, string>) => {
      const ped = new THREE.Group();
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.6, 20), TerraCity.darkChrome());
      dais.position.y = 0.3; ped.add(dais);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 28), TerraCity.emis(GOLD, 1.1));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.62; ring.name = 'legendpulse'; ped.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 16, 1, true), TerraCity.glow(MAGENTA, 0.07));
      beam.position.y = 2.6; ped.add(beam);
      ped.position.set(dx, 0, dz); s.add(ped);
      const rig = new THREE.Group();
      updateTamerAppearance(rig, outfit);
      rig.position.set(dx, 0.62, dz); rig.rotation.y = rotY; rig.scale.setScalar(1.05);
      s.add(rig);
      this.displayRigs.push({ rig, spin: 0.45 });
      this.streetColliders.push({ pos: new THREE.Vector3(dx, 0, dz), r: 0.9 });
    };
    // place the pedestals flanking the door, in world space in front of the facade
    const front = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    const p1 = front(-3.0, D / 2 + 1.8), p2 = front(3.0, D / 2 + 1.8);
    display(p1.x, p1.z, g.rotation.y + 0.3, { hat: 'terra_halo', shirt: 'terra_phoenix', pants: 'terra_ember_legs', gloves: 'none', backpack: 'none', shoes: 'terra_thruster_orange' });
    display(p2.x, p2.z, g.rotation.y - 0.3, { hat: 'terra_heli_cyan', shirt: 'terra_robo', pants: 'none', gloves: 'terra_plasma_gauntlet', backpack: 'terra_energy_wings', shoes: 'terra_hover_disc' });

    // the door interactable — clear of the collider, plaza-facing
    const door = front(0, D / 2 + 2.6);
    this.streetInteractables.push({
      pos: door, radius: 2.4,
      label: 'Press <b>E</b> — enter the Aetherline Atelier',
      handler: () => this.openTerraBoutique(),
    });
  }

  /** Browse + buy Terra City's animated prestige cosmetics. Mirrors Haven's atelier. */
  private async openTerraBoutique(): Promise<void> {
    sfx('open');
    await say('Couturier Sable', 'Ahh — a tamer with the shards to dress like the Circuit-Crown deserves. Everything here MOVES, darling. Light, fire, rotors, wings. Try it on. The mirror never lies.');
    this.busy = true;

    await new Promise<void>(resolve => {
      const p = this.player;
      const SLOT_ICONS: Record<string, string> = { hat: '🎩', shirt: '👕', pants: '👖', gloves: '🧤', backpack: '🎒', shoes: '👟' };
      type Slot = 'hat' | 'shirt' | 'pants' | 'gloves' | 'backpack' | 'shoes';
      const slots: Slot[] = ['hat', 'shirt', 'pants', 'gloves', 'backpack', 'shoes'];
      let activeTab: Slot = 'shirt';
      const previewState: Record<string, string> = { ...p.equippedClothes };

      const el = openScreen(`
        <div style="text-align:center;margin-bottom:2px;color:#ff9ad6;letter-spacing:3px;font-size:12px">✦ THE AETHERLINE ATELIER</div>
        <h3 style="text-align:center;margin:0 0 8px">Prestige Collection — <span id="tb-shards" class="goldcol">◆${p.shards}</span></h3>
        <div class="grid2">
          <div>
            <div id="tb-tabs" class="panel-tabs" style="margin-bottom:8px"></div>
            <div id="tb-list" style="max-height:392px;overflow-y:auto;padding-right:4px;"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(8,4,16,0.5);border:1px solid var(--ui-border);border-radius:8px;padding:12px;">
            <h4 style="margin-bottom:8px;color:var(--ui-gold);text-transform:uppercase;font-size:14px;letter-spacing:1px;">Live Mirror</h4>
            <div id="tb-mirror" style="width:260px;height:260px;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 35%, #241038, #06040f);border-radius:6px;border:1px solid #4a2a5a"></div>
            <div class="sub" style="margin-top:6px;font-size:11px;color:var(--ui-dim)">LIVE FX · DRAG TO ROTATE</div>
            <div id="tb-outfit" style="width:100%;margin-top:10px;font-size:12px"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button class="ui-btn primary" id="tb-close">Leave the Atelier</button>
        </div>`);

      const mirror = el.querySelector('#tb-mirror') as HTMLElement;
      const preview = initTerraBoutiquePreview(mirror, previewState, p.appearance);
      const refresh = () => preview.update(previewState, p.appearance);

      const render = () => {
        (el.querySelector('#tb-shards') as HTMLElement).textContent = `◆${p.shards}`;
        preview.focus(activeTab === 'hat' ? 'head' : 'full'); // zoom in on the head for hats
        const tabsEl = el.querySelector('#tb-tabs') as HTMLElement;
        tabsEl.innerHTML = slots.map(slot =>
          `<button class="ui-btn tab ${slot === activeTab ? 'primary' : ''}" data-tab="${slot}">${SLOT_ICONS[slot]} ${slot.toUpperCase()}</button>`).join('');
        tabsEl.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => { activeTab = b.dataset.tab as Slot; render(); });

        const outfitEl = el.querySelector('#tb-outfit') as HTMLElement;
        outfitEl.innerHTML = slots.map(slot => {
          const id = previewState[slot];
          const item = id && id !== 'none' ? CLOTHES_DATABASE[id] : null;
          const changed = previewState[slot] !== p.equippedClothes[slot];
          return `<div class="row" style="display:flex;justify-content:space-between">
            <span class="sub">${SLOT_ICONS[slot]} ${slot}</span>
            <b style="${changed ? 'color:var(--ui-gold)' : ''}">${item ? item.name : '—'}</b></div>`;
        }).join('');

        const list = el.querySelector('#tb-list') as HTMLElement;
        const items = Object.values(CLOTHES_DATABASE).filter(i => i.terra && i.slot === activeTab);
        list.innerHTML = items.map(item => {
          const owned = p.ownedClothes.includes(item.id);
          const equipped = p.equippedClothes[activeTab] === item.id;
          const tryingOn = previewState[activeTab] === item.id;
          let action = '';
          if (equipped) action = `<button class="ui-btn danger" data-unequip="${item.id}">Remove</button>`;
          else if (owned) action = tryingOn ? `<button class="ui-btn primary" data-equip="${item.id}">Wear</button>` : `<button class="ui-btn" data-try="${item.id}">Try On</button>`;
          else {
            const canBuy = p.shards >= item.price;
            action = tryingOn
              ? `<button class="ui-btn gold" data-buy="${item.id}" ${canBuy ? '' : 'disabled'}>Buy ◆${item.price}</button>`
              : `<div style="display:flex;gap:4px"><button class="ui-btn" data-try="${item.id}">Try</button><button class="ui-btn" data-buy="${item.id}" ${canBuy ? '' : 'disabled'}>◆${item.price}</button></div>`;
          }
          const dot = item.color !== undefined ? `#${item.color.toString(16).padStart(6, '0')}` : (item.fx?.color !== undefined ? `#${item.fx.color.toString(16).padStart(6, '0')}` : '#b18ae8');
          const fxBadge = '<span class="tag" style="background:linear-gradient(90deg,#9a3aff,#ff5aa8);color:#fff;margin-left:5px">✨ FX</span>';
          const onBadge = equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022;margin-left:5px">WORN</span>' : '';
          const tryBadge = (tryingOn && !equipped) ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022;margin-left:5px">IN MIRROR</span>' : '';
          return `<div class="list-row" style="${tryingOn ? 'border:1px solid var(--ui-gold);background:rgba(217,161,26,0.1);' : ''}">
            <span class="swatch-dot sq" style="background:${dot};flex-shrink:0"></span>
            <div style="flex:1;cursor:pointer" data-row="${item.id}"><b>${item.name}</b> ${fxBadge} ${tryBadge} ${onBadge}<div class="sub">${item.desc}</div></div>
            <div style="margin-left:10px">${action}</div></div>`;
        }).join('') || '<div class="sub" style="padding:12px">Nothing in this slot — try another tab, darling.</div>';

        const tryOn = (id: string) => { previewState[activeTab] = id; refresh(); render(); };
        list.querySelectorAll<HTMLElement>('[data-try]').forEach(b => b.onclick = e => { e.stopPropagation(); tryOn(b.dataset.try!); });
        list.querySelectorAll<HTMLElement>('[data-row]').forEach(r => r.onclick = () => tryOn(r.dataset.row!));
        list.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          const item = CLOTHES_DATABASE[b.dataset.buy!];
          if (p.shards >= item.price) {
            p.shards -= item.price; p.ownedClothes.push(item.id);
            sfx('confirm'); toast(`Bought ${item.name}!`, 'gold');
            previewState[activeTab] = item.id; p.equippedClothes[activeTab] = item.id;
            updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance);
            refresh(); render();
          } else { sfx('cancel'); }
        });
        list.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          p.equippedClothes[activeTab] = b.dataset.equip!; sfx('confirm'); toast('Equipped.');
          updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance); render();
        });
        list.querySelectorAll<HTMLElement>('[data-unequip]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          p.equippedClothes[activeTab] = 'none';
          if (previewState[activeTab] === b.dataset.unequip) previewState[activeTab] = 'none';
          sfx('cancel'); toast('Unequipped.');
          updateTamerAppearance(this.tamer, p.equippedClothes, p.appearance); refresh(); render();
        });
      };
      render();

      (el.querySelector('#tb-close') as HTMLElement).onclick = () => { preview.dispose(); sfx('cancel'); closeMenu(); resolve(); };
    });

    this.busy = false;
    updateHUD(this.player, 'Terra City');
    this.player.save();
  }

  // =================== per-frame ===================
  private update(dt: number): void {
    if (!this.resolveExit) return;

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
      const inBounds = (x: number, z: number) =>
        this.mode === 'street'
          ? Math.hypot(x, z) <= TerraCity.WALL_R - 2.5
          : Math.abs(x) <= w / 2 - 0.7 && Math.abs(z) <= d / 2 - 0.7;
      const free = (x: number, z: number) =>
        !this.colliders.some(c => Math.hypot(x - c.pos.x, z - c.pos.z) < c.r) && inBounds(x, z);
      if (free(nx, nz)) this.tamer.position.set(nx, 0, nz);
      else if (free(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (free(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz);
    }
    this.tamer.position.y = 0;
    updateVoxelHuman(this.tamer, this.walking, dt);
    this.staticNpcs.forEach(n => updateVoxelHuman(n, false, dt));
    this.intNpcs.forEach(n => updateVoxelHuman(n, false, dt));
    // storefront mannequins: slow turntable + their prestige FX
    if (this.mode === 'street') for (const d of this.displayRigs) { d.rig.rotation.y += dt * d.spin; updateTamerFX(d.rig, dt); }

    const now = performance.now();
    const tSec = now / 1000;

    // wandering patrollers (street only) — slow loops in the open ring
    if (this.mode === 'street') {
      for (const p of this.patrollers) {
        p.angle += dt * p.speed;
        const px = p.cx + Math.cos(p.angle) * p.r;
        const pz = p.cz + Math.sin(p.angle) * p.r;
        p.grp.position.set(px, 0, pz);
        p.grp.rotation.y = Math.atan2(-Math.sin(p.angle), -Math.cos(p.angle)) + Math.PI / 2;
        updateVoxelHuman(p.grp, true, dt);
      }
      for (const dr of this.drones) {
        dr.angle += dt * dr.speed;
        dr.grp.position.set(dr.cx + Math.cos(dr.angle) * dr.r, dr.y + Math.sin(tSec + dr.r) * 0.4, dr.cz + Math.sin(dr.angle) * dr.r);
        dr.grp.rotation.y = -dr.angle;
      }
    }

    // camera follow with right-drag orbit
    const t = this.tamer.position;
    let camGoal: THREE.Vector3;
    if (this.mode === 'street') camGoal = new THREE.Vector3(t.x, t.y + 7.5, t.z + 9);
    else camGoal = new THREE.Vector3(t.x * 0.5, this.intCamH + t.y * 0.9, t.z + this.intCamD);
    worldOrbit.update(dt);
    const lookT = new THREE.Vector3(t.x, t.y + 1, t.z);
    this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 4));
    this.camera.lookAt(lookT);

    // ---- point-light budget ----
    const scene = this.mode === 'interior' && this.interiorScene ? this.interiorScene : this.streetScene;
    if (scene !== this.litScene) {
      this.litScene = scene;
      this.scenePointLights = [];
      scene.traverse(o => { if ((o as THREE.PointLight).isPointLight) this.scenePointLights.push(o as THREE.PointLight); });
    }
    if (this.scenePointLights.length > TerraCity.MAX_POINT_LIGHTS) {
      const tp = this.tamer.position;
      const ranked = this.scenePointLights
        .map(l => { const e = l.matrixWorld.elements; return { l, score: Math.hypot(e[12] - tp.x, e[14] - tp.z) }; })
        .sort((a, b) => a.score - b.score);
      ranked.forEach((r, i) => { r.l.visible = i < TerraCity.MAX_POINT_LIGHTS; });
    }

    // ---- animated glow props (same name-driven dialect as Haven City) ----
    scene.traverse(o => {
      if (o.name === 'legendpulse') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) m.emissiveIntensity = 0.85 + Math.sin(now * 0.0026 + o.position.x * 1.7 + o.position.z * 1.3) * 0.45;
      } else if (o.name === 'aetherfloat') {
        o.position.y = (o.userData.baseY as number) + Math.sin(now * 0.0011 + (o.userData.ph as number)) * 0.3;
        o.rotation.y = now * 0.0009 + (o.userData.ph as number);
      } else if (o.name === 'portal') {
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(now * 0.003) * 0.16;
      } else if (o.name === 'podhover') {
        o.position.y = (o.userData.baseY as number) + Math.sin(now * 0.0013) * 0.16;
        o.rotation.x = Math.sin(now * 0.0009) * 0.012;
        o.rotation.z = Math.sin(now * 0.0011 + 1.7) * 0.01;
      }
    });

    // ---- minimap ----
    const cv = minimapCanvas();
    if (this.mode === 'street') {
      drawAreaMap(cv, {
        shape: 'circle', radius: TerraCity.WALL_R + 1,
        markers: [...this.streetMarkers, ...this.patrollers.map(p => ({ x: p.grp.position.x, z: p.grp.position.z, color: '#d8d8e8', kind: 'npc' as const }))],
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title: '⚡ Terra City — the Circuit-Crown',
        playerState: this.player,
      });
    } else {
      drawAreaMap(cv, {
        shape: 'rect', w: this.intRoom.w, d: this.intRoom.d,
        markers: this.intMarkers,
        player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
        title: this.intName,
        playerState: this.player,
      });
    }

    if (isDialogueOpen() || isMenuOpen() || this.busy) { showInteractHint(null); return; }
    const near = this.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
    showInteractHint(near ? near.label : null);
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => { updateHUD(this.player, 'Terra City'); this.busy = false; });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;
    if (k === 'e' || k === 'enter') {
      const near = this.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
      if (near) {
        const npcList = this.mode === 'street' ? this.staticNpcs : this.intNpcs;
        const npc = npcList.find(n => n.position.distanceTo(near.pos) < 2.6);
        if (npc) {
          const origRot = npc.rotation.y;
          npc.rotation.y = Math.atan2(this.tamer.position.x - npc.position.x, this.tamer.position.z - npc.position.z);
          this.tamer.rotation.y = Math.atan2(npc.position.x - this.tamer.position.x, npc.position.z - this.tamer.position.z);
          Promise.resolve(near.handler()).then(() => { npc.rotation.y = origRot; });
        } else {
          near.handler();
        }
      }
    } else if (k === 'p') this.openPanelGuarded('player');
    else if (k === 'i') this.openPanelGuarded('inventory');
    else if (k === 'g') this.openPanelGuarded('guardians');
    else if (k === 'j') this.openPanelGuarded('quests');
    else if (k === 'escape' || k === 'esc') {
      this.busy = true;
      openPauseMenu(this.player, { canSave: true }).then(() => { updateHUD(this.player, 'Terra City'); this.busy = false; });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  // =================== run ===================
  async run(): Promise<void> {
    worldOrbit.reset();
    
    const startVenue = (this as any).initialRoom as VenueId;
    if (startVenue) {
      this.buildStreet();
      updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
      this.exitSpot.set(0, 0, 29);
      this.buildVenue(startVenue);
      this.currentVenueId = startVenue;
      this.mode = 'interior';
      this.interiorScene!.add(this.tamer);
      this.tamer.position.set(0, 0, this.intRoom.d / 2 - 1.4);
      this.tamer.rotation.y = Math.PI;
      this.camera.position.set(0, 6, this.intRoom.d / 2 + 4);
      this.player.savedLocation = { type: 'terra', room: startVenue };
    } else {
      this.buildStreet();
      updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
      this.streetScene.add(this.tamer);
      this.tamer.position.set(0, 0, 29);
      this.tamer.rotation.y = Math.PI;          // face north, into the city
      this.camera.position.set(0, 7.5, 38);
      this.player.savedLocation = { type: 'terra' };
    }

    updateHUD(this.player, 'Terra City');
    showHotkeys(true);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.mode === 'street'
        ? [...this.staticNpcs, ...this.patrollers.map(p => p.grp)]
        : this.intNpcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy,
    });

    if (this.firstArrival && !this.player.flags['terra_visited']) {
      this.player.flags['terra_visited'] = true;
      this.player.save();
      this.busy = true;
      await conversation([
        ['', `The Pod settles onto Terra soil with a sound like a held breath let go. The doors fold open — and the light pours in.`],
        ['', `${TERRA_LORE.name}. ${TERRA_LORE.epithet}. A whole metropolis wired into a single bright nerve: glass towers veined in copper, plazas stitched with running light, the great dark ring of the Worldring crowning the north.`],
        ['Stationmaster Kel', `You came through the POD. After fifteen years, the Olivar line is truly back. Welcome to Terra City, tamer — the city Haven thought it lost. As you can see…`],
        ['Stationmaster Kel', `…we got better. Walk the Circuit-Crown. Eat where the light is warm. And when you stand at the Worldring gates, remember: that\'s where the World Championships come home this year. Mind the live traces — and welcome.`],
      ]);
      this.busy = false;
    }

    return new Promise<void>(res => {
      this.resolveExit = () => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        detachPicker();
        showInteractHint(null);
        showHotkeys(false);
        hideAreaMap(minimapCanvas());
        this.intRigs.forEach(disposeRig);
        this.resolveExit = null;
        res();
      };
    });
  }
}

/** Live turntable mirror for the Atelier — drives prestige FX so effects animate as you try them on. */
function initTerraBoutiquePreview(
  container: HTMLElement,
  equipped: Record<string, string>,
  appearance?: Parameters<typeof updateTamerAppearance>[2],
): { update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => void; focus: (part: 'full' | 'head') => void; dispose: () => void } {
  const width = container.clientWidth || 260, height = container.clientHeight || 260;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 12);
  camera.position.set(0, 0.95, 2.6);
  // camera framing: lerp toward a goal so 'focus' transitions are a smooth zoom.
  // full body, or a close-up on the head so animated hats can be admired.
  const VIEWS = {
    full: { pos: new THREE.Vector3(0, 0.95, 2.6), look: new THREE.Vector3(0, 0.82, 0) },
    head: { pos: new THREE.Vector3(0, 1.62, 1.6), look: new THREE.Vector3(0, 1.66, 0) },
  };
  const posGoal = VIEWS.full.pos.clone();
  const lookGoal = VIEWS.full.look.clone();
  const lookNow = lookGoal.clone();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.AmbientLight(0x9fb0ff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.PointLight(0xff5aa8, 8, 8); rim.position.set(-2, 1.5, 1); scene.add(rim);

  const rig = new THREE.Group();
  rig.position.set(0, 0.1, 0);
  updateTamerAppearance(rig, equipped, appearance);
  scene.add(rig);

  let active = true, last = performance.now(), dragging = false, prevX = 0;
  const down = (e: PointerEvent) => { if (e.button !== 0 && e.pointerType === 'mouse') return; dragging = true; prevX = e.clientX; canvas.style.cursor = 'grabbing'; canvas.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => { if (!dragging) return; rig.rotation.y += (e.clientX - prevX) * 0.015; prevX = e.clientX; };
  const up = (e: PointerEvent) => { if (dragging) { dragging = false; canvas.style.cursor = 'grab'; canvas.releasePointerCapture(e.pointerId); } };
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  const loop = () => {
    if (!active) return;
    requestAnimationFrame(loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!dragging) rig.rotation.y += dt * 0.4;
    updateTamerFX(rig, dt);
    const k = Math.min(1, dt * 6);
    camera.position.lerp(posGoal, k);
    lookNow.lerp(lookGoal, k);
    camera.lookAt(lookNow);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);

  return {
    update: (eq, app) => updateTamerAppearance(rig, eq, app ?? appearance),
    focus: (part) => { const v = VIEWS[part] ?? VIEWS.full; posGoal.copy(v.pos); lookGoal.copy(v.look); },
    dispose: () => {
      active = false;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      const prev = (rig.userData as { fxDispose?: () => void }).fxDispose; if (prev) prev();
      while (rig.children.length > 0) rig.remove(rig.children[0]);
      renderer.dispose(); canvas.remove();
    },
  };
}
