// ============================================================
// AZ Tamer — static game data
// 6 Guardian types, ~30 species, techniques, items, exp curve
// ============================================================

export type GType = 'Blaze' | 'Tide' | 'Verdant' | 'Volt' | 'Gale' | 'Umbra';

// ---- The Form ladder ----------------------------------------------------
// A Guardian's `stage` is its FORM. Forms are ranked 0..8: the more a
// Guardian has evolved, the higher its rank, the stronger it is, and the
// more it out-classes lesser forms in battle (see formRank / the Form-Block
// rule in battle.ts). The five top tiers are the new evolution kinds:
//   Split (branches into 2) → Special → Terra → Transcendence → Aether.
// 'Legendary' is a legacy alias kept only so old references compile; it maps
// to rank 8 alongside Aether.
export type EvoKind = 'Split' | 'Special' | 'Terra' | 'Transcendent' | 'Aether';
export type Stage =
  | 'Novice' | 'Adept' | 'Elite' | 'Apex'
  | 'Split' | 'Special' | 'Terra' | 'Transcendent' | 'Aether'
  | 'Legendary';
/** Rank-ordered ladder — `STAGES.indexOf(stage)` IS the form rank (0..8). */
export const STAGES: Stage[] = ['Novice', 'Adept', 'Elite', 'Apex', 'Split', 'Special', 'Terra', 'Transcendent', 'Aether'];

export const STAGE_RANK: Record<Stage, number> = {
  Novice: 0, Adept: 1, Elite: 2, Apex: 3,
  Split: 4, Special: 5, Terra: 6, Transcendent: 7, Aether: 8,
  Legendary: 8, // legacy alias
};
/** How a Guardian reaches a form — shown in the Atlas / ascension lab. */
export const STAGE_KIND_LABEL: Record<Stage, string> = {
  Novice: 'Base form', Adept: '1st Evolution', Elite: '2nd Evolution', Apex: '3rd Evolution',
  Split: 'Split Evolution', Special: 'Special Evolution', Terra: 'Terra Evolution',
  Transcendent: 'Transcendence', Aether: 'Aether Evolution', Legendary: 'Aether Evolution',
};

/**
 * Numeric form rank (0..8) for a stage, a species, or anything carrying a
 * `stage`. The Big Three's Nine are forced to rank 8 (8th-evolution legends)
 * regardless of how their species def is tagged.
 */
export function formRank(s: Stage | SpeciesDef | { stage: Stage; id?: string }): number {
  if (typeof s === 'string') return STAGE_RANK[s] ?? 0;
  if (s && (s as SpeciesDef).id && isBig3Legend((s as SpeciesDef).id)) return 8;
  return STAGE_RANK[s.stage] ?? 0;
}

// Attacker -> Defender damage multiplier (default 1.0)
export const TYPE_CHART: Record<GType, Partial<Record<GType, number>>> = {
  Blaze:   { Verdant: 1.5, Gale: 1.25, Tide: 0.5,  Blaze: 0.75 },
  Tide:    { Blaze: 1.5,  Umbra: 1.25, Verdant: 0.5, Volt: 0.5 },
  Verdant: { Tide: 1.5,   Volt: 1.25,  Blaze: 0.5,  Gale: 0.75 },
  Volt:    { Gale: 1.5,   Tide: 1.25,  Verdant: 0.5, Umbra: 0.75 },
  Gale:    { Verdant: 1.5, Umbra: 1.25, Volt: 0.5,  Blaze: 0.75 },
  Umbra:   { Volt: 1.5,   Blaze: 1.25, Gale: 0.5,  Tide: 0.75 },
};

export const TYPE_COLORS: Record<GType, number> = {
  Blaze: 0xf2603a, Tide: 0x3a9df2, Verdant: 0x4ec45e,
  Volt: 0xf2d23a, Gale: 0x7adfd0, Umbra: 0x9a5af2,
};
export const TYPE_CSS: Record<GType, string> = {
  Blaze: '#f2603a', Tide: '#3a9df2', Verdant: '#4ec45e',
  Volt: '#f2d23a', Gale: '#7adfd0', Umbra: '#9a5af2',
};

export function typeMult(atk: GType, def: GType): number {
  return TYPE_CHART[atk]?.[def] ?? 1.0;
}

// ============================================================
// ELEMENTS — the true damage system of Aurel.
// Every Guardian carries 1–3 elements (4 on singular beings).
// Damage = product of the attack element vs every defender
// element, clamped so nothing one-shots.
// ============================================================
export type Element =
  | 'Fire' | 'Water' | 'Nature' | 'Electric' | 'Rock'
  | 'Ice' | 'Light' | 'Dark' | 'Space' | 'Aether';

export const ELEMENTS: Element[] = ['Fire', 'Water', 'Nature', 'Electric', 'Rock', 'Ice', 'Light', 'Dark', 'Space', 'Aether'];

export const ELEMENT_CSS: Record<Element, string> = {
  Fire: '#f2603a', Water: '#3a9df2', Nature: '#4ec45e', Electric: '#f2d23a', Rock: '#b0865a',
  Ice: '#9adff2', Light: '#f2e8b8', Dark: '#9a5af2', Space: '#7a8af2', Aether: '#ff9ad2',
};
export const ELEMENT_ICONS: Record<Element, string> = {
  Fire: '🔥', Water: '💧', Nature: '🌿', Electric: '⚡', Rock: '🪨',
  Ice: '❄️', Light: '✨', Dark: '🌑', Space: '🌌', Aether: '🌠',
};

/**
 * Attack-element → defender-element multipliers (1.0 when unlisted).
 * Aether is special: it strikes everything hard and resists everything —
 * only Light and Dark touch it at full strength.
 */
// A diverse, opinionated chart. Each element has a real identity:
//   • Hard counters at 0.25 — Electric is GROUNDED by Rock; Ice MELTS to Fire.
//   • Devastating 2.0 super-hits (Fire→Nature/Ice, Water→Fire, Nature→Water,
//     Electric→Water, Ice→Nature) and the mutual Light↔Dark 2.0 rivalry.
//   • Most elements resist their own kind (0.5) — same-element duels grind.
//   • Aether smashes everything (1.5); only Light & Dark pierce its hide (1.25),
//     everything else chips it for 0.75.
export const ELEMENT_CHART: Record<Element, Partial<Record<Element, number>>> = {
  Fire:     { Nature: 2.0, Ice: 2.0, Rock: 1.25, Water: 0.5, Fire: 0.5, Aether: 0.75 },
  Water:    { Fire: 2.0, Rock: 1.5, Nature: 0.5, Water: 0.5, Electric: 0.75, Aether: 0.75 },
  Nature:   { Water: 2.0, Rock: 1.5, Electric: 1.25, Fire: 0.5, Ice: 0.5, Nature: 0.5, Aether: 0.75 },
  Electric: { Water: 2.0, Space: 1.5, Ice: 1.25, Rock: 0.25, Nature: 0.5, Electric: 0.5, Aether: 0.75 },
  Rock:     { Electric: 1.75, Fire: 1.5, Ice: 1.5, Space: 1.25, Water: 0.5, Nature: 0.5, Rock: 0.75, Aether: 0.75 },
  Ice:      { Nature: 2.0, Space: 1.5, Electric: 1.25, Fire: 0.25, Rock: 0.5, Ice: 0.5, Water: 0.75, Aether: 0.75 },
  Light:    { Dark: 2.0, Space: 1.5, Aether: 1.25, Light: 0.5, Rock: 0.75, Fire: 0.75 },
  Dark:     { Light: 2.0, Space: 1.5, Nature: 1.25, Aether: 1.25, Dark: 0.5, Fire: 0.75 },
  Space:    { Electric: 1.5, Ice: 1.5, Dark: 1.5, Rock: 1.25, Light: 0.5, Space: 0.5, Aether: 0.75 },
  Aether:   { Fire: 1.5, Water: 1.5, Nature: 1.5, Electric: 1.5, Rock: 1.5, Ice: 1.5, Space: 1.5, Light: 1.25, Dark: 1.25, Aether: 1.0 },
};

/** Each legacy technique school channels one element. */
export const TYPE_ELEMENT: Record<GType, Element> = {
  Blaze: 'Fire', Tide: 'Water', Verdant: 'Nature', Volt: 'Electric', Gale: 'Space', Umbra: 'Dark',
};

/** Hand-assigned elements per species (1–3; 4 only on singular beings). */
export const SPECIES_ELEMENTS: Record<string, Element[]> = {
  // Blaze main line
  cindcub: ['Fire'], pyrofang: ['Fire'], blazemaw: ['Fire', 'Rock'], infernyx: ['Fire', 'Rock'],
  solarex: ['Fire', 'Light', 'Space'],
  // Tide main line
  puddla: ['Water'], tidefin: ['Water'], maelstrike: ['Water', 'Ice'], abyssarch: ['Water', 'Dark'],
  leviathorn: ['Water', 'Ice', 'Dark'],
  // Verdant main line
  sproutle: ['Nature'], thornbex: ['Nature'], sylvigor: ['Nature', 'Rock'], eldergrove: ['Nature', 'Rock'],
  yggdranox: ['Nature', 'Rock', 'Light'],
  // Volt main line
  zaplet: ['Electric'], voltyx: ['Electric'], stormclaw: ['Electric', 'Space'], fulgurex: ['Electric', 'Space'],
  raidenjin: ['Electric', 'Light', 'Space'],
  // Gale main line
  wispry: ['Space'], galewing: ['Space'], cyclonix: ['Space', 'Electric'], tempestrix: ['Space', 'Ice'],
  zephyrax: ['Space', 'Ice', 'Electric'],
  // Umbra main line
  shadekit: ['Dark'], duskfang: ['Dark'], nocthowl: ['Dark', 'Space'], umbrelisk: ['Dark', 'Space'],
  chthonix: ['Dark', 'Space', 'Ice'],
  // wild commons
  pebblit: ['Nature', 'Rock'], cinderbat: ['Fire', 'Dark'], mistling: ['Water', 'Ice'],
  sparkmote: ['Electric', 'Light'], zephlet: ['Space'], gloomite: ['Dark', 'Rock'],
  // Dawnfire line — solphyra is the world's only four-element being
  ashwisp: ['Fire', 'Light'], flarekin: ['Fire', 'Light'], pyrelisk: ['Fire', 'Rock'],
  vulkragon: ['Fire', 'Rock'], ignisar: ['Fire', 'Light', 'Space'],
  solphyra: ['Fire', 'Light', 'Space', 'Aether'],
  // Coalback
  smolderhog: ['Fire', 'Rock'], magmaboar: ['Fire', 'Rock'],
  // Pearlcrown
  coralkit: ['Water', 'Rock'], reefrider: ['Water', 'Rock'], pearlance: ['Water', 'Light'],
  nacrelord: ['Water', 'Rock', 'Light'],
  // Coldcurrent
  frostfin: ['Water', 'Ice'], glacimaw: ['Water', 'Ice', 'Rock'],
  // Wildwarden
  fernfox: ['Nature'], bramblelynx: ['Nature'], thicketclaw: ['Nature', 'Rock'],
  grovetyrant: ['Nature', 'Dark'], sylvaeon: ['Nature', 'Light', 'Space'],
  // Sporesong
  shroomple: ['Nature', 'Dark'], mycelord: ['Nature', 'Dark'],
  // Stormcrown
  joltuft: ['Electric'], ampyre: ['Electric', 'Dark'], teslarch: ['Electric', 'Light'],
  // Cogspark
  gearmite: ['Electric', 'Rock'], dynamaul: ['Electric', 'Rock'],
  // Skyriver
  plumelet: ['Space'], skydancer: ['Space', 'Light'], stratoroc: ['Space', 'Rock'], empyrhawk: ['Space', 'Light'],
  // Lullwind
  driftling: ['Space', 'Ice'], nimbusyl: ['Space', 'Water'],
  // Nightloom
  mournmoth: ['Dark'], duskweaver: ['Dark', 'Space'], nightloom: ['Dark', 'Space'],
  phantasmoth: ['Dark', 'Space'], erebusilk: ['Dark', 'Space', 'Light'],
  // Tombward
  cryptling: ['Dark', 'Rock'], sarcophang: ['Dark', 'Rock'],
  // corrupted sentinels
  ironhusk: ['Dark', 'Rock'], gravemaw: ['Dark', 'Rock'], voltigarch: ['Electric', 'Rock'],
  // THE CORRUPTED LEGION — nine generals, four elements each
  ashkarath: ['Fire', 'Dark', 'Rock', 'Space'],
  vormaela: ['Water', 'Dark', 'Ice', 'Space'],
  bramblehex: ['Nature', 'Dark', 'Rock', 'Ice'],
  voltrazar: ['Electric', 'Dark', 'Space', 'Light'],
  gorrundax: ['Rock', 'Dark', 'Fire', 'Ice'],
  cryomara: ['Ice', 'Dark', 'Water', 'Space'],
  luxavor: ['Light', 'Dark', 'Fire', 'Space'],
  nyxghul: ['Dark', 'Space', 'Ice', 'Light'],
  zerathuul: ['Space', 'Dark', 'Electric', 'Ice'],
  // Legends' Nine Elements
  firgara: ['Aether', 'Light', 'Fire'],
  onthrofa: ['Space', 'Aether'],
  vulfenix: ['Aether', 'Dark', 'Fire'],
  raijura: ['Aether', 'Light', 'Electric'],
  voltherion: ['Space', 'Aether', 'Electric'],
  fulgrath: ['Aether', 'Dark', 'Electric'],
  verdalune: ['Aether', 'Light', 'Nature'],
  gaiathorn: ['Space', 'Aether', 'Nature'],
  nyxroot: ['Aether', 'Dark', 'Nature'],
  // fusions
  pyrostrike: ['Fire', 'Electric'],
  aquafrost: ['Water', 'Ice'],
  terragrow: ['Nature', 'Rock'],
  voltclysm: ['Electric', 'Space'],
  umbrashade: ['Dark', 'Space'],
  solgaleo: ['Fire', 'Space'],
  tidedeep: ['Water', 'Dark'],
  thornspark: ['Nature', 'Electric'],
  duskbloom: ['Dark', 'Nature'],
  aethergale: ['Space', 'Aether'],
  lavachain: ['Fire', 'Rock'],
  stormwave: ['Electric', 'Water'],
  glaciervine: ['Ice', 'Nature'],
  shadowlight: ['Dark', 'Light'],
  aetherion: ['Space', 'Aether'],
  // extra-evolutions
  pyromount: ['Fire', 'Rock'],
  puddlecrest: ['Water', 'Light'],
  sproutshell: ['Nature', 'Rock'],
  zapwing: ['Electric', 'Space'],
  wispserpent: ['Space', 'Dark'],
  shadeclaw: ['Dark', 'Electric'],
  // New Blaze lines
  pyropup: ['Fire', 'Dark'], pyrohound: ['Fire', 'Dark'],
  cindawing: ['Fire', 'Space'], cindafalcon: ['Fire', 'Space'],
  magmatot: ['Fire', 'Rock'], magmatort: ['Fire', 'Rock'],
  // New Tide lines
  bubbledrag: ['Water', 'Light'], pearlwyrm: ['Water', 'Light'],
  mistpaw: ['Water', 'Ice'], frostlynx: ['Water', 'Ice'],
  coralbud: ['Water', 'Rock'], reefguard: ['Water', 'Rock'],
  // New Verdant lines
  seedsqrl: ['Nature', 'Electric'], voltcanopy: ['Nature', 'Electric'],
  sporepix: ['Nature', 'Dark'], fungoking: ['Nature', 'Dark'],
  rootlet: ['Nature', 'Rock'], grovewarden: ['Nature', 'Rock'],
  // New Volt lines
  joltmous: ['Electric', 'Space'], galvanix: ['Electric', 'Space'],
  sparkeef: ['Electric', 'Water'], tesladrag: ['Electric', 'Water'],
  stormchick: ['Electric', 'Light'], voltwing: ['Electric', 'Light'],
  // New Gale lines
  nebulet: ['Space', 'Light'], astralpaw: ['Space', 'Light'],
  galewyrm: ['Space', 'Ice'], tempestwyrm: ['Space', 'Ice'],
  cosmolet: ['Space', 'Dark'], stargazer: ['Space', 'Dark'],
  // New Umbra lines
  voidkit: ['Dark', 'Space'], nebularix: ['Dark', 'Space'],
  vampbat: ['Dark', 'Electric'], nosferatus: ['Dark', 'Electric'],
  gravemini: ['Dark', 'Rock'], gravemonolith: ['Dark', 'Rock'],
  // Blaze 4-stage elements
  flamesal: ['Fire', 'Rock'], emberskink: ['Fire', 'Rock'], lavaserpent: ['Fire', 'Rock'], magmadrak: ['Fire', 'Rock', 'Light'],
  coalbug: ['Fire', 'Dark'], cinderscarab: ['Fire', 'Dark'], pyroshell: ['Fire', 'Dark'], coalossus: ['Fire', 'Dark', 'Rock'],
  flarefly: ['Fire', 'Light'], sparkwing: ['Fire', 'Light'], lumiprix: ['Fire', 'Light'], aurorafire: ['Fire', 'Light', 'Space'],
  // Tide 4-stage elements
  wavepup: ['Water', 'Space'], tidehound: ['Water', 'Space'], oceanclysm: ['Water', 'Space'], abysshound: ['Water', 'Space', 'Dark'],
  jellymote: ['Water', 'Electric'], aquajelly: ['Water', 'Electric'], voltmedusa: ['Water', 'Electric'], abysssiren: ['Water', 'Electric', 'Dark'],
  seaturt: ['Water', 'Rock'], reefscale: ['Water', 'Rock'], pearlshield: ['Water', 'Light'], oceantitan: ['Water', 'Rock', 'Light'],
  // Verdant 4-stage elements
  leaffawn: ['Nature', 'Light'], sylvadeer: ['Nature', 'Light'], thornstag: ['Nature', 'Light'], solarstag: ['Nature', 'Light', 'Space'],
  snapsprout: ['Nature', 'Dark'], snaporchid: ['Nature', 'Dark'], brambleviper: ['Nature', 'Dark'], rotwyrm: ['Nature', 'Dark', 'Ice'],
  barkchick: ['Nature', 'Space'], sylvawing: ['Nature', 'Space'], forestglide: ['Nature', 'Space'], canopyhawk: ['Nature', 'Space', 'Light'],
  // Volt 4-stage elements
  shocklamb: ['Electric', 'Nature'], voltram: ['Electric', 'Nature'], stormhorn: ['Electric', 'Nature'], fulguram: ['Electric', 'Nature', 'Light'],
  sparksparrow: ['Electric', 'Space'], teslafalcon: ['Electric', 'Space'], galvanicstrike: ['Electric', 'Space'], stormapex: ['Electric', 'Space', 'Light'],
  voltcrab: ['Electric', 'Rock'], staticclaw: ['Electric', 'Rock'], teslashell: ['Electric', 'Rock'], stormgoliath: ['Electric', 'Rock', 'Space'],
  // Gale 4-stage elements
  spacepup: ['Space', 'Electric'], cosmichound: ['Space', 'Electric'], stellarwolf: ['Space', 'Electric'], nebulamort: ['Space', 'Electric', 'Dark'],
  starowlet: ['Space', 'Light'], astralowl: ['Space', 'Light'], cosmoswing: ['Space', 'Light'], galaxia: ['Space', 'Light', 'Aether'],
  nebwyrm: ['Space', 'Dark'], voidwyrm: ['Space', 'Dark'], riftserpent: ['Space', 'Dark'], cosmoclysm: ['Space', 'Dark', 'Ice'],
  // Umbra 4-stage elements
  gloomwing: ['Dark', 'Space'], shadowwing: ['Dark', 'Space'], voidgoyle: ['Dark', 'Space'], apocalypsebat: ['Dark', 'Space', 'Electric'],
  duskkitty: ['Dark', 'Ice'], umbraknell: ['Dark', 'Ice'], shadowstalker: ['Dark', 'Ice'], voidreaper: ['Dark', 'Ice', 'Space'],
  crypttot: ['Dark', 'Rock'], tombgolem: ['Dark', 'Rock'], cairnwarden: ['Dark', 'Rock'], obeliskarch: ['Dark', 'Rock', 'Light'],
  // ---- High-tier ascensions (Split alts → Special → Terra → Transcendence → Aether) ----
  // Top tiers carry Aether, which resists most elements and is pierced only by Light/Dark.
  magmaroth: ['Fire', 'Rock'], heliarch: ['Fire', 'Light', 'Space'], pyrethon: ['Fire', 'Light', 'Rock'], aurelflare: ['Fire', 'Light', 'Aether'], solmageddon: ['Fire', 'Aether', 'Light'],
  maelgheist: ['Water', 'Dark'], tidewraith: ['Water', 'Ice', 'Dark'], oceanarch: ['Water', 'Ice', 'Light'], abyssophar: ['Water', 'Dark', 'Aether'], maremortis: ['Water', 'Aether', 'Ice'],
  thornmaw: ['Nature', 'Dark'], sylvanarch: ['Nature', 'Light', 'Space'], terravine: ['Nature', 'Rock', 'Light'], genesophar: ['Nature', 'Light', 'Aether'], worldwither: ['Nature', 'Aether', 'Dark'],
  voltgolem: ['Electric', 'Rock'], stormarch: ['Electric', 'Light', 'Space'], galvanyx: ['Electric', 'Space', 'Rock'], voltranscend: ['Electric', 'Light', 'Aether'], dynastorm: ['Electric', 'Aether', 'Space'],
  cyclonaut: ['Space', 'Electric'], aeronarch: ['Space', 'Light'], stratoterra: ['Space', 'Rock', 'Light'], cosmovault: ['Space', 'Ice', 'Aether'], voidtempest: ['Space', 'Aether', 'Dark'],
  nyxmaw: ['Dark', 'Ice'], umbrarch: ['Dark', 'Space', 'Light'], tenebraterra: ['Dark', 'Rock', 'Space'], voidsovereign: ['Dark', 'Space', 'Aether'], nihilumbra: ['Dark', 'Aether', 'Space'],
};

/** Elements of a species (falls back to its technique school's element). Supports Guardian / Unit objects. */
export function elementsOf(speciesIdOrGuardian: any): Element[] {
  if (speciesIdOrGuardian && typeof speciesIdOrGuardian === 'object') {
    if (Array.isArray(speciesIdOrGuardian.elements)) return speciesIdOrGuardian.elements;
    if (speciesIdOrGuardian.g && Array.isArray(speciesIdOrGuardian.g.elements)) return speciesIdOrGuardian.g.elements;
  }
  const speciesId = typeof speciesIdOrGuardian === 'string' ? speciesIdOrGuardian : speciesIdOrGuardian?.speciesId;
  if (!speciesId) return [];
  return SPECIES_ELEMENTS[speciesId]
    ?? [TYPE_ELEMENT[SPECIES[speciesId]?.type ?? 'Blaze']];
}

/**
 * Total effectiveness of an attack element against a defender's
 * element set: the product of every pairing, clamped to [0.4, 2.5].
 */
export function elementMult(attack: Element, defenders: Element[]): number {
  let m = 1;
  for (const d of defenders) m *= ELEMENT_CHART[attack]?.[d] ?? 1.0;
  // Widened range: multi-element stacking can reach a brutal 3.0 or be
  // hard-resisted down to 0.25 — far more swingy than the old [0.4, 2.5].
  return Math.max(0.25, Math.min(3.0, m));
}

/** Small inline element chips (icons + colors) for HTML UIs. */
export function elementChipsHTML(speciesId: string, size = 12): string {
  return elementsOf(speciesId).map(el =>
    `<span class="el-chip" style="background:${ELEMENT_CSS[el]}22;border-color:${ELEMENT_CSS[el]};color:${ELEMENT_CSS[el]};font-size:${size}px" title="${el}">${ELEMENT_ICONS[el]} ${el}</span>`
  ).join('');
}

// ---------------- Stats ----------------
export interface Stats { hp: number; sp: number; atk: number; def: number; spd: number; wis: number; }
export type StatKey = keyof Stats;
export const STAT_NAMES: Record<StatKey, string> = {
  hp: 'HP', sp: 'SP', atk: 'Attack', def: 'Defense', spd: 'Speed', wis: 'Wisdom',
};

export function expForLevel(level: number): number {
  // total exp required to BE at `level`.
  //
  // Two-phase curve, tuned so the early game flies by and the late game is a
  // steady grind rather than the old power curve (^1.85) that made 40+ feel
  // impossible:
  //   • Levels 1→30  — a gentle ramp. Each level-up costs 18 + 6·(i−1), so the
  //     first ~25 levels come fast and the player is battle-ready quickly.
  //   • Levels 30+   — a CONSTANT base (200) plus a slow linear uptrend
  //     (+14 per level). The per-level cost keeps creeping up forever, but only
  //     linearly, so high-level Guardians stay reachable and tough fights past
  //     Lv 40–50 (which pay far more EXP) are the encouraged way to climb.
  if (level <= 1) return 0;
  const L = level - 1;                       // level-ups completed to reach `level`
  if (level <= 30) {
    // Σ(18 + 6·(i−1)) for i=1..L  =  18L + 3L(L−1)
    return Math.floor(18 * L + 3 * L * (L - 1));
  }
  const base30 = 18 * 29 + 3 * 29 * 28;      // EXP to reach Lv 30 = 2958
  const n = level - 30;                       // level-ups past 30
  // Σ(200 + 14k) for k=0..n−1  =  200n + 7n(n−1)
  return Math.floor(base30 + 200 * n + 7 * n * (n - 1));
}

// ---------------- The Big Three's Legendary Nine ----------------
// Aljay the Dawnflame, Greggy the Stormheart and Onnel the Worldroot each
// walked into Ghandra with three bonded lights. These nine Aether Guardians
// stand a tier above everything else: bonus stats (in state.ts), a higher
// damage ceiling, and a unique signature art apiece (see SIGNATURE_TECH).
export const BIG3_LEGEND_IDS = [
  'firgara', 'onthrofa', 'vulfenix', // Aljay's
  'raijura', 'voltherion', 'fulgrath', // Greggy's
  'verdalune', 'gaiathorn', 'nyxroot', // Onnel's
] as const;
export function isBig3Legend(speciesId: string): boolean {
  return (BIG3_LEGEND_IDS as readonly string[]).includes(speciesId);
}
/** speciesId → the id of that legend's exclusive signature technique. */
export const SIGNATURE_TECH: Record<string, string> = {
  firgara: 'daybreak_severance',
  onthrofa: 'eclipse_of_hours',
  vulfenix: 'rosefire_requiem',
  raijura: 'thunderclap_genesis',
  voltherion: 'dynamo_overload',
  fulgrath: 'fulgurant_coil',
  verdalune: 'lunar_bloom',
  gaiathorn: 'worldgarden_collapse',
  nyxroot: 'abyssal_taproot',
};

// ---------------- Techniques ----------------
export type TechKind = 'phys' | 'art';
export type TechEffect = 'damage' | 'heal' | 'buffAtk' | 'buffDef' | 'debuffDef' | 'debuffSpd' | 'drain' | 'buffSpd' | 'debuffAtk' | 'percent_damage' | 'flat_heal' | 'percent_heal' | 'revive';
export type TechTarget = 'one' | 'all' | 'self' | 'ally';

export interface TechStatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  duration: number;
  effect: 'atk' | 'def' | 'spd' | 'wis' | 'dot' | 'hot' | 'stun' | 'reflect' | 'drain' | 'paralyze' | 'blind' | 'doom' | 'freeze' | 'sleep' | 'provoke' | 'curse' | 'shield' | 'berserk' | 'corrosion';
  value: number;
  icon: string;
  desc: string;
  shieldHp?: number;
  provokedBy?: any; // Unit reference in battle.ts, typed as any to avoid circular dependency
  stacks?: number;
}

export interface Technique {
  id: string; name: string; type: GType; kind: TechKind;
  power: number; spCost: number; effect: TechEffect; target: TechTarget; desc: string;
  statusChance?: number;
  statusEffect?: TechStatusEffect;
  cooldown?: number;     // turns the user must wait before re-using (0/undefined = always ready)
  signature?: boolean;   // a Big-Three legend's unique art — unlearnable by others, breaks the normal damage ceiling
}

const T = (id: string, name: string, type: GType, kind: TechKind, power: number, spCost: number,
  effect: TechEffect, target: TechTarget, desc: string): Technique =>
  ({ id, name, type, kind, power, spCost, effect, target, desc });

const T_status = (
  id: string, name: string, type: GType, kind: TechKind, power: number, spCost: number,
  effect: TechEffect, target: TechTarget, desc: string,
  statusId: string, statusName: string, statusType: 'buff' | 'debuff', duration: number,
  statusEff: TechStatusEffect['effect'],
  statusVal: number, statusIcon: string, statusDesc: string, chance = 1.0
): Technique => ({
  id, name, type, kind, power, spCost, effect, target, desc,
  statusChance: chance,
  statusEffect: {
    id: statusId, name: statusName, type: statusType, duration, effect: statusEff, value: statusVal, icon: statusIcon, desc: statusDesc
  }
});

/** A Big-Three legend's exclusive signature art: damage + cooldown + (optional) inflicted status. */
const T_sig = (
  id: string, name: string, type: GType, kind: TechKind, power: number, spCost: number,
  target: TechTarget, cooldown: number, desc: string,
  status?: { id: string; name: string; type: 'buff' | 'debuff'; duration: number; effect: TechStatusEffect['effect']; value: number; icon: string; desc: string; chance: number }
): Technique => ({
  id, name, type, kind, power, spCost, effect: 'damage', target, desc,
  cooldown, signature: true,
  ...(status ? {
    statusChance: status.chance,
    statusEffect: {
      id: status.id, name: status.name, type: status.type, duration: status.duration,
      effect: status.effect, value: status.value, icon: status.icon, desc: status.desc,
    },
  } : {}),
});

export const TECHS: Record<string, Technique> = Object.fromEntries([
  // Blaze
  T('ember_snap', 'Ember Snap', 'Blaze', 'phys', 22, 4, 'damage', 'one', 'A quick bite wreathed in sparks.'),
  T('cinder_lash', 'Cinder Lash', 'Blaze', 'phys', 38, 8, 'damage', 'one', 'A whipping strike of burning embers.'),
  T('flame_burst', 'Flame Burst', 'Blaze', 'art', 34, 12, 'damage', 'all', 'Erupting flames scorch all foes.'),
  T('inferno_maw', 'Inferno Maw', 'Blaze', 'phys', 62, 16, 'damage', 'one', 'Crushing jaws of pure fire.'),
  T('sun_cataclysm', 'Sun Cataclysm', 'Blaze', 'art', 70, 26, 'damage', 'all', 'Calls down a fragment of the sun.'),
  T('blaze_rally', 'Blaze Rally', 'Blaze', 'art', 0, 10, 'buffAtk', 'self', 'Stokes inner fire, raising Attack.'),
  // Tide
  T('bubble_jet', 'Bubble Jet', 'Tide', 'art', 22, 4, 'damage', 'one', 'A pressurized stream of bubbles.'),
  T('rip_current', 'Rip Current', 'Tide', 'art', 38, 8, 'damage', 'one', 'A sudden undertow slams the foe.'),
  T('mist_veil', 'Mist Veil', 'Tide', 'art', 0, 10, 'buffDef', 'self', 'Cloaks the body in mist, raising Defense.'),
  T('tidal_crush', 'Tidal Crush', 'Tide', 'phys', 60, 16, 'damage', 'one', 'A wall of water collapses on the foe.'),
  T('abyss_maelstrom', 'Abyss Maelstrom', 'Tide', 'art', 66, 26, 'damage', 'all', 'Drags all foes into a whirlpool.'),
  T('spring_mend', 'Spring Mend', 'Tide', 'art', 120, 14, 'flat_heal', 'ally', 'Healing waters restore 120 HP to an ally.'),
  // Verdant
  T('seed_shot', 'Seed Shot', 'Verdant', 'phys', 22, 4, 'damage', 'one', 'Fires hardened seeds at the foe.'),
  T('thorn_whip', 'Thorn Whip', 'Verdant', 'phys', 38, 8, 'damage', 'one', 'A barbed vine lashes the foe.'),
  T('sap_drain', 'Sap Drain', 'Verdant', 'art', 30, 12, 'drain', 'one', 'Steals life-sap to heal the user.'),
  T('bramble_cage', 'Bramble Cage', 'Verdant', 'art', 34, 12, 'damage', 'all', 'Thorned brambles tear at all foes.'),
  T('elder_wrath', 'Elder Wrath', 'Verdant', 'phys', 68, 24, 'damage', 'one', 'The forest itself strikes in anger.'),
  T('bloom_ward', 'Bloom Ward', 'Verdant', 'art', 35, 15, 'percent_heal', 'ally', 'Blooming pollen restores 35% of an ally\'s max HP.'),
  // Volt
  T('static_jab', 'Static Jab', 'Volt', 'phys', 22, 4, 'damage', 'one', 'A jab crackling with static.'),
  T('arc_bolt', 'Arc Bolt', 'Volt', 'art', 38, 8, 'damage', 'one', 'A leaping bolt of lightning.'),
  T('overcharge', 'Overcharge', 'Volt', 'art', 0, 10, 'buffAtk', 'self', 'Floods muscles with current, raising Attack.'),
  T('storm_lance', 'Storm Lance', 'Volt', 'art', 62, 16, 'damage', 'one', 'A spear of condensed lightning.'),
  T('thunder_dominion', 'Thunder Dominion', 'Volt', 'art', 68, 26, 'damage', 'all', 'A storm crowns the battlefield.'),
  T('numbing_field', 'Numbing Field', 'Volt', 'art', 12, 10, 'debuffSpd', 'all', 'Static field slows all foes.'),
  // Gale
  T('gust_cut', 'Gust Cut', 'Gale', 'phys', 22, 4, 'damage', 'one', 'A slicing crescent of wind.'),
  T('dive_talon', 'Dive Talon', 'Gale', 'phys', 38, 8, 'damage', 'one', 'A plunging talon strike.'),
  T('tailwind', 'Tailwind', 'Gale', 'art', 0, 10, 'buffAtk', 'self', 'Rides the wind, raising Attack.'),
  T('razor_cyclone', 'Razor Cyclone', 'Gale', 'art', 36, 12, 'damage', 'all', 'A cyclone of blades engulfs all foes.'),
  T('sky_sunder', 'Sky Sunder', 'Gale', 'phys', 66, 22, 'damage', 'one', 'Splits the air itself in a single stroke.'),
  // Umbra
  T('shade_nip', 'Shade Nip', 'Umbra', 'phys', 22, 4, 'damage', 'one', 'A bite from a living shadow.'),
  T('gloom_ray', 'Gloom Ray', 'Umbra', 'art', 38, 8, 'damage', 'one', 'A ray of condensed darkness.'),
  T_status('dread_howl', 'Dread Howl', 'Umbra', 'art', 12, 10, 'debuffDef', 'all', 'A terrifying howl that lowers defense and provokes all foes.',
    'provoked', 'Provoked', 'debuff', 2, 'provoke', 0.0, '💢', 'Forced to target the caller.', 0.8),
  T('void_fang', 'Void Fang', 'Umbra', 'phys', 60, 16, 'damage', 'one', 'Fangs that devour light.'),
  T('eclipse_requiem', 'Eclipse Requiem', 'Umbra', 'art', 70, 26, 'damage', 'all', 'A requiem sung at the death of light.'),
  T('umbral_drain', 'Umbral Drain', 'Umbra', 'art', 34, 14, 'drain', 'one', 'Siphons vitality through shadow.'),
  // Legendary Starter Moves
  T('sol_eruption', 'Sol Eruption', 'Blaze', 'art', 90, 32, 'debuffDef', 'all', 'Erupts with the heat of the sun, melting the Defense of all foes.'),
  T('deluge_tempest', 'Deluge Tempest', 'Tide', 'art', 88, 30, 'drain', 'one', 'Summons a torrential deluge that siphons life force back to the caster.'),
  T('nature_judgment', 'Nature Judgment', 'Verdant', 'art', 300, 34, 'flat_heal', 'all', 'Unleashes the forest\'s judgment, restoring 300 HP to all allies.'),
  T('volt_singularity', 'Volt Singularity', 'Volt', 'art', 90, 32, 'debuffSpd', 'all', 'Creates an electromagnetic singularity that slows all foes.'),
  T('void_extinction', 'Void Extinction', 'Umbra', 'art', 95, 35, 'drain', 'one', 'Devours the target in void energy, restoring massive HP to the user.'),
  T('tempest_gale', 'Tempest Gale', 'Gale', 'art', 85, 28, 'buffAtk', 'self', 'A hurricane of wings that strikes all foes and stokes own Attack.'),
  // Aether-stage signature arts
  T('aether_flare', 'Aether Flare', 'Blaze', 'art', 105, 36, 'damage', 'all', 'The light that existed before fire. All foes are bathed in dawn made weapon.'),
  T('dawn_rebirth', 'Dawn Rebirth', 'Blaze', 'art', 50, 30, 'percent_heal', 'all', 'A sunrise sung backwards — restores 50% max HP to all allies.'),
  T('tide_revive', 'Tidal Resurrection', 'Tide', 'art', 50, 35, 'revive', 'ally', 'Invokes the deep tide to revive a fainted ally with 50% HP.'),
  T('verdant_revive', 'Aetherial Rebirth', 'Verdant', 'art', 100, 60, 'revive', 'ally', 'An ultimate forest rebirth that revives a fainted ally with full HP.'),
  // ---- Aether world-boss ultimates (one per element; the new top-tier roster's signature AoE) ----
  T('sol_annihilation', 'Sol Annihilation', 'Blaze', 'art', 112, 36, 'damage', 'all', 'The final flare of a dying sun, poured over the whole field.'),
  T('tidal_apocalypse', 'Tidal Apocalypse', 'Tide', 'art', 112, 36, 'damage', 'all', 'An ocean raised vertical and dropped on the world at once.'),
  T('world_ender', 'World-Ender', 'Verdant', 'art', 112, 36, 'damage', 'all', 'The forest reclaims everything — roots erupt through every foe.'),
  T('storm_god_wrath', 'Stormgod\'s Wrath', 'Volt', 'art', 112, 36, 'damage', 'all', 'Every cloud in the sky discharges into the same instant.'),
  T('void_maelstrom', 'Void Maelstrom', 'Gale', 'art', 112, 36, 'damage', 'all', 'A whirlpool of folded space that swallows the battlefield whole.'),
  T('oblivion_eclipse', 'Oblivion Eclipse', 'Umbra', 'art', 112, 36, 'damage', 'all', 'The last eclipse — the one the sun does not come back from.'),

  // Blaze status moves
  T_status('magma_spit', 'Magma Spit', 'Blaze', 'art', 20, 5, 'damage', 'one', 'Spits superheated magma that corrodes armor.',
    'corroded', 'Corroded', 'debuff', 3, 'corrosion', 0.06, '🌋', 'Taking acid damage and losing 15% defense per turn.', 0.8),
  T_status('pyro_shield', 'Pyro Shield', 'Blaze', 'art', 0, 8, 'buffDef', 'self', 'Surrounds the caster in a shield of flame.',
    'fire_armor', 'Fire Armor', 'buff', 3, 'shield', 0.20, '🔥', 'Barrier: absorbs damage and grants +20% defense.', 1.0),
  T_status('blazing_claw', 'Blazing Claw', 'Blaze', 'phys', 35, 6, 'damage', 'one', 'Lashes out with burning claws, leaving a burn.',
    'burn', 'Burned', 'debuff', 3, 'dot', 0.08, '🔥', 'Taking fire damage over time.', 0.7),
  T_status('heat_wave', 'Heat Wave', 'Blaze', 'art', 30, 12, 'damage', 'all', 'Releases a wave of heat that singes all enemies.',
    'singed', 'Singed', 'debuff', 2, 'dot', 0.04, '🌋', 'Taking minor damage and reduced defense.', 0.6),
  T_status('combustion', 'Combustion', 'Blaze', 'art', 50, 10, 'damage', 'one', 'A sudden explosion that causes severe burns.',
    'burn', 'Burned', 'debuff', 3, 'dot', 0.08, '🔥', 'Taking fire damage over time.', 0.8),
  T_status('sun_channel', 'Sun Channel', 'Blaze', 'art', 0, 10, 'buffAtk', 'self', 'Channels solar energy, entering a Berserk rage with +50% Attack!',
    'berserk', 'Berserk', 'buff', 2, 'berserk', 0.5, '😡', 'Attack +50%, but out of control: strikes random targets.', 1.0),
  T_status('flame_charge', 'Flame Charge', 'Blaze', 'phys', 45, 12, 'damage', 'one', 'A blazing tackle that boosts the user\'s speed.',
    'haste', 'Haste', 'buff', 3, 'spd', 0.3, '🌀', 'Speed increased by 30%.', 1.0),
  T_status('eruption_strike', 'Eruption Strike', 'Blaze', 'phys', 65, 16, 'damage', 'one', 'A heavy hit wreathed in lava that burns.',
    'burn', 'Burned', 'debuff', 3, 'dot', 0.08, '🔥', 'Taking fire damage over time.', 0.9),
  T_status('solar_burst', 'Solar Burst', 'Blaze', 'art', 55, 20, 'damage', 'all', 'A solar flash that corrodes defense.',
    'corroded', 'Corroded', 'debuff', 3, 'corrosion', 0.05, '🌋', 'Taking acid damage and losing 15% defense per turn.', 0.8),
  T_status('supernova', 'Supernova', 'Blaze', 'art', 90, 28, 'damage', 'all', 'A catastrophic explosion that burns all targets but singes the caster.',
    'burn', 'Burned', 'debuff', 4, 'dot', 0.08, '🔥', 'Taking fire damage over time.', 1.0),

  // Tide status moves
  T_status('aqua_splash', 'Aqua Splash', 'Tide', 'art', 20, 5, 'damage', 'one', 'Splashes the target with water, soaking them.',
    'soaked', 'Soaked', 'debuff', 3, 'atk', -0.15, '💧', 'Attack reduced by 15%.', 0.8),
  T_status('chilling_wind', 'Chilling Wind', 'Tide', 'art', 25, 6, 'damage', 'one', 'A freezing draft that chills the target.',
    'chill', 'Chilled', 'debuff', 3, 'spd', -0.2, '❄️', 'Speed reduced by 20%.', 0.8),
  T_status('dew_drop', 'Dew Drop', 'Tide', 'art', 0, 8, 'heal', 'ally', 'Restores health and grants stackable regeneration.',
    'regen_stackable', 'Regen', 'buff', 3, 'hot', 0.05, '🌿', 'Restoring health over time (stacks up to 3x).', 1.0),
  T_status('ocean_sanctuary', 'Ocean Sanctuary', 'Tide', 'art', 0, 12, 'buffDef', 'self', 'Shields the caster in deep ocean water.',
    'ocean_shield', 'Ocean Shield', 'buff', 3, 'shield', 0.3, '🫧', 'Barrier: absorbs damage and grants +20% defense.', 1.0),
  T_status('bubble_burst', 'Bubble Burst', 'Tide', 'art', 40, 10, 'damage', 'one', 'An exploding bubble that soaks the target.',
    'soaked', 'Soaked', 'debuff', 3, 'atk', -0.15, '💧', 'Attack reduced by 15%.', 0.8),
  T_status('frost_bite', 'Frost Bite', 'Tide', 'phys', 52, 12, 'damage', 'one', 'A freezing bite that chills the target.',
    'chill', 'Chilled', 'debuff', 3, 'spd', -0.2, '❄️', 'Speed reduced by 20%.', 0.8),
  T_status('tidal_wave_tech', 'Tidal Wave', 'Tide', 'art', 48, 18, 'damage', 'all', 'A giant wave that soaks all enemies.',
    'soaked', 'Soaked', 'debuff', 3, 'atk', -0.15, '💧', 'Attack reduced by 15%.', 0.8),
  T_status('ice_spear', 'Ice Spear', 'Tide', 'art', 68, 16, 'damage', 'one', 'A piercing spear of ice that freezes.',
    'frozen', 'Frozen', 'debuff', 2, 'freeze', 0.0, '❄️', 'Frozen solid. Physical hits shatter for +40% damage.', 0.4),
  T_status('aquatic_mend', 'Aquatic Mend', 'Tide', 'art', 40, 16, 'heal', 'all', 'Healing waters that grant stackable regeneration to all allies.',
    'regen_stackable', 'Regen', 'buff', 3, 'hot', 0.05, '🌿', 'Restoring health over time (stacks up to 3x).', 1.0),
  T_status('abyssal_drown', 'Abyssal Drown', 'Tide', 'art', 95, 30, 'damage', 'one', 'Drags the target into the deep, chilling them.',
    'chill', 'Chilled', 'debuff', 4, 'spd', -0.25, '❄️', 'Speed reduced by 25%.', 1.0),

  // Verdant status moves
  T_status('vine_grip', 'Vine Grip', 'Verdant', 'phys', 20, 5, 'damage', 'one', 'Constricts the target in vine, reducing speed.',
    'entangled', 'Entangled', 'debuff', 3, 'spd', -0.15, '🕸️', 'Speed reduced by 15%.', 0.8),
  T_status('spore_puff', 'Spore Puff', 'Verdant', 'art', 15, 6, 'damage', 'one', 'Releases sleep-inducing spores.',
    'slumber', 'Slumber', 'debuff', 2, 'sleep', 0.0, '💤', 'Asleep. Cannot act. Wakes up on hit for +50% damage.', 0.7),
  T_status('root_mend', 'Root Mend', 'Verdant', 'art', 40, 8, 'percent_heal', 'self', 'Deep roots restore 40% HP and grant stackable regeneration.',
    'regen_stackable', 'Regen', 'buff', 3, 'hot', 0.05, '🌿', 'Restoring health over time (stacks up to 3x).', 1.0),
  T_status('leaf_shield', 'Leaf Shield', 'Verdant', 'art', 0, 10, 'buffDef', 'self', 'Creates a defensive coat of thorns that reflects physical hits.',
    'bramble_armor', 'Bramble Armor', 'buff', 3, 'reflect', 0.15, '🪵', 'Reflecting 15% of physical damage.', 1.0),
  T_status('nature_strike', 'Nature Strike', 'Verdant', 'phys', 45, 10, 'damage', 'one', 'A powerful strike that entangles the target.',
    'entangled', 'Entangled', 'debuff', 3, 'spd', -0.15, '🕸️', 'Speed reduced by 15%.', 0.8),
  T_status('toxic_thorn', 'Toxic Thorn', 'Verdant', 'phys', 38, 12, 'damage', 'one', 'Fires a poisonous thorn at the target.',
    'poison', 'Poisoned', 'debuff', 4, 'dot', 0.06, '☠️', 'Taking poison damage over time.', 0.8),
  T_status('spore_cloud', 'Spore Cloud', 'Verdant', 'art', 25, 16, 'damage', 'all', 'Enshrouds all foes in poisonous spores.',
    'poison', 'Poisoned', 'debuff', 3, 'dot', 0.05, '☠️', 'Taking poison damage over time.', 0.7),
  T_status('earthquake_tech', 'Earthquake', 'Verdant', 'phys', 70, 18, 'damage', 'one', 'A seismic tremor that slows down the target.',
    'entangled', 'Entangled', 'debuff', 3, 'spd', -0.2, '🕸️', 'Speed reduced by 20%.', 0.9),
  T_status('bramble_growth', 'Bramble Growth', 'Verdant', 'art', 0, 15, 'buffDef', 'all', 'Surrounds the party in brambles that reflect damage.',
    'bramble_armor', 'Bramble Armor', 'buff', 3, 'reflect', 0.1, '🪵', 'Reflecting 10% of physical damage.', 1.0),
  T_status('forest_wrath_tech', 'Forest Wrath', 'Verdant', 'phys', 95, 32, 'damage', 'one', 'An ancient forest attack that poisons the target.',
    'poison', 'Poisoned', 'debuff', 5, 'dot', 0.08, '☠️', 'Taking poison damage over time.', 1.0),

  // Volt status moves
  T_status('spark_shock', 'Spark Shock', 'Volt', 'art', 20, 5, 'damage', 'one', 'Zaps the foe with static that paralyzes.',
    'paralyze', 'Paralyzed', 'debuff', 3, 'paralyze', -0.15, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.7),
  T_status('voltage_boost', 'Voltage Boost', 'Volt', 'art', 0, 8, 'buffAtk', 'self', 'Accumulates static energy, boosting attack.',
    'charge', 'Charged', 'buff', 3, 'atk', 0.25, '🔋', 'Attack increased by 25%.', 1.0),
  T_status('lightning_strike_tech', 'Lightning Strike', 'Volt', 'art', 40, 8, 'damage', 'one', 'A powerful bolt that paralyzes.',
    'paralyze', 'Paralyzed', 'debuff', 3, 'paralyze', -0.15, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.7),
  T_status('static_shield', 'Static Shield', 'Volt', 'art', 0, 10, 'buffDef', 'self', 'A shield of static that boosts speed and defense.',
    'static_field', 'Static Field', 'buff', 3, 'spd', 0.2, '⚡', 'Speed increased by 20%.', 1.0),
  T_status('chain_lightning_tech', 'Chain Lightning', 'Volt', 'art', 32, 14, 'damage', 'all', 'Leaps across all foes, paralyzing them.',
    'paralyze', 'Paralyzed', 'debuff', 2, 'paralyze', -0.1, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.5),
  T_status('thunder_fang_tech', 'Thunder Fang', 'Volt', 'phys', 55, 12, 'damage', 'one', 'An electric bite that paralyzes.',
    'paralyze', 'Paralyzed', 'debuff', 3, 'paralyze', -0.15, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.8),
  T_status('overload_burst', 'Overload Burst', 'Volt', 'art', 70, 16, 'damage', 'one', 'A high voltage burst that charges the user.',
    'charge', 'Charged', 'buff', 3, 'atk', 0.25, '🔋', 'Attack increased by 25%.', 1.0),
  T_status('plasma_blast', 'Plasma Blast', 'Volt', 'art', 65, 20, 'damage', 'one', 'A scorching plasma shot that paralyzes.',
    'paralyze', 'Paralyzed', 'debuff', 3, 'paralyze', -0.2, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.9),
  T_status('shock_pulse', 'Shock Pulse', 'Volt', 'art', 45, 18, 'damage', 'all', 'An electromagnetic pulse that paralyzes.',
    'paralyze', 'Paralyzed', 'debuff', 3, 'paralyze', -0.15, '⚡', 'Speed reduced, 25% chance to skip turn.', 0.6),
  T_status('voltage_tempest_tech', 'Voltage Tempest', 'Volt', 'art', 95, 30, 'damage', 'all', 'A massive thunder storm that charges the user.',
    'charge', 'Charged', 'buff', 4, 'atk', 0.25, '🔋', 'Attack increased by 25%.', 1.0),

  // Gale status moves
  T_status('wind_slap', 'Wind Slap', 'Gale', 'phys', 20, 5, 'damage', 'one', 'Saps target\'s vision with a sudden gust, blinding them.',
    'blind', 'Blinded', 'debuff', 3, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.8),
  T_status('tailwind_breeze', 'Tailwind Breeze', 'Gale', 'art', 0, 6, 'buffSpd', 'self', 'Increases speed using wind currents.',
    'haste', 'Haste', 'buff', 3, 'spd', 0.3, '🌀', 'Speed increased by 30%.', 1.0),
  T_status('feather_blade_tech', 'Feather Blade', 'Gale', 'phys', 40, 8, 'damage', 'one', 'Launches razor-sharp feathers that blind.',
    'blind', 'Blinded', 'debuff', 3, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.8),
  T_status('zephyr_barrier', 'Zephyr Barrier', 'Gale', 'art', 0, 10, 'buffDef', 'self', 'A wall of air that boosts defense.',
    'wind_shield', 'Wind Shield', 'buff', 3, 'def', 0.3, '💨', 'Defense increased by 30%.', 1.0),
  T_status('cyclone_trap_tech', 'Cyclone Trap', 'Gale', 'art', 35, 12, 'damage', 'all', 'A cyclone that blinds all enemies.',
    'blind', 'Blinded', 'debuff', 2, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.6),
  T_status('wind_shear_tech', 'Wind Shear', 'Gale', 'art', 58, 12, 'damage', 'one', 'Cuts the target with wind shear, blinding them.',
    'blind', 'Blinded', 'debuff', 3, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.8),
  T_status('sonic_boost', 'Sonic Boost', 'Gale', 'art', 0, 12, 'buffSpd', 'self', 'Breaks the sound barrier, boosting speed.',
    'haste', 'Haste', 'buff', 3, 'spd', 0.35, '🌀', 'Speed increased by 35%.', 1.0),
  T_status('hurricane_slash_tech', 'Hurricane Slash', 'Gale', 'phys', 68, 18, 'damage', 'one', 'A slicing storm wind that blinds.',
    'blind', 'Blinded', 'debuff', 3, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.9),
  T_status('gale_force_tech', 'Gale Force', 'Gale', 'art', 48, 20, 'damage', 'all', 'A powerful gust that blinds all enemies.',
    'blind', 'Blinded', 'debuff', 3, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 0.8),
  T_status('tempest_strike_tech', 'Tempest Strike', 'Gale', 'phys', 92, 28, 'damage', 'one', 'An ultimate wind strike that hastes user and blinds target.',
    'blind', 'Blinded', 'debuff', 4, 'blind', -0.2, '💨', 'Damage output reduced by 20%.', 1.0),

  // Umbra status moves
  T_status('shadow_scratch', 'Shadow Scratch', 'Umbra', 'phys', 20, 5, 'damage', 'one', 'Scratches the foe with shadow claws, cursing them.',
    'curse', 'Cursed', 'debuff', 3, 'curse', 0.05, '🔮', 'Cursed: cannot heal and takes +100% DoT damage.', 0.8),
  T_status('soul_drain_tech', 'Soul Drain', 'Umbra', 'art', 22, 8, 'damage', 'one', 'Siphons life-essence to grant life drain.',
    'siphon', 'Siphoning', 'buff', 3, 'drain', 0.2, '🧛', 'Recovering 20% of damage dealt.', 1.0),
  T_status('nightmare_fog', 'Nightmare Fog', 'Umbra', 'art', 0, 10, 'debuffAtk', 'all', 'Enshrouds enemies in nightmare fog, cursing them.',
    'curse', 'Cursed', 'debuff', 3, 'curse', 0.04, '🔮', 'Cursed: cannot heal and takes +100% DoT damage.', 0.8),
  T_status('dark_barrier', 'Dark Barrier', 'Umbra', 'art', 0, 12, 'buffDef', 'self', 'Encases the caster in shadows.',
    'void_shield', 'Void Shield', 'buff', 3, 'shield', 0.25, '🔮', 'Barrier: absorbs damage, grants +20% defense, and curses attackers.', 1.0),
  T_status('shadow_strike_tech', 'Shadow Strike', 'Umbra', 'phys', 42, 10, 'damage', 'one', 'A swift shadow attack that curses the target.',
    'curse', 'Cursed', 'debuff', 3, 'curse', 0.05, '🔮', 'Cursed: cannot heal and takes +100% DoT damage.', 0.8),
  T_status('vampiric_bite_tech', 'Vampiric Bite', 'Umbra', 'phys', 50, 14, 'damage', 'one', 'A draining bite that grants life drain.',
    'siphon', 'Siphoning', 'buff', 3, 'drain', 0.25, '🧛', 'Recovering 25% of damage dealt.', 1.0),
  T_status('abyssal_void_tech', 'Abyssal Void', 'Umbra', 'art', 35, 18, 'damage', 'all', 'An abyssal blast that curses all enemies.',
    'curse', 'Cursed', 'debuff', 3, 'curse', 0.04, '🔮', 'Cursed: cannot heal and takes +100% DoT damage.', 0.7),
  T_status('doom_gaze', 'Doom Gaze', 'Umbra', 'art', 0, 20, 'debuffDef', 'one', 'Marks the target with doom, causing massive damage in 3 turns.',
    'doom', 'Doomed', 'debuff', 4, 'doom', 0.4, '💀', 'Will take 40% of max HP as damage.', 1.0),
  T_status('eclipse_blast_tech', 'Eclipse Blast', 'Umbra', 'art', 70, 22, 'damage', 'one', 'A blast of dark energy that curses the target.',
    'curse', 'Cursed', 'debuff', 3, 'curse', 0.05, '🔮', 'Cursed: cannot heal and takes +100% DoT damage.', 0.9),
  T_status('apocalypse_tech', 'Apocalypse', 'Umbra', 'art', 95, 32, 'damage', 'all', 'Brings about the end, marking all foes with doom.',
    'doom', 'Doomed', 'debuff', 4, 'doom', 0.3, '💀', 'Will take 30% of max HP as damage.', 1.0),

  // ===== Signature arts of the Big Three's Legendary Nine =====
  // One per legend. Devastating power, ruinous SP cost, and a 3-turn cooldown.
  // They alone are flagged `signature`, which lets their damage break the ceiling
  // every other move is bound by. No other Guardian can ever learn them.
  T_sig('daybreak_severance', 'Daybreak Severance', 'Blaze', 'phys', 165, 58, 'one', 3,
    "Firgara lifts Daybreak until the blade cups a whole sunrise, then brings the morning down in one ruinous arc. Aljay's first bond — and his alone.",
    { id: 'burn', name: 'Burned', type: 'debuff', duration: 3, effect: 'dot', value: 0.08, icon: '🔥', desc: 'Taking fire damage over time.', chance: 0.9 }),
  T_sig('eclipse_of_hours', 'Eclipse of Hours', 'Gale', 'art', 150, 64, 'one', 3,
    'Onthrofa folds the next minute shut. For the target, time simply stops — and the storm that was already falling arrives all at once.',
    { id: 'stun', name: 'Time-Locked', type: 'debuff', duration: 2, effect: 'stun', value: 0, icon: '⏳', desc: 'Frozen out of time — struggles to act.', chance: 0.5 }),
  T_sig('rosefire_requiem', 'Rosefire Requiem', 'Blaze', 'art', 156, 60, 'all', 3,
    'The rose-fire phoenix sings the note it has held since Ghandra, and the whole field blooms into petals of white flame.',
    { id: 'burn', name: 'Burned', type: 'debuff', duration: 3, effect: 'dot', value: 0.07, icon: '🔥', desc: 'Taking fire damage over time.', chance: 0.8 }),
  T_sig('thunderclap_genesis', 'Thunderclap Genesis', 'Volt', 'art', 154, 60, 'all', 3,
    'The first thunderclap Greggy ever heard, given back to the world all at once. Raijura does not strike the sky — it becomes it.',
    { id: 'paralyze', name: 'Paralyzed', type: 'debuff', duration: 3, effect: 'paralyze', value: -0.2, icon: '⚡', desc: 'Speed reduced, 25% chance to skip turn.', chance: 0.7 }),
  T_sig('dynamo_overload', 'Dynamo Overload', 'Volt', 'phys', 168, 58, 'one', 3,
    'Voltherion dumps the captive star at its core into a single grounded fist. The coil screams. The target stops doing anything at all.',
    { id: 'paralyze', name: 'Paralyzed', type: 'debuff', duration: 3, effect: 'paralyze', value: -0.25, icon: '⚡', desc: 'Speed reduced, 25% chance to skip turn.', chance: 0.85 }),
  T_sig('fulgurant_coil', 'Fulgurant Coil', 'Volt', 'art', 160, 60, 'one', 3,
    'The lightning that struck once in the dark of Ghandra and chose to stay now coils the target head to tail and discharges everything.',
    { id: 'paralyze', name: 'Paralyzed', type: 'debuff', duration: 3, effect: 'paralyze', value: -0.2, icon: '⚡', desc: 'Speed reduced, 25% chance to skip turn.', chance: 0.8 }),
  T_sig('lunar_bloom', 'Lunar Bloom', 'Verdant', 'art', 152, 62, 'all', 3,
    'Verdalune opens every petal it owns under a moon only Onnel can see. The garden that answers is not gentle.',
    { id: 'entangled', name: 'Entangled', type: 'debuff', duration: 3, effect: 'spd', value: -0.2, icon: '🕸️', desc: 'Speed reduced by 20%.', chance: 0.8 }),
  T_sig('worldgarden_collapse', 'Worldgarden Collapse', 'Verdant', 'phys', 170, 60, 'one', 3,
    'Gaiathorn lets the living garden on its back grow a century in a heartbeat — then drops the whole forest on a single foe.',
    { id: 'poison', name: 'Poisoned', type: 'debuff', duration: 4, effect: 'dot', value: 0.07, icon: '☠️', desc: 'Taking poison damage over time.', chance: 0.85 }),
  T_sig('abyssal_taproot', 'Abyssal Taproot', 'Verdant', 'art', 158, 62, 'one', 3,
    'The root that anchored the seal on Ghandra reaches up through the dark and takes hold. What it grips, it curses.',
    { id: 'curse', name: 'Cursed', type: 'debuff', duration: 3, effect: 'curse', value: 0.05, icon: '🔮', desc: 'Cursed: cannot heal and takes +100% DoT damage.', chance: 0.8 }),
  // ===== 50 NEW DISTRIBUTED TECHNIQUES =====
  T('scorch_burst', 'Scorch Burst', 'Blaze', 'art', 44, 12, 'damage', 'all', 'A burst of searing heat that spreads across the field.'),
  T_status('pyre_ward', 'Pyre Ward', 'Blaze', 'art', 0, 10, 'buffDef', 'self', 'Surrounds the caster in a shield of flame.', 'fire_armor_v2', 'Pyre Barrier', 'buff', 3, 'shield', 0.15, '🔥', 'Barrier: absorbs damage.', 1.0),
  T_status('sunflare_blast', 'Sunflare Blast', 'Blaze', 'art', 75, 20, 'damage', 'one', 'An intense beam of sunlight that melts defense.', 'melted_v2', 'Melted', 'debuff', 2, 'def', -0.2, '🌋', 'Defense melted by solar heat.', 0.5),
  T_status('blazing_temper', 'Blazing Temper', 'Blaze', 'art', 0, 10, 'buffAtk', 'self', 'Stokes a wild fury, boosting attack but causing berserk.', 'berserk_v2', 'Berserk', 'debuff', 3, 'berserk', 0.15, '😡', 'Attack increased, but strikes randomly.', 1.0),
  T_status('ember_barrage', 'Ember Barrage', 'Blaze', 'phys', 48, 12, 'damage', 'one', 'Fires a barrage of hot embers that may cause burn.', 'burn_v2', 'Burned', 'debuff', 3, 'dot', 0.05, '🔥', 'Taking fire damage over time.', 0.4),
  T_status('crimson_overdrive', 'Crimson Overdrive', 'Blaze', 'art', 0, 15, 'buffSpd', 'self', 'Increases speed and attack power.', 'crimson_haste', 'Overdrive', 'buff', 2, 'spd', 0.20, '⚡', 'Speed increased.', 1.0),
  T_status('magma_deluge', 'Magma Deluge', 'Blaze', 'art', 82, 25, 'damage', 'all', 'Pours superheated magma on all foes, melting armor.', 'corroded_v2', 'Corroded', 'debuff', 3, 'corrosion', 0.05, '🌋', 'Defense corroded over time.', 0.3),
  T('solar_blessing', 'Solar Blessing', 'Blaze', 'art', 110, 18, 'flat_heal', 'ally', 'Restores HP with warm sunlight.'),
  T('wave_splash', 'Wave Splash', 'Tide', 'phys', 25, 4, 'damage', 'one', 'Splashes the foe with a quick burst of water.'),
  T_status('coral_shield', 'Coral Shield', 'Tide', 'art', 0, 10, 'buffDef', 'self', 'Creates a protective barrier of hard coral.', 'coral_barrier', 'Coral Barrier', 'buff', 3, 'shield', 0.20, '🐚', 'Shield: absorbs damage.', 1.0),
  T_status('frost_breath', 'Frost Breath', 'Tide', 'art', 32, 10, 'damage', 'one', 'Breathes sub-zero wind that can freeze the foe.', 'frozen_v2', 'Frozen', 'debuff', 1, 'freeze', 0.0, '❄️', 'Cannot act.', 0.3),
  T('tsunami_surge', 'Tsunami Surge', 'Tide', 'art', 72, 22, 'damage', 'all', 'A massive wave sweeps across the entire battlefield.'),
  T_status('tide_meld', 'Tide Meld', 'Tide', 'art', 0, 12, 'buffDef', 'self', 'Melds with the water, gaining healing over time.', 'hot_v2', 'Aqua Regen', 'buff', 3, 'hot', 0.06, '💚', 'Restoring health each round.', 1.0),
  T_status('deep_pressure', 'Deep Pressure', 'Tide', 'art', 60, 18, 'damage', 'one', 'Crushes the foe under deep sea pressure, lowering speed.', 'pressured', 'Slowed', 'debuff', 3, 'spd', -0.2, '💧', 'Speed reduced.', 0.6),
  T('aquatic_restoration', 'Aquatic Restoration', 'Tide', 'art', 140, 20, 'flat_heal', 'ally', 'A soothing jet of water that restores health.'),
  T_status('abyssal_grip', 'Abyssal Grip', 'Tide', 'phys', 80, 24, 'damage', 'one', 'Drags the target down into the abyss, paralyzing them.', 'paralyzed_v2', 'Paralyzed', 'debuff', 2, 'paralyze', 0.0, '⚡', 'Chance to fail actions.', 0.5),
  T('needle_leaf', 'Needle Leaf', 'Verdant', 'phys', 26, 4, 'damage', 'one', 'Fires sharp pine needles at the foe.'),
  T_status('bark_armor', 'Bark Armor', 'Verdant', 'art', 0, 10, 'buffDef', 'self', 'Hardens skin into wooden armor.', 'bark_barrier', 'Bark Barrier', 'buff', 3, 'def', 0.25, '🪵', 'Defense increased.', 1.0),
  T_status('bramble_entangle', 'Bramble Entangle', 'Verdant', 'art', 30, 12, 'damage', 'one', 'Entangles the foe in thorny brambles, slowing them.', 'entangled_v2', 'Slowed', 'debuff', 2, 'spd', -0.25, '🕸️', 'Speed reduced.', 0.8),
  T('nature_nourish', 'Nature Nourish', 'Verdant', 'art', 35, 14, 'percent_heal', 'ally', 'Nourishes an ally with forest pollen, restoring 35% HP.'),
  T_status('canopy_shield', 'Canopy Shield', 'Verdant', 'art', 0, 12, 'buffDef', 'self', 'Creates a protective leaf canopy.', 'canopy_barrier', 'Canopy Barrier', 'buff', 3, 'shield', 0.18, '🍃', 'Shield: absorbs damage.', 1.0),
  T('petal_dance_tech', 'Petal Dance', 'Verdant', 'art', 52, 16, 'damage', 'all', 'A swirling storm of razor petals cutting all foes.'),
  T_status('spore_blast', 'Spore Blast', 'Verdant', 'art', 60, 18, 'damage', 'one', 'Releases toxic spores that poisons the target.', 'poisoned_v2', 'Poisoned', 'debuff', 3, 'dot', 0.06, '☠️', 'Taking poison damage over time.', 0.8),
  T('wrath_of_ghandra', 'Wrath of Ghandra', 'Verdant', 'phys', 95, 28, 'damage', 'one', 'The wrath of the legendary forest, striking with supreme force.'),
  T('static_spark', 'Static Spark', 'Volt', 'art', 24, 4, 'damage', 'one', 'Shoots a quick spark of electricity.'),
  T_status('volt_shield', 'Volt Shield', 'Volt', 'art', 0, 10, 'buffDef', 'self', 'Creates a static shield that boosts defense.', 'volt_barrier', 'Volt Shield', 'buff', 3, 'def', 0.2, '⚡', 'Defense boosted.', 1.0),
  T_status('thunderclap_strike', 'Thunderclap Strike', 'Volt', 'phys', 42, 10, 'damage', 'one', 'Strikes with a loud clap of thunder that can stun.', 'stunned_v2', 'Stunned', 'debuff', 1, 'stun', 0.0, '💫', 'Cannot act.', 0.25),
  T_status('overcharge_aura', 'Overcharge Aura', 'Volt', 'art', 0, 12, 'buffAtk', 'self', 'Overcharges own capacitors, boosting attack.', 'overcharged_v2', 'Overcharged', 'buff', 3, 'atk', 0.30, '⚡', 'Attack boosted.', 1.0),
  T('plasma_blade', 'Plasma Blade', 'Volt', 'phys', 65, 16, 'damage', 'one', 'Cuts the target with a sword of pure plasma energy.'),
  T_status('magnetic_pulse', 'Magnetic Pulse', 'Volt', 'art', 30, 14, 'debuffSpd', 'all', 'Releases an electromagnetic wave that slows all foes.', 'slowed_v2', 'Slowed', 'debuff', 3, 'spd', -0.20, '⚡', 'Speed reduced.', 0.8),
  T('chain_lightning_v2', 'Chain Lightning', 'Volt', 'art', 50, 18, 'damage', 'all', 'Fires a bolt that chains between all enemies.'),
  T_status('superconductor', 'Superconductor', 'Volt', 'art', 0, 18, 'buffSpd', 'self', 'Achieves zero resistance, boosting speed dramatically.', 'superconducting', 'Superconducting', 'buff', 3, 'spd', 0.40, '⚡', 'Speed boosted.', 1.0),
  T('breeze_strike', 'Breeze Strike', 'Gale', 'phys', 25, 4, 'damage', 'one', 'A quick gust-assisted tackle.'),
  T_status('wind_barrier', 'Wind Barrier', 'Gale', 'art', 0, 10, 'buffDef', 'self', 'Creates a swirling shield of wind.', 'wind_barrier_status', 'Wind Barrier', 'buff', 3, 'shield', 0.15, '🌀', 'Shield: absorbs damage.', 1.0),
  T('feather_cyclone', 'Feather Cyclone', 'Gale', 'art', 46, 12, 'damage', 'all', 'A vortex of sharp feathers slices all foes.'),
  T_status('slipstream_boost', 'Slipstream Boost', 'Gale', 'art', 0, 12, 'buffSpd', 'self', 'Rides the wind currents to boost speed.', 'slipstream', 'Slipstream', 'buff', 3, 'spd', 0.30, '🌀', 'Speed boosted.', 1.0),
  T_status('sonic_boom_tech', 'Sonic Boom', 'Gale', 'art', 58, 16, 'damage', 'one', 'Releases a localized sonic boom that can disorient.', 'blinded_v2', 'Blinded', 'debuff', 2, 'blind', 0.0, '🕶️', 'Reduces accuracy.', 0.3),
  T('typhoon_slice', 'Typhoon Slice', 'Gale', 'phys', 75, 20, 'damage', 'one', 'Slices through the air with hurricane-force claws.'),
  T('aero_blast', 'Aero Blast', 'Gale', 'art', 90, 24, 'damage', 'one', 'A condensed sphere of high-pressure wind blasts the target.'),
  T_status('sky_embrace', 'Sky Embrace', 'Gale', 'art', 0, 20, 'buffAtk', 'self', 'Invokes the spirit of the sky, raising attack and defense.', 'sky_blessing', 'Sky Blessing', 'buff', 3, 'atk', 0.20, '🌀', 'Attack boosted.', 1.0),
  T('shadow_jab', 'Shadow Jab', 'Umbra', 'phys', 24, 4, 'damage', 'one', 'Strikes from the shadow of the target.'),
  T_status('dark_shroud', 'Dark Shroud', 'Umbra', 'art', 0, 10, 'buffDef', 'self', 'Cloaks in darkness to raise defense.', 'dark_shroud_status', 'Dark Shroud', 'buff', 3, 'def', 0.20, '🌑', 'Defense boosted.', 1.0),
  T_status('nightmare_gaze', 'Nightmare Gaze', 'Umbra', 'art', 28, 12, 'damage', 'one', 'Invades the foe\'s mind with terror, putting them to sleep.', 'asleep_v2', 'Asleep', 'debuff', 2, 'sleep', 0.0, '💤', 'Cannot act until hit.', 0.4),
  T('void_siphon_v2', 'Void Siphon', 'Umbra', 'art', 48, 16, 'drain', 'one', 'Siphons life energy from the target to heal.'),
  T('abyssal_claw', 'Abyssal Claw', 'Umbra', 'phys', 68, 18, 'damage', 'one', 'Lashes out with dark claws.'),
  T_status('spectral_howl', 'Spectral Howl', 'Umbra', 'art', 20, 14, 'debuffAtk', 'all', 'A ghostly howl that weakens all foes.', 'weakened', 'Weakened', 'debuff', 2, 'atk', -0.20, '👻', 'Attack reduced.', 0.8),
  T('eclipse_blast_v2', 'Eclipse Blast', 'Umbra', 'art', 88, 24, 'damage', 'all', 'Unleashes the cold energy of an eclipse on all foes.'),
  T_status('doom_whisper', 'Doom Whisper', 'Umbra', 'art', 0, 30, 'damage', 'one', 'Whispers a dark curse of inevitable doom.', 'doom_v2', 'Doom', 'debuff', 4, 'doom', 0.0, '💀', 'Faints when duration reaches zero.', 0.5),
  T('aether_restoration', 'Aether Restoration', 'Tide', 'art', 50, 25, 'percent_heal', 'all', 'Invokes deep aetheric waters to restore 50% HP to all allies.'),
  T('cosmic_revival', 'Cosmic Revival', 'Umbra', 'art', 75, 45, 'revive', 'ally', 'Uses cosmic dark energy to revive an ally with 75% HP.'),
  // ===== 100 NEW SIGNATURE TECHNIQUES =====
  T_sig('celestial_supernova', 'Celestial Supernova', 'Blaze', 'art', 125, 240, 'all', 3, 'Solphyra releases a blinding core flash, burning all foes in starlight.'),
  T_sig('apocalyptic_flare', 'Apocalyptic Flare', 'Blaze', 'art', 130, 240, 'all', 4, 'Solmageddon unleashes the dying heat of the cosmos, reducing all foes to ash.'),
  T_sig('abyssal_drown', 'Abyssal Drown', 'Tide', 'art', 130, 240, 'all', 4, 'Maremortis collapses the weight of the deep ocean on all enemies.'),
  T_sig('desolation_roots', 'Desolation Roots', 'Verdant', 'art', 130, 240, 'all', 4, 'Worldwither reaches decayed roots into the earth, corrupting all foes.'),
  T_sig('lightning_judgment', 'Lightning Judgment', 'Volt', 'art', 130, 240, 'all', 4, 'Dynastorm calls down a divine thunderbolt that strikes all enemies.'),
  T_sig('vacuum_cataclysm', 'Vacuum Cataclysm', 'Gale', 'art', 130, 240, 'all', 4, 'Voidtempest rips open space, pulling all foes into a violent vacuum.'),
  T_sig('infinite_oblivion', 'Infinite Oblivion', 'Umbra', 'art', 130, 240, 'all', 4, 'Nihilumbra turns the field into absolute void, devouring all foes.'),
  T_sig('ash_domain', 'Ash Domain', 'Blaze', 'art', 90, 220, 'all', 3, 'Ashkarath fills the air with a suffocating ash cloud, debuffing defense.', { id: 'suffocating_ash', name: 'Suffocated', type: 'debuff', duration: 3, effect: 'def', value: -0.25, icon: '🌋', desc: 'Defense reduced by ash.', chance: 0.8 }),
  T_sig('abyssal_trench', 'Abyssal Trench', 'Tide', 'art', 110, 220, 'one', 3, 'Vormaela drags the target down into an ice-cold oceanic trench.'),
  T_sig('curse_briars', 'Curse Briars', 'Verdant', 'art', 85, 220, 'one', 3, 'Bramblehex wraps the target in cursed vines that prevent healing.', { id: 'curse_briars_status', name: 'Cursed', type: 'debuff', duration: 3, effect: 'curse', value: 0, icon: '🔮', desc: 'Cannot heal.', chance: 1 }),
  T_sig('voltage_punishment', 'Voltage Punishment', 'Volt', 'phys', 120, 220, 'one', 3, 'Voltrazar strikes the target with a high-voltage lightning horn.'),
  T_sig('titan_overgrowth', 'Titan Overgrowth', 'Verdant', 'phys', 125, 220, 'one', 3, 'Gorrundax slams down with a wooden arm covered in rapid overgrowth.'),
  T_sig('frost_prison', 'Frost Prison', 'Tide', 'art', 90, 220, 'one', 4, 'Cryomara locks the target in an eternal glacier, freezing them.', { id: 'frost_prison_status', name: 'Frozen', type: 'debuff', duration: 2, effect: 'freeze', value: 0, icon: '❄️', desc: 'Frozen solid.', chance: 0.8 }),
  T_sig('lux_eruption', 'Lux Eruption', 'Blaze', 'art', 120, 220, 'one', 3, 'Luxavor unleashes a blinding beam of pure solar flare.'),
  { id: 'ghoul_feast', name: 'Ghoul Feast', type: 'Umbra' as GType, kind: 'art' as TechKind, power: 100, spCost: 220, effect: 'drain' as TechEffect, target: 'one' as TechTarget, cooldown: 3, signature: true, desc: "Nyxghul devours the target's shadow, draining their health." },
  T_sig('wind_reaper', 'Wind Reaper', 'Gale', 'phys', 115, 220, 'one', 2, 'Zerathuul slashes the target with crescent blades of vacuum wind.'),
  T_sig('aurelian_blaze', 'Aurelian Blaze', 'Blaze', 'phys', 120, 220, 'one', 3, 'Aurelflare charges with a holy spear of white-hot plasma fire.'),
  T_sig('abyss_seal', 'Abyss Seal', 'Tide', 'art', 80, 220, 'all', 3, 'Abyssophar traps all foes in a bubble of crushing dark energy.'),
  { id: 'genesis_bloom', name: 'Genesis Bloom', type: 'Verdant' as GType, kind: 'art' as TechKind, power: 100, spCost: 220, effect: 'percent_heal' as TechEffect, target: 'all' as TechTarget, cooldown: 4, signature: true, desc: 'Genesophar restores full health and cures debuffs of all allies.' },
  T_sig('transcendent_arc', 'Transcendent Arc', 'Volt', 'art', 90, 220, 'all', 3, 'Voltranscend releases a soaring arc that leaps between all foes.'),
  { id: 'stellar_shield', name: 'Stellar Shield', type: 'Gale' as GType, kind: 'art' as TechKind, power: 0, spCost: 180, effect: 'buffDef' as TechEffect, target: 'self' as TechTarget, cooldown: 3, signature: true, statusChance: 1, desc: 'Cosmovault creates a gravity shield that blocks all incoming damage.', statusEffect: { id: 'grav_shield', name: 'Gravity Shield', type: 'buff' as const, duration: 3, effect: 'shield' as const, value: 0.35, icon: '🛡️', desc: 'Absorbs 35% damage.' } },
  T_sig('sovereign_darkness', 'Sovereign Darkness', 'Umbra', 'art', 125, 220, 'one', 3, 'Voidsovereign commands the void to swallow the target whole.'),
  T_sig('ignis_fury', 'Ignis Fury', 'Blaze', 'phys', 110, 220, 'one', 2, 'Ignisar hits the target with a sequence of rapid fire punches.'),
  T_sig('nine_seasons', 'Nine Seasons', 'Verdant', 'art', 115, 220, 'one', 3, 'Sylvaeon attacks with the combined natural energy of nine seasons.'),
  T_sig('erebus_web', 'Erebus Web', 'Umbra', 'art', 85, 220, 'all', 3, 'Erebusilk wraps all foes in dark threads, slowing them.', { id: 'erebus_slow', name: 'Webbed', type: 'debuff', duration: 3, effect: 'spd', value: -0.3, icon: '🕸️', desc: 'Speed reduced by 30%.', chance: 0.9 }),
  T_sig('helios_crown', 'Helios Crown', 'Blaze', 'art', 120, 220, 'one', 3, 'Heliarch summons the solar crown, burning the foe with sunfire.'),
  T_sig('wraith_flood', 'Wraith Flood', 'Tide', 'art', 90, 220, 'all', 3, 'Tidewraith summons a ghostly flood that sweeps away all foes.'),
  T_sig('arch_growth', 'Arch Growth', 'Verdant', 'art', 95, 220, 'all', 3, 'Sylvanarch calls upon ancient roots to crush all foes on the battlefield.'),
  T_sig('storm_decree', 'Storm Decree', 'Volt', 'art', 125, 220, 'one', 3, 'Stormarch issues a decree, discharging massive lightning on the target.'),
  T_sig('aero_vortex', 'Aero Vortex', 'Gale', 'art', 95, 220, 'all', 3, 'Aeronarch summons a swirling vortex that cuts all foes with wind blades.'),
  T_sig('umbra_eclipse', 'Umbra Eclipse', 'Umbra', 'art', 95, 220, 'all', 3, 'Umbrarch causes a total lunar eclipse, plunging all foes into darkness.'),
  T_sig('stellar_roar', 'Stellar Roar', 'Blaze', 'art', 120, 220, 'one', 3, 'Solarex lets out a star-shattering roar that burns the target.'),
  T_sig('abyssal_tail', 'Abyssal Tail', 'Tide', 'phys', 120, 220, 'one', 3, 'Leviathorn slams the target with a tail dripping with abyssal water.'),
  { id: 'world_seed', name: 'World Seed', type: 'Verdant' as GType, kind: 'art' as TechKind, power: 120, spCost: 220, effect: 'drain' as TechEffect, target: 'one' as TechTarget, cooldown: 3, signature: true, desc: 'Yggdranox plants a seed of world-tree energy that drains the target.' },
  T_sig('raiden_punch', 'Raiden Punch', 'Volt', 'phys', 120, 220, 'one', 3, 'Raidenjin punches the target with a fist of pure lightning.'),
  T_sig('zephyr_slice', 'Zephyr Slice', 'Gale', 'phys', 120, 220, 'one', 2, 'Zephyrax slices the target with ultra-sharp zephyr wings.'),
  T_sig('chthonic_grip', 'Chthonic Grip', 'Umbra', 'art', 120, 220, 'one', 3, 'Chthonix grips the target with underworld shadow chains.'),
  T_sig('magma_fist', 'Magma Fist', 'Blaze', 'phys', 115, 220, 'one', 2, 'Magmaroth hits the target with a fist made of molten lava.'),
  T_sig('ghost_wave', 'Ghost Wave', 'Tide', 'art', 90, 220, 'all', 3, 'Maelgheist sweeps all foes in a cold, phantom wave of sea energy.'),
  T_sig('vine_strangle', 'Vine Strangle', 'Verdant', 'phys', 110, 220, 'one', 3, 'Thornmaw wraps the target in thorny vines, choking their defense.', { id: 'thorn_choke', name: 'Choked', type: 'debuff', duration: 2, effect: 'def', value: -0.2, icon: '🪵', desc: 'Defense reduced by vine throttle.', chance: 0.85 }),
  T_sig('tesla_crash', 'Tesla Crash', 'Volt', 'phys', 115, 220, 'one', 3, 'Voltgolem crashes down on the target with immense electrical mass.'),
  T_sig('turbo_cyclone', 'Turbo Cyclone', 'Gale', 'art', 90, 220, 'all', 3, 'Cyclonaut rotates its thrusters to create a massive cyclone.'),
  { id: 'nyx_devour', name: 'Nyx Devour', type: 'Umbra' as GType, kind: 'phys' as TechKind, power: 115, spCost: 220, effect: 'drain' as TechEffect, target: 'one' as TechTarget, cooldown: 3, signature: true, desc: 'Nyxmaw bites the target with fangs of pure shadow essence, stealing health.' },
  T_sig('terra_flare', 'Terra Flare', 'Blaze', 'art', 125, 220, 'one', 3, 'Pyrethon releases a devastating flare of terrestrial magma.'),
  T_sig('ocean_judgment', 'Ocean Judgment', 'Tide', 'art', 95, 220, 'all', 3, 'Oceanarch judges all foes, dropping a massive water wall.'),
  T_sig('earth_entangle', 'Earth Entangle', 'Verdant', 'art', 85, 220, 'all', 3, 'Terravine entangles all foes in roots that reduce their speed.', { id: 'earth_slow', name: 'Entangled', type: 'debuff', duration: 3, effect: 'spd', value: -0.25, icon: '🕸️', desc: 'Speed reduced.', chance: 0.85 }),
  T_sig('galvanic_storm', 'Galvanic Storm', 'Volt', 'art', 95, 220, 'all', 3, 'Galvanyx summons a lightning storm that electrocutes all foes.'),
  T_sig('strato_blade', 'Strato Blade', 'Gale', 'phys', 125, 220, 'one', 2, 'Stratoterra dives and cuts the target with sharp wing blades.'),
  T_sig('tenebrous_rift', 'Tenebrous Rift', 'Umbra', 'art', 95, 220, 'all', 3, 'Tenebraterra opens a rift to the underworld, sucking in all foes.'),
  T_sig('inferno_dive', 'Inferno Dive', 'Blaze', 'phys', 110, 220, 'one', 2, 'Infernyx dives from high altitude, engulfed in volcanic flames.'),
  T_sig('abyssal_anchor', 'Abyssal Anchor', 'Tide', 'phys', 110, 220, 'one', 3, 'Abyssarch throws a heavy water anchor that crushes the target.'),
  T_sig('elder_spores', 'Elder Spores', 'Verdant', 'art', 80, 220, 'all', 3, 'Eldergrove spreads ancient toxic spores that poison all foes.', { id: 'elder_poison', name: 'Poisoned', type: 'debuff', duration: 4, effect: 'dot', value: 0.05, icon: '☠️', desc: 'Poison damage over time.', chance: 0.8 }),
  T_sig('thunder_fang', 'Thunder Fang', 'Volt', 'phys', 110, 220, 'one', 2, 'Fulgurex bites the target with fangs crackling with electricity.'),
  T_sig('tempest_wing', 'Tempest Wing', 'Gale', 'phys', 110, 220, 'one', 2, 'Tempestrix strikes the target with wind-strengthened wing beats.'),
  T_sig('umbra_gaze', 'Umbra Gaze', 'Umbra', 'art', 80, 220, 'one', 3, 'Umbrelisk stares at the target, lowering their attack power.', { id: 'umbra_weakness', name: 'Weakened', type: 'debuff', duration: 3, effect: 'atk', value: -0.25, icon: '👻', desc: 'Attack reduced.', chance: 0.9 }),
  T_sig('volcanic_slam', 'Volcanic Slam', 'Blaze', 'phys', 115, 220, 'one', 3, 'Vulkragon slams the target, unleashing a small volcanic tremor.'),
  { id: 'pearl_gate', name: 'Pearl Gate', type: 'Tide' as GType, kind: 'art' as TechKind, power: 0, spCost: 180, effect: 'buffDef' as TechEffect, target: 'self' as TechTarget, cooldown: 3, signature: true, statusChance: 1, desc: 'Nacrelord creates a shiny pearl barrier that boosts defense.', statusEffect: { id: 'pearl_barrier', name: 'Pearl Guard', type: 'buff' as const, duration: 3, effect: 'shield' as const, value: 0.25, icon: '🐚', desc: 'Absorbs 25% damage.' } },
  T_sig('tyrant_root', 'Tyrant Root', 'Verdant', 'phys', 115, 220, 'one', 3, 'Grovetyrant slams the target with a massive vine root.'),
  T_sig('empyrean_dive', 'Empyrean Dive', 'Gale', 'phys', 115, 220, 'one', 2, 'Empyrhawk dives from the clouds, slashing with sharp wind talons.'),
  T_sig('phantasm_dust', 'Phantasm Dust', 'Umbra', 'art', 85, 220, 'all', 3, "Phantasmoth scatters glowing shadow dust that reduces foes' accuracy.", { id: 'phantasm_blind', name: 'Blinded', type: 'debuff', duration: 2, effect: 'blind', value: 0, icon: '🕶️', desc: 'Accuracy reduced.', chance: 0.8 }),
  T_sig('drake_fire', 'Drake Fire', 'Blaze', 'art', 110, 220, 'one', 2, 'Magmadrak breathes a stream of concentrated hot dragon fire.'),
  T_sig('coal_barrage', 'Coal Barrage', 'Blaze', 'phys', 85, 220, 'all', 3, 'Coalossus shoots a barrage of burning hot coal at all foes.'),
  T_sig('aurora_blast', 'Aurora Blast', 'Blaze', 'art', 90, 220, 'all', 3, 'Aurorafire releases a colourful solar blast that burns all foes.'),
  T_sig('abyss_bite', 'Abyss Bite', 'Tide', 'phys', 110, 220, 'one', 2, 'Abysshound bites the target with fangs of freezing cold water.'),
  T_sig('siren_song', 'Siren Song', 'Tide', 'art', 80, 220, 'all', 3, 'Abysssiren sings a melody that slows all foes down.', { id: 'siren_slow', name: 'Entranced', type: 'debuff', duration: 3, effect: 'spd', value: -0.2, icon: '🎵', desc: 'Speed reduced.', chance: 0.85 }),
  T_sig('titan_wave', 'Titan Wave', 'Tide', 'art', 90, 220, 'all', 3, 'Oceantitan slams down, sending a massive wave towards all foes.'),
  T_sig('solar_antler', 'Solar Antler', 'Verdant', 'phys', 110, 220, 'one', 2, 'Solarstag charges and strikes with antlers radiating hot solar energy.'),
  T_sig('decay_breath', 'Decay Breath', 'Verdant', 'art', 85, 220, 'one', 3, 'Rotwyrm breathes a cloud of decaying gas, poisoning the target.', { id: 'decay_poison', name: 'Poisoned', type: 'debuff', duration: 3, effect: 'dot', value: 0.06, icon: '☠️', desc: 'Poison damage over time.', chance: 0.9 }),
  T_sig('canopy_swoop', 'Canopy Swoop', 'Verdant', 'phys', 110, 220, 'one', 2, 'Canopyhawk swoops down from the leaves, striking with leaf-hardened talons.'),
  T_sig('fulgur_charge', 'Fulgur Charge', 'Volt', 'phys', 110, 220, 'one', 2, 'Fulguram charges forward, wreathed in a sphere of lightning.'),
  T_sig('apex_shock', 'Apex Shock', 'Volt', 'art', 115, 220, 'one', 2, 'Stormapex discharges a concentrated bolt of high-voltage shock.'),
  T_sig('goliath_charge', 'Goliath Charge', 'Volt', 'phys', 115, 220, 'one', 3, 'Stormgoliath rams the target with a head of solid steel and static electricity.'),
  T_sig('nebula_strike', 'Nebula Strike', 'Gale', 'art', 110, 220, 'one', 2, 'Nebulamort fires a blast of stellar dust that burns the target.'),
  T_sig('galaxy_spin', 'Galaxy Spin', 'Gale', 'phys', 85, 220, 'all', 3, 'Galaxia spins rapidly, releasing stellar winds that cut all foes.'),
  T_sig('cosmic_impact', 'Cosmic Impact', 'Gale', 'art', 90, 220, 'all', 3, 'Cosmoclysm pulls down cosmic meteors to strike all foes.'),
  T_sig('apocalypse_echo', 'Apocalypse Echo', 'Umbra', 'art', 85, 220, 'all', 3, "Apocalypsebat screeches a dark pitch that reduces foes' defense.", { id: 'echo_debuff', name: 'Shaken', type: 'debuff', duration: 2, effect: 'def', value: -0.2, icon: '🦇', desc: 'Defense reduced.', chance: 0.8 }),
  T_sig('scythe_slash', 'Scythe Slash', 'Umbra', 'phys', 110, 220, 'one', 2, 'Voidreaper cuts the target with its dark void-energy scythe.'),
  T_sig('obelisk_fall', 'Obelisk Fall', 'Umbra', 'art', 115, 220, 'one', 3, 'Obeliskarch summons a shadow pillar to crush the target.'),
  T_sig('maw_eruption', 'Maw Eruption', 'Blaze', 'phys', 95, 220, 'one', 2, 'Blazemaw bites the target and releases an explosion from its throat.'),
  T_sig('strike_torrent', 'Strike Torrent', 'Tide', 'art', 95, 220, 'one', 2, 'Maelstrike blasts the target with a high-pressure jet of tide water.'),
  T_sig('sylvig_charge', 'Sylvig Charge', 'Verdant', 'phys', 95, 220, 'one', 2, 'Sylvigor charges forward with horns hardened by ancient sap.'),
  T_sig('claw_discharge', 'Claw Discharge', 'Volt', 'phys', 95, 220, 'one', 2, 'Stormclaw slashes the target and discharges stored static electricity.'),
  T_sig('cyclonic_whirl', 'Cyclonic Whirl', 'Gale', 'art', 75, 220, 'all', 3, 'Cyclonix flaps its wings rapidly, causing a mini cyclone that cuts all foes.'),
  { id: 'nocturnal_howl', name: 'Nocturnal Howl', type: 'Umbra' as GType, kind: 'art' as TechKind, power: 0, spCost: 180, effect: 'buffAtk' as TechEffect, target: 'self' as TechTarget, cooldown: 3, signature: true, statusChance: 1, desc: 'Nocthowl howls at the moon, boosting speed and attack.', statusEffect: { id: 'noct_howl_status', name: 'Nocturnal Rage', type: 'buff' as const, duration: 3, effect: 'spd' as const, value: 0.25, icon: '🐺', desc: 'Speed boosted by 25%.' } },
  T_sig('pyre_bite', 'Pyre Bite', 'Blaze', 'phys', 95, 220, 'one', 2, 'Pyrelisk bites the target with fangs burning with fire.'),
  T_sig('pearla_thrust', 'Pearla Thrust', 'Tide', 'phys', 95, 220, 'one', 2, 'Pearlance thrusts forward with a sharp spear of condensed water.'),
  T_sig('thicket_shred', 'Thicket Shred', 'Verdant', 'phys', 95, 220, 'one', 2, 'Thicketclaw tears at the target with sharp briar claws.'),
  T_sig('tesla_beam', 'Tesla Beam', 'Volt', 'art', 95, 220, 'one', 2, 'Teslarch fires a blue electrical laser at the target.'),
  T_sig('roc_feather', 'Roc Feather', 'Gale', 'phys', 95, 220, 'one', 2, 'Stratoroc shoots steel-like feathers at the target.'),
  T_sig('loom_threads', 'Loom Threads', 'Umbra', 'art', 75, 220, 'all', 3, 'Nightloom tangles all foes in sticky dark threads that slow them down.', { id: 'loom_slow', name: 'Entangled', type: 'debuff', duration: 2, effect: 'spd', value: -0.2, icon: '🕸️', desc: 'Speed reduced.', chance: 0.85 }),
  { id: 'grave_swallow', name: 'Grave Swallow', type: 'Umbra' as GType, kind: 'phys' as TechKind, power: 95, spCost: 220, effect: 'drain' as TechEffect, target: 'one' as TechTarget, cooldown: 3, signature: true, desc: "Gravemaw bites and swallows the target's energy, healing itself." },
  T_sig('spark_spear', 'Spark Spear', 'Volt', 'phys', 95, 220, 'one', 2, 'Voltigarch stabs forward with a spear made of pure voltage.'),
  T_sig('pyro_strike', 'Pyro Strike', 'Blaze', 'phys', 95, 220, 'one', 2, 'Pyrostrike strikes down with a hammer wreathed in flames.'),
  T_sig('aqua_freeze', 'Aqua Freeze', 'Tide', 'art', 90, 220, 'one', 3, 'Aquafrost strikes the target with freezing cold water, occasionally freezing them.', { id: 'aqua_freeze_status', name: 'Frozen', type: 'debuff', duration: 1, effect: 'freeze', value: 0, icon: '❄️', desc: 'Frozen solid.', chance: 0.25 }),
  { id: 'terra_pulse', name: 'Terra Pulse', type: 'Verdant' as GType, kind: 'art' as TechKind, power: 0, spCost: 180, effect: 'buffDef' as TechEffect, target: 'self' as TechTarget, cooldown: 3, signature: true, statusChance: 1, desc: 'Terragrow absorbs pulses from the earth, healing over time.', statusEffect: { id: 'terra_hot', name: 'Terra Growth', type: 'buff' as const, duration: 3, effect: 'hot' as const, value: 0.08, icon: '💚', desc: 'Healing 8% HP each turn.' } },
  T_sig('volt_clysm', 'Volt Clysm', 'Volt', 'art', 75, 220, 'all', 3, 'Voltclysm releases a massive static explosion on all foes.'),
  T_sig('shadow_strike', 'Shadow Strike', 'Umbra', 'phys', 95, 220, 'one', 2, "Umbrashade hides in shadows and strikes the target's weak spot."),
  T_sig('sol_roar', 'Sol Roar', 'Blaze', 'art', 95, 220, 'one', 2, 'Solgaleo roars with solar power, burning the target.'),
  T_sig('deep_tidal', 'Deep Tidal', 'Tide', 'art', 95, 220, 'one', 2, 'Tidedeep summons deep oceanic waves to crush the target.'),
  T_sig('thorn_spark', 'Thorn Spark', 'Verdant', 'phys', 95, 220, 'one', 2, 'Thornspark strikes the target with thorn claws charged with sparks.'),
].map(t => [t.id, t]));

// ---------------- Species ----------------
export type Archetype = 'beast' | 'serpent' | 'avian' | 'brute' | 'sprite' | 'shell';

export interface SpeciesDef {
  id: string; name: string; type: GType; stage: Stage;
  base: Stats;            // stats at level 1 (scaled internally for higher stages)
  growth: Stats;          // gain per level
  techs: { level: number; tech: string }[];
  evolvesTo?: { species: string; level: number };
  extraEvolvesTo?: { species: string; level: number };
  /** High-tier ascension (Special/Terra/Transcendent/Aether). Gated by level
   *  and/or a catalyst item and/or a story flag — never auto-triggers; the
   *  player opts in at Professor Alex's lab or the Terra Ascension Forge. */
  ascendsTo?: { species: string; kind: EvoKind; level?: number; item?: string; flag?: string };
  isFusion?: boolean;
  isBoss?: boolean;       // boss-tier (extra stat heft); Aether world bosses
  archetype: Archetype;
  palette: { primary: number; secondary: number; accent: number };
  desc: string;
  captureBase: number;    // 0..1 base willingness to join
  scale: number;          // visual size multiplier
}

const S = (def: SpeciesDef) => def;
const stats = (hp: number, sp: number, atk: number, def: number, spd: number, wis: number): Stats =>
  ({ hp, sp, atk, def, spd, wis });

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(([
  // ===== BLAZE line: Cindcub -> Pyrofang -> Blazemaw -> Infernyx -> Solarex =====
  S({ id: 'cindcub', name: 'Cindcub', type: 'Blaze', stage: 'Novice', archetype: 'beast',
    base: stats(34, 14, 12, 8, 9, 8), growth: stats(6, 2.4, 2.6, 1.7, 1.9, 1.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 6, tech: 'blaze_rally' }, { level: 10, tech: 'cinder_lash' }],
    evolvesTo: { species: 'pyrofang', level: 13 },
    extraEvolvesTo: { species: 'pyromount', level: 15 },
    palette: { primary: 0xd9542e, secondary: 0xf2a13a, accent: 0xfff0c8 },
    desc: 'A cub born from cooling lava. Its paws leave tiny scorch marks.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'pyrofang', name: 'Pyrofang', type: 'Blaze', stage: 'Adept', archetype: 'beast',
    base: stats(58, 22, 22, 14, 16, 13), growth: stats(8, 3, 3.4, 2.2, 2.4, 2),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'cinder_lash' }, { level: 16, tech: 'flame_burst' }, { level: 21, tech: 'inferno_maw' }],
    evolvesTo: { species: 'blazemaw', level: 20 },
    palette: { primary: 0xc4401e, secondary: 0xf2803a, accent: 0xffd28a },
    desc: 'Its fangs burn at 800 degrees. Fiercely loyal to a worthy tamer.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'blazemaw', name: 'Blazemaw', type: 'Blaze', stage: 'Elite', archetype: 'brute',
    base: stats(96, 34, 38, 24, 24, 20), growth: stats(10, 3.6, 4.2, 2.8, 2.6, 2.4),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'inferno_maw' }, { level: 30, tech: 'flame_burst' }, { level: 36, tech: 'blaze_rally' }],
    evolvesTo: { species: 'infernyx', level: 27 },
    palette: { primary: 0xa83218, secondary: 0xf2603a, accent: 0xffe08a },
    desc: 'A furnace given muscle and rage. Its roar ignites the air.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'infernyx', name: 'Infernyx', type: 'Blaze', stage: 'Apex', archetype: 'brute',
    base: stats(150, 52, 58, 38, 36, 34), growth: stats(12, 4, 5, 3.4, 3, 3),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 48, tech: 'blaze_rally' }],
    evolvesTo: { species: 'solarex', level: 40 },
    extraEvolvesTo: { species: 'magmaroth', level: 40 },
    palette: { primary: 0x8a2410, secondary: 0xf2433a, accent: 0xffd24e },
    desc: 'A legendary dragon of the volcanoes, dreaming of dawn and eternal fire.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'solarex', name: 'Solarex', type: 'Blaze', stage: 'Split', archetype: 'beast',
    base: stats(240, 80, 86, 56, 52, 50), growth: stats(15, 5, 6, 4, 3.8, 3.8),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 40, tech: 'sol_eruption' }],
    ascendsTo: { species: 'heliarch', kind: 'Special', level: 52 },
    palette: { primary: 0xff8c00, secondary: 0xffd700, accent: 0xffffff },
    desc: 'A celestial lion wreathed in stellar fire, born from the heart of a dying star. Its steps burn with starlight.', captureBase: 0, scale: 1.95 }),

  // ===== TIDE line: Puddla -> Tidefin -> Maelstrike -> Abyssarch -> Leviathorn =====
  S({ id: 'puddla', name: 'Puddla', type: 'Tide', stage: 'Novice', archetype: 'sprite',
    base: stats(36, 16, 9, 9, 8, 11), growth: stats(6, 2.8, 1.8, 1.9, 1.6, 2.4),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 6, tech: 'mist_veil' }, { level: 10, tech: 'rip_current' }],
    evolvesTo: { species: 'tidefin', level: 13 },
    extraEvolvesTo: { species: 'puddlecrest', level: 15 },
    palette: { primary: 0x3a8dd9, secondary: 0x6ec4f2, accent: 0xd8f2ff },
    desc: 'A droplet that gained a heart. It wobbles when happy.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'tidefin', name: 'Tidefin', type: 'Tide', stage: 'Adept', archetype: 'serpent',
    base: stats(60, 26, 17, 15, 14, 19), growth: stats(8, 3.4, 2.4, 2.3, 2, 3),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 15, tech: 'spring_mend' }, { level: 21, tech: 'tidal_crush' }],
    evolvesTo: { species: 'maelstrike', level: 20 },
    palette: { primary: 0x2a6dc4, secondary: 0x5ab8e8, accent: 0xc8ecff },
    desc: 'It swims through air as easily as water, trailing sea-mist.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'maelstrike', name: 'Maelstrike', type: 'Tide', stage: 'Elite', archetype: 'serpent',
    base: stats(100, 40, 30, 25, 22, 30), growth: stats(10, 4, 3.2, 3, 2.4, 3.8),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'tidal_crush' }, { level: 30, tech: 'spring_mend' }, { level: 36, tech: 'abyss_maelstrom' }],
    evolvesTo: { species: 'abyssarch', level: 27 },
    palette: { primary: 0x1a4da8, secondary: 0x3a9df2, accent: 0xa8e0ff },
    desc: 'Storm-tides follow in its wake. Sailors carve its likeness for luck.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'abyssarch', name: 'Abyssarch', type: 'Tide', stage: 'Apex', archetype: 'serpent',
    base: stats(160, 60, 44, 40, 30, 48), growth: stats(12, 4.6, 4, 3.6, 2.8, 4.4),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 48, tech: 'spring_mend' }],
    evolvesTo: { species: 'leviathorn', level: 40 },
    extraEvolvesTo: { species: 'maelgheist', level: 40 },
    palette: { primary: 0x102e7a, secondary: 0x2a7dd9, accent: 0x8ad4ff },
    desc: 'Sovereign of the drowned dark. Its silence is a kind of mercy.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'leviathorn', name: 'Leviathorn', type: 'Tide', stage: 'Split', archetype: 'serpent',
    base: stats(250, 90, 68, 60, 48, 66), growth: stats(15, 5.5, 5, 4.2, 3.5, 5.2),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 40, tech: 'deluge_tempest' }],
    ascendsTo: { species: 'tidewraith', kind: 'Special', level: 52 },
    palette: { primary: 0x00008b, secondary: 0x00ffff, accent: 0xffffff },
    desc: 'A mythical ocean dragon capable of creating tidal waves with a flick of its tail, drawing energy from abyssal depths.', captureBase: 0, scale: 1.95 }),

  // ===== VERDANT line: Sproutle -> Thornbex -> Sylvigor -> Eldergrove -> Yggdranox =====
  S({ id: 'sproutle', name: 'Sproutle', type: 'Verdant', stage: 'Novice', archetype: 'sprite',
    base: stats(38, 14, 10, 10, 7, 9), growth: stats(6.5, 2.4, 2, 2.2, 1.4, 2),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 6, tech: 'sap_drain' }, { level: 10, tech: 'thorn_whip' }],
    evolvesTo: { species: 'thornbex', level: 13 },
    extraEvolvesTo: { species: 'sproutshell', level: 15 },
    palette: { primary: 0x4ea84e, secondary: 0x8ad95a, accent: 0xf2e08a },
    desc: 'A walking seedling. It naps in sunbeams and grows a little each time.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'thornbex', name: 'Thornbex', type: 'Verdant', stage: 'Adept', archetype: 'beast',
    base: stats(64, 22, 18, 18, 11, 15), growth: stats(8.5, 3, 2.6, 2.8, 1.8, 2.4),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 15, tech: 'bloom_ward' }, { level: 21, tech: 'bramble_cage' }],
    evolvesTo: { species: 'sylvigor', level: 20 },
    palette: { primary: 0x3a8a3a, secondary: 0x6ec45e, accent: 0xd9b85a },
    desc: 'Its back bristles with living thorns that regrow overnight.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'sylvigor', name: 'Sylvigor', type: 'Verdant', stage: 'Elite', archetype: 'brute',
    base: stats(110, 34, 32, 32, 16, 24), growth: stats(11, 3.6, 3.4, 3.6, 2, 3),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'bramble_cage' }, { level: 30, tech: 'bloom_ward' }, { level: 36, tech: 'elder_wrath' }],
    evolvesTo: { species: 'eldergrove', level: 27 },
    palette: { primary: 0x2a6e2a, secondary: 0x5aa84e, accent: 0xc4a13a },
    desc: 'A guardian of old groves. Birds nest in its shoulders mid-battle.', captureBase: 0.18, scale: 1.4 }),
  S({ id: 'eldergrove', name: 'Eldergrove', type: 'Verdant', stage: 'Apex', archetype: 'brute',
    base: stats(180, 50, 48, 52, 22, 38), growth: stats(13, 4.2, 4.2, 4.6, 2.4, 3.6),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 48, tech: 'bloom_ward' }],
    evolvesTo: { species: 'yggdranox', level: 40 },
    extraEvolvesTo: { species: 'thornmaw', level: 40 },
    palette: { primary: 0x1a4e1a, secondary: 0x4e9a3a, accent: 0xf2c14e },
    desc: 'Old as the first forest. Its rings record every age of the world.', captureBase: 0.06, scale: 1.8 }),
  S({ id: 'yggdranox', name: 'Yggdranox', type: 'Verdant', stage: 'Split', archetype: 'brute',
    base: stats(280, 75, 72, 78, 36, 58), growth: stats(17, 5, 5.2, 5.5, 3, 4.5),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 40, tech: 'nature_judgment' }],
    ascendsTo: { species: 'sylvanarch', kind: 'Special', level: 52 },
    palette: { primary: 0x006400, secondary: 0x8fbc8f, accent: 0xffd700 },
    desc: 'The physical manifestation of the world tree\'s wrath, crushing anything in its path with immovable wood and vines.', captureBase: 0, scale: 2.0 }),

  // ===== VOLT line: Zaplet -> Voltyx -> Stormclaw -> Fulgurex -> Raidenjin =====
  S({ id: 'zaplet', name: 'Zaplet', type: 'Volt', stage: 'Novice', archetype: 'sprite',
    base: stats(32, 16, 11, 7, 12, 10), growth: stats(5.5, 2.6, 2.2, 1.5, 2.6, 2.2),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 6, tech: 'overcharge' }, { level: 10, tech: 'arc_bolt' }],
    evolvesTo: { species: 'voltyx', level: 13 },
    extraEvolvesTo: { species: 'zapwing', level: 15 },
    palette: { primary: 0xd9c43a, secondary: 0xf2e06e, accent: 0x6ec4f2 },
    desc: 'A spark that refused to fade. It crackles when excited.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'voltyx', name: 'Voltyx', type: 'Volt', stage: 'Adept', archetype: 'beast',
    base: stats(54, 26, 19, 12, 20, 17), growth: stats(7.5, 3.2, 2.8, 1.9, 3.2, 2.8),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 15, tech: 'numbing_field' }, { level: 21, tech: 'storm_lance' }],
    evolvesTo: { species: 'stormclaw', level: 20 },
    palette: { primary: 0xc4ae2a, secondary: 0xf2d23a, accent: 0x5ab8e8 },
    desc: 'It outruns its own thunder. Catching one is considered impossible.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'stormclaw', name: 'Stormclaw', type: 'Volt', stage: 'Elite', archetype: 'beast',
    base: stats(92, 40, 34, 20, 32, 27), growth: stats(9.5, 3.8, 3.8, 2.4, 3.8, 3.4),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'storm_lance' }, { level: 30, tech: 'numbing_field' }, { level: 36, tech: 'thunder_dominion' }],
    evolvesTo: { species: 'fulgurex', level: 27 },
    palette: { primary: 0xa8921e, secondary: 0xf2c43a, accent: 0x3a9df2 },
    desc: 'Each claw stores a separate storm. It sharpens them on lightning rods.', captureBase: 0.18, scale: 1.3 }),
  S({ id: 'fulgurex', name: 'Fulgurex', type: 'Volt', stage: 'Apex', archetype: 'avian',
    base: stats(145, 58, 52, 32, 46, 42), growth: stats(11, 4.4, 4.6, 3, 4.4, 4),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 48, tech: 'overcharge' }],
    evolvesTo: { species: 'raidenjin', level: 40 },
    extraEvolvesTo: { species: 'voltgolem', level: 40 },
    palette: { primary: 0x8a7510, secondary: 0xf2d23a, accent: 0x2a7dd9 },
    desc: 'The first thunderclap, given wings. Skies clear where it passes.', captureBase: 0.06, scale: 1.65 }),
  S({ id: 'raidenjin', name: 'Raidenjin', type: 'Volt', stage: 'Split', archetype: 'avian',
    base: stats(230, 88, 78, 48, 68, 62), growth: stats(14, 5.5, 5.5, 3.8, 5.5, 4.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 40, tech: 'volt_singularity' }],
    ascendsTo: { species: 'stormarch', kind: 'Special', level: 52 },
    palette: { primary: 0xffd700, secondary: 0x4169e1, accent: 0x4b0082 },
    desc: 'The sovereign of thunderstorms, casting bolts of divine lightning from the high clouds, moving faster than the wind.', captureBase: 0, scale: 1.9 }),

  // ===== GALE line: Wispry -> Galewing -> Cyclonix -> Tempestrix -> Zephyrax =====
  S({ id: 'wispry', name: 'Wispry', type: 'Gale', stage: 'Novice', archetype: 'avian',
    base: stats(33, 15, 10, 7, 13, 9), growth: stats(5.5, 2.5, 2, 1.5, 2.8, 2),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 6, tech: 'tailwind' }, { level: 10, tech: 'dive_talon' }],
    evolvesTo: { species: 'galewing', level: 13 },
    extraEvolvesTo: { species: 'wispserpent', level: 15 },
    palette: { primary: 0x5ac4b8, secondary: 0xa8e8e0, accent: 0xfff0c8 },
    desc: 'A fledgling of the high winds. It tumbles more than it flies.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'galewing', name: 'Galewing', type: 'Gale', stage: 'Adept', archetype: 'avian',
    base: stats(56, 24, 18, 12, 22, 15), growth: stats(7.5, 3, 2.7, 1.8, 3.4, 2.5),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 15, tech: 'tailwind' }, { level: 21, tech: 'razor_cyclone' }],
    evolvesTo: { species: 'cyclonix', level: 20 },
    palette: { primary: 0x3aa89a, secondary: 0x7adfd0, accent: 0xf2e0a8 },
    desc: 'Its wingbeats can be heard a valley away — if it wants them to be.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'cyclonix', name: 'Cyclonix', type: 'Gale', stage: 'Elite', archetype: 'avian',
    base: stats(94, 38, 33, 19, 34, 25), growth: stats(9.5, 3.6, 3.7, 2.3, 4, 3.2),
    techs: [{ level: 1, tech: 'dive_talon' }, { level: 1, tech: 'razor_cyclone' }, { level: 30, tech: 'tailwind' }, { level: 36, tech: 'sky_sunder' }],
    evolvesTo: { species: 'tempestrix', level: 27 },
    palette: { primary: 0x2a8a7a, secondary: 0x5acfc0, accent: 0xf2c14e },
    desc: 'It nests in the eye of standing storms it builds itself.', captureBase: 0.18, scale: 1.3 }),
  S({ id: 'tempestrix', name: 'Tempestrix', type: 'Gale', stage: 'Apex', archetype: 'avian',
    base: stats(148, 56, 50, 30, 50, 38), growth: stats(11, 4.2, 4.5, 2.8, 4.8, 3.8),
    techs: [{ level: 1, tech: 'razor_cyclone' }, { level: 1, tech: 'sky_sunder' }, { level: 48, tech: 'tailwind' }],
    evolvesTo: { species: 'zephyrax', level: 40 },
    extraEvolvesTo: { species: 'cyclonaut', level: 40 },
    palette: { primary: 0x1a6e60, secondary: 0x4ec4b0, accent: 0xffd24e },
    desc: 'Monarch of the upper sky. Maps mark its roosts as "no-fly".', captureBase: 0.06, scale: 1.65 }),
  S({ id: 'zephyrax', name: 'Zephyrax', type: 'Gale', stage: 'Split', archetype: 'avian',
    base: stats(235, 84, 76, 45, 74, 58), growth: stats(14, 5.2, 5.4, 3.5, 6, 4.5),
    techs: [{ level: 1, tech: 'razor_cyclone' }, { level: 1, tech: 'sky_sunder' }, { level: 40, tech: 'tempest_gale' }],
    ascendsTo: { species: 'aeronarch', kind: 'Special', level: 52 },
    palette: { primary: 0x87ceeb, secondary: 0x40e0d0, accent: 0xffd700 },
    desc: 'A magnificent storm-bird that rules the high troposphere, commanding massive hurricanes and slicing air currents.', captureBase: 0, scale: 1.9 }),

  // ===== UMBRA line: Shadekit -> Duskfang -> Nocthowl -> Umbrelisk -> Chthonix =====
  S({ id: 'shadekit', name: 'Shadekit', type: 'Umbra', stage: 'Novice', archetype: 'beast',
    base: stats(34, 15, 11, 8, 11, 10), growth: stats(5.8, 2.5, 2.3, 1.6, 2.3, 2.2),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 6, tech: 'dread_howl' }, { level: 10, tech: 'gloom_ray' }],
    evolvesTo: { species: 'duskfang', level: 13 },
    extraEvolvesTo: { species: 'shadeclaw', level: 15 },
    palette: { primary: 0x5a3a8a, secondary: 0x9a5af2, accent: 0xf25aa8 },
    desc: 'A kitten-shaped piece of dusk. It hides in your shadow when shy.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'duskfang', name: 'Duskfang', type: 'Umbra', stage: 'Adept', archetype: 'beast',
    base: stats(58, 25, 20, 13, 18, 17), growth: stats(7.8, 3.1, 2.9, 2, 2.9, 2.8),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 15, tech: 'umbral_drain' }, { level: 21, tech: 'void_fang' }],
    evolvesTo: { species: 'nocthowl', level: 20 },
    palette: { primary: 0x4a2a7a, secondary: 0x8a4ae0, accent: 0xe85a9a },
    desc: 'It walks between lamplights without ever touching the bright.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'nocthowl', name: 'Nocthowl', type: 'Umbra', stage: 'Elite', archetype: 'avian',
    base: stats(96, 40, 33, 22, 28, 30), growth: stats(9.8, 3.8, 3.7, 2.6, 3.3, 3.7),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'void_fang' }, { level: 30, tech: 'dread_howl' }, { level: 36, tech: 'eclipse_requiem' }],
    evolvesTo: { species: 'umbrelisk', level: 27 },
    palette: { primary: 0x3a1a6a, secondary: 0x7a3ad0, accent: 0xd94a8a },
    desc: 'Its hoot is heard only by those it has chosen to watch.', captureBase: 0.18, scale: 1.3 }),
  S({ id: 'umbrelisk', name: 'Umbrelisk', type: 'Umbra', stage: 'Apex', archetype: 'serpent',
    base: stats(152, 58, 50, 36, 38, 46), growth: stats(11.5, 4.4, 4.5, 3.2, 3.8, 4.4),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 48, tech: 'umbral_drain' }],
    evolvesTo: { species: 'chthonix', level: 40 },
    extraEvolvesTo: { species: 'nyxmaw', level: 40 },
    palette: { primary: 0x2a1050, secondary: 0x6a2ac0, accent: 0xc43a7a },
    desc: 'The shadow cast by nothing. Scholars argue whether it exists at all.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'chthonix', name: 'Chthonix', type: 'Umbra', stage: 'Split', archetype: 'serpent',
    base: stats(242, 88, 75, 54, 56, 68), growth: stats(14.5, 5.5, 5.4, 4, 4.5, 5.2),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 40, tech: 'void_extinction' }],
    ascendsTo: { species: 'umbrarch', kind: 'Special', level: 52 },
    palette: { primary: 0x1f0b35, secondary: 0x4b0082, accent: 0xff00ff },
    desc: 'A dark beast from the deepest abyss, swallowing light and shadows alike, wrapping the battlefield in absolute void.', captureBase: 0, scale: 1.95 }),

  // ===== Wild-only species (variety / capture targets) =====
  S({ id: 'pebblit', name: 'Pebblit', type: 'Verdant', stage: 'Novice', archetype: 'shell',
    base: stats(42, 10, 11, 14, 5, 6), growth: stats(7, 2, 2.2, 2.8, 1, 1.5),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'sylvigor', level: 26 },
    palette: { primary: 0x8a7a5a, secondary: 0xb0a080, accent: 0x6ec45e },
    desc: 'A mossy stone that decided to wander. Slow, but stubborn as bedrock.', captureBase: 0.55, scale: 0.7 }),
  S({ id: 'cinderbat', name: 'Cinderbat', type: 'Blaze', stage: 'Novice', archetype: 'avian',
    base: stats(30, 15, 12, 6, 13, 9), growth: stats(5, 2.5, 2.4, 1.3, 2.7, 2),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'gust_cut' }],
    evolvesTo: { species: 'pyrofang', level: 12 },
    palette: { primary: 0xb0402a, secondary: 0xe87a3a, accent: 0x4a2a3a },
    desc: 'It roosts in chimneys and dreams of bonfires.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'mistling', name: 'Mistling', type: 'Tide', stage: 'Novice', archetype: 'sprite',
    base: stats(34, 17, 9, 8, 10, 12), growth: stats(5.8, 2.9, 1.8, 1.7, 2, 2.6),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'mist_veil' }],
    evolvesTo: { species: 'tidefin', level: 12 },
    palette: { primary: 0x6a9ac4, secondary: 0xa8d0e8, accent: 0xe8f4ff },
    desc: 'Morning fog that lingered too long and woke up curious.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'sparkmote', name: 'Sparkmote', type: 'Volt', stage: 'Novice', archetype: 'sprite',
    base: stats(28, 18, 10, 6, 14, 11), growth: stats(4.8, 3, 2, 1.3, 2.9, 2.4),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'voltyx', level: 12 },
    palette: { primary: 0xe8d05a, secondary: 0xfff0a8, accent: 0x5ab8e8 },
    desc: 'A dust mote that drifted through a storm and came out giggling.', captureBase: 0.55, scale: 0.55 }),
  S({ id: 'zephlet', name: 'Zephlet', type: 'Gale', stage: 'Novice', archetype: 'sprite',
    base: stats(31, 16, 10, 7, 14, 10), growth: stats(5.2, 2.7, 2, 1.5, 2.9, 2.2),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'tailwind' }],
    evolvesTo: { species: 'galewing', level: 12 },
    palette: { primary: 0x8ad0c8, secondary: 0xc8f0e8, accent: 0xfff8d8 },
    desc: 'A pocket of playful air. It steals hats, then returns them, mostly.', captureBase: 0.55, scale: 0.55 }),
  S({ id: 'gloomite', name: 'Gloomite', type: 'Umbra', stage: 'Novice', archetype: 'shell',
    base: stats(38, 13, 10, 12, 8, 9), growth: stats(6.4, 2.3, 2, 2.4, 1.7, 2),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'dread_howl' }],
    evolvesTo: { species: 'duskfang', level: 12 },
    palette: { primary: 0x3a2a5a, secondary: 0x6a4a9a, accent: 0xa85ad0 },
    desc: 'A burrowing shadow with a pebble shell. It collects shiny regrets.', captureBase: 0.55, scale: 0.65 }),

  // ============================================================
  // ===== THE DAWNFIRE LINE (Blaze, 6 stages — Aether) =====
  // Ashwisp → Flarekin → Pyrelisk → Vulkragon → Ignisar → SOLPHYRA
  S({ id: 'ashwisp', name: 'Ashwisp', type: 'Blaze', stage: 'Novice', archetype: 'sprite',
    base: stats(30, 17, 10, 6, 11, 12), growth: stats(5, 2.9, 2, 1.3, 2.3, 2.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 7, tech: 'flame_burst' }],
    evolvesTo: { species: 'flarekin', level: 10 },
    palette: { primary: 0xc8c4bc, secondary: 0xf2803a, accent: 0xfff0c8 },
    desc: 'A will-o-wisp born where a campfire was loved. It follows kind travelers for miles.', captureBase: 0.55, scale: 0.55 }),
  S({ id: 'flarekin', name: 'Flarekin', type: 'Blaze', stage: 'Adept', archetype: 'sprite',
    base: stats(52, 27, 18, 11, 18, 20), growth: stats(7, 3.5, 2.6, 1.7, 2.8, 3.2),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 14, tech: 'blaze_rally' }, { level: 19, tech: 'cinder_lash' }],
    evolvesTo: { species: 'pyrelisk', level: 17 },
    palette: { primary: 0xe06a2a, secondary: 0xf2b03a, accent: 0xfff8d8 },
    desc: 'A small imp of living flame. It juggles its own sparks to show off.', captureBase: 0.35, scale: 0.85 }),
  S({ id: 'pyrelisk', name: 'Pyrelisk', type: 'Blaze', stage: 'Elite', archetype: 'serpent',
    base: stats(90, 40, 32, 20, 28, 32), growth: stats(9, 4, 3.5, 2.3, 3.4, 3.9),
    techs: [{ level: 1, tech: 'flame_burst' }, { level: 1, tech: 'cinder_lash' }, { level: 28, tech: 'inferno_maw' }, { level: 34, tech: 'blaze_rally' }],
    evolvesTo: { species: 'vulkragon', level: 25 },
    palette: { primary: 0xb84a1a, secondary: 0xf2933a, accent: 0xffe89a },
    desc: 'A magma serpent that swims through stone as if it were water, leaving glassy tunnels.', captureBase: 0.15, scale: 1.3 }),
  S({ id: 'vulkragon', name: 'Vulkragon', type: 'Blaze', stage: 'Apex', archetype: 'brute',
    base: stats(145, 56, 52, 36, 38, 44), growth: stats(11.5, 4.5, 4.7, 3.2, 3.8, 4.3),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'flame_burst' }, { level: 44, tech: 'sun_cataclysm' }],
    evolvesTo: { species: 'ignisar', level: 36 },
    palette: { primary: 0x8a2e10, secondary: 0xe85a2a, accent: 0xffd24e },
    desc: 'A dragon with a caldera for a heart. Mountains learn to flinch.', captureBase: 0.05, scale: 1.7 }),
  S({ id: 'ignisar', name: 'Ignisar', type: 'Blaze', stage: 'Special', archetype: 'beast',
    base: stats(235, 82, 80, 52, 58, 64), growth: stats(14, 5.4, 5.8, 4, 4.6, 5),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 42, tech: 'sol_eruption' }],
    evolvesTo: { species: 'solphyra', level: 50 },
    palette: { primary: 0xd93a10, secondary: 0xffa01a, accent: 0xfffbe0 },
    desc: 'A fire seraph in beast form. Old hymns claim it once carried the morning on its back.', captureBase: 0, scale: 1.9 }),
  S({ id: 'solphyra', name: 'Solphyra', type: 'Blaze', stage: 'Aether', archetype: 'avian',
    base: stats(290, 105, 96, 64, 80, 84), growth: stats(16.5, 6.2, 6.6, 4.6, 5.8, 6),
    techs: [{ level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'aether_flare' }, { level: 55, tech: 'dawn_rebirth' }],
    palette: { primary: 0xfff0c0, secondary: 0xff8c1a, accent: 0x9ad8ff },
    desc: 'The Phoenix of the First Dawn — an Aether being older than fire itself. Where its wings pass, night politely ends.', captureBase: 0, scale: 2.1 }),

  // ===== THE COALBACK LINE (Blaze, 2 stages) =====
  S({ id: 'smolderhog', name: 'Smolderhog', type: 'Blaze', stage: 'Novice', archetype: 'shell',
    base: stats(40, 12, 12, 13, 6, 7), growth: stats(6.8, 2.2, 2.4, 2.5, 1.3, 1.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'cinder_lash' }, { level: 14, tech: 'blaze_rally' }],
    evolvesTo: { species: 'magmaboar', level: 19 },
    palette: { primary: 0x5a4a42, secondary: 0xe8682a, accent: 0xffc86a },
    desc: 'A hedgehog whose quills are banked coals. Campers love it; tents do not.', captureBase: 0.55, scale: 0.7 }),
  S({ id: 'magmaboar', name: 'Magmaboar', type: 'Blaze', stage: 'Adept', archetype: 'brute',
    base: stats(78, 20, 26, 24, 11, 13), growth: stats(9.5, 2.8, 3.6, 3.4, 1.7, 2.2),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'blaze_rally' }, { level: 24, tech: 'inferno_maw' }],
    palette: { primary: 0x4a342c, secondary: 0xd9542e, accent: 0xffb04e },
    desc: 'A boar armored in cooling lava plates. It charges first and never apologizes.', captureBase: 0.3, scale: 1.25 }),

  // ===== THE PEARLCROWN LINE (Tide, 4 stages) =====
  // Coralkit → Reefrider → Pearlance → Nacrelord
  S({ id: 'coralkit', name: 'Coralkit', type: 'Tide', stage: 'Novice', archetype: 'shell',
    base: stats(38, 14, 9, 13, 6, 10), growth: stats(6.4, 2.5, 1.8, 2.6, 1.2, 2.2),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 7, tech: 'mist_veil' }],
    evolvesTo: { species: 'reefrider', level: 12 },
    palette: { primary: 0xe8838a, secondary: 0x6ec4f2, accent: 0xfff0e0 },
    desc: 'A hermit kitten wearing a living coral shell. It redecorates constantly.', captureBase: 0.55, scale: 0.65 }),
  S({ id: 'reefrider', name: 'Reefrider', type: 'Tide', stage: 'Adept', archetype: 'beast',
    base: stats(62, 24, 17, 19, 12, 17), growth: stats(8.2, 3.1, 2.5, 2.9, 1.8, 2.7),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 16, tech: 'mist_veil' }, { level: 20, tech: 'spring_mend' }],
    evolvesTo: { species: 'pearlance', level: 21 },
    palette: { primary: 0xd96a78, secondary: 0x3a9df2, accent: 0xc8ecff },
    desc: 'It herds reef-fish like sheep and defends its flock against anything, regardless of size.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'pearlance', name: 'Pearlance', type: 'Tide', stage: 'Elite', archetype: 'serpent',
    base: stats(98, 38, 30, 30, 20, 28), growth: stats(10, 3.9, 3.3, 3.4, 2.3, 3.6),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'tidal_crush' }, { level: 30, tech: 'spring_mend' }, { level: 35, tech: 'abyss_maelstrom' }],
    evolvesTo: { species: 'nacrelord', level: 30 },
    palette: { primary: 0xc25a88, secondary: 0x2a7dd9, accent: 0xf2e8ff },
    desc: 'Its horn is a single perfect pearl honed to a lance. Duelists weep at its form.', captureBase: 0.15, scale: 1.35 }),
  S({ id: 'nacrelord', name: 'Nacrelord', type: 'Tide', stage: 'Apex', archetype: 'shell',
    base: stats(168, 56, 44, 50, 26, 44), growth: stats(12.5, 4.5, 4, 4.4, 2.7, 4.3),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 46, tech: 'spring_mend' }],
    palette: { primary: 0x8a3a68, secondary: 0x1a4da8, accent: 0xfff4ff },
    desc: 'The Pearlcrown sovereign. Its shell holds a tide that answers to no moon.', captureBase: 0.05, scale: 1.75 }),

  // ===== THE COLDCURRENT LINE (Tide, 2 stages) =====
  S({ id: 'frostfin', name: 'Frostfin', type: 'Tide', stage: 'Novice', archetype: 'sprite',
    base: stats(33, 17, 10, 9, 11, 12), growth: stats(5.6, 2.9, 2, 1.9, 2.2, 2.6),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }, { level: 14, tech: 'mist_veil' }],
    evolvesTo: { species: 'glacimaw', level: 20 },
    palette: { primary: 0x9ad4f2, secondary: 0xd8f2ff, accent: 0x3a8dd9 },
    desc: 'A sliver of winter sea that swims through the air, leaving frost ferns on windows.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'glacimaw', name: 'Glacimaw', type: 'Tide', stage: 'Adept', archetype: 'brute',
    base: stats(74, 24, 24, 22, 14, 18), growth: stats(9, 3.1, 3.3, 3.1, 2, 2.8),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'mist_veil' }, { level: 25, tech: 'tidal_crush' }],
    palette: { primary: 0x6ab0d9, secondary: 0xe8f8ff, accent: 0x2a6dc4 },
    desc: 'A glacier that learned to bite. Its breath silences waterfalls mid-fall.', captureBase: 0.3, scale: 1.3 }),

  // ===== THE WILDWARDEN LINE (Verdant, 5 stages) =====
  // Fernfox → Bramblelynx → Thicketclaw → Grovetyrant → Sylvaeon
  S({ id: 'fernfox', name: 'Fernfox', type: 'Verdant', stage: 'Novice', archetype: 'beast',
    base: stats(35, 14, 11, 9, 11, 9), growth: stats(5.9, 2.5, 2.3, 1.9, 2.2, 2),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 7, tech: 'thorn_whip' }],
    evolvesTo: { species: 'bramblelynx', level: 11 },
    palette: { primary: 0x6a9a3a, secondary: 0xa8d95a, accent: 0xf2e08a },
    desc: 'A fox whose tail is a fern frond. It naps curled into a perfect spiral.', captureBase: 0.55, scale: 0.65 }),
  S({ id: 'bramblelynx', name: 'Bramblelynx', type: 'Verdant', stage: 'Adept', archetype: 'beast',
    base: stats(58, 22, 19, 15, 17, 14), growth: stats(7.8, 3, 2.8, 2.4, 2.7, 2.4),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'seed_shot' }, { level: 15, tech: 'sap_drain' }, { level: 19, tech: 'bramble_cage' }],
    evolvesTo: { species: 'thicketclaw', level: 19 },
    palette: { primary: 0x4a7a2e, secondary: 0x8ac45a, accent: 0xd9b85a },
    desc: 'Its ear-tufts are living briars. It grooms them into fashionable menace.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'thicketclaw', name: 'Thicketclaw', type: 'Verdant', stage: 'Elite', archetype: 'brute',
    base: stats(102, 34, 33, 28, 22, 22), growth: stats(10.4, 3.6, 3.6, 3.3, 2.6, 3),
    techs: [{ level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'thorn_whip' }, { level: 28, tech: 'bloom_ward' }, { level: 34, tech: 'elder_wrath' }],
    evolvesTo: { species: 'grovetyrant', level: 28 },
    palette: { primary: 0x3a5e22, secondary: 0x6aa84a, accent: 0xc4a13a },
    desc: 'A walking hedge of muscle and thorn. Poachers tell stories. Short ones.', captureBase: 0.15, scale: 1.4 }),
  S({ id: 'grovetyrant', name: 'Grovetyrant', type: 'Verdant', stage: 'Apex', archetype: 'brute',
    base: stats(172, 50, 50, 46, 28, 36), growth: stats(12.8, 4.3, 4.4, 4.2, 2.9, 3.8),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 44, tech: 'bloom_ward' }],
    evolvesTo: { species: 'sylvaeon', level: 42 },
    palette: { primary: 0x2a4416, secondary: 0x5a9a3a, accent: 0xf2c14e },
    desc: 'It rules a forest the way a heart rules a body — unseen, unarguable.', captureBase: 0.05, scale: 1.75 }),
  S({ id: 'sylvaeon', name: 'Sylvaeon', type: 'Verdant', stage: 'Special', archetype: 'beast',
    base: stats(262, 80, 74, 66, 50, 60), growth: stats(15.5, 5.3, 5.3, 5, 4.2, 4.9),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bloom_ward' }, { level: 44, tech: 'nature_judgment' }],
    palette: { primary: 0x3a8a4a, secondary: 0xc8f2a8, accent: 0xffe9a8 },
    desc: 'The Wildwarden itself — a great spirit-fox of nine seasons. Forests grow in its pawprints.', captureBase: 0, scale: 1.95 }),

  // ===== THE SPORESONG LINE (Verdant, 2 stages) =====
  S({ id: 'shroomple', name: 'Shroomple', type: 'Verdant', stage: 'Novice', archetype: 'sprite',
    base: stats(37, 16, 9, 11, 7, 11), growth: stats(6.2, 2.7, 1.8, 2.3, 1.4, 2.4),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'sap_drain' }, { level: 14, tech: 'bloom_ward' }],
    evolvesTo: { species: 'mycelord', level: 18 },
    palette: { primary: 0xc46a8a, secondary: 0xe8d0a8, accent: 0x8ad95a },
    desc: 'A cheerful toadstool that hums when it rains. Its spores smell like fresh bread.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'mycelord', name: 'Mycelord', type: 'Verdant', stage: 'Adept', archetype: 'brute',
    base: stats(72, 26, 20, 22, 11, 20), growth: stats(8.8, 3.3, 2.8, 3.1, 1.7, 3.1),
    techs: [{ level: 1, tech: 'sap_drain' }, { level: 1, tech: 'bloom_ward' }, { level: 24, tech: 'bramble_cage' }],
    palette: { primary: 0xa84a6a, secondary: 0xd9b88a, accent: 0x5aa84e },
    desc: 'A duke of the underground mycelium court. Everything that rots, it knows about.', captureBase: 0.3, scale: 1.25 }),

  // ===== THE STORMCROWN LINE (Volt, 3 stages) =====
  // Joltuft → Ampyre → Teslarch
  S({ id: 'joltuft', name: 'Joltuft', type: 'Volt', stage: 'Novice', archetype: 'beast',
    base: stats(31, 16, 11, 7, 13, 10), growth: stats(5.3, 2.7, 2.2, 1.4, 2.7, 2.2),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 7, tech: 'arc_bolt' }],
    evolvesTo: { species: 'ampyre', level: 12 },
    palette: { primary: 0xf2e06e, secondary: 0xffffff, accent: 0x6ec4f2 },
    desc: 'A static-charged puffball. Petting it is a popular dare among cadets.', captureBase: 0.55, scale: 0.55 }),
  S({ id: 'ampyre', name: 'Ampyre', type: 'Volt', stage: 'Adept', archetype: 'beast',
    base: stats(55, 26, 20, 12, 21, 17), growth: stats(7.4, 3.3, 2.9, 1.8, 3.3, 2.8),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'static_jab' }, { level: 16, tech: 'overcharge' }, { level: 21, tech: 'storm_lance' }],
    evolvesTo: { species: 'teslarch', level: 24 },
    palette: { primary: 0xd9c43a, secondary: 0x4a4a5a, accent: 0x5ab8e8 },
    desc: 'It drinks lightning the way others drink water, and is always slightly overcaffeinated.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'teslarch', name: 'Teslarch', type: 'Volt', stage: 'Elite', archetype: 'avian',
    base: stats(95, 42, 35, 21, 33, 30), growth: stats(9.8, 4, 3.9, 2.4, 3.9, 3.7),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'overcharge' }, { level: 30, tech: 'numbing_field' }, { level: 36, tech: 'thunder_dominion' }],
    palette: { primary: 0xb09a22, secondary: 0xf2e06e, accent: 0x2a7dd9 },
    desc: 'A crowned storm-falcon. Signal towers bow their antennae as it passes — or melt.', captureBase: 0.15, scale: 1.35 }),

  // ===== THE COGSPARK LINE (Volt, 2 stages) =====
  S({ id: 'gearmite', name: 'Gearmite', type: 'Volt', stage: 'Novice', archetype: 'shell',
    base: stats(36, 13, 10, 13, 8, 9), growth: stats(6, 2.3, 2.1, 2.6, 1.6, 2),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'numbing_field' }],
    evolvesTo: { species: 'dynamaul', level: 20 },
    palette: { primary: 0x8a8e9a, secondary: 0xc9a24a, accent: 0xf2d23a },
    desc: 'A beetle that nests in old machines. It purrs in perfect clockwork rhythm.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'dynamaul', name: 'Dynamaul', type: 'Volt', stage: 'Adept', archetype: 'brute',
    base: stats(74, 22, 25, 23, 13, 15), growth: stats(9.2, 2.9, 3.4, 3.2, 1.9, 2.4),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'overcharge' }, { level: 25, tech: 'storm_lance' }],
    palette: { primary: 0x6a6e7a, secondary: 0xe8c42a, accent: 0x3a9df2 },
    desc: 'A walking dynamo with hammer-fists. The Legion offered it a job; it wanted weekends.', captureBase: 0.3, scale: 1.3 }),

  // ===== THE SKYRIVER LINE (Gale, 4 stages) =====
  // Plumelet → Skydancer → Stratoroc → Empyrhawk
  S({ id: 'plumelet', name: 'Plumelet', type: 'Gale', stage: 'Novice', archetype: 'avian',
    base: stats(32, 15, 10, 7, 14, 9), growth: stats(5.4, 2.6, 2, 1.4, 2.9, 2),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 7, tech: 'tailwind' }],
    evolvesTo: { species: 'skydancer', level: 12 },
    palette: { primary: 0xf2f2e8, secondary: 0x7adfd0, accent: 0xf2c14e },
    desc: 'A single downy feather\'s worth of bird. The wind carries it out of pure affection.', captureBase: 0.55, scale: 0.55 }),
  S({ id: 'skydancer', name: 'Skydancer', type: 'Gale', stage: 'Adept', archetype: 'avian',
    base: stats(54, 25, 18, 12, 23, 16), growth: stats(7.2, 3.1, 2.7, 1.8, 3.5, 2.6),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 16, tech: 'tailwind' }, { level: 20, tech: 'razor_cyclone' }],
    evolvesTo: { species: 'stratoroc', level: 22 },
    palette: { primary: 0xe8e0d0, secondary: 0x4ec4b0, accent: 0xe8843a },
    desc: 'It performs aerial figures for no audience but the clouds. The clouds applaud, slowly.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'stratoroc', name: 'Stratoroc', type: 'Gale', stage: 'Elite', archetype: 'avian',
    base: stats(96, 38, 34, 20, 35, 26), growth: stats(9.6, 3.7, 3.8, 2.4, 4.1, 3.3),
    techs: [{ level: 1, tech: 'dive_talon' }, { level: 1, tech: 'razor_cyclone' }, { level: 29, tech: 'tailwind' }, { level: 35, tech: 'sky_sunder' }],
    evolvesTo: { species: 'empyrhawk', level: 32 },
    palette: { primary: 0xc8c0a8, secondary: 0x2a8a7a, accent: 0xf2c14e },
    desc: 'A roc of the stratosphere. Its shadow has its own weather report.', captureBase: 0.15, scale: 1.4 }),
  S({ id: 'empyrhawk', name: 'Empyrhawk', type: 'Gale', stage: 'Apex', archetype: 'avian',
    base: stats(152, 56, 51, 31, 52, 40), growth: stats(11.4, 4.3, 4.6, 2.9, 5, 4),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 44, tech: 'tailwind' }],
    palette: { primary: 0xf2ead0, secondary: 0x1a6e60, accent: 0xffd24e },
    desc: 'It hunts above the sky\'s ceiling, where the blue runs out. Few have seen it land. None twice.', captureBase: 0.05, scale: 1.7 }),

  // ===== THE LULLWIND LINE (Gale, 2 stages) =====
  S({ id: 'driftling', name: 'Driftling', type: 'Gale', stage: 'Novice', archetype: 'sprite',
    base: stats(34, 16, 9, 8, 13, 11), growth: stats(5.7, 2.7, 1.9, 1.7, 2.7, 2.4),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'tailwind' }, { level: 14, tech: 'razor_cyclone' }],
    evolvesTo: { species: 'nimbusyl', level: 19 },
    palette: { primary: 0xd8e8f2, secondary: 0xf2f8ff, accent: 0x7adfd0 },
    desc: 'A scrap of cloud that fell asleep below the mountains and never found its way home.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'nimbusyl', name: 'Nimbusyl', type: 'Gale', stage: 'Adept', archetype: 'sprite',
    base: stats(64, 28, 17, 15, 20, 21), growth: stats(8, 3.5, 2.5, 2.3, 3.1, 3.2),
    techs: [{ level: 1, tech: 'razor_cyclone' }, { level: 1, tech: 'tailwind' }, { level: 24, tech: 'sky_sunder' }],
    palette: { primary: 0xb8d0e8, secondary: 0xffffff, accent: 0x5ab8e8 },
    desc: 'A pocket thunderhead with opinions. It rains only on the deserving.', captureBase: 0.3, scale: 1.2 }),

  // ===== THE NIGHTLOOM LINE (Umbra, 5 stages) =====
  // Mournmoth → Duskweaver → Nightloom → Phantasmoth → Erebusilk
  S({ id: 'mournmoth', name: 'Mournmoth', type: 'Umbra', stage: 'Novice', archetype: 'sprite',
    base: stats(32, 16, 10, 8, 12, 11), growth: stats(5.4, 2.7, 2, 1.7, 2.4, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 7, tech: 'gloom_ray' }],
    evolvesTo: { species: 'duskweaver', level: 12 },
    palette: { primary: 0x4a3a6a, secondary: 0x8a7ab0, accent: 0xe8d8f8 },
    desc: 'A moth drawn to darkness instead of light. It sips shadows like nectar.', captureBase: 0.55, scale: 0.6 }),
  S({ id: 'duskweaver', name: 'Duskweaver', type: 'Umbra', stage: 'Adept', archetype: 'sprite',
    base: stats(56, 26, 18, 13, 19, 19), growth: stats(7.5, 3.3, 2.7, 2, 3, 3),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'shade_nip' }, { level: 15, tech: 'umbral_drain' }, { level: 20, tech: 'dread_howl' }],
    evolvesTo: { species: 'nightloom', level: 20 },
    palette: { primary: 0x3a2a5a, secondary: 0x7a5aa8, accent: 0xd8b8f8 },
    desc: 'It spins thread from twilight. Duskwatch cloaks are woven from its gifts — never taken.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'nightloom', name: 'Nightloom', type: 'Umbra', stage: 'Elite', archetype: 'avian',
    base: stats(94, 40, 32, 23, 29, 31), growth: stats(9.6, 3.9, 3.6, 2.7, 3.4, 3.8),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'void_fang' }, { level: 28, tech: 'umbral_drain' }, { level: 34, tech: 'eclipse_requiem' }],
    evolvesTo: { species: 'phantasmoth', level: 30 },
    palette: { primary: 0x2c1e4a, secondary: 0x6a4a9a, accent: 0xc49ae8 },
    desc: 'Its wing patterns show each watcher a different forgotten memory. Most say thank you.', captureBase: 0.15, scale: 1.3 }),
  S({ id: 'phantasmoth', name: 'Phantasmoth', type: 'Umbra', stage: 'Apex', archetype: 'avian',
    base: stats(150, 58, 48, 36, 40, 48), growth: stats(11.5, 4.5, 4.4, 3.3, 4, 4.5),
    techs: [{ level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'void_fang' }, { level: 44, tech: 'umbral_drain' }],
    evolvesTo: { species: 'erebusilk', level: 44 },
    palette: { primary: 0x221442, secondary: 0x5a3a8a, accent: 0xe85a9a },
    desc: 'Half here, half elsewhere. Its cocoon stage lasted a century and a half.', captureBase: 0.05, scale: 1.65 }),
  S({ id: 'erebusilk', name: 'Erebusilk', type: 'Umbra', stage: 'Special', archetype: 'serpent',
    base: stats(248, 86, 72, 56, 58, 70), growth: stats(14.8, 5.6, 5.2, 4.2, 4.6, 5.4),
    techs: [{ level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'umbral_drain' }, { level: 46, tech: 'void_extinction' }],
    palette: { primary: 0x140a2e, secondary: 0x4a2a8a, accent: 0xff7ad0 },
    desc: 'The great silk-serpent that wove the first night sky and left the stars as loose threads.', captureBase: 0, scale: 1.95 }),

  // ===== THE TOMBWARD LINE (Umbra, 2 stages) =====
  S({ id: 'cryptling', name: 'Cryptling', type: 'Umbra', stage: 'Novice', archetype: 'shell',
    base: stats(39, 12, 10, 13, 7, 9), growth: stats(6.6, 2.2, 2.1, 2.6, 1.4, 2),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'dread_howl' }, { level: 14, tech: 'umbral_drain' }],
    evolvesTo: { species: 'sarcophang', level: 20 },
    palette: { primary: 0x44405a, secondary: 0x6a648a, accent: 0xc4b46a },
    desc: 'A tiny tomb-guardian that lost its tomb. It guards whatever you ask, with terrifying sincerity.', captureBase: 0.55, scale: 0.65 }),
  S({ id: 'sarcophang', name: 'Sarcophang', type: 'Umbra', stage: 'Adept', archetype: 'brute',
    base: stats(76, 22, 24, 25, 11, 16), growth: stats(9.4, 2.9, 3.3, 3.4, 1.7, 2.6),
    techs: [{ level: 1, tech: 'dread_howl' }, { level: 1, tech: 'umbral_drain' }, { level: 25, tech: 'void_fang' }],
    palette: { primary: 0x36324a, secondary: 0x5a547a, accent: 0xd9c46a },
    desc: 'A sarcophagus that promoted itself to sentinel. The gilt fangs are decorative. Mostly.', captureBase: 0.3, scale: 1.3 }),

  // ===== THE CORRUPTED LEGION =====
  // Nine four-element generals sealed in Ghandra fifteen years ago by
  // Aljay, Greggy and Onnel. Their armies wait for the seal to fail.
  S({ id: 'ashkarath', name: 'Ashkarath', type: 'Blaze', stage: 'Transcendent', archetype: 'brute',
    base: stats(300, 90, 92, 64, 50, 60), growth: stats(16, 5.5, 6.2, 4.4, 4, 4.8),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'sol_eruption' }],
    palette: { primary: 0x3a1410, secondary: 0xe84a1a, accent: 0x9a5af2 },
    desc: 'General of Cinders. Its army burned a corridor through Ghandra wide enough to march a city through — until Aljay\'s phoenix turned its own fire against it.', captureBase: 0, scale: 2.1 }),
  S({ id: 'vormaela', name: 'Vormaela', type: 'Tide', stage: 'Transcendent', archetype: 'serpent',
    base: stats(310, 95, 80, 68, 52, 74), growth: stats(16.5, 5.8, 5.6, 4.6, 4, 5.4),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'deluge_tempest' }],
    palette: { primary: 0x0a1a3a, secondary: 0x2a7dd9, accent: 0xb05ae8 },
    desc: 'The Tide-Empress of the Drowned Choir. Her tides answer no moon — only her grief, and her grief is bottomless.', captureBase: 0, scale: 2.1 }),
  S({ id: 'bramblehex', name: 'Bramblehex', type: 'Verdant', stage: 'Transcendent', archetype: 'brute',
    base: stats(330, 85, 84, 80, 38, 62), growth: stats(17.5, 5.4, 5.8, 5.4, 3.4, 4.9),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'nature_judgment' }],
    palette: { primary: 0x1a2a10, secondary: 0x6a8a3a, accent: 0xc44a7a },
    desc: 'The Rotwarden. Everything it touches grows — wrong. Onnel wept while sealing it; they had been grown from the same grove, long ago.', captureBase: 0, scale: 2.15 }),
  S({ id: 'voltrazar', name: 'Voltrazar', type: 'Volt', stage: 'Transcendent', archetype: 'avian',
    base: stats(290, 100, 88, 58, 72, 70), growth: stats(15.5, 6, 6, 4.2, 5.4, 5.2),
    techs: [{ level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'storm_lance' }, { level: 1, tech: 'volt_singularity' }],
    palette: { primary: 0x2a240a, secondary: 0xf2d23a, accent: 0x9a5af2 },
    desc: 'The Storm-Tyrant of the Iron Tempest. Greggy grounded it with a hand-built coil and a grin. It has not forgiven either.', captureBase: 0, scale: 2.05 }),
  S({ id: 'gorrundax', name: 'Gorrundax', type: 'Verdant', stage: 'Transcendent', archetype: 'shell',
    base: stats(360, 70, 78, 96, 28, 50), growth: stats(18.5, 4.8, 5.5, 6, 2.8, 4.2),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'dread_howl' }],
    palette: { primary: 0x2e2a26, secondary: 0x8a7a5a, accent: 0xe85a3a },
    desc: 'The Mountain-Eater. The Gravelborn Horde tunneled beneath continents; three mountain ranges in Tharkand are actually its cast-off shells.', captureBase: 0, scale: 2.3 }),
  S({ id: 'cryomara', name: 'Cryomara', type: 'Tide', stage: 'Transcendent', archetype: 'sprite',
    base: stats(280, 105, 76, 66, 58, 84), growth: stats(15, 6.2, 5.4, 4.6, 4.4, 5.8),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'mist_veil' }, { level: 1, tech: 'deluge_tempest' }],
    palette: { primary: 0xc8e8f2, secondary: 0x5a8ab8, accent: 0x9a5af2 },
    desc: 'Queen of the Still. Where the Silent Glacier marched, nothing moved again — not water, not wind, not time. Noruun\'s auroras are her dreaming.', captureBase: 0, scale: 1.95 }),
  S({ id: 'luxavor', name: 'Luxavor', type: 'Blaze', stage: 'Transcendent', archetype: 'avian',
    base: stats(285, 100, 86, 60, 66, 78), growth: stats(15.5, 6, 5.9, 4.3, 4.9, 5.5),
    techs: [{ level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'aether_flare' }, { level: 1, tech: 'sol_eruption' }],
    palette: { primary: 0xf2ead0, secondary: 0xd9a93a, accent: 0x6a2ac0 },
    desc: 'The False Dawn. Its Blinding Host marched beneath a counterfeit sunrise, and whole armies knelt to it before realizing their mistake.', captureBase: 0, scale: 2.05 }),
  S({ id: 'nyxghul', name: 'Nyxghul', type: 'Umbra', stage: 'Transcendent', archetype: 'serpent',
    base: stats(320, 95, 90, 70, 60, 80), growth: stats(17, 5.8, 6.1, 4.8, 4.5, 5.6),
    techs: [{ level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'void_fang' }, { level: 1, tech: 'void_extinction' }],
    palette: { primary: 0x0e081a, secondary: 0x4a2a8a, accent: 0xe8d9a8 },
    desc: 'The Hollow Crown — first and worst of the nine. Aljay\'s broom-handle duel with it is reenacted by children on every continent; the real one lasted three days and broke a mountain.', captureBase: 0, scale: 2.2 }),
  S({ id: 'zerathuul', name: 'Zerathuul', type: 'Gale', stage: 'Transcendent', archetype: 'serpent',
    base: stats(295, 100, 84, 62, 76, 76), growth: stats(16, 6, 5.8, 4.4, 5.6, 5.4),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 1, tech: 'tempest_gale' }],
    palette: { primary: 0x1a1a32, secondary: 0x7a8af2, accent: 0xf25aa8 },
    desc: 'The Rift-Herald. It carries the door to Ghandra in its wake like a torn hem. When the seal thins, Zerathuul is what slips through first.', captureBase: 0, scale: 2.1 }),

  // ===== Bosses =====
  S({ id: 'ironhusk', name: 'Ironhusk', type: 'Umbra', stage: 'Adept', archetype: 'shell',
    base: stats(150, 30, 22, 20, 9, 14), growth: stats(9, 3, 3, 2.6, 1.6, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'dread_howl' }],
    palette: { primary: 0x4a4a5a, secondary: 0x8a8aa0, accent: 0xc44a4a },
    desc: 'A corrupted sentinel husk that haunts the Trial Caverns.', captureBase: 0, scale: 1.6 }),
  S({ id: 'gravemaw', name: 'Gravemaw', type: 'Umbra', stage: 'Elite', archetype: 'brute',
    base: stats(260, 50, 36, 28, 16, 24), growth: stats(11, 3.5, 3.8, 3, 2, 3),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'dread_howl' }, { level: 1, tech: 'umbral_drain' }],
    palette: { primary: 0x2a2a3a, secondary: 0x5a4a7a, accent: 0xe83a5a },
    desc: 'The hunger beneath the Sunken Vault. It remembers being worshipped.', captureBase: 0, scale: 1.9 }),
  S({ id: 'voltigarch', name: 'Voltigarch', type: 'Volt', stage: 'Elite', archetype: 'brute',
    base: stats(300, 60, 42, 32, 26, 30), growth: stats(12, 3.8, 4.2, 3.2, 2.8, 3.4),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'numbing_field' }],
    palette: { primary: 0x6a5a10, secondary: 0xe8c42a, accent: 0x3a9df2 },
    desc: 'A war-engine of the old empire, still executing its last order.', captureBase: 0, scale: 2.0 }),

  // ===== Legends' Nine =====
  S({ id: 'firgara', name: 'Firgara', type: 'Blaze', stage: 'Aether', archetype: 'brute',
    base: stats(130, 40, 42, 30, 26, 28), growth: stats(11, 3.6, 4.0, 3.0, 2.4, 2.6),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'daybreak_severance' }],
    palette: { primary: 0xc8202a, secondary: 0xe8b84a, accent: 0xff9ad2 },
    desc: 'Aljay\'s first bond — a crimson dragonoid knight in mirror-bright scale, bearing Daybreak, a greatsword of living flame.', captureBase: 0, scale: 2.025 }),
  S({ id: 'onthrofa', name: 'Onthrofa', type: 'Gale', stage: 'Aether', archetype: 'sprite',
    base: stats(110, 55, 34, 28, 32, 36), growth: stats(9, 4.5, 3.0, 2.6, 3.2, 3.4),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'tempest_gale' }, { level: 1, tech: 'eclipse_of_hours' }],
    palette: { primary: 0x8a4af2, secondary: 0x2a1a5a, accent: 0xff9ad2 },
    desc: 'A violet being of folded distance and borrowed hours, wreathed in the slow clockwork of Space and Time.', captureBase: 0, scale: 1.8 }),
  S({ id: 'vulfenix', name: 'Vulfenix', type: 'Blaze', stage: 'Aether', archetype: 'avian',
    base: stats(120, 45, 38, 26, 30, 32), growth: stats(10, 4.0, 3.6, 2.4, 2.8, 3.0),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'aether_flare' }, { level: 1, tech: 'rosefire_requiem' }],
    palette: { primary: 0xff5aa8, secondary: 0x2a1a2e, accent: 0xffd8ec },
    desc: 'The rose-fire phoenix that lit Aljay\'s way through Ghandra\'s dark — and has not landed since.', captureBase: 0, scale: 1.95 }),
  S({ id: 'raijura', name: 'Raijura', type: 'Volt', stage: 'Aether', archetype: 'avian',
    base: stats(118, 48, 40, 26, 32, 30), growth: stats(9.8, 4.2, 3.8, 2.4, 3.0, 2.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'thunderclap_genesis' }],
    palette: { primary: 0xf2d23a, secondary: 0xe8ecff, accent: 0xff9ad2 },
    desc: 'A storm-roc hatched from the first thunderclap Greggy ever heard.', captureBase: 0, scale: 1.35 }),
  S({ id: 'voltherion', name: 'Voltherion', type: 'Volt', stage: 'Aether', archetype: 'brute',
    base: stats(132, 40, 44, 32, 24, 26), growth: stats(11.2, 3.6, 4.2, 3.2, 2.2, 2.4),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'dynamo_overload' }],
    palette: { primary: 0x4a5468, secondary: 0xf2d23a, accent: 0x7a8af2 },
    desc: 'A walking dynamo wound around a captive star, wearing a custom grounding coil.', captureBase: 0, scale: 1.3 }),
  S({ id: 'fulgrath', name: 'Fulgrath', type: 'Volt', stage: 'Aether', archetype: 'serpent',
    base: stats(114, 52, 36, 26, 34, 32), growth: stats(9.5, 4.4, 3.4, 2.4, 3.2, 3.0),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'numbing_field' }, { level: 1, tech: 'fulgurant_coil' }],
    palette: { primary: 0x1a1a2e, secondary: 0xf2d23a, accent: 0xb14aff },
    desc: 'Lightning that struck once in the dark of Ghandra and decided to stay.', captureBase: 0, scale: 1.25 }),
  S({ id: 'verdalune', name: 'Verdalune', type: 'Verdant', stage: 'Aether', archetype: 'sprite',
    base: stats(124, 50, 36, 28, 28, 34), growth: stats(10.4, 4.2, 3.4, 2.6, 2.6, 3.2),
    techs: [{ level: 1, tech: 'forest_wrath_tech' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'lunar_bloom' }],
    palette: { primary: 0x4ec45e, secondary: 0xf2e8b8, accent: 0xff9ad2 },
    desc: 'A moonlit spirit-bloom that opens only for Onnel. Five championship rings grew from its petals.', captureBase: 0, scale: 1.2 }),
  S({ id: 'gaiathorn', name: 'Gaiathorn', type: 'Verdant', stage: 'Aether', archetype: 'shell',
    base: stats(142, 36, 38, 36, 20, 28), growth: stats(12.2, 3.2, 3.6, 3.6, 1.8, 2.6),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'worldgarden_collapse' }],
    palette: { primary: 0x5a3e22, secondary: 0x4ec45e, accent: 0x7a8af2 },
    desc: 'A great shelled wanderer with a living garden on its back.', captureBase: 0, scale: 1.35 }),
  S({ id: 'nyxroot', name: 'Nyxroot', type: 'Verdant', stage: 'Aether', archetype: 'brute',
    base: stats(134, 42, 40, 30, 24, 30), growth: stats(11.4, 3.8, 3.8, 3.0, 2.2, 2.8),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'abyssal_taproot' }],
    palette: { primary: 0x241e32, secondary: 0x4ec45e, accent: 0xb14aff },
    desc: 'The root that reaches where light gives up. It anchored the seal on Ghandra.', captureBase: 0, scale: 1.3 }),

  // ===== 15 READY-MADE FUSIONS =====
  S({ id: 'pyrostrike', name: 'Pyrostrike', type: 'Blaze', stage: 'Elite', archetype: 'beast', isFusion: true,
    base: stats(88, 32, 34, 22, 26, 20), growth: stats(9, 3.2, 3.8, 2.4, 2.8, 2.2),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'arc_bolt' }, { level: 25, tech: 'flame_burst' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xe84a2a, secondary: 0xf2d23a, accent: 0xffffff },
    desc: 'Fused from Blaze and Volt essence. A blazing tiger that crackles with electricity.', captureBase: 0, scale: 1.3 }),
  S({ id: 'aquafrost', name: 'Aquafrost', type: 'Tide', stage: 'Elite', archetype: 'serpent', isFusion: true,
    base: stats(96, 36, 26, 24, 22, 28), growth: stats(9.5, 3.6, 2.8, 2.6, 2.4, 3.4),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'bubble_jet' }, { level: 25, tech: 'spring_mend' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0x3a9df2, secondary: 0x9adff2, accent: 0xffffff },
    desc: 'Fused from Tide and Ice essence. A frozen sea serpent with crystalline ice spikes.', captureBase: 0, scale: 1.35 }),
  S({ id: 'terragrow', name: 'Terragrow', type: 'Verdant', stage: 'Elite', archetype: 'brute', isFusion: true,
    base: stats(108, 30, 32, 30, 16, 22), growth: stats(10.5, 3.2, 3.4, 3.4, 1.8, 2.6),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'seed_shot' }, { level: 25, tech: 'bloom_ward' }, { level: 35, tech: 'elder_wrath' }],
    palette: { primary: 0x4ec45e, secondary: 0xb0865a, accent: 0xffffff },
    desc: 'Fused from Verdant and Rock essence. A moss-covered stone titan of ancient power.', captureBase: 0, scale: 1.4 }),
  S({ id: 'voltclysm', name: 'Voltclysm', type: 'Volt', stage: 'Elite', archetype: 'avian', isFusion: true,
    base: stats(84, 38, 30, 18, 30, 26), growth: stats(8.5, 3.8, 3.4, 2.0, 3.6, 3.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'gust_cut' }, { level: 25, tech: 'numbing_field' }, { level: 35, tech: 'volt_singularity' }],
    palette: { primary: 0xf2d23a, secondary: 0x7adfd0, accent: 0xffffff },
    desc: 'Fused from Volt and Space essence. A cosmic thunderbird wreathed in storm clouds.', captureBase: 0, scale: 1.3 }),
  S({ id: 'umbrashade', name: 'Umbrashade', type: 'Umbra', stage: 'Elite', archetype: 'brute', isFusion: true,
    base: stats(90, 36, 32, 20, 26, 24), growth: stats(9, 3.6, 3.6, 2.2, 3.0, 2.8),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 25, tech: 'umbral_drain' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x9a5af2, secondary: 0x7a8af2, accent: 0x101018 },
    desc: 'Fused from Umbra and Dark essence. A shadow stalker with razor void claws.', captureBase: 0, scale: 1.35 }),
  S({ id: 'solgaleo', name: 'Solgaleo', type: 'Blaze', stage: 'Elite', archetype: 'beast', isFusion: true,
    base: stats(94, 34, 36, 22, 24, 22), growth: stats(9.5, 3.4, 4.0, 2.4, 2.6, 2.4),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'gust_cut' }, { level: 25, tech: 'flame_burst' }, { level: 35, tech: 'sol_eruption' }],
    palette: { primary: 0xff8c00, secondary: 0x7a8af2, accent: 0xffffff },
    desc: 'Fused from Blaze and Space essence. A solar lion wreathed in stellar dust.', captureBase: 0, scale: 1.3 }),
  S({ id: 'tidedeep', name: 'Tidedeep', type: 'Tide', stage: 'Elite', archetype: 'serpent', isFusion: true,
    base: stats(102, 38, 28, 26, 20, 26), growth: stats(10, 3.8, 3.0, 2.8, 2.2, 3.0),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'shade_nip' }, { level: 25, tech: 'spring_mend' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0x2a5d9e, secondary: 0x9a5af2, accent: 0x101018 },
    desc: 'Fused from Tide and Dark essence. A deep-sea leviathan with bio-luminescent marks.', captureBase: 0, scale: 1.38 }),
  S({ id: 'thornspark', name: 'Thornspark', type: 'Verdant', stage: 'Elite', archetype: 'sprite', isFusion: true,
    base: stats(82, 32, 24, 22, 28, 24), growth: stats(8.2, 3.2, 2.6, 2.4, 3.2, 2.6),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'static_jab' }, { level: 25, tech: 'bloom_ward' }, { level: 35, tech: 'numbing_field' }],
    palette: { primary: 0x4ec45e, secondary: 0xf2d23a, accent: 0xffffff },
    desc: 'Fused from Verdant and Volt essence. A glowing forest spirit shooting pollen sparks.', captureBase: 0, scale: 1.25 }),
  S({ id: 'duskbloom', name: 'Duskbloom', type: 'Umbra', stage: 'Elite', archetype: 'sprite', isFusion: true,
    base: stats(88, 34, 26, 24, 22, 26), growth: stats(8.8, 3.4, 2.8, 2.6, 2.4, 2.8),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'sap_drain' }, { level: 25, tech: 'umbral_drain' }, { level: 35, tech: 'forest_fury' }],
    palette: { primary: 0x9a5af2, secondary: 0x4ec45e, accent: 0x101018 },
    desc: 'Fused from Umbra and Verdant essence. A dark blossom fairy blooming in shadow.', captureBase: 0, scale: 1.25 }),
  S({ id: 'aethergale', name: 'Aethergale', type: 'Gale', stage: 'Elite', archetype: 'avian', isFusion: true,
    base: stats(86, 36, 28, 20, 32, 28), growth: stats(8.6, 3.6, 3.0, 2.2, 3.6, 3.2),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'aether_flare' }, { level: 25, tech: 'tailwind' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0x7a8af2, secondary: 0xff9ad2, accent: 0xffffff },
    desc: 'Fused from Gale and Aether essence. An astral phoenix flowing between dimensions.', captureBase: 0, scale: 1.3 }),
  S({ id: 'lavachain', name: 'Lavachain', type: 'Blaze', stage: 'Elite', archetype: 'brute', isFusion: true,
    base: stats(104, 30, 38, 28, 18, 20), growth: stats(10.4, 3.0, 4.2, 3.0, 2.0, 2.2),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'rock_strike' }, { level: 25, tech: 'flame_burst' }, { level: 35, tech: 'inferno_maw' }],
    palette: { primary: 0xf2603a, secondary: 0xb0865a, accent: 0xffffff },
    desc: 'Fused from Blaze and Rock essence. A magma giant forging obsidian chains.', captureBase: 0, scale: 1.45 }),
  S({ id: 'stormwave', name: 'Stormwave', type: 'Volt', stage: 'Elite', archetype: 'serpent', isFusion: true,
    base: stats(92, 36, 30, 20, 28, 24), growth: stats(9.2, 3.6, 3.2, 2.2, 3.2, 2.6),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'bubble_jet' }, { level: 25, tech: 'numbing_field' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xf2d23a, secondary: 0x3a9df2, accent: 0xffffff },
    desc: 'Fused from Volt and Tide essence. A storm eel electrifying oceanic depths.', captureBase: 0, scale: 1.32 }),
  S({ id: 'glaciervine', name: 'Glaciervine', type: 'Verdant', stage: 'Elite', archetype: 'brute', isFusion: true,
    base: stats(102, 32, 32, 28, 16, 26), growth: stats(10.2, 3.2, 3.4, 3.0, 1.8, 3.0),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'ice_shard' }, { level: 25, tech: 'bloom_ward' }, { level: 35, tech: 'forest_fury' }],
    palette: { primary: 0x9adff2, secondary: 0x4ec45e, accent: 0xffffff },
    desc: 'Fused from Ice and Verdant essence. A frozen treant writhed in icicles.', captureBase: 0, scale: 1.42 }),
  S({ id: 'shadowlight', name: 'Shadowlight', type: 'Umbra', stage: 'Elite', archetype: 'beast', isFusion: true,
    base: stats(92, 34, 34, 22, 26, 22), growth: stats(9.2, 3.4, 3.8, 2.4, 2.8, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'light_burst' }, { level: 25, tech: 'umbral_drain' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x9a5af2, secondary: 0xf2e8b8, accent: 0xffffff },
    desc: 'Fused from Dark and Light essence. A twilight wolf with dual radiant and umbral horns.', captureBase: 0, scale: 1.3 }),
  S({ id: 'aetherion', name: 'Aetherion', type: 'Gale', stage: 'Elite', archetype: 'beast', isFusion: true,
    base: stats(98, 36, 32, 24, 24, 26), growth: stats(9.8, 3.6, 3.6, 2.6, 2.6, 2.8),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'aether_flare' }, { level: 25, tech: 'tailwind' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0x7a8af2, secondary: 0xff9ad2, accent: 0xffffff },
    desc: 'Fused from Space and Aether essence. An astral beast surrounded by floating planetoids.', captureBase: 0, scale: 1.35 }),

  // ===== 6 EXTRA-EVOLUTIONS =====
  S({ id: 'pyromount', name: 'Pyromount', type: 'Blaze', stage: 'Elite', archetype: 'beast',
    base: stats(98, 30, 36, 26, 22, 18), growth: stats(10, 3.2, 4.0, 2.8, 2.4, 2.2),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'rock_strike' }, { level: 25, tech: 'flame_burst' }, { level: 35, tech: 'inferno_maw' }],
    palette: { primary: 0xd9542e, secondary: 0xb0865a, accent: 0xfff0c8 },
    desc: 'An extra evolution of Cindcub. A rocky volcanic beast with magma-plated hide.', captureBase: 0, scale: 1.3 }),
  S({ id: 'puddlecrest', name: 'Puddlecrest', type: 'Tide', stage: 'Elite', archetype: 'sprite',
    base: stats(90, 42, 22, 22, 20, 34), growth: stats(9, 4.2, 2.4, 2.4, 2.2, 3.8),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'light_burst' }, { level: 25, tech: 'spring_mend' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0x3a8dd9, secondary: 0xf2e8b8, accent: 0xd8f2ff },
    desc: 'An extra evolution of Puddla. A luminous sea sprite crowned in pearls.', captureBase: 0, scale: 1.2 }),
  S({ id: 'sproutshell', name: 'Sproutshell', type: 'Verdant', stage: 'Elite', archetype: 'shell',
    base: stats(112, 28, 28, 36, 14, 22), growth: stats(11.5, 3.0, 3.0, 3.8, 1.6, 2.6),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'rock_strike' }, { level: 25, tech: 'bloom_ward' }, { level: 35, tech: 'elder_wrath' }],
    palette: { primary: 0x4ea84e, secondary: 0xb0865a, accent: 0xffffff },
    desc: 'An extra evolution of Sproutle. A massive turtle overgrown with thick brambles.', captureBase: 0, scale: 1.3 }),
  S({ id: 'zapwing', name: 'Zapwing', type: 'Volt', stage: 'Elite', archetype: 'avian',
    base: stats(86, 36, 28, 18, 32, 26), growth: stats(8.8, 3.6, 3.2, 2.0, 3.6, 3.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'gust_cut' }, { level: 25, tech: 'numbing_field' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xf2d23a, secondary: 0x7adfd0, accent: 0xffffff },
    desc: 'An extra evolution of Zaplet. A sleek thunderbird with cosmic storm plumage.', captureBase: 0, scale: 1.25 }),
  S({ id: 'wispserpent', name: 'Wispserpent', type: 'Gale', stage: 'Elite', archetype: 'serpent',
    base: stats(88, 36, 26, 20, 30, 26), growth: stats(9.0, 3.6, 2.8, 2.2, 3.4, 2.8),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'shade_nip' }, { level: 25, tech: 'tailwind' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0x7adfd0, secondary: 0x9a5af2, accent: 0xffffff },
    desc: 'An extra evolution of Wispry. A winding sky serpent wreathed in twilight mist.', captureBase: 0, scale: 1.35 }),
  S({ id: 'shadeclaw', name: 'Shadeclaw', type: 'Umbra', stage: 'Elite', archetype: 'brute',
    base: stats(94, 32, 36, 22, 26, 22), growth: stats(9.5, 3.2, 3.8, 2.4, 2.8, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'static_jab' }, { level: 25, tech: 'umbral_drain' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x9a5af2, secondary: 0xf2d23a, accent: 0x101018 },
    desc: 'An extra evolution of Shadekit. A muscle-bound shadow brute with electrical sparks.', captureBase: 0, scale: 1.4 }),
  // ===== NEW BLAZE LINES =====
  S({ id: 'pyropup', name: 'Pyropup', type: 'Blaze', stage: 'Novice', archetype: 'beast',
    base: stats(35, 15, 12, 8, 10, 8), growth: stats(6, 2.5, 2.5, 1.8, 2.0, 1.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'pyrohound', level: 18 },
    palette: { primary: 0x221111, secondary: 0xc83232, accent: 0xff8a3a },
    desc: 'An obsidian-plated pup that sneezes sparks when excited.', captureBase: 0.5, scale: 0.75 }),
  S({ id: 'pyrohound', name: 'Pyrohound', type: 'Blaze', stage: 'Adept', archetype: 'beast',
    base: stats(85, 28, 24, 18, 22, 20), growth: stats(9.5, 3.2, 3.2, 2.4, 2.8, 2.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 25, tech: 'cinder_lash' }, { level: 35, tech: 'inferno_maw' }],
    palette: { primary: 0x110808, secondary: 0xa82222, accent: 0xff6a1e },
    desc: 'A volcanic hound wreathed in black smoke and blue embers.', captureBase: 0.25, scale: 1.25 }),
  S({ id: 'cindawing', name: 'Cindawing', type: 'Blaze', stage: 'Novice', archetype: 'avian',
    base: stats(33, 16, 11, 7, 11, 9), growth: stats(5.8, 2.6, 2.3, 1.7, 2.3, 1.8),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'cindafalcon', level: 18 },
    palette: { primary: 0xd9542e, secondary: 0xf2a13a, accent: 0xfff0c8 },
    desc: 'A fledgling of fire, its wings are formed of glowing embers.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'cindafalcon', name: 'Cindafalcon', type: 'Blaze', stage: 'Elite', archetype: 'avian',
    base: stats(83, 30, 25, 17, 24, 21), growth: stats(9.3, 3.4, 3.3, 2.3, 3.0, 2.7),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 25, tech: 'cinder_lash' }, { level: 35, tech: 'sun_cataclysm' }],
    palette: { primary: 0xc4401e, secondary: 0xf2803a, accent: 0xffd28a },
    desc: 'A magnificent solar falcon trailing embers and stellar dust.', captureBase: 0.25, scale: 1.2 }),
  S({ id: 'magmatot', name: 'Magmatot', type: 'Blaze', stage: 'Novice', archetype: 'shell',
    base: stats(40, 12, 10, 14, 6, 8), growth: stats(6.5, 2.1, 2.2, 2.8, 1.2, 1.7),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'magmatort', level: 18 },
    palette: { primary: 0x3a241c, secondary: 0xb0865a, accent: 0xffb44e },
    desc: 'A small basalt turtle with a crackling, warm lava shell.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'magmatort', name: 'Magmatort', type: 'Blaze', stage: 'Adept', archetype: 'shell',
    base: stats(90, 25, 22, 24, 13, 19), growth: stats(10.0, 2.8, 3.0, 3.4, 1.8, 2.5),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 25, tech: 'inferno_maw' }, { level: 35, tech: 'sun_cataclysm' }],
    palette: { primary: 0x2e1a14, secondary: 0x8a6442, accent: 0xff7a2a },
    desc: 'A massive lava turtle with an active, glowing volcano peak on its shell.', captureBase: 0.25, scale: 1.35 }),

  // ===== NEW TIDE LINES =====
  S({ id: 'bubbledrag', name: 'Bubbledrag', type: 'Tide', stage: 'Novice', archetype: 'serpent',
    base: stats(36, 17, 9, 9, 10, 11), growth: stats(6.1, 2.9, 1.9, 2.0, 2.1, 2.4),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'pearlwyrm', level: 18 },
    palette: { primary: 0x3a8dd9, secondary: 0x6ec4f2, accent: 0xd8f2ff },
    desc: 'A floating sea dragonet that blows glowing pearlescent bubbles.', captureBase: 0.5, scale: 0.75 }),
  S({ id: 'pearlwyrm', name: 'Pearlwyrm', type: 'Tide', stage: 'Adept', archetype: 'serpent',
    base: stats(86, 30, 20, 19, 20, 23), growth: stats(9.6, 3.6, 2.6, 2.5, 2.6, 3.0),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 25, tech: 'tidal_crush' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0x2a6dc4, secondary: 0x5ab8e8, accent: 0xc8ecff },
    desc: 'A pearl-plated sea serpent that channels deep oceanic light.', captureBase: 0.25, scale: 1.3 }),
  S({ id: 'mistpaw', name: 'Mistpaw', type: 'Tide', stage: 'Novice', archetype: 'beast',
    base: stats(35, 16, 10, 8, 12, 10), growth: stats(6.0, 2.7, 2.1, 1.8, 2.5, 2.2),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'frostlynx', level: 18 },
    palette: { primary: 0x6a9ac4, secondary: 0xa8d0e8, accent: 0xe8f4ff },
    desc: 'A playful aquatic kitten trailing a tail of cold mist and dew.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'frostlynx', name: 'Frostlynx', type: 'Tide', stage: 'Adept', archetype: 'beast',
    base: stats(85, 29, 21, 18, 24, 22), growth: stats(9.5, 3.3, 2.8, 2.4, 3.1, 2.8),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 25, tech: 'tidal_crush' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0x4a7aa8, secondary: 0x8ac0e8, accent: 0xc0e0ff },
    desc: 'A sleek ice panther with frozen claws and a mist-like mane.', captureBase: 0.25, scale: 1.25 }),
  S({ id: 'coralbud', name: 'Coralbud', type: 'Tide', stage: 'Novice', archetype: 'shell',
    base: stats(39, 13, 9, 13, 7, 10), growth: stats(6.5, 2.4, 1.8, 2.6, 1.3, 2.2),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'reefguard', level: 18 },
    palette: { primary: 0xe8838a, secondary: 0x6ec4f2, accent: 0xfff0e0 },
    desc: 'A tiny crab carrying a cluster of glowing ocean coral.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'reefguard', name: 'Reefguard', type: 'Tide', stage: 'Elite', archetype: 'shell',
    base: stats(89, 26, 20, 23, 14, 22), growth: stats(10.0, 3.0, 2.5, 3.2, 1.8, 2.8),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 25, tech: 'tidal_crush' }, { level: 35, tech: 'abyss_maelstrom' }],
    palette: { primary: 0xc86a78, secondary: 0x3a9df2, accent: 0xc8ecff },
    desc: 'An armored crab with glowing pink coral shields on its claws.', captureBase: 0.25, scale: 1.35 }),

  // ===== NEW VERDANT LINES =====
  S({ id: 'seedsqrl', name: 'Seedsqrl', type: 'Verdant', stage: 'Novice', archetype: 'beast',
    base: stats(34, 14, 11, 9, 11, 9), growth: stats(5.8, 2.4, 2.3, 1.9, 2.3, 2.0),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'voltcanopy', level: 18 },
    palette: { primary: 0x6a9a3a, secondary: 0xa8d95a, accent: 0xf2d23a },
    desc: 'A tiny squirrel with a leaf tail that stores crackling static.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'voltcanopy', name: 'Voltcanopy', type: 'Verdant', stage: 'Adept', archetype: 'beast',
    base: stats(84, 27, 22, 19, 23, 20), growth: stats(9.3, 3.0, 3.0, 2.5, 3.0, 2.6),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 25, tech: 'bramble_cage' }, { level: 35, tech: 'elder_wrath' }],
    palette: { primary: 0x4a7a2e, secondary: 0x8ac45a, accent: 0xd9c42a },
    desc: 'An agile forest badger whose tail crackles with lightning arcs.', captureBase: 0.25, scale: 1.25 }),
  S({ id: 'sporepix', name: 'Sporepix', type: 'Verdant', stage: 'Novice', archetype: 'sprite',
    base: stats(37, 16, 8, 10, 8, 12), growth: stats(6.2, 2.8, 1.8, 2.1, 1.5, 2.6),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'fungoking', level: 18 },
    palette: { primary: 0xc46a8a, secondary: 0xe8d0a8, accent: 0x8ad95a },
    desc: 'A floating forest spore sprite with bioluminescent spots.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'fungoking', name: 'Fungoking', type: 'Verdant', stage: 'Adept', archetype: 'sprite',
    base: stats(87, 29, 19, 20, 15, 25), growth: stats(9.7, 3.4, 2.5, 2.7, 1.9, 3.2),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 25, tech: 'bramble_cage' }, { level: 35, tech: 'elder_wrath' }],
    palette: { primary: 0xa84a6a, secondary: 0xd9b88a, accent: 0x5aa84e },
    desc: 'A glowing mushroom monarch emitting trails of starry spores.', captureBase: 0.25, scale: 1.2 }),
  S({ id: 'rootlet', name: 'Rootlet', type: 'Verdant', stage: 'Novice', archetype: 'brute',
    base: stats(42, 11, 12, 12, 6, 7), growth: stats(7.0, 2.0, 2.5, 2.6, 1.1, 1.6),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'grovewarden', level: 18 },
    palette: { primary: 0x8a7a5a, secondary: 0xb0a080, accent: 0x6ec45e },
    desc: 'A small wooden golem carrying a mossy runic shield.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'grovewarden', name: 'Grovewarden', type: 'Verdant', stage: 'Elite', archetype: 'brute',
    base: stats(92, 24, 25, 23, 12, 17), growth: stats(10.5, 2.8, 3.2, 3.1, 1.7, 2.4),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 25, tech: 'bramble_cage' }, { level: 35, tech: 'elder_wrath' }],
    palette: { primary: 0x6a5a3a, secondary: 0x908060, accent: 0x4ec45e },
    desc: 'A massive treant clad in runic stone breastplates.', captureBase: 0.25, scale: 1.45 }),

  // ===== NEW VOLT LINES =====
  S({ id: 'joltmous', name: 'Joltmous', type: 'Volt', stage: 'Novice', archetype: 'beast',
    base: stats(31, 16, 11, 7, 13, 10), growth: stats(5.4, 2.7, 2.2, 1.4, 2.8, 2.2),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'galvanix', level: 18 },
    palette: { primary: 0xf2e06e, secondary: 0xffffff, accent: 0x6ec4f2 },
    desc: 'A yellow mouse that sparks and zaps when startled.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'galvanix', name: 'Galvanix', type: 'Volt', stage: 'Adept', archetype: 'beast',
    base: stats(81, 28, 23, 16, 25, 21), growth: stats(8.9, 3.3, 3.0, 2.1, 3.4, 2.8),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 25, tech: 'storm_lance' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xd9c43a, secondary: 0x4a4a5a, accent: 0x5ab8e8 },
    desc: 'A lightning-fast badger crackling with high-voltage static.', captureBase: 0.25, scale: 1.2 }),
  S({ id: 'sparkeef', name: 'Sparkeef', type: 'Volt', stage: 'Novice', archetype: 'serpent',
    base: stats(33, 17, 9, 8, 12, 11), growth: stats(5.6, 2.9, 2.0, 1.6, 2.6, 2.3),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'tesladrag', level: 18 },
    palette: { primary: 0xe8d05a, secondary: 0xfff0a8, accent: 0x3a9df2 },
    desc: 'An electric eel sprite generating a field of crackling sparks.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'tesladrag', name: 'Tesladrag', type: 'Volt', stage: 'Elite', archetype: 'serpent',
    base: stats(83, 30, 21, 18, 23, 23), growth: stats(9.1, 3.5, 2.8, 2.3, 3.2, 3.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 25, tech: 'storm_lance' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xc4ae2a, secondary: 0xe8cc3a, accent: 0x2a7dd9 },
    desc: 'A magnificent electric sea dragon wreathed in copper coils.', captureBase: 0.25, scale: 1.35 }),
  S({ id: 'stormchick', name: 'Stormchick', type: 'Volt', stage: 'Novice', archetype: 'avian',
    base: stats(29, 18, 10, 6, 14, 11), growth: stats(4.9, 3.0, 2.1, 1.3, 3.0, 2.4),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'voltwing', level: 18 },
    palette: { primary: 0xffd700, secondary: 0xffffff, accent: 0x4b0082 },
    desc: 'A downy yellow chick with a tiny crown of static feathers.', captureBase: 0.5, scale: 0.55 }),
  S({ id: 'voltwing', name: 'Voltwing', type: 'Volt', stage: 'Adept', archetype: 'avian',
    base: stats(79, 32, 22, 14, 27, 23), growth: stats(8.4, 3.6, 2.9, 1.8, 3.6, 3.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 25, tech: 'storm_lance' }, { level: 35, tech: 'thunder_dominion' }],
    palette: { primary: 0xe8c42a, secondary: 0xe8ecff, accent: 0x4169e1 },
    desc: 'A thunderbird with giant wings made of electrical discharge.', captureBase: 0.25, scale: 1.25 }),

  // ===== NEW GALE LINES =====
  S({ id: 'nebulet', name: 'Nebulet', type: 'Gale', stage: 'Novice', archetype: 'beast',
    base: stats(34, 15, 10, 8, 12, 9), growth: stats(5.7, 2.6, 2.1, 1.7, 2.6, 2.0),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'astralpaw', level: 18 },
    palette: { primary: 0x5ac4b8, secondary: 0xa8e8e0, accent: 0xff9ad2 },
    desc: 'A stardust pup wreathed in a glowing indigo nebula.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'astralpaw', name: 'Astralpaw', type: 'Gale', stage: 'Adept', archetype: 'beast',
    base: stats(84, 28, 22, 17, 24, 20), growth: stats(9.2, 3.2, 3.0, 2.3, 3.1, 2.6),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 25, tech: 'razor_cyclone' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0x3aa89a, secondary: 0x7adfd0, accent: 0xff9ad2 },
    desc: 'A cosmic wolf with paws of starlight and constellation marks.', captureBase: 0.25, scale: 1.25 }),
  S({ id: 'galewyrm', name: 'Galewyrm', type: 'Gale', stage: 'Novice', archetype: 'serpent',
    base: stats(32, 16, 11, 7, 13, 9), growth: stats(5.4, 2.7, 2.2, 1.5, 2.8, 2.0),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'tempestwyrm', level: 18 },
    palette: { primary: 0x8ad0c8, secondary: 0xc8f0e8, accent: 0x9adff2 },
    desc: 'A small snake of wind with crystal spines along its back.', captureBase: 0.5, scale: 0.75 }),
  S({ id: 'tempestwyrm', name: 'Tempestwyrm', type: 'Gale', stage: 'Elite', archetype: 'serpent',
    base: stats(82, 29, 23, 16, 26, 21), growth: stats(8.9, 3.3, 3.1, 2.1, 3.3, 2.6),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 25, tech: 'razor_cyclone' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0x5acfc0, secondary: 0xaccfe2, accent: 0x3a8dd9 },
    desc: 'An elegant space serpent surrounded by orbiting ice shards.', captureBase: 0.25, scale: 1.35 }),
  S({ id: 'cosmolet', name: 'Cosmolet', type: 'Gale', stage: 'Novice', archetype: 'sprite',
    base: stats(35, 17, 9, 8, 11, 11), growth: stats(5.9, 2.9, 1.9, 1.7, 2.4, 2.4),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'stargazer', level: 18 },
    palette: { primary: 0xd8e8f2, secondary: 0xf2f8ff, accent: 0xff9ad2 },
    desc: 'A floating starlight core surrounded by a planetoid ring.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'stargazer', name: 'Stargazer', type: 'Gale', stage: 'Adept', archetype: 'sprite',
    base: stats(85, 30, 20, 18, 22, 23), growth: stats(9.4, 3.5, 2.7, 2.3, 2.9, 2.9),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 25, tech: 'razor_cyclone' }, { level: 35, tech: 'sky_sunder' }],
    palette: { primary: 0xb8d0e8, secondary: 0xffffff, accent: 0xff9ad2 },
    desc: 'A celestial maiden sprite surrounded by orbiting star crystals.', captureBase: 0.25, scale: 1.25 }),

  // ===== NEW UMBRA LINES =====
  S({ id: 'voidkit', name: 'Voidkit', type: 'Umbra', stage: 'Novice', archetype: 'beast',
    base: stats(33, 15, 11, 8, 11, 10), growth: stats(5.6, 2.5, 2.3, 1.7, 2.4, 2.2),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'nebularix', level: 18 },
    palette: { primary: 0x5a3a8a, secondary: 0x9a5af2, accent: 0xf25aa8 },
    desc: 'A tiny shadow kitten with glowing purple starlight eyes.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'nebularix', name: 'Nebularix', type: 'Umbra', stage: 'Adept', archetype: 'beast',
    base: stats(83, 28, 23, 17, 23, 22), growth: stats(9.1, 3.2, 3.1, 2.3, 3.0, 2.8),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 25, tech: 'void_fang' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x3a1a6a, secondary: 0x7a3ad0, accent: 0xd94a8a },
    desc: 'A shadow fox whose tail is a tearing void rift in space.', captureBase: 0.25, scale: 1.25 }),
  S({ id: 'vampbat', name: 'Vampbat', type: 'Umbra', stage: 'Novice', archetype: 'avian',
    base: stats(31, 16, 10, 7, 13, 11), growth: stats(5.2, 2.7, 2.1, 1.5, 2.7, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'nosferatus', level: 18 },
    palette: { primary: 0x3a2a5a, secondary: 0x6a4a9a, accent: 0xe85a9a },
    desc: 'A purple cave bat wreathed in shadow-sparks.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'nosferatus', name: 'Nosferatus', type: 'Umbra', stage: 'Elite', archetype: 'avian',
    base: stats(81, 29, 22, 16, 25, 23), growth: stats(8.7, 3.3, 2.9, 2.1, 3.2, 3.0),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 25, tech: 'void_fang' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x221442, secondary: 0x5a3a8a, accent: 0xff00ff },
    desc: 'An gargoyle with wings crackling with dark violet energy.', captureBase: 0.25, scale: 1.35 }),
  S({ id: 'gravemini', name: 'Gravemini', type: 'Umbra', stage: 'Novice', archetype: 'brute',
    base: stats(38, 12, 10, 13, 7, 9), growth: stats(6.5, 2.1, 2.1, 2.6, 1.4, 2.0),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'gravemonolith', level: 18 },
    palette: { primary: 0x44405a, secondary: 0x6a648a, accent: 0xc4b46a },
    desc: 'A small living statue made of runic dark stone.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'gravemonolith', name: 'Gravemonolith', type: 'Umbra', stage: 'Elite', archetype: 'brute',
    base: stats(88, 25, 22, 25, 12, 20), growth: stats(10.0, 2.8, 3.0, 3.2, 1.8, 2.8),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 25, tech: 'void_fang' }, { level: 35, tech: 'eclipse_requiem' }],
    palette: { primary: 0x2e2a3a, secondary: 0x565070, accent: 0x9a5af2 },
    desc: 'A giant monolith guardian covered in glowing purple runes.', captureBase: 0.25, scale: 1.45 }),

  // ===== BLAZE 4-STAGE LINES =====
  // 1. Salamander Line (Serpent, Fire/Rock)
  S({ id: 'flamesal', name: 'Flamesal', type: 'Blaze', stage: 'Novice', archetype: 'serpent',
    base: stats(34, 14, 10, 8, 10, 8), growth: stats(5.8, 2.4, 2.2, 1.6, 2.0, 1.8),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'emberskink', level: 12 },
    palette: { primary: 0xd9542e, secondary: 0xf2a13a, accent: 0xfff0c8 },
    desc: 'A small volcanic skink that hides in hot cinders.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'emberskink', name: 'Emberskink', type: 'Blaze', stage: 'Adept', archetype: 'serpent',
    base: stats(60, 20, 18, 14, 18, 15), growth: stats(7.8, 2.8, 2.8, 2.0, 2.4, 2.2),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 14, tech: 'cinder_lash' }, { level: 18, tech: 'inferno_maw' }],
    evolvesTo: { species: 'lavaserpent', level: 22 },
    palette: { primary: 0xc4401e, secondary: 0xf2803a, accent: 0xffd28a },
    desc: 'A larger skink wreathed in orange ember scales.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'lavaserpent', name: 'Lavaserpent', type: 'Blaze', stage: 'Elite', archetype: 'serpent',
    base: stats(92, 30, 28, 22, 26, 22), growth: stats(9.8, 3.4, 3.4, 2.6, 3.0, 2.8),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'inferno_maw' }, { level: 24, tech: 'flame_burst' }, { level: 30, tech: 'sun_cataclysm' }],
    evolvesTo: { species: 'magmadrak', level: 32 },
    palette: { primary: 0xa83218, secondary: 0xf2603a, accent: 0xffe08a },
    desc: 'A long lava serpent with glowing black basalt plates.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'magmadrak', name: 'Magmadrak', type: 'Blaze', stage: 'Apex', archetype: 'serpent',
    base: stats(155, 52, 50, 38, 48, 42), growth: stats(12.5, 4.4, 4.4, 3.4, 4.0, 3.6),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 32, tech: 'sol_eruption' }],
    palette: { primary: 0x8a2410, secondary: 0xf2433a, accent: 0xffd24e },
    desc: 'A giant red-obsidian dragon-serpent wreathed in point lights.', captureBase: 0, scale: 1.8 }),

  // 2. Coalbug Line (Shell, Fire/Dark)
  S({ id: 'coalbug', name: 'Coalbug', type: 'Blaze', stage: 'Novice', archetype: 'shell',
    base: stats(36, 12, 11, 10, 8, 7), growth: stats(6.0, 2.1, 2.3, 2.0, 1.7, 1.5),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'cinderscarab', level: 12 },
    palette: { primary: 0x2e1a14, secondary: 0xff7a2a, accent: 0x101018 },
    desc: 'A small black beetle with a single burning horn.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'cinderscarab', name: 'Cinderscarab', type: 'Blaze', stage: 'Adept', archetype: 'shell',
    base: stats(62, 18, 19, 16, 15, 12), growth: stats(8.0, 2.5, 2.9, 2.4, 2.1, 1.9),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 14, tech: 'cinder_lash' }],
    evolvesTo: { species: 'pyroshell', level: 22 },
    palette: { primary: 0x241410, secondary: 0xe85a2a, accent: 0x1c1018 },
    desc: 'A larger beetle with glowing charcoal wingcases.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'pyroshell', name: 'Pyroshell', type: 'Blaze', stage: 'Elite', archetype: 'shell',
    base: stats(94, 27, 29, 24, 22, 19), growth: stats(10.0, 3.1, 3.5, 3.0, 2.7, 2.5),
    techs: [{ level: 1, tech: 'cinder_lash' }, { level: 1, tech: 'inferno_maw' }, { level: 24, tech: 'sun_cataclysm' }],
    evolvesTo: { species: 'coalossus', level: 32 },
    palette: { primary: 0x1c0e0a, secondary: 0xd93a10, accent: 0x2c1020 },
    desc: 'An armored scarab wreathed in floating embers.', captureBase: 0.18, scale: 1.3 }),
  S({ id: 'coalossus', name: 'Coalossus', type: 'Blaze', stage: 'Apex', archetype: 'brute',
    base: stats(160, 48, 52, 40, 40, 36), growth: stats(13.0, 4.0, 4.6, 3.6, 3.6, 3.2),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 32, tech: 'sol_eruption' }],
    palette: { primary: 0x140604, secondary: 0xa82e08, accent: 0x3c1830 },
    desc: 'A massive brute-beetle with a molten iron furnace body.', captureBase: 0, scale: 1.8 }),

  // 3. Firefly Line (Sprite, Fire/Light)
  S({ id: 'flarefly', name: 'Flarefly', type: 'Blaze', stage: 'Novice', archetype: 'sprite',
    base: stats(32, 16, 9, 8, 12, 10), growth: stats(5.5, 2.8, 1.9, 1.7, 2.5, 2.2),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 8, tech: 'flame_burst' }],
    evolvesTo: { species: 'sparkwing', level: 12 },
    palette: { primary: 0xffd24e, secondary: 0xfff0a8, accent: 0xffffff },
    desc: 'A floating glowing bug with tiny flame wings.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'sparkwing', name: 'Sparkwing', type: 'Blaze', stage: 'Adept', archetype: 'sprite',
    base: stats(58, 22, 17, 14, 20, 17), growth: stats(7.5, 3.2, 2.5, 2.1, 2.9, 2.6),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 1, tech: 'flame_burst' }, { level: 14, tech: 'blaze_rally' }],
    evolvesTo: { species: 'lumiprix', level: 22 },
    palette: { primary: 0xffc43a, secondary: 0xffe88a, accent: 0xffffff },
    desc: 'A sprite with two sets of glowing wings and a stardust halo.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'lumiprix', name: 'Lumiprix', type: 'Blaze', stage: 'Elite', archetype: 'sprite',
    base: stats(90, 32, 27, 22, 28, 24), growth: stats(9.5, 3.8, 3.1, 2.7, 3.5, 3.2),
    techs: [{ level: 1, tech: 'flame_burst' }, { level: 1, tech: 'blaze_rally' }, { level: 24, tech: 'sun_cataclysm' }],
    evolvesTo: { species: 'aurorafire', level: 32 },
    palette: { primary: 0xffb02a, secondary: 0xffd86a, accent: 0xfff8d8 },
    desc: 'A light sprite surrounded by orbiting fireflies.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'aurorafire', name: 'Aurorafire', type: 'Blaze', stage: 'Apex', archetype: 'sprite',
    base: stats(150, 56, 48, 36, 52, 44), growth: stats(12.0, 4.6, 4.0, 3.2, 4.5, 3.9),
    techs: [{ level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'aether_flare' }, { level: 32, tech: 'sol_eruption' }],
    palette: { primary: 0xff9a1a, secondary: 0xffc44a, accent: 0xfffbe0 },
    desc: 'A magnificent angelic flame sprite with additive wings.', captureBase: 0, scale: 1.75 }),

  // ===== TIDE 4-STAGE LINES =====
  // 1. Wavepup Line (Beast, Water/Space)
  S({ id: 'wavepup', name: 'Wavepup', type: 'Tide', stage: 'Novice', archetype: 'beast',
    base: stats(35, 15, 11, 8, 11, 9), growth: stats(6.0, 2.5, 2.3, 1.8, 2.3, 2.0),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'tidehound', level: 12 },
    palette: { primary: 0x3a8dd9, secondary: 0x6ec4f2, accent: 0xd8f2ff },
    desc: 'A blue puppy with water-droplet ears.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'tidehound', name: 'Tidehound', type: 'Tide', stage: 'Adept', archetype: 'beast',
    base: stats(61, 21, 19, 14, 19, 16), growth: stats(8.0, 2.9, 2.9, 2.4, 2.7, 2.4),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 14, tech: 'mist_veil' }],
    evolvesTo: { species: 'oceanclysm', level: 22 },
    palette: { primary: 0x2a6dc4, secondary: 0x5ab8e8, accent: 0xc8ecff },
    desc: 'A sleek wolf wreathed in aquamarine bubbles.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'oceanclysm', name: 'Oceanclysm', type: 'Tide', stage: 'Elite', archetype: 'beast',
    base: stats(93, 31, 29, 22, 27, 23), growth: stats(10.0, 3.5, 3.5, 3.0, 3.3, 3.0),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'tidal_crush' }, { level: 24, tech: 'abyss_maelstrom' }],
    evolvesTo: { species: 'abysshound', level: 32 },
    palette: { primary: 0x1a4da8, secondary: 0x3a9df2, accent: 0xa8e0ff },
    desc: 'A large beast with ocean-wave mane and back ridges.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'abysshound', name: 'Abysshound', type: 'Tide', stage: 'Apex', archetype: 'beast',
    base: stats(156, 53, 51, 38, 49, 43), growth: stats(12.7, 4.5, 4.5, 3.5, 4.1, 3.7),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 32, tech: 'deluge_tempest' }],
    palette: { primary: 0x102e7a, secondary: 0x2a7dd9, accent: 0x8ad4ff },
    desc: 'A dark oceanic leviathan beast with bio-luminescent marks.', captureBase: 0, scale: 1.8 }),

  // 2. Jellyfish Line (Sprite, Water/Electric)
  S({ id: 'jellymote', name: 'Jellymote', type: 'Tide', stage: 'Novice', archetype: 'sprite',
    base: stats(33, 17, 8, 9, 12, 11), growth: stats(5.6, 3.0, 1.8, 1.9, 2.6, 2.4),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'aquajelly', level: 12 },
    palette: { primary: 0xaccfe2, secondary: 0x9adff2, accent: 0xffffff },
    desc: 'A small floating jellyfish with soft glowing tentacles.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'aquajelly', name: 'Aquajelly', type: 'Tide', stage: 'Adept', archetype: 'sprite',
    base: stats(59, 23, 16, 15, 20, 18), growth: stats(7.6, 3.4, 2.4, 2.3, 3.0, 2.8),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 14, tech: 'mist_veil' }],
    evolvesTo: { species: 'voltmedusa', level: 22 },
    palette: { primary: 0x8ab8d9, secondary: 0x7adfd0, accent: 0xe8f4ff },
    desc: 'A larger jelly wreathed in static blue current.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'voltmedusa', name: 'Voltmedusa', type: 'Tide', stage: 'Elite', archetype: 'sprite',
    base: stats(91, 33, 26, 23, 28, 25), growth: stats(9.6, 4.0, 3.0, 2.9, 3.6, 3.4),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 24, tech: 'spring_mend' }],
    evolvesTo: { species: 'abysssiren', level: 32 },
    palette: { primary: 0x6a9ac4, secondary: 0x5acfc0, accent: 0xc8ecff },
    desc: 'A lightning jelly emitting electric arcs.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'abysssiren', name: 'Abysssiren', type: 'Tide', stage: 'Apex', archetype: 'sprite',
    base: stats(152, 58, 48, 38, 52, 46), growth: stats(12.0, 4.8, 3.9, 3.4, 4.6, 4.1),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'spring_mend' }, { level: 32, tech: 'deluge_tempest' }],
    palette: { primary: 0x4a7aa8, secondary: 0x3a8dd9, accent: 0xa8d0e8 },
    desc: 'A cosmic water-medusa wreathed in glowing tentacles.', captureBase: 0, scale: 1.75 }),

  // 3. Turtle Line (Shell, Water/Rock)
  S({ id: 'seaturt', name: 'Seaturt', type: 'Tide', stage: 'Novice', archetype: 'shell',
    base: stats(38, 12, 10, 13, 6, 9), growth: stats(6.4, 2.2, 2.0, 2.6, 1.1, 2.0),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 8, tech: 'rip_current' }],
    evolvesTo: { species: 'reefscale', level: 12 },
    palette: { primary: 0x5a8ab8, secondary: 0xaccfe2, accent: 0xffffff },
    desc: 'A green sea turtle with a rocky shell.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'reefscale', name: 'Reefscale', type: 'Tide', stage: 'Adept', archetype: 'shell',
    base: stats(64, 18, 18, 19, 11, 15), growth: stats(8.4, 2.6, 2.6, 3.0, 1.7, 2.4),
    techs: [{ level: 1, tech: 'bubble_jet' }, { level: 1, tech: 'rip_current' }, { level: 14, tech: 'mist_veil' }],
    evolvesTo: { species: 'pearlshield', level: 22 },
    palette: { primary: 0x4a7aa8, secondary: 0x8ac0e8, accent: 0xe8f4ff },
    desc: 'A sea turtle with a colorful coral shell.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'pearlshield', name: 'Pearlshield', type: 'Tide', stage: 'Elite', archetype: 'shell',
    base: stats(96, 27, 28, 27, 18, 22), growth: stats(10.4, 3.2, 3.2, 3.6, 2.3, 3.0),
    techs: [{ level: 1, tech: 'rip_current' }, { level: 1, tech: 'tidal_crush' }, { level: 24, tech: 'spring_mend' }],
    evolvesTo: { species: 'oceantitan', level: 32 },
    palette: { primary: 0x3a6a9a, secondary: 0x6a9ac4, accent: 0xc8ecff },
    desc: 'A turtle carrying a pearl-encrusted shield dome.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'oceantitan', name: 'Oceantitan', type: 'Tide', stage: 'Apex', archetype: 'shell',
    base: stats(158, 48, 50, 42, 32, 40), growth: stats(13.2, 4.0, 4.2, 4.2, 3.0, 3.8),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 32, tech: 'deluge_tempest' }],
    palette: { primary: 0x2a5a8a, secondary: 0x4a7aa8, accent: 0xa8c8e8 },
    desc: 'A massive titan turtle with a reef forest growing on its back.', captureBase: 0, scale: 1.85 }),

  // ===== VERDANT 4-STAGE LINES =====
  // 1. Deer Line (Beast, Nature/Light)
  S({ id: 'leaffawn', name: 'Leaffawn', type: 'Verdant', stage: 'Novice', archetype: 'beast',
    base: stats(35, 14, 11, 8, 12, 9), growth: stats(6.0, 2.4, 2.3, 1.7, 2.5, 2.0),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'sylvadeer', level: 12 },
    palette: { primary: 0x4ea84e, secondary: 0x8ad95a, accent: 0xf2e08a },
    desc: 'A tiny fawn with leaves for ears and branches starting to bud.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'sylvadeer', name: 'Sylvadeer', type: 'Verdant', stage: 'Adept', archetype: 'beast',
    base: stats(61, 20, 19, 14, 20, 15), growth: stats(8.0, 2.8, 2.9, 2.3, 2.9, 2.4),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 14, tech: 'sap_drain' }],
    evolvesTo: { species: 'thornstag', level: 22 },
    palette: { primary: 0x3a8a3a, secondary: 0x6ec45e, accent: 0xd9b85a },
    desc: 'A deer with growing branch horns and leaf patterns.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'thornstag', name: 'Thornstag', type: 'Verdant', stage: 'Elite', archetype: 'beast',
    base: stats(93, 30, 29, 22, 28, 22), growth: stats(10.0, 3.4, 3.5, 2.9, 3.5, 3.0),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'bramble_cage' }, { level: 24, tech: 'elder_wrath' }],
    evolvesTo: { species: 'solarstag', level: 32 },
    palette: { primary: 0x2a6e2a, secondary: 0x5aa84e, accent: 0xc4a13a },
    desc: 'A magnificent stag with briar antlers.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'solarstag', name: 'Solarstag', type: 'Verdant', stage: 'Apex', archetype: 'beast',
    base: stats(156, 52, 51, 38, 52, 42), growth: stats(12.7, 4.4, 4.5, 3.5, 4.5, 3.8),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 32, tech: 'nature_judgment' }],
    palette: { primary: 0x1a4e1a, secondary: 0x4e9a3a, accent: 0xffd700 },
    desc: 'A forest god stag with golden sunburst antlers.', captureBase: 0, scale: 1.8 }),

  // 2. Snapdragon Line (Serpent, Nature/Dark)
  S({ id: 'snapsprout', name: 'Snapsprout', type: 'Verdant', stage: 'Novice', archetype: 'serpent',
    base: stats(34, 15, 10, 9, 9, 11), growth: stats(5.8, 2.5, 2.2, 1.8, 1.9, 2.4),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'snaporchid', level: 12 },
    palette: { primary: 0x4ea84e, secondary: 0xc46a8a, accent: 0x101018 },
    desc: 'A tiny plant serpent that looks like a flower bud.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'snaporchid', name: 'Snaporchid', type: 'Verdant', stage: 'Adept', archetype: 'serpent',
    base: stats(60, 21, 18, 15, 15, 19), growth: stats(7.8, 2.9, 2.8, 2.4, 2.3, 2.8),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 14, tech: 'sap_drain' }],
    evolvesTo: { species: 'brambleviper', level: 22 },
    palette: { primary: 0x3a8a3a, secondary: 0xa84a6a, accent: 0x1c1018 },
    desc: 'A serpent wreathed in blooming orchid petals.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'brambleviper', name: 'Brambleviper', type: 'Verdant', stage: 'Elite', archetype: 'serpent',
    base: stats(92, 31, 28, 23, 23, 27), growth: stats(9.8, 3.5, 3.4, 3.0, 2.9, 3.4),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'bramble_cage' }, { level: 24, tech: 'elder_wrath' }],
    evolvesTo: { species: 'rotwyrm', level: 32 },
    palette: { primary: 0x2a6e2a, secondary: 0x8a3a58, accent: 0x2c1020 },
    desc: 'A thorny plant viper with glowing toxic fangs.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'rotwyrm', name: 'Rotwyrm', type: 'Verdant', stage: 'Apex', archetype: 'serpent',
    base: stats(155, 53, 50, 39, 39, 47), growth: stats(12.5, 4.5, 4.4, 3.6, 3.5, 4.3),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 32, tech: 'nature_judgment' }],
    palette: { primary: 0x1a4e1a, secondary: 0x5a2a3a, accent: 0x3c1830 },
    desc: 'A woodland dragon wreathed in decaying dark spores.', captureBase: 0, scale: 1.8 }),

  // 3. Woodbird Line (Avian, Nature/Space)
  S({ id: 'barkchick', name: 'Barkchick', type: 'Verdant', stage: 'Novice', archetype: 'avian',
    base: stats(32, 16, 10, 10, 9, 9), growth: stats(5.5, 2.8, 2.1, 2.2, 1.8, 1.8),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 8, tech: 'thorn_whip' }],
    evolvesTo: { species: 'sylvawing', level: 12 },
    palette: { primary: 0x4ea84e, secondary: 0x8a7a5a, accent: 0xffffff },
    desc: 'A small chick with wooden feather shields.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'sylvawing', name: 'Sylvawing', type: 'Verdant', stage: 'Adept', archetype: 'avian',
    base: stats(58, 22, 18, 18, 15, 15), growth: stats(7.5, 3.2, 2.7, 2.8, 2.2, 2.2),
    techs: [{ level: 1, tech: 'seed_shot' }, { level: 1, tech: 'thorn_whip' }, { level: 14, tech: 'bramble_cage' }],
    evolvesTo: { species: 'forestglide', level: 22 },
    palette: { primary: 0x3a8a3a, secondary: 0x6a5a3a, accent: 0xffffff },
    desc: 'A green forest glider with leafy wing membranes.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'forestglide', name: 'Forestglide', type: 'Verdant', stage: 'Elite', archetype: 'avian',
    base: stats(90, 32, 28, 28, 23, 23), growth: stats(9.5, 3.8, 3.3, 3.4, 2.8, 2.8),
    techs: [{ level: 1, tech: 'thorn_whip' }, { level: 1, tech: 'bramble_cage' }, { level: 24, tech: 'elder_wrath' }],
    evolvesTo: { species: 'canopyhawk', level: 32 },
    palette: { primary: 0x2a6e2a, secondary: 0x4a3a1a, accent: 0xffffff },
    desc: 'A larger falcon wreathed in autumn leaves.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'canopyhawk', name: 'Canopyhawk', type: 'Verdant', stage: 'Apex', archetype: 'avian',
    base: stats(150, 56, 50, 50, 39, 39), growth: stats(12.0, 4.6, 4.2, 4.2, 3.4, 3.4),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 32, tech: 'nature_judgment' }],
    palette: { primary: 0x1a4e1a, secondary: 0x3a2a0a, accent: 0xffe9a8 },
    desc: 'A giant avian whose wings resemble a forest canopy.', captureBase: 0, scale: 1.75 }),

  // ===== VOLT 4-STAGE LINES =====
  // 1. Sheep Line (Beast, Electric/Nature)
  S({ id: 'shocklamb', name: 'Shocklamb', type: 'Volt', stage: 'Novice', archetype: 'beast',
    base: stats(36, 14, 11, 7, 11, 9), growth: stats(6.1, 2.4, 2.3, 1.4, 2.5, 2.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'voltram', level: 12 },
    palette: { primary: 0xf2d23a, secondary: 0xffffff, accent: 0x4ec45e },
    desc: 'A fluffy white lamb whose fleece holds static charge.', captureBase: 0.5, scale: 0.75 }),
  S({ id: 'voltram', name: 'Voltram', type: 'Volt', stage: 'Adept', archetype: 'beast',
    base: stats(62, 20, 19, 13, 19, 15), growth: stats(8.1, 2.8, 2.9, 1.8, 2.9, 2.4),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 14, tech: 'voltage_boost' }],
    evolvesTo: { species: 'stormhorn', level: 22 },
    palette: { primary: 0xd9c43a, secondary: 0xe8e8e8, accent: 0x3a8a3a },
    desc: 'A ram with copper horns and crackling wool.', captureBase: 0.35, scale: 1.05 }),
  S({ id: 'stormhorn', name: 'Stormhorn', type: 'Volt', stage: 'Elite', archetype: 'beast',
    base: stats(94, 30, 29, 21, 27, 21), growth: stats(10.1, 3.4, 3.5, 2.4, 3.5, 3.0),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'storm_lance' }, { level: 24, tech: 'thunder_dominion' }],
    evolvesTo: { species: 'fulguram', level: 32 },
    palette: { primary: 0xc4ae2a, secondary: 0xd8d8d8, accent: 0x2a6e2a },
    desc: 'A large ram with golden horns generating lightning.', captureBase: 0.18, scale: 1.4 }),
  S({ id: 'fulguram', name: 'Fulguram', type: 'Volt', stage: 'Apex', archetype: 'beast',
    base: stats(158, 52, 51, 35, 49, 39), growth: stats(13.0, 4.4, 4.5, 3.0, 4.5, 3.6),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 32, tech: 'volt_singularity' }],
    palette: { primary: 0x8a7510, secondary: 0xb8b8b8, accent: 0x1a4e1a },
    desc: 'A storm sheep with active lightning clouds surrounding its body.', captureBase: 0, scale: 1.85 }),

  // 2. Sparkbird Line (Avian, Electric/Space)
  S({ id: 'sparksparrow', name: 'Sparksparrow', type: 'Volt', stage: 'Novice', archetype: 'avian',
    base: stats(30, 18, 10, 6, 14, 10), growth: stats(5.0, 3.0, 2.1, 1.3, 3.0, 2.2),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'teslafalcon', level: 12 },
    palette: { primary: 0xf2d23a, secondary: 0x7adfd0, accent: 0xffffff },
    desc: 'A tiny yellow sparrow that shoots spark motes.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'teslafalcon', name: 'Teslafalcon', type: 'Volt', stage: 'Adept', archetype: 'avian',
    base: stats(56, 24, 18, 12, 22, 16), growth: stats(7.0, 3.4, 2.7, 1.7, 3.4, 2.6),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 14, tech: 'voltage_boost' }],
    evolvesTo: { species: 'galvanicstrike', level: 22 },
    palette: { primary: 0xd9c43a, secondary: 0x5acfc0, accent: 0xffffff },
    desc: 'A falcon with copper antennas and electric wings.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'galvanicstrike', name: 'Galvanicstrike', type: 'Volt', stage: 'Elite', archetype: 'avian',
    base: stats(88, 34, 28, 18, 30, 22), growth: stats(9.0, 4.0, 3.3, 2.3, 4.0, 3.2),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'storm_lance' }, { level: 24, tech: 'thunder_dominion' }],
    evolvesTo: { species: 'stormapex', level: 32 },
    palette: { primary: 0xc4ae2a, secondary: 0x3a8dd9, accent: 0xffffff },
    desc: 'A sleek hawk leaving electrical trails.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'stormapex', name: 'Stormapex', type: 'Volt', stage: 'Apex', archetype: 'avian',
    base: stats(150, 58, 50, 32, 52, 40), growth: stats(12.0, 4.8, 4.2, 2.9, 5.0, 3.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 32, tech: 'volt_singularity' }],
    palette: { primary: 0x8a7510, secondary: 0x2a6dc4, accent: 0xfff0c8 },
    desc: 'A thunder bird with wings of raw lightning bolts.', captureBase: 0, scale: 1.75 }),

  // 3. Crab Line (Shell, Electric/Rock)
  S({ id: 'voltcrab', name: 'Voltcrab', type: 'Volt', stage: 'Novice', archetype: 'shell',
    base: stats(38, 13, 9, 13, 7, 9), growth: stats(6.4, 2.3, 1.9, 2.6, 1.3, 2.0),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 8, tech: 'arc_bolt' }],
    evolvesTo: { species: 'staticclaw', level: 12 },
    palette: { primary: 0xf2d23a, secondary: 0xb0865a, accent: 0xffffff },
    desc: 'A small yellow rock crab with static claws.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'staticclaw', name: 'Staticclaw', type: 'Volt', stage: 'Adept', archetype: 'shell',
    base: stats(64, 19, 17, 19, 13, 15), growth: stats(8.4, 2.7, 2.5, 3.0, 1.9, 2.4),
    techs: [{ level: 1, tech: 'static_jab' }, { level: 1, tech: 'arc_bolt' }, { level: 14, tech: 'voltage_boost' }],
    evolvesTo: { species: 'teslashell', level: 22 },
    palette: { primary: 0xd9c43a, secondary: 0x9a754e, accent: 0xe8e8e8 },
    desc: 'A crab with electric-charged pincers.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'teslashell', name: 'Teslashell', type: 'Volt', stage: 'Elite', archetype: 'shell',
    base: stats(96, 28, 27, 27, 20, 21), growth: stats(10.4, 3.3, 3.1, 3.6, 2.5, 3.0),
    techs: [{ level: 1, tech: 'arc_bolt' }, { level: 1, tech: 'storm_lance' }, { level: 24, tech: 'thunder_dominion' }],
    evolvesTo: { species: 'stormgoliath', level: 32 },
    palette: { primary: 0xc4ae2a, secondary: 0x8a6442, accent: 0xd8d8d8 },
    desc: 'A crab with copper coils integrated into its rock shell.', captureBase: 0.18, scale: 1.3 }),
  S({ id: 'stormgoliath', name: 'Stormgoliath', type: 'Volt', stage: 'Apex', archetype: 'shell',
    base: stats(160, 48, 48, 42, 34, 38), growth: stats(13.2, 4.0, 4.0, 4.2, 3.2, 3.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 32, tech: 'volt_singularity' }],
    palette: { primary: 0x8a7510, secondary: 0x6a4e2e, accent: 0xb8b8b8 },
    desc: 'A giant stone tank crab covered in high-voltage arcs.', captureBase: 0, scale: 1.8 }),

  // ===== GALE 4-STAGE LINES =====
  // 1. Spacedog Line (Beast, Space/Electric)
  S({ id: 'spacepup', name: 'Spacepup', type: 'Gale', stage: 'Novice', archetype: 'beast',
    base: stats(34, 15, 10, 8, 12, 9), growth: stats(5.7, 2.6, 2.1, 1.7, 2.6, 2.0),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'cosmichound', level: 12 },
    palette: { primary: 0x5ac4b8, secondary: 0xa8e8e0, accent: 0xf2d23a },
    desc: 'A stardust puppy with glowing starlight eyes.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'cosmichound', name: 'Cosmichound', type: 'Gale', stage: 'Adept', archetype: 'beast',
    base: stats(60, 21, 18, 14, 20, 15), growth: stats(7.7, 3.0, 2.7, 2.3, 3.2, 2.4),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 14, tech: 'tailwind' }],
    evolvesTo: { species: 'stellarwolf', level: 22 },
    palette: { primary: 0x3aa89a, secondary: 0x7adfd0, accent: 0xd9c43a },
    desc: 'A cosmic wolf with paws of stardust.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'stellarwolf', name: 'Stellarwolf', type: 'Gale', stage: 'Elite', archetype: 'beast',
    base: stats(92, 31, 28, 22, 28, 21), growth: stats(9.7, 3.6, 3.3, 2.9, 4.0, 3.0),
    techs: [{ level: 1, tech: 'dive_talon' }, { level: 1, tech: 'razor_cyclone' }, { level: 24, tech: 'sky_sunder' }],
    evolvesTo: { species: 'nebulamort', level: 32 },
    palette: { primary: 0x2a8a7a, secondary: 0x5acfc0, accent: 0xc4ae2a },
    desc: 'A wolf wreathed in a spinning planetary ring.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'nebulamort', name: 'Nebulamort', type: 'Gale', stage: 'Apex', archetype: 'beast',
    base: stats(155, 53, 50, 38, 50, 38), growth: stats(12.5, 4.4, 4.3, 3.5, 5.0, 3.6),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 32, tech: 'tempest_gale' }],
    palette: { primary: 0x1a6e60, secondary: 0x4ec4b0, accent: 0x8a7510 },
    desc: 'A giant wolf wreathed in an active purple nebula shroud.', captureBase: 0, scale: 1.8 }),

  // 2. Owl Line (Avian, Space/Light)
  S({ id: 'starowlet', name: 'Starowlet', type: 'Gale', stage: 'Novice', archetype: 'avian',
    base: stats(31, 16, 9, 7, 13, 10), growth: stats(5.2, 2.7, 1.9, 1.5, 2.9, 2.2),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'astralowl', level: 12 },
    palette: { primary: 0x8ad0c8, secondary: 0xc8f0e8, accent: 0xfff8d8 },
    desc: 'A small owl wreathed in stardust.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'astralowl', name: 'Astralowl', type: 'Gale', stage: 'Adept', archetype: 'avian',
    base: stats(57, 22, 17, 13, 21, 17), growth: stats(7.2, 3.1, 2.5, 2.1, 3.5, 2.6),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 14, tech: 'tailwind' }],
    evolvesTo: { species: 'cosmoswing', level: 22 },
    palette: { primary: 0x6ac4b8, secondary: 0xa8e8e0, accent: 0xfff0c8 },
    desc: 'An owl with constellation patterns on its wings.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'cosmoswing', name: 'Cosmoswing', type: 'Gale', stage: 'Elite', archetype: 'avian',
    base: stats(89, 32, 27, 21, 29, 24), growth: stats(9.2, 3.7, 3.1, 2.7, 4.1, 3.2),
    techs: [{ level: 1, tech: 'dive_talon' }, { level: 1, tech: 'razor_cyclone' }, { level: 24, tech: 'sky_sunder' }],
    evolvesTo: { species: 'galaxia', level: 32 },
    palette: { primary: 0x4ea89a, secondary: 0x7adfd0, accent: 0xffe0a8 },
    desc: 'A cosmic owl with wings of starlight.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'galaxia', name: 'Galaxia', type: 'Gale', stage: 'Apex', archetype: 'avian',
    base: stats(150, 56, 48, 36, 52, 42), growth: stats(12.0, 4.6, 4.0, 3.2, 5.0, 3.8),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 32, tech: 'tempest_gale' }],
    palette: { primary: 0x2a8a7a, secondary: 0x5acfc0, accent: 0xffd24e },
    desc: 'A celestial owl with galaxy spirals orbiting its wings.', captureBase: 0, scale: 1.75 }),

  // 3. Nebula Serpent Line (Serpent, Space/Dark)
  S({ id: 'nebwyrm', name: 'Nebwyrm', type: 'Gale', stage: 'Novice', archetype: 'serpent',
    base: stats(35, 17, 9, 8, 11, 11), growth: stats(5.9, 2.9, 1.9, 1.7, 2.4, 2.4),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 8, tech: 'dive_talon' }],
    evolvesTo: { species: 'voidwyrm', level: 12 },
    palette: { primary: 0xaccfe2, secondary: 0x3a8dd9, accent: 0x9a5af2 },
    desc: 'A tiny space serpent trailing twilight mist.', captureBase: 0.5, scale: 0.75 }),
  S({ id: 'voidwyrm', name: 'Voidwyrm', type: 'Gale', stage: 'Adept', archetype: 'serpent',
    base: stats(61, 23, 17, 14, 19, 19), growth: stats(7.9, 3.3, 2.5, 2.3, 3.0, 3.0),
    techs: [{ level: 1, tech: 'gust_cut' }, { level: 1, tech: 'dive_talon' }, { level: 14, tech: 'tailwind' }],
    evolvesTo: { species: 'riftserpent', level: 22 },
    palette: { primary: 0x8ab0d9, secondary: 0x2a6dc4, accent: 0x7a3ad0 },
    desc: 'A snake wreathed in dark violet space rifts.', captureBase: 0.35, scale: 1.05 }),
  S({ id: 'riftserpent', name: 'Riftserpent', type: 'Gale', stage: 'Elite', archetype: 'serpent',
    base: stats(93, 33, 27, 22, 27, 27), growth: stats(9.9, 3.9, 3.1, 2.9, 3.6, 3.6),
    techs: [{ level: 1, tech: 'dive_talon' }, { level: 1, tech: 'razor_cyclone' }, { level: 24, tech: 'sky_sunder' }],
    evolvesTo: { species: 'cosmoclysm', level: 32 },
    palette: { primary: 0x6a9ac4, secondary: 0x1a4da8, accent: 0x5a1a9a },
    desc: 'A long serpent that tears space with its movement.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'cosmoclysm', name: 'Cosmoclysm', type: 'Gale', stage: 'Apex', archetype: 'serpent',
    base: stats(158, 56, 48, 38, 49, 49), growth: stats(12.7, 4.8, 4.0, 3.5, 4.5, 4.5),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 32, tech: 'tempest_gale' }],
    palette: { primary: 0x4a7aa8, secondary: 0x102e7a, accent: 0x3a1a6a },
    desc: 'A massive cosmic dragon wreathed in orbiting planetoids.', captureBase: 0, scale: 1.85 }),

  // ===== UMBRA 4-STAGE LINES =====
  // 1. Shadowbat Line (Avian, Dark/Space)
  S({ id: 'gloomwing', name: 'Gloomwing', type: 'Umbra', stage: 'Novice', archetype: 'avian',
    base: stats(32, 16, 10, 8, 12, 11), growth: stats(5.4, 2.7, 2.0, 1.7, 2.4, 2.4),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'shadowwing', level: 12 },
    palette: { primary: 0x4a3a6a, secondary: 0x8a7ab0, accent: 0x7adfd0 },
    desc: 'A tiny dark bat with shadow wings.', captureBase: 0.5, scale: 0.6 }),
  S({ id: 'shadowwing', name: 'Shadowwing', type: 'Umbra', stage: 'Adept', archetype: 'avian',
    base: stats(58, 22, 18, 14, 20, 19), growth: stats(7.4, 3.1, 2.6, 2.3, 3.0, 3.0),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 14, tech: 'umbral_drain' }],
    evolvesTo: { species: 'voidgoyle', level: 22 },
    palette: { primary: 0x3a2a5a, secondary: 0x7a5aa8, accent: 0x5acfc0 },
    desc: 'A larger bat wreathed in twilight sparks.', captureBase: 0.35, scale: 0.9 }),
  S({ id: 'voidgoyle', name: 'Voidgoyle', type: 'Umbra', stage: 'Elite', archetype: 'avian',
    base: stats(90, 32, 28, 22, 28, 27), growth: stats(9.4, 3.7, 3.2, 2.9, 3.6, 3.6),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'void_fang' }, { level: 24, tech: 'eclipse_requiem' }],
    evolvesTo: { species: 'apocalypsebat', level: 32 },
    palette: { primary: 0x2c1e4a, secondary: 0x6a4a9a, accent: 0x3a8dd9 },
    desc: 'A gargoyle with obsidian skin and shadow wings.', captureBase: 0.18, scale: 1.25 }),
  S({ id: 'apocalypsebat', name: 'Apocalypsebat', type: 'Umbra', stage: 'Apex', archetype: 'avian',
    base: stats(150, 56, 50, 38, 50, 49), growth: stats(12.0, 4.5, 4.1, 3.5, 4.5, 4.5),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 32, tech: 'void_extinction' }],
    palette: { primary: 0x221442, secondary: 0x5a3a8a, accent: 0x2a6dc4 },
    desc: 'A giant bat whose wings are black void rifts.', captureBase: 0, scale: 1.75 }),

  // 2. Cat Line (Beast, Dark/Ice)
  S({ id: 'duskkitty', name: 'Duskkitty', type: 'Umbra', stage: 'Novice', archetype: 'beast',
    base: stats(33, 15, 11, 8, 11, 10), growth: stats(5.6, 2.5, 2.3, 1.7, 2.4, 2.2),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'umbraknell', level: 12 },
    palette: { primary: 0x5a3a8a, secondary: 0x9a5af2, accent: 0x9adff2 },
    desc: 'A black kitten with glowing purple eyes.', captureBase: 0.5, scale: 0.65 }),
  S({ id: 'umbraknell', name: 'Umbraknell', type: 'Umbra', stage: 'Adept', archetype: 'beast',
    base: stats(59, 21, 19, 14, 19, 17), growth: stats(7.6, 2.9, 2.9, 2.3, 3.0, 2.8),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 14, tech: 'umbral_drain' }],
    evolvesTo: { species: 'shadowstalker', level: 22 },
    palette: { primary: 0x4a2a7a, secondary: 0x8a4ae0, accent: 0xaccfe2 },
    desc: 'A shadow panther with frosty claws.', captureBase: 0.35, scale: 0.95 }),
  S({ id: 'shadowstalker', name: 'Shadowstalker', type: 'Umbra', stage: 'Elite', archetype: 'beast',
    base: stats(91, 31, 29, 22, 27, 25), growth: stats(9.6, 3.5, 3.5, 2.9, 3.6, 3.4),
    techs: [{ level: 1, tech: 'gloom_ray' }, { level: 1, tech: 'void_fang' }, { level: 24, tech: 'eclipse_requiem' }],
    evolvesTo: { species: 'voidreaper', level: 32 },
    palette: { primary: 0x3a1a6a, secondary: 0x7a3ad0, accent: 0x3a8dd9 },
    desc: 'A sleek panther with icicles along its spine.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'voidreaper', name: 'Voidreaper', type: 'Umbra', stage: 'Apex', archetype: 'beast',
    base: stats(155, 53, 51, 38, 49, 45), growth: stats(12.5, 4.4, 4.4, 3.5, 4.5, 4.1),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 32, tech: 'void_extinction' }],
    palette: { primary: 0x2a1050, secondary: 0x6a2ac0, accent: 0x2a6dc4 },
    desc: 'A shadow beast wreathed in absolute cold and dark.', captureBase: 0, scale: 1.8 }),

  // 3. Tombstone Line (Brute, Dark/Rock)
  S({ id: 'crypttot', name: 'Crypttot', type: 'Umbra', stage: 'Novice', archetype: 'brute',
    base: stats(38, 12, 10, 13, 7, 9), growth: stats(6.5, 2.1, 2.1, 2.6, 1.4, 2.0),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 8, tech: 'gloom_ray' }],
    evolvesTo: { species: 'tombgolem', level: 12 },
    palette: { primary: 0x44405a, secondary: 0x6a648a, accent: 0xc4b46a },
    desc: 'A small gargoyle statue that recently came to life.', captureBase: 0.5, scale: 0.7 }),
  S({ id: 'tombgolem', name: 'Tombgolem', type: 'Umbra', stage: 'Adept', archetype: 'brute',
    base: stats(64, 18, 18, 19, 11, 15), growth: stats(8.5, 2.5, 2.7, 3.2, 1.8, 2.6),
    techs: [{ level: 1, tech: 'shade_nip' }, { level: 1, tech: 'gloom_ray' }, { level: 14, tech: 'umbral_drain' }],
    evolvesTo: { species: 'cairnwarden', level: 22 },
    palette: { primary: 0x36324a, secondary: 0x5a547a, accent: 0xd9c46a },
    desc: 'A runic stone golem carrying a stone slate.', captureBase: 0.35, scale: 1.0 }),
  S({ id: 'cairnwarden', name: 'Cairnwarden', type: 'Umbra', stage: 'Elite', archetype: 'brute',
    base: stats(96, 27, 28, 27, 18, 22), growth: stats(10.5, 3.1, 3.3, 3.8, 2.4, 3.2),
    techs: [{ level: 1, tech: 'dread_howl' }, { level: 1, tech: 'umbral_drain' }, { level: 24, tech: 'void_fang' }],
    evolvesTo: { species: 'obeliskarch', level: 32 },
    palette: { primary: 0x2e2a3a, secondary: 0x4a445a, accent: 0x9a5af2 },
    desc: 'A rock golem wreathed in floating gravestones.', captureBase: 0.18, scale: 1.35 }),
  S({ id: 'obeliskarch', name: 'Obeliskarch', type: 'Umbra', stage: 'Apex', archetype: 'brute',
    base: stats(158, 48, 50, 42, 32, 40), growth: stats(13.2, 4.0, 4.2, 4.2, 3.0, 3.8),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 32, tech: 'void_extinction' }],
    palette: { primary: 0x1e1a26, secondary: 0x36324a, accent: 0x9a5af2 },
    desc: 'A towering monolith brute inscribed with purple runes.', captureBase: 0, scale: 1.85 }),

  // ============================================================
  // HIGH-TIER ASCENSIONS — the evolution kinds beyond Apex:
  //   Split (branches into 2) → Special → Terra → Transcendence → Aether (boss).
  // The Split capstones (Solarex, Leviathorn, …) are tagged above; these are
  // the alternate Split branch + the four ascension forms per line. Reached at
  // Professor Alex's lab / the Terra Ascension Forge with catalyst items.
  // ============================================================

  // ---- BLAZE: Infernyx ↘ Magmaroth (split alt) ; Solarex → Heliarch → Pyrethon → Aurelflare → Solmageddon
  S({ id: 'magmaroth', name: 'Magmaroth', type: 'Blaze', stage: 'Split', archetype: 'brute',
    base: stats(282, 72, 86, 66, 40, 46), growth: stats(16, 4.6, 5.4, 4.2, 3.0, 3.4),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'eruption_strike' }, { level: 45, tech: 'sol_eruption' }],
    palette: { primary: 0x6a1e0e, secondary: 0xff5a1e, accent: 0x2a1410 },
    desc: 'Infernyx\'s other road — a mountain that learned to walk, its back a cracked caldera that never cools.', captureBase: 0, scale: 2.0 }),
  S({ id: 'heliarch', name: 'Heliarch', type: 'Blaze', stage: 'Special', archetype: 'beast',
    base: stats(302, 96, 100, 70, 60, 66), growth: stats(16, 5.4, 5.8, 4.2, 4.0, 4.2),
    techs: [{ level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'sol_eruption' }, { level: 1, tech: 'aether_flare' }],
    ascendsTo: { species: 'pyrethon', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0xff9a1e, secondary: 0xffe06a, accent: 0xffffff },
    desc: 'A solar lion ascended — its mane a corona, each stride scoring a line of dawn across the dark.', captureBase: 0, scale: 2.05 }),
  S({ id: 'pyrethon', name: 'Pyrethon', type: 'Blaze', stage: 'Terra', archetype: 'brute',
    base: stats(346, 106, 122, 86, 66, 76), growth: stats(18, 6.0, 6.6, 4.8, 4.4, 4.8),
    techs: [{ level: 1, tech: 'sol_eruption' }, { level: 1, tech: 'aether_flare' }, { level: 1, tech: 'supernova' }],
    ascendsTo: { species: 'aurelflare', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0xd23a1a, secondary: 0xffb43a, accent: 0xb0865a },
    desc: 'Re-forged in the world-furnaces of Terra City; living magma sheathed in plates of worldstone.', captureBase: 0, scale: 2.15 }),
  S({ id: 'aurelflare', name: 'Aurelflare', type: 'Blaze', stage: 'Transcendent', archetype: 'avian',
    base: stats(404, 120, 146, 100, 82, 92), growth: stats(20, 6.6, 7.4, 5.4, 5.2, 5.4),
    techs: [{ level: 1, tech: 'aether_flare' }, { level: 1, tech: 'supernova' }, { level: 1, tech: 'sol_annihilation' }],
    ascendsTo: { species: 'solmageddon', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0xff6a3a, secondary: 0xffd8a0, accent: 0xff9ad2 },
    desc: 'It has burned away everything that was not light. What remains is a phoenix of transcendent dawn.', captureBase: 0, scale: 2.0 }),
  S({ id: 'solmageddon', name: 'Solmageddon', type: 'Blaze', stage: 'Aether', archetype: 'brute', isBoss: true,
    base: stats(474, 136, 174, 120, 92, 106), growth: stats(22, 7.2, 8.4, 6.2, 5.8, 6.0),
    techs: [{ level: 1, tech: 'aether_flare' }, { level: 1, tech: 'supernova' }, { level: 1, tech: 'sol_annihilation' }],
    palette: { primary: 0xff3a1a, secondary: 0xffc83a, accent: 0xff9ad2 },
    desc: 'A walking apocalypse of fire — the death a star chooses when it refuses to fade quietly.', captureBase: 0, scale: 2.45 }),

  // ---- TIDE: Abyssarch ↘ Maelgheist ; Leviathorn → Tidewraith → Oceanarch → Abyssophar → Maremortis
  S({ id: 'maelgheist', name: 'Maelgheist', type: 'Tide', stage: 'Split', archetype: 'serpent',
    base: stats(266, 88, 70, 58, 56, 72), growth: stats(15, 5.2, 5.0, 4.0, 4.2, 5.0),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'abyssal_drown' }, { level: 45, tech: 'deluge_tempest' }],
    palette: { primary: 0x0a1e4a, secondary: 0x2a5a9e, accent: 0x9a5af2 },
    desc: 'Abyssarch\'s drowned road — a wraith-serpent woven from black water and the silence beneath the trench.', captureBase: 0, scale: 2.0 }),
  S({ id: 'tidewraith', name: 'Tidewraith', type: 'Tide', stage: 'Special', archetype: 'serpent',
    base: stats(298, 100, 92, 70, 64, 80), growth: stats(16, 5.6, 5.4, 4.2, 4.6, 5.2),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'deluge_tempest' }, { level: 1, tech: 'abyssal_drown' }],
    ascendsTo: { species: 'oceanarch', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0x103a8a, secondary: 0x3a9df2, accent: 0xc8f0ff },
    desc: 'The drowned king crowned at last — every tide bends toward it like a courtier.', captureBase: 0, scale: 2.05 }),
  S({ id: 'oceanarch', name: 'Oceanarch', type: 'Tide', stage: 'Terra', archetype: 'serpent',
    base: stats(344, 108, 112, 88, 70, 92), growth: stats(18, 6.2, 6.2, 5.0, 5.0, 5.8),
    techs: [{ level: 1, tech: 'deluge_tempest' }, { level: 1, tech: 'abyssal_drown' }, { level: 1, tech: 'ice_spear' }],
    ascendsTo: { species: 'abyssophar', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0x0a5ab0, secondary: 0x6ad0f2, accent: 0xeafaff },
    desc: 'Terra City\'s tide-engineers raised a whole drowned ocean into a single body of crystalline water.', captureBase: 0, scale: 2.2 }),
  S({ id: 'abyssophar', name: 'Abyssophar', type: 'Tide', stage: 'Transcendent', archetype: 'serpent',
    base: stats(402, 122, 134, 102, 82, 108), growth: stats(20, 6.8, 6.8, 5.6, 5.6, 6.4),
    techs: [{ level: 1, tech: 'abyssal_drown' }, { level: 1, tech: 'deluge_tempest' }, { level: 1, tech: 'tidal_apocalypse' }],
    ascendsTo: { species: 'maremortis', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0x081a3a, secondary: 0x2a8ad9, accent: 0xff9ad2 },
    desc: 'It has transcended the sea and become the pressure of the deep itself — cold, patient, absolute.', captureBase: 0, scale: 2.15 }),
  S({ id: 'maremortis', name: 'Maremortis', type: 'Tide', stage: 'Aether', archetype: 'serpent', isBoss: true,
    base: stats(470, 138, 158, 124, 92, 124), growth: stats(22, 7.4, 7.6, 6.2, 6.0, 7.0),
    techs: [{ level: 1, tech: 'abyssal_drown' }, { level: 1, tech: 'tidal_apocalypse' }, { level: 1, tech: 'deluge_tempest' }],
    palette: { primary: 0x020a2a, secondary: 0x1a6ad0, accent: 0xff9ad2 },
    desc: 'The dead sea given will — a leviathan of drowned starlight that ends worlds by simply rising.', captureBase: 0, scale: 2.5 }),

  // ---- VERDANT: Eldergrove ↘ Thornmaw ; Yggdranox → Sylvanarch → Terravine → Genesophar → Worldwither
  S({ id: 'thornmaw', name: 'Thornmaw', type: 'Verdant', stage: 'Split', archetype: 'brute',
    base: stats(290, 70, 78, 76, 36, 58), growth: stats(17, 4.8, 5.2, 5.4, 3.0, 4.4),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 45, tech: 'nature_judgment' }],
    palette: { primary: 0x1e3a14, secondary: 0x6a2a2a, accent: 0x9a5af2 },
    desc: 'Eldergrove\'s carnivorous road — a maw-of-thorns grove that hunts what wanders too close.', captureBase: 0, scale: 2.05 }),
  S({ id: 'sylvanarch', name: 'Sylvanarch', type: 'Verdant', stage: 'Special', archetype: 'beast',
    base: stats(300, 96, 92, 78, 60, 78), growth: stats(16, 5.4, 5.2, 4.8, 4.2, 4.8),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'nature_judgment' }, { level: 1, tech: 'bramble_cage' }],
    ascendsTo: { species: 'terravine', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0x2a8a3a, secondary: 0xe8f0a0, accent: 0xfff0c8 },
    desc: 'The forest given a single body and a single will — a radiant stag-spirit crowned in dawnleaf.', captureBase: 0, scale: 2.05 }),
  S({ id: 'terravine', name: 'Terravine', type: 'Verdant', stage: 'Terra', archetype: 'brute',
    base: stats(352, 106, 116, 102, 64, 84), growth: stats(19, 6.0, 6.2, 5.6, 4.4, 5.2),
    techs: [{ level: 1, tech: 'nature_judgment' }, { level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'earthquake_tech' }],
    ascendsTo: { species: 'genesophar', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0x3a6a1a, secondary: 0xb0865a, accent: 0xffe06a },
    desc: 'Rooted into Terra City\'s bedrock and pulled free again — a titan of worldstone and unkillable vine.', captureBase: 0, scale: 2.25 }),
  S({ id: 'genesophar', name: 'Genesophar', type: 'Verdant', stage: 'Transcendent', archetype: 'shell',
    base: stats(414, 118, 132, 122, 74, 100), growth: stats(21, 6.4, 6.6, 6.2, 5.0, 5.8),
    techs: [{ level: 1, tech: 'nature_judgment' }, { level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'world_ender' }],
    ascendsTo: { species: 'worldwither', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0x1a4e1a, secondary: 0xe8d28a, accent: 0xff9ad2 },
    desc: 'A shelled world-garden that carries an entire biome on its back, blooming and dying in a single breath.', captureBase: 0, scale: 2.35 }),
  S({ id: 'worldwither', name: 'Worldwither', type: 'Verdant', stage: 'Aether', archetype: 'brute', isBoss: true,
    base: stats(480, 132, 168, 132, 84, 110), growth: stats(23, 7.0, 8.0, 6.6, 5.6, 6.2),
    techs: [{ level: 1, tech: 'nature_judgment' }, { level: 1, tech: 'world_ender' }, { level: 1, tech: 'elder_wrath' }],
    palette: { primary: 0x102e10, secondary: 0x5a2a6a, accent: 0xff9ad2 },
    desc: 'The world-tree\'s shadow self — it does not grow life, it composts it. Continents go to seed in its wake.', captureBase: 0, scale: 2.55 }),

  // ---- VOLT: Fulgurex ↘ Voltgolem ; Raidenjin → Stormarch → Galvanyx → Voltranscend → Dynastorm
  S({ id: 'voltgolem', name: 'Voltgolem', type: 'Volt', stage: 'Split', archetype: 'brute',
    base: stats(262, 78, 80, 72, 50, 48), growth: stats(15, 5.0, 5.2, 4.6, 4.0, 3.6),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 45, tech: 'volt_singularity' }],
    palette: { primary: 0x3a3a18, secondary: 0xf2d23a, accent: 0x2a5a9e },
    desc: 'Fulgurex\'s grounded road — a colossus of fused lightning-glass that walks like rolling thunder.', captureBase: 0, scale: 2.05 }),
  S({ id: 'stormarch', name: 'Stormarch', type: 'Volt', stage: 'Special', archetype: 'avian',
    base: stats(290, 100, 96, 64, 78, 76), growth: stats(15, 5.6, 5.6, 4.0, 5.0, 4.8),
    techs: [{ level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'volt_singularity' }, { level: 1, tech: 'storm_lance' }],
    ascendsTo: { species: 'galvanyx', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0xf2d23a, secondary: 0xfff0a0, accent: 0xeafaff },
    desc: 'The first thunderclap crowned — a storm-roc whose wingbeats rewrite the weather for a hundred leagues.', captureBase: 0, scale: 2.0 }),
  S({ id: 'galvanyx', name: 'Galvanyx', type: 'Volt', stage: 'Terra', archetype: 'beast',
    base: stats(338, 110, 118, 80, 86, 86), growth: stats(17, 6.2, 6.4, 4.6, 5.4, 5.2),
    techs: [{ level: 1, tech: 'volt_singularity' }, { level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'plasma_blast' }],
    ascendsTo: { species: 'voltranscend', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0xc8a81e, secondary: 0xf2e06e, accent: 0xb0865a },
    desc: 'Wound through Terra City\'s great dynamo and pulled out still spinning — a beast that is mostly captured storm.', captureBase: 0, scale: 2.15 }),
  S({ id: 'voltranscend', name: 'Voltranscend', type: 'Volt', stage: 'Transcendent', archetype: 'avian',
    base: stats(394, 124, 140, 96, 102, 98), growth: stats(19, 6.8, 7.2, 5.2, 6.2, 5.8),
    techs: [{ level: 1, tech: 'volt_singularity' }, { level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'storm_god_wrath' }],
    ascendsTo: { species: 'dynastorm', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0xfff04a, secondary: 0xffffff, accent: 0xff9ad2 },
    desc: 'Lightning that learned it did not need a sky. It strikes from everywhere and nowhere at once.', captureBase: 0, scale: 2.05 }),
  S({ id: 'dynastorm', name: 'Dynastorm', type: 'Volt', stage: 'Aether', archetype: 'avian', isBoss: true,
    base: stats(456, 138, 168, 110, 120, 110), growth: stats(21, 7.4, 8.2, 5.8, 6.8, 6.2),
    techs: [{ level: 1, tech: 'volt_singularity' }, { level: 1, tech: 'storm_god_wrath' }, { level: 1, tech: 'thunder_dominion' }],
    palette: { primary: 0xffe01a, secondary: 0x4a5cff, accent: 0xff9ad2 },
    desc: 'A god-storm wearing the shape of a bird. To stand beneath it is to be the lightning rod of the world.', captureBase: 0, scale: 2.45 }),

  // ---- GALE: Tempestrix ↘ Cyclonaut ; Zephyrax → Aeronarch → Stratoterra → Cosmovault → Voidtempest
  S({ id: 'cyclonaut', name: 'Cyclonaut', type: 'Gale', stage: 'Split', archetype: 'avian',
    base: stats(252, 84, 74, 50, 86, 58), growth: stats(14, 5.2, 5.2, 3.6, 5.4, 4.4),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'razor_cyclone' }, { level: 45, tech: 'tempest_gale' }],
    palette: { primary: 0x14403a, secondary: 0x4ec4b0, accent: 0x7a8af2 },
    desc: 'Tempestrix\'s far-roaming road — a sky-corsair that rides the jetstream between continents and never lands.', captureBase: 0, scale: 2.0 }),
  S({ id: 'aeronarch', name: 'Aeronarch', type: 'Gale', stage: 'Special', archetype: 'avian',
    base: stats(284, 100, 90, 62, 96, 74), growth: stats(15, 5.6, 5.4, 4.0, 5.6, 4.8),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'tempest_gale' }, { level: 1, tech: 'razor_cyclone' }],
    ascendsTo: { species: 'stratoterra', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0x6ad0f2, secondary: 0xffffff, accent: 0xfff0c8 },
    desc: 'Monarch of the upper sky enthroned — its wings span the seam where atmosphere becomes space.', captureBase: 0, scale: 2.05 }),
  S({ id: 'stratoterra', name: 'Stratoterra', type: 'Gale', stage: 'Terra', archetype: 'avian',
    base: stats(330, 110, 110, 80, 102, 84), growth: stats(17, 6.2, 6.0, 5.0, 6.0, 5.2),
    techs: [{ level: 1, tech: 'tempest_gale' }, { level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'hurricane_slash_tech' }],
    ascendsTo: { species: 'cosmovault', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0x3a8ad0, secondary: 0xb0865a, accent: 0xeafaff },
    desc: 'Terra City anchored a hurricane to a mountain and this is what flew off the peak — sky given ballast.', captureBase: 0, scale: 2.2 }),
  S({ id: 'cosmovault', name: 'Cosmovault', type: 'Gale', stage: 'Transcendent', archetype: 'sprite',
    base: stats(388, 124, 128, 92, 110, 104), growth: stats(19, 6.8, 6.6, 5.4, 6.4, 6.0),
    techs: [{ level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'tempest_gale' }, { level: 1, tech: 'void_maelstrom' }],
    ascendsTo: { species: 'voidtempest', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0x2a3a8a, secondary: 0x9ad0ff, accent: 0xff9ad2 },
    desc: 'It has risen past the last cloud into the cold vault of space and brought the silence back down with it.', captureBase: 0, scale: 2.1 }),
  S({ id: 'voidtempest', name: 'Voidtempest', type: 'Gale', stage: 'Aether', archetype: 'avian', isBoss: true,
    base: stats(452, 138, 152, 108, 128, 118), growth: stats(21, 7.4, 7.4, 5.8, 7.0, 6.6),
    techs: [{ level: 1, tech: 'void_maelstrom' }, { level: 1, tech: 'sky_sunder' }, { level: 1, tech: 'tempest_gale' }],
    palette: { primary: 0x0a1230, secondary: 0x5a8af2, accent: 0xff9ad2 },
    desc: 'A storm of folded space and dead starlight. Where it passes, the sky forgets which way is down.', captureBase: 0, scale: 2.45 }),

  // ---- UMBRA: Umbrelisk ↘ Nyxmaw ; Chthonix → Umbrarch → Tenebraterra → Voidsovereign → Nihilumbra
  S({ id: 'nyxmaw', name: 'Nyxmaw', type: 'Umbra', stage: 'Split', archetype: 'serpent',
    base: stats(258, 86, 78, 56, 58, 70), growth: stats(15, 5.2, 5.2, 3.8, 4.4, 5.0),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 45, tech: 'void_extinction' }],
    palette: { primary: 0x140a28, secondary: 0x4a2a8a, accent: 0x9adff2 },
    desc: 'Umbrelisk\'s devouring road — a frost-shadow serpent whose bite leaves a cold that never thaws.', captureBase: 0, scale: 2.0 }),
  S({ id: 'umbrarch', name: 'Umbrarch', type: 'Umbra', stage: 'Special', archetype: 'serpent',
    base: stats(296, 100, 94, 70, 64, 80), growth: stats(16, 5.6, 5.4, 4.2, 4.6, 5.2),
    techs: [{ level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'void_extinction' }, { level: 1, tech: 'void_fang' }],
    ascendsTo: { species: 'tenebraterra', kind: 'Terra', level: 62, item: 'terra_catalyst', flag: 'terra_visited' },
    palette: { primary: 0x3a1a6a, secondary: 0x8a4ae0, accent: 0xf2e8b8 },
    desc: 'The shadow cast by nothing, crowned — it wears a halo of stolen light it refuses to give back.', captureBase: 0, scale: 2.05 }),
  S({ id: 'tenebraterra', name: 'Tenebraterra', type: 'Umbra', stage: 'Terra', archetype: 'brute',
    base: stats(346, 108, 116, 90, 66, 88), growth: stats(18, 6.2, 6.4, 5.0, 4.8, 5.6),
    techs: [{ level: 1, tech: 'void_extinction' }, { level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'doom_gaze' }],
    ascendsTo: { species: 'voidsovereign', kind: 'Transcendent', level: 80, item: 'transcend_sigil' },
    palette: { primary: 0x241038, secondary: 0x5a2ab0, accent: 0xb0865a },
    desc: 'Quarried from the dark beneath Terra City\'s deepest vault — a brute of compressed night and worldstone.', captureBase: 0, scale: 2.2 }),
  S({ id: 'voidsovereign', name: 'Voidsovereign', type: 'Umbra', stage: 'Transcendent', archetype: 'serpent',
    base: stats(402, 122, 138, 100, 80, 106), growth: stats(20, 6.8, 7.0, 5.6, 5.4, 6.2),
    techs: [{ level: 1, tech: 'void_extinction' }, { level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'oblivion_eclipse' }],
    ascendsTo: { species: 'nihilumbra', kind: 'Aether', level: 90, item: 'aether_shard' },
    palette: { primary: 0x12081f, secondary: 0x6a2ac0, accent: 0xff9ad2 },
    desc: 'It has transcended shadow and become absence itself — a sovereign of the space where light has never been.', captureBase: 0, scale: 2.15 }),
  S({ id: 'nihilumbra', name: 'Nihilumbra', type: 'Umbra', stage: 'Aether', archetype: 'serpent', isBoss: true,
    base: stats(468, 138, 166, 118, 90, 120), growth: stats(22, 7.4, 8.0, 6.2, 5.8, 6.8),
    techs: [{ level: 1, tech: 'oblivion_eclipse' }, { level: 1, tech: 'void_extinction' }, { level: 1, tech: 'eclipse_requiem' }],
    palette: { primary: 0x050310, secondary: 0x4a1aa0, accent: 0xff9ad2 },
    desc: 'The last dark — the one that waits after every star. It does not hunger; it simply ends.', captureBase: 0, scale: 2.5 }),
] as SpeciesDef[]).map(s => [s.id, s]));

// ---------------- Items ----------------
export type ItemKind = 'heal' | 'sp' | 'revive' | 'gift' | 'fuel' | 'repair' | 'boost' | 'feast' | 'evo' | 'relic';

export interface ItemDef {
  id: string; name: string; kind: ItemKind;
  value: number;          // heal amount / gift bond value / fuel amount...
  price: number;          // shop price in Shards (0 = not sold)
  desc: string;
  boostStat?: StatKey;
}

const I = (id: string, name: string, kind: ItemKind, value: number, price: number, desc: string, boostStat?: StatKey): ItemDef =>
  ({ id, name, kind, value, price, desc, boostStat });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries([
  I('tonic', 'Vital Tonic', 'heal', 50, 60, 'Restores 50 HP to one Guardian.'),
  I('tonic_plus', 'Vital Tonic+', 'heal', 150, 180, 'Restores 150 HP to one Guardian.'),
  I('elixir', 'Grand Elixir', 'heal', 9999, 600, 'Fully restores one Guardian\'s HP.'),
  I('soda', 'Spirit Soda', 'sp', 30, 90, 'Restores 30 SP to one Guardian.'),
  I('soda_plus', 'Spirit Soda+', 'sp', 80, 240, 'Restores 80 SP to one Guardian.'),
  I('soda_max', 'Spirit Nectar', 'sp', 9999, 520, 'Fully restores one Guardian\'s SP — bottled dawn-dew from the Mistveil springs.'),
  I('revive_leaf', 'Dawn Leaf', 'revive', 0.5, 350, 'Revives a fainted Guardian at half HP.'),
  I('revive_bloom', 'Phoenix Bloom', 'revive', 1.0, 760, 'Revives a fainted Guardian at FULL HP. Petals that remember being fire.'),
  I('berry', 'Sweet Berry', 'gift', 12, 30, 'A favorite snack of wild Guardians. Builds bond when gifted.'),
  I('honey_roll', 'Honey Roll', 'gift', 25, 80, 'A pastry no Guardian can resist. Builds strong bond.'),
  I('star_treat', 'Star Treat', 'gift', 45, 200, 'A legendary delicacy. Builds a deep bond instantly.'),
  I('aether_confit', 'Aether Confit', 'gift', 80, 460, 'A shimmering candied morsel from a University recipe. Even wary Apex Guardians soften at the smell.'),
  I('cell', 'Charge Cell', 'fuel', 40, 50, 'Restores 40 Energy to the Crawler.'),
  I('cell_plus', 'Charge Cell+', 'fuel', 120, 130, 'Restores 120 Energy to the Crawler.'),
  I('cell_max', 'Stormcore Cell', 'fuel', 9999, 360, 'Fully recharges the Crawler\'s Energy in one jolt of stored lightning.'),
  I('plating', 'Patch Plating', 'repair', 50, 70, 'Repairs 50 Hull on the Crawler.'),
  I('plating_plus', 'Aegis Plating', 'repair', 9999, 320, 'Fully repairs the Crawler\'s Hull with vault-grade weld-foam.'),
  I('atk_gem', 'Ruby Gem', 'boost', 2, 800, 'Permanently raises a Guardian\'s Attack by 2.', 'atk'),
  I('def_gem', 'Topaz Gem', 'boost', 2, 800, 'Permanently raises a Guardian\'s Defense by 2.', 'def'),
  I('spd_gem', 'Opal Gem', 'boost', 2, 800, 'Permanently raises a Guardian\'s Speed by 2.', 'spd'),
  I('wis_gem', 'Sapphire Gem', 'boost', 2, 800, 'Permanently raises a Guardian\'s Wisdom by 2.', 'wis'),
  I('hp_gem', 'Garnet Gem', 'boost', 6, 800, 'Permanently raises a Guardian\'s max HP by 6.', 'hp'),
  I('sp_gem', 'Amethyst Gem', 'boost', 6, 800, 'Permanently raises a Guardian\'s max SP by 6.', 'sp'),
  I('prism_gem', 'Prism Gem', 'boost', 3, 2600, 'A flawless cut crystal that strengthens a Guardian\'s very frame — permanently raises max HP by 3 and is prized by every house.', 'hp'),
  // cooked fish — dishes crafted at the Anglers' Wharf kitchen
  I('fish_grill', 'Grilled Fillet', 'heal', 120, 0, 'Restores 120 HP to one Guardian. Simple campfire fare from a fresh catch.'),
  I('fish_smoke', 'Smoked Catch', 'sp', 90, 0, 'Restores 90 SP to one Guardian. Cured to keep for the long road.'),
  I('fish_stew', "Angler's Stew", 'heal', 9999, 0, 'Fully restores one Guardian\'s HP. A rich pot of pond-and-river bounty.'),
  I('fish_sashimi', 'Prism Sashimi', 'boost', 2, 0, 'Permanently raises a Guardian\'s Speed by 2. Cut from exotic flesh.', 'spd'),
  I('fish_roe', 'Mythic Roe', 'boost', 6, 0, 'Permanently raises a Guardian\'s max HP by 6. Eggs that hum with power.', 'hp'),
  I('fish_legend', 'Legendary Banquet', 'feast', 3, 0, 'A feast told of for generations — permanently raises ALL of a Guardian\'s stats.'),
  // story relics — quest items, never sold, never consumed by accident
  I('storm_amber', 'Storm-Touched Amber', 'relic', 0, 0, 'Fossil resin from the Thunderfen Mire with a living spark sealed inside. Historian Veyl at the University would trade a great deal to study one.'),
  I('sea_chart', 'Aurelian Sea-Chart', 'relic', 0, 0, 'Historian Veyl\'s hand-corrected chart of the western sea. Agdao Island — the Cradle of Tamers — is inked at its heart. Your overworld map now knows the way.'),
  I('stormheart_coil', 'Stormheart Coil', 'relic', 0, 0, 'A grounding coil wound by Greggy the Stormheart himself. It hums faintly when held toward the center of the world.'),
  // ascension catalysts — fuel the high-tier evolutions (Terra / Transcendence / Aether)
  I('terra_catalyst', 'Terra Catalyst', 'relic', 0, 0, 'A core of crystallized world-stone, quarried only in Terra City. A Guardian in its Special form can draw on it to undergo Terra Evolution.'),
  I('transcend_sigil', 'Transcendence Sigil', 'relic', 0, 0, 'A sigil that holds the memory of every form a Guardian has ever worn. It lets a Terra-evolved Guardian of Lv80+ shed its mortal shape and Transcend.'),
  I('aether_shard', 'Aether Shard', 'relic', 0, 0, 'A mote of the raw stuff the Big Three\'s Nine are made of. A Transcendent Guardian can shatter one to ascend — once — into an Aether form.'),
  // Act V — the Foretales arc
  I('override_ledger', 'Override Ledger', 'relic', 0, 0, 'Three proofs bound in river-twine: Esta\'s relay logs stamped FT-PRIME, Dalisay\'s unedited festival crystal, and a Foretales stringer\'s assignment book. Together they say one thing: the news is written before it happens.'),
  I('continuity_reel', 'The Continuity Reel', 'relic', 0, 0, 'The Mirrorhouse\'s master spool — sixteen years of front pages filed BEFORE the events they report. The last frame is a standing directive on the Big Three: "GLAZE. DO NOT TOUCH. NOT YET. SOON."'),
  I('dragons_tear', "Dragon's Tear", 'relic', 0, 0, 'A pure red chrome gem recovered from the secret ancient Dungeon of Terra City. It hums with immense power, needed to upgrade the Crawler\'s Main Board.'),
  I('third_harmonik', "3rd Harmonik Notes", 'relic', 0, 0, 'A compilation of frequency notes on Ghandra and the Aether Line by Doctor Clyde. Take these to the Haven Town Sanctum for study.'),
  I('tems_backup', "Tem's Backup Logs", 'relic', 0, 0, 'A backup copy of Hyujon\'s north gate gate-records, saved by Archivist Tem in an air duct. It logs a single man passing alone with a lantern.'),
].map(i => [i.id, i]));

// ---------------- Crawler parts ----------------
export type CrawlerSlot = 'hull' | 'engine' | 'cargo' | 'cannon' | 'scanner' | 'legs';
export const CRAWLER_SLOTS: CrawlerSlot[] = ['hull', 'engine', 'cargo', 'cannon', 'scanner', 'legs'];
export const CRAWLER_SLOT_INFO: Record<CrawlerSlot, { icon: string; label: string; blurb: string }> = {
  hull:    { icon: '🛡️', label: 'Hull',    blurb: 'The carapace. More Hull means more punishment your Crawler can shrug off.' },
  engine:  { icon: '⚙️', label: 'Engine',  blurb: 'The abdomen core. Energy is fuel — every step in the field drinks from it.' },
  cargo:   { icon: '📦', label: 'Cargo',   blurb: 'Saddlebags and trunks. Determines how many item stacks you can haul.' },
  cannon:  { icon: '💥', label: 'Cannon',  blurb: 'Top-mounted artillery. Breaks rocks; better models stun foes for a free first strike.' },
  scanner: { icon: '📡', label: 'Scanner', blurb: 'The all-seeing mast. Reveals dungeon floors, pings chests and stairways.' },
  legs:    { icon: '🦿', label: 'Legs',    blurb: 'The stride itself. Finer legwork wastes less Energy with every step.' },
};

// Six-step rarity ladder. Drives shop badges, display placards and the
// prismatic ULTRA treatment. Rank is derived from tier when not stated.
export type CrawlerRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ultra';
export const RARITY_ORDER: CrawlerRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra'];
export const RARITY_INFO: Record<CrawlerRarity, { label: string; color: string; glow: string; rank: number; bg: string }> = {
  common:    { label: 'Common',    color: '#9aa6b8', glow: 'rgba(154,166,184,0.45)', rank: 0, bg: 'linear-gradient(135deg,#5a6273,#39414f)' },
  uncommon:  { label: 'Uncommon',  color: '#5ec46a', glow: 'rgba(94,196,106,0.6)',   rank: 1, bg: 'linear-gradient(135deg,#3f9a4a,#256a30)' },
  rare:      { label: 'Rare',      color: '#4aa6f2', glow: 'rgba(74,166,242,0.65)',   rank: 2, bg: 'linear-gradient(135deg,#2f7ad8,#1a4f9a)' },
  epic:      { label: 'Epic',      color: '#b66af2', glow: 'rgba(182,106,242,0.7)',   rank: 3, bg: 'linear-gradient(135deg,#8a3ad8,#5a1f9a)' },
  legendary: { label: 'Legendary', color: '#f2a83a', glow: 'rgba(242,168,58,0.75)',   rank: 4, bg: 'linear-gradient(135deg,#e88a1a,#a85a0a)' },
  ultra:     { label: 'ULTRA RARE', color: '#ff5ad2', glow: 'rgba(255,90,210,0.85)',  rank: 5, bg: 'linear-gradient(120deg,#ff5ad2,#9a6aff,#5ad2ff,#ffd25a,#ff5ad2)' },
};
/** The prismatic CSS gradient ULTRA parts use for badges/placards. */
export const ULTRA_GRADIENT = 'linear-gradient(120deg,#ff5ad2,#9a6aff,#5ad2ff,#7affc4,#ffd25a,#ff5ad2)';
const rarityFromTier = (tier: number): CrawlerRarity => RARITY_ORDER[Math.min(tier - 1, 5)] ?? 'common';

export interface CrawlerPart {
  id: string; slot: CrawlerSlot; name: string; tier: number; value: number; price: number; desc: string;
  /** visual style key consumed by the 3D part builder */
  style: string;
  rarity: CrawlerRarity;
}
const P = (id: string, slot: CrawlerSlot, name: string, tier: number, value: number, price: number, style: string, desc: string, rarity?: CrawlerRarity): CrawlerPart =>
  ({ id, slot, name, tier, value, price, style, desc, rarity: rarity ?? rarityFromTier(tier) });

export const CRAWLER_PARTS: Record<string, CrawlerPart> = Object.fromEntries([
  P('hull1', 'hull', 'Scrap Hull', 1, 100, 0, 'scrap', 'Standard-issue academy hull — welded plates, honest rivets. 100 Hull.'),
  P('hull2', 'hull', 'Bronzeweave Hull', 2, 180, 500, 'bronzeweave', 'Segmented bronze carapace, banded like a beetle. 180 Hull.'),
  P('hull3', 'hull', 'Aegis Hull', 3, 300, 1400, 'aegis', 'Vault-grade angular armor with a dorsal blade. 300 Hull.'),
  P('hull4', 'hull', 'Aurum Royale Hull', 4, 380, 3200, 'royale', 'Pearl-white coachwork with gold inlay. Turns heads, stops claws. 380 Hull.'),
  P('engine1', 'engine', 'Putter Engine', 1, 100, 0, 'putter', 'A wheezing starter abdomen with twin smokestacks. 100 Energy.'),
  P('engine2', 'engine', 'Twin-Coil Engine', 2, 180, 500, 'twincoil', 'Copper-wound and smooth as rain. 180 Energy.'),
  P('engine3', 'engine', 'Stormheart Engine', 3, 300, 1400, 'stormheart', 'Purrs like a thundercloud; the core ring glows with banked lightning. 300 Energy.'),
  P('engine4', 'engine', 'Aether Core', 4, 400, 3600, 'aethercore', 'A caged shard of folded sky. Dax does not know how it works. It works. 400 Energy.'),
  P('cargo1', 'cargo', 'Side Satchels', 1, 12, 0, 'satchel', 'Leather saddlebags on both flanks. Carry up to 12 item stacks.'),
  P('cargo2', 'cargo', 'Cargo Rack', 2, 20, 400, 'rack', 'A strapped-down top rack of crates. Carry up to 20 item stacks.'),
  P('cargo3', 'cargo', 'Vault Trunk', 3, 32, 1100, 'vault', 'An armored, gold-sealed strongbox. Carry up to 32 item stacks.'),
  P('cargo4', 'cargo', 'Caravan Hold', 4, 48, 3000, 'caravan', 'A double-decked merchant hold with brass-bound chests. Carry up to 48 item stacks.'),
  P('cannon1', 'cannon', 'Pop Cannon', 1, 1, 0, 'pop', 'A single cheerful barrel. Breaks cracked rocks blocking passages.'),
  P('cannon2', 'cannon', 'Bore Cannon', 2, 2, 700, 'bore', 'Twin barrels. Also stuns foes: +10% first-strike chance.'),
  P('cannon3', 'cannon', 'Howitzer MK-A', 3, 3, 1800, 'howitzer', 'A muzzle-braked monster. Also stuns foes: +25% first-strike chance.'),
  P('cannon4', 'cannon', 'Tempest Array', 4, 4, 4200, 'tempest', 'A four-tube rocket pod of Stormcall design. +35% first-strike chance.'),
  P('scanner1', 'scanner', 'Tin Sonar', 1, 1, 0, 'tin', 'A whip antenna with a brave little beacon. Reveals nearby map tiles.'),
  P('scanner2', 'scanner', 'Owl-Eye Sonar', 2, 2, 600, 'owleye', 'A slow-turning dish that never blinks. Wider reveal; chests ping on the map.'),
  P('scanner3', 'scanner', 'Oracle Array', 3, 3, 1500, 'oracle', 'Three orbiting auguries. Full-floor chest & stair pings, wide reveal.'),
  P('scanner4', 'scanner', 'Aether Eye', 4, 4, 3800, 'aethereye', 'A levitating halo-ring of folded sky. Sees half a floor at a glance — nothing stays hidden.'),
  P('legs1', 'legs', 'Scuttler Legs', 1, 0, 0, 'scuttler', 'Four sturdy academy struts. They get you there.'),
  P('legs2', 'legs', 'Arachno Striders', 2, 15, 900, 'arachno', 'Six armored legs with a smoother gait: 15% of steps cost no Energy.'),
  P('legs3', 'legs', 'Sovereign Octapods', 3, 30, 2400, 'sovereign', 'Eight gold-jointed clawfeet gliding like silk: 30% of steps cost no Energy.'),
  P('legs4', 'legs', 'Aether Drift Legs', 4, 50, 4600, 'aetherdrift', 'Eight floating clawfeet that barely touch the ground: 50% of steps cost no Energy.'),

  // ===================== NEW HULLS — every chassis a different silhouette & size =====================
  P('hull5', 'hull', 'Vespine Frame', 2, 200, 650, 'wasp', 'A sleek, low-slung wasp chassis striped jet-and-amber. Built for speed, not stares. 200 Hull.'),
  P('hull6', 'hull', 'Scarab Carapace', 3, 320, 1500, 'beetle', 'A domed beetle shell with iridescent elytra that flick open when she breathes. 320 Hull.'),
  P('hull7', 'hull', 'Bastion Crab Shell', 3, 300, 1400, 'crab', 'A broad, flat war-crab carapace — squat, stubborn, and ringed in side-eyes. 300 Hull.'),
  P('hull8', 'hull', 'Tidewrought Reef Hull', 3, 330, 1600, 'reef', 'Coral-grown plating crusted with barnacle nodes that glow Mistveil teal in the dark. 330 Hull.'),
  P('hull9', 'hull', 'Obsidian Wedge', 4, 420, 3200, 'obsidian', 'A faceted black stealth wedge veined with banked-ember seams. Light slides right off it. 420 Hull.'),
  P('hull10', 'hull', 'Juggernaut Bulwark', 4, 520, 3600, 'juggernaut', 'A rolling fortress — broad, tall, double dorsal blades. Foes bounce. 520 Hull.'),
  P('hull11', 'hull', 'Ironframe Mecha-Cab', 4, 440, 3300, 'mecha', 'An exposed-strut pilot pod of raw industrial mecha-work, hydraulics on show. 440 Hull.'),
  P('hull12', 'hull', "Monarch's Carriage", 5, 600, 6800, 'monarch', 'A regal domed coach crowned with gold spires and a single Tharkand gem. 600 Hull.', 'legendary'),
  P('hull13', 'hull', 'Stormcell Dreadhull', 5, 640, 7200, 'stormcell', 'A storm-battery dreadnought hull that crackles with caged arcs along its spine. 640 Hull.', 'legendary'),
  P('hull14', 'hull', 'Wyrmplate Chassis', 5, 680, 7600, 'wyrm', 'Overlapping draconic scale-plates, a dorsal ridge of horns, folded wing-stubs that twitch. 680 Hull.', 'legendary'),
  P('hull15', 'hull', 'Prismatic Lattice Hull', 5, 620, 7000, 'prism', 'A geometric crystal lattice that throws a different colour from every angle. 620 Hull.', 'legendary'),
  P('hull16', 'hull', 'Aether Sovereign Hull', 6, 800, 14000, 'aether', 'A chassis of folded sky — translucent plates drift unbound around a haloed core. The pinnacle. 800 Hull.', 'ultra'),
  P('hull17', 'hull', 'Chronos Gearbox Hull', 6, 820, 14800, 'chronos', 'An ornate gold-brass clockwork casing built of spinning wheels and micro-escapements. 820 Hull.', 'ultra'),
  P('hull18', 'hull', 'Gloomwyrm Carapace', 6, 840, 15200, 'gloom', 'A breathing, scale-covered organic cage lined with protective obsidian spines. 840 Hull.', 'ultra'),
  P('hull19', 'hull', 'Void-Star Carapace', 6, 860, 15500, 'void', 'A dark matter shell composed of levitating white bone-plates around a star core. 860 Hull.', 'ultra'),
  P('hull20', 'hull', 'Plasma Reactor Chassis', 6, 880, 15800, 'plasma', 'A carbon-weave experimental chassis lined with glowing superheated fuel tubes. 880 Hull.', 'ultra'),
  P('hull21', 'hull', 'Crystalline Geode Hull', 6, 900, 16000, 'crystalline', 'A hollowed geode structure with raw amethyst crystal formations pulsing with energy. 900 Hull.', 'ultra'),


  // ===================== NEW ENGINES =====================
  P('engine5', 'engine', 'Piston Bank', 2, 220, 600, 'piston', 'A bank of brass pistons that hammer in sequence. Loud, honest, willing. 220 Energy.'),
  P('engine6', 'engine', 'Rotary Whirlcore', 3, 320, 1400, 'rotary', 'A whirring rotary disc that never quite stops spinning. 320 Energy.'),
  P('engine7', 'engine', 'Solar Fin Reactor', 3, 340, 1500, 'solar', 'Gold heat-fins drink the light and hum it back as power. 340 Energy.'),
  P('engine8', 'engine', 'Magmaheart Core', 4, 450, 3300, 'magma', 'A churning molten heart sealed behind blast-glass; it pulses like a forge. 450 Energy.'),
  P('engine9', 'engine', 'Cryo Vortex Core', 4, 450, 3300, 'cryo', 'A frost-blue vortex that vents cold mist and never overheats. 450 Energy.'),
  P('engine10', 'engine', 'Tesla Cage Engine', 4, 470, 3500, 'teslacoil', 'A caged coil throwing live arcs between its prongs. Stand back. 470 Energy.'),
  P('engine11', 'engine', 'Quantum Orbital Core', 5, 580, 6800, 'quantum', 'A bright nucleus ringed by three counter-spinning orbital tracks. 580 Energy.', 'legendary'),
  P('engine12', 'engine', 'Pulsar Drive', 5, 600, 7000, 'pulsar', 'A lighthouse-bright core that pulses in a slow, hypnotic beat. 600 Energy.', 'legendary'),
  P('engine13', 'engine', 'Singularity Core', 6, 740, 14500, 'singularity', 'A folded knot of void, ringed by light it refuses to release. Dax will not insure it. 740 Energy.', 'ultra'),
  P('engine14', 'engine', 'Chronos Gear-Core', 6, 760, 14800, 'chronosecore', 'An intricate clockwork engine driven by a massive, steam-venting flywheel. 760 Energy.', 'ultra'),
  P('engine15', 'engine', 'Gloomwyrm Heart', 6, 780, 15200, 'gloomheart', 'A bio-organic engine that thumps with life, fueled by glowing mossy veins. 780 Energy.', 'ultra'),
  P('engine16', 'engine', 'Void Singularity Core', 6, 800, 15500, 'voidengine', 'A micro-singularity engine drawing in cosmic stardust to generate infinite power. 800 Energy.', 'ultra'),
  P('engine17', 'engine', 'Overcharged Plasma Engine', 6, 820, 15800, 'plasmareactor', 'A glowing orb of pure plasma trapped in high-frequency magnetic rings. 820 Energy.', 'ultra'),
  P('engine18', 'engine', 'Prism-Core Reactor', 6, 840, 16000, 'crystalcore', 'A heavy spinning amethyst cluster refracting energy beams throughout the chassis. 840 Energy.', 'ultra'),


  // ===================== NEW CARGO =====================
  P('cargo5', 'cargo', 'Reinforced Panniers', 2, 18, 550, 'panniers', 'Twin buckled saddle-panniers, ribbed with steel. Carry up to 18 item stacks.'),
  P('cargo6', 'cargo', 'Crate Scaffold', 3, 28, 1300, 'crateframe', 'A bolted scaffold of lashed crates climbing the back. Carry up to 28 item stacks.'),
  P('cargo7', 'cargo', 'Drone Loader Bay', 3, 30, 1500, 'dronebay', 'An open bay with a little loader drone that orbits the haul. Carry up to 30 item stacks.'),
  P('cargo8', 'cargo', 'Mag-Lev Rack', 4, 44, 3100, 'magrack', 'Crates float a finger above their cradle on humming mag-rails. Carry up to 44 item stacks.'),
  P('cargo9', 'cargo', 'Armored Lockers', 4, 40, 3000, 'armory', 'Twin riveted strongboxes with combination wheels. Carry up to 40 item stacks.'),
  P('cargo10', 'cargo', 'Cryo Cooler Hold', 4, 42, 3100, 'cooler', 'A frosted, vented cold-hold breathing pale mist. Carry up to 42 item stacks.'),
  P('cargo11', 'cargo', 'Galleon Deck', 5, 56, 6600, 'galleon', 'A ship-deck cargo rig with furled sailcloth and brass cleats. Carry up to 56 item stacks.', 'legendary'),
  P('cargo12', 'cargo', "Dragon's Hoard", 5, 60, 6900, 'hoard', 'An open chest brimming with coin that glints when she moves. Carry up to 60 item stacks.', 'legendary'),
  P('cargo13', 'cargo', 'Pocket Dimension Hold', 6, 80, 14000, 'dimensional', 'A folded-space cube; the inside is bigger than the outside. Obviously. Carry up to 80 item stacks.', 'ultra'),
  P('cargo14', 'cargo', 'Chronos Paradox Vault', 6, 85, 14800, 'chronosvault', 'A time-dilating vault that loops inventory space, carrying up to 85 item stacks.', 'ultra'),
  P('cargo15', 'cargo', 'Gloomwyrm Maw Hold', 6, 88, 15200, 'gloomstomach', 'A living bio-sack that digests and stores up to 88 item stacks in pocket folds.', 'ultra'),
  P('cargo16', 'cargo', 'Void Abyss Pocket', 6, 90, 15500, 'voidhold', 'A miniature black hole portal resting on the chassis. Carry up to 90 item stacks.', 'ultra'),
  P('cargo17', 'cargo', 'Plasma-Shielded Rack', 6, 92, 15800, 'plasmacrate', 'Industrial crate stacks protected by a dense, glowing energy field. Carry up to 92 item stacks.', 'ultra'),
  P('cargo18', 'cargo', 'Crystal-Cluster Hold', 6, 95, 16000, 'crystalhoard', 'An open geode vault lined with raw minerals. Carry up to 95 item stacks.', 'ultra'),


  // ===================== NEW CANNONS =====================
  P('cannon5', 'cannon', 'Scatter Pod', 2, 2, 700, 'scatterpod', 'A fan of stubby barrels. Also stuns foes: +10% first-strike chance.'),
  P('cannon6', 'cannon', 'Rail Spike', 3, 3, 1700, 'railspike', 'A magnetic rail that spits a glowing spike. +25% first-strike chance.'),
  P('cannon7', 'cannon', 'Flak Battery', 3, 3, 1700, 'flak', 'A quad of short flak tubes that bark in unison. +25% first-strike chance.'),
  P('cannon8', 'cannon', 'Plasma Lance', 4, 4, 3400, 'plasma', 'A vented coil-lance that builds a hissing plasma bolt. +35% first-strike chance.'),
  P('cannon9', 'cannon', 'Frost Lance', 4, 4, 3400, 'frostlance', 'A rimed barrel that fires a shard of supercooled air. +35% first-strike chance.'),
  P('cannon10', 'cannon', 'Siege Mortar', 4, 4, 3600, 'siege', 'A short, fat mortar that lobs shells over the rocks. +35% first-strike chance.'),
  P('cannon11', 'cannon', 'Arc Lance', 5, 5, 6900, 'arclance', 'A twin-prong lance that leaps lightning between its tips. +45% first-strike chance.', 'legendary'),
  P('cannon12', 'cannon', 'Stormcaller Array', 5, 5, 7200, 'stormcaller', 'A six-tube rocket cluster of pure Stormcall pedigree. +45% first-strike chance.', 'legendary'),
  P('cannon13', 'cannon', 'Annihilator Cannon', 6, 6, 15000, 'annihilator', 'A folded-sky siege gun haloed in pink fire. Foes simply leave. +55% first-strike chance.', 'ultra'),
  P('cannon14', 'cannon', 'Chronos Tachyon Beam', 6, 6, 14800, 'chronoscannon', 'A brass hourglass cannon shooting temporal beams. +50% first-strike chance.', 'ultra'),
  P('cannon15', 'cannon', 'Gloomwyrm Acid Spitter', 6, 6, 15200, 'gloomspit', 'An organic mouth firing globs of glowing corrosive spit. +50% first-strike chance.', 'ultra'),
  P('cannon16', 'cannon', 'Void Ray Cannon', 6, 6, 15500, 'voidcannon', 'A dark matter projector firing high-gravity singularities. +50% first-strike chance.', 'ultra'),
  P('cannon17', 'cannon', 'Hyper-Plasma Blaster', 6, 6, 15800, 'plasmacannon', 'A heavy double-coil gun discharging massive plasma bolts. +50% first-strike chance.', 'ultra'),
  P('cannon18', 'cannon', 'Crystalline Prism Cannon', 6, 6, 16000, 'crystalbeam', 'An amplifying focusing crystal that directs a searing beam. +50% first-strike chance.', 'ultra'),


  // ===================== NEW SCANNERS =====================
  P('scanner5', 'scanner', 'Brass Periscope', 2, 2, 650, 'periscope', 'A crank-up brass periscope with a swivelling prism. Wider reveal; chests ping on the map.'),
  P('scanner6', 'scanner', 'Radar Dish', 3, 3, 1500, 'dish', 'A slow-sweeping parabolic dish. Full-floor chest & stair pings, wide reveal.'),
  P('scanner7', 'scanner', 'Pulse-LIDAR Sweep', 3, 3, 1500, 'lidar', 'A spinning ring of laser emitters that paints the floor in pulses. Full-floor pings, wide reveal.'),
  P('scanner8', 'scanner', 'Recon Drone Mast', 4, 4, 3200, 'droneprobe', 'A little recon drone tethered above the mast, scouting ahead. Sees half a floor at a glance.'),
  P('scanner9', 'scanner', 'Tri-Owl Cluster', 4, 4, 3200, 'triowl', 'Three owl-eye dishes on a slow carousel. Nothing on the floor stays hidden.'),
  P('scanner10', 'scanner', 'Spirit Lantern', 4, 4, 3300, 'spirit', 'A floating witch-lantern whose flame leans toward unseen treasure. Sees half a floor.'),
  P('scanner11', 'scanner', 'Starchart Orrery', 5, 5, 6700, 'starchart', 'A brass orrery of orbiting moons that maps the floor like a constellation. Total reveal.', 'legendary'),
  P('scanner12', 'scanner', 'Seraphic Halo', 5, 5, 7000, 'seraphic', 'A ring of feather-light wings around an all-seeing eye. Total reveal.', 'legendary'),
  P('scanner13', 'scanner', 'Cosmic Oculus', 6, 6, 14000, 'cosmic', 'A levitating galaxy-eye that simply knows where everything is. Nothing is hidden from it.', 'ultra'),
  P('scanner14', 'scanner', 'Chronos Chronoscope', 6, 6, 14800, 'chronosscope', 'A spinning clock face that scans the terrain in multiple timelines. Total reveal.', 'ultra'),
  P('scanner15', 'scanner', 'Gloomwyrm All-Seeing Eye', 6, 6, 15200, 'gloomeye', 'A giant blinking organic eye on a fleshy stalk that senses life. Total reveal.', 'ultra'),
  P('scanner16', 'scanner', 'Void Rift Probe', 6, 6, 15500, 'voidscanner', 'A miniature purple void rift emitting cosmic scanner rays. Total reveal.', 'ultra'),
  P('scanner17', 'scanner', 'Plasma Sweep LIDAR', 6, 6, 15800, 'plasmalidar', 'A high-speed spinning plasma ring sweeping the area with lasers. Total reveal.', 'ultra'),
  P('scanner18', 'scanner', 'Crystalline Refractor', 6, 6, 16000, 'crystalprism', 'A floating prism array splitting and refracting light beams. Total reveal.', 'ultra'),


  // ===================== NEW LEGS / WHEELS — every stride unique & fully animated =====================
  P('legs5', 'legs', 'Mantis Striders', 2, 18, 700, 'mantis', 'Six blade-shinned legs that fold like a praying mantis: 18% of steps cost no Energy.'),
  P('legs6', 'legs', 'Raptor Sprint Legs', 2, 20, 750, 'raptor', 'Four digitigrade sprinter legs built to bound: 20% of steps cost no Energy.'),
  P('legs7', 'legs', 'Titan Hydraulics', 3, 24, 1600, 'titan', 'Four colossal hydraulic pillars that piston with each stride: 24% of steps cost no Energy.'),
  P('legs8', 'legs', 'Centipod Myriapod Legs', 3, 26, 1700, 'centipede', 'Ten little legs rippling in a wave down both flanks: 26% of steps cost no Energy.'),
  P('legs9', 'legs', 'Trailblazer Wheels', 3, 28, 1800, 'wheeler', 'Four knobby off-road wheels on bouncing suspension arms: 28% of steps cost no Energy.'),
  P('legs10', 'legs', 'Hexroller Drive', 4, 34, 3300, 'hexwheel', 'Six powered wheels, three a side, that never lose their grip: 34% of steps cost no Energy.'),
  P('legs11', 'legs', 'Crystalstride Legs', 4, 40, 3500, 'crystal', 'Eight faceted crystal legs that chime and glow as they walk: 40% of steps cost no Energy.'),
  P('legs12', 'legs', 'Siege Treads', 4, 36, 3400, 'tread', 'Twin tank treads of scrolling steel cleats that crush any ground: 36% of steps cost no Energy.'),
  P('legs13', 'legs', 'Royal Guard Octapods', 5, 46, 6800, 'royalguard', 'Eight ornate gold legs with haloed joints, marching in honour-guard step: 46% of steps cost no Energy.', 'legendary'),
  P('legs14', 'legs', 'Skimmer Hover Pads', 5, 54, 7200, 'hover', 'Four anti-grav thruster pads — no legs at all, just a glowing glide: 54% of steps cost no Energy.', 'legendary'),
  P('legs15', 'legs', 'Maglev Orbiters', 5, 50, 7000, 'orbiter', 'Four spinning mag-lev orbs that carry her without ever touching down: 50% of steps cost no Energy.', 'legendary'),
  P('legs16', 'legs', 'Seraph Drift Wings', 6, 66, 14500, 'seraph', 'Eight haloed wing-legs of folded light that barely acknowledge the ground: 66% of steps cost no Energy.', 'ultra'),
  P('legs17', 'legs', 'Chronos Gear-Walkers', 6, 70, 14800, 'clockwork', 'Four mechanical brass legs that walk with precise mechanical ticks: 70% of steps cost no Energy.', 'ultra'),
  P('legs18', 'legs', 'Gloomwyrm Monster Legs', 6, 72, 15200, 'monster', 'Six organic spiky monster legs wrapped in scales: 72% of steps cost no Energy.', 'ultra'),
  P('legs19', 'legs', 'Void Tendril Legs', 6, 74, 15500, 'voidtentacles', 'Eight dark energy tentacles that glide silently over the ground: 74% of steps cost no Energy.', 'ultra'),
  P('legs20', 'legs', 'Jellatin Slime Drag', 6, 68, 14200, 'jellatin', 'A gelatinous slug foot dragging the crawler along: 68% of steps cost no Energy.', 'ultra'),
  P('legs21', 'legs', 'Grim Scythe Legs', 6, 75, 16000, 'reaper', 'Eight sleek obsidian blades that pull the crawler forward: 75% of steps cost no Energy.', 'ultra'),

].map(p => [p.id, p]));

// ---------------- Crawler paint jobs ----------------
export interface PaintJob {
  id: string; name: string; price: number; desc: string;
  color: number; metalness: number; roughness: number;
  emissive?: number; emissiveIntensity?: number;
  /** CSS color for UI swatches */
  swatch: string;
}
const PJ = (id: string, name: string, price: number, color: number, metalness: number, roughness: number, swatch: string, desc: string,
  emissive?: number, emissiveIntensity?: number): PaintJob =>
  ({ id, name, price, color, metalness, roughness, swatch, desc, emissive, emissiveIntensity });

export const PAINT_JOBS: Record<string, PaintJob> = Object.fromEntries([
  PJ('p_crimson', 'Crimson Fang', 120, 0xb83232, 0.55, 0.4, '#b83232', 'Aggressive racing red. Wild Guardians respect it. Probably.'),
  PJ('p_cobalt', 'Cobalt Drift', 120, 0x2a5ad8, 0.55, 0.4, '#2a5ad8', 'Deep harbor blue, Mistveil-approved.'),
  PJ('p_verdant', 'Verdant Wing', 120, 0x3a8a3a, 0.5, 0.45, '#3a8a3a', 'Forest lacquer mixed with real leaf oil.'),
  PJ('p_amber', 'Tharkand Amber', 140, 0xc4822a, 0.6, 0.35, '#c4822a', 'Dune-burnished orange from the eastern waste.'),
  PJ('p_violet', 'Duskwatch Violet', 140, 0x6a3a9a, 0.6, 0.35, '#6a3a9a', 'The color of the hour the lamps come on.'),
  PJ('p_stealth', 'Midnight Stealth', 220, 0x1c1e26, 0.3, 0.8, '#1c1e26', 'Matte blackout. The scanner mast still gives you away.'),
  PJ('p_pearl', 'Pearl White', 260, 0xe8e4da, 0.4, 0.2, '#e8e4da', 'Nacre-polished and showroom-proud.'),
  PJ('p_gold', 'Royal Gold', 480, 0xc9a24a, 0.9, 0.2, '#c9a24a', 'Actual gold leaf. Dax charges extra to even look at it.'),
  PJ('p_chrome', 'Stormchrome', 420, 0x9aa4b8, 0.95, 0.12, '#b8c2d4', 'Mirror chrome that catches every lightning flash.'),
  PJ('p_aether', 'Aetherglow', 640, 0xff9ad2, 0.5, 0.3, '#ff9ad2', 'Faintly luminous pink — pigment ground from a fallen halo, allegedly.', 0xff6ab8, 0.35),
  PJ('p_emberveil', 'Emberveil', 320, 0xd8542a, 0.55, 0.32, '#ff7a3a', 'Coal-black lacquer with banked-ember undertones that breathe when the light moves.', 0xf24a1a, 0.4),
  PJ('p_tidewatch', 'Tidewatch Teal', 200, 0x1f8a8a, 0.6, 0.3, '#1f8a8a', 'Harbor-glass teal flecked with salt-white. Mistveil dock crews swear by it.'),
  PJ('p_mosswyrm', 'Mosswyrm Green', 200, 0x2f6b3a, 0.45, 0.55, '#2f6b3a', 'Living moss-lacquer that smells faintly of rain and old forests.'),
  PJ('p_vault', 'Vaultiron', 240, 0x4a4e5a, 0.85, 0.25, '#5a5e6a', 'Gunmetal with a brushed sheen — the finish of the Sunken Vault\'s own war-engines.'),
  PJ('p_solar', 'Solar Flare', 360, 0xf2a83a, 0.7, 0.25, '#ffc04a', 'Molten gold-orange that seems to hold its own sunrise.', 0xf2832a, 0.3),
  PJ('p_void', 'Voidpetal', 580, 0x2a1e44, 0.4, 0.4, '#3a2a5a', 'Deep umbral purple shot through with drifting motes of starlight.', 0x6a3a9a, 0.45),
  PJ('p_glacier', 'Glacier Pale', 300, 0xaccfe2, 0.55, 0.2, '#accfe2', 'Frost-white nacre with a cold blue heart, mirror-buffed by Coldcurrent ice-wrights.', 0x6ab8e8, 0.2),
  PJ('p_prism', 'Prismshift', 760, 0xc8b4f2, 0.85, 0.15, '#c8b4f2', 'A dichroic clearcoat that throws a different color from every angle. Dax calls it "the headache".', 0xa088e8, 0.3),
].map(p => [p.id, p]));

// ---------------- Grand Houses ----------------
export interface HouseDef { id: string; name: string; type: GType; starter: string; master: string; motto: string; color: string; }
export const HOUSES: HouseDef[] = [
  { id: 'pyrelight', name: 'House Pyrelight', type: 'Blaze', starter: 'cindcub', master: 'Master Bren', motto: 'Burn brighter than your doubt.', color: '#f2603a' },
  { id: 'mistveil', name: 'House Mistveil', type: 'Tide', starter: 'puddla', master: 'Mistress Sera', motto: 'Still water carves the canyon.', color: '#3a9df2' },
  { id: 'thornward', name: 'House Thornward', type: 'Verdant', starter: 'sproutle', master: 'Warden Oakes', motto: 'Roots first, then branches.', color: '#4ec45e' },
  { id: 'stormcall', name: 'House Stormcall', type: 'Volt', starter: 'zaplet', master: 'Captain Vex', motto: 'Strike once, strike true.', color: '#f2d23a' },
  { id: 'duskwatch', name: 'House Duskwatch', type: 'Umbra', starter: 'shadekit', master: 'Keeper Nyx', motto: 'See what the light hides.', color: '#9a5af2' },
  // Terra City Guilds (prestigious and old)
  { id: 'devas', name: 'House Devas', type: 'Gale', starter: 'plumelet', master: 'Archon Kaelen', motto: 'Ascend above the worldly storms.', color: '#ffd700' },
  { id: 'noctus', name: 'House Noctus', type: 'Umbra', starter: 'mournmoth', master: 'Sire Vesper', motto: 'The dark remembers what the light forgot.', color: '#7a00ff' },
  { id: 'jurah', name: 'House Jurah', type: 'Verdant', starter: 'sproutle', master: 'Elder Morana', motto: 'Deep roots outlast the fiercest fire.', color: '#a0522d' },
  { id: 'quazor', name: 'House Quazor', type: 'Volt', starter: 'zaplet', master: 'Master Quade', motto: 'Channel the cosmic spark.', color: '#00ffff' },
  // Continent in the West (placeholders)
  { id: 'west1', name: 'House Dustrunner', type: 'Gale', starter: 'plumelet', master: 'Warden Coyle', motto: 'Ride the desert winds.', color: '#d2b48c' },
  { id: 'west2', name: 'House Ironclad', type: 'Umbra', starter: 'cryptling', master: 'Captain Ironwood', motto: 'Unyielding under pressure.', color: '#708090' },
  { id: 'west3', name: 'House Sunforge', type: 'Blaze', starter: 'cindcub', master: 'Mistress Forge', motto: 'Shaped by fire, hardened by resolve.', color: '#ff4500' },
  { id: 'west4', name: 'House Deepcurrent', type: 'Tide', starter: 'puddla', master: 'Diver Oron', motto: 'Fear no depths.', color: '#000080' },
  { id: 'west5', name: 'House Stormwatch', type: 'Volt', starter: 'zaplet', master: 'Keeper Vance', motto: 'The eye of the tempest.', color: '#4682b4' },
];

// ---------------- Dungeons ----------------
export interface DungeonDef {
  id: string; name: string; floors: number;
  levelRange: [number, number];
  pool: string[];               // wild species ids
  boss?: string; bossLevel?: number;
  theme: 'cavern' | 'vault' | 'storm';
  unlockFlag?: string;          // story flag required
  rewardShards: number;
  desc: string;                 // overworld flavor text
  hidden?: boolean;             // never shown on the overworld globe (entered from elsewhere)
  drop?: { item: string; chance: number; max?: number };  // wild battles can shed a story relic
  coords: [number, number];     // [latitude, longitude] degrees on the overworld globe
  quest?: boolean;              // story-quest dungeon (red highlight on the overworld)
  region?: string;              // overworld region id (default 'aurel')
}

// ---------------- Overworld regions ----------------
// The world is bigger than one globe. Regions unlock through the
// Chronicle; the Region Atlas (T on the overworld) travels between them.
export interface RegionDef {
  id: string; name: string; icon: string; desc: string;
  unlockFlag?: string;          // story flag required to travel there
  /** atlas hint shown while the region is still locked */
  lockedHint: string;
}
export const REGIONS: RegionDef[] = [
  { id: 'aurel', name: 'Overworld of Aurel', icon: '🌍',
    desc: 'The Capital Region — Haven City, the University, and the proving grounds of every new Tamer.',
    lockedHint: '' },
  { id: 'turmal', name: 'The Floating Island of Turmal', icon: '🏝️', unlockFlag: 'turmal_unlocked',
    desc: 'An island adrift above the western sea. Home of the Seasonal Tournament — and of older things beneath its keel.',
    lockedHint: 'The Chronicle will carry you there, in time.' },
];

export const DUNGEONS: DungeonDef[] = [
  { id: 'trial', name: 'Trial Caverns', floors: 2, levelRange: [3, 5], theme: 'cavern',
    pool: ['pebblit', 'cinderbat', 'gloomite', 'sparkmote', 'ashwisp', 'cryptling', 'pyropup', 'bubbledrag', 'seedsqrl', 'flamesal', 'wavepup', 'leaffawn'], boss: 'ironhusk', bossLevel: 7, rewardShards: 300,
    desc: 'The academy\'s proving grounds, carved beneath the old citadel.', coords: [14, -28] },
  { id: 'mossdeep', name: 'Mossdeep Burrows', floors: 3, levelRange: [2, 5], theme: 'cavern',
    pool: ['pebblit', 'sproutle', 'mistling', 'zephlet', 'gloomite', 'fernfox', 'shroomple', 'plumelet', 'coralkit', 'joltuft', 'mistpaw', 'sporepix', 'nebulet', 'snapsprout', 'shocklamb', 'spacepup'], rewardShards: 250,
    desc: 'Soft green tunnels dug by generations of gentle Guardians. A fine first expedition.', coords: [10, 26] },
  { id: 'sunken', name: 'Sunken Vault', floors: 4, levelRange: [9, 14], theme: 'vault',
    pool: ['mistling', 'gloomite', 'cinderbat', 'puddla', 'shadekit', 'sparkmote', 'frostfin', 'coralkit', 'mournmoth', 'driftling', 'reefrider', 'magmatot', 'coralbud', 'rootlet', 'joltmous', 'coalbug', 'jellymote', 'barkchick'], boss: 'gravemaw', bossLevel: 17, rewardShards: 900, unlockFlag: 'joined_house',
    desc: 'A drowned treasury of the old empire. Something below still remembers being worshipped.', coords: [-18, 52], quest: true },
  { id: 'stormspire', name: 'Stormspire Depths', floors: 5, levelRange: [15, 22], theme: 'storm',
    pool: ['sparkmote', 'zephlet', 'voltyx', 'galewing', 'duskfang', 'thornbex', 'gearmite', 'smolderhog', 'ampyre', 'skydancer', 'duskweaver', 'bramblelynx', 'sparkeef', 'galewyrm', 'voidkit', 'sparksparrow', 'starowlet', 'gloomwing'], boss: 'voltigarch', bossLevel: 26, rewardShards: 2200, unlockFlag: 'vault_cleared',
    desc: 'A war-spire that never stopped humming. Its last order was never rescinded.', coords: [38, 96], quest: true },
  // story chapter III — Veyl's amber lies in the wild sparks of the mire
  { id: 'thunderfen', name: 'Thunderfen Mire', floors: 3, levelRange: [8, 12], theme: 'storm',
    pool: ['joltuft', 'sparkmote', 'gearmite', 'ampyre', 'mistling', 'shroomple', 'nimbusyl', 'puddla', 'zephlet', 'stormchick', 'flarefly', 'voltcrab'],
    boss: 'dynamaul', bossLevel: 15, rewardShards: 700, unlockFlag: 'historian_intel',
    drop: { item: 'storm_amber', chance: 1.0, max: 1 },
    desc: 'A drowned bog that appeared overnight where lightning keeps striking the same dead trees. The wild Guardians here carry sparks fossilized in amber.', coords: [32, -18], quest: true },
  // story chapter V — Greggy's test, entered from Agdao Island itself
  { id: 'cradle', name: 'Cradle Hollow', floors: 3, levelRange: [18, 24], theme: 'cavern', hidden: true,
    pool: ['coralkit', 'reefrider', 'fernfox', 'shroomple', 'plumelet', 'driftling', 'mournmoth', 'pearlance', 'bramblelynx', 'frostfin', 'cosmolet', 'vampbat', 'gravemini', 'cindawing', 'seaturt', 'nebwyrm', 'duskkitty', 'crypttot'],
    boss: 'grovetyrant', bossLevel: 27, rewardShards: 1800,
    desc: 'The sea-cave where Aurelia made the First Bond, seven hundred years ago. Something corrupted has nested in the world\'s gentlest place.', coords: [-6, -44], quest: true },
  // Act V chapter XXIII — the Foretales relay-bastion above New Salmonan,
  // entered from the valley's ridge stair (never shown on the globe)
  { id: 'mirrorhouse', name: 'The Mirrorhouse', floors: 5, levelRange: [46, 52], theme: 'storm', hidden: true,
    pool: ['gloomite', 'mournmoth', 'duskweaver', 'nightloom', 'cryptling', 'sarcophang', 'gearmite', 'ampyre', 'teslarch', 'voltyx', 'nocthowl'],
    boss: 'phantasmoth', bossLevel: 54, rewardShards: 6500,
    desc: 'The Foretales relay-bastion where the eastern valleys\' news is made — before it happens. Dark glass, dead-light conduits, and a print floor that has never once stopped.', coords: [12, 70], quest: true },
  { id: 'drowned_terminal', name: 'Drowned Terminal', floors: 4, levelRange: [28, 34], theme: 'vault', hidden: true,
    pool: ['frostfin', 'coralkit', 'reefrider', 'pearlance', 'jellymote', 'abyssarch', 'seaturt', 'frostfin', 'wavepup'],
    boss: 'vormaela', bossLevel: 36, rewardShards: 4500,
    desc: 'Hyujon\'s flooded mag-rail underworks. Rusted rails, drowned machinery, and the Communion Tideling-Mother Vormaela\'s Echo lurking in the deep.', coords: [52, 12], quest: true },
  // ENDGAME — Aether trials, opened once a Tamer has walked Terra City. The
  // bosses here are uncatchable Aether-tier world-enders (captureBase 0); the
  // wild pool holds high Split/Special forms worth hunting on the way down.
  { id: 'emberthrone', name: 'The Emberthrone', floors: 5, levelRange: [70, 84], theme: 'cavern',
    pool: ['magmaroth', 'vulkragon', 'pyrelisk', 'coalossus', 'lavaserpent', 'heliarch'],
    boss: 'solmageddon', bossLevel: 92, rewardShards: 14000, unlockFlag: 'terra_visited',
    drop: { item: 'transcend_sigil', chance: 1.0, max: 1 },
    desc: 'A throne of magma in the grave of a dead star. Something vast is waking in the heat — and it is not glad of company.', coords: [-46, -10], quest: true },
  { id: 'lastdark', name: 'The Last Dark', floors: 5, levelRange: [74, 88], theme: 'vault',
    pool: ['nyxmaw', 'umbraknell', 'voidgoyle', 'shadowstalker', 'sarcophang', 'umbrarch'],
    boss: 'nihilumbra', bossLevel: 95, rewardShards: 16000, unlockFlag: 'terra_visited',
    drop: { item: 'aether_shard', chance: 1.0, max: 1 },
    desc: 'Beyond the deepest vault, a door opens onto nothing at all. The cold here remembers the first night, before there were stars to lose.', coords: [-60, 150], quest: true },
];

export const SHOP_STOCK = ['tonic', 'tonic_plus', 'soda', 'soda_plus', 'soda_max', 'berry', 'honey_roll', 'star_treat', 'aether_confit', 'revive_leaf', 'revive_bloom', 'cell', 'cell_plus', 'cell_max', 'plating', 'plating_plus', 'elixir'];
export const GEM_STOCK = ['atk_gem', 'def_gem', 'spd_gem', 'wis_gem', 'hp_gem', 'sp_gem', 'prism_gem'];

// ---------------- Passive Skills ----------------
export interface PassiveSkill {
  name: string;
  desc: string;
}

export function getSpeciesPassive(sp: SpeciesDef): PassiveSkill {
  // Custom overrides for starter and legendary lines
  const custom: Record<string, PassiveSkill> = {
    // Blaze starter line
    cindcub: { name: 'Solar Flare', desc: 'Attacks have a 25% chance to melt target\'s Defense.' },
    pyrofang: { name: 'Solar Flare', desc: 'Attacks have a 25% chance to melt target\'s Defense.' },
    blazemaw: { name: 'Solar Flare', desc: 'Attacks have a 25% chance to melt target\'s Defense.' },
    infernyx: { name: 'Solar Flare', desc: 'Attacks have a 25% chance to melt target\'s Defense.' },
    solarex: { name: 'Solar Flare', desc: 'Attacks have a 25% chance to melt target\'s Defense.' },
    // Tide starter line
    puddla: { name: 'Torrential Surge', desc: 'Healing moves restore 30% more HP.' },
    tidefin: { name: 'Torrential Surge', desc: 'Healing moves restore 30% more HP.' },
    maelstrike: { name: 'Torrential Surge', desc: 'Healing moves restore 30% more HP.' },
    abyssarch: { name: 'Torrential Surge', desc: 'Healing moves restore 30% more HP.' },
    leviathorn: { name: 'Torrential Surge', desc: 'Healing moves restore 30% more HP.' },
    // Verdant starter line
    sproutle: { name: 'Verdant Growth', desc: 'Heals 8% of max HP at the start of each round.' },
    thornbex: { name: 'Verdant Growth', desc: 'Heals 8% of max HP at the start of each round.' },
    sylvigor: { name: 'Verdant Growth', desc: 'Heals 8% of max HP at the start of each round.' },
    eldergrove: { name: 'Verdant Growth', desc: 'Heals 8% of max HP at the start of each round.' },
    yggdranox: { name: 'Verdant Growth', desc: 'Heals 8% of max HP at the start of each round.' },
    // Volt starter line
    zaplet: { name: 'Lightning Reflexes', desc: 'Starts battle with a permanent Speed boost.' },
    voltyx: { name: 'Lightning Reflexes', desc: 'Starts battle with a permanent Speed boost.' },
    stormclaw: { name: 'Lightning Reflexes', desc: 'Starts battle with a permanent Speed boost.' },
    fulgurex: { name: 'Lightning Reflexes', desc: 'Starts battle with a permanent Speed boost.' },
    raidenjin: { name: 'Lightning Reflexes', desc: 'Starts battle with a permanent Speed boost.' },
    // Gale starter line
    wispry: { name: 'Sky Sovereign', desc: 'Wind (Gale) moves deal 20% more damage.' },
    galewing: { name: 'Sky Sovereign', desc: 'Wind (Gale) moves deal 20% more damage.' },
    cyclonix: { name: 'Sky Sovereign', desc: 'Wind (Gale) moves deal 20% more damage.' },
    tempestrix: { name: 'Sky Sovereign', desc: 'Wind (Gale) moves deal 20% more damage.' },
    zephyrax: { name: 'Sky Sovereign', desc: 'Wind (Gale) moves deal 20% more damage.' },
    // Umbra starter line
    shadekit: { name: 'Void Embrace', desc: 'All attacks drain 15% of damage dealt as HP.' },
    duskfang: { name: 'Void Embrace', desc: 'All attacks drain 15% of damage dealt as HP.' },
    nocthowl: { name: 'Void Embrace', desc: 'All attacks drain 15% of damage dealt as HP.' },
    umbrelisk: { name: 'Void Embrace', desc: 'All attacks drain 15% of damage dealt as HP.' },
    chthonix: { name: 'Void Embrace', desc: 'All attacks drain 15% of damage dealt as HP.' },
    // Legends' Nine custom overrides
    firgara: { name: 'Eternal Burning', desc: 'Deals 25% of Attack to all foes at the end of each round.' },
    onthrofa: { name: 'Temporal Barrier', desc: 'Heals 5% max HP and boosts Speed stage by 1 at the end of each round.' },
    vulfenix: { name: 'Rebirth Flame', desc: 'Heals 5% max HP at the end of each round.' },
    raijura: { name: 'Static Overload', desc: 'Starts battle with 25% Speed boost and deals 15% Attack to all foes at the end of each round.' },
    voltherion: { name: 'Lightning Core', desc: 'Heals 3% max HP and boosts Attack stage by 1 at the end of each round.' },
    fulgrath: { name: 'Fulgurant Aura', desc: 'Deals 20% Wisdom to all foes at the end of each round.' },
    verdalune: { name: 'Lunar Blessing', desc: 'Heals 5% max HP and restores 5 SP at the end of each round.' },
    gaiathorn: { name: 'Rooted Shield', desc: 'Heals 4% max HP and grants 10% max HP shield at the end of each round.' },
    nyxroot: { name: 'Abyssal Siphon', desc: 'Drains 3% HP from all foes at the end of each round.' },
  };

  if (custom[sp.id]) return custom[sp.id];

  // Procedural generation based on Element & Archetype
  const elemNames: Record<GType, string> = {
    Blaze: 'Flame', Tide: 'Aqua', Verdant: 'Flora', Volt: 'Volt', Gale: 'Zephyr', Umbra: 'Shadow'
  };
  const archNames: Record<string, string> = {
    beast: 'Instinct', serpent: 'Venom', avian: 'Swiftness', brute: 'Might', sprite: 'Aura', shell: 'Guard'
  };

  const name = `${elemNames[sp.type] || 'Aether'} ${archNames[sp.archetype] || 'Essence'}`;
  
  // Procedural desc based on archetype
  let desc = 'Gains a battle advantage.';
  const rank = formRank(sp);
  if (rank >= 1) {
    if (sp.type === 'Verdant' || sp.type === 'Tide') {
      const pName = rank === 1 ? 'Springing Dew' : rank === 2 ? 'Life-Sap' : rank === 3 ? 'Nature\'s Pulse' : 'Aetherial Bloom';
      const val = rank === 1 ? 2 : rank === 2 ? 3 : rank === 3 ? 4 : 5;
      return { name: pName, desc: `Heals ${val}% of max HP at the end of each round.` };
    }
    if (sp.type === 'Blaze') {
      const pName = rank === 1 ? 'Spark Singe' : rank === 2 ? 'Kindle' : rank === 3 ? 'Eruptive Core' : 'Solar Winds';
      const val = rank === 1 ? 10 : rank === 2 ? 15 : rank === 3 ? 20 : 25;
      return { name: pName, desc: `Deals ${val}% of Attack to all foes at the end of each round.` };
    }
    if (sp.type === 'Volt') {
      const pName = rank === 1 ? 'Static Touch' : rank === 2 ? 'Volt Discharge' : rank === 3 ? 'Overcharged Aura' : 'Storm Core';
      const val = rank === 1 ? 10 : rank === 2 ? 15 : rank === 3 ? 20 : 25;
      return { name: pName, desc: `Deals ${val}% of Wisdom to all foes at the end of each round.` };
    }
    if (sp.type === 'Gale') {
      const pName = rank === 1 ? 'Zephyr Breeze' : rank === 2 ? 'Slipstream' : rank === 3 ? 'Gale Aura' : 'Sky Domain';
      const val = rank === 1 ? 2 : rank === 2 ? 3 : rank === 3 ? 4 : 5;
      return { name: pName, desc: `Boosts Speed stage by 1 and heals ${val}% of max HP at the end of each round.` };
    }
    if (sp.type === 'Umbra') {
      const pName = rank === 1 ? 'Shadow Leach' : rank === 2 ? 'Vitality Siphon' : rank === 3 ? 'Abyssal Feast' : 'Void Consumer';
      const val = rank === 1 ? 1 : rank === 2 ? 2 : rank === 3 ? 3 : 4;
      return { name: pName, desc: `Drains ${val}% HP from all foes at the end of each round.` };
    }
  }
  if (sp.archetype === 'beast') desc = '+10% Attack in battle.';
  else if (sp.archetype === 'serpent') desc = '+10% Wisdom in battle and immune to poison status.';
  else if (sp.archetype === 'avian') desc = '+10% Speed in battle.';
  else if (sp.archetype === 'brute') desc = '+10% Attack & HP in battle.';
  else if (sp.archetype === 'sprite') desc = '+15% Wisdom in battle.';
  else if (sp.archetype === 'shell') desc = '+15% Defense in battle.';

  return { name, desc };
}

// Dynamically distribute the 60 new techniques to all species of the corresponding element
Object.values(SPECIES).forEach(sp => {
  const newTechs = Object.values(TECHS).filter(t => t.type === sp.type && (t.statusEffect || t.effect === 'revive'));
  newTechs.forEach(t => {
    const levelMap: Record<string, number> = {
      // Blaze
      magma_spit: 3, pyro_shield: 7, blazing_claw: 11, heat_wave: 15, combustion: 19,
      sun_channel: 23, flame_charge: 27, eruption_strike: 31, solar_burst: 35, supernova: 42,
      scorch_burst: 5, pyre_ward: 10, sunflare_blast: 16, blazing_temper: 22, ember_barrage: 28,
      crimson_overdrive: 34, magma_deluge: 40, solar_blessing: 46,
      // Tide
      aqua_splash: 3, chilling_wind: 7, dew_drop: 11, ocean_sanctuary: 15, bubble_burst: 19,
      frost_bite: 23, tidal_wave_tech: 27, ice_spear: 31, aquatic_mend: 35, abyssal_drown: 42,
      wave_splash: 5, coral_shield: 10, frost_breath: 16, tsunami_surge: 22, tide_meld: 28,
      deep_pressure: 34, aquatic_restoration: 40, abyssal_grip: 46, aether_restoration: 36,
      // Verdant
      vine_grip: 3, spore_puff: 7, root_mend: 11, leaf_shield: 15, nature_strike: 19,
      toxic_thorn: 23, spore_cloud: 27, earthquake_tech: 31, bramble_growth: 35, forest_wrath_tech: 42,
      needle_leaf: 5, bark_armor: 10, bramble_entangle: 16, nature_nourish: 22, canopy_shield: 28,
      petal_dance_tech: 34, spore_blast: 40, wrath_of_ghandra: 46,
      // Volt
      spark_shock: 3, voltage_boost: 7, lightning_strike_tech: 11, static_shield: 15, chain_lightning_tech: 19,
      thunder_fang_tech: 23, overload_burst: 27, plasma_blast: 31, shock_pulse: 35, voltage_tempest_tech: 42,
      static_spark: 5, volt_shield: 10, thunderclap_strike: 16, overcharge_aura: 22, plasma_blade: 28,
      magnetic_pulse: 34, chain_lightning_v2: 40, superconductor: 46,
      // Gale
      wind_slap: 3, tailwind_breeze: 7, feather_blade_tech: 11, zephyr_barrier: 15, cyclone_trap_tech: 19,
      wind_shear_tech: 23, sonic_boost: 27, hurricane_slash_tech: 31, gale_force_tech: 35, tempest_strike_tech: 42,
      breeze_strike: 5, wind_barrier: 10, feather_cyclone: 16, slipstream_boost: 22, sonic_boom_tech: 28,
      typhoon_slice: 34, aero_blast: 40, sky_embrace: 46,
      // Umbra
      shadow_scratch: 3, soul_drain_tech: 7, nightmare_fog: 11, dark_barrier: 15, shadow_strike_tech: 19,
      vampiric_bite_tech: 23, abyssal_void_tech: 27, doom_gaze: 31, eclipse_blast_tech: 35, apocalypse_tech: 42,
      shadow_jab: 5, dark_shroud: 10, nightmare_gaze: 16, void_siphon_v2: 22, abyssal_claw: 28,
      spectral_howl: 34, eclipse_blast_v2: 40, doom_whisper: 46, cosmic_revival: 50,
      // Revives
      tide_revive: 32, verdant_revive: 45,
    };
    
    const lvl = levelMap[t.id];
    if (lvl !== undefined) {
      sp.techs.push({ level: lvl, tech: t.id });
    }
  });
  
  // Sort techs by level so they display nicely
  sp.techs.sort((a, b) => a.level - b.level);
});

export const STAGE_STAT_MULT: [number, number][] = [
  [1.00, 1.00], // 0 Novice
  [1.15, 1.10], // 1 Adept
  [1.45, 1.25], // 2 Elite
  [1.85, 1.45], // 3 Apex
  [2.35, 1.70], // 4 Split
  [2.95, 2.00], // 5 Special
  [3.65, 2.35], // 6 Terra
  [4.45, 2.75], // 7 Transcendent
  [5.40, 3.20], // 8 Aether
];
export const LEVEL_CAP_BY_RANK = [35, 60, 95, 130, 160, 190, 220, 240, 255];

// Rebalance SP costs of all techniques dynamically based on their tiers and properties
Object.values(TECHS).forEach(t => {
  if (t.signature) {
    t.spCost = t.target === 'all' ? 240 : 220;
  } else if (t.effect === 'revive') {
    t.spCost = t.id === 'verdant_revive' ? 200 : 150;
  } else if (t.effect === 'flat_heal' || t.effect === 'percent_heal' || t.effect === 'heal') {
    if (t.target === 'all') {
      t.spCost = 180;
    } else if (t.id === 'spring_mend' || t.id === 'bloom_ward' || t.id === 'root_mend' || t.id === 'dew_drop') {
      t.spCost = 70;
    } else {
      t.spCost = (t.power >= 80 || t.id === 'aquatic_mend') ? 90 : 70;
    }
  } else {
    if (t.power === 0) {
      if (t.id === 'sun_channel') {
        t.spCost = 90;
      } else if (['blaze_rally', 'mist_veil', 'overcharge', 'tailwind'].includes(t.id)) {
        t.spCost = 20;
      } else {
        t.spCost = 50;
      }
    } else if (t.power >= 110) {
      t.spCost = 200;
    } else if (t.power >= 80) {
      t.spCost = t.target === 'all' ? 170 : 145;
    } else if (t.power >= 60) {
      t.spCost = 110;
    } else if (t.power >= 30) {
      t.spCost = 80;
    } else {
      if (t.target === 'all') {
        t.spCost = 50;
      } else {
        t.spCost = 20;
      }
    }
  }
});

// Set all Guardians starting SP (base SP) at 100
Object.values(SPECIES).forEach(sp => {
  sp.base.sp = 100;
});




// ==========================================
// Dynamic Signature Techniques Injections
// ==========================================
const GUARDIAN_SIGNATURE_TECHS: Record<string, string> = {
  'solphyra': 'celestial_supernova',
  'solmageddon': 'apocalyptic_flare',
  'maremortis': 'abyssal_drown',
  'worldwither': 'desolation_roots',
  'dynastorm': 'lightning_judgment',
  'voidtempest': 'vacuum_cataclysm',
  'nihilumbra': 'infinite_oblivion',
  'ashkarath': 'ash_domain',
  'vormaela': 'abyssal_trench',
  'bramblehex': 'curse_briars',
  'voltrazar': 'voltage_punishment',
  'gorrundax': 'titan_overgrowth',
  'cryomara': 'frost_prison',
  'luxavor': 'lux_eruption',
  'nyxghul': 'ghoul_feast',
  'zerathuul': 'wind_reaper',
  'aurelflare': 'aurelian_blaze',
  'abyssophar': 'abyss_seal',
  'genesophar': 'genesis_bloom',
  'voltranscend': 'transcendent_arc',
  'cosmovault': 'stellar_shield',
  'voidsovereign': 'sovereign_darkness',
  'ignisar': 'ignis_fury',
  'sylvaeon': 'nine_seasons',
  'erebusilk': 'erebus_web',
  'heliarch': 'helios_crown',
  'tidewraith': 'wraith_flood',
  'sylvanarch': 'arch_growth',
  'stormarch': 'storm_decree',
  'aeronarch': 'aero_vortex',
  'umbrarch': 'umbra_eclipse',
  'solarex': 'stellar_roar',
  'leviathorn': 'abyssal_tail',
  'yggdranox': 'world_seed',
  'raidenjin': 'raiden_punch',
  'zephyrax': 'zephyr_slice',
  'chthonix': 'chthonic_grip',
  'magmaroth': 'magma_fist',
  'maelgheist': 'ghost_wave',
  'thornmaw': 'vine_strangle',
  'voltgolem': 'tesla_crash',
  'cyclonaut': 'turbo_cyclone',
  'nyxmaw': 'nyx_devour',
  'pyrethon': 'terra_flare',
  'oceanarch': 'ocean_judgment',
  'terravine': 'earth_entangle',
  'galvanyx': 'galvanic_storm',
  'stratoterra': 'strato_blade',
  'tenebraterra': 'tenebrous_rift',
  'infernyx': 'inferno_dive',
  'abyssarch': 'abyssal_anchor',
  'eldergrove': 'elder_spores',
  'fulgurex': 'thunder_fang',
  'tempestrix': 'tempest_wing',
  'umbrelisk': 'umbra_gaze',
  'vulkragon': 'volcanic_slam',
  'nacrelord': 'pearl_gate',
  'grovetyrant': 'tyrant_root',
  'empyrhawk': 'empyrean_dive',
  'phantasmoth': 'phantasm_dust',
  'magmadrak': 'drake_fire',
  'coalossus': 'coal_barrage',
  'aurorafire': 'aurora_blast',
  'abysshound': 'abyss_bite',
  'abysssiren': 'siren_song',
  'oceantitan': 'titan_wave',
  'solarstag': 'solar_antler',
  'rotwyrm': 'decay_breath',
  'canopyhawk': 'canopy_swoop',
  'fulguram': 'fulgur_charge',
  'stormapex': 'apex_shock',
  'stormgoliath': 'goliath_charge',
  'nebulamort': 'nebula_strike',
  'galaxia': 'galaxy_spin',
  'cosmoclysm': 'cosmic_impact',
  'apocalypsebat': 'apocalypse_echo',
  'voidreaper': 'scythe_slash',
  'obeliskarch': 'obelisk_fall',
  'blazemaw': 'maw_eruption',
  'maelstrike': 'strike_torrent',
  'sylvigor': 'sylvig_charge',
  'stormclaw': 'claw_discharge',
  'cyclonix': 'cyclonic_whirl',
  'nocthowl': 'nocturnal_howl',
  'pyrelisk': 'pyre_bite',
  'pearlance': 'pearla_thrust',
  'thicketclaw': 'thicket_shred',
  'teslarch': 'tesla_beam',
  'stratoroc': 'roc_feather',
  'nightloom': 'loom_threads',
  'gravemaw': 'grave_swallow',
  'voltigarch': 'spark_spear',
  'pyrostrike': 'pyro_strike',
  'aquafrost': 'aqua_freeze',
  'terragrow': 'terra_pulse',
  'voltclysm': 'volt_clysm',
  'umbrashade': 'shadow_strike',
  'solgaleo': 'sol_roar',
  'tidedeep': 'deep_tidal',
  'thornspark': 'thorn_spark',
};

Object.entries(GUARDIAN_SIGNATURE_TECHS).forEach(([speciesId, techId]) => {
  const sp = SPECIES[speciesId];
  if (sp) {
    let lvl = 45;
    if (sp.stage === 'Elite') lvl = 35;
    else if (sp.stage === 'Apex' || sp.stage === 'Split' || sp.stage === 'Special') lvl = 45;
    else if (sp.stage === 'Terra' || sp.stage === 'Transcendent') lvl = 55;
    else if (sp.stage === 'Aether') lvl = 65;
    
    // Check if it already has this tech (avoid duplicates if re-evaluated)
    if (!sp.techs.some(t => t.tech === techId)) {
      sp.techs.push({ level: lvl, tech: techId });
    }
  }
});
