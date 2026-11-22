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
/** CSS px of the map covered by overlay UI (the drawer), used as camera padding. */
export type Insets = { bottom: number };

export function createStores(ds: Dataset) {
  return {
    filters: atom<Filters>({ regions: new Set(), categories: new Set(ds.categories.map((c) => c.id)) }),
    /** Search text. Kept out of `filters`: typing must not re-filter map layers. */
    query: atom(''),
    selection: atom<Selection>({ featureId: null }),
    hover: atom<Hover>(null),
    /** Category set to restore when a drawer chip's isolation is toggled off. */
    restoreCategories: atom<ReadonlySet<string> | null>(null),
    /** User closed the drawer for the current single-region selection. */
    drawerDismissed: atom(false),
    insets: atom<Insets>({ bottom: 0 }),
  };
}
export type Stores = ReturnType<typeof createStores>;
