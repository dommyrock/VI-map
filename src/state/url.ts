/**
 * Query-string sync: ?region=<id>[,<id>…], ?f=<featureId> and ?view=3d.
 * Read once on start (before the view exists, so the camera jumps instead of flying),
 * then mirror state with history.replaceState.
 */
import type { Dataset } from '../lib/data';
import type { Actions } from './actions';
import type { Stores } from './stores';

export function applyUrl(ds: Dataset, actions: Actions, search = location.search) {
  const q = new URLSearchParams(search);
  const regions = (q.get('region') ?? '').split(',').filter((id) => ds.regionById.has(id));
  if (regions.length) actions.setRegions(regions, { animate: false });
  const f = q.get('f');
  if (f && ds.featureById.has(f)) actions.openFeature(f);
  if (q.get('view') === '3d') actions.setViewMode('3d');
}

export function syncUrl(stores: Stores) {
  const write = () => {
    const q = new URLSearchParams(location.search);
    const regions = [...stores.filters.get().regions];
    regions.length ? q.set('region', regions.join(',')) : q.delete('region');
    const f = stores.selection.get().featureId;
    f ? q.set('f', f) : q.delete('f');
    stores.viewMode.get() === '3d' ? q.set('view', '3d') : q.delete('view');
    const qs = q.toString().replace(/%2C/g, ',');
    const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
  };
  const offs = [stores.filters.listen(write), stores.selection.listen(write), stores.viewMode.listen(write)];
  return () => offs.forEach((off) => off());
}
