import { gaussianBlur } from './filters';
import { layerMatrix, layerSize } from './geometry';
import type { Layer, Rect, Selection, SelectionMode } from './types';
import { createCanvas, ctx2d } from './util';

/** Builds bounds and a marching-ants outline from a mask canvas. Returns null when empty. */
export function selectionFromMask(mask: HTMLCanvasElement): Selection | null {
  const w = mask.width,
    h = mask.height;
  const data = ctx2d(mask, true).getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p++) {
      if (data[p * 4 + 3] >= 128) {
        bin[p] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // A very soft (feathered) selection may have no pixel above 50%; fall back to any coverage.
    let any = false;
    for (let p = 0; p < w * h; p++)
      if (data[p * 4 + 3] > 0) {
        any = true;
        break;
      }
    if (!any) return null;
    return { mask, bounds: { x: 0, y: 0, w, h }, outline: new Path2D() };
  }
  const outline = new Path2D();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : bin[y * w + x]);
  const x0 = minX,
    x1 = maxX + 1,
    y0 = minY,
    y1 = maxY + 1;
  // Horizontal edges between row y-1 and y.
  for (let y = y0; y <= y1; y++) {
    let run = -1;
    for (let x = x0; x <= x1; x++) {
      const edge = x < x1 && at(x, y - 1) !== at(x, y);
      if (edge && run < 0) run = x;
      else if (!edge && run >= 0) {
        outline.moveTo(run, y);
        outline.lineTo(x, y);
        run = -1;
      }
    }
  }
  // Vertical edges between column x-1 and x.
  for (let x = x0; x <= x1; x++) {
    let run = -1;
    for (let y = y0; y <= y1; y++) {
      const edge = y < y1 && at(x - 1, y) !== at(x, y);
      if (edge && run < 0) run = y;
      else if (!edge && run >= 0) {
        outline.moveTo(x, run);
        outline.lineTo(x, y);
        run = -1;
      }
    }
  }
  return { mask, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, outline };
}

export function maskFromPath(w: number, h: number, path: Path2D, antialias = true): HTMLCanvasElement {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.imageSmoothingEnabled = antialias;
  ctx.fillStyle = '#000';
  ctx.fill(path);
  return c;
}

export function rectPath(r: Rect, ellipse: boolean): Path2D {
  const p = new Path2D();
  if (ellipse) p.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
  else p.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  return p;
}

/** Combines an existing selection with a new mask according to the mode. */
export function combineMasks(prev: HTMLCanvasElement | null, next: HTMLCanvasElement, mode: SelectionMode): HTMLCanvasElement {
  if (!prev || mode === 'new') return next;
  const c = createCanvas(next.width, next.height);
  const ctx = ctx2d(c);
  ctx.drawImage(prev, 0, 0);
  ctx.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
  ctx.drawImage(next, 0, 0);
  return c;
}

export function selectAllMask(w: number, h: number): HTMLCanvasElement {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  return c;
}

export function invertMask(mask: HTMLCanvasElement): HTMLCanvasElement {
  const c = selectAllMask(mask.width, mask.height);
  const ctx = ctx2d(c);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  return c;
}

export function featherMask(mask: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const c = createCanvas(mask.width, mask.height);
  const ctx = ctx2d(c, true);
  ctx.drawImage(mask, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  gaussianBlur(data, radius);
  ctx.putImageData(data, 0, 0);
  return c;
}

/** Morphological grow (px > 0) or shrink (px < 0) approximated with offset stamping. */
export function growMask(mask: HTMLCanvasElement, px: number): HTMLCanvasElement {
  if (px === 0) return mask;
  const shrink = px < 0;
  const src = shrink ? invertMask(mask) : mask;
  const r = Math.abs(px);
  const c = createCanvas(mask.width, mask.height);
  const ctx = ctx2d(c);
  ctx.drawImage(src, 0, 0);
  const steps = Math.max(8, Math.min(48, Math.round(r * 2)));
  for (let rr = 1; rr <= r; rr += Math.max(1, Math.floor(r / 4))) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
  }
  return shrink ? invertMask(c) : c;
}

/** Border selection: ring of the given width around the selection edge. */
export function borderMask(mask: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const outer = growMask(mask, Math.ceil(px / 2));
  const inner = growMask(mask, -Math.ceil(px / 2));
  const c = createCanvas(mask.width, mask.height);
  const ctx = ctx2d(c);
  ctx.drawImage(outer, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(inner, 0, 0);
  return c;
}

/** Selection mask from a layer's opaque pixels (Ctrl+click on a layer thumbnail). */
export function layerAlphaMask(l: Layer, docW: number, docH: number, drawContent: (ctx: CanvasRenderingContext2D, l: Layer) => void) {
  const c = createCanvas(docW, docH);
  const ctx = ctx2d(c);
  ctx.setTransform(layerMatrix(l));
  drawContent(ctx, l);
  if (l.mask && l.maskEnabled !== false) {
    const { w, h } = layerSize(l);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(l.mask, 0, 0, w, h);
  }
  return c;
}

/** Projects the document-space selection mask into a layer's local pixel grid. */
export function maskInLayerSpace(mask: HTMLCanvasElement, l: Layer, w: number, h: number): HTMLCanvasElement {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  const { w: lw, h: lh } = layerSize(l);
  // local px -> layer box units -> doc
  const toDoc = layerMatrix(l).multiply(new DOMMatrix().scale(lw / w, lh / h));
  ctx.setTransform(toDoc.inverse());
  ctx.drawImage(mask, 0, 0);
  return c;
}

/** Tight bounds of non-transparent pixels in a canvas, or null if fully transparent. */
export function opaqueBounds(c: HTMLCanvasElement, threshold = 0): Rect | null {
  const { width: w, height: h } = c;
  const d = ctx2d(c, true).getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
