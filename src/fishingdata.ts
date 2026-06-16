// ============================================================
// AZ Tamer — Fishing Expansion: the ecosystem, gear, rarities,
// scoring, progression and the living leaderboard.
//
// Pure data + logic only (no THREE, no DOM) so it can be pulled
// into the scene, the UI and the save layer without import cycles.
// by lemonquake
// ============================================================

// ---------------- rarities ----------------
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Elite' | 'Mythical' | 'Legendary';
export const RARITY_ORDER: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Elite', 'Mythical', 'Legendary'];

export interface RarityDef {
  name: Rarity;
  color: string;          // primary CSS color
  glow: string;           // glow / shadow CSS
  badge: string;          // emoji badge
  /** base score awarded simply for the rarity */
  score: number;
  /** fishing EXP awarded for landing one */
  exp: number;
  /** multiplier on shard payout when sold */
  sell: number;
  /** does the rare-hook tension music play? */
  rareMusic: boolean;
  /** animated rainbow frame (legendary only) */
  rainbow?: boolean;
}

export const RARITY: Record<Rarity, RarityDef> = {
  Common:    { name: 'Common',    color: '#b8c0d0', glow: 'rgba(184,192,208,0.6)', badge: '⬜', score: 100,   exp: 12,  sell: 1.0, rareMusic: false },
  Uncommon:  { name: 'Uncommon',  color: '#5ad88a', glow: 'rgba(90,216,138,0.65)', badge: '🟩', score: 320,   exp: 26,  sell: 1.4, rareMusic: false },
  Rare:      { name: 'Rare',      color: '#5ab8e8', glow: 'rgba(90,184,232,0.7)',  badge: '🟦', score: 850,   exp: 60,  sell: 2.2, rareMusic: true },
  Elite:     { name: 'Elite',     color: '#b18ae8', glow: 'rgba(177,138,232,0.75)',badge: '🟪', score: 2100,  exp: 130, sell: 3.6, rareMusic: true },
  Mythical:  { name: 'Mythical',  color: '#f2c14e', glow: 'rgba(242,193,78,0.85)', badge: '🟨', score: 6200,  exp: 320, sell: 6.0, rareMusic: true },
  Legendary: { name: 'Legendary', color: '#ff7ad8', glow: 'rgba(255,122,216,0.95)',badge: '🌈', score: 21000, exp: 900, sell: 12.0, rareMusic: true, rainbow: true },
};

export const rarityRank = (r: Rarity): number => RARITY_ORDER.indexOf(r);

// ---------------- shadow sizes ----------------
export type ShadowSize = 'small' | 'medium' | 'large' | 'massive';
export const SHADOW_SCALE: Record<ShadowSize, number> = { small: 0.6, medium: 1.0, large: 1.7, massive: 2.8 };

// ---------------- families ----------------
export type FamilyId = 'pond' | 'river' | 'predator' | 'exotic' | 'ancient';
export interface FamilyDef { id: FamilyId; name: string; habitat: 'pond' | 'river' | 'both'; blurb: string; }
export const FAMILIES: Record<FamilyId, FamilyDef> = {
  pond:     { id: 'pond',     name: 'Pond Fish',     habitat: 'pond',  blurb: 'The calm-water folk — minnows, carp and the temple koi.' },
  river:    { id: 'river',    name: 'River Fish',    habitat: 'river', blurb: 'Swift swimmers born to the current: trout and the salmon runs.' },
  predator: { id: 'predator', name: 'Predator Fish', habitat: 'both',  blurb: 'Toothy ambushers of the deep weed-line. The pikes.' },
  exotic:   { id: 'exotic',   name: 'Exotic Fish',   habitat: 'both',  blurb: 'Light-bending wonders that should not, by rights, exist.' },
  ancient:  { id: 'ancient',  name: 'Ancient Fish',  habitat: 'both',  blurb: 'Living fossils and world-serpents from before the maps.' },
};

// ---------------- time of day & weather ----------------
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '☀️ Clear', cloudy: '⛅ Cloudy', rain: '🌧️ Rain', storm: '⛈️ Storm', fog: '🌫️ Fog',
};

/** Map the shared 0..1 world clock to a fishing time-of-day band. */
export function timeOfDay(t: number): TimeOfDay {
  if (t >= 0.20 && t < 0.30) return 'dawn';
  if (t >= 0.30 && t < 0.66) return 'day';
  if (t >= 0.66 && t < 0.80) return 'dusk';
  return 'night';
}

// ---------------- body builder keys ----------------
export type FishBody =
  | 'minnow' | 'carp' | 'koi' | 'trout' | 'salmon' | 'pike'
  | 'moon' | 'eel' | 'prism' | 'aurora' | 'ray'
  | 'fossil' | 'catfish' | 'leviathan' | 'serpent' | 'dragonfish';

// ---------------- spawn conditions ----------------
export interface SpawnRule {
  time?: TimeOfDay[];
  weather?: Weather[];
  minLevel?: number;
  /** baits that strongly attract this species */
  baitPref?: string[];
  /** spot kinds where it appears */
  spot?: ('pond' | 'river' | 'secret')[];
  /** base spawn weight before modifiers (higher = more common) */
  weight: number;
  /** requires a special premium bait to ever appear */
  needsSpecialBait?: boolean;
  /** flat chance ceiling, e.g. 0.0001 for the Worldscale Dragonfish */
  ceiling?: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  family: FamilyId;
  rarity: Rarity;
  body: FishBody;
  colors: { body: number; belly: number; fin: number; accent: number; glow?: number };
  /** weight range in kg [min, max] and length range in cm [min, max] */
  weightKg: [number, number];
  lengthCm: [number, number];
  shadow: ShadowSize;
  /** swim speed of the shadow (relative) */
  speed: number;
  /** base score contribution of the species itself */
  scoreValue: number;
  /** fight profile, each 1..10 — drives the reel battle */
  fight: { stamina: number; strength: number; aggression: number; intelligence: number };
  spawn: SpawnRule;
  lore: string;
}

// helper to keep the table terse
const F = (
  id: string, name: string, family: FamilyId, rarity: Rarity, body: FishBody,
  colors: SpeciesDef['colors'],
  weightKg: [number, number], lengthCm: [number, number],
  shadow: ShadowSize, speed: number, scoreValue: number,
  fight: SpeciesDef['fight'], spawn: SpawnRule, lore: string,
): SpeciesDef => ({ id, name, family, rarity, body, colors, weightKg, lengthCm, shadow, speed, scoreValue, fight, spawn, lore });

