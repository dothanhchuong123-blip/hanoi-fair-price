import sharp from 'sharp';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, GEMINI_STRONG_MODEL } from '../config';
import { PerceivedItem, TraceStep } from '../agent/types';
import { OcrWord } from './ocr';
import { levSim, norm, priceKey } from './fuse';
import { boxIoU, mapTileBoxToGlobal } from './tiles';

const MAX_FLAGGED_PER_PHOTO = 6;
const MAX_PARALLEL_CROPS = 3;
const SECOND_PASS_BUDGET_MS = 12000;
const STRONG_MODEL_ATTEMPT_MS = 3200;
const MIN_SHORT_SIDE_PX = 768;

/**
 * Checks whether an item's line has any OCR words containing digits.
 */
function lineHasDigitsInOcr(item: PerceivedItem, words: OcrWord[]): boolean {
  if (!item.box_2d || item.box_2d.length !== 4 || words.length === 0) return false;
  const [ymin, , ymax] = item.box_2d;

  for (const w of words) {
    if (!/\d/.test(w.text)) continue;
    const [wy1, , wy2] = w.box;
    const wyc = (wy1 + wy2) / 2;
    if (wyc >= ymin - 15 && wyc <= ymax + 15) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the indices of items that should be re-checked in the second pass.
 * Flagged when ANY of these holds:
 * - confidence < 0.7
 * - price_vnd is null but the line has digits in OCR
 * - box_source === 'gemini' and box height < 1.2% of image height (< 12 in 0-1000)
 * - two items overlap with IoU > 0.5 but have different names
 */
export function findFlaggedItemIndices(items: PerceivedItem[], words: OcrWord[]): number[] {
  const overlappingDiffNames = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a.box_2d || a.box_2d.length !== 4) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (!b.box_2d || b.box_2d.length !== 4) continue;
      if (boxIoU(a.box_2d, b.box_2d) > 0.5 && norm(a.name_vi) !== norm(b.name_vi)) {
        overlappingDiffNames.add(i);
        overlappingDiffNames.add(j);
      }
    }
  }

  const flagged: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.box_2d || item.box_2d.length !== 4) continue;

    const lowConf = (item.confidence ?? 1) < 0.7;
    const missingPriceWithOcrDigits =
      (item.price_vnd === null || item.price_vnd === undefined) &&
      lineHasDigitsInOcr(item, words);
    const boxHeightNorm = item.box_2d[2] - item.box_2d[0];
    const tinyGeminiBox = item.box_source === 'gemini' && boxHeightNorm < 12;
    const highOverlapDiffName = overlappingDiffNames.has(i);

    if (lowConf || missingPriceWithOcrDigits || tinyGeminiBox || highOverlapDiffName) {
      flagged.push(i);
    }
  }

  return flagged;
}

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}

/**
 * Computes a 15%-padded crop box in pixels and upscale dimensions so the short side is >= 768px.
 */
export function computePaddedUpscaledCrop(
  box: [number, number, number, number],
  imageW: number,
  imageH: number
): CropRegion {
  const [ymin, xmin, ymax, xmax] = box;
  const pxYmin = (ymin / 1000) * imageH;
  const pxXmin = (xmin / 1000) * imageW;
  const pxYmax = (ymax / 1000) * imageH;
  const pxXmax = (xmax / 1000) * imageW;

  const boxW = Math.max(4, pxXmax - pxXmin);
  const boxH = Math.max(4, pxYmax - pxYmin);
  const padX = boxW * 0.15;
  const padY = Math.max(boxH * 0.15, boxW * 0.12);

  const left = Math.max(0, Math.floor(pxXmin - padX));
  const top = Math.max(0, Math.floor(pxYmin - padY));
  const right = Math.min(imageW, Math.ceil(pxXmax + padX));
  const bottom = Math.min(imageH, Math.ceil(pxYmax + padY));

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const shortSide = Math.min(width, height);
  const scale = shortSide < MIN_SHORT_SIDE_PX ? MIN_SHORT_SIDE_PX / shortSide : 1;

  const targetWidth = Math.max(MIN_SHORT_SIDE_PX, Math.round(width * scale));
  const targetHeight = Math.max(MIN_SHORT_SIDE_PX, Math.round(height * scale));

  return { left, top, width, height, targetWidth, targetHeight };
}

interface SecondPassCropResult {
  name_vi?: string;
  raw_price_text?: string;
  price_vnd?: number | null;
  box_2d?: number[];
}

export function shouldReplaceWithSecondPass(
  oldItem: PerceivedItem,
  newNameVi: string
): boolean {
  const trimmed = (newNameVi || '').trim();
  if (!trimmed) return false;
  if (oldItem.price_vnd === null || oldItem.price_vnd === undefined) {
    return true;
  }
  const sim = levSim(norm(trimmed), norm(oldItem.name_vi || ''));
  return sim >= 0.6;
}

