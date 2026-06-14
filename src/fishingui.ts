// ============================================================
// AZ Tamer — Fishing Expansion: DOM UI.
//   • the animated, casino-style Catch Score Log
//   • the catch showcase banner + rank announcements
//   • the Fishing Hub: Rod & Bait shops (with live 3D preview),
//     the Kitchen (cook fish → battle items), the Encyclopedia,
//     the living Leaderboard, the Hall of Fame, Titles/Records
//     and Fishing Quests
// by Aljay Leodones
// ============================================================
import * as THREE from 'three';
import { Player } from './state';
import { ITEMS } from './data';
import { openScreen, closeMenu, toast, itemIcon } from './ui';
import { sfx } from './audio';
import { makeRenderer } from './models';
import { makeRod, makeBobber, swimFish, makeFish, disposeFish } from './fishingmodels';
import {
  RARITY, RODS, BAITS, RECIPES, FISH, ALL_FISH, FAMILIES, FISH_ACHIEVEMENTS, FISHING_BOUNTIES,
  RARITY_ORDER, fishingLevelFromExp, fishingExpForLevel, titleForLevel, rankTitle, fmt,
  type ScoreBreakdown, type SpeciesDef, type Rarity, type FamilyId, type FishingState, type RodDef,
} from './fishingdata';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
function el(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const rarityStyle = (r: Rarity): string => {
  const rd = RARITY[r];
  if (rd.rainbow) return `class="rarity-frame rarity-legendary"`;
  return `class="rarity-frame" style="--rc:${rd.color};--rg:${rd.glow}"`;
};
const rarityChip = (r: Rarity): string => {
  const rd = RARITY[r];
  const cls = rd.rainbow ? 'rarity-chip legendary' : 'rarity-chip';
  return `<span class="${cls}" style="--rc:${rd.color}">${rd.badge} ${r}</span>`;
};

// ============================================================
//  CATCH SHOWCASE BANNER (over the 3D showcase)
// ============================================================
let showcaseEl: HTMLElement | null = null;
export function showShowcaseBanner(sp: SpeciesDef, weightKg: number, lengthCm: number): void {
  hideShowcaseBanner();
  const rd = RARITY[sp.rarity];
  const b = el('div', 'fish-showcase');
  b.innerHTML = `
    <div ${rarityStyle(sp.rarity)}>
      <div class="fs-badge">${rd.badge}</div>
      <div class="fs-name">${sp.name}</div>
      <div class="fs-sub">${FAMILIES[sp.family].name} · ${rarityChip(sp.rarity)}</div>
      <div class="fs-stats"><span>⚖️ ${weightKg.toFixed(2)} kg</span><span>📏 ${lengthCm.toFixed(1)} cm</span></div>
    </div>`;
  document.body.appendChild(b);
  showcaseEl = b;
  requestAnimationFrame(() => b.classList.add('show'));
}
export function hideShowcaseBanner(): void {
  if (showcaseEl) { showcaseEl.remove(); showcaseEl = null; }
}

// ============================================================
//  RANK ANNOUNCEMENT
// ============================================================
export function announceRank(message: string, kind: 'gold' | 'rainbow' = 'gold'): Promise<void> {
  return new Promise(res => {
    const a = el('div', `rank-announce ${kind}`);
    a.innerHTML = `<div class="ra-inner">${message}</div>`;
    document.body.appendChild(a);
    sfx('achievement');
    requestAnimationFrame(() => a.classList.add('show'));
    setTimeout(() => {
      a.classList.remove('show');
      setTimeout(() => { a.remove(); res(); }, 500);
    }, 2600);
  });
}

// ============================================================
//  THE ANIMATED SCORE LOG
// ============================================================
export interface CatchSummaryData {
  sp: SpeciesDef;
  weightKg: number; lengthCm: number;
  score: ScoreBreakdown;
  expGain: number; fishingLevel: number; expCur: number; expNext: number; leveledTo: number | null;
  shardGain: number;
  rank: number;
  isFirstDiscovery: boolean;
  streak: number;
  location: string; rodName: string; baitName: string; timeLabel: string;
}

function rollNumber(node: HTMLElement, target: number, durMs: number, onDone: () => void): void {
  const start = performance.now();
  let lastTick = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durMs);
    // ease-out; while rolling show a jittered approach so it "spins"
    const eased = 1 - Math.pow(1 - t, 3);
    let val: number;
    if (t < 1) {
      const base = target * eased;
      val = Math.floor(base + (Math.random() * target * (1 - eased) * 0.25));
    } else {
      val = target;
    }
    node.textContent = fmt(val);
    if (now - lastTick > 45 && t < 1) { lastTick = now; sfx('blip'); }
    if (t < 1) requestAnimationFrame(step);
    else onDone();
  };
  requestAnimationFrame(step);
}

