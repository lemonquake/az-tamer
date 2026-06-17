// ============================================================
// AZ Tamer — procedural 3D: guardian models, textures, tweens
// ============================================================
import * as THREE from 'three';
import { SPECIES, TYPE_COLORS, CRAWLER_PARTS, PAINT_JOBS, type Archetype, type CrawlerSlot, type PaintJob } from './data';
import { BESPOKE, type BespokeBuild } from './bestiary';
import type { GuardianCustomization } from './state';

// ---------------- tween system ----------------
type TweenFn = (t: number) => void;
interface ActiveTween { fn: TweenFn; dur: number; t: number; done?: () => void; ease: (x: number) => number; }
const tweens: ActiveTween[] = [];

export const Ease = {
  linear: (x: number) => x,
  outQuad: (x: number) => 1 - (1 - x) * (1 - x),
  inQuad: (x: number) => x * x,
  outBack: (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2),
  inOut: (x: number) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
};

export function tween(dur: number, fn: TweenFn, ease = Ease.outQuad): Promise<void> {
  return new Promise(res => {
    tweens.push({ fn, dur, t: 0, ease, done: res });
  });
}

// Global speed multiplier for tween()/wait(). Drives the battle speed toggle;
// always reset to 1 outside battle so the overworld plays at normal pace.
let timeScale = 1;
export const setTimeScale = (s: number): void => { timeScale = Math.max(0.1, s); };
export const getTimeScale = (): number => timeScale;

export function updateTweens(dt: number): void {
  const scaled = dt * timeScale;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += scaled;
    const x = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(x));
    if (x >= 1) { tweens.splice(i, 1); tw.done?.(); }
  }
}

export const wait = (ms: number) => new Promise<void>(res => setTimeout(res, ms / timeScale));

// ---------------- canvas textures ----------------
export function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// deterministic pseudo-random for texture noise
export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stoneTexture(base = '#3a3f52', crack = '#262a3a', repeat = 4): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(42);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = rnd() * 0.16 - 0.08;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5);
    }
    ctx.strokeStyle = crack; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += rnd() * 40 - 20; y += rnd() * 40 - 20; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, repeat);
}

export function groundTexture(base = '#4a6a3a', fleck = '#6a8a4a', repeat = 8): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(7);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? fleck : 'rgba(0,0,0,0.12)';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 3);
    }
  }, repeat);
}

/** Equirectangular planet texture: oceans, blobby continents, ice caps. */
export function globeTexture(): THREE.Texture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry(1337);
  // ocean with depth banding
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#1d3f6e'); sea.addColorStop(0.5, '#2a5d9e'); sea.addColorStop(1, '#1d3f6e');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  // continents: clustered blobs
  for (let land = 0; land < 9; land++) {
    const cx = rnd() * W, cy = H * (0.18 + rnd() * 0.64);
    const tone = rnd();
    for (let b = 0; b < 60; b++) {
      const a = rnd() * Math.PI * 2, d = rnd() * rnd() * 90;
      const x = cx + Math.cos(a) * d * 1.6, y = cy + Math.sin(a) * d;
      const r = 8 + rnd() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const col = tone > 0.6 ? '#b08a52' : tone > 0.3 ? '#4e8a42' : '#3e7a52';
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(60,110,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc((x + W) % W, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // speckle detail
  for (let i = 0; i < 2600; i++) {
    const v = rnd() * 0.1 - 0.05;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // polar ice caps
  for (const [y0, y1, flip] of [[0, 40, false], [H - 40, H, true]] as const) {
    for (let x = 0; x < W; x += 6) {
      const depth = 18 + rnd() * 26;
      ctx.fillStyle = 'rgba(232,240,250,0.92)';
      if (!flip) ctx.fillRect(x, y0, 6, 40 - 18 + depth * 0.4);
      else ctx.fillRect(x, y1 - (22 + depth * 0.4), 6, 22 + depth * 0.4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function plankTexture(base = '#7a5a3a', repeat = 2): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(99);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.1})`;
      ctx.fillRect(0, y, s, 3);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
        ctx.fillRect(rnd() * s, y + 4 + rnd() * 24, 10 + rnd() * 50, 1.5);
      }
    }
  }, repeat);
}

/** Stratified cave rock — wavy sediment bands, mineral speckle, deep cracks. */
export function caveRockTexture(base: string, band: string, crack: string, seed = 21, repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 18 + rnd() * 22) {
      ctx.fillStyle = band;
      ctx.globalAlpha = 0.16 + rnd() * 0.2;
      const wob = rnd() * 6, amp = 3 + rnd() * 5, th = 8 + rnd() * 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + wob) * amp);
      for (let x = s; x >= 0; x -= 16) ctx.lineTo(x, y + th + Math.sin(x * 0.05 + wob) * amp);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 700; i++) {
      const v = rnd() * 0.18 - 0.09;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 4, 2 + rnd() * 4);
    }
    ctx.strokeStyle = crack; ctx.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += rnd() * 30 - 15; y += 10 + rnd() * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, repeat);
}

/** Drowned masonry — large offset bricks, dark mortar, algae blooming from the seams. */
export function drownedBrickTexture(base: string, mortar: string, algae: string, seed = 77, repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = mortar; ctx.fillRect(0, 0, s, s);
    const bh = 42;
    for (let row = 0; row * bh < s + bh; row++) {
      const off = row % 2 ? 64 : 0;
      for (let x = -128; x < s; x += 128) {
        ctx.fillStyle = base;
        ctx.fillRect(x + off + 3, row * bh + 3, 122, bh - 6);
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${(rnd() * 0.07).toFixed(3)})`;
        ctx.fillRect(x + off + 3, row * bh + 3, 122, bh - 6);
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 22;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, algae); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.45; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 400; i++) {
      const v = rnd() * 0.12 - 0.06;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 3);
    }
  }, repeat);
}

// shared panel layout so the color map and its emissive twin always agree
function drawStormPanels(ctx: CanvasRenderingContext2D, s: number, seed: number,
  mode: 'map' | 'glow', base: string, seam: string, glow: string): void {
  const rnd = mulberry(seed);
  const cuts = (len: number) => {
    const out = [0]; let v = 0;
    while (v < len - 30) { v += 44 + Math.floor(rnd() * 52); out.push(Math.min(v, len)); }
    if (out[out.length - 1] !== len) out.push(len);
    return out;
  };
  const xs = cuts(s), ys = cuts(s);
  if (mode === 'map') { ctx.fillStyle = base; ctx.fillRect(0, 0, s, s); }
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s); }
  for (let yi = 0; yi < ys.length - 1; yi++) {
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x = xs[xi], y = ys[yi], w = xs[xi + 1] - x, h = ys[yi + 1] - y;
      const tone = rnd() * 0.1 - 0.05;        // consumed in both modes for layout parity
      const node = rnd() < 0.22;
      if (mode === 'map') {
        ctx.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone})`;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.strokeStyle = seam; ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (const [rx, ry] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) {
          ctx.beginPath(); ctx.arc(rx, ry, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.strokeStyle = glow; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        ctx.globalAlpha = 1;
        if (node) {
          const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, 9);
          g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}

/** War-spire hull plating — riveted panels with dark conduit seams. */
export function stormPanelTexture(base: string, seam: string, seed = 5, repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => drawStormPanels(ctx, s, seed, 'map', base, seam, '#000'), repeat);
}

/** Emissive twin of stormPanelTexture — only the conduit seams and nodes glow. */
export function stormSeamEmissive(glow: string, seed = 5, repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => drawStormPanels(ctx, s, seed, 'glow', '#000', '#000', glow), repeat);
}

/** Brushed steel wall paneling with dark seams and rivet details. */
export function labWallTexture(repeat = 4): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(101);
    ctx.fillStyle = '#4a505e'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 200; i++) {
      const x = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rnd() * 4 - 2), s);
      ctx.stroke();
    }
    ctx.strokeStyle = '#22252c'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.fillStyle = '#22252c';
    const drawRivet = (rx: number, ry: number) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(rx - 1, ry - 1, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22252c';
    };
    for (const px of [12, s/2 - 12, s/2 + 12, s - 12]) {
      for (const py of [12, s/2 - 12, s/2 + 12, s - 12]) {
        drawRivet(px, py);
      }
    }
  }, repeat);
}

/** Metallic laboratory floor with safety-striping. */
export function labFloorTexture(repeat = 4): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(102);
    ctx.fillStyle = '#2a2f3a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
      ctx.fillRect(rnd() * s, rnd() * s, 40 + rnd() * 40, 40 + rnd() * 40);
    }
    ctx.strokeStyle = '#15171d'; ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, s, s);
    ctx.save();
    ctx.rect(0, s - 24, s, 24);
    ctx.clip();
    ctx.fillStyle = '#d9a11a';
    ctx.fillRect(0, s - 24, s, 24);
    ctx.strokeStyle = '#1c1f24';
    ctx.lineWidth = 8;
    for (let x = -20; x < s + 20; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, s - 25);
      ctx.lineTo(x + 20, s + 1);
      ctx.stroke();
    }
    ctx.restore();
  }, repeat);
}

/** High-tech computer terminal screen displaying grid and telemetry data. */
export function computerScreenTexture(): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(103);
    ctx.fillStyle = '#0a1012'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(26, 180, 114, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 20; i < s; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
    ctx.strokeStyle = '#1ab472'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < s; x += 2) {
      const y = s / 2 + Math.sin(x * 0.08) * 35 + Math.cos(x * 0.03) * 15;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(26, 180, 114, 0.7)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('SYS ACTIVE', 12, 22);
    ctx.fillText('FUSION LOCK: 98.2%', 12, 38);
    ctx.fillStyle = 'rgba(26, 180, 114, 0.4)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(12, s - 50 + i * 8, 30 + rnd() * 60, 4);
    }
  });
}

/** Polished marble floor with veins — for grand interiors. */
export function marbleTexture(base = '#cfd2dd', vein = '#9aa0b5', repeat = 6): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(2024);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    // soft cloudy shading
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(rnd() * s, rnd() * s, 4, rnd() * s, rnd() * s, 30 + rnd() * 60);
      g.addColorStop(0, `rgba(255,255,255,${rnd() * 0.10})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    // veins
    ctx.strokeStyle = vein; ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) { x += rnd() * 54 - 27; y += rnd() * 54 - 27; ctx.lineTo(x, y); }
      ctx.globalAlpha = 0.35 + rnd() * 0.3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // tile grout lines
    ctx.strokeStyle = 'rgba(40,44,60,0.55)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
  }, repeat);
}

/**
 * Polished Aether-marble — ivory stone shot through with veins of gold and
 * violet starlight. Quarried (so the masons claim) from the one cliff in
 * Olivar that Ghandra's shadow never touched. Cut for the Legends' Ascendancy.
 */
