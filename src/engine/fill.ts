import type { Fill } from './types';

/** Creates a canvas fill style for a fill spanning the given box. */
export function fillStyle(
  ctx: CanvasRenderingContext2D,
  fill: Fill,
  x: number,
  y: number,
  w: number,
  h: number,
): string | CanvasGradient {
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linear') {
    const a = ((fill.angle - 90) * Math.PI) / 180;
    const cx = x + w / 2;
    const cy = y + h / 2;
    // Length of the gradient line so it covers the whole box at any angle (CSS semantics).
    const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    for (const s of fill.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
    return g;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.sqrt(w * w + h * h) / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const s of fill.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
  return g;
}

export function fillToCss(fill: Fill | null | undefined): string {
  if (!fill) return 'transparent';
  if (fill.type === 'solid') return fill.color;
  const stops = fill.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  if (fill.type === 'linear') return `linear-gradient(${fill.angle}deg, ${stops})`;
  return `radial-gradient(circle, ${stops})`;
}

export const solid = (color: string): Fill => ({ type: 'solid', color });

export const linear = (angle: number, ...colors: string[]): Fill => ({
  type: 'linear',
  angle,
  stops: colors.map((color, i) => ({ color, offset: colors.length === 1 ? 0 : i / (colors.length - 1) })),
});

export const radial = (...colors: string[]): Fill => ({
  type: 'radial',
  stops: colors.map((color, i) => ({ color, offset: colors.length === 1 ? 0 : i / (colors.length - 1) })),
});

/** First color of a fill, used for swatches and quick pickers. */
export const fillPrimary = (fill: Fill | null | undefined): string =>
  !fill ? 'transparent' : fill.type === 'solid' ? fill.color : fill.stops[0]?.color || '#000000';
