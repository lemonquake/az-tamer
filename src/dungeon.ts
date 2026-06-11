// ============================================================
// AZ Tamer — dungeon mode: procedural floors, Crawler driving,
// minimap fog-of-war, chests/traps/crystals, encounters, boss
// ============================================================
import * as THREE from 'three';
import { ITEMS, type DungeonDef } from './data';
import { Player } from './state';
import { makeCrawler, stoneTexture, skyGradient, tween, Ease } from './models';
import { say, choose, toast, updateHUD, showInteractHint, showHotkeys, isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, type PanelKind, playStorySequence, hideStory } from './ui';
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

const THEMES = {
  cavern: { wall: '#4a4258', floor: '#332e44', sky: ['#141022', '#05060c'] as [string, string], light: 0xc4a86a },
  vault: { wall: '#2e4a5a', floor: '#1e3242', sky: ['#0a1c2c', '#030a12'] as [string, string], light: 0x6ab8c4 },
  storm: { wall: '#3e3a52', floor: '#28243a', sky: ['#1c1830', '#08060f'] as [string, string], light: 0xb8a8f2 },
};

export class DungeonRun {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 60);
  private map!: FloorMap;
  private floorNum = 1;
  private crawler = makeCrawler();
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
  private legT = 0;
  private trialSteps = 0;
  private bigMapOpen = false;

  constructor(private ctx: DungeonCtx, private def: DungeonDef) {}

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  // ---------------- setup ----------------
  private buildScene(): void {
    const th = THEMES[this.def.theme];
    this.scene.background = skyGradient(th.sky[0], th.sky[1]);
    this.scene.fog = new THREE.Fog(new THREE.Color(th.sky[1]).getHex(), 6, 18);
    this.scene.add(new THREE.AmbientLight(0x6a73a0, 0.55));
    const dir = new THREE.DirectionalLight(0xb0b8e8, 0.5);
    dir.position.set(3, 10, 2);
    this.scene.add(dir);
    this.crawlerLight.castShadow = true;
    this.scene.add(this.crawler, this.crawlerLight, this.tileGroup, this.decoGroup);
  }

  private buildFloorMeshes(): void {
    this.tileGroup.clear();
    this.decoGroup.clear();
    this.decoMeshes.clear();
    const th = THEMES[this.def.theme];

    const floorMat = new THREE.MeshStandardMaterial({ map: stoneTexture(th.floor, '#15121f', 6), roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), floorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(SIZE / 2 - 0.5, 0, SIZE / 2 - 0.5);
    ground.receiveShadow = true;
    this.tileGroup.add(ground);

    // instanced walls
    let wallCount = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (this.map.tiles[y][x] === 'wall') wallCount++;
    const wallGeo = new THREE.BoxGeometry(1, 1.6, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture(th.wall, '#1a1626', 1), roughness: 0.9 });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (this.map.tiles[y][x] === 'wall') {
        m.setPosition(x, 0.8, y);
        walls.setMatrixAt(i++, m);
      }
    }
    walls.castShadow = walls.receiveShadow = true;
    this.tileGroup.add(walls);

    // decorations per special tile
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const tile = this.map.tiles[y][x];
      let mesh: THREE.Object3D | null = null;
      if (tile === 'chest') {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.38),
          new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 }));
        box.position.y = 0.18;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.4),
          new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.5, roughness: 0.4 }));
        lid.position.y = 0.4;
        g.add(box, lid);
        mesh = g;
      } else if (tile === 'crystal') {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
          new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.9, roughness: 0.2 }));
        c.position.y = 0.5;
        mesh = c;
      } else if (tile === 'stairs') {
        const g = new THREE.Group();
        for (let s = 0; s < 3; s++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8 - s * 0.22),
            new THREE.MeshStandardMaterial({ color: 0x9aa3c8, roughness: 0.6 }));
          step.position.set(0, 0.06 + s * 0.14, -s * 0.12);
          g.add(step);
        }
        const glow = new THREE.PointLight(0x5ab8e8, 8, 4);
        glow.position.y = 1;
        g.add(glow);
        mesh = g;
      } else if (tile === 'boss') {
        const g = new THREE.Group();
        const obelisk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 5),
          new THREE.MeshStandardMaterial({ color: 0x3a2a4a, emissive: 0xe83a5a, emissiveIntensity: 0.5, roughness: 0.4 }));
        obelisk.position.y = 0.7;
        const glow = new THREE.PointLight(0xe83a5a, 12, 5);
        glow.position.y = 1.2;
        g.add(obelisk, glow);
        mesh = g;
      } else if (tile === 'exit') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        mesh = ring;
      }
      // traps are hidden (scanner tier 3 reveals them on minimap only)
      if (mesh) {
        mesh.position.x += x; mesh.position.z += y;
        this.decoGroup.add(mesh);
        this.decoMeshes.set(`${x},${y}`, mesh);
      }
    }
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

    // energy drain
    if (p.crawler.energy > 0) p.crawler.energy--;
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

    if (tile === 'chest') {
      this.busy = true;
      this.map.tiles[this.pos.y][this.pos.x] = 'floor';
      const mesh = this.decoMeshes.get(key);
      if (mesh) { this.decoGroup.remove(mesh); this.decoMeshes.delete(key); }
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
        const orig = this.crawler.position.clone();
        await tween(0.3, t => { this.crawler.position.y = Math.sin(t * Math.PI) * 0.25; });
        this.crawler.position.copy(orig);
        if (p.crawler.hull <= 0) { await this.crawlerDestroyed(); return; }
      } else {
        const drain = 12 + this.floorNum * 4;
        p.crawler.energy = Math.max(0, p.crawler.energy - drain);
        toast(`🌀 Static snare! Energy -${drain}`, 'red');
      }
      updateHUD(p, this.def.name, { floor: this.floorNum });
      this.busy = false;
    } else if (tile === 'crystal') {
      this.map.tiles[this.pos.y][this.pos.x] = 'floor';
      const mesh = this.decoMeshes.get(key);
      if (mesh) { this.decoGroup.remove(mesh); this.decoMeshes.delete(key); }
      p.crawler.energy = Math.min(p.crawler.energyMax, p.crawler.energy + 50);
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
    if (tile === 'stairs') {
      this.busy = true;
      this.floorNum++;
      await say('', `Descending to B${this.floorNum}F…`);
      this.newFloor();
      this.busy = false;
    } else if (tile === 'exit') {
      this.busy = true;
      const pick = await choose('', 'Leave the dungeon and return to the surface?', ['Leave', 'Stay']);
      this.busy = false;
      if (pick === 0) this.finish('retreat');
    } else if (tile === 'boss' && this.def.boss) {
      this.busy = true;
      const pick = await choose('', 'A monstrous presence stirs beyond this seal. Challenge it?', ['Challenge!', 'Not yet']);
      if (pick === 0) {
        const result = await this.ctx.runBattle(
          [{ speciesId: this.def.boss, level: this.def.bossLevel ?? 10 }],
          { boss: true, theme: this.def.theme, intro: '⚠️ The dungeon\'s master awakens!' }
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
          this.busy = false;
          this.finish('cleared');
          return;
        }
        if (result === 'lose') { this.busy = false; this.finish('dead'); return; }
      }
      this.busy = false;
    }
  }

  private async wildBattle(): Promise<void> {
    this.busy = true;
    const p = this.ctx.player;
    const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.floorNum));
    const [lo, hi] = this.def.levelRange;
    const specs = Array.from({ length: n }, () => ({
      speciesId: this.def.pool[Math.floor(Math.random() * this.def.pool.length)],
      level: lo + Math.floor(Math.random() * (hi - lo + 1)) + (this.floorNum - 1),
    }));
    const firstStrike = Math.random() < p.crawler.firstStrikeChance;
    const result = await this.ctx.runBattle(specs, { wild: true, theme: this.def.theme, firstStrike });
    if (result === 'lose') { this.finish('dead'); return; }
    updateHUD(p, this.def.name, { floor: this.floorNum });
    this.drawMinimap();
    this.busy = false;
  }

  private async crawlerDestroyed(): Promise<void> {
    this.busy = true;
    await say('', '💥 The Crawler\'s hull gave out! An academy recovery team hauls you back to the surface…');
    this.finish('dead');
  }

  private finish(o: DungeonOutcome): void {
    hideStory();
    this.bigMapOpen = false;
    $('bigmap').style.display = 'none';
    $('minimap').style.display = 'none';
    showInteractHint(null);
    this.finished?.(o);
    this.finished = null;
  }

  // ---------------- per-frame ----------------
  private update(dt: number): void {
    if (!this.map) return; // view can render a frame before run() generates the floor
    // camera follow (angled top-down, DW2 style)
    const target = new THREE.Vector3(this.crawler.position.x, 0, this.crawler.position.z);
    const camGoal = target.clone().add(new THREE.Vector3(0, 6.4, 4.6));
    this.camera.position.lerp(camGoal, Math.min(1, dt * 5));
    this.camera.lookAt(target.x, 0.4, target.z);
    this.crawlerLight.position.set(target.x, 2.6, target.z);

    // beacon pulse + leg wiggle while moving
    const beacon = this.crawler.getObjectByName('beacon') as THREE.Mesh | null;
    if (beacon) (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.005) * 0.4;
    if (this.moving) {
      this.legT += dt * 14;
      for (let i = 0; i < 3; i++) for (const side of [1, -1]) {
        const leg = this.crawler.getObjectByName(`leg${i}${side}`);
        if (leg) leg.rotation.z = Math.sin(this.legT + i * 1.3) * 0.35;
      }
    }

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
    openPanel(kind, this.ctx.player, { canSave: false }).then(() => {
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
    else if (k === 'escape' && this.bigMapOpen) this.toggleBigMap();
    else if (k === 'escape') {
      this.busy = true;
      openPauseMenu(this.ctx.player, { canSave: false }).then(() => {
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
