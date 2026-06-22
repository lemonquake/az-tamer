import { Player } from './state';
import { KNOWN_NAMES, CITY_CHAMPIONS, hometownForTamer } from './tournaments';
import { WORLD_GUILDS } from './lore';
import { toast } from './ui';
import { SPECIES } from './data';
import { aeYear } from './calendar';

export interface ContestantMMR {
  id: string;
  name: string;
  rating: number;
  title: string;
  hometown: string;
  guildId: string;
  color: string;
  speciesIds: string[];
  wins: number;
  losses: number;
  isPlayer?: boolean;
  isLegend?: boolean;
}

export interface MMRState {
  contestants: Record<string, ContestantMMR>;
  visitsCount: number;
  playerRating: number;
  /** Highest rating ever reached — never falls. */
  peakRating?: number;
}

// ============================================================
// THE COMPETITIVE DIVISIONS — a named ladder over raw MMR.
// Shared by the leaderboard, the trophy case, and milestone rewards.
// ============================================================
export interface Division { name: string; color: string; icon: string; min: number; }
export const DIVISIONS: Division[] = [
  { name: 'Unranked', color: '#7a8694', icon: '○', min: 0 },
  { name: 'Bronze',   color: '#cd7f32', icon: '🥉', min: 1000 },
  { name: 'Silver',   color: '#c2cad6', icon: '🥈', min: 1500 },
  { name: 'Gold',     color: '#f2c14e', icon: '🥇', min: 2000 },
  { name: 'Platinum', color: '#5ee0d0', icon: '💠', min: 2500 },
  { name: 'Diamond',  color: '#5aa0ff', icon: '💎', min: 3000 },
  { name: 'Master',   color: '#b15ae8', icon: '👑', min: 4000 },
  { name: 'Legend',   color: '#ff5ab0', icon: '🌟', min: 5000 },
];
export function divisionFor(rating: number): Division {
  let d = DIVISIONS[0];
  for (const div of DIVISIONS) if (rating >= div.min) d = div;
  return d;
}

/** First-time MMR thresholds that pay a one-time Shard bonus. */
const MMR_MILESTONES = [1500, 2000, 2400, 2800, 3200, 4000, 5000];
function awardMMRMilestones(p: Player, oldR: number, newR: number): void {
  for (const m of MMR_MILESTONES) {
    if (oldR < m && newR >= m) {
      const flag = `mmr_milestone_${m}`;
      if (p.flags[flag]) continue;
      p.flags[flag] = true;
      const reward = Math.round(m * 1.5);
      p.shards += reward;
      const div = divisionFor(m);
      toast(`🏅 MMR MILESTONE — ${m.toLocaleString()} reached! Welcome to ${div.icon} ${div.name}. +◆${reward.toLocaleString()}`, 'gold', 5200);
    }
  }
}

// Module-level variables for local UI filters state
let leaderboardPage = 0;
let leaderboardFilter = 'all'; // 'all', 'olivar', 'veyra', 'tharkand', 'noruun', 'sea'
let leaderboardSearch = '';
let leaderboardSort: 'rating' | 'wins' | 'winrate' = 'rating';

const winRateOf = (c: { wins: number; losses: number }): number => {
  const total = c.wins + c.losses;
  return total > 0 ? c.wins / total : 0;
};

const GUILD_SPECIES: Record<string, string[]> = {
  first_fire: ['maelstrike', 'reefguard', 'tidefin', 'infernyx', 'solarex', 'pyrofang', 'blazemaw'],
  pearlwake: ['maelstrike', 'reefguard', 'tidefin', 'nacrelord', 'leviathorn', 'abyssarch', 'puddla'],
  duneward: ['voltrazar', 'stormapex', 'raidenjin', 'pyrofang', 'blazemaw', 'infernyx'],
  aurora_lodge: ['chthonix', 'erebusilk', 'phantasmoth', 'maelstrike', 'reefguard', 'tidefin'],
  grand_houses: ['solarex', 'infernyx', 'maelstrike', 'reefguard', 'voltrazar', 'chthonix', 'thornstag'],
  filament_concord: ['raidenjin', 'voltrazar', 'stormapex', 'voltigarch', 'teslarch', 'fulgurex'],
  worldring_conclave: ['raidenjin', 'voltrazar', 'pyrofang', 'blazemaw', 'infernyx', 'solarex'],
  lumenwrights: ['voltrazar', 'stormapex', 'empyrhawk', 'tempestrix', 'voltigarch'],
  voltwake_runners: ['empyrhawk', 'tempestrix', 'voltigarch', 'teslarch', 'voltrazar'],
};

