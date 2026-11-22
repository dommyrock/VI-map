/**
 * The app island (client:only). Wires data → stores → actions, URL sync, the map view and the UI.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDataset } from '../lib/data';
import type { RegionInfo } from '../lib/schema';
import { createActions } from '../state/actions';
import { createDerived } from '../state/derived';
import { createFocusBus } from '../state/focus';
import { createStores } from '../state/stores';
import { applyUrl, syncUrl } from '../state/url';
import { App, useApp, type AppContext } from './context';
import { Drawer } from './Drawer';
import { Sidebar } from './Sidebar';

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
      <div class="app">
        <Sidebar />
        <div class="mapcol">
          <MapCanvas />
          <Drawer />
        </div>
      </div>
    </App.Provider>
  );
}

function MapCanvas() {
  const ctx = useApp();
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let destroyed = false;
    let destroy = () => {};
    const offUrl = syncUrl(ctx.stores);
    // MapLibre is the heavy part of the bundle: load it after the shell has painted.
    import('../views/maplibre').then(({ createMapLibreView }) => {
      if (destroyed) return;
      const view = createMapLibreView(el.current!, ctx);
      destroy = () => view.destroy();
    });
    return () => {
      destroyed = true;
      offUrl();
      destroy();
    };
  }, []);
  return <div class="map" ref={el} />;
}
