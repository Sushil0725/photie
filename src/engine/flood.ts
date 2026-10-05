import { createCanvas, ctx2d } from './util';

/** Returns a 0/1 mask of pixels similar to the seed pixel. */
export function floodMask(img: ImageData, sx: number, sy: number, tolerance: number, contiguous: boolean): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
  const si = (sy * w + sx) * 4;
  const r0 = data[si],
    g0 = data[si + 1],
    b0 = data[si + 2],
    a0 = data[si + 3];
  const tol = tolerance;
  const match = (p: number) => {
    const i = p * 4;
    const a = data[i + 3];
    // Fully transparent pixels match each other regardless of their (meaningless) color.
    if (a0 === 0 && a === 0) return true;
    return (
      Math.abs(data[i] - r0) <= tol &&
      Math.abs(data[i + 1] - g0) <= tol &&
      Math.abs(data[i + 2] - b0) <= tol &&
      Math.abs(a - a0) <= tol
    );
  };
  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (match(p)) mask[p] = 1;
    return mask;
  }
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let p = y * w + x;
    while (x >= 0 && !mask[p] && match(p)) {
      x--;
      p--;
    }
    x++;
    p++;
    let up = false,
      down = false;
    while (x < w && !mask[p] && match(p)) {
      mask[p] = 1;
      if (y > 0) {
        const q = p - w;
        if (!mask[q] && match(q)) {
          if (!up) {
            stack.push(x, y - 1);
            up = true;
          }
        } else up = false;
      }
      if (y < h - 1) {
        const q = p + w;
        if (!mask[q] && match(q)) {
          if (!down) {
            stack.push(x, y + 1);
            down = true;
          }
        } else down = false;
      }
      x++;
      p++;
    }
  }
  return mask;
}

/** Converts a 0/1 mask into an alpha canvas. */
export function maskToCanvas(mask: Uint8Array, w: number, h: number, antialias = false): HTMLCanvasElement {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c, true);
  const img = ctx.createImageData(w, h);
  for (let p = 0; p < w * h; p++) if (mask[p]) img.data[p * 4 + 3] = 255;
  if (antialias) {
    // Soften the staircase edge by averaging alpha on boundary pixels.
    const src = new Uint8ClampedArray(img.data);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const m = mask[p];
        if (m === mask[p - 1] && m === mask[p + 1] && m === mask[p - w] && m === mask[p + w]) continue;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * w + x + dx) * 4 + 3];
        img.data[p * 4 + 3] = s / 9;
      }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
