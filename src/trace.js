// The open trace, as plain data. No DOM here, so it can be unit tested.
//
// A trace is a list of STROKES. Each stroke is one hold-and-drag (a list of points in image coords).
// Consecutive strokes are joined by a straight line: the end of one stroke connects to the start
// of the next. Closing the shape joins the very last point back to the very first.

import { simplify, polygonArea } from './geometry.js';

/**
 * Add a finished stroke. Its points are simplified with `epsilon` (in image px),
 * which is chosen from the zoom level the stroke was drawn at.
 * A single click (one point) is kept too: it just adds a straight segment to that spot.
 * Returns a NEW array; the old one is left untouched (handy for undo).
 */
export function addStroke(strokes, rawPoints, epsilon) {
  if (!rawPoints.length) return strokes;
  const cleaned = rawPoints.length > 2 ? simplify(rawPoints, epsilon) : rawPoints.slice();
  return [...strokes, cleaned];
}

/** Remove the last stroke (undo while the trace is open). */
export function removeLastStroke(strokes) {
  return strokes.slice(0, -1);
}

/** All strokes as one path, skipping a point if it's exactly the same as the one before it. */
export function flatten(strokes) {
  const out = [];
  for (const stroke of strokes) {
    for (const p of stroke) {
      const last = out[out.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Can these points be closed into a sticker? Needs 3+ points and some actual area. */
export function canClose(points, minArea) {
  return points.length >= 3 && polygonArea(points) >= minArea;
}

/** Deep copy, so saved undo states can't be changed by later edits. */
export function copyStrokes(strokes) {
  return strokes.map((stroke) => stroke.map((p) => ({ x: p.x, y: p.y })));
}
