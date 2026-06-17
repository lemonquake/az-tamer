// ============================================================
// AZ Tamer — static game data
// 6 Guardian types, ~30 species, techniques, items, exp curve
// ============================================================

export type GType = 'Blaze' | 'Tide' | 'Verdant' | 'Volt' | 'Gale' | 'Umbra';
export type Stage = 'Novice' | 'Adept' | 'Elite' | 'Apex' | 'Legendary' | 'Aether';
export const STAGES: Stage[] = ['Novice', 'Adept', 'Elite', 'Apex', 'Legendary', 'Aether'];

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
export const ELEMENT_CHART: Record<Element, Partial<Record<Element, number>>> = {
  Fire:     { Nature: 1.5, Ice: 1.5, Water: 0.5, Rock: 0.75, Fire: 0.75, Aether: 0.75 },
  Water:    { Fire: 1.5, Rock: 1.25, Nature: 0.5, Water: 0.75, Aether: 0.75 },
  Nature:   { Water: 1.5, Rock: 1.25, Fire: 0.5, Ice: 0.75, Nature: 0.75, Aether: 0.75 },
  Electric: { Water: 1.5, Space: 1.25, Nature: 0.5, Rock: 0.5, Electric: 0.75, Aether: 0.75 },
  Rock:     { Fire: 1.25, Ice: 1.25, Electric: 1.25, Water: 0.75, Nature: 0.75, Rock: 0.75, Aether: 0.75 },
  Ice:      { Nature: 1.5, Space: 1.25, Fire: 0.5, Ice: 0.75, Rock: 0.75, Aether: 0.75 },
  Light:    { Dark: 1.5, Space: 1.25, Light: 0.5, Aether: 1.0 },
  Dark:     { Light: 1.5, Space: 1.25, Dark: 0.5, Aether: 1.0 },
  Space:    { Electric: 1.25, Ice: 1.25, Dark: 1.25, Rock: 0.75, Space: 0.75, Aether: 0.75 },
  Aether:   { Fire: 1.25, Water: 1.25, Nature: 1.25, Electric: 1.25, Rock: 1.25, Ice: 1.25, Light: 1.25, Dark: 1.25, Space: 1.25, Aether: 1.0 },
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
  return Math.max(0.4, Math.min(2.5, m));
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
  // total exp required to BE at `level`
  if (level <= 1) return 0;
  return Math.floor(14 * Math.pow(level - 1, 1.85) + 26 * (level - 1));
}

// ---------------- Techniques ----------------
export type TechKind = 'phys' | 'art';
export type TechEffect = 'damage' | 'heal' | 'buffAtk' | 'buffDef' | 'debuffDef' | 'debuffSpd' | 'drain' | 'buffSpd' | 'debuffAtk';
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
}

