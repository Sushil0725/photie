/* Dev-only helpers for driving the editor from the browser console (never included in production builds). */
import { useEditor } from '../store/editor';

const st = () => useEditor.getState();

function pt(x: number, y: number) {
  const s = st();
  const r = document.querySelector('.main-canvas')!.getBoundingClientRect();
  return { clientX: r.left + s.panX + x * s.zoom, clientY: r.top + s.panY + y * s.zoom };
}

function fire(type: string, x: number, y: number, extra: PointerEventInit = {}) {
  const c = document.querySelector('.main-canvas')!;
  c.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, ...pt(x, y), ...extra }),
  );
}

export const testkit = {
  st,
  set: (p: Parameters<typeof useEditor.setState>[0]) => useEditor.setState(p),
  pt,
  fire,
  drag(x1: number, y1: number, x2: number, y2: number, steps = 8, extra: PointerEventInit = {}) {
    fire('pointerdown', x1, y1, extra);
    for (let i = 1; i <= steps; i++) fire('pointermove', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, extra);
    fire('pointerup', x2, y2, extra);
  },
  click(x: number, y: number, extra: PointerEventInit = {}) {
    fire('pointerdown', x, y, extra);
    fire('pointerup', x, y, extra);
  },
  dbl(x: number, y: number) {
    document.querySelector('.main-canvas')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ...pt(x, y) }));
  },
  key(key: string, opts: KeyboardEventInit = {}) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  },
  hist() {
    const s = st();
    return s.past.map((e) => e.label).concat('>' + s.presentLabel);
  },
  /** Pixel of a raster layer at a document point. */
  px(layerId: string, x: number, y: number) {
    const l = st().doc!.layers.find((q) => q.id === layerId);
    if (!l || l.type !== 'raster') return null;
    const m = new DOMMatrix().translate(l.x, l.y).rotate(l.rotation).scale(l.scaleX, l.scaleY).translate(-l.canvas.width / 2, -l.canvas.height / 2).inverse();
    const p = m.transformPoint(new DOMPoint(x, y));
    return Array.from(l.canvas.getContext('2d')!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data);
  },
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  /** Shows a canvas or data URL over the page for screenshots. */
  peek(src: HTMLCanvasElement | string, width = 600) {
    document.getElementById('__peek')?.remove();
    const img = document.createElement('img');
    img.id = '__peek';
    img.src = typeof src === 'string' ? src : src.toDataURL();
    Object.assign(img.style, { position: 'fixed', left: '0', top: '0', width: width + 'px', zIndex: '99999', border: '2px solid red', background: '#fff' });
    img.onclick = () => img.remove();
    document.body.appendChild(img);
  },
  unpeek: () => document.getElementById('__peek')?.remove(),
};
