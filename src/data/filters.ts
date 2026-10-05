import * as F from '../engine/filters';
import { parseColor } from '../engine/util';
import { S } from '../store/editor';

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

export type FilterParam =
  | { type: 'range'; key: string; label: string; min: number; max: number; step?: number; default: number; unit?: string; centered?: boolean }
  | { type: 'check'; key: string; label: string; default: boolean }
  | { type: 'color'; key: string; label: string; default: string }
  | { type: 'select'; key: string; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'heading'; key: string; label: string };

export interface FilterDef {
  id: string;
  name: string;
  menu: 'adjust' | 'blur' | 'sharpen' | 'noise' | 'stylize' | 'distort' | 'render' | 'auto';
  params?: FilterParam[];
  /** Applied immediately without a dialog. */
  instant?: boolean;
  apply: (img: ImageData, p: Params) => void;
}

const n = (p: Params, k: string) => Number(p[k]);
const rgb = (c: string): [number, number, number] => {
  const x = parseColor(c);
  return [x.r, x.g, x.b];
};

function shadowsHighlights(img: ImageData, shadows: number, highlights: number, radius: number) {
  const { width: w, height: h, data: d } = img;
  const lum = new ImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lum.data[i] = lum.data[i + 1] = lum.data[i + 2] = l;
    lum.data[i + 3] = 255;
  }
  F.gaussianBlur(lum, radius);
  const s = shadows / 100,
    hl = highlights / 100;
  for (let i = 0; i < d.length; i += 4) {
    const lb = lum.data[i] / 255;
    const ws = Math.pow(1 - lb, 2) * s;
    const wh = Math.pow(lb, 2) * hl;
    for (let c = 0; c < 3; c++) {
      let v = d[i + c] / 255;
      v = v + (1 - v) * ws * 0.9;
      v = v - v * wh * 0.6;
      d[i + c] = v * 255;
    }
  }
}

function tiltShift(img: ImageData, radius: number, center: number, size: number) {
  const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  F.gaussianBlur(blurred, radius);
  const { width: w, height: h, data: d } = img;
  const cy = (center / 100) * h;
  const half = ((size / 100) * h) / 2;
  const feather = Math.max(1, h * 0.18);
  for (let y = 0; y < h; y++) {
    const dist = Math.max(0, Math.abs(y - cy) - half);
    const t = Math.min(1, dist / feather);
    const k = t * t * (3 - 2 * t);
    if (k === 0) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) d[i + c] = d[i + c] + (blurred.data[i + c] - d[i + c]) * k;
    }
  }
}

function glow(img: ImageData, radius: number, strength: number) {
  const b = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  F.gaussianBlur(b, radius);
  const d = img.data;
  const k = strength / 100;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const a = d[i + c] / 255,
        s = b.data[i + c] / 255;
      const screen = 1 - (1 - a) * (1 - s);
      d[i + c] = (a + (screen - a) * k) * 255;
    }
  }
}

function gradientMap(img: ImageData, c1: string, c2: string, amount: number) {
  const a = rgb(c1),
    b = rgb(c2);
  const k = amount / 100;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - k) + (a[c] + (b[c] - a[c]) * t) * k;
  }
}

function solarize(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) if (d[i + c] > 127) d[i + c] = 255 - d[i + c];
}

function halftone(img: ImageData, size: number) {
  const { width: w, height: h, data: d } = img;
  const s = Math.max(3, Math.round(size));
  const out = new Uint8ClampedArray(d.length);
  for (let by = 0; by < h; by += s)
    for (let bx = 0; bx < w; bx += s) {
      let sum = 0,
        cnt = 0;
      for (let y = by; y < Math.min(h, by + s); y++)
        for (let x = bx; x < Math.min(w, bx + s); x++) {
          const i = (y * w + x) * 4;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          cnt++;
        }
      const darkness = 1 - sum / cnt / 255;
      const r = (s / 2) * Math.sqrt(darkness) * 1.25;
      const cx = bx + s / 2,
        cy = by + s / 2;
      for (let y = by; y < Math.min(h, by + s); y++)
        for (let x = bx; x < Math.min(w, bx + s); x++) {
          const i = (y * w + x) * 4;
          const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
          const v = inside ? 15 : 245;
          out[i] = out[i + 1] = out[i + 2] = v;
          out[i + 3] = d[i + 3];
        }
    }
  d.set(out);
}

