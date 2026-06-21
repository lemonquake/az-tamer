// One-shot extractor: bundle the REAL game data + lore and dump a complete
// JSON the PDF generator consumes. Run via:
//   node_modules/.bin/esbuild gen/extract.ts --bundle --platform=node --format=cjs --outfile=gen/extract.cjs
//   node gen/extract.cjs
import * as fs from 'fs';
import {
  SPECIES, ELEMENT_CHART, TYPE_CHART, ELEMENTS, STAGES, STAGE_RANK, STAGE_KIND_LABEL,
  ELEMENT_CSS, ELEMENT_ICONS, TYPE_CSS, TYPE_COLORS, BIG3_LEGEND_IDS, SIGNATURE_TECH,
  TECHS, formRank, elementsOf, getSpeciesPassive,
} from '../src/data';
import { LEGENDS, CORRUPTED_LEGION, LEGION_WAR_SUMMARY, WORLD_TIMELINE } from '../src/lore';

const hex = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
const big3 = new Set<string>(BIG3_LEGEND_IDS as readonly string[]);

const species = Object.values(SPECIES).map((sp) => ({
  id: sp.id, name: sp.name, type: sp.type, stage: sp.stage, rank: formRank(sp),
  archetype: sp.archetype, elements: elementsOf(sp.id),
  base: sp.base, growth: sp.growth,
  evolvesTo: sp.evolvesTo ?? null, extraEvolvesTo: sp.extraEvolvesTo ?? null, ascendsTo: sp.ascendsTo ?? null,
  isFusion: !!sp.isFusion, isBoss: !!sp.isBoss, isBig3: big3.has(sp.id),
  palette: { primary: hex(sp.palette.primary), secondary: hex(sp.palette.secondary), accent: hex(sp.palette.accent) },
  desc: sp.desc, captureBase: sp.captureBase, scale: sp.scale,
  passive: getSpeciesPassive(sp),
  signature: SIGNATURE_TECH[sp.id] ?? null,
  techs: sp.techs.map(t => ({
    level: t.level, id: t.tech, name: TECHS[t.tech]?.name ?? t.tech,
    power: TECHS[t.tech]?.power ?? 0, kind: TECHS[t.tech]?.kind ?? '',
    target: TECHS[t.tech]?.target ?? '', effect: TECHS[t.tech]?.effect ?? '',
    signature: !!TECHS[t.tech]?.signature, cooldown: TECHS[t.tech]?.cooldown ?? 0,
  })),
}));

const out = {
  generatedSpecies: species.length,
  species,
  meta: {
    elements: ELEMENTS,
    stages: STAGES, stageRank: STAGE_RANK, stageKindLabel: STAGE_KIND_LABEL,
    elementCss: ELEMENT_CSS, elementIcons: ELEMENT_ICONS, typeCss: TYPE_CSS,
    typeColors: Object.fromEntries(Object.entries(TYPE_COLORS).map(([k, v]) => [k, hex(v as number)])),
    elementChart: ELEMENT_CHART, typeChart: TYPE_CHART, big3: BIG3_LEGEND_IDS,
  },
  lore: {
    legends: LEGENDS,
    corruptedLegion: CORRUPTED_LEGION,
    legionSummary: LEGION_WAR_SUMMARY,
    timeline: WORLD_TIMELINE,
  },
};

fs.mkdirSync('gen', { recursive: true });
fs.writeFileSync('gen/guardians.json', JSON.stringify(out, null, 2));
console.log('Wrote gen/guardians.json —', species.length, 'species,',
  (out.lore.legends as any[]).length, 'legends,', (out.lore.corruptedLegion as any[]).length, 'legion generals.');
