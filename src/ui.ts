// ============================================================
// AZ Tamer — DOM UI: dialogue, HUD, hotkey panels (P/I/G/C),
// toasts, name input
// ============================================================
import * as THREE from 'three';
import { ITEMS, CRAWLER_PARTS, TYPE_CSS, STAT_NAMES, HOUSES, DUNGEONS, expForLevel, SPECIES, TECHS, elementChipsHTML, type StatKey } from './data';
import { Player, Guardian } from './state';
import { makeGuardian, disposeRig } from './models';
import { GUILD_LORE, avatarURL, guildIconURL, rankFor, questsDoneCount } from './guilds';
import { journalEntries, questProgress, type QuestDef, type QuestState } from './quests';
import { openGuildCard } from './guildcard';
import { openGuardianCard } from './guardiancard';
import { RANKS, rankIndexFor, rankBadgeHTML, rankLadderHTML } from './ranks';
import { evoTreeHTML, wireEvoTree } from './evotree';
import { checkAchievements, achievementsHTML } from './achievements';
import { sfx, toggleMute, isMuted } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// every UI button clicks audibly
document.addEventListener('click', e => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('.ui-btn, .choice-btn, .evo-node, .hud-chip, .hud-portrait')) sfx('click');
});

// ---------------- fader ----------------
export async function fadeOut(): Promise<void> {
  $('fader').classList.add('on');
  await new Promise(r => setTimeout(r, 480));
}
export async function fadeIn(): Promise<void> {
  $('fader').classList.remove('on');
  await new Promise(r => setTimeout(r, 480));
}

// ---------------- toasts ----------------
export function toast(msg: string, kind: '' | 'gold' | 'red' = '', ms = 2400): void {
  const wrap = $('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  wrap.appendChild(el);
  sfx(kind === 'red' ? 'toastBad' : 'toast');
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s';
    setTimeout(() => el.remove(), 420);
  }, ms);
}

// ---------------- dialogue ----------------
let dialogueBusy = false;
export const isDialogueOpen = () => dialogueBusy;

function showBox(speaker: string): void {
  $('interact-hint').style.display = 'none'; // never let the hint clutter an open conversation
  $('dialogue-box').style.display = 'block';
  const sp = $('dialogue-speaker');
  sp.style.display = speaker ? 'block' : 'none';
  sp.textContent = speaker;
}

/** Show one dialogue line with typewriter effect; resolves on advance. */
export function say(speaker: string, text: string): Promise<void> {
  return new Promise(resolve => {
    dialogueBusy = true;
    sfx('blip');
    showBox(speaker);
    const txt = $('dialogue-text');
    const next = $('dialogue-next');
    $('dialogue-choices').style.display = 'none';
    next.style.display = 'none';
    txt.textContent = '';
    let i = 0, done = false;
    const iv = setInterval(() => {
      if (i >= text.length) { finishTyping(); return; }
      txt.textContent = text.slice(0, ++i);
    }, 14);
    const finishTyping = () => {
      clearInterval(iv);
      txt.textContent = text;
      done = true;
      next.style.display = 'block';
    };
    const onKey = (e: KeyboardEvent | MouseEvent) => {
      if (e instanceof KeyboardEvent && !['Enter', ' ', 'e', 'E'].includes(e.key)) return;
      if (!done) { finishTyping(); return; }
      window.removeEventListener('keydown', onKey);
      $('dialogue-box').removeEventListener('click', onKey);
      $('dialogue-box').style.display = 'none';
      dialogueBusy = false;
      resolve();
    };
    window.addEventListener('keydown', onKey);
    $('dialogue-box').addEventListener('click', onKey);
  });
}

/** Run a sequence of [speaker, text] lines. */
export async function conversation(lines: [string, string][]): Promise<void> {
  for (const [sp, tx] of lines) await say(sp, tx);
}

/** Show choices under a dialogue prompt; resolves with selected index. */
export function choose(speaker: string, text: string, options: string[]): Promise<number> {
  return new Promise(resolve => {
    dialogueBusy = true;
    showBox(speaker);
    $('dialogue-text').textContent = text;
    $('dialogue-next').style.display = 'none';
    const wrap = $('dialogue-choices');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';
    options.forEach((opt, idx) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = opt;
      b.onclick = () => {
        wrap.style.display = 'none';
        $('dialogue-box').style.display = 'none';
        dialogueBusy = false;
        resolve(idx);
      };
      wrap.appendChild(b);
    });
    (wrap.firstChild as HTMLElement)?.focus();
  });
}

// ---------------- name input ----------------
export function askName(title: string, placeholder = ''): Promise<string> {
  return new Promise(resolve => {
    dialogueBusy = true;
    const modal = $('name-modal');
    const input = $<HTMLInputElement>('name-input');
    $('name-modal-title').textContent = title;
    input.value = placeholder;
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
    const confirm = () => {
      const v = input.value.trim();
      if (!v) return;
      modal.style.display = 'none';
      $('name-confirm').onclick = null;
      input.onkeydown = null;
      dialogueBusy = false;
      resolve(v.slice(0, 12));
    };
    $('name-confirm').onclick = confirm;
    input.onkeydown = e => { if (e.key === 'Enter') confirm(); e.stopPropagation(); };
  });
}

// ---------------- HUD ----------------
const bar = (cur: number, max: number, cls: string) =>
  `<div class="minibar ${cls}"><div style="width:${Math.max(0, Math.min(100, (cur / max) * 100))}%"></div></div>`;

