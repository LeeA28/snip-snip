// Pixel art for the panda, built from text grids. No DOM here, so it can be tested in Node.
//
// One character = one pixel:
//   .  see-through      k  black      w  white      p  blush
//   g  bamboo           G  bamboo joint / leaf
//
// Most parts are symmetric, so only the LEFT half is written and `sym()` mirrors it.

export const W = 34; // canvas width in art pixels
export const H = 28; // canvas height in art pixels

/** Mirror a left half into a full row: 'abc' -> 'abccba'. */
const sym = (half) => half + [...half].reverse().join('');

// ---------- head (22 x 15) ----------

const HEAD_TOP = ['..kkkk.....', '.kkkkkk....', '.kkkkkkkkkk', '.kkkkkwwwww', '..kkwwwwwww', '.kwwwwwwwww', 'kwwwwwwwwww'];

// Rows 7–10: the eyes. Each mood swaps just these.
const EYES = {
  open: ['kwwkkkwwwww', 'kwkkkkkwwww', 'kwkkwkkwwww', 'kwkkkkwwwwk'],
  closed: ['kwwkkkwwwww', 'kwkkkkkwwww', 'kwkwwwkwwww', 'kwkkkkwwwwk'], // blink
  asleep: ['kwwkkkwwwww', 'kwkkkkkwwww', 'kwkkkkkwwww', 'kwkkkkwwwwk'], // solid black patches
  happy: ['kwwkkkwwwww', 'kwkkwkkwwww', 'kwkwkwkwwww', 'kwkkkkwwwwk'],
};

const MOUTH = {
  shut: ['kwpwwwwwwwk', '.kwwwwwwwkw'],
  open: ['kwpwwwwwwwk', '.kwwwwwwwkk'],
};

const HEAD_BOTTOM = ['..kkwwwwwww', '....kkkkkkk'];

function head(eyes = 'open', mouth = 'shut') {
  return [...HEAD_TOP, ...EYES[eyes], ...MOUTH[mouth], ...HEAD_BOTTOM].map(sym);
}

// ---------- bodies ----------

// Sitting, paws resting on the tummy, feet out front (22 wide).
// Black shoulder band, arms down the sides ending in paws on the tummy, black feet.
const BODY_SIT = [
  '..kkkkkkkkk',
  '.kkkkkkkkkk',
  '.kkkkkkkwww',
  'kkkkkkkkwww',
  'kwkkkkkkwww',
  'kwwkkkkwwww',
  'kwwwwwwwwww',
  'kkkkkwwwwww',
  'kkkkkkwwwww',
  '.kkkkkkkkkk',
].map(sym);

// Same, but with the arms raised (used for "happy"): plain white chest.
const BODY_ARMS_UP = [
  '..kkkkkkkkk',
  '.kkkkkkkkkk',
  '.kwwwwwwwww',
  'kwwwwwwwwww',
  'kwwwwwwwwww',
  'kwwwwwwwwww',
  'kwwwwwwwwww',
  'kkkkkwwwwww',
  'kkkkkkwwwww',
  '.kkkkkkkkkk',
].map(sym);

// A raised arm (left side; mirrored for the right).
const ARM_UP = ['kkk....', 'kkkk...', '.kkkk..', '..kkkk.', '...kkkk'];

// ---------- sleeping parts ----------

// The back/bottom, lying behind the head (asymmetric).
const HUMP = [
  '....kkkkkkk.....',
  '..kkwwwwwwwkk...',
  '.kwwwwwwwwwwwk..',
  'kwwwwwwwwwwwwwk.',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwkkkkkk',
  'kwwwwwwwwkkkkkkk',
  'kwwwwwwwwkkkkkkk',
  'kkkkkkkkkkkkkkk.',
];

// A front paw the head rests on.
const PAW = ['.kkkkkk.', 'kkkkkkkk', 'kkkkkkkk', '.kkkkkk.'];

// ---------- zzz letters ----------

const Z_SMALL = ['zzzz', '..z.', '.z..', 'zzzz'];
const Z_BIG = ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz'];

// ---------- bamboo ----------

