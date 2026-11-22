/**
 * Cut the base map JPG into an XYZ WebP tile pyramid aligned to MAP_SPACE (src/lib/space.ts):
 * image top-left at (0°,0°), 1 image px = 1 CSS px at zoom 16, 512 px tiles.
 *
 * At zoom z the image is scaled by s = 2^(z−16) and its top-left lands exactly on tile
 * (2^(z−1), 2^(z−1)), so tiles are cut on a regular grid starting there. Edge tiles are padded
 * with transparency.
 *
 * Output: public/tiles/{z}/{x}/{y}.webp + public/tiles/meta.json
 * Run: npm run tiles            (always)
 *      npm run tiles -- --if-missing   (skip when meta.json matches the source + parameters)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MAP_SPACE } from '../src/lib/space';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'data/assets/leonida-map.jpg');
const OUT = path.join(root, 'public/tiles');
export const TILE_ZOOMS = { min: 11, max: MAP_SPACE.nativeZoom } as const;
const QUALITY = 82;
const T = MAP_SPACE.tileSize;

const srcHash = crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
const params = { srcHash, zooms: TILE_ZOOMS, tileSize: T, quality: QUALITY, mapSpace: MAP_SPACE.id };
const metaFile = path.join(OUT, 'meta.json');

if (process.argv.includes('--if-missing') && fs.existsSync(metaFile)) {
  const prev = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  if (JSON.stringify(prev.params) === JSON.stringify(params)) {
    console.log('tiles up to date');
    process.exit(0);
  }
}

sharp.concurrency(0);
fs.rmSync(OUT, { recursive: true, force: true });
const t0 = performance.now();
const meta = await sharp(SRC).metadata();
if (meta.width !== MAP_SPACE.width || meta.height !== MAP_SPACE.height)
  throw new Error(`source is ${meta.width}×${meta.height}, MAP_SPACE says ${MAP_SPACE.width}×${MAP_SPACE.height}`);

let count = 0, bytes = 0;
const ranges: Record<number, { x: [number, number]; y: [number, number] }> = {};
for (let z = TILE_ZOOMS.min; z <= TILE_ZOOMS.max; z++) {
  const s = 2 ** (z - MAP_SPACE.nativeZoom);
  const w = Math.ceil(MAP_SPACE.width * s);
  const h = Math.ceil(MAP_SPACE.height * s);
  const nx = Math.ceil(w / T), ny = Math.ceil(h / T);
  // Scaled level as raw RGBA, padded to whole tiles with transparency.
  const level = await sharp(SRC)
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .ensureAlpha()
    .extend({ right: nx * T - w, bottom: ny * T - h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const origin = 2 ** (z - 1);
  ranges[z] = { x: [origin, origin + nx - 1], y: [origin, origin + ny - 1] };
  const jobs: Promise<void>[] = [];
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const dir = path.join(OUT, String(z), String(origin + tx));
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${origin + ty}.webp`);
      jobs.push(
        sharp(level.data, { raw: { width: nx * T, height: ny * T, channels: 4 } })
          .extract({ left: tx * T, top: ty * T, width: T, height: T })
          .webp({ quality: QUALITY, alphaQuality: 90, effort: 4 })
          .toFile(file)
          .then((info) => { count++; bytes += info.size; }),
      );
    }
  }
  await Promise.all(jobs);
  console.log(`z${z}: ${nx}×${ny} tiles (${w}×${h} px)`);
}
fs.writeFileSync(metaFile, JSON.stringify({ params, ranges }, null, 2) + '\n');
console.log(`${count} tiles, ${(bytes / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
