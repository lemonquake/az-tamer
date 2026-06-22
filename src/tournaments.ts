// ============================================================
// AZ Tamer — THE WORLDRING CIRCUIT
// The competitive season, five ascending strata, that hangs off the
// Calendar: Local Ringnights, the Turmal Seasonal qualifiers, the
// Continental Crowns, the Playoffs, and the World Championship in the
// Worldring of Terra City. EXP is disabled in the Ring — you fight
// with the team you built; the bracket measures it.
//
// Opponents come in three strata, all lore-true:
//   • procedural members drawn from ALL the Guilds of the Compact
//   • named City Champions — every city keeps a strong one
//   • the Known Names — the Top 10 famous across four continents,
//     led by the Leodones daughters of Olivar and the Olivar brothers
//     of Tharkand.
// ============================================================
import { SPECIES, TYPE_CSS } from './data';
import { Player, type TrophyEarned } from './state';
import { WORLD_GUILDS, WORLD_CIRCUIT } from './lore';
import { awardTournamentPoints, rankIndexFor, RANKS } from './ranks';
import { say, choose, toast, openScreen, closeMenu, showBracketTreeScreen, showTournamentMatchIntro } from './ui';
import { jumpToDay, weekdayName, calendarDayOf, dateLabel, aeYear, weekOfYear } from './calendar';
import { CLOTHES_DATABASE } from './clothes';
import { ALL_RODS } from './fishingdata';
import { styleFor, showChampionBanner } from './celebrate';
import { showTrophyShowcase, showTrophyCase } from './trophies';
import { getCompetitorMMR, drawProceduralContestant, updatePlayerElo, updateBackgroundElo, simulateBackgroundMatches, getPlayerMMR, divisionFor } from './mmr';

// ---------------- continents & power tiers ----------------
export type Continent = 'Olivar' | 'Veyra' | 'Tharkand' | 'Noruun';

/** stage pool + level band for an opponent's strength. */
type PowerTier = 'rookie' | 'pro' | 'elite' | 'champion' | 'crown' | 'legend';
const POWER: Record<PowerTier, { stages: string[]; lo: number; hi: number }> = {
  rookie:   { stages: ['Adept', 'Elite'], lo: 22, hi: 32 },
  pro:      { stages: ['Elite', 'Apex'], lo: 36, hi: 50 },
  elite:    { stages: ['Apex'], lo: 52, hi: 64 },
  champion: { stages: ['Apex', 'Legendary'], lo: 68, hi: 82 },
  crown:    { stages: ['Apex', 'Legendary'], lo: 84, hi: 92 },
  legend:   { stages: ['Legendary', 'Aether'], lo: 90, hi: 99 },
};

export const guildName = (id: string): string => WORLD_GUILDS.find(g => g.id === id)?.name ?? 'a free Guild';
export const guildColor = (id: string): string => WORLD_GUILDS.find(g => g.id === id)?.color ?? '#9ab0c8';

// signature element(s) each Guild fields, for procedural rosters
const GUILD_TYPES: Record<string, string[]> = {
  first_fire:         ['Tide', 'Blaze'],
  pearlwake:          ['Tide'],
  duneward:           ['Blaze', 'Volt'],
  aurora_lodge:       ['Tide', 'Umbra'],
  grand_houses:       ['Blaze', 'Tide', 'Verdant', 'Volt', 'Umbra'],
  filament_concord:   ['Volt'],
  worldring_conclave: ['Volt', 'Blaze'],
  lumenwrights:       ['Volt', 'Gale'],
  voltwake_runners:   ['Gale', 'Volt'],
};

// species index by type+stage, built once
const _byTypeStage = new Map<string, string[]>();
function speciesByType(type: string, stages: string[]): string[] {
  const key = `${type}|${stages.join(',')}`;
  let hit = _byTypeStage.get(key);
  if (!hit) {
    hit = Object.keys(SPECIES).filter(id => SPECIES[id].type === type && stages.includes(SPECIES[id].stage));
    if (!hit.length) hit = Object.keys(SPECIES).filter(id => SPECIES[id].type === type);
    _byTypeStage.set(key, hit);
  }
  return hit;
}
const rnd = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const levelIn = (p: PowerTier): number => POWER[p].lo + Math.floor(Math.random() * (POWER[p].hi - POWER[p].lo + 1));

interface Mon { speciesId: string; level: number; }
function teamFromTypes(types: string[], power: PowerTier, size: number): Mon[] {
  const { stages } = POWER[power];
  const out: Mon[] = [];
  for (let i = 0; i < size; i++) {
    const pool = speciesByType(rnd(types), stages);
    out.push({ speciesId: pool.length ? rnd(pool) : 'cindcub', level: levelIn(power) });
  }
  return out;
}
function teamFromIds(ids: string[], power: PowerTier): Mon[] {
  return ids.map(id => ({ speciesId: SPECIES[id] ? id : 'cindcub', level: levelIn(power) }));
}

// ============================================================
// THE KNOWN NAMES — the Top 10 known across four continents.
// ============================================================
export interface KnownName {
  id: string; name: string; epithet: string;
  continent: Continent; worldRank: number; continentRank: number;
  guildId: string; color: string;
  team: string[];      // three signature Guardians (species ids)
  quote: string;       // said as they step onto the ring
  bio: string;         // deep lore
}

export const KNOWN_NAMES: KnownName[] = [
  {
    id: 'azrin', name: 'Azrin Leodones', epithet: 'The Emberlark',
    continent: 'Olivar', worldRank: 1, continentRank: 1,
    guildId: 'grand_houses', color: '#f2884e',
    team: ['solarex', 'infernyx', 'ignisar'],
    quote: 'Try to keep up. I never slow down for anyone — not even Father.',
    bio: 'Elder daughter of Aljay the Dawnflame and Mayor Airah, and at sixteen already the youngest World Champion the Coliseum broadsheets can find a record of — atop a shelf of Intercontinental crowns. She fights the way her father did: like sunrise, sudden and everywhere at once, the whole ring lit before her opponent has finished bowing. Olivar puts her first and the other three continents do not seriously argue. For her little sister she would walk into anything — and one day, the rumor runs, into three Anomalies at once.',
  },
  {
    id: 'ezekiel', name: 'Ezekiel Olivar', epithet: 'The Crown Usurped',
    continent: 'Tharkand', worldRank: 2, continentRank: 1,
    guildId: 'worldring_conclave', color: '#4fe0ff',
    team: ['raidenjin', 'voltrazar', 'stormapex'],
    quote: 'This Ring was ours before your Leodones ever crossed the strait. Today Terra takes it back.',
    bio: 'Eldest of the House of Olivar — the ancient line the capital continent was NAMED for, before the Leodones ever governed it. Where his ancestors lost a continent, Ezekiel went east and conquered another: he is Tharkand\'s undisputed first, the engine-storm champion of the rebuilt Circuit-Crown, and the loudest reason the Worldring fills to the rafters. Every title that goes to an Olivar foreigner he takes as a personal theft. He has never beaten Azrin Leodones in a final. He has come close enough to taste it twice.',
  },
  {
    id: 'azrael', name: 'Azrael Leodones', epithet: 'The Nightwing',
    continent: 'Olivar', worldRank: 3, continentRank: 2,
    guildId: 'grand_houses', color: '#9a6af2',
    team: ['chthonix', 'erebusilk', 'phantasmoth'],
    quote: 'Your Guardians are afraid of mine. It\'s alright. I\'ll be gentle. …Mostly.',
    bio: 'The younger Leodones — her father over again: stubborn past all argument, a quiet genius, convinced every Guardian is a friend she simply hasn\'t met yet, including yours. She fights from the dark and out-thinks the room three moves early, an unlit lantern on her belt the whole time. "For Ghandra," she says of it, and elaborates to no one. Second on the continent only because she refuses to take a final seriously — until, twice a season, she suddenly does, and the standings shake.',
  },
  {
    id: 'raphael', name: 'Raphael Olivar', epithet: 'The Iron Antiphon',
    continent: 'Tharkand', worldRank: 4, continentRank: 2,
    guildId: 'filament_concord', color: '#5aa0ff',
    team: ['voltigarch', 'teslarch', 'gravemonolith'],
    quote: 'My brother fights for the crown. I fight so that no one ever forgets the name Olivar.',
    bio: 'Younger of the Olivar brothers, a circuit-wright of the Filament Concord who bonds with the engine-spirits that woke in the old war-iron. Where Ezekiel burns, Raphael grinds — an immovable, answering wall, the antiphon to his brother\'s storm. They have stood back-to-back in the Worldring\'s doubles bracket since they were boys and never once lost it. Alone, he is the second-hardest door to open in all of Tharkand, and he likes it there, in the shadow of the crown, doing the quiet work that keeps the name alive.',
  },
  {
    id: 'clyde_b', name: 'Clyde B.', epithet: 'The Tech-Waver',
    continent: 'Tharkand', worldRank: 5, continentRank: 3,
    guildId: 'filament_concord', color: '#4fe0ff',
    team: ['teslarch', 'gravemonolith', 'fulgurex'],
    quote: 'Let\'s test the circuit parameters. Output set to maximum voltage.',
    bio: 'A brilliant engineering prodigy from Hyujon, the Forgotten Tech-City. Clyde B. works closely with Doctor Clyde, integrating old-empire tech-nodes directly into the neural cores of electro-magnetic Guardians. He spends his off-hours debating power-grid optimization with Raphael Olivar.',
  },
  {
    id: 'anthony_o', name: 'Anthony O.', epithet: 'The Giga-Grill',
    continent: 'Olivar', worldRank: 6, continentRank: 3,
    guildId: 'first_fire', color: '#4ec45e',
    team: ['blazemaw', 'thornstag', 'pyrofang'],
    quote: 'If you can\'t stand the heat, stay out of my kitchen and off my sand!',
    bio: 'Known across the Valley of Loud Kitchens in New Salmonan as the loud chef who grills spicy river-fish and fields a blistering Blaze/Nature team. Anthony trained under Greggy\'s old beach tamers and fights with a fiery passion that keeps audiences roaring.',
  },
  {
    id: 'louie_b', name: 'Louie B.', epithet: 'The Surf-Breaker',
    continent: 'Veyra', worldRank: 7, continentRank: 1,
    guildId: 'first_fire', color: '#f2a64e',
    team: ['maelstrike', 'reefguard', 'infernyx'],
    quote: 'Aurelia made the first bond on this beach. I just try to represent the sand.',
    bio: 'A barefoot fisher-tamer from Agdao Island who claims direct descent from Aurelia\'s first circle. Louie specializes in steam-vapor combat, combining Tide and Blaze elements. He frequently corresponds with Azrael Leodones regarding Ghandra\'s ancient elemental pathways.',
  },
  {
    id: 'paulo_b', name: 'Paulo B.', epithet: 'The Twilight Weaver',
    continent: 'Olivar', worldRank: 8, continentRank: 4,
    guildId: 'grand_houses', color: '#9a6af2',
    team: ['chthonix', 'umbrelisk', 'nosferatus'],
    quote: 'The shadows don\'t lie. They just wait for you to make a mistake.',
    bio: 'A quiet, brooding library researcher from Haven City affiliated with House Duskwatch. Paulo studies dimensional rifts at the University of Aurel and fields a highly tactical shadow-manipulation lineup. He is intensely competitive with Azrin Leodones.',
  },
  {
    id: 'ivan_lawrence', name: 'Ivan Lawrence', epithet: 'The Railsplitter',
    continent: 'Tharkand', worldRank: 9, continentRank: 4,
    guildId: 'voltwake_runners', color: '#5aff9a',
    team: ['empyrhawk', 'tempestrix', 'voltigarch'],
    quote: 'Blink and you\'ll miss the show. The rails are live!',
    bio: 'A high-speed rail-courier from Terra City and a close friend of Riven Calloway. Ivan\'s crowd-favorite Volt/Gale speedsters race alongside the neon-lit spires. After exposing a rigged Foretales exhibition, his fans rioted until his deletion was reversed.',
  },
  {
    id: 'maris', name: 'Maris Dell', epithet: 'The Drownsong',
    continent: 'Veyra', worldRank: 10, continentRank: 2,
    guildId: 'pearlwake', color: '#3a9df2',
    team: ['leviathorn', 'abyssarch', 'nacrelord'],
    quote: 'The tide doesn\'t hurry, and it doesn\'t lose. Neither do I.',
    bio: 'First of the Pearlwake Compact\'s pro circuit in Veyra. She maps deep sea trenches by day and sweeps brackets by night. Maris has recently conceded her continent\'s top spot to Louie B., but remains a formidable presence in the Worldring.',
  },
];

const KNOWN_BY_ID: Record<string, KnownName> = Object.fromEntries(KNOWN_NAMES.map(k => [k.id, k]));
export const knownById = (id: string): KnownName | undefined => KNOWN_BY_ID[id];

// ============================================================
// CITY CHAMPIONS — every city keeps a strong one.
// ============================================================
export interface CityChampion {
  id: string; name: string; epithet: string; city: string;
  guildId: string; color: string; team: string[]; quote: string; bio: string;
}
export const CITY_CHAMPIONS: CityChampion[] = [
  { id: 'haven', name: 'Dorn Kettlebrand', epithet: 'The Anvil', city: 'Haven City',
    guildId: 'grand_houses', color: '#f2603a', team: ['blazemaw', 'magmaboar', 'pyrofang'],
    quote: 'Haven\'s ring, Haven\'s rules, Haven\'s champion. That\'s me, for now.',
    bio: 'House Pyrelight\'s broad-shouldered favorite and Haven City\'s strongest. He has never won a major and never missed a Ringnight; the Coliseum concession-sellers schedule their breaks around his matches.' },
  { id: 'salmonan', name: 'Ferra Quill', epithet: 'The Paddywatch', city: 'New Salmonan',
    guildId: 'grand_houses', color: '#4ec45e', team: ['sylvigor', 'thicketclaw', 'thornstag'],
    quote: 'We don\'t get broadcast crystals out here. We just get good. Quietly.',
    bio: 'The Valley of Loud Kitchens keeps no leaderboard, so nobody can say how long Ferra has been its best — only that no traveling circuit name has ever beaten her on the terraces, and that she repaints the Big Three mural by the river gate every spring.' },
  { id: 'agdao', name: 'Tovan Cero', epithet: 'Surf-Blessed', city: 'Agdao Island',
    guildId: 'first_fire', color: '#f2a64e', team: ['maelstrike', 'reefguard', 'tidefin'],
    quote: 'Aurelia made the first bond on this beach. I just try to be worthy of the sand.',
    bio: 'Champion of the Circle of the First Fire, on the island where taming itself began seven hundred years ago. He fights barefoot on the lagoon sand and leaves a fish on the north rocks every monsoon, for the Guardian that started everything.' },
  { id: 'terra', name: 'Neon-Knight Vell', epithet: 'The Filament', city: 'Terra City',
    guildId: 'lumenwrights', color: '#ff5aa8', team: ['teslarch', 'stormclaw', 'voltigarch'],
    quote: 'In the Circuit-Crown, even the streetlights have opinions. So do I.',
    bio: 'A Lumenwright light-artisan who fights in armor that runs with living neon. Not yet a Known Name, but the Worldring undercard belongs to Vell — the warm-up act Terra arrives early to watch before the Olivar brothers take the sand.' },
  { id: 'hyujon', name: 'Relay-Warden Sole', epithet: 'The Last Signal', city: 'Hyujon',
    guildId: 'filament_concord', color: '#7a8af2', team: ['gravemonolith', 'nocthowl', 'teslarch'],
    quote: 'This city went dark. I keep one ring lit in it. Step in, if you\'re brave.',
    bio: 'The lone champion of the Forgotten Tech-City, fighting under flickering old-empire relays among the grieving few who never left. Doctor Clyde patches Sole\'s Guardians between bouts. Nobody comes to Hyujon for a tournament — which is exactly why Sole holds one.' },
];
const CITY_BY_ID: Record<string, CityChampion> = Object.fromEntries(CITY_CHAMPIONS.map(c => [c.id, c]));

