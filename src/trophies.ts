import { Player, type TrophyEarned } from './state';
import { SPECIES, TYPE_CSS } from './data';
import { speciesSnapshotURL } from './snapshots';
import { sfx } from './audio';
import { getPlayerMMR, getPlayerPeakMMR, divisionFor } from './mmr';

export interface TrophyDef {
  id: string;
  name: string;
  desc: string;
  renderSVG(): string;
}

export const TROPHIES: Record<string, TrophyDef> = {
  weekly_open: {
    id: 'weekly_open',
    name: 'The Ringnight Cup',
    desc: "Forged in raw copper and polished bronze, representing the first flight of Haven's challenger tamers.",
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="bronze" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#df8a5a" />
              <stop offset="30%" stop-color="#fba270" />
              <stop offset="70%" stop-color="#ab5e32" />
              <stop offset="100%" stop-color="#703d20" />
            </linearGradient>
          </defs>
          <path d="M 30,85 H 70 L 65,75 H 35 Z" fill="url(#bronze)" />
          <rect x="46" y="65" width="8" height="10" fill="url(#bronze)" />
          <path d="M 25,25 H 75 C 75,55 65,65 50,65 C 35,65 25,55 25,25 Z" fill="url(#bronze)" />
          <path d="M 25,30 Q 10,25 20,45 Q 25,48 26,42 Z" fill="url(#bronze)" />
          <path d="M 75,30 Q 90,25 80,45 Q 75,48 74,42 Z" fill="url(#bronze)" />
          <ellipse cx="50" cy="27" rx="20" ry="2" fill="#ffcca3" opacity="0.4" />
        </svg>
      `;
    }
  },
  turmal_seasonal: {
    id: 'turmal_seasonal',
    name: 'The Turmal Seasonal Sphere',
    desc: 'A floating sky-blue crystalline orb resting on a silver pedestal, reflecting the terraced sky-city clouds.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="silver" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e0e0e0" />
              <stop offset="50%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#707070" />
            </linearGradient>
            <radialGradient id="crystal" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stop-color="#bafff2" />
              <stop offset="40%" stop-color="#5ee0d0" />
              <stop offset="80%" stop-color="#1b7d70" />
              <stop offset="100%" stop-color="#0b3b33" />
            </radialGradient>
          </defs>
          <path d="M 35,80 H 65 V 85 H 35 Z" fill="url(#silver)" />
          <path d="M 42,65 H 58 Q 58,80 50,80 Q 42,80 42,65 Z" fill="url(#silver)" />
          <path d="M 40,65 Q 42,50 34,42 Q 33,40 35,40 Q 45,45 45,65 Z" fill="url(#silver)" />
          <path d="M 60,65 Q 58,50 66,42 Q 67,40 65,40 Q 55,45 55,65 Z" fill="url(#silver)" />
          <circle cx="50" cy="40" r="18" fill="url(#crystal)" filter="drop-shadow(0 0 8px rgba(94,224,208,0.8))" />
          <circle cx="45" cy="35" r="5" fill="#fff" opacity="0.6" />
        </svg>
      `;
    }
  },
  foretales_exhibition: {
    id: 'foretales_exhibition',
    name: 'The Foretales Hologram',
    desc: 'A neon-pink and purple glass polygon that glows and cycles color. Direct from the production vaults.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ff5ab0" />
              <stop offset="100%" stop-color="#b15ae8" />
            </linearGradient>
          </defs>
          <path d="M 30,85 H 70 L 60,75 H 40 Z" fill="#111" stroke="#ff5ab0" stroke-width="1.5" />
          <polygon points="50,20 68,45 50,70 32,45" fill="url(#neon)" opacity="0.85" filter="drop-shadow(0 0 10px rgba(255,90,176,0.9))" />
          <polygon points="50,20 50,70 68,45" fill="#fff" opacity="0.25" />
          <polygon points="50,20 50,70 32,45" fill="#000" opacity="0.25" />
          <ellipse cx="50" cy="45" rx="25" ry="6" fill="none" stroke="#ffd24e" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.75" />
        </svg>
      `;
    }
  },
  continental_crown: {
    id: 'continental_crown',
    name: 'The Continental Crown',
    desc: 'A gold crown embedded with emeralds and rubies, representing total mastery of a continent.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe259" />
              <stop offset="100%" stop-color="#ffa751" />
            </linearGradient>
            <linearGradient id="velvet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#d31027" />
              <stop offset="100%" stop-color="#ea384d" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="75" rx="30" ry="12" fill="url(#velvet)" stroke="#ffa751" stroke-width="1.5" />
          <path d="M 30,68 H 70 L 68,60 H 32 Z" fill="url(#gold)" />
          <path d="M 32,60 L 25,35 L 38,50 L 50,25 L 62,50 L 75,35 L 68,60 Z" fill="url(#gold)" />
          <circle cx="50" cy="25" r="3" fill="#ff2d55" filter="drop-shadow(0 0 3px #ff2d55)" />
          <circle cx="25" cy="35" r="2.5" fill="#3a9df2" filter="drop-shadow(0 0 3px #3a9df2)" />
          <circle cx="75" cy="35" r="2.5" fill="#4ec45e" filter="drop-shadow(0 0 3px #4ec45e)" />
          <circle cx="38" cy="50" r="1.5" fill="#ffd24e" />
          <circle cx="62" cy="50" r="1.5" fill="#ffd24e" />
        </svg>
      `;
    }
  },
  aurelia_cup: {
    id: 'aurelia_cup',
    name: "Aurelia's Ancient Urn",
    desc: 'A terracotta and gold vessel wrapped in Agdao vines, burning with an eternal flame of the First Bond.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="terracotta" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e07a5f" />
              <stop offset="50%" stop-color="#f29b7f" />
              <stop offset="100%" stop-color="#a04a3f" />
            </linearGradient>
            <linearGradient id="flame" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffea7a" />
              <stop offset="50%" stop-color="#ff7a1a" />
              <stop offset="100%" stop-color="#b82d00" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="82" rx="18" ry="4" fill="url(#terracotta)" />
          <path d="M 38,82 C 38,70 30,55 30,45 C 30,35 40,32 50,32 C 60,32 70,35 70,45 C 70,55 62,70 62,82 Z" fill="url(#terracotta)" />
          <path d="M 30,45 H 70" stroke="#ffd24e" stroke-width="2" fill="none" />
          <ellipse cx="50" cy="32" rx="12" ry="3" fill="#ffe07a" />
          <path d="M 44,30 C 44,30 40,15 50,8 C 60,15 56,30 56,30 C 56,30 52,26 50,26 C 48,26 44,30 44,30 Z" fill="url(#flame)" filter="drop-shadow(0 0 6px #ff7a1a)" />
          <path d="M 32,55 Q 45,62 55,50 T 68,60" fill="none" stroke="#7fe0c0" stroke-width="1.5" />
          <path d="M 40,56 Q 37,50 42,52 Z" fill="#4ec45e" />
          <path d="M 58,52 Q 62,48 60,54 Z" fill="#4ec45e" />
        </svg>
      `;
    }
  },
  gauntlet_seeds: {
    id: 'gauntlet_seeds',
    name: 'The Playoffs Gauntlet',
    desc: 'A heavy metal armored gauntlet fist clutching a pulsing core of raw orange solar energy.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="steel" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a0b0c0" />
              <stop offset="30%" stop-color="#ffffff" />
              <stop offset="70%" stop-color="#506070" />
              <stop offset="100%" stop-color="#2a303a" />
            </linearGradient>
            <radialGradient id="powercore" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#ffb05e" />
              <stop offset="40%" stop-color="#ff6a3a" />
              <stop offset="85%" stop-color="#a81a00" />
              <stop offset="100%" stop-color="#400800" />
            </radialGradient>
          </defs>
          <path d="M 25,85 H 75 V 90 H 25 Z" fill="#2a303a" />
          <path d="M 35,72 H 65 L 60,85 H 40 Z" fill="url(#steel)" />
          <path d="M 40,72 L 35,50 H 65 L 60,72 Z" fill="url(#steel)" />
          <path d="M 33,50 C 33,40 40,36 50,36 C 60,36 67,40 67,50 Z" fill="url(#steel)" />
          <circle cx="50" cy="45" r="9" fill="url(#powercore)" filter="drop-shadow(0 0 8px #ff6a3a)" />
          <path d="M 43,36 V 42" stroke="#2a303a" stroke-width="1.5" />
          <path d="M 50,36 V 44" stroke="#2a303a" stroke-width="1.5" />
          <path d="M 57,36 V 42" stroke="#2a303a" stroke-width="1.5" />
        </svg>
      `;
    }
  },
  sealwatch: {
    id: 'sealwatch',
    name: 'The Sealwatch Obelisk',
    desc: 'A dark obelisk of volcanic glass, etched with warding runes that hum with soft turquoise light.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="obsidian" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0a0a0d" />
              <stop offset="45%" stop-color="#1c1c24" />
              <stop offset="55%" stop-color="#2a2a35" />
              <stop offset="100%" stop-color="#08080a" />
            </linearGradient>
          </defs>
          <path d="M 25,82 H 75 L 70,88 H 30 Z" fill="#0d0d12" stroke="#b18ae8" stroke-width="0.5" />
          <path d="M 35,82 L 44,22 L 50,15 L 56,22 L 65,82 Z" fill="url(#obsidian)" />
          <path d="M 50,15 L 50,82 L 65,82 L 56,22 Z" fill="#000" opacity="0.3" />
          <path d="M 47,30 H 53 M 48,40 L 52,43 M 52,50 L 48,53 M 47,60 H 53 M 50,68 V 74" stroke="#5ee0d0" stroke-width="2" stroke-linecap="round" filter="drop-shadow(0 0 5px #5ee0d0)" fill="none" />
        </svg>
      `;
    }
  },
  world_championship: {
    id: 'world_championship',
    name: 'The World Champion Monument',
    desc: 'The ultimate crown. A multi-layer mirror-chrome structure of absolute victory, ringed by gold orbits.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg trophy-chrome">
          <defs>
            <linearGradient id="chrome" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="15%" stop-color="#e2e6e9" />
              <stop offset="35%" stop-color="#555d66" />
              <stop offset="40%" stop-color="#ffffff" />
              <stop offset="65%" stop-color="#a0a8b2" />
              <stop offset="85%" stop-color="#3d434c" />
              <stop offset="100%" stop-color="#d4dbe3" />
            </linearGradient>
            <linearGradient id="worldgold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe67e" />
              <stop offset="50%" stop-color="#d4af37" />
              <stop offset="100%" stop-color="#8a6f1d" />
            </linearGradient>
          </defs>
          <path d="M 25,85 H 75 L 70,75 H 30 Z" fill="url(#chrome)" />
          <path d="M 42,75 L 45,50 H 55 L 58,75 Z" fill="url(#chrome)" />
          <path d="M 30,22 C 30,50 40,55 50,55 C 60,55 70,50 70,22 L 63,22 C 63,42 57,47 50,47 C 43,47 37,42 37,22 Z" fill="url(#chrome)" />
          <circle cx="50" cy="30" r="11" fill="url(#worldgold)" filter="drop-shadow(0 0 8px #ffd24e)" />
          <path d="M 33,35 C 33,30 67,20 67,25" stroke="url(#worldgold)" stroke-width="2.5" fill="none" opacity="0.9" />
          <path d="M 33,35 C 33,40 67,30 67,25" stroke="url(#worldgold)" stroke-width="2.5" fill="none" />
          <polygon points="50,15 52,22 59,24 52,26 50,33 48,26 41,24 48,22" fill="#fff" opacity="0.95" filter="drop-shadow(0 0 6px #fff)" />
        </svg>
      `;
    }
  },
  legends_gauntlet: {
    id: 'legends_gauntlet',
    name: "The Legends' Cosmic Signet",
    desc: 'An ethereal relic of three overlapping gold bands rotating around a central void of starlight.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="legendgold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe67e" />
              <stop offset="30%" stop-color="#ffd24e" />
              <stop offset="70%" stop-color="#b08d1a" />
              <stop offset="100%" stop-color="#544005" />
            </linearGradient>
            <radialGradient id="nebula" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stop-color="#ff7ae0" />
              <stop offset="50%" stop-color="#9b5cff" />
              <stop offset="85%" stop-color="#2a0a54" />
              <stop offset="100%" stop-color="#020005" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="85" rx="25" ry="8" fill="#08070d" stroke="url(#legendgold)" stroke-width="1.5" />
          <path d="M 40,84 L 46,70 H 54 L 60,84 Z" fill="#141221" stroke="url(#legendgold)" stroke-width="1" />
          <circle cx="50" cy="45" r="16" fill="url(#nebula)" filter="drop-shadow(0 0 12px rgba(155,92,255,0.85))" />
          <ellipse cx="50" cy="45" rx="26" ry="12" fill="none" stroke="url(#legendgold)" stroke-width="2" transform="rotate(-15 50 45)" />
          <ellipse cx="50" cy="45" rx="22" ry="8" fill="none" stroke="url(#legendgold)" stroke-width="1.5" transform="rotate(30 50 45)" />
          <ellipse cx="50" cy="45" rx="18" ry="4" fill="none" stroke="url(#legendgold)" stroke-width="1" transform="rotate(75 50 45)" />
        </svg>
      `;
    }
  },
  lemon_interguild: {
    id: 'lemon_interguild',
    name: 'The Inter-Guild Standard',
    desc: 'A swallowtail war-banner of the eight guilds, quartered in their colors beneath a gilded shield — lifted only by the guild left standing.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="gwgold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe27a" /><stop offset="100%" stop-color="#a87c1a" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="88" rx="17" ry="4.5" fill="url(#gwgold)" />
          <rect x="48" y="12" width="4" height="74" rx="2" fill="url(#gwgold)" />
          <circle cx="50" cy="11" r="4.5" fill="url(#gwgold)" />
          <path d="M 52,18 H 84 V 50 L 76,44 L 68,50 L 60,44 L 52,50 Z" fill="#141a30" stroke="url(#gwgold)" stroke-width="1.5" />
          <rect x="55" y="21" width="12" height="11" fill="#f2603a" opacity="0.9" />
          <rect x="69" y="21" width="12" height="11" fill="#3a9df2" opacity="0.9" />
          <rect x="55" y="33" width="12" height="9" fill="#4ec45e" opacity="0.9" />
          <rect x="69" y="33" width="12" height="9" fill="#9a6af2" opacity="0.9" />
          <path d="M 68,23 L 75,25.5 V 33 C 75,38.5 68,41 68,41 C 68,41 61,38.5 61,33 V 25.5 Z" fill="url(#gwgold)" stroke="#fff7d8" stroke-width="0.7" />
          <path d="M 68,28 V 37 M 64,31.5 H 72" stroke="#141a30" stroke-width="1.3" />
        </svg>
      `;
    }
  },
  aetherline_circuit: {
    id: 'aetherline_circuit',
    name: 'The Aetherline Prism',
    desc: 'A levitating prism of cut aether-glass that splits the gallery lights into a fan of color, balanced on a needle of mirror-chrome.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="alchrome" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e6eefc" /><stop offset="100%" stop-color="#5a6680" />
            </linearGradient>
            <linearGradient id="alprism" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#d6b0ff" /><stop offset="50%" stop-color="#5ee0d0" /><stop offset="100%" stop-color="#ff5ab0" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="86" rx="15" ry="4" fill="url(#alchrome)" />
          <rect x="48.5" y="56" width="3" height="30" fill="url(#alchrome)" />
          <path d="M 50,42 L 88,30 M 50,42 L 88,54 M 50,42 L 12,30 M 50,42 L 12,54" stroke="url(#alprism)" stroke-width="1" opacity="0.5" />
          <polygon points="50,16 70,42 50,70 30,42" fill="url(#alprism)" opacity="0.9" filter="drop-shadow(0 0 11px rgba(155,92,255,0.85))" />
          <polygon points="50,16 50,70 70,42" fill="#fff" opacity="0.2" />
          <polygon points="50,16 50,70 30,42" fill="#000" opacity="0.22" />
          <circle cx="44" cy="34" r="3" fill="#fff" opacity="0.6" />
        </svg>
      `;
    }
  },
  leodones_supercup: {
    id: 'leodones_supercup',
    name: 'The Leodones Supercup',
    desc: "A tall two-handled cup of ember-gold, the Dawnflame's emberlark rising in flame on its bowl. The family's own, given only to the elite they invite.",
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="lsgold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe88a" /><stop offset="45%" stop-color="#f2a64e" /><stop offset="100%" stop-color="#9a5a1a" />
            </linearGradient>
            <linearGradient id="lsflame" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffe07a" /><stop offset="100%" stop-color="#ff6a1a" />
            </linearGradient>
          </defs>
          <rect x="38" y="84" width="24" height="5" rx="1.5" fill="url(#lsgold)" />
          <path d="M 42,78 H 58 L 60,84 H 40 Z" fill="url(#lsgold)" />
          <rect x="47" y="63" width="6" height="16" fill="url(#lsgold)" />
          <path d="M 30,32 C 16,29 16,51 30,49" fill="none" stroke="url(#lsgold)" stroke-width="4" />
          <path d="M 70,32 C 84,29 84,51 70,49" fill="none" stroke="url(#lsgold)" stroke-width="4" />
          <path d="M 30,30 H 70 C 70,55 60,64 50,64 C 40,64 30,55 30,30 Z" fill="url(#lsgold)" />
          <ellipse cx="50" cy="30" rx="20" ry="3.5" fill="#ffe88a" />
          <path d="M 42,48 Q 50,40 58,48 Q 50,44 42,48 Z" fill="url(#lsflame)" opacity="0.9" />
          <path d="M 47,45 C 47,45 44,34 50,29 C 56,34 53,45 53,45 C 53,45 51,41 50,41 C 49,41 47,45 47,45 Z" fill="url(#lsflame)" filter="drop-shadow(0 0 5px #ff6a1a)" />
        </svg>
      `;
    }
  },
  legend_showdown: {
    id: 'legend_showdown',
    name: 'The Showdown Blade',
    desc: 'A champion-blade driven into a riven pedestal, wreathed in crimson-violet light. Set here by the few who walked into the Showdown and out again.',
    renderSVG() {
      return `
        <svg viewBox="0 0 100 100" class="trophy-svg">
          <defs>
            <linearGradient id="sdsteel" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#eef2f8" /><stop offset="50%" stop-color="#8a93a8" /><stop offset="100%" stop-color="#3a4250" />
            </linearGradient>
            <radialGradient id="sdaura" cx="50%" cy="42%" r="60%">
              <stop offset="0%" stop-color="#ff2d55" stop-opacity="0.85" />
              <stop offset="60%" stop-color="#9b5cff" stop-opacity="0.45" />
              <stop offset="100%" stop-color="#9b5cff" stop-opacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="44" r="34" fill="url(#sdaura)" />
          <path d="M 32,86 H 68 L 64,74 H 36 Z" fill="#2a3040" />
          <ellipse cx="50" cy="74" rx="14" ry="3" fill="#3a4250" />
          <circle cx="50" cy="12" r="3.5" fill="url(#sdsteel)" />
          <rect x="48" y="14" width="4" height="12" fill="#5a4632" />
          <rect x="38" y="26" width="24" height="4" rx="2" fill="url(#sdsteel)" />
          <polygon points="50,78 45,30 55,30" fill="url(#sdsteel)" />
          <polygon points="50,78 50,30 55,30" fill="#000" opacity="0.22" />
        </svg>
      `;
    }
  }
};

