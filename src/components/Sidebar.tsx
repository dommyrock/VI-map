import { CategoryList } from './CategoryList';
import { useApp } from './context';
import { RegionChips } from './RegionChips';
import { SearchInput, SearchResults } from './Search';
import { SOURCE_URL, supportUrl } from '../lib/support';

export function Sidebar() {
  const { actions } = useApp();
  const tip = supportUrl();
  return (
    <aside>
      <header>
        <h1>Leonida Map</h1>
        <SearchInput />
      </header>
      <SearchResults />
      <div class="scroll">
        <div class="section-h">
          <h2>Regions</h2>
          <button onClick={() => actions.clearRegions()}>Clear</button>
        </div>
        <RegionChips />
        <div class="section-h">
          <h2>Locations</h2>
          <span>
            <button onClick={() => actions.setAllCategories(true)}>All</button> ·{' '}
            <button onClick={() => actions.setAllCategories(false)}>None</button>
          </span>
        </div>
        <CategoryList />
      </div>
      <footer>
        {tip && (
          <a href={tip} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">☕</span> Buy me a coffee
          </a>
        )}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </footer>
    </aside>
  );
}
