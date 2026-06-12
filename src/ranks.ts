// ============================================================
// AZ Tamer — Universal Tamer Ranks
// One ladder shared by every Grand House. Each rank carries a
// unique, hand-drawn shiny badge (canvas art + CSS shimmer).
// ============================================================
import type { Player } from './state';

export interface RankDef {
  name: string;
  /** primary metal / gem color */
  color: string;
  /** light sheen color */
  sheen: string;
  /** dark base color */
  base: string;
  /** score required to hold this rank */
  threshold: number;
  /** short flavor line shown in the rank ladder */
  epithet: string;
}

export const RANKS: RankDef[] = [
  { name: 'Beginner',     color: '#b07b4a', sheen: '#f2d2a8', base: '#5a3a1e', threshold: 0,   epithet: 'Every legend signs its first page.' },
  { name: 'Expert',       color: '#aab4c4', sheen: '#f2f6ff', base: '#4a5468', threshold: 10,  epithet: 'A first bracket survived.' },
  { name: 'Veteran',      color: '#5a8ab8', sheen: '#cfe8ff', base: '#23405e', threshold: 25,  epithet: 'The crowd knows your name.' },
  { name: 'Professional', color: '#d9a93a', sheen: '#fff0b8', base: '#6e4f12', threshold: 45,  epithet: 'Seeded, not drawn.' },
  { name: 'Elite',        color: '#3ab87a', sheen: '#c8ffe4', base: '#125a38', threshold: 70,  epithet: 'Named in circuit dispatches.' },
  { name: 'Lieutenant',   color: '#3a7de0', sheen: '#c8e0ff', base: '#15346a', threshold: 100, epithet: 'Quarterfinals fear you.' },
  { name: 'Vice-Captain', color: '#9a5af2', sheen: '#e8d2ff', base: '#42207a', threshold: 140, epithet: 'A finals-night regular.' },
  { name: 'Captain',      color: '#f2c14e', sheen: '#fff8d8', base: '#7a5a10', threshold: 190, epithet: 'A banner the Coliseum rallies to.' },
  { name: 'Grand Chief',  color: '#e8243a', sheen: '#ffd2d8', base: '#5e0815', threshold: 250, epithet: 'The ruby seal of Aurel itself.' },
];

/**
 * Rank runs on TOURNAMENT POINTS — and nothing else. Battles, captures,
 * quests and dungeon clears build your career, but the ladder only moves
 * when you place in sanctioned tournaments: the Grand Coliseum's brackets,
 * the Turmal Seasonal, and the intercontinental circuits beyond.
 */
export function rankScore(p: Player): number {
  return p.tournamentPoints;
}

/** Award TP from a sanctioned tournament placement. */
export function awardTournamentPoints(p: Player, points: number): void {
  p.tournamentPoints += Math.max(0, Math.floor(points));
}

export function rankIndexFor(p: Player): number {
  const s = rankScore(p);
  let idx = 0;
  RANKS.forEach((r, i) => { if (s >= r.threshold) idx = i; });
  return idx;
}

export const rankFor = (p: Player): string => RANKS[rankIndexFor(p)].name;

/** Progress toward the next rank; null parts when at Grand Chief. */
export function rankProgress(p: Player): { index: number; score: number; next: RankDef | null; pct: number } {
  const index = rankIndexFor(p);
  const score = rankScore(p);
  const next = RANKS[index + 1] ?? null;
  const cur = RANKS[index].threshold;
  const pct = next ? Math.min(1, (score - cur) / (next.threshold - cur)) : 1;
  return { index, score, next, pct };
}

// ---------------- badge artwork ----------------
const badgeCache = new Map<string, HTMLCanvasElement>();

