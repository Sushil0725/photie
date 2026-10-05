import type { ShapeKind } from './types';

export interface ShapeOpts {
  radius?: number;
  sides?: number;
  inner?: number;
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  rtriangle: 'Right Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star: 'Star',
  star4: 'Sparkle',
  heart: 'Heart',
  arrow: 'Arrow',
  chevron: 'Chevron',
  cross: 'Cross',
  speech: 'Speech Bubble',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  ring: 'Ring',
  moon: 'Moon',
  line: 'Line',
  arrowline: 'Arrow Line',
  blob: 'Blob',
  icon: 'Icon',
};

/** Shapes that are drawn as strokes only. */
export const isLineShape = (k: ShapeKind) => k === 'line' || k === 'arrowline';

function polygon(p: Path2D, w: number, h: number, sides: number, rotate = -Math.PI / 2) {
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i / sides) * Math.PI * 2;
    const x = w / 2 + (Math.cos(a) * w) / 2;
    const y = h / 2 + (Math.sin(a) * h) / 2;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
}

function star(p: Path2D, w: number, h: number, points: number, inner: number) {
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : inner;
    const x = w / 2 + (Math.cos(a) * w * r) / 2;
    const y = h / 2 + (Math.sin(a) * h * r) / 2;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
}

export function roundRect(p: Path2D | CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.arcTo(x + w, y, x + w, y + rr, rr);
  p.lineTo(x + w, y + h - rr);
  p.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  p.lineTo(x + rr, y + h);
  p.arcTo(x, y + h, x, y + h - rr, rr);
  p.lineTo(x, y + rr);
  p.arcTo(x, y, x + rr, y, rr);
  p.closePath();
}

