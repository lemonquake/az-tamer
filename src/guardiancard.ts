// ============================================================
// AZ Tamer — Guardian Card viewer: a 3D collector-card for any
// Guardian (owned instance or species entry). The card slowly
// rotates beside the living, animated 3D model. Front: portrait
// & battle stats; back: technique list & evolution line.
// ============================================================
import * as THREE from 'three';
import {
  SPECIES, TECHS, TYPE_CSS, TYPE_COLORS, STAT_NAMES, expForLevel,
  elementsOf, ELEMENT_CSS, ELEMENT_ICONS, type SpeciesDef, type StatKey,
} from './data';
import { Guardian, type Player } from './state';
import { makeGuardian, disposeRig } from './models';
import { speciesSnapshot } from './snapshots';
import { shade } from './guilds';

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

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Reference level used when viewing a species entry (no owned instance). */
function referenceLevel(sp: SpeciesDef): number {
  return { Novice: 5, Adept: 18, Elite: 28, Apex: 42, Legendary: 55, Aether: 60 }[sp.stage] ?? 5;
}

function evolvesFrom(speciesId: string): { sp: SpeciesDef; level: number }[] {
  return Object.values(SPECIES)
    .filter(s => s.evolvesTo?.species === speciesId)
    .map(s => ({ sp: s, level: s.evolvesTo!.level }));
}

function statBars(ctx: CanvasRenderingContext2D, g: Guardian, typeCss: string, y0: number): void {
  const s = g.stats;
  const maxRef: Record<StatKey, number> = { hp: 420, sp: 140, atk: 130, def: 110, spd: 110, wis: 110 };
  (Object.keys(STAT_NAMES) as StatKey[]).forEach((k, i) => {
    const y = y0 + i * 46;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aab0c8';
    ctx.font = '20px Georgia, serif';
    ctx.fillText(STAT_NAMES[k], 80, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px Georgia, serif';
    ctx.fillText(`${s[k]}`, 560, y);
    // bar
    const w = 290, x = 180;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y - 14, w, 14, 7); ctx.fill();
    const pct = Math.min(1, s[k] / maxRef[k]);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, shade(typeCss, -0.2));
    grad.addColorStop(1, shade(typeCss, 0.35));
    ctx.fillStyle = grad;
    roundRect(ctx, x, y - 14, Math.max(10, w * pct), 14, 7); ctx.fill();
  });
}

function cardFront(g: Guardian, owned: boolean): HTMLCanvasElement {
  const sp = g.species;
  const tc = TYPE_CSS[sp.type];
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  // type-tinted gradient base
  const grad = ctx.createLinearGradient(0, 0, CARD_W * 0.3, CARD_H);
  grad.addColorStop(0, shade(tc, -0.55));
  grad.addColorStop(0.5, shade(hex(sp.palette.primary), -0.7));
  grad.addColorStop(1, '#05060c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // diagonal energy streaks in type color
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = shade(tc, 0.4);
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(-60 + i * 90, CARD_H + 30);
    ctx.lineTo(60 + i * 90, -30);
    ctx.stroke();
  }
  ctx.restore();

  // frame
  ctx.strokeStyle = shade(tc, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = shade(tc, 0.6);
  roundRect(ctx, 28, 28, CARD_W - 56, CARD_H - 56, 18); ctx.stroke();

  // header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f6ff';
  ctx.font = 'bold 46px Georgia, serif';
  ctx.fillText(g.nickname.toUpperCase(), CARD_W / 2, 92);
  if (g.nickname !== sp.name) {
    ctx.fillStyle = '#9aa0b8'; ctx.font = 'italic 22px Georgia, serif';
    ctx.fillText(`(${sp.name})`, CARD_W / 2, 124);
  }
  // element & stage pills, centered as one row
  const pill = (text: string, x: number, w: number, bg: string, fg: string) => {
    roundRect(ctx, x, 140, w, 36, 18);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText(text, x + w / 2, 164);
  };
  const els = elementsOf(sp.id);
  const pills: { text: string; bg: string; fg: string }[] = [
    ...els.map(el => ({ text: `${ELEMENT_ICONS[el]} ${el.toUpperCase()}`, bg: ELEMENT_CSS[el], fg: '#0c1022' })),
    { text: sp.stage.toUpperCase(), bg: 'rgba(255,255,255,0.12)', fg: '#e8ecff' },
  ];
  const widths = pills.map(pl => Math.max(86, pl.text.length * 11 + 28));
  const totalW = widths.reduce((a, b) => a + b, 0) + (pills.length - 1) * 10;
  let pxr = CARD_W / 2 - totalW / 2;
  pills.forEach((pl, i) => { pill(pl.text, pxr, widths[i], pl.bg, pl.fg); pxr += widths[i] + 10; });

  // portrait (3D snapshot)
  const px = CARD_W / 2 - 160, py = 200, ps = 320;
  roundRect(ctx, px - 8, py - 8, ps + 16, ps + 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  ctx.strokeStyle = shade(tc, 0.5); ctx.lineWidth = 3; ctx.stroke();
  ctx.drawImage(speciesSnapshot(g.speciesId, 512), px, py, ps, ps);

  // level plaque
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, CARD_W / 2 - 150, 540, 300, 46, 10); ctx.fill();
  ctx.strokeStyle = shade(tc, 0.4); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(owned ? `Lv ${g.level} / ${g.levelCap}` : `Reference Lv ${g.level}`, CARD_W / 2, 572);

  statBars(ctx, g, tc, 632);

  // footer flavor
  ctx.fillStyle = '#aab0c8';
  ctx.font = 'italic 19px Georgia, serif';
  ctx.textAlign = 'center';
  const words = sp.desc.split(' ');
  let line = '', y = CARD_H - 60;
  const lines: string[] = [];
  for (const w of words) {
    if ((line + ' ' + w).length > 52) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, CARD_W / 2, y - (lines.length - 1 - i) * 26));
  return c;
}

