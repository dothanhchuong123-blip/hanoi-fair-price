import { PriceContext, PriceFactor, PriceReference, VenueType } from './types';

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

const OLD_QUARTER_CENTER = { lat: 21.0333, lng: 105.8500 }; // Hàng Đào / Hàng Bạc area
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

export function isInOldQuarter(lat: number, lng: number): boolean {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat - OLD_QUARTER_CENTER.lat);
  const dLng = toRad(lng - OLD_QUARTER_CENTER.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(OLD_QUARTER_CENTER.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return km <= OLD_QUARTER_RADIUS_KM;
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

  if (ctx.area === 'elsewhere') {
    scales.push(OUTSIDE_OLD_QUARTER);
    factors.push({
      id: 'area',
      emoji: '📍',
      label_en: 'Outside the Old Quarter',
      label_vi: 'Ngoài Phố cổ',
      effect: pct(OUTSIDE_OLD_QUARTER.high),
    });
  }

  // Venue type only matters for prepared food and drinks; market produce is priced per kg.
  if (!isProduce && ctx.venue !== 'street') {
    const scale = VENUE_SCALE[ctx.venue];
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
