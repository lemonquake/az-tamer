// ============================================================
// AZ Tamer — Quest engine: the Chronicle (the epic main story,
// told in chapters), guild main-quest chains (a unique storyline
// per Grand House) and NPC side quests.
// Quest progress lives on Player.quests / Player.flags.
//
// The deep history (see lore.ts): Guardians crossed into the
// world at the First Dawn, ~3,000 years ago. ~700 years ago
// Aurelia of Agdao Island made the First Bond and the first
// Tamers rose around her. The Reaching — humans discovering far
// more than they should, and the bad ones caging what they
// found — was answered by the Guild Compact: Tamer guilds in
// every town and city of the world. The five Grand Houses of
// Olivar are one famous chapter among hundreds.
//
// Fifteen years ago the Corrupted Legion massed in Ghandra.
// Aljay, Greggy and Onnel sealed them away. The seal is
// thinning — and the Chronicle below is the player's road into
// that story: to Historian Veyl, to Agdao, to Greggy the
// Stormheart, and to Aljay's daughters, Azrin and Azrael.
// ============================================================
import { ITEMS, expForLevel } from './data';
import type { Player } from './state';
import { recordQuestComplete } from './mmr';

export interface QuestReward { shards?: number; items?: [string, number][]; }

export interface QuestDef {
  id: string;
  kind: 'story' | 'main' | 'side';
  houseId?: string;            // main quests belong to a guild
  chapter?: number;            // story quests are numbered chapters of the Chronicle
  icon?: string;               // journal glyph
  title: string;
  giver: string;
  location: string;
  brief: string;               // journal text — the story of the quest
  objective: string;           // short imperative
  hint?: string;               // journal nudge — where to go, what to try
  check: (p: Player) => boolean;
  progress?: (p: Player) => [number, number];  // numeric progress for journal bars
  onComplete?: (p: Player) => void;   // consume fetch items, set flags etc.
  autoComplete?: boolean;      // completes the moment check passes (no turn-in NPC)
  reward: QuestReward;
  requires?: string;           // quest id that must be done first
}

const M = (q: QuestDef) => q;

