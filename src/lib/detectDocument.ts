/**
 * Finds a menu / price sheet in a frame: the largest bright, roughly rectangular region.
 *
 * Runs on a tiny grayscale copy (~160px wide) so it is cheap enough for every few video frames.
 * Paper is almost always brighter than what's behind it (tables, walls, a phone bezel), so an
 * Otsu threshold separates it; text and photos printed on the paper leave holes but don't break
 * the region apart, so its bounding box still traces the sheet.
 */

import { detectQuad, isOpenCvReady, QuadCorners, warpFlat } from './menuQuad';

/** Normalized 0-1 box in the frame that was analysed */
export interface DocBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WORK_WIDTH = 160;
const MIN_AREA = 0.06; // smaller than this is probably a label, not a menu
const MAX_AREA = 0.94; // the sheet already fills the frame: nothing to crop
const MIN_FILL = 0.45; // region area / its bounding box; rejects blobs and diagonal streaks
const MIN_CONTRAST = 900; // Otsu between-class variance; below this the frame is too uniform

let scratch: HTMLCanvasElement | null = null;

function getScratch(w: number, h: number): CanvasRenderingContext2D | null {
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  return scratch.getContext('2d', { willReadFrequently: true });
}

function otsu(gray: Uint8Array): { threshold: number; variance: number } {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = { threshold: 128, variance: 0 };
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = ((wB / total) * (wF / total) * (mB - mF) ** 2);
    if (variance > best.variance) best = { threshold: t, variance };
  }
  return best;
}

/** Fallback brightness heuristic: detects the sheet inside `source` (optionally only the given source rect). */
export function detectDocumentFallback(
  source: CanvasImageSource,
  srcRect: { sx: number; sy: number; sw: number; sh: number }
): DocBox | null {
  const w = WORK_WIDTH;
  const h = Math.max(1, Math.round((srcRect.sh / srcRect.sw) * WORK_WIDTH));
  const ctx = getScratch(w, h);
  if (!ctx) return null;
  ctx.drawImage(source, srcRect.sx, srcRect.sy, srcRect.sw, srcRect.sh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const { threshold, variance } = otsu(gray);
  if (variance < MIN_CONTRAST) return null;

  // Label bright connected regions (4-neighbour flood fill) and keep the biggest one.
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;
  let label = 0;

  for (let start = 0; start < gray.length; start++) {
    if (labels[start] || gray[start] <= threshold) continue;
    label++;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let area = 0;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    while (top > 0) {
      const idx = stack[--top];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [x > 0 ? idx - 1 : -1, x < w - 1 ? idx + 1 : -1, y > 0 ? idx - w : -1, y < h - 1 ? idx + w : -1];
      for (const n of neighbours) {
        if (n >= 0 && !labels[n] && gray[n] > threshold) {
          labels[n] = label;
          stack[top++] = n;
        }
      }
    }
    if (!best || area > best.area) best = { area, minX, minY, maxX, maxY };
  }

  if (!best) return null;
  const bw = best.maxX - best.minX + 1;
  const bh = best.maxY - best.minY + 1;
  const boxArea = (bw * bh) / (w * h);
  const fill = best.area / (bw * bh);
  if (boxArea < MIN_AREA || boxArea > MAX_AREA || fill < MIN_FILL) return null;

  return { x: best.minX / w, y: best.minY / h, w: bw / w, h: bh / h };
}

/**
 * Detects the sheet inside `source`. Uses OpenCV `detectQuad` when loaded,
 * falling back to `detectDocumentFallback` while OpenCV is still loading.
 */
export function detectDocument(
  source: CanvasImageSource,
  srcRect: { sx: number; sy: number; sw: number; sh: number }
): DocBox | null {
  if (isOpenCvReady()) {
    const w = 320;
    const h = Math.max(1, Math.round((srcRect.sh / srcRect.sw) * w));
    const ctx = getScratch(w, h);
    if (ctx && scratch) {
      ctx.drawImage(source, srcRect.sx, srcRect.sy, srcRect.sw, srcRect.sh, 0, 0, w, h);
      const quad = detectQuad(scratch);
      if (quad) {
        const xs = quad.map((p) => p.x / w);
        const ys = quad.map((p) => p.y / h);
        const minX = Math.max(0, Math.min(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxX = Math.min(1, Math.max(...xs));
        const maxY = Math.min(1, Math.max(...ys));
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return null;
    }
  }
  return detectDocumentFallback(source, srcRect);
}

/** Pads a box by `pad` (fraction of its size) and clamps it to the frame. */
export function padBox(box: DocBox, pad = 0.03): DocBox {
  const x = Math.max(0, box.x - box.w * pad);
  const y = Math.max(0, box.y - box.h * pad);
  const right = Math.min(1, box.x + box.w * (1 + pad));
  const bottom = Math.min(1, box.y + box.h * (1 + pad));
  return { x, y, w: right - x, h: bottom - y };
}

/** Draws `srcRect` of `source`, cropped to `box` when given, as a JPEG no larger than `maxEdge`. */
export function renderCrop(
  source: CanvasImageSource,
  srcRect: { sx: number; sy: number; sw: number; sh: number },
  box: DocBox | null,
  maxEdge = 1600
): string | null {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = srcRect.sx + b.x * srcRect.sw;
  const sy = srcRect.sy + b.y * srcRect.sh;
  const sw = b.w * srcRect.sw;
  const sh = b.h * srcRect.sh;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Crops an uploaded photo to the sheet it contains, if one is clearly visible. */
export async function cropPhotoToDocument(dataUrl: string): Promise<{ dataUrl: string; cropped: boolean }> {
  // onload with a timeout rather than img.decode(), which can stall in background or hidden pages
  const img = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(img.naturalWidth > 0), 3000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = dataUrl;
  });
  if (!loaded) return { dataUrl, cropped: false };
  const rect = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };

  if (isOpenCvReady()) {
    const w = 320;
    const h = Math.max(1, Math.round((rect.sh / rect.sw) * w));
    const ctx = getScratch(w, h);
    if (ctx && scratch) {
      ctx.drawImage(img, 0, 0, rect.sw, rect.sh, 0, 0, w, h);
      const quad = detectQuad(scratch);
      if (quad) {
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = rect.sw;
        fullCanvas.height = rect.sh;
        const fullCtx = fullCanvas.getContext('2d');
        if (fullCtx) {
          fullCtx.drawImage(img, 0, 0);
          const fullCorners = quad.map((p) => ({
            x: (p.x / w) * rect.sw,
            y: (p.y / h) * rect.sh,
          })) as QuadCorners;
          const flat = warpFlat(fullCanvas, fullCorners);
          return { dataUrl: flat.toDataURL('image/jpeg', 0.85), cropped: true };
        }
      }
    }
  }

  const box = detectDocumentFallback(img, rect);
  const out = renderCrop(img, rect, box ? padBox(box) : null);
  return out ? { dataUrl: out, cropped: Boolean(box) } : { dataUrl, cropped: false };
}