const FIRST_NAMES = ['Bram', 'Soren', 'Lira', 'Cass', 'Mira', 'Dane', 'Yael', 'Pell', 'Orin', 'Vesna', 'Hale', 'Renn', 'Sela', 'Joss', 'Tamsa', 'Edrin', 'Nyla', 'Corin', 'Wren', 'Falk', 'Isolde', 'Garrick', 'Petra', 'Loy', 'Marcus', 'Livia', 'Valen', 'Silas', 'Talia', 'Kaelen', 'Dara', 'Riona', 'Jax', 'Thorne', 'Elysia', 'Kael', 'Caelum', 'Lyra', 'Alistair', 'Seraphina'];
const SURNAMES = ['Marrow', 'Ashby', 'Vance', 'Holt', 'Quill', 'Drey', 'Stark', 'Vetch', 'Lune', 'Carrow', 'Pike', 'Wexley', 'Ferro', 'Salt', 'Bellweather', 'Crane', 'Voss', 'Thorne', 'Galt', 'Renke', 'Oster', 'Mund', 'Kessler', 'Dune', 'Locke', 'Sterling', 'Blackwood', 'Storm', 'Valerius', 'Kravitz', 'Hawthorne', 'Rider', 'Fang', 'Gale', 'Frost', 'Iron', 'Weaver', 'Ridge', 'Sunder', 'Crest'];

// ============================================================
// CAREER RECORDS — the board reads like a long, lived-in season.
// The Big-Three legends carry 1,500+ lifetime wins; Known Names a
// few hundred; city champions and the procedural field, a believable
// climb. One source of truth, used by initial-gen AND the save
// migration so old saves get upgraded the moment they load.
// ============================================================
const rndInt = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Fixed, hand-set lifetime records for the six immortals. All ≥ 1500 W. */
export const LEGEND_RECORDS: Record<string, { w: number; l: number }> = {
  aljay:  { w: 1792, l: 9 },
  greggy: { w: 1685, l: 44 },
  onnel:  { w: 1603, l: 61 },
  grand:  { w: 1547, l: 132 },
  renzo:  { w: 1521, l: 167 },
  kulz:   { w: 1508, l: 174 },
  lemon_quake: { w: 1533, l: 85 },
  roydo:  { w: 1515, l: 98 },
  blau:   { w: 1502, l: 110 },
};

/** A Known Name's deep pro career — hundreds of wins, scaled by rating. */
const knownRecord = (rating: number) => ({
  wins: Math.round(rating * 0.34) + rndInt(0, 28),
  losses: Math.round(rating * 0.045) + rndInt(5, 16),
});
/** A city champion's solid regional record. */
const cityRecord = (rating: number) => ({
  wins: Math.round(rating * 0.22) + rndInt(0, 18),
  losses: Math.round(rating * 0.06) + rndInt(6, 16),
});
/** A procedural circuit member — a real, if modest, history. */
const proceduralRecord = (rating: number) => ({
  wins: Math.round(rating * 0.12) + rndInt(0, 14),
  losses: Math.round(Math.max(60, 1650 - rating) * 0.06) + rndInt(3, 11),
});

export function getNation(hometown: string): string {
  const lower = hometown.toLowerCase();
  if (lower.includes('haven')) return 'Olivar';
  if (lower.includes('agdao') || lower.includes('sea') || lower.includes('west')) return 'Western Sea';
  if (lower.includes('veyra')) return 'Veyra';
  if (lower.includes('terra') || lower.includes('tharkand')) return 'Tharkand';
  if (lower.includes('noruun')) return 'Noruun';
  return 'Olivar';
}