// ============================================================
//  THE 25 SPECIES — 5 families × 5 species
// ============================================================
export const FISH: Record<string, SpeciesDef> = Object.fromEntries(([
  // ---------- Family 1: Pond Fish ----------
  F('silver_minnow', 'Silver Minnow', 'pond', 'Common', 'minnow',
    { body: 0xc8d2e0, belly: 0xf0f4fb, fin: 0x9aa6bc, accent: 0xdfe8f5 },
    [0.05, 0.4], [6, 14], 'small', 1.5, 60,
    { stamina: 2, strength: 1, aggression: 2, intelligence: 2 },
    { time: ['dawn', 'day', 'dusk'], spot: ['pond', 'river'], weight: 100, baitPref: ['worm', 'grub'] },
    'A flicker of living mercury. The first catch of nearly every angler who ever lived.'),
  F('pond_carp', 'Pond Carp', 'pond', 'Common', 'carp',
    { body: 0x8a8a5a, belly: 0xc8c49a, fin: 0x6a6a44, accent: 0xa6a674 },
    [0.6, 3.2], [22, 48], 'medium', 1.0, 110,
    { stamina: 4, strength: 3, aggression: 2, intelligence: 3 },
    { time: ['day', 'dusk', 'night'], spot: ['pond'], weight: 78, baitPref: ['worm', 'grub', 'bread'] },
    'Patient, fat and endlessly hungry. The bread-and-butter of the Great Pond.'),
  F('golden_koi', 'Golden Koi', 'pond', 'Uncommon', 'koi',
    { body: 0xf2a83a, belly: 0xffe4a8, fin: 0xe07a2a, accent: 0xffd25a },
    [1.0, 4.5], [30, 62], 'medium', 1.2, 280,
    { stamina: 5, strength: 4, aggression: 3, intelligence: 5 },
    { time: ['day', 'dusk'], spot: ['pond'], weight: 42, baitPref: ['bread', 'grub'] },
    'Bred for a hundred generations in temple ponds. To catch one is half a blessing, half a theft.'),
  F('emerald_carp', 'Emerald Carp', 'pond', 'Uncommon', 'carp',
    { body: 0x2f8a5a, belly: 0xa8e0bc, fin: 0x1f6a44, accent: 0x5ad89a, glow: 0x2fae6a },
    [1.4, 6.0], [34, 70], 'large', 1.0, 360,
    { stamina: 6, strength: 5, aggression: 4, intelligence: 4 },
    { time: ['day', 'night'], weather: ['cloudy', 'rain', 'fog'], spot: ['pond'], weight: 30, baitPref: ['grub', 'glowworm'] },
    'Its scales hold the green of deep weed-beds. Surfaces only when the sky is grey.'),
  F('royal_dragon_koi', 'Royal Dragon Koi', 'pond', 'Rare', 'koi',
    { body: 0xe8403a, belly: 0xfff0d0, fin: 0xf2c14e, accent: 0xffd25a, glow: 0xff6a4a },
    [3.0, 10.0], [55, 96], 'large', 1.6, 900,
    { stamina: 7, strength: 6, aggression: 6, intelligence: 7 },
    { time: ['dawn', 'dusk'], spot: ['pond'], weight: 12, baitPref: ['bread', 'celestial'], minLevel: 6 },
    'When a koi swims a waterfall a thousand times, legend says it becomes a dragon. This one is most of the way there.'),

  // ---------- Family 2: River Fish ----------
  F('swift_trout', 'Swift Trout', 'river', 'Common', 'trout',
    { body: 0x7a8a6a, belly: 0xe0e6d0, fin: 0x5a6a4a, accent: 0xc88a5a },
    [0.3, 1.8], [18, 40], 'small', 2.2, 90,
    { stamina: 4, strength: 3, aggression: 4, intelligence: 4 },
    { time: ['dawn', 'day', 'dusk'], spot: ['river'], weight: 92, baitPref: ['cricket', 'worm'] },
    'All muscle and impatience. It hits the lure before it has finished landing.'),
  F('redfin_trout', 'Redfin Trout', 'river', 'Uncommon', 'trout',
    { body: 0x9a6a5a, belly: 0xf0d8c0, fin: 0xe85a4a, accent: 0xf2935a },
    [0.6, 2.6], [24, 50], 'medium', 2.4, 240,
    { stamina: 5, strength: 4, aggression: 5, intelligence: 4 },
    { time: ['dawn', 'dusk'], spot: ['river'], weight: 46, baitPref: ['cricket', 'grub'] },
    'Named for the blood-red blaze along its fins. Runs the fastest water in the shallows.'),
  F('crystal_salmon', 'Crystal Salmon', 'river', 'Rare', 'salmon',
    { body: 0xaecde8, belly: 0xf4fbff, fin: 0x7aa6d8, accent: 0xc8e8ff, glow: 0x9ad0ff },
    [2.0, 7.5], [44, 84], 'large', 2.0, 820,
    { stamina: 7, strength: 7, aggression: 5, intelligence: 6 },
    { time: ['dawn', 'day'], weather: ['clear', 'cloudy'], spot: ['river'], weight: 22, baitPref: ['cricket', 'minnow_lure'], minLevel: 5 },
    'Translucent as river-ice. You can watch its heart beat while it fights the line.'),
  F('thunder_salmon', 'Thunder Salmon', 'river', 'Elite', 'salmon',
    { body: 0x3a4a7a, belly: 0xbcc8f0, fin: 0xf2e14e, accent: 0x8aa6ff, glow: 0xffe14a },
    [4.0, 12.0], [60, 104], 'large', 2.6, 2300,
    { stamina: 8, strength: 8, aggression: 7, intelligence: 6 },
    { time: ['night'], weather: ['rain', 'storm'], spot: ['river'], weight: 9, baitPref: ['electrozap'], minLevel: 12 },
    'Spawns only under a storm. Anglers swear the strike feels like grabbing a live wire.'),
  F('emperor_salmon', 'Emperor Salmon', 'river', 'Mythical', 'salmon',
    { body: 0x6a3a8a, belly: 0xf0e0ff, fin: 0xf2c14e, accent: 0xd8a8ff, glow: 0xc86aff },
    [8.0, 22.0], [80, 140], 'massive', 2.2, 6800,
    { stamina: 9, strength: 9, aggression: 8, intelligence: 8 },
    { time: ['dawn'], weather: ['rain', 'storm', 'fog'], spot: ['river'], weight: 4, baitPref: ['electrozap', 'celestial'], minLevel: 20 },
    'The crowned king of the salmon run. It returns once a season, and the whole river bends to let it pass.'),

  // ---------- Family 3: Predator Fish ----------
  F('pike', 'Pike', 'predator', 'Uncommon', 'pike',
    { body: 0x5a6a3a, belly: 0xd0d4a8, fin: 0x3a4a26, accent: 0x8a9a5a },
    [1.2, 5.0], [40, 78], 'medium', 1.8, 300,
    { stamina: 6, strength: 6, aggression: 7, intelligence: 5 },
    { time: ['day', 'dusk', 'night'], spot: ['pond', 'river'], weight: 56, baitPref: ['minnow_lure', 'worm'] },
    'A torpedo of teeth that waits in the weeds. Hooks itself half the time out of sheer spite.'),
  F('razor_pike', 'Razor Pike', 'predator', 'Rare', 'pike',
    { body: 0x4a5a6a, belly: 0xc0d0d8, fin: 0x9aa6b0, accent: 0xe8eef2 },
    [2.4, 8.0], [55, 96], 'large', 2.0, 780,
    { stamina: 7, strength: 7, aggression: 8, intelligence: 6 },
    { time: ['dusk', 'night'], spot: ['pond', 'river'], weight: 28, baitPref: ['minnow_lure'], minLevel: 7 },
    'Its gill-plates are honed like sabres. Veteran anglers wear gloves and still lose fingers.'),
  F('shadow_pike', 'Shadow Pike', 'predator', 'Elite', 'pike',
    { body: 0x2a2a3a, belly: 0x4a4a6a, fin: 0x6a5a8a, accent: 0x8a6aff, glow: 0x6a3aff },
    [3.5, 11.0], [66, 112], 'large', 2.4, 2200,
    { stamina: 8, strength: 8, aggression: 9, intelligence: 7 },
    { time: ['night'], weather: ['fog', 'storm'], spot: ['pond', 'river', 'secret'], weight: 11, baitPref: ['glowworm', 'minnow_lure'], minLevel: 14 },
    'You never see it coming — only the line going slack where your lure used to be.'),
  F('bonejaw_pike', 'Bonejaw Pike', 'predator', 'Mythical', 'pike',
    { body: 0x9a8a6a, belly: 0xe0d4b0, fin: 0x6a5a3a, accent: 0xf0e8c8, glow: 0xd8c86a },
    [6.0, 18.0], [82, 132], 'massive', 2.2, 6400,
    { stamina: 9, strength: 9, aggression: 9, intelligence: 7 },
    { time: ['dusk', 'night'], weather: ['storm', 'fog'], spot: ['secret'], weight: 5, baitPref: ['minnow_lure', 'dragon'], minLevel: 22 },
    'Half its skull shows through the skin. It has eaten anglers, and remembers the taste fondly.'),
  F('abyss_pike', 'Abyss Pike', 'predator', 'Legendary', 'pike',
    { body: 0x10121e, belly: 0x1a2a4a, fin: 0x2a6aff, accent: 0x4affd8, glow: 0x2affff },
    [12.0, 34.0], [120, 200], 'massive', 2.8, 22000,
    { stamina: 10, strength: 10, aggression: 10, intelligence: 9 },
    { time: ['night'], weather: ['storm'], spot: ['secret'], weight: 1.2, baitPref: ['dragon', 'celestial'], minLevel: 30, needsSpecialBait: true },
    'It rose once from the drowned vault under the pond and took the dock with it. The deepest thing the Great Pond hides.'),

  // ---------- Family 4: Exotic Fish ----------
  F('moonfish', 'Moonfish', 'exotic', 'Rare', 'moon',
    { body: 0xd8dcf0, belly: 0xf4f6ff, fin: 0xa8b0e0, accent: 0xeef0ff, glow: 0xcfd6ff },
    [1.5, 6.0], [30, 64], 'medium', 1.2, 900,
    { stamina: 6, strength: 5, aggression: 4, intelligence: 8 },
    { time: ['night'], spot: ['pond', 'river'], weight: 30, baitPref: ['glowworm', 'celestial'], minLevel: 8 },
    'A pale disc that rises only with the moon. It mirrors the sky so perfectly it seems to swim through stars.'),
  F('starfish_eel', 'Starfish Eel', 'exotic', 'Elite', 'eel',
    { body: 0x2a3a5a, belly: 0x4a5a8a, fin: 0x8affd8, accent: 0xf2e14e, glow: 0x8affd8 },
    [2.0, 7.0], [70, 140], 'large', 1.6, 2400,
    { stamina: 8, strength: 7, aggression: 6, intelligence: 7 },
    { time: ['night'], weather: ['clear', 'fog'], spot: ['secret'], weight: 12, baitPref: ['glowworm', 'electrozap'], minLevel: 16 },
    'Studded with points of light like a fallen constellation. It knots itself around the line to break it.'),
  F('prism_fish', 'Prism Fish', 'exotic', 'Elite', 'prism',
    { body: 0x9a6aff, belly: 0xe8d8ff, fin: 0x5affd8, accent: 0xff8ae8, glow: 0xff6ad8 },
    [1.0, 4.0], [24, 52], 'medium', 1.9, 2600,
    { stamina: 7, strength: 6, aggression: 7, intelligence: 8 },
    { time: ['day', 'dawn'], weather: ['clear'], spot: ['pond', 'river'], weight: 9, baitPref: ['celestial'], minLevel: 18 },
    'Every scale is a tiny prism. Reel it into sunlight and it scatters rainbows across the whole pond.'),
  F('aurora_swimmer', 'Aurora Swimmer', 'exotic', 'Mythical', 'aurora',
    { body: 0x2afca8, belly: 0xd8fff0, fin: 0x6affff, accent: 0xff8ad8, glow: 0x6affd8 },
    [3.0, 10.0], [50, 96], 'large', 2.0, 7200,
    { stamina: 9, strength: 8, aggression: 6, intelligence: 9 },
    { time: ['dawn'], spot: ['pond', 'river', 'secret'], weight: 6, baitPref: ['celestial', 'glowworm'], minLevel: 24 },
    'It trails ribbons of cold light like the northern dawn itself, dragged underwater and kept as a pet.'),
  F('celestial_ray', 'Celestial Ray', 'exotic', 'Legendary', 'ray',
    { body: 0x1a1a3a, belly: 0x3a3a6a, fin: 0xf2c14e, accent: 0x8aa6ff, glow: 0xffe14a },
    [10.0, 30.0], [110, 190], 'massive', 1.4, 23000,
    { stamina: 10, strength: 9, aggression: 7, intelligence: 10 },
    { time: ['night'], weather: ['clear'], spot: ['secret'], weight: 1.0, baitPref: ['celestial'], minLevel: 32, needsSpecialBait: true },
    'A manta cut from the night sky, its wings freckled with real stars. It glides up only when the heavens are cloudless.'),

  // ---------- Family 5: Ancient Fish ----------
  F('fossil_fin', 'Fossil Fin', 'ancient', 'Rare', 'fossil',
    { body: 0x8a7a5a, belly: 0xc8b890, fin: 0x6a5a3a, accent: 0xa89868 },
    [2.0, 8.0], [40, 86], 'large', 0.9, 950,
    { stamina: 8, strength: 7, aggression: 4, intelligence: 5 },
    { time: ['day', 'night'], weather: ['cloudy', 'fog'], spot: ['secret'], weight: 26, baitPref: ['worm', 'grub'], minLevel: 10 },
    'A coelacanth that forgot to go extinct. Armored in plates older than the city walls.'),
  F('elder_catfish', 'Elder Catfish', 'ancient', 'Elite', 'catfish',
    { body: 0x4a4236, belly: 0x9a8e6a, fin: 0x2a2418, accent: 0x6a5e42, glow: 0x8a7a4a },
    [6.0, 20.0], [80, 150], 'massive', 0.8, 2600,
    { stamina: 9, strength: 9, aggression: 5, intelligence: 7 },
    { time: ['night'], spot: ['pond', 'secret'], weight: 14, baitPref: ['grub', 'worm'], minLevel: 15 },
    'The grandfather of the deep pool. Old enough to have whiskers longer than your arm and a grudge longer still.'),
  F('leviathan_fry', 'Ancient Leviathan Fry', 'ancient', 'Mythical', 'leviathan',
    { body: 0x2a5a6a, belly: 0x6ad0c8, fin: 0x1a3a4a, accent: 0x4affd8, glow: 0x4ad8d8 },
    [9.0, 26.0], [90, 160], 'massive', 1.6, 7400,
    { stamina: 10, strength: 9, aggression: 8, intelligence: 8 },
    { time: ['dusk', 'night'], weather: ['storm', 'rain'], spot: ['secret'], weight: 4, baitPref: ['dragon', 'minnow_lure'], minLevel: 26 },
    'Merely the *baby*. The thought of what hatched the rest of the brood keeps fishers ashore on stormy nights.'),
  F('titan_serpent', 'Titan River Serpent', 'ancient', 'Legendary', 'serpent',
    { body: 0x1a3a2a, belly: 0x4a8a5a, fin: 0xf2c14e, accent: 0x8aff8a, glow: 0x6aff8a },
    [18.0, 48.0], [180, 320], 'massive', 1.8, 24000,
    { stamina: 10, strength: 10, aggression: 9, intelligence: 9 },
    { time: ['night'], weather: ['storm', 'rain'], spot: ['secret'], weight: 1.1, baitPref: ['dragon', 'celestial'], minLevel: 34, needsSpecialBait: true },
    'It is rumored the river is not a river at all, but the channel this serpent wore into the world over ten thousand years.'),
  F('worldscale_dragonfish', 'Worldscale Dragonfish', 'ancient', 'Legendary', 'dragonfish',
    { body: 0x12101e, belly: 0x3a2a5a, fin: 0xffd25a, accent: 0xff5a8a, glow: 0xffd25a },
    [30.0, 90.0], [240, 480], 'massive', 2.2, 50000,
    { stamina: 10, strength: 10, aggression: 10, intelligence: 10 },
    { time: ['night'], weather: ['storm'], spot: ['secret'], weight: 0.4, baitPref: ['celestial'], minLevel: 40, needsSpecialBait: true, ceiling: 0.0001 },
    'Its scales are said to be maps of worlds that have not been born yet. One in a hundred thousand casts. Maybe one in a lifetime.'),
] as SpeciesDef[]).map(s => [s.id, s]));

