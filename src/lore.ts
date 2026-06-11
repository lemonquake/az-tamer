// ============================================================
// AZ Tamer — World Lore: the continents of the world, the three
// Legendary Tamers, and the Corrupted Legion they sealed away
// in Ghandra fifteen years ago.
// ============================================================
import type { Element } from './data';

// ---------------- the world ----------------
export const WORLD_LORE = {
  /** The four continents of the world. */
  continents: [
    {
      id: 'olivar', name: 'Olivar',
      desc: 'The Capital Region, governed under the Leodones line. Haven City and the Tamer University of Aurel stand here. Every year, hundreds of aspiring tamers gather in the capital to train and graduate as official Tamers. The five Grand Houses were raised in Olivar after the Legion War.',
    },
    {
      id: 'veyra', name: 'Veyra',
      desc: 'The western sea-continent of a thousand harbors. Mistveil pearl-divers map its drowned ruins; storms that begin over Veyra reach every other shore.',
    },
    {
      id: 'tharkand', name: 'Tharkand',
      desc: 'The eastern waste of red dunes and dead war-engines. The old empire fell hardest here, and Legion wreckage still hums beneath the sand.',
    },
    {
      id: 'noruun', name: 'Noruun',
      desc: 'The frozen south. Ice Guardians older than written history sleep beneath its glaciers, and the auroras above it are said to be Ghandra\'s reflection.',
    },
  ],
  /** Ghandra — the dimension at the center of the world. */
  ghandra: 'Ghandra is the center of the world — and yet on no map, for it lies folded inside its own dimension. Fifteen years ago the Corrupted Legion marshaled its armies there, waiting to pour into the world. Three friends went in. Only the Legion stayed behind, sealed. The seal is said to weaken a little every year.',
};

// ---------------- the three Legendary Tamers ----------------
export interface LegendDef {
  id: string;
  name: string;
  title: string;
  element: Element;
  color: string;
  partner: string;        // signature Guardian species id
  story: string;
}

export const LEGENDS: LegendDef[] = [
  {
    id: 'aljay', name: 'Aljay', title: 'The Dawnflame', element: 'Fire', color: '#f2603a',
    partner: 'solphyra',
    story: 'Leader of the three. Aljay walked into Ghandra carrying nothing but a lantern and the Phoenix of the First Dawn at his shoulder. Children across all four continents reenact his duel with Nyxghul using broom handles. He has not been seen publicly in years — every tamer claims to know someone who has met him.',
  },
  {
    id: 'greggy', name: 'Greggy', title: 'The Stormheart', element: 'Electric', color: '#f2d23a',
    partner: 'raidenjin',
    story: 'The Legion\'s armies learned to fear the sound of distant thunder. Greggy grounded the Storm-Tyrant Voltrazar with a coil he built overnight from scavenged war-engine parts. He still sends Dax\'s Garage handwritten schematics, which Dax frames instead of building.',
  },
  {
    id: 'onnel', name: 'Onnel', title: 'The Worldroot', element: 'Nature', color: '#4ec45e',
    partner: 'yggdranox',
    story: 'When the Legion\'s rot spread through the greenways, Onnel answered with the World Tree itself. It was Onnel who wove the seal that holds Ghandra shut — every spring, forests across the world bloom a day early in thanks. The Thornward Covenant keeps a chair empty at every feast for them.',
  },
];

// ---------------- the Corrupted Legion ----------------
// Nine corrupted Guardians, each carrying FOUR elements, each once
// the general of an army massed in Ghandra. Sealed — for now.
export interface LegionDef {
  speciesId: string;
  title: string;
  army: string;
}

export const CORRUPTED_LEGION: LegionDef[] = [
  { speciesId: 'ashkarath', title: 'General of Cinders', army: 'The Cinder Vanguard' },
  { speciesId: 'vormaela', title: 'Tide-Empress', army: 'The Drowned Choir' },
  { speciesId: 'bramblehex', title: 'The Rotwarden', army: 'The Withered March' },
  { speciesId: 'voltrazar', title: 'The Storm-Tyrant', army: 'The Iron Tempest' },
  { speciesId: 'gorrundax', title: 'Mountain-Eater', army: 'The Gravelborn Horde' },
  { speciesId: 'cryomara', title: 'Queen of the Still', army: 'The Silent Glacier' },
  { speciesId: 'luxavor', title: 'The False Dawn', army: 'The Blinding Host' },
  { speciesId: 'nyxghul', title: 'The Hollow Crown', army: 'The Crownless Legion' },
  { speciesId: 'zerathuul', title: 'The Rift-Herald', army: 'The Outer Procession' },
];

export const LEGION_WAR_SUMMARY =
  'Fifteen years ago, the Corrupted Legion — nine four-element Guardians of terrible power — massed their armies in Ghandra, the dimension at the center of the world, and prepared to invade. Three best friends stopped them: Aljay the Dawnflame, Greggy the Stormheart, and Onnel the Worldroot. The five Grand Houses of Olivar were founded in the war\'s aftermath to train the tamers who will stand ready should the seal ever break.';
