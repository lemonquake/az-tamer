// ============================================================
// AZ Tamer — right-click-drag orbit camera, shared by every
// follow-camera mode (human walking & Crawler driving).
// Hold RMB and drag to swing the camera around the player;
// after 10 idle seconds it glides back home on its own.
// ============================================================
import * as THREE from 'three';

const SNAP_BACK_DELAY = 10;   // seconds of stillness before the camera drifts home
const YAW_SPEED = 0.0085;     // radians per pixel of horizontal drag
const PITCH_SPEED = 0.006;    // radians per pixel of vertical drag
const PITCH_MIN = -0.55;      // looking up from below
const PITCH_MAX = 0.62;       // craning toward top-down

export class CameraOrbit {
  yaw = 0;
  pitch = 0;
  /** Total pixels of right-drag ever performed — the tutorial watches this. */
  dragTravel = 0;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idleT = 0;

  constructor() {
    // attach once, globally — only drags that begin on the 3D canvas count
    window.addEventListener('contextmenu', e => {
      if ((e.target as HTMLElement)?.classList?.contains('game-canvas')) e.preventDefault();
    });
    window.addEventListener('pointerdown', e => {
      if (e.button !== 2) return;
      if (!(e.target as HTMLElement)?.classList?.contains('game-canvas')) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.dragTravel += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * YAW_SPEED;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch + dy * PITCH_SPEED));
      this.idleT = 0;
    });
    const release = (e: PointerEvent) => { if (e.button === 2) this.dragging = false; };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', () => { this.dragging = false; });
    window.addEventListener('blur', () => { this.dragging = false; });
  }

  /** Tick the snap-back timer. Call once per frame from the active scene. */
  update(dt: number): void {
    if (this.dragging) return;
    this.idleT += dt;
    if (this.idleT < SNAP_BACK_DELAY) return;
    if (this.yaw === 0 && this.pitch === 0) return;
    // a slow, weightless glide home
    const k = 1 - Math.exp(-dt * 1.5);
    this.yaw += (0 - this.yaw) * k;
    this.pitch += (0 - this.pitch) * k;
    if (Math.abs(this.yaw) < 0.0008) this.yaw = 0;
    if (Math.abs(this.pitch) < 0.0008) this.pitch = 0;
  }

  /** Whether the player is currently off the default camera angle. */
  get offDefault(): boolean { return this.yaw !== 0 || this.pitch !== 0; }

  /**
   * Swing a scene's default camera goal around its look-target by the
   * current yaw/pitch. Scenes keep their own lerp smoothing — this only
   * bends the goal they chase.
   */
  orbited(goal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    if (!this.offDefault) return goal;
    const off = goal.clone().sub(target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += this.yaw;
    sph.phi = Math.max(0.18, Math.min(Math.PI / 2.05, sph.phi + this.pitch));
    sph.makeSafe();
    return target.clone().add(off.setFromSpherical(sph));
  }

  /** Forget any manual rotation instantly (scene transitions). */
  reset(): void { this.yaw = 0; this.pitch = 0; this.idleT = 0; }
}

/** The one shared orbit rig — every follow-camera scene bends through it. */
export const worldOrbit = new CameraOrbit();