// ---------------- THE CHRONICLE — the epic main story ----------------
// One continuous road: prove yourself in the wild → the historian
// who maps storms → amber from the mire → the sea-chart to Agdao →
// Greggy the Stormheart → the First Hollow → the daughters of the
// Dawnflame → the engine in the spire. Chapter VIII is a door left
// ajar: Ghandra waits.
const STORY_QUESTS: QuestDef[] = [
  M({
    id: 'story_roads', kind: 'story', chapter: 1, icon: '🗺️',
    title: 'Two Roads Below', giver: 'Instructor Hale (Crawler radio)', location: 'Mossdeep Burrows · Sunken Vault',
    brief: 'Hale\'s voice crackled through the Crawler radio the morning after your presentation at the University. "Congratulations, graduate — now forget the applause. A diploma isn\'t a tamer; the wild needs two honest chances to eat you first. Descend the Mossdeep Burrows to their deepest floor, and conquer the Sunken Vault. Do that, and I\'ll point you at something bigger. Write this down: VEYL. University library. You\'ll thank me."',
    objective: 'Fully descend Mossdeep Burrows and conquer the Sunken Vault',
    hint: 'Both expeditions are marked on the overworld globe. The Vault opens to Grand House members — pledge to a House in Haven City first.',
    check: p => (p.dungeonClears['mossdeep'] ?? 0) >= 1 && (p.dungeonClears['sunken'] ?? 0) >= 1,
    progress: p => [Math.min(1, p.dungeonClears['mossdeep'] ?? 0) + Math.min(1, p.dungeonClears['sunken'] ?? 0), 2],
    autoComplete: true,
    reward: { shards: 900, items: [['cell_plus', 1], ['tonic_plus', 1]] },
  }),
  M({
    id: 'story_historian', kind: 'story', chapter: 2, icon: '📜', requires: 'story_roads',
    title: 'The Man Who Maps Storms', giver: 'Instructor Hale', location: 'University — Library',
    brief: '"Veyl," Hale said, as if the name were a full sentence. "Historian. Library. Smells of ink and thunderstorms. The man has spent nine years charting every verified sighting of Greggy the Stormheart — where the legend has been, and more importantly, where he hasn\'t. If anyone alive can point you at a living legend, it\'s Veyl. Take the Pod. Mind your manners. Do NOT touch his charts."',
    objective: 'Speak with Historian Veyl in the University library',
    hint: 'Board the Aetherline Skyport Pod on the west side of Haven City plaza, then take the Library door off the lobby.',
    check: p => !!p.flags['met_historian'],
    reward: { shards: 300 },
  }),
  M({
    id: 'story_amber', kind: 'story', chapter: 3, icon: '🟠', requires: 'story_historian',
    title: 'Amber in the Mire', giver: 'Historian Veyl', location: 'Thunderfen Mire',
    brief: '"A legend\'s trail can be CALCULATED," Veyl said, sweeping a dozen charts off the table to unroll a thirteenth. "Greggy grounds himself — literally — wherever the world\'s charge gathers. Three weeks ago a bog northeast of Haven began catching the same lightning every night. The wild Guardians there are already shedding storm-touched amber. Bring me one piece. Amber remembers the storm that made it — and I can read in it where the Stormheart went."',
    objective: 'Bring 1 Storm-Touched Amber to Historian Veyl',
    hint: 'The Thunderfen Mire is now marked on the overworld. Wild Guardians there sometimes shed amber after a battle.',
    check: p => p.itemCount('storm_amber') >= 1,
    progress: p => [Math.min(1, p.itemCount('storm_amber')), 1],
    onComplete: p => { p.removeItem('storm_amber', 1); p.flags['agdao_unlocked'] = true; },
    reward: { shards: 800, items: [['sea_chart', 1]] },
  }),
  M({
    id: 'story_agdao', kind: 'story', chapter: 4, icon: '🏝️', requires: 'story_amber',
    title: 'The Cradle of Tamers', giver: 'Historian Veyl', location: 'Agdao Island',
    brief: 'Veyl held the amber to the lamplight and went very quiet. "Agdao," he breathed. "Of course. Where else does a storm go to rest but the place the First Bond was made?" He pressed his own sea-chart into your hands — seven hundred years of corrections in nine different inks. "Agdao Island, the Cradle of Tamers. Hut villages, the oldest Guild in the world, and people who notice everything. Ask around. The islanders will know where an old thunderhead has parked himself."',
    objective: 'Sail to Agdao Island and find Greggy the Stormheart',
    hint: 'Agdao now appears on your overworld map. On the island: ask the villagers, then take the Left Gate west and follow the cliff path up and around to the northeast bluff.',
    check: p => !!p.flags['met_greggy'],
    reward: { shards: 1000 },
  }),
  M({
    id: 'story_cradle', kind: 'story', chapter: 5, icon: '🌀', requires: 'story_agdao',
    title: 'The First Hollow', giver: 'Greggy the Stormheart', location: 'Cradle Hollow, Agdao',
    brief: '"I was expecting you," Greggy said, before you\'d said a word. "Veyl\'s amber trick. I taught him that." The smile faded fast. "Listen. The sea-cave where Aurelia bonded Cero — the gentlest ground in this world — has something Legion-touched nested in it. I can feel it through my boots. I\'m too loud to go down there; the corruption would hear me coming an island away. You\'re new. You\'re quiet. Cleanse the Cradle Hollow, and I\'ll tell you things about the Dawnflame\'s family that aren\'t in any of Veyl\'s charts."',
    objective: 'Cleanse Cradle Hollow and return to Greggy',
    hint: 'The Hollow\'s mouth is on Agdao\'s eastern shore, below Greggy\'s bluff. Its warden is strong — Lv 27. Pack tonics.',
    check: p => (p.dungeonClears['cradle'] ?? 0) >= 1,
    progress: p => [Math.min(1, p.dungeonClears['cradle'] ?? 0), 1],
    reward: { shards: 2000, items: [['stormheart_coil', 1], ['elixir', 1]] },
  }),
  M({
    id: 'story_daughters', kind: 'story', chapter: 6, icon: '🔥', requires: 'story_cradle',
    title: 'Daughters of the Dawnflame', giver: 'Greggy the Stormheart', location: 'Haven City — Plaza',
    brief: 'Greggy watched the Hollow\'s light come back to the water for a long time. "Aljay has two daughters," he said at last. "Azrin and Azrael. Tamers — real ones, better than their father at their age, and you may tell them I said the opposite. They\'ve been hunting the same wrongness you just cleansed, following it across three continents. I sent word the moment Veyl\'s amber lit up. They\'re waiting for you by the fountain in Haven City. Go and meet the Dawnflame\'s fire — both colors of it."',
    objective: 'Meet Azrin and Azrael at the Haven City fountain',
    hint: 'They\'re waiting in the plaza, by the fountain at the center of Haven City.',
    check: p => !!p.flags['met_daughters'],
    reward: { shards: 800, items: [['star_treat', 2]] },
  }),
  M({
    id: 'story_echoes', kind: 'story', chapter: 7, icon: '⚡', requires: 'story_daughters',
    title: 'Echoes of Ghandra', giver: 'Azrin & Azrael', location: 'Stormspire Depths → Agdao',
    brief: '"Here\'s what we know," Azrael said, unrolling a chart her father would have recognized. "The Stormspire\'s war-engine isn\'t counting down. It\'s ANSWERING — call and response, and the call comes from inside Ghandra\'s seal." Azrin cracked her knuckles. "So we cut the conversation. You silence the engine — uncle Greggy says you\'re quiet, and we\'re anything but. Then get back to him on Agdao and tell him what the engine\'s last word was. We\'ll handle the rest of the continent\'s panicking."',
    objective: 'Conquer the Stormspire Depths, then report to Greggy on Agdao',
    hint: 'The Stormspire Depths sit far to the east on the overworld. Its master is Lv 26 — bring your strongest three.',
    check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    progress: p => [Math.min(1, p.dungeonClears['stormspire'] ?? 0), 1],
    // TODO(acts II–IV): 'salmonan_unlocked' is a temporary bridge so the
    // Act V chapters below are reachable for testing. When chapters
    // VIII–XXI land, move this flag to Chapter XXI's onComplete
    // ('story_ivan' — clearing Ivan's name opens New Salmonan).
    onComplete: p => { p.flags['arc1_done'] = true; p.flags['salmonan_unlocked'] = true; },
    reward: { shards: 5000, items: [['hp_gem', 1], ['atk_gem', 1], ['elixir', 2]] },
  }),
  M({
    id: 'story_getup', kind: 'story', chapter: 8, icon: '🧥', requires: 'story_echoes',
    title: 'A Proper Get Up', giver: 'Mayor Airah', location: 'Haven City — Aurelian Hall',
    brief: 'Mayor Airah looked you over and shook her head. "You\'ve silenced the spire, yes, but if you\'re representing Haven in the capital, you need a proper get up. The university default look won\'t do for where you\'re going. Visit Madame Celeste\'s Boutique here in Haven, or the prestige Atelier in Terra City if you have the shards. Buy and equip a new cap, shirt, and pants, then return to me."',
    objective: 'Equip a new cap, shirt, and pants (different from your starting outfit) and speak to Mayor Airah',
    hint: 'Buy new clothes at the Boutique in Haven Town or the Boutique in Terra City, equip them from the Boutique mirror/counter, and return to Mayor Airah.',
    check: p => p.equippedClothes.hat !== 'default_cap' && p.equippedClothes.shirt !== 'default_shirt' && p.equippedClothes.pants !== 'default_pants',
    reward: { shards: 1000 },
  }),
  M({
    id: 'story_christine', kind: 'story', chapter: 9, icon: '🏙️', requires: 'story_getup',
    title: 'The Mayor of Terra City', giver: 'Mayor Airah', location: 'Terra City — North-West',
    brief: 'With your new style approved, Mayor Airah handed you a sealed proposal. "Much better. Now, take the Aetherline to Terra City. You must present this proposal to Mayor Christine. You can find her in the new civic building in the North-West side of Terra City. She\'s a fun one, a bit of joker, and she happens to be the cousin of Aljay the Dawnflame. She can grant us access to the ancient dungeon we need."',
    objective: 'Deliver Mayor Airah\'s proposal to Mayor Christine in Terra City',
    hint: 'Take the Pod to Terra City, go to the large 3-floor building in the North-West, climb to the top floor, and speak with Mayor Christine.',
    check: p => !!p.flags['met_christine'],
    onComplete: p => {
      p.flags['dragon_tear_quest_unlocked'] = true;
    },
    reward: { shards: 1500 },
  }),
  M({
    id: 'story_hyujon', kind: 'story', chapter: 10, icon: '🏙️', requires: 'story_christine',
    title: 'The Forgotten Tech-City', giver: 'Mayor Christine', location: 'Hyujon',
    brief: 'With the ancient dungeon unsealed, Mayor Christine points you north to the dark, forgotten tech-city of Hyujon. Find Doctor Clyde—Aljay\'s old friend—in his abandoned laboratory on the west side, and learn what he knows about Ghandra and the Aether Line.',
    objective: 'Speak with Doctor Clyde in his laboratory in Hyujon',
    hint: 'Travel to the Forgotten Tech-City of Hyujon on the overworld map, find Doctor Clyde\'s laboratory on the West side, and speak with him.',
    check: p => !!p.flags['met_clyde'],
    reward: { shards: 1500 },
  }),
  M({
    id: 'story_drowned_terminal', kind: 'story', chapter: 11, icon: '🏰', requires: 'story_hyujon',
    title: 'The Lantern of the North', giver: 'Marshal Kovar', location: 'Hyujon',
    brief: 'Doctor Clyde told you that the 3rd Harmonik notes are locked in the Drowned Terminal under Hyujon. However, the terminal is flooded and locked down. You must meet Marshal Ines Kovar and Archivist Tem in the city plaza, unlock the Drowned Terminal, defeat Vormaela\'s Echo, and retrieve the notes.',
    objective: 'Conquer the Drowned Terminal and retrieve the 3rd Harmonik',
    hint: 'Interrogate the defector in the harbor cells, help Tem scan the crater, input the override code at Marshal Kovar, then clear the Drowned Terminal dungeon.',
    check: p => (p.dungeonClears['drowned_terminal'] ?? 0) >= 1,
    progress: p => [Math.min(1, p.dungeonClears['drowned_terminal'] ?? 0), 1],
    onComplete: p => {
      p.flags['clyde_3rd_harmonik'] = true;
      p.addItem('third_harmonik');
      p.addItem('tems_backup');
    },
    reward: { shards: 4500, items: [['prism_gem', 1]] },
  }),
  M({
    id: 'story_aether_evo', kind: 'story', chapter: 12, icon: '📜', requires: 'story_drowned_terminal',
    title: 'The 3rd Harmonik', giver: 'Doctor Clyde', location: 'Haven City — Sanctum',
    brief: 'Doctor Clyde handed you the "3rd Harmonik", a complex compilation of notes detailing Ghandra\'s frequencies. Take these notes to the Aurelian Fusion Laboratory (the Sanctum) in Haven Town to study how to unlock "Aether Evo" for your Guardians.',
    objective: 'Deliver the 3rd Harmonik notes to the Haven City Sanctum',
    hint: 'Go back to Haven City, enter the Sanctum, and present Doctor Clyde\'s notes to the Sanctum Keeper or Fusion server.',
    check: p => !!p.flags['aether_evo_unlocked'],
    reward: { shards: 2000, items: [['prism_gem', 1]] },
  }),

  // ============ ACT V — THE FORETALES (the Anomalies Saga, Part Four) ============
  // After Ivan Lawrence's name is cleared from New Salmonan's relay
  // tower, the veil starts to fall: the Sponsors were one finger of a
  // larger hand. Foretales — the network on every crystal and pier —
  // has been writing the news BEFORE it happens for sixteen years:
  // buried events, hidden funding, manipulated polls, no proper
  // continental leaders since. And through it all they glaze the Big
  // Three with soft-lit documentaries… because they are not allowed
  // to touch them. Not yet. Soon.
  // TODO(acts II–IV): re-anchor `requires` to 'story_ivan' (Ch XXI)
  // once the intervening chapters are implemented.
  M({
    id: 'story_veilfall', kind: 'story', chapter: 13, icon: '📡', requires: 'story_aether_evo',
    title: 'The Veil, Falling', giver: 'Ivan Lawrence', location: 'New Salmonan',
    brief: 'Thirty-six hours. That\'s how long the truth got to breathe. Then every broadcast crystal on four continents lit up with the same calm anchors and the same swelling music: "THE LAWRENCE TAPES — A FORGERY?" The valley that watched the real broadcast go out from its own battered tower now watches the world be told it never happened. Ivan isn\'t even angry. "This is the machine, friend. I just never thought I\'d get to show somebody the gears while they turn." Find the gears: the override stamp in Esta\'s relay logs, the festival crystal Auntie Dalisay\'s nephew recorded LIVE before the aired version was rewritten — and the Foretales stringer who has been sketching the mural and asking the children questions.',
    objective: 'Gather three proofs of the Foretales override in New Salmonan, then bring them to Ivan',
    hint: 'Relay-Keeper Esta at the tower; Auntie Dalisay in the market; the stranger by the river-gate mural. Then Ivan, on his porch.',
    check: p => !!p.flags['salm_proof_relay'] && !!p.flags['salm_proof_crystal'] && !!p.flags['salm_proof_stringer'],
    progress: p => [(p.flags['salm_proof_relay'] ? 1 : 0) + (p.flags['salm_proof_crystal'] ? 1 : 0) + (p.flags['salm_proof_stringer'] ? 1 : 0), 3],
    onComplete: p => { p.flags['mirrorhouse_unlocked'] = true; },
    reward: { shards: 6000, items: [['override_ledger', 1], ['elixir', 2]] },
  }),
  M({
    id: 'story_mirrorhouse', kind: 'story', chapter: 14, icon: '🪞', requires: 'story_veilfall',
    title: 'The Mirrorhouse', giver: 'Ivan Lawrence', location: 'The Mirrorhouse, above New Salmonan',
    brief: 'Every story the eastern valleys have read for sixteen years passed through one building: a relay-bastion of black glass on the ridge upriver, humming day and night. The locals call it the Mirrorhouse, because whatever you carry up that road, the world is shown something else. Esta\'s logs say the Lawrence rewrite was stamped THERE — same override signature, FT-PRIME, that wiped a certain someone\'s records once. Ivan walks you to the ridge stair and stops at the first step, fists shaking, smiling anyway. "Nine years I couldn\'t look at this building. Go in. Find the master spool — the one they print TOMORROW from. And tamer… check the date on the directive about my match-fixing. I want to know how long before my fall they wrote it."',
    objective: 'Conquer the Mirrorhouse and extract the Continuity Reel',
    hint: 'The ridge stair climbs from New Salmonan\'s north-east valley wall. Five floors of dead glass, warden Lv 54 — this is no county printing press. Report back to Ivan.',
    check: p => (p.dungeonClears['mirrorhouse'] ?? 0) >= 1,
    progress: p => [Math.min(1, p.dungeonClears['mirrorhouse'] ?? 0), 1],
    onComplete: p => { p.flags['veil_fallen'] = true; },
    reward: { shards: 9000, items: [['continuity_reel', 1], ['hp_gem', 1], ['wis_gem', 1], ['elixir', 2]] },
  }),
];

