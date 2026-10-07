import { Stroke, type StrokeConfig, type ToolKind } from '../../engine/brush';
import { createShapeLayer, createTextLayer, replaceLayer } from '../../engine/document';
import { floodMask, maskToCanvas } from '../../engine/flood';
import { applyMatrix, boundsOfPoints, hitLayer, layerBounds, layerMatrix, layerSize, rectFromPoints, unionRects, type Pt } from '../../engine/geometry';
import { renderDocToCanvas } from '../../engine/render';
import { maskInLayerSpace, rectPath, maskFromPath } from '../../engine/selection';
import type { Doc, Layer, RasterLayer, Rect, SelectionMode } from '../../engine/types';
import { cloneCanvas, createCanvas, ctx2d, luminance, parseColor, rgbaToHex, withAlpha } from '../../engine/util';
import { touchCanvas } from '../../engine/version';
import {
  S,
  activeLayer,
  beginLive,
  cancelLive,
  endLive,
  invalidate,
  live,
  pushRecentColor,
  selectedLayers,
  setS,
  toast,
} from '../../store/editor';
import { applyCanvasOp, applySelection, magicWand, cropTo, deselect } from '../../store/image';
import { addLayer, ensureRasterActive, selectLayers, toggleSelectLayer } from '../../store/layers';
import { screenToDoc, setZoom, zoomIn, zoomOut } from '../../store/view';
import {
  allowedHandles,
  frameOfLayers,
  handleCursor,
  hitHandle,
  pointInFrame,
  resizeLayer,
  rotateLayers,
  scaleLayers,
  snapBox,
  snapTargets,
  type Frame,
  type Guides,
  type HandleId,
} from './transform';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; start: Pt; origs: Layer[]; box: Rect; targets: { xs: number[]; ys: number[] }; moved: boolean }
  | { kind: 'resize'; handle: Exclude<HandleId, 'rot'>; origs: Layer[]; frame: Frame }
  | { kind: 'rotate'; origs: Layer[]; center: Pt; startAngle: number }
  | { kind: 'boxselect'; start: Pt; additive: boolean }
  | { kind: 'marquee'; start: Pt; mode: SelectionMode; ellipse: boolean }
  | { kind: 'lasso'; mode: SelectionMode }
  | { kind: 'stroke'; stroke: Stroke; label: string; grow: { id: string; orig: Rect; before: RasterLayer } | null }
  | { kind: 'selectBrush'; stroke: Stroke; subtract: boolean }
  | { kind: 'crop'; mode: 'new' | 'move' | Exclude<HandleId, 'rot'>; start: Pt; orig: Rect }
  | { kind: 'gradient'; a: Pt }
  | { kind: 'shape'; start: Pt; id: string }
  | { kind: 'textbox'; start: Pt }
  | { kind: 'eyedropper' };

export const ix = {
  drag: null as Drag | null,
  hoverId: null as string | null,
  pointer: null as { sx: number; sy: number; x: number; y: number } | null,
  inside: false,
  space: false,
  alt: false,
  shift: false,
  ctrl: false,
  guides: null as Guides | null,
  marquee: null as { rect: Rect; ellipse: boolean } | null,
  lasso: null as Pt[] | null,
  polygon: null as Pt[] | null,
  gradient: null as { a: Pt; b: Pt } | null,
  selectBrushCanvas: null as HTMLCanvasElement | null,
  boxSelect: null as Rect | null,
  cloneAnchor: null as Pt | null,
  pointers: new Map<number, { x: number; y: number }>(),
  pinch: null as { dist: number; mid: { x: number; y: number }; zoom: number; panX: number; panY: number } | null,
  composite: null as { doc: Doc; canvas: HTMLCanvasElement } | null,
};

/* --------------------------------- Helpers --------------------------------- */

const effectiveTool = () => {
  const s = S();
  if (ix.space) return 'hand';
  if (ix.ctrl && s.tool !== 'move' && s.tool !== 'text' && s.tool !== 'crop') return 'move';
  return s.tool;
};

export function getComposite(): HTMLCanvasElement {
  const doc = S().doc!;
  if (ix.composite && ix.composite.doc === doc) return ix.composite.canvas;
  const canvas = renderDocToCanvas(doc, 1, true);
  ix.composite = { doc, canvas };
  return canvas;
}

export function sampleColor(p: Pt): string | null {
  const s = S();
  const doc = s.doc;
  if (!doc || p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return null;
  const c = getComposite();
  const n = s.opts.sampleSize;
  const x0 = Math.max(0, Math.floor(p.x) - (n >> 1)),
    y0 = Math.max(0, Math.floor(p.y) - (n >> 1));
  const d = ctx2d(c, true).getImageData(x0, y0, n, n).data;
  let r = 0,
    g = 0,
    b = 0,
    a = 0,
    k = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    a += d[i + 3];
    k++;
  }
  if (!k) return null;
  return rgbaToHex({ r: r / k, g: g / k, b: b / k, a: a / k / 255 >= 0.99 ? 1 : a / k / 255 }, false);
}

function selectionModeFor(e: PointerEvent | MouseEvent): SelectionMode {
  const s = S();
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return s.opts.selMode;
}

function hitTopLayer(p: Pt, precise = true): Layer | null {
  const doc = S().doc!;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (hitLayer(l, p, precise)) return l;
  }
  return null;
}

/** Frame of the currently selected layers (for handles). */
export function selectionFrame(): { frame: Frame; layers: Layer[] } | null {
  const ls = selectedLayers();
  if (!ls.length) return null;
  const f = frameOfLayers(ls);
  return f ? { frame: f, layers: ls } : null;
}

function updateLayersLive(updated: Layer[]) {
  const doc = S().doc!;
  const map = new Map(updated.map((l) => [l.id, l]));
  live({ ...doc, layers: doc.layers.map((l) => map.get(l.id) || l) });
}

