import { PriceReference } from '../agent/types';

export type UnitGroup = 'count' | 'weight';

export interface UnitInfo {
  id: string;
  en: string;
  vi: string;
  /** "per piece" style label */
  perEn: string;
  perVi: string;
  group: UnitGroup;
  /** Grams, for weight units only */
  grams?: number;
}

/** Every unit used in reference_prices.json and by the camera reader */
export const UNITS: Record<string, UnitInfo> = {
  bát: { id: 'bát', en: 'Bowl', vi: 'bát', perEn: 'per bowl', perVi: '/ bát', group: 'count' },
  cốc: { id: 'cốc', en: 'Glass', vi: 'cốc', perEn: 'per glass', perVi: '/ cốc', group: 'count' },
  chai: { id: 'chai', en: 'Bottle', vi: 'chai', perEn: 'per bottle', perVi: '/ chai', group: 'count' },
  chiếc: { id: 'chiếc', en: 'Piece', vi: 'chiếc', perEn: 'per piece', perVi: '/ chiếc', group: 'count' },
  quả: { id: 'quả', en: 'Each', vi: 'quả', perEn: 'each', perVi: '/ quả', group: 'count' },
  đĩa: { id: 'đĩa', en: 'Plate', vi: 'đĩa', perEn: 'per plate', perVi: '/ đĩa', group: 'count' },
  suất: { id: 'suất', en: 'Portion', vi: 'suất', perEn: 'per portion', perVi: '/ suất', group: 'count' },
  phần: { id: 'phần', en: 'Portion', vi: 'phần', perEn: 'per portion', perVi: '/ phần', group: 'count' },
  miếng: { id: 'miếng', en: 'Slice', vi: 'miếng', perEn: 'per slice', perVi: '/ miếng', group: 'count' },
  mớ: { id: 'mớ', en: 'Bunch', vi: 'mớ', perEn: 'per bunch', perVi: '/ mớ', group: 'count' },
  chảo: { id: 'chảo', en: 'Pan', vi: 'chảo', perEn: 'per pan', perVi: '/ chảo', group: 'count' },
  kg: { id: 'kg', en: 'Kilo', vi: 'kg', perEn: 'per kg', perVi: '/ kg', group: 'weight', grams: 1000 },
  lạng: { id: 'lạng', en: '100 g', vi: 'lạng', perEn: 'per 100 g', perVi: '/ lạng', group: 'weight', grams: 100 },
};

const WEIGHT_UNITS = ['kg', 'lạng'];

export function getUnit(id: string | null | undefined): UnitInfo {
  const key = (id || '').trim().toLowerCase();
  return (
    UNITS[key] ?? {
      id: key || 'phần',
      en: key || 'Portion',
      vi: key || 'phần',
      perEn: key ? `per ${key}` : 'per portion',
      perVi: key ? `/ ${key}` : '/ phần',
      group: 'count',
    }
  );
}

/** "Piece · chiếc" in EN, "chiếc · piece" in VI */
export function unitLabel(id: string, lang: 'en' | 'vi'): string {
  const u = getUnit(id);
  return lang === 'en' ? `${u.en} · ${u.vi}` : `${u.vi} · ${u.en.toLowerCase()}`;
}

/** "per piece" in EN, "/ chiếc" in VI */
export function perUnit(id: string, lang: 'en' | 'vi'): string {
  const u = getUnit(id);
  return lang === 'en' ? u.perEn : u.perVi;
}

/**
 * Units a seller could realistically quote for this dish.
 * Bread is sold per piece, never per bowl; fruit sold by weight can be quoted per kg or per lạng.
 */
export function unitsForReference(ref: Pick<PriceReference, 'unit' | 'category'>): string[] {
  const base = getUnit(ref.unit);
  if (base.group === 'weight') return WEIGHT_UNITS;
  // Count units can't be converted into each other, so only the dish's own unit is offered
  return [base.id];
}

/**
 * Converts a price quoted in `fromUnit` into the reference unit.
 * Returns null when the two units can't be compared (e.g. per piece vs per kg).
 */
export function convertToReferenceUnit(
  priceVnd: number,
  fromUnit: string,
  refUnit: string
): number | null {
  const from = getUnit(fromUnit);
  const to = getUnit(refUnit);
  if (from.id === to.id) return priceVnd;
  if (from.group === 'weight' && to.group === 'weight' && from.grams && to.grams) {
    return Math.round((priceVnd / from.grams) * to.grams);
  }
  return null;
}
