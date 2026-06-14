import * as THREE from 'three';
import { makeVoxelHuman, canvasTex, mulberry, DEFAULT_APPEARANCE, type Appearance } from './models';
import { attachCosmeticFx, type FxSpec, type FxSlot } from './cosmetics';

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
  terra?: boolean;  // sold only at Terra City's Aetherline Atelier
  fx?: FxSpec;      // animated prestige effect layered on the rig
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
  cyber_boots: { id: 'cyber_boots', name: 'Cybernetic Boots', slot: 'shoes', price: 450, desc: 'Gravitational thruster boots glowing neon green.', textureType: 'cyber', textureColor: '#1c1c24', patternColor: '#3af28a' },

  // ---- the new Aurel collection ----
  straw_sunhat: { id: 'straw_sunhat', name: 'Meadow Sunhat', slot: 'hat', price: 90, desc: 'Woven straw from the windmill hill. Smells like summer.', textureType: 'wool', textureColor: '#d9b85a', patternColor: '#b8983a' },
  aviator_cap: { id: 'aviator_cap', name: 'Skyrider Cap', slot: 'hat', price: 320, desc: 'Oiled leather flight cap, Gale-courier issue.', textureType: 'leather', textureColor: '#4a2d18' },
  legend_circlet: { id: 'legend_circlet', name: 'Dawnflame Circlet', slot: 'hat', price: 950, desc: 'A Coliseum replica of Aljay\'s circlet — gold with an ember\'s heart.', textureType: 'gold' },

  guild_tunic: { id: 'guild_tunic', name: 'Guild Parade Tunic', slot: 'shirt', price: 260, desc: 'Crisp ceremonial stripes for festival days on the plaza.', textureType: 'stripe', textureColor: '#8a2e4a', patternColor: '#d9a11a' },
  leather_vest: { id: 'leather_vest', name: 'Wayfarer Vest', slot: 'shirt', price: 240, desc: 'Scuffed expedition leather, pockets included (decorative).', textureType: 'leather', textureColor: '#5a3a1e' },
  aether_robe: { id: 'aether_robe', name: 'Aetherweave Robe', slot: 'shirt', price: 900, desc: 'Shimmer-cloth said to be dyed in halo-light. Faintly warm.', textureType: 'star', textureColor: '#241030', patternColor: '#ff9ad2' },

  wool_joggers: { id: 'wool_joggers', name: 'Hearth Joggers', slot: 'pants', price: 160, desc: 'Knitted comfort for long evenings at the pond.', textureType: 'wool', textureColor: '#7a5a8e', patternColor: '#5a3a6e' },
  gold_greaves: { id: 'gold_greaves', name: 'Champion\'s Greaves', slot: 'pants', price: 850, desc: 'Coliseum-finals gold. Heavy. Worth it.', textureType: 'gold' },

  star_gauntlets: { id: 'star_gauntlets', name: 'Nightsky Gauntlets', slot: 'gloves', price: 420, desc: 'Gloves stitched with the constellations over Noruun.', textureType: 'star', textureColor: '#0c1024', patternColor: '#9ad8ff' },

  gem_satchel: { id: 'gem_satchel', name: 'Gemcutter\'s Satchel', slot: 'backpack', price: 380, desc: 'Korr\'s own design — padded for precious cargo.', textureType: 'plaid', textureColor: '#3a2a4a', patternColor: '#1a1228', accentColor: '#d9a11a' },

  plaid_sneakers: { id: 'plaid_sneakers', name: 'Market-Day Plimsolls', slot: 'shoes', price: 130, desc: 'Cheerful plaid canvas, Tilda-approved.', textureType: 'plaid', textureColor: '#b83a3a', patternColor: '#2a2a2a', accentColor: '#f2c14e' },
  gold_treads: { id: 'gold_treads', name: 'Gilded Striders', slot: 'shoes', price: 780, desc: 'For tamers who want their footsteps remembered.', textureType: 'gold' },

  // ============================================================
  // TERRA CITY — the Aetherline Atelier prestige collection.
  // Animated, glowing, expensive (◆8,000–◆40,000). Each carries an
  // `fx` spec rendered by cosmetics.ts and only sold in Terra City.
  // ============================================================

  // ---- HATS: spinning, flaming, cosmic, crowned ----
  terra_heli_cyan: { id: 'terra_heli_cyan', name: 'Skyspin Rotor Crown', slot: 'hat', price: 8500, desc: 'A live four-blade rotor whirs above your crown, washing cyan light over the plaza.', color: 0x18222e, terra: true, fx: { kind: 'heli', color: 0x6fe0ff, speed: 1 } },
  terra_heli_gold: { id: 'terra_heli_gold', name: 'Aurelian Rotorcrown', slot: 'hat', price: 18000, desc: 'A five-blade championship rotor in Worldring gold. It never stops turning.', color: 0x2a2210, terra: true, fx: { kind: 'heli', color: 0xf2c14e, speed: 1.1, scale: 1.2 } },
  terra_propeller: { id: 'terra_propeller', name: 'Voltwake Propeller Cap', slot: 'hat', price: 8000, desc: 'A tri-color propeller beanie, every blade a different neon. Pure Voltwake mischief.', color: 0x1a2030, terra: true, fx: { kind: 'propeller', color: 0xff5aa8, speed: 1 } },
  terra_flame_inferno: { id: 'terra_flame_inferno', name: 'Inferno Diadem', slot: 'hat', price: 12000, desc: 'A living crown of fire crackling with rising embers. Warm to stand near.', color: 0x2a1208, terra: true, fx: { kind: 'flame', color: 0xff7a1a, color2: 0xffe23a } },
  terra_flame_frost: { id: 'terra_flame_frost', name: 'Cryoflame Crown', slot: 'hat', price: 13500, desc: 'Cold fire that burns pale blue — flame without heat, the Lumenwrights\' parlor trick.', color: 0x0e2230, terra: true, fx: { kind: 'flame', color: 0x4fd6ff, color2: 0xffffff } },
  terra_flame_void: { id: 'terra_flame_void', name: 'Voidfire Coronet', slot: 'hat', price: 17000, desc: 'Magenta voidfire licks upward in absolute silence. Unsettling. Magnificent.', color: 0x22102a, terra: true, fx: { kind: 'flame', color: 0xc23aff, color2: 0xff5aa8 } },
  terra_cosmic_orb: { id: 'terra_cosmic_orb', name: 'Cosmic Orb Circlet', slot: 'hat', price: 22000, desc: 'A floating violet star ringed by orbiting moons and a halo of drifting stars.', color: 0x161028, terra: true, fx: { kind: 'cosmic_orb', color: 0x9a6cff, color2: 0x6fe0ff } },
  terra_halo: { id: 'terra_halo', name: 'Aetherline Halo', slot: 'hat', price: 15000, desc: 'A slow-spinning ring of gold light hovering a hand above your head. Saintly.', color: 0x2a2410, terra: true, fx: { kind: 'halo', color: 0xffe27a } },
  terra_atom: { id: 'terra_atom', name: 'Quantum Nucleus Cap', slot: 'hat', price: 16000, desc: 'A glowing nucleus orbited by three electrons on tilted rings. Engineer Vire approves.', color: 0x0e2418, terra: true, fx: { kind: 'atom', color: 0x5aff9a } },
  terra_antenna: { id: 'terra_antenna', name: 'Signal-Crown Antennae', slot: 'hat', price: 9500, desc: 'Twin antennae with pulsing tip-lights and an arc that crackles between them.', color: 0x141c28, terra: true, fx: { kind: 'antenna', color: 0x6fe0ff } },
  terra_plasma_crown: { id: 'terra_plasma_crown', name: 'Plasma Diadem', slot: 'hat', price: 14000, desc: 'A gold band crowned with eight dancing plasma spikes. Royalty, rewired.', color: 0x2a1422, terra: true, fx: { kind: 'plasma_crown', color: 0xff5aa8 } },
  terra_saturn: { id: 'terra_saturn', name: 'Ringworld Coronet', slot: 'hat', price: 19000, desc: 'A tiny ringed planet turns above your head, its three rings tilted just so.', color: 0x2a1e0c, terra: true, fx: { kind: 'saturn', color: 0xf2c14e, color2: 0xff8a3a } },
  terra_stormcloud: { id: 'terra_stormcloud', name: 'Thunderhead Topper', slot: 'hat', price: 16500, desc: 'A little storm cloud follows your head, flickering lightning at random.', color: 0x1a2230, terra: true, fx: { kind: 'stormcloud', color: 0xbfe8ff } },
  terra_sparkler: { id: 'terra_sparkler', name: 'Festival Sparkler Crown', slot: 'hat', price: 11000, desc: 'Bursts of gold sparks erupt over your head on a festival rhythm. Finals-night ready.', color: 0x2a2410, terra: true, fx: { kind: 'sparkler', color: 0xffd23a } },
  terra_prism: { id: 'terra_prism', name: 'Prismatic Halo-Crown', slot: 'hat', price: 25000, desc: 'A spinning crystal scatters a slow rainbow of light-motes around your head.', color: 0x1a1a24, terra: true, fx: { kind: 'prism', color: 0xffffff } },

  // ---- SHIRTS: chrome, flashing, reactor, holographic ----
  terra_chrome_silver: { id: 'terra_chrome_silver', name: 'Chrome Mirror Jersey', slot: 'shirt', price: 14000, desc: 'Liquid-chrome plating with a highlight that sweeps across it as you move.', color: 0x3a4150, terra: true, fx: { kind: 'chrome', color: 0x5a6478, color2: 0xffffff } },
  terra_chrome_gold: { id: 'terra_chrome_gold', name: 'Gilded Mirror Plate', slot: 'shirt', price: 20000, desc: 'Mirror-polished gold that throws a moving streak of white light. Obscene. Perfect.', color: 0x4a3a14, terra: true, fx: { kind: 'chrome', color: 0x8a6a1a, color2: 0xfff0a0 } },
  terra_flash_suit: { id: 'terra_flash_suit', name: 'Pulsewave Flash Suit', slot: 'shirt', price: 24000, desc: 'A black bodysuit veined with light-strips that flash and bleed cyan to magenta.', color: 0x0c1018, terra: true, fx: { kind: 'flash_suit', color: 0x4fa8ff, color2: 0xff5aa8, speed: 1 } },
  terra_arc_reactor: { id: 'terra_arc_reactor', name: 'Arc-Reactor Vest', slot: 'shirt', price: 21000, desc: 'A plated vest built around a pulsing chest reactor with a spinning containment ring.', color: 0x232c3c, terra: true, fx: { kind: 'arc_reactor', color: 0x6fe0ff } },
  terra_circuit_jersey: { id: 'terra_circuit_jersey', name: 'Livewire Circuit Jersey', slot: 'shirt', price: 13000, desc: 'Acid-green circuit traces flow endlessly across the weave like current through copper.', color: 0x223040, terra: true, fx: { kind: 'circuit_jersey', color: 0x5aff9a } },
  terra_holo_shimmer: { id: 'terra_holo_shimmer', name: 'Holo-Shimmer Bodysuit', slot: 'shirt', price: 18000, desc: 'A translucent holographic skin that shimmers through the spectrum as light hits it.', color: 0x1a2a3a, terra: true, fx: { kind: 'holo_shimmer', color: 0x6fe0ff } },
  terra_aurora_mantle: { id: 'terra_aurora_mantle', name: 'Aurora Mantle', slot: 'shirt', price: 20000, desc: 'Ribbons of aurora light ripple from the shoulders in slow teal-and-violet waves.', color: 0x0a0e1c, terra: true, fx: { kind: 'aurora_mantle', color: 0x5affc8, color2: 0x9a6cff } },
  terra_magma_plate: { id: 'terra_magma_plate', name: 'Magmacore Plate', slot: 'shirt', price: 19000, desc: 'Cracked black armor with molten seams that pulse and shed rising embers.', color: 0x2a1410, terra: true, fx: { kind: 'magma_plate', color: 0xff5a1a } },
  terra_nebula_suit: { id: 'terra_nebula_suit', name: 'Nebula Voidsuit', slot: 'shirt', price: 22000, desc: 'A deep-space suit holding a slow-drifting starfield that twinkles as you walk.', color: 0x141026, terra: true, fx: { kind: 'nebula_suit', color: 0x9a6cff } },

  // ---- COSTUMES: full transformations ----
  terra_robo: { id: 'terra_robo', name: 'MK-Sentinel Robo Frame', slot: 'shirt', price: 32000, desc: 'A complete chrome robo exoframe — helmet visor, chest core, pauldrons, the works.', color: 0x2a3142, terra: true, fx: { kind: 'robo', color: 0x6fe0ff } },
  terra_mecha: { id: 'terra_mecha', name: 'Titan Mecha Carapace', slot: 'shirt', price: 38000, desc: 'A heavy mech carapace with a scrolling chest-screen, vents, and a crested war-helm.', color: 0x3a4252, terra: true, fx: { kind: 'mecha', color: 0xff8a1a } },
  terra_star_paladin: { id: 'terra_star_paladin', name: 'Star-Paladin Regalia', slot: 'shirt', price: 36000, desc: 'Gilded paladin armor, a living star-cape, and four shards orbiting your shoulders.', color: 0xe8d28a, terra: true, fx: { kind: 'star_paladin', color: 0x9ad8ff } },
  terra_gridrunner: { id: 'terra_gridrunner', name: 'Gridrunner Neon Skin', slot: 'shirt', price: 30000, desc: 'A jet-black suit edged head-to-toe in pulsing neon grid-lines. Pure Tron energy.', color: 0x05070e, terra: true, fx: { kind: 'gridrunner', color: 0x00e5ff } },
  terra_phoenix: { id: 'terra_phoenix', name: 'Dawnflame Phoenix Garb', slot: 'shirt', price: 40000, desc: 'The Atelier\'s masterwork: ember-armor crowned by two beating wings of living flame.', color: 0x6a1a0a, terra: true, fx: { kind: 'phoenix', color: 0xff6a1a, color2: 0xffd23a } },

  // ---- PANTS ----
  terra_volt_greaves: { id: 'terra_volt_greaves', name: 'Voltline Greaves', slot: 'pants', price: 9000, desc: 'Plated greaves with twin acid-green light-channels that pulse as you stride.', color: 0x232c3c, terra: true, fx: { kind: 'volt_greaves', color: 0x5aff9a } },
  terra_ember_legs: { id: 'terra_ember_legs', name: 'Emberstride Trousers', slot: 'pants', price: 9500, desc: 'Charcoal trousers that trail rising embers from the shins with every step.', color: 0x2a1410, terra: true, fx: { kind: 'ember_legs', color: 0xff5a1a } },
  terra_circuit_legs: { id: 'terra_circuit_legs', name: 'Circuit-Trace Leggings', slot: 'pants', price: 9000, desc: 'Dark greaves veined in cyan trace-light that breathes in time with the city.', color: 0x232c3c, terra: true, fx: { kind: 'volt_greaves', color: 0x6fe0ff } },

  // ---- SHOES / BOOTS ----
  terra_thruster_cyan: { id: 'terra_thruster_cyan', name: 'Sky-Thruster Boots', slot: 'shoes', price: 12000, desc: 'Each boot ends in a roaring blue jet. They look one breath away from lift-off.', color: 0x2a3242, terra: true, fx: { kind: 'thruster', color: 0x4fa8ff, color2: 0xffffff } },
  terra_thruster_orange: { id: 'terra_thruster_orange', name: 'Nova Rocket Boots', slot: 'shoes', price: 13000, desc: 'Hot orange rocket-flame pours from the soles. Mind the scorch marks.', color: 0x2a1c10, terra: true, fx: { kind: 'thruster', color: 0xff7a1a, color2: 0xffe23a } },
  terra_glow_sole: { id: 'terra_glow_sole', name: 'Lumen-Tread Sneakers', slot: 'shoes', price: 8000, desc: 'Soles that glow acid-green and breathe a soft light-ring onto the ground.', color: 0x16201a, terra: true, fx: { kind: 'glow_sole', color: 0x5aff9a } },
  terra_hover_disc: { id: 'terra_hover_disc', name: 'Hover-Disc Striders', slot: 'shoes', price: 17000, desc: 'You stand a finger\'s width off the ground on two humming anti-grav discs.', color: 0x2a3242, terra: true, fx: { kind: 'hover_disc', color: 0x6fe0ff } },
  terra_cryo_step: { id: 'terra_cryo_step', name: 'Cryostep Boots', slot: 'shoes', price: 11000, desc: 'Frosted boots that breathe a pale mist and crust the floor with ice-spikes.', color: 0xbfe0f0, terra: true, fx: { kind: 'cryo_step', color: 0xa8e8ff } },
  terra_spark_heel: { id: 'terra_spark_heel', name: 'Static-Kick Boots', slot: 'shoes', price: 8500, desc: 'Gold static bolts snap off the heels in time with your steps.', color: 0x1a1d28, terra: true, fx: { kind: 'spark_heel', color: 0xffd23a } },

  // ---- BACKPACKS ----
  terra_energy_wings: { id: 'terra_energy_wings', name: 'Aetherwing Pack', slot: 'backpack', price: 26000, desc: 'Two great wings of layered energy-feathers that beat slowly at your back.', terra: true, fx: { kind: 'energy_wings', color: 0x6fe0ff, color2: 0xb15aff } },
  terra_fusion_pack: { id: 'terra_fusion_pack', name: 'Fusion Reactor Pack', slot: 'backpack', price: 19000, desc: 'A backpack reactor with a spinning acid-green core and venting heat-light.', terra: true, fx: { kind: 'fusion_pack', color: 0x5aff9a } },
  terra_jetpack: { id: 'terra_jetpack', name: 'Nova Jetpack', slot: 'backpack', price: 21000, desc: 'Twin fuel tanks and idling orange thrust-flames. Strictly for the look. Mostly.', terra: true, fx: { kind: 'jetpack', color: 0xff8a1a } },
  terra_orb_companion: { id: 'terra_orb_companion', name: 'Spark-Sprite Companion', slot: 'backpack', price: 23000, desc: 'A little ringed light-sprite drifts and loops at your shoulder, trailing sparks.', terra: true, fx: { kind: 'orb_companion', color: 0x6fe0ff } },
  terra_comet_cape: { id: 'terra_comet_cape', name: 'Comet-Trail Cape', slot: 'backpack', price: 18000, desc: 'A flowing starlit cape that ripples like a comet\'s tail behind you.', terra: true, fx: { kind: 'comet_cape', color: 0x4fa8ff } },

  // ---- GLOVES ----
  terra_plasma_gauntlet: { id: 'terra_plasma_gauntlet', name: 'Plasma Gauntlets', slot: 'gloves', price: 12000, desc: 'Heavy gauntlets cradling a ball of magenta plasma in each palm.', color: 0x2a3242, terra: true, fx: { kind: 'plasma_gauntlet', color: 0xff5aa8 } },
  terra_ion_claw: { id: 'terra_ion_claw', name: 'Ion Claws', slot: 'gloves', price: 14000, desc: 'Three blades of acid-green ion-light extend from each knuckle. Purely decorative. Probably.', color: 0x1a1d28, terra: true, fx: { kind: 'ion_claw', color: 0x5aff9a } },
  terra_powercell_fist: { id: 'terra_powercell_fist', name: 'Powercell Fists', slot: 'gloves', price: 16000, desc: 'Bulky power-fists with glowing orange cells stacked across each knuckle.', color: 0x3a4252, terra: true, fx: { kind: 'powercell_fist', color: 0xff8a1a } },
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

