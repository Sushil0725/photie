import { solid } from './fill';
import { naturalTextWidth } from './text';
import type { Doc, Fill, Layer, RasterLayer, ShapeKind, ShapeLayer, TextLayer } from './types';
import { cloneCanvas, createCanvas, uid } from './util';

export function createDoc(width: number, height: number, name = 'Untitled design', background: Fill | null = solid('#ffffff')): Doc {
  return { id: uid(), name, width: Math.round(width), height: Math.round(height), background, layers: [] };
}

const base = (name: string) => ({
  id: uid(),
  name,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over' as const,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  adjust: null,
  shadow: null,
  mask: null,
  maskEnabled: true,
});

export function createRasterLayer(canvas: HTMLCanvasElement, x: number, y: number, name = 'Layer'): RasterLayer {
  return { ...base(name), type: 'raster', canvas, x, y };
}

export function createEmptyRaster(doc: Doc, name = 'Layer'): RasterLayer {
  return createRasterLayer(createCanvas(doc.width, doc.height), doc.width / 2, doc.height / 2, name);
}

export function createTextLayer(doc: Doc, props: Partial<TextLayer> = {}): TextLayer {
  const t: TextLayer = {
    ...base('Text'),
    type: 'text',
    text: 'Add your text',
    font: 'Inter',
    size: Math.round(Math.max(24, Math.min(doc.width, doc.height) / 14)),
    weight: 400,
    italic: false,
    underline: false,
    strike: false,
    uppercase: false,
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    width: 400,
    fill: solid('#111111'),
    outline: null,
    background: null,
    curve: 0,
    x: doc.width / 2,
    y: doc.height / 2,
    ...props,
  };
  if (props.width === undefined) t.width = Math.min(naturalTextWidth(t), doc.width * 0.9);
  t.name = props.name || t.text.split('\n')[0].slice(0, 28) || 'Text';
  return t;
}

export function createShapeLayer(doc: Doc, shape: ShapeKind, props: Partial<ShapeLayer> = {}): ShapeLayer {
  const s = Math.round(Math.min(doc.width, doc.height) * 0.3);
  const isLine = shape === 'line' || shape === 'arrowline';
  return {
    ...base(shape[0].toUpperCase() + shape.slice(1)),
    type: 'shape',
    shape,
    w: s,
    h: isLine ? Math.max(20, Math.round(s * 0.12)) : s,
    fill: isLine ? null : solid('#7c5cff'),
    stroke: isLine ? '#111111' : null,
    strokeWidth: isLine ? Math.max(4, Math.round(s / 40)) : 0,
    dash: 0,
    radius: 0,
    sides: 5,
    inner: shape === 'ring' ? 0.6 : 0.45,
    x: doc.width / 2,
    y: doc.height / 2,
    ...props,
  };
}

/** Deep copy of a layer (raster data and masks are cloned). */
export function duplicateLayer(l: Layer, offset = 0): Layer {
  const copy = { ...l, id: uid(), name: l.name.endsWith(' copy') ? l.name : l.name + ' copy', x: l.x + offset, y: l.y + offset } as Layer;
  if (copy.type === 'raster') copy.canvas = cloneCanvas((l as RasterLayer).canvas);
  if (l.mask) copy.mask = cloneCanvas(l.mask);
  return copy;
}

export function findLayer(doc: Doc, id: string | null | undefined): Layer | undefined {
  return id ? doc.layers.find((l) => l.id === id) : undefined;
}

export function replaceLayer(doc: Doc, layer: Layer): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? layer : l)) };
}

export function updateLayers(doc: Doc, ids: Set<string> | string[], fn: (l: Layer) => Layer): Doc {
  const set = ids instanceof Set ? ids : new Set(ids);
  return { ...doc, layers: doc.layers.map((l) => (set.has(l.id) ? fn(l) : l)) };
}

/** Creates a raster layer for an image, scaled to fit inside the document. */
export function imageLayer(doc: Doc, img: CanvasImageSource & { width: number; height: number }, name: string, fitRatio = 0.8, fill = false): RasterLayer {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  // Keep huge images at a reasonable resolution relative to the document.
  const maxDim = Math.max(doc.width, doc.height) * 2;
  const k = Math.min(1, maxDim / Math.max(iw, ih));
  const c = createCanvas(iw * k, ih * k);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const layer = createRasterLayer(c, doc.width / 2, doc.height / 2, name);
  const fit = fill
    ? Math.max(doc.width / c.width, doc.height / c.height)
    : Math.min(1, (doc.width * fitRatio) / c.width, (doc.height * fitRatio) / c.height);
  layer.scaleX = layer.scaleY = fit;
  return layer;
}
