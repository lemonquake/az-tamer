// ============================================================
// RING CELEBRATIONS — per-tournament victory identity.
// One hand-tuned style per tier drives the in-arena particle
// storm (battle.ts), the themed victory card, and the full-screen
// champion banner shown when you take a title.
// ============================================================
import type { TournamentTier, ScheduledEvent } from './tournaments';
import { sfx, playMusic } from './audio';

/** Everything battle.ts / the banner need to dress a sanctioned win. */
export interface RingVictoryStyle {
  tierId: string;
  tierName: string;
  short: string;
  crest: string;       // emoji crest stamped on banners
  colors: number[];    // particle palette (hex) — first entry is the "key" color
  bannerClass: string; // CSS theme class (index.html)
  grand: boolean;      // Worlds / Legends → the maxed-out crowning
  isFinal: boolean;    // facing the champion / final opponent this bout
}

type BaseStyle = Omit<RingVictoryStyle, 'isFinal'>;

// Each tier gets its own crest, palette and banner skin.
const VICTORY_STYLES: Record<string, BaseStyle> = {
  weekly_open:          { tierId: 'weekly_open',          tierName: 'The Ringnight',          short: 'Ringnight',     crest: '🎟️', colors: [0x9fb8d8, 0x5ab8e8, 0xe8eefc],          bannerClass: 'rb-ringnight',  grand: false },
  turmal_seasonal:      { tierId: 'turmal_seasonal',      tierName: 'The Turmal Seasonal',    short: 'Seasonal',      crest: '🎐', colors: [0x5ee0d0, 0x7fd4ff, 0xbafff2],          bannerClass: 'rb-seasonal',   grand: false },
  foretales_exhibition: { tierId: 'foretales_exhibition', tierName: 'A Foretales Exhibition', short: 'Exhibition',    crest: '🎬', colors: [0xff5ab0, 0xffd24e, 0xb15ae8],          bannerClass: 'rb-exhibition', grand: false },
  continental_crown:    { tierId: 'continental_crown',    tierName: 'The Continental Crown',  short: 'Crown',         crest: '👑', colors: [0xf2d23a, 0x5ad88a, 0xffffff],          bannerClass: 'rb-crown',      grand: false },
  aurelia_cup:          { tierId: 'aurelia_cup',          tierName: "Aurelia's Cup",          short: "Aurelia's Cup", crest: '🐚', colors: [0xf2c14e, 0x7fe0c0, 0xff8a3a],          bannerClass: 'rb-aurelia',    grand: false },
  gauntlet_seeds:       { tierId: 'gauntlet_seeds',       tierName: 'The Gauntlet of Seeds',  short: 'Playoffs',      crest: '⚔️', colors: [0xff6a3a, 0xff2d55, 0xffb05e],          bannerClass: 'rb-playoffs',   grand: false },
  sealwatch:            { tierId: 'sealwatch',            tierName: 'The Sealwatch Invitational', short: 'Sealwatch', crest: '🌩️', colors: [0xb18ae8, 0x9b5cff, 0xc8b0ff],          bannerClass: 'rb-sealwatch',  grand: false },
  world_championship:   { tierId: 'world_championship',   tierName: 'THE WORLD CHAMPIONSHIP', short: 'Worlds',        crest: '👑', colors: [0xffd24e, 0xfff0b0, 0xffffff],          bannerClass: 'rb-worlds',     grand: true },
  legends_gauntlet:     { tierId: 'legends_gauntlet',     tierName: "The Legends' Gauntlet",  short: 'Legends',       crest: '🌌', colors: [0xff5ab0, 0x5ee0d0, 0xffd24e, 0x9b5cff], bannerClass: 'rb-legends',    grand: true },
  lemon_interguild:     { tierId: 'lemon_interguild',     tierName: 'The Lemon Inter-Guild', short: 'Guild Wars',     crest: '🛡️', colors: [0xf2d23a, 0x5ad88a, 0xff8a3a, 0x5ab8e8], bannerClass: 'rb-guildwar',   grand: true },
  aetherline_circuit:   { tierId: 'aetherline_circuit',   tierName: 'The Aether Line Circuit', short: 'Aether Line', crest: '💎', colors: [0xb18ae8, 0x5ee0d0, 0xff5ab0, 0xffffff], bannerClass: 'rb-aetherline', grand: false },
  leodones_supercup:    { tierId: 'leodones_supercup',    tierName: 'The Leodones Supercup', short: 'Supercup',       crest: '🏆', colors: [0xf2884e, 0xffd24e, 0xff5a5a, 0xfff0b0], bannerClass: 'rb-supercup',   grand: true },
  legend_showdown:      { tierId: 'legend_showdown',      tierName: 'The Legend Showdown',  short: 'Showdown',       crest: '⚔️', colors: [0xff2d55, 0xffd24e, 0x9b5cff, 0xffffff], bannerClass: 'rb-showdown',   grand: true },
};

