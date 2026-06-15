// ============================================================
// AZ Tamer — battle engine (3v3, speed-ordered turns, AI,
// gifting/capture, EXP, evolution) with 3D presentation.
// Arenas are dressed per dungeon theme (boss fights get their
// own seal-ring staging), and every technique carries bespoke
// elemental VFX: projectiles, eruptions, bolts, shockwaves and
// screenshake that scales with the damage dealt.
// ============================================================
import * as THREE from 'three';
import {
  TECHS, ITEMS, TYPE_CSS, TYPE_COLORS, TYPE_ELEMENT, expForLevel,
  elementsOf, elementMult, ELEMENT_ICONS, type Technique, type GType, type Element,
} from './data';
import { sfx, playMusic } from './audio';
import { Guardian, Player } from './state';
import {
  makeGuardian, disposeRig, tween, wait, Ease, makeFloatingDamageText, setTimeScale,
  stoneTexture, skyGradient, canvasTex, caveRockTexture, drownedBrickTexture,
  stormPanelTexture, stormSeamEmissive, type GuardianRig,
} from './models';
import { VFX } from './vfx';
import { say, choose, toast, askName, setStoryInBattle } from './ui';
import { runBattleTutorial } from './tutorial';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Wire keyboard navigation onto a vertical list of buttons:
 *   W / ↑   move focus up        S / ↓   move focus down
 *   Space / Enter  pick          A  auto-shortcut (if provided)
 *   Esc     back (if provided)
 * Mouse hover syncs the focus. Returns a disposer that unbinds the listener.
 */
function attachKbNav(
  buttons: HTMLButtonElement[],
  handlers: { onSelect: (i: number) => void; onAuto?: () => void; onBack?: () => void },
): () => void {
  let focus = buttons.findIndex(b => !b.disabled);
  if (focus < 0) focus = 0;
  const paint = () => buttons.forEach((b, i) => b.classList.toggle('kb-focus', i === focus));
  const setFocus = (i: number) => { if (i >= 0 && i < buttons.length && !buttons[i].disabled) { focus = i; paint(); } };
  const move = (dir: number) => {
    for (let n = 0; n < buttons.length; n++) {
      focus = (focus + dir + buttons.length) % buttons.length;
      if (!buttons[focus].disabled) break;
    }
    paint();
    sfx('blip');
  };
  buttons.forEach((b, i) => b.addEventListener('mouseenter', () => setFocus(i)));
  paint();
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { e.preventDefault(); move(-1); }
    else if (k === 's' || k === 'arrowdown') { e.preventDefault(); move(1); }
    else if (k === ' ' || k === 'enter') { e.preventDefault(); if (!buttons[focus]?.disabled) handlers.onSelect(focus); }
    else if (k === 'a' && handlers.onAuto) { e.preventDefault(); handlers.onAuto(); }
    else if (k === 'escape' && handlers.onBack) { e.preventDefault(); handlers.onBack(); }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

export type BattleResult = 'win' | 'lose' | 'flee';

export interface BattleView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
}

interface Unit {
  g: Guardian;
  side: 'player' | 'enemy';
  slot: number;
  rig: GuardianRig;
  guarding: boolean;
  mods: { atk: number; def: number; spd: number };
  bond: number;       // gift bond (wild enemies)
  favor: number;      // hidden per-enemy gift taste multiplier
  wild: boolean;
  cardEl?: HTMLElement;
}

/** A replayable player order — what a Guardian did, so Auto-Action can redo it. */
type PlayerAction =
  | { kind: 'strike'; target: Unit }
  | { kind: 'tech'; tech: Technique; target: Unit | null }
  | { kind: 'guard' }
  | { kind: 'item'; itemId: string; target: Unit }
  | { kind: 'gift'; itemId: string; target: Unit };

/** Per-Guardian battle tally shown on the victory report. */
interface GuardianStat { dealt: number; taken: number; kos: number; assists: number; guards: number; }

/** What happened to one winner when EXP was applied — drives the victory cards. */
interface GuardianResult {
  g: Guardian;
  beforeLevel: number;
  afterLevel: number;
  beforeExp: number;
  gained: number;
  newTechs: Technique[];
}

export interface BattleOptions {
  boss?: boolean;
  wild?: boolean;            // enemies capturable via gifting
  intro?: string;            // log line at start
  theme?: 'cavern' | 'vault' | 'storm';
  arena?: string;            // dungeon id — flavors the arena beyond the base theme
  firstStrike?: boolean;     // crawler cannon stun: enemies skip round 1
}

interface EnemySpec { speciesId: string; level: number; }

// ---------------- arena dressing ----------------

/** Glyph-ringed boss seal, drawn once per boss battle. */
function runeSigilTexture(colorCss: string): THREE.Texture {
  return canvasTex(512, (ctx, s) => {
    const cx = s / 2;
    ctx.strokeStyle = colorCss;
    ctx.fillStyle = colorCss;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cx, s * 0.47, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cx, s * 0.34, 0, Math.PI * 2); ctx.stroke();
    const glyphs = 'ᚠᚱᛟᛞᚹᛗᚷᛏᛉᛊᚺᛜᛁᛚᚦᛒ';
    ctx.font = 'bold 42px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * s * 0.405, cx + Math.sin(a) * s * 0.405);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(glyphs[i % glyphs.length], 0, 0);
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * s * 0.3, y = cx + Math.sin(a) * s * 0.3;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  });
}

const ARENA_TAGLINES: Record<string, string> = {
  cavern: 'Torchlight gutters across the proving stones…',
  mossdeep: 'Spores drift like slow green snow…',
  vault: 'Drowned light filters through the broken vaults…',
  storm: 'The spire hums — the old war-engine is listening…',
};

export class Battle {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  private fx = new VFX(this.scene);
  private units: Unit[] = [];
  private round = 0;
  private camT = 0;
  private camDist = 9.2;
  private baseFov = 50;
  private envTick: ((dt: number) => void)[] = [];

  // --- battle report + auto-action state ---
  private timeline: { icon: string; html: string }[] = [];
  private stats = new Map<string, GuardianStat>();
  private lastAction = new Map<string, PlayerAction>();
  private autoMode = false;
  private speedMul = 1;
  private autoKeyHandler?: (e: KeyboardEvent) => void;

  constructor(private player: Player, private enemySpecs: EnemySpec[], private opts: BattleOptions) {}

  get view(): BattleView {
    return { scene: this.scene, camera: this.camera, update: (dt) => this.updateView(dt) };
  }

