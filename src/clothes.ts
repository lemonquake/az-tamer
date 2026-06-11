import * as THREE from 'three';
import { makeVoxelHuman, canvasTex, mulberry } from './models';

export interface ClothesItem {
  id: string;
  name: string;
  slot: 'hat' | 'shirt' | 'pants' | 'gloves' | 'backpack' | 'shoes';
  price: number;
  desc: string;
  color?: number; // fallback hex color
  textureType?: 'denim' | 'wool' | 'plaid' | 'camo' | 'star' | 'cyber' | 'leather' | 'gold' | 'stripe';
  textureColor?: string;
  patternColor?: string;
  accentColor?: string;
}

export const CLOTHES_DATABASE: Record<string, ClothesItem> = {
  // HATS (6 items)
  default_cap: { id: 'default_cap', name: 'Default Red Cap', slot: 'hat', price: 0, desc: 'Your trusty starting tamer cap.', color: 0xd84a3a },
  wool_beanie: { id: 'wool_beanie', name: 'Knit Wool Beanie', slot: 'hat', price: 100, desc: 'A cozy beanie made of knitted pink wool.', textureType: 'wool', textureColor: '#d95a8a', patternColor: '#b03a6a' },
  camo_helmet: { id: 'camo_helmet', name: 'Stealth Camo Helmet', slot: 'hat', price: 250, desc: 'A tactical helmet with woodland camouflage.', textureType: 'camo', textureColor: '#556b2f', patternColor: '#2e8b57', accentColor: '#3e2723' },
  cyber_visor: { id: 'cyber_visor', name: 'Cyber Visor', slot: 'hat', price: 400, desc: 'A futuristic visor glowing with blue grids.', textureType: 'cyber', textureColor: '#0c1022', patternColor: '#3a9df2' },
  wizard_hat: { id: 'wizard_hat', name: 'Starry Wizard Hat', slot: 'hat', price: 500, desc: 'A pointed hat dotted with golden stars.', textureType: 'star', textureColor: '#1a103c', patternColor: '#f2c14e' },
  golden_crown: { id: 'golden_crown', name: 'Royal Crown', slot: 'hat', price: 800, desc: 'A majestic golden crown fit for an Apex tamer.', textureType: 'gold' },

  // SHIRTS (6 items)
  default_shirt: { id: 'default_shirt', name: 'Default Blue Shirt', slot: 'shirt', price: 0, desc: 'A comfortable cotton starting shirt.', color: 0x2a5ad8 },
  plaid_flannel: { id: 'plaid_flannel', name: 'Plaid Flannel', slot: 'shirt', price: 150, desc: 'A warm lumberjack shirt with red plaid pattern.', textureType: 'plaid', textureColor: '#b83a3a', patternColor: '#1a1a1a', accentColor: '#f2c14e' },
  camo_jacket: { id: 'camo_jacket', name: 'Camo Jacket', slot: 'shirt', price: 300, desc: 'A stealth military jacket with camo patterns.', textureType: 'camo', textureColor: '#3d4f26', patternColor: '#1a240f', accentColor: '#2b1b11' },
  wool_sweater: { id: 'wool_sweater', name: 'Knit Wool Sweater', slot: 'shirt', price: 200, desc: 'A thick, cozy sweater knitted with teal wool.', textureType: 'wool', textureColor: '#3aa88e', patternColor: '#246e5a' },
  cyber_plate: { id: 'cyber_plate', name: 'Cyber Armor Plating', slot: 'shirt', price: 600, desc: 'High-tech chest plating with cyan energy nodes.', textureType: 'cyber', textureColor: '#11162e', patternColor: '#00ffff' },
  star_hoodie: { id: 'star_hoodie', name: 'Cosmic Star Hoodie', slot: 'shirt', price: 550, desc: 'A dark hoodie shimmering with purple nebulae.', textureType: 'star', textureColor: '#0a0518', patternColor: '#d95af2' },

  // PANTS (5 items)
  default_pants: { id: 'default_pants', name: 'Default Grey Pants', slot: 'pants', price: 0, desc: 'Standard tamer work pants.', color: 0x32384e },
  blue_jeans: { id: 'blue_jeans', name: 'Classic Blue Jeans', slot: 'pants', price: 120, desc: 'Sturdy blue denim jeans.', textureType: 'denim', textureColor: '#3b5998' },
  camo_cargo: { id: 'camo_cargo', name: 'Camo Cargo Pants', slot: 'pants', price: 280, desc: 'Stealth cargo trousers with camo prints.', textureType: 'camo', textureColor: '#4d5c3d', patternColor: '#2b3322', accentColor: '#1b1f15' },
  striped_trousers: { id: 'striped_trousers', name: 'Striped Trousers', slot: 'pants', price: 220, desc: 'Fancy trousers with red and gold stripes.', textureType: 'stripe', textureColor: '#7a1a22', patternColor: '#d9a11a' },
  cyber_greaves: { id: 'cyber_greaves', name: 'Cybernetic Greaves', slot: 'pants', price: 500, desc: 'Robotic leg armor with orange glowing trim.', textureType: 'cyber', textureColor: '#1a1a1e', patternColor: '#f2603a' },

  // GLOVES (4 items)
  default_gloves: { id: 'default_gloves', name: 'Bare Hands', slot: 'gloves', price: 0, desc: 'No gloves equipped.' },
  wool_mittens: { id: 'wool_mittens', name: 'Knit Mittens', slot: 'gloves', price: 80, desc: 'Warm yellow wool gloves.', textureType: 'wool', textureColor: '#f2c14e', patternColor: '#c9a12e' },
  leather_gloves: { id: 'leather_gloves', name: 'Leather Bracers', slot: 'gloves', price: 180, desc: 'Tough, stitched brown leather gloves.', textureType: 'leather', textureColor: '#5a3818' },
  cyber_gloves: { id: 'cyber_gloves', name: 'Cyber Power Gloves', slot: 'gloves', price: 350, desc: 'Holographic gauntlets with yellow neon lines.', textureType: 'cyber', textureColor: '#12121a', patternColor: '#ffea00' },

  // BACKPACKS (4 items)
  default_backpack: { id: 'default_backpack', name: 'Default Brown Pack', slot: 'backpack', price: 0, desc: 'A basic leather travel bag.', textureType: 'leather', textureColor: '#8a5a2a' },
  striped_pack: { id: 'striped_pack', name: 'Striped Canvas Pack', slot: 'backpack', price: 160, desc: 'A cute bag with white and teal stripes.', textureType: 'stripe', textureColor: '#2a8a8e', patternColor: '#ffffff' },
  cyber_core: { id: 'cyber_core', name: 'Floating Cyber Core', slot: 'backpack', price: 700, desc: 'A hovering energy generator glowing with neon green.', textureType: 'cyber', textureColor: '#1a1a1f', patternColor: '#3af28a' },
  star_cape: { id: 'star_cape', name: 'Starry Travel Cloak', slot: 'backpack', price: 600, desc: 'A magical cloak resembling the night sky.', textureType: 'star', textureColor: '#08081a', patternColor: '#9ad8ff' },

  // SHOES (3 items)
  default_shoes: { id: 'default_shoes', name: 'Default Sneakers', slot: 'shoes', price: 0, desc: 'Simple dark tamer boots.', color: 0x23262e },
  leather_boots: { id: 'leather_boots', name: 'Leather Trail Boots', slot: 'shoes', price: 140, desc: 'Heavy-duty brown leather trail boots.', textureType: 'leather', textureColor: '#3a220f' },
  cyber_boots: { id: 'cyber_boots', name: 'Cybernetic Boots', slot: 'shoes', price: 450, desc: 'Gravitational thruster boots glowing neon green.', textureType: 'cyber', textureColor: '#1c1c24', patternColor: '#3af28a' }
};

