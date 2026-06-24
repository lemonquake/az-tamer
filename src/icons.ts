// ============================================================
// AZ Tamer — hand-built inline-SVG icon set (NO emojis).
// One canonical source for every glyph used in the Tablet UI and
// across panels/cards/battle. Icons are 24×24, theme via `color`
// (drives currentColor). Line icons inherit the <svg> stroke
// defaults; filled glyphs set fill="currentColor" per-path and use
// translucent black (#0000xx) for interior shading so they read on
// any element colour.
//
// Dependency direction: data.ts → icons.ts (icons imports nothing
// from the game so there is never an import cycle). Element colours
// are mirrored from data.ts ELEMENT_CSS; keep the two in sync.
// ============================================================

export interface IconOpts {
  /** px (width & height). Default 22. */
  size?: number;
  /** Any CSS colour. Drives currentColor. Default: inherit (gold/text from context). */
  color?: string;
  /** Extra class(es) on the <svg>. */
  cls?: string;
  /** Stroke width for line icons. Default 1.8. */
  sw?: number;
  /** Inline style appended after color. */
  style?: string;
}

/** Wrap inner SVG markup in a themed <svg>. Line icons inherit fill:none/stroke:currentColor. */
function wrap(inner: string, o: IconOpts = {}): string {
  const { size = 22, color, cls = '', sw = 1.8, style = '' } = o;
  const css = `${color ? `color:${color};` : ''}${style}`;
  return `<svg class="azic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" `
    + `${css ? `style="${css}" ` : ''}aria-hidden="true">${inner}</svg>`;
}

