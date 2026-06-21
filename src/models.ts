// ============================================================
// AZ Tamer — procedural 3D: guardian models, textures, tweens
// ============================================================
import * as THREE from 'three';
import { SPECIES, TYPE_COLORS, CRAWLER_PARTS, PAINT_JOBS, type Archetype, type CrawlerSlot, type PaintJob } from './data';
import { BESPOKE, SCULPTED, forgeGuardian, type BespokeBuild } from './bestiary';
import type { GuardianCustomization } from './state';
import { perf } from './perf';

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

export function scaleTexture(baseColor = '#3a2e26', scaleColor = '#4a3c30', seed = 88): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = scaleColor;
    ctx.strokeStyle = '#1e1814';
    ctx.lineWidth = 1;
    const size = 16;
    for (let y = -size; y < s + size; y += size * 0.75) {
      const isOdd = Math.floor(y / (size * 0.75)) % 2 === 0;
      const xOffset = isOdd ? size / 2 : 0;
      for (let x = -size; x < s + size; x += size) {
        ctx.beginPath();
        const px = x + xOffset;
        const py = y;
        ctx.moveTo(px, py + size / 2);
        ctx.lineTo(px + size / 2, py);
        ctx.lineTo(px + size, py + size / 2);
        ctx.lineTo(px + size / 2, py + size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  });
}

export function circuitTexture(baseColor = '#14161e', lineColor = '#6ad8f2', seed = 44): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      let x = rnd() * s;
      let y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        const dir = Math.floor(rnd() * 4);
        const len = 30 + rnd() * 40;
        if (dir === 0) x += len;
        else if (dir === 1) x -= len;
        else if (dir === 2) y += len;
        else y -= len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(x, y, 3 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function filigreeTexture(baseColor = '#3a3444', metalColor = '#c9a24a', seed = 77): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = metalColor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      let r = 10 + rnd() * 25;
      let startAngle = rnd() * Math.PI * 2;
      ctx.arc(x, y, r, startAngle, startAngle + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = metalColor;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function voidStarfieldTexture(baseColor = '#0b061a', nebColor = '#9a6aff', seed = 99): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      const x = rnd() * s, y = rnd() * s, r = 30 + rnd() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, nebColor);
      g.addColorStop(0.5, '#ff6ab8');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      const r = rnd() * 1.5;
      ctx.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function crystalFractureTexture(baseColor = '#accfe2', highlightColor = '#ffffff', seed = 2026): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 1;
    const points: [number, number][] = [];
    for (let i = 0; i < 15; i++) {
      points.push([rnd() * s, rnd() * s]);
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i][0] - points[j][0];
        const dy = points[i][1] - points[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s * 0.45) {
          ctx.beginPath();
          ctx.moveTo(points[i][0], points[i][1]);
          ctx.lineTo(points[j][0], points[j][1]);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const cx = rnd() * s, cy = rnd() * s, r = 10 + rnd() * 20;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  });
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

