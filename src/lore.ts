// ============================================================
// AZ Tamer — World Lore: three thousand years of history. The
// First Dawn, when Guardians crossed into the world; Aurelia of
// Agdao, the first Tamer; the Reaching and the Guild Compact
// that answered it; the continents; the three Legendary Tamers
// (each bonded to three Aether Guardians); and the Corrupted
// Legion they sealed away in Ghandra fifteen years ago.
// ============================================================
import type { Element, Archetype } from './data';

// ---------------- the deep timeline ----------------
/** The ages of the world, oldest first. Dates are in years before present (YBP) or AE (Age of Embers, the current calendar). */
export interface EraDef { era: string; when: string; title: string; text: string; }
export const WORLD_TIMELINE: EraDef[] = [
  {
    era: 'first_dawn', when: '~3,000 years ago', title: 'The First Dawn',
    text: 'The Veil between the world and Ghandra thinned for nine nights, and beings of living element walked out of the light: the first Guardians. They owed humanity nothing. For twenty-three centuries they kept to the deep forests, the sea trenches and the storm peaks, and humans told stories about them the way they told stories about weather.',
  },
  {
    era: 'aurelia', when: '~700 years ago', title: 'Aurelia and the First Bond',
    text: 'On Agdao Island — a small green knuckle of land in the western sea — a fisher-girl named Aurelia pulled a storm-wounded Guardian from the surf and nursed it through a monsoon. It stayed. The bond between them was the first of its kind: not a leash, but a promise kept both ways. Aurelia\'s circle of friends learned the way of it, and the island\'s little region of bonded humans became the first Tamers. The continent of Aurel, the University, half the children in Olivar — all of them carry her name.',
  },
  {
    era: 'reaching', when: '~650–400 years ago', title: 'The Reaching',
    text: 'Knowledge of bonding spread from Agdao faster than wisdom did. Humans discovered far more than they should have — how bond could be forced, how element could be drained, how a Guardian\'s heart could be caged and sold. Whole reaches of the old world built their fortunes on chained Guardians. The era is remembered, with shame, as the Reaching.',
  },
  {
    era: 'compact', when: '~400 years ago', title: 'The Guild Compact',
    text: 'It was Tamers themselves who ended the Reaching. In every town and city where true bonds were kept, Tamers banded into Guilds — houses of training, of law, and when needed, of war — and the Guilds signed one Compact: no bond by force, no Guardian in chains, and every guildhall a sanctuary. Hundreds of Guilds now stand across the four continents, from great houses to three-member village lodges. The five Grand Houses of Olivar are simply the five that history made famous — one chapter in a very thick book.',
  },
  {
    era: 'empire', when: '~300–212 years ago', title: 'The Old Empire and its Fall',
    text: 'An empire of engine-craft rose in Tharkand and drowned in its own ambition. Its war-engines still hum beneath the dunes and its treasuries still flood the deep ruins. The Guilds outlasted it, as they have outlasted everything.',
  },
  {
    era: 'legion_war', when: '15 years ago', title: 'The Legion War and the Sealing of Ghandra',
    text: 'Nine corrupted Guardians — four elements each, generals all — massed their armies in Ghandra, the dimension folded into the center of the world. Three best friends went in: Aljay the Dawnflame, Greggy the Stormheart, and Onnel the Worldroot, nine bonded lights against nine generals. The Legion stayed behind, sealed. The seal weakens a little every year.',
  },
];

// ---------------- the world ----------------
export const WORLD_LORE = {
  /** The four continents of the world. */
  continents: [
    {
      id: 'olivar', name: 'Olivar',
      desc: 'The Capital Region, governed under the Leodones line. Haven City and the Tamer University of Aurel stand here. Every year, hundreds of aspiring tamers gather in the capital to train and graduate as official Tamers. The five Grand Houses were raised in Olivar after the Legion War.',
    },
    {
      id: 'veyra', name: 'Veyra',
      desc: 'The western sea-continent of a thousand harbors. Mistveil pearl-divers map its drowned ruins; storms that begin over Veyra reach every other shore.',
    },
    {
      id: 'tharkand', name: 'Tharkand',
      desc: 'The eastern waste of red dunes and dead war-engines. The old empire fell hardest here, and Legion wreckage still hums beneath the sand.',
    },
    {
      id: 'noruun', name: 'Noruun',
      desc: 'The frozen south. Ice Guardians older than written history sleep beneath its glaciers, and the auroras above it are said to be Ghandra\'s reflection.',
    },
  ],
  /** Ghandra — the dimension at the center of the world. */
  ghandra: 'Ghandra is the center of the world — and yet on no map, for it lies folded inside its own dimension. Fifteen years ago the Corrupted Legion marshaled its armies there, waiting to pour into the world. Three friends went in, each with three Guardians at their side — nine lights against nine generals. Only the Legion stayed behind, sealed. The seal is said to weaken a little every year.',
};