export function generateInitialMMR(p: Player): MMRState {
  const contestants: Record<string, ContestantMMR> = {};
  
  // 1. Add historical legends (Aljay, Greggy, Onnel)
  contestants['aljay'] = {
    id: 'aljay',
    name: 'Aljay Leodones',
    rating: 5600,
    title: 'The Dawnflame · Legend',
    hometown: 'Haven City',
    guildId: 'grand_houses',
    color: '#f2603a',
    speciesIds: ['firgara', 'onthrofa', 'vulfenix'],
    wins: LEGEND_RECORDS.aljay.w,
    losses: LEGEND_RECORDS.aljay.l,
    isLegend: true
  };
  
  contestants['greggy'] = {
    id: 'greggy',
    name: 'Greggy the Stormheart',
    rating: 4400,
    title: 'The Stormheart · Legend',
    hometown: 'Agdao Island',
    guildId: 'first_fire',
    color: '#f2d23a',
    speciesIds: ['raijura', 'voltherion', 'fulgrath'],
    wins: LEGEND_RECORDS.greggy.w,
    losses: LEGEND_RECORDS.greggy.l,
    isLegend: true
  };

  contestants['onnel'] = {
    id: 'onnel',
    name: 'Onnel the Worldroot',
    rating: 4300,
    title: 'The Worldroot · Legend',
    hometown: 'Haven City',
    guildId: 'grand_houses',
    color: '#4ec45e',
    speciesIds: ['verdalune', 'gaiathorn', 'nyxroot'],
    wins: LEGEND_RECORDS.onnel.w,
    losses: LEGEND_RECORDS.onnel.l,
    isLegend: true
  };

  // 2. Add other legends (Grand, Renzo, Kulz)
  contestants['grand'] = {
    id: 'grand',
    name: 'Grand',
    rating: 3300,
    title: 'The First Shield · Legend',
    hometown: 'Haven City',
    guildId: 'grand_houses',
    color: '#f2c14e',
    speciesIds: ['thicketclaw', 'sylvigor', 'thornstag'],
    wins: LEGEND_RECORDS.grand.w,
    losses: LEGEND_RECORDS.grand.l,
    isLegend: true
  };

  contestants['renzo'] = {
    id: 'renzo',
    name: 'Renzo',
    rating: 3100,
    title: 'The Sea Leviathan · Legend',
    hometown: 'Agdao Island',
    guildId: 'first_fire',
    color: '#3a9df2',
    speciesIds: ['maelstrike', 'reefguard', 'tidefin'],
    wins: LEGEND_RECORDS.renzo.w,
    losses: LEGEND_RECORDS.renzo.l,
    isLegend: true
  };

  contestants['kulz'] = {
    id: 'kulz',
    name: 'Kulz',
    rating: 3080,
    title: 'The Sparksmith · Legend',
    hometown: 'Terra City',
    guildId: 'filament_concord',
    color: '#4fe0ff',
    speciesIds: ['teslarch', 'gravemonolith', 'fulgurex'],
    wins: LEGEND_RECORDS.kulz.w,
    losses: LEGEND_RECORDS.kulz.l,
    isLegend: true
  };

  contestants['lemon_quake'] = {
    id: 'lemon_quake',
    name: 'Lemon Quake',
    rating: 3150,
    title: 'The Creator · Legend',
    hometown: 'Terra City',
    guildId: 'lumenwrights',
    color: '#ff5aa8',
    speciesIds: ['ignisar', 'solphyra', 'vulkragon'],
    wins: LEGEND_RECORDS.lemon_quake.w,
    losses: LEGEND_RECORDS.lemon_quake.l,
    isLegend: true
  };

  contestants['roydo'] = {
    id: 'roydo',
    name: 'Roydo',
    rating: 3120,
    title: 'The Storm Weaver · Legend',
    hometown: 'Terra City',
    guildId: 'filament_concord',
    color: '#4fe0ff',
    speciesIds: ['teslarch', 'stormapex', 'fulgurex'],
    wins: LEGEND_RECORDS.roydo.w,
    losses: LEGEND_RECORDS.roydo.l,
    isLegend: true
  };

  contestants['blau'] = {
    id: 'blau',
    name: 'Blau',
    rating: 3050,
    title: 'The Deep Frost · Legend',
    hometown: 'Noruun',
    guildId: 'aurora_lodge',
    color: '#9adff2',
    speciesIds: ['chthonix', 'erebusilk', 'phantasmoth'],
    wins: LEGEND_RECORDS.blau.w,
    losses: LEGEND_RECORDS.blau.l,
    isLegend: true
  };

  // 3. Add Known Names
  KNOWN_NAMES.forEach(k => {
    let rating = 1500;
    if (k.id === 'azrin') rating = 2300;
    else if (k.id === 'ezekiel') rating = 2130;
    else if (k.id === 'azrael') rating = 2090;
    else if (k.id === 'raphael') rating = 2000;
    else if (k.id === 'clyde_b') rating = 1900;
    else if (k.id === 'anthony_o') rating = 1850;
    else if (k.id === 'louie_b') rating = 1800;
    else if (k.id === 'paulo_b') rating = 1750;
    else if (k.id === 'ivan_lawrence') rating = 1700;
    else if (k.id === 'maris') rating = 1650;

    contestants[k.id] = {
      id: k.id,
      name: k.name,
      rating,
      title: `${k.epithet} · ${WORLD_GUILDS.find(g => g.id === k.guildId)?.name || 'Guild'}`,
      hometown: hometownForTamer(k.id),
      guildId: k.guildId,
      color: k.color,
      speciesIds: k.team,
      ...knownRecord(rating),
    };
  });

  // 4. Add City Champions
  CITY_CHAMPIONS.forEach(c => {
    if (contestants[c.id]) return;
    const rating = 1500 + Math.floor(Math.random() * 80);
    contestants[c.id] = {
      id: c.id,
      name: c.name,
      rating,
      title: `${c.epithet} · ${c.city}`,
      hometown: c.city,
      guildId: c.guildId,
      color: c.color,
      speciesIds: c.team,
      ...cityRecord(rating),
    };
  });

  // 5. Generate Procedurals to get to at least 300 total contestants
  const usedNames = new Set<string>();
  KNOWN_NAMES.forEach(k => usedNames.add(k.name));
  CITY_CHAMPIONS.forEach(c => usedNames.add(c.name));
  usedNames.add('Aljay Leodones');
  usedNames.add('Greggy the Stormheart');
  usedNames.add('Onnel the Worldroot');
  usedNames.add('Grand');
  usedNames.add('Renzo');
  usedNames.add('Kulz');

  const targetTotal = 310;
  let currentCount = Object.keys(contestants).length;
  
  while (currentCount < targetTotal) {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const fullName = `${first} ${last}`;
    if (usedNames.has(fullName)) continue;
    usedNames.add(fullName);

    const guild = WORLD_GUILDS[Math.floor(Math.random() * WORLD_GUILDS.length)];
    const rating = 800 + Math.floor(Math.random() * 650); // 800 to 1450
    const id = `procedural_${currentCount}_${Math.random().toString(36).substr(2, 5)}`;
    
    const pool = GUILD_SPECIES[guild.id] || ['cindcub', 'pyrofang', 'blazemaw'];
    const speciesIds: string[] = [];
    const size = 2 + Math.floor(Math.random() * 2);
    for (let s = 0; s < size; s++) {
      speciesIds.push(pool[Math.floor(Math.random() * pool.length)]);
    }

    contestants[id] = {
      id,
      name: fullName,
      rating,
      title: guild.name,
      hometown: guild.seat,
      guildId: guild.id,
      color: guild.color,
      speciesIds,
      ...proceduralRecord(rating),
    };

    currentCount++;
  }

  // 6. Add Player
  contestants['player'] = {
    id: 'player',
    name: p.tamerName,
    rating: 1200,
    title: 'You',
    hometown: 'Haven City',
    guildId: p.houseId ?? 'grand_houses',
    color: '#f2c14e',
    speciesIds: p.party.map(g => g.speciesId),
    wins: p.battlesWon,
    losses: 0,
    isPlayer: true
  };

  return {
    contestants,
    visitsCount: 0,
    playerRating: 1200
  };
}

