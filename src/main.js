// Wires the page together: loading images, buttons, the sticker preview, and the panda.

import './style.css';
import { createEditor } from './editor.js';
import { createPanda } from './panda.js';
import { buildSticker, canvasToBlob, copyBlob, downloadBlob } from './sticker.js';

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  canvas: $('stageCanvas'),
  dropzone: $('dropzone'),
  dragOver: $('dragOver'),
  fileInput: $('fileInput'),
  pickBtn: $('pickBtn'),
  newBtn: $('newBtn'),
  undoBtn: $('undoBtn'),
  retraceBtn: $('retraceBtn'),
  closeBtn: $('closeBtn'),
  zoomInBtn: $('zoomInBtn'),
  zoomOutBtn: $('zoomOutBtn'),
  fitBtn: $('fitBtn'),
  zoomLabel: $('zoomLabel'),
  status: $('status'),
  previewImg: $('previewImg'),
  previewEmpty: $('previewEmpty'),
  sizeLabel: $('sizeLabel'),
  copyBtn: $('copyBtn'),
  downloadBtn: $('downloadBtn'),
  outlineToggle: $('outlineToggle'),
  outlineOpts: $('outlineOpts'),
  outlineWidth: $('outlineWidth'),
  outlineWidthNum: $('outlineWidthNum'),
};

const HINTS = {
  empty: 'hi! drop a pic~',
  ready: 'hold & drag around the part you want~',
  tracing: 'keep tracing, or hit close sticker!',
  drawing: 'drawing...',
  editing: 'drag dots to tweak, then copy!',
};

const STATUS = {
  empty: '',
  ready: 'TRACE',
  tracing: 'TRACING',
  editing: 'EDIT',
};

const panda = createPanda($('panda'), $('bubble'));

const outline = { on: false, width: 12, color: '#ffffff' };
let imageName = 'image';
let imageUrl = null; // object URL of the loaded image, freed when a new one loads
let sticker = null; // { blob, url }
let previewToken = 0; // stops an older, slower preview from replacing a newer one
let previewTimer = null;

// ---------- editor ----------

const editor = createEditor(els.canvas, {
  onMode(mode) {
    els.status.textContent = STATUS[mode];
    els.dropzone.hidden = mode !== 'empty';
    // While the mouse is down, onDrawing handles the bubble instead.
    if (!(mode === 'tracing' && editor.drawing)) panda.say(HINTS[mode]);
  },
  onDrawing(drawing) {
    panda.say(drawing ? HINTS.drawing : HINTS.tracing);
  },
  onShape() {
    schedulePreview();
  },
  onState({ canUndo, canClose, canRetrace }) {
    els.undoBtn.disabled = !canUndo;
    els.closeBtn.disabled = !canClose;
    els.retraceBtn.disabled = !canRetrace;
  },
  onNotice(text) {
    notice(text);
  },
  onZoom(percent) {
    els.zoomLabel.textContent = `${percent}%`;
    els.zoomInBtn.disabled = false;
    els.zoomOutBtn.disabled = false;
    els.fitBtn.disabled = false;
  },
});

function notice(text, mood = 'normal') {
  panda.say(text, { mood, ms: 2200, fallback: HINTS[editor.mode] });
}

// ---------- loading images ----------

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    notice("hmm, that's not an image");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      notice("can't read that one :(");
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = url;
    imageName = file.name.replace(/\.[^.]+$/, '') || 'image';
    editor.loadImage(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    notice("can't open that file :(");
  };
  img.src = url;
}

els.pickBtn.addEventListener('click', () => els.fileInput.click());
els.newBtn.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  loadFile(els.fileInput.files[0]);
  els.fileInput.value = ''; // so picking the same file again still fires "change"
});

// Drag and drop. dragenter/dragleave also fire for child elements, so count them.
let dragDepth = 0;
els.stage.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  els.dragOver.hidden = false;
});
els.stage.addEventListener('dragover', (e) => e.preventDefault()); // required, or "drop" never fires
els.stage.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.dragOver.hidden = true;
});
els.stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dragOver.hidden = true;
  loadFile(e.dataTransfer.files[0]);
});

