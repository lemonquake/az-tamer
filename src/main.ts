// ============================================================
// AZ Tamer — entry point & story orchestrator
// by Aljay Leodones
// ============================================================
import * as THREE from 'three';
import { DUNGEONS, type DungeonDef } from './data';
import { Player, Guardian } from './state';
import { makeRenderer, updateTweens, updateRigs } from './models';
import { say, conversation, choose, askName, toast, fadeIn, fadeOut, hideHUD, updateHUD, playStorySequence } from './ui';
import { Battle, type BattleOptions, type BattleResult } from './battle';
import { DungeonRun, type DungeonOutcome } from './dungeon';
import { Town } from './town';
import { Overworld } from './overworld';
import { AgdaoIsland } from './agdao';
import { University } from './university';
import { Cinematic } from './cinematic';
import { syncStoryQuests } from './quests';
import { initAudio, toggleMute } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// procedural audio: SFX + ambient pad; N toggles sound anywhere
initAudio();
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'n' && !(e.target instanceof HTMLInputElement)) {
    toast(toggleMute() ? '🔇 Sound off' : '🔊 Sound on');
  }
});

interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
}

// ---------------- renderer & loop ----------------
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
$('app').prepend(canvas);
const renderer = makeRenderer(canvas);

let activeView: View | null = null;
const setView = (v: View | null) => { activeView = v; };

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (activeView) {
    activeView.camera.aspect = innerWidth / innerHeight;
    activeView.camera.updateProjectionMatrix();
  }
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateTweens(dt);
  updateRigs(dt);
  if (activeView) {
    try {
      activeView.update(dt);
      renderer.render(activeView.scene, activeView.camera);
    } catch (err) {
      console.error('frame error:', err); // never let one bad frame kill the game loop
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- battle bridge ----------------
let player: Player;

async function runBattle(specs: { speciesId: string; level: number }[], opts: BattleOptions): Promise<BattleResult> {
  const prev = activeView;
  await fadeOut();
  const battle = new Battle(player, specs, opts);
  setView(battle.view);
  await fadeIn();
  const result = await battle.run();
  await fadeOut();
  setView(prev);
  await fadeIn();
  return result;
}

async function runDungeon(def: DungeonDef): Promise<DungeonOutcome> {
  await fadeOut();
  const dungeon = new DungeonRun({ player, runBattle }, def);
  setView(dungeon.view);
  await fadeIn();
  const outcome = await dungeon.run();
  await fadeOut();
  setView(null);
  hideHUD();
  return outcome;
}

// ---------------- intro: academy final exam ----------------
/** The whole exam chapter plays inside the academy briefing-hall cinematic — never over a black screen. */
async function academyExam(cine?: Cinematic): Promise<void> {
  if (!cine || activeView !== cine.view) {
    cine = cine ?? new Cinematic('academy');
    await fadeOut();
    setView(cine.view);
    await fadeIn();
  }
  cine.shot('hale');
  await conversation([
    ['Instructor Hale', `${player.tamerName}! Front and center. Today is your final exam at the Tamer Academy.`],
    ['Instructor Hale', 'The Trial Caverns below the academy have grown restless — a corrupted sentinel, "Ironhusk", nests on the second floor.'],
    ['Instructor Hale', 'You will take an academy Crawler and three loaner Guardians. Descend, destroy Ironhusk, and you graduate. Fail… and, well, the recovery team is on standby.'],
    ['Instructor Hale', 'Your loaners: Pyrofang the Blaze, Tidefin the Tide, and Galewing the Gale. Treat them well — and remember, type advantages win battles!'],
    ['Instructor Hale', 'Drive the Crawler with WASD. Press E to interact, Esc for your field menu. Every step drains Energy — watch the gauges. Now go make me proud!'],
  ]);

  // loaner party
  for (const sp of ['pyrofang', 'tidefin', 'galewing']) {
    const g = new Guardian(sp, 8);
    g.isTemp = true;
    player.addGuardian(g);
  }
  player.addItem('tonic', 3);
  player.addItem('soda', 2);
  player.addItem('cell', 2);
  player.shards = 80;

  // run trial until cleared — debrief lines play back in the briefing hall
  const trial = DUNGEONS.find(d => d.id === 'trial')!;
  while (true) {
    const outcome = await runDungeon(trial);
    if (outcome === 'cleared') break;
    player.healAll();
    await fadeOut();
    setView(cine.view);
    await fadeIn();
    cine.shot('hale');
    if (outcome === 'dead') {
      await say('Instructor Hale', 'The recovery team dragged you out. No shame in a hard lesson — your team is patched up. Now get back down there!');
    } else {
      await say('Instructor Hale', 'Back already? The exam isn\'t over until Ironhusk falls. Your team is rested — go!');
    }
  }

  // graduation — wide shot of the hall
  await fadeOut();
  setView(cine.view);
  await fadeIn();
  cine.shot('wide');
  await conversation([
    ['Instructor Hale', 'Ironhusk, destroyed?! Outstanding work, ' + player.tamerName + '!'],
    ['Instructor Hale', 'By the authority of the Tamer Academy, I declare you a GRADUATE. The loaner Guardians return to the academy now — your own story starts today.'],
    ['Instructor Hale', 'Every graduate is presented at the Tamer University of Aurel — the five Grand Houses keep recruiting officers there, and the halls are full of tamers who were once exactly where you stand.'],
    ['Instructor Hale', 'The transport circle is charged and waiting. Hold still, keep your arms in… and make me proud, graduate!'],
  ]);
  player.clearTempGuardians();
  player.flags['exam_done'] = true;
  player.save();
}

// ---------------- Tamer University ----------------
async function runUniversity(revisit: boolean): Promise<void> {
  await fadeOut();
  const uni = new University({ player, runBattle }, revisit);
  setView(uni.view);
  await fadeIn();
  await uni.run(); // resolves when the player exits through the Grand Doors
  await fadeOut();
  setView(null);
  hideHUD();
}

// ---------------- Agdao Island ----------------
/** The island loop: explore ↔ Cradle Hollow, until the player sails home. */
async function runAgdao(): Promise<void> {
  let spawnAt: 'pier' | 'cave' = 'pier';
  while (true) {
    const isle = new AgdaoIsland(player, spawnAt);
    await fadeOut();
    setView(isle.view);
    await fadeIn();
    const res = await isle.run();
    if (res.kind === 'dungeon') {
      const outcome = await runDungeon(res.def);
      syncStoryQuests(player).forEach(n => toast(n, 'gold'));
      if (outcome === 'dead') {
        const lost = Math.floor(player.shards * 0.25);
        player.shards -= lost;
        player.healAll();
        await say('', `The islanders haul you out of the Hollow and patch you up by the First Fire. Mama Imee charges ◆${lost} for "stew, bandages and the fright you gave Kiko".`);
      }
      player.save();
      spawnAt = 'cave';
      continue; // back to the island
    }
    break; // sailed home
  }
  await fadeOut();
  setView(null);
  hideHUD();
}

// ---------------- main game loop ----------------
async function cityLoop(): Promise<never> {
  let firstArrival = !player.flags['arrived_city'];
  while (true) {
    player.flags['arrived_city'] = true;

    // advance the Chronicle (auto-accept / auto-complete story chapters)
    syncStoryQuests(player).forEach(n => toast(n, 'gold'));

    const town = new Town(player, firstArrival);
    firstArrival = false;
    await fadeOut();
    setView(town.view);
    await fadeIn();

    // Chapter I opens with Hale on the Crawler radio, once, over the city
    if (player.quests['story_roads'] === 'active' && !player.flags['story_ch1_intro']) {
      player.flags['story_ch1_intro'] = true;
      player.save();
      playStorySequence([
        ['Instructor Hale', `${player.tamerName}! Hale here — yes, I keep graduate frequencies. A diploma isn't a tamer; the wild needs two honest chances to eat you first.`],
        ['Instructor Hale', `Your road: descend the MOSSDEEP BURROWS to the deepest floor, and conquer the SUNKEN VAULT. Both are on the overworld, past the city gate.`],
        ['Instructor Hale', `Do that, and go see VEYL at the University library. Historian. Smells of ink and thunderstorms. Trust me — what he's been charting will change your year. Hale out.`],
      ]);
    }

    const dest = await town.run(); // resolves when the player departs the city

    if (dest === 'university') {
      await runUniversity(true);
      continue;
    }

    // overworld globe: pick an expedition (or walk back to Haven City)
    let dungeonDef: DungeonDef | 'agdao' | null = null;
    {
      const overworld = new Overworld(player);
      await fadeOut();
      setView(overworld.view);
      await fadeIn();
      dungeonDef = await overworld.run();
    }
    if (!dungeonDef) continue; // returned to the city
    if (dungeonDef === 'agdao') {
      await runAgdao();
      continue;
    }

    const outcome = await runDungeon(dungeonDef);
    if (outcome === 'dead') {
      // night recovery camp cinematic — the medic patches you up by the fire
      const camp = new Cinematic('camp');
      setView(camp.view);
      await fadeIn();
      camp.shot('fire');
      const lost = Math.floor(player.shards * 0.4);
      player.shards -= lost;
      player.healAll();
      await say('', 'You wake to woodsmoke and starlight. The recovery team\'s camp. Your Guardians are bandaged and snoring in a pile beside you.');
      camp.shot('medic');
      await conversation([
        ['Field Medic', `Easy, easy — you took a real beating down there. Everyone's patched, your Crawler's running again… and the rescue bill came to ◆${lost} Shards. Recovery flights aren't cheap, tamer.`],
        ['Field Medic', 'Rest by the fire a moment. The road back to Haven City is short — and the ruins will still be there when you\'re stronger.'],
      ]);
      camp.shot('wide');
      await fadeOut();
      setView(null);
    } else if (outcome === 'cleared' && dungeonDef.id === 'sunken' && !player.flags['vault_cleared']) {
      // victory camp cinematic — word of the Vault spreads
      const camp = new Cinematic('camp');
      setView(camp.view);
      await fadeIn();
      camp.shot('fire');
      player.flags['vault_cleared'] = true;
      await say('', 'That night, your camp is loud with celebration — the Vault\'s drowned halls finally quiet behind you.');
      camp.shot('medic');
      await say('Guide Mara', 'Word travels fast — the Vault\'s master has fallen! The guilds have unsealed the Stormspire Depths for you. A war-engine of the old empire waits below…');
      camp.shot('wide');
      await fadeOut();
      setView(null);
    }
    syncStoryQuests(player).forEach(n => toast(n, 'gold'));
    player.save();
  }
}

// ---------------- title ----------------
function titleScreen(): Promise<'new' | 'continue'> {
  return new Promise(resolve => {
    const ts = $('title-screen');
    ts.style.display = 'flex';
    const menu = $('title-menu');
    menu.innerHTML = '';
    const mk = (label: string, cb: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.className = 'ui-btn';
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = cb;
      menu.appendChild(b);
    };
    mk('▶ New Game', () => {
      if (Player.hasSave() && !confirm('Overwrite the existing save?')) return;
      Player.deleteSave();
      ts.style.display = 'none';
      resolve('new');
    });
    mk('↻ Continue', () => { ts.style.display = 'none'; resolve('continue'); }, !Player.hasSave());
  });
}

async function boot(): Promise<void> {
  const mode = await titleScreen();

  if (mode === 'continue') {
    const loaded = Player.load();
    if (loaded) {
      player = loaded;
      toast(`Welcome back, ${player.tamerName}!`, 'gold');
      if (!player.flags['exam_done']) await academyExam();
      if (!player.flags['university_done']) await runUniversity(!!player.flags['arrived_city']);
      await cityLoop();
      return;
    }
    toast('Save data was corrupted — starting fresh.', 'red');
  }

  player = new Player();

  // opening cinematic — the academy registration hall, at the holo-terminal
  const cine = new Cinematic('academy');
  setView(cine.view);
  await fadeIn();
  cine.shot('terminal');
  await conversation([
    ['Terminal', '…bzzt. TAMER REGISTRATION NETWORK — ONLINE. Identity scan in progress. Please hold still and do not lick the scanner. Again.'],
    ['Registrar Terminal', 'Good morning, cadet. Today\'s docket: FINAL LICENSING EXAM. Proctor: Instructor R. Hale. Survival odds: statistically encouraging.'],
    ['Registrar Terminal', 'Before we may legally lower you into a monster-infested cavern, the Academy requires one final datum. State your name for the record, cadet.'],
  ]);
  player.tamerName = await askName('Enter your tamer name');
  await conversation([
    ['Registrar Terminal', `Identity confirmed: TAMER ${player.tamerName.toUpperCase()}. License pending one (1) defeated sentinel. Printing good-luck certificate… out of ink. The sentiment stands.`],
    ['Instructor Hale', `${player.tamerName}! Quit flirting with the terminal — it fails half my cadets out of spite. With me, graduate-to-be. Briefing starts NOW.`],
  ]);
  await academyExam(cine);
  await runUniversity(false);
  await cityLoop();
}

boot();