export function updateHUD(player: Player, zone: string, extra?: { floor?: number }): void {
  checkAchievements(player);
  const hud = $('hud');
  hud.style.display = 'block';
  const c = player.crawler;
  const floorTxt = extra?.floor ? ` — B${extra.floor}F` : '';
  let html = `<div id="hud-zone">${zone}${floorTxt}</div>`;
  const house = HOUSES.find(h => h.id === player.houseId);
  const rIdx = rankIndexFor(player);
  html += `<div class="hud-id">
    <img class="hud-portrait" src="${avatarURL(player)}" alt="" title="${house ? 'Open your Guild Card' : 'Pledge to a Grand House to receive a Guild Card'}" style="border-color:${house ? house.color : 'var(--ui-border)'}">
    <div style="flex:1;min-width:0">
      <div class="hud-name">${player.tamerName}</div>
      <div class="hud-rank">${rankBadgeHTML(rIdx, 17)}<b style="color:${RANKS[rIdx].color}">${RANKS[rIdx].name}</b>${house ? `<img src="${guildIconURL(house.id, 32)}" alt="" title="${house.name}">` : ''}</div>
    </div>
    <span class="goldcol" style="white-space:nowrap">◆ ${player.shards}</span>
  </div>`;
  if (extra?.floor !== undefined) {
    html += `<div class="row"><span class="label">Hull</span><span>${c.hull}/${c.hullMax}</span></div>`;
    html += `<div class="bar hull"><div style="width:${(c.hull / c.hullMax) * 100}%"></div></div>`;
    html += `<div class="row"><span class="label">Energy</span><span>${c.energy}/${c.energyMax}</span></div>`;
    html += `<div class="bar energy"><div style="width:${(c.energy / c.energyMax) * 100}%"></div></div>`;
  }
  if (player.party.length) {
    html += `<div class="hud-party">` + player.party.map((g, i) => {
      const s = g.stats;
      return `<div class="hud-chip" data-chip="${i}" title="Open ${g.nickname}'s Guardian Card">
        <div class="nm"><span style="color:${TYPE_CSS[g.species.type]}">${g.nickname}</span><span class="label">Lv${g.level}</span></div>
        ${bar(g.hp, s.hp, 'hp')}${bar(g.sp, s.sp, 'sp')}
      </div>`;
    }).join('') + `</div>`;
  } else {
    html += `<div class="sub" style="margin-top:4px;color:var(--ui-dim)">No Guardians yet</div>`;
  }
  hud.innerHTML = html;

  // upper-left identity is clickable: portrait → Guild Card, chips → Guardian Cards
  let cardBusy = false;
  const portrait = hud.querySelector<HTMLElement>('.hud-portrait');
  if (portrait) portrait.onclick = async () => {
    if (cardBusy || isDialogueOpen() || isMenuOpen()) return;
    if (!house) { toast('Pledge to a Grand House to receive your Guild Card.', ''); return; }
    cardBusy = true;
    sfx('open');
    await openGuildCard(player, () => updateHUD(player, zone, extra));
    cardBusy = false;
  };
  hud.querySelectorAll<HTMLElement>('[data-chip]').forEach(chip => chip.onclick = async () => {
    if (cardBusy || isDialogueOpen() || isMenuOpen()) return;
    const g = player.party[+chip.dataset.chip!];
    if (!g) return;
    cardBusy = true;
    sfx('open');
    await openGuardianCard(g, player);
    cardBusy = false;
  });
}
export function hideHUD(): void { $('hud').style.display = 'none'; showHotkeys(false); }

export function showHotkeys(on: boolean, dungeon = false): void {
  const el = $('hotkeys');
  el.style.display = on ? 'flex' : 'none';
  el.innerHTML = [
    '<b>P</b> Tamer', '<b>I</b> Items', '<b>G</b> Guardians', '<b>C</b> Crawler', '<b>J</b> Journal', '<b>V</b> Evolutions',
    ...(dungeon ? ['<b>M</b> Map'] : []),
    '<b>N</b> Sound', '<b>Esc</b> Menu',
  ].map(s => `<span>${s}</span>`).join('');
}

export function showInteractHint(text: string | null): void {
  const el = $('interact-hint');
  if (!text) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = text;
}

// ---------------- screens ----------------
let menuOpen = false;
export const isMenuOpen = () => menuOpen;

export function closeMenu(): void {
  $('menu-screen').style.display = 'none';
  menuOpen = false;
}

function openScreen(html: string): HTMLElement {
  const sc = $('menu-screen');
  const content = $('menu-content');
  content.innerHTML = html;
  sc.style.display = 'flex';
  menuOpen = true;
  return content;
}
export { openScreen };

const typeTag = (g: Guardian) =>
  `<span class="tag" style="background:${TYPE_CSS[g.species.type]};color:#0c1022">${g.species.type}</span>`;

// ================= panel system (P / I / G / C) =================
export type PanelKind = 'player' | 'inventory' | 'guardians' | 'crawler' | 'quests' | 'evotree';
export interface PanelCtx { canSave: boolean; }

const PANEL_KEYS: Record<string, PanelKind> = { p: 'player', i: 'inventory', g: 'guardians', c: 'crawler', j: 'quests', v: 'evotree' };
const PANEL_TITLES: Record<PanelKind, string> = {
  player: '🧭 Tamer Data', inventory: '🎒 Inventory', guardians: '🐾 Guardians', crawler: '🛞 Crawler', quests: '📖 Quest Journal', evotree: '🧬 Evolutions',
};
const PANEL_HOTKEY: Record<PanelKind, string> = { player: 'P', inventory: 'I', guardians: 'G', crawler: 'C', quests: 'J', evotree: 'V' };