// procedural Guild member (fills the early rounds — random person, random Guild)
const FIRST_NAMES = ['Bram', 'Soren', 'Lira', 'Cass', 'Mira', 'Dane', 'Yael', 'Pell', 'Orin', 'Vesna', 'Hale', 'Renn', 'Sela', 'Joss', 'Tamsa', 'Edrin', 'Nyla', 'Corin', 'Wren', 'Falk', 'Isolde', 'Garrick', 'Petra', 'Loy'];
const SURNAMES = ['Marrow', 'Ashby', 'Vance', 'Holt', 'Quill', 'Drey', 'Stark', 'Vetch', 'Lune', 'Carrow', 'Pike', 'Wexley', 'Ferro', 'Salt', 'Bellweather', 'Crane', 'Voss', 'Thorne', 'Galt', 'Renke', 'Oster', 'Mund', 'Kessler', 'Dune'];

interface Opponent { name: string; guildId: string; color: string; team: Mon[]; quote: string; }
function randomGuildOpponent(power: PowerTier, size: number): Opponent {
  const guild = rnd(WORLD_GUILDS);
  const types = GUILD_TYPES[guild.id] ?? ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether'];
  const name = `${rnd(FIRST_NAMES)} ${rnd(SURNAMES)}`;
  const lines = [
    `For the honor of ${guild.name}!`,
    `${guild.name} doesn\'t lose first rounds. Usually.`,
    'May the better bond win.',
    'I came a long way for this bracket. Don\'t make it quick.',
  ];
  return { name, guildId: guild.id, color: guild.color, team: teamFromTypes(types, power, size), quote: rnd(lines) };
}

// ============================================================
// THE FIVE STRATA + the specials — tournament tier definitions.
// ============================================================
type Stratum = 'guild' | 'city' | 'known';
interface RoundDef { name: string; stratum: Stratum; power: PowerTier; size: 1 | 2 | 3; knownId?: string; cityId?: string; byContinent?: boolean; }

export type TierClass = 'Local' | 'Seeding' | 'Regional' | 'Special' | 'Playoffs' | 'Championship' | 'Legends' | 'Guild' | 'Supercup' | 'Circuit';

export interface TournamentTier {
  id: string; name: string; short: string; venue: string; classKind: TierClass;
  blurb: string;
  rounds: RoundDef[];
  tp: { champion: number; finalist: number; semifinal: number; entered: number };
  prizeShards: number;
  continent?: Continent;
  format?: 'elimination' | 'round_robin' | 'guild_war';
  /** Minimum ladder MMR required to enter. Undefined = open to all. */
  minMMR?: number;
  /** On-demand tiers (Legends/Guild/Supercup/Circuit) aren't on the weekly
   *  calendar — they're challenged directly once their requirements are met. */
  onDemand?: boolean;
}

const R = (name: string, stratum: Stratum, power: PowerTier, size: 1 | 2 | 3, extra: Partial<RoundDef> = {}): RoundDef =>
  ({ name, stratum, power, size, ...extra });

export const TIERS: Record<string, TournamentTier> = {
  weekly_open: {
    id: 'weekly_open', name: 'The Ringnight — Weekly Open', short: 'Ringnight', venue: 'Grand Coliseum, Haven City', classKind: 'Local',
    blurb: 'Every week the horns sound over Haven and the open bracket fills with anyone bold enough to sign. Low stakes, low Tournament Points, and the only place on four continents where an unknown can become a name by Saturday. Where every legend signed its first page.',
    rounds: [R('Round of 8', 'guild', 'rookie', 1), R('Semifinal', 'guild', 'pro', 2), R('Final', 'city', 'pro', 3, { cityId: 'haven' })],
    tp: { champion: 8, finalist: 4, semifinal: 2, entered: 1 }, prizeShards: 600,
  },
  turmal_seasonal: {
    id: 'turmal_seasonal', name: 'The Turmal Seasonal', short: 'Seasonal', venue: 'Turmal Above — the sky-city circuit', classKind: 'Seeding',
    blurb: 'The loudest open circuit outside the Grand Coliseum, run high in the terraced sky-city under the curtained boxes of the Sponsors. Brackets every season, broadcast to four continents — and your placements here set your SEED into the Playoffs. Seeded, not drawn.',
    rounds: [R('Round of 16', 'guild', 'rookie', 1), R('Quarterfinal', 'guild', 'pro', 2), R('Semifinal', 'guild', 'pro', 3), R('Final', 'city', 'elite', 3)],
    tp: { champion: 16, finalist: 9, semifinal: 5, entered: 2 }, prizeShards: 1500,
    format: 'round_robin',
  },
  foretales_exhibition: {
    id: 'foretales_exhibition', name: 'A Foretales Exhibition', short: 'Exhibition', venue: 'Grand Coliseum, Haven City', classKind: 'Special',
    blurb: 'A spectacle bout produced — and scripted — by Foretales itself: themed fields, manufactured darlings, the drama written before the first Guardian is called. The network swears every match is fair. The Override Ledger swears otherwise. Either way, the prizes are unique and the crowd is enormous.',
    rounds: [R('Opening Spectacle', 'guild', 'pro', 2), R('The Featured Bout', 'guild', 'elite', 3), R('The Headline', 'known', 'elite', 3)],
    tp: { champion: 12, finalist: 7, semifinal: 4, entered: 2 }, prizeShards: 1200,
  },
  continental_crown: {
    id: 'continental_crown', name: 'The Continental Crown', short: 'Crown', venue: 'rotates by continent', classKind: 'Regional',
    blurb: 'A continental title — the Intercontinental circuit the Leodones daughters fill their shelves from. Win one and you have punched a ticket toward the Worldring. Olivar, Veyra, Tharkand, Noruun: each crown has its own champion to dethrone.',
    rounds: [R('Round of 16', 'guild', 'pro', 2), R('Quarterfinal', 'guild', 'elite', 3), R('Semifinal', 'city', 'elite', 3), R('Crown Match', 'known', 'champion', 3, { byContinent: true })],
    tp: { champion: 24, finalist: 14, semifinal: 8, entered: 3 }, prizeShards: 3000,
  },
  aurelia_cup: {
    id: 'aurelia_cup', name: "Aurelia's Cup", short: "Aurelia's Cup", venue: 'Agdao Island — the Cradle of Tamers', classKind: 'Special',
    blurb: 'The heritage bracket, held on the beach where Aurelia made the First Bond seven hundred years ago. The Circle of the First Fire opens its sand to the world once an Age-turn. No prize vault on four continents is older, and the islanders treat every entrant as a guest of the very first Tamer.',
    rounds: [R('The First Tide', 'guild', 'pro', 2), R('The Lagoon Bracket', 'guild', 'elite', 3), R('The Cradle Final', 'city', 'champion', 3, { cityId: 'agdao' })],
    tp: { champion: 18, finalist: 10, semifinal: 6, entered: 2 }, prizeShards: 2000,
  },
  gauntlet_seeds: {
    id: 'gauntlet_seeds', name: 'The Gauntlet of Seeds — Playoffs', short: 'Playoffs', venue: 'Grand Coliseum, Haven City', classKind: 'Playoffs',
    blurb: 'Top seeds only. Single-elimination, no second chances: Quarterfinals into Semifinals into finals-night, the field drawn from the Known Names themselves. This is where the World Circuit standings are truly decided — quarterfinals fear you, or you fear them.',
    rounds: [R('Quarterfinal', 'known', 'champion', 3), R('Semifinal', 'known', 'champion', 3), R('Finals-Night', 'known', 'crown', 3)],
    tp: { champion: 32, finalist: 20, semifinal: 12, entered: 4 }, prizeShards: 5000,
  },
  sealwatch: {
    id: 'sealwatch', name: 'The Sealwatch Invitational', short: 'Sealwatch', venue: 'Grand Coliseum, Haven City', classKind: 'Special',
    blurb: 'A grim, high-stakes invitational the Aurora Lodge demands be held each time the Ghandra seal is measured weaker. Fought under storm-light, against the strongest the Compact can field, to remind four continents what is being trained FOR. The seal weakens a little every year. So the bracket gets a little harder.',
    rounds: [R('The First Vigil', 'guild', 'elite', 3), R('The Deep Vigil', 'city', 'champion', 3), R('The Last Light', 'known', 'crown', 3, { knownId: 'graycur' })],
    tp: { champion: 26, finalist: 15, semifinal: 9, entered: 3 }, prizeShards: 3500,
  },
  world_championship: {
    id: 'world_championship', name: 'THE WORLD CHAMPIONSHIP', short: 'Worlds', venue: 'The Worldring, Terra City', classKind: 'Championship',
    blurb: 'The crown. The Worldring of Terra — the grandest arena on any shore, the ancient home where the World Championships were first held, returned at last now the Pod line hums again. Twenty-two titles belong to the Big Three; their daughters guard the throne now. Ten thousand voices and a crown of light wait for the last tamer standing.',
    rounds: [
      R('Round of 8', 'guild', 'champion', 3),
      R('Quarterfinal', 'city', 'champion', 3, { cityId: 'terra' }),
      R('Semifinal', 'known', 'champion', 3, { knownId: 'raphael' }),
      R('Final', 'known', 'crown', 3, { knownId: 'ezekiel' }),
      R('THE CROWN MATCH', 'known', 'legend', 3, { knownId: 'azrin' }),
    ],
    tp: { champion: 60, finalist: 36, semifinal: 22, entered: 5 }, prizeShards: 12000,
    minMMR: 2000,
  },
  legends_gauntlet: {
    id: 'legends_gauntlet', name: "The Legends' Gauntlet", short: 'Legends', venue: 'The Worldring, Terra City', classKind: 'Legends',
    blurb: 'Unsanctioned, unscheduled, and only offered to a standing World Champion: the bonded Guardians of the Big Three themselves — Aljay, Greggy, Onnel — nine Aether lights that have never lost. No Tournament Points. No crowd. Just the wall every record-holder eventually walks into, to learn how far the top really is.',
    rounds: [
      R('Onnel the Worldroot', 'known', 'legend', 3, { knownId: 'azrael' }),
      R('Greggy the Stormheart', 'known', 'legend', 3, { knownId: 'ezekiel' }),
      R('Aljay the Dawnflame', 'known', 'legend', 3, { knownId: 'azrin' }),
    ],
    tp: { champion: 80, finalist: 0, semifinal: 0, entered: 0 }, prizeShards: 20000,
    minMMR: 2800, onDemand: true,
  },

  // ============================================================
  // THE MMR-GATED INVITATIONALS — not on the weekly calendar.
  // The ladder is the ticket: climb your MMR and the Worldring's
  // exclusive brackets unlock, challengeable on demand.
  // ============================================================
  lemon_interguild: {
    id: 'lemon_interguild', name: 'The Lemon Inter-Guild — Guild Wars', short: 'Guild Wars', venue: 'rotating Guild seats — the Wars field', classKind: 'Guild',
    blurb: 'The whole Compact at war, by invitation only. Eight guilds, three-tamer lineups apiece, single elimination across the continents — and you march at the front of your own. Every tie is best-of-three: out-fight a rival guild\'s whole bench or watch your banner come down. The loudest team event on four shores, and the only crown a guild lifts together.',
    rounds: [
      R('Quarterfinal Tie', 'guild', 'pro', 3),
      R('Semifinal Tie', 'guild', 'elite', 3),
      R('THE GRAND FINAL TIE', 'guild', 'champion', 3),
    ],
    tp: { champion: 36, finalist: 22, semifinal: 13, entered: 4 }, prizeShards: 6000,
    minMMR: 1800, onDemand: true, format: 'guild_war',
  },
  aetherline_circuit: {
    id: 'aetherline_circuit', name: 'The Aether Line Circuit', short: 'Aether Line', venue: 'Aetherline Atelier, Terra City', classKind: 'Circuit',
    blurb: 'A prestige exhibition run under the prism-lights of the Aetherline Atelier, where Terra\'s finest cosmetics-houses sponsor the sharpest teams on the ladder. Three heats of escalating brilliance, lit like a gallery opening, judged like a final. They say the Line only invites a tamer once — so make the lights remember you.',
    rounds: [
      R('The Prism Heat', 'guild', 'elite', 3),
      R('The Lumen Heat', 'city', 'champion', 3, { cityId: 'terra' }),
      R('THE AETHER FINAL', 'known', 'crown', 3, { knownId: 'raphael' }),
    ],
    tp: { champion: 28, finalist: 16, semifinal: 9, entered: 3 }, prizeShards: 4200,
    minMMR: 2200, onDemand: true,
  },
  leodones_supercup: {
    id: 'leodones_supercup', name: 'The Leodones Supercup', short: 'Supercup', venue: 'The Worldring, Terra City', classKind: 'Supercup',
    blurb: 'The Leodones family\'s own invitational, hung above the Worldring once a year and offered only to the ladder\'s elite. Three rounds against the sharpest names the Dawnflame\'s daughters care to field — ending, if you survive that far, across the sand from Azrin Leodones herself. A Supercup is the closest thing to a crown that isn\'t one. Yet.',
    rounds: [
      R('Supercup Quarterfinal', 'known', 'champion', 3),
      R('Supercup Semifinal', 'known', 'crown', 3, { knownId: 'azrael' }),
      R('THE SUPERCUP FINAL', 'known', 'legend', 3, { knownId: 'azrin' }),
    ],
    tp: { champion: 44, finalist: 26, semifinal: 15, entered: 4 }, prizeShards: 7500,
    minMMR: 2400, onDemand: true,
  },
  legend_showdown: {
    id: 'legend_showdown', name: 'The Legend Showdown', short: 'Showdown', venue: 'The Worldring, Terra City', classKind: 'Legends',
    blurb: 'The highest invitational the ladder offers a living tamer: a gauntlet of the very best the world can field, ending against the crown itself. No EXP, no mercy, no second bracket. Only the tiniest handful of tamers ever post the MMR to be asked — and fewer still walk out of the Showdown as anything but humbled. Are you one of them?',
    rounds: [
      R('Showdown Opener', 'known', 'champion', 3),
      R('Showdown Semifinal', 'known', 'crown', 3, { knownId: 'ezekiel' }),
      R('THE SHOWDOWN', 'known', 'legend', 3, { knownId: 'azrin' }),
    ],
    tp: { champion: 50, finalist: 30, semifinal: 18, entered: 4 }, prizeShards: 9000,
    minMMR: 2600, onDemand: true,
  },
};

