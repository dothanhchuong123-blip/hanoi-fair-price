import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, GEMINI_TIMEOUT_MS } from './src/config';
import catalog from './src/data/reference_prices.json';

// Compact catalog for the prompt, so Gemini matches items while it reads them (one call, no extra round trip)
const CATALOG_LINES = (catalog as { id: string; name_vi: string; name_en: string; unit: string }[])
  .map((r) => `${r.id}: ${r.name_vi} (${r.name_en}) /${r.unit}`)
  .join('\n');

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
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`[gemini] ${model} failed after ${Date.now() - started}ms:`, String(error).slice(0, 160));
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

  // POST /api/gemini/perceive -> Reads menu/stall photo with structured JSON output + box_2d
  app.post('/api/gemini/perceive', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const ai = getAiClient();

      const prompt = `You read photos of menus, price boards and market stalls in Hanoi, Vietnam.

1. image_type: "menu", "price_board", "stall", or "not_relevant" (no food/drink prices at all).
2. venue_type, from visual cues:
   "street" = handwritten sign, plastic stools, cart or basket;
   "eatery" = simple printed menu of a local quán;
   "cafe" = café / milk-tea / snack shop menu, sit-down place;
   "tourist" = ONLY when the menu is mainly in English (or shows USD), aimed at foreign visitors.
   A nicely designed menu in Vietnamese is still "eatery" (food) or "cafe" (drinks/snacks), not "tourist".
3. items: every food, drink, fruit or produce line that has a price.
   - name_vi exactly as written (keep Vietnamese accents), name_en a short English name.
   - price_vnd as a full integer (10k -> 10000). If a line shows several sizes ("50k-70k-90k"), use the smallest and put the original in raw_price_text. null if no price is visible.
   - unit as written (bát, cốc, đĩa, suất, chiếc, phần, kg, lạng, mảnh...), default "phần".
   - box_2d [ymin, xmin, ymax, xmax] 0-1000 around the item's text AND its price.
   - is_addon true for toppings / sides listed under headings like "Ăn kèm", "Topping", "Thêm" (e.g. "Nấm 5k" = extra mushrooms).
   - catalog_id: the id from the catalog below ONLY if it is the same dish or product (same base dish, any style). Use "" if nothing fits. Never pick a dish just because a word looks similar ("Nấm" mushroom is NOT "Nam Bộ"). A snack made from a fruit ("xoài lắc", "sinh tố xoài") is not the raw fruit. A different dish that shares a word is not a match either ("bánh mì chảo" is not "bánh mì").
   - match: "exact" (same item), "similar" (same dish, different variant or size), or "none".
   - alternatives: only for raw products or dishes whose name is too generic, if it could honestly mean 2-3 catalog items with different prices (e.g. plain "Xoài" = xoai_cat or xoai_dai_loan), list their ids; otherwise [].
   - confidence 0-1 for how clearly you could read the name and price.

Catalog:
${CATALOG_LINES}`;

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
      });

      const rawText = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawText);
      res.json(parsed);
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
