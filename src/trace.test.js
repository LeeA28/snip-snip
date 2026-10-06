import { describe, it, expect } from 'vitest';
import { addStroke, removeLastStroke, flatten, canClose, copyStrokes } from './trace.js';

const line = (x0, y0, x1, y1, n) =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));

describe('addStroke', () => {
  it('simplifies the stroke and keeps its ends', () => {
    const strokes = addStroke([], line(0, 0, 100, 0, 50), 1);
    expect(strokes).toEqual([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    ]);
  });

  it('keeps a single click as a one-point stroke', () => {
    const strokes = addStroke([], [{ x: 5, y: 5 }], 1);
    expect(strokes).toEqual([[{ x: 5, y: 5 }]]);
  });

  it('ignores an empty stroke', () => {
    const before = [[{ x: 1, y: 1 }]];
    expect(addStroke(before, [], 1)).toBe(before);
  });

  it('does not change the array it was given (so undo snapshots stay safe)', () => {
    const before = [[{ x: 1, y: 1 }]];
    const after = addStroke(before, [{ x: 2, y: 2 }], 1);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
  });
});

describe('removeLastStroke', () => {
  it('removes one stroke at a time', () => {
    const strokes = [[{ x: 0, y: 0 }], [{ x: 1, y: 1 }]];
    expect(removeLastStroke(strokes)).toEqual([[{ x: 0, y: 0 }]]);
    expect(removeLastStroke([[{ x: 0, y: 0 }]])).toEqual([]);
  });
});

describe('flatten', () => {
  it('joins strokes end to start (the straight joining line is implied)', () => {
    const strokes = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 10, y: 20 },
        { x: 0, y: 20 },
      ],
    ];
    expect(flatten(strokes)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ]);
  });

  it('drops a repeated point where a stroke starts exactly on the last one', () => {
    const strokes = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    ];
    expect(flatten(strokes)).toHaveLength(3);
  });
});

describe('canClose', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ];

  it('needs at least 3 points', () => {
    expect(canClose(square.slice(0, 2), 1)).toBe(false);
  });

  it('needs enough area', () => {
    expect(canClose(square, 400)).toBe(true); // 20 × 20 = 400
    expect(canClose(square, 401)).toBe(false);
  });

  it('rejects points that are all on one line (zero area)', () => {
    expect(canClose(line(0, 0, 50, 0, 3), 1)).toBe(false);
  });
});

describe('copyStrokes', () => {
  it('makes a deep copy', () => {
    const strokes = [[{ x: 1, y: 2 }]];
    const copy = copyStrokes(strokes);
    copy[0][0].x = 99;
    expect(strokes[0][0].x).toBe(1);
  });
});