/** Nearest GType for a custom creature's aura colour, so the Forge can theme it. */
function elementFromGlow(glow: number): string {
  const gr = (glow >> 16) & 255, gg = (glow >> 8) & 255, gb = glow & 255;
  let best = 'Blaze', bestD = Infinity;
  for (const k of Object.keys(TYPE_COLORS) as (keyof typeof TYPE_COLORS)[]) {
    const c = TYPE_COLORS[k];
    const d = ((c >> 16 & 255) - gr) ** 2 + ((c >> 8 & 255) - gg) ** 2 + ((c & 255) - gb) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

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
  // hand-sculpted species come from the bestiary; everyone else is forged
  // (unique seeded texture set + element regalia + idle rig).
  const bespoke: BespokeBuild | undefined = SCULPTED.has(speciesId) ? BESPOKE[speciesId]?.() : undefined;
  const forged: BespokeBuild | undefined = bespoke ? undefined : forgeGuardian({
    id: speciesId, arch: def.archetype, palette: def.palette,
    element: def.type, stage: def.stage, glow, customColors: custom?.colors,
  });
  const body = bespoke ? bespoke.body : forged!.body;
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

  // Top-tier ascensions (Terra / Transcendence / Aether) carry a radiant
  // double-halo and orbiting motes — a visible mark of a form beyond Apex.
  if (def.stage === 'Aether' || def.stage === 'Transcendent' || def.stage === 'Terra') {
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
    animate: (bespoke ?? forged)?.animate,
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
  // hand-sculpted one-offs (e.g. Aljay's three) come from the bestiary;
  // anything else is forged from its archetype, colours and aura.
  const bespoke: BespokeBuild | undefined = bespokeId ? BESPOKE[bespokeId]?.() : undefined;
  const forged: BespokeBuild | undefined = bespoke ? undefined : forgeGuardian({
    id: bespokeId ?? `custom-${arch}-${glow.toString(16)}`, arch, palette,
    element: elementFromGlow(glow), stage: aether ? 'Aether' : 'Apex', glow,
  });
  const body = bespoke ? bespoke.body : forged!.body;
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
    parts: (bespoke ?? forged)?.parts ?? {
      head: body.getObjectByName('head') ?? undefined,
      tail: body.getObjectByName('tail') ?? undefined,
      wings: [body.getObjectByName('wing1'), body.getObjectByName('wing-1')].filter(Boolean) as THREE.Object3D[],
    },
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
    animate: (bespoke ?? forged)?.animate,
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
  swingAmt: number;
  liftAmt: number;
}

/** A bespoke per-part animation closure — wheels rolling, plates flicking,
 *  cores pulsing, treads scrolling. Called every frame with the rig's clock,
 *  its 0..1 movement intensity, and dt. This is what lets every new part carry
 *  its own motion without bloating the central update with style checks. */
type CrawlerAnimator = (t: number, move: number, dt: number) => void;

interface CrawlerRig {
  group: THREE.Group;
  body: THREE.Group;
  legs: CrawlerLeg[];
  spinners: THREE.Object3D[];
  glowMats: THREE.MeshStandardMaterial[];
  animators: CrawlerAnimator[];
  lastPos: THREE.Vector3;
  lastYaw: number;
  t: number;
  move: number;
  bodyBaseY: number;
}

/** Symmetric leg-row X positions by row count (front→rear), scaled by chassis length. */
const CRAWLER_ROW_X: Record<number, number[]> = {
  2: [0.32, -0.32],
  3: [0.42, 0, -0.42],
  4: [0.52, 0.18, -0.16, -0.5],
  5: [0.58, 0.29, 0, -0.29, -0.58],
};

/** A chassis descriptor: every hull writes its silhouette, size and mount
 *  anchors here, and every other slot reads from it — so a long wasp body
 *  spreads the legs, a tall juggernaut lifts the turret, and so on. */
interface Chassis {
  scale: number; lenScale: number; widthScale: number;
  coreY: number; topY: number; hipY: number; hipZ: number;
  cab: [number, number, number];
  visor: [number, number, number];
  lamp: [number, number, number];
  enginePos: [number, number, number];
  cargoX: number; cargoTopY: number;
  cannonPos: [number, number, number];
  scannerPos: [number, number, number];
  hideCab: boolean; glow: number; visorColor: number;
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

function texturedMat(paint: PaintJob | undefined, tex: THREE.Texture, defColor: number, defMetal = 0.45, defRough = 0.5): THREE.MeshStandardMaterial {
  if (paint) {
    return new THREE.MeshStandardMaterial({
      color: paint.color, metalness: paint.metalness, roughness: paint.roughness,
      emissive: paint.emissive ?? 0x000000, emissiveIntensity: paint.emissiveIntensity ?? 0,
      map: tex,
    });
  }
  return new THREE.MeshStandardMaterial({ color: defColor, metalness: defMetal, roughness: defRough, map: tex });
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
  const legs: CrawlerLeg[] = [];
  const animators: CrawlerAnimator[] = [];

  // a self-pulsing emissive material (registered for the global glow throb) + gold accent
  const glow = (color: number, inten = 1.4): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: inten });
    glowMats.push(m); return m;
  };
  const goldMat = (): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });

  // The chassis spec — defaults reproduce the classic Scrap silhouette; each
  // hull below overrides only the fields it needs, and every other slot reads
  // these anchors so the whole machine re-fits itself around the body.
  const chassis: Chassis = {
    scale: 1, lenScale: 1, widthScale: 1,
    coreY: 0.62, topY: 1.04, hipY: 0.58, hipZ: 0.40,
    cab: [0.28, 0.92, 0], visor: [0.47, 0.96, 0], lamp: [0.66, 0.62, 0.22],
    enginePos: [-0.82, 0.72, 0], cargoX: -0.33, cargoTopY: 1.04,
    cannonPos: [0.10, 1.04, 0.20], scannerPos: [-0.32, 1.20, 0],
    hideCab: false, glow: 0x5ab8e8, visorColor: 0x6ec4f2,
  };

  // ---------------- HULL (cephalothorax + cab) ----------------
  {
    const style = partStyle('hull', 'scrap');
    const paint = paintFor('hull');
    let hullMat: THREE.MeshStandardMaterial;
    if (style === 'bronzeweave') {
      hullMat = texturedMat(paint, scaleTexture('#c4824a', '#8a5a2e'), 0xc4824a, 0.6, 0.35);
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 11), hullMat);
      a.scale.set(1.25, 0.72, 0.95); a.position.set(0.1, 0.62, 0);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 11), hullMat);
      b.scale.set(1.1, 0.7, 0.9); b.position.set(-0.32, 0.6, 0);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 18), DARK_TRIM());
      band.rotation.y = Math.PI / 2; band.position.set(-0.12, 0.62, 0);
      body.add(a, b, band);
    } else if (style === 'aegis') {
      hullMat = texturedMat(paint, circuitTexture('#55607a', '#7a8af2'), 0x55607a, 0.7, 0.3);
      hullMat.flatShading = true;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), hullMat);
      core.scale.set(1.3, 0.68, 0.95); core.position.set(0, 0.64, 0);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.06), hullMat);
      fin.position.set(-0.1, 1.0, 0); fin.rotation.z = 0.18;
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), hullMat);
      prow.rotation.z = -Math.PI / 2; prow.rotation.x = Math.PI / 4; prow.position.set(0.72, 0.6, 0);
      body.add(core, fin, prow);
    } else if (style === 'royale') {
      hullMat = texturedMat(paint, filigreeTexture('#e8e2d2', '#c9a24a'), 0xe8e2d2, 0.35, 0.2);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 13), hullMat);
      core.scale.set(1.32, 0.72, 0.98); core.position.set(0, 0.63, 0);
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 26), gold);
      trim.rotation.x = Math.PI / 2; trim.scale.set(1.32, 0.98, 1); trim.position.set(0, 0.63, 0);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), gold);
      crest.position.set(0.32, 1.06, 0);
      body.add(core, trim, crest);
    } else if (style === 'wasp') { // sleek, long, low — a vespine racer
      Object.assign(chassis, {
        lenScale: 1.3, widthScale: 0.84, coreY: 0.5, topY: 0.95, hipY: 0.56, hipZ: 0.36,
        cab: [0.38, 0.74, 0], visor: [0.6, 0.78, 0], lamp: [0.8, 0.5, 0.16],
        enginePos: [-1.02, 0.56, 0], cargoX: -0.4, cargoTopY: 0.92,
        cannonPos: [0.02, 0.95, 0.16], scannerPos: [-0.46, 1.04, 0], glow: 0xf2c14e, visorColor: 0xf2e14e,
      });
      hullMat = texturedMat(paint, scaleTexture('#d9a23a', '#16161c'), 0xd9a23a, 0.5, 0.4);
      const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), hullMat);
      thorax.scale.set(1.6, 0.6, 0.84); thorax.position.set(0.02, 0.5, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), hullMat);
      head.scale.set(1.1, 0.8, 0.9); head.position.set(0.62, 0.52, 0);
      body.add(thorax, head);
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x16161c, metalness: 0.4, roughness: 0.5 });
      for (const bx of [-0.06, -0.34, -0.6]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), bandMat);
        band.rotation.y = Math.PI / 2; band.scale.set(1, 0.6, 0.84); band.position.set(bx, 0.5, 0);
        body.add(band);
      }
      const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), bandMat);
      stinger.rotation.z = Math.PI / 2.1; stinger.position.set(-0.98, 0.5, 0); body.add(stinger);
    } else if (style === 'beetle') { // domed carapace whose elytra flick open
      Object.assign(chassis, { widthScale: 1.06, coreY: 0.6, topY: 1.06, glow: 0x2ad2a4, visorColor: 0x8af2c4 });
      hullMat = texturedMat(paint, scaleTexture('#256046', '#123f28'), 0x256046, 0.6, 0.3);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
      dome.scale.set(1.2, 1.0, 1.08); dome.position.set(0, 0.5, 0);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 10), hullMat);
      belly.scale.set(1.16, 0.42, 1.02); belly.position.set(0, 0.52, 0);
      body.add(dome, belly);
      const elyMat = texturedMat(paint, scaleTexture('#2f8a5a', '#123f28'), 0x2f8a5a, 0.7, 0.2);
      for (const side of [1, -1] as const) {
        const hinge = new THREE.Group(); hinge.position.set(0, 0.62, 0); body.add(hinge);
        const ely = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI, 0, Math.PI / 2), elyMat);
        ely.scale.set(1.16, 0.95, 0.62); ely.position.set(0, 0, side * 0.18); hinge.add(ely);
        animators.push((t, m) => { hinge.rotation.x = side * (0.04 + Math.max(0, Math.sin(t * 0.7)) * (0.14 + m * 0.16)); });
      }
    } else if (style === 'crab') { // wide, flat war-crab with side eyestalks
      Object.assign(chassis, {
        lenScale: 0.82, widthScale: 1.4, coreY: 0.46, topY: 0.9, hipY: 0.54, hipZ: 0.54,
        enginePos: [-0.66, 0.5, 0], cargoX: -0.2, cargoTopY: 0.88, cannonPos: [0.0, 0.9, 0.0],
        scannerPos: [-0.28, 1.0, 0], hideCab: true, glow: 0xe8743a, visorColor: 0xf2a23a,
      });
      hullMat = texturedMat(paint, scaleTexture('#b5502a', '#8a3a1a'), 0xb5502a, 0.5, 0.5);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), hullMat);
      shell.scale.set(1.3, 0.48, 1.55); shell.position.set(0, 0.5, 0); body.add(shell);
      for (const [bx, bz] of [[0.12, 0], [-0.2, 0.34], [-0.2, -0.34], [0.28, 0.5], [0.28, -0.5]] as const) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), hullMat);
        bump.position.set(bx, 0.66, bz); body.add(bump);
      }
      const clawMat = texturedMat(paint, scaleTexture('#8a3a1a', '#5a2612'), 0x8a3a1a, 0.5, 0.5);
      for (const side of [1, -1] as const) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 6), clawMat);
        claw.rotation.z = -Math.PI / 2; claw.position.set(0.62, 0.5, side * 0.42); body.add(claw);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 6), clawMat);
        stalk.position.set(0.42, 0.78, side * 0.2); body.add(stalk);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow(0xf2d23a, 1.2));
        eye.position.set(0.42, 0.95, side * 0.2); body.add(eye);
      }
    } else if (style === 'reef') { // living coral hull crusted with glowing barnacles
      Object.assign(chassis, { widthScale: 1.1, coreY: 0.58, glow: 0x2ad2c4, visorColor: 0x5af2e4 });
      hullMat = texturedMat(paint, scaleTexture('#256a72', '#1d4a52'), 0x256a72, 0.3, 0.72);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.54, 14, 11), hullMat);
      core.scale.set(1.32, 0.8, 1.06); core.position.set(0, 0.6, 0); body.add(core);
      const nodeMat = glow(0x2ad2c4, 1.0);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const node = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), i % 2 ? nodeMat : hullMat);
        node.position.set(Math.cos(a) * 0.52, 0.62 + Math.sin(a * 3) * 0.14, Math.sin(a) * 0.42); body.add(node);
      }
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.14), mat(0x3a8a5a, { roughness: 0.7 }));
      frond.position.set(-0.3, 0.95, 0.2); body.add(frond);
      animators.push(t => { frond.rotation.z = Math.sin(t * 1.2) * 0.22; });
    } else if (style === 'obsidian') { // faceted black stealth wedge with ember seams
      Object.assign(chassis, {
        lenScale: 1.15, coreY: 0.54, topY: 1.0, cab: [0.3, 0.82, 0], visor: [0.5, 0.84, 0],
        scannerPos: [-0.34, 1.16, 0], glow: 0xf24a2a, visorColor: 0xf24a2a,
      });
      hullMat = texturedMat(paint, scaleTexture('#16171d', '#0a0b0f'), 0x16171d, 0.5, 0.4); hullMat.flatShading = true;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 0), hullMat);
      core.scale.set(1.5, 0.6, 0.92); core.position.set(0, 0.54, 0); body.add(core);
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 4), hullMat);
      prow.rotation.z = -Math.PI / 2; prow.rotation.x = Math.PI / 4; prow.position.set(0.84, 0.5, 0); body.add(prow);
      const seamMat = glow(0xf24a2a, 1.2);
      for (const sz of [0.18, -0.18]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.02), seamMat);
        seam.position.set(0, 0.56, sz); body.add(seam);
      }
      const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02), seamMat);
      dorsal.position.set(0, 0.78, 0); body.add(dorsal);
    } else if (style === 'juggernaut') { // a rolling fortress: big, tall, dorsal blades
      Object.assign(chassis, {
        scale: 1.16, lenScale: 1.05, widthScale: 1.2, coreY: 0.66, topY: 1.2, hipY: 0.6, hipZ: 0.5,
        cab: [0.34, 1.0, 0], visor: [0.56, 1.02, 0], lamp: [0.74, 0.66, 0.28],
        enginePos: [-0.92, 0.78, 0], cargoX: -0.34, cargoTopY: 1.2,
        cannonPos: [0.05, 1.22, 0.2], scannerPos: [-0.36, 1.42, 0], glow: 0xc94a2a, visorColor: 0xf2843a,
      });
      hullMat = texturedMat(paint, circuitTexture('#5a5e68', '#c94a2a'), 0x5a5e68, 0.6, 0.45);
      const core = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.0), hullMat);
      core.position.set(0, 0.66, 0); body.add(core);
      const glacis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 1.0), hullMat);
      glacis.position.set(0.7, 0.6, 0); glacis.rotation.z = 0.5; body.add(glacis);
      const bladeMat = texturedMat(paint, circuitTexture('#3a3e48', '#c94a2a'), 0x3a3e48, 0.7, 0.35);
      for (const side of [1, -1] as const) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06), bladeMat);
        blade.position.set(-0.1, 1.06, side * 0.32); blade.rotation.z = 0.3; body.add(blade);
      }
      const rivetMat = DARK_TRIM();
      for (let i = 0; i < 8; i++) {
        const rv = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), rivetMat);
        rv.position.set(-0.6 + i * 0.18, 0.34, 0.51); body.add(rv);
        const rv2 = rv.clone(); rv2.position.z = -0.51; body.add(rv2);
      }
    } else if (style === 'mecha') { // exposed-frame pilot pod with a glass canopy
      Object.assign(chassis, { coreY: 0.6, topY: 1.05, hideCab: true, glow: 0x3ad2f2, visorColor: 0x3ad2f2, scannerPos: [-0.34, 1.22, 0] });
      hullMat = texturedMat(paint, circuitTexture('#6a7280', '#3ad2f2'), 0x6a7280, 0.65, 0.4);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.8), hullMat);
      core.position.set(-0.1, 0.62, 0); body.add(core);
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), hullMat);
      pod.position.set(0.5, 0.78, 0); body.add(pod);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9),
        mat(0x3ad2f2, { emissive: 0x1a9ad2, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.3 }));
      canopy.scale.set(0.85, 0.7, 1); canopy.position.set(0.66, 0.82, 0); body.add(canopy);
      const strutMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.7, roughness: 0.4 });
      for (const [sx, sz] of [[0.1, 0.42], [0.1, -0.42], [-0.4, 0.42], [-0.4, -0.42]] as const) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), strutMat);
        strut.position.set(sx, 0.5, sz); strut.rotation.x = 0.2 * Math.sign(sz); body.add(strut);
      }
      for (const side of [1, -1] as const) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.16), glow(0x3ad2f2, 1.0));
        vent.position.set(-0.2, 0.86, side * 0.34); body.add(vent);
      }
    } else if (style === 'monarch') { // a regal crowned coach
      Object.assign(chassis, {
        scale: 1.08, coreY: 0.64, topY: 1.12, cab: [0.3, 0.96, 0], visor: [0.5, 1.0, 0],
        cargoTopY: 1.12, cannonPos: [0.08, 1.12, 0.2], scannerPos: [-0.34, 1.34, 0], glow: 0xf2c14e, visorColor: 0xfff0c8,
      });
      hullMat = texturedMat(paint, filigreeTexture('#eae2d2', '#c9a24a'), 0xeae2d2, 0.4, 0.22);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 15), hullMat);
      core.scale.set(1.34, 0.82, 1.0); core.position.set(0, 0.64, 0); body.add(core);
      const gold = goldMat();
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 28), gold);
      trim.rotation.x = Math.PI / 2; trim.scale.set(1.34, 1.0, 1); trim.position.set(0, 0.64, 0); body.add(trim);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), gold);
        spire.position.set(Math.cos(a) * 0.3, 1.0, Math.sin(a) * 0.24); body.add(spire);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), glow(0xe85a8a, 1.3));
      gem.position.set(0, 1.16, 0); spinners.push(gem); body.add(gem);
    } else if (style === 'stormcell') { // a dread-hull that crackles with caged arcs
      Object.assign(chassis, {
        scale: 1.1, lenScale: 1.05, coreY: 0.62, topY: 1.16, cab: [0.3, 0.92, 0], visor: [0.52, 0.95, 0],
        cannonPos: [0.06, 1.16, 0.2], scannerPos: [-0.36, 1.36, 0], glow: 0x5ab8e8, visorColor: 0x5ad2f2,
      });
      hullMat = texturedMat(paint, circuitTexture('#2a2f3a', '#5ab8e8'), 0x2a2f3a, 0.7, 0.35);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), hullMat);
      core.scale.set(1.42, 0.78, 1.0); core.position.set(0, 0.62, 0); body.add(core);
      const prongMat = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.85, roughness: 0.2 });
      const tips: THREE.Vector3[] = [];
      for (const px of [0.3, 0, -0.3]) {
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 8), prongMat);
        prong.position.set(px, 1.04, 0); body.add(prong);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0x5ab8e8, 1.6));
        ball.position.set(px, 1.26, 0); body.add(ball); tips.push(new THREE.Vector3(px, 1.26, 0));
      }
      for (let i = 0; i < tips.length - 1; i++) {
        const a = tips[i], b = tips[i + 1], mid = a.clone().add(b).multiplyScalar(0.5);
        const am = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0 });
        const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, a.distanceTo(b), 5), am);
        arc.position.copy(mid); arc.rotation.z = Math.PI / 2; body.add(arc);
        animators.push(() => { am.opacity = Math.random() < 0.3 ? 0.85 : 0.04; arc.position.y = mid.y + (Math.random() - 0.5) * 0.05; });
      }
    } else if (style === 'wyrm') { // a draconic scale-plated chassis with twitching wing-stubs
      Object.assign(chassis, {
        scale: 1.1, lenScale: 1.2, coreY: 0.6, cab: [0.32, 0.86, 0], visor: [0.56, 0.88, 0],
        enginePos: [-1.0, 0.66, 0], scannerPos: [-0.42, 1.2, 0], glow: 0xf2a83a, visorColor: 0xf2d23a,
      });
      hullMat = texturedMat(paint, scaleTexture('#6a3a4a', '#8a4a5a'), 0x6a3a4a, 0.4, 0.5);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), hullMat);
      core.scale.set(1.5, 0.78, 0.95); core.position.set(0, 0.6, 0); body.add(core);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), hullMat);
      head.scale.set(1.3, 0.9, 0.9); head.position.set(0.7, 0.6, 0); body.add(head);
      const horn = goldMat();
      for (let i = 0; i < 5; i++) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18 - i * 0.012, 5), horn);
        h.position.set(0.4 - i * 0.22, 0.92, 0); h.rotation.z = -0.2; body.add(h);
      }
      const scaleMat = texturedMat(paint, scaleTexture('#8a4a5a', '#6a3a4a'), 0x8a4a5a, 0.5, 0.4);
      for (const sz of [0.28, -0.28]) for (let i = 0; i < 4; i++) {
        const sc = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.16), scaleMat);
        sc.position.set(0.3 - i * 0.24, 0.72, sz); sc.rotation.x = Math.sign(sz) * 0.4; body.add(sc);
      }
      for (const side of [1, -1] as const) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), mat(0x4a2a3a, { roughness: 0.6 }));
        wing.scale.set(1, 0.3, 1); wing.position.set(-0.1, 0.86, side * 0.3); wing.rotation.set(side * 0.6, 0, side * 0.4); body.add(wing);
        animators.push(t => { wing.rotation.z = side * (0.4 + Math.sin(t * 1.5) * 0.14); });
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), hullMat);
      tail.rotation.z = Math.PI / 2; tail.position.set(-1.02, 0.58, 0); body.add(tail);
    } else if (style === 'prism') { // a dichroic crystal lattice with a spinning facet core
      Object.assign(chassis, { coreY: 0.62, glow: 0xc8b4f2, visorColor: 0xc8b4f2 });
      hullMat = texturedMat(paint, crystalFractureTexture('#b4a0e8', '#ffffff'), 0xb4a0e8, 0.4, 0.15);
      hullMat.flatShading = true;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 0), hullMat);
      core.scale.set(1.32, 0.8, 0.96); core.position.set(0, 0.62, 0); body.add(core);
      const innerMat = glow(0xc8b4f2, 1.4);
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), innerMat);
      inner.position.set(0, 0.62, 0); spinners.push(inner); body.add(inner);
      animators.push(t => { const hue = (t * 0.1) % 1; innerMat.color.setHSL(hue, 0.7, 0.6); innerMat.emissive.setHSL(hue, 0.7, 0.5); });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1), innerMat);
        shard.position.set(Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.5); body.add(shard);
        animators.push(t => { shard.position.y = 0.9 + Math.sin(t * 1.3 + a) * 0.08; shard.rotation.y = t + a; });
      }
    } else if (style === 'aether') { // ULTRA — a chassis of folded sky, plates adrift around a haloed core
      Object.assign(chassis, {
        scale: 1.05, coreY: 0.62, topY: 1.1, hideCab: true, cannonPos: [0.06, 1.1, 0.2],
        scannerPos: [-0.34, 1.3, 0], glow: 0xff6ab8, visorColor: 0xff9ad2,
      });
      hullMat = texturedMat(paint, voidStarfieldTexture('#0c071d', '#9ab4ff'), 0xc8b4f2, 0.3, 0.2);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 13), hullMat);
      core.scale.set(1.3, 0.8, 0.95); core.position.set(0, 0.62, 0); body.add(core);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), glow(0xff6ab8, 1.9));
      eye.position.set(0, 0.66, 0); body.add(eye);
      const skyMat = glow(0x9ab4ff, 1.6);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 8, 30), skyMat);
      halo.rotation.x = Math.PI / 2; halo.position.set(0, 0.66, 0); spinners.push(halo); body.add(halo);
      const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 8, 26), skyMat);
      halo2.rotation.x = Math.PI / 2.3; halo2.rotation.z = 0.6; halo2.position.set(0, 0.7, 0); body.add(halo2);
      animators.push((_t, _m, dt) => { halo2.rotation.z += dt * 1.2; });
      const plateMat = mat(0xd8d2f8, { metalness: 0.5, roughness: 0.2, emissive: 0x6a7af2, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), plateMat);
        plate.position.set(Math.cos(a) * 0.62, 0.62 + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.5);
        plate.rotation.set(0.2, a, 0.1); body.add(plate);
        animators.push(t => { plate.position.y = 0.62 + Math.sin(t * 0.9 + a) * 0.12; plate.rotation.y = a + Math.sin(t * 0.5) * 0.2; });
      }
    } else if (style === 'chronos') { // NEW ULTRA Chronos gearbox hull
      Object.assign(chassis, {
        scale: 1.05, coreY: 0.62, topY: 1.1, cab: [0.3, 0.9, 0], visor: [0.5, 0.92, 0],
        cannonPos: [0.08, 1.1, 0.2], scannerPos: [-0.34, 1.3, 0], glow: 0xf2c14e, visorColor: 0xfff0c8,
      });
      hullMat = texturedMat(paint, filigreeTexture('#4a3c28', '#c9a24a'), 0xc9a24a, 0.85, 0.25);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), hullMat);
      core.scale.set(1.35, 0.78, 1.0); core.position.set(0, 0.62, 0); body.add(core);
      const glassMat = mat(0xfff0c8, { transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.8 });
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.62), glassMat);
      windowMesh.position.set(-0.1, 0.62, 0); body.add(windowMesh);
      const gearMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.2 });
      const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), gearMat);
      gear.rotation.x = Math.PI / 2; gear.position.set(-0.1, 0.62, 0); body.add(gear);
      spinners.push(gear);
    } else if (style === 'gloom') { // NEW ULTRA Gloomwyrm carapace
      Object.assign(chassis, {
        scale: 1.1, coreY: 0.64, topY: 1.12, cab: [0.32, 0.92, 0], visor: [0.54, 0.94, 0],
        cannonPos: [0.08, 1.15, 0.2], scannerPos: [-0.36, 1.34, 0], glow: 0x5ec46a, visorColor: 0x6af28a,
      });
      hullMat = texturedMat(paint, scaleTexture('#253d2e', '#1c4a2a'), 0x253d2e, 0.3, 0.7);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), hullMat);
      core.scale.set(1.4, 0.8, 1.0); core.position.set(0, 0.64, 0); body.add(core);
      const spineMat = new THREE.MeshStandardMaterial({ color: 0x111612, metalness: 0.6, roughness: 0.5 });
      for (let i = 0; i < 6; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 5), spineMat);
        spine.position.set(-0.3 + i * 0.16, 0.96, (i % 2 === 0 ? 0.28 : -0.28));
        spine.rotation.set(0.4 * (i % 2 === 0 ? 1 : -1), 0, -0.3); body.add(spine);
      }
      const ribMat = new THREE.MeshStandardMaterial({ color: 0x8a2e2e, metalness: 0.2, roughness: 0.8 });
      const ribs: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 8, 18), ribMat);
        rib.rotation.y = Math.PI / 2; rib.position.set(-0.1 - i * 0.18, 0.64, 0);
        body.add(rib); ribs.push(rib);
      }
      animators.push(t => {
        const pulse = 1 + Math.sin(t * 1.5) * 0.06;
        ribs.forEach(r => r.scale.set(pulse, pulse, 1.02));
      });
    } else if (style === 'void') { // NEW ULTRA Void-Star Carapace
      Object.assign(chassis, {
        scale: 1.05, coreY: 0.6, topY: 1.1, hideCab: true, cannonPos: [0.06, 1.1, 0.2],
        scannerPos: [-0.34, 1.3, 0], glow: 0x9a6aff, visorColor: 0xff6ab8,
      });
      hullMat = texturedMat(paint, voidStarfieldTexture('#050212', '#9a6aff'), 0x050212, 0.4, 0.35);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), hullMat);
      core.position.set(0, 0.6, 0); body.add(core);
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xeae8e2, metalness: 0.5, roughness: 0.3 });
      const plates: THREE.Group[] = [];
      for (let i = 0; i < 4; i++) {
        const plateG = new THREE.Group();
        plateG.position.set(0, 0.6, 0); body.add(plateG);
        const a = (i / 4) * Math.PI * 2;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.05), boneMat);
        plate.position.set(Math.cos(a) * 0.58, Math.sin(a) * 0.2, Math.sin(a) * 0.58);
        plate.rotation.set(0, -a, 0.1); plateG.add(plate); plates.push(plateG);
      }
      animators.push((t) => {
        plates.forEach((p, idx) => {
          p.rotation.y = t * 0.6 + idx * (Math.PI / 2);
        });
      });
    } else if (style === 'plasma') { // NEW ULTRA Plasma Reactor Chassis
      Object.assign(chassis, {
        scale: 1.08, coreY: 0.62, topY: 1.1, cab: [0.32, 0.88, 0], visor: [0.54, 0.9, 0],
        cannonPos: [0.08, 1.1, 0.2], scannerPos: [-0.34, 1.3, 0], glow: 0x3ad2f2, visorColor: 0x6ad8f2,
      });
      hullMat = texturedMat(paint, circuitTexture('#181c26', '#3ad2f2'), 0x181c26, 0.7, 0.25);
      const core = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.66, 0.94), hullMat);
      core.position.set(0, 0.62, 0); body.add(core);
      const tubeMat = glow(0x3ad2f2, 1.5);
      for (const side of [1, -1] as const) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), tubeMat);
        tube.rotation.z = Math.PI / 2; tube.position.set(0, 0.8, side * 0.48); body.add(tube);
      }
    } else if (style === 'crystalline') { // NEW ULTRA Crystalline Geode Hull
      Object.assign(chassis, {
        scale: 1.08, coreY: 0.64, topY: 1.12, cab: [0.32, 0.94, 0], visor: [0.54, 0.96, 0],
        cannonPos: [0.08, 1.12, 0.2], scannerPos: [-0.36, 1.32, 0], glow: 0xb66af2, visorColor: 0xd86aff,
      });
      hullMat = texturedMat(paint, crystalFractureTexture('#3a3545', '#b66af2'), 0x3a3545, 0.5, 0.45);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 11), hullMat);
      shell.scale.set(1.3, 0.8, 1.02); shell.position.set(0, 0.64, 0); body.add(shell);
      const crystalMat = mat(0xd86aff, { metalness: 0.4, roughness: 0.1, emissive: 0xb66af2, emissiveIntensity: 1.5 });
      for (let i = 0; i < 6; i++) {
        const cry = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), crystalMat);
        const a = (i / 6) * Math.PI * 2;
        cry.position.set(-0.2 + Math.cos(a) * 0.12, 0.72, Math.sin(a) * 0.12);
        cry.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); body.add(cry);
      }
    } else { // scrap
      hullMat = texturedMat(paint, scaleTexture('#8a5a3a', '#6e482e'), 0x8a5a3a, 0.5, 0.65);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 9), hullMat);
      core.scale.set(1.3, 0.7, 0.95); core.position.set(0, 0.62, 0);
      body.add(core);
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
    // cab + glass visor + headlamps — anchored to the chassis the hull just set
    if (!chassis.hideCab) {
      const cab = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), paintedMat(paint, 0x4a4a55, 0.5, 0.45));
      cab.position.set(chassis.cab[0], chassis.cab[1], chassis.cab[2]);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9),
        mat(chassis.visorColor, { emissive: chassis.visorColor, emissiveIntensity: 0.8, roughness: 0.12, metalness: 0.2 }));
      visor.scale.set(0.72, 0.55, 1); visor.position.set(chassis.visor[0], chassis.visor[1], chassis.visor[2]);
      body.add(cab, visor);
      for (const side of [chassis.lamp[2], -chassis.lamp[2]]) {
        const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd980, emissiveIntensity: 0.9 });
        glowMats.push(lampMat);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lampMat);
        lamp.position.set(chassis.lamp[0], chassis.lamp[1], side);
        body.add(lamp);
      }
    }
  }

  // ---------------- ENGINE (abdomen, at the rear) ----------------
  {
    const style = partStyle('engine', 'putter');
    const paint = paintFor('engine');
    const abdomen = new THREE.Group();
    abdomen.position.set(chassis.enginePos[0], chassis.enginePos[1], chassis.enginePos[2]);
    body.add(abdomen);
    if (style === 'twincoil') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 11), texturedMat(paint, scaleTexture('#7a6248', '#5c4832'), 0x7a6248, 0.55, 0.4));
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
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 11), texturedMat(paint, circuitTexture('#3a4050', '#5ab8e8'), 0x3a4050, 0.7, 0.35));
      shell.scale.set(1.2, 1, 1);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x5ab8e8, emissive: 0x5ab8e8, emissiveIntensity: 1.4 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 22), coreMat);
      core.rotation.y = Math.PI / 2; core.position.x = -0.18;
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 8), DARK_TRIM());
      vent.rotation.z = Math.PI / 2; vent.position.set(-0.5, 0, 0);
      abdomen.add(shell, core, vent);
    } else if (style === 'aethercore') {
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 22), texturedMat(paint, voidStarfieldTexture('#1c0f38', '#9a6aff'), 0xd8d2e8, 0.6, 0.3));
      cage.rotation.y = Math.PI / 2;
      const cage2 = cage.clone(); cage2.rotation.x = Math.PI / 2;
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff9ad2, emissive: 0xff6ab8, emissiveIntensity: 1.8 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), coreMat);
      spinners.push(core);
      abdomen.add(cage, cage2, core);
    } else if (style === 'piston') { // a hammering bank of brass pistons
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.6), texturedMat(paint, filigreeTexture('#6a5a44', '#c9a24a'), 0x6a5a44, 0.5, 0.5));
      abdomen.add(shell);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 });
      for (const side of [0.18, -0.18]) for (let i = 0; i < 2; i++) {
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), DARK_TRIM());
        housing.position.set(-0.05 - i * 0.16, 0.3, side); abdomen.add(housing);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 6), brass);
        rod.position.set(-0.05 - i * 0.16, 0.3, side); abdomen.add(rod);
        const ph = (i + (side > 0 ? 0 : 1)) * Math.PI * 0.5;
        animators.push((t, m) => { rod.position.y = 0.3 + Math.sin(t * 4 + ph) * 0.08 * (0.5 + m); });
      }
    } else if (style === 'rotary') { // a whirring rotary fan-core
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 11), texturedMat(paint, circuitTexture('#4a5060', '#5ad2f2'), 0x4a5060, 0.65, 0.4));
      shell.scale.set(1.1, 0.95, 0.95); abdomen.add(shell);
      const pivot = new THREE.Group(); pivot.position.x = -0.18; abdomen.add(pivot);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.25 }));
      disc.rotation.z = Math.PI / 2; pivot.add(disc);
      const bladeMat = glow(0x5ad2f2, 1.0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.06), bladeMat);
        blade.position.set(0, Math.cos(a) * 0.16, Math.sin(a) * 0.16); blade.rotation.x = a; disc.add(blade);
      }
      animators.push((_t, m, dt) => { pivot.rotation.x += dt * (3 + m * 8); });
    } else if (style === 'solar') { // gold heat-fins around a sun-bright core
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 11), texturedMat(paint, filigreeTexture('#3a3e48', '#c9a24a'), 0x3a3e48, 0.6, 0.4));
      abdomen.add(shell);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), glow(0xf2b03a, 1.4)); abdomen.add(core);
      const gold = goldMat();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.14), gold);
        fin.position.set(0, Math.cos(a) * 0.34, Math.sin(a) * 0.34); fin.rotation.x = a; abdomen.add(fin);
      }
    } else if (style === 'magma') { // a molten heart that pulses like a forge
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 11), texturedMat(paint, scaleTexture('#2a1a16', '#ff5a2a'), 0x2a1a16, 0.5, 0.6));
      shell.scale.set(1.1, 1, 1); abdomen.add(shell);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3a1a, emissiveIntensity: 1.6 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), coreMat); abdomen.add(core);
      for (const sz of [0.24, -0.24]) {
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02), coreMat);
        crack.position.set(0, 0, sz); abdomen.add(crack);
      }
      animators.push(t => { core.scale.setScalar(1 + Math.sin(t * 3) * 0.12); });
    } else if (style === 'cryo') { // a frost vortex venting cold mist
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 11), texturedMat(paint, crystalFractureTexture('#3a4a5a', '#6ad8f2'), 0x3a4a5a, 0.6, 0.4)); abdomen.add(shell);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), glow(0x6ad8f2, 1.4)); spinners.push(core); abdomen.add(core);
      const mist = new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.3 });
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 + i * 0.08, 0.02, 6, 18), mist);
        ring.rotation.x = Math.PI / 2; ring.position.x = -0.1 - i * 0.1; abdomen.add(ring);
      }
    } else if (style === 'teslacoil') { // a caged coil throwing live arcs
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 10), texturedMat(paint, circuitTexture('#3a3e48', '#9ad8ff'), 0x3a3e48, 0.7, 0.35));
      base.position.y = -0.1; abdomen.add(base);
      const coilMat = new THREE.MeshStandardMaterial({ color: 0xc9892a, metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.025, 0.02, 6, 16), coilMat);
        t2.rotation.x = Math.PI / 2; t2.position.y = 0.04 + i * 0.08; abdomen.add(t2);
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), glow(0x9ad8ff, 1.6)); ball.position.y = 0.4; abdomen.add(ball);
      const am = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0 });
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5), am); arc.position.set(0, 0.2, 0); abdomen.add(arc);
      animators.push(() => { am.opacity = Math.random() < 0.25 ? 0.8 : 0.05; });
    } else if (style === 'quantum') { // a nucleus ringed by counter-spinning orbital tracks
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), glow(0x8af2ff, 1.6)); abdomen.add(core);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xd8d2e8, metalness: 0.7, roughness: 0.3 });
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28 - i * 0.02, 0.015, 6, 24), ringMat);
        const ax = (i / 3) * Math.PI; ring.rotation.set(ax, ax * 1.3, 0); abdomen.add(ring);
        animators.push((_t, m, dt) => { ring.rotation.y += dt * (1.5 + i * 0.7 + m * 3); ring.rotation.x += dt * (0.8 + i * 0.4); });
      }
    } else if (style === 'pulsar') { // a lighthouse core that beats in a slow pulse
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 11), texturedMat(paint, voidStarfieldTexture('#2a2f3a', '#fff0c8'), 0x2a2f3a, 0.7, 0.35)); abdomen.add(shell);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xfff0c8, emissiveIntensity: 1.8 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), coreMat); abdomen.add(core);
      for (const sx of [1, -1]) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
        beam.position.x = sx * 0.3; beam.rotation.z = sx * Math.PI / 2; abdomen.add(beam);
      }
      animators.push(t => { const p = Math.pow(Math.max(0, Math.sin(t * 2.5)), 3); coreMat.emissiveIntensity = 0.6 + p * 2.2; });
    } else if (style === 'singularity') { // ULTRA — a folded knot of void, ringed in light
      const voidMat = new THREE.MeshStandardMaterial({ color: 0x05060a, metalness: 0.2, roughness: 0.5, emissive: 0x1a0a2a, emissiveIntensity: 0.6 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), voidMat); abdomen.add(core);
      const ringMat = glow(0xff6ab8, 1.7);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 28), ringMat); r1.rotation.x = Math.PI / 2; abdomen.add(r1);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 24), glow(0x9a6aff, 1.6));
      r2.rotation.x = Math.PI / 2.4; r2.rotation.z = 0.6; abdomen.add(r2);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const mote = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), ringMat); abdomen.add(mote);
        animators.push(t => { const rr = 0.32 - ((t * 0.4 + i * 0.16) % 1) * 0.28, aa = a + t * 2; mote.position.set(Math.cos(aa) * rr, Math.sin(t + i) * 0.05, Math.sin(aa) * rr); });
      }
      animators.push((_t, m, dt) => { r1.rotation.z += dt * (2 + m * 3); r2.rotation.z -= dt * (1.5 + m * 2.5); });
    } else if (style === 'chronosecore') { // NEW ULTRA Chronos Gear-Core
      const coreMat = texturedMat(paint, filigreeTexture('#3a2c16', '#c9a24a'), 0x3a2c16, 0.8, 0.3);
      const casing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), coreMat);
      abdomen.add(casing);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), coreMat);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(0, 0, 0); abdomen.add(wheel);
      spinners.push(wheel);
      const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x161616, metalness: 0.6, roughness: 0.4 });
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), exhaustMat);
      pipe.position.set(-0.18, 0.28, 0); pipe.rotation.z = 0.4; abdomen.add(pipe);
    } else if (style === 'gloomheart') { // NEW ULTRA Gloomwyrm Heart
      const coreMat = texturedMat(paint, scaleTexture('#301e1e', '#8a2e2e'), 0x8a2e2e, 0.1, 0.9);
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), coreMat);
      abdomen.add(heart);
      animators.push(t => {
        const pulse = 1.0 + Math.pow(Math.max(0, Math.sin(t * 4)), 3) * 0.14;
        heart.scale.setScalar(pulse);
      });
      const veinMat = new THREE.MeshStandardMaterial({ color: 0x1a2e20, metalness: 0.2, roughness: 0.8 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const vein = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 16), veinMat);
        vein.rotation.y = a; abdomen.add(vein);
      }
    } else if (style === 'voidengine') { // NEW ULTRA Void Singularity Core
      const voidMat = texturedMat(paint, voidStarfieldTexture('#050114', '#9a6aff'), 0x050114, 0.2, 0.8);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), voidMat);
      abdomen.add(core);
      const orbMat = glow(0xff6ab8, 1.6);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 24), orbMat);
      ring.rotation.x = Math.PI / 2; abdomen.add(ring);
      spinners.push(ring);
    } else if (style === 'plasmareactor') { // NEW ULTRA Overcharged Plasma Engine
      const cageMat = texturedMat(paint, circuitTexture('#12151c', '#3ad2f2'), 0x12151c, 0.7, 0.3);
      const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.44, 8), cageMat);
      frame.rotation.x = Math.PI / 2; abdomen.add(frame);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), glow(0x3ad2f2, 1.8));
      abdomen.add(core);
      animators.push(t => { core.scale.setScalar(0.95 + Math.sin(t * 6) * 0.08); });
    } else if (style === 'crystalcore') { // NEW ULTRA Prism-Core Reactor
      const rockMat = texturedMat(paint, crystalFractureTexture('#2f2c3a', '#b66af2'), 0x2f2c3a, 0.5, 0.5);
      const frame = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), rockMat);
      abdomen.add(frame);
      const cryMat = mat(0xd86aff, { metalness: 0.3, roughness: 0.1, emissive: 0xb66af2, emissiveIntensity: 1.5 });
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), cryMat);
      abdomen.add(cry);
      spinners.push(cry);
    } else { // putter
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 9), texturedMat(paint, scaleTexture('#6a6a72', '#4a4a50'), 0x6a6a72, 0.5, 0.6));
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
    // top-mounted holds ride this group, which re-seats itself on the chassis top
    const cargoG = new THREE.Group();
    cargoG.position.set(chassis.cargoX + 0.33, chassis.cargoTopY - 1.04, 0);
    body.add(cargoG);
    const flankZ = chassis.hipZ + 0.1;
    if (style === 'rack') {
      const frameMat = texturedMat(paint, scaleTexture('#4a5468', '#343c4a'), 0x4a5468, 0.6, 0.45);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.6), frameMat);
      rack.position.set(-0.32, 1.02, 0);
      cargoG.add(rack);
      const crateMat = new THREE.MeshStandardMaterial({ map: plankTexture('#a87848'), roughness: 0.9 });
      for (const [cx, cy, cz, rot] of [[-0.42, 1.14, 0.14, 0.3], [-0.22, 1.14, -0.16, -0.2]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), crateMat);
        crate.position.set(cx, cy, cz); crate.rotation.y = rot;
        cargoG.add(crate);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.04), DARK_TRIM());
      strap.position.set(-0.32, 1.14, 0);
      cargoG.add(strap);
    } else if (style === 'vault') {
      const vaultMat = texturedMat(paint, filigreeTexture('#3a4258', '#c9a24a'), 0x3a4258, 0.7, 0.35);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.56), vaultMat);
      box.position.set(-0.34, 1.1, 0);
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.25 });
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.58), gold);
      seam.position.set(-0.34, 1.1, 0);
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), gold);
      lock.rotation.x = Math.PI / 2; lock.position.set(-0.34, 1.12, 0.3);
      cargoG.add(box, seam, lock);
    } else if (style === 'caravan') { // double-decked merchant hold with brass-bound chests
      const holdMat = texturedMat(paint, filigreeTexture('#4a3a30', '#c7993f'), 0x4a3a30, 0.45, 0.55);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc7993f, metalness: 0.8, roughness: 0.3 });
      for (const [dy, dh] of [[1.02, 0.3], [1.34, 0.24]] as const) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, dh, 0.58), holdMat);
        deck.position.set(-0.32, dy, 0);
        cargoG.add(deck);
        for (const bz of [0.2, -0.2]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, dh * 0.9, 0.03), brass);
          band.position.set(-0.32, dy, bz);
          cargoG.add(band);
        }
      }
      const chestMat = new THREE.MeshStandardMaterial({ map: plankTexture('#9a6e3a'), roughness: 0.85 });
      for (const [cx, cz] of [[-0.24, 0.14], [-0.42, -0.12]] as const) {
        const chest = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), chestMat);
        chest.position.set(cx, 1.53, cz);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), brass);
        lid.position.set(cx, 1.61, cz);
        cargoG.add(chest, lid);
      }
    } else if (style === 'crateframe') { // a bolted scaffold of lashed crates
      const frameMat = texturedMat(paint, scaleTexture('#2a2e36', '#14161b'), 0x2a2e36, 0.6, 0.4);
      for (const [ex, ez] of [[-0.5, 0.22], [-0.5, -0.22], [-0.14, 0.22], [-0.14, -0.22]] as const) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), frameMat);
        post.position.set(ex, 1.2, ez); cargoG.add(post);
      }
      const crateMat = new THREE.MeshStandardMaterial({ map: plankTexture('#a87848'), roughness: 0.9 });
      for (const [cx, cy, cz] of [[-0.32, 1.04, 0], [-0.42, 1.26, 0.1], [-0.22, 1.28, -0.1], [-0.32, 1.46, 0]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), crateMat);
        crate.position.set(cx, cy, cz); crate.rotation.y = cx + cy; cargoG.add(crate);
      }
    } else if (style === 'dronebay') { // an open bay with an orbiting loader drone
      const bay = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.56), texturedMat(paint, circuitTexture('#3a4250', '#5ad2f2'), 0x3a4250, 0.6, 0.4));
      bay.position.set(-0.32, 1.04, 0); cargoG.add(bay);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshStandardMaterial({ map: plankTexture('#9a6e3a'), roughness: 0.85 }));
      crate.position.set(-0.32, 1.22, 0); cargoG.add(crate);
      const drone = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow(0x5ad2f2, 1.2)); cargoG.add(drone);
      animators.push(t => { drone.position.set(-0.32 + Math.cos(t * 2) * 0.32, 1.36 + Math.sin(t * 3) * 0.04, Math.sin(t * 2) * 0.32); });
    } else if (style === 'magrack') { // crates floating on humming mag-rails
      const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.56), texturedMat(paint, circuitTexture('#3a4250', '#6ad8f2'), 0x3a4250, 0.7, 0.3));
      cradle.position.set(-0.32, 1.0, 0); cargoG.add(cradle);
      const railMat = glow(0x6ad8f2, 1.0);
      for (const rz of [0.22, -0.22]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02), railMat);
        rail.position.set(-0.32, 1.03, rz); cargoG.add(rail);
      }
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.6, roughness: 0.35 });
      for (let i = 0; i < 3; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.34), crateMat);
        crate.position.set(-0.5 + i * 0.18, 1.2, 0); cargoG.add(crate);
        animators.push(t => { crate.position.y = 1.2 + Math.sin(t * 2 + i) * 0.03; });
      }
    } else if (style === 'armory') { // twin riveted strongboxes with combination dials
      const boxMat = texturedMat(paint, scaleTexture('#4a4e58', '#2d3038'), 0x4a4e58, 0.75, 0.3);
      const gold = goldMat();
      for (const az of [0.16, -0.16]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.24), boxMat);
        box.position.set(-0.32, 1.12, az); cargoG.add(box);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), gold);
        dial.rotation.x = Math.PI / 2; dial.position.set(-0.32, 1.12, az + (az > 0 ? 0.13 : -0.13)); cargoG.add(dial);
      }
    } else if (style === 'cooler') { // a frosted, vented cold-hold breathing mist
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.56), texturedMat(paint, crystalFractureTexture('#accfe2', '#6ad8f2'), 0xaccfe2, 0.5, 0.3));
      box.position.set(-0.32, 1.12, 0); cargoG.add(box);
      const ventMat = glow(0x6ad8f2, 0.8);
      for (const vz of [0.18, 0, -0.18]) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), ventMat);
        vent.position.set(-0.32, 1.0, vz); cargoG.add(vent);
      }
      const mist = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.56), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.18 }));
      mist.position.set(-0.32, 0.94, 0); cargoG.add(mist);
      animators.push(t => { mist.scale.y = 1 + Math.sin(t * 1.5) * 0.3; });
    } else if (style === 'galleon') { // a ship-deck cargo rig with a furled sail
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.5), texturedMat(paint, filigreeTexture('#6a4a30', '#c7993f'), 0x6a4a30, 0.4, 0.6));
      deck.position.set(-0.3, 1.06, 0); cargoG.add(deck);
      const hull2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), paintedMat(paint, 0x5a3a26, 0.4, 0.6));
      hull2.position.set(-0.3, 0.94, 0); cargoG.add(hull2);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7 }));
      mast.position.set(-0.3, 1.3, 0); cargoG.add(mast);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.36), mat(0xe8e2d2, { roughness: 0.8 }));
      sail.position.set(-0.3, 1.34, 0); cargoG.add(sail);
      animators.push(t => { sail.scale.z = 1 + Math.sin(t * 1.3) * 0.08; });
      const gold = goldMat();
      for (const cz of [0.2, -0.2]) {
        const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), gold);
        cleat.position.set(-0.3, 1.14, cz); cargoG.add(cleat);
      }
    } else if (style === 'hoard') { // an open chest brimming with glinting coin
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.5), texturedMat(paint, filigreeTexture('#5a3a26', '#f2c14e'), 0x5a3a26, 0.4, 0.6));
      chest.position.set(-0.32, 1.1, 0); cargoG.add(chest);
      const gold = goldMat();
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.52), gold);
      band.position.set(-0.32, 1.16, 0); cargoG.add(band);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), paintedMat(paint, 0x6a4a30, 0.4, 0.6));
      lid.position.set(-0.32, 1.28, -0.22); lid.rotation.x = -0.9; cargoG.add(lid);
      const coinMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.2, emissive: 0xf2a83a, emissiveIntensity: 0.3 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), coinMat);
        coin.position.set(-0.32 + Math.cos(a) * 0.14, 1.26 + (i % 3) * 0.02, Math.sin(a) * 0.14); coin.rotation.x = Math.PI / 2; cargoG.add(coin);
      }
      animators.push(t => { coinMat.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 4)) * 0.5; });
    } else if (style === 'dimensional') { // ULTRA — a folded-space cube, bigger inside than out
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44),
        texturedMat(paint, voidStarfieldTexture('#1a0a2a', '#9a6aff'), 0x1a0a2a, 0.3, 0.4));
      cube.material.transparent = true; cube.material.opacity = 0.5;
      cube.position.set(-0.32, 1.22, 0); cargoG.add(cube);
      const edges = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 4), glow(0xff6ab8, 1.5));
      edges.position.set(-0.32, 1.22, 0); edges.rotation.x = Math.PI / 2; cargoG.add(edges); spinners.push(edges);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const mote = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glow(0x6ad8f2, 1.2)); cargoG.add(mote);
        animators.push(t => { mote.position.set(-0.32 + Math.cos(a + t) * 0.14, 1.22 + Math.sin(t * 1.5 + i) * 0.1, Math.sin(a + t) * 0.14); mote.rotation.y = t + a; });
      }
    } else if (style === 'chronosvault') { // NEW ULTRA Chronos Paradox Vault
      const vaultMat = texturedMat(paint, filigreeTexture('#3a2c16', '#c9a24a'), 0x3a2c16, 0.8, 0.25);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.58), vaultMat);
      box.position.set(-0.34, 1.1, 0);
      const gold = goldMat();
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), gold);
      dial.rotation.x = Math.PI / 2; dial.position.set(-0.34, 1.1, 0.3);
      cargoG.add(box, dial);
      spinners.push(dial);
    } else if (style === 'gloomstomach') { // NEW ULTRA Gloomwyrm Maw Hold
      const sacMat = texturedMat(paint, scaleTexture('#301e25', '#8a2e4a'), 0x301e25, 0.1, 0.85);
      const sac = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 11), sacMat);
      sac.scale.set(1.1, 0.9, 1.1); sac.position.set(-0.32, 1.12, 0);
      const teethMat = new THREE.MeshStandardMaterial({ color: 0xeae8e2, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), teethMat);
        tooth.position.set(-0.2, 1.22, (i - 1.5) * 0.08); tooth.rotation.x = Math.PI;
        cargoG.add(tooth);
      }
      cargoG.add(sac);
      animators.push(t => { sac.scale.y = 0.9 + Math.sin(t * 1.8) * 0.05; });
    } else if (style === 'voidhold') { // NEW ULTRA Void Abyss Pocket
      const frameMat = texturedMat(paint, voidStarfieldTexture('#050114', '#9a6aff'), 0x050114, 0.4, 0.5);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 24), frameMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(-0.32, 1.1, 0);
      const portal = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), glow(0x9a5af2, 1.7));
      portal.position.set(-0.32, 1.1, 0);
      cargoG.add(ring, portal);
      spinners.push(ring);
    } else if (style === 'plasmacrate') { // NEW ULTRA Plasma-Shielded Rack
      const trayMat = texturedMat(paint, circuitTexture('#12151c', '#3ad2f2'), 0x12151c, 0.7, 0.3);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.56), trayMat);
      tray.position.set(-0.32, 1.0, 0); cargoG.add(tray);
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x222630, metalness: 0.6, roughness: 0.4 });
      for (const [cx, cy, cz] of [[-0.4, 1.1, 0.12], [-0.24, 1.1, -0.12]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.22), crateMat);
        crate.position.set(cx, cy, cz); cargoG.add(crate);
      }
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.58),
        mat(0x3ad2f2, { transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.8 }));
      shield.position.set(-0.32, 1.12, 0); cargoG.add(shield);
    } else if (style === 'crystalhoard') { // NEW ULTRA Crystal-Cluster Hold
      const geodeMat = texturedMat(paint, crystalFractureTexture('#2f2c3a', '#b66af2'), 0x2f2c3a, 0.5, 0.5);
      const geode = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2), geodeMat);
      geode.scale.set(1.1, 0.9, 1.1); geode.position.set(-0.32, 1.06, 0);
      const cryMat = mat(0xd86aff, { metalness: 0.4, roughness: 0.1, emissive: 0xb66af2, emissiveIntensity: 1.4 });
      for (let i = 0; i < 5; i++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), cryMat);
        shard.position.set(-0.32 + (Math.random() - 0.5) * 0.16, 1.12, (Math.random() - 0.5) * 0.16);
        shard.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
        cargoG.add(shard);
      }
      cargoG.add(geode);
    } else if (style === 'panniers') { // reinforced steel-ribbed saddle-panniers
      const bagMat = texturedMat(paint, scaleTexture('#5a4a36', '#2d241a'), 0x5a4a36, 0.3, 0.6);
      for (const side of [1, -1] as const) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.16), bagMat);
        bag.position.set(-0.12, chassis.coreY, side * flankZ); body.add(bag);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.18), DARK_TRIM());
        rib.position.set(-0.12, chassis.coreY + 0.08, side * flankZ); body.add(rib);
      }
    } else { // satchel — saddlebags on both flanks
      const bagMat = texturedMat(paint, scaleTexture('#7a5a36', '#3e2e1a'), 0x7a5a36, 0.1, 0.85);
      for (const side of [1, -1] as const) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.14), bagMat);
        bag.position.set(-0.15, chassis.coreY, side * flankZ);
        bag.rotation.x = side > 0 ? 0.12 : -0.12;
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.15), DARK_TRIM());
        flap.position.set(-0.15, chassis.coreY + 0.12, side * flankZ);
        body.add(bag, flap);
      }
    }
  }

  // ---------------- CANNON (top turret) ----------------
  {
    const style = partStyle('cannon', 'pop');
    const paint = paintFor('cannon');
    const turret = new THREE.Group();
    turret.position.set(chassis.cannonPos[0], chassis.cannonPos[1], chassis.cannonPos[2]);
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
    } else if (style === 'scatterpod') { // a fan of stubby barrels
      for (const oz of [0.1, 0, -0.1]) barrel(0.36, 0.035, oz);
    } else if (style === 'railspike') { // a magnetic rail spitting a glowing spike
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), baseMat);
      rail.rotation.z = -Math.PI / 2.5; rail.position.set(0.18, 0.26, 0); turret.add(rail);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), glow(0x6ad8f2, 1.4));
      spike.rotation.z = -Math.PI / 2.5; spike.position.set(0.36, 0.5, 0); turret.add(spike);
    } else if (style === 'flak') { // a quad of short barking flak tubes
      for (const ty of [0.34, 0.5]) for (const tz of [0.08, -0.08]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 7), baseMat);
        tube.rotation.z = -Math.PI / 2.5; tube.position.set(0.2, ty, tz); turret.add(tube);
      }
    } else if (style === 'plasma') { // a vented coil-lance building a hissing bolt
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), baseMat);
      coil.rotation.z = -Math.PI / 2.5; coil.position.set(0.2, 0.3, 0); turret.add(coil);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), glow(0x9a6aff, 1.2));
        ring.rotation.z = -Math.PI / 2.5; ring.position.set(0.1 + i * 0.12, 0.18 + i * 0.16, 0); turret.add(ring);
      }
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(0xc86aff, 1.6));
      bolt.position.set(0.4, 0.52, 0); turret.add(bolt);
      animators.push(t => { bolt.scale.setScalar(0.8 + Math.abs(Math.sin(t * 5)) * 0.5); });
    } else if (style === 'frostlance') { // a rimed barrel firing a shard of cold
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.56, 8), texturedMat(paint, crystalFractureTexture('#accfe2', '#ffffff'), 0xaccfe2, 0.6, 0.3));
      bar.rotation.z = -Math.PI / 2.5; bar.position.set(0.2, 0.32, 0); turret.add(bar);
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), glow(0x9ad8ff, 1.4));
      shard.rotation.z = -Math.PI / 2.5; shard.position.set(0.42, 0.54, 0); turret.add(shard);
      for (const d of [0.2, 0.36]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), mat(0xdff4ff, { roughness: 0.4 }));
        ring.rotation.z = -Math.PI / 2.5; ring.position.set(d * 0.9, 0.18 + d, 0); turret.add(ring);
      }
    } else if (style === 'siege') { // a short fat mortar that lobs over the rocks
      const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.34, 10), baseMat);
      mortar.rotation.z = -Math.PI / 3.5; mortar.position.set(0.12, 0.28, 0); turret.add(mortar);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 14), DARK_TRIM());
      muzzle.rotation.z = -Math.PI / 3.5; muzzle.position.set(0.24, 0.46, 0); turret.add(muzzle);
    } else if (style === 'arclance') { // a twin-prong lance leaping lightning
      const prongMat = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.85, roughness: 0.2 });
      for (const pz of [0.07, -0.07]) {
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 7), prongMat);
        prong.rotation.z = -Math.PI / 2.5; prong.position.set(0.2, 0.3, pz); turret.add(prong);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow(0x9ad8ff, 1.5));
        ball.position.set(0.38, 0.5, pz); turret.add(ball);
      }
      const am = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0 });
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 5), am);
      arc.position.set(0.38, 0.5, 0); arc.rotation.x = Math.PI / 2; turret.add(arc);
      animators.push(() => { am.opacity = Math.random() < 0.3 ? 0.85 : 0.05; });
    } else if (style === 'stormcaller') { // a six-tube Stormcall rocket cluster
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), baseMat);
      pod.rotation.z = -0.4; pod.position.set(0.12, 0.26, 0); turret.add(pod);
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.4 });
      for (const ty of [0.08, 0, -0.08]) for (const tz of [0.08, -0.08]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 7), tubeMat);
        tube.rotation.z = -0.4 - Math.PI / 2; tube.position.set(0.16 + ty * 0.4, 0.27 + ty, tz); turret.add(tube);
      }
    } else if (style === 'annihilator') { // ULTRA — a folded-sky siege gun haloed in pink fire
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 10), texturedMat(paint, voidStarfieldTexture('#2a1a2a', '#ff6ab8'), 0x2a1a2a, 0.5, 0.4));
      bar.rotation.z = -Math.PI / 2.5; bar.position.set(0.22, 0.34, 0); turret.add(bar);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 20), glow(0xff6ab8, 1.7));
      halo.rotation.z = -Math.PI / 2.5; halo.position.set(0.42, 0.56, 0); turret.add(halo); spinners.push(halo);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), glow(0xff9ad2, 1.6));
      muzzle.position.set(0.46, 0.6, 0); turret.add(muzzle);
      animators.push(t => { muzzle.scale.setScalar(0.85 + Math.abs(Math.sin(t * 4)) * 0.4); });
    } else if (style === 'chronoscannon') { // NEW ULTRA Chronos Tachyon Beam
      const bodyMat = texturedMat(paint, filigreeTexture('#3a2c16', '#c9a24a'), 0x3a2c16, 0.8, 0.25);
      const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.28, 8), bodyMat);
      frame.rotation.z = -Math.PI / 2.5; frame.position.set(0.18, 0.24, 0); turret.add(frame);
      const glassMat = mat(0xfff0c8, { transparent: true, opacity: 0.45, roughness: 0.1 });
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), glassMat);
      glass.rotation.z = -Math.PI / 2.5; glass.position.set(0.3, 0.38, 0); turret.add(glass);
      const sand = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 8), glow(0xf2c14e, 1.4));
      sand.rotation.z = -Math.PI / 2.5; sand.position.set(0.3, 0.38, 0); turret.add(sand);
    } else if (style === 'gloomspit') { // NEW ULTRA Gloomwyrm Acid Spitter
      const spitMat = texturedMat(paint, scaleTexture('#301e1e', '#8a2e2e'), 0x8a2e2e, 0.2, 0.8);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), spitMat);
      head.position.set(0.18, 0.26, 0); head.scale.set(1.4, 0.9, 0.9); turret.add(head);
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), spitMat);
      jaw.position.set(0.18, 0.16, 0); jaw.rotation.z = 0.4; turret.add(jaw);
      const slime = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0x6af28a, 1.5));
      slime.position.set(0.3, 0.22, 0); turret.add(slime);
      animators.push(t => { slime.scale.setScalar(0.85 + Math.sin(t * 4) * 0.25); });
    } else if (style === 'voidcannon') { // NEW ULTRA Void Ray Cannon
      const emitterMat = texturedMat(paint, voidStarfieldTexture('#050114', '#9a6aff'), 0x050114, 0.5, 0.4);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8), emitterMat);
      barrel.rotation.z = -Math.PI / 2.5; barrel.position.set(0.2, 0.32, 0); turret.add(barrel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 18), glow(0x9a6aff, 1.6));
      ring.rotation.z = -Math.PI / 2.5; ring.position.set(0.38, 0.54, 0); turret.add(ring);
      spinners.push(ring);
    } else if (style === 'plasmacannon') { // NEW ULTRA Hyper-Plasma Blaster
      const bodyMat = texturedMat(paint, circuitTexture('#12151c', '#3ad2f2'), 0x12151c, 0.7, 0.3);
      for (const pz of [0.06, -0.06]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), bodyMat);
        barrel.rotation.z = -Math.PI / 2.5; barrel.position.set(0.2, 0.32, pz); turret.add(barrel);
      }
      const energy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0x3ad2f2, 1.7));
      energy.position.set(0.42, 0.54, 0); turret.add(energy);
      animators.push(t => { energy.scale.setScalar(0.9 + Math.abs(Math.sin(t * 6)) * 0.4); });
    } else if (style === 'crystalbeam') { // NEW ULTRA Crystalline Prism Cannon
      const bodyMat = texturedMat(paint, crystalFractureTexture('#2f2c3a', '#b66af2'), 0x2f2c3a, 0.5, 0.5);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.42, 8), bodyMat);
      barrel.rotation.z = -Math.PI / 2.5; barrel.position.set(0.18, 0.28, 0); turret.add(barrel);
      const cryMat = mat(0xd86aff, { metalness: 0.3, roughness: 0.1, emissive: 0xb66af2, emissiveIntensity: 1.5 });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), cryMat);
      crystal.position.set(0.38, 0.5, 0); turret.add(crystal);
      spinners.push(crystal);
    } else {
      barrel(0.42, 0.04);
    }
  }

  // ---------------- SCANNER (rear mast) ----------------
  {
    const style = partStyle('scanner', 'tin');
    const paint = paintFor('scanner');
    const scannerTex =
      style === 'cosmic' || style === 'voidscanner' ? voidStarfieldTexture('#120a2a', '#9a6aff') :
      style === 'starchart' || style === 'seraphic' || style === 'spirit' || style === 'chronosscope' || style === 'oracle' || style === 'periscope' ? filigreeTexture('#3a2c16', '#c9a24a') :
      style === 'crystalprism' ? crystalFractureTexture('#2f2c3a', '#b66af2') :
      style === 'gloomeye' || style === 'owleye' || style === 'triowl' ? scaleTexture('#301e1e', '#8a2e2e') :
      circuitTexture('#2a2d36', '#5ad2f2'); // lidar, droneprobe, dish, tin, etc.
    const mastMat = texturedMat(paint, scannerTex, 0x2a2a35, 0.55, 0.5);

    // the scanner rides this group, which re-seats on the chassis' rear-top
    const scannerG = new THREE.Group();
    scannerG.position.set(chassis.scannerPos[0] + 0.32, chassis.scannerPos[1] - 1.2, chassis.scannerPos[2]);
    body.add(scannerG);
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
      scannerG.add(mast, dish, eye);
    } else if (style === 'oracle') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 6), mastMat);
      mast.position.set(-0.32, 1.24, 0);
      scannerG.add(mast);
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
      scannerG.add(orbiter);
    } else if (style === 'aethereye') { // levitating halo-ring of folded sky
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.32, 6), mastMat);
      post.position.set(-0.32, 1.18, 0);
      scannerG.add(post);
      const floater = new THREE.Group();
      floater.position.set(-0.32, 1.62, 0);
      const skyMat = new THREE.MeshStandardMaterial({ color: 0xc8b4f2, emissive: 0x7a8af2, emissiveIntensity: 1.5 });
      glowMats.push(skyMat);
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24), skyMat);
      outer.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 7, 20), skyMat);
      inner.rotation.x = Math.PI / 2.2;
      inner.rotation.z = 0.5;
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff9ad2, emissive: 0xff6ab8, emissiveIntensity: 1.8 });
      glowMats.push(coreMat);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), coreMat);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const mote = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), skyMat);
        mote.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
        floater.add(mote);
      }
      floater.add(outer, inner, core);
      spinners.push(floater);
      scannerG.add(floater);
    } else if (style === 'periscope') { // a crank-up brass periscope that swivels
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), mastMat);
      tube.position.set(-0.32, 1.2, 0); scannerG.add(tube);
      const pivot = new THREE.Group(); pivot.position.set(-0.32, 1.42, 0); scannerG.add(pivot);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), mastMat); head.position.set(0, 0, 0.03); pivot.add(head);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), glow(0xf2c14e, 1.2));
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.14); pivot.add(lens);
      spinners.push(pivot);
    } else if (style === 'dish') { // a slow-sweeping parabolic radar dish
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.45, 6), mastMat); mast.position.set(-0.32, 1.22, 0); scannerG.add(mast);
      const pivot = new THREE.Group(); pivot.position.set(-0.32, 1.46, 0); scannerG.add(pivot);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2.2), mastMat); dish.rotation.x = Math.PI / 2.4; pivot.add(dish);
      const feed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), glow(0x6ad8f2, 1.2)); feed.position.set(0, 0.1, 0.1); pivot.add(feed);
      spinners.push(pivot);
    } else if (style === 'lidar') { // a spinning ring of laser emitters
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6), mastMat); mast.position.set(-0.32, 1.2, 0); scannerG.add(mast);
      const ring = new THREE.Group(); ring.position.set(-0.32, 1.44, 0); scannerG.add(ring);
      const drumTex = circuitTexture('#3a3e48', '#5ad2f2');
      const drumMat = texturedMat(paint, drumTex, 0x3a3e48, 0.7, 0.3);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), drumMat); ring.add(drum);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const em = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), glow(0xff4a4a, 1.2));
        em.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); ring.add(em);
      }
      spinners.push(ring);
    } else if (style === 'droneprobe') { // a tethered recon drone bobbing above the mast
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), mastMat); mast.position.set(-0.32, 1.16, 0); scannerG.add(mast);
      const drone = new THREE.Group(); drone.position.set(-0.32, 1.5, 0); scannerG.add(drone);
      const dBodyTex = circuitTexture('#3a4250', '#6ad8f2');
      const dBodyMat = texturedMat(paint, dBodyTex, 0x3a4250, 0.6, 0.4);
      const dBody = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dBodyMat); drone.add(dBody);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow(0x6ad8f2, 1.4)); eye.position.set(0.06, 0, 0); drone.add(eye);
      for (const rz of [0.1, -0.1]) {
        const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.03), mastMat); rotor.position.set(0, 0.08, rz); drone.add(rotor);
        animators.push(t => { rotor.rotation.y = t * 12; });
      }
      animators.push(t => { drone.position.set(-0.32, 1.5 + Math.sin(t * 1.5) * 0.06, 0); drone.rotation.y = Math.sin(t * 0.6) * 0.5; });
    } else if (style === 'triowl') { // three owl-eye dishes on a slow carousel
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 6), mastMat); mast.position.set(-0.32, 1.24, 0); scannerG.add(mast);
      const carousel = new THREE.Group(); carousel.position.set(-0.32, 1.54, 0); scannerG.add(carousel);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mastMat);
        dish.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16); dish.rotation.x = Math.PI / 2.4; carousel.add(dish);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6), glow(0xf2c14e, 1.2));
        eye.position.set(Math.cos(a) * 0.16, 0.04, Math.sin(a) * 0.16); carousel.add(eye);
      }
      spinners.push(carousel);
    } else if (style === 'spirit') { // a floating witch-lantern leaning toward treasure
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), mastMat); post.position.set(-0.32, 1.18, 0); scannerG.add(post);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), mastMat); hook.position.set(-0.32, 1.36, 0); scannerG.add(hook);
      const lantern = new THREE.Group(); lantern.position.set(-0.32, 1.5, 0); scannerG.add(lantern);
      const cageMat = texturedMat(paint, filigreeTexture('#c9a24a', '#eae2d2'), 0xc9a24a, 0.85, 0.2);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 6), cageMat); lantern.add(cage);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0x6af2c4, 1.6)); lantern.add(flame);
      animators.push(t => { lantern.position.set(-0.32, 1.5 + Math.sin(t * 1.8) * 0.05, 0); flame.scale.y = 1 + Math.sin(t * 6) * 0.2; });
    } else if (style === 'starchart') { // a brass orrery mapping the floor like a constellation
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.46, 6), mastMat); mast.position.set(-0.32, 1.24, 0); scannerG.add(mast);
      const orrery = new THREE.Group(); orrery.position.set(-0.32, 1.56, 0); scannerG.add(orrery);
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(0xf2c14e, 1.6)); orrery.add(sun);
      const brassMat = texturedMat(paint, filigreeTexture('#c9a24a', '#5a421a'), 0xc9a24a, 0.8, 0.3);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.05, 0.008, 6, 22), brassMat);
        ring.rotation.x = Math.PI / 2 + i * 0.3; orrery.add(ring);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 6), glow(0x9ab4ff, 1.2)); orrery.add(moon);
        const rr = 0.1 + i * 0.05;
        animators.push(t => { const a = t * (1 + i * 0.5) + i; moon.position.set(Math.cos(a) * rr, Math.sin(i) * 0.02, Math.sin(a) * rr); });
      }
      spinners.push(orrery);
    } else if (style === 'seraphic') { // a ring of feather-light wings around an all-seeing eye
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), mastMat); post.position.set(-0.32, 1.18, 0); scannerG.add(post);
      const halo = new THREE.Group(); halo.position.set(-0.32, 1.56, 0); scannerG.add(halo);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), glow(0xfff0c8, 1.6)); halo.add(eye);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 24), glow(0xfff0c8, 1.2)); ring.rotation.x = Math.PI / 2; halo.add(ring);
      const featherTex = filigreeTexture('#f2ead0', '#eae2d2');
      const featherMat = texturedMat(paint, featherTex, 0xf2ead0, 0.3, 0.6);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), featherMat);
        f.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18); f.rotation.set(Math.PI / 2, 0, -a); halo.add(f);
      }
      spinners.push(halo);
    } else if (style === 'cosmic') { // ULTRA — a levitating galaxy-eye that simply knows
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.28, 6), mastMat); post.position.set(-0.32, 1.16, 0); scannerG.add(post);
      const galaxy = new THREE.Group(); galaxy.position.set(-0.32, 1.58, 0); scannerG.add(galaxy);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), glow(0xff6ab8, 1.9)); galaxy.add(eye);
      const armMat = glow(0x9a6aff, 1.3);
      for (let i = 0; i < 3; i++) {
        const arm = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 28, Math.PI * 1.3), armMat);
        arm.rotation.x = Math.PI / 2; arm.rotation.z = (i / 3) * Math.PI * 2; galaxy.add(arm);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const star = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), glow(0x9ad8ff, 1.4)); galaxy.add(star);
        const rr = 0.1 + (i % 3) * 0.05;
        animators.push(t => { const aa = a + t * 1.2; star.position.set(Math.cos(aa) * rr, Math.sin(t + i) * 0.03, Math.sin(aa) * rr); });
      }
      spinners.push(galaxy);
    } else if (style === 'chronosscope') { // NEW ULTRA Chronos Chronoscope
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.44, 8), mastMat); mast.position.set(-0.32, 1.22, 0); scannerG.add(mast);
      const faceGroup = new THREE.Group(); faceGroup.position.set(-0.32, 1.52, 0); scannerG.add(faceGroup);
      const rimMat = texturedMat(paint, filigreeTexture('#c9a24a', '#8a5a2e'), 0xc9a24a, 0.9, 0.2);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 6, 24), rimMat); rim.rotation.x = Math.PI / 2; faceGroup.add(rim);
      const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), rimMat); gear.rotation.x = Math.PI / 2; faceGroup.add(gear);
      const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.13, 0.016), glow(0xf2c14e, 1.2)); hand1.position.y = 0.06; faceGroup.add(hand1);
      const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), glow(0xf2c14e, 1.2)); hand2.position.y = 0.04; faceGroup.add(hand2);
      spinners.push(rim);
      animators.push(t => {
        gear.rotation.y = -t * 1.5;
        hand1.rotation.z = t * 2.5;
        hand2.rotation.z = t * 0.4;
      });
    } else if (style === 'gloomeye') { // NEW ULTRA Gloomwyrm All-Seeing Eye
      const stalkMat = texturedMat(paint, scaleTexture('#301e1e', '#8a2e2e'), 0x8a2e2e, 0.2, 0.8);
      const stalk = new THREE.Group(); stalk.position.set(-0.32, 1.0, 0); scannerG.add(stalk);
      const segs: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - i * 0.005, 0.045 - i * 0.005, 0.1, 8), stalkMat);
        seg.position.y = 0.09 * i;
        stalk.add(seg); segs.push(seg);
      }
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
      const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), eyeMat);
      eyeBall.position.set(-0.32, 1.5, 0); scannerG.add(eyeBall);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glow(0x6af28a, 1.5));
      pupil.position.set(-0.32, 1.5, 0.08); scannerG.add(pupil);
      const lidMat = stalkMat;
      const lidTop = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      lidTop.position.set(-0.32, 1.5, 0); lidTop.rotation.x = -Math.PI / 2.2; scannerG.add(lidTop);
      const lidBot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      lidBot.position.set(-0.32, 1.5, 0); lidBot.rotation.x = Math.PI / 2.2; scannerG.add(lidBot);
      animators.push(t => {
        segs.forEach((seg, i) => {
          seg.rotation.z = Math.sin(t * 2 + i * 0.8) * 0.08;
          seg.rotation.x = Math.cos(t * 1.5 + i * 0.8) * 0.08;
        });
        pupil.position.z = 0.08 * Math.cos(Math.sin(t * 1.2) * 0.3);
        pupil.position.x = -0.32 + Math.sin(t * 1.2) * 0.04;
        pupil.position.y = 1.5 + Math.cos(t * 1.8) * 0.03;
        const blink = Math.abs(Math.sin(t * 0.5)) > 0.95 ? 0 : 1;
        lidTop.rotation.x = -Math.PI / 2.2 - (1 - blink) * 0.5;
        lidBot.rotation.x = Math.PI / 2.2 + (1 - blink) * 0.5;
      });
    } else if (style === 'voidscanner') { // NEW ULTRA Void Rift Probe
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.34, 8), mastMat); post.position.set(-0.32, 1.18, 0); scannerG.add(post);
      const riftGroup = new THREE.Group(); riftGroup.position.set(-0.32, 1.54, 0); scannerG.add(riftGroup);
      const singularity = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), glow(0xff6ab8, 2.0)); riftGroup.add(singularity);
      const horizonMat = texturedMat(paint, voidStarfieldTexture('#050114', '#9a6aff'), 0x050114, 0.4, 0.4);
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20), horizonMat); ring1.rotation.x = Math.PI / 2; riftGroup.add(ring1);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 16), horizonMat); ring2.rotation.y = Math.PI / 2; riftGroup.add(ring2);
      spinners.push(ring1);
      animators.push(t => {
        ring2.rotation.x = t * 2.2;
        riftGroup.position.y = 1.54 + Math.sin(t * 2.0) * 0.04;
        singularity.scale.setScalar(0.9 + Math.abs(Math.sin(t * 4)) * 0.25);
      });
    } else if (style === 'plasmalidar') { // NEW ULTRA Plasma Sweep LIDAR
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.38, 8), mastMat); post.position.set(-0.32, 1.2, 0); scannerG.add(post);
      const scannerTexLocal = circuitTexture('#12151c', '#3ad2f2');
      const scannerMatLocal = texturedMat(paint, scannerTexLocal, 0x12151c, 0.75, 0.25);
      const ringGroup = new THREE.Group(); ringGroup.position.set(-0.32, 1.48, 0); scannerG.add(ringGroup);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 24), glow(0x3ad2f2, 1.6)); ring.rotation.x = Math.PI / 2; ringGroup.add(ring);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), scannerMatLocal); ringGroup.add(drum);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.04), scannerMatLocal);
        wing.position.set(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15);
        wing.rotation.y = -a;
        ringGroup.add(wing);
      }
      spinners.push(ringGroup);
      animators.push(t => {
        ringGroup.position.y = 1.48 + Math.sin(t * 3.5) * 0.02;
      });
    } else if (style === 'crystalprism') { // NEW ULTRA Crystalline Refractor
      const baseSpikes = new THREE.Group(); baseSpikes.position.set(-0.32, 1.16, 0); scannerG.add(baseSpikes);
      const cryMat = mat(0xd86aff, { metalness: 0.3, roughness: 0.1, emissive: 0xb66af2, emissiveIntensity: 1.5 });
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), cryMat);
        spike.position.set(Math.cos(i * Math.PI/2) * 0.06, 0.06, Math.sin(i * Math.PI/2) * 0.06);
        spike.rotation.set(0.2, i * Math.PI/2, 0);
        baseSpikes.add(spike);
      }
      const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), cryMat);
      prism.position.set(-0.32, 1.48, 0); scannerG.add(prism);
      const satGroup = new THREE.Group(); satGroup.position.set(-0.32, 1.48, 0); scannerG.add(satGroup);
      const satellites: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const sat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), cryMat);
        satGroup.add(sat); satellites.push(sat);
      }
      spinners.push(prism);
      animators.push(t => {
        prism.position.y = 1.48 + Math.sin(t * 1.5) * 0.04;
        satGroup.position.y = prism.position.y;
        satGroup.rotation.y = t * 1.8;
        satellites.forEach((sat, i) => {
          const a = (i / 3) * Math.PI * 2;
          sat.position.set(Math.cos(a) * 0.22, Math.sin(t * 3 + i) * 0.02, Math.sin(a) * 0.22);
          sat.rotation.set(t, t * 1.5, 0);
        });
      });
    } else { // tin whip antenna
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), mastMat);
      ant.position.set(-0.3, 1.22, 0);
      const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 0.8 });
      glowMats.push(tipMat);
      const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), tipMat);
      antTip.position.set(-0.3, 1.5, 0);
      antTip.name = 'beacon';
      scannerG.add(ant, antTip);
    }
  }

  // ---------------- LEGS / WHEELS / TREADS / HOVER — the stride ----------------
  {
    const style = partStyle('legs', 'scuttler');
    const paint = paintFor('legs');

    interface LegCfg {
      rows: number; legMat: THREE.MeshStandardMaterial;
      kneeMat: THREE.MeshStandardMaterial; footMat: THREE.MeshStandardMaterial;
      thighLen?: number; shinLen?: number; thighDeg?: number; kneeDeg?: number; thighRad?: number;
      foot?: 'cone' | 'claw' | 'pad';
      accent?: 'none' | 'plate' | 'piston' | 'wing' | 'halo';
      accentMat?: THREE.MeshStandardMaterial; faceted?: boolean; blade?: boolean;
      swingAmt?: number; liftAmt?: number; gait?: 'tripod' | 'wave';
      // Custom visual and behavioral features:
      raptorClaw?: boolean;
      varyRows?: boolean;
      floatingCrystal?: boolean;
      isSkates?: boolean;
      isRoyalGuard?: boolean;
      isWings?: boolean;
      isClockwork?: boolean;
      isMonster?: boolean;
    }
    // The shared articulated-leg builder. Every legged style routes through this,
    // so the gait stays consistent while the silhouette and accents differ.
    const addLegs = (cfg: LegCfg) => {
      const xs = (CRAWLER_ROW_X[cfg.rows] ?? CRAWLER_ROW_X[2]).map(x => x * chassis.lenScale);
      let li = 0;
      for (const lx of xs) {
        const rowScale = cfg.varyRows ? (1.35 - (li / cfg.rows) * 0.45) : 1.0;
        const thighLen = (cfg.thighLen ?? 0.42) * rowScale;
        const shinLen = (cfg.shinLen ?? 0.8) * rowScale;
        const thighRad = (cfg.thighRad ?? 0.05) * (cfg.varyRows ? (1.1 - (li / cfg.rows) * 0.2) : 1.0);
        const swingAmt = cfg.swingAmt ?? 0.34;
        const liftAmt = cfg.liftAmt ?? 0.38;

        for (const side of [1, -1] as const) {
          const hip = new THREE.Group();
          hip.position.set(lx, chassis.hipY, side * chassis.hipZ);
          const baseYaw = (lx > 0.05 ? 0.45 : lx < -0.05 ? -0.45 : 0) * side;
          hip.rotation.y = baseYaw;
          g.add(hip);

          // custom: Seraph wings override
          if (cfg.isWings) {
            const wingGroup = new THREE.Group();
            hip.add(wingGroup);
            const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, thighLen + shinLen, 6), cfg.legMat);
            bone.rotation.z = Math.PI / 2;
            bone.position.set(0, 0, side * (thighLen + shinLen) * 0.4);
            wingGroup.add(bone);

            for (let f = 0; f < 5; f++) {
              const feather = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.45 - f * 0.07, 4), cfg.accentMat ?? cfg.kneeMat);
              feather.position.set(0, -0.08 - f * 0.04, side * (0.08 + f * 0.12));
              feather.rotation.set(side * 0.35, 0, -side * (0.15 + f * 0.18));
              wingGroup.add(feather);
            }

            animators.push((t, move) => {
              const speedFactor = 1.0 + move * 2.2;
              const flap = Math.sin(t * 5.5 * speedFactor + lx * 2.5) * 0.38;
              wingGroup.rotation.z = side * flap;
              wingGroup.rotation.x = side * 0.15 + Math.cos(t * 2.5) * 0.04;
            });
            legs.push({ hip, knee: wingGroup, baseYaw, kneeBase: 0, phase: 0, side, swingAmt: 0, liftAmt: 0 });
            continue;
          }

          // custom: Skates override
          if (cfg.isSkates) {
            const thighGeo = new THREE.CylinderGeometry(thighRad, thighRad * 1.15, thighLen, 6);
            thighGeo.translate(0, thighLen / 2, 0);
            const thigh = new THREE.Mesh(thighGeo, cfg.legMat);
            const thighTilt = side * (Math.PI * (cfg.thighDeg ?? 48) / 180);
            thigh.rotation.x = thighTilt;
            hip.add(thigh);

            const kneePos = new THREE.Vector3(0, Math.cos(thighTilt) * thighLen, Math.sin(thighTilt) * thighLen);
            const knee = new THREE.Group(); knee.position.copy(kneePos); hip.add(knee);
            knee.add(new THREE.Mesh(new THREE.SphereGeometry(thighRad * 1.35, 8, 6), cfg.kneeMat));

            const shinGeo = new THREE.CylinderGeometry(thighRad * 0.7, thighRad * 0.95, shinLen, 6);
            shinGeo.translate(0, shinLen / 2, 0);
            const shin = new THREE.Mesh(shinGeo, cfg.legMat);
            const kneeBase = side * (Math.PI * (cfg.kneeDeg ?? 142) / 180);
            const shinPivot = new THREE.Group(); shinPivot.rotation.x = kneeBase; shinPivot.add(shin); knee.add(shinPivot);

            const ski = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.54), cfg.footMat);
            ski.position.set(0, shinLen, 0.08);
            ski.rotation.x = Math.PI;
            shin.add(ski);

            const glowPad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.28), glow(0x7a8af2, 1.5));
            glowPad.position.set(0, shinLen + 0.015, 0.08);
            glowPad.rotation.x = Math.PI;
            shin.add(glowPad);

            const phase = (li / cfg.rows) * Math.PI * 2 + (side > 0 ? 0 : Math.PI);
            animators.push((t, move) => {
              const slide = Math.sin(t * 3.8 + phase) * 0.24 * move;
              hip.rotation.y = baseYaw + slide;
              hip.position.y = chassis.hipY + Math.sin(t * 2.2 + phase) * 0.018 * move;
            });
            legs.push({ hip, knee: shinPivot, baseYaw, kneeBase, phase, side, swingAmt: 0, liftAmt: 0 });
            continue;
          }

          // custom: Royal Guard hip gear
          let gear: THREE.Mesh | null = null;
          if (cfg.isRoyalGuard) {
            const gearGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12);
            gear = new THREE.Mesh(gearGeo, cfg.kneeMat);
            gear.rotation.x = Math.PI / 2;
            gear.position.set(0, 0, 0);
            hip.add(gear);
          }

          const thighGeo = new THREE.CylinderGeometry(thighRad * (cfg.isMonster ? 1.4 : 0.85), thighRad * (cfg.isMonster ? 1.75 : 1.1), thighLen, cfg.faceted ? 4 : 6);
          thighGeo.translate(0, thighLen / 2, 0);
          const thigh = new THREE.Mesh(thighGeo, cfg.legMat);
          const thighTilt = side * (Math.PI * (cfg.thighDeg ?? 55) / 180);
          thigh.rotation.x = thighTilt;
          hip.add(thigh);

          // custom: Monster thigh spikes
          if (cfg.isMonster) {
            for (let s = 0; s < 3; s++) {
              const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.15, 4), cfg.kneeMat);
              spike.position.set(side * 0.05, thighLen * (0.2 + s * 0.3), 0);
              spike.rotation.z = -side * 0.55;
              thigh.add(spike);
            }
          }

          if (cfg.accent === 'plate') {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, thighLen * 0.7, 0.13), cfg.accentMat ?? cfg.legMat);
            plate.position.set(0, thighLen * 0.4, side * 0.05); thigh.add(plate);
          } else if (cfg.accent === 'piston') {
            const pis = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, thighLen * 0.7, 6), cfg.accentMat ?? DARK_TRIM());
            pis.position.set(0.07, thighLen * 0.35, 0); thigh.add(pis);
          } else if (cfg.accent === 'wing') {
            const wing = new THREE.Mesh(new THREE.ConeGeometry(0.14, thighLen, 4), cfg.accentMat ?? cfg.legMat);
            wing.scale.set(1, 1, 0.25); wing.position.set(0, thighLen * 0.5, side * 0.08); thigh.add(wing);
          }

          const kneePos = new THREE.Vector3(0, Math.cos(thighTilt) * thighLen, Math.sin(thighTilt) * thighLen);
          const knee = new THREE.Group(); knee.position.copy(kneePos); hip.add(knee);

          // custom: Floating crystal joint
          let floatingGem: THREE.Mesh | null = null;
          if (cfg.floatingCrystal) {
            const ringMat = texturedMat(paint, filigreeTexture('#c9a24a', '#8a5a2e'), 0xc9a24a, 0.8, 0.3);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 12), ringMat);
            ring.rotation.y = Math.PI / 2;
            knee.add(ring);
            floatingGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), cfg.kneeMat);
            knee.add(floatingGem);
          } else {
            knee.add(new THREE.Mesh(new THREE.SphereGeometry(thighRad * 1.3, 8, 6), cfg.kneeMat));
            if (cfg.accent === 'halo') {
              const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14), cfg.accentMat ?? cfg.kneeMat);
              ring.rotation.x = Math.PI / 2; knee.add(ring);
            }
          }

          const shinGeo = new THREE.CylinderGeometry(thighRad * (cfg.isMonster ? 0.95 : 0.6), thighRad * (cfg.isMonster ? 1.25 : 0.9), shinLen, cfg.blade ? 4 : 6);
          shinGeo.translate(0, shinLen / 2, 0);
          const shin = new THREE.Mesh(shinGeo, cfg.legMat);
          if (cfg.blade) shin.scale.set(1, 1, 0.35);
          const kneeBase = side * (Math.PI * (cfg.kneeDeg ?? 168) / 180);
          const shinPivot = new THREE.Group(); shinPivot.rotation.x = kneeBase; shinPivot.add(shin); knee.add(shinPivot);

          // custom: Monster shin spikes
          if (cfg.isMonster) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.11, 4), cfg.kneeMat);
            spike.position.set(-side * 0.04, shinLen * 0.5, 0);
            spike.rotation.z = side * 0.75;
            shin.add(spike);
          }

          // Build foot
          let foot: THREE.Mesh;
          if (cfg.raptorClaw) {
            const footG = new THREE.Group();
            const mainClaw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), cfg.footMat);
            mainClaw.position.set(0, shinLen, 0.05); mainClaw.rotation.x = Math.PI + 0.3; footG.add(mainClaw);
            const sideClaw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), cfg.footMat);
            sideClaw.position.set(0.03, shinLen, 0.04); sideClaw.rotation.set(Math.PI + 0.3, 0, 0.3); footG.add(sideClaw);
            const backSpur = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), cfg.footMat);
            backSpur.position.set(0, shinLen, -0.06); backSpur.rotation.x = Math.PI - 0.4; footG.add(backSpur);
            foot = footG as any;
          } else {
            foot = cfg.foot === 'pad' ? new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), cfg.footMat)
              : cfg.foot === 'claw' ? new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), cfg.footMat)
              : new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), cfg.footMat);
            foot.position.y = shinLen; foot.rotation.x = Math.PI;
          }
          shin.add(foot);

          const phase = cfg.gait === 'wave'
            ? (li / cfg.rows) * Math.PI * 2 + (side > 0 ? 0 : Math.PI * 0.5)
            : ((li + (side > 0 ? 0 : 1)) % 2) * Math.PI;
          legs.push({ hip, knee: shinPivot, baseYaw, kneeBase, phase, side, swingAmt, liftAmt });

          if (floatingGem) {
            const localPhase = phase;
            animators.push(t => {
              floatingGem!.position.y = Math.sin(t * 3.8 + localPhase) * 0.022;
              floatingGem!.rotation.y = t * 2.0;
              floatingGem!.rotation.x = t * 1.0;
            });
          }
          if (gear) {
            const localSide = side;
            animators.push((t, move) => {
              gear!.rotation.y = localSide * t * 3.5 * move;
            });
          }
          if (cfg.isClockwork) {
            const localPhase = phase;
            const localSide = side;
            animators.push((t, move) => {
              const tickT = Math.floor(t * 4.5) + Math.pow((t * 4.5) % 1, 5.0);
              const swing = Math.sin(tickT * 0.65 + localPhase) * swingAmt * move;
              hip.rotation.y = baseYaw + swing;
              const lift = Math.max(0, Math.sin(tickT * 0.65 + localPhase + Math.PI / 2)) * liftAmt * move;
              shinPivot.rotation.x = kneeBase - lift * localSide;
            });
            const registeredLeg = legs[legs.length - 1];
            registeredLeg.swingAmt = 0;
            registeredLeg.liftAmt = 0;
          }
        }
        li++;
      }
    };

    // Powered wheels — roll in proportion to movement.
    const addWheels = (rows: number, radius: number) => {
      const xs = (CRAWLER_ROW_X[rows] ?? CRAWLER_ROW_X[2]).map(x => x * chassis.lenScale * 1.05);
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.85, metalness: 0.1 });
      const hubTex = circuitTexture('#8a93a8', '#2a2d36');
      const hubMat = texturedMat(paint, hubTex, 0x8a93a8, 0.7, 0.35);
      const halfW = chassis.hipZ + 0.14;
      for (const lx of xs) for (const side of [1, -1] as const) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), hubMat);
        arm.position.set(lx, chassis.hipY - 0.06, side * (halfW - 0.14)); g.add(arm);
        const pivot = new THREE.Group(); pivot.position.set(lx, radius, side * halfW); g.add(pivot);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.16, 16), tireMat); tire.rotation.x = Math.PI / 2; pivot.add(tire);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const nub = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.18), tireMat);
          nub.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0); nub.rotation.z = a; pivot.add(nub);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), hubMat); hub.rotation.x = Math.PI / 2; pivot.add(hub);
        animators.push((_t, m, dt) => { pivot.rotation.z -= dt * (0.4 + m * 11); });
      }
    };

    // Twin tank treads with cleats that scroll around a stadium loop.
    const addTreads = () => {
      const beltTex = circuitTexture('#23262e', '#14161e');
      const beltMat = texturedMat(paint, beltTex, 0x23262e, 0.2, 0.8);
      const wheelTex = scaleTexture('#5a626e', '#2a2d36');
      const wheelMat = texturedMat(paint, wheelTex, 0x5a626e, 0.7, 0.35);
      const len = 1.3 * chassis.lenScale, hh = 0.26;
      for (const side of [1, -1] as const) {
        const tz = side * (chassis.hipZ + 0.18);
        const frame = new THREE.Group(); frame.position.set(0, hh, tz); g.add(frame);
        for (const wx of [-len * 0.42, -len * 0.14, len * 0.14, len * 0.42]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(hh * 0.8, hh * 0.8, 0.18, 12), wheelMat);
          w.rotation.x = Math.PI / 2; w.position.set(wx, 0, 0); frame.add(w);
        }
        frame.add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.24), beltMat).translateY(hh * 0.92));
        frame.add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.24), beltMat).translateY(-hh * 0.92));
        const cleats: THREE.Mesh[] = [];
        const N = 18, straight = len, semi = Math.PI * hh, total = 2 * straight + 2 * semi;
        const place = (c: THREE.Mesh, s: number) => {
          const d = s * total; let x: number, y: number;
          if (d < straight) { x = -len / 2 + d; y = hh; }
          else if (d < straight + semi) { const a = (d - straight) / semi * Math.PI; x = len / 2 + Math.sin(a) * hh; y = hh * Math.cos(a); }
          else if (d < 2 * straight + semi) { x = len / 2 - (d - straight - semi); y = -hh; }
          else { const a = (d - 2 * straight - semi) / semi * Math.PI; x = -len / 2 - Math.sin(a) * hh; y = -hh * Math.cos(a); }
          c.position.set(x, y, 0);
        };
        for (let i = 0; i < N; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.26), beltMat); frame.add(c); place(c, i / N); cleats.push(c); }
        animators.push(t => { const off = (t * 0.05) % 1; cleats.forEach((c, i) => place(c, ((i / N) + off + 1) % 1)); });
      }
    };

    // Anti-grav thruster pads — no legs, just a glowing glide.
    const addHoverPads = (col: number) => {
      const padTex = circuitTexture('#2a3550', '#182030');
      const padMat = texturedMat(paint, padTex, 0x2a3550, 0.6, 0.4);
      const glowM = glow(col, 1.6);
      for (const lx of CRAWLER_ROW_X[2].map(x => x * chassis.lenScale * 1.1)) for (const side of [1, -1] as const) {
        const pad = new THREE.Group(); pad.position.set(lx, 0.34, side * (chassis.hipZ + 0.06)); g.add(pad);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 18), glowM); ring.rotation.x = Math.PI / 2; pad.add(ring);
        pad.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.05, 16), padMat));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
        cone.position.y = -0.18; cone.rotation.x = Math.PI; pad.add(cone);
        animators.push((t, _m, dt) => { pad.position.y = 0.34 + Math.sin(t * 1.6 + lx * 3) * 0.04; ring.rotation.z += dt * 2; });
      }
    };

    // Maglev spinning orbs.
    const addOrbiters = () => {
      const orbMat = glow(0x9a6aff, 1.5);
      const ringTex = filigreeTexture('#d8d2e8', '#9a6aff');
      const ringMat = texturedMat(paint, ringTex, 0xd8d2e8, 0.7, 0.3);
      for (const lx of CRAWLER_ROW_X[2].map(x => x * chassis.lenScale)) for (const side of [1, -1] as const) {
        const orbG = new THREE.Group(); orbG.position.set(lx, 0.3, side * (chassis.hipZ + 0.08)); g.add(orbG);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), orbMat); orbG.add(orb); spinners.push(orb);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 7, 20), ringMat); ring.rotation.x = Math.PI / 2.2; orbG.add(ring);
        animators.push((t, _m, dt) => { orbG.position.y = 0.3 + Math.sin(t * 1.4 + lx * 4) * 0.03; ring.rotation.z += dt * 1.5; });
      }
    };

    // NEW ULTRA: Void slithering tentacles
    const addVoidTentacles = () => {
      const tenTex = voidStarfieldTexture('#050114', '#9a6aff');
      const tenMat = texturedMat(paint, tenTex, 0x050114, 0.4, 0.4);
      const glowM = glow(0x9a6aff, 1.5);
      const xs = CRAWLER_ROW_X[4].map(x => x * chassis.lenScale);
      let ti = 0;
      for (const lx of xs) {
        for (const side of [1, -1] as const) {
          const tentacle = new THREE.Group();
          tentacle.position.set(lx, chassis.hipY, side * chassis.hipZ);
          g.add(tentacle);

          const links: THREE.Mesh[] = [];
          const N_LINKS = 6;
          for (let j = 0; j < N_LINKS; j++) {
            const size = 0.08 - j * 0.008;
            const link = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), j === 0 ? tenMat : (j % 2 === 0 ? tenMat : glowM));
            link.position.set(0, -j * 0.12, side * j * 0.1);
            tentacle.add(link);
            links.push(link);
          }

          const phase = (ti / 4) * Math.PI * 2 + (side > 0 ? 0 : Math.PI);
          animators.push((t, move) => {
            const speed = 1.0 + move * 2.5;
            links.forEach((link, idx) => {
              link.position.x = Math.sin(t * 4 * speed + idx * 0.6 + phase) * 0.04 * move;
              link.position.y = -idx * 0.12 + Math.cos(t * 3 * speed + idx * 0.6 + phase) * 0.03 * move;
            });
            tentacle.rotation.y = Math.sin(t * 2 + phase) * 0.2 * move;
          });
        }
        ti++;
      }
    };

    // NEW ULTRA: Gelatinous Slime Drag
    const addJellatin = (col: number) => {
      const slugTex = scaleTexture('#1a3024', '#2e8a5a');
      const slugMat = texturedMat(paint, slugTex, 0x1a3024, 0.2, 0.85);
      const slugG = new THREE.Group();
      slugG.position.set(0, 0.15, 0);
      g.add(slugG);

      const bodyGeo = new THREE.BoxGeometry(1.6 * chassis.lenScale, 0.26, 0.7);
      const mainSlug = new THREE.Mesh(bodyGeo, slugMat);
      slugG.add(mainSlug);

      const slimeTrail = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9 * chassis.lenScale, 0.75),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      slimeTrail.rotation.x = Math.PI / 2;
      slimeTrail.position.y = -0.13;
      slugG.add(slimeTrail);

      animators.push((t, move) => {
        mainSlug.scale.y = 1.0 + Math.sin(t * 4.0) * 0.12 * move;
        mainSlug.scale.x = 1.0 + Math.cos(t * 4.0) * 0.08 * move;
        mainSlug.position.y = Math.sin(t * 4.0) * 0.04 * move;
        body.rotation.z += Math.sin(t * 2.2) * 0.04 * move - move * 0.06;
      });
    };

    const dark = (c: number) => paintedMat(paint, c, 0.6, 0.45);

    if (style === 'arachno') {
      const mTex = scaleTexture('#2a2a35', '#16161d');
      const m = texturedMat(paint, mTex, 0x2a2a35, 0.6, 0.45);
      addLegs({ rows: 3, legMat: m, kneeMat: m, footMat: DARK_TRIM(), accent: 'plate', accentMat: m });
    } else if (style === 'sovereign') {
      const mTex = filigreeTexture('#3a3444', '#c9a24a');
      const m = texturedMat(paint, mTex, 0x3a3444, 0.8, 0.2);
      addLegs({ rows: 4, legMat: m, kneeMat: goldMat(), footMat: goldMat(), varyRows: true });
    } else if (style === 'aetherdrift') {
      const mTex = voidStarfieldTexture('#2e2a40', '#7a8af2');
      const m = texturedMat(paint, mTex, 0x2e2a40, 0.75, 0.25);
      const j = glow(0x7a8af2, 1.3);
      addLegs({ rows: 2, legMat: m, kneeMat: j, footMat: j, isSkates: true });
    } else if (style === 'mantis') {
      const mTex = scaleTexture('#2a4a32', '#6af28a');
      const m = texturedMat(paint, mTex, 0x2a4a32, 0.5, 0.5);
      const j = glow(0x6af28a, 1.0);
      addLegs({ rows: 3, legMat: m, kneeMat: j, footMat: m, blade: true, foot: 'claw', thighDeg: 60, swingAmt: 0.42, liftAmt: 0.46 });
    } else if (style === 'raptor') {
      const mTex = scaleTexture('#3a2e26', '#f2843a');
      const m = texturedMat(paint, mTex, 0x3a2e26, 0.55, 0.45);
      const j = glow(0xf2843a, 1.0);
      addLegs({ rows: 2, legMat: m, kneeMat: j, footMat: m, raptorClaw: true, shinLen: 0.9, thighDeg: 50, swingAmt: 0.5, liftAmt: 0.52 });
    } else if (style === 'titan') {
      const mTex = circuitTexture('#4a4e58', '#8a93a8');
      const m = texturedMat(paint, mTex, 0x4a4e58, 0.7, 0.3);
      const p = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.3 });
      addLegs({ rows: 2, legMat: m, kneeMat: m, footMat: DARK_TRIM(), accent: 'piston', accentMat: p, foot: 'pad', thighLen: 0.5, shinLen: 0.9, thighRad: 0.08, swingAmt: 0.2, liftAmt: 0.22 });
    } else if (style === 'centipede') {
      const mTex = scaleTexture('#3a2a3a', '#5a3a5a');
      const m = texturedMat(paint, mTex, 0x3a2a3a, 0.45, 0.55);
      addLegs({ rows: 5, legMat: m, kneeMat: m, footMat: DARK_TRIM(), thighLen: 0.3, shinLen: 0.55, thighRad: 0.04, gait: 'wave', swingAmt: 0.3, liftAmt: 0.3 });
    } else if (style === 'crystal') {
      const m = mat(0x9ab4f2, { metalness: 0.4, roughness: 0.15, emissive: 0x3a4a9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
      const j = glow(0x9ab4f2, 1.2);
      addLegs({ rows: 4, legMat: m, kneeMat: j, footMat: j, floatingCrystal: true, faceted: true, foot: 'claw', swingAmt: 0.3, liftAmt: 0.36 });
    } else if (style === 'royalguard') {
      const mTex = filigreeTexture('#eae2d2', '#c9a24a');
      const gld = texturedMat(paint, mTex, 0xc9a24a, 0.9, 0.15);
      addLegs({ rows: 4, legMat: gld, kneeMat: gld, footMat: gld, isRoyalGuard: true, swingAmt: 0.3, liftAmt: 0.34 });
    } else if (style === 'seraph') {
      const mTex = filigreeTexture('#3a3450', '#ff9ad2');
      const m = texturedMat(paint, mTex, 0x3a3450, 0.65, 0.35);
      const j = glow(0xff9ad2, 1.4);
      addLegs({ rows: 4, legMat: m, kneeMat: j, footMat: j, isWings: true });
    } else if (style === 'clockwork') { // NEW ULTRA
      const mTex = filigreeTexture('#3a2c16', '#c9a24a');
      const m = texturedMat(paint, mTex, 0x3a2c16, 0.8, 0.25);
      const j = glow(0xf2c14e, 1.2);
      addLegs({ rows: 2, legMat: m, kneeMat: j, footMat: j, isClockwork: true, swingAmt: 0.35, liftAmt: 0.4 });
    } else if (style === 'monster') { // NEW ULTRA
      const mTex = scaleTexture('#301e1e', '#8a2e2e');
      const m = texturedMat(paint, mTex, 0x301e1e, 0.3, 0.7);
      const j = glow(0x6af28a, 1.3);
      addLegs({ rows: 3, legMat: m, kneeMat: j, footMat: m, isMonster: true, foot: 'claw', swingAmt: 0.38, liftAmt: 0.42 });
    } else if (style === 'voidtentacles') { // NEW ULTRA
      addVoidTentacles();
    } else if (style === 'jellatin') { // NEW ULTRA
      addJellatin(0x6af2c4);
    } else if (style === 'reaper') { // NEW ULTRA
      const mTex = crystalFractureTexture('#121216', '#3a3a45');
      const m = texturedMat(paint, mTex, 0x121216, 0.8, 0.15);
      const j = glow(0xd86aff, 1.4);
      addLegs({ rows: 4, legMat: m, kneeMat: j, footMat: j, blade: true, foot: 'claw', thighLen: 0.35, shinLen: 0.9, swingAmt: 0.4, liftAmt: 0.44 });
    } else if (style === 'wheeler') {
      addWheels(2, 0.32);
    } else if (style === 'hexwheel') {
      addWheels(3, 0.28);
    } else if (style === 'tread') {
      addTreads();
    } else if (style === 'hover') {
      addHoverPads(0x5ad2ff);
    } else if (style === 'orbiter') {
      addOrbiters();
    } else { // scuttler
      const mTex = scaleTexture('#2a2a35', '#16161d');
      const m = texturedMat(paint, mTex, 0x2a2a35, 0.6, 0.45);
      addLegs({ rows: 2, legMat: m, kneeMat: m, footMat: DARK_TRIM() });
    }
  }

  g.scale.setScalar(chassis.scale);
  g.traverse(o => { o.castShadow = true; });

  const rig: CrawlerRig = {
    group: root, body, legs, spinners, glowMats, animators,
    lastPos: root.position.clone(), lastYaw: root.rotation.y,
    t: Math.random() * 10, move: 0, bodyBaseY: 0,
  };
  crawlerRigs.add(rig);
  root.userData.crawlerRig = true;
  return root;
}

