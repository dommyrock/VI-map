/** px geometry → lng/lat GeoJSON for MapLibre. The only place geometry leaves image-px space. */
import { pxToLngLat } from '../../lib/space';

type Pt = readonly [number, number];

function signedArea(ring: readonly Pt[]) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2; // > 0 = clockwise in a y-up plane
}

/**
 * Convert a polygon's rings and enforce RFC 7946 winding (outer CCW, holes CW in lng/lat).
 * MapLibre classifies rings by winding relative to the first ring, so a hole that shares the
 * outer's winding would render filled.
 */
export function polygonToLngLat(rings: readonly (readonly Pt[])[]): [number, number][][] {
  return rings.map((ring, i) => {
    const ll = ring.map((p) => pxToLngLat(p));
    const cw = signedArea(ll) > 0;
    const wantCw = i > 0;
    return cw === wantCw ? ll : ll.reverse();
  });
}

export const pointToLngLat = (p: Pt) => pxToLngLat(p);
