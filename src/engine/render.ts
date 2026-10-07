import { adjustedCanvas, isNeutral, renderAdjusted } from './adjust';
import { fillPrimary, fillStyle } from './fill';
import { boundsOfPoints, intersectRects, layerMatrix, layerSize, applyMatrix, unionRects, layerBounds } from './geometry';
import { isLineShape, shapePath } from './shapes';
import { drawText } from './text';
import type { Doc, Layer, LayerGroup, RasterLayer, Rect, ShapeLayer } from './types';
import { createCanvas, ctx2d, withAlpha } from './util';

export interface RenderOptions {
  /** Transform from document space to output pixels. */
  base: DOMMatrix;
  /** Uniform scale of `base`, used for pixel-space effects like shadows. */
  scale: number;
  hidden?: Set<string>;
  background?: boolean;
  smoothing?: boolean;
  quality?: ImageSmoothingQuality;
  /** Clip drawing to the document rectangle. */
  clipToDoc?: boolean;
}

let scratch: HTMLCanvasElement | null = null;
function getScratch(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) scratch = createCanvas(w, h);
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, Math.ceil(w));
    scratch.height = Math.max(scratch.height, Math.ceil(h));
  }
  const ctx = ctx2d(scratch);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, Math.ceil(w) + 1, Math.ceil(h) + 1);
  return ctx;
}

export function shapeOpts(l: ShapeLayer) {
  return { radius: l.radius, sides: l.sides, inner: l.inner };
}

const iconPaths = new Map<string, Path2D>();
function iconPath(d: string) {
  let p = iconPaths.get(d);
  if (!p) {
    p = new Path2D(d);
    iconPaths.set(d, p);
  }
  return p;
}

