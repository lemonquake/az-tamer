// ============================================================
// AZ Tamer — Overworld: a living globe. The player walks the
// surface while the world rotates beneath them. Dungeon gates
// show expedition intel; quest gates pulse red; the unexplored
// world sleeps under clouds.
// ============================================================
import * as THREE from 'three';
import { DUNGEONS, REGIONS, SPECIES, TYPE_CSS, type DungeonDef } from './data';
import { Player } from './state';
import { makeTamer, updateVoxelHuman, globeTexture, skyGradient, leafTexture, plankTexture } from './models';
import { AGDAO_LORE, SALMONAN_LORE, HYUJON_LORE } from './lore';
import { updateHUD, showInteractHint, showHotkeys, isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, choose, say, type PanelKind } from './ui';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import { updateTamerAppearance } from './clothes';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const R = 30;                       // globe radius
const CITY_COORDS: [number, number] = [22, 0];
const AGDAO_COORDS: [number, number] = [-6, -44];
const SALMONAN_COORDS: [number, number] = [8, 62];
const HYUJON_COORDS: [number, number] = [45, 12];   // far north of Olivar

/** Where the overworld can send the player. */
export type OverworldDest = DungeonDef | 'agdao' | 'salmonan' | 'hyujon' | { travel: string } | null;