// ---------------- glyph library (inner markup only) ----------------
// Line glyphs: just paths (inherit svg stroke). Filled glyphs: explicit fill.
const G: Record<string, string> = {
  // ---- navigation / panel tabs ----
  tamer: `<circle cx="12" cy="8" r="3.6"/><path d="M5 19.5c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6"/>`,
  items: `<path d="M6.2 9h11.6v8.5a2 2 0 0 1-2 2H8.2a2 2 0 0 1-2-2z"/><path d="M9 9V7.2a3 3 0 0 1 6 0V9"/><path d="M9.5 12.6h5"/>`,
  guardians: `<ellipse cx="7.4" cy="9.6" rx="1.6" ry="2.1" fill="currentColor" stroke="none"/><ellipse cx="11.9" cy="8.1" rx="1.7" ry="2.3" fill="currentColor" stroke="none"/><ellipse cx="16.4" cy="9.6" rx="1.6" ry="2.1" fill="currentColor" stroke="none"/><path d="M12 12c2.7 0 4.9 1.9 4.9 4.1 0 1.9-1.7 2.7-3.5 2.7-.6 0-1-.1-1.4-.1s-.8.1-1.4.1c-1.8 0-3.5-.8-3.5-2.7C7.1 13.9 9.3 12 12 12z" fill="currentColor" stroke="none"/>`,
  crawler: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 4v3.4M12 16.6V20M4 12h3.4M16.6 12H20M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/>`,
  journal: `<path d="M12 6.6C10.4 5.3 8.1 4.8 5.4 5.2A1 1 0 0 0 4.6 6.2v10.5a1 1 0 0 0 1.2 1c2.4-.4 4.6.1 6.2 1.3 1.6-1.2 3.8-1.7 6.2-1.3a1 1 0 0 0 1.2-1V6.2a1 1 0 0 0-.8-1c-2.7-.4-5 .1-6.6 1.4z"/><path d="M12 6.6v12.4"/>`,
  evolutions: `<circle cx="6" cy="12" r="2.2"/><circle cx="17" cy="6.6" r="2.2"/><circle cx="17" cy="17.4" r="2.2"/><path d="M8 11.1l7-3.6M8 12.9l7 3.6"/>`,
  leaderboard: `<path d="M8 4h8v3.6a4 4 0 0 1-8 0z"/><path d="M8 4.8H5.6a2.4 2.4 0 0 0 0 4.8H8.2M16 4.8h2.4a2.4 2.4 0 0 1 0 4.8H15.8"/><path d="M12 11.6v2.8M9.2 19h5.6M10 19c0-1.6.8-2.6 2-2.6s2 1 2 2.6"/>`,

  // ---- system / chrome ----
  power: `<path d="M12 3.5v7.2"/><path d="M7.4 7.2a7 7 0 1 0 9.2 0"/>`,
  lock: `<rect x="5.4" y="10.8" width="13.2" height="9" rx="2.2"/><path d="M8 10.8V8.2a4 4 0 0 1 8 0v2.6"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/>`,
  unlock: `<rect x="5.4" y="10.8" width="13.2" height="9" rx="2.2"/><path d="M8 10.8V8.2a4 4 0 0 1 7.6-1.8"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/>`,
  save: `<path d="M6 4h10l4 4v11a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 4v5h7V4"/><rect x="8.8" y="12.6" width="6.4" height="6.4" rx="0.6"/>`,
  close: `<path d="M7 7l10 10M17 7L7 17"/>`,
  soundOn: `<path d="M5 9.2v5.6h3l4.2 3V6.2L8 9.2z" fill="currentColor" stroke="none"/><path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2"/><path d="M18.2 7.2a6.6 6.6 0 0 1 0 9.6"/>`,
  soundOff: `<path d="M5 9.2v5.6h3l4.2 3V6.2L8 9.2z" fill="currentColor" stroke="none"/><path d="M16 9.6l5 4.8M21 9.6l-5 4.8"/>`,
  map: `<path d="M9 4L3.6 6.1v13.3L9 17.3l6 2.6 5.4-2.1V4.4L15 6.6z"/><path d="M9 4v13.3M15 6.6v13.3"/>`,
  expeditions: `<path d="M6 3.2v17.6"/><path d="M6 4.2h10l-2.6 3.6L16 11.4H6"/>`,
  regions: `<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.6 2.3 2.6 13.7 0 16M12 4c-2.6 2.3-2.6 13.7 0 16"/>`,
  pause: `<rect x="7" y="6" width="3.2" height="12" rx="1.1" fill="currentColor" stroke="none"/><rect x="13.8" y="6" width="3.2" height="12" rx="1.1" fill="currentColor" stroke="none"/>`,
  play: `<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none"/>`,
  card: `<rect x="3.4" y="6" width="17.2" height="12" rx="2.2"/><circle cx="8.6" cy="11" r="2.1"/><path d="M5.6 16c0-1.7 1.3-2.9 3-2.9s3 1.2 3 2.9"/><path d="M14 10h4.4M14 13h4.4M14 16h2.8"/>`,
  gear: `<circle cx="12" cy="12" r="3.1"/><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>`,
  chevronL: `<path d="M14 6l-6 6 6 6"/>`,
  chevronR: `<path d="M10 6l6 6-6 6"/>`,
  grip: `<circle cx="9" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.3" fill="currentColor" stroke="none"/>`,
  bolt: `<path d="M13 2.5L5.5 13H10l-1 8.5L18.5 10H13z" fill="currentColor" stroke="none"/>`,
  star: `<path d="M12 3l2.2 6.3 6.6.2-5.2 4 1.9 6.3L12 16.3 6.5 19.8l1.9-6.3-5.2-4 6.6-.2z" fill="currentColor" stroke="none"/>`,
  heart: `<path d="M12 20S4 14.6 4 9.4A4.2 4.2 0 0 1 12 7.1 4.2 4.2 0 0 1 20 9.4C20 14.6 12 20 12 20z" fill="currentColor" stroke="none"/>`,
  check: `<path d="M5 12.5l4.2 4.2L19 7"/>`,

  // ---- stats ----
  st_hp: `<path d="M12 19.6S4.4 14.4 4.4 9.3A3.9 3.9 0 0 1 12 7.1a3.9 3.9 0 0 1 7.6 2.2c0 5.1-7.6 10.3-7.6 10.3z" fill="currentColor" stroke="none"/>`,
  st_sp: `<path d="M12 3.2c.6 3.7 2.5 5.6 6.2 6.2-3.7.6-5.6 2.5-6.2 6.2-.6-3.7-2.5-5.6-6.2-6.2 3.7-.6 5.6-2.5 6.2-6.2z" fill="currentColor" stroke="none"/><path d="M17.5 16.5c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8z" fill="currentColor" stroke="none" opacity="0.7"/>`,
  st_atk: `<path d="M19 4.5l-8.4 8.4M16.6 4.5H19v2.4M10.6 12.9l-1.5 1.5M5.4 18.1l-1.6 1.6M5 16.5L7.5 19M8.3 13.7l2 2"/>`,
  st_def: `<path d="M12 3.2l7 2.5v5.4c0 4.6-3 7.9-7 9.1-4-1.2-7-4.5-7-9.1V5.7z" fill="currentColor" stroke="none"/><path d="M9.2 12.2l2.1 2.1 3.7-4.1" stroke="#0c1022" stroke-opacity="0.4"/>`,
  st_spd: `<path d="M5 6l6 6-6 6M12 6l6 6-6 6" stroke-width="2"/>`,
  st_wis: `<path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>`,

  // ---- currency / misc ----
  shard: `<path d="M12 2.4l7 6.6-7 12.6L5 9z" fill="currentColor" stroke="none"/><path d="M5 9h14M12 2.4v19.2M8.6 9l3.4 12.6M15.4 9L12 21.6" stroke="#0c1022" stroke-opacity="0.28" stroke-width="1"/>`,
  ribbon: `<circle cx="12" cy="9" r="5"/><path d="M9 13.4L7 21l5-2.6L17 21l-2-7.6"/>`,

  // ---- item kinds (inventory) ----
  flask: `<path d="M10 3.5h4M11 3.5v4.4l-4 8.1A1.6 1.6 0 0 0 8.4 18.4h7.2a1.6 1.6 0 0 0 1.4-2.4l-4-8.1V3.5"/><path d="M8.7 13h6.6"/>`,
  cup: `<path d="M6 8h10.5l-.9 8.4a2 2 0 0 1-2 1.8H8.9a2 2 0 0 1-2-1.8zM16.5 9.5h1.8a1.9 1.9 0 0 1 0 3.8h-1.4"/>`,
  feather: `<path d="M19 5C9.5 6 6 11.5 5 19M19 5c1 6.5-3.2 10.6-8.4 11l-2 3M19 5l-7.2 7.2"/><path d="M11.6 12.2H8"/>`,
  gift: `<rect x="4.5" y="9.5" width="15" height="9" rx="1.4"/><path d="M4 9.5h16v2.6H4zM12 9.5v9M12 9.5C10.6 6.2 7 6.7 7 8.8c0 .6.5.7 1.3.7M12 9.5c1.4-3.3 5-2.8 5-.7 0 .6-.5.7-1.3.7"/>`,
  battery: `<rect x="3.8" y="8.2" width="12.4" height="8.6" rx="1.6"/><path d="M16.2 11h2.2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2.2"/><path d="M8.6 10.5l-1.6 3.2h3l-1.6 3.2" fill="none"/>`,
  wrench: `<path d="M15.4 4.6a4 4 0 0 0-4.9 5.1l-6 6 2.4 2.4 6-6a4 4 0 0 0 5.1-4.9l-2.5 2.5-2.1-.5-.5-2.1z" fill="currentColor" stroke="none"/>`,
  gem: `<path d="M7 4.2h10l3.6 5L12 20 3.4 9.2z"/><path d="M3.4 9.2h17.2M9.4 4.2L7 9.2l5 10.8M14.6 4.2l2.4 5-5 10.8"/>`,
  meal: `<path d="M4.6 11h14.8a7.4 7.4 0 0 1-14.8 0z"/><path d="M3.4 19h17.2"/><path d="M12 4.4v3M9.6 5v2.4M14.4 5v2.4"/>`,
  scroll: `<path d="M7.5 5.4a1.5 1.5 0 0 0-3 0c0 .9.7 1.5 1.6 1.5H7.5M7.5 5.4V18a2 2 0 0 0 2 2h6.5a1.5 1.5 0 0 0 1.5-1.5V6.9a1.5 1.5 0 0 0-1.5-1.5H6.1"/><path d="M10.5 9.5h5M10.5 12.5h5"/>`,
  key: `<circle cx="8.2" cy="9" r="3.3"/><path d="M10.5 11.3L18.5 19.3M15.4 16.2l1.9-1.9M17.6 18.4l1.7-1.7"/>`,
  bagSmall: `<path d="M6.4 9.2h11.2v8.4a1.9 1.9 0 0 1-1.9 1.9H8.3a1.9 1.9 0 0 1-1.9-1.9z"/><path d="M9 9.2V7.4a3 3 0 0 1 6 0v1.8"/>`,

  // ---- equipment slots ----
  hat: `<path d="M4.6 16.4c0-4 3.3-6.9 7.4-6.9s7.4 2.9 7.4 6.9M4.6 16.4h14.8v1.4a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1z"/>`,
  shirt: `<path d="M8.2 4.2l3.8 2 3.8-2 3.4 2.5-2 3-1.4-.9V20H8.2V8.8l-1.4.9-2-3z"/>`,
  pants: `<path d="M7.2 4.2h9.6l-.5 15.6h-2.9l-1.4-9.6-1.4 9.6H7.7z"/>`,
  glove: `<path d="M8 11.4V6.6a1.3 1.3 0 0 1 2.6 0v4.2M10.6 10.8V5.4a1.3 1.3 0 0 1 2.6 0v5.1M13.2 11V6.6a1.3 1.3 0 0 1 2.6 0V13a5 5 0 0 1-5 5h-1.2a3 3 0 0 1-2.3-1.1l-2-2.6a1.3 1.3 0 0 1 2-1.6l.9.9"/>`,
  boot: `<path d="M8.4 4.2h2.8v8l4.8 2.4a3 3 0 0 1 1.6 2.7v.4a1 1 0 0 1-1 1H7.4a1 1 0 0 1-1-1V6.2a2 2 0 0 1 2-2z"/>`,

  // ---- crawler part slots ----
  cannon: `<path d="M3.6 13.4l9.2-3.5 1.1 3.8-9.2 3.5z" fill="currentColor" stroke="none"/><circle cx="18" cy="9.4" r="2.6"/><path d="M5 16.4l-.6 2.4M8 15.3l-.6 2.4"/>`,
  scanner: `<path d="M12 13.2a7.5 7.5 0 0 1 7.5-7.5M12 13.2a4 4 0 0 1 4-4"/><circle cx="12" cy="13.2" r="1.5" fill="currentColor" stroke="none"/><path d="M12 13.2L7 20M4.6 20h7.8"/>`,
  mechleg: `<path d="M10.5 3.6l1.4 6.4 4 3.2-1 6.8M11.9 10l-4.2 2.4 1.1 6"/>`,
};

