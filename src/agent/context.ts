import { AreaType, MapsAreaKind, PriceContext, PriceFactor, PriceReference, VenueType } from './types';

/**
 * Price context: moves a catalog range to match where and when the price was quoted.
 *
 * The seed ranges describe ordinary street-level prices in the Old Quarter. Each factor scales
 * low / median / high separately, because a nicer venue mostly raises the ceiling, not the floor.
 *
 * Sources for the sizes (travel guides and Vietnamese press, not field surveys):
 * - phở is ~40-50k in the Old Quarter vs ~35-40k in local districts (about -12% outside)
 * - sit-down cafés and restaurants with AC or a view charge noticeably more for the same dish
 * - fruit outside its northern season is stored or shipped in and costs more
 * - many places add a Tết surcharge ("phụ thu Tết") around Lunar New Year
 */

interface Scale {
  low: number;
  median: number;
  high: number;
}

export const OLD_QUARTER_CENTER = { lat: 21.0333, lng: 105.8500 }; // Hàng Đào / Hàng Bạc area
const OLD_QUARTER_RADIUS_KM = 1.3; // covers the Old Quarter and the lake edge

const VENUE_SCALE: Record<VenueType, Scale> = {
  street: { low: 1, median: 1, high: 1 },
  eatery: { low: 1, median: 1.05, high: 1.15 },
  cafe: { low: 1.1, median: 1.2, high: 1.35 },
  tourist: { low: 1.2, median: 1.4, high: 1.7 },
};

export const VENUE_LABELS: Record<VenueType, { emoji: string; en: string; vi: string }> = {
  street: { emoji: '🪑', en: 'Street stall', vi: 'Vỉa hè' },
  eatery: { emoji: '🍽️', en: 'Local eatery', vi: 'Quán bình dân' },
  cafe: { emoji: '☕', en: 'Café / sit-down', vi: 'Quán café, ngồi trong' },
  tourist: { emoji: '📸', en: 'Tourist restaurant', vi: 'Nhà hàng du lịch' },
};

const OUTSIDE_OLD_QUARTER: Scale = { low: 0.9, median: 0.88, high: 0.88 };
const IN_SEASON: Scale = { low: 0.85, median: 0.9, high: 0.9 };
const OFF_SEASON: Scale = { low: 1.2, median: 1.25, high: 1.3 };
const TET: Scale = { low: 1.1, median: 1.15, high: 1.3 };

// Lunar New Year (mùng 1 Tết) dates; the surcharge window runs two weeks before to a week after.
const TET_DATES = ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13'];

export function isTetWindow(date: Date): boolean {
  return TET_DATES.some((d) => {
    const days = (date.getTime() - new Date(d + 'T00:00:00+07:00').getTime()) / 86_400_000;
    return days >= -14 && days <= 7;
  });
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isInOldQuarter(lat: number, lng: number): boolean {
  const meters = haversineMeters({ lat, lng }, OLD_QUARTER_CENTER);
  return meters / 1000 <= OLD_QUARTER_RADIUS_KM;
}

/** Maps a Google Maps grounded area_kind to our deterministic AreaType. */
export function mapAreaKindToArea(areaKind: MapsAreaKind): AreaType {
  return areaKind === 'local' ? 'elsewhere' : 'old_quarter';
}

/** Lowers the venue scale by one step (used when area_kind === 'mixed'). */
export function stepDownVenue(venue: VenueType): VenueType {
  switch (venue) {
    case 'tourist':
      return 'cafe';
    case 'cafe':
      return 'eatery';
    case 'eatery':
    case 'street':
    default:
      return 'street';
  }
}

export function defaultContext(venue: VenueType = 'street'): PriceContext {
  return { area: 'old_quarter', venue, date: new Date() };
}

function pct(scale: number): number {
  return Math.round((scale - 1) * 100) / 100;
}

/** Returns the reference range adjusted for context, plus the factors that moved it. */
export function applyContext(
  ref: PriceReference,
  ctx: PriceContext
): { reference: PriceReference; factors: PriceFactor[] } {
  const scales: Scale[] = [];
  const factors: PriceFactor[] = [];
  const isProduce = ref.category === 'fruit' || ref.category === 'vegetable';

  const effectiveArea: AreaType = ctx.area_kind ? mapAreaKindToArea(ctx.area_kind) : ctx.area;
  const effectiveVenue: VenueType =
    ctx.area_kind === 'mixed' ? stepDownVenue(ctx.venue) : ctx.venue;
  const areaName = ctx.area_name?.trim();

  if (effectiveArea === 'elsewhere') {
    scales.push(OUTSIDE_OLD_QUARTER);
    factors.push({
      id: 'area',
      emoji: '📍',
      label_en: areaName ? `${areaName} · local area` : 'Outside the Old Quarter',
      label_vi: areaName ? `${areaName} · khu dân cư` : 'Ngoài Phố cổ',
      effect: pct(OUTSIDE_OLD_QUARTER.high),
    });
  } else if (areaName && ctx.area_kind === 'tourist_core') {
    factors.push({
      id: 'area',
      emoji: '📍',
      label_en: `${areaName} · tourist area`,
      label_vi: `${areaName} · khu du lịch`,
      effect: 0,
    });
  } else if (areaName && ctx.area_kind === 'mixed') {
    factors.push({
      id: 'area',
      emoji: '📍',
      label_en: `${areaName} · mixed area`,
      label_vi: `${areaName} · khu hỗn hợp`,
      effect: 0,
    });
  }

  // Venue type only matters for prepared food and drinks; market produce is priced per kg.
  if (!isProduce && effectiveVenue !== 'street') {
    const scale = VENUE_SCALE[effectiveVenue];
    const label = VENUE_LABELS[ctx.venue];
    scales.push(scale);
    factors.push({ id: 'venue', emoji: label.emoji, label_en: label.en, label_vi: label.vi, effect: pct(scale.high) });
  }

  if (ref.season_months) {
    const month = ctx.date.getMonth() + 1;
    if (ref.season_months.includes(month)) {
      scales.push(IN_SEASON);
      factors.push({ id: 'in_season', emoji: '🌿', label_en: 'In season now', label_vi: 'Đang vào mùa', effect: pct(IN_SEASON.high) });
    } else {
      scales.push(OFF_SEASON);
      factors.push({ id: 'off_season', emoji: '❄️', label_en: 'Out of season', label_vi: 'Trái mùa', effect: pct(OFF_SEASON.high) });
    }
  }

  if (isTetWindow(ctx.date)) {
    scales.push(TET);
    factors.push({ id: 'tet', emoji: '🧧', label_en: 'Tết surcharge period', label_vi: 'Dịp Tết', effect: pct(TET.high) });
  }

  if (scales.length === 0) return { reference: ref, factors };

  const total = scales.reduce(
    (acc, s) => ({ low: acc.low * s.low, median: acc.median * s.median, high: acc.high * s.high }),
    { low: 1, median: 1, high: 1 }
  );
  const round = (v: number) => Math.round(v / 1000) * 1000;

  return {
    reference: {
      ...ref,
      low_vnd: round(ref.low_vnd * total.low),
      median_vnd: round(ref.median_vnd * total.median),
      high_vnd: round(ref.high_vnd * total.high),
    },
    factors,
  };
}
