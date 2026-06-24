// ============================================================
// AZ Tamer — Bounty Board: procedural daily / weekly / elite
// objectives that roll over on the campaign calendar. Progress is
// fed by gameplay events (battle wins, captures, dungeon clears,
// cooking, fishing) and pays out Shards, Guild Points, items and
// — the real draw — held charms, up to ultra-grade on elite work.
// ============================================================
import {
  ELEMENTS, ELEMENT_ICONS, type Element,
  CHARMS, CHARM_SHOP, mulberry32, hashStr,
} from './data';
import type { Player, BountyEntry } from './state';

/** Event kinds gameplay fires into recordBountyEvent. */
export type BountyEventKind = 'battleWin' | 'capture' | 'dungeonClear' | 'cook' | 'fish';
export interface BountyEventPayload {
  elements?: Element[];   // elements present (defeated foes / captured guardian)
  types?: string[];       // GTypes present
  boss?: boolean;         // the win was a boss/warden fight
  fast?: boolean;         // the win finished in ≤4 rounds
}

const BOUNTY_TYPES = ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost'];

/** Charm pools by grade for reward rolls. */
const CHEAP_CHARMS = CHARM_SHOP.filter(id => CHARMS[id].rarity === 'uncommon');
const MID_CHARMS = CHARM_SHOP.filter(id => CHARMS[id].rarity === 'rare');
const TOP_CHARMS = CHARM_SHOP.filter(id => CHARMS[id].rarity === 'epic' || CHARMS[id].rarity === 'legendary');
const ULTRA_CHARMS = Object.keys(CHARMS).filter(id => CHARMS[id].rarity === 'ultra');

const pick = <T>(arr: T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)];
const ri = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

interface RolledReward { shards: number; gp: number; items?: { id: string; qty: number }[]; charm?: string; }
function rollReward(tier: 'daily' | 'weekly' | 'elite', rnd: () => number): RolledReward {
  if (tier === 'daily') {
    const r: RolledReward = { shards: ri(rnd, 150, 400), gp: ri(rnd, 8, 20) };
    if (rnd() < 0.22 && CHEAP_CHARMS.length) r.charm = pick(CHEAP_CHARMS, rnd);
    else if (rnd() < 0.4) r.items = [{ id: pick(['tonic_plus', 'soda_plus', 'cell_plus', 'revive_leaf'], rnd), qty: 2 }];
    return r;
  }
  if (tier === 'weekly') {
    const r: RolledReward = { shards: ri(rnd, 600, 1200), gp: ri(rnd, 30, 50) };
    if (rnd() < 0.6) r.charm = pick(rnd() < 0.5 ? MID_CHARMS : TOP_CHARMS, rnd);
    else r.items = [{ id: pick(['atk_gem', 'def_gem', 'spd_gem', 'wis_gem', 'hp_gem', 'prism_gem'], rnd), qty: 1 }];
    return r;
  }
  // elite — always a charm, often ultra
  const r: RolledReward = { shards: ri(rnd, 1500, 3200), gp: ri(rnd, 60, 100) };
  r.charm = (rnd() < 0.5 && ULTRA_CHARMS.length) ? pick(ULTRA_CHARMS, rnd) : pick(TOP_CHARMS.length ? TOP_CHARMS : MID_CHARMS, rnd);
  if (rnd() < 0.5) r.items = [{ id: 'fish_legend', qty: 1 }];
  return r;
}

