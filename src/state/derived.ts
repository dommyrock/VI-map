/** Computed state. Depends on `filters`/`query`/`drawerDismissed` only — never on `hover`. */
import { computed } from 'nanostores';
import { featureTitle, type Dataset, type Region } from '../lib/data';
import type { Feature } from '../lib/schema';
import type { Stores } from './stores';

export function createDerived(ds: Dataset, s: Stores) {
  const inRegions = (regions: ReadonlySet<string>, f: Feature) => regions.size === 0 || regions.has(f.region);

  /** Ids of POIs shown on the map, in data order. */
  const visibleIds = computed(s.filters, ({ regions, categories }) =>
    ds.features.filter((f) => categories.has(f.category) && inRegions(regions, f)).map((f) => f.id),
  );

  /** Per-category count within the region filter (ignores the category filter). */
  const countsByCategory = computed(s.filters, ({ regions }) => {
    const out: Record<string, number> = Object.fromEntries(ds.categories.map((c) => [c.id, 0]));
    for (const f of ds.features) if (inRegions(regions, f)) out[f.category]++;
    return out;
  });

  /** Per-region count within the category filter (ignores the region filter). */
  const countsByRegion = computed(s.filters, ({ categories }) => {
    const out: Record<string, number> = Object.fromEntries(ds.regions.map((r) => [r.id, 0]));
    for (const f of ds.features) if (categories.has(f.category)) out[f.region]++;
    return out;
  });

  /** The region whose details drawer applies: exactly one region selected. */
  const drawerRegion = computed(s.filters, ({ regions }): Region | null =>
    regions.size === 1 ? ds.regionById.get([...regions][0]) ?? null : null,
  );
  const drawerOpen = computed([drawerRegion, s.drawerDismissed], (r, dismissed) => !!r && !dismissed);

  /** A category is "isolated" when it is the only one enabled. Derived, never stored. */
  const isolatedCategory = computed(s.filters, ({ categories }) =>
    categories.size === 1 ? [...categories][0] : null,
  );

  const searchIndex = ds.features.map((f) => ({
    f,
    text: [featureTitle(f, ds), ds.categoryById.get(f.category)?.name, f.description, ds.regionById.get(f.region)?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));
  const searchResults = computed(s.query, (q): Feature[] | null => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    return searchIndex.filter((e) => e.text.includes(needle)).slice(0, 60).map((e) => e.f);
  });

  return { visibleIds, countsByCategory, countsByRegion, drawerRegion, drawerOpen, isolatedCategory, searchResults };
}
export type Derived = ReturnType<typeof createDerived>;
