import { useStore } from '@nanostores/preact';
import { CategoryList } from './CategoryList';
import { useApp } from './context';
import { PanelIcon } from './icons';
import { SearchInput, SearchResults } from './Search';
import { SOURCE_URL, supportUrl } from '../lib/support';

/** Glass filters panel docked over the left edge of the map; collapses off-screen. */
export function Sidebar() {
  const { data, stores, derived, actions } = useApp();
  const open = useStore(stores.navOpen);
  const shown = useStore(derived.visibleIds).length;
  const { categories } = useStore(stores.filters);
  const tip = supportUrl();
  return (
    <aside class="side" aria-label="Filters" aria-hidden={!open} inert={!open}>
      <div class="side-h">
        <div>
          <h2>Find stuff</h2>
          <p>Showing {shown} places</p>
        </div>
        <button class="ib" onClick={() => actions.setNavOpen(false)} aria-label="Collapse sidebar" title="Collapse sidebar">
          <PanelIcon />
        </button>
      </div>
      <div class="side-search">
        <SearchInput />
        <SearchResults />
      </div>
      <div class="scroll">
        <div class="types-h">
          <span>
            {categories.size} of {data.categories.length} types on
          </span>
          <span class="pair">
            <button class="ink" onClick={() => actions.setAllCategories(true)}>Show all</button>
            <button class="ink" onClick={() => actions.setAllCategories(false)}>Hide all</button>
          </span>
        </div>
        <CategoryList />
      </div>
      <footer>
        <p>Drag to move · scroll to zoom · Shift-click regions to combine</p>
        <div class="links">
          {tip && (
            <a href={tip} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">☕</span> Buy me a coffee
            </a>
          )}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
        </div>
      </footer>
    </aside>
  );
}
