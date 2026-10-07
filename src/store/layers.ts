import { createEmptyRaster, createRasterLayer, duplicateLayer } from '../engine/document';
import { layerBounds, layerMatrix, layerSize, unionRects } from '../engine/geometry';
import { findGroup, groupMembers, groupOfSelection, nextGroupName } from '../engine/groups';
import { drawLayerContent, layersRect, renderDocToCanvas, renderLayersToRect } from '../engine/render';
import type { Doc, Layer, LayerGroup, RasterLayer } from '../engine/types';
import { createCanvas, ctx2d, uid } from '../engine/util';
import { S, activeLayer, commit, selectedLayers, setS, toast } from './editor';

const docOf = (): Doc => S().doc!;

export function selectLayers(ids: string[]) {
  setS({ selectedIds: ids, selectedGroupId: null, editMask: false, editingTextId: null });
}

export function toggleSelectLayer(id: string) {
  const ids = S().selectedIds;
  selectLayers(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

export function addLayer(layer: Layer, label = 'Add layer', index?: number) {
  const doc = docOf();
  const layers = [...doc.layers];
  if (index === undefined) {
    // Insert above the active layer (Photoshop behaviour), or on top.
    const act = activeLayer();
    const ai = act ? layers.findIndex((l) => l.id === act.id) : -1;
    index = ai >= 0 ? ai + 1 : layers.length;
  }
  layers.splice(index, 0, layer);
  commit(label, { ...doc, layers }, { selectedIds: [layer.id], editMask: false });
}

export function addLayers(newLayers: Layer[], label: string, groups: LayerGroup[] = []) {
  const doc = docOf();
  const next = { ...doc, layers: [...doc.layers, ...newLayers], groups: groups.length ? [...(doc.groups || []), ...groups] : doc.groups };
  commit(label, next, { selectedIds: newLayers.map((l) => l.id), editMask: false, selectedGroupId: groups.length === 1 && newLayers.every((l) => l.group === groups[0].id) ? groups[0].id : null });
}

export function newEmptyLayer() {
  const doc = docOf();
  const n = doc.layers.filter((l) => l.name.startsWith('Layer ')).length + 1;
  addLayer(createEmptyRaster(doc, `Layer ${n}`), 'New layer');
}

export function deleteLayers(ids = S().selectedIds) {
  const doc = docOf();
  if (!ids.length) return;
  const set = new Set(ids);
  const remaining = doc.layers.filter((l) => !set.has(l.id));
  const idx = doc.layers.findIndex((l) => set.has(l.id));
  const next = remaining[Math.min(Math.max(0, idx - 1), remaining.length - 1)];
  commit(ids.length > 1 ? 'Delete layers' : 'Delete layer', { ...doc, layers: remaining }, { selectedIds: next ? [next.id] : [], editMask: false });
}

export function duplicateLayers(ids = S().selectedIds, offset = 0) {
  const doc = docOf();
  if (!ids.length) return;
  const set = new Set(ids);
  // A group duplicated as a whole becomes a new group just above the original; single members stay in their group.
  const groups = [...(doc.groups || [])];
  const copyOf = new Map<string, string>();
  for (const g of doc.groups || []) {
    const m = groupMembers(doc, g.id);
    if (m.length && m.every((l) => set.has(l.id))) {
      const ng = { ...g, id: uid(), name: g.name.endsWith(' copy') ? g.name : g.name + ' copy' };
      copyOf.set(g.id, ng.id);
      groups.push(ng);
    }
  }
  const layers: Layer[] = [];
  const newIds: string[] = [];
  let pending: Layer[] = [];
  doc.layers.forEach((l, i) => {
    layers.push(l);
    if (!set.has(l.id)) return;
    const d = duplicateLayer(l, offset);
    newIds.push(d.id);
    const ng = l.group ? copyOf.get(l.group) : undefined;
    if (!ng) {
      layers.push(d);
      return;
    }
    d.group = ng;
    pending.push(d);
    if (doc.layers[i + 1]?.group !== l.group) {
      layers.push(...pending);
      pending = [];
    }
  });
  const single = copyOf.size === 1 && groupOfSelection(doc, ids) ? [...copyOf.values()][0] : null;
  commit(copyOf.size ? 'Duplicate group' : 'Duplicate layer', { ...doc, layers, groups }, { selectedIds: newIds, selectedGroupId: single });
}

export function updateLayer(id: string, patch: Partial<Layer>, label = 'Edit layer') {
  const doc = docOf();
  commit(label, { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) });
}

export function updateSelected(patch: Partial<Layer> | ((l: Layer) => Partial<Layer>), label = 'Edit layer') {
  const doc = docOf();
  const set = new Set(S().selectedIds);
  if (!set.size) return;
  commit(label, {
    ...doc,
    layers: doc.layers.map((l) => (set.has(l.id) ? ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) } as Layer) : l)),
  });
}