export const FILTERS: FilterDef[] = [
  /* ------------------------------ Adjustments ------------------------------ */
  {
    id: 'brightness-contrast',
    name: 'Brightness/Contrast',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'b', label: 'Brightness', min: -150, max: 150, default: 0, centered: true },
      { type: 'range', key: 'c', label: 'Contrast', min: -50, max: 100, default: 0, centered: true },
    ],
    apply: (img, p) => F.brightnessContrast(img, n(p, 'b'), n(p, 'c')),
  },
  {
    id: 'levels',
    name: 'Levels',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'inB', label: 'Input black', min: 0, max: 253, default: 0 },
      { type: 'range', key: 'gamma', label: 'Midtones (gamma)', min: 0.1, max: 4, step: 0.01, default: 1 },
      { type: 'range', key: 'inW', label: 'Input white', min: 2, max: 255, default: 255 },
      { type: 'range', key: 'outB', label: 'Output black', min: 0, max: 255, default: 0 },
      { type: 'range', key: 'outW', label: 'Output white', min: 0, max: 255, default: 255 },
    ],
    apply: (img, p) => F.levels(img, n(p, 'inB'), Math.max(n(p, 'inB') + 2, n(p, 'inW')), n(p, 'gamma'), n(p, 'outB'), n(p, 'outW')),
  },
  { id: 'curves', name: 'Curves', menu: 'adjust', apply: () => {} },
  {
    id: 'exposure',
    name: 'Exposure',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'ev', label: 'Exposure', min: -5, max: 5, step: 0.01, default: 0, centered: true },
      { type: 'range', key: 'off', label: 'Offset', min: -0.5, max: 0.5, step: 0.001, default: 0, centered: true },
      { type: 'range', key: 'gamma', label: 'Gamma', min: 0.1, max: 4, step: 0.01, default: 1 },
    ],
    apply: (img, p) => F.exposure(img, n(p, 'ev'), n(p, 'off'), n(p, 'gamma')),
  },
  {
    id: 'vibrance',
    name: 'Vibrance',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'v', label: 'Vibrance', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 's', label: 'Saturation', min: -100, max: 100, default: 0, centered: true },
    ],
    apply: (img, p) => F.vibrance(img, n(p, 'v'), n(p, 's')),
  },
  {
    id: 'hue-saturation',
    name: 'Hue/Saturation',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'h', label: 'Hue', min: -180, max: 180, default: 0, centered: true },
      { type: 'range', key: 's', label: 'Saturation', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'l', label: 'Lightness', min: -100, max: 100, default: 0, centered: true },
      { type: 'check', key: 'colorize', label: 'Colorize', default: false },
    ],
    apply: (img, p) => F.hueSaturation(img, n(p, 'h'), n(p, 's'), n(p, 'l'), !!p.colorize),
  },
  {
    id: 'color-balance',
    name: 'Color Balance',
    menu: 'adjust',
    params: [
      { type: 'heading', key: 'h1', label: 'Shadows' },
      { type: 'range', key: 'sr', label: 'Cyan ↔ Red', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'sg', label: 'Magenta ↔ Green', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'sb', label: 'Yellow ↔ Blue', min: -100, max: 100, default: 0, centered: true },
      { type: 'heading', key: 'h2', label: 'Midtones' },
      { type: 'range', key: 'mr', label: 'Cyan ↔ Red', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'mg', label: 'Magenta ↔ Green', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'mb', label: 'Yellow ↔ Blue', min: -100, max: 100, default: 0, centered: true },
      { type: 'heading', key: 'h3', label: 'Highlights' },
      { type: 'range', key: 'hr', label: 'Cyan ↔ Red', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'hg', label: 'Magenta ↔ Green', min: -100, max: 100, default: 0, centered: true },
      { type: 'range', key: 'hb', label: 'Yellow ↔ Blue', min: -100, max: 100, default: 0, centered: true },
      { type: 'check', key: 'pl', label: 'Preserve luminosity', default: true },
    ],
    apply: (img, p) =>
      F.colorBalance(img, [n(p, 'sr'), n(p, 'sg'), n(p, 'sb')], [n(p, 'mr'), n(p, 'mg'), n(p, 'mb')], [n(p, 'hr'), n(p, 'hg'), n(p, 'hb')], !!p.pl),
  },
  {
    id: 'black-white',
    name: 'Black & White',
    menu: 'adjust',
    params: [
      { type: 'range', key: 'reds', label: 'Reds', min: -200, max: 300, default: 40 },
      { type: 'range', key: 'yellows', label: 'Yellows', min: -200, max: 300, default: 60 },
      { type: 'range', key: 'greens', label: 'Greens', min: -200, max: 300, default: 40 },
      { type: 'range', key: 'cyans', label: 'Cyans', min: -200, max: 300, default: 60 },
      { type: 'range', key: 'blues', label: 'Blues', min: -200, max: 300, default: 20 },
      { type: 'range', key: 'magentas', label: 'Magentas', min: -200, max: 300, default: 80 },
      { type: 'check', key: 'tint', label: 'Tint', default: false },
      { type: 'color', key: 'tintColor', label: 'Tint color', default: '#e1c699' },
      { type: 'range', key: 'tintAmt', label: 'Tint amount', min: 0, max: 100, default: 60 },
    ],
    apply: (img, p) =>
      F.blackWhite(
        img,
        { reds: n(p, 'reds'), yellows: n(p, 'yellows'), greens: n(p, 'greens'), cyans: n(p, 'cyans'), blues: n(p, 'blues'), magentas: n(p, 'magentas') },
        p.tint ? { color: rgb(String(p.tintColor)), amount: n(p, 'tintAmt') } : undefined,
      ),
  },
  {
    id: 'photo-filter',
    name: 'Photo Filter',
    menu: 'adjust',
    params: [
      { type: 'color', key: 'color', label: 'Filter color', default: '#ec8a00' },
      { type: 'range', key: 'density', label: 'Density', min: 1, max: 100, default: 25, unit: '%' },
      { type: 'check', key: 'pl', label: 'Preserve luminosity', default: true },
    ],
    apply: (img, p) => F.photoFilter(img, rgb(String(p.color)), n(p, 'density'), !!p.pl),
  },
  {
    id: 'shadows-highlights',
    name: 'Shadows/Highlights',
    menu: 'adjust',
    params: [
      { type: 'range', key: 's', label: 'Shadows', min: 0, max: 100, default: 35, unit: '%' },
      { type: 'range', key: 'h', label: 'Highlights', min: 0, max: 100, default: 0, unit: '%' },
      { type: 'range', key: 'r', label: 'Radius', min: 2, max: 200, default: 30, unit: 'px' },
    ],
    apply: (img, p) => shadowsHighlights(img, n(p, 's'), n(p, 'h'), n(p, 'r')),
  },
  {
    id: 'gradient-map',
    name: 'Gradient Map',
    menu: 'adjust',
    params: [
      { type: 'color', key: 'c1', label: 'Shadows color', default: '#1b1464' },
      { type: 'color', key: 'c2', label: 'Highlights color', default: '#ffcc70' },
      { type: 'range', key: 'amt', label: 'Amount', min: 0, max: 100, default: 100, unit: '%' },
    ],
    apply: (img, p) => gradientMap(img, String(p.c1), String(p.c2), n(p, 'amt')),
  },
  {
    id: 'posterize',
    name: 'Posterize',
    menu: 'adjust',
    params: [{ type: 'range', key: 'levels', label: 'Levels', min: 2, max: 32, default: 6 }],
    apply: (img, p) => F.posterize(img, n(p, 'levels')),
  },
  {
    id: 'threshold',
    name: 'Threshold',
    menu: 'adjust',
    params: [{ type: 'range', key: 'level', label: 'Threshold level', min: 1, max: 255, default: 128 }],
    apply: (img, p) => F.threshold(img, n(p, 'level')),
  },
  { id: 'invert', name: 'Invert', menu: 'adjust', instant: true, apply: (img) => F.invert(img) },
  { id: 'desaturate', name: 'Desaturate', menu: 'adjust', instant: true, apply: (img) => F.desaturate(img) },
  { id: 'sepia', name: 'Sepia', menu: 'adjust', instant: true, apply: (img) => F.sepia(img) },
  { id: 'auto-tone', name: 'Auto Tone', menu: 'auto', instant: true, apply: (img) => F.autoTone(img) },
  { id: 'auto-contrast', name: 'Auto Contrast', menu: 'auto', instant: true, apply: (img) => F.autoContrast(img) },
  { id: 'auto-color', name: 'Auto Color', menu: 'auto', instant: true, apply: (img) => F.autoColor(img) },

  /* --------------------------------- Blur --------------------------------- */
  {
    id: 'gaussian-blur',
    name: 'Gaussian Blur',
    menu: 'blur',
    params: [{ type: 'range', key: 'r', label: 'Radius', min: 0.5, max: 150, step: 0.5, default: 6, unit: 'px' }],
    apply: (img, p) => F.gaussianBlur(img, n(p, 'r')),
  },
  {
    id: 'motion-blur',
    name: 'Motion Blur',
    menu: 'blur',
    params: [
      { type: 'range', key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, unit: '°' },
      { type: 'range', key: 'dist', label: 'Distance', min: 1, max: 200, default: 20, unit: 'px' },
    ],
    apply: (img, p) => F.motionBlur(img, n(p, 'angle'), n(p, 'dist')),
  },
  {
    id: 'radial-blur',
    name: 'Radial Blur',
    menu: 'blur',
    params: [
      { type: 'range', key: 'amt', label: 'Amount', min: 1, max: 100, default: 20 },
      {
        type: 'select',
        key: 'mode',
        label: 'Method',
        default: 'zoom',
        options: [
          { value: 'zoom', label: 'Zoom' },
          { value: 'spin', label: 'Spin' },
        ],
      },
    ],
    apply: (img, p) => F.radialBlur(img, n(p, 'amt'), p.mode === 'zoom'),
  },
  {
    id: 'tilt-shift',
    name: 'Tilt-Shift',
    menu: 'blur',
    params: [
      { type: 'range', key: 'r', label: 'Blur', min: 1, max: 60, default: 12, unit: 'px' },
      { type: 'range', key: 'c', label: 'Focus position', min: 0, max: 100, default: 50, unit: '%' },
      { type: 'range', key: 's', label: 'Focus size', min: 0, max: 100, default: 25, unit: '%' },
    ],
    apply: (img, p) => tiltShift(img, n(p, 'r'), n(p, 'c'), n(p, 's')),
  },

  /* -------------------------------- Sharpen -------------------------------- */
  {
    id: 'unsharp-mask',
    name: 'Unsharp Mask',
    menu: 'sharpen',
    params: [
      { type: 'range', key: 'amt', label: 'Amount', min: 1, max: 500, default: 100, unit: '%' },
      { type: 'range', key: 'r', label: 'Radius', min: 0.5, max: 50, step: 0.1, default: 1.5, unit: 'px' },
      { type: 'range', key: 'th', label: 'Threshold', min: 0, max: 255, default: 0 },
    ],
    apply: (img, p) => F.unsharpMask(img, n(p, 'amt'), n(p, 'r'), n(p, 'th')),
  },
  { id: 'sharpen', name: 'Sharpen', menu: 'sharpen', instant: true, apply: (img) => F.sharpen(img) },

  /* --------------------------------- Noise --------------------------------- */
  {
    id: 'add-noise',
    name: 'Add Noise',
    menu: 'noise',
    params: [
      { type: 'range', key: 'amt', label: 'Amount', min: 1, max: 100, default: 12, unit: '%' },
      {
        type: 'select',
        key: 'dist',
        label: 'Distribution',
        default: 'gaussian',
        options: [
          { value: 'gaussian', label: 'Gaussian' },
          { value: 'uniform', label: 'Uniform' },
        ],
      },
      { type: 'check', key: 'mono', label: 'Monochromatic', default: true },
    ],
    apply: (img, p) => F.addNoise(img, n(p, 'amt'), !!p.mono, p.dist === 'gaussian'),
  },
  {
    id: 'median',
    name: 'Reduce Noise (Median)',
    menu: 'noise',
    params: [{ type: 'range', key: 'r', label: 'Radius', min: 1, max: 8, default: 1, unit: 'px' }],
    apply: (img, p) => F.median(img, n(p, 'r')),
  },

  /* -------------------------------- Stylize -------------------------------- */
  {
    id: 'oil-paint',
    name: 'Oil Paint',
    menu: 'stylize',
    params: [{ type: 'range', key: 'r', label: 'Brush size', min: 1, max: 12, default: 4 }],
    apply: (img, p) => F.oilPaint(img, n(p, 'r')),
  },
  {
    id: 'pixelate',
    name: 'Pixelate (Mosaic)',
    menu: 'stylize',
    params: [{ type: 'range', key: 's', label: 'Cell size', min: 2, max: 200, default: 12, unit: 'px' }],
    apply: (img, p) => F.pixelate(img, n(p, 's')),
  },
  {
    id: 'emboss',
    name: 'Emboss',
    menu: 'stylize',
    params: [{ type: 'range', key: 's', label: 'Strength', min: 0.2, max: 4, step: 0.1, default: 1 }],
    apply: (img, p) => F.emboss(img, n(p, 's')),
  },
  { id: 'find-edges', name: 'Find Edges', menu: 'stylize', instant: true, apply: (img) => F.findEdges(img) },
  { id: 'solarize', name: 'Solarize', menu: 'stylize', instant: true, apply: (img) => solarize(img) },
  {
    id: 'glow',
    name: 'Soft Glow',
    menu: 'stylize',
    params: [
      { type: 'range', key: 'r', label: 'Radius', min: 2, max: 80, default: 18, unit: 'px' },
      { type: 'range', key: 's', label: 'Strength', min: 0, max: 100, default: 55, unit: '%' },
    ],
    apply: (img, p) => glow(img, n(p, 'r'), n(p, 's')),
  },
  {
    id: 'rgb-split',
    name: 'RGB Split (Glitch)',
    menu: 'stylize',
    params: [{ type: 'range', key: 'amt', label: 'Offset', min: 1, max: 60, default: 8, unit: 'px' }],
    apply: (img, p) => F.rgbSplit(img, n(p, 'amt')),
  },
  {
    id: 'halftone',
    name: 'Halftone',
    menu: 'stylize',
    params: [{ type: 'range', key: 's', label: 'Dot size', min: 3, max: 40, default: 8, unit: 'px' }],
    apply: (img, p) => halftone(img, n(p, 's')),
  },
  {
    id: 'vignette',
    name: 'Vignette',
    menu: 'stylize',
    params: [
      { type: 'range', key: 'amt', label: 'Amount', min: -100, max: 100, default: 50, centered: true },
      { type: 'range', key: 'size', label: 'Midpoint', min: 0, max: 100, default: 50 },
    ],
    apply: (img, p) => F.vignette(img, n(p, 'amt'), n(p, 'size')),
  },

  /* -------------------------------- Distort -------------------------------- */
  {
    id: 'swirl',
    name: 'Twirl',
    menu: 'distort',
    params: [
      { type: 'range', key: 'a', label: 'Angle', min: -999, max: 999, default: 120, unit: '°' },
      { type: 'range', key: 'r', label: 'Radius', min: 10, max: 150, default: 100, unit: '%' },
    ],
    apply: (img, p) => F.swirl(img, n(p, 'a'), n(p, 'r')),
  },
  {
    id: 'pinch',
    name: 'Pinch',
    menu: 'distort',
    params: [{ type: 'range', key: 'amt', label: 'Amount', min: -100, max: 100, default: 50, centered: true }],
    apply: (img, p) => F.pinch(img, n(p, 'amt')),
  },
  {
    id: 'spherize',
    name: 'Spherize',
    menu: 'distort',
    params: [{ type: 'range', key: 'amt', label: 'Amount', min: -100, max: 100, default: 60, centered: true }],
    apply: (img, p) => F.spherize(img, n(p, 'amt')),
  },
  {
    id: 'wave',
    name: 'Wave',
    menu: 'distort',
    params: [
      { type: 'range', key: 'amp', label: 'Amplitude', min: 1, max: 100, default: 10, unit: 'px' },
      { type: 'range', key: 'wl', label: 'Wavelength', min: 4, max: 500, default: 80, unit: 'px' },
    ],
    apply: (img, p) => F.wave(img, n(p, 'amp'), n(p, 'wl')),
  },
  {
    id: 'ripple',
    name: 'Ripple',
    menu: 'distort',
    params: [
      { type: 'range', key: 'amp', label: 'Amplitude', min: 1, max: 100, default: 8, unit: 'px' },
      { type: 'range', key: 'wl', label: 'Wavelength', min: 4, max: 300, default: 40, unit: 'px' },
    ],
    apply: (img, p) => F.ripple(img, n(p, 'amp'), n(p, 'wl')),
  },

  /* -------------------------------- Render -------------------------------- */
  {
    id: 'clouds',
    name: 'Clouds',
    menu: 'render',
    params: [{ type: 'range', key: 'scale', label: 'Scale', min: 0.2, max: 4, step: 0.1, default: 1 }],
    apply: (img, p) => {
      const s = S();
      F.renderClouds(img, rgb(s.fg), rgb(s.bg), n(p, 'scale'));
    },
  },
];

export const filterById = (id: string) => FILTERS.find((f) => f.id === id);

export function defaultParams(f: FilterDef): Params {
  const p: Params = {};
  for (const x of f.params || []) if (x.type !== 'heading') p[x.key] = x.default;
  return p;
}
