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
import type { Player } from './state';
import { speciesSnapshotURL } from './snapshots';
import { openGuardianCard } from './guardiancard';
import { CORRUPTED_LEGION, LEGION_WAR_SUMMARY } from './lore';

const TYPE_ORDER: GType[] = ['Blaze', 'Tide', 'Verdant', 'Volt', 'Gale', 'Umbra'];
const BOSS_IDS = new Set(['ironhusk', 'gravemaw', 'voltigarch', ...CORRUPTED_LEGION.map(l => l.speciesId)]);

interface EvoChain { type: GType; nodes: { sp: SpeciesDef; lvFromPrev: number | null }[]; }

/** Build every evolution chain, walking forward from each root form. */
function buildChains(): EvoChain[] {
  const evolvedInto = new Set<string>();
  Object.values(SPECIES).forEach(s => { if (s.evolvesTo) evolvedInto.add(s.evolvesTo.species); });
  const chains: EvoChain[] = [];
  for (const root of Object.values(SPECIES)) {
    if (evolvedInto.has(root.id) || BOSS_IDS.has(root.id)) continue;
    const nodes: EvoChain['nodes'] = [{ sp: root, lvFromPrev: null }];
    let cur = root;
    const guard = new Set([root.id]);
    while (cur.evolvesTo && !guard.has(cur.evolvesTo.species)) {
      const next = SPECIES[cur.evolvesTo.species];
      if (!next) break;
      nodes.push({ sp: next, lvFromPrev: cur.evolvesTo.level });
      guard.add(next.id);
      cur = next;
    }
    chains.push({ type: root.type, nodes });
  }
  chains.sort((a, b) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.nodes.length - a.nodes.length);
  return chains;
}

let chainsCache: EvoChain[] | null = null;
const chains = (): EvoChain[] => (chainsCache ??= buildChains());

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
      <div class="evo-els" title="${elementsOf(sp.id).join(' · ')}">${elementsOf(sp.id).map(e => ELEMENT_ICONS[e]).join('')}</div>
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
    `<th style="color:${ELEMENT_CSS[e]}" title="${e}">${ELEMENT_ICONS[e]}</th>`).join('')}</tr>`;
  for (const a of ELEMENTS) {
    html += `<tr><th style="color:${ELEMENT_CSS[a]};text-align:left">${ELEMENT_ICONS[a]} ${a}</th>`;
    for (const d of ELEMENTS) {
      const m = ELEMENT_CHART[a]?.[d] ?? 1.0;
      html += `<td style="${cellColor(m)}">${m === 1 ? '–' : `×${m}`}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return `
    <details class="el-details">
      <summary>⚖️ Elemental Damage Table — how the ten elements interact (click to expand)</summary>
      <div class="sub" style="margin:6px 0">Attacks multiply against <i>every</i> element a defender carries.
      <b style="color:${ELEMENT_CSS.Aether}">Aether</b> is special: it strikes all elements harder and resists everything except Light and Dark.</div>
      ${html}
    </details>`;
}

/** Panel body HTML for the Evolution Atlas. */
export function evoTreeHTML(p: Player): string {
  const owned = ownedSpecies(p);
  const total = new Set(chains().flatMap(c => c.nodes.map(n => n.sp.id))).size;
  const ownedCount = [...owned.keys()].filter(id => !BOSS_IDS.has(id)).length;

  let html = `
    <h3>🧬 Evolution Atlas</h3>
    <div class="sub" style="margin-bottom:10px">
      Every known Guardian line of Aurel — click any form to open its Guardian Card.
      Forms in your care glow gold. <b class="goldcol">${ownedCount}/${total}</b> forms collected.
    </div>
    ${damageTableHTML()}
    <div class="evo-scroll">`;

  let lastType: GType | null = null;
  for (const chain of chains()) {
    if (chain.type !== lastType) {
      lastType = chain.type;
      html += `<div class="evo-type-head" style="color:${TYPE_CSS[chain.type]};border-color:${TYPE_CSS[chain.type]}">
        ${chain.type.toUpperCase()} LINES</div>`;
    }
    html += `<div class="evo-chain">`;
    chain.nodes.forEach((n, i) => {
      if (i > 0) html += `<div class="evo-arrow"><span>Lv ${n.lvFromPrev}</span>⟶</div>`;
      html += nodeHTML(n.sp, owned);
    });
    html += `</div>`;
  }

  // corrupted sentinels appendix
  html += `<div class="evo-type-head" style="color:var(--ui-red);border-color:var(--ui-red)">⚠ CORRUPTED SENTINELS</div><div class="evo-chain">`;
  for (const id of ['ironhusk', 'gravemaw', 'voltigarch']) html += nodeHTML(SPECIES[id], owned);
  html += `</div>`;

  // the Corrupted Legion — nine sealed generals of Ghandra
  html += `<div class="evo-type-head" style="color:#ff4a5e;border-color:#ff4a5e">☠ THE CORRUPTED LEGION — SEALED IN GHANDRA</div>
    <div class="sub" style="margin:2px 0 8px">${LEGION_WAR_SUMMARY}</div>`;
  html += `<div class="evo-chain" style="border-color:rgba(232,36,58,0.45)">`;
  for (const gen of CORRUPTED_LEGION) {
    const sp = SPECIES[gen.speciesId];
    if (!sp) continue;
    html += `
      <div class="evo-node" data-card="${sp.id}" title="${gen.title} — commander of ${gen.army}">
        <div class="evo-thumb" style="border-color:#ff4a5e">
          <img data-snap="${sp.id}" alt="${sp.name}">
        </div>
        <div class="evo-name" style="color:#ff8a9a">${sp.name}</div>
        <div class="evo-stage">${gen.title}</div>
        <div class="evo-els" title="${elementsOf(sp.id).join(' · ')}">${elementsOf(sp.id).map(e => ELEMENT_ICONS[e]).join('')}</div>
      </div>`;
  }
  html += `</div></div>`;
  return html;
}

/** Wire clicks + progressively fill in 3D thumbnails (one per frame). */
export function wireEvoTree(el: HTMLElement, p: Player, busyGuard?: { busy: boolean }): void {
  const imgs = [...el.querySelectorAll<HTMLImageElement>('img[data-snap]')];
  let i = 0;
  let cancelled = false;
  const fill = () => {
    if (cancelled || i >= imgs.length) return;
    const img = imgs[i++];
    if (img.isConnected) img.src = speciesSnapshotURL(img.dataset.snap!, 128);
    else { cancelled = true; return; }
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
}
