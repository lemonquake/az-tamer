// ============================================================
// AZ Tamer — DOM UI: dialogue, HUD, hotkey panels (P/I/G/C),
// toasts, name input
// ============================================================
import * as THREE from 'three';
import { ITEMS, CRAWLER_PARTS, CRAWLER_SLOTS, CRAWLER_SLOT_INFO, TYPE_CSS, STAT_NAMES, HOUSES, DUNGEONS, expForLevel, SPECIES, TECHS, elementChipsHTML, RARITY_INFO, ULTRA_GRADIENT, type StatKey, type CrawlerSlot, type CrawlerRarity, getSpeciesPassive, ELEMENT_CSS, ELEMENT_ICONS, TYPE_ELEMENT } from './data';
import { Player, Guardian, ParentSnapshot } from './state';
import { makeGuardian, disposeRig, makeCrawler, disposeCrawler, updateTamerFX, SKIN_TONES, HAIR_COLORS, HAIRSTYLES } from './models';
import { GUILD_LORE, avatarURL, guildIconURL, rankFor, questsDoneCount, makeCardNo } from './guilds';
import { journalEntries, questProgress, questState, type QuestDef, type QuestState } from './quests';
import { openGuildCard } from './guildcard';
import { openGuardianCard } from './guardiancard';
import { RANKS, rankIndexFor, rankBadgeHTML, rankLadderHTML } from './ranks';
import { evoTreeHTML, wireEvoTree } from './evotree';
import { checkAchievements, achievementsHTML } from './achievements';
import { sfx, toggleMute, isMuted, getMusicVolume, getSoundVolume, setMusicVolume, setSoundVolume } from './audio';
import { openTutorialReplayMenu, runGuardianTutorial, isTutorialOpen } from './tutorial';
import { weekdayName, time12, fullDateLabel } from './calendar';
import { getTournamentAlert, TournamentBracket, BracketCompetitor, TournamentTier, guildName, guildColor } from './tournaments';
import { CLOTHES_DATABASE, updateTamerAppearance } from './clothes';
import { WORLD_GUILDS } from './lore';
import { speciesSnapshotURL } from './snapshots';
import { renderLeaderboardPanel, wireLeaderboardPanel, getPlayerMMR, setPlayerMMR } from './mmr';
import { mountTablet, enableDragScroll, type TabletTab, type TabletHandle } from './tablet';
import { icon, elementIcon, statIcon, itemKindIcon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Custom shard-currency glyph (replaces the old ${SHARD} throughout the UI). */
const SHARD = icon('shard', { size: 13 });

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
// Expose toast to modules that must avoid a static ui<->state import cycle
// (e.g. Player.awardGuildPoints in state.ts).
(window as any).__azToast = toast;

// ---------------- dialogue ----------------
let screenEscHandler: ((e: KeyboardEvent) => void) | null = null;
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
    
    // Strip HTML tags for typewriter animation so tags do not render literally during reveal
    const plain = text.replace(/<[^>]+>/g, '');
    txt.textContent = '';
    let i = 0, done = false;
    const iv = setInterval(() => {
      if (i >= plain.length) { finishTyping(); return; }
      txt.textContent = plain.slice(0, ++i);
    }, 14);
    const finishTyping = () => {
      clearInterval(iv);
      txt.innerHTML = text;
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
    $('dialogue-text').innerHTML = text;
    $('dialogue-next').style.display = 'none';
    const wrap = $('dialogue-choices');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') {
        if (document.activeElement instanceof HTMLInputElement) return;
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        wrap.style.display = 'none';
        $('dialogue-box').style.display = 'none';
        dialogueBusy = false;
        resolve(options.length - 1);
      }
    };
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
    };

    options.forEach((opt, idx) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = opt;
      b.onclick = () => {
        cleanup();
        wrap.style.display = 'none';
        $('dialogue-box').style.display = 'none';
        dialogueBusy = false;
        resolve(idx);
      };
      wrap.appendChild(b);
    });
    window.addEventListener('keydown', onKey, true);
    (wrap.firstChild as HTMLElement)?.focus();
  });
}

// ---------------- name input ----------------
export function askName(title: string, placeholder = '', cancelable = false): Promise<string> {
  return new Promise(resolve => {
    dialogueBusy = true;
    const modal = $('name-modal');
    const input = $<HTMLInputElement>('name-input');
    $('name-modal-title').textContent = title;
    input.value = placeholder;
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    const cleanup = () => {
      $('name-confirm').onclick = null;
      input.onkeydown = null;
      window.removeEventListener('keydown', onWindowKey);
      dialogueBusy = false;
    };

    const confirm = () => {
      const v = input.value.trim();
      if (!v) return;
      modal.style.display = 'none';
      cleanup();
      resolve(v.slice(0, 12));
    };

    const cancel = () => {
      modal.style.display = 'none';
      cleanup();
      resolve('');
    };

    const onWindowKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (cancelable && (k === 'escape' || k === 'esc')) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };

    $('name-confirm').onclick = confirm;

    input.onkeydown = e => {
      const k = e.key.toLowerCase();
      if (k === 'enter') {
        confirm();
      } else if (cancelable && (k === 'escape' || k === 'esc')) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else {
        e.stopPropagation();
      }
    };

    if (cancelable) {
      window.addEventListener('keydown', onWindowKey, true);
    }
  });
}

// ---------------- HUD ----------------
const bar = (cur: number, max: number, cls: string) =>
  `<div class="bar-container">
    <span class="bar-label">${cls.toUpperCase()}</span>
    <div class="minibar ${cls}"><div style="width:${Math.max(0, Math.min(100, (cur / max) * 100))}%"></div></div>
    <span class="bar-value">${cur}/${max}</span>
  </div>`;

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
    <span class="goldcol" style="white-space:nowrap">${SHARD} ${player.shards}</span>
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
  const inBattle = !!(window as any).__inBattle;
  const portrait = hud.querySelector<HTMLElement>('.hud-portrait');
  if (portrait) portrait.onclick = async () => {
    if (inBattle || cardBusy || isDialogueOpen() || isMenuOpen()) return;
    if (!house) { toast('Pledge to a Grand House to receive your Guild Card.', ''); return; }
    cardBusy = true;
    sfx('open');
    await openGuildCard(player, () => updateHUD(player, zone, extra));
    cardBusy = false;
  };
  hud.querySelectorAll<HTMLElement>('[data-chip]').forEach(chip => chip.onclick = async () => {
    if (inBattle || cardBusy || isDialogueOpen() || isMenuOpen()) return;
    const g = player.party[+chip.dataset.chip!];
    if (!g) return;
    cardBusy = true;
    sfx('open');
    await openGuardianCard(g, player);
    cardBusy = false;
  });
}
export function hideHUD(): void { $('hud').style.display = 'none'; showHotkeys(false); updateWorldStatus(); }

/**
 * The Calendar chip and the flashing Tournament banner — persistent overlay
 * elements (not part of the HUD rebuild), so the clock ticks live and the
 * sign-up alert keeps flashing. Driven by a 1s interval from main.ts.
 */
export function updateWorldStatus(): void {
  const host = document.getElementById('app') ?? document.body;
  let chip = document.getElementById('cal-chip');
  if (!chip) { chip = document.createElement('div'); chip.id = 'cal-chip'; host.appendChild(chip); }
  let banner = document.getElementById('trn-banner');
  if (!banner) {
    banner = document.createElement('div'); banner.id = 'trn-banner';
    banner.onclick = () => toast('🏟️ Head to the Grand Coliseum and speak to Attendant Lyssa to register.', 'gold');
    host.appendChild(banner);
  }

  // During a battle the Calendar chip and the flashing event banner are hidden —
  // the Ring is no place for the world clock or sign-up reminders.
  const inBattle = !!(window as any).__inBattle;
  const hudVisible = $('hud').style.display !== 'none';
  const player = getActivePlayer();
  if (inBattle || !hudVisible || !player) { chip.style.display = 'none'; banner.style.display = 'none'; return; }

  chip.style.display = 'flex';
  chip.title = fullDateLabel();
  const chipHtml = `<span class="cal-day">🗓️ ${weekdayName()}</span><span class="cal-dot">•</span><span class="cal-time">${time12()}</span>`;
  if (chip.innerHTML !== chipHtml) chip.innerHTML = chipHtml;

  const alert = getTournamentAlert(player);
  if (alert) {
    banner.style.display = 'block';
    if (banner.textContent !== alert.text) banner.textContent = alert.text;
    const cls = alert.flashing ? 'flash' : '';
    if (banner.className !== cls) banner.className = cls;
  } else {
    banner.style.display = 'none';
  }
}

let lastHotkeysParams: { on: boolean; dungeon: boolean; regions: boolean } = { on: false, dungeon: false, regions: false };

export function refreshHotkeys(): void {
  showHotkeys(lastHotkeysParams.on, lastHotkeysParams.dungeon, lastHotkeysParams.regions);
}

export function showHotkeys(on: boolean, dungeon = false, regions = false): void {
  lastHotkeysParams = { on, dungeon, regions };
  const el = $('hotkeys');
  el.style.display = on ? 'flex' : 'none';

  const player = getActivePlayer();
  let hasNewMainQuest = false;
  let hasStillActiveMainQuest = false;
  
  if (player) {
    const { story, main } = journalEntries(player);
    for (const [q, st] of [...story, ...main]) {
      if (st === 'active' || st === 'ready') {
        if (!player.flags['seen_quest_' + q.id]) {
          hasNewMainQuest = true;
        } else {
          hasStillActiveMainQuest = true;
        }
      }
    }
  }

  el.innerHTML = [
    '<b>P</b> Tamer', '<b>I</b> Items', '<b>G</b> Guardians', '<b>C</b> Crawler', '<b>J</b> Journal', '<b>V</b> Evolutions', '<b>L</b> Leaderboard',
    ...(dungeon ? ['<b>M</b> Map'] : []),
    ...(regions ? ['<b>B</b> Expeditions', '<b>T</b> Regions'] : []),
    '<b>N</b> Sound', '<b>Esc</b> Menu',
  ].map(s => {
    const match = s.match(/<b>(.*?)<\/b>\s*(.*)/);
    const key = match ? match[1].toLowerCase() : '';
    let cls = `hk-btn hk-${key}`;
    if (key === 'j') {
      if (hasNewMainQuest) {
        cls += ' flash-new';
      } else if (hasStillActiveMainQuest) {
        cls += ' active-subtle';
      }
    }
    return `<span class="${cls}">${s}</span>`;
  }).join('');

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
    const code = await askName('Enter Cheat Code', '', true);
    if (!code) return;
    if (code.toLowerCase() === 'bugde') {
      await openMasterDebugMenu(player);
      return;
    }
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
    } else if (code.toLowerCase() === 'skip8') {
      const questsToComplete = ['story_roads', 'story_historian', 'story_amber', 'story_agdao', 'story_cradle', 'story_daughters', 'story_echoes'];
      questsToComplete.forEach(id => {
        player.quests[id] = 'done';
      });
      player.flags['exam_done'] = true;
      player.flags['university_done'] = true;
      player.flags['met_historian'] = true;
      player.flags['agdao_unlocked'] = true;
      player.flags['met_greggy'] = true;
      player.flags['met_daughters'] = true;
      player.shards += 50000;
      player.save(false);
      refreshHUD();
      toast('Cheat Activated: Skipped to Chapter 8, +50,000 Shards!', 'gold');
    } else if (code.toLowerCase() === 'skip10') {
      const questsToComplete = [
        'story_roads', 'story_historian', 'story_amber', 'story_agdao', 
        'story_cradle', 'story_daughters', 'story_echoes', 'story_getup', 'story_christine'
      ];
      questsToComplete.forEach(id => {
        player.quests[id] = 'done';
      });
      player.flags['exam_done'] = true;
      player.flags['university_done'] = true;
      player.flags['met_historian'] = true;
      player.flags['agdao_unlocked'] = true;
      player.flags['met_greggy'] = true;
      player.flags['met_daughters'] = true;
      player.flags['dragon_tear_quest_unlocked'] = true;
      player.flags['met_christine'] = true;
      player.shards += 80000;
      player.save(false);
      refreshHUD();
      toast('Cheat Activated: Skipped to Chapter 10, +80,000 Shards!', 'gold');
    } else if (code.toLowerCase() === 'gold') {
      player.shards += 10000;
      player.save(false);
      refreshHUD();
      toast('Cheat Activated: +10,000 Shards!', 'gold');
    } else if (code.toLowerCase().startsWith('mmr')) {
      // "mmr2500" sets directly; bare "mmr" prompts for a value.
      const inline = code.slice(3).trim();
      let value = parseInt(inline, 10);
      if (isNaN(value)) {
        const entered = await askName('Set MMR', String(getPlayerMMR(player)), true);
        value = parseInt(entered ?? '', 10);
      }
      if (isNaN(value)) { toast('Invalid MMR value', 'red'); return; }
      const v = setPlayerMMR(player, value);
      refreshHUD();
      toast(`Cheat Activated: MMR set to ★ ${v.toLocaleString()}!`, 'gold');
    } else {
      toast('Invalid Cheat Code', 'red');
    }
  } catch (err) {
    console.error('Cheat system error:', err);
  }
}

const NPC_QUESTS: Record<string, string[]> = {
  'Archivist Wren': ['side_ledger', 'side_lost_interviews'],
  'Old Tomas': ['side_wrench'],
  'Chef Marlo': ['side_chef'],
  'nervous student': ['side_niko'],
  'Professor Lyra': ['side_quiz'],
  'Rival Kade': ['side_spar'],
  'Old Bait Pete': ['side_fishing'],
  'Granny Essa': ['side_essa'],
  'Marshal Kovar': ['story_drowned_terminal'],
  'Archivist Tem': ['story_drowned_terminal'],
  'Stillwater Defector': ['story_drowned_terminal'],
  'Doctor Clyde': ['story_hyujon'],
  'Mayor Christine': ['story_christine'],
  'Mayor Airah': ['story_getup', 'story_christine', 'story_azrael_clues'],
  'Greggy the Stormheart': ['story_agdao', 'story_cradle', 'story_echoes'],
  'Azrin': ['story_daughters', 'story_azrael_clues'],
  'Azrael': ['story_daughters'],
  'Ivan Lawrence': ['story_veilfall', 'story_mirrorhouse'],
  'Master Bren': ['pyrelight_m1', 'pyrelight_m2', 'pyrelight_m3', 'pyrelight_m4'],
  'Mistress Sera': ['mistveil_m1', 'mistveil_m2', 'mistveil_m3', 'mistveil_m4'],
  'Warden Oakes': ['thornward_m1', 'thornward_m2', 'thornward_m3', 'thornward_m4'],
  'Captain Vex': ['stormcall_m1', 'stormcall_m2', 'stormcall_m3', 'stormcall_m4'],
  'Keeper Nyx': ['duskwatch_m1', 'duskwatch_m2', 'duskwatch_m3', 'duskwatch_m4'],
};

export function showInteractHint(text: string | null): void {
  const el = $('interact-hint');
  if (!text) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  let appended = '';
  const p = Player.activeInstance;
  if (p) {
    for (const [npcName, questIds] of Object.entries(NPC_QUESTS)) {
      if (text.includes(npcName) || (npcName === 'nervous student' && text.includes('nervous student'))) {
        let hasReady = false;
        let hasAvailable = false;
        let hasActive = false;
        for (const qid of questIds) {
          const st = questState(p, qid);
          if (st === 'ready') hasReady = true;
          else if (st === 'available') hasAvailable = true;
          else if (st === 'active') hasActive = true;
        }
        if (hasReady) {
          appended = ' <span style="color:#ffd700;font-weight:bold">❓ (Quest Ready)</span>';
        } else if (hasAvailable) {
          appended = ' <span style="color:#ffd700;font-weight:bold">❗ (Quest Available)</span>';
        } else if (hasActive) {
          appended = ' <span style="color:#b18ae8;font-weight:bold">(Quest Active)</span>';
        }
        break;
      }
    }
  }

  el.innerHTML = text + appended;
}

