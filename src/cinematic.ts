// ============================================================
// AZ Tamer — Cinematic scenes: living 3D backdrops for story
// dialogue, so no conversation ever plays over a black screen.
//   'academy' — Academy registration hall: holo-terminal,
//               Instructor Hale, cadets at study desks.
//   'camp'    — night recovery camp: campfire, parked Crawler,
//               the field medic patching everyone up.
// The camera glides between named shots while people idle.
// ============================================================
import * as THREE from 'three';
import {
  makeTamer, makeVoxelHuman, updateVoxelHuman, setVoxelSeated, makeCrawler,
  tileTexture, wallpaperTexture, groundTexture, plankTexture, skyGradient,
} from './models';

export type CineKind = 'academy' | 'camp';

interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  facings?: [THREE.Group, number][];   // actors turn to these rotations during the shot
}

export class Cinematic {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 80);
  private shots: Record<string, Shot> = {};
  private goal: Shot;
  private lookCur = new THREE.Vector3();
  private people: THREE.Group[] = [];
  private t = 0;

  constructor(kind: CineKind) {
    if (kind === 'academy') this.buildAcademy(); else this.buildCamp();
    const first = Object.values(this.shots)[0];
    this.goal = first;
    this.camera.position.copy(first.pos);
    this.lookCur.copy(first.look);
    this.camera.lookAt(first.look);
  }

  get view() {
    return { scene: this.scene, camera: this.camera, update: (dt: number) => this.update(dt) };
  }

  /** Glide the camera to a named shot. */
  shot(name: string): void {
    const s = this.shots[name];
    if (s) this.goal = s;
  }

  update(dt: number): void {
    this.t += dt;
    // glide + a gentle handheld sway
    const sway = new THREE.Vector3(Math.sin(this.t * 0.5) * 0.12, Math.sin(this.t * 0.33) * 0.08, 0);
    this.camera.position.lerp(this.goal.pos.clone().add(sway), Math.min(1, dt * 2.2));
    this.lookCur.lerp(this.goal.look, Math.min(1, dt * 2.6));
    this.camera.lookAt(this.lookCur);

    this.people.forEach(p => updateVoxelHuman(p, false, dt));

    // actors turn toward whoever they're talking to in this shot
    for (const [actor, rotY] of this.goal.facings ?? []) {
      let diff = rotY - actor.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      actor.rotation.y += diff * Math.min(1, dt * 5);
    }

    const now = performance.now();
    this.scene.traverse(o => {
      if (o.name === 'flame') o.scale.y = 1 + Math.sin(now * 0.009 + o.position.x * 5) * 0.22;
      if (o.name === 'fx-screen') {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 0.75 + Math.sin(now * 0.0035) * 0.2;
      }
      if (o.name === 'fx-orb') {
        o.position.y = (o.userData.baseY ?? o.position.y) + Math.sin(now * 0.002) * 0.08;
        o.rotation.y = now * 0.0012;
      }
      if (o.name === 'firelight') {
        (o as THREE.PointLight).intensity = 16 + Math.sin(now * 0.011) * 4 + Math.sin(now * 0.037) * 2;
      }
    });
  }

  private person(opts: Parameters<typeof makeVoxelHuman>[0], x: number, z: number, rotY: number, seated = false, seatY = 0.42): THREE.Group {
    const g = makeVoxelHuman(opts);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    if (seated) setVoxelSeated(g, true, seatY);
    this.scene.add(g);
    this.people.push(g);
    return g;
  }

  // ================= academy registration hall =================
  private buildAcademy(): void {
    const s = this.scene;
    s.background = skyGradient('#22304a', '#0c101e');
    s.add(new THREE.AmbientLight(0xcfdcff, 0.55));
    const key = new THREE.PointLight(0xfff2dc, 26, 26);
    key.position.set(0, 4.6, 2);
    key.castShadow = true;
    s.add(key);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16),
      new THREE.MeshStandardMaterial({ map: tileTexture('#7a8298', '#525a72', 9), roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture('#33405e', '#252c40', '#8a96b8', 5), roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(24, 5.5, 0.4), wallMat);
    back.position.set(0, 2.75, -8);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 16), wallMat);
    left.position.set(-12, 2.75, 0);
    const right = left.clone();
    right.position.x = 12;
    s.add(back, left, right);

    // academy crest banner on the back wall
    const crest = document.createElement('canvas');
    crest.width = 512; crest.height = 256;
    {
      const ctx = crest.getContext('2d')!;
      ctx.fillStyle = '#1c2438'; ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#c8b282'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 492, 236);
      ctx.fillStyle = '#e9d9a8'; ctx.textAlign = 'center';
      ctx.font = 'bold 42px Georgia, serif';
      ctx.fillText('TAMER ACADEMY', 256, 95);
      ctx.font = 'italic 24px Georgia, serif';
      ctx.fillStyle = '#8a96b8';
      ctx.fillText('“Trust is trained, never forced.”', 256, 155);
      ctx.font = 'italic 20px Georgia, serif';
      ctx.fillStyle = '#c8b282'; // Gold color to match the border and feel premium
      ctx.fillText('— Aljay Leodones', 256, 195);
    }
    const crestTex = new THREE.CanvasTexture(crest);
    crestTex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2),
      new THREE.MeshStandardMaterial({ map: crestTex, roughness: 0.85 }));
    banner.position.set(0, 3.4, -7.75);
    s.add(banner);

    // glowing wall data-screens flanking the banner
    for (const sx of [-8, 8]) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2),
        new THREE.MeshStandardMaterial({ color: 0x153a52, emissive: 0x2a9dd8, emissiveIntensity: 0.8, roughness: 0.3 }));
      screen.position.set(sx, 3.2, -7.75);
      screen.name = 'fx-screen';
      const glow = new THREE.PointLight(0x2a9dd8, 7, 8);
      glow.position.set(sx, 3.2, -7);
      s.add(screen, glow);
    }

    // ---- the registration terminal ----
    const term = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.05, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x2a3144, metalness: 0.6, roughness: 0.35 }));
    base.position.y = 0.52;
    const screenC = document.createElement('canvas');
    screenC.width = 256; screenC.height = 160;
    {
      const ctx = screenC.getContext('2d')!;
      ctx.fillStyle = '#06121e'; ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = '#2ad8b8'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 244, 148);
      ctx.fillStyle = '#2ad8b8'; ctx.font = 'bold 18px Courier New, monospace'; ctx.textAlign = 'left';
      ctx.fillText('> TAMER REGISTRATION', 16, 36);
      ctx.fillText('> IDENTITY SCAN . . .', 16, 64);
      ctx.fillStyle = '#9aeede'; ctx.font = '14px Courier New, monospace';
      ctx.fillText('LICENSE  : FINAL EXAM', 16, 96);
      ctx.fillText('PROCTOR  : HALE, R.', 16, 118);
      ctx.fillText('STATUS   : ■ AWAITING', 16, 140);
    }
    const screenTex = new THREE.CanvasTexture(screenC);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9),
      new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0x2ad8b8, emissiveMap: screenTex, emissiveIntensity: 0.85, roughness: 0.3 }));
    scr.position.set(0, 1.45, 0.18);
    scr.rotation.x = -0.32;
    scr.name = 'fx-screen';
    // holo orb projected above the console
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({ color: 0x2ad8b8, emissive: 0x2ad8b8, emissiveIntensity: 1.1, transparent: true, opacity: 0.8, wireframe: true }));
    orb.position.y = 2.25;
    orb.name = 'fx-orb';
    orb.userData.baseY = 2.25;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2ad8b8, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
    beam.position.y = 1.75;
    const tLight = new THREE.PointLight(0x2ad8b8, 9, 6);
    tLight.position.set(0, 1.8, 0.6);
    term.add(base, scr, orb, beam, tLight);
    term.position.set(-2.2, 0, -4.6);
    term.rotation.y = 0.5;
    s.add(term);

    // the player at the terminal
    const hero = this.person({ top: 0x2a5ad8, bottom: 0x32384e, cap: 0xd84a3a }, -1.2, -3.6, -2.2);
    // Instructor Hale — red field jacket, arms crossed energy
    const hale = this.person({ top: 0xb03a2a, hair: 0x8a8a92, bottom: 0x2c3040, cap: null }, 1.6, -3.9, -0.5);
    // mutual facing angles for conversation shots
    const heroToHale = Math.atan2(hale.position.x - hero.position.x, hale.position.z - hero.position.z);
    const haleToHero = Math.atan2(hero.position.x - hale.position.x, hero.position.z - hale.position.z);

    // cadets cramming at study desks
    const deskMat = new THREE.MeshStandardMaterial({ map: plankTexture('#5a4630', 1), roughness: 0.8 });
    for (const [dx, dz, rot] of [[-7.5, -2, 0.4], [7, -1.5, -0.5], [6.2, 3.2, -2.4]] as const) {
      const dsk = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1), deskMat);
      top.position.y = 0.8;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.78, 0.7), new THREE.MeshStandardMaterial({ color: 0x2c2c38 }));
      leg.position.y = 0.4;
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.36),
        new THREE.MeshStandardMaterial({ color: 0x9a4540, roughness: 0.7 }));
      book.position.set(0.2, 0.89, 0);
      dsk.add(top, leg, book);
      dsk.position.set(dx, 0, dz);
      dsk.rotation.y = rot;
      s.add(dsk);
      const cadet = this.person({ top: [0x3a7a5e, 0x8a6a2a, 0x55508a][Math.abs(dx) % 3], cap: null }, dx, dz + 0.9, rot + Math.PI, true, 0.5);
      cadet.position.y = 0.08;
      cadet.position.x += Math.sin(rot) * 0.2;
    }

    // potted ferns by the walls
    for (const [px, pz] of [[-10.5, -6.5], [10.5, -6.5]] as const) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 }));
      pot.position.set(px, 0.25, pz);
      const fern = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a7a4a, roughness: 0.95 }));
      fern.position.set(px, 0.85, pz);
      s.add(pot, fern);
    }

    // ---- camera shots (actors turn to face each other when Hale speaks) ----
    this.shots = {
      wide: {
        pos: new THREE.Vector3(0, 3.4, 6.5), look: new THREE.Vector3(0, 1.4, -3),
        facings: [[hero, heroToHale], [hale, haleToHero]],
      },
      terminal: {
        pos: new THREE.Vector3(-3.6, 1.9, -1.2), look: new THREE.Vector3(-1.8, 1.3, -4.2),
        facings: [[hero, -2.2], [hale, haleToHero]],   // hero at the terminal; Hale watching
      },
      hale: {
        pos: new THREE.Vector3(0.2, 1.8, -0.6), look: new THREE.Vector3(0.6, 1.3, -3.9),
        facings: [[hero, heroToHale], [hale, haleToHero]],
      },
    };
  }

  // ================= night recovery camp =================
  private buildCamp(): void {
    const s = this.scene;
    s.background = skyGradient('#101a36', '#04060e');
    s.fog = new THREE.Fog(0x070a14, 18, 42);
    s.add(new THREE.AmbientLight(0x8090c0, 0.22));
    const moon = new THREE.DirectionalLight(0xaabbee, 0.5);
    moon.position.set(-8, 12, -6);
    s.add(moon);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 36),
      new THREE.MeshStandardMaterial({ map: groundTexture('#2c3a26', '#3e5232', 8), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(420);
    for (let i = 0; i < pts.length; i += 3) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 18;
      pts[i] = Math.cos(a) * r;
      pts[i + 1] = 6 + Math.random() * 16;
      pts[i + 2] = Math.sin(a) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    s.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 0.09, transparent: true, opacity: 0.85 })));

    // campfire
    const fire = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 6),
        new THREE.MeshStandardMaterial({ map: plankTexture('#4a3018', 1), roughness: 1 }));
      log.position.set(Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3);
      log.rotation.z = Math.PI / 2.4;
      log.rotation.y = a;
      fire.add(log);
    }
    for (const [fx, fy, fs] of [[0, 0.55, 1], [0.12, 0.42, 0.6], [-0.13, 0.4, 0.55]] as const) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22 * fs, 0.8 * fs, 8),
        new THREE.MeshStandardMaterial({ color: 0xffa03a, emissive: 0xff6a1a, emissiveIntensity: 1.6 }));
      flame.position.set(fx, fy, 0);
      flame.name = 'flame';
      fire.add(flame);
    }
    const fl = new THREE.PointLight(0xff8a3a, 16, 16);
    fl.position.y = 1;
    fl.name = 'firelight';
    fl.castShadow = true;
    fire.add(fl);
    s.add(fire);

    // sitting log + the player, warming up
    const sitLog = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 2.2, 8),
      new THREE.MeshStandardMaterial({ map: plankTexture('#5a3e22', 1), roughness: 1 }));
    sitLog.rotation.z = Math.PI / 2;
    sitLog.position.set(-1.9, 0.26, 0.6);
    sitLog.rotation.y = -0.5;
    s.add(sitLog);
    const hero = this.person({ top: 0x2a5ad8, bottom: 0x32384e, cap: 0xd84a3a }, -1.85, 0.6, 1.1, true, 0.5);
    hero.position.y = 0.05;

    // field medic standing by with a lantern, facing the player
    const medic = this.person({ top: 0xe8eee8, hair: 0x4a3a2a, cap: 0x5ad88a }, 1.7, 1.2, -0.9);
    medic.rotation.y = Math.atan2(hero.position.x - medic.position.x, hero.position.z - medic.position.z);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x9ad88a, emissive: 0x5ad88a, emissiveIntensity: 1 }));
    lantern.position.set(2.1, 1.05, 1.05);
    const ll = new THREE.PointLight(0x8ad88a, 5, 6);
    ll.position.copy(lantern.position);
    s.add(lantern, ll);

    // the trusty Crawler parked at the edge of the firelight
    const crawler = makeCrawler();
    crawler.position.set(4.6, 0, -2.6);
    crawler.rotation.y = -0.7;
    s.add(crawler);

    // a tent
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.7, 4),
      new THREE.MeshStandardMaterial({ color: 0x6a5230, roughness: 0.95 }));
    tent.position.set(-4.4, 0.85, -2.4);
    tent.rotation.y = Math.PI / 4;
    s.add(tent);

    // distant pines
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.6 + (i / 10) * Math.PI * 1.6;
      const r = 12 + (i % 3) * 3;
      const pine = new THREE.Mesh(new THREE.ConeGeometry(1 + (i % 2) * 0.4, 3.4 + (i % 3), 7),
        new THREE.MeshStandardMaterial({ color: 0x1c3220, roughness: 1 }));
      pine.position.set(Math.cos(a) * r, 1.6, Math.sin(a) * r);
      s.add(pine);
    }

    this.shots = {
      fire: { pos: new THREE.Vector3(2.6, 1.7, 3.6), look: new THREE.Vector3(-0.6, 0.9, 0.4) },
      medic: { pos: new THREE.Vector3(-0.8, 1.5, 2.6), look: new THREE.Vector3(1.7, 1.2, -0.9) },
      wide: { pos: new THREE.Vector3(0, 4.4, 9), look: new THREE.Vector3(0, 0.8, -0.5) },
    };
  }
}
