// ============================================================
// AZ Tamer — runtime state: Guardian instances, Crawler, player
// ============================================================
import {
  SPECIES, TECHS, ITEMS, CRAWLER_PARTS, expForLevel,
  type SpeciesDef, type Stats, type StatKey, type Technique, type CrawlerPart,
  HOUSES, TYPE_ELEMENT, elementsOf,
} from './data';
import { DEFAULT_APPEARANCE, type Appearance } from './models';
import { defaultFishingState, normalizeFishingState, type FishingState } from './fishingdata';

let uidCounter = 1;
export const uid = () => `g${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

// ---------------- Guardian ----------------
export interface GuardianCustomization {
  colors?: { primary?: number; secondary?: number; accent?: number };
  partsScale?: { head?: number; tail?: number; wings?: number };
  replacedParts?: { tail?: string; wings?: string };
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

  constructor(speciesId: string, level = 1, nickname?: string) {
    this.id = uid();
    this.speciesId = speciesId;
    this.nickname = nickname ?? SPECIES[speciesId].name;
    this.level = level;
    this.exp = expForLevel(level);
    this.bonus = { hp: 0, sp: 0, atk: 0, def: 0, spd: 0, wis: 0 };
    
    // Default starting techniques
    this.learnedTechs = this.species.techs
      .filter(t => t.level <= this.level)
      .map(t => t.tech)
      .slice(-4);
    
    this.techPoints = Math.floor(this.level / 5);

    this.hp = this.stats.hp;
    this.sp = this.stats.sp;
  }

  get species(): SpeciesDef { return SPECIES[this.speciesId]; }

  get stats(): Stats {
    const s = this.species;
    const l = this.level - 1;
    const mult = this.isStarter ? 2.025 : 1.0;
    const calc = (k: StatKey) => Math.floor((s.base[k] + s.growth[k] * l + this.bonus[k]) * mult);
    const baseStats = { hp: calc('hp'), sp: calc('sp'), atk: calc('atk'), def: calc('def'), spd: calc('spd'), wis: calc('wis') };

    // Apply Guild Perk stat boost if element matches active guild element
    if (Player.activeInstance && Player.activeInstance.houseId) {
      const house = HOUSES.find(h => h.id === Player.activeInstance!.houseId);
      if (house) {
        const guildEl = TYPE_ELEMENT[house.type];
        if (elementsOf(this.speciesId).includes(guildEl)) {
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
    return baseStats;
  }

  get techniques(): Technique[] {
    if (!this.learnedTechs || this.learnedTechs.length === 0) {
      this.learnedTechs = this.species.techs
        .filter(t => t.level <= this.level)
        .map(t => t.tech)
        .slice(-4);
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
    if (this.species.stage === 'Adept') {
      this.levelCap = Math.max(this.levelCap, 24);
    } else if (this.species.stage === 'Elite') {
      this.levelCap = Math.max(this.levelCap, 32);
    } else if (this.species.stage === 'Apex') {
      this.levelCap = Math.max(this.levelCap, this.species.evolvesTo ? 50 : 99);
    } else if (this.species.stage === 'Legendary' || this.species.stage === 'Aether') {
      this.levelCap = Math.max(this.levelCap, 99);
    }

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

    if (this.species.stage === 'Adept') {
      this.levelCap = Math.max(this.levelCap, 24);
    } else if (this.species.stage === 'Elite') {
      this.levelCap = Math.max(this.levelCap, 32);
    } else if (this.species.stage === 'Apex') {
      this.levelCap = Math.max(this.levelCap, 50);
    } else if (this.species.stage === 'Legendary' || this.species.stage === 'Aether') {
      this.levelCap = Math.max(this.levelCap, 99);
    }

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
  get firstStrikeChance(): number { return [0, 0, 0.10, 0.25, 0.35][this.cannonTier] ?? 0; }
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
  type: 'town' | 'university' | 'terra' | 'agdao' | 'salmonan' | 'overworld';
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

export interface PlayerSave {
  tamerName: string; shards: number;
  party: GuardianSave[]; reserve: GuardianSave[];
  inventory: Record<string, number>;
  crawler: CrawlerSaveData;
  flags: Record<string, boolean>;
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
  savedLocation?: SavedLocation;
}


export class Player {
  static activeInstance: Player | null = null;

  inDungeon = false;
  savedLocation?: SavedLocation;

  tamerName = 'Tamer';
  shards = 0;
  party: Guardian[] = [];       // up to 3 active
  reserve: Guardian[] = [];     // benched guardians
  inventory = new Map<string, number>();
  crawler = new Crawler();
  flags: Record<string, boolean> = {};
  houseId: string | null = null;
  battlesWon = 0;
  capturesMade = 0;
  dungeonClears: Record<string, number> = {};
  /** Rank currency — earned ONLY by placing in sanctioned tournaments. */
  tournamentPoints = 0;
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

  constructor() {
    Player.activeInstance = this;
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
      houseId: this.houseId, battlesWon: this.battlesWon,
      capturesMade: this.capturesMade, dungeonClears: { ...this.dungeonClears },
      tournamentPoints: this.tournamentPoints,
      savedAt: Date.now(),
      profilePic: this.profilePic, cardNo: this.cardNo, quests: { ...this.quests },
      equippedClothes: { ...this.equippedClothes },
      ownedClothes: [...this.ownedClothes],
      appearance: { ...this.appearance },
      fishing: this.fishing,
      guildPoints: this.guildPoints,
      guildPerks: { ...this.guildPerks },
      guildQuestProgress: { ...this.guildQuestProgress },
      savedLocation: this.savedLocation,
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
      p.battlesWon = d.battlesWon ?? 0; p.capturesMade = d.capturesMade ?? 0;
      p.dungeonClears = d.dungeonClears ?? {};
      p.tournamentPoints = d.tournamentPoints ?? 0;
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
      p.savedLocation = d.savedLocation;

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
