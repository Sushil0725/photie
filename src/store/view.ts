import { S, setS } from './editor';

export const ZOOM_STEPS = [0.02, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

/** Fits the document into the viewport with a margin. */
export function fitToScreen() {
  const s = S();
  if (!s.doc) return;
  const { w: vw, h } = s.viewport;
  // On phones the tool strip floats over the left edge of the canvas; keep the design clear of it.
  const inset = window.matchMedia('(max-width: 700px)').matches ? 50 : 0;
  const w = vw - inset;
  const margin = inset ? 12 : Math.min(80, Math.max(24, Math.min(w, h) * 0.08));
  const zoom = Math.max(MIN_ZOOM, Math.min(4, Math.min((w - margin * 2) / s.doc.width, (h - margin * 2) / s.doc.height)));
  setS({ zoom, panX: inset + (w - s.doc.width * zoom) / 2, panY: (h - s.doc.height * zoom) / 2 });
}

/** Sets zoom, keeping the given screen point fixed (defaults to the viewport center). */
export function setZoom(zoom: number, anchor?: { x: number; y: number }) {
  const s = S();
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const ax = anchor?.x ?? s.viewport.w / 2;
  const ay = anchor?.y ?? s.viewport.h / 2;
  const docX = (ax - s.panX) / s.zoom;
  const docY = (ay - s.panY) / s.zoom;
  setS({ zoom: z, panX: ax - docX * z, panY: ay - docY * z });
}

export function zoomIn(anchor?: { x: number; y: number }) {
  const z = S().zoom;
  setZoom(ZOOM_STEPS.find((s) => s > z * 1.01) ?? MAX_ZOOM, anchor);
}

export function zoomOut(anchor?: { x: number; y: number }) {
  const z = S().zoom;
  setZoom([...ZOOM_STEPS].reverse().find((s) => s < z / 1.01) ?? MIN_ZOOM, anchor);
}

export function actualSize() {
  setZoom(1);
  const s = S();
  if (!s.doc) return;
  setS({ panX: (s.viewport.w - s.doc.width) / 2, panY: (s.viewport.h - s.doc.height) / 2 });
}

export function panBy(dx: number, dy: number) {
  setS((s) => ({ panX: s.panX + dx, panY: s.panY + dy }));
}

export const screenToDoc = (x: number, y: number) => {
  const s = S();
  return { x: (x - s.panX) / s.zoom, y: (y - s.panY) / s.zoom };
};

export const docToScreen = (x: number, y: number) => {
  const s = S();
  return { x: x * s.zoom + s.panX, y: y * s.zoom + s.panY };
};