interface KindSpec { kind: string; param?: string; title: string; desc: string; icon: string; target: number; }
function buildKind(tier: 'daily' | 'weekly' | 'elite', rnd: () => number): KindSpec {
  const scale = tier === 'daily' ? 1 : tier === 'weekly' ? 5 : 10;
  const pool = tier === 'daily'
    ? ['winBattles', 'winElement', 'winType', 'capture', 'captureElement']
    : tier === 'weekly'
      ? ['winBattles', 'winElement', 'clearDungeon', 'capture', 'beatBoss']
      : ['winBattles', 'beatBoss', 'clearDungeon', 'captureElement', 'winType', 'winFast'];
  const kind = pick(pool, rnd);
  switch (kind) {
    case 'winElement': {
      const el = pick(ELEMENTS.filter(e => e !== 'Aether'), rnd);
      const n = ri(rnd, 2, 4) * scale;
      return { kind, param: el, target: n, icon: ELEMENT_ICONS[el] ?? '⚔️', title: `Slay ${el} Guardians`, desc: `Defeat ${n} ${el}-element Guardians in battle.` };
    }
    case 'captureElement': {
      const el = pick(ELEMENTS.filter(e => e !== 'Aether'), rnd);
      const n = tier === 'elite' ? ri(rnd, 4, 7) : ri(rnd, 1, 2);
      return { kind, param: el, target: n, icon: ELEMENT_ICONS[el] ?? '💜', title: `Befriend ${el} Guardians`, desc: `Befriend ${n} wild ${el}-element Guardian${n > 1 ? 's' : ''}.` };
    }
    case 'winType': {
      const t = pick(BOUNTY_TYPES, rnd);
      const n = ri(rnd, 2, 4) * scale;
      return { kind, param: t, target: n, icon: '⚔️', title: `Best the ${t} school`, desc: `Defeat ${n} ${t}-type Guardians in battle.` };
    }
    case 'capture': {
      const n = ri(rnd, 1, 2) * (tier === 'daily' ? 1 : scale);
      return { kind, target: n, icon: '💜', title: 'Win hearts', desc: `Befriend ${n} wild Guardian${n > 1 ? 's' : ''}.` };
    }
    case 'beatBoss': {
      const n = tier === 'elite' ? ri(rnd, 2, 3) : 1;
      return { kind, target: n, icon: '👹', title: 'Warden hunt', desc: `Defeat ${n} boss-tier Guardian${n > 1 ? 's' : ''} / warden${n > 1 ? 's' : ''}.` };
    }
    case 'clearDungeon': {
      const n = tier === 'elite' ? ri(rnd, 4, 5) : ri(rnd, 2, 3);
      return { kind, target: n, icon: '🗺️', title: 'Delve deep', desc: `Clear ${n} dungeon run${n > 1 ? 's' : ''}.` };
    }
    case 'cook': {
      const n = ri(rnd, 2, 4);
      return { kind, target: n, icon: '🍳', title: 'Wharf kitchen', desc: `Cook ${n} dishes at the Anglers' Wharf.` };
    }
    case 'fish': {
      const n = ri(rnd, 3, 6) * (tier === 'daily' ? 1 : 2);
      return { kind, target: n, icon: '🎣', title: 'Angler\'s tally', desc: `Land ${n} fish at the Great Pond.` };
    }
    case 'winFast': {
      const n = ri(rnd, 4, 8);
      return { kind, target: n, icon: '⚡', title: 'Blitz champion', desc: `Win ${n} battles in 4 rounds or fewer.` };
    }
    default: { // winBattles
      const n = ri(rnd, 3, 6) * scale;
      return { kind: 'winBattles', target: n, icon: '🏆', title: 'Field work', desc: `Win ${n} battles.` };
    }
  }
}

function makeEntry(tier: 'daily' | 'weekly' | 'elite', seed: string, expiresDay: number): BountyEntry {
  const rnd = mulberry32(hashStr(seed));
  const spec = buildKind(tier, rnd);
  const rw = rollReward(tier, rnd);
  return {
    id: seed,
    kind: spec.kind, param: spec.param,
    title: spec.title, desc: spec.desc, icon: spec.icon,
    target: spec.target, progress: 0, tier,
    rewardShards: rw.shards, rewardGP: rw.gp,
    rewardItems: rw.items, rewardCharm: rw.charm,
    claimed: false, expiresDay,
  };
}

