// ============================================================
// AZ Tamer — performance manager: device tiering + adaptive
// quality governor. The single source of truth for "how hard
// should we push the GPU right now?"
//
// Goal: a constant 60–100 FPS on anything from a flagship to a
// budget phone. We do this two ways:
//   1. DETECT a starting quality tier from the hardware up-front.
//   2. ADAPT at runtime — an FPS governor nudges quality down when
//      frames get expensive and back up when there's headroom, with
//      hysteresis so it never oscillates.
//
// Nothing here imports a game module, so it is safe to import from
// anywhere (models, vfx, main) with no cycle risk.
// ============================================================
import type * as THREE from 'three';

export type PerfTier = 'low' | 'mid' | 'high';

// A quality LEVEL is a concrete bundle of GPU-cost knobs. Levels are
// ordered best→worst; the governor walks this ladder at runtime.
interface QualityLevel {
  pixelRatioCap: number; // hard cap on renderer pixel ratio (can go <1 to render below CSS res)
  shadows: boolean;      // real-time shadow maps (one of the biggest mobile costs)
  particleScale: number; // multiplier on every VFX particle count (0..1)
  maxLights: number;     // soft budget for transient VFX lights
}

const LEVELS: QualityLevel[] = [
  { pixelRatioCap: 2.0,  shadows: true,  particleScale: 1.0,  maxLights: 2 }, // 0 — flagship
  { pixelRatioCap: 1.5,  shadows: true,  particleScale: 0.85, maxLights: 2 }, // 1
  { pixelRatioCap: 1.25, shadows: false, particleScale: 0.7,  maxLights: 1 }, // 2 — mid default
  { pixelRatioCap: 1.0,  shadows: false, particleScale: 0.5,  maxLights: 1 }, // 3
  { pixelRatioCap: 0.85, shadows: false, particleScale: 0.35, maxLights: 1 }, // 4 — budget phone
  { pixelRatioCap: 0.7,  shadows: false, particleScale: 0.25, maxLights: 0 }, // 5 — survival mode
];

const TIER_START: Record<PerfTier, number> = { high: 0, mid: 2, low: 4 };

// ---- governor tuning ----
const TARGET_FPS = 60;     // we want to comfortably clear this
const LOW_FPS = 50;        // sustained below this → step quality DOWN
const HIGH_FPS = 88;       // sustained above this → we have headroom, step UP
const EVAL_PERIOD = 1.0;   // seconds between governor decisions
const STEP_UP_GRACE = 6;   // require this many good evals in a row before stepping up

class PerfManager {
  tier: PerfTier = 'high';
  private level = 0;
  private locked = false;        // user forced a fixed quality → governor stands down
  private renderer: THREE.WebGLRenderer | null = null;

  // frame sampling
  private fpsEMA = 60;           // smoothed instantaneous FPS
  private evalT = 0;
  private goodStreak = 0;
  private dpr = 1;

  // live readouts (for the HUD)
  fps = 60;

  /** Detect a starting tier from the hardware. Called once at boot. */
  init(): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    const override = localStorage.getItem('graphicsMode'); // 'low' | 'high' | 'auto' | null
    this.tier = this.detectTier();

