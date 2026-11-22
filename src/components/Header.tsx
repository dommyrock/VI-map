import { useApp } from './context';
import { SunLogo } from './icons';
import { RegionTabs } from './RegionChips';

const HOME = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';

/** White top bar: logo + region (state) tabs, then the poster stripes. */
export function Header() {
  const { actions } = useApp();
  // A real link (new tab / copy link work); a plain click resets in place without a reload.
  const goHome = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    actions.resetAll();
  };
  return (
    <>
      <header class="topbar">
        <a class="brand" href={HOME} onClick={goHome} title="Back to the full map" aria-label="Leonida, the state map: reset to the full map">
          <SunLogo />
          <span>
            <b>Leonida</b>
            <small>THE STATE MAP</small>
          </span>
        </a>
        <RegionTabs />
      </header>
      <div class="stripes" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </>
  );
}