function cardBack(g: Guardian, owned: boolean): HTMLCanvasElement {
  const sp = g.species;
  const tc = TYPE_CSS[sp.type];
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, '#0b0d18');
  grad.addColorStop(1, shade(tc, -0.72));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = shade(tc, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();

  // watermark
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.drawImage(speciesSnapshot(g.speciesId, 512), CARD_W / 2 - 240, CARD_H / 2 - 240, 480, 480);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 32px Georgia, serif';
  ctx.fillText('FIELD RECORD', CARD_W / 2, 78);
  ctx.fillStyle = shade(tc, 0.5);
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(`${g.nickname} · ${sp.type} · ${sp.stage}`, CARD_W / 2, 110);
  ctx.strokeStyle = shade(tc, 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, 130); ctx.lineTo(CARD_W - 80, 130); ctx.stroke();

  // techniques
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4e8c8'; ctx.font = 'bold 23px Georgia, serif';
  ctx.fillText('TECHNIQUES', 80, 172);
  sp.techs.slice(0, 7).forEach((t, i) => {
    const tech = TECHS[t.tech];
    if (!tech) return;
    const y = 208 + i * 52;
    const known = owned ? g.learnedTechs.includes(t.tech) : g.level >= t.level;
    ctx.fillStyle = TYPE_CSS[tech.type];
    ctx.font = 'bold 21px Georgia, serif';
    ctx.fillText(`${known ? '◆' : '◇'} ${tech.name}`, 96, y);
    ctx.fillStyle = '#8b93b8'; ctx.font = '17px Georgia, serif';
    ctx.fillText(`Lv${t.level} · ${tech.kind === 'phys' ? 'Physical' : 'Art'} · Pow ${tech.power} · ${tech.spCost} SP`, 96, y + 22);
  });

  // evolution line
  const yEvo = 608;
  ctx.fillStyle = '#f4e8c8'; ctx.font = 'bold 23px Georgia, serif';
  ctx.fillText('EVOLUTION LINE', 80, yEvo);
  const from = evolvesFrom(sp.id);
  const to = sp.evolvesTo ? SPECIES[sp.evolvesTo.species] : null;
  let ey = yEvo + 38;
  ctx.font = '20px Georgia, serif';
  if (from.length) {
    from.forEach(f => {
      ctx.fillStyle = '#aab0c8';
      ctx.fillText(`⟵  evolves from ${f.sp.name} at Lv ${f.level}`, 96, ey);
      ey += 30;
    });
  }
  ctx.fillStyle = shade(tc, 0.55);
  ctx.font = 'bold 21px Georgia, serif';
  ctx.fillText(`●  ${sp.name}  (current form)`, 96, ey);
  ey += 30;
  ctx.font = '20px Georgia, serif';
  if (to) {
    ctx.fillStyle = '#aab0c8';
    ctx.fillText(`⟶  evolves into ${to.name} at Lv ${sp.evolvesTo!.level}`, 96, ey);
  } else {
    ctx.fillStyle = '#8b93b8';
    ctx.fillText('⟶  final form — no further evolution', 96, ey);
  }

  // record table
  const rows: [string, string][] = owned
    ? [
        ['Total EXP', `${g.exp}`],
        ['EXP to next level', `${Math.max(0, expForLevel(g.level + 1) - g.exp)}`],
        ['Technique Points', `${g.techPoints}`],
        ['Bond', g.isStarter ? 'First partner ★' : 'Befriended in the wild'],
      ]
    : [
        ['Capture difficulty', sp.captureBase >= 0.4 ? 'Friendly' : sp.captureBase >= 0.12 ? 'Wary' : sp.captureBase > 0 ? 'Near-mythical' : 'Cannot be befriended'],
        ['Archetype', sp.archetype],
        ['Stage', sp.stage],
        ['Status', 'Not yet in your care'],
      ];
  ctx.font = '20px Georgia, serif';
  rows.forEach(([k, v], i) => {
    const y = 790 + i * 38;
    ctx.textAlign = 'left'; ctx.fillStyle = '#8b93b8';
    ctx.fillText(k, 96, y);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff';
    ctx.fillText(v, CARD_W - 96, y);
  });
  return c;
}