// ---------------- guild main quests ----------------
// Every house runs the same spine (prove yourself → the Vault →
// grow your family → the Stormspire) but tells its own chapter
// of the Legion story.

const MAIN_QUESTS: QuestDef[] = [
  // ===== Pyrelight — the Ember Court =====
  M({
    id: 'pyrelight_m1', kind: 'main', houseId: 'pyrelight',
    title: 'Kindling', giver: 'Master Bren', location: 'House Pyrelight, Haven City',
    brief: 'Master Bren pressed a cold torch into your hands. "Fifteen years ago, Aljay the Dawnflame lit his first torch in this very hall — yes, THE Aljay, and no, I will not show you where he carved his name. Win three battles in the wild. Every legend\'s first page looks exactly like yours."',
    objective: 'Win 3 battles', check: p => p.battlesWon >= 3,
    reward: { shards: 250, items: [['tonic', 2]] },
  }),
  M({
    id: 'pyrelight_m2', kind: 'main', houseId: 'pyrelight', requires: 'pyrelight_m1',
    title: 'The Drowned Fire', giver: 'Master Bren', location: 'Sunken Vault',
    brief: '"The corruption in the Sunken Vault is not natural rot — it is Legion residue, seeping through Onnel\'s seal like smoke under a door. Gravemaw was a loyal warden before that filth touched it. Conquer the Vault, and the Ember Court will know how thin the seal has truly worn."',
    objective: 'Conquer the Sunken Vault', check: p => (p.dungeonClears['sunken'] ?? 0) >= 1,
    reward: { shards: 600, items: [['atk_gem', 1]] },
  }),
  M({
    id: 'pyrelight_m3', kind: 'main', houseId: 'pyrelight', requires: 'pyrelight_m2',
    title: 'Carry the Flame', giver: 'Master Bren', location: 'The wilds of Aurel',
    brief: '"When Aljay walked into Ghandra, he didn\'t go alone — he went with friends he had won, not caught. The Houses were built to raise tamers ready for the day the seal fails. Win the hearts of three wild Guardians. That is how armies against the Legion are made."',
    objective: 'Befriend 3 wild Guardians', check: p => p.capturesMade >= 3,
    reward: { shards: 800, items: [['star_treat', 2]] },
  }),
  M({
    id: 'pyrelight_m4', kind: 'main', houseId: 'pyrelight', requires: 'pyrelight_m3',
    title: 'Storm Against Fire', giver: 'Master Bren', location: 'Stormspire Depths',
    brief: '"The Stormspire\'s war-engine has begun counting again — and the count is a Legion signal, coming from inside Ghandra. Ashkarath\'s cinder-cult worshipped engines like it in the war. Silence it, Torchbearer. Aljay would be proud — and one day, I suspect, he\'ll tell you so himself."',
    objective: 'Conquer the Stormspire Depths', check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    reward: { shards: 2000, items: [['hp_gem', 1], ['elixir', 1]] },
  }),

  // ===== Mistveil — the Tidebound Circle =====
  M({
    id: 'mistveil_m1', kind: 'main', houseId: 'mistveil',
    title: 'Three Ripples', giver: 'Mistress Sera', location: 'House Mistveil, Haven City',
    brief: 'Mistress Sera poured tea and watched the rings spread. "Fifteen years ago I read the Legion War in this same bowl — three ripples, three friends, one sealed door. Now I see three new ripples. Show me three victories, and we will learn whether the water means you."',
    objective: 'Win 3 battles', check: p => p.battlesWon >= 3,
    reward: { shards: 250, items: [['soda', 2]] },
  }),
  M({
    id: 'mistveil_m2', kind: 'main', houseId: 'mistveil', requires: 'mistveil_m1',
    title: 'What the Water Keeps', giver: 'Mistress Sera', location: 'Sunken Vault',
    brief: '"The Vault\'s water does not ripple right — it ripples the way Ghandra\'s seas did, in the war. Vormaela\'s Drowned Choir sang to waters like these once. Conquer the Vault and bring me one still cupful. The Circle must measure how much of the Legion is leaking through."',
    objective: 'Conquer the Sunken Vault', check: p => (p.dungeonClears['sunken'] ?? 0) >= 1,
    reward: { shards: 600, items: [['wis_gem', 1]] },
  }),
  M({
    id: 'mistveil_m3', kind: 'main', houseId: 'mistveil', requires: 'mistveil_m2',
    title: 'The Gathering Pool', giver: 'Mistress Sera', location: 'The wilds of Aurel',
    brief: '"Onnel\'s seal was not woven from power. It was woven from trust — every friend the three had ever made, braided into one knot. Earn the trust of three wild Guardians. Each true bond in the world is another thread holding Ghandra shut."',
    objective: 'Befriend 3 wild Guardians', check: p => p.capturesMade >= 3,
    reward: { shards: 800, items: [['honey_roll', 3]] },
  }),
  M({
    id: 'mistveil_m4', kind: 'main', houseId: 'mistveil', requires: 'mistveil_m3',
    title: 'Drown the Thunder', giver: 'Mistress Sera', location: 'Stormspire Depths',
    brief: '"My stillwater bowl shows the spire\'s engine counting down — and behind the count, a vast shape pressed against the seal, listening. The Rift-Herald, perhaps. Still water outlasts every storm, Tidecaller. Go and remind the Legion of it."',
    objective: 'Conquer the Stormspire Depths', check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    reward: { shards: 2000, items: [['hp_gem', 1], ['elixir', 1]] },
  }),

  // ===== Thornward — the Greenwall Covenant =====
  M({
    id: 'thornward_m1', kind: 'main', houseId: 'thornward',
    title: 'Breaking Soil', giver: 'Warden Oakes', location: 'House Thornward, Haven City',
    brief: 'Warden Oakes handed you a trowel along with your orders. "Onnel the Worldroot trained in this grove — we keep their chair empty at every feast, in case they wander home. Strength is grown, not granted. Three honest victories, and rest your Guardians between them."',
    objective: 'Win 3 battles', check: p => p.battlesWon >= 3,
    reward: { shards: 250, items: [['berry', 4]] },
  }),
  M({
    id: 'thornward_m2', kind: 'main', houseId: 'thornward', requires: 'thornward_m1',
    title: 'Roots Below the Sea', giver: 'Warden Oakes', location: 'Sunken Vault',
    brief: '"What grows in the Vault\'s dark is not of this world\'s soil. It is Bramblehex\'s rot — the Rotwarden\'s touch, bleeding through the seal Onnel wove. Clear the Vault, and look closely at what grows down there. The Covenant must know its enemy\'s garden."',
    objective: 'Conquer the Sunken Vault', check: p => (p.dungeonClears['sunken'] ?? 0) >= 1,
    reward: { shards: 600, items: [['def_gem', 1]] },
  }),
  M({
    id: 'thornward_m3', kind: 'main', houseId: 'thornward', requires: 'thornward_m2',
    title: 'The Orchard of Strangers', giver: 'Warden Oakes', location: 'The wilds of Aurel',
    brief: '"Onnel\'s seal is fed by friendship — truly, that is how it was woven, and why the Houses teach bonding before battling. Befriend three wild Guardians. Plant trust, water it with patience, and the Greenwall grows taller without a single stone."',
    objective: 'Befriend 3 wild Guardians', check: p => p.capturesMade >= 3,
    reward: { shards: 800, items: [['star_treat', 2]] },
  }),
  M({
    id: 'thornward_m4', kind: 'main', houseId: 'thornward', requires: 'thornward_m3',
    title: 'The Lightning-Struck Tree', giver: 'Warden Oakes', location: 'Stormspire Depths',
    brief: '"The Stormspire stands where the Great Grove burned in the Legion War — Voltrazar\'s tempest did that, before Greggy grounded the tyrant for good. Now the spire\'s engine wakes to a Legion signal. End it, Grovekeeper, and we will finally plant on that hill again."',
    objective: 'Conquer the Stormspire Depths', check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    reward: { shards: 2000, items: [['hp_gem', 1], ['elixir', 1]] },
  }),

  // ===== Stormcall — the Thunder Legion =====
  M({
    id: 'stormcall_m1', kind: 'main', houseId: 'stormcall',
    title: 'Live Fire Exercise', giver: 'Captain Vex', location: 'House Stormcall, Haven City',
    brief: 'Captain Vex stamped your orders with a spark. "Greggy the Stormheart drilled in this bastion — his coil schematics still hang in the mess. Drills end today, recruit. Three field victories, by the book: assess, strike, withdraw. The Legion that guards is named after the legion we beat. Never forget which is which."',
    objective: 'Win 3 battles', check: p => p.battlesWon >= 3,
    reward: { shards: 250, items: [['cell', 2]] },
  }),
  M({
    id: 'stormcall_m2', kind: 'main', houseId: 'stormcall', requires: 'stormcall_m1',
    title: 'Silence the Deep Battery', giver: 'Captain Vex', location: 'Sunken Vault',
    brief: '"Intelligence says the Vault\'s warden is drawing power from an imperial battery that should have died centuries ago — and the corrosion patterns match Legion residue from the Ghandra front. The seal is sweating, recruit. Take Gravemaw off the grid. That\'s your mission."',
    objective: 'Conquer the Sunken Vault', check: p => (p.dungeonClears['sunken'] ?? 0) >= 1,
    reward: { shards: 600, items: [['spd_gem', 1]] },
  }),
  M({
    id: 'stormcall_m3', kind: 'main', houseId: 'stormcall', requires: 'stormcall_m2',
    title: 'Recruitment Drive', giver: 'Captain Vex', location: 'The wilds of Aurel',
    brief: '"When the seal breaks — and the brass say IF, but soldiers say WHEN — the world will need more than three heroes. It will need every bonded pair on four continents. Bring three wild Guardians into your unit. Volunteers only. That\'s how Greggy did it."',
    objective: 'Befriend 3 wild Guardians', check: p => p.capturesMade >= 3,
    reward: { shards: 800, items: [['honey_roll', 3]] },
  }),
  M({
    id: 'stormcall_m4', kind: 'main', houseId: 'stormcall', requires: 'stormcall_m3',
    title: 'The Last Order', giver: 'Captain Vex', location: 'Stormspire Depths',
    brief: '"The Stormspire engine isn\'t obeying a dead empire anymore — it\'s answering a live signal, and the signal comes from inside Ghandra. Voltrazar is tapping on the walls of its cell. Rescind the engine\'s order, Storm Sergeant. Whatever it takes. The Stormheart is watching all of us."',
    objective: 'Conquer the Stormspire Depths', check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    reward: { shards: 2000, items: [['hp_gem', 1], ['elixir', 1]] },
  }),

  // ===== Duskwatch — the Veiled Order =====
  M({
    id: 'duskwatch_m1', kind: 'main', houseId: 'duskwatch',
    title: 'Three Quiet Lessons', giver: 'Keeper Nyx', location: 'House Duskwatch, Haven City',
    brief: 'Keeper Nyx spoke without turning around. "The Order watched the Legion mass in Ghandra for three years before anyone believed us. We watched three friends end it in one. Win three battles. I will not watch you do it — and yet I will know everything about how you did. First lesson."',
    objective: 'Win 3 battles', check: p => p.battlesWon >= 3,
    reward: { shards: 250, items: [['berry', 3]] },
  }),
  M({
    id: 'duskwatch_m2', kind: 'main', houseId: 'duskwatch', requires: 'duskwatch_m1',
    title: 'The Unblinking Dark', giver: 'Keeper Nyx', location: 'Sunken Vault',
    brief: '"Something in the Sunken Vault has been watching back lately. The dark down there has a texture we last catalogued at the Ghandra breach — Nyxghul\'s texture, the Hollow Crown. It cannot be him. The seal holds. Conquer the Vault and tell me, very precisely, what you feel watched by."',
    objective: 'Conquer the Sunken Vault', check: p => (p.dungeonClears['sunken'] ?? 0) >= 1,
    reward: { shards: 600, items: [['wis_gem', 1]] },
  }),
  M({
    id: 'duskwatch_m3', kind: 'main', houseId: 'duskwatch', requires: 'duskwatch_m2',
    title: 'Eyes in the Hedgerows', giver: 'Keeper Nyx', location: 'The wilds of Aurel',
    brief: '"The wild ones felt the Legion coming weeks before our best watchers did, fifteen years ago. They are the world\'s true sentries. Earn the trust of three of them. The shy ones notice everything; befriend those first."',
    objective: 'Befriend 3 wild Guardians', check: p => p.capturesMade >= 3,
    reward: { shards: 800, items: [['star_treat', 2]] },
  }),
  M({
    id: 'duskwatch_m4', kind: 'main', houseId: 'duskwatch', requires: 'duskwatch_m3',
    title: 'Count the Moon Twice', giver: 'Keeper Nyx', location: 'Stormspire Depths',
    brief: '"Our first ledger entry ends: \'…and that is why the moon must be counted twice.\' The sentence begins inside the Stormspire, etched on the war-engine — and the Order now believes it is a warning about Ghandra\'s seal. Read it. Silence the engine. Then make sure nothing else ever reads it."',
    objective: 'Conquer the Stormspire Depths', check: p => (p.dungeonClears['stormspire'] ?? 0) >= 1,
    reward: { shards: 2000, items: [['hp_gem', 1], ['elixir', 1]] },
  }),
];