export function aetherMarbleTexture(repeat = 4): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(2026);
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f0eadb'); g.addColorStop(0.5, '#e3dccb'); g.addColorStop(1, '#f0eadb');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    // soft cloudy mottle
    for (let i = 0; i < 220; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 22;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(188,180,160,${0.05 + rnd() * 0.08})`);
      rg.addColorStop(1, 'rgba(188,180,160,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // veins — broad gold, fine gold, hairline violet aether
    const vein = (color: string, width: number, n: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        let x = rnd() * s, y = rnd() * s;
        ctx.moveTo(x, y);
        for (let j = 0; j < 7; j++) { x += rnd() * 46 - 23; y += rnd() * 46 - 23; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    };
    vein('rgba(192,154,70,0.45)', 2.6, 8);
    vein('rgba(214,178,94,0.7)', 1.2, 11);
    vein('rgba(150,110,228,0.32)', 1.0, 9);
    // aether glints
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,245,214,0.8)' : 'rgba(198,162,255,0.55)';
      ctx.fillRect(rnd() * s, rnd() * s, 1.6, 1.6);
    }
  }, repeat);
}

/**
 * Carved trophy frieze — midnight stone banded in embossed gold: laurel
 * branches cradling championship cups, one star per legend overhead.
 * Wraps the flanks of the Legends' Ascendancy.
 */
export function legendFriezeTexture(repeat = 5): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(522);
    ctx.fillStyle = '#1b2138'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 520; i++) {
      const v = rnd() * 0.1 - 0.05;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 4);
    }
    // gold cornice bands, with a darker undershadow for embossed depth
    ctx.fillStyle = '#8a6a26'; ctx.fillRect(0, 16, s, 3); ctx.fillRect(0, s - 19, s, 3);
    ctx.fillStyle = '#c79f49'; ctx.fillRect(0, 8, s, 8); ctx.fillRect(0, s - 16, s, 8);
    ctx.fillStyle = '#e8cf8a'; ctx.fillRect(0, 8, s, 2); ctx.fillRect(0, s - 16, s, 2);
    // repeating emblem: trophy cup between laurel arcs, star above
    const emblem = (cx: number, cy: number, shade: boolean) => {
      const gold = shade ? 'rgba(40,32,12,0.9)' : 'rgba(199,159,73,0.95)';
      const off = shade ? 2 : 0;
      ctx.strokeStyle = gold; ctx.fillStyle = gold; ctx.lineWidth = 3;
      // cup bowl
      ctx.beginPath(); ctx.arc(cx + off, cy + off, 13, 0, Math.PI, false); ctx.closePath(); ctx.fill();
      // handles
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(cx - 16 + off, cy + 2 + off, 7, Math.PI * 0.6, Math.PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 16 + off, cy + 2 + off, 7, Math.PI * 1.4, Math.PI * 0.4); ctx.stroke();
      // stem and base
      ctx.fillRect(cx - 2 + off, cy + 13 + off, 4, 9);
      ctx.fillRect(cx - 9 + off, cy + 22 + off, 18, 4);
      // laurel arcs flanking
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx + off, cy + 4 + off, 26, Math.PI * 0.75, Math.PI * 1.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + off, cy + 4 + off, 26, Math.PI * 1.7, Math.PI * 0.25); ctx.stroke();
      // leaves along the arcs
      for (const sgn of [-1, 1]) for (let k = 0; k < 4; k++) {
        const a = Math.PI * 1.5 + sgn * (0.5 + k * 0.28);
        const lx = cx + Math.cos(a) * 26, ly = cy + 4 + Math.sin(a) * 26;
        ctx.beginPath(); ctx.ellipse(lx + off, ly + off, 4.5, 2, a, 0, Math.PI * 2); ctx.fill();
      }
      // star overhead
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const ang = -Math.PI / 2 + (p * Math.PI) / 5;
        const r = p % 2 === 0 ? 7 : 3;
        const px = cx + Math.cos(ang) * r, py = cy - 26 + Math.sin(ang) * r;
        if (p === 0) ctx.moveTo(px + off, py + off); else ctx.lineTo(px + off, py + off);
      }
      ctx.closePath(); ctx.fill();
    };
    for (const cx of [64, 192]) { emblem(cx, s / 2 + 6, true); emblem(cx, s / 2 + 6, false); }
  }, repeat);
}

/** Glowing ember cracks on black — emissive map for obsidian set over living fire. */
export function emberCrackTexture(glow = '#ff7a2a', repeat = 2): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(909);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = glow; ctx.lineWidth = 2.2;
    ctx.shadowColor = glow; ctx.shadowBlur = 8;
    for (let i = 0; i < 11; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += rnd() * 44 - 22; y += rnd() * 44 - 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // hot motes caught in the cracks
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = rnd() > 0.5 ? glow : '#ffd28a';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, repeat);
}

/** Woven carpet with border pattern. */
export function carpetTexture(base = '#7a2e35', accent = '#d8b56a', repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(555);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.10})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    ctx.strokeStyle = accent; ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, s - 44, s - 44);
    // diamond medallion
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.30); ctx.lineTo(s * 0.70, s / 2); ctx.lineTo(s / 2, s * 0.70); ctx.lineTo(s * 0.30, s / 2);
    ctx.closePath(); ctx.stroke();
  }, repeat);
}

/** Checkered cafeteria / utility tiles. */
export function tileTexture(a = '#b8bcc8', b = '#787e92', repeat = 8): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const rnd = mulberry(31);
    ctx.fillStyle = a; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = b; ctx.fillRect(0, 0, s / 2, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  }, repeat);
}

/** Rusted, dark sci-fi tech panels with glowing circuit conduits. */
export function techCircuitTexture(base = '#12141a', panelBorder = '#2a2f3d', glowColor = '#11ffcc', repeat = 8): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(521);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);

    // Draw tech panels (grid with offsets)
    ctx.strokeStyle = panelBorder;
    ctx.lineWidth = 3;
    const numPanels = 4;
    const size = s / numPanels;
    for (let x = 0; x < numPanels; x++) {
      for (let y = 0; y < numPanels; y++) {
        const px = x * size;
        const py = y * size;
        ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);

        // Add small rivet/screw dots in the corners of each panel
        ctx.fillStyle = '#444c5e';
        ctx.fillRect(px + 4, py + 4, 3, 3);
        ctx.fillRect(px + size - 7, py + 4, 3, 3);
        ctx.fillRect(px + 4, py + size - 7, 3, 3);
        ctx.fillRect(px + size - 7, py + size - 7, 3, 3);

        // Add rust / scratch marks
        ctx.fillStyle = 'rgba(100, 70, 50, 0.15)'; // rust brown
        for (let i = 0; i < 4; i++) {
          const rx = px + rnd() * size;
          const ry = py + rnd() * size;
          ctx.fillRect(rx, ry, 2 + rnd() * 8, 2 + rnd() * 4);
        }
      }
    }

    // Draw glowing circuit line conduits running through the plate seams
    ctx.strokeStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let curX = 0;
    let curY = s / 2;
    ctx.moveTo(curX, curY);
    for (let i = 0; i < 5; i++) {
      curX += s / 5;
      curY += (rnd() - 0.5) * (s / 2);
      curY = Math.max(10, Math.min(s - 10, curY));
      ctx.lineTo(curX, curY);
      
      // Node circle at joints
      ctx.fillStyle = glowColor;
      ctx.fillRect(curX - 3, curY - 3, 6, 6);
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Add general noise
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
  }, repeat);
}

/** Heavily rusted metal texture with grid grating. */
export function rustedMetalTexture(base = '#2b2420', rust = '#663a18', repeat = 4): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const rnd = mulberry(777);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);

    // Draw grating lines
    ctx.fillStyle = '#1a1614';
    for (let y = 0; y < s; y += 8) {
      ctx.fillRect(0, y, s, 2);
    }

    // Rust streaks running vertically
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(102, 58, 24, ${0.3 + rnd() * 0.4})`;
      const w = 4 + rnd() * 12;
      const h = 20 + rnd() * 60;
      const x = rnd() * s;
      const y = rnd() * (s - h);
      ctx.fillRect(x, y, w, h);
    }

    // Metal scratch marks
    ctx.strokeStyle = '#4e423b';
    ctx.lineWidth = 1;
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      const x1 = rnd() * s; const y1 = rnd() * s;
      const x2 = x1 + (rnd() - 0.5) * 15; const y2 = y1 + (rnd() - 0.5) * 15;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }, repeat);
}


/** Wainscoted interior wall: painted upper, wood lower, trim rail. */
export function wallpaperTexture(upper = '#5a6080', lower = '#4a3826', rail = '#c8b282', repeat = 3): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(808);
    ctx.fillStyle = upper; ctx.fillRect(0, 0, s, s * 0.62);
    // subtle vertical stripe pattern on the upper wall
    for (let x = 0; x < s; x += 22) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, 0, 9, s * 0.62);
    }
    ctx.fillStyle = lower; ctx.fillRect(0, s * 0.62, s, s * 0.38);
    for (let x = 0; x < s; x += 36) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, s * 0.62, 2, s * 0.38);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * s, s * 0.62 + rnd() * s * 0.38, 6, 1.5);
    }
    ctx.fillStyle = rail; ctx.fillRect(0, s * 0.60, s, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, s * 0.625, s, 2);
  }, repeat);
}

/** Library bookshelf face — rows of colorful book spines. */
export function bookshelfTexture(repeat = 1): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(404);
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, s, s);
    const palette = ['#a8453a', '#3a6ea8', '#4a8a4a', '#b08a3a', '#7a4a9a', '#9a9aa8', '#5a8a8a', '#c46a3a'];
    for (let row = 0; row < 4; row++) {
      const y = 8 + row * 62;
      ctx.fillStyle = '#241a0e'; ctx.fillRect(0, y + 52, s, 10); // shelf board
      let x = 6;
      while (x < s - 10) {
        const w = 9 + rnd() * 13;
        const h = 38 + rnd() * 12;
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
        ctx.fillRect(x, y + 52 - h, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 52 - h + 5, w - 4, 2);
        x += w + 2;
        if (rnd() < 0.08) x += 12; // gap of a borrowed book
      }
    }
  }, repeat);
}

/** Rough tree bark — vertical grooves, knots, moss flecks. */
export function barkTexture(base = '#5a4028', groove = '#3a2814', moss = '#4a6a36', seed = 11): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    // vertical grain bands
    for (let x = 0; x < s; x += 6 + Math.floor(rnd() * 8)) {
      ctx.fillStyle = `rgba(0,0,0,${0.10 + rnd() * 0.18})`;
      ctx.fillRect(x, 0, 2 + rnd() * 3, s);
    }
    // deep grooves that wander
    ctx.strokeStyle = groove; ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) { y += 14 + rnd() * 22; x += rnd() * 14 - 7; ctx.lineTo(x, y); }
      ctx.globalAlpha = 0.4 + rnd() * 0.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // knots
    for (let i = 0; i < 4; i++) {
      const kx = rnd() * s, ky = rnd() * s, kr = 5 + rnd() * 9;
      ctx.strokeStyle = groove; ctx.lineWidth = 2;
      for (let r = kr; r > 1; r -= 3) { ctx.beginPath(); ctx.ellipse(kx, ky, r, r * 1.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    // moss creeping up from below
    for (let i = 0; i < 130; i++) {
      const my = s - rnd() * rnd() * s * 0.8;
      ctx.fillStyle = moss;
      ctx.globalAlpha = 0.12 + rnd() * 0.25;
      ctx.beginPath(); ctx.arc(rnd() * s, my, 2 + rnd() * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, 1);
}

/** Birch bark — pale with dark horizontal lenticels. */
export function birchTexture(): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(77);
    ctx.fillStyle = '#e3ded2'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(120,118,110,0.18)';
      ctx.fillRect(rnd() * s, rnd() * s, 3 + rnd() * 9, 2);
    }
    ctx.fillStyle = '#2c2a26';
    for (let i = 0; i < 26; i++) {
      const w = 8 + rnd() * 30;
      ctx.globalAlpha = 0.5 + rnd() * 0.45;
      ctx.fillRect(rnd() * s, rnd() * s, w, 3 + rnd() * 4);
    }
    ctx.globalAlpha = 1;
  }, 1);
}

