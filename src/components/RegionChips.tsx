import { useStore } from '@nanostores/preact';
import { isMulti, useApp } from './context';

/** Header region tabs: "All of Leonida" + one tab per region with its count. */
export function RegionTabs() {
  const { data, stores, derived, actions } = useApp();
  const { regions } = useStore(stores.filters);
  const counts = useStore(derived.countsByRegion);
  const filtering = regions.size > 0;
  return (
    <nav class="tabs" aria-label="Regions">
      <button class={`tab all${filtering ? ' dim' : ' on'}`} aria-pressed={!filtering} onClick={() => actions.clearRegions()}>
        <i />
        All of Leonida
      </button>
      {data.regions.map((r) => {
        const on = regions.has(r.id);
        return (
          <button
            key={r.id}
            class={`tab${on ? ' on' : filtering ? ' dim' : ''}`}
            style={{ '--c': r.color }}
            title="Click to fly here · ⌘/Ctrl/Shift-click to combine"
            aria-pressed={on}
            onClick={(e) => actions.toggleRegion(r.id, { multi: isMulti(e) })}
            onMouseEnter={() => actions.setHover({ kind: 'region', id: r.id })}
            onMouseLeave={() => actions.setHover(null)}
          >
            <i />
            {r.shortName} <small>{counts[r.id]}</small>
          </button>
        );
      })}
    </nav>
  );
}
