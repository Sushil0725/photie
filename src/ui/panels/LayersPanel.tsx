import { memo, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Copy, Trash2, Type, Shapes, Image as ImageIcon, SquareDashed, Merge, FolderPlus } from 'lucide-react';
import { layerThumbnail } from '../../engine/render';
import { BLEND_MODES, type Layer } from '../../engine/types';
import { S, commit, setS, useEditor } from '../../store/editor';
import { addMask, deleteLayers, duplicateLayers, mergeSelected, moveLayerTo, newEmptyLayer, selectLayers, toggleSelectLayer, updateLayer } from '../../store/layers';
import { selectLayerPixels } from '../../store/image';
import { Select } from '../controls';
import { ContextMenu, canvasContextItems } from '../ContextMenu';

const Thumb = memo(function Thumb({ layer, mask }: { layer: Layer; mask?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const t = setTimeout(() => {
      if (mask && layer.mask) {
        const ctx = c.getContext('2d')!;
        c.width = c.height = 64;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 64, 64);
        const s = Math.min(64 / layer.mask.width, 64 / layer.mask.height);
        const w = layer.mask.width * s,
          h = layer.mask.height * s;
        // Show the alpha mask as white-on-black like Photoshop.
        const tmp = document.createElement('canvas');
        tmp.width = 64;
        tmp.height = 64;
        const t2 = tmp.getContext('2d')!;
        t2.drawImage(layer.mask, (64 - w) / 2, (64 - h) / 2, w, h);
        t2.globalCompositeOperation = 'source-in';
        t2.fillStyle = '#fff';
        t2.fillRect(0, 0, 64, 64);
        ctx.drawImage(tmp, 0, 0);
      } else layerThumbnail(layer, 64, c);
    }, 30);
    return () => clearTimeout(t);
  }, [layer, mask]);
  return <canvas ref={ref} width={64} height={64} className="layer-thumb" />;
});