/** Moves a layer to a new index in the stack (0 = bottom). */
export function moveLayerTo(id: string, index: number) {
  const doc = docOf();
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return;
  const layers = [...doc.layers];
  const [l] = layers.splice(from, 1);
  layers.splice(Math.max(0, Math.min(layers.length, index)), 0, l);
  commit('Reorder layers', { ...doc, layers });
}

/** Moves layer `id` directly above or below `targetId` and makes it a member of `group` (null = no group). */
export function moveLayerNextTo(id: string, targetId: string, where: 'above' | 'below', group: string | null) {
  const doc = docOf();
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) return;
  if (id === targetId) {
    // Dropped next to itself: only the group membership can change (e.g. dragged out of the top of its group).
    if ((layer.group ?? null) !== group) commit('Reorder layers', { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, group } as Layer) : l)) });
    return;
  }
  const layers = doc.layers.filter((l) => l.id !== id);
  const t = layers.findIndex((l) => l.id === targetId);
  if (t < 0) return;
  layers.splice(where === 'above' ? t + 1 : t, 0, { ...layer, group } as Layer);
  commit('Reorder layers', { ...doc, layers });
}

/** Moves a whole group above or below a layer (or that layer's group, since groups do not nest). */
export function moveGroupNextTo(gid: string, targetId: string, where: 'above' | 'below') {
  const doc = docOf();
  const members = groupMembers(doc, gid);
  const layers = doc.layers.filter((l) => l.group !== gid);
  let t = layers.findIndex((l) => l.id === targetId);
  if (!members.length || t < 0) return;
  const tg = layers[t].group;
  if (tg) {
    const idx = layers.map((l, i) => (l.group === tg ? i : -1)).filter((i) => i >= 0);
    t = where === 'above' ? idx[idx.length - 1] : idx[0];
  }
  layers.splice(where === 'above' ? t + 1 : t, 0, ...members);
  commit('Reorder layers', { ...doc, layers });
}

function arrangeUnits<T>(units: T[], isSel: (u: T) => boolean, dir: 'front' | 'forward' | 'backward' | 'back'): T[] {
  const u = [...units];
  if (dir === 'front') return [...u.filter((x) => !isSel(x)), ...u.filter(isSel)];
  if (dir === 'back') return [...u.filter(isSel), ...u.filter((x) => !isSel(x))];
  if (dir === 'forward') {
    for (let i = u.length - 2; i >= 0; i--) if (isSel(u[i]) && !isSel(u[i + 1])) [u[i], u[i + 1]] = [u[i + 1], u[i]];
  } else {
    for (let i = 1; i < u.length; i++) if (isSel(u[i]) && !isSel(u[i - 1])) [u[i], u[i - 1]] = [u[i - 1], u[i]];
  }
  return u;
}

export function arrange(dir: 'front' | 'forward' | 'backward' | 'back') {
  const doc = docOf();
  const set = new Set(S().selectedIds);
  if (!set.size) return;
  const sel = doc.layers.filter((l) => set.has(l.id));
  const g = sel[0]?.group;
  let layers: Layer[];
  if (g && sel.every((l) => l.group === g) && doc.layers.some((l) => l.group === g && !set.has(l.id))) {
    // Some members of one group: reorder inside the group.
    const start = doc.layers.findIndex((l) => l.group === g);
    const members = groupMembers(doc, g);
    const moved = arrangeUnits(members, (l) => set.has(l.id), dir);
    layers = [...doc.layers.slice(0, start), ...moved, ...doc.layers.slice(start + members.length)];
  } else {
    // Groups move as one block.
    const units: Layer[][] = [];
    for (const l of doc.layers) {
      const last = units[units.length - 1];
      if (l.group && last && last[0].group === l.group) last.push(l);
      else units.push([l]);
    }
    layers = arrangeUnits(units, (u) => u.some((l) => set.has(l.id)), dir).flat();
  }
  commit('Arrange', { ...doc, layers });
}

/* ---------------------------------- Groups ---------------------------------- */

