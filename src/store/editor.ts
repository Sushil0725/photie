import { create } from 'zustand';
import type { Doc, Layer, LayerGroup, Rect, Selection, SelectionMode, ShapeKind } from '../engine/types';
import { normalizeGroups } from '../engine/groups';

export type ToolId =
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'wand'
  | 'crop'
  | 'eyedropper'
  | 'heal'
  | 'brush'
  | 'clone'
  | 'eraser'
  | 'fill'
  | 'blur'
  | 'dodge'
  | 'text'
  | 'shape'
  | 'hand'
  | 'zoom';

export type SidePanel = 'templates' | 'elements' | 'text' | 'photos' | 'uploads' | 'background' | 'adjust' | 'ai' | null;

export interface PaintOpts {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  spacing: number;
}

export interface ToolOptions {
  marquee: 'rect' | 'ellipse';
  lasso: 'free' | 'polygon';
  wandVariant: 'wand' | 'selectBrush' | 'object';
  brushVariant: 'brush' | 'pencil';
  eraserVariant: 'eraser' | 'magic';
  fillVariant: 'gradient' | 'bucket';
  blurVariant: 'blur' | 'sharpen' | 'smudge';
  dodgeVariant: 'dodge' | 'burn' | 'sponge';
  shape: ShapeKind;
  selMode: SelectionMode;
  feather: number;
  tolerance: number;
  contiguous: boolean;
  sampleAll: boolean;
  /** Clone stamp: keep the source offset between strokes (Photoshop "Aligned"). */
  cloneAligned: boolean;
  /** Clone stamp: copy from everything visible instead of only the active layer. */
  cloneSampleAll: boolean;
  brush: PaintOpts;
  eraser: PaintOpts;
  clone: PaintOpts;
  heal: PaintOpts;
  retouch: PaintOpts; // blur / sharpen / smudge / dodge / burn / sponge
  selectBrush: PaintOpts;
  pressure: boolean;
  strength: number; // 0..1 for retouch tools
  dodgeRange: 'shadows' | 'midtones' | 'highlights';
  gradientType: 'linear' | 'radial' | 'angle' | 'reflected';
  gradientPreset: 'fg-bg' | 'fg-transparent' | 'rainbow' | 'sunset' | 'ocean' | 'chrome';
  gradientOpacity: number;
  cropRatio: string; // 'free' | 'w:h'
  shapeFill: string;
  shapeStroke: string;
  shapeStrokeWidth: number;
  textFont: string;
  textSize: number;
  sampleSize: 1 | 3 | 5;
}

export interface HistoryEntry {
  label: string;
  doc: Doc;
  selection: Selection | null;
  selectedIds: string[];
}

export type DialogState =
  | { type: 'new' }
  | { type: 'export' }
  | { type: 'imageSize' }
  | { type: 'canvasSize' }
  | { type: 'filter'; id: string }
  | { type: 'shortcuts' }
  | { type: 'about' }
  | { type: 'resize' }
  | { type: 'confirm'; title: string; message: string; onOk: () => void; okLabel?: string }
  | { type: 'prompt'; title: string; label: string; value: string; onOk: (v: string) => void }
  | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface EditorState {
  screen: 'home' | 'editor';
  doc: Doc | null;
  selectedIds: string[];
  /** Set when a whole layer group was picked (its header or a member on the canvas); cleared by other selections. */
  selectedGroupId: string | null;
  /** When true, painting tools edit the active layer's mask. */
  editMask: boolean;
  selection: Selection | null;
  tool: ToolId;
  opts: ToolOptions;
  fg: string;
  bg: string;
  recentColors: string[];
  zoom: number;
  panX: number;
  panY: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  presentLabel: string;
  editingTextId: string | null;
  sidePanel: SidePanel;
  rightTab: 'design' | 'layers' | 'history';
  dialog: DialogState;
  toasts: Toast[];
  /** Temporary replacement layer for live filter previews. */
  preview: Layer | null;
  showGrid: boolean;
  snap: boolean;
  showRulers: boolean;
  saveState: 'saved' | 'saving' | 'unsaved' | 'idle';
  busy: string | null;
  cloneSource: { x: number; y: number } | null;
  /** Clone stamp: the next canvas click sets the source point (for touch / no Alt key). */
  pickCloneSource: boolean;
  clipboard: { layers: Layer[]; groups?: LayerGroup[] } | { canvas: HTMLCanvasElement; x: number; y: number } | null;
  viewport: { w: number; h: number };
  /** Active crop rectangle while the crop tool is in use (document coordinates). */
  cropRect: Rect | null;
}