    if (override === 'low') { this.level = TIER_START.low; this.locked = true; }
    else if (override === 'high') { this.level = TIER_START.high; this.locked = true; }
    else { this.level = TIER_START[this.tier]; this.locked = false; }
  }

  private detectTier(): PerfTier {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency || 4;
    const mem = nav.deviceMemory || 4; // GB, Chrome-only; assume 4 elsewhere
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints || 0) > 0;

    // Try to read the actual GPU — weak integrated parts get demoted.
    let weakGPU = false;
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      const g = (dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '').toLowerCase();
      weakGPU = /mali-4|mali-t|mali-g31|mali-g51|mali-g52|adreno 3|adreno 4|adreno 50|adreno 51|powervr|swiftshader|llvmpipe|intel.*(hd|gma)/.test(g);
    } catch { /* no WebGL info — fall through to CPU/mem heuristics */ }

    let score = 0;
    score += cores >= 8 ? 2 : cores >= 6 ? 1 : cores <= 4 ? -1 : 0;
    score += mem >= 8 ? 2 : mem >= 6 ? 1 : mem <= 3 ? -2 : 0;
    score += mobile ? -1 : 1;
    score += weakGPU ? -3 : 0;
    score += this.dpr >= 3 ? -1 : 0; // very high-DPR screens are expensive to fill

    if (score >= 3) return 'high';
    if (score <= -2) return 'low';
    return 'mid';
  }

  /** Antialiasing is fixed at renderer-creation time (can't toggle live). */
  wantAA(): boolean { return this.tier === 'high'; }

  /** Connect the renderer so the governor can retune it live. */
  attachRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.apply();
  }

  /** Push the current level's settings onto the renderer. */
  private apply(): void {
    const r = this.renderer;
    if (!r) return;
    const lv = LEVELS[this.level];
    r.setPixelRatio(Math.min(this.dpr, lv.pixelRatioCap));
    if (r.shadowMap.enabled !== lv.shadows) {
      r.shadowMap.enabled = lv.shadows;
      r.shadowMap.needsUpdate = true;
    }
  }

  // ---- knobs the rest of the game reads ----
  get particleScale(): number { return LEVELS[this.level].particleScale; }
  get maxLights(): number { return LEVELS[this.level].maxLights; }
  get shadows(): boolean { return LEVELS[this.level].shadows; }

  /**
   * Max simultaneous decorative point/spot lights a city scene keeps visible.
   * Keyed to the fixed device TIER (not the dynamic level), so the scene's
   * light count — and therefore the compiled shader programs — stays constant
   * for the whole session and never triggers a recompile mid-walk. Forward
   * rendering loops over every visible light per fragment, so on a phone this
   * is the single biggest lever for the open city maps.
   */
  get lightBudget(): number {
    return this.tier === 'high' ? 12 : this.tier === 'mid' ? 8 : 4;
  }

  private optimized = new WeakSet<object>();
  /**
   * One-time-per-scene GPU diet. The forward renderer redraws the WHOLE scene
   * into a shadow map for every shadow-casting light, every frame — and a
   * point/spot light's shadow is a 6-face cube, i.e. 6 extra full renders. In
   * a stylized voxel game those cube shadows aren't worth their cost, so we
   * strip them and keep only the cheap directional sun/key shadow (clamped to
   * the tier's resolution). Combined with the periodic shadow refresh in the
   * frame loop, this is the single biggest win for the open city maps.
   */
  optimizeScene(scene: THREE.Object3D | null | undefined): void {
    if (!scene || this.optimized.has(scene)) return;
    this.optimized.add(scene);
    const size = this.tier === 'high' ? 1024 : 512;
    scene.traverse((o: THREE.Object3D) => {
      const l = o as unknown as {
        isPointLight?: boolean; isSpotLight?: boolean; isDirectionalLight?: boolean;
        castShadow?: boolean; shadow?: { mapSize: { x: number; set(w: number, h: number): void }; map: unknown };
      };
      if (l.isPointLight || l.isSpotLight) {
        if (l.castShadow) {
          l.castShadow = false;
          (l.shadow?.map as { dispose?: () => void } | undefined)?.dispose?.();
        }
      } else if (l.isDirectionalLight && l.castShadow && l.shadow) {
        if (l.shadow.mapSize.x > size) {
          l.shadow.mapSize.set(size, size);
          (l.shadow.map as { dispose?: () => void } | null)?.dispose?.();
          l.shadow.map = null; // force a realloc at the smaller size
        }
      }
    });
  }

  /** Scale a particle/instance count by the current quality (min 1 if base ≥ 1). */
  scaleCount(base: number): number {
    if (base <= 0) return 0;
    return Math.max(1, Math.round(base * this.particleScale));
  }

  /** Feed one frame's delta-time. Runs the adaptive governor. */
  sample(dt: number): void {
    if (dt <= 0) return;
    const inst = 1 / dt;
    // EMA smoothing — ignore single-frame spikes (e.g. a GC pause)
    this.fpsEMA += (Math.min(144, inst) - this.fpsEMA) * 0.1;
    this.fps = Math.round(this.fpsEMA);

    if (this.locked) return;

    this.evalT += dt;
    if (this.evalT < EVAL_PERIOD) return;
    this.evalT = 0;

    if (this.fpsEMA < LOW_FPS && this.level < LEVELS.length - 1) {
      this.level++;
      this.goodStreak = 0;
      this.apply();
    } else if (this.fpsEMA > HIGH_FPS && this.level > 0) {
      // be conservative climbing back up — only after sustained headroom
      if (++this.goodStreak >= STEP_UP_GRACE) {
        this.level--;
        this.goodStreak = 0;
        this.apply();
      }
    } else {
      this.goodStreak = 0;
    }
  }

  /** Force a fixed quality (user setting). tier null → re-enable auto. */
  setManual(mode: 'low' | 'high' | 'auto'): void {
    if (mode === 'auto') {
      this.locked = false;
      this.level = TIER_START[this.tier];
    } else {
      this.locked = true;
      this.level = TIER_START[mode];
    }
    this.apply();
  }

  debugLabel(): string {
    const lv = LEVELS[this.level];
    const info = this.renderer?.info.render;
    const draws = info ? ` · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris` : '';
    return `${this.fps} FPS · ${this.tier}/L${this.level} · ${Math.min(this.dpr, lv.pixelRatioCap).toFixed(2)}x${lv.shadows ? ' · sh' : ''}${draws}`;
  }
}

export const perf = new PerfManager();