/** Crawl, turn, breathe, and run every part's bespoke animator. Driven from updateRigs(). */
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
      const swing = Math.sin(r.t + leg.phase) * leg.swingAmt * r.move;
      leg.hip.rotation.y = leg.baseYaw + swing;
      const lift = Math.max(0, Math.sin(r.t + leg.phase + Math.PI / 2)) * leg.liftAmt * r.move;
      leg.knee.rotation.x = leg.kneeBase - lift * leg.side;
    }
    // body: idle breath + walking bob
    r.body.position.y = r.bodyBaseY + Math.sin(r.t * 0.7) * 0.012 + Math.abs(Math.sin(r.t)) * 0.035 * r.move;
    r.body.rotation.z = Math.sin(r.t * 0.5) * 0.01 + r.move * 0.02;
    for (const sp of r.spinners) sp.rotation.y += dt * (1.6 + r.move * 4);
    const pulse = 0.8 + Math.sin(r.t * 2.2) * 0.25;
    for (const m of r.glowMats) m.emissiveIntensity = pulse;
    for (const a of r.animators) a(r.t, r.move, dt);
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
let _renderer: THREE.WebGLRenderer | null = null;
/** The one live renderer (set by makeRenderer). Battle scenes need it to pre-compile shaders. */
export function getRenderer(): THREE.WebGLRenderer | null { return _renderer; }

