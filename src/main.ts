// ============================================================
// AZ Tamer — entry point & story orchestrator
// by lemonquake
// ============================================================
import * as THREE from 'three';
import { DUNGEONS, HOUSES, type DungeonDef, expForLevel } from './data';
import { Player, Guardian, SAVE_SLOTS } from './state';
import { RANKS } from './ranks';
import { makeRenderer, updateTweens, updateRigs } from './models';
import { say, conversation, choose, askName, toast, fadeIn, fadeOut, hideHUD, updateHUD, playStorySequence, isDialogueOpen, isMenuOpen, refreshHUD, openOptionsMenu, executeCheatFlow } from './ui';
import { Battle, type BattleOptions, type BattleResult } from './battle';
import { DungeonRun, type DungeonOutcome } from './dungeon';
import { Town } from './town';
import { Fishing, type FishingSpotInfo } from './fishing';
import { Overworld } from './overworld';
import { AgdaoIsland } from './agdao';
import { NewSalmonan } from './salmonan';
import { TerraCity } from './terra';
import { University } from './university';
import { Cinematic } from './cinematic';
import { syncStoryQuests } from './quests';
import { initAudio, toggleMute, playMusic } from './audio';
import { initMobileControls } from './mobile';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// procedural audio: SFX + ambient pad; N toggles sound anywhere
initAudio();
initMobileControls();
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'n' && !(e.target instanceof HTMLInputElement)) {
    toast(toggleMute() ? '🔇 Sound off' : '🔊 Sound on');
  }
});

// Cheat system: Enter key brings up cheat code input box
window.addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (isDialogueOpen() || isMenuOpen()) {
      return;
    }
    if (!player) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    
    await executeCheatFlow(player);
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
(window as unknown as Record<string, unknown>).__renderer = renderer; // debug handle (see window.__town)

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
(window as any).__getActivePlayer = () => player;

async function runBattle(specs: { speciesId: string; level: number }[], opts: BattleOptions): Promise<BattleResult> {
  const prev = activeView;
  await fadeOut();
  
  let track = 'battle';
  if (opts.boss) {
    track = 'battle_boss';
  } else if (prev && (prev as any).intName === 'Grand Coliseum') {
    track = 'battle_coliseum';
  }
  playMusic(track);
  
  const battle = new Battle(player, specs, opts);
  setView(battle.view);
  await fadeIn();
  const result = await battle.run();
  await fadeOut();
  
  let returnTrack = 'overworld';
  if (prev && prev.constructor?.name === 'Town') {
    if ((prev as any).intName === 'Grand Coliseum') {
      returnTrack = 'coliseum';
    } else {
      returnTrack = 'haven_town';
    }
  } else if (prev && prev.constructor?.name === 'University') {
    returnTrack = 'university';
  } else if (prev && prev.constructor?.name === 'TerraCity') {
    returnTrack = 'terra_city';
  }
  playMusic(returnTrack);
  
  setView(prev);
  await fadeIn();
  return result;
}

/** Hand control to the dedicated Fishing scene, returning to the exact city spot afterward. */
async function runFishing(info: FishingSpotInfo): Promise<void> {
  const prev = activeView;
  await fadeOut();
  const fishing = new Fishing(player, info);
  setView(fishing.view);
  await fadeIn();
  await fishing.run();         // resolves when the player quits fishing
  await fadeOut();
  playMusic('haven_town');     // fishing always launches from Haven City
  setView(prev);
  await fadeIn();
}

async function runDungeon(def: DungeonDef): Promise<DungeonOutcome> {
  await fadeOut();
  playMusic('overworld');
  player.inDungeon = true;
  const dungeon = new DungeonRun({ player, runBattle }, def);
  setView(dungeon.view);
  await fadeIn();
  const outcome = await dungeon.run();
  await fadeOut();
  setView(null);
  hideHUD();
  player.inDungeon = false;
  return outcome;
}

// ---------------- intro: academy final exam ----------------
/** The whole exam chapter plays inside the academy briefing-hall cinematic — never over a black screen. */
async function academyExam(cine?: Cinematic): Promise<void> {
  if (!cine || activeView !== cine.view) {
    cine = cine ?? new Cinematic('academy');
    await fadeOut();
    playMusic('university');
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
    ['Instructor Hale', 'Every graduate is presented at the Leodones University of Aurel — the five Grand Houses keep recruiting officers there, and the halls are full of tamers who were once exactly where you stand.'],
    ['Instructor Hale', 'The transport circle is charged and waiting. Hold still, keep your arms in… and make me proud, graduate!'],
  ]);
  player.clearTempGuardians();
  player.flags['exam_done'] = true;
  player.save();
}

