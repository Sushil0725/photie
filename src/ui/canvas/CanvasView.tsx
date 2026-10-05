import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { fillPrimary } from '../../engine/fill';
import { layoutText, naturalTextWidth } from '../../engine/text';
import { checkerPattern, renderDoc } from '../../engine/render';
import type { Doc, TextLayer } from '../../engine/types';
import { S, cancelLive, endLive, invalidate, live, liveBaseDoc, onInvalidate, setS, useEditor } from '../../store/editor';
import { placeImageFiles, placeImageUrl } from '../../store/files';
import { panBy, screenToDoc, setZoom, fitToScreen } from '../../store/view';
import { drawOverlay } from './overlay';
import { cancelInteraction, cursorFor, doubleClick, ix, pointerDown, pointerMove, pointerUp } from './tools';
import { ContextMenu, canvasContextItems } from '../ContextMenu';
import { hitLayer } from '../../engine/geometry';
import { selectLayers } from '../../store/layers';
import { dropElement, fillFrameWithImage } from '../../store/elements';

let workspaceColor = '#e8e8ee';
export function refreshThemeColors() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--workspace').trim();
  if (v) workspaceColor = v;
  invalidate();
}

export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editingTextId = useEditor((s) => s.editingTextId);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    let first = true;
    refreshThemeColors();

    const draw = () => {
      frame = 0;
      const s = S();
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = workspaceColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const doc = s.doc;
      if (!doc) return;
      const z = s.zoom;
      const x = s.panX * dpr,
        y = s.panY * dpr,
        w = doc.width * z * dpr,
        h = doc.height * z * dpr;
      // Artboard shadow.
      ctx.save();
      ctx.shadowColor = 'rgba(15,15,40,0.18)';
      ctx.shadowBlur = 24 * dpr;
      ctx.shadowOffsetY = 4 * dpr;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      if (!doc.background || doc.background.type !== 'solid' || !/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(doc.background.color)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = checkerPattern(ctx);
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
      let renderDocObj: Doc = doc;
      if (s.preview) {
        const p = s.preview;
        renderDocObj = { ...doc, layers: doc.layers.map((l) => (l.id === p.id ? p : l)) };
      }
      const hidden = s.editingTextId ? new Set([s.editingTextId]) : undefined;
      renderDoc(ctx, renderDocObj, {
        base: new DOMMatrix([z * dpr, 0, 0, z * dpr, x, y]),
        scale: z * dpr,
        hidden,
        smoothing: z < 2,
        quality: 'medium',
      });
      drawOverlay(ctx, dpr, performance.now());
      canvas.style.cursor = cursorFor();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      const prev = S().viewport;
      setS({ viewport: { w: r.width, h: r.height } });
      if (first) {
        first = false;
        fitToScreen();
      } else if (prev.w && prev.h) {
        // Keep the view centred when the viewport resizes (panels toggled).
        panBy((r.width - prev.w) / 2, (r.height - prev.h) / 2);
      }
      schedule();
    });
    ro.observe(wrap);
    const unsub = useEditor.subscribe(schedule);
    const unInv = onInvalidate(schedule);
    // Animate marching ants.
    const timer = setInterval(() => {
      const s = S();
      if (s.selection || ix.polygon || ix.marquee || ix.lasso) schedule();
    }, 90);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
        setZoom(S().zoom * factor, anchor);
      } else if (e.altKey) {
        setZoom(S().zoom * Math.exp(-e.deltaY * 0.002), anchor);
      } else {
        const k = e.deltaMode === 1 ? 20 : 1;
        if (e.shiftKey && !e.deltaX) panBy(-e.deltaY * k, 0);
        else panBy(-e.deltaX * k, -e.deltaY * k);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      unsub();
      unInv();
      clearInterval(timer);
      canvas.removeEventListener('wheel', onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const sp = local(e);
    const p = screenToDoc(sp.x, sp.y);
    const doc = S().doc;
    const internal = e.dataTransfer.getData('application/x-photie');
    // Dropping a photo onto a frame fills the frame (Canva behaviour).
    const frameUnder = doc ? [...doc.layers].reverse().find((l) => l.type === 'raster' && l.clip && hitLayer(l, p, false)) : undefined;
    if (internal) {
      const data = JSON.parse(internal);
      if (data.type === 'image') {
        if (frameUnder) await fillFrameWithImage(frameUnder.id, data.url, data.fallback);
        else await placeImageUrl(data.url, data.name || 'Photo', { at: p, fallbackUrl: data.fallback });
      } else dropElement(data, p);
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      if (frameUnder && files[0].type.startsWith('image/')) {
        const url = URL.createObjectURL(files[0]);
        await fillFrameWithImage(frameUnder.id, url);
        return;
      }
      placeImageFiles(files, p);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="main-canvas"
        tabIndex={0}
        onPointerDown={(e) => {
          if (S().editingTextId) {
            // Clicking outside the text box finishes editing (even if the textarea never got focus).
            finishTextEdit();
            return;
          }
          (e.target as HTMLElement).focus();
          try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* synthetic or already-released pointer */
          }
          setMenu(null);
          pointerDown(e.nativeEvent, local(e));
          invalidate();
        }}
        onPointerMove={(e) => pointerMove(e.nativeEvent, local(e))}
        onPointerUp={(e) => pointerUp(e.nativeEvent)}
        onPointerCancel={(e) => {
          ix.pointers.delete(e.pointerId);
          cancelInteraction();
        }}
        onPointerEnter={() => {
          ix.inside = true;
          invalidate();
        }}
        onPointerLeave={() => {
          ix.inside = false;
          ix.hoverId = null;
          invalidate();
        }}
        onDoubleClick={(e) => doubleClick(local(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          const sp = local(e);
          const p = screenToDoc(sp.x, sp.y);
          const doc = S().doc;
          if (doc) {
            const hit = [...doc.layers].reverse().find((l) => hitLayer(l, p, true));
            if (hit && !S().selectedIds.includes(hit.id)) selectLayers([hit.id]);
          }
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      />
      {editingTextId && <TextEditor key={editingTextId} id={editingTextId} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={canvasContextItems()} onClose={() => setMenu(null)} />}
    </div>
  );
}

/* ------------------------------- Text editing ------------------------------- */

export function finishTextEdit() {
  const s = S();
  const id = s.editingTextId;
  if (!id || !s.doc) return;
  const l = s.doc.layers.find((x) => x.id === id) as TextLayer | undefined;
  const base = liveBaseDoc();
  const isNew = !!base && !base.layers.some((x) => x.id === id);
  setS({ editingTextId: null });
  if (!l || !l.text.trim()) {
    if (isNew || !base) cancelLive();
    else {
      live({ ...s.doc, layers: s.doc.layers.filter((x) => x.id !== id) }, { selectedIds: [] });
      endLive('Delete text');
    }
    return;
  }
  endLive(isNew ? 'Add text' : 'Edit text');
}

function TextEditor({ id }: { id: string }) {
  const layer = useEditor((s) => s.doc?.layers.find((l) => l.id === id)) as TextLayer | undefined;
  const zoom = useEditor((s) => s.zoom);
  const panX = useEditor((s) => s.panX);
  const panY = useEditor((s) => s.panY);
  const ref = useRef<HTMLTextAreaElement>(null);
  const autoWidth = useRef<boolean>(!!layer && layer.text === '');

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.select();
  }, []);

  if (!layer) return null;
  const lay = layoutText(layer);
  const style: CSSProperties = {
    position: 'absolute',
    left: layer.x * zoom + panX,
    top: layer.y * zoom + panY,
    width: lay.w,
    height: lay.h,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${zoom * layer.scaleX}, ${zoom * layer.scaleY})`,
    transformOrigin: 'center',
    font: `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px "${layer.font}", Inter, system-ui, sans-serif`,
    lineHeight: `${layer.size * layer.lineHeight}px`,
    letterSpacing: `${layer.letterSpacing}px`,
    textAlign: layer.align,
    textTransform: layer.uppercase ? 'uppercase' : 'none',
    color: fillPrimary(layer.fill),
    textDecoration: [layer.underline ? 'underline' : '', layer.strike ? 'line-through' : ''].join(' ').trim() || 'none',
  };

  const onChange = (value: string) => {
    const s = S();
    if (!s.doc) return;
    const cur = s.doc.layers.find((l) => l.id === id) as TextLayer;
    let next: TextLayer = { ...cur, text: value };
    const defaultName = !cur.name || cur.name === 'Text' || cur.text.split('\n')[0].slice(0, 28) === cur.name;
    if (defaultName) next.name = value.split('\n')[0].slice(0, 28) || 'Text';
    if (autoWidth.current) {
      const nw = Math.min(Math.max(naturalTextWidth(next), next.size), s.doc.width * 0.95);
      next = { ...next, width: nw };
    }
    live({ ...s.doc, layers: s.doc.layers.map((l) => (l.id === id ? next : l)) });
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      style={style}
      value={layer.text}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={finishTextEdit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finishTextEdit();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
