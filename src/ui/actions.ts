import type { ReactNode } from 'react';
import { FILTERS, defaultParams, filterById } from '../data/filters';
import { createTextLayer } from '../engine/document';
import { isMac, pickFiles } from '../engine/util';
import { S, activeLayer, redo, setS, setTool, undo, selectedLayers, toast } from '../store/editor';
import { copy, cut, downloadProject, goHome, IMAGE_ACCEPT, openFile, pasteInternal, placeImageFiles, saveNow } from '../store/files';
import {
  applyPixelOp,
  clearSelectionPixels,
  contentAwareFill,
  cropToSelection,
  deselect,
  fillSelection,
  flipCanvas,
  invertSelection,
  modifySelection,
  rotateCanvas,
  selectAll,
  selectLayerPixels,
  trimTransparent,
} from '../store/image';
import {
  groupSelected,
  ungroupSelected,
  addLayer,
  addMask,
  align,
  applyMask,
  arrange,
  deleteLayers,
  deleteMask,
  distribute,
  duplicateLayers,
  flattenImage,
  flipSelected,
  invertMaskOfActive,
  mergeSelected,
  mergeVisible,
  newEmptyLayer,
  rasterizeSelected,
  rotateSelected,
  selectLayers,
  updateSelected,
} from '../store/layers';
import { actualSize, fitToScreen, zoomIn, zoomOut } from '../store/view';
import { applyCrop } from './canvas/tools';

export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
  divider?: boolean;
  icon?: ReactNode;
}

const mod = isMac ? '⌘' : 'Ctrl+';
const shift = isMac ? '⇧' : 'Shift+';
const alt = isMac ? '⌥' : 'Alt+';
export const kb = (s: string) => s.replace('Mod+', mod).replace('Shift+', shift).replace('Alt+', alt);

/* --------------------------------- Commands --------------------------------- */

export const cmd = {
  newDoc: () => setS({ dialog: { type: 'new' } }),
  open: async () => {
    const [f] = await pickFiles(IMAGE_ACCEPT);
    if (f) openFile(f);
  },
  place: async () => {
    const files = await pickFiles('image/*,.psd', true);
    if (files.length) placeImageFiles(files);
  },
  save: () => {
    saveNow().then(() => toast('Saved to your browser', 'success'));
  },
  downloadProject,
  export: () => setS({ dialog: { type: 'export' } }),
  home: () => goHome(),
  undo,
  redo,
  cut,
  copy,
  paste: () => {
    if (!pasteInternal()) toast('Nothing to paste. Use Ctrl+V to paste images from other apps.');
  },
  duplicate: () => duplicateLayers(S().selectedIds, 20),
  layerViaCopy: () => {
    const s = S();
    if (s.selection && activeLayer()) {
      copy();
      pasteInternal();
    } else duplicateLayers(s.selectedIds, 0);
  },
  delete: () => {
    const s = S();
    if (s.selection && activeLayer()) clearSelectionPixels();
    else deleteLayers();
  },
  selectAllLayers: () => selectLayers(S().doc?.layers.filter((l) => !l.locked).map((l) => l.id) || []),
  filter: (id: string) => {
    const f = filterById(id);
    if (!f) return;
    if (!activeLayer()) return toast('Select a layer to apply ' + f.name, 'error');
    if (f.instant) applyPixelOp(f.name, (img) => f.apply(img, defaultParams(f)));
    else setS({ dialog: { type: 'filter', id } });
  },
  freeTransform: () => {
    setTool('move');
    if (!S().selectedIds.length && S().doc?.layers.length) selectLayers([S().doc!.layers[S().doc!.layers.length - 1].id]);
  },
  addText: () => {
    const doc = S().doc;
    if (!doc) return;
    addLayer(createTextLayer(doc, { text: 'Your text here', size: Math.round(Math.min(doc.width, doc.height) / 12), weight: 700, fill: { type: 'solid', color: S().fg === '#ffffff' ? '#111111' : S().fg } }), 'Add text');
    setTool('move');
  },
  toggleLock: () => {
    const ls = selectedLayers();
    if (!ls.length) return;
    const lock = !ls.every((l) => l.locked);
    updateSelected({ locked: lock }, lock ? 'Lock' : 'Unlock');
  },
  toggleVisible: () => {
    const ls = selectedLayers();
    if (!ls.length) return;
    const v = !ls.every((l) => l.visible);
    updateSelected({ visible: v }, v ? 'Show layer' : 'Hide layer');
  },
};

