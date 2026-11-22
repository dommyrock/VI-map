/**
 * Build data/generated/* from sources + authored data.
 *
 *   data/sources/mobalytics-v0.json   raw Mobalytics snapshot  ─┐
 *   data/authored/categories.json     category ids/icons       ─┼─▶ data/generated/features.json
 *   data/authored/partition.geojson   coarse region partition  ─┤    (normalized, region-tagged)
 *   data/sources/regions.px.json      coastline-accurate rings ─┴─▶ data/generated/regions.geojson
 *                                     (tools/build_regions.py)       data/generated/manifest.json
 *
 * Region tagging uses the coarse partition (not the traced coastline polygons) so offshore
 * points still get a region. Generated files are never hand-edited.
 *
 * Run: npm run data
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataset } from '../src/lib/data';
import { closeRing, pointInPolygon } from '../src/lib/geo';
import {
  CategoriesFile, FeaturesFile, GroupsFile, Manifest, PartitionFile, RegionsFile, SCHEMA_VERSION,
  type Feature, type FeatureAttrs, type RegionFeature,
} from '../src/lib/schema';

const root = path.resolve(import.meta.dirname, '..');
const p = (...s: string[]) => path.join(root, ...s);
const read = (rel: string) => fs.readFileSync(p(rel), 'utf8');
const sha256 = (rel: string) => crypto.createHash('sha256').update(fs.readFileSync(p(rel))).digest('hex');
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), text);
  console.log('wrote', rel);
};

const SRC_FEATURES = 'data/sources/mobalytics-v0.json';
const SRC_REGIONS = 'data/sources/regions.px.json';
const CATEGORIES = 'data/authored/categories.json';
const GROUPS = 'data/authored/groups.json';
const PARTITION = 'data/authored/partition.geojson';

type RawFeature = {
  id: string; x: number; y: number; kind: string; title: string | null; category: string;
  description: string | null; region?: string | null;
};

const raw: { size: { width: number; height: number }; features: RawFeature[] } = JSON.parse(read(SRC_FEATURES));
const categories = CategoriesFile.parse(JSON.parse(read(CATEGORIES)));
const groups = GroupsFile.parse(JSON.parse(read(GROUPS)));
const partition = PartitionFile.parse(JSON.parse(read(PARTITION)));
const traced: { regions: { id: string; polygons: number[][][][] }[] } = JSON.parse(read(SRC_REGIONS));

const catByName = new Map(categories.map((c) => [c.name, c]));
const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (s: string) => Number(s.replace(/[$,\s]/g, ''));

export function parseAttrs(description: string | undefined): FeatureAttrs | undefined {
  if (!description) return undefined;
  const attrs: FeatureAttrs = {};
  const take = description.match(/Take value:\s*(\$[\d,]+)\s*-\s*(\$[\d,]+)/i);
  if (take) attrs.takeValue = [money(take[1]), money(take[2])];
  const challenge = description.match(/Challenge:\s*(.+)/i);
  if (challenge) attrs.challenge = challenge[1].trim();
  return Object.keys(attrs).length ? attrs : undefined;
}

function regionAt(pos: [number, number]): string | null {
  for (const f of partition.features) if (pointInPolygon(pos, f.geometry.coordinates)) return f.properties.id;
  return null;
}

// ---------- features ----------
const problems: string[] = [];
const features: Feature[] = [];
const seen = new Set<string>();
let legacyDiffs = 0;
for (const f of raw.features) {
  if (f.kind !== 'POINT') continue; // LABEL features are folded into regions' `label`
  const cat = catByName.get(f.category);
  if (!cat) { problems.push(`unknown category "${f.category}" (${f.id})`); continue; }
  const id = `m-${f.id.replace(/-/g, '').slice(0, 8)}`;
  if (seen.has(id)) { problems.push(`id collision ${id}`); continue; }
  seen.add(id);
  const pos: [number, number] = [round1(f.x), round1(f.y)];
  const region = regionAt([f.x, f.y]);
  if (!region) { problems.push(`${id} at ${pos} is outside every partition polygon`); continue; }
  if (f.region && f.region !== region) legacyDiffs++;
  const title = f.title?.trim() || null;
  const description = f.description?.trim() || undefined;
  const attrs = parseAttrs(description);
  features.push({
    id, source: 'mobalytics', sourceId: f.id, category: cat.id,
    title: title && title !== cat.name ? title : null,
    ...(description ? { description } : {}),
    ...(attrs ? { attrs } : {}),
    pos, region,
  });
}

// ---------- regions ----------
const regions: RegionFeature[] = partition.features.map((pf) => {
  const t = traced.regions.find((r) => r.id === pf.properties.id);
  if (!t) throw new Error(`no traced geometry for region ${pf.properties.id}`);
  return {
    type: 'Feature',
    properties: pf.properties,
    geometry: {
      type: 'MultiPolygon',
      coordinates: t.polygons.map((poly) => poly.map((ring) => closeRing(ring as [number, number][]))),
    },
  };
});

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const featuresFile = FeaturesFile.parse({ schemaVersion: SCHEMA_VERSION, mapSpace: 'leonida-px@1', features });
const regionsFile = RegionsFile.parse({ type: 'FeatureCollection', mapSpace: 'leonida-px@1', features: regions });
// Referential integrity (categories ↔ groups ↔ features ↔ regions), same check the client runs.
const ds = parseDataset({ features: featuresFile, regions: regionsFile, categories, groups });

const byRegion = Object.fromEntries(ds.regions.map((r) => [r.id, ds.byRegion.get(r.id)?.length ?? 0]));
const manifest = Manifest.parse({
  schemaVersion: SCHEMA_VERSION,
  mapSpace: 'leonida-px@1',
  counts: { features: features.length, categories: categories.length, groups: groups.length, regions: regions.length, byRegion },
  sources: [
    { path: SRC_FEATURES, sha256: sha256(SRC_FEATURES), note: 'Mobalytics GTA 6 interactive map, snapshot 2026-11-21' },
    { path: SRC_REGIONS, sha256: sha256(SRC_REGIONS), note: 'tools/build_regions.py output' },
    { path: PARTITION, sha256: sha256(PARTITION) },
    { path: CATEGORIES, sha256: sha256(CATEGORIES) },
    { path: GROUPS, sha256: sha256(GROUPS) },
  ],
});

// One feature per line: compact, but diffs stay reviewable.
const { features: fs_, ...header } = featuresFile;
write('data/generated/features.json',
  JSON.stringify(header).slice(0, -1) + ',"features":[\n' + fs_.map((f) => JSON.stringify(f)).join(',\n') + '\n]}\n');
write('data/generated/regions.geojson', JSON.stringify(regionsFile) + '\n');
write('data/generated/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`${features.length} features · ${categories.length} categories · ${regions.length} regions`, byRegion);
if (legacyDiffs) console.warn(`note: ${legacyDiffs} features tagged differently than the v0 (OpenCV) tagger`);