/** Open a dedicated panel. Esc or the panel's own hotkey closes it (hotkeys also switch panels). */
export function openPanel(kind: PanelKind, player: Player, ctx: PanelCtx): Promise<void> {
  return new Promise(resolve => {
    let current = kind;

    const close = () => {
      closeMenu();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') { close(); return; }
      const target = PANEL_KEYS[k];
      if (target && !(e.target instanceof HTMLInputElement)) {
        if (target === current) close();
        else { current = target; render(); }
      }
    };
    window.addEventListener('keydown', onKey);

    const tabsHtml = () => (Object.keys(PANEL_TITLES) as PanelKind[]).map(p =>
      `<button class="ui-btn tab ${p === current ? 'primary' : ''}" data-tab="${p}">${PANEL_TITLES[p]} <span class="sub">(${PANEL_HOTKEY[p]})</span></button>`
    ).join('');

    const shell = (inner: string) => `
      <div class="panel-tabs">${tabsHtml()}</div>
      ${inner}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
        ${ctx.canSave ? '<button class="ui-btn" id="panel-save">💾 Save</button>' : ''}
        <button class="ui-btn primary" id="panel-close">Close (Esc)</button>
      </div>`;

    const wire = (el: HTMLElement) => {
      el.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => { current = b.dataset.tab as PanelKind; render(); });
      const save = el.querySelector<HTMLElement>('#panel-save');
      if (save) save.onclick = () => { player.save(); toast('Game saved.', 'gold'); };
      (el.querySelector('#panel-close') as HTMLElement).onclick = close;
    };

    const render = () => {
      const el = openScreen(shell(renderPanelBody(current, player, render, ctx)));
      wire(el);
      wirePanelBody(current, el, player, render, ctx);
    };
    render();
  });
}