/* ------------------------------ Paint strokes ------------------------------ */

function retouchKind(): ToolKind {
  const s = S();
  if (s.tool === 'blur') return s.opts.blurVariant === 'smudge' ? 'smudge' : s.opts.blurVariant;
  if (s.tool === 'dodge') return s.opts.dodgeVariant;
  if (s.tool === 'brush') return s.opts.brushVariant;
  if (s.tool === 'eraser') return 'eraser';
  if (s.tool === 'clone') return 'clone';
  return 'heal';
}

/** Topmost visible, unlocked layer under a point (what the user is pointing at). */
function editableLayerAt(p: Pt): Layer | null {
  const doc = S().doc!;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.locked && hitLayer(l, p, true)) return l;
  }
  return null;
}

/** With nothing selected, pixel tools work on the layer under the pointer instead of failing. */
function pickLayerIfNone(p: Pt): Layer | undefined {
  const cur = activeLayer();
  if (cur) return cur;
  const hit = editableLayerAt(p);
  if (hit) selectLayers([hit.id]);
  return hit || undefined;
}

const MAX_GROW_PIXELS = 40e6;

/** The same raster layer on a canvas covering local rect `r` (which may extend past its pixels), kept in place. */
function reframeRaster(l: RasterLayer, r: Rect, keepPos?: RasterLayer): RasterLayer {
  const c = createCanvas(r.w, r.h);
  ctx2d(c).drawImage(l.canvas, -r.x, -r.y);
  if (keepPos) return { ...l, canvas: c, x: keepPos.x, y: keepPos.y };
  const center = applyMatrix(layerMatrix(l), r.x + r.w / 2, r.y + r.h / 2);
  return { ...l, canvas: c, x: center.x, y: center.y };
}

/**
 * Photoshop layers are unbounded, so painting next to a smaller photo should not be cut off.
 * Grows the layer to cover the document for the stroke; `trimGrown` shrinks it back afterwards.
 */
function growToDocument(l: RasterLayer, doc: Doc): { layer: RasterLayer; orig: Rect } | null {
  if (l.clip || l.mask) return null;
  const inv = layerMatrix(l).inverse();
  const b = boundsOfPoints([applyMatrix(inv, 0, 0), applyMatrix(inv, doc.width, 0), applyMatrix(inv, doc.width, doc.height), applyMatrix(inv, 0, doc.height)]);
  const W = l.canvas.width,
    H = l.canvas.height;
  const x0 = Math.min(0, Math.floor(b.x + 1e-6)),
    y0 = Math.min(0, Math.floor(b.y + 1e-6));
  const x1 = Math.max(W, Math.ceil(b.x + b.w - 1e-6)),
    y1 = Math.max(H, Math.ceil(b.y + b.h - 1e-6));
  const w = x1 - x0,
    h = y1 - y0;
  if (w === W && h === H) return null;
  if (w * h > MAX_GROW_PIXELS || w > 16384 || h > 16384) return null;
  return { layer: reframeRaster(l, { x: x0, y: y0, w, h }), orig: { x: -x0, y: -y0, w: W, h: H } };
}

/** Crops a grown layer back to its original pixels plus whatever the stroke touched. */
function trimGrown(l: RasterLayer, orig: Rect, touched: Rect | null, before: RasterLayer): RasterLayer {
  const W = l.canvas.width,
    H = l.canvas.height;
  let k = orig;
  if (touched) {
    const u = unionRects([orig, touched])!;
    const x0 = Math.max(0, Math.floor(u.x)),
      y0 = Math.max(0, Math.floor(u.y));
    k = { x: x0, y: y0, w: Math.min(W, Math.ceil(u.x + u.w)) - x0, h: Math.min(H, Math.ceil(u.y + u.h)) - y0 };
  }
  if (k.x === 0 && k.y === 0 && k.w === W && k.h === H) return l;
  const same = k.x === orig.x && k.y === orig.y && k.w === orig.w && k.h === orig.h;
  return reframeRaster(l, k, same ? before : undefined);
}

