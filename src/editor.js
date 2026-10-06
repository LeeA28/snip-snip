// The big canvas: shows the image, records the lasso, lets you edit the dots, and zoom/pan.
//
// Two coordinate systems are used:
//  - "image" coords: pixels of the original image. Points are STORED in these,
//    so the cutout is full resolution no matter how the image is zoomed on screen.
//  - "screen" coords: CSS pixels on the canvas. Used for drawing and mouse hit-tests.
// view.scale / view.ox / view.oy convert between them:  screen = offset + image × scale

import { simplify, distToSegment, polygonArea, clamp, zoomAt, clampPan } from './geometry.js';

const HANDLE = 5; // half the size of a dot, in screen px
const HIT = 9; // how close the mouse must be to grab a dot
const EDGE_HIT = 7; // how close the mouse must be to a line to add a dot
const MIN_STEP = 3; // min screen px between recorded points while tracing
const PAD = 24; // empty space around the image when it's fitted
const PAN_MARGIN = 60; // at least this much of the image always stays on screen
const MAX_ZOOM = 8; // 800%: one image pixel = 8 screen pixels
const WHEEL_SPEED = 0.0015; // how strongly one wheel "notch" zooms
const HISTORY_LIMIT = 100;

const INK = '#2b2c30';
const DEFAULT_TRACE = '#ff0000'; // pure red; users can change it in the TRACE LINE panel

