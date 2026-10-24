import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, MAPS_TIMEOUT_MS } from '../config';
import { MapsAreaKind, MapsContextResult, MapsNearbyResult, MapsSource, NearbyPlace } from '../agent/types';
import { parsePrice } from '../lib/parsePrice';

export interface MapsGroundedChunk {
  title: string;
  uri: string;
  placeId: string;
  text?: string;
}

export interface GroundedCallResult {
  text: string;
  chunks: MapsGroundedChunk[];
  form: 'generateContent' | 'interactions';
}

// In-memory session caches (never persisted to disk, per Google Maps Platform terms)
const sessionContextCache = new Map<string, MapsContextResult>();
const sessionNearbyCache = new Map<string, MapsNearbyResult>();

export function clearMapsSessionCaches(): void {
  sessionContextCache.clear();
  sessionNearbyCache.clear();
}

/** Strips Vietnamese diacritics and normalizes text for accent-insensitive comparison. */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits `price_hint` on `-` or `–` and runs `parsePrice` on each side.
 * Sets both to null if either side fails to parse.
 */
export function parsePriceHint(priceHint: string | null | undefined): {
  low: number | null;
  high: number | null;
} {
  if (!priceHint || typeof priceHint !== 'string') {
    return { low: null, high: null };
  }
  const parts = priceHint.split(/[-–]/);
  if (parts.length !== 2) {
    return { low: null, high: null };
  }
  const left = parsePrice(parts[0].trim());
  const right = parsePrice(parts[1].trim());
  if (left.price_vnd === null || right.price_vnd === null) {
    return { low: null, high: null };
  }
  const low = Math.min(left.price_vnd, right.price_vnd);
  const high = Math.max(left.price_vnd, right.price_vnd);
  return { low, high };
}

/** Joins an extracted place name to a grounding chunk by accent-insensitive name. */
export function matchPlaceToChunk(
  placeName: string,
  chunks: MapsGroundedChunk[],
  usedUris?: Set<string>
): MapsGroundedChunk | null {
  const normTarget = normalizeForMatch(placeName);
  if (!normTarget) return null;

  // 1. Exact accent-insensitive match
  for (const chunk of chunks) {
    if (usedUris?.has(chunk.uri)) continue;
    const normChunk = normalizeForMatch(chunk.title);
    if (normChunk && normChunk === normTarget) {
      return chunk;
    }
  }

  // 2. Substring match (either direction, minimum 3 chars)
  for (const chunk of chunks) {
    if (usedUris?.has(chunk.uri)) continue;
    const normChunk = normalizeForMatch(chunk.title);
    if (!normChunk || normChunk.length < 3 || normTarget.length < 3) continue;
    if (normChunk.includes(normTarget) || normTarget.includes(normChunk)) {
      return chunk;
    }
  }

  // 3. Token overlap (all significant tokens of the shorter name appear in the longer name)
  const targetTokens = normTarget.split(' ').filter((t) => t.length > 1);
  if (targetTokens.length >= 2) {
    for (const chunk of chunks) {
      if (usedUris?.has(chunk.uri)) continue;
      const chunkTokens = new Set(normalizeForMatch(chunk.title).split(' ').filter((t) => t.length > 1));
      const matchedCount = targetTokens.filter((t) => chunkTokens.has(t)).length;
      if (matchedCount >= Math.max(2, Math.ceil(targetTokens.length * 0.75))) {
        return chunk;
      }
    }
  }

  return null;
}

/** Extracts `{ title, uri, placeId, text }` from `candidates[0].groundingMetadata.groundingChunks[].maps`. */
export function extractChunksFromGenerateContent(response: any): MapsGroundedChunk[] {
  const rawChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(rawChunks)) return [];

  const result: MapsGroundedChunk[] = [];
  for (const item of rawChunks) {
    const m = item?.maps;
    if (!m || typeof m.uri !== 'string' || !m.uri.trim()) continue;
    const title = typeof m.title === 'string' && m.title.trim() ? m.title.trim() : '';
    if (!title) continue;
    const rawPlaceId = typeof m.placeId === 'string' ? m.placeId.trim() : '';
    const placeId = rawPlaceId.replace(/^places\//, '');
    const text = typeof m.text === 'string' && m.text.trim() ? m.text.trim() : undefined;
    result.push({
      title,
      uri: m.uri.trim(),
      placeId,
      ...(text ? { text } : {}),
    });
  }
  return result;
}

