/* Destructive pixel filters operating on ImageData. All functions mutate in place unless noted. */

import { clamp, hslToRgb, rgbToHsl } from './util';

export type ColorMatrix = number[]; // 3 rows x 4 (r,g,b,offset)

const c255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function colorMatrixFilter(img: ImageData, m: ColorMatrix) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    d[i] = c255(m[0] * r + m[1] * g + m[2] * b + m[3]);
    d[i + 1] = c255(m[4] * r + m[5] * g + m[6] * b + m[7]);
    d[i + 2] = c255(m[8] * r + m[9] * g + m[10] * b + m[11]);
  }
}

export function applyLUT(img: ImageData, r: Uint8ClampedArray | number[], g = r, b = r) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[d[i]];
    d[i + 1] = g[d[i + 1]];
    d[i + 2] = b[d[i + 2]];
  }
}

function makeLUT(fn: (v: number) => number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(fn(i));
  return lut;
}

/* ---------------------------------- Blur ---------------------------------- */

function toPremultipliedFloat(img: ImageData): Float32Array {
  const d = img.data;
  const f = new Float32Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    f[i] = d[i] * a;
    f[i + 1] = d[i + 1] * a;
    f[i + 2] = d[i + 2] * a;
    f[i + 3] = d[i + 3];
  }
  return f;
}

function fromPremultipliedFloat(f: Float32Array, img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = f[i + 3];
    if (a <= 0.001) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      continue;
    }
    const k = 255 / a;
    d[i] = c255(f[i] * k);
    d[i + 1] = c255(f[i + 1] * k);
    d[i + 2] = c255(f[i + 2] * k);
    d[i + 3] = c255(a);
  }
}

function boxPassH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[(row + (k < 0 ? 0 : k > last ? last : k)) * 4 + c];
      for (let x = 0; x < w; x++) {
        dst[(row + x) * 4 + c] = sum * inv;
        let ai = x + r + 1;
        let si = x - r;
        if (ai > last) ai = last;
        if (si < 0) si = 0;
        sum += src[(row + ai) * 4 + c] - src[(row + si) * 4 + c];
      }
    }
  }
}

function boxPassV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1);
  const last = h - 1;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[((k < 0 ? 0 : k > last ? last : k) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * 4 + c] = sum * inv;
        let ai = y + r + 1;
        let si = y - r;
        if (ai > last) ai = last;
        if (si < 0) si = 0;
        sum += src[(ai * w + x) * 4 + c] - src[(si * w + x) * 4 + c];
      }
    }
  }
}

function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes.map((s) => Math.max(0, (s - 1) / 2));
}

/** Gaussian-like blur (3 box passes), alpha-correct. */
export function gaussianBlur(img: ImageData, radius: number) {
  if (radius <= 0) return;
  const { width: w, height: h } = img;
  const a = toPremultipliedFloat(img);
  const b = new Float32Array(a.length);
  for (const r of boxesForGauss(radius / 2)) {
    const ri = Math.round(r);
    if (ri < 1) continue;
    boxPassH(a, b, w, h, ri);
    boxPassV(b, a, w, h, ri);
  }
  fromPremultipliedFloat(a, img);
}

export function boxBlur(img: ImageData, radius: number) {
  gaussianBlur(img, radius * 2);
}

export function motionBlur(img: ImageData, angleDeg: number, distance: number) {
  if (distance < 1) return;
  const { width: w, height: h } = img;
  const src = toPremultipliedFloat(img);
  const dst = new Float32Array(src.length);
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const samples = Math.min(64, Math.max(3, Math.round(distance)));
  const offsets: [number, number][] = [];
  for (let s = 0; s < samples; s++) {
    const t = (s / (samples - 1) - 0.5) * distance;
    offsets.push([Math.round(dx * t), Math.round(dy * t)]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        al = 0;
      for (const [ox, oy] of offsets) {
        const sx = clamp(x + ox, 0, w - 1);
        const sy = clamp(y + oy, 0, h - 1);
        const i = (sy * w + sx) * 4;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
        al += src[i + 3];
      }
      const o = (y * w + x) * 4;
      dst[o] = r / samples;
      dst[o + 1] = g / samples;
      dst[o + 2] = b / samples;
      dst[o + 3] = al / samples;
    }
  }
  fromPremultipliedFloat(dst, img);
}

