// ============================================================
// AZ Tamer — Guild Card viewer: a 3D effigy-card presented in
// its own overlay. Slowly rotates, can be drag-rotated, shows
// the player's photo (uploadable) and rich guild service data.
// ============================================================
import * as THREE from 'three';
import { HOUSES, type Element } from './data';
import type { Player, GuildPerks } from './state';
import { GUILD_LORE, drawCardFront, drawCardBack, makeEffigy, rankFor, shade, questsDoneCount } from './guilds';
import { toast } from './ui';
import { showTrophyCase } from './trophies';

/** Downscale an uploaded image file to a 256×256 cover-cropped JPEG data URL. */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d')!;
      const r = Math.max(256 / img.width, 256 / img.height);
      ctx.drawImage(img, 128 - img.width * r / 2, 128 - img.height * r / 2, img.width * r, img.height * r);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/**
 * Open the full-screen Guild Card viewer.
 * Resolves when closed. onPhotoChanged fires after a successful upload.
 */
export function openGuildCard(player: Player, onPhotoChanged?: () => void): Promise<void> {
  return new Promise(resolve => {
    const house = HOUSES.find(h => h.id === player.houseId);
    if (!house) { resolve(); return; }
    const lore = GUILD_LORE[house.id];

    // ---------- overlay DOM ----------
    const overlay = document.createElement('div');
    overlay.id = 'gcard-overlay';
    overlay.innerHTML = `
      <div id="gcard-head">
        <div id="gcard-title" style="color:${shade(house.color, 0.45)}">${lore.cardName.toUpperCase()}</div>
        <div id="gcard-sub">${house.name} · ${lore.epithet} · ${rankFor(player)} ${player.tamerName}</div>
      </div>
      <canvas id="gcard-canvas"></canvas>
      <div id="gcard-hint">🖱 drag to rotate — the record of your deeds is on the back</div>
      <div id="gcard-lore">
        <b style="color:${shade(house.color, 0.5)}">${lore.effigyName}</b><br>${lore.effigyDesc}
      </div>
      <div id="gcard-actions">
        <button class="ui-btn" id="gcard-upload">📷 Upload profile photo</button>
        <button class="ui-btn" id="gcard-perks" style="background:rgba(217,161,26,0.18);color:var(--ui-gold);border:1px solid var(--ui-gold)">🧬 Guild Perks & Quests</button>
        <button class="ui-btn" id="gcard-trophy" style="background:rgba(255,210,78,0.18);color:var(--ui-gold);border:1px solid var(--ui-gold)">🏆 Trophy Case</button>
        <button class="ui-btn primary" id="gcard-close">Close (Esc)</button>
      </div>
      <input type="file" id="gcard-file" accept="image/*" style="display:none">`;
    document.getElementById('app')!.appendChild(overlay);

    const canvas = overlay.querySelector<HTMLCanvasElement>('#gcard-canvas')!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const size = () => {
      const w = overlay.clientWidth, h = overlay.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    // ---------- scene ----------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.4);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(parseInt(house.color.slice(1), 16), 30, 14);
    rim.position.set(-4, -1, 3);
    scene.add(rim);

    // floating dust motes in guild color
    const moteGeo = new THREE.BufferGeometry();
    const motes = new Float32Array(180);
    for (let i = 0; i < motes.length; i += 3) {
      motes[i] = (Math.random() - 0.5) * 10;
      motes[i + 1] = (Math.random() - 0.5) * 7;
      motes[i + 2] = -2 - Math.random() * 4;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    const moteMat = new THREE.PointsMaterial({ color: parseInt(house.color.slice(1), 16), size: 0.045, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(moteGeo, moteMat));

    // ---------- the card ----------
    const cardGroup = new THREE.Group();
    scene.add(cardGroup);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 });
    let frontMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 });
    const backTex = new THREE.CanvasTexture(drawCardBack(player, house));
    backTex.colorSpace = THREE.SRGBColorSpace;
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.35, metalness: 0.15 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.3, 0.045),
      [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    cardGroup.add(card);

    const refreshFront = async () => {
      const tex = new THREE.CanvasTexture(await drawCardFront(player, house));
      tex.colorSpace = THREE.SRGBColorSpace;
      frontMat.map?.dispose();
      frontMat.map = tex;
      frontMat.needsUpdate = true;
    };
    refreshFront();

    const refreshBack = () => {
      const tex = new THREE.CanvasTexture(drawCardBack(player, house));
      tex.colorSpace = THREE.SRGBColorSpace;
      backMat.map?.dispose();
      backMat.map = tex;
      backMat.needsUpdate = true;
    };

    // the guild effigy hovers beside the card
    const effigy = makeEffigy(house.id);
    effigy.scale.setScalar(0.85);
    effigy.position.set(2.5, -1.5, -0.4);
    scene.add(effigy);

    // ---------- interaction ----------
    let dragging = false, lastX = 0, lastY = 0;
    let velY = 0.35, velX = 0; // auto-spin until touched
    let rotX = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cardGroup.rotation.y += dx * 0.011;
      rotX = Math.max(-0.9, Math.min(0.9, rotX + dy * 0.008));
      velY = dx * 0.6;
      velX = 0;
    });
    const release = () => { dragging = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // ---------- photo upload ----------
    const fileInput = overlay.querySelector<HTMLInputElement>('#gcard-file')!;
    overlay.querySelector<HTMLElement>('#gcard-upload')!.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        player.profilePic = await fileToAvatar(f);
        player.save();
        await refreshFront();
        onPhotoChanged?.();
      } catch { /* unreadable image — keep the old portrait */ }
      fileInput.value = '';
    };

    overlay.querySelector<HTMLElement>('#gcard-perks')!.onclick = () => {
      openGuildPerksPanel(player, house.color, () => {
        refreshBack();
      });
    };

    overlay.querySelector<HTMLElement>('#gcard-trophy')!.onclick = () => {
      showTrophyCase(player);
    };

    // ---------- lifecycle ----------
    let active = true;
    const close = () => {
      active = false;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', size);
      renderer.dispose();
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', size);
    overlay.querySelector<HTMLElement>('#gcard-close')!.onclick = close;

    let last = performance.now();
    const loop = (now: number) => {
      if (!active) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging) {
        cardGroup.rotation.y += velY * dt;
        velY += (0.35 - velY) * Math.min(1, dt * 0.8); // settle back to lazy spin
        rotX += (Math.sin(now * 0.0006) * 0.08 - rotX) * Math.min(1, dt * 1.2);
      }
      cardGroup.rotation.x = rotX;
      cardGroup.position.y = Math.sin(now * 0.0009) * 0.08;
      effigy.rotation.y += dt * 0.6;
      effigy.position.y = -1.5 + Math.sin(now * 0.0012) * 0.07;
      effigy.traverse(o => {
        if (o.name === 'fx-spin') o.rotation.z += dt * 1.6;
        if (o.name === 'fx-float') o.position.y += Math.sin(now * 0.002) * 0.0006;
        if (o.name === 'fx-pulse') o.scale.setScalar(1 + Math.sin(now * 0.004) * 0.12);
      });
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    size();
    requestAnimationFrame(loop);
  });
}