export interface Technique {
  id: string; name: string; type: GType; kind: TechKind;
  power: number; spCost: number; effect: TechEffect; target: TechTarget; desc: string;
  statusChance?: number;
  statusEffect?: TechStatusEffect;
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
  T('spring_mend', 'Spring Mend', 'Tide', 'art', 45, 14, 'heal', 'ally', 'Healing waters mend an ally.'),
  // Verdant
  T('seed_shot', 'Seed Shot', 'Verdant', 'phys', 22, 4, 'damage', 'one', 'Fires hardened seeds at the foe.'),
  T('thorn_whip', 'Thorn Whip', 'Verdant', 'phys', 38, 8, 'damage', 'one', 'A barbed vine lashes the foe.'),
  T('sap_drain', 'Sap Drain', 'Verdant', 'art', 30, 12, 'drain', 'one', 'Steals life-sap to heal the user.'),
  T('bramble_cage', 'Bramble Cage', 'Verdant', 'art', 34, 12, 'damage', 'all', 'Thorned brambles tear at all foes.'),
  T('elder_wrath', 'Elder Wrath', 'Verdant', 'phys', 68, 24, 'damage', 'one', 'The forest itself strikes in anger.'),
  T('bloom_ward', 'Bloom Ward', 'Verdant', 'art', 50, 15, 'heal', 'ally', 'Blooming pollen restores an ally.'),
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
  T('nature_judgment', 'Nature Judgment', 'Verdant', 'art', 92, 34, 'heal', 'all', 'Unleashes the forest\'s judgment upon all, restoring HP to allies.'),
  T('volt_singularity', 'Volt Singularity', 'Volt', 'art', 90, 32, 'debuffSpd', 'all', 'Creates an electromagnetic singularity that slows all foes.'),
  T('void_extinction', 'Void Extinction', 'Umbra', 'art', 95, 35, 'drain', 'one', 'Devours the target in void energy, restoring massive HP to the user.'),
  T('tempest_gale', 'Tempest Gale', 'Gale', 'art', 85, 28, 'buffAtk', 'self', 'A hurricane of wings that strikes all foes and stokes own Attack.'),
  // Aether-stage signature arts
  T('aether_flare', 'Aether Flare', 'Blaze', 'art', 105, 36, 'damage', 'all', 'The light that existed before fire. All foes are bathed in dawn made weapon.'),
  T('dawn_rebirth', 'Dawn Rebirth', 'Blaze', 'art', 80, 30, 'heal', 'all', 'A sunrise sung backwards — allies are mended by the memory of morning.'),

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
  T_status('dew_drop', 'Dew Drop', 'Tide', 'art', 0, 8, 'heal', 'ally', 'Restores health and grants regeneration.',
    'regen', 'Regen', 'buff', 3, 'hot', 0.08, '🌿', 'Restoring health over time.', 1.0),
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
  T_status('aquatic_mend', 'Aquatic Mend', 'Tide', 'art', 40, 16, 'heal', 'all', 'Healing waters that grant regeneration to all allies.',
    'regen', 'Regen', 'buff', 3, 'hot', 0.06, '🌿', 'Restoring health over time.', 1.0),
  T_status('abyssal_drown', 'Abyssal Drown', 'Tide', 'art', 95, 30, 'damage', 'one', 'Drags the target into the deep, chilling them.',
    'chill', 'Chilled', 'debuff', 4, 'spd', -0.25, '❄️', 'Speed reduced by 25%.', 1.0),