/** Dappled leaf canopy — layered leaf clusters with sky holes. */
export function leafTexture(base = '#3a7a32', lit = '#5aa844', dark = '#26541e', seed = 5): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = dark; ctx.fillRect(0, 0, s, s);
    // leaf clumps: lit on top-left, shaded bottom-right
    for (let i = 0; i < 420; i++) {
      const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 10;
      ctx.fillStyle = rnd() < 0.45 ? base : (rnd() < 0.6 ? lit : dark);
      ctx.globalAlpha = 0.7 + rnd() * 0.3;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // bright catch-light specks
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = lit;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 3);
    }
    ctx.globalAlpha = 1;
  }, 2);
}

// ---------------- trees ----------------
export type TreeKind = 'oak' | 'pine' | 'birch' | 'blossom';

/** Jitter a sphere's vertices for an organic, hand-modelled canopy. */
function organicSphere(r: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 9, 7);
  const rnd = mulberry(seed);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (rnd() - 0.5) * 0.34;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (1 + (rnd() - 0.5) * 0.22), pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A proper tree: textured bark trunk with root flare and branches,
 * organic textured canopy. Canopy meshes are named 'foliage' so
 * scenes can sway them in the wind.
 */
export function makeTree(kind: TreeKind = 'oak', seed = Math.floor(Math.random() * 9999)): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry(seed);
  const barkMat = new THREE.MeshStandardMaterial({
    map: kind === 'birch' ? birchTexture() : barkTexture(kind === 'pine' ? '#4a3322' : '#5a4028', '#33220f', '#4a6a36', seed),
    roughness: 0.95,
  });

  if (kind === 'pine') {
    const h = 2.2 + rnd() * 0.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, h, 7), barkMat);
    trunk.position.y = h / 2;
    g.add(trunk);
    const needleMat = new THREE.MeshStandardMaterial({ map: leafTexture('#2c5a30', '#447a40', '#1c3a1e', seed), roughness: 0.95 });
    let rad = 1.15 + rnd() * 0.3, y = h * 0.45;
    for (let i = 0; i < 4; i++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(rad, 1.3, 8), needleMat);
      tier.position.y = y;
      tier.rotation.y = rnd() * Math.PI;
      tier.name = 'foliage';
      tier.castShadow = true;
      g.add(tier);
      rad *= 0.74; y += 0.78;
    }
  } else {
    const h = kind === 'birch' ? 2.4 + rnd() * 0.7 : 1.8 + rnd() * 0.7;
    const rTop = kind === 'birch' ? 0.10 : 0.16;
    const rBot = kind === 'birch' ? 0.16 : 0.30;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8), barkMat);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rnd() - 0.5) * 0.1;
    g.add(trunk);
    // root flare
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd();
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), barkMat);
      root.position.set(Math.cos(a) * rBot * 0.95, 0.12, Math.sin(a) * rBot * 0.95);
      root.rotation.set(Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
      g.add(root);
    }
    // branches reaching into the canopy
    const branches: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.9, 5), barkMat);
      const bx = Math.cos(a) * 0.55, bz = Math.sin(a) * 0.55;
      br.position.set(bx * 0.6, h - 0.25 + rnd() * 0.3, bz * 0.6);
      br.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
      g.add(br);
      branches.push(new THREE.Vector3(bx, h + 0.35, bz));
    }
    // canopy: one crown blob + one per branch
    const pal = kind === 'blossom'
      ? { b: '#d977a8', l: '#f2a8c8', d: '#a84a78' }
      : kind === 'birch'
        ? { b: '#6aa84e', l: '#8ac868', d: '#477a34' }
        : { b: '#3a7a32', l: '#5aa844', d: '#26541e' };
    const canopyMat = new THREE.MeshStandardMaterial({ map: leafTexture(pal.b, pal.l, pal.d, seed + 3), roughness: 0.95 });
    const crown = new THREE.Mesh(organicSphere(0.95 + rnd() * 0.45, seed + 1), canopyMat);
    crown.position.set(0, h + 0.65, 0);
    crown.name = 'foliage';
    crown.castShadow = true;
    g.add(crown);
    for (const b of branches) {
      const blob = new THREE.Mesh(organicSphere(0.5 + rnd() * 0.3, seed + 7 + branches.indexOf(b)), canopyMat);
      blob.position.copy(b);
      blob.name = 'foliage';
      blob.castShadow = true;
      g.add(blob);
    }
  }
  g.rotation.y = rnd() * Math.PI * 2;
  g.traverse(o => { o.castShadow = true; });
  // wind sway phase, consumed by the scene's update loop
  g.userData.swayPhase = rnd() * Math.PI * 2;
  return g;
}

// ---------------- street lamps ----------------
/**
 * A wrought-iron street lamp, built facing +Z (arm reaches +Z over the road).
 * Glass is named 'lampOrb' and the light 'streetlamp' — the town's day/night
 * cycle wakes them after sundown. style 'plaza' is a grander two-headed post.
 */
export function makeStreetLamp(style: 'road' | 'plaza' = 'road'): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6, metalness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a703a, roughness: 0.4, metalness: 0.7 });
  const glassMat = () => new THREE.MeshStandardMaterial({
    color: 0xffd9a0, emissive: 0xffb45a, emissiveIntensity: 0.15, transparent: true, opacity: 0.92, roughness: 0.2,
  });

  // stepped base
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.16, 8), iron);
  base1.position.y = 0.08;
  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.22, 8), iron);
  base2.position.y = 0.26;
  g.add(base1, base2);

  const height = style === 'plaza' ? 3.4 : 2.9;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, height, 8), iron);
  post.position.y = height / 2 + 0.3;
  g.add(post);
  // collar ring details
  for (const cy of [0.9, height * 0.62]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 12), brass);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = cy;
    g.add(collar);
  }

  const lampHead = (hx: number, hy: number, hz: number) => {
    const head = new THREE.Group();
    // cage
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.16, 6), iron);
    cap.position.y = 0.18;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), brass);
    finial.position.y = 0.3;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.22, 6), glassMat());
    glass.name = 'lampOrb';
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.05, 6), iron);
    skirt.position.y = -0.13;
    const light = new THREE.PointLight(0xffb45a, 0, 13);
    light.name = 'streetlamp';
    light.position.y = -0.05;
    head.add(cap, finial, glass, skirt, light);
    head.position.set(hx, hy, hz);
    g.add(head);
  };

  if (style === 'plaza') {
    // two curved arms with hanging lanterns
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 6, 10, Math.PI / 2), iron);
      arm.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
      arm.position.set(0, height + 0.05, side * 0.0);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(arm);
      lampHead(0, height + 0.28, side * 0.46);
    }
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), brass);
    crest.position.y = height + 0.62;
    g.add(crest);
  } else {
    // single gooseneck arm over the road
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 6, 10, Math.PI / 2), iron);
    arm.position.set(0, height + 0.3 - 0.34, 0.0);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.y = Math.PI / 2;
    g.add(arm);
    const armTip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.3, 6), iron);
    armTip.rotation.x = Math.PI / 2;
    armTip.position.set(0, height + 0.3, 0.48);
    g.add(armTip);
    lampHead(0, height + 0.1, 0.62);
    // little brace
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), iron);
    brace.rotation.x = Math.PI / 4;
    brace.position.set(0, height - 0.02, 0.18);
    g.add(brace);
  }
  // meshes cast shadows; the lamp lights themselves must NOT (a town of
  // shadow-casting point lights would exhaust the GPU's texture units)
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

// ---------------- guardian model parts ----------------
const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08, ...opts });

interface GuardianRig {
  group: THREE.Group;          // root (position this)
  body: THREE.Group;           // animatable core
  parts: { head?: THREE.Object3D; tail?: THREE.Object3D; wings?: THREE.Object3D[]; };
  baseY: number;
  phase: number;               // idle anim phase offset
  /** Bespoke species drive their own idle loop (see bestiary.ts). */
  animate?: (t: number, dt: number) => void;
}

const rigs = new Set<GuardianRig>();

export function disposeRig(r: GuardianRig): void {
  rigs.delete(r);
  r.group.removeFromParent();
}

function eye(color = 0x101018): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(color, { roughness: 0.2 }));
}

export function buildCustomPart(partId: string, color: number): THREE.Object3D {
  const m = mat(color);
  const g = new THREE.Group();

  if (partId === 'scorpion') {
    let prev: THREE.Object3D = g;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), m);
      seg.position.set(0, 0.12, -0.08);
      seg.rotation.x = -0.3;
      prev.add(seg);
      prev = seg;
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), mat(0xff3333, { emissive: 0xff0000, emissiveIntensity: 0.8 }));
    sting.position.set(0, 0.2, 0);
    sting.rotation.x = -Math.PI / 2;
    prev.add(sting);
  } else if (partId === 'leaf') {
    const fan = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.04), m);
    fan.position.set(0, 0.3, 0);
    g.add(fan);
    const veinMat = mat(0xffffff, { roughness: 0.9 });
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.05), veinMat);
    vein.position.set(0, 0.3, 0);
    g.add(vein);
  } else if (partId === 'scythe') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), m);
    staff.position.set(0, 0.35, 0);
    g.add(staff);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.02), mat(0xdddddd, { metalness: 0.9, roughness: 0.2 }));
    blade.position.set(0.2, 0.7, 0);
    blade.rotation.z = -0.4;
    g.add(blade);
  } else if (partId === 'feathered') {
    const wing = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.15), m);
      f.position.set(0.2, -i * 0.1, 0);
      f.rotation.z = 0.2 - i * 0.1;
      wing.add(f);
    }
    g.add(wing);
  } else if (partId === 'dragon') {
    const wing = new THREE.Group();
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 6), m);
    bone.rotation.z = Math.PI / 3;
    bone.position.set(0.25, 0.15, 0);
    wing.add(bone);
    const membrane = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.01), mat(color, { roughness: 0.9, transparent: true, opacity: 0.8 }));
    membrane.position.set(0.25, 0.0, 0.02);
    wing.add(membrane);
    g.add(wing);
  } else if (partId === 'cosmic') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 16), mat(color, { emissive: color, emissiveIntensity: 1.5 }));
    ring.rotation.y = Math.PI / 4;
    g.add(ring);
  } else if (partId === 'spark') {
    const bolt = new THREE.Group();
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), mat(color, { emissive: color, emissiveIntensity: 1.8 }));
    s1.position.set(0.2, 0.1, 0);
    s1.rotation.z = 0.4;
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), mat(color, { emissive: color, emissiveIntensity: 1.8 }));
    s2.position.set(0.3, -0.1, 0);
    s2.rotation.z = -0.8;
    bolt.add(s1, s2);
    g.add(bolt);
  }

  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

