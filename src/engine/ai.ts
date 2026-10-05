/* On-device AI features (MediaPipe): background removal, subject & object selection. */
import type { ImageSegmenter, InteractiveSegmenterLegacy, MPMask } from '@mediapipe/tasks-vision';
import { S, activeLayer, commit, toast, withBusy } from '../store/editor';
import { applySelection } from '../store/image';
import { ensureRasterActive } from '../store/layers';
import { layerMatrix, toLocal, type Pt } from './geometry';
import type { Layer, RasterLayer } from './types';
import { createCanvas, ctx2d } from './util';

const MP_VERSION = '1.0.1';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODELS = {
  deeplab: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
  selfie: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  touch: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
};

let visionMod: Promise<typeof import('@mediapipe/tasks-vision')> | null = null;
let fileset: Promise<unknown> | null = null;
const segmenters: Partial<Record<'deeplab' | 'selfie', Promise<ImageSegmenter>>> = {};
let touchSeg: Promise<InteractiveSegmenterLegacy> | null = null;

async function vision() {
  visionMod ||= import('@mediapipe/tasks-vision');
  const m = await visionMod;
  fileset ||= m.FilesetResolver.forVisionTasks(WASM);
  return { m, fs: (await fileset) as Awaited<ReturnType<typeof m.FilesetResolver.forVisionTasks>> };
}

async function segmenter(kind: 'deeplab' | 'selfie') {
  segmenters[kind] ||= (async () => {
    const { m, fs } = await vision();
    return m.ImageSegmenter.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS[kind], delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: kind === 'deeplab',
    });
  })();
  try {
    return await segmenters[kind]!;
  } catch (e) {
    delete segmenters[kind];
    throw e;
  }
}

async function touchSegmenter() {
  touchSeg ||= (async () => {
    const { m, fs } = await vision();
    return m.InteractiveSegmenterLegacy.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS.touch, delegate: 'CPU' },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
  try {
    return await touchSeg;
  } catch (e) {
    touchSeg = null;
    throw e;
  }
}

/* ------------------------------ Mask utilities ------------------------------ */

function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Edge-aware refinement of a soft mask using the image as guide (He et al. guided filter). */
function guidedFilter(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const II = new Float32Array(n),
    Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    II[i] = guide[i] * guide[i];
    Ip[i] = guide[i] * p[i];
  }
  const mI = boxMean(guide, w, h, r),
    mp = boxMean(p, w, h, r),
    mII = boxMean(II, w, h, r),
    mIp = boxMean(Ip, w, h, r);
  const a = new Float32Array(n),
    b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    const cov = mIp[i] - mI[i] * mp[i];
    a[i] = cov / (varI + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r),
    mb = boxMean(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, ma[i] * guide[i] + mb[i]));
  return q;
}

function maskArray(m: MPMask): Float32Array {
  return m.getAsFloat32Array();
}

interface Work {
  canvas: HTMLCanvasElement;
  gray: Float32Array;
  w: number;
  h: number;
}

function workImage(src: HTMLCanvasElement, max = 1024): Work {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)),
    h = Math.max(1, Math.round(src.height * k));
  const c = createCanvas(w, h);
  const ctx = ctx2d(c, true);
  // Composite over white: transparent pixels confuse the models.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  return { canvas: c, gray, w, h };
}

/** Converts a soft mask at work resolution into an alpha canvas of the given size. */
function maskToAlphaCanvas(mask: Float32Array, w: number, h: number, outW: number, outH: number, original?: HTMLCanvasElement): HTMLCanvasElement {
  const small = createCanvas(w, h);
  const sctx = ctx2d(small, true);
  const img = sctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4 + 3] = Math.round(mask[i] * 255);
  }
  sctx.putImageData(img, 0, 0);
  const out = createCanvas(outW, outH);
  const octx = ctx2d(out);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, outW, outH);
  if (original) {
    // Never reveal pixels that were already transparent.
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(original, 0, 0);
  }
  return out;
}

const contrastAlpha = (m: Float32Array, lo = 0.3, hi = 0.7) => {
  for (let i = 0; i < m.length; i++) {
    const t = Math.min(1, Math.max(0, (m[i] - lo) / (hi - lo)));
    m[i] = t * t * (3 - 2 * t);
  }
  return m;
};

/** Foreground probability for the whole image (people use a dedicated model). */
async function foreground(src: HTMLCanvasElement): Promise<{ mask: Float32Array; w: number; h: number }> {
  const work = workImage(src, 1024);
  const deeplab = await segmenter('deeplab');
  const res = deeplab.segment(work.canvas);
  const bg = maskArray(res.confidenceMasks![0]);
  let fg = new Float32Array(bg.length);
  for (let i = 0; i < bg.length; i++) fg[i] = 1 - bg[i];
  let personShare = 0;
  if (res.categoryMask) {
    const cat = res.categoryMask.getAsUint8Array();
    let fgCount = 0,
      person = 0;
    for (let i = 0; i < cat.length; i++) {
      if (cat[i] !== 0) fgCount++;
      if (cat[i] === 15) person++;
    }
    personShare = fgCount ? person / fgCount : 0;
  }
  res.close();
  if (personShare > 0.5) {
    try {
      const selfie = await segmenter('selfie');
      const r2 = selfie.segment(work.canvas);
      const masks = r2.confidenceMasks!;
      const m = maskArray(masks[masks.length - 1]);
      fg = new Float32Array(m);
      r2.close();
    } catch {
      /* fall back to deeplab */
    }
  }
  contrastAlpha(fg, 0.35, 0.65);
  const radius = Math.max(2, Math.round(Math.max(work.w, work.h) / 160));
  const refined = guidedFilter(work.gray, fg, work.w, work.h, radius, 1e-4);
  return { mask: contrastAlpha(refined, 0.15, 0.85), w: work.w, h: work.h };
}