// item kind → icon name
const ITEM_KIND_ICON: Record<string, string> = {
  heal: 'flask', sp: 'cup', revive: 'feather', gift: 'gift', fuel: 'battery',
  repair: 'wrench', boost: 'gem', feast: 'meal', evo: 'evolutions', relic: 'scroll',
  key: 'key', all: 'bagSmall',
};
/** Icon for an inventory item kind (heal/sp/revive/…). */
export function itemKindIcon(kind: string, opts: IconOpts = {}): string {
  return icon(ITEM_KIND_ICON[kind] ?? 'bagSmall', { size: 16, ...opts });
}

// ---------------- element glyphs ----------------
// Mirror of data.ts ELEMENT_CSS — keep in sync.
const EL_COL: Record<string, string> = {
  Fire: '#f2603a', Water: '#3a9df2', Nature: '#4ec45e', Electric: '#f2d23a', Rock: '#b0865a',
  Ice: '#9adff2', Light: '#f2e8b8', Dark: '#9a5af2', Space: '#7a8af2', Aether: '#ff9ad2',
};

const EL_GLYPH: Record<string, string> = {
  Fire: `<path d="M12 2.6c2.2 3 .4 5 1.3 7 .4 1 1.6.5 1.8-.6 1 1.3 1.9 3 1.9 5a5 5 0 0 1-10 0c0-2 .9-3.5 2-4.6 0 1.1.7 1.9 1.7 1.9 1.4 0 2-1.5 1.2-2.9-1-1.7-.2-3.9.1-5.8z" fill="currentColor" stroke="none"/>`,
  Water: `<path d="M12 3c3.4 4.4 5.8 7.4 5.8 10.2a5.8 5.8 0 0 1-11.6 0C6.2 10.4 8.6 7.4 12 3z" fill="currentColor" stroke="none"/><path d="M9 13.4a3 3 0 0 0 2.1 3.4" stroke="#fff" stroke-opacity="0.55" stroke-width="1.4"/>`,
  Nature: `<path d="M5.2 19.2C4.2 12 9 5.2 19 5.4c.2 9.8-6.7 14.8-13.8 13.8z" fill="currentColor" stroke="none"/><path d="M8.6 15.6c3-3.2 5.2-5.2 7.4-6.8" stroke="#0c1022" stroke-opacity="0.32" stroke-width="1.4"/>`,
  Electric: `<path d="M13 2.5L5.5 13H10l-1 8.5L18.5 10H13z" fill="currentColor" stroke="none"/>`,
  Rock: `<path d="M3.2 19l4.4-7 3 3.4 3.2-5.4L20.8 19z" fill="currentColor" stroke="none"/><path d="M7.6 12l3 3.4M13.6 10l2.6 4.4" stroke="#0c1022" stroke-opacity="0.3" stroke-width="1.3"/>`,
  Ice: `<path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4l-16 9.2" stroke-width="1.7"/><path d="M12 6.2l2-1.8M12 6.2l-2-1.8M12 17.8l2 1.8M12 17.8l-2 1.8M6.4 9l-2.6.2M6.4 15l-2.6-.2M17.6 9l2.6.2M17.6 15l2.6-.2" stroke-width="1.5"/>`,
  Light: `<circle cx="12" cy="12" r="3.8" fill="currentColor" stroke="none"/><path d="M12 2.4v3.2M12 18.4v3.2M2.4 12h3.2M18.4 12h3.2M5.1 5.1l2.3 2.3M16.6 16.6l2.3 2.3M18.9 5.1l-2.3 2.3M7.4 16.6l-2.3 2.3" stroke-width="1.7"/>`,
  Dark: `<path d="M15.6 3.4a8 8 0 1 0 4.6 12.2A6.6 6.6 0 0 1 15.6 3.4z" fill="currentColor" stroke="none"/><circle cx="16.4" cy="8.4" r="1" fill="#0c1022" fill-opacity="0.35" stroke="none"/>`,
  Space: `<path d="M19 11.4c0 4.3-4.2 8.1-9 8.1-3 0-5.1-1.9-5.1-4.2 0-3.1 3-6 7-6 2 0 3.2 1.1 3.2 2.6S13.8 17 11.6 17"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="7.4" cy="6.2" r="0.9" fill="currentColor" stroke="none"/>`,
  Aether: `<path d="M12 2l2.3 7.5L22 12l-7.7 2.5L12 22l-2.3-7.5L2 12l7.7-2.5z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="#fff" fill-opacity="0.55" stroke="none"/>`,
};