// ============================================================
// ACHIEVEMENT TROPHIES — career milestones beyond the per-tier
// championship cups. Earned by meeting a condition, not by winning
// one specific bracket. Rendered as ringed medallions.
// ============================================================
export interface Achievement {
  id: string; name: string; desc: string; glyph: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'cosmic';
  earned(p: Player): boolean;
}

const sumVals = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);
const MAIN_SLAM = ['weekly_open', 'turmal_seasonal', 'foretales_exhibition', 'continental_crown', 'aurelia_cup', 'gauntlet_seeds', 'sealwatch', 'world_championship'];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Blood', desc: 'Win your first sanctioned tournament.', glyph: '🥇', tier: 'bronze', earned: p => sumVals(p.tournament.wins) >= 1 },
  { id: 'ladder_climber', name: 'Ladder Climber', desc: 'Reach 2,000 peak MMR — the Gold division.', glyph: '📈', tier: 'silver', earned: p => getPlayerPeakMMR(p) >= 2000 },
  { id: 'circuit_veteran', name: 'Circuit Veteran', desc: 'Enter 25 tournaments across your career.', glyph: '🎫', tier: 'silver', earned: p => sumVals(p.tournament.entries) >= 25 },
  { id: 'centurion', name: 'Centurion', desc: 'Win 100 sanctioned tournament matches.', glyph: '⚔️', tier: 'gold', earned: p => (p.tournament.tournamentMatchesWon ?? 0) >= 100 },
  { id: 'unbroken', name: 'Unbroken', desc: 'Reach a 10-match win streak.', glyph: '🔥', tier: 'gold', earned: p => (p.tournament.bestStreak ?? 0) >= 10 },
  { id: 'guild_warlord', name: 'Guild Warlord', desc: 'Lift the Lemon Inter-Guild — Guild Wars.', glyph: '🛡️', tier: 'gold', earned: p => (p.tournament.wins['lemon_interguild'] ?? 0) >= 1 },
  { id: 'aether_ascendant', name: 'Aether Ascendant', desc: 'Reach 2,800 peak MMR — the Showdown floor.', glyph: '💠', tier: 'platinum', earned: p => getPlayerPeakMMR(p) >= 2800 },
  { id: 'grand_slam', name: 'Grand Slam', desc: 'Win every main circuit tier at least once.', glyph: '👑', tier: 'cosmic', earned: p => MAIN_SLAM.every(t => (p.tournament.wins[t] ?? 0) >= 1) },
  { id: 'triple_crown', name: 'Triple Crown', desc: 'Hold the Worlds, the Supercup, and the Showdown.', glyph: '🏆', tier: 'cosmic', earned: p => ['world_championship', 'leodones_supercup', 'legend_showdown'].every(t => (p.tournament.wins[t] ?? 0) >= 1) },
  { id: 'untouchable', name: 'The Untouchable', desc: "Conquer the Legends' Gauntlet.", glyph: '🌌', tier: 'cosmic', earned: p => !!p.flags['beat_legends_gauntlet'] },
];

