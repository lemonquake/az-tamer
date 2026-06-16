// ============================================================
// AZ Tamer — DOM UI: dialogue, HUD, hotkey panels (P/I/G/C),
// toasts, name input
// ============================================================
import * as THREE from 'three';
import { ITEMS, CRAWLER_PARTS, CRAWLER_SLOTS, CRAWLER_SLOT_INFO, TYPE_CSS, STAT_NAMES, HOUSES, DUNGEONS, expForLevel, SPECIES, TECHS, elementChipsHTML, type StatKey, type CrawlerSlot, getSpeciesPassive } from './data';
import { Player, Guardian } from './state';
import { makeGuardian, disposeRig, makeCrawler, disposeCrawler } from './models';
import { GUILD_LORE, avatarURL, guildIconURL, rankFor, questsDoneCount } from './guilds';
import { journalEntries, questProgress, type QuestDef, type QuestState } from './quests';
import { openGuildCard } from './guildcard';
import { openGuardianCard } from './guardiancard';
import { RANKS, rankIndexFor, rankBadgeHTML, rankLadderHTML } from './ranks';
import { evoTreeHTML, wireEvoTree } from './evotree';
import { checkAchievements, achievementsHTML } from './achievements';
import { sfx, toggleMute, isMuted, getMusicVolume, getSoundVolume, setMusicVolume, setSoundVolume } from './audio';
import { openTutorialReplayMenu } from './tutorial';

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

let lastHUDPlayer: Player | null = null;
let lastHUDZone = '';
let lastHUDExtra: { floor?: number } | undefined = undefined;

export function refreshHUD(): void {
  if (lastHUDPlayer) {
    updateHUD(lastHUDPlayer, lastHUDZone, lastHUDExtra);
  }
}

