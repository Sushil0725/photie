import { layoutText } from './text';
import type { Layer, Rect } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** Unscaled size of a layer's local box. */
export function layerSize(l: Layer): { w: number; h: number } {
  switch (l.type) {
    case 'raster':
      return { w: l.canvas.width, h: l.canvas.height };
    case 'shape':
      return { w: l.w, h: l.h };
    case 'text': {
      const lay = layoutText(l);
      return { w: lay.w, h: lay.h };
    }
  }
}

/** Matrix mapping layer-local coordinates (0..w, 0..h) to document coordinates. */
export function layerMatrix(l: Layer): DOMMatrix {
  const { w, h } = layerSize(l);
  return new DOMMatrix().translate(l.x, l.y).rotate(l.rotation).scale(l.scaleX, l.scaleY).translate(-w / 2, -h / 2);
}

export function applyMatrix(m: DOMMatrix, x: number, y: number): Pt {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export function layerCorners(l: Layer): Pt[] {
  const { w, h } = layerSize(l);
  const m = layerMatrix(l);
  return [applyMatrix(m, 0, 0), applyMatrix(m, w, 0), applyMatrix(m, w, h), applyMatrix(m, 0, h)];
}

export function boundsOfPoints(pts: Pt[]): Rect {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const layerBounds = (l: Layer): Rect => boundsOfPoints(layerCorners(l));

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || bt <= y) return null;
  return { x, y, w: r - x, h: bt - y };
}

/** Converts a document point into layer-local coordinates. */
export function toLocal(l: Layer, p: Pt): Pt {
  const inv = layerMatrix(l).inverse();
  return applyMatrix(inv, p.x, p.y);
}

/** Hit test: boxes for vector layers, actual pixels for raster layers. */
export function hitLayer(l: Layer, p: Pt, pixelPrecise = true): boolean {
  if (!l.visible) return false;
  const { w, h } = layerSize(l);
  const lp = toLocal(l, p);
  if (lp.x < 0 || lp.y < 0 || lp.x >= w || lp.y >= h) return false;
  if (l.type === 'raster' && pixelPrecise && !l.clip) {
    try {
      const ctx = l.canvas.getContext('2d')!;
      const a = ctx.getImageData(Math.floor(lp.x), Math.floor(lp.y), 1, 1).data[3];
      return a > 8;
    } catch {
      return true;
    }
  }
  return true;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const degToRad = (d: number) => (d * Math.PI) / 180;
export const radToDeg = (r: number) => (r * 180) / Math.PI;

export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rotatePoint(p: Pt, c: Pt, deg: number): Pt {
  const r = degToRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