export const ALL_FISH = Object.values(FISH);
export const fishByFamily = (fam: FamilyId): SpeciesDef[] => ALL_FISH.filter(f => f.family === fam);

// ---------------- lines ----------------
export interface LineDef {
  id: string; name: string; tier: number; price: number;
  strengthBonus: number;      // e.g. 1.0 = baseline, 1.3 = +30% lineStrength
  tensionRateBonus: number;   // e.g. 1.0 = baseline, 0.75 = 25% slower tension buildup
  luckBonus: number;          // e.g. 1.0 = baseline, 1.35 = 35% higher rare/exotic chances
  perfectWidthBonus: number;  // e.g. 0 = baseline, 0.3 = +30% perfect hook width
  desc: string;
}

export const LINES: Record<string, LineDef> = Object.fromEntries(([
  { id: 'basic_mono', name: 'Basic Monofilament', tier: 1, price: 0, strengthBonus: 1.0, tensionRateBonus: 1.0, luckBonus: 1.0, perfectWidthBonus: 0.0, desc: 'A standard monofilament line. Good for starters but lacks specialized traits.' },
  { id: 'nylon_reinforced', name: 'Reinforced Nylon Line', tier: 2, price: 400, strengthBonus: 1.15, tensionRateBonus: 0.95, luckBonus: 1.0, perfectWidthBonus: 0.0, desc: 'Coated nylon that provides extra durability and slightly slower tension buildup.' },
  { id: 'fluoro_stealth', name: 'Fluoro-Stealth Line', tier: 2, price: 650, strengthBonus: 1.0, tensionRateBonus: 1.0, luckBonus: 1.15, perfectWidthBonus: 0.0, desc: 'Virtually invisible fluorocarbon line. Fish bite faster and are less suspicious.' },
  { id: 'spider_braid', name: 'Braided Spider-Silk', tier: 3, price: 1200, strengthBonus: 1.3, tensionRateBonus: 0.9, luckBonus: 1.0, perfectWidthBonus: 0.0, desc: 'Micro-woven braid with immense strength, allowing you to pull harder without snapping.' },
  { id: 'lead_core', name: 'Lead-Core Sink Line', tier: 3, price: 1500, strengthBonus: 1.1, tensionRateBonus: 1.0, luckBonus: 1.1, perfectWidthBonus: 0.0, desc: 'A heavy, sinking line designed for deep-water species, increasing average fish size.' },
  { id: 'aurora_mono', name: 'Aurora Monofilament', tier: 4, price: 2800, strengthBonus: 1.15, tensionRateBonus: 1.0, luckBonus: 1.35, perfectWidthBonus: 0.0, desc: 'Infused with bioluminescent minerals. Attracts light-sensitive exotic species.' },
  { id: 'titanium_alloy', name: 'Titanium Alloy Core', tier: 4, price: 3600, strengthBonus: 1.25, tensionRateBonus: 0.75, luckBonus: 1.0, perfectWidthBonus: 0.0, desc: 'A line reinforced with flexible metal alloy. Prevents rapid tension spikes.' },
  { id: 'elastic_polymer', name: 'Elastic Rubber-Polymer', tier: 5, price: 5400, strengthBonus: 1.2, tensionRateBonus: 0.85, luckBonus: 1.0, perfectWidthBonus: 0.1, desc: 'High elasticity dampens sudden fish thrashing and shifts, making struggles safer.' },
  { id: 'siren_thread', name: 'Siren\'s Whispering Thread', tier: 5, price: 7200, strengthBonus: 1.1, tensionRateBonus: 0.9, luckBonus: 1.25, perfectWidthBonus: 0.0, desc: 'Softly hums with a soothing frequency, preventing fish from fleeing at the landing phase.' },
  { id: 'golden_filament', name: 'Golden Filament Line', tier: 6, price: 10000, strengthBonus: 1.2, tensionRateBonus: 0.9, luckBonus: 1.2, perfectWidthBonus: 0.0, desc: 'A lavish line woven with fine gold. Doubles the score bonus of catch streaks.' },
  { id: 'chrono_fibre', name: 'Chrono-Fibre Line', tier: 6, price: 14000, strengthBonus: 1.3, tensionRateBonus: 0.8, luckBonus: 1.3, perfectWidthBonus: 0.35, desc: 'Woven with temporal crystals. Slows down hook-timing needle speed by 30%.' },
] as LineDef[]).map(l => [l.id, l]));
export const ALL_LINES = Object.values(LINES);

