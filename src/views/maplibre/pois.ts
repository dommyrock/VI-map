/**
 * POIs as one symbol layer (icons via addImage, zoom-interpolated size), plus a tiny highlight
 * source holding only the hovered/selected POIs (icon-size can't read feature-state, and
 * re-filtering the main layer on hover would re-tile all 419 points). One reusable popup.
 */
import { Popup, type ExpressionSpecification, type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { h, render } from 'preact';
import { FeatureCard } from '../../components/FeatureCard';
import type { ViewContext } from '../types';
import { pointToLngLat } from './convert';
import { iconUrl } from '../../lib/assets';
import { LAYERS } from './style';

const SRC = 'pois';
const HL_SRC = 'poi-highlight';
const ICON_PX = 64; // icon drawn at 64 device px…
const PAD = 6;
const PIXEL_RATIO = 2; // …= 32 CSS px at icon-size 1
/** CSS px at zoom, matching the prototype (13 px overview → 26 px close up). */
const iconSize = (k = 1): ExpressionSpecification => [
  'interpolate', ['linear'], ['zoom'],
  12, 0.4 * k, 13, 0.42 * k, 14, 0.56 * k, 15, 0.81 * k, 17, 0.9 * k,
];

async function loadIcon(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`icon ${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { resizeWidth: ICON_PX, resizeHeight: ICON_PX, resizeQuality: 'high' });
  const size = ICON_PX + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Baked drop shadow (the prototype used a CSS filter per marker).
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(bmp, PAD, PAD);
  bmp.close();
  return ctx.getImageData(0, 0, size, size);
}

export async function loadPoiIcons(map: MLMap, { data }: ViewContext) {
  await Promise.all(
    data.categories.map(async (c) => {
      const img = await loadIcon(iconUrl(c.icon));
      if (!map.hasImage(c.id)) map.addImage(c.id, img, { pixelRatio: PIXEL_RATIO });
    }),
  );
}

export function addPois(map: MLMap, ctx: ViewContext, cameraSettled: () => Promise<void>) {
  const { data, stores, derived, actions } = ctx;
  map.addSource(SRC, {
    type: 'geojson',
    promoteId: 'id',
    data: {
      type: 'FeatureCollection',
      features: data.features.map((f) => ({
        type: 'Feature', properties: { id: f.id, category: f.category }, geometry: { type: 'Point', coordinates: pointToLngLat(f.pos) },
      })),
    },
  });
  map.addSource(HL_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: LAYERS.poiRing, type: 'circle', source: HL_SRC, filter: ['==', ['get', 'role'], 'selected'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 22, 17, 24],
      'circle-color': '#ff4f9a', 'circle-opacity': 0.22,
      'circle-stroke-color': '#ff4f9a', 'circle-stroke-width': 2.5, 'circle-stroke-opacity': 0.95,
    },
  });
  const symbolLayout = (k: number) => ({
    'icon-image': ['get', 'category'] as ExpressionSpecification,
    'icon-size': iconSize(k),
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  });
  map.addLayer({ id: LAYERS.pois, type: 'symbol', source: SRC, layout: symbolLayout(1) });
  map.addLayer({ id: LAYERS.poiHighlight, type: 'symbol', source: HL_SRC, layout: symbolLayout(1.4) });

  // Visibility = derived.visibleIds (single source of truth for what's on the map).
  const offVisible = derived.visibleIds.subscribe((ids) => {
    map.setFilter(LAYERS.pois, ['in', ['get', 'id'], ['literal', ids]]);
  });

  // Highlight source: hovered + selected POI.
  const updateHighlight = () => {
    const hov = stores.hover.get();
    const sel = stores.selection.get().featureId;
    const entries: [string, string][] = [];
    if (sel) entries.push([sel, 'selected']);
    if (hov?.kind === 'feature' && hov.id !== sel) entries.push([hov.id, 'hover']);
    map.getSource<GeoJSONSource>(HL_SRC)!.setData({
      type: 'FeatureCollection',
      features: entries.map(([id, role]) => {
        const f = data.featureById.get(id)!;
        return { type: 'Feature', properties: { id, role, category: f.category }, geometry: { type: 'Point', coordinates: pointToLngLat(f.pos) } };
      }),
    });
  };
  const offHover = stores.hover.subscribe(updateHighlight);

  // One popup, reused. Content is a Preact FeatureCard.
  const content = document.createElement('div');
  const popup = new Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: false, maxWidth: '300px', offset: 16, className: 'feature-popup' });
  popup.setDOMContent(content);
  let shownFor: string | null = null;
  popup.on('close', () => {
    const was = shownFor;
    shownFor = null;
    if (was && stores.selection.get().featureId === was) actions.selectFeature(null);
  });
  let token = 0;
  const offSel = stores.selection.subscribe(async ({ featureId }) => {
    updateHighlight();
    const my = ++token;
    if (!featureId) {
      if (shownFor) { shownFor = null; popup.remove(); }
      return;
    }
    // Open when the camera arrives (replaces the prototype's setTimeout(650) after a 600 ms fly).
    await cameraSettled();
    if (my !== token) return;
    const f = data.featureById.get(featureId)!;
    render(h(FeatureCard, { feature: f, data }), content);
    shownFor = featureId;
    popup.setLngLat(pointToLngLat(f.pos));
    if (!popup.isOpen()) popup.addTo(map);
  });

  return () => { offVisible(); offHover(); offSel(); popup.remove(); render(null, content); };
}