function buildArchetype(arch: Archetype, p: { primary: number; secondary: number; accent: number }, glow: number, customColors?: { primary?: number; secondary?: number; accent?: number }): THREE.Group {
  const g = new THREE.Group();
  const prim = mat(customColors?.primary ?? p.primary);
  const sec = mat(customColors?.secondary ?? p.secondary);
  const acc = mat(customColors?.accent ?? p.accent, { emissive: glow, emissiveIntensity: 0.55, roughness: 0.3 });

  if (arch === 'beast') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), prim);
    body.scale.set(1.25, 0.95, 0.9); body.position.y = 0.55; g.add(body);
    const head = new THREE.Group(); head.position.set(0.45, 0.85, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), sec); head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), prim);
    snout.rotation.z = -Math.PI / 2; snout.position.set(0.3, -0.05, 0); head.add(snout);
    const e1 = eye(), e2 = eye(); e1.position.set(0.2, 0.1, 0.16); e2.position.set(0.2, 0.1, -0.16); head.add(e1, e2);
    const ear1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), acc);
    const ear2 = ear1.clone(); ear1.position.set(-0.05, 0.3, 0.14); ear2.position.set(-0.05, 0.3, -0.14); head.add(ear1, ear2);
    head.name = 'head'; g.add(head);
    for (const [x, z] of [[0.28, 0.22], [0.28, -0.22], [-0.28, 0.22], [-0.28, -0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), sec);
      leg.position.set(x, 0.2, z); g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), acc);
    tail.position.set(-0.6, 0.7, 0); tail.rotation.z = Math.PI / 3.4; tail.name = 'tail'; g.add(tail);
  } else if (arch === 'serpent') {
    let y = 0.25, x = 0, r = 0.34;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), i % 2 ? sec : prim);
      seg.position.set(x, y, 0); g.add(seg);
      y += r * 1.15; x -= 0.1; r *= 0.88;
    }
    const head = new THREE.Group(); head.position.set(x + 0.12, y + 0.05, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), prim);
    skull.scale.set(1.3, 0.9, 1); head.add(skull);
    const e1 = eye(0xfff0a0), e2 = eye(0xfff0a0);
    e1.position.set(0.18, 0.06, 0.14); e2.position.set(0.18, 0.06, -0.14); head.add(e1, e2);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), acc);
    crest.position.set(-0.1, 0.25, 0); crest.rotation.z = Math.PI / 7; head.add(crest);
    head.name = 'head'; g.add(head);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), acc);
      fin.position.set(-0.35, 0.4 + i * 0.35, 0); fin.rotation.z = Math.PI / 2.4; g.add(fin);
    }
  } else if (arch === 'avian') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), prim);
    body.scale.set(1, 1.15, 0.85); body.position.y = 0.75; g.add(body);
    const head = new THREE.Group(); head.position.set(0.18, 1.25, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), sec); head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), acc);
    beak.rotation.z = -Math.PI / 2; beak.position.set(0.26, -0.02, 0); head.add(beak);
    const e1 = eye(), e2 = eye(); e1.position.set(0.14, 0.08, 0.14); e2.position.set(0.14, 0.08, -0.14); head.add(e1, e2);
    head.name = 'head'; g.add(head);
    const mkWing = (side: 1 | -1) => {
      const w = new THREE.Group();
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.26), sec);
      feather.position.set(0, 0, side * 0.3);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), acc);
      tip.rotation.x = side * Math.PI / 2; tip.position.set(0, 0, side * 0.6);
      w.add(feather, tip);
      w.position.set(-0.05, 0.85, side * 0.3); w.name = `wing${side}`;
      return w;
    };
    g.add(mkWing(1), mkWing(-1));
    for (const z of [0.12, -0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 6), acc);
      leg.position.set(0, 0.25, z); g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), prim);
    tail.position.set(-0.45, 0.7, 0); tail.rotation.z = Math.PI / 2.6; tail.name = 'tail'; g.add(tail);
  } else if (arch === 'brute') {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), prim);
    torso.scale.set(1, 1.2, 0.85); torso.position.y = 0.85; g.add(torso);
    const head = new THREE.Group(); head.position.set(0.1, 1.5, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), sec); head.add(skull);
    const e1 = eye(0xffd0a0), e2 = eye(0xffd0a0);
    e1.position.set(0.18, 0.04, 0.12); e2.position.set(0.18, 0.04, -0.12); head.add(e1, e2);
    const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), acc);
    const horn2 = horn1.clone();
    horn1.position.set(-0.02, 0.26, 0.12); horn2.position.set(-0.02, 0.26, -0.12); head.add(horn1, horn2);
    head.name = 'head'; g.add(head);
    for (const side of [1, -1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), acc);
      shoulder.position.set(0, 1.25, side * 0.5); g.add(shoulder);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.6, 8), sec);
      arm.position.set(0.05, 0.9, side * 0.58); arm.rotation.x = side * 0.18; g.add(arm);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), prim);
      fist.position.set(0.08, 0.55, side * 0.62); g.add(fist);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), sec);
      leg.position.set(0, 0.25, side * 0.22); g.add(leg);
    }
  } else if (arch === 'sprite') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), prim);
    body.position.y = 0.55; body.name = 'head'; g.add(body);
    const e1 = eye(0xffffff), e2 = eye(0xffffff);
    e1.scale.setScalar(1.4); e2.scale.setScalar(1.4);
    e1.position.set(0.26, 0.62, 0.13); e2.position.set(0.26, 0.62, -0.13); g.add(e1, e2);
    const p1 = eye(), p2 = eye();
    p1.scale.setScalar(0.7); p2.scale.setScalar(0.7);
    p1.position.set(0.32, 0.62, 0.13); p2.position.set(0.32, 0.62, -0.13); g.add(p1, p2);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), acc);
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.55; halo.name = 'tail'; g.add(halo);
    for (let i = 0; i < 3; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), acc);
      const a = (i / 3) * Math.PI * 2;
      orb.position.set(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42); g.add(orb);
    }
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), sec);
    tuft.position.set(0, 0.92, 0); g.add(tuft);
  } else { // shell
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), sec);
    dome.position.y = 0.35; g.add(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.12, 16), prim);
    rim.position.y = 0.32; g.add(rim);
    const head = new THREE.Group(); head.position.set(0.42, 0.42, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), prim); head.add(skull);
    const e1 = eye(0xfff0a0), e2 = eye(0xfff0a0);
    e1.position.set(0.12, 0.05, 0.09); e2.position.set(0.12, 0.05, -0.09); head.add(e1, e2);
    head.name = 'head'; g.add(head);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), acc);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.3, 0.62, Math.sin(a) * 0.3);
      spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(spike);
    }
    for (const [x, z] of [[0.25, 0.3], [0.25, -0.3], [-0.25, 0.3], [-0.25, -0.3]]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), prim);
      foot.position.set(x, 0.1, z); g.add(foot);
    }
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

export function makeGuardian(speciesId: string, custom?: GuardianCustomization): GuardianRig {
  const def = SPECIES[speciesId];
  const glow = TYPE_COLORS[def.type];
  // hand-sculpted species come from the bestiary; the rest use archetypes
  const bespoke: BespokeBuild | undefined = BESPOKE[speciesId]?.();
  const body = bespoke ? bespoke.body : buildArchetype(def.archetype, def.palette, glow, custom?.colors);
  body.scale.setScalar(def.scale);

  // If colors are customized on a bespoke model, manually traverse and swap material colors
  const colors = custom?.colors;
  if (bespoke && colors) {
    body.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const cVal = child.material.color.getHex();
        if (cVal === def.palette.primary && colors.primary !== undefined) {
          child.material = child.material.clone();
          child.material.color.setHex(colors.primary);
        } else if (cVal === def.palette.secondary && colors.secondary !== undefined) {
          child.material = child.material.clone();
          child.material.color.setHex(colors.secondary);
        } else if (cVal === def.palette.accent && colors.accent !== undefined) {
          child.material = child.material.clone();
          child.material.color.setHex(colors.accent);
        }
      }
    });
  }

  // Handle replaced parts
  if (custom?.replacedParts) {
    if (custom.replacedParts.tail) {
      const oldTail = body.getObjectByName('tail');
      if (oldTail) {
        oldTail.visible = false;
      }
      const newTail = buildCustomPart(custom.replacedParts.tail, custom.colors?.accent ?? def.palette.accent);
      newTail.name = 'custom_tail';
      newTail.position.set(-0.45, 0.45, 0);
      body.add(newTail);
    }
    if (custom.replacedParts.wings) {
      const oldWing1 = body.getObjectByName('wing1');
      const oldWing2 = body.getObjectByName('wing-1');
      if (oldWing1) oldWing1.visible = false;
      if (oldWing2) oldWing2.visible = false;

      const newWing1 = buildCustomPart(custom.replacedParts.wings, custom.colors?.secondary ?? def.palette.secondary);
      newWing1.name = 'custom_wing1';
      newWing1.position.set(-0.05, 0.75, 0.3);
      
      const newWing2 = buildCustomPart(custom.replacedParts.wings, custom.colors?.secondary ?? def.palette.secondary);
      newWing2.name = 'custom_wing-1';
      newWing2.position.set(-0.05, 0.75, -0.3);
      newWing2.scale.z = -1;

      body.add(newWing1, newWing2);
    }
  }

  // Handle parts scale
  if (custom?.partsScale) {
    const headObj = body.getObjectByName('head');
    const tailObj = body.getObjectByName('tail') ?? body.getObjectByName('custom_tail');
    const wing1Obj = body.getObjectByName('wing1') ?? body.getObjectByName('custom_wing1');
    const wing2Obj = body.getObjectByName('wing-1') ?? body.getObjectByName('custom_wing-1');

    if (custom.partsScale.head && headObj) headObj.scale.setScalar(custom.partsScale.head);
    if (custom.partsScale.tail && tailObj) tailObj.scale.setScalar(custom.partsScale.tail);
    if (custom.partsScale.wings) {
      if (wing1Obj) wing1Obj.scale.setScalar(custom.partsScale.wings);
      if (wing2Obj) wing2Obj.scale.setScalar(custom.partsScale.wings);
    }
  }

  // Aether-stage beings carry a radiant double-halo and orbit motes
  if (def.stage === 'Aether') {
    const auraMat = new THREE.MeshStandardMaterial({
      color: def.palette.accent, emissive: glow, emissiveIntensity: 2.2, roughness: 0.05,
      transparent: true, opacity: 0.9,
    });
    for (const [r, y, tilt] of [[0.55, 1.5, Math.PI / 2], [0.42, 1.62, Math.PI / 2.6]] as const) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 28), auraMat);
      halo.rotation.x = tilt;
      halo.position.y = y;
      body.add(halo);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), auraMat);
      mote.position.set(Math.cos(a) * 0.85, 0.7 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.85);
      body.add(mote);
    }
    const aLight = new THREE.PointLight(glow, 8, 6);
    aLight.position.y = 1.2;
    body.add(aLight);
  }

  // Custom Legendary Enhancements! (bespoke models carry their own regalia)
  if (!bespoke && ['solarex', 'leviathorn', 'yggdranox', 'raidenjin', 'chthonix', 'zephyrax'].includes(speciesId)) {
    const accMat = new THREE.MeshStandardMaterial({
      color: def.palette.accent,
      emissive: glow,
      emissiveIntensity: 1.8,
      roughness: 0.1
    });

    if (speciesId === 'solarex') {
      // Glowing halo above head
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), accMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0.45, 1.4, 0); // above head
      body.add(halo);
    } else if (speciesId === 'leviathorn') {
      // Extra back spikes
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), accMat);
        spike.position.set(-0.4 - i * 0.3, 0.8 + i * 0.2, 0.2 * (i % 2 ? 1 : -1));
        spike.rotation.z = Math.PI / 4;
        body.add(spike);
      }
    } else if (speciesId === 'yggdranox') {
      // Floating leaf orbs around shoulders
      for (const side of [1, -1]) {
        const orb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), accMat);
        orb.position.set(0, 1.6, side * 0.75);
        body.add(orb);
      }
    } else if (speciesId === 'raidenjin') {
      // Double wing layers
      const w1 = body.getObjectByName('wing1');
      const w2 = body.getObjectByName('wing-1');
      if (w1) {
        const w1Extra = w1.clone();
        w1Extra.scale.setScalar(0.7);
        w1Extra.position.y -= 0.3;
        w1.add(w1Extra);
      }
      if (w2) {
        const w2Extra = w2.clone();
        w2Extra.scale.setScalar(0.7);
        w2Extra.position.y -= 0.3;
        w2.add(w2Extra);
      }
    } else if (speciesId === 'chthonix') {
      // Glowing dark shroud orbs
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 18), accMat);
      halo.position.set(0, 0.65, 0);
      body.add(halo);
    } else if (speciesId === 'zephyrax') {
      // Feathered tail fan
      const tail = body.getObjectByName('tail');
      if (tail) {
        const fan = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), accMat);
        fan.position.set(-0.2, 0.3, 0);
        tail.add(fan);
      }
    }
  }

  const group = new THREE.Group();
  // archetypes are modeled facing +X; normalize so rotation.y = atan2(dx, dz) faces +Z
  const orient = new THREE.Group();
  orient.rotation.y = -Math.PI / 2;
  orient.add(body);
  group.add(orient);

  // type-colored ground ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5 * def.scale, 0.62 * def.scale, 28),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  const headObj = body.getObjectByName('head') ?? undefined;
  const tailObj = body.getObjectByName('custom_tail') ?? body.getObjectByName('tail') ?? undefined;
  const wing1Obj = body.getObjectByName('custom_wing1') ?? body.getObjectByName('wing1');
  const wing2Obj = body.getObjectByName('custom_wing-1') ?? body.getObjectByName('wing-1');
  const wingsList = [wing1Obj, wing2Obj].filter(Boolean) as THREE.Object3D[];

  const rig: GuardianRig = {
    group, body,
    parts: {
      head: headObj,
      tail: tailObj,
      wings: wingsList,
    },
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
    animate: bespoke?.animate,
  };
  rigs.add(rig);
  return rig;
}