const ACH_RING: Record<Achievement['tier'], { a: string; b: string }> = {
  bronze: { a: '#f0b27a', b: '#8a4a1a' },
  silver: { a: '#eef2f8', b: '#7a8694' },
  gold: { a: '#ffe88a', b: '#a87c1a' },
  platinum: { a: '#bafff2', b: '#2a8a7a' },
  cosmic: { a: '#ff7ae0', b: '#5a1a9a' },
};
const ACH_TIER_LABEL: Record<Achievement['tier'], string> = {
  bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', cosmic: 'Cosmic',
};

function renderAchievementSVG(a: Achievement): string {
  const r = ACH_RING[a.tier];
  const glow = a.tier === 'cosmic' ? `<circle cx="50" cy="50" r="36" fill="none" stroke="url(#ar_${a.id})" stroke-width="1.5" opacity="0.6" filter="drop-shadow(0 0 7px #ff7ae0)" />` : '';
  return `
    <svg viewBox="0 0 100 100" class="trophy-svg">
      <defs><linearGradient id="ar_${a.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${r.a}" /><stop offset="100%" stop-color="${r.b}" />
      </linearGradient></defs>
      ${glow}
      <circle cx="50" cy="50" r="33" fill="none" stroke="url(#ar_${a.id})" stroke-width="6" />
      <circle cx="50" cy="50" r="26" fill="#10142a" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.28" />
      <text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-size="30">${a.glyph}</text>
    </svg>
  `;
}

