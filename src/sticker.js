// Turns the traced shape into a transparent PNG.

import { bounds } from './geometry.js';

/**
 * Build the sticker on a new canvas at the image's full resolution.
 * outline = { on: boolean, width: number (px), color: string }
 */
export function buildSticker(img, points, outline) {
  const lineW = outline.on ? outline.width : 0;
  const pad = Math.ceil(lineW) + 1; // room for the outline (and 1px for anti-aliased edges)

  // Crop to just the shape, not the whole image.
  const b = bounds(points);
  const x0 = Math.floor(b.minX) - pad;
  const y0 = Math.floor(b.minY) - pad;
  const w = Math.ceil(b.maxX) + pad - x0;
  const h = Math.ceil(b.maxY) + pad - y0;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Shift everything so the shape's top-left lands near (0, 0).
  ctx.translate(-x0, -y0);

  const shape = new Path2D();
  shape.moveTo(points[0].x, points[0].y);
  for (const p of points) shape.lineTo(p.x, p.y);
  shape.closePath();

  if (outline.on) {
    // A stroke is centred on the path, so half of it lands outside the shape.
    // Width × 2 gives an outline that sticks out by `width` px. Round joins keep corners soft.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = lineW * 2;
    ctx.strokeStyle = outline.color;
    ctx.fillStyle = outline.color;
    ctx.stroke(shape);
    ctx.fill(shape); // fill too, so see-through parts of the image show the outline colour
  }

  // Clipping: after clip(), only pixels inside the shape can be drawn.
  ctx.save();
  ctx.clip(shape);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  return canvas;
}

/** canvas.toBlob uses a callback; wrap it in a Promise so we can `await` it. */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make PNG'))), 'image/png');
  });
}

/** Put the PNG on the system clipboard (works on https and localhost). */
export async function copyBlob(blob) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard images are not supported in this browser');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Download a blob by clicking a temporary <a download> link. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
