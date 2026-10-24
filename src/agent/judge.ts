import { JudgeVerdict, NormalizedItem, PriceReference, VerdictLabel } from './types';

/**
 * DETERMINISTIC price judge (never uses LLM):
 * ratio = quoted / high_vnd
 * - <= 1.0 -> 'fair'
 * - <= 1.3 -> 'slightly_high'
 * - > 1.3  -> 'overpriced'
 * - no reference or no price or confidence < 0.5 -> 'unknown' ("Not sure")
 */
export async function judge(
  normalizedItem: NormalizedItem,
  reference: PriceReference | null
): Promise<JudgeVerdict> {
  const quoted = normalizedItem.normalized_price_vnd;
  const perceivedConfidence = normalizedItem.perceived.confidence ?? 0.9;
  const combinedConfidence =
    normalizedItem.matched_id && reference
      ? Math.min(perceivedConfidence, Math.max(normalizedItem.match_score, 0.75))
      : Math.min(perceivedConfidence, normalizedItem.match_score);

  if (
    !reference ||
    quoted === null ||
    quoted <= 0 ||
    perceivedConfidence < 0.5 ||
    normalizedItem.match_score < 0.5
  ) {
    return {
      verdict: 'unknown',
      ratio: null,
      pct_above_median: null,
      pct_above_high: null,
      quoted_vnd: quoted,
      reference,
      confidence: combinedConfidence,
    };
  }

  const ratio = quoted / reference.high_vnd;
  const pctAboveMedian = Math.round(((quoted - reference.median_vnd) / reference.median_vnd) * 100);
  const pctAboveHigh = Math.round(((quoted - reference.high_vnd) / reference.high_vnd) * 100);

  let verdict: VerdictLabel = 'unknown';
  if (ratio <= 1.0) {
    verdict = 'fair';
  } else if (ratio <= 1.3) {
    verdict = 'slightly_high';
  } else {
    verdict = 'overpriced';
  }

  return {
    verdict,
    ratio: Number(ratio.toFixed(2)),
    pct_above_median: pctAboveMedian,
    pct_above_high: pctAboveHigh,
    quoted_vnd: quoted,
    reference,
    confidence: Number(combinedConfidence.toFixed(2)),
  };
}