function bamboo(length) {
  // Two pixels wide with a dark outline, a joint every 4 rows, and a leaf at the top.
  const rows = ['..GG..', '.GGk..', '..kGG.', '.kggk.'];
  for (let i = 0; i < length; i++) rows.push(i % 4 === 3 ? '.kGGk.' : '.kggk.');
  return rows;
}

// ---------- composing ----------

function blank() {
  return Array.from({ length: H }, () => Array(W).fill('.'));
}

/** Copy a sprite onto the buffer at (x, y). '.' in the sprite is see-through. */
function place(buf, sprite, x, y) {
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const yy = y + r;
      const xx = x + c;
      if (ch !== '.' && yy >= 0 && yy < H && xx >= 0 && xx < W) buf[yy][xx] = ch;
    }
  });
}

/** Make a sprite one row taller by repeating row `r` (used for breathing). */
function stretch(sprite, r) {
  return [...sprite.slice(0, r + 1), sprite[r], ...sprite.slice(r + 1)];
}

const mirrorRow = (row) => [...row].reverse().join('');

// Where the sitting panda sits on the canvas.
const SIT_X = 5;
const SIT_Y = H - 25;

/**
 * Build one frame.
 *   pose: 'sit' | 'eat' | 'sleep' | 'happy'
 *   t:    milliseconds since the pose started (drives the animation)
 *   opts: { blink: boolean }
 * Returns { grid: string[], zs: [{ sprite, x, y, alpha }] }
 */
export function composePose(pose, t = 0, opts = {}) {
  const buf = blank();
  const zs = [];

  if (pose === 'sit') {
    place(buf, BODY_SIT, SIT_X, SIT_Y + 15);
    place(buf, head(opts.blink ? 'closed' : 'open'), SIT_X, SIT_Y);
  }

  if (pose === 'happy') {
    place(buf, BODY_ARMS_UP, SIT_X, SIT_Y + 15);
    place(buf, head('happy', 'open'), SIT_X, SIT_Y);
    place(buf, ARM_UP, SIT_X - 5, SIT_Y + 11);
    place(buf, ARM_UP.map(mirrorRow), SIT_X + 20, SIT_Y + 11);
  }

  if (pose === 'eat') {
    // One bite every 700 ms: paw lifts the bamboo to the mouth for the first half.
    const BITE = 700;
    const bite = Math.floor(t / BITE);
    const up = t % BITE < BITE / 2;
    const length = 9 - (bite % 4); // gets shorter each bite, then a fresh stalk
    const stalk = bamboo(length);
    const lift = up ? 1 : 0;

    place(buf, BODY_SIT, SIT_X, SIT_Y + 15);
    place(buf, head(opts.blink ? 'closed' : 'open', up ? 'open' : 'shut'), SIT_X, SIT_Y);
    // Stalk held up beside the mouth (viewer's right), leaves at the top.
    const sx = SIT_X + 11;
    const sy = SIT_Y + 8 - lift;
    place(buf, stalk, sx, sy);
    // The paw wrapped around the bottom of the stalk.
    place(buf, ['.kkkk.', 'kkkkkk', 'kkkkkk', '.kkkk.'], sx, sy + stalk.length - 3);
  }

  if (pose === 'sleep') {
    // Breathing: the back rises by one pixel for half of every 2.4 s.
    const inhale = t % 2400 < 1200;
    const hump = inhale ? stretch(HUMP, 4) : HUMP;
    const humpY = H - hump.length - 1;
    place(buf, hump, 17, humpY);

    const headY = H - 17;
    place(buf, head('asleep'), 1, headY);
    place(buf, PAW, 1, H - 5);
    place(buf, PAW, 15, H - 5);

    // Three z's float up from above the head, one after another.
    const LIFE = 2400;
    const sizes = [Z_SMALL, Z_BIG, Z_SMALL];
    sizes.forEach((sprite, i) => {
      const born = t - i * 800;
      if (born < 0) return; // not born yet
      const k = (born % LIFE) / LIFE; // 0 → 1 over its life
      const alpha = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      zs.push({
        sprite,
        x: Math.round(19 + k * 8),
        y: Math.round(headY - sprite.length - 1 - k * 8),
        alpha: Math.max(0, Math.min(1, alpha)),
      });
    });
  }

  return { grid: buf.map((row) => row.join('')), zs };
}