/** Extracts text and `place_citation` annotations from an Interactions API response. */
export function extractChunksFromInteraction(interaction: any): {
  text: string;
  chunks: MapsGroundedChunk[];
} {
  let fullText = '';
  const chunks: MapsGroundedChunk[] = [];
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];

  for (const step of steps) {
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      for (const part of step.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          fullText += part.text;
        }
        const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
        for (const ann of annotations) {
          if (ann?.type === 'place_citation' || ann?.uri || ann?.place_id || ann?.placeId) {
            const title = String(ann.title || ann.name || '').trim();
            const uri = String(ann.uri || ann.url || '').trim();
            const rawPlaceId = String(ann.place_id || ann.placeId || '').trim();
            if (title && uri) {
              chunks.push({
                title,
                uri,
                placeId: rawPlaceId.replace(/^places\//, ''),
                ...(ann.text ? { text: String(ann.text).trim() } : {}),
              });
            }
          }
        }
      }
    }
  }

  if (!fullText && typeof interaction?.output_text === 'string') {
    fullText = interaction.output_text;
  }

  return { text: fullText, chunks };
}

function deduplicateSources(chunks: MapsGroundedChunk[]): MapsSource[] {
  const seen = new Set<string>();
  const sources: MapsSource[] = [];
  for (const c of chunks) {
    if (!c.uri || seen.has(c.uri)) continue;
    seen.add(c.uri);
    sources.push({ title: c.title, uri: c.uri });
  }
  return sources;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Call 1: Runs the grounded Google Maps call without a JSON schema.
 * Tries `ai.models.generateContent` first; if it returns 400 saying the tool is unsupported,
 * falls back to `ai.interactions.create` with `tools: [{ type: 'google_maps', latitude, longitude }]`.
 */
export async function runMapsGroundedCall(
  ai: GoogleGenAI,
  englishPrompt: string,
  lat: number,
  lng: number,
  timeoutMs = MAPS_TIMEOUT_MS
): Promise<GroundedCallResult> {
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: englishPrompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude: lat, longitude: lng },
              languageCode: 'en',
            },
          },
        },
      }),
      timeoutMs,
      'generateContent(googleMaps)'
    );

    const chunks = extractChunksFromGenerateContent(response);
    console.log(
      `[maps] Grounded call succeeded via generateContent (${GEMINI_MODEL}) · groundingChunks=${chunks.length}`
    );
    return {
      text: response.text || '',
      chunks,
      form: 'generateContent',
    };
  } catch (err: unknown) {
    const msg = String(err);
    const is400ToolError =
      /400|INVALID_ARGUMENT|unsupported|googleMaps|tool/i.test(msg) && !/429|RESOURCE_EXHAUSTED/i.test(msg);

    if (!is400ToolError) {
      throw err;
    }

    console.warn(
      `[maps] generateContent returned 400 (${msg.slice(0, 120)}); trying ai.interactions.create form...`
    );

    const interaction = await withTimeout(
      ai.interactions.create({
        model: GEMINI_MODEL,
        input: englishPrompt,
        tools: [{ type: 'google_maps', latitude: lat, longitude: lng } as any],
      }),
      timeoutMs,
      'interactions.create(google_maps)'
    );

    const { text, chunks } = extractChunksFromInteraction(interaction);
    console.log(
      `[maps] Grounded call succeeded via interactions.create (${GEMINI_MODEL}) · groundingChunks=${chunks.length}`
    );
    return {
      text,
      chunks,
      form: 'interactions',
    };
  }
}

async function runExtractionCall<T>(
  ai: GoogleGenAI,
  prompt: string,
  responseSchema: Record<string, any>,
  timeoutMs: number
): Promise<T> {
  let lastErr: unknown;
  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        timeoutMs,
        `extract(${model})`
      );
      return JSON.parse(res.text?.trim() || '{}') as T;
    } catch (err) {
      const errMsg = String(err);
      if (/thinking|MINIMAL/i.test(errMsg)) {
        try {
          const retryRes = await withTimeout(
            ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema,
              },
            }),
            timeoutMs,
            `extract-retry(${model})`
          );
          return JSON.parse(retryRes.text?.trim() || '{}') as T;
        } catch (retryErr) {
          lastErr = retryErr;
          continue;
        }
      }
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * POST /api/maps/context implementation:
 * Call 1 (grounded, no schema) -> Call 2 (structured extraction).
 * Returns `{ unavailable: true }` if `groundingChunks` is empty or the grounded call fails.
 */
