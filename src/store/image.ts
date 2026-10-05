import { floodMask, maskToCanvas } from '../engine/flood';
import { layerMatrix, layerSize, toLocal, type Pt } from '../engine/geometry';
import { inpaint } from '../engine/inpaint';
import { renderDocToCanvas } from '../engine/render';
import {
  borderMask,
  combineMasks,
  featherMask,
  growMask,
  invertMask,
  layerAlphaMask,
  maskInLayerSpace,
  opaqueBounds,
  selectAllMask,
  selectionFromMask,
} from '../engine/selection';
import { drawLayerContent } from '../engine/render';
import type { Doc, Layer, RasterLayer, Rect, SelectionMode } from '../engine/types';
import { cloneCanvas, createCanvas, ctx2d } from '../engine/util';
import { S, activeLayer, commit, setS, toast, withBusy } from './editor';
import { ensureRasterActive } from './layers';

const docOf = (): Doc => S().doc!;

/* -------------------------------- Selection -------------------------------- */

export function setSelectionMask(mask: HTMLCanvasElement | null, label: string) {
  const sel = mask ? selectionFromMask(mask) : null;
  commit(label, docOf(), { selection: sel });
}

/** Applies a new selection shape using the selection mode (new/add/subtract/intersect). */
export function applySelection(newMask: HTMLCanvasElement, mode: SelectionMode, feather = 0, label = 'Selection') {
  const m = feather > 0 ? featherMask(newMask, feather) : newMask;
  const prev = S().selection;
  const combined = combineMasks(prev ? prev.mask : null, m, mode);
  setSelectionMask(combined, label);
}

export function selectAll() {
  const d = docOf();
  setSelectionMask(selectAllMask(d.width, d.height), 'Select all');
}

export function deselect() {
  if (S().selection) commit('Deselect', docOf(), { selection: null });
}

export function invertSelection() {
  const d = docOf();
  const sel = S().selection;
  setSelectionMask(sel ? invertMask(sel.mask) : selectAllMask(d.width, d.height), 'Inverse selection');
}

export function modifySelection(kind: 'feather' | 'grow' | 'shrink' | 'border', px: number) {
  const sel = S().selection;
  if (!sel) return toast('Make a selection first', 'error');
  withBusy('Updating selection…', () => {
    let m: HTMLCanvasElement;
    if (kind === 'feather') m = featherMask(sel.mask, px);
    else if (kind === 'grow') m = growMask(sel.mask, px);
    else if (kind === 'shrink') m = growMask(sel.mask, -px);
    else m = borderMask(sel.mask, px);
    setSelectionMask(m, kind[0].toUpperCase() + kind.slice(1) + ' selection');
  });
}

export function selectLayerPixels(l: Layer | undefined = activeLayer()) {
  if (!l) return;
  const d = docOf();
  setSelectionMask(layerAlphaMask(l, d.width, d.height, drawLayerContent), 'Select layer pixels');
}

/** Magic wand / color range selection. */
export function magicWand(p: Pt, mode: SelectionMode, tolerance: number, contiguous: boolean, sampleAll: boolean) {
  const d = docOf();
  let mask: HTMLCanvasElement;
  if (sampleAll || !activeLayer()) {
    const comp = renderDocToCanvas(d, 1, true);
    const img = ctx2d(comp, true).getImageData(0, 0, comp.width, comp.height);
    mask = maskToCanvas(floodMask(img, p.x, p.y, tolerance, contiguous), d.width, d.height, true);
  } else {
    const l = activeLayer()!;
    const raster = l.type === 'raster' ? l.canvas : null;
    let src: HTMLCanvasElement;
    let toDoc: DOMMatrix;
    if (raster) {
      src = raster;
      toDoc = layerMatrix(l);
    } else {
      const { w, h } = layerSize(l);
      src = createCanvas(w, h);
      drawLayerContent(ctx2d(src), l);
      toDoc = layerMatrix(l);
    }
    const lp = toLocal(l, p);
    const img = ctx2d(src, true).getImageData(0, 0, src.width, src.height);
    const local = maskToCanvas(floodMask(img, lp.x, lp.y, tolerance, contiguous), src.width, src.height, true);
    mask = createCanvas(d.width, d.height);
    const mctx = ctx2d(mask);
    mctx.setTransform(toDoc);
    mctx.drawImage(local, 0, 0);
  }
  applySelection(mask, mode, S().opts.feather, 'Magic wand');
}