// ---------------- university side quests ----------------
const SIDE_QUESTS: QuestDef[] = [
  M({
    id: 'side_chef', kind: 'side',
    title: 'A Pinch of Sweetness', giver: 'Chef Marlo', location: 'University Cafeteria',
    brief: 'Chef Marlo swears he once fed Greggy the Stormheart an entire week\'s rations in one sitting — "the man ate like a thundercloud." Tomorrow is his legendary Berry Glaze Day and the pantry is empty. He needs three Sweet Berries, fresh, "and don\'t you dare bruise them."',
    objective: 'Bring 3 Sweet Berries to Chef Marlo',
    check: p => p.itemCount('berry') >= 3,
    onComplete: p => p.removeItem('berry', 3),
    reward: { shards: 220, items: [['honey_roll', 2]] },
  }),
  M({
    id: 'side_wrench', kind: 'side',
    title: 'The Janitor\'s Pride', giver: 'Old Tomas', location: 'University Lobby / Locker Room',
    brief: 'Old Tomas has swept the University for forty years with the same brass wrench on his belt. He claims Greggy himself left it behind after fixing the lobby boiler during the Legion War — "signed the handle and everything, look— well, it\'s worn off now." Some first-year "borrowed" it and left it in the Locker Room.',
    objective: 'Find the brass wrench in the Locker Room and return it',
    check: p => !!p.flags['found_wrench'],
    reward: { shards: 180, items: [['plating', 1]] },
  }),
  M({
    id: 'side_quiz', kind: 'side',
    title: 'Pop Quiz', giver: 'Professor Lyra', location: 'University Classroom',
    brief: 'Professor Lyra wrote the standard text on elemental theory — the same ten-element table Aljay\'s trio used to dismantle the Corrupted Legion, she will remind you, twice. She has prepared a three-question examination. Her record: 14 consecutive failures.',
    objective: 'Pass Professor Lyra\'s typing quiz',
    check: p => !!p.flags['quiz_passed'],
    reward: { shards: 300, items: [['soda', 1]] },
  }),
  M({
    id: 'side_spar', kind: 'side',
    title: 'Schoolyard Legend', giver: 'Rival Kade', location: 'University Training Hall',
    brief: 'Kade graduated top of the class one year ahead of you and claims he\'ll be "the next Aljay" — he\'s memorized every battle of the Ghandra campaign and will recite them unprompted. He\'s challenged every new graduate to a sparring match. He is currently undefeated. Currently.',
    objective: 'Defeat Kade in a sparring match',
    check: p => !!p.flags['spar_won'],
    reward: { shards: 350, items: [['atk_gem', 1]] },
  }),
  M({
    id: 'side_ledger', kind: 'side',
    title: 'Overdue', giver: 'Archivist Wren', location: 'University Library / Cafeteria',
    brief: 'Archivist Wren\'s prized Expedition Ledger — 212 years of dungeon survey notes, including the only first-hand account of the Ghandra breach — was checked out "for lunch reading" and never returned. She suspects it\'s in the cafeteria, soaking up gravy. She is beside herself.',
    objective: 'Find the Expedition Ledger in the Cafeteria and return it',
    check: p => !!p.flags['found_ledger'],
    reward: { shards: 240, items: [['cell', 2]] },
  }),
  M({
    id: 'side_niko', kind: 'side',
    title: 'A Friend for Niko', giver: 'Student Niko', location: 'University Lobby',
    brief: 'Niko sits in the corner of the lobby every day, too nervous for his first expedition — even though his bag is covered in Aljay badges and he can recite the Sealing of Ghandra word for word. He asked, very quietly, whether wild Guardians really can become friends. Show him it\'s true.',
    objective: 'Befriend a wild Guardian, then tell Niko about it',
    check: p => p.capturesMade >= 1,
    reward: { shards: 200, items: [['berry', 2]] },
  }),
  M({
    id: 'side_fishing', kind: 'side',
    title: "The Angler's Path", giver: 'Old Bait Pete', location: "Anglers' Wharf, Haven City",
    brief: 'Old Bait Pete is looking for fresh blood at the Great Pond. "Expeditions are well and good, but the real mystery lies under the ripples. Grab a rod, cast a line, and let\'s see what you can pull from the deep!"',
    objective: 'Catch 1 fish of any size',
    check: p => p.fishing.totalCaught >= 1,
    reward: { shards: 150, items: [['soda', 1]] },
  }),
  M({
    id: 'side_essa', kind: 'side', requires: 'story_agdao',
    title: "Granny Essa's Question", giver: 'Granny Essa', location: 'Haven Town — Plaza',
    brief: 'Granny Essa sitting by the Haven Town fountain has a curious question about the legendary tamer, Greggy the Stormheart: "How many battles has Greggy won?" She hints that left-clicking an NPC will bring up their Guild ID and service record. To find the answer, you must travel to Agdao Island, find Greggy on his bluff, and inspect his card.',
    objective: 'Type the exact number of battles Greggy has won for Granny Essa',
    check: p => !!p.flags['essa_question_answered'],
    onComplete: p => {
      // Reward: all Guardians in active party level up by 1 instantly
      p.party.forEach(g => {
        if (g.level < g.levelCap) {
          const before = g.stats;
          g.level++;
          g.exp = expForLevel(g.level);
          if (g.level % 5 === 0) g.techPoints++;
          const after = g.stats;
          g.hp = Math.min(after.hp, g.hp + (after.hp - before.hp));
          g.sp = Math.min(after.sp, g.sp + (after.sp - before.sp));
        }
      });
    },
    reward: { shards: 500 },
  }),
];