function metal(ctx: CanvasRenderingContext2D, r: RankDef, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, r.sheen);
  g.addColorStop(0.35, r.color);
  g.addColorStop(0.65, r.base);
  g.addColorStop(1, r.color);
  return g;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, points = 5, ri = ro * 0.42): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? ro : ri;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function chevron(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y);
  ctx.lineTo(cx, y + h);
  ctx.lineTo(cx + w / 2, y);
  ctx.lineTo(cx + w / 2, y - h * 0.45);
  ctx.lineTo(cx, y + h * 0.55);
  ctx.lineTo(cx - w / 2, y - h * 0.45);
  ctx.closePath();
}

function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.5 + side * (0.35 + i * 0.16) * Math.PI;
      const lx = cx + Math.cos(a) * R, ly = cy + Math.sin(a) * R;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a + side * 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.16, R * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Draw one rank's unique badge onto a square canvas. */
export function rankBadgeCanvas(index: number, size = 128): HTMLCanvasElement {
  const key = `${index}:${size}`;
  const hit = badgeCache.get(key);
  if (hit) return hit;

  const r = RANKS[Math.max(0, Math.min(RANKS.length - 1, index))];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size, m = s / 2;
  const grad = metal(ctx, r, 0, 0, s, s);

  ctx.save();
  ctx.shadowColor = r.color;
  ctx.shadowBlur = s * 0.10;
  ctx.lineJoin = 'round';

  const ring = (R: number) => {
    ctx.beginPath(); ctx.arc(m, m, R, 0, Math.PI * 2);
    ctx.strokeStyle = grad; ctx.lineWidth = s * 0.05; ctx.stroke();
  };
  const ribbon = () => {
    ctx.fillStyle = r.base;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(m + side * s * 0.10, s * 0.62);
      ctx.lineTo(m + side * s * 0.24, s * 0.94);
      ctx.lineTo(m + side * s * 0.13, s * 0.88);
      ctx.lineTo(m + side * s * 0.05, s * 0.97);
      ctx.closePath(); ctx.fill();
    }
  };

  if (index === 0) {
    // BEGINNER — bronze roundel, single chevron
    ctx.beginPath(); ctx.arc(m, m, s * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = r.base;
    ctx.beginPath(); ctx.arc(m, m, s * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r.sheen;
    chevron(ctx, m, m + s * 0.04, s * 0.3, s * 0.13); ctx.fill();
  } else if (index === 1) {
    // EXPERT — silver shield, twin chevrons
    ctx.beginPath();
    ctx.moveTo(m, s * 0.10); ctx.lineTo(s * 0.82, s * 0.24); ctx.lineTo(s * 0.76, s * 0.62);
    ctx.quadraticCurveTo(s * 0.72, s * 0.82, m, s * 0.92);
    ctx.quadraticCurveTo(s * 0.28, s * 0.82, s * 0.24, s * 0.62);
    ctx.lineTo(s * 0.18, s * 0.24); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = r.sheen;
    chevron(ctx, m, s * 0.40, s * 0.34, s * 0.12); ctx.fill();
    chevron(ctx, m, s * 0.58, s * 0.34, s * 0.12); ctx.fill();
  } else if (index === 2) {
    // VETERAN — kite shield with crossed blades
    ctx.beginPath();
    ctx.moveTo(m, s * 0.08); ctx.lineTo(s * 0.80, s * 0.30); ctx.lineTo(m, s * 0.94); ctx.lineTo(s * 0.20, s * 0.30);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = r.sheen; ctx.lineWidth = s * 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.34, s * 0.26); ctx.lineTo(s * 0.66, s * 0.62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.66, s * 0.26); ctx.lineTo(s * 0.34, s * 0.62); ctx.stroke();
    ctx.fillStyle = r.sheen;
    star(ctx, m, s * 0.72, s * 0.07); ctx.fill();
  } else if (index === 3) {
    // PROFESSIONAL — gold lozenge plate, centered star
    ctx.save();
    ctx.translate(m, m); ctx.rotate(Math.PI / 4);
    const d = s * 0.30;
    ctx.fillStyle = grad;
    ctx.fillRect(-d, -d, d * 2, d * 2);
    ctx.strokeStyle = r.base; ctx.lineWidth = s * 0.03;
    ctx.strokeRect(-d * 0.72, -d * 0.72, d * 1.44, d * 1.44);
    ctx.restore();
    ctx.fillStyle = r.sheen;
    star(ctx, m, m, s * 0.15); ctx.fill();
  } else if (index === 4) {
    // ELITE — emerald hexagon with rising wings
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(m + Math.cos(a) * s * 0.28, m + Math.sin(a) * s * 0.28);
    }
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = r.sheen;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(m + side * s * 0.22, m);
      ctx.quadraticCurveTo(m + side * s * 0.46, m - s * 0.10, m + side * s * 0.44, m - s * 0.30);
      ctx.quadraticCurveTo(m + side * s * 0.34, m - s * 0.14, m + side * s * 0.20, m - s * 0.12);
      ctx.closePath(); ctx.fill();
    }
    star(ctx, m, m + s * 0.02, s * 0.11); ctx.fillStyle = r.base; ctx.fill();
  } else if (index === 5) {
    // LIEUTENANT — sapphire pentagon, command bar, two stars
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(m + Math.cos(a) * s * 0.32, m + Math.sin(a) * s * 0.32);
    }
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = r.base;
    ctx.fillRect(m - s * 0.20, m - s * 0.035, s * 0.40, s * 0.07);
    ctx.fillStyle = r.sheen;
    star(ctx, m - s * 0.10, m - s * 0.14, s * 0.075); ctx.fill();
    star(ctx, m + s * 0.10, m - s * 0.14, s * 0.075); ctx.fill();
    ribbon();
  } else if (index === 6) {
    // VICE-CAPTAIN — violet sunburst with crescent and three stars
    ctx.fillStyle = grad;
    star(ctx, m, m, s * 0.36, 8, s * 0.24); ctx.fill();
    ctx.fillStyle = r.base;
    ctx.beginPath(); ctx.arc(m, m, s * 0.19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r.sheen;
    ctx.beginPath();
    ctx.arc(m, m, s * 0.15, Math.PI * 0.15, Math.PI * 1.2, false);
    ctx.arc(m + s * 0.05, m - s * 0.03, s * 0.13, Math.PI * 1.05, Math.PI * 0.3, true);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) { star(ctx, m - s * 0.12 + i * s * 0.12, m + s * 0.28, s * 0.05); ctx.fill(); }
  } else if (index === 7) {
    // CAPTAIN — radiant gold medal, laurel wreath, command star
    ctx.fillStyle = grad;
    star(ctx, m, m, s * 0.40, 12, s * 0.3); ctx.fill();
    ctx.beginPath(); ctx.arc(m, m, s * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = r.base; ctx.fill();
    ring(s * 0.26);
    laurel(ctx, m, m, s * 0.33, r.sheen);
    ctx.fillStyle = r.sheen;
    star(ctx, m, m, s * 0.16); ctx.fill();
  } else {
    // GRAND CHIEF — sparkling crimson ruby crown-seal
    // outer black-gold seal
    ctx.beginPath(); ctx.arc(m, m, s * 0.42, 0, Math.PI * 2);
    const seal = ctx.createRadialGradient(m, m, s * 0.1, m, m, s * 0.42);
    seal.addColorStop(0, '#3a0a12'); seal.addColorStop(1, '#14040a');
    ctx.fillStyle = seal; ctx.fill();
    ctx.strokeStyle = metal(ctx, RANKS[7], 0, 0, s, s); ctx.lineWidth = s * 0.04; ctx.stroke();
    // crown
    ctx.fillStyle = metal(ctx, RANKS[7], 0, s * 0.1, 0, s * 0.4);
    ctx.beginPath();
    ctx.moveTo(m - s * 0.20, s * 0.30); ctx.lineTo(m - s * 0.20, s * 0.18); ctx.lineTo(m - s * 0.10, s * 0.26);
    ctx.lineTo(m, s * 0.13); ctx.lineTo(m + s * 0.10, s * 0.26); ctx.lineTo(m + s * 0.20, s * 0.18);
    ctx.lineTo(m + s * 0.20, s * 0.30); ctx.closePath(); ctx.fill();
    // faceted ruby
    const ruby = ctx.createLinearGradient(m - s * 0.2, m, m + s * 0.2, m + s * 0.3);
    ruby.addColorStop(0, '#ff6a7a'); ruby.addColorStop(0.4, r.color); ruby.addColorStop(1, '#7a0a1a');
    ctx.fillStyle = ruby;
    ctx.beginPath();
    ctx.moveTo(m - s * 0.18, m - s * 0.02); ctx.lineTo(m - s * 0.09, m - s * 0.12); ctx.lineTo(m + s * 0.09, m - s * 0.12);
    ctx.lineTo(m + s * 0.18, m - s * 0.02); ctx.lineTo(m, m + s * 0.26); ctx.closePath(); ctx.fill();
    // facet lines
    ctx.strokeStyle = 'rgba(255,220,228,0.65)'; ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(m - s * 0.18, m - s * 0.02); ctx.lineTo(m + s * 0.18, m - s * 0.02);
    ctx.moveTo(m - s * 0.09, m - s * 0.12); ctx.lineTo(m - s * 0.05, m - s * 0.02); ctx.lineTo(m, m + s * 0.26);
    ctx.moveTo(m + s * 0.09, m - s * 0.12); ctx.lineTo(m + s * 0.05, m - s * 0.02); ctx.lineTo(m, m + s * 0.26);
    ctx.stroke();
    // sparkles
    ctx.fillStyle = '#fff4f6';
    for (const [sx, sy, sr] of [[m - s * 0.12, m - s * 0.07, 0.035], [m + s * 0.14, m + s * 0.06, 0.028], [m - s * 0.02, m + s * 0.16, 0.022]] as const) {
      star(ctx, sx, sy, s * sr, 4, s * sr * 0.3); ctx.fill();
    }
  }

  ctx.restore();
  badgeCache.set(key, c);
  return c;
}