/** The on-demand, MMR-gated invitationals, in ascending difficulty — drives the select grid. */
export const ON_DEMAND_TIER_IDS = ['lemon_interguild', 'aetherline_circuit', 'leodones_supercup', 'legend_showdown', 'legends_gauntlet'];

// ============================================================
// THE SCHEDULE — deterministic from the Calendar.
// Ringnight every Saturday (day%7===5); a rotating major every
// Sunday (day%7===6). Eight-week cycle building to the Worlds.
// ============================================================
const MAJOR_ROTATION = ['turmal_seasonal', 'foretales_exhibition', 'continental_crown', 'aurelia_cup', 'gauntlet_seeds', 'sealwatch', 'turmal_seasonal', 'world_championship'];
const CONTINENTS: Continent[] = ['Olivar', 'Veyra', 'Tharkand', 'Noruun'];
const SIGNUP_WINDOW = 3; // days before the event sign-ups open

export interface ScheduledEvent {
  key: string; tierId: string; tier: TournamentTier; day: number; signupDay: number; continent?: Continent;
}

function eventForDay(day: number): ScheduledEvent | null {
  const wd = ((day % 7) + 7) % 7;            // 0=Mon … 5=Sat … 6=Sun
  const week = Math.floor(day / 7);
  let tierId: string | null = null;
  let continent: Continent | undefined;
  if (wd === 5) {
    tierId = 'weekly_open';
  } else if (wd === 6) {
    tierId = MAJOR_ROTATION[week % MAJOR_ROTATION.length];
    if (tierId === 'continental_crown') continent = CONTINENTS[Math.floor(week / MAJOR_ROTATION.length) % CONTINENTS.length];
  }
  if (!tierId) return null;
  const tier = TIERS[tierId];
  return { key: `${tierId}@${day}`, tierId, tier, day, signupDay: day - SIGNUP_WINDOW, continent };
}

/** Upcoming events from `fromDay`, inclusive, soonest first. */
export function upcomingEvents(fromDay = calendarDayOf(), count = 4): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  for (let d = fromDay; d < fromDay + 70 && out.length < count; d++) {
    const e = eventForDay(d);
    if (e) out.push(e);
  }
  return out;
}

/** The event whose sign-up window is open today (signupDay ≤ today ≤ day), if any. */
export function openSignupEvent(today = calendarDayOf()): ScheduledEvent | null {
  for (let d = today; d <= today + SIGNUP_WINDOW; d++) {
    const e = eventForDay(d);
    if (e && e.signupDay <= today && today <= e.day) return e;
  }
  return null;
}

// ---------------- the flashing HUD alert ----------------
export interface TournamentAlert { text: string; flashing: boolean; }

export function getTournamentAlert(p: Player | null = Player.activeInstance): TournamentAlert | null {
  if (!p) return null;
  const today = p.calendarDay;
  // registered → remind the player to begin
  if (p.tournament.registeredEventId) {
    const tier = TIERS[p.tournament.registeredEventId];
    const when = p.tournament.registeredDay;
    if (tier) {
      const days = when - today;
      const whenTxt = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      return { text: `✅ Registered: ${tier.short} (${whenTxt}) — see the Coliseum attendant to begin`, flashing: true };
    }
  }
  // open sign-up window → flash the call to sign
  const ev = openSignupEvent(today);
  if (ev) {
    const days = ev.day - today;
    const whenTxt = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return { text: `🏟️ ${ev.tier.short} ${whenTxt} — sign up now at the Coliseum`, flashing: true };
  }
  return null;
}

let alertWired = false;
/** Fire a one-time toast when a new sign-up window opens. Call from main after load. */
export function initTournaments(): void {
  if (alertWired) return;
  alertWired = true;
  const check = () => {
    const p = Player.activeInstance;
    if (!p) return;
    const ev = openSignupEvent(p.calendarDay);
    if (ev && p.tournament.signupSeenDay !== ev.signupDay && !p.tournament.registeredEventId) {
      p.tournament.signupSeenDay = ev.signupDay;
      p.save(false);
      toast(`🏟️ ${ev.tier.name} — sign-ups open! Head to the Coliseum (${Math.max(0, ev.day - p.calendarDay)}d to register).`, 'gold', 4200);
    }
  };
  (window as any).__onCalendarChange = check;
  check();
}

// ============================================================
// THE BRACKET RUNNER — EXP disabled, escalating opponents.
// ============================================================
type RunBattle = (specs: Mon[], opts: any) => Promise<'win' | 'lose' | 'flee'>;

function pickKnownFor(round: RoundDef, ev?: ScheduledEvent): KnownName {
  if (round.knownId && KNOWN_BY_ID[round.knownId]) return KNOWN_BY_ID[round.knownId];
  if (round.byContinent && ev?.continent) {
    const pool = KNOWN_NAMES.filter(k => k.continent === ev.continent);
    if (pool.length) return pool.reduce((a, b) => (a.continentRank <= b.continentRank ? a : b));
  }
  return rnd(KNOWN_NAMES);
}

interface RoundFoe { label: string; sub: string; color: string; specs: Mon[]; quote: string; }
function buildFoe(round: RoundDef, ev?: ScheduledEvent): RoundFoe {
  if (round.stratum === 'known') {
    const k = pickKnownFor(round, ev);
    return { label: k.name, sub: `${k.epithet} · ${guildName(k.guildId)}`, color: k.color, specs: teamFromIds(k.team, round.power), quote: k.quote };
  }
  if (round.stratum === 'city') {
    const c = round.cityId ? CITY_BY_ID[round.cityId] : rnd(CITY_CHAMPIONS);
    return { label: c.name, sub: `${c.epithet} · ${c.city}`, color: c.color, specs: teamFromIds(c.team, round.power), quote: c.quote };
  }
  const o = randomGuildOpponent(round.power, round.size);
  return { label: o.name, sub: guildName(o.guildId), color: o.color, specs: o.team, quote: o.quote };
}

export interface BracketCompetitor {
  id: string;
  name: string;
  sub: string;
  color: string;
  quote: string;
  rating: number;
  hometown: string;
  guildId: string;
  isPlayer: boolean;
  speciesIds: string[];
  keyForRound?: number;
}

export interface TournamentBracket {
  tierId: string;
  roundsCount: number;
  rounds: BracketCompetitor[][];
  matches: {
    competitorA: BracketCompetitor;
    competitorB: BracketCompetitor;
    winnerId?: string;
  }[][];
}

export function getPlayerPartyLevels(p: Player): { avg: number; max: number } {
  const levels = p.party.map(g => g.level);
  if (!levels.length) return { avg: 1, max: 1 };
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const max = Math.max(...levels);
  return { avg, max };
}

export function getRoundScaling(
  tier: TournamentTier,
  roundIndex: number,
  totalRounds: number,
  playerLevels: { avg: number; max: number }
): { level: number; statMultiplier: number } {
  const isWorlds = tier.id === 'world_championship';
  const isFinal = roundIndex === totalRounds - 1;
  const isSemi = roundIndex === totalRounds - 2;
  const isQuarter = roundIndex === totalRounds - 3;

  if (isWorlds) {
    if (roundIndex === 4) { // Crown Match
      return { level: playerLevels.max + 5, statMultiplier: 1.25 };
    } else if (isFinal) {
      return { level: playerLevels.max + 3, statMultiplier: 1.15 };
    } else if (isSemi) {
      return { level: playerLevels.max + 2, statMultiplier: 1.10 };
    } else if (isQuarter) {
      return { level: playerLevels.max + 1, statMultiplier: 1.05 };
    } else { // Round of 8
      return { level: playerLevels.max, statMultiplier: 1.02 };
    }
  } else {
    if (isFinal) {
      return { level: playerLevels.max + 1, statMultiplier: 1.05 };
    } else if (isSemi) {
      return { level: Math.round(playerLevels.avg), statMultiplier: 1.00 }; // Same stats!
    } else {
      return { level: Math.max(1, Math.round(playerLevels.avg) - 2), statMultiplier: 0.95 };
    }
  }
}

export function hometownForTamer(id: string): string {
  const map: Record<string, string> = {
    azrin: 'Haven City',
    azrael: 'Haven City',
    ezekiel: 'Terra City',
    raphael: 'Terra City',
    clyde_b: 'Hyujon',
    anthony_o: 'New Salmonan',
    louie_b: 'Agdao Island',
    paulo_b: 'Haven City',
    ivan_lawrence: 'Terra City',
    maris: 'Veyra Wards',
    haven: 'Haven City',
    salmonan: 'New Salmonan',
    agdao: 'Agdao Island',
    terra: 'Terra City',
    hyujon: 'Hyujon',
  };
  return map[id] ?? 'Olivar';
}

export function buildBracketCompetitorFromKnown(p: Player, k: KnownName): BracketCompetitor {
  const mmr = getCompetitorMMR(p, k.id);
  return {
    id: k.id,
    name: k.name,
    sub: `${k.epithet} · ${guildName(k.guildId)}`,
    color: k.color,
    quote: k.quote,
    rating: mmr ? mmr.rating : (1800 - k.worldRank * 30),
    hometown: hometownForTamer(k.id),
    guildId: k.guildId,
    isPlayer: false,
    speciesIds: k.team,
  };
}

export function buildBracketCompetitorFromCity(p: Player, c: CityChampion): BracketCompetitor {
  const mmr = getCompetitorMMR(p, c.id);
  return {
    id: c.id,
    name: c.name,
    sub: `${c.epithet} · ${c.city}`,
    color: c.color,
    quote: c.quote,
    rating: mmr ? mmr.rating : 1500,
    hometown: c.city,
    guildId: c.guildId,
    isPlayer: false,
    speciesIds: c.team,
  };
}

function speciesForProceduralTamer(guildId: string, power: PowerTier, size: number): string[] {
  const guild = WORLD_GUILDS.find(g => g.id === guildId) ?? rnd(WORLD_GUILDS);
  const types = GUILD_TYPES[guild.id] ?? ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether'];
  const { stages } = POWER[power];
  const out: string[] = [];
  for (let i = 0; i < size; i++) {
    const pool = speciesByType(rnd(types), stages);
    out.push(pool.length ? rnd(pool) : 'cindcub');
  }
  return out;
}

export function buildKeyOpponent(
  p: Player,
  roundDef: RoundDef,
  roundIndex: number,
  ev: ScheduledEvent | undefined,
  usedIds: Set<string>
): BracketCompetitor {
  if (roundDef.knownId && KNOWN_BY_ID[roundDef.knownId]) {
    return buildBracketCompetitorFromKnown(p, KNOWN_BY_ID[roundDef.knownId]);
  }
  if (roundDef.cityId && CITY_BY_ID[roundDef.cityId]) {
    return buildBracketCompetitorFromCity(p, CITY_BY_ID[roundDef.cityId]);
  }
  if (roundDef.stratum === 'known') {
    if (roundDef.byContinent && ev?.continent) {
      const pool = KNOWN_NAMES.filter(k => k.continent === ev.continent && !usedIds.has(k.id));
      if (pool.length) {
        const k = pool.reduce((a, b) => (a.continentRank <= b.continentRank ? a : b));
        return buildBracketCompetitorFromKnown(p, k);
      }
    }
    const pool = KNOWN_NAMES.filter(k => !usedIds.has(k.id));
    const k = pool.length ? rnd(pool) : rnd(KNOWN_NAMES);
    return buildBracketCompetitorFromKnown(p, k);
  }
  if (roundDef.stratum === 'city') {
    const pool = CITY_CHAMPIONS.filter(c => !usedIds.has(c.id));
    const c = pool.length ? rnd(pool) : rnd(CITY_CHAMPIONS);
    return buildBracketCompetitorFromCity(p, c);
  }

  // Draw procedural competitor from the live MMR database!
  const c = drawProceduralContestant(p, usedIds);
  return {
    id: c.id,
    name: c.name,
    sub: c.title,
    color: c.color,
    quote: 'May the better bond win.',
    rating: c.rating,
    hometown: c.hometown,
    guildId: c.guildId,
    isPlayer: false,
    speciesIds: c.speciesIds,
  };
}

export function buildFillerCompetitor(
  p: Player,
  tier: TournamentTier,
  roundPower: PowerTier,
  size: number,
  usedIds: Set<string>
): BracketCompetitor {
  const roll = Math.random();
  if (roll < 0.3) {
    const available = KNOWN_NAMES.filter(k => !usedIds.has(k.id));
    if (available.length) {
      const k = rnd(available);
      return buildBracketCompetitorFromKnown(p, k);
    }
  }
  if (roll < 0.5) {
    const available = CITY_CHAMPIONS.filter(c => !usedIds.has(c.id));
    if (available.length) {
      const c = rnd(available);
      return buildBracketCompetitorFromCity(p, c);
    }
  }
  if (roll < 0.7) {
    const available = WORLD_CIRCUIT.filter(wc => !usedIds.has('pro_' + wc.rank));
    if (available.length) {
      const entry = rnd(available);
      const mmr = getCompetitorMMR(p, 'pro_' + entry.rank);
      const guild = WORLD_GUILDS.find(g => g.name.toLowerCase().includes(entry.house.toLowerCase()) || entry.house.toLowerCase().includes(g.name.toLowerCase())) ?? rnd(WORLD_GUILDS);
      const types = GUILD_TYPES[guild.id] ?? ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether'];
      const { stages } = POWER[roundPower];
      const speciesIds: string[] = [];
      for (let i = 0; i < size; i++) {
        const pool = speciesByType(rnd(types), stages);
        speciesIds.push(pool.length ? rnd(pool) : 'cindcub');
      }
      return {
        id: 'pro_' + entry.rank,
        name: entry.name,
        sub: `${entry.title} · ${entry.house}`,
        color: entry.color,
        quote: 'May the better bond win.',
        rating: mmr ? mmr.rating : (1400 - entry.rank * 10),
        hometown: 'Haven City',
        guildId: guild.id,
        isPlayer: false,
        speciesIds: mmr ? mmr.speciesIds : speciesIds,
      };
    }
  }

  // Draw procedural competitor from the live MMR database!
  const c = drawProceduralContestant(p, usedIds);
  return {
    id: c.id,
    name: c.name,
    sub: c.title,
    color: c.color,
    quote: 'May the better bond win.',
    rating: c.rating,
    hometown: c.hometown,
    guildId: c.guildId,
    isPlayer: false,
    speciesIds: c.speciesIds,
  };
}