/**
 * A one-of-a-kind creature that exists nowhere in the SPECIES table —
 * used for the Legendary Tamers' personal Guardians. Aether beings get
 * the radiant double-halo treatment.
 */
export function makeCustomCreature(
  arch: Archetype,
  palette: { primary: number; secondary: number; accent: number },
  glow: number,
  scale = 1,
  aether = true,
  bespokeId?: string,
): GuardianRig {
  // hand-sculpted one-offs (e.g. Aljay's three) come from the bestiary
  const bespoke: BespokeBuild | undefined = bespokeId ? BESPOKE[bespokeId]?.() : undefined;
  const body = bespoke ? bespoke.body : buildArchetype(arch, palette, glow);
  body.scale.setScalar(scale);
  if (aether && !bespoke) {
    const auraMat = new THREE.MeshStandardMaterial({
      color: palette.accent, emissive: glow, emissiveIntensity: 2.2, roughness: 0.05,
      transparent: true, opacity: 0.9,
    });
    for (const [r, y, tilt] of [[0.55, 1.5, Math.PI / 2], [0.42, 1.62, Math.PI / 2.6]] as const) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 28), auraMat);
      halo.rotation.x = tilt;
      halo.position.y = y;
      body.add(halo);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), auraMat);
      mote.position.set(Math.cos(a) * 0.85, 0.7 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.85);
      body.add(mote);
    }
    const aLight = new THREE.PointLight(glow, 7, 6);
    aLight.position.y = 1.2;
    body.add(aLight);
  }
  const group = new THREE.Group();
  const orient = new THREE.Group();
  orient.rotation.y = -Math.PI / 2;
  orient.add(body);
  group.add(orient);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5 * scale, 0.62 * scale, 28),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  const rig: GuardianRig = {
    group, body,
    parts: bespoke?.parts ?? {
      head: body.getObjectByName('head') ?? undefined,
      tail: body.getObjectByName('tail') ?? undefined,
      wings: [body.getObjectByName('wing1'), body.getObjectByName('wing-1')].filter(Boolean) as THREE.Object3D[],
    },
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
    animate: bespoke?.animate,
  };
  rigs.add(rig);
  return rig;
}

let clock = 0;
/** Idle animations for all live rigs: breathing bob, tail sway, wing flaps. */
export function updateRigs(dt: number): void {
  clock += dt;
  for (const r of rigs) {
    if (r.animate) {
      r.animate(clock + r.phase, dt);
      // If there are custom/replaced wings or tails on a bespoke model, animate them
      const t = clock * 2.2 + r.phase;
      if (r.parts.tail && r.parts.tail.name === 'custom_tail') {
        r.parts.tail.rotation.x = Math.sin(t * 1.4) * 0.25;
      }
      r.parts.wings?.forEach((w, i) => {
        if (w.name.startsWith('custom_')) {
          w.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.5;
        }
      });
      continue;
    }
    const t = clock * 2.2 + r.phase;
    r.body.position.y = r.baseY + Math.sin(t) * 0.045;
    if (r.parts.tail) r.parts.tail.rotation.x = Math.sin(t * 1.4) * 0.25;
    if (r.parts.head) r.parts.head.rotation.y = Math.sin(t * 0.6) * 0.12;
    r.parts.wings?.forEach((w, i) => { w.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.5; });
  }
  updateCrawlerRigs(dt);
}

export type { GuardianRig };

// ============================================================
// QUEST GUIDANCE BEACON — a flashing pillar of light with a
// bobbing down-arrow, planted on whatever the story wants the
// player to walk to next (the shuttle, the Gate, the Houses…).
// ============================================================
export interface BeaconRig { group: THREE.Group; update(dt: number): void; dispose(): void; }

export function makeGuideBeacon(color: number): BeaconRig {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.2, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 9, 14, 1, true), beamMat);
  beam.position.y = 4.5;
  const arrowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 4), arrowMat);
  arrow.rotation.x = Math.PI; // point at the ground
  arrow.position.y = 3.1;
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 36), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(beam, arrow, ring);

  let t = Math.random() * 7;
  return {
    group,
    update(dt: number) {
      t += dt;
      arrow.position.y = 3.1 + Math.sin(t * 2.6) * 0.4;
      arrow.rotation.y += dt * 1.8;
      const pulse = 0.5 + Math.sin(t * 2.6) * 0.5;
      beamMat.opacity = 0.12 + pulse * 0.16;
      ringMat.opacity = 0.28 + pulse * 0.4;
      ring.scale.setScalar(1 + pulse * 0.5);
    },
    dispose() {
      group.removeFromParent();
      [beam, arrow, ring].forEach(m => m.geometry.dispose());
      [beamMat, arrowMat, ringMat].forEach(m => m.dispose());
    },
  };
}

// ============================================================
// THE CRAWLER — a modular spider-walker. Every slot (hull,
// engine, cargo, cannon, scanner, legs) is a swappable 3D part,
// and every part accepts a paint job. Crawlers register a rig
// and animate themselves: tripod-gait crawling, turning shuffle,
// idle breathing, spinning scanners, pulsing engine cores.
// ============================================================

export interface CrawlerLook {
  parts?: Partial<Record<CrawlerSlot, string>>;
  paint?: Partial<Record<CrawlerSlot, string>>;
}

interface CrawlerLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  baseYaw: number;
  kneeBase: number;
  phase: number;
  side: 1 | -1;
}

interface CrawlerRig {
  group: THREE.Group;
  body: THREE.Group;
  legs: CrawlerLeg[];
  spinners: THREE.Object3D[];
  glowMats: THREE.MeshStandardMaterial[];
  lastPos: THREE.Vector3;
  lastYaw: number;
  t: number;
  move: number;
  bodyBaseY: number;
}

const crawlerRigs = new Set<CrawlerRig>();

export function disposeCrawler(group: THREE.Group): void {
  for (const r of crawlerRigs) if (r.group === group) crawlerRigs.delete(r);
  group.removeFromParent();
}

/** Material for a paintable surface: paint job overrides the part's stock finish. */
function paintedMat(paint: PaintJob | undefined, defColor: number, defMetal = 0.45, defRough = 0.5): THREE.MeshStandardMaterial {
  if (paint) {
    return new THREE.MeshStandardMaterial({
      color: paint.color, metalness: paint.metalness, roughness: paint.roughness,
      emissive: paint.emissive ?? 0x000000, emissiveIntensity: paint.emissiveIntensity ?? 0,
    });
  }
  return new THREE.MeshStandardMaterial({ color: defColor, metalness: defMetal, roughness: defRough });
}

const DARK_TRIM = () => new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.6, roughness: 0.45 });

