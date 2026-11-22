/**
 * Region fill + GPU glow + dark comic casing + neon outline. All emphasis is feature-state (hover / selected / filtering),
 * so hovering touches one feature's state instead of restyling every region.
 */
import type { ExpressionSpecification, Map as MLMap } from 'maplibre-gl';
import type { ViewContext } from '../types';
import { displayPolygons, polygonToLngLat } from './convert';
import { LAYERS } from './style';

const SRC = 'regions';
const INK = '#1a0b2e';
const st = (k: string): ExpressionSpecification => ['boolean', ['feature-state', k], false];
/** filtering → (selected → a | b) | c, each with a hover variant */
const byState = (idle: [number, number], selected: [number, number], dimmed: [number, number]): ExpressionSpecification => [
  'case',
  ['!', st('filtering')], ['case', st('hover'), idle[1], idle[0]],
  st('selected'), ['case', st('hover'), selected[1], selected[0]],
  ['case', st('hover'), dimmed[1], dimmed[0]],
];

export function addRegions(map: MLMap, { data, stores }: ViewContext) {
  map.addSource(SRC, {
    type: 'geojson',
    promoteId: 'id',
    data: {
      type: 'FeatureCollection',
      features: data.regions.map((r) => ({
        type: 'Feature',
        properties: { id: r.id, color: r.color },
        geometry: { type: 'MultiPolygon', coordinates: displayPolygons(r.geometry.coordinates).map(polygonToLngLat) },
      })),
    },
  });
  const color: ExpressionSpecification = ['get', 'color'];
  map.addLayer({
    id: LAYERS.regionFill, type: 'fill', source: SRC,
    paint: { 'fill-color': color, 'fill-opacity': byState([0.08, 0.22], [0.16, 0.22], [0, 0.1]), 'fill-antialias': true },
  });
  map.addLayer({
    id: LAYERS.regionGlow, type: 'line', source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': 6, 'line-blur': 3, 'line-opacity': byState([0, 0.35], [0.4, 0.45], [0, 0.25]) },
  });
  // Dark casing under the neon line keeps every colour readable on the turquoise sea. Idle borders stay
  // light (thin line, soft casing, no glow); hover and selection add the full casing and the glow.
  map.addLayer({
    id: LAYERS.regionCasing, type: 'line', source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': INK, 'line-width': byState([2.6, 3.4], [3.6, 3.6], [2.4, 3]), 'line-opacity': byState([0.55, 0.85], [0.85, 0.85], [0.2, 0.55]) },
  });
  map.addLayer({
    id: LAYERS.regionLine, type: 'line', source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': byState([1.2, 1.8], [2, 2], [1, 1.4]), 'line-opacity': byState([0.95, 1], [1, 1], [0.45, 0.9]) },
  });

  let hovered: string | null = null;
  const offHover = stores.hover.subscribe((h) => {
    const id = h?.kind === 'region' ? h.id : null;
    if (id === hovered) return;
    if (hovered) map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
    if (id) map.setFeatureState({ source: SRC, id }, { hover: true });
    hovered = id;
  });
  const offFilters = stores.filters.subscribe(({ regions }) => {
    for (const r of data.regions) {
      map.setFeatureState({ source: SRC, id: r.id }, { filtering: regions.size > 0, selected: regions.has(r.id) });
    }
  });
  return () => { offHover(); offFilters(); };
}
