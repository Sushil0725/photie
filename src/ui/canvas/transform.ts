import { degToRad, layerBounds, layerSize, rotatePoint, unionRects, type Pt } from '../../engine/geometry';
import type { Layer, Rect } from '../../engine/types';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number; // degrees
}

const SIGNS: Record<Exclude<HandleId, 'rot'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export function frameOfLayer(l: Layer): Frame {
  const { w, h } = layerSize(l);
  return { cx: l.x, cy: l.y, w: w * Math.abs(l.scaleX), h: h * Math.abs(l.scaleY), rot: l.rotation };
}

export function frameOfLayers(ls: Layer[]): Frame | null {
  if (!ls.length) return null;
  if (ls.length === 1) return frameOfLayer(ls[0]);
  const b = unionRects(ls.map(layerBounds))!;
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: 0 };
}

function axes(f: Frame) {
  const r = degToRad(f.rot);
  return { u: { x: Math.cos(r), y: Math.sin(r) }, v: { x: -Math.sin(r), y: Math.cos(r) } };
}

export function frameCorners(f: Frame): Pt[] {
  const { u, v } = axes(f);
  const hw = f.w / 2,
    hh = f.h / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => ({ x: f.cx + u.x * hw * sx + v.x * hh * sy, y: f.cy + u.y * hw * sx + v.y * hh * sy }));
}

export function handlePositions(f: Frame, zoom: number): Partial<Record<HandleId, Pt>> {
  const { u, v } = axes(f);
  const out: Partial<Record<HandleId, Pt>> = {};
  for (const [id, [sx, sy]] of Object.entries(SIGNS)) {
    out[id as HandleId] = { x: f.cx + (u.x * f.w * sx) / 2 + (v.x * f.h * sy) / 2, y: f.cy + (u.y * f.w * sx) / 2 + (v.y * f.h * sy) / 2 };
  }
  const off = f.h / 2 + 30 / zoom;
  out.rot = { x: f.cx + v.x * off, y: f.cy + v.y * off };
  return out;
}

export function allowedHandles(ls: Layer[]): HandleId[] {
  if (ls.length !== 1) return ['nw', 'ne', 'se', 'sw', 'rot'];
  const l = ls[0];
  if (l.type === 'text') return Math.abs(l.curve) >= 1 ? ['nw', 'ne', 'se', 'sw', 'rot'] : ['nw', 'ne', 'se', 'sw', 'e', 'w', 'rot'];
  return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
}

export function hitHandle(f: Frame, p: Pt, zoom: number, allowed: HandleId[]): HandleId | null {
  const pos = handlePositions(f, zoom);
  const r = 9 / zoom;
  // Small boxes: prefer corners so the box can still be grown.
  for (const id of allowed) {
    const hp = pos[id];
    if (hp && Math.abs(hp.x - p.x) <= r && Math.abs(hp.y - p.y) <= r) return id;
  }
  return null;
}

export function pointInFrame(f: Frame, p: Pt): boolean {
  const lp = rotatePoint(p, { x: f.cx, y: f.cy }, -f.rot);
  return Math.abs(lp.x - f.cx) <= f.w / 2 && Math.abs(lp.y - f.cy) <= f.h / 2;
}

/** Cursor for a resize handle, rotated with the frame. */
export function handleCursor(h: HandleId, rot: number): string {
  if (h === 'rot') return 'grab';
  const base: Record<string, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const a = (((base[h] + rot) % 180) + 180) % 180;
  const names = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  return names[Math.round(a / 45) % 4];
}

