// ============================================================
// AZ Tamer — Evolution Atlas: every species line in the world,
// grouped by element, with live-rendered 3D model thumbnails,
// evolution-level arrows, ownership markers, and clickable
// Guardian Cards for each form.
// ============================================================
import {
  SPECIES, TYPE_CSS, ELEMENTS, ELEMENT_CHART, ELEMENT_CSS, ELEMENT_ICONS,
  elementsOf, type GType, type SpeciesDef,
} from './data';
import { elementIcon, icon } from './icons';
import type { Player } from './state';
import { speciesSnapshotURL, legendSnapshotURL } from './snapshots';
import { openGuardianCard } from './guardiancard';
import { sfx } from './audio';
import { CORRUPTED_LEGION, LEGION_WAR_SUMMARY, LEGENDS, LEGEND_GUARDIANS } from './lore';

const TYPE_ORDER: GType[] = ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether'];
const BOSS_IDS = new Set(['ironhusk', 'gravemaw', 'voltigarch', ...CORRUPTED_LEGION.map(l => l.speciesId)]);

interface EvoChain { type: GType; nodes: { sp: SpeciesDef; lvFromPrev: number | null }[]; }

/** Build every evolution chain, walking forward from each root form. */
function buildChains(p: Player): EvoChain[] {
  const evolvedInto = new Set<string>();
  // ascension targets continue the main chain; Split alts (extraEvolvesTo) stay
  // as their own short roots, matching how the existing extra-evos are shown.
  Object.values(SPECIES).forEach(s => {
    if (s.evolvesTo) evolvedInto.add(s.evolvesTo.species);
    if (s.ascendsTo) evolvedInto.add(s.ascendsTo.species);
  });
  const chains: EvoChain[] = [];
  for (const root of Object.values(SPECIES)) {
    if (evolvedInto.has(root.id) || BOSS_IDS.has(root.id)) continue;
    if (root.isFusion && !p.flags['unlocked_fusion_' + root.id]) continue;
    const nodes: EvoChain['nodes'] = [{ sp: root, lvFromPrev: null }];
    let cur = root;
    const guard = new Set([root.id]);
    // Walk the linear evolvesTo chain, then keep climbing the ascension ladder
    // (Split → Special → Terra → Transcendence → Aether) via ascendsTo.
    while (true) {
      const step = (cur.evolvesTo && !guard.has(cur.evolvesTo.species))
        ? { species: cur.evolvesTo.species, level: cur.evolvesTo.level }
        : (cur.ascendsTo && !guard.has(cur.ascendsTo.species))
          ? { species: cur.ascendsTo.species, level: cur.ascendsTo.level ?? null }
          : null;
      if (!step) break;
      const next = SPECIES[step.species];
      if (!next) break;
      nodes.push({ sp: next, lvFromPrev: step.level });
      guard.add(next.id);
      cur = next;
    }
    chains.push({ type: root.type, nodes });
  }
  chains.sort((a, b) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.nodes.length - a.nodes.length);
  return chains;
}

const chains = (p: Player): EvoChain[] => buildChains(p);

function ownedSpecies(p: Player): Map<string, { level: number; nickname: string }> {
  const m = new Map<string, { level: number; nickname: string }>();
  for (const g of [...p.party, ...p.reserve]) {
    const prev = m.get(g.speciesId);
    if (!prev || g.level > prev.level) m.set(g.speciesId, { level: g.level, nickname: g.nickname });
  }
  return m;
}

function nodeHTML(sp: SpeciesDef, owned: Map<string, { level: number; nickname: string }>): string {
  const own = owned.get(sp.id);
  return `
    <div class="evo-node ${own ? 'owned' : ''}" data-card="${sp.id}" title="Open ${sp.name}'s Guardian Card">
      <div class="evo-thumb" style="border-color:${TYPE_CSS[sp.type]}">
        <img data-snap="${sp.id}" alt="${sp.name}">
        ${own ? `<div class="evo-owned-pip">✓</div>` : ''}
      </div>
      <div class="evo-name" style="color:${TYPE_CSS[sp.type]}">${sp.name}</div>
      <div class="evo-stage">${sp.stage}${own ? ` · Lv${own.level}` : ''}</div>
      <div class="evo-els" title="${elementsOf(sp.id).join(' · ')}">${elementsOf(sp.id).map(e => elementIcon(e, { size: 14 })).join('')}</div>
    </div>`;
}