export function generateBracket(p: Player, tier: TournamentTier, ev?: ScheduledEvent): TournamentBracket {
  const roundsCount = tier.rounds.length;

  if (tier.format === 'round_robin') {
    const competitors: BracketCompetitor[] = new Array(4);
    const usedIds = new Set<string>();

    competitors[0] = {
      id: 'player',
      name: p.tamerName,
      sub: 'You',
      color: '#f2c14e',
      quote: '',
      rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
      hometown: 'Haven City',
      guildId: p.houseId ?? 'grand_houses',
      isPlayer: true,
      speciesIds: p.party.map(g => g.speciesId),
    };
    usedIds.add('player');

    const finalRoundDef = tier.rounds[roundsCount - 1];
    const keyOpp = buildKeyOpponent(p, finalRoundDef, roundsCount - 1, ev, usedIds);
    keyOpp.keyForRound = roundsCount - 1;
    competitors[1] = keyOpp;
    usedIds.add(keyOpp.id);

    const firstRoundDef = tier.rounds[0];
    competitors[2] = buildFillerCompetitor(p, tier, firstRoundDef.power, firstRoundDef.size, usedIds);
    usedIds.add(competitors[2].id);
    competitors[3] = buildFillerCompetitor(p, tier, firstRoundDef.power, firstRoundDef.size, usedIds);
    usedIds.add(competitors[3].id);

    const rounds: BracketCompetitor[][] = [];
    rounds.push([competitors[0], competitors[1], competitors[2], competitors[3]]); // Matchday 1: 0 vs 1, 2 vs 3
    rounds.push([competitors[0], competitors[2], competitors[1], competitors[3]]); // Matchday 2: 0 vs 2, 1 vs 3
    rounds.push([competitors[0], competitors[3], competitors[1], competitors[2]]); // Matchday 3: 0 vs 3, 1 vs 2

    const matches: any[][] = [[], [], [], []];

    return { tierId: tier.id, roundsCount: 4, rounds, matches };
  }

  const size = Math.pow(2, roundsCount);
  const competitors: BracketCompetitor[] = new Array(size);
  const usedIds = new Set<string>();

  competitors[0] = {
    id: 'player',
    name: p.tamerName,
    sub: 'You',
    color: '#f2c14e',
    quote: '',
    rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
    hometown: 'Haven City',
    guildId: p.houseId ?? 'grand_houses',
    isPlayer: true,
    speciesIds: p.party.map(g => g.speciesId),
  };
  usedIds.add('player');

  // Place key opponents at indices 2^r
  for (let r = 0; r < roundsCount; r++) {
    const roundDef = tier.rounds[r];
    const keyOpp = buildKeyOpponent(p, roundDef, r, ev, usedIds);
    keyOpp.keyForRound = r;
    competitors[Math.pow(2, r)] = keyOpp;
    usedIds.add(keyOpp.id);
  }

  // Fill remaining slots
  for (let i = 0; i < size; i++) {
    if (competitors[i]) continue;
    const roundDef = tier.rounds[0];
    const comp = buildFillerCompetitor(p, tier, roundDef.power, roundDef.size, usedIds);
    competitors[i] = comp;
    usedIds.add(comp.id);
  }

  const rounds: BracketCompetitor[][] = [];
  rounds.push(competitors);
  
  const matches: any[][] = [];
  for (let r = 0; r < roundsCount; r++) {
    matches.push([]);
  }

  return { tierId: tier.id, roundsCount, rounds, matches };
}

export function simulateRound(p: Player, bracket: TournamentBracket, roundIndex: number): void {
  const activeCompetitors = bracket.rounds[roundIndex];
  const matchResults = bracket.matches[roundIndex];

  if (matchResults.length > 0) return;

  for (let i = 0; i < activeCompetitors.length; i += 2) {
    const compA = activeCompetitors[i];
    const compB = activeCompetitors[i + 1];

    if (compA.isPlayer || compB.isPlayer) {
      matchResults.push({ competitorA: compA, competitorB: compB });
      continue;
    }

    let winner: BracketCompetitor;

    if (compA.keyForRound !== undefined && compA.keyForRound > roundIndex) {
      winner = compA;
    } else if (compB.keyForRound !== undefined && compB.keyForRound > roundIndex) {
      winner = compB;
    } else {
      const rA = Math.max(100, compA.rating);
      const rB = Math.max(100, compB.rating);
      const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
      winner = Math.random() < probA ? compA : compB;
    }

    matchResults.push({
      competitorA: compA,
      competitorB: compB,
      winnerId: winner.id,
    });

    const loser = winner.id === compA.id ? compB : compA;
    updateBackgroundElo(p, winner.id, loser.id);
  }
}

const ringTheme = (tier: TournamentTier): 'cavern' | 'vault' | 'storm' =>
  tier.classKind === 'Championship' || tier.classKind === 'Legends' || tier.id === 'sealwatch' ? 'storm'
    : tier.id === 'turmal_seasonal' || tier.id === 'aurelia_cup' ? 'vault' : 'cavern';

/**
 * Run a full sanctioned bracket. Resolves when the player is eliminated
 * or crowned. Awards Tournament Points by placement, never EXP.
 */
export async function runTournament(p: Player, tier: TournamentTier, ev?: ScheduledEvent): Promise<void> {
  const runBattle = (window as any).__runBattle as RunBattle | undefined;
  if (!runBattle) { await say('Attendant Lyssa', 'The Ring crews aren\'t ready — try again in a moment.'); return; }
  if (!p.party.length) { await say('Attendant Lyssa', 'You need at least one Guardian in your party to enter the Ring.'); return; }

  let bracket: TournamentBracket | undefined;
  let finalOpponent: { name: string; sub: string; color: string; speciesIds: string[] } | undefined;

  p.tournament.entries[tier.id] = (p.tournament.entries[tier.id] ?? 0) + 1;

  await say('Attendant Lyssa', `Welcome to ${tier.name}, at ${tier.venue}. ${tier.blurb}`);
  await say('Attendant Lyssa', '⚔️ Remember the law of the Ring: no EXP is awarded in a sanctioned match. You fight with the team you built — and the bracket measures it. Your Guardians are healed before every round. Good luck out there.');

  const rounds = tier.rounds;
  let placement: 'champion' | 'finalist' | 'semifinal' | 'entered' = 'entered';
  const total = rounds.length;

  if (tier.id === 'legends_gauntlet') {
    for (let i = 0; i < total; i++) {
      const round = rounds[i];
      const foe = buildFoe(round, ev);
      const isFinal = i === total - 1;
      const isSemi = i === total - 2;

      p.healAll();
      (window as any).__refreshHUD?.();

      await say('🏟️ ' + tier.short, `${round.name} — you face ${foe.label}, ${foe.sub}.`);
      if (foe.quote && foe.quote !== '…') await say(foe.label, foe.quote);

      const playerComp: BracketCompetitor = {
        id: 'player',
        name: p.tamerName,
        sub: 'You',
        color: '#f2c14e',
        quote: '',
        rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
        hometown: 'Haven City',
        guildId: p.houseId ?? 'grand_houses',
        isPlayer: true,
        speciesIds: p.party.map(g => g.speciesId),
      };

      const oppComp: BracketCompetitor = {
        id: round.knownId || round.cityId || foe.label,
        name: foe.label,
        sub: foe.sub,
        color: foe.color,
        quote: foe.quote,
        rating: (round.knownId ? getCompetitorMMR(p, round.knownId)?.rating : round.cityId ? getCompetitorMMR(p, round.cityId)?.rating : null) || 1850,
        hometown: hometownForTamer(round.knownId || 'haven'),
        guildId: 'grand_houses',
        isPlayer: false,
        speciesIds: foe.specs.map(m => m.speciesId),
      };

      await showTournamentMatchIntro(playerComp, oppComp, tier, round.name);

      const winLine = isFinal ? `${round.name} — the title is yours!` : `${round.name} — you advance!`;
      const res = await runBattle(foe.specs, {
        boss: isFinal || round.stratum === 'known',
        noExp: true, noLoot: true,
        theme: ringTheme(tier),
        intro: `🏟️ ${tier.short} · ${round.name} — ${foe.label} steps onto the ring!`,
        winLine,
        ring: styleFor(tier, isFinal, ev),
      });

      p.healAll();
      (window as any).__refreshHUD?.();

      if (res !== 'win') {
        p.tournament.tournamentMatchesLost = (p.tournament.tournamentMatchesLost ?? 0) + 1;
        p.tournament.currentStreak = 0;
        p.save(false);
        const oppId = round.knownId || round.cityId || 'procedural';
        updatePlayerElo(p, oppId, false);

        placement = isFinal ? 'finalist' : isSemi ? 'semifinal' : 'entered';
        await say('Attendant Lyssa', placement === 'finalist'
          ? `A finalist's run! ${foe.label} takes the title this time — but the whole circuit saw how close you came.`
          : placement === 'semifinal'
          ? `Out in the semifinal — a strong showing. The standings will remember it.`
          : `Eliminated in ${round.name}. Every champion loses brackets before they win them. Come back when the horns sound again.`);
        break;
      }

      p.tournament.tournamentMatchesWon = (p.tournament.tournamentMatchesWon ?? 0) + 1;
      p.tournament.currentStreak = (p.tournament.currentStreak ?? 0) + 1;
      p.tournament.bestStreak = Math.max(p.tournament.bestStreak ?? 0, p.tournament.currentStreak);
      p.save(false);
      const oppId = round.knownId || round.cityId || 'procedural';
      updatePlayerElo(p, oppId, true);

      if (round.stratum === 'known') {
        const k = pickKnownForRecord(round, ev, foe.label);
        if (k && !p.tournament.defeated.includes(k.id)) p.tournament.defeated.push(k.id);
      }
      if (isFinal) {
        placement = 'champion';
        finalOpponent = {
          name: foe.label,
          sub: foe.sub,
          color: foe.color,
          speciesIds: foe.specs.map(m => m.speciesId),
        };
      }
    }
  } else if (tier.format === 'round_robin') {
    bracket = generateBracket(p, tier, ev);

    for (let i = 0; i < 3; i++) {
      const round = rounds[i];
      simulateRound(p, bracket, i);

      const opp = bracket.rounds[i][1];
      const pLevels = getPlayerPartyLevels(p);
      const scaling = getRoundScaling(tier, i, total, pLevels);

      const specs = opp.speciesIds.map(sid => ({
        speciesId: sid,
        level: scaling.level,
        statMultiplier: scaling.statMultiplier,
      }));

      p.healAll();
      (window as any).__refreshHUD?.();

      await showBracketTreeScreen(bracket, i, tier);

      await say('🏟️ ' + tier.short, `Matchday ${i + 1} — you face ${opp.name}, ${opp.sub}.`);
      if (opp.quote && opp.quote !== '…') await say(opp.name, opp.quote);

      const playerComp: BracketCompetitor = {
        id: 'player',
        name: p.tamerName,
        sub: 'You',
        color: '#f2c14e',
        quote: '',
        rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
        hometown: 'Haven City',
        guildId: p.houseId ?? 'grand_houses',
        isPlayer: true,
        speciesIds: p.party.map(g => g.speciesId),
      };

      await showTournamentMatchIntro(playerComp, opp, tier, round.name);

      const winLine = `Matchday ${i + 1} — fight!`;
      const res = await runBattle(specs, {
        boss: round.stratum === 'known',
        noExp: true, noLoot: true,
        theme: ringTheme(tier),
        intro: `🏟️ ${tier.short} · Matchday ${i + 1} — ${opp.name} steps onto the ring!`,
        winLine,
        ring: styleFor(tier, false, ev),
      });

      p.healAll();
      (window as any).__refreshHUD?.();

      if (res !== 'win') {
        p.tournament.tournamentMatchesLost = (p.tournament.tournamentMatchesLost ?? 0) + 1;
        p.tournament.currentStreak = 0;
        p.save(false);
        updatePlayerElo(p, opp.id, false);
      } else {
        p.tournament.tournamentMatchesWon = (p.tournament.tournamentMatchesWon ?? 0) + 1;
        p.tournament.currentStreak = (p.tournament.currentStreak ?? 0) + 1;
        p.tournament.bestStreak = Math.max(p.tournament.bestStreak ?? 0, p.tournament.currentStreak);
        p.save(false);
        updatePlayerElo(p, opp.id, true);
      }

      const playerMatch = bracket.matches[i].find(m => m.competitorA.isPlayer || m.competitorB.isPlayer)!;
      playerMatch.winnerId = res === 'win' ? 'player' : opp.id;
    }

    const winCounts: Record<string, number> = {};
    for (const c of bracket.rounds[0]) {
      winCounts[c.id] = 0;
    }
    for (let r = 0; r < 3; r++) {
      for (const m of bracket.matches[r]) {
        if (m.winnerId) {
          winCounts[m.winnerId] = (winCounts[m.winnerId] ?? 0) + 1;
        }
      }
    }

    const sorted = [...bracket.rounds[0]].sort((a, b) => winCounts[b.id] - winCounts[a.id]);
    const top1 = sorted[0];
    const top2 = sorted[1];

    bracket.rounds.push([top1, top2]);

    const playerInFinal = top1.isPlayer || top2.isPlayer;

    if (playerInFinal) {
      const opp = top1.isPlayer ? top2 : top1;
      const pLevels = getPlayerPartyLevels(p);
      const scaling = getRoundScaling(tier, 3, total, pLevels);

      const specs = opp.speciesIds.map(sid => ({
        speciesId: sid,
        level: scaling.level,
        statMultiplier: scaling.statMultiplier,
      }));

      bracket.matches[3].push({ competitorA: top1, competitorB: top2 });

      p.healAll();
      (window as any).__refreshHUD?.();

      await showBracketTreeScreen(bracket, 3, tier);

      await say('🏟️ ' + tier.short, `THE GRAND FINAL — you face ${opp.name}, ${opp.sub}!`);
      if (opp.quote && opp.quote !== '…') await say(opp.name, opp.quote);

      const playerComp: BracketCompetitor = {
        id: 'player',
        name: p.tamerName,
        sub: 'You',
        color: '#f2c14e',
        quote: '',
        rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
        hometown: 'Haven City',
        guildId: p.houseId ?? 'grand_houses',
        isPlayer: true,
        speciesIds: p.party.map(g => g.speciesId),
      };

      await showTournamentMatchIntro(playerComp, opp, tier, 'Grand Final');

      const res = await runBattle(specs, {
        boss: true,
        noExp: true, noLoot: true,
        theme: ringTheme(tier),
        intro: `🏟️ ${tier.short} · The Final — ${opp.name} steps onto the ring!`,
        winLine: 'The Final — the title is yours!',
        ring: styleFor(tier, true, ev),
      });

      p.healAll();
      (window as any).__refreshHUD?.();

      if (res !== 'win') {
        p.tournament.tournamentMatchesLost = (p.tournament.tournamentMatchesLost ?? 0) + 1;
        p.tournament.currentStreak = 0;
        p.save(false);
        updatePlayerElo(p, opp.id, false);
      } else {
        p.tournament.tournamentMatchesWon = (p.tournament.tournamentMatchesWon ?? 0) + 1;
        p.tournament.currentStreak = (p.tournament.currentStreak ?? 0) + 1;
        p.tournament.bestStreak = Math.max(p.tournament.bestStreak ?? 0, p.tournament.currentStreak);
        p.save(false);
        updatePlayerElo(p, opp.id, true);
      }

      const finalMatch = bracket.matches[3][0];
      finalMatch.winnerId = res === 'win' ? 'player' : opp.id;

      await showBracketTreeScreen(bracket, 4, tier);

      if (res === 'win') {
        placement = 'champion';
        finalOpponent = {
          name: opp.name,
          sub: opp.sub,
          color: opp.color,
          speciesIds: opp.speciesIds,
        };
      } else {
        placement = 'finalist';
        await say('Attendant Lyssa', `A finalist's run! ${opp.name} takes the title this time.`);
      }
    } else {
      const rA = Math.max(100, top1.rating);
      const rB = Math.max(100, top2.rating);
      const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
      const winnerId = Math.random() < probA ? top1.id : top2.id;
      bracket.matches[3].push({ competitorA: top1, competitorB: top2, winnerId });

      await showBracketTreeScreen(bracket, 4, tier);

      placement = 'entered';
      await say('Attendant Lyssa', `You finished with ${winCounts['player'] || 0} wins in the group stage. The final was contested between ${top1.name} and ${top2.name}, with ${winnerId === top1.id ? top1.name : top2.name} claiming the crown.`);
    }
  } else {
    bracket = generateBracket(p, tier, ev);

    for (let i = 0; i < total; i++) {
      const round = rounds[i];
      const isFinal = i === total - 1;
      const isSemi = i === total - 2;

      simulateRound(p, bracket, i);

      const opp = bracket.rounds[i][1];
      const pLevels = getPlayerPartyLevels(p);
      const scaling = getRoundScaling(tier, i, total, pLevels);

      const specs = opp.speciesIds.map(sid => ({
        speciesId: sid,
        level: scaling.level,
        statMultiplier: scaling.statMultiplier,
      }));

      p.healAll();
      (window as any).__refreshHUD?.();

      await showBracketTreeScreen(bracket, i, tier);

      await say('🏟️ ' + tier.short, `${round.name} — you face ${opp.name}, ${opp.sub}.`);
      if (opp.quote && opp.quote !== '…') await say(opp.name, opp.quote);
      else if (opp.quote === '…') await say(opp.name, '… (the Gray Cur says nothing.)');

      const playerComp: BracketCompetitor = {
        id: 'player',
        name: p.tamerName,
        sub: 'You',
        color: '#f2c14e',
        quote: '',
        rating: p.mmrState ? p.mmrState.playerRating : (p.tournamentPoints + 1200),
        hometown: 'Haven City',
        guildId: p.houseId ?? 'grand_houses',
        isPlayer: true,
        speciesIds: p.party.map(g => g.speciesId),
      };

      await showTournamentMatchIntro(playerComp, opp, tier, round.name);

      const winLine = isFinal ? `${round.name} — the title is yours!` : `${round.name} — you advance!`;
      const res = await runBattle(specs, {
        boss: isFinal || round.stratum === 'known',
        noExp: true, noLoot: true,
        theme: ringTheme(tier),
        intro: `🏟️ ${tier.short} · ${round.name} — ${opp.name} steps onto the ring!`,
        winLine,
        ring: styleFor(tier, isFinal, ev),
      });

      p.healAll();
      (window as any).__refreshHUD?.();

      if (res !== 'win') {
        p.tournament.tournamentMatchesLost = (p.tournament.tournamentMatchesLost ?? 0) + 1;
        p.tournament.currentStreak = 0;
        p.save(false);
        updatePlayerElo(p, opp.id, false);

        const playerMatch = bracket.matches[i].find(m => m.competitorA.isPlayer || m.competitorB.isPlayer)!;
        playerMatch.winnerId = opp.id;

        let activeRound = i;
        while (activeRound < total) {
          const roundWinners: BracketCompetitor[] = [];
          for (const m of bracket.matches[activeRound]) {
            if (!m.winnerId) {
              const rA = Math.max(100, m.competitorA.rating);
              const rB = Math.max(100, m.competitorB.rating);
              const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
              m.winnerId = Math.random() < probA ? m.competitorA.id : m.competitorB.id;
            }
            roundWinners.push(m.winnerId === m.competitorA.id ? m.competitorA : m.competitorB);
            const w = m.winnerId === m.competitorA.id ? m.competitorA : m.competitorB;
            const l = m.winnerId === m.competitorA.id ? m.competitorB : m.competitorA;
            updateBackgroundElo(p, w.id, l.id);
          }
          bracket.rounds.push(roundWinners);

          const nextRound = activeRound + 1;
          if (nextRound < total) {
            const nextCompetitors = bracket.rounds[nextRound];
            for (let k = 0; k < nextCompetitors.length; k += 2) {
              const compA = nextCompetitors[k];
              const compB = nextCompetitors[k + 1];
              const rA = Math.max(100, compA.rating);
              const rB = Math.max(100, compB.rating);
              const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
              const winnerId = Math.random() < probA ? compA.id : compB.id;
              bracket.matches[nextRound].push({ competitorA: compA, competitorB: compB, winnerId });
              const w = winnerId === compA.id ? compA : compB;
              const l = winnerId === compA.id ? compB : compA;
              updateBackgroundElo(p, w.id, l.id);
            }
          }
          activeRound++;
        }

        await showBracketTreeScreen(bracket, total, tier);

        placement = isFinal ? 'finalist' : isSemi ? 'semifinal' : 'entered';
        await say('Attendant Lyssa', placement === 'finalist'
          ? `A finalist's run! ${opp.name} takes the title this time — but the whole circuit saw how close you came.`
          : placement === 'semifinal'
          ? `Out in the semifinal — a strong showing. The standings will remember it.`
          : `Eliminated in ${round.name}. Every champion loses brackets before they win them. Come back when the horns sound again.`);
        break;
      }

      p.tournament.tournamentMatchesWon = (p.tournament.tournamentMatchesWon ?? 0) + 1;
      p.tournament.currentStreak = (p.tournament.currentStreak ?? 0) + 1;
      p.tournament.bestStreak = Math.max(p.tournament.bestStreak ?? 0, p.tournament.currentStreak);
      p.save(false);
      updatePlayerElo(p, opp.id, true);

      const playerMatch = bracket.matches[i].find(m => m.competitorA.isPlayer || m.competitorB.isPlayer)!;
      playerMatch.winnerId = 'player';

      const roundWinners: BracketCompetitor[] = [];
      for (const m of bracket.matches[i]) {
        roundWinners.push(m.winnerId === m.competitorA.id ? m.competitorA : m.competitorB);
      }
      bracket.rounds.push(roundWinners);

      if (round.stratum === 'known') {
        const k = pickKnownForRecord(round, ev, opp.name);
        if (k && !p.tournament.defeated.includes(k.id)) p.tournament.defeated.push(k.id);
      }
      if (isFinal) {
        placement = 'champion';
        finalOpponent = {
          name: opp.name,
          sub: opp.sub,
          color: opp.color,
          speciesIds: opp.speciesIds,
        };
      }
    }
  }

  // Calculate prediction results and award bonus Shards
  if (tier.id !== 'legends_gauntlet' && bracket && p.tournament.predictions) {
    let correctCount = 0;
    let totalPredicted = 0;
    
    const roundsCount = bracket.roundsCount;
    for (let r = 0; r < roundsCount; r++) {
      const matchCount = bracket.matches[r]?.length ?? 0;
      for (let m = 0; m < matchCount; m++) {
        const matchData = bracket.matches[r][m];
        if (matchData && matchData.winnerId !== undefined) {
          const matchKey = `${tier.id}_r${r}_m${m}`;
          const predictedId = p.tournament.predictions[matchKey];
          if (predictedId) {
            totalPredicted++;
            if (predictedId === matchData.winnerId) {
              correctCount++;
            }
          }
        }
      }
    }
    
    if (totalPredicted > 0) {
      const bonusShards = correctCount * 150;
      if (bonusShards > 0) {
        p.shards += bonusShards;
        await say('Coliseum Attendant', `📊 Prediction Results: You correctly guessed ${correctCount} of ${totalPredicted} matches! You earn a bonus of ◆${bonusShards} Shards.`);
      } else {
        await say('Coliseum Attendant', `📊 Prediction Results: None of your predictions were correct this time. Keep analyzing competitor teams!`);
      }
    }
    
    p.tournament.predictions = null;
    p.save(false);
  }

  await awardPlacement(p, tier, placement, ev, finalOpponent);
}

