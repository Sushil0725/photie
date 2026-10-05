import { gaussianBlur, unsharpMask } from './filters';
import { inpaint } from './inpaint';
import type { Pt } from './geometry';
import type { Rect } from './types';
import { clamp, cloneCanvas, createCanvas, ctx2d, parseColor, rgbToHsl, hslToRgb } from './util';

export type PaintMode = 'paint' | 'erase' | 'mask-reveal' | 'mask-hide';

export interface BrushSettings {
  size: number;
  hardness: number; // 0..1
  opacity: number; // 0..1
  flow: number; // 0..1
  spacing: number; // fraction of size
  color: string;
  pencil?: boolean;
}

/* ------------------------------- Dab stamps -------------------------------- */

const stampCache = new Map<string, HTMLCanvasElement>();

export function getStamp(size: number, hardness: number, color: string, aliased = false): HTMLCanvasElement {
  const s = Math.max(1, Math.ceil(size));
  const key = `${s}|${hardness.toFixed(2)}|${color}|${aliased}`;
  let c = stampCache.get(key);
  if (c) return c;
  if (stampCache.size > 64) stampCache.clear();
  c = createCanvas(s, s);
  const ctx = ctx2d(c);
  const r = s / 2;
  if (aliased) {
    const { r: cr, g: cg, b: cb } = parseColor(color);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = x + 0.5 - r,
          dy = y + 0.5 - r;
        if (dx * dx + dy * dy <= r * r || s <= 2) {
          const i = (y * s + x) * 4;
          img.data[i] = cr;
          img.data[i + 1] = cg;
          img.data[i + 2] = cb;
          img.data[i + 3] = 255;
        }
      }
    ctx.putImageData(img, 0, 0);
  } else {
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    const { r: cr, g: cg, b: cb } = parseColor(color);
    const solid = `rgba(${cr},${cg},${cb},1)`;
    const clear = `rgba(${cr},${cg},${cb},0)`;
    const hard = clamp(hardness, 0, 0.99);
    g.addColorStop(0, solid);
    g.addColorStop(hard, solid);
    // Smooth falloff with a few intermediate stops (approximate gaussian shoulder).
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const a = Math.pow(1 - t, 2) * (1 - t * 0.3);
      g.addColorStop(hard + (1 - hard) * t, `rgba(${cr},${cg},${cb},${a.toFixed(3)})`);
    }
    g.addColorStop(1, clear);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  stampCache.set(key, c);
  return c;
}