export function shapePath(kind: ShapeKind, w: number, h: number, o: ShapeOpts = {}): Path2D {
  const p = new Path2D();
  switch (kind) {
    case 'rect':
      if (o.radius) roundRect(p, 0, 0, w, h, o.radius);
      else p.rect(0, 0, w, h);
      break;
    case 'ellipse':
      p.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      p.moveTo(w / 2, 0);
      p.lineTo(w, h);
      p.lineTo(0, h);
      p.closePath();
      break;
    case 'rtriangle':
      p.moveTo(0, 0);
      p.lineTo(w, h);
      p.lineTo(0, h);
      p.closePath();
      break;
    case 'diamond':
      p.moveTo(w / 2, 0);
      p.lineTo(w, h / 2);
      p.lineTo(w / 2, h);
      p.lineTo(0, h / 2);
      p.closePath();
      break;
    case 'pentagon':
      polygon(p, w, h, 5);
      break;
    case 'hexagon':
      polygon(p, w, h, 6, 0);
      break;
    case 'octagon':
      polygon(p, w, h, 8, Math.PI / 8);
      break;
    case 'star':
      star(p, w, h, o.sides || 5, o.inner ?? 0.45);
      break;
    case 'star4':
      star(p, w, h, 4, o.inner ?? 0.3);
      break;
    case 'heart': {
      p.moveTo(w / 2, h * 0.28);
      p.bezierCurveTo(w * 0.5, h * 0.05, w * 0.0, h * 0.0, 0, h * 0.32);
      p.bezierCurveTo(0, h * 0.6, w * 0.3, h * 0.75, w / 2, h);
      p.bezierCurveTo(w * 0.7, h * 0.75, w, h * 0.6, w, h * 0.32);
      p.bezierCurveTo(w, h * 0.0, w * 0.5, h * 0.05, w / 2, h * 0.28);
      p.closePath();
      break;
    }
    case 'arrow': {
      const t = h * 0.3;
      const head = Math.min(w * 0.45, h * 0.9);
      p.moveTo(0, h / 2 - t);
      p.lineTo(w - head, h / 2 - t);
      p.lineTo(w - head, 0);
      p.lineTo(w, h / 2);
      p.lineTo(w - head, h);
      p.lineTo(w - head, h / 2 + t);
      p.lineTo(0, h / 2 + t);
      p.closePath();
      break;
    }
    case 'chevron': {
      const d = Math.min(w * 0.4, h * 0.5);
      p.moveTo(0, 0);
      p.lineTo(w - d, 0);
      p.lineTo(w, h / 2);
      p.lineTo(w - d, h);
      p.lineTo(0, h);
      p.lineTo(d, h / 2);
      p.closePath();
      break;
    }
    case 'cross': {
      const tx = w / 3;
      const ty = h / 3;
      p.moveTo(tx, 0);
      p.lineTo(w - tx, 0);
      p.lineTo(w - tx, ty);
      p.lineTo(w, ty);
      p.lineTo(w, h - ty);
      p.lineTo(w - tx, h - ty);
      p.lineTo(w - tx, h);
      p.lineTo(tx, h);
      p.lineTo(tx, h - ty);
      p.lineTo(0, h - ty);
      p.lineTo(0, ty);
      p.lineTo(tx, ty);
      p.closePath();
      break;
    }
    case 'speech': {
      const bh = h * 0.78;
      const r = Math.min(o.radius ?? Math.min(w, bh) * 0.18, w / 2, bh / 2);
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.arcTo(w, 0, w, r, r);
      p.lineTo(w, bh - r);
      p.arcTo(w, bh, w - r, bh, r);
      p.lineTo(w * 0.42, bh);
      p.lineTo(w * 0.2, h);
      p.lineTo(w * 0.24, bh);
      p.lineTo(r, bh);
      p.arcTo(0, bh, 0, bh - r, r);
      p.lineTo(0, r);
      p.arcTo(0, 0, r, 0, r);
      p.closePath();
      break;
    }
    case 'parallelogram': {
      const d = w * 0.25;
      p.moveTo(d, 0);
      p.lineTo(w, 0);
      p.lineTo(w - d, h);
      p.lineTo(0, h);
      p.closePath();
      break;
    }
    case 'trapezoid': {
      const d = w * 0.2;
      p.moveTo(d, 0);
      p.lineTo(w - d, 0);
      p.lineTo(w, h);
      p.lineTo(0, h);
      p.closePath();
      break;
    }
    case 'ring': {
      const inner = o.inner ?? 0.6;
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      p.moveTo(w / 2 + (w / 2) * inner, h / 2);
      p.ellipse(w / 2, h / 2, (w / 2) * inner, (h / 2) * inner, 0, 0, Math.PI * 2, true);
      break;
    }
    case 'moon': {
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 0.5, Math.PI * 1.5);
      p.ellipse(w / 2, h / 2, w * 0.18, h / 2, 0, Math.PI * 1.5, Math.PI * 0.5, true);
      p.closePath();
      break;
    }
    case 'blob': {
      const pts = [
        [0.5, 0.0],
        [0.88, 0.12],
        [1.0, 0.5],
        [0.82, 0.9],
        [0.42, 1.0],
        [0.06, 0.78],
        [0.02, 0.3],
      ].map(([x, y]) => [x * w, y * h]);
      const n = pts.length;
      const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const start = mid(pts[n - 1], pts[0]);
      p.moveTo(start[0], start[1]);
      for (let i = 0; i < n; i++) {
        const c = pts[i];
        const m = mid(c, pts[(i + 1) % n]);
        p.quadraticCurveTo(c[0], c[1], m[0], m[1]);
      }
      p.closePath();
      break;
    }
    case 'icon':
      p.rect(0, 0, w, h);
      break;
    case 'line':
      p.moveTo(0, h / 2);
      p.lineTo(w, h / 2);
      break;
    case 'arrowline': {
      const head = Math.min(w * 0.3, Math.max(14, h * 0.9));
      p.moveTo(0, h / 2);
      p.lineTo(w, h / 2);
      p.moveTo(w - head, h / 2 - head * 0.6);
      p.lineTo(w, h / 2);
      p.lineTo(w - head, h / 2 + head * 0.6);
      break;
    }
  }
  return p;
}
