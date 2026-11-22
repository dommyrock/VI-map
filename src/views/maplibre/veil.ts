/**
 * Dark veil over everything outside the selected regions: one polygon whose holes are the
 * selected regions' top-level outer rings (islands nested in a lagoon hole stay unveiled).
 */
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { topLevelOuters } from '../../lib/geo';
import { MAP_SPACE } from '../../lib/space';
import type { ViewContext } from '../types';
import { polygonToLngLat } from './convert';
import { LAYERS } from './style';

const SRC = 'veil';
const OPACITY = 0.45;

export function addVeil(map: MLMap, { data, stores }: ViewContext, beforeId: string) {
  const { width: W, height: H } = MAP_SPACE;
  // Generously larger than anything the camera can show.
  const world: [number, number][] = [[-3 * W, -3 * H], [4 * W, -3 * H], [4 * W, 4 * H], [-3 * W, 4 * H], [-3 * W, -3 * H]];
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer(
    {
      id: LAYERS.veil, type: 'fill', source: SRC,
      paint: { 'fill-color': '#05070c', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 250, delay: 0 }, 'fill-antialias': false },
    },
    beforeId,
  );
  const off = stores.filters.subscribe(({ regions }) => {
    const src = map.getSource<GeoJSONSource>(SRC)!;
    if (regions.size === 0) {
      map.setPaintProperty(LAYERS.veil, 'fill-opacity', 0);
      return;
    }
    const polys = [...regions].flatMap((id) => data.regionById.get(id)!.geometry.coordinates);
    const holes = topLevelOuters(polys);
    src.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: polygonToLngLat([world, ...holes]) },
    });
    map.setPaintProperty(LAYERS.veil, 'fill-opacity', OPACITY);
  });
  return off;
}