function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function clipRect(r: Rect, w: number, h: number): Rect | null {
  const x = Math.max(0, Math.floor(r.x)),
    y = Math.max(0, Math.floor(r.y));
  const x2 = Math.min(w, Math.ceil(r.x + r.w)),
    y2 = Math.min(h, Math.ceil(r.y + r.h));
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

let regionTmp: HTMLCanvasElement | null = null;
function tmpCanvas(w: number, h: number) {
  if (!regionTmp || regionTmp.width < w || regionTmp.height < h) {
    regionTmp = createCanvas(Math.max(w, regionTmp?.width || 0), Math.max(h, regionTmp?.height || 0));
  }
  const ctx = ctx2d(regionTmp);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return { c: regionTmp, ctx };
}

/* ------------------------------ Stroke session ------------------------------ */

export type ToolKind =
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'clone'
  | 'heal'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'dodge'
  | 'burn'
  | 'sponge';

export interface StrokeConfig {
  tool: ToolKind;
  mode: PaintMode;
  brush: BrushSettings;
  /** Document -> target pixel transform. */
  toLocal: DOMMatrix;
  /** Uniform scale doc px -> target px (for brush size). */
  localScale: number;
  /** Selection mask already projected into target space. */
  selMask: HTMLCanvasElement | null;
  /** Clone: offset from destination to source in target pixels. */
  cloneOffset?: Pt;
  /** Strength for smudge/blur/sharpen/dodge/burn/sponge (0..1). */
  strength?: number;
  /** Dodge/burn range. */
  range?: 'shadows' | 'midtones' | 'highlights';
  /** Sponge: saturate or desaturate. */
  spongeMode?: 'saturate' | 'desaturate';
  usePressure?: boolean;
}

export class Stroke {
  readonly target: HTMLCanvasElement;
  readonly base: HTMLCanvasElement;
  private buffer: HTMLCanvasElement | null = null;
  private last: { x: number; y: number; p: number } | null = null;
  private carry = 0;
  private dirty: Rect | null = null;
  private smudgeBuf: HTMLCanvasElement | null = null;
  touched: Rect | null = null;

  constructor(target: HTMLCanvasElement, readonly cfg: StrokeConfig) {
    this.target = target;
    this.base = cloneCanvas(target);
    if (this.usesBuffer) this.buffer = createCanvas(target.width, target.height);
  }

  private get usesBuffer() {
    const t = this.cfg.tool;
    return t === 'brush' || t === 'pencil' || t === 'eraser' || t === 'clone' || t === 'heal';
  }

  private size(p: number) {
    const s = this.cfg.brush.size * this.cfg.localScale;
    return Math.max(1, this.cfg.usePressure ? s * (0.15 + 0.85 * p) : s);
  }

  /** Adds a point in document coordinates. */
  add(docPt: Pt, pressure = 0.5) {
    const m = this.cfg.toLocal;
    const x = m.a * docPt.x + m.c * docPt.y + m.e;
    const y = m.b * docPt.x + m.d * docPt.y + m.f;
    const p = this.cfg.usePressure ? pressure : 1;
    if (!this.last) {
      this.dab(x, y, p);
      this.last = { x, y, p };
      this.flush();
      return;
    }
    const lx = this.last.x,
      ly = this.last.y,
      lp = this.last.p;
    const d = Math.hypot(x - lx, y - ly);
    const spacing = Math.max(0.5, this.size(Math.max(p, lp)) * Math.max(0.02, this.cfg.brush.spacing));
    let t = spacing - this.carry;
    while (t <= d) {
      const k = t / d;
      this.dab(lx + (x - lx) * k, ly + (y - ly) * k, lp + (p - lp) * k);
      t += spacing;
    }
    this.carry = d - (t - spacing);
    this.last = { x, y, p };
    this.flush();
  }

  private dab(x: number, y: number, p: number) {
    const size = this.size(p);
    const r = size / 2;
    const rect = { x: x - r - 1, y: y - r - 1, w: size + 2, h: size + 2 };
    const cl = clipRect(rect, this.target.width, this.target.height);
    if (!cl) return;
    this.dirty = unionRect(this.dirty, cl);
    this.touched = unionRect(this.touched, cl);
    const b = this.cfg.brush;
    switch (this.cfg.tool) {
      case 'brush':
      case 'eraser':
      case 'heal': {
        const color = this.cfg.tool === 'brush' && this.cfg.mode === 'paint' ? b.color : '#000000';
        const stamp = getStamp(Math.max(size, 2), this.cfg.tool === 'heal' ? 0.6 : b.hardness, color);
        const bctx = ctx2d(this.buffer!);
        bctx.globalAlpha = this.cfg.tool === 'heal' ? 1 : b.flow;
        bctx.drawImage(stamp, x - r, y - r, size, size);
        break;
      }
      case 'pencil': {
        const color = this.cfg.mode === 'paint' ? b.color : '#000000';
        const s = Math.max(1, Math.round(size));
        const stamp = getStamp(s, 1, color, true);
        const bctx = ctx2d(this.buffer!);
        bctx.imageSmoothingEnabled = false;
        bctx.globalAlpha = 1;
        bctx.drawImage(stamp, Math.round(x - s / 2), Math.round(y - s / 2));
        break;
      }
      case 'clone': {
        const off = this.cfg.cloneOffset || { x: 0, y: 0 };
        const s = Math.max(2, Math.ceil(size));
        const { c, ctx } = tmpCanvas(s, s);
        ctx.drawImage(this.base, x - r + off.x, y - r + off.y, s, s, 0, 0, s, s);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(getStamp(s, b.hardness, '#000'), 0, 0);
        const bctx = ctx2d(this.buffer!);
        bctx.globalAlpha = b.flow;
        bctx.drawImage(c, 0, 0, s, s, x - r, y - r, s, s);
        break;
      }
      case 'smudge':
        this.smudgeDab(x, y, size);
        break;
      case 'blur':
      case 'sharpen':
        this.focusDab(x, y, size);
        break;
      case 'dodge':
      case 'burn':
      case 'sponge':
        this.toneDab(x, y, size);
        break;
    }
  }

  private smudgeDab(x: number, y: number, size: number) {
    const s = Math.max(2, Math.ceil(size));
    const r = s / 2;
    const strength = clamp(this.cfg.strength ?? 0.5, 0, 0.98);
    const tctx = ctx2d(this.target);
    if (!this.smudgeBuf) {
      this.smudgeBuf = createCanvas(s, s);
      ctx2d(this.smudgeBuf).drawImage(this.target, x - r, y - r, s, s, 0, 0, s, s);
      return;
    }
    if (this.smudgeBuf.width !== s) {
      const nb = createCanvas(s, s);
      ctx2d(nb).drawImage(this.smudgeBuf, 0, 0, s, s);
      this.smudgeBuf = nb;
    }
    // Paint the carried color at the new spot through a soft mask.
    const { c, ctx } = tmpCanvas(s, s);
    ctx.drawImage(this.smudgeBuf, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(getStamp(s, this.cfg.brush.hardness * 0.6, '#000'), 0, 0);
    tctx.save();
    tctx.globalAlpha = strength;
    tctx.drawImage(c, 0, 0, s, s, x - r, y - r, s, s);
    tctx.restore();
    // Pick up some of the new color.
    const bctx = ctx2d(this.smudgeBuf);
    bctx.globalAlpha = 1 - strength;
    bctx.drawImage(this.target, x - r, y - r, s, s, 0, 0, s, s);
    bctx.globalAlpha = 1;
  }

  private focusDab(x: number, y: number, size: number) {
    const s = Math.max(4, Math.ceil(size));
    const r = s / 2;
    const pad = 4;
    const rx = Math.floor(x - r - pad),
      ry = Math.floor(y - r - pad);
    const W = s + pad * 2,
      H = s + pad * 2;
    const cl = clipRect({ x: rx, y: ry, w: W, h: H }, this.target.width, this.target.height);
    if (!cl) return;
    const tctx = ctx2d(this.target, true);
    const img = tctx.getImageData(cl.x, cl.y, cl.w, cl.h);
    const strength = this.cfg.strength ?? 0.5;
    if (this.cfg.tool === 'blur') gaussianBlur(img, 2 + strength * 4);
    else unsharpMask(img, 40 + strength * 120, 1.2, 0);
    const proc = createCanvas(cl.w, cl.h);
    ctx2d(proc).putImageData(img, 0, 0);
    const { c, ctx } = tmpCanvas(cl.w, cl.h);
    ctx.drawImage(proc, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(getStamp(s, this.cfg.brush.hardness * 0.5, '#000'), x - r - cl.x, y - r - cl.y, s, s);
    tctx.save();
    tctx.globalAlpha = 0.5 + strength * 0.5;
    tctx.drawImage(c, 0, 0, cl.w, cl.h, cl.x, cl.y, cl.w, cl.h);
    tctx.restore();
  }

  private toneDab(x: number, y: number, size: number) {
    const s = Math.max(2, Math.ceil(size));
    const r = s / 2;
    const cl = clipRect({ x: x - r, y: y - r, w: s, h: s }, this.target.width, this.target.height);
    if (!cl) return;
    const tctx = ctx2d(this.target, true);
    const img = tctx.getImageData(cl.x, cl.y, cl.w, cl.h);
    const d = img.data;
    const k = (this.cfg.strength ?? 0.5) * 0.12;
    const hard = this.cfg.brush.hardness;
    const range = this.cfg.range || 'midtones';
    const tool = this.cfg.tool;
    for (let py = 0; py < cl.h; py++) {
      for (let px = 0; px < cl.w; px++) {
        const dx = cl.x + px + 0.5 - x,
          dy = cl.y + py + 0.5 - y;
        const dist = Math.hypot(dx, dy) / r;
        if (dist >= 1) continue;
        const fall = dist <= hard ? 1 : 1 - (dist - hard) / (1 - hard);
        const i = (py * cl.w + px) * 4;
        if (d[i + 3] === 0) continue;
        const amt = k * fall;
        if (tool === 'sponge') {
          const hsl = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          hsl.s = clamp(hsl.s + (this.cfg.spongeMode === 'desaturate' ? -amt * 2 : amt * 2) * (1 - hsl.s * 0.5), 0, 1);
          const c = hslToRgb(hsl.h, hsl.s, hsl.l);
          d[i] = c.r;
          d[i + 1] = c.g;
          d[i + 2] = c.b;
          continue;
        }
        for (let ch = 0; ch < 3; ch++) {
          const v = d[i + ch] / 255;
          let wgt = 1;
          if (range === 'shadows') wgt = 1 - v;
          else if (range === 'highlights') wgt = v;
          else wgt = 1 - Math.abs(v - 0.5) * 2;
          wgt = 0.25 + wgt * 0.75;
          const nv = tool === 'dodge' ? v + (1 - v) * amt * wgt * 2 : v - v * amt * wgt * 2;
          d[i + ch] = clamp(nv * 255, 0, 255);
        }
      }
    }
    tctx.putImageData(img, cl.x, cl.y);
  }

  /** Recomposites the dirty region of the target from base + stroke buffer. */
  private flush() {
    if (!this.dirty || !this.buffer) {
      this.dirty = null;
      return;
    }
    const r = this.dirty;
    this.dirty = null;
    const tctx = ctx2d(this.target);
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = 'source-over';
    // Note: 'copy' is unbounded and would wipe the rest of the canvas, so clear + draw instead.
    tctx.clearRect(r.x, r.y, r.w, r.h);
    tctx.drawImage(this.base, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    let src: HTMLCanvasElement = this.buffer;
    let sx = r.x,
      sy = r.y;
    if (this.cfg.selMask) {
      const { c, ctx } = tmpCanvas(r.w, r.h);
      ctx.drawImage(this.buffer, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.cfg.selMask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      src = c;
      sx = 0;
      sy = 0;
    }
    if (this.cfg.tool === 'heal') {
      // Preview the area to be healed as a translucent overlay.
      tctx.globalAlpha = 0.45;
      const { c, ctx } = tmpCanvas(r.w, r.h);
      ctx.drawImage(src, sx, sy, r.w, r.h, 0, 0, r.w, r.h);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#ff3b6b';
      ctx.fillRect(0, 0, r.w, r.h);
      tctx.drawImage(c, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
    } else {
      tctx.globalAlpha = this.cfg.brush.opacity;
      tctx.globalCompositeOperation = this.cfg.mode === 'erase' || this.cfg.mode === 'mask-hide' ? 'destination-out' : 'source-over';
      tctx.drawImage(src, sx, sy, r.w, r.h, r.x, r.y, r.w, r.h);
    }
    tctx.restore();
  }

  /** Finishes the stroke; returns false when nothing changed. */
  end(): boolean {
    if (!this.touched) return false;
    if (this.cfg.tool === 'heal' && this.buffer) {
      const pad = Math.ceil(this.cfg.brush.size * this.cfg.localScale * 1.5) + 12;
      const region = clipRect(
        { x: this.touched.x - pad, y: this.touched.y - pad, w: this.touched.w + pad * 2, h: this.touched.h + pad * 2 },
        this.target.width,
        this.target.height,
      );
      const tctx = ctx2d(this.target, true);
      tctx.globalCompositeOperation = 'copy';
      tctx.drawImage(this.base, 0, 0);
      tctx.globalCompositeOperation = 'source-over';
      if (region) {
        const img = ctx2d(this.base, true).getImageData(region.x, region.y, region.w, region.h);
        let maskSrc: HTMLCanvasElement = this.buffer;
        if (this.cfg.selMask) {
          maskSrc = cloneCanvas(this.buffer);
          const mc = ctx2d(maskSrc);
          mc.globalCompositeOperation = 'destination-in';
          mc.drawImage(this.cfg.selMask, 0, 0);
        }
        const maskData = ctx2d(maskSrc, true).getImageData(region.x, region.y, region.w, region.h);
        const mask = new Uint8Array(region.w * region.h);
        for (let i = 0; i < mask.length; i++) mask[i] = maskData.data[i * 4 + 3] > 20 ? 1 : 0;
        inpaint(img, mask, Math.max(3, Math.min(6, Math.round(this.cfg.brush.size * this.cfg.localScale * 0.12))));
        tctx.putImageData(img, region.x, region.y);
      }
    } else if (!this.usesBuffer && this.cfg.selMask) {
      // Direct-edit tools: restore pixels outside the selection.
      const out = cloneCanvas(this.base);
      const octx = ctx2d(out);
      octx.globalCompositeOperation = 'destination-out';
      octx.drawImage(this.cfg.selMask, 0, 0);
      const inside = cloneCanvas(this.target);
      const ictx = ctx2d(inside);
      ictx.globalCompositeOperation = 'destination-in';
      ictx.drawImage(this.cfg.selMask, 0, 0);
      const tctx = ctx2d(this.target);
      tctx.globalCompositeOperation = 'copy';
      tctx.drawImage(out, 0, 0);
      tctx.globalCompositeOperation = 'lighter';
      tctx.drawImage(inside, 0, 0);
      tctx.globalCompositeOperation = 'source-over';
    }
    return true;
  }

  /** Restores the target to its state before the stroke. */
  cancel() {
    const tctx = ctx2d(this.target);
    tctx.globalCompositeOperation = 'copy';
    tctx.drawImage(this.base, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
  }
}