export function showCatchSummary(data: CatchSummaryData): Promise<'again' | 'quit'> {
  return new Promise(resolve => {
    const rd = RARITY[data.sp.rarity];
    const overlay = el('div', 'fishing-score-overlay');
    const rowsHtml = data.score.labels.map(l => `
      <div class="score-row" data-key="${l.key}">
        <span class="sr-label">${l.label}</span>
        <span class="sr-val" data-target="${l.value}">0</span>
      </div>`).join('');

    overlay.innerHTML = `
      <div class="fso-card ${rd.rainbow ? 'rarity-legendary' : ''}" style="--rc:${rd.color};--rg:${rd.glow}">
        <div class="fso-head">
          <div class="fso-badge">${rd.badge}</div>
          <div>
            <div class="fso-title">${data.sp.name}</div>
            <div class="fso-sub">${FAMILIES[data.sp.family].name} · ${rarityChip(data.sp.rarity)} ${data.isFirstDiscovery ? '<span class="new-tag">NEW!</span>' : ''}</div>
          </div>
        </div>
        <div class="fso-meta">
          <span>⚖️ ${data.weightKg.toFixed(2)} kg</span>
          <span>📏 ${data.lengthCm.toFixed(1)} cm</span>
          <span>🕓 ${data.timeLabel}</span>
          <span>📍 ${data.location}</span>
          <span>🎣 ${data.rodName}</span>
          <span>🪱 ${data.baitName}</span>
          ${data.streak >= 2 ? `<span class="streak">🔥 ${data.streak} Streak</span>` : ''}
        </div>
        <div class="fso-scores">${rowsHtml}</div>
        <div class="score-row grand" data-key="grand">
          <span class="sr-label">★ FISHING SCORE</span>
          <span class="sr-val grand-val" data-target="${data.score.total}">0</span>
        </div>
        <div class="fso-rewards" style="display:none">
          <div class="rw">🎣 Fishing EXP <b>+${fmt(data.expGain)}</b>${data.leveledTo ? ` <span class="lvlup">LEVEL UP → Lv.${data.leveledTo}!</span>` : ''}</div>
          <div class="rw">◆ Shards <b>+${fmt(data.shardGain)}</b></div>
          <div class="rw">🏆 Leaderboard Rank <b>#${data.rank}</b></div>
        </div>
        <div class="fso-actions" style="display:none">
          <button class="ui-btn primary" id="fso-again">🎣 Cast Again</button>
          <button class="ui-btn" id="fso-quit">🚪 Quit Fishing</button>
        </div>
        <div class="fso-skip">click to speed up ▸</div>
      </div>`;
    document.body.appendChild(overlay);

    const rows = Array.from(overlay.querySelectorAll<HTMLElement>('.score-row'));
    const rewards = overlay.querySelector<HTMLElement>('.fso-rewards')!;
    const actions = overlay.querySelector<HTMLElement>('.fso-actions')!;
    const card = overlay.querySelector<HTMLElement>('.fso-card')!;
    let skipped = false;
    let idx = 0;
    let finished = false;

    const lockRow = (row: HTMLElement, big: boolean) => {
      row.classList.add('locked');
      if (big) {
        sfx('fanfare');
        card.classList.add('shake-big');
        spawnConfetti(overlay, rd.rainbow ? 'rainbow' : rd.color);
        setTimeout(() => card.classList.remove('shake-big'), 600);
      } else {
        sfx(idx % 2 ? 'confirm' : 'toast');
        row.classList.add('flash');
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 120);
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      rewards.style.display = '';
      actions.style.display = '';
      overlay.querySelector('.fso-skip')?.remove();
      requestAnimationFrame(() => { rewards.classList.add('show'); actions.classList.add('show'); });
      (overlay.querySelector('#fso-again') as HTMLElement).onclick = () => { cleanup(); resolve('again'); };
      (overlay.querySelector('#fso-quit') as HTMLElement).onclick = () => { cleanup(); resolve('quit'); };
    };

    const cleanup = () => { sfx('confirm'); overlay.classList.add('out'); setTimeout(() => overlay.remove(), 300); };

    const next = () => {
      if (idx >= rows.length) { finish(); return; }
      const row = rows[idx];
      const valNode = row.querySelector<HTMLElement>('.sr-val')!;
      const target = parseInt(valNode.dataset.target ?? '0', 10);
      const big = row.classList.contains('grand');
      row.classList.add('reveal');
      rollNumber(valNode, target, big ? 1100 : 520, () => {
        lockRow(row, big);
        idx++;
        setTimeout(next, big ? 350 : (skipped ? 40 : 230));
      });
    };

    // click to skip: instantly resolve all rolls
    overlay.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.ui-btn')) return;
      if (finished) return;
      skipped = true;
      rows.forEach(r => {
        const v = r.querySelector<HTMLElement>('.sr-val')!;
        v.textContent = fmt(parseInt(v.dataset.target ?? '0', 10));
        r.classList.add('locked', 'reveal');
      });
      finish();
    });

    setTimeout(next, 250);
  });
}