export async function handleMapsContext(
  ai: GoogleGenAI,
  params: { lat: number; lng: number; sessionId?: string },
  options?: {
    timeoutMs?: number;
    groundedRunner?: typeof runMapsGroundedCall;
  }
): Promise<MapsContextResult> {
  const { lat, lng, sessionId = 'default' } = params;
  const cacheKey = `${sessionId}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = sessionContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const totalTimeout = options?.timeoutMs ?? MAPS_TIMEOUT_MS;
  const started = Date.now();
  const runner = options?.groundedRunner ?? runMapsGroundedCall;

  const englishPrompt = `Describe the neighbourhood around latitude ${lat}, longitude ${lng} in Hanoi, Vietnam. What ward or district is this (for example Hoàn Kiếm, Ba Đình, Đống Đa, Tây Hồ, Hai Bà Trưng), what notable landmarks, hotels, cafés, or street-food places are right here, and is this a tourist core (like Hanoi's Old Quarter around Hoàn Kiếm Lake), a mixed area, or a local residential area?`;

  let grounded: GroundedCallResult;
  try {
    grounded = await runner(ai, englishPrompt, lat, lng, totalTimeout);
  } catch (err) {
    console.warn(`[maps/context] Grounded call failed:`, String(err).slice(0, 180));
    return { unavailable: true };
  }

  // Rule: If groundingChunks is empty, return { unavailable: true }. Never fall back to ungrounded answer.
  if (!grounded.chunks || grounded.chunks.length === 0) {
    return { unavailable: true };
  }

  const elapsed = Date.now() - started;
  const remainingMs = Math.max(2000, totalTimeout - elapsed);

  const extractionPrompt = `Read the following Google Maps grounded description of a location in Hanoi, Vietnam (${lat}, ${lng}) and return JSON.

Grounded description:
${grounded.text}

Grounded Google Maps places:
${grounded.chunks.map((c) => `- ${c.title}${c.text ? `: ${c.text}` : ''}`).join('\n')}

Classify:
- area_kind: "tourist_core" (busy visitor hub like Old Quarter / Hoàn Kiếm), "mixed" (mix of visitors/expats and local residents), or "local" (primarily local residential/working neighbourhood).
- area_name: Short Vietnamese district or ward name with proper accents (e.g. "Hoàn Kiếm", "Ba Đình", "Tây Hồ", "Đống Đa").
- summary_en: 1 short sentence describing the area in English.
- summary_vi: 1 short sentence describing the area in Vietnamese.`;

  try {
    const extracted = await runExtractionCall<{
      area_kind: MapsAreaKind;
      area_name: string;
      summary_en: string;
      summary_vi: string;
    }>(
      ai,
      extractionPrompt,
      {
        type: Type.OBJECT,
        properties: {
          area_kind: {
            type: Type.STRING,
            enum: ['tourist_core', 'mixed', 'local'],
          },
          area_name: { type: Type.STRING },
          summary_en: { type: Type.STRING },
          summary_vi: { type: Type.STRING },
        },
        required: ['area_kind', 'area_name', 'summary_en', 'summary_vi'],
      },
      remainingMs
    );

    const validKind: MapsAreaKind =
      extracted.area_kind === 'tourist_core' ||
      extracted.area_kind === 'mixed' ||
      extracted.area_kind === 'local'
        ? extracted.area_kind
        : 'tourist_core';

    const result: MapsContextResult = {
      area_kind: validKind,
      area_name: extracted.area_name?.trim() || 'Hoàn Kiếm',
      summary_en: extracted.summary_en?.trim() || '',
      summary_vi: extracted.summary_vi?.trim() || '',
      sources: deduplicateSources(grounded.chunks),
    };

    sessionContextCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[maps/context] Extraction call failed:`, String(err).slice(0, 180));
    return { unavailable: true };
  }
}

/**
 * POST /api/maps/nearby implementation:
 * Rate-limited to 1 call per item per session (kept in memory for the session only).
 * Call 1 (grounded, no schema) -> Call 2 (structured extraction) -> join to groundingChunks by accent-insensitive name.
 */
export async function handleMapsNearby(
  ai: GoogleGenAI,
  params: {
    dishVi: string;
    dishEn?: string;
    itemId?: string;
    lat: number;
    lng: number;
    sessionId?: string;
  },
  options?: {
    timeoutMs?: number;
    groundedRunner?: typeof runMapsGroundedCall;
  }
): Promise<MapsNearbyResult> {
  const { dishVi, dishEn, itemId, lat, lng, sessionId = 'default' } = params;
  const itemKey = (itemId || normalizeForMatch(dishVi) || 'dish').toLowerCase();
  const sessionKey = `${sessionId}:${itemKey}`;

  // Rate-limit to 1 call per item per session in memory
  const existing = sessionNearbyCache.get(sessionKey);
  if (existing) {
    return existing;
  }

  const totalTimeout = options?.timeoutMs ?? MAPS_TIMEOUT_MS;
  const started = Date.now();
  const runner = options?.groundedRunner ?? runMapsGroundedCall;

  // Maps grounding is English-only: use e.g. "bún chả (grilled pork with noodles)"
  const dishPromptLabel =
    dishVi && dishEn ? `${dishVi} (${dishEn})` : dishVi || dishEn || 'Vietnamese street food';

  const englishPrompt = `List well-rated local places and eateries serving ${dishPromptLabel} near latitude ${lat}, longitude ${lng} in Hanoi, Vietnam. For each place, include its exact name, rating, whether it is open now, and any typical price range per serving in VND (such as "45k-55k" or "40.000-60.000") mentioned in reviews or menus.`;

  let grounded: GroundedCallResult;
  try {
    grounded = await runner(ai, englishPrompt, lat, lng, totalTimeout);
  } catch (err) {
    console.warn(`[maps/nearby] Grounded call failed:`, String(err).slice(0, 180));
    return { unavailable: true };
  }

  // Rule: If groundingChunks is empty, return { unavailable: true }. Do not fall back to an ungrounded answer.
  if (!grounded.chunks || grounded.chunks.length === 0) {
    return { unavailable: true };
  }

  const elapsed = Date.now() - started;
  const remainingMs = Math.max(2000, totalTimeout - elapsed);

  const extractionPrompt = `Extract the places serving ${dishPromptLabel} mentioned in the Google Maps grounded text below.
Use the exact place names from the grounded places list so they match cleanly.
Format price_hint as a hyphenated range like "45k-55k" if a price or range is mentioned, or null if no price is known.

Grounded text:
${grounded.text}

Grounded Google Maps places:
${grounded.chunks.map((c) => `- ${c.title}${c.text ? `: ${c.text}` : ''}`).join('\n')}`;

  try {
    const extracted = await runExtractionCall<{
      places: {
        name: string;
        rating: number | null;
        price_hint: string | null;
        open_now: boolean | null;
      }[];
    }>(
      ai,
      extractionPrompt,
      {
        type: Type.OBJECT,
        properties: {
          places: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                rating: { type: Type.NUMBER, nullable: true },
                price_hint: { type: Type.STRING, nullable: true },
                open_now: { type: Type.BOOLEAN, nullable: true },
              },
              required: ['name', 'rating', 'price_hint', 'open_now'],
            },
          },
        },
        required: ['places'],
      },
      remainingMs
    );

    const rawPlaces = Array.isArray(extracted?.places) ? extracted.places : [];
    const usedUris = new Set<string>();
    const joinedPlaces: NearbyPlace[] = [];
    const matchedChunks: MapsGroundedChunk[] = [];

    for (const candidate of rawPlaces) {
      if (!candidate?.name) continue;
      const chunk = matchPlaceToChunk(candidate.name, grounded.chunks, usedUris);
      // Rule: Join each one to a grounding chunk by accent-insensitive name, and drop places with no matching chunk.
      if (!chunk) continue;

      usedUris.add(chunk.uri);
      matchedChunks.push(chunk);

      const { low, high } = parsePriceHint(candidate.price_hint);
      joinedPlaces.push({
        name: chunk.title,
        rating:
          typeof candidate.rating === 'number' && !Number.isNaN(candidate.rating)
            ? Math.round(candidate.rating * 10) / 10
            : null,
        price_low: low,
        price_high: high,
        open_now: typeof candidate.open_now === 'boolean' ? candidate.open_now : null,
        uri: chunk.uri,
        place_id: chunk.placeId,
      });
    }

    if (joinedPlaces.length === 0) {
      return { unavailable: true };
    }

    const result: MapsNearbyResult = {
      places: joinedPlaces,
      sources: deduplicateSources(matchedChunks),
    };

    sessionNearbyCache.set(sessionKey, result);
    return result;
  } catch (err) {
    console.warn(`[maps/nearby] Extraction call failed:`, String(err).slice(0, 180));
    return { unavailable: true };
  }
}
