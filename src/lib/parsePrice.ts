import { USD_VND_RATE } from '../config';

export interface ParsedVietnamesePrice {
  price_vnd: number | null;
  unit: string | null;
  normalized_per_base_vnd: number | null;
  base_unit: string | null;
}

/**
 * Parses Vietnamese price strings into VND and handles unit conversions:
 * - "35k", "35K" -> 35000
 * - "35.000", "35.000đ", "35,000 VND" -> 35000
 * - "35 nghìn", "35 ngàn" -> 35000
 * - "1tr2", "1.2 triệu" -> 1200000
 * - "150k/kg", "15k/lạng", "80k/cân" -> extracts unit and converts 1 lạng = 100g (×10 for kg), 1 cân = 1 kg
 */
export function parsePrice(rawInput: string | number | null | undefined, defaultUnit?: string): ParsedVietnamesePrice {
  if (rawInput === null || rawInput === undefined) {
    return { price_vnd: null, unit: defaultUnit || null, normalized_per_base_vnd: null, base_unit: defaultUnit || null };
  }

  if (typeof rawInput === 'number') {
    if (Number.isNaN(rawInput) || rawInput <= 0) {
      return { price_vnd: null, unit: defaultUnit || null, normalized_per_base_vnd: null, base_unit: defaultUnit || null };
    }
    const price = rawInput < 1000 ? rawInput * 1000 : rawInput;
    const conv = convertUnitPrice(price, defaultUnit || null);
    return {
      price_vnd: price,
      unit: defaultUnit || null,
      normalized_per_base_vnd: conv.normalized_vnd,
      base_unit: conv.base_unit,
    };
  }

  const text = rawInput.trim().toLowerCase();
  if (!text) {
    return { price_vnd: null, unit: defaultUnit || null, normalized_per_base_vnd: null, base_unit: defaultUnit || null };
  }

  // Extract optional "/unit" suffix, e.g. "150k/kg", "15k / lạng", "80k/cân"
  let detectedUnit: string | null = defaultUnit || null;
  let pricePart = text;

  const slashMatch = text.match(/^(.*?)\s*\/\s*([a-zA-ZÀ-ỹ]+)$/);
  if (slashMatch) {
    pricePart = slashMatch[1].trim();
    detectedUnit = slashMatch[2].trim();
  }

  let vnd: number | null = null;

  // 1. Check "1tr2", "1tr25", "2tr" (triệu shorthand)
  const trShorthand = pricePart.match(/^(\d+)\s*tr(?:iệu)?\s*(\d+)?$/i);
  if (trShorthand) {
    const millions = parseInt(trShorthand[1], 10);
    const fracStr = trShorthand[2] || '';
    const frac = fracStr ? parseInt(fracStr, 10) * Math.pow(10, 6 - fracStr.length) : 0;
    vnd = millions * 1_000_000 + frac;
  }

  // 2. Check decimal triệu, e.g. "1.2 triệu", "1,5tr"
  if (vnd === null) {
    const trDecimal = pricePart.match(/^(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)\b/i);
    if (trDecimal) {
      const val = parseFloat(trDecimal[1].replace(',', '.'));
      vnd = Math.round(val * 1_000_000);
    }
  }

  // 3. Check "35k5" -> 35,500
  if (vnd === null) {
    const kShorthand = pricePart.match(/^(\d+)\s*k\s*(\d+)$/i);
    if (kShorthand) {
      const thousands = parseInt(kShorthand[1], 10);
      const fracStr = kShorthand[2];
      const frac = parseInt(fracStr, 10) * Math.pow(10, 3 - fracStr.length);
      vnd = thousands * 1000 + frac;
    }
  }

  // 4. Check "35k", "35 nghìn", "35 ngàn", "35.5k"
  if (vnd === null) {
    const kMatch = pricePart.match(/^(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|ng)\b/i);
    if (kMatch) {
      const val = parseFloat(kMatch[1].replace(',', '.'));
      vnd = Math.round(val * 1000);
    }
  }

  // 5. Check formatted thousands with dots or commas: "35.000", "35,000", "1.200.000", with optional đ / vnd / d
  if (vnd === null) {
    const cleanCurrency = pricePart.replace(/\s*(?:đ|đồng|vnd|vnđ|d)\s*$/i, '').trim();
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(cleanCurrency)) {
      vnd = parseInt(cleanCurrency.replace(/[.,]/g, ''), 10);
    } else if (/^\d+$/.test(cleanCurrency)) {
      const rawNum = parseInt(cleanCurrency, 10);
      // In Vietnamese menus, bare numbers under 1000 (like "35", "60", "120") mean thousands (35k, 60k, 120k)
      vnd = rawNum > 0 && rawNum < 1000 ? rawNum * 1000 : rawNum;
    }
  }

  if (vnd === null || Number.isNaN(vnd) || vnd <= 0) {
    return { price_vnd: null, unit: detectedUnit, normalized_per_base_vnd: null, base_unit: detectedUnit };
  }

  const conv = convertUnitPrice(vnd, detectedUnit);
  return {
    price_vnd: vnd,
    unit: detectedUnit,
    normalized_per_base_vnd: conv.normalized_vnd,
    base_unit: conv.base_unit,
  };
}

/**
 * Unit conversion:
 * - 1 lạng = 100 g -> 10 lạng = 1 kg
 * - 1 cân = 1 kg
 * - 100g = 0.1 kg -> ×10 for 1 kg
 */
export function convertUnitPrice(
  priceVnd: number,
  unit: string | null | undefined,
  targetUnit?: string
): { normalized_vnd: number; base_unit: string } {
  const u = (unit || '').trim().toLowerCase();

  if (u === 'lạng' || u === 'lang' || u === '100g' || u === '100 g') {
    // 1 lạng = 100g; if reference is in kg (or default produce base unit), 1 kg = 10 lạng
    return {
      normalized_vnd: priceVnd * 10,
      base_unit: targetUnit || 'kg',
    };
  }

  if (u === 'cân' || u === 'can' || u === 'kg' || u === 'ký' || u === 'ki') {
    return {
      normalized_vnd: priceVnd,
      base_unit: 'kg',
    };
  }

  if (u === 'nửa cân' || u === '0.5kg' || u === '500g') {
    return {
      normalized_vnd: priceVnd * 2,
      base_unit: 'kg',
    };
  }

  return {
    normalized_vnd: priceVnd,
    base_unit: u || targetUnit || 'phần',
  };
}

export function formatShortVnd(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || Number.isNaN(vnd)) return '—';
  if (vnd >= 1_000_000) {
    const tr = vnd / 1_000_000;
    return Number.isInteger(tr) ? `${tr}tr` : `${tr.toFixed(1).replace('.0', '')}tr`;
  }
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k}k`;
  }
  return `${vnd}đ`;
}

export function formatDotVnd(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || Number.isNaN(vnd)) return '—';
  return `${vnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

export function formatUsd(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || Number.isNaN(vnd) || vnd <= 0) return '$0.00';
  const rawUsd = vnd / USD_VND_RATE;
  // Round to nearest $0.05 for clean street-price display (120k -> $4.60, 80k -> $3.05)
  const rounded = Math.round(rawUsd * 20) / 20;
  return `$${rounded.toFixed(2)}`;
}