function startStroke(e: PointerEvent, p: Pt): boolean {
  const s = S();
  const doc = s.doc!;
  const kind = retouchKind();
  const paintingTool = kind === 'brush' || kind === 'pencil';
  let l = paintingTool ? activeLayer() : pickLayerIfNone(p);

  if (l && l.locked) {
    toast('This layer is locked', 'error');
    return false;
  }
  if (l && !l.visible) {
    toast('This layer is hidden. Show it to edit it.', 'error');
    return false;
  }
  // Painting on a vector layer (or nothing) creates a new pixel layer, like Canva's draw tool.
  if (paintingTool && (!l || (l.type !== 'raster' && !(s.editMask && l.mask)))) {
    const layer = createRasterLayerForPaint(doc);
    addLayer(layer, 'New layer');
    l = layer;
  } else if (!l) {
    toast(doc.layers.length ? 'Click on a photo or layer to edit it' : 'Add a photo first', 'error');
    return false;
  } else if (l.type !== 'raster' && !(s.editMask && l.mask)) {
    const r = ensureRasterActive();
    if (!r) return false;
    l = r;
  }
  const cur = S().doc!;
  l = cur.layers.find((x) => x.id === l!.id)!;
  const before = l;
  const useMask = S().editMask && !!l.mask;
  // Tools that add pixels may reach past the layer's edges.
  const grow = !useMask && l.type === 'raster' && (paintingTool || kind === 'clone') ? growToDocument(l, cur) : null;
  let canvas: HTMLCanvasElement;
  if (grow) {
    l = grow.layer;
    canvas = grow.layer.canvas;
  } else {
    const target = useMask ? l.mask! : (l as RasterLayer).canvas;
    canvas = cloneCanvas(target);
    l = (useMask ? { ...l, mask: canvas } : { ...l, canvas }) as Layer;
  }
  beginLive();
  live(replaceLayer(cur, l));

  const { w, h } = layerSize(l);
  const toLocal = new DOMMatrix().scale(canvas.width / w, canvas.height / h).multiply(layerMatrix(l).inverse());
  const localScale = Math.sqrt(Math.abs(toLocal.a * toLocal.d - toLocal.b * toLocal.c));
  const sel = S().selection;
  const selMask = sel ? maskInLayerSpace(sel.mask, l, canvas.width, canvas.height) : null;

  let mode: StrokeConfig['mode'] = 'paint';
  if (kind === 'eraser') mode = useMask ? 'mask-hide' : 'erase';
  else if (useMask) {
    const c = parseColor(s.fg);
    mode = luminance(c.r, c.g, c.b) < 128 ? 'mask-hide' : 'mask-reveal';
  }
  const o = s.opts;
  const paint = kind === 'brush' || kind === 'pencil' ? o.brush : kind === 'eraser' ? o.eraser : kind === 'clone' ? o.clone : kind === 'heal' ? o.heal : o.retouch;
  let cloneOffset: Pt | undefined;
  let cloneSrc: HTMLCanvasElement | undefined;
  if (kind === 'clone' && s.cloneSource) {
    // Aligned: the source keeps its offset from the brush across strokes; otherwise every stroke restarts at the source.
    if (!o.cloneAligned || !ix.cloneAnchor) ix.cloneAnchor = { x: s.cloneSource.x - p.x, y: s.cloneSource.y - p.y };
    const src = applyMatrix(toLocal, p.x + ix.cloneAnchor.x, p.y + ix.cloneAnchor.y);
    const dst = applyMatrix(toLocal, p.x, p.y);
    cloneOffset = { x: src.x - dst.x, y: src.y - dst.y };
    if (o.cloneSampleAll) {
      // Copy what is visible (all layers), e.g. to clone onto an empty layer non-destructively.
      cloneSrc = createCanvas(canvas.width, canvas.height);
      const cctx = ctx2d(cloneSrc);
      cctx.setTransform(toLocal);
      cctx.drawImage(getComposite(), 0, 0);
    }
  }
  const stroke = new Stroke(canvas, {
    tool: kind,
    mode,
    brush: { ...paint, color: s.fg, pencil: kind === 'pencil' },
    toLocal,
    localScale,
    selMask,
    cloneOffset,
    cloneSrc,
    strength: o.strength,
    range: o.dodgeRange,
    spongeMode: 'saturate',
    usePressure: o.pressure && e.pointerType === 'pen',
  });
  if (kind === 'sponge') stroke.cfg.spongeMode = e.altKey ? 'desaturate' : 'saturate';
  stroke.add(p, e.pressure || 0.5);
  touchCanvas(canvas);
  const labels: Record<string, string> = {
    brush: 'Brush',
    pencil: 'Pencil',
    eraser: 'Eraser',
    clone: 'Clone stamp',
    heal: 'Healing brush',
    smudge: 'Smudge',
    blur: 'Blur tool',
    sharpen: 'Sharpen tool',
    dodge: 'Dodge',
    burn: 'Burn',
    sponge: 'Sponge',
  };
  ix.drag = { kind: 'stroke', stroke, label: labels[kind] || 'Paint', grow: grow ? { id: l.id, orig: grow.orig, before: before as RasterLayer } : null };
  invalidate();
  return true;
}

/** Sets the clone stamp source (Alt+click, the "Set source" button, or the first click). */
function setCloneSource(p: Pt, first: boolean) {
  pickLayerIfNone(p);
  setS({ cloneSource: p, pickCloneSource: false });
  ix.cloneAnchor = null;
  toast(first ? 'Source set. Now paint where you want to copy it to.' : 'Clone source set');
}

function createRasterLayerForPaint(doc: Doc) {
  const c = createCanvas(doc.width, doc.height);
  const n = doc.layers.filter((l) => l.name.startsWith('Drawing')).length + 1;
  return {
    id: Math.random().toString(36).slice(2),
    name: `Drawing ${n}`,
    type: 'raster' as const,
    canvas: c,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over' as const,
    x: doc.width / 2,
    y: doc.height / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    adjust: null,
    shadow: null,
    mask: null,
    maskEnabled: true,
  };
}

/* ------------------------------ Fill / gradient ------------------------------ */

