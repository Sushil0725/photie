import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { S, activeLayer, selectedLayers, setS } from '../store/editor';
import { cmd, kb, type MenuItem } from './actions';
import { arrange, flipSelected, rasterizeSelected, addMask, mergeSelected } from '../store/layers';
import { clearSelectionPixels, contentAwareFill, cropToSelection, deselect, invertSelection, selectLayerPixels } from '../store/image';
import { startTextEdit } from './canvas/tools';
import { useOutside } from './controls';

export function MenuList({ items, onClose, nested = false }: { items: MenuItem[]; onClose: () => void; nested?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={'menu-list' + (nested ? ' nested' : '')} role="menu">
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-divider" />
        ) : (
          <div
            key={i}
            className={'menu-item' + (it.disabled ? ' disabled' : '') + (open === i ? ' open' : '')}
            role="menuitem"
            onPointerEnter={() => setOpen(it.submenu ? i : null)}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if (it.submenu) {
                setOpen(open === i ? null : i);
                return;
              }
              onClose();
              it.action?.();
            }}
          >
            <span className="menu-check">{it.checked ? <Check size={14} /> : it.icon || null}</span>
            <span className="menu-label">{it.label}</span>
            {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
            {it.submenu && <ChevronRight size={14} className="menu-arrow" />}
            {it.submenu && open === i && !it.disabled && <SubMenu items={it.submenu} onClose={onClose} />}
          </div>
        ),
      )}
    </div>
  );
}

function SubMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  const [shiftY, setShiftY] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (r.right > window.innerWidth - 4) setFlip(true);
    if (r.bottom > window.innerHeight - 4) setShiftY(window.innerHeight - 4 - r.bottom);
  }, []);
  return (
    <div ref={ref} className={'submenu' + (flip ? ' flip' : '')} style={{ transform: `translateY(${shiftY}px)` }}>
      <MenuList items={items} onClose={onClose} nested />
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useOutside(ref, onClose);
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 6),
      top: Math.min(y, window.innerHeight - r.height - 6),
    });
  }, [x, y]);
  return createPortal(
    <div ref={ref} className="context-menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}

export function canvasContextItems(): MenuItem[] {
  const s = S();
  const sel = selectedLayers();
  const l = activeLayer();
  const items: MenuItem[] = [];
  if (s.selection) {
    items.push(
      { label: 'Deselect', shortcut: kb('Mod+D'), action: deselect },
      { label: 'Select Inverse', shortcut: kb('Mod+Shift+I'), action: invertSelection },
      { label: 'Layer via Copy', shortcut: kb('Mod+J'), action: cmd.layerViaCopy, disabled: !l },
      { label: 'Delete Pixels', shortcut: 'Del', action: clearSelectionPixels, disabled: !l },
      { label: 'Content-Aware Fill', action: contentAwareFill, disabled: !l },
      { label: 'Crop to Selection', action: cropToSelection },
      { divider: true },
    );
  }
  if (sel.length) {
    if (l?.type === 'text') items.push({ label: 'Edit Text', action: () => startTextEdit(l.id) });
    items.push(
      { label: 'Copy', shortcut: kb('Mod+C'), action: cmd.copy },
      { label: 'Paste', shortcut: kb('Mod+V'), action: cmd.paste, disabled: !s.clipboard },
      { label: 'Duplicate', shortcut: kb('Mod+J'), action: cmd.duplicate },
      { label: 'Delete', shortcut: 'Del', action: cmd.delete },
      { divider: true },
      {
        label: 'Arrange',
        submenu: [
          { label: 'Bring to Front', action: () => arrange('front') },
          { label: 'Bring Forward', action: () => arrange('forward') },
          { label: 'Send Backward', action: () => arrange('backward') },
          { label: 'Send to Back', action: () => arrange('back') },
        ],
      },
      { label: 'Flip Horizontal', action: () => flipSelected('h') },
      { label: 'Flip Vertical', action: () => flipSelected('v') },
      { divider: true },
      { label: sel.every((x) => x.locked) ? 'Unlock' : 'Lock', action: cmd.toggleLock },
      { label: 'Select Layer Pixels', action: () => selectLayerPixels() },
      { label: 'Add Layer Mask', action: () => addMask(true), disabled: !!l?.mask },
    );
    if (sel.some((x) => x.type !== 'raster')) items.push({ label: 'Rasterize', action: rasterizeSelected });
    if (sel.length > 1) items.push({ label: 'Merge Layers', action: mergeSelected });
    if (l?.type === 'raster') items.push({ label: 'Remove Background (AI)', action: () => import('../engine/ai').then((m) => m.removeBackground()) });
  } else {
    items.push(
      { label: 'Paste', shortcut: kb('Mod+V'), action: cmd.paste, disabled: !s.clipboard },
      { label: 'Add Text', action: cmd.addText },
      { label: 'Place Image…', action: cmd.place },
      { divider: true },
      { label: 'Change Background…', action: () => setS({ sidePanel: 'background' }) },
      { label: 'Resize Design…', action: () => setS({ dialog: { type: 'resize' } }) },
    );
  }
  return items;
}