// ---------- panel bodies ----------
function renderPanelBody(kind: PanelKind, p: Player, refresh: () => void, ctx: PanelCtx): string {
  if (kind === 'player') {
    const house = HOUSES.find(h => h.id === p.houseId);
    const lore = house ? GUILD_LORE[house.id] : null;
    const clears = Object.entries(p.dungeonClears)
      .map(([id, n]) => `<div class="row" style="display:flex;justify-content:space-between"><span class="sub">${DUNGEONS.find(d => d.id === id)?.name ?? id}</span><b>×${n}</b></div>`)
      .join('') || '<div class="sub">No conquests yet.</div>';
    return `
      <h3>${PANEL_TITLES.player}</h3>
      <div class="grid2">
        <div>
          <div class="list-row" style="align-items:flex-start">
            <img class="panel-portrait" src="${avatarURL(p)}" alt="" style="border-color:${house ? house.color : 'var(--ui-border)'}">
            <div style="flex:1">
              <b style="font-size:18px">${p.tamerName}</b>
              ${house ? `<span class="tag" style="background:${house.color};color:#0c1022;margin-left:6px">${house.type}</span>` : ''}
              <div class="sub">${house && lore ? `${house.name} · ${lore.epithet}` : 'Unaffiliated graduate'}</div>
              <div class="sub" style="display:flex;align-items:center;gap:5px;margin-top:3px">${rankBadgeHTML(rankIndexFor(p), 20, true)}${house ? ` · No. ${p.cardNo || '—'}` : ''}</div>
              ${house ? `<button class="ui-btn primary" id="open-guild-card" style="margin-top:8px;font-size:13px;padding:6px 14px">🪪 View Guild Card</button>` : '<div class="sub" style="margin-top:6px">Pledge to a Grand House to receive your guild Effigy & Sigil card.</div>'}
            </div>
          </div>
          <div class="list-row"><div style="flex:1"><span class="sub">Shards</span></div><b class="goldcol">◆ ${p.shards}</b></div>
          <div class="list-row"><div style="flex:1"><span class="sub">Battles won</span></div><b>${p.battlesWon}</b></div>
          <div class="list-row"><div style="flex:1"><span class="sub">Guardians befriended</span></div><b>${p.capturesMade}</b></div>
          <div class="list-row"><div style="flex:1"><span class="sub">Guardians owned</span></div><b>${p.party.length + p.reserve.length}</b></div>
          <div class="list-row"><div style="flex:1"><span class="sub">Guild quests completed</span></div><b>${questsDoneCount(p)}</b></div>
        </div>
        <div>
          <h3>Universal Rank</h3>
          ${rankLadderHTML(p)}
          <h3 style="margin-top:10px">Dungeon Conquests</h3>${clears}
        </div>
      </div>
      ${achievementsHTML(p)}`;
  }

  if (kind === 'evotree') {
    return evoTreeHTML(p);
  }

  if (kind === 'quests') {
    return renderJournal(p);
  }

  if (kind === 'inventory') {
    const rows = [...p.inventory.entries()].map(([id, qty]) => {
      const it = ITEMS[id];
      const usable = ['heal', 'sp', 'revive', 'boost'].includes(it.kind);
      return `<div class="list-row"><div style="flex:1"><b>${it.name}</b> ×${qty}<div class="sub">${it.desc}</div></div>
        ${usable ? `<button class="ui-btn" data-use="${id}">Use</button>` : ''}</div>`;
    }).join('') || '<div class="sub">Cargo hold is empty.</div>';
    return `
      <h3>${PANEL_TITLES.inventory} — ${p.inventory.size}/${p.crawler.cargoMax} slots</h3>
      <div style="max-height:420px;overflow-y:auto">${rows}</div>`;
  }

  if (kind === 'guardians') {
    const row = (g: Guardian, where: 'party' | 'reserve', i: number) => {
      const s = g.stats;
      const btn = where === 'party'
        ? `<button class="ui-btn" data-bench="${i}" ${p.party.length <= 1 ? 'disabled' : ''}>Bench</button>`
        : `<button class="ui-btn" data-promote="${i}" ${p.party.length >= 3 ? 'disabled' : ''}>To Party</button>`;
      return `<div class="list-row"><div style="flex:1" data-detail="${where}:${i}" style="cursor:pointer">
        <b style="color:${TYPE_CSS[g.species.type]}">${g.nickname}</b> ${typeTag(g)} ${elementChipsHTML(g.speciesId, 10)}
        <span class="sub">${g.species.name} · ${g.species.stage} · Lv${g.level}</span>
        <div class="sub">HP <span class="hpcol">${g.hp}/${s.hp}</span> · SP <span class="spcol">${g.sp}/${s.sp}</span> · EXP to next: ${g.expToNext}</div>
      </div><button class="ui-btn" data-detail2="${where}:${i}">Info</button>${btn}</div>`;
    };
    return `
      <h3>${PANEL_TITLES.guardians}</h3>
      <div class="grid2">
        <div><h3>Party (${p.party.length}/3)</h3>${p.party.map((g, i) => row(g, 'party', i)).join('') || '<div class="sub">Empty.</div>'}</div>
        <div><h3>Reserve (${p.reserve.length})</h3><div style="max-height:380px;overflow-y:auto">${p.reserve.map((g, i) => row(g, 'reserve', i)).join('') || '<div class="sub">No reserve Guardians.</div>'}</div></div>
      </div>`;
  }

  // crawler
  const c = p.crawler;
  const slots: ('hull' | 'engine' | 'cargo' | 'cannon' | 'scanner' | 'legs')[] = ['hull', 'engine', 'cargo', 'cannon', 'scanner', 'legs'];
  const sections = slots.map(slot => {
    const ownedParts = Object.values(CRAWLER_PARTS).filter(x => x.slot === slot && c.owned.includes(x.id)).sort((a, b) => a.tier - b.tier);
    const rows = ownedParts.map(part => {
      const equipped = c.parts[slot] === part.id;
      return `<div class="list-row"><div style="flex:1"><b>${part.name}</b> <span class="sub">T${part.tier}</span><div class="sub">${part.desc}</div></div>
        ${equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>' : `<button class="ui-btn" data-equip="${part.id}">Equip</button>`}</div>`;
    }).join('');
    return `<h3 style="margin-top:6px">${slot.toUpperCase()}</h3>${rows}`;
  }).join('');
  return `
    <h3>${PANEL_TITLES.crawler}</h3>
    <div class="grid2" style="margin-bottom:8px">
      <div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Hull</span><b>${c.hull}/${c.hullMax}</b></div>
        <div class="bar hull"><div style="width:${(c.hull / c.hullMax) * 100}%"></div></div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Energy</span><b>${c.energy}/${c.energyMax}</b></div>
        <div class="bar energy"><div style="width:${(c.energy / c.energyMax) * 100}%"></div></div>
      </div>
      <div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Cargo capacity</span><b>${p.inventory.size}/${c.cargoMax}</b></div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Cannon</span><b>T${c.cannonTier} (${Math.round(c.firstStrikeChance * 100)}% first strike)</b></div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Scanner</span><b>T${c.scannerTier}</b></div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Stride</span><b>${Math.round(c.strideEfficiency * 100)}% free steps</b></div>
      </div>
    </div>
    <div style="max-height:300px;overflow-y:auto">${sections}</div>
    <div class="sub" style="margin-top:6px">New parts are sold at Dax's Garage in Haven City.</div>`;
}

// ================= the Chronicle journal =================
// Tabbed, two-pane, clickable: quest cards on the left, a full
// dossier (brief, objective, progress, hint, giver, rewards) on
// the right. The Chronicle tab adds a chapter track.
type JournalTab = 'story' | 'main' | 'side';
let journalTab: JournalTab = 'story';
let journalSel: string | null = null;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n: number) => ROMAN[n - 1] ?? `${n}`;

function questBadge(st: QuestState): string {
  return st === 'done' ? '<span class="tag" style="background:var(--ui-green);color:#0c1022">COMPLETE</span>'
    : st === 'ready' ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022">TURN IN!</span>'
    : st === 'active' ? '<span class="tag" style="background:var(--ui-blue);color:#0c1022">ACTIVE</span>'
    : st === 'locked' ? '<span class="tag" style="background:var(--ui-dim);color:#0c1022">LOCKED</span>'
    : '<span class="tag" style="background:var(--ui-purple);color:#0c1022">NEW</span>';
}

function questIcon(q: QuestDef, st: QuestState): string {
  if (st === 'locked') return '🔒';
  return q.icon ?? (q.kind === 'main' ? '⚔️' : q.kind === 'side' ? '🤝' : '📖');
}

