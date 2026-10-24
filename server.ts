import 'dotenv/config';
import express from 'express';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { GoogleGenAI, MediaResolution, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, GEMINI_TIMEOUT_MS } from './src/config';
import catalog from './src/data/reference_prices.json';
import { PerceivedItem, TraceStep } from './src/agent/types';
import { OcrWord, visionWords } from './src/server/ocr';
import { snapItems } from './src/server/fuse';
import { readMenuTiles, shouldTile } from './src/server/tiles';
import { runSecondPass } from './src/server/secondPass';
import { handleMapsContext, handleMapsNearby } from './src/server/maps';

// Compact catalog for the prompt, so Gemini matches items while it reads them (one call, no extra round trip)
const CATALOG_LINES = (catalog as { id: string; name_vi: string; name_en: string; unit: string }[])
  .map((r) => `${r.id}: ${r.name_vi} (${r.name_en}) /${r.unit}`)
  .join('\n');

const responseModelMap = new WeakMap<object, string>();

/** Runs a Gemini call on the main model, retrying once on the fallback when it's overloaded or slow. */
async function generateWithFallback(ai: GoogleGenAI, request: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>) {
  let lastError: unknown;
  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    const started = Date.now();
    try {
      const response = await Promise.race([
        ai.models.generateContent({ ...request, model }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${model} timed out after ${GEMINI_TIMEOUT_MS}ms`)), GEMINI_TIMEOUT_MS)
        ),
      ]);
      console.log(`[gemini] ${model} ok in ${Date.now() - started}ms`);
      responseModelMap.set(response, model);
      return response;
    } catch (error) {
      // If a model does not accept ThinkingLevel.MINIMAL, retry immediately with ThinkingLevel.LOW
      const errMsg = String(error);
      if (
        request.config?.thinkingConfig?.thinkingLevel === ThinkingLevel.MINIMAL &&
        /thinking|MINIMAL/i.test(errMsg)
      ) {
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
              setTimeout(() => reject(new Error(`${model} timed out after ${GEMINI_TIMEOUT_MS}ms`)), GEMINI_TIMEOUT_MS)
            ),
          ]);
          console.log(`[gemini] ${model} (LOW) ok in ${Date.now() - started}ms`);
          responseModelMap.set(retryRes, model);
          return retryRes;
        } catch (retryError) {
          lastError = retryError;
          console.warn(`[gemini] ${model} failed after ${Date.now() - started}ms:`, String(retryError).slice(0, 160));
          continue;
        }
      }
      lastError = error;
      console.warn(`[gemini] ${model} failed after ${Date.now() - started}ms:`, errMsg.slice(0, 160));
    }
  }
  throw lastError;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  let loggedStallMaskSample = false;

  // POST /api/gemini/perceive -> Reads menu/stall photo with structured JSON output + Cloud Vision OCR fusion
  app.post('/api/gemini/perceive', async (req, res) => {
    try {
      const { imageBase64, mimeType, imageSize, mode } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        imageSize?: { w: number; h: number };
        mode?: 'menu' | 'stall';
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const ai = getAiClient();
      const requestedStall = mode === 'stall';

      const stallPromptRules = requestedStall
        ? `   - Return ONE item per produce pile or basket.
   - box_2d [ymin, xmin, ymax, xmax] 0-1000 goes around the WHOLE produce pile or basket, and the price comes from its sign (e.g. "80k/kg").
   - mask: a polygon of [x, y] integer points (0-1000) tracing the produce pile outline (6-12 points around the pile).`
        : `   - box_2d [ymin, xmin, ymax, xmax] 0-1000 around the item's text AND its price.
   - One box per menu row. The box is tight around that row's item name AND its price only. Never merge two rows. Never include headings or decorations.`;

      const prompt = `You read photos of menus, price boards and market stalls in Hanoi, Vietnam.

1. image_type: "menu", "price_board", "stall", or "not_relevant" (no food/drink/produce prices at all).${requestedStall ? ' This photo was taken in Stall mode.' : ''}
2. venue_type, from visual cues:
   "street" = handwritten sign, plastic stools, cart or basket;
   "eatery" = simple printed menu of a local quán;
   "cafe" = café / milk-tea / snack shop menu, sit-down place;
   "tourist" = ONLY when the menu is mainly in English (or shows USD), aimed at foreign visitors.
   A nicely designed menu in Vietnamese is still "eatery" (food) or "cafe" (drinks/snacks), not "tourist".
3. items: every food, drink, fruit or produce pile/line that has a price (or visible produce pile at a stall).
   - name_vi: Vietnamese name (keep accents, e.g. "Xoài", "Cam", "Thanh long"), name_en a short English name.
   - price_vnd as a full integer (10k -> 10000, 80k/kg -> 80000). If a line shows several sizes ("50k-70k-90k"), use the smallest and put the original in raw_price_text. null if no price is visible.
   - raw_price_text = the price sign text exactly as printed (e.g. '80k/kg', '120k', '120.000đ').
   - unit as written (kg, lạng, quả, nải, mớ, bát, cốc, đĩa, suất, chiếc, phần...), default "${requestedStall ? 'kg' : 'phần'}".
${stallPromptRules}
   - is_addon true for toppings / sides listed under headings like "Ăn kèm", "Topping", "Thêm" (e.g. "Nấm 5k" = extra mushrooms).
   - catalog_id: the id from the catalog below ONLY if it is the same dish or product (same base dish, any style). Use "" if nothing fits. Never pick a dish just because a word looks similar ("Nấm" mushroom is NOT "Nam Bộ"). A snack made from a fruit ("xoài lắc", "sinh tố xoài") is not the raw fruit. A different dish that shares a word is not a match either ("bánh mì chảo" is not "bánh mì").
   - match: "exact" (same item), "similar" (same dish, different variant or size), or "none".
   - alternatives: only for raw products or dishes whose name is too generic, if it could honestly mean 2-3 catalog items with different prices (e.g. plain "Xoài" = xoai_cat or xoai_dai_loan), list their ids; otherwise [].
   - confidence 0-1 for how clearly you could read the item and price.

Catalog:
${CATALOG_LINES}`;

      const hasVisionKey = Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim());

      const runOcr = async (): Promise<{ words: OcrWord[]; traceStep: TraceStep }> => {
        if (!hasVisionKey) {
          return {
            words: [],
            traceStep: {
              id: 'ocr',
              title_en: requestedStall ? 'Reading the stall' : 'Reading the menu',
              title_vi: requestedStall ? 'Đọc bảng giá quầy hàng' : 'Đọc thực đơn',
              detail: 'Cloud Vision · skipped (no key)',
              model: 'DOCUMENT_TEXT_DETECTION',
              ms: 0,
              status: 'skipped',
            },
          };
        }
        const t0 = performance.now();
        try {
          const words = await visionWords(cleanBase64);
          const ms = Math.round(performance.now() - t0);
          return {
            words,
            traceStep: {
              id: 'ocr',
              title_en: requestedStall ? 'Reading the stall' : 'Reading the menu',
              title_vi: requestedStall ? 'Đọc bảng giá quầy hàng' : 'Đọc thực đơn',
              detail: `Cloud Vision · ${words.length} words · ${(ms / 1000).toFixed(1)}s`,
              model: 'DOCUMENT_TEXT_DETECTION',
              ms,
              status: 'done',
            },
          };
        } catch (err) {
          const ms = Math.round(performance.now() - t0);
          console.warn(`[ocr] Cloud Vision failed after ${ms}ms:`, String(err).slice(0, 160));
          return {
            words: [],
            traceStep: {
              id: 'ocr',
              title_en: requestedStall ? 'Reading the stall' : 'Reading the menu',
              title_vi: requestedStall ? 'Đọc bảng giá quầy hàng' : 'Đọc thực đơn',
              detail: `Cloud Vision · failed (${(ms / 1000).toFixed(1)}s)`,
              model: 'DOCUMENT_TEXT_DETECTION',
              ms,
              status: 'failed',
            },
          };
        }
      };

      const itemProperties: Record<string, any> = {
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
        ...(requestedStall
          ? {
              mask: {
                type: Type.ARRAY,
                items: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
            }
          : {}),
        is_addon: { type: Type.BOOLEAN },
        catalog_id: { type: Type.STRING },
        match: { type: Type.STRING, enum: ['exact', 'similar', 'none'] },
        alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
        confidence: { type: Type.NUMBER },
      };

      const itemPropertyOrdering = [
        'name_vi',
        'name_en',
        'category',
        'price_vnd',
        'raw_price_text',
        'unit',
        'box_2d',
        ...(requestedStall ? ['mask'] : []),
        'is_addon',
        'catalog_id',
        'match',
        'alternatives',
        'confidence',
      ];

      const runGemini = async () => {
        const t0 = performance.now();
        const response = await generateWithFallback(ai, {
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: cleanBase64,
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
                    properties: itemProperties,
                    required: [
                      'name_vi',
                      'name_en',
                      'category',
                      'unit',
                      'box_2d',
                      'is_addon',
                      'catalog_id',
                      'match',
                      'alternatives',
                      'confidence',
                    ],
                    propertyOrdering: itemPropertyOrdering,
                  },
                },
              },
              required: ['image_type', 'venue_type', 'items'],
            },
          },
        });
        const ms = Math.round(performance.now() - t0);
        const usedModel = responseModelMap.get(response) || GEMINI_MODEL;
        return { response, ms, usedModel };
      };

      const imageBuffer = Buffer.from(cleanBase64, 'base64');
      const [ocrSettled, geminiSettled, metaSettled] = await Promise.allSettled([
        runOcr(),
        runGemini(),
        sharp(imageBuffer).metadata(),
      ]);

      if (geminiSettled.status === 'rejected') {
        throw geminiSettled.reason;
      }

      const meta = metaSettled.status === 'fulfilled' ? metaSettled.value : undefined;
      const imgW = meta?.width || imageSize?.w || 1200;
      const imgH = meta?.height || imageSize?.h || 1600;
      const resolvedImageSize = { w: imgW, h: imgH };

      const { words, traceStep: ocrTrace } =
        ocrSettled.status === 'fulfilled'
          ? ocrSettled.value
          : {
              words: [] as OcrWord[],
              traceStep: {
                id: 'ocr' as const,
                title_en: requestedStall ? 'Reading the stall' : 'Reading the menu',
                title_vi: requestedStall ? 'Đọc bảng giá quầy hàng' : 'Đọc thực đơn',
                detail: 'Cloud Vision · failed',
                model: 'DOCUMENT_TEXT_DETECTION',
                ms: 0,
                status: 'failed' as const,
              },
            };

      const { response: geminiResponse, ms: geminiMs, usedModel } = geminiSettled.value;
      const rawText = geminiResponse.text?.trim() || '{}';
      const parsed = JSON.parse(rawText) as {
        image_type: string;
        venue_type?: string;
        items?: PerceivedItem[];
      };

      const isStall = requestedStall || parsed.image_type === 'stall';
      if (isStall && !loggedStallMaskSample && Array.isArray(parsed.items) && parsed.items.length > 0) {
        loggedStallMaskSample = true;
        console.log(
          '[stall-mask-sample] First real stall response items:',
          JSON.stringify(
            parsed.items.map((it) => ({
              name_vi: it.name_vi,
              price_vnd: it.price_vnd,
              box_2d: it.box_2d,
              mask: Array.isArray(it.mask) ? `${it.mask.length} pts` : Boolean(it.mask),
            }))
          )
        );
      }

      const rawItems: PerceivedItem[] = Array.isArray(parsed.items) ? parsed.items : [];
      const priceCount = rawItems.filter(
        (i) => i.price_vnd !== null && i.price_vnd !== undefined
      ).length;

      const readTrace: TraceStep = {
        id: 'read',
        title_en: 'Understanding items',
        title_vi: 'Nhận diện món và giá',
        detail: `Gemini · ${rawItems.length} ${rawItems.length === 1 ? 'item' : 'items'}, ${priceCount} ${priceCount === 1 ? 'price' : 'prices'}`,
        model: usedModel,
        ms: geminiMs,
        status: 'done',
      };

      // Part 4 Step 1 & 2: Tiling when needed (Stall photos skip Part 4 tiling)
      let itemsBeforeFuse: PerceivedItem[] = rawItems;
      let tilesTrace: TraceStep = {
        id: 'tiles',
        title_en: 'Reading dense menu tiles',
        title_vi: 'Đọc chi tiết từng phần thực đơn',
        detail: isStall ? 'skipped (stall mode)' : 'not needed',
        ms: 0,
        status: 'skipped',
      };

      if (
        !isStall &&
        parsed.image_type !== 'not_relevant' &&
        shouldTile(rawItems, words, imgW, imgH)
      ) {
        try {
          const tiledResult = await readMenuTiles(ai, imageBuffer, imgW, imgH, CATALOG_LINES);
          tilesTrace = tiledResult.traceStep;
          if (tiledResult.items.length > 0) {
            itemsBeforeFuse = tiledResult.items;
          }
        } catch (tileErr) {
          console.warn('[tiles] Tiling failed, falling back to single-pass items:', String(tileErr).slice(0, 160));
          tilesTrace = {
            id: 'tiles',
            title_en: 'Reading dense menu tiles',
            title_vi: 'Đọc chi tiết từng phần thực đơn',
            detail: 'failed',
            ms: 0,
            status: 'failed',
          };
        }
      }

      // Part 3: OCR fusion on the merged list (for stall photos, keep Gemini's whole-pile box_2d)
      const fuseStart = performance.now();
      const fusedItems = isStall
        ? itemsBeforeFuse.map((it) => ({ ...it, box_source: it.box_source ?? ('gemini' as const) }))
        : snapItems(itemsBeforeFuse, words);
      const fuseMs = Math.round(performance.now() - fuseStart);
      const snappedCount = fusedItems.filter(
        (i) => i.box_source === 'ocr' || i.box_source === 'ocr_partial'
      ).length;

      const fuseTrace: TraceStep = {
        id: 'fuse',
        title_en: 'Snapping boxes',
        title_vi: 'Căn chỉnh khung chữ',
        detail: isStall
          ? `${fusedItems.length} of ${fusedItems.length} pile boxes kept`
          : `${snappedCount} of ${fusedItems.length} rows snapped to OCR`,
        ms: fuseMs,
        status: isStall ? 'skipped' : ocrTrace.status === 'done' ? 'done' : 'skipped',
      };

      // Part 4 Step 3: Second pass on unsure items (skip for stall photos so pile box_2d is preserved)
      const secondPassResult =
        !isStall && parsed.image_type !== 'not_relevant' && fusedItems.length > 0
          ? await runSecondPass(ai, imageBuffer, imgW, imgH, fusedItems, words)
          : {
              items: fusedItems,
              traceStep: {
                id: 'second_pass' as const,
                title_en: 'Second look at unsure items',
                title_vi: 'Kiểm tra lại các dòng chưa rõ',
                detail: isStall ? 'skipped (stall mode)' : 'not needed',
                ms: 0,
                status: 'skipped' as const,
              },
            };

      const finalItems = secondPassResult.items;
      const secondPassTrace = secondPassResult.traceStep;

      console.log(
        `[perceive] mode=${mode || 'auto'} ocr=${ocrTrace.ms}ms (${ocrTrace.status}, ${words.length} words) gemini=${readTrace.ms}ms (${usedModel}, ${rawItems.length} items) tiles=${tilesTrace.ms}ms (${tilesTrace.detail}) fuse=${fuseTrace.ms}ms (${fuseTrace.detail}) second_pass=${secondPassTrace.ms}ms (${secondPassTrace.detail})`
      );

      res.json({
        ...parsed,
        image_type: isStall && parsed.image_type !== 'not_relevant' ? 'stall' : parsed.image_type,
        items: finalItems,
        trace: [ocrTrace, readTrace, tilesTrace, fuseTrace, secondPassTrace],
        image_size: resolvedImageSize,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gemini perception failed';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/gemini/respond -> Generates neutral explanation + polite Vietnamese phrase
  app.post('/api/gemini/respond', async (req, res) => {
    try {
      const { item, reference, judgment } = req.body;
      const ai = getAiClient();

      const prompt = `You are helping a visitor in Hanoi's Old Quarter check a street price neutrally and politely.
NEVER accuse a seller, and NEVER use words like "scam", "rip-off", or "cheat".
Item: ${JSON.stringify(item)}
Reference range in Hanoi: ${JSON.stringify(reference)}
Deterministic Verdict: ${JSON.stringify(judgment)}

Rules:
1. Write a warm, neutral 1-2 sentence explanation in English (explanation_en) and Vietnamese (explanation_vi) mentioning how the quoted price compares to the typical range and noting that busy tourist streets, sit-down spots, quality, or season can affect prices.
2. Provide a polite Vietnamese phrase (phrase_vi), simple English phonetic hint (pronunciation, separated by middle dots ·), and English meaning (phrase_en):
   - For street_food or drink: prices are usually fixed, so ask the price politely before ordering (e.g. "Bún chả bao nhiêu một suất ạ?").
   - For fruit or vegetable when above typical: polite light bargaining (e.g. "Bớt cho em 20 nghìn được không ạ?").
   - When verdict is fair: a warm thank-you / order phrase (e.g. "Cho em một bát, cảm ơn chị ạ!").`;

      const response = await generateWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation_en: { type: Type.STRING },
              explanation_vi: { type: Type.STRING },
              phrase_header_en: { type: Type.STRING },
              phrase_header_vi: { type: Type.STRING },
              phrase_vi: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              phrase_en: { type: Type.STRING },
              tip_en: { type: Type.STRING },
              tip_vi: { type: Type.STRING },
            },
            required: [
              'explanation_en',
              'explanation_vi',
              'phrase_header_en',
              'phrase_header_vi',
              'phrase_vi',
              'pronunciation',
              'phrase_en',
              'tip_en',
              'tip_vi',
            ],
          },
        },
      });

      const rawText = response.text?.trim() || '{}';
      res.json(JSON.parse(rawText));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gemini respond failed';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/maps/context -> Grounded neighbourhood context (tourist_core | mixed | local) + sources
  app.post('/api/maps/context', async (req, res) => {
    try {
      const { lat, lng, session_id } = req.body as {
        lat?: number;
        lng?: number;
        session_id?: string;
      };
      if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
        res.status(400).json({ error: 'lat and lng are required numbers' });
        return;
      }
      const ai = getAiClient();
      const result = await handleMapsContext(ai, {
        lat,
        lng,
        sessionId: session_id || 'default',
      });
      res.json(result);
    } catch (error: unknown) {
      console.warn('[maps/context] Unexpected error:', error);
      res.json({ unavailable: true });
    }
  });

  // POST /api/maps/nearby -> Grounded nearby places serving the dish, rate-limited to 1 call per item per session
  app.post('/api/maps/nearby', async (req, res) => {
    try {
      const { dish_vi, dish_en, dish, item_id, lat, lng, session_id } = req.body as {
        dish_vi?: string;
        dish_en?: string;
        dish?: string;
        item_id?: string;
        lat?: number;
        lng?: number;
        session_id?: string;
      };
      const resolvedDishVi = (dish_vi || dish || '').trim();
      if (!resolvedDishVi) {
        res.status(400).json({ error: 'dish_vi (or dish) is required' });
        return;
      }
      if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
        res.status(400).json({ error: 'lat and lng are required numbers' });
        return;
      }
      const ai = getAiClient();
      const result = await handleMapsNearby(ai, {
        dishVi: resolvedDishVi,
        dishEn: dish_en,
        itemId: item_id,
        lat,
        lng,
        sessionId: session_id || 'default',
      });
      const mapsJsKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
      res.json({
        ...result,
        ...(mapsJsKey ? { maps_js_api_key: mapsJsKey } : {}),
      });
    } catch (error: unknown) {
      console.warn('[maps/nearby] Unexpected error:', error);
      res.json({ unavailable: true });
    }
  });

  // Ensure every unknown /api/* route returns JSON, never HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Express error middleware so malformed JSON or oversized bodies return JSON errors, never HTML
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(status).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Chợ Price Lens server listening on http://localhost:${port}`);
  });
}

startServer();
