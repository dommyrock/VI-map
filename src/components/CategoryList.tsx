import { useStore } from '@nanostores/preact';
import { iconUrl } from '../lib/assets';
import { useApp } from './context';
import { CheckIcon } from './icons';

/** Filter rows grouped under sticker headings. Each row is a toggle button. */
export function CategoryList() {
  const { data, stores, derived, actions } = useApp();
  const { categories } = useStore(stores.filters);
  const counts = useStore(derived.countsByCategory);
  return (
    <div class="cats">
      {data.categoriesByGroup.map(({ group, categories: list }) => (
        <section class="group" key={group.id}>
          <h3>{group.name.replace(' / ', ' & ')}</h3>
          <div class="rows">
            {list.map((c) => {
              const on = categories.has(c.id);
              return (
                <button
                  key={c.id}
                  class={`fr${on ? ' on' : ' off'}${counts[c.id] === 0 ? ' empty' : ''}`}
                  aria-pressed={on}
                  onClick={() => actions.setCategory(c.id, !on)}
                >
                  <img src={iconUrl(c.icon)} alt="" width={26} height={26} />
                  <span>{c.name}</span>
                  <b>{counts[c.id]}</b>
                  <u>
                    <CheckIcon />
                  </u>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
