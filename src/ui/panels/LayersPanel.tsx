import { memo, useEffect, useRef, useState, type DragEvent } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Copy, Trash2, Type, Shapes, Image as ImageIcon, SquareDashed, Merge, ChevronDown, ChevronRight, Folder, FolderPlus, FolderMinus } from 'lucide-react';
import { findGroup, groupMembers } from '../../engine/groups';
import { layerThumbnail } from '../../engine/render';
import { BLEND_MODES, type Layer, type LayerGroup } from '../../engine/types';
import { S, commit, setS, useEditor } from '../../store/editor';
import {
  addMask,
  deleteLayers,
  duplicateLayers,
  mergeSelected,
  moveGroupNextTo,
  moveLayerNextTo,
  newEmptyLayer,
  selectGroup,
  selectedGroup,
  selectLayers,
  toggleGroup,
  toggleGroupLock,
  toggleGroupVisibility,
  toggleSelectLayer,
  updateGroup,
  updateLayer,
} from '../../store/layers';
import { selectLayerPixels } from '../../store/image';
import { NumberField, Select } from '../controls';
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

type DragItem = { kind: 'layer' | 'group'; id: string };
type Where = 'above' | 'below';
const DND_LAYER = 'text/x-layer';
const DND_GROUP = 'text/x-group';

/** Drag-and-drop handlers shared by layer and group rows. Rows are listed top-first. */
function useRowDnd(item: DragItem, enabled: boolean, onDrop: (item: DragItem, where: Where) => void) {
  const [over, setOver] = useState<Where | null>(null);
  const whereOf = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? 'above' : 'below';
  };
  return {
    over,
    props: {
      draggable: enabled,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(item.kind === 'group' ? DND_GROUP : DND_LAYER, item.id);
      },
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_LAYER) && !e.dataTransfer.types.includes(DND_GROUP)) return;
        e.preventDefault();
        setOver(whereOf(e));
      },
      onDragLeave: () => setOver(null),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(null);
        const g = e.dataTransfer.getData(DND_GROUP);
        const l = e.dataTransfer.getData(DND_LAYER);
        if (g) onDrop({ kind: 'group', id: g }, whereOf(e));
        else if (l) onDrop({ kind: 'layer', id: l }, whereOf(e));
      },
    },
  };
}

