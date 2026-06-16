// ============================================================
// AZ Tamer — Leodones University of Aurel: a grand interior hub.
// Marble lobby with living NPCs (wandering, seated, chatting),
// seven rooms behind real doors — Cafeteria, Classroom, Library,
// Locker Room, Training Hall, Infirmary and the Officers' Hall
// where graduates pledge to a Grand House and receive their
// guild Effigy & Sigil card.
// ============================================================
import * as THREE from 'three';
import { HOUSES, SPECIES, type HouseDef } from './data';
import { Player, Guardian } from './state';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, setVoxelSeated, makeGuardian, disposeRig,
  marbleTexture, carpetTexture, tileTexture, wallpaperTexture, bookshelfTexture,
  plankTexture, stoneTexture, skyGradient, makeGuideBeacon, globeTexture,
  type GuardianRig, type VoxelHumanOpts, type BeaconRig,
} from './models';
import {
  say, conversation, choose, askName, toast, updateHUD, showInteractHint, showHotkeys,
  isDialogueOpen, isMenuOpen, openPauseMenu, openPanel, openScreen, closeMenu, type PanelKind,
} from './ui';
import { QUESTS, questState, acceptQuest, completeQuest, mainChain, syncStoryQuests } from './quests';
import { GUILD_LORE, guildIconCanvas, makeCardNo } from './guilds';
import { openGuildCard } from './guildcard';
import { drawAreaMap, hideAreaMap, type MapMarker } from './townmap';
import type { BattleOptions, BattleResult } from './battle';
import { updateTamerAppearance } from './clothes';
import { worldOrbit } from './camorbit';
import { tagNpc, crowdName, attachNpcPicker } from './npccard';
import { runBasicsTutorial, isTutorialOpen } from './tutorial';
import { runCinematicScene } from './main';

const ROOM_TITLES: Record<string, string> = {
  lobby: 'University — Grand Lobby', cafeteria: 'University — Cafeteria',
  classroom: 'University — Classroom', library: 'University — Library',
  lockers: 'University — Locker Room', training: 'University — Training Hall',
  officers: "University — Officers' Hall", infirmary: 'University — Infirmary',
};

type RoomId = 'lobby' | 'cafeteria' | 'classroom' | 'library' | 'lockers' | 'training' | 'officers' | 'infirmary';

interface Interactable { pos: THREE.Vector3; radius: number; label: string; handler: () => Promise<void> | void; isDoor?: boolean; }
interface Collider { pos: THREE.Vector3; r: number; }
interface Wanderer { g: THREE.Group; target: THREE.Vector3; pause: number; speed: number; }

interface RoomData {
  scene: THREE.Scene;
  w: number; d: number;                 // walkable bounds (rect, centered)
  interactables: Interactable[];
  colliders: Collider[];
  npcs: THREE.Group[];                  // animated idle NPCs (incl. seated)
  rigs: GuardianRig[];
  spawn: THREE.Vector3;                 // where the tamer appears on entry
  spawnRotY: number;
  camHeight: number; camDist: number;
}

export interface UniversityCtx {
  player: Player;
  runBattle(specs: { speciesId: string; level: number }[], opts: BattleOptions): Promise<BattleResult>;
}

// ---------------- shared guild-joining ceremony ----------------
/** The full pledge ceremony: starter Guardian, member number, Effigy & Sigil card reveal, first main quest. */
export async function guildJoinCeremony(p: Player, h: HouseDef, officiant: string): Promise<boolean> {
  const lore = GUILD_LORE[h.id];
  const starter = SPECIES[h.starter];
  
  const pick = await choose(officiant,
    `Will you pledge yourself to ${h.name}, ${lore.epithet}? This oath is for life.`,
    [`I pledge to ${h.name}!`, 'I need more time']);
  if (pick !== 0) return false;

  let success = false;

  await runCinematicScene('pledge', async (cine) => {
    cine.shot('wide');

    p.houseId = h.id;
    p.flags['joined_house'] = true;
    p.cardNo = makeCardNo(h.id);

    const g = new Guardian(h.starter, 6);
    g.isStarter = true;
    g.levelCap = 16;

    cine.shot('officiant');
    await say(officiant, `Then kneel, graduate — and rise as a Tamer of ${h.name}!`);

    cine.shot('altar');
    const name = await askName(`Name your ${starter.name}`, starter.name);
    g.nickname = name;
    g.healFull();
    p.addGuardian(g);
    p.shards += 200;
    p.addItem('tonic', 3); p.addItem('berry', 3); p.addItem('cell', 2);

    await say(officiant, `This is ${name}, a newborn ${starter.name}. ${starter.desc}`);

    cine.shot('hero');
    await say(officiant, `And this… is yours now. ${lore.effigyName}. ${lore.effigyDesc}`);
    await say(officiant, `Your ${lore.cardName} is bound to it — your name, your deeds, your rank. Carry it always. You may view it any time from your Tamer Data (P), or right now.`);

    toast(`${name} joined your party!`, 'gold');
    toast(`Received ${lore.effigyName}!`, 'gold');

    const first = mainChain(h.id)[0];
    if (first) {
      acceptQuest(p, first.id);
      toast(`Main quest started: ${first.title}`, 'gold');
    }
    p.save();

    const view = await choose(officiant, `Would you like to behold your ${lore.cardName}?`, ['Show me the Sigil!', 'Later']);
    if (view === 0) await openGuildCard(p);

    cine.shot('wide');
    await say(officiant, `${lore.creedLong} — Welcome home, ${p.tamerName}. Seek your house master in Haven City; your first orders await: "${first?.title}".`);
    success = true;
  }, h.id);

  return success;
}

// ---------------- ambient lobby chatter ----------------
const LOBBY_CHATTER: [string, string][][] = [
  [['Tamer Edda', 'My Sproutle evolved last night — I cried, my roommate cried, the night warden cried because we woke him up.']],
  [['Tamer Joss', 'Three expeditions to the Mossdeep Burrows and I still can\'t find a Zephlet. They say it only trusts patient tamers. So… I\'m doomed.']],
  [['Tamer Prill', 'Don\'t take the gravy bread at the cafeteria lightly. Chef Marlo once fed an entire expedition team for a week from one pot.']],
  [['Senior Tamer Ode', 'I was at the Sunken Vault before they sealed it. The water down there doesn\'t ripple right. Take a Verdant type, trust me.']],
  [['Tamer Mina', 'Officer Quietstep of the Duskwatch appeared behind me yesterday and just said "good posture". I haven\'t slept since.']],
  [['Tamer Bex', 'The five officers in the back hall? They only recruit graduates. That\'s you, isn\'t it? Lucky. Choose with your heart — the houses are families, not uniforms.']],
  [['Groundskeeper Pell', 'Mind the marble, it was quarried from the old capital. Every vein in it is a street someone used to live on.']],
  [['Tamer Edda', 'Fifteen years since the Sealing of Ghandra and they STILL haven\'t given Aljay, Greggy and Onnel a statue in the lobby. A travesty, I say.']],
  [['Senior Tamer Ode', 'I shook Greggy the Stormheart\'s hand once. Couldn\'t feel my arm for an hour. Worth it.']],
  [['Tamer Prill', 'They teach the Legion War in third year — nine generals, four elements each. I had nightmares about the Hollow Crown for a month.']],
];

const PAIR_CHATS: [string, string][][] = [
  [
    ['Tamer Rosk', 'I\'m telling you, Volt beats Tide. Sparks! Water! Basic theory!'],
    ['Tamer Vale', 'And I\'m telling YOU, my Puddla dunked your Zaplet twice. Theory lost.'],
    ['Tamer Rosk', '…best of five?'],
  ],
  [
    ['Tamer Suri', 'Did you hear the Stormspire\'s hum changed pitch last month?'],
    ['Tamer Dorn', 'The Legion doubled their watch on it. My sister\'s posted there. She says it sounds like… counting.'],
    ['Tamer Suri', 'Counting down to what?'],
  ],
];

