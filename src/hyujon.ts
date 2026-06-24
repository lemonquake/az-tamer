// ============================================================
// AZ Tamer — Forgotten Tech-City of Hyujon
// A dark, forgotten metropolis of old-empire circuits and rusted relays.
// It has a moody horror atmosphere, dim flickering lighting, and random
// electrical spark flashes. Doctors Clyde's Lab sits on the West side.
// ============================================================
import * as THREE from 'three';
import { Player } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, updateTamerFX, disposeRig,
  canvasTex, mulberry, skyGradient, tileTexture, techCircuitTexture, rustedMetalTexture, type VoxelHumanOpts,
} from './models';
import { HYUJON_LORE } from './lore';
import { ITEMS, DUNGEONS } from './data';
import {
  say, conversation, choose, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openScreen, closeMenu,
  openPanel, type PanelKind,
} from './ui';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance } from './clothes';
import { worldOrbit } from './camorbit';
import { tagNpc, attachNpcPicker } from './npccard';
import { sfx } from './audio';
import { questState, acceptQuest, completeQuest, syncStoryQuests } from './quests';

interface Interactable { pos: THREE.Vector3; radius: number; label: string; handler: () => Promise<void> | void; }
interface Collider { pos: THREE.Vector3; r: number; }

type Mode = 'street' | 'interior';
type VenueId = 'clyde_lab';

const ACID = 0x5aff9a;          // corrupted static green
const CYAN = 0x11ffcc;          // tech-vein cyan
const GREY = 0x3e3530;          // rusted iron/concrete
const AMBIENT_DARK = 0x181a24;  // dark background glow

