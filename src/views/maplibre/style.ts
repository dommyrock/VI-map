/** Base style: background + the raster tile pyramid of the base map. Overlay layers are added by modules. */
import type { StyleSpecification } from 'maplibre-gl';
import { assetPath } from '../../lib/assets';
import { MAP_SPACE, pxToLngLat } from '../../lib/space';

export const TILE_ZOOMS = { min: 11, max: MAP_SPACE.nativeZoom };
export const WATER = '#0fa6c4';

/** Image extent as [west, south, east, north]. */
export function imageLngLatBounds(): [number, number, number, number] {
  const [w, n] = pxToLngLat([0, 0]);
  const [e, s] = pxToLngLat([MAP_SPACE.width, MAP_SPACE.height]);
  return [w, s, e, n];
}

// Absolute URL for MapLibre; not via new URL(), which would percent-encode the {z}/{x}/{y} braces.
const assetUrl = (rel: string) => location.origin + assetPath(rel);

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [assetUrl('tiles/{z}/{x}/{y}.webp')],
        tileSize: MAP_SPACE.tileSize,
        minzoom: TILE_ZOOMS.min,
        maxzoom: TILE_ZOOMS.max,
        bounds: imageLngLatBounds(),
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': WATER } },
      { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-fade-duration': 150, 'raster-resampling': 'linear' } },
    ],
  };
}

/** Layer order, bottom → top. Modules insert relative to these ids. */
export const LAYERS = {
  veil: 'veil',
  regionFill: 'region-fill',
  regionGlow: 'region-glow',
  regionCasing: 'region-casing',
  regionLine: 'region-line',
  labels: 'region-labels',
  poiBadgeShadow: 'poi-badge-shadow',
  poiBadge: 'poi-badge',
  poiShadow: 'poi-selected-shadow',
  poiRing: 'poi-selected-ring',
  pois: 'pois',
  poiHighlight: 'poi-highlight',
} as const;