function spawnConfetti(parent: HTMLElement, color: string | 'rainbow'): void {
  const colors = color === 'rainbow'
    ? ['#ff5a6a', '#f2c14e', '#5ad88a', '#5ab8e8', '#b18ae8', '#ff7ad8']
    : [color, '#f2c14e', '#ffffff'];
  for (let i = 0; i < 46; i++) {
    const c = el('div', 'confetti');
    const col = colors[i % colors.length];
    c.style.cssText = `left:${50 + (Math.random() - 0.5) * 60}%;top:42%;background:${col};
      --dx:${(Math.random() - 0.5) * 520}px;--dy:${-120 - Math.random() * 360}px;--rot:${Math.random() * 720}deg;
      animation-delay:${Math.random() * 0.15}s`;
    parent.appendChild(c);
    setTimeout(() => c.remove(), 1700);
  }
}

// ============================================================
//  THE FISHING HUB (shop / encyclopedia / leaderboard / etc.)
// ============================================================
export type HubTab = 'rods' | 'bait' | 'kitchen' | 'codex' | 'board' | 'fame' | 'records' | 'quests';
const TAB_INFO: Record<HubTab, { icon: string; label: string }> = {
  rods: { icon: '🎣', label: 'Rods' },
  bait: { icon: '🪱', label: 'Bait' },
  kitchen: { icon: '🍳', label: 'Kitchen' },
  codex: { icon: '📖', label: 'Encyclopedia' },
  board: { icon: '🏆', label: 'Leaderboard' },
  fame: { icon: '🌟', label: 'Hall of Fame' },
  records: { icon: '🎖️', label: 'Titles' },
  quests: { icon: '📜', label: 'Quests' },
};

export function openFishHub(player: Player, fs: FishingState, opts: { tab?: HubTab; canBuy?: boolean; title?: string } = {}): Promise<void> {
  const canBuy = opts.canBuy ?? true;
  return new Promise(resolve => {
    let current: HubTab = opts.tab ?? 'rods';
    let preview: RodPreview | null = null;

    const close = () => {
      preview?.dispose();
      closeMenu();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);

    const visibleTabs: HubTab[] = canBuy
      ? ['rods', 'bait', 'kitchen', 'codex', 'board', 'fame', 'records', 'quests']
      : ['codex', 'board', 'fame', 'records', 'quests'];

    const tabsHtml = () => visibleTabs.map(t =>
      `<button class="ui-btn tab ${t === current ? 'primary' : ''}" data-tab="${t}">${TAB_INFO[t].icon} <span class="tab-l">${TAB_INFO[t].label}</span></button>`
    ).join('');

    const render = () => {
      preview?.dispose(); preview = null;
      const body = renderTab(current, player, fs, canBuy, render);
      const eln = openScreen(`
        <h3>${opts.title ?? '🎣 Anglers\' Wharf'} <span class="sub">◆ ${fmt(player.shards)} Shards · Lv.${fishingLevelFromExp(fs.exp)} ${titleForLevel(fishingLevelFromExp(fs.exp))}</span></h3>
        <div class="panel-tabs fish-tabs">${tabsHtml()}</div>
        <div class="fish-hub-body">${body.html}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button class="ui-btn primary" id="hub-close">Close (Esc)</button>
        </div>`);
      eln.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => { current = b.dataset.tab as HubTab; sfx('open'); render(); });
      (eln.querySelector('#hub-close') as HTMLElement).onclick = close;
      body.wire?.(eln);
      // mount a live 3D preview if this tab wants one
      const pv = eln.querySelector<HTMLElement>('#rod-preview');
      if (pv) {
        const p = preview = mountRodPreview(pv, fs);
        const cap = eln.querySelector<HTMLElement>('#rod-preview-cap');
        const setCap = (rodId: string, baitId: string) => {
          if (cap) cap.textContent = `🎣 ${(RODS[rodId] ?? RODS.beginner).name}  ·  🪱 ${(BAITS[baitId] ?? BAITS.worm).name}`;
        };
        const wirePreview = (attr: 'previewRod' | 'previewBait', pick: (id: string) => [string, string]) => {
          const sel = `[data-${attr === 'previewRod' ? 'preview-rod' : 'preview-bait'}]`;
          eln.querySelectorAll<HTMLElement>(sel).forEach(row => row.onclick = e => {
            if ((e.target as HTMLElement).closest('.ui-btn')) return;
            eln.querySelectorAll(sel).forEach(r => r.classList.remove('previewing'));
            row.classList.add('previewing');
            const [rodId, baitId] = pick(row.dataset[attr]!);
            p.show(rodId, baitId); setCap(rodId, baitId); sfx('blip');
          });
        };
        wirePreview('previewRod', id => [id, fs.equippedBait]);
        wirePreview('previewBait', id => [fs.equippedRod, id]);
        // start on the equipped loadout, highlighting its row
        setCap(fs.equippedRod, fs.equippedBait);
        eln.querySelector(`[data-preview-rod="${fs.equippedRod}"]`)?.classList.add('previewing');
        eln.querySelector(`[data-preview-bait="${fs.equippedBait}"]`)?.classList.add('previewing');
      }
    };
    render();
  });
}