// ============================================================
export class University {
  private player: Player;
  private ctx: UniversityCtx;
  private revisit: boolean;

  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120);
  private tamer = makeTamer();
  private keys = new Set<string>();
  private busy = false;
  private walking = false;
  private live = false;                              // true once the lobby is built and the player has control
  private readonly bootScene = new THREE.Scene();    // rendered for the black frame before the lobby exists

  private rooms = new Map<RoomId, RoomData>();
  private current: RoomId = 'lobby';
  // lobby guidance beacons — Officers' Hall until pledged, then the Grand Doors out
  private officersBeacon: BeaconRig | null = null;
  private doorsBeacon: BeaconRig | null = null;
  private wanderers: Wanderer[] = [];
  private chatterIdx = 0;
  private resolveExit: (() => void) | null = null;

  constructor(ctx: UniversityCtx, revisit = false) {
    this.ctx = ctx;
    this.player = ctx.player;
    this.revisit = revisit;
  }

  get view() {
    const self = this;
    return {
      get scene() { return self.rooms.get(self.current)?.scene ?? self.bootScene; },
      camera: this.camera,
      update: (dt: number) => this.update(dt),
    };
  }

  private get room(): RoomData { return this.rooms.get(this.current)!; }

  // ================= scene-building helpers =================
  private label3d(scene: THREE.Scene, text: string, color: string, pos: THREE.Vector3, scale = 3.6): void {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 52px Trebuchet MS';
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    c.width = Math.max(512, textWidth + 64);
    c.height = 128;

    const ctx2 = c.getContext('2d')!;
    ctx2.font = 'bold 52px Trebuchet MS';
    ctx2.textAlign = 'center';
    ctx2.lineWidth = 10; ctx2.strokeStyle = '#0a0c18';
    ctx2.strokeText(text, c.width / 2, 80);
    ctx2.fillStyle = color;
    ctx2.fillText(text, c.width / 2, 80);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    // depthTest off: signage must never be sliced by walls, props or heads
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 40;
    const aspect = c.width / c.height;
    sp.scale.set(scale * (aspect / 4), scale / 4, 1);
    sp.position.copy(pos);
    scene.add(sp);
  }

  private newRoom(id: RoomId, w: number, d: number, opts: Partial<RoomData> = {}): RoomData {
    const data: RoomData = {
      scene: new THREE.Scene(), w, d,
      interactables: [], colliders: [], npcs: [], rigs: [],
      spawn: new THREE.Vector3(0, 0, d / 2 - 1.6), spawnRotY: Math.PI,
      camHeight: 6, camDist: 6.8,
      ...opts,
    };
    this.rooms.set(id, data);
    return data;
  }

  /** Walls + ceiling for a room. The south (camera-side) wall stays low so the chase camera sees over it. */
  private shell(r: RoomData, wallTex: THREE.Texture, ceilColor: number, h = 5): void {
    const s = r.scene;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const mk = (ww: number, wd: number, x: number, z: number, wh = h) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat);
      wall.position.set(x, wh / 2, z);
      wall.receiveShadow = true;
      s.add(wall);
    };
    mk(r.w + 0.8, 0.4, 0, -r.d / 2 - 0.2);
    mk(r.w + 0.8, 0.4, 0, r.d / 2 + 0.2, 1.1);   // low parapet — camera looks over it
    mk(0.4, r.d + 0.8, -r.w / 2 - 0.2, 0);
    mk(0.4, r.d + 0.8, r.w / 2 + 0.2, 0);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ color: ceilColor, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    s.add(ceil);
  }

  /** Door mesh + frame on a wall, with an interactable. side: which wall. */
  private door(r: RoomData, side: 'n' | 's' | 'e' | 'w', offset: number, label: string, color: string,
    handler: () => Promise<void> | void, wide = false): void {
    const s = r.scene;
    const g = new THREE.Group();
    const w = wide ? 2.4 : 1.3;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 3.1, 0.5),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7388', '#494258', 1), roughness: 0.8 }));
    frame.position.y = 1.55;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 2.7, 0.18),
      new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.8 }));
    panel.position.y = 1.35;
    panel.position.z = 0.18;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.2 }));
    knob.position.set(w * 0.3, 1.2, 0.3);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.22, 0.56),
      new THREE.MeshStandardMaterial({ color: parseInt(color.slice(1), 16), emissive: parseInt(color.slice(1), 16), emissiveIntensity: 0.25 }));
    lintel.position.y = 3.2;
    g.add(frame, panel, knob, lintel);

    let pos: THREE.Vector3, rotY = 0;
    if (side === 'n') { pos = new THREE.Vector3(offset, 0, -r.d / 2); rotY = 0; }
    else if (side === 's') { pos = new THREE.Vector3(offset, 0, r.d / 2); rotY = Math.PI; }
    else if (side === 'w') { pos = new THREE.Vector3(-r.w / 2, 0, offset); rotY = Math.PI / 2; }
    else { pos = new THREE.Vector3(r.w / 2, 0, offset); rotY = -Math.PI / 2; }
    g.position.copy(pos);
    g.rotation.y = rotY;
    s.add(g);
    // exit doors back to the lobby skip the floating sign — the doorway + interact hint say it all
    if (!(side === 's' && !wide)) {
      this.label3d(s, label, color, pos.clone().setY(side === 's' ? 5.2 : 3.9).add(new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).multiplyScalar(0.6)), side === 's' ? 2.6 : 3.2);
    }

    const stand = pos.clone().add(new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).multiplyScalar(1.3));
    r.interactables.push({ pos: stand, radius: 1.7, label: `Press <b>E</b> — ${label}`, handler, isDoor: true });
  }

  private npc(r: RoomData, opts: VoxelHumanOpts, x: number, z: number, rotY: number,
    talk?: { label: string; handler: () => Promise<void> | void }, seated = false, seatY = 0.42): THREE.Group {
    const g = makeVoxelHuman(opts);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    if (seated) setVoxelSeated(g, true, seatY);
    // identity for the click-picker: derive a name from the chat label
    // ("chat with the resting tamer" → "Resting Tamer"); else from the registry
    const m = talk?.label.match(/(?:chat with|talk to|speak with|listen to|ask)\s+(.+)$/i);
    const derived = m
      ? m[1].replace(/^the\s+/i, '').replace(/<[^>]+>/g, '').replace(/\b\w/g, ch => ch.toUpperCase())
      : crowdName(`uni:${x.toFixed(1)},${z.toFixed(1)}`);
    tagNpc(g, derived);
    r.scene.add(g);
    r.npcs.push(g);
    r.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.55 });
    if (talk) r.interactables.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.5, label: `Press <b>E</b> — ${talk.label}`, handler: talk.handler });
    return g;
  }

  private prop(r: RoomData, mesh: THREE.Object3D, x: number, z: number, colliderR = 0.8): void {
    mesh.position.x += x; mesh.position.z += z;
    r.scene.add(mesh);
    if (colliderR > 0) r.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: colliderR });
  }

  // ---------------- generic quest dialogue flow ----------------
  private async questTalk(questId: string, giver: string, lines: {
    offer: [string, string][];     // first meeting / offer
    accepted: string;              // reminder while active
    ready: [string, string][];     // turn-in celebration
    done: string;                  // after completion
  }): Promise<void> {
    const p = this.player;
    const q = QUESTS[questId];
    const st = questState(p, questId);
    if (st === 'done') { await say(giver, lines.done); return; }
    if (st === 'available' || st === 'locked') {
      await conversation(lines.offer);
      const pick = await choose(giver, `${q.objective} — will you help?`, ['Accept the quest', 'Maybe later']);
      if (pick === 0) {
        acceptQuest(p, questId);
        toast(`Side quest started: ${q.title}`, 'gold');
        p.save();
        // it might already be completable
        if (questState(p, questId) === 'ready') await this.questTalk(questId, giver, lines);
      }
      return;
    }
    if (st === 'ready') {
      await conversation(lines.ready);
      const summary = completeQuest(p, questId);
      toast(`Quest complete: ${q.title}!`, 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      updateHUD(p, 'Leodones University');
      return;
    }
    await say(giver, lines.accepted);
  }

  // ---------------- Historian Veyl — the Chronicle, chapters II–IV ----------------
  private async historianTalk(): Promise<void> {
    const p = this.player;

    // Chapter II — the meeting Hale arranged
    if (!p.flags['met_historian']) {
      if (questState(p, 'story_historian') !== 'active') {
        await say('Historian Veyl', 'Charts. Storm-tracks. Nine years of triangulating a man who does not wish to be triangulated. Unless Instructor Hale sent you, I am — politely — catastrophically busy.');
        return;
      }
      await runCinematicScene('library', async cine => {
        cine.shot('wide');
        await say('Historian Veyl', `Hale's graduate. Yes. You have the look — half triumph, half "where exactly am I going". Sit. Don't touch that chart. Or that one. Best keep your hands in the air, honestly.`);
        cine.shot('veyl');
        await say('Historian Veyl', `You want Greggy the Stormheart. Everyone wants Greggy — the Houses, the papers, one EXTREMELY persistent biographer. The difference is that I can actually find him, because I don't chase the man. I chase the WEATHER.`);
        await say('Historian Veyl', `Nine years of storm-tracks, and every anomalous strike pattern bends around one truth: the Stormheart grounds himself where the world's charge gathers. Find tomorrow's lightning, and you find yesterday's legend.`);
        cine.shot('desk');
        await say('Historian Veyl', `And as it happens — three weeks ago a bog north-east of Haven started catching the SAME lightning every night. Thunderfen Mire, the locals call it now. New on every map, including yours — I've just marked it.`);
        
        p.flags['met_historian'] = true;
        p.flags['historian_intel'] = true;   // the Thunderfen gate wakes on the overworld
        const summary = completeQuest(p, 'story_historian');
        toast('✅ Chapter II complete: The Man Who Maps Storms!', 'gold');
        if (summary) toast(`Received ${summary}`, 'gold');
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));

        cine.shot('veyl');
        await say('Historian Veyl', `Now — the price of my next sentence. The wild Guardians in that mire are shedding STORM-TOUCHED AMBER: fossil resin with a living spark sealed inside. Amber remembers the storm that made it. Bring me one piece and I can read where that storm has been roosting.`);
        cine.shot('hero');
        await say('Historian Veyl', `One piece. Unbruised. The wilds drop it after an honest scrap. Off you go — and if Hale asks, tell him I was charming.`);
      });
      updateHUD(p, 'Leodones University');
      return;
    }

    // Chapter III — the amber turn-in: the chart to Agdao
    if (questState(p, 'story_amber') === 'ready') {
      await runCinematicScene('library', async cine => {
        cine.shot('desk');
        await say('Historian Veyl', `You have it. You actually— give it here, GENTLY, it's older than the Compact...`);
        cine.shot('veyl');
        await say('Historian Veyl', `...There. Look at the spark spiral — counter-clockwise, tight, with a western drift. This charge was born over open sea. The Stormheart isn't on any continent at all. He's on an ISLAND.`);
        await say('Historian Veyl', `And there is exactly one island in the western sea where a storm would go to REST. Where everything went to begin. Agdao — the Cradle of Tamers. Aurelia's island. Of course. OF COURSE. Nine years and the answer was a history book.`);
        cine.shot('desk');
        await say('Historian Veyl', `Take my sea-chart — seven hundred years of corrections, nine inks, one slightly heroic coffee stain. Your overworld map knows the way to Agdao now. Ask the islanders when you land; they notice everything and forgive most of it.`);

        const summary = completeQuest(p, 'story_amber');   // consumes the amber, grants the chart, unlocks Agdao
        toast('✅ Chapter III complete: Amber in the Mire!', 'gold');
        if (summary) toast(`Received ${summary}`, 'gold');
        toast('🏝️ Agdao Island is now on your overworld map!', 'gold');
        syncStoryQuests(p).forEach(n => toast(n, 'gold'));

        cine.shot('wide');
        await say('Historian Veyl', 'When you find him — and you will — tell him Veyl finally worked it out. He\'ll laugh. It\'s a good laugh. It\'s why nobody minds that he hides.');
      });
      updateHUD(p, 'Leodones University');
      return;
    }
    if (questState(p, 'story_amber') === 'active') {
      await say('Historian Veyl', 'The Thunderfen Mire — north-east of Haven, marked on your overworld. The wilds shed the amber after a battle. One piece, unbruised, and mind the bog: it bites back.');
      return;
    }

    // ---- post-story states ----
    if (p.flags['arc1_done']) {
      await say('Historian Veyl', 'The spire is silent, the engine answered to a NAME, and my storm-charts now matter to exactly everyone. I have been cited four times this week. Tamer, you have made an old librarian dangerous.');
      return;
    }
    if (p.flags['met_greggy']) {
      await say('Historian Veyl', 'You FOUND him. Nine years of charts vindicated in one boat ride. Did he laugh when you told him? ...He laughed. Excellent. Carry on, tamer — history is watching you with considerable interest.');
      return;
    }
    await say('Historian Veyl', 'Agdao, tamer. The chart knows the way, the tide is patient, and legends do not grow younger. Why are you still in my library?');
  }

  // ================= LOBBY =================
  private buildLobby(): void {
    const r = this.newRoom('lobby', 42, 30, { camHeight: 7.2, camDist: 8.6 });
    const s = r.scene;
    s.background = skyGradient('#2a2f4a', '#11131f');
    s.fog = new THREE.Fog(0x14161f, 26, 60);
    s.add(new THREE.AmbientLight(0xfff2dc, 0.5));

    // floor: grand marble with a central carpet runner to the officers' hall
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: marbleTexture('#cfd2dd', '#9aa0b5', 10), roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(3.4, r.d - 4),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#6e2a32', '#d8b56a', 1), roughness: 0.95 }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.y = 0.012;
    s.add(runner);
    const medallion = new THREE.Mesh(new THREE.CircleGeometry(4.6, 36),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#274068', '#c8b282', 1), roughness: 0.95 }));
    medallion.rotation.x = -Math.PI / 2;
    medallion.position.y = 0.014;
    s.add(medallion);

    this.shell(r, wallpaperTexture('#3e4566', '#3a2c1e', '#c8b282', 6), 0x262b40, 7.5);

    // columns in two colonnades
    const colMat = new THREE.MeshStandardMaterial({ map: marbleTexture('#bfc2d2', '#8a90a8', 2), roughness: 0.4 });
    for (const x of [-12, -6, 6, 12]) {
      for (const z of [-8, 0, 8]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 7.5, 12), colMat);
        col.position.set(x, 3.75, z);
        col.castShadow = true;
        const capTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), colMat);
        capTop.position.set(x, 7.3, z);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), colMat);
        base.position.set(x, 0.15, z);
        s.add(col, capTop, base);
        r.colliders.push({ pos: new THREE.Vector3(x, 0, z), r: 0.95 });
      }
    }

    // chandeliers
    for (const [x, z] of [[-9, -4], [9, -4], [-9, 6], [9, 6], [0, 0]] as const) {
      const ch = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x6a5a2a }));
      chain.position.y = 0.9;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const candle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6),
          new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9a3a, emissiveIntensity: 1.3 }));
        candle.position.set(Math.cos(a), 0.16, Math.sin(a));
        candle.name = 'flame';
        ch.add(candle);
      }
      const light = new THREE.PointLight(0xffd9a0, 38, 18);
      light.position.y = -0.4;
      if (x === 0) light.castShadow = true;
      ch.add(ring, chain, light);
      ch.position.set(x, 5.6, z);
      s.add(ch);
    }

    // founder statue on the central medallion
    const statue = makeVoxelHuman({ skin: 0xd8c27a, hair: 0xc9a24a, top: 0xb89a3a, bottom: 0xa8883a, shoes: 0x8a6a2a, cap: null, robe: true });
    statue.scale.setScalar(1.7);
    statue.position.set(0, 0.95, -1.5);
    statue.rotation.y = Math.PI;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1, 10),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#8a8198', '#4a4458', 1), roughness: 0.7 }));
    plinth.position.set(0, 0.5, -1.5);
    plinth.castShadow = true;
    s.add(statue, plinth);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, -1.5), r: 2.1 });
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, 1), radius: 1.6,
      label: 'Press <b>E</b> — read the statue\'s plaque',
      handler: () => say('', '“CHANCELLOR AURELIA WANE — who, when the empire fell and its Guardians ran wild, chose to teach rather than to tame. This University is her answer, given in stone: that trust is trained, never forced.”'),
    });

    // five guild banners across the north wall
    HOUSES.slice(0, 5).forEach((h, i) => {
      const x = (i - 2) * 6.4;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 4.4),
        new THREE.MeshStandardMaterial({ color: parseInt(h.color.slice(1), 16), roughness: 0.92, side: THREE.DoubleSide }));
      cloth.position.set(x, 4.6, -r.d / 2 + 0.45);
      const iconTex = new THREE.CanvasTexture(guildIconCanvas(h.id, 256));
      iconTex.colorSpace = THREE.SRGBColorSpace;
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshStandardMaterial({ map: iconTex, transparent: true, roughness: 0.8 }));
      icon.position.set(x, 4.9, -r.d / 2 + 0.48);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8 }));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(x, 6.9, -r.d / 2 + 0.45);
      s.add(cloth, icon, rod);
    });

    // reception desk (south-east of center)
    const desk = new THREE.Group();
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.16, 1.2),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 2), roughness: 0.6 }));
    deskTop.position.y = 1.05;
    const deskBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1, 1),
      new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 2), roughness: 0.85 }));
    deskBody.position.y = 0.5;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.2 }));
    bell.position.set(1.4, 1.15, 0);
    desk.add(deskTop, deskBody, bell);
    this.prop(r, desk, 7.5, 10, 0);
    r.colliders.push({ pos: new THREE.Vector3(7.5, 0, 10), r: 2.3 });
    this.npc(r, { top: 0x8a4a9a, hair: 0x3a2a1a, cap: null }, 7.5, 8.9, Math.PI, {
      label: 'speak with Receptionist Dana',
      handler: async () => {
        await conversation([
          ['Receptionist Dana', `Welcome to the Leodones University of Aurel, ${this.player.tamerName}! Congratulations on surviving — ah, passing your exam.`],
          ['Receptionist Dana', 'The Officers\' Hall is through the grand door to the north — the five Grand Houses are recruiting graduates like you today.'],
          ['Receptionist Dana', 'Cafeteria and Training Hall are along the east wall; Classroom, Library and Locker Room to the west. The Infirmary is the east door nearest the entrance — Nurse Imelda patches up Guardians for free.'],
          ['Receptionist Dana', 'And do read the notice board beside me. Half the staff here will pay good Shards for a capable graduate\'s help.'],
        ]);
      },
    });

    // notice board
    const board = new THREE.Group();
    const bFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 0.12),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.9 }));
    bFrame.position.y = 1.7;
    const bCork = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xb89058, roughness: 1 }));
    bCork.position.set(0, 1.7, 0.07);
    for (const [nx, ny, nc] of [[-0.7, 1.9, 0xfff2cc], [0.1, 1.55, 0xcce8ff], [0.75, 1.85, 0xffd9d9], [-0.2, 1.95, 0xd9ffd9]] as const) {
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4),
        new THREE.MeshStandardMaterial({ color: nc, roughness: 1 }));
      note.position.set(nx, ny, 0.09);
      note.rotation.z = (nx * 7 % 1) * 0.2 - 0.1;
      board.add(note);
    }
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a3320 }));
    legL.position.set(-1, 0.85, 0);
    const legR = legL.clone(); legR.position.x = 1;
    board.add(bFrame, bCork, legL, legR);
    board.rotation.y = Math.PI;
    this.prop(r, board, 11.5, 10.5, 1.2);
    r.interactables.push({
      pos: new THREE.Vector3(11.5, 0, 9.3), radius: 1.6,
      label: 'Press <b>E</b> — read the notice board',
      handler: () => this.openNoticeBoard(),
    });

    // benches with seated tamers
    const benchAt = (x: number, z: number, rotY: number) => {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.7),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.8 }));
      seat.position.y = 0.5;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.1),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.8 }));
      back.position.set(0, 0.95, -0.3);
      for (const lx of [-1.1, 1.1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
        leg.position.set(lx, 0.25, 0);
        bench.add(leg);
      }
      bench.add(seat, back);
      bench.rotation.y = rotY;
      this.prop(r, bench, x, z, 1.1);
      return { x, z, rotY };
    };

    const b1 = benchAt(-16, 6, Math.PI / 2);
    const b2 = benchAt(16, -2, -Math.PI / 2);
    benchAt(-16, -6, Math.PI / 2);
    // seated chatters on benches
    const sit1 = this.npc(r, { top: 0xc4763a, hair: 0x1a1a26, cap: null }, b1.x + 0.35, b1.z - 0.55, Math.PI / 2, {
      label: 'chat with the resting tamer',
      handler: () => say('Tamer Hollis', 'Four expeditions this week. My legs are done, my Guardians are thriving, and my boots have opinions. Take the bench sometimes, graduate — burnout catches more tamers than any monster.'),
    }, true, 0.55);
    sit1.position.y = 0.12;
    const sit2 = this.npc(r, { top: 0x3a8a6a, hair: 0xd8d8e8, cap: null }, b2.x - 0.35, b2.z + 0.55, -Math.PI / 2, {
      label: 'chat with the old tamer',
      handler: () => say('Elder Tamsin', 'I pledged to Mistveil sixty years ago, child. My Sigil card is worn smooth at the corners — but look closely and you can still read every quest on the back. Make yours worth reading.'),
    }, true, 0.55);
    sit2.position.y = 0.12;

    // chatting pairs
    const mkPair = (x: number, z: number, idx: number, topA: number, topB: number) => {
      this.npc(r, { top: topA, cap: null }, x - 0.55, z, Math.PI / 2 + Math.PI / 12, {
        label: 'listen in',
        handler: () => conversation(PAIR_CHATS[idx]),
      });
      this.npc(r, { top: topB, hair: 0x6a4a2a, cap: 0x444a66 }, x + 0.55, z, -Math.PI / 2 - Math.PI / 12, {
        label: 'listen in',
        handler: () => conversation(PAIR_CHATS[idx]),
      });
    };
    mkPair(-9, 11, 0, 0xb04a3a, 0x3a6ea8);
    mkPair(14, 4, 1, 0x6a8a3a, 0x8a5aa8);

    // Niko in the corner (side quest)
    this.npc(r, { top: 0x4a5a8a, hair: 0x1a1a26, cap: null }, -19, 12.5, Math.PI / 4, {
      label: 'talk to the nervous student',
      handler: () => this.questTalk('side_niko', 'Student Niko', {
        offer: [
          ['Student Niko', 'Oh! Um. Hi. You\'re the graduate everyone\'s talking about, right? The one from the Trial Caverns?'],
          ['Student Niko', 'I was supposed to take my first expedition three weeks ago. I keep… not going. Everyone says wild Guardians can become your friends but what if they just— what if they don\'t like me?'],
          ['Student Niko', 'Could you… prove it\'s possible? Befriend one out there. A real wild one. Then come tell me everything. Please?'],
        ],
        accepted: 'You\'ll tell me how it goes, right? What they\'re like? When they stop being scared of you?',
        ready: [
          ['Student Niko', 'You actually did it?! A wild Guardian chose to come with you?!'],
          ['Student Niko', 'What was it like? Was it scary? Was it— no, don\'t tell me. I want to find out myself.'],
          ['Student Niko', 'I\'m signing up for the Mossdeep expedition. Tomorrow. Maybe. Definitely maybe. …Thank you.'],
        ],
        done: 'I fed a wild Pebblit half my sandwich yesterday. It followed me to the gate! Progress!',
      }),
    });

    // Old Tomas the janitor (side quest)
    this.npc(r, { top: 0x6a6a72, hair: 0xc8c8d0, bottom: 0x4a4a52, cap: null }, -12.5, 1.5, Math.PI / 3, {
      label: 'talk to Old Tomas',
      handler: () => this.questTalk('side_wrench', 'Old Tomas', {
        offer: [
          ['Old Tomas', 'Forty years I\'ve swept these floors. Forty years, and not once — NOT once — did I misplace my wrench.'],
          ['Old Tomas', 'Brass-handled. Engraved. Marshal Voltaine herself gave it to me after I fixed her storm-coil with a hairpin and spite.'],
          ['Old Tomas', 'Some first-year "borrowed" it to open a stuck locker and left it in the Locker Room. My knees don\'t do lockers anymore. Fetch it back and I\'ll see you\'re rewarded.'],
        ],
        accepted: 'West wall, the Locker Room. Brass handle, my initials on it. Mind the smell of feet.',
        ready: [
          ['Old Tomas', 'My wrench! Give it here— ah. There she is. Engraving and all.'],
          ['Old Tomas', 'You\'ve done an old man a true service. Here — and if anyone asks, Tomas owes you nothing, we\'re square, this never happened.'],
        ],
        done: 'The wrench stays on the belt now. Welded the loop shut myself.',
      }),
    });
    // broom prop next to Tomas
    const broom = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
    stick.position.y = 0.95; stick.rotation.z = 0.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0xc8a868 }));
    head.position.set(0.16, 0.12, 0);
    broom.add(stick, head);
    this.prop(r, broom, -11.8, 1.1, 0);

    // wandering tamers
    const wanderPalettes: VoxelHumanOpts[] = [
      { top: 0xd84a6a, cap: null }, { top: 0x3a9d8a, cap: 0x2a2a3a }, { top: 0xc9892a, hair: 0x6a4a2a, cap: null },
      { top: 0x5a7bd8, cap: null, hair: 0xd8b46a }, { top: 0x7a4a9a, cap: 0xd8d8e8 },
    ];
    wanderPalettes.forEach((pal, i) => {
      const g = makeVoxelHuman(pal);
      const x = -10 + i * 5, z = -10 + (i % 3) * 8;
      g.position.set(x, 0, z);
      tagNpc(g, crowdName(`uni-wanderer:${i}`));
      s.add(g);
      this.wanderers.push({ g, target: new THREE.Vector3(x, 0, z), pause: 1 + i, speed: 1.5 + (i % 3) * 0.35 });
      r.interactables.push({
        pos: g.position, radius: 1.4,
        label: 'Press <b>E</b> — chat with the passing tamer',
        handler: async () => {
          const lines = LOBBY_CHATTER[this.chatterIdx++ % LOBBY_CHATTER.length];
          await conversation(lines);
        },
      });
    });

    // potted plants in corners
    for (const [x, z] of [[-19.5, -13], [19.5, -13], [-19.5, 13.5], [19.5, 13.5], [-3, 13.5], [3, 13.5]] as const) {
      const plant = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.55, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a5a3a, roughness: 0.9 }));
      pot.position.y = 0.27;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.95 }));
      bush.position.y = 0.95;
      const bush2 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x4aa45a, roughness: 0.95 }));
      bush2.position.set(0.2, 1.3, 0.1);
      plant.add(pot, bush, bush2);
      this.prop(r, plant, x, z, 0.6);
    }

    // ---- doors ----
    this.door(r, 's', 0, '🚪 Grand Doors — Haven City', '#f2c14e', () => this.leaveUniversity(), true);
    this.door(r, 'n', 0, '🏛 Officers\' Hall', '#c9a24a', () => this.enterRoom('officers'), true);
    this.door(r, 'e', -9, '🍲 Cafeteria', '#f2935a', () => this.enterRoom('cafeteria'));
    this.door(r, 'e', 1, '🥊 Training Hall', '#e85a6a', () => this.enterRoom('training'));
    this.door(r, 'e', 10, '🩹 Infirmary', '#5ad88a', () => this.enterRoom('infirmary'));
    this.door(r, 'w', -9, '📚 Library', '#b18ae8', () => this.enterRoom('library'));
    this.door(r, 'w', 1, '📖 Classroom', '#5ab8e8', () => this.enterRoom('classroom'));
    this.door(r, 'w', 10, '🔒 Locker Room', '#9aa0b8', () => this.enterRoom('lockers'));

    // ---- guidance beacons: pledge first (Officers' Hall), then the city ----
    this.officersBeacon = makeGuideBeacon(0xc9a24a);
    this.officersBeacon.group.position.set(0, 0, -r.d / 2 + 2.2);
    s.add(this.officersBeacon.group);
    this.doorsBeacon = makeGuideBeacon(0xf2c14e);
    this.doorsBeacon.group.position.set(0, 0, r.d / 2 - 2.4);
    s.add(this.doorsBeacon.group);
  }

  // ================= CAFETERIA =================
  private buildCafeteria(): void {
    const r = this.newRoom('cafeteria', 20, 14);
    const s = r.scene;
    s.background = skyGradient('#33261a', '#140e08');
    s.add(new THREE.AmbientLight(0xffe8c8, 0.6));
    const main = new THREE.PointLight(0xffd9a0, 26, 22);
    main.position.set(0, 4.4, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: tileTexture('#c8b89a', '#8a7a5e', 8), roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.shell(r, wallpaperTexture('#7a5a3a', '#4a3320', '#c8b282', 4), 0x3a2c1e, 4.6);

    // serving counter along the north wall
    const counter = new THREE.Group();
    const cTop = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 1.4),
      new THREE.MeshStandardMaterial({ map: marbleTexture('#d8cab0', '#a8946a', 2), roughness: 0.3 }));
    cTop.position.y = 1.05;
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1, 1.2),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 3), roughness: 0.85 }));
    cBody.position.y = 0.5;
    counter.add(cTop, cBody);
    // steaming pots
    for (const px of [-3, -1, 1, 3]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x5a5e6a, metalness: 0.7, roughness: 0.3 }));
      pot.position.set(px, 1.33, 0);
      const steam = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }));
      steam.position.set(px, 1.75, 0);
      steam.name = 'steam';
      counter.add(pot, steam);
    }
    this.prop(r, counter, 0, -r.d / 2 + 1.6, 0);
    r.colliders.push({ pos: new THREE.Vector3(0, 0, -r.d / 2 + 1.6), r: 0 });
    // wide box collider approximated by circles
    for (const px of [-4, -2, 0, 2, 4]) r.colliders.push({ pos: new THREE.Vector3(px, 0, -r.d / 2 + 1.6), r: 1.1 });

    // Chef Marlo behind the counter
    tagNpc(this.npc(r, { top: 0xe8e8e8, hair: 0x6a3a1a, cap: 0xe8e8e8 }, 0, -r.d / 2 + 0.7, 0, undefined), 'Chef Marlo');
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, -r.d / 2 + 2.6), radius: 1.8,
      label: 'Press <b>E</b> — talk to Chef Marlo',
      handler: () => this.questTalk('side_chef', 'Chef Marlo', {
        offer: [
          ['Chef Marlo', 'NO substitutions, NO refunds, and NO feeding the gravy bread to your Guardians, it makes them dramatic!'],
          ['Chef Marlo', '…Oh. You\'re not in my line. You\'re the new graduate. Hm. You look like someone who can follow a recipe.'],
          ['Chef Marlo', 'Tomorrow is Berry Glaze Day. Four hundred students. Zero berries in my pantry, because SOMEONE — Pell — left the cold-box open. Bring me three Sweet Berries. Fresh. Unbruised. My reputation hangs on it.'],
        ],
        accepted: 'Three Sweet Berries! The provisioner in Haven City stocks them, or shake a bush in the wild. UNBRUISED.',
        ready: [
          ['Chef Marlo', 'Let me see them. Hmm. Hmmmm. …These are GOOD berries. Where were you when Pell was hired?'],
          ['Chef Marlo', 'Berry Glaze Day is saved. Take these honey rolls — first batch, employee price: free. Tell NO ONE I smiled.'],
        ],
        done: 'Berry Glaze Day was a triumph. Three students wept. One proposed to the glaze. Normal numbers.',
      }),
    });

    // long dining tables with seated eaters
    const mkTable = (x: number, z: number) => {
      const t = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 1.4),
        new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a36', 2), roughness: 0.7 }));
      top.position.y = 0.85;
      for (const lx of [-2, 2]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 1.2), new THREE.MeshStandardMaterial({ color: 0x4a3320 }));
        leg.position.set(lx, 0.42, 0);
        t.add(leg);
      }
      for (const bz of [-1.05, 1.05]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 0.5),
          new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.85 }));
        bench.position.set(0, 0.48, bz);
        t.add(bench);
      }
      // plates & mugs
      for (const [px, pz] of [[-1.4, 0.3], [0.2, -0.35], [1.5, 0.25]] as const) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12),
          new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4 }));
        plate.position.set(px, 0.95, pz);
        const food = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xc4763a, roughness: 0.9 }));
        food.position.set(px, 1.02, pz);
        t.add(plate, food);
      }
      t.add(top);
      this.prop(r, t, x, z, 0);
      for (const cx of [x - 1.6, x, x + 1.6]) r.colliders.push({ pos: new THREE.Vector3(cx, 0, z), r: 1.0 });
      return { x, z };
    };
    const t1 = mkTable(-4.5, -0.5);
    const t2 = mkTable(4.5, -0.5);
    mkTable(-4.5, 3.8);
    const t4 = mkTable(4.5, 3.8);

    // seated diners
    const diner = (tx: number, tz: number, ox: number, oz: number, top: number, line: [string, string]) => {
      const g = this.npc(r, { top, cap: null }, tx + ox, tz + oz, oz > 0 ? Math.PI : 0, {
        label: 'chat between bites',
        handler: () => say(line[0], line[1]),
      }, true, 0.52);
      g.position.y = 0.1;
    };
    diner(t1.x, t1.z, -1.2, 1.05, 0x3a6ea8, ['Tamer Posy', 'The stew\'s got Verdant herbs in it today. Chef says it\'s "brain food for type matchups". I say it\'s delicious propaganda.']);
    diner(t1.x, t1.z, 0.4, -1.05, 0xb04a3a, ['Tamer Grum', 'Mmf— sorry. Gravy bread. You want the corner piece, always the corner piece. Crispy edges, soft heart. Like my Pebblit.']);
    diner(t2.x, t2.z, 0.8, 1.05, 0x6a8a3a, ['Tamer Lutt', 'I study the expedition maps while I eat. Double efficiency! I\'ve also spilled soup on four maps. The Vault one is mostly soup now.']);
    diner(t4.x, t4.z, -0.6, 1.05, 0x8a5aa8, ['Tamer Vee', 'Don\'t tell the librarian, but someone left her precious ledger here, on MY table. It\'s been judging my table manners for a week.']);

    // the lost Expedition Ledger (side_ledger objective)
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x7a2e35, roughness: 0.6 }));
    ledger.position.set(t4.x + 1.6, 0.96, t4.z - 0.3);
    s.add(ledger);
    r.interactables.push({
      pos: new THREE.Vector3(t4.x + 1.6, 0, t4.z - 0.3), radius: 1.4,
      label: 'Press <b>E</b> — a gravy-stained ledger…',
      handler: async () => {
        const p = this.player;
        if (p.flags['found_ledger']) { await say('', 'Just crumbs left here now. The ledger is safely back with you — or with Wren.'); return; }
        if (questState(p, 'side_ledger') !== 'active') {
          await say('', 'A thick red ledger, stained with gravy. The bookplate reads: "PROPERTY OF THE UNIVERSITY ARCHIVE — W." Someone in the Library must miss this.');
          return;
        }
        p.flags['found_ledger'] = true;
        p.save();
        ledger.visible = false;
        toast('Found the Expedition Ledger!', 'gold');
        await say('', 'You rescue the Expedition Ledger from a puddle of gravy. 212 years of survey notes… and one very recent sandwich pressed inside like a flower.');
      },
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  // ================= CLASSROOM =================
  private buildClassroom(): void {
    const r = this.newRoom('classroom', 18, 13);
    const s = r.scene;
    s.background = skyGradient('#1e2436', '#0c0e18');
    s.add(new THREE.AmbientLight(0xe8eeff, 0.65));
    const main = new THREE.PointLight(0xfff2dc, 22, 20);
    main.position.set(0, 4.2, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: plankTexture('#8a6a44', 5), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.shell(r, wallpaperTexture('#44506e', '#3a2c1e', '#c8b282', 4), 0x2c3248, 4.6);

    // blackboard with the type chart chalked on
    const bb = document.createElement('canvas');
    bb.width = 512; bb.height = 256;
    {
      const ctx = bb.getContext('2d')!;
      ctx.fillStyle = '#23362a'; ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 246);
      ctx.fillStyle = '#e8e8d8';
      ctx.font = 'bold 30px Comic Sans MS, cursive';
      ctx.textAlign = 'center';
      ctx.fillText('TYPING THEORY — WEEK 9', 256, 44);
      ctx.font = '24px Comic Sans MS, cursive';
      const lines = ['Blaze ▶ Verdant   Tide ▶ Blaze', 'Verdant ▶ Tide   Volt ▶ Gale', 'Umbra ▶ Volt   Gale ▶ Verdant', '"Know the foe BEFORE the first strike!"'];
      lines.forEach((l, i) => ctx.fillText(l, 256, 92 + i * 40));
    }
    const bbTex = new THREE.CanvasTexture(bb);
    bbTex.colorSpace = THREE.SRGBColorSpace;
    const blackboard = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5),
      new THREE.MeshStandardMaterial({ map: bbTex, roughness: 0.9 }));
    blackboard.position.set(0, 2.4, -r.d / 2 + 0.05);
    s.add(blackboard);

    // teacher's desk + Professor Lyra
    const tdesk = new THREE.Group();
    const tTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.1),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.7 }));
    tTop.position.y = 0.95;
    const tBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.85 }));
    tBody.position.y = 0.45;
    tdesk.add(tTop, tBody);
    this.prop(r, tdesk, 3, -r.d / 2 + 2.2, 1.5);

    tagNpc(this.npc(r, { top: 0x2a4a6a, hair: 0xd8d8e8, robe: true, cap: null }, 0.4, -r.d / 2 + 2, Math.PI, undefined), 'Professor Lyra');
    r.interactables.push({
      pos: new THREE.Vector3(0.4, 0, -r.d / 2 + 3.4), radius: 1.8,
      label: 'Press <b>E</b> — talk to Professor Lyra',
      handler: () => this.professorLyra(),
    });

    // student desks in rows, two students seated (rows kept clear of the door spawn)
    for (let row = 0; row < 3; row++) {
      for (let colI = 0; colI < 3; colI++) {
        const x = (colI - 1) * 4, z = -2.3 + row * 2.4;
        const dsk = new THREE.Group();
        const dTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.9),
          new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a36', 1), roughness: 0.7 }));
        dTop.position.y = 0.78;
        for (const [lx, lz] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]] as const) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a44 }));
          leg.position.set(lx, 0.39, lz);
          dsk.add(leg);
        }
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.32),
          new THREE.MeshStandardMaterial({ color: [0xa8453a, 0x3a6ea8, 0x4a8a4a][colI], roughness: 0.7 }));
        book.position.set(0.2, 0.86, 0);
        book.rotation.y = colI * 0.4;
        dsk.add(dTop, book);
        this.prop(r, dsk, x, z, 0.9);
      }
    }
    const stud1 = this.npc(r, { top: 0xc4763a, cap: null }, -4, 0.75, 0, {
      label: 'whisper to the student',
      handler: () => say('Student Fenna', 'Psst — Lyra\'s quiz? Question two is ALWAYS about Umbra. Fourteen graduates have failed it. The prize pool keeps growing. You didn\'t hear it from me.'),
    }, true, 0.5);
    stud1.position.y = 0.08;
    const stud2 = this.npc(r, { top: 0x5a8a6a, hair: 0x1a1a26, cap: null }, 4, 3.15, 0, {
      label: 'whisper to the student',
      handler: () => say('Student Brio', 'I\'m only auditing this class for the chalk smell. Don\'t judge me. The chalk here is imported.'),
    }, true, 0.5);
    stud2.position.y = 0.08;

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  private async professorLyra(): Promise<void> {
    const p = this.player;
    const st = questState(p, 'side_quiz');
    if (st === 'done') {
      await say('Professor Lyra', 'My only passing student. I\'ve framed your quiz. The frame cost more than the prize. Do not tell the bursar.');
      return;
    }
    if (st === 'available') {
      await conversation([
        ['Professor Lyra', 'Sit. No — stand, actually, this won\'t take long, because you will fail, like the fourteen before you.'],
        ['Professor Lyra', 'The Academy mails me "graduates". I mail back corrections. Three questions on typing theory. Pass, and the standing prize pool — three hundred Shards — is yours.'],
      ]);
      const pick = await choose('Professor Lyra', 'Will you take the examination?', ['Begin the quiz', 'Flee with dignity']);
      if (pick !== 0) { await say('Professor Lyra', 'Dignity. Hm. That\'s a first, usually they just run.'); return; }
      acceptQuest(p, 'side_quiz');
      toast('Side quest started: Pop Quiz', 'gold');
    } else if (st === 'active') {
      await say('Professor Lyra', 'Back to retake it? Good. Persistence grades higher than talent.');
    }

    // the quiz itself
    const q1 = await choose('Professor Lyra', 'Question ONE. A Blaze technique strikes hardest against which type?', ['Tide', 'Verdant', 'Volt']);
    const q2 = await choose('Professor Lyra', 'Question TWO — and do think — Umbra arts devour which type for massive damage?', ['Volt', 'Gale', 'Blaze… wait—']);
    const q3 = await choose('Professor Lyra', 'Question THREE. Your Tide Guardian faces a Volt foe. Your move?', ['Attack — water beats everything', 'Swap out — Tide arts are weak into Volt', 'Cry']);
    const score = (q1 === 1 ? 1 : 0) + (q2 === 0 ? 1 : 0) + (q3 === 1 ? 1 : 0);
    if (score === 3) {
      p.flags['quiz_passed'] = true;
      p.save();
      await conversation([
        ['Professor Lyra', '…'],
        ['Professor Lyra', 'Three for three. THREE for THREE! Fenna, mark the date! The Academy has produced an educated graduate!'],
      ]);
      const summary = completeQuest(p, 'side_quiz');
      toast('Quest complete: Pop Quiz!', 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
    } else {
      await say('Professor Lyra', `${score} out of three. ${score === 2 ? 'Agonizingly close. The chalk weeps.' : 'The chalk and I are both disappointed.'} Study the blackboard and return — the prize pool isn\'t going anywhere. Clearly.`);
    }
  }

  // ================= LIBRARY =================
  /**
   * The Grand Archive — a cathedral of paper. A mezzanine gallery rides the
   * north wall above the restricted stacks, rolling ladders lean on towering
   * shelves, green-shaded lamps pool light on the long reading table, and a
   * five-hundred-year-old globe turns slowly in the corner. People actually
   * READ here: scholars at the table, students whispering in the aisles, and
   * one apprentice who fell asleep over chapter twelve.
   */
  private buildLibrary(): void {
    const r = this.newRoom('library', 24, 16, { camHeight: 6.6, camDist: 7.4 });
    const s = r.scene;
    s.background = skyGradient('#241e32', '#0e0a16');
    s.add(new THREE.AmbientLight(0xd8c8ff, 0.62));
    const lamp1 = new THREE.PointLight(0xffd9a0, 24, 20);
    lamp1.position.set(-5, 4.2, 0);
    const lamp2 = new THREE.PointLight(0xffd9a0, 24, 20);
    lamp2.position.set(5, 4.2, 1);
    lamp2.castShadow = true;
    // the reading table's pooled lamplight
    const tableGlow = new THREE.PointLight(0xb8f2c8, 9, 8);
    tableGlow.position.set(0, 2.2, 1.2);
    s.add(lamp1, lamp2, tableGlow);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#3a3050', '#8a7ab0', 5), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // a grand circular rug under the reading table
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 28),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#5a2e3a', '#c9a24a', 1), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 1.2);
    s.add(rug);
    this.shell(r, wallpaperTexture('#3a3452', '#2c2438', '#8a7ab0', 5), 0x241e32, 6.6);

    const shelfMat = new THREE.MeshStandardMaterial({ map: bookshelfTexture(), roughness: 0.85 });
    const sideMat = new THREE.MeshStandardMaterial({ map: plankTexture('#3a2a18', 1), roughness: 0.9 });
    const shelf = (x: number, z: number, rotY: number, len = 4.4, h = 3.8, yBase = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.7), [sideMat, sideMat, sideMat, sideMat, shelfMat, shelfMat]);
      m.position.set(x, yBase + h / 2, z);
      m.rotation.y = rotY;
      m.castShadow = true;
      s.add(m);
      if (yBase > 0) return; // gallery shelves float above head height — no colliders
      const steps = Math.ceil(len / 1.4);
      for (let i = 0; i < steps; i++) {
        const t = len * (i / (steps - 1) - 0.5);
        r.colliders.push({ pos: new THREE.Vector3(x + Math.cos(rotY) * t, 0, z - Math.sin(rotY) * t), r: 0.75 });
      }
    };

    // ---- the north wall: full-height stacks under a mezzanine gallery ----
    shelf(-8, -r.d / 2 + 0.8, 0, 6.6, 3.4);
    shelf(0, -r.d / 2 + 0.8, 0, 6.6, 3.4);
    shelf(8, -r.d / 2 + 0.8, 0, 6.6, 3.4);
    {
      // the gallery: a walkway of dark planks riding the stacks, with a
      // turned-post railing and a second storey of books above it
      const walk = new THREE.Mesh(new THREE.BoxGeometry(r.w - 1, 0.18, 2.2),
        new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 4), roughness: 0.85 }));
      walk.position.set(0, 3.55, -r.d / 2 + 1.3);
      s.add(walk);
      const railMat = new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.8 });
      for (let x = -r.w / 2 + 1.2; x <= r.w / 2 - 1.2; x += 1.15) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.8, 6), railMat);
        post.position.set(x, 4.0, -r.d / 2 + 2.3);
        s.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(r.w - 1.6, 0.08, 0.1), railMat);
      rail.position.set(0, 4.42, -r.d / 2 + 2.3);
      s.add(rail);
      // the upper storey of books
      shelf(-7, -r.d / 2 + 0.8, 0, 6.0, 2.2, 3.7);
      shelf(1.5, -r.d / 2 + 0.8, 0, 6.0, 2.2, 3.7);
      shelf(8.6, -r.d / 2 + 0.8, 0, 3.6, 2.2, 3.7);
      // a spiral-ish stair suggestion in the NW corner (decorative steps)
      for (let i = 0; i < 6; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.5), railMat);
        step.position.set(-r.w / 2 + 0.9, 0.6 + i * 0.58, -r.d / 2 + 3.4 - i * 0.42);
        s.add(step);
      }
      r.colliders.push({ pos: new THREE.Vector3(-r.w / 2 + 0.9, 0, -r.d / 2 + 2.6), r: 1.1 });
    }

    // ---- rolling ladders leaning on the stacks ----
    for (const [lx, lean] of [[-4.6, 0.22], [5.2, -0.18]] as const) {
      const ladder = new THREE.Group();
      const railM = new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.8 });
      for (const side of [-0.28, 0.28]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.4, 0.07), railM);
        rail.position.set(side, 1.7, 0);
        ladder.add(rail);
      }
      for (let i = 0; i < 6; i++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 6), railM);
        rung.rotation.z = Math.PI / 2;
        rung.position.y = 0.45 + i * 0.52;
        ladder.add(rung);
      }
      ladder.rotation.x = lean * 0.6;
      ladder.rotation.y = lean;
      ladder.position.set(lx, 0, -r.d / 2 + 1.55);
      s.add(ladder);
      r.colliders.push({ pos: new THREE.Vector3(lx, 0, -r.d / 2 + 1.55), r: 0.5 });
    }

    // ---- side aisles: tall stacks marching down both walls ----
    shelf(-r.w / 2 + 0.8, -2.5, Math.PI / 2, 4.6);
    shelf(-r.w / 2 + 0.8, 3.0, Math.PI / 2, 4.2);
    shelf(r.w / 2 - 0.8, 0.5, Math.PI / 2, 5.4);
    // freestanding aisle pair framing the reading hall
    shelf(-5.4, -2.0, 0, 4.6);
    shelf(5.4, -2.0, 0, 4.6);

    // ---- the restricted stacks, NE corner, behind a velvet rope ----
    {
      shelf(r.w / 2 - 0.8, -5.2, Math.PI / 2, 3.4);
      // rune-spined volumes glow on the shelf face
      for (let i = 0; i < 5; i++) {
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.06),
          new THREE.MeshStandardMaterial({
            color: 0x2a1a3a, emissive: [0x9a5af2, 0x5ad8e8, 0xe85a8a][i % 3], emissiveIntensity: 0.9,
          }));
        spine.name = 'wisp';
        spine.userData.baseY = 1.4 + (i % 3) * 0.5;
        spine.userData.ph = i * 1.7;
        spine.position.set(r.w / 2 - 1.35, 1.4 + (i % 3) * 0.5, -6.4 + i * 0.55);
        s.add(spine);
      }
      const ropeM = new THREE.MeshStandardMaterial({ color: 0x8a2438, roughness: 0.8 });
      const postM = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 });
      for (const [px, pz] of [[r.w / 2 - 3.4, -4.0], [r.w / 2 - 1.0, -4.0]] as const) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 1.0, 8), postM);
        post.position.set(px, 0.5, pz);
        s.add(post);
      }
      const rope = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.035, 6, 16, Math.PI), ropeM);
      rope.rotation.z = Math.PI;
      rope.scale.y = 0.35;
      rope.position.set(r.w / 2 - 2.2, 0.95, -4.0);
      s.add(rope);
      r.colliders.push({ pos: new THREE.Vector3(r.w / 2 - 2.2, 0, -4.6), r: 1.5 });
      r.interactables.push({
        pos: new THREE.Vector3(r.w / 2 - 2.2, 0, -3.2), radius: 1.6,
        label: 'Press <b>E</b> — peer into the restricted stacks',
        handler: async () => {
          await say('', 'A brass plaque: "RESTRICTED — by order of the Archive. The books beyond this rope read back." One of the glowing spines shifts, very slightly, like something turning over in its sleep.');
          await say('', 'From her lectern, Archivist Wren clears her throat without looking up. Message received.');
        },
      });
    }

    // ---- the five-hundred-year-old globe, still turning ----
    {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.5, 10),
        new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.8 }));
      stand.position.set(8.6, 0.25, 3.4);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18),
        new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.7 }));
      globe.position.set(8.6, 1.6, 3.4);
      globe.rotation.z = 0.41; // a scholar's respectful axial tilt
      globe.name = 'spinglobe';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2.6;
      ring.position.set(8.6, 1.6, 3.4);
      s.add(stand, globe, ring);
      r.colliders.push({ pos: new THREE.Vector3(8.6, 0, 3.4), r: 1.2 });
      r.interactables.push({
        pos: new THREE.Vector3(8.6, 0, 3.4), radius: 1.8,
        label: 'Press <b>E</b> — study the old globe',
        handler: async () => {
          await say('', 'Four continents under your fingertips: Olivar, Veyra, Tharkand, Noruun. Someone has marked Ghandra\'s fold with a tiny brass pin and, in pencil so old it\'s nearly silver: "still holding."');
          await say('', 'The globe turns on its own, one revolution per day, and nobody has ever found the mechanism. Library policy is not to look too hard.');
        },
      });
    }

    // ---- the grand reading table: green lamps, open books, working scholars ----
    {
      const table = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 1.7),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 3), roughness: 0.55 }));
      top.position.y = 0.92;
      table.add(top);
      for (const [lx, lz] of [[-2.5, -0.6], [2.5, -0.6], [-2.5, 0.6], [2.5, 0.6]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.92, 8), sideMat);
        leg.position.set(lx, 0.46, lz);
        table.add(leg);
      }
      // twin green-glass bankers' lamps
      for (const lx of [-1.6, 1.6]) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
        base.position.set(lx, 1.14, 0);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.18, 10, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0x2a6a4a, emissive: 0x4ad88a, emissiveIntensity: 0.9,
            side: THREE.DoubleSide, roughness: 0.4,
          }));
        shade.position.set(lx, 1.36, 0);
        table.add(base, shade);
      }
      // open books, an ink pot, loose paper
      for (let i = 0; i < 4; i++) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3),
          new THREE.MeshStandardMaterial({ color: [0xa8453a, 0x3a6ea8, 0x4a8a4a, 0xe8dcc0][i], roughness: 0.7 }));
        book.position.set(-1.9 + i * 1.25, 1.02, (i % 2 ? 0.35 : -0.3));
        book.rotation.y = (i - 1.5) * 0.3;
        table.add(book);
      }
      const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3 }));
      ink.position.set(0.4, 1.04, -0.5);
      table.add(ink);
      this.prop(r, table, 0, 1.2, 0); // colliders added per-seat below
      for (const cx of [-2, 0, 2]) r.colliders.push({ pos: new THREE.Vector3(cx, 0, 1.2), r: 0.95 });
    }

    // scholars at the table — actually reading, not waiting for a cue
    for (const [sx, sz] of [[-1.4, 2.35], [1.6, 0.05]] as const) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.46, 10),
        new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.85 }));
      stool.position.set(sx, 0.23, sz);
      s.add(stool);
    }
    this.npc(r, { top: 0x6a4a9a, hair: 0x8a8a92, robe: true, cap: null, hairstyle: 'bald' }, -1.4, 2.35, 0, {
      label: 'chat with Scholar Imbry',
      handler: () => say('Scholar Imbry', 'Shh — I\'m mid-footnote. …Oh, very well. Did you know the Trial Caverns predate the university by six centuries? We built the school around the test, not the other way round. Now SHH.'),
    }, true, 0.48);
    this.npc(r, { top: 0x3a6e5a, hair: 0x6a3a1a, cap: null, hairstyle: 'buns' }, 1.6, 0.05, Math.PI, {
      label: 'chat with Scribe Onna',
      handler: () => say('Scribe Onna', 'I\'m copying the Reforging census before the original crumbles. Four hundred pages, two years, one hand. When I finish, I start the second volume. It\'s the happiest I\'ve ever been.'),
    }, true, 0.48);

    // the apprentice asleep over chapter twelve, at a corner desk
    {
      const desk = new THREE.Group();
      const dt2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.9),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.6 }));
      dt2.position.y = 0.82;
      for (const [lx, lz] of [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]] as const) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), sideMat);
        leg.position.set(lx, 0.41, lz);
        desk.add(leg);
      }
      const openBook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.36),
        new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }));
      openBook.position.set(0, 0.89, 0.05);
      desk.add(dt2, openBook);
      this.prop(r, desk, -8.6, 4.6, 1.0);
      const fenStool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.46, 10),
        new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 1), roughness: 0.85 }));
      fenStool.position.set(-8.6, 0.23, 5.6);
      s.add(fenStool);
      this.npc(r, { top: 0xc4763a, hair: 0x2a2a3a, cap: null, hairstyle: 'curly' }, -8.6, 5.6, 0, {
        label: 'wake the sleeping apprentice (rude)',
        handler: async () => {
          await say('', 'The apprentice is face-down on "A Complete History of the Compact, Vol. III", breathing the slow breath of the truly defeated. A bubble of drool threatens page 212.');
          await say('Apprentice Fen', '…mmh. five more minutes, Archivist. the compact can keep till morning…');
        },
      }, true, 0.46);
    }

    // students whispering in the west aisle
    {
      const wa: [number, number] = [-8.2, -0.6], wb: [number, number] = [-7.2, 0.4];
      this.npc(r, { top: 0x5ad8e8, hair: 0x1a1a2e, cap: null, hairstyle: 'spiky' }, wa[0], wa[1],
        Math.atan2(wb[0] - wa[0], wb[1] - wa[1]), undefined);
      this.npc(r, { top: 0xe85a8a, hair: 0x6a3a1a, cap: null, hairstyle: 'long' }, wb[0], wb[1],
        Math.atan2(wa[0] - wb[0], wa[1] - wb[1]), undefined);
      r.interactables.push({
        pos: new THREE.Vector3(-7.7, 0, -0.1), radius: 1.7,
        label: 'Press <b>E</b> — eavesdrop shamelessly',
        handler: async () => {
          const bits: [string, string][][] = [
            [['Student Tam', '…so the restricted rope. Is it to keep us out, or the books in?'],
             ['Student Ree', 'Wren says "yes".']],
            [['Student Ree', 'I checked the globe at midnight once. It was turning FASTER.'],
             ['Student Tam', 'It was not.'],
             ['Student Ree', 'It knows things, Tam.']],
            [['Student Tam', 'Quiz me again. Five Houses, five verbs.'],
             ['Student Ree', 'Runs toward, waits beside, grows beneath, stands before…'],
             ['Student Tam', '…walks behind. We\'re going to pass. We\'re actually going to pass.']],
          ];
          await conversation(bits[Math.floor(Math.random() * bits.length)]);
        },
      });
    }

    // candle sconces breathing light along the aisles
    for (const [cx, cz] of [[-5.4, -1.0], [5.4, -1.0], [-10.6, 0.5], [10.6, 2.8]] as const) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8e0c8 }));
      candle.position.set(cx, 2.5, cz);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6),
        new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9a3a, emissiveIntensity: 1.5 }));
      flame.position.set(cx, 2.72, cz);
      flame.name = 'flame';
      s.add(candle, flame);
    }

    // Archivist Wren at her lectern, the Ledger's empty glass case beside her
    {
      const lectern = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.15, 8), sideMat);
      post.position.y = 0.57;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.5),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.6 }));
      top.position.y = 1.18;
      top.rotation.x = -0.35;
      lectern.add(post, top);
      this.prop(r, lectern, 3.2, -4.6, 0.6);
      const caseG = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x9ad4f2, transparent: true, opacity: 0.35, roughness: 0.1 }));
      caseG.position.set(4.6, 1.05, -4.8);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.7),
        new THREE.MeshStandardMaterial({ map: stoneTexture('#7a7388', '#494258', 1), roughness: 0.8 }));
      plinth.position.set(4.6, 0.4, -4.8);
      s.add(caseG, plinth);
      r.colliders.push({ pos: new THREE.Vector3(4.6, 0, -4.8), r: 0.8 });
    }
    tagNpc(this.npc(r, { top: 0x5a3a9a, hair: 0xc8c8d0, robe: true, cap: null }, 3.2, -5.4, Math.PI, undefined), 'Archivist Wren');
    r.interactables.push({
      pos: new THREE.Vector3(3.2, 0, -4.2), radius: 1.8,
      label: 'Press <b>E</b> — talk to Archivist Wren',
      handler: () => this.questTalk('side_ledger', 'Archivist Wren', {
        offer: [
          ['Archivist Wren', 'Shhh. Thank you. Now — you may speak, quietly. You look like you have working legs and a conscience. I need both.'],
          ['Archivist Wren', 'My Expedition Ledger — two hundred and twelve years of survey notes, irreplaceable, hand-indexed BY ME — was checked out by a student "for lunch reading".'],
          ['Archivist Wren', 'LUNCH. READING. It is somewhere in that cafeteria, absorbing gravy. Bring it home and the Archive will be generous.'],
        ],
        accepted: 'The cafeteria. Red binding, brass corners, my initial on the bookplate. If anything is pressed between the pages, do not tell me what.',
        ready: [
          ['Archivist Wren', 'Oh — oh, there she is. Come here, you wonderful, gravy-soaked disaster.'],
          ['Archivist Wren', '…There is a sandwich in chapter forty. I said don\'t tell me. I\'m telling myself. The Archive thanks you, tamer; take this, and may your boots always find dry ground.'],
        ],
        done: 'The Ledger is back under glass, with a new rule plaque: "NOT LUNCH READING." It\'s working so far.',
      }),
    });

    // ---- Historian Veyl — the man who maps storms (the Chronicle, ch. II–IV) ----
    {
      // his chart table: a mess of storm-tracks, calipers and one lit candle
      const chartTable = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.2),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.6 }));
      top.position.y = 0.9;
      for (const [lx, lz] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), sideMat);
        leg.position.set(lx, 0.45, lz);
        chartTable.add(leg);
      }
      for (let i = 0; i < 4; i++) {
        const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45),
          new THREE.MeshStandardMaterial({ color: [0xe8dcc0, 0xd8ccb0, 0xe0d4b8, 0xc8bca0][i], roughness: 1, side: THREE.DoubleSide }));
        chart.rotation.x = -Math.PI / 2;
        chart.rotation.z = (i - 1.5) * 0.4;
        chart.position.set(-0.6 + i * 0.4, 0.96 + i * 0.005, (i % 2) * 0.3 - 0.15);
        chartTable.add(chart);
      }
      chartTable.add(top);
      // Veyl works under the gallery's west end, storm-charts spread wide
      this.prop(r, chartTable, -8.4, -4.2, 1.3);

      tagNpc(this.npc(r, { top: 0x4a6a9a, hair: 0x8a8a92, robe: true, cap: null, hairstyle: 'classic' }, -8.4, -5.6, 0, undefined), 'Historian Veyl');
      r.interactables.push({
        pos: new THREE.Vector3(-8.4, 0, -4.9), radius: 2.0,
        label: 'Press <b>E</b> — talk to Historian Veyl',
        handler: () => this.historianTalk(),
      });
    }

    // three lore lecterns
    const LORE_BOOKS: [string, string][] = [
      ['"The Reforging — A Child\'s History"', '“When the old empire fell, its tame Guardians went wild and its wild engines stayed obedient. The survivors built Haven City between two truths: that power outlives its masters, and that kindness must be rebuilt every generation.”'],
      ['"On the Five Houses", 3rd ed.', '“Pyrelight runs toward. Mistveil waits beside. Thornward grows beneath. Stormcall stands before. Duskwatch walks behind. Choose the verb you wish your life to be — the House follows from it.”'],
      ['"Notes on the Deep Ruins" — RESTRICTED', '“The Vault warden Gravemaw was once the imperial treasury\'s gentlest porter. The Stormspire engine Voltigarch was decorated nine times for protecting its garrison. Remember, expeditioner: we do not fight monsters. We fight orders that no one living gave.”'],
    ];
    LORE_BOOKS.forEach(([title, text], i) => {
      const lectern = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.1, 8), sideMat);
      post.position.y = 0.55;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.45),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.6 }));
      top.position.y = 1.12;
      top.rotation.x = -0.4;
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.34),
        new THREE.MeshStandardMaterial({ color: [0xa8453a, 0x3a6ea8, 0x4a8a4a][i], roughness: 0.6 }));
      book.position.y = 1.18;
      book.rotation.x = -0.4;
      lectern.add(post, top, book);
      const x = 3.6 + i * 2.0, z = 5.8; // the lore nook, beside the old globe
      this.prop(r, lectern, x, z, 0.5);
      r.interactables.push({
        pos: new THREE.Vector3(x, 0, z), radius: 1.3,
        label: `Press <b>E</b> — read ${title}`,
        handler: () => say(title, text),
      });
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  // ================= LOCKER ROOM =================
  private buildLockers(): void {
    const r = this.newRoom('lockers', 16, 12);
    const s = r.scene;
    s.background = skyGradient('#222632', '#0e1016');
    s.add(new THREE.AmbientLight(0xd8e0f0, 0.6));
    const main = new THREE.PointLight(0xe8f0ff, 20, 18);
    main.position.set(0, 3.8, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: tileTexture('#9aa0ae', '#6a7080', 7), roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.shell(r, wallpaperTexture('#4a5060', '#3a3e48', '#8a90a0', 4), 0x2c3038, 4.2);

    // locker banks
    const lockerBank = (x: number, z: number, rotY: number, count = 6) => {
      const bank = new THREE.Group();
      for (let i = 0; i < count; i++) {
        const lx = (i - (count - 1) / 2) * 0.72;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 2.2, 0.6),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4a6a8a : 0x44607e, metalness: 0.55, roughness: 0.4 }));
        body.position.set(lx, 1.1, 0);
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x2a3a4a }));
        vent.position.set(lx, 1.8, 0.31);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xc8ccd8, metalness: 0.8, roughness: 0.3 }));
        handle.position.set(lx + 0.22, 1.1, 0.31);
        bank.add(body, vent, handle);
      }
      bank.rotation.y = rotY;
      this.prop(r, bank, x, z, 0);
      const steps = count;
      for (let i = 0; i < steps; i++) {
        const t = (i - (steps - 1) / 2) * 0.72;
        r.colliders.push({ pos: new THREE.Vector3(x + Math.cos(rotY) * t, 0, z - Math.sin(rotY) * t), r: 0.55 });
      }
    };
    lockerBank(-3.5, -r.d / 2 + 0.7, 0, 8);
    lockerBank(4.5, -r.d / 2 + 0.7, 0, 5);
    lockerBank(-r.w / 2 + 0.7, 0.5, Math.PI / 2, 7);
    lockerBank(r.w / 2 - 0.7, 0.5, -Math.PI / 2, 7);

    // one locker hangs open with gear spilling out
    const openLocker = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x4a6a8a, metalness: 0.5, roughness: 0.4 }));
    openLocker.position.set(1.1, 1.1, -r.d / 2 + 1.3);
    openLocker.rotation.y = 0.9;
    const spill = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.95 }));
    spill.position.set(1.3, 0.2, -r.d / 2 + 1.5);
    s.add(openLocker, spill);

    // central benches
    for (const z of [0.5, 3.2]) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 0.55),
        new THREE.MeshStandardMaterial({ map: plankTexture('#7a5a36', 2), roughness: 0.8 }));
      seat.position.y = 0.48;
      for (const lx of [-1.9, 1.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a3a44 }));
        leg.position.set(lx, 0.24, 0);
        bench.add(leg);
      }
      bench.add(seat);
      this.prop(r, bench, 0, z, 0);
      for (const cx of [-1.5, 0, 1.5]) r.colliders.push({ pos: new THREE.Vector3(cx, 0, z), r: 0.6 });
    }

    // the brass wrench under the far bench (side_wrench objective)
    const wrench = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 }));
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 6, 12, Math.PI * 1.4),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 }));
    jaw.position.x = 0.24;
    wrench.add(handle, jaw);
    wrench.position.set(1.6, 0.12, 3.4);
    wrench.rotation.y = 0.7;
    s.add(wrench);
    r.interactables.push({
      pos: new THREE.Vector3(1.6, 0, 3.4), radius: 1.3,
      label: 'Press <b>E</b> — something glints under the bench…',
      handler: async () => {
        const p = this.player;
        if (p.flags['found_wrench']) { await say('', 'Just dust bunnies under here now. Remarkably organized dust bunnies.'); return; }
        if (questState(p, 'side_wrench') !== 'active') {
          await say('', 'A brass wrench with worn engraving: "T. — for the hairpin. K.V." It looks loved. Someone is surely missing this.');
          return;
        }
        p.flags['found_wrench'] = true;
        p.save();
        wrench.visible = false;
        toast('Found Old Tomas\'s brass wrench!', 'gold');
        await say('', 'You fish out the brass wrench. The engraving reads: "T. — for the hairpin. K.V." …K.V. — Kessa Voltaine?! Old Tomas wasn\'t exaggerating.');
      },
    });

    // a student rummaging
    this.npc(r, { top: 0xc4763a, hair: 0x6a4a2a, cap: null }, -4, 2.5, -Math.PI / 2, {
      label: 'talk to the rummaging student',
      handler: () => say('Student Harl', 'Lost: one left boot, one lucky pebble, one entire Guardian feed bag. Found: someone else\'s left boot. The locker room giveth and the locker room taketh away.'),
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  // ================= TRAINING HALL =================
  /**
   * Half dojo, half laboratory. The old sparring ring got an energy fence,
   * the dummies got hovering target drones, and the east wall is now the
   * Simulation Bay — a projector dais that conjures practice opponents out
   * of light. Coach Hurst pretends to distrust all of it, and checks his
   * drill stats on the big board when he thinks nobody's watching.
   */
  private buildTraining(): void {
    const r = this.newRoom('training', 20, 14);
    const s = r.scene;
    s.background = skyGradient('#2c1e1a', '#120c0a');
    s.add(new THREE.AmbientLight(0xffe0d0, 0.55));
    const main = new THREE.PointLight(0xffd9a0, 28, 24);
    main.position.set(0, 4.6, 0);
    main.castShadow = true;
    s.add(main);
    const bayLight = new THREE.PointLight(0x5ad8e8, 10, 10);
    bayLight.position.set(7, 3.2, 4.2);
    s.add(bayLight);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: plankTexture('#9a7a4e', 6), roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.shell(r, wallpaperTexture('#5e3e34', '#3a2c1e', '#c89a6a', 4), 0x3a2820, 5);

    // sparring ring — now fenced by a humming energy rope
    const ring = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#7a3a30', '#e8d8b8', 1), roughness: 1 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-3, 0.015, -1);
    s.add(ring);
    const ringRope = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.05, 6, 36),
      new THREE.MeshStandardMaterial({
        color: 0x5ad8e8, emissive: 0x3ab8d8, emissiveIntensity: 0.9, roughness: 0.3,
      }));
    ringRope.name = 'wisp';
    ringRope.userData.ph = 0;
    ringRope.rotation.x = Math.PI / 2;
    ringRope.position.set(-3, 0.55, -1);
    s.add(ringRope);
    // four emitter pylons keep the rope alive
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = -3 + Math.cos(a) * 3.6, pz = -1 + Math.sin(a) * 3.6;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.62, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a5060, metalness: 0.7, roughness: 0.35 }));
      pylon.position.set(px, 0.31, pz);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x5ad8e8, emissive: 0x5ad8e8, emissiveIntensity: 1.2 }));
      tip.position.set(px, 0.62, pz);
      tip.name = 'wisp';
      tip.userData.ph = i * 1.6;
      s.add(pylon, tip);
    }

    // ---- the drill board: today's standings in honest lamplight ----
    {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 256;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#0c1620';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#2a4a5a'; ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 500, 244);
      ctx.fillStyle = '#5ad8e8';
      ctx.font = 'bold 34px Trebuchet MS';
      ctx.fillText('⚡ TRAINING HALL — DRILL BOARD', 22, 46);
      ctx.font = '24px Trebuchet MS';
      const rows: [string, string][] = [
        ['1. Kade & Cinder', '21–1'],
        ['2. Sgt. Mira\'s squad', '17–4'],
        ['3. "The Footwork Five"', '12–9'],
        ['4. Apprentice Fen', 'asleep'],
      ];
      rows.forEach(([nm, sc], i) => {
        ctx.fillStyle = i === 0 ? '#f2c14e' : '#bcd8e8';
        ctx.fillText(nm, 28, 96 + i * 38);
        ctx.fillText(sc, 400, 96 + i * 38);
      });
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8),
        new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.4 }));
      board.position.set(-3, 3.1, -r.d / 2 + 0.45);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.1, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x2a303c, metalness: 0.6, roughness: 0.4 }));
      frame.position.set(-3, 3.1, -r.d / 2 + 0.38);
      s.add(frame, board);
      r.interactables.push({
        pos: new THREE.Vector3(-3, 0, -r.d / 2 + 1.4), radius: 1.8,
        label: 'Press <b>E</b> — read the drill board',
        handler: () => say('', 'Twenty-one and one. Kade has drawn a small, dignified crown over the "21" and a very large, undignified circle around the "1". Underneath, in Coach Hurst\'s block capitals: "RIVALS MAKE LEGENDS. RE-MATCH FRIDAY."'),
      });
    }

    // ---- the Simulation Bay: a projector dais conjuring sparring partners ----
    {
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.75, roughness: 0.3 }));
      dais.position.set(7, 0.11, 4.2);
      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.05, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x5ad8e8, emissive: 0x5ad8e8, emissiveIntensity: 1.1 }));
      glowRing.rotation.x = Math.PI / 2;
      glowRing.position.set(7, 0.23, 4.2);
      glowRing.name = 'wisp';
      glowRing.userData.ph = 2.1;
      s.add(dais, glowRing);
      r.colliders.push({ pos: new THREE.Vector3(7, 0, 4.2), r: 2.1 });
      // the hologram: a practice guardian sketched in light
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0x6ae8f2, emissive: 0x4ad8e8, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.45, roughness: 0.2, depthWrite: false,
      });
      const holo = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), holoMat);
      body.scale.set(1.25, 0.9, 1);
      body.position.y = 1.0;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), holoMat);
      head.position.set(0.6, 1.45, 0);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 8), holoMat);
      tail.rotation.z = Math.PI / 2.2;
      tail.position.set(-0.75, 1.15, 0);
      holo.add(body, head, tail);
      holo.position.set(7, 0.25, 4.2);
      holo.name = 'holo';
      s.add(holo);
      // projector emitters around the rim
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const em = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6),
          new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.3 }));
        em.position.set(7 + Math.cos(a) * 1.55, 0.32, 4.2 + Math.sin(a) * 1.55);
        s.add(em);
      }
      // the console
      const console3 = new THREE.Group();
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x2a303c, metalness: 0.7, roughness: 0.35 }));
      pedestal.position.y = 0.5;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x9af2e8, emissive: 0x4ad8c8, emissiveIntensity: 1.0 }));
      screen.position.set(0, 1.08, 0.06);
      screen.rotation.x = -0.5;
      console3.add(pedestal, screen);
      this.prop(r, console3, 4.6, 4.2, 0.55);
      r.interactables.push({
        pos: new THREE.Vector3(4.6, 0, 4.2), radius: 1.7,
        label: 'Press <b>E</b> — poke the simulator console',
        handler: async () => {
          const lines = [
            'SIMULATION READY: "Tidefin, Lv 5, mildly annoyed." You scroll the difficulty list. It goes from "mildly annoyed" to "Greggy". Nobody has ever selected "Greggy".',
            'The console hums: "DRILL 7 — type matchups. Blaze beats Verdant beats Tide beats Blaze. Umbra eats Volt. Gale rides above it all." The hologram strikes a pose with each line. It enjoys its work.',
            'ERROR LOG, last entry: "Simulation terminated — student attempted to befriend the hologram. Note from Coach Hurst: stop logging this as an error."',
          ];
          await say('Simulator', lines[Math.floor(Math.random() * lines.length)]);
        },
      });
    }

    // ---- hovering target drones above the dummy line ----
    for (const [dx2, dz2, ph] of [[5.5, -3.5, 0], [7, -1, 2.1], [5.5, 1.5, 4.2]] as const) {
      const drone = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xe8a23a, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 18),
        new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.3 }));
      halo.rotation.x = Math.PI / 2;
      drone.add(core, halo);
      drone.position.set(dx2 - 0.4, 2.6, dz2);
      drone.name = 'dronefloat';
      drone.userData.baseY = 2.6;
      drone.userData.ph = ph;
      s.add(drone);
    }

    // training dummies
    for (const [x, z] of [[5.5, -3.5], [7, -1], [5.5, 1.5]] as const) {
      const dummy = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8),
        new THREE.MeshStandardMaterial({ map: plankTexture('#6a4a2a', 1), roughness: 0.9 }));
      post.position.y = 0.75;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10),
        new THREE.MeshStandardMaterial({ color: 0xb89058, roughness: 1 }));
      body.position.y = 1.35;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xc8a868, roughness: 1 }));
      head.position.y = 1.95;
      // straw pokes
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
      band.rotation.x = Math.PI / 2;
      band.position.y = 1.35;
      dummy.add(post, body, head, band);
      this.prop(r, dummy, x, z, 0.6);
    }
    r.interactables.push({
      pos: new THREE.Vector3(6, 0, -1), radius: 1.8,
      label: 'Press <b>E</b> — whack a training dummy',
      handler: async () => {
        toast('Thwack! The dummy judges you silently.', '');
        await say('', 'You give the dummy a few solid hits. It wobbles philosophically. Coach Hurst nods approvingly from across the hall: "Footwork! FOOTWORK!"');
      },
    });

    // weight rack & water barrel set dressing
    const rack = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8e9a, metalness: 0.8, roughness: 0.3 }));
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.9;
    for (const side of [-0.8, 0.8]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14),
        new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.6, roughness: 0.4 }));
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side, 0.9, 0);
      rack.add(plate);
    }
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 }));
    stand.position.y = 0.42;
    rack.add(bar, stand);
    this.prop(r, rack, -7.5, 3.5, 1.1);

    // Coach Hurst
    this.npc(r, { top: 0xb04a3a, hair: 0x2a2a3a, cap: 0xb04a3a }, 3, 3.5, -Math.PI / 4, {
      label: 'talk to Coach Hurst',
      handler: async () => {
        const tips = [
          'Guarding isn\'t cowardice — it halves the hit AND refills your SP. Tide tamers built whole careers on it.',
          'Speed decides who moves first. One Opal Gem on a slow Guardian changes its whole life. Like me and my morning runs. I assume.',
          'Your basic strike builds SP every time it lands. Open with strikes, close with the big art. Rhythm! RHYTHM!',
          'Evolution boosts every stat permanently. Feed those EXP bars, graduate — no shortcuts, just reps.',
        ];
        await say('Coach Hurst', tips[Math.floor(Math.random() * tips.length)]);
      },
    });

    // Rival Kade by the sparring ring
    this.npc(r, { top: 0x2a2a3a, hair: 0xd8b46a, bottom: 0x23262e, cap: null }, -3, 1.6, 0, {
      label: 'challenge Rival Kade',
      handler: () => this.rivalKade(),
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  private async rivalKade(): Promise<void> {
    const p = this.player;
    const st = questState(p, 'side_spar');
    if (st === 'done') {
      await conversation([
        ['Rival Kade', 'There they are. The one blemish on my record. You know what\'s funny? I sleep BETTER now. Turns out being undefeated was exhausting.'],
        ['Rival Kade', 'Next time we meet, it\'ll be out in the deep ruins. Train hard, rival. I\'m not staying beaten.'],
      ]);
      return;
    }
    if (!p.houseId || p.party.length === 0) {
      await conversation([
        ['Rival Kade', 'Well, well — the famous Trial Caverns graduate. I\'d offer you a spar, but you don\'t even have a Guardian of your own yet.'],
        ['Rival Kade', 'Go pledge to a House at the Officers\' Hall first. Then come back, and we\'ll see if the hype is real. I\'m undefeated, by the way. Did I mention? I mention it a lot.'],
      ]);
      return;
    }
    if (st === 'available') {
      await conversation([
        ['Rival Kade', 'So the rumor has a face. Kade. Top graduate, last year. Undefeated in this hall — twenty-one spars, twenty-one apologies accepted.'],
        ['Rival Kade', 'House rules: one Guardian each, no items, loser buys honey rolls. My partner Cinder doesn\'t go easy, and neither do I.'],
      ]);
      const pick = await choose('Rival Kade', 'Twenty-two sound like a nice number to you?', ['Bring it on, Kade!', 'Not today']);
      if (pick !== 0) { await say('Rival Kade', 'Smart. The smart ones always come back, though. I\'ll be here.'); return; }
      acceptQuest(p, 'side_spar');
      toast('Side quest started: Schoolyard Legend', 'gold');
      p.save();
    } else {
      const pick = await choose('Rival Kade', 'Ready for the rematch, rival?', ['Let\'s spar!', 'Still warming up']);
      if (pick !== 0) return;
    }

    this.busy = true;
    const result = await this.ctx.runBattle(
      [{ speciesId: 'pyrofang', level: 7 }],
      { intro: 'Kade sends out Cinder! "Twenty-two, here we come!"', theme: 'cavern' });
    this.busy = false;
    if (result === 'win') {
      p.flags['spar_won'] = true;
      p.save();
      await conversation([
        ['Rival Kade', '…Twenty-one and one.'],
        ['Rival Kade', 'TWENTY-ONE AND ONE! Do you know what you\'ve— okay. Okay. Cinder, we\'re fine. We\'re FINE.'],
        ['Rival Kade', '…That was the best spar I\'ve had in a year. Honey rolls are on me — and take this. You earned it, rival. Say it back. Rival. We\'re rivals now, it\'s official.'],
      ]);
      const summary = completeQuest(p, 'side_spar');
      toast('Quest complete: Schoolyard Legend!', 'gold');
      if (summary) toast(`Received ${summary}`, 'gold');
      updateHUD(p, 'Leodones University');
    } else {
      p.healAll();
      await say('Rival Kade', 'Twenty-two! WOO! …Hey, no shame — Cinder and I drill every morning. Your team\'s patched up, on the house. Come back stronger; legends need good rivals.');
    }
  }

  // ================= INFIRMARY =================
  private buildInfirmary(): void {
    const r = this.newRoom('infirmary', 14, 11);
    const s = r.scene;
    s.background = skyGradient('#1e2e2a', '#0a1410');
    s.add(new THREE.AmbientLight(0xe0fff0, 0.7));
    const main = new THREE.PointLight(0xeafff2, 20, 18);
    main.position.set(0, 3.8, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: tileTexture('#d8e0dc', '#a8b8b0', 6), roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.shell(r, wallpaperTexture('#4a7a6a', '#e8eee8', '#8ab8a8', 4), 0xd8e0dc, 4);

    // cots
    for (const [x, z] of [[-4.5, -2.8], [-4.5, 0.4], [-4.5, 3.6]] as const) {
      const cot = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 2.3),
        new THREE.MeshStandardMaterial({ color: 0x8a8e9a, metalness: 0.5, roughness: 0.4 }));
      frame.position.y = 0.3;
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.95 }));
      mattress.position.y = 0.58;
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.07, 0.08, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x5ad88a, roughness: 0.95 }));
      blanket.position.set(0, 0.68, 0.4);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
      pillow.position.set(0, 0.7, -0.8);
      cot.add(frame, mattress, blanket, pillow);
      this.prop(r, cot, x, z, 1.2);
    }
    // a snoozing Guardian on the middle cot
    const patient = makeGuardian('pebblit');
    patient.group.position.set(-4.5, 0.65, 0.4);
    patient.group.rotation.y = Math.PI / 2;
    patient.group.scale.setScalar(0.8);
    r.scene.add(patient.group);
    r.rigs.push(patient);
    r.interactables.push({
      pos: new THREE.Vector3(-3.5, 0, 0.4), radius: 1.4,
      label: 'Press <b>E</b> — peek at the patient',
      handler: () => say('', 'A young Pebblit snores on the cot, one leg bandaged and a half-eaten Sweet Berry by its pillow. A get-well card reads: "Sorry about the stairs — Harl."'),
    });

    // herb shelf & cabinet
    const cab = new THREE.Group();
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xe8eee8, roughness: 0.7 }));
    cabBody.position.y = 1.1;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.5 }));
    cross.position.set(0, 1.9, 0.33);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x5ad88a, emissive: 0x2a8a4a, emissiveIntensity: 0.5 }));
    cross2.position.set(0, 1.9, 0.33);
    cab.add(cabBody, cross, cross2);
    this.prop(r, cab, 4.5, -r.d / 2 + 0.9, 1.4);

    // Nurse Imelda
    this.npc(r, { top: 0xe8eee8, hair: 0x6a3a1a, cap: 0x5ad88a }, 2, -1.5, Math.PI / 6, {
      label: 'see Nurse Imelda',
      handler: async () => {
        await conversation([
          ['Nurse Imelda', 'Sit, sit — let me look at the whole family. Tsk. Bruises, scuffs, and somebody\'s been skipping meals, haven\'t they?'],
          ['Nurse Imelda', 'There we are. Good as new, every one of them — and the Crawler battery\'s topped up too. No charge, ever. Chancellor\'s rule.'],
        ]);
        this.player.healAll();
        this.player.save();
        toast('Party fully healed. Crawler restocked.', 'gold');
        updateHUD(this.player, 'Leodones University');
      },
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  // ================= OFFICERS' HALL =================
  private buildOfficers(): void {
    const r = this.newRoom('officers', 26, 16, { camHeight: 6.6, camDist: 7.6 });
    const s = r.scene;
    s.background = skyGradient('#2a2438', '#0e0a16');
    s.add(new THREE.AmbientLight(0xfff2dc, 0.5));
    const main = new THREE.PointLight(0xffe8c0, 32, 26);
    main.position.set(0, 5, 0);
    main.castShadow = true;
    s.add(main);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 1, r.d + 1),
      new THREE.MeshStandardMaterial({ map: marbleTexture('#b8b2c8', '#827a98', 8), roughness: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const centerpiece = new THREE.Mesh(new THREE.CircleGeometry(3, 32),
      new THREE.MeshStandardMaterial({ map: carpetTexture('#3a3050', '#c8b282', 1), roughness: 1 }));
    centerpiece.rotation.x = -Math.PI / 2;
    centerpiece.position.y = 0.012;
    s.add(centerpiece);
    this.shell(r, wallpaperTexture('#463e5e', '#3a2c1e', '#c8b282', 5), 0x322a44, 6);

    // round conference table in the middle
    const confTable = new THREE.Group();
    const ct = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.14, 20),
      new THREE.MeshStandardMaterial({ map: plankTexture('#4a3320', 2), roughness: 0.5 }));
    ct.position.y = 0.95;
    const cleg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.8 }));
    cleg.position.y = 0.47;
    // map spread on the table
    const map = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20),
      new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 1 }));
    map.rotation.x = -Math.PI / 2;
    map.position.y = 1.03;
    confTable.add(ct, cleg, map);
    this.prop(r, confTable, 0, -1, 2.1);
    r.interactables.push({
      pos: new THREE.Vector3(0, 0, 1.4), radius: 1.6,
      label: 'Press <b>E</b> — study the strategy table',
      handler: () => say('', 'A map of Aurel, heavy with pins. The Sunken Vault is circled twice in blue ink. The Stormspire has seven pins, a coffee stain, and one word underlined three times: "COUNTING?"'),
    });

    // five guild stations in an arc along the north wall
    HOUSES.slice(0, 5).forEach((h, i) => {
      const lore = GUILD_LORE[h.id];
      const x = (i - 2) * 4.8;
      const z = -r.d / 2 + 2.4;
      const col = parseInt(h.color.slice(1), 16);

      // banner + glowing icon
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 4),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.92, side: THREE.DoubleSide }));
      cloth.position.set(x, 3.6, -r.d / 2 + 0.45);
      const iconTex = new THREE.CanvasTexture(guildIconCanvas(h.id, 256));
      iconTex.colorSpace = THREE.SRGBColorSpace;
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshStandardMaterial({ map: iconTex, transparent: true, emissive: col, emissiveIntensity: 0.18, roughness: 0.8 }));
      icon.position.set(x, 3.9, -r.d / 2 + 0.48);
      s.add(cloth, icon);

      // desk
      const station = new THREE.Group();
      const dTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1),
        new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 0.6 }));
      dTop.position.y = 1;
      const dBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 0.85),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
      dBody.position.y = 0.48;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 }));
      lamp.position.set(-0.9, 1.25, 0);
      const lampLight = new THREE.PointLight(col, 5, 5);
      lampLight.position.set(-0.9, 1.4, 0.3);
      station.add(dTop, dBody, lamp, lampLight);
      this.prop(r, station, x, z, 1.5);

      // officer behind the desk
      const palettes: Record<string, VoxelHumanOpts> = {
        pyrelight: { top: 0xb03a22, hair: 0x55301a, cap: null },
        mistveil: { top: 0x2a6dc4, hair: 0xd8d8e8, cap: null },
        thornward: { top: 0x3a7a2e, hair: 0x6a4a2a, cap: null },
        stormcall: { top: 0xb09a22, hair: 0x2a2a3a, cap: 0xb09a22 },
        duskwatch: { top: 0x5a3a9a, hair: 0x1a1a26, cap: null },
      };
      tagNpc(this.npc(r, palettes[h.id], x, z - 1.2, 0, undefined), lore.officer);
      r.interactables.push({
        pos: new THREE.Vector3(x, 0, z + 1.2), radius: 1.7,
        label: `Press <b>E</b> — ${lore.officer} of ${h.name}`,
        handler: () => this.talkToOfficer(h),
      });
    });

    this.door(r, 's', 0, '🚪 Back to the Lobby', '#f2c14e', () => this.enterRoom('lobby'));
  }

  private async talkToOfficer(h: HouseDef): Promise<void> {
    const p = this.player;
    const lore = GUILD_LORE[h.id];
    const starter = SPECIES[h.starter];

    if (p.houseId === h.id) {
      const next = mainChain(h.id).find(q => p.quests[q.id] !== 'done');
      await conversation([
        [lore.officer, `${p.tamerName}! ${lore.epithet} stands taller with you in it. How is your ${SPECIES[h.starter].name} growing?`],
        [lore.officer, next
          ? `Your current orders from the master: "${next.title}" — ${next.objective}. ${next.location} is where your road leads. Check your Quest Journal (J) any time.`
          : 'You\'ve completed every order the house has on the books. The masters are already arguing about what to do with someone like you. It\'s a good argument.'],
      ]);
      return;
    }
    if (p.houseId) {
      await say(lore.officer, `${HOUSES.find(x => x.id === p.houseId)!.name} colors suit you, tamer. Oaths are oaths — but our table is your table whenever you visit. That\'s the University way.`);
      return;
    }

    // the recruitment pitch — rich and house-specific
    await conversation([
      [lore.officer, `Graduate! Come, come. ${lore.officer}, recruiting officer of ${h.name} — ${lore.epithet}.`],
      [lore.officer, lore.history[0]],
    ]);
    while (true) {
      const pick = await choose(lore.officer, 'What would you like to know?', [
        `Tell me more of your history`,
        `What is your creed?`,
        `What Guardian would I receive?`,
        `What is the ${lore.cardName}?`,
        `I'm ready to decide`,
      ]);
      if (pick === 0) await say(lore.officer, lore.history[1]);
      else if (pick === 1) await say(lore.officer, `"${h.motto}" — ${lore.creedLong}`);
      else if (pick === 2) await say(lore.officer, `A newborn ${starter.name}, hatched in ${lore.hall} itself. ${starter.desc} Raise it well and it will become something this world hasn't seen in an age.`);
      else if (pick === 3) await say(lore.officer, `Every member carries one — bound to ${lore.effigyName}. ${lore.effigyDesc} Your deeds are written into it: quests, conquests, rank. From Spark to legend, the card remembers everything.`);
      else break;
    }
    const joined = await guildJoinCeremony(p, h, lore.officer);
    if (joined) updateHUD(p, 'Leodones University');
  }

  // ================= notice board =================
  private openNoticeBoard(): void {
    this.busy = true;
    const p = this.player;
    const NOTES: [string, string, string][] = [
      ['side_chef', '🍓 "BERRIES NEEDED — YESTERDAY"', 'Cafeteria. Ask for Chef Marlo. Do NOT mention the cold-box.'],
      ['side_wrench', '🔧 "REWARD: One (1) lifetime of gratitude"', 'My wrench. Locker Room. — Tomas'],
      ['side_quiz', '📐 "ARE YOU SMARTER THAN A GRADUATE?"', 'Standing prize: ◆300. Classroom, Prof. Lyra. 14 failures and counting.'],
      ['side_spar', '🥊 "OPEN CHALLENGE — ALL GRADUATES"', 'Training Hall. Beat me. You won\'t. — K.'],
      ['side_ledger', '📕 "MISSING: EXPEDITION LEDGER"', 'Red. Brass corners. Last seen near gravy. Library will reward. — W.'],
      ['side_niko', '✉️ (a small, folded note)', '"If anyone kind reads this… lobby, west corner. No rush. — N."'],
    ];
    const rows = NOTES.map(([qid, title, sub]) => {
      const st = questState(p, qid);
      const badge = st === 'done' ? '<span class="tag" style="background:var(--ui-green);color:#0c1022">DONE</span>'
        : st === 'ready' ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022">TURN IN</span>'
        : st === 'active' ? '<span class="tag" style="background:var(--ui-blue);color:#0c1022">ACTIVE</span>'
        : '<span class="tag" style="background:var(--ui-dim);color:#0c1022">NEW</span>';
      return `<div class="list-row"><div style="flex:1"><b>${title}</b><div class="sub">${sub}</div></div>${badge}</div>`;
    }).join('');
    const el = openScreen(`
      <h3>📌 University Notice Board</h3>
      <div class="sub" style="margin-bottom:8px">Pinned requests from staff and students. Track them in your Quest Journal (J).</div>
      ${rows}
      <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="ui-btn primary" id="nb-close">Close</button></div>`);
    (el.querySelector('#nb-close') as HTMLElement).onclick = () => { closeMenu(); this.busy = false; };
  }

  // ================= room transitions =================
  private builders: Record<RoomId, () => void> = {
    lobby: () => this.buildLobby(),
    cafeteria: () => this.buildCafeteria(),
    classroom: () => this.buildClassroom(),
    library: () => this.buildLibrary(),
    lockers: () => this.buildLockers(),
    training: () => this.buildTraining(),
    officers: () => this.buildOfficers(),
    infirmary: () => this.buildInfirmary(),
  };

  private lobbyReturnSpot: Partial<Record<RoomId, THREE.Vector3>> = {};

  private enterRoom(id: RoomId): void {
    const from = this.current;
    this.room.scene.remove(this.tamer);
    if (id === 'lobby' && from !== 'lobby') {
      // reappear by the door we used
      if (!this.rooms.has('lobby')) this.builders.lobby();
      const spot = this.lobbyReturnSpot[from];
      this.current = 'lobby';
      this.room.scene.add(this.tamer);
      if (spot) {
        this.tamer.position.copy(spot);
        this.tamer.rotation.y = Math.atan2(-spot.x, -spot.z);
      } else {
        this.tamer.position.set(0, 0, 10);
        this.tamer.rotation.y = Math.PI;
      }
    } else {
      if (from === 'lobby') {
        // remember where to come back to
        this.lobbyReturnSpot[id] = this.tamer.position.clone().setY(0);
      }
      if (!this.rooms.has(id)) this.builders[id]();
      this.current = id;
      const r = this.room;
      r.scene.add(this.tamer);
      this.tamer.position.copy(r.spawn);
      this.tamer.rotation.y = r.spawnRotY;
    }
    const r = this.room;
    this.camera.position.set(this.tamer.position.x, r.camHeight, this.tamer.position.z + r.camDist);
    toast(ROOM_TITLES[this.current], 'gold');
    updateHUD(this.player, 'Leodones University');
    this.player.savedLocation = { type: 'university', room: id };
  }

  private async leaveUniversity(): Promise<void> {
    const p = this.player;
    if (!p.houseId) {
      const pick = await choose('Doorwarden', 'Haven City lies beyond — but graduates usually pledge to a Grand House at the Officers\' Hall first. Leave anyway? (You can also pledge at the house halls in the city.)', ['Leave for Haven City', 'Stay a while longer']);
      if (pick !== 0) return;
    } else {
      const pick = await choose('Doorwarden', `Off to Haven City, ${p.tamerName}? The Aetherline Pod docks at the Skyport on the city's west plaza whenever you wish to ride back.`, ['Depart for Haven City', 'Stay a while longer']);
      if (pick !== 0) return;
    }
    p.flags['university_done'] = true;
    p.save();
    this.resolveExit?.();
  }

  // ================= per-frame =================
  private update(dt: number): void {
    if (!this.live) return;
    const r = this.room;
    // guidance: Officers' Hall until the player has pledged, then the way out
    if (this.officersBeacon && this.doorsBeacon) {
      this.officersBeacon.group.visible = !this.player.houseId;
      this.doorsBeacon.group.visible = !!this.player.houseId;
      this.officersBeacon.update(dt);
      this.doorsBeacon.update(dt);
    }
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
      const inBounds = (x: number, z: number) => Math.abs(x) <= r.w / 2 - 0.7 && Math.abs(z) <= r.d / 2 - 0.7;
      const free = (x: number, z: number) =>
        inBounds(x, z) &&
        !r.colliders.some(c => c.r > 0 && Math.hypot(x - c.pos.x, z - c.pos.z) < c.r) &&
        (this.current !== 'lobby' || !this.wanderers.some(w => Math.hypot(x - w.g.position.x, z - w.g.position.z) < 0.8));
      if (free(nx, nz)) this.tamer.position.set(nx, 0, nz);
      else if (free(nx, this.tamer.position.z)) this.tamer.position.x = nx;
      else if (free(this.tamer.position.x, nz)) this.tamer.position.z = nz;
      this.tamer.rotation.y = Math.atan2(dx, dz);
    }
    updateVoxelHuman(this.tamer, this.walking, dt);
    r.npcs.forEach(npc => updateVoxelHuman(npc, false, dt));

    // wandering lobby tamers
    if (this.current === 'lobby') {
      for (const w of this.wanderers) {
        if (w.pause > 0) {
          w.pause -= dt;
          updateVoxelHuman(w.g, false, dt);
          if (w.pause <= 0) {
            // pick a fresh destination in the open floor
            for (let tries = 0; tries < 10; tries++) {
              const tx = (Math.random() - 0.5) * (r.w - 8);
              const tz = (Math.random() - 0.5) * (r.d - 8);
              if (!r.colliders.some(c => c.r > 0 && Math.hypot(tx - c.pos.x, tz - c.pos.z) < c.r + 0.6)) {
                w.target.set(tx, 0, tz);
                break;
              }
            }
          }
          continue;
        }
        const to = w.target.clone().sub(w.g.position).setY(0);
        const dist = to.length();
        if (dist < 0.3) {
          w.pause = 2 + Math.random() * 5;
          updateVoxelHuman(w.g, false, dt);
          continue;
        }
        to.normalize();
        const nx = w.g.position.x + to.x * w.speed * dt;
        const nz = w.g.position.z + to.z * w.speed * dt;
        const blocked = r.colliders.some(c => c.r > 0 && Math.hypot(nx - c.pos.x, nz - c.pos.z) < c.r + 0.25)
          || Math.hypot(nx - this.tamer.position.x, nz - this.tamer.position.z) < 0.8;
        if (blocked) {
          w.pause = 0.6;             // wait politely, then re-route
          updateVoxelHuman(w.g, false, dt);
          continue;
        }
        w.g.position.set(nx, 0, nz);
        w.g.rotation.y = Math.atan2(to.x, to.z);
        updateVoxelHuman(w.g, true, dt);
      }
    }

    // camera follow — right-drag orbits, drifts home after 10 idle seconds
    const t = this.tamer.position;
    const camGoal = new THREE.Vector3(t.x * 0.7, r.camHeight, t.z + r.camDist);
    worldOrbit.update(dt);
    const lookT = new THREE.Vector3(t.x, 1.1, t.z);
    this.camera.position.lerp(worldOrbit.orbited(camGoal, lookT), Math.min(1, dt * 4));
    this.camera.lookAt(lookT);

    // ambient animation
    const now = performance.now();
    r.scene.traverse(o => {
      if (o.name === 'flame') o.scale.y = 1 + Math.sin(now * 0.008 + o.position.x * 3) * 0.18;
      if (o.name === 'steam') {
        o.position.y = 1.75 + Math.sin(now * 0.003 + o.position.x) * 0.08;
        (o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.opacity = 0.2 + Math.sin(now * 0.004 + o.position.x * 2) * 0.12;
      }
      if (o.name === 'spinglobe') o.rotation.y = now * 0.0004; // one slow scholarly revolution
      if (o.name === 'wisp') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) m.emissiveIntensity = 0.7 + Math.sin(now * 0.0022 + ((o.userData.ph as number) ?? 0)) * 0.4;
      }
      if (o.name === 'holo') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m) m.opacity = 0.4 + Math.sin(now * 0.0035 + o.position.x) * 0.12;
        o.rotation.y = now * 0.0012;
      }
      if (o.name === 'dronefloat') {
        o.position.y = (o.userData.baseY as number) + Math.sin(now * 0.0018 + ((o.userData.ph as number) ?? 0)) * 0.22;
        o.rotation.y = now * 0.002 + ((o.userData.ph as number) ?? 0);
      }
      if (o.name === 'scanline') {
        o.position.y = 0.6 + ((now * 0.0007 + ((o.userData.ph as number) ?? 0)) % 1) * 2.2;
      }
    });

    // ---- labeled room minimap ----
    const stripLabel = (label: string) =>
      label.replace(/Press <b>E<\/b>\s*—\s*/i, '').replace(/<[^>]+>/g, '').slice(0, 22);
    const mapMarkers: MapMarker[] = r.interactables
      .map(i => {
        const lbl = stripLabel(i.label);
        const door = !!i.isDoor;
        let highlight = false;
        const lower = lbl.toLowerCase();

        if (this.current === 'lobby') {
          if (!this.player.houseId) {
            if (lower.includes('officers')) highlight = true;
          } else if (!this.player.flags['university_done']) {
            if (lower.includes('exit') || lower.includes('grand doors')) highlight = true;
          } else if (questState(this.player, 'story_historian') === 'active') {
            if (lower.includes('library')) highlight = true;
          } else if (questState(this.player, 'story_amber') === 'active' && this.player.itemCount('storm_amber') >= 1) {
            if (lower.includes('library')) highlight = true;
          }
        } else if (this.current === 'officers') {
          if (!this.player.houseId) {
            if (lower.includes('officer')) highlight = true;
          } else {
            if (lower.includes('back to the lobby')) highlight = true;
          }
        } else if (this.current === 'library') {
          if (questState(this.player, 'story_historian') === 'active') {
            if (lower.includes('veyl')) highlight = true;
          } else if (questState(this.player, 'story_amber') === 'active' && this.player.itemCount('storm_amber') >= 1) {
            if (lower.includes('veyl')) highlight = true;
          } else {
            if (lower.includes('back to the lobby')) highlight = true;
          }
        } else {
          if (lower.includes('back to the lobby')) {
            // Highlights exit in other rooms if they finished or just need to return
            highlight = false;
          }
        }

        return {
          x: i.pos.x, z: i.pos.z, label: lbl,
          color: door ? '#e8d9a8' : '#5ab8e8',
          kind: door ? 'door' as const : 'poi' as const,
          highlight,
        };
      })
      .filter(m => m.kind === 'door' || m.highlight || (m.label && (
        m.label.toLowerCase().includes('niko') ||
        m.label.toLowerCase().includes('tomas') ||
        m.label.toLowerCase().includes('marlo') ||
        m.label.toLowerCase().includes('lyra') ||
        m.label.toLowerCase().includes('kade') ||
        m.label.toLowerCase().includes('wren') ||
        m.label.toLowerCase().includes('veyl')
      )));
    drawAreaMap(document.getElementById('minimap') as HTMLCanvasElement, {
      shape: 'rect', w: r.w, d: r.d,
      markers: mapMarkers,
      player: { x: t.x, z: t.z, rot: this.tamer.rotation.y },
      title: ROOM_TITLES[this.current] ?? 'Leodones University',
      playerState: this.player,
    });

    if (isDialogueOpen() || isMenuOpen() || this.busy) { showInteractHint(null); return; }
    const near = r.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
    showInteractHint(near ? near.label : null);
  }

  private openPanelGuarded(kind: PanelKind): void {
    this.busy = true;
    openPanel(kind, this.player, { canSave: true }).then(() => {
      updateHUD(this.player, 'Leodones University');
      this.busy = false;
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (isDialogueOpen() || isMenuOpen() || this.busy || isTutorialOpen()) return;
    if (k === 'e' || k === 'enter') {
      const near = this.room.interactables.find(i => this.tamer.position.distanceTo(i.pos) < i.radius);
      if (near) {
        const npc = this.room.npcs.find(n => n.position.distanceTo(near.pos) < 2.6);
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
        updateHUD(this.player, 'Leodones University');
        this.busy = false;
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  // ================= entry =================
  /** Resolves when the player departs through the Grand Doors. */
  async run(): Promise<void> {
    syncStoryQuests(this.player).forEach(n => toast(n, 'gold'));
    const startRoom = (this as any).initialRoom as RoomId || 'lobby';
    updateTamerAppearance(this.tamer, this.player.equippedClothes);
    
    if (startRoom !== 'lobby') {
      if (!this.rooms.has(startRoom)) this.builders[startRoom]();
      this.current = startRoom;
      const r = this.room;
      r.scene.add(this.tamer);
      this.tamer.position.copy(r.spawn);
      this.tamer.rotation.y = r.spawnRotY;
      this.camera.position.set(r.spawn.x, r.camHeight, r.spawn.z + r.camDist);
    } else {
      this.builders.lobby();
      this.current = 'lobby';
      this.room.scene.add(this.tamer);
      this.tamer.position.set(0, 0, 11.5);
      this.tamer.rotation.y = Math.PI;
      this.camera.position.set(0, 7.2, 20);
    }
    
    this.player.savedLocation = { type: 'university', room: this.current };
    this.live = true;   // the world is live now — update() drives the player through the intro and tutorial

    updateHUD(this.player, 'Leodones University');
    showHotkeys(true);
    // debug handle for automated testing
    (window as unknown as Record<string, unknown>).__uni = { uni: this, tamer: this.tamer };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    // click any soul in the halls to read their card
    const detachPicker = attachNpcPicker({
      camera: () => this.camera,
      roots: () => this.current === 'lobby'
        ? [...this.room.npcs, ...this.wanderers.map(wd => wd.g)]
        : this.room.npcs,
      blocked: () => isDialogueOpen() || isMenuOpen() || this.busy || isTutorialOpen(),
    });

    if (!this.revisit) {
      await conversation([
        ['???', '…and mind the step. Welcome through, graduate!'],
        ['Receptionist Dana', `Tamer ${this.player.tamerName}! The exam board sent word ahead — Ironhusk, defeated! You're the talk of the whole University.`],
        ['Receptionist Dana', 'This is the Leodones University of Aurel — every licensed tamer on the continent passed through this lobby once, just like you, usually with the same stunned expression.'],
        ['Receptionist Dana', 'The five Grand Houses keep recruiting officers in the Officers\' Hall, through the great north door. Pledge to one and you\'ll receive your first true partner — and your guild Sigil.'],
        ['Receptionist Dana', 'Do explore! Cafeteria, Training Hall and Infirmary east; Classroom, Library and Locker Room west. Folk here always need a hand — check the notice board by my desk. When you\'re ready for the wide world, the Grand Doors south lead to Haven City.'],
      ]);
      this.player.save();
    }

    // Field Manual I — Hale's mandatory graduate orientation (runs once, ever)
    await runBasicsTutorial(this.player, () => ({ x: this.tamer.position.x, z: this.tamer.position.z }));

    return new Promise<void>(res => {
      this.resolveExit = () => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        detachPicker();
        showInteractHint(null);
        showHotkeys(false);
        hideAreaMap(document.getElementById('minimap') as HTMLCanvasElement);
        this.rooms.forEach(rd => rd.rigs.forEach(disposeRig));
        this.live = false;
        this.resolveExit = null;
        res();
      };
    });
  }
}
