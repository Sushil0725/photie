import type { Doc, Layer, LayerGroup } from './types';

/* Layer groups are contiguous runs of `doc.layers` tagged with a group id (no nesting). */

export const findGroup = (doc: Doc, id: string | null | undefined): LayerGroup | undefined => (id ? doc.groups?.find((g) => g.id === id) : undefined);

export const groupMembers = (doc: Doc, id: string): Layer[] => doc.layers.filter((l) => l.group === id);

/** The group whose members are exactly `ids`, if any. */
export function groupOfSelection(doc: Doc, ids: string[]): LayerGroup | null {
  if (!ids.length || !doc.groups?.length) return null;
  const first = doc.layers.find((l) => l.id === ids[0]);
  const g = findGroup(doc, first?.group);
  if (!g) return null;
  const members = groupMembers(doc, g.id);
  const set = new Set(ids);
  return members.length === set.size && members.every((m) => set.has(m.id)) ? g : null;
}

/** Expands ids so that picking one member of a group picks the whole group (Canva-style). */
export function expandToGroups(doc: Doc, ids: string[]): string[] {
  const groups = new Set<string>();
  for (const l of doc.layers) if (ids.includes(l.id) && l.group) groups.add(l.group);
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const l of doc.layers) if (l.group && groups.has(l.group)) out.add(l.id);
  return doc.layers.filter((l) => out.has(l.id)).map((l) => l.id);
}

/** Next free "Group N" name. */
export function nextGroupName(doc: Doc): string {
  let n = (doc.groups?.length || 0) + 1;
  while (doc.groups?.some((g) => g.name === `Group ${n}`)) n++;
  return `Group ${n}`;
}

/**
 * Keeps groups well formed after any edit: members must be adjacent, so a layer that ended up away
 * from its group (e.g. moved out of it) leaves the group, and groups without members disappear.
 * Returns the same object when nothing needed fixing.
 */
export function normalizeGroups(doc: Doc): Doc {
  const groups = doc.groups || [];
  if (!groups.length && !doc.layers.some((l) => l.group)) return doc;
  const known = new Set(groups.map((g) => g.id));
  const runs = new Map<string, { start: number; len: number }[]>();
  let changed = false;
  doc.layers.forEach((l, i) => {
    if (!l.group) return;
    if (!known.has(l.group)) {
      changed = true;
      return;
    }
    const r = runs.get(l.group) || [];
    const last = r[r.length - 1];
    if (last && last.start + last.len === i) last.len++;
    else r.push({ start: i, len: 1 });
    runs.set(l.group, r);
  });
  const eject = new Set<number>();
  for (const r of runs.values()) {
    if (r.length < 2) continue;
    changed = true;
    const keep = r.reduce((a, b) => (b.len > a.len ? b : a));
    for (const run of r) if (run !== keep) for (let k = run.start; k < run.start + run.len; k++) eject.add(k);
  }
  const used = groups.filter((g) => runs.has(g.id));
  if (used.length !== groups.length) changed = true;
  if (!changed) return doc;
  const layers = doc.layers.map((l, i) => (l.group && (!known.has(l.group) || eject.has(i)) ? ({ ...l, group: null } as Layer) : l));
  return { ...doc, layers, groups: used };
}