const defaultPaint = (size: number, hardness = 0.8): PaintOpts => ({ size, hardness, opacity: 1, flow: 1, spacing: 0.1 });

export const initialOptions: ToolOptions = {
  marquee: 'rect',
  lasso: 'free',
  wandVariant: 'wand',
  brushVariant: 'brush',
  eraserVariant: 'eraser',
  fillVariant: 'gradient',
  blurVariant: 'blur',
  dodgeVariant: 'dodge',
  shape: 'rect',
  selMode: 'new',
  feather: 0,
  tolerance: 32,
  contiguous: true,
  sampleAll: false,
  cloneAligned: true,
  cloneSampleAll: false,
  brush: defaultPaint(24, 0.75),
  eraser: defaultPaint(40, 0.8),
  clone: defaultPaint(50, 0.6),
  heal: defaultPaint(30, 0.6),
  retouch: defaultPaint(60, 0.4),
  selectBrush: defaultPaint(60, 0.9),
  pressure: true,
  strength: 0.5,
  dodgeRange: 'midtones',
  gradientType: 'linear',
  gradientPreset: 'fg-bg',
  gradientOpacity: 1,
  cropRatio: 'free',
  shapeFill: '#7c5cff',
  shapeStroke: '#111111',
  shapeStrokeWidth: 0,
  textFont: 'Inter',
  textSize: 64,
  sampleSize: 1,
};

export const useEditor = create<EditorState>()(() => ({
  screen: 'home',
  doc: null,
  selectedIds: [],
  selectedGroupId: null,
  editMask: false,
  selection: null,
  tool: 'move',
  opts: initialOptions,
  fg: '#111111',
  bg: '#ffffff',
  recentColors: ['#111111', '#ffffff', '#7c5cff', '#ff4d6d', '#ffb703', '#06d6a0', '#118ab2'],
  zoom: 1,
  panX: 0,
  panY: 0,
  past: [],
  future: [],
  presentLabel: 'Open',
  editingTextId: null,
  sidePanel: 'templates',
  rightTab: 'design',
  dialog: null,
  toasts: [],
  preview: null,
  showGrid: false,
  snap: true,
  showRulers: false,
  saveState: 'idle',
  busy: null,
  cloneSource: null,
  pickCloneSource: false,
  clipboard: null,
  viewport: { w: 800, h: 600 },
  cropRect: null,
}));

export const S = () => useEditor.getState();
export const setS = useEditor.setState;

/* ------------------------------ Render bus ------------------------------ */

const renderListeners = new Set<() => void>();
export const onInvalidate = (fn: () => void) => {
  renderListeners.add(fn);
  return () => {
    renderListeners.delete(fn);
  };
};
/** Requests a canvas redraw (used when pixels change in place, e.g. during strokes). */
export const invalidate = () => renderListeners.forEach((fn) => fn());

/* -------------------------------- History -------------------------------- */

const MAX_HISTORY = 50;
const HISTORY_BUDGET = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  ? Math.min(1.5e9, ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4) * 1.2e8)
  : 8e8;

function entryCanvases(e: { doc: Doc; selection: Selection | null }, into: Set<HTMLCanvasElement>) {
  for (const l of e.doc.layers) {
    if (l.type === 'raster') into.add(l.canvas);
    if (l.mask) into.add(l.mask);
  }
  if (e.selection) into.add(e.selection.mask);
}

function trimHistory(past: HistoryEntry[], present: HistoryEntry): HistoryEntry[] {
  let p = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
  // Drop the oldest entries while their unique pixel memory exceeds the budget.
  const bytes = (entries: HistoryEntry[]) => {
    const set = new Set<HTMLCanvasElement>();
    entries.forEach((e) => entryCanvases(e, set));
    entryCanvases(present, set);
    let total = 0;
    set.forEach((c) => (total += c.width * c.height * 4));
    return total;
  };
  while (p.length > 3 && bytes(p) > HISTORY_BUDGET) p = p.slice(1);
  return p;
}

export function presentEntry(): HistoryEntry {
  const s = S();
  return { label: s.presentLabel, doc: s.doc!, selection: s.selection, selectedIds: s.selectedIds };
}

