import sharp from 'sharp';
import { GoogleGenAI, MediaResolution, ThinkingLevel, Type } from '@google/genai';
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, GEMINI_TIMEOUT_MS } from '../config';
import { PerceivedItem, TraceStep } from '../agent/types';
import { OcrWord } from './ocr';
import { groupWordsIntoLines, levSim, norm } from './fuse';

export interface TileSpec {
  index: number;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tileSize: number;
  hasLeft: boolean;
  hasRight: boolean;
  hasTop: boolean;
  hasBottom: boolean;
}

export interface TiledPerceivedItem extends PerceivedItem {
  clipped?: boolean;
}

export interface TileItemDetection {
  item: TiledPerceivedItem;
  tile: Pick<TileSpec, 'x' | 'y' | 'w' | 'h' | 'hasLeft' | 'hasRight' | 'hasTop' | 'hasBottom'>;
}

const DEFAULT_TILE_SIZE = 1024;
const LARGE_TILE_SIZE = 1280;
const MAX_TILES = 12;
const MAX_CONCURRENT_TILES = 4;

/**
 * Decides whether a menu photo needs tiling after the initial full-image read:
 * - More than 14 items, OR
 * - OCR line count is more than 1.3x the item count (rows were missed), OR
 * - Image long edge > 1800px and median word height < 1.2% of image height.
 */
export function shouldTile(
  items: PerceivedItem[],
  words: OcrWord[],
  imageW: number,
  imageH: number
): boolean {
  if (items.length > 14) {
    return true;
  }

  const contentWords = words.filter((w) => norm(w.text).length > 0);
  if (contentWords.length > 0) {
    const lines = groupWordsIntoLines(contentWords);
    const ocrLineCount = lines.length;

    // Only treat line count excess as missed rows when there are enough lines to be a multi-row menu
    if (ocrLineCount > 10 && ocrLineCount > 1.3 * Math.max(1, items.length)) {
      return true;
    }

    const longEdge = Math.max(imageW, imageH);
    if (longEdge > 1800) {
      const heights = contentWords
        .map((w) => Math.max(0, w.box[2] - w.box[0]))
        .sort((a, b) => a - b);
      const mid = Math.floor(heights.length / 2);
      const medianHeightNorm =
        heights.length % 2 === 1 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
      const medianWordHeightPct = medianHeightNorm / 10; // 0-1000 -> 0-100%
      if (medianWordHeightPct < 1.2) {
        return true;
      }
    }
  }

  return false;
}

function computeAxisSegments(
  length: number,
  tileSize: number
): Array<{ pos: number; size: number }> {
  const safeLen = Math.max(1, Math.round(length));
  if (safeLen <= tileSize) {
    return [{ pos: 0, size: safeLen }];
  }

  // 20% overlap -> stride is 80% of tileSize (819px for 1024px, 1024px for 1280px)
  const stride = tileSize === 1024 ? 819 : Math.round(tileSize * 0.8);
  const minSliver = 0.3 * tileSize;
  const segments: Array<{ pos: number; size: number }> = [];

  for (let pos = 0; pos < safeLen; pos += stride) {
    const size = Math.min(tileSize, safeLen - pos);
    if (pos > 0 && size < minSliver) {
      break;
    }
    segments.push({ pos, size });
    if (pos + size >= safeLen) {
      break;
    }
  }

  return segments;
}

function buildGridForTileSize(imageW: number, imageH: number, tileSize: number): TileSpec[] {
  const xSegs = computeAxisSegments(imageW, tileSize);
  const ySegs = computeAxisSegments(imageH, tileSize);
  const raw: Omit<TileSpec, 'hasLeft' | 'hasRight' | 'hasTop' | 'hasBottom'>[] = [];

  let index = 0;
  for (let row = 0; row < ySegs.length; row++) {
    for (let col = 0; col < xSegs.length; col++) {
      raw.push({
        index: index++,
        col,
        row,
        x: xSegs[col].pos,
        y: ySegs[row].pos,
        w: xSegs[col].size,
        h: ySegs[row].size,
        tileSize,
      });
    }
  }

  return raw.map((t) => ({
    ...t,
    hasLeft: t.col > 0,
    hasRight: t.col < xSegs.length - 1,
    hasTop: t.row > 0,
    hasBottom: t.row < ySegs.length - 1,
  }));
}

/**
 * Plans 1024px tiles with 20% overlap (stride 819px), skipping slivers < 30% of tile size.
 * Caps at 12 tiles; if more than 12 would be needed, uses 1280px tiles instead and caps at 12.
 */