export function createEditor(canvas, callbacks = {}) {
  const ctx = canvas.getContext('2d');

  const s = {
    img: null,
    points: [], // image coords
    mode: 'empty', // empty | ready | tracing | editing
    history: [], // snapshots of `points` for undo
    view: { scale: 1, ox: 0, oy: 0 },
    fitScale: 1, // the scale that shows the whole image (also the minimum zoom)
    isFit: true, // still at the fitted view? (then window resizes re-fit)
    cssW: 0,
    cssH: 0,
    dpr: 1,
    drag: -1, // index of the dot being dragged
    dragSnapshot: null, // points before the drag started
    dragMoved: false,
    hover: -1,
    spaceDown: false, // space held = pan mode
    pan: null, // { startX, startY, ox, oy } while panning
    lastTraceScreen: null,
    traceColor: DEFAULT_TRACE,
    antOffset: 0,
    lastAnt: 0,
    dirty: true,
  };

  // ---------- state helpers ----------

  function setMode(mode) {
    if (s.mode !== mode) {
      s.mode = mode;
      callbacks.onMode?.(mode);
    }
    updateCursor();
    s.dirty = true;
  }

  // Called whenever the finished shape changes, so the sticker preview can update.
  function shapeChanged() {
    s.dirty = true;
    callbacks.onShape?.();
    callbacks.onHistory?.(s.history.length > 0);
  }

  function snapshot() {
    return s.points.map((p) => ({ x: p.x, y: p.y }));
  }

  function pushHistory(points = snapshot()) {
    s.history.push(points);
    if (s.history.length > HISTORY_LIMIT) s.history.shift();
  }

  // ---------- sizing, fitting and zooming ----------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    s.dpr = window.devicePixelRatio || 1;
    s.cssW = rect.width;
    s.cssH = rect.height;
    // The canvas's real pixel size is CSS size × devicePixelRatio, so it stays sharp on high-DPI screens.
    canvas.width = Math.max(1, Math.round(rect.width * s.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * s.dpr));
    if (s.img) {
      s.fitScale = computeFitScale();
      if (s.isFit) fit();
      else setView(s.view);
    }
    s.dirty = true;
  }

  function computeFitScale() {
    const iw = s.img.naturalWidth;
    const ih = s.img.naturalHeight;
    const scale = Math.min((s.cssW - PAD * 2) / iw, (s.cssH - PAD * 2) / ih, 4);
    return Math.max(scale, 0.01);
  }

  // The smallest and largest allowed zoom. A tiny image may already fit at more than 800%.
  const minScale = () => Math.min(s.fitScale, MAX_ZOOM);
  const maxScale = () => Math.max(s.fitScale, MAX_ZOOM);

  // Scale the image to fit inside the canvas and centre it.
  function fit() {
    if (!s.img) return;
    s.fitScale = computeFitScale();
    s.view = {
      scale: s.fitScale,
      ox: (s.cssW - s.img.naturalWidth * s.fitScale) / 2,
      oy: (s.cssH - s.img.naturalHeight * s.fitScale) / 2,
    };
    s.isFit = true;
    viewChanged();
  }

  // Every view change goes through here, so the image can never be pushed out of sight.
  function setView(view) {
    s.view = clampPan(view, s.img.naturalWidth, s.img.naturalHeight, s.cssW, s.cssH, PAN_MARGIN);
    viewChanged();
  }

  function viewChanged() {
    // Mid-trace, keep the "last recorded point" in step with the new view.
    if (s.mode === 'tracing' && s.points.length) {
      s.lastTraceScreen = imageToScreen(s.points[s.points.length - 1]);
    }
    s.dirty = true;
    callbacks.onZoom?.(Math.round(s.view.scale * 100));
  }

  function zoomBy(factor, anchor = { x: s.cssW / 2, y: s.cssH / 2 }) {
    if (!s.img) return;
    setView(zoomAt(s.view, factor, anchor, minScale(), maxScale()));
    s.isFit = false;
  }

  new ResizeObserver(resize).observe(canvas);

  // ---------- coordinate conversion ----------

  function eventToScreen(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function screenToImage(p) {
    const { scale, ox, oy } = s.view;
    return {
      x: clamp((p.x - ox) / scale, 0, s.img.naturalWidth),
      y: clamp((p.y - oy) / scale, 0, s.img.naturalHeight),
    };
  }

  function imageToScreen(p) {
    const { scale, ox, oy } = s.view;
    return { x: ox + p.x * scale, y: oy + p.y * scale };
  }

  // ---------- hit tests (all in screen px) ----------

  function dotAt(sp) {
    let best = -1;
    let bestDist = HIT;
    s.points.forEach((p, i) => {
      const q = imageToScreen(p);
      const d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  function edgeAt(sp) {
    const n = s.points.length;
    for (let i = 0; i < n; i++) {
      const a = imageToScreen(s.points[i]);
      const b = imageToScreen(s.points[(i + 1) % n]);
      if (distToSegment(sp, a, b) <= EDGE_HIT) return i;
    }
    return -1;
  }

  function canPan() {
    return Boolean(s.img) && s.mode !== 'tracing' && s.drag < 0;
  }

  function updateCursor() {
    let c = 'default';
    if (s.pan) c = 'panning';
    else if (s.spaceDown && canPan()) c = 'pan';
    else if (s.mode === 'ready' || s.mode === 'tracing') c = 'trace';
    else if (s.mode === 'editing') c = s.drag >= 0 ? 'grabbing' : s.hover >= 0 ? 'grab' : 'default';
    canvas.dataset.cursor = c;
  }

  // ---------- keyboard: hold space to pan ----------

  // Typing a space into a text box shouldn't start panning.
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'radio');

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || typing(document.activeElement) || !s.img) return;
    // Stops the page scrolling and a focused button "clicking".
    e.preventDefault();
    if (!s.spaceDown) {
      s.spaceDown = true;
      updateCursor();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !s.spaceDown) return;
    e.preventDefault(); // buttons activate on keyup for space, so block it here too
    s.spaceDown = false;
    updateCursor();
  });

  // If the window loses focus mid-pan, the keyup never arrives. Reset instead of getting stuck.
  window.addEventListener('blur', () => {
    s.spaceDown = false;
    s.pan = null;
    updateCursor();
  });

  // ---------- mouse wheel: zoom toward the cursor ----------

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!s.img) return;
      e.preventDefault(); // otherwise the page scrolls too
      // Trackpads send many small deltas, mice send big ones. exp() turns either into a smooth factor:
      // deltaY = +100 → e^(−0.15) ≈ 0.86 (zoom out), deltaY = −100 → e^(0.15) ≈ 1.16 (zoom in).
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // some mice report "lines", not pixels
      zoomBy(Math.exp(-delta * WHEEL_SPEED), eventToScreen(e));
    },
    { passive: false }, // needed so preventDefault() is allowed
  );

  // ---------- pointer events ----------

  canvas.addEventListener('pointerdown', (e) => {
    if (!s.img || e.button !== 0) return;
    const sp = eventToScreen(e);

    if (s.spaceDown && canPan()) {
      s.pan = { startX: sp.x, startY: sp.y, ox: s.view.ox, oy: s.view.oy };
      canvas.setPointerCapture(e.pointerId);
      updateCursor();
      return;
    }

    if (s.mode === 'editing') {
      const i = dotAt(sp);
      if (i < 0) return;
      // Remember the shape before dragging, but only save it to history if the dot actually moves.
      s.drag = i;
      s.dragSnapshot = snapshot();
      s.dragMoved = false;
      canvas.setPointerCapture(e.pointerId);
      updateCursor();
      return;
    }

    if (s.mode === 'ready') {
      // Pointer capture keeps sending us moves even if the mouse leaves the canvas mid-trace.
      canvas.setPointerCapture(e.pointerId);
      s.points = [screenToImage(sp)];
      s.lastTraceScreen = sp;
      setMode('tracing');
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!s.img) return;
    const sp = eventToScreen(e);

    if (s.pan) {
      setView({ scale: s.view.scale, ox: s.pan.ox + sp.x - s.pan.startX, oy: s.pan.oy + sp.y - s.pan.startY });
      s.isFit = false;
      return;
    }

    if (s.mode === 'tracing') {
      const last = s.lastTraceScreen;
      if (Math.hypot(sp.x - last.x, sp.y - last.y) >= MIN_STEP) {
        s.points.push(screenToImage(sp));
        s.lastTraceScreen = sp;
        s.dirty = true;
      }
      return;
    }

    if (s.drag >= 0) {
      s.points[s.drag] = screenToImage(sp);
      s.dragMoved = true;
      s.dirty = true;
      return;
    }

    if (s.mode === 'editing') {
      const h = dotAt(sp);
      if (h !== s.hover) {
        s.hover = h;
        updateCursor();
        s.dirty = true;
      }
    }
  });

  function endPointer() {
    if (s.pan) {
      s.pan = null;
      updateCursor();
    } else if (s.mode === 'tracing') {
      finishTrace();
    } else if (s.drag >= 0) {
      if (s.dragMoved) {
        pushHistory(s.dragSnapshot);
        shapeChanged();
      }
      s.drag = -1;
      s.dragSnapshot = null;
      updateCursor();
      s.dirty = true;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointerleave', () => {
    if (s.hover !== -1 && s.drag < 0) {
      s.hover = -1;
      updateCursor();
      s.dirty = true;
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    if (s.mode !== 'editing' || s.spaceDown) return;
    const sp = eventToScreen(e);
    const i = dotAt(sp);
    if (i >= 0) {
      if (s.points.length <= 3) {
        callbacks.onNotice?.('need at least 3 dots!');
        return;
      }
      pushHistory();
      s.points.splice(i, 1);
      s.hover = -1;
      shapeChanged();
      return;
    }
    const edge = edgeAt(sp);
    if (edge >= 0) {
      pushHistory();
      s.points.splice(edge + 1, 0, screenToImage(sp));
      shapeChanged();
    }
  });

  function finishTrace() {
    // Drop points that barely change the shape. Epsilon is ~1.5 screen px, converted to image px.
    const simplified = simplify(s.points, 1.5 / s.view.scale);
    const minArea = (10 / s.view.scale) ** 2;

    if (simplified.length < 3 || polygonArea(simplified) < minArea) {
      s.points = [];
      setMode('ready');
      callbacks.onNotice?.('too tiny! try a bigger loop');
      return;
    }

    pushHistory([]); // undoing the first trace goes back to an empty canvas
    s.points = simplified;
    setMode('editing');
    shapeChanged();
  }

  // ---------- drawing ----------

  function draw() {
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.cssW, s.cssH);
    if (!s.img) return;

    const { scale, ox, oy } = s.view;
    const iw = s.img.naturalWidth * scale;
    const ih = s.img.naturalHeight * scale;

    // Zoomed in past 100%: show hard-edged pixels instead of a blur, so edges are easy to follow.
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.img, ox, oy, iw, ih);

    const pts = s.points.map(imageToScreen);

    if (s.mode === 'tracing' && pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // A thin white edge under the coloured line keeps it visible on any image.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = s.traceColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    if (s.mode !== 'editing' || pts.length < 3) return;

    const shape = new Path2D();
    shape.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) shape.lineTo(p.x, p.y);
    shape.closePath();

    // Dim everything outside the shape. 'evenodd' means: fill the image rectangle,
    // but the area inside the shape counts as a hole, so it stays clear.
    const outside = new Path2D();
    outside.rect(ox, oy, iw, ih);
    outside.addPath(shape);
    ctx.fillStyle = 'rgba(30, 31, 35, 0.5)';
    ctx.fill(outside, 'evenodd');

    // "Marching ants" border: a white line with a moving coloured dashed line on top.
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke(shape);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -s.antOffset;
    ctx.strokeStyle = s.traceColor;
    ctx.stroke(shape);
    ctx.setLineDash([]);

    // Square, pixel-style dots.
    pts.forEach((p, i) => {
      const active = i === s.hover || i === s.drag;
      const r = active ? HANDLE + 2 : HANDLE;
      const x = Math.round(p.x - r);
      const y = Math.round(p.y - r);
      ctx.fillStyle = active ? INK : '#ffffff';
      ctx.fillRect(x, y, r * 2, r * 2);
      ctx.strokeStyle = active ? '#ffffff' : INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, r * 2 - 2, r * 2 - 2);
    });
  }

  // Redraw only when something changed (plus a tick for the moving dashes).
  function loop(t) {
    if (s.mode === 'editing' && t - s.lastAnt > 90) {
      s.antOffset = (s.antOffset + 1) % 12;
      s.lastAnt = t;
      s.dirty = true;
    }
    if (s.dirty) {
      draw();
      s.dirty = false;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- public API ----------

  return {
    loadImage(img) {
      s.img = img;
      s.points = [];
      s.history = [];
      s.hover = -1;
      s.drag = -1;
      s.pan = null;
      fit();
      setMode('ready');
      shapeChanged();
    },
    undo() {
      if (s.mode === 'tracing' || s.drag >= 0 || !s.history.length) return;
      s.points = s.history.pop();
      s.hover = -1;
      setMode(s.points.length >= 3 ? 'editing' : 'ready');
      shapeChanged();
    },
    retrace() {
      if (!s.points.length || s.mode === 'tracing') return;
      pushHistory();
      s.points = [];
      s.hover = -1;
      setMode('ready');
      shapeChanged();
    },
    zoomIn() {
      zoomBy(1.25);
    },
    zoomOut() {
      zoomBy(0.8);
    },
    fit,
    setTraceColor(color) {
      s.traceColor = color;
      s.dirty = true;
    },
    get mode() {
      return s.mode;
    },
    get image() {
      return s.img;
    },
    get points() {
      return s.points;
    },
  };
}