const STAT_GLYPH: Record<string, string> = {
  hp: G.st_hp, sp: G.st_sp, atk: G.st_atk, def: G.st_def, spd: G.st_spd, wis: G.st_wis,
};
const STAT_COL: Record<string, string> = {
  hp: '#e85a6a', sp: '#5ab8e8', atk: '#f2a14e', def: '#9aa6d8', spd: '#5ad88a', wis: '#b18ae8',
};

// ---------------- public API ----------------
/** A themed icon by name. Returns '' for unknown names (never throws). */
export function icon(name: string, opts: IconOpts = {}): string {
  const g = G[name];
  return g ? wrap(g, opts) : '';
}

/** Element glyph, auto-coloured to the element (override via opts.color). */
export function elementIcon(el: string, opts: IconOpts = {}): string {
  const g = EL_GLYPH[el];
  if (!g) return '';
  return wrap(g, { size: 18, cls: 'el-ic', color: opts.color ?? EL_COL[el], ...opts });
}

/** Stat glyph, auto-coloured per stat (override via opts.color). */
export function statIcon(stat: string, opts: IconOpts = {}): string {
  const g = STAT_GLYPH[stat];
  if (!g) return '';
  return wrap(g, { size: 16, cls: 'stat-ic', color: opts.color ?? STAT_COL[stat], ...opts });
}

/** True if a named base icon exists. */
export function hasIcon(name: string): boolean { return !!G[name]; }

/** Raw inner markup (for drawing onto canvas via an <img>/Path2D pipeline). */
export function iconInner(name: string): string { return G[name] ?? ''; }
export function elementInner(el: string): string { return EL_GLYPH[el] ?? ''; }
export function elementColor(el: string): string { return EL_COL[el] ?? '#8b93b8'; }

/**
 * Build a data-URI for an element glyph so it can be drawn to a <canvas>
 * (drawImage). Used by the Guardian card renderer which is canvas-based and
 * therefore cannot accept inline SVG markup.
 */
export function elementIconDataURI(el: string, color?: string): string {
  const c = color ?? EL_COL[el] ?? '#8b93b8';
  const inner = EL_GLYPH[el] ?? '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${c}">${inner}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
