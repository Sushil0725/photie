import { S, invalidate, redo, setOpts, setS, setTool, undo, type PaintOpts, type ToolId, type ToolOptions } from '../store/editor';
import { copy, cut } from '../store/files';
import { contentAwareFill, deselect, fillSelection, invertSelection, selectAll } from '../store/image';
import { arrange, mergeSelected, mergeVisible, newEmptyLayer, nudgeSelected, selectLayers, updateSelected } from '../store/layers';
import { actualSize, fitToScreen, zoomIn, zoomOut } from '../store/view';
import { cmd } from './actions';
import { applyCrop, cancelInteraction, finishPolygon, ix, startTextEdit } from './canvas/tools';
import { TOOLS } from './Toolbar';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

/** Shift+letter cycles a tool's variants, like Photoshop. */
const VARIANTS: Partial<Record<ToolId, { key: keyof ToolOptions; values: string[] }>> = {
  marquee: { key: 'marquee', values: ['rect', 'ellipse'] },
  lasso: { key: 'lasso', values: ['free', 'polygon'] },
  wand: { key: 'wandVariant', values: ['object', 'wand', 'selectBrush'] },
  brush: { key: 'brushVariant', values: ['brush', 'pencil'] },
  eraser: { key: 'eraserVariant', values: ['eraser', 'magic'] },
  fill: { key: 'fillVariant', values: ['gradient', 'bucket'] },
  blur: { key: 'blurVariant', values: ['blur', 'sharpen', 'smudge'] },
  dodge: { key: 'dodgeVariant', values: ['dodge', 'burn', 'sponge'] },
};

function paintKey(): keyof Pick<ToolOptions, 'brush' | 'eraser' | 'clone' | 'heal' | 'retouch' | 'selectBrush'> | null {
  const s = S();
  switch (s.tool) {
    case 'brush':
      return 'brush';
    case 'eraser':
      return 'eraser';
    case 'clone':
      return 'clone';
    case 'heal':
      return 'heal';
    case 'blur':
    case 'dodge':
      return 'retouch';
    case 'wand':
      return s.opts.wandVariant === 'selectBrush' ? 'selectBrush' : null;
  }
  return null;
}

function adjustPaint(patch: (p: PaintOpts) => Partial<PaintOpts>) {
  const k = paintKey();
  if (!k) return false;
  const cur = S().opts[k];
  setOpts({ [k]: { ...cur, ...patch(cur) } } as Partial<ToolOptions>);
  invalidate();
  return true;
}

