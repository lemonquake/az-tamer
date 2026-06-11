// ============================================================
// AZ Tamer — Guild identity: deep lore, unique 2D icons,
// rank ladders, 3D effigies, and guild-card artwork.
// Every Grand House has its own visual language.
// ============================================================
import * as THREE from 'three';
import { HOUSES, type HouseDef } from './data';
import type { Player } from './state';
import { RANKS, rankIndexFor, rankFor, rankBadgeCanvas } from './ranks';

// the rank ladder is universal across all guilds — see src/ranks.ts
export { rankFor };

// ---------------- lore ----------------
export interface GuildLore {
  epithet: string;            // "The Ember Court"
  founder: string;
  founded: string;            // in-world era text
  hall: string;               // name of their hall
  officer: string;            // university recruiting officer
  officerStyle: string;       // one-line personality note (used in dialogue)
  history: string[];          // long-form lore paragraphs
  creedLong: string;          // expanded creed
  effigyName: string;
  effigyDesc: string;
  cardName: string;           // what the guild calls its card
}

export const GUILD_LORE: Record<string, GuildLore> = {
  pyrelight: {
    epithet: 'The Ember Court',
    founder: 'Saint Adair the Unburnt',
    founded: 'Year 12 of the Reforging',
    hall: 'The Cindral Keep',
    officer: 'Officer Roa Emberlane',
    officerStyle: 'loud, warm, laughs from the belly',
    history: [
      'When the old empire fell and its war-engines went feral, it was Saint Adair who walked into the burning capital and walked back out carrying forty orphans and a single ember in a brass lantern. That ember has never been allowed to die. It burns today in the heart of the Cindral Keep, and every Pyrelight tamer lights their first campfire from it.',
      'Pyrelight teaches that fear is fuel. Their tamers are first through every breach, torch in one hand, Guardian at their side. The city sleeps because the Ember Court does not.',
    ],
    creedLong: 'A flame untended dies; a flame unshared is wasted. Burn brighter than your doubt, and lend your light freely.',
    effigyName: 'The Lantern of Saint Adair',
    effigyDesc: 'A brass-and-obsidian lantern holding a sliver of the First Ember. It is warm to the touch, always.',
    cardName: 'Ember Sigil',
  },
  mistveil: {
    epithet: 'The Tidebound Circle',
    founder: 'Oracle Neris of the Nine Pools',
    founded: 'Year 3 of the Reforging',
    hall: 'The Pearlspire',
    officer: 'Officer Cael Driftwood',
    officerStyle: 'soft-spoken, chooses every word like a stone for a wall',
    history: [
      'Oracle Neris read the future in still water and saw the empire drown in its own ambition. She gathered the river-folk and the pearl-divers and taught them patience as a weapon. When the floods came, Mistveil\'s arks saved three provinces.',
      'The Circle keeps the city\'s reservoirs, heals its sick, and maps the drowned ruins of the old world. They believe every secret eventually surfaces — one only has to outlast it.',
    ],
    creedLong: 'Still water carves the canyon. Do not race the river; become it, and the mountain will move aside.',
    effigyName: 'The Tear of Neris',
    effigyDesc: 'A flawless sphere of abyssal pearl suspended over carved coral. Looking into it feels like remembering rain.',
    cardName: 'Tide Sigil',
  },
  thornward: {
    epithet: 'The Greenwall Covenant',
    founder: 'Grandmother Bramble',
    founded: 'Before the Reforging — the Covenant predates the city',
    hall: 'The Rootholme',
    officer: 'Officer Fen Mosswick',
    officerStyle: 'unhurried, smells faintly of soil and mint, feeds everyone',
    history: [
      'No one knows Grandmother Bramble\'s true name. The Covenant\'s oldest scroll simply shows a woman planting a seed in a battlefield crater. That seed is now the Rootholme — a living hall whose branches hold up three hundred homes.',
      'Thornward grows the city\'s food, tends its wounded Guardians, and guards the deep greenways. They are slow to anger; the old saying goes that by the time a Thornward tamer draws their blade, the fight has already been lost by the other side, ten moves ago.',
    ],
    creedLong: 'Roots first, then branches. What you grow in secret holds up what you build in the open.',
    effigyName: 'The First Seed',
    effigyDesc: 'A golden acorn fossil cradled in living vines that bloom once a year — on the day you joined.',
    cardName: 'Verdant Sigil',
  },
  stormcall: {
    epithet: 'The Thunder Legion',
    founder: 'Marshal Kessa Voltaine',
    founded: 'Year 9 of the Reforging',
    hall: 'The Galvanic Bastion',
    officer: 'Officer Brigg Coilstrike',
    officerStyle: 'clipped sentences, parade-ground posture, secretly sentimental',
    history: [
      'Marshal Voltaine was the empire\'s youngest siege-engineer before she turned her cannons around and ended the Tyrant\'s March in a single storm-lit night. The Legion she founded keeps the old war-engines asleep — and studies them, so that nothing like the empire can rise again.',
      'Stormcall runs the city\'s grid, its signal towers, and its rapid-response wings. Their drills are legendary, their coffee is terrible, and their loyalty is absolute.',
    ],
    creedLong: 'Strike once, strike true. Hesitation is a debt paid in other people\'s blood.',
    effigyName: 'The Coil of Voltaine',
    effigyDesc: 'A miniature storm-coil that hums with a captured bolt from the night of the Tyrant\'s fall. It never grounds out.',
    cardName: 'Storm Sigil',
  },
  duskwatch: {
    epithet: 'The Veiled Order',
    founder: 'The Nameless Warden',
    founded: 'Unrecorded — their ledger begins mid-sentence',
    hall: 'The Umbral Pagoda',
    officer: 'Officer Sable Quietstep',
    officerStyle: 'appears beside you without sound, dry wit, keeps lethal candy',
    history: [
      'Every city has things it cannot look at directly. The Duskwatch was founded — by someone — to look anyway. Their first ledger entry reads "…and that is why the moon must be counted twice," and no scholar has ever found page one.',
      'They hunt the corrupted things that slip out of the deep ruins by night, and they keep the city\'s secrets the way other guilds keep treasuries. To be saved by a Duskwatch tamer is to wake up safe with no memory of danger.',
    ],
    creedLong: 'See what the light hides. Stand where no one thanks you, so that no one ever has to.',
    effigyName: 'The Second Moon',
    effigyDesc: 'A crescent of black glass that casts a faint shadow even in darkness. It is always slightly colder than the room.',
    cardName: 'Dusk Sigil',
  },
};

