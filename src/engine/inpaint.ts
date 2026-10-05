/**
 * Exemplar-based inpainting ("content-aware fill").
 * Fills masked pixels from the outside in, picking for each pixel the best-matching
 * known patch among random and propagated candidates (coherent texture copying).
 */
export function inpaint(img: ImageData, mask: Uint8Array, r = 4) {
  const { width: w, height: h, data } = img;
  const N = w * h;
  const known = new Uint8Array(N);
  let remaining = 0;
  for (let i = 0; i < N; i++) {
    if (mask[i]) remaining++;
    else known[i] = 1;
  }
  if (!remaining || remaining === N) return;

  // Integral image of unknown pixels to find fully-known source windows quickly.
  const W = w + 1;
  const sat = new Int32Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += mask[(y - 1) * w + (x - 1)] ? 1 : 0;
      sat[y * W + x] = sat[(y - 1) * W + x] + row;
    }
  }
  const unknownIn = (x0: number, y0: number, x1: number, y1: number) =>
    sat[(y1 + 1) * W + x1 + 1] - sat[y0 * W + x1 + 1] - sat[(y1 + 1) * W + x0] + sat[y0 * W + x0];

  const isSource = new Uint8Array(N);
  const sources: number[] = [];
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      if (unknownIn(x - r, y - r, x + r, y + r) === 0) {
        isSource[y * w + x] = 1;
        sources.push(y * w + x);
      }
    }
  }
  if (sources.length < 16) {
    diffuse(img, mask);
    return;
  }

  const srcOf = new Int32Array(N).fill(-1);
  let frontier: number[] = [];
  const inFrontier = new Uint8Array(N);
  const addFrontierAround = (p: number) => {
    const x = p % w,
      y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!known[q] && !inFrontier[q]) {
          inFrontier[q] = 1;
          frontier.push(q);
        }
      }
  };
  for (let i = 0; i < N; i++) {
    if (known[i]) continue;
    const x = i % w,
      y = (i / w) | 0;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && known[ny * w + nx]) {
          edge = true;
          break;
        }
      }
    if (edge) {
      inFrontier[i] = 1;
      frontier.push(i);
    }
  }

  const ssd = (p: number, q: number, limit: number) => {
    const px = p % w,
      py = (p / w) | 0;
    const qx = q % w,
      qy = (q / w) | 0;
    let sum = 0,
      count = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ay = py + dy;
      if (ay < 0 || ay >= h) continue;
      const by = qy + dy;
      for (let dx = -r; dx <= r; dx++) {
        const ax = px + dx;
        if (ax < 0 || ax >= w) continue;
        const a = ay * w + ax;
        if (!known[a]) continue;
        const b = (by * w + qx + dx) * 4;
        const ai = a * 4;
        const dr = data[ai] - data[b],
          dg = data[ai + 1] - data[b + 1],
          db = data[ai + 2] - data[b + 2];
        sum += dr * dr + dg * dg + db * db;
        count++;
      }
      if (count > 4 && sum / count > limit) return Infinity;
    }
    return count ? sum / count : Infinity;
  };

  const localRange = Math.max(24, r * 10);
  let guard = 0;
  while (remaining > 0 && frontier.length && guard++ < 10000) {
    const current = frontier;
    frontier = [];
    // Process pixels with more known neighbours first for better structure continuation.
    current.sort((a, b) => knownNeighbours(b) - knownNeighbours(a));
    for (const p of current) {
      inFrontier[p] = 0;
      if (known[p]) continue;
      const px = p % w,
        py = (p / w) | 0;
      let best = -1,
        bestScore = Infinity;
      const tryCand = (q: number) => {
        if (q < 0 || q >= N || !isSource[q]) return;
        const s = ssd(p, q, bestScore);
        if (s < bestScore) {
          bestScore = s;
          best = q;
        }
      };
      // Propagated candidates from already-filled neighbours.
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = px + dx,
            ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const s = srcOf[ny * w + nx];
          if (s < 0) continue;
          const sx = (s % w) - dx,
            sy = ((s / w) | 0) - dy;
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCand(sy * w + sx);
        }
      // Local random candidates.
      for (let k = 0; k < 28; k++) {
        const sx = px + Math.round((Math.random() * 2 - 1) * localRange);
        const sy = py + Math.round((Math.random() * 2 - 1) * localRange);
        if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCand(sy * w + sx);
      }
      // Global random candidates.
      for (let k = 0; k < 14; k++) tryCand(sources[(Math.random() * sources.length) | 0]);
      if (best < 0) best = sources[(Math.random() * sources.length) | 0];
      const pi = p * 4,
        bi = best * 4;
      data[pi] = data[bi];
      data[pi + 1] = data[bi + 1];
      data[pi + 2] = data[bi + 2];
      data[pi + 3] = data[bi + 3];
      srcOf[p] = best;
      known[p] = 1;
      remaining--;
      addFrontierAround(p);
    }
  }

  // Soften seams slightly inside the filled region.
  const copy = new Uint8ClampedArray(data);
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    const x = i % w,
      y = (i / w) | 0;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += copy[((y + dy) * w + x + dx) * 4 + c];
      data[i * 4 + c] = copy[i * 4 + c] * 0.6 + (s / 9) * 0.4;
    }
  }

  function knownNeighbours(p: number) {
    const x = p % w,
      y = (p / w) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && known[ny * w + nx]) n++;
      }
    return n;
  }
}

/** Smooth membrane fill used when there is not enough source texture. */
export function diffuse(img: ImageData, mask: Uint8Array, iterations = 300) {
  const { width: w, height: h, data } = img;
  const idx: number[] = [];
  for (let i = 0; i < w * h; i++) if (mask[i]) idx.push(i);
  if (!idx.length) return;
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0;
  for (let i = 0; i < w * h; i++)
    if (!mask[i]) {
      sr += data[i * 4];
      sg += data[i * 4 + 1];
      sb += data[i * 4 + 2];
      n++;
    }
  for (const i of idx) {
    data[i * 4] = sr / (n || 1);
    data[i * 4 + 1] = sg / (n || 1);
    data[i * 4 + 2] = sb / (n || 1);
    data[i * 4 + 3] = 255;
  }
  for (let it = 0; it < iterations; it++) {
    for (const i of idx) {
      const x = i % w,
        y = (i / w) | 0;
      let r = 0,
        g = 0,
        b = 0,
        c = 0;
      if (x > 0) {
        r += data[(i - 1) * 4];
        g += data[(i - 1) * 4 + 1];
        b += data[(i - 1) * 4 + 2];
        c++;
      }
      if (x < w - 1) {
        r += data[(i + 1) * 4];
        g += data[(i + 1) * 4 + 1];
        b += data[(i + 1) * 4 + 2];
        c++;
      }
      if (y > 0) {
        r += data[(i - w) * 4];
        g += data[(i - w) * 4 + 1];
        b += data[(i - w) * 4 + 2];
        c++;
      }
      if (y < h - 1) {
        r += data[(i + w) * 4];
        g += data[(i + w) * 4 + 1];
        b += data[(i + w) * 4 + 2];
        c++;
      }
      data[i * 4] = r / c;
      data[i * 4 + 1] = g / c;
      data[i * 4 + 2] = b / c;
    }
  }
}