// ---------------- screens ----------------
let menuOpen = false;
let optionsOpen = false;
let debugMenuOpen = false;
export const isMenuOpen = () => menuOpen || optionsOpen || debugMenuOpen;
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

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    if (activePlayer) {
      cheatRow.style.display = 'flex';
      cheatBtn.onclick = async () => {
        modal.style.display = 'none';
        optionsOpen = false;
        window.removeEventListener('keydown', onKey, true);
        await executeCheatFlow(activePlayer);
        optionsOpen = true;
        modal.style.display = 'flex';
        window.addEventListener('keydown', onKey, true);
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
      window.removeEventListener('keydown', onKey, true);
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
    window.addEventListener('keydown', onKey, true);
  });
}

export function openMasterDebugMenu(player: Player): Promise<void> {
  return new Promise(resolve => {
    debugMenuOpen = true;
    
    const modal = $('debug-modal');
    const closeBtn = $('db-close-btn');
    const closeBtn2 = $('db-close-btn2');
    const shardsVal = $('db-shards-val');
    
    // Populate species options
    const allSpecies = Object.keys(SPECIES).map(id => ({ id, name: SPECIES[id].name }));
    allSpecies.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < 3; i++) {
      const select = $<HTMLSelectElement>(`db-slot-${i}-species`);
      // Keep only -- Empty -- and append species
      select.innerHTML = '<option value="empty">-- Empty --</option>';
      allSpecies.forEach(sp => {
        const opt = document.createElement('option');
        opt.value = sp.id;
        opt.textContent = sp.name;
        select.appendChild(opt);
      });
    }

    // Populate guild options
    const guildSelect = $<HTMLSelectElement>('db-guild-select');
    guildSelect.innerHTML = '<option value="none">-- None --</option>';
    HOUSES.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.name} (${h.type})`;
      guildSelect.appendChild(opt);
    });

    const updateSlotsDisplay = () => {
      shardsVal.textContent = player.shards.toLocaleString();

      for (let i = 0; i < 3; i++) {
        const info = $(`db-slot-${i}-info`);
        const select = $<HTMLSelectElement>(`db-slot-${i}-species`);
        const lvlInput = $<HTMLInputElement>(`db-slot-${i}-lvl`);

        const guardian = player.party[i];
        if (guardian) {
          info.textContent = `${guardian.nickname} (Lv. ${guardian.level})`;
          info.style.color = 'var(--ui-gold)';
          select.value = guardian.speciesId;
          lvlInput.value = String(guardian.level);
          lvlInput.disabled = false;
        } else {
          info.textContent = 'Empty';
          info.style.color = 'var(--ui-dim)';
          select.value = 'empty';
          lvlInput.value = '10';
          lvlInput.disabled = true;
        }
      }

      // Guild & Rank updates
      guildSelect.value = player.houseId || 'none';
      $('db-card-val').textContent = player.cardNo || 'No Card';
      $('db-gp-val').textContent = (player.guildPoints ?? 0).toLocaleString();
      
      const rIdx = rankIndexFor(player);
      const rankName = RANKS[rIdx].name;
      $('db-rank-val').textContent = `${rankName} (${player.tournamentPoints} TP)`;
      $('db-mmr-val').textContent = getPlayerMMR(player).toLocaleString();
    };

    updateSlotsDisplay();

    // Wire up debug boutique button
    $('db-boutique-btn').onclick = async () => {
      modal.style.display = 'none';
      debugMenuOpen = false;
      window.removeEventListener('keydown', onKey, true);

      await openDebugBoutique(player);

      debugMenuOpen = true;
      modal.style.display = 'flex';
      window.addEventListener('keydown', onKey, true);
    };

    // 1. Dropdown species changes
    for (let i = 0; i < 3; i++) {
      const select = $<HTMLSelectElement>(`db-slot-${i}-species`);
      select.onchange = () => {
        const val = select.value;
        if (val === 'empty') {
          if (player.party.length <= 1) {
            toast('Cannot remove last Guardian! Party must have >= 1 members.', 'red');
            updateSlotsDisplay();
            return;
          }
          player.party.splice(i, 1);
        } else {
          const targetLvl = parseInt($<HTMLInputElement>(`db-slot-${i}-lvl`).value, 10) || 10;
          if (i < player.party.length) {
            const curLvl = player.party[i].level;
            player.party[i] = new Guardian(val, curLvl);
          } else {
            player.party.push(new Guardian(val, targetLvl));
          }
        }
        player.save(false);
        refreshHUD();
        updateSlotsDisplay();
      };
    }

    // 2. Level increments and inputs
    const changeLvl = (idx: number, delta: number) => {
      const g = player.party[idx];
      if (!g) return;
      const newLvl = Math.max(1, Math.min(99, g.level + delta));
      
      g.level = newLvl;
      g.exp = expForLevel(newLvl);
      g.techPoints = Math.floor(g.level / 5);
      g.learnedTechs = g.species.techs
        .filter(t => t.level <= g.level)
        .map(t => t.tech)
        .slice(-5);
        
      g.hp = g.stats.hp;
      g.sp = g.stats.sp;

      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
    };

    const setLvlDirect = (idx: number, val: number) => {
      const g = player.party[idx];
      if (!g) return;
      const newLvl = Math.max(1, Math.min(99, val));
      
      g.level = newLvl;
      g.exp = expForLevel(newLvl);
      g.techPoints = Math.floor(g.level / 5);
      g.learnedTechs = g.species.techs
        .filter(t => t.level <= g.level)
        .map(t => t.tech)
        .slice(-5);
        
      g.hp = g.stats.hp;
      g.sp = g.stats.sp;

      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
    };

    for (let i = 0; i < 3; i++) {
      $(`db-slot-${i}-lvl-1`).onclick = () => changeLvl(i, 1);
      $(`db-slot-${i}-lvl-10`).onclick = () => changeLvl(i, 10);
      $<HTMLInputElement>(`db-slot-${i}-lvl`).onchange = () => {
        const val = parseInt($<HTMLInputElement>(`db-slot-${i}-lvl`).value, 10) || 10;
        setLvlDirect(i, val);
      };
    }

    // 3. Shards Gold adjustments
    const addGold = (amount: number) => {
      player.shards += amount;
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast(`Added ${amount.toLocaleString()} Shards!`, 'gold');
    };
    $('db-gold-1k').onclick = () => addGold(1000);
    $('db-gold-5k').onclick = () => addGold(5000);
    $('db-gold-10k').onclick = () => addGold(10000);
    $('db-gold-50k').onclick = () => addGold(50000);

    // 4. All Items x10
    $('db-items-all').onclick = () => {
      for (const itemId of Object.keys(ITEMS)) {
        player.addItem(itemId, 10);
      }
      player.save(false);
      refreshHUD();
      toast('Added 10 of all items to inventory!', 'gold');
    };

    // Guild & Rank adjustments
    guildSelect.onchange = () => {
      const val = guildSelect.value;
      if (val === 'none') {
        player.houseId = null;
        player.cardNo = '';
      } else {
        player.houseId = val;
        const prefix = val.slice(0, 2).toUpperCase();
        if (!player.cardNo || !player.cardNo.startsWith(prefix)) {
          player.cardNo = makeCardNo(val);
        }
      }
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast(`Guild set to: ${val === 'none' ? 'None' : val}`, 'gold');
    };

    const addGP = (amount: number) => {
      player.guildPoints = (player.guildPoints ?? 0) + amount;
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast(`Added ${amount} GP!`, 'gold');
    };
    $('db-gp-10').onclick = () => addGP(10);
    $('db-gp-100').onclick = () => addGP(100);
    $('db-gp-500').onclick = () => addGP(500);

    $('db-gp-max-perks').onclick = () => {
      player.guildPerks = {
        elementMastery: 10,
        itemDiscount: 5,
        crawlerDiscount: 5,
        monoSynergy: 5,
        rainbowSynergy: 5,
        tacticalSynergy: 5,
      };
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast('Maxed out all Guild Perks!', 'gold');
    };

    $('db-gp-reset').onclick = () => {
      player.guildPoints = 0;
      player.guildPerks = {
        elementMastery: 1,
        itemDiscount: 0,
        crawlerDiscount: 0,
        monoSynergy: 0,
        rainbowSynergy: 0,
        tacticalSynergy: 0,
      };
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast('Guild Points & Perks reset!', 'red');
    };

    const addTP = (amount: number) => {
      player.tournamentPoints += amount;
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      const rIdx = rankIndexFor(player);
      toast(`Added ${amount} TP! Rank: ${RANKS[rIdx].name}`, 'gold');
    };
    $('db-tp-10').onclick = () => addTP(10);
    $('db-tp-50').onclick = () => addTP(50);
    $('db-tp-100').onclick = () => addTP(100);
    $('db-tp-250').onclick = () => addTP(250);

    $('db-tp-reset').onclick = () => {
      player.tournamentPoints = 0;
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast('Tournament Points reset to 0!', 'red');
    };

    // 4b. Ladder MMR — sets the rating that gates tournaments
    const applyMMR = (value: number) => {
      const v = setPlayerMMR(player, value);
      refreshHUD();
      updateSlotsDisplay();
      toast(`MMR set to ★ ${v.toLocaleString()}!`, 'gold');
    };
    $('db-mmr-set').onclick = () => {
      const input = $<HTMLInputElement>('db-mmr-input');
      const v = parseInt(input.value, 10);
      if (isNaN(v)) { toast('Enter a valid MMR number.', 'red'); return; }
      applyMMR(v);
    };
    $('db-mmr-2000').onclick = () => applyMMR(2000);
    $('db-mmr-3200').onclick = () => applyMMR(3200);

    // 5. Warp/Teleportation
    $('db-warp-btn').onclick = () => {
      const destType = $<HTMLSelectElement>('db-warp-select').value;
      player.savedLocation = { type: destType as any };
      player.save(false);
      toast('Saving and reloading to teleport...', 'gold');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    };

    // 6. Cinematics play
    $('db-cine-play').onclick = async () => {
      const cineKind = $<HTMLSelectElement>('db-cine-select').value;
      modal.style.display = 'none';
      debugMenuOpen = false;
      window.removeEventListener('keydown', onKey, true);
      
      const runner = (window as any).__runCinematicScene;
      if (runner) {
        toast(`Playing Cinematic: ${cineKind}`, 'gold');
        await runner(cineKind, async (cine: any) => {
          const shotNames = Object.keys(cine.shots || {});
          if (shotNames.length > 0) {
            await say('Director', `Playing cinematic backdrop: "${cineKind}". Use the choices below to change camera angles or exit.`);
            let done = false;
            while (!done) {
              const choices = [...shotNames, 'Exit Cinematic'];
              const chosenIdx = await choose('Director', 'Select Camera Shot', choices);
              if (chosenIdx === choices.length - 1) {
                done = true;
              } else {
                const shotName = shotNames[chosenIdx];
                cine.shot(shotName);
              }
            }
          } else {
            await say('Director', `Playing cinematic: "${cineKind}". Press enter to exit.`);
          }
        });
      } else {
        toast('Error: Cinematic runner not found.', 'red');
      }
      
      debugMenuOpen = true;
      modal.style.display = 'flex';
      window.addEventListener('keydown', onKey, true);
    };

    // 7. Fishing play
    $('db-fish-play').onclick = async () => {
      const spotKind = $<HTMLSelectElement>('db-fish-select').value;
      modal.style.display = 'none';
      debugMenuOpen = false;
      window.removeEventListener('keydown', onKey, true);
      
      const runner = (window as any).__runFishing;
      if (runner) {
        toast(`Starting Fishing Game at spot: ${spotKind}`, 'gold');
        const spotInfo = {
          spot: spotKind as any,
          location: spotKind === 'pond' ? 'Pond Dock' : spotKind === 'river' ? 'River Dock' : 'Mossdeep Vault',
          zoneTitle: 'DEBUG FISHING'
        };
        await runner(spotInfo);
      } else {
        toast('Error: Fishing runner not found.', 'red');
      }
      
      debugMenuOpen = true;
      modal.style.display = 'flex';
      window.addEventListener('keydown', onKey, true);
    };

    // 8. Quick Cheats / Toggles
    $('db-heal-all').onclick = () => {
      player.healAll();
      player.save(false);
      refreshHUD();
      updateSlotsDisplay();
      toast('Healed all Guardians in party and reserve!', 'gold');
    };

    $('db-techs-all').onclick = () => {
      player.party.forEach(g => {
        g.species.techs.forEach(t => {
          if (!g.learnedTechs.includes(t.tech)) {
            g.learnedTechs.push(t.tech);
          }
        });
      });
      player.save(false);
      toast('Unlocked all species techniques for active party!', 'gold');
    };

    $('db-cap-255').onclick = () => {
      player.party.forEach(g => {
        g.levelCap = 255;
      });
      player.save(false);
      toast('Set level cap to 255 for active party!', 'gold');
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      modal.style.display = 'none';
      
      // Clean up event handlers
      closeBtn.onclick = null;
      closeBtn2.onclick = null;
      for (let i = 0; i < 3; i++) {
        $(`db-slot-${i}-species`).onchange = null;
        $(`db-slot-${i}-lvl-1`).onclick = null;
        $(`db-slot-${i}-lvl-10`).onclick = null;
        $(`db-slot-${i}-lvl`).onchange = null;
      }
      $('db-gold-1k').onclick = null;
      $('db-gold-5k').onclick = null;
      $('db-gold-10k').onclick = null;
      $('db-gold-50k').onclick = null;
      $('db-items-all').onclick = null;
      guildSelect.onchange = null;
      $('db-gp-10').onclick = null;
      $('db-gp-100').onclick = null;
      $('db-gp-500').onclick = null;
      $('db-gp-max-perks').onclick = null;
      $('db-gp-reset').onclick = null;
      $('db-tp-10').onclick = null;
      $('db-tp-50').onclick = null;
      $('db-tp-100').onclick = null;
      $('db-tp-250').onclick = null;
      $('db-tp-reset').onclick = null;
      $('db-mmr-set').onclick = null;
      $('db-mmr-2000').onclick = null;
      $('db-mmr-3200').onclick = null;
      $('db-cine-play').onclick = null;
      $('db-fish-play').onclick = null;
      $('db-warp-btn').onclick = null;
      $('db-heal-all').onclick = null;
      $('db-techs-all').onclick = null;
      $('db-cap-255').onclick = null;
      $('db-boutique-btn').onclick = null;
      
      debugMenuOpen = false;
      resolve();
    };

    modal.style.display = 'flex';
    closeBtn.onclick = close;
    closeBtn2.onclick = close;
    window.addEventListener('keydown', onKey, true);
  });
}

export function closeMenu(): void {
  $('menu-screen').style.display = 'none';
  $('menu-content').className = 'inner panel'; // reset any device/glass skin between screens
  menuOpen = false;
  if (screenEscHandler) {
    window.removeEventListener('keydown', screenEscHandler, true);
    screenEscHandler = null;
  }
}

function openScreen(html: string): HTMLElement {
  const sc = $('menu-screen');
  const content = $('menu-content');
  content.innerHTML = html;
  sc.style.display = 'flex';
  menuOpen = true;

  if (screenEscHandler) {
    window.removeEventListener('keydown', screenEscHandler, true);
    screenEscHandler = null;
  }

  screenEscHandler = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'esc') {
      // List of closing button IDs across various screens (shop, garage, boutique, fusion, notice board, panels)
      const closeIds = [
        'shop-close', 'garage-close', 'boutique-close', 
        'fusion-close', 'hub-close', 'panel-close', 'board-close'
      ];
      for (const id of closeIds) {
        const btn = document.getElementById(id);
        if (btn && btn.style.display !== 'none' && !btn.hasAttribute('disabled')) {
          e.preventDefault();
          e.stopPropagation();
          btn.click();
          return;
        }
      }
    }
  };
  window.addEventListener('keydown', screenEscHandler, true);

  // touch-style click-hold vertical drag to scroll (the Tablet manages its own)
  enableDragScroll(content);

  return content;
}
export { openScreen };

const typeTag = (g: Guardian) =>
  `<span class="tag" style="background:${TYPE_CSS[g.species.type]};color:#0c1022">${g.species.type}</span>`;

// ================= panel system (P / I / G / C) =================
export type PanelKind = 'player' | 'inventory' | 'guardians' | 'crawler' | 'quests' | 'evotree' | 'leaderboard';
export interface PanelCtx { canSave: boolean; }

const PANEL_KEYS: Record<string, PanelKind> = { p: 'player', i: 'inventory', g: 'guardians', c: 'crawler', j: 'quests', v: 'evotree', l: 'leaderboard' };
const PANEL_TITLES: Record<PanelKind, string> = {
  player: 'Tamer Data', inventory: 'Inventory', guardians: 'Guardians', crawler: 'Crawler', quests: 'Quest Journal', evotree: 'Evolutions', leaderboard: 'Leaderboard',
};
const PANEL_ICON: Record<PanelKind, string> = {
  player: 'tamer', inventory: 'items', guardians: 'guardians', crawler: 'crawler', quests: 'journal', evotree: 'evolutions', leaderboard: 'leaderboard',
};
const PANEL_HOTKEY: Record<PanelKind, string> = { player: 'P', inventory: 'I', guardians: 'G', crawler: 'C', quests: 'J', evotree: 'V', leaderboard: 'L' };

/** True if the player has an unseen active main/story quest (drives the Journal tab's attention dot). */
function hasUnseenMainQuest(player: Player): boolean {
  const { story, main } = journalEntries(player);
  for (const [q, st] of [...story, ...main]) {
    if ((st === 'active' || st === 'ready') && !player.flags['seen_quest_' + q.id]) return true;
  }
  return false;
}

/** Open the Tablet on a given panel. Esc or the panel's own hotkey closes it (hotkeys also switch panels). */
export function openPanel(kind: PanelKind, player: Player, ctx: PanelCtx): Promise<void> {
  return new Promise(resolve => {
    let handle: TabletHandle | null = null;
    let curTab: PanelKind = kind;

    const buildTabs = (): TabletTab[] => {
      const newQuest = hasUnseenMainQuest(player);
      return (Object.keys(PANEL_TITLES) as PanelKind[]).map(p => ({
        key: p, icon: PANEL_ICON[p], label: PANEL_TITLES[p], hotkey: PANEL_HOTKEY[p],
        flashNew: p === 'quests' && newQuest,
      }));
    };

    // Flag active quests as seen the moment the Journal screen is shown.
    const markQuestsSeen = (key: string) => {
      if (key !== 'quests') return;
      const { story, main } = journalEntries(player);
      let changed = false;
      for (const [q, st] of [...story, ...main]) {
        if ((st === 'active' || st === 'ready') && !player.flags['seen_quest_' + q.id]) {
          player.flags['seen_quest_' + q.id] = true; changed = true;
        }
      }
      if (changed) player.save();
    };

    const checkTut = (key: string) => {
      if (key === 'guardians' && !player.flags['tut_guardian_ui']) {
        runGuardianTutorial(player).then(refresh);
      }
    };

    // Bodies call refresh() after acting. Some of them open a sub-screen via
    // openScreen() (guardian detail, technique manager, guild card) which REPLACES
    // the content host and tears the Tablet out of the DOM. If that happened,
    // rebuild the device on the current tab; otherwise just re-render the body.
    const refresh = () => {
      if (handle && document.body.contains(handle.el)) handle.rerender();
      else mountAt(curTab, true);
    };

    const onClose = () => {
      closeMenu();
      window.removeEventListener('keydown', onKey);
      refreshHotkeys();
      resolve();
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTutorialOpen() || !handle) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') { handle.close(); return; }
      const target = PANEL_KEYS[k];
      if (target && !(e.target instanceof HTMLInputElement)) {
        if (target === handle.current()) handle.close();
        else handle.setTab(target);
      }
    };

    // Show the overlay via the shared machinery (sets menuOpen + Esc→#panel-close
    // routing), then mount the Tablet into the now-visible content host. `silent`
    // skips the boot animation/sound on rebuilds (e.g. returning from a sub-screen).
    const mountAt = (tab: PanelKind, silent: boolean) => {
      curTab = tab;
      const content = openScreen('');
      handle = mountTablet(content, {
        tabs: buildTabs(),
        initial: tab,
        renderPage: (key) => renderPanelBody(key as PanelKind, player, refresh, ctx),
        wirePage: (key, page) => wirePanelBody(key as PanelKind, page, player, refresh, ctx),
        onTab: (key) => { curTab = key as PanelKind; markQuestsSeen(key); checkTut(key); handle!.refreshTabs(buildTabs()); },
        sysButtons: ctx.canSave
          ? [{ id: 'panel-save', icon: 'save', title: 'Save game', onClick: () => { player.save(false); toast('Game saved.', 'gold'); } }]
          : [],
        onClose,
        noBoot: silent,
      });
      markQuestsSeen(tab);
      checkTut(tab);
    };

    window.addEventListener('keydown', onKey);
    mountAt(kind, false);
  });
}

// ---------- panel bodies ----------
function renderPanelBody(kind: PanelKind, p: Player, refresh: () => void, ctx: PanelCtx): string {
  if (kind === 'leaderboard') {
    return renderLeaderboardPanel(p, refresh);
  }
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
              ${house ? `<button class="ui-btn primary" id="open-guild-card" style="margin-top:8px;font-size:13px;padding:6px 14px">${icon('card', { size: 15 })} View Guild Card</button>` : '<div class="sub" style="margin-top:6px">Pledge to a Grand House to receive your guild Effigy & Sigil card.</div>'}
            </div>
          </div>
          <div class="list-row"><div style="flex:1"><span class="sub">Shards</span></div><b class="goldcol">${SHARD} ${p.shards}</b></div>
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
      <div class="grid2" id="guardians-panel-grid">
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
  const rarityBadge = (r: CrawlerRarity) => {
    const info = RARITY_INFO[r], ultra = r === 'ultra';
    return `<span class="tag" style="background:${ultra ? ULTRA_GRADIENT : info.bg};color:${ultra ? '#1a0a14' : '#fff'};font-size:9px;font-weight:700;letter-spacing:0.3px;${ultra ? 'text-shadow:0 0 4px rgba(255,255,255,0.6);' : ''}">${info.label}</span>`;
  };

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
          <div class="cr-slot-part" style="color:${RARITY_INFO[part.rarity].color}">${part.name}</div>
          <div class="cr-tier">${pips} <span class="sub">${RARITY_INFO[part.rarity].label}${ownedCount > 1 ? ` · ${ownedCount} owned` : ''}</span></div>
        </div>
      </div>`;
  };

  const info = CRAWLER_SLOT_INFO[crawlerSlotSel];
  const ownedParts = Object.values(CRAWLER_PARTS)
    .filter(x => x.slot === crawlerSlotSel && c.owned.includes(x.id)).sort((a, b) => a.tier - b.tier);
  const bayRows = ownedParts.map(part => {
    const equipped = c.parts[crawlerSlotSel] === part.id;
    return `<div class="list-row" style="border-left:3px solid ${RARITY_INFO[part.rarity].color}"><div style="flex:1"><b>${part.name}</b> ${rarityBadge(part.rarity)}<div class="sub">${part.desc}</div></div>
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

// `icon` holds an icons.ts glyph NAME (rendered to SVG at display time).
const INV_TABS: Record<InvTab, { label: string; icon: string; kinds: string[] }> = {
  all:     { label: 'All',         icon: 'bagSmall', kinds: [] },
  consume: { label: 'Consumables', icon: 'flask',    kinds: ['heal', 'sp', 'revive'] },
  gift:    { label: 'Gifts',       icon: 'gift',     kinds: ['gift'] },
  crawler: { label: 'Crawler',     icon: 'crawler',  kinds: ['fuel', 'repair'] },
  gem:     { label: 'Gems',        icon: 'gem',      kinds: ['boost', 'feast', 'evo'] },
  key:     { label: 'Key & Quest', icon: 'scroll',   kinds: ['relic'] },
};
const ITEM_ICONS: Record<string, string> = {
  tonic: '🧪', tonic_plus: '⚗️', elixir: '✨', soda: '🥤', soda_plus: '🧋', soda_max: '🍶', revive_leaf: '🍃',
  revive_bloom: '🌺', berry: '🫐', honey_roll: '🥐', star_treat: '🌟', aether_confit: '🍬',
  cell: '🔋', cell_plus: '⚡', cell_max: '🌩️', plating: '🛡️', plating_plus: '🔰',
  atk_gem: '🔴', def_gem: '🟡', spd_gem: '⚪', wis_gem: '🔵', hp_gem: '🟢', sp_gem: '🟣', prism_gem: '💎',
  storm_amber: '🟠', sea_chart: '🗺️', stormheart_coil: '🌀',
  fish_grill: '🐟', fish_smoke: '🍥', fish_stew: '🍲', fish_sashimi: '🍣', fish_roe: '🍱', fish_legend: '🎏',
};
export const itemIcon = (id: string): string => itemKindIcon(ITEMS[id]?.kind ?? 'all', { size: 26 });

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
    return `<button class="jtab ${invTab === t ? 'on' : ''}" data-itab="${t}">${icon(INV_TABS[t].icon, { size: 15 })} ${INV_TABS[t].label} <span class="jcount">${count}</span></button>`;
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
    const usable = ['heal', 'sp', 'revive', 'boost', 'feast'].includes(it.kind) || invSel === 'dawnflame_recorder';
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
      ${it.price ? `<div class="jrow"><span class="jkey">Value</span><span class="jval goldcol">${SHARD} ${it.price} (sells nowhere — yet)</span></div>` : ''}
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
  if (st === 'locked') return icon('lock', { size: 15 });
  return q.icon ?? (q.kind === 'main' ? icon('leaderboard', { size: 15 }) : q.kind === 'side' ? icon('card', { size: 15 }) : icon('journal', { size: 15 }));
}

function rewardChips(q: QuestDef): string {
  const chips: string[] = [];
  if (q.reward.shards) chips.push(`<span class="jreward-chip">${SHARD} ${q.reward.shards} Shards</span>`);
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
  if (kind === 'leaderboard') {
    wireLeaderboardPanel(el, p, refresh);
  } else if (kind === 'quests') {
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

function renderPedigreeTreeHtml(g: Guardian): string {
  if (!g.parents) return '';

  const getCardHtml = (node: ParentSnapshot | null, label: string, isOffspring = false) => {
    if (!node) {
      return `<div class="pedigree-card empty">
        <span class="sub" style="font-size:9px;text-transform:uppercase;color:var(--ui-dim);letter-spacing:0.5px">${label}</span>
        <div class="pedigree-title" style="color:#555">Unknown</div>
        <div class="pedigree-sub">No record</div>
      </div>`;
    }
    const spec = SPECIES[node.speciesId];
    const typeColor = spec ? TYPE_CSS[spec.type] : '#8b93b8';
    const specName = spec ? spec.name : 'Unknown';
    const displayLabel = isOffspring ? '🌟 Offspring' : label;
    return `
      <div class="pedigree-card ${isOffspring ? 'offspring-node' : ''}">
        <span class="sub" style="font-size:9px;text-transform:uppercase;color:var(--ui-gold);letter-spacing:0.5px">${displayLabel}</span>
        <div class="pedigree-title" style="color:${typeColor}">${node.nickname}</div>
        <div class="pedigree-sub">${specName} · Lv.${node.level}</div>
      </div>
    `;
  };

  const parentA = g.parents.parentA;
  const parentB = g.parents.parentB;
  const grandparentA1 = parentA.parents?.parentA ?? null;
  const grandparentA2 = parentA.parents?.parentB ?? null;
  const grandparentB1 = parentB.parents?.parentA ?? null;
  const grandparentB2 = parentB.parents?.parentB ?? null;

  return `
    <h3 style="margin-top:16px;border-top:1px dashed var(--ui-border);padding-top:12px;color:var(--ui-gold);">🧬 Guardian Lineage & Pedigree</h3>
    <div class="pedigree-container">
      <!-- Generation 3: Grandparents -->
      <div class="pedigree-column">
        ${getCardHtml(grandparentA1, 'Grandparent')}
        ${getCardHtml(grandparentA2, 'Grandparent')}
        <div style="border-top:1px dashed rgba(255,255,255,0.05);margin:4px 0;"></div>
        ${getCardHtml(grandparentB1, 'Grandparent')}
        ${getCardHtml(grandparentB2, 'Grandparent')}
      </div>
      <!-- Generation 2: Parents -->
      <div class="pedigree-column">
        ${getCardHtml(parentA, 'Parent A')}
        ${getCardHtml(parentB, 'Parent B')}
      </div>
      <!-- Generation 1: Offspring -->
      <div class="pedigree-column">
        ${getCardHtml({ nickname: g.nickname, speciesId: g.speciesId, level: g.level, parents: g.parents }, 'Offspring', true)}
      </div>
    </div>
  `;
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
        <div class="sub">Technique Points: <b class="goldcol">${g.techPoints}</b> · Evolution Points: <b class="goldcol">${g.evolutionPoints}</b></div>
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
    ${renderPedigreeTreeHtml(g)}
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
      const canLearn = g.techPoints > 0 && g.learnedTechs.length < 5;
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
        Technique Points: <b class="goldcol">${g.techPoints}</b> · Active Slots: <b>${g.learnedTechs.length}/5</b>
      </div>
      <div class="grid2">
        <div>
          <h3>Active Moves (${g.learnedTechs.length}/5)</h3>
          <div style="max-height:340px;overflow-y:auto">${learnedRows}</div>
        </div>
        <div>
          <h3>Tech Box (Unlocked Moves)</h3>
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
        if (g.techPoints > 0 && g.learnedTechs.length < 5) {
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

async function playDawnflameRecorder(player: Player, refresh: () => void): Promise<void> {
  closeMenu();
  const options = [
    '📼 Crystal 1: Ghandra\'s Echo (Mossdeep)',
    '📼 Crystal 2: The Reaching (Sunken Vault)',
    '📼 Crystal 3: The Legion War (Thunderfen)',
    '📼 Crystal 4: Greggy\'s Silence (Cradle Hollow)',
    '📼 Crystal 5: The Ghandra Seal (Stormspire)',
    '🔓 Reconstruct Hidden Message',
    'Cancel'
  ];
  const pick = await choose('Dawnflame Recorder', 'Select a recording to play back:', options);
  if (pick === 5) {
    await conversation([
      ['Dawnflame Recorder', 'Realigning Ghandra frequencies... Decrypting hidden track...'],
      ['Aljay (recording)', '...If you are hearing this hidden log, it means Wren succeeded. Good.'],
      ['Aljay (recording)', 'I left a cache of Old-Empire alloys and Aether blueprints buried where Greggy and I first met Veyl.'],
      ['Aljay (recording)', 'Under the shadow of the Stormspire, near the eastern ruins... look for coordinates (22.5, 10.4). There is a steel valve. Turn it.'],
      ['System', 'Decoded secret coordinates: Stormspire ruins (22.5, 10.4). Search the area on your next expedition!']
    ]);
  } else if (pick < 5) {
    const dialogues: Record<number, string[]> = {
      0: [
        "Aljay (recording): The First Dawn, ~3,000 years ago.",
        "Aljay (recording): The scholars say Ghandra's veil thinned and the Guardians just... walked into our world. But it wasn't a migration, you know? It was a rescue.",
        "Aljay (recording): Ghandra was collapsing even back then. They came here to survive. And they bonded with us because our souls were the only anchors that kept them from fading. Remember that."
      ],
      1: [
        "Aljay (recording): The Reaching. That was our darkest hour.",
        "Aljay (recording): Humans learned too much, too fast. Force-feeding Ghandra energy, chaining hearts, selling Guardians by the shipload. Power is an addiction.",
        "Aljay (recording): When Sera, Oakes, Nyx and I stood up to end it, we didn't just write the Guild Compact. We wove it into the soil. No more chains. Only trust."
      ],
      2: [
        "Aljay (recording): The Legion War. Fifteen years ago.",
        "Aljay (recording): Nine corrupted generals, rotting the Veil from the inside. Greggy, Onnel, and I... we didn't win because we were strong. We won because we were three.",
        "Aljay (recording): I still remember Greggy's laugh when we charged Voltrazar. And Onnel's silence when we wove the final knot. We left a piece of our hearts at that door."
      ],
      3: [
        "Aljay (recording): Greggy's choice.",
        "Aljay (recording): When it was over, Greggy went to Agdao. He said he was retired, but I knew. He climbed that bluff to watch the seal's shadow in the water. He's the lock.",
        "Aljay (recording): I miss him. I miss his loud tea. If you're listening to this, and you see him... tell him Aljay said to take a day off. He won't, but say it anyway."
      ],
      4: [
        "Aljay (recording): The Ghandra Seal and my daughters.",
        "Aljay (recording): The seal thins a little every season. And Foretales... the network... they keep glazing us on every crystal. It's a cover. They're preparing to pull the leash.",
        "Aljay (recording): If I don't make it back, Azrin, Azrael... I'm sorry. I had to go. The door I built needs a Dawnflame's spark. Tamer, if you're helping them... keep them safe. Please."
      ]
    };
    await conversation(dialogues[pick].map(line => ['Aljay (recording)', line]));
  }
  refresh();
}

async function useItemFlow(player: Player, itemId: string, refresh: () => void): Promise<void> {
  if (itemId === 'dawnflame_recorder') {
    await playDawnflameRecorder(player, refresh);
    return;
  }
  const it = ITEMS[itemId];
  const targets = it.kind === 'revive' ? player.party.filter(g => g.fainted) : player.party.filter(g => !g.fainted);
  if (!targets.length) { toast('No valid target.', 'red'); return; }
  const names = targets.map(g => `${g.nickname} (Lv${g.level}, HP: ${g.hp}/${g.stats.hp}, SP: ${g.sp}/${g.stats.sp})`);
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
    const esc = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') close();
    };
    window.addEventListener('keydown', esc);

    let menuHtml = '';
    if (opts.inDungeon) {
      menuHtml = `
        <h3>${icon('crawler', { size: 18 })} Crawler Mode Menu</h3>
        <div class="sub" style="margin-bottom:10px"><span class="goldcol">${SHARD} ${player.shards} Shards</span> ${opts.floorNum ? `· Floor B${opts.floorNum}F` : ''}</div>
        <div class="hub-grid">
          <button class="ui-btn" data-hub="inventory">${icon('items', { size: 16 })} Use Item <span class="sub">(I)</span></button>
          <button class="ui-btn" data-hub="guardians">${icon('guardians', { size: 16 })} Party Setup <span class="sub">(G)</span></button>
          <button class="ui-btn danger" id="hub-retreat">${icon('regions', { size: 16 })} Teleport Back</button>
          <button class="ui-btn" id="hub-options">${icon('gear', { size: 16 })} Options</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          <button class="ui-btn primary" id="hub-close">Resume (Esc)</button>
        </div>`;
    } else {
      menuHtml = `
        <h3>${icon('tamer', { size: 18 })} ${player.tamerName} — Field Menu</h3>
        <div class="sub" style="margin-bottom:10px"><span class="goldcol">${SHARD} ${player.shards} Shards</span> · Battles won: ${player.battlesWon} · Befriended: ${player.capturesMade}</div>
        <div class="hub-grid">
          <button class="ui-btn" data-hub="player">${icon('tamer', { size: 16 })} Tamer Data <span class="sub">(P)</span></button>
          <button class="ui-btn" data-hub="inventory">${icon('items', { size: 16 })} Inventory <span class="sub">(I)</span></button>
          <button class="ui-btn" data-hub="guardians">${icon('guardians', { size: 16 })} Guardians <span class="sub">(G)</span></button>
          <button class="ui-btn" data-hub="crawler">${icon('crawler', { size: 16 })} Crawler <span class="sub">(C)</span></button>
          <button class="ui-btn" data-hub="quests">${icon('journal', { size: 16 })} Quest Journal <span class="sub">(J)</span></button>
          <button class="ui-btn" data-hub="evotree">${icon('evolutions', { size: 16 })} Evolution Atlas <span class="sub">(V)</span></button>
          <button class="ui-btn" data-hub="leaderboard">${icon('leaderboard', { size: 16 })} Leaderboard <span class="sub">(L)</span></button>
          <button class="ui-btn" id="hub-tutorial">${icon('journal', { size: 16 })} Field Manual <span class="sub">(replay tutorials)</span></button>
          <button class="ui-btn" id="hub-options">${icon('gear', { size: 16 })} Game Options</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          ${opts.canSave ? `<button class="ui-btn" id="hub-save">${icon('save', { size: 16 })} Save Game</button>` : ''}
          <button class="ui-btn primary" id="hub-close">Resume (Esc)</button>
        </div>`;
    }

    const el = openScreen(menuHtml);
    el.classList.add('glass-frame', 'opening'); // obsidian-glass "home screen" to match the Tablet
    sfx('open');
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
      toast('New: replay any Field Manual chapter from this menu.', 'gold', 3600);
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

function initDebugTamerPreview3D(
  container: HTMLElement,
  equipped: Record<string, string>,
  appearance?: Parameters<typeof updateTamerAppearance>[2],
): { update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => void; focus: (part: 'full' | 'head') => void; dispose: () => void } {
  const width = container.clientWidth || 260;
  const height = container.clientHeight || 240;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 10);
  camera.position.set(0, 0.95, 2.5);
  const VIEWS = {
    full: { pos: new THREE.Vector3(0, 0.95, 2.5), look: new THREE.Vector3(0, 0.82, 0) },
    head: { pos: new THREE.Vector3(0, 1.62, 1.6), look: new THREE.Vector3(0, 1.66, 0) },
  };
  const posGoal = VIEWS.full.pos.clone();
  const lookGoal = VIEWS.full.look.clone();
  const lookNow = lookGoal.clone();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  const tamerGroup = new THREE.Group();
  tamerGroup.position.set(0, 0.1, 0);
  updateTamerAppearance(tamerGroup, equipped, appearance);
  scene.add(tamerGroup);

  let active = true;
  let lastTime = performance.now();
  let isDragging = false;
  let previousPointerX = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isDragging = true;
    previousPointerX = e.clientX;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousPointerX;
    previousPointerX = e.clientX;
    tamerGroup.rotation.y += deltaX * 0.015;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function animate() {
    if (!active) return;
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (!isDragging) {
      tamerGroup.rotation.y += dt * 0.4;
    }
    updateTamerFX(tamerGroup, dt);
    const k = Math.min(1, dt * 6);
    camera.position.lerp(posGoal, k);
    lookNow.lerp(lookGoal, k);
    camera.lookAt(lookNow);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  return {
    update: (eq: Record<string, string>, app?: Parameters<typeof updateTamerAppearance>[2]) => {
      updateTamerAppearance(tamerGroup, eq, app ?? appearance);
    },
    focus: (part: 'full' | 'head') => { const v = VIEWS[part] ?? VIEWS.full; posGoal.copy(v.pos); lookGoal.copy(v.look); },
    dispose: () => {
      active = false;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      const prevFx = (tamerGroup.userData as { fxDispose?: () => void }).fxDispose;
      if (prevFx) prevFx();
      while (tamerGroup.children.length > 0) {
        tamerGroup.remove(tamerGroup.children[0]);
      }
      renderer.dispose();
      canvas.remove();
    }
  };
}

export async function openDebugBoutique(player: Player): Promise<void> {
  return new Promise<void>(resolve => {
    const SLOT_ICONS: Record<string, string> = { hat: 'hat', shirt: 'shirt', pants: 'pants', gloves: 'glove', backpack: 'bagSmall', shoes: 'boot' };
    type Tab = 'hat' | 'shirt' | 'pants' | 'gloves' | 'backpack' | 'shoes' | 'style';
    let activeTab: Tab = 'shirt';

    const previewState = { ...player.equippedClothes };
    const previewApp = { ...player.appearance };

    const el = openScreen(`
      <h3 style="text-align:center;margin:0 0 8px">🛠️ Master Debug Closet — <span class="goldcol">FREE TAMER STUDIO</span></h3>
      <div class="grid2">
        <div>
          <div id="boutique-tabs-container" class="panel-tabs" style="margin-bottom:8px"></div>
          <div id="boutique-list-container" style="max-height:380px;overflow-y:auto;padding-right:4px;"></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;background:rgba(0,0,0,0.35);border:1px solid var(--ui-border);border-radius:8px;padding:12px;">
          <h4 style="margin-bottom:8px;color:var(--ui-gold);text-transform:uppercase;font-size:14px;letter-spacing:1px;">Fitting Room</h4>
          <div id="tamer-preview-container" style="width:260px;height:250px;position:relative;overflow:hidden;background:rgba(6,8,16,0.55);border-radius:6px;border:1px solid #2c3666"></div>
          <div class="sub" style="margin-top:6px;font-size:11px;color:var(--ui-dim)">LIVE 3D MIRROR · DRAG TO ROTATE</div>
          <div id="boutique-outfit" style="width:100%;margin-top:10px;font-size:12px"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="ui-btn primary" id="boutique-close">Close Closet</button>
      </div>`);

    const container = el.querySelector('#tamer-preview-container') as HTMLElement;
    const previewHandle = initDebugTamerPreview3D(container, previewState, previewApp);
    const refreshPreview = () => previewHandle.update(previewState, previewApp);

    const updateUI = () => {
      previewHandle.focus(activeTab === 'hat' ? 'head' : 'full');

      const slots: Tab[] = ['hat', 'shirt', 'pants', 'gloves', 'backpack', 'shoes'];
      const tabsEl = el.querySelector('#boutique-tabs-container') as HTMLElement;
      tabsEl.innerHTML = slots.map(slot =>
        `<button class="ui-btn tab ${slot === activeTab ? 'primary' : ''}" data-tab-select="${slot}">${icon(SLOT_ICONS[slot], { size: 15 })} ${slot.toUpperCase()}</button>`
      ).join('') + `<button class="ui-btn tab ${activeTab === 'style' ? 'primary' : ''}" data-tab-select="style" style="border-color:var(--ui-purple)">${icon('star', { size: 15 })} STYLE</button>`;
      tabsEl.querySelectorAll<HTMLElement>('[data-tab-select]').forEach(b => b.onclick = () => {
        activeTab = b.dataset.tabSelect as Tab;
        updateUI();
      });

      // mannequin readout
      const outfitEl = el.querySelector('#boutique-outfit') as HTMLElement;
      outfitEl.innerHTML = slots.map(slot => {
        const id = previewState[slot];
        const item = id && id !== 'none' ? CLOTHES_DATABASE[id] : null;
        const changed = previewState[slot] !== player.equippedClothes[slot];
        return `<div class="row" style="display:flex;justify-content:space-between">
          <span class="sub">${icon(SLOT_ICONS[slot], { size: 14 })} ${slot}</span>
          <b style="${changed ? 'color:var(--ui-gold)' : ''}">${item ? item.name : '—'}</b></div>`;
      }).join('');

      const listContainer = el.querySelector('#boutique-list-container') as HTMLElement;

      if (activeTab === 'style') {
        const skinSw = SKIN_TONES.map(t => `
          <div class="swatch ${previewApp.skin === t.id ? 'sel' : ''}" data-skin="${t.id}" title="${t.name}">
            <span class="swatch-dot" style="background:#${t.id.toString(16).padStart(6, '0')}"></span>
            <span class="swatch-name">${t.name}</span>
          </div>`).join('');
        const hairSw = HAIR_COLORS.map(t => `
          <div class="swatch ${previewApp.hair === t.id ? 'sel' : ''}" data-haircol="${t.id}" title="${t.name}">
            <span class="swatch-dot" style="background:#${t.id.toString(16).padStart(6, '0')}"></span>
            <span class="swatch-name">${t.name}</span>
          </div>`).join('');
        const styles = HAIRSTYLES.map(h => `
          <div class="list-row" style="${previewApp.hairstyle === h.id ? 'border-color:var(--ui-gold);background:rgba(217,161,26,0.08);' : ''}" data-hairstyle="${h.id}">
            <div style="flex:1"><b>${h.name}</b><div class="sub">${h.desc}</div></div>
            ${previewApp.hairstyle === h.id ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022">IN MIRROR</span>' : ''}
          </div>`).join('');
        const changed = previewApp.skin !== player.appearance.skin || previewApp.hair !== player.appearance.hair || previewApp.hairstyle !== player.appearance.hairstyle;
        listContainer.innerHTML = `
          <div class="sub" style="margin-bottom:6px">Style customization options. Everything is free, darling.</div>
          <h3>Skin tone</h3><div class="swatch-row" style="margin-bottom:10px">${skinSw}</div>
          <h3>Hair color</h3><div class="swatch-row" style="margin-bottom:10px">${hairSw}</div>
          <h3>Hairstyle</h3>${styles}
          ${changed ? '<button class="ui-btn gold" id="style-adopt" style="width:100%;margin-top:8px">Adopt this look</button>' : '<div class="sub" style="margin-top:8px">This is your current look.</div>'}`;
        
        listContainer.querySelectorAll<HTMLElement>('[data-skin]').forEach(b => b.onclick = () => {
          previewApp.skin = parseInt(b.dataset.skin!);
          refreshPreview(); updateUI();
        });
        listContainer.querySelectorAll<HTMLElement>('[data-haircol]').forEach(b => b.onclick = () => {
          previewApp.hair = parseInt(b.dataset.haircol!);
          refreshPreview(); updateUI();
        });
        listContainer.querySelectorAll<HTMLElement>('[data-hairstyle]').forEach(b => b.onclick = () => {
          previewApp.hairstyle = b.dataset.hairstyle as any;
          refreshPreview(); updateUI();
        });
        const adopt = listContainer.querySelector<HTMLElement>('#style-adopt');
        if (adopt) adopt.onclick = () => {
          player.appearance = { ...previewApp };
          const updater = (window as any).__updateActiveTamerAppearance;
          if (updater) updater(player.equippedClothes, player.appearance);
          toast('A whole new you!', 'gold');
          updateUI();
        };
        return;
      }

      const items = Object.values(CLOTHES_DATABASE).filter(item => item.slot === activeTab);
      const canBeNone = ['hat', 'gloves', 'backpack'].includes(activeTab);
      let rowsHtml = '';

      if (canBeNone) {
        const nonePreviewed = previewState[activeTab] === 'none' || !previewState[activeTab];
        const noneEquipped = player.equippedClothes[activeTab] === 'none' || !player.equippedClothes[activeTab];
        let actionBtn = '';
        if (noneEquipped) actionBtn = '<span class="tag" style="background:var(--ui-green);color:#0c1022">EQUIPPED</span>';
        else if (nonePreviewed) actionBtn = '<button class="ui-btn primary" data-wear-none="true">Wear None</button>';
        else actionBtn = '<button class="ui-btn" data-preview-none="true">Try Remove</button>';
        rowsHtml += `
          <div class="list-row" style="${nonePreviewed ? 'border:1px solid var(--ui-green);background:rgba(78,196,94,0.1);' : ''}">
            <div style="flex:1;cursor:pointer" data-preview-none="true">
              <b>None</b>
              <div class="sub">Bare ${activeTab === 'hat' ? 'head' : activeTab === 'gloves' ? 'hands' : 'back'}.</div>
            </div>
            <div>${actionBtn}</div>
          </div>`;
      }

      rowsHtml += items.map(item => {
        const equipped = player.equippedClothes[activeTab] === item.id;
        const tryingOn = previewState[activeTab] === item.id;
        let actionBtn = '';
        if (equipped) {
          actionBtn = `<button class="ui-btn danger" data-unequip="${item.id}">Remove</button>`;
        } else {
          actionBtn = tryingOn
            ? `<button class="ui-btn primary" data-equip="${item.id}">Wear</button>`
            : `<button class="ui-btn" data-try="${item.id}">Try On</button>`;
        }
        const dotColor = item.textureColor ?? (item.color !== undefined ? `#${item.color.toString(16).padStart(6, '0')}` : (item.fx?.color !== undefined ? `#${item.fx.color.toString(16).padStart(6, '0')}` : '#6a7290'));
        const styleBadge = item.textureType ? `<span class="tag" style="background:var(--ui-border);color:var(--ui-text);margin-left:5px">${item.textureType.toUpperCase()}</span>` : '';
        const ultraBadge = item.ultra ? '<span class="tag" style="background:linear-gradient(90deg,#f2c14e,#ff5aa8);color:#0c1022;margin-left:5px">★ ULTRA</span>' : (item.fx ? '<span class="tag" style="background:linear-gradient(90deg,#9a3aff,#ff5aa8);color:#fff;margin-left:5px">✨ FX</span>' : '');
        const previewBadge = (tryingOn && !equipped) ? '<span class="tag" style="background:var(--ui-gold);color:#0c1022;margin-left:5px">IN MIRROR</span>' : '';
        const equippedBadge = equipped ? '<span class="tag" style="background:var(--ui-green);color:#0c1022;margin-left:5px">EQUIPPED</span>' : '';
        return `<div class="list-row" style="${tryingOn ? 'border:1px solid var(--ui-gold);background:rgba(217,161,26,0.1);' : ''}">
          <span class="swatch-dot sq" style="background:${dotColor};flex-shrink:0"></span>
          <div style="flex:1;cursor:pointer" data-row-select="${item.id}">
            <b>${item.name}</b> ${styleBadge} ${ultraBadge} ${previewBadge} ${equippedBadge}
            <div class="sub">${item.desc}</div>
          </div>
          <div style="margin-left:10px">${actionBtn}</div>
        </div>`;
      }).join('');

      listContainer.innerHTML = rowsHtml;

      const tryOn = (id: string) => {
        previewState[activeTab] = id;
        refreshPreview(); updateUI();
      };
      listContainer.querySelectorAll<HTMLElement>('[data-try]').forEach(b => b.onclick = e => { e.stopPropagation(); tryOn(b.dataset.try!); });
      listContainer.querySelectorAll<HTMLElement>('[data-row-select]').forEach(r => r.onclick = () => tryOn(r.dataset.rowSelect!));
      listContainer.querySelectorAll<HTMLElement>('[data-preview-none]').forEach(b => b.onclick = e => { e.stopPropagation(); tryOn('none'); });
      
      listContainer.querySelectorAll<HTMLElement>('[data-equip]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const item = CLOTHES_DATABASE[b.dataset.equip!];
        player.equippedClothes[activeTab] = item.id;
        if (!player.ownedClothes.includes(item.id)) {
          player.ownedClothes.push(item.id);
        }
        player.save(false);
        refreshHUD();
        const updater = (window as any).__updateActiveTamerAppearance;
        if (updater) updater(player.equippedClothes, player.appearance);
        toast('Equipped.');
        updateUI();
      });
      listContainer.querySelectorAll<HTMLElement>('[data-wear-none]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        player.equippedClothes[activeTab] = 'none';
        player.save(false);
        refreshHUD();
        const updater = (window as any).__updateActiveTamerAppearance;
        if (updater) updater(player.equippedClothes, player.appearance);
        toast('Unequipped.');
        updateUI();
      });
      listContainer.querySelectorAll<HTMLElement>('[data-unequip]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        player.equippedClothes[activeTab] = 'none';
        if (previewState[activeTab] === b.dataset.unequip) previewState[activeTab] = 'none';
        player.save(false);
        refreshHUD();
        const updater = (window as any).__updateActiveTamerAppearance;
        if (updater) updater(player.equippedClothes, player.appearance);
        toast('Unequipped.');
        refreshPreview();
        updateUI();
      });
    };
    updateUI();

    (el.querySelector('#boutique-close') as HTMLElement).onclick = () => {
      previewHandle.dispose();
      sfx('cancel');
      closeMenu();
      resolve();
    };
  });
}