// ---------------- registry & state helpers ----------------
export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  [...STORY_QUESTS, ...MAIN_QUESTS, ...SIDE_QUESTS].map(q => [q.id, q]));

export const mainChain = (houseId: string): QuestDef[] =>
  MAIN_QUESTS.filter(q => q.houseId === houseId);

// derive progress bars for the repeated guild-quest patterns
const DERIVED_PROGRESS: Record<string, (p: Player) => [number, number]> = {};
for (const q of MAIN_QUESTS) {
  if (q.objective === 'Win 3 battles') DERIVED_PROGRESS[q.id] = p => [Math.min(3, p.battlesWon), 3];
  else if (q.objective.startsWith('Befriend')) DERIVED_PROGRESS[q.id] = p => [Math.min(3, p.capturesMade), 3];
  else if (q.objective.includes('Sunken Vault')) DERIVED_PROGRESS[q.id] = p => [Math.min(1, p.dungeonClears['sunken'] ?? 0), 1];
  else if (q.objective.includes('Stormspire')) DERIVED_PROGRESS[q.id] = p => [Math.min(1, p.dungeonClears['stormspire'] ?? 0), 1];
}
DERIVED_PROGRESS['side_chef'] = p => [Math.min(3, p.itemCount('berry')), 3];
DERIVED_PROGRESS['side_niko'] = p => [Math.min(1, p.capturesMade), 1];
DERIVED_PROGRESS['side_fishing'] = p => [Math.min(1, p.fishing.totalCaught), 1];