export function updateTamerAppearance(tamer: THREE.Group, equipped: Record<string, string>, appearance?: Appearance): void {
  // Tear down any prestige FX from the previous outfit (frees GPU resources).
  const prevDispose = (tamer.userData as { fxDispose?: () => void }).fxDispose;
  if (prevDispose) prevDispose();

  // Clear existing tamer hierarchy
  while (tamer.children.length > 0) {
    tamer.remove(tamer.children[0]);
  }

  // Resolve VoxelHumanOpts from active equipment + the tamer's own look
  const app = appearance ?? DEFAULT_APPEARANCE;
  const opts: any = {
    skin: app.skin,
    hair: app.hair,
    hairstyle: app.hairstyle,
  };

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

  // Layer on any animated prestige effects (Terra City boutique gear).
  const fxItems: { slot: FxSlot; spec: FxSpec }[] = [];
  for (const slot of ['hat', 'shirt', 'pants', 'gloves', 'backpack', 'shoes'] as FxSlot[]) {
    const id = equipped[slot];
    if (!id || id === 'none') continue;
    const item = CLOTHES_DATABASE[id];
    if (item?.fx) fxItems.push({ slot, spec: item.fx });
  }
  if (fxItems.length) {
    const { updaters, dispose } = attachCosmeticFx(tamer, fxItems);
    const ud = tamer.userData as { fxUpdaters?: unknown; fxDispose?: () => void; fxT?: number };
    ud.fxUpdaters = updaters;
    ud.fxDispose = dispose;
    ud.fxT = 0;
  } else {
    const ud = tamer.userData as { fxUpdaters?: unknown; fxDispose?: () => void };
    ud.fxUpdaters = undefined;
    ud.fxDispose = undefined;
  }
}