  // Verdant status moves
  T_status('vine_grip', 'Vine Grip', 'Verdant', 'phys', 20, 5, 'damage', 'one', 'Constricts the target in vine, reducing speed.',
    'entangled', 'Entangled', 'debuff', 3, 'spd', -0.15, '🕸️', 'Speed reduced by 15%.', 0.8),
  T_status('spore_puff', 'Spore Puff', 'Verdant', 'art', 15, 6, 'damage', 'one', 'Releases sleep-inducing spores.',
    'slumber', 'Slumber', 'debuff', 2, 'sleep', 0.0, '💤', 'Asleep. Cannot act. Wakes up on hit for +50% damage.', 0.7),
  T_status('root_mend', 'Root Mend', 'Verdant', 'art', 0, 8, 'heal', 'self', 'Deep roots heal and grant regeneration.',
    'regen', 'Regen', 'buff', 3, 'hot', 0.08, '🌿', 'Restoring health over time.', 1.0),
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
  isFusion?: boolean;
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
    palette: { primary: 0x8a2410, secondary: 0xf2433a, accent: 0xffd24e },
    desc: 'A legendary dragon of the volcanoes, dreaming of dawn and eternal fire.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'solarex', name: 'Solarex', type: 'Blaze', stage: 'Legendary', archetype: 'beast',
    base: stats(240, 80, 86, 56, 52, 50), growth: stats(15, 5, 6, 4, 3.8, 3.8),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 40, tech: 'sol_eruption' }],
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
    palette: { primary: 0x102e7a, secondary: 0x2a7dd9, accent: 0x8ad4ff },
    desc: 'Sovereign of the drowned dark. Its silence is a kind of mercy.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'leviathorn', name: 'Leviathorn', type: 'Tide', stage: 'Legendary', archetype: 'serpent',
    base: stats(250, 90, 68, 60, 48, 66), growth: stats(15, 5.5, 5, 4.2, 3.5, 5.2),
    techs: [{ level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'abyss_maelstrom' }, { level: 40, tech: 'deluge_tempest' }],
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
    palette: { primary: 0x1a4e1a, secondary: 0x4e9a3a, accent: 0xf2c14e },
    desc: 'Old as the first forest. Its rings record every age of the world.', captureBase: 0.06, scale: 1.8 }),
  S({ id: 'yggdranox', name: 'Yggdranox', type: 'Verdant', stage: 'Legendary', archetype: 'brute',
    base: stats(280, 75, 72, 78, 36, 58), growth: stats(17, 5, 5.2, 5.5, 3, 4.5),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 40, tech: 'nature_judgment' }],
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
    palette: { primary: 0x8a7510, secondary: 0xf2d23a, accent: 0x2a7dd9 },
    desc: 'The first thunderclap, given wings. Skies clear where it passes.', captureBase: 0.06, scale: 1.65 }),
  S({ id: 'raidenjin', name: 'Raidenjin', type: 'Volt', stage: 'Legendary', archetype: 'avian',
    base: stats(230, 88, 78, 48, 68, 62), growth: stats(14, 5.5, 5.5, 3.8, 5.5, 4.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 1, tech: 'thunder_dominion' }, { level: 40, tech: 'volt_singularity' }],
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
    palette: { primary: 0x1a6e60, secondary: 0x4ec4b0, accent: 0xffd24e },
    desc: 'Monarch of the upper sky. Maps mark its roosts as "no-fly".', captureBase: 0.06, scale: 1.65 }),
  S({ id: 'zephyrax', name: 'Zephyrax', type: 'Gale', stage: 'Legendary', archetype: 'avian',
    base: stats(235, 84, 76, 45, 74, 58), growth: stats(14, 5.2, 5.4, 3.5, 6, 4.5),
    techs: [{ level: 1, tech: 'razor_cyclone' }, { level: 1, tech: 'sky_sunder' }, { level: 40, tech: 'tempest_gale' }],
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
    palette: { primary: 0x2a1050, secondary: 0x6a2ac0, accent: 0xc43a7a },
    desc: 'The shadow cast by nothing. Scholars argue whether it exists at all.', captureBase: 0.06, scale: 1.7 }),
  S({ id: 'chthonix', name: 'Chthonix', type: 'Umbra', stage: 'Legendary', archetype: 'serpent',
    base: stats(242, 88, 75, 54, 56, 68), growth: stats(14.5, 5.5, 5.4, 4, 4.5, 5.2),
    techs: [{ level: 1, tech: 'void_fang' }, { level: 1, tech: 'eclipse_requiem' }, { level: 40, tech: 'void_extinction' }],
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
  S({ id: 'ignisar', name: 'Ignisar', type: 'Blaze', stage: 'Legendary', archetype: 'beast',
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
  S({ id: 'sylvaeon', name: 'Sylvaeon', type: 'Verdant', stage: 'Legendary', archetype: 'beast',
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
  S({ id: 'erebusilk', name: 'Erebusilk', type: 'Umbra', stage: 'Legendary', archetype: 'serpent',
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
  S({ id: 'ashkarath', name: 'Ashkarath', type: 'Blaze', stage: 'Legendary', archetype: 'brute',
    base: stats(300, 90, 92, 64, 50, 60), growth: stats(16, 5.5, 6.2, 4.4, 4, 4.8),
    techs: [{ level: 1, tech: 'inferno_maw' }, { level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'sol_eruption' }],
    palette: { primary: 0x3a1410, secondary: 0xe84a1a, accent: 0x9a5af2 },
    desc: 'General of Cinders. Its army burned a corridor through Ghandra wide enough to march a city through — until Aljay\'s phoenix turned its own fire against it.', captureBase: 0, scale: 2.1 }),
  S({ id: 'vormaela', name: 'Vormaela', type: 'Tide', stage: 'Legendary', archetype: 'serpent',
    base: stats(310, 95, 80, 68, 52, 74), growth: stats(16.5, 5.8, 5.6, 4.6, 4, 5.4),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'tidal_crush' }, { level: 1, tech: 'deluge_tempest' }],
    palette: { primary: 0x0a1a3a, secondary: 0x2a7dd9, accent: 0xb05ae8 },
    desc: 'The Tide-Empress of the Drowned Choir. Her tides answer no moon — only her grief, and her grief is bottomless.', captureBase: 0, scale: 2.1 }),
  S({ id: 'bramblehex', name: 'Bramblehex', type: 'Verdant', stage: 'Legendary', archetype: 'brute',
    base: stats(330, 85, 84, 80, 38, 62), growth: stats(17.5, 5.4, 5.8, 5.4, 3.4, 4.9),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'nature_judgment' }],
    palette: { primary: 0x1a2a10, secondary: 0x6a8a3a, accent: 0xc44a7a },
    desc: 'The Rotwarden. Everything it touches grows — wrong. Onnel wept while sealing it; they had been grown from the same grove, long ago.', captureBase: 0, scale: 2.15 }),
  S({ id: 'voltrazar', name: 'Voltrazar', type: 'Volt', stage: 'Legendary', archetype: 'avian',
    base: stats(290, 100, 88, 58, 72, 70), growth: stats(15.5, 6, 6, 4.2, 5.4, 5.2),
    techs: [{ level: 1, tech: 'thunder_dominion' }, { level: 1, tech: 'storm_lance' }, { level: 1, tech: 'volt_singularity' }],
    palette: { primary: 0x2a240a, secondary: 0xf2d23a, accent: 0x9a5af2 },
    desc: 'The Storm-Tyrant of the Iron Tempest. Greggy grounded it with a hand-built coil and a grin. It has not forgiven either.', captureBase: 0, scale: 2.05 }),
  S({ id: 'gorrundax', name: 'Gorrundax', type: 'Verdant', stage: 'Legendary', archetype: 'shell',
    base: stats(360, 70, 78, 96, 28, 50), growth: stats(18.5, 4.8, 5.5, 6, 2.8, 4.2),
    techs: [{ level: 1, tech: 'elder_wrath' }, { level: 1, tech: 'bramble_cage' }, { level: 1, tech: 'dread_howl' }],
    palette: { primary: 0x2e2a26, secondary: 0x8a7a5a, accent: 0xe85a3a },
    desc: 'The Mountain-Eater. The Gravelborn Horde tunneled beneath continents; three mountain ranges in Tharkand are actually its cast-off shells.', captureBase: 0, scale: 2.3 }),
  S({ id: 'cryomara', name: 'Cryomara', type: 'Tide', stage: 'Legendary', archetype: 'sprite',
    base: stats(280, 105, 76, 66, 58, 84), growth: stats(15, 6.2, 5.4, 4.6, 4.4, 5.8),
    techs: [{ level: 1, tech: 'abyss_maelstrom' }, { level: 1, tech: 'mist_veil' }, { level: 1, tech: 'deluge_tempest' }],
    palette: { primary: 0xc8e8f2, secondary: 0x5a8ab8, accent: 0x9a5af2 },
    desc: 'Queen of the Still. Where the Silent Glacier marched, nothing moved again — not water, not wind, not time. Noruun\'s auroras are her dreaming.', captureBase: 0, scale: 1.95 }),
  S({ id: 'luxavor', name: 'Luxavor', type: 'Blaze', stage: 'Legendary', archetype: 'avian',
    base: stats(285, 100, 86, 60, 66, 78), growth: stats(15.5, 6, 5.9, 4.3, 4.9, 5.5),
    techs: [{ level: 1, tech: 'sun_cataclysm' }, { level: 1, tech: 'aether_flare' }, { level: 1, tech: 'sol_eruption' }],
    palette: { primary: 0xf2ead0, secondary: 0xd9a93a, accent: 0x6a2ac0 },
    desc: 'The False Dawn. Its Blinding Host marched beneath a counterfeit sunrise, and whole armies knelt to it before realizing their mistake.', captureBase: 0, scale: 2.05 }),
  S({ id: 'nyxghul', name: 'Nyxghul', type: 'Umbra', stage: 'Legendary', archetype: 'serpent',
    base: stats(320, 95, 90, 70, 60, 80), growth: stats(17, 5.8, 6.1, 4.8, 4.5, 5.6),
    techs: [{ level: 1, tech: 'eclipse_requiem' }, { level: 1, tech: 'void_fang' }, { level: 1, tech: 'void_extinction' }],
    palette: { primary: 0x0e081a, secondary: 0x4a2a8a, accent: 0xe8d9a8 },
    desc: 'The Hollow Crown — first and worst of the nine. Aljay\'s broom-handle duel with it is reenacted by children on every continent; the real one lasted three days and broke a mountain.', captureBase: 0, scale: 2.2 }),
  S({ id: 'zerathuul', name: 'Zerathuul', type: 'Gale', stage: 'Legendary', archetype: 'serpent',
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
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 20, tech: 'flame_burst' }, { level: 40, tech: 'inferno_maw' }],
    palette: { primary: 0xc8202a, secondary: 0xe8b84a, accent: 0xff9ad2 },
    desc: 'Aljay\'s first bond — a crimson dragonoid knight in mirror-bright scale, bearing Daybreak, a greatsword of living flame.', captureBase: 0, scale: 2.025 }),
  S({ id: 'onthrofa', name: 'Onthrofa', type: 'Gale', stage: 'Aether', archetype: 'sprite',
    base: stats(110, 55, 34, 28, 32, 36), growth: stats(9, 4.5, 3.0, 2.6, 3.2, 3.4),
    techs: [{ level: 1, tech: 'tempest_gale' }, { level: 20, tech: 'razor_cyclone' }, { level: 40, tech: 'sky_sunder' }],
    palette: { primary: 0x8a4af2, secondary: 0x2a1a5a, accent: 0xff9ad2 },
    desc: 'A violet being of folded distance and borrowed hours, wreathed in the slow clockwork of Space and Time.', captureBase: 0, scale: 1.8 }),
  S({ id: 'vulfenix', name: 'Vulfenix', type: 'Blaze', stage: 'Aether', archetype: 'avian',
    base: stats(120, 45, 38, 26, 30, 32), growth: stats(10, 4.0, 3.6, 2.4, 2.8, 3.0),
    techs: [{ level: 1, tech: 'ember_snap' }, { level: 20, tech: 'flame_burst' }, { level: 40, tech: 'inferno_maw' }],
    palette: { primary: 0xff5aa8, secondary: 0x2a1a2e, accent: 0xffd8ec },
    desc: 'The rose-fire phoenix that lit Aljay\'s way through Ghandra\'s dark — and has not landed since.', captureBase: 0, scale: 1.95 }),
  S({ id: 'raijura', name: 'Raijura', type: 'Volt', stage: 'Aether', archetype: 'avian',
    base: stats(118, 48, 40, 26, 32, 30), growth: stats(9.8, 4.2, 3.8, 2.4, 3.0, 2.8),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 20, tech: 'numbing_field' }, { level: 40, tech: 'thunder_dominion' }],
    palette: { primary: 0xf2d23a, secondary: 0xe8ecff, accent: 0xff9ad2 },
    desc: 'A storm-roc hatched from the first thunderclap Greggy ever heard.', captureBase: 0, scale: 1.35 }),
  S({ id: 'voltherion', name: 'Voltherion', type: 'Volt', stage: 'Aether', archetype: 'brute',
    base: stats(132, 40, 44, 32, 24, 26), growth: stats(11.2, 3.6, 4.2, 3.2, 2.2, 2.4),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 20, tech: 'numbing_field' }, { level: 40, tech: 'thunder_dominion' }],
    palette: { primary: 0x4a5468, secondary: 0xf2d23a, accent: 0x7a8af2 },
    desc: 'A walking dynamo wound around a captive star, wearing a custom grounding coil.', captureBase: 0, scale: 1.3 }),
  S({ id: 'fulgrath', name: 'Fulgrath', type: 'Volt', stage: 'Aether', archetype: 'serpent',
    base: stats(114, 52, 36, 26, 34, 32), growth: stats(9.5, 4.4, 3.4, 2.4, 3.2, 3.0),
    techs: [{ level: 1, tech: 'storm_lance' }, { level: 20, tech: 'numbing_field' }, { level: 40, tech: 'thunder_dominion' }],
    palette: { primary: 0x1a1a2e, secondary: 0xf2d23a, accent: 0xb14aff },
    desc: 'Lightning that struck once in the dark of Ghandra and decided to stay.', captureBase: 0, scale: 1.25 }),
  S({ id: 'verdalune', name: 'Verdalune', type: 'Verdant', stage: 'Aether', archetype: 'sprite',
    base: stats(124, 50, 36, 28, 28, 34), growth: stats(10.4, 4.2, 3.4, 2.6, 2.6, 3.2),
    techs: [{ level: 1, tech: 'bramble_whip' }, { level: 20, tech: 'giga_drain' }, { level: 40, tech: 'forest_fury' }],
    palette: { primary: 0x4ec45e, secondary: 0xf2e8b8, accent: 0xff9ad2 },
    desc: 'A moonlit spirit-bloom that opens only for Onnel. Five championship rings grew from its petals.', captureBase: 0, scale: 1.2 }),
  S({ id: 'gaiathorn', name: 'Gaiathorn', type: 'Verdant', stage: 'Aether', archetype: 'shell',
    base: stats(142, 36, 38, 36, 20, 28), growth: stats(12.2, 3.2, 3.6, 3.6, 1.8, 2.6),
    techs: [{ level: 1, tech: 'bramble_whip' }, { level: 20, tech: 'giga_drain' }, { level: 40, tech: 'forest_fury' }],
    palette: { primary: 0x5a3e22, secondary: 0x4ec45e, accent: 0x7a8af2 },
    desc: 'A great shelled wanderer with a living garden on its back.', captureBase: 0, scale: 1.35 }),
  S({ id: 'nyxroot', name: 'Nyxroot', type: 'Verdant', stage: 'Aether', archetype: 'brute',
    base: stats(134, 42, 40, 30, 24, 30), growth: stats(11.4, 3.8, 3.8, 3.0, 2.2, 2.8),
    techs: [{ level: 1, tech: 'bramble_whip' }, { level: 20, tech: 'giga_drain' }, { level: 40, tech: 'forest_fury' }],
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

export interface CrawlerPart {
  id: string; slot: CrawlerSlot; name: string; tier: number; value: number; price: number; desc: string;
  /** visual style key consumed by the 3D part builder */
  style: string;
}
const P = (id: string, slot: CrawlerSlot, name: string, tier: number, value: number, price: number, style: string, desc: string): CrawlerPart =>
  ({ id, slot, name, tier, value, price, style, desc });

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
  const newTechs = Object.values(TECHS).filter(t => t.type === sp.type && t.statusEffect);
  newTechs.forEach(t => {
    const levelMap: Record<string, number> = {
      // Blaze
      magma_spit: 3, pyro_shield: 7, blazing_claw: 11, heat_wave: 15, combustion: 19,
      sun_channel: 23, flame_charge: 27, eruption_strike: 31, solar_burst: 35, supernova: 42,
      // Tide
      aqua_splash: 3, chilling_wind: 7, dew_drop: 11, ocean_sanctuary: 15, bubble_burst: 19,
      frost_bite: 23, tidal_wave_tech: 27, ice_spear: 31, aquatic_mend: 35, abyssal_drown: 42,
      // Verdant
      vine_grip: 3, spore_puff: 7, root_mend: 11, leaf_shield: 15, nature_strike: 19,
      toxic_thorn: 23, spore_cloud: 27, earthquake_tech: 31, bramble_growth: 35, forest_wrath_tech: 42,
      // Volt
      spark_shock: 3, voltage_boost: 7, lightning_strike_tech: 11, static_shield: 15, chain_lightning_tech: 19,
      thunder_fang_tech: 23, overload_burst: 27, plasma_blast: 31, shock_pulse: 35, voltage_tempest_tech: 42,
      // Gale
      wind_slap: 3, tailwind_breeze: 7, feather_blade_tech: 11, zephyr_barrier: 15, cyclone_trap_tech: 19,
      wind_shear_tech: 23, sonic_boost: 27, hurricane_slash_tech: 31, gale_force_tech: 35, tempest_strike_tech: 42,
      // Umbra
      shadow_scratch: 3, soul_drain_tech: 7, nightmare_fog: 11, dark_barrier: 15, shadow_strike_tech: 19,
      vampiric_bite_tech: 23, abyssal_void_tech: 27, doom_gaze: 31, eclipse_blast_tech: 35, apocalypse_tech: 42,
    };
    
    const lvl = levelMap[t.id];
    if (lvl !== undefined) {
      sp.techs.push({ level: lvl, tech: t.id });
    }
  });
  
  // Sort techs by level so they display nicely
  sp.techs.sort((a, b) => a.level - b.level);
});