function bucketFill(p: Pt, magicErase: boolean) {
  const s = S();
  const r = ensureRasterActive();
  if (!r) return;
  const l = S().doc!.layers.find((x) => x.id === r.id)!;
  if (l.type !== 'raster') return;
  const lp = applyMatrix(layerMatrix(l).inverse(), p.x, p.y);
  const src = s.opts.sampleAll ? null : l.canvas;
  let maskLocal: HTMLCanvasElement;
  if (src) {
    if (lp.x < 0 || lp.y < 0 || lp.x >= src.width || lp.y >= src.height) return;
    const img = ctx2d(src, true).getImageData(0, 0, src.width, src.height);
    maskLocal = maskToCanvas(floodMask(img, lp.x, lp.y, s.opts.tolerance, s.opts.contiguous), src.width, src.height, true);
  } else {
    const comp = getComposite();
    const img = ctx2d(comp, true).getImageData(0, 0, comp.width, comp.height);
    const docMask = maskToCanvas(floodMask(img, p.x, p.y, s.opts.tolerance, s.opts.contiguous), comp.width, comp.height, true);
    maskLocal = maskInLayerSpace(docMask, l, l.canvas.width, l.canvas.height);
  }
  applyCanvasOp(magicErase ? 'Magic eraser' : 'Paint bucket', (ctx) => {
    if (magicErase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(maskLocal, 0, 0);
      return;
    }
    const tmp = createCanvas(maskLocal.width, maskLocal.height);
    const tctx = ctx2d(tmp);
    tctx.fillStyle = s.fg;
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(maskLocal, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  });
  pushRecentColor(s.fg);
}

function gradientStops(): string[] {
  const s = S();
  switch (s.opts.gradientPreset) {
    case 'fg-transparent':
      return [s.fg, withAlpha(s.fg, 0)];
    case 'rainbow':
      return ['#ff0040', '#ff8c00', '#ffe600', '#00d26a', '#00b3ff', '#7a3cff', '#ff00c8'];
    case 'sunset':
      return ['#ff5f6d', '#ffc371'];
    case 'ocean':
      return ['#2193b0', '#6dd5ed'];
    case 'chrome':
      return ['#e6e6e6', '#7d7d7d', '#ffffff', '#4a4a4a', '#d9d9d9'];
    default:
      return [s.fg, s.bg];
  }
}

function applyGradient(a: Pt, b: Pt) {
  const s = S();
  const l = activeLayer();
  if (!l) {
    toast('Select a layer first', 'error');
    return;
  }
  const opts = s.opts;
  applyCanvasOp('Gradient', (ctx, t) => {
    const { w, h } = layerSize(t.layer);
    const toLocal = new DOMMatrix().scale(t.canvas.width / w, t.canvas.height / h).multiply(layerMatrix(t.layer).inverse());
    ctx.setTransform(toLocal);
    const stops = t.isMask ? ['#000000', 'rgba(0,0,0,0)'] : gradientStops();
    let g: CanvasGradient;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (opts.gradientType === 'radial') g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, len);
    else if (opts.gradientType === 'angle') g = ctx.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
    else if (opts.gradientType === 'reflected') g = ctx.createLinearGradient(a.x - (b.x - a.x), a.y - (b.y - a.y), b.x, b.y);
    else g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    if (opts.gradientType === 'reflected') {
      const rev = [...stops].reverse();
      rev.forEach((c, i) => g.addColorStop((i / (rev.length - 1)) * 0.5, c));
      stops.forEach((c, i) => g.addColorStop(0.5 + (i / (stops.length - 1)) * 0.5, c));
    } else stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    // Cover the whole target canvas in document space.
    const inv = toLocal.inverse();
    const pts = [applyMatrix(inv, 0, 0), applyMatrix(inv, t.canvas.width, 0), applyMatrix(inv, t.canvas.width, t.canvas.height), applyMatrix(inv, 0, t.canvas.height)];
    const xs = pts.map((q) => q.x),
      ys = pts.map((q) => q.y);
    ctx.globalAlpha = opts.gradientOpacity;
    if (t.isMask) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
      ctx.restore();
    }
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  });
}

/* --------------------------------- Pointer ---------------------------------- */

function syncModifiers(e: PointerEvent) {
  ix.ctrl = e.ctrlKey || e.metaKey;
  ix.alt = e.altKey;
  ix.shift = e.shiftKey;
}

export function pointerDown(e: PointerEvent, sp: { x: number; y: number }) {
  const s = S();
  if (!s.doc) return;
  syncModifiers(e);
  const p = screenToDoc(sp.x, sp.y);
  ix.pointer = { sx: sp.x, sy: sp.y, x: p.x, y: p.y };
  ix.pointers.set(e.pointerId, sp);

  // Two-finger pinch on touch devices.
  if (ix.pointers.size === 2 && e.pointerType === 'touch') {
    if (ix.drag?.kind === 'stroke') {
      ix.drag.stroke.cancel();
      cancelLive();
    }
    ix.drag = null;
    const [a, b] = [...ix.pointers.values()];
    ix.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: s.zoom, panX: s.panX, panY: s.panY };
    return;
  }

  const tool = effectiveTool();
  if (e.button === 1 || tool === 'hand') {
    ix.drag = { kind: 'pan', sx: sp.x, sy: sp.y, panX: s.panX, panY: s.panY };
    return;
  }
  if (e.button !== 0) return;
  if (s.editingTextId) return;

  switch (tool) {
    case 'move':
      return moveDown(e, p);
    case 'marquee': {
      ix.drag = { kind: 'marquee', start: p, mode: selectionModeFor(e), ellipse: s.opts.marquee === 'ellipse' };
      ix.marquee = { rect: { x: p.x, y: p.y, w: 0, h: 0 }, ellipse: s.opts.marquee === 'ellipse' };
      return;
    }
    case 'lasso': {
      if (s.opts.lasso === 'polygon') {
        if (!ix.polygon) ix.polygon = [p];
        else {
          const first = ix.polygon[0];
          if (ix.polygon.length > 2 && Math.hypot(first.x - p.x, first.y - p.y) * s.zoom < 10) finishPolygon(selectionModeFor(e));
          else ix.polygon.push(p);
        }
        invalidate();
        return;
      }
      ix.drag = { kind: 'lasso', mode: selectionModeFor(e) };
      ix.lasso = [p];
      return;
    }
    case 'wand': {
      if (s.opts.wandVariant === 'selectBrush') {
        const c = createCanvas(s.doc.width, s.doc.height);
        const stroke = new Stroke(c, {
          tool: 'brush',
          mode: 'paint',
          brush: { ...s.opts.selectBrush, color: '#000000' },
          toLocal: new DOMMatrix(),
          localScale: 1,
          selMask: null,
        });
        stroke.add(p);
        ix.selectBrushCanvas = c;
        ix.drag = { kind: 'selectBrush', stroke, subtract: e.altKey || s.opts.selMode === 'subtract' };
        invalidate();
        return;
      }
      if (s.opts.wandVariant === 'object') {
        const mode = selectionModeFor(e);
        import('../../engine/ai').then((m) => m.selectObjectAt(p, mode));
        return;
      }
      magicWand(p, selectionModeFor(e), s.opts.tolerance, s.opts.contiguous, s.opts.sampleAll);
      return;
    }
    case 'crop':
      return cropDown(p);
    case 'eyedropper': {
      const c = sampleColor(p);
      if (c) setS(e.altKey ? { bg: c } : { fg: c });
      ix.drag = { kind: 'eyedropper' };
      return;
    }
    case 'brush':
    case 'eraser':
    case 'heal':
    case 'blur':
    case 'dodge':
    case 'clone': {
      if (tool === 'clone' && (e.altKey || s.pickCloneSource || !s.cloneSource)) {
        setCloneSource(p, !s.cloneSource && !e.altKey);
        return;
      }
      if (e.altKey && tool === 'brush') {
        const c = sampleColor(p);
        if (c) setS({ fg: c });
        ix.drag = { kind: 'eyedropper' };
        return;
      }
      if (tool === 'eraser' && s.opts.eraserVariant === 'magic') {
        bucketFill(p, true);
        return;
      }
      startStroke(e, p);
      return;
    }
    case 'fill': {
      if (s.opts.fillVariant === 'bucket') {
        bucketFill(p, false);
        return;
      }
      ix.drag = { kind: 'gradient', a: p };
      ix.gradient = { a: p, b: p };
      return;
    }
    case 'text':
      return textDown(p);
    case 'shape': {
      const doc = s.doc;
      const layer = createShapeLayer(doc, s.opts.shape, {
        x: p.x,
        y: p.y,
        w: 1,
        h: 1,
        fill: s.opts.shape === 'line' || s.opts.shape === 'arrowline' ? null : { type: 'solid', color: s.opts.shapeFill },
        stroke: s.opts.shapeStrokeWidth > 0 || s.opts.shape === 'line' || s.opts.shape === 'arrowline' ? s.opts.shapeStroke : null,
        strokeWidth: s.opts.shape === 'line' || s.opts.shape === 'arrowline' ? Math.max(2, s.opts.shapeStrokeWidth || 6) : s.opts.shapeStrokeWidth,
      });
      beginLive();
      live({ ...doc, layers: [...doc.layers, layer] }, { selectedIds: [layer.id] });
      ix.drag = { kind: 'shape', start: p, id: layer.id };
      return;
    }
    case 'zoom': {
      if (e.altKey) zoomOut(sp);
      else zoomIn(sp);
      return;
    }
  }
}

