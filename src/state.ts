// ============================================================
// AZ Tamer — runtime state: Guardian instances, Crawler, player
// ============================================================
import {
  SPECIES, TECHS, ITEMS, CRAWLER_PARTS, expForLevel, getSpeciesPassive,
  type SpeciesDef, type Stats, type StatKey, type Technique, type CrawlerPart,
  HOUSES, TYPE_ELEMENT, elementsOf, type Element, isBig3Legend, formRank,
  STAGE_STAT_MULT, LEVEL_CAP_BY_RANK,
  GENE_WEIGHT, TRAIN_DIVISOR, TRAIN_PER_STAT_MAX, TRAIN_TOTAL_MAX,
  natureMult, rollGenes, rollNatureId, emptyStats, geneRating,
} from './data';
import { DEFAULT_APPEARANCE, type Appearance } from './models';
import { defaultFishingState, normalizeFishingState, type FishingState } from './fishingdata';
import { type MMRState, recordVisit } from './mmr';

let uidCounter = 1;
export const uid = () => `g${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

// ---------------- Guardian ----------------
export interface GuardianCustomization {
  colors?: { primary?: number; secondary?: number; accent?: number };
  partsScale?: { head?: number; tail?: number; wings?: number };
  replacedParts?: { tail?: string; wings?: string };
}

export interface ParentSnapshot {
  speciesId: string;
  nickname: string;
  level: number;
  parents?: { parentA: ParentSnapshot; parentB: ParentSnapshot };
}

export interface GuardianSave {
  id: string; speciesId: string; nickname: string;
  level: number; exp: number; bonus: Stats;
  hp: number; sp: number; isTemp?: boolean;
  levelCap?: number;
  techPoints?: number;
  learnedTechs?: string[];
  isStarter?: boolean;
  customization?: GuardianCustomization;
  elements?: Element[];
  parents?: { parentA: ParentSnapshot; parentB: ParentSnapshot };
  evolutionPoints?: number;
  resCooldown?: number;
  genes?: Stats;
  natureId?: string;
  training?: Stats;
  heldCharm?: string;
}

export class Guardian {
  id: string;
  speciesId: string;
  nickname: string;
  level: number;
  exp: number;            // total accumulated exp
  bonus: Stats;           // permanent gem/evolution bonuses
  hp: number;
  sp: number;
  isTemp = false;         // academy loaner — removed after the exam
  levelCap = 25;
  techPoints = 0;
  learnedTechs: string[] = [];
  isStarter = false;
  customization?: GuardianCustomization;
  elements: Element[];
  parents?: { parentA: ParentSnapshot; parentB: ParentSnapshot };
  evolutionPoints = 0;
  statMultiplier = 1.0;
  extraHpBonus = 0;
  resCooldown = 0;
  /** Hidden genes (IVs, 0–31 per stat) rolled at birth; inheritable by breeding. */
  genes: Stats = { hp: 0, sp: 0, atk: 0, def: 0, spd: 0, wis: 0 };
  /** Nature id (see NATURES) — skews one stat +10% and another −10%. */
  natureId = '';
  /** Earned training (effort) points, capped per-stat and in total. */
  training: Stats = { hp: 0, sp: 0, atk: 0, def: 0, spd: 0, wis: 0 };
  /** Held charm id (battle gear). Charm ownership is tracked on Player. */
  heldCharm?: string;

  constructor(speciesId: string, level = 1, nickname?: string) {
    this.id = uid();
    this.speciesId = speciesId;
    this.nickname = nickname ?? SPECIES[speciesId].name;
    this.level = level;
    this.exp = expForLevel(level);
    this.bonus = { hp: 0, sp: 0, atk: 0, def: 0, spd: 0, wis: 0 };
    this.elements = [...elementsOf(speciesId)];

    // Genetics: roll a deterministic gene set + nature from this Guardian's id,
    // and start with no training. (load() restores saved values; breeding
    // overwrites these with inherited ones.) Must precede the stats read below.
    this.genes = rollGenes(this.id);
    this.natureId = rollNatureId(this.id);
    this.training = emptyStats();

    // Set level cap based on form rank (Novice keeps a little random variety)
    const _rank = formRank(this.species);
    this.levelCap = _rank === 0
      ? 12 + Math.floor(Math.random() * 5) // 12-16
      : (LEVEL_CAP_BY_RANK[_rank] ?? 99);
    
    // Default starting techniques
    this.learnedTechs = this.species.techs
      .filter(t => t.level <= this.level)
      .map(t => t.tech)
      .slice(-5);
    
    this.techPoints = Math.floor(this.level / 5);

    this.hp = this.stats.hp;
    this.sp = this.stats.sp;
  }

  get species(): SpeciesDef { return SPECIES[this.speciesId]; }

  get stats(): Stats {
    const s = this.species;
    const l = this.level - 1;
    const mult = this.isStarter ? 2.025 : 1.0;
    // Genes, training (effort) and nature fold into the base figure BEFORE the
    // form-rank multipliers, so they scale proportionally at every rank.
    const calc = (k: StatKey) => {
      const gene = (this.genes?.[k] ?? 0) * GENE_WEIGHT[k];
      const train = Math.floor((this.training?.[k] ?? 0) / TRAIN_DIVISOR[k]);
      const raw = (s.base[k] + s.growth[k] * l + this.bonus[k] + gene + train) * mult * natureMult(this.natureId, k);
      return Math.floor(raw);
    };
    const baseStats = { hp: calc('hp'), sp: calc('sp'), atk: calc('atk'), def: calc('def'), spd: calc('spd'), wis: calc('wis') };
    
    // Form-rank stat multipliers — monotonic by how many times evolved:
    // Novice 1.0 → Apex 1.85 → Split 2.35 → … → Aether 5.40 (hp/atk/def/wis).
    const [hpAtkDefWisMult, otherMult] = STAGE_STAT_MULT[formRank(s)] ?? STAGE_STAT_MULT[0];
    
    baseStats.hp = Math.floor(baseStats.hp * hpAtkDefWisMult);
    baseStats.atk = Math.floor(baseStats.atk * hpAtkDefWisMult);
    baseStats.def = Math.floor(baseStats.def * hpAtkDefWisMult);
    baseStats.wis = Math.floor(baseStats.wis * hpAtkDefWisMult);
    
    baseStats.sp = Math.floor(baseStats.sp * otherMult);
    baseStats.spd = Math.floor(baseStats.spd * otherMult);
    
    // Legendary Guardians of the Big Three (Aljay, Greggy, Onnel):
    if (isBig3Legend(this.speciesId)) {
      baseStats.hp = Math.floor(baseStats.hp * 1.5); // Extra 50% HP
      baseStats.atk = Math.floor(baseStats.atk * 1.5); // Extra 50% Attack
      baseStats.def = Math.floor(baseStats.def * 1.5); // Extra 50% Defense
    }
    // Boss-tier Aether world-enders are walls: extra HP & Attack heft.
    if (s.isBoss) {
      baseStats.hp = Math.floor(baseStats.hp * 1.25);
      baseStats.atk = Math.floor(baseStats.atk * 1.25);
    }

    // Apply Guild Perk stat boost if element matches active guild element
    if (Player.activeInstance && Player.activeInstance.houseId) {
      const house = HOUSES.find(h => h.id === Player.activeInstance!.houseId);
      if (house) {
        const guildEl = TYPE_ELEMENT[house.type];
        if (elementsOf(this).includes(guildEl)) {
          const perkLvl = Player.activeInstance.guildPerks?.elementMastery ?? 1;
          const boost = 1.05 + (perkLvl - 1) * 0.0075;
          baseStats.hp = Math.floor(baseStats.hp * boost);
          baseStats.sp = Math.floor(baseStats.sp * boost);
          baseStats.atk = Math.floor(baseStats.atk * boost);
          baseStats.def = Math.floor(baseStats.def * boost);
          baseStats.spd = Math.floor(baseStats.spd * boost);
          baseStats.wis = Math.floor(baseStats.wis * boost);
        }
      }
    }

    // Apply procedural/archetype passive stat changes
    const passive = getSpeciesPassive(s);
    if (passive.name.includes('Instinct')) {
      baseStats.atk = Math.floor(baseStats.atk * 1.10); // Beast: +10% Attack
    } else if (passive.name.includes('Venom')) {
      baseStats.wis = Math.floor(baseStats.wis * 1.10); // Serpent: +10% Wisdom
    } else if (passive.name.includes('Swiftness')) {
      baseStats.spd = Math.floor(baseStats.spd * 1.10); // Avian: +10% Speed
    } else if (passive.name.includes('Might')) {
      baseStats.atk = Math.floor(baseStats.atk * 1.10); // Brute: +10% Attack & HP
      baseStats.hp = Math.floor(baseStats.hp * 1.10);
    } else if (passive.name.includes('Aura')) {
      baseStats.wis = Math.floor(baseStats.wis * 1.15); // Sprite: +15% Wisdom
    } else if (passive.name.includes('Guard')) {
      baseStats.def = Math.floor(baseStats.def * 1.15); // Shell: +15% Defense
    }

    if (this.statMultiplier !== 1.0) {
      baseStats.hp = Math.floor(baseStats.hp * this.statMultiplier);
      baseStats.sp = Math.floor(baseStats.sp * this.statMultiplier);
      baseStats.atk = Math.floor(baseStats.atk * this.statMultiplier);
      baseStats.def = Math.floor(baseStats.def * this.statMultiplier);
      baseStats.spd = Math.floor(baseStats.spd * this.statMultiplier);
      baseStats.wis = Math.floor(baseStats.wis * this.statMultiplier);
    }

    if (this.extraHpBonus) {
      baseStats.hp += this.extraHpBonus;
    }

    baseStats.hp = Math.min(25000, baseStats.hp);
    baseStats.sp = Math.min(3500, baseStats.sp);
    baseStats.atk = Math.min(1500, baseStats.atk);
    baseStats.def = Math.min(1500, baseStats.def);
    baseStats.spd = Math.min(1500, baseStats.spd);
    baseStats.wis = Math.min(1500, baseStats.wis);

    return baseStats;
  }

  get techniques(): Technique[] {
    if (!this.learnedTechs || this.learnedTechs.length === 0) {
      this.learnedTechs = this.species.techs
        .filter(t => t.level <= this.level)
        .map(t => t.tech)
        .slice(-5);
    }
    return this.learnedTechs.map(id => TECHS[id]).filter(Boolean);
  }

  get fainted(): boolean { return this.hp <= 0; }
  get expToNext(): number { return expForLevel(this.level + 1) - this.exp; }

  /** Add exp; returns levels gained. Does not auto-evolve (caller decides). */
  gainExp(amount: number): number {
    this.exp += amount;
    let gained = 0;
    while (this.level < this.levelCap && this.exp >= expForLevel(this.level + 1)) {
      const before = this.stats;
      this.level++;
      gained++;
      
      // +1 Tech Point every 5 levels
      if (this.level % 5 === 0) {
        this.techPoints++;
      }

      const after = this.stats;
      // level-up heals the stat increase
      this.hp = Math.min(after.hp, this.hp + (after.hp - before.hp));
      this.sp = Math.min(after.sp, this.sp + (after.sp - before.sp));
    }
    return gained;
  }

  get pendingEvolution(): SpeciesDef | null {
    const evo = this.species.evolvesTo;
    if (evo && this.level >= evo.level) return SPECIES[evo.species];
    return null;
  }

  get pendingExtraEvolution(): SpeciesDef | null {
    const evo = this.species.extraEvolvesTo;
    if (evo && this.level >= evo.level) return SPECIES[evo.species];
    return null;
  }

  evolve(): void {
    const evo = this.species.evolvesTo;
    if (!evo) return;
    const keepNick = this.nickname !== this.species.name;
    const old = this.stats;
    this.speciesId = evo.species;
    if (!keepNick) this.nickname = this.species.name;

    // Dynamically increase level cap based on new evolution stage
    this.levelCap = Math.max(this.levelCap, LEVEL_CAP_BY_RANK[formRank(this.species)] ?? 99);

    (['atk', 'def', 'spd', 'wis'] as StatKey[]).forEach(k => {
      this.bonus[k] += Math.floor(old[k] * 0.12);
    });
    this.bonus.hp += Math.floor(old.hp * 0.08);
    this.bonus.sp += Math.floor(old.sp * 0.08);
    this.hp = this.stats.hp;
    this.sp = this.stats.sp;
  }

  extraEvolve(): void {
    const evo = this.species.extraEvolvesTo;
    if (!evo) return;
    const keepNick = this.nickname !== this.species.name;
    const old = this.stats;
    this.speciesId = evo.species;
    if (!keepNick) this.nickname = this.species.name;

    this.levelCap = Math.max(this.levelCap, LEVEL_CAP_BY_RANK[formRank(this.species)] ?? 99);

    (['atk', 'def', 'spd', 'wis'] as StatKey[]).forEach(k => {
      this.bonus[k] += Math.floor(old[k] * 0.12);
    });
    this.bonus.hp += Math.floor(old.hp * 0.08);
    this.bonus.sp += Math.floor(old.sp * 0.08);
    this.hp = this.stats.hp;
    this.sp = this.stats.sp;
  }

  /** The ascension (Special/Terra/Transcendent/Aether) target this Guardian
   *  is high-enough level for. Item/flag requirements are checked by the
   *  caller (the Ascension lab/forge), which also consumes the catalyst. */
  get pendingAscensionTarget(): SpeciesDef | null {
    const a = this.species.ascendsTo;
    if (!a) return null;
    if (a.level && this.level < a.level) return null;
    return SPECIES[a.species] ?? null;
  }

  /** Perform a high-tier ascension. Mirrors extraEvolve(): carries the +20%
   *  evolution stat bonus forward and raises the level cap to the new rank. */
  advancedEvolve(): void {
    const a = this.species.ascendsTo;
    if (!a) return;
    const keepNick = this.nickname !== this.species.name;
    const old = this.stats;
    this.speciesId = a.species;
    if (!keepNick) this.nickname = this.species.name;
    this.levelCap = Math.max(this.levelCap, LEVEL_CAP_BY_RANK[formRank(this.species)] ?? 99);
    (['atk', 'def', 'spd', 'wis'] as StatKey[]).forEach(k => {
      this.bonus[k] += Math.floor(old[k] * 0.12);
    });
    this.bonus.hp += Math.floor(old.hp * 0.08);
    this.bonus.sp += Math.floor(old.sp * 0.08);
    this.hp = this.stats.hp;
    this.sp = this.stats.sp;
  }

  healFull(): void { this.hp = this.stats.hp; this.sp = this.stats.sp; }

  save(): GuardianSave {
    return {
      id: this.id, speciesId: this.speciesId, nickname: this.nickname,
      level: this.level, exp: this.exp, bonus: { ...this.bonus },
      hp: this.hp, sp: this.sp, isTemp: this.isTemp || undefined,
      levelCap: this.levelCap,
      techPoints: this.techPoints,
      learnedTechs: [...this.learnedTechs],
      isStarter: this.isStarter || undefined,
      customization: this.customization ? JSON.parse(JSON.stringify(this.customization)) : undefined,
      elements: [...this.elements],
      parents: this.parents ? JSON.parse(JSON.stringify(this.parents)) : undefined,
      evolutionPoints: this.evolutionPoints,
      resCooldown: this.resCooldown,
      genes: { ...this.genes },
      natureId: this.natureId,
      training: { ...this.training },
      heldCharm: this.heldCharm,
    };
  }

  static load(s: GuardianSave): Guardian {
    const g = new Guardian(s.speciesId, s.level, s.nickname);
    g.id = s.id; g.exp = s.exp; g.bonus = { ...s.bonus };
    g.hp = s.hp; g.sp = s.sp; g.isTemp = !!s.isTemp;
    g.levelCap = s.levelCap ?? 25;
    g.techPoints = s.techPoints ?? 0;
    g.learnedTechs = s.learnedTechs ? [...s.learnedTechs] : [];
    g.isStarter = !!s.isStarter;
    g.customization = s.customization ? JSON.parse(JSON.stringify(s.customization)) : undefined;
    g.elements = s.elements ? [...s.elements] : [...elementsOf(s.speciesId)];
    g.parents = s.parents ? JSON.parse(JSON.stringify(s.parents)) : undefined;
    g.evolutionPoints = s.evolutionPoints ?? 0;
    g.resCooldown = s.resCooldown ?? 0;
    // Genetics — older saves predate genes/nature/training; roll deterministically
    // from the Guardian id so the same creature always gets the same legacy genes.
    g.genes = s.genes ? { ...s.genes } : rollGenes(g.id);
    g.natureId = s.natureId ?? rollNatureId(g.id);
    g.training = s.training ? { ...s.training } : emptyStats();
    g.heldCharm = s.heldCharm;
    return g;
  }
}

// ---------------- Crawler ----------------
const DEFAULT_CRAWLER_PARTS: Record<CrawlerPart['slot'], string> = {
  hull: 'hull1', engine: 'engine1', cargo: 'cargo1', cannon: 'cannon1', scanner: 'scanner1', legs: 'legs1',
};

export interface CrawlerSaveData {
  parts: Record<CrawlerPart['slot'], string>;
  hull: number; energy: number; owned: string[];
  paint?: Partial<Record<CrawlerPart['slot'], string>>;
  ownedPaints?: string[];
}

export class Crawler {
  parts: Record<CrawlerPart['slot'], string> = { ...DEFAULT_CRAWLER_PARTS };
  owned: string[] = Object.values(DEFAULT_CRAWLER_PARTS);
  /** paint job applied per part slot (absent = stock finish) */
  paint: Partial<Record<CrawlerPart['slot'], string>> = {};
  ownedPaints: string[] = [];
  hull: number;
  energy: number;

  constructor() {
    this.hull = this.hullMax;
    this.energy = this.energyMax;
  }

  part(slot: CrawlerPart['slot']): CrawlerPart { return CRAWLER_PARTS[this.parts[slot]]; }
  get hullMax(): number { return this.part('hull').value; }
  get energyMax(): number { return this.part('engine').value; }
  get cargoMax(): number { return this.part('cargo').value; }
  get cannonTier(): number { return this.part('cannon').value; }
  get scannerTier(): number { return this.part('scanner').value; }
  get firstStrikeChance(): number { return [0, 0, 0.10, 0.25, 0.35, 0.45, 0.55][this.cannonTier] ?? 0.55; }
  /** Chance for a field step to cost no Energy — finer legwork wastes less. */
  get strideEfficiency(): number { return (this.part('legs').value ?? 0) / 100; }

  equip(partId: string): void {
    const p = CRAWLER_PARTS[partId];
    if (!p || !this.owned.includes(partId)) return;
    this.parts[p.slot] = partId;
    this.hull = Math.min(this.hull, this.hullMax);
    this.energy = Math.min(this.energy, this.energyMax);
  }

  applyPaint(slot: CrawlerPart['slot'], paintId: string | null): void {
    if (paintId === null) delete this.paint[slot];
    else if (this.ownedPaints.includes(paintId)) this.paint[slot] = paintId;
  }

  restock(): void { this.hull = this.hullMax; this.energy = this.energyMax; }

  save(): CrawlerSaveData {
    return {
      parts: { ...this.parts }, hull: this.hull, energy: this.energy, owned: [...this.owned],
      paint: { ...this.paint }, ownedPaints: [...this.ownedPaints],
    };
  }
  static load(d: CrawlerSaveData): Crawler {
    const c = new Crawler();
    c.parts = { ...DEFAULT_CRAWLER_PARTS, ...d.parts }; // older saves predate the legs slot
    c.owned = [...new Set([...Object.values(DEFAULT_CRAWLER_PARTS), ...d.owned])];
    c.paint = { ...(d.paint ?? {}) };
    c.ownedPaints = [...(d.ownedPaints ?? [])];
    c.hull = d.hull; c.energy = d.energy;
    return c;
  }
}

// ---------------- Player / GameState ----------------
// Save slots: slot 1 keeps the legacy key so old saves keep working.
const SAVE_KEY_BASE = 'az-tamer-save-v1';
export const SAVE_SLOTS = 12;
let activeSlot = 1;
const slotKey = (slot: number) => (slot <= 1 ? SAVE_KEY_BASE : `${SAVE_KEY_BASE}-s${slot}`);

export interface SavedLocation {
  type: 'town' | 'university' | 'terra' | 'agdao' | 'salmonan' | 'hyujon' | 'overworld';
  room?: string;
  spawnAt?: string;
}

/** What the title screen needs to describe a slot, without building a Player. */
export interface SlotSummary {
  tamerName: string;
  shards: number;
  houseId: string | null;
  tournamentPoints: number;
  battlesWon: number;
  savedAt?: number;
  partyNames?: string[];
}

export interface GuildPerks {
  elementMastery: number; // 1-10
  itemDiscount: number;   // 0-5
  crawlerDiscount: number;// 0-5
  monoSynergy: number;    // 0-5
  rainbowSynergy: number; // 0-5
  tacticalSynergy: number;// 0-5
}

export interface TrophyEarned {
  id: string;
  tierId: string;
  tierName: string;
  day: number;
  dateStr: string;
  finalOpponentName: string;
  finalOpponentSub: string;
  finalOpponentColor: string;
  finalOpponentSpeciesIds: string[];
  playerParty: {
    speciesId: string;
    nickname: string;
    level: number;
  }[];
}

/** Per-save tournament career: what you've entered, won, and who you've beaten. */
export interface TournamentProgress {
  /** Event the player has registered for (null = none); fires on `registeredDay`. */
  registeredEventId: string | null;
  registeredDay: number;
  /** Last calendar day we flashed a "sign-ups open" alert — keeps toasts from repeating. */
  signupSeenDay: number;
  /** tierId → championships won, and → times entered. */
  wins: Record<string, number>;
  entries: Record<string, number>;
  /** Titles earned, e.g. "Haven Ringnight Champion". */
  titles: string[];
  /** tierId → best placement reached (1 = champion, 2 = finalist, …). */
  bestPlacement: Record<string, number>;
  /** World Championships lifted at the Worldring. */
  worldTitles: number;
  /** Known-Name champions the player has beaten in a sanctioned bracket. */
  defeated: string[];
  /** Active predictions for the current tournament bracket: matchupKey -> predictedWinnerId */
  predictions: Record<string, string> | null;
  trophies: TrophyEarned[];
  tournamentMatchesWon: number;
  tournamentMatchesLost: number;
  currentStreak: number;
  bestStreak: number;
}

export function defaultTournamentProgress(): TournamentProgress {
  return {
    registeredEventId: null, registeredDay: -1, signupSeenDay: -1,
    wins: {}, entries: {}, titles: [], bestPlacement: {}, worldTitles: 0, defeated: [],
    predictions: null,
    trophies: [],
    tournamentMatchesWon: 0,
    tournamentMatchesLost: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export interface PlayerSave {
  tamerName: string; shards: number;
  calendarDay?: number;
  tournament?: TournamentProgress;
  party: GuardianSave[]; reserve: GuardianSave[];
  inventory: Record<string, number>;
  crawler: CrawlerSaveData;
  flags: Record<string, boolean>;
  dawnAlignment?: number;
  stillwaterAlignment?: number;
  rootlessAlignment?: number;
  crownlessAlignment?: number;
  houseId: string | null;
  battlesWon: number; capturesMade: number; dungeonClears: Record<string, number>;
  tournamentPoints?: number;
  savedAt?: number;
  profilePic?: string | null;
  cardNo?: string;
  quests?: Record<string, 'active' | 'done'>;
  equippedClothes?: Record<string, string>;
  ownedClothes?: string[];
  appearance?: Appearance;
  fishing?: FishingState;
  guildPoints?: number;
  guildPerks?: GuildPerks;
  guildQuestProgress?: Record<string, number>;
  guildQuestClaims?: Record<string, number>;
  savedLocation?: SavedLocation;
  mmrState?: MMRState;
  charms?: Record<string, number>;
  eggs?: EggData[];
  bounties?: BountyState | null;
}

/** Level a freshly-hatched egg starts at. */
export const EGG_HATCH_LEVEL = 5;

/** An unhatched egg from the Hatchery. Ticks down by field steps, then hatches
 *  into a level-EGG_HATCH_LEVEL Guardian carrying its inherited genes/moves. */
export interface EggData {
  id: string;
  speciesId: string;         // base natural form it hatches into
  label: string;             // display name ("Cindcub Egg")
  stepsLeft: number;
  totalSteps: number;
  genes: Stats;              // inherited gene set
  natureId: string;          // inherited nature
  eggMoves: string[];        // inherited technique ids
  charm?: string;            // a charm that hatches alongside it (rare)
  nickname?: string;
  parents?: { parentA: ParentSnapshot; parentB: ParentSnapshot };
}

/** One active Bounty Board objective (daily / weekly / elite). */
export interface BountyEntry {
  id: string;
  kind: string;              // see bounties.ts BOUNTY_KINDS
  param?: string;            // element/type/dungeon/etc. filter
  title: string;
  desc: string;
  icon: string;
  target: number;
  progress: number;
  tier: 'daily' | 'weekly' | 'elite';
  rewardShards: number;
  rewardGP: number;
  rewardItems?: { id: string; qty: number }[];
  rewardCharm?: string;
  claimed: boolean;
  expiresDay: number;
}
/** Persisted Bounty Board state (rolled per calendar day / week). */
export interface BountyState {
  dailyDay: number;          // calendarDay the daily set was last rolled
  weeklyWeek: number;        // week index the weekly was last rolled
  eliteDay: number;          // calendarDay the elite was last rolled
  list: BountyEntry[];
  streak: number;            // consecutive days with ≥1 daily claimed
  lastStreakDay: number;     // calendarDay the streak last advanced
  completedTotal: number;    // lifetime claimed bounties
}

export class Player {
  static activeInstance: Player | null = null;

  inDungeon = false;
  private _savedLocation?: SavedLocation;
  get savedLocation(): SavedLocation | undefined {
    return this._savedLocation;
  }
  set savedLocation(val: SavedLocation | undefined) {
    const prev = this._savedLocation;
    this._savedLocation = val;
    if (val) {
      this.recordLocationVisit(prev, val);
    }
  }

  private recordLocationVisit(prev: SavedLocation | undefined, val: SavedLocation): void {
    let isNewVisit = false;
    if (!prev) {
      isNewVisit = true;
    } else if (prev.type !== val.type) {
      isNewVisit = true;
    } else if (val.room && (!prev.room || prev.room !== val.room)) {
      isNewVisit = true;
    }
    if (isNewVisit) {
      recordVisit(this);
    }
  }

  mmrState: MMRState | null = null;

  tamerName = 'Tamer';
  shards = 0;
  party: Guardian[] = [];       // up to 3 active
  reserve: Guardian[] = [];     // benched guardians
  inventory = new Map<string, number>();
  crawler = new Crawler();
  flags: Record<string, boolean> = {};
  dawnAlignment = 0;
  stillwaterAlignment = 0;
  rootlessAlignment = 0;
  crownlessAlignment = 0;
  houseId: string | null = null;
  battlesWon = 0;
  capturesMade = 0;
  dungeonClears: Record<string, number> = {};
  /** Rank currency — earned ONLY by placing in sanctioned tournaments. */
  tournamentPoints = 0;
  /** Days elapsed since the campaign began — the Calendar's date counter (0 = Monday). */
  calendarDay = 0;
  /** Tournament career: registrations, titles, who you've beaten. */
  tournament: TournamentProgress = defaultTournamentProgress();
  profilePic: string | null = null;   // custom portrait (data URL)
  cardNo = '';                        // guild member number, assigned on joining
  quests: Record<string, 'active' | 'done'> = {};
  equippedClothes: Record<string, string> = {
    hat: 'default_cap',
    shirt: 'default_shirt',
    pants: 'default_pants',
    gloves: 'default_gloves',
    backpack: 'default_backpack',
    shoes: 'default_shoes'
  };
  ownedClothes: string[] = ['default_cap', 'default_shirt', 'default_pants', 'default_gloves', 'default_backpack', 'default_shoes'];
  appearance: Appearance = { ...DEFAULT_APPEARANCE };
  /** Fishing Expansion — progression, gear, encyclopedia, leaderboard standing. */
  fishing: FishingState = defaultFishingState();

  guildPoints = 0;
  guildPerks: GuildPerks = {
    elementMastery: 1,
    itemDiscount: 0,
    crawlerDiscount: 0,
    monoSynergy: 0,
    rainbowSynergy: 0,
    tacticalSynergy: 0,
  };
  guildQuestProgress: Record<string, number> = {};
  /** How many times each guild quest has been claimed (one-time gating + repeatable counts). */
  guildQuestClaims: Record<string, number> = {};

  /** Owned held-charm counts (charmId → quantity). Equipping reserves from this pool. */
  charms: Record<string, number> = {};
  /** Unhatched eggs from the Hatchery — tick down by field steps, then hatch. */
  eggs: EggData[] = [];
  /** Bounty Board state (rolled lazily by bounties.ts; null until first visit). */
  bounties: BountyState | null = null;

  constructor() {
    Player.activeInstance = this;
  }

  /** Award Guild Points. Central GP faucet used across the game. Pass silent
   *  for high-frequency sources (per-battle/capture) so toasts don't spam. */
  awardGuildPoints(amount: number, reason?: string, silent = false): void {
    if (amount <= 0) return;
    this.guildPoints = (this.guildPoints ?? 0) + amount;
    if (silent) return;
    try {
      // global hook avoids a static state<->ui import cycle at module load
      const ui = (window as any).__azToast as ((m: string, c?: string, d?: number) => void) | undefined;
      if (ui) ui(`🛡️ +${amount} Guild Points${reason ? ` — ${reason}` : ''}`, 'gold', 2600);
    } catch { /* toast is best-effort */ }
  }

  get alive(): Guardian[] { return this.party.filter(g => !g.fainted); }

  addItem(id: string, qty = 1): boolean {
    const cur = this.inventory.get(id) ?? 0;
    if (cur === 0 && this.inventory.size >= this.crawler.cargoMax) return false;
    this.inventory.set(id, cur + qty);
    return true;
  }
  removeItem(id: string, qty = 1): void {
    const cur = this.inventory.get(id) ?? 0;
    if (cur <= qty) this.inventory.delete(id); else this.inventory.set(id, cur - qty);
  }
  itemCount(id: string): number { return this.inventory.get(id) ?? 0; }

  addGuardian(g: Guardian): 'party' | 'reserve' {
    if (this.party.length < 3) { this.party.push(g); return 'party'; }
    this.reserve.push(g);
    return 'reserve';
  }

  /** Remove academy loaner guardians after the exam. */
  clearTempGuardians(): void {
    this.party = this.party.filter(g => !g.isTemp);
    this.reserve = this.reserve.filter(g => !g.isTemp);
  }

  healAll(): void {
    [...this.party, ...this.reserve].forEach(g => g.healFull());
    this.crawler.restock();
  }

  // ---------------- Held charms ----------------
  addCharm(id: string, n = 1): void { this.charms[id] = (this.charms[id] ?? 0) + n; }
  charmCount(id: string): number { return this.charms[id] ?? 0; }
  /** How many of this charm are currently equipped across party + reserve. */
  equippedCharmCount(id: string): number {
    return [...this.party, ...this.reserve].filter(g => g.heldCharm === id).length;
  }
  /** Unequipped copies of a charm available to assign. */
  availableCharm(id: string): number { return this.charmCount(id) - this.equippedCharmCount(id); }
  /** Equip a charm onto a Guardian if a free copy is owned. Returns success. */
  equipCharm(g: Guardian, id: string): boolean {
    if (g.heldCharm === id) return true;
    if (this.availableCharm(id) <= 0) return false;
    g.heldCharm = id;
    return true;
  }
  unequipCharm(g: Guardian): void { g.heldCharm = undefined; }
  /** Total charm copies owned across all charm ids (for UI counts). */
  totalCharmsOwned(): number { return Object.values(this.charms).reduce((a, b) => a + b, 0); }

  // ---------------- Training (effort) ----------------
  trainingTotal(g: Guardian): number {
    const t = g.training; return t.hp + t.sp + t.atk + t.def + t.spd + t.wis;
  }
  /** Add training to one stat, clamped to per-stat (252) and total (510) caps. Returns points actually added. */
  addTraining(g: Guardian, stat: StatKey, amount: number): number {
    const cur = g.training[stat] ?? 0;
    const perRoom = TRAIN_PER_STAT_MAX - cur;
    const totalRoom = TRAIN_TOTAL_MAX - this.trainingTotal(g);
    const add = Math.max(0, Math.min(amount, perRoom, totalRoom));
    g.training[stat] = cur + add;
    if (add > 0) { g.hp = Math.min(g.hp, g.stats.hp); g.sp = Math.min(g.sp, g.stats.sp); }
    return add;
  }
  resetTraining(g: Guardian): void { g.training = emptyStats(); g.hp = Math.min(g.hp, g.stats.hp); }

  // ---------------- Eggs / Hatchery ----------------
  /** Advance every egg by `steps` field-steps; returns the ones that just hit 0. */
  tickEggs(steps = 1): EggData[] {
    const hatched: EggData[] = [];
    for (const e of this.eggs) {
      if (e.stepsLeft <= 0) continue;
      e.stepsLeft = Math.max(0, e.stepsLeft - steps);
      if (e.stepsLeft === 0) hatched.push(e);
    }
    return hatched;
  }
  /** Turn a (ready) egg into a Guardian, carry over genes/nature/egg-moves, and remove it. */
  hatchEgg(e: EggData): Guardian {
    const g = new Guardian(e.speciesId, EGG_HATCH_LEVEL, e.nickname);
    g.genes = { ...e.genes };
    g.natureId = e.natureId || g.natureId;
    g.training = emptyStats();
    for (const tid of e.eggMoves) {
      if (TECHS[tid] && !g.learnedTechs.includes(tid)) g.learnedTechs.push(tid);
    }
    if (e.parents) g.parents = JSON.parse(JSON.stringify(e.parents));
    g.healFull();
    if (e.charm) this.addCharm(e.charm);
    this.eggs = this.eggs.filter(x => x.id !== e.id);
    this.addGuardian(g);
    return g;
  }
  /** Gene-perfection % of a Guardian (0–100) — convenience for UIs. */
  geneRatingOf(g: Guardian): number { return geneRating(g.genes); }

  save(isAutosave = true): void {
    if (this.inDungeon) return; // Cannot save inside a dungeon

    if (isAutosave) {
      if (localStorage.getItem('autosaveMode') === 'false') {
        return;
      }
      const el = document.getElementById('autosave-indicator');
      if (el) {
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 1500);
      }
    }

    const data: PlayerSave = {
      tamerName: this.tamerName, shards: this.shards,
      party: this.party.map(g => g.save()), reserve: this.reserve.map(g => g.save()),
      inventory: Object.fromEntries(this.inventory),
      crawler: this.crawler.save(), flags: { ...this.flags },
      dawnAlignment: this.dawnAlignment,
      stillwaterAlignment: this.stillwaterAlignment,
      rootlessAlignment: this.rootlessAlignment,
      crownlessAlignment: this.crownlessAlignment,
      houseId: this.houseId, battlesWon: this.battlesWon,
      capturesMade: this.capturesMade, dungeonClears: { ...this.dungeonClears },
      tournamentPoints: this.tournamentPoints,
      calendarDay: this.calendarDay,
      tournament: JSON.parse(JSON.stringify(this.tournament)),
      savedAt: Date.now(),
      profilePic: this.profilePic, cardNo: this.cardNo, quests: { ...this.quests },
      equippedClothes: { ...this.equippedClothes },
      ownedClothes: [...this.ownedClothes],
      appearance: { ...this.appearance },
      fishing: this.fishing,
      guildPoints: this.guildPoints,
      guildPerks: { ...this.guildPerks },
      guildQuestProgress: { ...this.guildQuestProgress },
      guildQuestClaims: { ...this.guildQuestClaims },
      savedLocation: this.savedLocation,
      mmrState: this.mmrState ? JSON.parse(JSON.stringify(this.mmrState)) : undefined,
      charms: { ...this.charms },
      eggs: JSON.parse(JSON.stringify(this.eggs)),
      bounties: this.bounties ? JSON.parse(JSON.stringify(this.bounties)) : null,
    };
    localStorage.setItem(slotKey(activeSlot), JSON.stringify(data));
  }

  /** All subsequent saves/loads target this slot. */
  static setSlot(slot: number): void { activeSlot = Math.max(1, Math.min(SAVE_SLOTS, slot)); }
  static get slot(): number { return activeSlot; }

  static hasSave(slot = activeSlot): boolean { return localStorage.getItem(slotKey(slot)) !== null; }
  static deleteSave(slot = activeSlot): void { localStorage.removeItem(slotKey(slot)); }
  static duplicateSave(srcSlot: number, destSlot: number): void {
    const raw = localStorage.getItem(slotKey(srcSlot));
    if (raw) {
      localStorage.setItem(slotKey(destSlot), raw);
    } else {
      localStorage.removeItem(slotKey(destSlot));
    }
  }

  /** Lightweight peek at a slot for the title screen. */
  static slotSummary(slot: number): SlotSummary | null {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    try {
      const d: PlayerSave = JSON.parse(raw);
      const partyNames = d.party?.map(g => {
        const name = SPECIES[g.speciesId]?.name || g.nickname;
        return `${name} Lvl ${g.level}`;
      }) ?? [];

      return {
        tamerName: d.tamerName ?? 'Tamer', shards: d.shards ?? 0,
        houseId: d.houseId ?? null, tournamentPoints: d.tournamentPoints ?? 0,
        battlesWon: d.battlesWon ?? 0, savedAt: d.savedAt,
        partyNames,
      };
    } catch {
      return null;
    }
  }

  static load(slot = activeSlot): Player | null {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    try {
      const d: PlayerSave = JSON.parse(raw);
      const p = new Player();
      p.tamerName = d.tamerName; p.shards = d.shards;
      p.party = d.party.map(Guardian.load); p.reserve = d.reserve.map(Guardian.load);
      p.inventory = new Map(Object.entries(d.inventory));
      p.crawler = Crawler.load(d.crawler);
      p.flags = { ...d.flags }; p.houseId = d.houseId;
      p.dawnAlignment = d.dawnAlignment ?? 0;
      p.stillwaterAlignment = d.stillwaterAlignment ?? 0;
      p.rootlessAlignment = d.rootlessAlignment ?? 0;
      p.crownlessAlignment = d.crownlessAlignment ?? 0;
      p.battlesWon = d.battlesWon ?? 0; p.capturesMade = d.capturesMade ?? 0;
      p.dungeonClears = d.dungeonClears ?? {};
      p.tournamentPoints = d.tournamentPoints ?? 0;
      p.calendarDay = d.calendarDay ?? 0;
      p.tournament = d.tournament
        ? { ...defaultTournamentProgress(), ...d.tournament }
        : defaultTournamentProgress();
      p.tournament.trophies = p.tournament.trophies || [];
      p.tournament.tournamentMatchesWon = p.tournament.tournamentMatchesWon ?? 0;
      p.tournament.tournamentMatchesLost = p.tournament.tournamentMatchesLost ?? 0;
      p.tournament.currentStreak = p.tournament.currentStreak ?? 0;
      p.tournament.bestStreak = p.tournament.bestStreak ?? 0;
      p.profilePic = d.profilePic ?? null;
      p.cardNo = d.cardNo ?? '';
      p.quests = d.quests ?? {};
      p.equippedClothes = d.equippedClothes ? { ...d.equippedClothes } : {
        hat: 'default_cap',
        shirt: 'default_shirt',
        pants: 'default_pants',
        gloves: 'default_gloves',
        backpack: 'default_backpack',
        shoes: 'default_shoes'
      };
      p.ownedClothes = d.ownedClothes ? [...d.ownedClothes] : ['default_cap', 'default_shirt', 'default_pants', 'default_gloves', 'default_backpack', 'default_shoes'];
      p.appearance = d.appearance ? { ...DEFAULT_APPEARANCE, ...d.appearance } : { ...DEFAULT_APPEARANCE };
      p.fishing = normalizeFishingState(d.fishing);
      p.guildPoints = d.guildPoints ?? 0;
      p.guildPerks = d.guildPerks ? {
        elementMastery: d.guildPerks.elementMastery ?? 1,
        itemDiscount: d.guildPerks.itemDiscount ?? 0,
        crawlerDiscount: d.guildPerks.crawlerDiscount ?? 0,
        monoSynergy: d.guildPerks.monoSynergy ?? 0,
        rainbowSynergy: d.guildPerks.rainbowSynergy ?? 0,
        tacticalSynergy: d.guildPerks.tacticalSynergy ?? 0,
      } : {
        elementMastery: 1,
        itemDiscount: 0,
        crawlerDiscount: 0,
        monoSynergy: 0,
        rainbowSynergy: 0,
        tacticalSynergy: 0,
      };
      p.guildQuestProgress = d.guildQuestProgress ? { ...d.guildQuestProgress } : {};
      p.guildQuestClaims = d.guildQuestClaims ? { ...d.guildQuestClaims } : {};
      p.savedLocation = d.savedLocation;
      p.mmrState = d.mmrState ? JSON.parse(JSON.stringify(d.mmrState)) : null;
      p.charms = d.charms ? { ...d.charms } : {};
      p.eggs = d.eggs ? JSON.parse(JSON.stringify(d.eggs)) : [];
      p.bounties = d.bounties ?? null;

      // Retroactive stat adjustment for existing starter Guardians
      if (!p.flags['starter_stats_migrated_v2']) {
        const migrate = (g: Guardian) => {
          if (g.isStarter) {
            const sDef = g.species;
            const l = g.level - 1;
            const oldMult = 1.35;
            const oldMaxHp = Math.floor((sDef.base.hp + sDef.growth.hp * l + g.bonus.hp) * oldMult);
            const oldMaxSp = Math.floor((sDef.base.sp + sDef.growth.sp * l + g.bonus.sp) * oldMult);
            if (oldMaxHp > 0) g.hp = Math.min(g.stats.hp, Math.ceil((g.hp / oldMaxHp) * g.stats.hp));
            if (oldMaxSp > 0) g.sp = Math.min(g.stats.sp, Math.ceil((g.sp / oldMaxSp) * g.stats.sp));
          }
        };
        p.party.forEach(migrate);
        p.reserve.forEach(migrate);
        p.flags['starter_stats_migrated_v2'] = true;
        p.save(false); // save manually to bypass auto-save setting
      }

      Player.activeInstance = p;
      return p;
    } catch {
      return null;
    }
  }
}