/**
 * Migrate older saves whose board was generated before the big-record
 * rework. Detected by the Dawnflame carrying fewer than 1,500 wins —
 * impossible under the new formula. Re-derives every NPC's lifetime
 * record from its current rating; the player's row is left untouched.
 */
export function upgradeStaleRecords(mmrState: MMRState): boolean {
  const aljay = mmrState.contestants['aljay'];
  if (!aljay || aljay.wins >= 1500) return false; // already current

  for (const c of Object.values(mmrState.contestants)) {
    if (c.isPlayer) continue;
    if (LEGEND_RECORDS[c.id]) {
      c.wins = LEGEND_RECORDS[c.id].w;
      c.losses = LEGEND_RECORDS[c.id].l;
    } else if (c.isLegend) {
      c.wins = Math.max(1500, Math.round(c.rating * 0.32));
      c.losses = Math.round(c.rating * 0.03) + rndInt(20, 90);
    } else if (c.id.startsWith('procedural_') || c.id.startsWith('pro_') || c.id.startsWith('wc_')) {
      Object.assign(c, proceduralRecord(c.rating));
    } else if (c.title && /·\s/.test(c.title) && c.rating >= 1600) {
      Object.assign(c, knownRecord(c.rating)); // Known Names carry a "· Guild" title and high rating
    } else {
      Object.assign(c, cityRecord(c.rating));
    }
  }
  return true;
}

export function getMMRState(p: Player): MMRState {
  if (!p.mmrState) {
    p.mmrState = generateInitialMMR(p);
  } else if (upgradeStaleRecords(p.mmrState)) {
    p.save(false);
  }
  return p.mmrState;
}

/** Ensure the player's own row exists in the board (idempotent). */
function ensurePlayerContestant(p: Player): ContestantMMR {
  const mmrState = getMMRState(p);
  let pt = mmrState.contestants['player'];
  if (!pt) {
    pt = {
      id: 'player',
      name: p.tamerName,
      rating: mmrState.playerRating || 1200,
      wins: p.battlesWon,
      losses: 0,
      title: 'You',
      hometown: 'Haven City',
      guildId: p.houseId ?? 'grand_houses',
      color: '#f2c14e',
      speciesIds: p.party.map(g => g.speciesId),
      isPlayer: true,
    };
    mmrState.contestants['player'] = pt;
  }
  return pt;
}

/** The player's current ladder rating (MMR). */
export function getPlayerMMR(p: Player): number {
  return getMMRState(p).playerRating ?? 1200;
}

/** The player's all-time peak rating — never falls. */
export function getPlayerPeakMMR(p: Player): number {
  const s = getMMRState(p);
  return Math.max(s.peakRating ?? 0, s.playerRating ?? 1200);
}

/**
 * Every battle moves the ladder: a win pays +10–25 MMR, a loss costs
 * 10–25 (floored at 100). Used by ordinary overworld battles — sanctioned
 * tournament bouts run the richer Elo model in updatePlayerElo instead.
 */