function moveDown(e: PointerEvent, p: Pt) {
  const s = S();
  const sf = selectionFrame();
  if (sf) {
    const allowed = sf.layers.some((l) => l.locked) ? [] : allowedHandles(sf.layers);
    const h = hitHandle(sf.frame, p, s.zoom, allowed);
    if (h === 'rot') {
      beginLive();
      ix.drag = { kind: 'rotate', origs: sf.layers, center: { x: sf.frame.cx, y: sf.frame.cy }, startAngle: Math.atan2(p.y - sf.frame.cy, p.x - sf.frame.cx) };
      return;
    }
    if (h) {
      beginLive();
      ix.drag = { kind: 'resize', handle: h, origs: sf.layers, frame: sf.frame };
      return;
    }
  }
  const hit = hitTopLayer(p, true);
  let ids = s.selectedIds;
  if (hit) {
    if (e.shiftKey) {
      toggleSelectLayer(hit.id);
      return;
    }
    if (!ids.includes(hit.id)) {
      ids = [hit.id];
      selectLayers(ids);
    }
  } else if (sf && pointInFrame(sf.frame, p)) {
    // Clicked a transparent area inside the current selection box: keep moving it.
  } else {
    if (!e.shiftKey) selectLayers([]);
    ix.drag = { kind: 'boxselect', start: p, additive: e.shiftKey };
    ix.boxSelect = { x: p.x, y: p.y, w: 0, h: 0 };
    return;
  }
  const doc = S().doc!;
  const set = new Set(ids);
  const origs = doc.layers.filter((l) => set.has(l.id));
  if (!origs.length || origs.some((l) => l.locked)) return;
  const box = unionRects(origs.map(layerBounds))!;
  const others = doc.layers.filter((l) => !set.has(l.id));
  beginLive();
  ix.drag = { kind: 'move', start: p, origs, box, targets: snapTargets(others, doc.width, doc.height), moved: false };
}

function textDown(p: Pt) {
  const hit = hitTopLayer(p, false);
  if (hit && hit.type === 'text') {
    selectLayers([hit.id]);
    startTextEdit(hit.id);
    return;
  }
  ix.drag = { kind: 'textbox', start: p };
}

export function startTextEdit(id: string) {
  const l = S().doc?.layers.find((x) => x.id === id);
  if (!l || l.type !== 'text' || l.locked) return;
  beginLive();
  setS({ editingTextId: id, selectedIds: [id] });
}

function createTextAt(p: Pt, width?: number) {
  const s = S();
  const doc = s.doc!;
  const t = createTextLayer(doc, {
    text: '',
    font: s.opts.textFont,
    size: s.opts.textSize,
    fill: { type: 'solid', color: s.fg },
    align: width ? 'left' : 'center',
    x: p.x,
    y: p.y,
    width: width || Math.max(s.opts.textSize * 6, 200),
    name: 'Text',
  });
  if (width) t.x = p.x + width / 2;
  beginLive();
  live({ ...doc, layers: [...doc.layers, t] }, { selectedIds: [t.id], editingTextId: t.id });
}