/** Resizes a single layer by dragging a handle to `p` (document coordinates). */
export function resizeLayer(orig: Layer, h: Exclude<HandleId, 'rot'>, p: Pt, mods: { shift: boolean; alt: boolean }): Layer {
  const f = frameOfLayer(orig);
  const { u, v } = axes(f);
  const [hx, hy] = SIGNS[h];
  const corner = hx !== 0 && hy !== 0;
  const proportional = corner && (orig.type === 'text' || !mods.shift);
  const c = { x: f.cx, y: f.cy };
  const A = mods.alt ? c : { x: c.x - (hx * f.w * u.x) / 2 - (hy * f.h * v.x) / 2, y: c.y - (hx * f.w * u.y) / 2 - (hy * f.h * v.y) / 2 };
  const rel = { x: p.x - A.x, y: p.y - A.y };
  const factor = mods.alt ? 2 : 1;
  let W = f.w,
    H = f.h;
  if (proportional) {
    const d = { x: ((hx * f.w * u.x + hy * f.h * v.x) / 2) * (mods.alt ? 1 : 2), y: ((hx * f.w * u.y + hy * f.h * v.y) / 2) * (mods.alt ? 1 : 2) };
    const k = Math.max(0.01, (rel.x * d.x + rel.y * d.y) / (d.x * d.x + d.y * d.y || 1));
    W = Math.max(2, f.w * k);
    H = Math.max(2, f.h * k);
  } else {
    if (hx) W = Math.max(2, (rel.x * u.x + rel.y * u.y) * hx * factor);
    if (hy) H = Math.max(2, (rel.x * v.x + rel.y * v.y) * hy * factor);
  }
  const nc = mods.alt ? c : { x: A.x + (hx * W * u.x) / 2 + (hy * H * v.x) / 2, y: A.y + (hx * W * u.y) / 2 + (hy * H * v.y) / 2 };
  const { w, h: lh } = layerSize(orig);
  switch (orig.type) {
    case 'raster':
      return { ...orig, x: nc.x, y: nc.y, scaleX: (Math.sign(orig.scaleX) || 1) * (W / w), scaleY: (Math.sign(orig.scaleY) || 1) * (H / lh) };
    case 'shape':
      return { ...orig, x: nc.x, y: nc.y, w: W / Math.abs(orig.scaleX), h: H / Math.abs(orig.scaleY) };
    case 'text': {
      if (corner) {
        const k = W / f.w;
        return {
          ...orig,
          x: nc.x,
          y: nc.y,
          size: Math.max(1, orig.size * k),
          width: orig.width * k,
          letterSpacing: orig.letterSpacing * k,
          outline: orig.outline ? { ...orig.outline, width: orig.outline.width * k } : orig.outline,
          background: orig.background ? { ...orig.background, padding: orig.background.padding * k, radius: orig.background.radius * k } : orig.background,
        };
      }
      // Side handles change the wrap width; keep the left/right edge anchored.
      const width = Math.max(orig.size * 0.6, W / Math.abs(orig.scaleX));
      const realW = width * Math.abs(orig.scaleX);
      const cx = mods.alt ? c.x : A.x + (hx * realW * u.x) / 2;
      const cy = mods.alt ? c.y : A.y + (hx * realW * u.y) / 2;
      return { ...orig, width, x: cx, y: cy };
    }
  }
}

/** Uniformly scales several layers around an anchor. */
export function scaleLayers(origs: Layer[], frame: Frame, h: Exclude<HandleId, 'rot'>, p: Pt, alt: boolean): Layer[] {
  const [hx, hy] = SIGNS[h];
  const A = alt ? { x: frame.cx, y: frame.cy } : { x: frame.cx - (hx * frame.w) / 2, y: frame.cy - (hy * frame.h) / 2 };
  const d = { x: (hx * frame.w) / (alt ? 2 : 1), y: (hy * frame.h) / (alt ? 2 : 1) };
  const rel = { x: p.x - A.x, y: p.y - A.y };
  const k = Math.max(0.01, (rel.x * d.x + rel.y * d.y) / (d.x * d.x + d.y * d.y || 1));
  return origs.map((l) => {
    const x = A.x + (l.x - A.x) * k,
      y = A.y + (l.y - A.y) * k;
    if (l.type === 'raster') return { ...l, x, y, scaleX: l.scaleX * k, scaleY: l.scaleY * k };
    if (l.type === 'shape') return { ...l, x, y, w: l.w * k, h: l.h * k, strokeWidth: l.strokeWidth * k, radius: l.radius * k };
    return { ...l, x, y, size: l.size * k, width: l.width * k, letterSpacing: l.letterSpacing * k };
  });
}

export function rotateLayers(origs: Layer[], center: Pt, delta: number): Layer[] {
  return origs.map((l) => {
    const c = rotatePoint({ x: l.x, y: l.y }, center, delta);
    return { ...l, x: c.x, y: c.y, rotation: (((l.rotation + delta) % 360) + 360) % 360 };
  });
}

/* ---------------------------------- Snapping --------------------------------- */

export interface Guides {
  x: number[];
  y: number[];
}

export function snapTargets(others: Layer[], docW: number, docH: number) {
  const xs = [0, docW / 2, docW];
  const ys = [0, docH / 2, docH];
  for (const l of others) {
    if (!l.visible) continue;
    const b = layerBounds(l);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

export function snapBox(box: Rect, targets: { xs: number[]; ys: number[] }, threshold: number) {
  const candX = [box.x, box.x + box.w / 2, box.x + box.w];
  const candY = [box.y, box.y + box.h / 2, box.y + box.h];
  let bestX: { d: number; t: number } | null = null;
  let bestY: { d: number; t: number } | null = null;
  for (const c of candX)
    for (const t of targets.xs) {
      const d = t - c;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, t };
    }
  for (const c of candY)
    for (const t of targets.ys) {
      const d = t - c;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, t };
    }
  const dx = bestX ? bestX.d : 0;
  const dy = bestY ? bestY.d : 0;
  const guides: Guides = { x: [], y: [] };
  // Collect every target line the snapped box now touches.
  const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  if (bestX)
    for (const c of [moved.x, moved.x + moved.w / 2, moved.x + moved.w])
      for (const t of targets.xs) if (Math.abs(t - c) < 0.5 && !guides.x.includes(t)) guides.x.push(t);
  if (bestY)
    for (const c of [moved.y, moved.y + moved.h / 2, moved.y + moved.h])
      for (const t of targets.ys) if (Math.abs(t - c) < 0.5 && !guides.y.includes(t)) guides.y.push(t);
  return { dx, dy, guides };
}
