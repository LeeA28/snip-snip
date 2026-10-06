# ✂ Snip Snip

Trace any part of an image and turn it into a transparent sticker you can copy or download. Wrapped in a silver-and-white 8-bit UI with a pixel panda that cheers you on.

**Live:** _add your Vercel link here_

## Features

- **Load an image** by choosing a file, dragging it onto the canvas, or pasting with Ctrl + V
- **Freehand lasso:** hold and drag around what you want, and let go to close the shape
- **Edit the shape:** drag dots to adjust, double-click a line to add a dot, double-click a dot to remove it
- **Undo** with Ctrl + Z (up to 100 steps)
- **Full-resolution output:** the cutout is cropped to the shape and saved as a transparent PNG at the original image's resolution
- **Optional sticker outline** with adjustable thickness and colour (white, silver, black)
- **Copy** straight to the clipboard or **download** as a PNG
- **Private:** everything runs in the browser, and images are never uploaded

## Tech

- Vanilla JavaScript (ES modules) with the HTML Canvas 2D API
- Vite for the dev server and build
- Vitest for unit tests
- Deployed on Vercel

## Run it locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run build   # production build in dist/
```

## How it works (short version)

1. Mouse points are recorded in the original image's pixel coordinates, so the output is full resolution even when the image is shown scaled down.
2. When you let go, the trace is simplified with the Ramer–Douglas–Peucker algorithm, which turns hundreds of points into a few dozen editable dots.
3. To make the sticker, a new canvas is cropped to the shape's bounding box, the shape is used as a clipping path, and the image is drawn through it. Everything outside the shape stays transparent.
4. The outline is the same shape stroked at twice the chosen width before the image is drawn, so half the stroke sticks out past the edge.

See [`GUIDE.md`](GUIDE.md) for the full walkthrough.