export function radialBlur(img: ImageData, amount: number, zoom: boolean) {
  const { width: w, height: h } = img;
  const src = toPremultipliedFloat(img);
  const dst = new Float32Array(src.length);
  const cx = w / 2,
    cy = h / 2;
  const samples = 16;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        al = 0;
      const dx = x - cx,
        dy = y - cy;
      for (let s = 0; s < samples; s++) {
        const t = (s / (samples - 1) - 0.5) * (amount / 100);
        let sx: number, sy: number;
        if (zoom) {
          sx = cx + dx * (1 + t * 0.5);
          sy = cy + dy * (1 + t * 0.5);
        } else {
          const ang = t * 0.5;
          const c = Math.cos(ang),
            si = Math.sin(ang);
          sx = cx + dx * c - dy * si;
          sy = cy + dx * si + dy * c;
        }
        const i = (clamp(Math.round(sy), 0, h - 1) * w + clamp(Math.round(sx), 0, w - 1)) * 4;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
        al += src[i + 3];
      }
      const o = (y * w + x) * 4;
      dst[o] = r / samples;
      dst[o + 1] = g / samples;
      dst[o + 2] = b / samples;
      dst[o + 3] = al / samples;
    }
  }
  fromPremultipliedFloat(dst, img);
}

/* -------------------------------- Sharpen --------------------------------- */

export function unsharpMask(img: ImageData, amount: number, radius: number, threshold: number) {
  const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  gaussianBlur(blurred, radius);
  const d = img.data;
  const b = blurred.data;
  const k = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = d[i + c] - b[i + c];
      if (Math.abs(diff) >= threshold) d[i + c] = c255(d[i + c] + diff * k);
    }
  }
}

export function convolve3x3(img: ImageData, kernel: number[], divisor = 1, offset = 0, keepAlpha = true) {
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const sy = clamp(y + ky, 0, h - 1);
        for (let kx = -1; kx <= 1; kx++) {
          const sx = clamp(x + kx, 0, w - 1);
          const i = (sy * w + sx) * 4;
          const kv = kernel[k++];
          r += src[i] * kv;
          g += src[i + 1] * kv;
          b += src[i + 2] * kv;
        }
      }
      const o = (y * w + x) * 4;
      d[o] = c255(r / divisor + offset);
      d[o + 1] = c255(g / divisor + offset);
      d[o + 2] = c255(b / divisor + offset);
      if (!keepAlpha) d[o + 3] = 255;
    }
  }
}

export const sharpen = (img: ImageData) => convolve3x3(img, [0, -1, 0, -1, 5, -1, 0, -1, 0]);

export function emboss(img: ImageData, strength = 1) {
  const s = strength;
  convolve3x3(img, [-2 * s, -s, 0, -s, 1, s, 0, s, 2 * s], 1, 0);
}

export function findEdges(img: ImageData) {
  const { width: w, height: h } = img;
  const src = img.data;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) lum[p] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (xx: number, yy: number) => lum[clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)];
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const v = 255 - c255(Math.hypot(gx, gy));
      const o = (y * w + x) * 4;
      src[o] = src[o + 1] = src[o + 2] = v;
    }
  }
}

/* --------------------------------- Noise ---------------------------------- */

export function addNoise(img: ImageData, amount: number, mono: boolean, gaussian = true) {
  const d = img.data;
  const k = amount * 2.55;
  const rnd = gaussian
    ? () => {
        // Box-Muller
        const u = 1 - Math.random();
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.5;
      }
    : () => Math.random() - 0.5;
  for (let i = 0; i < d.length; i += 4) {
    if (mono) {
      const n = rnd() * k;
      d[i] = c255(d[i] + n);
      d[i + 1] = c255(d[i + 1] + n);
      d[i + 2] = c255(d[i + 2] + n);
    } else {
      d[i] = c255(d[i] + rnd() * k);
      d[i + 1] = c255(d[i + 1] + rnd() * k);
      d[i + 2] = c255(d[i + 2] + rnd() * k);
    }
  }
}

