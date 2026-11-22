/**
 * Source-of-truth atoms. Only actions.ts writes to them; components and views read/subscribe.
 * Hover lives in its own atom so pointer movement never recomputes counts or the drawer.
 */
import { atom } from 'nanostores';
import type { Dataset } from '../lib/data';

export type Filters = {
  /** Selected region ids; empty = no region filter. */
  regions: ReadonlySet<string>;
  /** Enabled category ids. */
  categories: ReadonlySet<string>;
};
export type Selection = { featureId: string | null };
export type Hover = { kind: 'region' | 'feature'; id: string } | null;
/** CSS px of the map covered by overlay UI (drawer at the bottom, glass sidebar on the left), used as camera padding. */
export type Insets = { bottom: number; left: number };
/** Which map renderer is shown: the 2D MapLibre map (default) or the stylized 3D view. */
export type ViewMode = '2d' | '3d';

/** Sidebar starts open on wide screens, collapsed on phones. */
const wideScreen = () => typeof matchMedia === 'undefined' || matchMedia('(min-width: 761px)').matches;

export function createStores(ds: Dataset) {
  return {
    filters: atom<Filters>({ regions: new Set(), categories: new Set(ds.categories.map((c) => c.id)) }),
    /** Search text. Kept out of `filters`: typing must not re-filter map layers. */
    query: atom(''),
    selection: atom<Selection>({ featureId: null }),
    hover: atom<Hover>(null),
    /** Category set to restore when a drawer chip's isolation is toggled off. */
    restoreCategories: atom<ReadonlySet<string> | null>(null),
    /** Drawer closed for the current region. Starts closed; the "About …" pill opens it. */
    drawerDismissed: atom(true),
    insets: atom<Insets>({ bottom: 0, left: 0 }),
    /** Filters sidebar expanded. UI-only: not in the URL. */
    navOpen: atom(wideScreen()),
    /** 2D/3D toggle under "Reset view". In the URL as ?view=3d. */
    viewMode: atom<ViewMode>('2d'),
  };
}
export type Stores = ReturnType<typeof createStores>;