/** Numeric progress toward a quest's objective, if it can be counted. */
export function questProgress(p: Player, id: string): [number, number] | null {
  const q = QUESTS[id];
  const fn = q.progress ?? DERIVED_PROGRESS[id];
  return fn ? fn(p) : null;
}

export type QuestState = 'locked' | 'available' | 'active' | 'ready' | 'done';

export function questState(p: Player, id: string): QuestState {
  const q = QUESTS[id];
  const s = p.quests[id];
  if (s === 'done') return 'done';
  if (s === 'active') return q.check(p) ? 'ready' : 'active';
  if (q.requires && p.quests[q.requires] !== 'done') return 'locked';
  return 'available';
}

export function acceptQuest(p: Player, id: string): void {
  if (!p.quests[id]) p.quests[id] = 'active';
}

/** Apply rewards & mark done. Returns a human-readable reward summary. */
export function completeQuest(p: Player, id: string): string {
  const q = QUESTS[id];
  q.onComplete?.(p);
  p.quests[id] = 'done';
  const parts: string[] = [];
  if (q.reward.shards) { p.shards += q.reward.shards; parts.push(`◆${q.reward.shards} Shards`); }
  for (const [itemId, qty] of q.reward.items ?? []) {
    p.addItem(itemId, qty);
    parts.push(`${ITEMS[itemId].name}${qty > 1 ? ` ×${qty}` : ''}`);
  }
  recordQuestComplete(p);
  p.save();
  return parts.join(', ');
}