// ---------------- rods ----------------
export interface RodDef {
  id: string; name: string; tier: number; price: number;
  /** how fast the reel meter fills (1.0 = baseline) */
  reelPower: number;
  /** how forgiving the tension window is (1.0 = baseline) */
  lineStrength: number;
  /** multiplier on rare-fish encounter weighting */
  luck: number;
  /** max castable distance in meters */
  castMax: number;
  /** visual style key for the 3D model + rod glow */
  fx: 'wood' | 'iron' | 'storm' | 'neon' | 'dragon' | 'tide';
  color: number; glow?: number;
  desc: string;
}
const R = (id: string, name: string, tier: number, price: number, reelPower: number, lineStrength: number, luck: number, castMax: number, fx: RodDef['fx'], color: number, desc: string, glow?: number): RodDef =>
  ({ id, name, tier, price, reelPower, lineStrength, luck, castMax, fx, color, desc, glow });

export const RODS: Record<string, RodDef> = Object.fromEntries(([
  R('beginner', 'Beginner Rod', 1, 0, 1.0, 1.0, 1.0, 14, 'wood', 0x8a6a3a, 'A whittled cane and a length of honest line. Everyone starts here.'),
  R('ironhook', 'Ironhook Rod', 2, 600, 1.2, 1.25, 1.15, 18, 'iron', 0x9aa6b0, 'Forged guides and a steel spine. Stronger line, better catch rate.'),
  R('tideweaver', 'Tideweaver Rod', 3, 1600, 1.35, 1.4, 1.3, 22, 'tide', 0x3a8ad9, 'Mistveil-woven kelp-fiber that sings in the water. Loves the river runs.', 0x5ab8e8),
  R('stormcaller', 'Stormcaller Rod', 4, 3400, 1.5, 1.5, 1.5, 26, 'storm', 0x6a7adf, 'Crackles with caged lightning. Storm fish all but leap onto the hook.', 0xffe14a),
  R('neonizer', 'Neonizer Rod', 5, 6200, 1.7, 1.7, 1.75, 30, 'neon', 0xff5ad8, 'A pulsing band of animated neon. The exotics cannot look away.', 0x5affd8),
  R('dragonheart', 'Dragonheart Rod', 6, 12000, 2.0, 2.0, 2.2, 38, 'dragon', 0xe8541e, 'Carved from a dragonfish spine and lit with living fire. The legend-hunter\'s rod.', 0xffae3a),
  R('quantum_reeler', 'Quantum Reeler', 5, 5800, 1.65, 1.5, 1.6, 28, 'neon', 0x3affaa, 'Reel power amplifies the longer you reel, but tension spikes are more sudden.', 0x3affaa),
  R('prismatic_rod', 'Prismatic Rod', 5, 8000, 1.6, 1.6, 1.8, 32, 'tide', 0xe8ff3a, 'Light-bending crystal frame. Boosts shard value of all catches by 25%.', 0xffaa00),
  R('leviathan_harpoon', 'Leviathan Harpoon', 6, 15000, 2.2, 2.4, 2.0, 36, 'iron', 0x4a5a6a, 'Heavy-duty steel composite. Reduces aggression and strength of massive fish by 35%.'),
  R('angler_whisper', 'Angler\'s Whisper', 6, 18000, 1.9, 1.9, 2.5, 34, 'wood', 0xffaaff, 'Soft willow wood that channels thoughts. Perfect hook sweet-spot is 50% wider, prevents streak breaks once.', 0xffaaff),
  R('ghostweaver', 'Ghostweaver Rod', 7, 25000, 2.5, 2.5, 3.0, 42, 'storm', 0xaa3aff, 'Forged in a rift between waters. Ignores weather restrictions and acts as if in the secret cove anywhere.', 0xaa3aff),
] as RodDef[]).map(r => [r.id, r]));
export const ALL_RODS = Object.values(RODS);

