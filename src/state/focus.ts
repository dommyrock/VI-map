/**
 * One-shot camera intents. Actions emit them; the map view owns the camera and decides how to
 * get there (padding for overlays, animation). Not state: nothing is stored.
 */
import type { BBox } from '../lib/geo';
import type { Px } from '../lib/schema';

/** `home`: the default overview, zoomed in on the mainland (see HOME_* in the map view). */
export type FocusTarget = { bbox: BBox } | { point: Px; minZoom?: number } | { home: true };
export type FocusIntent = {
  target: FocusTarget;
  /** false = jump (initial deep link). Default true. */
  animate?: boolean;
};
type Listener = (intent: FocusIntent) => void;

export function createFocusBus() {
  const listeners = new Set<Listener>();
  /** Intent emitted before any view subscribed (e.g. ?region= on load) is delivered on subscribe. */
  let buffered: FocusIntent | null = null;
  return {
    emit(intent: FocusIntent) {
      if (listeners.size === 0) buffered = intent;
      for (const l of listeners) l(intent);
    },
    subscribe(l: Listener) {
      listeners.add(l);
      if (buffered) {
        const b = buffered;
        buffered = null;
        l(b);
      }
      return () => void listeners.delete(l);
    },
  };
}
export type FocusBus = ReturnType<typeof createFocusBus>;