export class HyujonCity {
  camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 100);
  private streetScene = new THREE.Scene();
  private interiorScene: THREE.Scene | null = null;
  private tamer = makeTamer();
  private exitSpot = new THREE.Vector3();
  private mode: Mode = 'street';
  private currentVenueId: VenueId | null = null;

  // street entities
  private streetInteractables: Interactable[] = [];
  private streetColliders: Collider[] = [];
  private staticNpcs: THREE.Group[] = [];

  // interior entities
  private intInteractables: Interactable[] = [];
  private intColliders: Collider[] = [];
  private intNpcs: THREE.Group[] = [];
  private intRoom = { w: 16, d: 12 };
  private intName = '';

  // animation/physics state
  private keys = new Set<string>();
  private busy = false;
  private t = 0;
  private resolveExit: ((res: { kind: 'exit' } | { kind: 'dungeon', def: any }) => void) | null = null;

  // light flickering and spark properties
  private sparkTimer = 1.0;
  private sparkActive = false;
  private sparkIntensity = 0;
  private flashLight!: THREE.PointLight;
  private streetGlowLines: THREE.Mesh[] = [];
  private streetLanternLights: THREE.PointLight[] = [];
  private beaconLight: THREE.PointLight | null = null;
  private beaconAngle = 0;
  private terminalFlares: THREE.PointLight[] = [];

  constructor(private player: Player, private firstArrival = false) {}

  get view() {
    const self = this;
    return {
      get scene() { return self.mode === 'interior' && self.interiorScene ? self.interiorScene : self.streetScene; },
      camera: this.camera,
      update: (dt: number) => this.update(dt),
      owner: this,
    };
  }

  private get interactables(): Interactable[] { return this.mode === 'street' ? this.streetInteractables : this.intInteractables; }
  private get colliders(): Collider[] { return this.mode === 'street' ? this.streetColliders : this.intColliders; }

  private static darkConcrete() { return new THREE.MeshStandardMaterial({ color: 0x18181f, roughness: 0.85, metalness: 0.1 }); }
  private static rustedIron() { return new THREE.MeshStandardMaterial({ color: GREY, metalness: 0.75, roughness: 0.65 }); }
  private static emissiveGreen(i = 1) { return new THREE.MeshStandardMaterial({ color: ACID, emissive: ACID, emissiveIntensity: i, roughness: 0.4 }); }
  private static emissiveCyan(i = 1) { return new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: i, roughness: 0.4 }); }
  private static glow(c: number, o: number) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }
  private static rustedMetalMat() { return new THREE.MeshStandardMaterial({ map: rustedMetalTexture('#2b2420', '#663a18', 4), metalness: 0.8, roughness: 0.7 }); }

  private label3d(scene: THREE.Scene, text: string, color: string, pos: THREE.Vector3, scale = 4.4, name?: string): void {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    c.width = 256; c.height = 64;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = color; ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(scale, scale * 0.25, 1);
    if (name) sprite.name = name;
    scene.add(sprite);
  }

  private buildStreet(): void {
    const s = this.streetScene;
    s.background = skyGradient('#040508', '#0b0c10'); // almost pitch black sky
    s.add(new THREE.AmbientLight(AMBIENT_DARK, 0.45)); // brighter ambient light

    // The single spotlight that acts as a dim skyward searchlight / relay beam
    const skyLight = new THREE.DirectionalLight(0x7788aa, 0.6); // brighter skylight
    skyLight.position.set(5, 12, -2);
    s.add(skyLight);

    // Lightning/electrical flash point light
    this.flashLight = new THREE.PointLight(CYAN, 0, 30);
    this.flashLight.position.set(-6, 6, -6);
    s.add(this.flashLight);

    // Floor — custom tech circuit panel pavement
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x12141a,
      roughness: 0.8,
      metalness: 0.5,
      map: techCircuitTexture('#0f1115', '#242a38', '#11ffcc', 12)
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // Glow light attached to the tamer for walking visibility in the dark tech-city
    const tLight = new THREE.PointLight(CYAN, 1.8, 10);
    tLight.position.set(0, 1.5, 0);
    this.tamer.add(tLight);

    // A border wall to contain the plaza
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.9 });
    const wallH = 6.0;
    const boundary = 30;
    
    // North wall
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(boundary * 2, wallH, 1.0), wallMat);
    wallN.position.set(0, wallH / 2, -boundary);
    s.add(wallN);

    // West wall
    const wallW = new THREE.Mesh(new THREE.BoxGeometry(1.0, wallH, boundary * 2), wallMat);
    wallW.position.set(-boundary, wallH / 2, 0);
    s.add(wallW);

    // East wall
    const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.0, wallH, boundary * 2), wallMat);
    wallE.position.set(boundary, wallH / 2, 0);
    s.add(wallE);

    // South wall (with Pod platform gate)
    const southSeg = (boundary * 2 - 4) / 2;
    const wallS1 = new THREE.Mesh(new THREE.BoxGeometry(southSeg, wallH, 1.0), wallMat);
    wallS1.position.set(-(2 + southSeg / 2), wallH / 2, boundary);
    const wallS2 = new THREE.Mesh(new THREE.BoxGeometry(southSeg, wallH, 1.0), wallMat);
    wallS2.position.set((2 + southSeg / 2), wallH / 2, boundary);
    s.add(wallS1, wallS2);

    // Rusted tech spires (ruined towers)
    this.buildRuinedTower(s, -14, -18, 12, 3.2);
    this.buildRuinedTower(s, 16, -12, 16, 4.0);
    this.buildRuinedTower(s, -24, 20, 8, 2.5);

    // Tech glow lines in the floor
    for (let i = 0; i < 4; i++) {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 15), HyujonCity.emissiveCyan(0.2));
      gl.position.set(-8 + i * 5, 0.03, -12 + i * 4);
      s.add(gl);
      this.streetGlowLines.push(gl);
    }

    // West Side: Abandoned Lab of Dr. Clyde
    this.buildLabExterior(s, -22, 0);

    // East Side: Gem Merchant Vahn Market Stall
    this.buildGemMerchantStall(s, 18, -4);

    // South pod exit gate
    this.buildReturnPod(s, 0, 27);

    // North-East: Marshal's Command Bunker
    this.buildCommandBunker(s, 12, -22);

    // Midtown Crater
    this.buildMidtownCrater(s, 0, -4);

    // East side: Harbor Cells
    this.buildHarborCells(s, 22, 12);

    // North-center: Drowned Terminal Gate
    this.buildTerminalGate(s, 0, -24);

    // Grieving NPCs
    this.populateStreet(s);

    // New detailed sci-fi ruins scenery & light sources
    
    // 1. Street lanterns (amber and emerald green lights)
    this.buildStreetLantern(s, -6, 22, 0xffaa44);   // Near Return Pod
    this.buildStreetLantern(s, -14, -6, 0x5aff9a);  // Center-West
    this.buildStreetLantern(s, 14, 2, 0xffaa44);    // Near Gem exchange
    this.buildStreetLantern(s, -8, -18, 0x5aff9a);  // Near Terminal Gate
    this.buildStreetLantern(s, 22, 4, 0xa0e8ff);    // Near Harbor Cells path

    // 2. Emergency Beacon on Bunker
    this.buildBunkerBeacon(s, 12, -22);

    // 3. Terminal warning flares/beacons
    this.buildWarningFlare(s, -4, -22, 0xff3300);
    this.buildWarningFlare(s, 4, -22, 0xff3300);

    // 4. Boundary pipes
    this.buildRustedPipes(s);

    // 5. Fallen spires with exposed wiring
    this.buildFallenSpire(s, -10, 8, 0.4);
    this.buildFallenSpire(s, 16, 18, -1.2);

    // 6. Scrap/debris piles
    this.buildScrapPile(s, 17, -8, 2.5); // Near gem merchant
    this.buildScrapPile(s, 10, -18, 2.0); // Near command bunker
    this.buildScrapPile(s, -18, 12, 3.0); // South-West

    // 7. Cracked terminal kiosks
    this.buildCrackedTerminal(s, -5, 12, 0.5);
    this.buildCrackedTerminal(s, 11, 10, -1.0);
  }

  private buildRuinedTower(s: THREE.Scene, x: number, z: number, h: number, r: number): void {
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 8), HyujonCity.rustedIron());
    spire.position.set(x, h / 2, z);
    spire.castShadow = true; spire.receiveShadow = true;
    s.add(spire);

    // Ruined cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), HyujonCity.darkConcrete());
    cap.position.set(x, h + 0.1, z);
    cap.scale.y = 0.4;
    s.add(cap);

    // Colliders
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: r + 1.2 });
  }

  private buildLabExterior(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2; // face East

    const W = 8, H = 5.0, D = 10;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), HyujonCity.darkConcrete());
    body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), HyujonCity.rustedIron());
    roof.position.y = H + 0.15; g.add(roof);

    // Entrance door portal
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.2), HyujonCity.rustedIron());
    frame.position.set(0, 1.3, D / 2 + 0.05); g.add(frame);
    
    // Flickering green door portal
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), HyujonCity.glow(ACID, 0.4));
    doorGlow.position.set(0, 1.2, D / 2 + 0.16); doorGlow.name = 'portal'; g.add(doorGlow);

    // Green portal light casting light onto the ground in front of the lab
    const portalLight = new THREE.PointLight(ACID, 2.5, 8);
    portalLight.position.set(0, 2.5, D / 2 + 0.5);
    g.add(portalLight);
    this.streetLanternLights.push(portalLight);

    // Flickering sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 0.2), HyujonCity.emissiveGreen(0.2));
    sign.position.set(0, H - 0.6, D / 2 + 0.3); sign.name = 'legendpulse'; g.add(sign);

    s.add(g);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 5.5 });
    this.label3d(s, '🧪 Clyde\'s Laboratory', '#5aff9a', new THREE.Vector3(x, H + 2.0, z), 4.2);

    const doorPos = new THREE.Vector3(0, 0, D / 2 + 2.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    this.streetInteractables.push({
      pos: doorPos, radius: 2.2,
      label: 'Press <b>E</b> — enter Clyde\'s Laboratory',
      handler: () => this.enterVenue('clyde_lab')
    });
  }

  private buildGemMerchantStall(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.rotation.y = -Math.PI / 2; // face West

    // Counter
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 1.0), HyujonCity.darkConcrete());
    desk.position.set(0, 0.5, 0); g.add(desk);

    // Awning structure (rusted poles + dark cloth)
    const poleMat = HyujonCity.rustedIron();
    for (const [px, pz] of [[1.3, 0.4], [1.3, -0.4], [-1.3, 0.4], [-1.3, -0.4]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), poleMat);
      pole.position.set(px, 1.3, pz); g.add(pole);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 1.2), HyujonCity.rustedIron());
    roof.position.set(0, 2.6, 0); g.add(roof);

    s.add(g);

    // Vahn NPC behind counter
    const vahn = makeVoxelHuman({ top: 0x222222, hair: 0x4a3a2a, skin: 0xd29a6a, cap: 0xd9a11a });
    vahn.position.set(x, 0, z - 1.0); vahn.rotation.y = Math.PI / 2;
    tagNpc(vahn, 'Gem Merchant Vahn'); s.add(vahn);
    this.staticNpcs.push(vahn);

    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 2.0 });
    this.label3d(s, '💎 Gem Exchange', '#ffd23a', new THREE.Vector3(x, 3.2, z), 3.8);

    this.streetInteractables.push({
      pos: new THREE.Vector3(x - 1.4, 0, z), radius: 2.0,
      label: 'Press <b>E</b> — trade with Gem Merchant Vahn',
      handler: () => this.openGemShop()
    });
  }

  private buildReturnPod(s: THREE.Scene, x: number, z: number): void {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 32), HyujonCity.darkConcrete());
    pad.position.set(x, 0.2, z); pad.receiveShadow = true; s.add(pad);
    const border = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.08, 6, 32), HyujonCity.emissiveCyan(0.3));
    border.rotation.x = Math.PI / 2; border.position.set(x, 0.44, z); border.name = 'legendpulse'; s.add(border);

    // Pod vehicle model
    const pod = new THREE.Group(); pod.position.set(x, 0.5, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.6), HyujonCity.rustedIron());
    body.position.y = 0.9; pod.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 1.0), HyujonCity.glow(CYAN, 0.4));
    win.position.set(0, 1.2, 1.4); pod.add(win);
    s.add(pod);

    this.label3d(s, '⚡ Aether-Pod Gate', '#4fe0ff', new THREE.Vector3(x, 3.2, z));
    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z), radius: 4.0,
      label: 'Press <b>E</b> — board Pod back to Overworld',
      handler: async () => {
        if (this.resolveExit) {
          sfx('confirm');
          this.resolveExit({ kind: 'exit' });
        }
      }
    });
  }

  private buildCommandBunker(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const W = 8, H = 4.5, D = 8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), HyujonCity.darkConcrete());
    body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.4, D + 0.6), HyujonCity.rustedIron());
    roof.position.y = H + 0.2; g.add(roof);

    const line = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 0.2, 0.2), HyujonCity.emissiveGreen(0.4));
    line.position.set(0, H - 1.0, D / 2 + 0.05); g.add(line);
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 5.0 });
    this.label3d(s, '🛡️ Command Bunker', '#d95050', new THREE.Vector3(x, H + 1.8, z), 4.0);
  }

  private buildMidtownCrater(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0.02, z);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.05, 16), HyujonCity.glow(ACID, 0.35));
    g.add(glow);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.3, 8, 24), HyujonCity.rustedIron());
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dist = 1.5 + Math.random() * 2.5;
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.5 + Math.random() * 0.5), HyujonCity.darkConcrete());
      rubble.position.set(Math.cos(angle) * dist, 0.1, Math.sin(angle) * dist);
      rubble.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(rubble);
    }
    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 3.5 });
    this.label3d(s, '💥 Midtown Crater', '#e85a6a', new THREE.Vector3(x, 2.0, z), 3.5);
  }

  private buildHarborCells(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.rotation.y = -Math.PI / 2;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.2, 4.0), HyujonCity.darkConcrete());
    pad.position.y = 0.1; g.add(pad);
    
    // Add an atmospheric blue cell light inside
    const cellLight = new THREE.PointLight(0xa0e8ff, 36.0, 10);
    cellLight.position.set(0, 1.8, 0); g.add(cellLight);

    const barMat = HyujonCity.rustedIron();
    for (let bx = -1.8; bx <= 1.8; bx += 0.6) {
      for (let bz of [-1.8, 1.8]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), barMat);
        bar.position.set(bx, 1.2, bz); g.add(bar);
      }
    }
    for (let bz = -1.8; bz <= 1.8; bz += 0.6) {
      for (let bx of [-1.8, 1.8]) {
        // Skip middle bars on the front wall (bx = -1.8) to create an open doorway
        if (bx === -1.8 && Math.abs(bz) < 1.5) {
          continue;
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), barMat);
        bar.position.set(bx, 1.2, bz); g.add(bar);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 4.2), HyujonCity.rustedIron());
    roof.position.y = 2.4; g.add(roof);
    const frost = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 0.1), HyujonCity.glow(0xa0e8ff, 0.2));
    frost.position.set(0, 1.2, 1.7); g.add(frost);
    s.add(g);
    
    // Split wall colliders for Left, Right, and Back walls of cells (x=22, z=12)
    // This allows walking through the open front doorway (z=10.2)
    this.streetColliders.push({ pos: new THREE.Vector3(20, 0, 10.5), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(20, 0, 12.0), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(20, 0, 13.5), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(24, 0, 10.5), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(24, 0, 12.0), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(24, 0, 13.5), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(20.5, 0, 14.0), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(22.0, 0, 14.0), r: 0.6 });
    this.streetColliders.push({ pos: new THREE.Vector3(23.5, 0, 14.0), r: 0.6 });

    this.label3d(s, '❄️ Harbor Cells', '#a0e8ff', new THREE.Vector3(x, 3.2, z), 3.5);
  }

  private buildTerminalGate(s: THREE.Scene, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const W = 8, H = 6.0, D = 4.0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), HyujonCity.darkConcrete());
    body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), HyujonCity.rustedIron());
    roof.position.y = H + 0.15; g.add(roof);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.8, 0.2), HyujonCity.rustedIron());
    frame.position.set(0, 1.9, D / 2 + 0.05); g.add(frame);

    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.05, 16), HyujonCity.glow(0x11ffcc, 0.2));
    water.position.set(0, 0.03, D / 2 + 2.0); g.add(water);

    const unlocked = !!this.player.flags['drowned_terminal_unlocked'];
    const doorColor = unlocked ? CYAN : 0xff3333;
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.4), HyujonCity.glow(doorColor, 0.4));
    doorGlow.position.set(0, 1.8, D / 2 + 0.16); doorGlow.name = 'terminal_door'; g.add(doorGlow);

    s.add(g);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 4.5 });

    const labelText = unlocked ? '↓ Enter Drowned Terminal' : '🔒 Drowned Terminal (Sealed)';
    const labelColor = unlocked ? '#11ffcc' : '#ff5555';
    this.label3d(s, labelText, labelColor, new THREE.Vector3(x, H + 2.0, z), 4.2, 'terminal_gate_label');

    this.streetInteractables.push({
      pos: new THREE.Vector3(x, 0, z + D / 2 + 2.0), radius: 2.8,
      label: unlocked ? 'Press <b>E</b> — enter Drowned Terminal' : 'Press <b>E</b> — examine sealed Terminal gate',
      handler: () => this.handleTerminalGate()
    });
  }

  private handleTerminalGate(): void {
    if (this.player.flags['drowned_terminal_unlocked']) {
      sfx('confirm');
      const def = DUNGEONS.find((d: any) => d.id === 'drowned_terminal')!;
      if (this.resolveExit) {
        this.resolveExit({ kind: 'dungeon', def });
      }
    } else {
      sfx('cancel');
      toast("The gate is locked. Marshal Kovar holds the security override.", 'red');
    }
  }

  private buildStreetLantern(s: THREE.Scene, x: number, z: number, color = 0xffaa44): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const postMat = HyujonCity.rustedMetalMat();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.0, 8), postMat);
    post.position.y = 2.0;
    post.castShadow = true;
    group.add(post);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), postMat);
    bracket.position.set(0.5, 3.8, 0);
    group.add(bracket);

    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.15, 0.6, 6), postMat);
    cage.position.set(0.9, 3.4, 0);
    group.add(cage);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), HyujonCity.glow(color, 0.9));
    bulb.position.set(0.9, 3.2, 0);
    group.add(bulb);

    const light = new THREE.PointLight(color, 1.8, 12);
    light.position.set(0.9, 3.1, 0);
    group.add(light);
    this.streetLanternLights.push(light);

    s.add(group);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.6 });
  }

  private buildBunkerBeacon(s: THREE.Scene, x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 4.7, z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8), HyujonCity.rustedMetalMat());
    group.add(base);

    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8), HyujonCity.glow(0xff3300, 0.5));
    dome.position.y = 0.35;
    group.add(dome);

    const light = new THREE.PointLight(0xff3300, 4.0, 15);
    light.position.set(0, 0.35, 0);
    group.add(light);
    this.beaconLight = light;

    s.add(group);
  }

  private buildWarningFlare(s: THREE.Scene, x: number, z: number, color = 0xff5533): void {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8), HyujonCity.rustedMetalMat());
    group.add(base);

    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), HyujonCity.emissiveGreen(0.8));
    tip.position.y = 0.25;
    group.add(tip);

    const light = new THREE.PointLight(color, 2.5, 6);
    light.position.set(0, 0.3, 0);
    group.add(light);
    this.terminalFlares.push(light);

    s.add(group);
  }

  private buildRustedPipes(s: THREE.Scene): void {
    const pipeMat = HyujonCity.rustedMetalMat();
    
    const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 56, 8), pipeMat);
    pipe1.rotation.z = Math.PI / 2;
    pipe1.position.set(0, 0.6, -29.3);
    s.add(pipe1);

    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 56, 8), pipeMat);
    pipe2.rotation.z = Math.PI / 2;
    pipe2.position.set(0, 1.4, -29.4);
    s.add(pipe2);

    for (let x = -24; x <= 24; x += 12) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.0, 0.4), pipeMat);
      support.position.set(x, 1.0, -29.6);
      s.add(support);
    }
  }

  private buildFallenSpire(s: THREE.Scene, x: number, z: number, ry: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.4, z);
    group.rotation.y = ry;
    group.rotation.z = 1.35;

    const h = 5.0, r = 1.6;
    const spireMat = HyujonCity.rustedMetalMat();
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 8), spireMat);
    spire.castShadow = true; spire.receiveShadow = true;
    group.add(spire);

    const wiresGroup = new THREE.Group();
    wiresGroup.position.y = h / 2;
    const rnd = mulberry(x + z);
    for (let i = 0; i < 6; i++) {
      const wx = (rnd() - 0.5) * r * 0.8;
      const wz = (rnd() - 0.5) * r * 0.8;
      const wh = 0.8 + rnd() * 0.8;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, wh, 4), HyujonCity.emissiveCyan(0.8));
      wire.position.set(wx, wh / 2, wz);
      wire.rotation.x = (rnd() - 0.5) * 0.5;
      wire.rotation.z = (rnd() - 0.5) * 0.5;
      wiresGroup.add(wire);
    }
    group.add(wiresGroup);

    const light = new THREE.PointLight(CYAN, 2.0, 6);
    light.position.set(0, h / 2 + 0.3, 0);
    group.add(light);
    this.streetLanternLights.push(light);

    s.add(group);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: r + 1.2 });
  }

  private buildScrapPile(s: THREE.Scene, x: number, z: number, r: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const pipeMat = HyujonCity.rustedMetalMat();
    const concreteMat = HyujonCity.darkConcrete();
    const rnd = mulberry(x + z);
    
    const numObjects = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < numObjects; i++) {
      const rx = (rnd() - 0.5) * r;
      const rz = (rnd() - 0.5) * r;
      const type = rnd() < 0.5 ? 'box' : 'cylinder';
      let mesh: THREE.Mesh;
      if (type === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4 + rnd() * 0.8, 0.4 + rnd() * 0.8, 0.4 + rnd() * 0.8), rnd() < 0.4 ? concreteMat : pipeMat);
      } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15 + rnd() * 0.2, 0.15 + rnd() * 0.2, 0.6 + rnd() * 1.0, 8), pipeMat);
        mesh.rotation.x = Math.PI / 2 * (rnd() < 0.5 ? 0 : 1);
        mesh.rotation.z = rnd() * Math.PI;
      }
      mesh.position.set(rx, 0.2 + rnd() * 0.4, rz);
      mesh.rotation.set(rnd() * Math.PI, rnd() * Math.PI, 0);
      mesh.castShadow = true;
      group.add(mesh);
    }

    s.add(group);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: r * 0.8 + 0.3 });
  }

  private buildCrackedTerminal(s: THREE.Scene, x: number, z: number, ry: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = ry;

    const baseMat = HyujonCity.rustedMetalMat();
    
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), baseMat);
    stand.position.y = 0.7;
    group.add(stand);

    const consoleTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.8), baseMat);
    consoleTop.position.set(0, 1.4, 0);
    consoleTop.rotation.x = 0.4;
    group.add(consoleTop);

    const screenGeo = new THREE.PlaneGeometry(0.8, 0.5);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x051a15,
      emissive: 0x0a3f35,
      emissiveIntensity: 0.5,
      roughness: 0.1
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.52, 0.1);
    screen.rotation.x = 0.4 - Math.PI / 2;
    group.add(screen);

    const crackGeo = new THREE.PlaneGeometry(0.81, 0.51);
    const crackMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const crackTex = canvasTex(64, (ctx, s) => {
      ctx.clearRect(0,0,s,s);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 10); ctx.lineTo(32, 28); ctx.lineTo(54, 15);
      ctx.moveTo(32, 28); ctx.lineTo(35, 50);
      ctx.moveTo(32, 28); ctx.lineTo(12, 45);
      ctx.stroke();
    });
    crackMat.map = crackTex;
    const cracks = new THREE.Mesh(crackGeo, crackMat);
    cracks.position.set(0, 1.53, 0.11);
    cracks.rotation.x = 0.4 - Math.PI / 2;
    group.add(cracks);

    const warnLight = new THREE.PointLight(0xff3333, 1.0, 4);
    warnLight.position.set(0.3, 1.6, 0.2);
    group.add(warnLight);
    this.terminalFlares.push(warnLight);

    s.add(group);
    this.streetColliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.8 });
  }


  private populateStreet(s: THREE.Scene): void {
    // 1. Grieving Tamer
    const gTamer = makeVoxelHuman({ top: 0x3a3a4a, hair: 0x1a1a2e, skin: 0xe0a878 });
    gTamer.position.set(-6, 0, 10); gTamer.rotation.y = 0.8;
    tagNpc(gTamer, 'Grieving Tamer'); s.add(gTamer);
    this.staticNpcs.push(gTamer);
    this.label3d(s, 'Grieving Tamer', '#e8d9a8', new THREE.Vector3(-6, 2.5, 10), 2.4);
    this.streetInteractables.push({
      pos: new THREE.Vector3(-6, 0, 10), radius: 1.8,
      label: 'Press <b>E</b> — talk to Grieving Tamer',
      handler: async () => {
        gTamer.rotation.y = Math.atan2(this.tamer.position.x - gTamer.position.x, this.tamer.position.z - gTamer.position.z);
        await conversation([
          ['Grieving Tamer', "Look at the spires, tamer. Just... static. Rusted conduits. I remember when the filaments pulsed with clean energy. The capital forgot us the second Ghandra went dark."],
          ['Grieving Tamer', "They say Aljay tried to save the grid, but he was only one man. When the spires fell silent, the city died with them."],
        ]);
      }
    });

    // 2. Old Machinist
    const oldMech = makeVoxelHuman({ top: 0x5a3c22, hair: 0xdadada, skin: 0xc89868 });
    oldMech.position.set(8, 0, 14); oldMech.rotation.y = -1.2;
    tagNpc(oldMech, 'Old Machinist'); s.add(oldMech);
    this.staticNpcs.push(oldMech);
    this.label3d(s, 'Old Machinist', '#e8d9a8', new THREE.Vector3(8, 2.5, 14), 2.4);
    this.streetInteractables.push({
      pos: new THREE.Vector3(8, 0, 14), radius: 1.8,
      label: 'Press <b>E</b> — talk to Old Machinist',
      handler: async () => {
        oldMech.rotation.y = Math.atan2(this.tamer.position.x - oldMech.position.x, this.tamer.position.z - oldMech.position.z);
        await conversation([
          ['Old Machinist', "The Crawlers we built here... absolute masterpieces. Brass plating, copper cores. Aljay's Vulfenix used to warm the welding bench just by sleeping under it."],
          ['Old Machinist', "Now? Dax welds with scraps and the university uses standard-issue plastic boxes. A disgrace, I say."],
        ]);
      }
    });

    // 3. Marshal Ines Kovar
    const kovar = makeVoxelHuman({ top: 0xd95050, hair: 0x4a4a4a, skin: 0xd29a6a, hairstyle: 'classic' });
    kovar.position.set(8, 0, -18); kovar.rotation.y = 0.5;
    tagNpc(kovar, 'Marshal Kovar'); s.add(kovar);
    this.staticNpcs.push(kovar);
    this.label3d(s, 'Marshal Kovar', '#e8d9a8', new THREE.Vector3(8, 2.5, -18), 2.4);
    this.streetInteractables.push({
      pos: new THREE.Vector3(8, 0, -18), radius: 2.0,
      label: 'Press <b>E</b> — talk to Marshal Kovar',
      handler: async () => {
        kovar.rotation.y = Math.atan2(this.tamer.position.x - kovar.position.x, this.tamer.position.z - kovar.position.z);
        const p = this.player;
        const st = questState(p, 'story_drowned_terminal');
        if (st === 'active') {
          if (p.flags['interrogated_defector'] && p.flags['tem_scanned_crater']) {
            await conversation([
              ['Marshal Kovar', `So the defector gave you the override code? "AETHER-99"? And Tem confirmed the Ghandra signature match?`],
              ['Marshal Kovar', `Hmph. Good work, kid. I've input the override and started the pump grid. The Drowned Terminal's main gate is now unsealed.`],
              ['Marshal Kovar', `But be careful. Vormaela's Echo is a primordial resonance — it's flooded those tracks for weeks, and it doesn't want to leave.`],
              ['Marshal Kovar', `Go down there, drain the Tideling-Mother, and find Clyde's logs. Don't die. Hyujon has enough ghosts.`],
            ]);
            p.flags['drowned_terminal_unlocked'] = true;
            p.save();
            toast("Drowned Terminal unlocked!", 'gold');
            const door = this.streetScene.getObjectByName('terminal_door') as THREE.Mesh;
            if (door) {
              (door.material as any).color.setHex(CYAN);
            }
            const gateInteractable = this.streetInteractables.find(i => i.label && i.label.includes('Terminal'));
            if (gateInteractable) {
              gateInteractable.label = 'Press <b>E</b> — enter Drowned Terminal';
            }
            const oldLabel = this.streetScene.getObjectByName('terminal_gate_label');
            if (oldLabel) {
              this.streetScene.remove(oldLabel);
            }
            this.label3d(this.streetScene, '↓ Enter Drowned Terminal', '#11ffcc', new THREE.Vector3(0, 8.0, -24), 4.2, 'terminal_gate_label');
          } else {
            await conversation([
              ['Marshal Kovar', `Clyde sent you? A rookie from the capital during a Stillwater siege. Typical.`],
              ['Marshal Kovar', `The Drowned Terminal is sealed tight. Vormaela's Echo has flooded the whole rail line, and I won't open that gate just to let the water drown the plaza.`],
              ['Marshal Kovar', `If you want to help, go find Archivist Tem — he's analyzing the midtown crater. And we captured a Stillwater defector in the harbor cells. Interrogate him and get the pump override code!`],
            ]);
          }
        } else if (st === 'ready') {
          await conversation([
            ['Marshal Kovar', `You survived the deep waters. And you found Clyde's Harmonik notes and Tem's backup. Excellent. Tem is already starting the database restoration.`],
            ['Marshal Kovar', `Take this Prism Gem. And get back to Clyde — he was muttering about the Sanctum in the capital. Go on, kid.`],
          ]);
          const summary = completeQuest(p, 'story_drowned_terminal');
          toast("Quest complete: The Lantern of the North!", 'gold');
          if (summary) toast(`Received ${summary}`, 'gold');
          syncStoryQuests(p).forEach(n => toast(n, 'gold'));
          updateHUD(p, 'Hyujon');
        } else if (p.flags['drowned_terminal_unlocked']) {
          await say('Marshal Kovar', "The gate is open. Go down the Terminal, defeat Vormaela's Echo, and retrieve the 3rd Harmonik logs.");
        } else {
          await say('Marshal Kovar', "Hyujon stands, but barely. Keep your wits about you, tamer.");
        }
      }
    });

    // 4. Archivist Tem
    const tem = makeVoxelHuman({ top: 0x4e8ae8, hair: 0xdadada, skin: 0xc89868, hairstyle: 'bald' });
    tem.position.set(-6, 0, -8); tem.rotation.y = 1.5;
    tagNpc(tem, 'Archivist Tem'); s.add(tem);
    this.staticNpcs.push(tem);
    this.label3d(s, 'Archivist Tem', '#e8d9a8', new THREE.Vector3(-6, 2.5, -8), 2.4);
    this.streetInteractables.push({
      pos: new THREE.Vector3(-6, 0, -8), radius: 2.0,
      label: 'Press <b>E</b> — talk to Archivist Tem',
      handler: async () => {
        tem.rotation.y = Math.atan2(this.tamer.position.x - tem.position.x, this.tamer.position.z - tem.position.z);
        const p = this.player;
        const st = questState(p, 'story_drowned_terminal');
        if (st === 'active') {
          if (!p.flags['tem_scanned_crater']) {
            await conversation([
              ['Archivist Tem', `Look at this crater... the energy residue is singing in a frequency I've never recorded before. It's... beautiful, but terrifying.`],
              ['Archivist Tem', `The gate-records hall was burned specifically to hide who passed through. I hid a backup ledger in the ventilation ducts before they hit us.`],
              ['Archivist Tem', `But I need the decryption cipher to align the data tracks. Marshal Kovar has a defector in the cells who might know the Stillwater signature. Please, ask him!`],
            ]);
            p.flags['tem_scanned_crater'] = true;
            p.save();
            toast("Scanned midtown crater data.", 'gold');
          } else {
            if (p.flags['interrogated_defector']) {
              await say('Archivist Tem', "We have the signature code and I've scanned the crater. Go speak to Marshal Kovar to input the security override!");
            } else {
              await say('Archivist Tem', "I've scanned the energy lines. Once we get the defector's code, we can decrypt my gate-records backup.");
            }
          }
        } else {
          await say('Archivist Tem', "The old-empire engine-craft here is magnificent... if only we could get the power grid online again.");
        }
      }
    });

    // 5. Stillwater Defector
    const defector = makeVoxelHuman({ top: 0x226688, hair: 0x4466aa, skin: 0xb0c4de, hairstyle: 'spiky' });
    defector.position.set(22, 0.2, 11); defector.rotation.y = -Math.PI / 2;
    tagNpc(defector, 'Stillwater Defector'); s.add(defector);
    this.staticNpcs.push(defector);
    this.label3d(s, 'Stillwater Defector', '#e8d9a8', new THREE.Vector3(22, 3.2, 11), 2.4);
    this.streetInteractables.push({
      pos: new THREE.Vector3(22, 0.2, 11), radius: 3.0,
      label: 'Press <b>E</b> — talk to Stillwater Defector',
      handler: async () => {
        defector.rotation.y = Math.atan2(this.tamer.position.x - defector.position.x, this.tamer.position.z - defector.position.z);
        const p = this.player;
        const st = questState(p, 'story_drowned_terminal');
        if (st === 'active') {
          if (!p.flags['interrogated_defector']) {
            await conversation([
              ['Stillwater Defector', `The water... it's so cold... and the song... Vormaela's voice, it never stops echoing in the pipes...`],
              ['Stillwater Defector', `I didn't want to drown. I wanted to stay 'kept', but not like this. Not frozen in the dark.`],
            ]);
            const choiceIdx = await choose('Defector Response', 'Choose your response:', [
              'Stillness is peace. (Align with Stillwater)',
              'We will burn that song out of the terminal. (Align with Dawnflame)',
              'Why do you worship Ghandra\'s generals? (Align with Crownless)'
            ]);
            
            if (choiceIdx === 0) {
              p.stillwaterAlignment++;
              await say('Stillwater Defector', `Yes... stillness. You understand the quiet. The override is 'AETHER-99'. Make it quiet...`);
            } else if (choiceIdx === 1) {
              p.dawnAlignment++;
              await say('Stillwater Defector', `Fire... so bright, it hurts. The override is 'AETHER-99'. Burn the Tideling-Mother, please...`);
            } else {
              p.crownlessAlignment++;
              await say('Stillwater Defector', `They are not just generals. They are the hollow crown. The override is 'AETHER-99'. Tell Kovar...`);
            }
            p.flags['interrogated_defector'] = true;
            p.save();
            toast("Obtained override code: AETHER-99", 'gold');
          } else {
            await say('Stillwater Defector', "AETHER-99. That's the code. Tell Kovar and stop the song... it's too loud...");
          }
        } else {
          await say('Stillwater Defector', "The Drowned Choir... they call from the deep...");
        }
      }
    });
  }

  // =================== clyde's lab interior ===================
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
    this.player.savedLocation = { type: 'hyujon', room: id };
    this.busy = false;
  }

  private exitVenue(): void {
    this.mode = 'street';
    this.interiorScene?.remove(this.tamer);
    this.streetScene.add(this.tamer);
    this.tamer.position.copy(this.exitSpot);
    this.intRigs.forEach(disposeRig); this.intRigs = [];
    this.interiorScene = null;
    this.player.savedLocation = { type: 'hyujon' };
    updateHUD(this.player, 'Hyujon');
  }

  private buildVenue(id: VenueId): void {
    const s = new THREE.Scene();
    this.interiorScene = s;
    this.intInteractables = [];
    this.intColliders = [];
    this.intNpcs = [];

    const { w, d } = this.intRoom;
    this.intName = "Doctor Clyde's Laboratory";

    s.background = skyGradient('#06070a', '#020305');
    s.add(new THREE.AmbientLight(0x223344, 0.4));
    const mainLight = new THREE.PointLight(ACID, 12, 22); mainLight.position.set(0, 4, 0); s.add(mainLight);

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 0.9 });
    const H = 5.0;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.4), wallMat); back.position.set(0, H / 2, -d / 2); s.add(back);
    const west = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, d), wallMat); west.position.set(-w / 2, H / 2, 0); s.add(west);
    const east = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, d), wallMat); east.position.set(w / 2, H / 2, 0); s.add(east);

    // Entrance/Exit portal (south)
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), HyujonCity.glow(ACID, 0.3));
    exitGlow.position.set(0, 1.3, d / 2 - 0.25); s.add(exitGlow);
    this.label3d(s, '↓ Back to Hyujon', '#5aff9a', new THREE.Vector3(0, 3.0, d / 2 - 0.3), 3.0);
    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, d / 2 - 1.0), radius: 1.8,
      label: 'Press <b>E</b> — exit laboratory',
      handler: () => this.exitVenue()
    });

    this.dressClydeLab(s);
  }

  private dressClydeLab(s: THREE.Scene): void {
    const p = this.player;

    // Messy research desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.0, 1.8), HyujonCity.rustedIron());
    desk.position.set(0, 0.5, -3); s.add(desk);
    this.intColliders.push({ pos: new THREE.Vector3(0, 0, -3), r: 2.2 });

    // Messy blueprints / cables on desk
    const blueprints = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.05, 1.6), HyujonCity.emissiveGreen(0.4));
    blueprints.position.set(0, 1.03, -3); blueprints.name = 'legendpulse'; s.add(blueprints);

    // Dr. Clyde NPC
    const clyde = makeVoxelHuman({ top: 0x4e5ae8, hair: 0xc8c8c8, skin: 0xd29a6a, hairstyle: 'spiky' });
    clyde.position.set(0, 0, -4.2); clyde.rotation.y = 0;
    tagNpc(clyde, 'Doctor Clyde'); s.add(clyde);
    this.intNpcs.push(clyde);
    this.label3d(s, 'Doctor Clyde', '#e8d9a8', new THREE.Vector3(0, 2.5, -4.2), 2.4);

    this.intInteractables.push({
      pos: new THREE.Vector3(0, 0, -1.8), radius: 2.2,
      label: 'Press <b>E</b> — speak with Doctor Clyde',
      handler: async () => {
        clyde.rotation.y = Math.atan2(this.tamer.position.x - clyde.position.x, this.tamer.position.z - clyde.position.z);
        const st = questState(p, 'story_hyujon');

        if (st === 'active' || st === 'ready') {
          await conversation([
            ['Doctor Clyde', `Wait... that warmth. That spark. Aljay's Dawnflame? No... you're the new graduate. Airah's chosen one.`],
            ['Doctor Clyde', `But you have Aljay's exact fire in your eyes. And you carry yourself just like Azrin when she's about to fight a hurricane. I'm Doctor Clyde, Aljay's old gear-master.`],
            ['Doctor Clyde', `Christine sent you? You're here for the Dragon's Tear to upgrade your Crawler's board. I understand, but you need to see the bigger picture.`],
            ['Doctor Clyde', `The Ghandra seal isn't just weakening—the Aether Line, the celestial road of Aether that runs between worlds, is sundering. That's what the Anomalies are really after.`],
            ['Doctor Clyde', `They are sacrificing wild Guardians in dark rituals to summon primordial deities. Cosmic beings from before the stars. The primordials want something... something hidden deep within the Earth's core.`],
            ['Doctor Clyde', `I compiled the mapping of Ghandra's frequency inversions into the "3rd Harmonik" notes, but they're locked in the Drowned Terminal under the plaza.`],
            ['Doctor Clyde', `The Stillwater Communion flooded the terminal and locked it. Go meet Marshal Ines Kovar and Archivist Tem out in the street. Help them unlock the gate, defeat Vormaela's Echo, and retrieve the logs!`],
          ]);

          p.flags['met_clyde'] = true;

          const summary = completeQuest(p, 'story_hyujon');
          toast("Quest complete: The Forgotten Tech-City!", 'gold');
          if (summary) toast(`Received ${summary}`, 'gold');

          acceptQuest(p, 'story_drowned_terminal');
          toast("Main quest started: The Lantern of the North", 'gold');
          p.save();
          updateHUD(p, 'Doctor Clyde\'s Lab');
        } else if (questState(p, 'story_drowned_terminal') === 'active') {
          if (p.stillwaterAlignment > p.dawnAlignment) {
            await conversation([
              ['Doctor Clyde', "Marshal Kovar has the override. Work with her and Tem to unseal the terminal."],
              ['Doctor Clyde', "By the way, tamer... you carry a very quiet, cold aura... almost like the Stillwater Communion. Don't let their quiet freeze your fire."],
            ]);
          } else if (p.dawnAlignment > p.stillwaterAlignment) {
            await conversation([
              ['Doctor Clyde', "Marshal Kovar has the override. Work with her and Tem to unseal the terminal."],
              ['Doctor Clyde', "By the way, tamer... I can feel Aljay's spark burning hot in you. Don't let that fire burn you out; remember, even the sun needs to set."],
            ]);
          } else {
            await say('Doctor Clyde', "Marshal Kovar has the security override. Work with her and Tem to unlock the Drowned Terminal and reclaim the 3rd Harmonik!");
          }
        } else if (questState(p, 'story_aether_evo') === 'active') {
          await say('Doctor Clyde', "Deliver the 3rd Harmonik notes to the Haven City Sanctum reactor, kid! Aether-Evo is crucial.");
        } else {
          await say('Doctor Clyde', "Keep studying Aether-Evo. We need to be ready when Ghandra's primordial deities answer the cult's summonings.");
        }
      }
    });


  }

  private async openGemShop(): Promise<void> {
    this.busy = true;
    await new Promise<void>(resolve => {
      const render = () => {
        const p = this.player;
        const stock = ['prism_gem', 'hp_gem', 'sp_gem', 'atk_gem', 'def_gem', 'wis_gem', 'spd_gem'];
        const rows = stock.map(id => {
          const it = ITEMS[id];
          const price = id === 'prism_gem' ? 4000 : 1500; // very expensive
          return `<div class="list-row"><div style="flex:1"><b>${it.name}</b> <span class="goldcol">◆${price}</span>
            <div class="sub">${it.desc} (owned: ${p.itemCount(id)})</div></div>
            <button class="ui-btn" data-buy="${id}" ${p.shards < price ? 'disabled' : ''}>Buy</button></div>`;
        }).join('');
        const el = openScreen(`
          <h3>💎 Vahn's Rare Gem Exchange — <span class="goldcol">◆${p.shards} Shards</span></h3>
          <div class="sub" style="margin-bottom:12px">Vahn eyes you coldly. "Quality isn't cheap, tamer. Take it or leave it."</div>
          <div style="max-height:360px;overflow-y:auto;margin-bottom:12px">${rows}</div>
          <div style="display:flex;justify-content:flex-end"><button class="ui-btn primary" id="shop-close">Leave Shop</button></div>`);
        el.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
          const id = b.dataset.buy!;
          const price = id === 'prism_gem' ? 4000 : 1500;
          if (p.shards >= price && p.addItem(id)) { p.shards -= price; toast(`Bought ${ITEMS[id].name}.`); }
          else if (p.shards >= price) toast('Cargo hold is full!', 'red');
          render();
        });
        (el.querySelector('#shop-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
      };
      render();
    });
    this.busy = false;
    updateHUD(this.player, 'Hyujon');
    this.player.save();
  }

  async run(): Promise<{ kind: 'exit' } | { kind: 'dungeon', def: any }> {
    worldOrbit.reset();

    const startVenue = (this as any).initialRoom as VenueId;
    if (startVenue) {
      this.buildStreet();
      updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
      this.exitSpot.set(-22, 0, 2);
      this.buildVenue(startVenue);
      this.currentVenueId = startVenue;
      this.mode = 'interior';
      this.interiorScene!.add(this.tamer);
      this.tamer.position.set(0, 0, this.intRoom.d / 2 - 1.4);
      this.tamer.rotation.y = Math.PI;
      this.camera.position.set(0, 6, this.intRoom.d / 2 + 4);
      this.player.savedLocation = { type: 'hyujon', room: startVenue };
    } else {
      this.buildStreet();
      updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
      this.streetScene.add(this.tamer);
      this.tamer.position.set(0, 0, 23);
      this.tamer.rotation.y = Math.PI; // face north, into Hyujon
      this.camera.position.set(0, 7.5, 32);
      this.player.savedLocation = { type: 'hyujon' };
    }

    updateHUD(this.player, 'Hyujon');
    showHotkeys(true);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.mode === 'street' ? [...this.staticNpcs] : this.intNpcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy,
    });

    if (this.firstArrival && !this.player.flags['hyujon_visited']) {
      this.player.flags['hyujon_visited'] = true;
      this.player.save();
      this.busy = true;
      await conversation([
        ['', `The Pod halts in the cold dark. Rusted rails, dead grids, and concrete columns looming in the gloom.`],
        ['', `Welcome to the Forgotten Tech-City of Hyujon. Once the proud northern node of Olivar's circuit mesh, now a silent, shadowed ghost town.`],
      ]);
      this.busy = false;
    }

    return new Promise<{ kind: 'exit' } | { kind: 'dungeon', def: any }>(res => {
      this.resolveExit = (result) => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        detachPicker();
        showInteractHint(null);
        showHotkeys(false);
        this.intRigs.forEach(disposeRig);
        this.resolveExit = null;
        res(result);
      };
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;

    if (k === 'e' || k === 'enter') {
      const tpos = this.tamer.position;
      const match = this.interactables.find(i => tpos.distanceTo(i.pos) < i.radius);
      if (match) {
        sfx('confirm');
        match.handler();
      }
    } else if (k === 'p') this.openPanelGuarded('player');
    else if (k === 'i') this.openPanelGuarded('inventory');
    else if (k === 'g') this.openPanelGuarded('guardians');
    else if (k === 'c') this.openPanelGuarded('crawler');
    else if (k === 'j') this.openPanelGuarded('quests');
    else if (k === 'v') this.openPanelGuarded('evotree');
    else if (k === 'escape' || k === 'esc') {
      this.busy = true;
      openPauseMenu(this.player, { canSave: true }).then(() => {
        updateHUD(this.player, this.mode === 'street' ? 'Hyujon' : this.intName);
        this.busy = false;
      });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private intRigs: any[] = []; // simple stub to support interface

  private update(dt: number): void {
    this.t += dt;

    // Spark & lightning flickering logic
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      if (this.sparkActive) {
        this.sparkActive = false;
        this.sparkTimer = 1.0 + Math.random() * 5.0; // delay between sparks
        this.flashLight.intensity = 0;
        this.streetGlowLines.forEach(l => { (l.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2; });
      } else {
        this.sparkActive = true;
        this.sparkTimer = 0.05 + Math.random() * 0.15; // duration of flash
        this.sparkIntensity = 1.5 + Math.random() * 2.5;
        this.flashLight.intensity = this.sparkIntensity * 12;
        this.streetGlowLines.forEach(l => { (l.material as THREE.MeshStandardMaterial).emissiveIntensity = this.sparkIntensity; });
        if (Math.random() < 0.3 && this.mode === 'street') {
          // Play a crackling spark sound
          sfx('confirm'); 
        }
      }
    }

    if (this.mode === 'street') {
      // Flicker street lanterns
      this.streetLanternLights.forEach(light => {
        const baseIntensity = light.color.getHex() === CYAN ? 2.0 : (light.color.getHex() === ACID ? 2.5 : 1.8);
        if (Math.random() < 0.15) {
          light.intensity = baseIntensity * (0.6 + Math.random() * 0.5);
        } else {
          light.intensity = THREE.MathUtils.lerp(light.intensity, baseIntensity, 0.1);
        }
      });

      // Rotate and pulse the bunker warning beacon light
      if (this.beaconLight) {
        this.beaconAngle += dt * 4.0;
        this.beaconLight.intensity = 3.0 + Math.sin(this.beaconAngle) * 2.0;
      }

      // Pulse warning flares/lights
      this.terminalFlares.forEach(flare => {
        flare.intensity = 1.8 + Math.sin(this.t * 6.0 + flare.position.x) * 1.0;
      });
    }

    if (isDialogueOpen() || isMenuOpen() || this.busy) return;

    // Movement physics
    const speed = 7.0;
    const move = new THREE.Vector3();
    if (this.keys.has('w') || this.keys.has('arrowup')) move.z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) move.z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) move.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) move.x += 1;

    let walking = false;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      const nextPos = this.tamer.position.clone().add(move);

      // Boundary collision check
      const boundLimit = this.mode === 'street' ? 28.5 : Math.min(this.intRoom.w, this.intRoom.d) / 2 - 0.5;
      if (Math.abs(nextPos.x) < (this.mode === 'street' ? 28.5 : this.intRoom.w / 2 - 0.4) &&
          Math.abs(nextPos.z) < (this.mode === 'street' ? 28.5 : this.intRoom.d / 2 - 0.4)) {
        
        // Sphere collider collision check
        let blocked = false;
        for (const col of this.colliders) {
          const dist = new THREE.Vector3(nextPos.x, 0, nextPos.z).distanceTo(new THREE.Vector3(col.pos.x, 0, col.pos.z));
          if (dist < col.r) { blocked = true; break; }
        }
        if (!blocked) {
          this.tamer.position.copy(nextPos);
          this.tamer.rotation.y = Math.atan2(move.x, move.z);
          walking = true;
        }
      }
    }

    // Camera follow — support right-drag rotation using worldOrbit
    if (this.mode === 'street') {
      const t = this.tamer.position;
      const camGoal = new THREE.Vector3(t.x, t.y + 7.5, t.z + 9.0);
      worldOrbit.update(dt);
      const lookT = new THREE.Vector3(t.x, t.y + 0.8, t.z);
      this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 4));
      this.camera.lookAt(lookT);
    } else {
      // Room camera
      this.camera.position.set(0, 6.0, this.intRoom.d / 2 + 4.0);
      this.camera.lookAt(0, 0.8, 0);
    }

    // Interactable HUD prompt update
    const tpos = this.tamer.position;
    const match = this.interactables.find(i => tpos.distanceTo(i.pos) < i.radius);
    if (match) showInteractHint(match.label);
    else showInteractHint(null);

    // Draw town map / minimap
    if (this.mode === 'street') {
      const markers: MapMarker[] = [
        { x: -22, z: 0, label: "Clyde's Lab", color: '#5aff9a', kind: 'building' },
        { x: 18, z: -4, label: 'Gem Exchange', color: '#ffd23a', kind: 'building' },
        { x: 12, z: -22, label: 'Command Bunker', color: '#d95050', kind: 'building' },
        { x: 0, z: -4, label: 'Midtown Crater', color: '#e85a6a', kind: 'poi' },
        { x: 22, z: 12, label: 'Harbor Cells', color: '#a0e8ff', kind: 'poi' },
        { x: 0, z: -24, label: 'Drowned Terminal', color: '#11ffcc', kind: 'door' },
        { x: 0, z: 27, label: 'Aether-Pod Gate', color: '#4fe0ff', kind: 'door' },
        { x: -6, z: 10, label: 'Grieving Tamer', color: '#888888', kind: 'npc' },
        { x: 8, z: 14, label: 'Old Machinist', color: '#888888', kind: 'npc' },
        { x: 8, z: -18, label: 'Marshal Kovar', color: '#ff5555', kind: 'npc' },
        { x: -6, z: -8, label: 'Archivist Tem', color: '#55aaff', kind: 'npc' },
        { x: 22, z: 11, label: 'Stillwater Defector', color: '#55aaff', kind: 'npc' },
      ];
      drawAreaMap(document.getElementById('minimap') as unknown as HTMLCanvasElement, {
        shape: 'circle', radius: 30,
        markers,
        player: { x: this.tamer.position.x, z: this.tamer.position.z, rot: this.tamer.rotation.y },
        title: 'Forgotten Tech-City of Hyujon',
        playerState: this.player,
      });
    } else {
      drawAreaMap(document.getElementById('minimap') as unknown as HTMLCanvasElement, {
        shape: 'rect', w: this.intRoom.w, d: this.intRoom.d,
        markers: [
          { x: 0, z: this.intRoom.d / 2 - 1.0, label: 'Exit', color: '#5aff9a', kind: 'door' },
          { x: 0, z: -4.2, label: 'Doctor Clyde', color: '#4e5ae8', kind: 'npc' },
        ],
        player: { x: this.tamer.position.x, z: this.tamer.position.z, rot: this.tamer.rotation.y },
        title: this.intName,
        playerState: this.player,
      });
    }

    // Update animation rigs for player and NPCs
    updateVoxelHuman(this.tamer, walking, dt);
    this.staticNpcs.forEach(npc => updateVoxelHuman(npc, false, dt));
    this.intNpcs.forEach(npc => updateVoxelHuman(npc, false, dt));
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, this.mode === 'street' ? 'Hyujon' : this.intName);
      this.busy = false;
    });
  }
}