/** Show the grand full-screen Trophy Showcase scene when a tournament is won */
export function showTrophyShowcase(p: Player, tierId: string): Promise<void> {
  const container = document.getElementById('trophy-showcase');
  if (!container) return Promise.resolve();

  const trophy = TROPHIES[tierId] ?? TROPHIES.weekly_open;
  const isWorlds = tierId === 'world_championship';

  // Light beams or flares
  const effectsHtml = isWorlds
    ? `<div class="t-showcase-flare"></div>
       <div class="t-showcase-reflection-sweep"></div>
       <div class="t-showcase-sparkles"></div>`
    : `<div class="t-showcase-flare light"></div>`;

  container.innerHTML = `
    <div class="t-showcase-overlay"></div>
    <div class="t-showcase-spotlight"></div>
    <div class="t-showcase-content">
      <div class="t-showcase-heading">NEW TROPHY EARNED</div>
      <div class="t-showcase-trophy-name">${trophy.name}</div>
      <div class="t-showcase-trophy-viewport ${isWorlds ? 'epic-chrome' : ''}">
        ${effectsHtml}
        <div class="t-showcase-trophy-model animate-showcase">
          ${trophy.renderSVG()}
        </div>
      </div>
      <div class="t-showcase-trophy-desc">${trophy.desc}</div>
      <button class="ui-btn primary t-showcase-btn" id="t-showcase-continue">Place in Trophy Case ▶</button>
    </div>
  `;

  container.style.display = 'flex';
  sfx('fanfare');

  // Spawn sparkle particles if World Championship
  if (isWorlds) {
    const sparkles = container.querySelector('.t-showcase-sparkles') as HTMLElement;
    if (sparkles) {
      for (let i = 0; i < 30; i++) {
        const star = document.createElement('i');
        star.className = 't-sparkle';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        star.style.animationDuration = `${1 + Math.random() * 1.5}s`;
        sparkles.appendChild(star);
      }
    }
  }

  return new Promise<void>(resolve => {
    const done = () => {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve();
    };

    const btn = container.querySelector('#t-showcase-continue') as HTMLButtonElement;
    if (btn) btn.onclick = done;

    // keyboard skip
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', onKey);
        done();
      }
    };
    window.addEventListener('keydown', onKey);
  });
}