// Cached textures to prevent re-creation
const textureCache = new Map<string, THREE.Texture>();

function applyVoxelShading(ctx: CanvasRenderingContext2D, size: number) {
  // Bevel highlights (top and left edges)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(0, 0, size, size * 0.08); // top
  ctx.fillRect(0, 0, size * 0.08, size); // left

  // Bevel shadows (bottom and right edges)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, size - size * 0.08, size, size * 0.08); // bottom
  ctx.fillRect(size - size * 0.08, 0, size * 0.08, size); // right

  // Vignette gradient for volumetric feel
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.65);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function denimTexture(baseColor = '#3b5998'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const rnd = mulberry(123);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = -s; i < s; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + s, s);
      ctx.stroke();
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    applyVoxelShading(ctx, s);
  });
}

function knitTexture(baseColor = '#d95a8a', patternColor = 'rgba(0,0,0,0.15)'): THREE.Texture {
  return canvasTex(64, (ctx, s) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = patternColor;
    const cols = 8;
    const w = s / cols;
    for (let x = 0; x < s; x += w) {
      for (let y = 0; y < s; y += 8) {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x + w, y + 5);
        ctx.fill();
      }
    }
    applyVoxelShading(ctx, s);
  });
}

function plaidTexture(baseColor = '#b83a3a', stripeColor = '#222222', accentColor = '#e8c85a'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = stripeColor;
    ctx.globalAlpha = 0.45;
    const band = 16;
    for (let x = 0; x < s; x += 32) {
      ctx.fillRect(x, 0, band, s);
      ctx.fillRect(0, x, s, band);
    }
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    for (let x = 8; x < s; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(s, x); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
    applyVoxelShading(ctx, s);
  });
}

