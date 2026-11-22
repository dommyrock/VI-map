import { useStore } from '@nanostores/preact';
import { iconUrl } from '../lib/assets';
import { useApp } from './context';

export function CategoryList() {
  const { data, stores, derived, actions } = useApp();
  const { categories } = useStore(stores.filters);
  const counts = useStore(derived.countsByCategory);
  return (
    <div class="cats">
      {data.categoriesByGroup.map(({ group, categories: list }) => (
        <div class="group" key={group.id}>
          <h3>{group.name}</h3>
          {list.map((c) => (
            <label key={c.id} class={`cat${counts[c.id] === 0 ? ' empty' : ''}`}>
              <input
                type="checkbox"
                checked={categories.has(c.id)}
                onChange={(e) => actions.setCategory(c.id, e.currentTarget.checked)}
              />
              <img src={iconUrl(c.icon)} alt="" width={20} height={20} />
              <span>{c.name}</span>
              <span class="n">{counts[c.id]}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
