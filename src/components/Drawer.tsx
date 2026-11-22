/**
 * Region details drawer: an overlay over the bottom of the map (the map never resizes).
 * It reports its height as camera padding so region fits and fly-tos land above it.
 */
import { useStore } from '@nanostores/preact';
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { iconUrl, postcardUrl } from '../lib/assets';
import type { Region } from '../lib/data';
import type { Feature } from '../lib/schema';
import { useApp } from './context';

const MAX_KEYS = 14;

export function Drawer() {
  const { derived, actions } = useApp();
  const region = useStore(derived.drawerRegion);
  const open = useStore(derived.drawerOpen);
  // Keep showing the last region while the panel slides out.
  const last = useRef<Region | null>(null);
  if (region) last.current = region;
  const r = region ?? last.current;
  const el = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = el.current!;
    // offsetHeight ignores the slide transform, so this is the final height even mid-animation.
    const report = () => actions.setInsets(open ? node.offsetHeight : 0);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [open, r?.id]);

  return (
    <>
      <section
        ref={el}
        class={`drawer${open ? ' open' : ''}`}
        style={r ? { '--c': r.color } : undefined}
        aria-hidden={!open}
        inert={!open}
      >
        {r && <DrawerBody region={r} />}
      </section>
      {region && !open && (
        <button class="details-pill" style={{ '--c': region.color }} onClick={() => actions.openDrawer()}>
          ⓘ {region.name}
        </button>
      )}
    </>
  );
}

function DrawerBody({ region: r }: { region: Region }) {
  const { data, derived, actions, regionInfo } = useApp();
  const isolated = useStore(derived.isolatedCategory);
  const info = regionInfo[r.id];
  const { chips, keys, total } = useMemo(() => {
    const mine = data.byRegion.get(r.id) ?? [];
    const byCat = new Map<string, Feature[]>();
    for (const f of mine) byCat.set(f.category, [...(byCat.get(f.category) ?? []), f]);
    const chips = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
    const prio = (f: Feature) => data.categoryById.get(f.category)?.keyPriority ?? Infinity;
    const keys = mine.filter((f) => f.title && prio(f) < Infinity).sort((a, b) => prio(a) - prio(b)).slice(0, MAX_KEYS);
    return { chips, keys, total: mine.length };
  }, [r.id]);

  return (
    <div class="dw">
      <button class="x" title="Hide details" aria-label="Hide details" onClick={() => actions.dismissDrawer()}>
        ×
      </button>
      <div>
        {info?.postcard && (
          <img class="pc" src={postcardUrl(info.postcard)} alt={`${r.name} postcard`} width={800} height={532} />
        )}
      </div>
      <div>
        <h2>{r.name}</h2>
        {info?.tagline && <div class="tag">“{info.tagline}”</div>}
        {info?.realWorld && <div class="rw">Inspired by {info.realWorld}</div>}
        <ul class="sum">
          {info?.summary.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div class="col3">
        <h4>{total} locations</h4>
        <div class="chips">
          {chips.map(([catId, list]) => {
            const c = data.categoryById.get(catId)!;
            return (
              <button
                key={catId}
                class={`chip${isolated === catId ? ' only' : ''}`}
                title={isolated === catId ? 'Show previous categories again' : `Show only ${c.name}`}
                aria-pressed={isolated === catId}
                onClick={() => actions.isolateCategory(catId)}
              >
                <img src={iconUrl(c.icon)} alt="" width={16} height={16} />
                <b>{list.length}</b> {c.name}
              </button>
            );
          })}
        </div>
        {keys.length > 0 && (
          <>
            <h4>Key locations</h4>
            <div class="keys">
              {keys.map((f) => {
                const c = data.categoryById.get(f.category)!;
                return (
                  <button key={f.id} title={c.name} onClick={() => actions.openFeature(f.id)}>
                    <img src={iconUrl(c.icon)} alt="" width={16} height={16} />
                    <span>{f.title}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