interface TabBody { html: string; wire?: (root: HTMLElement) => void; }

function renderTab(tab: HubTab, player: Player, fs: FishingState, canBuy: boolean, refresh: () => void): TabBody {
  switch (tab) {
    case 'rods': return tabRods(player, fs, canBuy, refresh);
    case 'bait': return tabBait(player, fs, canBuy, refresh);
    case 'kitchen': return tabKitchen(player, fs, canBuy, refresh);
    case 'codex': return tabCodex(fs);
    case 'board': return tabBoard(player, fs);
    case 'fame': return tabFame(fs);
    case 'records': return tabRecords(player, fs, refresh);
    case 'quests': return tabQuests(player, fs, refresh);
  }
}

// ---------------- Rods ----------------
function tabRods(player: Player, fs: FishingState, canBuy: boolean, refresh: () => void): TabBody {
  const list = Object.values(RODS).map(rod => {
    const owned = fs.ownedRods.includes(rod.id);
    const equipped = fs.equippedRod === rod.id;
    const stars = (n: number) => '★'.repeat(Math.round(n)).padEnd(5, '·');
    const btn = equipped ? `<button class="ui-btn primary" disabled>Equipped</button>`
      : owned ? `<button class="ui-btn" data-equip="${rod.id}">Equip</button>`
      : canBuy ? `<button class="ui-btn ${player.shards >= rod.price ? '' : 'danger'}" data-buy="${rod.id}">◆ ${fmt(rod.price)}</button>`
      : `<span class="sub">Locked</span>`;
    return `
      <div class="list-row rod-row ${equipped ? 'eq' : ''}" data-preview-rod="${rod.id}" title="Click to preview">
        <div style="flex:1">
          <div class="lr-top"><b style="color:#${rod.color.toString(16).padStart(6, '0')}">${rod.name}</b> <span class="sub">Tier ${rod.tier}</span></div>
          <div class="sub">${rod.desc}</div>
          <div class="rod-stats">
            <span>⚡ Reel ${stars(rod.reelPower * 2.5)}</span>
            <span>🧵 Line ${stars(rod.lineStrength * 2.5)}</span>
            <span>🍀 Luck ${stars(rod.luck * 2.2)}</span>
            <span>🎯 Cast ${rod.castMax}m</span>
          </div>
        </div>
        <div class="lr-act">${btn}</div>
      </div>`;
  }).join('');
  const html = `
    <div class="hub-split">
      <div class="hub-list">${list}</div>
      <div class="hub-preview">
        <div id="rod-preview" class="rod-preview-box"></div>
        <div class="sub" id="rod-preview-cap" style="text-align:center;margin-top:6px">Live preview</div>
      </div>
    </div>`;
  return {
    html,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
        const rod = RODS[b.dataset.buy!];
        if (player.shards < rod.price) { toast('Not enough Shards.', 'red'); return; }
        player.shards -= rod.price; fs.ownedRods.push(rod.id); fs.equippedRod = rod.id;
        player.save(); sfx('fanfare'); toast(`Bought & equipped ${rod.name}!`, 'gold'); refresh();
      });
      root.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = () => {
        fs.equippedRod = b.dataset.equip!; player.save(); sfx('confirm'); refresh();
      });
    },
  };
}

