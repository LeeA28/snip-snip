# Snip Snip Guide

A record of what Snip Snip is, why it's built the way it is, and how every part works. Written so you can explain any piece of it in an interview without opening the code.

---

## 1. What Snip Snip does

- You load an image, trace around part of it, and get that part as its own transparent PNG (a "sticker")
- Ways to load an image
  - **Choose file** button (or **new image** in the toolbar)
  - Drag and drop onto the canvas
  - Paste from the clipboard with Ctrl + V (great for screenshots)
- Tracing
  - Hold the mouse button and drag around the part you want
  - Letting go closes the shape automatically (the last point joins back to the first)
- Editing the shape afterwards
  - Drag a dot to move it
  - Double-click a line to add a dot there
  - Double-click a dot to remove it (a shape always keeps at least 3)
  - **Undo** button or Ctrl + Z
  - **Retrace** clears the shape so you can draw a new one (also undoable)
- Output
  - The sticker preview updates live as you edit
  - Optional outline: on/off toggle, thickness slider (2–60 px), colour (white, silver, black)
  - **Copy** puts the PNG on the clipboard, **Download** saves `<original-name>-snip.png`
- Privacy
  - Nothing is uploaded anywhere. The image only ever exists in your browser's memory

---

## 2. Decisions log

- **Name:** Snip Snip (repo: `snip-snip`)
- **Stack:** Vite + vanilla JavaScript (no React)
  - Almost all the work happens inside a `<canvas>`, which React can't render into anyway
  - Plain JS keeps the "how does the cutout work" explanation framework-free