/* ------------------------------ Pixel targets ------------------------------ */

interface PixelTarget {
  layer: RasterLayer | Layer;
  canvas: HTMLCanvasElement;
  isMask: boolean;
}

export function pixelTarget(): PixelTarget | null {
  const s = S();
  const l = activeLayer();
  if (s.editMask && l?.mask) return { layer: l, canvas: l.mask, isMask: true };
  const r = ensureRasterActive();
  if (!r) return null;
  return { layer: r, canvas: r.canvas, isMask: false };
}

function selMaskFor(t: PixelTarget): HTMLCanvasElement | null {
  const sel = S().selection;
  if (!sel) return null;
  return maskInLayerSpace(sel.mask, t.layer, t.canvas.width, t.canvas.height);
}

/** out = src outside the mask, edited inside the mask. */
function blendByMask(src: HTMLCanvasElement, edited: HTMLCanvasElement, mask: HTMLCanvasElement): HTMLCanvasElement {
  const a = cloneCanvas(src);
  const actx = ctx2d(a);
  actx.globalCompositeOperation = 'destination-out';
  actx.drawImage(mask, 0, 0);
  const b = cloneCanvas(edited);
  const bctx = ctx2d(b);
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(mask, 0, 0);
  actx.globalCompositeOperation = 'lighter';
  actx.drawImage(b, 0, 0);
  return a;
}

function withTargetCanvas(t: PixelTarget, canvas: HTMLCanvasElement): Layer {
  return t.isMask ? ({ ...t.layer, mask: canvas } as Layer) : ({ ...t.layer, canvas } as Layer);
}

function computePixelOp(t: PixelTarget, fn: (img: ImageData) => void): HTMLCanvasElement {
  const out = cloneCanvas(t.canvas);
  const ctx = ctx2d(out, true);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  fn(img);
  ctx.putImageData(img, 0, 0);
  const m = selMaskFor(t);
  return m ? blendByMask(t.canvas, out, m) : out;
}

/** Applies a destructive pixel operation to the active layer (respecting the selection). */
export async function applyPixelOp(label: string, fn: (img: ImageData) => void) {
  const t = pixelTarget();
  if (!t) return;
  await withBusy(label + '…', () => {
    const out = computePixelOp(t, fn);
    const doc = docOf();
    commit(label, { ...doc, layers: doc.layers.map((l) => (l.id === t.layer.id ? withTargetCanvas(t, out) : l)) }, { preview: null });
  });
}

/** Live preview of a pixel operation (shown on canvas, not recorded). */
export function previewPixelOp(fn: (img: ImageData) => void) {
  const l = activeLayer();
  if (!l) return;
  const s = S();
  const t: PixelTarget | null =
    s.editMask && l.mask ? { layer: l, canvas: l.mask, isMask: true } : l.type === 'raster' ? { layer: l, canvas: l.canvas, isMask: false } : null;
  if (!t) return;
  setS({ preview: withTargetCanvas(t, computePixelOp(t, fn)) });
}

export function commitPreview(label: string) {
  const p = S().preview;
  if (!p) return;
  const doc = docOf();
  commit(label, { ...doc, layers: doc.layers.map((l) => (l.id === p.id ? p : l)) }, { preview: null });
}

export const cancelPreview = () => setS({ preview: null });

