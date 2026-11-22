/**
 * One-off migration from the v0 Leaflet prototype's data layout. Already run; kept for provenance.
 *
 * Inputs : data/sources/mobalytics-v0.json   (raw Mobalytics snapshot, 2026-11-21)
 *          data/sources/region-info.v0.js     (window.REGION_INFO)
 *          data/assets/icons/*.png            (icons, named by Mobalytics asset id)
 * Outputs: data/authored/{groups,categories}.json, data/authored/partition.geojson,
 *          public/assets/icons/<category-id>.png, src/content/regions/<id>.md,
 *          public/legacy/data/map-features.js (asset paths rewritten for public/legacy.html)
 *
 * Run: npx tsx pipeline/migrate-v0.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { CategoriesFile, GroupsFile, PartitionFile, type Category, type Group } from '../src/lib/schema';

const root = path.resolve(import.meta.dirname, '..');
const p = (...s: string[]) => path.join(root, ...s);
const writeJson = (file: string, data: unknown, indent = 2) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, indent) + '\n');
  console.log('wrote', path.relative(root, file));
};
export const slugify = (s: string) =>
  s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type RawFeature = {
  id: string; x: number; y: number; kind: 'POINT' | 'LABEL'; title: string; category: string;
  group: string; icon: string | null; localIcon: string | null; description: string | null; region: string | null;
};
const raw: { features: RawFeature[] } = JSON.parse(fs.readFileSync(p('data/sources/mobalytics-v0.json'), 'utf8'));
const points = raw.features.filter((f) => f.kind === 'POINT');
const labels = raw.features.filter((f) => f.kind === 'LABEL');

// ---------- groups & categories ----------
const groups: Group[] = [];
const categories: Category[] = [];
// Drawer "Key locations" priority, carried over from the prototype's KEY_CATS list.
const KEY_CATS = ['Airport', 'WAiNK Landmarks', 'Race', 'Banks', 'Garage', 'Vehicle Mod Shop', 'Strip Club', 'Gun Store', 'Hospital', 'Police Station'];
for (const f of points) {
  const groupId = slugify(f.group);
  if (!groups.some((g) => g.id === groupId)) groups.push({ id: groupId, name: f.group });
  if (categories.some((c) => c.name === f.category)) continue;
  const id = slugify(f.category);
  const k = KEY_CATS.indexOf(f.category);
  categories.push({ id, name: f.category, groupId, icon: `${id}.png`, ...(k >= 0 ? { keyPriority: k + 1 } : {}) });
  const src = p(f.localIcon!);
  const dst = p('public/assets/icons', `${id}.png`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(src)) fs.renameSync(src, dst);
  else if (!fs.existsSync(dst)) throw new Error(`missing icon for ${f.category}: ${f.localIcon}`);
}
writeJson(p('data/authored/groups.json'), GroupsFile.parse(groups));
writeJson(p('data/authored/categories.json'), CategoriesFile.parse(categories));

// ---------- partition (from tools/build_regions.py REGIONS, 731×1000 preview px × 7.9) ----------
const PREVIEW = 7.9;
const REGIONS: [string, string, string, string, number[][]][] = [
  ['mount-kalaga', 'Mount Kalaga National Park', 'Mount Kalaga', '#c9a2ff',
    [[0,0],[731,0],[731,248],[500,248],[450,255],[405,262],[370,262],[320,268],[230,275],[130,275],[0,275]]],
  ['port-gellhorn', 'Port Gellhorn', 'Port Gellhorn', '#ffa94d',
    [[0,275],[130,275],[230,275],[320,268],[370,262],[385,470],[395,478],[320,515],[230,560],[130,570],[0,590]]],
  ['ambrosia', 'Ambrosia', 'Ambrosia', '#ffe066',
    [[370,262],[405,262],[450,255],[500,248],[731,248],[731,385],[600,395],[540,420],[470,450],[395,478],[385,470]]],
  ['vice-city', 'Vice City', 'Vice City', '#ff7eb6',
    [[395,478],[470,450],[540,420],[600,395],[731,385],[731,670],[560,660],[510,650],[450,640],[380,620],[380,520]]],
  ['grassrivers', 'Grassrivers', 'Grassrivers', '#74e07c',
    [[0,590],[130,570],[230,560],[320,515],[395,478],[380,520],[380,620],[450,640],[510,650],[560,660],[731,670],
     [731,760],[440,760],[380,780],[300,790],[0,780]]],
  ['leonida-keys', 'Leonida Keys', 'Leonida Keys', '#5fd8ff',
    [[0,780],[300,790],[380,780],[440,760],[731,760],[731,1000],[0,1000]]],
];
const round1 = (n: number) => Math.round(n * 10) / 10;
const partition = {
  type: 'FeatureCollection',
  mapSpace: 'leonida-px@1',
  features: REGIONS.map(([id, name, shortName, color, poly]) => {
    const label = labels.find((l) => l.title === name);
    if (!label) throw new Error(`no LABEL feature for ${name}`);
    const ring = poly.map(([x, y]) => [round1(x * PREVIEW), round1(y * PREVIEW)]);
    ring.push([...ring[0]]);
    return {
      type: 'Feature',
      properties: { id, name, shortName, color, label: [round1(label.x), round1(label.y)] },
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  }),
};
writeJson(p('data/authored/partition.geojson'), PartitionFile.parse(partition));

// ---------- region info → content collection ----------
const ctx: { window: { REGION_INFO?: Record<string, any> } } = { window: {} };
vm.runInNewContext(fs.readFileSync(p('data/sources/region-info.v0.js'), 'utf8'), ctx);
const yaml = (v: unknown) => JSON.stringify(v); // JSON strings are valid YAML double-quoted scalars
for (const [id, info] of Object.entries(ctx.window.REGION_INFO ?? {})) {
  const fm = [
    '---',
    `tagline: ${yaml(info.tagline)}`,
    `realWorld: ${yaml(info.realWorld)}`,
    `postcard: ${yaml(path.basename(info.postcard))}`,
    'summary:',
    ...info.summary.map((s: string) => `  - ${yaml(s)}`),
    '---',
    '',
    'Condensed from the Mobalytics GTA 6 interactive map guide (snapshot 2026-11-21).',
    '',
  ].join('\n');
  const file = p('src/content/regions', `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fm);
  console.log('wrote', path.relative(root, file));
}

// ---------- legacy viewer twin: rewrite asset paths ----------
const iconById = new Map(categories.map((c) => [c.name, `assets/icons/${c.icon}`]));
const legacy = {
  ...raw,
  localImage: 'legacy/leonida-map.jpg',
  features: raw.features.map((f) => (f.localIcon ? { ...f, localIcon: iconById.get(f.category)! } : f)),
};
fs.writeFileSync(p('public/legacy/data/map-features.js'), 'window.MAP_DATA = ' + JSON.stringify(legacy) + ';\n');
console.log('wrote public/legacy/data/map-features.js');
