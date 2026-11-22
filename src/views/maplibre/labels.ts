/**
 * Region name labels. Rendered once into canvas images (text + colored glow) and drawn by a
 * symbol layer, so there's no glyph server and no per-label DOM. Dimming is feature-state.
 */
import type { Map as MLMap } from 'maplibre-gl';
import type { ViewContext } from '../types';
import { pointToLngLat } from './convert';
import { LAYERS } from './style';

const SRC = 'region-labels';

function labelImage(text: string, color: string, dpr: number) {
  const font = `800 ${15 * dpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const spacing = 0.06 * 15 * dpr;
  const pad = 14 * dpr;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const chars = [...text.toUpperCase()];
  const textW = chars.reduce((w, c) => w + measure.measureText(c).width + spacing, -spacing);
  const w = Math.ceil(textW + pad * 2), h = Math.ceil(15 * dpr * 1.3 + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const draw = () => {
    let x = pad;
    for (const c of chars) { ctx.fillText(c, x, h / 2); x += ctx.measureText(c).width + spacing; }
  };
  ctx.fillStyle = '#fff';
  // Same recipe as the prototype's text-shadow: 0 0 4px #000, 0 0 12px <region color>
  ctx.shadowColor = color; ctx.shadowBlur = 12 * dpr; draw();
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * dpr; draw();
  ctx.shadowBlur = 0; draw();
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
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.25, 1] },
  });
  return stores.filters.subscribe(({ regions }) => {
    for (const r of data.regions) map.setFeatureState({ source: SRC, id: r.id }, { dim: regions.size > 0 && !regions.has(r.id) });
  });
}