export function makeCrawler(look: CrawlerLook = {}): THREE.Group {
  const partStyle = (slot: CrawlerSlot, fallback: string): string => {
    const id = look.parts?.[slot];
    return (id && CRAWLER_PARTS[id]?.style) || fallback;
  };
  const paintFor = (slot: CrawlerSlot): PaintJob | undefined => {
    const pid = look.paint?.[slot];
    return pid ? PAINT_JOBS[pid] : undefined;
  };

  const root = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.y = -Math.PI / 2; // model is built facing +X; normalize front to +Z
  root.add(g);
  const body = new THREE.Group(); // everything but the legs — bobs while walking
  body.name = 'crawlerBody';
  g.add(body);

  const spinners: THREE.Object3D[] = [];
  const glowMats: THREE.MeshStandardMaterial[] = [];

  // ---------------- HULL (cephalothorax + cab) ----------------
  {
    const style = partStyle('hull', 'scrap');
    const paint = paintFor('hull');
    let hullMat: THREE.MeshStandardMaterial;
    if (style === 'bronzeweave') {
      hullMat = paintedMat(paint, 0xc4824a, 0.6, 0.35);
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 11), hullMat);
      a.scale.set(1.25, 0.72, 0.95); a.position.set(0.1, 0.62, 0);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 11), hullMat);
      b.scale.set(1.1, 0.7, 0.9); b.position.set(-0.32, 0.6, 0);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 18), DARK_TRIM());
      band.rotation.y = Math.PI / 2; band.position.set(-0.12, 0.62, 0);
      body.add(a, b, band);
    } else if (style === 'aegis') {
      hullMat = paintedMat(paint, 0x55607a, 0.7, 0.3);
      hullMat.flatShading = true;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), hullMat);
      core.scale.set(1.3, 0.68, 0.95); core.position.set(0, 0.64, 0);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.06), hullMat);
      fin.position.set(-0.1, 1.0, 0); fin.rotation.z = 0.18;
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), hullMat);
      prow.rotation.z = -Math.PI / 2; prow.rotation.x = Math.PI / 4; prow.position.set(0.72, 0.6, 0);
      body.add(core, fin, prow);
    } else if (style === 'royale') {
      hullMat = paintedMat(paint, 0xe8e2d2, 0.35, 0.2);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 13), hullMat);
      core.scale.set(1.32, 0.72, 0.98); core.position.set(0, 0.63, 0);
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 26), gold);
      trim.rotation.x = Math.PI / 2; trim.scale.set(1.32, 0.98, 1); trim.position.set(0, 0.63, 0);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), gold);
      crest.position.set(0.32, 1.06, 0);
      body.add(core, trim, crest);
    } else { // scrap
      hullMat = paintedMat(paint, 0x8a5a3a, 0.5, 0.65);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 9), hullMat);
      core.scale.set(1.3, 0.7, 0.95); core.position.set(0, 0.62, 0);
      body.add(core);
      // welded patch plates + rivets
      const plateMat = paintedMat(paint, 0x6e482e, 0.55, 0.6);
      for (const [px, py, pz, ry] of [[0.3, 0.78, 0.3, 0.5], [-0.25, 0.8, -0.28, -0.6], [0.05, 0.55, 0.44, 0.2]] as const) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), plateMat);
        plate.position.set(px, py, pz);
        plate.rotation.set(0.5 * Math.sign(pz), ry, 0);
        body.add(plate);
      }
      const rivetMat = DARK_TRIM();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), rivetMat);
        rivet.position.set(Math.cos(a) * 0.58, 0.62 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.42);
        body.add(rivet);
      }
    }
    // cab + glass visor + headlamps (shared by every hull)
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), paintedMat(paint, 0x4a4a55, 0.5, 0.45));
    cab.position.set(0.28, 0.92, 0);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9),
      mat(0x6ec4f2, { emissive: 0x3a9df2, emissiveIntensity: 0.8, roughness: 0.12, metalness: 0.2 }));
    visor.scale.set(0.72, 0.55, 1); visor.position.set(0.47, 0.96, 0);
    body.add(cab, visor);
    for (const side of [0.22, -0.22]) {
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd980, emissiveIntensity: 0.9 });
      glowMats.push(lampMat);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lampMat);
      lamp.position.set(0.66, 0.62, side);
      body.add(lamp);
    }
  }

  // ---------------- ENGINE (abdomen, at the rear) ----------------
  {
    const style = partStyle('engine', 'putter');
    const paint = paintFor('engine');
    const abdomen = new THREE.Group();
    abdomen.position.set(-0.82, 0.72, 0);
    body.add(abdomen);
    if (style === 'twincoil') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 11), paintedMat(paint, 0x7a6248, 0.55, 0.4));
      shell.scale.set(1.15, 0.95, 0.95);
      abdomen.add(shell);
      const copper = new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 });
      for (const side of [0.26, -0.26]) {
        for (let i = 0; i < 3; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14), copper);
          coil.rotation.x = Math.PI / 2;
          coil.position.set(-0.1 - i * 0.1, 0.28, side);
          abdomen.add(coil);
        }
      }
    } else if (style === 'stormheart') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 11), paintedMat(paint, 0x3a4050, 0.7, 0.35));
      shell.scale.set(1.2, 1, 1);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.4 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 22), coreMat);
      core.rotation.y = Math.PI / 2; core.position.x = -0.18;
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 8), DARK_TRIM());
      vent.rotation.z = Math.PI / 2; vent.position.set(-0.5, 0, 0);
      abdomen.add(shell, core, vent);
    } else if (style === 'aethercore') {
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 22), paintedMat(paint, 0xd8d2e8, 0.6, 0.3));
      cage.rotation.y = Math.PI / 2;
      const cage2 = cage.clone(); cage2.rotation.x = Math.PI / 2;
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff9ad2, emissive: 0xff6ab8, emissiveIntensity: 1.8 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), coreMat);
      spinners.push(core);
      abdomen.add(cage, cage2, core);
    } else { // putter
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 9), paintedMat(paint, 0x6a6a72, 0.5, 0.6));
      shell.scale.set(1.1, 0.9, 0.9);
      abdomen.add(shell);
      for (const side of [0.16, -0.16]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 7), DARK_TRIM());
        pipe.position.set(-0.3, 0.3, side);
        pipe.rotation.z = 0.5;
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 10), DARK_TRIM());
        lip.rotation.x = Math.PI / 2;
        lip.position.set(-0.42, 0.52, side);
        lip.rotation.z = 0.5;
        abdomen.add(pipe, lip);
      }
    }
  }

  // ---------------- CARGO ----------------
  {
    const style = partStyle('cargo', 'satchel');
    const paint = paintFor('cargo');
    if (style === 'rack') {
      const frameMat = paintedMat(paint, 0x4a5468, 0.6, 0.45);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.6), frameMat);
      rack.position.set(-0.32, 1.02, 0);
      body.add(rack);
      const crateMat = new THREE.MeshStandardMaterial({ map: plankTexture('#a87848'), roughness: 0.9 });
      for (const [cx, cy, cz, rot] of [[-0.42, 1.14, 0.14, 0.3], [-0.22, 1.14, -0.16, -0.2]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), crateMat);
        crate.position.set(cx, cy, cz); crate.rotation.y = rot;
        body.add(crate);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.04), DARK_TRIM());
      strap.position.set(-0.32, 1.14, 0);
      body.add(strap);
    } else if (style === 'vault') {
      const vaultMat = paintedMat(paint, 0x3a4258, 0.7, 0.35);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.56), vaultMat);
      box.position.set(-0.34, 1.1, 0);
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.58), gold);
      seam.position.set(-0.34, 1.1, 0);
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), gold);
      lock.rotation.x = Math.PI / 2; lock.position.set(-0.34, 1.12, 0.3);
      body.add(box, seam, lock);
    } else if (style === 'caravan') { // double-decked merchant hold with brass-bound chests
      const holdMat = paintedMat(paint, 0x4a3a30, 0.45, 0.55);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc7993f, metalness: 0.8, roughness: 0.3 });
      for (const [dy, dh] of [[1.02, 0.3], [1.34, 0.24]] as const) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, dh, 0.58), holdMat);
        deck.position.set(-0.32, dy, 0);
        body.add(deck);
        // brass bands wrapping the deck
        for (const bz of [0.2, -0.2]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, dh * 0.9, 0.03), brass);
          band.position.set(-0.32, dy, bz);
          body.add(band);
        }
      }
      // little stacked chests on top
      const chestMat = new THREE.MeshStandardMaterial({ map: plankTexture('#9a6e3a'), roughness: 0.85 });
      for (const [cx, cz] of [[-0.24, 0.14], [-0.42, -0.12]] as const) {
        const chest = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), chestMat);
        chest.position.set(cx, 1.53, cz);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), brass);
        lid.position.set(cx, 1.61, cz);
        body.add(chest, lid);
      }
    } else { // satchel — saddlebags on both flanks
      const bagMat = paintedMat(paint, 0x7a5a36, 0.1, 0.85);
      for (const side of [0.5, -0.5]) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.14), bagMat);
        bag.position.set(-0.15, 0.62, side);
        bag.rotation.x = side > 0 ? 0.12 : -0.12;
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.15), DARK_TRIM());
        flap.position.set(-0.15, 0.74, side);
        body.add(bag, flap);
      }
    }
  }

  // ---------------- CANNON (top turret) ----------------
  {
    const style = partStyle('cannon', 'pop');
    const paint = paintFor('cannon');
    const turret = new THREE.Group();
    turret.position.set(0.1, 1.04, 0.2);
    body.add(turret);
    const baseMat = paintedMat(paint, 0x2a2a35, 0.6, 0.45);
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8), baseMat);
    turret.add(mount);
    const barrel = (len: number, r: number, off = 0) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, len, 8), baseMat);
      b.rotation.z = -Math.PI / 2.5;
      b.position.set(len * 0.36, 0.1 + len * 0.28, off);
      turret.add(b);
      return b;
    };
    if (style === 'bore') {
      barrel(0.5, 0.045, 0.06); barrel(0.5, 0.045, -0.06);
    } else if (style === 'howitzer') {
      barrel(0.65, 0.07);
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), baseMat);
      brake.rotation.z = -Math.PI / 2.5;
      brake.position.set(0.46, 0.46, 0);
      const recoil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 7), DARK_TRIM());
      recoil.rotation.z = -Math.PI / 2.5;
      recoil.position.set(0.12, 0.18, 0.1);
      turret.add(brake, recoil);
    } else if (style === 'tempest') {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.24), baseMat);
      pod.rotation.z = -0.4;
      pod.position.set(0.12, 0.22, 0);
      turret.add(pod);
      for (const ty of [0.06, -0.05]) for (const tz of [0.06, -0.06]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 7),
          new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.4 }));
        tube.rotation.z = -0.4 - Math.PI / 2;
        tube.position.set(0.14 + ty * 0.4, 0.23 + ty, tz);
        turret.add(tube);
      }
    } else {
      barrel(0.42, 0.04);
    }
  }

  // ---------------- SCANNER (rear mast) ----------------
  {
    const style = partStyle('scanner', 'tin');
    const paint = paintFor('scanner');
    const mastMat = paintedMat(paint, 0x2a2a35, 0.55, 0.5);
    if (style === 'owleye') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 6), mastMat);
      mast.position.set(-0.32, 1.2, 0);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mastMat);
      dish.rotation.x = Math.PI / 2.6;
      dish.position.set(-0.32, 1.44, 0);
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 1.2 });
      glowMats.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
      eye.position.set(-0.32, 1.46, 0.05);
      spinners.push(dish);
      body.add(mast, dish, eye);
    } else if (style === 'oracle') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 6), mastMat);
      mast.position.set(-0.32, 1.24, 0);
      body.add(mast);
      const orbiter = new THREE.Group();
      orbiter.position.set(-0.32, 1.52, 0);
      const haloMat = new THREE.MeshStandardMaterial({ color: 0xb18ae8, emissive: 0x9a5af2, emissiveIntensity: 1.2 });
      glowMats.push(haloMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 18), haloMat);
      halo.rotation.x = Math.PI / 2;
      orbiter.add(halo);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 6), haloMat);
        orb.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
        orbiter.add(orb);
      }
      spinners.push(orbiter);
      body.add(orbiter);
    } else if (style === 'aethereye') { // levitating halo-ring of folded sky
      // a slim floating post (no physical mast to the body — it hovers)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.32, 6), mastMat);
      post.position.set(-0.32, 1.18, 0);
      body.add(post);
      const floater = new THREE.Group();
      floater.position.set(-0.32, 1.62, 0);
      const skyMat = new THREE.MeshStandardMaterial({ color: 0xc8b4f2, emissive: 0x7a8af2, emissiveIntensity: 1.5 });
      glowMats.push(skyMat);
      // twin counter-set halo rings
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24), skyMat);
      outer.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 7, 20), skyMat);
      inner.rotation.x = Math.PI / 2.2;
      inner.rotation.z = 0.5;
      // the all-seeing core eye
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff9ad2, emissive: 0xff6ab8, emissiveIntensity: 1.8 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), coreMat);
      // four cardinal motes
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const mote = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), skyMat);
        mote.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
        floater.add(mote);
      }
      floater.add(outer, inner, core);
      spinners.push(floater);
      body.add(floater);
    } else { // tin whip antenna
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), mastMat);
      ant.position.set(-0.3, 1.22, 0);
      const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 0.8 });
      glowMats.push(tipMat);
      const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), tipMat);
      antTip.position.set(-0.3, 1.5, 0);
      antTip.name = 'beacon';
      body.add(ant, antTip);
    }
  }

  // ---------------- LEGS (articulated, animated) ----------------
  const legs: CrawlerLeg[] = [];
  {
    const style = partStyle('legs', 'scuttler');
    const paint = paintFor('legs');
    const eightLeg = style === 'sovereign' || style === 'aetherdrift';
    const legMat = paintedMat(paint, style === 'aetherdrift' ? 0x2e2a40 : style === 'sovereign' ? 0x3a3444 : 0x2a2a35, 0.6, 0.45);
    // glowing aether accent material for the drift legs' joints & feet
    const aetherJoint = new THREE.MeshStandardMaterial({ color: 0xc8b4f2, emissive: 0x7a8af2, emissiveIntensity: 1.3 });
    if (style === 'aetherdrift') glowMats.push(aetherJoint);
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });
    const goldFoot = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.3 });
    const accentKnee = style === 'aetherdrift' ? aetherJoint : goldMat;
    const accentFoot = style === 'aetherdrift' ? aetherJoint : goldFoot;
    const xs = eightLeg ? [0.52, 0.18, -0.16, -0.5]
      : style === 'arachno' ? [0.42, 0, -0.42]
      : [0.32, -0.32];
    const thighLen = 0.42, shinLen = 0.8;
    let li = 0;
    for (const lx of xs) {
      for (const side of [1, -1] as const) {
        const hip = new THREE.Group();
        hip.position.set(lx, 0.58, side * 0.4);
        const baseYaw = (lx > 0 ? 0.45 : lx < -0.3 ? -0.45 : 0) * side;
        hip.rotation.y = baseYaw;
        g.add(hip);

        const thighGeo = new THREE.CylinderGeometry(0.045, 0.055, thighLen, 6);
        thighGeo.translate(0, thighLen / 2, 0);
        const thigh = new THREE.Mesh(thighGeo, legMat);
        const thighTilt = side * (Math.PI * 55 / 180);
        thigh.rotation.x = thighTilt;
        hip.add(thigh);

        // armor plate on the thigh for tier-2; gold knee for tier-3
        if (style === 'arachno') {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, thighLen * 0.7, 0.12), legMat);
          plate.position.set(0, thighLen * 0.4, side * 0.05);
          thigh.add(plate);
        }

        const kneePos = new THREE.Vector3(0, Math.cos(thighTilt) * thighLen, Math.sin(thighTilt) * thighLen);
        const knee = new THREE.Group();
        knee.position.copy(kneePos);
        hip.add(knee);
        const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
          eightLeg ? accentKnee : legMat);
        knee.add(kneeCap);

        const shinGeo = new THREE.CylinderGeometry(0.03, 0.045, shinLen, 6);
        shinGeo.translate(0, shinLen / 2, 0);
        const shin = new THREE.Mesh(shinGeo, legMat);
        const kneeBase = side * (Math.PI * 168 / 180);
        const shinPivot = new THREE.Group();
        shinPivot.rotation.x = kneeBase;
        shinPivot.add(shin);
        knee.add(shinPivot);
        const foot = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6),
          eightLeg ? accentFoot : DARK_TRIM());
        foot.position.y = shinLen;
        foot.rotation.x = Math.PI;
        shin.add(foot);

        // tripod gait: alternate phases in a checker pattern
        legs.push({ hip, knee: shinPivot, baseYaw, kneeBase, phase: ((li + (side > 0 ? 0 : 1)) % 2) * Math.PI, side });
      }
      li++;
    }
  }

  g.traverse(o => { o.castShadow = true; });

  const rig: CrawlerRig = {
    group: root, body, legs, spinners, glowMats,
    lastPos: root.position.clone(), lastYaw: root.rotation.y,
    t: Math.random() * 10, move: 0, bodyBaseY: 0,
  };
  crawlerRigs.add(rig);
  root.userData.crawlerRig = true;
  return root;
}

