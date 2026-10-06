// The panda mascot: draws frames from pandaArt.js and decides which pose to show.
//
// A tiny state machine:
//   sleep → sit → eat → sleep → ...   (each pose lasts POSE_MS)
//   any pose → happy                  (on copy/download, for a couple of seconds)
//   happy → sit                       (then the loop carries on from there)

import { composePose, W, H } from './pandaArt.js';

const COLORS = {
  k: '#2b2c30',
  w: '#ffffff',
  p: '#f2c4ca',
  g: '#a9bfa2', // soft sage bamboo
  G: '#7f9a78', // bamboo joints and leaves
  z: '#8a8c93',
};

const PX = 6; // screen pixels per art pixel
const LOOP = ['sleep', 'sit', 'eat'];
const POSE_MS = 8000;
const HAPPY_MS = 2200;
const TICK_MS = 100; // how often frames update (10 fps is plenty for pixel art)

export function createPanda(canvas, bubble) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = W * PX;
  const cssH = H * PX;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const s = {
    loopIndex: 1, // start awake, sitting
    pose: 'sit',
    poseStart: performance.now(),
    nextBlink: performance.now() + 2500,
    blinkUntil: 0,
    happyUntil: 0,
  };
  let sayTimer = null;

  function setPose(pose) {
    s.pose = pose;
    s.poseStart = performance.now();
    canvas.classList.toggle('hop', pose === 'happy' && !reduceMotion);
  }

  function draw(now) {
    // With reduced motion, freeze time at 0 so nothing moves or floats.
    const t = reduceMotion ? 0 : now - s.poseStart;
    const { grid, zs } = composePose(s.pose, t, { blink: now < s.blinkUntil });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    grid.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = COLORS[ch];
        ctx.fillRect(c * PX, r * PX, PX, PX);
      }
    });

    // Floating z's fade in and out using globalAlpha.
    if (!reduceMotion) {
      ctx.fillStyle = COLORS.z;
      for (const z of zs) {
        ctx.globalAlpha = z.alpha;
        z.sprite.forEach((row, r) => {
          for (let c = 0; c < row.length; c++) {
            if (row[c] !== '.') ctx.fillRect((z.x + c) * PX, (z.y + r) * PX, PX, PX);
          }
        });
      }
      ctx.globalAlpha = 1;
    }
  }

  function tick() {
    const now = performance.now();

    if (s.pose === 'happy') {
      if (now >= s.happyUntil) {
        s.loopIndex = 1;
        setPose('sit');
      }
    } else if (!reduceMotion && now - s.poseStart >= POSE_MS) {
      s.loopIndex = (s.loopIndex + 1) % LOOP.length;
      setPose(LOOP[s.loopIndex]);
    }

    // Blink every few seconds while awake.
    if (!reduceMotion && (s.pose === 'sit' || s.pose === 'eat') && now >= s.nextBlink) {
      s.blinkUntil = now + 150;
      s.nextBlink = now + 2500 + Math.random() * 3000;
    }

    draw(now);
  }

  draw(performance.now());
  setInterval(tick, TICK_MS);

  return {
    /** Show a message. mood 'happy' plays the cheer pose. With `ms`, the bubble returns to `fallback` afterwards. */
    say(text, { mood = 'normal', ms = 0, fallback = null } = {}) {
      clearTimeout(sayTimer);
      bubble.textContent = text;
      bubble.classList.remove('pop');
      void bubble.offsetWidth; // restart the CSS pop animation
      bubble.classList.add('pop');

      if (mood === 'happy') {
        s.happyUntil = performance.now() + (ms || HAPPY_MS);
        setPose('happy');
      }

      if (ms) {
        sayTimer = setTimeout(() => {
          if (fallback) bubble.textContent = fallback;
        }, ms);
      }
    },
  };
}