// ---------------- Agdao Island — the Cradle of Tamers ----------------
export const AGDAO_LORE = {
  name: 'Agdao Island',
  epithet: 'The Cradle of Tamers',
  desc: 'A medium-sized tropical island in the western sea where, seven hundred years ago, Aurelia made the First Bond. Hut villages ring its turquoise lagoon, the Circle of the First Fire keeps the old ways, and the islanders still leave a fish on the north rocks every monsoon — for the Guardian that started everything.',
  firstGuardian: 'Cero, the Surf-Light — the storm-wounded Guardian Aurelia saved. The islanders say it never truly left; that every bright wave-crest on the lagoon is Cero rolling over in its sleep.',
};

// ---------------- New Salmonan — the valley the crystals can't reach ----------------
export const SALMONAN_LORE = {
  name: 'New Salmonan',
  epithet: 'The Valley of Loud Kitchens',
  desc: 'A lively rural town of terraced paddies, river piers and market mornings, folded into hills where broadcast crystals lose their signal. Everybody knows everybody, nobody asks where the quiet champion on the hill came from — and the mural of the Big Three by the river gate is repainted every spring.',
  mural: 'Aljay, Greggy and Onnel saved this valley countless times in the war years — flood, siege, and once, famously, a wedding. The town repaints their mural by the river gate every spring, and the painters argue every spring about whether Greggy\'s grin is wide enough.',
};

// ---------------- FORETALES — the machine that writes the world ----------------
// The world's great broadcast-and-broadsheet network. After the
// Sponsors fell, the Reliquary Ledger's "reputation management"
// budget line unraveled into something far wider: Foretales was
// never reporting the world. It was DRAFTING it.
export const FORETALES_LORE = {
  name: 'Foretales',
  epithet: 'Tomorrow\'s News, On Time',
  /** The public face. */
  face: 'The network everyone grew up inside: broadcast crystals in every plaza, broadsheets on every pier, the Seasonal brackets, the morning polls, the evening serials. Four continents read the same headlines at the same hour and call it the weather.',
  /** What the Override Ledger and the Continuity Reel prove. */
  truth: 'The news is written before it happens. Sabotaged matches, vanished candidates, buried disasters, manufactured darlings — countless events covered or covered UP for scheme and profit. Ivan Lawrence was not their first deletion; he was a rehearsal they finally got to perform in public.',
  /** The sixteen-year interregnum. */
  interregnum: 'Sixteen years since any continent seated a proper leader. Every cycle the same arithmetic: the front-runner withdraws, or scandalizes, or simply stops being mentioned — and the polls, every last one of them run through a Foretales subsidiary, discover the public "never really wanted them anyway." It runs deep. It runs wide. It runs violent.',
  /** The Big Three clause. */
  glaze: 'And yet the Big Three shine from every crystal — endless retrospectives, soft-lit documentaries, anniversary specials. It is glaze. A standing directive, found spooled at the heart of the Mirrorhouse, names the only three people on four continents Foretales is forbidden to touch: "GLAZE. DO NOT TOUCH. NOT YET. SOON." Aljay never sat for them. Count the true interviews on one hand; everything else is fabricated — and something more.',
};

// ---------------- the Guilds of the world ----------------
// The five Grand Houses of Olivar are one famous chapter among
// hundreds of Guilds bound by the Compact. These are the ones any
// schoolchild could name.
export interface WorldGuildDef { id: string; name: string; seat: string; continent: string; color: string; desc: string; }
export const WORLD_GUILDS: WorldGuildDef[] = [
  { id: 'first_fire', name: 'Circle of the First Fire', seat: 'Agdao Island', continent: 'Western Sea', color: '#f2a64e',
    desc: 'The oldest Guild in the world — founded by Aurelia\'s own circle of friends. It has never moved, never grown past forty members, and never once broken the Compact it helped write.' },
  { id: 'pearlwake', name: 'The Pearlwake Compact', seat: 'Veyra', continent: 'Veyra', color: '#3a9df2',
    desc: 'A thousand-harbor confederation of diver-tamers who map the drowned ruins. Their guildhall is a fleet.' },
  { id: 'duneward', name: 'The Duneward Assembly', seat: 'Tharkand', continent: 'Tharkand', color: '#c4822a',
    desc: 'Salvage-wardens of the red waste. They disarm the old empire\'s war-engines one by one, and bury what cannot be disarmed.' },
  { id: 'aurora_lodge', name: 'The Aurora Sentinel Lodge', seat: 'Noruun', continent: 'Noruun', color: '#9adff2',
    desc: 'Keepers of the frozen south, who watch the auroras for Ghandra\'s reflection. They take the long view: their duty roster is planned eighty years ahead.' },
  { id: 'grand_houses', name: 'The Five Grand Houses', seat: 'Haven City', continent: 'Olivar', color: '#f2c14e',
    desc: 'Pyrelight, Mistveil, Thornward, Stormcall, Duskwatch — raised after the Legion War to train the tamers who will stand ready when the seal breaks. The youngest of the great Guilds, and the loudest.' },
];

