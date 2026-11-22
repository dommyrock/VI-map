/**
 * Zoom buttons, reset, 2D/3D toggle + minimap. The minimap's viewport box is updated straight from the map's move
 * loop (style writes on a ref), so panning never re-renders Preact.
 */
import { useStore } from '@nanostores/preact';
import { useEffect, useRef } from 'preact/hooks';
import { assetPath } from '../lib/assets';
import { MAP_SPACE } from '../lib/space';
import type { MapView } from '../views/types';
import { useApp } from './context';
import { HomeViewIcon, MinusIcon, PlusIcon } from './icons';

export function MapControls({ view }: { view: MapView }) {
  const { actions, stores } = useApp();
  const mode = useStore(stores.viewMode);
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
        <button
          class="ib vm"
          onClick={() => actions.setViewMode(mode === '3d' ? '2d' : '3d')}
          aria-pressed={mode === '3d'}
          aria-label={mode === '3d' ? 'Switch to 2D map' : 'Switch to 3D view'}
          title={mode === '3d' ? 'Back to the 2D map' : '3D view (beta)'}
        >
          {mode === '3d' ? '2D' : '3D'}
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