export function planTiles(imageW: number, imageH: number): TileSpec[] {
  let grid = buildGridForTileSize(imageW, imageH, DEFAULT_TILE_SIZE);
  if (grid.length > MAX_TILES) {
    grid = buildGridForTileSize(imageW, imageH, LARGE_TILE_SIZE);
  }
  if (grid.length > MAX_TILES) {
    const capped = grid.slice(0, MAX_TILES);
    const coords = new Set(capped.map((t) => `${t.col},${t.row}`));
    return capped.map((t, idx) => ({
      ...t,
      index: idx,
      hasLeft: coords.has(`${t.col - 1},${t.row}`),
      hasRight: coords.has(`${t.col + 1},${t.row}`),
      hasTop: coords.has(`${t.col},${t.row - 1}`),
      hasBottom: coords.has(`${t.col},${t.row + 1}`),
    }));
  }
  return grid;
}

function clamp1000(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1000, Math.round(val)));
}

/**
 * Maps a tile-local 0-1000 box [ymin, xmin, ymax, xmax] to global 0-1000 image coordinates:
 * gx = (tileX + xmin/1000*tileW) / W * 1000, and the same for y.
 */
export function mapTileBoxToGlobal(
  box: [number, number, number, number],
  tile: { x: number; y: number; w: number; h: number },
  imageW: number,
  imageH: number
): [number, number, number, number] {
  const [ymin, xmin, ymax, xmax] = box;
  const safeW = Math.max(1, imageW);
  const safeH = Math.max(1, imageH);

  const gyMin = ((tile.y + (ymin / 1000) * tile.h) / safeH) * 1000;
  const gxMin = ((tile.x + (xmin / 1000) * tile.w) / safeW) * 1000;
  const gyMax = ((tile.y + (ymax / 1000) * tile.h) / safeH) * 1000;
  const gxMax = ((tile.x + (xmax / 1000) * tile.w) / safeW) * 1000;

  return [clamp1000(gyMin), clamp1000(gxMin), clamp1000(gyMax), clamp1000(gxMax)];
}

export function boxIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const [ay1, ax1, ay2, ax2] = a;
  const [by1, bx1, by2, bx2] = b;

  const interY1 = Math.max(ay1, by1);
  const interX1 = Math.max(ax1, bx1);
  const interY2 = Math.min(ay2, by2);
  const interX2 = Math.min(ax2, bx2);

  const interH = Math.max(0, interY2 - interY1);
  const interW = Math.max(0, interX2 - interX1);
  const interArea = interH * interW;
  if (interArea <= 0) return 0;

  const areaA = Math.max(0, ay2 - ay1) * Math.max(0, ax2 - ax1);
  const areaB = Math.max(0, by2 - by1) * Math.max(0, bx2 - bx1);
  const union = areaA + areaB - interArea;
  return union > 0 ? interArea / union : 0;
}

/**
 * Merges detections across tiles:
 * 1. Drops clipped boxes whose center is within 6% of an edge that has a neighbouring tile.
 * 2. Groups items whose normalized names have Levenshtein ratio >= 0.85 AND IoU >= 0.3,
 *    keeping the one most central in its tile.
 * 3. Runs NMS at IoU 0.5.
 */