/** Roll/refresh the board for the player's current calendar day (idempotent within a period). */
export function ensureBounties(p: Player): void {
  const day = p.calendarDay ?? 0;
  const week = Math.floor(day / 7);
  const eliteKey = Math.floor(day / 3);
  if (!p.bounties) {
    p.bounties = { dailyDay: -1, weeklyWeek: -1, eliteDay: -1, list: [], streak: 0, lastStreakDay: -1, completedTotal: 0 };
  }
  const b = p.bounties;
  if (b.dailyDay !== day) {
    b.list = b.list.filter(x => x.tier !== 'daily');
    for (let i = 0; i < 3; i++) b.list.push(makeEntry('daily', `daily:${day}:${i}`, day + 1));
    b.dailyDay = day;
    // streak lapses if a full day passed with nothing claimed
    if (b.lastStreakDay >= 0 && day - b.lastStreakDay > 1) b.streak = 0;
  }
  if (b.weeklyWeek !== week) {
    b.list = b.list.filter(x => x.tier !== 'weekly');
    b.list.push(makeEntry('weekly', `weekly:${week}`, (week + 1) * 7));
    b.weeklyWeek = week;
  }
  if (b.eliteDay !== eliteKey) {
    b.list = b.list.filter(x => x.tier !== 'elite');
    b.list.push(makeEntry('elite', `elite:${eliteKey}`, (eliteKey + 1) * 3));
    b.eliteDay = eliteKey;
  }
}

/** Feed a gameplay event into every matching active bounty. */
export function recordBountyEvent(p: Player, kind: BountyEventKind, payload: BountyEventPayload = {}): void {
  ensureBounties(p);
  const b = p.bounties;
  if (!b) return;
  for (const e of b.list) {
    if (e.claimed || e.progress >= e.target) continue;
    let inc = 0;
    switch (e.kind) {
      case 'winBattles': if (kind === 'battleWin') inc = 1; break;
      case 'winFast': if (kind === 'battleWin' && payload.fast) inc = 1; break;
      case 'beatBoss': if (kind === 'battleWin' && payload.boss) inc = 1; break;
      case 'winElement': if (kind === 'battleWin' && e.param && payload.elements?.includes(e.param as Element)) inc = 1; break;
      case 'winType': if (kind === 'battleWin' && e.param && payload.types?.includes(e.param)) inc = 1; break;
      case 'capture': if (kind === 'capture') inc = 1; break;
      case 'captureElement': if (kind === 'capture' && e.param && payload.elements?.includes(e.param as Element)) inc = 1; break;
      case 'clearDungeon': if (kind === 'dungeonClear') inc = 1; break;
      case 'cook': if (kind === 'cook') inc = 1; break;
      case 'fish': if (kind === 'fish') inc = 1; break;
    }
    if (inc) e.progress = Math.min(e.target, e.progress + inc);
  }
}

export interface ClaimResult { entry: BountyEntry; streakBonus: number; }
/** Claim a completed bounty: grant rewards, advance the daily streak. Returns null if not claimable. */
export function claimBounty(p: Player, id: string): ClaimResult | null {
  ensureBounties(p);
  const b = p.bounties;
  if (!b) return null;
  const e = b.list.find(x => x.id === id);
  if (!e || e.claimed || e.progress < e.target) return null;
  e.claimed = true;
  b.completedTotal++;
  let streakBonus = 0;
  if (e.tier === 'daily') {
    const day = p.calendarDay ?? 0;
    if (b.lastStreakDay !== day) {
      b.streak = (b.lastStreakDay >= 0 && day - b.lastStreakDay === 1) ? b.streak + 1 : 1;
      b.lastStreakDay = day;
    }
    streakBonus = Math.min(500, b.streak * 40);
  }
  p.shards += e.rewardShards + streakBonus;
  if (e.rewardGP) p.awardGuildPoints(e.rewardGP, 'bounty', true);
  if (e.rewardItems) for (const it of e.rewardItems) p.addItem(it.id, it.qty);
  if (e.rewardCharm) p.addCharm(e.rewardCharm);
  return { entry: e, streakBonus };
}

/** Count of claimable (completed, unclaimed) bounties — for the board badge. */
export function claimableCount(p: Player): number {
  if (!p.bounties) return 0;
  return p.bounties.list.filter(e => !e.claimed && e.progress >= e.target).length;
}