// ---------------- Bait ----------------
function tabBait(player: Player, fs: FishingState, canBuy: boolean, refresh: () => void): TabBody {
  const list = Object.values(BAITS).map(bait => {
    const have = bait.infinite ? '∞' : fmt(fs.baitStock[bait.id] ?? 0);
    const equipped = fs.equippedBait === bait.id;
    const canEquip = bait.infinite || (fs.baitStock[bait.id] ?? 0) > 0;
    const prefersList = ALL_FISH.filter(f => f.spawn.baitPref?.includes(bait.id)).slice(0, 4).map(f => f.name).join(', ');
    const buyBtn = bait.infinite ? '' :
      canBuy ? `<button class="ui-btn" data-buy="${bait.id}">Buy ×5 ◆${fmt(bait.price * 5)}</button>` : '';
    const eqBtn = equipped ? `<button class="ui-btn primary" disabled>Equipped</button>`
      : canEquip ? `<button class="ui-btn" data-equip="${bait.id}">Equip</button>`
      : `<span class="sub">Out</span>`;
    return `
      <div class="list-row ${equipped ? 'eq' : ''}" data-preview-bait="${bait.id}" title="Click to preview">
        <div style="flex:1">
          <div class="lr-top"><b>${bait.name}</b> ${rarityChip(bait.rarity)} <span class="sub">×${have}</span></div>
          <div class="sub">${bait.desc}</div>
          ${prefersList ? `<div class="sub" style="color:var(--ui-green)">Attracts: ${prefersList}</div>` : ''}
        </div>
        <div class="lr-act">${eqBtn}${buyBtn}</div>
      </div>`;
  }).join('');
  return {
    html: `
      <div class="hub-split">
        <div class="hub-list">${list}</div>
        <div class="hub-preview">
          <div id="rod-preview" class="rod-preview-box"></div>
          <div class="sub" id="rod-preview-cap" style="text-align:center;margin-top:6px">Live preview</div>
        </div>
      </div>`,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
        const bait = BAITS[b.dataset.buy!]; const cost = bait.price * 5;
        if (player.shards < cost) { toast('Not enough Shards.', 'red'); return; }
        player.shards -= cost; fs.baitStock[bait.id] = (fs.baitStock[bait.id] ?? 0) + 5;
        player.save(); sfx('confirm'); toast(`Bought 5× ${bait.name}.`, 'gold'); refresh();
      });
      root.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = () => {
        fs.equippedBait = b.dataset.equip!; player.save(); sfx('confirm'); refresh();
      });
    },
  };
}

// ---------------- Kitchen ----------------
function tabKitchen(player: Player, fs: FishingState, canBuy: boolean, refresh: () => void): TabBody {
  const bag = fs.caughtFishBag;
  const bagHtml = RARITY_ORDER.map(r => `<span class="kbag" style="--rc:${RARITY[r].color}">${RARITY[r].badge} ${r}: <b>${bag[r]}</b></span>`).join('');
  const recipes = RECIPES.map(rec => {
    const item = ITEMS[rec.id];
    // count fish of minRarity-or-better
    const avail = RARITY_ORDER.slice(RARITY_ORDER.indexOf(rec.minRarity)).reduce((a, r) => a + (bag[r] ?? 0), 0);
    const can = avail >= rec.cost && canBuy;
    return `
      <div class="list-row">
        <div style="flex:1">
          <div class="lr-top">${itemIcon(rec.id)} <b>${rec.name}</b> <span class="sub">${rec.method} · needs ${rec.cost}× ${rec.minRarity}+ fish</span></div>
          <div class="sub">${item?.desc ?? rec.desc}</div>
        </div>
        <div class="lr-act"><button class="ui-btn ${can ? '' : 'danger'}" data-cook="${rec.id}" ${can ? '' : 'disabled'}>Cook</button></div>
      </div>`;
  }).join('');
  return {
    html: `
      <div class="kbag-row">${bagHtml}</div>
      <div class="sub" style="margin:6px 0 10px">Cooked dishes go to your Inventory and can be used in battle. Higher rarities are consumed first.</div>
      <div class="hub-list">${recipes}</div>`,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-cook]').forEach(b => b.onclick = () => {
        const rec = RECIPES.find(r => r.id === b.dataset.cook!)!;
        // spend the cheapest qualifying fish first (lowest rarity that still qualifies)
        let need = rec.cost;
        const tiers = RARITY_ORDER.slice(RARITY_ORDER.indexOf(rec.minRarity));
        for (const r of tiers) {
          while (need > 0 && bag[r] > 0) { bag[r]--; need--; }
          if (need === 0) break;
        }
        if (need > 0) { toast('Not enough fish.', 'red'); return; }
        if (!player.addItem(rec.id, 1)) { toast('Inventory (cargo) is full!', 'red'); return; }
        player.save(); sfx('fanfare'); toast(`Cooked ${rec.name}!`, 'gold'); refresh();
      });
    },
  };
}

