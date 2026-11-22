import { useStore } from '@nanostores/preact';
import { iconUrl } from '../lib/assets';
import { featureTitle } from '../lib/data';
import { useApp } from './context';

export function SearchInput() {
  const { data, stores, actions } = useApp();
  const q = useStore(stores.query);
  return (
    <input
      type="search"
      value={q}
      placeholder={`Search ${data.features.length} locations…`}
      autocomplete="off"
      aria-label="Search locations"
      onInput={(e) => actions.setQuery(e.currentTarget.value)}
    />
  );
}

export function SearchResults() {
  const { data, derived, actions } = useApp();
  const hits = useStore(derived.searchResults);
  if (!hits) return null;
  return (
    <div class="results">
      {hits.length === 0 && (
        <button disabled class="none">
          No matches
        </button>
      )}
      {hits.map((f) => {
        const cat = data.categoryById.get(f.category)!;
        return (
          <button key={f.id} onClick={() => actions.openFeature(f.id)}>
            <img src={iconUrl(cat.icon)} alt="" width={18} height={18} />
            <span>{featureTitle(f, data)}</span>
            <small>{data.regionById.get(f.region)?.shortName ?? cat.name}</small>
          </button>
        );
      })}
    </div>
  );
}
