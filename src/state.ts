// ============================================================
// AZ Tamer — runtime state: Guardian instances, Crawler, player
// ============================================================
import {
  SPECIES, TECHS, ITEMS, CRAWLER_PARTS, expForLevel,
  type SpeciesDef, type Stats, type StatKey, type Technique, type CrawlerPart,
} from './data';

let uidCounter = 1;
export const uid = () => `g${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

// ---------------- Guardian ----------------
export interface GuardianSave {
  id: string; speciesId: string; nickname: string;
  level: number; exp: number; bonus: Stats;
  hp: number; sp: number; isTemp?: boolean;
  levelCap?: number;
  techPoints?: number;
  learnedTechs?: string[];
  isStarter?: boolean;
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
    const mult = this.isStarter ? 1.35 : 1.0;
    const calc = (k: StatKey) => Math.floor((s.base[k] + s.growth[k] * l + this.bonus[k]) * mult);
    return { hp: calc('hp'), sp: calc('sp'), atk: calc('atk'), def: calc('def'), spd: calc('spd'), wis: calc('wis') };
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
    return g;
  }
}

// ---------------- Crawler ----------------
export interface CrawlerSaveData {
  parts: Record<CrawlerPart['slot'], string>;
  hull: number; energy: number; owned: string[];
}

export class Crawler {
  parts: Record<CrawlerPart['slot'], string> = {
    hull: 'hull1', engine: 'engine1', cargo: 'cargo1', cannon: 'cannon1', scanner: 'scanner1',
  };
  owned: string[] = ['hull1', 'engine1', 'cargo1', 'cannon1', 'scanner1'];
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
  get firstStrikeChance(): number { return [0, 0, 0.10, 0.25][this.cannonTier] ?? 0; }

  equip(partId: string): void {
    const p = CRAWLER_PARTS[partId];
    if (!p || !this.owned.includes(partId)) return;
    this.parts[p.slot] = partId;
    this.hull = Math.min(this.hull, this.hullMax);
    this.energy = Math.min(this.energy, this.energyMax);
  }

  restock(): void { this.hull = this.hullMax; this.energy = this.energyMax; }

  save(): CrawlerSaveData {
    return { parts: { ...this.parts }, hull: this.hull, energy: this.energy, owned: [...this.owned] };
  }
  static load(d: CrawlerSaveData): Crawler {
    const c = new Crawler();
    c.parts = { ...d.parts }; c.owned = [...d.owned];
    c.hull = d.hull; c.energy = d.energy;
    return c;
  }
}

// ---------------- Player / GameState ----------------
const SAVE_KEY = 'az-tamer-save-v1';

export interface PlayerSave {
  tamerName: string; shards: number;
  party: GuardianSave[]; reserve: GuardianSave[];
  inventory: Record<string, number>;
  crawler: CrawlerSaveData;
  flags: Record<string, boolean>;
  houseId: string | null;
  battlesWon: number; capturesMade: number; dungeonClears: Record<string, number>;
  profilePic?: string | null;
  cardNo?: string;
  quests?: Record<string, 'active' | 'done'>;
}

export class Player {
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
  profilePic: string | null = null;   // custom portrait (data URL)
  cardNo = '';                        // guild member number, assigned on joining
  quests: Record<string, 'active' | 'done'> = {};

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

  save(): void {
    const data: PlayerSave = {
      tamerName: this.tamerName, shards: this.shards,
      party: this.party.map(g => g.save()), reserve: this.reserve.map(g => g.save()),
      inventory: Object.fromEntries(this.inventory),
      crawler: this.crawler.save(), flags: { ...this.flags },
      houseId: this.houseId, battlesWon: this.battlesWon,
      capturesMade: this.capturesMade, dungeonClears: { ...this.dungeonClears },
      profilePic: this.profilePic, cardNo: this.cardNo, quests: { ...this.quests },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  static hasSave(): boolean { return localStorage.getItem(SAVE_KEY) !== null; }
  static deleteSave(): void { localStorage.removeItem(SAVE_KEY); }

  static load(): Player | null {
    const raw = localStorage.getItem(SAVE_KEY);
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
      p.profilePic = d.profilePic ?? null;
      p.cardNo = d.cardNo ?? '';
      p.quests = d.quests ?? {};
      return p;
    } catch {
      return null;
    }
  }
}
