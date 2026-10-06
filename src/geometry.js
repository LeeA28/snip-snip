// Small, pure math helpers. No DOM here, so they're easy to test.

/** Distance from point p to the line segment a-b. */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  // a and b are the same point: just measure to it.
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // How far along a->b the closest point is (0 = at a, 1 = at b), clamped to the segment.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Ramer–Douglas–Peucker simplification.
 * A freehand trace has hundreds of points. This keeps only the ones that matter:
 * any point closer than `epsilon` to the straight line between its neighbours is dropped.
 */
export function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // An explicit stack instead of recursion, so a very long trace can't overflow the call stack.
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distToSegment(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    // The farthest point sticks out enough: keep it, then check both halves.
    if (index !== -1 && maxDist > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Area of a polygon (shoelace formula). Always positive. */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Smallest axis-aligned box containing every point. */
export function bounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Keep a number between lo and hi. */
export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