// ---------------- Encyclopedia ----------------
function tabCodex(fs: FishingState): TabBody {
  const fams: FamilyId[] = ['pond', 'river', 'predator', 'exotic', 'ancient'];
  const discoveredCount = ALL_FISH.filter(f => fs.discovered[f.id]).length;
  const sections = fams.map(fam => {
    const cards = ALL_FISH.filter(f => f.family === fam).map(f => {
      const rec = fs.discovered[f.id];
      if (!rec) {
        return `<div class="codex-card unknown"><div class="cc-q">?</div><div class="cc-name">??? </div><div class="sub">${RARITY[f.rarity].badge}</div></div>`;
      }
      return `<div class="codex-card" style="--rc:${RARITY[f.rarity].color}">
        <div class="cc-name" style="color:${RARITY[f.rarity].color}">${f.name}</div>
        <div class="sub">${rarityChip(f.rarity)}</div>
        <div class="cc-rec"><span>×${rec.count}</span><span>⚖️ ${rec.maxWeight.toFixed(1)}kg</span><span>📏 ${rec.maxLength.toFixed(0)}cm</span></div>
        <div class="cc-lore">${f.lore}</div>
      </div>`;
    }).join('');
    return `<div class="codex-fam"><h4>${FAMILIES[fam].name} <span class="sub">${FAMILIES[fam].blurb}</span></h4><div class="codex-grid">${cards}</div></div>`;
  }).join('');
  return { html: `<div class="codex-head sub">Species discovered: <b style="color:var(--ui-gold)">${discoveredCount} / 25</b></div>${sections}` };
}

// ---------------- Leaderboard ----------------
function tabBoard(player: Player, fs: FishingState): TabBody {
  const board = [...fs.leaderboard].sort((a, b) => b.score - a.score);
  const top = board.slice(0, 20);
  const playerEntry = board.find(e => e.isPlayer);
  const playerRank = board.findIndex(e => e.isPlayer) + 1;
  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  const rows = top.map((e, i) => {
    const frameCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const title = rankTitle(i + 1);
    return `<div class="board-row ${frameCls} ${e.isPlayer ? 'me' : ''}" data-prof="${e.id}">
      <span class="br-rank">${medal(i)}</span>
      <span class="br-name">${e.name}${e.isPlayer ? ' <span class="you-tag">YOU</span>' : ''}${title ? `<span class="br-title">${title}</span>` : ''}</span>
      <span class="br-score">${fmt(e.score)}</span>
    </div>`;
  }).join('');
  const youOutside = playerEntry && playerRank > 20
    ? `<div class="board-row me outside"><span class="br-rank">#${playerRank}</span><span class="br-name">${playerEntry.name} <span class="you-tag">YOU</span></span><span class="br-score">${fmt(playerEntry.score)}</span></div>`
    : '';
  // recent legendary ticker
  const ticker = '🌈 Recent Legendary catches sweep the wharf — keep fishing to climb!';
  return {
    html: `
      <div class="board-wrap">
        <div class="board-head"><span>RANK</span><span>ANGLER</span><span>LIFETIME SCORE</span></div>
        ${rows}
        ${youOutside}
      </div>
      <div class="board-ticker"><div class="bt-scroll">${ticker} &nbsp; • &nbsp; ${ticker}</div></div>
      <div class="sub" style="text-align:center;margin-top:6px">Click any angler to view their profile.</div>`,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-prof]').forEach(r => r.onclick = () => {
        const e = fs.leaderboard.find(x => x.id === r.dataset.prof);
        if (!e) return;
        sfx('open');
        const rank = board.findIndex(x => x.id === e.id) + 1;
        const t = rankTitle(rank);
        const m = el('div', 'angler-profile');
        m.innerHTML = `<div class="ap-card">
          <div class="ap-name">${e.name}${e.isPlayer ? ' (You)' : ''}</div>
          <div class="ap-rank">Rank #${rank}${t ? ` · ${t}` : ''}</div>
          <div class="ap-grid">
            <div><span class="sub">Lifetime Score</span><b>${fmt(e.score)}</b></div>
            <div><span class="sub">Total Fish Caught</span><b>${fmt(e.totalCaught)}</b></div>
            <div><span class="sub">Largest Fish</span><b>${e.largestFish}</b></div>
            <div><span class="sub">Favorite Species</span><b>${e.favoriteSpecies}</b></div>
            <div><span class="sub">Best Location</span><b>${e.bestLocation}</b></div>
            <div><span class="sub">Legendary Catches</span><b>${e.legendaryCount}</b></div>
            <div><span class="sub">Fishing Level</span><b>${e.level}</b></div>
          </div>
          <button class="ui-btn primary" id="ap-close">Close</button>
        </div>`;
        document.body.appendChild(m);
        (m.querySelector('#ap-close') as HTMLElement).onclick = () => { sfx('cancel'); m.remove(); };
        m.onclick = ev => { if (ev.target === m) m.remove(); };
      });
    },
  };
}