export function mergeTileItems(
  detections: TileItemDetection[],
  imageW: number,
  imageH: number
): PerceivedItem[] {
  interface EnrichedCandidate {
    item: PerceivedItem;
    globalBox: [number, number, number, number];
    normName: string;
    distFromTileCenter: number;
    clipped: boolean;
  }

  const candidates: EnrichedCandidate[] = [];

  for (const det of detections) {
    const { item, tile } = det;
    if (!item.box_2d || item.box_2d.length !== 4) continue;

    const [ly1, lx1, ly2, lx2] = item.box_2d;
    const localCy = (ly1 + ly2) / 2;
    const localCx = (lx1 + lx2) / 2;
    const isClipped = Boolean(item.clipped);

    // 1. Drop clipped boxes whose center is within 6% (60 in 0-1000) of an edge with a neighbouring tile
    if (isClipped) {
      if (tile.hasTop && localCy <= 60) continue;
      if (tile.hasBottom && localCy >= 940) continue;
      if (tile.hasLeft && localCx <= 60) continue;
      if (tile.hasRight && localCx >= 940) continue;
    }

    const globalBox = mapTileBoxToGlobal(item.box_2d, tile, imageW, imageH);
    const distFromTileCenter = Math.hypot(localCx - 500, localCy - 500);

    const cleanItem: PerceivedItem = { ...item, box_2d: globalBox };
    delete (cleanItem as TiledPerceivedItem).clipped;

    candidates.push({
      item: cleanItem,
      globalBox,
      normName: norm(item.name_vi || ''),
      distFromTileCenter,
      clipped: isClipped,
    });
  }

  if (candidates.length === 0) return [];

  // 2. Group items whose normalized names have Levenshtein ratio >= 0.85 AND IoU >= 0.3,
  //    and keep the one most central in its tile.
  const n = candidates.length;
  const visited = new Array<boolean>(n).fill(false);
  const groupedRepresentatives: EnrichedCandidate[] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const group: EnrichedCandidate[] = [];
    const queue: number[] = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const currIdx = queue.shift()!;
      const curr = candidates[currIdx];
      group.push(curr);

      for (let j = 0; j < n; j++) {
        if (visited[j]) continue;
        const other = candidates[j];
        const nameSim = levSim(curr.normName, other.normName);
        if (nameSim >= 0.85 && boxIoU(curr.globalBox, other.globalBox) >= 0.3) {
          visited[j] = true;
          queue.push(j);
        }
      }
    }

    // Pick the one most central in its tile (smallest distance to tile center (500, 500))
    group.sort((a, b) => {
      if (Math.abs(a.distFromTileCenter - b.distFromTileCenter) > 1e-6) {
        return a.distFromTileCenter - b.distFromTileCenter;
      }
      if (a.clipped !== b.clipped) return a.clipped ? 1 : -1;
      return (b.item.confidence ?? 0) - (a.item.confidence ?? 0);
    });

    const winner = { ...group[0], item: { ...group[0].item } };
    // If the most central detection missed the price, inherit price from a group peer that read it
    if (winner.item.price_vnd === null || winner.item.price_vnd === undefined) {
      const peerWithPrice = group.find(
        (g) => g.item.price_vnd !== null && g.item.price_vnd !== undefined
      );
      if (peerWithPrice) {
        winner.item.price_vnd = peerWithPrice.item.price_vnd;
        winner.item.raw_price_text =
          winner.item.raw_price_text || peerWithPrice.item.raw_price_text;
      }
    }

    groupedRepresentatives.push(winner);
  }

  // 3. Run NMS at IoU 0.5 (prefer most central in its tile, then higher confidence)
  groupedRepresentatives.sort((a, b) => {
    if (a.clipped !== b.clipped) return a.clipped ? 1 : -1;
    if (Math.abs(a.distFromTileCenter - b.distFromTileCenter) > 1e-6) {
      return a.distFromTileCenter - b.distFromTileCenter;
    }
    return (b.item.confidence ?? 0) - (a.item.confidence ?? 0);
  });

  const kept: EnrichedCandidate[] = [];
  for (const cand of groupedRepresentatives) {
    const suppressed = kept.some((k) => boxIoU(cand.globalBox, k.globalBox) >= 0.5);
    if (!suppressed) {
      kept.push(cand);
    }
  }

  // Sort in reading order (top-to-bottom, then left-to-right)
  kept.sort((a, b) => a.globalBox[0] - b.globalBox[0] || a.globalBox[1] - b.globalBox[1]);

  return kept.map((k) => k.item);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

