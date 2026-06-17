// ============================================================
// AZ Tamer — Fishing Expansion: the dedicated Fishing Scene and
// the full 5-phase gameplay loop (Cast → Wait → Hook → Fight →
// Land), the cinematic catch showcase, scoring, progression, the
// living leaderboard and dynamic music.
//
// A self-contained View (scene/camera/update) like Battle. Town
// hands control here and gets it back when the player quits.
// by lemonquake
// ============================================================
import * as THREE from 'three';
import { Player } from './state';
import {
  makeTamer, updateTamerFX, tween, wait, Ease, mulberry,
  plankTexture, groundTexture, skyGradient, makeTree,
} from './models';
import { updateTamerAppearance } from './clothes';
import { worldClock, DayNightRig, skyAt, lerpHex } from './daynight';
import { say, conversation, choose, toast, fadeIn, fadeOut, hideHUD } from './ui';
import { playMusic, sfx, type SfxName } from './audio';
import {
  makeWater, makeFish, makeFishShadow, makeRod, makeBobber, swimFish, makeSplash, makeRipple, disposeFish,
  makeCastingReticle,
  type WaterHandle,
} from './fishingmodels';
import {
  FISH, ALL_FISH, RARITY, RODS, BAITS, LINES, ALL_LINES, WEATHER_LABEL, FAMILIES,
  timeOfDay, rollFish, rollSize, computeScore, simulateLeaderboard, rankPlayer,
  fishingLevelFromExp, fishingExpForLevel, titleForLevel, rankTitle, normalizeFishingState,
  FISH_ACHIEVEMENTS, fmt,
  personalityOf, biomeOf, rarityRank, PERSONALITIES,
  type SpeciesDef, type Weather, type SpotKind, type FishingState, type Rarity, type CatchContext,
  type BeatType, type PersonalityDef,
} from './fishingdata';
import { showCatchSummary, showShowcaseBanner, hideShowcaseBanner, announceRank, openFishHub, type CatchSummaryData } from './fishingui';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

type Phase = 'idle' | 'cast' | 'flying' | 'wait' | 'bite' | 'hook' | 'fight' | 'land' | 'showcase' | 'summary' | 'done';
type HookResult = 'perfect' | 'good' | 'weak' | 'miss';

// One falling note on the DDR-style reel highway.
interface ActiveBeat {
  id: number;
  type: BeatType;
  lane: number;          // 0=LEFT 1=REEL(space) 2=HAUL(e) 3=RIGHT
  isFeint: boolean;
  timeSpawned: number;
  targetTime: number;    // moment the note head sits on the receptor
  duration: number;      // travel time top→receptor
  holdDur: number;       // sustain length for hold notes (0 otherwise)
  hit: boolean;
  isHolding: boolean;
  holdStartTime?: number;
  dom?: HTMLElement;
  subType?: 'normal' | 'speedy' | 'slow' | 'golden' | 'fire' | 'tension' | 'chaos';
}

// The four reel-highway lanes. A note's lane decides which key reels it in.
//   0 LEFT (counter a left dart)   1 REEL (the steady haul + power-holds)
//   2 HAUL (sharp jabs)            3 RIGHT (counter a right dart)
const LANES: { glyph: string; keyLabel: string; color: string; glow: string; keys: string[] }[] = [
  { glyph: '◀',  keyLabel: 'A',     color: '#f2c14e', glow: 'rgba(242,193,78,0.6)',  keys: ['a', 'arrowleft'] },
  { glyph: '⟳',  keyLabel: 'SPACE', color: '#5ab8e8', glow: 'rgba(90,184,232,0.6)',  keys: [' ', 'spacebar'] },
  { glyph: '✊', keyLabel: 'E',     color: '#5ad88a', glow: 'rgba(90,216,138,0.6)',  keys: ['e'] },
  { glyph: '▶',  keyLabel: 'D',     color: '#ff7ad8', glow: 'rgba(255,122,216,0.6)', keys: ['d', 'arrowright'] },
];
const LANE_LEFT = 0, LANE_REEL = 1, LANE_HAUL = 2, LANE_RIGHT = 3;
const laneForKey = (k: string): number => LANES.findIndex(l => l.keys.includes(k));
type Judgment = 'perfect' | 'great' | 'good' | 'miss';
/** % of the highway height at which a note's head meets the receptor. */
const RECEPTOR_PCT = 78;

interface Shadow {
  grp: THREE.Group; sp: SpeciesDef;
  angle: number; r: number; speed: number; depth: number;
  cx: number; cz: number;
}

export interface FishingSpotInfo {
  spot: SpotKind;
  location: string;   // display name
  zoneTitle: string;  // HUD title
}