// ---------------- baits ----------------
export interface BaitDef {
  id: string; name: string; rarity: Rarity; price: number;
  /** infinite supply (never consumed) */
  infinite?: boolean;
  /** flat additive weight bonus toward higher-rarity rolls */
  rareBoost: number;
  /** visual style for the bait + bobber FX */
  fx: 'worm' | 'grub' | 'glow' | 'cricket' | 'minnow' | 'zap' | 'dragon' | 'celestial' | 'bread';
  color: number; glow?: number;
  /** time bonus window */
  timeBonus?: TimeOfDay[];
  desc: string;
}
const B = (id: string, name: string, rarity: Rarity, price: number, rareBoost: number, fx: BaitDef['fx'], color: number, desc: string, opts: Partial<BaitDef> = {}): BaitDef =>
  ({ id, name, rarity, price, rareBoost, fx, color, desc, ...opts });

export const BAITS: Record<string, BaitDef> = Object.fromEntries(([
  B('worm', 'Worm Bait', 'Common', 0, 0, 'worm', 0xc8745a, 'A wriggling garden worm. Never runs out, never impresses.', { infinite: true }),
  B('grub', 'Fat Grub', 'Common', 6, 0.1, 'grub', 0xe8d8a8, 'A pale, plump grub. The bottom-feeders adore it.'),
  B('bread', 'Dough Ball', 'Common', 8, 0.1, 'bread', 0xe8c88a, 'Pinched from the bakery. Koi and carp rise for it.'),
  B('cricket', 'Cricket Lure', 'Uncommon', 18, 0.2, 'cricket', 0x6a8a3a, 'A twitching cricket on a barb. The river trout cannot resist.'),
  B('minnow_lure', 'Minnow Lure', 'Uncommon', 26, 0.25, 'minnow', 0xc8d2e0, 'A flashing tin minnow. Predators strike it like a real fish.'),
  B('glowworm', 'Glow Worm', 'Rare', 60, 0.45, 'glow', 0x8affd8, 'Glows softly in the dark. A potent lure after sundown.', { glow: 0x8affd8, timeBonus: ['night', 'dusk'] }),
  B('electrozap', 'Electrozap Bait', 'Rare', 90, 0.5, 'zap', 0xffe14a, 'A bait that snaps with static. Storm-spawned fish home in on it.', { glow: 0xffe14a, timeBonus: ['night'] }),
  B('dragon', 'Dragon Essence', 'Mythical', 320, 0.85, 'dragon', 0xff6a4a, 'Bottled scent of a dragonfish. Lures the rarest monsters of the deep.', { glow: 0xff6a4a }),
  B('celestial', 'Celestial Lure', 'Legendary', 800, 1.2, 'celestial', 0xf2c14e, 'The highest-tier bait ever crafted. The heavens themselves take notice.', { glow: 0xffe14a }),
  B('kelp_extract', 'Scented Kelp-Extract', 'Uncommon', 22, 0.2, 'grub', 0x5a8a5a, 'A potent concentrate of green pond kelp. Attracts peaceful pond carp and koi.'),
  B('pheromone_glop', 'Pheromone Glop', 'Rare', 75, 0.45, 'glow', 0xffaaff, 'Highly volatile musk. Attracts fish from other times of day and weather.', { glow: 0xffaaff }),
  B('golden_beetle', 'Golden Beetle Lure', 'Rare', 110, 0.55, 'zap', 0xffd25a, 'A shiny metallic beetle lure. Boosts the physical size of caught fish by 20%.', { glow: 0xffd25a }),
  B('chum_bucket', 'Chum Bucket', 'Elite', 250, 0.75, 'worm', 0xe85a5a, 'A bucket of chopped baitfish. Attracts predatory pike and leviathans alike.'),
  B('siren_blossom', 'Siren\'s Blossom', 'Mythical', 450, 1.0, 'celestial', 0xff7ad8, 'An exotic flower that radiates mystical energy. Boosts Mythical fish spawn rates by 25%.', { glow: 0xff7ad8 }),
] as BaitDef[]).map(b => [b.id, b]));
export const ALL_BAITS = Object.values(BAITS);

// ---------------- cooked dishes (fish → battle items) ----------------
// These mirror data.ts ITEMS so they slot straight into the battle item
// system. The fishing shop's kitchen crafts them from caught fish.
export interface RecipeDef {
  id: string;            // resulting ITEM id (registered in data.ts)
  name: string;
  /** how many fish of the given minimum rarity are needed */
  cost: number;
  minRarity: Rarity;
  method: 'Grill' | 'Smoke' | 'Stew' | 'Feast';
  desc: string;
}
export const RECIPES: RecipeDef[] = [
  { id: 'fish_grill',   name: 'Grilled Fillet',    cost: 2, minRarity: 'Common',   method: 'Grill', desc: 'Restores 120 HP to one Guardian. Simple campfire fare.' },
  { id: 'fish_smoke',   name: 'Smoked Catch',      cost: 2, minRarity: 'Uncommon', method: 'Smoke', desc: 'Restores 90 SP to one Guardian. Keeps for the long road.' },
  { id: 'fish_stew',    name: "Angler's Stew",     cost: 3, minRarity: 'Rare',     method: 'Stew',  desc: 'Fully restores one Guardian\'s HP. A pot of pond-and-river bounty.' },
  { id: 'fish_sashimi', name: 'Prism Sashimi',     cost: 2, minRarity: 'Elite',    method: 'Feast', desc: 'Permanently +2 Speed to one Guardian. Cut from exotic flesh.' },
  { id: 'fish_roe',     name: 'Mythic Roe',        cost: 1, minRarity: 'Mythical', method: 'Feast', desc: 'Permanently +6 max HP to one Guardian. Eggs that hum with power.' },
  { id: 'fish_legend',  name: 'Legendary Banquet', cost: 1, minRarity: 'Legendary',method: 'Feast', desc: 'Permanently +3 to ALL stats — a feast told of for generations.' },
];

// ---------------- fishing progression ----------------
/** Total EXP required to REACH a given fishing level. */
export function fishingExpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) total += Math.round(70 * Math.pow(l - 1, 1.45));
  return total;
}
export const FISHING_MAX_LEVEL = 50;

export function fishingLevelFromExp(exp: number): number {
  let lvl = 1;
  while (lvl < FISHING_MAX_LEVEL && exp >= fishingExpForLevel(lvl + 1)) lvl++;
  return lvl;
}

// progression titles by level
export interface FishingTitle { level: number; title: string; }
export const LEVEL_TITLES: FishingTitle[] = [
  { level: 1, title: 'Pond Rookie' },
  { level: 5, title: 'Dock Hand' },
  { level: 10, title: 'River Wader' },
  { level: 15, title: 'Seasoned Angler' },
  { level: 20, title: 'River Master' },
  { level: 28, title: 'Fish Whisperer' },
  { level: 36, title: 'Deep-Water Sage' },
  { level: 44, title: 'Legendary Angler' },
  { level: 50, title: 'Master of the Waters' },
];
export function titleForLevel(level: number): string {
  let t = LEVEL_TITLES[0].title;
  for (const lt of LEVEL_TITLES) if (level >= lt.level) t = lt.title;
  return t;
}

// leaderboard rank titles
export function rankTitle(rank: number): string | null {
  if (rank === 1) return 'Master of the Waters';
  if (rank <= 3) return 'Legendary Angler';
  if (rank <= 10) return 'Elite Fisher';
  if (rank <= 50) return 'Professional Fisher';
  if (rank <= 100) return 'Skilled Angler';
  return null;
}