/** Puts the selected layers into a new group where the topmost of them was (Ctrl+G). */
export function groupSelected() {
  const doc = docOf();
  const set = new Set(S().selectedIds);
  const sel = doc.layers.filter((l) => set.has(l.id));
  if (!sel.length) {
    toast('Select layers to group', 'error');
    return;
  }
  const top = doc.layers.findIndex((l) => l.id === sel[sel.length - 1].id);
  const rest = doc.layers.filter((l) => !set.has(l.id));
  let at = doc.layers.slice(0, top).filter((l) => !set.has(l.id)).length;
  // Never land inside another group (groups do not nest): move above it instead.
  while (at > 0 && at < rest.length && rest[at - 1].group && rest[at - 1].group === rest[at].group) at++;
  const group: LayerGroup = { id: uid(), name: nextGroupName(doc), opacity: 1, blend: 'source-over' };
  const members = sel.map((l) => ({ ...l, group: group.id }) as Layer);
  const layers = [...rest.slice(0, at), ...members, ...rest.slice(at)];
  commit('Group layers', { ...doc, layers, groups: [...(doc.groups || []), group] }, { selectedIds: members.map((m) => m.id), selectedGroupId: group.id });
}

/** Dissolves the groups of the selected layers, keeping their layers (Ctrl+Shift+G). */
export function ungroupSelected() {
  const doc = docOf();
  const set = new Set(S().selectedIds);
  const gids = new Set(doc.layers.filter((l) => set.has(l.id) && l.group).map((l) => l.group!));
  if (!gids.size) {
    toast('The selection is not in a group', 'error');
    return;
  }
  const layers = doc.layers.map((l) => (l.group && gids.has(l.group) ? ({ ...l, group: null } as Layer) : l));
  commit('Ungroup layers', { ...doc, layers, groups: (doc.groups || []).filter((g) => !gids.has(g.id)) });
}

/** Group if the selection is loose layers, ungroup if it is exactly a group. */
export function toggleGroup() {
  if (selectedGroup()) ungroupSelected();
  else groupSelected();
}

/** Updates a group's settings; without a label the change is not an undo step (e.g. collapsing). */
export function updateGroup(id: string, patch: Partial<LayerGroup>, label?: string) {
  const doc = docOf();
  if (!findGroup(doc, id)) return;
  const next = { ...doc, groups: (doc.groups || []).map((g) => (g.id === id ? { ...g, ...patch } : g)) };
  if (label) commit(label, next);
  else setS({ doc: next });
}

export function selectGroup(id: string, additive = false) {
  const ids = groupMembers(docOf(), id).map((l) => l.id);
  if (additive) selectLayers([...new Set([...S().selectedIds, ...ids])]);
  else setS({ selectedIds: ids, selectedGroupId: id, editMask: false, editingTextId: null });
}

/** The group the user picked as a whole, if the selection still matches it. */
export function selectedGroup(): LayerGroup | null {
  const s = S();
  if (!s.doc || !s.selectedGroupId) return null;
  const g = groupOfSelection(s.doc, s.selectedIds);
  return g && g.id === s.selectedGroupId ? g : null;
}

/** Shows or hides every member (hidden if any member is visible). */
export function toggleGroupVisibility(id: string) {
  const doc = docOf();
  const show = !groupMembers(doc, id).some((l) => l.visible);
  commit(show ? 'Show group' : 'Hide group', { ...doc, layers: doc.layers.map((l) => (l.group === id ? ({ ...l, visible: show } as Layer) : l)) });
}

export function toggleGroupLock(id: string) {
  const doc = docOf();
  const lock = !groupMembers(doc, id).every((l) => l.locked);
  commit(lock ? 'Lock group' : 'Unlock group', { ...doc, layers: doc.layers.map((l) => (l.group === id ? ({ ...l, locked: lock } as Layer) : l)) });
}

/** Converts a text or shape layer into pixels, keeping its placement. */
export function rasterizeLayerObject(l: Layer): RasterLayer {
  if (l.type === 'raster') return l;
  const { w, h } = layerSize(l);
  let pad = 2;
  if (l.type === 'shape') pad += l.strokeWidth;
  if (l.type === 'text') pad += (l.outline?.width || 0) * 2 + (l.background?.padding || 0) * 1.5;
  pad = Math.ceil(pad);
  const c = createCanvas(w + pad * 2, h + pad * 2);
  const ctx = ctx2d(c);
  ctx.translate(pad, pad);
  drawLayerContent(ctx, l);
  let mask: HTMLCanvasElement | null = null;
  if (l.mask) {
    mask = createCanvas(c.width, c.height);
    ctx2d(mask).drawImage(l.mask, pad, pad, w, h);
  }
  const {
    id,
    name,
    visible,
    locked,
    opacity,
    blend,
    x,
    y,
    rotation,
    scaleX,
    scaleY,
    adjust,
    shadow,
    maskEnabled,
    group,
  } = l;
  return { id, name, visible, locked, opacity, blend, x, y, rotation, scaleX, scaleY, adjust, shadow, mask, maskEnabled, group, type: 'raster', canvas: c };
}

