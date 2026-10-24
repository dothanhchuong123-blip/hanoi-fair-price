import referencePricesData from '../data/reference_prices.json';
import { PriceReference } from './types';

const CATALOG: PriceReference[] = referencePricesData as PriceReference[];

export function getAllReferences(): PriceReference[] {
  return CATALOG;
}

export async function lookup(matchedId: string | null): Promise<PriceReference | null> {
  if (!matchedId) return null;
  const found = CATALOG.find((item) => item.id === matchedId);
  return found ?? null;
}