/** Everything the journal needs, grouped. */
export function journalEntries(p: Player): {
  story: [QuestDef, QuestState][];
  main: [QuestDef, QuestState][];
  side: [QuestDef, QuestState][];
} {
  const story = STORY_QUESTS.map(q => [q, questState(p, q.id)] as [QuestDef, QuestState]);
  const main = p.houseId ? mainChain(p.houseId).map(q => [q, questState(p, q.id)] as [QuestDef, QuestState]) : [];
  const side = SIDE_QUESTS.map(q => [q, questState(p, q.id)] as [QuestDef, QuestState]);
  return { story, main, side };
}

/**
 * Drive the Chronicle forward: auto-accept the next available chapter
 * and auto-complete chapters that need no turn-in. Returns
 * human-readable notes for the caller to toast. Safe to call often.
 */
export function syncStoryQuests(p: Player): string[] {
  if (!p.flags['exam_done'] || !p.flags['university_done']) return [];
  const notes: string[] = [];
  for (const q of STORY_QUESTS) {
    if (questState(p, q.id) === 'available') {
      acceptQuest(p, q.id);
      notes.push(`📖 The Chronicle — Chapter ${q.chapter}: ${q.title}`);
    }
    if (q.autoComplete && questState(p, q.id) === 'ready') {
      const summary = completeQuest(p, q.id);
      notes.push(`✅ Chapter ${q.chapter} complete: ${q.title}${summary ? ` (${summary})` : ''}`);
    }
  }
  if (notes.length) p.save();
  return notes;
}
