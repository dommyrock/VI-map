/**
 * MapLibre implementation of MapView. Subscribes to stores, writes only through actions,
 * owns the camera (focus intents → fitBounds/easeTo with overlay padding).
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { LngLat, LngLatBounds, Map as MLMap, Popup, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl';
import { featureTitle } from '../../lib/data';
import type { Px } from '../../lib/schema';
import { lngLatToPx, MAP_SPACE, pxToLngLat } from '../../lib/space';
import type { FocusIntent } from '../../state/focus';
import type { CreateView, FocusTarget, MapView, Padding } from '../types';
import { pointToLngLat } from './convert';
import { addLabels } from './labels';
import { addPois, loadPoiIcons } from './pois';
import { addRegions } from './regions';
import { baseStyle, imageLngLatBounds, LAYERS, TILE_ZOOMS } from './style';
import { addVeil } from './veil';

setWorkerUrl(workerUrl);

const EDGE = 40; // px of breathing room around fitted bounds
const DURATION = 650;
/** Home view: this much closer than fitting the whole image, centered on the mainland. */
const HOME_ZOOM = 2.2;
const HOME_CENTER: Px = [3150, 3880];
/** Canvas-drawn region labels use this face; wait for it briefly so they don't render in a fallback. */
const LABEL_FONT = '400 24px "Lilita One"';

