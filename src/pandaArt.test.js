import { describe, it, expect } from 'vitest';
import { composePose, W, H } from './pandaArt.js';

const POSES = ['sit', 'eat', 'sleep', 'happy'];
const ALLOWED = /^[.kwpgG]+$/;

const count = (grid, ch) => grid.join('').split(ch).length - 1;

describe('composePose', () => {
  it('always returns a full W x H grid with only known colours', () => {
    for (const pose of POSES) {
      for (const t of [0, 350, 1300, 2500, 7900]) {
        const { grid } = composePose(pose, t);
        expect(grid).toHaveLength(H);
        for (const row of grid) {
          expect(row).toHaveLength(W);
          expect(row).toMatch(ALLOWED);
        }
      }
    }
  });

  it('blinking changes the face', () => {
    const open = composePose('sit', 0).grid;
    const shut = composePose('sit', 0, { blink: true }).grid;
    expect(shut).not.toEqual(open);
  });

  it('sleeping eyes are solid black (no white inside the eye patches)', () => {
    const { grid } = composePose('sleep', 1300);
    // Head is placed at x = 1, y = H − 17; eye rows are 7–10, left patch columns 2–6.
    const y0 = H - 17;
    for (let r = 8; r <= 9; r++) {
      expect(grid[y0 + r].slice(1 + 2, 1 + 7)).toBe('kkkkk');
    }
  });

  it('sleeping breathes: the back is taller on the in-breath', () => {
    const inhale = composePose('sleep', 0).grid;
    const exhale = composePose('sleep', 1300).grid;
    expect(count(inhale, 'w')).toBeGreaterThan(count(exhale, 'w'));
  });

  it("z's only appear while sleeping and stay between 0 and 1 opacity", () => {
    expect(composePose('sit', 1000).zs).toHaveLength(0);
    for (let t = 0; t < 6000; t += 137) {
      for (const z of composePose('sleep', t).zs) {
        expect(z.alpha).toBeGreaterThanOrEqual(0);
        expect(z.alpha).toBeLessThanOrEqual(1);
      }
    }
    expect(composePose('sleep', 2000).zs).toHaveLength(3);
  });

  it('the bamboo gets shorter with each bite, then resets', () => {
    const green = (t) => count(composePose('eat', t).grid, 'g');
    expect(green(400)).toBeGreaterThan(green(1100)); // bite 0 vs bite 1 (same paw position)
    expect(green(400)).toBe(green(400 + 4 * 700)); // fresh stalk after 4 bites
  });
});