// ---------------- the daughters of the Dawnflame ----------------
export interface DaughterDef {
  id: string; name: string; title: string; color: string;
  look: { top: number; hair: number; hairstyle: 'long' | 'ponytail'; bottom: number };
  blurb: string;
}
export const DAUGHTERS: DaughterDef[] = [
  {
    id: 'azrin', name: 'Azrin', title: 'The Emberlark', color: '#f2884e',
    look: { top: 0xf2884e, hair: 0x8a3a1a, hairstyle: 'long', bottom: 0x4a3040 },
    blurb: 'Aljay\'s elder daughter — sixteen years old with a shelf of Intercontinental championship trophies and one World Championship already on it. Laughs first, apologizes never, fights like sunrise — sudden and everywhere at once. For her little sister she would walk into anything. Including, one day, three Anomalies at once.',
  },
  {
    id: 'azrael', name: 'Azrael', title: 'The Nightwing', color: '#9a6af2',
    look: { top: 0x6a4a9a, hair: 0x241a2e, hairstyle: 'ponytail', bottom: 0x2a2438 },
    blurb: 'The younger daughter — her father over again: stubborn past all argument, a quiet genius, and convinced every Guardian is simply a friend she hasn\'t met yet. She keeps his old lantern on her belt, unlit. "For Ghandra," she says, and does not elaborate.',
  },
];

// ---------------- the three Legendary Tamers ----------------
/** One of a Legendary Tamer's three personal Guardians. */
export interface LegendGuardianDef {
  name: string;
  epithet: string;
  elements: Element[];
  desc: string;
  // visual recipe — these beings exist nowhere in the wild
  archetype: Archetype;
  palette: { primary: number; secondary: number; accent: number };
  glow: number;
  scale: number;
  /** bestiary.ts BESPOKE key — a hand-sculpted model replaces the archetype recipe */
  bespoke?: string;
}

export interface LegendDef {
  id: string;
  name: string;
  title: string;
  element: Element;
  color: string;
  championships: number;   // Grand Coliseum world championships
  champYears: string;      // the immortalized run, for the Hall of Legends
  guardians: [LegendGuardianDef, LegendGuardianDef, LegendGuardianDef];
  story: string;
}

