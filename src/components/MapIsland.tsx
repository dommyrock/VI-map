/**
 * The app island (client:only). Wires data → stores → actions, URL sync, the map view and the UI.
 */
import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDataset } from '../lib/data';
import type { RegionInfo } from '../lib/schema';
import { createActions } from '../state/actions';
import { createDerived } from '../state/derived';
import { createFocusBus } from '../state/focus';
import { createStores } from '../state/stores';
import { applyUrl, syncUrl } from '../state/url';
import type { BBox } from '../lib/geo';
import { MAP_SPACE } from '../lib/space';
import type { MapView } from '../views/types';
import { App, useApp, type AppContext } from './context';
import { Drawer } from './Drawer';
import { Header } from './Header';
import { PanelIcon } from './icons';
import { MapControls } from './MapControls';
import { Sidebar } from './Sidebar';

/** Keep in sync with --nav-w in app.css. */
const NAV_W = 320;
const WIDE = '(min-width: 761px)';

async function boot(regionInfo: Record<string, RegionInfo>): Promise<AppContext> {
  const data = await loadDataset();
  const stores = createStores(data);
  const derived = createDerived(data, stores);
  const focus = createFocusBus();
  const actions = createActions(data, stores, derived, focus);
  // Apply ?region= / ?f= before the view exists: the first camera intent then jumps, not flies.
  applyUrl(data, actions);
  const ctx = { data, stores, derived, actions, focus, regionInfo };
  if (import.meta.env.DEV) (window as unknown as { __app: AppContext }).__app = ctx; // debugging aid
  return ctx;
}

export default function MapIsland({ regionInfo }: { regionInfo: Record<string, RegionInfo> }) {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    boot(regionInfo).then(setCtx, (e) => setError(String(e?.message ?? e)));
  }, []);
  if (error) return <pre class="boot-error">{error}</pre>;
  if (!ctx) return <div class="app loading" />;
  return (
    <App.Provider value={ctx}>
      <Shell />
    </App.Provider>
  );
}

function Shell() {
  const { data, stores, actions } = useApp();
  const open = useStore(stores.navOpen);
  const { bottom } = useStore(stores.insets);
  const { categories } = useStore(stores.filters);

  // The docked sidebar covers the map's left edge on wide screens: report it as camera padding.
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const report = () => actions.setInsets({ left: open && mq.matches ? NAV_W : 0 });
    report();
    mq.addEventListener('change', report);
    return () => mq.removeEventListener('change', report);
  }, [open]);

  return (
    <div class="app">
      <Header />
      <div class={`stage${open ? ' nav-open' : ''}`} style={{ '--dock-b': `${bottom}px` }}>
        <div class="mapcol">
          <MapCanvas />
          <Drawer />
        </div>
        <Sidebar />
        {!open && (
          <button class="nav-reopen" onClick={() => actions.setNavOpen(true)} aria-label="Open filters sidebar" title="Open sidebar">
            <PanelIcon open />
            Filters
            <span>
              {categories.size}/{data.categories.length}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function MapCanvas() {
  const ctx = useApp();
  const mode = useStore(ctx.stores.viewMode);
  const el = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MapView | null>(null);
  /** Last visible extent (image px), so switching 2D ⇄ 3D keeps looking at the same place. */
  const extent = useRef<BBox | null>(null);
  useEffect(() => syncUrl(ctx.stores), []);
  useEffect(() => {
    let destroyed = false;
    let destroy = () => {};
    const carry = extent.current;
    setView(null);
    // Both renderers are heavy: load them after the shell has painted (3D only when toggled on).
    const load = mode === '3d'
      ? import('../views/three').then((m) => m.createThreeView)
      : import('../views/maplibre').then((m) => m.createMapLibreView);
    load.then((create) => {
      if (destroyed) return;
      const v = create(el.current!, ctx);
      setView(v);
      const offCam = v.onCamera(({ x0, y0, x1, y1 }) => {
        extent.current = [x0 * MAP_SPACE.width, y0 * MAP_SPACE.height, x1 * MAP_SPACE.width, y1 * MAP_SPACE.height];
      });
      if (carry) void v.focus({ bbox: carry }, { animate: false });
      // Teardown runs after the current render: Preact calls effect cleanups at the start of the next render, and a
      // view's destroy() unmounts its popup with a nested render(), which would break the outer render's hooks.
      destroy = () => { offCam(); queueMicrotask(() => v.destroy()); };
    }, (e) => {
      console.error(e);
      if (mode === '3d') ctx.actions.setViewMode('2d'); // 3D failed to load (e.g. no WebGL): fall back to 2D
    });
    return () => {
      destroyed = true;
      destroy();
    };
  }, [mode]);
  return (
    <>
      <div class="map" key={mode} ref={el} />
      {view && <MapControls view={view} />}
    </>
  );
}
