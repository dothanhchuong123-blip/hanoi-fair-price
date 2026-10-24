import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Play } from 'lucide-react';
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
  areaName?: string;
  locationAllowed?: boolean;
  onClose: () => void;
  onOpenSayIt: () => void;
  onOpenPaidPrompt: () => void;
  onOpenNearby?: () => void;
  onOpenHowWeKnow?: () => void;
}

export const VerdictSheet: React.FC<VerdictSheetProps> = ({
  lang,
  item,
  areaName,
  locationAllowed = false,
  onClose,
  onOpenPaidPrompt,
  onOpenNearby,
  onOpenHowWeKnow,
}) => {
  const [speaking, setSpeaking] = useState(false);
  const [viVoice, setViVoice] = useState<SpeechSynthesisVoice | null>(null);

  const ref = item.reference;
  const rawVerdict = item.judgment.verdict;
  const confidence = item.judgment.confidence;
  const isLowConfidence = confidence < 0.65 || rawVerdict === 'unknown';
  const displayVerdict = isLowConfidence ? 'unknown' : rawVerdict;

  const quoted = item.judgment.quoted_vnd;
  const pctHigh = item.judgment.pct_above_high;
  const resp = item.response;

  // Check if a vi-VN voice exists in speechSynthesis; hide play button if none exists
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setViVoice(null);
      return;
    }

    const updateVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices() || [];
        const match =
          voices.find((v) => v.lang?.toLowerCase() === 'vi-vn') ||
          voices.find((v) => v.lang?.toLowerCase().startsWith('vi')) ||
          null;
        setViVoice(match);
      } catch {
        setViVoice(null);
      }
    };

    updateVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', updateVoices);
    };
  }, []);

  const showNearbyOptions =
    Boolean(locationAllowed && onOpenNearby) &&
    (rawVerdict === 'slightly_high' || rawVerdict === 'overpriced');

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
    displayVerdict === 'overpriced'
      ? 'text-bad'
      : displayVerdict === 'slightly_high'
      ? 'text-warn'
      : displayVerdict === 'fair'
      ? 'text-fair'
      : 'text-ink';

  // Use area name from Part 6 when known; "the Old Quarter" for Hoàn Kiếm / Old Quarter
  const resolvedPlaceEn =
    areaName &&
    areaName.toLowerCase() !== 'hoàn kiếm' &&
    areaName.toLowerCase() !== 'old quarter'
      ? areaName
      : 'the Old Quarter';
  const resolvedPlaceVi =
    areaName &&
    areaName.toLowerCase() !== 'hoàn kiếm' &&
    areaName.toLowerCase() !== 'old quarter'
      ? areaName
      : 'Phố cổ';

  // One plain sentence matching Screenshot 06
  const plainExplanation = (() => {
    if (!quoted || !ref) {
      return lang === 'en' ? resp.explanation_en : resp.explanation_vi;
    }
    const qStr = formatShortVnd(quoted);
    if (
      (rawVerdict === 'overpriced' || rawVerdict === 'slightly_high') &&
      pctHigh !== null
    ) {
      return lang === 'en'
        ? `${qStr} is about ${pctHigh}% above what most places in ${resolvedPlaceEn} charge.`
        : `${qStr} cao hơn khoảng ${pctHigh}% so với mức phổ biến tại ${resolvedPlaceVi}.`;
    }
    if (rawVerdict === 'fair') {
      return lang === 'en'
        ? `${qStr} is right in line with what most places in ${resolvedPlaceEn} charge.`
        : `${qStr} nằm đúng mức giá phổ biến tại ${resolvedPlaceVi}.`;
    }
    return lang === 'en' ? resp.explanation_en : resp.explanation_vi;
  })();

  // One inset tip from the context factors
  const contextTip = (() => {
    const venueFactor = item.factors.find((f) => f.id === 'venue');
    const seasonFactor = item.factors.find(
      (f) => f.id === 'in_season' || f.id === 'off_season'
    );
    const tetFactor = item.factors.find((f) => f.id === 'tet');
    const areaFactor = item.factors.find((f) => f.id === 'area');

    if (tetFactor) {
      return lang === 'en'
        ? 'Many places add a 15–30% Tết holiday surcharge.'
        : 'Nhiều quán cộng thêm 15–30% phụ thu dịp Tết.';
    }
    if (seasonFactor?.id === 'off_season') {
      return lang === 'en'
        ? 'Out-of-season fruit often costs 20–30% more.'
        : 'Hoa quả trái mùa thường có giá cao hơn 20–30%.';
    }
    if (seasonFactor?.id === 'in_season') {
      return lang === 'en'
        ? 'In-season produce is plentiful and usually 10–15% cheaper.'
        : 'Hoa quả đang vào mùa nên dồi dào và thường rẻ hơn 10–15%.';
    }
    if (venueFactor) {
      return lang === 'en'
        ? `${venueFactor.label_en} spots often charge +${Math.round(
            venueFactor.effect * 100
          )}% more than street stalls.`
        : `${venueFactor.label_vi} thường cao hơn khoảng +${Math.round(
            venueFactor.effect * 100
          )}% so với vỉa hè.`;
    }
    if (areaFactor && areaFactor.effect < 0) {
      return lang === 'en'
        ? 'Local neighbourhoods outside the Old Quarter are usually ~12% cheaper.'
        : 'Các khu dân cư ngoài Phố cổ thường rẻ hơn khoảng 12%.';
    }
    return lang === 'en'
      ? 'Tourist streets often charge 10–20% more.'
      : 'Các tuyến phố đông khách du lịch thường cao hơn 10–20%.';
  })();

  const handlePlayPhrase = () => {
    if (!viVoice || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    setSpeaking(true);
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(resp.phrase_vi);
      utterance.lang = 'vi-VN';
      utterance.voice = viVoice;
      utterance.rate = 0.94;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setTimeout(() => setSpeaking(false), 2500);
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
      <div className="flex items-center gap-3 mb-4">
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

      {/* Header: thumbnail, name_vi, name_en, VerdictBadge */}
      <div className="flex items-start gap-3.5 mb-4">
        <div className="w-[58px] h-[58px] rounded-[16px] bg-surface-2 flex items-center justify-center text-[30px] shrink-0">
          {ref?.emoji || '🍜'}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[26px] leading-tight text-ink">
            {titleVi}
          </h2>
          <p className="text-[14px] text-ink-2 mt-0.5">{subtitleText}</p>
          <div className="mt-1.5">
            <VerdictBadge verdict={displayVerdict} lang={lang} />
          </div>
        </div>
      </div>

      {/* Quoted Price Row */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[14px] font-medium text-ink-2">
          {lang === 'en' ? 'Quoted price' : 'Giá được báo'}
        </span>
        <span
          className={`font-display text-[36px] leading-none tabular-nums ${quotedColorClass}`}
        >
          {quoted ? formatShortVnd(quoted) : '—'}
        </span>
      </div>

      {/* Full RangeBar with labels and median tick */}
      {ref && (
        <RangeBar
          low={ref.low_vnd}
          median={ref.median_vnd}
          high={ref.high_vnd}
          quoted={quoted}
          verdict={displayVerdict}
          size="full"
          lang={lang}
          className="mb-3"
        />
      )}

      {/* One Plain Sentence */}
      <p
        data-testid="verdict-plain-sentence"
        className="text-[15px] leading-relaxed text-ink mb-3.5"
      >
        {plainExplanation}
      </p>

      {/* "Say this, politely" card matching Screenshot 06 */}
      <div className="bg-surface rounded-[20px] p-4 border border-line shadow-2xs mb-3">
        <div className="mb-1.5">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
            {lang === 'en' ? 'SAY THIS, POLITELY' : 'NÓI LỊCH SỰ NHƯ SAU'}
          </span>
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

          {viVoice && (
            <IconButton
              variant="brand"
              data-testid="play-phrase-btn"
              onClick={handlePlayPhrase}
              aria-label="Play Vietnamese pronunciation"
              className={speaking ? 'ring-4 ring-brand/25 scale-105' : ''}
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </IconButton>
          )}
        </div>
      </div>

      {/* One inset tip from context factors */}
      <div
        data-testid="verdict-context-tip"
        className="bg-surface-2 rounded-[14px] px-4 py-3 text-[13.5px] text-ink-2 mb-3.5"
      >
        <div>{contextTip}</div>
      </div>

      {/* Confidence Row */}
      <div className="flex flex-col gap-1 mb-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-medium text-ink-2">
            {lang === 'en' ? 'Confidence' : 'Độ tin cậy'}
          </span>
          <ConfidenceMeter
            confidence={confidence}
            isSeedOnly={false}
            lang={lang}
          />
        </div>
        {isLowConfidence && (
          <p
            data-testid="low-confidence-note"
            className="text-[13px] font-medium text-unsure"
          >
            {lang === 'en'
              ? "We're not sure about this one"
              : 'Chúng tôi chưa chắc chắn về món này'}
          </p>
        )}
      </div>

      {/* Small "How we know ›" row opening Section 3 */}
      {onOpenHowWeKnow && (
        <button
          type="button"
          data-testid="verdict-how-we-know-btn"
          onClick={onOpenHowWeKnow}
          className="w-full py-2 mb-3 flex items-center justify-between text-[13.5px] font-semibold text-ink-2 hover:text-ink transition-colors cursor-pointer"
        >
          <span>{lang === 'en' ? 'How we know' : 'Cơ sở đối chiếu'}</span>
          <ChevronRight className="w-4 h-4 text-ink-2" />
        </button>
      )}

      {/* Footer: "I paid..." and conditional "Nearby options" */}
      <div className="mt-auto flex flex-col gap-2.5">
        <Button
          variant="primary"
          size="md"
          onClick={onOpenPaidPrompt}
          className="w-full"
        >
          {lang === 'en' ? 'I paid...' : 'Tôi đã trả...'}
        </Button>

        {showNearbyOptions && (
          <Button
            variant="secondary"
            size="md"
            data-testid="nearby-options-btn"
            onClick={onOpenNearby}
            className="w-full"
          >
            <MapPin className="w-4 h-4 text-ink" />
            <span>
              {lang === 'en' ? 'Nearby options' : 'Lựa chọn quanh đây'}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
};