/** Crawl, turn, breathe. Driven from the shared updateRigs() loop. */
function updateCrawlerRigs(dt: number): void {
  if (dt <= 0) return;
  for (const r of crawlerRigs) {
    if (!r.group.parent) continue; // detached crawlers sleep
    const speed = r.group.position.distanceTo(r.lastPos) / dt;
    let dyaw = r.group.rotation.y - r.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = Math.abs(dyaw) / dt;
    r.lastPos.copy(r.group.position);
    r.lastYaw = r.group.rotation.y;

    const target = Math.min(1, speed / 2.0 + turn / 2.4);
    r.move += (target - r.move) * Math.min(1, dt * 9);
    r.t += dt * (1.2 + r.move * 8.0);

    for (const leg of r.legs) {
      const swing = Math.sin(r.t + leg.phase) * 0.34 * r.move;
      leg.hip.rotation.y = leg.baseYaw + swing;
      const lift = Math.max(0, Math.sin(r.t + leg.phase + Math.PI / 2)) * 0.38 * r.move;
      leg.knee.rotation.x = leg.kneeBase - lift * leg.side;
    }
    // body: idle breath + walking bob
    r.body.position.y = r.bodyBaseY + Math.sin(r.t * 0.7) * 0.012 + Math.abs(Math.sin(r.t)) * 0.035 * r.move;
    r.body.rotation.z = Math.sin(r.t * 0.5) * 0.01 + r.move * 0.02;
    for (const sp of r.spinners) sp.rotation.y += dt * (1.6 + r.move * 4);
    const pulse = 0.8 + Math.sin(r.t * 2.2) * 0.25;
    for (const m of r.glowMats) m.emissiveIntensity = pulse;
  }
}

// ---------------- voxel human (tamer & NPCs) ----------------
export type Hairstyle = 'classic' | 'spiky' | 'long' | 'ponytail' | 'buns' | 'mohawk' | 'curly' | 'bald';
export const HAIRSTYLES: { id: Hairstyle; name: string; desc: string }[] = [
  { id: 'classic', name: 'Fieldcut', desc: 'The honest academy standard.' },
  { id: 'spiky', name: 'Stormspike', desc: 'Hair that has opinions.' },
  { id: 'long', name: 'Wanderer', desc: 'Long and road-worn, falls past the shoulders.' },
  { id: 'ponytail', name: 'Skytail', desc: 'High tail — keeps the wind out of your eyes.' },
  { id: 'buns', name: 'Twin Moons', desc: 'Two perfect buns. Battle-ready. Adorable.' },
  { id: 'mohawk', name: 'Crestfire', desc: 'A proud ridge straight down the middle.' },
  { id: 'curly', name: 'Cloudcurl', desc: 'A soft storm of curls.' },
  { id: 'bald', name: 'Polished', desc: 'Aerodynamic. Wise. Low maintenance.' },
];

export const SKIN_TONES: { id: number; name: string }[] = [
  { id: 0xf2d2b0, name: 'Porcelain' }, { id: 0xe8b48a, name: 'Sand' },
  { id: 0xd29a6a, name: 'Amber' }, { id: 0xb07848, name: 'Bronze' },
  { id: 0x8a5a36, name: 'Umber' }, { id: 0x5e3a22, name: 'Ebony' },
];

export const HAIR_COLORS: { id: number; name: string }[] = [
  { id: 0x35261a, name: 'Chestnut' }, { id: 0x1a1a22, name: 'Raven' },
  { id: 0x6a3a1a, name: 'Auburn' }, { id: 0xc9892a, name: 'Honey' },
  { id: 0xd8d8d8, name: 'Silver' }, { id: 0xb83a3a, name: 'Ember' },
  { id: 0x3a6ea8, name: 'Tidal' }, { id: 0x4ec45e, name: 'Verdant' },
  { id: 0x9a5af2, name: 'Umbral' }, { id: 0xe85a8a, name: 'Petal' },
];

export interface Appearance { skin: number; hair: number; hairstyle: Hairstyle; }
export const DEFAULT_APPEARANCE: Appearance = { skin: 0xe8b48a, hair: 0x35261a, hairstyle: 'classic' };

export interface VoxelHumanOpts {
  skin?: number; hair?: number; top?: number; sleeves?: number;
  bottom?: number; shoes?: number; cap?: number | null; robe?: boolean;
  hairstyle?: Hairstyle;
  topColor?: number; topTex?: THREE.Texture | null;
  bottomColor?: number; bottomTex?: THREE.Texture | null;
  sleeveColor?: number; sleeveTex?: THREE.Texture | null;
  shoeColor?: number; shoeTex?: THREE.Texture | null;
  capColor?: number; capTex?: THREE.Texture | null;
  glovesColor?: number; glovesTex?: THREE.Texture | null;
  backpackColor?: number; backpackTex?: THREE.Texture | null;
}