function pickKnownForRecord(round: RoundDef, ev: ScheduledEvent | undefined, label: string): KnownName | undefined {
  return KNOWN_NAMES.find(k => k.name === label) ?? (round.knownId ? KNOWN_BY_ID[round.knownId] : undefined);
}

// ============================================================
// ULTRA-RARE PRIZES — the officers' vault. A champion ranked
// Lieutenant-or-above leaves with a trophy nobody can buy: a random
// ultra-rare cosmetic (drawn from the Terra/Worldring pool when the
// final was fought in Terra City, else the circuit pool), and a
// chance — better in the bigger brackets — at an ultra-rare rod.
// ============================================================
/** RANKS index of Lieutenant — the floor for ultra-prize eligibility. */
const ULTRA_REWARD_MIN_RANK = RANKS.findIndex(r => r.name === 'Lieutenant');

/** Odds of also dropping an ultra-rare rod, by tournament class. */
const ULTRA_ROD_CHANCE: Record<TierClass, number> = {
  Local: 0.18, Seeding: 0.22, Regional: 0.30, Special: 0.42,
  Playoffs: 0.50, Championship: 0.70, Legends: 0.70,
  Guild: 0.48, Supercup: 0.66, Circuit: 0.46,
};

function pickUnowned<T extends { id: string }>(pool: T[], owned: string[]): T | null {
  const fresh = pool.filter(x => !owned.includes(x.id));
  if (!fresh.length) return null;
  return fresh[Math.floor(Math.random() * fresh.length)];
}

async function grantUltraRewards(p: Player, tier: TournamentTier, afterRank: number): Promise<void> {
  if (afterRank < ULTRA_REWARD_MIN_RANK) return;

  const fromTerra = /terra city/i.test(tier.venue); // the Worldring finals
  const source = fromTerra ? 'terra' : 'tournament';
  const cosmeticPool = Object.values(CLOTHES_DATABASE).filter(c => c.ultra && c.ultraSource === source);
  const won: string[] = [];

  const cos = pickUnowned(cosmeticPool, p.ownedClothes);
  if (cos) { p.ownedClothes.push(cos.id); won.push(`👕 ${cos.name}`); }

  if (Math.random() < (ULTRA_ROD_CHANCE[tier.classKind] ?? 0.25)) {
    const rod = pickUnowned(ALL_RODS.filter(r => r.ultra), p.fishing.ownedRods);
    if (rod) { p.fishing.ownedRods.push(rod.id); won.push(`🎣 ${rod.name}`); }
  }

  if (!won.length) return; // already own every trophy in the pool
  p.save(false);
  (window as any).__refreshHUD?.();

  const many = won.length > 1;
  toast(`✨ ULTRA-RARE PRIZE! ${won.join('  ·  ')}`, 'gold', 5200);
  await say('Attendant Lyssa',
    `One more thing, Champion — the officers' vault only opens for ranks of Lieutenant and above, and tonight it opened for you. Inside: ${won.join(' and ')}. ` +
    `${fromTerra ? 'Worldring craftsmanship — found nowhere on any shelf, on any continent.' : 'Found in no shop on four continents.'} ` +
    `Wear ${many ? 'them' : 'it'} proud — ${many ? 'they were' : 'it was'} earned in the Ring.`);
}

async function awardPlacement(
  p: Player,
  tier: TournamentTier,
  placement: 'champion' | 'finalist' | 'semifinal' | 'entered',
  _ev?: ScheduledEvent,
  finalOpponent?: { name: string; sub: string; color: string; speciesIds: string[] }
): Promise<void> {
  const beforeRank = rankIndexFor(p);
  const tp = tier.tp[placement];
  if (tp > 0) awardTournamentPoints(p, tp);

  const placeNum = placement === 'champion' ? 1 : placement === 'finalist' ? 2 : placement === 'semifinal' ? 4 : 8;
  const prev = p.tournament.bestPlacement[tier.id] ?? 99;
  if (placeNum < prev) p.tournament.bestPlacement[tier.id] = placeNum;

  if (placement === 'champion') {
    p.tournament.wins[tier.id] = (p.tournament.wins[tier.id] ?? 0) + 1;
    p.shards += tier.prizeShards;
    // Hot-streak bonus — a champion riding a long match streak banks extra Shards.
    const streak = p.tournament.currentStreak ?? 0;
    if (streak >= 5) {
      const streakBonus = streak * 60;
      p.shards += streakBonus;
      toast(`🔥 ${streak}-match streak bonus: +◆${streakBonus.toLocaleString()}!`, 'gold', 4200);
    }
    const title = `${tier.short} Champion`;
    if (!p.tournament.titles.includes(title)) p.tournament.titles.push(title);
    if (tier.classKind === 'Championship') p.tournament.worldTitles += 1;
    if (tier.id === 'world_championship') p.flags['world_champion'] = true;
    if (tier.id === 'legends_gauntlet') p.flags['beat_legends_gauntlet'] = true;

    // Create the TrophyEarned record!
    const trophyId = `trophy_${tier.id}_${Date.now()}`;
    const newTrophy: TrophyEarned = {
      id: trophyId,
      tierId: tier.id,
      tierName: tier.name,
      day: p.calendarDay,
      dateStr: dateLabel(p.calendarDay),
      finalOpponentName: finalOpponent?.name ?? 'Unknown Opponent',
      finalOpponentSub: finalOpponent?.sub ?? 'Challenger',
      finalOpponentColor: finalOpponent?.color ?? '#cccccc',
      finalOpponentSpeciesIds: finalOpponent?.speciesIds ?? [],
      playerParty: p.party.map(g => ({
        speciesId: g.speciesId,
        nickname: g.nickname,
        level: g.level,
      })),
    };
    p.tournament.trophies = p.tournament.trophies || [];
    p.tournament.trophies.push(newTrophy);
  }

  // clear any registration for this tier
  if (p.tournament.registeredEventId === tier.id) {
    p.tournament.registeredEventId = null;
    p.tournament.registeredDay = -1;
  }
  // Simulate background matches for other tamers when a tournament concludes
  simulateBackgroundMatches(p, 40);
  p.save(false);
  (window as any).__refreshHUD?.();

  if (placement === 'champion') {
    // The crowning — a full-screen, per-tier banner before the spoils are counted.
    await showChampionBanner(styleFor(tier, true, _ev), { tp: tier.tp.champion, shards: tier.prizeShards, title: `${tier.short} Champion` });
    
    // Showcase & Case UI sequence
    await showTrophyShowcase(p, tier.id);
    await new Promise<void>(resolve => {
      showTrophyCase(p, () => resolve());
    });

    toast(`🏆 ${tier.short} CHAMPION! +${tier.tp.champion} TP, ◆${tier.prizeShards}`, 'gold', 4500);
    await say('Attendant Lyssa', `CHAMPION! ${tier.name} is yours. The wall will carry your name, the vault opens — ◆${tier.prizeShards} and ${tier.tp.champion} Tournament Points. ${tier.classKind === 'Championship' ? 'You are WORLD CHAMPION. The Worldring will not forget this night.' : ''}`);
  } else if (tp > 0) {
    toast(`+${tp} TP — ${placement} at the ${tier.short}`, 'gold', 3500);
  }

  const afterRank = rankIndexFor(p);
  if (afterRank > beforeRank) {
    toast(`⬆️ RANK UP — you are now ${RANKS[afterRank].name}!`, 'gold', 4500);
    await say('Attendant Lyssa', `And your Universal Rank just moved — ${RANKS[afterRank].name}. "${RANKS[afterRank].epithet}" Rank only ever moves on tournament placements, so wear it proud. It was earned in the Ring.`);
  }

  // Champions ranked Lieutenant-or-above raid the officers' vault for ultra-rare trophy gear.
  if (placement === 'champion') await grantUltraRewards(p, tier, afterRank);
}