/** Median filter using a sliding histogram per channel. */
export function median(img: ImageData, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const hist = new Uint32Array(256);
  const size = (2 * r + 1) * (2 * r + 1);
  const half = size >> 1;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      hist.fill(0);
      for (let ky = -r; ky <= r; ky++) {
        const sy = clamp(y + ky, 0, h - 1);
        for (let kx = -r; kx <= r; kx++) hist[src[(sy * w + clamp(kx, 0, w - 1)) * 4 + c]]++;
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        let m = 0;
        for (; m < 256; m++) {
          acc += hist[m];
          if (acc > half) break;
        }
        d[(y * w + x) * 4 + c] = m;
        const ox = clamp(x - r, 0, w - 1);
        const nx = clamp(x + r + 1, 0, w - 1);
        for (let ky = -r; ky <= r; ky++) {
          const sy = clamp(y + ky, 0, h - 1);
          hist[src[(sy * w + ox) * 4 + c]]--;
          hist[src[(sy * w + nx) * 4 + c]]++;
        }
      }
    }
  }
}

/* -------------------------------- Stylize --------------------------------- */

export function pixelate(img: ImageData, size: number) {
  const s = Math.max(2, Math.round(size));
  const { width: w, height: h } = img;
  const d = img.data;
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      const ey = Math.min(by + s, h),
        ex = Math.min(bx + s, w);
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          const al = d[i + 3];
          r += d[i] * al;
          g += d[i + 1] * al;
          b += d[i + 2] * al;
          a += al;
          n++;
        }
      const ar = a || 1;
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          d[i] = r / ar;
          d[i + 1] = g / ar;
          d[i + 2] = b / ar;
          d[i + 3] = a / n;
        }
    }
  }
}

export function posterize(img: ImageData, levels: number) {
  const n = Math.max(2, Math.round(levels));
  const step = 255 / (n - 1);
  applyLUT(img, makeLUT((v) => Math.round(Math.round(v / step) * step)));
}

export function threshold(img: ImageData, level: number) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= level ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

/** Kuwahara filter — a painterly "oil paint" look. Uses summed-area tables. */
export function oilPaint(img: ImageData, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h } = img;
  const d = img.data;
  const W = w + 1;
  const sat = (n: number) => new Float64Array(W * (h + 1) * n);
  const sum = sat(3);
  const sq = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      const i = ((y - 1) * w + (x - 1)) * 4;
      const p = y * W + x;
      const up = (y - 1) * W + x;
      const left = y * W + x - 1;
      const ul = (y - 1) * W + x - 1;
      for (let c = 0; c < 3; c++) sum[p * 3 + c] = d[i + c] + sum[up * 3 + c] + sum[left * 3 + c] - sum[ul * 3 + c];
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sq[p] = l * l + sq[up] + sq[left] - sq[ul];
    }
  }
  const out = new Uint8ClampedArray(d);
  const region = (x0: number, y0: number, x1: number, y1: number, res: number[]) => {
    x0 = clamp(x0, 0, w - 1);
    y0 = clamp(y0, 0, h - 1);
    x1 = clamp(x1, 0, w - 1);
    y1 = clamp(y1, 0, h - 1);
    const A = y0 * W + x0,
      B = y0 * W + x1 + 1,
      C = (y1 + 1) * W + x0,
      D = (y1 + 1) * W + x1 + 1;
    const n = (x1 - x0 + 1) * (y1 - y0 + 1);
    for (let c = 0; c < 3; c++) res[c] = (sum[D * 3 + c] - sum[B * 3 + c] - sum[C * 3 + c] + sum[A * 3 + c]) / n;
    const meanL = 0.299 * res[0] + 0.587 * res[1] + 0.114 * res[2];
    return (sq[D] - sq[B] - sq[C] + sq[A]) / n - meanL * meanL;
  };
  const tmp = [0, 0, 0];
  const best = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVar = Infinity;
      const quads = [
        [x - r, y - r, x, y],
        [x, y - r, x + r, y],
        [x - r, y, x, y + r],
        [x, y, x + r, y + r],
      ];
      for (const q of quads) {
        const v = region(q[0], q[1], q[2], q[3], tmp);
        if (v < minVar) {
          minVar = v;
          best[0] = tmp[0];
          best[1] = tmp[1];
          best[2] = tmp[2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = best[0];
      out[o + 1] = best[1];
      out[o + 2] = best[2];
    }
  }
  d.set(out);
}

