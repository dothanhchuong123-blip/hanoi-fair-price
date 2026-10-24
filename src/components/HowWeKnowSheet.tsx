import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Minus, X } from 'lucide-react';
import {
  AreaType,
  EvaluatedItem,
  MapsContextResult,
  TraceStep,
} from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import { getCrowdStatsForItem } from '../lib/storage';
import { Button, IconButton, VerdictBadge } from './ui';

interface HowWeKnowSheetProps {
  lang: 'en' | 'vi';
  item: EvaluatedItem;
  trace: TraceStep[];
  area: AreaType;
  mapsContext?: MapsContextResult;
  userConfirmedRefId?: string | 'none';
  onClose: () => void;
}

const PIPELINE_STEP_TITLES: Record<string, { en: string; vi: string }> = {
  ocr: { en: 'Read text', vi: 'Đọc văn bản' },
  read: { en: 'Understand items', vi: 'Nhận diện món và giá' },
  tiles: { en: 'Read dense menu tiles', vi: 'Đọc chi tiết từng phần' },
  fuse: { en: 'Snap boxes to OCR', vi: 'Căn chỉnh khung chữ' },
  second_pass: { en: 'Re-check unsure items', vi: 'Kiểm tra lại dòng mờ' },
  match: { en: 'Match to catalog', vi: 'Đối chiếu danh mục' },
  lookup: { en: 'Look up prices', vi: 'Tra cứu mức giá' },
  maps: { en: 'Neighbourhood context', vi: 'Bối cảnh khu vực' },
  judge: { en: 'Judge', vi: 'Đánh giá' },
  respond: { en: 'Write tips', vi: 'Tạo câu giao tiếp' },
  live_track: { en: 'Live AR stall tracking', vi: 'Theo dõi AR quầy hàng' },
};