// ---------------- achievements ----------------
export interface FishAchievement { id: string; name: string; desc: string; icon: string; check: (fs: FishingState) => boolean; }
export const FISH_ACHIEVEMENTS: FishAchievement[] = [
  { id: 'first_cast', name: 'First Cast', desc: 'Catch your very first fish.', icon: '🎣', check: fs => fs.totalCaught >= 1 },
  { id: 'ten_fish', name: 'Getting the Hang of It', desc: 'Catch 10 fish.', icon: '🐟', check: fs => fs.totalCaught >= 10 },
  { id: 'hundred_fish', name: 'Old Salt', desc: 'Catch 100 fish.', icon: '🦑', check: fs => fs.totalCaught >= 100 },
  { id: 'family_pond', name: 'Pond Scholar', desc: 'Discover every Pond Fish.', icon: '🪷', check: fs => fishByFamily('pond').every(f => fs.discovered[f.id]) },
  { id: 'family_river', name: 'River Scholar', desc: 'Discover every River Fish.', icon: '🌊', check: fs => fishByFamily('river').every(f => fs.discovered[f.id]) },
  { id: 'collector', name: 'Master Collector', desc: 'Discover all 25 species.', icon: '📖', check: fs => ALL_FISH.every(f => fs.discovered[f.id]) },
  { id: 'first_rare', name: 'A Glint Below', desc: 'Land a Rare fish.', icon: '🟦', check: fs => Object.entries(fs.discovered).some(([id]) => rarityRank(FISH[id]?.rarity ?? 'Common') >= 2) },
  { id: 'first_legend', name: 'Touched by Legend', desc: 'Land a Legendary fish.', icon: '🌈', check: fs => fs.legendaryCount >= 1 },
  { id: 'streak5', name: 'On a Roll', desc: 'Reach a 5-catch streak.', icon: '🔥', check: fs => fs.bestStreak >= 5 },
  { id: 'streak10', name: 'In the Zone', desc: 'Reach a 10-catch streak.', icon: '⚡', check: fs => fs.bestStreak >= 10 },
  { id: 'top20', name: 'Name on the Board', desc: 'Break into the Top 20.', icon: '🏆', check: fs => fs.bestRank > 0 && fs.bestRank <= 20 },
  { id: 'top3', name: 'Legendary Status', desc: 'Reach the Top 3.', icon: '⭐', check: fs => fs.bestRank > 0 && fs.bestRank <= 3 },
  { id: 'number_one', name: 'Master of the Waters', desc: 'Claim Rank #1.', icon: '👑', check: fs => fs.bestRank === 1 },
  { id: 'level_master', name: 'Grand Angler', desc: 'Reach Fishing Level 50.', icon: '🎖️', check: fs => fishingLevelFromExp(fs.exp) >= FISHING_MAX_LEVEL },
  { id: 'line_collector', name: 'Line Collector', desc: 'Own 5 specialized fishing lines.', icon: '🧵', check: fs => (fs.ownedLines ?? []).length >= 5 },
  { id: 'rod_collector', name: 'Arsenal of the Deep', desc: 'Own 8 different fishing rods.', icon: '🔱', check: fs => fs.ownedRods.length >= 8 },
  { id: 'perfect_streak', name: 'Unstoppable Angler', desc: 'Reach a 15-catch streak.', icon: '🔥', check: fs => fs.bestStreak >= 15 },
  { id: 'giant_catch', name: 'The Big One', desc: 'Catch a fish weighing over 50kg.', icon: '🐋', check: fs => Object.values(fs.discovered).some(rec => rec.maxWeight >= 50) },
  { id: 'master_chef', name: 'Angler\'s Banquet', desc: 'Reach level 50 and land at least 3 Legendary fish.', icon: '👑', check: fs => fs.legendaryCount >= 3 && fishingLevelFromExp(fs.exp) >= 50 },
];

// ============================================================
//  PERSISTENT FISHING STATE
// ============================================================
export interface FishRecord {
  count: number;
  maxWeight: number;
  maxLength: number;
  bestScore: number;
  firstAt?: number;      // ms timestamp of first catch
}

export interface HallRecord { value: number; holder: string; detail: string; at?: number; }

export interface LeaderEntry {
  id: string; name: string; score: number;
  isPlayer?: boolean;
  // profile flavor (simulated)
  totalCaught: number; largestFish: string; favoriteSpecies: string;
  bestLocation: string; legendaryCount: number; level: number;
}

export interface FishingState {
  exp: number;
  ownedRods: string[];
  equippedRod: string;
  ownedLines: string[];
  equippedLine: string;
  baitStock: Record<string, number>;   // consumable baits (worm is infinite)
  equippedBait: string;
  discovered: Record<string, FishRecord>;
  totalCaught: number;
  lifetimeScore: number;
  bestCatchScore: number;
  legendaryCount: number;
  mythicalCount: number;
  streak: number;
  bestStreak: number;
  bestRank: number;                     // best (lowest) leaderboard rank reached, 0 = none
  achievements: string[];
  activeTitle: string;
  leaderboard: LeaderEntry[];
  simCounter: number;                   // counts fishing sessions for NPC sim cadence
  hallOfFame: Record<string, HallRecord>;
  /** money is the global player.shards — fishing has no separate currency */
  caughtFishBag: Record<Rarity, number>; // raw caught fish held for cooking, by rarity
  seenIntro: boolean;
  dailyBest: number;                    // best single-session score (for Daily Record bonus)
  bounties: string[];                   // claimed fishing-quest ids
}

// ---------------- fishing quests / bounties ----------------
export interface FishBounty {
  id: string; giver: string; desc: string;
  reward: { shards?: number; item?: string; bait?: string; baitQty?: number; rod?: string };
  check: (fs: FishingState) => boolean;
}
export const FISHING_BOUNTIES: FishBounty[] = [
  { id: 'fq_first', giver: 'Old Bait Pete', desc: 'Catch your first 3 fish.', reward: { shards: 120, bait: 'grub', baitQty: 5 }, check: fs => fs.totalCaught >= 3 },
  { id: 'fq_carp', giver: 'Old Bait Pete', desc: 'Discover the Pond Carp.', reward: { shards: 150 }, check: fs => !!fs.discovered['pond_carp'] },
  { id: 'fq_river', giver: 'Captain Finwick', desc: 'Discover any 3 River Fish.', reward: { shards: 400, bait: 'cricket', baitQty: 6 }, check: fs => fishByFamily('river').filter(f => fs.discovered[f.id]).length >= 3 },
  { id: 'fq_rare', giver: 'Marina Wavecrest', desc: 'Land any Rare-or-better fish.', reward: { shards: 600 }, check: fs => Object.keys(fs.discovered).some(id => rarityRank(FISH[id]?.rarity ?? 'Common') >= 2) },
  { id: 'fq_predator', giver: 'Greggy', desc: 'Discover 3 Predator Fish.', reward: { shards: 900, bait: 'minnow_lure', baitQty: 8 }, check: fs => fishByFamily('predator').filter(f => fs.discovered[f.id]).length >= 3 },
  { id: 'fq_streak', giver: 'Luna Tidewalker', desc: 'Reach a 5-catch streak.', reward: { shards: 800, bait: 'glowworm', baitQty: 4 }, check: fs => fs.bestStreak >= 5 },
  { id: 'fq_exotic', giver: 'Researcher Wren', desc: 'Discover any Exotic Fish.', reward: { shards: 1200 }, check: fs => fishByFamily('exotic').some(f => fs.discovered[f.id]) },
  { id: 'fq_ancient', giver: 'Researcher Wren', desc: 'Discover any Ancient Fish.', reward: { shards: 1500, bait: 'dragon', baitQty: 2 }, check: fs => fishByFamily('ancient').some(f => fs.discovered[f.id]) },
  { id: 'fq_legend', giver: 'Old Man River', desc: 'Land a Legendary fish.', reward: { shards: 5000, bait: 'celestial', baitQty: 1 }, check: fs => fs.legendaryCount >= 1 },
  { id: 'fq_collect', giver: 'Researcher Wren', desc: 'Discover all 25 species.', reward: { shards: 12000 }, check: fs => ALL_FISH.every(f => fs.discovered[f.id]) },
  { id: 'fq_lines', giver: 'Old Bait Pete', desc: 'Own at least 3 specialized lines.', reward: { shards: 500 }, check: fs => (fs.ownedLines ?? []).length >= 3 },
  { id: 'fq_titan', giver: 'Captain Finwick', desc: 'Catch the Titan River Serpent.', reward: { shards: 6000 }, check: fs => !!fs.discovered['titan_serpent'] },
  { id: 'fq_abyss', giver: 'Old Man River', desc: 'Catch the Abyss Pike.', reward: { shards: 6000 }, check: fs => !!fs.discovered['abyss_pike'] },
  { id: 'fq_streak10', giver: 'Luna Tidewalker', desc: 'Reach a 10-catch streak.', reward: { shards: 1500, bait: 'celestial', baitQty: 2 }, check: fs => fs.bestStreak >= 10 },
];