  private updateView(dt: number): void {
    this.camT += dt;
    this.fx.update(dt);
    for (const f of this.envTick) f(dt);
    // gentle camera drift + impact shake (position AND aim — feels punchier)
    const sh = this.fx.shakeOffset;
    this.camera.position.set(
      Math.sin(this.camT * 0.18) * 0.6 + sh.x,
      4.6 + Math.sin(this.camT * 0.13) * 0.15 + sh.y,
      this.camDist + sh.z,
    );
    this.camera.lookAt(sh.x * 0.6, 0.8 + sh.y * 0.6, 0);
    const fov = this.baseFov - this.fx.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------- arena construction ----------
  private buildArena(): void {
    const theme = this.opts.theme ?? 'cavern';
    const boss = !!this.opts.boss;
    const floorR = boss ? 8.4 : 7;

    // theme-keyed staging: sky, fog, floor material, light palette
    let sky: [string, string], fog: number, ringColor: number;
    let floorMat: THREE.MeshStandardMaterial;
    let ambColor = 0x8a93c0, keyColor = 0xfff0d8, overhead = 0x5a7bd8;
    // living-green arenas: the Mossdeep burrows and Aurelia's sea-cave nest
    const verdant = this.opts.arena === 'mossdeep' || this.opts.arena === 'cradle';

    if (theme === 'vault') {
      sky = boss ? ['#081626', '#020810'] : ['#0e2238', '#04101c'];
      fog = 0x081018; ringColor = 0x6ad8c4;
      floorMat = new THREE.MeshStandardMaterial({
        map: drownedBrickTexture('#2e4a5a', '#16242e', 'rgba(74,164,116,1)', 31, 3),
        roughness: 0.55,
      });
      ambColor = 0x6a93b0; keyColor = 0xc8f0e8; overhead = 0x3aa8b8;
    } else if (theme === 'storm') {
      sky = boss ? ['#1c1430', '#070410'] : ['#2a2440', '#0a0814'];
      fog = 0x100c20; ringColor = 0xb8a8f2;
      floorMat = new THREE.MeshStandardMaterial({
        map: stormPanelTexture('#34304a', '#1a1628', 5, 3),
        emissiveMap: stormSeamEmissive('#8a6af2', 5, 3),
        emissive: new THREE.Color(0x8a6af2),
        emissiveIntensity: 0.7,
        roughness: 0.5, metalness: 0.35,
      });
      ambColor = 0x8a83c8; keyColor = 0xd8d0ff; overhead = 0x8a6af2;
    } else if (verdant) {
      sky = boss ? ['#0c1a10', '#030804'] : ['#14241a', '#05080a'];
      fog = 0x0a1410; ringColor = 0x7ae47a;
      floorMat = new THREE.MeshStandardMaterial({
        map: caveRockTexture('#2e4434', '#1e3024', '#14201a', 13, 3),
        roughness: 0.9,
      });
      ambColor = 0x7ab088; keyColor = 0xd8f0c8; overhead = 0x4ec45e;
    } else { // cavern
      sky = boss ? ['#160e24', '#04050a'] : ['#1a1430', '#060810'];
      fog = 0x0a0c18; ringColor = 0xf2c14e;
      floorMat = new THREE.MeshStandardMaterial({
        map: caveRockTexture('#3a3f52', '#2a2e40', '#1a1e2a', 21, 3),
        roughness: 0.9,
      });
    }

    this.scene.background = skyGradient(sky[0], sky[1]);
    this.scene.fog = new THREE.Fog(fog, boss ? 12 : 14, boss ? 26 : 30);

    const floor = new THREE.Mesh(new THREE.CylinderGeometry(floorR, floorR + 0.6, 0.5, 40), floorMat);
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(floorR - 0.6, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: boss ? 0xe83a5a : ringColor, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);
    this.envTick.push(dt => { ring.rotation.z += dt * (boss ? 0.4 : 0.12); });

    const amb = new THREE.AmbientLight(ambColor, boss ? 0.55 : 0.7);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(keyColor, boss ? 1.7 : 1.4);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const spot = new THREE.PointLight(overhead, 18, 24);
    spot.position.set(0, 6, 0);
    this.scene.add(spot);
    this.envTick.push(dt => { void dt; spot.intensity = 18 + Math.sin(this.camT * 1.7) * 2.5; });

    // theme set-dressing
    if (theme === 'vault') this.dressVault(floorR);
    else if (theme === 'storm') this.dressStorm(floorR, amb);
    else this.dressCavern(floorR, verdant);

    if (boss) this.dressBossSeal(theme, floorR);

    this.camera.position.set(0, 4.6, this.camDist);
    this.camera.lookAt(0, 0.8, 0);
  }

  /** Torch-lit proving cavern — stalagmite ring, braziers, drifting dust.
   *  Mossdeep variant swaps fire for glow-shrooms and spore-light. */
  private dressCavern(floorR: number, verdant: boolean): void {
    const rockMat = new THREE.MeshStandardMaterial({
      map: caveRockTexture(verdant ? '#31493a' : '#454a60', verdant ? '#20301f' : '#30344a', '#181c28', 87, 1),
      roughness: 0.95,
    });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const r = floorR + 1.6 + Math.random() * 2.2;
      const h = 1.4 + Math.random() * 2.4;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.4 + Math.random() * 0.35, h, 7), rockMat);
      spire.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
      spire.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI, (Math.random() - 0.5) * 0.16);
      this.scene.add(spire);
    }

    if (!verdant) {
      // three flickering braziers behind the battle lines
      for (const [bx, bz] of [[0, -5.6], [-5.2, 3.4], [5.2, 3.4]]) {
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.2, 0.3, 10),
          new THREE.MeshStandardMaterial({ map: stoneTexture('#4a4256', '#2a2436', 1), roughness: 0.8 }),
        );
        bowl.position.set(bx, 0.7, bz);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.7, 8),
          (bowl.material as THREE.MeshStandardMaterial));
        stem.position.set(bx, 0.35, bz);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8),
          new THREE.MeshBasicMaterial({ color: 0xffa54e, transparent: true, opacity: 0.85 }));
        flame.position.set(bx, 1.1, bz);
        const fire = new THREE.PointLight(0xff9a4e, 9, 8);
        fire.position.set(bx, 1.3, bz);
        this.scene.add(bowl, stem, flame, fire);
        let emberT = Math.random();
        this.envTick.push(dt => {
          const flick = 0.8 + Math.sin(this.camT * 11 + bx) * 0.12 + Math.sin(this.camT * 23 + bz) * 0.08;
          fire.intensity = 9 * flick;
          flame.scale.set(flick, 0.85 + flick * 0.3, flick);
          emberT += dt;
          if (emberT > 0.7) {
            emberT = 0;
            this.fx.burst(new THREE.Vector3(bx, 1.15, bz), 0xffb05e,
              { count: 3, speed: 0.4, up: 1.6, gravity: 0.5, life: 1.1, size: 0.08 });
          }
        });
      }
    } else {
      // bioluminescent mushroom clumps pulse slowly
      for (const [mx, mz] of [[-5.4, 3.2], [5.4, 3.2], [0, -5.8], [-3.4, -4.6], [3.8, -4.2]]) {
        const clump = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const h = 0.25 + Math.random() * 0.4;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 6),
            new THREE.MeshStandardMaterial({ color: 0xc8d8b8, roughness: 0.9 }));
          stem.position.set((Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0x5ee4a8, emissive: 0x2a9a5e, emissiveIntensity: 1.1, roughness: 0.4 }));
          cap.position.set(stem.position.x, h, stem.position.z);
          clump.add(stem, cap);
        }
        clump.position.set(mx, 0, mz);
        const glow = new THREE.PointLight(0x4ed89a, 5, 6);
        glow.position.set(mx, 0.6, mz);
        this.scene.add(clump, glow);
        const phase = Math.random() * Math.PI * 2;
        this.envTick.push(() => { glow.intensity = 5 + Math.sin(this.camT * 1.8 + phase) * 2; });
      }
    }

    this.addMotes(verdant ? 0x8ae4a0 : 0xc4b08a, 220, 'drift');
  }

  /** Drowned imperial treasury — broken columns, god-rays, rising bubbles, gold. */
  private dressVault(floorR: number): void {
    const colMat = new THREE.MeshStandardMaterial({
      map: drownedBrickTexture('#3e5a6a', '#1e2e3a', 'rgba(74,164,116,1)', 51, 1),
      roughness: 0.6,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const r = floorR + 1.8 + Math.random() * 1.4;
      const h = 1.8 + Math.random() * 2.6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, h, 12), colMat);
      col.position.set(Math.cos(a) * r, h / 2 - 0.4, Math.sin(a) * r);
      this.scene.add(col);
      if (Math.random() < 0.6) {
        // its broken capital leans against it
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.5, 0.7, 12), colMat);
        cap.position.set(col.position.x + 0.9, -0.1, col.position.z + 0.5);
        cap.rotation.set(Math.PI / 2.3, 0, Math.random() * Math.PI);
        this.scene.add(cap);
      }
    }
    // hoard mounds, still glinting after four hundred drowned years
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd8a83a, metalness: 0.85, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.3,
    });
    for (const [gx, gz, gs] of [[-5.8, -3.2, 0.8], [6.2, -2.4, 1.1], [4.8, 4.4, 0.7]]) {
      const pile = new THREE.Mesh(new THREE.SphereGeometry(gs, 12, 8), goldMat);
      pile.scale.y = 0.35;
      pile.position.set(gx, 0.05, gz);
      this.scene.add(pile);
    }
    this.envTick.push(() => { goldMat.emissiveIntensity = 0.3 + Math.max(0, Math.sin(this.camT * 0.9)) * 0.25; });

    // god-rays: slow-pulsing light shafts from the drowned ceiling
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0x7ae4d8, transparent: true, opacity: 0.08, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (const [rx, rz, ph] of [[-3, -2, 0], [3.4, 1.5, 2.1], [0.5, 4, 4.2]]) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.7, 11, 12, 1, true), rayMat.clone());
      shaft.position.set(rx, 5.5, rz);
      shaft.rotation.z = 0.12;
      this.scene.add(shaft);
      this.envTick.push(() => {
        (shaft.material as THREE.MeshBasicMaterial).opacity = 0.05 + (Math.sin(this.camT * 0.5 + ph) * 0.5 + 0.5) * 0.07;
        shaft.rotation.y += 0.0008;
      });
    }
    // caustic wobble — a cool light slowly circling overhead
    const caustic = new THREE.PointLight(0x5ad8c4, 7, 18);
    this.scene.add(caustic);
    this.envTick.push(() => {
      caustic.position.set(Math.cos(this.camT * 0.4) * 4, 5.5, Math.sin(this.camT * 0.4) * 4);
    });

    this.addMotes(0x9ae4d8, 260, 'rise');
  }

  /** The war-spire's dueling platform — tesla pylons, arcing current, rain. */
  private dressStorm(floorR: number, amb: THREE.AmbientLight): void {
    const pylonMat = new THREE.MeshStandardMaterial({
      map: stormPanelTexture('#2e2a44', '#161226', 9, 1),
      emissiveMap: stormSeamEmissive('#9a7af2', 9, 1),
      emissive: new THREE.Color(0x9a7af2),
      emissiveIntensity: 0.8,
      roughness: 0.45, metalness: 0.5,
    });
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.62;
      const r = floorR + 2.1;
      const h = 2.6 + (i % 2) * 0.9;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), pylonMat);
      pylon.position.set(Math.cos(a) * r, h / 2 - 0.4, Math.sin(a) * r);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8c8ff, emissive: 0xb49af2, emissiveIntensity: 2, roughness: 0.2 }));
      orb.position.set(pylon.position.x, h - 0.25, pylon.position.z);
      this.scene.add(pylon, orb);
      tips.push(orb.position.clone());
    }
    // current arcs leap between pylon crowns; the sky answers with sheet lightning
    let arcT = 1.2, flashBoost = 0;
    const ambBase = amb.intensity;
    this.envTick.push(dt => {
      arcT -= dt;
      if (arcT <= 0) {
        arcT = 1.6 + Math.random() * 3;
        const a = Math.floor(Math.random() * tips.length);
        const b = (a + 1 + Math.floor(Math.random() * (tips.length - 1))) % tips.length;
        this.fx.bolt(tips[a], tips[b], 0xc8b0ff, { life: 0.28, jitter: 0.7 });
        this.fx.flash(tips[a].clone().lerp(tips[b], 0.5), 0xb49af2, { intensity: 14, life: 0.3 });
        if (Math.random() < 0.4) { flashBoost = 0.5; sfx('zap'); }
      }
      flashBoost = Math.max(0, flashBoost - dt * 1.4);
      amb.intensity = ambBase + flashBoost;
    });
    // sheared wreckage drifts around the spire on old grav-rails
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x4a4266, emissive: 0x6a5ac8, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.4,
    });
    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + Math.random() * 0.2), shardMat);
      const a0 = Math.random() * Math.PI * 2;
      const r = floorR - 1 + Math.random() * 4.5;
      const y = 2.2 + Math.random() * 3.4;
      const speed = 0.08 + Math.random() * 0.12;
      this.scene.add(shard);
      this.envTick.push(() => {
        const a = a0 + this.camT * speed;
        shard.position.set(Math.cos(a) * r, y + Math.sin(this.camT * 0.8 + a0 * 4) * 0.3, Math.sin(a) * r);
        shard.rotation.x += 0.01; shard.rotation.y += 0.014;
      });
    }
    this.addMotes(0x8a7ae4, 200, 'rain');
  }

  /** Boss staging: a rotating rune seal, crimson braziers, dread in the fog. */
  private dressBossSeal(theme: string, floorR: number): void {
    const sigilCss = theme === 'vault' ? 'rgba(90,216,196,0.9)' : theme === 'storm' ? 'rgba(180,154,242,0.9)' : 'rgba(232,58,90,0.85)';
    const sigil = new THREE.Mesh(
      new THREE.PlaneGeometry(floorR * 1.35, floorR * 1.35),
      new THREE.MeshBasicMaterial({
        map: runeSigilTexture(sigilCss), transparent: true, opacity: 0.6,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.y = 0.04;
    this.scene.add(sigil);
    this.envTick.push(dt => {
      sigil.rotation.z += dt * 0.18;
      (sigil.material as THREE.MeshBasicMaterial).opacity = 0.45 + (Math.sin(this.camT * 1.2) * 0.5 + 0.5) * 0.3;
    });

    // four seal-fire braziers burn cold crimson
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bx = Math.cos(a) * (floorR - 0.9), bz = Math.sin(a) * (floorR - 0.9);
      const stand = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.9, 6),
        new THREE.MeshStandardMaterial({ color: 0x241a2e, roughness: 0.6, metalness: 0.4 }));
      stand.position.set(bx, 0.45, bz);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8),
        new THREE.MeshBasicMaterial({ color: 0xe84a6a, transparent: true, opacity: 0.85 }));
      flame.position.set(bx, 1.1, bz);
      const light = new THREE.PointLight(0xe83a5a, 7, 7);
      light.position.set(bx, 1.2, bz);
      this.scene.add(stand, flame, light);
      this.envTick.push(() => {
        const f = 0.8 + Math.sin(this.camT * 13 + i * 2.2) * 0.18;
        light.intensity = 7 * f;
        flame.scale.set(f, 0.8 + f * 0.4, f);
      });
    }
    // a cold rim light from behind the master's side
    const rim = new THREE.DirectionalLight(0xe83a5a, 0.9);
    rim.position.set(9, 3.5, -4);
    this.scene.add(rim);
  }

  /** Ambient particles: drifting dust, rising bubbles, or driving rain. */
  private addMotes(color: number, count: number, mode: 'drift' | 'rise' | 'rain'): void {
    const positions = new Float32Array(count * 3);
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;
      seed.push(Math.random() * Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: mode === 'rain' ? 0.045 : 0.06, transparent: true,
      opacity: mode === 'rain' ? 0.3 : 0.5, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.envTick.push(dt => {
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        if (mode === 'drift') {
          arr[i * 3] += Math.sin(this.camT * 0.5 + seed[i]) * dt * 0.12;
          arr[i * 3 + 1] += Math.cos(this.camT * 0.4 + seed[i] * 2) * dt * 0.08;
        } else if (mode === 'rise') {
          arr[i * 3 + 1] += dt * (0.25 + (seed[i] % 1) * 0.3);
          arr[i * 3] += Math.sin(this.camT * 0.8 + seed[i]) * dt * 0.1;
          if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = 0;
        } else {
          arr[i * 3 + 1] -= dt * (6 + (seed[i] % 1) * 4);
          if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 8;
        }
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  private slotPos(side: 'player' | 'enemy', slot: number): THREE.Vector3 {
    const x = side === 'player' ? -2.6 : 2.6;
    return new THREE.Vector3(x, 0, (slot - 1) * 2.3);
  }

  private spawnUnit(g: Guardian, side: 'player' | 'enemy', slot: number): Unit {
    const rig = makeGuardian(g.speciesId, g.customization);
    rig.group.position.copy(this.slotPos(side, slot));
    rig.group.rotation.y = side === 'player' ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(rig.group);
    const u: Unit = {
      g, side, slot, rig, guarding: false,
      mods: { atk: 1, def: 1, spd: 1 },
      bond: 0, favor: 0.8 + Math.random() * 0.6,
      wild: side === 'enemy' && !!this.opts.wild,
    };
    if (g.fainted) { rig.group.visible = false; }
    else {
      // materialization flourish
      const color = TYPE_COLORS[g.species.type];
      this.fx.ring(rig.group.position, color, { maxR: 1.2, life: 0.5 });
      this.fx.glow(rig.group.position.clone().setY(0.8), color, { scale: 1.4, life: 0.45 });
    }
    return u;
  }

  // ---------- UI ----------
  private log(msg: string): void { $('battle-log').innerHTML = msg; }

  /** Lazily fetch a Guardian's running battle tally. */
  private stat(gid: string): GuardianStat {
    let s = this.stats.get(gid);
    if (!s) { s = { dealt: 0, taken: 0, kos: 0, assists: 0, guards: 0 }; this.stats.set(gid, s); }
    return s;
  }
  /** Credit damage dealt/taken and KOs to the player units involved. */
  private recordHit(att: Unit, def: Unit, dmg: number): void {
    if (att.side === 'player') this.stat(att.g.id).dealt += dmg;
    if (def.side === 'player') this.stat(def.g.id).taken += dmg;
    if (def.g.fainted && att.side === 'player') this.stat(att.g.id).kos += 1;
  }
  /** Append a line to the post-battle report (kept bounded). */
  private pushLog(icon: string, html: string): void {
    this.timeline.push({ icon, html });
    if (this.timeline.length > 80) this.timeline.shift();
  }

  /** Chance this wild enemy joins after victory, given its current bond. */
  private captureChance(e: Unit): number {
    if (!e.wild) return 0;
    const levelPenalty = Math.max(0, (e.g.level - this.maxPartyLevel()) * 0.04);
    return Math.max(0, Math.min(0.95, e.g.species.captureBase + e.bond / 90 - levelPenalty));
  }

  private renderCards(): void {
    const wrap = $('battle-parties');
    wrap.innerHTML = '';
    const mk = (u: Unit) => {
      const el = document.createElement('div');
      el.className = `unit-card${u.g.fainted ? ' dead' : ''}`;
      const s = u.g.stats;
      const side = u.side === 'enemy' ? `<span style="color:var(--ui-red)">FOE</span> ` : '';
      const els = elementsOf(u.g.speciesId).map(e => ELEMENT_ICONS[e]).join('');
      // wild foes show their bond meter: the live chance they join you after victory
      const chance = this.captureChance(u);
      const bondRow = u.wild && u.g.species.captureBase > 0
        ? `<div class="minibar bond" title="Bond — chance this Guardian joins you after victory"><div style="width:${Math.round(chance * 100)}%"></div></div>
           <div class="bond-label">💜 Bond ${u.bond} · <b>${Math.round(chance * 100)}%</b> join chance</div>`
        : '';
      el.innerHTML = `<div class="nm"><span style="color:${TYPE_CSS[u.g.species.type]}">${side}${u.g.nickname}</span><span><span style="font-size:11px" title="${elementsOf(u.g.speciesId).join(' · ')}">${els}</span> Lv${u.g.level}</span></div>
        <div class="minibar hp"><div style="width:${Math.max(0, (u.g.hp / s.hp)) * 100}%"></div></div>
        <div class="minibar sp"><div style="width:${Math.max(0, (u.g.sp / s.sp)) * 100}%"></div></div>${bondRow}`;
      u.cardEl = el;
      wrap.appendChild(el);
    };
    this.units.filter(u => u.side === 'enemy').forEach(mk);
    this.units.filter(u => u.side === 'player').forEach(mk);
  }

  private highlight(u: Unit | null): void {
    this.units.forEach(x => x.cardEl?.classList.toggle('active', x === u));
  }

  private menu(buttons: { label: string; disabled?: boolean; cls?: string; key?: string }[]): Promise<number> {
    return new Promise(resolve => {
      const m = $('battle-menu');
      m.innerHTML = '';
      m.style.display = 'block';
      const els: HTMLButtonElement[] = [];
      let dispose = () => {};
      const done = (i: number) => { m.style.display = 'none'; dispose(); resolve(i); };
      buttons.forEach((b, i) => {
        const btn = document.createElement('button');
        btn.className = `ui-btn ${b.cls ?? ''}`;
        btn.innerHTML = b.label;
        btn.disabled = !!b.disabled;
        btn.onclick = () => { if (!btn.disabled) done(i); };
        m.appendChild(btn);
        els.push(btn);
      });
      // W/S to move, Space/Enter to pick; A jumps to Auto-Action, Esc to Back.
      const autoIdx = buttons.findIndex(b => b.key === 'auto' && !b.disabled);
      const backIdx = buttons.findIndex(b => b.key === 'back' || /← Back/.test(b.label));
      dispose = attachKbNav(els, {
        onSelect: done,
        onAuto: autoIdx >= 0 ? () => done(autoIdx) : undefined,
        onBack: backIdx >= 0 ? () => done(backIdx) : undefined,
      });
    });
  }

  // ---------- animation helpers ----------
  /** Rotate a unit to face a world position (models face +Z at rotation 0). */
  private faceTo(u: Unit, pos: THREE.Vector3): void {
    const d = pos.clone().sub(u.rig.group.position);
    if (d.lengthSq() > 0.001) u.rig.group.rotation.y = Math.atan2(d.x, d.z);
  }
  /** Restore a unit's default battle-line facing (toward the opposing side). */
  private faceHome(u: Unit): void {
    u.rig.group.rotation.y = u.side === 'player' ? Math.PI / 2 : -Math.PI / 2;
  }

  private chest(u: Unit): THREE.Vector3 {
    return u.rig.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
  }

  /** Screenshake + lens punch scaled to how much of the target's HP just vanished. */
  private dmgFeedback(def: Unit, dmg: number, crit: boolean, eff: number): void {
    const pct = dmg / def.g.stats.hp;
    const amp = Math.min(0.5, pct * 1.05 + (crit ? 0.07 : 0) + (eff > 1 ? 0.04 : 0));
    this.fx.shake(amp, 0.28 + pct * 0.55);
    if (pct > 0.2 || crit) this.fx.punch(5);
    else if (pct > 0.12) this.fx.punch(2.5);
  }

  /** Anticipation crouch, then a dash to melee range with motion ghosts. */
  private async meleeRush(att: Unit, def: Unit, color: number): Promise<void> {
    this.faceTo(att, def.rig.group.position);
    const start = att.rig.group.position.clone();
    const target = def.rig.group.position.clone().lerp(start, 0.3);
    await tween(0.12, t => {
      att.rig.group.scale.set(1 + t * 0.07, 1 - t * 0.15, 1 + t * 0.07);
    }, Ease.outQuad);
    sfx('whoosh');
    await tween(0.13, t => {
      att.rig.group.position.lerpVectors(start, target, t);
      att.rig.group.position.y = Math.sin(t * Math.PI) * 0.4;
      att.rig.group.scale.set(1 + (1 - t) * 0.07, 1 - (1 - t) * 0.15, 1 + (1 - t) * 0.07);
    }, Ease.inQuad);
    att.rig.group.scale.setScalar(1);
    att.rig.group.position.y = 0;
    for (let i = 1; i <= 3; i++) {
      this.fx.glow(start.clone().lerp(target, i / 3.5).setY(0.8), color, { scale: 0.8, life: 0.28, grow: 0.3 });
    }
  }

  private async meleeReturn(att: Unit, home: THREE.Vector3): Promise<void> {
    const cur = att.rig.group.position.clone();
    await tween(0.28, t => {
      att.rig.group.position.lerpVectors(cur, home, t);
      att.rig.group.position.y = Math.sin(t * Math.PI) * 0.3;
    }, Ease.outQuad);
    att.rig.group.position.copy(home);
    this.faceHome(att);
  }

  /** Spell windup: converging motes, swelling glow, rising light. */
  private async castWindup(att: Unit, color: number): Promise<void> {
    const p = this.chest(att);
    sfx('charge');
    this.fx.spiral(att.rig.group.position.clone(), color, { up: true, dur: 0.5, radius: 0.7, height: 1.4 });
    const converge = this.fx.implode(p, color, { count: 22, radius: 1.6, life: 0.42 });
    this.fx.flash(p, color, { intensity: 15, life: 0.5 });
    const s = att.rig.body.scale.x;
    await tween(0.42, t => {
      const k = 1 + Math.sin(t * Math.PI) * 0.16;
      att.rig.body.scale.setScalar(s * k);
    });
    att.rig.body.scale.setScalar(s);
    await converge;
    this.fx.glow(p, color, { scale: 1.5, life: 0.22 });
  }

  /** The element-styled payload that lands on a target. `big` for heavy arts/crits. */
  private elementalImpact(tgt: Unit, gt: GType, big: boolean): void {
    const p = this.chest(tgt);
    const ground = tgt.rig.group.position;
    switch (gt) {
      case 'Blaze':
        this.fx.glow(p, 0xfff0b0, { scale: big ? 2.3 : 1.4, life: 0.3 });
        this.fx.burst(p, 0xff8a3a, { count: big ? 42 : 26, speed: big ? 4.6 : 3.2, gravity: -2.5, life: 0.7 });
        this.fx.burst(p, 0xffd24e, { count: 14, speed: 1.8, gravity: 0.6, life: 1.0, size: 0.1 });
        this.fx.ring(ground, 0xff8a3a, { maxR: big ? 2.8 : 1.8 });
        this.fx.flash(p, 0xff8a3a, { intensity: big ? 36 : 22 });
        sfx('boom');
        break;
      case 'Tide':
        this.fx.glow(p, 0xbfe8ff, { scale: big ? 1.9 : 1.3, life: 0.25 });
        this.fx.burst(p, 0x6ac4ff, { count: big ? 40 : 28, speed: 3.4, up: 2.6, gravity: -9, life: 0.7 });
        this.fx.ring(ground, 0x3a9df2, { maxR: big ? 2.5 : 1.9 });
        this.fx.flash(p, 0x3a9df2, { intensity: 20 });
        sfx('splash');
        break;
      case 'Verdant':
        this.fx.spikes(ground, 0x3a9a4e, { count: big ? 9 : 6, height: big ? 1.5 : 1.1 });
        this.fx.burst(p, 0x7ae47a, { count: 22, speed: 2.2, gravity: -1.2, life: 0.85, size: 0.12 });
        this.fx.glow(p, 0x9af2a0, { scale: 1.3, life: 0.3 });
        sfx('leaf');
        break;
      case 'Volt': {
        const skyP = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 6.5, (Math.random() - 0.5) * 1.4));
        this.fx.bolt(skyP, p, 0xfff2a0, { jitter: 0.55 });
        this.fx.bolt(p, ground.clone().add(new THREE.Vector3(0.7, 0, 0.4)), 0xf2d23a, { life: 0.18, jitter: 0.3, segments: 5 });
        this.fx.burst(p, 0xf2d23a, { count: big ? 34 : 24, speed: 3.8, gravity: -3, life: 0.5 });
        this.fx.flash(p, 0xf2d23a, { intensity: big ? 34 : 26, life: 0.22 });
        this.fx.glow(p, 0xfff8c0, { scale: big ? 2 : 1.3, life: 0.2 });
        sfx('zap');
        break;
      }
      case 'Gale':
        this.fx.burst(p, 0x9af2e4, { count: 26, speed: 4.4, gravity: 0, drag: 2.4, spread: 0.35, life: 0.5 });
        this.fx.ring(ground, 0x7adfd0, { maxR: big ? 2.6 : 2.0, y: 0.9, tube: 0.04 });
        this.fx.glow(p, 0xc8fff4, { scale: 1.4, life: 0.25 });
        sfx('whoosh');
        break;
      case 'Umbra':
        this.fx.glow(p, 0x9a5af2, { scale: big ? 2.5 : 1.6, life: 0.4 });
        this.fx.burst(p, 0xb46af2, { count: big ? 38 : 28, speed: 2.6, gravity: 1.6, drag: 1, life: 0.75 });
        this.fx.ring(ground, 0x9a5af2, { maxR: big ? 2.6 : 1.8 });
        this.fx.flash(p, 0x9a5af2, { intensity: 24 });
        sfx('dark');
        break;
    }
  }

  /** Per-element delivery from caster to a single target (the travel, not the landing). */
  private async artDelivery(att: Unit, tgt: Unit, gt: GType): Promise<void> {
    const from = this.chest(att);
    const to = this.chest(tgt);
    switch (gt) {
      case 'Blaze':
        await this.fx.projectile(from, to, 0xff8a3a, { size: 0.2, dur: 0.34, arc: 0.95 });
        break;
      case 'Tide': {
        const shots = [0, 90, 180].map(d =>
          wait(d).then(() => this.fx.projectile(from, to, 0x6ac4ff, { size: 0.13, dur: 0.3, arc: 0.4 })));
        await Promise.all(shots);
        break;
      }
      case 'Verdant':
        // the ground itself answers — brief tremor, then the eruption at impact
        this.fx.ring(tgt.rig.group.position, 0x4ec45e, { maxR: 1.1, life: 0.3 });
        await wait(160);
        break;
      case 'Volt':
        await wait(120); // the sky-bolt IS the impact
        break;
      case 'Gale': {
        sfx('whoosh');
        const a = this.fx.crescent(from, to, 0x7adfd0);
        const b = wait(80).then(() =>
          this.fx.crescent(from.clone().add(new THREE.Vector3(0, 0.45, 0)), to.clone(), 0x9af2e4));
        await Promise.all([a, b]);
        break;
      }
      case 'Umbra':
        await this.fx.implode(to, 0x9a5af2, { count: 34, radius: 1.9, life: 0.5 });
        break;
    }
  }

  /** Theatrical prelude for an all-target art, before the per-target landings. */
  private async artBarragePrelude(att: Unit, targets: Unit[], gt: GType): Promise<void> {
    if (!targets.length) return;
    const center = targets.reduce((v, u) => v.add(u.rig.group.position), new THREE.Vector3())
      .multiplyScalar(1 / targets.length);
    switch (gt) {
      case 'Blaze': {
        // meteors scream down on every foe
        const drops = targets.map((tgt, i) => wait(i * 130).then(() => {
          const to = this.chest(tgt);
          const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 7, (Math.random() - 0.5) * 2));
          return this.fx.projectile(from, to, 0xff7a3a, { size: 0.24, dur: 0.4, arc: 0 });
        }));
        await Promise.all(drops);
        break;
      }
      case 'Tide': {
        // a wall of seawater sweeps the whole line
        const dir = att.side === 'player' ? 1 : -1;
        const from = new THREE.Vector3(center.x - dir * 3.2, 0, center.z);
        const to = new THREE.Vector3(center.x + dir * 2.6, 0, center.z);
        sfx('splash');
        await this.fx.wave(from, to, 0x4ab0f2, { width: 6.2, height: 1.8, dur: 0.5 });
        break;
      }
      case 'Gale': {
        const from = this.chest(att);
        await Promise.all(targets.map((tgt, i) =>
          wait(i * 70).then(() => this.fx.crescent(from.clone(), this.chest(tgt), 0x7adfd0))));
        break;
      }
      case 'Umbra':
        await Promise.all(targets.map(tgt => this.fx.implode(this.chest(tgt), 0x9a5af2, { count: 24, radius: 1.6, life: 0.45 })));
        break;
      case 'Volt':
      case 'Verdant':
        await wait(110); // per-target impacts carry the show
        break;
    }
  }

  private async hitReact(def: Unit, dmg: number, eff: number, crit: boolean, from?: THREE.Vector3): Promise<void> {
    const pct = dmg / def.g.stats.hp;
    const color = crit ? '#ffd24e' : eff > 1 ? '#ff6a5a' : eff < 1 ? '#8b93b8' : '#ffffff';
    const scale = crit || pct > 0.25 ? 1.6 : pct > 0.15 ? 1.25 : 1;
    const pos = def.rig.group.position.clone(); pos.y += 1.8;
    makeFloatingDamageText(this.scene, pos, `${dmg}`, color, scale);
    this.fx.flashMaterials(def.rig.body, eff > 1 ? 0xff6a3a : 0xffffff);
    this.fx.glow(this.chest(def), 0xffffff, { scale: 0.8 + pct * 2.2, life: 0.2 });
    sfx(crit ? 'crit' : 'hit');
    this.dmgFeedback(def, dmg, crit, eff);

    // knockback away from the blow, with squash-and-stretch and a shiver on landing
    const orig = def.rig.group.position.clone();
    const dir = from
      ? orig.clone().sub(from).setY(0).normalize()
      : new THREE.Vector3(def.side === 'enemy' ? 1 : -1, 0, 0);
    if (!isFinite(dir.x) || dir.lengthSq() < 0.001) dir.set(def.side === 'enemy' ? 1 : -1, 0, 0);
    const out = orig.clone().add(dir.multiplyScalar(Math.min(0.6, 0.22 + pct * 0.9)));
    await tween(0.09, t => {
      def.rig.group.position.lerpVectors(orig, out, t);
      def.rig.group.scale.set(1 + t * 0.13, 1 - t * 0.2, 1 + t * 0.13);
    }, Ease.outQuad);
    await tween(0.26, t => {
      def.rig.group.position.lerpVectors(out, orig, t);
      def.rig.group.position.x += Math.sin(t * Math.PI * 5) * 0.05 * (1 - t);
      def.rig.group.scale.set(1 + (1 - t) * 0.13, 1 - (1 - t) * 0.2, 1 + (1 - t) * 0.13);
    });
    def.rig.group.position.copy(orig);
    def.rig.group.scale.setScalar(1);
  }

  private async koAnim(u: Unit): Promise<void> {
    sfx('ko');
    const color = TYPE_COLORS[u.g.species.type];
    this.fx.flashMaterials(u.rig.body, 0xffffff, 0.3);
    await tween(0.55, t => {
      u.rig.group.rotation.z = (u.side === 'player' ? -1 : 1) * t * Math.PI / 2;
      u.rig.group.position.y = -t * 0.3;
      u.rig.group.scale.setScalar(1 - t * 0.4);
    });
    // the body gives out in a bloom of type-light
    const p = u.rig.group.position.clone().setY(0.5);
    this.fx.burst(p, color, { count: 34, speed: 2.6, gravity: 1.2, drag: 1.2, life: 0.9, size: 0.13 });
    this.fx.glow(p, color, { scale: 1.9, life: 0.5 });
    this.fx.ring(u.rig.group.position, color, { maxR: 1.7 });
    this.fx.shake(0.12, 0.3);
    u.rig.group.visible = false;
    u.rig.group.rotation.z = 0;
    u.rig.group.scale.setScalar(1);
    u.rig.group.position.y = 0;
  }

  // ---------- damage ----------
  /**
   * HP-proportional damage model. A neutral hit with a starter technique
   * removes ~10–15% of the target's max HP; the biggest arts remove ~40%.
   * Nothing short of a critical super-effective ultimate can pass 70% —
   * one-shots are impossible by construction.
   */
  private computeDamage(att: Unit, def: Unit, tech: Technique): { dmg: number; eff: number; crit: boolean } {
    const as = att.g.stats, ds = def.g.stats;
    const atkStat = (tech.kind === 'phys' ? as.atk : as.wis) * att.mods.atk;
    const defStat = (tech.kind === 'phys' ? ds.def : (ds.def + ds.wis) / 2) * def.mods.def;
    // element effectiveness: attack element vs every defender element
    const attEl = TYPE_ELEMENT[tech.type];
    const eff = elementMult(attEl, elementsOf(def.g.speciesId));
    const stab = elementsOf(att.g.speciesId).includes(attEl) ? 1.15 : 1;
    const crit = Math.random() < 0.08;
    const variance = 0.9 + Math.random() * 0.2;
    const pressure = atkStat / (atkStat + defStat * 1.15);   // 0.5 at parity
    let pct = (tech.power / 90) * pressure * eff * stab * variance;
    pct *= 1.5; // increase all damage output by 50%
    if (crit) pct *= 1.5;
    if (def.guarding) pct *= 0.45;

    // Apply Player Guild Perks / Battle Synergies
    const perks = Player.activeInstance?.guildPerks;
    const playerUnits = this.alive('player');

    if (perks) {
      if (att.side === 'player') {
        // Mono-Element Synergy: All active units share at least one element
        if (perks.monoSynergy > 0 && playerUnits.length > 0) {
          let shared = elementsOf(playerUnits[0].g.speciesId);
          for (let i = 1; i < playerUnits.length; i++) {
            const el = elementsOf(playerUnits[i].g.speciesId);
            shared = shared.filter(x => el.includes(x));
          }
          if (shared.length > 0) {
            const boost = 0.05 + (perks.monoSynergy - 1) * 0.01;
            pct *= (1 + boost);
            this.log(`<span style="color:var(--ui-gold)">[Mono-Element Synergy: +${Math.round(boost * 100)}% Damage!]</span>`);
          }
        }

        // Tactical Strike Synergy: Hit super-effective elements
        if (perks.tacticalSynergy > 0 && eff > 1.0) {
          const boost = 0.05 + (perks.tacticalSynergy - 1) * 0.01;
          pct *= (1 + boost);
          this.log(`<span style="color:var(--ui-gold)">[Tactical Strike Synergy: +${Math.round(boost * 100)}% Damage!]</span>`);
        }
      }

      if (def.side === 'player') {
        // Rainbow Guard Synergy: Union of all elements across active player units is >= 3
        if (perks.rainbowSynergy > 0 && playerUnits.length > 0) {
          const union = new Set<Element>();
          for (const u of playerUnits) {
            for (const el of elementsOf(u.g.speciesId)) {
              union.add(el);
            }
          }
          if (union.size >= 3) {
            const reduction = 0.05 + (perks.rainbowSynergy - 1) * 0.01;
            pct *= (1 - reduction);
            this.log(`<span style="color:var(--ui-gold)">[Rainbow Guard Synergy: -${Math.round(reduction * 100)}% Damage Taken!]</span>`);
          }
        }
      }
    }

    pct = Math.min(0.7, pct); // hard ceiling — never a one-shot
    return { dmg: Math.max(1, Math.floor(ds.hp * pct)), eff, crit };
  }

  private effText(eff: number, crit: boolean): string {
    let s = '';
    if (crit) s += ' <span style="color:var(--ui-gold)">Critical!</span>';
    if (eff > 1) s += ' <span style="color:var(--ui-red)">Devastating!</span>';
    else if (eff < 1) s += ' <span style="color:var(--ui-dim)">…resisted.</span>';
    return s;
  }

  private alive(side: 'player' | 'enemy'): Unit[] {
    return this.units.filter(u => u.side === side && !u.g.fainted);
  }

  // ---------- technique execution ----------
  private async execTech(att: Unit, tech: Technique, target: Unit | null): Promise<void> {
    att.g.sp = Math.max(0, att.g.sp - tech.spCost);
    const color = TYPE_COLORS[tech.type];
    const who = att.side === 'enemy' ? `Wild ${att.g.nickname}` : att.g.nickname;
    this.log(`<b style="color:${TYPE_CSS[tech.type]}">${who}</b> uses <b>${tech.name}</b>!`);

    if (tech.effect === 'heal') {
      const tgt = target ?? att;
      await this.castWindup(att, color);
      const amount = Math.floor(tech.power + att.g.stats.wis * 0.6);
      tgt.g.hp = Math.min(tgt.g.stats.hp, tgt.g.hp + amount);
      sfx('heal');
      this.fx.spiral(tgt.rig.group.position.clone(), 0x5ad88a, { up: true, dur: 0.9 });
      this.fx.glow(this.chest(tgt), 0x8af2b0, { scale: 1.6, life: 0.5 });
      this.fx.burst(this.chest(tgt).setY(2.3), 0x8af2b0, { count: 16, speed: 1.1, gravity: -2, life: 0.9, size: 0.11 });
      makeFloatingDamageText(this.scene, tgt.rig.group.position.clone().setY(2), `+${amount}`, '#5ad88a', 1.15);
      if (att.side === 'player') this.stat(att.g.id).assists += 1;
      this.pushLog('💚', `<b>${who}</b> used ${tech.name} — restored ${amount} HP to ${tgt.g.nickname}.`);
      this.renderCards();
      await wait(500);
      return;
    }
    if (tech.effect === 'buffAtk' || tech.effect === 'buffDef') {
      await this.castWindup(att, color);
      sfx('buff');
      if (tech.effect === 'buffAtk') {
        att.mods.atk = Math.min(1.8, att.mods.atk + 0.3);
        this.fx.spiral(att.rig.group.position.clone(), 0xff8a4a, { up: true, dur: 0.8 });
        this.fx.ring(att.rig.group.position, 0xff8a4a, { maxR: 1.4 });
      } else {
        att.mods.def = Math.min(1.8, att.mods.def + 0.3);
        this.fx.spiral(att.rig.group.position.clone(), 0x5ab8e8, { up: true, dur: 0.8 });
        this.fx.ring(att.rig.group.position, 0x5ab8e8, { maxR: 1.4, y: 1.0, tube: 0.04 });
      }
      if (att.side === 'player') this.stat(att.g.id).assists += 1;
      this.pushLog('🔼', `<b>${who}</b> used ${tech.name} — ${tech.effect === 'buffAtk' ? 'Attack' : 'Defense'} rose.`);
      this.log(`${who}'s ${tech.effect === 'buffAtk' ? 'Attack' : 'Defense'} rose!`);
      await wait(600);
      return;
    }
    if (tech.effect === 'debuffDef' || tech.effect === 'debuffSpd') {
      await this.castWindup(att, color);
      const foes = this.alive(att.side === 'player' ? 'enemy' : 'player');
      sfx('debuff');
      let dealt = 0;
      for (const f of foes) {
        if (tech.effect === 'debuffDef') f.mods.def = Math.max(0.5, f.mods.def - 0.2);
        else f.mods.spd = Math.max(0.5, f.mods.spd - 0.2);
        this.fx.spiral(f.rig.group.position.clone(), 0x9a5af2, { up: false, dur: 0.7 });
        this.fx.flashMaterials(f.rig.body, 0x9a5af2, 0.25);
        if (tech.power > 0) {
          const { dmg, eff, crit } = this.computeDamage(att, f, tech);
          f.g.hp = Math.max(0, f.g.hp - dmg);
          this.recordHit(att, f, dmg);
          dealt += dmg;
          this.elementalImpact(f, tech.type, false);
          await this.hitReact(f, dmg, eff, crit, att.rig.group.position);
        }
      }
      this.pushLog('🔽', `<b>${who}</b> used ${tech.name} — foes' ${tech.effect === 'debuffDef' ? 'Defense' : 'Speed'} fell${dealt ? ` (${dealt} dmg)` : ''}.`);
      this.log(`The foes' ${tech.effect === 'debuffDef' ? 'Defense' : 'Speed'} fell!`);
      this.renderCards();
      await this.cleanupKOs();
      await wait(500);
      return;
    }

    // damage / drain
    const targets = tech.target === 'all'
      ? this.alive(att.side === 'player' ? 'enemy' : 'player')
      : target ? [target] : [];
    const big = tech.power >= 55 || tech.target === 'all';
    let totalDmg = 0;

    if (tech.kind === 'phys' && targets.length === 1) {
      const tgt = targets[0];
      const home = att.rig.group.position.clone();
      await this.meleeRush(att, tgt, color);
      const { dmg, eff, crit } = this.computeDamage(att, tgt, tech);
      tgt.g.hp = Math.max(0, tgt.g.hp - dmg);
      this.recordHit(att, tgt, dmg);
      totalDmg += dmg;
      this.elementalImpact(tgt, tech.type, big || crit);
      if (tech.effect === 'drain') this.drainFX(att, tgt, dmg);
      this.log(`<b>${who}</b> uses <b>${tech.name}</b>!${this.effText(eff, crit)}`);
      await this.hitReact(tgt, dmg, eff, crit, att.rig.group.position);
      await this.meleeReturn(att, home);
    } else {
      if (targets.length === 1) this.faceTo(att, targets[0].rig.group.position);
      await this.castWindup(att, color);
      if (targets.length === 1) {
        await this.artDelivery(att, targets[0], tech.type);
      } else {
        await this.artBarragePrelude(att, targets, tech.type);
      }
      for (const tgt of targets) {
        if (tgt.g.fainted) continue;
        const { dmg, eff, crit } = this.computeDamage(att, tgt, tech);
        tgt.g.hp = Math.max(0, tgt.g.hp - dmg);
        this.recordHit(att, tgt, dmg);
        totalDmg += dmg;
        this.elementalImpact(tgt, tech.type, big || crit);
        if (tech.effect === 'drain') this.drainFX(att, tgt, dmg);
        this.log(`<b>${who}</b> uses <b>${tech.name}</b>!${this.effText(eff, crit)}`);
        await this.hitReact(tgt, dmg, eff, crit, att.rig.group.position);
        if (targets.length > 1) await wait(80);
      }
      this.faceHome(att);
    }
    this.pushLog(tech.kind === 'phys' ? '⚔️' : '✦', `<b>${who}</b> used ${tech.name} — ${totalDmg} dmg${targets.length > 1 ? ` to ${targets.length} foes` : ''}.`);
    this.renderCards();
    await this.cleanupKOs();
    await wait(420);
  }

  /** Stolen life streams back to the attacker as crimson motes. */
  private drainFX(att: Unit, tgt: Unit, dmg: number): void {
    const heal = Math.floor(dmg * 0.5);
    att.g.hp = Math.min(att.g.stats.hp, att.g.hp + heal);
    this.fx.projectile(this.chest(tgt), this.chest(att), 0xd84a8a, { size: 0.12, dur: 0.45, arc: 1.3 })
      .then(() => {
        this.fx.glow(this.chest(att), 0x5ad88a, { scale: 1.2, life: 0.35 });
        makeFloatingDamageText(this.scene, att.rig.group.position.clone().setY(2), `+${heal}`, '#5ad88a');
      });
  }

  private async basicStrike(att: Unit, target: Unit): Promise<void> {
    const who = att.side === 'enemy' ? `Wild ${att.g.nickname}` : att.g.nickname;
    this.log(`<b>${who}</b> strikes!`);
    const color = TYPE_COLORS[att.g.species.type];
    const home = att.rig.group.position.clone();
    await this.meleeRush(att, target, color);
    const as = att.g.stats, ds = target.g.stats;
    const variance = 0.9 + Math.random() * 0.2;
    const crit = Math.random() < 0.06;
    const pressure = (as.atk * att.mods.atk) / (as.atk * att.mods.atk + ds.def * target.mods.def * 1.15);
    let pct = 0.30 * pressure * variance;   // a plain strike ≈ 12–18% at parity
    if (crit) pct *= 1.5;
    if (target.guarding) pct *= 0.45;
    const dmg = Math.max(1, Math.floor(ds.hp * Math.min(0.45, pct)));
    target.g.hp = Math.max(0, target.g.hp - dmg);
    this.recordHit(att, target, dmg);
    att.g.sp = Math.min(as.sp, att.g.sp + Math.max(2, Math.floor(as.sp * 0.08))); // striking builds SP
    this.fx.burst(this.chest(target), 0xfff0d0, { count: 14, speed: 2.6, gravity: -3, life: 0.45, size: 0.1 });
    this.fx.glow(this.chest(target), color, { scale: 1.0, life: 0.22 });
    await this.hitReact(target, dmg, 1, crit, att.rig.group.position);
    await this.meleeReturn(att, home);
    this.pushLog('👊', `<b>${who}</b> attacked ${target.g.nickname} — ${dmg} dmg.`);
    this.renderCards();
    await this.cleanupKOs();
    await wait(380);
  }

  private async cleanupKOs(): Promise<void> {
    for (const u of this.units) {
      if (u.g.fainted && u.rig.group.visible) {
        this.log(`<b>${u.g.nickname}</b> is down!`);
        this.pushLog('💀', `<b>${u.g.nickname}</b> was defeated.`);
        await this.koAnim(u);
      }
    }
  }

  // ---------- player turn ----------
  private async pickTarget(prompt: string, candidates: Unit[]): Promise<Unit | null> {
    if (candidates.length === 1) return candidates[0];
    this.log(prompt);
    const idx = await this.menu([
      ...candidates.map(u => ({
        label: `<span style="color:${TYPE_CSS[u.g.species.type]}">${u.g.nickname}</span> Lv${u.g.level} — ${u.g.hp}/${u.g.stats.hp} HP`,
      })),
      { label: '← Back', cls: 'danger' },
    ]);
    return idx < candidates.length ? candidates[idx] : null;
  }

  private async playerTurn(u: Unit): Promise<'acted' | 'fled'> {
    // Auto-Action: if engaged and this Guardian has a remembered order, redo it.
    if (this.autoMode) {
      const replay = this.reresolveAction(u, this.lastAction.get(u.g.id));
      if (replay) { await this.performAction(u, replay); return 'acted'; }
      // nothing usable to repeat for this one — fall through to the manual menu
    }

    while (true) {
      this.log(`What will <b style="color:${TYPE_CSS[u.g.species.type]}">${u.g.nickname}</b> do?`);
      const giftItems = [...this.player.inventory.keys()].filter(id => ITEMS[id].kind === 'gift');
      const usable = [...this.player.inventory.keys()].filter(id => ['heal', 'sp', 'revive'].includes(ITEMS[id].kind));
      const buttons = [
        { key: 'strike', label: '👊 Attack <span class="sub">(normal · builds SP)</span>' },
        { key: 'tech', label: '⚔️ Technique' },
        { key: 'guard', label: '🛡️ Guard <span class="sub">(half damage, +SP)</span>' },
        { key: 'item', label: `🎒 Item <span class="sub">(${usable.length})</span>`, disabled: !usable.length },
        { key: 'gift', label: `🎁 Gift <span class="sub">(bond wild Guardians)</span>`, disabled: !this.opts.wild || !giftItems.length },
        { key: 'swap', label: '🔄 Swap <span class="sub">(reserve)</span>', disabled: !this.player.reserve.some(g => !g.fainted) },
        { key: 'auto', label: '⚡ Auto-Action <span class="sub">(repeat last orders · A)</span>', disabled: !this.lastAction.has(u.g.id), cls: 'primary' },
        { key: 'flee', label: '🏃 Flee', disabled: !!this.opts.boss, cls: 'danger' },
      ];
      const act = buttons[await this.menu(buttons)].key;

      if (act === 'strike') {
        const target = await this.pickTarget('Attack which foe?', this.alive('enemy'));
        if (!target) continue;
        return this.commit(u, { kind: 'strike', target });
      }
      if (act === 'tech') {
        const techs = u.g.techniques;
        const ti = await this.menu([
          ...techs.map(t => ({
            label: `<span style="color:${TYPE_CSS[t.type]}">${t.name}</span> <span class="sub">${t.spCost} SP · Pow ${t.power} · ${t.target}</span>`,
            disabled: u.g.sp < t.spCost,
          })),
          { key: 'back', label: '← Back', cls: 'danger' },
        ]);
        if (ti >= techs.length) continue;
        const tech = techs[ti];
        let target: Unit | null = null;
        if (tech.target === 'one') {
          target = await this.pickTarget('Target which foe?', this.alive('enemy'));
          if (!target) continue;
        } else if (tech.target === 'ally') {
          target = await this.pickTarget('Heal which ally?', this.alive('player'));
          if (!target) continue;
        }
        return this.commit(u, { kind: 'tech', tech, target });
      }
      if (act === 'guard') {
        return this.commit(u, { kind: 'guard' });
      }
      if (act === 'item') {
        const usableIds = [...this.player.inventory.keys()].filter(id => ['heal', 'sp', 'revive'].includes(ITEMS[id].kind));
        const ii = await this.menu([
          ...usableIds.map(id => ({ label: `${ITEMS[id].name} ×${this.player.itemCount(id)} <span class="sub">${ITEMS[id].desc}</span>` })),
          { key: 'back', label: '← Back', cls: 'danger' },
        ]);
        if (ii >= usableIds.length) continue;
        const itemId = usableIds[ii];
        const it = ITEMS[itemId];
        const pool = it.kind === 'revive'
          ? this.units.filter(x => x.side === 'player' && x.g.fainted)
          : this.alive('player');
        if (!pool.length) { toast('No valid target.', 'red'); continue; }
        const target = await this.pickTarget(`Use ${it.name} on whom?`, pool);
        if (!target) continue;
        return this.commit(u, { kind: 'item', itemId, target });
      }
      if (act === 'gift') {
        const giftIds = [...this.player.inventory.keys()].filter(id => ITEMS[id].kind === 'gift');
        this.log(`💜 Gifts build <b>Bond</b>. Win the battle, and bonded wild Guardians may ask to <b>join you</b> — watch the pink meter on their card.`);
        const gi = await this.menu([
          ...giftIds.map(id => ({ label: `${ITEMS[id].name} ×${this.player.itemCount(id)} <span class="sub">${ITEMS[id].desc} (+${ITEMS[id].value}~ bond)</span>` })),
          { key: 'back', label: '← Back', cls: 'danger' },
        ]);
        if (gi >= giftIds.length) continue;
        // target pick shows each wild foe's live bond and join chance
        const cands = this.alive('enemy');
        let target: Unit | null = cands[0] ?? null;
        if (cands.length > 1) {
          this.log('Gift to which wild Guardian?');
          const ti = await this.menu([
            ...cands.map(c => ({
              label: `<span style="color:${TYPE_CSS[c.g.species.type]}">${c.g.nickname}</span> Lv${c.g.level} <span class="sub">💜 bond ${c.bond} · ${Math.round(this.captureChance(c) * 100)}% join chance</span>`,
            })),
            { key: 'back', label: '← Back', cls: 'danger' },
          ]);
          target = ti < cands.length ? cands[ti] : null;
        }
        if (!target) continue;
        return this.commit(u, { kind: 'gift', itemId: giftIds[gi], target });
      }
      if (act === 'swap') {
        const cands = this.player.reserve.filter(g => !g.fainted);
        const si = await this.menu([
          ...cands.map(g => ({ label: `${g.nickname} Lv${g.level} <span class="sub">${g.hp}/${g.stats.hp} HP</span>` })),
          { key: 'back', label: '← Back', cls: 'danger' },
        ]);
        if (si >= cands.length) continue;
        await this.doSwap(u, cands[si]);   // swaps aren't remembered for Auto-Action
        return 'acted';
      }
      if (act === 'auto') {
        this.setAuto(true);
        const replay = this.reresolveAction(u, this.lastAction.get(u.g.id));
        if (replay) { await this.performAction(u, replay); return 'acted'; }
        continue;   // no memory yet for this Guardian — let the player choose
      }
      if (act === 'flee') {
        const mySpd = this.alive('player').reduce((s, x) => s + x.g.stats.spd, 0) / Math.max(1, this.alive('player').length);
        const foeSpd = this.alive('enemy').reduce((s, x) => s + x.g.stats.spd, 0) / Math.max(1, this.alive('enemy').length);
        const chance = Math.min(0.95, Math.max(0.25, 0.55 + (mySpd - foeSpd) * 0.02));
        if (Math.random() < chance) {
          this.log('Got away safely!');
          await wait(700);
          return 'fled';
        }
        this.log('Couldn\'t escape!');
        await wait(700);
        return 'acted';
      }
    }
  }

  /** Remember an order (so Auto-Action can redo it) and carry it out. */
  private async commit(u: Unit, action: PlayerAction): Promise<'acted'> {
    this.lastAction.set(u.g.id, action);
    await this.performAction(u, action);
    return 'acted';
  }

  /** Carry out a previously-chosen order. Targets are assumed resolved. */
  private async performAction(u: Unit, a: PlayerAction): Promise<void> {
    switch (a.kind) {
      case 'strike': await this.basicStrike(u, a.target); break;
      case 'tech': await this.execTech(u, a.tech, a.target); break;
      case 'guard': await this.doGuard(u); break;
      case 'item': await this.doItem(u, a.itemId, a.target); break;
      case 'gift': await this.doGift(u, a.itemId, a.target); break;
    }
  }

  /**
   * Re-validate a remembered order against the current field for Auto-Action:
   * dead targets are re-picked, spent SP / used-up items fall back to a basic
   * Attack. Returns null only when nothing at all can be done.
   */
  private reresolveAction(u: Unit, a: PlayerAction | undefined): PlayerAction | null {
    if (!a) return null;
    switch (a.kind) {
      case 'guard':
        return { kind: 'guard' };
      case 'strike': {
        const t = a.target && !a.target.g.fainted ? a.target : this.weakestEnemy();
        return t ? { kind: 'strike', target: t } : this.fallbackStrike();
      }
      case 'tech': {
        const tech = u.g.techniques.find(t => t.id === a.tech.id);
        if (!tech || u.g.sp < tech.spCost) return this.fallbackStrike();
        if (tech.target === 'one') {
          const t = a.target && !a.target.g.fainted ? a.target : this.weakestEnemy();
          return t ? { kind: 'tech', tech, target: t } : this.fallbackStrike();
        }
        if (tech.target === 'ally') {
          const t = a.target && a.target.side === 'player' && !a.target.g.fainted ? a.target : (this.mostHurtAlly() ?? u);
          return { kind: 'tech', tech, target: t };
        }
        return { kind: 'tech', tech, target: null };  // all / self
      }
      case 'item': {
        if (this.player.itemCount(a.itemId) <= 0) return this.fallbackStrike();
        const it = ITEMS[a.itemId];
        const pool = it.kind === 'revive'
          ? this.units.filter(x => x.side === 'player' && x.g.fainted)
          : this.alive('player');
        let t = a.target && pool.includes(a.target) ? a.target
          : it.kind === 'heal' ? this.mostHurtAlly() : pool[0];
        if (!t || !pool.includes(t)) t = pool[0];
        return t ? { kind: 'item', itemId: a.itemId, target: t } : this.fallbackStrike();
      }
      case 'gift': {
        if (!this.opts.wild || this.player.itemCount(a.itemId) <= 0) return this.fallbackStrike();
        const t = a.target && !a.target.g.fainted ? a.target : this.alive('enemy')[0];
        return t ? { kind: 'gift', itemId: a.itemId, target: t } : this.fallbackStrike();
      }
    }
  }

  private weakestEnemy(): Unit | null {
    const e = this.alive('enemy');
    return e.length ? e.reduce((a, b) => (a.g.hp <= b.g.hp ? a : b)) : null;
  }
  private mostHurtAlly(): Unit | null {
    const a = this.alive('player');
    if (!a.length) return null;
    return a.reduce((x, y) => (x.g.hp / x.g.stats.hp <= y.g.hp / y.g.stats.hp ? x : y));
  }
  private fallbackStrike(): PlayerAction | null {
    const t = this.weakestEnemy();
    return t ? { kind: 'strike', target: t } : null;
  }

  /** Toggle Auto-Action and reflect it on the HUD banner. */
  private setAuto(on: boolean): void {
    this.autoMode = on;
    const el = document.getElementById('battle-auto');
    if (el) el.style.display = on ? 'block' : 'none';
    toast(on ? '⚡ Auto-Action ON — repeating your last orders. Press A to stop.' : '⚡ Auto-Action off.', on ? 'gold' : '');
  }

  /** Cycle battle speed 1× → 2× → 3× and apply it to all timing. */
  private cycleSpeed(): void {
    this.speedMul = this.speedMul >= 3 ? 1 : this.speedMul + 1;
    setTimeScale(this.speedMul);
    const el = document.getElementById('battle-speed');
    if (el) {
      el.textContent = `${this.speedMul > 1 ? '⏩' : '▶'} ${this.speedMul}×`;
      el.classList.toggle('fast', this.speedMul > 1);
    }
  }

  // ---------- action executors (shared by manual play and Auto-Action) ----------
  private async doGuard(u: Unit): Promise<void> {
    u.guarding = true;
    u.g.sp = Math.min(u.g.stats.sp, u.g.sp + Math.max(3, Math.floor(u.g.stats.sp * 0.12)));
    sfx('guard');
    this.fx.ring(u.rig.group.position, 0x5ab8e8, { maxR: 1.3, y: 0.9, tube: 0.05, life: 0.6 });
    this.fx.glow(this.chest(u), 0x8ad0f2, { scale: 1.5, life: 0.5, grow: 0.6 });
    this.log(`<b>${u.g.nickname}</b> braces for impact!`);
    if (u.side === 'player') this.stat(u.g.id).guards += 1;
    this.pushLog('🛡️', `<b>${u.g.nickname}</b> guarded.`);
    this.renderCards();
    await wait(600);
  }

  private async doItem(u: Unit, itemId: string, target: Unit): Promise<void> {
    const it = ITEMS[itemId];
    this.player.removeItem(itemId);
    const s = target.g.stats;
    if (it.kind === 'heal') target.g.hp = Math.min(s.hp, target.g.hp + it.value);
    else if (it.kind === 'sp') target.g.sp = Math.min(s.sp, target.g.sp + it.value);
    else if (it.kind === 'revive') {
      target.g.hp = Math.floor(s.hp * it.value);
      target.rig.group.visible = true;
      target.rig.group.rotation.z = 0;
      target.rig.group.scale.setScalar(1);
      target.rig.group.position.copy(this.slotPos('player', target.slot));
      this.fx.pillar(target.rig.group.position, 0x8af2b0, { height: 4, radius: 0.6, life: 0.8 });
    }
    sfx('heal');
    this.fx.spiral(target.rig.group.position.clone(), 0x5ad88a, { up: true, dur: 0.8 });
    this.fx.glow(this.chest(target), 0x8af2b0, { scale: 1.3, life: 0.4 });
    this.log(`Used <b>${it.name}</b> on ${target.g.nickname}!`);
    makeFloatingDamageText(this.scene, target.rig.group.position.clone().setY(2), '♥', '#5ad88a');
    if (u.side === 'player') this.stat(u.g.id).assists += 1;
    this.pushLog('🎒', `Used <b>${it.name}</b> on ${target.g.nickname}.`);
    this.renderCards();
    await wait(600);
  }

  private async doGift(u: Unit, itemId: string, target: Unit): Promise<void> {
    const it = ITEMS[itemId];
    this.player.removeItem(itemId);
    const gain = Math.floor(it.value * target.favor);
    target.bond += gain;
    const reaction = target.favor > 1.15 ? 'devours it joyfully!' : target.favor < 0.95 ? 'sniffs it cautiously…' : 'munches it happily.';
    this.log(`Wild <b>${target.g.nickname}</b> ${reaction} <span style="color:var(--ui-purple)">(bond +${gain} → ${Math.round(this.captureChance(target) * 100)}% join chance)</span>`);
    makeFloatingDamageText(this.scene, target.rig.group.position.clone().setY(2.1), '♥', '#f25aa8');
    sfx('heal');
    this.fx.spiral(target.rig.group.position.clone(), 0xf25aa8, { up: true, dur: 0.9 });
    this.fx.burst(this.chest(target), 0xf28ac4, { count: 16, speed: 1.4, gravity: -1.4, life: 0.8, size: 0.12 });
    if (u.side === 'player') this.stat(u.g.id).assists += 1;
    this.pushLog('🎁', `Gifted <b>${it.name}</b> to wild ${target.g.nickname} (bond +${gain}).`);
    this.renderCards();
    await wait(700);
  }

  private async doSwap(u: Unit, incoming: Guardian): Promise<void> {
    const pi = this.player.party.indexOf(u.g);
    const ri = this.player.reserve.indexOf(incoming);
    this.player.party[pi] = incoming;
    this.player.reserve[ri] = u.g;
    disposeRig(u.rig);
    u.g = incoming;
    u.rig = makeGuardian(incoming.speciesId, incoming.customization);
    u.rig.group.position.copy(this.slotPos('player', u.slot));
    u.rig.group.rotation.y = Math.PI / 2;
    this.scene.add(u.rig.group);
    u.mods = { atk: 1, def: 1, spd: 1 };
    const swapColor = TYPE_COLORS[incoming.species.type];
    this.fx.pillar(u.rig.group.position, swapColor, { height: 4, radius: 0.6, life: 0.7 });
    this.fx.ring(u.rig.group.position, swapColor, { maxR: 1.5 });
    sfx('confirm');
    this.log(`Go, <b>${incoming.nickname}</b>!`);
    this.pushLog('🔄', `Swapped in <b>${incoming.nickname}</b>.`);
    this.renderCards();
    await wait(600);
  }

  // ---------- enemy AI ----------
  private async enemyTurn(u: Unit): Promise<void> {
    const allies = this.alive('enemy');
    const foes = this.alive('player');
    if (!foes.length) return;
    const techs = u.g.techniques.filter(t => u.g.sp >= t.spCost);

    // 1. heal a hurt ally if possible
    const healTech = techs.find(t => t.effect === 'heal');
    const hurtAlly = allies.find(a => a.g.hp / a.g.stats.hp < 0.4);
    if (healTech && hurtAlly && Math.random() < 0.6) {
      await this.execTech(u, healTech, hurtAlly);
      return;
    }
    // 2. buff sometimes when healthy
    const buffTech = techs.find(t => t.effect === 'buffAtk' || t.effect === 'buffDef');
    if (buffTech && u.mods.atk < 1.3 && u.g.hp / u.g.stats.hp > 0.7 && Math.random() < 0.25) {
      await this.execTech(u, buffTech, null);
      return;
    }
    // 3. pick best damaging tech vs best target (prefer type advantage & low HP)
    const dmgTechs = techs.filter(t => t.effect === 'damage' || t.effect === 'drain' || (t.power > 0 && t.effect.startsWith('debuff')));
    if (dmgTechs.length && Math.random() < 0.8) {
      let best: { t: Technique; tgt: Unit; score: number } | null = null;
      for (const t of dmgTechs) {
        for (const f of foes) {
          const eff = elementMult(TYPE_ELEMENT[t.type], elementsOf(f.g.speciesId));
          const lowHpBias = 1 + (1 - f.g.hp / f.g.stats.hp) * 0.5;
          const score = t.power * eff * lowHpBias * (t.target === 'all' ? 1.4 : 1) * (0.9 + Math.random() * 0.2);
          if (!best || score > best.score) best = { t, tgt: f, score };
        }
      }
      if (best) {
        await this.execTech(u, best.t, best.t.target === 'one' ? best.tgt : null);
        return;
      }
    }
    // 4. guard occasionally at low HP
    if (u.g.hp / u.g.stats.hp < 0.25 && Math.random() < 0.3) {
      u.guarding = true;
      sfx('guard');
      this.fx.ring(u.rig.group.position, 0x5ab8e8, { maxR: 1.3, y: 0.9, tube: 0.05, life: 0.6 });
      this.log(`Wild <b>${u.g.nickname}</b> turtles up!`);
      this.pushLog('🛡️', `Wild ${u.g.nickname} guarded.`);
      await wait(550);
      return;
    }
    // 5. fallback strike weakest foe
    const target = foes.reduce((a, b) => (a.g.hp < b.g.hp ? a : b));
    await this.basicStrike(u, target);
  }

  // ============================================================
  // Victory sequence — report → EXP/levels → evolutions →
  // new techniques → befriended wild Guardians.
  // ============================================================
  private async grantRewards(): Promise<void> {
    const stageMult: Record<string, number> = { Novice: 1, Adept: 1.8, Elite: 3.2, Apex: 5.5, Legendary: 8, Aether: 12 };
    let exp = 0, shards = 0;
    for (const e of this.units.filter(x => x.side === 'enemy')) {
      exp += Math.floor(e.g.level * 9 * (stageMult[e.g.species.stage] ?? 1));
      shards += Math.floor(e.g.level * (4 + Math.random() * 5));
    }
    if (this.opts.boss) { exp = Math.floor(exp * 1.6); shards = Math.floor(shards * 2.5); }
    this.player.shards += shards;
    this.player.battlesWon++;

    // a foe may drop an item
    let dropName: string | null = null;
    if (Math.random() < 0.45) {
      const drops = ['tonic', 'berry', 'cell', 'soda', 'plating', 'honey_roll'];
      const drop = drops[Math.floor(Math.random() * drops.length)];
      if (this.player.addItem(drop)) dropName = ITEMS[drop].name;
    }

    // award EXP, capturing before/after so the screen can show the climb
    const winners = this.player.party.filter(g => !g.fainted && !g.isTemp);
    const share = winners.length ? Math.floor(exp / Math.max(1, Math.ceil(winners.length * 0.75))) : 0;
    const results: GuardianResult[] = winners.map(g => {
      const beforeLevel = g.level, beforeExp = g.exp;
      g.gainExp(share);
      return { g, beforeLevel, afterLevel: g.level, beforeExp, gained: share, newTechs: this.newlyAvailableTechs(g, beforeLevel) };
    });

    playMusic('battle_win');
    sfx('fanfare');
    await this.showVictorySummary(shards, share, dropName, results);

    // evolutions — each its own cinematic
    for (const r of results) {
      if (r.g.pendingEvolution) await this.evolutionScreen(r.g);
    }
    // newly-reachable techniques
    for (const r of results) {
      for (const tech of r.newTechs) {
        if (!r.g.learnedTechs.includes(tech.id)) await this.learnTechFlow(r.g, tech);
      }
    }

    // befriended wild Guardians cross over (3D ceremony — hide the overlay first)
    this.showVictoryOverlay(false);
    for (const e of this.units.filter(x => x.side === 'enemy' && x.wild && x.bond > 0)) {
      if (Math.random() < this.captureChance(e)) await this.befriendScene(e);
      else await say('', `💔 The wild ${e.g.species.name} looks back at you once… then slips away into the dark. (A higher bond would have kept it.)`);
    }
    $('victory-screen').style.display = 'none';
  }

  /** Techniques whose unlock level was crossed this battle and aren't known yet. */
  private newlyAvailableTechs(g: Guardian, beforeLevel: number): Technique[] {
    return g.species.techs
      .filter(t => t.level > beforeLevel && t.level <= g.level && !g.learnedTechs.includes(t.tech))
      .map(t => TECHS[t.tech])
      .filter(Boolean);
  }

  // ---------- victory overlay primitives ----------
  /** Render one victory card and resolve with the picked button index. */
  private victoryCard(bodyHtml: string, buttons: { label: string; cls?: string }[]): Promise<number> {
    return new Promise(resolve => {
      const screen = $('victory-screen');
      const inner = $('victory-inner');
      screen.style.display = 'flex';
      inner.scrollTop = 0;
      inner.innerHTML = `<div class="vc-body">${bodyHtml}</div><div class="vc-actions"></div>`;
      const actions = inner.querySelector('.vc-actions') as HTMLElement;
      const els: HTMLButtonElement[] = [];
      let dispose = () => {};
      const done = (i: number) => { dispose(); resolve(i); };
      buttons.forEach((b, i) => {
        const btn = document.createElement('button');
        btn.className = `ui-btn ${b.cls ?? ''}`;
        btn.innerHTML = b.label;
        btn.onclick = () => done(i);
        actions.appendChild(btn);
        els.push(btn);
      });
      dispose = attachKbNav(els, { onSelect: done });
    });
  }
  private showVictoryOverlay(on: boolean): void {
    $('victory-screen').style.display = on ? 'flex' : 'none';
  }
  /** Fade the full-screen white-out used at the heart of an evolution. */
  private evoFlash(target: number, dur: number): Promise<void> {
    const el = $('evo-flash');
    el.style.display = 'block';
    const start = parseFloat(el.style.opacity || '0');
    return tween(dur, t => { el.style.opacity = String(start + (target - start) * t); }).then(() => {
      el.style.opacity = String(target);
      if (target <= 0) el.style.display = 'none';
    });
  }

  // ---------- victory summary ----------
  private async showVictorySummary(shards: number, share: number, dropName: string | null, results: GuardianResult[]): Promise<void> {
    const reward = `
      <div class="vc-reward-row">
        <div class="vc-reward"><div class="v gold">◆ ${shards}</div><div class="k">Shards</div></div>
        <div class="vc-reward"><div class="v exp">+${share}</div><div class="k">EXP each</div></div>
        ${dropName ? `<div class="vc-reward"><div class="v" style="color:var(--ui-green)">🎁</div><div class="k">${dropName}</div></div>` : ''}
      </div>`;

    const guardianRows = results.map((r, idx) => {
      const g = r.g;
      const color = TYPE_CSS[g.species.type];
      const levels = r.afterLevel - r.beforeLevel;
      const base = expForLevel(r.beforeLevel), next = expForLevel(r.beforeLevel + 1);
      const startPct = Math.max(0, Math.min(100, (r.beforeExp - base) / Math.max(1, next - base) * 100));
      const chips =
        (levels > 0 ? `<span class="vc-chip up">▲ Lv +${levels}</span>` : '') +
        (g.pendingEvolution ? `<span class="vc-chip evo">✦ Evolves!</span>` : '') +
        (r.newTechs.length ? `<span class="vc-chip move">+${r.newTechs.length} move${r.newTechs.length > 1 ? 's' : ''}</span>` : '');
      return `
        <div class="vc-guardian">
          <div class="vc-g-main">
            <div class="vc-g-top">
              <span class="vc-g-name" style="color:${color}">${g.nickname}${chips}</span>
              <span class="vc-g-lvl" id="vc-lvl-${idx}">Lv${r.beforeLevel}</span>
            </div>
            <div class="vc-expbar" id="vc-exp-${idx}"><div style="width:${startPct}%"></div></div>
            <div class="vc-g-meta"><span>${g.species.name}</span><span id="vc-next-${idx}"></span></div>
          </div>
        </div>`;
    }).join('') || '<div class="vc-sub">No EXP earned this battle.</div>';

    const body = `
      <h2 class="vc-title">✦ VICTORY ✦</h2>
      <p class="vc-sub">${this.opts.boss ? 'A mighty foe has fallen!' : 'The wild Guardians are defeated!'}</p>
      ${reward}
      <div class="vc-section-title">Guardians</div>
      ${guardianRows}
      <div class="vc-section-title">Battle Report</div>
      ${this.buildReportHtml()}`;

    const picked = this.victoryCard(body, [{ label: 'Continue ▶', cls: 'primary' }]);
    this.animateExpBars(results);   // play the climb while the card is up
    await picked;
  }

  /** Tween each EXP bar from its pre-battle fill to its new total, rolling levels. */
  private animateExpBars(results: GuardianResult[]): void {
    const inner = $('victory-inner');
    results.forEach((r, idx) => {
      const fill = inner.querySelector<HTMLElement>(`#vc-exp-${idx} > div`);
      const lvlEl = inner.querySelector<HTMLElement>(`#vc-lvl-${idx}`);
      const nextEl = inner.querySelector<HTMLElement>(`#vc-next-${idx}`);
      if (!fill) return;
      const startExp = r.beforeExp, endExp = r.g.exp, cap = r.g.levelCap;
      let shown = r.beforeLevel;
      tween(1.2, t => {
        if (!fill.isConnected) return;
        const cur = startExp + (endExp - startExp) * t;
        let L = 1;
        while (L < cap && cur >= expForLevel(L + 1)) L++;
        const base = expForLevel(L), next = expForLevel(L + 1);
        const pct = L >= cap ? 100 : Math.max(0, Math.min(100, (cur - base) / Math.max(1, next - base) * 100));
        fill.style.width = pct + '%';
        if (lvlEl) lvlEl.textContent = `Lv${L}`;
        if (nextEl) nextEl.textContent = L >= cap ? 'MAX' : `${Math.max(0, Math.ceil(next - cur))} to next`;
        if (L > shown) { shown = L; playMusic('level_up'); }
      }, Ease.outQuad);
    });
  }

  /** The scrolling action log + a per-Guardian stat table. */
  private buildReportHtml(): string {
    const rows = this.timeline.slice(-22).map(e =>
      `<div class="vc-log-row"><span class="ic">${e.icon}</span><span>${e.html}</span></div>`).join('')
      || '<div class="vc-sub" style="text-align:left">A swift, clean victory.</div>';
    const players = this.units.filter(u => u.side === 'player');
    const statRows = players.map(u => {
      const s = this.stats.get(u.g.id) ?? { dealt: 0, taken: 0, kos: 0, assists: 0, guards: 0 };
      return `<tr><td style="color:${TYPE_CSS[u.g.species.type]}">${u.g.nickname}</td>
        <td>${s.dealt}</td><td>${s.taken}</td><td>${s.kos}</td><td>${s.assists}</td><td>${s.guards}</td></tr>`;
    }).join('');
    return `
      <div class="vc-report">${rows}</div>
      <table class="vc-statgrid">
        <thead><tr><th>Guardian</th><th>Dmg</th><th>Taken</th><th>KOs</th><th>Assists</th><th>Guards</th></tr></thead>
        <tbody>${statRows}</tbody>
      </table>`;
  }

  // ---------- technique learning ----------
  private techCardHtml(tech: Technique): string {
    const tgt = tech.target === 'all' ? 'All foes' : tech.target === 'ally' ? 'An ally' : tech.target === 'self' ? 'Self' : 'One foe';
    return `<div class="vc-techcard"><div class="vc-tech">
      <b style="color:${TYPE_CSS[tech.type]}">${tech.name}</b>
      <div class="vc-sub">${tech.kind === 'phys' ? 'Physical' : 'Art'} · ${tech.type} · Pow ${tech.power} · ${tech.spCost} SP · ${tgt}</div>
      <div class="vc-sub">${tech.desc}</div>
    </div></div>`;
  }

  private async learnTechFlow(g: Guardian, tech: Technique): Promise<void> {
    if (g.learnedTechs.length < 4) {
      g.learnedTechs.push(tech.id);
      sfx('fanfare');
      await this.victoryCard(
        `<div class="vc-evo-emoji">✨</div>
         <h2 class="vc-title">New Technique!</h2>
         <p class="vc-sub"><b style="color:${TYPE_CSS[g.species.type]}">${g.nickname}</b> learned <b style="color:${TYPE_CSS[tech.type]}">${tech.name}</b>!</p>
         ${this.techCardHtml(tech)}`,
        [{ label: 'Nice!', cls: 'primary' }],
      );
    } else {
      const current = g.techniques;
      const pick = await this.victoryCard(
        `<div class="vc-evo-emoji">✨</div>
         <h2 class="vc-title">Learn ${tech.name}?</h2>
         <p class="vc-sub"><b style="color:${TYPE_CSS[g.species.type]}">${g.nickname}</b> can learn <b style="color:${TYPE_CSS[tech.type]}">${tech.name}</b>, but already knows four. Forget one to make room?</p>
         ${this.techCardHtml(tech)}`,
        [
          ...current.map(t => ({ label: `Forget <span style="color:${TYPE_CSS[t.type]}">${t.name}</span> <span class="sub">(Pow ${t.power} · ${t.spCost} SP)</span>` })),
          { label: `Keep current moves`, cls: 'danger' },
        ],
      );
      if (pick < current.length) {
        const forgo = current[pick];
        const i = g.learnedTechs.indexOf(forgo.id);
        if (i >= 0) g.learnedTechs.splice(i, 1, tech.id); else g.learnedTechs.push(tech.id);
        sfx('fanfare');
        toast(`${g.nickname} learned ${tech.name}!`, 'gold');
      }
    }
  }

  // ---------- evolution cinematic ----------
  private async evolutionScreen(g: Guardian): Promise<void> {
    const evo = g.pendingEvolution;
    if (!evo) return;
    const u = this.units.find(x => x.side === 'player' && x.g === g);
    if (!u) { const old = g.nickname; g.evolve(); toast(`${old} → ${g.species.name}!`, 'gold'); return; }

    const pick = await this.victoryCard(
      `<div class="vc-evo-emoji">✨</div>
       <h2 class="vc-title">${g.nickname} is evolving!</h2>
       <p class="vc-sub">${g.species.name} is wreathed in light — it can become
         <b style="color:${TYPE_CSS[evo.type]}">${evo.name}</b> <span class="sub">(${evo.stage})</span>.</p>`,
      [{ label: '✨ Evolve!', cls: 'primary' }, { label: 'Not yet' }],
    );
    if (pick === 1) { toast(`${g.nickname} held back its evolution.`); return; }

    const oldName = g.nickname;
    const color = TYPE_COLORS[g.species.type];
    const newColor = TYPE_COLORS[evo.type];

    // reveal the 3D stage
    this.showVictoryOverlay(false);
    const parties = $('battle-parties');
    const prevVis = parties.style.visibility;
    parties.style.visibility = 'hidden';
    this.log(`<b>${oldName}</b> is evolving…`);

    const home = u.rig.group.position.clone();
    playMusic('evolve');
    sfx('charge');
    this.fx.spiral(home.clone(), color, { up: true, dur: 1.3, radius: 0.95, height: 2.1 });
    this.fx.glow(this.chest(u), color, { scale: 2.0, life: 1.0 });
    // accelerating shudder + spin while light gathers
    await tween(1.6, t => {
      const k = 1 + Math.sin(t * Math.PI * 7) * 0.12 * (0.3 + t);
      u.rig.group.scale.setScalar(k);
      u.rig.group.rotation.y += 0.05 + t * 0.28;
    });
    this.fx.implode(this.chest(u), 0xffffff, { count: 44, radius: 2.3, life: 0.6 });
    sfx('boom');
    this.fx.shake(0.18, 0.6);
    await this.evoFlash(1, 0.34);

    // swap the form at the peak of the white-out
    g.evolve();
    disposeRig(u.rig);
    u.rig = makeGuardian(g.speciesId, g.customization);
    u.rig.group.position.copy(home);
    u.rig.group.rotation.y = Math.PI / 2;
    this.scene.add(u.rig.group);
    await wait(280);
    await this.evoFlash(0, 0.5);

    // the new form blooms
    sfx('fanfare');
    this.fx.pillar(home, newColor, { height: 5, radius: 0.8, life: 1.1 });
    this.fx.ring(home, newColor, { maxR: 2.6, life: 0.9 });
    this.fx.burst(this.chest(u), newColor, { count: 40, speed: 2.6, gravity: -0.6, life: 1.2, size: 0.14 });
    this.fx.glow(this.chest(u), 0xffffff, { scale: 2.4, life: 0.7 });
    makeFloatingDamageText(this.scene, home.clone().setY(2.4), g.species.name, '#ffffff', 1.6);
    await tween(0.6, t => { u.rig.group.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.2); });
    u.rig.group.scale.setScalar(1);
    await wait(500);

    parties.style.visibility = prevVis;
    this.renderCards();
    toast(`${oldName} → ${g.species.name}!`, 'gold');
    await this.victoryCard(
      `<div class="vc-evo-emoji">🌟</div>
       <h2 class="vc-title">${oldName} evolved into ${g.species.name}!</h2>
       <p class="vc-sub">A new ${evo.stage}-stage Guardian stands at your side. Its power surges.</p>`,
      [{ label: 'Continue ▶', cls: 'primary' }],
    );
  }

  /** The befriending ceremony: the bonded wild one crosses the arena,
   *  asks to stay, and — if welcomed — is named under a pillar of light. */
  private async befriendScene(e: Unit): Promise<void> {
    const sp = e.g.species;
    const color = TYPE_COLORS[sp.type];

    // it picks itself back up where it fell
    e.rig.group.visible = true;
    e.rig.group.rotation.set(0, -Math.PI / 2, 0);
    e.rig.group.scale.setScalar(1);
    const start = this.slotPos('enemy', e.slot);
    e.rig.group.position.copy(start);
    this.fx.glow(this.chest(e), color, { scale: 1.4, life: 0.5 });
    this.fx.ring(start, 0xf25aa8, { maxR: 1.4, life: 0.6 });
    this.log(`💜 The wild <b>${sp.name}</b> lingers after the battle…`);
    sfx('heal');
    await wait(800);

    // …then pads shyly across the arena to your side, in little hops
    const dest = new THREE.Vector3(-0.8, 0, 0);
    this.faceTo(e, dest);
    sfx('whoosh');
    await tween(1.2, t => {
      e.rig.group.position.lerpVectors(start, dest, t);
      e.rig.group.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.18;
    }, Ease.inOut);
    e.rig.group.position.copy(dest);
    this.faceTo(e, new THREE.Vector3(-4, 0, 0));

    // hearts bloom around it
    this.fx.burst(this.chest(e), 0xf28ac4, { count: 22, speed: 1.5, gravity: -1.6, life: 1.1, size: 0.14 });
    this.fx.spiral(dest.clone(), 0xf25aa8, { up: true, dur: 1.0 });
    makeFloatingDamageText(this.scene, dest.clone().setY(2.2), '♥', '#f25aa8', 1.5);
    this.log(`💜 <b>${sp.name}</b> nudges your Crawler and looks up at you, eyes shining.`);
    await wait(900);

    const pick = await choose('', `💜 The wild ${sp.name} wants to come with you! The gifts meant something. Welcome it to the family?`, ['Welcome it', 'Send it home gently']);
    if (pick === 0) {
      const newG = new Guardian(e.g.speciesId, e.g.level);
      newG.levelCap = Math.max(newG.level + 4, 15 + Math.floor(Math.random() * 12));
      const name = await askName(`Name your new ${sp.name}`, sp.name);
      newG.nickname = name;
      newG.healFull();

      // the naming ceremony — a pillar of bond-light seals the promise
      sfx('fanfare');
      this.fx.pillar(dest, 0xf25aa8, { height: 5, radius: 0.7, life: 1.0 });
      this.fx.ring(dest, color, { maxR: 2.4, life: 0.8 });
      this.fx.glow(this.chest(e), 0xfff0f8, { scale: 2.2, life: 0.7 });
      this.fx.burst(this.chest(e), color, { count: 30, speed: 2.4, gravity: -1, life: 1.0, size: 0.12 });
      makeFloatingDamageText(this.scene, dest.clone().setY(2.4), name, '#ffd8ec', 1.6);
      await tween(0.5, t => {
        const k = 1 + Math.sin(t * Math.PI) * 0.18;
        e.rig.group.scale.setScalar(k);
      });
      e.rig.group.scale.setScalar(1);

      const where = this.player.addGuardian(newG);
      this.player.capturesMade++;
      await say('', `✨ From this day on, this ${sp.name} is ${name} — bonded, not caught. ${name} joined your ${where === 'party' ? 'party' : 'reserve'}!`);
      await this.victoryCard(
        `<div class="vc-evo-emoji">💜</div>
         <h2 class="vc-title">${name} joined your team!</h2>
         <p class="vc-sub">A wild <b style="color:${TYPE_CSS[sp.type]}">${sp.name}</b> was won over by your kindness — it now fights at your side, in your ${where === 'party' ? 'party' : 'reserve'}.</p>`,
        [{ label: 'Welcome aboard!', cls: 'primary' }],
      );
      this.showVictoryOverlay(false);   // hide again for any further 3D ceremonies
    } else {
      // it bounds home with a parting sparkle
      this.faceTo(e, start);
      this.fx.burst(this.chest(e), 0xf28ac4, { count: 12, speed: 1.2, gravity: -1.2, life: 0.8, size: 0.1 });
      await tween(0.9, t => {
        e.rig.group.position.lerpVectors(dest, start.clone().add(new THREE.Vector3(4, 0, 0)), t);
        e.rig.group.position.y = Math.abs(Math.sin(t * Math.PI * 3)) * 0.25;
        e.rig.group.scale.setScalar(1 - t * 0.6);
      }, Ease.inQuad);
      e.rig.group.visible = false;
      e.rig.group.scale.setScalar(1);
      await say('', `The ${sp.name} bounds away home — but it will remember your kindness.`);
    }
  }

  private maxPartyLevel(): number {
    return Math.max(1, ...this.player.party.map(g => g.level));
  }

  /** Free everything the arena allocated (the rigs are handled by disposeRig). */
  private disposeArena(): void {
    this.fx.dispose();
    this.envTick.length = 0;
    this.scene.traverse(o => {
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
    (this.scene.background as THREE.Texture | null)?.dispose?.();
  }

  // ---------- main loop ----------
  async run(): Promise<BattleResult> {
    this.buildArena();
    $('battle-ui').style.display = 'block';
    $('battle-auto').style.display = 'none';
    $('victory-screen').style.display = 'none';
    setStoryInBattle(true);

    // battle speed chip (click or F) — starts at 1×
    this.speedMul = 1;
    setTimeScale(1);
    const speedEl = $('battle-speed');
    speedEl.style.display = 'block';
    speedEl.textContent = '▶ 1×';
    speedEl.classList.remove('fast');
    speedEl.onclick = () => this.cycleSpeed();

    // A cancels Auto-Action; F cycles battle speed — live the whole fight.
    this.autoKeyHandler = (e: KeyboardEvent) => {
      if ((e.key === 'a' || e.key === 'A') && this.autoMode) { e.preventDefault(); this.setAuto(false); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.cycleSpeed(); }
    };
    window.addEventListener('keydown', this.autoKeyHandler);

    this.player.party.forEach((g, i) => this.units.push(this.spawnUnit(g, 'player', i)));
    this.enemySpecs.forEach((e, i) => {
      const g = new Guardian(e.speciesId, e.level);
      this.units.push(this.spawnUnit(g, 'enemy', i));
    });
    this.renderCards();

    // boss entrance: the camera pulls in from a dread distance while the seal flares
    if (this.opts.boss) {
      this.camDist = 13.5;
      sfx('boom');
      this.fx.shake(0.22, 0.9);
      for (const e of this.units.filter(x => x.side === 'enemy')) {
        this.fx.pillar(e.rig.group.position, 0xe83a5a, { height: 6, radius: 0.7, life: 1.1 });
      }
      tween(1.5, t => { this.camDist = 13.5 + (9.2 - 13.5) * t; }, Ease.inOut);
    }

    const tagline = ARENA_TAGLINES[this.opts.arena ?? ''] ?? ARENA_TAGLINES[this.opts.theme ?? 'cavern'];
    this.log(this.opts.intro ?? (this.opts.boss ? '⚠️ A powerful presence blocks the way!' : `${tagline}<br>Wild Guardians attack!`));
    await wait(1100);

    // Field Manual III — the very first battle gets the full doctrine briefing
    if (!this.player.flags['tut_battle']) await runBattleTutorial(this.player);

    let result: BattleResult | null = null;
    let stunned = !!this.opts.firstStrike;
    if (stunned) {
      this.log('⚡ The Crawler\'s cannon stunned the foes — free round!');
      sfx('zap');
      for (const e of this.alive('enemy')) {
        this.fx.bolt(this.chest(e).add(new THREE.Vector3(0, 4, 0)), this.chest(e), 0xfff2a0);
        this.fx.flashMaterials(e.rig.body, 0xf2d23a, 0.4);
      }
      this.fx.shake(0.15, 0.4);
      await wait(900);
    }

    while (!result) {
      this.round++;
      this.units.forEach(u => { u.guarding = false; });
      const queue = [...this.units]
        .filter(u => !u.g.fainted)
        .sort((a, b) => b.g.stats.spd * b.mods.spd * (0.9 + Math.random() * 0.2) -
                        a.g.stats.spd * a.mods.spd * (0.9 + Math.random() * 0.2));

      for (const u of queue) {
        if (u.g.fainted) continue;
        if (!this.alive('enemy').length || !this.alive('player').length) break;
        this.highlight(u);
        if (u.side === 'player') {
          const r = await this.playerTurn(u);
          if (r === 'fled') { result = 'flee'; break; }
        } else {
          if (stunned) continue;
          await wait(350);
          await this.enemyTurn(u);
        }
      }
      stunned = false;
      this.highlight(null);

      if (!this.alive('enemy').length) result = 'win';
      else if (!this.alive('player').length) result = 'lose';
    }

    // the auto-action shortcut shouldn't bleed into the victory screen or beyond
    this.autoMode = false;
    $('battle-auto').style.display = 'none';

    if (result === 'win') await this.grantRewards();
    else if (result === 'lose') {
      playMusic('battle_lost');
      await say('', 'Your party was overwhelmed…');
    }

    // cleanup
    if (this.autoKeyHandler) { window.removeEventListener('keydown', this.autoKeyHandler); this.autoKeyHandler = undefined; }
    setTimeScale(1);   // never let battle speed bleed into the overworld
    setStoryInBattle(false);
    this.units.forEach(u => disposeRig(u.rig));
    this.disposeArena();
    $('battle-ui').style.display = 'none';
    $('battle-menu').style.display = 'none';
    $('battle-auto').style.display = 'none';
    $('battle-speed').style.display = 'none';
    $('battle-speed').onclick = null;
    $('victory-screen').style.display = 'none';
    $('evo-flash').style.display = 'none';
    return result;
  }
}