async function queryCropWithFallback(
  ai: GoogleGenAI,
  cropBase64: string,
  prompt: string,
  deadline: number,
  state: { strongSlow: boolean }
): Promise<SecondPassCropResult | null> {
  const modelsToTry = state.strongSlow
    ? [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]
    : [GEMINI_STRONG_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL];

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const remaining = deadline - Date.now();
    if (remaining <= 80) return null;

    const isStrong = model === GEMINI_STRONG_MODEL;
    const perCallTimeout = isStrong
      ? Math.min(STRONG_MODEL_ATTEMPT_MS, remaining)
      : Math.min(4000, remaining);

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cropBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name_vi: { type: Type.STRING },
                raw_price_text: { type: Type.STRING },
                price_vnd: { type: Type.NUMBER, nullable: true },
                box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['name_vi', 'raw_price_text', 'price_vnd', 'box_2d'],
              propertyOrdering: ['name_vi', 'raw_price_text', 'price_vnd', 'box_2d'],
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${model} crop timeout`)), perCallTimeout)
        ),
      ]);

      return JSON.parse(response.text?.trim() || '{}') as SecondPassCropResult;
    } catch {
      if (isStrong) {
        state.strongSlow = true;
      }
      continue;
    }
  }

  return null;
}

/**
 * Re-checks up to 6 flagged items using GEMINI_STRONG_MODEL on a 15%-padded, upscaled crop (short side >= 768px).
 * Runs up to 3 crops in parallel within a 12s total budget.
 */
export async function runSecondPass(
  ai: GoogleGenAI,
  imageBuffer: Buffer,
  imageW: number,
  imageH: number,
  items: PerceivedItem[],
  words: OcrWord[]
): Promise<{ items: PerceivedItem[]; traceStep: TraceStep }> {
  const allFlagged = findFlaggedItemIndices(items, words);
  const toCheck = allFlagged.slice(0, MAX_FLAGGED_PER_PHOTO);

  if (toCheck.length === 0) {
    return {
      items,
      traceStep: {
        id: 'second_pass',
        title_en: 'Second look at unsure items',
        title_vi: 'Kiểm tra lại các dòng chưa rõ',
        detail: `0 unsure · ${GEMINI_STRONG_MODEL} · 0.0s`,
        model: GEMINI_STRONG_MODEL,
        ms: 0,
        status: 'skipped',
      },
    };
  }

  const t0 = performance.now();
  const deadline = Date.now() + SECOND_PASS_BUDGET_MS;
  const updated = items.map((item) => ({ ...item }));
  let fixedCount = 0;
  const state = { strongSlow: false };

  let nextQueueIdx = 0;
  const prompt =
    'Read the single menu row in this crop. Return name_vi exactly as printed, raw_price_text, price_vnd, and a tight box_2d 0–1000 within this crop.';

  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_CROPS, toCheck.length) },
    async () => {
      while (true) {
        const qIdx = nextQueueIdx++;
        if (qIdx >= toCheck.length) break;

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 100) break;

        const itemIdx = toCheck[qIdx];
        const oldItem = updated[itemIdx];
        if (!oldItem?.box_2d || oldItem.box_2d.length !== 4) continue;

        try {
          const region = computePaddedUpscaledCrop(oldItem.box_2d, imageW, imageH);
          const cropBuf = await sharp(imageBuffer)
            .extract({
              left: region.left,
              top: region.top,
              width: region.width,
              height: region.height,
            })
            .resize(region.targetWidth, region.targetHeight, { fit: 'fill' })
            .jpeg({ quality: 88 })
            .toBuffer();

          const parsed = await queryCropWithFallback(
            ai,
            cropBuf.toString('base64'),
            prompt,
            deadline,
            state
          );
          if (!parsed) continue;

          const newName = (parsed.name_vi || '').trim();
          if (!shouldReplaceWithSecondPass(oldItem, newName)) {
            continue;
          }

          let mappedBox = oldItem.box_2d;
          if (Array.isArray(parsed.box_2d) && parsed.box_2d.length === 4) {
            const [cy1, cx1, cy2, cx2] = parsed.box_2d;
            if (cy2 > cy1 && cx2 > cx1) {
              mappedBox = mapTileBoxToGlobal(
                [cy1, cx1, cy2, cx2],
                { x: region.left, y: region.top, w: region.width, h: region.height },
                imageW,
                imageH
              );
            }
          }

          const rawPrice = parsed.raw_price_text?.trim() || oldItem.raw_price_text;
          let resolvedPrice =
            parsed.price_vnd !== undefined && parsed.price_vnd !== null
              ? parsed.price_vnd
              : rawPrice
              ? priceKey(rawPrice)
              : null;
          if (resolvedPrice !== null && resolvedPrice > 0 && resolvedPrice < 1000) {
            resolvedPrice = Math.round(resolvedPrice * 1000);
          }

          updated[itemIdx] = {
            ...oldItem,
            name_vi: newName,
            raw_price_text: rawPrice,
            price_vnd: resolvedPrice ?? oldItem.price_vnd,
            box_2d: mappedBox,
            confidence: Math.max(oldItem.confidence ?? 0, 0.85),
            rechecked: true,
          };
          fixedCount++;
        } catch (err) {
          console.warn(
            `[second_pass] item #${itemIdx} ("${oldItem.name_vi}") skipped on error/timeout:`,
            String(err).slice(0, 120)
          );
        }
      }
    }
  );

  await Promise.all(workers);
  const ms = Math.round(performance.now() - t0);

  return {
    items: updated,
    traceStep: {
      id: 'second_pass',
      title_en: 'Second look at unsure items',
      title_vi: 'Kiểm tra lại các dòng chưa rõ',
      detail: `${toCheck.length} unsure → ${fixedCount} fixed · ${GEMINI_STRONG_MODEL} · ${(ms / 1000).toFixed(1)}s`,
      model: GEMINI_STRONG_MODEL,
      ms,
      status: 'done',
    },
  };
}