// ---------------- leaderboard seed ----------------
const NPC_SEED: [string, number][] = [
  ['Captain Finwick', 985400], ['Marina Wavecrest', 941850], ['Aljay', 903250],
  ['Old Man River', 872300], ['Luna Tidewalker', 845700], ['Greggy', 810500],
  ['Onnel', 784100], ['Fisher Tom', 742900], ['Coral Quinn', 721450],
  ['River Joe', 699800], ['Stormhook Sam', 681250], ['Pearl Castor', 663900],
  ['Gillbert Finn', 648700], ['Tidal Rex', 632150], ['Sandy Hooks', 615300],
  ['Willow Current', 601850], ['Harbor Hank', 588400], ['Crystal Baiter', 572900],
  ['Driftwood Dan', 559750], ['Echo Waters', 543200],
];
const SPECIES_NAMES = ALL_FISH.map(f => f.name);
const LOCATIONS = ['the Great Pond', 'the South River', 'the Hidden Cove', 'the Old Dock', 'the Reed Shallows'];

function seedLeader(name: string, score: number, i: number): LeaderEntry {
  // deterministic-ish flavor derived from the seed index
  const rng = mulb(1000 + i * 37);
  return {
    id: 'npc_' + i, name, score,
    totalCaught: 200 + Math.floor(rng() * 2400),
    largestFish: SPECIES_NAMES[Math.floor(rng() * SPECIES_NAMES.length)],
    favoriteSpecies: SPECIES_NAMES[Math.floor(rng() * SPECIES_NAMES.length)],
    bestLocation: LOCATIONS[Math.floor(rng() * LOCATIONS.length)],
    legendaryCount: Math.floor(rng() * 12),
    level: 28 + Math.floor(rng() * 22),
  };
}