/** The full 10-element damage table, rendered as a colored grid. */
function damageTableHTML(): string {
  const cellColor = (m: number) =>
    m >= 1.5 ? 'background:rgba(232,58,90,0.45);color:#ffb8c4'
    : m > 1 ? 'background:rgba(232,58,90,0.22);color:#f2a0ac'
    : m === 1 ? 'color:#5a607a'
    : m >= 0.75 ? 'background:rgba(90,123,216,0.20);color:#9ab0e8'
    : 'background:rgba(90,123,216,0.40);color:#c0d0ff';
  let html = `<table class="el-table"><tr><th>ATK ↓ / DEF →</th>${ELEMENTS.map(e =>
    `<th style="color:${ELEMENT_CSS[e]}" title="${e}">${elementIcon(e, { size: 14 })}</th>`).join('')}</tr>`;
  for (const a of ELEMENTS) {
    html += `<tr><th style="color:${ELEMENT_CSS[a]};text-align:left">${elementIcon(a, { size: 14 })} ${a}</th>`;
    for (const d of ELEMENTS) {
      const m = ELEMENT_CHART[a]?.[d] ?? 1.0;
      html += `<td style="${cellColor(m)}">${m === 1 ? '–' : `×${m}`}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return `
    <details class="el-details">
      <summary>${icon('gem', { size: 15 })} Elemental Damage Table — how the ten elements interact (click to expand)</summary>
      <div class="sub" style="margin:6px 0">Attacks multiply against <i>every</i> element a defender carries.
      <b style="color:${ELEMENT_CSS.Aether}">Aether</b> is special: it strikes all elements harder and resists everything except Light and Dark.</div>
      ${html}
    </details>`;
}

/** Panel body HTML for the Evolution Atlas. */
export function evoTreeHTML(p: Player): string {
  const owned = ownedSpecies(p);
  const total = new Set(chains(p).flatMap(c => c.nodes.map(n => n.sp.id))).size;
  const ownedCount = [...owned.keys()].filter(id => !BOSS_IDS.has(id)).length;

  const tabs = ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether', 'Corrupted'];
  
  const tabIcons: Record<string, string> = {
    Blaze: '🔥', Tide: '💧', Verdant: '🌿', Volt: '⚡', Gale: '🌀',
    Umbra: '🌑', Lumen: '✨', Gaia: '🪨', Frost: '❄️', Aether: '🌠', Corrupted: '☠️'
  };

  const tabLores: Record<string, string> = {
    Blaze: 'Harness the volatile, explosive power of fire and plasma. Fiery physical strikers and devastating area damage.',
    Tide: 'Command the shifting ocean currents and deep pressure. Specialized in healing, tactical barriers, and high SP capacity.',
    Verdant: 'Commune with the ancient roots and toxic spores of Aurel. Mastery over health siphons, poisons, and defensive shields.',
    Volt: 'Unleash high-frequency electric currents and magnetic pulses. Extremely fast attackers that paralyze foes and chain damage.',
    Gale: 'Ride the localized windstorms and atmospheric pressure waves. Highly elusive wind and speed-based species.',
    Umbra: 'Tap into the void energy and shadows of the abyssal plane. Life-drainers, debuffs, and unpredictable critical strikes.',
    Lumen: 'Channel the purifying celestial solar light. Extreme wisdom-based damage, absolute wisdom shields, and status cleansing.',
    Gaia: 'Draw strength from the tectonic plates and dense mineral crusts. High physical defense, heavy physical impact, and ground stability.',
    Frost: 'Freeze the battlefield with glazed sub-zero ice crystals. High defense, slow-down debuffs, and projectile barrages.',
    Aether: 'The cosmic fabric that binds space, time, and legend. Holds the highest-tier Ascended forms and the sovereign non-evolving Legends.',
    Corrupted: 'Unstable dark anomalies twisted by anomalous Ghandra energy. Immune to standard taming, possessing terrifying power.'
  };

  const chainsByType = new Map<GType, EvoChain[]>();
  for (const chain of chains(p)) {
    if (!chainsByType.has(chain.type)) chainsByType.set(chain.type, []);
    chainsByType.get(chain.type)!.push(chain);
  }

  let tabHTML = `<div class="evo-tabs-bar">`;
  tabs.forEach(t => {
    const color = t === 'Corrupted' ? 'var(--ui-red)' : TYPE_CSS[t as GType] || '#fff';
    const icon = tabIcons[t] || '';
    
    let badgeText = '';
    let pct = 0;
    
    if (t === 'Corrupted') {
      badgeText = '25 Sentinels';
    } else {
      const elementChains = chainsByType.get(t as GType) || [];
      const tabSpecies = new Set(elementChains.flatMap(c => c.nodes.map(n => n.sp.id)));
      const tabTotal = tabSpecies.size;
      const tabOwned = [...tabSpecies].filter(id => owned.has(id)).length;
      badgeText = `${tabOwned}/${tabTotal} Owned`;
      pct = tabTotal > 0 ? (tabOwned / tabTotal) * 100 : 0;
    }
    
    tabHTML += `
      <button class="evo-tab-btn" data-evotab="${t}" style="--tab-color: ${color}">
        <span class="evo-tab-glow"></span>
        <span class="evo-tab-name">${icon} ${t.toUpperCase()}</span>
        <span class="evo-tab-count">${badgeText}</span>
        ${t !== 'Corrupted' ? `
          <div class="evo-tab-progress">
            <div class="evo-tab-progress-fill" style="width: ${pct}%"></div>
          </div>
        ` : ''}
        <span class="evo-tab-icon-watermark">${icon}</span>
      </button>`;
  });
  tabHTML += `</div>`;

  let sectionsHTML = '';
  const typesList: GType[] = ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra', 'Lumen', 'Gaia', 'Frost', 'Aether'];
  typesList.forEach(t => {
    sectionsHTML += `<div class="evo-tab-section" data-tab-sec="${t}" style="display: none;">`;
    const color = TYPE_CSS[t];
    const icon = tabIcons[t];
    const desc = tabLores[t];
    sectionsHTML += `
      <div class="evo-element-banner" style="background: linear-gradient(135deg, ${color}22, ${color}0b); border: 1px solid ${color}66; box-shadow: 0 0 15px ${color}15">
        <div class="evo-banner-watermark">${icon}</div>
        <h2 style="color: ${color}; text-shadow: 0 0 10px ${color}aa; margin: 0; letter-spacing: 2px; position: relative; z-index: 1">${t.toUpperCase()} LINEAGES</h2>
        <div style="font-size: 0.88em; opacity: 0.9; margin-top: 5px; position: relative; z-index: 1">${desc}</div>
      </div>
      <div class="evo-chains-container">`;
    
    const elementChains = chainsByType.get(t) || [];
    elementChains.forEach(chain => {
      sectionsHTML += `<div class="evo-chain">`;
      chain.nodes.forEach((n, i) => {
        if (i > 0) sectionsHTML += `<div class="evo-arrow"><span>Lv ${n.lvFromPrev}</span>⟶</div>`;
        sectionsHTML += nodeHTML(n.sp, owned);
      });
      sectionsHTML += `</div>`;
    });
    
    if (t === 'Aether') {
      sectionsHTML += `<div class="evo-type-subhead" style="color:${ELEMENT_CSS.Aether}; border-color:${ELEMENT_CSS.Aether}; margin-top: 20px">🌠 AETHER — THE LEGENDS' NINE</div>
        <div class="sub" style="margin:2px 0 12px">The personal Guardians of the Big Three. Bonded for life, they do not evolve.</div>`;
      for (const legend of LEGENDS) {
        sectionsHTML += `<div class="evo-chain" style="border-color:${legend.color}66">
          <div class="evo-legend-owner" style="min-width:96px; text-align:center; align-self:center">
            <div style="color:${legend.color}; font-weight:bold">${legend.name}</div>
            <div class="sub" style="font-size:0.78em">${legend.title}</div>
          </div>`;
        for (const g of legend.guardians) {
          sectionsHTML += `
            <div class="evo-node" data-legend="${g.name}" title="${g.name} — ${g.epithet}">
              <div class="evo-thumb" style="border-color:${legend.color}">
                <img data-legendsnap="${g.name}" alt="${g.name}">
              </div>
              <div class="evo-name" style="color:${legend.color}">${g.name}</div>
              <div class="evo-stage">${g.epithet}</div>
              <div class="evo-els" title="${g.elements.join(' · ')}">${g.elements.map(e => elementIcon(e, { size: 14 })).join('')}</div>
            </div>`;
        }
        sectionsHTML += `</div>`;
      }
    }
    
    sectionsHTML += `</div></div>`;
  });

  sectionsHTML += `<div class="evo-tab-section" data-tab-sec="Corrupted" style="display: none;">`;
  sectionsHTML += `
    <div class="evo-element-banner" style="background: linear-gradient(135deg, rgba(232,58,90,0.22), rgba(232,58,90,0.05)); border: 1px solid rgba(232,58,90,0.6); box-shadow: 0 0 15px rgba(232,58,90,0.15)">
      <div class="evo-banner-watermark">☠️</div>
      <h2 style="color: var(--ui-red); text-shadow: 0 0 10px rgba(232,58,90,0.6); margin: 0; letter-spacing: 2px; position: relative; z-index: 1">CORRUPTED SENTINELS & LEGION</h2>
      <div style="font-size: 0.88em; opacity: 0.9; margin-top: 5px; position: relative; z-index: 1">${tabLores.Corrupted}</div>
    </div>`;
  sectionsHTML += `<div class="sub" style="margin:6px 0 12px">Defeat these dark anomalies in Ghandra / high dungeons. They cannot be regular captured.</div>
    </div>
    <div class="evo-type-subhead" style="color:var(--ui-red); border-color:var(--ui-red)">⚠ CORRUPTED SENTINELS</div>
    <div class="evo-chain">`;
  for (const id of ['ironhusk', 'gravemaw', 'voltigarch']) {
    sectionsHTML += nodeHTML(SPECIES[id], owned);
  }
  sectionsHTML += `</div>`;

  sectionsHTML += `<div class="evo-type-subhead" style="color:#ff4a5e; border-color:#ff4a5e; margin-top: 20px">☠ THE CORRUPTED LEGION — SEALED IN GHANDRA</div>
    <div class="sub" style="margin:2px 0 12px">${LEGION_WAR_SUMMARY}</div>`;
  sectionsHTML += `<div class="evo-chain" style="border-color:rgba(232,36,58,0.45)">`;
  for (const gen of CORRUPTED_LEGION) {
    const sp = SPECIES[gen.speciesId];
    if (!sp) continue;
    sectionsHTML += `
      <div class="evo-node" data-card="${sp.id}" title="${gen.title} — commander of ${gen.army}">
        <div class="evo-thumb" style="border-color:#ff4a5e">
          <img data-snap="${sp.id}" alt="${sp.name}">
        </div>
        <div class="evo-name" style="color:#ff8a9a">${sp.name}</div>
        <div class="evo-stage">${gen.title}</div>
        <div class="evo-els" title="${elementsOf(sp.id).join(' · ')}">${elementsOf(sp.id).map(e => elementIcon(e, { size: 14 })).join('')}</div>
      </div>`;
  }
  sectionsHTML += `</div></div>`;

  return `
    <h3>${icon('evolutions', { size: 18 })} Evolution Atlas</h3>
    <div class="sub" style="margin-bottom:10px">
      Every known Guardian line of Aurel — click any form to open its Guardian Card.
      Forms in your care glow gold. <b class="goldcol">${ownedCount}/${total}</b> forms collected.
    </div>
    ${damageTableHTML()}
    <details class="el-details" style="margin-top:6px; margin-bottom:15px">
      <summary>${icon('leaderboard', { size: 15 })} Forms & the Form-Block — why a beginner can't dent a god</summary>
      <div class="sub" style="margin:6px 0">Every Guardian has a <b>form rank</b> (0–8), set by how far it has evolved:
      Novice → Adept → Elite → Apex → <b style="color:#ffd24e">Split</b> (branches into two) →
      <b style="color:#ffd24e">Special</b> → <b style="color:#ffd24e">Terra</b> →
      <b style="color:#ffd24e">Transcendence</b> → <b style="color:${ELEMENT_CSS.Aether}">Aether</b>
      (the boss tier — the Big Three's Nine stand here as 8th-form legends).
      When a lower-form Guardian attacks a higher one it is <i>out-classed</i>: the defender shrugs off
      <b>5% of the damage per form it stands above the attacker</b> (up to 40%), <i>on top of</i> the elemental table above.
      So a beginner barely scratches an Apex — and an Aether boss takes full force on everything it touches.</div>
    </details>
    ${tabHTML}
    <div class="evo-scroll">
      ${sectionsHTML}
    </div>`;
}

/** A lore card for one of the Legends' nine — overlay with portrait, elements and story. */
function openLegendLore(guardianName: string): void {
  const entry = LEGEND_GUARDIANS.find(lg => lg.guardian.name === guardianName);
  if (!entry) return;
  const { owner, guardian: g } = entry;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;
    background:rgba(6,8,18,0.78);backdrop-filter:blur(3px);cursor:pointer;`;
  overlay.innerHTML = `
    <div style="max-width:430px;width:92%;background:linear-gradient(170deg,#141a30,#0a0e20);
      border:1px solid ${owner.color};border-radius:14px;padding:18px 20px;cursor:default;
      box-shadow:0 0 40px ${owner.color}55, inset 0 0 60px rgba(0,0,0,0.4);color:#dde2f2;
      font-family:inherit">
      <div style="display:flex;gap:14px;align-items:center">
        <img src="${legendSnapshotURL(g.name, 256)}" alt="${g.name}"
          style="width:118px;height:118px;border-radius:12px;border:1.5px solid ${owner.color};
          background:radial-gradient(circle at 50% 35%, #1c2444, #0a0e20)">
        <div>
          <div style="font-size:1.3em;font-weight:bold;color:${owner.color}">${g.name}</div>
          <div style="opacity:0.85;font-style:italic;margin:2px 0 6px">${g.epithet}</div>
          <div style="font-size:0.85em;opacity:0.8">Bonded to <b style="color:${owner.color}">${owner.name} ${owner.title}</b></div>
          <div style="margin-top:6px;font-size:1.05em" title="${g.elements.join(' · ')}">
            ${g.elements.map(e => `<span style="color:${ELEMENT_CSS[e]}">${elementIcon(e, { size: 14 })} ${e}</span>`).join(' &nbsp;')}
          </div>
        </div>
      </div>
      <div style="margin-top:12px;line-height:1.5;font-size:0.93em;opacity:0.92">${g.desc}</div>
      <div style="margin-top:12px;text-align:right">
        <button class="ui-btn" data-close>Close</button>
      </div>
    </div>`;
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  document.body.appendChild(overlay);
}

/** Wire clicks + progressively fill in 3D thumbnails (one per frame). */
export function wireEvoTree(el: HTMLElement, p: Player, busyGuard?: { busy: boolean }): void {
  const imgs = [
    ...el.querySelectorAll<HTMLImageElement>('img[data-snap]'),
    ...el.querySelectorAll<HTMLImageElement>('img[data-legendsnap]'),
  ];
  let i = 0;
  let cancelled = false;
  const fill = () => {
    if (cancelled || i >= imgs.length) return;
    const img = imgs[i++];
    if (!img.isConnected) { cancelled = true; return; }
    img.src = img.dataset.snap
      ? speciesSnapshotURL(img.dataset.snap, 128)
      : legendSnapshotURL(img.dataset.legendsnap!, 128);
    requestAnimationFrame(fill);
  };
  requestAnimationFrame(fill);

  el.querySelectorAll<HTMLElement>('[data-card]').forEach(node => node.onclick = async () => {
    if (busyGuard?.busy) return;
    if (busyGuard) busyGuard.busy = true;
    const id = node.dataset.card!;
    const ownedG = [...p.party, ...p.reserve]
      .filter(g => g.speciesId === id)
      .sort((a, b) => b.level - a.level)[0];
    await openGuardianCard(ownedG ?? id, p);
    if (busyGuard) busyGuard.busy = false;
  });

  el.querySelectorAll<HTMLElement>('[data-legend]').forEach(node => node.onclick = async () => {
    if (busyGuard?.busy) return;
    if (busyGuard) busyGuard.busy = true;
    const name = node.dataset.legend!;
    const entry = LEGEND_GUARDIANS.find(lg => lg.guardian.name === name);
    if (entry) {
      const speciesId = name.toLowerCase();
      const ownedG = [...p.party, ...p.reserve]
        .filter(g => g.speciesId === speciesId)
        .sort((a, b) => b.level - a.level)[0];
      await openGuardianCard(ownedG ?? speciesId, p);
    }
    if (busyGuard) busyGuard.busy = false;
  });

  // Tab switching logic
  const btns = el.querySelectorAll<HTMLButtonElement>('.evo-tab-btn');
  const sections = el.querySelectorAll<HTMLElement>('.evo-tab-section');
  
  const showTab = (tabName: string) => {
    btns.forEach(btn => {
      const active = btn.dataset.evotab === tabName;
      btn.classList.toggle('active', active);
    });
    sections.forEach(sec => {
      const match = sec.dataset.tabSec === tabName;
      sec.style.display = match ? 'block' : 'none';
    });
  };
  
  btns.forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.evotab!;
      sfx('click');
      showTab(t);
    };
  });
  
  showTab('Blaze');
}