interface QuestDef {
  id: string;
  name: string;
  desc: string;
  target: number;
  reward: number;
  getVal: (p: Player) => number;
}
const GUILD_QUESTS: QuestDef[] = [
  { id: 'wild_skirmish', name: 'Wild Skirmish', desc: 'Win 5 battles', target: 5, reward: 50, getVal: p => p.battlesWon },
  { id: 'tamer_bond', name: 'Tamer Bond', desc: 'Befriend 1 wild Guardian', target: 1, reward: 60, getVal: p => p.capturesMade },
  { id: 'mossdeep', name: 'Burrows Recon', desc: 'Conquer Mossdeep Burrows', target: 1, reward: 80, getVal: p => p.dungeonClears['mossdeep'] ?? 0 },
  { id: 'sunken', name: 'Vault Recon', desc: 'Conquer Sunken Vault', target: 1, reward: 80, getVal: p => p.dungeonClears['sunken'] ?? 0 },
  { id: 'thunderfen', name: 'Fen Recon', desc: 'Conquer Thunderfen Mire', target: 1, reward: 100, getVal: p => p.dungeonClears['thunderfen'] ?? 0 },
  { id: 'cradle', name: 'Cradle Recon', desc: 'Conquer Cradle Hollow', target: 1, reward: 120, getVal: p => p.dungeonClears['cradle'] ?? 0 },
  { id: 'stormspire', name: 'Spire Recon', desc: 'Conquer Stormspire Depths', target: 1, reward: 150, getVal: p => p.dungeonClears['stormspire'] ?? 0 },
];