// tiny local RNG so this module needs no THREE import
function mulb(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultLeaderboard(): LeaderEntry[] {
  return NPC_SEED.map(([n, s], i) => seedLeader(n, s, i));
}

export function defaultFishingState(): FishingState {
  return {
    exp: 0,
    ownedRods: ['beginner'],
    equippedRod: 'beginner',
    ownedLines: ['basic_mono'],
    equippedLine: 'basic_mono',
    baitStock: { worm: Infinity },
    equippedBait: 'worm',
    discovered: {},
    totalCaught: 0,
    lifetimeScore: 0,
    bestCatchScore: 0,
    legendaryCount: 0,
    mythicalCount: 0,
    streak: 0,
    bestStreak: 0,
    bestRank: 0,
    achievements: [],
    activeTitle: 'Pond Rookie',
    leaderboard: defaultLeaderboard(),
    simCounter: 0,
    hallOfFame: {},
    caughtFishBag: { Common: 0, Uncommon: 0, Rare: 0, Elite: 0, Mythical: 0, Legendary: 0 },
    seenIntro: false,
    dailyBest: 0,
    bounties: [],
  };
}

/** Heal a possibly-old/partial save blob into a full FishingState. */
export function normalizeFishingState(raw: Partial<FishingState> | undefined): FishingState {
  const base = defaultFishingState();
  if (!raw) return base;
  const fs: FishingState = {
    ...base, ...raw,
    baitStock: { ...base.baitStock, ...(raw.baitStock ?? {}) },
    discovered: { ...(raw.discovered ?? {}) },
    achievements: [...(raw.achievements ?? [])],
    ownedRods: [...new Set(['beginner', ...(raw.ownedRods ?? [])])],
    ownedLines: [...new Set(['basic_mono', ...(raw.ownedLines ?? [])])],
    equippedLine: raw.equippedLine && LINES[raw.equippedLine] ? raw.equippedLine : 'basic_mono',
    leaderboard: (raw.leaderboard && raw.leaderboard.length >= 20) ? raw.leaderboard : base.leaderboard,
    hallOfFame: { ...(raw.hallOfFame ?? {}) },
    caughtFishBag: { ...base.caughtFishBag, ...(raw.caughtFishBag ?? {}) },
    bounties: [...(raw.bounties ?? [])],
  };
  fs.baitStock.worm = Infinity;
  if (!RODS[fs.equippedRod]) fs.equippedRod = 'beginner';
  if (!BAITS[fs.equippedBait]) fs.equippedBait = 'worm';
  return fs;
}

// ============================================================
//  GAMEPLAY LOGIC
// ============================================================
export type SpotKind = 'pond' | 'river' | 'secret';
export interface CatchContext {
  level: number; time: TimeOfDay; weather: Weather; spot: SpotKind;
  bait: BaitDef; rod: RodDef; line: LineDef;
  /** 0..1 how good the cast/timing was (perfect cast boosts rares) */
  castQuality: number;
  /** species hinted by the shadow the player cast onto (favored), or null */
  targetSpecies?: string | null;
}

/** Weighted spawn roll honoring every condition in the spec. */
export function rollFish(ctx: CatchContext, rnd: () => number): SpeciesDef {
  const candidates: { sp: SpeciesDef; w: number }[] = [];
  const isGhostweaver = ctx.rod.id === 'ghostweaver';
  const isPheromone = ctx.bait.id === 'pheromone_glop';
  
  for (const sp of ALL_FISH) {
    const sr = sp.spawn;
    // hard gates
    if (sr.minLevel && ctx.level < sr.minLevel) continue;
    
    // Ghostweaver rod ignores weather/spot kind limitations (treats everything as valid or secret)
    if (!isGhostweaver) {
      if (sr.spot && !sr.spot.includes(ctx.spot)) continue;
      // Pheromone Glop bait ignores time and weather restrictions
      if (!isPheromone) {
        if (sr.time && !sr.time.includes(ctx.time)) continue;
        if (sr.weather && !sr.weather.includes(ctx.weather)) continue;
      }
    } else {
      // Ghostweaver: allow secret-spot only fish even if we fish in river/pond
      if (sr.spot && sr.spot.includes('secret') && ctx.spot !== 'secret') {
        // Allow it!
      } else if (sr.spot && !sr.spot.includes(ctx.spot)) {
        // Still respect other spot kinds unless it's river/pond specific
      }
      if (!isPheromone) {
        // Ghostweaver also ignores weather
      }
    }
    
    if (sr.needsSpecialBait) {
      const okBait = (sr.baitPref ?? []).includes(ctx.bait.id);
      if (!okBait) continue;
    }
    let w = sr.weight;
    // rarity scaling — rarer fish are exponentially less likely, then nudged up by luck/bait/cast/line
    const rk = rarityRank(sp.rarity);
    let rareLift = 1;
    if (rk >= 2) {
      rareLift = (ctx.rod.luck * ctx.line.luckBonus) * (1 + ctx.bait.rareBoost) * (0.6 + ctx.castQuality * 0.8);
    }
    w = w * rareLift;
    // bait preference bonus
    if (sr.baitPref?.includes(ctx.bait.id)) w *= 2.4;
    // bait time bonus
    if (ctx.bait.timeBonus?.includes(ctx.time)) w *= 1.4;
    // shadow targeting — the species under the cast is strongly favored
    if (ctx.targetSpecies && sp.id === ctx.targetSpecies) w *= 6;
    // legendary ceiling
    if (sr.ceiling) w = Math.min(w, sr.ceiling * 100000 * rareLift);
    if (w > 0) candidates.push({ sp, w });
  }
  if (candidates.length === 0) return FISH['silver_minnow'];
  const total = candidates.reduce((a, c) => a + c.w, 0);
  let r = rnd() * total;
  for (const c of candidates) { r -= c.w; if (r <= 0) return c.sp; }
  return candidates[candidates.length - 1].sp;
}

/** Roll a concrete weight & length for a caught fish (bell-ish toward the middle, rare big ones). */
export function rollSize(sp: SpeciesDef, rnd: () => number, sizeMultiplier = 1.0): { weightKg: number; lengthCm: number; sizePct: number } {
  // average of two rolls → bell curve; cube to make trophies rarer
  const roll = (rnd() + rnd()) / 2;
  const big = Math.min(1.0, Math.pow(roll, 0.8) * sizeMultiplier);
  const w = sp.weightKg[0] + (sp.weightKg[1] - sp.weightKg[0]) * big;
  const l = sp.lengthCm[0] + (sp.lengthCm[1] - sp.lengthCm[0]) * big;
  return { weightKg: Math.round(w * 100) / 100, lengthCm: Math.round(l * 10) / 10, sizePct: big };
}

// ---------------- scoring ----------------
export interface ScoreBreakdown {
  rarity: number; size: number; time: number; distance: number;
  perfectHook: number; combo: number; discovery: number; special: number;
  total: number;
  labels: { key: string; label: string; value: number }[];
}

export interface ScoreInput {
  sp: SpeciesDef; sizePct: number;
  battleMs: number;       // how long the fish-fight took
  castDistance: number; castMax: number;
  perfectHook: boolean; goodHook: boolean;
  streak: number;
  firstDiscovery: boolean;
  legendaryEncounter: boolean;
  newDailyRecord: boolean;
  lineId?: string;
  fightGrade?: string;
  gradeMult?: number;
}

export function computeScore(inp: ScoreInput): ScoreBreakdown {
  const rd = RARITY[inp.sp.rarity];
  const rarity = rd.score + inp.sp.scoreValue;
  const size = Math.round(rarity * 0.6 * inp.sizePct);
  // catch time — fast battles score more; cap the bonus
  const secs = inp.battleMs / 1000;
  const time = Math.max(0, Math.round(600 - secs * 28));
  // casting distance
  const distRatio = Math.min(1, inp.castDistance / inp.castMax);
  const distance = Math.round(120 + distRatio * 680);
  const perfectHook = inp.perfectHook ? 500 : inp.goodHook ? 180 : 0;
  let comboMult = inp.streak >= 10 ? 1.0 : inp.streak >= 5 ? 0.6 : inp.streak >= 3 ? 0.35 : inp.streak >= 2 ? 0.15 : 0;
  if (inp.lineId === 'golden_filament') {
    comboMult *= 2; // Golden Filament Line doubles combo bonuses!
  }
  const subtotalForCombo = rarity + size + time + distance + perfectHook;
  const combo = Math.round(subtotalForCombo * comboMult);
  const discovery = inp.firstDiscovery ? 1000 : 0;
  let special = 0;
  if (inp.legendaryEncounter) special += 3000;
  if (inp.newDailyRecord) special += 750;
  
  const baseTotal = rarity + size + time + distance + perfectHook + combo + discovery + special;
  const mult = inp.gradeMult ?? 1.0;
  const total = Math.round(baseTotal * mult);
  
  const labels = [
    { key: 'rarity', label: 'Fish Rarity', value: rarity },
    { key: 'size', label: 'Fish Size', value: size },
    { key: 'time', label: 'Catch Time', value: time },
    { key: 'distance', label: 'Casting Distance', value: distance },
    { key: 'perfectHook', label: 'Perfect Hook Bonus', value: perfectHook },
    { key: 'combo', label: 'Combo Bonus', value: combo },
    { key: 'discovery', label: 'Discovery Bonus', value: discovery },
    { key: 'special', label: 'Special Event Bonus', value: special },
  ];
  if (inp.fightGrade) {
    labels.push({ key: 'grade', label: `Fight Rank ${inp.fightGrade} (×${mult.toFixed(2)})`, value: total - baseTotal });
  }

  return {
    rarity, size, time, distance, perfectHook, combo, discovery, special, total,
    labels,
  };
}

// ---------------- leaderboard simulation ----------------
/**
 * Advance the living NPC leaderboard. Called each session; every 3–6 sessions
 * the NPCs catch, gain (and occasionally lose) score and reshuffle.
 * Returns true if a simulation tick actually fired.
 */
export function simulateLeaderboard(fs: FishingState, rnd: () => number): { fired: boolean; tickerEvents: string[] } {
  fs.simCounter++;
  const cadence = 3 + Math.floor(rnd() * 4); // 3..6
  const tickerEvents: string[] = [];
  if (fs.simCounter < cadence) return { fired: false, tickerEvents };
  fs.simCounter = 0;
  for (const e of fs.leaderboard) {
    if (e.isPlayer) continue;
    // most anglers gain a little; a few have a bad run
    const luck = rnd();
    let delta = Math.round((rnd() - 0.25) * 26000);
    e.totalCaught += Math.max(0, Math.round(rnd() * 14));
    if (luck > 0.86) {
      // a big catch — sometimes a legendary
      delta += Math.round(20000 + rnd() * 80000);
      if (rnd() > 0.6) {
        e.legendaryCount++;
        const fishName = SPECIES_NAMES[Math.floor(rnd() * SPECIES_NAMES.length)];
        tickerEvents.push(`🌈 ${e.name} landed a ${fishName}!`);
      }
    }
    e.score = Math.max(50000, e.score + delta);
  }
  return { fired: true, tickerEvents };
}

/** Insert/refresh the player on the board and resort. Returns the player's 1-based rank. */
export function rankPlayer(fs: FishingState, playerName: string): number {
  let me = fs.leaderboard.find(e => e.isPlayer);
  if (!me) {
    me = {
      id: 'player', name: playerName, score: fs.lifetimeScore, isPlayer: true,
      totalCaught: fs.totalCaught, largestFish: '—', favoriteSpecies: '—',
      bestLocation: 'the Great Pond', legendaryCount: fs.legendaryCount,
      level: fishingLevelFromExp(fs.exp),
    };
    fs.leaderboard.push(me);
  }
  me.name = playerName;
  me.score = fs.lifetimeScore;
  me.totalCaught = fs.totalCaught;
  me.legendaryCount = fs.legendaryCount;
  me.level = fishingLevelFromExp(fs.exp);
  // favorite = most-caught species
  let favId = '', favN = -1;
  for (const [id, rec] of Object.entries(fs.discovered)) if (rec.count > favN) { favN = rec.count; favId = id; }
  if (favId) me.favoriteSpecies = FISH[favId]?.name ?? '—';
  // largest = heaviest record
  let bigId = '', bigW = -1;
  for (const [id, rec] of Object.entries(fs.discovered)) if (rec.maxWeight > bigW) { bigW = rec.maxWeight; bigId = id; }
  if (bigId) me.largestFish = `${FISH[bigId]?.name} (${bigW.toFixed(1)}kg)`;

  fs.leaderboard.sort((a, b) => b.score - a.score);
  const rank = fs.leaderboard.findIndex(e => e.isPlayer) + 1;
  return rank;
}

/** Format a big number with thousands separators. */
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
