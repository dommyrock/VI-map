/** Planar helpers in image-px space. Rings may be open or closed. */
import type { Px } from './schema';

export type BBox = [minX: number, minY: number, maxX: number, maxY: number];
type Pt = readonly [number, number];

/** Even-odd point-in-ring test (ray casting). */
export function pointInRing([x, y]: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in polygon given as [outer, ...holes]. */
export function pointInPolygon(pt: Pt, rings: readonly (readonly Pt[])[]): boolean {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(pt, rings[i])) return false;
  return true;
}

export function bbox(points: Iterable<Pt>): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function unionBBox(boxes: Iterable<BBox>): BBox | null {
  let out: BBox | null = null;
  for (const b of boxes) {
    out = out
      ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])]
      : [...b];
  }
  return out;
}

const bboxInside = (a: BBox, b: BBox) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];

/**
 * Outer rings that are not nested inside another outer ring of the given polygons.
 *
 * Islands traced inside a lagoon/lake hole come out of the tracer as separate polygons whose
 * outer ring lies inside the enclosing polygon's outer ring. Cutting a hole for every outer ring
 * with an even-odd rule re-darkens those islands; cutting holes only for top-level outers doesn't.
 *
 * Containment is decided by vote over sampled vertices, so the ~2 px overlap between neighbouring
 * regions' edges doesn't count as nesting.
 */
export function topLevelOuters(polygons: readonly (readonly (readonly Pt[])[])[]): Px[][] {
  const outers = polygons.map((p) => p[0]);
  const boxes = outers.map((r) => bbox(r));
  const nested = outers.map((ring, i) =>
    outers.some((other, j) => {
      if (i === j || !bboxInside(boxes[i], boxes[j])) return false;
      const step = Math.max(1, Math.floor(ring.length / 24));
      let tested = 0, inside = 0;
      for (let k = 0; k < ring.length; k += step) {
        tested++;
        if (pointInRing(ring[k], other)) inside++;
      }
      return inside / tested > 0.9;
    }),
  );
  return outers.filter((_, i) => !nested[i]).map((r) => r.map(([x, y]) => [x, y] as Px));
}

/** Ensure a ring is closed (first === last). */
export function closeRing(ring: readonly Pt[]): Px[] {
  const out = ring.map(([x, y]) => [x, y] as Px);
  const a = out[0], b = out[out.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  return out;
}
