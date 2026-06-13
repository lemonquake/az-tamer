// ============================================================
// AZ Tamer — the world clock. One sun over every outdoor map.
// Haven City, Agdao Island and New Salmonan all share this
// clock, so dusk follows you onto the boat and dawn is waiting
// when you step off it. The hour persists across sessions.
// ============================================================
import * as THREE from 'three';
import { skyGradient } from './models';

/** A full in-game day, in real seconds. */
const DAY_LENGTH = 240;
const STORE_KEY = 'aztamer_worldclock';

/** Lerp two #rrggbb colors. */
export function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// day/night sky keyframes: [top, bottom, fog]
const SKY_NIGHT: [string, string, string] = ['#0a1026', '#1c2444', '#141a30'];
const SKY_DAWN:  [string, string, string] = ['#e8945a', '#8a6aa8', '#a8809a'];
const SKY_DAY:   [string, string, string] = ['#7ab8e8', '#e8d8b8', '#d8d0c0'];
const SKY_DUSK:  [string, string, string] = ['#e8764a', '#5a4a88', '#9a6a70'];

/** Piecewise sky palette for a 0..1 day phase (0 = midnight, 0.5 = noon). */
export function skyAt(t: number): [string, string, string] {
  const blend = (a: [string, string, string], b: [string, string, string], k: number): [string, string, string] =>
    [lerpHex(a[0], b[0], k), lerpHex(a[1], b[1], k), lerpHex(a[2], b[2], k)];
  if (t < 0.20) return SKY_NIGHT;
  if (t < 0.28) return blend(SKY_NIGHT, SKY_DAWN, (t - 0.20) / 0.08);
  if (t < 0.36) return blend(SKY_DAWN, SKY_DAY, (t - 0.28) / 0.08);
  if (t < 0.66) return SKY_DAY;
  if (t < 0.74) return blend(SKY_DAY, SKY_DUSK, (t - 0.66) / 0.08);
  if (t < 0.82) return blend(SKY_DUSK, SKY_NIGHT, (t - 0.74) / 0.08);
  return SKY_NIGHT;
}

class WorldClock {
  /** 0 = midnight, 0.5 = noon. */
  t = 0.34;
  private persistTimer = 0;

  constructor() {
    const saved = parseFloat(localStorage.getItem(STORE_KEY) ?? '');
    if (!Number.isNaN(saved)) this.t = ((saved % 1) + 1) % 1;
  }

  /** Tick the clock forward. Call once per frame from whichever outdoor map is active. */
  advance(dt: number): void {
    this.t = (this.t + dt / DAY_LENGTH) % 1;
    this.persistTimer += dt;
    if (this.persistTimer > 5) {
      this.persistTimer = 0;
      try { localStorage.setItem(STORE_KEY, String(this.t)); } catch { /* private mode */ }
    }
  }

  /** 0..1 — how much sun is up. */
  get daylight(): number { return Math.max(0, Math.sin((this.t - 0.25) * Math.PI * 2)); }
  /** 0..1 — how deep into the dark we are. */
  get night(): number { return 1 - Math.min(1, this.daylight * 1.6); }
  /** 1 near sunrise/sunset while the sun is up, 0 at noon and at night. */
  get dusk(): number { const d = this.daylight; return d > 0 && d < 0.35 ? 1 - d / 0.35 : 0; }

  /** "HH:MM" for HUD titles. */
  get label(): string {
    const hh = Math.floor(this.t * 24), mm = Math.floor((this.t * 24 % 1) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

/** The one clock every outdoor map shares. */
export const worldClock = new WorldClock();

export interface DayNightOpts {
  /** Sun intensity at high noon. */
  sunMax?: number;
  /** Sun intensity floor at midnight (moonlight). */
  sunMin?: number;
  /** Ambient/hemisphere intensity at noon / midnight. */
  ambientMax?: number;
  ambientMin?: number;
  /** Daytime sun color and the color it leans to at dusk/dawn. */
  sunDay?: string;
  sunDusk?: string;
  /** Moonlight color after dark. */
  sunNight?: string;
}

/**
 * Drives a scene's sky gradient, fog color, sun and ambient light from the
 * shared world clock. Build the scene with any static sky; then call
 * `update(dt)` every frame the map is active (it advances the clock too).
 */
export class DayNightRig {
  private skyTimer = 99;
  private skyTex: THREE.Texture | null = null;
  private opts: Required<DayNightOpts>;

  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private ambient: THREE.Light | null,
    opts: DayNightOpts = {},
  ) {
    this.opts = {
      sunMax: 1.5, sunMin: 0.12, ambientMax: 0.75, ambientMin: 0.26,
      sunDay: '#fff0d0', sunDusk: '#ff9a5a', sunNight: '#7a8ac8',
      ...opts,
    };
  }

  /** Advance the world clock and repaint sky, fog and lights. */
  update(dt: number): void {
    worldClock.advance(dt);
    const o = this.opts;
    const daylight = worldClock.daylight, night = worldClock.night, dusk = worldClock.dusk;
    this.skyTimer += dt;
    if (this.skyTimer > 0.8) {
      this.skyTimer = 0;
      const [top, bottom, fogCol] = skyAt(worldClock.t);
      this.skyTex?.dispose();
      this.skyTex = skyGradient(top, bottom);
      this.scene.background = this.skyTex;
      const fog = this.scene.fog as THREE.Fog | null;
      if (fog) fog.color.set(fogCol);
    }
    this.sun.intensity = o.sunMin + (o.sunMax - o.sunMin) * daylight;
    this.sun.color.set(night > 0.85
      ? o.sunNight
      : lerpHex(o.sunDay, o.sunDusk, dusk * 0.85));
    if (this.ambient) this.ambient.intensity = o.ambientMin + (o.ambientMax - o.ambientMin) * daylight;
  }

  dispose(): void {
    this.skyTex?.dispose();
    this.skyTex = null;
  }
}
