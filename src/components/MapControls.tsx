/**
 * Zoom buttons + minimap. The minimap's viewport box is updated straight from the map's move
 * loop (style writes on a ref), so panning never re-renders Preact.
 */
import { useEffect, useRef } from 'preact/hooks';
import { assetPath } from '../lib/assets';
import { MAP_SPACE } from '../lib/space';
import type { MapView } from '../views/types';
import { useApp } from './context';
import { HomeViewIcon, MinusIcon, PlusIcon } from './icons';

export function MapControls({ view }: { view: MapView }) {
  const { actions } = useApp();
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const zoomIn = useRef<HTMLButtonElement>(null);
  const zoomOut = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      view.onCamera(({ x0, y0, x1, y1, atMin, atMax }) => {
        // Written straight to the DOM from the move loop: no re-render while panning/zooming.
        if (zoomOut.current && zoomOut.current.disabled !== atMin) zoomOut.current.disabled = atMin;
        if (zoomIn.current && zoomIn.current.disabled !== atMax) zoomIn.current.disabled = atMax;
        const s = box.current?.style;
        if (!s) return;
        s.left = `${x0 * 100}%`;
        s.top = `${y0 * 100}%`;
        s.width = `${(x1 - x0) * 100}%`;
        s.height = `${(y1 - y0) * 100}%`;
      }),
    [view],
  );

  const jump = (e: MouseEvent) => {
    const r = inner.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    view.panTo([fx * MAP_SPACE.width, fy * MAP_SPACE.height]);
  };

  return (
    <>
      <div class="mapctl">
        <button class="ib" ref={zoomIn} onClick={() => view.zoomBy(1)} aria-label="Zoom in" title="Zoom in">
          <PlusIcon />
        </button>
        <button class="ib" ref={zoomOut} onClick={() => view.zoomBy(-1)} aria-label="Zoom out" title="Zoom out">
          <MinusIcon />
        </button>
        <button class="ib" onClick={() => actions.clearRegions()} aria-label="Reset view" title="Reset view">
          <HomeViewIcon />
        </button>
      </div>
      <button class="mini" onClick={jump} aria-label="Minimap — click to jump there" title="Click to jump there">
        <span class="mini-in" ref={inner}>
          <img src={assetPath('assets/minimap.webp')} alt="" width={108} height={148} draggable={false} />
          <span class="mini-box" ref={box} />
        </span>
      </button>
    </>
  );
}