/** Edits the target canvas with a 2D context callback (used by fill/gradient tools). */
export function applyCanvasOp(label: string, fn: (ctx: CanvasRenderingContext2D, t: { layer: Layer; canvas: HTMLCanvasElement; isMask: boolean }) => void) {
  const t = pixelTarget();
  if (!t) return;
  const out = cloneCanvas(t.canvas);
  fn(ctx2d(out), t);
  const m = selMaskFor(t);
  const final = m ? blendByMask(t.canvas, out, m) : out;
  const doc = docOf();
  commit(label, { ...doc, layers: doc.layers.map((l) => (l.id === t.layer.id ? withTargetCanvas(t, final) : l)) });
}

export function clearSelectionPixels() {
  const sel = S().selection;
  if (!sel) return;
  const t = pixelTarget();
  if (!t) return;
  const m = selMaskFor(t)!;
  const out = cloneCanvas(t.canvas);
  const ctx = ctx2d(out);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(m, 0, 0);
  const doc = docOf();
  commit('Clear', { ...doc, layers: doc.layers.map((l) => (l.id === t.layer.id ? withTargetCanvas(t, out) : l)) });
}

export function fillSelection(color: string) {
  const t = pixelTarget();
  if (!t) return;
  applyCanvasOp('Fill', (ctx) => {
    ctx.fillStyle = t.isMask ? '#000' : color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  });
}

export async function contentAwareFill() {
  const sel = S().selection;
  if (!sel) return toast('Select the area to remove first', 'error');
  const t = pixelTarget();
  if (!t || t.isMask) return;
  await withBusy('Content-aware fill…', () => {
    const m = selMaskFor(t)!;
    const b = opaqueBounds(m, 20);
    if (!b) return;
    const pad = Math.max(30, Math.round(Math.max(b.w, b.h) * 0.75));
    const x = Math.max(0, b.x - pad),
      y = Math.max(0, b.y - pad);
    const w = Math.min(t.canvas.width, b.x + b.w + pad) - x,
      h = Math.min(t.canvas.height, b.y + b.h + pad) - y;
    const out = cloneCanvas(t.canvas);
    const ctx = ctx2d(out, true);
    const img = ctx.getImageData(x, y, w, h);
    const md = ctx2d(m, true).getImageData(x, y, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3] > 20 ? 1 : 0;
    const area = Math.max(b.w, b.h);
    inpaint(img, mask, area > 200 ? 6 : area > 60 ? 5 : 4);
    ctx.putImageData(img, x, y);
    const doc = docOf();
    commit('Content-aware fill', { ...doc, layers: doc.layers.map((l) => (l.id === t.layer.id ? withTargetCanvas(t, out) : l)) }, { selection: null });
  });
}

/* ------------------------------- Image / doc ------------------------------- */

function resample(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur = src;
  // Step down by halves for high-quality large reductions.
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const half = createCanvas(cur.width / 2, cur.height / 2);
    const hctx = ctx2d(half);
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}

export function resizeImage(w: number, h: number) {
  const doc = docOf();
  const kx = w / doc.width,
    ky = h / doc.height;
  const k = Math.sqrt(kx * ky);
  const layers = doc.layers.map((l): Layer => {
    const moved = { ...l, x: l.x * kx, y: l.y * ky } as Layer;
    if (moved.shadow) moved.shadow = { ...moved.shadow, x: moved.shadow.x * kx, y: moved.shadow.y * ky, blur: moved.shadow.blur * k };
    if (moved.type === 'raster') {
      const c = moved.canvas;
      const nc = resample(c, c.width * kx, c.height * ky);
      return { ...moved, canvas: nc, mask: moved.mask ? resample(moved.mask, nc.width, nc.height) : null };
    }
    if (moved.type === 'text') return { ...moved, size: moved.size * k, width: moved.width * kx, letterSpacing: moved.letterSpacing * k };
    return { ...moved, w: moved.w * kx, h: moved.h * ky, strokeWidth: moved.strokeWidth * k, radius: moved.radius * k };
  });
  commit('Image size', { ...doc, width: Math.round(w), height: Math.round(h), layers }, { selection: null });
}

