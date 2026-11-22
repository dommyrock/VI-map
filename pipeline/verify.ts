/**
 * Sanity checks on the generated data and the map space. Exits non-zero on failure.
 * Run: npm run verify
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDataset } from '../src/lib/data';
import { topLevelOuters } from '../src/lib/geo';
import { Manifest } from '../src/lib/schema';
import { lngLatToPx, MAP_SPACE, pxToLngLat } from '../src/lib/space';

const root = path.resolve(import.meta.dirname, '..');
const json = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed = true;
};

const ds = parseDataset({
  features: json('data/generated/features.json'),
  regions: json('data/generated/regions.geojson'),
  categories: json('data/authored/categories.json'),
  groups: json('data/authored/groups.json'),
});
const manifest = Manifest.parse(json('data/generated/manifest.json'));
check(ds.features.length === 419, `zod: ${ds.features.length} POIs (expect 419)`);
check(ds.categories.length === 16, `zod: ${ds.categories.length} categories (expect 16)`);
check(ds.regions.length === 6, `zod: ${ds.regions.length} regions (expect 6)`);
check(manifest.counts.features === ds.features.length, 'manifest counts match');
check(ds.categories.every((c) => fs.existsSync(path.join(root, 'public/assets/icons', c.icon))), 'every category icon exists');

// px → lng/lat → px round trip
let maxErr = 0;
const probe: [number, number][] = ds.features.map((f) => f.pos);
for (let x = 0; x <= MAP_SPACE.width; x += 275) for (let y = 0; y <= MAP_SPACE.height; y += 395) probe.push([x, y]);
for (const pt of probe) {
  const [x, y] = lngLatToPx(pxToLngLat(pt));
  maxErr = Math.max(maxErr, Math.abs(x - pt[0]), Math.abs(y - pt[1]));
}
check(maxErr < 0.01, `px→lnglat→px round trip over ${probe.length} points: max error ${maxErr.toExponential(2)} px`);
const [lng0, lat0] = pxToLngLat([0, 0]);
check(lng0 === 0 && lat0 === 0, 'image top-left anchors at (0°,0°)');

// Veil: nested outers (islands inside lagoon holes) must not be cut as veil holes.
for (const r of ds.regions) {
  const polys = r.geometry.coordinates;
  const top = topLevelOuters(polys);
  console.log(`     ${r.id}: ${polys.length} polygons, ${top.length} top-level outers`);
}

// Tiles
const tilesMeta = path.join(root, 'public/tiles/meta.json');
if (fs.existsSync(tilesMeta)) {
  const { ranges } = json('public/tiles/meta.json');
  let missing = 0;
  for (const [z, r] of Object.entries(ranges as Record<string, { x: number[]; y: number[] }>))
    for (let x = r.x[0]; x <= r.x[1]; x++)
      for (let y = r.y[0]; y <= r.y[1]; y++)
        if (!fs.existsSync(path.join(root, 'public/tiles', z, String(x), `${y}.webp`))) missing++;
  check(missing === 0, `tile pyramid complete (${Object.keys(ranges).join(',')})`);
} else check(false, 'public/tiles missing — run npm run tiles');

process.exit(failed ? 1 : 0);