export const rankBadgeURL = (index: number, size = 128): string =>
  rankBadgeCanvas(index, size).toDataURL();

/**
 * Inline HTML for an animated, shiny rank badge.
 * `.rank-badge` carries the CSS shimmer; rank 9 adds ruby sparkles.
 */
export function rankBadgeHTML(index: number, px = 22, withName = false): string {
  const r = RANKS[index];
  const img = `<span class="rank-badge ${index === RANKS.length - 1 ? 'grandchief' : ''}" style="width:${px}px;height:${px}px">
    <img src="${rankBadgeURL(index, Math.max(64, px * 2))}" alt="${r.name}" draggable="false"></span>`;
  return withName ? `${img}<b style="color:${r.color}">${r.name}</b>` : img;
}

/** The full nine-badge ladder with progress bar — for the Tamer Data panel. */
export function rankLadderHTML(p: Player): string {
  const { index, score, next, pct } = rankProgress(p);
  let html = `<div class="sub">Tournament Points: <b class="goldcol">${score} TP</b>${next
    ? ` · ${next.threshold - score} more to <b style="color:${next.color}">${next.name}</b>`
    : ' · the highest honor in Aurel'}</div>
    <div class="rank-progress"><div style="width:${Math.round(pct * 100)}%"></div></div>
    <div class="sub" style="font-size:11px;margin:2px 0 4px">Rank moves on tournament placements only — earn TP in the Grand Coliseum's brackets and the circuits beyond.</div>
    <div style="max-height:235px;overflow-y:auto">`;
  html += RANKS.map((r, i) => `
    <div class="rank-ladder-row ${i === index ? 'here' : ''}" style="${i > index ? 'opacity:0.5' : ''}" title="${r.epithet}">
      ${rankBadgeHTML(i, 22)}<b style="color:${r.color}">${r.name}</b>
      <span class="sub" style="margin-left:auto">${i < index ? '✓ earned' : i === index ? '★ current' : `needs ${r.threshold}`}</span>
    </div>`).join('');
  return html + '</div>';
}
