import { layerCorners } from '../../engine/geometry';
import { S } from '../../store/editor';
import { brushSizeForTool, ix, selectionFrame } from './tools';
import { allowedHandles, frameCorners, handlePositions, type HandleId } from './transform';

const ACCENT = '#7c5cff';

export function drawOverlay(ctx: CanvasRenderingContext2D, dpr: number, time: number) {
  const s = S();
  const doc = s.doc;
  if (!doc) return;
  const z = s.zoom;
  const px = s.panX,
    py = s.panY;
  const sx = (x: number) => x * z + px;
  const sy = (y: number) => y * z + py;
  const view = new DOMMatrix([z, 0, 0, z, px, py]);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Pixel grid at high zoom.
  if (z >= 10) {
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor(-px / z)),
      x1 = Math.min(doc.width, Math.ceil((s.viewport.w - px) / z));
    const y0 = Math.max(0, Math.floor(-py / z)),
      y1 = Math.min(doc.height, Math.ceil((s.viewport.h - py) / z));
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(Math.round(sx(x)) + 0.5, sy(y0));
      ctx.lineTo(Math.round(sx(x)) + 0.5, sy(y1));
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(sx(x0), Math.round(sy(y)) + 0.5);
      ctx.lineTo(sx(x1), Math.round(sy(y)) + 0.5);
    }
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // User grid.
  if (s.showGrid) {
    const step = gridStep(doc.width, doc.height);
    ctx.beginPath();
    for (let x = step; x < doc.width; x += step) {
      ctx.moveTo(Math.round(sx(x)) + 0.5, sy(0));
      ctx.lineTo(Math.round(sx(x)) + 0.5, sy(doc.height));
    }
    for (let y = step; y < doc.height; y += step) {
      ctx.moveTo(sx(0), Math.round(sy(y)) + 0.5);
      ctx.lineTo(sx(doc.width), Math.round(sy(y)) + 0.5);
    }
    ctx.strokeStyle = 'rgba(124,92,255,0.35)';
    ctx.stroke();
  }

  // Marching ants.
  if (s.selection) {
    const path = new Path2D();
    path.addPath(s.selection.outline, view);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.setLineDash([]);
    ctx.stroke(path);
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -Math.floor(time / 80) % 8;
    ctx.stroke(path);
    ctx.setLineDash([]);
  }

  // Selection brush preview.
  if (ix.selectBrushCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.setTransform(view.a * dpr, 0, 0, view.d * dpr, view.e * dpr, view.f * dpr);
    const tint = tinted(ix.selectBrushCanvas, '#ff3b6b');
    ctx.drawImage(tint, 0, 0);
    ctx.restore();
  }

  const tool = s.tool;
  const showFrames = tool === 'move' || tool === 'text' || tool === 'shape' || ix.ctrl;

  // Hover outline (Canva-style).
  if (showFrames && ix.hoverId && !ix.drag && !s.selectedIds.includes(ix.hoverId)) {
    const l = doc.layers.find((x) => x.id === ix.hoverId);
    if (l) {
      const c = layerCorners(l).map((q) => ({ x: sx(q.x), y: sy(q.y) }));
      ctx.beginPath();
      c.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Selected layers frame + handles.
  if (showFrames && !s.editingTextId) {
    const sf = selectionFrame();
    if (sf) {
      if (sf.layers.length > 1) {
        for (const l of sf.layers) {
          const c = layerCorners(l).map((q) => ({ x: sx(q.x), y: sy(q.y) }));
          ctx.beginPath();
          c.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.closePath();
          ctx.strokeStyle = 'rgba(124,92,255,0.6)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      const corners = frameCorners(sf.frame).map((q) => ({ x: sx(q.x), y: sy(q.y) }));
      ctx.beginPath();
      corners.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const locked = sf.layers.some((l) => l.locked);
      if (!locked && !(ix.drag && ix.drag.kind === 'move')) {
        const allowed = allowedHandles(sf.layers);
        const pos = handlePositions(sf.frame, z);
        const bottom = { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 };
        for (const id of allowed) {
          const hp = pos[id as HandleId]!;
          const x = sx(hp.x),
            y = sy(hp.y);
          if (id === 'rot') {
            ctx.beginPath();
            ctx.moveTo(bottom.x, bottom.y);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(124,92,255,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            drawRotateHandle(ctx, x, y);
            continue;
          }
          const isSide = id.length === 1;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((sf.frame.rot * Math.PI) / 180);
          ctx.beginPath();
          if (isSide) {
            const vertical = id === 'e' || id === 'w';
            const w = vertical ? 6 : 16,
              h = vertical ? 16 : 6;
            roundRectPath(ctx, -w / 2, -h / 2, w, h, 3);
          } else ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 3;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
      // Size badge while transforming.
      if (ix.drag && (ix.drag.kind === 'resize' || ix.drag.kind === 'rotate')) {
        const label =
          ix.drag.kind === 'rotate'
            ? `${Math.round(sf.frame.rot)}°`
            : `${Math.round(sf.frame.w)} × ${Math.round(sf.frame.h)}`;
        badge(ctx, (corners[2].x + corners[3].x) / 2, Math.max(corners[2].y, corners[3].y) + 54, label);
      }
    }
  }

  // Smart guides.
  if (ix.guides) {
    ctx.strokeStyle = '#ff2d92';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of ix.guides.x) {
      ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
      ctx.lineTo(Math.round(sx(x)) + 0.5, s.viewport.h);
    }
    for (const y of ix.guides.y) {
      ctx.moveTo(0, Math.round(sy(y)) + 0.5);
      ctx.lineTo(s.viewport.w, Math.round(sy(y)) + 0.5);
    }
    ctx.stroke();
  }

  // Rubber-band layer selection.
  if (ix.boxSelect) {
    const r = ix.boxSelect;
    ctx.fillStyle = 'rgba(124,92,255,0.08)';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.fillRect(sx(r.x), sy(r.y), r.w * z, r.h * z);
    ctx.strokeRect(sx(r.x) + 0.5, sy(r.y) + 0.5, r.w * z, r.h * z);
  }

  // Marquee / lasso previews.
  if (ix.marquee) {
    const r = ix.marquee.rect;
    ctx.beginPath();
    if (ix.marquee.ellipse) ctx.ellipse(sx(r.x + r.w / 2), sy(r.y + r.h / 2), Math.max(0.5, (r.w * z) / 2), Math.max(0.5, (r.h * z) / 2), 0, 0, Math.PI * 2);
    else ctx.rect(sx(r.x) + 0.5, sy(r.y) + 0.5, r.w * z, r.h * z);
    antsStroke(ctx, time);
    badge(ctx, sx(r.x + r.w) + 8, sy(r.y + r.h) + 18, `${Math.round(r.w)} × ${Math.round(r.h)}`, 'left');
  }
  if (ix.lasso && ix.lasso.length > 1) {
    ctx.beginPath();
    ix.lasso.forEach((q, i) => (i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y))));
    antsStroke(ctx, time);
  }
  if (ix.polygon) {
    ctx.beginPath();
    ix.polygon.forEach((q, i) => (i ? ctx.lineTo(sx(q.x), sy(q.y)) : ctx.moveTo(sx(q.x), sy(q.y))));
    if (ix.pointer) ctx.lineTo(ix.pointer.sx, ix.pointer.sy);
    antsStroke(ctx, time);
    const f = ix.polygon[0];
    ctx.beginPath();
    ctx.arc(sx(f.x), sy(f.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
  }

  // Text box being dragged out.
  if (ix.drag?.kind === 'textbox' && ix.pointer) {
    const a = ix.drag.start;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = ACCENT;
    ctx.strokeRect(sx(Math.min(a.x, ix.pointer.x)), sy(Math.min(a.y, ix.pointer.y)), Math.abs(ix.pointer.x - a.x) * z, Math.abs(ix.pointer.y - a.y) * z);
    ctx.setLineDash([]);
  }

  // Gradient line.
  if (ix.gradient) {
    const { a, b } = ix.gradient;
    ctx.beginPath();
    ctx.moveTo(sx(a.x), sy(a.y));
    ctx.lineTo(sx(b.x), sy(b.y));
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const q of [a, b]) {
      ctx.beginPath();
      ctx.arc(sx(q.x), sy(q.y), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Crop overlay.
  if (tool === 'crop') {
    const r = s.cropRect || { x: 0, y: 0, w: doc.width, h: doc.height };
    const x = sx(r.x),
      y = sy(r.y),
      w = r.w * z,
      h = r.h * z;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s.viewport.w, s.viewport.h);
    ctx.rect(x, y, w, h);
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(x + (w * i) / 3, y);
      ctx.lineTo(x + (w * i) / 3, y + h);
      ctx.moveTo(x, y + (h * i) / 3);
      ctx.lineTo(x + w, y + (h * i) / 3);
    }
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 4;
    const L = Math.min(18, w / 3, h / 3);
    const corners: [number, number, number, number][] = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x + w, y + h, -1, -1],
      [x, y + h, 1, -1],
    ];
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of corners) {
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
    }
    for (const [cx, cy] of [
      [x + w / 2, y],
      [x + w / 2, y + h],
    ]) {
      ctx.moveTo(cx - L / 2, cy);
      ctx.lineTo(cx + L / 2, cy);
    }
    for (const [cx, cy] of [
      [x, y + h / 2],
      [x + w, y + h / 2],
    ]) {
      ctx.moveTo(cx, cy - L / 2);
      ctx.lineTo(cx, cy + L / 2);
    }
    ctx.stroke();
    badge(ctx, x + w / 2, y + h + 22, `${Math.round(r.w)} × ${Math.round(r.h)}`);
    ctx.restore();
  }

  // Clone source marker.
  if (tool === 'clone' && s.cloneSource && ix.inside) {
    // Non-aligned strokes restart at the source point, so only follow the brush while painting.
    const anchor = ix.cloneAnchor && (s.opts.cloneAligned || ix.drag?.kind === 'stroke') ? ix.cloneAnchor : null;
    const src = anchor && ix.pointer ? { x: ix.pointer.x + anchor.x, y: ix.pointer.y + anchor.y } : s.cloneSource;
    const x = sx(src.x),
      y = sy(src.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    crosshair(ctx, x, y, 8);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    crosshair(ctx, x, y, 8);
  }

  // Brush cursor.
  const size = brushSizeForTool();
  if (size && ix.pointer && ix.inside && !ix.space && !ix.drag?.kind.startsWith('pan')) {
    const r = (size * z) / 2;
    const { sx: cx, sy: cy } = ix.pointer;
    if (r < 3) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      crosshair(ctx, cx, cy, 6);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      crosshair(ctx, cx, cy, 6);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, r - 1.2), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function gridStep(w: number, h: number) {
  const target = Math.max(w, h) / 12;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((x) => x >= target) || 1000;
}

function antsStroke(ctx: CanvasRenderingContext2D, time: number) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -Math.floor(time / 80) % 8;
  ctx.stroke();
  ctx.setLineDash([]);
}

function crosshair(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRotateHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(x, y, 5, -Math.PI * 0.1, Math.PI * 1.45);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const ax = x + 5 * Math.cos(-Math.PI * 0.1),
    ay = y + 5 * Math.sin(-Math.PI * 0.1);
  ctx.beginPath();
  ctx.moveTo(ax - 3, ay - 1);
  ctx.lineTo(ax, ay);
  ctx.lineTo(ax + 1, ay - 3);
  ctx.stroke();
  ctx.restore();
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, align: 'center' | 'left' = 'center') {
  ctx.save();
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  const bx = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = 'rgba(20,20,30,0.85)';
  ctx.beginPath();
  roundRectPath(ctx, bx, y - 10, w, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 6, y + 0.5);
  ctx.restore();
}

let tintCache: { src: HTMLCanvasElement; canvas: HTMLCanvasElement } | null = null;
function tinted(src: HTMLCanvasElement, color: string) {
  if (!tintCache || tintCache.src !== src || tintCache.canvas.width !== src.width) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    tintCache = { src, canvas: c };
  }
  const c = tintCache.canvas;
  const ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}