export function rasterizeSelected() {
  const doc = docOf();
  const set = new Set(S().selectedIds);
  commit('Rasterize', { ...doc, layers: doc.layers.map((l) => (set.has(l.id) ? rasterizeLayerObject(l) : l)) });
}

/** Ensures the active layer is raster, rasterizing vector layers if needed. Returns it. */
export function ensureRasterActive(): RasterLayer | null {
  const l = activeLayer();
  if (!l) {
    toast('Select a layer first', 'error');
    return null;
  }
  if (l.locked) {
    toast('Layer is locked', 'error');
    return null;
  }
  if (l.type === 'raster') return l;
  const r = rasterizeLayerObject(l);
  const doc = docOf();
  commit('Rasterize', { ...doc, layers: doc.layers.map((x) => (x.id === l.id ? r : x)) });
  toast(`"${l.name}" was rasterized for pixel editing`);
  return r;
}

export function mergeDown() {
  const doc = docOf();
  const act = activeLayer();
  if (!act) return;
  const i = doc.layers.findIndex((l) => l.id === act.id);
  if (i <= 0) {
    toast('No layer below to merge with', 'error');
    return;
  }
  const lower = doc.layers[i - 1];
  const pair: Layer[] = [{ ...lower, blend: 'source-over' } as Layer, act];
  const rect = layersRect(pair);
  if (!rect) return;
  const pad = 40;
  const r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const canvas = renderLayersToRect(pair, r);
  const merged = createRasterLayer(canvas, r.x + r.w / 2, r.y + r.h / 2, lower.name);
  merged.blend = lower.blend;
  merged.visible = lower.visible;
  merged.group = lower.group;
  const layers = [...doc.layers];
  layers.splice(i - 1, 2, merged);
  commit('Merge down', { ...doc, layers }, { selectedIds: [merged.id] });
}

export function mergeSelected() {
  const doc = docOf();
  const sel = selectedLayers();
  if (sel.length < 2) return mergeDown();
  const rect = layersRect(sel);
  if (!rect) return;
  // Layers of one group stay in it (the group still applies its opacity); otherwise bake group effects in.
  const sameGroup = sel.every((l) => l.group && l.group === sel[0].group) ? sel[0].group : null;
  const canvas = renderLayersToRect(sel, rect, {}, sameGroup ? undefined : doc.groups);
  const merged = createRasterLayer(canvas, rect.x + rect.w / 2, rect.y + rect.h / 2, sel[sel.length - 1].name);
  merged.group = sameGroup;
  const topIndex = doc.layers.findIndex((l) => l.id === sel[sel.length - 1].id);
  const set = new Set(sel.map((l) => l.id));
  const layers: Layer[] = [];
  doc.layers.forEach((l, idx) => {
    if (idx === topIndex) layers.push(merged);
    else if (!set.has(l.id)) layers.push(l);
  });
  commit('Merge layers', { ...doc, layers }, { selectedIds: [merged.id] });
}

export function mergeVisible() {
  const doc = docOf();
  const vis = doc.layers.filter((l) => l.visible);
  if (!vis.length) return;
  const canvas = renderLayersToRect(vis, { x: 0, y: 0, w: doc.width, h: doc.height }, {}, doc.groups);
  const merged = createRasterLayer(canvas, doc.width / 2, doc.height / 2, 'Merged');
  const layers = [...doc.layers.filter((l) => !l.visible), merged];
  commit('Merge visible', { ...doc, layers }, { selectedIds: [merged.id] });
}

export function flattenImage() {
  const doc = docOf();
  const canvas = renderDocToCanvas(doc, 1, true);
  const flat = createRasterLayer(canvas, doc.width / 2, doc.height / 2, 'Background');
  commit('Flatten image', { ...doc, layers: [flat] }, { selectedIds: [flat.id] });
}

/* ---------------------------------- Masks ---------------------------------- */

