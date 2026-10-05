import { fillStyle } from './fill';
import { roundRect } from './shapes';
import type { TextLayer } from './types';

let measureCtx: CanvasRenderingContext2D | null = null;
const mctx = () => (measureCtx ||= document.createElement('canvas').getContext('2d')!);

export const supportsLetterSpacing =
  typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Incremented whenever web fonts finish loading so cached layouts are recomputed. */
let fontEpoch = 0;
export const bumpFontEpoch = () => {
  fontEpoch++;
};

export function fontString(t: Pick<TextLayer, 'italic' | 'weight' | 'size' | 'font'>, size = t.size) {
  return `${t.italic ? 'italic ' : ''}${t.weight} ${size}px "${t.font}", "Inter", system-ui, sans-serif`;
}

export function applyFont(ctx: CanvasRenderingContext2D, t: TextLayer) {
  ctx.font = fontString(t);
  if (supportsLetterSpacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${t.letterSpacing}px`;
}

function resetSpacing(ctx: CanvasRenderingContext2D) {
  if (supportsLetterSpacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

function measure(ctx: CanvasRenderingContext2D, s: string, spacing: number) {
  const w = ctx.measureText(s).width;
  return supportsLetterSpacing ? w : w + spacing * s.length;
}

export interface TextLine {
  text: string;
  width: number;
}

export interface CurvedChar {
  ch: string;
  angle: number;
  width: number;
}

export interface TextLayout {
  w: number;
  h: number;
  lineH: number;
  lines: TextLine[];
  curved?: {
    radius: number;
    cx: number;
    cy: number;
    dir: 1 | -1;
    chars: CurvedChar[];
  };
}

const cache = new WeakMap<TextLayer, { epoch: number; layout: TextLayout }>();

export const displayText = (t: TextLayer) => (t.uppercase ? t.text.toUpperCase() : t.text);

function wrapParagraph(ctx: CanvasRenderingContext2D, para: string, maxW: number, spacing: number): TextLine[] {
  if (!para) return [{ text: '', width: 0 }];
  const words = para.split(/(\s+)/);
  const lines: TextLine[] = [];
  let cur = '';
  const push = (s: string) => {
    const trimmed = s.replace(/\s+$/, '');
    lines.push({ text: trimmed, width: measure(ctx, trimmed, spacing) });
  };
  for (const word of words) {
    if (!word) continue;
    const next = cur + word;
    if (measure(ctx, next.replace(/\s+$/, ''), spacing) <= maxW || !cur.trim()) {
      // Break a single word that is wider than the box character by character.
      if (!cur.trim() && measure(ctx, word, spacing) > maxW && !/^\s+$/.test(word)) {
        let chunk = cur;
        for (const ch of word) {
          if (measure(ctx, chunk + ch, spacing) > maxW && chunk) {
            push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        cur = chunk;
      } else cur = next;
    } else {
      push(cur);
      cur = /^\s+$/.test(word) ? '' : word;
    }
  }
  push(cur);
  return lines;
}

export function layoutText(t: TextLayer): TextLayout {
  const hit = cache.get(t);
  if (hit && hit.epoch === fontEpoch) return hit.layout;
  const ctx = mctx();
  applyFont(ctx, t);
  const text = displayText(t);
  const lineH = t.size * t.lineHeight;
  let layout: TextLayout;

  if (Math.abs(t.curve) >= 1) {
    const line = text.replace(/\s*\n\s*/g, ' ');
    const chars: CurvedChar[] = [];
    let total = 0;
    for (const ch of line) {
      const w = measure(ctx, ch, t.letterSpacing);
      chars.push({ ch, angle: 0, width: w });
      total += w;
    }
    total = Math.max(total, 1);
    const theta = (Math.min(Math.abs(t.curve), 100) / 100) * Math.PI * 2 * 0.97;
    const radius = total / theta;
    let acc = 0;
    for (const c of chars) {
      c.angle = -theta / 2 + (acc + c.width / 2) / radius;
      acc += c.width;
    }
    const dir: 1 | -1 = t.curve > 0 ? 1 : -1;
    const hh = lineH / 2;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const a = -theta / 2 + (theta * i) / steps;
      for (const r of [radius - hh, radius + hh]) {
        const x = Math.sin(a) * r;
        const y = -Math.cos(a) * r * dir;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    layout = {
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
      lineH,
      lines: [{ text: line, width: total }],
      curved: { radius, cx: -minX, cy: -minY, dir, chars },
    };
  } else {
    const maxW = Math.max(t.width, t.size * 0.5);
    const lines: TextLine[] = [];
    for (const para of text.split('\n')) lines.push(...wrapParagraph(ctx, para, maxW, t.letterSpacing));
    layout = { w: Math.max(1, t.width), h: Math.max(lineH, lines.length * lineH), lineH, lines };
  }
  resetSpacing(ctx);
  cache.set(t, { epoch: fontEpoch, layout });
  return layout;
}

/** Natural (unwrapped) width of the text, used to size new text boxes. */
export function naturalTextWidth(t: TextLayer): number {
  const ctx = mctx();
  applyFont(ctx, t);
  let max = 0;
  for (const line of displayText(t).split('\n')) max = Math.max(max, measure(ctx, line, t.letterSpacing));
  resetSpacing(ctx);
  return Math.ceil(max + t.size * 0.15 + 2);
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  t: TextLayer,
  line: TextLine,
  x: number,
  y: number,
  mode: 'fill' | 'stroke',
) {
  if (supportsLetterSpacing || !t.letterSpacing) {
    if (mode === 'fill') ctx.fillText(line.text, x, y);
    else ctx.strokeText(line.text, x, y);
    return;
  }
  // Manual letter spacing for browsers without native support.
  let start = x;
  if (ctx.textAlign === 'center') start = x - line.width / 2;
  else if (ctx.textAlign === 'right') start = x - line.width;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of line.text) {
    if (mode === 'fill') ctx.fillText(ch, start, y);
    else ctx.strokeText(ch, start, y);
    start += ctx.measureText(ch).width + t.letterSpacing;
  }
  ctx.textAlign = align;
}

function lineStartX(t: TextLayer, layout: TextLayout, line: TextLine) {
  if (t.align === 'center') return (layout.w - line.width) / 2;
  if (t.align === 'right') return layout.w - line.width;
  return 0;
}

/** Draws a text layer into its local box (0,0)-(w,h). */
export function drawText(ctx: CanvasRenderingContext2D, t: TextLayer) {
  const layout = layoutText(t);
  ctx.save();
  applyFont(ctx, t);
  ctx.textBaseline = 'middle';
  const style = fillStyle(ctx, t.fill, 0, 0, layout.w, layout.h);

  if (t.background && !layout.curved) {
    const pad = t.background.padding;
    let minX = Infinity,
      maxX = -Infinity;
    for (const line of layout.lines) {
      const sx = lineStartX(t, layout, line);
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx + line.width);
    }
    if (!isFinite(minX)) {
      minX = 0;
      maxX = layout.w;
    }
    ctx.fillStyle = t.background.color;
    ctx.beginPath();
    roundRect(ctx, minX - pad, -pad * 0.6, maxX - minX + pad * 2, layout.h + pad * 1.2, t.background.radius);
    ctx.fill();
  }

  if (layout.curved) {
    const c = layout.curved;
    ctx.textAlign = 'center';
    for (const pass of ['stroke', 'fill'] as const) {
      if (pass === 'stroke' && !(t.outline && t.outline.width > 0)) continue;
      if (pass === 'stroke') {
        ctx.strokeStyle = t.outline!.color;
        ctx.lineWidth = t.outline!.width * 2;
        ctx.lineJoin = 'round';
      } else ctx.fillStyle = style;
      for (const ch of c.chars) {
        ctx.save();
        const x = c.cx + Math.sin(ch.angle) * c.radius;
        const y = c.cy - Math.cos(ch.angle) * c.radius * c.dir;
        ctx.translate(x, y);
        ctx.rotate(ch.angle * c.dir);
        if (pass === 'fill') ctx.fillText(ch.ch, 0, 0);
        else ctx.strokeText(ch.ch, 0, 0);
        ctx.restore();
      }
    }
    resetSpacing(ctx);
    ctx.restore();
    return;
  }

  let ax = 0;
  if (t.align === 'center') ax = layout.w / 2;
  else if (t.align === 'right') ax = layout.w;
  ctx.textAlign = t.align;

  if (t.outline && t.outline.width > 0) {
    ctx.strokeStyle = t.outline.color;
    ctx.lineWidth = t.outline.width * 2;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    layout.lines.forEach((line, i) => drawLine(ctx, t, line, ax, i * layout.lineH + layout.lineH / 2, 'stroke'));
  }
  ctx.fillStyle = style;
  layout.lines.forEach((line, i) => {
    const y = i * layout.lineH + layout.lineH / 2;
    drawLine(ctx, t, line, ax, y, 'fill');
    if ((t.underline || t.strike) && line.width > 0) {
      const sx = lineStartX(t, layout, line);
      const th = Math.max(1, t.size * 0.06);
      if (t.underline) ctx.fillRect(sx, y + t.size * 0.42, line.width, th);
      if (t.strike) ctx.fillRect(sx, y - th / 2 + t.size * 0.04, line.width, th);
    }
  });
  resetSpacing(ctx);
  ctx.restore();
}