export const LEGENDS: LegendDef[] = [
  {
    id: 'aljay', name: 'Aljay', title: 'The Dawnflame', element: 'Fire', color: '#f2603a',
    championships: 8, champYears: 'AE 19–27',
    guardians: [
      {
        name: 'Firgara', epithet: 'The Dawn Unbroken', elements: ['Aether', 'Light', 'Fire'],
        desc: 'Aljay\'s first bond — a crimson dragonoid knight in mirror-bright scale, bearing Daybreak, a greatsword of living flame. Eight Coliseum finals ended at the drawing of that blade; the crowd swears that when Firgara raises it, night simply gives up and calls itself morning.',
        archetype: 'brute', palette: { primary: 0xc8202a, secondary: 0xe8b84a, accent: 0xff9ad2 }, glow: 0xffb45a, scale: 1.35,
        bespoke: 'firgara',
      },
      {
        name: 'Onthrofa', epithet: 'The Folded Sky', elements: ['Space', 'Aether'],
        desc: 'A violet being of folded distance and borrowed hours, wreathed in the slow clockwork of Space and Time — orbit-rings, a golden hour-dial, and one patient hourglass that has never finished pouring. Onthrofa does not dodge: the arena simply agrees the attack happened somewhere else, several seconds ago. Scholars still argue whether it walks or the world moves underneath it.',
        archetype: 'sprite', palette: { primary: 0x8a4af2, secondary: 0x2a1a5a, accent: 0xff9ad2 }, glow: 0xb18aff, scale: 1.2,
        bespoke: 'onthrofa',
      },
      {
        name: 'Vulfenix', epithet: 'The Midnight Ember', elements: ['Aether', 'Dark', 'Fire'],
        desc: 'The rose-fire phoenix that lit Aljay\'s way through Ghandra\'s dark — and has not landed since. Vulfenix flies low and silent, shedding ribbons of pink flame that hang in the air long after it has passed; the Legion learned to dread streets that glowed faintly rose.',
        archetype: 'avian', palette: { primary: 0xff5aa8, secondary: 0x2a1a2e, accent: 0xffd8ec }, glow: 0xff7ac8, scale: 1.3,
        bespoke: 'vulfenix',
      },
    ],
    story: 'Leader of the three, and eight-time World Champion of the Grand Coliseum. Aljay walked into Ghandra carrying nothing but a lantern, with Firgara\'s blazing sword at his shoulder, Onthrofa folding the road ahead, and Vulfenix lighting the dark behind with trails of rose-fire. Children across all four continents reenact his duel with Nyxghul using broom handles. He has not been seen publicly in years — every tamer claims to know someone who has met him.',
  },
  {
    id: 'greggy', name: 'Greggy', title: 'The Stormheart', element: 'Electric', color: '#f2d23a',
    championships: 9, champYears: 'AE 17–28',
    guardians: [
      {
        name: 'Raijura', epithet: 'The First Thunder', elements: ['Aether', 'Light', 'Electric'],
        desc: 'A storm-roc hatched, the story goes, from the first thunderclap Greggy ever heard. Nine championship banners hang in the Coliseum because Raijura refuses to land while one final remains unwon.',
        archetype: 'avian', palette: { primary: 0xf2d23a, secondary: 0xe8ecff, accent: 0xff9ad2 }, glow: 0xfff2a0, scale: 1.35,
      },
      {
        name: 'Voltherion', epithet: 'The Coilstar', elements: ['Space', 'Aether', 'Electric'],
        desc: 'A walking dynamo wound around a captive star. Greggy built its famous grounding coil overnight from scavenged war-engine parts — Voltherion has worn it like a crown ever since.',
        archetype: 'brute', palette: { primary: 0x4a5468, secondary: 0xf2d23a, accent: 0x7a8af2 }, glow: 0xf2d23a, scale: 1.3,
      },
      {
        name: 'Fulgrath', epithet: 'The Black Lightning', elements: ['Aether', 'Dark', 'Electric'],
        desc: 'Lightning that struck once in the dark of Ghandra and decided to stay. It coils around Greggy\'s forearm between rounds, pretending to sleep. Opposing Guardians know better.',
        archetype: 'serpent', palette: { primary: 0x1a1a2e, secondary: 0xf2d23a, accent: 0xb14aff }, glow: 0x9a5af2, scale: 1.25,
      },
    ],
    story: 'Nine-time World Champion — the longest reign in Coliseum history — and the Legion\'s armies learned to fear the sound of distant thunder. Greggy grounded the Storm-Tyrant Voltrazar with Voltherion\'s coil while Raijura held the sky and Fulgrath hunted the dark between the armies. He still sends Dax\'s Garage handwritten schematics, which Dax frames instead of building.',
  },
  {
    id: 'onnel', name: 'Onnel', title: 'The Worldroot', element: 'Nature', color: '#4ec45e',
    championships: 5, champYears: 'AE 21–25',
    guardians: [
      {
        name: 'Verdalune', epithet: 'The Blooming Moon', elements: ['Aether', 'Light', 'Nature'],
        desc: 'A moonlit spirit-bloom that opens only for Onnel. Five championship rings grew from its petals — the Coliseum keeps them under glass, and they have never wilted.',
        archetype: 'sprite', palette: { primary: 0x4ec45e, secondary: 0xf2e8b8, accent: 0xff9ad2 }, glow: 0xb8ffd8, scale: 1.2,
      },
      {
        name: 'Gaiathorn', epithet: 'The Drifting Garden', elements: ['Space', 'Aether', 'Nature'],
        desc: 'A great shelled wanderer with a living garden on its back. Whole matches have been decided by opponents pausing to look at it. Onnel insists this is not a tactic. The record disagrees.',
        archetype: 'shell', palette: { primary: 0x5a3e22, secondary: 0x4ec45e, accent: 0x7a8af2 }, glow: 0x4ec45e, scale: 1.35,
      },
      {
        name: 'Nyxroot', epithet: 'The Deep Root', elements: ['Aether', 'Dark', 'Nature'],
        desc: 'The root that reaches where light gives up. It was Nyxroot who anchored the seal on Ghandra — a thread of it remains there still, which is why Onnel never strays far from growing things.',
        archetype: 'brute', palette: { primary: 0x241e32, secondary: 0x4ec45e, accent: 0xb14aff }, glow: 0x6a8a4a, scale: 1.3,
      },
    ],
    story: 'Five-time World Champion, and the quiet center of the three. When the Legion\'s rot spread through the greenways, Onnel answered with Verdalune\'s light, Gaiathorn\'s patience and Nyxroot\'s grip. It was Onnel who wove the seal that holds Ghandra shut — every spring, forests across the world bloom a day early in thanks. The Thornward Covenant keeps a chair empty at every feast for them.',
  },
];

