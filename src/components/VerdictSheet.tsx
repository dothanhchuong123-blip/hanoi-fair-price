import React from 'react';
import { EvaluatedItem } from '../agent/types';
import { formatDotVnd, formatShortVnd, formatUsd } from '../lib/parsePrice';
import { getCrowdReports } from '../lib/storage';
import { VERDICT_STYLES } from './SamplePhotos';

interface VerdictSheetProps {
  lang: 'en' | 'vi';
  item: EvaluatedItem;
  onClose: () => void;
  onOpenSayIt: () => void;
  onOpenPaidPrompt: () => void;
}

export const VerdictSheet: React.FC<VerdictSheetProps> = ({
  lang,
  item,
  onClose,
  onOpenSayIt,
  onOpenPaidPrompt,
}) => {
  const ref = item.reference;
  const verdict = item.judgment.verdict;
  const style = VERDICT_STYLES[verdict];
  const quoted = item.judgment.quoted_vnd;

  const titleVi = item.perceived.name_vi;
  const comparedWithOther = ref && ref.name_vi.toLowerCase() !== item.perceived.name_vi.toLowerCase();
  const subtitleText = comparedWithOther
    ? lang === 'en'
      ? `Compared with ${ref.name_vi} · ${ref.description_en || ref.name_en}`
      : `So với ${ref.name_vi} · ${ref.description_vi || ref.name_vi}`
    : lang === 'en'
    ? ref?.description_en || `${item.perceived.name_en} · per ${item.normalized.normalized_unit}`
    : ref?.description_vi || `${item.perceived.name_vi} · mỗi ${item.normalized.normalized_unit}`;

  // One shared scale for the zone, the labels and the "You" marker, so they always line up.
  const minScale = ref ? Math.min(ref.low_vnd, quoted ?? ref.low_vnd) * 0.65 : 0;
  const maxScale = ref ? Math.max(ref.high_vnd * 1.85, (quoted ?? 0) * 1.12) : 1;
  const pos = (vnd: number) =>
    Math.max(4, Math.min(96, ((vnd - minScale) / (maxScale - minScale)) * 100));
  const markerLeftPct = quoted ? Math.max(8, Math.min(92, pos(quoted))) : 50;

  // Only reports actually saved on this device for this item; there is no shared backend yet.
  const crowdReports = ref ? getCrowdReports().filter((r) => r.item_id === ref.id) : [];

  // Highlight the percentage phrase in bold inside the explanation matching Screen 4
  const renderExplanation = () => {
    const text = lang === 'en' ? item.response.explanation_en : item.response.explanation_vi;
    const match = text.match(/(About \d+% above the top of the usual|khoảng \d+% so với mức cao)/i);
    if (!match) return text;
    const parts = text.split(match[0]);
    return (
      <>
        {parts[0]}
        <strong className="font-bold text-[#2A2118]">{match[0]}</strong>
        {parts.slice(1).join(match[0])}
      </>
    );
  };

  const rawDots = item.judgment.confidence >= 0.85 ? 3 : item.judgment.confidence >= 0.6 ? 2 : 1;
  // Seed estimates aren't field data, so they never earn full confidence on their own.
  const confidenceDots = ref?.source === 'seed_estimate' ? Math.min(rawDots, 2) : rawDots;

  return (
    <div
      data-testid="verdict-sheet"
      className="absolute bottom-0 left-0 right-0 max-h-[86%] overflow-y-auto overscroll-contain bg-[#F6EFE1] rounded-t-[28px] pt-3 pb-5 px-5 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] z-40 animate-sheet-up"
    >
      {/* Grab handle */}
      <div className="w-11 h-1.5 rounded-full bg-[#CFC4B0] mx-auto mb-2" />

      {/* Header row with Close button */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[28px] leading-[1.1] text-[#2A2118]">
            {titleVi}
          </h2>
          <p className="text-[14.5px] text-[#6B5E4E] mt-0.5">
            {subtitleText}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close verdict details"
          className="w-10 h-10 rounded-full bg-white border border-[#E4D9C5] flex items-center justify-center text-[#2A2118] shrink-0 shadow-xs cursor-pointer hover:bg-[#FAF5EB]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Quoted Price + USD + Verdict Pill */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mt-4">
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-display text-[32px] leading-none text-[#2A2118] tabular-nums">
            {formatDotVnd(quoted)}
          </span>
          <span className="text-[16px] text-[#6B5E4E] tabular-nums whitespace-nowrap">
            ≈ {formatUsd(quoted)}
          </span>
        </div>

        <span
          style={{ backgroundColor: style.pillBg, color: style.pillText }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[14px] font-bold whitespace-nowrap"
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: style.dot }} />
          <span>{lang === 'en' ? style.labelEn : style.labelVi}</span>
        </span>
      </div>

      {/* Horizontal Klarna-style Range Bar */}
      {ref && (
        <div className="mt-6 mb-3 relative pt-8">
          {/* "You: 120k" callout marker */}
          {quoted && (
            <div
              style={{ left: `${markerLeftPct}%` }}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center z-20 transition-all duration-300"
            >
              <div className="bg-[#2A2118] text-white text-[13px] font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                {lang === 'en' ? `You: ${formatShortVnd(quoted)}` : `Bạn: ${formatShortVnd(quoted)}`}
              </div>
              <div className="w-[2.5px] h-2.5 bg-[#2A2118]" />
              <div className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center -mt-0.5">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: style.dot }}
                />
              </div>
            </div>
          )}

          {/* Track */}
          <div className="w-full h-3.5 rounded-full bg-[#EFE4CE] relative overflow-hidden">
            {/* Green typical zone (14% to 50% width matching Screen 4) */}
            <div
              className="absolute top-0 bottom-0 bg-[#439E65] rounded-full"
              style={{ left: `${pos(ref.low_vnd)}%`, width: `${pos(ref.high_vnd) - pos(ref.low_vnd)}%` }}
            />
          </div>

          {/* Low / Typical / High labels */}
          <div className="relative h-9 mt-1.5 text-[12.5px] text-[#6B5E4E] font-medium leading-tight">
            <div className="absolute -translate-x-1/2 text-center" style={{ left: `${pos(ref.low_vnd)}%` }}>
              <div className="font-bold text-[#4A3F33]">{formatShortVnd(ref.low_vnd)}</div>
              <div>{lang === 'en' ? 'low' : 'thấp'}</div>
            </div>
            {/* The typical label only fits when it isn't crowding low or high */}
            {pos(ref.median_vnd) - pos(ref.low_vnd) > 15 && pos(ref.high_vnd) - pos(ref.median_vnd) > 15 && (
              <div className="absolute -translate-x-1/2 text-center" style={{ left: `${pos(ref.median_vnd)}%` }}>
                <div className="font-bold text-[#4A3F33]">{formatShortVnd(ref.median_vnd)}</div>
                <div>{lang === 'en' ? 'typical' : 'phổ biến'}</div>
              </div>
            )}
            <div className="absolute -translate-x-1/2 text-center" style={{ left: `${pos(ref.high_vnd)}%` }}>
              <div className="font-bold text-[#4A3F33]">{formatShortVnd(ref.high_vnd)}</div>
              <div>{lang === 'en' ? 'high' : 'cao'}</div>
            </div>
          </div>
        </div>
      )}

      {/* What moved the range: place type, area, season, Tết */}
      {item.factors.length > 0 && item.base_reference && (
        <div className="mt-1 mb-1">
          <div className="flex flex-wrap gap-1.5">
            {item.factors.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#E4D9C5] text-[12.5px] font-semibold text-[#4A3F33]"
              >
                <span>{f.emoji}</span>
                <span>{lang === 'en' ? f.label_en : f.label_vi}</span>
                <span className={`tabular-nums ${f.effect > 0 ? 'text-[#9E5F10]' : 'text-[#286E40]'}`}>
                  {f.effect > 0 ? '+' : '−'}
                  {Math.abs(Math.round(f.effect * 100))}%
                </span>
              </span>
            ))}
          </div>
          <p className="text-[12.5px] text-[#6B5E4E] mt-1.5">
            {lang === 'en'
              ? `Street-stall range ${formatShortVnd(item.base_reference.low_vnd)}–${formatShortVnd(item.base_reference.high_vnd)}, adjusted for the above.`
              : `Giá vỉa hè ${formatShortVnd(item.base_reference.low_vnd)}–${formatShortVnd(item.base_reference.high_vnd)}, đã điều chỉnh theo các yếu tố trên.`}
          </p>
        </div>
      )}

      {/* Explanation line */}
      <p className="text-[15.5px] leading-[1.45] text-[#2A2118] mt-2">
        {renderExplanation()}
      </p>

      {/* "Why we think so" card (Expandable) */}
      <div className="bg-[#FCF9F2] rounded-[20px] p-4 mt-4 border border-[#EBE1CE]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-bold text-[15px] text-[#2A2118]">
            {lang === 'en' ? 'Why we think so' : 'Cơ sở tham khảo'}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[14px] text-[#2A2118]">
              {lang === 'en' ? 'Confidence' : 'Độ tin cậy'}
            </span>
            <div className="flex items-center gap-1" aria-label={`Confidence ${confidenceDots} of 3`}>
              {[0, 1, 2].map((dotIdx) => (
                <span
                  key={dotIdx}
                  className={`w-2.5 h-2.5 rounded-full ${
                    dotIdx < confidenceDots ? 'bg-[#E3A82B]' : 'bg-[#E5DEC9]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 text-[14px] text-[#6B5E4E]">
          {ref ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>📚</span>
                <span>{lang === 'en' ? 'Seed estimate (not field data)' : 'Giá ước tính ban đầu'}</span>
              </span>
              <span className="text-[#4A3F33] font-medium">{ref.updated}</span>
            </div>
          ) : (
            <div>{lang === 'en' ? 'No reference price for this item yet.' : 'Chưa có giá tham khảo cho món này.'}</div>
          )}

          {crowdReports.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>👥</span>
                <span>{lang === 'en' ? 'Your reports' : 'Báo giá của bạn'}</span>
              </span>
              <span className="text-[#4A3F33] font-medium">
                {lang === 'en'
                  ? `${crowdReports.length} on this phone`
                  : `${crowdReports.length} trên máy này`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action: Say it in Vietnamese */}
      <button
        type="button"
        onClick={onOpenSayIt}
        className="btn-mustard w-full h-[56px] rounded-[18px] font-bold text-[18px] flex items-center justify-center gap-2 mt-4 cursor-pointer"
      >
        <span>🗣️</span>
        <span>{lang === 'en' ? 'Say it in Vietnamese' : 'Nói bằng tiếng Việt'}</span>
      </button>

      {/* Secondary Action: I paid... (help others) */}
      <button
        type="button"
        onClick={onOpenPaidPrompt}
        className="btn-paper w-full h-[52px] rounded-[18px] font-bold text-[16.5px] flex items-center justify-center mt-3 cursor-pointer"
      >
        {lang === 'en' ? 'I paid... (help others)' : 'Tôi đã trả... (giúp mọi người)'}
      </button>

      {/* Mandatory safety footer */}
      <p className="text-center text-[12px] leading-snug text-[#6B5E4E] mt-3 px-2">
        {lang === 'en'
          ? 'Prices vary by place, quality and season. Estimates for guidance only.'
          : 'Giá thay đổi tùy quán, chất lượng và mùa vụ. Giá chỉ mang tính tham khảo.'}
      </p>
    </div>
  );
};