function cropDown(p: Pt) {
  const s = S();
  const r = s.cropRect || { x: 0, y: 0, w: s.doc!.width, h: s.doc!.height };
  const f: Frame = { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rot: 0 };
  const h = hitHandle(f, p, s.zoom, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  if (h && h !== 'rot') ix.drag = { kind: 'crop', mode: h, start: p, orig: r };
  // Until a crop box exists, any drag draws a new one; afterwards dragging inside moves it.
  else if (s.cropRect && pointInFrame(f, p)) ix.drag = { kind: 'crop', mode: 'move', start: p, orig: r };
  else ix.drag = { kind: 'crop', mode: 'new', start: p, orig: r };
}

function cropRatio(): number | null {
  const v = S().opts.cropRatio;
  if (v === 'free') return null;
  if (v === 'original') return S().doc!.width / S().doc!.height;
  const [a, b] = v.split(':').map(Number);
  return a && b ? a / b : null;
}

function cropMove(p: Pt, shift: boolean) {
  const d = ix.drag as Extract<Drag, { kind: 'crop' }>;
  const o = d.orig;
  let r: Rect;
  const ratio = cropRatio() ?? (shift ? o.w / o.h : null);
  if (d.mode === 'move') r = { ...o, x: o.x + p.x - d.start.x, y: o.y + p.y - d.start.y };
  else if (d.mode === 'new') {
    r = rectFromPoints(d.start, p);
    if (ratio) {
      const w = Math.max(r.w, r.h * ratio);
      r = { x: p.x < d.start.x ? d.start.x - w : d.start.x, y: p.y < d.start.y ? d.start.y - w / ratio : d.start.y, w, h: w / ratio };
    }
  } else {
    let x1 = o.x,
      y1 = o.y,
      x2 = o.x + o.w,
      y2 = o.y + o.h;
    if (d.mode.includes('w')) x1 = Math.min(p.x, x2 - 1);
    if (d.mode.includes('e')) x2 = Math.max(p.x, x1 + 1);
    if (d.mode.includes('n')) y1 = Math.min(p.y, y2 - 1);
    if (d.mode.includes('s')) y2 = Math.max(p.y, y1 + 1);
    r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    if (ratio) {
      if (d.mode === 'n' || d.mode === 's') {
        const w = r.h * ratio;
        r = { ...r, x: o.x + o.w / 2 - w / 2, w };
      } else {
        const h = r.w / ratio;
        r = { ...r, h, y: d.mode.includes('n') ? y2 - h : d.mode === 'e' || d.mode === 'w' ? o.y + o.h / 2 - h / 2 : y1 };
      }
    }
  }
  setS({ cropRect: r });
}

export function applyCrop() {
  const r = S().cropRect;
  if (!r || r.w < 1 || r.h < 1) return;
  cropTo(r);
  setS({ cropRect: null });
}

export function pointerMove(e: PointerEvent, sp: { x: number; y: number }) {
  const s = S();
  if (!s.doc) return;
  if (!ix.drag) syncModifiers(e);
  const p = screenToDoc(sp.x, sp.y);
  ix.pointer = { sx: sp.x, sy: sp.y, x: p.x, y: p.y };
  if (ix.pointers.has(e.pointerId)) ix.pointers.set(e.pointerId, sp);

  if (ix.pinch && ix.pointers.size >= 2) {
    const [a, b] = [...ix.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const pz = ix.pinch;
    const zoom = Math.max(0.02, Math.min(32, (pz.zoom * dist) / pz.dist));
    const docX = (pz.mid.x - pz.panX) / pz.zoom,
      docY = (pz.mid.y - pz.panY) / pz.zoom;
    setS({ zoom, panX: mid.x - docX * zoom, panY: mid.y - docY * zoom });
    return;
  }

  const d = ix.drag;
  if (!d) {
    if (effectiveTool() === 'move' && !ix.space) {
      const hit = hitTopLayer(p, false);
      const id = hit?.id || null;
      if (id !== ix.hoverId) ix.hoverId = id;
    } else ix.hoverId = null;
    invalidate();
    return;
  }

  switch (d.kind) {
    case 'pan':
      setS({ panX: d.panX + sp.x - d.sx, panY: d.panY + sp.y - d.sy });
      return;
    case 'move': {
      let dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * s.zoom < 2) return;
      d.moved = true;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      ix.guides = null;
      if (s.snap && !e.altKey) {
        const box = { ...d.box, x: d.box.x + dx, y: d.box.y + dy };
        const sn = snapBox(box, d.targets, 6 / s.zoom);
        dx += sn.dx;
        dy += sn.dy;
        ix.guides = sn.guides.x.length || sn.guides.y.length ? sn.guides : null;
      }
      updateLayersLive(d.origs.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })));
      return;
    }
    case 'resize': {
      if (d.origs.length === 1) updateLayersLive([resizeLayer(d.origs[0], d.handle, p, { shift: e.shiftKey, alt: e.altKey })]);
      else updateLayersLive(scaleLayers(d.origs, d.frame, d.handle, p, e.altKey));
      return;
    }
    case 'rotate': {
      let delta = ((Math.atan2(p.y - d.center.y, p.x - d.center.x) - d.startAngle) * 180) / Math.PI;
      const base = d.origs.length === 1 ? d.origs[0].rotation : 0;
      let target = base + delta;
      if (e.shiftKey) target = Math.round(target / 15) * 15;
      else {
        const near = Math.round(target / 90) * 90;
        if (Math.abs(near - target) < 3) target = near;
      }
      delta = target - base;
      updateLayersLive(rotateLayers(d.origs, d.center, delta));
      return;
    }
    case 'boxselect': {
      ix.boxSelect = rectFromPoints(d.start, p);
      invalidate();
      return;
    }
    case 'marquee': {
      let r = rectFromPoints(d.start, p);
      if (e.shiftKey && d.mode !== 'add') {
        const m = Math.max(r.w, r.h);
        r = { x: p.x < d.start.x ? d.start.x - m : d.start.x, y: p.y < d.start.y ? d.start.y - m : d.start.y, w: m, h: m };
      }
      if (e.altKey && d.mode !== 'subtract') r = { x: d.start.x - r.w, y: d.start.y - r.h, w: r.w * 2, h: r.h * 2 };
      ix.marquee = { rect: r, ellipse: d.ellipse };
      invalidate();
      return;
    }
    case 'lasso': {
      const last = ix.lasso![ix.lasso!.length - 1];
      if (Math.hypot(last.x - p.x, last.y - p.y) * s.zoom > 1.5) ix.lasso!.push(p);
      invalidate();
      return;
    }
    case 'stroke':
    case 'selectBrush': {
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const target = (e.currentTarget || e.target) as HTMLElement;
      const rect = target?.getBoundingClientRect?.();
      if (evs.length > 1 && rect) {
        for (const ce of evs) d.stroke.add(screenToDoc(ce.clientX - rect.left, ce.clientY - rect.top), ce.pressure || 0.5);
      } else d.stroke.add(p, e.pressure || 0.5);
      touchCanvas(d.stroke.target);
      invalidate();
      return;
    }
    case 'crop':
      cropMove(p, e.shiftKey);
      return;
    case 'gradient': {
      let b = p;
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(p.y - d.a.y, p.x - d.a.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(p.x - d.a.x, p.y - d.a.y);
        b = { x: d.a.x + Math.cos(ang) * len, y: d.a.y + Math.sin(ang) * len };
      }
      ix.gradient = { a: d.a, b };
      invalidate();
      return;
    }
    case 'shape': {
      const doc = s.doc;
      const l = doc.layers.find((x) => x.id === d.id);
      if (!l || l.type !== 'shape') return;
      let r = rectFromPoints(d.start, p);
      const isLine = l.shape === 'line' || l.shape === 'arrowline';
      if (isLine) {
        let dx = p.x - d.start.x,
          dy = p.y - d.start.y;
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          dx = Math.cos(ang) * len;
          dy = Math.sin(ang) * len;
        }
        const len = Math.max(1, Math.hypot(dx, dy));
        const h = Math.max(20, l.strokeWidth * 3);
        live(replaceLayer(doc, { ...l, w: len, h, x: d.start.x + dx / 2, y: d.start.y + dy / 2, rotation: (Math.atan2(dy, dx) * 180) / Math.PI }));
        return;
      }
      if (e.shiftKey) {
        const m = Math.max(r.w, r.h);
        r = { x: p.x < d.start.x ? d.start.x - m : d.start.x, y: p.y < d.start.y ? d.start.y - m : d.start.y, w: m, h: m };
      }
      if (e.altKey) r = { x: d.start.x - r.w, y: d.start.y - r.h, w: r.w * 2, h: r.h * 2 };
      live(replaceLayer(doc, { ...l, w: Math.max(1, r.w), h: Math.max(1, r.h), x: r.x + r.w / 2, y: r.y + r.h / 2 }));
      return;
    }
    case 'eyedropper': {
      const c = sampleColor(p);
      if (c) setS(e.altKey && s.tool === 'eyedropper' ? { bg: c } : { fg: c });
      return;
    }
    case 'textbox':
      invalidate();
      return;
  }
}