export function rgbSplit(img: ImageData, amount: number) {
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const s = Math.round(amount);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      d[o] = src[(y * w + clamp(x - s, 0, w - 1)) * 4];
      d[o + 2] = src[(y * w + clamp(x + s, 0, w - 1)) * 4 + 2];
    }
  }
}

export function vignette(img: ImageData, amount: number, size = 50) {
  const { width: w, height: h } = img;
  const d = img.data;
  const cx = w / 2,
    cy = h / 2;
  const maxD = Math.hypot(cx, cy);
  const inner = (size / 100) * maxD * 0.9;
  const k = amount / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dd = Math.hypot(x - cx, y - cy);
      if (dd <= inner) continue;
      let t = (dd - inner) / (maxD - inner);
      t = t * t * (3 - 2 * t);
      const f = 1 - t * k;
      const o = (y * w + x) * 4;
      if (k >= 0) {
        d[o] *= f;
        d[o + 1] *= f;
        d[o + 2] *= f;
      } else {
        const tt = -t * k;
        d[o] += (255 - d[o]) * tt;
        d[o + 1] += (255 - d[o + 1]) * tt;
        d[o + 2] += (255 - d[o + 2]) * tt;
      }
    }
  }
}

/* -------------------------------- Distort --------------------------------- */

function sampleBilinear(src: Uint8ClampedArray, w: number, h: number, x: number, y: number, out: number[]) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
  }
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1),
    y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0,
    fy = y - y0;
  const i00 = (y0 * w + x0) * 4,
    i10 = (y0 * w + x1) * 4,
    i01 = (y1 * w + x0) * 4,
    i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
    const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
}

function remap(img: ImageData, fn: (x: number, y: number) => [number, number]) {
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = fn(x, y);
      sampleBilinear(src, w, h, sx, sy, px);
      const o = (y * w + x) * 4;
      d[o] = px[0];
      d[o + 1] = px[1];
      d[o + 2] = px[2];
      d[o + 3] = px[3];
    }
  }
}

