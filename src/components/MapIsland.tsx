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
  const el = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MapView | null>(null);
  useEffect(() => {
    let destroyed = false;
    let destroy = () => {};
    const offUrl = syncUrl(ctx.stores);
    // MapLibre is the heavy part of the bundle: load it after the shell has painted.
    import('../views/maplibre').then(({ createMapLibreView }) => {
      if (destroyed) return;
      const v = createMapLibreView(el.current!, ctx);
      setView(v);
      destroy = () => v.destroy();
    });
    return () => {
      destroyed = true;
      offUrl();
      destroy();
    };
  }, []);
  return (
    <>
      <div class="map" ref={el} />
      {view && <MapControls view={view} />}
    </>
  );
}