/* ---------------------------------- Menus ---------------------------------- */

export function buildMenus(): { id: string; label: string; items: MenuItem[] }[] {
  const s = S();
  const hasDoc = !!s.doc;
  const hasLayer = !!activeLayer();
  const hasSel = !!s.selection;
  const layer = activeLayer();
  const nSel = s.selectedIds.length;
  const filterItems = (menu: string) =>
    FILTERS.filter((f) => f.menu === menu).map((f) => ({ label: f.name + (f.instant ? '' : '…'), action: () => cmd.filter(f.id), disabled: !hasLayer }));

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New…', shortcut: kb('Mod+N'), action: cmd.newDoc },
        { label: 'Open…', shortcut: kb('Mod+O'), action: cmd.open },
        { label: 'Place Image…', shortcut: kb('Mod+Shift+P'), action: cmd.place, disabled: !hasDoc },
        { divider: true },
        { label: 'Save (in browser)', shortcut: kb('Mod+S'), action: cmd.save, disabled: !hasDoc },
        { label: 'Download Project (.photie)', action: cmd.downloadProject, disabled: !hasDoc },
        { label: 'Export / Download…', shortcut: kb('Mod+Shift+S'), action: cmd.export, disabled: !hasDoc },
        { divider: true },
        { label: 'Resize Design…', action: () => setS({ dialog: { type: 'resize' } }), disabled: !hasDoc },
        { divider: true },
        { label: 'Home / My Designs', action: cmd.home },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Undo' + (s.presentLabel && s.past.length ? ' ' + s.presentLabel : ''), shortcut: kb('Mod+Z'), action: undo, disabled: !s.past.length },
        { label: 'Redo' + (s.future.length ? ' ' + s.future[0].label : ''), shortcut: kb('Mod+Shift+Z'), action: redo, disabled: !s.future.length },
        { divider: true },
        { label: 'Cut', shortcut: kb('Mod+X'), action: cut, disabled: !nSel },
        { label: 'Copy', shortcut: kb('Mod+C'), action: copy, disabled: !nSel },
        { label: 'Paste', shortcut: kb('Mod+V'), action: cmd.paste, disabled: !s.clipboard },
        { label: 'Duplicate', shortcut: kb('Mod+D'), action: cmd.duplicate, disabled: !nSel },
        { label: 'Delete', shortcut: 'Del', action: cmd.delete, disabled: !nSel },
        { divider: true },
        { label: 'Fill with Foreground', shortcut: kb('Alt+Backspace'), action: () => fillSelection(S().fg), disabled: !hasLayer },
        { label: 'Fill with Background', shortcut: kb('Mod+Backspace'), action: () => fillSelection(S().bg), disabled: !hasLayer },
        { label: 'Content-Aware Fill (Remove)', shortcut: kb('Shift+Backspace'), action: contentAwareFill, disabled: !hasSel || !hasLayer },
        { divider: true },
        { label: 'Free Transform', shortcut: kb('Mod+T'), action: cmd.freeTransform, disabled: !hasDoc },
        {
          label: 'Transform',
          disabled: !nSel,
          submenu: [
            { label: 'Rotate 90° Clockwise', action: () => rotateSelected(90) },
            { label: 'Rotate 90° Counter-clockwise', action: () => rotateSelected(-90) },
            { label: 'Rotate 180°', action: () => rotateSelected(180) },
            { divider: true },
            { label: 'Flip Horizontal', action: () => flipSelected('h') },
            { label: 'Flip Vertical', action: () => flipSelected('v') },
          ],
        },
      ],
    },
    {
      id: 'image',
      label: 'Image',
      items: [
        {
          label: 'Adjustments',
          disabled: !hasLayer,
          submenu: [...filterItems('adjust')],
        },
        ...filterItems('auto').map((i) => ({ ...i, shortcut: i.label === 'Auto Tone' ? kb('Mod+Shift+L') : undefined })),
        { divider: true },
        { label: 'Image Size…', shortcut: kb('Mod+Alt+I'), action: () => setS({ dialog: { type: 'imageSize' } }), disabled: !hasDoc },
        { label: 'Canvas Size…', shortcut: kb('Mod+Alt+C'), action: () => setS({ dialog: { type: 'canvasSize' } }), disabled: !hasDoc },
        {
          label: 'Image Rotation',
          disabled: !hasDoc,
          submenu: [
            { label: '180°', action: () => rotateCanvas(180) },
            { label: '90° Clockwise', action: () => rotateCanvas(90) },
            { label: '90° Counter-clockwise', action: () => rotateCanvas(-90) },
            { divider: true },
            { label: 'Flip Canvas Horizontal', action: () => flipCanvas('h') },
            { label: 'Flip Canvas Vertical', action: () => flipCanvas('v') },
          ],
        },
        { divider: true },
        { label: 'Crop to Selection', action: cropToSelection, disabled: !hasSel },
        { label: 'Apply Crop', action: applyCrop, disabled: s.tool !== 'crop' },
        { label: 'Trim Transparent Pixels', action: trimTransparent, disabled: !hasDoc },
      ],
    },
    {
      id: 'layer',
      label: 'Layer',
      items: [
        { label: 'New Layer', shortcut: kb('Mod+Shift+N'), action: newEmptyLayer, disabled: !hasDoc },
        { label: 'New Text Layer', action: cmd.addText, disabled: !hasDoc },
        { label: 'Duplicate Layer', shortcut: kb('Mod+J'), action: cmd.layerViaCopy, disabled: !nSel },
        { label: 'Delete Layer', action: () => deleteLayers(), disabled: !nSel },
        { divider: true },
        { label: 'Group Layers', shortcut: kb('Mod+G'), action: groupSelected, disabled: !nSel },
        { label: 'Ungroup Layers', shortcut: kb('Mod+Shift+G'), action: ungroupSelected, disabled: !selectedLayers().some((l) => l.group) },
        { divider: true },
        {
          label: 'Layer Mask',
          disabled: !hasLayer,
          submenu: [
            { label: hasSel ? 'Add Mask from Selection' : 'Add Mask (Reveal All)', action: () => addMask(true), disabled: !!layer?.mask },
            { label: 'Edit Mask', checked: s.editMask, action: () => setS({ editMask: !s.editMask }), disabled: !layer?.mask },
            { label: 'Invert Mask', action: invertMaskOfActive, disabled: !layer?.mask },
            { label: 'Apply Mask', action: applyMask, disabled: !layer?.mask },
            { label: 'Delete Mask', action: deleteMask, disabled: !layer?.mask },
          ],
        },
        { label: 'Rasterize', action: rasterizeSelected, disabled: !nSel || selectedLayers().every((l) => l.type === 'raster') },
        { divider: true },
        {
          label: 'Arrange',
          disabled: !nSel,
          submenu: [
            { label: 'Bring to Front', shortcut: kb('Mod+Shift+]'), action: () => arrange('front') },
            { label: 'Bring Forward', shortcut: kb('Mod+]'), action: () => arrange('forward') },
            { label: 'Send Backward', shortcut: kb('Mod+['), action: () => arrange('backward') },
            { label: 'Send to Back', shortcut: kb('Mod+Shift+['), action: () => arrange('back') },
          ],
        },
        {
          label: nSel > 1 ? 'Align Layers' : 'Align to Canvas',
          disabled: !nSel,
          submenu: [
            { label: 'Left Edges', action: () => align('left') },
            { label: 'Horizontal Centers', action: () => align('hcenter') },
            { label: 'Right Edges', action: () => align('right') },
            { divider: true },
            { label: 'Top Edges', action: () => align('top') },
            { label: 'Vertical Centers', action: () => align('vcenter') },
            { label: 'Bottom Edges', action: () => align('bottom') },
            { divider: true },
            { label: 'Distribute Horizontally', action: () => distribute('h'), disabled: nSel < 3 },
            { label: 'Distribute Vertically', action: () => distribute('v'), disabled: nSel < 3 },
          ],
        },
        { divider: true },
        { label: nSel > 1 ? 'Merge Layers' : 'Merge Down', shortcut: kb('Mod+E'), action: mergeSelected, disabled: !nSel },
        { label: 'Merge Visible', shortcut: kb('Mod+Shift+E'), action: mergeVisible, disabled: !hasDoc },
        { label: 'Flatten Image', action: flattenImage, disabled: !hasDoc },
        { divider: true },
        { label: 'Lock / Unlock', shortcut: kb('Mod+/'), action: cmd.toggleLock, disabled: !nSel },
      ],
    },
    {
      id: 'select',
      label: 'Select',
      items: [
        { label: 'All', shortcut: kb('Mod+A'), action: selectAll, disabled: !hasDoc },
        { label: 'Deselect', shortcut: kb('Mod+D'), action: deselect, disabled: !hasSel },
        { label: 'Inverse', shortcut: kb('Mod+Shift+I'), action: invertSelection, disabled: !hasDoc },
        { divider: true },
        { label: 'All Layers', shortcut: kb('Mod+Alt+A'), action: cmd.selectAllLayers, disabled: !hasDoc },
        { label: 'Layer Pixels', action: () => selectLayerPixels(), disabled: !hasLayer },
        { label: 'Subject (AI)…', action: () => import('../engine/ai').then((m) => m.selectSubject()), disabled: !hasLayer },
        { divider: true },
        {
          label: 'Modify',
          disabled: !hasSel,
          submenu: [
            { label: 'Feather…', shortcut: kb('Shift+F6'), action: () => promptNumber('Feather selection', 'Feather radius (px)', 8, (v) => modifySelection('feather', v)) },
            { label: 'Expand…', action: () => promptNumber('Expand selection', 'Expand by (px)', 8, (v) => modifySelection('grow', v)) },
            { label: 'Contract…', action: () => promptNumber('Contract selection', 'Contract by (px)', 8, (v) => modifySelection('shrink', v)) },
            { label: 'Border…', action: () => promptNumber('Border selection', 'Width (px)', 10, (v) => modifySelection('border', v)) },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'Filter',
      items: [
        { label: 'Blur', disabled: !hasLayer, submenu: filterItems('blur') },
        { label: 'Sharpen', disabled: !hasLayer, submenu: filterItems('sharpen') },
        { label: 'Noise', disabled: !hasLayer, submenu: filterItems('noise') },
        { label: 'Stylize', disabled: !hasLayer, submenu: filterItems('stylize') },
        { label: 'Distort', disabled: !hasLayer, submenu: filterItems('distort') },
        { label: 'Render', disabled: !hasLayer, submenu: filterItems('render') },
        { divider: true },
        { label: 'Remove Background (AI)', action: () => import('../engine/ai').then((m) => m.removeBackground()), disabled: !hasLayer },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: kb('Mod+='), action: () => zoomIn() },
        { label: 'Zoom Out', shortcut: kb('Mod+-'), action: () => zoomOut() },
        { label: 'Fit on Screen', shortcut: kb('Mod+0'), action: fitToScreen },
        { label: '100%', shortcut: kb('Mod+1'), action: actualSize },
        { divider: true },
        { label: 'Grid', shortcut: kb("Mod+'"), checked: s.showGrid, action: () => setS({ showGrid: !s.showGrid }) },
        { label: 'Smart Guides & Snapping', shortcut: kb('Mod+;'), checked: s.snap, action: () => setS({ snap: !s.snap }) },
        { divider: true },
        {
          label: 'Theme',
          submenu: [
            { label: 'Light', action: () => setTheme('light'), checked: getTheme() === 'light' },
            { label: 'Dark', action: () => setTheme('dark'), checked: getTheme() === 'dark' },
            { label: 'System', action: () => setTheme('system'), checked: getTheme() === 'system' },
          ],
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: '?', action: () => setS({ dialog: { type: 'shortcuts' } }) },
        { label: 'About Photie', action: () => setS({ dialog: { type: 'about' } }) },
      ],
    },
  ];
}

export function promptNumber(title: string, label: string, def: number, onOk: (v: number) => void) {
  setS({
    dialog: {
      type: 'prompt',
      title,
      label,
      value: String(def),
      onOk: (v) => {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) onOk(n);
      },
    },
  });
}

/* ---------------------------------- Theme ---------------------------------- */

export type Theme = 'light' | 'dark' | 'system';
export function getTheme(): Theme {
  try {
    return (localStorage.getItem('photie.theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}
export function setTheme(t: Theme) {
  try {
    localStorage.setItem('photie.theme', t);
  } catch {
    /* ignore */
  }
  applyTheme();
}
export function applyTheme() {
  const t = getTheme();
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  window.dispatchEvent(new Event('photie:theme'));
}