function drawIcon(ctx: CanvasRenderingContext2D, l: ShapeLayer) {
  if (!l.path) return;
  ctx.save();
  ctx.scale(l.w / 24, l.h / 24);
  const p = iconPath(l.path);
  if (l.fill) {
    ctx.fillStyle = fillStyle(ctx, l.fill, 0, 0, 24, 24);
    ctx.fill(p);
  }
  if (l.stroke && l.strokeWidth > 0) {
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = l.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(p);
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer) {
  if (l.shape === 'icon') return drawIcon(ctx, l);
  const path = shapePath(l.shape, l.w, l.h, shapeOpts(l));
  const line = isLineShape(l.shape);
  if (l.fill && !line) {
    ctx.fillStyle = fillStyle(ctx, l.fill, 0, 0, l.w, l.h);
    ctx.fill(path);
  }
  const strokeColor = line ? l.stroke || fillPrimary(l.fill) : l.stroke;
  if (strokeColor && l.strokeWidth > 0) {
    ctx.lineWidth = l.strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.lineJoin = 'round';
    ctx.lineCap = line ? 'round' : 'butt';
    if (l.dash > 0) ctx.setLineDash([l.dash * l.strokeWidth, l.dash * l.strokeWidth * 0.8]);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
}

function drawRaster(ctx: CanvasRenderingContext2D, l: RasterLayer) {
  const src = adjustedCanvas(l.canvas, l.adjust);
  const w = l.canvas.width;
  const h = l.canvas.height;
  if (l.clip) {
    const path = shapePath(l.clip, w, h, { radius: l.clipRadius || 0 });
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    if (l.frameStroke && l.frameStroke.width > 0) {
      ctx.lineWidth = l.frameStroke.width;
      ctx.strokeStyle = l.frameStroke.color;
      ctx.stroke(path);
    }
  } else ctx.drawImage(src, 0, 0);
}

/** Draws only the content of a layer in its local coordinate space. */
export function drawLayerContent(ctx: CanvasRenderingContext2D, l: Layer) {
  if (l.type === 'raster') drawRaster(ctx, l);
  else if (l.type === 'text') drawText(ctx, l);
  else drawShape(ctx, l);
}

function isMultipart(l: Layer) {
  if (l.type === 'text') return !!(l.outline?.width || l.background);
  if (l.type === 'shape') return !!(l.fill && l.stroke && l.strokeWidth > 0);
  return !!l.frameStroke;
}

function hasMask(l: Layer) {
  return !!l.mask && l.maskEnabled !== false;
}

export function renderLayer(ctx: CanvasRenderingContext2D, l: Layer, opts: RenderOptions) {
  if (!l.visible || l.opacity <= 0 || opts.hidden?.has(l.id)) return;
  const m = opts.base.multiply(layerMatrix(l));
  const vectorAdjust = l.type !== 'raster' && !isNeutral(l.adjust);
  const needsScratch = hasMask(l) || !!l.shadow || vectorAdjust || (l.opacity < 1 && isMultipart(l));
  const smoothing = opts.smoothing ?? true;

  if (!needsScratch) {
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend;
    ctx.imageSmoothingEnabled = smoothing;
    ctx.imageSmoothingQuality = opts.quality || 'medium';
    ctx.setTransform(m);
    drawLayerContent(ctx, l);
    ctx.restore();
    return;
  }

  // Render into a scratch buffer covering the layer's output bounds.
  const { w, h } = layerSize(l);
  const pad = vectorAdjust && l.adjust ? (l.adjust.blur / 2) * opts.scale + 2 : 2;
  const corners = [applyMatrix(m, 0, 0), applyMatrix(m, w, 0), applyMatrix(m, w, h), applyMatrix(m, 0, h)];
  let box = boundsOfPoints(corners);
  if (l.type === 'text' && l.background) box = { x: box.x - l.background.padding * opts.scale * 2, y: box.y - l.background.padding * opts.scale * 2, w: box.w + l.background.padding * opts.scale * 4, h: box.h + l.background.padding * opts.scale * 4 };
  if (l.type === 'text' && l.outline) box = { x: box.x - l.outline.width * opts.scale * 2, y: box.y - l.outline.width * opts.scale * 2, w: box.w + l.outline.width * opts.scale * 4, h: box.h + l.outline.width * opts.scale * 4 };
  if (l.type === 'shape' && l.strokeWidth) {
    const s = l.strokeWidth * opts.scale;
    box = { x: box.x - s, y: box.y - s, w: box.w + s * 2, h: box.h + s * 2 };
  }
  box = { x: Math.floor(box.x - pad), y: Math.floor(box.y - pad), w: Math.ceil(box.w + pad * 2) + 1, h: Math.ceil(box.h + pad * 2) + 1 };
  // Shadows can fall from off-screen parts, so expand the visible clip by the shadow reach.
  const reach = l.shadow ? (Math.abs(l.shadow.x) + Math.abs(l.shadow.y) + l.shadow.blur * 2) * opts.scale : 0;
  const out = intersectRects(box, { x: -reach, y: -reach, w: ctx.canvas.width + reach * 2, h: ctx.canvas.height + reach * 2 });
  if (!out) return;
  const bx = out.x,
    by = out.y,
    bw = Math.ceil(out.w),
    bh = Math.ceil(out.h);
  if (bw <= 0 || bh <= 0 || bw * bh > 64e6) return;

  const sctx = getScratch(bw, bh);
  sctx.imageSmoothingEnabled = smoothing;
  sctx.imageSmoothingQuality = opts.quality || 'medium';
  sctx.setTransform(new DOMMatrix().translate(-bx, -by).multiply(m));
  drawLayerContent(sctx, l);
  if (hasMask(l)) {
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(l.mask!, 0, 0, w, h);
    sctx.globalCompositeOperation = 'source-over';
  }
  let source: CanvasImageSource = scratch!;
  if (vectorAdjust && l.adjust) {
    const tmp = createCanvas(bw, bh);
    ctx2d(tmp).drawImage(scratch!, 0, 0, bw, bh, 0, 0, bw, bh);
    source = renderAdjusted(tmp, bw, bh, { ...l.adjust, blur: l.adjust.blur * opts.scale });
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend;
  if (l.shadow) {
    ctx.shadowColor = withAlpha(l.shadow.color, l.shadow.opacity);
    ctx.shadowBlur = l.shadow.blur * opts.scale;
    ctx.shadowOffsetX = l.shadow.x * opts.scale;
    ctx.shadowOffsetY = l.shadow.y * opts.scale;
  }
  ctx.drawImage(source, 0, 0, bw, bh, bx, by, bw, bh);
  ctx.restore();
}

let groupBuffer: HTMLCanvasElement | null = null;

/**
 * Renders layers in order. A group with normal blending at full opacity passes its members straight
 * through; otherwise the members are composited together first, then blended as one (like Photoshop).
 */
export function renderLayers(ctx: CanvasRenderingContext2D, layers: Layer[], opts: RenderOptions, groups?: LayerGroup[]) {
  const byId = groups?.length ? new Map(groups.map((g) => [g.id, g])) : null;
  for (let i = 0; i < layers.length; i++) {
    const g = byId && layers[i].group ? byId.get(layers[i].group!) : undefined;
    if (!g) {
      renderLayer(ctx, layers[i], opts);
      continue;
    }
    let j = i;
    while (j + 1 < layers.length && layers[j + 1].group === g.id) j++;
    const run = layers.slice(i, j + 1);
    i = j;
    if (g.opacity >= 1 && g.blend === 'source-over') {
      for (const m of run) renderLayer(ctx, m, opts);
      continue;
    }
    if (g.opacity <= 0) continue;
    const { width: W, height: H } = ctx.canvas;
    if (!groupBuffer) groupBuffer = createCanvas(W, H);
    if (groupBuffer.width !== W || groupBuffer.height !== H) {
      groupBuffer.width = W;
      groupBuffer.height = H;
    }
    const gctx = ctx2d(groupBuffer);
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);
    for (const m of run) renderLayer(gctx, m, opts);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = g.opacity;
    ctx.globalCompositeOperation = g.blend;
    ctx.drawImage(groupBuffer, 0, 0);
    ctx.restore();
  }
}

export function renderDoc(ctx: CanvasRenderingContext2D, doc: Doc, opts: RenderOptions, layers: Layer[] = doc.layers) {
  ctx.save();
  ctx.setTransform(opts.base);
  if (opts.clipToDoc !== false) {
    ctx.beginPath();
    ctx.rect(0, 0, doc.width, doc.height);
    ctx.clip();
  }
  if (opts.background !== false && doc.background) {
    ctx.fillStyle = fillStyle(ctx, doc.background, 0, 0, doc.width, doc.height);
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  renderLayers(ctx, layers, opts, doc.groups);
  ctx.restore();
}

/** Renders the whole document to a new canvas at the given scale. */
export function renderDocToCanvas(doc: Doc, scale = 1, background = true): HTMLCanvasElement {
  const c = createCanvas(doc.width * scale, doc.height * scale);
  const ctx = ctx2d(c);
  renderDoc(ctx, doc, {
    base: new DOMMatrix().scale(c.width / doc.width, c.height / doc.height),
    scale,
    background,
    quality: 'high',
  });
  return c;
}

/** Renders layers into a canvas covering `rect` (document coordinates) at 1:1. */
export function renderLayersToRect(layers: Layer[], rect: Rect, opts: Partial<RenderOptions> = {}, groups?: LayerGroup[]): HTMLCanvasElement {
  const c = createCanvas(rect.w, rect.h);
  const ctx = ctx2d(c);
  const ro: RenderOptions = { base: new DOMMatrix().translate(-rect.x, -rect.y), scale: 1, quality: 'high', ...opts };
  ctx.save();
  renderLayers(ctx, layers, ro, groups);
  ctx.restore();
  return c;
}

/** Bounds of a set of layers including the document area, rounded to whole pixels. */
export function layersRect(layers: Layer[]): Rect | null {
  const r = unionRects(layers.map(layerBounds));
  if (!r) return null;
  const x = Math.floor(r.x),
    y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}

let checker: CanvasPattern | null = null;
export function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (checker) return checker;
  const c = createCanvas(16, 16);
  const cx = ctx2d(c);
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 16, 16);
  cx.fillStyle = '#e3e3e8';
  cx.fillRect(0, 0, 8, 8);
  cx.fillRect(8, 8, 8, 8);
  checker = ctx.createPattern(c, 'repeat')!;
  return checker;
}

/** Renders a single layer as a small thumbnail canvas. */
export function layerThumbnail(l: Layer, size: number, target?: HTMLCanvasElement): HTMLCanvasElement {
  const { w, h } = layerSize(l);
  const s = Math.min(size / w, size / h);
  const c = target || createCanvas(size, size);
  if (c.width !== size) c.width = c.height = size;
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate((size - w * s) / 2, (size - h * s) / 2);
  ctx.scale(s, s);
  ctx.imageSmoothingQuality = 'high';
  drawLayerContent(ctx, { ...l, adjust: l.adjust } as Layer);
  ctx.restore();
  return c;
}