function rewardChips(q: QuestDef): string {
  const chips: string[] = [];
  if (q.reward.shards) chips.push(`<span class="jreward-chip">◆ ${q.reward.shards} Shards</span>`);
  for (const [id, qty] of q.reward.items ?? []) {
    chips.push(`<span class="jreward-chip">${ITEMS[id]?.name ?? id}${qty > 1 ? ` ×${qty}` : ''}</span>`);
  }
  return chips.join('') || '<span class="sub">—</span>';
}

function renderJournal(p: Player): string {
  const { story, main, side } = journalEntries(p);
  const groups: Record<JournalTab, [QuestDef, QuestState][]> = { story, main, side };
  const list = groups[journalTab];

  // keep a sensible selection: the loudest quest first
  if (!journalSel || !list.some(([q]) => q.id === journalSel)) {
    const pick = list.find(([, st]) => st === 'ready')
      ?? list.find(([, st]) => st === 'active')
      ?? list.find(([, st]) => st === 'available')
      ?? list[0];
    journalSel = pick ? pick[0].id : null;
  }
  const doneOf = (g: [QuestDef, QuestState][]) => g.filter(([, st]) => st === 'done').length;
  const tabBtn = (tab: JournalTab, label: string, g: [QuestDef, QuestState][]) => `
    <button class="jtab ${journalTab === tab ? 'on' : ''}" data-jtab="${tab}">
      ${label} <span class="jcount">${doneOf(g)}/${g.length}</span>
      ${g.some(([, st]) => st === 'ready') ? ' ❗' : ''}
    </button>`;

  // ---- left pane: quest cards ----
  const card = ([q, st]: [QuestDef, QuestState]) => {
    const prog = st !== 'locked' ? questProgress(p, q.id) : null;
    const pct = prog ? Math.round((prog[0] / Math.max(1, prog[1])) * 100) : null;
    const title = q.kind === 'story' && st === 'locked' ? '— ? —' : q.title;
    return `
      <div class="jcard ${st} ${q.id === journalSel ? 'sel' : ''}" data-jq="${q.id}">
        <div class="jcard-top"><span>${questIcon(q, st)}</span><b>${title}</b>${questBadge(st)}</div>
        ${q.chapter ? `<div class="jchap">Chapter ${roman(q.chapter)}</div>` : ''}
        ${pct !== null && st !== 'done' ? `<div class="jbar ${pct >= 100 ? 'full' : ''}"><div style="width:${Math.min(100, pct)}%"></div></div>` : ''}
      </div>`;
  };
  const emptyMsg = journalTab === 'main'
    ? '<div class="sub" style="padding:10px">Pledge to a Grand House in the University\'s Officers\' Hall to begin your guild\'s quest line.</div>'
    : '<div class="sub" style="padding:10px">Nothing here yet — the world will provide.</div>';
  const listHtml = list.length ? list.map(card).join('') : emptyMsg;

  // ---- the Chronicle's chapter track ----
  let trackHtml = '';
  if (journalTab === 'story' && story.length) {
    const dots = story.map(([q, st], i) => {
      const cls = st === 'done' ? 'done' : (st === 'active' || st === 'ready') ? 'cur' : '';
      const link = i < story.length - 1 ? `<div class="jlink ${st === 'done' ? 'done' : ''}"></div>` : '';
      return `<div class="jdot ${cls}" title="Chapter ${roman(q.chapter ?? i + 1)}"></div>${link}`;
    }).join('');
    trackHtml = `<div class="jtrack">${dots}</div>`;
  }

  // ---- right pane: the dossier ----
  let detailHtml = '<div class="sub">Select a quest.</div>';
  const selEntry = list.find(([q]) => q.id === journalSel);
  if (selEntry) {
    const [q, st] = selEntry;
    const prog = st !== 'locked' ? questProgress(p, q.id) : null;
    const kicker = q.kind === 'story'
      ? `The Chronicle — Chapter ${roman(q.chapter ?? 0)}`
      : q.kind === 'main' ? 'Guild Main Quest' : 'Side Quest';
    if (q.kind === 'story' && st === 'locked') {
      detailHtml = `
        <div class="jdetail-head">
          <div class="jdetail-icon">🔒</div>
          <div><div class="jdetail-kicker">${kicker}</div><div class="jdetail-title">— ? —</div></div>
        </div>
        <div class="jdetail-brief">The pages of this chapter are still blank. Finish the chapter before it, and the ink will come.</div>`;
    } else if (st === 'locked') {
      detailHtml = `
        <div class="jdetail-head">
          <div class="jdetail-icon">🔒</div>
          <div><div class="jdetail-kicker">${kicker}</div><div class="jdetail-title">${q.title}</div></div>
        </div>
        <div class="jdetail-brief">Complete the previous quest in the chain to unlock.</div>`;
    } else {
      const objMark = st === 'done' ? '✅ ' : st === 'ready' ? '❗ ' : '';
      const progRow = prog && st !== 'done' ? `
        <div class="jrow"><span class="jkey">Progress</span>
          <span class="jval" style="display:flex;align-items:center;gap:8px">
            <span style="min-width:42px"><b>${prog[0]}</b> / ${prog[1]}</span>
            <span class="jbar ${prog[0] >= prog[1] ? 'full' : ''}" style="flex:1;margin-top:0"><div style="width:${Math.min(100, (prog[0] / Math.max(1, prog[1])) * 100)}%"></div></span>
          </span>
        </div>` : '';
      const hintRow = q.hint && (st === 'active' || st === 'ready' || st === 'available') ? `
        <div class="jrow"><span class="jkey">🧭 Hint</span><span class="jval sub">${q.hint}</span></div>` : '';
      const footer = st === 'ready'
        ? `<div class="jrow" style="margin-top:12px"><span class="jval" style="color:var(--ui-gold);font-weight:700">❗ Objective complete${q.autoComplete ? '' : ` — return to ${q.giver.split('(')[0].trim()}`}!</span></div>`
        : st === 'done' ? '<div class="jrow" style="margin-top:12px"><span class="jval" style="color:var(--ui-green);font-weight:700">✅ Completed — well walked, tamer.</span></div>' : '';
      detailHtml = `
        <div class="jdetail-head">
          <div class="jdetail-icon">${questIcon(q, st)}</div>
          <div style="flex:1">
            <div class="jdetail-kicker">${kicker}</div>
            <div class="jdetail-title">${q.title}</div>
          </div>
          ${questBadge(st)}
        </div>
        <div class="jdetail-brief">${q.brief}</div>
        <div class="jrow"><span class="jkey">🎯 Objective</span><span class="jval obj">${objMark}${q.objective}</span></div>
        ${progRow}
        ${hintRow}
        <div class="jrow"><span class="jkey">🗣 Giver</span><span class="jval">${q.giver}</span></div>
        <div class="jrow"><span class="jkey">📍 Where</span><span class="jval">${q.location}</span></div>
        <div class="jrow"><span class="jkey">🎁 Reward</span><span class="jval">${rewardChips(q)}</span></div>
        ${footer}`;
    }
  }

  return `
    <h3>${PANEL_TITLES.quests}</h3>
    <div class="journal-tabs">
      ${tabBtn('story', '📜 The Chronicle', story)}
      ${tabBtn('main', '⚔️ Guild', main)}
      ${tabBtn('side', '🤝 Side', side)}
    </div>
    ${trackHtml}
    <div class="journal-grid">
      <div class="journal-list">${listHtml}</div>
      <div class="journal-detail">${detailHtml}</div>
    </div>`;
}

