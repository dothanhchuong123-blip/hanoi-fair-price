import React from 'react';
import { EvaluatedItem, VerdictLabel } from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import { VERDICT_STYLES } from './SamplePhotos';

interface ResultsSheetProps {
  lang: 'en' | 'vi';
  items: EvaluatedItem[];
  onSelectItem: (item: EvaluatedItem) => void;
  /** Place / area controls shown above the list */
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
  const [showUnmatched, setShowUnmatched] = React.useState(false);
  const counts = {
    overpriced: items.filter((i) => i.judgment.verdict === 'overpriced').length,
    slightly_high: items.filter((i) => i.judgment.verdict === 'slightly_high').length,
    fair: items.filter((i) => i.judgment.verdict === 'fair').length,
    unknown: items.filter((i) => i.judgment.verdict === 'unknown').length,
  };

  // Items we can't compare (not in the catalog, toppings) go in their own group so the list stays useful
  const unmatched = items.filter((i) => !i.reference);
  // Sort items: above typical first, then a bit high, then fair
  const sortedItems = items.filter((i) => i.reference).sort((a, b) => {
    const diff = VERDICT_SORT_ORDER[a.judgment.verdict] - VERDICT_SORT_ORDER[b.judgment.verdict];
    if (diff !== 0) return diff;
    return (b.judgment.pct_above_high ?? 0) - (a.judgment.pct_above_high ?? 0);
  });

  return (
    <div
      data-testid="results-summary-sheet"
      className="w-full bg-[#F6EFE1] rounded-t-[28px] pt-3 pb-4 px-5 shadow-[0_-10px_35px_rgba(0,0,0,0.35)] z-30 animate-sheet-up"
    >
      {/* Grab handle */}
      <div className="w-11 h-1.5 rounded-full bg-[#CFC4B0] mx-auto mb-3.5" />

      {/* Summary Count Pills matching Screen 3 */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {counts.overpriced > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F8E2DF] text-[#B83227] text-[12.5px] font-bold whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#D9483B] shrink-0" />
            <span>
              {counts.overpriced} {lang === 'en' ? 'above typical' : 'cao hơn thường lệ'}
            </span>
          </div>
        )}
        {counts.slightly_high > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F9EBCD] text-[#9E5F10] text-[12.5px] font-bold whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#C97A16] shrink-0" />
            <span>
              {counts.slightly_high} {lang === 'en' ? 'a bit high' : 'hơi cao'}
            </span>
          </div>
        )}
        {counts.fair > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCEEE2] text-[#286E40] text-[12.5px] font-bold whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#3E9B5F] shrink-0" />
            <span>
              {counts.fair} {lang === 'en' ? 'fair' : 'hợp lý'}
            </span>
          </div>
        )}
        {counts.unknown - unmatched.length > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6E0D5] text-[#5C5346] text-[12.5px] font-bold whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#8A8174] shrink-0" />
            <span>
              {counts.unknown - unmatched.length} {lang === 'en' ? 'not sure' : 'chưa rõ'}
            </span>
          </div>
        )}
      </div>

      {contextBar}

      {/* Scrollable Compact Item List */}
      <div className="max-h-[min(240px,32vh)] overflow-y-auto overscroll-contain divide-y divide-[#E4D9C5] -mx-1">
        {sortedItems.map((item) => {
          const style = VERDICT_STYLES[item.judgment.verdict];
          const pctHigh = item.judgment.pct_above_high;
          const priceLabel = item.judgment.quoted_vnd
            ? formatShortVnd(item.judgment.quoted_vnd)
            : lang === 'en'
            ? 'Enter price'
            : 'Nhập giá';

          let deltaLabel = '';
          let deltaColor = '#6B5E4E';

          if (item.judgment.verdict === 'overpriced' && pctHigh !== null) {
            deltaLabel =
              lang === 'en' ? `+${pctHigh}% above high` : `+${pctHigh}% trên mức cao`;
            deltaColor = '#D9483B';
          } else if (item.judgment.verdict === 'slightly_high' && pctHigh !== null) {
            deltaLabel =
              lang === 'en' ? `+${pctHigh}% above high` : `+${pctHigh}% trên mức cao`;
            deltaColor = '#C97A16';
          } else if (item.judgment.verdict === 'fair') {
            deltaLabel = lang === 'en' ? 'Within typical range' : 'Trong mức phổ biến';
            deltaColor = '#3E9B5F';
          } else {
            deltaLabel = lang === 'en' ? 'Tap to check' : 'Chạm để xem';
            deltaColor = '#8A8174';
          }

          return (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelectItem(item)}
              className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[#EFE4CE]/45 rounded-lg px-1 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: style.dot }}
                />
                <div className="truncate">
                  {/* What the menu says, then which typical price it was compared with */}
                  <div className="font-bold text-[16.5px] text-[#2A2118] leading-snug truncate">
                    {item.perceived.name_vi}
                  </div>
                  <div className="text-[13.5px] text-[#6B5E4E] leading-tight truncate">
                    {item.reference && item.reference.name_vi.toLowerCase() !== item.perceived.name_vi.toLowerCase()
                      ? lang === 'en'
                        ? `Compared with ${item.reference.name_vi}`
                        : `So với ${item.reference.name_vi}`
                      : item.perceived.name_en || item.reference?.name_en}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 ml-3">
                <div className="font-bold text-[17px] text-[#2A2118] tabular-nums">
                  {priceLabel}
                </div>
                <div
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: deltaColor }}
                >
                  {deltaLabel}
                </div>
              </div>
            </button>
          );
        })}

        {unmatched.length > 0 && (
          <div className="py-2 px-1">
            <button
              type="button"
              onClick={() => setShowUnmatched((v) => !v)}
              aria-expanded={showUnmatched}
              className="w-full flex items-center justify-between text-[13.5px] font-semibold text-[#6B5E4E] py-1 cursor-pointer"
            >
              <span>
                {lang === 'en'
                  ? `${unmatched.length} not in our price list yet`
                  : `${unmatched.length} món chưa có trong bảng giá`}
              </span>
              <span className={`transition-transform duration-200 ${showUnmatched ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {showUnmatched && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {unmatched.map((item) => (
                  <span
                    key={item.index}
                    className="px-2.5 py-1 rounded-full bg-[#EFE4CE] text-[12.5px] text-[#4A3F33] tabular-nums"
                  >
                    {item.perceived.is_addon ? '+ ' : ''}
                    {item.perceived.name_vi}
                    {item.judgment.quoted_vnd ? ` · ${formatShortVnd(item.judgment.quoted_vnd)}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mandatory safety footer */}
      <p className="text-center text-[12.5px] text-[#6B5E4E] mt-2.5 pt-1">
        {lang === 'en'
          ? 'Prices are estimates for guidance only.'
          : 'Giá chỉ mang tính tham khảo.'}
      </p>
    </div>
  );
};