function startWorldsParticles(parentEl: HTMLElement, tierId = 'world_championship'): { destroy: () => void } {
  const canvas = document.createElement('canvas');
  canvas.className = 'worlds-particle-canvas';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  parentEl.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => {} };

  let width = (canvas.width = parentEl.clientWidth);
  let height = (canvas.height = parentEl.clientHeight);

  const handleResize = () => {
    width = canvas.width = parentEl.clientWidth;
    height = canvas.height = parentEl.clientHeight;
  };
  window.addEventListener('resize', handleResize);

  interface Particle {
    x: number;
    y: number;
    size: number;
    speedY: number;
    speedX: number;
    alpha: number;
    fadeSpeed: number;
    color: string;
    shape: 'circle' | 'square' | 'bubble' | 'star' | 'lightning';
  }

  const particles: Particle[] = [];
  
  let colors: string[] = ['#f2c14e', '#ffd24e', '#ffffff', '#e8a13a'];
  let shape: 'circle' | 'square' | 'bubble' | 'star' | 'lightning' = 'circle';
  
  if (tierId === 'weekly_open') {
    colors = ['#cd7f32', '#d4af37', '#ffffff', '#e5a05d'];
    shape = 'circle';
  } else if (tierId === 'turmal_seasonal') {
    colors = ['#5ee0d0', '#7fd4ff', '#ffffff', '#76ffd4'];
    shape = 'lightning';
  } else if (tierId === 'foretales_exhibition') {
    colors = ['#ff5ab0', '#ffd24e', '#b15ae8', '#00ffff'];
    shape = 'square';
  } else if (tierId === 'continental_crown') {
    colors = ['#f2d23a', '#5ad88a', '#ffffff', '#ffea75'];
    shape = 'star';
  } else if (tierId === 'aurelia_cup') {
    colors = ['#f2c14e', '#7fe0c0', '#ff8a3a', '#70e0ff'];
    shape = 'bubble';
  } else if (tierId === 'gauntlet_seeds') {
    colors = ['#ff6a3a', '#ff2d55', '#ffb05e', '#cfcfcf'];
    shape = 'circle';
  } else if (tierId === 'sealwatch') {
    colors = ['#b18ae8', '#9b5cff', '#2c1e4c', '#c8b0ff'];
    shape = 'circle';
  } else if (tierId === 'world_championship' || tierId === 'legends_gauntlet') {
    colors = ['#ffd24e', '#fff0b0', '#ffffff', '#ff77aa', '#88eeff'];
    shape = 'star';
  }

  const spawnParticle = () => {
    particles.push({
      x: Math.random() * width,
      y: height + 10,
      size: 1.2 + Math.random() * 2.8,
      speedY: -(0.4 + Math.random() * 1.2),
      speedX: (Math.random() - 0.5) * 0.4,
      alpha: 0.15 + Math.random() * 0.7,
      fadeSpeed: 0.0015 + Math.random() * 0.004,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shape,
    });
  };

  for (let i = 0; i < 24; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1.2 + Math.random() * 2.8,
      speedY: -(0.4 + Math.random() * 1.2),
      speedX: (Math.random() - 0.5) * 0.4,
      alpha: 0.15 + Math.random() * 0.7,
      fadeSpeed: 0.0015 + Math.random() * 0.004,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shape,
    });
  }

  let active = true;
  const anim = () => {
    if (!active) return;
    ctx.clearRect(0, 0, width, height);

    if (Math.random() < 0.22 && particles.length < 80) {
      spawnParticle();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.speedY;
      p.x += p.speedX;
      p.alpha -= p.fadeSpeed;

      if (p.y < -10 || p.alpha <= 0 || p.x < -10 || p.x > width + 10) {
        particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      
      if (p.shape === 'circle') {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.shape === 'bubble') {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        // small bubble highlight
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = p.alpha * 0.5;
        ctx.fill();
      } else if (p.shape === 'star') {
        const cx = p.x;
        const cy = p.y;
        const spikes = 5;
        const outerRadius = p.size * 1.8;
        const innerRadius = p.size * 0.8;
        let rot = Math.PI / 2 * 3;
        let x_pos = cx;
        let y_pos = cy;
        const step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let j = 0; j < spikes; j++) {
          x_pos = cx + Math.cos(rot) * outerRadius;
          y_pos = cy + Math.sin(rot) * outerRadius;
          ctx.lineTo(x_pos, y_pos);
          rot += step;
          x_pos = cx + Math.cos(rot) * innerRadius;
          y_pos = cy + Math.sin(rot) * innerRadius;
          ctx.lineTo(x_pos, y_pos);
          rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'lightning') {
        ctx.moveTo(p.x, p.y - p.size * 1.5);
        ctx.lineTo(p.x - p.size * 0.8, p.y + p.size * 0.1);
        ctx.lineTo(p.x + p.size * 0.2, p.y + p.size * 0.1);
        ctx.lineTo(p.x - p.size * 0.3, p.y + p.size * 1.5);
        ctx.lineTo(p.x + p.size * 0.8, p.y - p.size * 0.1);
        ctx.lineTo(p.x - p.size * 0.2, p.y - p.size * 0.1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
    requestAnimationFrame(anim);
  };

  anim();

  return {
    destroy: () => {
      active = false;
      window.removeEventListener('resize', handleResize);
      canvas.remove();
    },
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function generateTamerAvatar(name: string, baseColor: string): string {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const hash = hashString(name);

  // Deterministic choices
  const skinColors = ['#e8b48a', '#d09268', '#ae7855', '#ffdcb8', '#fce5cd'];
  const hairColors = ['#35261a', '#1e1a18', '#6a3d24', '#b57945', '#deb27c', '#c73a20', '#3b5f8f', '#6c538c'];
  
  const skin = skinColors[hash % skinColors.length];
  const hair = hairColors[(hash >> 2) % hairColors.length];
  const hairStyle = (hash >> 4) % 4; // 0: short, 1: sides, 2: cap, 3: wild
  const eyeColor = ['#2a2a3a', '#3a6c53', '#3a5c6c', '#6c4c3a'][(hash >> 6) % 4];

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, baseColor + '44');
  bg.addColorStop(1, '#0c1022');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);

  // Shoulders (jacket)
  ctx.fillStyle = baseColor;
  ctx.fillRect(20, 100, 88, 28);
  // Shirt inside jacket
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(52, 100, 24, 12);

  // Head/neck
  ctx.fillStyle = skin;
  ctx.fillRect(48, 88, 32, 16); // neck
  ctx.fillRect(34, 38, 60, 56); // head

  // Hair
  ctx.fillStyle = hair;
  if (hairStyle === 0) {
    // short
    ctx.fillRect(30, 28, 68, 16);
    ctx.fillRect(30, 38, 8, 20);
    ctx.fillRect(90, 38, 8, 20);
  } else if (hairStyle === 1) {
    // sides/long
    ctx.fillRect(30, 28, 68, 16);
    ctx.fillRect(30, 38, 12, 40);
    ctx.fillRect(86, 38, 12, 40);
  } else if (hairStyle === 2) {
    // cap/beanie
    ctx.fillStyle = baseColor;
    ctx.fillRect(26, 22, 76, 22);
    ctx.fillStyle = hair;
    ctx.fillRect(30, 44, 8, 12);
    ctx.fillRect(90, 44, 8, 12);
  } else {
    // wild/spiky
    ctx.fillRect(30, 28, 68, 16);
    // spiky chunks
    ctx.fillRect(26, 20, 16, 12);
    ctx.fillRect(48, 18, 16, 12);
    ctx.fillRect(70, 18, 16, 12);
    ctx.fillRect(86, 20, 16, 12);
  }

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(44, 56, 12, 10);
  ctx.fillRect(72, 56, 12, 10);
  ctx.fillStyle = eyeColor;
  ctx.fillRect(48, 58, 6, 8);
  ctx.fillRect(76, 58, 6, 8);

  // Mouth
  ctx.fillStyle = '#a05a4a';
  ctx.fillRect(54, 76, 20, 4);

  return c.toDataURL('image/png');
}

function generateGoldTexture(): string {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#ffe58f');
  grad.addColorStop(0.25, '#d4af37');
  grad.addColorStop(0.5, '#f3d070');
  grad.addColorStop(0.75, '#aa7c11');
  grad.addColorStop(1, '#ffe07a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 200; i++) {
    ctx.globalAlpha = Math.random() * 0.16;
    const w = 4 + Math.random() * 60;
    const h = 1 + Math.random() * 1.5;
    ctx.fillRect(Math.random() * size - w/2, Math.random() * size, w, h);
  }
  
  ctx.fillStyle = '#000000';
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = Math.random() * 0.12;
    const w = 4 + Math.random() * 30;
    const h = 1 + Math.random() * 1.0;
    ctx.fillRect(Math.random() * size - w/2, Math.random() * size, w, h);
  }
  
  return canvas.toDataURL('image/png');
}

export async function showBracketTreeScreen(
  bracket: TournamentBracket,
  currentRoundIndex: number,
  tier: TournamentTier
): Promise<void> {
  return new Promise<void>(resolve => {
    const roundsHtml = [];
    const totalRounds = bracket.roundsCount;

    // Apply content screen expansions
    const contentEl = $('menu-content');
    contentEl.style.width = 'min(1160px, 96vw)';
    contentEl.style.maxHeight = '95vh';

    const restoreStyles = () => {
      contentEl.style.width = '';
      contentEl.style.maxHeight = '';
    };

    const goldTexUrl = generateGoldTexture();

    // Precompute W-L records and competitor map for all formats
    const winCounts: Record<string, number> = {};
    const lossCounts: Record<string, number> = {};
    const competitorMap: Record<string, BracketCompetitor> = {};

    // Initialize counts for all rounds' competitors
    for (const round of bracket.rounds) {
      if (!round) continue;
      for (const c of round) {
        if (c) {
          winCounts[c.id] = 0;
          lossCounts[c.id] = 0;
          competitorMap[c.id] = c;
        }
      }
    }
    // Scan all matches to ensure all competitors are populated
    for (const roundMatches of bracket.matches) {
      if (!roundMatches) continue;
      for (const m of roundMatches) {
        if (m) {
          if (m.competitorA) {
            winCounts[m.competitorA.id] = winCounts[m.competitorA.id] ?? 0;
            lossCounts[m.competitorA.id] = lossCounts[m.competitorA.id] ?? 0;
            competitorMap[m.competitorA.id] = m.competitorA;
          }
          if (m.competitorB) {
            winCounts[m.competitorB.id] = winCounts[m.competitorB.id] ?? 0;
            lossCounts[m.competitorB.id] = lossCounts[m.competitorB.id] ?? 0;
            competitorMap[m.competitorB.id] = m.competitorB;
          }
        }
      }
    }

    // Scan all matches up to the current state and calculate wins/losses
    for (let r = 0; r < bracket.matches.length; r++) {
      const roundMatches = bracket.matches[r];
      if (!roundMatches) continue;
      for (const m of roundMatches) {
        if (m && m.winnerId) {
          winCounts[m.winnerId] = (winCounts[m.winnerId] ?? 0) + 1;
          const loserId = m.winnerId === m.competitorA.id ? m.competitorB.id : m.competitorA.id;
          lossCounts[loserId] = (lossCounts[loserId] ?? 0) + 1;
        }
      }
    }

    const pInstance = Player.activeInstance;
    const canPredict = currentRoundIndex === 0 && pInstance && !pInstance.tournament.predictions;
    const tempPredictions: Record<string, string> = {};

    // Helper function to render a detailed tamer profile modal overlay
    const showTamerProfileModal = (comp: BracketCompetitor) => {
      const wins = winCounts[comp.id] ?? 0;
      const losses = lossCounts[comp.id] ?? 0;
      
      const guildDef = WORLD_GUILDS.find(g => g.id === comp.guildId);
      const guildCrest = guildDef ? (comp.guildId === 'first_fire' ? '🐚' : comp.guildId === 'pearlwake' ? '🌊' : comp.guildId === 'duneward' ? '🏜️' : comp.guildId === 'aurora_lodge' ? '❄️' : comp.guildId === 'grand_houses' ? '🏰' : '🛡️') : '🛡️';
      
      let avatarUrl = '';
      if (comp.isPlayer) {
        const p = Player.activeInstance;
        avatarUrl = p ? avatarURL(p) : '';
      } else {
        avatarUrl = generateTamerAvatar(comp.name, comp.color);
      }
      
      const guardiansHtml = comp.speciesIds.map(sid => {
        const s = SPECIES[sid];
        const typeCol = TYPE_CSS[s?.type] ?? '#999';
        const snapshot = speciesSnapshotURL(sid);
        return `
          <div class="tamer-profile-guardian-card">
            <div class="tamer-profile-guardian-snapshot-wrapper" style="border-color:${typeCol}">
              <img class="tamer-profile-guardian-snapshot" src="${snapshot}" />
            </div>
            <span class="tamer-profile-guardian-name" title="${s?.name ?? sid}">${s?.name ?? sid}</span>
            <span class="tamer-profile-guardian-type" style="background:${typeCol}">${s?.type ?? 'Aether'}</span>
          </div>
        `;
      }).join('');

      // Tamer rating and average stats
      let totalOffense = 0;
      let totalDefense = 0;
      let totalSpeed = 0;
      for (const sid of comp.speciesIds) {
        const s = SPECIES[sid];
        if (s) {
          const b = s.base || { hp: 50, sp: 20, atk: 50, def: 50, spd: 50, wis: 50 };
          totalOffense += (b.atk || 50) + (b.wis || 50);
          totalDefense += (b.hp || 50) + (b.def || 50);
          totalSpeed += b.spd || 50;
        }
      }
      const count = comp.speciesIds.length || 1;
      const avgOff = Math.round(totalOffense / count);
      const avgDef = Math.round(totalDefense / (count * 1.5));
      const avgSpd = Math.round(totalSpeed / count);
      
      const ratingVal = comp.rating;
      const tierBadge = ratingVal >= 1700 ? '<span class="tamer-rating-pill s-tier">S-TIER</span>'
        : ratingVal >= 1450 ? '<span class="tamer-rating-pill a-tier">A-TIER</span>'
        : ratingVal >= 1200 ? '<span class="tamer-rating-pill b-tier">B-TIER</span>'
        : '<span class="tamer-rating-pill c-tier">C-TIER</span>';
      
      const modalHtml = `
        <div class="tamer-profile-modal-overlay" id="tamer-profile-modal">
          <div class="tamer-profile-card">
            <button class="tamer-profile-close-btn" id="tamer-profile-close">&times;</button>
            
            <div class="tamer-profile-header">
              <div class="tamer-profile-avatar-wrapper" style="border-color:${comp.color}">
                <img class="tamer-profile-avatar-img" src="${avatarUrl}" />
              </div>
              <div class="tamer-profile-info">
                <div class="tamer-profile-name" style="color:${comp.color}">${comp.name}</div>
                <div class="tamer-profile-sub">${comp.sub}</div>
                <div class="tamer-profile-meta-row">
                  <span class="tamer-profile-meta-item">📍 ${comp.hometown}</span>
                  <span class="tamer-profile-meta-item">🏆 Rating: ${Math.round(comp.rating)}</span>
                  <span class="tamer-profile-meta-item">📊 Record: ${wins}W - ${losses}L</span>
                </div>
              </div>
            </div>
            
            ${comp.quote ? `<blockquote class="tamer-profile-quote">"${comp.quote}"</blockquote>` : ''}
            
            <div>
              <div class="tamer-profile-section-title">Combat Capability</div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--ui-text); background:rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius:8px; padding:10px;">
                <div>⚔️ Off: <b>${avgOff}</b></div>
                <div>🛡️ Def: <b>${avgDef}</b></div>
                <div>⚡ Spd: <b>${avgSpd}</b></div>
                <div>⭐ Rating: ${tierBadge}</div>
              </div>
            </div>

            <div>
              <div class="tamer-profile-section-title">Guild Alliance</div>
              <div class="tamer-profile-guild-box">
                <div class="tamer-profile-guild-header" style="color:${comp.color}">
                  <span>${guildCrest}</span>
                  <span>${guildDef ? guildDef.name : 'Independent Tamer'}</span>
                  ${guildDef ? `<span style="font-size:10px;color:var(--ui-dim)">(${guildDef.seat}, ${guildDef.continent})</span>` : ''}
                </div>
                <div class="tamer-profile-guild-desc">
                  ${guildDef ? guildDef.desc : 'Fights independently under the compact without guild sponsorship.'}
                </div>
              </div>
            </div>
            
            <div>
              <div class="tamer-profile-section-title">Active Guardian Team</div>
              <div class="tamer-profile-guardians-grid">
                ${guardiansHtml}
              </div>
            </div>
            
          </div>
        </div>
      `;
      
      const modalDiv = document.createElement('div');
      modalDiv.innerHTML = modalHtml;
      const modalElement = modalDiv.firstElementChild as HTMLElement;
      document.body.appendChild(modalElement);
      
      const closeModal = () => {
        sfx('cancel');
        modalElement.remove();
      };
      modalElement.querySelector('#tamer-profile-close')?.addEventListener('click', closeModal);
      modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) closeModal();
      });

      // Holographic 3D Tilt handler
      setTimeout(() => {
        const card = modalElement.querySelector('.tamer-profile-card') as HTMLElement;
        if (card) {
          card.addEventListener('mousemove', (e: MouseEvent) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xc = rect.width / 2;
            const yc = rect.height / 2;
            const rx = -((y - yc) / yc) * 7;
            const ry = ((x - xc) / xc) * 7;
            card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
          });
          card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
          });
        }
      }, 50);
    };

    // Keep track of which matches have animated simulation results
    const animatedMatches = new Set<string>();
    const matchesToAnimate: { r: number; m: number; compA: BracketCompetitor; compB: BracketCompetitor; winnerId: string }[] = [];

    // Pre-populate animated matches for past rounds. Find NPC matches to animate in the current round.
    for (let r = 0; r < totalRounds; r++) {
      const matchCount = bracket.matches[r]?.length ?? 0;
      for (let m = 0; m < matchCount; m++) {
        const matchData = bracket.matches[r][m];
        if (matchData && matchData.winnerId !== undefined) {
          const isNpc = !matchData.competitorA.isPlayer && !matchData.competitorB.isPlayer;
          if (r < currentRoundIndex) {
            animatedMatches.add(`${r}_${m}`);
          } else if (isNpc) {
            matchesToAnimate.push({ r, m, compA: matchData.competitorA, compB: matchData.competitorB, winnerId: matchData.winnerId });
          }
        }
      }
    }

    const renderPolishedSlot = (
      comp: BracketCompetitor,
      isOpponent: boolean,
      r: number,
      m: number,
      winnerId: string | undefined
    ) => {
      const matchKey = `${tier.id}_r${r}_m${m}`;
      const predictedId = pInstance?.tournament.predictions?.[matchKey];
      const isPredicted = predictedId === comp.id;
      const isCorrect = winnerId && predictedId === winnerId;

      const isWinner = winnerId === comp.id;
      const isLoser = winnerId && winnerId !== comp.id;
      
      const isAnimatingThis = matchesToAnimate.some(sim => sim.r === r && sim.m === m);
      const showWinner = isWinner && !isAnimatingThis;
      const showLoser = isLoser && !isAnimatingThis;

      let slotClass = 'trn-tamer-slot-polished';
      if (showWinner) slotClass += ' winner';
      if (showLoser) slotClass += ' loser';
      if (comp.isPlayer) slotClass += ' player-slot';
      if (canPredict && !comp.isPlayer) slotClass += ' predictable';
      if (isPredicted) slotClass += ' predicted';

      const scoreHtml = showWinner ? '<span class="trn-score-badge win">WIN</span>' : showLoser ? '<span class="trn-score-badge loss">LOSS</span>' : '';

      let predictionBadgeHtml = '';
      if (isPredicted) {
        if (winnerId && !isAnimatingThis) {
          predictionBadgeHtml = isCorrect ? '<span class="trn-predict-badge correct">✨ Match!</span>' : '<span class="trn-predict-badge incorrect">❌ Miss</span>';
        } else {
          predictionBadgeHtml = '<span class="trn-predict-badge">Pick</span>';
        }
      }

      // Tamer profile picture
      let avatarHtml = '';
      if (comp.isPlayer) {
        const p = Player.activeInstance;
        const url = p ? avatarURL(p) : '';
        avatarHtml = `<img class="trn-tamer-avatar" src="${url}" />`;
      } else {
        const url = generateTamerAvatar(comp.name, comp.color);
        avatarHtml = `<img class="trn-tamer-avatar" src="${url}" />`;
      }

      // Check record
      const wins = winCounts[comp.id] ?? 0;
      const losses = lossCounts[comp.id] ?? 0;
      const recordStr = `${wins}W - ${losses}L`;

      // Hover preview description
      const previewHtml = `
        <div class="trn-tamer-preview">
          <div class="trn-preview-title" style="color:${comp.color}">${comp.name}</div>
          <div class="trn-preview-meta">📍 Hometown: ${comp.hometown}</div>
          <div class="trn-preview-meta">🏆 Rating: ${Math.round(comp.rating)}</div>
          <div class="trn-preview-meta">💬 "${comp.quote || 'No quote'}"</div>
        </div>
      `;

      const detailsIconHtml = `<span class="trn-tamer-details-icon" title="View Profile" style="margin-left:auto; font-size:10px; opacity:0.6; z-index:10;">ℹ️</span>`;

      return `
        <div class="${slotClass}" id="match-slot-${r}-${m}-${isOpponent ? 1 : 0}">
          <div class="trn-tamer-avatar-frame" style="border-color:${comp.color}; background: radial-gradient(circle, ${comp.color}22 0%, #10121f 100%); color:${comp.color}">
            ${avatarHtml}
          </div>
          <div class="trn-tamer-details">
            <div class="trn-tamer-name-row">
              <span class="trn-tamer-name" style="color:${comp.color}">${comp.name}</span>
              ${detailsIconHtml}
            </div>
            <div class="trn-tamer-sub-row">
              <span class="trn-tamer-guild" style="color:${comp.color}">${comp.sub}</span>
              <span class="trn-tamer-record-badge">${recordStr}</span>
            </div>
          </div>
          <div class="trn-tamer-guardians-row">
            ${comp.speciesIds.map(sid => {
              const s = SPECIES[sid];
              const typeCol = TYPE_CSS[s?.type] ?? '#999';
              const elIcon = s ? elementIcon(TYPE_ELEMENT[s.type], { size: 13 }) : '';
              return `
                <div class="trn-guardian-mini-icon-polished" style="border-color:${typeCol}; background:${typeCol}18" title="${s?.name ?? sid} (${s?.type ?? ''})">
                  <span class="g-el-icon">${elIcon}</span>
                  <span class="g-abbrev" style="color:${typeCol}">${sid.slice(0, 3).toUpperCase()}</span>
                </div>
              `;
            }).join('')}
          </div>
          ${scoreHtml}
          ${predictionBadgeHtml}
          ${previewHtml}
        </div>
      `;
    };

    if (tier.format === 'round_robin') {
      // 1. Group Stage Matchdays (rounds 0, 1, 2)
      for (let r = 0; r < 3; r++) {
        let matchCardsHtml = '';
        for (let m = 0; m < 2; m++) {
          const matchData = bracket.matches[r][m];
          if (!matchData) continue;
          
          const compA = matchData.competitorA;
          const compB = matchData.competitorB;
          const winnerId = matchData.winnerId;

          matchCardsHtml += `
            <div class="trn-matchup" id="match-card-${r}-${m}">
              ${renderPolishedSlot(compA, false, r, m, winnerId)}
              ${renderPolishedSlot(compB, true, r, m, winnerId)}
            </div>
          `;
        }
        roundsHtml.push(`
          <div class="trn-round round-${r}">
            <div style="font-size:10px;color:var(--ui-dim);text-align:center;margin-bottom:4px;font-weight:700;text-transform:uppercase">Matchday ${r+1}</div>
            ${matchCardsHtml}
          </div>
        `);
      }

      // 2. League Standings Column (Column 3)
      const standingsSorted = Object.keys(competitorMap).map(id => ({
        comp: competitorMap[id],
        wins: winCounts[id] ?? 0,
        losses: lossCounts[id] ?? 0,
      })).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

      const tableRows = standingsSorted.map((item, idx) => {
        const isPlayer = item.comp.isPlayer;
        const rowClass = isPlayer ? 'trn-rr-row cs-you' : '';
        return `
          <tr class="${rowClass}">
            <td style="font-weight:800;color:var(--ui-gold)">#${idx + 1}</td>
            <td style="color:${item.comp.color};font-weight:700">${item.comp.name}</td>
            <td style="text-align:center">${item.wins}</td>
            <td style="text-align:center">${item.losses}</td>
          </tr>
        `;
      }).join('');

      const standingsBox = `
        <div class="trn-matchup" id="rr-standings-box" style="padding:10px;background:rgba(12, 16, 34, 0.7);box-sizing:border-box">
          <table class="trn-rr-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Tamer</th>
                <th style="text-align:center">W</th>
                <th style="text-align:center">L</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;

      roundsHtml.push(`
        <div class="trn-round round-3">
          <div style="font-size:10px;color:var(--ui-dim);text-align:center;margin-bottom:4px;font-weight:700;text-transform:uppercase">Group Standings</div>
          ${standingsBox}
        </div>
      `);

      // 3. Final Playoff Column (Column 4)
      let finalCardHtml = '<div style="font-size:11px;color:var(--ui-dim);text-align:center;padding:20px;border:1px dashed rgba(255,255,255,0.06);background:rgba(0,0,0,0.2);border-radius:6px">TBD after Matchday 3</div>';
      
      const finalMatch = bracket.matches[3] && bracket.matches[3][0];
      if (finalMatch) {
        const compA = finalMatch.competitorA;
        const compB = finalMatch.competitorB;
        const winnerId = finalMatch.winnerId;

        finalCardHtml = `
          <div class="trn-matchup" id="match-card-3-0">
            ${renderPolishedSlot(compA, false, 3, 0, winnerId)}
            ${renderPolishedSlot(compB, true, 3, 0, winnerId)}
          </div>
        `;
      }

      roundsHtml.push(`
        <div class="trn-round round-4">
          <div style="font-size:10px;color:var(--ui-gold);text-align:center;margin-bottom:4px;font-weight:700;text-transform:uppercase">Final Playoff</div>
          ${finalCardHtml}
        </div>
      `);
    } else {
      // Standard elimination layout
      for (let r = 0; r < totalRounds; r++) {
        const matchCountInRound = Math.pow(2, totalRounds - 1 - r);
        let matchCardsHtml = '';

        for (let m = 0; m < matchCountInRound; m++) {
          const matchData = bracket.matches[r][m];
          if (!matchData) continue;

          const compA = matchData.competitorA;
          const compB = matchData.competitorB;
          const winnerId = matchData.winnerId;

          const renderSlot = (comp: BracketCompetitor, isOpponent: boolean) => {
            const matchKey = `${tier.id}_r${r}_m${m}`;
            const predictedId = pInstance?.tournament.predictions?.[matchKey];
            const isPredicted = predictedId === comp.id;
            const isCorrect = winnerId && predictedId === winnerId;

            const isWinner = winnerId === comp.id;
            const isLoser = winnerId && winnerId !== comp.id;
            
            const isAnimatingThis = matchesToAnimate.some(sim => sim.r === r && sim.m === m);
            const showWinner = isWinner && !isAnimatingThis;
            const showLoser = isLoser && !isAnimatingThis;
            
            let slotClass = 'trn-tamer-slot';
            if (showWinner) slotClass += ' winner';
            if (showLoser) slotClass += ' loser';
            if (comp.isPlayer) slotClass += ' player-slot';
            if (canPredict && !comp.isPlayer) slotClass += ' predictable';
            if (isPredicted) slotClass += ' predicted';

            const scoreHtml = showWinner ? '<span class="trn-score-badge win">WIN</span>' : showLoser ? '<span class="trn-score-badge loss">LOSS</span>' : '';

            let predictionBadgeHtml = '';
            if (isPredicted) {
              if (winnerId && !isAnimatingThis) {
                predictionBadgeHtml = isCorrect ? '<span class="trn-predict-badge correct">✨ Match!</span>' : '<span class="trn-predict-badge incorrect">❌ Miss</span>';
              } else {
                predictionBadgeHtml = '<span class="trn-predict-badge">Pick</span>';
              }
            }

            // Tamer profile picture
            let avatarHtml = '';
            if (comp.isPlayer) {
              const p = Player.activeInstance;
              const url = p ? avatarURL(p) : '';
              avatarHtml = `<img class="trn-tamer-avatar" src="${url}" />`;
            } else {
              const url = generateTamerAvatar(comp.name, comp.color);
              avatarHtml = `<img class="trn-tamer-avatar" src="${url}" />`;
            }

            // Check record
            const wins = winCounts[comp.id] ?? 0;
            const losses = lossCounts[comp.id] ?? 0;
            const recordStr = `${wins}W - ${losses}L`;

            const previewHtml = `
              <div class="trn-tamer-preview">
                <div class="trn-preview-title" style="color:${comp.color}">${comp.name}</div>
                <div class="trn-preview-meta">📍 Hometown: ${comp.hometown}</div>
                <div class="trn-preview-meta">🏆 Rating: ${Math.round(comp.rating)}</div>
                <div class="trn-preview-meta">💬 "${comp.quote || 'No quote'}"</div>
              </div>
            `;

            const detailsIconHtml = `<span class="trn-tamer-details-icon" title="View Profile" style="margin-left:auto; font-size:10px; opacity:0.6; z-index:10;">ℹ️</span>`;

            return `
              <div class="${slotClass}" id="match-slot-${r}-${m}-${isOpponent ? 1 : 0}">
                <div class="trn-tamer-avatar-frame" style="border-color:${comp.color}; background: radial-gradient(circle, ${comp.color}22 0%, #10121f 100%); color:${comp.color}">
                  ${avatarHtml}
                </div>
                <div class="trn-tamer-details">
                  <div class="trn-tamer-name-row">
                    <span class="trn-tamer-name" style="color:${comp.color}">${comp.name}</span>
                    ${detailsIconHtml}
                  </div>
                  <div class="trn-tamer-sub-row">
                    <span class="trn-tamer-guild" style="color:${comp.color}">${comp.sub}</span>
                    <span class="trn-tamer-record-badge">${recordStr}</span>
                  </div>
                </div>
                <div class="trn-tamer-guardians-row">
                  ${comp.speciesIds.map(sid => {
                    const s = SPECIES[sid];
                    const typeCol = TYPE_CSS[s?.type] ?? '#999';
                    const elIcon = s ? elementIcon(TYPE_ELEMENT[s.type], { size: 13 }) : '';
                    return `
                      <div class="trn-guardian-mini-icon-polished" style="border-color:${typeCol}; background:${typeCol}18" title="${s?.name ?? sid} (${s?.type ?? ''})">
                        <span class="g-el-icon">${elIcon}</span>
                        <span class="g-abbrev" style="color:${typeCol}">${sid.slice(0, 3).toUpperCase()}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
                ${scoreHtml}
                ${predictionBadgeHtml}
                ${previewHtml}
              </div>
            `;
          };

          matchCardsHtml += `
            <div class="trn-matchup" id="match-card-${r}-${m}">
              ${renderSlot(compA, false)}
              ${renderSlot(compB, true)}
            </div>
          `;
        }

        roundsHtml.push(`
          <div class="trn-round round-${r}">
            ${matchCardsHtml}
          </div>
        `);
      }
    }

    const roundName = currentRoundIndex < totalRounds ? tier.rounds[currentRoundIndex].name : 'Tournament Completed';

    const playerComp = bracket.rounds[0].find(c => c.isPlayer) || { name: 'You' };
    let vsText = 'Spectating';
    if (currentRoundIndex < totalRounds) {
      const playerMatch = bracket.matches[currentRoundIndex]?.find(m => m.competitorA.isPlayer || m.competitorB.isPlayer);
      if (playerMatch) {
        const opponentComp = playerMatch.competitorA.isPlayer ? playerMatch.competitorB : playerMatch.competitorA;
        vsText = `${playerComp.name} vs ${opponentComp.name}`;
      } else {
        vsText = 'Spectator Mode';
      }
    } else {
      vsText = 'Completed';
    }

    const isWorlds = tier.id === 'world_championship';
    const isLegends = tier.classKind === 'Legends';
    const isEpic = isWorlds || isLegends;

    // Predictions Slip Banner HTML
    let predictBannerHtml = '';
    if (canPredict) {
      predictBannerHtml = `
        <div class="trn-predict-banner">
          <div class="trn-predict-title-wrap">
            <div class="trn-predict-banner-title">✨ Bracket Predictions open!</div>
            <div class="trn-predict-banner-desc">Click on the tamers you predict will win to build your prediction slip. Correct guesses earn ${SHARD}150 Shards!</div>
          </div>
          <div class="trn-predict-actions">
            <button class="ui-btn" id="trn-lock-predictions" style="border: 1px solid var(--ui-gold); color: var(--ui-gold); font-size:11px; padding: 4px 12px; height:auto; cursor:pointer;">Lock Predictions</button>
          </div>
        </div>
      `;
    }

    // Dramatic Title Card Splash
    const showTitleCard = currentRoundIndex === 0 || currentRoundIndex === totalRounds - 2 || currentRoundIndex === totalRounds - 1;
    let titleCardHtml = '';
    if (showTitleCard && currentRoundIndex < totalRounds) {
      const stageName = currentRoundIndex === 0 ? 'Tournament Commences' 
        : currentRoundIndex === totalRounds - 2 ? 'Semifinals'
        : 'The Grand Finals';
      
      titleCardHtml = `
        <div class="trn-title-card-overlay">
          <div class="trn-title-card-text">${tier.short}</div>
          <div class="trn-title-card-sub">${stageName}</div>
        </div>
      `;
    }

    const html = `
      <div class="trn-bracket-screen-wrapper">
        <div class="trn-bracket-container ${isEpic ? 'trn-worlds-mode' : ''}">
          ${isEpic ? `<div class="worlds-logo-glow"></div><div class="worlds-grid-overlay"></div>` : ''}
          ${titleCardHtml}
          <div class="trn-bracket-header ${isEpic ? 'worlds-header' : ''}">
            <div class="trn-bracket-title ${isEpic ? 'worlds-title' : ''}">${isEpic ? '🏆 ' : ''}${tier.name} — ${roundName}${isEpic ? ' 🏆' : ''}</div>
            <div class="trn-bracket-venue ${isEpic ? 'worlds-venue' : ''}">📍 ${tier.venue}</div>
          </div>
          ${predictBannerHtml}
          <div class="trn-bracket-rounds" id="trn-rounds-wrapper">
            ${roundsHtml.join('')}
          </div>
          <svg class="trn-bracket-overlay-svg" id="trn-svg-overlay"></svg>
        </div>

        <div class="trn-side-fight-panel">
          <div class="trn-side-fight-header">Coliseum</div>
          <div class="trn-side-fight-subheader">Tournament Match</div>
          
          <div class="trn-side-fight-status-box">
            <div class="status-label">Next Match</div>
            <div class="status-vs-tamers">${vsText}</div>
            <div class="status-round">${roundName}</div>
          </div>
          
          <button class="trn-premium-fight-btn" id="trn-bracket-ok" style="background-image: url(${goldTexUrl});">
            <div class="fight-btn-shine"></div>
            <div class="fight-btn-glow"></div>
            <span class="fight-btn-text">${currentRoundIndex < totalRounds ? 'Fight!' : 'Close'}</span>
          </button>
        </div>
      </div>
    `;

    const el = openScreen(html);

    let particlesDestroyer: (() => void) | null = null;
    const container = el.querySelector('.trn-bracket-container') as HTMLElement;
    if (container) {
      const particles = startWorldsParticles(container, tier.id);
      particlesDestroyer = () => particles.destroy();
    }
    sfx('open');
    if (isEpic) {
      setTimeout(() => {
        sfx('crowd_roar');
      }, 300);
    }

    // Play title card sound
    if (showTitleCard && currentRoundIndex < totalRounds) {
      sfx('achievement');
      sfx('crowd_roar');
    }

    // Interactive sound effects for hovering slots
    el.querySelectorAll('.trn-tamer-slot-polished, .trn-tamer-slot').forEach((slot: any) => {
      slot.addEventListener('mouseenter', () => {
        sfx('blip');
      });
    });

    // Details button click handlers (opens tamer profile modal)
    el.querySelectorAll('.trn-tamer-details-icon').forEach((icon: any) => {
      icon.addEventListener('click', (e: Event) => {
        e.stopPropagation(); // Prevent slot prediction toggle
        const slot = icon.closest('.trn-tamer-slot, .trn-tamer-slot-polished');
        if (slot) {
          const idParts = slot.id.split('-');
          if (idParts.length >= 5) {
            const rVal = parseInt(idParts[2]);
            const mVal = parseInt(idParts[3]);
            const isOppVal = parseInt(idParts[4]) === 1;
            const matchData = bracket.matches[rVal]?.[mVal];
            const comp = matchData ? (isOppVal ? matchData.competitorB : matchData.competitorA) : null;
            if (comp) {
              sfx('click');
              showTamerProfileModal(comp);
            }
          }
        }
      });
    });

    // Click handlers for tamer slots (opens modal OR predicts winner)
    el.querySelectorAll('.trn-tamer-slot, .trn-tamer-slot-polished').forEach((slot: any) => {
      slot.addEventListener('click', () => {
        const idParts = slot.id.split('-');
        if (idParts.length >= 5) {
          const rVal = parseInt(idParts[2]);
          const mVal = parseInt(idParts[3]);
          const isOppVal = parseInt(idParts[4]) === 1;
          const matchKey = `${tier.id}_r${rVal}_m${mVal}`;
          
          let comp: BracketCompetitor | undefined;
          const matchData = bracket.matches[rVal]?.[mVal];
          if (matchData) {
            comp = isOppVal ? matchData.competitorB : matchData.competitorA;
          }
          
          if (!comp) return;

          if (canPredict) {
            // Register prediction
            tempPredictions[matchKey] = comp.id;
            
            // Visual DOM updates: remove previous predicted class from both slots, add to this one
            const matchCard = el.querySelector(`#match-card-${rVal}-${mVal}`);
            if (matchCard) {
              matchCard.querySelectorAll('.trn-tamer-slot, .trn-tamer-slot-polished').forEach((s: any) => {
                s.classList.remove('predicted');
                s.querySelector('.trn-predict-badge')?.remove();
              });
              slot.classList.add('predicted');
              const badge = document.createElement('span');
              badge.className = 'trn-predict-badge';
              badge.innerText = 'Pick';
              slot.appendChild(badge);
              sfx('blip');
            }
            return;
          }

          // Non-predicting: normal profile modal
          sfx('click');
          showTamerProfileModal(comp);
        }
      });
    });

    // Handle Lock Predictions click
    const lockBtn = el.querySelector('#trn-lock-predictions') as HTMLElement | null;
    if (lockBtn && pInstance) {
      lockBtn.onclick = () => {
        pInstance.tournament.predictions = { ...tempPredictions };
        pInstance.save(false);
        sfx('confirm');
        toast('Predictions locked in! Good luck.', 'gold');
        restoreStyles();
        closeMenu();
        resolve(showBracketTreeScreen(bracket, currentRoundIndex, tier));
      };
    }

    const drawConnectorLines = () => {
      const svg = el.querySelector('#trn-svg-overlay') as SVGSVGElement | null;
      if (!svg) return;
      
      svg.innerHTML = '';
      const containerRect = el.querySelector('.trn-bracket-container')!.getBoundingClientRect();

      if (tier.format === 'round_robin') {
        // Draw round robin connecting lines:
        // Matchday 3 matches connect to the Standings Box
        const standingsBox = el.querySelector('#rr-standings-box');
        if (!standingsBox) return;
        const standingsRect = standingsBox.getBoundingClientRect();

        const xTargetStandings = standingsRect.left - containerRect.left;
        const yTargetStandings = (standingsRect.top + standingsRect.bottom) / 2 - containerRect.top;

        for (let m = 0; m < 2; m++) {
          const matchCard = el.querySelector(`#match-card-2-${m}`);
          if (!matchCard) continue;
          
          const matchRect = matchCard.getBoundingClientRect();
          const xStart = matchRect.right - containerRect.left;
          const yStart = (matchRect.top + matchRect.bottom) / 2 - containerRect.top;
          
          const dx = (xTargetStandings - xStart) / 2;
          const pathD = `M ${xStart} ${yStart} H ${xStart + dx} V ${yTargetStandings} H ${xTargetStandings}`;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathD);
          path.setAttribute('class', 'trn-connector-path completed');
          path.style.stroke = 'rgba(255,255,255,0.08)';
          svg.appendChild(path);
        }

        // Standings box connects to Final Playoff slot 0 and 1
        const finalCard = el.querySelector('#match-card-3-0');
        if (finalCard) {
          const finalRect = finalCard.getBoundingClientRect();
          const xStartStandings = standingsRect.right - containerRect.left;
          const yStartStandings = (standingsRect.top + standingsRect.bottom) / 2 - containerRect.top;

          for (let s = 0; s < 2; s++) {
            const slot = el.querySelector(`#match-slot-3-0-${s}`);
            if (!slot) continue;
            
            const slotRect = slot.getBoundingClientRect();
            const xEnd = slotRect.left - containerRect.left;
            const yEnd = (slotRect.top + slotRect.bottom) / 2 - containerRect.top;
            
            const dx = (xEnd - xStartStandings) / 2;
            const pathD = `M ${xStartStandings} ${yStartStandings} H ${xStartStandings + dx} V ${yEnd} H ${xEnd}`;
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);

            const finalMatch = bracket.matches[3] && bracket.matches[3][0];
            const isCompleted = finalMatch && finalMatch.winnerId !== undefined;
            
            let lineClass = 'trn-connector-path';
            if (isCompleted) {
              lineClass += ' completed';
              const winner = finalMatch.winnerId === finalMatch.competitorA.id ? finalMatch.competitorA : finalMatch.competitorB;
              path.style.color = winner.color;
              path.style.stroke = winner.color;
            } else if (currentRoundIndex === 3) {
              lineClass += ' active';
            }
            path.setAttribute('class', lineClass);
            svg.appendChild(path);
          }
        }
      } else {
        // Standard elimination lines
        for (let r = 0; r < totalRounds - 1; r++) {
          const matchCount = Math.pow(2, totalRounds - 1 - r);
          for (let m = 0; m < matchCount; m++) {
            const sourceCard = el.querySelector(`#match-card-${r}-${m}`);
            if (!sourceCard) continue;

            const targetSlotIndex = m % 2;
            const targetMatchIndex = Math.floor(m / 2);
            const targetSlot = el.querySelector(`#match-slot-${r+1}-${targetMatchIndex}-${targetSlotIndex}`);
            if (!targetSlot) continue;

            const sourceRect = sourceCard.getBoundingClientRect();
            const targetRect = targetSlot.getBoundingClientRect();

            const x1 = sourceRect.right - containerRect.left;
            const y1 = (sourceRect.top + sourceRect.bottom) / 2 - containerRect.top;

            const x2 = targetRect.left - containerRect.left;
            const y2 = (targetRect.top + targetRect.bottom) / 2 - containerRect.top;

            const dx = (x2 - x1) / 2;
            const pathD = `M ${x1} ${y1} H ${x1 + dx} V ${y2} H ${x2}`;

            const matchData = bracket.matches[r][m];
            
            // Completed state grows as simulation sequences finish
            const isCompleted = matchData && matchData.winnerId !== undefined && (r < currentRoundIndex || animatedMatches.has(`${r}_${m}`) || matchData.competitorA.isPlayer || matchData.competitorB.isPlayer);
            const isPlayerPath = matchData && (matchData.competitorA.isPlayer || matchData.competitorB.isPlayer || (matchData.winnerId === 'player'));

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);
            
            let lineClass = 'trn-connector-path';
            if (isCompleted) {
              lineClass += ' completed';
              const winner = matchData.winnerId === matchData.competitorA.id ? matchData.competitorA : matchData.competitorB;
              path.style.color = winner.color;
              path.style.stroke = winner.color;
            } else if (isPlayerPath && r === currentRoundIndex) {
              lineClass += ' active';
            }
            
            path.setAttribute('class', lineClass);
            svg.appendChild(path);
          }
        }
      }
    };

    setTimeout(drawConnectorLines, 100);

    const resizeObserver = new ResizeObserver(() => {
      drawConnectorLines();
    });
    const wrapper = el.querySelector('#trn-rounds-wrapper');
    if (wrapper) resizeObserver.observe(wrapper);

    const okBtn = el.querySelector('#trn-bracket-ok') as HTMLButtonElement;

    // Simulation animation execution loop
    const runSimulations = async () => {
      if (matchesToAnimate.length === 0 || canPredict) return;

      if (okBtn) {
        okBtn.disabled = true;
        okBtn.innerText = 'Simulating...';
      }

      for (const sim of matchesToAnimate) {
        const matchCard = el.querySelector(`#match-card-${sim.r}-${sim.m}`) as HTMLElement;
        if (!matchCard) continue;

        // Scroll to make sure it's visible in smaller screen layouts
        matchCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Highlight matchup clashing
        matchCard.classList.add('clashing');
        
        // Flicker slots to simulate action roll
        const slotA = el.querySelector(`#match-slot-${sim.r}-${sim.m}-0`) as HTMLElement;
        const slotB = el.querySelector(`#match-slot-${sim.r}-${sim.m}-1`) as HTMLElement;
        
        sfx('charge');
        for (let step = 0; step < 10; step++) {
          if (slotA && slotB) {
            if (step % 2 === 0) {
              slotA.style.background = 'rgba(255, 255, 255, 0.12)';
              slotB.style.background = 'transparent';
            } else {
              slotA.style.background = 'transparent';
              slotB.style.background = 'rgba(255, 255, 255, 0.12)';
            }
          }
          sfx('blip');
          await new Promise(r => setTimeout(r, 70));
        }

        // Reset slots backgrounds
        if (slotA) slotA.style.background = '';
        if (slotB) slotB.style.background = '';
        matchCard.classList.remove('clashing');

        // Flash shockwave effect
        const flashEl = document.createElement('div');
        flashEl.className = 'trn-clash-impact-flash flash-active';
        matchCard.appendChild(flashEl);

        sfx('boom');
        sfx('crowd_roar');

        // Apply visual classes for winners & losers
        const winSlot = sim.winnerId === sim.compA.id ? slotA : slotB;
        const loseSlot = sim.winnerId === sim.compA.id ? slotB : slotA;
        
        if (winSlot) {
          winSlot.classList.add('winner');
          const badge = document.createElement('span');
          badge.className = 'trn-score-badge win';
          badge.innerText = 'WIN';
          winSlot.appendChild(badge);
        }
        if (loseSlot) {
          loseSlot.classList.add('loser');
          const badge = document.createElement('span');
          badge.className = 'trn-score-badge loss';
          badge.innerText = 'LOSS';
          loseSlot.appendChild(badge);
        }

        // Update prediction marker live!
        const matchKey = `${tier.id}_r${sim.r}_m${sim.m}`;
        const predictedId = pInstance?.tournament.predictions?.[matchKey];
        if (predictedId) {
          const predSlot = predictedId === sim.compA.id ? slotA : slotB;
          if (predSlot) {
            const isCorrect = predictedId === sim.winnerId;
            const predBadge = document.createElement('span');
            predBadge.className = `trn-predict-badge ${isCorrect ? 'correct' : 'incorrect'}`;
            predBadge.innerHTML = isCorrect ? '✨ Match!' : '❌ Miss';
            predSlot.appendChild(predBadge);
            
            if (isCorrect) {
              sfx('achievement');
              toast(`✨ Prediction Match: ${sim.winnerId === sim.compA.id ? sim.compA.name : sim.compB.name}!`, 'gold');
            }
          }
        }

        // Complete connector paths
        animatedMatches.add(`${sim.r}_${sim.m}`);
        drawConnectorLines();

        setTimeout(() => flashEl.remove(), 400);
        await new Promise(r => setTimeout(r, 600));
      }

      if (okBtn) {
        okBtn.disabled = false;
        okBtn.innerText = currentRoundIndex < totalRounds ? 'Fight!' : 'Close';
      }
    };

    // Run simulations after title card screen has faded out
    const simDelay = showTitleCard ? 2000 : 800;
    setTimeout(runSimulations, simDelay);

    okBtn.onclick = () => {
      if (canPredict) {
        sfx('toastBad');
        toast('Lock predictions or view bracket options above!', 'red');
        return;
      }
      resizeObserver.disconnect();
      if (particlesDestroyer) particlesDestroyer();
      sfx('click');
      restoreStyles();
      closeMenu();
      resolve();
    };
  });
}