// Paste an image from the clipboard (e.g. a screenshot).
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  const file = item.getAsFile();
  if (file) loadFile(new File([file], 'pasted.png', { type: file.type }));
});

// ---------- toolbar ----------

els.undoBtn.addEventListener('click', () => editor.undo());
els.retraceBtn.addEventListener('click', () => editor.retrace());
els.closeBtn.addEventListener('click', () => editor.close());
els.zoomInBtn.addEventListener('click', () => editor.zoomIn());
els.zoomOutBtn.addEventListener('click', () => editor.zoomOut());
els.fitBtn.addEventListener('click', () => editor.fit());

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    editor.undo();
    return;
  }
  // Enter / Esc only mean something while a trace is open (and the mouse isn't down).
  if (editor.mode !== 'tracing' || editor.drawing || mod || e.altKey) return;
  if (e.key === 'Enter') {
    // preventDefault stops a focused button from also being "clicked" by Enter.
    e.preventDefault();
    editor.close();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    editor.retrace();
  }
});

// ---------- outline controls ----------

function setOutlineUI() {
  els.outlineOpts.classList.toggle('off', !outline.on);
  els.outlineWidthNum.textContent = outline.width;
}

els.outlineToggle.addEventListener('change', () => {
  outline.on = els.outlineToggle.checked;
  setOutlineUI();
  schedulePreview();
});
els.outlineWidth.addEventListener('input', () => {
  outline.width = Number(els.outlineWidth.value);
  setOutlineUI();
  schedulePreview();
});
document.querySelectorAll('input[name="outlineColor"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    outline.color = radio.value;
    schedulePreview();
  });
});
setOutlineUI();

// ---------- trace line colour (remembered between visits) ----------

const TRACE_KEY = 'snip-snip:traceColor';
const traceRadios = [...document.querySelectorAll('input[name="traceColor"]')];
const traceColors = traceRadios.map((r) => r.value);

// localStorage can throw (e.g. storage blocked in some private windows), so never let it break the page.
function loadTraceColor() {
  try {
    const saved = localStorage.getItem(TRACE_KEY);
    if (traceColors.includes(saved)) return saved; // ignore anything that isn't one of our colours
  } catch {
    // fall through to the default
  }
  return traceColors[0];
}

function saveTraceColor(color) {
  try {
    localStorage.setItem(TRACE_KEY, color);
  } catch {
    // not saved this time; the colour still works for this visit
  }
}

const startColor = loadTraceColor();
traceRadios.forEach((radio) => {
  radio.checked = radio.value === startColor;
  radio.addEventListener('change', () => {
    editor.setTraceColor(radio.value);
    saveTraceColor(radio.value);
  });
});
editor.setTraceColor(startColor);

// ---------- sticker preview ----------

// Building a full-resolution PNG takes a moment, so wait until changes pause.
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 120);
}

async function updatePreview() {
  const token = ++previewToken;

  if (editor.mode !== 'editing') {
    setSticker(null);
    return;
  }

  const canvas = buildSticker(editor.image, editor.points, outline);
  const blob = await canvasToBlob(canvas);
  if (token !== previewToken) return; // a newer preview started while this one was encoding

  setSticker({ blob, url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height });
}

function setSticker(next) {
  if (sticker) URL.revokeObjectURL(sticker.url);
  sticker = next;

  const has = Boolean(sticker);
  els.previewImg.hidden = !has;
  els.previewEmpty.hidden = has;
  els.copyBtn.disabled = !has;
  els.downloadBtn.disabled = !has;
  els.sizeLabel.textContent = has ? `${sticker.w}×${sticker.h}` : '';
  if (has) els.previewImg.src = sticker.url;
  else els.previewImg.removeAttribute('src');
}

// ---------- copy / download ----------

els.copyBtn.addEventListener('click', async () => {
  if (!sticker) return;
  try {
    await copyBlob(sticker.blob);
    notice('copied! paste it anywhere', 'happy');
  } catch (err) {
    console.error(err);
    notice("couldn't copy... try download!");
  }
});

els.downloadBtn.addEventListener('click', () => {
  if (!sticker) return;
  downloadBlob(sticker.blob, `${imageName}-snip.png`);
  notice('snip! saved', 'happy');
});