interface PerkDef {
  key: keyof GuildPerks;
  name: string;
  desc: string;
  maxLvl: number;
  costFormula: (lvl: number) => number;
  effectDesc: (lvl: number) => string;
}
const GUILD_PERKS_DEFS: PerkDef[] = [
  {
    key: 'elementMastery',
    name: 'Element Mastery',
    desc: 'Permanent boost to all stats for your Guild Element (starts at +5%, +0.75% per level, max Lv. 10).',
    maxLvl: 10,
    costFormula: lvl => lvl * 100,
    effectDesc: lvl => `+${(5 + (lvl - 1) * 0.75).toFixed(2)}% stats`
  },
  {
    key: 'itemDiscount',
    name: 'Item Discount',
    desc: 'Discount on items purchased from Pina\'s Provisions and Celeste\'s Boutique (3% per level, max Lv. 5).',
    maxLvl: 5,
    costFormula: lvl => (lvl + 1) * 150,
    effectDesc: lvl => lvl > 0 ? `-${lvl * 3}% item prices` : 'Inactive'
  },
  {
    key: 'crawlerDiscount',
    name: 'Crawler Discount',
    desc: 'Discount on parts and paints purchased from Dax\'s Crawler Workshop (3% per level, max Lv. 5).',
    maxLvl: 5,
    costFormula: lvl => (lvl + 1) * 150,
    effectDesc: lvl => lvl > 0 ? `-${lvl * 3}% crawler prices` : 'Inactive'
  },
  {
    key: 'monoSynergy',
    name: 'Mono-Element Synergy',
    desc: 'Damage boost in Battle if all active, non-fainted party members share an element (+5% level 1, +1% per level after, max Lv. 5).',
    maxLvl: 5,
    costFormula: lvl => (lvl + 1) * 150,
    effectDesc: lvl => lvl > 0 ? `+${5 + (lvl - 1) * 1}% damage` : 'Inactive'
  },
  {
    key: 'rainbowSynergy',
    name: 'Rainbow Guard Synergy',
    desc: 'Damage reduction in Battle if active party contains 3+ distinct elements (-5% level 1, -1% per level after, max Lv. 5).',
    maxLvl: 5,
    costFormula: lvl => (lvl + 1) * 150,
    effectDesc: lvl => lvl > 0 ? `-${5 + (lvl - 1) * 1}% damage taken` : 'Inactive'
  },
  {
    key: 'tacticalSynergy',
    name: 'Tactical Strike Synergy',
    desc: 'Damage boost in Battle on super-effective element hits (+5% level 1, +1% per level after, max Lv. 5).',
    maxLvl: 5,
    costFormula: lvl => (lvl + 1) * 150,
    effectDesc: lvl => lvl > 0 ? `+${5 + (lvl - 1) * 1}% damage` : 'Inactive'
  }
];

