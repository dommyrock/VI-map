import { SunLogo } from './icons';
import { RegionTabs } from './RegionChips';

/** White top bar: logo + region (state) tabs, then the poster stripes. */
export function Header() {
  return (
    <>
      <header class="topbar">
        <div class="brand">
          <SunLogo />
          <span>
            <b>Leonida</b>
            <small>THE STATE MAP</small>
          </span>
        </div>
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
