import React, { useState } from 'react';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';
import { EvaluatedItem, VerdictLabel } from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import { RangeBar, Sheet, VerdictBadge } from './ui';

interface ResultsSheetProps {
  lang: 'en' | 'vi';
  items: EvaluatedItem[];
  onSelectItem: (item: EvaluatedItem) => void;
  /** Place / area controls shown when toggled */
  contextBar?: React.ReactNode;
}

const VERDICT_SORT_ORDER: Record<VerdictLabel, number> = {
  overpriced: 0,
  slightly_high: 1,
  fair: 2,
  unknown: 3,
};

export const ResultsSheet: React.FC<ResultsSheetProps> = ({
  lang,
  items,
  onSelectItem,
  contextBar,
}) => {
  const [showAllItems, setShowAllItems] = useState(false);

  const counts = {
    overpriced: items.filter((i) => i.judgment.verdict === 'overpriced').length,
    slightly_high: items.filter((i) => i.judgment.verdict === 'slightly_high').length,
    fair: items.filter((i) => i.judgment.verdict === 'fair').length,
    unknown: items.filter((i) => i.judgment.verdict === 'unknown').length,
  };

  // Plain sentence headline matching Screenshot 05 ("2 prices look high here")
  const headline = (() => {
    if (counts.overpriced > 0) {
      return lang === 'en'
        ? `${counts.overpriced} ${counts.overpriced === 1 ? 'price looks' : 'prices look'} high here`
        : `Có ${counts.overpriced} mức giá cao hơn thường lệ`;
    }
    if (counts.slightly_high > 0) {
      return lang === 'en'
        ? `${counts.slightly_high} ${counts.slightly_high === 1 ? 'price looks' : 'prices look'} a bit high`
        : `Có ${counts.slightly_high} mức giá hơi cao`;
    }
    if (counts.fair > 0) {
      return lang === 'en'
        ? 'Prices look fair here'
        : 'Các mức giá tại đây khá hợp lý';
    }
    return lang === 'en' ? 'Checked prices' : 'Kết quả kiểm tra giá';
  })();

  const matchedItems = items
    .filter((i) => i.reference)
    .sort((a, b) => {
      const diff = VERDICT_SORT_ORDER[a.judgment.verdict] - VERDICT_SORT_ORDER[b.judgment.verdict];
      if (diff !== 0) return diff;
      return (b.judgment.pct_above_high ?? 0) - (a.judgment.pct_above_high ?? 0);
    });

  // Attention items: overpriced first, then slightly_high. If none exist, show all matched items.
  const highOnlyItems = matchedItems.filter((i) => i.judgment.verdict === 'overpriced');
  const attentionItems =
    highOnlyItems.length >= 2
      ? highOnlyItems
      : matchedItems.filter(
          (i) => i.judgment.verdict === 'overpriced' || i.judgment.verdict === 'slightly_high'
        );

  const visibleItems =
    showAllItems || attentionItems.length === 0 ? matchedItems : attentionItems;

  const hiddenCount = matchedItems.length - visibleItems.length;

  return (
    <Sheet data-testid="results-summary-sheet" className="pb-4">
      {/* Headline & Subline matching Screenshot 05 */}
      <h2 className="font-display text-[23px] leading-tight text-ink">
        {headline}
      </h2>
      <p className="text-[13.5px] text-ink-2 mt-0.5">
        {lang === 'en'
          ? `Vs. typical Old Quarter prices · ${items.length} ${items.length === 1 ? 'item' : 'items'} read`
          : `So với giá Phố cổ phổ biến · đã đọc ${items.length} món`}
      </p>

      {/* Verdict-count badges row */}
      <div className="flex items-center gap-1.5 mt-2.5 mb-2 overflow-x-auto no-scrollbar">
        {counts.overpriced > 0 && (
          <VerdictBadge
            verdict="overpriced"
            lang={lang}
            count={counts.overpriced}
            shortLabel
          />
        )}
        {counts.slightly_high > 0 && (
          <VerdictBadge
            verdict="slightly_high"
            lang={lang}
            count={counts.slightly_high}
            shortLabel
          />
        )}
        {counts.fair > 0 && (
          <VerdictBadge
            verdict="fair"
            lang={lang}
            count={counts.fair}
            shortLabel
          />
        )}
        {counts.unknown > 0 && (
          <VerdictBadge
            verdict="unknown"
            lang={lang}
            count={counts.unknown}
            shortLabel
          />
        )}
      </div>

      {contextBar}

      {/* Item List with mini RangeBar matching Screenshot 05 */}
      <div className="max-h-[min(220px,30vh)] overflow-y-auto overscroll-contain divide-y divide-line">
        {visibleItems.map((item) => {
          const ref = item.reference!;
          const verdict = item.judgment.verdict;
          const pctHigh = item.judgment.pct_above_high;
          const priceLabel = item.judgment.quoted_vnd
            ? formatShortVnd(item.judgment.quoted_vnd)
            : lang === 'en'
            ? 'Enter price'
            : 'Nhập giá';

          let deltaLabel = '';
          let deltaColorClass = 'text-ink-2';

          if (verdict === 'overpriced' && pctHigh !== null) {
            deltaLabel = lang === 'en' ? `+${pctHigh}% above` : `+${pctHigh}% cao hơn`;
            deltaColorClass = 'text-bad font-semibold';
          } else if (verdict === 'slightly_high' && pctHigh !== null) {
            deltaLabel = lang === 'en' ? `+${pctHigh}% above` : `+${pctHigh}% cao hơn`;
            deltaColorClass = 'text-warn font-semibold';
          } else if (verdict === 'fair') {
            deltaLabel = lang === 'en' ? 'Fair' : 'Hợp lý';
            deltaColorClass = 'text-fair font-semibold';
          } else {
            deltaLabel = lang === 'en' ? 'Tap to check' : 'Chạm để xem';
            deltaColorClass = 'text-unsure font-semibold';
          }

          return (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelectItem(item)}
              className="w-full py-2.5 flex items-center gap-3 text-left hover:bg-surface-2/50 rounded-[12px] px-1 transition-colors cursor-pointer"
            >
              {/* Food emoji thumbnail */}
              <div className="w-[42px] h-[42px] rounded-[12px] bg-surface-2 flex items-center justify-center text-[21px] shrink-0">
                {ref.emoji || '🍜'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-[16px] text-ink leading-snug truncate">
                    {item.perceived.name_vi}
                  </span>
                  <span className="font-bold text-[16.5px] text-ink tabular-nums shrink-0">
                    {priceLabel}
                  </span>
                </div>

                <RangeBar
                  low={ref.low_vnd}
                  median={ref.median_vnd}
                  high={ref.high_vnd}
                  quoted={item.judgment.quoted_vnd}
                  verdict={verdict}
                  size="mini"
                  className="my-0.5"
                />

                <div className="flex items-center justify-between gap-2 text-[12.5px] tabular-nums">
                  <span className="text-ink-2">
                    {lang === 'en' ? 'Usually' : 'Thường'}{' '}
                    {formatShortVnd(ref.low_vnd)}–{formatShortVnd(ref.high_vnd)}
                  </span>
                  <span className={deltaColorClass}>{deltaLabel}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* How we know / Expand all items bar matching Screenshot 05 */}
      <button
        type="button"
        onClick={() => {
          if (hiddenCount > 0 || showAllItems) {
            setShowAllItems((v) => !v);
          } else if (visibleItems[0]) {
            onSelectItem(visibleItems[0]);
          }
        }}
        className="w-full mt-2 bg-surface-2 hover:bg-surface-3 rounded-[14px] px-3.5 py-2 flex items-center justify-between text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-brand shrink-0" />
          <span className="font-bold text-[13px] text-ink">
            {lang === 'en' ? 'How we know' : 'Cơ sở đối chiếu'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[12.5px] text-ink-2">
          <span>
            {showAllItems
              ? lang === 'en'
                ? 'Show high prices only'
                : 'Chỉ hiện giá cao'
              : lang === 'en'
              ? '4 sources · high confidence'
              : '4 nguồn · độ tin cậy cao'}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-ink-2" />
        </div>
      </button>

      {/* Mandatory safety footer */}
      <p className="text-center text-[11.5px] text-ink-3 mt-2">
        {lang === 'en'
          ? 'Prices are estimates for guidance only.'
          : 'Giá chỉ mang tính tham khảo.'}
      </p>
    </Sheet>
  );
};
