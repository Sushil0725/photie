import { deserializeDoc, serializeDoc, type SerializedDoc } from './serialize';
import type { Doc } from './types';
import { canvasToBlob } from './util';
import { renderDocToCanvas } from './render';

const DB_NAME = 'photie';
const DB_VERSION = 1;

export interface ProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
  thumb?: Blob;
}

export interface UploadItem {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function saveProject(doc: Doc): Promise<void> {
  const { doc: ser, blobs } = await serializeDoc(doc, 'blob');
  const scale = Math.min(1, 360 / Math.max(doc.width, doc.height));
  let thumb: Blob | undefined;
  try {
    thumb = await canvasToBlob(renderDocToCanvas(doc, scale), 'image/jpeg', 0.8);
  } catch {
    thumb = undefined;
  }
  const meta: ProjectMeta = { id: doc.id, name: doc.name, width: doc.width, height: doc.height, updatedAt: Date.now(), thumb };
  await tx('data', 'readwrite', (s) => s.put({ id: doc.id, doc: ser, blobs }));
  await tx('meta', 'readwrite', (s) => s.put(meta));
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const all = await tx<ProjectMeta[]>('meta', 'readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProject(id: string): Promise<Doc | null> {
  const rec = await tx<{ id: string; doc: SerializedDoc; blobs: Record<string, Blob> } | undefined>('data', 'readonly', (s) => s.get(id));
  if (!rec) return null;
  return deserializeDoc(rec.doc, rec.blobs);
}

export async function deleteProject(id: string) {
  await tx('data', 'readwrite', (s) => s.delete(id));
  await tx('meta', 'readwrite', (s) => s.delete(id));
}

export async function renameProject(id: string, name: string) {
  const meta = await tx<ProjectMeta | undefined>('meta', 'readonly', (s) => s.get(id));
  if (!meta) return;
  await tx('meta', 'readwrite', (s) => s.put({ ...meta, name }));
}

export async function addUpload(item: UploadItem) {
  await tx('uploads', 'readwrite', (s) => s.put(item));
}

export async function listUploads(): Promise<UploadItem[]> {
  try {
    const all = await tx<UploadItem[]>('uploads', 'readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function deleteUpload(id: string) {
  await tx('uploads', 'readwrite', (s) => s.delete(id));
}
