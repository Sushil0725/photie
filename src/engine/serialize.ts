import type { Doc, Layer } from './types';
import { blobToDataURL, canvasToBlob, createCanvas, ctx2d, loadImage } from './util';
import { canvasVersion } from './version';

/* A serialized document stores canvases as PNG blobs (IndexedDB) or data URLs (files). */

type Ser<T> = T extends { canvas: HTMLCanvasElement } ? Omit<T, 'canvas' | 'mask'> & { canvas: string; mask?: string | null } : Omit<T, 'mask'> & { mask?: string | null };

export type SerializedLayer = Ser<Layer>;

export interface SerializedDoc extends Omit<Doc, 'layers'> {
  version: 1;
  layers: SerializedLayer[];
}

const blobCache = new WeakMap<HTMLCanvasElement, { v: number; blob: Blob }>();

async function encodeCanvas(c: HTMLCanvasElement): Promise<Blob> {
  const v = canvasVersion(c);
  const hit = blobCache.get(c);
  if (hit && hit.v === v) return hit.blob;
  const blob = await canvasToBlob(c, 'image/png');
  blobCache.set(c, { v, blob });
  return blob;
}

/** Serializes canvases into a blob table (keyed by reference). Canvases are encoded once. */
export async function serializeDoc(doc: Doc, mode: 'blob' | 'dataurl'): Promise<{ doc: SerializedDoc; blobs: Record<string, Blob> }> {
  const blobs: Record<string, Blob> = {};
  const refs = new Map<HTMLCanvasElement, string>();
  let n = 0;
  const ref = async (c: HTMLCanvasElement) => {
    let key = refs.get(c);
    if (key) return key;
    const blob = await encodeCanvas(c);
    if (mode === 'dataurl') key = await blobToDataURL(blob);
    else {
      key = `blob:${n++}`;
      blobs[key] = blob;
    }
    refs.set(c, key);
    return key;
  };
  const layers: SerializedLayer[] = [];
  for (const l of doc.layers) {
    const out: Record<string, unknown> = { ...l };
    if (l.type === 'raster') out.canvas = await ref(l.canvas);
    out.mask = l.mask ? await ref(l.mask) : null;
    layers.push(out as unknown as SerializedLayer);
  }
  return { doc: { ...doc, version: 1, layers }, blobs };
}

async function decodeRef(ref: string, blobs: Record<string, Blob>): Promise<HTMLCanvasElement> {
  let src = ref;
  let revoke: string | null = null;
  if (ref.startsWith('blob:') && blobs[ref]) {
    src = URL.createObjectURL(blobs[ref]);
    revoke = src;
  }
  try {
    const img = await loadImage(src);
    const c = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx2d(c).drawImage(img, 0, 0);
    return c;
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
  }
}

export async function deserializeDoc(s: SerializedDoc, blobs: Record<string, Blob> = {}): Promise<Doc> {
  const layers: Layer[] = [];
  for (const sl of s.layers) {
    const l = { ...sl } as unknown as Record<string, unknown>;
    if (sl.type === 'raster') l.canvas = await decodeRef(sl.canvas as string, blobs);
    l.mask = sl.mask ? await decodeRef(sl.mask, blobs) : null;
    layers.push(l as unknown as Layer);
  }
  const { version: _v, ...rest } = s;
  return { ...rest, layers };
}

export async function docToFile(doc: Doc): Promise<Blob> {
  const { doc: ser } = await serializeDoc(doc, 'dataurl');
  return new Blob([JSON.stringify({ app: 'photie', ...ser })], { type: 'application/json' });
}

export async function fileToDoc(file: Blob): Promise<Doc> {
  const json = JSON.parse(await file.text());
  if (json.app !== 'photie' || !Array.isArray(json.layers)) throw new Error('Not a Photie project file');
  return deserializeDoc(json as SerializedDoc);
}