function wirePanelBody(kind: PanelKind, el: HTMLElement, p: Player, refresh: () => void, ctx: PanelCtx): void {
  if (kind === 'quests') {
    el.querySelectorAll<HTMLElement>('[data-jtab]').forEach(b => b.onclick = () => {
      journalTab = b.dataset.jtab as JournalTab;
      journalSel = null;
      refresh();
    });
    el.querySelectorAll<HTMLElement>('[data-jq]').forEach(b => b.onclick = () => {
      journalSel = b.dataset.jq!;
      refresh();
    });
  } else if (kind === 'evotree') {
    wireEvoTree(el, p);
  } else if (kind === 'player') {
    const btn = el.querySelector<HTMLElement>('#open-guild-card');
    if (btn) btn.onclick = async () => {
      await openGuildCard(p, () => { /* photo changed */ });
      refresh(); // reflect a new portrait immediately
    };
  } else if (kind === 'inventory') {
    el.querySelectorAll<HTMLElement>('[data-use]').forEach(b => b.onclick = async () => {
      await useItemFlow(p, b.dataset.use!, refresh);
    });
  } else if (kind === 'guardians') {
    el.querySelectorAll<HTMLElement>('[data-bench]').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.bench!);
      if (p.party.length > 1) { p.reserve.push(p.party.splice(i, 1)[0]); refresh(); }
    });
    el.querySelectorAll<HTMLElement>('[data-promote]').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.promote!);
      if (p.party.length < 3) { p.party.push(p.reserve.splice(i, 1)[0]); refresh(); }
    });
    el.querySelectorAll<HTMLElement>('[data-detail2]').forEach(b => b.onclick = () => {
      const [where, i] = b.dataset.detail2!.split(':');
      const g = where === 'party' ? p.party[+i] : p.reserve[+i];
      showGuardianDetail(g, refresh);
    });
  } else if (kind === 'crawler') {
    el.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = () => {
      p.crawler.equip(b.dataset.equip!);
      toast('Part equipped.');
      refresh();
    });
  }
}

function initPreview3D(container: HTMLElement, speciesId: string): () => void {
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 180;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 10);
  camera.position.set(0, 1.4, 3.6);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  const rig = makeGuardian(speciesId);
  rig.group.position.set(0, 0.1, 0);
  scene.add(rig.group);

  let active = true;
  let lastTime = performance.now();

  function animate() {
    if (!active) return;
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    rig.group.rotation.y += dt * 0.45;
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

  return () => {
    active = false;
    disposeRig(rig);
    renderer.dispose();
    canvas.remove();
  };
}

