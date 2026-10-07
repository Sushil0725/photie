import { createDoc, createRasterLayer, createTextLayer, duplicateLayer, imageLayer } from '../engine/document';
import { exportDoc, importPsd, type ExportFormat } from '../engine/export';
import { loadFonts } from '../engine/fonts';
import { layerMatrix } from '../engine/geometry';
import { drawLayerContent } from '../engine/render';
import { docToFile, fileToDoc } from '../engine/serialize';
import { opaqueBounds } from '../engine/selection';
import { addUpload, loadProject, saveProject } from '../engine/storage';
import type { Doc, Fill, Layer } from '../engine/types';
import { canvasToBlob, createCanvas, ctx2d, debounce, downloadBlob, fileToImage, loadImage, uid } from '../engine/util';
import { S, activeLayer, resetHistory, selectedLayers, setS, toast, withBusy } from './editor';
import { addLayer, addLayers, deleteLayers } from './layers';
import { clearSelectionPixels } from './image';
import { fitToScreen } from './view';

export function openDoc(doc: Doc, label = 'Open') {
  resetHistory(doc, label);
  // An opened photo is ready to edit straight away (no need to click it first).
  setS({ screen: 'editor', saveState: 'idle', selectedIds: doc.layers.length === 1 ? [doc.layers[0].id] : [] });
  const fonts = doc.layers.filter((l) => l.type === 'text').map((l) => (l as { font: string }).font);
  if (fonts.length) loadFonts(fonts);
  requestAnimationFrame(() => fitToScreen());
}

export function newDocument(width: number, height: number, name = 'Untitled design', background: Fill | null = { type: 'solid', color: '#ffffff' }) {
  openDoc(createDoc(width, height, name, background), 'New document');
}

const IMAGE_ACCEPT = 'image/*,.psd,.photie,.json';
export { IMAGE_ACCEPT };

const isPsd = (f: File) => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';
const isProject = (f: File) => /\.(photie|json)$/i.test(f.name);
const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

/** Opens a file as a new document (image, PSD or Photie project). */
export async function openFile(file: File) {
  try {
    await withBusy('Opening ' + file.name + '…', async () => {
      if (isProject(file)) {
        const doc = await fileToDoc(file);
        openDoc({ ...doc, id: uid() });
        return;
      }
      if (isPsd(file)) {
        openDoc(await importPsd(file, baseName(file.name)));
        return;
      }
      const img = await fileToImage(file);
      const doc = createDoc(img.naturalWidth, img.naturalHeight, baseName(file.name), null);
      const c = createCanvas(img.naturalWidth, img.naturalHeight);
      ctx2d(c).drawImage(img, 0, 0);
      doc.layers.push(createRasterLayer(c, doc.width / 2, doc.height / 2, 'Background'));
      openDoc(doc);
      storeUpload(file, img).catch(() => {});
    });
  } catch (e) {
    toast('Could not open file: ' + (e as Error).message, 'error', 4000);
  }
}

async function storeUpload(blob: Blob, img: HTMLImageElement, name = 'Upload') {
  await addUpload({ id: uid(), name: (blob as File).name || name, blob, width: img.naturalWidth, height: img.naturalHeight, createdAt: Date.now() });
  window.dispatchEvent(new Event('photie:uploads'));
}

/** Places images into the current document as new layers. */
export async function placeImageFiles(files: File[], at?: { x: number; y: number }) {
  const doc = S().doc;
  if (!doc) {
    if (files[0]) return openFile(files[0]);
    return;
  }
  const layers: Layer[] = [];
  for (const f of files) {
    if (!f.type.startsWith('image/') && !isPsd(f)) {
      if (isProject(f)) {
        openFile(f);
        return;
      }
      continue;
    }
    try {
      if (isPsd(f)) {
        const psdDoc = await importPsd(f, baseName(f.name));
        layers.push(...psdDoc.layers);
        continue;
      }
      const img = await fileToImage(f);
      const l = imageLayer(doc, img, baseName(f.name));
      if (at) {
        l.x = at.x;
        l.y = at.y;
      }
      layers.push(l);
      storeUpload(f, img).catch(() => {});
    } catch {
      toast('Could not read ' + f.name, 'error');
    }
  }
  if (layers.length) addLayers(layers, layers.length > 1 ? 'Place images' : 'Place image');
}

/** Adds an image from a URL (stock photos, uploads). */
export async function placeImageUrl(url: string, name: string, opts: { at?: { x: number; y: number }; fill?: boolean; fallbackUrl?: string } = {}) {
  const doc = S().doc;
  if (!doc) return;
  try {
    await withBusy('Adding image…', async () => {
      let img: HTMLImageElement;
      try {
        img = await loadImage(url);
      } catch (e) {
        if (!opts.fallbackUrl) throw e;
        img = await loadImage(opts.fallbackUrl);
      }
      const l = imageLayer(doc, img, name, 0.8, opts.fill);
      if (opts.at) {
        l.x = opts.at.x;
        l.y = opts.at.y;
      }
      if (opts.fill) {
        addLayer(l, 'Add background image', 0);
      } else addLayer(l, 'Add image');
    });
  } catch {
    toast('Could not load that image (it may block editing).', 'error', 4000);
  }
}

/* ---------------------------------- Saving --------------------------------- */