function dirFromLatLon(lat: number, lon: number): THREE.Vector3 {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

interface Marker {
  group: THREE.Group;
  def: DungeonDef | null;      // null = Haven City (or Agdao, see below)
  dir: THREE.Vector3;          // unit direction in globe-local space
  quest: boolean;
  agdao?: boolean;             // the tropical island travel marker
  salmonan?: boolean;          // the river-valley town travel marker
  hyujon?: boolean;            // the forgotten tech-city travel marker
}

export class Overworld {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 300);
  private globe = new THREE.Group();
  private cloudLayer = new THREE.Group();
  private drift = new THREE.Quaternion();
  private tamer = makeTamer();
  private markers: Marker[] = [];
  private keys = new Set<string>();
  private heading = 0;
  private walking = false;
  private busy = false;
  private nearest: Marker | null = null;
  private t = 0;
  private resolveExit: ((d: OverworldDest) => void) | null = null;

  constructor(private player: Player, private regionId = 'aurel') {}

  private get regionName(): string {
    return REGIONS.find(r => r.id === this.regionId)?.name ?? 'Overworld';
  }

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ---------------- build ----------------
  private buildScene(): void {
    this.scene.background = skyGradient('#0a0e24', '#02030a');
    this.scene.add(new THREE.AmbientLight(0x8a93c0, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.7);
    sun.position.set(40, 50, 30);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5a7bd8, 0.6);
    rim.position.set(-40, -10, -30);
    this.scene.add(rim);

    // stars
    const starPts = new Float32Array(900);
    for (let i = 0; i < 300; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(180 + Math.random() * 60);
      starPts[i * 3] = v.x; starPts[i * 3 + 1] = v.y; starPts[i * 3 + 2] = v.z;
    }
    this.scene.add(new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPts, 3)),
      new THREE.PointsMaterial({ color: 0xd8e0ff, size: 0.8, sizeAttenuation: true })
    ));

    // the globe — centered below the player so the surface point under them is the origin
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 48),
      new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.9, metalness: 0.02 })
    );
    this.globe.add(sphere);
    // atmosphere shell
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.04, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x6ab8f2, transparent: true, opacity: 0.07, side: THREE.BackSide })
    );
    this.globe.add(atmo);
    this.globe.position.set(0, -R, 0);
    this.cloudLayer.position.copy(this.globe.position);
    this.scene.add(this.globe, this.cloudLayer);

    // markers — only this region's gates appear on this globe
    if (this.regionId === 'aurel') this.addMarker(null, CITY_COORDS);
    for (const d of DUNGEONS) {
      if (d.id === 'trial' || d.hidden || (d.region ?? 'aurel') !== this.regionId) continue;
      if (this.isUnlocked(d)) this.addMarker(d, d.coords);
      else this.addCloudCluster(dirFromLatLon(...d.coords), 4, 0.9); // locked gates sleep under cloud
    }
    // Agdao Island — revealed by Veyl's sea-chart
    if (this.regionId === 'aurel') {
      if (this.player.flags['agdao_unlocked']) this.addAgdaoMarker(AGDAO_COORDS);
      else this.addCloudCluster(dirFromLatLon(...AGDAO_COORDS), 5, 0.9);
      // New Salmonan — the valley opens with Act V (the Foretales arc)
      if (this.player.flags['salmonan_unlocked']) this.addSalmonanMarker(SALMONAN_COORDS);
      else this.addCloudCluster(dirFromLatLon(...SALMONAN_COORDS), 5, 0.9);
      // Hyujon — the forgotten tech-city of the North
      if (this.player.flags['dragon_tear_quest_unlocked'] || this.player.quests['story_hyujon'] === 'active' || this.player.quests['story_hyujon'] === 'done') this.addHyujonMarker(HYUJON_COORDS);
      else this.addCloudCluster(dirFromLatLon(...HYUJON_COORDS), 5, 0.9);
    }
    // ambient cloud cover over the unexplored world
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3().randomDirection();
      // keep clouds away from active markers
      if (this.markers.some(m => m.dir.angleTo(dir) < 0.35)) continue;
      this.addCloudCluster(dir, 3 + Math.floor(Math.random() * 3), 0.55, true);
    }

    // start standing at Haven City: rotate globe so the city sits at the top
    const cityDir = dirFromLatLon(...CITY_COORDS);
    this.globe.quaternion.setFromUnitVectors(cityDir, new THREE.Vector3(0, 1, 0));

    this.tamer.position.set(0, 0, 0);
    this.scene.add(this.tamer);

    this.camera.position.set(0, 6.2, 9.5);
    this.camera.lookAt(0, 1.4, 0);
  }

  private isUnlocked(d: DungeonDef): boolean {
    return !d.unlockFlag || !!this.player.flags[d.unlockFlag];
  }

  private addMarker(def: DungeonDef | null, coords: [number, number]): void {
    const dir = dirFromLatLon(...coords);
    const g = new THREE.Group();
    const quest = !!def?.quest && !this.player.dungeonClears[def.id];
    const color = def ? (quest ? 0xe83a5a : 0x5ab8e8) : 0xf2c14e;

    if (!def) {
      // Haven City: golden keep
      const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xcab27a, roughness: 0.7 }));
      keep.position.y = 0.8;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6a1a, emissiveIntensity: 0.4 }));
      roof.position.y = 2;
      g.add(keep, roof);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const hut = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45),
          new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.85 }));
        hut.position.set(Math.cos(a) * 1.7, 0.2, Math.sin(a) * 1.7);
        g.add(hut);
      }
    } else {
      // dungeon gate: stone arch + crystal
      const archMat = new THREE.MeshStandardMaterial({ color: 0x6a6e8a, roughness: 0.8 });
      for (const side of [-0.7, 0.7]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.7, 0.35), archMat);
        pillar.position.set(side, 0.85, 0);
        g.add(pillar);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.45), archMat);
      lintel.position.y = 1.85;
      g.add(lintel);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2 }));
      crystal.position.y = 1.05;
      crystal.name = 'crystal';
      g.add(crystal);
      if (quest) {
        // red quest beacon: pulsing ring + light pillar
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0xe83a5a, transparent: true, opacity: 0.8 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.08;
        ring.name = 'questring';
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 7, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xe83a5a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
        beam.position.y = 3.6;
        beam.name = 'questbeam';
        g.add(ring, beam);
      }
    }
    const halo = new THREE.PointLight(color, quest ? 16 : 9, 9);
    halo.position.y = 1.6;
    halo.name = 'halo';
    g.add(halo);

    // place on the globe surface, oriented outward
    g.position.copy(dir).multiplyScalar(R);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.globe.add(g);
    this.markers.push({ group: g, def, dir, quest });
  }

  /** A little tropical diorama: sand, lagoon ring, leaning palms, huts. */
  private addAgdaoMarker(coords: [number, number]): void {
    const dir = dirFromLatLon(...coords);
    const g = new THREE.Group();
    const quest = this.player.quests['story_agdao'] === 'active';

    const lagoon = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x3ad8c8, emissive: 0x1a8a80, emissiveIntensity: 0.5, roughness: 0.15, transparent: true, opacity: 0.9 }));
    lagoon.position.y = 0.06;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.22, 20),
      new THREE.MeshStandardMaterial({ color: 0xeed9a0, roughness: 0.9 }));
    sand.position.y = 0.18;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10),
      new THREE.MeshStandardMaterial({ map: leafTexture('#3a9a52', '#5ec46a', '#2a6a3a', 7), roughness: 0.9 }));
    hill.scale.set(1.2, 0.55, 1);
    hill.position.y = 0.4;
    g.add(lagoon, sand, hill);

    // leaning palms
    const trunkMat = new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a42', 1), roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3aa84e, roughness: 0.85, side: THREE.DoubleSide });
    for (const [px, pz, lean] of [[0.9, 0.3, 0.35], [-0.7, 0.6, -0.3], [-0.2, -0.9, 0.25]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 6), trunkMat);
      trunk.position.set(px, 0.85, pz);
      trunk.rotation.z = lean;
      g.add(trunk);
      const crownX = px - Math.sin(lean) * 0.65, crownY = 1.5;
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 4), frondMat);
        const a = (f / 5) * Math.PI * 2;
        frond.position.set(crownX + Math.cos(a) * 0.28, crownY, pz + Math.sin(a) * 0.28);
        frond.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
        frond.scale.z = 0.3;
        g.add(frond);
      }
    }
    // hut cluster
    for (const [hx, hz] of [[0.55, -0.45], [-0.55, -0.2]]) {
      const wallsM = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.95 }));
      wallsM.position.set(hx, 0.4, hz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 8),
        new THREE.MeshStandardMaterial({ color: 0xc4a45a, roughness: 1 }));
      roof.position.set(hx, 0.63, hz);
      g.add(wallsM, roof);
    }

    if (quest) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x4ee4b8, transparent: true, opacity: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = 'questring';
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 7, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x4ee4b8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 3.6;
      beam.name = 'questbeam';
      g.add(ring, beam);
    }
    const halo = new THREE.PointLight(0x4ee4b8, quest ? 16 : 10, 10);
    halo.position.y = 2;
    halo.name = 'halo';
    g.add(halo);

    g.position.copy(dir).multiplyScalar(R);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.globe.add(g);
    this.markers.push({ group: g, def: null, dir, quest, agdao: true });
  }

  /** A little river-valley diorama: green terraces, a blue river, red roofs, the relay mast. */
  private addSalmonanMarker(coords: [number, number]): void {
    const dir = dirFromLatLon(...coords);
    const g = new THREE.Group();
    const quest = this.player.quests['story_veilfall'] === 'active' || this.player.quests['story_mirrorhouse'] === 'active';

    // terraced hill: stacked green discs
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(1.7 - i * 0.45, 1.9 - i * 0.45, 0.3, 18),
        new THREE.MeshStandardMaterial({ map: leafTexture('#4aa052', '#6cc45e', '#2a703a', 11 + i), roughness: 0.9 }));
      step.position.y = 0.15 + i * 0.3;
      g.add(step);
      // paddy water gleam on each terrace lip
      const gleam = new THREE.Mesh(new THREE.TorusGeometry(1.55 - i * 0.45, 0.05, 6, 24),
        new THREE.MeshStandardMaterial({ color: 0x7ad8c8, emissive: 0x2a8a7a, emissiveIntensity: 0.5, roughness: 0.2 }));
      gleam.rotation.x = Math.PI / 2;
      gleam.position.y = 0.31 + i * 0.3;
      g.add(gleam);
    }
    // the river: a blue ribbon across the diorama
    const river = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: 0x3a9ab8, emissive: 0x1a5a74, emissiveIntensity: 0.5, roughness: 0.15 }));
    river.position.set(1.6, 0.1, 0);
    g.add(river);
    // red-roofed houses
    for (const [hx, hz] of [[0.6, 0.7], [-0.7, 0.4], [-0.2, -0.8]]) {
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.95 }));
      walls.position.set(hx, 1.05, hz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 4),
        new THREE.MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.9 }));
      roof.position.set(hx, 1.28, hz);
      roof.rotation.y = Math.PI / 4;
      g.add(walls, roof);
    }
    // the battered relay mast, blinking
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.4, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a8a96, metalness: 0.7, roughness: 0.4 }));
    mast.position.set(-0.9, 1.6, -0.5);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe85a4a, emissive: 0xe83a2a, emissiveIntensity: 1.4 }));
    tip.position.set(-0.9, 2.35, -0.5);
    g.add(mast, tip);

    if (quest) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xf2a64e, transparent: true, opacity: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = 'questring';
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 7, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xf2a64e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 3.6;
      beam.name = 'questbeam';
      g.add(ring, beam);
    }
    const halo = new THREE.PointLight(0xf2c14e, quest ? 16 : 10, 10);
    halo.position.y = 2;
    halo.name = 'halo';
    g.add(halo);

    g.position.copy(dir).multiplyScalar(R);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.globe.add(g);
    this.markers.push({ group: g, def: null, dir, quest, salmonan: true });
  }

  /** A dark tech-city diorama: rusted spires, flickering neon traces. */
  private addHyujonMarker(coords: [number, number]): void {
    const dir = dirFromLatLon(...coords);
    const g = new THREE.Group();
    const quest = this.player.quests['story_hyujon'] === 'active';

    // Rusted tech-bases
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x1f1f28, roughness: 0.9 }));
    base.position.y = 0.1;
    g.add(base);

    // Abandoned rusted cylinders (spires)
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x3e3530, metalness: 0.8, roughness: 0.75 });
    for (const [tx, tz, th, tr] of [[0.4, 0.4, 1.5, 0.25], [-0.5, -0.4, 1.9, 0.3], [0.6, -0.5, 1.1, 0.2]]) {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(tr * 0.8, tr, th, 8), towerMat);
      spire.position.set(tx, 0.1 + th / 2, tz);
      g.add(spire);
    }

    // A flickering cyan wire running across
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x11ffcc, emissive: 0x11ffcc, emissiveIntensity: 0.8, roughness: 0.2 });
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 6, 16), wireMat);
    wire.rotation.x = Math.PI / 2;
    wire.position.set(0, 0.22, 0);
    wire.name = 'legendpulse';
    g.add(wire);

    if (quest) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x11ffcc, transparent: true, opacity: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = 'questring';
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 7, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x11ffcc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 3.6;
      beam.name = 'questbeam';
      g.add(ring, beam);
    }
    const halo = new THREE.PointLight(0x11ffcc, quest ? 14 : 7, 8);
    halo.position.y = 1.8;
    halo.name = 'halo';
    g.add(halo);

    g.position.copy(dir).multiplyScalar(R);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.globe.add(g);
    this.markers.push({ group: g, def: null, dir, quest, hyujon: true });
  }

  private addCloudCluster(dir: THREE.Vector3, puffs: number, opacity: number, ambient = false): void {
    const cluster = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f4fa, transparent: true, opacity, roughness: 1, depthWrite: false });
    for (let i = 0; i < puffs; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 1.6, 10, 8), mat);
      puff.position.set((Math.random() - 0.5) * 4, Math.random() * 0.7, (Math.random() - 0.5) * 4);
      puff.scale.y = 0.55;
      cluster.add(puff);
    }
    cluster.position.copy(dir).multiplyScalar(R + 1.6);
    cluster.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    (ambient ? this.cloudLayer : this.globe).add(cluster);
  }

  // ---------------- expedition intel panel ----------------
  private updatePanel(): void {
    const panel = $('ow-panel');
    const m = this.nearest;
    if (!m) { panel.classList.remove('show'); showInteractHint(null); return; }

    if (m.agdao) {
      showInteractHint('Press <b>E</b> — sail to Agdao Island');
      if (panel.dataset.current === 'agdao' && panel.classList.contains('show')) return;
      panel.dataset.current = 'agdao';
      panel.classList.toggle('quest', m.quest);
      panel.innerHTML = `
        ${m.quest ? '<div class="quest-badge">★ QUEST</div>' : ''}
        <h3>🏝️ ${AGDAO_LORE.name}</h3>
        <div class="sub" style="margin-bottom:8px">${AGDAO_LORE.desc}</div>
        <div class="row"><span class="sub">Known as</span><b>${AGDAO_LORE.epithet}</b></div>
        <div class="row"><span class="sub">First Bond</span><b>~700 years ago</b></div>
        <div class="row"><span class="sub">Resident Guild</span><b>Circle of the First Fire</b></div>
        <div class="sub" style="margin-top:8px">The islanders are friendly — and they notice everything. Ask around.</div>`;
      panel.classList.add('show');
      return;
    }
    if (m.hyujon) {
      showInteractHint('Press <b>E</b> — travel to the Forgotten Tech-City of Hyujon');
      if (panel.dataset.current === 'hyujon' && panel.classList.contains('show')) return;
      panel.dataset.current = 'hyujon';
      panel.classList.toggle('quest', m.quest);
      panel.innerHTML = `
        ${m.quest ? '<div class="quest-badge">★ QUEST</div>' : ''}
        <h3>🏙️ ${HYUJON_LORE.name}</h3>
        <div class="sub" style="margin-bottom:8px">${HYUJON_LORE.desc}</div>
        <div class="row"><span class="sub">Known as</span><b>${HYUJON_LORE.epithet}</b></div>
        <div class="row"><span class="sub">Status</span><b>dark, abandoned</b></div>
        <div class="row"><span class="sub">Key Resident</span><b>Doctor Clyde</b></div>
        <div class="sub" style="margin-top:8px">Power surges flash in the shadows of this silent city. Explore with caution.</div>`;
      panel.classList.add('show');
      return;
    }
    if (m.salmonan) {
      showInteractHint('Press <b>E</b> — ride downriver to New Salmonan');
      if (panel.dataset.current === 'salmonan' && panel.classList.contains('show')) return;
      panel.dataset.current = 'salmonan';
      panel.classList.toggle('quest', m.quest);
      panel.innerHTML = `
        ${m.quest ? '<div class="quest-badge">★ QUEST</div>' : ''}
        <h3>🏞️ ${SALMONAN_LORE.name}</h3>
        <div class="sub" style="margin-bottom:8px">${SALMONAN_LORE.desc}</div>
        <div class="row"><span class="sub">Known as</span><b>${SALMONAN_LORE.epithet}</b></div>
        <div class="row"><span class="sub">Broadcast signal</span><b>none — and proud of it</b></div>
        <div class="row"><span class="sub">Resident champion</span><b>Ivan Lawrence (cleared, loudly)</b></div>
        <div class="sub" style="margin-top:8px">The inn is free for tamers, the market opens at dawn, and the mural by the river gate is repainted every spring.</div>`;
      panel.classList.add('show');
      return;
    }
    if (!m.def) {
      panel.classList.remove('show');
      showInteractHint('Press <b>E</b> — return to Haven City');
      return;
    }
    const d = m.def;
    showInteractHint(`Press <b>E</b> — enter ${d.name}`);
    if (panel.dataset.current === d.id && panel.classList.contains('show')) return;
    panel.dataset.current = d.id;
    panel.classList.toggle('quest', m.quest);

    const maxLv = Math.max(1, ...this.player.party.map(g => g.level));
    const estLv = (d.levelRange[0] + d.levelRange[1]) / 2;
    const enemyChips = d.pool.map(id => {
      const sp = SPECIES[id];
      const hidden = estLv > maxLv + 4;
      return hidden
        ? `<span class="enemy-chip unknown">???</span>`
        : `<span class="enemy-chip" style="border-color:${TYPE_CSS[sp.type]};color:${TYPE_CSS[sp.type]}">${sp.name}</span>`;
    }).join('');
    const bossRow = d.boss
      ? `<div class="row"><span class="sub">Guardian of the depths</span><b style="color:var(--ui-red)">${(d.bossLevel ?? 0) > maxLv + 4 ? '???' : SPECIES[d.boss].name + ` Lv${d.bossLevel}`}</b></div>`
      : '';
    const clears = this.player.dungeonClears[d.id];
    panel.innerHTML = `
      ${m.quest ? '<div class="quest-badge">★ QUEST</div>' : ''}
      <h3>${d.name}</h3>
      <div class="sub" style="margin-bottom:8px">${d.desc}</div>
      <div class="row"><span class="sub">Depth</span><b>${d.floors} floors</b></div>
      <div class="row"><span class="sub">Threat level</span><b>Lv ${d.levelRange[0]}–${d.levelRange[1]}</b></div>
      <div class="row"><span class="sub">Conquest bonus</span><b class="goldcol">◆${d.rewardShards}</b></div>
      ${clears ? `<div class="row"><span class="sub">Conquered</span><b>×${clears}</b></div>` : ''}
      ${bossRow}
      <div class="sub" style="margin-top:8px">POSSIBLE GUARDIANS</div>
      <div style="margin-top:4px">${enemyChips}</div>`;
    panel.classList.add('show');
  }

  // ---------------- per-frame ----------------
  private update(dt: number): void {
    if (!this.resolveExit) return;
    this.t += dt;
    const turnSpeed = 2.4, walkSpeed = 5.0;
    let fwd = 0;
    if (!isDialogueOpen() && !isMenuOpen() && !this.busy) {
      if (this.keys.has('a') || this.keys.has('arrowleft')) this.heading += turnSpeed * dt;
      if (this.keys.has('d') || this.keys.has('arrowright')) this.heading -= turnSpeed * dt;
      if (this.keys.has('w') || this.keys.has('arrowup')) fwd = 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) fwd = -0.6;
    }
    this.walking = fwd !== 0;
    this.tamer.rotation.y = this.heading + (fwd < 0 ? Math.PI : 0);
    if (this.walking) {
      // walking rotates the globe beneath the player
      const d = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      const axis = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const angle = (walkSpeed * Math.abs(fwd) * dt) / R;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, fwd > 0 ? angle : -angle);
      this.globe.quaternion.premultiply(q);
    }
    updateVoxelHuman(this.tamer, this.walking, dt);

    // ambient clouds drift independently
    this.drift.setFromAxisAngle(new THREE.Vector3(0.2, 1, 0.1).normalize(), this.t * 0.004);
    this.cloudLayer.quaternion.copy(this.globe.quaternion).multiply(this.drift);

    // marker animations + proximity
    const up = new THREE.Vector3(0, 1, 0);
    let best: Marker | null = null, bestAngle = 0.16; // ~4.8 world units of arc
    for (const m of this.markers) {
      const worldDir = m.dir.clone().applyQuaternion(this.globe.quaternion);
      const a = worldDir.angleTo(up);
      if (a < bestAngle) { bestAngle = a; best = m; }
      const crystal = m.group.getObjectByName('crystal');
      if (crystal) { crystal.rotation.y = this.t * 1.4; crystal.position.y = 1.05 + Math.sin(this.t * 2 + m.dir.x) * 0.1; }
      const ring = m.group.getObjectByName('questring') as THREE.Mesh | null;
      if (ring) {
        const pulse = (this.t * 0.9 + m.dir.y) % 1;
        ring.scale.setScalar(0.6 + pulse * 1.1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - pulse);
      }
      const beam = m.group.getObjectByName('questbeam') as THREE.Mesh | null;
      if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.t * 3) * 0.08;
      const halo = m.group.getObjectByName('halo') as THREE.PointLight | null;
      if (halo && m.quest) halo.intensity = 14 + Math.sin(this.t * 3) * 6;
    }
    this.nearest = best;
    if (!isDialogueOpen() && !isMenuOpen() && !this.busy) this.updatePanel();
    else { $('ow-panel').classList.remove('show'); showInteractHint(null); }

    // ---- labeled compass minimap: visible-hemisphere expedition gates ----
    const mapMarkers: MapMarker[] = [];
    for (const m of this.markers) {
      const w = m.dir.clone().applyQuaternion(this.globe.quaternion);
      if (w.y < 0.05) continue; // beyond the horizon
      const a = w.angleTo(up);
      const len = Math.hypot(w.x, w.z) || 1;
      mapMarkers.push({
        x: (w.x / len) * a, z: (w.z / len) * a,
        label: m.agdao ? '🏝️ Agdao Island' : m.salmonan ? '🏞️ New Salmonan' : m.hyujon ? '🏙️ Hyujon City' : m.def ? m.def.name : '🏠 Haven City',
        color: m.agdao ? '#4ee4b8' : m.salmonan ? '#f2c14e' : m.hyujon ? '#11ffcc' : m.def ? (m.quest ? '#e85a6a' : '#5ab8e8') : '#c9a24a',
        kind: m.def ? 'poi' : 'building',
        quest: m.quest,
      });
    }
    drawAreaMap($('minimap') as unknown as HTMLCanvasElement, {
      shape: 'circle', radius: 1.75,
      markers: mapMarkers,
      player: { x: 0, z: 0, rot: this.heading },
      title: this.regionName,
    });

    // slight camera breathing
    this.camera.position.y = 6.2 + Math.sin(this.t * 0.4) * 0.12;
    this.camera.lookAt(0, 1.4, 0);
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, this.regionName);
      this.busy = false;
    });
  }

  /** The Region Atlas — travel between unlocked overworlds and far destinations. */
  private async openAtlas(): Promise<void> {
    this.busy = true;
    const entries: { label: string; go: () => void | Promise<void> }[] = [];
    for (const r of REGIONS) {
      const unlocked = !r.unlockFlag || !!this.player.flags[r.unlockFlag];
      if (r.id === this.regionId) {
        entries.push({ label: `${r.icon} ${r.name} — you are here`, go: () => {} });
      } else if (unlocked) {
        entries.push({ label: `${r.icon} ${r.name}`, go: () => this.finish({ travel: r.id }) });
      } else {
        entries.push({ label: `🔒 ${r.name}`, go: () => say('', r.lockedHint || 'This region is still beyond your charts.') });
      }
    }
    if (this.player.flags['agdao_unlocked']) {
      entries.push({ label: '🏝️ Agdao Island — the Cradle of Tamers', go: () => this.finish('agdao') });
    }
    if (this.player.flags['salmonan_unlocked']) {
      entries.push({ label: '🏞️ New Salmonan — the Valley of Loud Kitchens', go: () => this.finish('salmonan') });
    }
    if (this.player.flags['dragon_tear_quest_unlocked'] || this.player.quests['story_hyujon'] === 'active' || this.player.quests['story_hyujon'] === 'done') {
      entries.push({ label: '🏙️ Forgotten Tech-City of Hyujon', go: () => this.finish('hyujon') });
    }
    const pick = await choose('Region Atlas', 'The world is wider than one horizon. Travel where?', [
      ...entries.map(e => e.label), 'Stay here',
    ]);
    if (pick < entries.length) await entries[pick].go();
    this.busy = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy) return;
    if ((k === 'e' || k === 'enter') && this.nearest) {
      this.finish(this.nearest.agdao ? 'agdao' : this.nearest.salmonan ? 'salmonan' : this.nearest.hyujon ? 'hyujon' : this.nearest.def);
    }
    else if (k === 'p') this.openPanelGuarded('player');
    else if (k === 'i') this.openPanelGuarded('inventory');
    else if (k === 'g') this.openPanelGuarded('guardians');
    else if (k === 'c') this.openPanelGuarded('crawler');
    else if (k === 'j') this.openPanelGuarded('quests');
    else if (k === 'v') this.openPanelGuarded('evotree');
    else if (k === 't') this.openAtlas();
    else if (k === 'escape' || k === 'esc') {
      this.busy = true;
      openPauseMenu(this.player, { canSave: true }).then(() => {
        updateHUD(this.player, this.regionName);
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  private finish(dest: OverworldDest): void {
    $('ow-panel').classList.remove('show');
    hideAreaMap($('minimap') as unknown as HTMLCanvasElement);
    showInteractHint(null);
    showHotkeys(false);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.resolveExit?.(dest);
    this.resolveExit = null;
  }

  /** Resolves with the chosen dungeon, 'agdao' for the island, or null to return to Haven City. */
  run(): Promise<OverworldDest> {
    this.buildScene();
    this.player.savedLocation = { type: 'overworld', room: this.regionId };
    updateTamerAppearance(this.tamer, this.player.equippedClothes);
    // debug handle for automated testing
    (window as unknown as Record<string, unknown>).__ow = this;
    updateHUD(this.player, this.regionName);
    showHotkeys(true, false, true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    return new Promise<OverworldDest>(res => { this.resolveExit = res; });
  }
}