// ============================================================
// ENTRY REQUIREMENTS — the ladder is the ticket.
// ============================================================
export interface TierLock { locked: boolean; reasons: string[]; }
export function checkTierRequirement(p: Player, tier: TournamentTier): TierLock {
  const reasons: string[] = [];
  const mmr = getPlayerMMR(p);
  if (tier.minMMR && mmr < tier.minMMR) reasons.push(`Reach ${tier.minMMR.toLocaleString()} MMR — you're at ${mmr.toLocaleString()}`);
  if (tier.id === 'legends_gauntlet' && !p.flags['world_champion']) reasons.push('Become World Champion first');
  return { locked: reasons.length > 0, reasons };
}

// ============================================================
// THE LEMON INTER-GUILD — GUILD WARS.
// Eight guilds, three-tamer lineups, single elimination. The player
// marches at the front of their own guild; every tie is best-of-three
// against a rival guild's whole bench. New contestants, fresh lineups,
// the loudest team crown on four continents.
// ============================================================
interface GuildWarrior { id: string; name: string; epithet: string; quote: string; team: string[]; }

const GUILD_WAR_LINEUPS: Record<string, GuildWarrior[]> = {
  first_fire: [
    { id: 'gw_ff_1', name: 'Captain Brine Halloran', epithet: 'The Reefcaller', quote: 'Aurelia\'s sand raised me. I don\'t lose on water.', team: ['maelstrike', 'reefguard', 'tidefin'] },
    { id: 'gw_ff_2', name: 'Ysolde Marrow', epithet: 'The Steamveil', quote: 'Fire and tide, all at once. Mind the scald.', team: ['infernyx', 'tidefin', 'pyrofang'] },
    { id: 'gw_ff_3', name: 'Oka Sunback', epithet: 'The First-Fire Heir', quote: 'For the Circle. For the very first bond.', team: ['blazemaw', 'maelstrike', 'solarex'] },
  ],
  pearlwake: [
    { id: 'gw_pw_1', name: 'Maren Tidecaller', epithet: 'The Deepwarden', quote: 'The trench is patient. So am I.', team: ['leviathorn', 'abyssarch', 'nacrelord'] },
    { id: 'gw_pw_2', name: 'Coral Vane', epithet: 'The Pearl-Diver', quote: 'Down where it\'s dark, I\'m the only light.', team: ['nacrelord', 'reefguard', 'tidefin'] },
    { id: 'gw_pw_3', name: 'Dagon Pell', epithet: 'The Trenchlord', quote: 'Veyra runs deeper than you can hold your breath.', team: ['abyssarch', 'leviathorn', 'maelstrike'] },
  ],
  duneward: [
    { id: 'gw_dw_1', name: 'Sirocco Vane', epithet: 'The Sandstorm', quote: 'The desert eats the unprepared. Are you prepared?', team: ['pyrofang', 'voltrazar', 'blazemaw'] },
    { id: 'gw_dw_2', name: 'Khalid Drey', epithet: 'The Dune-Marshal', quote: 'Heat and lightning. The Assembly fields both.', team: ['stormapex', 'infernyx', 'raidenjin'] },
    { id: 'gw_dw_3', name: 'Tamsin Glaive', epithet: 'The Mirage', quote: 'You\'ll swear you saw the win coming. You didn\'t.', team: ['blazemaw', 'voltrazar', 'solarex'] },
  ],
  aurora_lodge: [
    { id: 'gw_al_1', name: 'Frost-Warden Eika', epithet: 'The Long Night', quote: 'We hold the line in Noruun so you can sleep. Stand up.', team: ['chthonix', 'erebusilk', 'phantasmoth'] },
    { id: 'gw_al_2', name: 'Bjorn Vael', epithet: 'The Sealkeeper', quote: 'The Ghandra seal weakens. So we never do.', team: ['phantasmoth', 'reefguard', 'erebusilk'] },
    { id: 'gw_al_3', name: 'Nim Hollow', epithet: 'The Aurora', quote: 'Beautiful, isn\'t it? Now look away — that was the point.', team: ['erebusilk', 'chthonix', 'tidefin'] },
  ],
  grand_houses: [
    { id: 'gw_gh_1', name: 'Sir Calden Pyrelight', epithet: 'The Bulwark', quote: 'Haven\'s walls held the Legion. I\'ll hold this ring.', team: ['blazemaw', 'magmaboar', 'pyrofang'] },
    { id: 'gw_gh_2', name: 'Lady Verena Duskwatch', epithet: 'The Shadowcaller', quote: 'House Duskwatch fights from where you can\'t see.', team: ['chthonix', 'nyxroot', 'phantasmoth'] },
    { id: 'gw_gh_3', name: 'Rowan Greenfell', epithet: 'The Wildwarden', quote: 'Five Houses, one banner. Let\'s grow this.', team: ['sylvigor', 'thornstag', 'thicketclaw'] },
  ],
  filament_concord: [
    { id: 'gw_fc_1', name: 'Circuit-Wright Oma', epithet: 'The Live Wire', quote: 'Old war-iron, new purpose. Output: maximum.', team: ['teslarch', 'gravemonolith', 'fulgurex'] },
    { id: 'gw_fc_2', name: 'Volt-Smith Dane', epithet: 'The Overclock', quote: 'I run the grid hot. Hope your bench is insulated.', team: ['voltigarch', 'teslarch', 'raidenjin'] },
    { id: 'gw_fc_3', name: 'Relay Nox', epithet: 'The Grounding', quote: 'Everything you throw, I send to earth.', team: ['gravemonolith', 'fulgurex', 'voltrazar'] },
  ],
  worldring_conclave: [
    { id: 'gw_wc_1', name: 'Conclave-Knight Sera', epithet: 'The Ringwarden', quote: 'The Worldring is ours to keep. Step in.', team: ['raidenjin', 'voltrazar', 'blazemaw'] },
    { id: 'gw_wc_2', name: 'Magnus Holt', epithet: 'The Crown-Breaker', quote: 'I break the crowns the Olivars build. Yours next.', team: ['stormapex', 'infernyx', 'voltigarch'] },
    { id: 'gw_wc_3', name: 'Pell Aurum', epithet: 'The Worldring Heir', quote: 'Terra remembers. Terra answers. For the Conclave!', team: ['voltrazar', 'solarex', 'raidenjin'] },
  ],
  lumenwrights: [
    { id: 'gw_lw_1', name: 'Lumen-Artisan Vix', epithet: 'The Neon Edge', quote: 'Even the streetlights have opinions. Mine\'s "win."', team: ['teslarch', 'stormclaw', 'voltigarch'] },
    { id: 'gw_lw_2', name: 'Iris Gleam', epithet: 'The Lightbender', quote: 'Watch the light. No — watch the OTHER light.', team: ['empyrhawk', 'voltigarch', 'tempestrix'] },
    { id: 'gw_lw_3', name: 'Sol Vanta', epithet: 'The Prism', quote: 'One beam in, a hundred out. Pick which one hurts.', team: ['solarex', 'teslarch', 'voltrazar'] },
  ],
  voltwake_runners: [
    { id: 'gw_vr_1', name: 'Rail-Courier Zev', epithet: 'The Slipstream', quote: 'Blink and you\'ll miss the show. The rails are live!', team: ['empyrhawk', 'tempestrix', 'voltigarch'] },
    { id: 'gw_vr_2', name: 'Gale Renke', epithet: 'The Tailwind', quote: 'I\'m already past you. You just haven\'t noticed.', team: ['tempestrix', 'empyrhawk', 'stormapex'] },
    { id: 'gw_vr_3', name: 'Wisp Carrow', epithet: 'The Redline', quote: 'Top speed, no brakes. Try to keep up.', team: ['voltigarch', 'empyrhawk', 'raidenjin'] },
  ],
};

/** Display rating for each guild's banner (auto-sim + bracket tree). */
const GUILD_STRENGTH: Record<string, number> = {
  grand_houses: 1980, worldring_conclave: 1960, filament_concord: 1900, first_fire: 1880,
  pearlwake: 1840, lumenwrights: 1820, voltwake_runners: 1800, duneward: 1780, aurora_lodge: 1760,
};

const sp = (id: string): string => (SPECIES[id] ? id : 'cindcub');

function buildGuildCompetitor(p: Player, guildId: string, isPlayer: boolean): BracketCompetitor {
  const g = WORLD_GUILDS.find(x => x.id === guildId) ?? WORLD_GUILDS[0];
  const ace = (GUILD_WAR_LINEUPS[guildId] ?? [])[0];
  return {
    id: isPlayer ? 'player' : 'guild_' + guildId,
    name: g.name,
    sub: isPlayer ? `${p.tamerName} marches` : g.seat,
    color: g.color,
    quote: '',
    rating: isPlayer ? getPlayerMMR(p) : (GUILD_STRENGTH[guildId] ?? 1750),
    hometown: g.seat,
    guildId,
    isPlayer,
    speciesIds: ace ? ace.team.map(sp) : ['cindcub'],
  };
}

function generateGuildBracket(p: Player, playerGuildId: string): TournamentBracket {
  const competitors: BracketCompetitor[] = new Array(8);
  competitors[0] = buildGuildCompetitor(p, playerGuildId, true);
  const rivals = WORLD_GUILDS.filter(g => g.id !== playerGuildId).slice(0, 7);
  for (let i = 0; i < 7; i++) competitors[i + 1] = buildGuildCompetitor(p, rivals[i].id, false);
  return { tierId: 'lemon_interguild', roundsCount: 3, rounds: [competitors], matches: [[], [], []] };
}

export async function runGuildWars(p: Player, tier: TournamentTier): Promise<void> {
  const runBattle = (window as any).__runBattle as RunBattle | undefined;
  if (!runBattle) { await say('Guild Marshal Vex', 'The Wars field crews aren\'t ready — try again in a moment.'); return; }
  if (!p.party.length) { await say('Guild Marshal Vex', 'You need at least one Guardian in your party to march for your guild.'); return; }

  p.tournament.entries[tier.id] = (p.tournament.entries[tier.id] ?? 0) + 1;

  const playerGuildId = WORLD_GUILDS.find(g => g.id === p.houseId)?.id ?? 'grand_houses';
  const playerGuild = WORLD_GUILDS.find(g => g.id === playerGuildId)!;

  await say('Guild Marshal Vex', `Welcome to ${tier.name}! ${tier.blurb}`);
  await say('Guild Marshal Vex', `You march for ${playerGuild.name}. Every tie is best-of-three against a rival guild's lineup — take two bouts and your banner advances. No EXP in the Wars; your Guardians heal before every bout. For the guild!`);

  const bracket = generateGuildBracket(p, playerGuildId);
  const total = tier.rounds.length;
  let placement: 'champion' | 'finalist' | 'semifinal' | 'entered' = 'entered';
  let finalOpponent: { name: string; sub: string; color: string; speciesIds: string[] } | undefined;

  for (let i = 0; i < total; i++) {
    const round = tier.rounds[i];
    const isFinal = i === total - 1;
    const isSemi = i === total - 2;

    simulateRound(p, bracket, i); // resolve the AI ties; the player's tie is left open

    const myMatch = bracket.matches[i].find(m => m.competitorA.isPlayer || m.competitorB.isPlayer)!;
    const oppGuildComp = myMatch.competitorA.isPlayer ? myMatch.competitorB : myMatch.competitorA;
    const oppGuildId = oppGuildComp.guildId;
    const oppGuild = WORLD_GUILDS.find(g => g.id === oppGuildId);
    const lineup = (GUILD_WAR_LINEUPS[oppGuildId] ?? GUILD_WAR_LINEUPS['grand_houses']).slice(0, 3);

    p.healAll();
    (window as any).__refreshHUD?.();
    await showBracketTreeScreen(bracket, i, tier);

    await say('🛡️ ' + tier.short, `${round.name} — ${playerGuild.name} versus ${oppGuildComp.name}! Their lineup steps up: ${lineup.map(l => l.name).join(' · ')}. Best of three.`);

    let pWins = 0, oWins = 0;
    for (let bout = 0; bout < lineup.length && pWins < 2 && oWins < 2; bout++) {
      const member = lineup[bout];
      const pLevels = getPlayerPartyLevels(p);
      const scaling = getRoundScaling(tier, i, total, pLevels);
      const specs = member.team.map(id => ({ speciesId: sp(id), level: scaling.level, statMultiplier: scaling.statMultiplier }));

      const playerComp: BracketCompetitor = {
        id: 'player', name: p.tamerName, sub: playerGuild.name, color: '#f2c14e', quote: '',
        rating: getPlayerMMR(p), hometown: 'Haven City', guildId: playerGuildId, isPlayer: true,
        speciesIds: p.party.map(g => g.speciesId),
      };
      const oppComp: BracketCompetitor = {
        id: member.id, name: member.name, sub: `${member.epithet} · ${oppGuildComp.name}`, color: oppGuildComp.color,
        quote: member.quote, rating: oppGuildComp.rating, hometown: oppGuild?.seat ?? 'the Wars field', guildId: oppGuildId,
        isPlayer: false, speciesIds: member.team.map(sp),
      };

      if (member.quote) await say(member.name, member.quote);
      await showTournamentMatchIntro(playerComp, oppComp, tier, `${round.name} · Bout ${bout + 1} of 3`);

      const res = await runBattle(specs, {
        boss: isFinal && bout >= 1,
        noExp: true, noLoot: true,
        theme: ringTheme(tier),
        intro: `🛡️ ${tier.short} · ${oppGuildComp.name} sends out ${member.name}!`,
        winLine: `Bout won — ${pWins + 1}–${oWins} for ${playerGuild.name}!`,
        ring: styleFor(tier, isFinal, undefined),
      });

      p.healAll();
      (window as any).__refreshHUD?.();

      if (res === 'win') {
        pWins++;
        p.tournament.tournamentMatchesWon = (p.tournament.tournamentMatchesWon ?? 0) + 1;
        p.tournament.currentStreak = (p.tournament.currentStreak ?? 0) + 1;
        updatePlayerElo(p, member.id, true);
      } else {
        oWins++;
        p.tournament.tournamentMatchesLost = (p.tournament.tournamentMatchesLost ?? 0) + 1;
        p.tournament.currentStreak = 0;
        updatePlayerElo(p, member.id, false);
      }
      p.tournament.bestStreak = Math.max(p.tournament.bestStreak ?? 0, p.tournament.currentStreak);
      p.save(false);
      toast(`🛡️ Tie: ${playerGuild.name} ${pWins} – ${oWins} ${oppGuildComp.name}`, 'gold', 2800);
    }

    const tieWon = pWins > oWins;
    myMatch.winnerId = tieWon ? 'player' : oppGuildComp.id;

    const roundWinners: BracketCompetitor[] = bracket.matches[i].map(m => (m.winnerId === m.competitorA.id ? m.competitorA : m.competitorB));
    bracket.rounds.push(roundWinners);

    if (!tieWon) {
      let activeRound = i + 1;
      while (activeRound < total) {
        const comps = bracket.rounds[activeRound];
        for (let k = 0; k < comps.length; k += 2) {
          const a = comps[k], b = comps[k + 1];
          const rA = Math.max(100, a.rating), rB = Math.max(100, b.rating);
          const probA = Math.pow(rA, 4) / (Math.pow(rA, 4) + Math.pow(rB, 4));
          const wId = Math.random() < probA ? a.id : b.id;
          bracket.matches[activeRound].push({ competitorA: a, competitorB: b, winnerId: wId });
          const w = wId === a.id ? a : b, l = wId === a.id ? b : a;
          updateBackgroundElo(p, w.id, l.id);
        }
        bracket.rounds.push(bracket.matches[activeRound].map(m => (m.winnerId === m.competitorA.id ? m.competitorA : m.competitorB)));
        activeRound++;
      }
      await showBracketTreeScreen(bracket, total, tier);
      placement = isFinal ? 'finalist' : isSemi ? 'semifinal' : 'entered';
      await say('Guild Marshal Vex', placement === 'finalist'
        ? `So close! ${oppGuildComp.name} edges the final tie — ${playerGuild.name} takes silver, and the whole Compact saw the run.`
        : placement === 'semifinal'
        ? `Out in the semifinal tie. A proud showing for ${playerGuild.name} — the banner flew high.`
        : `${playerGuild.name} falls in ${round.name}. The Wars are unforgiving — drill the bench and march again.`);
      break;
    }

    await say('Guild Marshal Vex', `${playerGuild.name} takes the tie ${pWins}–${oWins} and ADVANCES!`);

    if (isFinal) {
      placement = 'champion';
      finalOpponent = { name: oppGuildComp.name, sub: oppGuild?.seat ?? 'rival guild', color: oppGuildComp.color, speciesIds: oppGuildComp.speciesIds };
    }
  }

  await awardPlacement(p, tier, placement, undefined, finalOpponent);
}

