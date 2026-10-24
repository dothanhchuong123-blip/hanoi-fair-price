import React, { useState } from 'react';
import { ChevronLeft, MapPin, Play } from 'lucide-react';
import { EvaluatedItem } from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import {
  Button,
  ConfidenceMeter,
  IconButton,
  RangeBar,
  VerdictBadge,
} from './ui';

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
  const [speaking, setSpeaking] = useState(false);
  const ref = item.reference;
  const verdict = item.judgment.verdict;
  const quoted = item.judgment.quoted_vnd;
  const pctHigh = item.judgment.pct_above_high;
  const resp = item.response;

  const titleVi = item.perceived.name_vi;
  const comparedWithOther =
    ref && ref.name_vi.toLowerCase() !== item.perceived.name_vi.toLowerCase();
  const subtitleText = comparedWithOther
    ? lang === 'en'
      ? `Compared with ${ref.name_vi} · ${ref.name_en}`
      : `So với ${ref.name_vi}`
    : lang === 'en'
    ? item.perceived.name_en || ref?.name_en || ''
    : ref?.description_vi || item.perceived.name_vi;

  const quotedColorClass =
    verdict === 'overpriced'
      ? 'text-bad'
      : verdict === 'slightly_high'
      ? 'text-warn'
      : verdict === 'fair'
      ? 'text-fair'
      : 'text-ink';

  // Plain, natural explanation matching Screenshot 06
  const plainExplanation = (() => {
    if (!quoted || !ref) {
      return lang === 'en' ? resp.explanation_en : resp.explanation_vi;
    }
    const qStr = formatShortVnd(quoted);
    if ((verdict === 'overpriced' || verdict === 'slightly_high') && pctHigh !== null) {
      return lang === 'en'
        ? `${qStr} is about ${pctHigh}% above what most places in the Old Quarter charge.`
        : `${qStr} cao hơn khoảng ${pctHigh}% so với mức phổ biến tại Phố cổ.`;
    }
    return lang === 'en' ? resp.explanation_en : resp.explanation_vi;
  })();

  const handlePlayPhrase = () => {
    setSpeaking(true);
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(resp.phrase_vi);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.94;
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find((v) => v.lang.toLowerCase().includes('vi'));
        if (viVoice) utterance.voice = viVoice;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
        setTimeout(() => setSpeaking(false), 2500);
      } else {
        setTimeout(() => setSpeaking(false), 1000);
      }
    } catch {
      setTimeout(() => setSpeaking(false), 1000);
    }
  };

  return (
    <div
      data-testid="verdict-sheet"
      className="absolute inset-0 bg-bg text-ink overflow-y-auto overscroll-contain px-5 pt-4 pb-6 flex flex-col z-40 animate-sheet-up"
    >
      {/* Top Bar matching Screenshot 06 */}
      <div className="flex items-center gap-3 mb-5">
        <IconButton
          variant="default"
          onClick={onClose}
          aria-label="Close verdict details"
        >
          <ChevronLeft className="w-5 h-5 text-ink" />
        </IconButton>
        <span className="font-bold text-[17px] text-ink">
          {lang === 'en' ? 'Item detail' : 'Chi tiết món'}
        </span>
      </div>

      {/* Item Header: Emoji Box + Name + Subtitle + VerdictBadge */}
      <div className="flex items-start gap-3.5 mb-5">
        <div className="w-[58px] h-[58px] rounded-[16px] bg-surface-2 flex items-center justify-center text-[30px] shrink-0">
          {ref?.emoji || '🍜'}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[26px] leading-tight text-ink">
            {titleVi}
          </h2>
          <p className="text-[14px] text-ink-2 mt-0.5">{subtitleText}</p>
          <div className="mt-1.5">
            <VerdictBadge verdict={verdict} lang={lang} />
          </div>
        </div>
      </div>

      {/* Quoted Price Row */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[14px] font-medium text-ink-2">
          {lang === 'en' ? 'Quoted price' : 'Giá được báo'}
        </span>
        <span className={`font-display text-[36px] leading-none tabular-nums ${quotedColorClass}`}>
          {quoted ? formatShortVnd(quoted) : '—'}
        </span>
      </div>

      {/* Full RangeBar */}
      {ref && (
        <RangeBar
          low={ref.low_vnd}
          median={ref.median_vnd}
          high={ref.high_vnd}
          quoted={quoted}
          verdict={verdict}
          size="full"
          lang={lang}
          className="mb-3"
        />
      )}

      {/* Plain Explanation Sentence */}
      <p className="text-[15px] leading-relaxed text-ink mb-4">
        {plainExplanation}
      </p>

      {/* Polite Vietnamese Phrase Card matching Screenshot 06 */}
      <div className="bg-surface rounded-[20px] p-4 border border-line shadow-2xs mb-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
            {lang === 'en' ? 'SAY THIS, POLITELY' : 'NÓI LỊCH SỰ NHƯ SAU'}
          </span>
          <button
            type="button"
            onClick={onOpenSayIt}
            className="text-[12.5px] font-semibold text-brand hover:underline cursor-pointer"
          >
            {lang === 'en' ? 'Say it ›' : 'Mở thẻ nói ›'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[18px] leading-snug text-ink">
              {resp.phrase_vi}
            </div>
            <div className="text-[14px] text-ink-2 leading-snug mt-1">
              {resp.phrase_en}
            </div>
            <div className="text-[13px] text-ink-3 mt-1">
              {resp.pronunciation}
            </div>
          </div>

          <IconButton
            variant="brand"
            onClick={handlePlayPhrase}
            aria-label="Play Vietnamese pronunciation"
            className={speaking ? 'ring-4 ring-brand/25 scale-105' : ''}
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </IconButton>
        </div>
      </div>

      {/* Context Note Bar matching Screenshot 06 */}
      <div className="bg-surface-2 rounded-[14px] px-4 py-3 text-[13.5px] text-ink-2 mb-4">
        {lang === 'en'
          ? 'Tourist streets often charge 10–20% more.'
          : 'Các tuyến phố đông khách du lịch thường cao hơn 10–20%.'}
      </div>

      {/* Confidence Row */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-[14px] font-medium text-ink-2">
          {lang === 'en' ? 'Confidence' : 'Độ tin cậy'}
        </span>
        <ConfidenceMeter
          confidence={item.judgment.confidence}
          isSeedOnly={false}
          lang={lang}
        />
      </div>

      {/* Action Buttons matching Screenshot 06 */}
      <div className="mt-auto flex flex-col gap-2.5">
        <Button
          variant="primary"
          size="md"
          onClick={onOpenPaidPrompt}
          className="w-full"
        >
          {lang === 'en' ? 'I paid...' : 'Tôi đã trả...'}
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={onOpenSayIt}
          className="w-full"
        >
          <MapPin className="w-4 h-4 text-ink" />
          <span>{lang === 'en' ? 'Nearby options' : 'Lựa chọn quanh đây'}</span>
        </Button>
      </div>
    </div>
  );
};