function fontReady(font: string, ms = 1500) {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.race([document.fonts.load(font).then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
}

export const createMapLibreView: CreateView = (el, ctx) => {
  const { data, stores, actions } = ctx;
  const [w, s, e, n] = imageLngLatBounds();
  const imageBounds = new LngLatBounds([w, s], [e, n]);

  const MAX_ZOOM = 17.5;
  /** Current zoom-out cap (whole map fits the window); set by updateMinZoom below. */
  let minZoom = TILE_ZOOMS.min + 0.6;

  const map = new MLMap({
    container: el,
    style: baseStyle(),
    bounds: imageBounds,
    fitBoundsOptions: { padding: EDGE },
    minZoom,
    maxZoom: MAX_ZOOM,
    maxBounds: imageBounds,
    // Keep the camera center inside the image (the default maxBounds behaviour would forbid
    // zooming out far enough to see the whole, tall map in a wide window). A custom constrain
    // replaces MapLibre's own, so it must clamp the zoom range itself too.
    transformConstrain: (center, zoom) => ({
      center: new LngLat(Math.min(e, Math.max(w, center.lng)), Math.min(n, Math.max(s, center.lat))),
      zoom: Math.min(MAX_ZOOM, Math.max(minZoom, zoom)),
    }),
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    rollEnabled: false,
    attributionControl: false,
    maplibreLogo: false,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();

  // Zoom-out stops where the whole map fits the window (what the minimap shows): no zooming out
  // into empty sea. At nativeZoom one image px is one CSS px, and the image spans a sliver of
  // latitude near the equator, so the fit zoom is plain arithmetic (no Mercator correction needed).
  const MIN_ZOOM_PAD = 16;
  const updateMinZoom = () => {
    const c = map.getContainer();
    const scale = Math.min((c.clientWidth - 2 * MIN_ZOOM_PAD) / MAP_SPACE.width, (c.clientHeight - 2 * MIN_ZOOM_PAD) / MAP_SPACE.height);
    if (scale <= 0) return;
    minZoom = Math.max(TILE_ZOOMS.min, MAP_SPACE.nativeZoom + Math.log2(scale));
    map.setMinZoom(minZoom);
  };
  updateMinZoom();
  map.on('resize', updateMinZoom);
  map.keyboard.disableRotation();

  // ---------- camera ----------
  // A popup for a fly-to target opens once the camera has arrived (moveend), not on a timer.
  let intentPending = false; // focus intent received, runs next frame
  let flying = false; // focus() animation in progress
  let settleWaiters: (() => void)[] = [];
  const flushSettled = () => {
    if (intentPending || flying) return;
    const waiting = settleWaiters;
    settleWaiters = [];
    waiting.forEach((f) => f());
  };
  map.on('moveend', () => {
    flying = false;
    flushSettled();
  });
  const cameraSettled = () =>
    new Promise<void>((resolve) => {
      settleWaiters.push(resolve);
      flushSettled();
    });

  const padding = (extra?: Partial<Padding>): Padding => {
    const { bottom, left } = stores.insets.get();
    return { top: EDGE, left: EDGE + left, right: EDGE, bottom: EDGE + bottom, ...extra };
  };
  const centerOffset = (pad: Padding): [number, number] => [(pad.left - pad.right) / 2, (pad.top - pad.bottom) / 2];

  function focus(target: FocusTarget, opts: { padding?: Partial<Padding>; animate?: boolean } = {}) {
    const duration = opts.animate === false ? 0 : DURATION;
    const pad = padding(opts.padding);
    if ('home' in target) {
      const cam = map.cameraForBounds(imageBounds, { padding: pad });
      const zoom = Math.min(map.getMaxZoom(), (cam?.zoom ?? map.getZoom()) + Math.log2(HOME_ZOOM));
      map.easeTo({ center: pointToLngLat(HOME_CENTER), zoom, offset: centerOffset(pad), duration });
    } else if ('bbox' in target) {
      const [x0, y0, x1, y1] = target.bbox;
      const b = new LngLatBounds(pxToLngLat([x0, y1]), pxToLngLat([x1, y0]));
      map.fitBounds(b, { padding: pad, duration, linear: true, maxZoom: 16 });
    } else {
      // Center the point in the part of the map not covered by overlays.
      map.easeTo({
        center: pointToLngLat(target.point),
        zoom: Math.max(map.getZoom(), target.minZoom ?? 0),
        offset: centerOffset(pad),
        duration,
      });
    }
    // Set after the call: starting a move interrupts a running one, whose moveend fires inside it.
    flying = map.isMoving();
    return cameraSettled();
  }

  // Focus intents from actions run on the next frame, after overlay UI (the drawer) has rendered
  // and reported its height, so the fit pads for it. Intents before load jump (deep links).
  let pendingIntent: FocusIntent | null = null;
  let intentFrame = 0;
  let loaded = false;
  const runIntent = () => {
    intentFrame = 0;
    if (!pendingIntent || !loaded) return;
    const it = pendingIntent;
    pendingIntent = null;
    intentPending = false;
    void focus(it.target, { animate: it.animate });
  };
  // Start on the home view; a deep link (?region= / ?f=) arriving below replaces it on load.
  void focus({ home: true }, { animate: false });
  const offFocus = ctx.focus.subscribe((intent) => {
    pendingIntent = loaded ? intent : { ...intent, animate: false };
    intentPending = true;
    if (!intentFrame) intentFrame = requestAnimationFrame(runIntent);
  });

  // ---------- layers & interaction ----------
  const offs: (() => void)[] = [];
  const tooltip = new Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, className: 'tip', offset: 14, anchor: 'bottom' });
  const coords = document.createElement('div');
  coords.className = 'coords';
  el.appendChild(coords);

  map.on('load', async () => {
    offs.push(addRegions(map, ctx));
    offs.push(addVeil(map, ctx, LAYERS.regionFill));
    await Promise.all([loadPoiIcons(map, ctx), fontReady(LABEL_FONT)]);
    offs.push(addLabels(map, ctx));
    offs.push(addPois(map, ctx, cameraSettled));
    loaded = true;
    if (pendingIntent) runIntent();
    el.dataset.ready = 'true';
  });
  let frame = 0;
  let lastMove: MapMouseEvent | null = null;
  const pointer = () => {
    frame = 0;
    const ev = lastMove;
    if (!ev || !loaded) return;
    const lngLat = map.unproject(ev.point); // not ev.lngLat: the camera may have moved since
    const [x, y] = lngLatToPx([lngLat.lng, lngLat.lat]);
    coords.textContent = `x ${x.toFixed(0)}  y ${y.toFixed(0)}`;
    const poi = map.queryRenderedFeatures(ev.point, { layers: [LAYERS.pois] })[0];
    if (poi) {
      const f = data.featureById.get(poi.properties.id as string)!;
      actions.setHover({ kind: 'feature', id: f.id });
      const region = data.regionById.get(f.region);
      tooltip.setHTML(`${esc(featureTitle(f, data))}${region ? ` <small>· ${esc(region.name)}</small>` : ''}`)
        .setOffset(16).setLngLat(pointToLngLat(f.pos));
      if (!tooltip.isOpen()) tooltip.addTo(map);
      map.getCanvas().style.cursor = 'pointer';
      return;
    }
    const reg = map.queryRenderedFeatures(ev.point, { layers: [LAYERS.regionFill] })[0];
    if (reg) {
      const r = data.regionById.get(reg.properties.id as string)!;
      actions.setHover({ kind: 'region', id: r.id });
      tooltip.setHTML(esc(r.name)).setOffset(10).setLngLat(lngLat);
      if (!tooltip.isOpen()) tooltip.addTo(map);
      map.getCanvas().style.cursor = 'pointer';
      return;
    }
    clearPointer();
  };
  const clearPointer = () => {
    actions.setHover(null);
    tooltip.remove();
    map.getCanvas().style.cursor = '';
  };
  map.on('mousemove', (ev) => {
    lastMove = ev;
    if (!frame) frame = requestAnimationFrame(pointer);
  });
  map.on('mouseout', () => { lastMove = null; clearPointer(); coords.textContent = ''; });
  // The camera moving under a still pointer makes hover stale: drop it, re-evaluate when settled.
  map.on('movestart', () => { tooltip.remove(); actions.setHover(null); });
  map.on('moveend', () => { if (lastMove && !frame) frame = requestAnimationFrame(pointer); });

  map.on('click', (ev) => {
    if (!loaded) return;
    const poi = map.queryRenderedFeatures(ev.point, { layers: [LAYERS.pois] })[0];
    if (poi) {
      actions.selectFeature(poi.properties.id as string);
      tooltip.remove();
      return;
    }
    actions.selectFeature(null);
    const reg = map.queryRenderedFeatures(ev.point, { layers: [LAYERS.regionFill] })[0];
    if (reg) {
      const o = ev.originalEvent;
      // Fit like the sidebar chips do (the prototype didn't move here, but the drawer now overlays the map).
      actions.toggleRegion(reg.properties.id as string, { multi: o.metaKey || o.ctrlKey || o.shiftKey });
    }
  });

  const view: MapView = {
    focus,
    project(p) {
      const pt = map.project(pxToLngLat(p));
      return [pt.x, pt.y];
    },
    zoomBy(delta) {
      map.easeTo({ zoom: map.getZoom() + delta, duration: 300 });
    },
    panTo(p) {
      map.easeTo({ center: pointToLngLat(p), duration: 450 });
    },
    onCamera(cb) {
      // Called from MapLibre's move loop: the subscriber writes styles directly, no re-render.
      const emit = () => {
        const b = map.getBounds();
        const [x0, y0] = lngLatToPx([b.getWest(), b.getNorth()]);
        const [x1, y1] = lngLatToPx([b.getEast(), b.getSouth()]);
        const z = map.getZoom();
        cb({
          x0: x0 / MAP_SPACE.width, y0: y0 / MAP_SPACE.height, x1: x1 / MAP_SPACE.width, y1: y1 / MAP_SPACE.height,
          atMin: z <= map.getMinZoom() + 1e-3, atMax: z >= map.getMaxZoom() - 1e-3,
        });
      };
      map.on('move', emit);
      map.on('resize', emit);
      emit();
      return () => { map.off('move', emit); map.off('resize', emit); };
    },
    destroy() {
      offFocus();
      offs.forEach((off) => off());
      if (intentFrame) cancelAnimationFrame(intentFrame);
      if (frame) cancelAnimationFrame(frame);
      tooltip.remove();
      map.remove();
      coords.remove();
    },
  };
  // Handy for debugging / headless checks.
  (el as HTMLElement & { __map?: MLMap }).__map = map;
  return view;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