// ============================================================
// THE ATTENDANT — registration, the time-jump start, and the codex.
// Called by Attendant Lyssa in town.ts.
// ============================================================
export async function openColiseumRegistration(p: Player): Promise<void> {
  // already signed up?
  if (p.tournament.registeredEventId) {
    const tier = TIERS[p.tournament.registeredEventId];
    const day = p.tournament.registeredDay;
    const wait = day - p.calendarDay;
    const pick = await choose('Attendant Lyssa',
      `You're registered for ${tier.name}, ${weekdayName(day)} (${wait <= 0 ? 'today' : wait === 1 ? 'tomorrow' : `in ${wait} days`}). Whenever you're ready, just say the word and the Ring is yours — we'll move the clock to finals-night.`,
      ['Begin now (the time will jump)', 'Tell me about the bracket', 'Withdraw my registration', 'Not yet']);
    if (pick === 0) {
      await say('Attendant Lyssa', `Then it's time. The crowds are filing in, the crystals are live… here we go.`);
      jumpToDay(day, tier.classKind === 'Championship' ? 19 : 11); // finals-night for the Worlds
      await runTournament(p, tier, eventForDay(day) ?? undefined);
    } else if (pick === 1) {
      await say('Attendant Lyssa', tier.blurb);
      await say('Attendant Lyssa', describeRounds(tier));
    } else if (pick === 2) {
      p.tournament.registeredEventId = null;
      p.tournament.registeredDay = -1;
      p.save(false);
      (window as any).__refreshHUD?.();
      toast('Registration withdrawn.', '');
    }
    return;
  }

  // open sign-up window?
  const ev = openSignupEvent(p.calendarDay);
  const top = `Welcome to the Grand Coliseum of Haven City — rebuilt at twice its old size, and still not big enough on finals night! ${ev ? `Sign-ups are officially OPEN for ${ev.tier.name}, but you can register for any upcoming event.` : 'The main circuit sign-up windows are closed right now, but you can register for any upcoming event.'}`;
  const opts = [
    '🏟️ Enter the Tournament Grounds',
    'See the Circuit calendar',
    'The Known Names (Top 10)',
    'Trophy Case & Stats',
    'How the Circuit works',
    ...(p.flags['world_champion'] ? ["The Legends' Gauntlet"] : []),
    'Nothing, thanks',
  ];
  const pick = await choose('Attendant Lyssa', top, opts);
  const chosen = opts[pick];

  if (chosen === '🏟️ Enter the Tournament Grounds') {
    await openTournamentSelect(p);
  } else if (chosen === 'See the Circuit calendar') {
    await showBoard(scheduleBoardHTML(p));
  } else if (chosen === 'The Known Names (Top 10)') {
    await showBoard(knownNamesBoardHTML());
  } else if (chosen === 'Trophy Case & Stats') {
    await new Promise<void>(resolve => {
      showTrophyCase(p, () => resolve());
    });
  } else if (chosen === 'How the Circuit works') {
    await say('Attendant Lyssa', 'Five strata, each higher than the last. The weekly Ringnights here in Haven, where names are made. The Turmal Seasonal, where you earn your SEED. The Continental Crowns — the Intercontinental titles. The Playoffs, the Gauntlet of Seeds, finals-night against the Known Names. And above it all, the World Championship at the Worldring of Terra City. Plus the specials — Foretales exhibitions, Aurelia\'s Cup on Agdao, the Sealwatch when the Ghandra seal measures weaker.');
    await say('Attendant Lyssa', 'And the rule that matters: your Universal Rank moves on TOURNAMENT POINTS alone. Not battles, not captures — placements. Win brackets and the rank follows. Nothing else counts. No EXP is given in the Ring, either — sanctioned matches are about proving the team you built, not grinding levels. You cannot grind the crown.');
  } else if (chosen === "The Legends' Gauntlet") {
    const yes = await choose('Attendant Lyssa', "It's not sanctioned and it's not on any calendar. Only a standing World Champion may even ask. The bonded Guardians of the Big Three — Aljay, Greggy, Onnel — nine Aether lights that have never lost. No Tournament Points. Just the truth of how far the top really is. Do you want it?", ['Walk into the Gauntlet', 'Not today']);
    if (yes === 0) await runTournament(p, TIERS.legends_gauntlet);
  }
}

function describeRounds(tier: TournamentTier): string {
  return 'The bracket: ' + tier.rounds.map(r => r.name).join(' → ') + `. Placement pays ${tier.tp.champion}/${tier.tp.finalist}/${tier.tp.semifinal} TP for champion/finalist/semifinalist, and the champion's vault holds ◆${tier.prizeShards}.`;
}

/** Open a scrollable board overlay (uses the shared menu-screen). */
function showBoard(html: string): Promise<void> {
  return new Promise(resolve => {
    const content = openScreen(`<div class="trn-board">${html}
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="ui-btn primary" id="board-close">Close (Esc)</button>
      </div></div>`);
    (content.querySelector('#board-close') as HTMLElement).onclick = () => { closeMenu(); resolve(); };
  });
}

export function scheduleBoardHTML(p: Player): string {
  const up = upcomingEvents(p.calendarDay, 6);
  const rows = up.map(e => {
    const wait = e.day - p.calendarDay;
    const whenTxt = wait <= 0 ? '<b style="color:var(--ui-gold)">TODAY</b>' : wait === 1 ? 'tomorrow' : `in ${wait}d`;
    const open = e.signupDay <= p.calendarDay;
    const reg = p.tournament.registeredEventId === e.tierId && p.tournament.registeredDay === e.day;
    const sign = reg ? '<span class="trn-tag reg">✅ registered</span>'
      : open ? '<span class="trn-tag open">sign-ups open</span>'
      : `<span class="trn-tag">opens in ${e.signupDay - p.calendarDay}d</span>`;
    return `<div class="trn-ev trn-${e.tier.classKind.toLowerCase()}">
      <div class="trn-ev-h"><span class="trn-cls">${e.tier.classKind}</span><span class="trn-when">${weekdayName(e.day)} · ${whenTxt}</span></div>
      <div class="trn-ev-n">${e.tier.name}${e.continent ? ` — ${e.continent}` : ''}</div>
      <div class="trn-ev-v">📍 ${e.tier.venue} ${sign}</div>
    </div>`;
  }).join('');
  return `<div class="trn-cal-title">📅 The Worldring Circuit — ${weekdayName(p.calendarDay)}, ${dateLabel(p.calendarDay)}</div>${rows}`;
}

// surfaced HTML (Coliseum board / codex panels can call these)
export function knownNamesBoardHTML(): string {
  return `<div class="kn-board"><div class="kn-title">⭐ THE KNOWN NAMES — Famous on Four Continents</div>` +
    [...KNOWN_NAMES].sort((a, b) => a.worldRank - b.worldRank).map(k => `
      <div class="kn-row" style="border-left:3px solid ${k.color}">
        <div class="kn-rank">#${k.worldRank}</div>
        <div class="kn-main">
          <div class="kn-name" style="color:${k.color}">${k.name} <span class="kn-ep">— ${k.epithet}</span></div>
          <div class="kn-meta">${k.continent} #${k.continentRank} · ${guildName(k.guildId)}</div>
          <div class="kn-bio">${k.bio}</div>
        </div>
      </div>`).join('') + `</div>`;
}

// ============================================================
// THE CIRCUIT STANDINGS — a living leaderboard, redrawn every week.
// The Worldring Conclave "posts" it (a different herald each week);
// NPC records climb weekly, the order shuffles, and the PLAYER is
// pencilled in the week they first score Tournament Points.
// ============================================================
const HERALDS = ['Conclave-Scribe Ilna', 'Tally-Warden Bex', 'Herald Marn of the Worldring', 'Scrivener Polk', 'Statkeeper Oda Venn'];
export const currentWeek = (day = calendarDayOf()): number => Math.floor(day / 7);
export const heraldOfWeek = (week = currentWeek()): string => HERALDS[((week % HERALDS.length) + HERALDS.length) % HERALDS.length];

interface FieldMember { id: string; name: string; epithet: string; org: string; color: string; base: number; strength: number; baseW: number; baseL: number; }
function circuitField(): FieldMember[] {
  const known = KNOWN_NAMES.map(k => ({
    id: k.id, name: k.name, epithet: k.epithet, org: guildName(k.guildId), color: k.color,
    base: 300 - (k.worldRank - 1) * 11,
    strength: 1 - (k.worldRank - 1) / 12,
    baseW: 60 - (k.worldRank - 1) * 3, baseL: 4 + (k.worldRank - 1),
  }));
  const knownSet = new Set(KNOWN_NAMES.map(k => k.name));
  const pros = WORLD_CIRCUIT.filter(c => !knownSet.has(c.name)).map(c => ({
    id: 'wc_' + c.rank, name: c.name, epithet: c.title, org: c.house, color: c.color,
    base: 45 + (c.wins - c.losses), strength: c.wins / (c.wins + c.losses + 1),
    baseW: c.wins, baseL: c.losses,
  }));
  return [...known, ...pros];
}

/** Deterministic 0..1 hash — gives each competitor a stable weekly swing. */
function hash01(s: string, week: number): number {
  let h = 2166136261 >>> 0;
  const str = `${s}:${week}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 8) / 0xffffff;
}

export interface StandingRow { rank: number; name: string; epithet: string; org: string; color: string; rating: number; wins: number; losses: number; isPlayer: boolean; }

export function playerEligible(p: Player): boolean {
  return p.tournamentPoints > 0 || Object.values(p.tournament.entries).some(n => n > 0);
}

export function computeStandings(p: Player, week = currentWeek(p.calendarDay)): StandingRow[] {
  const rows: StandingRow[] = circuitField().map(m => {
    const drift = (hash01(m.id, week) - 0.5) * 16;                 // ±8 weekly shuffle
    const seasonW = Math.round(week * (0.6 + m.strength * 0.9));
    const seasonL = Math.round(week * Math.max(0.05, 0.5 - m.strength * 0.25));
    return {
      rank: 0, name: m.name, epithet: m.epithet, org: m.org, color: m.color,
      rating: Math.round(m.base + drift),
      wins: Math.max(0, m.baseW + seasonW), losses: Math.max(0, m.baseL + seasonL), isPlayer: false,
    };
  });
  if (playerEligible(p)) {
    const champs = Object.values(p.tournament.wins).reduce((a, b) => a + b, 0);
    const ent = Object.values(p.tournament.entries).reduce((a, b) => a + b, 0);
    rows.push({
      rank: 0, name: `${p.tamerName} (You)`, epithet: RANKS[rankIndexFor(p)].name, org: 'your circuit',
      color: '#f2c14e', rating: p.tournamentPoints + champs * 5,
      wins: champs, losses: Math.max(0, ent - champs), isPlayer: true,
    });
  }
  rows.sort((a, b) => b.rating - a.rating || b.wins - a.wins);
  rows.forEach((r, i) => r.rank = i + 1);
  return rows;
}

export function circuitStandingsHTML(p: Player): string {
  const week = currentWeek(p.calendarDay);
  const rows = computeStandings(p, week);
  const head = `<div class="cs-head">📋 The Worldring Circuit — Standings</div>
    <div class="cs-sub">Week ${week} · ${dateLabel(p.calendarDay)} · posted by <b>${heraldOfWeek(week)}</b> — redrawn every week</div>`;
  const body = rows.map(r => `
    <div class="cs-row ${r.isPlayer ? 'cs-you' : ''} ${r.rank <= 10 && !r.isPlayer ? 'cs-known' : ''}">
      <span class="cs-rank">${r.rank <= 10 ? '⭐' : ''}${r.rank}</span>
      <span class="cs-name" style="color:${r.color}">${r.name}<span class="cs-ep"> — ${r.epithet}</span></span>
      <span class="cs-org">${r.org}</span>
      <span class="cs-rec">${r.wins}–${r.losses}</span>
      <span class="cs-rating">${r.rating}</span>
    </div>`).join('');
  const foot = playerEligible(p)
    ? `<div class="cs-note">The top ten ⭐ are the Known Names, famous on four continents. Keep placing — the board moves every week.</div>`
    : `<div class="cs-note">⭐ You are not on the board yet. Place in any sanctioned bracket and the Conclave pencils you in the week you score your first Tournament Points. Then it's up to you how high the ink climbs.</div>`;
  return `${head}<div class="cs-table"><div class="cs-row cs-h"><span class="cs-rank">#</span><span class="cs-name">Tamer</span><span class="cs-org">Guild</span><span class="cs-rec">W–L</span><span class="cs-rating">Pts</span></div>${body}</div>${foot}`;
}