/** Changes canvas size. Anchor is 0..1 on each axis (0 = left/top). */
export function resizeCanvas(w: number, h: number, ax = 0.5, ay = 0.5) {
  const doc = docOf();
  const dx = (w - doc.width) * ax,
    dy = (h - doc.height) * ay;
  const layers = doc.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }) as Layer);
  commit('Canvas size', { ...doc, width: Math.round(w), height: Math.round(h), layers }, { selection: null });
}

export function rotateCanvas(deg: 90 | -90 | 180) {
  const doc = docOf();
  const W = doc.width,
    H = doc.height;
  const swap = deg !== 180;
  const nw = swap ? H : W,
    nh = swap ? W : H;
  const layers = doc.layers.map((l) => {
    let x: number, y: number;
    if (deg === 90) {
      x = H - l.y;
      y = l.x;
    } else if (deg === -90) {
      x = l.y;
      y = W - l.x;
    } else {
      x = W - l.x;
      y = H - l.y;
    }
    return { ...l, x, y, rotation: (((l.rotation + deg) % 360) + 360) % 360 } as Layer;
  });
  commit(deg === 180 ? 'Rotate 180°' : deg === 90 ? 'Rotate 90° CW' : 'Rotate 90° CCW', { ...doc, width: nw, height: nh, layers }, { selection: null });
}

export function flipCanvas(axis: 'h' | 'v') {
  const doc = docOf();
  const layers = doc.layers.map((l) =>
    axis === 'h'
      ? ({ ...l, x: doc.width - l.x, rotation: -l.rotation, scaleX: -l.scaleX } as Layer)
      : ({ ...l, y: doc.height - l.y, rotation: -l.rotation, scaleY: -l.scaleY } as Layer),
  );
  commit(axis === 'h' ? 'Flip canvas horizontal' : 'Flip canvas vertical', { ...doc, layers }, { selection: null });
}

export function cropTo(r: Rect) {
  const doc = docOf();
  const x = Math.round(r.x),
    y = Math.round(r.y);
  const w = Math.max(1, Math.round(r.w)),
    h = Math.max(1, Math.round(r.h));
  const layers = doc.layers.map((l) => ({ ...l, x: l.x - x, y: l.y - y }) as Layer);
  commit('Crop', { ...doc, width: w, height: h, layers }, { selection: null });
}

export function cropToSelection() {
  const sel = S().selection;
  if (!sel) return toast('Make a selection first', 'error');
  cropTo(sel.bounds);
}

export function trimTransparent() {
  const doc = docOf();
  const c = renderDocToCanvas(doc, 1, false);
  const b = opaqueBounds(c, 0);
  if (!b) return toast('Nothing to trim', 'error');
  cropTo(b);
}

export function setDocBackground(bg: Doc['background']) {
  const doc = docOf();
  commit('Background', { ...doc, background: bg });
}

export function setDocName(name: string) {
  const doc = docOf();
  setS({ doc: { ...doc, name }, saveState: 'unsaved' });
}

/** Resize a design (Canva "Magic resize"): scales and centers content into new dimensions. */
export function magicResize(w: number, h: number) {
  const doc = docOf();
  const k = Math.min(w / doc.width, h / doc.height);
  const ox = (w - doc.width * k) / 2,
    oy = (h - doc.height * k) / 2;
  const layers = doc.layers.map((l): Layer => {
    const base = { ...l, x: l.x * k + ox, y: l.y * k + oy } as Layer;
    if (base.shadow) base.shadow = { ...base.shadow, x: base.shadow.x * k, y: base.shadow.y * k, blur: base.shadow.blur * k };
    if (base.type === 'raster') return { ...base, scaleX: base.scaleX * k, scaleY: base.scaleY * k };
    if (base.type === 'text') return { ...base, size: base.size * k, width: base.width * k, letterSpacing: base.letterSpacing * k };
    return { ...base, w: base.w * k, h: base.h * k, strokeWidth: base.strokeWidth * k, radius: base.radius * k };
  });
  commit('Resize design', { ...doc, width: Math.round(w), height: Math.round(h), layers }, { selection: null });
}