export function recordBattleMMR(p: Player, won: boolean): number {
  const mmrState = getMMRState(p);
  const pt = ensurePlayerContestant(p);
  const magnitude = 10 + Math.floor(Math.random() * 16); // 10..25
  const delta = won ? magnitude : -magnitude;
  const old = mmrState.playerRating;
  mmrState.playerRating = Math.max(100, old + delta);
  pt.rating = mmrState.playerRating;
  if (won) pt.wins++; else pt.losses++;
  mmrState.peakRating = Math.max(mmrState.peakRating ?? 0, mmrState.playerRating);
  awardMMRMilestones(p, old, mmrState.playerRating);
  p.save(false);

  const applied = mmrState.playerRating - old;
  toast(
    `${won ? '📈' : '📉'} MMR ${old} ➔ ${mmrState.playerRating} (${applied >= 0 ? '+' : ''}${applied})`,
    won ? 'gold' : 'red',
    3000
  );
  return mmrState.playerRating;
}

/** Cheat / debug — force the player's MMR to an exact value. */
export function setPlayerMMR(p: Player, value: number): number {
  const mmrState = getMMRState(p);
  const v = Math.max(0, Math.round(value));
  mmrState.playerRating = v;
  const pt = ensurePlayerContestant(p);
  pt.rating = v;
  mmrState.peakRating = Math.max(mmrState.peakRating ?? 0, v);
  p.save(false);
  return v;
}

export function getCompetitorMMR(p: Player, id: string): ContestantMMR | undefined {
  const state = getMMRState(p);
  return state.contestants[id];
}

