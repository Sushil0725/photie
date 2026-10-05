import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { drawLayerContent } from '../../engine/render';
import { shapePath } from '../../engine/shapes';
import type { ShapeLayer } from '../../engine/types';
import { createCanvas, ctx2d } from '../../engine/util';
import { FRAME_ELEMENTS, ICONS, SHAPE_ELEMENTS, STICKERS, addFrame, addIcon, addShapeElement, addSticker, type ShapeElement } from '../../store/elements';
import { dragData } from './SidePanel';

const previewCache = new Map<string, string>();

function shapePreview(el: ShapeElement): string {
  const hit = previewCache.get(el.id);
  if (hit) return hit;
  const size = 96;
  const c = createCanvas(size, size);
  const ctx = ctx2d(c);
  const line = el.shape === 'line' || el.shape === 'arrowline';
  const w = 72,
    h = line ? 24 : Math.round(72 * (el.aspect || 1));
  const layer: ShapeLayer = {
    id: 'p',
    name: '',
    type: 'shape',
    shape: el.shape,
    w,
    h,
    fill: el.fill,
    stroke: el.stroke ?? null,
    strokeWidth: el.strokeWidth ? Math.max(2, el.strokeWidth / 2) : 0,
    dash: el.dash || 0,
    radius: el.radius ? el.radius / 5 : 0,
    sides: el.sides || 5,
    inner: el.shape === 'ring' ? 0.6 : 0.45,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
  ctx.translate((size - w) / 2, (size - h) / 2);
  drawLayerContent(ctx, layer);
  const url = c.toDataURL();
  previewCache.set(el.id, url);
  return url;
}

function framePreview(f: (typeof FRAME_ELEMENTS)[number]): string {
  const hit = previewCache.get(f.id);
  if (hit) return hit;
  const size = 96;
  const c = createCanvas(size, size);
  const ctx = ctx2d(c);
  const w = f.aspect && f.aspect > 1 ? 72 / f.aspect : 72;
  const h = w * (f.aspect || 1);
  ctx.translate((size - w) / 2, (size - h) / 2);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#c7d2fe');
  g.addColorStop(1, '#a5b4fc');
  ctx.fillStyle = g;
  ctx.fill(shapePath(f.clip, w, h, { radius: f.radius ? f.radius / 6 : 0 }));
  const url = c.toDataURL();
  previewCache.set(f.id, url);
  return url;
}

export function ElementsTab() {
  const [q, setQ] = useState('');
  const [showAllIcons, setShowAllIcons] = useState(false);
  const icons = useMemo(() => ICONS.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())), [q]);
  const shapes = SHAPE_ELEMENTS.filter((s) => !['line', 'dashed', 'arrowline'].includes(s.id));
  const lines = SHAPE_ELEMENTS.filter((s) => ['line', 'dashed', 'arrowline'].includes(s.id));
  return (
    <div className="tab-elements">
      <div className="search">
        <Search size={15} />
        <input placeholder="Search icons" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      {!q && (
        <>
          <h5>Shapes</h5>
          <div className="el-grid">
            {shapes.map((el) => (
              <button key={el.id} className="el-item" draggable onDragStart={(e) => dragData(e, { type: 'shape', id: el.id })} onClick={() => addShapeElement(el)} title={el.id}>
                <img src={shapePreview(el)} alt={el.id} />
              </button>
            ))}
          </div>
          <h5>Lines & arrows</h5>
          <div className="el-grid">
            {lines.map((el) => (
              <button key={el.id} className="el-item" draggable onDragStart={(e) => dragData(e, { type: 'shape', id: el.id })} onClick={() => addShapeElement(el)} title={el.id}>
                <img src={shapePreview(el)} alt={el.id} />
              </button>
            ))}
          </div>
          <h5>Frames</h5>
          <p className="hint">Add a frame, then drag a photo onto it.</p>
          <div className="el-grid">
            {FRAME_ELEMENTS.map((f) => (
              <button key={f.id} className="el-item" draggable onDragStart={(e) => dragData(e, { type: 'frame', id: f.id })} onClick={() => addFrame(f)} title="Photo frame">
                <img src={framePreview(f)} alt="frame" />
              </button>
            ))}
          </div>
        </>
      )}
      <h5>Icons</h5>
      <div className="el-grid icons">
        {(q || showAllIcons ? icons : icons.slice(0, 40)).map((i) => (
          <button key={i.name} className="el-item" draggable onDragStart={(e) => dragData(e, { type: 'icon', name: i.name })} onClick={() => addIcon(i)} title={i.name}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={i.path} />
            </svg>
          </button>
        ))}
      </div>
      {!q && !showAllIcons && (
        <button className="btn small ghost wide" onClick={() => setShowAllIcons(true)}>
          Show all {ICONS.length} icons
        </button>
      )}
      {!q && (
        <>
          <h5>Stickers</h5>
          <div className="el-grid stickers">
            {STICKERS.map((s) => (
              <button key={s} className="el-item" draggable onDragStart={(e) => dragData(e, { type: 'sticker', emoji: s })} onClick={() => addSticker(s)}>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
