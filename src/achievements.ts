// ============================================================
// AZ Tamer — Achievements: career medals that unlock themselves
// as you play. Unlocks fire a jingle + toast; the gallery lives
// in the Tamer Data panel. Persisted via player flags (ach_*).
// ============================================================
import { DUNGEONS, STAGES } from './data';
import type { Player } from './state';
import { rankIndexFor, RANKS } from './ranks';
import { toast } from './ui';
import { sfx } from './audio';

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  check(p: Player): boolean;
}

const allGuardians = (p: Player) => [...p.party, ...p.reserve];
const stageIdx = (s: string) => STAGES.indexOf(s as typeof STAGES[number]);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', icon: '⚔️', name: 'First Blood', desc: 'Win your first battle.', check: p => p.battlesWon >= 1 },
  { id: 'win25', icon: '🗡️', name: 'Battle-Hardened', desc: 'Win 25 battles.', check: p => p.battlesWon >= 25 },
  { id: 'win75', icon: '🏟️', name: 'Arena Legend', desc: 'Win 75 battles.', check: p => p.battlesWon >= 75 },
  { id: 'first_friend', icon: '🤝', name: 'A New Friend', desc: 'Befriend your first wild Guardian.', check: p => p.capturesMade >= 1 },
  { id: 'friend5', icon: '🏡', name: 'Full House', desc: 'Befriend 5 wild Guardians.', check: p => p.capturesMade >= 5 },
  { id: 'menagerie', icon: '🐾', name: 'Menagerie', desc: 'Have 6 or more Guardians in your care.', check: p => allGuardians(p).length >= 6 },
  { id: 'first_clear', icon: '🏴', name: 'Spelunker', desc: 'Conquer any expedition.', check: p => Object.keys(p.dungeonClears).length >= 1 },
  { id: 'all_clear', icon: '🗺️', name: 'World Walker', desc: 'Conquer every expedition in Aurel.', check: p => DUNGEONS.every(d => (p.dungeonClears[d.id] ?? 0) > 0) },
  { id: 'evolved', icon: '🧬', name: 'Metamorphosis', desc: 'Raise a Guardian to Elite stage or beyond.', check: p => allGuardians(p).some(g => stageIdx(g.species.stage) >= 2) },
  { id: 'apex', icon: '🌋', name: 'Apex Tamer', desc: 'Raise a Guardian to Apex stage or beyond.', check: p => allGuardians(p).some(g => stageIdx(g.species.stage) >= 3) },
  { id: 'legend', icon: '🌟', name: 'Keeper of Legends', desc: 'Raise a Guardian to Legendary or Aether stage.', check: p => allGuardians(p).some(g => stageIdx(g.species.stage) >= 4) },
  { id: 'rich', icon: '💎', name: 'Shard Baron', desc: 'Hold 5,000 Shards at once.', check: p => p.shards >= 5000 },
  { id: 'quests5', icon: '📜', name: 'Guild Asset', desc: 'Complete 5 guild quests.', check: p => Object.values(p.quests).filter(v => v === 'done').length >= 5 },
  { id: 'rank_elite', icon: '🎖️', name: 'Elite Standing', desc: 'Reach the Elite rank.', check: p => rankIndexFor(p) >= 4 },
  { id: 'rank_captain', icon: '⭐', name: "Captain's Banner", desc: 'Reach the Captain rank.', check: p => rankIndexFor(p) >= 7 },
  { id: 'rank_chief', icon: '👑', name: 'Grand Chief of Aurel', desc: 'Reach the final rank — Grand Chief.', check: p => rankIndexFor(p) >= 8 },
  { id: 'tier3', icon: '🔧', name: 'Master Machinist', desc: 'Install any Tier-3 Crawler part.', check: p => p.crawler.owned.some(id => id.endsWith('3')) },
  { id: 'lv30', icon: '📈', name: 'Drillmaster', desc: 'Train any Guardian to level 30.', check: p => allGuardians(p).some(g => g.level >= 30) },
];

export const isUnlocked = (p: Player, id: string): boolean => !!p.flags[`ach_${id}`];
export const unlockedCount = (p: Player): number => ACHIEVEMENTS.filter(a => isUnlocked(p, a.id)).length;

let checking = false;

/**
 * Sweep all achievement conditions; toast + jingle for fresh unlocks.
 * Cheap — call after anything that changes player state (updateHUD does).
 */
export function checkAchievements(p: Player): void {
  if (checking) return;
  checking = true;
  try {
    for (const a of ACHIEVEMENTS) {
      if (!p.flags[`ach_${a.id}`] && a.check(p)) {
        p.flags[`ach_${a.id}`] = true;
        sfx('achievement');
        toast(`🏅 Achievement unlocked: ${a.icon} ${a.name}`, 'gold', 3600);
      }
    }
  } finally {
    checking = false;
  }
}

/** Gallery HTML for the Tamer Data panel. */
export function achievementsHTML(p: Player): string {
  const rows = ACHIEVEMENTS.map(a => {
    const got = isUnlocked(p, a.id);
    return `<div class="ach-row ${got ? 'got' : ''}" title="${a.desc}">
      <span class="ach-icon">${got ? a.icon : '🔒'}</span>
      <span class="ach-body"><b>${a.name}</b><span class="sub">${a.desc}</span></span>
    </div>`;
  }).join('');
  return `
    <h3>🏅 Achievements — ${unlockedCount(p)}/${ACHIEVEMENTS.length}</h3>
    <div class="ach-grid">${rows}</div>`;
}