// ---------------- Hall of Fame ----------------
function tabFame(fs: FishingState): TabBody {
  const FAME_DEFS: { key: string; icon: string; label: string; unit?: string }[] = [
    { key: 'largest', icon: '⚖️', label: 'Largest Fish Ever', unit: 'kg' },
    { key: 'longest_fish', icon: '📏', label: 'Longest Fish', unit: 'cm' },
    { key: 'fastest', icon: '⚡', label: 'Fastest Catch', unit: 's' },
    { key: 'longest_cast', icon: '🎯', label: 'Longest Cast', unit: 'm' },
    { key: 'high_score', icon: '★', label: 'Highest Catch Score' },
    { key: 'legendary', icon: '🌈', label: 'Most Legendary Caught' },
    { key: 'species', icon: '📖', label: 'Most Species Collected' },
    { key: 'streak', icon: '🔥', label: 'Longest Fishing Streak' },
  ];
  const rows = FAME_DEFS.map(d => {
    const rec = fs.hallOfFame[d.key];
    if (!rec) return `<div class="fame-row"><span class="fame-i">${d.icon}</span><span class="fame-l">${d.label}</span><span class="fame-v sub">— not yet set —</span></div>`;
    const date = rec.at ? new Date(rec.at).toLocaleDateString() : '';
    return `<div class="fame-row"><span class="fame-i">${d.icon}</span>
      <span class="fame-l">${d.label}<br><span class="sub">${rec.holder}${rec.detail ? ` · ${rec.detail}` : ''}${date ? ` · ${date}` : ''}</span></span>
      <span class="fame-v">${d.key === 'fastest' || d.key === 'high_score' || d.key === 'legendary' || d.key === 'species' || d.key === 'streak' ? fmt(rec.value) : rec.value.toFixed(1)}${d.unit ? ' ' + d.unit : ''}</span></div>`;
  }).join('');
  return { html: `<div class="sub" style="margin-bottom:10px">Permanent records of the Great Pond's greatest anglers — and you.</div>${rows}` };
}

// ---------------- Titles & Records & Achievements ----------------
function tabRecords(player: Player, fs: FishingState, refresh: () => void): TabBody {
  const lvl = fishingLevelFromExp(fs.exp);
  const cur = fs.exp - fishingExpForLevel(lvl);
  const next = fishingExpForLevel(lvl + 1) - fishingExpForLevel(lvl);
  const pct = lvl >= 50 ? 100 : Math.min(100, Math.round(cur / next * 100));
  const titlesUnlocked = ['Pond Rookie', 'Dock Hand', 'River Wader', 'Seasoned Angler', 'River Master', 'Fish Whisperer', 'Deep-Water Sage', 'Legendary Angler', 'Master of the Waters']
    .filter((_, i) => {
      const reqs = [1, 5, 10, 15, 20, 28, 36, 44, 50];
      return lvl >= reqs[i];
    });
  const rankT = fs.bestRank ? rankTitle(fs.bestRank) : null;
  if (rankT && !titlesUnlocked.includes(rankT)) titlesUnlocked.push(rankT);
  const titleBtns = titlesUnlocked.map(t => `<button class="ui-btn ${fs.activeTitle === t ? 'primary' : ''}" data-title="${t}">${t}</button>`).join('');
  const ach = FISH_ACHIEVEMENTS.map(a => {
    const got = fs.achievements.includes(a.id) || a.check(fs);
    return `<div class="ach-row ${got ? 'got' : ''}"><span class="ach-i">${got ? a.icon : '🔒'}</span><div><b>${a.name}</b><div class="sub">${a.desc}</div></div></div>`;
  }).join('');
  return {
    html: `
      <div class="rec-level">
        <div class="lr-top"><b>Fishing Level ${lvl}</b> <span class="sub">${titleForLevel(lvl)} · ${fmt(fs.exp)} total EXP</span></div>
        <div class="bar" style="margin:6px 0"><div style="width:${pct}%;background:linear-gradient(90deg,#5ab8e8,#5ad88a)"></div></div>
        <div class="sub">${lvl >= 50 ? 'MAX LEVEL' : `${fmt(cur)} / ${fmt(next)} to Lv.${lvl + 1}`}</div>
      </div>
      <div class="rec-stats">
        <span>Total Caught: <b>${fmt(fs.totalCaught)}</b></span>
        <span>Best Score: <b>${fmt(fs.bestCatchScore)}</b></span>
        <span>Best Rank: <b>${fs.bestRank ? '#' + fs.bestRank : '—'}</b></span>
        <span>Best Streak: <b>${fs.bestStreak}</b></span>
        <span>Legendary: <b>${fs.legendaryCount}</b></span>
      </div>
      <h4 style="color:var(--ui-gold);margin:12px 0 6px">Choose Your Title</h4>
      <div class="title-grid">${titleBtns}</div>
      <h4 style="color:var(--ui-gold);margin:12px 0 6px">Achievements</h4>
      <div class="ach-grid">${ach}</div>`,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-title]').forEach(b => b.onclick = () => {
        fs.activeTitle = b.dataset.title!; player.save(); sfx('confirm'); toast(`Title set: ${fs.activeTitle}`, 'gold'); refresh();
      });
    },
  };
}