export async function showCircuitStandings(p: Player): Promise<void> {
  await showBoard(circuitStandingsHTML(p));
}

/** Talk to the weekly Circuit Statkeeper in the Coliseum. */
export async function talkToStatkeeper(p: Player): Promise<void> {
  const week = currentWeek(p.calendarDay);
  const herald = heraldOfWeek(week);
  await say(herald, `Circuit Standings, freshly posted for Week ${week}. The Worldring Conclave redraws this board every single week — wins counted, losses logged, the whole order shaken out again. We argue it like scripture up here.`);
  if (playerEligible(p)) {
    const rows = computeStandings(p, week);
    const me = rows.find(r => r.isPlayer)!;
    const tail = me.rank <= 10 ? 'A Known Name. Four continents say your name now.'
      : me.rank <= 20 ? 'Climbing nicely. Keep placing and you\'ll crack the famous ten.'
      : 'Everyone starts at the bottom. Win brackets — the board moves.';
    await say(herald, `And you — rank ${me.rank} of ${rows.length}, ${p.tournamentPoints} circuit points. ${tail}`);
  } else {
    await say(herald, `You\'re not on it yet. The board only lists tamers who have scored Tournament Points in a sanctioned bracket. Place in one and I\'ll pencil you in next week — then it\'s up to you how high the ink climbs.`);
  }
  await showCircuitStandings(p);
}

// ============================================================
// THE TOURNAMENT GROUNDS — an EPIC, banner-grid select screen.
// Each tournament gets a procedurally-painted banner (canvas art
// keyed to its victory palette + crest, name stamped in), laid out
// in a textured arena hall. Click a banner to inspect the bracket
// and your eligibility; enter if the ladder says you're ready.
// ============================================================
const hexOf = (n: number): string => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
function _shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 1 + amt : 1, add = amt > 0 ? amt * 255 : 0;
  r = Math.min(255, Math.max(0, Math.round(r * f + add)));
  g = Math.min(255, Math.max(0, Math.round(g * f + add)));
  b = Math.min(255, Math.max(0, Math.round(b * f + add)));
  return `rgb(${r},${g},${b})`;
}
function _hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const _bannerCache = new Map<string, string>();
/** Procedurally paint a wide tournament banner from its victory style. */
export function generateTournamentBanner(tier: TournamentTier): string {
  const cached = _bannerCache.get(tier.id);
  if (cached) return cached;

  const W = 512, H = 268;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const style = styleFor(tier, true);
  const cols = (style.colors.length ? style.colors : [0xf2c14e]).map(hexOf);
  const key = cols[0], accent = cols[1] ?? key, accent2 = cols[2] ?? accent;

  // base vertical gradient — darkened key into near-black
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, _shade(key, -0.5));
  g.addColorStop(0.55, _shade(key, -0.78));
  g.addColorStop(1, '#05070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // central radial glow
  const rg = ctx.createRadialGradient(W / 2, H * 0.40, 8, W / 2, H * 0.40, W * 0.66);
  rg.addColorStop(0, _hexA(key, 0.5));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  // raked light streaks
  for (let i = 0; i < 64; i++) {
    ctx.globalAlpha = Math.random() * 0.10;
    ctx.fillStyle = i % 2 ? accent : '#ffffff';
    const w = 22 + Math.random() * 190, h = 1 + Math.random() * 2;
    ctx.save(); ctx.translate(Math.random() * W - w / 2, Math.random() * H); ctx.rotate(-0.52); ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // concentric arena arcs
  ctx.strokeStyle = _hexA(accent2, 0.28);
  ctx.lineWidth = 2;
  for (let r = 46; r < 250; r += 28) {
    ctx.beginPath(); ctx.arc(W / 2, H * 0.40, r, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
  }

  // sparks
  for (let i = 0; i < 46; i++) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.6;
    ctx.fillStyle = cols[i % cols.length];
    const s = 0.8 + Math.random() * 2.2;
    ctx.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  ctx.globalAlpha = 1;

  // metallic top/bottom rails
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, _shade(key, -0.25)); bar.addColorStop(0.5, accent); bar.addColorStop(1, _shade(key, -0.25));
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);

  // giant faint short-name watermark
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 78px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(style.short.toUpperCase(), W / 2, H * 0.40);
  ctx.globalAlpha = 1;

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  const url = c.toDataURL('image/png');
  _bannerCache.set(tier.id, url);
  return url;
}

let _arenaBackdrop = '';
/** A dark, tiled arena-stone texture for the grounds' background. */
function generateArenaBackdrop(): string {
  if (_arenaBackdrop) return _arenaBackdrop;
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'); if (!ctx) return '';
  ctx.fillStyle = '#0a0d1c'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = Math.random() * 0.06;
    ctx.fillStyle = Math.random() < 0.5 ? '#1a2240' : '#000000';
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * S, Math.random() * S, s, s);
  }
  // faint gold flecks
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = Math.random() * 0.05;
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  _arenaBackdrop = c.toDataURL('image/png');
  return _arenaBackdrop;
}

interface SelectCard { tier: TournamentTier; ev?: ScheduledEvent; }

function tournamentCardHTML(p: Player, card: SelectCard): string {
  const { tier, ev } = card;
  const lock = checkTierRequirement(p, tier);
  const style = styleFor(tier, true);
  const banner = generateTournamentBanner(tier);

  const mmrBadge = tier.minMMR
    ? `<span class="tsel-badge ${lock.locked ? 'no' : 'ok'}">★ ${tier.minMMR.toLocaleString()} MMR ${lock.locked ? '🔒' : '✓'}</span>`
    : `<span class="tsel-badge open">Open Entry</span>`;

  let whenBadge: string;
  if (ev) {
    const wait = ev.day - p.calendarDay;
    const whenTxt = wait <= 0 ? 'TODAY' : wait === 1 ? 'tomorrow' : `in ${wait}d`;
    whenBadge = `<span class="tsel-badge when">📅 ${weekdayName(ev.day)} · ${whenTxt}</span>`;
  } else {
    whenBadge = `<span class="tsel-badge invite">✦ Invitational</span>`;
  }

  return `
    <button class="tsel-card ${lock.locked ? 'locked' : ''}" data-tier="${tier.id}" data-day="${ev ? ev.day : ''}">
      <div class="tsel-banner" style="background-image:url(${banner})">
        ${lock.locked ? '<div class="tsel-lockflag">🔒</div>' : ''}
        <div class="tsel-crest">${style.crest}</div>
        <div class="tsel-name">${tier.name}${ev?.continent ? ` — ${ev.continent}` : ''}</div>
        <div class="tsel-class">${tier.classKind}</div>
      </div>
      <div class="tsel-meta">
        <div class="tsel-venue">📍 ${tier.venue}</div>
        <div class="tsel-badges">${mmrBadge}${whenBadge}</div>
      </div>
    </button>`;
}

function tournamentDetailHTML(p: Player, card: SelectCard): string {
  const { tier, ev } = card;
  const lock = checkTierRequirement(p, tier);
  const style = styleFor(tier, true);
  const banner = generateTournamentBanner(tier);
  const mmr = getPlayerMMR(p);

  const rounds = tier.rounds.map(r => r.name).join(' &nbsp;→&nbsp; ');
  const reqHtml = lock.locked
    ? `<div class="tsel-req no">🔒 Not yet eligible:</div>` + lock.reasons.map(r => `<div class="tsel-req-line">• ${r}</div>`).join('')
    : `<div class="tsel-req ok">✓ All requirements met — the ring is yours.</div>`;

  const action = lock.locked
    ? `<button class="ui-btn" id="tsel-enter" disabled>🔒 Locked</button>`
    : `<button class="ui-btn primary" id="tsel-enter">${ev ? '⚔️ Register & Begin' : '⚔️ Enter Now'}</button>`;

  const fmtNote = tier.format === 'guild_war' ? ' · best-of-3 guild ties' : tier.format === 'round_robin' ? ' · group stage' : '';

  return `
    <div class="tsel-detail">
      <div class="tsel-detail-banner" style="background-image:url(${banner})">
        <div class="tsel-detail-crest">${style.crest}</div>
        <div class="tsel-detail-title">${tier.name}</div>
        <div class="tsel-detail-venue">📍 ${tier.venue}${ev ? ` · ${weekdayName(ev.day)}, ${dateLabel(ev.day)}` : ''}</div>
      </div>
      <div class="tsel-detail-body">
        <p class="tsel-blurb">${tier.blurb}</p>
        <div class="tsel-info-row"><span class="tsel-info-k">Bracket</span><span class="tsel-info-v">${rounds}${fmtNote}</span></div>
        <div class="tsel-info-row"><span class="tsel-info-k">Champion's Vault</span><span class="tsel-info-v">🏆 +${tier.tp.champion} TP &nbsp;·&nbsp; ◆${tier.prizeShards.toLocaleString()} Shards</span></div>
        <div class="tsel-info-row"><span class="tsel-info-k">Your MMR</span><span class="tsel-info-v">★ ${mmr.toLocaleString()}${tier.minMMR ? ` &nbsp;/&nbsp; requires ${tier.minMMR.toLocaleString()}` : ''}</span></div>
        <div class="tsel-reqs">${reqHtml}</div>
      </div>
      <div class="tsel-detail-actions">
        <button class="ui-btn" id="tsel-back">◀ Back to grounds</button>
        ${action}
      </div>
    </div>`;
}

/** Open the EPIC banner-grid tournament select. Resolves when closed or after a launched bracket finishes. */
export async function openTournamentSelect(p: Player): Promise<void> {
  const backdrop = generateArenaBackdrop();

  // Build the card list: scheduled circuit events, then the MMR-gated invitationals.
  const scheduled: SelectCard[] = upcomingEvents(p.calendarDay, 6).map(ev => ({ tier: ev.tier, ev }));
  const seenScheduled = new Set(scheduled.map(c => c.tier.id));
  const invitationals: SelectCard[] = ON_DEMAND_TIER_IDS
    .filter(id => TIERS[id] && !seenScheduled.has(id))
    .map(id => ({ tier: TIERS[id] }));

  return new Promise<void>(resolve => {
    let detailCard: SelectCard | null = null;
    let done = false;

    const cardById = (id: string, day: string): SelectCard | undefined => {
      const fromSched = scheduled.find(c => c.tier.id === id && String(c.ev?.day ?? '') === day);
      return fromSched ?? invitationals.find(c => c.tier.id === id) ?? (TIERS[id] ? { tier: TIERS[id] } : undefined);
    };

    const sizeScreen = (el: HTMLElement) => { el.style.width = 'min(1180px, 97vw)'; el.style.maxHeight = '95vh'; };
    const resetScreen = (el: HTMLElement) => { el.style.width = ''; el.style.maxHeight = ''; };

    const finish = (el: HTMLElement) => {
      if (done) return;
      done = true;
      resetScreen(el);
      closeMenu();
      resolve();
    };

    const launch = async (el: HTMLElement, card: SelectCard) => {
      if (done) return;
      done = true;
      resetScreen(el);
      closeMenu();
      const { tier, ev } = card;
      if (ev) {
        p.tournament.registeredEventId = tier.id;
        p.tournament.registeredDay = ev.day;
        p.save(false);
        (window as any).__refreshHUD?.();
        toast(`✅ Registered for ${tier.name}!`, 'gold', 3500);
        await say('Attendant Lyssa', `Then it's time. The crowds are filing in, the crystals are live… here we go.`);
        jumpToDay(ev.day, tier.classKind === 'Championship' ? 19 : 11);
        await runTournament(p, tier, eventForDay(ev.day) ?? ev);
      } else if (tier.format === 'guild_war') {
        await runGuildWars(p, tier);
      } else {
        await runTournament(p, tier);
      }
      resolve();
    };

    const paint = () => {
      if (detailCard) {
        const el = openScreen(`<div class="tsel-root" style="background-image:url(${backdrop})">${tournamentDetailHTML(p, detailCard)}</div>`);
        sizeScreen(el);
        const back = el.querySelector('#tsel-back') as HTMLElement;
        if (back) back.onclick = () => { detailCard = null; paint(); };
        const enter = el.querySelector('#tsel-enter') as HTMLButtonElement;
        if (enter && !enter.disabled) enter.onclick = () => { void launch(el, detailCard!); };
        return;
      }

      const schedHtml = scheduled.length
        ? scheduled.map(c => tournamentCardHTML(p, c)).join('')
        : `<div class="tsel-empty">No circuit events on the board right now.</div>`;
      const inviteHtml = invitationals.map(c => tournamentCardHTML(p, c)).join('');

      const el = openScreen(`
        <div class="tsel-root" style="background-image:url(${backdrop})">
          <div class="tsel-titlebar">
            <div class="tsel-title">⚔️ THE TOURNAMENT GROUNDS</div>
            <div class="tsel-sub">${weekdayName(p.calendarDay)}, ${dateLabel(p.calendarDay)} &nbsp;·&nbsp; <span style="color:${divisionFor(getPlayerMMR(p)).color}">${divisionFor(getPlayerMMR(p)).icon} ${divisionFor(getPlayerMMR(p)).name}</span> &nbsp;·&nbsp; ★ ${getPlayerMMR(p).toLocaleString()} MMR</div>
          </div>
          <div class="tsel-scroll">
            <div class="tsel-section-h">📅 The Worldring Circuit</div>
            <div class="tsel-grid">${schedHtml}</div>
            <div class="tsel-section-h">✦ Invitationals — the ladder is the ticket</div>
            <div class="tsel-grid">${inviteHtml}</div>
          </div>
          <div class="tsel-footer">
            <span class="tsel-hint">Click a banner to inspect the bracket & your eligibility.</span>
            <button class="ui-btn primary" id="board-close">Close (Esc)</button>
          </div>
        </div>`);
      sizeScreen(el);

      el.querySelectorAll<HTMLElement>('.tsel-card').forEach(btn => {
        btn.onclick = () => {
          const card = cardById(btn.dataset.tier!, btn.dataset.day ?? '');
          if (card) { detailCard = card; paint(); }
        };
      });
      const close = el.querySelector('#board-close') as HTMLElement;
      if (close) close.onclick = () => finish(el);
    };

    paint();
  });
}

void TYPE_CSS; // reserved for future board styling