export class Fishing {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 300);
  private fs: FishingState;
  private rnd = mulberry(Math.floor(Math.random() * 1e9));

  private tamer = makeTamer();
  private rod!: THREE.Group;
  private rodTip = new THREE.Object3D();
  private bobber!: THREE.Group;
  private line!: THREE.Line;
  private water!: WaterHandle;
  private dayNight!: DayNightRig;
  private sun = new THREE.DirectionalLight(0xfff0d0, 1.4);

  private shadows: Shadow[] = [];
  private weather: Weather = 'clear';
  private spotInfo: FishingSpotInfo;

  // gameplay state
  private phase: Phase = 'idle';
  private keys = new Set<string>();
  private castMeter = 0; private castDir = 1;
  private castPower = 0; private castDistance = 0; private castMax = 14;
  private targetShadow: Shadow | null = null;
  private landX = 0; private landZ = -6;
  private bobberAnchor = new THREE.Vector3();
  private hookT = 0; private hookDir = 1;
  private reelProgress = 0; private tension = 0; private fightPull = 0;
  private fightT = 0; private fightFish: SpeciesDef | null = null;
  private fightStartMs = 0;
  private windParticles: THREE.Points | null = null;
  private ambient: THREE.Object3D[] = [];
  private elapsed = 0;

  // Overhaul additions
  private castAngle = 0;
  private reticle!: THREE.Group;
  private playerStamina = 1.0;
  private fishStamina = 1.0;
  private fishStruggleDir: 'left' | 'right' | 'none' = 'none';
  private struggleTimer = 0;
  private camShake = 0;
  private exhaustedTimer = 0;
  private quantumReelTime = 0;
  private floatyText = '';
  private floatyTextTimer = 0;
  private floatyTextColor = '#ffffff';
  private streakFailsafeUsed = false;
  private isPerfectAim = false;
  private lastStruggleWarningTime = 0;
  private floatyDOM!: HTMLElement;
  private prevRodLean = 0;
  private specialMoveTimer = 0;
  private specialMoveType: 'none' | 'deep_dive' | 'breach' = 'none';
  private specialMoveDuration = 0;
  private perfectLeansCount = 0;
  private wrongLeansCount = 0;
  private specialMovesCountered = 0;
  private totalSpecialMoves = 0;
  private hookQuality: HookResult = 'weak';
  
  // Rhythm Engine fields
  private activeBeats: ActiveBeat[] = [];
  private beatQueue: BeatType[] = [];
  private beatSpawnTimer = 0;
  private combo = 0;
  private maxCombo = 0;
  private perfectHits = 0;
  private greatHits = 0;
  private goodHits = 0;
  private missesCount = 0;
  private buttonMashesCount = 0;
  private beatIdCounter = 0;
  private bossPhase = 1;
  private totalBossPhases = 1;
  private baseBeatTimeMult = 1.0;
  private baseGapMult = 1.0;
  private nextBeatIsFeint = false;
  private burstCountRemaining = 0;
  private targetHitFlashTimer = 0;
  private isHoldingSpace = false;
  private bossPhaseTransitionTimer = 0.0;
  private lastTapLane = LANE_HAUL;   // alternate tap notes between REEL/HAUL lanes
  private perfectStreak = 0;
  private specialScoreBonus = 0;

  // live thrashing fish (shown breaching at the surface during the fight)
  private fightFishModel: THREE.Group | null = null;
  private fishDart = 0;              // current lateral lunge of the fish (-1..1)
  private fishDartTarget = 0;
  private fishDive = 0;              // how far it's pulling under (0..1)
  private fishBreachTimer = 2.0;     // countdown to the next leap
  private fishBreach = 0;            // current breach height factor (0..1)

  // angler full-body physics — impulse driven, smoothed every frame
  private anglerHaul = 0;            // how hard he's currently hauling (0..~1.3)
  private haulImpulse = 0;           // transient spike on a strong pull
  private leanX = 0;                 // smoothed body/rod lean (-1..1)
  private leanXTarget = 0;
  private stumble = 0;               // transient forward lurch on a miss
  private reelCrank = 0;             // reel-hand crank phase
  private reelCrankVel = 0;          // crank speed (spikes on a reel hit)
  private bodyNeutral = 1;           // 1 = relaxed stance, 0 = full fighting stance

  // resolvers for the async phase machine
  private castResolve: (() => void) | null = null;
  private hookResolve: ((r: HookResult) => void) | null = null;
  private fightResolve: ((win: boolean) => void) | null = null;
  private landResolve: ((win: boolean) => void) | null = null;
  private resolveRun: (() => void) | null = null;

  // DOM
  private hud!: HTMLElement;
  private meterBox!: HTMLElement;

  constructor(private player: Player, spotInfo: FishingSpotInfo) {
    this.spotInfo = spotInfo;
    this.fs = normalizeFishingState((player as unknown as { fishing?: FishingState }).fishing);
    (player as unknown as { fishing: FishingState }).fishing = this.fs;
    this.castMax = (RODS[this.fs.equippedRod] ?? RODS.beginner).castMax;
    this.build();
  }

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ============================================================
  //  SCENE CONSTRUCTION
  // ============================================================
  private build(): void {
    const s = this.scene;
    const isRiver = this.spotInfo.spot === 'river';
    const isSecret = this.spotInfo.spot === 'secret';
    s.fog = new THREE.Fog(0xbcc8d8, 30, 130);
    const [top, bottom] = skyAt(worldClock.t);
    s.background = skyGradient(top, bottom);

    // lights
    this.sun.castShadow = true;
    this.sun.position.set(18, 30, 14);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -30; this.sun.shadow.camera.right = 30;
    this.sun.shadow.camera.top = 30; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.far = 90;
    s.add(this.sun);
    const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x2a3a26, 0.7);
    s.add(hemi);
    this.dayNight = new DayNightRig(s, this.sun, hemi, {
      sunMax: 1.5, sunMin: 0.18, ambientMax: 0.8, ambientMin: 0.3,
      sunNight: isSecret ? '#6a7ad8' : '#8a9ad8',
    });

    // ground — grassy shore wrapping the water
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture(isSecret ? '#2a3a2a' : '#4a6a36', isSecret ? '#3a4a3a' : '#5a7a3e', 14), roughness: 0.95,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.25; ground.receiveShadow = true;
    s.add(ground);

    // the water body
    const waterColors = isSecret
      ? { deep: 0x0a1828, shallow: 0x163048 }
      : isRiver
        ? { deep: 0x16415a, shallow: 0x2f86a2 }
        : { deep: 0x123a52, shallow: 0x2f7a9a };
    this.water = makeWater({
      radius: 22, center: new THREE.Vector2(0, -4), segments: 110, river: isRiver,
      deep: waterColors.deep, shallow: waterColors.shallow, waveAmp: isRiver ? 0.18 : 0.12, foam: isRiver ? 0.6 : 1.0,
    });
    this.water.mesh.position.set(0, 0, -4);
    this.water.mesh.receiveShadow = false;
    s.add(this.water.mesh);

    // sandy/pebbled basin under the water so depth reads
    const basin = new THREE.Mesh(new THREE.CircleGeometry(22, 40),
      new THREE.MeshStandardMaterial({ color: isSecret ? 0x1a2438 : 0x5a5236, roughness: 1 }));
    basin.rotation.x = -Math.PI / 2; basin.position.set(0, -1.6, -4); s.add(basin);

    this.buildDock();
    this.buildShoreDecor(isSecret);
    this.buildAmbientLife(isSecret);

    // the angler + rod
    updateTamerAppearance(this.tamer, this.player.equippedClothes, this.player.appearance);
    this.tamer.position.set(0, 0.32, 2.0);
    this.tamer.rotation.y = Math.PI; // face -z, out over the water
    this.tamer.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    s.add(this.tamer);

    this.rod = makeRod(RODS[this.fs.equippedRod] ?? RODS.beginner);
    const armR = this.tamer.getObjectByName('armR');
    if (armR) {
      armR.add(this.rod);
      this.rod.position.set(0.0, -0.42, 0.12);
      this.rod.rotation.set(-0.5, 0, 0.2);
    } else {
      this.rod.position.set(0.3, 1.1, 1.7); s.add(this.rod);
    }
    const tip = this.rod.getObjectByName('rodTip');
    if (tip) this.rodTip = tip as THREE.Object3D;

    // bobber + line (12 segments for catenary physics)
    this.bobber = makeBobber(BAITS[this.fs.equippedBait] ?? BAITS.worm);
    this.bobber.visible = false;
    s.add(this.bobber);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf4f4ff, transparent: true, opacity: 0.5 });
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push(new THREE.Vector3());
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    this.line.visible = false;
    s.add(this.line);

    // casting reticle
    this.reticle = makeCastingReticle();
    this.reticle.visible = false;
    s.add(this.reticle);

    // weather
    this.pickWeather();
    this.applyWeather();

    // camera — behind & above the angler, gazing out over the water
    this.camera.position.set(0, 4.6, 8.5);
    this.camera.lookAt(0, 1.0, -6);

    // initial fish population
    this.repopulateShadows();
  }

  private buildDock(): void {
    const s = this.scene;
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture('#6a5236'), roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ map: plankTexture('#4a3a22'), roughness: 0.95 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 7), wood);
    deck.position.set(0, 0.22, 4.0); deck.receiveShadow = true; deck.castShadow = true;
    s.add(deck);
    for (let i = 0; i < 5; i++) {
      for (const x of [-1.0, 1.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 7), postMat);
        post.position.set(x, -0.4, 1.0 + i * 1.5); post.castShadow = true; s.add(post);
      }
    }
    // railing posts at the end
    for (const x of [-1.05, 1.05]) {
      const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), postMat);
      rp.position.set(x, 0.6, 0.9); s.add(rp);
    }
    // a lantern post — lights up at night
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), postMat);
    lampPost.position.set(1.1, 1.1, 6.6); s.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xc9a24a, emissiveIntensity: 0.6 }));
    lamp.position.set(1.1, 2.0, 6.6); lamp.name = 'dockLamp'; s.add(lamp);
    const lampLight = new THREE.PointLight(0xffd98a, 0, 10);
    lampLight.position.set(1.1, 2.0, 6.6); lampLight.name = 'dockLampLight'; s.add(lampLight);
  }

  private buildShoreDecor(secret: boolean): void {
    const s = this.scene;
    const r = mulberry(secret ? 99 : 7);
    // reeds & cattails around the shore arc (north half)
    const reedMat = new THREE.MeshStandardMaterial({ color: secret ? 0x3a4a2a : 0x5a7a36, roughness: 0.9 });
    const catMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95 });
    for (let i = 0; i < 90; i++) {
      const a = Math.PI + r() * Math.PI; // north shore
      const rad = 17 + r() * 6;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad - 4;
      if (z > 0) continue;
      const h = 0.7 + r() * 0.9;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, h, 4), reedMat);
      reed.position.set(x, h / 2 - 0.25, z); reed.rotation.z = (r() - 0.5) * 0.3;
      s.add(reed);
      if (i % 4 === 0) {
        const cat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), catMat);
        cat.position.set(x, h - 0.2, z); s.add(cat);
      }
    }
    // lily pads
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, rad = 4 + r() * 13;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.3 + r() * 0.3, 9),
        new THREE.MeshStandardMaterial({ color: secret ? 0x2a4a3a : 0x3a8a3a, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(Math.cos(a) * rad, 0.05, Math.sin(a) * rad - 4);
      s.add(pad);
      if (i % 3 === 0) {
        const lily = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.13, 6),
          new THREE.MeshStandardMaterial({ color: 0xf2c8d8, emissive: 0x6a2a4a, emissiveIntensity: 0.2 }));
        lily.position.set(pad.position.x, 0.12, pad.position.z); s.add(lily);
      }
    }
    // rocks
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, rad = 16 + r() * 8;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + r() * 0.7, 0),
        new THREE.MeshStandardMaterial({ color: 0x7a7466, roughness: 1, flatShading: true }));
      rock.position.set(Math.cos(a) * rad, -0.1 + r() * 0.2, Math.sin(a) * rad - 4);
      rock.rotation.set(r(), r(), r()); rock.castShadow = true; s.add(rock);
    }
    // trees ringing the far shore
    const kinds = ['oak', 'pine', 'blossom', 'birch'] as const;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.85 + r() * Math.PI * 1.3;
      const rad = 26 + r() * 14;
      const tree = makeTree(secret ? 'pine' : kinds[Math.floor(r() * kinds.length)], Math.floor(r() * 9999));
      tree.position.set(Math.cos(a) * rad, -0.2, Math.sin(a) * rad - 4);
      const sc = 0.9 + r() * 0.8; tree.scale.setScalar(sc);
      s.add(tree);
    }
  }

  private buildAmbientLife(secret: boolean): void {
    const s = this.scene;
    // dragonflies / fireflies — tiny glowing sprites that drift
    const count = 16;
    for (let i = 0; i < count; i++) {
      const fly = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshBasicMaterial({ color: secret ? 0x8affd8 : 0xffe28a, transparent: true, opacity: 0.85 }));
      fly.position.set((Math.random() - 0.5) * 24, 0.6 + Math.random() * 2.4, -4 + (Math.random() - 0.5) * 22);
      fly.userData = { ox: fly.position.x, oz: fly.position.z, oy: fly.position.y, ph: Math.random() * 9, sp: 0.4 + Math.random() * 0.6 };
      s.add(fly); this.ambient.push(fly);
    }
    // a couple of distant birds (V shapes) gliding
    for (let i = 0; i < 3; i++) {
      const bird = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.14), new THREE.MeshStandardMaterial({ color: 0x2a2a3a }));
      const wing2 = wing.clone();
      wing.rotation.z = 0.4; wing2.rotation.z = -0.4; wing.position.x = 0.3; wing2.position.x = -0.3;
      bird.add(wing, wing2);
      bird.position.set((Math.random() - 0.5) * 30, 14 + Math.random() * 6, -20 - Math.random() * 20);
      bird.userData = { sp: 1 + Math.random() * 1.5, ph: Math.random() * 9 };
      s.add(bird); this.ambient.push(bird);
    }
    // lazy ducks on the pond (pond only)
    if (!secret) {
      for (let i = 0; i < 3; i++) {
        const duck = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: i === 0 ? 0x4a6a3a : 0xe8e0d0, roughness: 0.8 }));
        body.scale.set(1.4, 0.85, 1);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), new THREE.MeshStandardMaterial({ color: i === 0 ? 0x2a5a4a : 0xd8c8a8 }));
        head.position.set(0.22, 0.2, 0);
        duck.add(body, head);
        duck.position.set((Math.random() - 0.5) * 10, 0.12, -6 - Math.random() * 6);
        duck.userData = { angle: Math.random() * 6.28, r: 1.5 + i, cx: duck.position.x, cz: duck.position.z, sp: 0.2 + Math.random() * 0.2 };
        s.add(duck); this.ambient.push(duck);
      }
    }
  }

  // ============================================================
  //  WEATHER
  // ============================================================
  private pickWeather(): void {
    const r = this.rnd();
    const night = worldClock.night > 0.5;
    // weight weather; storms/rain a touch likelier at night
    if (r < 0.40) this.weather = 'clear';
    else if (r < 0.62) this.weather = 'cloudy';
    else if (r < 0.80) this.weather = 'rain';
    else if (r < 0.92) this.weather = night ? 'storm' : 'fog';
    else this.weather = night ? 'storm' : 'cloudy';
  }

  private applyWeather(): void {
    // remove old wind particles
    if (this.windParticles) { this.scene.remove(this.windParticles); this.windParticles.geometry.dispose(); (this.windParticles.material as THREE.Material).dispose(); this.windParticles = null; }
    const w = this.weather;
    if (w === 'rain' || w === 'storm') {
      const n = w === 'storm' ? 1400 : 800;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = Math.random() * 30;
        pos[i * 3 + 2] = -4 + (Math.random() - 0.5) * 60;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: 0x9ab8d8, size: 0.12, transparent: true, opacity: 0.6 });
      this.windParticles = new THREE.Points(geo, m);
      this.scene.add(this.windParticles);
    }
    if (w === 'fog') { (this.scene.fog as THREE.Fog).near = 12; (this.scene.fog as THREE.Fog).far = 60; }
    else if (w === 'storm') { (this.scene.fog as THREE.Fog).near = 20; (this.scene.fog as THREE.Fog).far = 90; }
    else { (this.scene.fog as THREE.Fog).near = 30; (this.scene.fog as THREE.Fog).far = 130; }
  }

  // ============================================================
  //  FISH SHADOWS
  // ============================================================
  private repopulateShadows(): void {
    this.shadows.forEach(sh => disposeFish(sh.grp));
    this.shadows = [];
    const count = 6 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < count; i++) this.spawnShadow();
  }

  private spawnShadow(): void {
    const ctx = this.context(null, 0.5);
    const sp = rollFish(ctx, this.rnd);
    const grp = makeFishShadow(sp);
    const cx = (this.rnd() - 0.5) * 16;
    const cz = -4 - this.rnd() * 9;
    const sh: Shadow = {
      grp, sp,
      angle: this.rnd() * Math.PI * 2,
      r: 1.5 + this.rnd() * 4,
      speed: sp.speed * (0.15 + this.rnd() * 0.1),
      depth: -0.35 - this.rnd() * 0.25,
      cx, cz,
    };
    grp.position.set(cx, sh.depth, cz);
    this.scene.add(grp);
    this.shadows.push(sh);
  }

  private context(target: string | null, castQuality: number): CatchContext {
    return {
      level: fishingLevelFromExp(this.fs.exp),
      time: timeOfDay(worldClock.t),
      weather: this.weather,
      spot: this.spotInfo.spot,
      bait: BAITS[this.fs.equippedBait] ?? BAITS.worm,
      rod: RODS[this.fs.equippedRod] ?? RODS.beginner,
      line: LINES[this.fs.equippedLine] ?? LINES.basic_mono,
      castQuality,
      targetSpecies: target,
    };
  }

  // ============================================================
  //  PER-FRAME UPDATE
  // ============================================================
  private update(dt: number): void {
    this.elapsed += dt;
    this.dayNight.update(dt);
    updateTamerFX(this.tamer, dt);

    // floaty text decay
    if (this.floatyTextTimer > 0) {
      this.floatyTextTimer -= dt;
      if (this.floatyTextTimer <= 0) { this.floatyText = ''; }
      this.updateFloatyTextDOM();
    }

    // Decay transition timer and camera zoom offset
    if (this.bossPhaseTransitionTimer > 0) {
      this.bossPhaseTransitionTimer -= dt;
    }
    if (this.camZoomOffset > 0) {
      this.camZoomOffset = Math.max(0, this.camZoomOffset - dt * 5.0);
    }

    // camera kinetics
    if (this.phase === 'fight') {
      let standardCam: THREE.Vector3;
      if (this.bossPhaseTransitionTimer > 0) {
        // Cinematic side-angle view during transitions
        standardCam = new THREE.Vector3(6.5, 3.2, 4.5);
        this.camera.position.lerp(standardCam, dt * 3.0);
        this.camera.lookAt(this.tamer.position.x, 1.2, this.tamer.position.z);
      } else {
        // Standard combat camera following rod lean and perfect hits
        standardCam = new THREE.Vector3(0, 4.6, 8.5);
        standardCam.x += this.prevRodLean * 2.2;
        standardCam.z -= this.camZoomOffset;
        standardCam.x += this.bobber.position.x * 0.45;
        this.camera.position.lerp(standardCam, dt * 2.0);
        this.camera.lookAt(this.bobber.position.x * 0.8, 1.0, this.bobber.position.z);
      }
    } else if (this.phase === 'hook') {
      // hook zoom-in is handled via tween/timeout, so do not override camera here
    } else if (this.phase === 'cast') {
      // aim camera slightly left/right based on angle
      const standardCam = new THREE.Vector3(0, 4.6, 8.5);
      standardCam.x += Math.sin(this.castAngle) * 2.5;
      this.camera.position.lerp(standardCam, dt * 4.0);
      const targetAim = new THREE.Vector3(Math.sin(this.castAngle) * 8, 0.5, this.tamer.position.z - Math.cos(this.castAngle) * 8);
      this.camera.lookAt(targetAim);
    } else if (this.phase === 'idle' || this.phase === 'wait' || this.phase === 'bite') {
      const standardCam = new THREE.Vector3(0, 4.6, 8.5);
      this.camera.position.lerp(standardCam, dt * 2.0);
      this.camera.lookAt(0, 1.0, -6);
    }

    // camera shake
    if (this.camShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.camShake;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake;
      this.camShake = Math.max(0, this.camShake - dt * 2.0);
    }

    // water shader
    const [topC, botC] = skyAt(worldClock.t);
    this.water.update(
      this.elapsed,
      this.sun.position.clone().normalize(),
      this.sun.color.clone(),
      new THREE.Color(topC), new THREE.Color(botC),
      worldClock.daylight,
    );

    // night lamp
    const night = worldClock.night;
    const lamp = this.scene.getObjectByName('dockLamp') as THREE.Mesh | null;
    const lampLight = this.scene.getObjectByName('dockLampLight') as THREE.PointLight | null;
    if (lamp) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + night * 1.0;
    if (lampLight) lampLight.intensity = night * 1.4;

    // shadows drift
    for (const sh of this.shadows) {
      if (sh === this.targetShadow && (this.phase === 'wait' || this.phase === 'bite' || this.phase === 'fight' || this.phase === 'hook')) {
        if (this.phase === 'fight') {
          // Lock target shadow to bobber position during fight
          sh.grp.position.x = this.bobber.position.x;
          sh.grp.position.z = this.bobber.position.z;
          sh.grp.position.y = -0.15 + Math.sin(this.elapsed * 12) * 0.04;
          
          let wiggle = Math.sin(this.elapsed * 22) * 0.4;
          if (this.fishStruggleDir === 'left') {
            wiggle += 0.8;
          } else if (this.fishStruggleDir === 'right') {
            wiggle -= 0.8;
          }
          const playerPos = new THREE.Vector3(this.tamer.position.x, 0.12, this.tamer.position.z - 0.4);
          sh.grp.rotation.y = Math.atan2(playerPos.x - this.bobber.position.x, playerPos.z - this.bobber.position.z) + Math.PI + wiggle;
        } else if (this.phase === 'hook' || this.phase === 'bite') {
          sh.grp.position.x = this.bobber.position.x;
          sh.grp.position.z = this.bobber.position.z;
          sh.grp.position.y = -0.15;
          sh.grp.rotation.y = Math.atan2(this.tamer.position.x - this.bobber.position.x, this.tamer.position.z - this.bobber.position.z) + Math.PI;
        }
        const rg = sh.grp.getObjectByName('rareGlow');
        if (rg) ((rg as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (sh.sp.rarity === 'Legendary' ? 0.3 : 0.16) * (0.6 + 0.4 * Math.sin(this.elapsed * 2));
        continue;
      }
      sh.angle += sh.speed * dt;
      sh.grp.position.x = sh.cx + Math.cos(sh.angle) * sh.r;
      sh.grp.position.z = sh.cz + Math.sin(sh.angle) * sh.r * 0.6;
      sh.grp.position.y = sh.depth + Math.sin(this.elapsed * 0.8 + sh.angle) * 0.06;
      sh.grp.rotation.y = -sh.angle + Math.PI / 2;
      const rg = sh.grp.getObjectByName('rareGlow');
      if (rg) ((rg as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (sh.sp.rarity === 'Legendary' ? 0.3 : 0.16) * (0.6 + 0.4 * Math.sin(this.elapsed * 2 + sh.angle));
    }

    // ambient life
    for (const a of this.ambient) {
      const u = a.userData as Record<string, number>;
      if (u.sp !== undefined && u.r !== undefined) { // duck
        u.angle += u.sp * dt;
        a.position.x = u.cx + Math.cos(u.angle) * u.r;
        a.position.z = u.cz + Math.sin(u.angle) * u.r;
        a.position.y = 0.12 + Math.sin(this.elapsed * 2 + u.angle) * 0.02;
        a.rotation.y = -u.angle;
      } else if (u.ph !== undefined && u.ox !== undefined) { // firefly
        a.position.x = u.ox + Math.sin(this.elapsed * u.sp + u.ph) * 2;
        a.position.z = u.oz + Math.cos(this.elapsed * u.sp * 0.7 + u.ph) * 2;
        a.position.y = u.oy + Math.sin(this.elapsed * 1.5 + u.ph) * 0.4;
        const mm = (a as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mm.opacity = night > 0.4 ? 0.9 : 0.0; // fireflies only after dark
      } else if (u.ph !== undefined) { // bird
        a.position.x += u.sp * dt * 2;
        if (a.position.x > 34) a.position.x = -34;
        a.children.forEach((wgo, i) => { wgo.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(this.elapsed * 6 + u.ph) * 0.3); });
      }
    }

    // rain falls
    if (this.windParticles) {
      const arr = this.windParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const speed = this.weather === 'storm' ? 38 : 24;
      for (let i = 0; i < arr.count; i++) {
        let y = arr.getY(i) - speed * dt;
        if (y < 0) { y = 28 + Math.random() * 4; }
        arr.setY(i, y);
      }
      arr.needsUpdate = true;
    }

    // rod tip → bobber line (catenary physics sag)
    if (this.bobber.visible) {
      const tipW = new THREE.Vector3(); this.rodTip.getWorldPosition(tipW);
      const bobP = this.bobber.position;
      const pts = (this.line.geometry.getAttribute('position') as THREE.BufferAttribute);
      
      const maxSag = (1 - this.tension) * 1.5 * Math.max(0, 1 - this.reelProgress);
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const x = tipW.x + (bobP.x - tipW.x) * t;
        const z = tipW.z + (bobP.z - tipW.z) * t;
        const yLine = tipW.y + (bobP.y - tipW.y) * t;
        const sag = Math.sin(t * Math.PI) * maxSag;
        pts.setXYZ(i, x, yLine - sag, z);
      }
      pts.needsUpdate = true;
      this.line.visible = true;

      // color tension feedback
      const lineMat = this.line.material as THREE.LineBasicMaterial;
      if (this.tension > 0.8) {
        lineMat.color.setHex(0xe85a6a);
        lineMat.opacity = 0.9;
      } else if (this.tension > 0.6) {
        lineMat.color.setHex(0xf2935a);
        lineMat.opacity = 0.7;
      } else {
        lineMat.color.setHex(0xf4f4ff);
        lineMat.opacity = 0.5;
      }
    } else {
      this.line.visible = false;
    }

    // ---- phase-driven meters & sim ----
    switch (this.phase) {
      case 'cast': {
        // adjust angle with A/D or arrows
        if (this.keys.has('left')) this.castAngle = Math.max(-0.85, this.castAngle - dt * 1.5);
        if (this.keys.has('right')) this.castAngle = Math.min(0.85, this.castAngle + dt * 1.5);

        this.castMeter += this.castDir * dt * 1.25;
        if (this.castMeter >= 1) { this.castMeter = 1; this.castDir = -1; }
        if (this.castMeter <= 0) { this.castMeter = 0; this.castDir = 1; }
        this.renderCastMeter();

        // position reticle
        const dist = 3 + this.castMeter * (this.castMax - 3);
        const landX = Math.sin(this.castAngle) * dist;
        const landZ = this.tamer.position.z - Math.cos(this.castAngle) * dist;
        this.reticle.position.set(landX, 0.05, landZ);
        this.reticle.visible = true;

        // shadow snapping / coloring
        let snapped = false;
        for (const sh of this.shadows) {
          const d = Math.hypot(sh.grp.position.x - landX, sh.grp.position.z - landZ);
          if (d < 1.8) snapped = true;
        }
        const color = snapped ? 0xffd25a : 0x5ad88a;
        ((this.reticle.children[0] as THREE.Mesh).material as any).color.setHex(color);
        ((this.reticle.children[1] as THREE.Mesh).material as any).color.setHex(color);
        break;
      }
      case 'wait': {
        // gentle bob
        this.bobber.position.y = this.bobberAnchor.y + Math.sin(this.elapsed * 2.5) * 0.05;
        break;
      }
      case 'bite': {
        this.bobber.position.y = this.bobberAnchor.y - Math.abs(Math.sin(this.elapsed * 18)) * 0.18;
        break;
      }
      case 'hook': {
        const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
        const speedMult = line.id === 'chrono_fibre' ? 0.7 : 1.0;
        this.hookT += this.hookDir * dt * 1.25 * speedMult;
        if (this.hookT >= 1) { this.hookT = 1; this.hookDir = -1; }
        if (this.hookT <= 0) { this.hookT = 0; this.hookDir = 1; }
        this.renderHookMeter();
        break;
      }
      case 'fight': {
        this.tickFight(dt);
        break;
      }
    }

    // keep the angler alive between casts — eases back to a relaxed stance
    if (this.phase === 'idle' || this.phase === 'wait' || this.phase === 'bite') {
      this.updateAnglerPose(dt);
    }
  }

  // ============================================================
  //  INPUT
  // ============================================================
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    
    if (this.phase === 'fight') {
      if (k === ' ' || k === 'spacebar' || k === 'e' || k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') {
        if (k === ' ' || k === 'spacebar') e.preventDefault();
        this.handleRhythmKeyDown(k);
        return;
      }
      if (k === 'escape') this.onEscape();
      return;
    }
    
    if (k === ' ' || k === 'spacebar') { e.preventDefault(); if (!this.keys.has('space')) { this.keys.add('space'); this.onAction(); } }
    else if (k === 'arrowleft' || k === 'a') this.keys.add('left');
    else if (k === 'arrowright' || k === 'd') this.keys.add('right');
    else if (k === 'escape') this.onEscape();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    
    if (this.phase === 'fight') {
      if (k === ' ' || k === 'spacebar' || k === 'e' || k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') {
        this.handleRhythmKeyUp(k);
      }
      return;
    }
    
    if (k === ' ' || k === 'spacebar') this.keys.delete('space');
    else if (k === 'arrowleft' || k === 'a') this.keys.delete('left');
    else if (k === 'arrowright' || k === 'd') this.keys.delete('right');
  };
  private onPointer = () => { if (this.phase !== 'fight') this.onAction(); };

  private onAction(): void {
    switch (this.phase) {
      case 'cast': this.castResolve?.(); this.castResolve = null; break;
      case 'hook': {
        const q = this.evalHook();
        this.hookResolve?.(q); this.hookResolve = null; break;
      }
      case 'land': this.landResolve?.(true); this.landResolve = null; break;
    }
  }

  private onEscape(): void {
    if (this.phase === 'idle' || this.phase === 'cast' || this.phase === 'wait' || this.phase === 'bite') {
      // bail out of the current attempt and leave fishing
      this.castResolve?.(); this.castResolve = null;
      this.quitRequested = true;
    }
  }

  // ============================================================
  //  RHYTHM INPUT HANDLING
  // ============================================================
  private camZoomOffset = 0;

  private handleRhythmKeyDown(key: string): void {
    if (this.phase !== 'fight') return;
    const lane = laneForKey(key);
    if (lane < 0) return;

    if (this.playerStamina <= 0 || this.exhaustedTimer > 0) {
      this.triggerFloatyText('EXHAUSTED!', '#ff5a6a');
      sfx('cancel');
      return;
    }

    this.flashReceptor(lane, '#ffffff');

    const p = personalityOf(this.fightFish!);
    const windowLimit = p.window * 1.6;
    const now = this.elapsed;

    // DDR-style: judge the nearest catchable note IN THIS LANE
    let best: ActiveBeat | null = null; let bestAbs = Infinity;
    for (const b of this.activeBeats) {
      if (b.hit || b.lane !== lane || b.isHolding) continue;
      const a = Math.abs(now - b.targetTime);
      if (a < bestAbs) { bestAbs = a; best = b; }
    }
    if (!best || bestAbs > windowLimit) { this.penalizeMash(lane); return; }

    if (best.isFeint) { this.registerBeatResult(best, 'miss'); return; } // decoy — don't hit it

    if (best.type === 'hold') {
      // begin the power-hold; held all the way through = PERFECT haul
      best.isHolding = true;
      best.holdStartTime = now;
      this.isHoldingSpace = true;
      this.haulImpulse = Math.max(this.haulImpulse, 0.7);
      best.dom?.classList.add('holding');
      this.flashReceptor(lane, LANES[lane].color);
      sfx('charge');
      return;
    }

    this.registerBeatResult(best, this.getRatingForDiff(now - best.targetTime, p.window));
  }

  private handleRhythmKeyUp(key: string): void {
    if (this.phase !== 'fight') return;
    if (laneForKey(key) !== LANE_REEL) return; // only the reel lane carries holds
    this.isHoldingSpace = false;
    const held = this.activeBeats.find(b => b.type === 'hold' && b.isHolding && !b.hit);
    if (!held) return;
    const releaseTarget = held.targetTime + held.holdDur;
    if (this.elapsed >= releaseTarget - 0.12) {
      this.registerBeatResult(held, 'perfect');             // rode it out — power pull!
    } else {
      const p = personalityOf(this.fightFish!);
      this.registerBeatResult(held, Math.abs(this.elapsed - releaseTarget) <= p.window * 1.5 ? 'good' : 'miss');
    }
  }

  private getRatingForDiff(diff: number, windowSize: number): Judgment {
    const absDiff = Math.abs(diff);
    if (absDiff <= windowSize * 0.28) return 'perfect';
    if (absDiff <= windowSize * 0.58) return 'great';
    if (absDiff <= windowSize) return 'good';
    return 'miss';
  }

  private penalizeMash(lane = -1): void {
    this.buttonMashesCount++;
    this.combo = 0;
    this.perfectStreak = 0;
    this.updateComboDisplay();
    const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
    this.tension += 0.04 * line.tensionRateBonus;
    this.camShake = Math.max(this.camShake, 0.2);
    this.stumble = Math.max(this.stumble, 0.5);
    if (lane >= 0) this.flashReceptor(lane, '#ff5a6a');
    sfx('cancel');
    this.triggerFloatyText('⚠️ EARLY!', '#ff5a6a');
  }

  /** Punch the lane's receptor with a coloured flash. */
  private flashReceptor(lane: number, color: string): void {
    const rec = this.meterBox.querySelector(`#receptor-${lane}`) as HTMLElement | null;
    if (!rec) return;
    rec.style.setProperty('--flash', color);
    rec.classList.remove('flash');
    void rec.offsetWidth;
    rec.classList.add('flash');
  }

  private registerBeatResult(beat: ActiveBeat, rating: Judgment): void {
    beat.hit = true;
    beat.isHolding = false;
    if (beat.dom) { const d = beat.dom; d.classList.add('struck'); setTimeout(() => d.remove(), 130); beat.dom = undefined; }

    const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
    const rod = RODS[this.fs.equippedRod] ?? RODS.beginner;
    const holdMul = beat.type === 'hold' ? 1.7 : 1.0;   // power-holds haul the most

    // direction notes decide which way he yanks; reel/haul recenter him
    if (beat.lane === LANE_LEFT) this.leanXTarget = -1;
    else if (beat.lane === LANE_RIGHT) this.leanXTarget = 1;
    else this.leanXTarget *= 0.35;
    this.fishDartTarget = 0; // a clean hit counters the fish's lunge

    if (rating === 'perfect') {
      this.perfectHits++; this.combo++;
      this.perfectStreak++;
    } else if (rating === 'great') {
      this.greatHits++; this.combo++;
      this.perfectStreak = 0;
    } else if (rating === 'good') {
      this.goodHits++; this.combo++;
      this.perfectStreak = 0;
    } else {
      this.missesCount++; this.combo = 0;
      this.perfectStreak = 0;
    }

    if (beat.subType === 'golden' && rating !== 'miss') {
      this.combo += 1; // +2 total combo (+1 from base increment, +1 extra)
    }

    let chainMult = 1.0;
    if (this.perfectStreak >= 10) chainMult = 2.0;
    else if (this.perfectStreak >= 5) chainMult = 1.5;
    else if (this.perfectStreak >= 3) chainMult = 1.25;

    let pointsEarned = 0;
    if (rating !== 'miss') {
      let basePoints = 100;
      if (rating === 'great') basePoints = 70;
      if (rating === 'good') basePoints = 40;

      if (beat.subType === 'speedy') basePoints = Math.round(basePoints * 1.5);
      else if (beat.subType === 'chaos') basePoints = Math.round(basePoints * 2.0);

      pointsEarned = Math.round(basePoints * chainMult);

      if (beat.subType === 'golden') {
        pointsEarned += 500;
      }
      this.specialScoreBonus += pointsEarned;

      // stamina damage
      let staminaDmg = (rating === 'perfect' ? 0.09 : rating === 'great' ? 0.06 : 0.032) * holdMul;
      staminaDmg *= chainMult;
      if (beat.subType === 'fire') staminaDmg *= 2.0;
      this.fishStamina = Math.max(0, this.fishStamina - staminaDmg);

      // reel progress
      let inc = (rating === 'perfect' ? (0.072 + rod.reelPower * 0.014) :
                 rating === 'great' ? (0.046 + rod.reelPower * 0.01) :
                 (0.024 + rod.reelPower * 0.005)) * holdMul;
      inc *= chainMult;
      if (this.fishStamina <= 0) inc *= 1.8;
      this.reelProgress += inc;

      // player stamina
      const staminaGain = (rating === 'perfect' ? 0.05 : rating === 'great' ? 0.025 : 0.01);
      this.playerStamina = Math.min(1.0, this.playerStamina + staminaGain);

      // tension recovery
      let tensionDec = (rating === 'perfect' ? 0.06 : rating === 'great' ? 0.03 : 0.0);
      if (beat.subType === 'tension') tensionDec = 0.35;
      this.tension = Math.max(0, this.tension - tensionDec);

      // flash and sfx
      let flashColor = '#5ad88a';
      let text = 'GOOD';
      let textColor = '#5ad88a';
      let sfxName: SfxName = 'guard';

      if (rating === 'perfect') {
        flashColor = '#ff7ad8';
        text = '⭐ PERFECT!';
        textColor = '#ff7ad8';
        sfxName = 'crit';
        this.haulImpulse = 1.0; this.reelCrankVel += 16; this.camZoomOffset = 1.5;
        this.fishBreachTimer = Math.min(this.fishBreachTimer, 0.05);
      } else if (rating === 'great') {
        flashColor = '#5ab8e8';
        text = 'GREAT!';
        textColor = '#5ab8e8';
        sfxName = 'hit';
        this.haulImpulse = Math.max(this.haulImpulse, 0.7); this.reelCrankVel += 11;
      } else {
        this.haulImpulse = Math.max(this.haulImpulse, 0.4); this.reelCrankVel += 7;
      }

      if (beat.subType === 'golden') {
        flashColor = '#ffd700';
        text = '🌟 GOLD';
        textColor = '#ffd700';
        sfxName = 'fanfare';
      } else if (beat.subType === 'fire') {
        flashColor = '#ff4500';
        text = '🔥 FIRE BLAST!';
        textColor = '#ff4500';
        sfxName = 'boom';
      } else if (beat.subType === 'tension') {
        flashColor = '#00f5ff';
        text = '🍃 RECOVERY';
        textColor = '#00f5ff';
        sfxName = 'confirm';
      } else if (beat.subType === 'speedy') {
        flashColor = '#ffff00';
        text = '⚡ SPEEDY!';
        textColor = '#ffff00';
      } else if (beat.subType === 'chaos') {
        flashColor = '#9400d3';
        text = '🌀 CHAOS!';
        textColor = '#9400d3';
      } else if (beat.subType === 'slow') {
        flashColor = '#e066ff';
        text = '⏱️ SLOW!';
        textColor = '#e066ff';
      }

      this.flashReceptor(beat.lane, flashColor);
      sfx(sfxName);

      // Floaty text
      let floatyStr = `${text} +${pointsEarned}`;
      if (chainMult > 1.0 && rating === 'perfect') {
        floatyStr += ` (×${chainMult} Chain!)`;
      }
      this.triggerFloatyText(floatyStr, textColor);

      // Receptor explosion animation
      const laneEl = this.meterBox.querySelector(`#lane-notes-${beat.lane}`);
      if (laneEl) {
        const expl = document.createElement('div');
        expl.className = 'rhythm-explosion';
        expl.style.borderColor = flashColor;
        laneEl.appendChild(expl);
        setTimeout(() => expl.remove(), 400);
      }
    } else {
      this.tension += 0.11 * line.tensionRateBonus;
      this.reelProgress = Math.max(0, this.reelProgress - 0.04);
      this.playerStamina = Math.max(0, this.playerStamina - 0.12);
      if (this.playerStamina <= 0) this.exhaustedTimer = 1.4;
      this.camShake = Math.max(this.camShake, 0.5);
      this.flashReceptor(beat.lane, '#ff5a6a');
      this.triggerFloatyText('❌ MISS!', '#ff5a6a');
      sfx('cancel');
      this.stumble = 1.0; this.haulImpulse = 0;
    }

    if (rating !== 'miss') {
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const callouts: Record<number, string> = {
        5: '🔥 ON FIRE!', 10: '⚡ UNSTOPPABLE!', 20: '🌊 MASTER ANGLER!', 50: '🌈 LEGENDARY STREAK!',
      };
      if (callouts[this.combo]) {
        this.triggerFloatyText(callouts[this.combo], '#ffd25a');
        sfx('fanfare');
        this.camShake = Math.max(this.camShake, 0.4);
      }
    }
    this.updateComboDisplay();
  }

  private updateComboDisplay(): void {
    const comboEl = this.meterBox.querySelector('#rhythm-combo') as HTMLElement;
    if (!comboEl) return;
    if (this.combo >= 2) {
      comboEl.style.display = 'flex';
      const numEl = comboEl.querySelector('.combo-num') as HTMLElement;
      const labelEl = comboEl.querySelector('.combo-label') as HTMLElement;
      if (numEl) {
        if (this.perfectStreak >= 3) {
          numEl.textContent = `${this.combo}× COMBO (🔥 P-CHAIN ×${this.perfectStreak})`;
        } else {
          numEl.textContent = `${this.combo}× COMBO`;
        }
      }
      let label = 'KEEP IT UP';
      if (this.perfectStreak >= 10) label = '⚡ PERFECT CHAIN ×10+ (2.0x MULT!)';
      else if (this.perfectStreak >= 5) label = '🔥 PERFECT CHAIN ×5+ (1.5x MULT!)';
      else if (this.perfectStreak >= 3) label = '✨ PERFECT CHAIN ×3+ (1.25x MULT!)';
      else if (this.combo >= 50) label = 'LEGENDARY STREAK!';
      else if (this.combo >= 20) label = 'MASTER ANGLER!';
      else if (this.combo >= 10) label = 'UNSTOPPABLE!';
      else if (this.combo >= 5) label = 'ON FIRE!';
      if (labelEl) labelEl.textContent = label;
      comboEl.style.animation = 'none'; void comboEl.offsetHeight;
      comboEl.style.animation = 'combopulse 0.18s cubic-bezier(0.175,0.885,0.32,1.275)';
    } else {
      comboEl.style.display = 'none';
    }
  }

  private quitRequested = false;

  // ============================================================
  //  THE GAMEPLAY LOOP
  // ============================================================
  async run(): Promise<void> {
    hideHUD();
    (window as unknown as Record<string, unknown>).__fishing = { view: this.view, instance: this }; // debug handle
    this.buildDom();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerdown', this.onPointer);
    playMusic('fishing');

    if (!this.fs.seenIntro) {
      this.fs.seenIntro = true;
      this.player.save();
      await conversation([
        ['Old Bait Pete', `Welcome to the Great Pond, ${this.player.tamerName}! Finest fishing in all of Haven City. Let me give you the quick of it.`],
        ['Old Bait Pete', 'Watch the water — those dark shapes are FISH. Bigger shadow, bigger fish. A colored glow under the surface? That\'s something RARE. Cast near \'em.'],
        ['Old Bait Pete', 'Press SPACE to set your cast power. Wait for a bite, then SPACE again to STRIKE — time it in the green to set the hook!'],
        ['Old Bait Pete', 'Then the real fight! Notes come racing down four lanes — hit them ON THE BEAT: A and D to counter its left/right runs, SPACE to reel, E to haul, and HOLD SPACE for the long power-pulls. Nail the timing for PERFECTs, chain COMBOS, and watch that tension bar — too many misses and SNAP goes the line!'],
        ['Old Bait Pete', 'Every fish fights different — a lazy carp, a frenzied tuna, a multi-stage leviathan. Land beauties to score big, climb the leaderboard and fill the Encyclopedia. Now — tight lines!'],
      ]);
    }

    this.updateHud();
    await this.loop();

    // teardown
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerdown', this.onPointer);
    this.teardownDom();
    this.dispose();
  }

  private async loop(): Promise<void> {
    this.streakFailsafeUsed = false;
    while (!this.quitRequested) {
      this.updateHud();
      // PHASE 1 — CAST
      const cast = await this.doCast();
      if (this.quitRequested) break;

      // PHASE 2 — WAIT for a bite
      const bit = await this.doWait();
      if (this.quitRequested) break;
      if (!bit.bite) {
        this.retractLine();
        await this.flashPrompt(bit.reason ?? 'Nothing biting… reel in and try again.', 900);
        continue;
      }

      // PHASE 3 — HOOK
      const fish = bit.fish!;
      this.fightFish = fish;
      const rare = RARITY[fish.rarity].rareMusic;
      playMusic(rare ? 'fishing_hooked_rare' : 'fishing_hooked');
      const hook = await this.doHook();
      if (hook === 'miss') {
        sfx('cancel');
        this.retractLine();
        playMusic('fishing');
        await this.flashPrompt('It got away! The line went slack…', 1100);
        this.fs.streak = 0;
        continue;
      }

      // PHASE 4 — FIGHT
      this.fightStartMs = performance.now();
      const won = await this.doFight(fish, hook);
      if (!won) {
        sfx('boom');
        this.retractLine();
        playMusic('fishing');
        await this.flashPrompt('💥 The line SNAPPED! It was too strong…', 1300);
        this.fs.streak = 0;
        continue;
      }

      // PHASE 5 — LAND
      const landed = await this.doLand(fish);
      const battleMs = performance.now() - this.fightStartMs;
      if (!landed) {
        sfx('cancel');
        this.retractLine();
        playMusic('fishing');
        await this.flashPrompt('So close! It slipped the hook at the last second…', 1200);
        this.fs.streak = 0;
        continue;
      }

      // SUCCESS — roll the catch's size once, then showcase + score
      let sizeMult = 1.0;
      if (this.fs.equippedBait === 'golden_beetle') sizeMult *= 1.2;
      if (this.fs.equippedLine === 'lead_core') sizeMult *= 1.15;
      const size = rollSize(fish, this.rnd, sizeMult);
      await this.celebrate(fish, size, battleMs);
      const choice = await this.summarize(fish, size, cast, hook, battleMs);
      this.retractLine();
      if (choice === 'quit') break;
      playMusic('fishing');
      // a fresh cast keeps current gear; refresh water population a bit
      if (this.rnd() < 0.4) { this.spawnShadow(); if (this.shadows.length > 9) disposeFish(this.shadows.shift()!.grp); }
    }
  }

  // ---------- PHASE 1: CAST ----------
  private async doCast(): Promise<{ distance: number; quality: number }> {
    this.phase = 'cast';
    this.castMeter = 0; this.castDir = 1; this.castAngle = 0;
    this.reticle.visible = true;
    this.showMeterBox('cast');
    this.setPrompt('Aim with <b>A/D / ←/→</b> · Press <b>SPACE</b> to cast!');
    await new Promise<void>(res => { this.castResolve = res; });
    this.phase = 'idle';
    this.reticle.visible = false;
    this.hideMeterBox();
    if (this.quitRequested) return { distance: 0, quality: 0 };

    const power = this.castMeter;
    // power → distance; the "sweet spot" near the top scores a precision cast
    const quality = power > 0.78 ? Math.min(1, (power - 0.78) / 0.22 + 0.6) : power * 0.6;
    this.castPower = power;
    this.castDistance = 3 + power * (this.castMax - 3);
    this.landX = Math.sin(this.castAngle) * this.castDistance;
    this.landZ = this.tamer.position.z - Math.cos(this.castAngle) * this.castDistance;

    // pick the shadow nearest the landing point — casting near it favors it
    let best: Shadow | null = null, bestD = 6;
    for (const sh of this.shadows) {
      const d = Math.hypot(sh.grp.position.x - this.landX, sh.grp.position.z - this.landZ);
      if (d < bestD) { bestD = d; best = sh; }
    }
    this.targetShadow = bestD < 3.2 ? best : null;

    this.isPerfectAim = bestD < 1.0;
    if (this.isPerfectAim && this.targetShadow) {
      this.triggerFloatyText('★ PERFECT CAST!', '#ffd25a');
      sfx('crit');
    }

    sfx('whoosh');
    await this.animateCast();
    return { distance: this.castDistance, quality };
  }

  private async animateCast(): Promise<void> {
    this.phase = 'flying';
    const armR = this.tamer.getObjectByName('armR');
    const armL = this.tamer.getObjectByName('armL');
    const pelvis = this.tamer.getObjectByName('pelvis');
    const torso = this.tamer.getObjectByName('torso');
    const head = this.tamer.getObjectByName('head');

    // STAGE 1 — coil: rod up & back over the shoulder, body winds up
    sfx('whoosh');
    await tween(0.30, t => {
      if (armR) { armR.rotation.x = -0.6 - t * 2.1; armR.rotation.z = -t * 0.3; }
      if (armL) armL.rotation.x = -0.5 - t * 0.4;
      if (pelvis) pelvis.rotation.y = t * 0.45;
      if (torso) torso.rotation.y = -t * 0.35;
      if (head) head.rotation.y = -t * 0.3;
      if (this.rod) this.rod.rotation.x = -0.5 + t * 0.4;
    }, Ease.outQuad);

    // STAGE 2 — whip: explosive forward sweep with a spincast twirl of the rod
    const tipW = new THREE.Vector3(); this.rodTip.getWorldPosition(tipW);
    this.bobber.position.copy(tipW);
    this.bobber.visible = true;
    sfx('whoosh');
    await tween(0.20, t => {
      if (armR) { armR.rotation.x = -2.7 + t * 2.9; armR.rotation.z = -0.3 + t * 0.3; }
      if (pelvis) pelvis.rotation.y = 0.45 - t * 0.65;
      if (torso) torso.rotation.y = -0.35 + t * 0.5;
      if (this.rod) this.rod.rotation.y = t * Math.PI * 2; // the reel/rod spins
    }, Ease.inQuad);
    if (this.rod) this.rod.rotation.y = 0;

    // STAGE 3 — the bobber sails out on its arc; the body uncoils & follows through
    const start = new THREE.Vector3(); this.rodTip.getWorldPosition(start);
    const end = new THREE.Vector3(this.landX, 0.12, this.landZ);
    sfx('whoosh');
    await tween(0.5, t => {
      this.bobber.position.x = start.x + (end.x - start.x) * t;
      this.bobber.position.z = start.z + (end.z - start.z) * t;
      const arc = Math.sin(t * Math.PI) * (2.2 + this.castDistance * 0.16);
      this.bobber.position.y = start.y + (end.y - start.y) * t + arc;
      if (armR) armR.rotation.x = 0.2 - t * 0.7;
      if (armL) armL.rotation.x = -0.9 + t * 0.4;
      if (pelvis) pelvis.rotation.y = -0.2 + t * 0.2;
      if (torso) torso.rotation.y = 0.15 - t * 0.15;
      if (head) head.rotation.y = -0.3 + t * 0.3;
    }, Ease.linear);

    this.bobberAnchor.copy(end);
    this.bobber.position.copy(end);
    makeSplash(this.scene, end.x, 0.05, end.z, 1.1);
    makeRipple(this.scene, end.x, 0.05, end.z);
    sfx('splash');
  }

  // ---------- PHASE 2: WAIT ----------
  private async doWait(): Promise<{ bite: boolean; fish?: SpeciesDef; reason?: string }> {
    this.phase = 'wait';
    this.setPrompt('🎣 Waiting for a bite…');
    const ctx = this.context(this.targetShadow?.sp.id ?? null, this.castPower);
    // perfect cast forces immediate inspection/approach
    const approachChance = this.isPerfectAim ? 1.0 : (0.55 + (this.targetShadow ? 0.3 : 0) + ctx.bait.rareBoost * 0.1 + (ctx.bait.id === 'chum_bucket' ? 0.25 : 0));
    const baseWait = this.isPerfectAim ? 0.2 : (1.6 + this.rnd() * 2.8);
    const waitTime = baseWait / (0.7 + ctx.bait.rareBoost * 0.4 + (this.targetShadow ? 0.6 : 0));

    const waited = await this.waitInterruptible(waitTime);
    if (waited === 'quit') return { bite: false };

    if (this.rnd() > approachChance) {
      return { bite: false, reason: 'Nothing\'s interested… try casting nearer a shadow.' };
    }

    // a fish swims to inspect — move the target shadow (or a fresh roll) to the bobber
    const fish = rollFish(ctx, this.rnd);
    let inspector = this.targetShadow;
    if (!inspector) { this.spawnShadow(); inspector = this.shadows[this.shadows.length - 1]; inspector.sp = fish; }
    this.targetShadow = inspector;
    await this.swimShadowTo(inspector, this.bobberAnchor.x, this.bobberAnchor.z);
    if (this.quitRequested) return { bite: false };

    // inspect: it may ignore the bait
    const biteChance = this.isPerfectAim ? 1.0 : (0.62 + ctx.bait.rareBoost * 0.15 + this.castPower * 0.15);
    this.setPrompt('👀 A fish is inspecting the bait…');
    const insp = await this.waitInterruptible(this.isPerfectAim ? 0.1 : (0.7 + this.rnd() * 0.8));
    if (insp === 'quit') return { bite: false };
    if (this.rnd() > biteChance) {
      return { bite: false, reason: 'It nosed the bait… and swam off. Cheeky.' };
    }

    // Nibbling sequence before the real bite
    const isRare = fish.rarity === 'Elite' || fish.rarity === 'Legendary' || fish.rarity === 'Mythical';
    if (isRare) {
      this.triggerFloatyText('🚨 UNUSUAL RIPPLES DETECTED!', '#ffd25a');
      sfx('charge');
    }

    const nibbleCount = this.isPerfectAim ? 1 : Math.floor(1 + this.rnd() * 3);
    for (let i = 0; i < nibbleCount; i++) {
      this.setPrompt(`👀 A fish is nibbling… (Wait for the bite!)`);
      const delay = 0.5 + this.rnd() * 0.7;
      
      // Check for early hook trigger during wait
      const start = performance.now();
      let earlyTrigger = false;
      while (performance.now() - start < delay * 1000) {
        if (this.quitRequested) return { bite: false };
        if (this.keys.has('space')) {
          earlyTrigger = true;
          break;
        }
        await new Promise(r => setTimeout(r, 60));
      }

      if (earlyTrigger) {
        sfx('cancel');
        this.keys.delete('space');
        this.triggerFloatyText('⚠️ FISH SPOOKED!', '#ff5a6a');
        return { bite: false, reason: 'You reeled too early and spooked the fish!' };
      }

      // Bounce bobber for nibble!
      this.bobber.position.y = this.bobberAnchor.y - 0.07;
      makeSplash(this.scene, this.bobberAnchor.x, 0.05, this.bobberAnchor.z, 0.22);
      sfx('click');

      setTimeout(() => {
        if (this.phase === 'wait') {
          this.bobber.position.y = this.bobberAnchor.y;
        }
      }, 150);
    }

    // BITE!
    this.phase = 'bite';
    this.bobber.position.y = this.bobberAnchor.y - 0.26;
    makeSplash(this.scene, this.bobberAnchor.x, 0.05, this.bobberAnchor.z, 1.1);
    sfx('splash');
    return { bite: true, fish };
  }

  private async swimShadowTo(sh: Shadow, x: number, z: number): Promise<void> {
    const sx = sh.grp.position.x, sz = sh.grp.position.z;
    sh.grp.rotation.y = Math.atan2(x - sx, z - sz) + Math.PI / 2;
    await tween(0.9, t => {
      sh.grp.position.x = sx + (x - sx) * t;
      sh.grp.position.z = sz + (z - sz) * t;
    }, Ease.inOut);
  }

  // ---------- PHASE 3: HOOK ----------
  private async doHook(): Promise<HookResult> {
    this.phase = 'hook';
    this.hookT = 0; this.hookDir = 1;
    this.showMeterBox('hook');
    this.setPrompt('❗ <b>STRIKE!</b> Press <b>SPACE</b> in the green to set the hook!');
    sfx('blip');

    // the rod snaps as he SETS the hook — a hard reactive jerk, then settle
    const hkArmR = this.tamer.getObjectByName('armR');
    const hkPelvis = this.tamer.getObjectByName('pelvis');
    sfx('hit');
    tween(0.13, t => {
      if (hkArmR) hkArmR.rotation.x = -0.6 - t * 1.3;
      if (this.rod) this.rod.rotation.x = -0.5 - t * 0.8;
      if (hkPelvis) hkPelvis.rotation.x = -t * 0.22;
    }, Ease.outQuad).then(() => tween(0.5, t => {
      if (hkArmR) hkArmR.rotation.x = -1.9 + t * 1.3;
      if (this.rod) this.rod.rotation.x = -1.3 + t * 0.8;
      if (hkPelvis) hkPelvis.rotation.x = -0.22 + t * 0.22;
    }, Ease.outQuad));

    // cinematic zoom-in on hook moment
    const oldCamPos = this.camera.position.clone();
    const targetCamPos = new THREE.Vector3(this.bobber.position.x, 2.5, this.bobber.position.z + 4.0);
    tween(0.4, t => {
      this.camera.position.lerp(targetCamPos, t);
      this.camera.lookAt(this.bobber.position);
    });

    // give the player a limited window — if the marker bounces 2 full passes with no press, it's a miss
    const result = await Promise.race([
      new Promise<HookResult>(res => { this.hookResolve = res; }),
      this.timeout(2.6).then<HookResult>(() => 'miss'),
    ]);
    this.hookResolve = null;
    this.phase = 'idle';
    this.hideMeterBox();
    
    // return camera to standard if we missed
    if (result === 'miss') {
      tween(0.4, t => {
        this.camera.position.lerp(oldCamPos, t);
        this.camera.lookAt(0, 1.0, -6);
      });
    }
    return result;
  }

  private evalHook(): HookResult {
    const rod = RODS[this.fs.equippedRod] ?? RODS.beginner;
    const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
    const isWhisper = rod.id === 'angler_whisper';
    const widthMult = (isWhisper ? 1.5 : 1.0) + line.perfectWidthBonus;
    
    const v = this.hookT; // 0..1, sweet spot centered at 0.5
    const d = Math.abs(v - 0.5);

    // Critical hook check! An extremely narrow window at the absolute center
    if (d < 0.02 * widthMult) {
      this.triggerFloatyText('🎯 CRITICAL HOOK!', '#ff7ad8');
      sfx('fanfare');
      return 'perfect';
    }
    if (d < 0.07 * widthMult) { sfx('crit'); return 'perfect'; }
    if (d < 0.18 * widthMult) { sfx('hit'); return 'good'; }
    if (d < 0.32 * widthMult) { sfx('guard'); return 'weak'; }
    return 'miss';
  }

  // ---------- PHASE 4: FIGHT ----------
  private async doFight(fish: SpeciesDef, hook: HookResult): Promise<boolean> {
    this.phase = 'fight';
    this.fightT = 0;
    this.fightFish = fish;
    this.fightStartMs = performance.now();

    // rhythm-highway state reset
    this.activeBeats = [];
    this.beatQueue = fish.signature ? [...fish.signature] : [];
    this.beatSpawnTimer = 0.7;       // a beat of breathing room before notes start
    this.combo = 0; this.maxCombo = 0;
    this.perfectHits = 0; this.greatHits = 0; this.goodHits = 0;
    this.missesCount = 0; this.buttonMashesCount = 0;
    this.beatIdCounter = 0;
    this.bossPhase = 1;
    this.lastTapLane = LANE_HAUL;
    this.perfectStreak = 0;
    this.specialScoreBonus = 0;

    const p = personalityOf(fish);
    this.totalBossPhases = p.phases;
    this.baseBeatTimeMult = 1.0;
    this.baseGapMult = 1.0;
    this.nextBeatIsFeint = false;
    this.burstCountRemaining = 0;
    this.isHoldingSpace = false;
    this.camZoomOffset = 0;
    this.targetHitFlashTimer = 0;

    // starting stats — a clean hook stuns the fish & gives a head start
    this.reelProgress = hook === 'perfect' ? 0.12 : hook === 'good' ? 0.05 : 0;
    this.tension = 0.20;
    this.playerStamina = 1.0;
    this.fishStamina = hook === 'perfect' ? 0.80 : 1.0;
    this.exhaustedTimer = 0;
    this.hookQuality = hook;

    // angler + fish animation reset → snap into the fighting stance
    this.prevRodLean = 0;
    this.anglerHaul = 0; this.haulImpulse = 0; this.leanX = 0; this.leanXTarget = 0;
    this.stumble = 0; this.reelCrank = 0; this.reelCrankVel = 0; this.bodyNeutral = 0;
    this.fishDart = 0; this.fishDartTarget = 0; this.fishDive = 0;
    this.fishBreach = 0; this.fishBreachTimer = 2.2;

    // a real fish now thrashes at the surface — hide the flat shadow silhouette
    if (this.targetShadow) this.targetShadow.grp.visible = false;
    this.spawnFightFish(fish);

    this.showMeterBox('fight');
    this.setPrompt(`🎣 <b>REEL IT IN!</b> Hit the notes on the beat — <b>${PERSONALITIES[p.id].name}</b> fighter!`);

    const isLegend = rarityRank(fish.rarity) >= 4;
    if (isLegend && this.speedLinesDOM) this.speedLinesDOM.classList.add('active');

    const won = await new Promise<boolean>(res => { this.fightResolve = res; });

    if (this.speedLinesDOM) this.speedLinesDOM.classList.remove('active');
    for (const b of this.activeBeats) b.dom?.remove();
    this.activeBeats = [];
    this.fightResolve = null;
    this.bodyNeutral = 1;            // relax the body again
    this.disposeFightFish();
    if (this.targetShadow) this.targetShadow.grp.visible = true; // restore the silhouette
    this.isHoldingSpace = false;
    this.phase = 'idle';
    this.hideMeterBox();
    return won;
  }

  /** Build the live, breaching fish model that fights at the surface. */
  private spawnFightFish(fish: SpeciesDef): void {
    this.disposeFightFish();
    const m = makeFish(fish);
    const len = Math.min(2.2, 0.5 + fish.lengthCm[1] / 150);
    m.scale.setScalar(len);
    m.position.copy(this.bobber.position);
    m.position.y = -0.25;
    this.scene.add(m);
    this.fightFishModel = m;
  }
  private disposeFightFish(): void {
    if (this.fightFishModel) { disposeFish(this.fightFishModel); this.fightFishModel = null; }
  }

  private tickFight(dt: number): void {
    const fish = this.fightFish!;
    const p = personalityOf(fish);
    const rod = RODS[this.fs.equippedRod] ?? RODS.beginner;
    const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
    const windowLimit = p.window * 1.6;
    const now = this.elapsed;       // update() already advanced elapsed this frame
    this.fightT += dt;

    // 1. Stamina / exhaustion
    if (this.exhaustedTimer > 0) {
      this.exhaustedTimer -= dt;
      this.playerStamina = Math.min(1.0, this.playerStamina + 0.12 * dt);
    } else if (this.isHoldingSpace) {
      this.playerStamina = Math.max(0, this.playerStamina - 0.09 * dt);
      if (this.playerStamina <= 0) {
        this.triggerFloatyText('EXHAUSTED!', '#ff5a6a'); sfx('cancel');
        this.exhaustedTimer = 1.4; this.isHoldingSpace = false;
        const h = this.activeBeats.find(b => b.type === 'hold' && b.isHolding && !b.hit);
        if (h) this.registerBeatResult(h, 'miss');
      }
    } else {
      this.playerStamina = Math.min(1.0, this.playerStamina + 0.18 * dt);
    }

    // 2. The fish is ALWAYS pulling — tension constantly creeps up, harder for tougher fish
    const pull = 0.5 + fish.fight.strength * 0.06 + fish.fight.aggression * 0.03 + (this.bossPhase - 1) * 0.25;
    this.tension += pull * 0.045 * dt * line.tensionRateBonus;
    // a little natural give from the rod/line
    this.tension = Math.max(0, this.tension - (0.018 + rod.lineStrength * 0.01 * line.strengthBonus) * dt);

    // 3. Advance falling notes; resolve expiries, feints and sustained holds
    for (const beat of this.activeBeats) {
      if (beat.hit) continue;
      if (beat.isHolding) {
        // riding a power-hold — once the sustain is ridden out it's a perfect haul
        if (now >= beat.targetTime + beat.holdDur) { this.registerBeatResult(beat, 'perfect'); continue; }
        this.reelProgress += 0.05 * dt;     // steady gain while hauling
        if (beat.dom) {
          const fill = beat.dom.querySelector('.note-fill') as HTMLElement | null;
          if (fill) fill.style.height = `${Math.min(100, ((now - (beat.holdStartTime ?? now)) / Math.max(0.01, beat.holdDur)) * 100)}%`;
        }
        continue;
      }
      if (now > beat.targetTime + windowLimit) {
        if (beat.isFeint) {                 // dodged the decoy by NOT pressing
          beat.hit = true; beat.dom?.remove(); beat.dom = undefined;
          this.perfectHits++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.perfectStreak++;
          const fakePoints = Math.round(100 * (this.perfectStreak >= 10 ? 2.0 : this.perfectStreak >= 5 ? 1.5 : this.perfectStreak >= 3 ? 1.25 : 1.0));
          this.specialScoreBonus += fakePoints;
          this.tension = Math.max(0, this.tension - 0.06);
          this.triggerFloatyText(`✨ READ THE FAKE! +${fakePoints}`, '#5ad88a'); sfx('confirm');
          this.updateComboDisplay();
        } else {
          this.registerBeatResult(beat, 'miss');
        }
        continue;
      }
      // position the note as it falls toward the receptor
      if (beat.dom) {
        let prog = (now - beat.timeSpawned) / beat.duration; // 0 at top, 1 at receptor
        if (beat.subType === 'chaos') {
          prog = Math.pow(Math.max(0, Math.min(1, prog)), 2.2);
        }
        beat.dom.style.top = `${prog * RECEPTOR_PCT}%`;
        beat.dom.classList.toggle('near', Math.abs(now - beat.targetTime) < p.window);
      }
    }
    this.activeBeats = this.activeBeats.filter(b => { if (b.hit) { b.dom?.remove(); return false; } return true; });

    // 4. Spawn the next note on the steady beat
    this.beatSpawnTimer -= dt;
    if (this.beatSpawnTimer <= 0) {
      let type: BeatType = this.beatQueue.length > 0 ? this.beatQueue.shift()! : this.rollBeatType(p);
      const isFeint = type !== 'hold' && Math.random() < p.feint;
      
      let subType: ActiveBeat['subType'] = 'normal';
      let speedMult = 1.0;
      if (!isFeint) {
        if (Math.random() < 0.20) {
          const roll = Math.random();
          if (roll < 0.20) {
            subType = 'golden';
          } else if (roll < 0.40) {
            subType = 'fire';
          } else if (roll < 0.55) {
            subType = 'tension';
          } else if (roll < 0.70) {
            subType = 'speedy';
            speedMult = 1.4;
          } else if (roll < 0.85) {
            subType = 'slow';
            speedMult = 0.7;
          } else {
            subType = 'chaos';
          }
        }
      }

      const duration = (p.beatTime * this.baseBeatTimeMult) / speedMult;
      const lane = this.laneForBeat(type);
      const holdDur = type === 'hold' ? Math.max(0.45, Math.min(0.9, p.beatTime * 0.7)) : 0;

      this.beatIdCounter++;
      const beat: ActiveBeat = {
        id: this.beatIdCounter, type, lane, isFeint,
        timeSpawned: now, targetTime: now + duration, duration, holdDur,
        hit: false, isHolding: false,
        subType,
      };
      beat.dom = this.buildNoteDom(beat);
      this.activeBeats.push(beat);

      // the fish lunges the way the next directional note points
      if (type === 'left') this.fishDartTarget = -1;
      else if (type === 'right') this.fishDartTarget = 1;

      if (this.burstCountRemaining > 0) { this.burstCountRemaining--; this.beatSpawnTimer = p.beatTime * 0.32; }
      else if (Math.random() < p.burst) { this.burstCountRemaining = 1 + Math.floor(Math.random() * 2); this.beatSpawnTimer = p.beatTime * 0.32; }
      else this.beatSpawnTimer = p.gap * this.baseGapMult;
    }

    // 5. Win / loss / boss-phase transitions
    if (this.tension >= 1) {
      sfx('boom'); this.camShake = 1.2;
      this.fishBreach = 0;
      this.fightResolve?.(false); this.fightResolve = null; return;
    }
    if (this.reelProgress >= 1) {
      if (this.bossPhase < this.totalBossPhases) {
        this.bossPhase++;
        this.baseBeatTimeMult *= 0.86; this.baseGapMult *= 0.86;
        this.reelProgress = 0.28; this.fishStamina = 1.0; this.playerStamina = 1.0;
        for (const b of this.activeBeats) b.dom?.remove();
        this.activeBeats = [];
        this.beatQueue = fish.signature ? [...fish.signature] : [];
        this.beatSpawnTimer = 1.4;
        this.camShake = 1.25; this.bossPhaseTransitionTimer = 1.8;
        this.fishBreachTimer = 0.05;        // it erupts out of the water
        sfx('charge'); sfx('fanfare');
        this.triggerFloatyText(`🌊 IT'S NOT DONE — STAGE ${this.bossPhase}!`, '#b18ae8');
        makeSplash(this.scene, this.bobber.position.x, 0.05, this.bobber.position.z, 2.4);
      } else {
        this.fightResolve?.(true); this.fightResolve = null; return;
      }
    }

    // 6. Drag the catch shoreward as the reel fills
    const playerPos = new THREE.Vector3(this.tamer.position.x, 0.12, this.tamer.position.z - 0.4);
    this.bobber.position.lerpVectors(this.bobberAnchor, playerPos, this.reelProgress);

    // 7. Drive the live fish + the angler's whole body
    this.updateFightFish(dt, fish);
    this.updateAnglerPose(dt);
    this.renderFightMeter();
  }

  private rollBeatType(p: PersonalityDef): BeatType {
    const mix = p.mix;
    const total = mix.tap + mix.dir + mix.hold;
    const roll = Math.random() * total;
    if (roll < mix.tap) return 'tap';
    if (roll < mix.tap + mix.dir) return Math.random() < 0.5 ? 'left' : 'right';
    return 'hold';
  }

  /** Pick which highway lane a beat falls down. Taps alternate between the two reel lanes. */
  private laneForBeat(type: BeatType): number {
    if (type === 'left') return LANE_LEFT;
    if (type === 'right') return LANE_RIGHT;
    if (type === 'hold') return LANE_REEL;
    this.lastTapLane = this.lastTapLane === LANE_REEL ? LANE_HAUL : LANE_REEL;
    return this.lastTapLane;
  }

  /** Build a falling-note element inside its lane. */
  private buildNoteDom(beat: ActiveBeat): HTMLElement | undefined {
    const laneEl = this.meterBox.querySelector(`#lane-notes-${beat.lane}`);
    if (!laneEl) return undefined;
    const L = LANES[beat.lane];
    const note = document.createElement('div');
    const subTypeClass = beat.subType && beat.subType !== 'normal' ? ` ${beat.subType}` : '';
    note.className = `dn dn-lane${beat.lane}${beat.type === 'hold' ? ' dn-hold' : ''}${beat.isFeint ? ' dn-feint' : ''}${subTypeClass}`;
    note.style.setProperty('--dn-color', beat.isFeint ? '#ff5a6a' : L.color);
    note.style.setProperty('--dn-glow', beat.isFeint ? 'rgba(255,90,106,0.6)' : L.glow);
    note.style.top = '0%';

    let glyph = L.glyph;
    if (beat.type === 'hold') {
      glyph = '✊';
    }
    if (!beat.isFeint && beat.subType) {
      if (beat.subType === 'golden') glyph = '★';
      else if (beat.subType === 'fire') glyph = '🔥';
      else if (beat.subType === 'tension') glyph = '🍃';
      else if (beat.subType === 'speedy') glyph = '⚡';
      else if (beat.subType === 'slow') glyph = '⏱️';
      else if (beat.subType === 'chaos') glyph = '🌀';
    }
    if (beat.isFeint) {
      glyph = '✕';
    }

    if (beat.type === 'hold') {
      const h = Math.min(58, (beat.holdDur / beat.duration) * RECEPTOR_PCT);
      note.style.height = `calc(${h}% + 44px)`;
      note.innerHTML = `<div class="note-fill"></div><span class="dn-glyph">${glyph}</span>`;
    } else {
      note.innerHTML = `<span class="dn-glyph">${glyph}</span>`;
    }
    laneEl.appendChild(note);
    return note;
  }

  // ============================================================
  //  LIVE FISH + ANGLER PHYSICS (the visible fight)
  // ============================================================
  /** The hooked fish thrashes, darts and breaches at the surface as you reel. */
  private updateFightFish(dt: number, fish: SpeciesDef): void {
    const m = this.fightFishModel;
    if (!m) return;

    // lateral lunge eases toward the direction the fish is bolting
    this.fishDart += (this.fishDartTarget - this.fishDart) * Math.min(1, dt * 6);

    // periodic breach out of the water
    this.fishBreachTimer -= dt;
    if (this.fishBreachTimer <= 0 && this.fishBreach <= 0.01) {
      this.fishBreach = 1;
      this.fishBreachTimer = 2.6 + Math.random() * 2.6;
      makeSplash(this.scene, m.position.x, 0.05, m.position.z, 1.2 + fish.fight.strength * 0.08);
      sfx('splash');
      this.camShake = Math.max(this.camShake, 0.3);
    }
    this.fishBreach = Math.max(0, this.fishBreach - dt * 1.9);
    const breach = Math.sin(Math.min(1, this.fishBreach) * Math.PI); // 0→1→0 arc

    const dartAmp = 0.75 * (1 - this.reelProgress * 0.4);
    m.position.x = this.bobber.position.x + this.fishDart * dartAmp + Math.sin(this.elapsed * 7) * 0.08;
    m.position.z = this.bobber.position.z + Math.cos(this.elapsed * 5) * 0.06;
    const submerge = -0.30 + this.tension * 0.14;                 // a tense fish digs deeper
    m.position.y = submerge + breach * (1.1 + fish.fight.strength * 0.05);

    // wriggle hard, face away from the angler, pitch up on a breach
    const toAngler = Math.atan2(this.tamer.position.x - m.position.x, this.tamer.position.z - m.position.z);
    m.rotation.y = toAngler + Math.PI + Math.sin(this.elapsed * 16) * 0.4 + this.fishDart * 0.5;
    m.rotation.z = Math.sin(this.elapsed * 19) * 0.25 * (0.5 + this.tension);
    m.rotation.x = -breach * 0.6;
    swimFish(m, this.elapsed, 1.3 + this.tension * 1.6 + breach);

    // it churns the surface while it fights
    if (Math.random() < dt * (4 + this.tension * 8)) {
      makeSplash(this.scene, m.position.x + (Math.random() - 0.5) * 0.6, 0.05, m.position.z + (Math.random() - 0.5) * 0.6, 0.3 + this.tension * 0.5);
    }
  }

  /**
   * Drive the angler's whole body from the fight state — bracing legs, a
   * hauling rod arm, a cranking reel hand, a straining torso that trembles
   * under tension and lurches on a miss. Blends back to a relaxed stance
   * (bodyNeutral→1) between casts so he never freezes mid-heave.
   */
  private updateAnglerPose(dt: number): void {
    const get = (n: string) => this.tamer.getObjectByName(n);
    const armL = get('armL'), armR = get('armR'), legL = get('legL'), legR = get('legR'),
          torso = get('torso'), head = get('head'), pelvis = get('pelvis');

    const fighting = this.phase === 'fight';
    this.bodyNeutral += ((fighting ? 0 : 1) - this.bodyNeutral) * Math.min(1, dt * 4);
    const f = 1 - this.bodyNeutral;                       // 0 relaxed … 1 full fight

    // smooth the physical drivers
    const haulTarget = fighting ? Math.min(1.3, 0.32 + this.tension * 0.8 + (this.isHoldingSpace ? 0.35 : 0)) : 0;
    this.anglerHaul += (haulTarget - this.anglerHaul) * Math.min(1, dt * 6);
    this.haulImpulse *= Math.pow(0.00008, dt);            // snappy decay
    this.stumble *= Math.pow(0.00025, dt);
    this.leanX += (this.leanXTarget - this.leanX) * Math.min(1, dt * 7);
    this.leanXTarget *= Math.pow(0.2, dt);
    this.reelCrank += this.reelCrankVel * dt;
    this.reelCrankVel *= Math.pow(0.02, dt);

    const haul = this.anglerHaul + this.haulImpulse * 0.5;
    const tremor = this.tension > 0.55 ? Math.sin(this.elapsed * 38) * (this.tension - 0.5) * 0.12 : 0;
    const lean = this.leanX;

    // pelvis — lean back hauling, drop & brace, lurch forward on a miss
    if (pelvis) {
      pelvis.position.x = f * lean * 0.06;
      pelvis.position.y = 0.62 - f * (0.05 + haul * 0.05);
      pelvis.position.z = f * (-(0.05 + haul * 0.10) + this.stumble * 0.32);
      pelvis.rotation.x = f * (-(0.08 + haul * 0.20) + this.stumble * 0.55) + tremor * 0.25;
      pelvis.rotation.z = f * lean * 0.12;
      pelvis.rotation.y = f * lean * 0.10;
    }
    // legs braced wide — front foot toward the water, back leg driving
    if (legL) { legL.rotation.x = f * (0.42 + haul * 0.30 + this.stumble * 0.4); legL.rotation.z = f * 0.10; }
    if (legR) { legR.rotation.x = f * (-(0.34 + haul * 0.45)); legR.rotation.z = f * -0.10; }
    // torso twists into the pull
    if (torso) { torso.rotation.z = f * lean * 0.18; torso.rotation.y = f * lean * 0.16; torso.rotation.x = f * (-(0.05 + haul * 0.12)); }
    // rod arm hauls back hard (+ whip impulse + tremor)
    if (armR) {
      armR.rotation.x = -0.6 - f * (0.3 + haul * 0.7) - this.haulImpulse * 0.45 + tremor;
      armR.rotation.z = f * lean * 0.4;
      armR.rotation.y = f * lean * 0.2;
    }
    // off hand cranks the reel — winds faster right after a clean hit
    if (armL) {
      armL.rotation.x = -0.5 + Math.sin(this.reelCrank) * 0.5 * f - f * haul * 0.2;
      armL.rotation.z = 0.2 + Math.cos(this.reelCrank) * 0.35 * f;
    }
    // head fixed on the line, jolts on a heave
    if (head) { head.rotation.x = f * (0.18 + haul * 0.12) + this.haulImpulse * 0.12; head.rotation.y = f * lean * 0.2; }
    // the rod loads deep under tension, whips on impulse, trembles at the limit
    if (this.rod) {
      this.prevRodLean += (lean * 0.32 - this.prevRodLean) * Math.min(1, dt * 9);
      this.rod.rotation.x = -0.5 - f * (this.tension * 0.7 + haul * 0.3) - this.haulImpulse * 0.5 + tremor * 1.6;
      this.rod.rotation.z = 0.2 + f * this.prevRodLean;
    }
  }

  // ---------- PHASE 5: LAND ----------
  private async doLand(fish: SpeciesDef): Promise<boolean> {
    this.phase = 'land';
    this.showMeterBox('land');
    this.setPrompt('🪝 <b>SPACE</b> — land it! Quick!');
    sfx('charge');
    // a short window to confirm the landing
    let ok = await Promise.race([
      new Promise<boolean>(res => { this.landResolve = res; }),
      this.timeout(1.3).then(() => Math.random() < 0.7), // auto-land 70% if you freeze
    ]);
    
    const rod = RODS[this.fs.equippedRod] ?? RODS.beginner;
    const line = LINES[this.fs.equippedLine] ?? LINES.basic_mono;
    
    if (!ok) {
      if (rod.id === 'angler_whisper' && !this.streakFailsafeUsed) {
        this.streakFailsafeUsed = true;
        this.triggerFloatyText('🔥 FAILSAFE TRIGGERED!', '#ffd25a');
        sfx('fanfare');
        ok = true;
      } else if (line.id === 'siren_thread' && Math.random() < 0.5) {
        this.triggerFloatyText('🤫 SOOTHED BY THREAD!', '#ff7ad8');
        sfx('fanfare');
        ok = true;
      }
    }
    
    this.landResolve = null;
    this.phase = 'idle';
    this.hideMeterBox();
    return ok;
  }

  // ============================================================
  //  CELEBRATION + SHOWCASE
  // ============================================================
  private async celebrate(fish: SpeciesDef, size: { weightKg: number; lengthCm: number }, battleMs: number): Promise<void> {
    this.phase = 'showcase';
    const rd = RARITY[fish.rarity];
    const legendary = fish.rarity === 'Legendary';
    const armL = this.tamer.getObjectByName('armL'), armR = this.tamer.getObjectByName('armR');
    const pelvis = this.tamer.getObjectByName('pelvis'), torso = this.tamer.getObjectByName('torso');
    const head = this.tamer.getObjectByName('head');
    const legL = this.tamer.getObjectByName('legL'), legR = this.tamer.getObjectByName('legR');

    this.bobber.visible = false; this.line.visible = false;
    this.disposeFightFish();
    this.targetShadow = null;
    playMusic(legendary ? 'fishing_success_rare' : (rd.rareMusic ? 'fishing_success_rare' : 'fishing_success'));

    // the catch erupts from the water and gets hoisted high on the line
    const fishModel = makeFish(fish);
    fishModel.scale.setScalar(Math.min(2.6, 0.6 + size.lengthCm / 120));
    const fromPos = new THREE.Vector3(this.tamer.position.x, -0.3, this.tamer.position.z - 2.4);
    const hoistPos = new THREE.Vector3(this.tamer.position.x + 0.2, 2.7, this.tamer.position.z - 1.2);
    fishModel.position.copy(fromPos);
    fishModel.rotation.y = Math.PI;
    this.scene.add(fishModel);

    // STAGE 1 — THE HEAVE: one huge yank rips it clear of the water
    sfx(legendary ? 'boom' : 'splash');
    makeSplash(this.scene, fromPos.x, 0.05, fromPos.z, legendary ? 3.4 : rd.rareMusic ? 2.4 : 1.6, rd.glow ? 0xffffff : 0xdaf0ff);
    this.camShake = legendary ? 1.4 : 0.9;
    const camStart = this.camera.position.clone();
    await tween(0.5, t => {
      if (armR) armR.rotation.x = -0.6 - t * 1.7;
      if (armL) armL.rotation.x = -0.5 - t * 1.5;
      if (pelvis) { pelvis.rotation.x = -t * 0.42; pelvis.position.z = -t * 0.32; }
      if (legL) legL.rotation.x = t * 0.6;
      if (legR) legR.rotation.x = -t * 0.42;
      if (torso) torso.rotation.x = -t * 0.2;
      fishModel.position.lerpVectors(fromPos, hoistPos, Ease.outQuad(t));
      fishModel.position.y = fromPos.y + (hoistPos.y - fromPos.y) * t + Math.sin(t * Math.PI) * 0.9;
      fishModel.rotation.z = t * 1.3;
      swimFish(fishModel, this.elapsed, 1.8);
      this.camera.lookAt(this.tamer.position.x, 1.4, this.tamer.position.z - 1.2);
    }, Ease.inOut);

    // STAGE 2 — THE HOIST: rod & catch raised in triumph
    if (armR) tween(0.45, t => { armR.rotation.x = -2.3 - t * 0.3; }, Ease.outBack);
    if (armL) tween(0.45, t => { armL.rotation.x = -2.0 - t * 0.3; }, Ease.outBack);
    if (pelvis) tween(0.45, t => { pelvis.rotation.x = -0.42 + t * 0.42; pelvis.position.z = -0.32 + t * 0.32; });
    if (legL) tween(0.45, t => { legL.rotation.x = 0.6 - t * 0.6; });
    if (legR) tween(0.45, t => { legR.rotation.x = -0.42 + t * 0.42; });
    showShowcaseBanner(fish, size.weightKg, size.lengthCm);
    sfx(legendary ? 'fanfare' : 'confirm');

    // STAGE 3 — ORBIT hero shot around the hoisted catch
    const look = hoistPos.clone();
    const orbitDur = legendary ? 3.4 : 2.2;
    const radius = 4.6;
    await tween(orbitDur, t => {
      const ang = Math.PI * 0.5 + (t - 0.5) * 1.7;   // sweep ~95°
      this.camera.position.set(
        this.tamer.position.x + Math.sin(ang) * radius,
        2.0 + Math.sin(t * Math.PI) * 0.7,
        this.tamer.position.z + Math.cos(ang) * radius,
      );
      fishModel.position.y = hoistPos.y + Math.sin(t * Math.PI * 3) * 0.12;
      fishModel.rotation.y = Math.PI + Math.sin(t * Math.PI * 2) * 0.5;
      fishModel.rotation.z = Math.sin(t * Math.PI * 4) * 0.2;
      swimFish(fishModel, this.elapsed, 0.7);
      this.camera.lookAt(look);
      if (legendary && Math.random() < 0.08) makeSplash(this.scene, hoistPos.x + (Math.random() - 0.5) * 2, 0.6 + Math.random(), hoistPos.z, 1.6, 0xffe14a);
    }, Ease.inOut);

    hideShowcaseBanner();
    disposeFish(fishModel);

    // settle the camera & reset the body to a clean stance for the next cast
    const orbitEnd = this.camera.position.clone();
    if (armL) tween(0.4, t => { armL.rotation.x = -2.3 + t * 1.7; });
    if (armR) tween(0.4, t => { armR.rotation.x = -2.6 + t * 2.0; });
    await tween(0.6, t => {
      this.camera.position.lerpVectors(orbitEnd, camStart, t);
      this.camera.lookAt(0, 1.0, -6);
    }, Ease.inOut);
    if (pelvis) { pelvis.rotation.set(0, 0, 0); pelvis.position.set(0, 0.62, 0); }
    if (torso) torso.rotation.set(0, 0, 0);
    if (legL) legL.rotation.set(0, 0, 0);
    if (legR) legR.rotation.set(0, 0, 0);
    if (head) head.rotation.set(0, 0, 0);
    void battleMs;
  }

  private calculateGrade(): { grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C'; multiplier: number } {
    const totalBeats = this.perfectHits + this.greatHits + this.goodHits + this.missesCount;
    if (totalBeats === 0) return { grade: 'B', multiplier: 1.0 };

    const accuracy = (this.perfectHits * 1.0 + this.greatHits * 0.70 + this.goodHits * 0.40) / totalBeats;
    let score = Math.round(accuracy * 100);

    // misses penalty
    score -= this.missesCount * 6;
    
    // button mash penalty
    score -= Math.floor(this.buttonMashesCount * 1.5);
    
    // hook quality checks
    if (this.hookQuality === 'good') score -= 5;
    else if (this.hookQuality === 'weak') score -= 12;
    
    // combo bonus
    if (this.maxCombo >= 20) score += 10;
    else if (this.maxCombo >= 10) score += 5;
    
    score = Math.max(0, Math.min(100, score));

    // SSS requirements: >96% accuracy, no misses, no button mashes, perfect hook
    if (accuracy >= 0.96 && this.missesCount === 0 && this.buttonMashesCount === 0 && this.hookQuality === 'perfect') {
      return { grade: 'SSS', multiplier: 1.5 };
    }
    
    if (score >= 88) return { grade: 'SS', multiplier: 1.3 };
    if (score >= 76) return { grade: 'S', multiplier: 1.15 };
    if (score >= 62) return { grade: 'A', multiplier: 1.05 };
    if (score >= 48) return { grade: 'B', multiplier: 1.0 };
    return { grade: 'C', multiplier: 0.8 };
  }

  // ============================================================
  //  SCORING + PROGRESSION + LEADERBOARD
  // ============================================================
  private async summarize(fish: SpeciesDef, size: { weightKg: number; lengthCm: number; sizePct: number }, cast: { distance: number; quality: number }, hook: HookResult, battleMs: number): Promise<'again' | 'quit'> {
    this.phase = 'summary';
    const fs = this.fs;

    // discovery?
    const firstDiscovery = !fs.discovered[fish.id];
    fs.streak += 1;
    fs.bestStreak = Math.max(fs.bestStreak, fs.streak);

    const newDailyRecord = false; // computed after score
    const gradeResult = this.calculateGrade();
    const score = computeScore({
      sp: fish, sizePct: size.sizePct,
      battleMs, castDistance: cast.distance, castMax: this.castMax,
      perfectHook: hook === 'perfect', goodHook: hook === 'good',
      streak: fs.streak,
      firstDiscovery,
      legendaryEncounter: fish.rarity === 'Legendary',
      newDailyRecord,
      lineId: fs.equippedLine,
      fightGrade: gradeResult.grade,
      gradeMult: gradeResult.multiplier,
      rhythmBonusPoints: this.specialScoreBonus,
    });

    // update records
    const rec = fs.discovered[fish.id] ?? { count: 0, maxWeight: 0, maxLength: 0, bestScore: 0, firstAt: Date.now() };
    rec.count += 1;
    rec.maxWeight = Math.max(rec.maxWeight, size.weightKg);
    rec.maxLength = Math.max(rec.maxLength, size.lengthCm);
    rec.bestScore = Math.max(rec.bestScore, score.total);
    if (!rec.firstAt) rec.firstAt = Date.now();
    fs.discovered[fish.id] = rec;

    fs.totalCaught += 1;
    fs.lifetimeScore += score.total;
    fs.bestCatchScore = Math.max(fs.bestCatchScore, score.total);
    fs.dailyBest = Math.max(fs.dailyBest, score.total);
    if (fish.rarity === 'Legendary') fs.legendaryCount += 1;
    if (fish.rarity === 'Mythical') fs.mythicalCount += 1;

    // EXP + level (grade scales EXP payout!)
    let expGain = RARITY[fish.rarity].exp + Math.round(score.total * 0.02);
    expGain = Math.round(expGain * gradeResult.multiplier);
    const beforeLvl = fishingLevelFromExp(fs.exp);
    fs.exp += expGain;
    const afterLvl = fishingLevelFromExp(fs.exp);
    const leveledTo = afterLvl > beforeLvl ? afterLvl : null;

    // shard payout (grade scales shards payout!)
    let shardGain = Math.round((RARITY[fish.rarity].score * RARITY[fish.rarity].sell * 0.05) + size.sizePct * 30 + 10);
    shardGain = Math.round(shardGain * gradeResult.multiplier);
    if (fs.equippedRod === 'prismatic_rod') {
      shardGain = Math.round(shardGain * 1.25); // +25% shards!
    }
    this.player.shards += shardGain;

    // fish bag for cooking
    fs.caughtFishBag[fish.rarity] = (fs.caughtFishBag[fish.rarity] ?? 0) + 1;

    // hall of fame
    this.updateHallOfFame(fish, size, score.total, cast.distance, battleMs, fs.bestStreak);

    // leaderboard: simulate NPCs, then (re)rank the player
    const sim = simulateLeaderboard(fs, this.rnd);
    const prevRank = fs.bestRank;
    const rank = rankPlayer(fs, this.player.tamerName);
    const improvedBest = fs.bestRank === 0 || rank < fs.bestRank;
    if (improvedBest) fs.bestRank = rank;

    // achievements
    this.checkAchievements();

    // active title auto-advances with level
    fs.activeTitle = titleForLevel(afterLvl);

    this.player.save();

    const data: CatchSummaryData = {
      sp: fish, weightKg: size.weightKg, lengthCm: size.lengthCm, score,
      expGain, fishingLevel: afterLvl,
      expCur: fs.exp - fishingExpForLevel(afterLvl),
      expNext: fishingExpForLevel(afterLvl + 1) - fishingExpForLevel(afterLvl),
      leveledTo, shardGain, rank, isFirstDiscovery: firstDiscovery, streak: fs.streak,
      location: this.spotInfo.location, rodName: (RODS[fs.equippedRod] ?? RODS.beginner).name,
      baitName: (BAITS[fs.equippedBait] ?? BAITS.worm).name, timeLabel: worldClock.label,
      fightGrade: gradeResult.grade,
      gradeMult: gradeResult.multiplier,
      perfectHits: this.perfectHits,
      greatHits: this.greatHits,
      goodHits: this.goodHits,
      misses: this.missesCount,
      maxCombo: this.maxCombo,
    };

    const choice = await showCatchSummary(data);

    // milestone announcements (after summary so they don't overlap)
    if (leveledTo) {
      playMusic('fishing'); // brief restore for the jingle context
      await announceRank(`🎣 Fishing Level ${leveledTo}!<br><span style="font-size:0.6em">${titleForLevel(leveledTo)}</span>`, 'gold');
    }
    if (improvedBest || (prevRank > 20 && rank <= 20) || (prevRank === 0)) {
      const milestone = this.rankMilestone(rank, prevRank);
      if (milestone) await announceRank(milestone.msg, milestone.kind);
    }
    void sim;
    return choice;
  }

  private rankMilestone(rank: number, prevRank: number): { msg: string; kind: 'gold' | 'rainbow' } | null {
    const crossed = (n: number) => rank <= n && (prevRank === 0 || prevRank > n);
    if (crossed(1)) return { msg: '👑 Master of the Waters!<br><span style="font-size:0.55em">You are Rank #1 on the Great Pond!</span>', kind: 'rainbow' };
    if (crossed(3)) return { msg: '⭐ Legendary Angler Status Reached!<br><span style="font-size:0.55em">Top 3!</span>', kind: 'rainbow' };
    if (crossed(10)) return { msg: '🏆 Elite Fisher Status Reached!<br><span style="font-size:0.55em">Top 10!</span>', kind: 'gold' };
    if (crossed(20)) return { msg: '🎉 New Top 20 Angler Achieved!', kind: 'gold' };
    return null;
  }

  private updateHallOfFame(fish: SpeciesDef, size: { weightKg: number; lengthCm: number }, score: number, dist: number, battleMs: number, streak: number): void {
    const fof = this.fs.hallOfFame;
    const me = this.player.tamerName;
    const set = (k: string, value: number, detail: string, higher = true) => {
      const cur = fof[k];
      if (!cur || (higher ? value > cur.value : value < cur.value)) fof[k] = { value, holder: me, detail, at: Date.now() };
    };
    set('largest', size.weightKg, fish.name);
    set('longest_fish', size.lengthCm, fish.name);
    set('fastest', battleMs / 1000, fish.name, false);
    set('longest_cast', dist, fish.name);
    set('high_score', score, fish.name);
    set('legendary', this.fs.legendaryCount, 'Legendary fish landed');
    set('species', Object.keys(this.fs.discovered).length, 'species discovered');
    set('streak', streak, 'consecutive catches');
  }

  private checkAchievements(): void {
    for (const a of FISH_ACHIEVEMENTS) {
      if (!this.fs.achievements.includes(a.id) && a.check(this.fs)) {
        this.fs.achievements.push(a.id);
        toast(`${a.icon} Fishing Achievement: ${a.name}`, 'gold', 3200);
        sfx('achievement');
      }
    }
  }

  // ============================================================
  //  DOM HUD & METERS
  // ============================================================
  private speedLinesDOM!: HTMLElement;
  private buildDom(): void {
    this.hud = document.createElement('div');
    this.hud.id = 'fishing-hud';
    this.meterBox = document.createElement('div');
    this.meterBox.id = 'fishing-meters';
    this.floatyDOM = document.createElement('div');
    this.floatyDOM.id = 'fishing-floaty';
    this.speedLinesDOM = document.createElement('div');
    this.speedLinesDOM.className = 'legendary-speed-lines';
    document.body.append(this.hud, this.meterBox, this.floatyDOM, this.speedLinesDOM);
  }
  private teardownDom(): void {
    this.hud?.remove();
    this.meterBox?.remove();
    this.floatyDOM?.remove();
    this.speedLinesDOM?.remove();
    hideShowcaseBanner();
  }

  private updateHud(): void {
    const fs = this.fs;
    const lvl = fishingLevelFromExp(fs.exp);
    const cur = fs.exp - fishingExpForLevel(lvl);
    const next = fishingExpForLevel(lvl + 1) - fishingExpForLevel(lvl);
    const pct = lvl >= 50 ? 100 : Math.round(cur / next * 100);
    const rod = RODS[fs.equippedRod] ?? RODS.beginner;
    const line = LINES[fs.equippedLine] ?? LINES.basic_mono;
    const bait = BAITS[fs.equippedBait] ?? BAITS.worm;
    const baitCount = bait.infinite ? '∞' : fmt(fs.baitStock[bait.id] ?? 0);
    this.hud.innerHTML = `
      <div class="fh-title">🎣 ${this.spotInfo.zoneTitle}</div>
      <div class="fh-lvl"><span>Lv.${lvl} ${titleForLevel(lvl)}</span></div>
      <div class="bar"><div style="width:${pct}%;background:linear-gradient(90deg,#5ab8e8,#5ad88a)"></div></div>
      <div class="fh-chips">
        <span>🎣 ${rod.name}</span>
        <span>🧵 ${line.name}</span>
        <span>🪱 ${bait.name} ×${baitCount}</span>
        <span>${WEATHER_LABEL[this.weather]}</span>
        <span>🕓 ${worldClock.label}</span>
        ${fs.streak >= 2 ? `<span class="fh-streak">🔥 ${fs.streak}</span>` : ''}
      </div>
      <div class="fh-hint">◆ ${fmt(this.player.shards)} · Esc to leave</div>`;
  }

  private showMeterBox(kind: 'cast' | 'hook' | 'fight' | 'land'): void {
    if (kind === 'cast') {
      this.meterBox.innerHTML = `<div class="meter-prompt" id="m-prompt"></div>
        <div class="cast-track"><div class="cast-sweet"></div><div class="cast-fill" id="cast-fill"></div></div>`;
    } else if (kind === 'hook') {
      this.meterBox.innerHTML = `<div class="meter-prompt" id="m-prompt"></div>
        <div class="hook-track"><div class="hook-window"></div><div class="hook-marker" id="hook-marker"></div></div>`;
    } else if (kind === 'fight') {
      const lanesHtml = LANES.map((l, i) => `
        <div class="reel-lane">
          <div class="lane-notes" id="lane-notes-${i}"></div>
          <div class="receptor" id="receptor-${i}" style="--lane-color:${l.color};--lane-glow:${l.glow}">
            <span class="rcp-glyph">${l.glyph}</span><span class="rcp-key">${l.keyLabel}</span>
          </div>
        </div>`).join('');
      this.meterBox.innerHTML = `<div class="meter-prompt" id="m-prompt"></div>
        <div class="reel-highway">
          <div id="rhythm-combo" class="rhythm-combo-display" style="display:none;">
            <div class="combo-num">0</div><div class="combo-label">STREAK</div>
          </div>
          <div class="reel-lanes">${lanesHtml}<div class="hit-line"></div></div>
        </div>
        <div class="fight-bars">
          <div class="fight-col"><span class="fl">🎣 REEL IT IN</span><div class="reel-track"><div class="reel-fill" id="reel-fill"></div></div></div>
          <div class="fight-col"><span class="fl">⚠️ LINE TENSION</span><div class="tension-track"><div class="tension-fill" id="tension-fill"></div><div class="tension-danger"></div></div></div>
          <div class="fight-col" style="max-width:130px"><span class="fl">💪 STAMINA</span><div class="reel-track" style="border-color:#b18ae8"><div class="reel-fill" id="stamina-fill" style="background:linear-gradient(90deg,#b18ae8,#ff7ad8)"></div></div></div>
        </div>
        <div id="struggle-alert" class="struggle-alert"></div>`;
    } else {
      this.meterBox.innerHTML = `<div class="meter-prompt land-flash" id="m-prompt"></div>`;
    }
    this.meterBox.style.display = 'flex';
  }
  private hideMeterBox(): void { this.meterBox.style.display = 'none'; this.meterBox.innerHTML = ''; }
  private setPrompt(html: string): void { const p = this.meterBox.querySelector('#m-prompt'); if (p) (p as HTMLElement).innerHTML = html; else { this.meterBox.innerHTML = `<div class="meter-prompt floating">${html}</div>`; this.meterBox.style.display = 'flex'; } }

  private async flashPrompt(html: string, ms: number): Promise<void> {
    this.meterBox.innerHTML = `<div class="meter-prompt floating">${html}</div>`;
    this.meterBox.style.display = 'flex';
    await wait(ms);
    this.hideMeterBox();
  }

  private renderCastMeter(): void {
    const f = this.meterBox.querySelector('#cast-fill') as HTMLElement | null;
    if (f) { f.style.width = `${this.castMeter * 100}%`; f.style.background = this.castMeter > 0.78 ? 'linear-gradient(90deg,#f2c14e,#ff7a4a)' : 'linear-gradient(90deg,#5ab8e8,#5ad88a)'; }
  }
  private renderHookMeter(): void {
    const m = this.meterBox.querySelector('#hook-marker') as HTMLElement | null;
    if (m) m.style.left = `${this.hookT * 100}%`;
  }
  private renderFightMeter(): void {
    const r = this.meterBox.querySelector('#reel-fill') as HTMLElement | null;
    const t = this.meterBox.querySelector('#tension-fill') as HTMLElement | null;
    const s = this.meterBox.querySelector('#stamina-fill') as HTMLElement | null;
    const alert = this.meterBox.querySelector('#struggle-alert') as HTMLElement | null;

    if (r) r.style.width = `${Math.min(100, this.reelProgress * 100)}%`;
    if (t) {
      t.style.width = `${Math.min(100, this.tension * 100)}%`;
      t.style.background = this.tension > 0.82 ? '#e85a6a' : this.tension > 0.6 ? '#f2935a' : '#5ad88a';
    }
    if (s) s.style.width = `${Math.min(100, this.playerStamina * 100)}%`;
    if (alert) {
      if (this.tension > 0.8) { alert.textContent = '⚠️ LINE ABOUT TO SNAP — KEEP REELING!'; alert.classList.add('danger'); }
      else if (this.exhaustedTimer > 0) { alert.textContent = '😮‍💨 EXHAUSTED — EASE OFF A SECOND!'; alert.classList.remove('danger'); }
      else { alert.textContent = ''; alert.classList.remove('danger'); }
    }
  }

  private triggerFloatyText(text: string, color = '#ffffff'): void {
    this.floatyText = text;
    this.floatyTextColor = color;
    this.floatyTextTimer = 2.0;
  }

  private updateFloatyTextDOM(): void {
    if (!this.floatyDOM) return;
    if (this.floatyText) {
      this.floatyDOM.innerHTML = this.floatyText;
      this.floatyDOM.style.color = this.floatyTextColor;
      this.floatyDOM.style.display = 'block';
      const op = Math.min(1.0, this.floatyTextTimer * 1.5);
      this.floatyDOM.style.opacity = op.toString();
    } else {
      this.floatyDOM.style.display = 'none';
    }
  }

  // ============================================================
  //  HELPERS
  // ============================================================
  private retractLine(): void {
    this.bobber.visible = false;
    this.line.visible = false;
    this.targetShadow = null;
  }

  private timeout(secs: number): Promise<void> {
    return new Promise(res => setTimeout(res, secs * 1000));
  }
  /** Wait that resolves early to 'quit' if the player presses Esc. */
  private async waitInterruptible(secs: number): Promise<'done' | 'quit'> {
    const start = performance.now();
    while (performance.now() - start < secs * 1000) {
      if (this.quitRequested) return 'quit';
      await new Promise(r => setTimeout(r, 60));
    }
    return 'done';
  }

  private dispose(): void {
    this.shadows.forEach(sh => disposeFish(sh.grp));
    this.shadows = [];
    this.water.material.dispose();
    this.water.mesh.geometry.dispose();
    this.dayNight.dispose();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mm = m.material;
        if (Array.isArray(mm)) mm.forEach(x => x.dispose()); else mm?.dispose();
      }
    });
  }
}

// ============================================================
//  STANDALONE OPENERS (for town notice boards / NPCs)
// ============================================================
export function openFishingBoard(player: Player, tab: 'board' | 'codex' | 'fame' | 'records' = 'board'): Promise<void> {
  const fs = normalizeFishingState((player as unknown as { fishing?: FishingState }).fishing);
  (player as unknown as { fishing: FishingState }).fishing = fs;
  return openFishHub(player, fs, { tab, canBuy: false, title: '🐟 Pond Notice Board' });
}
export function openFishingShop(player: Player): Promise<void> {
  const fs = normalizeFishingState((player as unknown as { fishing?: FishingState }).fishing);
  (player as unknown as { fishing: FishingState }).fishing = fs;
  return openFishHub(player, fs, { tab: 'rods', canBuy: true, title: "🎣 Anglers' Wharf" });
}
