import { describe, it, expect } from 'vitest';
import { distToSegment, simplify, polygonArea, bounds, clamp } from './geometry.js';

describe('distToSegment', () => {
  it('measures straight down to the middle of a segment', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it('measures to the nearest end when the point is past the segment', () => {
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('handles a segment that is just one point', () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('simplify', () => {
  it('removes points that lie on a straight line', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(line, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 49, y: 0 },
    ]);
  });

  it('keeps corners', () => {
    const lShape = [];
    for (let i = 0; i <= 20; i++) lShape.push({ x: i, y: 0 });
    for (let i = 1; i <= 20; i++) lShape.push({ x: 20, y: i });
    expect(simplify(lShape, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
  });

  it('keeps small wobbles when epsilon is smaller than them', () => {
    const zigzag = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ];
    expect(simplify(zigzag, 1)).toHaveLength(3);
    expect(simplify(zigzag, 3)).toHaveLength(2);
  });

  it('returns short inputs unchanged (as a copy)', () => {
    const two = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const out = simplify(two, 1);
    expect(out).toEqual(two);
    expect(out).not.toBe(two);
  });

  it('handles a long trace without blowing the stack', () => {
    const circle = Array.from({ length: 20000 }, (_, i) => {
      const a = (i / 20000) * Math.PI * 2;
      return { x: 500 + 400 * Math.cos(a), y: 500 + 400 * Math.sin(a) };
    });
    const out = simplify(circle, 1);
    expect(out.length).toBeGreaterThan(10);
    expect(out.length).toBeLessThan(200);
  });
});

describe('polygonArea', () => {
  it('computes the area of a square either way round', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea(square.slice().reverse())).toBe(100);
  });

  it('computes the area of a triangle', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
      ]),
    ).toBe(6);
  });
});

describe('bounds and clamp', () => {
  it('finds the bounding box', () => {
    expect(
      bounds([
        { x: 3, y: 9 },
        { x: -2, y: 4 },
        { x: 7, y: 1 },
      ]),
    ).toEqual({ minX: -2, minY: 1, maxX: 7, maxY: 9 });
  });

  it('clamps', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