async function generateTileItems(
  ai: GoogleGenAI,
  tileBase64: string,
  catalogLines: string
): Promise<TiledPerceivedItem[]> {
  const prompt = `You read photos of menus, price boards and market stalls in Hanoi, Vietnam.
1. image_type: "menu", "price_board", "stall", or "not_relevant".
2. venue_type: "street", "eatery", "cafe", or "tourist".
3. items: every food, drink, fruit or produce line that has a price in this tile.
   - name_vi exactly as written (keep Vietnamese accents), name_en a short English name.
   - price_vnd as a full integer (10k -> 10000). null if no price is visible.
   - raw_price_text = the price exactly as printed (e.g. '120k', '120.000đ').
   - unit as written (bát, cốc, đĩa, suất, chiếc, phần, kg, lạng...), default "phần".
   - box_2d [ymin, xmin, ymax, xmax] 0-1000 tight around ONLY this single row's item name and price within this tile. Never merge two rows.
   - clipped: true ONLY if the text of this row is physically cut off at the very border of this tile image; false otherwise.
   - is_addon: true for toppings / sides under "Ăn kèm", "Topping", "Thêm".
   - catalog_id: matching id from the catalog below, or "" if nothing fits.
   - match: "exact", "similar", or "none".
   - alternatives: 2-3 catalog ids if generic, otherwise [].
   - confidence: 0-1.

Catalog:
${catalogLines}`;

  const request = {
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: tileBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          image_type: {
            type: Type.STRING,
            enum: ['menu', 'price_board', 'stall', 'not_relevant'],
          },
          venue_type: {
            type: Type.STRING,
            enum: ['street', 'eatery', 'cafe', 'tourist'],
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name_vi: { type: Type.STRING },
                name_en: { type: Type.STRING },
                category: {
                  type: Type.STRING,
                  enum: ['street_food', 'drink', 'fruit', 'vegetable', 'other'],
                },
                price_vnd: { type: Type.NUMBER, nullable: true },
                raw_price_text: { type: Type.STRING },
                unit: { type: Type.STRING },
                box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                clipped: { type: Type.BOOLEAN },
                is_addon: { type: Type.BOOLEAN },
                catalog_id: { type: Type.STRING },
                match: { type: Type.STRING, enum: ['exact', 'similar', 'none'] },
                alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                confidence: { type: Type.NUMBER },
              },
              required: [
                'name_vi',
                'name_en',
                'category',
                'unit',
                'box_2d',
                'clipped',
                'is_addon',
                'catalog_id',
                'match',
                'alternatives',
                'confidence',
              ],
              propertyOrdering: [
                'name_vi',
                'name_en',
                'category',
                'price_vnd',
                'raw_price_text',
                'unit',
                'box_2d',
                'clipped',
                'is_addon',
                'catalog_id',
                'match',
                'alternatives',
                'confidence',
              ],
            },
          },
        },
        required: ['image_type', 'venue_type', 'items'],
      },
    },
  };

  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({ ...request, model }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${model} tile timed out`)), GEMINI_TIMEOUT_MS)
        ),
      ]);
      const parsed = JSON.parse(response.text?.trim() || '{}') as { items?: TiledPerceivedItem[] };
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch (error) {
      const errMsg = String(error);
      if (/thinking|MINIMAL/i.test(errMsg)) {
        try {
          const retryRes = await Promise.race([
            ai.models.generateContent({
              ...request,
              model,
              config: {
                ...request.config,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`${model} tile timed out`)), GEMINI_TIMEOUT_MS)
            ),
          ]);
          const parsed = JSON.parse(retryRes.text?.trim() || '{}') as {
            items?: TiledPerceivedItem[];
          };
          return Array.isArray(parsed.items) ? parsed.items : [];
        } catch {
          continue;
        }
      }
    }
  }

  return [];
}

/**
 * Crops the image into tiles with sharp, reads up to 4 tiles in flight with GEMINI_MODEL,
 * maps tile boxes to global 0-1000 coordinates, and merges/NMSes them.
 */
export async function readMenuTiles(
  ai: GoogleGenAI,
  imageBuffer: Buffer,
  imageW: number,
  imageH: number,
  catalogLines: string
): Promise<{ items: PerceivedItem[]; traceStep: TraceStep }> {
  const t0 = performance.now();
  const tiles = planTiles(imageW, imageH);

  const detectionsPerTile = await runWithConcurrency(
    tiles,
    MAX_CONCURRENT_TILES,
    async (tile): Promise<TileItemDetection[]> => {
      const cropBuf = await sharp(imageBuffer)
        .extract({ left: tile.x, top: tile.y, width: tile.w, height: tile.h })
        .jpeg({ quality: 88 })
        .toBuffer();
      const tileBase64 = cropBuf.toString('base64');
      const items = await generateTileItems(ai, tileBase64, catalogLines);
      return items.map((item) => ({ item, tile }));
    }
  );

  const allDetections = detectionsPerTile.flat();
  const merged = mergeTileItems(allDetections, imageW, imageH);
  const ms = Math.round(performance.now() - t0);

  return {
    items: merged,
    traceStep: {
      id: 'tiles',
      title_en: 'Reading dense menu tiles',
      title_vi: 'Đọc chi tiết từng phần thực đơn',
      detail: `${tiles.length} tiles · ${merged.length} items after merge · ${(ms / 1000).toFixed(1)}s`,
      model: GEMINI_MODEL,
      ms,
      status: 'done',
    },
  };
}