function showGuardianDetail(g: Guardian, back: () => void): void {
  const s = g.stats;
  const statRows = (Object.keys(STAT_NAMES) as StatKey[]).map(k =>
    `<div class="row" style="display:flex;justify-content:space-between;padding:2px 0">
      <span class="sub">${STAT_NAMES[k]}</span><b>${s[k]}${g.bonus[k] ? ` <span class="goldcol">(+${g.bonus[k]})</span>` : ''}</b></div>`).join('');
  const techRows = g.techniques.map(t =>
    `<div class="list-row"><div style="flex:1"><b style="color:${TYPE_CSS[t.type]}">${t.name}</b>
      <span class="sub">${t.kind === 'phys' ? 'Physical' : 'Art'} · Pow ${t.power} · ${t.spCost} SP</span>
      <div class="sub">${t.desc}</div></div></div>`).join('');
  const evo = g.species.evolvesTo;
  
  openScreen(`
    <h3>${g.nickname} — ${g.species.name} ${typeTag(g)} ${elementChipsHTML(g.speciesId)}</h3>
    <div class="sub" style="margin-bottom:8px">${g.species.desc}</div>
    <div class="grid2">
      <div>
        <div id="guardian-preview-3d" style="width:100%;height:180px;background:rgba(0,0,0,0.35);border:1px solid var(--ui-border);border-radius:8px;margin-bottom:12px;overflow:hidden;"></div>
        <h3>Stats — Lv${g.level}/${g.levelCap} (${g.species.stage})</h3>
        ${statRows}
        <div class="sub" style="margin-top:6px">EXP: ${g.exp} / ${expForLevel(g.level + 1)} (${g.expToNext} to next)</div>
        <div class="sub">Technique Points: <b class="goldcol">${g.techPoints}</b></div>
        ${evo ? `<div class="sub">Evolves to <b>${SPECIES[evo.species]?.name ?? evo.species}</b> at Lv${evo.level}</div>` : '<div class="sub">Final form.</div>'}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3>Techniques</h3>
          <button class="ui-btn primary" id="detail-manage-techs" style="font-size:12px;padding:4px 12px">Manage (TP: ${g.techPoints})</button>
        </div>
        <div style="max-height:300px;overflow-y:auto">${techRows}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <button class="ui-btn primary" id="detail-back">Back</button>
    </div>`);

  // Initialize 3D Preview
  const container = $('guardian-preview-3d');
  let disposePreview: (() => void) | null = null;
  if (container) {
    disposePreview = initPreview3D(container, g.speciesId);
  }

  const handleBack = () => {
    if (disposePreview) disposePreview();
    back();
  };

  $('detail-back').onclick = handleBack;
  
  $('detail-manage-techs').onclick = () => {
    if (disposePreview) disposePreview();
    showTechniqueManagement(g, () => showGuardianDetail(g, back));
  };
}

function showTechniqueManagement(g: Guardian, back: () => void): void {
  const render = () => {
    const learnedRows = g.techniques.map((t, idx) => {
      const canUnlearn = g.techniques.length > 1; // Must keep at least 1 move
      return `
        <div class="list-row">
          <div style="flex:1">
            <b style="color:${TYPE_CSS[t.type]}">${t.name}</b>
            <span class="sub">${t.kind === 'phys' ? 'Physical' : 'Art'} · Pow ${t.power} · ${t.spCost} SP</span>
            <div class="sub">${t.desc}</div>
          </div>
          <button class="ui-btn danger" data-unlearn="${t.id}" ${canUnlearn ? '' : 'disabled'}>Unlearn</button>
        </div>`;
    }).join('');

    const learnable = g.species.techs
      .filter(t => t.level <= g.level && !g.learnedTechs.includes(t.tech))
      .map(t => TECHS[t.tech])
      .filter(Boolean);

    const learnableRows = learnable.map(t => {
      const canLearn = g.techPoints > 0 && g.learnedTechs.length < 4;
      return `
        <div class="list-row">
          <div style="flex:1">
            <b style="color:${TYPE_CSS[t.type]}">${t.name}</b>
            <span class="sub">${t.kind === 'phys' ? 'Physical' : 'Art'} · Pow ${t.power} · ${t.spCost} SP</span>
            <div class="sub">${t.desc}</div>
          </div>
          <button class="ui-btn primary" data-learn="${t.id}" ${canLearn ? '' : 'disabled'}>Learn</button>
        </div>`;
    }).join('') || '<div class="sub">No new techniques available to learn at this level.</div>';

    const el = openScreen(`
      <h3>Manage Techniques — ${g.nickname}</h3>
      <div class="sub" style="margin-bottom:12px">
        Technique Points: <b class="goldcol">${g.techPoints}</b> · Active Slots: <b>${g.learnedTechs.length}/4</b>
      </div>
      <div class="grid2">
        <div>
          <h3>Active Moves (${g.learnedTechs.length}/4)</h3>
          <div style="max-height:340px;overflow-y:auto">${learnedRows}</div>
        </div>
        <div>
          <h3>Learnable Moves</h3>
          <div style="max-height:340px;overflow-y:auto">${learnableRows}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="ui-btn primary" id="tech-back">Back to Info</button>
      </div>`);

    el.querySelectorAll<HTMLElement>('[data-unlearn]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.unlearn!;
        const idx = g.learnedTechs.indexOf(id);
        if (idx >= 0) {
          g.learnedTechs.splice(idx, 1);
          g.techPoints++; // Refund point!
          toast(`Unlearned ${TECHS[id].name}.`, 'gold');
          render();
        }
      };
    });

    el.querySelectorAll<HTMLElement>('[data-learn]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.learn!;
        if (g.techPoints > 0 && g.learnedTechs.length < 4) {
          g.learnedTechs.push(id);
          g.techPoints--;
          toast(`Learned ${TECHS[id].name}!`, 'gold');
          render();
        }
      };
    });

    $('tech-back').onclick = back;
  };
  
  render();
}

async function useItemFlow(player: Player, itemId: string, refresh: () => void): Promise<void> {
  const it = ITEMS[itemId];
  const targets = it.kind === 'revive' ? player.party.filter(g => g.fainted) : player.party.filter(g => !g.fainted);
  if (!targets.length) { toast('No valid target.', 'red'); return; }
  const names = targets.map(g => `${g.nickname} (Lv${g.level}, ${g.hp}/${g.stats.hp} HP)`);
  closeMenu();
  const pick = await choose('', `Use ${it.name} on which Guardian?`, [...names, 'Cancel']);
  if (pick < targets.length) {
    toast(applyItem(player, itemId, targets[pick]), 'gold');
  }
  refresh();
}