export function addMask(fromSelection = true) {
  const l = activeLayer();
  if (!l) return;
  const { w, h } = layerSize(l);
  const mask = createCanvas(w, h);
  const ctx = ctx2d(mask);
  const sel = S().selection;
  if (fromSelection && sel) {
    // Bring the doc-space selection into the layer's local box.
    ctx.setTransform(layerMatrix(l).inverse());
    ctx.drawImage(sel.mask, 0, 0);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  updateLayerAndCommit(l.id, { mask, maskEnabled: true }, 'Add layer mask', { editMask: true, selection: fromSelection ? null : S().selection });
}

function updateLayerAndCommit(id: string, patch: Partial<Layer>, label: string, extra = {}) {
  const doc = docOf();
  commit(label, { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }, extra);
}

export function deleteMask() {
  const l = activeLayer();
  if (!l?.mask) return;
  updateLayerAndCommit(l.id, { mask: null }, 'Delete mask', { editMask: false });
}

export function applyMask() {
  const l = activeLayer();
  if (!l?.mask) return;
  const r = rasterizeLayerObject(l);
  const src = r.canvas;
  const c = createCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(r.mask!, 0, 0, src.width, src.height);
  updateLayerAndCommit(l.id, { ...r, canvas: c, mask: null } as Partial<Layer>, 'Apply mask', { editMask: false });
}

export function invertMaskOfActive() {
  const l = activeLayer();
  if (!l?.mask) return;
  const c = createCanvas(l.mask.width, l.mask.height);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(l.mask, 0, 0);
  updateLayerAndCommit(l.id, { mask: c }, 'Invert mask');
}

/* -------------------------------- Alignment -------------------------------- */

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function align(kind: AlignKind) {
  const doc = docOf();
  const sel = selectedLayers().filter((l) => !l.locked);
  if (!sel.length) return;
  const target = sel.length > 1 ? unionRects(sel.map(layerBounds))! : { x: 0, y: 0, w: doc.width, h: doc.height };
  const set = new Set(sel.map((l) => l.id));
  const layers = doc.layers.map((l) => {
    if (!set.has(l.id)) return l;
    const b = layerBounds(l);
    let dx = 0,
      dy = 0;
    if (kind === 'left') dx = target.x - b.x;
    if (kind === 'right') dx = target.x + target.w - (b.x + b.w);
    if (kind === 'hcenter') dx = target.x + target.w / 2 - (b.x + b.w / 2);
    if (kind === 'top') dy = target.y - b.y;
    if (kind === 'bottom') dy = target.y + target.h - (b.y + b.h);
    if (kind === 'vcenter') dy = target.y + target.h / 2 - (b.y + b.h / 2);
    return { ...l, x: l.x + dx, y: l.y + dy } as Layer;
  });
  commit('Align', { ...doc, layers });
}

export function distribute(axis: 'h' | 'v') {
  const doc = docOf();
  const sel = selectedLayers().filter((l) => !l.locked);
  if (sel.length < 3) {
    toast('Select 3 or more layers to distribute');
    return;
  }
  const items = sel.map((l) => ({ l, b: layerBounds(l) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0].b,
    last = items[items.length - 1].b;
  const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.w : it.b.h), 0);
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (items.length - 1);
  let cursor = axis === 'h' ? first.x : first.y;
  const moved = new Map<string, Layer>();
  for (const it of items) {
    const d = cursor - (axis === 'h' ? it.b.x : it.b.y);
    moved.set(it.l.id, { ...it.l, x: it.l.x + (axis === 'h' ? d : 0), y: it.l.y + (axis === 'v' ? d : 0) } as Layer);
    cursor += (axis === 'h' ? it.b.w : it.b.h) + gap;
  }
  commit('Distribute', { ...doc, layers: doc.layers.map((l) => moved.get(l.id) || l) });
}

export function flipSelected(axis: 'h' | 'v') {
  updateSelected((l) => (axis === 'h' ? { scaleX: -l.scaleX } : { scaleY: -l.scaleY }), axis === 'h' ? 'Flip horizontal' : 'Flip vertical');
}

export function rotateSelected(deg: number) {
  updateSelected((l) => ({ rotation: (((l.rotation + deg) % 360) + 360) % 360 }), 'Rotate');
}

export function nudgeSelected(dx: number, dy: number) {
  updateSelected((l) => (l.locked ? {} : { x: l.x + dx, y: l.y + dy }), 'Nudge');
}
