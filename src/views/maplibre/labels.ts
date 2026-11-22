/**
 * Region name labels. Rendered once into canvas images (poster lettering, see labelImage) and drawn by a
 * symbol layer, so there's no glyph server and no per-label DOM. Dimming is feature-state.
 */
import type { Map as MLMap } from 'maplibre-gl';
import type { ViewContext } from '../types';
import { pointToLngLat } from './convert';
import { LAYERS } from './style';

const SRC = 'region-labels';

const INK = '#1a0b2e';
const SIZE = 24; // CSS px at icon-size 1
const SKEW = 0.14; // italic lean, like the poster's "VICE CITY"

/**
 * Poster lettering: white Lilita One with a thick ink outline and a hard offset shadow in the
 * region's colour (itself ink-outlined). Drawn once per region at device resolution.
 */
function labelImage(text: string, color: string, dpr: number) {
  const size = SIZE * dpr, stroke = 4 * dpr, off = 4 * dpr, pad = 10 * dpr;
  const font = `400 ${size}px "Lilita One", "Arial Black", Impact, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textW = measure.measureText(text).width;
  const h = Math.ceil(size * 1.25 + pad * 2 + off);
  const w = Math.ceil(textW + pad * 2 + off + SKEW * h);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, -SKEW, 1, SKEW * h * 0.5, 0);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke * 2; // strokes are centred on the glyph edge: 2× for an outer width of `stroke`
  ctx.strokeStyle = INK;
  const x = pad, y = (h - off) / 2;
  ctx.strokeText(text, x + off, y + off);
  ctx.fillStyle = color;
  ctx.fillText(text, x + off, y + off);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  return ctx.getImageData(0, 0, w, h);
}

export function addLabels(map: MLMap, { data, stores }: ViewContext) {
  const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  for (const r of data.regions) map.addImage(`label-${r.id}`, labelImage(r.name, r.color, dpr), { pixelRatio: dpr });
  map.addSource(SRC, {
    type: 'geojson',
    promoteId: 'id',
    data: {
      type: 'FeatureCollection',
      features: data.regions.map((r) => ({
        type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: pointToLngLat(r.label) },
      })),
    },
  });
  map.addLayer({
    id: LAYERS.labels, type: 'symbol', source: SRC,
    layout: {
      'icon-image': ['concat', 'label-', ['get', 'id']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.72, 14, 1, 16, 1.2],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.25, 1] },
  });
  return stores.filters.subscribe(({ regions }) => {
    for (const r of data.regions) map.setFeatureState({ source: SRC, id: r.id }, { dim: regions.size > 0 && !regions.has(r.id) });
  });
}