export function applyItem(player: Player, itemId: string, g: Guardian): string {
  const it = ITEMS[itemId];
  player.removeItem(itemId);
  const s = g.stats;
  if (it.kind === 'heal') { const before = g.hp; g.hp = Math.min(s.hp, g.hp + it.value); return `${g.nickname} recovered ${g.hp - before} HP!`; }
  if (it.kind === 'sp') { const before = g.sp; g.sp = Math.min(s.sp, g.sp + it.value); return `${g.nickname} recovered ${g.sp - before} SP!`; }
  if (it.kind === 'revive') { g.hp = Math.floor(s.hp * it.value); return `${g.nickname} was revived!`; }
  if (it.kind === 'boost' && it.boostStat) {
    g.bonus[it.boostStat] += it.value;
    if (it.boostStat === 'hp') g.hp += it.value;
    return `${g.nickname}'s ${STAT_NAMES[it.boostStat]} rose permanently!`;
  }
  return 'Nothing happened.';
}

// ---------------- pause hub (Esc) ----------------
export function openPauseMenu(player: Player, opts: { canSave: boolean }): Promise<void> {
  return new Promise(resolve => {
    const close = () => { closeMenu(); window.removeEventListener('keydown', esc); resolve(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);

    const el = openScreen(`
      <h3>⛺ ${player.tamerName} — Field Menu</h3>
      <div class="sub" style="margin-bottom:10px"><span class="goldcol">◆ ${player.shards} Shards</span> · Battles won: ${player.battlesWon} · Befriended: ${player.capturesMade}</div>
      <div class="hub-grid">
        <button class="ui-btn" data-hub="player">🧭 Tamer Data <span class="sub">(P)</span></button>
        <button class="ui-btn" data-hub="inventory">🎒 Inventory <span class="sub">(I)</span></button>
        <button class="ui-btn" data-hub="guardians">🐾 Guardians <span class="sub">(G)</span></button>
        <button class="ui-btn" data-hub="crawler">🛞 Crawler <span class="sub">(C)</span></button>
        <button class="ui-btn" data-hub="quests">📖 Quest Journal <span class="sub">(J)</span></button>
        <button class="ui-btn" data-hub="evotree">🧬 Evolution Atlas <span class="sub">(V)</span></button>
        <button class="ui-btn" id="hub-sound">${isMuted() ? '🔇 Sound: OFF' : '🔊 Sound: ON'} <span class="sub">(N)</span></button>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        ${opts.canSave ? '<button class="ui-btn" id="hub-save">💾 Save Game</button>' : ''}
        <button class="ui-btn primary" id="hub-close">Resume (Esc)</button>
      </div>`);
    el.querySelectorAll<HTMLElement>('[data-hub]').forEach(b => b.onclick = async () => {
      window.removeEventListener('keydown', esc);
      closeMenu();
      await openPanel(b.dataset.hub as PanelKind, player, { canSave: opts.canSave });
      resolve();
    });
    const save = el.querySelector<HTMLElement>('#hub-save');
    if (save) save.onclick = () => { player.save(); toast('Game saved.', 'gold'); };
    const snd = el.querySelector<HTMLElement>('#hub-sound');
    if (snd) snd.onclick = () => {
      const m = toggleMute();
      snd.innerHTML = `${m ? '🔇 Sound: OFF' : '🔊 Sound: ON'} <span class="sub">(N)</span>`;
    };
    (el.querySelector('#hub-close') as HTMLElement).onclick = close;
  });
}

// ---------------- background story box ----------------
let storyTimeout: any = null;
let storyQueue: [string, string][] = [];
let storyActive = false;

export function setStoryInBattle(inBattle: boolean): void {
  const box = $('story-box');
  if (box) {
    box.classList.toggle('in-battle', inBattle);
  }
}

export function hideStory(): void {
  const box = $('story-box');
  if (box) box.style.display = 'none';
  storyActive = false;
  if (storyTimeout) clearTimeout(storyTimeout);
}

export function showStoryLine(speaker: string, text: string, durationMs = 6000): Promise<void> {
  return new Promise(resolve => {
    const box = $('story-box');
    if (!box) { resolve(); return; }
    box.style.display = 'block';
    const sp = $('story-speaker');
    if (sp) sp.textContent = speaker;
    const txt = $('story-text');
    if (txt) {
      txt.textContent = '';
      let i = 0;
      const iv = setInterval(() => {
        if (i >= text.length) {
          clearInterval(iv);
          txt.textContent = text;
        } else {
          txt.textContent = text.slice(0, ++i);
        }
      }, 12);

      if (storyTimeout) clearTimeout(storyTimeout);
      storyTimeout = setTimeout(() => {
        clearInterval(iv);
        box.style.display = 'none';
        resolve();
      }, durationMs);
    } else {
      resolve();
    }
  });
}

export async function playStorySequence(lines: [string, string][], durationPerLine = 6500): Promise<void> {
  storyQueue.push(...lines);
  if (storyActive) return;
  storyActive = true;
  while (storyQueue.length > 0) {
    const [speaker, text] = storyQueue.shift()!;
    await showStoryLine(speaker, text, durationPerLine);
    await new Promise(r => setTimeout(r, 800)); // gap between lines
  }
  storyActive = false;
}
