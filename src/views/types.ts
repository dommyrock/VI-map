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
export type FocusTarget = { bbox: BBox } | { point: Px; minZoom?: number };

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
  destroy(): void;
}

export type CreateView = (el: HTMLElement, ctx: ViewContext) => MapView;