function rasterTarget(): RasterLayer | null {
  if (!activeLayer()) {
    toast('Select an image layer first', 'error');
    return null;
  }
  return ensureRasterActive();
}

const firstRunNote = () => (segmenters.deeplab ? '' : ' (first run downloads the AI model)');

export async function removeBackground() {
  const l = rasterTarget();
  if (!l) return;
  try {
    await withBusy('Removing background' + firstRunNote() + '…', async () => {
      const { mask, w, h } = await foreground(l.canvas);
      const alpha = maskToAlphaCanvas(mask, w, h, l.canvas.width, l.canvas.height);
      const doc = S().doc!;
      const cur = doc.layers.find((x) => x.id === l.id) as RasterLayer;
      let next: Layer;
      if (cur.mask) {
        // Combine with the existing mask.
        const m = createCanvas(cur.mask.width, cur.mask.height);
        const mctx = ctx2d(m);
        mctx.drawImage(cur.mask, 0, 0);
        mctx.globalCompositeOperation = 'destination-in';
        mctx.drawImage(alpha, 0, 0, m.width, m.height);
        next = { ...cur, mask: m, maskEnabled: true };
      } else next = { ...cur, mask: alpha, maskEnabled: true };
      commit('Remove background', { ...doc, layers: doc.layers.map((x) => (x.id === l.id ? next : x)) });
    });
    toast('Background removed. Tip: paint on the layer mask to refine it.', 'success', 4500);
  } catch (e) {
    console.error(e);
    toast('Background removal failed: ' + (e as Error).message, 'error', 5000);
  }
}

/** Selects the main subject of the active layer. */
export async function selectSubject() {
  const l = rasterTarget();
  if (!l) return;
  try {
    await withBusy('Finding subject' + firstRunNote() + '…', async () => {
      const { mask, w, h } = await foreground(l.canvas);
      const local = maskToAlphaCanvas(mask, w, h, l.canvas.width, l.canvas.height, l.canvas);
      const doc = S().doc!;
      const sel = createCanvas(doc.width, doc.height);
      const ctx = ctx2d(sel);
      ctx.setTransform(layerMatrix(l));
      ctx.drawImage(local, 0, 0);
      applySelection(sel, 'new', 0, 'Select subject');
    });
  } catch (e) {
    console.error(e);
    toast('Subject selection failed: ' + (e as Error).message, 'error', 5000);
  }
}

/** Selects the object under a document point (AI object selection). */
export async function selectObjectAt(p: Pt, mode: 'new' | 'add' | 'subtract' | 'intersect') {
  const l = activeLayer();
  if (!l || l.type !== 'raster') {
    toast('Select an image layer first', 'error');
    return;
  }
  const lp = toLocal(l, p);
  if (lp.x < 0 || lp.y < 0 || lp.x >= l.canvas.width || lp.y >= l.canvas.height) return;
  try {
    await withBusy('Selecting object' + (touchSeg ? '' : ' (first run downloads the AI model)') + '…', async () => {
      const seg = await touchSegmenter();
      const work = workImage(l.canvas, 1024);
      const res = seg.segment(work.canvas, { keypoint: { x: lp.x / l.canvas.width, y: lp.y / l.canvas.height } });
      const masks = res.confidenceMasks!;
      let m = new Float32Array(maskArray(masks[masks.length > 1 ? 1 : 0]));
      res.close();
      // Make sure the clicked point is inside the selection.
      const ix = Math.min(work.w - 1, Math.floor((lp.x / l.canvas.width) * work.w));
      const iy = Math.min(work.h - 1, Math.floor((lp.y / l.canvas.height) * work.h));
      if (m[iy * work.w + ix] < 0.5) m = m.map((v) => 1 - v);
      contrastAlpha(m, 0.4, 0.6);
      const refined = contrastAlpha(guidedFilter(work.gray, m, work.w, work.h, 3, 1e-4), 0.2, 0.8);
      const local = maskToAlphaCanvas(refined, work.w, work.h, l.canvas.width, l.canvas.height, l.canvas);
      const doc = S().doc!;
      const sel = createCanvas(doc.width, doc.height);
      const ctx = ctx2d(sel);
      ctx.setTransform(layerMatrix(l));
      ctx.drawImage(local, 0, 0);
      applySelection(sel, mode, 0, 'Object selection');
    });
  } catch (e) {
    console.error(e);
    toast('Object selection failed: ' + (e as Error).message, 'error', 5000);
  }
}
