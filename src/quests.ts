// ============================================================
// AZ Tamer — Quest engine: guild main-quest chains (a unique
// storyline per Grand House) and NPC side quests.
// Quest progress lives on Player.quests / Player.flags.
//
// All quest lines orbit the same history: fifteen years ago the
// Corrupted Legion — nine four-element Guardians — massed their
// armies in Ghandra, the dimension at the center of the world.
// Aljay, Greggy and Onnel sealed them away. The five Grand
// Houses of Olivar exist so the world is ready if the seal breaks.
// The corruption rising in Aurel's ruins is that seal, thinning.
// ============================================================
import { ITEMS } from './data';
import type { Player } from './state';

export interface QuestReward { shards?: number; items?: [string, number][]; }

export interface QuestDef {
  id: string;
  kind: 'main' | 'side';
  houseId?: string;            // main quests belong to a guild
  title: string;
  giver: string;
  location: string;
  brief: string;               // journal text — the story of the quest
  objective: string;           // short imperative
  check: (p: Player) => boolean;
  onComplete?: (p: Player) => void;   // consume fetch items etc.
  reward: QuestReward;
  requires?: string;           // quest id that must be done first
}

// ---------------- guild main quests ----------------
// Every house runs the same spine (prove yourself → the Vault →
// grow your family → the Stormspire) but tells its own chapter
// of the Legion story.
const M = (q: QuestDef) => q;

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
];

// ---------------- registry & state helpers ----------------
export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  [...MAIN_QUESTS, ...SIDE_QUESTS].map(q => [q.id, q]));

export const mainChain = (houseId: string): QuestDef[] =>
  MAIN_QUESTS.filter(q => q.houseId === houseId);

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
  p.save();
  return parts.join(', ');
}

/** Everything the journal needs, grouped. */
export function journalEntries(p: Player): { main: [QuestDef, QuestState][]; side: [QuestDef, QuestState][] } {
  const main = p.houseId ? mainChain(p.houseId).map(q => [q, questState(p, q.id)] as [QuestDef, QuestState]) : [];
  const side = SIDE_QUESTS.map(q => [q, questState(p, q.id)] as [QuestDef, QuestState]);
  return { main, side };
}
