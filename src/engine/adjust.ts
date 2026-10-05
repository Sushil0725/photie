import { boxBlur, colorMatrixFilter, type ColorMatrix } from './filters';
import type { Adjust } from './types';
import { createCanvas, ctx2d } from './util';
import { canvasVersion } from './version';

/** Whether CanvasRenderingContext2D.filter actually works in this browser. */
export const canvasFilterSupported: boolean = (() => {
  try {
    if (typeof document === 'undefined') return false;
    if (!('filter' in CanvasRenderingContext2D.prototype)) return false;
    const c = createCanvas(2, 2);
    const ctx = ctx2d(c, true);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 2);
    const c2 = createCanvas(2, 2);
    const ctx2 = ctx2d(c2, true);
    ctx2.filter = 'invert(1)';
    ctx2.drawImage(c, 0, 0);
    const d = ctx2.getImageData(0, 0, 1, 1).data;
    return d[0] < 50 && d[1] > 200;
  } catch {
    return false;
  }
})();

export const isNeutral = (a: Adjust | null | undefined): boolean =>
  !a ||
  (!a.brightness &&
    !a.contrast &&
    !a.saturation &&
    !a.hue &&
    !a.temperature &&
    !a.tint &&
    !a.blur &&
    !a.vignette &&
    !a.grayscale &&
    !a.sepia &&
    !a.invert);