function camoTexture(baseColor = '#556b2f', spot1 = '#2e8b57', spot2 = '#3e2723'): THREE.Texture {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    const rnd = mulberry(999);
    ctx.globalAlpha = 0.75;
    const drawBlobs = (color: string, count: number) => {
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const cx = rnd() * s, cy = rnd() * s;
        ctx.beginPath();
        ctx.arc(cx, cy, 12 + rnd() * 24, 0, Math.PI * 2);
        ctx.fill();
        for (let j = 0; j < 4; j++) {
          ctx.beginPath();
          const angle = rnd() * Math.PI * 2;
          const dist = rnd() * 20;
          ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 8 + rnd() * 16, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    drawBlobs(spot1, 15);
    drawBlobs(spot2, 12);
    ctx.globalAlpha = 1.0;
    applyVoxelShading(ctx, s);
  });
}

function starTexture(baseColor = '#120c24', starColor = '#e8d25a'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 5, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, '#3a1a5e');
    grad.addColorStop(1, baseColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    const rnd = mulberry(777);
    ctx.fillStyle = starColor;
    for (let i = 0; i < 40; i++) {
      const sx = rnd() * s, sy = rnd() * s;
      const size = 1 + rnd() * 2.5;
      ctx.fillRect(sx, sy, size, size);
      if (rnd() > 0.8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy);
        ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4);
        ctx.stroke();
      }
    }
    applyVoxelShading(ctx, s);
  });
}

function cyberTexture(baseColor = '#0d0d16', glowColor = '#3a9df2'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i <= s; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    for (let x = 0; x <= s; x += 32) {
      for (let y = 0; y <= s; y += 32) {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1.0;
    applyVoxelShading(ctx, s);
  });
}

function leatherTexture(baseColor = '#4a2d18'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, s, s);
    const rnd = mulberry(1010);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += rnd() * 10 - 5;
        y += rnd() * 6 - 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    applyVoxelShading(ctx, s);
  });
}

function goldTexture(baseColor = '#d9b85a'): THREE.Texture {
  return canvasTex(128, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#f2d23a');
    grad.addColorStop(0.3, '#d9a11a');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.7, '#d9a11a');
    grad.addColorStop(1, '#8a6205');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    const rnd = mulberry(1111);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rnd() * 20 - 10;
        y += rnd() * 20 - 10;
        ctx.bezierCurveTo(x + rnd() * 10, y, x, y + rnd() * 10, x, y);
      }
      ctx.stroke();
    }
    applyVoxelShading(ctx, s);
  });
}