export function pointerUp(e: PointerEvent) {
  ix.pointers.delete(e.pointerId);
  if (ix.pinch) {
    if (ix.pointers.size < 2) ix.pinch = null;
    return;
  }
  const s = S();
  const d = ix.drag;
  ix.drag = null;
  if (!d || !s.doc) return;
  const p = ix.pointer ? { x: ix.pointer.x, y: ix.pointer.y } : { x: 0, y: 0 };

  switch (d.kind) {
    case 'move':
      ix.guides = null;
      if (d.moved) endLive(d.origs.length > 1 ? 'Move layers' : 'Move');
      else cancelLive();
      break;
    case 'resize':
      endLive(d.origs.length === 1 && d.origs[0].type === 'text' ? 'Resize text' : 'Transform');
      break;
    case 'rotate':
      endLive('Rotate');
      break;
    case 'boxselect': {
      const r = ix.boxSelect;
      ix.boxSelect = null;
      if (r && r.w * s.zoom > 3 && r.h * s.zoom > 3) {
        const hits = s.doc.layers.filter((l) => {
          if (!l.visible || l.locked) return false;
          const b = layerBounds(l);
          return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y && !(b.x <= 0 && b.y <= 0 && b.w >= s.doc!.width && b.h >= s.doc!.height);
        });
        const ids = hits.map((l) => l.id);
        selectLayers(d.additive ? [...new Set([...s.selectedIds, ...ids])] : ids);
      }
      break;
    }
    case 'marquee': {
      const m = ix.marquee;
      ix.marquee = null;
      if (!m || m.rect.w * s.zoom < 2 || m.rect.h * s.zoom < 2) {
        if (d.mode === 'new' && s.selection) applySelectionNone();
        break;
      }
      const mask = maskFromPath(s.doc.width, s.doc.height, rectPath(m.rect, m.ellipse));
      applySelection(mask, d.mode, s.opts.feather, m.ellipse ? 'Elliptical marquee' : 'Rectangular marquee');
      break;
    }
    case 'lasso': {
      const pts = ix.lasso || [];
      ix.lasso = null;
      if (pts.length < 3) {
        if (d.mode === 'new' && s.selection) applySelectionNone();
        break;
      }
      applyPolygonSelection(pts, d.mode, 'Lasso');
      break;
    }
    case 'stroke': {
      const changed = d.stroke.end();
      touchCanvas(d.stroke.target);
      if (changed && d.grow) {
        const doc = S().doc!;
        const g = d.grow;
        const l = doc.layers.find((x) => x.id === g.id);
        if (l && l.type === 'raster') live(replaceLayer(doc, trimGrown(l, g.orig, d.stroke.touched, g.before)));
      }
      if (changed) endLive(d.label);
      else cancelLive();
      invalidate();
      break;
    }
    case 'selectBrush': {
      d.stroke.end();
      const c = ix.selectBrushCanvas;
      ix.selectBrushCanvas = null;
      if (c) applySelection(c, d.subtract ? 'subtract' : s.selection ? 'add' : 'new', 0, 'Selection brush');
      break;
    }
    case 'crop': {
      const r = S().cropRect;
      if (r && (r.w * s.zoom < 4 || r.h * s.zoom < 4)) setS({ cropRect: null });
      break;
    }
    case 'gradient': {
      const g = ix.gradient;
      ix.gradient = null;
      if (g && Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) * s.zoom > 3) applyGradient(g.a, g.b);
      invalidate();
      break;
    }
    case 'shape': {
      const l = s.doc.layers.find((x) => x.id === d.id);
      if (l && l.type === 'shape' && (l.w * s.zoom < 4 || (l.h * s.zoom < 4 && l.shape !== 'line' && l.shape !== 'arrowline'))) {
        // A click without dragging drops a default-sized shape.
        const def = createShapeLayer(s.doc, l.shape);
        live(replaceLayer(s.doc, { ...l, w: def.w, h: def.h, x: p.x, y: p.y, rotation: 0 }));
      }
      endLive('Draw shape');
      setS({ tool: 'move' });
      break;
    }
    case 'textbox': {
      const w = Math.abs(p.x - d.start.x);
      if (w * s.zoom > 20) createTextAt({ x: Math.min(p.x, d.start.x), y: (p.y + d.start.y) / 2 }, w);
      else createTextAt(p);
      break;
    }
    case 'eyedropper':
      pushRecentColor(S().fg);
      break;
  }
  invalidate();
}