function formatTraceTiming(ms: number): string {
  const sec = ms >= 100 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 1000).toFixed(2)}s`;
  return `${sec} · ${ms}ms`;
}

export const HowWeKnowSheet: React.FC<HowWeKnowSheetProps> = ({
  lang,
  item,
  trace,
  area,
  mapsContext,
  userConfirmedRefId,
  onClose,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const ref = item.reference;
  const baseRef = item.base_reference ?? item.reference;
  const verdict = item.judgment.verdict;
  const quoted = item.judgment.quoted_vnd;
  const ratio = item.judgment.ratio;
  const confidence = item.judgment.confidence;

  const isLowConfidence = confidence < 0.65 || verdict === 'unknown';
  const displayVerdict = isLowConfidence ? 'unknown' : verdict;

  // 1. THIS ITEM metadata
  const boxSource = item.perceived.box_source ?? 'gemini';
  const readByText =
    boxSource === 'ocr' || boxSource === 'ocr_partial'
      ? 'Cloud Vision + Gemini'
      : 'Gemini only';

  const secondPassStep = trace.find((t) => t.id === 'second_pass');
  const recheckModel = secondPassStep?.model || 'gemini-3.8-flash';

  const confirmedNameVi =
    userConfirmedRefId && userConfirmedRefId !== 'none'
      ? (ref?.name_vi || item.perceived.name_vi).toLowerCase()
      : null;

  const matchText = confirmedNameVi
    ? `you confirmed: ${confirmedNameVi}`
    : `fuzzy match ${item.normalized.match_score.toFixed(2)} → ${
        item.normalized.matched_id || 'none'
      }`;

  // 2. PRICE SOURCES (only rows for tiers that were used)
  const crowdStats = getCrowdStatsForItem(ref?.id ?? item.normalized.matched_id);
  const searchGrounding = item.perceived.search_grounding;

  // 3. NEIGHBOURHOOD
  const rawAreaName = mapsContext?.area_name?.trim();
  const areaDisplay =
    rawAreaName && rawAreaName.toLowerCase() !== 'hoàn kiếm'
      ? rawAreaName
      : area === 'old_quarter'
      ? 'Hoàn Kiếm, Old Quarter'
      : lang === 'en'
      ? 'Elsewhere in Hanoi'
      : 'Khu vực khác tại Hà Nội';

  const areaKind =
    mapsContext?.area_kind ?? (area === 'old_quarter' ? 'tourist_core' : 'local');
  const areaCategoryLabel =
    areaKind === 'tourist_core'
      ? lang === 'en'
        ? 'tourist area'
        : 'khu du lịch'
      : areaKind === 'mixed'
      ? lang === 'en'
        ? 'mixed area'
        : 'khu hỗn hợp'
      : lang === 'en'
      ? 'local area'
      : 'khu dân cư';

  const nonZeroFactor = item.factors.find((f) => f.effect !== 0);
  const factorEffectText = nonZeroFactor
    ? `${nonZeroFactor.effect > 0 ? '+' : ''}${Math.round(nonZeroFactor.effect * 100)}% typical`
    : areaKind === 'tourist_core'
    ? '+15% typical'
    : '0% typical';

  const mapsSources = mapsContext?.sources ?? [];

  // Count active sources for summary ("4 sources · high confidence")
  const sourceCount =
    (baseRef ? 1 : 0) +
    (searchGrounding ? 1 : 0) +
    (crowdStats ? 1 : 0) +
    1; // Neighbourhood / Maps context

  const confidenceWord =
    confidence >= 0.85
      ? lang === 'en'
        ? 'high confidence'
        : 'độ tin cậy cao'
      : confidence >= 0.65
      ? lang === 'en'
        ? 'medium confidence'
        : 'độ tin cậy vừa'
      : lang === 'en'
      ? 'low confidence'
      : 'độ tin cậy thấp';

  // 4. HOW THE VERDICT WAS DECIDED (actual thresholds from judge.ts)
  const decisionRuleLine = (() => {
    if (ratio === null || !quoted || !ref) {
      return '→ confidence < 0.5 or no reference → unsure';
    }
    if (ratio <= 1.0) {
      return '→ ≤ 1.0 → fair';
    }
    if (ratio <= 1.3) {
      return '→ ≤ 1.3 → a bit high';
    }
    return '→ > 1.3 → above typical';
  })();

  const rawJsonPayload = JSON.stringify(
    {
      evaluated_item: item,
      trace,
    },
    null,
    2
  );

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard?.writeText(rawJsonPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      data-testid="how-we-know-sheet"
      onClick={onClose}
      className="absolute inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex flex-col justify-end animate-fade-in"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'en' ? 'How we know' : 'Cơ sở đối chiếu'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[90%] bg-surface text-ink rounded-t-[28px] px-5 pt-2.5 pb-6 overflow-y-auto overscroll-contain shadow-2xl border-t border-line animate-sheet-up"
      >
        {/* Top grab handle */}
        <div
          aria-hidden="true"
          className="w-9 h-1 rounded-full bg-line mx-auto mb-3.5"
        />

        {/* Header matching Screenshot 07 */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="font-display text-[25px] leading-tight text-ink">
              {lang === 'en' ? 'How we know' : 'Cơ sở đối chiếu'}
            </h2>
            <p className="text-[14px] text-ink-2 mt-0.5 tabular-nums">
              {item.perceived.name_vi} · {quoted ? formatShortVnd(quoted) : '—'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <VerdictBadge verdict={displayVerdict} lang={lang} />
            <IconButton
              variant="default"
              onClick={onClose}
              aria-label={lang === 'en' ? 'Close How we know' : 'Đóng'}
              className="w-8 h-8 min-w-[36px] min-h-[36px]"
            >
              <X className="w-4 h-4 text-ink-2" />
            </IconButton>
          </div>
        </div>

        {/* SECTION 1: PIPELINE */}
        <section className="mb-4" data-testid="hwk-pipeline-section">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-2.5">
            PIPELINE
          </h3>

          <div className="space-y-2.5">
            {trace.map((step, idx) => {
              const isDone = step.status === 'done';
              const isSkippedOrFailed =
                step.status === 'skipped' || step.status === 'failed';
              const titleObj = PIPELINE_STEP_TITLES[step.id];
              const stepTitle = titleObj
                ? lang === 'en'
                  ? titleObj.en
                  : titleObj.vi
                : lang === 'en'
                ? step.title_en
                : step.title_vi;

              const technicalDetail = (() => {
                if (step.id === 'judge') {
                  return 'deterministic rule, not AI';
                }
                if (isSkippedOrFailed) {
                  const raw = step.detail
                    .replace(/\(([^)]+)\)/g, '· $1')
                    .trim();
                  if (step.id === 'ocr' && !raw.toLowerCase().includes('cloud vision')) {
                    return `Cloud Vision · ${step.status} · ${raw}`;
                  }
                  return raw;
                }
                if (
                  step.model &&
                  !step.detail.toLowerCase().includes(step.model.toLowerCase())
                ) {
                  return `${step.detail} · ${step.model}`;
                }
                return step.detail;
              })();

              return (
                <div
                  key={`${step.id}-${idx}`}
                  data-testid={`hwk-trace-${step.id}`}
                  className="flex items-start gap-3"
                >
                  {isDone ? (
                    <div className="w-7 h-7 rounded-full bg-fair-soft text-fair flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-surface-2 text-ink-3 flex items-center justify-center shrink-0 mt-0.5">
                      <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-bold text-[15px] leading-snug ${
                          isSkippedOrFailed ? 'text-ink-3' : 'text-ink'
                        }`}
                      >
                        {stepTitle}
                      </span>
                      <span className="font-mono text-[12.5px] text-ink-2 shrink-0 tabular-nums">
                        {formatTraceTiming(step.ms)}
                      </span>
                    </div>
                    <div
                      className={`text-[12.5px] leading-snug mt-0.5 ${
                        isSkippedOrFailed ? 'text-ink-3' : 'text-ink-2'
                      }`}
                    >
                      {technicalDetail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="border-line my-3.5" />

        {/* SECTION 2: THIS ITEM */}
        <section className="mb-4" data-testid="hwk-this-item-section">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-2">
            {lang === 'en' ? 'THIS ITEM' : 'MÓN NÀY'}
          </h3>

          <div className="space-y-1.5 text-[13.5px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink-2">
                {lang === 'en' ? 'Read by' : 'Đọc bởi'}
              </span>
              <span className="font-semibold text-ink">{readByText}</span>
            </div>

            {item.perceived.rechecked && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink-2">
                  {lang === 'en' ? 'Second pass' : 'Kiểm tra lần 2'}
                </span>
                <span className="font-semibold text-ink">
                  Re-checked with {recheckModel}
                </span>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink-2">
                {lang === 'en' ? 'Match' : 'Đối chiếu'}
              </span>
              <span className="font-mono text-[13px] font-semibold text-ink">
                {matchText}
              </span>
            </div>
          </div>
        </section>

        <hr className="border-line my-3.5" />

        {/* SECTION 3: PRICE SOURCES (only rows for tiers that were used) */}
        <section className="mb-4" data-testid="hwk-price-sources-section">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-2">
            {lang === 'en' ? 'PRICE SOURCES' : 'NGUỒN DỮ LIỆU GIÁ'}
          </h3>

          <div className="space-y-1.5 text-[14px] tabular-nums">
            {baseRef && (
              <div
                data-testid="hwk-source-seed"
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-ink-2">
                  Seed estimate ·{' '}
                  {formatShortVnd(baseRef.low_vnd).replace(/k$/, '')}–
                  {formatShortVnd(baseRef.high_vnd)} · low weight
                </span>
                <span className="font-bold text-ink shrink-0">
                  {formatShortVnd(baseRef.low_vnd).replace(/k$/, '')}–
                  {formatShortVnd(baseRef.high_vnd)}
                </span>
              </div>
            )}

            {searchGrounding && (
              <div
                data-testid="hwk-source-search"
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-ink-2">
                  Google Search · {searchGrounding.count} sources ·{' '}
                  <a
                    href={searchGrounding.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand font-semibold hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>view</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </span>
                <span className="font-bold text-ink shrink-0">
                  {formatShortVnd(searchGrounding.low_vnd).replace(/k$/, '')}–
                  {formatShortVnd(searchGrounding.high_vnd)}
                </span>
              </div>
            )}

            {crowdStats && crowdStats.count > 0 && (
              <div
                data-testid="hwk-source-crowd"
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-ink-2">
                  Crowd reports · {crowdStats.count}{' '}
                  {crowdStats.count === 1 ? 'report' : 'reports'} · median{' '}
                  {formatShortVnd(crowdStats.median_vnd)}
                </span>
                <span className="font-bold text-ink shrink-0">
                  median {formatShortVnd(crowdStats.median_vnd)}
                </span>
              </div>
            )}
          </div>
        </section>

        <hr className="border-line my-3.5" />

        {/* SECTION 4: NEIGHBOURHOOD */}
        <section className="mb-4" data-testid="hwk-neighbourhood-section">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-2">
            {lang === 'en' ? 'NEIGHBOURHOOD' : 'KHU VỰC'}
          </h3>

          <div className="flex items-baseline justify-between gap-2 text-[14px]">
            <span className="text-ink-2 font-medium">{areaDisplay}</span>
            <span className="font-bold text-ink shrink-0">
              {areaCategoryLabel} {factorEffectText}
            </span>
          </div>

          <div className="text-[12.5px] text-ink-3 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              via <span translate="no">Google Maps</span>
            </span>
            {mapsSources.map((src, i) => (
              <a
                key={`${src.uri}-${i}`}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline inline-flex items-center gap-0.5"
              >
                <span>{src.title}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </section>

        {/* SECTION 5: HOW THE VERDICT WAS DECIDED */}
        <section className="mb-4" data-testid="hwk-decision-section">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-2">
            {lang === 'en'
              ? 'HOW THE VERDICT WAS DECIDED'
              : 'CÁCH QUYẾT ĐỊNH MỨC GIÁ'}
          </h3>

          <div
            data-testid="hwk-decision-mono"
            className="bg-surface-2 rounded-[16px] px-4 py-3 font-mono text-[13.5px] leading-relaxed text-ink tabular-nums"
          >
            {quoted && ref && ratio !== null ? (
              <>
                <div>
                  ratio = {formatShortVnd(quoted)} / {formatShortVnd(ref.high_vnd)} ={' '}
                  {ratio.toFixed(2)}
                </div>
                <div>{decisionRuleLine}</div>
              </>
            ) : (
              <div>{decisionRuleLine}</div>
            )}
          </div>
        </section>

        {/* FOOTER: Show raw JSON + sources summary */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            data-testid="hwk-raw-json-btn"
            onClick={() => setShowRawJson((v) => !v)}
            className="text-brand font-bold px-2 -ml-2"
          >
            {showRawJson
              ? lang === 'en'
                ? 'Hide raw JSON'
                : 'Ẩn JSON'
              : lang === 'en'
              ? 'Show raw JSON'
              : 'Xem JSON gốc'}
          </Button>

          <span
            data-testid="hwk-sources-summary"
            className="text-[13.5px] text-ink-2 font-medium tabular-nums"
          >
            {sourceCount} {sourceCount === 1 ? 'source' : 'sources'} ·{' '}
            {confidenceWord}
          </span>
        </div>

        {showRawJson && (
          <div
            data-testid="hwk-raw-json-view"
            className="mt-3 rounded-[16px] bg-surface-2 border border-line p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11.5px] font-semibold text-ink-2">
                EvaluatedItem + TraceStep[]
              </span>
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-line text-[12px] font-semibold text-ink hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="font-mono text-[11.5px] leading-snug text-ink overflow-x-auto overflow-y-auto max-h-56 select-all">
              {rawJsonPayload}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