export function getClothesTexture(itemId: string): THREE.Texture | null {
  if (textureCache.has(itemId)) {
    return textureCache.get(itemId)!;
  }
  const item = CLOTHES_DATABASE[itemId];
  if (!item || !item.textureType) return null;

  let tex: THREE.Texture;
  switch (item.textureType) {
    case 'denim':
      tex = denimTexture(item.textureColor);
      break;
    case 'wool':
      tex = knitTexture(item.textureColor, item.patternColor);
      break;
    case 'plaid':
      tex = plaidTexture(item.textureColor, item.patternColor, item.accentColor);
      break;
    case 'camo':
      tex = camoTexture(item.textureColor, item.patternColor, item.accentColor);
      break;
    case 'star':
      tex = starTexture(item.textureColor, item.patternColor);
      break;
    case 'cyber':
      tex = cyberTexture(item.textureColor, item.patternColor);
      break;
    case 'leather':
      tex = leatherTexture(item.textureColor);
      break;
    case 'gold':
      tex = goldTexture();
      break;
    case 'stripe':
      tex = canvasTex(64, (ctx, s) => {
        ctx.fillStyle = item.textureColor || '#ffffff';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = item.patternColor || '#aaaaaa';
        ctx.fillRect(0, 0, s, s / 2);
        applyVoxelShading(ctx, s);
      }, 4);
      break;
    default:
      return null;
  }
  textureCache.set(itemId, tex);
  return tex;
}

export function updateTamerAppearance(tamer: THREE.Group, equipped: Record<string, string>): void {
  // Clear existing tamer hierarchy
  while (tamer.children.length > 0) {
    tamer.remove(tamer.children[0]);
  }

  // Resolve VoxelHumanOpts from active equipment
  const opts: any = {};

  const getMatOrColor = (slot: string, fallbackColor: number) => {
    const itemId = equipped[slot];
    const item = CLOTHES_DATABASE[itemId];
    if (!item) return { color: fallbackColor, tex: null };
    if (item.textureType) {
      return { color: item.color, tex: getClothesTexture(itemId) };
    }
    return { color: item.color ?? fallbackColor, tex: null };
  };

  // Hat/Cap
  const hatVal = getMatOrColor('hat', 0xd84a3a);
  if (equipped.hat === 'none') {
    opts.cap = null;
    opts.capTex = null;
  } else {
    opts.cap = hatVal.color;
    opts.capColor = hatVal.color;
    opts.capTex = hatVal.tex;
  }

  // Shirt
  const shirtVal = getMatOrColor('shirt', 0x2a5ad8);
  opts.top = shirtVal.color;
  opts.topColor = shirtVal.color;
  opts.topTex = shirtVal.tex;
  opts.sleeves = shirtVal.color;
  opts.sleeveColor = shirtVal.color;
  opts.sleeveTex = shirtVal.tex;

  // Pants
  const pantsVal = getMatOrColor('pants', 0x32384e);
  opts.bottom = pantsVal.color;
  opts.bottomColor = pantsVal.color;
  opts.bottomTex = pantsVal.tex;

  // Gloves
  if (equipped.gloves === 'default_gloves' || !equipped.gloves) {
    opts.glovesColor = undefined;
    opts.glovesTex = null;
  } else {
    const glovesVal = getMatOrColor('gloves', 0x11162e);
    opts.glovesColor = glovesVal.color;
    opts.glovesTex = glovesVal.tex;
  }

  // Backpack
  if (equipped.backpack === 'none') {
    opts.backpackColor = undefined;
    opts.backpackTex = null; // will prevent rendering
  } else {
    const packVal = getMatOrColor('backpack', 0x8a5a2a);
    opts.backpackColor = packVal.color;
    opts.backpackTex = packVal.tex || undefined;
  }

  // Shoes
  const shoesVal = getMatOrColor('shoes', 0x23262e);
  opts.shoes = shoesVal.color;
  opts.shoeColor = shoesVal.color;
  opts.shoeTex = shoesVal.tex;

  // Build new VoxelHuman model using extended options
  const newHuman = makeVoxelHuman(opts);

  // Transfer all sub-groups & meshes (e.g. pelvis)
  while (newHuman.children.length > 0) {
    const child = newHuman.children[0];
    tamer.add(child);
  }

  // Keep animations going smoothly by syncing userData
  tamer.userData = { ...newHuman.userData, ...tamer.userData };
}