- **Build approach:** whole v1 written at once, then reviewed and polished
- **Tracing style:** freehand lasso (hold and drag), with editable dots afterwards
- **Output:** plain transparent cutout by default, outline is an optional toggle
- **Devices:** desktop only for v1 (it still doesn't break on a narrow window)
- **Theme:** 8-bit, mostly white / silver / gray, with one tiny accent (the panda's pink blush)
- **Mascot:** a pixel panda that gives hints and reacts (blinks, hops when you copy or download)
- **Hosting:** GitHub repo + Vercel, same as Encore

---

## 3. Project structure

```
snip-snip/
├── index.html            the page layout (header, canvas panel, side panels)
├── package.json          scripts + dev dependencies (vite, vitest)
├── public/               files served as-is
│   ├── favicon.svg       pixel panda tab icon
│   ├── sparkles.svg      tiled pixel-flower background
│   └── cursor-trace.svg  pixel crosshair cursor used while tracing
└── src/
    ├── main.js           wires everything together (loading, buttons, preview, panda)
    ├── editor.js         the big canvas: drawing, tracing, editing dots, undo
    ├── geometry.js       pure math helpers (simplify, distances, area, bounds)
    ├── sticker.js        builds the PNG + copy/download helpers
    ├── panda.js          draws the pixel panda from text grids
    ├── style.css         the 8-bit theme
    └── geometry.test.js  unit tests for geometry.js
```

- Why it's split this way
  - `geometry.js` has no DOM code at all, so it can be unit tested in Node
  - `editor.js` doesn't know about buttons or the preview. It reports changes through **callbacks** (`onMode`, `onShape`, `onHistory`, `onNotice`), and `main.js` decides what to do with them
    - This is called **separation of concerns**: each file has one job, and they talk through a small interface

---

## 4. Running it

- First time, in the `snip-snip` folder
  - `npm install` downloads Vite and Vitest into `node_modules/`
- Every day
  - `npm run dev` starts the dev server at http://localhost:5173. Saving a file reloads the page automatically
- Other commands
  - `npm test` runs the unit tests once
  - `npm run build` makes the production version in `dist/` (this is what Vercel runs)
  - `npm run preview` serves `dist/` locally so you can check the production build
- Note: the Copy button needs a "secure context". `localhost` and `https://` sites both count, so it works in dev and on Vercel

---

## 5. How each part works

### 5.1 Two coordinate systems (the most important idea)

- **Image coordinates:** pixels of the original image (e.g. 0–1773 across for a phone screenshot)
- **Screen coordinates:** CSS pixels on the canvas, where the image is shown scaled down to fit
- The editor keeps a `view` object: `scale`, `ox`, `oy` (the image's offset inside the canvas)
  - Screen → image: `x_img = (x_screen − ox) / scale`
  - Image → screen: `x_screen = ox + x_img × scale`
  - Example with numbers: if `scale = 0.25` and `ox = 100`, a click at screen x = 300 is image x = (300 − 100) / 0.25 = 200 / 0.25 = **800**
- **Points are stored in image coordinates**
  - So the sticker is cut at full resolution, no matter how small the image looks on screen
  - So resizing the window doesn't break the shape. Only `view` changes, and the dots get redrawn in the right place
- **Hit-testing happens in screen coordinates**
  - "Is the mouse near this dot?" should mean "within 9 pixels *on screen*", regardless of zoom, so dots are converted to screen coords before measuring

### 5.2 Sharp canvas on high-DPI screens

- A canvas has two sizes
  - Its CSS size (how big it looks)
  - Its real pixel size (`canvas.width` / `canvas.height`)
- On a laptop with `devicePixelRatio = 2`, a 800px-wide canvas needs 1600 real pixels, or it looks blurry
- `resize()` sets the real size to CSS size × `devicePixelRatio`, then `ctx.setTransform(dpr, …)` lets all drawing code keep using CSS pixels
- A `ResizeObserver` calls `resize()` whenever the canvas changes size (window resize, layout changes)

### 5.3 Recording the trace

- `pointerdown` starts a trace, `pointermove` adds points, `pointerup` finishes
  - **Pointer events** cover mouse, pen and touch with one API
- `setPointerCapture` keeps sending moves to the canvas even if the mouse leaves it mid-drag, so a trace can't get "stuck"
- A new point is only recorded if the mouse moved at least 3 screen pixels, which avoids thousands of near-duplicate points

### 5.4 Simplifying the trace (Ramer–Douglas–Peucker)

- A freehand trace can have hundreds of points, which is far too many dots to edit by hand
- **RDP algorithm**, in plain words
  1. Draw a straight line from the first point to the last
  2. Find the point that's farthest from that line
  3. If it's farther than `epsilon`, keep it, and repeat steps 1–3 on the left half and the right half
  4. If it's not, every point in between is "close enough" to the straight line, so drop them all
- Why it works: points on straight stretches get dropped, corners and curves (which stick out) get kept
- `epsilon` is 1.5 *screen* pixels converted to image pixels (`1.5 / scale`), so the result looks equally detailed at any zoom
- Implementation detail: it uses an explicit **stack** instead of recursion, so a huge trace can't cause a stack overflow
- Complexity: O(n log n) on typical shapes, O(n²) worst case. Fine for a few thousand points
- Traces that are too small (under 3 points, or area under roughly 10 × 10 screen pixels) are rejected, and the panda says so

### 5.5 Polygon area (shoelace formula)

- Used to reject accidental tiny traces
- For points (x₁,y₁) … (xₙ,yₙ): area = ½ × |Σ (xᵢ × yᵢ₊₁ − xᵢ₊₁ × yᵢ)|, wrapping around so point n+1 is point 1
- Worked example, triangle (0,0), (4,0), (0,3)
  - (0)(0) − (4)(0) = 0
  - (4)(3) − (0)(0) = 12
  - (0)(0) − (0)(3) = 0
  - Sum = 12, area = 12 / 2 = **6** ✓ (matches ½ × base 4 × height 3)
- Why it works: each term is twice the *signed* area of the triangle from the origin to one edge. Going around the shape, triangles outside the shape cancel out and only the inside is left. The absolute value fixes the sign, which depends on clockwise vs counter-clockwise

### 5.6 Distance from a point to a segment

- Used for "is the mouse on this line?" when double-clicking to add a dot, and inside RDP
- Project the point onto the infinite line through a and b: `t = ((p − a) · (b − a)) / |b − a|²`
  - `t = 0` is at a, `t = 1` is at b
- Clamp `t` to [0, 1] so the closest point stays *on the segment*, then measure the distance to `a + t(b − a)`
- Worked example: p = (13, 4), a = (0, 0), b = (10, 0)
  - (p − a) · (b − a) = 13 × 10 + 4 × 0 = 130
  - |b − a|² = 10² = 100
  - t = 130 / 100 = 1.3 → clamped to 1, so the closest point is b = (10, 0)
  - distance = √((13 − 10)² + (4 − 0)²) = √(9 + 16) = √25 = **5**

### 5.7 Drawing the editor (overlay, marching ants, dots)

- Every redraw: clear, draw the image, then draw the shape on top
- **Dimming outside the shape** uses the `evenodd` fill rule
  - One path contains two shapes: the image rectangle and the traced polygon
  - With `evenodd`, a pixel is filled if it's inside an *odd* number of shapes
    - Outside the polygon but inside the rectangle: inside 1 shape → filled (dimmed)
    - Inside the polygon: inside 2 shapes → not filled (stays bright)
- **Marching ants**: a solid white line, then a dark dashed line on top whose `lineDashOffset` changes every 90 ms, which makes the dashes crawl
- **Redraw loop**: `requestAnimationFrame` runs every frame, but only actually draws when a `dirty` flag is set. This keeps CPU use low while nothing is changing

### 5.8 Undo

- `history` is a stack of snapshots (copies of the points array)
- A snapshot is pushed *before* each change: finishing a trace, moving a dot, adding/removing a dot, retracing
- Undo pops the latest snapshot and restores it
- Dragging is handled carefully: the snapshot is taken on `pointerdown`, but only pushed if the dot actually moved. Otherwise just clicking a dot (or double-clicking it) would fill the history with duplicate states
- Capped at 100 entries so memory can't grow forever

### 5.9 Making the sticker (`sticker.js`)

1. Find the shape's **bounding box** (min/max x and y of the points) and add padding for the outline
2. Make a new canvas exactly that size
3. `ctx.translate(−x0, −y0)` shifts drawing so the box's corner lands at (0, 0). This lets the original image coordinates be used directly
4. If the outline is on
   - Stroke the shape with `lineWidth = width × 2`
     - A stroke is centred on the path, so half of it is inside and half is outside. Doubling it means the outside half is exactly `width` px
   - `lineJoin = 'round'` gives smooth corners, like a real die-cut sticker
   - Also fill the shape with the outline colour, so see-through parts of the original image (if it was a transparent PNG) show the outline colour instead of a hole
5. `ctx.clip(shape)` then `ctx.drawImage(img, 0, 0)`
   - After `clip()`, only pixels inside the shape can be painted. Everything else stays fully transparent
6. `canvas.toBlob(..., 'image/png')` encodes it as a PNG (wrapped in a Promise so it can be `await`ed)

- The preview waits 120 ms after the last change before rebuilding (**debouncing**), because encoding a full-resolution PNG on every slider tick would be slow
- A `previewToken` counter makes sure an older, slower preview can't overwrite a newer one (a simple fix for a **race condition**)

### 5.10 Blobs and object URLs

- A **Blob** is a chunk of binary data in memory (here, the PNG file)
- `URL.createObjectURL(blob)` makes a temporary `blob:` URL that points at it, which `<img src>` or a download link can use
- Each one holds memory until `URL.revokeObjectURL` is called, so the old preview URL is revoked whenever a new one is made (otherwise memory leaks over time)

### 5.11 Copy and download

- **Copy:** `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`
  - Needs https or localhost, and a user action (a click)
  - If it fails (older browser, permissions), the panda suggests downloading instead
- **Download:** create a hidden `<a href="blob:..." download="name.png">`, click it in code, remove it
  - The `download` attribute tells the browser to save the file instead of opening it

### 5.12 Loading images

- File → `URL.createObjectURL(file)` → `new Image()` → wait for `onload` → hand it to the editor
- Drag and drop
  - `dragover` must call `preventDefault()`, or the browser never fires `drop`
  - `dragenter`/`dragleave` also fire when moving over child elements, so a counter (`dragDepth`) tracks whether the file is really still over the stage
- Paste: the `paste` event's `clipboardData.items` is searched for anything with an `image/` type
- The file input's value is reset after each pick, so choosing the same file twice still fires `change`

### 5.13 The 8-bit theme

- **Fonts:** "Press Start 2P" for titles and buttons, "VT323" for body text (both Google Fonts)
- **Notched pixel borders:** four hard `box-shadow`s (top, bottom, left, right, no blur) instead of a `border`
  - Each shadow is a copy of the box shifted one way, so the corners are left empty, which gives the stepped 8-bit corner
- **Buttons:** the same border, plus inset light/dark shadows for a bevel. `:active` moves the button down 2px and flips the bevel, so it looks pressed
- **Animations** use `steps()` timing, so they jump between frames like old games instead of sliding smoothly
- **Background:** a small tiled SVG of pixel flowers (`public/sparkles.svg`) with `shape-rendering="crispEdges"` so edges stay sharp
- **Checkerboard** behind the canvas and the preview (the standard "this area is transparent" pattern) uses `repeating-conic-gradient`
- `prefers-reduced-motion` turns off the panda's animations for people who've asked their OS for less motion

### 5.14 The panda

- Drawn from text grids where each character is one pixel: `k` black fur, `w` white fur, `p` blush, `.` empty
- **Auto-outline:** any empty pixel touching a filled pixel (up, down, left or right) is painted dark gray, so the white fur shows up against the white page
- **Moods** just swap the four eye rows: `normal`, `happy` (^ ^ eyes, plus a hop animation), and `blink`
- Blinks at a random interval (2.5–5.5 s) so it doesn't feel robotic
- `say(text, { mood, ms, fallback })` shows a message, and after `ms` goes back to the current hint

---

## 6. Putting it on GitHub and Vercel

### 6.1 GitHub

- Create an **empty** repo named `snip-snip` on GitHub (no README, no .gitignore, since the project already has them)
- In the `snip-snip` folder
  ```bash
  git init
  git add .
  git commit -m "Snip Snip v1: lasso cutout tool with pixel UI"
  git branch -M main
  git remote add origin https://github.com/<your-username>/snip-snip.git
  git push -u origin main
  ```
- About your token
  - If Windows asks for a password, it's the same situation as SumUp/Encore: your fine-grained token has to include `snip-snip` too
  - Edit the existing token on GitHub → **Repository access** → add `snip-snip` → save. The saved token keeps working, nothing to re-enter
- `.gitignore` already skips `node_modules/` and `dist/`

### 6.2 Vercel

- vercel.com → **Add New… → Project** → import `snip-snip` from GitHub
- Vercel detects Vite automatically
  - Build command: `npm run build`
  - Output directory: `dist`
- Click **Deploy**. Every push to `main` redeploys automatically after that
- No environment variables are needed, since there's no backend or API key
- After it's live
  - Put the link in the README (`**Live:**` line) and the repo's **About** section
  - Pin the repo on your GitHub profile if you want it visible

---

## 7. Testing

- `npm test` runs `src/geometry.test.js` (12 tests)
  - `distToSegment`: middle of a segment, past the end, zero-length segment
  - `simplify`: straight line → 2 points, L-shape keeps its corner, epsilon controls detail, short input is copied not reused, 20,000-point circle doesn't overflow
  - `polygonArea`: square in both directions, triangle
  - `bounds` and `clamp`
- Manual checklist before deploying
  - Load by file, drag-drop, and paste
  - Trace, drag a dot, add a dot, remove a dot, undo each, retrace, undo the retrace
  - Toggle the outline, change thickness and colour, check the preview updates
  - Copy and paste the sticker into Discord or Google Docs, and download it
  - Try a very small trace (panda should complain) and a non-image file

---

## 8. Interview talking points

- **"Walk me through how the cutout works."**
  - Points stored in image coordinates → bounding-box crop → clip path → draw image → export PNG with transparency
- **"How did you keep it full resolution?"**
  - Separate image vs screen coordinate systems, with a single `view` transform between them
- **"How do you handle a freehand path with hundreds of points?"**
  - Ramer–Douglas–Peucker simplification with a zoom-aware epsilon, written iteratively to avoid stack overflow, and unit tested
- **"How does the outline work?"**
  - Stroke at twice the width because strokes are centred on the path, round joins for a die-cut look
- **Performance**
  - Dirty-flag render loop, debounced PNG generation, token check against out-of-order async results
- **Memory**
  - Revoking object URLs, capped undo history
- **Privacy**
  - Fully client-side, so no server costs and no user images stored anywhere
- **Trade-off you could mention**
  - Chose vanilla JS over React because the core is canvas work, and the surrounding UI is small enough that a framework would add more complexity than it removes

---

## 9. Ideas for later

- Zoom and pan on the canvas for precise tracing on big images
- Magnetic lasso / edge snapping (snap the trace to strong edges in the image)
- Automatic background removal (an in-browser segmentation model)
- Feathered (soft) edges as an option
- Multiple stickers from one image, or a sticker sheet export
- Touch support for phones and tablets
- Keyboard shortcut for copy (Ctrl + C when a sticker exists)