export function updateHUD(player: Player, zone: string, extra?: { floor?: number }): void {
  lastHUDPlayer = player;
  lastHUDZone = zone;
  lastHUDExtra = extra;
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

export function showHotkeys(on: boolean, dungeon = false, regions = false): void {
  const el = $('hotkeys');
  el.style.display = on ? 'flex' : 'none';
  el.innerHTML = [
    '<b>P</b> Tamer', '<b>I</b> Items', '<b>G</b> Guardians', '<b>C</b> Crawler', '<b>J</b> Journal', '<b>V</b> Evolutions',
    ...(dungeon ? ['<b>M</b> Map'] : []),
    ...(regions ? ['<b>T</b> Regions'] : []),
    '<b>N</b> Sound', '<b>Esc</b> Menu',
  ].map(s => `<span>${s}</span>`).join('');

  el.style.pointerEvents = 'auto';
  el.querySelectorAll('span').forEach(span => {
    span.style.cursor = 'pointer';
    span.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = span.querySelector('b');
      if (b) {
        const keyText = b.textContent || '';
        const key = keyText.toLowerCase();
        const simulatedKey = key === 'esc' ? 'escape' : key;
        const event = new KeyboardEvent('keydown', {
          key: simulatedKey,
          code: simulatedKey === 'escape' ? 'Escape' : `Key${key.toUpperCase()}`,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      }
    };
  });
}

export function getActivePlayer(): Player | undefined {
  return (window as any).__getActivePlayer ? (window as any).__getActivePlayer() : undefined;
}

export function applyGraphicsSettings(): void {
  const renderer = (window as any).__renderer;
  if (!renderer) return;

  const isLow = localStorage.getItem('graphicsMode') === 'low';
  if (isLow) {
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1.0);
  } else {
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export async function executeCheatFlow(player: Player): Promise<void> {
  try {
    const code = await askName('Enter Cheat Code');
    if (!code) return;
    if (code.toLowerCase() === 'lemonquake') {
      // Apply cheat: Lineup (current party) receives 10 levels
      player.party.forEach(g => {
        const targetLevel = Math.min(g.levelCap, g.level + 10);
        const levelsGained = targetLevel - g.level;
        g.level = targetLevel;
        g.exp = expForLevel(g.level);
        
        // Add tech points for any multiples of 5 reached
        for (let lvl = targetLevel - levelsGained + 1; lvl <= targetLevel; lvl++) {
          if (lvl % 5 === 0) {
            g.techPoints++;
          }
        }
        
        // Unlock any techniques learned up to the new level
        const newTechs = g.species.techs
          .filter(t => t.level <= g.level)
          .map(t => t.tech);
        
        newTechs.forEach(techId => {
          if (!g.learnedTechs.includes(techId)) {
            g.learnedTechs.push(techId);
          }
        });
        
        g.hp = g.stats.hp;
        g.sp = g.stats.sp;
      });

      // Receive 10 pieces of 3 items important for battle: Grand Elixir, Spirit Soda+, Dawn Leaf
      player.inventory.set('elixir', (player.inventory.get('elixir') ?? 0) + 10);
      player.inventory.set('soda_plus', (player.inventory.get('soda_plus') ?? 0) + 10);
      player.inventory.set('revive_leaf', (player.inventory.get('revive_leaf') ?? 0) + 10);

      // Give player 5000 gold (shards) and 5x ultra rare gifting items (Aether Confit)
      player.shards += 5000;
      player.inventory.set('aether_confit', (player.inventory.get('aether_confit') ?? 0) + 5);

      player.save(false);
      refreshHUD();
      toast('Cheat Activated: Lineup +10 Levels, +30 items, +5000 Shards, +5 Aether Confit!', 'gold');
    } else if (code.toLowerCase() === 'gold') {
      player.shards += 10000;
      player.save(false);
      refreshHUD();
      toast('Cheat Activated: +10,000 Shards!', 'gold');
    } else {
      toast('Invalid Cheat Code', 'red');
    }
  } catch (err) {
    console.error('Cheat system error:', err);
  }
}

export function showInteractHint(text: string | null): void {
  const el = $('interact-hint');
  if (!text) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = text;
}

// ---------------- screens ----------------
let menuOpen = false;
let optionsOpen = false;
export const isMenuOpen = () => menuOpen || optionsOpen;
export const isOptionsOpen = () => optionsOpen;

export function openOptionsMenu(player?: Player): Promise<void> {
  return new Promise(resolve => {
    optionsOpen = true;
    const activePlayer = player || getActivePlayer();
    
    const modal = $('options-modal');
    const musicSlider = $<HTMLInputElement>('opt-music-slider');
    const soundSlider = $<HTMLInputElement>('opt-sound-slider');
    const musicVal = $('opt-music-val');
    const soundVal = $('opt-sound-val');
    const muteBtn = $('opt-mute-btn');
    const mobileBtn = $('opt-mobile-btn');
    const perfBtn = $('opt-perf-btn');
    const autosaveBtn = $('opt-autosave-btn');
    const cheatRow = $('opt-cheat-row');
    const cheatBtn = $('opt-cheat-btn');
    const closeBtn = $('opt-close-btn');

    // 1. Load current values
    const initialMusic = getMusicVolume();
    const initialSound = getSoundVolume();
    
    musicSlider.value = String(initialMusic);
    musicVal.textContent = `${initialMusic}%`;
    
    soundSlider.value = String(initialSound);
    soundVal.textContent = `${initialSound}%`;

    const updateMuteBtnLabel = () => {
      const muted = isMuted();
      muteBtn.textContent = muted ? 'Muted: ON' : 'Muted: OFF';
      muteBtn.style.borderColor = muted ? 'var(--ui-red)' : 'var(--ui-border)';
    };
    updateMuteBtnLabel();

    const updateMobileBtnLabel = () => {
      const isMob = localStorage.getItem('mobileMode') === 'true';
      mobileBtn.textContent = isMob ? 'Controls: ON' : 'Controls: OFF';
      mobileBtn.style.borderColor = isMob ? 'var(--ui-gold)' : 'var(--ui-border)';
    };
    updateMobileBtnLabel();

    const updatePerfBtnLabel = () => {
      const isLow = localStorage.getItem('graphicsMode') === 'low';
      perfBtn.textContent = isLow ? 'FPS Boost: ON' : 'FPS Boost: OFF';
      perfBtn.style.borderColor = isLow ? 'var(--ui-green)' : 'var(--ui-border)';
    };
    updatePerfBtnLabel();

    const updateAutosaveBtnLabel = () => {
      const active = localStorage.getItem('autosaveMode') !== 'false';
      autosaveBtn.textContent = active ? 'Auto-Save: ON' : 'Auto-Save: OFF';
      autosaveBtn.style.borderColor = active ? 'var(--ui-gold)' : 'var(--ui-border)';
    };
    updateAutosaveBtnLabel();

    if (activePlayer) {
      cheatRow.style.display = 'flex';
      cheatBtn.onclick = async () => {
        modal.style.display = 'none';
        optionsOpen = false;
        await executeCheatFlow(activePlayer);
        optionsOpen = true;
        modal.style.display = 'flex';
      };
    } else {
      cheatRow.style.display = 'none';
    }

    modal.style.display = 'flex';

    // 2. Attach events
    musicSlider.oninput = () => {
      const val = parseInt(musicSlider.value, 10);
      musicVal.textContent = `${val}%`;
      setMusicVolume(val);
    };

    soundSlider.oninput = () => {
      const val = parseInt(soundSlider.value, 10);
      soundVal.textContent = `${val}%`;
      setSoundVolume(val);
    };
    
    soundSlider.onchange = () => {
      sfx('click');
    };

    muteBtn.onclick = () => {
      toggleMute();
      updateMuteBtnLabel();
    };

    mobileBtn.onclick = () => {
      const isMob = localStorage.getItem('mobileMode') === 'true';
      const nextMob = !isMob;
      localStorage.setItem('mobileMode', nextMob ? 'true' : 'false');
      
      // Auto-enable low-power mode if mobile controls are turned OFF on a mobile/touch device
      if (!nextMob) {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isMobileDevice) {
          localStorage.setItem('graphicsMode', 'low');
        }
      }

      updateMobileBtnLabel();
      updatePerfBtnLabel();
      applyGraphicsSettings();
      import('./mobile').then(m => m.initMobileControls());
    };

    perfBtn.onclick = () => {
      const isLow = localStorage.getItem('graphicsMode') === 'low';
      localStorage.setItem('graphicsMode', isLow ? 'high' : 'low');
      updatePerfBtnLabel();
      applyGraphicsSettings();
    };

    autosaveBtn.onclick = () => {
      const active = localStorage.getItem('autosaveMode') !== 'false';
      localStorage.setItem('autosaveMode', active ? 'false' : 'true');
      updateAutosaveBtnLabel();
    };

    const close = () => {
      modal.style.display = 'none';
      musicSlider.oninput = null;
      soundSlider.oninput = null;
      soundSlider.onchange = null;
      muteBtn.onclick = null;
      mobileBtn.onclick = null;
      perfBtn.onclick = null;
      autosaveBtn.onclick = null;
      cheatBtn.onclick = null;
      closeBtn.onclick = null;
      optionsOpen = false;
      resolve();
    };

    closeBtn.onclick = close;
  });
}

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
      if (save) save.onclick = () => { player.save(false); toast('Game saved.', 'gold'); };
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
    return renderInventory(p);
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
  return renderCrawler(p);
}

// ================= the Crawler workshop =================
// A live 3D turntable of YOUR Crawler (current parts and paint),
// a six-slot loadout board, and a per-slot equip bay.
let crawlerSlotSel: CrawlerSlot = 'hull';

function renderCrawler(p: Player): string {
  const c = p.crawler;
  const maxTier = (slot: CrawlerSlot) => Math.max(...Object.values(CRAWLER_PARTS).filter(x => x.slot === slot).map(x => x.tier));

  const slotCard = (slot: CrawlerSlot) => {
    const info = CRAWLER_SLOT_INFO[slot];
    const part = c.part(slot);
    const top = maxTier(slot);
    const pips = Array.from({ length: top }, (_, i) => `<span class="${i < part.tier ? 'on' : ''}">●</span>`).join('');
    const ownedCount = Object.values(CRAWLER_PARTS).filter(x => x.slot === slot && c.owned.includes(x.id)).length;
    return `
      <div class="cr-slot ${slot === crawlerSlotSel ? 'sel' : ''}" data-slot="${slot}" title="${info.blurb}">
        <div class="cr-slot-icon">${info.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="cr-slot-label">${info.label}</div>
          <div class="cr-slot-part">${part.name}</div>
          <div class="cr-tier">${pips} <span class="sub">T${part.tier}${ownedCount > 1 ? ` · ${ownedCount} owned` : ''}</span></div>
        </div>
      </div>`;
  };

  const info = CRAWLER_SLOT_INFO[crawlerSlotSel];
  const ownedParts = Object.values(CRAWLER_PARTS)
    .filter(x => x.slot === crawlerSlotSel && c.owned.includes(x.id)).sort((a, b) => a.tier - b.tier);
  const bayRows = ownedParts.map(part => {
    const equipped = c.parts[crawlerSlotSel] === part.id;
    return `<div class="list-row"><div style="flex:1"><b>${part.name}</b> <span class="sub">T${part.tier}</span><div class="sub">${part.desc}</div></div>
      ${equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>' : `<button class="ui-btn" data-equip="${part.id}">Equip</button>`}</div>`;
  }).join('');

  const stat = (label: string, val: string) =>
    `<div class="row" style="display:flex;justify-content:space-between;padding:2px 0"><span class="sub">${label}</span><b>${val}</b></div>`;

  return `
    <h3>${PANEL_TITLES.crawler} — Workshop</h3>
    <div class="cr-layout">
      <div>
        <div id="crawler-preview-3d" class="cr-preview"></div>
        <div class="row" style="display:flex;justify-content:space-between;margin-top:8px"><span class="sub">Hull</span><b>${c.hull}/${c.hullMax}</b></div>
        <div class="bar hull"><div style="width:${(c.hull / c.hullMax) * 100}%"></div></div>
        <div class="row" style="display:flex;justify-content:space-between"><span class="sub">Energy</span><b>${c.energy}/${c.energyMax}</b></div>
        <div class="bar energy"><div style="width:${(c.energy / c.energyMax) * 100}%"></div></div>
        <div style="margin-top:8px">
          ${stat('Cargo capacity', `${p.inventory.size}/${c.cargoMax} stacks`)}
          ${stat('Cannon', `T${c.cannonTier} · ${Math.round(c.firstStrikeChance * 100)}% first strike`)}
          ${stat('Scanner', `T${c.scannerTier} reveal`)}
          ${stat('Stride', `${Math.round(c.strideEfficiency * 100)}% free steps`)}
        </div>
      </div>
      <div>
        <div class="cr-slots">${CRAWLER_SLOTS.map(slotCard).join('')}</div>
        <div class="cr-bay">
          <div class="jdetail-kicker" style="margin-bottom:4px">${info.icon} ${info.label} bay</div>
          <div class="sub" style="margin-bottom:8px">${info.blurb}</div>
          <div style="max-height:170px;overflow-y:auto">${bayRows}</div>
        </div>
      </div>
    </div>
    <div class="sub" style="margin-top:8px">New parts and paint jobs are sold at Dax's Garage, east lane of Haven City.</div>`;
}

/** Rotating 3D turntable of the player's own Crawler. Self-disposes
 *  when its canvas leaves the DOM (panel re-render or close). */
function initCrawlerPreview3D(container: HTMLElement, player: Player): void {
  const width = container.clientWidth || 320;
  const height = container.clientHeight || 210;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
  camera.position.set(0, 2.1, 5.4);
  camera.lookAt(0, 0.7, 0);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6a8af2, 0.8);
  rim.position.set(-3, 2, -4);
  scene.add(rim);

  const crawler = makeCrawler({ parts: player.crawler.parts, paint: player.crawler.paint });
  scene.add(crawler);

  let last = performance.now();
  const dispose = () => {
    disposeCrawler(crawler);
    crawler.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => m?.dispose());
    });
    renderer.dispose();
    canvas.remove();
  };
  const animate = () => {
    if (!canvas.isConnected) { dispose(); return; }
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    crawler.rotation.y += dt * 0.5;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);
}