export const questsDoneCount = (p: Player): number =>
  Object.values(p.quests).filter(v => v === 'done').length;

// ---------------- unique 2D guild icons ----------------
const iconCache = new Map<string, HTMLCanvasElement>();

/** Draw a guild's unique emblem onto a square canvas. */
export function guildIconCanvas(houseId: string, size = 128): HTMLCanvasElement {
  const key = `${houseId}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const h = HOUSES.find(x => x.id === houseId)!;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size, m = s / 2;

  // shield backplate shared by all guilds, tinted per guild
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, shade(h.color, 0.25));
  bg.addColorStop(1, shade(h.color, -0.55));
  ctx.beginPath();
  ctx.moveTo(m, s * 0.04);
  ctx.lineTo(s * 0.92, s * 0.2);
  ctx.lineTo(s * 0.86, s * 0.62);
  ctx.quadraticCurveTo(s * 0.82, s * 0.86, m, s * 0.97);
  ctx.quadraticCurveTo(s * 0.18, s * 0.86, s * 0.14, s * 0.62);
  ctx.lineTo(s * 0.08, s * 0.2);
  ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = s * 0.035; ctx.strokeStyle = shade(h.color, 0.5); ctx.stroke();

  ctx.save();
  ctx.shadowColor = h.color; ctx.shadowBlur = s * 0.12;
  ctx.fillStyle = '#fff6e8';
  ctx.strokeStyle = '#fff6e8';

  if (houseId === 'pyrelight') {
    // triple-tongued flame
    ctx.beginPath();
    ctx.moveTo(m, s * 0.16);
    ctx.bezierCurveTo(s * 0.74, s * 0.36, s * 0.62, s * 0.5, s * 0.68, s * 0.66);
    ctx.bezierCurveTo(s * 0.62, s * 0.82, s * 0.38, s * 0.82, s * 0.32, s * 0.66);
    ctx.bezierCurveTo(s * 0.38, s * 0.5, s * 0.26, s * 0.36, m, s * 0.16);
    ctx.fill();
    ctx.fillStyle = shade(h.color, -0.35);
    ctx.beginPath();
    ctx.moveTo(m, s * 0.4);
    ctx.bezierCurveTo(s * 0.6, s * 0.52, s * 0.56, s * 0.6, m, s * 0.74);
    ctx.bezierCurveTo(s * 0.44, s * 0.6, s * 0.4, s * 0.52, m, s * 0.4);
    ctx.fill();
  } else if (houseId === 'mistveil') {
    // droplet over three waves
    ctx.beginPath();
    ctx.moveTo(m, s * 0.14);
    ctx.bezierCurveTo(s * 0.7, s * 0.4, s * 0.66, s * 0.56, m, s * 0.6);
    ctx.bezierCurveTo(s * 0.34, s * 0.56, s * 0.3, s * 0.4, m, s * 0.14);
    ctx.fill();
    ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = s * (0.68 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(s * 0.26, y);
      ctx.quadraticCurveTo(s * 0.38, y - s * 0.06, m, y);
      ctx.quadraticCurveTo(s * 0.62, y + s * 0.06, s * 0.74, y);
      ctx.stroke();
    }
  } else if (houseId === 'thornward') {
    // oak leaf with thorned stem
    ctx.beginPath();
    ctx.moveTo(m, s * 0.14);
    for (const [dx, dy] of [[0.18, 0.1], [0.12, 0.16], [0.16, 0.2], [0.08, 0.16]] as const) {
      ctx.quadraticCurveTo(m + s * (dx + 0.06), s * (0.14 + dy), m + s * dx, s * (0.2 + dy * 1.6));
    }
    ctx.quadraticCurveTo(m + s * 0.04, s * 0.7, m, s * 0.74);
    for (const [dx, dy] of [[0.08, 0.16], [0.16, 0.2], [0.12, 0.16], [0.18, 0.1]] as const) {
      ctx.quadraticCurveTo(m - s * dx, s * (0.2 + dy * 1.6), m - s * (dx + 0.06), s * (0.14 + dy));
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(h.color, -0.4); ctx.lineWidth = s * 0.025;
    ctx.beginPath(); ctx.moveTo(m, s * 0.2); ctx.lineTo(m, s * 0.86); ctx.stroke();
  } else if (houseId === 'stormcall') {
    // jagged thunderbolt
    ctx.beginPath();
    ctx.moveTo(s * 0.58, s * 0.12);
    ctx.lineTo(s * 0.34, s * 0.5);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(s * 0.4, s * 0.86);
    ctx.lineTo(s * 0.7, s * 0.42);
    ctx.lineTo(s * 0.53, s * 0.42);
    ctx.lineTo(s * 0.68, s * 0.12);
    ctx.closePath(); ctx.fill();
  } else {
    // duskwatch — crescent moon and watching star
    ctx.beginPath();
    ctx.arc(m, s * 0.5, s * 0.3, Math.PI * -0.42, Math.PI * 0.92, false);
    ctx.arc(m + s * 0.12, s * 0.44, s * 0.26, Math.PI * 0.8, Math.PI * -0.34, true);
    ctx.closePath(); ctx.fill();
    star(ctx, s * 0.66, s * 0.3, s * 0.07);
    star(ctx, s * 0.74, s * 0.46, s * 0.045);
  }
  ctx.restore();
  iconCache.set(key, c);
  return c;
}

export const guildIconURL = (houseId: string, size = 128): string =>
  guildIconCanvas(houseId, size).toDataURL();

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

/** Lighten (amt>0) or darken (amt<0) a #rrggbb color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------- default avatar ----------------
/** Generated voxel-style portrait used until the player uploads a photo. */
export function defaultAvatarURL(p: Player): string {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const house = HOUSES.find(h => h.id === p.houseId);
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, house ? shade(house.color, -0.2) : '#3a4468');
  bg.addColorStop(1, '#10121f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 256);
  // voxel face
  ctx.fillStyle = '#e8b48a'; ctx.fillRect(58, 70, 140, 130);    // head
  ctx.fillStyle = '#35261a'; ctx.fillRect(50, 50, 156, 40);     // hair top
  ctx.fillRect(50, 50, 18, 90); ctx.fillRect(188, 50, 18, 90);  // hair sides
  ctx.fillStyle = '#d84a3a'; ctx.fillRect(46, 38, 164, 26);     // cap
  ctx.fillStyle = '#ffffff'; ctx.fillRect(86, 118, 28, 22); ctx.fillRect(142, 118, 28, 22);
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(94, 122, 14, 16); ctx.fillRect(150, 122, 14, 16);
  ctx.fillStyle = '#a05a4a'; ctx.fillRect(106, 168, 44, 10);
  ctx.fillStyle = '#2a5ad8'; ctx.fillRect(40, 200, 176, 56);    // jacket shoulders
  return c.toDataURL('image/png');
}

export const avatarURL = (p: Player): string => p.profilePic ?? defaultAvatarURL(p);

// ---------------- 3D effigies ----------------
const emat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, ...o });

/** Build a guild's unique effigy — a small monument shown beside the guild card. */
export function makeEffigy(houseId: string): THREE.Group {
  const g = new THREE.Group();
  const h = HOUSES.find(x => x.id === houseId)!;
  const col = parseInt(h.color.slice(1), 16);
  const accent = emat(col, { emissive: col, emissiveIntensity: 0.8 });
  const dark = emat(0x232434, { roughness: 0.7 });
  const brass = emat(0xc9a24a, { metalness: 0.85, roughness: 0.25 });

  // shared plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.22, 8), dark);
  plinth.position.y = 0.11;
  g.add(plinth);

  if (houseId === 'pyrelight') {
    // the Lantern of Saint Adair
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.62, 6, 1, true), brass);
    cage.position.y = 0.72;
    (cage.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 6), brass);
    top.position.y = 1.16;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 6), brass);
    base.position.y = 0.36;
    const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), accent);
    ember.position.y = 0.72;
    ember.name = 'fx-pulse';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), brass);
    ring.position.y = 1.38;
    const light = new THREE.PointLight(col, 6, 4);
    light.position.y = 0.75;
    g.add(cage, top, base, ember, ring, light);
  } else if (houseId === 'mistveil') {
    // the Tear of Neris
    const coral = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const branch = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 + (i % 2) * 0.2, 6), emat(0xe88a9a, { roughness: 0.7 }));
      branch.position.set(Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22);
      branch.rotation.z = Math.cos(a) * 0.5;
      branch.rotation.x = -Math.sin(a) * 0.5;
      coral.add(branch);
    }
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18),
      emat(0xcfe8f2, { emissive: 0x6ab8e8, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.1 }));
    pearl.position.y = 0.95;
    pearl.name = 'fx-float';
    const ringWater = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 24), accent);
    ringWater.rotation.x = Math.PI / 2;
    ringWater.position.y = 0.95;
    ringWater.name = 'fx-spin';
    const light = new THREE.PointLight(col, 5, 4);
    light.position.y = 1;
    g.add(coral, pearl, ringWater, light);
  } else if (houseId === 'thornward') {
    // the First Seed
    const vines = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const seg = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 20, Math.PI * 1.2), emat(0x4a7a3a, { roughness: 0.8 }));
      seg.position.y = 0.62;
      seg.rotation.y = a;
      seg.rotation.x = 0.7;
      vines.add(seg);
    }
    const acorn = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12),
      emat(0xd9b85a, { metalness: 0.7, roughness: 0.25, emissive: 0x6a521a, emissiveIntensity: 0.4 }));
    acorn.position.y = 0.78;
    acorn.scale.y = 1.25;
    acorn.name = 'fx-float';
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 12), emat(0x6a4a2a, { roughness: 0.9 }));
    cap.position.y = 1.02;
    cap.name = 'fx-float';
    for (const [bx, bz] of [[0.3, 0.1], [-0.25, -0.2], [0.05, -0.32]] as const) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), accent);
      bloom.position.set(bx, 0.32, bz);
      g.add(bloom);
    }
    const light = new THREE.PointLight(col, 4, 4);
    light.position.y = 0.9;
    g.add(vines, acorn, cap, light);
  } else if (houseId === 'stormcall') {
    // the Coil of Voltaine
    for (let i = 0; i < 5; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.04, 0.035, 8, 20), brass);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.34 + i * 0.18;
      g.add(coil);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), dark);
    rod.position.y = 0.7;
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), accent);
    bolt.position.y = 1.28;
    bolt.name = 'fx-spin';
    const light = new THREE.PointLight(col, 6, 4);
    light.position.y = 1.25;
    g.add(rod, bolt, light);
  } else {
    // the Second Moon
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), dark);
    pillarL.position.set(-0.32, 0.75, 0);
    const pillarR = pillarL.clone();
    pillarR.position.x = 0.32;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.12), dark);
    beam.position.y = 1.32;
    const moonShape = new THREE.Shape();
    moonShape.absarc(0, 0, 0.3, -Math.PI * 0.42, Math.PI * 0.92, false);
    const hole = new THREE.Path();
    hole.absarc(0.12, 0.06, 0.26, Math.PI * 0.8, -Math.PI * 0.34, true);
    moonShape.holes.push(hole);
    const moon = new THREE.Mesh(new THREE.ExtrudeGeometry(moonShape, { depth: 0.07, bevelEnabled: false }),
      emat(0x1a1626, { emissive: col, emissiveIntensity: 0.55, roughness: 0.2 }));
    moon.position.set(0, 0.8, -0.035);
    moon.name = 'fx-float';
    const light = new THREE.PointLight(col, 5, 4);
    light.position.y = 0.85;
    g.add(pillarL, pillarR, beam, moon, light);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ---------------- guild card artwork ----------------
const CARD_W = 640, CARD_H = 960;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Per-guild decorative background pattern, drawn over the base gradient. */
function cardPattern(ctx: CanvasRenderingContext2D, houseId: string, color: string): void {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = shade(color, 0.4);
  ctx.fillStyle = shade(color, 0.4);
  if (houseId === 'pyrelight') {
    // rising ember motes & flame arcs
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % CARD_W, y = (i * 211) % CARD_H;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-50, CARD_H - i * 150);
      ctx.bezierCurveTo(CARD_W * 0.3, CARD_H - i * 150 - 120, CARD_W * 0.7, CARD_H - i * 150 + 60, CARD_W + 50, CARD_H - i * 150 - 90);
      ctx.stroke();
    }
  } else if (houseId === 'mistveil') {
    ctx.lineWidth = 2.5;
    for (let y = 60; y < CARD_H; y += 64) {
      ctx.beginPath();
      for (let x = -20; x <= CARD_W + 20; x += 40) {
        ctx.quadraticCurveTo(x + 10, y - 16, x + 20, y);
        ctx.quadraticCurveTo(x + 30, y + 16, x + 40, y);
      }
      ctx.stroke();
    }
  } else if (houseId === 'thornward') {
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 140;
      ctx.beginPath();
      ctx.moveTo(x, CARD_H + 20);
      ctx.bezierCurveTo(x - 60, CARD_H * 0.7, x + 60, CARD_H * 0.4, x - 20, -20);
      ctx.stroke();
      for (let j = 1; j < 6; j++) {
        const ly = CARD_H - j * 150;
        ctx.beginPath(); ctx.ellipse(x + (j % 2 ? 26 : -26), ly, 16, 7, j % 2 ? 0.6 : -0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (houseId === 'stormcall') {
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      let x = (i * 173) % CARD_W, y = -10;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < CARD_H + 10) { x += (Math.sin(i * 3.7 + y) > 0 ? 1 : -1) * 34; y += 90; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // hazard chevrons top & bottom
    ctx.globalAlpha = 0.22;
    for (let x = -20; x < CARD_W; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x + 24, 2); ctx.lineTo(x + 48, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, CARD_H - 14); ctx.lineTo(x + 24, CARD_H - 2); ctx.lineTo(x + 48, CARD_H - 14); ctx.stroke();
    }
  } else {
    // duskwatch — starfield & thin crescents
    for (let i = 0; i < 70; i++) {
      const x = (i * 137) % CARD_W, y = (i * 89) % CARD_H;
      ctx.globalAlpha = 0.08 + (i % 5) * 0.04;
      ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.14; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(120 + i * 140, 200 + (i % 2) * 420, 40, Math.PI * 0.2, Math.PI * 1.1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

/** Render the FRONT of the player's guild card to a canvas (640×960). */
export async function drawCardFront(p: Player, h: HouseDef): Promise<HTMLCanvasElement> {
  const lore = GUILD_LORE[h.id];
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  // base gradient — unique tones per guild
  const baseTop: Record<string, string> = {
    pyrelight: '#2a0f08', mistveil: '#06182c', thornward: '#0e2008', stormcall: '#1c180a', duskwatch: '#120a22',
  };
  const grad = ctx.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  grad.addColorStop(0, shade(h.color, -0.62));
  grad.addColorStop(0.45, baseTop[h.id]);
  grad.addColorStop(1, '#05060c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  cardPattern(ctx, h.id, h.color);

  // double frame with corner brackets
  ctx.strokeStyle = shade(h.color, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = shade(h.color, 0.6);
  roundRect(ctx, 30, 30, CARD_W - 60, CARD_H - 60, 18); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = '#e9d9a8';
  for (const [cx, cy, sx, sy] of [[34, 34, 1, 1], [CARD_W - 34, 34, -1, 1], [34, CARD_H - 34, 1, -1], [CARD_W - 34, CARD_H - 34, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 44 * sy); ctx.lineTo(cx, cy); ctx.lineTo(cx + 44 * sx, cy);
    ctx.stroke();
  }

  // header: guild icon + names
  ctx.drawImage(guildIconCanvas(h.id, 256), CARD_W / 2 - 64, 52, 128, 128);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(h.name.toUpperCase(), CARD_W / 2, 232);
  ctx.fillStyle = shade(h.color, 0.45);
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillText(lore.epithet, CARD_W / 2, 268);
  ctx.fillStyle = '#9aa0b8';
  ctx.font = '17px Georgia, serif';
  ctx.fillText(`— ${lore.cardName} —`, CARD_W / 2, 298);

  // portrait frame
  const px = CARD_W / 2 - 120, py = 330, ps = 240;
  ctx.save();
  roundRect(ctx, px - 8, py - 8, ps + 16, ps + 16, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  ctx.strokeStyle = '#e9d9a8'; ctx.lineWidth = 4; ctx.stroke();
  roundRect(ctx, px, py, ps, ps, 10);
  ctx.clip();
  try {
    const img = await loadImage(avatarURL(p));
    // cover-fit
    const r = Math.max(ps / img.width, ps / img.height);
    ctx.drawImage(img, px + ps / 2 - img.width * r / 2, py + ps / 2 - img.height * r / 2, img.width * r, img.height * r);
  } catch {
    ctx.fillStyle = '#222638'; ctx.fillRect(px, py, ps, ps);
  }
  ctx.restore();

  // name plaque
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 90, 606, CARD_W - 180, 74, 12); ctx.fill();
  ctx.strokeStyle = shade(h.color, 0.4); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(p.tamerName, CARD_W / 2, 656);

  // universal rank badge & member number
  const rIdx = rankIndexFor(p);
  ctx.drawImage(rankBadgeCanvas(rIdx, 128), CARD_W / 2 - 110, 692, 42, 42);
  ctx.fillStyle = RANKS[rIdx].color;
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(RANKS[rIdx].name.toUpperCase(), CARD_W / 2 + 22, 722);
  ctx.fillStyle = '#9aa0b8';
  ctx.font = '20px "Courier New", monospace';
  ctx.fillText(`MEMBER NO. ${p.cardNo || '—'}`, CARD_W / 2, 756);

  // motto ribbon
  ctx.fillStyle = shade(h.color, -0.25);
  ctx.beginPath();
  ctx.moveTo(70, 790); ctx.lineTo(CARD_W - 70, 790); ctx.lineTo(CARD_W - 96, 824); ctx.lineTo(CARD_W - 70, 858);
  ctx.lineTo(70, 858); ctx.lineTo(96, 824);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'italic 21px Georgia, serif';
  ctx.fillText(`“${h.motto}”`, CARD_W / 2, 832);

  // footer
  ctx.fillStyle = '#787e96';
  ctx.font = '16px Georgia, serif';
  ctx.fillText(`${lore.hall} · Registered by the Tamer University of Aurel`, CARD_W / 2, 906);
  return c;
}

/** Render the BACK of the player's guild card — the service record. */
export function drawCardBack(p: Player, h: HouseDef): HTMLCanvasElement {
  const lore = GUILD_LORE[h.id];
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, '#0b0d18');
  grad.addColorStop(1, shade(h.color, -0.7));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  cardPattern(ctx, h.id, h.color);

  ctx.strokeStyle = shade(h.color, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();

  // watermark icon
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.drawImage(guildIconCanvas(h.id, 512), CARD_W / 2 - 230, CARD_H / 2 - 230, 460, 460);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('SERVICE RECORD', CARD_W / 2, 84);
  ctx.fillStyle = shade(h.color, 0.5);
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(`${p.tamerName} · ${rankFor(p)}`, CARD_W / 2, 118);
  ctx.strokeStyle = shade(h.color, 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, 140); ctx.lineTo(CARD_W - 80, 140); ctx.stroke();

  const rows: [string, string][] = [
    ['Guild quests completed', `${questsDoneCount(p)}`],
    ['Battles won', `${p.battlesWon}`],
    ['Guardians befriended', `${p.capturesMade}`],
    ['Guardians in care', `${p.party.length + p.reserve.length}`],
    ['Expeditions conquered', `${Object.values(p.dungeonClears).reduce((a, b) => a + b, 0)}`],
    ['Shard holdings', `◆ ${p.shards}`],
  ];
  ctx.font = '23px Georgia, serif';
  rows.forEach(([k, v], i) => {
    const y = 196 + i * 58;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aab0c8';
    ctx.fillText(k, 96, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px Georgia, serif';
    ctx.fillText(v, CARD_W - 96, y);
    ctx.font = '23px Georgia, serif';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(96, y + 16); ctx.lineTo(CARD_W - 96, y + 16); ctx.stroke();
  });

  // universal rank ladder — the same nine ranks across every guild
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('UNIVERSAL TAMER RANKS', CARD_W / 2, 590);
  const curIdx = rankIndexFor(p);
  RANKS.forEach((r, i) => {
    const y = 618 + i * 30;
    const here = i === curIdx;
    ctx.drawImage(rankBadgeCanvas(i, 64), CARD_W / 2 - 168, y - 19, 26, 26);
    ctx.textAlign = 'left';
    ctx.fillStyle = here ? r.color : i < curIdx ? '#aab0c8' : '#5a607a';
    ctx.font = here ? 'bold 22px Georgia, serif' : '19px Georgia, serif';
    ctx.fillText(`${i + 1}. ${r.name}${here ? '  ◀ you are here' : ''}`, CARD_W / 2 - 132, y);
    ctx.textAlign = 'center';
  });

  ctx.fillStyle = '#787e96';
  ctx.font = 'italic 17px Georgia, serif';
  ctx.fillText(`Bearer of ${lore.effigyName}`, CARD_W / 2, 896);
  ctx.font = '15px Georgia, serif';
  ctx.fillText(`Founded ${lore.founded} by ${lore.founder}`, CARD_W / 2, 922);
  return c;
}

/** Generate a unique guild member number, e.g. "PY-7C42-091". */
export function makeCardNo(houseId: string): string {
  const prefix = houseId.slice(0, 2).toUpperCase();
  const mid = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const tail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${mid}-${tail}`;
}