/**
 * Open the full-screen Guardian Card viewer.
 * `subject` is an owned Guardian instance OR a species id (reference card).
 */
export function openGuardianCard(subject: Guardian | string, player?: Player): Promise<void> {
  return new Promise(resolve => {
    const owned = subject instanceof Guardian;
    const g = owned ? subject : new Guardian(subject, referenceLevel(SPECIES[subject]));
    const sp = g.species;
    const tc = TYPE_CSS[sp.type];
    const tcol = TYPE_COLORS[sp.type];
    const inCare = owned || !!player?.party.concat(player.reserve).some(x => x.speciesId === sp.id);

    const overlay = document.createElement('div');
    overlay.id = 'pcard-overlay';
    overlay.innerHTML = `
      <div id="pcard-head">
        <div id="pcard-title" style="color:${shade(tc, 0.45)}">${g.nickname.toUpperCase()}</div>
        <div id="pcard-sub">${sp.name} · ${sp.stage} · ${elementsOf(sp.id).map(e => `${ELEMENT_ICONS[e]} ${e}`).join(' / ')} ${inCare ? '· <b style="color:var(--ui-green)">IN YOUR CARE</b>' : ''}</div>
      </div>
      <canvas id="pcard-canvas"></canvas>
      <div id="pcard-hint">🖱 drag to rotate — techniques & evolution line are on the back</div>
      <div id="pcard-actions">
        <button class="ui-btn primary" id="pcard-close">Close (Esc)</button>
      </div>`;
    document.getElementById('app')!.appendChild(overlay);

    const canvas = overlay.querySelector<HTMLCanvasElement>('#pcard-canvas')!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.6);
    const size = () => {
      renderer.setSize(overlay.clientWidth, overlay.clientHeight);
      camera.aspect = overlay.clientWidth / overlay.clientHeight;
      camera.updateProjectionMatrix();
    };

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(tcol, 30, 14);
    rim.position.set(-4, -1, 3);
    scene.add(rim);

    // type-colored motes
    const moteGeo = new THREE.BufferGeometry();
    const motes = new Float32Array(180);
    for (let i = 0; i < motes.length; i += 3) {
      motes[i] = (Math.random() - 0.5) * 10;
      motes[i + 1] = (Math.random() - 0.5) * 7;
      motes[i + 2] = -2 - Math.random() * 4;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    scene.add(new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: tcol, size: 0.045, transparent: true, opacity: 0.6 })));

    // the card
    const cardGroup = new THREE.Group();
    cardGroup.position.x = -1.1;
    scene.add(cardGroup);
    const frontTex = new THREE.CanvasTexture(cardFront(g, owned));
    frontTex.colorSpace = THREE.SRGBColorSpace;
    const backTex = new THREE.CanvasTexture(cardBack(g, owned));
    backTex.colorSpace = THREE.SRGBColorSpace;
    const edgeMat = new THREE.MeshStandardMaterial({ color: tcol, metalness: 0.8, roughness: 0.3 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.3, 0.045), [
      edgeMat, edgeMat, edgeMat, edgeMat,
      new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35, metalness: 0.15 }),
      new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.35, metalness: 0.15 }),
    ]);
    cardGroup.add(card);

    // the living model floats beside its card
    const rig = makeGuardian(g.speciesId);
    rig.group.scale.setScalar(0.9);
    rig.group.position.set(2.1, -1.3, -0.3);
    scene.add(rig.group);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0x232434, roughness: 0.7, metalness: 0.3 }));
    pedestal.position.set(2.1, -1.42, -0.3);
    scene.add(pedestal);
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.025, 8, 40),
      new THREE.MeshBasicMaterial({ color: tcol, transparent: true, opacity: 0.7 }));
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.copy(pedestal.position).y += 0.12;
    scene.add(haloRing);

    // interaction (same feel as the guild card)
    let dragging = false, lastX = 0, lastY = 0;
    let velY = 0.35, rotX = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cardGroup.rotation.y += dx * 0.011;
      rotX = Math.max(-0.9, Math.min(0.9, rotX + dy * 0.008));
      velY = dx * 0.6;
    });
    const release = () => { dragging = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    let active = true;
    const close = () => {
      active = false;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', size);
      disposeRig(rig);
      renderer.dispose();
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', size);
    overlay.querySelector<HTMLElement>('#pcard-close')!.onclick = close;

    let last = performance.now();
    const loop = (now: number) => {
      if (!active) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging) {
        cardGroup.rotation.y += velY * dt;
        velY += (0.35 - velY) * Math.min(1, dt * 0.8);
        rotX += (Math.sin(now * 0.0006) * 0.08 - rotX) * Math.min(1, dt * 1.2);
      }
      cardGroup.rotation.x = rotX;
      cardGroup.position.y = Math.sin(now * 0.0009) * 0.08;
      rig.group.rotation.y += dt * 0.7;
      rig.group.position.y = -1.3 + Math.sin(now * 0.0012) * 0.06;
      haloRing.rotation.z += dt * 0.4;
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    size();
    requestAnimationFrame(loop);
  });
}