// The Continental Crown re-skins itself to the continent it's fought on.
const CONTINENT_TINT: Record<string, { crest: string; colors: number[] }> = {
  Olivar:   { crest: '🔥', colors: [0xff6a3a, 0xffd24e, 0xfff0b0] },
  Veyra:    { crest: '🌊', colors: [0x5ab8e8, 0x7fe0c0, 0xbafff2] },
  Tharkand: { crest: '⚡', colors: [0xffd24e, 0xfff0b0, 0xff8a3a] },
  Noruun:   { crest: '❄️', colors: [0xbafff2, 0x9fd8f0, 0xffffff] },
};

const FALLBACK: BaseStyle = {
  tierId: '', tierName: 'The Ring', short: 'Ring', crest: '🏆',
  colors: [0xf2d23a, 0xffd24e, 0xffffff], bannerClass: 'rb-ringnight', grand: false,
};

/** Build the live style for a bout — merges the tier table with this bout's context. */
export function styleFor(tier: TournamentTier, isFinal: boolean, ev?: ScheduledEvent): RingVictoryStyle {
  const base = VICTORY_STYLES[tier.id] ?? { ...FALLBACK, tierId: tier.id, tierName: tier.name, short: tier.short };
  let { crest, colors } = base;
  if (tier.id === 'continental_crown' && ev?.continent) {
    const t = CONTINENT_TINT[ev.continent];
    if (t) { crest = t.crest; colors = t.colors; }
  }
  return { ...base, crest, colors, isFinal };
}

// ============================================================
// THE CHAMPION BANNER — a full-screen, per-tier crowning card.
// Pure DOM/CSS so it renders even after the 3D arena tears down.
// ============================================================
export function showChampionBanner(style: RingVictoryStyle, info: { tp: number; shards: number; title: string }): Promise<void> {
  const screen = document.getElementById('champion-banner');
  if (!screen) return Promise.resolve();

  // Confetti strips drift down behind the crest.
  const confetti = Array.from({ length: 26 }, (_, i) => {
    const c = style.colors[i % style.colors.length];
    const css = '#' + c.toString(16).padStart(6, '0');
    const left = Math.round((i / 26) * 100 + (Math.random() * 4 - 2));
    const delay = (Math.random() * 2.4).toFixed(2);
    const dur = (2.4 + Math.random() * 1.8).toFixed(2);
    return `<i class="cb-confetti" style="left:${left}%;background:${css};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }).join('');

  screen.className = `${style.bannerClass} ${style.grand ? 'cb-grand' : ''}`;
  screen.innerHTML = `
    <div class="cb-confetti-layer">${confetti}</div>
    <div class="cb-sweep"></div>
    <div class="cb-inner">
      <div class="cb-crest">${style.crest}</div>
      <div class="cb-kicker">CHAMPION</div>
      <h1 class="cb-title">${style.tierName}</h1>
      <div class="cb-prize">🏆 ${info.title} &nbsp;·&nbsp; +${info.tp} TP &nbsp;·&nbsp; ◆${info.shards}</div>
      <button class="ui-btn primary cb-continue">Raise the trophy ▶</button>
    </div>`;
  screen.style.display = 'flex';

  // The crowd never stops for a title — roar layered over the champion theme,
  // plus the grandest fanfare for the Worlds / Legends.
  playMusic('tournament_champion');
  sfx('crowd_roar');
  sfx(style.grand ? 'champion_fanfare' : 'fanfare');

  return new Promise<void>(resolve => {
    const done = () => {
      screen.style.display = 'none';
      screen.removeEventListener('click', done);
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); done(); } };
    screen.addEventListener('click', done);
    window.addEventListener('keydown', onKey);
  });
}