export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // AA is decided once, here — it can't be toggled without recreating the GL
  // context, so it's keyed off the detected tier. Pixel ratio / shadows are
  // owned by the perf governor and retuned live via perf.attachRenderer().
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: perf.wantAA(),
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Shadows are refreshed on a cadence (see the frame loop), not every frame —
  // the city scenes are near-static, so a per-frame shadow re-render is wasted.
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  perf.attachRenderer(renderer); // sets pixelRatio + shadows from the current quality level
  _renderer = renderer;
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
  c.height = 128;
  let ctx = c.getContext('2d')!;
  ctx.font = 'bold 64px Trebuchet MS';
  c.width = Math.max(256, Math.ceil(ctx.measureText(text).width) + 48); // fit long text (no clipping)
  ctx = c.getContext('2d')!;
  ctx.font = 'bold 64px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8; ctx.strokeStyle = '#000';
  ctx.strokeText(text, c.width / 2, 80);
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const sw = 1.6 * scale * (c.width / 256), sh = 0.8 * scale; // keep glyphs a constant size as the canvas widens
  sprite.scale.set(sw, sh, 1);
  sprite.position.copy(pos);
  scene.add(sprite);
  const startY = pos.y;
  tween(0.9, t => {
    sprite.position.y = startY + t * (1.1 + scale * 0.2);
    const pop = 1 + Math.sin(Math.min(1, t * 3) * Math.PI) * 0.25; // landing pop
    sprite.scale.set(sw * pop, sh * pop, 1);
    sprite.material.opacity = 1 - t * t;
  }).then(() => {
    scene.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
}

/**
 * An over-the-top, blood-spattered "CRITICAL!" banner that slams in above the
 * damage number on a critical hit: a fiery-to-blood gradient, jagged black
 * outline, dripping gore and a punchy overshoot-with-shake animation.
 */
export function makeCriticalText(scene: THREE.Scene, pos: THREE.Vector3): void {
  const text = 'CRITICAL!';
  const c = document.createElement('canvas');
  c.height = 224;
  // measure the word first, then size the canvas to it so the heavy jagged
  // outline (and the letters themselves) can never run off the edges.
  const probe = c.getContext('2d')!;
  probe.font = '900 104px "Arial Black", "Trebuchet MS", sans-serif';
  c.width = Math.max(512, Math.ceil(probe.measureText(text).width) + 96);
  const ctx = c.getContext('2d')!;
  const cx = c.width / 2, baseY = 112;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // --- blood drips hanging beneath the letters (drawn first, behind the text) ---
  ctx.fillStyle = '#6b0000';
  const drips: [number, number, number][] = [
    [-156, 50, 9], [-72, 32, 7], [12, 64, 10], [98, 36, 8], [168, 54, 9],
  ];
  for (const [dx, len, w] of drips) {
    const x = cx + dx, y = baseY + 8;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + len * 0.6, x, y + len);
    ctx.quadraticCurveTo(x, y + len * 0.6, x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y + len, w * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- the word: heavy jagged outline, then a dawn-to-blood gradient fill ---
  ctx.font = '900 104px "Arial Black", "Trebuchet MS", sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 18; ctx.strokeStyle = '#2b0000';
  ctx.strokeText(text, cx, baseY);
  ctx.lineWidth = 8; ctx.strokeStyle = '#000';
  ctx.strokeText(text, cx, baseY);
  const grad = ctx.createLinearGradient(0, baseY - 84, 0, baseY + 12);
  grad.addColorStop(0, '#ffe14d');
  grad.addColorStop(0.38, '#ff4d3a');
  grad.addColorStop(1, '#a30000');
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, baseY);

  // --- spatter (offsets from the word's centre so it tracks the canvas width) ---
  ctx.fillStyle = 'rgba(150,0,0,0.85)';
  const spatter: [number, number, number][] = [
    [-202, 40, 5], [196, 52, 6], [-136, 168, 4], [146, 176, 5], [0, 26, 4], [64, 166, 3], [-60, 30, 3],
  ];
  for (const [dx, sy, r] of spatter) {
    ctx.beginPath(); ctx.arc(cx + dx, sy, r, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  sprite.position.copy(pos);
  scene.add(sprite);

  const baseW = 4.3 * (c.width / 512), baseH = baseW * (c.height / c.width); // widen with the canvas, keep letters a constant on-screen size
  const startY = pos.y;
  tween(1.2, t => {
    // punch-in with an overshoot bump, then settle
    let s: number;
    if (t < 0.18) s = t / 0.18;
    else if (t < 0.32) s = 1 + Math.sin((t - 0.18) / 0.14 * Math.PI) * 0.24;
    else s = 1;
    // an angry shake that decays over the first third
    const shake = t < 0.35 ? (1 - t / 0.35) : 0;
    sprite.position.set(pos.x + Math.sin(t * 70) * 0.13 * shake, startY + Math.max(0, t - 0.6) * 0.9, pos.z);
    sprite.material.rotation = Math.sin(t * 52) * 0.05 * shake;
    sprite.material.opacity = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
    sprite.scale.set(baseW * s, baseH * s, 1);
  }).then(() => {
    scene.remove(sprite);
    mat.map?.dispose();
    mat.dispose();
  });
}
