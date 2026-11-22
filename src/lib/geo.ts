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

/**
 * Douglas–Peucker simplification of a closed ring (first === last), image px. Drops the
 * stair-steps of pixel-traced outlines so they render as clean lines. Keeps ≥ 4 points.
 */
export function simplifyRing(ring: readonly Pt[], tolerance: number): Px[] {
  const pts = ring.map((p) => [p[0], p[1]] as Px);
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  // Split at the point farthest from the start so a closed ring has a real baseline.
  let far = 1, farD = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, pts.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let idx = -1, max = tol2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > max) { max = d2; idx = i; }
    }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : pts;
}
