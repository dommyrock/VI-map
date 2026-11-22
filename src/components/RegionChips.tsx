import { useStore } from '@nanostores/preact';
import { isMulti, useApp } from './context';

export function RegionChips() {
  const { data, stores, derived, actions } = useApp();
  const { regions } = useStore(stores.filters);
  const counts = useStore(derived.countsByRegion);
  return (
    <div class={`regions${regions.size ? ' filtering' : ''}`}>
      {data.regions.map((r) => (
        <button
          key={r.id}
          class={`reg${regions.has(r.id) ? ' on' : ''}`}
          style={{ '--c': r.color }}
          title="Click to focus · ⌘/Ctrl/Shift-click to add"
          aria-pressed={regions.has(r.id)}
          onClick={(e) => actions.toggleRegion(r.id, { multi: isMulti(e) })}
          onMouseEnter={() => actions.setHover({ kind: 'region', id: r.id })}
          onMouseLeave={() => actions.setHover(null)}
        >
          <i />
          <span>{r.shortName}</span>
          <small>{counts[r.id]}</small>
        </button>
      ))}
    </div>
  );
}
