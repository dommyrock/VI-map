/**
 * The map space: image pixels of the 5775×7900 base map.
 *
 * MapLibre anchoring: the image's top-left corner sits at (0°, 0°) of Web Mercator and
 * at zoom `nativeZoom` one image px equals one CSS px:
 *   u = 0.5 + x / (tileSize · 2^nativeZoom),  v = 0.5 + y / (tileSize · 2^nativeZoom)
 *   lng = 360u − 180,  lat = atan(sinh(π(1 − 2v))) · 180/π
 * The tile pyramid (pipeline/tile.ts) is cut with the same anchoring.
 */
import type { Px } from './schema';

export const MAP_SPACE = {
  id: 'leonida-px@1',
  width: 5775,
  height: 7900,
  nativeZoom: 16,
  tileSize: 512,
} as const;
export type MapSpace = typeof MAP_SPACE;

const WORLD = MAP_SPACE.tileSize * 2 ** MAP_SPACE.nativeZoom;

export function pxToLngLat([x, y]: readonly [number, number]): [number, number] {
  const u = 0.5 + x / WORLD;
  const v = 0.5 + y / WORLD;
  return [360 * u - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * v))) * 180) / Math.PI];
}

export function lngLatToPx([lng, lat]: readonly [number, number]): Px {
  const u = (lng + 180) / 360;
  const v = (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  return [(u - 0.5) * WORLD, (v - 0.5) * WORLD];
}

/** Image extent in px: [minX, minY, maxX, maxY]. */
export const IMAGE_BBOX: [number, number, number, number] = [0, 0, MAP_SPACE.width, MAP_SPACE.height];