function LayerRow({ layer, index, selected, editMask, onDragStart, onDropAt }: { layer: Layer; index: number; selected: boolean; editMask: boolean; onDragStart: (id: string) => void; onDropAt: (index: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  const [over, setOver] = useState<'above' | 'below' | null>(null);
  const icon = layer.type === 'text' ? <Type size={12} /> : layer.type === 'shape' ? <Shapes size={12} /> : <ImageIcon size={12} />;
  return (
    <div
      className={'layer-row' + (selected ? ' selected' : '') + (layer.visible ? '' : ' hidden') + (over ? ' drop-' + over : '')}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-layer', layer.id);
        onDragStart(layer.id);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/x-layer')) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setOver(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        // Rows are listed top-first, so "above" means a higher stack index.
        onDropAt(over === 'above' ? index + 1 : index);
        setOver(null);
      }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          if ((e.target as HTMLElement).closest('.layer-thumb')) selectLayerPixels(layer);
          else toggleSelectLayer(layer.id);
        } else if (e.shiftKey) {
          const s = S();
          const doc = s.doc!;
          const last = s.selectedIds[s.selectedIds.length - 1];
          const a = doc.layers.findIndex((l) => l.id === last);
          if (a < 0) return selectLayers([layer.id]);
          const [lo, hi] = a < index ? [a, index] : [index, a];
          selectLayers(doc.layers.slice(lo, hi + 1).map((l) => l.id));
        } else selectLayers([layer.id]);
      }}
    >
      <button
        className="icon-btn tiny"
        title={layer.visible ? 'Hide' : 'Show'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayer(layer.id, { visible: !layer.visible }, layer.visible ? 'Hide layer' : 'Show layer');
        }}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <div
        className={'thumb-wrap' + (selected && !editMask ? ' target' : '')}
        onClick={(e) => {
          if (selected && layer.mask) {
            e.stopPropagation();
            setS({ editMask: false });
          }
        }}
      >
        <Thumb layer={layer} />
      </div>
      {layer.mask && (
        <div
          className={'thumb-wrap mask' + (selected && editMask ? ' target' : '') + (layer.maskEnabled === false ? ' disabled' : '')}
          title="Layer mask — click to edit, Shift+click to disable"
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey) {
              updateLayer(layer.id, { maskEnabled: layer.maskEnabled === false }, 'Toggle mask');
              return;
            }
            setS({ selectedIds: [layer.id], editMask: true });
          }}
        >
          <Thumb layer={layer} mask />
        </div>
      )}
      <div className="layer-name">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== layer.name) updateLayer(layer.id, { name: name.trim() }, 'Rename layer');
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(layer.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setName(layer.name);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {layer.name}
          </span>
        )}
        <small>
          {icon}
          {layer.blend !== 'source-over' && BLEND_MODES.find((b) => b.value === layer.blend)?.label}
          {layer.opacity < 1 && ` ${Math.round(layer.opacity * 100)}%`}
        </small>
      </div>
      <button
        className={'icon-btn tiny' + (layer.locked ? ' on' : ' faint')}
        title={layer.locked ? 'Unlock' : 'Lock'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayer(layer.id, { locked: !layer.locked }, layer.locked ? 'Unlock' : 'Lock');
        }}
      >
        {layer.locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
    </div>
  );
}

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editMask = useEditor((s) => s.editMask);
  const [drag, setDrag] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!doc) return null;
  const active = doc.layers.find((l) => l.id === selectedIds[selectedIds.length - 1]);
  const rows = [...doc.layers].map((l, i) => ({ l, i })).reverse();

  return (
    <div className="layers-panel">
      <div className="layers-top">
        <Select
          value={active?.blend || 'source-over'}
          options={BLEND_MODES}
          onChange={(v) => active && updateLayer(active.id, { blend: v }, 'Blend mode')}
          title="Blend mode"
        />
        <label className="opacity-field" title="Layer opacity">
          <span>Opacity</span>
          <input
            type="number"
            min={0}
            max={100}
            value={active ? Math.round(active.opacity * 100) : 100}
            disabled={!active}
            onChange={(e) => active && updateLayer(active.id, { opacity: Math.min(100, Math.max(0, +e.target.value)) / 100 }, 'Opacity')}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      </div>
      <div
        className="layer-list"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {rows.map(({ l, i }) => (
          <LayerRow
            key={l.id}
            layer={l}
            index={i}
            selected={selectedIds.includes(l.id)}
            editMask={editMask}
            onDragStart={setDrag}
            onDropAt={(idx) => {
              if (!drag) return;
              const from = doc.layers.findIndex((x) => x.id === drag);
              moveLayerTo(drag, from < idx ? idx - 1 : idx);
              setDrag(null);
            }}
          />
        ))}
        <div
          className={'layer-row background-row' + (selectedIds.length === 0 ? ' selected' : '')}
          onClick={() => {
            selectLayers([]);
            setS({ sidePanel: 'background' });
          }}
          title="Document background"
        >
          <span className="icon-btn tiny" />
          <div className="thumb-wrap">
            <div className="bg-thumb" style={{ background: doc.background ? (doc.background.type === 'solid' ? doc.background.color : '#ccc') : 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/10px 10px' }} />
          </div>
          <div className="layer-name">
            <span>Background</span>
            <small>{doc.background ? 'Fill' : 'Transparent'}</small>
          </div>
          {doc.background && (
            <button
              className="icon-btn tiny faint"
              title="Make transparent"
              onClick={(e) => {
                e.stopPropagation();
                commit('Transparent background', { ...doc, background: null });
              }}
            >
              <EyeOff size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="layers-actions">
        <button className="icon-btn" title="New layer (Ctrl+Shift+N)" onClick={newEmptyLayer}>
          <Plus size={16} />
        </button>
        <button className="icon-btn" title="Duplicate (Ctrl+J)" disabled={!selectedIds.length} onClick={() => duplicateLayers(selectedIds, 20)}>
          <Copy size={16} />
        </button>
        <button className="icon-btn" title="Add layer mask" disabled={!active || !!active.mask} onClick={() => addMask(true)}>
          <SquareDashed size={16} />
        </button>
        <button className="icon-btn" title="Merge (Ctrl+E)" disabled={!selectedIds.length} onClick={mergeSelected}>
          <Merge size={16} />
        </button>
        <button className="icon-btn" title="Select all layers" onClick={() => selectLayers(doc.layers.map((l) => l.id))}>
          <FolderPlus size={16} />
        </button>
        <button className="icon-btn danger" title="Delete layer" disabled={!selectedIds.length} onClick={() => deleteLayers()}>
          <Trash2 size={16} />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={canvasContextItems()} onClose={() => setMenu(null)} />}
    </div>
  );
}
