import { useStore } from '@nanostores/preact';
import { iconUrl } from '../lib/assets';
import { featureTitle } from '../lib/data';
import { useApp } from './context';
import { CloseIcon, SearchIcon } from './icons';

export function SearchInput() {
  const { stores, actions } = useApp();
  const q = useStore(stores.query);
  return (
    <label class="srch">
      <SearchIcon />
      <input
        type="search"
        value={q}
        placeholder="Search banks, races, garages…"
        autocomplete="off"
        aria-label="Search locations"
        onInput={(e) => actions.setQuery(e.currentTarget.value)}
      />
      {q && (
        <button class="clear" onClick={() => actions.setQuery('')} aria-label="Clear search">
          <CloseIcon />
        </button>
      )}
    </label>
  );
}

export function SearchResults() {
  const { data, derived, actions } = useApp();
  const hits = useStore(derived.searchResults);
  if (!hits) return null;
  return (
    <div class="results">
      {hits.length === 0 && <p class="none">No places match.</p>}
      {hits.map((f) => {
        const cat = data.categoryById.get(f.category)!;
        const region = data.regionById.get(f.region);
        return (
          <button key={f.id} onClick={() => actions.openFeature(f.id)}>
            <img src={iconUrl(cat.icon)} alt="" width={22} height={22} />
            <span>{featureTitle(f, data)}</span>
            <small>
              {region && <i style={{ '--c': region.color }} />}
              {region?.shortName ?? cat.name}
            </small>
          </button>
        );
      })}
    </div>
  );
}