// ---------------- Leodones University ----------------
async function runUniversity(revisit: boolean, initialRoom?: string): Promise<void> {
  await fadeOut();
  playMusic('university');
  const uni = new University({ player, runBattle }, revisit);
  if (initialRoom) {
    (uni as any).initialRoom = initialRoom;
  }
  setView(uni.view);
  await fadeIn();
  await uni.run(); // resolves when the player exits through the Grand Doors
  await fadeOut();
  setView(null);
  hideHUD();
}

// ---------------- Agdao Island ----------------
/** The island loop: explore ↔ Cradle Hollow, until the player sails home. */
async function runAgdao(startSpawn?: 'pier' | 'cave'): Promise<void> {
  let spawnAt: 'pier' | 'cave' = startSpawn || 'pier';
  while (true) {
    const isle = new AgdaoIsland(player, spawnAt);
    await fadeOut();
    playMusic('overworld');
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

// ---------------- New Salmonan ----------------
/** The valley loop: explore ↔ the Mirrorhouse, until the player ferries out. */
async function runSalmonan(startSpawn?: 'pier' | 'ridge'): Promise<void> {
  let spawnAt: 'pier' | 'ridge' = startSpawn || 'pier';
  while (true) {
    const valley = new NewSalmonan({ player, runBattle }, spawnAt);
    await fadeOut();
    playMusic('overworld');
    setView(valley.view);
    await fadeIn();
    const res = await valley.run();
    if (res.kind === 'dungeon') {
      const outcome = await runDungeon(res.def);
      syncStoryQuests(player).forEach(n => toast(n, 'gold'));
      if (outcome === 'dead') {
        const lost = Math.floor(player.shards * 0.25);
        player.shards -= lost;
        player.healAll();
        await say('', `You wake on the Lawrences' porch under three blankets you don't remember earning. Maris patched your team; Auntie Dalisay catered the vigil and billed ◆${lost} for "soup, bandages and the YEARS you took off Auntie".`);
      }
      player.save();
      spawnAt = 'ridge';
      continue; // back down the stair, into the valley
    }
    break; // ferried home
  }
  await fadeOut();
  setView(null);
  hideHUD();
}

// ---------------- Terra City (the Circuit-Crown of Tharkand) ----------------
/** Pod across the strait to Terra City and explore until the player rides home. */
async function runTerra(initialRoom?: string): Promise<void> {
  const firstArrival = !player.flags['terra_visited'];
  const city = new TerraCity(player, firstArrival);
  if (initialRoom) {
    (city as any).initialRoom = initialRoom;
  }
  await fadeOut();
  playMusic('terra_city');
  setView(city.view);
  await fadeIn();
  await city.run(); // resolves when the player boards the Pod home to Haven City
  await fadeOut();
  setView(null);
  hideHUD();
  syncStoryQuests(player).forEach(n => toast(n, 'gold'));
  player.save();
}

// ---------------- main game loop ----------------
async function runOverworldLoop(startRegion = 'aurel'): Promise<DungeonDef | 'agdao' | 'salmonan' | null> {
  let region = startRegion;
  while (true) {
    const overworld = new Overworld(player, region);
    await fadeOut();
    playMusic('overworld');
    setView(overworld.view);
    await fadeIn();
    const dest = await overworld.run();
    if (dest && typeof dest === 'object' && 'travel' in dest) {
      region = dest.travel;
      continue;
    }
    return dest;
  }
}

async function handleDungeonOutcome(outcome: DungeonOutcome, dungeonDef: DungeonDef): Promise<void> {
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

async function cityLoop(): Promise<never> {
  let firstArrival = !player.flags['arrived_city'];
  
  let startLoc = player.savedLocation;
  player.savedLocation = undefined; // clear after reading

  if (!startLoc) {
    startLoc = { type: 'town' };
  }

  while (true) {
    player.flags['arrived_city'] = true;
    syncStoryQuests(player).forEach(n => toast(n, 'gold'));

    let dest: 'expedition' | 'university' | 'terra' | null = null;

    if (startLoc.type === 'town') {
      const town = new Town(player, firstArrival, { runFishing });
      firstArrival = false;
      if (startLoc.room) {
        (town as any).initialRoom = startLoc.room;
      }
      await fadeOut();
      playMusic('haven_town');
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

      dest = await town.run();
    } else {
      // Bypassing town and routing directly
      if (startLoc.type === 'university') {
        await runUniversity(true, startLoc.room);
      } else if (startLoc.type === 'terra') {
        await runTerra(startLoc.room);
      } else if (startLoc.type === 'agdao') {
        const spawnAt = (startLoc.spawnAt as 'pier' | 'cave') || 'pier';
        await runAgdao(spawnAt);
      } else if (startLoc.type === 'salmonan') {
        const spawnAt = (startLoc.spawnAt as 'pier' | 'ridge') || 'pier';
        await runSalmonan(spawnAt);
      } else if (startLoc.type === 'overworld') {
        const startRegion = startLoc.room || 'aurel';
        const dungeonDef = await runOverworldLoop(startRegion);
        if (dungeonDef) {
          if (dungeonDef === 'agdao') {
            await runAgdao();
          } else if (dungeonDef === 'salmonan') {
            await runSalmonan();
          } else {
            const outcome = await runDungeon(dungeonDef);
            await handleDungeonOutcome(outcome, dungeonDef);
          }
        }
      }
      startLoc = { type: 'town' };
      continue;
    }

    if (dest === 'university') {
      await runUniversity(true);
      continue;
    }

    if (dest === 'terra') {
      await runTerra();
      continue;
    }

    // Otherwise, run overworld:
    const dungeonDef = await runOverworldLoop('aurel');
    if (!dungeonDef) continue; // returned to the city
    if (dungeonDef === 'agdao') {
      await runAgdao();
      continue;
    }
    if (dungeonDef === 'salmonan') {
      await runSalmonan();
      continue;
    }

    const outcome = await runDungeon(dungeonDef);
    await handleDungeonOutcome(outcome, dungeonDef);
  }
}

// ---------------- title ----------------
/** Three save slots: occupied slots continue (with a delete button), empty slots start fresh. */
function titleScreen(): Promise<{ mode: 'new' | 'continue'; slot: number }> {
  return new Promise(resolve => {
    const ts = $('title-screen');
    ts.style.display = 'flex';
    const menu = $('title-menu');

    const pick = (mode: 'new' | 'continue', slot: number) => {
      Player.setSlot(slot);
      ts.style.display = 'none';
      
      const banner = $('title-copy-banner');
      if (banner) banner.remove();
      
      resolve({ mode, slot });
    };

    let copySourceSlot: number | null = null;

    const render = () => {
      menu.innerHTML = '';

      // Render the duplicate banner if we are in Copy Mode
      let banner = $('title-copy-banner');
      if (copySourceSlot !== null) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'title-copy-banner';
          banner.className = 'copy-banner';
          menu.parentNode!.insertBefore(banner, menu);
        }
        const sourceName = Player.slotSummary(copySourceSlot)?.tamerName ?? `Slot ${copySourceSlot}`;
        banner.innerHTML = `<span>👯 Duplicating <b>${sourceName} (Slot ${copySourceSlot})</b>. Select target slot below:</span>
          <button class="ui-btn danger" style="padding:4px 10px; font-size:12px" id="cancel-copy-btn">Cancel</button>`;
        $('cancel-copy-btn').onclick = () => {
          copySourceSlot = null;
          render();
        };
      } else {
        if (banner) banner.remove();
      }

      for (let slot = 1; slot <= SAVE_SLOTS; slot++) {
        const sum = Player.slotSummary(slot);
        const card = document.createElement('div');

        if (copySourceSlot !== null) {
          if (slot === copySourceSlot) {
            card.className = 'slot-card copying-source';
          } else {
            card.className = 'slot-card';
          }
        } else {
          card.className = `slot-card ${sum ? '' : 'empty'}`;
        }

        // Header
        const header = document.createElement('div');
        header.className = 'slot-header';
        header.innerHTML = `<span class="slot-number">SLOT ${slot}</span>`;
        card.appendChild(header);

        if (copySourceSlot !== null) {
          if (slot === copySourceSlot) {
            const body = document.createElement('div');
            body.className = 'slot-body';
            body.style.cursor = 'default';
            body.innerHTML = `
              <div class="slot-body-name" style="text-align:center; margin-top:20px; color:var(--ui-gold)">SOURCE FILE</div>
              <div class="slot-body-stats" style="text-align:center">Copying from this slot...</div>
            `;
            card.appendChild(body);
          } else {
            const body = document.createElement('div');
            body.className = 'slot-body';
            body.style.justifyContent = 'center';
            body.style.alignItems = 'center';
            
            const pasteBtn = document.createElement('button');
            if (sum) {
              pasteBtn.className = 'ui-btn danger';
              pasteBtn.innerHTML = '⚠️ Overwrite';
            } else {
              pasteBtn.className = 'ui-btn primary';
              pasteBtn.innerHTML = '📋 Paste Here';
            }
            pasteBtn.style.width = '80%';
            pasteBtn.style.padding = '10px';
            pasteBtn.onclick = (e) => {
              e.stopPropagation();
              if (!sum || confirm(`Overwrite Slot ${slot} (${sum.tamerName}) with Slot ${copySourceSlot}'s save? This cannot be undone.`)) {
                Player.duplicateSave(copySourceSlot!, slot);
                copySourceSlot = null;
                render();
              }
            };
            body.appendChild(pasteBtn);
            card.appendChild(body);
          }
        } else {
          if (sum) {
            const rank = [...RANKS].reverse().find(r => sum.tournamentPoints >= r.threshold) ?? RANKS[0];
            const house = HOUSES.find(h => h.id === sum.houseId);
            const when = sum.savedAt ? new Date(sum.savedAt).toLocaleDateString() : '';
            
            const body = document.createElement('div');
            body.className = 'slot-body';
            body.onclick = () => pick('continue', slot);
            
            body.innerHTML = `
              <div class="slot-body-name">${sum.tamerName}</div>
              <div class="slot-body-house" style="color:${house ? house.color : 'var(--ui-dim)'}">
                ${house ? `🛡️ ${house.name}` : '🔰 Freelance Tamer'}
              </div>
              <div class="slot-body-stats">
                ◆ ${sum.shards.toLocaleString()} Shards · <span style="color:${rank.color}">${rank.name}</span>
              </div>
              ${sum.partyNames && sum.partyNames.length > 0 ? `<div class="slot-body-party">🐾 ${sum.partyNames.join(' · ')}</div>` : ''}
              <div class="slot-body-date">${when}</div>
            `;
            card.appendChild(body);

            // Actions row
            const actions = document.createElement('div');
            actions.className = 'slot-actions';
            
            const dupBtn = document.createElement('button');
            dupBtn.className = 'ui-btn';
            dupBtn.innerHTML = '👯 Duplicate';
            dupBtn.onclick = (e) => {
              e.stopPropagation();
              copySourceSlot = slot;
              render();
            };
            
            const delBtn = document.createElement('button');
            delBtn.className = 'ui-btn danger';
            delBtn.innerHTML = '🗑️ Delete';
            delBtn.onclick = (e) => {
              e.stopPropagation();
              if (confirm(`Delete Slot ${slot} (${sum.tamerName})? This cannot be undone.`)) {
                Player.deleteSave(slot);
                render();
              }
            };
            
            actions.append(dupBtn, delBtn);
            card.appendChild(actions);
          } else {
            const body = document.createElement('div');
            body.className = 'slot-body';
            body.style.justifyContent = 'center';
            body.style.alignItems = 'center';
            body.innerHTML = `
              <div class="slot-body-name" style="color:var(--ui-dim); margin-bottom: 8px">EMPTY SLOT</div>
              <button class="ui-btn primary" style="font-size:14px; padding:8px 16px">▶ New Game</button>
            `;
            body.onclick = () => pick('new', slot);
            card.appendChild(body);
          }
        }

        menu.appendChild(card);
      }

      // Bind static Options Button
      const optBtn = $('title-opts-btn');
      if (copySourceSlot !== null) {
        optBtn.style.opacity = '0.5';
        optBtn.style.pointerEvents = 'none';
      } else {
        optBtn.style.opacity = '1';
        optBtn.style.pointerEvents = 'auto';
        optBtn.onclick = async () => {
          await openOptionsMenu();
        };
      }
    };
    render();
  });
}

async function boot(): Promise<void> {
  const { mode } = await titleScreen();

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
  playMusic('university');

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
