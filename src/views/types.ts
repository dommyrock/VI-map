/**
 * A map view renders state and reports user intent through actions. It owns its camera but no
 * application state. MapLibre is the only implementation today; the interface is what a future
 * renderer (e.g. 3D) would implement.
 */
import type { Dataset } from '../lib/data';
import type { BBox } from '../lib/geo';
import type { Px } from '../lib/schema';
import type { Actions } from '../state/actions';
import type { Derived } from '../state/derived';
import type { FocusBus } from '../state/focus';
import type { Stores } from '../state/stores';

export type Padding = { top: number; right: number; bottom: number; left: number };
/** `home`: the default overview, zoomed in on the mainland (see HOME_* in the map view). */
export type FocusTarget = { bbox: BBox } | { point: Px; minZoom?: number } | { home: true };

export type ViewContext = {
  data: Dataset;
  stores: Stores;
  derived: Derived;
  actions: Actions;
  /** Camera intents emitted by actions; the view subscribes and calls its own focus(). */
  focus: FocusBus;
};

export interface MapView {
  /** Move the camera; resolves when the camera has settled. */
  focus(target: FocusTarget, opts?: { padding?: Partial<Padding>; animate?: boolean }): Promise<void>;
  /** Image px → container CSS px. */
  project(p: Px): [number, number];
  /** Zoom in (+) or out (−) by `delta` levels around the center. */
  zoomBy(delta: number): void;
  /** Center the camera on an image px position, keeping the zoom. */
  panTo(p: Px): void;
  /** Visible extent as image fractions (0–1), on every camera change and once on subscribe. */
  onCamera(cb: (r: { x0: number; y0: number; x1: number; y1: number }) => void): () => void;
  destroy(): void;
}

export type CreateView = (el: HTMLElement, ctx: ViewContext) => MapView;
