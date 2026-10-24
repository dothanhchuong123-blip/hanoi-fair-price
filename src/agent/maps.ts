import { MAPS_TIMEOUT_MS } from '../config';
import { MapsContextResult, MapsNearbyResult, NearbyPlace, TraceStep } from './types';

// In-memory session state only (never persisted to localStorage, per Google Maps Platform terms)
const SESSION_ID = `sess_${Math.random().toString(36).slice(2, 10)}`;
const clientNearbyCache = new Map<string, MapsNearbyResult>();

export function clearClientMapsCache(): void {
  clientNearbyCache.clear();
}

export const DEMO_NEARBY_PLACES: NearbyPlace[] = [
  {
    name: 'Bún Chả Hàng Quạt',
    rating: 4.6,
    price_low: 40000,
    price_high: 60000,
    open_now: true,
    uri: 'https://www.google.com/maps/search/?api=1&query=Bun+cha+Hang+Quat+Hoan+Kiem+Hanoi',
    place_id: 'sample_hang_quat',
    distance_m: 350,
    lat: 21.0318,
    lng: 105.8482,
    is_sample: true,
  },
  {
    name: 'Bún Chả Đắc Kim',
    rating: 4.3,
    price_low: 50000,
    price_high: 70000,
    open_now: true,
    uri: 'https://www.google.com/maps/search/?api=1&query=Bun+cha+Dac+Kim+1+Hang+Manh+Hoan+Kiem+Hanoi',
    place_id: 'sample_dac_kim',
    distance_m: 500,
    lat: 21.0315,
    lng: 105.8473,
    is_sample: true,
  },
  {
    name: 'Bún Chả 34 Hàng Than',
    rating: 4.5,
    price_low: 60000,
    price_high: 60000,
    open_now: true,
    uri: 'https://www.google.com/maps/search/?api=1&query=Bun+cha+34+Hang+Than+Ba+Dinh+Hanoi',
    place_id: 'sample_hang_than',
    distance_m: 800,
    lat: 21.0405,
    lng: 105.8468,
    is_sample: true,
  },
];

export function getDemoNearbyResult(dishVi?: string): MapsNearbyResult {
  const isBunCha = !dishVi || /bún chả|bun cha/i.test(dishVi);
  const places: NearbyPlace[] = isBunCha
    ? DEMO_NEARBY_PLACES.map((p) => ({ ...p }))
    : [
        {
          name: `${dishVi} Hàng Bạc`,
          rating: 4.5,
          price_low: 35000,
          price_high: 45000,
          open_now: true,
          uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dishVi + ' Hang Bac Hoan Kiem Hanoi')}`,
          place_id: 'sample_1',
          distance_m: 300,
          lat: 21.0341,
          lng: 105.8521,
          is_sample: true,
        },
        {
          name: `${dishVi} Hàng Đào`,
          rating: 4.4,
          price_low: 35000,
          price_high: 50000,
          open_now: true,
          uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dishVi + ' Hang Dao Hoan Kiem Hanoi')}`,
          place_id: 'sample_2',
          distance_m: 450,
          lat: 21.0329,
          lng: 105.8507,
          is_sample: true,
        },
        {
          name: `${dishVi} Cầu Gỗ`,
          rating: 4.3,
          price_low: 40000,
          price_high: 50000,
          open_now: true,
          uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dishVi + ' Cau Go Hoan Kiem Hanoi')}`,
          place_id: 'sample_3',
          distance_m: 600,
          lat: 21.0322,
          lng: 105.8528,
          is_sample: true,
        },
      ];

  return {
    places,
    sources: places.map((p) => ({ title: p.name, uri: p.uri })),
    is_sample: true,
  };
}

/**
 * Calls POST /api/maps/context with a 10s timeout.
 * Never throws; returns `{ result: { unavailable: true }, ms }` on failure.
 */
export async function fetchMapsContext(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<{ result: MapsContextResult; ms: number }> {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPS_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const res = await fetch('/api/maps/context', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, session_id: SESSION_ID }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { result: { unavailable: true }, ms };
    }
    const data = (await res.json()) as MapsContextResult;
    return { result: data, ms };
  } catch {
    const ms = Math.round(performance.now() - t0);
    return { result: { unavailable: true }, ms };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Calls POST /api/maps/nearby with a 10s timeout and rate-limits to 1 call per item per session in memory.
 * In demo mode, returns 3 canned places marked "sample data" with no network calls.
 */
export async function fetchMapsNearby(params: {
  itemId?: string;
  dishVi: string;
  dishEn?: string;
  lat: number;
  lng: number;
  demoMode?: boolean;
}): Promise<MapsNearbyResult> {
  if (params.demoMode) {
    return getDemoNearbyResult(params.dishVi);
  }

  const cacheKey = (params.itemId || params.dishVi).trim().toLowerCase();
  const cached = clientNearbyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPS_TIMEOUT_MS);
  try {
    const res = await fetch('/api/maps/nearby', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: params.itemId,
        dish_vi: params.dishVi,
        dish_en: params.dishEn,
        lat: params.lat,
        lng: params.lng,
        session_id: SESSION_ID,
      }),
    });
    if (!res.ok) {
      return { unavailable: true };
    }
    const data = (await res.json()) as MapsNearbyResult;
    clientNearbyCache.set(cacheKey, data);
    return data;
  } catch {
    return { unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

export function buildMapsTraceStep(options: {
  demoMode?: boolean;
  hasLocation?: boolean;
  contextResult?: MapsContextResult;
  ms?: number;
}): TraceStep {
  if (options.demoMode) {
    return {
      id: 'maps',
      title_en: 'Neighbourhood context',
      title_vi: 'Bối cảnh khu vực',
      detail: 'Google Maps · Hoàn Kiếm, tourist core · sample data',
      model: 'gemini-3.5-flash-lite',
      ms: 0,
      status: 'done',
    };
  }

  if (!options.hasLocation) {
    return {
      id: 'maps',
      title_en: 'Neighbourhood context',
      title_vi: 'Bối cảnh khu vực',
      detail: 'skipped · no location',
      ms: 0,
      status: 'skipped',
    };
  }

  const ctx = options.contextResult;
  const ms = options.ms ?? 0;

  if (ctx && !ctx.unavailable && ctx.area_kind && ctx.area_name) {
    const kindLabel =
      ctx.area_kind === 'tourist_core'
        ? 'tourist core'
        : ctx.area_kind === 'mixed'
        ? 'mixed area'
        : 'local area';
    return {
      id: 'maps',
      title_en: 'Neighbourhood context',
      title_vi: 'Bối cảnh khu vực',
      detail: `Google Maps · ${ctx.area_name}, ${kindLabel} · ${(ms / 1000).toFixed(1)}s`,
      model: 'gemini-3.5-flash-lite',
      ms,
      status: 'done',
    };
  }

  return {
    id: 'maps',
    title_en: 'Neighbourhood context',
    title_vi: 'Bối cảnh khu vực',
    detail: 'unavailable here',
    ms,
    status: 'skipped',
  };
}