/** Records a new document state as an undoable step. */
export function commit(label: string, doc: Doc, extra: Partial<EditorState> = {}) {
  const s = S();
  if (!s.doc) return;
  doc = normalizeGroups(doc);
  const prev = liveBase || presentEntry();
  liveBase = null;
  const next: Partial<EditorState> = {
    doc,
    presentLabel: label,
    future: [],
    saveState: 'unsaved',
    ...extra,
  };
  const present: HistoryEntry = {
    label,
    doc,
    selection: extra.selection !== undefined ? extra.selection : s.selection,
    selectedIds: extra.selectedIds || s.selectedIds,
  };
  next.past = trimHistory([...s.past, prev], present);
  setS(next);
}

let liveBase: HistoryEntry | null = null;

/** Starts a continuous edit (drag, slider). Changes are applied with `live()` and recorded by `commit`. */
export function beginLive() {
  if (!liveBase && S().doc) liveBase = presentEntry();
}

export function live(doc: Doc, extra: Partial<EditorState> = {}) {
  beginLive();
  setS({ doc, saveState: 'unsaved', ...extra });
}

/** Ends a continuous edit; records it if anything changed. */
export function endLive(label: string) {
  if (!liveBase) return;
  const base = liveBase;
  if (S().doc === base.doc) {
    liveBase = null;
    return;
  }
  commit(label, S().doc!);
}

/** Document before the current live edit started (null when not in a live edit). */
export const liveBaseDoc = (): Doc | null => liveBase?.doc ?? null;

export function cancelLive() {
  if (!liveBase) return;
  setS({ doc: liveBase.doc, selection: liveBase.selection });
  liveBase = null;
}

export function resetHistory(doc: Doc, label = 'Open') {
  liveBase = null;
  setS({
    doc,
    past: [],
    future: [],
    presentLabel: label,
    selection: null,
    selectedIds: [],
    editMask: false,
    preview: null,
    editingTextId: null,
    cloneSource: null,
    pickCloneSource: false,
  });
}

function restore(e: HistoryEntry, past: HistoryEntry[], future: HistoryEntry[]) {
  const ids = new Set(e.doc.layers.map((l) => l.id));
  setS({
    doc: e.doc,
    selection: e.selection,
    selectedIds: e.selectedIds.filter((id) => ids.has(id)),
    presentLabel: e.label,
    past,
    future,
    preview: null,
    editingTextId: null,
    saveState: 'unsaved',
  });
}

export function undo() {
  const s = S();
  if (!s.past.length || !s.doc) return;
  liveBase = null;
  const past = s.past.slice(0, -1);
  const target = s.past[s.past.length - 1];
  restore(target, past, [presentEntry(), ...s.future]);
}

export function redo() {
  const s = S();
  if (!s.future.length || !s.doc) return;
  liveBase = null;
  const [target, ...rest] = s.future;
  restore(target, [...s.past, presentEntry()], rest);
}

/** Jumps to a history index (0..past.length+future.length). */
export function jumpHistory(index: number) {
  const s = S();
  const all = [...s.past, presentEntry(), ...s.future];
  if (index < 0 || index >= all.length) return;
  liveBase = null;
  restore(all[index], all.slice(0, index), all.slice(index + 1));
}

/* --------------------------------- Toasts --------------------------------- */

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 2800) {
  const id = toastId++;
  setS((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => setS((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/* -------------------------------- Helpers -------------------------------- */

export const activeLayer = (): Layer | undefined => {
  const s = S();
  if (!s.doc) return undefined;
  const id = s.selectedIds[s.selectedIds.length - 1];
  return s.doc.layers.find((l) => l.id === id);
};

export const selectedLayers = (): Layer[] => {
  const s = S();
  if (!s.doc) return [];
  const set = new Set(s.selectedIds);
  return s.doc.layers.filter((l) => set.has(l.id));
};

export function setOpts(p: Partial<ToolOptions>) {
  setS((s) => ({ opts: { ...s.opts, ...p } }));
}

export function setTool(tool: ToolId) {
  setS({ tool, editingTextId: null });
}

export function pushRecentColor(c: string) {
  setS((s) => ({ recentColors: [c, ...s.recentColors.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 14) }));
}

export async function withBusy<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  setS({ busy: label });
  // Let the UI paint the busy indicator before heavy synchronous work.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 16)));
  try {
    return await fn();
  } finally {
    setS({ busy: null });
  }
}