// ================= the cargo hold (inventory) =================
// A tabbed grid of item tiles with a detail dossier: select a tile to
// inspect, Use, or Drop it. Tabs split the hold by item family; Sort
// cycles ordering. Quest relics can never be dropped.
type InvTab = 'all' | 'consume' | 'gift' | 'crawler' | 'gem' | 'key';
type InvSort = 'kind' | 'name' | 'qty';
let invTab: InvTab = 'all';
let invSort: InvSort = 'kind';
let invSel: string | null = null;

const INV_TABS: Record<InvTab, { label: string; icon: string; kinds: string[] }> = {
  all:     { label: 'All',         icon: '🎒', kinds: [] },
  consume: { label: 'Consumables', icon: '🧪', kinds: ['heal', 'sp', 'revive'] },
  gift:    { label: 'Gifts',       icon: '🎁', kinds: ['gift'] },
  crawler: { label: 'Crawler',     icon: '🛞', kinds: ['fuel', 'repair'] },
  gem:     { label: 'Gems',        icon: '💎', kinds: ['boost', 'feast', 'evo'] },
  key:     { label: 'Key & Quest', icon: '📜', kinds: ['relic'] },
};
const KIND_ICONS: Record<string, string> = {
  heal: '🧪', sp: '🥤', revive: '🍃', gift: '🎁', fuel: '🔋', repair: '🛠️', boost: '💎', feast: '🍱', evo: '🧬', relic: '📜',
};
const ITEM_ICONS: Record<string, string> = {
  tonic: '🧪', tonic_plus: '⚗️', elixir: '✨', soda: '🥤', soda_plus: '🧋', soda_max: '🍶', revive_leaf: '🍃',
  revive_bloom: '🌺', berry: '🫐', honey_roll: '🥐', star_treat: '🌟', aether_confit: '🍬',
  cell: '🔋', cell_plus: '⚡', cell_max: '🌩️', plating: '🛡️', plating_plus: '🔰',
  atk_gem: '🔴', def_gem: '🟡', spd_gem: '⚪', wis_gem: '🔵', hp_gem: '🟢', sp_gem: '🟣', prism_gem: '💎',
  storm_amber: '🟠', sea_chart: '🗺️', stormheart_coil: '🌀',
  fish_grill: '🐟', fish_smoke: '🍥', fish_stew: '🍲', fish_sashimi: '🍣', fish_roe: '🍱', fish_legend: '🎏',
};
export const itemIcon = (id: string): string => ITEM_ICONS[id] ?? KIND_ICONS[ITEMS[id]?.kind] ?? '📦';

