/**
 * Region fill + GPU glow + outline. All emphasis is feature-state (hover / selected / filtering),
 * so hovering touches one feature's state instead of restyling every region.
 */
import type { ExpressionSpecification, Map as MLMap } from 'maplibre-gl';
import type { ViewContext } from '../types';
import { polygonToLngLat } from './convert';
import { LAYERS } from './style';

const SRC = 'regions';
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
        geometry: { type: 'MultiPolygon', coordinates: r.geometry.coordinates.map(polygonToLngLat) },
      })),
    },
  });
  const color: ExpressionSpecification = ['get', 'color'];
  map.addLayer({
    id: LAYERS.regionFill, type: 'fill', source: SRC,
    paint: { 'fill-color': color, 'fill-opacity': byState([0.13, 0.24], [0.24, 0.3], [0, 0.1]), 'fill-antialias': false },
  });
  map.addLayer({
    id: LAYERS.regionGlow, type: 'line', source: SRC,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 9, 'line-blur': 7, 'line-opacity': byState([0.22, 0.55], [0.75, 0.75], [0, 0]) },
  });
  map.addLayer({
    id: LAYERS.regionLine, type: 'line', source: SRC,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 1.6, 'line-opacity': byState([0.6, 0.95], [1, 1], [0.12, 0.5]) },
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
