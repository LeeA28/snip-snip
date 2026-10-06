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
- Zoom and pan (for fine cuts)
  - Scroll the mouse wheel to zoom toward the cursor
  - Toolbar `−` / `+` zoom toward the middle of the view, the label shows the zoom %, and `fit` shows the whole image again
  - Hold space and drag to move around
  - Zoom range: the fitted size up to 800%
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
- **Mascot:** a pixel panda that gives hints and reacts
  - Original art in a chunky black-outline style (inspired by reference pictures, not copied from them)
  - Loops through sleeping (breathing + floating z's), sitting (blinks), and eating bamboo (chews), about 8 seconds each
  - Copy or download → happy pose with arms up and a hop for about 2 seconds, then back to sitting
  - Bamboo is soft sage green, the second small accent colour after the blush
- **Hosting:** GitHub repo + Vercel, same as Encore
- **Trace colour:** user's choice in a TRACE LINE panel (under OUTLINE), default pure red `255,0,0`
  - Options: red `#ff0000`, lime `#00ff00`, cyan `#00ffff`, magenta `#ff00ff`, yellow `#ffff00`
  - Deliberately *not* matched to the gray UI: these are tools for seeing what you're cutting, so maximum contrast wins
  - Used while drawing and for the finished border, always over a thin white edge. Dots stay white/black
  - Remembered between visits with `localStorage`
- **Zoom:** scroll wheel toward the cursor + `−` / `+` / `fit` buttons, from fit size up to 800%
- **Pan:** hold space + drag (same as Photoshop and Figma). Blocked mid-trace, but scroll-zoom still works mid-trace
- **Sleeping panda:** eye patches are solid black. Blinking while awake keeps the white closed-eye line

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
    ├── panda.js          draws the panda and runs its pose loop (state machine)
    ├── pandaArt.js       the panda's pixel art + frame building (no DOM, testable)
    ├── style.css         the 8-bit theme
    ├── geometry.test.js  unit tests for geometry.js
    └── pandaArt.test.js  unit tests for the panda frames
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
- **Trace line (while drawing)**: a 4px white line with a 2px line in the chosen trace colour on top
  - The white edge keeps it visible even when the image is the same colour as the line
- **Marching ants (finished shape)**: a 3px white line, then a dashed line in the trace colour on top whose `lineDashOffset` changes every 90 ms, which makes the dashes crawl
- **Dots** stay white squares with dark edges (dark when hovered), so they stand out from the red line
- **Redraw loop**: `requestAnimationFrame` runs every frame, but only actually draws when a `dirty` flag is set. This keeps CPU use low while nothing is changing

### 5.7b Zoom and pan

- **Everything zoom-related is just the `view` object** (`scale`, `ox`, `oy`) from 5.1
  - Points are stored in image coordinates, so zooming never changes the shape. Only how it's drawn and how mouse positions are converted
  - Dots and lines are drawn in screen pixels, so they stay the same size at every zoom
- **What the % means**
  - `scale` = screen pixels per image pixel, so the label is `scale × 100`
  - 100% → one image pixel per screen pixel. 800% → each image pixel is an 8 × 8 block
  - The minimum is the "fit" scale, which is often small for big photos (e.g. 14% for a 1773 × 3839 phone screenshot)
- **Zooming toward the cursor (`zoomAt` in `geometry.js`)**
  - Goal: the image pixel under the mouse should still be under the mouse after zooming
  - The image pixel under screen point `a` is `(a − ox) / scale`
  - After multiplying the scale by `k`, that pixel's distance from the image corner on screen grows by `k`, so the corner must move: `ox' = a − (a − ox) × k`
  - Worked example: `scale = 0.5`, `ox = 100`, mouse at `x = 300`, zoom ×2
    - Pixel under the mouse before: (300 − 100) / 0.5 = 200 / 0.5 = **400**
    - New scale: 0.5 × 2 = 1, so k = 1 / 0.5 = 2
    - New offset: ox' = 300 − (300 − 100) × 2 = 300 − 400 = **−100**
    - Pixel under the mouse after: (300 − (−100)) / 1 = 400 / 1 = **400** ✓ same pixel
  - The scale is clamped to [fit, 800%] first, and `k` uses the scale *after* clamping, so hitting the limit doesn't make the image jump
- **Why the wheel uses `Math.exp`**
  - Mice send one big event (`deltaY` ≈ 100 per notch), trackpads send lots of small ones
  - Factor = e^(−deltaY × 0.0015)
    - One mouse notch: e^(−100 × 0.0015) = e^(−0.15) ≈ **0.86** (zoom out 14%)
    - Ten trackpad events of 10: (e^(−0.015))¹⁰ = e^(−0.15) ≈ **0.86**, exactly the same
  - Because e^a × e^b = e^(a+b), the total zoom only depends on the total scroll, not how it was split into events
  - `passive: false` on the wheel listener is required, or the browser won't let `preventDefault()` stop the page scrolling
- **Panning (hold space + drag)**
  - `keydown` Space sets `spaceDown`, `keyup` clears it, and the cursor becomes a hand
  - On drag: `ox = startOx + (mouseX − startMouseX)`, same for `oy`
  - `preventDefault()` on both keydown and keyup, because a focused button "clicks" when space is released, and the page would otherwise scroll
  - On window `blur` (e.g. alt-tab), pan mode resets, since the keyup would never arrive
  - Panning is blocked while tracing (the mouse is busy drawing), but scroll-zoom works mid-trace because points are in image coordinates
- **Keeping the image on screen (`clampPan`)**
  - At least 60 screen px of the image always stays visible
  - `ox` must stay between `60 − imageWidthOnScreen` (right edge can't pass the left side) and `viewWidth − 60` (left edge can't pass the right side)
- **Sharp pixels when zoomed in**
  - `imageSmoothingEnabled = scale < 1`
  - Below 100%, smoothing averages pixels so the shrunk image looks clean
  - Above 100%, smoothing would blur the edges you're trying to follow, so each pixel is drawn as a crisp square instead
- **Window resizing**
  - If you're still at the fitted view, the image re-fits to the new size. If you've zoomed or panned, your view is kept (just clamped)

### 5.7c Trace line colour and `localStorage`

- The editor keeps `traceColor` in its state, and `setTraceColor()` changes it and sets the `dirty` flag, so the next frame redraws in the new colour (even mid-trace)
- **`localStorage`** is a small key-value store the browser keeps for each website
  - `localStorage.setItem('snip-snip:traceColor', '#00ffff')` saves, `getItem(...)` reads it back on the next visit
  - Values are always strings, and it's per browser and per site, so it never leaves the user's computer
  - The key is prefixed with `snip-snip:` so it can't clash with anything else on the same domain (e.g. if Vercel previews share one)
- **Why the `try/catch`**
  - Some browsers throw an error on `localStorage` when storage is blocked (strict privacy settings, some private windows)
  - Without the `try/catch`, that error would stop the rest of `main.js` from running, and the whole app would break over a colour preference
  - With it, the colour still works for the visit, it just isn't saved
- **Why the saved value is checked against the list**
  - Anything in `localStorage` could be old or edited by hand. Only one of the five known colours is accepted, otherwise it falls back to red

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

- **Two files, two jobs**
  - `pandaArt.js` only builds frames: "given a pose and a time, which pixel is which colour?" It never touches the page, so it can be unit tested
  - `panda.js` paints those frames on a canvas and decides which pose to show
- **Pixel art as text grids**
  - Each character is one pixel: `k` black, `w` white, `p` blush, `g`/`G` bamboo, `.` see-through
  - The face is symmetric, so only the left half is written and `sym()` mirrors it
    - Example: `sym('.kw')` → `'.kw' + 'wk.'` = `'.kwwk.'`
    - This halves the typing and guarantees both eyes match
  - The head is built from pieces (top, eyes, mouth, bottom), so moods just swap pieces
    - Eyes: `open`, `closed` (blink: a white line through the patch), `asleep` (solid black patches), `happy` (^ ^)
    - Mouth: `shut` or `open` (for chewing)
- **Composing a frame**
  - Start with an empty 34 × 28 grid of `.`
  - `place(buffer, sprite, x, y)` stamps a part on top. `.` in the part is skipped, so earlier layers show through
  - Order matters, like layers in a drawing app: body first, then head, then bamboo and paw in front
- **Animation is just "what time is it?"**
  - `composePose(pose, t)` gets `t` = milliseconds since the pose started, and works out the frame from that
  - **Breathing** (sleep): every 2.4 s cycle, the first 1.2 s uses a back that's one row taller
    - `stretch()` repeats one middle row, so the back rises by exactly 1 pixel
  - **z's** (sleep): three letters, each born 0.8 s after the last, each living 2.4 s
    - Life progress `k` goes 0 → 1, and the letter moves up 8 px and right 8 px over its life
    - Fade: `k` from 0 to 0.15 → fading in, 0.15 to 0.7 → solid, 0.7 to 1 → fading out
      - Example at `k = 0.85`: opacity = (1 − 0.85) / 0.3 = 0.15 / 0.3 = **0.5**
    - Opacity is drawn with the canvas's `globalAlpha`
    - `%` (remainder) makes it loop forever: `t = 3000` and `LIFE = 2400` gives `3000 % 2400 = 600`, so it's 600 ms into its second life
  - **Chewing** (eat): one bite every 700 ms
    - First half of a bite: paw lifted 1 px and mouth open. Second half: paw down, mouth shut
    - Bite number = `Math.floor(t / 700)`. Stalk length = `9 − (bite % 4)`, so it goes 9, 8, 7, 6 rows, then a fresh 9-row stalk
      - Example at `t = 2200`: bite = ⌊2200 / 700⌋ = ⌊3.14⌋ = 3, length = 9 − (3 % 4) = 9 − 3 = **6**
  - **Blinking** (sit and eat): `panda.js` picks a random time 2.5–5.5 s ahead, then shows closed eyes for 150 ms
- **The state machine (`panda.js`)**
  - States: `sleep`, `sit`, `eat`, `happy`
  - Every 100 ms a `tick()` runs
    - If the current loop pose has lasted 8 s → move to the next one in `sleep → sit → eat → sleep…`
    - If it's `happy` and its time is up → go to `sit` and continue the loop from there
  - `say(text, { mood: 'happy' })` jumps to `happy` from anywhere (copy and download use this)
  - Why a state machine: each state only needs to know its own exit rules, which keeps the logic small and easy to extend (e.g. adding a "waving" pose is one new state)
- **Accessibility**
  - With `prefers-reduced-motion`, time is frozen at 0: no breathing, chewing, z's, blinking or hopping, and the panda stays sitting (it still shows the happy face on copy/download)

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

- `npm test` runs 22 tests across two files
  - `distToSegment`: middle of a segment, past the end, zero-length segment
  - `simplify`: straight line → 2 points, L-shape keeps its corner, epsilon controls detail, short input is copied not reused, 20,000-point circle doesn't overflow
  - `polygonArea`: square in both directions, triangle
  - `bounds` and `clamp`
  - `zoomAt`: the pixel under the mouse stays put, clamping only moves by the zoom that actually happened
  - `clampPan`: the image can't leave the view, a fine view is left alone
  - `pandaArt`: sleeping eyes are solid black, every pose and time gives a full 34 × 28 grid of known colours, blinking changes the face, breathing makes the back taller, z's only appear while sleeping with opacity between 0 and 1, the bamboo shrinks per bite and resets
- Manual checklist before deploying
  - Load by file, drag-drop, and paste
  - Trace, drag a dot, add a dot, remove a dot, undo each, retrace, undo the retrace
  - Toggle the outline, change thickness and colour, check the preview updates
  - Scroll to zoom on a detail, pan with space + drag, trace at high zoom, zoom out mid-trace, press `fit`
  - Focus a button with Tab, then hold space: it should pan, not press the button
  - Switch the trace colour mid-trace and in edit mode, reload, and check the choice is remembered
  - Watch the panda go sleep → sit → eat, and check it cheers on copy/download
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
- **"How does zoom toward the cursor work?"**
  - Solve for the new offset so the image pixel under the cursor is unchanged: `ox' = a − (a − ox) × k`, with an exponential wheel factor so mice and trackpads feel the same
- **Performance**
  - Dirty-flag render loop, debounced PNG generation, token check against out-of-order async results
- **Memory**
  - Revoking object URLs, capped undo history
- **Robustness**
  - `localStorage` wrapped in `try/catch` with validated values, so a blocked or corrupted setting can't break the app
- **Privacy**
  - Fully client-side, so no server costs and no user images stored anywhere
- **Trade-off you could mention**
  - Chose vanilla JS over React because the core is canvas work, and the surrounding UI is small enough that a framework would add more complexity than it removes

---

## 9. Ideas for later

- A small zoomed-in loupe next to the cursor while tracing
- Magnetic lasso / edge snapping (snap the trace to strong edges in the image)
- Automatic background removal (an in-browser segmentation model)
- Feathered (soft) edges as an option
- Multiple stickers from one image, or a sticker sheet export
- Touch support for phones and tablets
- Keyboard shortcut for copy (Ctrl + C when a sticker exists)