function LayerRow({ layer, index, selected, editMask, inGroup, onDrop }: { layer: Layer; index: number; selected: boolean; editMask: boolean; inGroup: boolean; onDrop: (item: DragItem, where: Where) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  const dnd = useRowDnd({ kind: 'layer', id: layer.id }, !editing, onDrop);
  const icon = layer.type === 'text' ? <Type size={12} /> : layer.type === 'shape' ? <Shapes size={12} /> : <ImageIcon size={12} />;
  return (
    <div
      className={'layer-row' + (selected ? ' selected' : '') + (layer.visible ? '' : ' hidden') + (inGroup ? ' in-group' : '') + (dnd.over ? ' drop-' + dnd.over : '')}
      {...dnd.props}
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

function GroupRow({ group, members, selected, onDrop }: { group: LayerGroup; members: Layer[]; selected: boolean; onDrop: (item: DragItem, where: Where) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const dnd = useRowDnd({ kind: 'group', id: group.id }, !editing, onDrop);
  const visible = members.some((l) => l.visible);
  const locked = members.every((l) => l.locked);
  return (
    <div
      className={'layer-row group-row' + (selected ? ' selected' : '') + (visible ? '' : ' hidden') + (dnd.over ? ' drop-' + dnd.over : '')}
      {...dnd.props}
      onClick={(e) => selectGroup(group.id, e.ctrlKey || e.metaKey || e.shiftKey)}
    >
      <button
        className="icon-btn tiny"
        title={visible ? 'Hide group' : 'Show group'}
        onClick={(e) => {
          e.stopPropagation();
          toggleGroupVisibility(group.id);
        }}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button
        className="icon-btn tiny group-chevron"
        title={group.collapsed ? 'Expand group' : 'Collapse group'}
        onClick={(e) => {
          e.stopPropagation();
          updateGroup(group.id, { collapsed: !group.collapsed });
        }}
      >
        {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      <div className="thumb-wrap group-thumb">
        <Folder size={18} />
      </div>
      <div className="layer-name">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== group.name) updateGroup(group.id, { name: name.trim() }, 'Rename group');
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(group.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setName(group.name);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {group.name}
          </span>
        )}
        <small>
          {members.length} {members.length === 1 ? 'layer' : 'layers'}
          {group.blend !== 'source-over' && ' · ' + BLEND_MODES.find((b) => b.value === group.blend)?.label}
          {group.opacity < 1 && ` · ${Math.round(group.opacity * 100)}%`}
        </small>
      </div>
      <button
        className={'icon-btn tiny' + (locked ? ' on' : ' faint')}
        title={locked ? 'Unlock group' : 'Lock group'}
        onClick={(e) => {
          e.stopPropagation();
          toggleGroupLock(group.id);
        }}
      >
        {locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
    </div>
  );
}

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editMask = useEditor((s) => s.editMask);
  useEditor((s) => s.selectedGroupId);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!doc) return null;
  const active = doc.layers.find((l) => l.id === selectedIds[selectedIds.length - 1]);
  const selGroup = selectedGroup();

  const dropOnLayer = (item: DragItem, target: Layer, where: Where) => {
    if (item.kind === 'layer') moveLayerNextTo(item.id, target.id, where, target.group ?? null);
    else if (target.group !== item.id) moveGroupNextTo(item.id, target.id, where);
  };
  const dropOnGroup = (item: DragItem, g: LayerGroup, where: Where) => {
    const members = groupMembers(doc, g.id);
    const top = members[members.length - 1];
    const bottom = members[0];
    if (!top) return;
    if (item.kind === 'group') {
      if (item.id !== g.id) moveGroupNextTo(item.id, where === 'above' ? top.id : bottom.id, where);
    } else if (where === 'above') moveLayerNextTo(item.id, top.id, 'above', null);
    // Below an open group's header means "into the group"; below a collapsed one means after it.
    else if (g.collapsed) moveLayerNextTo(item.id, bottom.id, 'below', null);
    else moveLayerNextTo(item.id, top.id, 'above', g.id);
  };

  // Top-first rows; a group's header sits above its members, which are hidden when collapsed.
  const rows: React.ReactNode[] = [];
  const seen = new Set<string>();
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    const g = findGroup(doc, l.group);
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      rows.push(<GroupRow key={'g:' + g.id} group={g} members={groupMembers(doc, g.id)} selected={selGroup?.id === g.id} onDrop={(item, where) => dropOnGroup(item, g, where)} />);
    }
    if (g?.collapsed) continue;
    rows.push(
      <LayerRow
        key={l.id}
        layer={l}
        index={i}
        inGroup={!!g}
        selected={selectedIds.includes(l.id)}
        editMask={editMask}
        onDrop={(item, where) => dropOnLayer(item, l, where)}
      />,
    );
  }

  return (
    <div className="layers-panel">
      <div className="layers-top">
        <Select
          value={selGroup ? selGroup.blend : active?.blend || 'source-over'}
          options={BLEND_MODES}
          onChange={(v) => {
            if (selGroup) updateGroup(selGroup.id, { blend: v }, 'Group blend mode');
            else if (active) updateLayer(active.id, { blend: v }, 'Blend mode');
          }}
          title={selGroup ? 'Group blend mode' : 'Blend mode'}
        />
        <div className="opacity-field" title={selGroup ? 'Group opacity' : 'Layer opacity'}>
          <span>Opacity</span>
          <NumberField
            value={Math.round((selGroup ? selGroup.opacity : active ? active.opacity : 1) * 100)}
            min={0}
            max={100}
            unit="%"
            width={64}
            onChange={(v) => {
              if (selGroup) updateGroup(selGroup.id, { opacity: v / 100 }, 'Group opacity');
              else if (active) updateLayer(active.id, { opacity: v / 100 }, 'Opacity');
            }}
          />
        </div>
      </div>
      <div
        className="layer-list"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {rows}
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
        <button className="icon-btn" title={selGroup ? 'Ungroup (Ctrl+Shift+G)' : 'Group layers (Ctrl+G)'} disabled={!selectedIds.length} onClick={toggleGroup}>
          {selGroup ? <FolderMinus size={16} /> : <FolderPlus size={16} />}
        </button>
        <button className="icon-btn" title="Add layer mask" disabled={!active || !!active.mask} onClick={() => addMask(true)}>
          <SquareDashed size={16} />
        </button>
        <button className="icon-btn" title="Merge (Ctrl+E)" disabled={!selectedIds.length} onClick={mergeSelected}>
          <Merge size={16} />
        </button>
        <button className="icon-btn danger" title="Delete layer" disabled={!selectedIds.length} onClick={() => deleteLayers()}>
          <Trash2 size={16} />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={canvasContextItems()} onClose={() => setMenu(null)} />}
    </div>
  );
}
