// ============================================================
// AZ Tamer — VFX engine: particles, projectiles, lightning,
// shockwaves, screenshake. Shared by battle mode and dungeons.
// Every effect registers a ticker; VFX.update() drives them all
// and disposes geometry/materials the moment an effect dies.
// ============================================================
import * as THREE from 'three';

type Ticker = (dt: number) => boolean; // return false when the effect is finished

// ---------------- shared sprite textures (built once) ----------------
let _glowTex: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

const _v = new THREE.Vector3(); // scratch

export interface BurstOpts {
  count?: number;       // particle count
  speed?: number;       // initial radial speed
  up?: number;          // extra upward bias
  size?: number;        // point size
  life?: number;        // seconds
  gravity?: number;     // y acceleration
  drag?: number;        // velocity damping per second (0..1)
  spread?: number;      // 1 = full sphere, <1 squashes vertically
}

export class VFX {
  readonly root = new THREE.Group();
  private tickers: Ticker[] = [];
  private t = 0;
  // screenshake — damped multi-frequency wobble, read by the scene's camera rig
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeDur = 0;
  readonly shakeOffset = new THREE.Vector3();
  /** transient FOV punch-in (degrees); decays automatically */
  fovKick = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  update(dt: number): void {
    this.t += dt;
    for (let i = this.tickers.length - 1; i >= 0; i--) {
      if (!this.tickers[i](dt)) this.tickers.splice(i, 1);
    }
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const falloff = Math.pow(1 - this.shakeT / this.shakeDur, 2);
      const k = falloff * this.shakeAmp;
      const w = this.t * 60;
      this.shakeOffset.set(Math.sin(w * 1.13) * k, Math.cos(w * 0.91) * k * 0.65, Math.sin(w * 1.71) * k * 0.4);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 16);
  }

  /** Shake the camera. amp ≈ world units; keeps the stronger of current vs incoming. */
  shake(amp: number, dur = 0.4): void {
    const current = this.shakeDur > 0 ? this.shakeAmp * Math.pow(1 - Math.min(1, this.shakeT / this.shakeDur), 2) : 0;
    if (amp < current) return;
    this.shakeAmp = amp;
    this.shakeDur = dur;
    this.shakeT = 0;
  }

  punch(fovDegrees = 4): void {
    this.fovKick = Math.max(this.fovKick, fovDegrees);
  }

  /** Register a persistent ticker (ambient env animation). Returns an unsubscribe. */
  ambient(fn: (dt: number) => void): () => void {
    const wrapped: Ticker = (dt) => { fn(dt); return true; };
    this.tickers.push(wrapped);
    return () => {
      const i = this.tickers.indexOf(wrapped);
      if (i >= 0) this.tickers.splice(i, 1);
    };
  }

  // ---------------- primitives ----------------

  /** Radial particle explosion. */
  burst(pos: THREE.Vector3, color: number, opts: BurstOpts = {}): void {
    const { count = 26, speed = 3, up = 1.2, size = 0.14, life = 0.6, gravity = -5, drag = 0.5, spread = 1 } = opts;
    const positions = new Float32Array(count * 3);
    const vel: number[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const z = (Math.random() * 2 - 1) * spread;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const s = speed * (0.4 + Math.random() * 0.6);
      vel.push(Math.cos(a) * r * s, z * s + up * Math.random(), Math.sin(a) * r * s);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, map: glowTex(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.root.add(pts);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const damp = Math.max(0, 1 - drag * dt);
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        vel[i * 3] *= damp; vel[i * 3 + 2] *= damp;
        vel[i * 3 + 1] = vel[i * 3 + 1] * damp + gravity * dt;
        arr[i * 3] += vel[i * 3] * dt;
        arr[i * 3 + 1] = Math.max(0.02, arr[i * 3 + 1] + vel[i * 3 + 1] * dt);
        arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - age / life);
      if (age >= life) {
        this.root.remove(pts); geo.dispose(); mat.dispose();
        return false;
      }
      return true;
    });
  }

  /** Particles converge inward onto a point — dark magic, charge-ups. */
  implode(pos: THREE.Vector3, color: number, opts: { count?: number; radius?: number; life?: number; size?: number } = {}): Promise<void> {
    const { count = 30, radius = 1.5, life = 0.4, size = 0.13 } = opts;
    const positions = new Float32Array(count * 3);
    const start: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, p = Math.acos(Math.random() * 2 - 1);
      const r = radius * (0.7 + Math.random() * 0.5);
      const x = pos.x + Math.sin(p) * Math.cos(a) * r;
      const y = pos.y + Math.cos(p) * r * 0.7;
      const z = pos.z + Math.sin(p) * Math.sin(a) * r;
      start.push(x, y, z);
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, map: glowTex(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.root.add(pts);
    let age = 0;
    return new Promise(res => {
      this.tickers.push(dt => {
        age += dt;
        const t = Math.min(1, age / life);
        const k = t * t; // accelerate inward
        const arr = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < count; i++) {
          arr[i * 3] = start[i * 3] + (pos.x - start[i * 3]) * k;
          arr[i * 3 + 1] = start[i * 3 + 1] + (pos.y - start[i * 3 + 1]) * k;
          arr[i * 3 + 2] = start[i * 3 + 2] + (pos.z - start[i * 3 + 2]) * k;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.4 + t * 0.6;
        if (age >= life) {
          this.root.remove(pts); geo.dispose(); mat.dispose();
          res();
          return false;
        }
        return true;
      });
    });
  }

  /** Expanding flat shockwave ring on the ground. */
  ring(pos: THREE.Vector3, color: number, opts: { maxR?: number; life?: number; y?: number; tube?: number } = {}): void {
    const { maxR = 2.2, life = 0.45, y = 0.05, tube = 0.05 } = opts;
    const geo = new THREE.TorusGeometry(1, tube, 6, 36);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, y, pos.z);
    this.root.add(ring);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const t = Math.min(1, age / life);
      const e = 1 - (1 - t) * (1 - t);
      ring.scale.setScalar(0.15 + e * maxR);
      mat.opacity = 1 - t;
      if (age >= life) {
        this.root.remove(ring); geo.dispose(); mat.dispose();
        return false;
      }
      return true;
    });
  }

  /** Decaying point light flash. */
  flash(pos: THREE.Vector3, color: number, opts: { intensity?: number; dist?: number; life?: number } = {}): void {
    const { intensity = 26, dist = 10, life = 0.3 } = opts;
    const light = new THREE.PointLight(color, intensity, dist);
    light.position.copy(pos);
    this.root.add(light);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      light.intensity = intensity * Math.max(0, 1 - age / life);
      if (age >= life) { this.root.remove(light); light.dispose(); return false; }
      return true;
    });
  }

  /** Additive glow sprite that swells and fades — the white-hot core of an impact. */
  glow(pos: THREE.Vector3, color: number, opts: { scale?: number; life?: number; grow?: number } = {}): void {
    const { scale = 1.4, life = 0.3, grow = 1.8 } = opts;
    const mat = new THREE.SpriteMaterial({
      map: glowTex(), color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(pos);
    spr.scale.setScalar(scale * 0.4);
    this.root.add(spr);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const t = Math.min(1, age / life);
      spr.scale.setScalar(scale * (0.4 + t * grow));
      mat.opacity = 1 - t;
      if (age >= life) { this.root.remove(spr); mat.dispose(); return false; }
      return true;
    });
  }

  /**
   * A glowing projectile arcing from A to B with an additive fading trail.
   * Resolves at the moment of impact (caller detonates).
   */
  projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, opts: {
    size?: number; dur?: number; arc?: number; shape?: 'orb' | 'shard';
  } = {}): Promise<void> {
    const { size = 0.18, dur = 0.34, arc = 0.7, shape = 'orb' } = opts;
    const geo = shape === 'orb'
      ? new THREE.SphereGeometry(size, 10, 8)
      : new THREE.OctahedronGeometry(size * 1.3);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const head = new THREE.Mesh(geo, mat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
    }));
    halo.scale.setScalar(size * 6);
    head.add(halo);
    head.position.copy(from);
    this.root.add(head);

    // trail: ring buffer of additive points whose vertex colors decay to black
    const N = 22;
    const tPos = new Float32Array(N * 3);
    const tCol = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { tPos[i * 3] = from.x; tPos[i * 3 + 1] = from.y; tPos[i * 3 + 2] = from.z; }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    const tMat = new THREE.PointsMaterial({
      size: size * 4.5, map: glowTex(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Points(tGeo, tMat);
    this.root.add(trail);
    const tint = new THREE.Color(color);
    let headIdx = 0;

    const mid = from.clone().lerp(to, 0.5);
    mid.y += arc;
    let age = 0, fade = 0;
    return new Promise(res => {
      this.tickers.push(dt => {
        age += dt;
        const t = Math.min(1, age / dur);
        if (t < 1) {
          _v.copy(from).lerp(mid, t);
          const b = mid.clone().lerp(to, t);
          head.position.copy(_v.lerp(b, t));
          head.rotation.x += dt * 14; head.rotation.z += dt * 11;
          // drop a trail crumb at the head
          tPos[headIdx * 3] = head.position.x; tPos[headIdx * 3 + 1] = head.position.y; tPos[headIdx * 3 + 2] = head.position.z;
          tCol[headIdx * 3] = tint.r; tCol[headIdx * 3 + 1] = tint.g; tCol[headIdx * 3 + 2] = tint.b;
          headIdx = (headIdx + 1) % N;
        } else if (head.visible) {
          head.visible = false;
          res(); // impact! caller detonates while the trail evaporates
        }
        // decay all crumbs toward black (invisible under additive blending)
        const decay = Math.max(0, 1 - dt * 7);
        for (let i = 0; i < N * 3; i++) tCol[i] *= decay;
        tGeo.attributes.position.needsUpdate = true;
        tGeo.attributes.color.needsUpdate = true;
        if (t >= 1) {
          fade += dt;
          if (fade > 0.4) {
            this.root.remove(head, trail);
            geo.dispose(); mat.dispose(); (halo.material as THREE.SpriteMaterial).dispose();
            tGeo.dispose(); tMat.dispose();
            return false;
          }
        }
        return true;
      });
    });
  }

  /** Jagged lightning bolt between two points, flickering twice before vanishing. */
  bolt(from: THREE.Vector3, to: THREE.Vector3, color: number, opts: { life?: number; jitter?: number; segments?: number } = {}): void {
    const { life = 0.22, jitter = 0.45, segments = 9 } = opts;
    const mkPoints = () => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const p = from.clone().lerp(to, t);
        if (i > 0 && i < segments) {
          p.x += (Math.random() - 0.5) * jitter;
          p.y += (Math.random() - 0.5) * jitter * 0.6;
          p.z += (Math.random() - 0.5) * jitter;
        }
        pts.push(p);
      }
      return pts;
    };
    const geo = new THREE.BufferGeometry().setFromPoints(mkPoints());
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, linewidth: 2,
    });
    const line = new THREE.Line(geo, mat);
    this.root.add(line);
    let age = 0, reroll = 0;
    this.tickers.push(dt => {
      age += dt; reroll += dt;
      if (reroll > 0.05) { reroll = 0; geo.setFromPoints(mkPoints()); }
      mat.opacity = Math.max(0, 1 - age / life) * (0.6 + Math.random() * 0.4);
      if (age >= life) { this.root.remove(line); geo.dispose(); mat.dispose(); return false; }
      return true;
    });
  }

  /** Spikes (stone, vines, ice…) erupt from the ground in a ring, then sink back. */
  spikes(pos: THREE.Vector3, color: number, opts: { count?: number; height?: number; life?: number; radius?: number } = {}): void {
    const { count = 6, height = 1.1, life = 0.55, radius = 0.55 } = opts;
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.5 });
    const spikes: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (0.4 + Math.random() * 0.8);
      const h = height * (0.6 + Math.random() * 0.6);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.07, h, 5), mat);
      cone.position.set(pos.x + Math.cos(a) * r, 0, pos.z + Math.sin(a) * r);
      cone.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
      cone.userData.h = h;
      group.add(cone);
      spikes.push(cone);
    }
    this.root.add(group);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const t = Math.min(1, age / life);
      // rise fast (overshoot) then sink
      const k = t < 0.35 ? Ease.outBack(t / 0.35) : 1 - Ease.inQuad((t - 0.35) / 0.65);
      for (const s of spikes) {
        s.position.y = (k - 0.5) * s.userData.h;
        s.scale.y = Math.max(0.001, k);
      }
      if (age >= life) {
        this.root.remove(group);
        spikes.forEach(s => s.geometry.dispose());
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  /** A spinning slash crescent flying from A to B. */
  crescent(from: THREE.Vector3, to: THREE.Vector3, color: number, opts: { dur?: number; size?: number } = {}): Promise<void> {
    const { dur = 0.26, size = 0.55 } = opts;
    const geo = new THREE.TorusGeometry(size, 0.05, 6, 18, Math.PI * 1.1);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const arc = new THREE.Mesh(geo, mat);
    arc.position.copy(from);
    arc.lookAt(to);
    this.root.add(arc);
    let age = 0;
    return new Promise(res => {
      this.tickers.push(dt => {
        age += dt;
        const t = Math.min(1, age / dur);
        arc.position.lerpVectors(from, to, t);
        arc.rotation.z += dt * 22;
        mat.opacity = t < 0.85 ? 1 : (1 - t) / 0.15;
        if (age >= dur) {
          this.root.remove(arc); geo.dispose(); mat.dispose();
          res();
          return false;
        }
        return true;
      });
    });
  }

  /** Motes orbiting in a spiral — up for buffs/heals, down for debuffs. */
  spiral(pos: THREE.Vector3, color: number, opts: { up?: boolean; dur?: number; radius?: number; height?: number; count?: number } = {}): void {
    const { up = true, dur = 0.85, radius = 0.55, height = 1.7, count = 10 } = opts;
    const positions = new Float32Array(count * 3);
    const phase: number[] = [];
    for (let i = 0; i < count; i++) phase.push((i / count) * Math.PI * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.16, map: glowTex(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.root.add(pts);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const t = Math.min(1, age / dur);
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const local = Math.min(1, Math.max(0, t * 1.3 - (i / count) * 0.3));
        const y = up ? local * height : height * 0.8 * (1 - local);
        const a = phase[i] + age * 7;
        const r = radius * (1 - local * 0.4);
        arr[i * 3] = pos.x + Math.cos(a) * r;
        arr[i * 3 + 1] = pos.y + y;
        arr[i * 3 + 2] = pos.z + Math.sin(a) * r;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = t < 0.7 ? 1 : (1 - t) / 0.3;
      if (age >= dur) { this.root.remove(pts); geo.dispose(); mat.dispose(); return false; }
      return true;
    });
  }

  /** A vertical pillar of light — boss seals, big heals, exits. */
  pillar(pos: THREE.Vector3, color: number, opts: { height?: number; radius?: number; life?: number } = {}): void {
    const { height = 5, radius = 0.5, life = 0.7 } = opts;
    const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 14, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const cyl = new THREE.Mesh(geo, mat);
    cyl.position.set(pos.x, height / 2, pos.z);
    this.root.add(cyl);
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      const t = Math.min(1, age / life);
      cyl.scale.x = cyl.scale.z = 1 - t * 0.5;
      mat.opacity = 0.65 * (1 - t);
      cyl.rotation.y += dt * 3;
      if (age >= life) { this.root.remove(cyl); geo.dispose(); mat.dispose(); return false; }
      return true;
    });
  }

  /** A translucent wall of water (or wind) sweeping across a line of foes. */
  wave(from: THREE.Vector3, to: THREE.Vector3, color: number, opts: { width?: number; height?: number; dur?: number } = {}): Promise<void> {
    const { width = 5.4, height = 1.6, dur = 0.45 } = opts;
    const geo = new THREE.PlaneGeometry(width, height, 12, 3);
    // curl the top edge forward
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const y = arr[i + 1];
      if (y > 0) arr[i + 2] = y * y * 0.55;
    }
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.copy(from).setY(height / 2);
    wall.lookAt(to.x, height / 2, to.z);
    this.root.add(wall);
    let age = 0;
    return new Promise(res => {
      this.tickers.push(dt => {
        age += dt;
        const t = Math.min(1, age / dur);
        _v.lerpVectors(from, to, t);
        wall.position.set(_v.x, height / 2 + Math.sin(t * Math.PI) * 0.2, _v.z);
        mat.opacity = 0.55 * (t < 0.8 ? 1 : (1 - t) / 0.2);
        if (age >= dur) {
          this.root.remove(wall); geo.dispose(); mat.dispose();
          res();
          return false;
        }
        return true;
      });
    });
  }

  /** Flash every MeshStandardMaterial under a root to a hot emissive, then restore. */
  flashMaterials(target: THREE.Object3D, color = 0xffffff, life = 0.18): void {
    const saved: { m: THREE.MeshStandardMaterial; e: THREE.Color; i: number }[] = [];
    target.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        if (saved.some(s => s.m === std)) continue; // materials are shared within a rig
        saved.push({ m: std, e: std.emissive.clone(), i: std.emissiveIntensity });
        std.emissive.setHex(color);
        std.emissiveIntensity = 0.95;
      }
    });
    let age = 0;
    this.tickers.push(dt => {
      age += dt;
      if (age >= life) {
        for (const s of saved) { s.m.emissive.copy(s.e); s.m.emissiveIntensity = s.i; }
        return false;
      }
      return true;
    });
  }

  /** Remove everything this VFX instance ever added and free GPU resources. */
  dispose(): void {
    this.tickers.length = 0;
    this.root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => m?.dispose());
      }
      const spr = o as THREE.Sprite;
      if (spr.isSprite) spr.material.dispose();
    });
    this.root.removeFromParent();
    this.root.clear();
  }
}

// local copy of easings to avoid a circular import with models.ts
const Ease = {
  outBack: (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2),
  inQuad: (x: number) => x * x,
};