// ---------------- Quests ----------------
function tabQuests(player: Player, fs: FishingState, refresh: () => void): TabBody {
  const rows = FISHING_BOUNTIES.map(q => {
    const done = q.check(fs);
    const claimed = fs.bounties.includes(q.id);
    const rw = q.reward;
    const rewardStr = [
      rw.shards ? `◆${fmt(rw.shards)}` : '',
      rw.bait ? `${BAITS[rw.bait].name}×${rw.baitQty ?? 1}` : '',
      rw.rod ? RODS[rw.rod].name : '',
      rw.item ? (ITEMS[rw.item]?.name ?? rw.item) : '',
    ].filter(Boolean).join(' · ');
    const btn = claimed ? `<span class="sub" style="color:var(--ui-green)">✓ Claimed</span>`
      : done ? `<button class="ui-btn primary" data-claim="${q.id}">Claim</button>`
      : `<span class="sub">In progress</span>`;
    return `<div class="list-row ${claimed ? 'eq' : ''}">
      <div style="flex:1"><div class="lr-top"><b>${q.desc}</b></div><div class="sub">From ${q.giver} · Reward: ${rewardStr}</div></div>
      <div class="lr-act">${btn}</div></div>`;
  }).join('');
  return {
    html: `<div class="sub" style="margin-bottom:8px">Commissions from the Anglers' Guild and the pond regulars.</div><div class="hub-list">${rows}</div>`,
    wire(root) {
      root.querySelectorAll<HTMLElement>('[data-claim]').forEach(b => b.onclick = () => {
        const q = FISHING_BOUNTIES.find(x => x.id === b.dataset.claim!)!;
        if (!q.check(fs) || fs.bounties.includes(q.id)) return;
        fs.bounties.push(q.id);
        const rw = q.reward;
        if (rw.shards) player.shards += rw.shards;
        if (rw.bait) fs.baitStock[rw.bait] = (fs.baitStock[rw.bait] ?? 0) + (rw.baitQty ?? 1);
        if (rw.rod && !fs.ownedRods.includes(rw.rod)) fs.ownedRods.push(rw.rod);
        if (rw.item) player.addItem(rw.item, 1);
        player.save(); sfx('fanfare'); toast('Quest reward claimed!', 'gold'); refresh();
      });
    },
  };
}

// ============================================================
//  LIVE 3D ROD PREVIEW (a tiny self-contained renderer)
// ============================================================
interface RodPreview { dispose(): void; show(rodId: string, baitId: string): void; }
function mountRodPreview(container: HTMLElement, fs: FishingState): RodPreview {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
  container.appendChild(canvas);
  let renderer: THREE.WebGLRenderer;
  try { renderer = makeRenderer(canvas); } catch { return { dispose() { canvas.remove(); }, show() {} }; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1430);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  cam.position.set(2.1, 0.95, 2.8);
  // makeRenderer sizes the canvas to the whole window — clamp it back to the
  // preview box (buffer + CSS) and keep it in sync if the box is resized.
  const resize = () => {
    const w = container.clientWidth || 280, h = container.clientHeight || 260;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  resize();
  cam.lookAt(0, 0.6, 0);
  const ro = new ResizeObserver(resize); ro.observe(container);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x223044, 1.1));
  const key = new THREE.DirectionalLight(0xfff0d0, 1.4); key.position.set(3, 5, 2); scene.add(key);

  let curRod = fs.equippedRod, curBait = fs.equippedBait;
  let rod = makeRod(RODS[curRod] ?? RODS.beginner);
  rod.position.y = -0.2; scene.add(rod);
  let bob = makeBobber(BAITS[curBait] ?? BAITS.worm);
  bob.position.set(0.5, 1.4, 0); scene.add(bob);

  const show = (rodId: string, baitId: string) => {
    if (rodId !== curRod) {
      disposeFish(rod);
      rod = makeRod(RODS[rodId] ?? RODS.beginner);
      rod.position.y = -0.2; scene.add(rod);
      curRod = rodId;
    }
    if (baitId !== curBait) {
      disposeFish(bob);
      bob = makeBobber(BAITS[baitId] ?? BAITS.worm);
      bob.position.set(0.5, 1.4, 0); scene.add(bob);
      curBait = baitId;
    }
  };

  let alive = true;
  let t = 0;
  const loop = () => {
    if (!alive) return;
    t += 0.016;
    rod.rotation.y = t * 0.6;
    bob.position.y = 1.4 + Math.sin(t * 2) * 0.06;
    bob.rotation.y = t * 0.8;
    const nb = rod.getObjectByName('neonBand') as THREE.Mesh | null;
    if (nb) ((nb.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(t * 5) * 0.6);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
  return {
    show,
    dispose() {
      alive = false;
      ro.disconnect();
      disposeFish(rod); disposeFish(bob);
      renderer.dispose();
      canvas.remove();
    },
  };
}

// re-export for the scene
export { makeFish, swimFish };
