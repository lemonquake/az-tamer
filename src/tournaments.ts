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
import { Player } from './state';
import { WORLD_GUILDS, WORLD_CIRCUIT } from './lore';
import { awardTournamentPoints, rankIndexFor, RANKS } from './ranks';
import { say, choose, toast, openScreen, closeMenu } from './ui';
import { jumpToDay, weekdayName, calendarDayOf, dateLabel, aeYear, weekOfYear } from './calendar';

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

const guildName = (id: string): string => WORLD_GUILDS.find(g => g.id === id)?.name ?? 'a free Guild';
const guildColor = (id: string): string => WORLD_GUILDS.find(g => g.id === id)?.color ?? '#9ab0c8';

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
    id: 'maris', name: 'Maris Dell', epithet: 'The Drownsong',
    continent: 'Veyra', worldRank: 5, continentRank: 1,
    guildId: 'pearlwake', color: '#3a9df2',
    team: ['leviathorn', 'abyssarch', 'nacrelord'],
    quote: 'The tide doesn\'t hurry, and it doesn\'t lose. Neither do I.',
    bio: 'First of all Veyra, and the Pearlwake Compact\'s pride — a diver-tamer who maps the drowned ruins by day and drowns brackets by night. She fights to a rhythm the broadcast crystals call the Drownsong: slow, patient, inevitable, the whole ring underwater before you noticed it filling. A thousand harbors fly her colors on finals night. She has never set foot in Terra; she says the sea will bring the crown to her eventually.',
  },
  {
    id: 'kalda', name: 'Kalda Voss', epithet: 'The Long Winter',
    continent: 'Noruun', worldRank: 6, continentRank: 1,
    guildId: 'aurora_lodge', color: '#9adff2',
    team: ['oceantitan', 'abyssarch', 'leviathorn'],
    quote: 'In the south we plan eighty years ahead. I have already won this. You just haven\'t felt the cold yet.',
    bio: 'Warden-champion of the frozen south and the Aurora Sentinel Lodge, who learned patience watching the auroras for Ghandra\'s reflection. Her brackets are a slow glaciation — every exchange a degree colder, until the opponent simply stops moving. Noruun sends one champion to the circuits each Age-turn and no more; this turn it is Kalda, and the other continents have learned to dread the quiet ones from the ice.',
  },
  {
    id: 'serra', name: 'Serra Vayle', epithet: 'The Tidebreaker',
    continent: 'Olivar', worldRank: 7, continentRank: 3,
    guildId: 'grand_houses', color: '#3a9df2',
    team: ['abyssarch', 'leviathorn', 'pearlance'],
    quote: 'Forty-one and six. Make it forty-one and seven if you can.',
    bio: 'The best of the current adult pro circuit — forty-one wins, six losses, House Mistveil — and the name every Coliseum guard mutters when the standings come up. For one cruel detail she has zero World Championships: she came up in the age of the Big Three and now the age of their daughters, forever the wave that breaks one stone short of the wall. Beat her and the whole circuit hears your name by morning.',
  },
  {
    id: 'riven', name: 'Riven Calloway', epithet: 'The Voltwake',
    continent: 'Tharkand', worldRank: 8, continentRank: 3,
    guildId: 'voltwake_runners', color: '#5aff9a',
    team: ['empyrhawk', 'fulgurex', 'tempestrix'],
    quote: 'Blink and it\'s over. People pay good shards to see me blink.',
    bio: 'A conduit-rail courier-racer turned circuit terror, and the loudest green in the Voltwake Runners\' fan-legion when she isn\'t the one fighting. She races the lightning to the strike and usually wins; her brackets are over before the crowd has sat down. Terra adores her precisely because she is everything Ezekiel is not — reckless, grinning, and gone.',
  },
  {
    id: 'tamsin', name: 'Tamsin Orr', epithet: 'The Dunebreaker',
    continent: 'Tharkand', worldRank: 9, continentRank: 4,
    guildId: 'duneward', color: '#c4822a',
    team: ['coalossus', 'magmadrak', 'vulkragon'],
    quote: 'I disarm dead war-engines for a living. Your Guardians don\'t scare me.',
    bio: 'A salvage-warden of the Duneward Assembly who spends her off-seasons defusing the old empire\'s buried war-engines one by one — work that makes a tournament ring feel positively safe. She fights like the desert: heavy, hot, and impossible to outlast. The Worldring crowd loves her because she always shakes hands, and because she once carried a fainted rival\'s Guardian off the sand herself.',
  },
  {
    id: 'graycur', name: 'The Gray Cur', epithet: 'Name Withheld',
    continent: 'Olivar', worldRank: 10, continentRank: 4,
    guildId: 'grand_houses', color: '#9a5af2',
    team: ['nosferatus', 'phantasmoth', 'umbrelisk'],
    quote: '…',
    bio: 'Twenty wins, three losses, and no name on the wall — House Duskwatch lists only "withheld." No one has seen the Gray Cur without the gray hood; no one can say which finals-night they first appeared. The circuit trades theories like contraband: a disgraced champion, a Duskwatch experiment, an Anomaly\'s mask. Whoever they are, they fight like the last light going out, and they have never once spoken in the ring.',
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
  const types = GUILD_TYPES[guild.id] ?? ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra'];
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

export type TierClass = 'Local' | 'Seeding' | 'Regional' | 'Special' | 'Playoffs' | 'Championship' | 'Legends';

export interface TournamentTier {
  id: string; name: string; short: string; venue: string; classKind: TierClass;
  blurb: string;
  rounds: RoundDef[];
  tp: { champion: number; finalist: number; semifinal: number; entered: number };
  prizeShards: number;
  continent?: Continent;
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
  },
};

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

  p.tournament.entries[tier.id] = (p.tournament.entries[tier.id] ?? 0) + 1;

  await say('Attendant Lyssa', `Welcome to ${tier.name}, at ${tier.venue}. ${tier.blurb}`);
  await say('Attendant Lyssa', '⚔️ Remember the law of the Ring: no EXP is awarded in a sanctioned match. You fight with the team you built — and the bracket measures it. Your Guardians are healed before every round. Good luck out there.');

  const rounds = tier.rounds;
  let placement: 'champion' | 'finalist' | 'semifinal' | 'entered' = 'entered';
  const total = rounds.length;

  for (let i = 0; i < total; i++) {
    const round = rounds[i];
    const foe = buildFoe(round, ev);
    const isFinal = i === total - 1;
    const isSemi = i === total - 2;

    p.healAll();
    (window as any).__refreshHUD?.();

    await say('🏟️ ' + tier.short, `${round.name} — you face ${foe.label}, ${foe.sub}.`);
    if (foe.quote && foe.quote !== '…') await say(foe.label, foe.quote);
    else if (foe.quote === '…') await say(foe.label, '… (the Gray Cur says nothing.)');

    const winLine = isFinal ? `${round.name} — the title is yours!` : `${round.name} — you advance!`;
    const res = await runBattle(foe.specs, {
      boss: isFinal || round.stratum === 'known',
      noExp: true, noLoot: true,
      theme: ringTheme(tier),
      intro: `🏟️ ${tier.short} · ${round.name} — ${foe.label} steps onto the ring!`,
      winLine,
    });

    if (res !== 'win') {
      placement = isFinal ? 'finalist' : isSemi ? 'semifinal' : 'entered';
      await say('Attendant Lyssa', placement === 'finalist'
        ? `A finalist's run! ${foe.label} takes the title this time — but the whole circuit saw how close you came.`
        : placement === 'semifinal'
        ? `Out in the semifinal — a strong showing. The standings will remember it.`
        : `Eliminated in ${round.name}. Every champion loses brackets before they win them. Come back when the horns sound again.`);
      break;
    }

    // beat a Known Name → record it
    if (round.stratum === 'known') {
      const k = pickKnownForRecord(round, ev, foe.label);
      if (k && !p.tournament.defeated.includes(k.id)) p.tournament.defeated.push(k.id);
    }
    if (isFinal) placement = 'champion';
  }

  await awardPlacement(p, tier, placement, ev);
}