export function swirl(img: ImageData, angleDeg: number, radiusPct: number) {
  const { width: w, height: h } = img;
  const cx = w / 2,
    cy = h / 2;
  const R = (Math.min(w, h) / 2) * (radiusPct / 100);
  const ang = (angleDeg * Math.PI) / 180;
  remap(img, (x, y) => {
    const dx = x - cx,
      dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= R) return [x, y];
    const t = 1 - d / R;
    const a = ang * t * t;
    const c = Math.cos(a),
      s = Math.sin(a);
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

export function pinch(img: ImageData, amount: number) {
  const { width: w, height: h } = img;
  const cx = w / 2,
    cy = h / 2;
  const R = Math.min(w, h) / 2;
  const k = amount / 100;
  remap(img, (x, y) => {
    const dx = x - cx,
      dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= R || d === 0) return [x, y];
    const t = d / R;
    const f = Math.pow(Math.sin((Math.PI / 2) * t), -k);
    return [cx + dx * f, cy + dy * f];
  });
}

export function spherize(img: ImageData, amount: number) {
  const { width: w, height: h } = img;
  const cx = w / 2,
    cy = h / 2;
  const R = Math.min(w, h) / 2;
  const k = amount / 100;
  remap(img, (x, y) => {
    const dx = (x - cx) / R,
      dy = (y - cy) / R;
    const d = Math.hypot(dx, dy);
    if (d >= 1 || d === 0) return [x, y];
    const nd = (1 - k) * d + k * (Math.asin(d) / (Math.PI / 2));
    const f = nd / d;
    return [cx + dx * f * R, cy + dy * f * R];
  });
}

export function wave(img: ImageData, amplitude: number, wavelength: number) {
  const wl = Math.max(2, wavelength);
  remap(img, (x, y) => [x + amplitude * Math.sin((2 * Math.PI * y) / wl), y + amplitude * Math.sin((2 * Math.PI * x) / wl)]);
}

export function ripple(img: ImageData, amplitude: number, wavelength: number) {
  const { width: w, height: h } = img;
  const cx = w / 2,
    cy = h / 2;
  const wl = Math.max(2, wavelength);
  remap(img, (x, y) => {
    const dx = x - cx,
      dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const off = amplitude * Math.sin((2 * Math.PI * d) / wl);
    return [x + (dx / d) * off, y + (dy / d) * off];
  });
}

/* ------------------------------ Adjustments ------------------------------- */

export function brightnessContrast(img: ImageData, brightness: number, contrast: number) {
  const b = brightness * 1.5;
  const c = contrast >= 0 ? 1 + contrast / 50 : 1 + contrast / 100;
  applyLUT(img, makeLUT((v) => (v + b - 127.5) * c + 127.5));
}

export function levels(img: ImageData, inBlack: number, inWhite: number, gamma: number, outBlack: number, outWhite: number) {
  const range = Math.max(1, inWhite - inBlack);
  applyLUT(
    img,
    makeLUT((v) => {
      const t = clamp((v - inBlack) / range, 0, 1);
      return outBlack + Math.pow(t, 1 / gamma) * (outWhite - outBlack);
    }),
  );
}

export function exposure(img: ImageData, ev: number, offset: number, gamma: number) {
  const m = Math.pow(2, ev);
  applyLUT(
    img,
    makeLUT((v) => {
      const t = Math.max(0, (v / 255) * m + offset);
      return Math.pow(t, 1 / gamma) * 255;
    }),
  );
}

/** Monotone cubic interpolation through control points (x,y in 0..255). */
export function curveLUT(points: { x: number; y: number }[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const n = pts.length;
  const dx: number[] = [],
    dy: number[] = [],
    m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(1e-6, pts[i + 1].x - pts[i].x));
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1],
        w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  for (let x = 0; x < 256; x++) {
    if (x <= pts[0].x) {
      lut[x] = pts[0].y;
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[x] = pts[n - 1].y;
      continue;
    }
    let i = 0;
    while (i < n - 2 && x > pts[i + 1].x) i++;
    const h = dx[i];
    const s = (x - pts[i].x) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1,
      h10 = s ** 3 - 2 * s ** 2 + s,
      h01 = -2 * s ** 3 + 3 * s ** 2,
      h11 = s ** 3 - s ** 2;
    lut[x] = h00 * pts[i].y + h10 * h * t[i] + h01 * pts[i + 1].y + h11 * h * t[i + 1];
  }
  return lut;
}

export function curves(
  img: ImageData,
  rgb: { x: number; y: number }[],
  r?: { x: number; y: number }[],
  g?: { x: number; y: number }[],
  b?: { x: number; y: number }[],
) {
  const master = curveLUT(rgb);
  const lr = r ? curveLUT(r) : null;
  const lg = g ? curveLUT(g) : null;
  const lb = b ? curveLUT(b) : null;
  const compose = (l: Uint8ClampedArray | null) => {
    const out = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) out[i] = master[l ? l[i] : i];
    return out;
  };
  applyLUT(img, compose(lr), compose(lg), compose(lb));
}

