// Pixel-art panda drawn from text grids. Each character is one pixel:
//   . = see-through   k = black fur   w = white fur   p = blush
// A dark outline is added automatically around the whole shape.

const COLORS = {
  k: '#2b2c30',
  w: '#ffffff',
  p: '#f2c4ca',
};
const OUTLINE = '#5d5f66';

const BASE = [
  '.kkk........kkk.',
  'kkkkk......kkkkk',
  'kkkwwwwwwwwwwkkk',
  '.kwwwwwwwwwwwwk.',
  '.wwwwwwwwwwwwww.',
  'wwwwwwwwwwwwwwww',
  'wwwkkkwwwwkkkwww', // row 6: eyes start
  'wwkkwkkwwkkwkkww',
  'wwkkkkkwwkkkkkww',
  'wwwkkkwwwwkkkwww',
  'wpwwwwwkkwwwwwpw',
  '.wwwwwwkkwwwwww.',
  '..wwwwkwwkwwww..',
  '...wwwwwwwwww...',
  '..kkkwwwwwwkkk..',
  '.kkkkwwwwwwkkkk.',
  '.kkk.wwwwww.kkk.',
  '....kkk..kkk....',
];

// Each mood only swaps out the eye rows (6–9).
const EYES = {
  normal: null,
  happy: ['wwwkkkwwwwkkkwww', 'wwkkwkkwwkkwkkww', 'wwkwkwkwwkwkwkww', 'wwwkkkwwwwkkkwww'],
  blink: ['wwwkkkwwwwkkkwww', 'wwkkkkkwwkkkkkww', 'wwkwwwkwwkwwwkww', 'wwwkkkwwwwkkkwww'],
};

const PX = 5; // screen pixels per art pixel
const COLS = BASE[0].length;
const ROWS = BASE.length;

function gridFor(mood) {
  const eyes = EYES[mood];
  if (!eyes) return BASE;
  const g = BASE.slice();
  eyes.forEach((row, i) => (g[6 + i] = row));
  return g;
}

export function createPanda(canvas, bubble) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // +2 columns/rows for the outline around the edges.
  const cssW = (COLS + 2) * PX;
  const cssH = (ROWS + 2) * PX;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  let mood = 'normal'; // the "resting" mood
  let showing = 'normal'; // what's on screen right now (may be a blink)
  let sayTimer = null;

  function render(which) {
    showing = which;
    const g = gridFor(which);
    const filled = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && g[r][c] !== '.';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    for (let r = -1; r <= ROWS; r++) {
      for (let c = -1; c <= COLS; c++) {
        const x = (c + 1) * PX;
        const y = (r + 1) * PX;
        if (filled(r, c)) {
          ctx.fillStyle = COLORS[g[r][c]];
          ctx.fillRect(x, y, PX, PX);
        } else if (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1)) {
          // Empty pixel touching the panda: part of the outline.
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(x, y, PX, PX);
        }
      }
    }
  }

  // Blink every few seconds, unless the panda is busy being happy.
  function scheduleBlink() {
    setTimeout(() => {
      if (showing === 'normal') {
        render('blink');
        setTimeout(() => showing === 'blink' && render(mood), 140);
      }
      scheduleBlink();
    }, 2500 + Math.random() * 3000);
  }

  render('normal');
  scheduleBlink();

  return {
    /** Show a message. With `ms`, the bubble goes back to `fallback` afterwards. */
    say(text, { mood: m = 'normal', ms = 0, fallback = null } = {}) {
      clearTimeout(sayTimer);
      bubble.textContent = text;
      bubble.classList.remove('pop');
      void bubble.offsetWidth; // restart the CSS pop animation
      bubble.classList.add('pop');
      mood = m;
      render(m);
      canvas.classList.toggle('hop', m === 'happy');
      if (ms) {
        sayTimer = setTimeout(() => {
          mood = 'normal';
          render('normal');
          canvas.classList.remove('hop');
          if (fallback) bubble.textContent = fallback;
        }, ms);
      }
    },
  };
}
