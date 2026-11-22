/** The only writers of state. Views and components call these; they never set atoms directly. */
import type { Dataset } from '../lib/data';
import { unionBBox } from '../lib/geo';
import type { Derived } from './derived';
import type { FocusBus } from './focus';
import type { Filters, Hover, Insets, Stores } from './stores';

/** Zoom used when flying to a single POI (never zooms out). */
const POI_ZOOM = 15;

export function createActions(ds: Dataset, s: Stores, d: Derived, focus: FocusBus) {
  const allCategories = () => new Set(ds.categories.map((c) => c.id));

  function setFilters(next: Partial<Filters>, { keepRestore = false } = {}) {
    const prev = s.filters.get();
    const regionChanged = next.regions && !sameSet(next.regions, prev.regions);
    s.filters.set({ ...prev, ...next });
    if (!keepRestore && next.categories) s.restoreCategories.set(null);
    if (regionChanged) s.drawerDismissed.set(false);
    // A popup for a POI that just got filtered out closes, like removing a Leaflet marker did.
    const sel = s.selection.get().featureId;
    if (sel && !d.visibleIds.get().includes(sel)) s.selection.set({ featureId: null });
  }

  function focusRegions(ids: Iterable<string>, animate = true) {
    const box = unionBBox([...ids].map((id) => ds.regionById.get(id)!.bbox));
    if (box) focus.emit({ target: { bbox: box }, animate });
  }

  const actions = {
    /** Click: focus this region (or clear if it's the only one). multi: add/remove. */
    toggleRegion(id: string, { multi = false, fly = true } = {}) {
      if (!ds.regionById.has(id)) return;
      const cur = s.filters.get().regions;
      let next: Set<string>;
      if (multi) {
        next = new Set(cur);
        next.has(id) ? next.delete(id) : next.add(id);
      } else if (cur.size === 1 && cur.has(id)) next = new Set();
      else next = new Set([id]);
      setFilters({ regions: next });
      if (fly && next.size) focusRegions(next);
    },
    setRegions(ids: string[], { fly = true, animate = true } = {}) {
      const next = new Set(ids.filter((id) => ds.regionById.has(id)));
      setFilters({ regions: next });
      if (fly && next.size) focusRegions(next, animate);
    },
    clearRegions({ fly = true } = {}) {
      setFilters({ regions: new Set() });
      if (fly) focus.emit({ target: { home: true } });
    },

    setCategory(id: string, on: boolean) {
      const next = new Set(s.filters.get().categories);
      on ? next.add(id) : next.delete(id);
      setFilters({ categories: next });
    },
    setAllCategories(on: boolean) {
      setFilters({ categories: on ? allCategories() : new Set() });
    },
    /** Drawer chip: show only this category; toggling the isolated chip restores the previous set. */
    isolateCategory(id: string) {
      if (d.isolatedCategory.get() === id) {
        const restore = s.restoreCategories.get();
        setFilters({ categories: restore && restore.size ? restore : allCategories() });
        return;
      }
      if (!s.restoreCategories.get()) s.restoreCategories.set(new Set(s.filters.get().categories));
      setFilters({ categories: new Set([id]) }, { keepRestore: true });
    },

    /** Select a POI (opens its popup). fly: center it (popup opens when the camera arrives). */
    selectFeature(id: string | null, { fly = false } = {}) {
      const f = id ? ds.featureById.get(id) : null;
      if (fly && f) focus.emit({ target: { point: f.pos, minZoom: POI_ZOOM } });
      if (s.selection.get().featureId !== (f?.id ?? null)) s.selection.set({ featureId: f?.id ?? null });
    },
    /** Make a POI visible (enable its category, drop a region filter that excludes it), then fly + select. */
    openFeature(id: string) {
      const f = ds.featureById.get(id);
      if (!f) return;
      const { regions, categories } = s.filters.get();
      if (!categories.has(f.category)) setFilters({ categories: new Set([...categories, f.category]) });
      if (regions.size && !regions.has(f.region)) setFilters({ regions: new Set() });
      actions.selectFeature(id, { fly: true });
    },

    setQuery(q: string) {
      s.query.set(q);
    },
    setHover(h: Hover) {
      const cur = s.hover.get();
      if (cur?.kind === h?.kind && cur?.id === h?.id) return;
      s.hover.set(h);
    },
    dismissDrawer() {
      s.drawerDismissed.set(true);
    },
    openDrawer() {
      s.drawerDismissed.set(false);
    },
    setInsets(next: Partial<Insets>) {
      const cur = s.insets.get();
      const merged = { ...cur, ...next };
      if (merged.bottom !== cur.bottom || merged.left !== cur.left) s.insets.set(merged);
    },
    setNavOpen(open: boolean) {
      s.navOpen.set(open);
    },
  };
  return actions;
}
export type Actions = ReturnType<typeof createActions>;

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