export function hueSaturation(img: ImageData, hue: number, saturation: number, lightness: number, colorize = false) {
  const d = img.data;
  const hs = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  for (let i = 0; i < d.length; i += 4) {
    let { h, s: ss, l: ll } = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (colorize) {
      h = ((hue + 360) % 360) / 360;
      ss = clamp(0.25 + s * 0.75, 0, 1);
    } else {
      h = (h + hs + 1) % 1;
      ss = s >= 0 ? ss + (1 - ss) * s * ss * 1.2 : ss * (1 + s);
      ss = clamp(ss, 0, 1);
    }
    ll = l >= 0 ? ll + (1 - ll) * l : ll * (1 + l);
    const c = hslToRgb(h, ss, ll);
    d[i] = c.r;
    d[i + 1] = c.g;
    d[i + 2] = c.b;
  }
}

export function vibrance(img: ImageData, vib: number, sat: number) {
  const d = img.data;
  const v = vib / 100;
  const s = sat / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const cur = (max - Math.min(r, g, b)) / 255;
    const amt = v * (1 - cur) * 1.5 + s;
    d[i] = c255(r + (r - avg) * amt);
    d[i + 1] = c255(g + (g - avg) * amt);
    d[i + 2] = c255(b + (b - avg) * amt);
  }
}

export function colorBalance(
  img: ImageData,
  shadows: [number, number, number],
  mids: [number, number, number],
  highs: [number, number, number],
  preserveLuminosity = true,
) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const ws = clamp(1 - lum * 3.33, 0, 1);
    const wh = clamp((lum - 0.66) * 3.33, 0, 1);
    const wm = 1 - ws - wh;
    let nr = r + (shadows[0] * ws + mids[0] * wm + highs[0] * wh) * 1.2;
    let ng = g + (shadows[1] * ws + mids[1] * wm + highs[1] * wh) * 1.2;
    let nb = b + (shadows[2] * ws + mids[2] * wm + highs[2] * wh) * 1.2;
    if (preserveLuminosity) {
      const nl = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const diff = lum * 255 - nl;
      nr += diff;
      ng += diff;
      nb += diff;
    }
    d[i] = c255(nr);
    d[i + 1] = c255(ng);
    d[i + 2] = c255(nb);
  }
}

export interface BWWeights {
  reds: number;
  yellows: number;
  greens: number;
  cyans: number;
  blues: number;
  magentas: number;
}

export const DEFAULT_BW: BWWeights = { reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 };

export function blackWhite(img: ImageData, w: BWWeights, tint?: { color: [number, number, number]; amount: number }) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const min = Math.min(r, g, b);
    let max: number, mid: number, wp: number, ws: number;
    if (r >= g && r >= b) {
      max = r;
      wp = w.reds;
      if (g >= b) {
        mid = g;
        ws = w.yellows;
      } else {
        mid = b;
        ws = w.magentas;
      }
    } else if (g >= r && g >= b) {
      max = g;
      wp = w.greens;
      if (r >= b) {
        mid = r;
        ws = w.yellows;
      } else {
        mid = b;
        ws = w.cyans;
      }
    } else {
      max = b;
      wp = w.blues;
      if (r >= g) {
        mid = r;
        ws = w.magentas;
      } else {
        mid = g;
        ws = w.cyans;
      }
    }
    let v = min + (max - mid) * (wp / 100) + (mid - min) * (ws / 100);
    v = c255(v);
    if (tint && tint.amount > 0) {
      const t = tint.amount / 100;
      d[i] = c255(v * (1 - t) + ((v * tint.color[0]) / 255) * t * 1.15);
      d[i + 1] = c255(v * (1 - t) + ((v * tint.color[1]) / 255) * t * 1.15);
      d[i + 2] = c255(v * (1 - t) + ((v * tint.color[2]) / 255) * t * 1.15);
    } else d[i] = d[i + 1] = d[i + 2] = v;
  }
}

