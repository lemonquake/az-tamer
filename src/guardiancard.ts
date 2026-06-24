// ============================================================
// AZ Tamer — Guardian Card viewer: a 3D collector-card for any
// Guardian (owned instance or species entry). The card slowly
// rotates beside the living, animated 3D model. Front: portrait
// & battle stats; back: technique list & evolution line.
// ============================================================
import * as THREE from 'three';
import {
  SPECIES, TECHS, TYPE_CSS, TYPE_COLORS, STAT_NAMES, expForLevel,
  elementsOf, ELEMENT_CSS, ELEMENT_ICONS, type SpeciesDef, type StatKey, getSpeciesPassive,
  CHARMS, NATURES, natureBlurb, geneRating, geneGradeLabel,
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
  return { Novice: 5, Adept: 18, Elite: 28, Apex: 42, Split: 55, Special: 68, Terra: 80, Transcendent: 90, Aether: 95, Legendary: 55 }[sp.stage] ?? 5;
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
  const legendInfo = [
    { id: 'firgara', owner: 'Aljay', title: 'The Dawnflame', color: '#f2603a' },
    { id: 'onthrofa', owner: 'Aljay', title: 'The Dawnflame', color: '#f2603a' },
    { id: 'vulfenix', owner: 'Aljay', title: 'The Dawnflame', color: '#f2603a' },
    { id: 'raijura', owner: 'Greggy', title: 'The Stormheart', color: '#f2d23a' },
    { id: 'voltherion', owner: 'Greggy', title: 'The Stormheart', color: '#f2d23a' },
    { id: 'fulgrath', owner: 'Greggy', title: 'The Stormheart', color: '#f2d23a' },
    { id: 'verdalune', owner: 'Onnel', title: 'The Worldroot', color: '#4ec45e' },
    { id: 'gaiathorn', owner: 'Onnel', title: 'The Worldroot', color: '#4ec45e' },
    { id: 'nyxroot', owner: 'Onnel', title: 'The Worldroot', color: '#4ec45e' },
  ].find(x => x.id === sp.id);

  if (legendInfo) {
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 10;
    roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = legendInfo.color;
    roundRect(ctx, 28, 28, CARD_W - 56, CARD_H - 56, 18); ctx.stroke();
  } else {
    ctx.strokeStyle = shade(tc, 0.35); ctx.lineWidth = 8;
    roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = shade(tc, 0.6);
    roundRect(ctx, 28, 28, CARD_W - 56, CARD_H - 56, 18); ctx.stroke();
  }

  // header
  ctx.textAlign = 'center';
  if (legendInfo) {
    // draw custom legend badge
    ctx.fillStyle = 'rgba(255,215,0,0.15)';
    roundRect(ctx, CARD_W / 2 - 220, 5, 440, 32, 6); ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(`★ THE LEGENDS' NINE · BONDED TO ${legendInfo.owner.toUpperCase()} ★`, CARD_W / 2, 26);
  }

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
  const els = elementsOf(g);
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
  sp.techs.slice(0, 5).forEach((t, i) => {
    const tech = TECHS[t.tech];
    if (!tech) return;
    const y = 208 + i * 50;
    const known = owned ? g.learnedTechs.includes(t.tech) : g.level >= t.level;
    ctx.fillStyle = TYPE_CSS[tech.type];
    ctx.font = 'bold 21px Georgia, serif';
    ctx.fillText(`${known ? '◆' : '◇'} ${tech.name}`, 96, y);
    ctx.fillStyle = '#8b93b8'; ctx.font = '17px Georgia, serif';
    ctx.fillText(`Lv${t.level} · ${tech.kind === 'phys' ? 'Physical' : 'Art'} · Pow ${tech.power} · ${tech.spCost} SP`, 96, y + 20);
  });

  // passive skill
  ctx.fillStyle = '#f4e8c8'; ctx.font = 'bold 23px Georgia, serif';
  ctx.fillText('PASSIVE SKILL', 80, 470);
  const passive = getSpeciesPassive(sp);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 21px Georgia, serif';
  ctx.fillText(passive.name, 96, 502);
  ctx.fillStyle = '#aab0c8'; ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText(passive.desc, 96, 528);

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
        <div id="pcard-sub">${sp.name} · ${sp.stage} · ${elementsOf(g).map(e => `${ELEMENT_ICONS[e]} ${e}`).join(' / ')} ${inCare ? '· <b style="color:var(--ui-green)">IN YOUR CARE</b>' : ''}</div>
      </div>
      <canvas id="pcard-canvas"></canvas>
      <div id="pcard-hint">🖱 drag to rotate — techniques & evolution line are on the back</div>
      <div id="pcard-loadout" style="display:none"></div>
      <div id="pcard-actions">
        <button class="ui-btn primary" id="pcard-close">Close (Esc)</button>
      </div>`;
    document.getElementById('app')!.appendChild(overlay);

    // ---- Genetics readout + held-charm loadout (owned Guardians only) ----
    const loadoutEl = overlay.querySelector<HTMLElement>('#pcard-loadout')!;
    const panelCss = 'background:rgba(8,10,22,.86);border:1px solid #2c3666;border-radius:10px;padding:10px 14px;margin:6px auto;max-width:560px;font-size:13px;color:#e8ecf6;line-height:1.5';
    const renderLoadout = (picking = false): void => {
      if (!owned || !player) { loadoutEl.style.display = 'none'; return; }
      const pl = player;
      const grade = geneGradeLabel(geneRating(g.genes));
      const nat = NATURES[g.natureId];
      const natTxt = nat ? `${nat.name} <span style="opacity:.7">(${natureBlurb(g.natureId)})</span>` : 'Neutral';
      const order: StatKey[] = ['hp', 'atk', 'def', 'spd', 'wis', 'sp'];
      const geneCells = order.map(k => {
        const v = g.genes[k] ?? 0;
        const col = v >= 30 ? '#ff5ad2' : v >= 22 ? '#9a6aff' : v >= 14 ? '#5ad2ff' : '#7a8090';
        return `<div style="text-align:center;min-width:40px"><div style="font-size:10px;color:#9aa0b4">${STAT_NAMES[k]}</div><div style="font-weight:700;color:${col}">${v}</div></div>`;
      }).join('');
      const tt = pl.trainingTotal(g);
      const charm = g.heldCharm ? CHARMS[g.heldCharm] : null;
      if (!picking) {
        loadoutEl.innerHTML = `<div style="${panelCss}">
          <div>🧬 Genes — <b style="color:${grade.color}">${grade.label} · ${geneRating(g.genes)}%</b></div>
          <div style="display:flex;gap:6px;justify-content:center;margin:5px 0">${geneCells}</div>
          <div>🌿 Nature: <b>${natTxt}</b> &nbsp;·&nbsp; 🎯 Training <b>${tt}</b>/510</div>
          <div style="margin-top:7px">🎴 Charm: ${charm ? `<b>${charm.icon} ${charm.name}</b> <span style="opacity:.7">— ${charm.desc}</span>` : '<span style="opacity:.6">none equipped</span>'}
            <button class="ui-btn" id="pc-charm-change" style="padding:2px 9px;font-size:12px;margin-left:6px">${charm ? 'Change' : 'Equip'}</button>
            ${charm ? `<button class="ui-btn danger" id="pc-charm-remove" style="padding:2px 9px;font-size:12px">Remove</button>` : ''}
          </div></div>`;
        const ch = loadoutEl.querySelector<HTMLElement>('#pc-charm-change');
        if (ch) ch.onclick = () => renderLoadout(true);
        const rm = loadoutEl.querySelector<HTMLElement>('#pc-charm-remove');
        if (rm) rm.onclick = () => { pl.unequipCharm(g); pl.save(); renderLoadout(false); };
      } else {
        const ids = Object.keys(pl.charms).filter(id => CHARMS[id] && (pl.availableCharm(id) > 0 || g.heldCharm === id));
        const rows = ids.length ? ids.map(id => {
          const c = CHARMS[id]; const avail = pl.availableCharm(id); const held = g.heldCharm === id;
          return `<button class="ui-btn" data-charm="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;${held ? 'border-color:var(--ui-gold)' : ''}">${c.icon} <b>${c.name}</b> ${held ? '<span style="color:var(--ui-gold)">[equipped]</span>' : `<span style="opacity:.7">×${avail}</span>`}<br><span class="sub" style="font-size:11px">${c.desc}</span></button>`;
        }).join('') : '<div class="sub" style="padding:8px">No charms owned. Visit the Charm Atelier in Haven City.</div>';
        loadoutEl.innerHTML = `<div style="${panelCss}">
          <div style="display:flex;justify-content:space-between;align-items:center"><b>🎴 Equip a Charm</b><button class="ui-btn" id="pc-charm-back" style="padding:2px 9px;font-size:12px">Back</button></div>
          <div style="max-height:220px;overflow-y:auto;margin-top:5px">${rows}</div></div>`;
        loadoutEl.querySelector<HTMLElement>('#pc-charm-back')!.onclick = () => renderLoadout(false);
        loadoutEl.querySelectorAll<HTMLElement>('[data-charm]').forEach(b => b.onclick = () => {
          const id = b.dataset.charm!;
          if (g.heldCharm === id) pl.unequipCharm(g); else pl.equipCharm(g, id);
          pl.save(); renderLoadout(false);
        });
      }
      loadoutEl.style.display = 'block';
    };
    renderLoadout(false);

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
    const rig = makeGuardian(g.speciesId, g.customization);
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

    // custom epic legend effects
    let legendUpdate: ((dt: number, now: number) => void) | null = null;

    if (['firgara', 'onthrofa', 'vulfenix'].includes(g.speciesId)) {
      // Aljay's blazing fire effect
      const emberCount = 300;
      const emberGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(emberCount * 3);
      const vel = new Float32Array(emberCount * 3);
      const life = new Float32Array(emberCount);
      for (let i = 0; i < emberCount; i++) {
        pos[i*3] = (Math.random() - 0.5) * 6;
        pos[i*3+1] = -3 + Math.random() * 6;
        pos[i*3+2] = -1 - Math.random() * 3;
        vel[i*3] = (Math.random() - 0.5) * 0.4;
        vel[i*3+1] = 0.8 + Math.random() * 1.2;
        vel[i*3+2] = (Math.random() - 0.5) * 0.4;
        life[i] = Math.random();
      }
      emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const emberMat = new THREE.PointsMaterial({
        color: 0xff6600,
        size: 0.09,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.8
      });
      const embers = new THREE.Points(emberGeo, emberMat);
      scene.add(embers);

      const fireLight = new THREE.PointLight(0xff3300, 15, 8);
      fireLight.position.set(2.1, -1.0, 0.5);
      scene.add(fireLight);

      legendUpdate = (dt, now) => {
        const positions = emberGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < emberCount; i++) {
          positions[i*3] += vel[i*3] * dt;
          positions[i*3+1] += vel[i*3+1] * dt;
          positions[i*3+2] += vel[i*3+2] * dt;
          life[i] -= dt * 0.3;
          if (life[i] <= 0 || positions[i*3+1] > 3) {
            positions[i*3] = (Math.random() - 0.5) * 6;
            positions[i*3+1] = -3;
            positions[i*3+2] = -1 - Math.random() * 3;
            life[i] = 1.0;
          }
        }
        emberGeo.attributes.position.needsUpdate = true;
        fireLight.intensity = 15 + Math.sin(now * 0.02) * 5;
      };
    } else if (['raijura', 'voltherion', 'fulgrath'].includes(g.speciesId)) {
      // Greggy's electric storm effect
      const sparkCount = 150;
      const sparkGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i++) {
        pos[i*3] = (Math.random() - 0.5) * 8;
        pos[i*3+1] = (Math.random() - 0.5) * 6;
        pos[i*3+2] = -1 - Math.random() * 3;
      }
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const sparkMat = new THREE.PointsMaterial({
        color: 0xffffaa,
        size: 0.06,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.9
      });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparks);

      const stormLight = new THREE.PointLight(0x5599ff, 10, 10);
      stormLight.position.set(2.1, 1.0, 0.5);
      scene.add(stormLight);

      const lineMat = new THREE.LineBasicMaterial({ color: 0x88ddff, transparent: true });
      const bolts: THREE.Line[] = [];
      for (let i = 0; i < 3; i++) {
        const lineGeo = new THREE.BufferGeometry();
        const linePos = new Float32Array(18);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        const bolt = new THREE.Line(lineGeo, lineMat);
        scene.add(bolt);
        bolts.push(bolt);
      }

      let boltTimer = 0;
      legendUpdate = (dt, now) => {
        const positions = sparkGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < sparkCount; i++) {
          if (Math.random() < 0.05) {
            positions[i*3] = (Math.random() - 0.5) * 8;
            positions[i*3+1] = (Math.random() - 0.5) * 6;
            positions[i*3+2] = -1 - Math.random() * 3;
          }
        }
        sparkGeo.attributes.position.needsUpdate = true;

        boltTimer -= dt;
        if (boltTimer <= 0) {
          boltTimer = 0.2 + Math.random() * 0.4;
          stormLight.intensity = 35;
          bolts.forEach(bolt => {
            const arr = bolt.geometry.attributes.position.array as Float32Array;
            let sx = (Math.random() - 0.5) * 5;
            let sy = 3;
            let sz = -1 - Math.random() * 2;
            for (let p = 0; p < 6; p++) {
              arr[p*3] = sx;
              arr[p*3+1] = sy;
              arr[p*3+2] = sz;
              sx += (Math.random() - 0.5) * 0.8;
              sy -= 1.0;
              sz += (Math.random() - 0.5) * 0.4;
            }
            bolt.geometry.attributes.position.needsUpdate = true;
            (bolt.material as THREE.LineBasicMaterial).opacity = 0.9;
          });
        } else {
          stormLight.intensity += (5 - stormLight.intensity) * dt * 10;
          bolts.forEach(bolt => {
            (bolt.material as THREE.LineBasicMaterial).opacity = Math.max(0, (bolt.material as THREE.LineBasicMaterial).opacity - dt * 5);
          });
        }
      };
    } else if (['verdalune', 'gaiathorn', 'nyxroot'].includes(g.speciesId)) {
      // Onnel's nature/leaf drift effect
      const leafCount = 120;
      const leafGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(leafCount * 3);
      const vel = new Float32Array(leafCount * 3);
      for (let i = 0; i < leafCount; i++) {
        pos[i*3] = (Math.random() - 0.5) * 6;
        pos[i*3+1] = 3 - Math.random() * 6;
        pos[i*3+2] = -1 - Math.random() * 3;
        vel[i*3] = -0.5 - Math.random() * 0.5;
        vel[i*3+1] = -0.3 - Math.random() * 0.4;
        vel[i*3+2] = (Math.random() - 0.5) * 0.2;
      }
      leafGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const leafMat = new THREE.PointsMaterial({
        color: 0x4ec45e,
        size: 0.12,
        transparent: true,
        opacity: 0.75
      });
      const leaves = new THREE.Points(leafGeo, leafMat);
      scene.add(leaves);

      const natureLight = new THREE.PointLight(0x4ec45e, 8, 8);
      natureLight.position.set(2.1, -0.5, 0.5);
      scene.add(natureLight);

      legendUpdate = (dt, now) => {
        const positions = leafGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < leafCount; i++) {
          positions[i*3] += (vel[i*3] + Math.sin(now * 0.002 + i) * 0.1) * dt;
          positions[i*3+1] += vel[i*3+1] * dt;
          positions[i*3+2] += vel[i*3+2] * dt;
          if (positions[i*3+1] < -3 || positions[i*3] < -3) {
            positions[i*3] = 3;
            positions[i*3+1] = 3 - Math.random() * 3;
            positions[i*3+2] = -1 - Math.random() * 3;
          }
        }
        leafGeo.attributes.position.needsUpdate = true;
        natureLight.intensity = 6 + Math.sin(now * 0.001) * 2;
      };
    }

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
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') { e.stopPropagation(); close(); }
    };
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
      if (legendUpdate) legendUpdate(dt, now);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    size();
    requestAnimationFrame(loop);
  });
}