/** Show the highly interactive scrollable Trophy Case screen */
export function showTrophyCase(p: Player, onClose?: () => void): void {
  const container = document.getElementById('trophy-case-screen');
  if (!container) {
    if (onClose) onClose();
    return;
  }

  // Calculate career statistics
  const winsRecord = p.tournament.wins;
  const entriesRecord = p.tournament.entries;

  let totalEntered = 0;
  for (const k in entriesRecord) {
    totalEntered += entriesRecord[k] ?? 0;
  }

  let totalWon = 0;
  for (const k in winsRecord) {
    totalWon += winsRecord[k] ?? 0;
  }

  const matchesWon = p.tournament.tournamentMatchesWon ?? 0;
  const matchesLost = p.tournament.tournamentMatchesLost ?? 0;
  const totalMatches = matchesWon + matchesLost;
  const winPercent = totalMatches > 0 ? Math.round((matchesWon / totalMatches) * 100) : 0;

  const currentStreak = p.tournament.currentStreak ?? 0;
  const bestStreak = p.tournament.bestStreak ?? 0;

  const mmrNow = getPlayerMMR(p);
  const peakMMR = getPlayerPeakMMR(p);
  const myDiv = divisionFor(mmrNow);
  const achEarned = ACHIEVEMENTS.filter(a => a.earned(p)).length;

  // Render main layout
  container.innerHTML = `
    <div class="t-case-backdrop"></div>
    <div class="t-case-panel panel">
      <div class="t-case-header">
        <h2 class="t-case-title">🏆 Tamer's Trophy Case</h2>
        <button class="ui-btn" id="t-case-close">Close (Esc)</button>
      </div>

      <div class="t-case-layout">
        <!-- Sidebar Career Stats -->
        <div class="t-case-sidebar">
          <div class="tc-stat-card">
            <div class="tc-stat-val">${totalWon} / ${totalEntered}</div>
            <div class="tc-stat-lbl">Tournaments Won</div>
          </div>
          <div class="tc-stat-card">
            <div class="tc-stat-val">${matchesWon} - ${matchesLost}</div>
            <div class="tc-stat-lbl">Tournament Match Record</div>
            <div class="tc-stat-bar-bg">
              <div class="tc-stat-bar-fill" style="width: ${winPercent}%"></div>
            </div>
            <div class="tc-stat-sub">${winPercent}% Win Rate</div>
          </div>
          <div class="tc-stat-card">
            <div class="tc-stat-val">${currentStreak}</div>
            <div class="tc-stat-lbl">Current Match Streak</div>
          </div>
          <div class="tc-stat-card">
            <div class="tc-stat-val">${bestStreak}</div>
            <div class="tc-stat-lbl">Personal Best Streak</div>
          </div>
          <div class="tc-stat-card">
            <div class="tc-stat-val">${p.tournamentPoints}</div>
            <div class="tc-stat-lbl">Tournament Points (TP)</div>
          </div>
          <div class="tc-stat-card" style="border-color:${myDiv.color}">
            <div class="tc-stat-val" style="color:${myDiv.color}">${myDiv.icon} ${myDiv.name}</div>
            <div class="tc-stat-lbl">Division · ★ ${mmrNow.toLocaleString()} MMR</div>
            <div class="tc-stat-sub">⛰️ Peak ${peakMMR.toLocaleString()}</div>
          </div>
          <div class="tc-stat-card">
            <div class="tc-stat-val">${achEarned} / ${ACHIEVEMENTS.length}</div>
            <div class="tc-stat-lbl">Achievements Unlocked</div>
          </div>
        </div>

        <!-- Trophy Grid -->
        <div class="t-case-grid-wrap">
          <div class="t-case-section-label">🏆 Championship Trophies</div>
          <div class="t-case-grid">
            ${Object.keys(TROPHIES).map(tierId => {
              const trophy = TROPHIES[tierId];
              const wins = p.tournament.trophies?.filter(t => t.tierId === tierId) || [];
              const hasTrophy = wins.length > 0;

              if (hasTrophy) {
                return `
                  <div class="t-case-item earned" data-tier-id="${tierId}">
                    <div class="t-case-item-glow"></div>
                    <div class="t-case-item-model">${trophy.renderSVG()}</div>
                    <div class="t-case-item-name">${trophy.name}</div>
                    <div class="t-case-item-badge">🏆 x${wins.length}</div>
                  </div>
                `;
              } else {
                return `
                  <div class="t-case-item locked">
                    <div class="t-case-item-model locked">
                      ${trophy.renderSVG()}
                      <div class="t-case-lock-icon">🔒</div>
                    </div>
                    <div class="t-case-item-name">${trophy.name}</div>
                    <div class="t-case-item-badge locked">Locked</div>
                  </div>
                `;
              }
            }).join('')}
          </div>

          <div class="t-case-section-label">⭐ Milestones &amp; Achievements</div>
          <div class="t-case-grid">
            ${ACHIEVEMENTS.map(a => {
              const got = a.earned(p);
              if (got) {
                return `
                  <div class="t-case-item earned ach">
                    <div class="t-case-item-glow"></div>
                    <div class="t-case-item-model">${renderAchievementSVG(a)}</div>
                    <div class="t-case-item-name">${a.name}</div>
                    <div class="t-case-item-badge ach-${a.tier}">${ACH_TIER_LABEL[a.tier]}</div>
                    <div class="t-case-ach-desc">${a.desc}</div>
                  </div>
                `;
              }
              return `
                <div class="t-case-item locked ach">
                  <div class="t-case-item-model locked">
                    ${renderAchievementSVG(a)}
                    <div class="t-case-lock-icon">🔒</div>
                  </div>
                  <div class="t-case-item-name">${a.name}</div>
                  <div class="t-case-item-badge locked">Locked</div>
                  <div class="t-case-ach-desc">${a.desc}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Inspector Screen Overlay -->
    <div id="t-case-inspector" style="display: none"></div>
  `;

  container.style.display = 'flex';

  // Wire up close button
  const closeBtn = container.querySelector('#t-case-close') as HTMLButtonElement;
  const closeFunc = () => {
    container.style.display = 'none';
    container.innerHTML = '';
    window.removeEventListener('keydown', keyClose);
    if (onClose) onClose();
  };
  const keyClose = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const inspector = document.getElementById('t-case-inspector');
      if (inspector && inspector.style.display !== 'none') {
        inspector.style.display = 'none';
      } else {
        closeFunc();
      }
    }
  };
  closeBtn.onclick = closeFunc;
  window.addEventListener('keydown', keyClose);

  // Wire up trophy clicks (championship trophies only — achievements aren't inspectable)
  const items = container.querySelectorAll('.t-case-item.earned:not(.ach)');
  items.forEach(el => {
    const htmlEl = el as HTMLElement;
    htmlEl.onclick = () => {
      const tierId = htmlEl.getAttribute('data-tier-id')!;
      showTrophyDetail(p, tierId);
    };
  });
}

/** Show detailed overlay modal for a selected earned trophy */
function showTrophyDetail(p: Player, tierId: string): void {
  const inspector = document.getElementById('t-case-inspector');
  if (!inspector) return;

  const trophyDef = TROPHIES[tierId];
  const wins = p.tournament.trophies?.filter(t => t.tierId === tierId) || [];
  if (!wins.length) return;

  let currentTrophyIndex = wins.length - 1;

  const renderDetailCard = (idx: number) => {
    const trophy = wins[idx];
    const isWorlds = tierId === 'world_championship';

    // Competitor party
    const partyHtml = trophy.playerParty.map(g => {
      const spec = SPECIES[g.speciesId];
      const typeCol = TYPE_CSS[spec?.type] ?? '#999';
      const snap = speciesSnapshotURL(g.speciesId);
      return `
        <div class="tc-g-card">
          <div class="tc-g-snap-wrap" style="border-color:${typeCol}">
            <img class="tc-g-snap" src="${snap}" />
          </div>
          <div class="tc-g-info">
            <div class="tc-g-nick">${g.nickname}</div>
            <div class="tc-g-lvl">Lvl ${g.level}</div>
            <div class="tc-g-type" style="background:${typeCol}">${spec?.type ?? 'Aether'}</div>
          </div>
        </div>
      `;
    }).join('');

    // Opponent party
    const oppPartyHtml = trophy.finalOpponentSpeciesIds && trophy.finalOpponentSpeciesIds.length > 0
      ? trophy.finalOpponentSpeciesIds.map(sid => {
          const spec = SPECIES[sid];
          const typeCol = TYPE_CSS[spec?.type] ?? '#999';
          const snap = speciesSnapshotURL(sid);
          return `
            <div class="tc-opp-g-card" title="${spec?.name ?? sid}" style="border-color:${typeCol}">
              <img src="${snap}" />
            </div>
          `;
        }).join('')
      : `<div style="opacity: 0.6; font-size: 13px;">No opponent details logged.</div>`;

    const selectorHtml = wins.length > 1
      ? `<div class="tc-inspect-select-wrap">
          <label>Victory:</label>
          <select id="tc-inspect-select">
            ${wins.map((w, index) => `<option value="${index}" ${index === idx ? 'selected' : ''}>Victory #${index + 1} (${w.dateStr})</option>`).join('')}
          </select>
         </div>`
      : `<div class="tc-inspect-date">📅 Earned on: <b>${trophy.dateStr}</b> (Day ${trophy.day + 1})</div>`;

    inspector.innerHTML = `
      <div class="tc-inspect-panel panel">
        <div class="tc-inspect-close-btn" id="tc-inspect-close">✖</div>
        
        <div class="tc-inspect-columns">
          <!-- Left: Rotating trophy -->
          <div class="tc-inspect-visual-column">
            <div class="tc-inspect-spotlight"></div>
            <div class="tc-inspect-trophy-model-wrap ${isWorlds ? 'epic-chrome' : ''}">
              ${isWorlds ? `<div class="t-showcase-flare"></div><div class="t-showcase-reflection-sweep"></div>` : ''}
              <div class="tc-inspect-trophy-model animate-spin">
                ${trophyDef.renderSVG()}
              </div>
            </div>
            <div class="tc-inspect-trophy-name">${trophyDef.name}</div>
            <div class="tc-inspect-trophy-desc">${trophyDef.desc}</div>
          </div>

          <!-- Right: Victory stats, opponent and squad -->
          <div class="tc-inspect-details-column">
            <h3 class="tc-inspect-section-title">🏆 Conquest Details</h3>
            
            ${selectorHtml}

            <!-- Opponent -->
            <div class="tc-inspect-opp-card" style="border-left-color: ${trophy.finalOpponentColor}">
              <div class="tc-opp-label">FINAL OPPONENT DEFEATED</div>
              <div class="tc-opp-name" style="color: ${trophy.finalOpponentColor}">${trophy.finalOpponentName}</div>
              <div class="tc-opp-sub">${trophy.finalOpponentSub}</div>
              <div class="tc-opp-party-label">Opponent's Roster:</div>
              <div class="tc-opp-party">
                ${oppPartyHtml}
              </div>
            </div>

            <!-- Victorious Squad -->
            <div class="tc-inspect-squad-section">
              <div class="tc-squad-label">YOUR VICTORIOUS SQUAD:</div>
              <div class="tc-squad-grid">
                ${partyHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeBtn = inspector.querySelector('#tc-inspect-close') as HTMLElement;
    closeBtn.onclick = () => { inspector.style.display = 'none'; };

    const select = inspector.querySelector('#tc-inspect-select') as HTMLSelectElement;
    if (select) {
      select.onchange = () => {
        currentTrophyIndex = parseInt(select.value);
        renderDetailCard(currentTrophyIndex);
      };
    }
  };

  renderDetailCard(currentTrophyIndex);
  inspector.style.display = 'flex';
  sfx('click');
}