function pickKnownForRecord(round: RoundDef, ev: ScheduledEvent | undefined, label: string): KnownName | undefined {
  return KNOWN_NAMES.find(k => k.name === label) ?? (round.knownId ? KNOWN_BY_ID[round.knownId] : undefined);
}

async function awardPlacement(p: Player, tier: TournamentTier, placement: 'champion' | 'finalist' | 'semifinal' | 'entered', _ev?: ScheduledEvent): Promise<void> {
  const beforeRank = rankIndexFor(p);
  const tp = tier.tp[placement];
  if (tp > 0) awardTournamentPoints(p, tp);

  const placeNum = placement === 'champion' ? 1 : placement === 'finalist' ? 2 : placement === 'semifinal' ? 4 : 8;
  const prev = p.tournament.bestPlacement[tier.id] ?? 99;
  if (placeNum < prev) p.tournament.bestPlacement[tier.id] = placeNum;

  if (placement === 'champion') {
    p.tournament.wins[tier.id] = (p.tournament.wins[tier.id] ?? 0) + 1;
    p.shards += tier.prizeShards;
    const title = `${tier.short} Champion`;
    if (!p.tournament.titles.includes(title)) p.tournament.titles.push(title);
    if (tier.classKind === 'Championship') p.tournament.worldTitles += 1;
    if (tier.id === 'world_championship') p.flags['world_champion'] = true;
    if (tier.id === 'legends_gauntlet') p.flags['beat_legends_gauntlet'] = true;
  }

  // clear any registration for this tier
  if (p.tournament.registeredEventId === tier.id) {
    p.tournament.registeredEventId = null;
    p.tournament.registeredDay = -1;
  }
  p.save(false);
  (window as any).__refreshHUD?.();

  if (placement === 'champion') {
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
    'Register for a tournament',
    'See the Circuit calendar',
    'The Known Names (Top 10)',
    'How the Circuit works',
    ...(p.flags['world_champion'] ? ["The Legends' Gauntlet"] : []),
    'Nothing, thanks',
  ];
  const pick = await choose('Attendant Lyssa', top, opts);
  const chosen = opts[pick];

  if (chosen === 'Register for a tournament') {
    const upcoming = upcomingEvents(p.calendarDay, 6);
    if (!upcoming.length) {
      await say('Attendant Lyssa', 'There are no upcoming tournaments scheduled on the circuit right now.');
      return;
    }
    const subOpts = upcoming.map(e => {
      const wait = e.day - p.calendarDay;
      const waitStr = wait <= 0 ? 'today' : wait === 1 ? 'tomorrow' : `in ${wait} days`;
      return `${e.tier.name} (${weekdayName(e.day)}, ${waitStr})`;
    });
    subOpts.push('Nevermind');
    const subPick = await choose('Attendant Lyssa', 'Which upcoming tournament would you like to register for?', subOpts);
    if (subPick >= 0 && subPick < upcoming.length) {
      const selected = upcoming[subPick];
      p.tournament.registeredEventId = selected.tierId;
      p.tournament.registeredDay = selected.day;
      p.save(false);
      (window as any).__refreshHUD?.();
      toast(`✅ Registered for ${selected.tier.name}!`, 'gold', 4000);

      const startNow = await choose('Attendant Lyssa',
        `You're registered for ${selected.tier.name} (${weekdayName(selected.day)}, ${dateLabel(selected.day)}). Would you like to begin the tournament now? (The time will jump to finals-night).`,
        ['Begin now (the time will jump)', 'Not yet']);
      if (startNow === 0) {
        await say('Attendant Lyssa', `Then it's time. The crowds are filing in, the crystals are live… here we go.`);
        jumpToDay(selected.day, selected.tier.classKind === 'Championship' ? 19 : 11);
        await runTournament(p, selected.tier, selected);
      } else {
        await say('Attendant Lyssa', `Prep your team, heal up, stock potions. When you're ready, come back and tell me to begin — I'll jump the clock straight to finals-night. ${selected.tier.classKind === 'Championship' ? 'The Worldring. Terra City. Don\'t keep ten thousand people waiting too long.' : ''}`);
      }
    }
  } else if (chosen === 'See the Circuit calendar') {
    await showBoard(scheduleBoardHTML(p));
  } else if (chosen === 'The Known Names (Top 10)') {
    await showBoard(knownNamesBoardHTML());
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

void TYPE_CSS; // reserved for future board styling