function faceTexture(skin: number, smile = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${skin.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 64, 64);
  // eyes
  ctx.fillStyle = '#ffffff'; ctx.fillRect(14, 26, 12, 10); ctx.fillRect(38, 26, 12, 10);
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(18, 28, 6, 8); ctx.fillRect(42, 28, 6, 8);
  // brows
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(14, 22, 12, 3); ctx.fillRect(38, 22, 12, 3);
  // mouth
  ctx.fillStyle = '#a05a4a';
  if (smile) { ctx.fillRect(24, 46, 16, 4); ctx.fillRect(22, 44, 4, 4); ctx.fillRect(38, 44, 4, 4); }
  else ctx.fillRect(26, 46, 12, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Hairstyle builder — adds hair meshes to a voxel head group. */
function buildHair(headG: THREE.Group, style: Hairstyle, hairC: number): void {
  if (style === 'bald') return;
  const hm = vmat(hairC);
  const top = () => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), hm); t.position.y = 0.37; headG.add(t); };
  const back = (h = 0.3, y = 0.2) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.1), hm); b.position.set(0, y, -0.16); headG.add(b); };
  const fringe = () => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.06), hm); f.position.set(0, 0.3, 0.16); headG.add(f); };

  if (style === 'classic') {
    top(); back(); fringe();
  } else if (style === 'spiky') {
    top(); fringe();
    for (const [sx, sz] of [[-0.1, -0.06], [0.04, 0.08], [0.12, -0.1], [-0.04, 0.02], [0.1, 0.06]] as const) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), hm);
      spike.position.set(sx, 0.49, sz);
      spike.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      headG.add(spike);
    }
  } else if (style === 'long') {
    top(); fringe();
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.12), hm);
    mane.position.set(0, 0.04, -0.18);
    headG.add(mane);
    for (const side of [0.21, -0.21]) {
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.3), hm);
      lock.position.set(side, 0.1, -0.02);
      headG.add(lock);
    }
  } else if (style === 'ponytail') {
    top(); back(); fringe();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), vmat(0xc9a24a));
    band.rotation.x = Math.PI / 2.6;
    band.position.set(0, 0.34, -0.22);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), hm);
    tail.position.set(0, 0.12, -0.3);
    tail.rotation.x = 0.35;
    headG.add(band, tail);
  } else if (style === 'buns') {
    top(); back(0.22, 0.24); fringe();
    for (const side of [0.2, -0.2]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7), hm);
      bun.position.set(side, 0.4, -0.06);
      headG.add(bun);
    }
  } else if (style === 'mohawk') {
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16 + (2 - Math.abs(i - 2)) * 0.05, 0.09), hm);
      seg.position.set(0, 0.44, 0.16 - i * 0.09);
      headG.add(seg);
    }
  } else if (style === 'curly') {
    const rnd = mulberry(Math.floor(hairC));
    for (let i = 0; i < 9; i++) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.085 + rnd() * 0.045, 7, 6), hm);
      const a = (i / 9) * Math.PI * 2;
      curl.position.set(Math.cos(a) * 0.15, 0.38 + rnd() * 0.07, Math.sin(a) * 0.13 - 0.02);
      headG.add(curl);
    }
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 7), hm);
    crown.position.set(0, 0.4, -0.02);
    headG.add(crown);
  }
}

const vmat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });

const customMat = (color?: number, tex?: THREE.Texture | null, fallbackColor = 0x888888) => {
  const opts: THREE.MeshStandardMaterialParameters = {
    roughness: 0.8,
    metalness: 0.05
  };
  if (tex) {
    opts.map = tex;
    opts.color = color !== undefined ? color : 0xffffff;
  } else {
    opts.color = color !== undefined ? color : fallbackColor;
  }
  return new THREE.MeshStandardMaterial(opts);
};

/** Blocky voxel-style human, built facing +Z, with pivoted limbs for animation. */
export function makeVoxelHuman(opts: VoxelHumanOpts = {}): THREE.Group {
  const skin = opts.skin ?? 0xe8b48a;
  const hairC = opts.hair ?? 0x35261a;
  const topC = opts.top ?? 0x2a5ad8;
  const sleeveC = opts.sleeves ?? topC;
  const bottomC = opts.bottom ?? 0x32384e;
  const shoeC = opts.shoes ?? 0x23262e;

  const root = new THREE.Group();
  const pelvis = new THREE.Group(); // bobs up/down while walking
  pelvis.name = 'pelvis';
  pelvis.position.y = 0.62;
  root.add(pelvis);

  // legs (pivot at hip)
  for (const [name, x] of [['legL', 0.09], ['legR', -0.09]] as const) {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.16), customMat(opts.bottomColor, opts.bottomTex, bottomC));
    leg.position.y = -0.25;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), customMat(opts.shoeColor, opts.shoeTex, shoeC));
    shoe.position.set(0, -0.53, 0.03);
    hip.add(leg, shoe);
    pelvis.add(hip);
  }

  // torso
  const torsoH = opts.robe ? 0.78 : 0.55;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, torsoH, 0.24), customMat(opts.topColor, opts.topTex, topC));
  torso.position.y = opts.robe ? 0.18 : 0.28;
  torso.name = 'torso';
  pelvis.add(torso);
  if (!opts.robe) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.07, 0.25), vmat(0x1a1d28));
    belt.position.y = 0.02;
    pelvis.add(belt);
  }
  // backpack
  const hasBackpack = opts.backpackTex !== null && opts.backpackTex !== undefined;
  if (hasBackpack) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.14), customMat(opts.backpackColor, opts.backpackTex, 0x8a5a2a));
    pack.position.set(0, 0.3, -0.2);
    pelvis.add(pack);
  }

  // arms (pivot at shoulder)
  for (const [name, x] of [['armL', 0.28], ['armR', -0.28]] as const) {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.5, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.15), customMat(opts.sleeveColor, opts.sleeveTex, sleeveC));
    arm.position.y = -0.18;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.13), customMat(opts.glovesColor, opts.glovesTex, skin));
    hand.position.y = -0.43;
    shoulder.add(arm, hand);
    pelvis.add(shoulder);
  }

  // head with voxel face on the +Z side
  const headG = new THREE.Group();
  headG.name = 'head';
  headG.position.y = 0.62;
  const side = vmat(skin);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(skin), roughness: 0.75 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.34),
    [side, side, side, side, faceMat, side]); // +z face gets the face texture
  head.position.y = 0.17;
  headG.add(head);
  // hair — one of the eight styles
  buildHair(headG, opts.hairstyle ?? 'classic', hairC);
  const hasCap = (opts.cap !== null && opts.cap !== undefined) || (opts.capTex !== null && opts.capTex !== undefined);
  if (hasCap) {
    const capC = opts.cap ?? 0xd84a3a;
    const capMat = customMat(opts.capColor, opts.capTex, capC);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.4), capMat);
    cap.position.y = 0.4;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.18), capMat);
    brim.position.set(0, 0.38, 0.27);
    headG.add(cap, brim);
  }
  pelvis.add(headG);

  root.userData = { t: Math.random() * 6, walk: 0 };
  root.traverse(o => { o.castShadow = true; });
  return root;
}

export function makeTamer(appearance?: Appearance): THREE.Group {
  const a = appearance ?? DEFAULT_APPEARANCE;
  return makeVoxelHuman({ top: 0x2a5ad8, bottom: 0x32384e, cap: 0xd84a3a, skin: a.skin, hair: a.hair, hairstyle: a.hairstyle });
}

/** Pose a voxel human sitting on a seat of the given height. Set seated=false to stand back up. */
export function setVoxelSeated(g: THREE.Group, seated: boolean, seatY = 0.42): void {
  (g.userData as Record<string, unknown>).seated = seated;
  (g.userData as Record<string, unknown>).seatY = seatY;
}

/**
 * Run any prestige cosmetic-FX updaters attached to a tamer rig (Terra City
 * boutique gear). Stored on userData by clothes.ts so there's no import cycle.
 * Called from updateVoxelHuman (every scene) and the boutique mirror loops.
 */
export function updateTamerFX(g: THREE.Group, dt: number): void {
  const ud = g.userData as { fxUpdaters?: Array<(t: number, dt: number) => void>; fxT?: number };
  const list = ud.fxUpdaters;
  if (!list || list.length === 0) return;
  ud.fxT = (ud.fxT ?? 0) + dt;
  const t = ud.fxT;
  for (let i = 0; i < list.length; i++) list[i](t, dt);
}

/** Smoothly blended idle/walk animation for a voxel human. Call every frame. */
export function updateVoxelHuman(g: THREE.Group, walking: boolean, dt: number): void {
  updateTamerFX(g, dt);
  const u = g.userData as { t: number; walk: number; seated?: boolean; seatY?: number };
  u.walk += ((walking ? 1 : 0) - u.walk) * Math.min(1, dt * 9);
  u.t += dt * (2.2 + u.walk * 8.5);
  const s = Math.sin(u.t);
  const w = u.walk, idle = 1 - u.walk;
  const get = (n: string) => g.getObjectByName(n);
  const armL = get('armL'), armR = get('armR'), legL = get('legL'), legR = get('legR');
  const head = get('head'), pelvis = get('pelvis');
  if (u.seated) {
    // thighs forward, hands resting on lap, gentle breathing
    if (legL) legL.rotation.x = -1.45;
    if (legR) legR.rotation.x = -1.45;
    if (armL) { armL.rotation.x = -0.55 + Math.sin(u.t * 0.7) * 0.03; armL.rotation.z = 0.1; }
    if (armR) { armR.rotation.x = -0.55 + Math.sin(u.t * 0.7 + 0.8) * 0.03; armR.rotation.z = -0.1; }
    if (head) { head.rotation.y = Math.sin(u.t * 0.4) * 0.16; head.rotation.x = Math.sin(u.t * 0.8) * 0.03; }
    if (pelvis) pelvis.position.y = (u.seatY ?? 0.42) + Math.sin(u.t * 1.1) * 0.006;
    return;
  }
  if (armL) { armL.rotation.x = -s * 0.85 * w + Math.sin(u.t * 0.9) * 0.05 * idle; armL.rotation.z = 0.06 + Math.sin(u.t * 0.7) * 0.03 * idle; }
  if (armR) { armR.rotation.x = s * 0.85 * w + Math.sin(u.t * 0.9 + 1.4) * 0.05 * idle; armR.rotation.z = -0.06 - Math.sin(u.t * 0.7 + 0.5) * 0.03 * idle; }
  if (legL) legL.rotation.x = s * 0.95 * w;
  if (legR) legR.rotation.x = -s * 0.95 * w;
  if (head) { head.rotation.y = Math.sin(u.t * 0.45) * 0.1 * idle; head.rotation.x = Math.sin(u.t * 0.8) * 0.02; }
  if (pelvis) pelvis.position.y = 0.62 + Math.abs(Math.cos(u.t)) * 0.055 * w + Math.sin(u.t * 1.1) * 0.008 * idle;
}

// ---------------- shared scene helpers ----------------
export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  const isLow = localStorage.getItem('graphicsMode') === 'low';
  if (isLow) {
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1.0);
  } else {
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function skyGradient(top: string, bottom: string): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const grd = ctx.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, top); grd.addColorStop(1, bottom);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, s, s);
  });
}

export function makeFloatingDamageText(scene: THREE.Scene, pos: THREE.Vector3, text: string, color: string, scale = 1): void {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 64px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8; ctx.strokeStyle = '#000';
  ctx.strokeText(text, 128, 80);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.6 * scale, 0.8 * scale, 1);
  sprite.position.copy(pos);
  scene.add(sprite);
  const startY = pos.y;
  tween(0.9, t => {
    sprite.position.y = startY + t * (1.1 + scale * 0.2);
    const pop = 1 + Math.sin(Math.min(1, t * 3) * Math.PI) * 0.25; // landing pop
    sprite.scale.set(1.6 * scale * pop, 0.8 * scale * pop, 1);
    sprite.material.opacity = 1 - t * t;
  }).then(() => {
    scene.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
}
