import { createRasterLayer } from './document';
import { layerBounds } from './geometry';
import { renderDocToCanvas, renderLayer } from './render';
import type { BlendMode, Doc, Layer, LayerGroup } from './types';
import { normalizeGroups } from './groups';
import { canvasToBlob, createCanvas, ctx2d, uid } from './util';

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'pdf' | 'psd';

export async function exportDoc(doc: Doc, format: ExportFormat, opts: { scale: number; quality: number; transparent: boolean }): Promise<Blob> {
  if (format === 'psd') return exportPsd(doc);
  const bg = format === 'jpeg' || format === 'pdf' ? true : !opts.transparent;
  let canvas = renderDocToCanvas(doc, opts.scale, bg);
  if ((format === 'jpeg' || format === 'pdf') && (!doc.background || doc.background.type !== 'solid')) {
    // JPEG has no alpha: flatten over white.
    const flat = createCanvas(canvas.width, canvas.height);
    const ctx = ctx2d(flat);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    canvas = flat;
  }
  if (format === 'pdf') return makePdf(canvas, doc.width, doc.height);
  return canvasToBlob(canvas, `image/${format}`, format === 'png' ? undefined : opts.quality);
}

/* ----------------------------------- PDF ----------------------------------- */

async function makePdf(canvas: HTMLCanvasElement, docW: number, docH: number): Promise<Blob> {
  const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.95)).arrayBuffer());
  const W = +(docW * 0.75).toFixed(2);
  const H = +(docH * 0.75).toFixed(2);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/* ----------------------------------- PSD ----------------------------------- */

const toPsdBlend: Record<BlendMode, string> = {
  'source-over': 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};
const fromPsdBlend = Object.fromEntries(Object.entries(toPsdBlend).map(([k, v]) => [v, k])) as Record<string, BlendMode>;

/** Rasterizes a layer (with transform, adjustments, mask, shadow) into document space. */
function rasterizeForExport(l: Layer) {
  const b = layerBounds(l);
  const pad = l.shadow ? Math.abs(l.shadow.x) + Math.abs(l.shadow.y) + l.shadow.blur * 2 : 4;
  const x = Math.floor(b.x - pad),
    y = Math.floor(b.y - pad);
  const w = Math.ceil(b.w + pad * 2),
    h = Math.ceil(b.h + pad * 2);
  const c = createCanvas(w, h);
  renderLayer(ctx2d(c), { ...l, opacity: 1, blend: 'source-over', visible: true } as Layer, {
    base: new DOMMatrix().translate(-x, -y),
    scale: 1,
    quality: 'high',
  });
  return { canvas: c, left: x, top: y };
}

export async function exportPsd(doc: Doc): Promise<Blob> {
  const { writePsd } = await import('ag-psd');
  const toNode = (l: Layer): PsdNode => {
    const r = rasterizeForExport(l);
    return { name: l.name, canvas: r.canvas, left: r.left, top: r.top, opacity: l.opacity, hidden: !l.visible, blendMode: toPsdBlend[l.blend] };
  };
  // Layer groups become Photoshop group folders.
  const children: PsdNode[] = [];
  for (let i = 0; i < doc.layers.length; i++) {
    const l = doc.layers[i];
    const g = l.group ? doc.groups?.find((x) => x.id === l.group) : undefined;
    if (!g) {
      children.push(toNode(l));
      continue;
    }
    const kids: PsdNode[] = [];
    while (i < doc.layers.length && doc.layers[i].group === g.id) kids.push(toNode(doc.layers[i++]));
    i--;
    const passThrough = g.blend === 'source-over' && g.opacity >= 1;
    children.push({ name: g.name, opacity: g.opacity, hidden: false, blendMode: passThrough ? 'pass through' : toPsdBlend[g.blend], opened: !g.collapsed, children: kids });
  }
  if (doc.background) {
    const bg = createCanvas(doc.width, doc.height);
    const bgDoc: Doc = { ...doc, layers: [] };
    ctx2d(bg).drawImage(renderDocToCanvas(bgDoc), 0, 0);
    children.unshift({ name: 'Background', canvas: bg, left: 0, top: 0, opacity: 1, hidden: false, blendMode: 'normal' });
  }
  const buffer = writePsd({ width: doc.width, height: doc.height, children: children as never, canvas: renderDocToCanvas(doc) }, { generateThumbnail: true });
  return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
}

interface PsdNode {
  name?: string;
  canvas?: HTMLCanvasElement;
  left?: number;
  top?: number;
  opacity?: number;
  hidden?: boolean;
  blendMode?: string;
  opened?: boolean;
  children?: PsdNode[];
}

export async function importPsd(file: Blob, name: string): Promise<Doc> {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(await file.arrayBuffer()) as unknown as PsdNode & { width: number; height: number };
  const layers: Layer[] = [];
  const groups: LayerGroup[] = [];
  // Top-level folders become groups; nested folders are folded into them (Photie groups do not nest).
  const walk = (nodes: PsdNode[] | undefined, hiddenParent: boolean, group: string | null, opacity: number) => {
    for (const n of nodes || []) {
      if (n.children) {
        let gid = group;
        let k = opacity;
        if (!group) {
          const blend = fromPsdBlend[n.blendMode || 'normal'] || 'source-over';
          const g: LayerGroup = { id: uid(), name: n.name || 'Group', opacity: n.opacity ?? 1, blend, collapsed: n.opened === false };
          groups.push(g);
          gid = g.id;
        } else k *= n.opacity ?? 1;
        walk(n.children, hiddenParent || !!n.hidden, gid, k);
        continue;
      }
      if (!n.canvas || !n.canvas.width || !n.canvas.height) continue;
      const l = createRasterLayer(n.canvas, (n.left || 0) + n.canvas.width / 2, (n.top || 0) + n.canvas.height / 2, n.name || 'Layer');
      l.opacity = (n.opacity ?? 1) * opacity;
      l.visible = !(n.hidden || hiddenParent);
      l.blend = fromPsdBlend[n.blendMode || 'normal'] || 'source-over';
      l.group = group;
      layers.push(l);
    }
  };
  walk(psd.children, false, null, 1);
  if (!layers.length && psd.canvas) layers.push(createRasterLayer(psd.canvas, psd.width / 2, psd.height / 2, 'Background'));
  return normalizeGroups({ id: uid(), name, width: psd.width, height: psd.height, background: null, layers, groups });
}