export async function showTournamentMatchIntro(
  playerComp: BracketCompetitor,
  opponentComp: BracketCompetitor,
  tier: TournamentTier,
  roundName: string
): Promise<void> {
  return new Promise<void>(resolve => {
    sfx('open');
    sfx('crowd_roar');
    sfx('whoosh');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'trn-vs-overlay';

    // Letterbox bars
    const topBar = document.createElement('div');
    topBar.className = 'trn-vs-letterbox-top';
    const bottomBar = document.createElement('div');
    bottomBar.className = 'trn-vs-letterbox-bottom';
    overlay.appendChild(topBar);
    overlay.appendChild(bottomBar);

    // Banner tag
    const bannerTag = document.createElement('div');
    bannerTag.className = 'trn-vs-banner-tag';
    bannerTag.innerHTML = `🏆 ${tier.name} &nbsp;·&nbsp; ${roundName} 🏆`;
    overlay.appendChild(bannerTag);

    // Get avatars
    let playerAvatar = '';
    const p = Player.activeInstance;
    if (p) playerAvatar = avatarURL(p);
    const opponentAvatar = generateTamerAvatar(opponentComp.name, opponentComp.color);

    // Build party HTML for player
    const playerPartyHtml = playerComp.speciesIds.map(sid => {
      const s = SPECIES[sid];
      const typeCol = TYPE_CSS[s?.type] ?? '#999';
      const snap = speciesSnapshotURL(sid);
      return `
        <div class="trn-vs-guardian-card" style="border-color: ${typeCol}44">
          <div class="trn-vs-guardian-snap-wrap" style="border: 1px solid ${typeCol}">
            <img class="trn-vs-guardian-snap" src="${snap}" />
          </div>
          <div class="trn-vs-guardian-name" style="color: ${typeCol}">${s?.name ?? sid}</div>
        </div>
      `;
    }).join('');

    // Build party HTML for opponent
    const opponentPartyHtml = opponentComp.speciesIds.map(sid => {
      const s = SPECIES[sid];
      const typeCol = TYPE_CSS[s?.type] ?? '#999';
      const snap = speciesSnapshotURL(sid);
      return `
        <div class="trn-vs-guardian-card" style="border-color: ${typeCol}44">
          <div class="trn-vs-guardian-snap-wrap" style="border: 1px solid ${typeCol}">
            <img class="trn-vs-guardian-snap" src="${snap}" />
          </div>
          <div class="trn-vs-guardian-name" style="color: ${typeCol}">${s?.name ?? sid}</div>
        </div>
      `;
    }).join('');

    const container = document.createElement('div');
    container.className = 'trn-vs-container';
    container.innerHTML = `
      <div class="trn-vs-column left" style="border-color: ${playerComp.color}44">
        <div class="trn-vs-avatar-wrapper" style="border-color: ${playerComp.color}">
          <img class="trn-vs-avatar-img" src="${playerAvatar}" />
        </div>
        <div class="trn-vs-name" style="color: ${playerComp.color}">${playerComp.name}</div>
        <div class="trn-vs-sub">${playerComp.sub}</div>
        <div class="trn-vs-guardians">
          ${playerPartyHtml}
        </div>
      </div>

      <div class="trn-vs-center">
        <div class="trn-vs-logo">VS</div>
      </div>

      <div class="trn-vs-column right" style="border-color: ${opponentComp.color}44">
        <div class="trn-vs-avatar-wrapper" style="border-color: ${opponentComp.color}">
          <img class="trn-vs-avatar-img" src="${opponentAvatar}" />
        </div>
        <div class="trn-vs-name" style="color: ${opponentComp.color}">${opponentComp.name}</div>
        <div class="trn-vs-sub">${opponentComp.sub}</div>
        <div class="trn-vs-guardians">
          ${opponentPartyHtml}
        </div>
      </div>
    `;
    overlay.appendChild(container);

    // Opponent quote box
    if (opponentComp.quote) {
      const quoteBox = document.createElement('div');
      quoteBox.className = 'trn-vs-quote-box';
      quoteBox.innerHTML = `"${opponentComp.quote}"`;
      overlay.appendChild(quoteBox);
    }

    // Enter Coliseum button
    const enterBtn = document.createElement('button');
    enterBtn.className = 'trn-vs-btn-enter';
    enterBtn.innerText = 'Enter Arena';
    overlay.appendChild(enterBtn);

    // Screen flash overlay
    const flash = document.createElement('div');
    flash.className = 'trn-screen-flash';
    document.body.appendChild(flash);

    document.body.appendChild(overlay);

    // Trigger visual screen shake on clash
    setTimeout(() => {
      sfx('crit');
      const leftCol = overlay.querySelector('.trn-vs-column.left') as HTMLElement;
      const rightCol = overlay.querySelector('.trn-vs-column.right') as HTMLElement;
      if (leftCol && rightCol) {
        leftCol.style.boxShadow = `0 15px 40px rgba(0,0,0,0.8), 0 0 30px ${playerComp.color}66`;
        rightCol.style.boxShadow = `0 15px 40px rgba(0,0,0,0.8), 0 0 30px ${opponentComp.color}66`;
      }
      overlay.style.animation = 'matchClashShake 0.2s';
    }, 850);

    enterBtn.onclick = () => {
      sfx('boom');
      flash.classList.add('flash-active');
      setTimeout(() => {
        overlay.remove();
        flash.remove();
        resolve();
      }, 750);
    };
  });
}