export function onKeyDown(e: KeyboardEvent) {
  const s = S();
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  if (s.screen !== 'editor' || !s.doc) {
    if (mod && k === 'o') {
      e.preventDefault();
      cmd.open();
    }
    return;
  }
  if (isTyping(e.target) || s.editingTextId) return;
  if (s.dialog) return;

  ix.alt = e.altKey;
  ix.shift = e.shiftKey;
  ix.ctrl = mod;
  // Alt alone would focus the browser menu on Windows and swallow the next Alt+click (clone source, eyedropper).
  if (e.key === 'Alt') {
    e.preventDefault();
    invalidate();
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    if (!ix.space) {
      ix.space = true;
      invalidate();
    }
    return;
  }

  if (mod) {
    let handled = true;
    switch (k) {
      case 'z':
        if (e.shiftKey) redo();
        else undo();
        break;
      case 'y':
        redo();
        break;
      case 'c':
        copy();
        break;
      case 'x':
        cut();
        break;
      case 'v':
        // Let the native paste event deliver clipboard contents.
        handled = false;
        break;
      case 'a':
        if (e.altKey) cmd.selectAllLayers();
        else selectAll();
        break;
      case 'd':
        if (s.selection) deselect();
        else cmd.duplicate();
        break;
      case 'j':
        cmd.layerViaCopy();
        break;
      case 'e':
        if (e.shiftKey) mergeVisible();
        else mergeSelected();
        break;
      case 'i':
        if (e.shiftKey) invertSelection();
        else if (e.altKey) setS({ dialog: { type: 'imageSize' } });
        else cmd.filter('invert');
        break;
      case 'n':
        if (e.shiftKey) newEmptyLayer();
        else cmd.newDoc();
        break;
      case 'o':
        cmd.open();
        break;
      case 's':
        if (e.shiftKey) cmd.export();
        else cmd.save();
        break;
      case 'p':
        if (e.shiftKey) cmd.place();
        else handled = false;
        break;
      case 't':
        cmd.freeTransform();
        break;
      case '=':
      case '+':
        zoomIn();
        break;
      case '-':
        zoomOut();
        break;
      case '0':
        fitToScreen();
        break;
      case '1':
        actualSize();
        break;
      case '[':
        arrange(e.shiftKey ? 'back' : 'backward');
        break;
      case ']':
        arrange(e.shiftKey ? 'front' : 'forward');
        break;
      case '{':
        arrange('back');
        break;
      case '}':
        arrange('front');
        break;
      case "'":
        setS({ showGrid: !s.showGrid });
        break;
      case ';':
        setS({ snap: !s.snap });
        break;
      case '/':
        cmd.toggleLock();
        break;
      case 'l':
        if (e.shiftKey) cmd.filter('auto-tone');
        else cmd.filter('levels');
        break;
      case 'm':
        cmd.filter('curves');
        break;
      case 'u':
        cmd.filter('hue-saturation');
        break;
      case 'b':
        cmd.filter('color-balance');
        break;
      case 'backspace':
        fillSelection(s.bg);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
    invalidate();
    return;
  }

  if ((e.key === 'Backspace' || e.key === 'Delete') && e.altKey) {
    e.preventDefault();
    fillSelection(s.fg);
    return;
  }
  if (e.key === 'Backspace' && e.shiftKey) {
    e.preventDefault();
    contentAwareFill();
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      cmd.delete();
      return;
    case 'Escape':
      if (ix.drag || ix.polygon) cancelInteraction();
      else if (s.tool === 'crop') setS({ cropRect: null, tool: 'move' });
      else if (s.selectedIds.length) selectLayers([]);
      return;
    case 'Enter': {
      if (s.tool === 'crop') applyCrop();
      else if (ix.polygon) finishPolygon();
      else {
        const l = s.doc.layers.find((x) => x.id === s.selectedIds[s.selectedIds.length - 1]);
        if (l && l.type === 'text') startTextEdit(l.id);
      }
      return;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!s.selectedIds.length) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudgeSelected(dx, dy);
      return;
    }
    case '[':
      adjustPaint((p) => ({ size: Math.max(1, Math.round(p.size * (p.size > 10 ? 0.85 : 1) - (p.size > 10 ? 0 : 1))) }));
      return;
    case ']':
      adjustPaint((p) => ({ size: Math.min(1000, Math.round(p.size * (p.size >= 10 ? 1.18 : 1) + (p.size >= 10 ? 0 : 1))) }));
      return;
    case '{':
      adjustPaint((p) => ({ hardness: Math.max(0, p.hardness - 0.25) }));
      return;
    case '}':
      adjustPaint((p) => ({ hardness: Math.min(1, p.hardness + 0.25) }));
      return;
    case '?':
      setS({ dialog: { type: 'shortcuts' } });
      return;
  }

  if (/^[0-9]$/.test(e.key)) {
    const v = e.key === '0' ? 1 : Number(e.key) / 10;
    if (!adjustPaint(() => ({ opacity: v }))) {
      if (s.selectedIds.length) updateSelected({ opacity: v }, 'Opacity');
    }
    return;
  }

  if (k === 'x') {
    setS({ fg: s.bg, bg: s.fg });
    return;
  }
  if (k === 'd') {
    setS({ fg: '#000000', bg: '#ffffff' });
    return;
  }

  const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
  if (tool) {
    if (e.shiftKey && tool.id === s.tool && VARIANTS[tool.id]) {
      const v = VARIANTS[tool.id]!;
      const cur = String(s.opts[v.key]);
      const next = v.values[(v.values.indexOf(cur) + 1) % v.values.length];
      setOpts({ [v.key]: next } as Partial<ToolOptions>);
    } else setTool(tool.id);
    if (tool.id === 'crop') setS({ cropRect: null });
    invalidate();
  }
}

export function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'Alt' && S().screen === 'editor' && !isTyping(e.target)) e.preventDefault();
  ix.alt = e.altKey;
  ix.shift = e.shiftKey;
  ix.ctrl = e.ctrlKey || e.metaKey;
  if (e.key === ' ') ix.space = false;
  invalidate();
}

export function onBlur() {
  ix.space = false;
  ix.alt = ix.shift = ix.ctrl = false;
  invalidate();
}