let saving = false;
export async function saveNow() {
  const doc = S().doc;
  if (!doc || saving) return;
  saving = true;
  setS({ saveState: 'saving' });
  try {
    await saveProject(doc);
    if (S().doc?.id === doc.id) setS({ saveState: S().doc === doc ? 'saved' : 'unsaved' });
  } catch (e) {
    console.error(e);
    setS({ saveState: 'unsaved' });
    toast('Autosave failed (storage may be full)', 'error');
  } finally {
    saving = false;
    // Changes made while saving get their own save.
    if (S().saveState === 'unsaved') autoSave();
  }
}

const autoSave = debounce(() => {
  if (S().saveState === 'unsaved') saveNow();
}, 1500);

/** Starts autosaving to IndexedDB whenever the document changes. */
export function startAutosave() {
  let lastDoc: Doc | null = null;
  return (s: { doc: Doc | null; saveState: string }) => {
    if (s.doc && s.doc !== lastDoc && s.saveState === 'unsaved') autoSave();
    lastDoc = s.doc;
  };
}

export async function openSavedProject(id: string) {
  try {
    await withBusy('Opening design…', async () => {
      const doc = await loadProject(id);
      if (!doc) throw new Error('Design not found');
      openDoc(doc);
      setS({ saveState: 'saved' });
    });
  } catch (e) {
    toast('Could not open design: ' + (e as Error).message, 'error');
  }
}

export async function goHome() {
  if (S().saveState === 'unsaved') await saveNow();
  setS({ screen: 'home', doc: null, past: [], future: [], selection: null, selectedIds: [], preview: null, editingTextId: null });
}

export async function downloadProject() {
  const doc = S().doc;
  if (!doc) return;
  await withBusy('Packing project…', async () => {
    downloadBlob(await docToFile(doc), `${doc.name || 'design'}.photie`);
  });
}

export async function exportCurrent(format: ExportFormat, opts: { scale: number; quality: number; transparent: boolean }) {
  const doc = S().doc;
  if (!doc) return;
  try {
    await withBusy('Exporting…', async () => {
      const blob = await exportDoc(doc, format, opts);
      const ext = format === 'jpeg' ? 'jpg' : format;
      downloadBlob(blob, `${doc.name || 'design'}.${ext}`);
    });
    toast('Downloaded!', 'success');
  } catch (e) {
    toast('Export failed: ' + (e as Error).message, 'error', 5000);
  }
}

/* -------------------------------- Clipboard -------------------------------- */

/** Pixels of the active layer inside the selection, in document space. */
function selectionPixels(): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const s = S();
  const sel = s.selection;
  const l = activeLayer();
  if (!sel || !l || !s.doc) return null;
  const full = createCanvas(s.doc.width, s.doc.height);
  const ctx = ctx2d(full);
  ctx.setTransform(layerMatrix(l));
  drawLayerContent(ctx, l);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(sel.mask, 0, 0);
  const b = opaqueBounds(full, 0);
  if (!b) return null;
  const out = createCanvas(b.w, b.h);
  ctx2d(out).drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return { canvas: out, x: b.x, y: b.y };
}

async function writeSystemClipboard(c: HTMLCanvasElement) {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return;
    const blob = await canvasToBlob(c);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    /* system clipboard is optional */
  }
}

export function copy() {
  const px = selectionPixels();
  if (px) {
    setS({ clipboard: px });
    clipboardStale = false;
    writeSystemClipboard(px.canvas);
    toast('Copied selection');
    return;
  }
  const layers = selectedLayers();
  if (layers.length) {
    setS({ clipboard: { layers } });
    clipboardStale = false;
    toast(layers.length > 1 ? `Copied ${layers.length} layers` : 'Copied layer');
  }
}

export function cut() {
  const px = selectionPixels();
  if (px) {
    setS({ clipboard: px });
    clipboardStale = false;
    writeSystemClipboard(px.canvas);
    clearSelectionPixels();
    return;
  }
  const layers = selectedLayers();
  if (layers.length) {
    setS({ clipboard: { layers } });
    clipboardStale = false;
    deleteLayers();
  }
}

export function pasteInternal() {
  const clip = S().clipboard;
  const doc = S().doc;
  if (!clip || !doc) return false;
  if ('layers' in clip) {
    const copies = clip.layers.map((l) => {
      const d = duplicateLayer(l, 20);
      d.name = l.name;
      return d;
    });
    addLayers(copies, 'Paste');
  } else {
    const l = createRasterLayer(clip.canvas, clip.x + clip.canvas.width / 2, clip.y + clip.canvas.height / 2, 'Pasted');
    addLayer(l, 'Paste');
  }
  return true;
}

let clipboardStale = false;
/** Called when the window loses focus: the user may copy something elsewhere. */
export const markClipboardStale = () => {
  clipboardStale = true;
};

/** Handles a native paste event: OS images become layers, otherwise the internal clipboard is used. */
export function handlePasteEvent(e: ClipboardEvent) {
  const s = S();
  if (s.screen !== 'editor' || !s.doc) return;
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
  const text = e.clipboardData?.getData('text/plain');
  e.preventDefault();
  if (files.length && (clipboardStale || !s.clipboard)) {
    placeImageFiles(files);
    return;
  }
  if (s.clipboard && pasteInternal()) return;
  if (files.length) {
    placeImageFiles(files);
    return;
  }
  if (text) {
    addLayer(createTextLayer(S().doc!, { text: text.slice(0, 2000) }), 'Paste text');
  }
}