export async function showGuildWarMatchIntro(
  playerComp: BracketCompetitor,
  opponentComp: BracketCompetitor,
  tier: TournamentTier,
  roundName: string,
  playerRank: string,
  opponentRank: string,
  oppLine: string,
  replySpeaker: string,
  replyLine: string
): Promise<void> {
  return new Promise<void>(resolve => {
    sfx('open');
    sfx('crowd_roar');
    sfx('whoosh');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'gvg-vs-overlay';

    // Letterbox bars
    const topBar = document.createElement('div');
    topBar.className = 'gvg-vs-letterbox-top';
    const bottomBar = document.createElement('div');
    bottomBar.className = 'gvg-vs-letterbox-bottom';
    overlay.appendChild(topBar);
    overlay.appendChild(bottomBar);

    // Header tag
    const headerTag = document.createElement('div');
    headerTag.className = 'gvg-vs-header-tag';
    headerTag.innerHTML = `
      <span class="gvg-header-clash">GUILD WARS MATCHUP</span>
      <span class="gvg-header-sub">${tier.name} &nbsp;·&nbsp; ${roundName}</span>
    `;
    overlay.appendChild(headerTag);

    // Get avatars
    let playerAvatar = '';
    const p = Player.activeInstance;
    if (p) playerAvatar = avatarURL(p);
    const opponentAvatar = generateTamerAvatar(opponentComp.name, opponentComp.color);

    // Get crests
    const playerCrest = playerComp.guildId ? guildIconURL(playerComp.guildId, 256) : '';
    const opponentCrest = opponentComp.guildId ? guildIconURL(opponentComp.guildId, 256) : '';

    // Build party HTML for player
    const playerPartyHtml = playerComp.speciesIds.map(sid => {
      const s = SPECIES[sid];
      const typeCol = TYPE_CSS[s?.type] ?? '#999';
      const snap = speciesSnapshotURL(sid);
      return `
        <div class="gvg-vs-guardian-card" style="border-color: ${typeCol}44">
          <div class="gvg-vs-guardian-snap-wrap" style="border: 1px solid ${typeCol}">
            <img class="gvg-vs-guardian-snap" src="${snap}" />
          </div>
          <div class="gvg-vs-guardian-name" style="color: ${typeCol}">${s?.name ?? sid}</div>
        </div>
      `;
    }).join('');

    // Build party HTML for opponent
    const opponentPartyHtml = opponentComp.speciesIds.map(sid => {
      const s = SPECIES[sid];
      const typeCol = TYPE_CSS[s?.type] ?? '#999';
      const snap = speciesSnapshotURL(sid);
      return `
        <div class="gvg-vs-guardian-card" style="border-color: ${typeCol}44">
          <div class="gvg-vs-guardian-snap-wrap" style="border: 1px solid ${typeCol}">
            <img class="gvg-vs-guardian-snap" src="${snap}" />
          </div>
          <div class="gvg-vs-guardian-name" style="color: ${typeCol}">${s?.name ?? sid}</div>
        </div>
      `;
    }).join('');

    const container = document.createElement('div');
    container.className = 'gvg-vs-container';
    container.innerHTML = `
      <div class="gvg-vs-column left" style="--guild-color: ${playerComp.color}">
        ${playerCrest ? `<div class="gvg-vs-bg-crest" style="background-image: url('${playerCrest}')"></div>` : ''}
        <div class="gvg-rank-plate ${playerRank.toLowerCase().replace(/\s+/g, '')}">
          ${playerRank}
        </div>
        <div class="gvg-vs-avatar-wrapper">
          <img class="gvg-vs-avatar-img" src="${playerAvatar}" />
        </div>
        <div class="gvg-vs-name" style="color: ${playerComp.color}">${playerComp.name}</div>
        <div class="gvg-vs-sub">${playerComp.sub}</div>
        <div class="gvg-vs-guardians">
          ${playerPartyHtml}
        </div>
      </div>

      <div class="gvg-vs-center">
        <div class="gvg-vs-clash-shield">
          <div class="gvg-vs-clash-text">VS</div>
        </div>
      </div>

      <div class="gvg-vs-column right" style="--guild-color: ${opponentComp.color}">
        ${opponentCrest ? `<div class="gvg-vs-bg-crest" style="background-image: url('${opponentCrest}')"></div>` : ''}
        <div class="gvg-rank-plate ${opponentRank.toLowerCase().replace(/\s+/g, '')}">
          ${opponentRank}
        </div>
        <div class="gvg-vs-avatar-wrapper">
          <img class="gvg-vs-avatar-img" src="${opponentAvatar}" />
        </div>
        <div class="gvg-vs-name" style="color: ${opponentComp.color}">${opponentComp.name}</div>
        <div class="gvg-vs-sub">${opponentComp.sub}</div>
        <div class="gvg-vs-guardians">
          ${opponentPartyHtml}
        </div>
      </div>
    `;
    overlay.appendChild(container);

    // Drama dialogue box
    const dramaBox = document.createElement('div');
    dramaBox.className = 'gvg-vs-drama-box';
    dramaBox.innerHTML = `
      <div class="gvg-drama-line">
        <span class="gvg-drama-speaker" style="color: ${opponentComp.color}">${opponentComp.name} (${opponentRank})</span>
        <span class="gvg-drama-text">"${oppLine}"</span>
      </div>
      <div class="gvg-drama-line">
        <span class="gvg-drama-speaker" style="color: var(--ui-gold)">📣 ${replySpeaker} (from bench)</span>
        <span class="gvg-drama-text">"${replyLine}"</span>
      </div>
    `;
    overlay.appendChild(dramaBox);

    // Enter Arena button
    const enterBtn = document.createElement('button');
    enterBtn.className = 'gvg-vs-btn-enter';
    enterBtn.innerText = 'Enter Arena';
    overlay.appendChild(enterBtn);

    // Screen flash overlay
    const flash = document.createElement('div');
    flash.className = 'trn-screen-flash';
    document.body.appendChild(flash);

    document.body.appendChild(overlay);

    // Trigger visual screen shake on clash
    setTimeout(() => {
      sfx('crit');
      const leftCol = overlay.querySelector('.gvg-vs-column.left') as HTMLElement;
      const rightCol = overlay.querySelector('.gvg-vs-column.right') as HTMLElement;
      if (leftCol && rightCol) {
        leftCol.style.boxShadow = `0 20px 50px rgba(0,0,0,0.8), 0 0 30px ${playerComp.color}66`;
        rightCol.style.boxShadow = `0 20px 50px rgba(0,0,0,0.8), 0 0 30px ${opponentComp.color}66`;
      }
      overlay.style.animation = 'matchClashShake 0.2s';
    }, 850);

    enterBtn.onclick = () => {
      sfx('boom');
      flash.classList.add('flash-active');
      setTimeout(() => {
        overlay.remove();
        flash.remove();
        resolve();
      }, 750);
    };
  });
}