export function photoFilter(img: ImageData, color: [number, number, number], density: number, preserveLuminosity = true) {
  const d = img.data;
  const k = density / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    let nr = r * (1 - k) + ((r * color[0]) / 255) * k;
    let ng = g * (1 - k) + ((g * color[1]) / 255) * k;
    let nb = b * (1 - k) + ((b * color[2]) / 255) * k;
    // Blend toward the filter color in the multiply result (like a gel in front of the lens).
    nr = nr * (1 - k * 0.35) + color[0] * k * 0.35 * (r / 255);
    ng = ng * (1 - k * 0.35) + color[1] * k * 0.35 * (g / 255);
    nb = nb * (1 - k * 0.35) + color[2] * k * 0.35 * (b / 255);
    if (preserveLuminosity) {
      const ol = 0.299 * r + 0.587 * g + 0.114 * b;
      const nl = 0.299 * nr + 0.587 * ng + 0.114 * nb || 1;
      const f = ol / nl;
      nr *= f;
      ng *= f;
      nb *= f;
    }
    d[i] = c255(nr);
    d[i + 1] = c255(ng);
    d[i + 2] = c255(nb);
  }
}

export function invert(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

export function desaturate(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

export function sepia(img: ImageData) {
  colorMatrixFilter(img, [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0]);
}

function histogramPercentiles(img: ImageData, channel: number | 'lum', lowPct: number, highPct: number) {
  const hist = new Uint32Array(256);
  const d = img.data;
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const v = channel === 'lum' ? Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) : d[i + channel];
    hist[v]++;
    total++;
  }
  let lo = 0,
    hi = 255,
    acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > total * lowPct) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc > total * highPct) {
      hi = i;
      break;
    }
  }
  return [lo, Math.max(hi, lo + 1)];
}

export function autoTone(img: ImageData) {
  const luts = [0, 1, 2].map((c) => {
    const [lo, hi] = histogramPercentiles(img, c, 0.001, 0.001);
    return makeLUT((v) => ((v - lo) / (hi - lo)) * 255);
  });
  applyLUT(img, luts[0], luts[1], luts[2]);
}

export function autoContrast(img: ImageData) {
  const [lo, hi] = histogramPercentiles(img, 'lum', 0.005, 0.005);
  applyLUT(img, makeLUT((v) => ((v - lo) / (hi - lo)) * 255));
}

export function autoColor(img: ImageData) {
  // Gray-world white balance followed by a gentle contrast stretch.
  const d = img.data;
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    sr += d[i];
    sg += d[i + 1];
    sb += d[i + 2];
    n++;
  }
  if (!n) return;
  const avg = (sr + sg + sb) / (3 * n);
  const kr = avg / (sr / n || 1),
    kg = avg / (sg / n || 1),
    kb = avg / (sb / n || 1);
  applyLUT(
    img,
    makeLUT((v) => v * kr),
    makeLUT((v) => v * kg),
    makeLUT((v) => v * kb),
  );
  autoContrast(img);
}

export function histogram(img: ImageData) {
  const r = new Uint32Array(256),
    g = new Uint32Array(256),
    b = new Uint32Array(256),
    l = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    l[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  return { r, g, b, l };
}

/* --------------------------------- Render --------------------------------- */

function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => {
    const v = h & 3;
    return (v & 1 ? -x : x) + (v & 2 ? -y : y);
  };
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255,
      Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x),
      v = fade(y);
    const a = perm[X] + Y,
      b = perm[X + 1] + Y;
    const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
    const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
}

export function renderClouds(img: ImageData, fg: [number, number, number], bg: [number, number, number], scale = 1) {
  const noise = makeNoise(Math.floor(Math.random() * 100000) + 1);
  const { width: w, height: h } = img;
  const d = img.data;
  const base = (Math.max(w, h) / 4) * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let amp = 1,
        freq = 1 / base,
        v = 0,
        norm = 0;
      for (let o = 0; o < 6; o++) {
        v += noise(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      const t = clamp(v / norm + 0.5, 0, 1);
      const i = (y * w + x) * 4;
      d[i] = bg[0] + (fg[0] - bg[0]) * t;
      d[i + 1] = bg[1] + (fg[1] - bg[1]) * t;
      d[i + 2] = bg[2] + (fg[2] - bg[2]) * t;
      d[i + 3] = 255;
    }
  }
}