/** The CSS filter equivalent for the color part of an adjustment. */
export function adjustToCssFilter(a: Adjust, blurScale = 1): string {
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${1 + a.brightness / 100})`);
  if (a.contrast) parts.push(`contrast(${1 + a.contrast / 100})`);
  if (a.saturation) parts.push(`saturate(${1 + a.saturation / 100})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale / 100})`);
  if (a.sepia) parts.push(`sepia(${a.sepia / 100})`);
  if (a.invert) parts.push(`invert(${a.invert / 100})`);
  if (a.blur) parts.push(`blur(${(a.blur / 4) * blurScale}px)`);
  return parts.join(' ') || 'none';
}

/* ----- Color matrices following the Filter Effects spec so the fallback matches CSS ----- */

const identity = (): ColorMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function mul(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  // Both are 3x4 (rgb rows with offset); computes a * b.
  const r: ColorMatrix = new Array(12).fill(0) as ColorMatrix;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 4 + k] * b[k * 4 + j];
      if (j === 3) s += a[i * 4 + 3];
      r[i * 4 + j] = s;
    }
  }
  return r;
}

const brightnessM = (v: number): ColorMatrix => [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
const contrastM = (v: number): ColorMatrix => {
  const o = (1 - v) * 127.5;
  return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o];
};
const saturateM = (s: number): ColorMatrix => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
];
const hueM = (deg: number): ColorMatrix => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
  ];
};
const grayscaleM = (g: number): ColorMatrix => {
  const s = 1 - g;
  return [
    0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
    0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
    0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0,
  ];
};
const sepiaM = (v: number): ColorMatrix => {
  const s = 1 - v;
  return [
    0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
    0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
    0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0,
  ];
};
const invertM = (v: number): ColorMatrix => {
  const k = 1 - 2 * v;
  const o = v * 255;
  return [k, 0, 0, o, 0, k, 0, o, 0, 0, k, o];
};

/** Combined color matrix, applied in the same order as the CSS filter list. */
export function adjustColorMatrix(a: Adjust): ColorMatrix {
  let m = identity();
  const then = (n: ColorMatrix) => {
    m = mul(n, m);
  };
  if (a.brightness) then(brightnessM(1 + a.brightness / 100));
  if (a.contrast) then(contrastM(1 + a.contrast / 100));
  if (a.saturation) then(saturateM(1 + a.saturation / 100));
  if (a.hue) then(hueM(a.hue));
  if (a.grayscale) then(grayscaleM(a.grayscale / 100));
  if (a.sepia) then(sepiaM(a.sepia / 100));
  if (a.invert) then(invertM(a.invert / 100));
  return m;
}

/** Temperature / tint overlays and vignette, clipped to the layer's own alpha. */
function applyOverlays(ctx: CanvasRenderingContext2D, w: number, h: number, a: Adjust) {
  if (a.temperature || a.tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    if (a.temperature) {
      const t = a.temperature / 100;
      ctx.globalAlpha = Math.abs(t) * 0.9;
      ctx.fillStyle = t > 0 ? '#ff8a00' : '#0077ff';
      ctx.fillRect(0, 0, w, h);
    }
    if (a.tint) {
      const t = a.tint / 100;
      ctx.globalAlpha = Math.abs(t) * 0.8;
      ctx.fillStyle = t > 0 ? '#ff00c8' : '#00ff3c';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  if (a.vignette) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * (0.75 - a.vignette / 250), w / 2, h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, a.vignette / 100)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

/** Renders `src` through the adjustment pipeline into a new canvas of the same size. */
export function renderAdjusted(src: CanvasImageSource, w: number, h: number, a: Adjust): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = ctx2d(out, !canvasFilterSupported);
  if (canvasFilterSupported) {
    ctx.filter = adjustToCssFilter(a);
    ctx.drawImage(src, 0, 0, w, h);
    ctx.filter = 'none';
  } else {
    ctx.drawImage(src, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, out.width, out.height);
    colorMatrixFilter(data, adjustColorMatrix(a));
    if (a.blur) boxBlur(data, Math.max(1, Math.round(a.blur / 4)));
    ctx.putImageData(data, 0, 0);
  }
  if (a.temperature || a.tint) {
    // Soft-light overlays must not paint into transparent areas.
    const tmp = createCanvas(w, h);
    const tctx = ctx2d(tmp);
    tctx.drawImage(out, 0, 0);
    applyOverlays(tctx, w, h, { ...a, vignette: 0 });
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(out, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);
  }
  if (a.vignette) applyOverlays(ctx, w, h, { ...a, temperature: 0, tint: 0 });
  return out;
}

const processedCache = new WeakMap<object, { key: string; canvas: HTMLCanvasElement }>();

/** Cached adjusted version of a raster canvas. */
export function adjustedCanvas(src: HTMLCanvasElement, a: Adjust | null | undefined): HTMLCanvasElement {
  if (isNeutral(a)) return src;
  const key = JSON.stringify(a) + '#' + canvasVersion(src);
  const hit = processedCache.get(src);
  if (hit && hit.key === key) return hit.canvas;
  const canvas = renderAdjusted(src, src.width, src.height, a!);
  processedCache.set(src, { key, canvas });
  return canvas;
}

export interface FilterPreset {
  id: string;
  name: string;
  adjust: Partial<Adjust>;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: 'Original', adjust: {} },
  { id: 'vivid', name: 'Vivid', adjust: { saturation: 45, contrast: 15, brightness: 4 } },
  { id: 'warm', name: 'Warm', adjust: { temperature: 35, saturation: 10, brightness: 3 } },
  { id: 'cool', name: 'Cool', adjust: { temperature: -35, saturation: 5 } },
  { id: 'mono', name: 'Mono', adjust: { grayscale: 100, contrast: 10 } },
  { id: 'noir', name: 'Noir', adjust: { grayscale: 100, contrast: 55, brightness: -10, vignette: 45 } },
  { id: 'vintage', name: 'Vintage', adjust: { sepia: 45, contrast: -10, saturation: -15, vignette: 35, brightness: 5 } },
  { id: 'fade', name: 'Fade', adjust: { contrast: -28, saturation: -20, brightness: 10 } },
  { id: 'dramatic', name: 'Dramatic', adjust: { contrast: 45, saturation: -15, vignette: 50, brightness: -6 } },
  { id: 'retro', name: 'Retro', adjust: { sepia: 25, hue: -12, saturation: 25, contrast: 10, tint: 12 } },
  { id: 'lomo', name: 'Lomo', adjust: { saturation: 35, contrast: 35, vignette: 65 } },
  { id: 'bloom', name: 'Bloom', adjust: { brightness: 14, contrast: -10, saturation: 15, tint: 18 } },
  { id: 'sunset', name: 'Sunset', adjust: { temperature: 55, tint: 20, saturation: 20, contrast: 8 } },
  { id: 'arctic', name: 'Arctic', adjust: { temperature: -55, brightness: 10, saturation: -15 } },
  { id: 'cinematic', name: 'Cinematic', adjust: { contrast: 25, saturation: -10, temperature: -12, tint: -8, vignette: 30 } },
  { id: 'sepia', name: 'Sepia', adjust: { sepia: 85 } },
  { id: 'pop', name: 'Pop', adjust: { saturation: 80, contrast: 25 } },
  { id: 'dreamy', name: 'Dreamy', adjust: { blur: 2, brightness: 12, contrast: -18, saturation: 12 } },
  { id: 'invert', name: 'Negative', adjust: { invert: 100 } },
  { id: 'xpro', name: 'X-Pro', adjust: { contrast: 30, saturation: 30, hue: 10, temperature: 15, vignette: 40 } },
];