const KIND_LABEL: Record<string, string> = {
  heal: 'Consumable · Healing', sp: 'Consumable · Spirit', revive: 'Consumable · Revival',
  gift: 'Gift — builds bond with wild Guardians', fuel: 'Crawler — Energy', repair: 'Crawler — Hull',
  boost: 'Gem — permanent stat boost', feast: 'Feast — permanent ALL-stat boost', evo: 'Evolution catalyst', relic: 'Quest Relic — cannot be dropped',
};
const KIND_ORDER = ['heal', 'sp', 'revive', 'gift', 'fuel', 'repair', 'boost', 'feast', 'evo', 'relic'];

function renderInventory(p: Player): string {
  const entries = [...p.inventory.entries()].filter(([id]) => ITEMS[id]);
  const inTab = (id: string) => invTab === 'all' || INV_TABS[invTab].kinds.includes(ITEMS[id].kind);
  const list = entries.filter(([id]) => inTab(id));
  list.sort(([a, qa], [b, qb]) => {
    if (invSort === 'name') return ITEMS[a].name.localeCompare(ITEMS[b].name);
    if (invSort === 'qty') return qb - qa;
    return (KIND_ORDER.indexOf(ITEMS[a].kind) - KIND_ORDER.indexOf(ITEMS[b].kind)) || ITEMS[a].name.localeCompare(ITEMS[b].name);
  });

  if (invSel && !list.some(([id]) => id === invSel)) invSel = list[0]?.[0] ?? null;
  if (!invSel && list.length) invSel = list[0][0];

  const tabs = (Object.keys(INV_TABS) as InvTab[]).map(t => {
    const count = t === 'all' ? entries.length : entries.filter(([id]) => INV_TABS[t].kinds.includes(ITEMS[id].kind)).length;
    return `<button class="jtab ${invTab === t ? 'on' : ''}" data-itab="${t}">${INV_TABS[t].icon} ${INV_TABS[t].label} <span class="jcount">${count}</span></button>`;
  }).join('');

  const tiles = list.map(([id, qty]) => `
    <div class="inv-tile ${id === invSel ? 'sel' : ''} ${ITEMS[id].kind === 'relic' ? 'relic' : ''}" data-item="${id}" title="${ITEMS[id].name}">
      <div class="inv-icon">${itemIcon(id)}</div>
      <div class="inv-name">${ITEMS[id].name}</div>
      <div class="inv-qty">×${qty}</div>
    </div>`).join('') || '<div class="sub" style="grid-column:1/-1;padding:18px;text-align:center">Nothing in this pocket of the cargo hold.</div>';

  // detail dossier for the selected item
  let detail = '<div class="sub">Select an item to inspect it.</div>';
  if (invSel) {
    const it = ITEMS[invSel];
    const qty = p.itemCount(invSel);
    const usable = ['heal', 'sp', 'revive', 'boost', 'feast'].includes(it.kind);
    const droppable = it.kind !== 'relic';
    detail = `
      <div class="jdetail-head">
        <div class="jdetail-icon">${itemIcon(invSel)}</div>
        <div style="flex:1">
          <div class="jdetail-kicker">${KIND_LABEL[it.kind] ?? it.kind}</div>
          <div class="jdetail-title">${it.name} <span class="sub" style="font-size:13px">×${qty}</span></div>
        </div>
      </div>
      <div class="jdetail-brief">${it.desc}</div>
      ${it.price ? `<div class="jrow"><span class="jkey">Value</span><span class="jval goldcol">◆ ${it.price} (sells nowhere — yet)</span></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${usable ? `<button class="ui-btn primary" data-use="${invSel}">Use</button>` : ''}
        ${droppable ? `<button class="ui-btn danger" data-drop="${invSel}">Drop</button>` : '<span class="sub" style="align-self:center">Quest relics stay with you.</span>'}
      </div>`;
  }

  const capPct = Math.min(100, (p.inventory.size / p.crawler.cargoMax) * 100);
  return `
    <div style="display:flex;align-items:center;gap:14px">
      <h3 style="margin:0">${PANEL_TITLES.inventory}</h3>
      <div style="flex:1;display:flex;align-items:center;gap:8px">
        <div class="jbar ${capPct >= 100 ? 'full' : ''}" style="flex:1;margin:0"><div style="width:${capPct}%"></div></div>
        <span class="sub" style="white-space:nowrap">${p.inventory.size}/${p.crawler.cargoMax} stacks</span>
      </div>
      <button class="ui-btn" id="inv-sort" style="font-size:12px;padding:5px 12px">⇅ Sort: ${invSort === 'kind' ? 'Type' : invSort === 'name' ? 'Name' : 'Quantity'}</button>
    </div>
    <div class="journal-tabs" style="margin-top:10px">${tabs}</div>
    <div class="inv-layout">
      <div class="inv-grid">${tiles}</div>
      <div class="journal-detail" style="max-height:380px">${detail}</div>
    </div>
    <div class="sub" style="margin-top:8px">A larger Cargo part at Dax's Garage raises how many stacks you can haul.</div>`;
}

function wireInventory(el: HTMLElement, p: Player, refresh: () => void): void {
  el.querySelectorAll<HTMLElement>('[data-itab]').forEach(b => b.onclick = () => { invTab = b.dataset.itab as InvTab; refresh(); });
  el.querySelectorAll<HTMLElement>('[data-item]').forEach(b => b.onclick = () => { invSel = b.dataset.item!; refresh(); });
  const sort = el.querySelector<HTMLElement>('#inv-sort');
  if (sort) sort.onclick = () => {
    invSort = invSort === 'kind' ? 'name' : invSort === 'name' ? 'qty' : 'kind';
    refresh();
  };
  el.querySelectorAll<HTMLElement>('[data-use]').forEach(b => b.onclick = async () => {
    await useItemFlow(p, b.dataset.use!, refresh);
  });
  el.querySelectorAll<HTMLElement>('[data-drop]').forEach(b => b.onclick = async () => {
    const id = b.dataset.drop!;
    const qty = p.itemCount(id);
    closeMenu();
    const opts = qty > 1 ? ['Drop one', `Drop all (×${qty})`, 'Keep it'] : ['Drop it', 'Keep it'];
    const pick = await choose('', `Drop ${ITEMS[id].name}? Whatever you leave behind is gone for good.`, opts);
    if (pick === 0) { p.removeItem(id, 1); toast(`Dropped 1 ${ITEMS[id].name}.`); }
    else if (qty > 1 && pick === 1) { p.removeItem(id, qty); toast(`Dropped all ${ITEMS[id].name}.`); }
    refresh();
  });
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
    wireInventory(el, p, refresh);
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
    const cont = el.querySelector<HTMLElement>('#crawler-preview-3d');
    if (cont) initCrawlerPreview3D(cont, p);
    el.querySelectorAll<HTMLElement>('[data-slot]').forEach(b => b.onclick = () => {
      crawlerSlotSel = b.dataset.slot as CrawlerSlot;
      refresh();
    });
    el.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = () => {
      p.crawler.equip(b.dataset.equip!);
      toast(`${CRAWLER_PARTS[b.dataset.equip!].name} equipped.`, 'gold');
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
  const passive = getSpeciesPassive(g.species);
  
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
        <div class="sub" style="margin-top:8px;border-top:1px dashed var(--ui-border);padding-top:8px">Passive: <b class="goldcol">${passive.name}</b> — <i>${passive.desc}</i></div>
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
    if (it.boostStat === 'sp') g.sp += it.value;
    return `${g.nickname}'s ${STAT_NAMES[it.boostStat]} rose permanently!`;
  }
  if (it.kind === 'feast') {
    (['atk', 'def', 'spd', 'wis'] as StatKey[]).forEach(k => { g.bonus[k] += it.value; });
    g.bonus.hp += it.value * 2; g.bonus.sp += it.value * 2;
    g.hp += it.value * 2; g.sp += it.value * 2;
    return `${g.nickname} feasted on a Legendary Banquet — ALL stats rose permanently!`;
  }
  return 'Nothing happened.';
}

// ---------------- pause hub (Esc) ----------------
export function openPauseMenu(
  player: Player,
  opts: {
    canSave: boolean;
    inDungeon?: boolean;
    floorNum?: number;
    onRetreat?: () => void;
  }
): Promise<void> {
  return new Promise(resolve => {
    const close = () => { closeMenu(); window.removeEventListener('keydown', esc); resolve(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);

    let menuHtml = '';
    if (opts.inDungeon) {
      menuHtml = `
        <h3>🛞 Crawler Mode Menu</h3>
        <div class="sub" style="margin-bottom:10px"><span class="goldcol">◆ ${player.shards} Shards</span> ${opts.floorNum ? `· Floor B${opts.floorNum}F` : ''}</div>
        <div class="hub-grid">
          <button class="ui-btn" data-hub="inventory">🎒 Use Item <span class="sub">(I)</span></button>
          <button class="ui-btn" data-hub="guardians">🐾 Party Setup <span class="sub">(G)</span></button>
          <button class="ui-btn danger" id="hub-retreat">🌀 Teleport Back</button>
          <button class="ui-btn" id="hub-options">⚙️ Options</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          <button class="ui-btn primary" id="hub-close">Resume (Esc)</button>
        </div>`;
    } else {
      menuHtml = `
        <h3>⛺ ${player.tamerName} — Field Menu</h3>
        <div class="sub" style="margin-bottom:10px"><span class="goldcol">◆ ${player.shards} Shards</span> · Battles won: ${player.battlesWon} · Befriended: ${player.capturesMade}</div>
        <div class="hub-grid">
          <button class="ui-btn" data-hub="player">🧭 Tamer Data <span class="sub">(P)</span></button>
          <button class="ui-btn" data-hub="inventory">🎒 Inventory <span class="sub">(I)</span></button>
          <button class="ui-btn" data-hub="guardians">🐾 Guardians <span class="sub">(G)</span></button>
          <button class="ui-btn" data-hub="crawler">🛞 Crawler <span class="sub">(C)</span></button>
          <button class="ui-btn" data-hub="quests">📖 Quest Journal <span class="sub">(J)</span></button>
          <button class="ui-btn" data-hub="evotree">🧬 Evolution Atlas <span class="sub">(V)</span></button>
          <button class="ui-btn" id="hub-tutorial">🎓 Field Manual <span class="sub">(replay tutorials)</span></button>
          <button class="ui-btn" id="hub-options">⚙️ Game Options</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          ${opts.canSave ? '<button class="ui-btn" id="hub-save">💾 Save Game</button>' : ''}
          <button class="ui-btn primary" id="hub-close">Resume (Esc)</button>
        </div>`;
    }

    const el = openScreen(menuHtml);
    el.querySelectorAll<HTMLElement>('[data-hub]').forEach(b => b.onclick = async () => {
      window.removeEventListener('keydown', esc);
      closeMenu();
      await openPanel(b.dataset.hub as PanelKind, player, { canSave: opts.canSave });
      resolve();
    });
    const tut = el.querySelector<HTMLElement>('#hub-tutorial');
    if (tut) tut.onclick = async () => {
      window.removeEventListener('keydown', esc);
      closeMenu();
      await openTutorialReplayMenu(player);
      resolve();
    };
    // a one-time nudge: the Field Manual lives here now, replayable forever
    if (player.flags['tut_basics'] && !player.flags['tut_replay_hint']) {
      player.flags['tut_replay_hint'] = true;
      player.save();
      toast('🎓 New: replay any Field Manual chapter from this menu.', 'gold', 3600);
    }
    const save = el.querySelector<HTMLElement>('#hub-save');
    if (save) save.onclick = () => { player.save(false); toast('Game saved.', 'gold'); };
    
    const retreatBtn = el.querySelector<HTMLElement>('#hub-retreat');
    if (retreatBtn && opts.onRetreat) {
      retreatBtn.onclick = async () => {
        window.removeEventListener('keydown', esc);
        closeMenu();
        resolve();
        opts.onRetreat!();
      };
    }

    const opt = el.querySelector<HTMLElement>('#hub-options');
    if (opt) opt.onclick = async () => {
      window.removeEventListener('keydown', esc);
      closeMenu();
      await openOptionsMenu();
      openPauseMenu(player, opts).then(resolve);
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