export function drawProceduralContestant(p: Player, usedIds: Set<string>): ContestantMMR {
  const mmrState = getMMRState(p);
  const pool = Object.values(mmrState.contestants).filter(
    c => c.id.startsWith('procedural_') && !usedIds.has(c.id) && !c.isPlayer
  );
  if (pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return Object.values(mmrState.contestants).find(c => c.id.startsWith('procedural_'))!;
}

export function updateBackgroundElo(p: Player, winnerId: string, loserId: string): void {
  const mmrState = getMMRState(p);
  const winTamer = mmrState.contestants[winnerId];
  const loseTamer = mmrState.contestants[loserId];
  if (!winTamer || !loseTamer) return;

  const skipList = ['aljay', 'greggy', 'onnel', 'grand', 'renzo', 'kulz', 'lemon_quake', 'roydo', 'blau'];
  
  const rA = winTamer.rating;
  const rB = loseTamer.rating;
  
  const ea = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const eb = 1 - ea;
  
  const K = 32;
  const newRA = rA + K * (1 - ea);
  const newRB = rB + K * (0 - eb);

  if (!skipList.includes(winnerId)) {
    winTamer.rating = Math.round(newRA);
    winTamer.wins++;
  }
  if (!skipList.includes(loserId)) {
    loseTamer.rating = Math.round(Math.max(100, newRB));
    loseTamer.losses++;
  }
}

export function updatePlayerElo(p: Player, opponentId: string, playerWon: boolean): void {
  const mmrState = getMMRState(p);
  let playerTamer = mmrState.contestants['player'];
  if (!playerTamer) {
    playerTamer = {
      id: 'player',
      name: p.tamerName,
      rating: mmrState.playerRating || 1200,
      wins: p.battlesWon,
      losses: 0,
      title: 'You',
      hometown: 'Haven City',
      guildId: p.houseId ?? 'grand_houses',
      color: '#f2c14e',
      speciesIds: p.party.map(g => g.speciesId),
      isPlayer: true
    };
    mmrState.contestants['player'] = playerTamer;
  }
  
  const oppTamer = mmrState.contestants[opponentId];
  if (!oppTamer) return;

  const rA = playerTamer.rating;
  const rB = oppTamer.rating;
  
  const ea = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const eb = 1 - ea;
  
  const K = 32;
  const actualA = playerWon ? 1 : 0;
  const deltaA = Math.round(K * (actualA - ea));
  const deltaB = Math.round(K * ((1 - actualA) - eb));

  const oldRating = playerTamer.rating;
  playerTamer.rating += deltaA;
  if (playerWon) {
    playerTamer.wins++;
  } else {
    playerTamer.losses++;
  }

  const skipList = ['aljay', 'greggy', 'onnel', 'grand', 'renzo', 'kulz', 'lemon_quake', 'roydo', 'blau'];
  if (!skipList.includes(opponentId)) {
    oppTamer.rating = Math.round(Math.max(100, oppTamer.rating + deltaB));
    if (playerWon) {
      oppTamer.losses++;
    } else {
      oppTamer.wins++;
    }
  }

  mmrState.playerRating = playerTamer.rating;
  mmrState.peakRating = Math.max(mmrState.peakRating ?? 0, playerTamer.rating);
  awardMMRMilestones(p, oldRating, playerTamer.rating);
  p.save(false);

  const direction = deltaA >= 0 ? '+' : '';
  toast(`🏆 Rating updated: ${oldRating} ➔ ${playerTamer.rating} (${direction}${deltaA})`, 'gold', 4500);
}

export function simulateBackgroundMatches(p: Player, count: number): void {
  const mmrState = getMMRState(p);
  const contestants = Object.values(mmrState.contestants).filter(c => c.id !== 'player');
  const skipList = ['aljay', 'greggy', 'onnel', 'grand', 'renzo', 'kulz', 'lemon_quake', 'roydo', 'blau'];

  for (let i = 0; i < count; i++) {
    const idxA = Math.floor(Math.random() * contestants.length);
    let idxB = Math.floor(Math.random() * contestants.length);
    if (idxA === idxB) {
      idxB = (idxB + 1) % contestants.length;
    }
    const tamerA = contestants[idxA];
    const tamerB = contestants[idxB];

    const rA = tamerA.rating;
    const rB = tamerB.rating;
    const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
    const aWins = Math.random() < probA;

    const ea = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const eb = 1 - ea;
    const K = 24;

    const deltaA = Math.round(K * ((aWins ? 1 : 0) - ea));
    const deltaB = Math.round(K * ((aWins ? 0 : 1) - eb));

    if (!skipList.includes(tamerA.id)) {
      tamerA.rating = Math.max(100, tamerA.rating + deltaA);
      if (aWins) tamerA.wins++; else tamerA.losses++;
    }
    if (!skipList.includes(tamerB.id)) {
      tamerB.rating = Math.max(100, tamerB.rating + deltaB);
      if (aWins) tamerB.losses++; else tamerB.wins++;
    }
  }
}

export function recordVisit(p: Player): void {
  const mmrState = getMMRState(p);
  mmrState.visitsCount = (mmrState.visitsCount ?? 0) + 1;
  if (mmrState.visitsCount % 3 === 0) {
    simulateBackgroundMatches(p, 20);
    p.save(false);
    toast('🏆 Leaderboard standings have shifted!', 'gold', 3000);
  }
}

export function recordQuestComplete(p: Player): void {
  const mmrState = getMMRState(p);
  simulateBackgroundMatches(p, 15);
  
  const oldRating = mmrState.playerRating;
  const delta = 20;
  mmrState.playerRating += delta;
  if (mmrState.contestants['player']) {
    mmrState.contestants['player'].rating = mmrState.playerRating;
  }
  p.save(false);
  
  toast(`🏆 Mission Accomplished! Rating: ${oldRating} ➔ ${mmrState.playerRating} (+${delta})`, 'gold', 4500);
}

export function recordDungeonOutcome(p: Player, outcome: 'cleared' | 'dead' | 'retreat'): void {
  const mmrState = getMMRState(p);
  simulateBackgroundMatches(p, 15);
  
  const oldRating = mmrState.playerRating;
  let delta = 0;
  
  if (outcome === 'cleared') {
    delta = 25;
    mmrState.playerRating += delta;
    toast(`🏆 Dungeon Cleared! Rating: ${oldRating} ➔ ${mmrState.playerRating} (+${delta})`, 'gold', 4500);
  } else {
    delta = -15;
    mmrState.playerRating = Math.max(100, mmrState.playerRating + delta);
    toast(`💀 Dungeon Failed! Rating: ${oldRating} ➔ ${mmrState.playerRating} (${delta})`, 'gold', 4500);
  }
  
  if (mmrState.contestants['player']) {
    mmrState.contestants['player'].rating = mmrState.playerRating;
  }
  p.save(false);
}

export function renderLeaderboardPanel(p: Player, refresh: () => void): string {
  const mmrState = getMMRState(p);
  
  const playerTamer = mmrState.contestants['player'];
  if (playerTamer) {
    playerTamer.name = p.tamerName;
    playerTamer.rating = mmrState.playerRating;
    playerTamer.wins = p.battlesWon;
    playerTamer.guildId = p.houseId ?? 'grand_houses';
    playerTamer.speciesIds = p.party.map(g => g.speciesId);
  }

  let list = Object.values(mmrState.contestants);

  // Canonical ladder rank is always by rating, even when the view is re-sorted.
  const ratingSorted = [...list].sort((a, b) => b.rating - a.rating);
  const rankById: Record<string, number> = {};
  ratingSorted.forEach((c, i) => { rankById[c.id] = i + 1; });

  const sortCmp = leaderboardSort === 'wins'
    ? (a: ContestantMMR, b: ContestantMMR) => (b.wins - a.wins) || (b.rating - a.rating)
    : leaderboardSort === 'winrate'
    ? (a: ContestantMMR, b: ContestantMMR) => (winRateOf(b) - winRateOf(a)) || (b.rating - a.rating)
    : (a: ContestantMMR, b: ContestantMMR) => b.rating - a.rating;
  list.sort(sortCmp);

  const listWithRank = list.map(c => ({ ...c, currentRank: rankById[c.id] }));

  let filtered = listWithRank.filter(c => {
    if (leaderboardSearch) {
      const query = leaderboardSearch.toLowerCase();
      const nameMatch = c.name.toLowerCase().includes(query);
      const titleMatch = c.title.toLowerCase().includes(query);
      const hometownMatch = c.hometown.toLowerCase().includes(query);
      if (!nameMatch && !titleMatch && !hometownMatch) return false;
    }

    if (leaderboardFilter !== 'all') {
      const nation = getNation(c.hometown).toLowerCase();
      const filter = leaderboardFilter.toLowerCase();
      if (nation !== filter) return false;
    }

    return true;
  });

  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (leaderboardPage >= totalPages) {
    leaderboardPage = totalPages - 1;
  }
  if (leaderboardPage < 0) {
    leaderboardPage = 0;
  }

  const startIdx = leaderboardPage * PAGE_SIZE;
  const pageData = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  const nationButtons = [
    { id: 'all', label: '🌍 All' },
    { id: 'olivar', label: '🏰 Olivar' },
    { id: 'veyra', label: '🌊 Veyra' },
    { id: 'tharkand', label: '⚙️ Tharkand' },
    { id: 'noruun', label: '❄️ Noruun' },
    { id: 'sea', label: '🏝️ Western Sea' }
  ].map(btn => {
    const active = leaderboardFilter === btn.id ? 'active' : '';
    return `<button class="lb-filter-btn ${active}" data-lb-filter="${btn.id}">${btn.label}</button>`;
  }).join('');

  const rowsHtml = pageData.map(c => {
    const isPlayer = !!c.isPlayer;
    const isLegend = !!c.isLegend;
    const rowClass = isPlayer ? 'player-row' : isLegend ? 'legend-row' : '';
    const nation = getNation(c.hometown);
    const nationClass = `lb-nation-${nation.replace(/\s+/g, '').toLowerCase()}`;

    let rankHtml = `${c.currentRank}`;
    if (c.currentRank === 1) rankHtml = '👑 1';
    else if (c.currentRank === 2) rankHtml = '🥈 2';
    else if (c.currentRank === 3) rankHtml = '🥉 3';

    const rosterHtml = c.speciesIds.map(sid => {
      const name = SPECIES[sid]?.name || sid;
      return `<span class="lb-mon-tag">${name}</span>`;
    }).join(' ');

    const guildColor = c.color || '#9ab0c8';
    const ratingClass = isLegend ? 'legend-rating' : '';
    const div = divisionFor(c.rating);
    const wr = Math.round(winRateOf(c) * 100);

    return `
      <tr class="lb-tr ${rowClass}">
        <td class="lb-td lb-rank">${rankHtml}</td>
        <td class="lb-td">
          <div class="lb-name" style="color:${isPlayer ? 'var(--ui-gold)' : guildColor}">
            ${c.name} ${isPlayer ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022;padding:1px 6px;font-size:10px;margin-left:5px">YOU</span>' : ''}
          </div>
          <div class="sub" style="font-size:11px">${c.title}</div>
          <div class="lb-roster">${rosterHtml}</div>
        </td>
        <td class="lb-td"><span class="lb-nation-tag ${nationClass}">${nation}</span></td>
        <td class="lb-td lb-rating ${ratingClass}">
          ${c.rating}
          <span class="lb-div" style="--dv:${div.color}">${div.icon} ${div.name}</span>
        </td>
        <td class="lb-td lb-rec">
          <span class="lb-wl">${c.wins}W-${c.losses}L</span>
          <span class="lb-wr" style="--wr:${wr >= 50 ? 'var(--ui-green)' : 'var(--ui-red)'}">${wr}%</span>
        </td>
      </tr>
    `;
  }).join('');

  // ---- the player's pinned standing banner ----
  let standingCard = '';
  if (playerTamer) {
    const myRank = rankById['player'] ?? ratingSorted.length;
    const myDiv = divisionFor(playerTamer.rating);
    const peak = getPlayerPeakMMR(p);
    const wr = Math.round(winRateOf(playerTamer) * 100);
    const total = ratingSorted.length;
    const pct = total > 1 ? Math.max(1, Math.round((1 - (myRank - 1) / (total - 1)) * 100)) : 100;
    const nextDiv = DIVISIONS.find(d => d.min > playerTamer.rating);
    const toNext = nextDiv ? `${(nextDiv.min - playerTamer.rating).toLocaleString()} to ${nextDiv.icon} ${nextDiv.name}` : 'Apex division — the very top';
    standingCard = `
      <div class="lb-standing" style="--dv:${myDiv.color}">
        <div class="lb-st-badge">${myDiv.icon}<span class="lb-st-badge-name">${myDiv.name}</span></div>
        <div class="lb-st-main">
          <div class="lb-st-rank">World Rank <b>#${myRank}</b> <span class="lb-st-pct">Top ${pct}%</span></div>
          <div class="lb-st-stats">
            <span>★ <b>${playerTamer.rating.toLocaleString()}</b> MMR</span>
            <span>⛰️ Peak <b>${peak.toLocaleString()}</b></span>
            <span>${playerTamer.wins}W-${playerTamer.losses}L <b style="color:${wr >= 50 ? 'var(--ui-green)' : 'var(--ui-red)'}">${wr}%</b></span>
          </div>
          <div class="lb-st-next">▲ ${toNext}</div>
        </div>
      </div>`;
  }

  const sortButtons = [
    { id: 'rating', label: '★ Rating' },
    { id: 'wins', label: '🏆 Wins' },
    { id: 'winrate', label: '📊 Win %' },
  ].map(b => `<button class="lb-sort-btn ${leaderboardSort === b.id ? 'active' : ''}" data-lb-sort="${b.id}">${b.label}</button>`).join('');

  const tableHtml = filtered.length > 0
    ? `
      <table class="lb-table">
        <thead>
          <tr>
            <th class="lb-th" style="width:70px">Rank</th>
            <th class="lb-th">Tamer</th>
            <th class="lb-th" style="width:130px">Nation</th>
            <th class="lb-th" style="width:150px">Rating · Division</th>
            <th class="lb-th" style="width:110px">Record · Win%</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `
    : `<div class="sub" style="text-align:center;padding:40px">No tamers match your search criteria.</div>`;

  return `
    <div class="lb-container">
      <div class="lb-header">
        <h3 style="margin:0;color:var(--ui-gold);font-size:20px;text-transform:none">🏆 Tamer Circuit Leaderboard</h3>
        <div class="sub">World Standings · AE Year ${aeYear(p.calendarDay)}</div>
      </div>

      ${standingCard}

      <div class="lb-controls">
        <div class="lb-filters">
          ${nationButtons}
        </div>
        <input type="text" id="lb-search" class="lb-search-input" placeholder="Search tamer name..." autocomplete="off">
      </div>

      <div class="lb-sortbar">
        <span class="lb-sortbar-lbl">Sort by</span>
        ${sortButtons}
      </div>

      ${tableHtml}

      <div class="lb-pagination">
        <button class="ui-btn" id="lb-prev" ${leaderboardPage === 0 ? 'disabled' : ''}>◀ Previous</button>
        <span class="sub">Page ${leaderboardPage + 1} of ${totalPages} (Total: ${filtered.length})</span>
        <button class="ui-btn" id="lb-next" ${leaderboardPage >= totalPages - 1 ? 'disabled' : ''}>Next ▶</button>
      </div>
    </div>
  `;
}

export function wireLeaderboardPanel(el: HTMLElement, p: Player, refresh: () => void): void {
  const searchInput = el.querySelector('#lb-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = leaderboardSearch;
    searchInput.oninput = () => {
      leaderboardSearch = searchInput.value;
      leaderboardPage = 0;
      refresh();
    };
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  el.querySelectorAll<HTMLElement>('[data-lb-filter]').forEach(b => {
    b.onclick = () => {
      leaderboardFilter = b.dataset.lbFilter!;
      leaderboardPage = 0;
      refresh();
    };
  });

  el.querySelectorAll<HTMLElement>('[data-lb-sort]').forEach(b => {
    b.onclick = () => {
      leaderboardSort = (b.dataset.lbSort as typeof leaderboardSort) || 'rating';
      leaderboardPage = 0;
      refresh();
    };
  });

  const prevBtn = el.querySelector('#lb-prev') as HTMLElement;
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (leaderboardPage > 0) {
        leaderboardPage--;
        refresh();
      }
    };
  }

  const nextBtn = el.querySelector('#lb-next') as HTMLElement;
  if (nextBtn) {
    nextBtn.onclick = () => {
      const mmrState = getMMRState(p);
      let list = Object.values(mmrState.contestants);
      let filteredCount = list.filter(c => {
        if (leaderboardSearch) {
          const query = leaderboardSearch.toLowerCase();
          if (!c.name.toLowerCase().includes(query) && !c.title.toLowerCase().includes(query) && !c.hometown.toLowerCase().includes(query)) return false;
        }
        if (leaderboardFilter !== 'all') {
          if (getNation(c.hometown).toLowerCase() !== leaderboardFilter.toLowerCase()) return false;
        }
        return true;
      }).length;
      
      const totalPages = Math.ceil(filteredCount / 15);
      if (leaderboardPage < totalPages - 1) {
        leaderboardPage++;
        refresh();
      }
    };
  }
}
