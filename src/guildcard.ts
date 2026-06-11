// ============================================================
// AZ Tamer — Guild Card viewer: a 3D effigy-card presented in
// its own overlay. Slowly rotates, can be drag-rotated, shows
// the player's photo (uploadable) and rich guild service data.
// ============================================================
import * as THREE from 'three';
import { HOUSES } from './data';
import type { Player } from './state';
import { GUILD_LORE, drawCardFront, drawCardBack, makeEffigy, rankFor, shade } from './guilds';

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
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