export function openGuildPerksPanel(player: Player, houseColor: string, onClose?: () => void): void {
  const overlay = document.createElement('div');
  overlay.id = 'gperks-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(8, 10, 20, 0.95);
    backdrop-filter: blur(12px);
    z-index: 1000;
    color: #e5e9f0;
    font-family: 'Outfit', sans-serif;
    display: flex;
    flex-direction: column;
    padding: 24px;
    box-sizing: border-box;
    overflow-y: auto;
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #gperks-overlay h2, #gperks-overlay h3 { font-family: 'Georgia', serif; }
    .gperks-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid ${houseColor}55;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .gperks-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      flex: 1;
      min-height: 0;
    }
    .gperks-panel {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
    }
    .gperks-scroll {
      flex: 1;
      overflow-y: auto;
      padding-right: 8px;
    }
    .gperks-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s ease;
    }
    .gperks-card:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: ${houseColor}88;
    }
    .gperks-card-info {
      flex: 1;
      margin-right: 16px;
    }
    .gperks-card-title {
      font-weight: bold;
      color: #ffffff;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
    }
    .gperks-card-desc {
      font-size: 12px;
      color: #a0aabf;
      line-height: 1.4;
      margin-bottom: 6px;
    }
    .gperks-card-badge {
      display: inline-block;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #d1d9e6;
      font-weight: 500;
    }
    .gperks-card-effect {
      font-size: 11px;
      color: ${houseColor};
      margin-left: 8px;
      font-weight: bold;
    }
    .gperks-btn {
      background: ${houseColor}aa;
      border: 1px solid ${houseColor};
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .gperks-btn:hover:not(:disabled) {
      background: ${houseColor};
      transform: translateY(-1px);
    }
    .gperks-btn:disabled {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
      color: #5a607a;
      cursor: not-allowed;
    }
    .gperks-progress-bg {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      height: 14px;
      width: 100%;
      overflow: hidden;
      margin-top: 6px;
      position: relative;
    }
    .gperks-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, ${houseColor}cc, ${houseColor});
      transition: width 0.3s ease;
    }
    .gperks-progress-text {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      font-size: 10px;
      font-weight: bold;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .gperks-btn-claim {
      background: #5ad88a;
      border: 1px solid #48b773;
      color: #0c1022;
    }
    .gperks-btn-claim:hover:not(:disabled) {
      background: #6bec9c;
    }
  `;
  overlay.appendChild(styleEl);

  const draw = () => {
    const gp = player.guildPoints ?? 0;
    const perkLvl = (key: keyof GuildPerks) => player.guildPerks?.[key] ?? 0;

    let perksHtml = '';
    GUILD_PERKS_DEFS.forEach(pDef => {
      const lvl = perkLvl(pDef.key);
      const isMax = lvl >= pDef.maxLvl;
      const cost = isMax ? 0 : pDef.costFormula(lvl);
      const canUpgrade = !isMax && gp >= cost;
      
      perksHtml += `
        <div class="gperks-card">
          <div class="gperks-card-info">
            <div class="gperks-card-title">
              ${pDef.name}
              <span class="gperks-card-badge">Lv. ${lvl} / ${pDef.maxLvl}</span>
              <span class="gperks-card-effect">${pDef.effectDesc(lvl)}</span>
            </div>
            <div class="gperks-card-desc">${pDef.desc}</div>
          </div>
          <div>
            ${isMax ? `
              <button class="gperks-btn" disabled>Maxed</button>
            ` : `
              <button class="gperks-btn" data-upgrade="${pDef.key}" ${canUpgrade ? '' : 'disabled'}>
                Upgrade (◆${cost} GP)
              </button>
            `}
          </div>
        </div>
      `;
    });

    let questsHtml = '';
    GUILD_QUESTS.forEach(q => {
      if (player.guildQuestProgress[q.id] === undefined) {
        player.guildQuestProgress[q.id] = q.getVal(player);
      }
      const baseline = player.guildQuestProgress[q.id];
      const curVal = q.getVal(player);
      const rawProgress = Math.max(0, curVal - baseline);
      const progress = Math.min(q.target, rawProgress);
      const pct = (progress / q.target) * 100;
      const isReady = progress >= q.target;

      questsHtml += `
        <div class="gperks-card">
          <div class="gperks-card-info">
            <div class="gperks-card-title">
              ${q.name}
              <span class="gperks-card-badge">+${q.reward} GP</span>
            </div>
            <div class="gperks-card-desc">${q.desc}</div>
            <div class="gperks-progress-bg">
              <div class="gperks-progress-bar" style="width: ${pct}%"></div>
              <div class="gperks-progress-text">${progress} / ${q.target}</div>
            </div>
          </div>
          <div>
            <button class="gperks-btn ${isReady ? 'gperks-btn-claim' : ''}" data-claim="${q.id}" ${isReady ? '' : 'disabled'}>
              ${isReady ? 'Claim GP' : 'In Progress'}
            </button>
          </div>
        </div>
      `;
    });

    overlay.innerHTML = `
      ${styleEl.outerHTML}
      <div class="gperks-header">
        <div>
          <h2 style="margin: 0; font-size: 26px; color: var(--ui-gold);">🧬 GUILD PERKS & QUESTS</h2>
          <div style="font-size: 14px; color: #aab0c8; margin-top: 4px;">Earn Guild Points (GP) through quests to upgrade passive masteries.</div>
        </div>
        <div style="display: flex; gap: 20px; align-items: center;">
          <div style="font-size: 16px; font-weight: bold; background: rgba(255,255,255,0.05); padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #aab0c8;">Guild Points:</span>
            <span style="color: var(--ui-gold);">◆ ${gp} GP</span>
          </div>
          <button class="gperks-btn" id="gperks-back" style="background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #ffffff;">Back to Card</button>
        </div>
      </div>
      <div class="gperks-grid">
        <div class="gperks-panel" style="flex:1;min-height:0;">
          <h3 style="margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; color: #ffffff;">🧬 Upgrade Perks</h3>
          <div class="gperks-scroll">${perksHtml}</div>
        </div>
        <div class="gperks-panel" style="flex:1;min-height:0;">
          <h3 style="margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; color: #ffffff;">📋 Repeatable Guild Quests</h3>
          <div class="gperks-scroll">${questsHtml}</div>
        </div>
      </div>
    `;

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'esc') {
        window.removeEventListener('keydown', onKey);
        overlay.remove();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);

    (overlay.querySelector('#gperks-back') as HTMLElement).onclick = () => {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
      onClose?.();
    };

    overlay.querySelectorAll<HTMLElement>('[data-upgrade]').forEach(b => {
      b.onclick = () => {
        const key = b.dataset.upgrade as keyof GuildPerks;
        const curLvl = player.guildPerks[key] ?? 0;
        const pDef = GUILD_PERKS_DEFS.find(x => x.key === key)!;
        const cost = pDef.costFormula(curLvl);
        if ((player.guildPoints ?? 0) >= cost) {
          player.guildPoints = (player.guildPoints ?? 0) - cost;
          player.guildPerks[key] = (player.guildPerks[key] ?? 0) + 1;
          player.save();
          toast(`Upgraded ${pDef.name} to Level ${player.guildPerks[key]}!`, 'gold');
          draw();
        }
      };
    });

    overlay.querySelectorAll<HTMLElement>('[data-claim]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.claim!;
        const q = GUILD_QUESTS.find(x => x.id === id)!;
        const curVal = q.getVal(player);
        player.guildPoints = (player.guildPoints ?? 0) + q.reward;
        player.guildQuestProgress[id] = curVal;
        player.save();
        toast(`Claimed +${q.reward} GP from ${q.name}!`, 'gold');
        draw();
      };
    });
  };

  draw();
  document.getElementById('app')!.appendChild(overlay);
}