/** Hall-of-Legends helper: every legend guardian, flattened. */
export const LEGEND_GUARDIANS: { owner: LegendDef; guardian: LegendGuardianDef }[] =
  LEGENDS.flatMap(l => l.guardians.map(g => ({ owner: l, guardian: g })));

// ---------------- the World Circuit leaderboard ----------------
/** Current-era Coliseum standings — mortals chasing the immortalized three. */
export interface CircuitEntry { rank: number; name: string; title: string; wins: number; losses: number; house: string; color: string; }
export const WORLD_CIRCUIT: CircuitEntry[] = [
  { rank: 1, name: 'Serra Vayle', title: 'The Tidebreaker', wins: 41, losses: 6, house: 'Mistveil', color: '#3a9df2' },
  { rank: 2, name: 'Dorn Kettlebrand', title: 'The Anvil', wins: 38, losses: 9, house: 'Pyrelight', color: '#f2603a' },
  { rank: 3, name: 'Yuna Skyhollow', title: 'Stormchild', wins: 36, losses: 8, house: 'Stormcall', color: '#f2d23a' },
  { rank: 4, name: 'Bramble-Knight Osha', title: 'The Patient Wall', wins: 33, losses: 11, house: 'Thornward', color: '#4ec45e' },
  { rank: 5, name: 'Vesper Quill', title: 'The Last Light Out', wins: 31, losses: 10, house: 'Duskwatch', color: '#9a5af2' },
  { rank: 6, name: 'Harlan Voss', title: 'Ironjaw', wins: 28, losses: 14, house: 'Pyrelight', color: '#f2603a' },
  { rank: 7, name: 'Mirei of the Shoals', title: 'Pearl-Dancer', wins: 26, losses: 12, house: 'Mistveil', color: '#3a9df2' },
  { rank: 8, name: 'Castor Greene', title: 'The Sprout', wins: 22, losses: 9, house: 'Thornward', color: '#4ec45e' },
  { rank: 9, name: 'Tess Arclight', title: 'Two-Coils', wins: 21, losses: 15, house: 'Stormcall', color: '#f2d23a' },
  { rank: 10, name: 'The Gray Cur', title: 'Name Withheld', wins: 20, losses: 3, house: 'Duskwatch', color: '#9a5af2' },
];

// ---------------- the Corrupted Legion ----------------
// Nine corrupted Guardians, each carrying FOUR elements, each once
// the general of an army massed in Ghandra. Sealed — for now.
export interface LegionDef {
  speciesId: string;
  title: string;
  army: string;
}

export const CORRUPTED_LEGION: LegionDef[] = [
  { speciesId: 'ashkarath', title: 'General of Cinders', army: 'The Cinder Vanguard' },
  { speciesId: 'vormaela', title: 'Tide-Empress', army: 'The Drowned Choir' },
  { speciesId: 'bramblehex', title: 'The Rotwarden', army: 'The Withered March' },
  { speciesId: 'voltrazar', title: 'The Storm-Tyrant', army: 'The Iron Tempest' },
  { speciesId: 'gorrundax', title: 'Mountain-Eater', army: 'The Gravelborn Horde' },
  { speciesId: 'cryomara', title: 'Queen of the Still', army: 'The Silent Glacier' },
  { speciesId: 'luxavor', title: 'The False Dawn', army: 'The Blinding Host' },
  { speciesId: 'nyxghul', title: 'The Hollow Crown', army: 'The Crownless Legion' },
  { speciesId: 'zerathuul', title: 'The Rift-Herald', army: 'The Outer Procession' },
];

export const LEGION_WAR_SUMMARY =
  'Fifteen years ago, the Corrupted Legion — nine four-element Guardians of terrible power — massed their armies in Ghandra, the dimension at the center of the world, and prepared to invade. Three best friends stopped them: Aljay the Dawnflame with Firgara, Onthrofa and Vulfenix; Greggy the Stormheart with Raijura, Voltherion and Fulgrath; and Onnel the Worldroot with Verdalune, Gaiathorn and Nyxroot. Nine Guardians against nine generals. The five Grand Houses of Olivar were founded in the war\'s aftermath to train the tamers who will stand ready should the seal ever break.';