function applySelectionNone() {
  deselect();
}

function applyPolygonSelection(pts: Pt[], mode: SelectionMode, label: string) {
  const s = S();
  const path = new Path2D();
  pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
  path.closePath();
  applySelection(maskFromPath(s.doc!.width, s.doc!.height, path), mode, s.opts.feather, label);
}

export function finishPolygon(mode: SelectionMode = S().opts.selMode) {
  const pts = ix.polygon;
  ix.polygon = null;
  if (pts && pts.length > 2) applyPolygonSelection(pts, mode, 'Polygonal lasso');
  invalidate();
}

export function cancelInteraction() {
  const d = ix.drag;
  if (d?.kind === 'stroke') {
    d.stroke.cancel();
    cancelLive();
  } else if (d && (d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate' || d.kind === 'shape')) cancelLive();
  ix.drag = null;
  ix.polygon = null;
  ix.lasso = null;
  ix.marquee = null;
  ix.gradient = null;
  ix.boxSelect = null;
  ix.guides = null;
  invalidate();
}

export function doubleClick(sp: { x: number; y: number }) {
  const s = S();
  if (!s.doc) return;
  const p = screenToDoc(sp.x, sp.y);
  if (s.tool === 'lasso' && ix.polygon) {
    finishPolygon();
    return;
  }
  if (s.tool === 'crop') {
    applyCrop();
    return;
  }
  if (s.tool === 'move' || s.tool === 'text') {
    const hit = hitTopLayer(p, false);
    if (hit && hit.type === 'text') startTextEdit(hit.id);
  }
  if (s.tool === 'zoom') setZoom(1, sp);
}

/** Cursor for the current tool and hover state. */
export function cursorFor(): string {
  const s = S();
  const tool = effectiveTool();
  if (ix.drag?.kind === 'pan') return 'grabbing';
  if (tool === 'hand') return 'grab';
  const p = ix.pointer;
  if (tool === 'move' && p) {
    const sf = selectionFrame();
    if (sf) {
      const allowed = sf.layers.some((l) => l.locked) ? [] : allowedHandles(sf.layers);
      const h = hitHandle(sf.frame, p, s.zoom, allowed);
      if (h) return handleCursor(h, sf.frame.rot);
    }
    if (ix.drag?.kind === 'move') return 'move';
    return ix.hoverId ? 'move' : 'default';
  }
  if (tool === 'crop' && p && s.cropRect) {
    const r = s.cropRect;
    const f: Frame = { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rot: 0 };
    const h = hitHandle(f, p, s.zoom, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    if (h) return handleCursor(h, 0);
    if (pointInFrame(f, p)) return 'move';
    return 'crosshair';
  }
  if (tool === 'clone' && (s.pickCloneSource || !s.cloneSource)) return 'crosshair';
  switch (tool) {
    case 'text':
      return 'text';
    case 'zoom':
      return ix.alt ? 'zoom-out' : 'zoom-in';
    case 'eyedropper':
      return 'crosshair';
    case 'brush':
    case 'eraser':
    case 'clone':
    case 'heal':
    case 'blur':
    case 'dodge':
      return 'none';
    case 'wand':
      return s.opts.wandVariant === 'selectBrush' ? 'none' : 'crosshair';
    default:
      return 'crosshair';
  }
}

export function brushSizeForTool(): number | null {
  const s = S();
  const tool = effectiveTool();
  const o = s.opts;
  switch (tool) {
    case 'brush':
      return o.brush.size;
    case 'eraser':
      return o.eraserVariant === 'magic' ? null : o.eraser.size;
    case 'clone':
      return o.clone.size;
    case 'heal':
      return o.heal.size;
    case 'blur':
    case 'dodge':
      return o.retouch.size;
    case 'wand':
      return o.wandVariant === 'selectBrush' ? o.selectBrush.size : null;
    default:
      return null;
  }
}

